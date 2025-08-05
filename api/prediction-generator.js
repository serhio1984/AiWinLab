// generatePredictions.js
// Полная версия: 1 матч = 1 запрос в OpenAI, + реальные коэффициенты из API-Football.
// CommonJS (require) совместимо с твоим проектом.

const axios = require('axios');
const OpenAI = require('openai');
const { MongoClient } = require('mongodb');
const { getTranslatedTeams } = require('./translate-teams');

// === ENV / API KEYS ===
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true';

// Флаг: фильтровать только Европу (по умолчанию ВКЛ)
const ONLY_EUROPE = process.env.ONLY_EUROPE !== 'false';

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// === API URLs ===
const FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const ODDS_URL = 'https://v3.football.api-sports.io/odds';
const TEAMS_STATS_URL = 'https://v3.football.api-sports.io/teams/statistics';
const H2H_URL = 'https://v3.football.api-sports.io/fixtures/headtohead';

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
  'Faroe Islands','Israel','Kazakhstan','Russia',
  'International','World','Europe'
];

const UEFA_KEYWORDS = [
  'uefa','euro','europa','conference','champions league',
  'european championship','qualifying','qualification'
];

const norm = (s) => (s || '').toLowerCase().normalize('NFKD');

function isEuropeanMatch(m) {
  const country = norm(m.league?.country);
  const league = norm(m.league?.name);
  if (EUROPEAN_COUNTRIES.map(norm).includes(country)) return true;
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
  const from = start.toISOString().split('T')[0];
  const to = end.toISOString().split('T')[0];
  return { from, to };
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

// === Получение матчей на завтра (с приоритезацией) ===
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
      all = next.filter((m) => {
        const dt = new Date(m.fixture.date);
        return dt >= zStart && dt < zEnd;
      });
      console.log(`🧩 Фолбэк next=200 → отфильтровано на завтра: ${all.length}`);
    }
  }

  const leaguesList = [...new Set(all.map((m) => `${m.league?.country} — ${m.league?.name}`))].sort();
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

  const EURO_REGEX = /(uefa|champions league|europa|conference|european championship|qualifying|qualification)/i;
  const FRIENDLY_REGEX = /(friendly|friendlies|club friendlies|товарищеск)/i;
  const TOP_LEAGUES = new Set([
    'Premier League','La Liga','Serie A','Bundesliga','Ligue 1','Eredivisie','Primeira Liga',
    'Scottish Premiership','Ukrainian Premier League','Belgian Pro League','Swiss Super League',
    'Austrian Bundesliga','Super Lig','Super League','Danish Superliga','Eliteserien','Allsvenskan',
    'Ekstraklasa','Czech Liga','1. HNL','HNL','NB I','SuperLiga','Liga I'
  ]);

  const leagueName = (m) => String(m.league?.name || '');
  const leagueType = (m) => String(m.league?.type || '');
  const isEuroCup = (m) => {
    const name = leagueName(m);
    const country = String(m.league?.country || '');
    return EURO_REGEX.test(name) || (/International|World|Europe/i.test(country) && EURO_REGEX.test(name));
  };
  const isFriendly = (m) => FRIENDLY_REGEX.test(leagueName(m)) || /friendly/i.test(leagueType(m));
  const isTopLeague = (m) => TOP_LEAGUES.has(leagueName(m));

  const priorityOf = (m) => {
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
    const map = new Map(selected.map((m) => [m.fixture.id, m]));
    for (const m of all) {
      if (map.size >= maxCount) break;
      if (!map.has(m.fixture.id)) map.set(m.fixture.id, m);
    }
    selected = [...map.values()];
    selected.sort((a, b) => {
      const pa = priorityOf(a);
      const pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      return new Date(a.fixture.date) - new Date(b.fixture.date);
    });
    console.log(`🔁 Добрали до: ${selected.length}`);
  }

  const final = selected.slice(0, maxCount);
  console.log(`✅ Итого к генерации (после приоритета): ${final.length}`);
  return final;
}

// === Статистика команд + H2H (кэшируется в памяти на запуск) ===
const _statsCache = new Map();
const cacheKey = (prefix, params) => prefix + ':' + Object.entries(params).sort().map(([k,v])=>`${k}=${v}`).join('&');
function seasonOf(m) {
  return m.league?.season || new Date(m.fixture.date).getUTCFullYear();
}

