// prediction-generator.js
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

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// === API URLs ===
const FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const ODDS_URL = 'https://v3.football.api-sports.io/odds';

// ——— Константы/настройки ———

// Полностью исключаем страны:
const EXCLUDED_COUNTRIES = new Set(['Russia', 'Belarus']);

// Маленькие европейские страны для исключения из блока «Остальная Европа»
const SMALL_EURO_STATES = new Set([
  'Andorra','Faroe Islands','Gibraltar','Liechtenstein','Luxembourg','Malta','Monaco','San Marino'
]);

// Списки стран по конфедерациям (упрощённо)
const UEFA_COUNTRIES = new Set([
  'England','Scotland','Wales','Northern Ireland','Ireland',
  'Spain','Italy','Germany','France','Netherlands','Portugal',
  'Belgium','Switzerland','Austria','Turkey','Greece','Denmark',
  'Norway','Sweden','Poland','Czech Republic','Czechia','Croatia',
  'Serbia','Romania','Hungary','Slovakia','Slovenia','Bulgaria',
  'Bosnia and Herzegovina','North Macedonia','Albania','Kosovo',
  'Montenegro','Moldova','Ukraine','Lithuania','Latvia','Estonia',
  'Finland','Iceland','Georgia','Armenia','Azerbaijan','Cyprus',
  'Andorra','Faroe Islands','Gibraltar','Luxembourg','Liechtenstein',
  'Malta','Monaco','San Marino','Israel','Kazakhstan'
]);

const CONMEBOL_COUNTRIES = new Set([
  'Argentina','Brazil','Uruguay','Paraguay','Chile','Bolivia','Peru','Ecuador','Colombia','Venezuela'
]);

const CONCACAF_COUNTRIES = new Set([
  'Mexico','United States','USA','Canada','Costa Rica','Honduras','Panama','Guatemala','El Salvador',
  'Jamaica','Trinidad and Tobago','Haiti','Cuba','Dominican Republic','Nicaragua','Belize','Grenada',
  'Curacao','Suriname','Guyana','Martinique','Guadeloupe','Bermuda','Aruba','Antigua and Barbuda',
  'Bahamas','Barbados','Dominica','Saint Lucia','Saint Kitts and Nevis','Saint Vincent and the Grenadines',
  'Puerto Rico'
]);

const CAF_COUNTRIES = new Set([
  'Morocco','Algeria','Tunisia','Egypt','Libya',
  'Ghana','Nigeria','Senegal','Cameroon','Ivory Coast',"Côte d'Ivoire",
  'South Africa','Ethiopia','Kenya','Uganda','Tanzania','Zambia','Zimbabwe',
  'Mali','Burkina Faso','Guinea','Guinea-Bissau','Cape Verde','Sierra Leone',
  'Liberia','Gambia','Benin','Togo','Niger','Chad','Central African Republic',
  'Sudan','South Sudan','Eritrea','Somalia','Djibouti','Equatorial Guinea',
  'Gabon','Congo','DR Congo','Angola','Mozambique','Madagascar','Lesotho',
  'Eswatini','Botswana','Namibia','Mauritania','Sao Tome and Principe',
  'Comoros','Seychelles','Mauritius','Rwanda','Burundi'
]);

// ТОП-лиги Европы (высшие дивизионы)
const TOP_LEAGUE_BY_COUNTRY = {
  "England":     ["Premier League"],
  "Spain":       ["La Liga"],
  "Italy":       ["Serie A"],
  "Germany":     ["Bundesliga"],
  "France":      ["Ligue 1"],
  "Netherlands": ["Eredivisie"],
  "Portugal":    ["Primeira Liga"]
};

// Жёсткий порядок стран для ТОП-лиг
const TOP_MAJOR_ORDER = ["England","Spain","Italy","Germany","France","Netherlands","Portugal"];

