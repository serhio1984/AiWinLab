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

const lc = s => (s || '').toLowerCase().normalize('NFKD');

function isEuropeanMatch(m) {
  const country = lc(m.league?.country);
  const league = lc(m.league?.name);
  if (EUROPEAN_COUNTRIES.map(lc).includes(country)) return true;
  if ((country === 'international' || country === 'world' || country === 'europe') &&
      UEFA_KEYWORDS.some(k => league.includes(k))) return true;
  return false;
}

// === Завтрашний диапазон по Киеву ===
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

// === Матчи на завтра ===
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
      console.log(`🧩 Фолбэк next=200 → отфильтровано: ${all.length}`);
    }
  }

  let selected = all;
  if (ONLY_EUROPE) {
    selected = all.filter(isEuropeanMatch);
    console.log(`🎯 Европа: ${selected.length}`);
  } else {
    console.log('🟡 Фильтр Европы отключён');
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
  const priorityOf = m => (isEuroCup(m) ? 1 : isFriendly(m) ? 2 : isTopLeague(m) ? 3 : 4);

  selected.sort((a, b) => {
    const pa = priorityOf(a), pb = priorityOf(b);
    if (pa !== pb) return pa - pb;
    return new Date(a.fixture.date) - new Date(b.fixture.date);
  });

  if (selected.length < Math.min(20, maxCount)) {
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
  }

  const final = selected.slice(0, maxCount);
  console.log(`✅ Итого к генерации: ${final.length}`);
  return final;
}

// ===================== ТЕКСТ / САНИТАЙЗЕР ======================
function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/[–—−]/g, '-') // длинные тире → дефис
    .replace(/\s+/g, ' ')
    .trim();
}

// убираем хвосты: "в/на матче...", "против...", "с...", точки
function stripContext(raw) {
  return (raw || '')
    .replace(/\s*(?:в|на)\s+(?:матче|игре)\b[^]*$/i, '')
    .replace(/\s*против\s+.+$/i, '')
    .replace(/\s*с\s+.+$/i, '')
    .replace(/[\.\u3002]+$/,'')
    .trim();
}

/**
 * Приводим прогноз к одному из разрешённых форматов:
 * - "Победа <Команда>"
 * - "Тотал больше N"
 * - "Тотал меньше N"
 * - "Обе забьют-да" / "Обе забьют-нет"
 * - "<Команда> Фора +/-N"
 * Если встречен "двойной шанс" → заменяем на "Победа <та команда>".
 * Если встречена "Ничья" (на всякий) → заменяем на "Победа <Команда 1>".
 */
function sanitizePredictionText(text, homeName, awayName) {
  if (!text) return text;
  const original = text.trim();
  const core = stripContext(original);
  const t = normalize(core);
  const home = normalize(homeName);
  const away = normalize(awayName);

  // Двойной шанс → Победа {team}
  let m = t.match(/^двойной\s+шанс[:\-\s]?(.+?)\s+или\s+ничья$/i) || t.match(/^ничья\s+или\s+(.+?)$/i) || t.match(/^(.+?)\s+или\s+ничья$/i);
  if (m) {
    const who = m[1].trim();
    return `Победа ${who}`;
  }
  m = t.match(/^(.+?)\s+не\s+проиграет$/i);
  if (m) return `Победа ${m[1].trim()}`;

  // Обе забьют-да/нет
  m = t.match(/^обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i);
  if (m) return `Обе забьют-${m[1].toLowerCase()}`;

  // Тоталы
  m = core.match(/Тотал\s+больше\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) return `Тотал больше ${m[1].replace(',', '.')}`;
  m = core.match(/Тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) return `Тотал меньше ${m[1].replace(',', '.')}`;
  m = core.match(/\bТБ\s*([0-9]+(?:[.,][0-9]+)?)\b/i);
  if (m) return `Тотал больше ${m[1].replace(',', '.')}`;
  m = core.match(/\bТМ\s*([0-9]+(?:[.,][0-9]+)?)\b/i);
  if (m) return `Тотал меньше ${m[1].replace(',', '.')}`;

  // Победа <Команда>
  m = core.match(/^Победа\s+(.+)$/i);
  if (m) return `Победа ${m[1].trim()}`;
  m = core.match(/^(.+?)\s+Победа$/i);
  if (m) return `Победа ${m[1].trim()}`;

  // Фора: "Фора +1 на Команда" → "Команда Фора +1"
  m = core.match(/^Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)\s*на\s+(.+)$/i);
  if (m) return `${m[2].trim()} Фора ${m[1].replace(',', '.')}`;
  // "<Команда> Фора n" — уже целевой формат
  m = core.match(/^(.+?)\s+Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return `${m[1].trim()} Фора ${m[2].replace(',', '.')}`;

  // На всякий — "Ничья" → Победа Команда 1
  if (/^ничья$/i.test(core)) return `Победа ${homeName}`;

  // По умолчанию — Победа хозяев
  return `Победа ${homeName}`;
}