async function fetchTeamStats(leagueId, season, teamId) {
  const key = cacheKey('teamstats', { leagueId, season, teamId });
  if (_statsCache.has(key)) return _statsCache.get(key);
  const items = await safeGet(TEAMS_STATS_URL, { league: leagueId, season, team: teamId });
  const s = Array.isArray(items) ? items[0] : items;
  const val = (!s || !s.goals) ? null : {
    rank: s?.league?.standings?.[0]?.[0]?.rank || s?.league?.rank,
    form: s?.form || '',
    avgGoalsFor: s?.goals?.for?.average?.total,
    avgGoalsAgainst: s?.goals?.against?.average?.total,
    bttsPct: s?.both_teams_to_score?.percentage || s?.both_teams_to_score?.overall?.percentage,
    cleanSheets: s?.clean_sheet?.total,
    failedToScore: s?.failed_to_score?.total,
    homeAvg: s?.goals?.for?.average?.home,
    awayAvg: s?.goals?.for?.average?.away
  };
  _statsCache.set(key, val);
  return val;
}

async function fetchH2H(homeId, awayId, limit = 5) {
  const key = cacheKey('h2h', { homeId, awayId, limit });
  if (_statsCache.has(key)) return _statsCache.get(key);
  const list = await safeGet(H2H_URL, { h2h: `${homeId}-${awayId}`, last: limit });
  if (!Array.isArray(list) || list.length === 0) {
    const val = { count: 0, avgTotal: null, bttsCount: 0 };
    _statsCache.set(key, val);
    return val;
  }
  let goals = 0, btts = 0;
  for (const f of list) {
    const hs = f.goals?.home ?? 0;
    const as = f.goals?.away ?? 0;
    goals += (hs + as);
    if (hs > 0 && as > 0) btts++;
  }
  const val = { count: list.length, avgTotal: (goals / list.length).toFixed(2), bttsCount: btts };
  _statsCache.set(key, val);
  return val;
}

function buildStatsText({ homeName, awayName, homeStats, awayStats, h2h, leagueName, kickoff }) {
  return `
МАТЧ: ${homeName} vs ${awayName}
ТУРНИР: ${leagueName}
ВРЕМЯ (UTC): ${new Date(kickoff).toISOString().replace('T',' ').slice(0,16)}

ФОРМА:
- ${homeName}: ${homeStats?.form || '-'}
- ${awayName}: ${awayStats?.form || '-'}

СРЕДНИЕ ГОЛЫ:
- ${homeName}: ${homeStats?.avgGoalsFor ?? '-'} за матч (дом: ${homeStats?.homeAvg ?? '-'})
- ${awayName}: ${awayStats?.avgGoalsFor ?? '-'} за матч (в гостях: ${awayStats?.awayAvg ?? '-'})

ОБОРОНА:
- ${homeName}: пропускает в среднем ${homeStats?.avgGoalsAgainst ?? '-'}
- ${awayName}: пропускает в среднем ${awayStats?.avgGoalsAgainst ?? '-'}

BTTS (оба забьют):
- История очных: ${h2h.bttsCount}/${h2h.count}
- Команды: ${homeName} BTTS% ~ ${homeStats?.bttsPct ?? '-'}, ${awayName} BTTS% ~ ${awayStats?.bttsPct ?? '-'}

H2H (последние ${h2h.count}):
- Средний тотал: ${h2h.avgTotal ?? '-'}
`.trim();
}

// === Очередь/пул выполнения (без зависимостей) ===
function createPool({ concurrency = 4, minDelayMs = 250 }) {
  let active = 0;
  const queue = [];
  let lastTs = 0;

  async function run(task) {
    const now = Date.now();
    const delay = Math.max(0, minDelayMs - (now - lastTs));
    await new Promise(res => setTimeout(res, delay));
    lastTs = Date.now();
    return task();
  }

  async function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    try {
      const res = await run(task);
      resolve(res);
    } catch (e) {
      reject(e);
    } finally {
      active--;
      next();
    }
  }

  function schedule(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
  }

  return { schedule };
}

