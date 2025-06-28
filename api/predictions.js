const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
app.use(express.json());
app.use(express.static('.'));

const uri = process.env.MONGODB_URI;
console.log('Raw MONGODB_URI:', uri);
if (!uri) console.log('MONGODB_URI is undefined');

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  maxPoolSize: 10, minPoolSize: 2, connectTimeoutMS: 30000
});

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected successfully');
    await client.db("admin").command({ ping: 1 });
    console.log("Ping confirmed!");
  } catch (error) {
    console.error('Connection error:', error);
    throw error;
  }
}

run().catch(console.error);

async function handler(req, res) {
  console.log('Handler for:', req.method);
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
      if (newPredictions.length > 0) await collection.insertMany(newPredictions);
      const updatedPredictions = await collection.find().toArray();
      res.status(200).json({ message: 'Saved', predictions: updatedPredictions });
    } else {
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

app.all('/api/predictions', handler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
});