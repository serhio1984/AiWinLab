const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
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
            res.status(500).send('Ошибка сервера');
        }
    });
});

// 2. Статика
app.use(express.static(path.join(__dirname, '../'), { index: 'welcome.html' }));

// 3. MongoDB
const uri = process.env.MONGODB_URI
    || "mongodb+srv://..."; // твой URI
const client = new MongoClient(uri);
let db;
async function connectDB() {
    await client.connect();
    db = client.db("predictionsDB");
    console.log("✅ Connected to MongoDB");
}
client.on('disconnected', () => connectDB().catch(console.error));
(async () => { await connectDB(); app.listen(process.env.PORT||3000, ()=>console.log('🚀 Server started')); })();

// 4. Вход админа
app.post('/api/check-password', (req, res) => {
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const { password } = req.body;
    res.json({ success: password === ADMIN_PASSWORD });
});

// 5. Баланс
app.post('/balance', async (req, res) => {
    const { userId, action, amount } = req.body;
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
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
        if (typeof amount !== 'number' || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });
        const result = await users.findOneAndUpdate(
            { chatId: userId },
            { $inc: { coins: amount }, $setOnInsert: { chatId: userId, coins: 0 } },
            { upsert: true, returnDocument: 'after' }
        );
        return res.json({ coins: result.value.coins });
    }
    res.status(400).json({ error: 'Unknown action' });
});

// 6. Получаем прогнозы с учётом разблокировок
app.get('/api/predictions', async (req, res) => {
    const userId = Number(req.query.userId);
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const preds = await db.collection('predictions').find().toArray();
    const unlocked = await db.collection('unlocks')
        .find({ chatId: userId })
        .project({ predictionId: 1 })
        .toArray();
    const unlockedIds = new Set(unlocked.map(d => d.predictionId));

    const out = preds.map(p => ({
        ...p,
        isUnlocked: unlockedIds.has(p.id),
    }));
    res.json(out);
});

// 7. Разблокировать прогноз
app.post('/api/unlock', async (req, res) => {
    const { userId, predictionId } = req.body;
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    if (!userId || !predictionId) return res.status(400).json({ error: 'userId and predictionId required' });

    const users = db.collection('users');
    const unlocks = db.collection('unlocks');

    const u = await users.findOne({ chatId: userId });
    if (!u || u.coins < 1) {
        return res.json({ success: false, message: 'Недостаточно монет' });
    }
    await users.updateOne({ chatId: userId }, { $inc: { coins: -1 } });
    await unlocks.updateOne(
        { chatId: userId, predictionId },
        { $set: { chatId: userId, predictionId } },
        { upsert: true }
    );
    const updated = await users.findOne({ chatId: userId });
    res.json({ success: true, coins: updated.coins });
});

// 8. Сохранение прогнозов
app.post('/api/predictions', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const arr = req.body;
    if (!Array.isArray(arr)) return res.status(400).json({ success: false, message: 'Нужно массив' });
    const cleaned = arr.map(p => {
        const { id, tournament, team1, logo1, team2, logo2, odds, predictionText } = p;
        return { id, tournament, team1, logo1, team2, logo2, odds, predictionText };
    });
    const coll = db.collection('predictions');
    await coll.deleteMany({});
    if (cleaned.length > 0) await coll.insertMany(cleaned);
    res.json({ success: true });
});

// graceful shutdown
process.on('SIGTERM', () => client.close() && process.exit(0));
