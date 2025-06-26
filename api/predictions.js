const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
app.use(express.json()); // Для обработки JSON-данных
app.use(express.static('.')); // Обслуживание статических файлов

const uri = process.env.MONGODB_URI; // Только из окружения, без резервной строки
console.log('Using MONGODB_URI:', uri); // Отладочный лог

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  tls: { // Вставляем временный обход здесь
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    console.log('Attempting to connect to MongoDB...');
    await client.connect();
    console.log('MongoDB client connected successfully');
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. Connection confirmed!");
  } catch (error) {
    console.error('Connection error:', error);
    throw error;
  }
}

run().catch(console.error);

async function handler(req, res) {
  console.log('Handler started for method:', req.method);
  try {
    await run();
    const db = client.db('predictionsDB');
    const collection = db.collection('predictions');

    if (req.method === 'GET') {
      const predictions = await collection.find().toArray();
      res.status(200).json(predictions);
    } else if (req.method === 'POST') {
      const newPredictions = req.body;
      await collection.deleteMany({});
      if (newPredictions.length > 0) {
        await collection.insertMany(newPredictions);
      }
      const updatedPredictions = await collection.find().toArray();
      res.status(200).json({ message: 'Predictions saved', predictions: updatedPredictions });
    } else {
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Detailed Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

app.all('/api/predictions', handler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});