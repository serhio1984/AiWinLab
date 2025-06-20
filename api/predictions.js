const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
  const filePath = path.join(process.cwd(), 'data.json');
  let data;

  // Попробуем загрузить данные
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log('Data loaded from data.json:', data);
  } catch (error) {
    console.error('Error reading data.json:', error);
    data = { predictions: [] }; // Инициализация, если файл пуст или недоступен
  }

  if (req.method === 'GET') {
    res.status(200).json(data.predictions);
  } else if (req.method === 'POST') {
    const newPrediction = req.body;
    data.predictions.push(newPrediction);
    console.log('New prediction to save:', newPrediction);

    // Попробуем записать в data.json
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log('Data successfully written to data.json');
    } catch (writeError) {
      console.error('Error writing to data.json:', writeError);
      // Временное сохранение в /tmp для отладки
      const tempPath = path.join('/tmp', 'data.json');
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      console.log('Data written to temporary file:', tempPath);
    }

    res.status(200).json({ message: 'Prediction saved' });
  }
}