// Высшие дивизионы прочих стран УЕФА (без «маленьких»)
const OTHER_TOP_DIVISIONS_UEFA = {
  "Scotland":    ["Premiership","Scottish Premiership"],
  "Turkey":      ["Super Lig","Süper Lig"],
  "Greece":      ["Super League 1","Super League Greece"],
  "Belgium":     ["Pro League","Jupiler Pro League","First Division A"],
  "Austria":     ["Bundesliga","Austrian Bundesliga"],
  "Switzerland": ["Super League","Swiss Super League"],
  "Poland":      ["Ekstraklasa"],
  "Ukraine":     ["Premier League","Ukrainian Premier League"],
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
  "Finland":     ["Veikkausliiga"],
  "Iceland":     ["Úrvalsdeild","Urvalsdeild"],
  "Cyprus":      ["First Division"],
  "Ireland":     ["Premier Division"],
  "Wales":       ["Cymru Premier"],
  "Northern Ireland": ["Premiership"],
  "Israel":      ["Ligat ha'Al","Premier League"],
  "Kazakhstan":  ["Premier League"]
};

// Ключевые слова для обнаружения международных турниров
const UEFA_KEYS = ['uefa','champions league','europa league','europe conference','conference league','european championship','nations league','super cup','qualifying','qualification'];
const CONMEBOL_KEYS = ['conmebol','copa america','libertadores','sudamericana','recopa'];
const CONCACAF_KEYS = ['concacaf','gold cup','leagues cup','champions cup','champions league'];
const CAF_KEYS = ['africa','caf','african cup','africa cup of nations','afcon'];

// ——— Утилиты ———
const lc = (s) => (s || '').toLowerCase().normalize('NFKD');

function isFriendlyMatch(m) {
  const name = lc(m.league?.name);
  const type = lc(m.league?.type);
  return /friendly|friendlies|товарищес/i.test(m.league?.name || '') ||
         /friendly/i.test(type);
}

function detectConfedByLeagueName(name='') {
  const n = lc(name);
  if (UEFA_KEYS.some(k => n.includes(k))) return 'UEFA';
  if (CONMEBOL_KEYS.some(k => n.includes(k))) return 'CONMEBOL';
  if (CONCACAF_KEYS.some(k => n.includes(k))) return 'CONCACAF';
  if (CAF_KEYS.some(k => n.includes(k))) return 'CAF';
  return 'OTHER';
}

function confedOf(country, leagueName) {
  if (UEFA_COUNTRIES.has(country)) return 'UEFA';
  if (CONMEBOL_COUNTRIES.has(country)) return 'CONMEBOL';
  if (CONCACAF_COUNTRIES.has(country)) return 'CONCACAF';
  if (CAF_COUNTRIES.has(country)) return 'CAF';
  return detectConfedByLeagueName(leagueName);
}

function inListByCountry(map, country, league) {
  const arr = map[country];
  if (!arr || !arr.length) return false;
  return arr.includes(league);
}

function ddmmyy(dateIso) {
  const d = new Date(dateIso);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
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

// ——— Завтрашний день по Киеву ———
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

function getRandomOdds() {
  const odds = [1.5,1.7,1.9,2.0,2.3,2.5,3.0,3.5];
  return odds[Math.floor(Math.random()*odds.length)].toFixed(2);
}

// ——— Классификация по корзинам ———
function classifyBucket(m) {
  const country = m.league?.country || '';
  const league  = m.league?.name || '';

  if (EXCLUDED_COUNTRIES.has(country)) return null;
  if (isFriendlyMatch(m)) return null;

  const confByLeague = detectConfedByLeagueName(league);
  if (confByLeague === 'UEFA' && /(champions|europa|conference|nations|european|qualif)/i.test(league)) {
    return 'EURO';
  }

  const conf = confedOf(country, league);

  if (conf === 'UEFA' && inListByCountry(TOP_LEAGUE_BY_COUNTRY, country, league)) return 'TOP_MAJOR';
  if (conf === 'UEFA' && !SMALL_EURO_STATES.has(country) && inListByCountry(OTHER_TOP_DIVISIONS_UEFA, country, league)) {
    return 'REST_EURO';
  }
  if (conf === 'CONMEBOL') return 'CONMEBOL';
  if (conf === 'CONCACAF') return 'CONCACAF';
  if (conf === 'CAF') return 'CAF';
  return null;
}

function sortByCountryStable(arr, getCountry) {
  return arr
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => {
      const ca = (getCountry(a.m) || '').localeCompare(getCountry(b.m) || '');
      if (ca !== 0) return ca;
      return a.idx - b.idx;
    })
    .map(x => x.m);
}

