const telegram = window.Telegram?.WebApp;

if (telegram) {
  telegram.ready();
  telegram.expand();
  console.log('✅ Telegram WebApp initialized');
}

// ===== Текущий язык интерфейса =====
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
    openAll: "Открыть всё за 60 монет",
    openedAllOk: "Все прогнозы успешно открыты!"
  },
  uk: {
    slogan: "Розумні ставки. Великі виграші.",
    hello: "Привіт",
    guest: "Гість",
    buyCoins: "Купити монети",
    unlock: "Розблокувати",
    locked: "🔒 Прогноз заблоковано",
    notEnough: "Недостатньо монет",
    openAll: "Відкрити все за 60 монет",
    openedAllOk: "Усі прогнози успішно відкриті!"
  },
  en: {
    slogan: "Smart bets. Big wins.",
    hello: "Hello",
    guest: "Guest",
    buyCoins: "Buy coins",
    unlock: "Unlock",
    locked: "🔒 Prediction locked",
    notEnough: "Not enough coins",
    openAll: "Unlock all for 60 coins",
    openedAllOk: "All predictions unlocked!"
  }
};

// ========== НОРМАЛИЗАЦИЯ КЛЮЧЕЙ ДЛЯ i18n ==========
const removeDiacritics = (s='') => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const normKey = (s='') => removeDiacritics(String(s)).toLowerCase().trim();

// ===== i18n стран и лиг + синонимы =====
const COUNTRY_I18N = {
  ru: {
    International: "Международные",
    World: "Мир",
    Europe: "Европа",
    England: "Англия",
    Spain: "Испания",
    Italy: "Италия",
    Germany: "Германия",
    France: "Франция",
    Netherlands: "Нидерланды",
    Portugal: "Португалия",
    Scotland: "Шотландия",
    Turkey: "Турция",
    Greece: "Греция",
    Belgium: "Бельгия",
    Austria: "Австрия",
    Switzerland: "Швейцария",
    Poland: "Польша",
    Ukraine: "Украина",
    Norway: "Норвегия",
    Sweden: "Швеция",
    Denmark: "Дания",
    "Czech Republic": "Чехия",
    Czechia: "Чехия",
    Croatia: "Хорватия",
    Serbia: "Сербия",
    Romania: "Румыния",
    Hungary: "Венгрия",
    Slovakia: "Словакия",
    Slovenia: "Словения",
    Bulgaria: "Болгария",
    Finland: "Финляндия",
    Iceland: "Исландия",
    Cyprus: "Кипр",
    Ireland: "Ирландия",
    Wales: "Уэльс",
    "Northern Ireland": "Северная Ирландия",
    Israel: "Израиль",
    Kazakhstan: "Казахстан",
  },
  uk: {
    International: "Міжнародні",
    World: "Світ",
    Europe: "Європа",
    England: "Англія",
    Spain: "Іспанія",
    Italy: "Італія",
    Germany: "Німеччина",
    France: "Франція",
    Netherlands: "Нідерланди",
    Portugal: "Португалія",
    Scotland: "Шотландія",
    Turkey: "Туреччина",
    Greece: "Греція",
    Belgium: "Бельгія",
    Austria: "Австрія",
    Switzerland: "Швейцарія",
    Poland: "Польща",
    Ukraine: "Україна",
    Norway: "Норвегія",
    Sweden: "Швеція",
    Denmark: "Данія",
    "Czech Republic": "Чехія",
    Czechia: "Чехія",
    Croatia: "Хорватія",
    Serbia: "Сербія",
    Romania: "Румунія",
    Hungary: "Угорщина",
    Slovakia: "Словаччина",
    Slovenia: "Словенія",
    Bulgaria: "Болгарія",
    Finland: "Фінляндія",
    Iceland: "Ісландія",
    Cyprus: "Кіпр",
    Ireland: "Ірландія",
    Wales: "Уельс",
    "Northern Ireland": "Північна Ірландія",
    Israel: "Ізраїль",
    Kazakhstan: "Казахстан",
  },
  en: {
    International: "International",
    World: "World",
    Europe: "Europe",
    England: "England",
    Spain: "Spain",
    Italy: "Italy",
    Germany: "Germany",
    France: "France",
    Netherlands: "Netherlands",
    Portugal: "Portugal",
    Scotland: "Scotland",
    Turkey: "Turkey",
    Greece: "Greece",
    Belgium: "Belgium",
    Austria: "Austria",
    Switzerland: "Switzerland",
    Poland: "Poland",
    Ukraine: "Ukraine",
    Norway: "Norway",
    Sweden: "Sweden",
    Denmark: "Denmark",
    "Czech Republic": "Czech Republic",
    Czechia: "Czechia",
    Croatia: "Croatia",
    Serbia: "Serbia",
    Romania: "Romania",
    Hungary: "Hungary",
    Slovakia: "Slovakia",
    Slovenia: "Slovenia",
    Bulgaria: "Bulgaria",
    Finland: "Finland",
    Iceland: "Iceland",
    Cyprus: "Cyprus",
    Ireland: "Ireland",
    Wales: "Wales",
    "Northern Ireland": "Northern Ireland",
    Israel: "Israel",
    Kazakhstan: "Kazakhstan",
  }
};

