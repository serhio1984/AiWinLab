let data = { predictions: [] }; // Глобальная переменная для хранения данных

export default function handler(req, res) {
  if (req.method === 'GET') {
    console.log('GET request - Returning predictions:', data.predictions);
    res.status(200).json(data.predictions);
  } else if (req.method === 'POST') {
    const newPredictions = req.body;
    console.log('Received new predictions:', newPredictions);
    newPredictions.forEach(newPrediction => {
      if (!data.predictions.some(p => p.id === newPrediction.id)) {
        data.predictions.push(newPrediction);
        console.log('Added new prediction:', newPrediction);
      } else {
        console.log('Prediction with id', newPrediction.id, 'already exists, skipping');
      }
    });
    console.log('Updated data:', data);
    res.status(200).json({ message: 'Predictions saved', predictions: data.predictions });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}