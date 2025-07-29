const axios = require('axios');
const OpenAI = require('openai');
const { MongoClient } = require('mongodb');
const { getTranslatedTeams } = require('./translate-teams');

// === API KEYS ===
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '548e45339f74b3a936d49be6786124b0';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true";
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// === API URLs ===
const FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const ODDS_URL = 'https://v3.football.api-sports.io/odds';

// === Переводы турниров ===
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

const EUROPEAN_LEAGUES = Object.keys(TOURNAMENT_TRANSLATIONS);
const EUROPEAN_COUNTRIES = [
  "England", "Spain", "Italy", "Germany", "France", "Netherlands", "Portugal",
  "Scotland", "Ukraine", "Belgium", "Switzerland", "Turkey", "Greece",
  "Austria", "Denmark", "Norway", "Sweden", "Poland", "Czech Republic"
];

// === Завтрашний диапазон по Киеву ===
function getKievDateRangeForTomorrow() {
  const tz = "Europe/Kiev";
  const tomorrowStart = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const from = tomorrowStart.toISOString().split('T')[0];
  const to = tomorrowEnd.toISOString().split('T')[0];

  return { from, to };
}

function getRandomOdds() {
  const odds = [1.5, 1.7, 1.9, 2.0, 2.3, 2.5, 3.0, 3.5];
  return odds[Math.floor(Math.random() * odds.length)].toFixed(2);
}

function formatTournament(match) {
  const date = new Date(match.fixture.date);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(2);
  const league = TOURNAMENT_TRANSLATIONS[match.league.name] || match.league.name;
  return `Футбол.${d}.${m}.${y} ${league}`;
}

// === Получение матчей на завтра ===
async function fetchMatches() {
  try {
    const { from, to } = getKievDateRangeForTomorrow();
    const res = await axios.get(FIXTURES_URL, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY },
      params: {
        from,
        to,
        timezone: 'Europe/Kiev' // важно для корректной даты
      }
    });

    let matches = res.data.response || [];
    matches = matches.filter(m =>
      EUROPEAN_LEAGUES.includes(m.league.name) ||
      EUROPEAN_COUNTRIES.includes(m.league.country)
    );

    console.log(`🎯 Найдено европейских матчей с ${from} по ${to}: ${matches.length}`);
    return matches.slice(0, 40);
  } catch (e) {
    console.error('Ошибка загрузки матчей:', e.message);
    return [];
  }
}

// === Получение коэффициентов ===
async function fetchOdds(fixtureId) {
  try {
    const res = await axios.get(ODDS_URL, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY },
      params: { fixture: fixtureId, timezone: 'Europe/Kiev' }
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

// === Генерация прогнозов через OpenAI ===
async function generateAllPredictions(matches) {
  const matchesList = matches.map((m, i) => `${i + 1}. ${m.teams.home.name} vs ${m.teams.away.name}`).join("\n");

  const prompt = `
Ты спортивный аналитик.
Для каждого матча придумай краткий прогноз на русском языке в формате ставок.
Примеры:
- Победа {команда}
- Ничья
- Двойной шанс {команда} или ничья
- Тотал больше 2.5
- Тотал меньше 2.5
- Фора -1.5 на {команда}
- Фора +1.5 на {команда}

Требования:
1) Используй разные типы исходов, а не только победу.
2) Ответ строго в формате:
1. прогноз
2. прогноз
...

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

// === Сохранение черновиков в MongoDB ===
async function saveToDraft(predictions) {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('predictionsDB');
  const draftColl = db.collection('draft_predictions');

  await draftColl.deleteMany({});
  if (predictions.length > 0) await draftColl.insertMany(predictions);

  await client.close();
  console.log(`💾 Черновики сохранены: ${predictions.length}`);
}

// === Основная функция генерации ===
async function generatePredictions() {
  const matches = await fetchMatches();
  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    return [];
  }

  const matchesWithOdds = [];
  for (const match of matches) {
    const odds = await fetchOdds(match.fixture.id);
    matchesWithOdds.push({ ...match, odds });
  }

  const allTeams = matchesWithOdds.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);
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

  await saveToDraft(predictions);
  return predictions;
}

// === Запуск при вызове напрямую ===
if (require.main === module) {
  generatePredictions()
    .then(() => console.log('✅ Генерация завершена.'))
    .catch(err => console.error('❌ Ошибка генерации:', err));
}

module.exports = { generatePredictions };
