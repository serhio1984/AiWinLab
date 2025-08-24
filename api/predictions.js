const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const { generatePredictions } = require('./prediction-generator');

const app = express();
app.use(express.json({ limit: '10mb' }));

const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = process.env.BOT_TOKEN;
const botApi = new TelegramBot(BOT_TOKEN, { polling: false });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ENABLE_AUTO_GEN = process.env.ENABLE_AUTO_GEN === 'true'; // автогенерация черновиков по CRON (по умолчанию выкл)

const rootDir = path.join(__dirname, '..');
console.log('Root directory set to:', rootDir);

// ======= MONGO DB =======
const uri =
  process.env.MONGODB_URI ||
  'mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true';
const client = new MongoClient(uri);
let db;

async function connectDB() {
  await client.connect();
  db = client.db('predictionsDB');
  console.log('✅ MongoDB connected');
}
client.on('disconnected', () => connectDB().catch(console.error));
connectDB().then(() =>
  app.listen(process.env.PORT || 3000, () => console.log('🚀 Server started'))
);

// ======= CRON: Автопубликация прогнозов (НЕ отключаем) =======
cron.schedule(
  '2 0 * * *',
  async () => {
    console.log('⏰ Публикация прогнозов в 00:02 (Киев)');
    try {
      const nextDayColl = db.collection('predictions_next_day');
      const mainColl = db.collection('predictions');
      const nextDayPredictions = await nextDayColl.find().toArray();

      if (nextDayPredictions.length > 0) {
        await mainColl.deleteMany({});
        await mainColl.insertMany(nextDayPredictions);
        await nextDayColl.deleteMany({});
        console.log('✅ Прогнозы опубликованы:', nextDayPredictions.length);
      } else {
        console.log('⚠️ Нет прогнозов для публикации');
      }
    } catch (err) {
      console.error('❌ Ошибка публикации:', err);
    }
  },
  { timezone: 'Europe/Kiev' }
);

// ======= (Опционально) CRON: Автогенерация черновиков =======
if (ENABLE_AUTO_GEN) {
  cron.schedule(
    '10 21 * * *',
    async () => {
      console.log('⏰ Генерация черновиков прогнозов (21:10 Киев, авто-CRON)');
      try {
        const predictions = await generatePredictions();
        const draftsColl = db.collection('draft_predictions');
        await draftsColl.deleteMany({});
        if (predictions.length > 0) await draftsColl.insertMany(predictions);
        console.log(`✅ Сгенерировано и сохранено в черновики: ${predictions.length}`);
      } catch (err) {
        console.error('❌ Ошибка генерации черновиков:', err);
      }
    },
    { timezone: 'Europe/Kiev' }
  );
}

// ======= WEBHOOK =======
app.post('/webhook', express.json({ limit: '10mb' }), async (req, res) => {
  console.log('📩 Вызван /webhook!');
  try {
    if (!db) return res.sendStatus(200);

    const body = req.body;

    // Ответ на pre_checkout_query
    if (body.pre_checkout_query) {
      const queryId = body.pre_checkout_query.id;
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
        pre_checkout_query_id: queryId,
        ok: true
      });
      console.log(`✅ Ответили на pre_checkout_query ${queryId}`);
      return res.sendStatus(200);
    }

    // Успешная оплата
    if (body.message?.successful_payment) {
      const payload = body.message.successful_payment.invoice_payload;
      if (!payload) return res.sendStatus(200);

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        console.error('❌ Невалидный payload:', payload);
        return res.sendStatus(200);
      }

      const { userId, coins } = parsed;
      const users = db.collection('users');
      await users.updateOne(
        { chatId: userId },
        { $inc: { coins }, $setOnInsert: { chatId: userId } },
        { upsert: true }
      );
      console.log(`✅ Пользователь ${userId} получил ${coins} монет`);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Ошибка в webhook:', e.stack);
    res.sendStatus(200);
  }
});

// ======= ROUTES =======
app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'welcome.html')));
app.use(express.static(path.join(__dirname, '../'), { index: 'welcome.html' }));

// Проверка пароля
app.post('/api/check-password', (req, res) => {
  const { password } = req.body;
  res.json({ success: password === ADMIN_PASSWORD });
});

// Баланс
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

// Получение прогнозов (пользователи видят опубликованные)
app.get('/api/predictions', async (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const preds = await db.collection('predictions').find().toArray();

  if (!userId) return res.json(preds.map(p => ({ ...p, isUnlocked: false })));

  const unlocks = await db.collection('unlocks').find({ userId }).toArray();
  const unlockedIds = new Set(unlocks.map(u => u.predictionId));

  const result = preds.map(p => ({ ...p, isUnlocked: unlockedIds.has(p.id) }));
  res.json(result);
});

// ======= Черновики (админ) =======

// Прочитать черновики
app.get('/api/drafts', async (req, res) => {
  try {
    const drafts = await db.collection('draft_predictions').find().toArray();
    res.json(drafts);
  } catch (e) {
    console.error('Ошибка получения черновиков:', e);
    res.status(500).json({ success: false });
  }
});

