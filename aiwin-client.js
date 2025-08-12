const telegram = window.Telegram?.WebApp;

if (telegram) {
  telegram.ready();
  telegram.expand();
  console.log('✅ Telegram WebApp initialized');
}

// ===== Языки (визуальный перевод UI и прогноза) =====
const lang = localStorage.getItem('app_lang') || 'ru';

const translations = {
  ru: {
    slogan: "Умные ставки. Большие выигрыши.",
    hello: "Привет",
    guest: "Гость",
    buyCoins: "Купить монеты",
    unlock: "Разблокировать",
    locked: "🔒 Прогноз заблокирован",
    notEnough: "Недостаточно монет",
    footballWord: "Футбол",
    handicapWord: "Фора"
  },
  uk: {
    slogan: "Розумні ставки. Великі виграші.",
    hello: "Привіт",
    guest: "Гість",
    buyCoins: "Купити монети",
    unlock: "Розблокувати",
    locked: "🔒 Прогноз заблоковано",
    notEnough: "Недостатньо монет",
    footballWord: "Футбол",
    handicapWord: "Фора"
  },
  en: {
    slogan: "Smart bets. Big wins.",
    hello: "Hello",
    guest: "Guest",
    buyCoins: "Buy coins",
    unlock: "Unlock",
    locked: "🔒 Prediction locked",
    notEnough: "Not enough coins",
    footballWord: "Football",
    handicapWord: "Handicap"
  }
};

function normalizeLower(s='') {
  return s.toLowerCase().normalize('NFKD').replace(/\s+/g,' ').trim();
}

// ===== Международные турниры: строгая детекция по ключам =====
function isInternationalTournament(name = "") {
  const n = normalizeLower(name);
  return [
    'uefa champions league', 'лига чемпионов', 'ліга чемпіонів',
    'uefa europa league', 'лига европы', 'ліга європи',
    'uefa europa conference', 'лига конференц', 'ліга конференц',
    'european championship', 'чемпионат европы', 'чемпіонат європи',
    'euro ', 'euro-', ' euro', // на всякий
    'qualification', 'квалификац', 'відбір'
  ].some(k => n.includes(k));
}

function detectInternationalKey(name='') {
  const n = normalizeLower(name);
  if (/champions league|ліга чемпіонів|лига чемпионов/.test(n)) return 'ucl';
  if (/europa league|ліга європи|лига европы/.test(n)) return 'uel';
  if (/conference league|ліга конференц|лига конференц/.test(n)) return 'uecl';
  return null;
}

// ===== Переводы названий еврокубков (визуально) =====
const INT_LEAGUE_LABELS = {
  ru: {
    ucl: 'Лига Чемпионов УЕФА',
    uel: 'Лига Европы УЕФА',
    uecl: 'Лига Конференций УЕФА'
  },
  uk: {
    ucl: 'Ліга Чемпіонів УЄФА',
    uel: 'Ліга Європи УЄФА',
    uecl: 'Ліга Конференцій УЄФА'
  },
  en: {
    ucl: 'UEFA Champions League',
    uel: 'UEFA Europa League',
    uecl: 'UEFA Europa Conference League'
  }
};

// ===== Страны (локализация подписей; и русские родительные для парсинга) =====
const COUNTRY_LABELS = {
  ru: {
    england: 'Англия',
    spain: 'Испания',
    italy: 'Италия',
    germany: 'Германия',
    france: 'Франция',
    netherlands: 'Нидерланды',
    portugal: 'Португалия',
    ukraine: 'Украина',
    scotland: 'Шотландия',
    turkey: 'Турция',
    greece: 'Греция',
    belgium: 'Бельгия',
    austria: 'Австрия',
    switzerland: 'Швейцария',
    poland: 'Польша'
  },
  uk: {
    england: 'Англія',
    spain: 'Іспанія',
    italy: 'Італія',
    germany: 'Німеччина',
    france: 'Франція',
    netherlands: 'Нідерланди',
    portugal: 'Португалія',
    ukraine: 'Україна',
    scotland: 'Шотландія',
    turkey: 'Туреччина',
    greece: 'Греція',
    belgium: 'Бельгія',
    austria: 'Австрія',
    switzerland: 'Швейцарія',
    poland: 'Польща'
  },
  en: {
    england: 'England',
    spain: 'Spain',
    italy: 'Italy',
    germany: 'Germany',
    france: 'France',
    netherlands: 'Netherlands',
    portugal: 'Portugal',
    ukraine: 'Ukraine',
    scotland: 'Scotland',
    turkey: 'Turkey',
    greece: 'Greece',
    belgium: 'Belgium',
    austria: 'Austria',
    switzerland: 'Switzerland',
    poland: 'Poland'
  }
};