const LEAGUE_I18N = {
  ru: {
    "UEFA Champions League": "Лига Чемпионов УЕФА",
    "Champions League": "Лига Чемпионов УЕФА",
    "UEFA Europa League": "Лига Европы УЕФА",
    "Europa League": "Лига Европы УЕФА",
    "UEFA Europa Conference League": "Лига Конференций УЕФА",
    "Europa Conference League": "Лига Конференций УЕФА",
    "UEFA Super Cup": "Суперкубок УЕФА",
    "UEFA Nations League": "Лига Наций УЕФА",
    "UEFA European Championship": "Чемпионат Европы УЕФА",

    "Premier League": "Премьер-Лига Англии",
    "La Liga": "Ла Лига Испании",
    "Serie A": "Серия А Италии",
    "Bundesliga": "Бундеслига Германии",
    "Ligue 1": "Лига 1 Франции",
    "Eredivisie": "Эредивизи Нидерландов",
    "Primeira Liga": "Примейра Лига Португалии",

    "Scottish Premiership": "Шотландская Премьершип",
    "Süper Lig": "Суперлига Турции",
    "Super Lig": "Суперлига Турции",
    "Super League 1": "Суперлига Греции",
    "Super League Greece": "Суперлига Греции",

    "Pro League": "Про Лига Бельгии",
    "Jupiler Pro League": "Про Лига Бельгии",
    "First Division A": "Про Лига Бельгии",
    "Austrian Bundesliga": "Бундеслига Австрии",
    "Swiss Super League": "Суперлига Швейцарии",

    "Ekstraklasa": "Экстракляса Польши",
    "Ukrainian Premier League": "Украинская Премьер-Лига",
    "Allsvenskan": "Алльсвенскан Швеции",
    "Eliteserien": "Элитсериен Норвегии",
    "Superliga": "Суперлига Дании",
    "Danish Superliga": "Суперлига Дании",

    "Championship": "Чемпионшип Англии",
    "Segunda División": "Сегунда Испании",
    "Segunda Division": "Сегунда Испании",
    "Serie B": "Серия B Италии",
    "2. Bundesliga": "Вторая Бундеслига",
    "Ligue 2": "Лига 2 Франции",
  },
  uk: {
    "UEFA Champions League": "Ліга Чемпіонів УЄФА",
    "Champions League": "Ліга Чемпіонів УЄФА",
    "UEFA Europa League": "Ліга Європи УЄФА",
    "Europa League": "Ліга Європи УЄФА",
    "UEFA Europa Conference League": "Ліга Конференцій УЄФА",
    "Europa Conference League": "Ліга Конференцій УЄФА",
    "UEFA Super Cup": "Суперкубок УЄФА",
    "UEFA Nations League": "Ліга Націй УЄФА",
    "UEFA European Championship": "Чемпіонат Європи УЄФА",

    "Premier League": "Премʼєр-ліга Англії",
    "La Liga": "Ла Ліга Іспанії",
    "Serie A": "Серія А Італії",
    "Bundesliga": "Бундесліга Німеччини",
    "Ligue 1": "Ліга 1 Франції",
    "Eredivisie": "Ередивізі Нідерландів",
    "Primeira Liga": "Прімейра Ліга Португалії",

    "Scottish Premiership": "Шотландська Премʼєршип",
    "Süper Lig": "Суперліга Туреччини",
    "Super Lig": "Суперліга Туреччини",
    "Super League 1": "Суперліга Греції",
    "Super League Greece": "Суперліга Греції",

    "Pro League": "Про Ліга Бельгії",
    "Jupiler Pro League": "Про Ліга Бельгії",
    "First Division A": "Про Ліга Бельгії",
    "Austrian Bundesliga": "Бундесліга Австрії",
    "Swiss Super League": "Суперліга Швейцарії",

    "Ekstraklasa": "Екстракляса Польщі",
    "Ukrainian Premier League": "Українська Премʼєр-ліга",
    "Allsvenskan": "Аллсвенскан Швеції",
    "Eliteserien": "Елітсеріен Норвегії",
    "Superliga": "Суперліга Данії",
    "Danish Superliga": "Суперліга Данії",

    "Championship": "Чемпіоншип Англії",
    "Segunda División": "Сегунда Іспанії",
    "Segunda Division": "Сегунда Іспанії",
    "Serie B": "Серія B Італії",
    "2. Bundesliga": "Друга Бундесліга",
    "Ligue 2": "Ліга 2 Франції",
  },
  en: {
    "UEFA Champions League": "UEFA Champions League",
    "Champions League": "UEFA Champions League",
    "UEFA Europa League": "UEFA Europa League",
    "Europa League": "UEFA Europa League",
    "UEFA Europa Conference League": "UEFA Europa Conference League",
    "Europa Conference League": "UEFA Europa Conference League",
    "UEFA Super Cup": "UEFA Super Cup",
    "UEFA Nations League": "UEFA Nations League",
    "UEFA European Championship": "UEFA European Championship",

    "Premier League": "Premier League",
    "La Liga": "La Liga",
    "Serie A": "Serie A",
    "Bundesliga": "Bundesliga",
    "Ligue 1": "Ligue 1",
    "Eredivisie": "Eredivisie",
    "Primeira Liga": "Primeira Liga",

    "Scottish Premiership": "Scottish Premiership",
    "Süper Lig": "Süper Lig",
    "Super Lig": "Süper Lig",
    "Super League 1": "Super League Greece",
    "Super League Greece": "Super League Greece",

    "Pro League": "Belgian Pro League",
    "Jupiler Pro League": "Belgian Pro League",
    "First Division A": "Belgian Pro League",
    "Austrian Bundesliga": "Austrian Bundesliga",
    "Swiss Super League": "Swiss Super League",

    "Ekstraklasa": "Ekstraklasa",
    "Ukrainian Premier League": "Ukrainian Premier League",
    "Allsvenskan": "Allsvenskan",
    "Eliteserien": "Eliteserien",
    "Superliga": "Danish Superliga",
    "Danish Superliga": "Danish Superliga",

    "Championship": "EFL Championship",
    "Segunda División": "Segunda División",
    "Segunda Division": "Segunda División",
    "Serie B": "Serie B",
    "2. Bundesliga": "2. Bundesliga",
    "Ligue 2": "Ligue 2",
  }
};

