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
  'England','Scotland','Wales','Northern Ireland','Ireland',
  'Spain','Italy','Germany','France','Netherlands','Portugal',
  'Belgium','Switzerland','Austria','Turkey','Greece','Denmark',
  'Norway','Sweden','Poland','Czech Republic','Czechia','Croatia',
  'Serbia','Romania','Hungary','Slovakia','Slovenia','Bulgaria',
  'Bosnia and Herzegovina','Bosnia & Herzegovina','North Macedonia',
  'Albania','Kosovo','Montenegro','Moldova','Ukraine','Belarus',
  'Lithuania','Latvia','Estonia','Finland','Iceland','Georgia',
  'Armenia','Azerbaijan','Cyprus','Malta','Luxembourg',
  'Liechtenstein','Andorra','San Marino','Monaco','Gibraltar',
  'Faroe Islands','Israel','Kazakhstan','Russia','International','World','Europe'
];

const UEFA_KEYWORDS = [
  'uefa','euro','europa','conference','champions league',
  'european championship','qualifying','qualification'
];

const norm = s => (s || '').toLowerCase().normalize('NFKD');

function isEuropeanMatch(m) {
  const country = norm(m.league?.country);
  const league = norm(m.league?.name);
  if (EUROPEAN_COUNTRIES.map(norm).includes(country)) return true;
  if ((country === 'international' || country === 'world' || country === 'europe') &&
      UEFA_KEYWORDS.some(k => league.includes(k))) return true;
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
  const from = start.toISOString().split('T')[0];
  const to = end.toISOString().split('T')[0];
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

  let all = await safeGet(FIXTURES_URL, { date: from, timezone: tz });
  if (all.length === 0) all = await safeGet(FIXTURES_URL, { from, to, timezone: tz });
  if (all.length === 0) {
    const next = await safeGet(FIXTURES_URL, { next: 200, timezone: tz });
    if (next.length > 0) {
      const zStart = new Date(`${from}T00:00:00.000Z`);
      const zEnd = new Date(`${to}T00:00:00.000Z`);
      all = next.filter(m => {
        const dt = new Date(m.fixture.date);
        return dt >= zStart && dt < zEnd;
      });
      console.log(`🧩 Фолбэк next=200 → отфильтровано на завтра: ${all.length}`);
    }
  }

  const leaguesList = [...new Set(all.map(m => `${m.league?.country} — ${m.league?.name}`))].sort();
  console.log(`📅 Завтра (Киев): ${from} | Диапазон: ${from} → ${to}`);
  console.log(`📊 Всего матчей получено: ${all.length}`);
  console.log(`🏷️ Лиги/страны (образцы):\n  - ${leaguesList.slice(0, 80).join('\n  - ')}`);

  let selected = all;
  if (ONLY_EUROPE) {
    selected = all.filter(isEuropeanMatch);
    console.log(`🎯 После фильтра Европа: ${selected.length}`);
  } else {
    console.log('🟡 Фильтр Европы отключён (ONLY_EUROPE=false): берём все матчи.');
  }

  // Приоритезация
  const EURO_REGEX = /(uefa|champions league|europa|conference|european championship|qualifying|qualification)/i;
  const FRIENDLY_REGEX = /(friendly|friendlies|club friendlies|товарищеск)/i;
  const TOP_LEAGUES = new Set([
    'Premier League','La Liga','Serie A','Bundesliga','Ligue 1','Eredivisie','Primeira Liga',
    'Scottish Premiership','Ukrainian Premier League','Belgian Pro League','Swiss Super League',
    'Austrian Bundesliga','Super Lig','Super League','Danish Superliga','Eliteserien','Allsvenskan',
    'Ekstraklasa','Czech Liga','1. HNL','HNL','NB I','SuperLiga','Liga I'
  ]);

  const leagueName = m => String(m.league?.name || '');
  const leagueType = m => String(m.league?.type || '');
  const isEuroCup = m => {
    const name = leagueName(m);
    const country = String(m.league?.country || '');
    return EURO_REGEX.test(name) || (/International|World|Europe/i.test(country) && EURO_REGEX.test(name));
  };
  const isFriendly = m => FRIENDLY_REGEX.test(leagueName(m)) || /friendly/i.test(leagueType(m));
  const isTopLeague = m => TOP_LEAGUES.has(leagueName(m));

  const priorityOf = m => {
    if (isEuroCup(m)) return 1;
    if (isFriendly(m)) return 2;
    if (isTopLeague(m)) return 3;
    return 4;
  };

  selected.sort((a, b) => {
    const pa = priorityOf(a);
    const pb = priorityOf(b);
    if (pa !== pb) return pa - pb;
    return new Date(a.fixture.date) - new Date(b.fixture.date);
  });

  const minTarget = Math.min(20, maxCount);
  if (selected.length < minTarget) {
    const map = new Map(selected.map(m => [m.fixture.id, m]));
    for (const m of all) {
      if (map.size >= maxCount) break;
      if (!map.has(m.fixture.id)) map.set(m.fixture.id, m);
    }
    selected = [...map.values()].sort((a, b) => {
      const pa = priorityOf(a), pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      return new Date(a.fixture.date) - new Date(b.fixture.date);
    });
    console.log(`🔁 Добрали до: ${selected.length}`);
  }

  const final = selected.slice(0, maxCount);
  console.log(`✅ Итого к генерации (после приоритета): ${final.length}`);
  return final;
}

