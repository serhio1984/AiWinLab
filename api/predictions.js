const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

// Корневая папка проекта (где лежат welcome.html, index.html, admin.html и т.п.)
const rootDir = path.join(__dirname, '..');
console.log('Root directory set to:', rootDir); // Отладочный лог

// Переменная окружения для пароля админа
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 1. Корневой маршрут — всегда отдаём welcome.html
app.get('/', (req, res) => {
    console.log('Root request received with query:', req.query); // Отладочный лог
    const welcomePath = path.join(rootDir, 'welcome.html');
    console.log('Attempting to serve:', welcomePath); // Отладочный лог
    res.sendFile(welcomePath, err => {
        if (err) {
            console.error('Ошибка при отправке welcome.html:', err);
            res.status(500).send('Ошибка сервера: ' + err.message);
        }
    });
});

// 2. Статика — всё остальное с приоритетом на welcome.html
app.use(express.static(
  path.join(__dirname, '../'),
  { index: 'welcome.html' }
));

// Подключение к MongoDB
const uri = process.env.MONGODB_URI
    || "mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true";
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

// Повторное подключение при разрыве
client.on('disconnected', () => {
    console.log('MongoDB disconnected, attempting to reconnect...');
    connectDB().catch(console.error);
});

// Старт сервера только после подключения к БД
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

// 3. Проверка пароля для админ-панели
app.post('/api/check-password', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not available' });
    }
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Неверный пароль' });
    }
});

// 4. Баланс пользователя (Telegram Stars → монеты)
app.post('/balance', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const { userId, action, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const users = db.collection('users');

        if (action === 'update') {
            if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });
            const result = await users.findOneAndUpdate(
                { chatId: userId },
                {
                    $inc: { coins: amount },
                    $setOnInsert: { chatId: userId, coins: 0 }
                },
                { upsert: true, returnDocument: 'after' }
            );
            return res.json({ coins: result.value.coins });
        }

        // action === 'get' или не указан — проверка или первый вход
        let user = await users.findOne({ chatId: userId });

        if (!user) {
            // Первый визит — создаём пользователя с 5 монетами
            await users.insertOne({ chatId: userId, coins: 5 });
            user = { coins: 5 };
        }

        return res.json({ coins: user.coins });

    } catch (e) {
        console.error('❌ Balance error:', e);
        return res.status(500).json({ error: 'Server error' });
    }
});


// 5. Получение прогнозов
app.get('/api/predictions', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const preds = await db.collection('predictions').find().toArray();
        console.log('Fetched predictions:', preds);
        res.json(preds);
    } catch (e) {
        console.error('❌ Predictions fetch error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// 6. Сохранение прогнозов
app.post('/api/predictions', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const predictions = req.body;
        if (!Array.isArray(predictions)) {
            return res.status(400).json({ success: false, message: 'Данные должны быть массивом' });
        }
        const coll = db.collection('predictions');
        await coll.deleteMany({});
        await coll.insertMany(predictions);
        res.json({ success: true, message: 'Прогнозы успешно сохранены' });
    } catch (e) {
        console.error('❌ Predictions save error:', e);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Корректное завершение
process.on('SIGTERM', () => {
    client.close();
    process.exit(0);
});