// === Реальные коэффициенты: агрегация рынков ===
// Будем собирать лучшие (max) коэффициенты по рынкам:
// 1X2 (Match Winner), Goals O/U (2.5 и 3.5), BTTS, Asian Handicap (линии -0.25,-0.5,+0.25,+0.5,+1.0 и т.п.)
async function fetchAggregatedOdds(fixtureId) {
  const data = await safeGet(ODDS_URL, { fixture: fixtureId, timezone: 'Europe/Kiev' });
  if (!data.length) return {};

  const best = {
    '1X2': { '1': null, X: null, '2': null },
    OU: { '2.5': { OVER: null, UNDER: null }, '3.5': { OVER: null, UNDER: null } },
    BTTS: { YES: null, NO: null },
    AH: {} // ключ линия (напр. home_-0.25, away_+1.0) -> odd
  };

  const trySetMax = (obj, key, value) => {
    if (!value) return;
    const v = parseFloat(value);
    if (!obj[key] || v > parseFloat(obj[key])) obj[key] = value;
  };

  for (const bk of (data[0]?.bookmakers || [])) {
    for (const bet of (bk.bets || [])) {
      const name = (bet.name || bet.title || '').toLowerCase();

      // 1X2
      if (name.includes('match winner') || name === '1x2' || name.includes('winner')) {
        for (const v of (bet.values || [])) {
          const valName = (v.value || v.name || '').toUpperCase();
          if (valName.includes('HOME') || valName === '1') trySetMax(best['1X2'], '1', v.odd);
          if (valName.includes('DRAW') || valName === 'X') trySetMax(best['1X2'], 'X', v.odd);
          if (valName.includes('AWAY') || valName === '2') trySetMax(best['1X2'], '2', v.odd);
        }
      }

      // Goals Over/Under
      if (name.includes('goals over/under') || name.includes('over/under')) {
        for (const v of (bet.values || [])) {
          const label = (v.value || '').toUpperCase(); // напр. "Over 2.5"
          const m = label.match(/(OVER|UNDER)\s+(\d+(\.\d+)?)/);
          if (!m) continue;
          const side = m[1]; const line = m[2];
          if (!best.OU[line]) best.OU[line] = { OVER: null, UNDER: null };
          trySetMax(best.OU[line], side, v.odd);
        }
      }

      // BTTS
      if (name.includes('both teams to score') || name.includes('btts')) {
        for (const v of (bet.values || [])) {
          const valName = (v.value || v.name || '').toUpperCase();
          if (valName.includes('YES')) trySetMax(best.BTTS, 'YES', v.odd);
          if (valName.includes('NO')) trySetMax(best.BTTS, 'NO', v.odd);
        }
      }

      // Asian Handicap / Handicap
      if (name.includes('asian handicap') || name.includes('handicap')) {
        for (const v of (bet.values || [])) {
          // Часто формат: "Home -0.25" / "Away +0.5"
          const label = (v.value || '').toLowerCase();
          const m = label.match(/(home|away)\s*([+-]?\d+(\.\d+)?)/);
          if (!m) continue;
          const side = m[1];
          const line = m[2];
          const key = `${side}_${line}`; // напр. "home_-0.25"
          if (!best.AH[key] || parseFloat(v.odd) > parseFloat(best.AH[key])) {
            best.AH[key] = v.odd;
          }
        }
      }
    }
  }
  return best;
}

// Найти коэффициент для выбранного моделью исхода
function findOddsForSelection(pick, oddsPack) {
  // pick.selection: UNDER_2_5 / OVER_2_5 / X / 1X / X2 / YES / NO / AH_HOME_-0_25 / AH_AWAY_+1_0 / и т.п.
  if (!pick || !oddsPack) return null;
  const s = (pick.selection || '').toUpperCase();

  // TOTALS
  if (s.startsWith('UNDER_') || s.startsWith('OVER_')) {
    const parts = s.split('_'); // ['UNDER', '2', '5'] или ['UNDER', '2.5']
    const side = parts[0]; // UNDER/OVER
    let line = parts.slice(1).join('_').replace('_', '.'); // '2.5'
    if (!oddsPack.OU || !oddsPack.OU[line]) {
      // fallback: попробуем ближайшие популярные линии
      const prefer = ['2.5','3.5','2.0','3.0'];
      for (const L of prefer) if (oddsPack.OU?.[L]?.[side]) { line = L; break; }
    }
    const odd = oddsPack.OU?.[line]?.[side] || null;
    return odd ? { market: `Totals ${side} ${line}`, line, outcome: side, odd } : null;
  }

  // DRAW / 1X / X2 / 1 / 2
  if (s === 'X') {
    const odd = oddsPack['1X2']?.X || null;
    return odd ? { market: '1X2', outcome: 'Draw', odd } : null;
  }
  if (s === '1' || s === 'HOME') {
    const odd = oddsPack['1X2']?.['1'] || null;
    return odd ? { market: '1X2', outcome: 'Home', odd } : null;
  }
  if (s === '2' || s === 'AWAY') {
    const odd = oddsPack['1X2']?.['2'] || null;
    return odd ? { market: '1X2', outcome: 'Away', odd } : null;
  }
  if (s === '1X' || s === 'X2') {
    // комбинированные коэффициенты 1X/X2 не всегда в API как отдельный рынок,
    // поэтому оставим null (можно позже добавить синтетическую оценку).
    return null;
  }

  // BTTS
  if (s === 'YES' || s === 'NO') {
    const odd = oddsPack.BTTS?.[s] || null;
    return odd ? { market: 'BTTS', outcome: s, odd } : null;
  }

  // AH
  if (s.startsWith('AH_HOME_') || s.startsWith('AH_AWAY_')) {
    const key = s.startsWith('AH_HOME_')
      ? `home_${s.replace('AH_HOME_', '').replace('_', '.')}`
      : `away_${s.replace('AH_AWAY_', '').replace('_', '.')}`;
    const odd = oddsPack.AH?.[key] || null;
    return odd ? { market: 'Asian Handicap', line: key, outcome: key, odd } : null;
  }

  return null;
}

