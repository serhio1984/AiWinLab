const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
  const filePath = path.join(process.cwd(), 'data.json');
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (req.method === 'GET') {
    res.status(200).json(data.predictions);
  } else if (req.method === 'POST') {
    const newPrediction = req.body;
    data.predictions.push(newPrediction);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.status(200).json({ message: 'Prediction saved' });
  }
}