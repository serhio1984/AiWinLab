const axios = require('axios');
const OpenAI = require('openai');

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const API_URL = 'https://v3.football.api-sports.io/fixtures?date=';
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Список топ-европейских лиг
const EUROPEAN_LEAGUES = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
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

// Дата по Киеву
function getTodayKiev() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
  return now.toISOString().split('T')[0];
}

// Получение матчей API-Football (только Европа)
async function fetchMatches() {
  try {
    const today = getTodayKiev();
    const res = await axios.get(`${API_URL}${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });

    let matches = res.data.response || [];
    matches = matches.filter(m => EUROPEAN_LEAGUES.includes(m.league.name));

    return matches;
  } catch (e) {
    console.error('Ошибка загрузки матчей:', e.message);
    return [];
  }
}

// Генерация прогнозов одним запросом
async function generateAllPredictions(matches) {
  const matchesList = matches
    .map((m, i) => `${i + 1}. ${m.teams.home.name} vs ${m.teams.away.name}`)
    .join("\n");

  const prompt = `
Ты спортивный аналитик. 
Сделай один краткий прогноз для каждого матча ниже в формате ставок 
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
    const predictions = resultText.split("\n").map(line => line.replace(/^\d+\.\s*/, '').trim());
    return predictions;
  } catch (e) {
    console.error('Ошибка AI-прогноза:', e.message);
    return matches.map(m => `Победа ${m.teams.home.name}`);
  }
}

// Генерация 20 прогнозов
async function generatePredictions() {
  let matches = await fetchMatches();
  if (!matches.length) {
    console.warn('Нет матчей по выбранным лигам.');
    return [];
  }

  // Берём максимум 20 матчей
  matches = matches.slice(0, 20);

  // Генерируем прогнозы
  const aiPredictions = await generateAllPredictions(matches);

  // Формируем список прогнозов
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

  // Если матчей < 20, дублируем случайные
  while (predictions.length < 20 && matches.length > 0) {
    const randomMatch = matches[Math.floor(Math.random() * matches.length)];
    predictions.push({
      id: Date.now() + predictions.length,
      tournament: randomMatch.league.name,
      team1: randomMatch.teams.home.name,
      logo1: randomMatch.teams.home.logo,
      team2: randomMatch.teams.away.name,
      logo2: randomMatch.teams.away.logo,
      odds: getRandomOdds(),
      predictionText: `Победа ${randomMatch.teams.home.name}`
    });
  }

  return predictions;
}

module.exports = { generatePredictions };
