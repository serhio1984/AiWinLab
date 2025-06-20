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
    console.log('GET request - Returning predictions:', data.predictions);
    res.status(200).json(data.predictions);
  } else if (req.method === 'POST') {
    const newPrediction = req.body;
    console.log('Received new prediction:', newPrediction);
    data.predictions.push(newPrediction);
    console.log('Updated data before save:', data);

    // Попробуем записать в data.json
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log('Data successfully written to data.json');
    } catch (writeError) {
      console.error('Error writing to data.json:', writeError);
      // Вывод данных в консоль для отладки
      console.log('Data not saved to file, current predictions:', data.predictions);
    }

    res.status(200).json({ message: 'Prediction saved' });
  }
}