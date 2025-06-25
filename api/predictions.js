const { MongoClient } = require('mongodb');

// Используй эту строку с новым паролем
const uri = "mongodb+srv://buslovserg123:wc7SWelCVuFYnOo6@cluster0.9r8g5mf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToDatabase() {
  try {
    console.log('Starting connection attempt to MongoDB...');
    console.log('Using URI:', uri);
    await client.connect();
    console.log('Connected to MongoDB Atlas successfully');
    return client.db('predictionsDB'); // Название базы данных
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message, 'Stack:', error.stack);
    throw new Error('Failed to connect to MongoDB: ' + error.message);
  }
}

export default async function handler(req, res) {
  console.log('Handler started for method:', req.method);
  let db;
  try {
    db = await connectToDatabase();
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
  }
}