// Сохранить черновики (перезапись коллекции)
app.post('/api/predictions', async (req, res) => {
  const arr = req.body;
  if (!Array.isArray(arr)) return res.status(400).json({ success: false });

  const cleaned = arr.map(p => {
    const { id, tournament, team1, logo1, team2, logo2, odds, predictionText, country, league, date } = p;
    return { id, tournament, team1, logo1, team2, logo2, odds, predictionText, country, league, date };
  });

  const coll = db.collection('draft_predictions');
  await coll.deleteMany({});
  if (cleaned.length > 0) await coll.insertMany(cleaned);

  res.json({ success: true });
});

// Ручная генерация черновиков на завтра (по кнопке в админке)
app.post('/api/generate-drafts-now', async (req, res) => {
  try {
    const predictions = await generatePredictions(); // генератор сам пишет в draft_predictions
    res.json({ success: true, count: predictions.length });
  } catch (e) {
    console.error('❌ Ошибка ручной генерации черновиков:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// Подготовить к публикации (копируем в predictions_next_day)
app.post('/api/publish-next-day', async (req, res) => {
  const drafts = await db.collection('draft_predictions').find().toArray();
  if (!drafts.length) return res.json({ success: false, message: 'Нет черновиков' });

  const nextDay = db.collection('predictions_next_day');
  await nextDay.deleteMany({});
  await nextDay.insertMany(drafts);

  res.json({ success: true, message: 'Прогнозы готовы к публикации завтра' });
});

// Разблокировка одного прогноза
app.post('/api/unlock', async (req, res) => {
  const { userId, predictionId } = req.body;
  if (!userId || predictionId == null) return res.status(400).json({ error: 'Missing data' });

  const users = db.collection('users');
  const unlocks = db.collection('unlocks');

  const user = await users.findOne({ chatId: userId });
  if (!user || user.coins < 1) return res.json({ success: false, message: 'Недостаточно монет' });

  await users.updateOne({ chatId: userId }, { $inc: { coins: -1 } });
  await unlocks.updateOne(
    { userId, predictionId },
    { $set: { userId, predictionId } },
    { upsert: true }
  );

  const updated = await users.findOne({ chatId: userId });
  res.json({ success: true, coins: updated.coins });
});

// === Разблокировать ВСЁ за динамическую стоимость (с защитой от повторной покупки) ===
app.post('/api/unlock-all', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID required' });
  }

  const users = db.collection('users');
  const unlocks = db.collection('unlocks');
  const predsColl = db.collection('predictions');

  const user = await users.findOne({ chatId: userId });
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  // Берём список всех опубликованных прогнозов (id)
  const allPreds = await predsColl.find({}, { projection: { id: 1 } }).toArray();
  const totalCount = allPreds.length;
  if (!totalCount) {
    return res.json({ success: false, message: 'Нет прогнозов' });
  }

  // Вычисляем, какие ещё закрыты
  const already = await unlocks.find({ userId }, { projection: { predictionId: 1 } }).toArray();
  const unlockedSet = new Set(already.map(u => u.predictionId));
  const lockedIds = allPreds.map(p => p.id).filter(id => !unlockedSet.has(id));

  if (lockedIds.length === 0) {
    // Ничего не списываем — всё уже открыто
    return res.json({ success: false, message: 'Все прогнозы уже открыты', coins: user.coins });
  }

  // Серверный расчёт цены (защита от подмены на клиенте)
  const serverCost = Math.floor(totalCount / 1.3);

  if (user.coins < serverCost) {
    return res.json({ success: false, message: 'Недостаточно монет', coins: user.coins });
  }

  // Списываем монеты ОДИН раз
  await users.updateOne({ chatId: userId }, { $inc: { coins: -serverCost } });

  // Открываем только реально оставшиеся закрытые
  const ops = lockedIds.map(id => ({
    updateOne: {
      filter: { userId, predictionId: id },
      update: { $set: { userId, predictionId: id } },
      upsert: true
    }
  }));
  if (ops.length) await unlocks.bulkWrite(ops);

  const updated = await users.findOne({ chatId: userId });
  res.json({ success: true, coins: updated.coins, unlocked: lockedIds.length, charged: serverCost });
});

// Создание инвойса
app.post('/create-invoice', async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: 'DB unavailable' });

  const { userId, coins, stars } = req.body;
  if (!userId || !coins || !stars) {
    return res.status(400).json({ ok: false, error: 'Missing purchase data' });
  }

  try {
    const prices = [{ amount: stars, label: `${coins} монет` }];

    const link = await botApi.createInvoiceLink(
      `Покупка ${coins} монет`,
      `Вы получите ${coins} монет`,
      JSON.stringify({ userId, coins }),
      'redirect-index',
      'XTR',
      prices
    );

    console.log('📄 Invoice link created:', link);
    res.json({ ok: true, url: link });
  } catch (e) {
    console.error('❌ Error creating invoice:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

process.on('SIGTERM', () => client.close() && process.exit(0));

module.exports = app;
