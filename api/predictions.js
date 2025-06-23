// Временный обработчик без MongoDB
let inMemoryData = []; // Хранилище данных в памяти

export default async function handler(req, res) {
  console.log('Handler started for method:', req.method);
  try {
    if (req.method === 'GET') {
      console.log('GET request - Returning in-memory data:', inMemoryData);
      res.status(200).json(inMemoryData);
    } else if (req.method === 'POST') {
      console.log('Processing POST request');
      const newPredictions = req.body;
      console.log('Received new predictions:', newPredictions);
      inMemoryData = [...newPredictions]; // Обновляем данные
      console.log('Updated in-memory data:', inMemoryData);
      res.status(200).json({ message: 'Predictions saved (in-memory)', predictions: inMemoryData });
    } else {
      console.log('Method not allowed:', req.method);
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Handler Error:', error.message, 'Stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}