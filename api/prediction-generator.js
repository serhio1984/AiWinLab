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

// ——— Базовые настройки ———

// Полностью исключаем страны:
const EXCLUDED_COUNTRIES = new Set(['Russia', 'Belarus']);

// Европа (УЕФА)
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

// ТОП-лиги (высшие дивизионы)
const TOP_LEAGUE_BY_COUNTRY = {
  "England":     ["Premier League"],
  "Spain":       ["La Liga"],
  "Italy":       ["Serie A"],
  "Germany":     ["Bundesliga"],
  "France":      ["Ligue 1"],
  "Netherlands": ["Eredivisie"],
  "Portugal":    ["Primeira Liga"]
};

// Остальные высшие дивизионы в Европе (крупные/средние страны)
const OTHER_TOP_DIVISIONS_UEFA = {
  "Scotland":    ["Premiership","Scottish Premiership"],
  "Turkey":      ["Super Lig","Süper Lig"],
  "Greece":      ["Super League 1","Super League Greece"],
  "Belgium":     ["Pro League","Jupiler Pro League","First Division A"],
  "Austria":     ["Bundliga","Austrian Bundesliga"],
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

// Ключевые слова — еврокубки (клубные)
const EURO_CUPS_KEYS = [
  'uefa champions league','champions league',
  'uefa europa league','europa league',
  'uefa europa conference league','europa conference league',
  'uefa super cup','super cup'
];

// Сборные (евро, отборы, лига наций, товарищеские сборных)
const NT_KEYS = [
  'european championship','uefa european championship','euro',
  'nations league','uefa nations league',
  'qualifying','qualification','world cup qualification',
  'friendlies','friendly'
];

// Европейские КУБКИ (национальные/домашние кубки стран УЕФА)
const EURO_DOMESTIC_CUPS_KEYS = [
  'fa cup','efl cup','carabao cup','community shield',
  'copa del rey','supercopa',
  'coppa italia','supercoppa',
  'dfb-pokal','dfb pokal','dfb supercup',
  'coupe de france','trophée des champions','trophee des champions',
  'knvb beker','johan cruijff schaal','johan cruijff shield',
  'taca de portugal','taça de portugal','supertaca',
  'scottish cup','scottish league cup',
  'austrian cup','öfb-cup','ofb-cup',
  'schweizer cup','swiss cup',
  'copa portugal',
  'greek cup','turkish cup','belgian cup','croatian cup',
  'romanian cup','hungarian cup','polish cup','czech cup','slovak cup',
  'danish cup','norwegian cup','swedish cup','finnish cup',
  'ukrainian cup','super cup'
];

// Низшие дивизионы (известные вторые лиги и аналоги)
const LOWER_DIVS_KEYS = [
  'championship','liga 2','ligue 2','serie b','2. bundesliga','segunda','segunda division','segunda división',
  'eerste divisie','keuken kampioen','liga portugal 2','liga 2','primera nacional','primera b','national league',
  '3. liga','serie c','national','liga ii','superettan','obos-ligaen','1. division','prva nl'
];

// Утилиты
const lc = (s) => (s || '').toLowerCase().normalize('NFKD');
const ddmmyy = (dateIso) => {
  const d = new Date(dateIso);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
};

// Безопасный GET
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

// Завтра по Киеву
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

// ——— КЛАССИФИКАЦИЯ ПО КАТЕГОРИЯМ (строго в УЕФА) ———
function isUEFA(country) {
  return UEFA_COUNTRIES.has(country);
}
function isEuroCups(leagueName) {
  const n = lc(leagueName);
  return EURO_CUPS_KEYS.some(k => n.includes(k));
}
function isNationalTeams(m) {
  const country = String(m.league?.country || '');
  const type = String(m.league?.type || '');
  const name = lc(m.league?.name || '');
  const isInter = /international|world|europe/i.test(country) || /national/i.test(type);
  if (!isInter) return false;
  return NT_KEYS.some(k => name.includes(k)) || /friendly/i.test(name);
}
function isEuroDomesticCup(country, leagueName) {
  if (!isUEFA(country)) return false;
  const n = lc(leagueName);
  if (isEuroCups(leagueName)) return false;
  return EURO_DOMESTIC_CUPS_KEYS.some(k => n.includes(k)) || /\b(cup|super\s*cup|beker|pokal|coppa|coupe|supertaca|taça)\b/i.test(leagueName);
}
function isTopMajor(country, leagueName) {
  return !!(TOP_LEAGUE_BY_COUNTRY[country] && TOP_LEAGUE_BY_COUNTRY[country].includes(leagueName));
}
function isOtherTopUEFA(country, leagueName) {
  return !!(OTHER_TOP_DIVISIONS_UEFA[country] && OTHER_TOP_DIVISIONS_UEFA[country].includes(leagueName));
}
function isLowerDivisionUEFA(country, leagueName) {
  if (!isUEFA(country)) return false;
  const n = lc(leagueName);
  if (isTopMajor(country, leagueName)) return false;
  if (isOtherTopUEFA(country, leagueName)) return false;
  if (isEuroCups(leagueName)) return false;
  if (isEuroDomesticCup(country, leagueName)) return false;
  if (isNationalTeams({ league: { country, name: leagueName } })) return false;
  if (LOWER_DIVS_KEYS.some(k => n.includes(k))) return true;
  if (/\b(2\.|ii|b|liga\s*2|division\s*2|segunda|ligue\s*2)\b/i.test(leagueName)) return true;
  return false;
}

// ——— Получение матчей (только Европа, только нужные ведра) ———
async function fetchMatches(maxCount = 100) {
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
      console.log(`🧩 Фолбэк next=400 → найдено на завтра: ${all.length}`);
    }
  }

  // Фильтруем: только УЕФА, исключаем RU/BY
  all = all.filter(m => {
    const country = m.league?.country || '';
    if (EXCLUDED_COUNTRIES.has(country)) return false;
    if (/international|world|europe/i.test(country)) return true; // для сборных — пропускаем как International
    return isUEFA(country);
  });

  // Разложим по ведрам
  const EURO_CUPS = [];
  const TOP_MAJOR = [];
  const REST_EURO = [];
  const NATIONAL_TEAMS = [];
  const EURO_CUPS_DOMESTIC = [];
  const LOWER_DIVS = [];

  for (const m of all) {
    const country = m.league?.country || '';
    const league  = m.league?.name || '';

    if (isEuroCups(league)) {
      EURO_CUPS.push(m);
      continue;
    }
    if (isTopMajor(country, league)) {
      TOP_MAJOR.push(m);
      continue;
    }
    if (isOtherTopUEFA(country, league)) {
      REST_EURO.push(m);
      continue;
    }
    if (isNationalTeams(m)) {
      NATIONAL_TEAMS.push(m);
      continue;
    }
    if (isEuroDomesticCup(country, league)) {
      EURO_CUPS_DOMESTIC.push(m);
      continue;
    }
    if (isLowerDivisionUEFA(country, league)) {
      LOWER_DIVS.push(m);
      continue;
    }
    // остальное отбрасываем
  }

  // Внутри каждого ведра: страна → лига → стабильно
  const byCountry = (x) => x.league?.country || '';
  const byLeague  = (x) => x.league?.name || '';
  const stableSort = (arr) =>
    arr.map((m, i) => ({ m, i }))
       .sort((a, b) =>
         byCountry(a.m).localeCompare(byCountry(b.m)) ||
         byLeague(a.m).localeCompare(byLeague(b.m)) ||
         (a.i - b.i)
       )
       .map(x => x.m);

  const EURO_CUPS_sorted        = stableSort(EURO_CUPS);
  const TOP_MAJOR_sorted        = stableSort(TOP_MAJOR);
  const REST_EURO_sorted        = stableSort(REST_EURO);
  const NATIONAL_TEAMS_sorted   = stableSort(NATIONAL_TEAMS);
  const EURO_DOMESTIC_sorted    = stableSort(EURO_CUPS_DOMESTIC);
  const LOWER_DIVS_sorted       = stableSort(LOWER_DIVS);

  const result = [
    ...EURO_CUPS_sorted,
    ...TOP_MAJOR_sorted,
    ...REST_EURO_sorted,
    ...NATIONAL_TEAMS_sorted,
    ...EURO_DOMESTIC_sorted,
    ...LOWER_DIVS_sorted
  ].slice(0, maxCount);

  console.log(`✅ К генерации: EURO=${EURO_CUPS_sorted.length}, TOP=${TOP_MAJOR_sorted.length}, REST=${REST_EURO_sorted.length}, NT=${NATIONAL_TEAMS_sorted.length}, CUPS=${EURO_DOMESTIC_sorted.length}, LOWER=${LOWER_DIVS_sorted.length} | total=${result.length}`);
  return result;
}

