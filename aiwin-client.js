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

// ====== Лиги: алиасы → ключи, переводы и привязка к странам ======
const LEAGUE_CANON = [
  { key: 'ucl', aliases: ['лига чемпионов уефа','uefa champions league','champions league'] },
  { key: 'uel', aliases: ['лига европы уефа','uefa europa league','europa league'] },
  { key: 'uecl', aliases: ['лига конференций уефа','uefa europa conference league','conference league'] },

  { key: 'epl', aliases: ['премьер-лига англии','premier league','english premier league'] },
  { key: 'laliga', aliases: ['ла лига испании','la liga','laliga'] },
  { key: 'seriea', aliases: ['серия а италии','serie a'] },
  { key: 'bundes', aliases: ['бундеслига германии','bundesliga'] },
  { key: 'ligue1', aliases: ['лига 1 франции','ligue 1'] },
  { key: 'eredivisie', aliases: ['ередивизи нидерландов','eredivisie'] },
  { key: 'primeira', aliases: ['примейра лига португалии','primeira liga','liga portugal'] },
  { key: 'upl', aliases: ['украинская премьер лига','ukrainian premier league','upl'] },

  // можно добавлять по мере необходимости
];

// Привязка ключа лиги к стране (domestic). Международные лиги не указываем.
const LEAGUE_COUNTRY = {
  epl: 'england',
  laliga: 'spain',
  seriea: 'italy',
  bundes: 'germany',
  ligue1: 'france',
  eredivisie: 'netherlands',
  primeira: 'portugal',
  upl: 'ukraine'
};

// Переводы названий лиг
const LEAGUE_LABELS = {
  ru: {
    ucl: 'Лига Чемпионов УЕФА',
    uel: 'Лига Европы УЕФА',
    uecl: 'Лига Конференций УЕФА',
    epl: 'Премьер-Лига Англии',
    laliga: 'Ла Лига Испании',
    seriea: 'Серия А Италии',
    bundes: 'Бундеслига Германии',
    ligue1: 'Лига 1 Франции',
    eredivisie: 'Эредивизи Нидерландов',
    primeira: 'Примейра Лига Португалии',
    upl: 'Украинская Премьер Лига'
  },
  uk: {
    ucl: 'Ліга Чемпіонів УЄФА',
    uel: 'Ліга Європи УЄФА',
    uecl: 'Ліга Конференцій УЄФА',
    epl: 'Премʼєр-ліга Англії',
    laliga: 'Ла Ліга Іспанії',
    seriea: 'Серія А Італії',
    bundes: 'Бундесліга Німеччини',
    ligue1: 'Ліга 1 Франції',
    eredivisie: 'Ередивізі Нідерландів',
    primeira: 'Прімейра Ліга Португалії',
    upl: 'Українська Премʼєр-ліга'
  },
  en: {
    ucl: 'UEFA Champions League',
    uel: 'UEFA Europa League',
    uecl: 'UEFA Europa Conference League',
    epl: 'Premier League',
    laliga: 'La Liga',
    seriea: 'Serie A',
    bundes: 'Bundesliga',
    ligue1: 'Ligue 1',
    eredivisie: 'Eredivisie',
    primeira: 'Primeira Liga',
    upl: 'Ukrainian Premier League'
  }
};

// Переводы названий стран (для замены "Футбол" → "Страна")
const COUNTRY_LABELS = {
  ru: {
    england: 'Англия',
    spain: 'Испания',
    italy: 'Италия',
    germany: 'Германия',
    france: 'Франция',
    netherlands: 'Нидерланды',
    portugal: 'Португалия',
    ukraine: 'Украина'
  },
  uk: {
    england: 'Англія',
    spain: 'Іспанія',
    italy: 'Італія',
    germany: 'Німеччина',
    france: 'Франція',
    netherlands: 'Нідерланди',
    portugal: 'Португалія',
    ukraine: 'Україна'
  },
  en: {
    england: 'England',
    spain: 'Spain',
    italy: 'Italy',
    germany: 'Germany',
    france: 'France',
    netherlands: 'Netherlands',
    portugal: 'Portugal',
    ukraine: 'Ukraine'
  }
};