const RU_GENITIVE_TO_KEY = {
  'англии': 'england',
  'испании': 'spain',
  'италии': 'italy',
  'германии': 'germany',
  'франции': 'france',
  'нидерландов': 'netherlands',
  'португалии': 'portugal',
  'украины': 'ukraine',
  'шотландии': 'scotland',
  'турции': 'turkey',
  'греции': 'greece',
  'бельгии': 'belgium',
  'австрии': 'austria',
  'швейцарии': 'switzerland',
  'польши': 'poland'
};

const EN_COUNTRY_TO_KEY = {
  'england': 'england',
  'spain': 'spain',
  'italy': 'italy',
  'germany': 'germany',
  'france': 'france',
  'netherlands': 'netherlands',
  'portugal': 'portugal',
  'ukraine': 'ukraine',
  'scotland': 'scotland',
  'turkey': 'turkey',
  'greece': 'greece',
  'belgium': 'belgium',
  'austria': 'austria',
  'switzerland': 'switzerland',
  'poland': 'poland'
};

function extractCountryKeyFromLeagueName(leagueName = '') {
  const n = normalizeLower(leagueName);
  for (const [ruGen, key] of Object.entries(RU_GENITIVE_TO_KEY)) {
    if (n.includes(ruGen)) return key;
  }
  for (const [enName, key] of Object.entries(EN_COUNTRY_TO_KEY)) {
    if (n.includes(enName)) return key;
  }
  return null;
}

// ===== Парсер строки турнира "Футбол.dd.mm.yy LeagueName" =====
function parseTournament(original='') {
  const m = original.match(/^Футбол\.(\d{2}\.\d{2}\.\d{2})\s+(.+)$/i);
  if (!m) return { datePart: null, leagueRaw: original };
  return { datePart: m[1], leagueRaw: m[2] };
}

// ===== Преобразование строки турнира для показа =====
function renderTournamentLine(original) {
  if (!original) return original;

  const { datePart, leagueRaw } = parseTournament(original);
  if (!leagueRaw) return original.replace(/^Футбол/i, translations[lang].footballWord);

  // Международные → только название турнира (локализуем если можем)
  if (isInternationalTournament(leagueRaw)) {
    const key = detectInternationalKey(leagueRaw);
    if (key && INT_LEAGUE_LABELS[lang][key]) return INT_LEAGUE_LABELS[lang][key];
    return leagueRaw;
  }

  // Внутренние → страна из названия лиги
  const countryKey = extractCountryKeyFromLeagueName(leagueRaw);
  if (countryKey && datePart) {
    const countryName = COUNTRY_LABELS[lang][countryKey] || COUNTRY_LABELS.ru[countryKey] || '';
    if (countryName) return `${countryName}.${datePart} ${leagueRaw}`;
  }

  // Фолбэк — просто локализуем "Футбол"
  return original.replace(/^Футбол/i, translations[lang].footballWord);
}

/**
 * Визуальный перевод текста прогноза (без изменения оригинала).
 */
