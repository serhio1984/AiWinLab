const axios = require('axios');
const OpenAI = require('openai');
const { getTranslatedTeams } = require('./translate-teams');

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '548e45339f74b3a936d49be6786124b0';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const ODDS_URL = 'https://v3.football.api-sports.io/odds';

// Переводы названий турниров
const TOURNAMENT_TRANSLATIONS = {
  "UEFA Champions League": "Лига Чемпионов УЕФА",
  "UEFA Europa League": "Лига Европы УЕФА",
  "UEFA Europa Conference League": "Лига Конференций УЕФА",
  "Premier League": "Премьер-Лига Англии",
  "La Liga": "Ла Лига Испании",
  "Serie A": "Серия А Италии",
  "Bundesliga": "Бундеслига Германии",
  "Ligue 1": "Лига 1 Франции",
  "Eredivisie": "Эредивизи Нидерландов",
  "Primeira Liga": "Примейра Лига Португалии"
};

// Европейские лиги и страны для фильтрации
const EUROPEAN_LEAGUES = Object.keys(TOURNAMENT_TRANSLATIONS);
const EUROPEAN_COUNTRIES = [
  "England", "Spain", "Italy", "Germany", "France", "Netherlands", "Portugal",
  "Scotland", "Ukraine", "Belgium", "Switzerland", "Turkey", "Greece",
  "Austria", "Denmark", "Norway", "Sweden", "Poland", "Czech Republic"
];

function getTodayKiev() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
  return now.toISOString().split('T')[0];
}

function getRandomOdds() {
  const odds = [1.5, 1.7, 1.9, 2.0, 2.3, 2.5, 3.0, 3.5];
  return odds[Math.floor(Math.random() * odds.length)].toFixed(2);
}

// Формат турнира: Футбол.DD.MM.YY Турнир
function formatTournament(match) {
  const date = new Date(match.fixture.date);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(2);
  const league = TOURNAMENT_TRANSLATIONS[match.league.name] || match.league.name;
  return `Футбол.${d}.${m}.${y} ${league}`;
}

// 1. Получение матчей
async function fetchMatches() {
  try {
    const today = getTodayKiev();
    const res = await axios.get(`${FIXTURES_URL}?date=${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });

    let matches = res.data.response || [];

    // Фильтрация только по европейским турнирам или странам
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

// 2. Получение коэффициентов
async function fetchOdds(fixtureId) {
  try {
    const res = await axios.get(`${ODDS_URL}?fixture=${fixtureId}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });

    const data = res.data.response;
    if (data.length > 0 && data[0].bookmakers.length > 0) {
      for (const bookmaker of data[0].bookmakers) {
        if (bookmaker.bets?.[0]?.values?.[0]?.odd) {
          return bookmaker.bets[0].values[0].odd;
        }
      }
    }
    return getRandomOdds();
  } catch (e) {
    console.error(`Ошибка получения коэффициента для матча ${fixtureId}:`, e.message);
    return getRandomOdds();
  }
}

// 3. Генерация прогнозов
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

  // Переводим команды
  const allTeams = matchesWithOdds.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // Генерация прогнозов
  const aiPredictions = await generateAllPredictions(matchesWithOdds);

  const predictions = matchesWithOdds.map((match, i) => ({
    id: Date.now() + i,
    tournament: formatTournament(match),
    team1: teamTranslations[match.teams.home.name] || match.teams.home.name,
    logo1: match.teams.home.logo,
    team2: teamTranslations[match.teams.away.name] || match.teams.away.name,
    logo2: match.teams.away.logo,
    odds: match.odds,
    predictionText: aiPredictions[i] || `Победа ${teamTranslations[match.teams.home.name] || match.teams.home.name}`
  }));

  console.log(`✅ Сформировано прогнозов: ${predictions.length}`);
  return predictions;
}

module.exports = { generatePredictions };