function sortTopMajor(arr) {
  const orderMap = new Map(TOP_MAJOR_ORDER.map((c, i) => [c, i]));
  return arr
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => {
      const ca = (orderMap.get(mCountry(a.m)) ?? 999) - (orderMap.get(mCountry(b.m)) ?? 999);
      if (ca !== 0) return ca;
      return a.idx - b.idx;
    })
    .map(x => x.m);
}
function mCountry(m){ return m.league?.country || ''; }

// ——— Получение матчей и порядок ———
async function fetchMatches(maxCount=100) {
  const tz = 'Europe/Kiev';
  const { from, to } = getKievDateRangeForTomorrow();

  let all = await safeGet(FIXTURES_URL, { date: from, timezone: tz });
  if (all.length === 0) all = await safeGet(FIXTURES_URL, { from, to, timezone: tz });
  if (all.length === 0) {
    const next = await safeGet(FIXTURES_URL, { next: 400, timezone: tz });
    if (next.length) {
      const zStart = new Date(`${from}T00:00:00.000Z`);
      const zEnd   = new Date(`${to}T00:00:00.000Z`);
      all = next.filter(m => {
        const dt = new Date(m.fixture.date);
        return dt >= zStart && dt < zEnd;
      });
      console.log(`🧩 Фолбэк next=400 → на завтра: ${all.length}`);
    }
  }

  const EURO = [], TOP_MAJOR = [], REST_EURO = [], CONMEBOL = [], CONCACAF = [], CAF = [];
  for (const m of all) {
    const b = classifyBucket(m);
    if (!b) continue;
    if (b === 'EURO') EURO.push(m);
    else if (b === 'TOP_MAJOR') TOP_MAJOR.push(m);
    else if (b === 'REST_EURO') REST_EURO.push(m);
    else if (b === 'CONMEBOL') CONMEBOL.push(m);
    else if (b === 'CONCACAF') CONCACAF.push(m);
    else if (b === 'CAF') CAF.push(m);
  }

  const EURO_sorted      = EURO.map((m,idx)=>({m,idx}))
    .sort((a,b)=> (a.m.league?.name||'').localeCompare(b.m.league?.name||'') || (a.idx-b.idx))
    .map(x=>x.m);
  const TOP_MAJOR_sorted = sortTopMajor(TOP_MAJOR);
  const REST_EURO_sorted = sortByCountryStable(REST_EURO, mCountry);
  const CONMEBOL_sorted  = sortByCountryStable(CONMEBOL, mCountry);
  const CONCACAF_sorted  = sortByCountryStable(CONCACAF, mCountry);
  const CAF_sorted       = sortByCountryStable(CAF, mCountry);

  const result = [
    ...EURO_sorted,
    ...TOP_MAJOR_sorted,
    ...REST_EURO_sorted,
    ...CONMEBOL_sorted,
    ...CONCACAF_sorted,
    ...CAF_sorted
  ];

  const final = result.slice(0, maxCount);
  console.log(`✅ К генерации: EURO=${EURO_sorted.length}, TOP=${TOP_MAJOR_sorted.length}, REST_EURO=${REST_EURO_sorted.length}, CONMEBOL=${CONMEBOL_sorted.length}, CONCACAF=${CONCACAF_sorted.length}, CAF=${CAF_sorted.length} | total=${final.length}`);
  return final;
}

