const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

const rootDir = path.join(__dirname, '..');

// Явно отдаем welcome.html при переходе на "/"
app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'welcome.html'), err => {
        if (err) {
            console.error('Ошибка при отправке welcome.html:', err);
            res.status(500).send('Ошибка сервера');
        }
    });
});

// Обслуживание всех остальных файлов (index.html, js, css, admin.html и т.д.)
app.use(express.static(rootDir));

// Подключение к MongoDB
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

// Авторизация для admin
app.post('/api/check-password', (req, res) => {
    const { password } = req.body;
    const adminPassword = 'admin123';
    if (password === adminPassword) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Неверный пароль' });
    }
});

// Баланс
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

// Прогнозы
app.get('/api/predictions', async (req, res) => {
    try {
        const predictionsCollection = db.collection('predictions');
        const predictions = await predictionsCollection.find().toArray();
        res.json(predictions);
    } catch (error) {
        console.error('❌ Predictions error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/predictions', async (req, res) => {
    try {
        const predictions = req.body;
        if (!Array.isArray(predictions)) {
            return res.status(400).json({ success: false, message: 'Данные должны быть массивом' });
        }

        const predictionsCollection = db.collection('predictions');
        await predictionsCollection.deleteMany({});
        await predictionsCollection.insertMany(predictions);

        res.json({ success: true, message: 'Прогнозы успешно сохранены' });
    } catch (error) {
        console.error('❌ Predictions save error:', error);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Старт сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// Закрытие при SIGTERM
process.on('SIGTERM', () => {
    client.close();
    process.exit(0);
});