// ===================== ОПРЕДЕЛЕНИЕ РЫНКА ДЛЯ ПРОГНОЗА ======================
function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectMarket(predictionText, homeName, awayName) {
  const t = normalize(predictionText);

  // Победа / ничья
  if (t.startsWith('победа ')) {
    if (t.includes(normalize(homeName))) return { market: '1X2', outcome: '1' };
    if (t.includes(normalize(awayName))) return { market: '1X2', outcome: '2' };
    return { market: '1X2', outcome: '1' }; // по умолчанию дом
  }
  if (t === 'ничья') return { market: '1X2', outcome: 'X' };

  // Двойной шанс: "{team} или ничья" / "ничья или {team}"
  const home = normalize(homeName), away = normalize(awayName);
  if ((t.includes(home) && t.includes('или ничья')) || (t.startsWith('ничья или') && t.includes(home))) {
    return { market: 'Double Chance', outcome: '1X' };
  }
  if ((t.includes(away) && t.includes('или ничья')) || (t.startsWith('ничья или') && t.includes(away))) {
    return { market: 'Double Chance', outcome: 'X2' };
  }
  // "{team} не проиграет"
  if (t.endsWith('не проиграет')) {
    if (t.includes(home)) return { market: 'Double Chance', outcome: '1X' };
    if (t.includes(away)) return { market: 'Double Chance', outcome: 'X2' };
  }

  // Обе забьют (да/нет)
  const mBTTS = t.match(/^обе(?:\s+команды)?\s+забьют(?:\s*[-:() ]*\s*(да|нет))?$/i);
  if (mBTTS) {
    const yn = (mBTTS[1] || 'да').toLowerCase();
    return { market: 'Both Teams To Score', outcome: yn === 'да' ? 'Yes' : 'No' };
  }

  // Тоталы
  const mOver = t.match(/^тотал\s+больше\s+([0-9]+(?:[.,][0-9]+)?)$/i) || t.match(/^тб\s*([0-9]+(?:[.,][0-9]+)?)$/i);
  if (mOver) return { market: 'Total Goals', outcome: `Over ${mOver[1].replace(',', '.')}` };
  const mUnder = t.match(/^тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)$/i) || t.match(/^тм\s*([0-9]+(?:[.,][0-9]+)?)$/i);
  if (mUnder) return { market: 'Total Goals', outcome: `Under ${mUnder[1].replace(',', '.')}` };

  // Фора (оставим фолбэком на 1X2 если не найдём)
  const mHcap = t.match(/^фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)\s*на\s+(.+)$/i);
  if (mHcap) {
    const sign = mHcap[1].replace(',', '.');
    const who = normalize(mHcap[2]);
    const side = who.includes(home) ? 'home' : who.includes(away) ? 'away' : 'home';
    return { market: 'Handicap', outcome: `${side} ${sign}` }; // попытаемся позже
  }

  // Ничего не распознали — возьмём 1X2 дом/ничья/гость по эвристике
  return { market: '1X2', outcome: '1' };
}

// ================== ПРИОРИТЕТ ПО БУКМЕКЕРУ: FAVBET ==========================
function isFavbet(name = '') {
  const n = String(name).toLowerCase();
  return n.includes('fav') || n.includes('favbet') || n.includes('fav bet');
}

