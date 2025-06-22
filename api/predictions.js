let data = { predictions: [] }; // Глобальная переменная для хранения данных

export default function handler(req, res) {
  if (req.method === 'GET') {
    console.log('GET request - Returning predictions:', data.predictions);
    res.status(200).json(data.predictions);
  } else if (req.method === 'POST') {
    const newPredictions = req.body;
    console.log('Received new predictions:', newPredictions);
    // Очищаем существующие данные и добавляем новые
    data.predictions = newPredictions.map(newPrediction => {
      const existingPrediction = data.predictions.find(p => p.id === newPrediction.id);
      return existingPrediction ? { ...existingPrediction, ...newPrediction } : newPrediction;
    });
    console.log('Updated data:', data);
    res.status(200).json({ message: 'Predictions saved', predictions: data.predictions });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}