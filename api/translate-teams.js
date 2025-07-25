const { MongoClient } = require('mongodb');
const OpenAI = require('openai');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const client = new MongoClient(MONGODB_URI);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

let db;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db('predictionsDB');
    console.log("✅ DB connected (translate-teams)");
  }
  return db;
}

// Перевод списка команд одним запросом
async function translateTeamsBatch(teamNames) {
  const prompt = `
Переведи на русский язык названия футбольных команд. Ответь в формате JSON:
["Команда1", "Команда2", ...]
Список: ${teamNames.join(', ')}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const resultText = response.choices[0].message.content.trim();
    const translated = JSON.parse(resultText);
    return translated;
  } catch (e) {
    console.error("Ошибка перевода:", e.message);
    return teamNames; // если ошибка, возвращаем оригинальные названия
  }
}

async function getTranslatedTeams(teams) {
  const db = await connectDB();
  const coll = db.collection('teamTranslations');

  const result = {};
  const newTeams = [];

  // 1. Проверяем, какие команды уже есть в базе
  for (const team of teams) {
    const existing = await coll.findOne({ original: team });
    if (existing) {
      result[team] = existing.translated;
    } else {
      newTeams.push(team);
    }
  }

  // 2. Переводим новые команды
  if (newTeams.length > 0) {
    console.log("🔄 Переводим новые команды:", newTeams);
    const translatedBatch = await translateTeamsBatch(newTeams);

    // Сохраняем переводы в базе
    for (let i = 0; i < newTeams.length; i++) {
      const translatedName = translatedBatch[i] || newTeams[i];
      await coll.insertOne({ original: newTeams[i], translated: translatedName });
      result[newTeams[i]] = translatedName;
    }
  }

  return result;
}

module.exports = { getTranslatedTeams };
