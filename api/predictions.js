const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());
const rootDir = path.join(__dirname, '..');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Mongo
const client = new MongoClient(process.env.MONGODB_URI || "…");
let db;
async function connectDB() { await client.connect(); db = client.db("predictionsDB"); }
connectDB();

// Статика + welcome
app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'welcome.html')));
app.use(express.static(path.join(__dirname, '../'), { index: 'welcome.html' }));

// Баланс
app.post('/balance', async (req, res) => {
  const { userId, action, amount } = req.body;
  const users = db.collection('users');
  if (action === 'update') {
    const r = await users.findOneAndUpdate(
      { chatId: userId },
      { $inc: { coins: amount }, $setOnInsert: { chatId: userId, coins: 5 } },
      { upsert: true, returnDocument: 'after' }
    );
    return res.json({ coins: r.value.coins });
  }
  let u = await users.findOne({ chatId: userId });
  if (!u) { await users.insertOne({ chatId: userId, coins: 5 }); u = { coins: 5 }; }
  res.json({ coins: u.coins });
});

// Получение прогнозов
app.get('/api/predictions', async (req, res) => {
  const userId = Number(req.query.userId);
  const preds = await db.collection('predictions').find().toArray();
  const userUnlocks = await db.collection('unlocks')
    .find({ chatId: userId })
    .toArray();
  const unlockedSet = new Set(userUnlocks.map(u => u.predictionId));
  const out = preds.map(p => ({
    ...p,
    isUnlocked: unlockedSet.has(p.id)
  }));
  res.json(out);
});

// Разблокировка
app.post('/api/unlock', async (req, res) => {
  const { userId, predictionId } = req.body;
  const users = db.collection('users');
  const unlocks = db.collection('unlocks');
  const upd = await users.findOneAndUpdate(
    { chatId: userId, coins: { $gte: 1 } },
    { $inc: { coins: -1 } },
    { returnDocument: 'after' }
  );
  if (!upd.value) return res.json({ success: false, message: 'Недостаточно монет' });
  await unlocks.updateOne(
    { chatId: userId, predictionId },
    { $set: { chatId: userId, predictionId } },
    { upsert: true }
  );
  res.json({ success: true, coins: upd.value.coins });
});

// Админ-прогнозы
app.post('/api/predictions', async (req, res) => {
  const entries = Array.isArray(req.body) ? req.body.map(p => {
    const { isUnlocked, ...c } = p; return c;
  }) : [];
  await db.collection('predictions').deleteMany({});
  if (entries.length) await db.collection('predictions').insertMany(entries);
  res.json({ success: true });
});

// Пароль
app.post('/api/check-password', (req, res) => {
  res.json({ success: req.body.password === ADMIN_PASSWORD });
});

app.listen(process.env.PORT || 3000);
