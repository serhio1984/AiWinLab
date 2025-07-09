const express = require('express');
const app = express();
app.use(express.json());

// Подключение к базе данных (предполагается, что db уже определён)
// Например: const { MongoClient } = require('mongodb'); const db = client.db('yourDatabase');

app.post('/balance', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const { userId, action, amount } = req.body;
    console.log('📩 Запрос /balance:', req.body); // лог запроса

    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const users = db.collection('users');

        if (action === 'update') {
            if (typeof amount !== 'number') {
                return res.status(400).json({ error: 'Amount must be a number' });
            }

            const result = await users.findOneAndUpdate(
                { chatId: userId },
                {
                    $inc: { coins: amount },
                    $setOnInsert: { chatId: userId, coins: 0 }
                },
                { upsert: true, returnDocument: 'after' }
            );

            console.log('✅ Обновлён баланс:', result.value);
            res.json({ coins: result.value.coins });

        } else {
            const user = await users.findOne({ chatId: userId }) || { coins: 0 };
            console.log('✅ Баланс получен:', user);
            res.json({ coins: user.coins });
        }

    } catch (e) {
        console.error('❌ Ошибка при обновлении баланса:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Другие маршруты (например, /api/predictions) остаются без изменений
app.get('/api/predictions', (req, res) => {
    // Логика получения прогнозов
    res.json([]);
});

// Запуск сервера (если применимо)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app; // Если используется как модуль