const INTERNATIONAL_KEYS = ['uefa','champions','europa','conference','nations','european','qualifying','qualification','world cup','fifa'];

function i18nLookup(dictByLang, value) {
  if (!value) return '';
  const raw = String(value);
  const direct = dictByLang[lang]?.[raw];
  if (direct) return direct;
  const needle = normKey(raw);
  const langDict = dictByLang[lang] || {};
  for (const k of Object.keys(langDict)) {
    if (normKey(k) === needle) return langDict[k];
  }
  return raw;
}
const i18nCountry = (name) => i18nLookup(COUNTRY_I18N, name);
const i18nLeague  = (name) => i18nLookup(LEAGUE_I18N, name);

function translatePredictionText(original, target) {
  try {
    if (!original || target === 'ru') return original;
    const norm = (s) => s.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').replace(/\s*-\s*/g, ' - ').trim();
    const t = norm(original);
    const NUM  = '([0-9]+(?:[\\.,][0-9]+)?)';
    const TEAM = '(.+?)';
    const rules = [
      { re: /^Обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i,
        tr: (m) => (target === 'en' ? `Both teams to score — ${m[1].toLowerCase()==='да'?'yes':'no'}` : `Обидві заб'ють — ${m[1].toLowerCase()==='да'?'так':'ні'}`)},
      { re: /^Обе(?:\s+команды)?\s+забьют$/i, tr: () => (target === 'en' ? 'Both teams to score' : "Обидві заб'ють") },
      { re: new RegExp(`^Тотал\\s+больше\\s+${NUM}$`, 'i'), tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}` },
      { re: new RegExp(`^Тотал\\s+меньше\\s+${NUM}$`, 'i'), tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}` },
      { re: new RegExp(`^ТБ\\s*${NUM}$`, 'i'), tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}` },
      { re: new RegExp(`^ТМ\\s*${NUM}$`, 'i'), tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}` },
      { re: new RegExp(`^Фора\\s*([\\+\\-]?${NUM})\\s*на\\s+${TEAM}$`, 'i'), tr: (m) => (target === 'en' ? `Handicap ${m[2]} ${m[1].replace(',', '.')}` : `Фора ${m[2]} ${m[1].replace(',', '.')}`) },
      { re: new RegExp(`^${TEAM}\\s+Фора\\s*([\\+\\-]?${NUM})$`, 'i'), tr: (m) => (target === 'en' ? `Handicap ${m[1]} ${m[2].replace(',', '.')}` : `Фора ${m[1]} ${m[2].replace(',', '.')}`) },
      { re: new RegExp(`^Победа\\s+${TEAM}$`, 'i'), tr: (m) => target === 'en' ? `Win ${m[1]}` : `Перемога ${м[1]}` },
      { re: /^Ничья$/i, tr: () => (target === 'en' ? 'Draw' : 'Нічия') },
      { re: /^П1$/i, tr: () => (target === 'en' ? 'Home win' : 'Перемога господарів') },
      { re: /^П2$/i, tr: () => (target === 'en' ? 'Away win' : 'Перемога гостей') },
      { re: /^Х$/i,  tr: () => (target === 'en' ? 'Draw' : 'Нічия') },
      { re: /^1Х$/i, tr: () => (target === 'en' ? '1X (home or draw)' : '1X (господарі або нічия)') },
      { re: /^Х2$/i, tr: () => (target === 'en' ? 'X2 (draw or away)' : 'X2 (нічия або гості)') },
      { re: /^12$/i, tr: () => (target === 'en' ? '12 (no draw)' : '12 (без нічиєї)') }
    ];
    for (const r of rules) { const m = t.match(r.re); if (m) return r.tr(m); }
    return original;
  } catch (e) { console.error('translatePredictionText error:', e); return original; }
}

