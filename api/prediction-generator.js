// generatePredictions.js — NO-SKIP + VARIETY-RING
// 40 прогнозов на завтра: реальные odds, план разнообразия, очередь, кэш.
// ENV: FOOTBALL_API_KEY, OPENAI_API_KEY, MONGODB_URI, ONLY_EUROPE (true/false)

const axios = require('axios');
const OpenAI = require('openai');
const { MongoClient } = require('mongodb');
const { getTranslatedTeams } = require('./translate-teams');

// ==== ENV ====
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://aiwinuser:aiwinsecure123@cluster0.detso80.mongodb.net/predictionsDB?retryWrites=true&w=majority&tls=true';

const ONLY_EUROPE = process.env.ONLY_EUROPE !== 'false';

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// ==== API URLs ====
const FIXTURES_URL = 'https://v3.football.api-sports.io/fixtures';
const ODDS_URL = 'https://v3.football.api-sports.io/odds';
const TEAMS_STATS_URL = 'https://v3.football.api-sports.io/teams/statistics';
const H2H_URL = 'https://v3.football.api-sports.io/fixtures/headtohead';

// ==== Турниры (перевод) ====
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

// ==== Европа ====
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
  ) return true;
  return false;
}

// ==== Дата (Киев) ====
function getKievDateRangeForTomorrow() {
  const tz = 'Europe/Kiev';
  const kievNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const start = new Date(kievNow);
  start.setDate(start.getDate() + 1);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    from: start.toISOString().split('T')[0],
    to: end.toISOString().split('T')[0]
  };
}

// ==== Формат турнира ====
function formatTournament(match) {
  const date = new Date(match.fixture.date);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(2);
  const league = TOURNAMENT_TRANSLATIONS[match.league.name] || match.league.name;
  return `Футбол.${d}.${m}.${y} ${league}`;
}

// ==== HTTP helper ====
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

// ==== Матчи на завтра ====
async function fetchMatches(maxCount = 40) {
  const tz = 'Europe/Kiev';
  const { from, to } = getKievDateRangeForTomorrow();
  let all = await safeGet(FIXTURES_URL, { date: from, timezone: tz });
  if (all.length === 0) all = await safeGet(FIXTURES_URL, { from, to, timezone: tz });
  if (all.length === 0) {
    const next = await safeGet(FIXTURES_URL, { next: 500, timezone: tz });
    if (next.length > 0) {
      const zStart = new Date(`${from}T00:00:00.000Z`);
      const zEnd = new Date(`${to}T00:00:00.000Z`);
      all = next.filter(m => {
        const dt = new Date(m.fixture.date);
        return dt >= zStart && dt < zEnd;
      });
      console.log(`🧩 Фолбэк next=500 → на завтра: ${all.length}`);
    }
  }

  const leaguesList = [...new Set(all.map(m => `${m.league?.country} — ${m.league?.name}`))].sort();
  console.log(`📅 Завтра (Киев): ${from} → ${to}`);
  console.log(`📊 Матчей найдено: ${all.length}`);
  console.log(`🏷️ Примеры лиг:\n  - ${leaguesList.slice(0,80).join('\n  - ')}`);

  let selected = all;
  if (ONLY_EUROPE) selected = all.filter(isEuropeanMatch);

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

  selected.sort((a,b) => {
    const pa = priorityOf(a), pb = priorityOf(b);
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
    selected = [...map.values()];
    selected.sort((a,b) => {
      const pa = priorityOf(a), pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      return new Date(a.fixture.date) - new Date(b.fixture.date);
    });
  }
  const final = selected.slice(0, maxCount);
  console.log(`✅ К генерации: ${final.length} (ONLY_EUROPE=${ONLY_EUROPE})`);
  return final;
}

// ==== Статистика и H2H (кэш) ====
const _statsCache = new Map();
const cacheKey = (prefix, params) => prefix + ':' + Object.entries(params).sort().map(([k,v])=>`${k}=${v}`).join('&');
function seasonOf(m) { return m.league?.season || new Date(m.fixture.date).getUTCFullYear(); }

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
    _statsCache.set(key, val); return val;
  }
  let goals = 0, btts = 0;
  for (const f of list) {
    const hs = f.goals?.home ?? 0, as = f.goals?.away ?? 0;
    goals += (hs + as); if (hs>0 && as>0) btts++;
  }
  const val = { count: list.length, avgTotal: (goals / list.length).toFixed(2), bttsCount: btts };
  _statsCache.set(key, val); return val;
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

