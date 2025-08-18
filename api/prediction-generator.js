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

// ——— Ключевые настройки ———

// Маркеры еврокубков/УЕФА
const UEFA_KEYS = [
  'uefa','euro','europa','conference',
  'champions league','european championship',
  'qualifying','qualification','super cup','nations league'
];

// Полностью исключаем (по твоей просьбе)
const EXCLUDED_COUNTRIES = new Set([
  'Russia',
  'Belarus',
  'Gibraltar',
  'Luxembourg',
  'Andorra',
  'Malta'
]);

// ТОП-лиг (высшие дивизионы)
const TOP_LEAGUE_BY_COUNTRY = {
  "England":     ["Premier League"],
  "Spain":       ["La Liga"],
  "Italy":       ["Serie A"],
  "Germany":     ["Bundesliga"],
  "France":      ["Ligue 1"],
  "Netherlands": ["Eredivisie"],
  "Portugal":    ["Primeira Liga"]
};

// Жёсткий порядок стран внутри ТОП-блока
const TOP_MAJOR_ORDER = ["England","Spain","Italy","Germany","France","Netherlands","Portugal"];

// Высшие дивизионы остальных европейских стран
const OTHER_TOP_DIVISIONS = {
  "Scotland":    ["Premiership","Scottish Premiership"],
  "Turkey":      ["Super Lig","Süper Lig"],
  "Greece":      ["Super League 1","Super League Greece"],
  "Belgium":     ["Pro League","Jupiler Pro League","First Division A"],
  "Austria":     ["Bundesliga","Austrian Bundesliga"],
  "Switzerland": ["Super League","Swiss Super League"],
  "Poland":      ["Ekstraklasa"],
  "Ukraine":     ["Premier League","Ukrainian Premier League"], // для распознавания, но будет отдельная корзина UKRAINE
  "Norway":      ["Eliteserien"],
  "Sweden":      ["Allsvenskan"],
  "Denmark":     ["Superliga","Danish Superliga"],
  "Czech Republic": ["Czech Liga","1. Liga","Fortuna Liga"],
  "Czechia":     ["Czech Liga","1. Liga","Fortuna Liga"],
  "Croatia":     ["1. HNL","HNL","SuperSport HNL"],
  "Serbia":      ["SuperLiga","Super Liga"],
  "Romania":     ["Liga I","Superliga"],
  "Hungary":     ["NB I"],
  "Slovakia":    ["Super Liga","Fortuna Liga"],
  "Slovenia":    ["PrvaLiga","Prva Liga"],
  "Bulgaria":    ["Parva Liga","First League"],
  "Bosnia and Herzegovina": ["Premier Liga","Premijer Liga"],
  "North Macedonia": ["First League"],
  "Albania":     ["Kategoria Superiore"],
  "Kosovo":      ["Superliga"],
  "Montenegro":  ["First League","Prva CFL"],
  "Moldova":     ["Super Liga","National Division","Divizia Nationala"],
  "Lithuania":   ["A Lyga"],
  "Latvia":      ["Virsliga"],
  "Estonia":     ["Meistriliiga"],
  "Finland":     ["Veikkausliiga"],
  "Iceland":     ["Úrvalsdeild","Urvalsdeild"],
  "Georgia":     ["Erovnuli Liga"],
  "Armenia":     ["Premier League"],
  "Azerbaijan":  ["Premier League","Premyer Liqasi"],
  "Cyprus":      ["First Division"],
  "Ireland":     ["Premier Division"],
  "Wales":       ["Cymru Premier"],
  "Northern Ireland": ["Premiership"],
  "Israel":      ["Ligat ha'Al","Premier League"],
  "Kazakhstan":  ["Premier League"]
};

// Низшие дивизионы (частичный список; всё «неопознанное» в Европе упадёт сюда)
const LOWER_DIVISIONS = {
  "England": ["Championship","League One","League Two","National League"],
  "Spain": ["La Liga 2","Segunda Division"],
  "Italy": ["Serie B"],
  "Germany": ["2. Bundesliga","3. Liga","Regionalliga"],
  "France": ["Ligue 2","National"],
  "Netherlands": ["Eerste Divisie"],
  "Portugal": ["Segunda Liga","Liga Portugal 2"],
  "Belgium": ["Challenger Pro League","First Division B"],
  "Turkey": ["1. Lig"],
  "Poland": ["I Liga"],
  "Czech Republic": ["FNL","2. Liga"],
  "Greece": ["Super League 2"],
  "Scotland": ["Championship","League One","League Two"],
  "Austria": ["2. Liga"],
  "Switzerland": ["Challenge League"]
};

