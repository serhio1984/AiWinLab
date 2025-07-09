const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

// Корневая папка проекта
const rootDir = path.join(__dirname, '..');
console.log('Root directory set to:', rootDir);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 1. Корневой маршрут
app.get('/', (req, res) => {
    console.log('Root request received with query:', req.query);
    const welcomePath = path.join(rootDir, 'welcome.html');
    console.log('Attempting to serve:', welcomePath);
    res.sendFile(welcomePath, err => {
        if (err) {
            console.error('Ошибка при отправке welcome.html:', err);
            res.status(500).send('Ошибка сервера: ' + err.message);
        }
    });
});

// 3. Проверка пароля
app.post('/api/check-password', (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Неверный пароль' });
    }
});

// 4. Баланс пользователя
app.post('/balance', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });
    const { userId, action, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const users = db.collection('users');

        if (action === 'update') {
            const numericAmount = Number(amount);
            if (isNaN(numericAmount)) return res.status(400).json({ error: 'Invalid amount' });

            console.log(`Updating balance for userId: ${userId}, action: ${action}, amount: ${numericAmount}`);
            const result = await users.findOneAndUpdate(
                { chatId: userId },
                { $inc: { coins: numericAmount }, $setOnInsert: { chatId: userId } },
                { upsert: true, returnDocument: 'after' }
            );
            if (!result.value) {
                console.error(`User not found or update failed for userId: ${userId}`);
                return res.status(404).json({ error: 'User not found' });
            }
            console.log(`Balance updated successfully: ${result.value.coins}`);
            res.json({ coins: result.value.coins });
        } else {
            let user = await users.findOne({ chatId: userId });
            if (!user) {
                console.log(`Creating new user with userId: ${userId}, initial coins: 5`);
                await users.insertOne({ chatId: userId, coins: 5 });
                user = { coins: 5 };
            }
            res.json({ coins: user.coins });
        }
    } catch (e) {
        console.error('❌ Balance error:', e.stack);
        res.status(500).json({ error: 'Server error', details: e.message });
    }
});

// 5. Получение списка прогнозов
app.get('/api/predictions', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });
    try {
        const predictions = await db.collection('predictions').find().toArray();
        console.log('Predictions fetched:', predictions);
        res.json(predictions);
    } catch (e) {
        console.error('❌ Predictions fetch error:', e.stack);
        res.status(500).json({ error: 'Server error', details: e.message });
    }
});

// 6. Сохранение прогнозов
app.post('/api/predictions', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });
    try {
        const predictions = req.body;
        if (!Array.isArray(predictions)) return res.status(400).json({ success: false, message: 'Данные должны быть массивом' });
        const coll = db.collection('predictions');
        await coll.deleteMany({});
        await coll.insertMany(predictions);
        res.json({ success: true, message: 'Прогнозы успешно сохранены' });
    } catch (e) {
        console.error('❌ Predictions save error:', e);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// 2. Статика (после всех маршрутов)
app.use(express.static(path.join(__dirname, '../'), { index: 'welcome.html' }));

// Подключение к MongoDB
const uri = process.env.MONGODB_URI || "mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true";
const client = new MongoClient(uri);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("predictionsDB");
        console.log("✅ Connected to MongoDB");
    } catch (e) {
        console.error("❌ MongoDB connection error:", e);
    }
}

client.on('disconnected', () => {
    console.log('MongoDB disconnected, attempting to reconnect...');
    connectDB().catch(console.error);
});

(async () => {
    try {
        await connectDB();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (e) {
        console.error('Failed to start server:', e);
        process.exit(1);
    }
})();

process.on('SIGTERM', () => {
    client.close();
    process.exit(0);
});