// Найти коэффициент в структуре API-Football для нужного market/outcome
function pickOddFromBook(book, wantedMarket, wantedOutcome) {
  const bets = book.bets || [];
  // Нормализуем названия рынков в API-Football к нашим
  const marketAliases = {
    '1X2': ['Match Winner', '1X2', 'Full Time Result'],
    'Double Chance': ['Double Chance'],
    'Both Teams To Score': ['Both Teams Score', 'Both Teams to Score', 'Both Teams To Score'],
    'Total Goals': ['Over/Under', 'Total Goals'],
    'Handicap': ['Asian Handicap', 'Handicap']
  };

  const targets = marketAliases[wantedMarket] || [wantedMarket];
  for (const bet of bets) {
    if (!targets.some(alias => String(bet.name).toLowerCase() === String(alias).toLowerCase())) continue;

    // Поиск нужного исхода
    const values = bet.values || [];
    // Приводим подписи исходов к понятным формам
    for (const v of values) {
      const valName = String(v.value || v.handicap || '').replace(',', '.');
      const valOdd = v.odd;
      // Сопоставление по рынку
      switch (wantedMarket) {
        case '1X2':
          if (['1','2','X','Home','Away','Draw'].includes(valName)) {
            if ((wantedOutcome === '1' && (valName === '1' || valName === 'Home')) ||
                (wantedOutcome === '2' && (valName === '2' || valName === 'Away')) ||
                (wantedOutcome === 'X' && (valName.toLowerCase() === 'x' || valName === 'Draw'))) {
              return valOdd;
            }
          }
          break;
        case 'Double Chance':
          if (['1X','X2','12'].includes(valName)) {
            if (valName === wantedOutcome) return valOdd;
          }
          break;
        case 'Both Teams To Score':
          if (/yes|no/i.test(valName)) {
            if ((wantedOutcome === 'Yes' && /yes/i.test(valName)) ||
                (wantedOutcome === 'No'  && /no/i.test(valName))) {
              return valOdd;
            }
          }
          break;
        case 'Total Goals': {
          // Ищем Over/Under N
          const over = wantedOutcome.startsWith('Over ');
          const num = wantedOutcome.split(' ')[1];
          if (over && (/Over/i.test(valName) && valName.includes(num))) return valOdd;
          if (!over && (/Under/i.test(valName) && valName.includes(num))) return valOdd;
          break;
        }
        case 'Handicap': {
          // Пробуем exact match по handicap
          if (valName && wantedOutcome.toLowerCase().includes(valName.toLowerCase())) return valOdd;
          break;
        }
      }
    }
  }
  return null;
}

// Тянем коэффициент приоритетно от Favbet → иначе любой букер → иначе случайный
async function fetchOddsForPrediction(fixtureId, predictionText, homeName, awayName) {
  const data = await safeGet(ODDS_URL, { fixture: fixtureId, timezone: 'Europe/Kiev' });
  if (!data?.length) return getRandomOdds();

  const { market, outcome } = detectMarket(predictionText, homeName, awayName);

  // В некоторых ответах несколько «пакетов» по рынкам; берём первый
  const pack = data[0];
  const books = pack.bookmakers || [];

  // 1) Favbet
  let fav = books.find(b => isFavbet(b.name));
  if (fav) {
    const odd = pickOddFromBook(fav, market, outcome);
    if (odd) return Number(odd).toFixed(2);
  }

  // 2) Любой другой букер — по нужному рынку
  for (const book of books) {
    const odd = pickOddFromBook(book, market, outcome);
    if (odd) return Number(odd).toFixed(2);
  }

  // 3) Не нашли — оставляем случайный
  return getRandomOdds();
}

// === Генерация прогнозов через OpenAI (ТЕКСТ, без коэффициентов) ===
async function generateAllPredictions(matches) {
  const matchesList = matches
    .map((m, i) => `${i + 1}. ${m.teams.home.name} vs ${m.teams.away.name}`)
    .join('\n');

  const prompt = `
Ты спортивный аналитик.
Для каждого матча придумай краткий прогноз на русском языке в формате ставок.
ВАЖНО:
- Не используй одинаковый тип прогноза для всех матчей.
- Избегай повторяющихся шаблонов вроде "Победа команды".
- Примени разные типы ставок: тоталы, форы, ничьи, двойные шансы, обе забьют и т.д.
Примеры:
- Победа {команда}
- Ничья
- {команда} или ничья
- Двойной шанс {команда} или ничья
- Обе забьют-да / Обе забьют-нет
- Тотал больше 2.5 / Тотал меньше 2.5
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
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean);
    return list;
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
  const matches = await fetchMatches(40);
  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    await saveToDraft([]);
    return [];
  }

  // Переводы команд
  const allTeams = matches.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // Прогнозы ИИ (сначала текст!)
  const aiPredictions = await generateAllPredictions(matches);

  // Коэффициенты (Favbet приоритетно) — под каждый текст прогноза
  const withOdds = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const predText = aiPredictions[i] || `Победа ${match.teams.home.name}`;
    const odd = await fetchOddsForPrediction(
      match.fixture.id,
      predText,
      match.teams.home.name,
      match.teams.away.name
    );
    withOdds.push({ match, odd, predText });
  }

  // Формирование карточек
  const predictions = withOdds.map(({ match, odd, predText }, i) => ({
    id: Date.now() + i,
    tournament: formatTournament(match),
    team1: teamTranslations[match.teams.home.name] || match.teams.home.name,
    logo1: match.teams.home.logo,
    team2: teamTranslations[match.teams.away.name] || match.teams.away.name,
    logo2: match.teams.away.logo,
    odds: odd,
    predictionText: predText
  }));

  await saveToDraft(predictions);
  return predictions;
}

// === Запуск напрямую ===
if (require.main === module) {
  generatePredictions()
    .then(() => console.log('✅ Генерация завершена.'))
    .catch(err => console.error('❌ Ошибка генерации:', err));
}

module.exports = { generatePredictions };