const lc = (s) => (s || '').toLowerCase().normalize('NFKD');

// ——— Еврокубок/международный? ———
function isInternational(match) {
  const country = lc(match.league?.country);
  const league  = lc(match.league?.name);
  if (country === 'international' || country === 'world' || country === 'europe') return true;
  return UEFA_KEYS.some(k => league.includes(k));
}

// ——— Европа? ———
function isEuropeanMatch(m) {
  const country = lc(m.league?.country);
  const league = lc(m.league?.name);
  const EU = [
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
  if (EU.includes(country)) return true;
  if ((country === 'international' || country === 'world' || country === 'europe') &&
      UEFA_KEYS.some(k => league.includes(k))) return true;
  return false;
}

// ——— Дата (Киев): завтра ———
function getKievDateRangeForTomorrow() {
  const tz = 'Europe/Kiev';
  const kievNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const start = new Date(kievNow);
  start.setDate(start.getDate() + 1);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const from = start.toISOString().split('T')[0];
  const to   = end.toISOString().split('T')[0];
  return { from, to };
}

function ddmmyy(dateIso) {
  const d = new Date(dateIso);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

function getRandomOdds() {
  const odds = [1.5,1.7,1.9,2.0,2.3,2.5,3.0,3.5];
  return odds[Math.floor(Math.random()*odds.length)].toFixed(2);
}

// ——— Безопасный GET ———
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
    console.error(`❌ GET ${url} fail | status=${e.response?.status} | data=${JSON.stringify(e.response?.data) || e.message}`);
    return [];
  }
}

// ——— Проверки принадлежности ———
function inListByCountry(map, country, league) {
  const arr = map[country];
  if (!arr || !arr.length) return false;
  return arr.includes(league);
}
function inInternationalList(list, league) {
  return list.includes(league);
}

// ——— Классификация матча по «корзине» ———
// Корзины: EURO, TOP_MAJOR, UKRAINE, TOP_OTHER, LOWER
function classifyBucket(m) {
  const country = m.league?.country || '';
  const league  = m.league?.name || '';

  // Полное исключение стран
  if (EXCLUDED_COUNTRIES.has(country)) return null;

  // Европа-ограничение
  if (ONLY_EUROPE && !isEuropeanMatch(m)) return null;

  // Еврокубки
  if (isInternational(m) || inInternationalList([
    "UEFA Champions League",
    "UEFA Europa League",
    "UEFA Europa Conference League",
    "UEFA Super Cup",
    "UEFA Champions League Qualification",
    "UEFA Europa League Qualification",
    "UEFA Europa Conference League Qualification",
    "UEFA Nations League",
    "UEFA European Championship",
    "UEFA European Championship Qualification"
  ], league)) {
    return 'EURO';
  }

  // ТОП-дивизионы ТОП-лиг
  if (inListByCountry(TOP_LEAGUE_BY_COUNTRY, country, league)) {
    return 'TOP_MAJOR';
  }

  // Украина — отдельная корзина (только высший дивизион)
  if (country === 'Ukraine' && inListByCountry(OTHER_TOP_DIVISIONS, country, league)) {
    return 'UKRAINE';
  }

  // Высшие дивизионы остальных стран
  if (inListByCountry(OTHER_TOP_DIVISIONS, country, league)) {
    return 'TOP_OTHER';
  }

  // Низшие (включая явные списки и «неопознанные» европейские)
  if (inListByCountry(LOWER_DIVISIONS, country, league)) return 'LOWER';
  if (isEuropeanMatch(m)) return 'LOWER';

  // Вне Европы (при ONLY_EUROPE=true) — отсекается выше; если false, отнесём к LOWER
  return ONLY_EUROPE ? null : 'LOWER';
}

// ——— Утилита стабильной сортировки по стране с сохранением исходного порядка внутри страны ———
function sortByCountryStable(arr, getCountry) {
  return arr
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => {
      const ca = (getCountry(a.m) || '').localeCompare(getCountry(b.m) || '');
      if (ca !== 0) return ca;
      return a.idx - b.idx; // стабильно сохраняем исходный порядок внутри одной страны
    })
    .map(x => x.m);
}

