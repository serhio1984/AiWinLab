// server.js
const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const { generatePredictions } = require('./prediction-generator');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ======= Telegram Bot =======
const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required in environment');
  process.exit(1);
}
const botApi = new TelegramBot(BOT_TOKEN, { polling: false });

// Доп. защита webhook запросов
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || null;

// ======= Admin / Flags =======
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ENABLE_AUTO_GEN = process.env.ENABLE_AUTO_GEN === 'true'; // автогенерация черновиков по CRON (по умолчанию выкл)

const rootDir = path.join(__dirname, '..');
console.log('Root directory set to:', rootDir);

// ======= MongoDB =======
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ MONGODB_URI is required in environment');
  process.exit(1);
}
const client = new MongoClient(uri, { maxPoolSize: 10 });
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

// ======= Вспомогательный хелпер профиля (сохраняем ник/имя/фото) =======
function normalizeProfile(raw = {}) {
  const username = raw.username || null;
  const firstName = raw.first_name || null;
  const lastName = raw.last_name || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || firstName || null;
  const photoUrl = raw.photo_url || null;

  return {
    username,
    firstName,
    lastName,
    fullName,
    photoUrl,
    tg: raw && Object.keys(raw).length ? raw : null
  };
}

// ======= WEBHOOK (с верификацией секрета) =======
app.post('/webhook', async (req, res) => {
  // Проверяем секрет, если настроен через setWebhook(secret_token=...)
  if (TELEGRAM_WEBHOOK_SECRET) {
    // Telegram присылает именно этот заголовок:
    const incoming = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (!incoming || incoming !== TELEGRAM_WEBHOOK_SECRET) {
      console.warn('🚫 Webhook rejected: invalid secret token header');
      return res.sendStatus(403);
    }
  }

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

      // профиль отправителя из апдейта
      const from = body.message.from || {};
      const profileData = normalizeProfile(from);

      await users.updateOne(
        { chatId: userId },
        {
          $inc: { coins },
          $setOnInsert: { chatId: userId, coins: 0 },
          $set: profileData
        },
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

// ======= STATIC / ROOT =======
app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'welcome.html')));
app.use(express.static(path.join(__dirname, '../'), { index: 'welcome.html' }));

// ======= Проверка пароля админки =======
app.post('/api/check-password', (req, res) => {
  const { password } = req.body;
  res.json({ success: password === ADMIN_PASSWORD });
});

// ======= Баланс + сохранение профиля =======
app.post('/balance', async (req, res) => {
  const { userId, action, amount, profile } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  const users = db.collection('users');
  const profileData = profile ? normalizeProfile(profile) : null;

  if (action === 'get') {
    let user = await users.findOne({ chatId: userId });

    if (!user) {
      const doc = { chatId: userId, coins: 5 };
      if (profileData) Object.assign(doc, profileData);
      await users.insertOne(doc);
      user = doc;
    } else if (profileData) {
      await users.updateOne({ chatId: userId }, { $set: profileData });
      user = await users.findOne({ chatId: userId });
    }

    return res.json({ coins: user.coins ?? 0 });
  }

  if (action === 'update') {
    const update = {
      $inc: { coins: amount || 0 },
      $setOnInsert: { chatId: userId, coins: 0 }
    };
    if (profileData) update.$set = profileData;

    const result = await users.findOneAndUpdate(
      { chatId: userId },
      update,
      { upsert: true, returnDocument: 'after' }
    );
    return res.json({ coins: result.value.coins });
  }

  res.status(400).json({ error: 'Invalid action' });
});

// ======= Публичные прогнозы =======
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

  // сохраняем все поля, включая country/league/date, если приходят
  const cleaned = arr.map(p => {
    const { id, tournament, team1, logo1, team2, logo2, odds, predictionText, country, league, date } = p;
    return { id, tournament, team1, logo1, team2, logo2, odds, predictionText, country, league, date };
  });

  const coll = db.collection('draft_predictions');
  await coll.deleteMany({});
  if (cleaned.length > 0) await coll.insertMany(cleaned);

  res.json({ success: true });
});

// Ручная генерация черновиков на завтра
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

// Разблокировка отдельного прогноза
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

// Массовая разблокировка (динамическая цена приходит с клиента — как у вас было)
app.post('/api/unlock-all', async (req, res) => {
  const { userId, price } = req.body;
  if (!userId || typeof price !== 'number') return res.status(400).json({ ok: false, error: 'Missing data' });

  const users = db.collection('users');
  const unlocks = db.collection('unlocks');
  const preds = await db.collection('predictions').find().toArray();

  const user = await users.findOne({ chatId: userId });
  if (!user || user.coins < price) return res.json({ ok: false, error: 'Недостаточно монет' });

  await users.updateOne({ chatId: userId }, { $inc: { coins: -price } });

  const ops = preds.map(p => ({
    updateOne: {
      filter: { userId, predictionId: p.id },
      update: { $set: { userId, predictionId: p.id } },
      upsert: true
    }
  }));
  if (ops.length) await unlocks.bulkWrite(ops);

  const updated = await users.findOne({ chatId: userId });
  res.json({ ok: true, coins: updated.coins });
});

// Создание инвойса (Telegram Stars)
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

    console.log('📄 Invoice link created');
    res.json({ ok: true, url: link });
  } catch (e) {
    console.error('❌ Error creating invoice:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

process.on('SIGTERM', () => client.close().catch(()=>{}).finally(()=>process.exit(0)));
process.on('SIGINT', () => client.close().catch(()=>{}).finally(()=>process.exit(0)));

module.exports = app;
