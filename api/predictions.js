const express = require('express');
const { MongoClient } = require('mongodb');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('❌ Telegram BOT_TOKEN not provided!');
const bot = new TelegramBot(BOT_TOKEN);

const uri = process.env.MONGODB_URI || 'your-mongodb-uri';
const client = new MongoClient(uri);
let db;

async function connectDB() {
    await client.connect();
    db = client.db("predictionsDB");
    console.log("✅ MongoDB connected");
}

connectDB().then(() => {
    app.listen(process.env.PORT || 3000, () => console.log("🚀 Server started"));
});

// ✅ Создание invoice-ссылки
app.post('/create-invoice', async (req, res) => {
    const { userId, coins, stars } = req.body;
    if (!userId || !coins || !stars) {
        return res.status(400).json({ ok: false, error: 'Missing params' });
    }

    const prices = [{ label: `${coins} монет`, amount: stars * 100 }]; // 1 Star = 100 cent-star

    try {
        const result = await bot.createInvoiceLink({
            title: `Покупка ${coins} монет`,
            description: 'Монеты для AiWinLab',
            payload: `buy_${coins}_user_${userId}`,
            provider_token: process.env.PROVIDER_TOKEN, // XTR
            currency: 'XTR',
            prices
        });

        res.json({ ok: true, url: result });
    } catch (err) {
        console.error('❌ Error creating invoice:', err);
        res.status(500).json({ ok: false, error: 'Failed to create invoice' });
    }
});

// ✅ Webhook: успешная оплата
app.post('/webhook', async (req, res) => {
    const msg = req.body.message;
    const payment = msg?.successful_payment;
    if (!payment) return res.sendStatus(200);

    const payload = payment.invoice_payload; // buy_10_user_123456
    const match = payload.match(/^buy_(\d+)_user_(\d+)$/);

    if (!match) return res.sendStatus(200);
    const coins = parseInt(match[1], 10);
    const userId = parseInt(match[2], 10);

    try {
        const users = db.collection('users');
        await users.updateOne(
            { chatId: userId },
            { $inc: { coins }, $setOnInsert: { chatId: userId } },
            { upsert: true }
        );

        await bot.sendMessage(userId, `🎉 Вы успешно купили ${coins} монет!`);
        console.log(`✅ User ${userId} получил ${coins} монет`);
    } catch (e) {
        console.error('❌ Ошибка при начислении монет:', e);
    }

    res.sendStatus(200);
});
