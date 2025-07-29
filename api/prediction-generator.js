const axios = require('axios');
const OpenAI = require('openai');
const { MongoClient } = require('mongodb');
const { getTranslatedTeams } = require('./translate-teams');

// === ENV / API KEYS ===
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '548e45339f74b3a936d49be6786124b0';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true';

// Флаг: фильтровать только Европу (по умолчанию ВКЛ)
const ONLY_EUROPE = process.env.ONLY_EUROPE !== 'false';

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// === API URLs ===
const FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const ODDS_URL = 'https://v3.football.api-sports.io/odds';

// === Переводы популярных турниров (для заголовка карточки) ===
const TOURNAMENT_TRANSLATIONS = {
  'UEFA Champions League': 'Лига Чемпионов УЕФА',
  'UEFA Europa League': 'Лига Европы УЕФА',
  'UEFA Europa Conference League': 'Лига Конференций УЕФА',
  'Premier League': 'Премьер-Лига Англии',
  'La Liga': 'Ла Лига Испании',
  'Serie A': 'Серия А Италии',
  'Bundesliga': 'Бундеслига Германии',
  'Ligue 1': 'Лига 1 Франции',
  Eredivisie: 'Эредивизи Нидерландов',
  'Primeira Liga': 'Примейра Лига Португалии'
};

// === Европа: расширенный список стран/меток и правила ===
const EUROPEAN_COUNTRIES = [
  // UK & Ireland
  'England', 'Scotland', 'Wales', 'Northern Ireland', 'Ireland',

  // Топ-5
  'Spain', 'Italy', 'Germany', 'France', 'Netherlands', 'Portugal',

  // Другая Европа
  'Belgium', 'Switzerland', 'Austria', 'Turkey', 'Greece', 'Denmark',
  'Norway', 'Sweden', 'Poland', 'Czech Republic', 'Czechia', 'Croatia',
  'Serbia', 'Romania', 'Hungary', 'Slovakia', 'Slovenia', 'Bulgaria',
  'Bosnia and Herzegovina', 'Bosnia & Herzegovina', 'North Macedonia',
  'Albania', 'Kosovo', 'Montenegro', 'Moldova', 'Ukraine', 'Belarus',
  'Lithuania', 'Latvia', 'Estonia', 'Finland', 'Iceland', 'Georgia',
  'Armenia', 'Azerbaijan', 'Cyprus', 'Malta', 'Luxembourg',
  'Liechtenstein', 'Andorra', 'San Marino', 'Monaco', 'Gibraltar',
  'Faroe Islands',

  // Вне ЕС, но часто участвуют в еврокубках/УЕФА
  'Israel', 'Kazakhstan', 'Russia',

  // Метки из API для еврокубков
  'International', 'World', 'Europe'
];

const UEFA_KEYWORDS = [
  'uefa', 'euro', 'europa', 'conference', 'champions league',
  'european championship', 'qualifying', 'qualification'
];

const norm = (s) => (s || '').toLowerCase().normalize('NFKD');

function isEuropeanMatch(m) {
  const country = norm(m.league?.country);
  const league = norm(m.league?.name);

  // Явная европейская страна
  if (EUROPEAN_COUNTRIES.map(norm).includes(country)) return true;

  // Еврокубки, которые API маркирует как International/World/Europe
  if (
    (country === 'international' || country === 'world' || country === 'europe') &&
    UEFA_KEYWORDS.some((k) => league.includes(k))
  ) {
    return true;
  }

  return false;
}

// === Завтрашний диапазон дат по Киеву ===
function getKievDateRangeForTomorrow() {
  const tz = 'Europe/Kiev';
  const kievNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));

  const start = new Date(kievNow);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const from = start.toISOString().split('T')[0]; // YYYY-MM-DD
  const to = end.toISOString().split('T')[0];     // YYYY-MM-DD (эксклюзив верхняя граница)
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

// === Безопасный GET с логами ===
async function safeGet(url, params) {
  try {
    const res = await axios.get(url, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY },
      params
    });
    const list = res.data?.response || [];
    console.log(`🔎 GET ${url} ok | items=${list.length} | params=${JSON.stringify(params)}`);
    return list;
  } catch (e) {
    console.error(
      `❌ GET ${url} fail | status=${e.response?.status} | data=${JSON.stringify(e.response?.data) || e.message}`
    );
    return [];
  }
}

