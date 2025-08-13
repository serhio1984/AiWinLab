const telegram = window.Telegram?.WebApp;

if (telegram) {
  telegram.ready();
  telegram.expand();
  console.log('✅ Telegram WebApp initialized');
}

// ===== Языки =====
const lang = localStorage.getItem('app_lang') || 'ru';

const translations = {
  ru: {
    slogan: "Умные ставки. Большие выигрыши.",
    hello: "Привет",
    guest: "Гость",
    buyCoins: "Купить монеты",
    unlock: "Разблокировать",
    locked: "🔒 Прогноз заблокирован",
    notEnough: "Недостаточно монет"
  },
  uk: {
    slogan: "Розумні ставки. Великі виграші.",
    hello: "Привіт",
    guest: "Гість",
    buyCoins: "Купити монети",
    unlock: "Розблокувати",
    locked: "🔒 Прогноз заблоковано",
    notEnough: "Недостатньо монет"
  },
  en: {
    slogan: "Smart bets. Big wins.",
    hello: "Hello",
    guest: "Guest",
    buyCoins: "Buy coins",
    unlock: "Unlock",
    locked: "🔒 Prediction locked",
    notEnough: "Not enough coins"
  }
};

function nlc(s=''){ return s.toLowerCase().normalize('NFKD'); }

// ——— Справочники локализаций стран/лиг ———
const COUNTRY_I18N = {
  ru: {
    England:'Англия', Spain:'Испания', Italy:'Италия', Germany:'Германия', France:'Франция',
    Netherlands:'Нидерланды', Portugal:'Португалия', Scotland:'Шотландия', Turkey:'Турция',
    Greece:'Греция', Belgium:'Бельгия', Austria:'Австрия', Switzerland:'Швейцария',
    Poland:'Польша', Ukraine:'Украина', Russia:'Россия'
  },
  uk: {
    England:'Англія', Spain:'Іспанія', Italy:'Італія', Germany:'Німеччина', France:'Франція',
    Netherlands:'Нідерланди', Portugal:'Португалія', Scotland:'Шотландія', Turkey:'Туреччина',
    Greece:'Греція', Belgium:'Бельгія', Austria:'Австрія', Switzerland:'Швейцарія',
    Poland:'Польща', Ukraine:'Україна', Russia:'Росія'
  },
  en: {
    England:'England', Spain:'Spain', Italy:'Italy', Germany:'Germany', France:'France',
    Netherlands:'Netherlands', Portugal:'Portugal', Scotland:'Scotland', Turkey:'Turkey',
    Greece:'Greece', Belgium:'Belgium', Austria:'Austria', Switzerland:'Switzerland',
    Poland:'Poland', Ukraine:'Ukraine', Russia:'Russia'
  }
};

