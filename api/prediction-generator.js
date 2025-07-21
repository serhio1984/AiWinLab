const axios = require('axios');
const OpenAI = require('openai');

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

const API_URL = 'https://v3.football.api-sports.io/fixtures?date=';
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Список европейских лиг (ID API-Football или названия)
const EUROPEAN_LEAGUES = [
  "Premier League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
  "Eredivisie",
  "Champions League",
  "Europa League",
  "Conference League",
  "Primeira Liga",
  "Scottish Premiership"
];

// Случайные коэффициенты (если нет реальных)
function getRandomOdds() {
  const odds = [1.5, 1.7, 1.9, 2.0, 2.3, 2.5, 3.0, 3.5];
  return odds[Math.floor(Math.random() * odds.length)].toFixed(2);
}

// Получение сегодняшней даты по Киеву
function getTodayKiev() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
  return now.toISOString().split('T')[0];
}

// Получаем список матчей из API-Football
async function fetchMatches() {
  try {
    const today = getTodayKiev();
    const res = await axios.get(`${API_URL}${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    let matches = res.data.response || [];

    // Фильтруем по европейским лигам
    matches = matches.filter(m => EUROPEAN_LEAGUES.includes(m.league.name));

    return matches;
  } catch (e) {
    console.error('Ошибка загрузки матчей:', e.message);
    return [];
  }
}

// Генерация краткого прогноза ИИ
async function generateAIPrediction(home, away) {
  const prompt = `
Ты спортивный аналитик. 
Дай один краткий прогноз на матч ${home} против ${away}. 
Формат: только результат (например, "Победа ${home}", "Тотал больше 2.5", "Фора -1.5 на ${away}", "Двойной шанс ${home} или ничья", "Ничья"). 
Пиши на русском. Никаких объяснений.
  `;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content.trim();
  } catch (e) {
    console.error('Ошибка AI-прогноза:', e.message);
    return `Победа ${home}`;
  }
}

// Генерация 20 прогнозов
async function generatePredictions() {
  let matches = await fetchMatches();
  if (!matches.length) {
    console.warn('Нет матчей по выбранным лигам.');
    return [];
  }

  const predictions = [];
  const maxPredictions = 20;
  const matchCount = Math.min(maxPredictions, matches.length);

  for (let i = 0; i < matchCount; i++) {
    const match = matches[i];
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const aiText = await generateAIPrediction(home, away);

    predictions.push({
      id: Date.now() + i,
      tournament: match.league.name,
      team1: home,
      logo1: match.teams.home.logo,
      team2: away,
      logo2: match.teams.away.logo,
      odds: getRandomOdds(), // пока случайные
      predictionText: aiText
    });
  }

  // Если матчей меньше 20 — дублируем случайные матчи с другими прогнозами
  while (predictions.length < maxPredictions && matches.length > 0) {
    const randomMatch = matches[Math.floor(Math.random() * matches.length)];
    const home = randomMatch.teams.home.name;
    const away = randomMatch.teams.away.name;
    const aiText = await generateAIPrediction(home, away);

    predictions.push({
      id: Date.now() + predictions.length,
      tournament: randomMatch.league.name,
      team1: home,
      logo1: randomMatch.teams.home.logo,
      team2: away,
      logo2: randomMatch.teams.away.logo,
      odds: getRandomOdds(),
      predictionText: aiText
    });
  }

  return predictions;
}

module.exports = { generatePredictions };
