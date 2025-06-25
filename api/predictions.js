const { MongoClient, ServerApiVersion } = require('mongodb');

// Используй актуальную строку с паролем и регионом eu-north-1
const uri = "mongodb+srv://buslovserg123:wc7SWelCVuFYnOo6@cluster0.9r8g5mf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0&tls=true";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  tls: {
    minVersion: 'TLSv1.2' // Принудительное использование TLS 1.2
  }
});

export default async function handler(req, res) {
  console.log('Handler started for method:', req.method);
  let connection;

  try {
    console.log('Starting connection attempt to MongoDB...');
    connection = await client.connect();
    console.log('Connected to MongoDB Atlas successfully');
    await connection.db("admin").command({ ping: 1 }); // Проверка подключения
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
      await collection.deleteMany({}); // Очищаем все данные
      if (newPredictions.length > 0) {
        await collection.insertMany(newPredictions); // Вставляем новые
      }
      const updatedPredictions = await collection.find().toArray();
      console.log('POST - Updated data in DB:', updatedPredictions);
      res.status(200).json({ message: 'Predictions saved', predictions: updatedPredictions });
    } else {
      console.log('Method not allowed:', req.method);
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Handler Error:', error.message, 'Stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    if (connection) {
      await connection.close();
      console.log('Connection closed');
    }
  }
}