BTTS:
- H2H: ${h2h.bttsCount}/${h2h.count}
- Командные проценты: ${homeName} ~ ${homeStats?.bttsPct ?? '-'}, ${awayName} ~ ${awayStats?.bttsPct ?? '-'}

H2H средний тотал: ${h2h.avgTotal ?? '-'}
`.trim();
}

// ==== Очередь ====
function createPool({ concurrency = 4, minDelayMs = 250 }) {
  let active = 0; const queue = []; let lastTs = 0;
  async function run(task) {
    const now = Date.now(); const delay = Math.max(0, minDelayMs - (now - lastTs));
    await new Promise(r => setTimeout(r, delay)); lastTs = Date.now(); return task();
  }
  async function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++; const { task, resolve, reject } = queue.shift();
    try { resolve(await run(task)); } catch (e) { reject(e); } finally { active--; next(); }
  }
  function schedule(task) { return new Promise((resolve,reject)=>{ queue.push({task,resolve,reject}); next(); }); }
  return { schedule };
}

// ==== Odds агрегатор ====
async function fetchAggregatedOdds(fixtureId) {
  const data = await safeGet(ODDS_URL, { fixture: fixtureId, timezone: 'Europe/Kiev' });
  if (!data.length) return {};
  const best = {
    '1X2': { '1': null, X: null, '2': null },
    OU: { '2.5': { OVER: null, UNDER: null }, '3.5': { OVER: null, UNDER: null } },
    BTTS: { YES: null, NO: null },
    AH: {}
  };
  const trySetMax = (obj, key, value) => {
    if (!value) return;
    const v = parseFloat(value);
    if (!obj[key] || v > parseFloat(obj[key])) obj[key] = value;
  };

  for (const bk of (data[0]?.bookmakers || [])) {
    for (const bet of (bk.bets || [])) {
      const name = (bet.name || bet.title || '').toLowerCase();

      if (name.includes('match winner') || name === '1x2' || name.includes('winner')) {
        for (const v of (bet.values || [])) {
          const nm = (v.value || v.name || '').toUpperCase();
          if (nm.includes('HOME') || nm === '1') trySetMax(best['1X2'], '1', v.odd);
          if (nm.includes('DRAW') || nm === 'X') trySetMax(best['1X2'], 'X', v.odd);
          if (nm.includes('AWAY') || nm === '2') trySetMax(best['1X2'], '2', v.odd);
        }
      }

      if (name.includes('goals over/under') || name.includes('over/under')) {
        for (const v of (bet.values || [])) {
          const lbl = (v.value || '').toUpperCase();
          const m = lbl.match(/(OVER|UNDER)\s+(\d+(\.\d+)?)/);
          if (!m) continue;
          const side = m[1]; const line = m[2];
          if (!best.OU[line]) best.OU[line] = { OVER: null, UNDER: null };
          trySetMax(best.OU[line], side, v.odd);
        }
      }

      if (name.includes('both teams to score') || name.includes('btts')) {
        for (const v of (bet.values || [])) {
          const nm = (v.value || v.name || '').toUpperCase();
          if (nm.includes('YES')) trySetMax(best.BTTS, 'YES', v.odd);
          if (nm.includes('NO')) trySetMax(best.BTTS, 'NO', v.odd);
        }
      }

      if (name.includes('asian handicap') || name.includes('handicap')) {
        for (const v of (bet.values || [])) {
          const lbl = (v.value || '').toLowerCase(); // "Home -0.25"
          const m = lbl.match(/(home|away)\s*([+-]?\d+(\.\d+)?)/);
          if (!m) continue;
          const side = m[1]; const line = m[2];
          const key = `${side}_${line}`;
          if (!best.AH[key] || parseFloat(v.odd) > parseFloat(best.AH[key])) best.AH[key] = v.odd;
        }
      }
    }
  }
  return best;
}

function findOddsForSelection(pick, oddsPack) {
  if (!pick || !oddsPack) return null;
  const s = (pick.selection || '').toUpperCase();

  if (s.startsWith('UNDER_') || s.startsWith('OVER_')) {
    const parts = s.split('_'); const side = parts[0];
    let line = parts.slice(1).join('_').replace('_','.');
    if (!oddsPack.OU || !oddsPack.OU[line]) {
      for (const L of ['2.5','3.5','2.0','3.0']) if (oddsPack.OU?.[L]?.[side]) { line = L; break; }
    }
    const odd = oddsPack.OU?.[line]?.[side] || null;
    return odd ? { market: `Totals ${side} ${line}`, line, outcome: side, odd } : null;
  }

  if (s === 'X') { const odd = oddsPack['1X2']?.X || null; return odd ? { market:'1X2', outcome:'Draw', odd } : null; }
  if (s === '1' || s === 'HOME') { const odd = oddsPack['1X2']?.['1'] || null; return odd ? { market:'1X2', outcome:'Home', odd } : null; }
  if (s === '2' || s === 'AWAY') { const odd = oddsPack['1X2']?.['2'] || null; return odd ? { market:'1X2', outcome:'Away', odd } : null; }
  if (s === '1X' || s === 'X2') return null;

  if (s === 'YES' || s === 'NO') {
    const odd = oddsPack.BTTS?.[s] || null;
    return odd ? { market:'BTTS', outcome:s, odd } : null;
  }

  if (s.startsWith('AH_HOME_') || s.startsWith('AH_AWAY_')) {
    const key = s.startsWith('AH_HOME_')
      ? `home_${s.replace('AH_HOME_','').replace('_','.')}`
      : `away_${s.replace('AH_AWAY_','').replace('_','.')}`;
    const odd = oddsPack.AH?.[key] || null;
    return odd ? { market:'Asian Handicap', line:key, outcome:key, odd } : null;
  }
  return null;
}

// ==== Бакеты / подтипы / план разнообразия ====
function bucketOf(p) {
  if (p?.variety_bucket) return p.variety_bucket;
  const bt = (p?.bet_type || '').toUpperCase();
  if (bt.includes('TOTAL')) return 'totals';
  if (bt === 'ASIAN_HANDICAP') return 'handicap';
  if (bt === 'DOUBLE_CHANCE') return 'dc';
  if (bt === 'BOTH_TEAMS_TO_SCORE') return 'btts';
  if (bt === 'DRAW' || (p.selection || '').toUpperCase() === 'X') return 'draws';
  return 'other';
}
function bucketSubtype(p) {
  const s = (p.selection || '').toUpperCase();
  const bt = (p.bet_type || '').toUpperCase();
  if (bt.includes('TOTAL')) {
    if (s.startsWith('OVER_')) return 'totals_over';
    if (s.startsWith('UNDER_')) return 'totals_under';
    return 'totals_other';
  }
  if (bt === 'DOUBLE_CHANCE') {
    if (s === '1X') return 'dc_1x';
    if (s === 'X2') return 'dc_x2';
    return 'dc';
  }
  if (bt === 'BOTH_TEAMS_TO_SCORE') {
    if (s === 'YES') return 'btts_yes';
    if (s === 'NO')  return 'btts_no';
    return 'btts';
  }
  if (bt === 'ASIAN_HANDICAP') {
    if (s.startsWith('AH_HOME_')) return 'ah_home';
    if (s.startsWith('AH_AWAY_')) return 'ah_away';
    return 'ah';
  }
  if (bt === 'DRAW' || s === 'X') return 'draws';
  return 'other';
}
// 10 подтипов × 4 круга = 40
const VARIETY_RING = [
  'totals_over','dc_x2','btts_yes','ah_home','draws',
  'totals_under','dc_1x','btts_no','ah_away','other'
];

// ==== LLM ====
async function llmPickOne(statsText, marketSnapshotText, desiredSubtype) {
  const system = `Ты спортивный аналитик. Дай ОДИН исход.
