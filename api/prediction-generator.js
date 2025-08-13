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

// === Переводы лиг с учётом страны (КЛЮЧ: `${country}|${league}`) ===
const LEAGUE_TRANSLATIONS_BY_COUNTRY = {
  'International|UEFA Champions League': 'Лига Чемпионов УЕФА',
  'International|UEFA Europa League': 'Лига Европы УЕФА',
  'International|UEFA Europa Conference League': 'Лига Конференций УЕФА',
  'Europe|UEFA Champions League': 'Лига Чемпионов УЕФА',
  'Europe|UEFA Europa League': 'Лига Европы УЕФА',
  'Europe|UEFA Europa Conference League': 'Лига Конференций УЕФА',
  'World|UEFA Champions League': 'Лига Чемпионов УЕФА',
  'World|UEFA Europa League': 'Лига Европы УЕФА',
  'World|UEFA Europa Conference League': 'Лига Конференций УЕФА',

  'England|Premier League': 'Премьер-Лига Англии',
  'Spain|La Liga': 'Ла Лига Испании',
  'Italy|Serie A': 'Серия А Италии',
  'Germany|Bundesliga': 'Бундеслига Германии',
  'France|Ligue 1': 'Лига 1 Франции',
  'Netherlands|Eredivisie': 'Эредивизи Нидерландов',
  'Portugal|Primeira Liga': 'Примейра Лига Португалии',

  'Scotland|Premiership': 'Шотландская Премьер-Лига',
  'Russia|Premier League': 'Премьер-Лига России',
  'Ukraine|Premier League': 'Премьер-Лига Украины',
  'Belgium|Pro League': 'Про Лига Бельгии',
  'Austria|Bundesliga': 'Бундеслига Австрии',
  'Switzerland|Super League': 'Суперлига Швейцарии',
  'Turkey|Super Lig': 'Супер Лиг Турции',
  'Greece|Super League 1': 'Суперлига Греции',
  'Poland|Ekstraklasa': 'Экстракляса Польши'
};

// Еврокубки — детектор по имени/стране
const UEFA_KEYWORDS = [
  'uefa','euro','europa','conference','champions league',
  'european championship','qualifying','qualification'
];

const lc = s => (s || '').toLowerCase().normalize('NFKD');