let coins = 0;
let predictions = [];

// ===== Пользователь =====
function getUserProfileRaw() {
  let u = telegram?.initDataUnsafe?.user;
  if (!u) {
    try { const saved = localStorage.getItem('tg_user'); if (saved) u = JSON.parse(saved); } catch {}
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
    buyBtn: document.querySelector('.buy-btn'),
    unlockAllBtn: document.getElementById('unlockAllBtn')
  };
}

function loadUserData() {
  const { userProfilePic, userName, sloganEl, buyBtn, unlockAllBtn } = getDOMElements();
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
  if (unlockAllBtn) unlockAllBtn.textContent = translations[lang].openAll;
}

// ===== Парсинг старого поля tournament =====
function parseDateFromTournament(tournamentStr='') {
  const m = tournamentStr.match(/(\d{2}\.\d{2}\.\d{2})/);
  return m ? m[1] : '';
}
function parseLeagueFromTournament(tournamentStr='') {
  const m = tournamentStr.match(/\d{2}\.\d{2}\.\d{2}\s+(.+)$/);
  if (m) return m[1].trim();
  const parts = tournamentStr.split(/\s+/);
  if (parts.length >= 2 && tournamentStr.toLowerCase().startsWith('футбол')) {
    return tournamentStr.replace(/^футбол\.?/i,'').trim();
  }
  return tournamentStr.trim();
}
function isInternationalByLeagueName(leagueName='') {
  const k = normKey(leagueName);
  return INTERNATIONAL_KEYS.some(w => k.includes(w));
}
const INTERNATIONAL_TAGS = new Set(['International','World','Europe','']);

