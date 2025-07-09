const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

const rootDir = path.join(__dirname, '..');
console.log('Root directory set to:', rootDir);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 1. Корневая страница — welcome.html
app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'welcome.html'), err => {
        if (err) {
            console.error('Ошибка при отправке welcome.html:', err);
            res.status(500).send('Ошибка сервера: ' + err.message);
        }
    });
});

// 2. Статические файлы
app.use(express.static(
    path.join(__dirname, '../'),
    { index: 'welcome.html' }
));

// 3. Подключение к MongoDB
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

// 4. Проверка пароля для админ-панели
app.post('/api/check-password', (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });
    const { password } = req.body;
    res.json({
        success: password === ADMIN_PASSWORD,
        message: password === ADMIN_PASSWORD ? undefined : 'Неверный пароль'
    });
});

// 5. Баланс пользователя
app.post('/balance', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const { userId, action, amount } = req.body;
    console.log('📥 Received balance request:', { userId, action, amount });
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const users = db.collection('users');

        if (action === 'update') {
            if (typeof amount !== 'number' || isNaN(amount)) {
                return res.status(400).json({ error: 'Invalid amount' });
            }

            const result = await users.findOneAndUpdate(
                { chatId: userId },
                { $inc: { coins: amount }, $setOnInsert: { chatId: userId } },
                { upsert: true, returnDocument: 'after', returnOriginal: false }
            );

            if (!result?.value) {
                console.warn(`⚠️ Update failed. Manual fallback for userId: ${userId}`);
                const user = await users.findOne({ chatId: userId });
                return res.json({ coins: user?.coins ?? 0 });
            }

            return res.json({ coins: result.value.coins });
        }

        // action === 'get'
        let user = await users.findOne({ chatId: userId });
        if (!user) {
            console.log(`👤 Новый пользователь ${userId}, выдаём 5 монет`);
            await users.insertOne({ chatId: userId, coins: 5 });
            user = { coins: 5 };
        }

        return res.json({ coins: user.coins });

    } catch (e) {
        console.error('❌ Balance error:', e.stack);
        return res.status(500).json({ error: 'Server error' });
    }
});

// 6. Получение прогнозов + индивидуальные разблокировки
app.post('/api/predictions', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });

    try {
        const predictions = await db.collection('predictions').find().toArray();
        const { userId } = req.body;

        if (!userId) {
            return res.json(predictions.map(p => ({ ...p, isUnlocked: false })));
        }

        const unlocks = await db.collection('unlocks').findOne({ chatId: userId });
        const unlockedIds = unlocks?.predictionIds || [];

        const personalized = predictions.map(p => ({
            ...p,
            isUnlocked: unlockedIds.includes(p.id)
        }));

        return res.json(personalized);
    } catch (e) {
        console.error('❌ Predictions fetch error:', e);
        return res.status(500).json({ error: 'Server error' });
    }
});

// 7. Сохранение прогнозов
app.post('/api/save-predictions', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });

    try {
        let predictions = req.body;

        if (!Array.isArray(predictions)) {
            return res.status(400).json({ success: false, message: 'Данные должны быть массивом' });
        }

        predictions = predictions
            .map(p => {
                if (!p || typeof p !== 'object') return null;
                const { isUnlocked, ...cleaned } = p;
                return cleaned;
            })
            .filter(Boolean);

        const coll = db.collection('predictions');
        await coll.deleteMany({});
        if (predictions.length > 0) {
            await coll.insertMany(predictions);
        }

        return res.json({ success: true, message: 'Прогнозы сохранены' });

    } catch (e) {
        console.error('❌ Predictions save error:', e);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// 8. Разблокировка прогноза пользователем
app.post('/api/unlock', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const { userId, predictionId } = req.body;
    if (!userId || !predictionId) {
        return res.status(400).json({ success: false, message: 'userId и predictionId обязательны' });
    }

    try {
        const unlocks = db.collection('unlocks');
        const result = await unlocks.updateOne(
            { chatId: userId },
            { $addToSet: { predictionIds: predictionId }, $setOnInsert: { chatId: userId } },
            { upsert: true }
        );

        return res.json({ success: true });
    } catch (e) {
        console.error('❌ Unlock error:', e);
        return res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Завершение процесса
process.on('SIGTERM', () => {
    client.close();
    process.exit(0);
});
