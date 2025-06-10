
  console.log('Файл index.js запущен');
const express = require('express');
console.log('Express загружен');
const bodyParser = require('body-parser');
console.log('Body-parser загружен');
const { Telegraf } = require('telegraf');
console.log('Telegraf загружен');
const cors = require('cors');
console.log('CORS загружен');

const app = express();
console.log('Express инициализирован');

// Настройка CORS для конкретного источника
app.use(cors({ origin: 'http://127.0.0.1:8080' }));
app.use(bodyParser.json());
console.log('Middleware настроен');

const botToken = '7731894420:AAFo4obZxbsBVZtEZHEviywt2ztuTyBS4c0'; // Ваш токен
console.log('Токен бота:', botToken);
const bot = new Telegraf(botToken);
console.log('Бот инициализирован');

bot.start((ctx) => {
    console.log('Бот запущен пользователем:', ctx.from.username);
    ctx.reply('Добро пожаловать в AiWinLab! Используйте /buy для покупки монет.');
});

bot.command('buy', (ctx) => {
    ctx.reply('Выберите пакет монет в @AiWinLabBot или на сайте.');
});

bot.on('pre_checkout_query', (ctx) => {
    console.log('Получен запрос на предпроверку:', ctx.preCheckoutQuery.id);
    ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', (ctx) => {
    console.log('Успешная оплата:', ctx.update.message.successful_payment);
    const amount = ctx.update.message.successful_payment.total_amount / 100;
    const payload = ctx.update.message.successful_payment.invoice_payload;
    ctx.reply(`Поздравляем! Оплата на ${amount} Stars успешна. Платёж: ${payload}`);
});

try {
    bot.launch();
    console.log('Бот запущен...');
} catch (error) {
    console.error('Ошибка запуска бота:', error);
}

app.post('/create-invoice', (req, res) => {
    console.log('Запрос на создание инвойса получен:', req.body);
    const { title, description, payload, currency, prices } = req.body;

    if (!title || !description || !payload || !currency || !prices || !Array.isArray(prices)) {
        return res.status(400).json({ error: 'Неверные параметры запроса' });
    }

    const safeTitle = 'Test_Purchase';
    console.log('Используемый title:', safeTitle);
    console.log('Полные параметры:', { title: safeTitle, description, payload, currency, prices });

    // Упрощённые параметры для теста
    const testPrices = [{ label: 'Test', amount: 100 }]; // Минимальная сумма
    console.log('Тестовые параметры для API:', { title: safeTitle, description, payload, currency: 'XTR', prices: testPrices });

    bot.telegram.createInvoiceLink(
        safeTitle,
        description,
        payload,
        '', // provider_token (оставляем пустым)
        'XTR', // Валюта Stars
        testPrices
    ).then(invoiceLink => {
        console.log('Инвойс создан:', invoiceLink);
        res.json({ invoiceLink });
    }).catch(error => {
        console.error('Ошибка создания инвойса:', error.response ? error.response.description : error.message);
        res.status(500).json({ error: 'Ошибка создания инвойса: ' + (error.response ? error.response.description : error.message) });
    });
});

   
app.get('/', (req, res) => {
    res.send('Сервер AiWinLab работает!');
});

const port = 3000;
app.listen(port, (err) => {
    if (err) {
        console.error('Ошибка запуска сервера:', err);
    } else {
        console.log(`Сервер запущен на порту ${port}`);
    }
});