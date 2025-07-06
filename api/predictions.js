const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

// Путь к корню проекта (один уровень вверх от server.js)
const rootDir = path.join(__dirname, '..');

// Явно отдаем welcome.html при запросе корня
app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'welcome.html'), err => {
        if (err) {
            console.error('Ошибка при отправке welcome.html:', err);
            res.status(500).send('Ошибка сервера');
        }
    });
});

// Статические файлы (index.html, admin.html, .css, .js и т.п.)
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

// Баланс
app.post('/balance', async (req, res) => {
    const { userId, action, amount } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }
    try {
        const usersCollection = db.collection('users');
        if (action === 'update') {
            if (!amount || isNaN(amount)) {
                return res.status(400).json({ error: 'Invalid amount' });
            }
            const user = await usersCollection.findOneAndUpdate(
                { chatId: userId },
                { $inc: { coins: amount }, $setOnInsert: { chatId: userId, coins: 0 } },
                { upsert: true, returnDocument: 'after' }
            );
            res.json({ coins: user.value.coins });
        } else {
            const user = await usersCollection.findOne({ chatId: userId }) || { coins: 0 };
            res.json({ coins: user.coins });
        }
    } catch (error) {
        console.error('Ошибка получения/обновления баланса:', error);
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

// Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// Корректное завершение
process.on('SIGTERM', () => {
    client.close();
    process.exit(0);
});