// ——— ИИ: разнообразие + только половинки в тоталах ———
async function generateAllPredictions(matches) {
  const list = matches.map((m,i)=>`${i+1}. ${m.teams.home.name} vs ${m.teams.away.name}`).join('\n');
  const prompt = `
Ты спортивный аналитик. СГЕНЕРИРУЙ по одному прогнозу на каждый матч (строго русский язык).
Разрешённые форматы (без точек/хвостов, один в строке):
1) "Победа <точное имя команды>"
2) "Тотал больше <1.5|2.5|3.5|4.5>"
3) "Тотал меньше <1.5|2.5|3.5|4.5>"
4) "Обе забьют-да"
5) "Обе забьют-нет"
6) "<точное имя команды> Фора <+1|+1.5|+2|−1|−1.5|−2>"

ТРЕБОВАНИЯ:
- Используй РАЗНООБРАЗИЕ типов (не более 40% строк — "Победа ...").
- Все тоталы — ТОЛЬКО .5 (никаких целых 2/3/4).
- Никаких "двойной шанс", "ничья", пояснений.
- Ровно по одной строке на матч.

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

  // Фолбэк: ротация шаблонов
  const templates = ['WIN_HOME','OVER','BTTS_YES','HANDICAP_HOME','UNDER','WIN_AWAY','BTTS_NO','HANDICAP_AWAY'];
  let ti = 0;
  return matches.map((m) => {
    const t = templates[ti++ % templates.length];
    if (t === 'OVER') return `Тотал больше 2.5`;
    if (t === 'UNDER') return `Тотал меньше 2.5`;
    if (t === 'BTTS_YES') return `Обе забьют-да`;
    if (t === 'BTTS_NO') return `Обе забьют-нет`;
    if (t === 'HANDICAP_HOME') return `${m.teams.home.name} Фора -1`;
    if (t === 'HANDICAP_AWAY') return `${m.teams.away.name} Фора +1.5`;
    if (t === 'WIN_AWAY') return `Победа ${m.teams.away.name}`;
    return `Победа ${m.teams.home.name}`;
  });
}

// ——— Пост-обработка прогнозов ———
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
function toHalfString(x) {
  const n = Number(String(x).replace(',', '.')) || 2.5;
  const target = Math.max(0.5, Math.round(n - 0.5) + 0.5);
  return target.toFixed(1);
}
function quantizeOver(n) {
  const v = Number(String(n).replace(',', '.')) || 2.5;
  if (v <= 1.9) return '1.5';
  if (v <= 2.9) return '2.5';
  if (v <= 3.9) return '3.5';
  return '4.5';
}
function quantizeUnder(n) {
  const v = Number(String(n).replace(',', '.')) || 2.5;
  if (v <= 1.9) return '1.5';
  if (v <= 2.9) return '2.5';
  if (v <= 3.9) return '3.5';
  return '4.5';
}

function sanitizePredictionText(text, homeName, awayName, favoriteName) {
  if (!text) return text;
  const orig = text.trim();
  const core = stripContext(orig);
  const t = normalize(core);
  const home = normalize(homeName);
  const away = normalize(awayName);

  // ОЗ
  let m = t.match(/^обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i);
  if (m) return `Обе забьют-${m[1].toLowerCase()==='да'?'да':'нет'}`;

  // ТБ/ТМ → только *.5
  m = core.match(/Тотал\s+больше\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) return `Тотал больше ${quantizeOver(m[1])}`;
  m = core.match(/Тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (m) {
    const num = Number(String(m[1]).replace(',', '.'));
    if (Number.isInteger(num)) return `Тотал меньше ${(num-0.5).toFixed(1)}`;
    return `Тотал меньше ${toHalfString(num)}`;
  }
  m = core.match(/\bТБ\s*([0-9]+(?:[.,][0-9]+)?)\b/i);
  if (m) return `Тотал больше ${quantizeOver(m[1])}`;
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

  // фолбэк
  return `Победа ${favoriteName}`;
}

// ——— Favbet приоритет и рынки ———
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
      const nmRaw = String(v.value || v.handicap || '').replace(',', '.');
      const odd = v.odd;
      switch (market) {
        case '1X2':
          if ((outcome==='1' && /^(1|home)$/i.test(nmRaw)) ||
              (outcome==='2' && /^(2|away)$/i.test(nmRaw)) ||
              (outcome==='X' && /^(x|draw)$/i.test(nmRaw))) return odd;
          break;
        case 'Both Teams To Score':
          if ((outcome==='Yes' && /^yes$/i.test(nmRaw)) || (outcome==='No' && /^no$/i.test(nmRaw))) return odd;
          break;
        case 'Total Goals': {
          const over = outcome.startsWith('Over ');
          const num  = outcome.split(' ')[1];
          const name = String(v.value || '').toLowerCase();
          const hc   = String(v.handicap || '').replace(',', '.');
          if (over && /over/i.test(name) && hc.includes(num)) return odd;
          if (!over && /under/i.test(name) && hc.includes(num)) return odd;
          break;
        }
        case 'Handicap': {
          const target = outcome.split(' ')[1];
          if (nmRaw === target || target.includes(nmRaw)) return odd;
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

  // ОЗ
  m = t.match(/^обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i);
  if (m) return { market:'Both Teams To Score', outcome: m[1]==='да'?'Yes':'No' };

  // Тоталы
  m = core.match(/^Тотал\s+больше\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return { market:'Total Goals', outcome:`Over ${quantizeOver(m[1])}` };
  m = core.match(/^Тотал\s+меньше\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) return { market:'Total Goals', outcome:`Under ${quantizeUnder(m[1])}` };

  // Фора "<Команда> Фора n"
  m = core.match(/^(.+?)\s+Фора\s*([+\-]?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (m) {
    const who = normalize(m[1]);
    const sign = String(m[2]).replace(',', '.');
    const side = who.includes(home) ? 'home' : who.includes(away) ? 'away' : 'home';
    const signNorm = (/^[+-]/.test(sign) ? sign : `+${sign}`);
    return { market:'Handicap', outcome:`${side} ${signNorm}` };
  }

  return { market:'1X2', outcome:'1' };
}

// ——— Сохранение в черновики ———
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

  // Пакеты коэффициентов (для фаворита и рынков)
  const oddsPacks = {};
  for (const m of matches) {
    try {
      oddsPacks[m.fixture.id] = (await safeGet(ODDS_URL, { fixture: m.fixture.id, timezone: 'Europe/Kiev' }))?.[0] || null;
    } catch { oddsPacks[m.fixture.id] = null; }
  }

  // Генерация ИИ
  const ai = await generateAllPredictions(matches);

  // Пост-обработка и коэффициенты
  const cards = [];
  let winCount = 0;
  const winLimit = Math.floor(matches.length * 0.4);

  for (let i=0;i<matches.length;i++) {
    const match = matches[i];
    const pack = oddsPacks[match.fixture.id];
    const favorite = chooseFavoriteName(match.teams.home.name, match.teams.away.name, pack);

    let predText = sanitizePredictionText(ai[i] || '', match.teams.home.name, match.teams.away.name, favorite);

    if (/^Победа\s+/i.test(predText)) {
      winCount++;
      if (winCount > winLimit) {
        predText = Math.random() < 0.5 ? `Тотал больше 2.5` : `Тотал меньше 2.5`;
      }
    }

    const { market, outcome } = detectMarketAndOutcome(predText, match.teams.home.name, match.teams.away.name);
    let odd = pickOddFromPack(pack, market, outcome);
    if (!odd) odd = getRandomOdds();

    cards.push({ match, predText, odd });
  }

  // Переводы команд
  const allTeams = matches.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // === Формирование названия турнира с учётом КУБКОВ ===
  function buildTournamentTitle(m) {
    const datePart = ddmmyy(m.fixture.date);
    const leagueName = m.league?.name || '';
    const country = m.league?.country || '';

    if (isEuroCups(leagueName)) {
      // Еврокубки — страна не пишем
      return `Футбол.${datePart} ${leagueName}`;
    }
    if (isEuroDomesticCup(country, leagueName)) {
      // Национальные кубки — добавляем страну
      return `Футбол.${datePart} ${country} ${leagueName}`;
    }
    // Остальные турниры — страна + лига (чтобы было однозначно)
    return `Футбол.${datePart} ${country} ${leagueName}`;
  }

  const predictions = cards.map(({ match, predText, odd }, idx) => ({
    id: Date.now() + idx,
    country: match.league.country || '',
    league:  match.league.name || '',
    date:    ddmmyy(match.fixture.date),
    tournament: buildTournamentTitle(match),
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