// ——— Сортировка ТОП-блока по фиксированному порядку стран, стабильно внутри страны ———
function sortTopMajor(arr) {
  const orderMap = new Map(TOP_MAJOR_ORDER.map((c, i) => [c, i]));
  return arr
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => {
      const oa = orderMap.has(a.m.league?.country) ? orderMap.get(a.m.league.country) : 999;
      const ob = orderMap.has(b.m.league?.country) ? orderMap.get(b.m.league.country) : 999;
      if (oa !== ob) return oa - ob;
      // внутри одной страны сохраняем исходный порядок
      return a.idx - b.idx;
    })
    .map(x => x.m);
}

// ——— Получение матчей и формирование 5 «корзин» ———
async function fetchMatches(maxCount=40) {
  const tz = 'Europe/Kiev';
  const { from, to } = getKievDateRangeForTomorrow();

  let all = await safeGet(FIXTURES_URL, { date: from, timezone: tz });
  if (all.length === 0) all = await safeGet(FIXTURES_URL, { from, to, timezone: tz });
  if (all.length === 0) {
    const next = await safeGet(FIXTURES_URL, { next: 200, timezone: tz });
    if (next.length) {
      const zStart = new Date(`${from}T00:00:00.000Z`);
      const zEnd   = new Date(`${to}T00:00:00.000Z`);
      all = next.filter(m => {
        const dt = new Date(m.fixture.date);
        return dt >= zStart && dt < zEnd;
      });
      console.log(`🧩 Фолбэк next=200 → на завтра: ${all.length}`);
    }
  }

  const EURO = [];
  const TOP_MAJOR = [];
  const UKRAINE = [];
  const TOP_OTHER = [];
  const LOWER = [];

  // Раскладываем по корзинам
  for (const m of all) {
    const bucket = classifyBucket(m);
    if (!bucket) continue;
    if (bucket === 'EURO') EURO.push(m);
    else if (bucket === 'TOP_MAJOR') TOP_MAJOR.push(m);
    else if (bucket === 'UKRAINE') UKRAINE.push(m);
    else if (bucket === 'TOP_OTHER') TOP_OTHER.push(m);
    else LOWER.push(m);
  }

  // Сортировки внутри корзин (без сортировки по времени!)
  // EURO — по названию турнира, стабильно
  const EURO_sorted = EURO
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => {
      const la = (a.m.league?.name || '').localeCompare(b.m.league?.name || '');
      if (la !== 0) return la;
      return a.idx - b.idx;
    })
    .map(x => x.m);

  // TOP_MAJOR — по фиксированному порядку стран
  const TOP_MAJOR_sorted = sortTopMajor(TOP_MAJOR);

  // UKRAINE — отдельный блок, как пришло (можно не сортировать)
  const UKRAINE_sorted = UKRAINE;

  // TOP_OTHER — по алфавиту стран, стабильно внутри страны
  const TOP_OTHER_sorted = sortByCountryStable(TOP_OTHER, m => m.league?.country);

  // LOWER — по алфавиту стран, стабильно внутри страны
  const LOWER_sorted = sortByCountryStable(LOWER, m => m.league?.country);

  // Финальный порядок: EURO → TOP_MAJOR → UKRAINE → TOP_OTHER → LOWER
  const result = [
    ...EURO_sorted,
    ...TOP_MAJOR_sorted,
    ...UKRAINE_sorted,
    ...TOP_OTHER_sorted,
    ...LOWER_sorted
  ];

  const final = result.slice(0, maxCount);
  console.log(`✅ К генерации: EURO=${EURO_sorted.length}, TOP_MAJOR=${TOP_MAJOR_sorted.length}, UKRAINE=${UKRAINE_sorted.length}, TOP_OTHER=${TOP_OTHER_sorted.length}, LOWER=${LOWER_sorted.length} | total=${final.length}`);
  return final;
}

// ——— Нормализация текста прогнозов ———
function normalize(s) {
  return (s||'').toLowerCase().replace(/[–—−]/g,'-').replace(/\s+/g,' ').trim();
}
function stripContext(raw) {
  return (raw||'')
    .replace(/\s*(?:в|на)\s+(?:матче|игре)\b[^]*$/i,'')
    .replace(/\s*против\s+.+$/i,'')
    .replace(/\s*с\s+.+$/i,'')
    .replace(/[\.。]+$/,'')
    .trim();
}

