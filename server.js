const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

// Конфигурация
const BOT_TOKEN = '7731894420:AAFo4obZxbsBVZtEZHEviywt2ztuTyBS4c0'; // Ваш токен
const WEBHOOK_URL = 'https://aiwinlab.onrender.com/webhook'; // URL для webhook

// Хранение баланса пользователей в памяти (временное решение, замените на базу данных)
const userBalances = new Map();

// Настройка webhook (однократная)
async function setWebhook() {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            url: WEBHOOK_URL
        });
        console.log('Webhook установлен');
    } catch (error) {
        console.error('Ошибка установки webhook:', error.response?.data || error.message);
    }
}
setWebhook();

// Обработка входящих сообщений
app.post('/webhook', (req, res) => {
    const update = req.body;
    if (update.message && update.message.successful_payment) {
        const payment = update.message.successful_payment;
        const chatId = update.message.chat.id;
        const totalAmount = parseInt(payment.total_amount); // В минимальных единицах (1 Star = 100)
        const coins = totalAmount / 100; // Предполагаем, что 100 единиц = 1 монета

        try {
            let userCoins = userBalances.get(chatId) || 0;
            userCoins += coins;
            userBalances.set(chatId, userCoins);

            axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: `Покупка успешна! Ваш баланс: ${userCoins} монет.`
            }).catch(err => console.error('Ошибка отправки сообщения:', err));

            res.sendStatus(200);
        } catch (error) {
            console.error('Ошибка обработки платежа:', error);
            res.sendStatus(500);
        }
    } else {
        res.sendStatus(200); // Подтверждаем получение других обновлений
    }
});

// Получение баланса пользователя
app.post('/balance', (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }
    const coins = userBalances.get(userId) || 0;
    res.json({ coins });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));