// ===================== ОПРЕДЕЛЕНИЕ РЫНКА (под форматы выше) ======================
function detectMarket(predictionText, homeName, awayName) {
  const raw = predictionText || '';
  const core = stripContext(raw);
  const t = normalize(core);
  const home = normalize(homeName);
  const away = normalize(awayName);

  // Победа Команда
  let m = core.match(/^Победа\s+(.+)$/i);
  if (m) {
    const who = normalize(m[1]);
    if (who.includes(home)) return { market: '1X2', outcome: '1' };
    if (who.includes(away)) return { market: '1X2', outcome: '2' };
    // если не смогли — по умолчанию хозяева
    return { market: '1X2', outcome: '1' };
  }

  // Обе забьют-да/нет
  m = t.match(/^обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i);
  if (m) return { market: 'Both Teams To Score', outcome: m[1].toLowerCase() === 'да' ? 'Yes' : 'No' };

  // Тоталы
  m = core.match(/^Тотал\s+больше\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return { market: 'Total Goals', outcome: `Over ${m[1].replace(',', '.')}` };
  m = core.match(/^Тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return { market: 'Total Goals', outcome: `Under ${m[1].replace(',', '.')}` };

  // Фора "<Команда> Фора n"
  m = core.match(/^(.+?)\s+Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) {
    const who = normalize(m[1]);
    const sign = m[2].replace(',', '.');
    const side = who.includes(home) ? 'home' : who.includes(away) ? 'away' : 'home';
    return { market: 'Handicap', outcome: `${side} ${sign}` };
  }

  // По умолчанию — Победа хозяев
  return { market: '1X2', outcome: '1' };
}

// ================== Приоритет Favbet ==========================
function isFavbet(name = '') {
  const n = String(name).toLowerCase();
  return n.includes('fav') || n.includes('favbet') || n.includes('fav bet');
}

function pickOddFromBook(book, wantedMarket, wantedOutcome) {
  const bets = book.bets || [];
  const marketAliases = {
    '1X2': ['Match Winner', '1X2', 'Full Time Result'],
    'Both Teams To Score': ['Both Teams Score','Both Teams to Score','Both Teams To Score'],
    'Total Goals': ['Over/Under','Total Goals'],
    'Handicap': ['Asian Handicap','Handicap','Spread']
  };
  const targets = marketAliases[wantedMarket] || [wantedMarket];

  for (const bet of bets) {
    if (!targets.some(alias => String(bet.name).toLowerCase() === String(alias).toLowerCase())) continue;
    const values = bet.values || [];

    for (const v of values) {
      const valName = String(v.value || v.handicap || '').replace(',', '.');
      const odd = v.odd;

      switch (wantedMarket) {
        case '1X2':
          if ((wantedOutcome === '1' && (/^(1|Home)$/i.test(valName))) ||
              (wantedOutcome === '2' && (/^(2|Away)$/i.test(valName))) ||
              (wantedOutcome === 'X' && (/^(X|Draw)$/i.test(valName)))) {
            return odd;
          }
          break;

        case 'Both Teams To Score':
          if (/^yes$/i.test(valName) && wantedOutcome === 'Yes') return odd;
          if (/^no$/i.test(valName)  && wantedOutcome === 'No')  return odd;
          break;

        case 'Total Goals': {
          const over = wantedOutcome.startsWith('Over ');
          const num = wantedOutcome.split(' ')[1];
          if (over && (/Over/i.test(valName) && valName.includes(num))) return odd;
          if (!over && (/Under/i.test(valName) && valName.includes(num))) return odd;
          break;
        }

        case 'Handicap': {
          const targetH = wantedOutcome.split(' ')[1]; // "+1.0"
          if (valName && (valName === targetH || valName === targetH.replace(/\.0$/, '') || targetH.includes(valName))) {
            return odd;
          }
          break;
        }
      }
    }
  }
  return null;
}

async function fetchOddsForPrediction(fixtureId, predictionText, homeName, awayName) {
  const data = await safeGet(ODDS_URL, { fixture: fixtureId, timezone: 'Europe/Kiev' });
  if (!data?.length) return getRandomOdds();

  const { market, outcome } = detectMarket(predictionText, homeName, awayName);
  const pack = data[0];
  const books = pack.bookmakers || [];

  // 1) Favbet
  const fav = books.find(b => isFavbet(b.name));
  if (fav) {
    const odd = pickOddFromBook(fav, market, outcome);
    if (odd) return Number(odd).toFixed(2);
  }

  // 2) Любой другой букер — по нужному рынку
  for (const book of books) {
    const odd = pickOddFromBook(book, market, outcome);
    if (odd) return Number(odd).toFixed(2);
  }

  // 3) Не нашли — фолбэк
  return getRandomOdds();
}

// === Генерация прогнозов (Только разрешённые форматы) ===
async function generateAllPredictions(matches) {
  const matchesList = matches
    .map((m, i) => `${i + 1}. ${m.teams.home.name} vs ${m.teams.away.name}`)
    .join('\n');

  const prompt = `
Ты спортивный аналитик.
СГЕНЕРИРУЙ по одному прогнозу на каждый матч СТРОГО в одном из разрешённых форматов (русский язык):

ДОПУСТИМЫЕ ШАБЛОНЫ (ровно одна строка на матч, без дополнительных слов и точек):
1) "Победа <Команда>"
2) "Тотал больше <число>"
3) "Тотал меньше <число>"
4) "Обе забьют-да"
5) "Обе забьют-нет"
6) "<Команда> Фора <+/-число>"

ЗАПРЕЩЕНО:
- Любые хвосты ("в матче ...", "против ...", "с ..."), двоеточия, точки.
- Любые другие типы, включая "Двойной шанс" и "Ничья".

Важно:
- Разнообразь типы исходов между матчами.
- Запрещено указывать коэффициенты.

Список матчей:
${matchesList}
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });

    let lines = (response.choices?.[0]?.message?.content || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.replace(/^\d+\.\s*/, '')); // на всякий отрежем нумерацию

    return lines;
  } catch (e) {
    console.error('Ошибка AI-прогноза:', e.message);
    // Фолбэк — Победа хозяев
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

  // 1) Текст ИИ по строгому ТЗ
  let aiPredictions = await generateAllPredictions(matches);

  // 2) Санитайзер под нужные форматы + запреты
  aiPredictions = aiPredictions.map((txt, i) =>
    sanitizePredictionText(txt, matches[i].teams.home.name, matches[i].teams.away.name)
  );

  // 3) Коэффициенты под каждый текст
  const cards = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const predText = aiPredictions[i] || `Победа ${match.teams.home.name}`;
    const odd = await fetchOddsForPrediction(
      match.fixture.id,
      predText,
      match.teams.home.name,
      match.teams.away.name
    );
    cards.push({ match, odd, predText });
  }

  // 4) Переводы команд для карточек
  const allTeams = matches.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // 5) Формирование карточек
  const predictions = cards.map(({ match, odd, predText }, i) => ({
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