// Лиги: перевод по стране И названию лиги (жёсткие соответствия, без «склейки»)
// ключ: country -> (оригинальное имя из API) -> перевод
const LEAGUE_I18N = {
  ru: {
    International: {
      'UEFA Champions League': 'Лига Чемпионов УЕФА',
      'UEFA Europa League': 'Лига Европы УЕФА',
      'UEFA Europa Conference League': 'Лига Конференций УЕФА'
    },
    England: {
      'Premier League': 'Премьер-Лига Англии',
      'Championship': 'Чемпионшип'
    },
    Spain: { 'La Liga': 'Ла Лига Испании' },
    Italy: { 'Serie A': 'Серия А Италии' },
    Germany: { 'Bundesliga': 'Бундеслига Германии' },
    France: { 'Ligue 1': 'Лига 1 Франции' },
    Netherlands: { 'Eredivisie': 'Эредивизи Нидерландов' },
    Portugal: { 'Primeira Liga': 'Примейра Лига Португалии' },
    Scotland: { 'Premiership': 'Шотландская Премьер-Лига' },
    Russia: { 'Premier League': 'Премьер-Лига России' },
    Ukraine: { 'Premier League': 'Премьер-Лига Украины' },
    Belgium: { 'Pro League': 'Про Лига Бельгии' },
    Austria: { 'Bundesliga': 'Бундеслига Австрии' },
    Switzerland: { 'Super League': 'Суперлига Швейцарии' },
    Turkey: { 'Super Lig': 'Супер Лиг Турции' },
    Greece: { 'Super League 1': 'Суперлига Греции' },
    Poland: { 'Ekstraklasa': 'Экстракляса Польши' }
  },
  uk: {
    International: {
      'UEFA Champions League': 'Ліга Чемпіонів УЄФА',
      'UEFA Europa League': 'Ліга Європи УЄФА',
      'UEFA Europa Conference League': 'Ліга Конференцій УЄФА'
    },
    England: {
      'Premier League': 'Премʼєр-ліга Англії',
      'Championship': 'Чемпіоншип'
    },
    Spain: { 'La Liga': 'Ла Ліга Іспанії' },
    Italy: { 'Serie A': 'Серія А Італії' },
    Germany: { 'Bundesliga': 'Бундесліга Німеччини' },
    France: { 'Ligue 1': 'Ліга 1 Франції' },
    Netherlands: { 'Eredivisie': 'Ередивізі Нідерландів' },
    Portugal: { 'Primeira Liga': 'Прімейра Ліга Португалії' },
    Scotland: { 'Premiership': 'Шотландська Премʼєр-ліга' },
    Russia: { 'Premier League': 'Премʼєр-ліга Росії' },
    Ukraine: { 'Premier League': 'Премʼєр-ліга України' },
    Belgium: { 'Pro League': 'Про-ліга Бельгії' },
    Austria: { 'Bundesliga': 'Бундесліга Австрії' },
    Switzerland: { 'Super League': 'Суперліга Швейцарії' },
    Turkey: { 'Super Lig': 'Супер Ліг Туреччини' },
    Greece: { 'Super League 1': 'Суперліга Греції' },
    Poland: { 'Ekstraklasa': 'Екстракляса Польщі' }
  },
  en: {
    International: {
      'UEFA Champions League': 'UEFA Champions League',
      'UEFA Europa League': 'UEFA Europa League',
      'UEFA Europa Conference League': 'UEFA Europa Conference League'
    },
    England: {
      'Premier League': 'Premier League',
      'Championship': 'Championship'
    },
    Spain: { 'La Liga': 'La Liga' },
    Italy: { 'Serie A': 'Serie A' },
    Germany: { 'Bundesliga': 'Bundesliga' },
    France: { 'Ligue 1': 'Ligue 1' },
    Netherlands: { 'Eredivisie': 'Eredivisie' },
    Portugal: { 'Primeira Liga': 'Primeira Liga' },
    Scotland: { 'Premiership': 'Scottish Premiership' },
    Russia: { 'Premier League': 'Russian Premier League' },
    Ukraine: { 'Premier League': 'Ukrainian Premier League' },
    Belgium: { 'Pro League': 'Belgian Pro League' },
    Austria: { 'Bundesliga': 'Austrian Bundesliga' },
    Switzerland: { 'Super League': 'Swiss Super League' },
    Turkey: { 'Super Lig': 'Süper Lig' },
    Greece: { 'Super League 1': 'Super League Greece' },
    Poland: { 'Ekstraklasa': 'Ekstraklasa' }
  }
};

function isInternationalName(country, league) {
  const c = String(country||'');
  const l = nlc(league||'');
  return c==='International' || c==='World' || c==='Europe' ||
         ['champions league','europa league','conference'].some(k=>l.includes(k));
}

function i18nLeague(country, league) {
  const map = LEAGUE_I18N[lang] || LEAGUE_I18N.ru;
  const cMap = map[country] || map['International'] || {};
  return cMap[league] || league;
}

function i18nCountry(country) {
  return (COUNTRY_I18N[lang]||COUNTRY_I18N.ru)[country] || country || '';
}

// ===== профиль пользователя =====
function getUserProfileRaw() {
  let u = telegram?.initDataUnsafe?.user;
  if (!u) {
    try { const s = localStorage.getItem('tg_user'); if (s) u = JSON.parse(s); } catch {}
  }
  return u || null;
}
function getUserId() { return getUserProfileRaw()?.id || null; }

function getDOMElements() {
  return {
    coinBalance: document.getElementById('coinBalance'),
    predictionsContainer: document.getElementById('predictions'),
    userProfilePic: document.getElementById('userProfilePic'),
    userName: document.getElementById('userName'),
    sloganEl: document.querySelector('.logo p'),
    buyBtn: document.querySelector('.buy-btn')
  };
}