// === LLM: один матч → один ответ (жёсткий JSON) ===
async function llmPickOne(statsText, marketSnapshotText) {
  const system = `Ты спортивный аналитик. Дай ОДИН конкретный исход ставки из списка.
- Разрешённые типы: TOTAL_UNDER, TOTAL_OVER, DRAW, DOUBLE_CHANCE, BOTH_TEAMS_TO_SCORE, ASIAN_HANDICAP.
- Твоя задача — выбрать исход, который согласуется с рынком: избегай заведомо "длинных" ставок с вероятностью < 35% (по рынку) и слишком очевидных > 75%. Предпочитай диапазон коэффициентов ~1.50–2.50, если статистика и рынок не противоречат.
- Если уверенность ниже 60 — верни {"decision":"SKIP"}.
- Используй ТОЛЬКО факты из статистики и снапшота рынка, не выдумывай травмы/новости.
- Ответ строго JSON без лишнего текста.`;

  const user = `
СТАТИСТИКА МАТЧА (факты):
${statsText}

СНАПШОТ РЫНКА (лучшие коэффициенты):
${marketSnapshotText}

ТРЕБУЕМЫЙ JSON:
{
  "bet_type": "TOTAL_UNDER | TOTAL_OVER | DRAW | DOUBLE_CHANCE | BOTH_TEAMS_TO_SCORE | ASIAN_HANDICAP",
  "selection": "UNDER_2_5 | OVER_2_5 | X | 1X | X2 | YES | NO | AH_HOME_-0_25 | AH_AWAY_+1_0 ...",
  "reason": "кратко, 1-2 предложения по цифрам и рынку",
  "confidence": 0-100,
  "variety_bucket": "totals | handicap | draws | dc | btts"
}
Если данных недостаточно или уверенность < 60 — верни {"decision":"SKIP"}.
`.trim();

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    top_p: 0.9,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  const txt = resp.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(txt); } catch { return { decision: 'SKIP' }; }
}

function bucketOf(p) {
  if (p?.variety_bucket) return p.variety_bucket;
  if (p?.bet_type?.includes('TOTAL')) return 'totals';
  if (p?.bet_type === 'ASIAN_HANDICAP') return 'handicap';
  if (p?.bet_type === 'DOUBLE_CHANCE') return 'dc';
  if (p?.selection === 'X' || p?.bet_type === 'DRAW') return 'draws';
  if (p?.bet_type === 'BOTH_TEAMS_TO_SCORE') return 'btts';
  return 'other';
}

function selectionToText(p, homeName, awayName) {
  const s = (p.selection || '').toUpperCase();
  if (s.startsWith('UNDER_')) return `Тотал меньше ${s.split('_').slice(1).join('_').replace('_','.')}`;
  if (s.startsWith('OVER_'))  return `Тотал больше ${s.split('_').slice(1).join('_').replace('_','.')}`;
  if (s === 'X') return 'Ничья';
  if (s === '1X') return `${homeName} или ничья`;
  if (s === 'X2') return `${awayName} или ничья`;
  if (s === 'YES') return 'Обе забьют — да';
  if (s === 'NO')  return 'Обе забьют — нет';
  if (s.startsWith('AH_HOME_')) return `Фора ${homeName} ${s.replace('AH_HOME_','').replace('_','.')}`;
  if (s.startsWith('AH_AWAY_')) return `Фора ${awayName} ${s.replace('AH_AWAY_','').replace('_','.')}`;
  if (s === '1' || s === 'HOME') return `Победа ${homeName}`;
  if (s === '2' || s === 'AWAY') return `Победа ${awayName}`;
  return 'Надёжный исход';
}