// ——— Вспомогательные для «*.5» тоталов и разнообразия ———
function toHalfString(x) {
  // любая цифра → ближайшее *.5
  const n = Number(String(x).replace(',', '.')) || 2.5;
  const target = Math.max(0.5, Math.round(n - 0.5) + 0.5); // 2 -> 1.5; 2.8 -> 2.5; 3.2 -> 3.5
  return target.toFixed(1);
}
function quantizeOverNumber(n) {
  // предпочтительные уровни для ОЗ/тоталов
  const v = Number(String(n).replace(',', '.')) || 2.5;
  if (v <= 1.9) return '1.5';
  if (v <= 2.9) return '2.5';
  if (v <= 3.9) return '3.5';
  return '4.5';
}
function quantizeUnderNumber(n) {
  const v = Number(String(n).replace(',', '.')) || 2.5;
  if (v <= 1.9) return '1.5';
  if (v <= 2.9) return '2.5';
  if (v <= 3.9) return '3.5';
  return '4.5';
}

// ——— Генерация ИИ (с требованием разнообразия и половинок) ———
async function generateAllPredictions(matches) {
  const list = matches.map((m,i)=>`${i+1}. ${m.teams.home.name} vs ${m.teams.away.name}`).join('\n');
  const prompt = `
Ты спортивный аналитик. СГЕНЕРИРУЙ по одному прогнозу на каждый матч (строго русский язык). 
Форматы РАЗРЕШЕНЫ только такие (без точек/хвостов):

1) "Победа <точное имя команды>"
2) "Тотал больше <1.5|2.5|3.5|4.5>"
3) "Тотал меньше <1.5|2.5|3.5|4.5>"
4) "Обе забьют-да"
5) "Обе забьют-нет"
6) "<точное имя команды> Фора <+1|+1.5|+2|−1|−1.5|−2>"

ТРЕБОВАНИЯ:
- Используй РАЗНООБРАЗИЕ типов (не более 40% строк — "Победа ...").
- Все тоталы — ТОЛЬКО половинки (.5), никаких целых.
- Одна строка на матч. Никаких пояснений.
- Без "Двойной шанс", без "Ничья", без доп. текста.

Список матчей:
${list}
`.trim();

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    });
    const lines = (r.choices?.[0]?.message?.content || '')
      .split('\n').map(s => s.trim()).filter(Boolean)
      .map(s => s.replace(/^\d+\.\s*/, ''));
    if (lines.length >= matches.length) return lines.slice(0, matches.length);
  } catch (e) {
    console.error('AI error:', e.message);
  }

  // Фолбэк: простая ротация шаблонов с половинками
  const templates = ['WIN_FAV','OVER','BTTS_YES','HANDICAP_FAV','UNDER','WIN_DOG','BTTS_NO','HANDICAP_DOG'];
  let ti = 0;
  return matches.map((m,i) => {
    const t = templates[ti++ % templates.length];
    if (t === 'OVER') return `Тотал больше 2.5`;
    if (t === 'UNDER') return `Тотал меньше 2.5`;
    if (t === 'BTTS_YES') return `Обе забьют-да`;
    if (t === 'BTTS_NO') return `Обе забьют-нет`;
    if (t === 'HANDICAP_FAV') return `${m.teams.home.name} Фора -1`;
    if (t === 'HANDICAP_DOG') return `${m.teams.away.name} Фора +1.5`;
    if (t === 'WIN_DOG') return `Победа ${m.teams.away.name}`;
    return `Победа ${m.teams.home.name}`;
  });
}

