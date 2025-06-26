const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
app.use(express.json()); // Для обработки JSON-данных в теле POST-запросов

// Используем строку без явного tls, так как mongodb+srv подразумевает TLS
const uri = process.env.MONGODB_URI || "mongodb+srv://buslovserg222:GJCSaQLQGYFOf45w@cluster0.detso80.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  tls: true // Явно указываем TLS через опции
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
      console.log('Processing GET request');
      const predictions = await collection.find().toArray();
      console.log('GET - Predictions retrieved:', predictions);
      res.status(200).json(predictions);
    } else if (req.method === 'POST') {
      console.log('Processing POST request');
      const newPredictions = req.body;
      console.log('Received new predictions:', newPredictions);
      await collection.deleteMany({});
      if (newPredictions.length > 0) {
        await collection.insertMany(newPredictions);
      }
      const updatedPredictions = await collection.find().toArray();
      console.log('POST - Updated data in DB:', updatedPredictions);
      res.status(200).json({ message: 'Predictions saved', predictions: updatedPredictions });
    } else {
      console.log('Method not allowed:', req.method);
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Detailed Error - Type:', error.name, 'Message:', error.message, 'Stack:', error.stack);
    if (error.name === 'MongoNetworkError') {
      console.error('Network-specific error details:', error);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    if (connection) {
      await connection.close();
      console.log('Connection closed');
    }
  }
}

// Настройка маршрута
app.all('/api/predictions', handler);

// Прослушивание порта, указанного Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});