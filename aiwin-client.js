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

/**
 * Визуальный перевод текста прогноза (не меняем оригинал в БД)
 */
function translatePredictionText(original, target) {
  try {
    if (!original || target === 'ru') return original;

    const norm = (s) =>
      s.replace(/[–—−]/g, '-')
       .replace(/\s+/g, ' ')
       .replace(/\s*-\s*/g, ' - ')
       .trim();

    const t = norm(original);

    const NUM  = '([0-9]+(?:[\\.,][0-9]+)?)';
    const TEAM = '(.+?)';

    const rules = [
      // ОБЕ ЗАБЬЮТ
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

      // ДВОЙНОЙ ШАНС (оставили для корректного перевода, даже если в БД уже конвертирован)
      {
        re: new RegExp(`^${TEAM}\\s+(?:или|або|or)\\s+ничья$`, 'i'),
        tr: (m) => target === 'en' ? `Double chance ${m[1]} or draw` : `Подвійний шанс ${m[1]} або нічия`
      },
      {
        re: new RegExp(`^ничья\\s+(?:или|або|or)\\s*${TEAM}$`, 'i'),
        tr: (m) => target === 'en' ? `Double chance draw or ${m[1]}` : `Подвійний шанс нічия або ${m[1]}`
      },
      {
        re: new RegExp(`^Двойной\\s+шанс\\s*[:\\-]?\\s*${TEAM}\\s+(?:или|або|or)\\s+ничья$`, 'i'),
        tr: (m) => target === 'en' ? `Double chance ${m[1]} or draw` : `Подвійний шанс ${m[1]} або нічия`
      },
      {
        re: new RegExp(`^Двойной\\s+шанс\\s*[:\\-]?\\s*ничья\\s+(?:или|або|or)\\s*${TEAM}$`, 'i'),
        tr: (m) => target === 'en' ? `Double chance draw or ${m[1]}` : `Подвійний шанс нічия або ${m[1]}`
      },
      {
        re: new RegExp(`^${TEAM}\\s+не\\s+проиграет$`, 'i'),
        tr: (m) => target === 'en' ? `${m[1]} not to lose (double chance)` : `${m[1]} не програє (подвійний шанс)`
      },

      // Тоталы
      {
        re: new RegExp(`^Тотал\\s+больше\\s+${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}`
      },
      {
        re: new RegExp(`^Тотал\\s+меньше\\s+${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}`
      },
      {
        re: new RegExp(`^ТБ\\s*${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}`
      },
      {
        re: new RegExp(`^ТМ\\s*${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}`
      },

      // Форы "<Команда> Фора n"
      {
        re: new RegExp(`^Фора\\s*([\\+\\-]?${NUM})\\s*на\\s+${TEAM}$`, 'i'),
        tr: (m) => {
          const h = (m[1] || '').replace(',', '.');
          const tm = m[2];
          return target === 'en' ? `Handicap ${tm} ${h}` : `Фора ${tm} ${h}`;
        }
      },

      // Исходы
      {
        re: new RegExp(`^Победа\\s+${TEAM}$`, 'i'),
        tr: (m) => target === 'en' ? `Win ${m[1]}` : `Перемога ${m[1]}`
      },
      { re: /^Ничья$/i, tr: () => (target === 'en' ? 'Draw' : 'Нічия') },

      // Короткие
      { re: /^П1$/i, tr: () => (target === 'en' ? 'Home win' : 'Перемога господарів') },
      { re: /^П2$/i, tr: () => (target === 'en' ? 'Away win' : 'Перемога гостей') },
      { re: /^Х$/i,  tr: () => (target === 'en' ? 'Draw' : 'Нічия') },
      { re: /^1Х$/i, tr: () => (target === 'en' ? '1X (home or draw)' : '1X (господарі або нічия)') },
      { re: /^Х2$/i, tr: () => (target === 'en' ? 'X2 (draw or away)' : 'X2 (нічия або гості)') },
      { re: /^12$/i, tr: () => (target === 'en' ? '12 (no draw)' : '12 (без нічиєї)') }
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

// ===== Профиль пользователя =====
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

// ===== Форматирование заголовка турнира (с датой!) =====
const INTERNATIONAL_TAGS = new Set(['International','World','Europe','']);

function extractDateFromTournament(tournamentStr) {
  // Ищем ДД.ММ.ГГ внутри строки
  const m = (tournamentStr || '').match(/(\d{2}\.\d{2}\.\d{2})/);
  return m ? m[1] : '';
}

function formatTournament(p) {
  // Берём поля, которые присылает сервер с генератора
  const rawCountry = p.country || '';
  const rawLeague  = p.league  || '';
  const rawDate    = p.date || '';

  const date = rawDate || extractDateFromTournament(p.tournament || '');

  // Переводы названий турниров можно подключить тут при необходимости
  const country = rawCountry; // оставляем как есть (или добавить карту переводов)
  const league  = rawLeague;  // оставляем как есть (или добавить карту переводов)

  // Международные — без страны: "<дата> <лига>"
  if (INTERNATIONAL_TAGS.has(country.trim())) {
    return `${date ? (date + ' ') : ''}${league}`.trim();
  }

  // Обычные: "<страна> <дата> <лига>"
  const left = country ? `${country} ` : '';
  const mid  = date ? `${date} ` : '';
  return `${left}${mid}${league}`.trim();
}

async function loadPredictions() {
  const userId = getUserId();
  if (!userId) return;

  try {
    const response = await fetch(`/api/predictions?userId=${userId}`);
    predictions = await response.json();

    // Баланс + передаём профиль (как раньше)
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
 * Рендер карточек: используем formatTournament(p), чтобы дата была на месте.
 * Текст прогноза визуально переводим, не изменяя оригинал.
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
