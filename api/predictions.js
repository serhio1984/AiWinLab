const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
app.use(express.json());

const uri = process.env.MONGODB_URI || "mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("aiwinlab"); // Укажите имя вашей базы данных
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Failed to connect to MongoDB:", error);
    }
}

connectDB();

app.post('/balance', async (req, res) => {
    const { userId, action, amount } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }
    try {
        const usersCollection = db.collection('users');
        if (action === 'update') {
            if (!amount || isNaN(amount)) {
                return res.status(400).json({ error: 'Invalid amount' });
            }
            const user = await usersCollection.findOneAndUpdate(
                { chatId: userId },
                { $inc: { coins: amount }, $setOnInsert: { chatId: userId, coins: 0 } },
                { upsert: true, returnDocument: 'after' }
            );
            res.json({ coins: user.value.coins });
        } else {
            const user = await usersCollection.findOne({ chatId: userId }) || { coins: 0 };
            res.json({ coins: user.coins });
        }
    } catch (error) {
        console.error('Ошибка получения/обновления баланса:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/predictions', async (req, res) => {
    try {
        const predictionsCollection = db.collection('predictions');
        const predictions = await predictionsCollection.find().toArray();
        res.json(predictions);
    } catch (error) {
        console.error('Ошибка получения прогнозов:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
    client.close();
    process.exit(0);
});