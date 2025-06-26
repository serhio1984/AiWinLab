const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
app.use(express.json()); // Для обработки JSON-данных
app.use(express.static('.')); // Обслуживание статических файлов (admin.html, index.html)

const uri = process.env.MONGODB_URI || "mongodb+srv://buslovserg222:GJCSaQLQGYFOf45w@cluster0.detso80.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
console.log('Using MONGODB_URI:', uri); // Добавляем отладочный лог
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000
  // Убраны все явные настройки TLS, полагаемся на mongodb+srv
});

async function handler(req, res) {
  console.log('Handler started for method:', req.method);
  let connection;

  try {
    console.log('Attempting to connect to MongoDB with URI:', uri);
    connection = await client.connect();
    console.log('MongoDB client connected successfully');
    await connection.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. Connection confirmed!");
    const db = connection.db('predictionsDB');
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
  } finally {
    if (connection) await connection.close();
  }
}

app.all('/api/predictions', handler);

const PORT = process.env.PORT || 10000; // Соответствует логам
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});