// ===== Формат заголовка =====
function formatTournament(p) {
  const rawCountry = p.country || '';
  const rawLeague  = p.league  || '' || parseLeagueFromTournament(p.tournament || '');
  const rawDate    = p.date || parseDateFromTournament(p.tournament || '');

  const countryTranslated = rawCountry ? i18nCountry(rawCountry) : '';
  const leagueTranslated  = i18nLeague(rawLeague);

  const isInternational =
    (rawCountry && INTERNATIONAL_TAGS.has(rawCountry.trim())) ||
    (!rawCountry && isInternationalByLeagueName(rawLeague));

  if (isInternational) {
    return `${rawDate ? (rawDate + ' ') : ''}${leagueTranslated}`.trim();
  }
  if (countryTranslated) {
    return `${countryTranslated}${rawDate ? ' ' + rawDate : ''} ${leagueTranslated}`.trim();
  }
  return `${rawDate ? rawDate + ' ' : ''}${leagueTranslated}`.trim();
}

// ===== Загрузка данных =====
async function loadPredictions() {
  const userId = getUserId();
  if (!userId) return;

  try {
    const response = await fetch(`/api/predictions?userId=${userId}`);
    predictions = await response.json();

    const u = getUserProfileRaw();
    const balanceResponse = await fetch('/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'get', profile: u })
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

// ✅ Массовая разблокировка
async function unlockAllPredictions() {
  const userId = getUserId();
  if (!userId || coins < 60) return alert(translations[lang].notEnough);

  const res = await fetch('/api/unlock-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });

  const result = await res.json();
  if (result.success) {
    coins = result.coins;
    updateBalance();
    await loadPredictions();
    alert(translations[lang].openedAllOk);
  } else {
    alert(result.message || 'Ошибка при разблокировке');
  }
}

function updateBalance() {
  const { coinBalance } = getDOMElements();
  if (coinBalance) coinBalance.textContent = coins;
}

function translatePredictionText(original, target) {
  // (дублирование уже сверху — оставлено один раз; если у вас было, не дублируйте)
  return original; // <-- заглушка если у вас уже есть реализация выше
}

/**
 * Рендер карточек
 */
function renderPredictions() {
  const predictionsContainer = document.getElementById('predictions');
  predictionsContainer.innerHTML = '';

  predictions.forEach(p => {
    const div = document.createElement('div');
    div.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
    div.setAttribute('data-id', p.id);

    const textOriginal = p.predictionText || '';
    const textShown = p.isUnlocked
      ? translatePredictionText(textOriginal, lang)
      : translations[lang].locked;

    const tournamentDisplay = formatTournament(p);

    div.innerHTML = `
      <div class="teams">
        <span class="tournament">${tournamentDisplay}</span>
        <div class="team-row"><img src="${p.logo1}"> ${p.team1}</div>
        <div class="team-row"><img src="${p.logo2}"> ${p.team2}</div>
      </div>
      <span class="odds">${p.odds}</span>
      <div class="prediction-text" data-original="${(textOriginal || '').replace(/"/g, '&quot;')}">${textShown}</div>
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

// Автообновление раз в 30 сек
setInterval(loadPredictions, 30000);

// Инициализация
loadUserData();
loadPredictions();
