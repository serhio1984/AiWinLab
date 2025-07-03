const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

// ✅ API-роуты (приоритет выше статических)
app.post('/api/check-password', (req, res) => {
  console.log('Received check-password request with body:', req.body);
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!password) {
    return res.status(400).json({ success: false, message: 'Пароль не указан!' });
  }
  if (password === adminPassword) {
    console.log('Password check succeeded');
    res.status(200).json({ success: true });
  } else {
    console.log('Password check failed');
    res.status(401).json({ success: false, message: 'Неверный пароль!' });
  }
});

app.all('/api/predictions', async (req, res) => {
  console.log('Handler for:', req.method);

  if (!collection) {
    return res.status(500).json({ message: 'MongoDB not connected' });
  }

  try {
    if (req.method === 'GET') {
      const predictions = await collection.find().toArray();
      res.status(200).json(predictions);
    } else if (req.method === 'POST') {
      const newPredictions = req.body;
      await collection.deleteMany({});
      if (newPredictions.length > 0) {
        await collection.insertMany(newPredictions);
      }
      const updated = await collection.find().toArray();
      res.status(200).json({ message: 'Saved', predictions: updated });
    } else {
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('❌ Handler error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ Маршруты для страниц
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../welcome.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));
app.get('/buy-coins.html', (req, res) => res.sendFile(path.join(__dirname, '../buy-coins.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, '../admin.html')));

// ✅ Статические файлы (после API-роутов)
app.use(express.static(path.join(__dirname, '..')));

// ✅ MongoDB подключение
const uri = process.env.MONGODB_URI;
console.log('Raw MONGODB_URI:', uri);
if (!uri) console.log('MONGODB_URI is undefined');

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let collection;
async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected successfully');
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Ping confirmed!");

    const db = client.db('predictionsDB');
    collection = db.collection('predictions');
  } catch (error) {
    console.error('❌ Connection error:', error);
  }
}
run();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});