- Разрешённые: TOTAL_UNDER, TOTAL_OVER, DRAW, DOUBLE_CHANCE, BOTH_TEAMS_TO_SCORE, ASIAN_HANDICAP.
- Избегай однообразия: не злоупотребляй DOUBLE_CHANCE и UNDER 2.5.
- Если уверенность <55 — {"decision":"SKIP"}.
- Ответ строго JSON.`;

  const varietyHint = desiredSubtype ? `Желаемый тип для разнообразия: ${desiredSubtype}` : '';

  const user = `
СТАТИСТИКА:
${statsText}

РЫНОК:
${marketSnapshotText || '(нет данных)'}
${varietyHint}

ТРЕБУЕМЫЙ JSON:
{
  "bet_type":"TOTAL_UNDER|TOTAL_OVER|DRAW|DOUBLE_CHANCE|BOTH_TEAMS_TO_SCORE|ASIAN_HANDICAP",
  "selection":"UNDER_2_5|OVER_2_5|X|1X|X2|YES|NO|AH_HOME_-0_25|AH_AWAY_+0_25 ...",
  "reason":"1–2 предложения по цифрам/тенденциям",
  "confidence":0-100,
  "variety_bucket":"totals|handicap|draws|dc|btts"
}
Если уверенность <55 — {"decision":"SKIP"}.
`.trim();

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    top_p: 0.9,
    response_format: { type: 'json_object' },
    messages: [{ role:'system', content:system }, { role:'user', content:user }]
  });

  const txt = resp.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(txt); } catch { return { decision:'SKIP' }; }
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

// ==== Фолбэк с учётом разнообразия ====
function fallbackPick({ homeName, awayName, homeStats, awayStats, h2h, oddsPack }, preferSubtype) {
  const rnd = Math.random();
  const avgF = Number(homeStats?.avgGoalsFor || 0);
  const avgA = Number(awayStats?.avgGoalsFor || 0);
  const avgGAh = Number(homeStats?.avgGoalsAgainst || 0);
  const avgGAa = Number(awayStats?.avgGoalsAgainst || 0);
  const avgTotalTeams = (avgF + avgA + avgGAh + avgGAa) / 2 || null;
  const h2hAvg = h2h?.avgTotal ? Number(h2h.avgTotal) : null;

  const haveOver25 = oddsPack?.OU?.['2.5']?.OVER;
  const haveUnder25 = oddsPack?.OU?.['2.5']?.UNDER;

  // Пробуем попасть в желанный подтип
  if (preferSubtype === 'totals_over' && haveOver25)
    return { bet_type:'TOTAL_OVER', selection:'OVER_2_5', reason:'План разнообразия: OVER', confidence:58, variety_bucket:'totals' };
  if (preferSubtype === 'btts_yes' && oddsPack?.BTTS?.YES)
    return { bet_type:'BOTH_TEAMS_TO_SCORE', selection:'YES', reason:'План разнообразия: BTTS YES', confidence:58, variety_bucket:'btts' };
  if (preferSubtype === 'draws')
    return { bet_type:'DRAW', selection:'X', reason:'План разнообразия: ничья', confidence:56, variety_bucket:'draws' };
  if (preferSubtype === 'ah_home' && oddsPack?.AH?.['home_-0.25'])
    return { bet_type:'ASIAN_HANDICAP', selection:'AH_HOME_-0_25', reason:'План разнообразия: AH home -0.25', confidence:56, variety_bucket:'handicap' };
  if (preferSubtype === 'ah_away' && oddsPack?.AH?.['away_+0.25'])
    return { bet_type:'ASIAN_HANDICAP', selection:'AH_AWAY_+0_25', reason:'План разнообразия: AH away +0.25', confidence:56, variety_bucket:'handicap' };
  if (preferSubtype === 'dc_x2')
    return { bet_type:'DOUBLE_CHANCE', selection:'X2', reason:'План разнообразия: DC X2', confidence:56, variety_bucket:'dc' };
  if (preferSubtype === 'dc_1x')
    return { bet_type:'DOUBLE_CHANCE', selection:'1X', reason:'План разнообразия: DC 1X', confidence:56, variety_bucket:'dc' };

  // “Умные” эвристики
  const overBias = (avgTotalTeams && avgTotalTeams >= 2.6) || (h2hAvg && h2hAvg >= 2.6);
  if (overBias && haveOver25 && (rnd < 0.65))
    return { bet_type:'TOTAL_OVER', selection:'OVER_2_5', reason:'Средний тотал ≥ 2.6', confidence:58, variety_bucket:'totals' };

  const bttsBias = (avgF > 1 || avgA > 1) && (avgGAh > 0.8 || avgGAa > 0.8);
  if (oddsPack?.BTTS?.YES && (bttsBias || (h2h?.bttsCount || 0) >= 3) && (rnd < 0.75))
    return { bet_type:'BOTH_TEAMS_TO_SCORE', selection:'YES', reason:'Обе команды забивные', confidence:58, variety_bucket:'btts' };

  if (haveUnder25 && ((avgTotalTeams && avgTotalTeams <= 2.3) || (h2hAvg && h2hAvg <= 2.3)))
    return { bet_type:'TOTAL_UNDER', selection:'UNDER_2_5', reason:'Тенденция к низу', confidence:57, variety_bucket:'totals' };

  if (oddsPack?.['1X2']) {
    const h = parseFloat(oddsPack['1X2']['1'] || '0');
    const a = parseFloat(oddsPack['1X2']['2'] || '0');
    if (h && a) {
      if (h < a * 0.6) return { bet_type:'DOUBLE_CHANCE', selection:(rnd<0.5?'1X':'X2'), reason:'Сильный перекос хозяев', confidence:56, variety_bucket:'dc' };
      if (a < h * 0.6) return { bet_type:'DOUBLE_CHANCE', selection:(rnd<0.5?'X2':'1X'), reason:'Сильный перекос гостей', confidence:56, variety_bucket:'dc' };
    }
  }

  if (oddsPack?.AH?.['home_-0.25'] && rnd < 0.5)
    return { bet_type:'ASIAN_HANDICAP', selection:'AH_HOME_-0_25', reason:'Мягкая фора', confidence:56, variety_bucket:'handicap' };
  if (oddsPack?.AH?.['away_+0.25'])
    return { bet_type:'ASIAN_HANDICAP', selection:'AH_AWAY_+0_25', reason:'Мягкая фора', confidence:56, variety_bucket:'handicap' };

  if (haveOver25 && rnd < 0.5)
    return { bet_type:'TOTAL_OVER', selection:'OVER_2_5', reason:'Баланс разнообразия', confidence:56, variety_bucket:'totals' };
  if (haveUnder25)
    return { bet_type:'TOTAL_UNDER', selection:'UNDER_2_5', reason:'Баланс разнообразия', confidence:56, variety_bucket:'totals' };

  return { bet_type:'DOUBLE_CHANCE', selection:(rnd<0.5?'1X':'X2'), reason:'Запасной DC', confidence:55, variety_bucket:'dc' };
}

// ==== Батч генерации: очередь + план разнообразия (мягкие квоты) ====
async function generateAllPredictions(matches) {
  const pool = createPool({ concurrency: 4, minDelayMs: 250 });

  // мягкие квоты (не блокируют набор 40, просто направляют)
  const quota = { totals: 12, dc: 8, handicap: 8, btts: 6, draws: 6, other: 4 };
  const left = (b) => (quota[b] ?? 0) > 0;

  let varietyIdx = 0;
  const subtypeCount = new Map();
  const incSubtype = (k)=>subtypeCount.set(k,(subtypeCount.get(k)||0)+1);

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

      const marketSnapshotText = (() => {
        const lines = [];
        if (oddsPack['1X2']) lines.push(`1X2: 1=${oddsPack['1X2']['1'] || '-'} | X=${oddsPack['1X2']['X'] || '-'} | 2=${oddsPack['1X2']['2'] || '-'}`);
        if (oddsPack.OU) for (const L of ['2.5','3.5'])
          if (oddsPack.OU[L]) lines.push(`Totals ${L}: OVER=${oddsPack.OU[L].OVER || '-'} | UNDER=${oddsPack.OU[L].UNDER || '-'}`);
        if (oddsPack.BTTS) lines.push(`BTTS: YES=${oddsPack.BTTS.YES || '-'} | NO=${oddsPack.BTTS.NO || '-'}`);
        if (oddsPack.AH) {
          const ahSamples = Object.entries(oddsPack.AH).slice(0,6).map(([k,v])=>`${k}=${v}`);
          if (ahSamples.length) lines.push(`AH: ${ahSamples.join(' | ')}`);
        }
        return lines.join('\n');
      })();

      // желанный подтип по кольцу
      const desired = VARIETY_RING[varietyIdx % VARIETY_RING.length];

      // 1) Пробуем LLM с хинтом
      let pick = await llmPickOne(statsText, marketSnapshotText, desired);
      if (pick?.decision === 'SKIP' || (pick?.confidence ?? 0) < 55) {
        // 2) NO-SKIP: фолбэк с предпочтением подтипа
        pick = fallbackPick({ homeName, awayName, homeStats, awayStats, h2h, oddsPack }, desired);
      }

      const bt = bucketOf(pick);
      const sub = bucketSubtype(pick);
      const remainSlots = 40 - out.length;
      const remainMatches = matches.length - out.length;
      const forceAccept = remainSlots >= remainMatches; // если времени нет — берём всё

      // если совсем не попали — один повтор LLM с тем же desired
      if (sub !== desired && !left(bt) && !forceAccept) {
        const hinted = await llmPickOne(statsText, marketSnapshotText, desired);
        if (!(hinted?.decision === 'SKIP') && (hinted?.confidence ?? 0) >= 55) {
          pick = hinted;
        }
      }

      const finalBt = bucketOf(pick);
      const finalSub = bucketSubtype(pick);

      if (left(finalBt)) quota[finalBt]--;
      incSubtype(finalSub);
      varietyIdx++;

      const matchedOdd = findOddsForSelection(pick, oddsPack);

      out.push({
        match: m,
        pick,
        predictionText: selectionToText(pick, homeName, awayName),
        reason: pick.reason,
        confidence: pick.confidence,
        odds: matchedOdd ? String(matchedOdd.odd) : null,
        oddsMeta: matchedOdd || null
      });
    }));
  }

  await Promise.all(tasks);
  console.log(`🧮 Сгенерировано исходов: ${out.length}`);
  return out.slice(0, 40);
}

// ==== Mongo ====
async function saveToDraft(predictions) {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('predictionsDB');
  const draft = db.collection('draft_predictions');

  await draft.deleteMany({});
  if (predictions.length > 0) await draft.insertMany(predictions);

  await client.close();
  console.log(`💾 Черновики сохранены: ${predictions.length}`);
}

// ==== Основная ====
async function generatePredictions() {
  if (!FOOTBALL_API_KEY) throw new Error('FOOTBALL_API_KEY is missing');
  if (!OPENAI_KEY) console.warn('OPENAI_API_KEY is missing — будет работать только фолбэк');

  const matches = await fetchMatches(40);
  if (!matches.length) {
    console.warn('Нет матчей для прогнозов.');
    await saveToDraft([]);
    return [];
  }

  const aiPredictions = await generateAllPredictions(matches);
  if (!aiPredictions.length) {
    console.warn('Не удалось сгенерировать исходы.');
    await saveToDraft([]);
    return [];
  }

  // Перевод команд (рус)
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
      odds, // null → бейдж не покажется
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

// ==== CLI ====
if (require.main === module) {
  generatePredictions()
    .then(() => console.log('✅ Генерация завершена.'))
    .catch((err) => console.error('❌ Ошибка генерации:', err));
}

module.exports = { generatePredictions };