// === Получение матчей на завтра (с многоступенчатым фолбэком) ===
async function fetchMatches(maxCount = 40) {
  const tz = 'Europe/Kiev';
  const { from, to } = getKievDateRangeForTomorrow();

  // 1) Пытаемся строго "завтра" через ?date= + timezone
  let all = await safeGet(FIXTURES_URL, { date: from, timezone: tz });

  // 2) Если пусто — пробуем диапазон ?from=...&to=... + timezone
  if (all.length === 0) {
    all = await safeGet(FIXTURES_URL, { from, to, timezone: tz });
  }

  // 3) Если всё ещё пусто — фолбэк: ближайшие next=200 и фильтруем сами по завтрашнему диапазону
  if (all.length === 0) {
    const next = await safeGet(FIXTURES_URL, { next: 200, timezone: tz });
    if (next.length > 0) {
      const zStart = new Date(`${from}T00:00:00.000Z`);
      const zEnd = new Date(`${to}T00:00:00.000Z`);
      all = next.filter((m) => {
        const dt = new Date(m.fixture.date); // UTC от API
        return dt >= zStart && dt < zEnd;
      });
      console.log(`🧩 Фолбэк next=200 → отфильтровано на завтра: ${all.length}`);
    }
  }

  const leaguesList = [...new Set(all.map((m) => `${m.league?.country} — ${m.league?.name}`))].sort();
  console.log(`📅 Завтра (Киев): ${from} | Диапазон: ${from} → ${to}`);
  console.log(`📊 Всего матчей получено: ${all.length}`);
  console.log(`🏷️ Лиги/страны (образцы):\n  - ${leaguesList.slice(0, 50).join('\n  - ')}`);

  let selected = all;

  if (ONLY_EUROPE) {
    selected = all.filter(isEuropeanMatch);
    console.log(`🎯 После фильтра Европа: ${selected.length}`);
  } else {
    console.log('🟡 Фильтр Европы отключён (ONLY_EUROPE=false): берём все матчи.');
  }

  // Если европейских мало — добираем любыми до лимита
  const minTarget = Math.min(20, maxCount);
  if (selected.length < minTarget) {
    const map = new Map(selected.map((m) => [m.fixture.id, m]));
    for (const m of all) {
      if (map.size >= maxCount) break;
      if (!map.has(m.fixture.id)) map.set(m.fixture.id, m);
    }
    selected = [...map.values()];
    console.log(`🔁 Добрали до: ${selected.length}`);
  }

  const final = selected.slice(0, maxCount);
  console.log(`✅ Итого к генерации: ${final.length}`);
  return final;
}

// === Получение коэффициентов ===
async function fetchOdds(fixtureId) {
  try {
    const data = await safeGet(ODDS_URL, { fixture: fixtureId, timezone: 'Europe/Kiev' });
    if (data.length > 0 && data[0].bookmakers?.length > 0) {
      for (const bookmaker of data[0].bookmakers) {
        const odd = bookmaker.bets?.[0]?.values?.[0]?.odd;
        if (odd) return odd;
      }
    }
    return getRandomOdds();
  } catch (e) {
    console.error(`Ошибка коэффициента для матча ${fixtureId}:`, e.message);
    return getRandomOdds();
  }
}

// === Генерация прогнозов через OpenAI ===
async function generateAllPredictions(matches) {
  const matchesList = matches
    .map((m, i) => `${i + 1}. ${m.teams.home.name} vs ${m.teams.away.name}`)
    .join('\n');

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
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });

    const resultText = response.choices?.[0]?.message?.content?.trim() || '';
    const list = resultText
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean);
    return list;
  } catch (e) {
    console.error('Ошибка AI-прогноза:', e.message);
    return matches.map((m) => `Победа ${m.teams.home.name}`);
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
  const matches = await fetchMatches(40);
  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    await saveToDraft([]); // очистим черновики, чтобы не вводить в заблуждение
    return [];
  }

  const matchesWithOdds = [];
  for (const match of matches) {
    const odds = await fetchOdds(match.fixture.id);
    matchesWithOdds.push({ ...match, odds });
  }

  // Переводы команд
  const allTeams = matchesWithOdds.flatMap((m) => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // Прогнозы ИИ
  const aiPredictions = await generateAllPredictions(matchesWithOdds);

  // Формирование карточек
  const predictions = matchesWithOdds.map((match, i) => ({
    id: Date.now() + i,
    tournament: formatTournament(match),
    team1: teamTranslations[match.teams.home.name] || match.teams.home.name,
    logo1: match.teams.home.logo,
    team2: teamTranslations[match.teams.away.name] || match.teams.away.name,
    logo2: match.teams.away.logo,
    odds: match.odds,
    predictionText:
      aiPredictions[i] ||
      `Победа ${teamTranslations[match.teams.home.name] || match.teams.home.name}`
  }));

  await saveToDraft(predictions);
  return predictions;
}

// === Запуск напрямую ===
if (require.main === module) {
  generatePredictions()
    .then(() => console.log('✅ Генерация завершена.'))
    .catch((err) => console.error('❌ Ошибка генерации:', err));
}

module.exports = { generatePredictions };