function sanitizePredictionText(text, homeName, awayName, favoriteName) {
  if (!text) return text;
  const orig = text.trim();
  const core = stripContext(orig);
  const t = normalize(core);
  const home = normalize(homeName);
  const away = normalize(awayName);

  // Двойной шанс/не проиграет → Победа нужной команды
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

  // Победа
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
    const out = who.includes(home) ? homeName : who.includes(away) ? awayName : favoriteName;
    const s = sign.startsWith('+') || sign.startsWith('-') ? sign : `+${sign}`;
    return `${out} Фора ${s}`;
  }
  m = core.match(/^(.+?)\s+Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) {
    const who = normalize(m[1]);
    const sign = m[2].replace(',', '.');
    const out = who.includes(home) ? homeName : who.includes(away) ? awayName : favoriteName;
    const s = sign.startsWith('+') || sign.startsWith('-') ? sign : `+${sign}`;
    return `${out} Фора ${s}`;
  }

  // «Ничья» → Победа фаворита
  if (/^ничья$/i.test(core)) return `Победа ${favoriteName}`;

  return `Победа ${favoriteName}`;
}

// ——— Favbet приоритет и определение рынка ———
function isFavbet(name='') { return String(name).toLowerCase().includes('fav'); }

function extract1x2FromPack(pack) {
  const books = pack?.bookmakers || [];
  const ordered = [...books.filter(b=>isFavbet(b.name)), ...books.filter(b=>!isFavbet(b.name))];
  for (const b of ordered) {
    const bet = (b.bets||[]).find(bt =>
      ['Match Winner','1X2','Full Time Result'].some(alias => String(bt.name).toLowerCase() === alias.toLowerCase())
    );
    if (!bet || !bet.values?.length) continue;
    const out = {};
    for (const v of bet.values) {
      const nm = String(v.value||'').toLowerCase();
      if (nm === 'home' || nm === '1') out.home = Number(v.odd);
      else if (nm === 'away' || nm === '2') out.away = Number(v.odd);
      else if (nm === 'draw' || nm === 'x') out.draw = Number(v.odd);
    }
    if (out.home || out.away) return out;
  }
  return null;
}

function chooseFavoriteName(homeName, awayName, pack) {
  const one = extract1x2FromPack(pack);
  if (one && typeof one.home==='number' && typeof one.away==='number') {
    return one.home <= one.away ? homeName : awayName;
  }
  return homeName; // фолбэк
}

