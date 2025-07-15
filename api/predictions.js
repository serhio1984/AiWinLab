const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '10mb' }));

const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = process.env.BOT_TOKEN;
const botApi = new TelegramBot(BOT_TOKEN, { polling: false });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const rootDir = path.join(__dirname, '..');
console.log('Root directory set to:', rootDir);

// 📩 Webhook
app.post('/webhook', express.json({ limit: '10mb' }), async (req, res) => {
    console.log('📩 Вызван /webhook!');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    try {
        if (!db) {
            console.error('❌ Database not connected during webhook');
            return res.sendStatus(200);
        }

        const body = req.body;

        // ✅ Ответ на pre_checkout_query
        if (body.pre_checkout_query) {
            const queryId = body.pre_checkout_query.id;
            try {
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
                    pre_checkout_query_id: queryId,
                    ok: true
                });
                console.log(`✅ Ответили на pre_checkout_query ${queryId}`);
            } catch (err) {
                console.error('❌ Ошибка ответа на pre_checkout_query:', err.response?.data || err.message);
            }
            return res.sendStatus(200);
        }

        // ✅ Успешная оплата
        if (body.message?.successful_payment) {
            const payload = body.message.successful_payment.invoice_payload;
            if (!payload) return res.sendStatus(200);

            let parsed;
            try {
                parsed = JSON.parse(payload);
            } catch (e) {
                console.error('❌ Невалидный payload:', payload);
                return res.sendStatus(200);
            }

            const { userId, coins } = parsed;
            if (!userId || typeof coins !== 'number' || coins <= 0) {
                console.warn('⚠️ Неверные данные оплаты:', parsed);
                return res.sendStatus(200);
            }

            const users = db.collection('users');
            const result = await users.updateOne(
    { chatId: userId },
    {
        $inc: { coins },
        $setOnInsert: { chatId: userId } // ✅ убираем coins отсюда
    },
    { upsert: true }
);

            console.log(`✅ Пользователь ${userId} получил ${coins} монет. Результат:`, result);
        } else {
            console.log('⚠️ Другой тип webhook:', JSON.stringify(body));
        }

        res.sendStatus(200);
    } catch (e) {
        console.error('❌ Ошибка в webhook:', e.stack);
        res.sendStatus(200);
    }
});

// 🏠 Корневая страница
app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'welcome.html'));
});

// 🌐 Статика
app.use(express.static(path.join(__dirname, '../'), { index: 'welcome.html' }));

// 🛠️ MongoDB
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

// 🔐 Проверка пароля
app.post('/api/check-password', (req, res) => {
    const { password } = req.body;
    res.json({ success: password === ADMIN_PASSWORD });
});

// 💰 Баланс
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

// 📊 Получение прогнозов
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

// 🔓 Разблокировка прогноза
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

// 📝 Сохранение прогнозов
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

// 💳 Создание инвойса
app.post('/create-invoice', async (req, res) => {
    if (!db) return res.status(503).json({ ok: false, error: 'DB unavailable' });

    const { userId, coins, stars } = req.body;

    if (!userId || !coins || !stars) {
        return res.status(400).json({ ok: false, error: 'Missing purchase data' });
    }

    try {
        const prices = [{ amount: stars, label: `${coins} монет` }];

        const link = await botApi.createInvoiceLink(
            `Покупка ${coins} монет`,                          // title
            `Вы получите ${coins} монет`,                     // description
            JSON.stringify({ userId, coins }),                // payload
            'redirect-index',                                 // 👈 start_parameter
            'XTR',                                            // currency
            prices                                            // prices
        );

        console.log('📄 Invoice link created:', link);
        res.json({ ok: true, url: link });
    } catch (e) {
        console.error('❌ Error creating invoice:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});


// ⛔ Завершение процесса
process.on('SIGTERM', () => client.close() && process.exit(0));