function isEuropeanMatch(m) {
  const country = lc(m.league?.country);
  const league = lc(m.league?.name);
  const EUROPEAN_COUNTRIES = [
    'england','scotland','wales','northern ireland','ireland',
    'spain','italy','germany','france','netherlands','portugal',
    'belgium','switzerland','austria','turkey','greece','denmark',
    'norway','sweden','poland','czech republic','czechia','croatia',
    'serbia','romania','hungary','slovakia','slovenia','bulgaria',
    'bosnia and herzegovina','north macedonia','albania','kosovo',
    'montenegro','moldova','ukraine','belarus','lithuania','latvia',
    'estonia','finland','iceland','georgia','armenia','azerbaijan',
    'cyprus','malta','luxembourg','liechtenstein','andorra','san marino',
    'monaco','gibraltar','faroe islands','israel','kazakhstan','russia',
    'international','world','europe'
  ];
  if (EUROPEAN_COUNTRIES.includes(country)) return true;
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

function translateLeagueNameByCountry(leagueName, country) {
  const key = `${country}|${leagueName}`;
  if (LEAGUE_TRANSLATIONS_BY_COUNTRY[key]) return LEAGUE_TRANSLATIONS_BY_COUNTRY[key];
  // если нет точного перевода — возвращаем оригинал
  return leagueName;
}

function formatTournament(match) {
  const date = new Date(match.fixture.date);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(2);

  const leagueName = match.league.name || '';
  const country = match.league.country || '';

  // Перевод с учётом страны
  const leagueLabel = translateLeagueNameByCountry(leagueName, country);

  // Оставляем прежний формат строки (клиент заменит "Футбол" на страну)
  return `Футбол.${d}.${m}.${y} ${leagueLabel}`;
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

// === Получение матчей на завтра ===
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
 * Приводим прогноз к одному из разрешённых форматов.
 * Если «двойной шанс»/«не проиграет»/«ничья»/неясность — выбираем favoriteName.
 */
function sanitizePredictionText(text, homeName, awayName, favoriteName) {
  if (!text) return text;

  const original = text.trim();
  const core = stripContext(original);

  const t = normalize(core);
  const home = normalize(homeName);
  const away = normalize(awayName);

  // Двойной шанс → Победа команды (или фаворита)
  let m =
    t.match(/^двойной\s+шанс[:\-\s]*(.+?)\s+или\s+ничья$/i) ||
    t.match(/^ничья\s+или\s+(.+?)$/i) ||
    t.match(/^(.+?)\s+или\s+ничья$/i);
  if (m) {
    const who = normalize(m[1]);
    if (who.includes(home)) return `Победа ${homeName}`;
    if (who.includes(away)) return `Победа ${awayName}`;
    return `Победа ${favoriteName}`;
  }
  m = t.match(/^(.+?)\s+не\s+проиграет$/i);
  if (m) {
    const who = normalize(m[1]);
    if (who.includes(home)) return `Победа ${homeName}`;
    if (who.includes(away)) return `Победа ${awayName}`;
    return `Победа ${favoriteName}`;
  }

  // Обе забьют
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

  // Победа команды
  m = core.match(/^Победа\s+(.+)$/i);
  if (m) {
    const who = normalize(m[1]);
    if (who.includes(home)) return `Победа ${homeName}`;
    if (who.includes(away)) return `Победа ${awayName}`;
    return `Победа ${favoriteName}`;
  }
  m = core.match(/^(.+?)\s+Победа$/i);
  if (m) {
    const who = normalize(m[1]);
    if (who.includes(home)) return `Победа ${homeName}`;
    if (who.includes(away)) return `Победа ${awayName}`;
    return `Победа ${favoriteName}`;
  }

  // Фора
  m = core.match(/^Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)\s*на\s+(.+)$/i);
  if (m) {
    const sign = m[1].replace(',', '.');
    const who = normalize(m[2]);
    const outName = who.includes(home) ? homeName : who.includes(away) ? awayName : favoriteName;
    const signNorm = sign.startsWith('+') || sign.startsWith('-') ? sign : `+${sign}`;
    return `${outName} Фора ${signNorm}`;
  }
  m = core.match(/^(.+?)\s+Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) {
    const who = normalize(m[1]);
    const outName = who.includes(home) ? homeName : who.includes(away) ? awayName : favoriteName;
    const sign = m[2].replace(',', '.');
    const signNorm = sign.startsWith('+') || sign.startsWith('-') ? sign : `+${sign}`;
    return `${outName} Фора ${signNorm}`;
  }

  // «Ничья» → Победа фаворита
  if (/^ничья$/i.test(core)) return `Победа ${favoriteName}`;

  // По умолчанию — Победа фаворита
  return `Победа ${favoriteName}`;
}

// ===================== ОПРЕДЕЛЕНИЕ РЫНКА ======================
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

  // По умолчанию — 1X2 хозяев
  return { market: '1X2', outcome: '1' };
}

// ================== Favbet / 1X2 / фаворит ====================
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

function extract1x2FromPack(pack) {
  const books = pack?.bookmakers || [];
  const order = [
    ...books.filter(b => isFavbet(b.name)),
    ...books.filter(b => !isFavbet(b.name))
  ];
  for (const b of order) {
    const bet = (b.bets || []).find(bt =>
      ['Match Winner','1X2','Full Time Result'].some(alias =>
        String(bt.name).toLowerCase() === alias.toLowerCase()
      )
    );
    if (bet && bet.values?.length) {
      const out = {};
      for (const v of bet.values) {
        const name = String(v.value).toLowerCase();
        if (name === 'home' || name === '1') out.home = Number(v.odd);
        else if (name === 'away' || name === '2') out.away = Number(v.odd);
        else if (name === 'draw' || name === 'x') out.draw = Number(v.odd);
      }
      if (out.home || out.away) return out;
    }
  }
  return null;
}

function chooseFavoriteName(homeName, awayName, pack) {
  const oneXTwo = extract1x2FromPack(pack);
  if (oneXTwo && typeof oneXTwo.home === 'number' && typeof oneXTwo.away === 'number') {
    return oneXTwo.home <= oneXTwo.away ? homeName : awayName;
  }
  return homeName;
}

function pickOddFromPack(pack, wantedMarket, wantedOutcome) {
  const books = pack?.bookmakers || [];
  const ordered = [
    ...books.filter(b => isFavbet(b.name)),
    ...books.filter(b => !isFavbet(b.name))
  ];
  for (const b of ordered) {
    const odd = pickOddFromBook(b, wantedMarket, wantedOutcome);
    if (odd) return Number(odd).toFixed(2);
  }
  return null;
}