function loadUserData() {
  const { userProfilePic, userName, sloganEl, buyBtn } = getDOMElements();
  const u = getUserProfileRaw();
  if (u) {
    userName.textContent = `${translations[lang].hello}, ${u.first_name || translations[lang].guest}`;
    userProfilePic.src = u.photo_url || 'https://dummyimage.com/50x50/000/fff&text=User';
    localStorage.setItem('tg_user', JSON.stringify(u));
  } else {
    userName.textContent = `${translations[lang].hello}, ${translations[lang].guest}`;
    userProfilePic.src = 'https://dummyimage.com/50x50/000/fff&text=User';
  }
  if (sloganEl) sloganEl.textContent = translations[lang].slogan;
  if (buyBtn) buyBtn.textContent = translations[lang].buyCoins;
}

// ===== сортировка: еврокубки → страны → дата → лига =====
const COUNTRY_ORDER = [
  'England','Spain','Italy','Germany','France','Netherlands','Portugal',
  'Scotland','Turkey','Greece','Belgium','Austria','Switzerland','Poland','Ukraine','Russia'
];
function countryRank(c='') {
  const i = COUNTRY_ORDER.indexOf(String(c));
  return i === -1 ? COUNTRY_ORDER.length + 1 : i;
}
function parseDateStr(s='') {
  // dd.mm.yy -> timestamp
  const m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return 0;
  const dd = +m[1], mm = +m[2], yy = 2000 + (+m[3]||0);
  const d = new Date(yy, mm-1, dd, 0,0,0);
  return d.getTime() || 0;
}
function sortPredictionsClient(arr=[]) {
  return [...arr].sort((a,b) => {
    const aIntl = isInternationalName(a.country, a.league);
    const bIntl = isInternationalName(b.country, b.league);
    if (aIntl !== bIntl) return aIntl ? -1 : 1;

    if (!aIntl && !bIntl) {
      const ra = countryRank(a.country), rb = countryRank(b.country);
      if (ra !== rb) return ra - rb;
    }

    const ta = parseDateStr(a.date || '');
    const tb = parseDateStr(b.date || '');
    if (ta !== tb) return ta - tb;

    return String(a.league||'').localeCompare(String(b.league||''));
  });
}

// ===== визуальный перевод прогнозов (как было) =====
function translatePredictionText(original, target) {
  try {
    if (!original || target === 'ru') return original;
    const norm = s => s.replace(/[–—−]/g,'-').replace(/\s+/g,' ').replace(/\s*-\s*/g,' - ').trim();
    const t = norm(original);
    const NUM='([0-9]+(?:[\\.,][0-9]+)?)', TEAM='(.+?)';
    const rules = [
      { re: /^Обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i,
        tr: m => target==='en' ? `Both teams to score — ${m[1].toLowerCase()==='да'?'yes':'no'}` :
                                 `Обидві заб'ють — ${m[1].toLowerCase()==='да'?'так':'ні'}` },
      { re: /^Обе(?:\s+команды)?\s+забьют$/i,
        tr: () => target==='en' ? 'Both teams to score' : `Обидві заб'ють` },

      { re: new RegExp(`^Тотал\\s+больше\\s+${NUM}$`, 'i'),
        tr: m => target==='en' ? `Over ${m[1].replace(',','.') } goals` : `Тотал більше ${m[1].replace(',','.')}` },
      { re: new RegExp(`^Тотал\\s+меньше\\s+${NUM}$`, 'i'),
        tr: m => target==='en' ? `Under ${m[1].replace(',','.') } goals` : `Тотал менше ${m[1].replace(',','.')}` },
      { re: new RegExp(`^ТБ\\s*${NUM}$`, 'i'),
        tr: m => target==='en' ? `Over ${m[1].replace(',','.') } goals` : `Тотал більше ${m[1].replace(',','.')}` },
      { re: new RegExp(`^ТМ\\s*${NUM}$`, 'i'),
        tr: m => target==='en' ? `Under ${m[1].replace(',','.') } goals` : `Тотал менше ${m[1].replace(',','.')}` },

      { re: new RegExp(`^Фора\\s*([\\+\\-]?${NUM})\\s*на\\s+${TEAM}$`, 'i'),
        tr: m => target==='en' ? `Handicap ${m[2]} ${m[1].replace(',','.')}` : `Фора ${m[2]} ${m[1].replace(',','.')}` },
      { re: new RegExp(`^${TEAM}\\s+Фора\\s*([\\+\\-]?${NUM})$`, 'i'),
        tr: m => target==='en' ? `Handicap ${m[1]} ${m[2].replace(',','.')}` : `Фора ${m[1]} ${m[2].replace(',','.')}` },

      { re: new RegExp(`^Победа\\s+${TEAM}$`, 'i'),
        tr: m => target==='en' ? `Win ${m[1]}` : `Перемога ${m[1]}` },
      { re: /^Ничья$/i, tr: () => target==='en' ? 'Draw' : 'Нічия' }
    ];
    for (const r of rules) {
      const m = t.match(r.re);
      if (m) return r.tr(m);
    }
    return original;
  } catch (e) {
    console.error('translatePredictionText error:', e);
    return original;
  }
}