// ——— Пост-обработка прогнозов (строгие форматы + половинки тоталов) ———
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

  // Обе забьют
  let m = t.match(/^обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i);
  if (m) return `Обе забьют-${m[1].toLowerCase()==='да'?'да':'нет'}`;

  // Тотал больше X (приводим к *.5)
  m = core.match(/Тотал\s+больше\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) {
    const q = quantizeOverNumber(m[1]);
    return `Тотал больше ${q}`;
  }
  // Тотал меньше X (к *.5)
  m = core.match(/Тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) {
    const num = Number(String(m[1]).replace(',', '.'));
    // логика: если целое 3 → 2.5; 2 → 1.5
    if (Number.isInteger(num)) {
      const half = (num - 0.5);
      return `Тотал меньше ${half.toFixed(1)}`;
    }
    return `Тотал меньше ${toHalfString(num)}`;
  }
  // Короткие ТБ/ТМ → к *.5
  m = core.match(/\bТБ\s*([0-9]+(?:[.,][0-9]+)?)\b/i);
  if (m) return `Тотал больше ${quantizeOverNumber(m[1])}`;
  m = core.match(/\bТМ\s*([0-9]+(?:[.,][0-9]+)?)\b/i);
  if (m) {
    const num = Number(String(m[1]).replace(',', '.'));
    if (Number.isInteger(num)) return `Тотал меньше ${(num-0.5).toFixed(1)}`;
    return `Тотал меньше ${toHalfString(num)}`;
  }

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

  // Всё остальное → Победа фаворита (как фолбэк)
  return `Победа ${favoriteName}`;
}

// ——— Favbet приоритет и выбор коэффициента ———
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
          const target = outcome.split(' ')[1];
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
  if (m) return { market:'Total Goals', outcome:`Over ${quantizeOverNumber(m[1])}` };
  m = core.match(/^Тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return { market:'Total Goals', outcome:`Under ${quantizeUnderNumber(m[1])}` };

  // Фора "<Команда> Фора n"
  m = core.match(/^(.+?)\s+Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) {
    const who = normalize(m[1]);
    const sign = String(m[2]).replace(',', '.');
    const side = who.includes(home) ? 'home' : who.includes(away) ? 'away' : 'home';
    // Для рынка Handicap ожидается "home +1.5" / "away -1"
    const signNorm = (/^[+-]/.test(sign) ? sign : `+${sign}`);
    return { market:'Handicap', outcome:`${side} ${signNorm}` };
  }

  return { market:'1X2', outcome:'1' };
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

// ——— Основная функция ———
async function generatePredictions() {
  const matches = await fetchMatches(100);
  if (!matches.length) {
    await saveToDraft([]);
    return [];
  }

  // Берём пакет коэффициентов на каждый матч заранее (для фаворита и рынков)
  const oddsPacks = {};
  for (const m of matches) {
    try {
      oddsPacks[m.fixture.id] = (await safeGet(ODDS_URL, { fixture: m.fixture.id, timezone: 'Europe/Kiev' }))?.[0] || null;
    } catch { oddsPacks[m.fixture.id] = null; }
  }

  const ai = await generateAllPredictions(matches);

  const cards = [];
  let winCount = 0;
  for (let i=0;i<matches.length;i++) {
    const match = matches[i];
    const pack = oddsPacks[match.fixture.id];
    const favorite = chooseFavoriteName(match.teams.home.name, match.teams.away.name, pack);

    // пост-обработка ИИ → наши форматы + половинки
    let predText = sanitizePredictionText(ai[i] || '', match.teams.home.name, match.teams.away.name, favorite);

    // Доп. ограничение однообразия: не более 40% побед
    if (/^Победа\s+/i.test(predText)) winCount++;
    const limitWins = Math.floor(matches.length * 0.4);
    if (winCount > limitWins) {
      // Сменим на тотал с половинкой
      predText = Math.random() < 0.5 ? `Тотал больше 2.5` : `Тотал меньше 2.5`;
    }

    // Подбор коэффициента под итоговый рынок/исход
    const { market, outcome } = detectMarketAndOutcome(predText, match.teams.home.name, match.teams.away.name);
    let odd = pickOddFromPack(pack, market, outcome);
    if (!odd) odd = getRandomOdds();

    cards.push({ match, predText, odd });
  }

  // Перевод названий команд
  const allTeams = matches.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // Сохраняем
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
