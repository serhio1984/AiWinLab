const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
  let data = { predictions: [] };

  // Попробуем загрузить данные (если файл доступен)
  try {
    const filePath = path.join(process.cwd(), 'data.json');
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log('Data loaded from data.json:', data);
  } catch (error) {
    console.error('Error reading data.json or file not found:', error);
  }

  if (req.method === 'GET') {
    console.log('GET request - Returning predictions:', data.predictions);
    res.status(200).json(data.predictions);
  } else if (req.method === 'POST') {
    const newPrediction = req.body;
    console.log('Received new prediction:', newPrediction);
    data.predictions.push(newPrediction);
    console.log('Updated data:', data);

    // Возвращаем текущие предсказания в ответе
    res.status(200).json({ message: 'Prediction saved', predictions: data.predictions });
  }
}