let coins = 0;
let predictions = [];

// ===== UI =====
function updateBalance() {
  const el = document.getElementById('coinBalance');
  if (el) el.textContent = coins;
}

function formatTournamentLine(p) {
  // если еврокубок — только локализованное имя турнира
  if (isInternationalName(p.country, p.league)) {
    return i18nLeague('International', p.league || '');
  }
  // внутренний чемпионат: "Страна.dd.mm.yy Лига"
  const countryName = i18nCountry(p.country || '');
  const dateStr = p.date || ''; // уже dd.mm.yy из сервера
  const leagueTitle = i18nLeague(p.country || '', p.league || '');
  if (countryName && dateStr) return `${countryName}.${dateStr} ${leagueTitle}`;
  if (countryName) return `${countryName} ${leagueTitle}`;
  return leagueTitle || p.tournament || ''; // фолбэк
}

function renderPredictions() {
  const container = document.getElementById('predictions');
  container.innerHTML = '';
  predictions.forEach(p => {
    const card = document.createElement('div');
    card.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
    card.setAttribute('data-id', p.id);

    const textOriginal = p.predictionText || '';
    const textShown = p.isUnlocked ? translatePredictionText(textOriginal, lang) : translations[lang].locked;
    const header = formatTournamentLine(p);

    card.innerHTML = `
      <div class="teams">
        <span class="tournament">${header}</span>
        <div class="team-row"><img src="${p.logo1}"> ${p.team1}</div>
        <div class="team-row"><img src="${p.logo2}"> ${p.team2}</div>
      </div>
      <span class="odds">${p.odds}</span>
      <div class="prediction-text" data-original="${textOriginal.replace(/"/g,'&quot;')}">${textShown}</div>
    `;

    if (!p.isUnlocked) {
      const btn = document.createElement('button');
      btn.className = 'buy-btn unlock-btn';
      btn.textContent = translations[lang].unlock;
      btn.onclick = () => unlockPrediction(p.id);
      card.appendChild(btn);
    }

    container.appendChild(card);
  });
}

// ===== API =====
function getUserId(){ const u=getUserProfileRaw(); return u?.id||null; }

async function loadPredictions() {
  const userId = getUserId();
  if (!userId) return;
  try {
    const r = await fetch(`/api/predictions?userId=${userId}`);
    predictions = await r.json();

    // сортировка по новым полям
    predictions = sortPredictionsClient(predictions);

    // баланс и профиль
    const u = getUserProfileRaw();
    const b = await fetch('/balance', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ userId, action:'get', profile:u })
    });
    const bd = await b.json();
    coins = bd.coins || 0;

    updateBalance();
    renderPredictions();
  } catch(e) {
    console.error('loadPredictions error:', e);
  }
}

async function unlockPrediction(predictionId) {
  const userId = getUserId();
  if (!userId || coins < 1) return alert(translations[lang].notEnough);
  const res = await fetch('/api/unlock', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ userId, predictionId })
  });
  const data = await res.json();
  if (data.success) {
    coins = data.coins;
    updateBalance();
    await loadPredictions();
  } else {
    alert(data.message || 'Ошибка при разблокировке');
  }
}

// автообновление
setInterval(loadPredictions, 30000);

// init
(function init(){
  const { sloganEl, buyBtn, userProfilePic, userName } = getDOMElements();
  loadUserData();
  loadPredictions();
})();
