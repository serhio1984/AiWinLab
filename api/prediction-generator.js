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

// ——— Еврокубки (детектор) ———
const UEFA_KEYS = ['uefa','euro','europa','conference','champions league','european championship','qualifying','qualification'];
const lc = (s) => (s || '').toLowerCase().normalize('NFKD');

function isInternational(match) {
  const country = lc(match.league?.country);
  const league  = lc(match.league?.name);
  return (
    country === 'international' ||
    country === 'world' ||
    country === 'europe' ||
    UEFA_KEYS.some(k => league.includes(k))
  );
}

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

// ——— Завтрашний день (Киев) ———
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
    return res.data?.response || [];
  } catch (e) {
    console.error(`❌ GET ${url} fail:`, e.response?.status, e.response?.data || e.message);
    return [];
  }
}

// ——— Получение матчей ———
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
    }
  }

  let selected = ONLY_EUROPE ? all.filter(isEuropeanMatch) : all;

  // приоритет: еврокубки → товарищеские → топ-лиги → остальное; внутри — по времени
  const EURO = /(uefa|champions league|europa|conference|european championship|qualifying|qualification)/i;
  const FRIENDLY = /(friendly|friendlies|club friendlies|товарищеск)/i;
  const TOP = new Set([
    'Premier League','La Liga','Serie A','Bundesliga','Ligue 1','Eredivisie','Primeira Liga',
    'Scottish Premiership','Ukrainian Premier League','Belgian Pro League','Swiss Super League',
    'Austrian Bundesliga','Super Lig','Super League','Danish Superliga','Eliteserien','Allsvenskan',
    'Ekstraklasa','Czech Liga','1. HNL','HNL','NB I','SuperLiga','Liga I','Championship'
  ]);
  const leagueName = m => String(m.league?.name || '');
  const leagueType = m => String(m.league?.type || '');
  const isEuro = m => EURO.test(leagueName(m)) || (/International|World|Europe/i.test(String(m.league?.country||'')) && EURO.test(leagueName(m)));
  const isFriendly = m => FRIENDLY.test(leagueName(m)) || /friendly/i.test(leagueType(m));
  const isTop = m => TOP.has(leagueName(m));
  const prio = m => (isEuro(m)?1 : isFriendly(m)?2 : isTop(m)?3 : 4);

  selected.sort((a,b) => {
    const pa=prio(a), pb=prio(b);
    if (pa!==pb) return pa-pb;
    return new Date(a.fixture.date)-new Date(b.fixture.date);
  });

  return selected.slice(0, maxCount);
}

// ——— Нормализация/санитайз текста прогнозов ———
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

  // Двойной шанс/не проиграет → Победа фаворита/указанной команды
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

// ——— Детект рынка и выбор коэффициента (Favbet приоритетно) ———
function isFavbet(name='') {
  const n = String(name).toLowerCase();
  return n.includes('fav');
}
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

    const oddsPack = (await safeGet(ODDS_URL, { fixture: match.fixture.id, timezone: 'Europe/Kiev' }))?.[0] || null;
    const favorite = chooseFavoriteName(match.teams.home.name, match.teams.away.name, oddsPack);

    const raw = ai[i] || '';
    const predText = sanitizePredictionText(raw, match.teams.home.name, match.teams.away.name, favorite);

    const { market, outcome } = detectMarketAndOutcome(predText, match.teams.home.name, match.teams.away.name);
    let odd = pickOddFromPack(oddsPack, market, outcome);
    if (!odd) odd = getRandomOdds();

    cards.push({ match, predText, odd });
  }

  // сортировка: еврокубки → страна → время → лига
  const EURO = /(uefa|champions league|europa|conference|european championship|qualifying|qualification)/i;
  const COUNTRY_ORDER = [
    'England','Spain','Italy','Germany','France','Netherlands','Portugal',
    'Scotland','Turkey','Greece','Belgium','Austria','Switzerland','Poland','Ukraine','Russia'
  ];
  const countryRank = (c='') => {
    const idx = COUNTRY_ORDER.indexOf(String(c));
    return idx === -1 ? COUNTRY_ORDER.length + 1 : idx;
  };

  cards.sort((a,b) => {
    const la = String(a.match.league?.name||'');
    const lb = String(b.match.league?.name||'');
    const ca = String(a.match.league?.country||'');
    const cb = String(b.match.league?.country||'');
    const aEuro = EURO.test(la) || isInternational(a.match);
    const bEuro = EURO.test(lb) || isInternational(b.match);
    if (aEuro!==bEuro) return aEuro ? -1 : 1;
    if (!aEuro && !bEuro) {
      const ra = countryRank(ca), rb = countryRank(cb);
      if (ra!==rb) return ra-rb;
    }
    const ta = new Date(a.match.fixture.date).getTime();
    const tb = new Date(b.match.fixture.date).getTime();
    if (ta!==tb) return ta-tb;
    return la.localeCompare(lb);
  });

  // Перевод названий команд
  const allTeams = matches.flatMap(m => [m.teams.home.name, m.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  // Формируем документ — ВАЖНО: храним country и league отдельно + date
  const predictions = cards.map(({ match, predText, odd }, idx) => ({
    id: Date.now() + idx,
    country: match.league.country || '',             // ← отдельным полем
    league:  match.league.name || '',                // ← отдельным полем
    date:    ddmmyy(match.fixture.date),             // ← отдельным полем (dd.mm.yy)
    tournament: `Футбол.${ddmmyy(match.fixture.date)} ${match.league.name || ''}`, // legacy строка (оставили)
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