// === Батч генерации с очередью и ротацией ===
async function generateAllPredictions(matches) {
  const pool = createPool({ concurrency: 4, minDelayMs: 250 });

  // квоты по типам (подправь под себя)
  const quota = { totals: 12, dc: 8, handicap: 6, btts: 6, draws: 8, other: 4 };
  const left = (b) => (quota[b] ?? 0) > 0;

  const out = [];
  const tasks = [];

  for (const m of matches) {
    tasks.push(pool.schedule(async () => {
      const leagueId = m.league.id;
      const season = seasonOf(m);
      const homeId = m.teams.home.id;
      const awayId = m.teams.away.id;

      const [homeStats, awayStats, h2h, oddsPack] = await Promise.all([
        fetchTeamStats(leagueId, season, homeId),
        fetchTeamStats(leagueId, season, awayId),
        fetchH2H(homeId, awayId, 5),
        fetchAggregatedOdds(m.fixture.id)
      ]);

      const homeName = m.teams.home.name;
      const awayName = m.teams.away.name;

      const statsText = buildStatsText({
        homeName, awayName, homeStats, awayStats, h2h,
        leagueName: m.league.name, kickoff: m.fixture.date
      });

      // соберём снапшот рынка «читаемым» текстом для промпта
      const marketSnapshotText = (() => {
        const lines = [];
        if (oddsPack['1X2']) {
          lines.push(`1X2: 1=${oddsPack['1X2']['1'] || '-'} | X=${oddsPack['1X2']['X'] || '-'} | 2=${oddsPack['1X2']['2'] || '-'}`);
        }
        if (oddsPack.OU) {
          for (const L of ['2.5','3.5']) {
            if (oddsPack.OU[L]) {
              lines.push(`Totals ${L}: OVER=${oddsPack.OU[L].OVER || '-'} | UNDER=${oddsPack.OU[L].UNDER || '-'}`);
            }
          }
        }
        if (oddsPack.BTTS) {
          lines.push(`BTTS: YES=${oddsPack.BTTS.YES || '-'} | NO=${oddsPack.BTTS.NO || '-'}`);
        }
        if (oddsPack.AH) {
          const ahSamples = Object.entries(oddsPack.AH).slice(0, 6).map(([k,v])=>`${k}=${v}`);
          if (ahSamples.length) lines.push(`AH: ${ahSamples.join(' | ')}`);
        }
        return lines.join('\n');
      })();

      const pick = await llmPickOne(statsText, marketSnapshotText);
      if (pick?.decision === 'SKIP' || (pick?.confidence ?? 0) < 60) return;

      const bucket = bucketOf(pick);
      if (!left(bucket)) return;
      quota[bucket]--;

      // подбираем реальный коэффициент для выбранного исхода
      const matchedOdd = findOddsForSelection(pick, oddsPack);

      out.push({
        match: m,
        pick,
        predictionText: selectionToText(pick, homeName, awayName),
        reason: pick.reason,
        confidence: pick.confidence,
        odds: matchedOdd ? String(matchedOdd.odd) : null,
        oddsMeta: matchedOdd // market/line/outcome/odd
      });
    }));
  }

  await Promise.all(tasks);
  return out.slice(0, 40);
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
  if (!FOOTBALL_API_KEY) throw new Error('FOOTBALL_API_KEY is missing');
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is missing');

  const matches = await fetchMatches(40);
  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    await saveToDraft([]);
    return [];
  }

  const aiPredictions = await generateAllPredictions(matches);
  if (!aiPredictions.length) {
    console.warn('AI вернул пусто (всё SKIP).');
    await saveToDraft([]);
    return [];
  }

  // Переводы команд (рус)
  const allTeams = aiPredictions.flatMap(({ match }) => [match.teams.home.name, match.teams.away.name]);
  const teamTranslations = await getTranslatedTeams(allTeams);

  const predictions = aiPredictions.map(({ match, predictionText, reason, confidence, odds, oddsMeta }, i) => {
    const t1 = teamTranslations[match.teams.home.name] || match.teams.home.name;
    const t2 = teamTranslations[match.teams.away.name] || match.teams.away.name;

    return {
      id: Date.now() + i,
      tournament: formatTournament(match),
      team1: t1,
      logo1: match.teams.home.logo,
      team2: t2,
      logo2: match.teams.away.logo,
      predictionText,
      odds,            // реальный коэффициент, если найден
      meta: {
        reason,
        confidence,
        market: oddsMeta?.market || null,
        line: oddsMeta?.line || null,
        outcome: oddsMeta?.outcome || null
      }
    };
  });

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
