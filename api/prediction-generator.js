const axios = require('axios');
const OpenAI = require('openai');

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '548e45339f74b3a936d49be6786124b0';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const ODDS_URL = 'https://v3.football.api-sports.io/odds';

// Европейские турниры
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
  "Belgian Pro League",
  "Swiss Super League",
  "Turkish Super Lig",
  "Greek Super League",
  "Austrian Bundesliga",
  "Danish Superliga",
  "Norwegian Eliteserien",
  "Swedish Allsvenskan"
];

// Европейские страны
const EUROPEAN_COUNTRIES = [
  "England", "Spain", "Italy", "Germany", "France", "Netherlands", "Portugal",
  "Scotland", "Ukraine", "Belgium", "Switzerland", "Turkey", "Greece",
  "Austria", "Denmark", "Norway", "Sweden", "Poland", "Czech Republic"
];

// Текущая дата по Киеву
function getTodayKiev() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
  return now.toISOString().split('T')[0];
}

// 1. Получение матчей
async function fetchMatches() {
  try {
    const today = getTodayKiev();
    const res = await axios.get(`${FIXTURES_URL}?date=${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });

    let matches = res.data.response || [];

    // Фильтруем только европейские турниры и страны
    matches = matches.filter(m =>
      EUROPEAN_LEAGUES.includes(m.league.name) ||
      EUROPEAN_COUNTRIES.includes(m.league.country)
    );

    console.log(`🎯 Найдено европейских матчей: ${matches.length}`);
    return matches.slice(0, 40);
  } catch (e) {
    console.error('Ошибка загрузки матчей:', e.message);
    return [];
  }
}

// 2. Получение реальных коэффициентов
async function fetchOdds(fixtureId) {
  try {
    const res = await axios.get(`${ODDS_URL}?fixture=${fixtureId}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });

    const data = res.data.response;
    if (data.length > 0 && data[0].bookmakers.length > 0) {
      const outcomes = data[0].bookmakers[0].bets[0].values;
      if (outcomes.length > 0) return outcomes[0].odd;
    }
    return "—";
  } catch (e) {
    console.error(`Ошибка получения коэффициента для матча ${fixtureId}:`, e.message);
    return "—";
  }
}

// 3. Генерация прогнозов одним запросом
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

// 4. Основная функция генерации
async function generatePredictions() {
  const matches = await fetchMatches();

  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    return [];
  }

  // Получаем реальные коэффициенты
  const matchesWithOdds = [];
  for (const match of matches) {
    const odds = await fetchOdds(match.fixture.id);
    matchesWithOdds.push({ ...match, odds });
  }

  // Генерация прогнозов
  const aiPredictions = await generateAllPredictions(matchesWithOdds);

  const predictions = matchesWithOdds.map((match, i) => ({
    id: Date.now() + i,
    tournament: match.league.name,
    team1: match.teams.home.name,
    logo1: match.teams.home.logo,
    team2: match.teams.away.name,
    logo2: match.teams.away.logo,
    odds: match.odds,
    predictionText: aiPredictions[i] || `Победа ${match.teams.home.name}`
  }));

  console.log(`✅ Сформировано прогнозов: ${predictions.length}`);
  return predictions;
}

module.exports = { generatePredictions };
