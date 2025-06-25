const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://buslovserg123:wc7SWelCVuFYnOo6@cluster0.9r8g5mf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function run() {
  try {
    console.log('Starting connection attempt to MongoDB...');
    await client.connect();
    console.log('Connected to MongoDB Atlas successfully');
    const db = client.db('predictionsDB');
    const collection = db.collection('test');
    await collection.insertOne({ test: 'success' });
    console.log('Data inserted successfully');
  } catch (error) {
    console.error('Error:', error.message, 'Stack:', error.stack);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

run().catch(console.dir);