// === Генерация прогнозов (строго разрешённые форматы) ===
async function generateAllPredictions(matches) {
  const matchesList = matches
    .map((m, i) => `${i + 1}. ${m.teams.home.name} vs ${m.teams.away.name}`)
    .join('\n');

  const prompt = `
Ты спортивный аналитик.
СГЕНЕРИРУЙ по одному прогнозу на каждый матч СТРОГО в одном из разрешённых форматов (русский язык).

ДОПУСТИМЫЕ ШАБЛОНЫ (ровно одна строка на матч, без точек/хвостов):
1) "Победа <точное имя команды из списка ниже>"
2) "Тотал больше <число>"
3) "Тотал меньше <число>"
4) "Обе забьют-да"
5) "Обе забьют-нет"
6) "<точное имя команды> Фора <+/-число>"

ЗАПРЕЩЕНО:
- Любые хвосты ("в матче ...", "против ...", "с ..."), двоеточия, точки.
- Любые другие типы (включая "Двойной шанс" и "Ничья").
- Не указывать команду там, где она требуется.

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
      .map(s => s.replace(/^\d+\.\s*/, ''));

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

// ====== СОРТИРОВКА ПО СТРАНЕ (для финального порядка) ======
const COUNTRY_ORDER = [
  'England','Spain','Italy','Germany','France','Netherlands','Portugal',
  'Scotland','Turkey','Greece','Belgium','Austria','Switzerland','Poland','Ukraine'
];

function countryRank(countryRaw) {
  const c = String(countryRaw || '').trim();
  const idx = COUNTRY_ORDER.indexOf(c);
  return idx !== -1 ? idx : COUNTRY_ORDER.length + 1;
}

// === Основная функция генерации ===
async function generatePredictions() {
  const matches = await fetchMatches(40);
  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    await saveToDraft([]);
    return [];
  }

  // 1) Черновые тексты от ИИ
  let aiPredictions = await generateAllPredictions(matches);

  // 2) Собираем карточки (матч + прогноз + коэффициент)
  const cards = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    // Пакет котировок (один раз на матч)
    const oddsPacks = await safeGet(ODDS_URL, { fixture: match.fixture.id, timezone: 'Europe/Kiev' });
    const pack = oddsPacks?.[0] || null;

    // Фаворит по 1X2
    const favoriteName = chooseFavoriteName(match.teams.home.name, match.teams.away.name, pack);

    // Санитайзер
    const raw = aiPredictions[i] || '';
    const predText = sanitizePredictionText(raw, match.teams.home.name, match.teams.away.name, favoriteName);

    // Детект рынка и вытаскивание коэффициента
    const { market, outcome } = detectMarket(predText, match.teams.home.name, match.teams.away.name);
    let odd = pickOddFromPack(pack, market, outcome);
    if (!odd) odd = getRandomOdds();

    cards.push({ match, predText, odd });
  }

  // 3) СОРТИРОВКА: еврокубки → страны → дата → лига
  const EURO_REGEX = /(uefa|champions league|europa|conference|european championship|qualifying|qualification)/i;
  cards.sort((a, b) => {
    const la = String(a.match.league?.name || '');
    const lb = String(b.match.league?.name || '');
    const ca = String(a.match.league?.country || '');
    const cb = String(b.match.league?.country || '');

    const aIsEuro = EURO_REGEX.test(la) || /International|World|Europe/i.test(ca) && EURO_REGEX.test(la);
    const bIsEuro = EURO_REGEX.test(lb) || /International|World|Europe/i.test(cb) && EURO_REGEX.test(lb);
    if (aIsEuro !== bIsEuro) return aIsEuro ? -1 : 1;

    if (!aIsEuro && !bIsEuro) {
      const ra = countryRank(ca);
      const rb = countryRank(cb);
      if (ra !== rb) return ra - rb;
    }

    const ta = new Date(a.match.fixture.date).getTime();
    const tb = new Date(b.match.fixture.date).getTime();
    if (ta !== tb) return ta - tb;

    return la.localeCompare(lb);
  });

  // 4) Переводы команд для карточек
  const allTeams = matches.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // 5) Формирование карточек для БД — ДОБАВЛЯЕМ country
  const predictions = cards.map(({ match, predText, odd }, i) => ({
    id: Date.now() + i,
    country: match.league.country || '',                         // <— добавили явную страну
    tournament: formatTournament(match),                         // текст «Футбол.dd.mm.yy …» (уже без ошибки Англии)
    team1: teamTranslations[match.teams.home.name] || match.teams.home.name,
    logo1: match.teams.home.logo,
    team2: teamTranslations[match.teams.away.name] || match.teams.away.name,
    logo2: match.teams.away.logo,
    odds: odd,
    predictionText: predText
  }));

  // 6) Сохранение
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