function translatePredictionText(original, target) {
  try {
    if (!original || target === 'ru') return original;

    const norm = (s) =>
      s.replace(/[–—−]/g, '-')   // тире → дефис
       .replace(/\s+/g, ' ')     // сжать пробелы
       .replace(/\s*-\s*/g, ' - ')
       .trim();

    const t = norm(original);

    const NUM  = '([0-9]+(?:[\\.,][0-9]+)?)';
    const TEAM = '(.+?)';

    const rules = [
      // ===== ОБЕ ЗАБЬЮТ =====
      {
        re: /^Обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i,
        tr: (m) => {
          const yn = (m[1] || '').toLowerCase();
          if (target === 'en') return `Both teams to score — ${yn === 'да' ? 'yes' : 'no'}`;
          return `Обидві заб'ють — ${yn === 'да' ? 'так' : 'ні'}`;
        }
      },
      {
        re: /^Обе(?:\s+команды)?\s+забьют$/i,
        tr: () => (target === 'en' ? 'Both teams to score' : "Обидві заб'ють")
      },

      // ===== Тоталы =====
      { // "Тотал больше X"
        re: new RegExp(`^Тотал\\s+больше\\s+${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}`
      },
      { // "Тотал меньше X"
        re: new RegExp(`^Тотал\\s+меньше\\s+${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}`
      },
      { // "ТБ X"
        re: new RegExp(`^ТБ\\s*${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}`
      },
      { // "ТМ X"
        re: new RegExp(`^ТМ\\s*${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}`
      },

      // ===== Форы =====
      // "Фора -1.5 на {TEAM}" → EN: Handicap TEAM -1.5, UK: Фора TEAM -1.5
      {
        re: new RegExp(`^Фора\\s*([\\+\\-]?${NUM})\\s*на\\s+${TEAM}$`, 'i'),
        tr: (m) => {
          const h = (m[1] || '').replace(',', '.');
          const tm = m[2];
          return target === 'en' ? `Handicap ${tm} ${h}` : `Фора ${tm} ${h}`;
        }
      },
      // "{TEAM} Фора -1.5"
      {
        re: new RegExp(`^${TEAM}\\s+Фора\\s*([\\+\\-]?${NUM})$`, 'i'),
        tr: (m) => {
          const tm = m[1];
          const h  = (m[2] || '').replace(',', '.');
          return target === 'en' ? `Handicap ${tm} ${h}` : `Фора ${tm} ${h}`;
        }
      },

      // ===== Исходы =====
      {
        re: new RegExp(`^Победа\\s+${TEAM}$`, 'i'),
        tr: (m) => target === 'en' ? `Win ${m[1]}` : `Перемога ${m[1]}`
      },
      { re: /^Ничья$/i, tr: () => (target === 'en' ? 'Draw' : 'Нічия') },

      // Короткие исходы (резерв)
      { re: /^П1$/i, tr: () => (target === 'en' ? 'Home win' : 'Перемога господарів') },
      { re: /^П2$/i, tr: () => (target === 'en' ? 'Away win' : 'Перемога гостей') },
      { re: /^Х$/i,  tr: () => (target === 'en' ? 'Draw' : 'Нічия') }
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

// ===== Профиль пользователя (только чтение для UI и balance) =====
function getUserProfileRaw() {
  let u = telegram?.initDataUnsafe?.user;
  if (!u) {
    try {
      const saved = localStorage.getItem('tg_user');
      if (saved) u = JSON.parse(saved);
    } catch {}
  }
  return u || null;
}
function getUserId() {
  const u = getUserProfileRaw();
  return u?.id || null;
}

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

// ======= Сортировка: Еврокубки → страны → дата → лига =======
const COUNTRY_ORDER = [
  'england','spain','italy','germany','france','netherlands','portugal',
  'scotland','turkey','greece','belgium','austria','switzerland','poland','ukraine'
];

function countryRankFromLeague(leagueRaw='') {
  const key = extractCountryKeyFromLeagueName(leagueRaw);
  if (!key) return COUNTRY_ORDER.length + 1; // «остальные»
  const idx = COUNTRY_ORDER.indexOf(key);
  return idx === -1 ? COUNTRY_ORDER.length : idx; // неизвестные — в хвост, но перед «остальными»
}

function parseDatePart(datePart) {
  // dd.mm.yy -> Date (в локали браузера)
  if (!datePart) return null;
  const [d, m, y] = datePart.split('.').map(Number);
  // y как 20yy
  const fullY = 2000 + (isNaN(y) ? 0 : y);
  const dt = new Date(fullY, (m || 1) - 1, d || 1, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function sortPredictionsClient(arr=[]) {
  return [...arr].sort((a, b) => {
    const { datePart: da, leagueRaw: la } = parseTournament(a.tournament);
    const { datePart: db, leagueRaw: lb } = parseTournament(b.tournament);

    const aIsEuro = isInternationalTournament(la);
    const bIsEuro = isInternationalTournament(lb);
    if (aIsEuro !== bIsEuro) return aIsEuro ? -1 : 1;

    if (!aIsEuro && !bIsEuro) {
      const ra = countryRankFromLeague(la);
      const rb = countryRankFromLeague(lb);
      if (ra !== rb) return ra - rb;
    }

    // внутри группы — по дате
    const dta = parseDatePart(da)?.getTime() ?? 0;
    const dtb = parseDatePart(db)?.getTime() ?? 0;
    if (dta !== dtb) return dta - dtb;

    // стабильность — по названию лиги
    return String(la || '').localeCompare(String(lb || ''));
  });
}

async function loadPredictions() {
  const userId = getUserId();
  if (!userId) return;

  try {
    // 1) Оригинальные прогнозы
    const response = await fetch(`/api/predictions?userId=${userId}`);
    predictions = await response.json();

    // 2) Сортировка (еврокубки → страны → дата → лига)
    predictions = sortPredictionsClient(predictions);

    // 3) Баланс и профиль
    const u = getUserProfileRaw();
    const balanceResponse = await fetch('/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action: 'get',
        profile: u
      })
    });
    const balanceData = await balanceResponse.json();
    coins = balanceData.coins || 0;

    updateBalance();
    renderPredictions();
  } catch (e) {
    console.error('Ошибка загрузки:', e);
  }
}

async function unlockPrediction(predictionId) {
  const userId = getUserId();
  if (!userId || coins < 1) return alert(translations[lang].notEnough);

  const res = await fetch('/api/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, predictionId })
  });

  const result = await res.json();
  if (result.success) {
    coins = result.coins;
    updateBalance();
    await loadPredictions();
  } else {
    alert(result.message || 'Ошибка при разблокировке');
  }
}

function updateBalance() {
  const { coinBalance } = getDOMElements();
  if (coinBalance) coinBalance.textContent = coins;
}

/**
 * Рендер карточек (переводим текст прогноза и «Футбол» → «Страна»/международные).
 */
function renderPredictions() {
  const { predictionsContainer } = getDOMElements();
  predictionsContainer.innerHTML = '';

  predictions.forEach(p => {
    const div = document.createElement('div');
    div.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
    div.setAttribute('data-id', p.id);

    const textOriginal = p.predictionText || '';
    const textShown = p.isUnlocked
      ? translatePredictionText(textOriginal, lang)
      : translations[lang].locked;

    const tournamentShown = renderTournamentLine(p.tournament);

    div.innerHTML = `
      <div class="teams">
        <span class="tournament">${tournamentShown}</span>
        <div class="team-row"><img src="${p.logo1}"> ${p.team1}</div>
        <div class="team-row"><img src="${p.logo2}"> ${p.team2}</div>
      </div>
      <span class="odds">${p.odds}</span>
      <div class="prediction-text" data-original="${textOriginal.replace(/"/g, '&quot;')}">${textShown}</div>
    `;

    if (!p.isUnlocked) {
      const unlockBtn = document.createElement('button');
      unlockBtn.className = 'buy-btn unlock-btn';
      unlockBtn.textContent = translations[lang].unlock;
      unlockBtn.onclick = () => unlockPrediction(p.id);
      div.appendChild(unlockBtn);
    }

    predictionsContainer.appendChild(div);
  });
}

// Автообновление раз в 30 сек (только чтение)
setInterval(loadPredictions, 30000);

// Инициализация
loadUserData();
loadPredictions();
