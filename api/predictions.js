const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

const rootDir = path.join(__dirname, '..');
console.log('Root directory set to:', rootDir);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 1. Корневая страница
app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'welcome.html'));
});

// 2. Статика
app.use(express.static(path.join(__dirname, '../'), { index: 'welcome.html' }));

// 3. MongoDB
const uri = process.env.MONGODB_URI || "mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true";
const client = new MongoClient(uri);
let db;

async function connectDB() {
    await client.connect();
    db = client.db("predictionsDB");
    console.log("✅ MongoDB connected");
}

client.on('disconnected', () => connectDB().catch(console.error));
connectDB().then(() => app.listen(process.env.PORT || 3000, () => console.log('🚀 Server started')));

// 4. Админ-панель
app.post('/api/check-password', (req, res) => {
    const { password } = req.body;
    res.json({ success: password === ADMIN_PASSWORD });
});

// 5. Баланс
app.post('/balance', async (req, res) => {
    const { userId, action, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const users = db.collection('users');

    if (action === 'get') {
        let user = await users.findOne({ chatId: userId });
        if (!user) {
            await users.insertOne({ chatId: userId, coins: 5 });
            user = { coins: 5 };
        }
        return res.json({ coins: user.coins });
    }

    if (action === 'update') {
        const result = await users.findOneAndUpdate(
            { chatId: userId },
            { $inc: { coins: amount }, $setOnInsert: { chatId: userId, coins: 0 } },
            { upsert: true, returnDocument: 'after' }
        );
        return res.json({ coins: result.value.coins });
    }

    res.status(400).json({ error: 'Invalid action' });
});

// 6. Получение прогнозов с учётом разблокировок
app.get('/api/predictions', async (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    const preds = await db.collection('predictions').find().toArray();

    if (!userId) {
        return res.json(preds.map(p => ({ ...p, isUnlocked: false })));
    }

    const unlocks = await db.collection('unlocks').find({ userId }).toArray();
    const unlockedIds = new Set(unlocks.map(u => u.predictionId));

    const result = preds.map(p => ({
        ...p,
        isUnlocked: unlockedIds.has(p.id)
    }));

    res.json(result);
});

// 7. Разблокировка прогноза
app.post('/api/unlock', async (req, res) => {
    const { userId, predictionId } = req.body;
    if (!userId || predictionId == null) return res.status(400).json({ error: 'Missing data' });

    const users = db.collection('users');
    const unlocks = db.collection('unlocks');

    const user = await users.findOne({ chatId: userId });
    if (!user || user.coins < 1) {
        return res.json({ success: false, message: 'Недостаточно монет' });
    }

    await users.updateOne({ chatId: userId }, { $inc: { coins: -1 } });
    await unlocks.updateOne(
        { userId, predictionId },
        { $set: { userId, predictionId } },
        { upsert: true }
    );

    const updated = await users.findOne({ chatId: userId });
    res.json({ success: true, coins: updated.coins });
});

// 8. Сохранение прогнозов
app.post('/api/predictions', async (req, res) => {
    const arr = req.body;
    if (!Array.isArray(arr)) return res.status(400).json({ success: false });

    const cleaned = arr.map(p => {
        const { id, tournament, team1, logo1, team2, logo2, odds, predictionText } = p;
        return { id, tournament, team1, logo1, team2, logo2, odds, predictionText };
    });

    const coll = db.collection('predictions');
    await coll.deleteMany({});
    if (cleaned.length > 0) await coll.insertMany(cleaned);

    res.json({ success: true });
});

