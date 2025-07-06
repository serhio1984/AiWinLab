const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

// Обслуживание статики — ПРИОРИТЕТ у маршрутов ниже
app.use(express.static(path.join(__dirname, '../'), {
    extensions: ['html']
}));

// Явно отдаем welcome.html по корню
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../welcome.html'), err => {
        if (err) {
            console.error('Error sending welcome.html:', err);
            res.status(500).send('Internal Server Error');
        }
    });
});

// MongoDB
const uri = process.env.MONGODB_URI || "mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true";
const client = new MongoClient(uri);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("predictionsDB");
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
    }
}
connectDB();

// Баланс: получить или обновить
app.post('/balance', async (req, res) => {
    const { userId, action, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const usersCollection = db.collection('users');

        if (action === 'update') {
            if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

            const user = await usersCollection.findOneAndUpdate(
                { chatId: userId },
                {
                    $inc: { coins: amount },
                    $setOnInsert: { chatId: userId, coins: 0 }
                },
                { upsert: true, returnDocument: 'after' }
            );

            res.json({ coins: user.value.coins });
        } else {
            const user = await usersCollection.findOne({ chatId: userId }) || { coins: 0 };
            res.json({ coins: user.coins });
        }
    } catch (error) {
        console.error('❌ Balance error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Получить прогнозы
app.get('/api/predictions', async (req, res) => {
    try {
        const predictionsCollection = db.collection('predictions');
        const predictions = await predictionsCollection.find().toArray();
        res.json(predictions);
    } catch (error) {
        console.error('❌ Predictions fetch error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// Закрытие клиента при завершении процесса
process.on('SIGTERM', () => {
    client.close();
    process.exit(0);
});