function normLower(s='') {
  return s.toLowerCase().normalize('NFKD').replace(/\s+/g,' ').trim();
}

function detectLeagueKey(name='') {
  const n = normLower(name);
  for (const {key, aliases} of LEAGUE_CANON) {
    if (aliases.some(a => n.includes(normLower(a)))) return key;
  }
  return null;
}

function isInternationalLeagueKey(key) {
  return key === 'ucl' || key === 'uel' || key === 'uecl';
}

/**
 * Локализованный рендер строки турнира с заменой "Футбол" → "Страна",
 * а для международных турниров — только название турнира без даты/«Футбол».
 *
 * Ожидаемый формат оригинала: "Футбол.dd.mm.yy <League>"
 */
function renderTournamentLine(original) {
  if (!original) return original;

  // Если язык русский — всё равно надо заменить "Футбол" на страну, как ты просил.
  const m = original.match(/^Футбол\.(\d{2}\.\d{2}\.\d{2})\s+(.+)$/i);
  if (!m) {
    // Нестандартный формат — просто вернём как есть (либо можно дополнительно попытаться заменить слово «Футбол»)
    return original.replace(/^Футбол/i, translations[lang].footballWord);
  }

  const datePart = m[1];
  const leagueRaw  = m[2];

  // Определяем ключ лиги и её локализованное имя
  const key = detectLeagueKey(leagueRaw);
  const leagueLocalized = key ? (LEAGUE_LABELS[lang][key] || leagueRaw) : leagueRaw;

  // Международные — только название лиги
  if (key && isInternationalLeagueKey(key)) {
    return leagueLocalized; // без даты и без "Футбол"
  }

  // Домашние — меняем "Футбол" на страну (если известна)
  let countryKey = key ? LEAGUE_COUNTRY[key] : null;
  if (countryKey) {
    const countryName = COUNTRY_LABELS[lang][countryKey] || COUNTRY_LABELS['ru'][countryKey] || '';
    if (countryName) {
      return `${countryName}.${datePart} ${leagueLocalized}`;
    }
  }

  // Фолбэк: если страну не определили — оставим как было, только переведём слово «Футбол» при необходимости
  const footballWord = translations[lang].footballWord;
  return `${footballWord}.${datePart} ${leagueLocalized}`;
}

/**
 * Визуальный перевод текста прогноза.
 * Оригинал НЕ модифицируем, только возвращаем строку для отображения.
 */
function translatePredictionText(original, target) {
  try {
    if (!original || target === 'ru') return original;

    // Нормализация
    const norm = (s) =>
      s.replace(/[–—−]/g, '-')   // все тире → дефис
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
        tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', ')')}`
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
      // "{TEAM} Фора -1.5" → EN: Handicap TEAM -1.5 / UK: Фора TEAM -1.5
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

      // Короткие исходы (на всякий случай)
      { re: /^П1$/i, tr: () => (target === 'en' ? 'Home win' : 'Перемога господарів') },
      { re: /^П2$/i, tr: () => (target === 'en' ? 'Away win' : 'Перемога гостей') },
      { re: /^Х$/i,  tr: () => (target === 'en' ? 'Draw' : 'Нічия') }
    ];

    for (const r of rules) {
      const m = t.match(r.re);
      if (m) return r.tr(m);
    }
    // Если шаблон не распознан — возвращаем оригинал без изменений
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

async function loadPredictions() {
  const userId = getUserId();
  if (!userId) return;

  try {
    // 1) Прогнозы
    const response = await fetch(`/api/predictions?userId=${userId}`);
    predictions = await response.json();

    // 2) Баланс (+ сохраняем профиль на сервере, если бэк это учитывает)
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
 * Рендер карточек: ОРИГИНАЛ из БД остаётся в данных, в DOM показываем перевод,
 * а оригинал кладём в data-original (на будущее/отладку).
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

    // === ТУРНИР: «Футбол» → «Страна», международные — только название турнира
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
