const axios = require('axios');
const OpenAI = require('openai');

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '548e45339f74b3a936d49be6786124b0';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const API_URL = 'https://v3.football.api-sports.io/fixtures';
const EUROPEAN_LEAGUES = [
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Europa Conference League",
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "Eredivisie",
  "Primeira Liga",
  "Scottish Premiership",
  "Ukrainian Premier League",
  "Russian Premier League",
  "Belgian Pro League",
  "Swiss Super League",
  "Turkish Super Lig",
  "Greek Super League",
  "Austrian Bundesliga",
  "Danish Superliga",
  "Norwegian Eliteserien",
  "Swedish Allsvenskan"
];

// Генерация случайных коэффициентов
function getRandomOdds() {
  const odds = [1.5, 1.7, 1.9, 2.0, 2.3, 2.5, 3.0, 3.5];
  return odds[Math.floor(Math.random() * odds.length)].toFixed(2);
}

// Текущая дата по Киеву
function getTodayKiev() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
  return now.toISOString().split('T')[0];
}

// 1. Получение матчей
async function fetchMatches() {
  try {
    const today = getTodayKiev();
    const res = await axios.get(`${API_URL}?date=${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });

    let matches = res.data.response || [];

    // Фильтруем только европейские турниры
    matches = matches.filter(m => EUROPEAN_LEAGUES.includes(m.league.name));

    console.log(`🎯 Найдено матчей европейских лиг: ${matches.length}`);
    return matches.slice(0, 40);
  } catch (e) {
    console.error('Ошибка загрузки матчей:', e.message);
    return [];
  }
}

// 2. Генерация прогнозов одним запросом
async function generateAllPredictions(matches) {
  const matchesList = matches.map((m, i) => `${i + 1}. ${m.teams.home.name} vs ${m.teams.away.name}`).join("\n");

  const prompt = `
Ты спортивный аналитик.
Сделай краткий прогноз для каждого матча ниже в формате ставок
(например: "Победа {team1}", "Тотал больше 2.5", "Фора -1.5 на {team2}", "Двойной шанс {team1} или ничья", "Ничья").
Ответь строго в формате "номер. прогноз" на русском, без пояснений.
Список матчей:
${matchesList}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    const resultText = response.choices[0].message.content.trim();
    return resultText.split("\n").map(line => line.replace(/^\d+\.\s*/, '').trim());
  } catch (e) {
    console.error('Ошибка AI-прогноза:', e.message);
    return matches.map(m => `Победа ${m.teams.home.name}`);
  }
}

// 3. Основная функция генерации
async function generatePredictions() {
  const matches = await fetchMatches();

  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    return [];
  }

  const aiPredictions = await generateAllPredictions(matches);

  const predictions = matches.map((match, i) => ({
    id: Date.now() + i,
    tournament: match.league.name,
    team1: match.teams.home.name,
    logo1: match.teams.home.logo,
    team2: match.teams.away.name,
    logo2: match.teams.away.logo,
    odds: getRandomOdds(),
    predictionText: aiPredictions[i] || `Победа ${match.teams.home.name}`
  }));

  console.log(`✅ Сформировано прогнозов: ${predictions.length}`);
  return predictions;
}

module.exports = { generatePredictions };
