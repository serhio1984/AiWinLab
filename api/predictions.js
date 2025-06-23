const { MongoClient } = require('mongodb');

// Замени <db_password> на твой пароль
const uri = "mongodb+srv://buslovserg:hBkrsnN5RoYzcug8@cluster0.9r8g5mf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToDatabase() {
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    return client.db('predictionsDB'); // Название базы данных
  } catch (error) {
    console.error('Connection error:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  let db;
  try {
    db = await connectToDatabase();
    const collection = db.collection('predictions');

    if (req.method === 'GET') {
      const predictions = await collection.find().toArray();
      console.log('GET request - Returning predictions:', predictions);
      res.status(200).json(predictions);
    } else if (req.method === 'POST') {
      const newPredictions = req.body;
      console.log('Received new predictions:', newPredictions);
      await collection.deleteMany({}); // Очищаем все существующие данные
      await collection.insertMany(newPredictions); // Вставляем новые
      const updatedPredictions = await collection.find().toArray();
      console.log('Updated data:', updatedPredictions);
      res.status(200).json({ message: 'Predictions saved', predictions: updatedPredictions });
    } else {
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    // Закрываем соединение (Vercel управляет этим, но оставим для надежности)
    // await client.close();
  }
}