function detectMarketAndOutcome(predText, homeName, awayName) {
  const raw = predText||'';
  const core = stripContext(raw);
  const t = normalize(core);
  const home = normalize(homeName);
  const away = normalize(awayName);

  // Победа
  let m = core.match(/^Победа\s+(.+)$/i);
  if (m) {
    const who = normalize(m[1]);
    if (who.includes(home)) return { market:'1X2', outcome:'1' };
    if (who.includes(away)) return { market:'1X2', outcome:'2' };
    return { market:'1X2', outcome:'1' };
  }

  // Обе забьют
  m = t.match(/^обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i);
  if (m) return { market:'Both Teams To Score', outcome: m[1]==='да'?'Yes':'No' };

  // Тоталы
  m = core.match(/^Тотал\s+больше\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return { market:'Total Goals', outcome:`Over ${m[1].replace(',', '.')}` };
  m = core.match(/^Тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return { market:'Total Goals', outcome:`Under ${m[1].replace(',', '.')}` };

  // Фора "<Команда> Фора n"
  m = core.match(/^(.+?)\s+Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) {
    const who = normalize(m[1]);
    const sign = m[2].replace(',', '.');
    const side = who.includes(home) ? 'home' : who.includes(away) ? 'away' : 'home';
    return { market:'Handicap', outcome:`${side} ${sign}` };
  }

  // По умолчанию — 1X2 хозяев
  return { market:'1X2', outcome:'1' };
}

function pickOddFromBook(book, market, outcome) {
  const bets = book.bets || [];
  const aliases = {
    '1X2': ['Match Winner','1X2','Full Time Result'],
    'Both Teams To Score': ['Both Teams Score','Both Teams to Score','Both Teams To Score'],
    'Total Goals': ['Over/Under','Total Goals'],
    'Handicap': ['Asian Handicap','Handicap','Spread']
  };
  const targets = aliases[market] || [market];

  for (const bet of bets) {
    if (!targets.some(a => String(bet.name).toLowerCase() === a.toLowerCase())) continue;
    for (const v of (bet.values || [])) {
      const nm = String(v.value || v.handicap || '').replace(',', '.');
      const odd = v.odd;
      switch (market) {
        case '1X2':
          if ((outcome==='1' && /^(1|home)$/i.test(nm)) ||
              (outcome==='2' && /^(2|away)$/i.test(nm)) ||
              (outcome==='X' && /^(x|draw)$/i.test(nm))) return odd;
          break;
        case 'Both Teams To Score':
          if ((outcome==='Yes' && /^yes$/i.test(nm)) || (outcome==='No' && /^no$/i.test(nm))) return odd;
          break;
        case 'Total Goals': {
          const over = outcome.startsWith('Over ');
          const num  = outcome.split(' ')[1];
          if ((over && /over/i.test(nm) && nm.includes(num)) ||
              (!over && /under/i.test(nm) && nm.includes(num))) return odd;
          break;
        }
        case 'Handicap': {
          const target = outcome.split(' ')[1]; // +1.0
          if (nm === target || nm === target.replace(/\.0$/,'') || target.includes(nm)) return odd;
          break;
        }
      }
    }
  }
  return null;
}

function pickOddFromPack(pack, market, outcome) {
  const books = pack?.bookmakers || [];
  const ordered = [...books.filter(b=>isFavbet(b.name)), ...books.filter(b=>!isFavbet(b.name))];
  for (const b of ordered) {
    const odd = pickOddFromBook(b, market, outcome);
    if (odd) return Number(odd).toFixed(2);
  }
  return null;
}

// ——— Генерация ИИ (строго ограниченные шаблоны) ———
async function generateAllPredictions(matches) {
  const list = matches.map((m,i)=>`${i+1}. ${m.teams.home.name} vs ${m.teams.away.name}`).join('\n');
  const prompt = `
Ты спортивный аналитик.
СГЕНЕРИРУЙ по одному прогнозу на каждый матч СТРОГО в одном из шаблонов (русский язык). ОДНА строка на матч, без точек/хвостов:

1) "Победа <точное имя команды>" 
2) "Тотал больше <число>"
3) "Тотал меньше <число>"
4) "Обе забьют-да"
5) "Обе забьют-нет"
6) "<точное имя команды> Фора <+/-число>"

Запрещены "Двойной шанс", "Ничья" и любые хвосты/дополнения.

Список:
${list}
`.trim();

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });
    return (r.choices?.[0]?.message?.content || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.replace(/^\d+\.\s*/, ''));
  } catch (e) {
    console.error('AI error:', e.message);
    return matches.map(m => `Победа ${m.teams.home.name}`);
  }
}

// ——— Сохранение ———
async function saveToDraft(preds) {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('predictionsDB');
  const coll = db.collection('draft_predictions');
  await coll.deleteMany({});
  if (preds.length) await coll.insertMany(preds);
  await client.close();
}

// ——— Основная ———
async function generatePredictions() {
  const matches = await fetchMatches(40);
  if (!matches.length) {
    await saveToDraft([]);
    return [];
  }

  const ai = await generateAllPredictions(matches);

  const cards = [];
  for (let i=0;i<matches.length;i++) {
    const match = matches[i];

    // Берём коэффициенты (Favbet приоритет)
    const oddsPack = (await safeGet(ODDS_URL, { fixture: match.fixture.id, timezone: 'Europe/Kiev' }))?.[0] || null;
    const favorite = chooseFavoriteName(match.teams.home.name, match.teams.away.name, oddsPack);

    const raw = ai[i] || '';
    const predText = sanitizePredictionText(raw, match.teams.home.name, match.teams.away.name, favorite);

    const { market, outcome } = detectMarketAndOutcome(predText, match.teams.home.name, match.teams.away.name);
    let odd = pickOddFromPack(oddsPack, market, outcome);
    if (!odd) odd = getRandomOdds();

    cards.push({ match, predText, odd });
  }

  // Перевод названий команд
  const allTeams = matches.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // Документ в черновики (legacy tournament оставляем)
  const predictions = cards.map(({ match, predText, odd }, idx) => ({
    id: Date.now() + idx,
    country: match.league.country || '',
    league:  match.league.name || '',
    date:    ddmmyy(match.fixture.date),
    tournament: `Футбол.${ddmmyy(match.fixture.date)} ${match.league.name || ''}`,
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

if (require.main === module) {
  generatePredictions()
    .then(() => console.log('✅ Генерация завершена'))
    .catch(e => console.error('❌ Ошибка генерации:', e));
}

module.exports = { generatePredictions };
