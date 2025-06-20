let data = { predictions: [] };

export default function handler(req, res) {
  if (req.method === 'GET') {
    console.log('GET request - Returning predictions:', data.predictions);
    res.status(200).json(data.predictions);
  } else if (req.method === 'POST') {
    const newPrediction = req.body;
    console.log('Received new prediction:', newPrediction);
    // Проверяем уникальность по id
    if (!data.predictions.some(p => p.id === newPrediction.id)) {
      data.predictions.push(newPrediction);
      console.log('Updated data:', data);
    } else {
      console.log('Prediction with id', newPrediction.id, 'already exists, skipping');
    }
    res.status(200).json({ message: 'Prediction saved', predictions: data.predictions });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}