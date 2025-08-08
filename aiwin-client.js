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

// ==== Перевод текста прогноза (расширенные шаблоны) ====
function translatePredictionText(text, target) {
  try {
    if (!text || target === 'ru') return text;

    // Нормализация: длинные тире → дефис, сжатие пробелов и пробелы вокруг дефиса
    const norm = (s) =>
      s
        .replace(/[–—−]/g, '-')      // длинные тире → дефис
        .replace(/\s+/g, ' ')        // множественные пробелы -> один
        .replace(/\s*-\s*/g, ' - ')  // пробелы вокруг дефиса
        .trim();

    const t = norm(text);

    const NUM = '([0-9]+(?:[\\.,][0-9]+)?)';
    const TEAM = '(.+?)';

    const rules = [
      // ===== ОБЕ ЗАБЬЮТ (универсально: "Обе забьют-да", "Обе забьют: да", "Обе забьют(нет)", "Обе команды забьют да") =====
      {
        // ловим формы с "да/нет" в любых разделителях: -, :, (), пробел
        re: /^Обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i,
        tr: (m) => {
          const yn = m[1].toLowerCase();
          if (target === 'en') return `Both teams to score — ${yn === 'да' ? 'yes' : 'no'}`;
          return `Обидві заб'ють — ${yn === 'да' ? 'так' : 'ні'}`;
        }
      },
      {
        // без уточнения да/нет — трактуем как общий BTTS
        re: /^Обе(?:\s+команды)?\s+забьют$/i,
        tr: () => (target === 'en' ? 'Both teams to score' : "Обидві заб'ють")
      },

      // ===== ДВОЙНОЙ ШАНС (разные формы) =====
      // Без префикса: "{TEAM} или ничья"
      {
        re: new RegExp(`^${TEAM}\\s+(?:или|або|or)\\s+ничья$`, 'i'),
        tr: (m) => {
          const tm = m[1];
          return target === 'en' ? `Double chance ${tm} or draw` : `Подвійний шанс ${tm} або нічия`;
        }
      },
      // Без префикса: "ничья или {TEAM}"
      {
        re: new RegExp(`^ничья\\s+(?:или|або|or)\\s*${TEAM}$`, 'i'),
        tr: (m) => {
          const tm = m[1];
          return target === 'en' ? `Double chance draw or ${tm}` : `Подвійний шанс нічия або ${tm}`;
        }
      },
      // С префиксом: "Двойной шанс: {TEAM} или ничья"
      {
        re: new RegExp(`^Двойной\\s+шанс\\s*[:\\-]?\\s*${TEAM}\\s+(?:или|або|or)\\s+ничья$`, 'i'),
        tr: (m) => {
          const tm = m[1];
          return target === 'en' ? `Double chance ${tm} or draw` : `Подвійний шанс ${tm} або нічия`;
        }
      },
      // С префиксом: "Двойной шанс: ничья или {TEAM}"
      {
        re: new RegExp(`^Двойной\\s+шанс\\s*[:\\-]?\\s*ничья\\s+(?:или|або|or)\\s*${TEAM}$`, 'i'),
        tr: (m) => {
          const tm = m[1];
          return target === 'en' ? `Double chance draw or ${tm}` : `Подвійний шанс нічия або ${tm}`;
        }
      },
      // Эквивалент double chance: "{TEAM} не проиграет"
      {
        re: new RegExp(`^${TEAM}\\s+не\\s+проиграет$`, 'i'),
        tr: (m) => {
          const tm = m[1];
          return target === 'en' ? `${tm} not to lose (double chance)` : `${tm} не програє (подвійний шанс)`;
        }
      },

      // ===== Тотал =====
      { // Тотал больше X
        re: new RegExp(`^Тотал\\s+больше\\s+${NUM}$`, 'i'),
        tr: (m) => {
          const n = m[1].replace(',', '.');
          return target === 'en' ? `Over ${n} goals` : `Тотал більше ${n}`;
        }
      },
      { // Тотал меньше X
        re: new RegExp(`^Тотал\\s+меньше\\s+${NUM}$`, 'i'),
        tr: (m) => {
          const n = m[1].replace(',', '.');
          return target === 'en' ? `Under ${n} goals` : `Тотал менше ${n}`;
        }
      },
      { // Короткие формы: ТБ X
        re: new RegExp(`^ТБ\\s*${NUM}$`, 'i'),
        tr: (m) => {
          const n = m[1].replace(',', '.');
          return target === 'en' ? `Over ${n} goals` : `Тотал більше ${n}`;
        }
      },
      { // Короткие формы: ТМ X
        re: new RegExp(`^ТМ\\s*${NUM}$`, 'i'),
        tr: (m) => {
          const n = m[1].replace(',', '.');
          return target === 'en' ? `Under ${n} goals` : `Тотал менше ${n}`;
        }
      },

      // ===== Фора =====
      // "Фора -1.5 на {TEAM}" / "Фора +1 на {TEAM}"
      {
        re: new RegExp(`^Фора\\s*([\\+\\-]?${NUM})\\s*на\\s+${TEAM}$`, 'i'),
        tr: (m) => {
          const h = (m[1] || '').replace(',', '.');
          const tm = m[2];
          return target === 'en' ? `Handicap ${tm} ${h}` : `Фора ${tm} ${h}`;
        }
      },

      // ===== Победа / Ничья =====
      {
        re: new RegExp(`^Победа\\s+${TEAM}$`, 'i'),
        tr: (m) => target === 'en' ? `Win ${m[1]}` : `Перемога ${m[1]}`
      },
      {
        re: /^Ничья$/i,
        tr: () => target === 'en' ? 'Draw' : 'Нічия'
      },

      // ===== Короткие двойные шансы и исходы =====
      { re: /^1Х$/i, tr: () => target === 'en' ? '1X (home or draw)' : '1X (господарі або нічия)' },
      { re: /^Х2$/i, tr: () => target === 'en' ? 'X2 (draw or away)' : 'X2 (нічия або гості)' },
      { re: /^12$/i, tr: () => target === 'en' ? '12 (no draw)' : '12 (без нічиєї)' },
      { re: /^П1$/i, tr: () => target === 'en' ? 'Home win' : 'Перемога господарів' },
      { re: /^П2$/i, tr: () => target === 'en' ? 'Away win' : 'Перемога гостей' },
      { re: /^Х$/i,  tr: () => target === 'en' ? 'Draw' : 'Нічия' }
    ];

    for (const r of rules) {
      const m = t.match(r.re);
      if (m) return r.tr(m);
    }
    return t; // не распознали — оригинал
  } catch (e) {
    console.error('translatePredictionText error:', e);
    return text;
  }
}

let coins = 0;
let predictions = [];

// Профиль пользователя
function getUserProfile() {
  let u = telegram?.initDataUnsafe?.user;
  if (!u) {
    try {
      const saved = localStorage.getItem('tg_user');
      if (saved) u = JSON.parse(saved);
    } catch {}
  }
  if (!u) return null;
  return {
    id: u.id,
    username: u.username || null,
    first_name: u.first_name || null,
    last_name: u.last_name || null,
    photo_url: u.photo_url || null
  };
}

function getUserId() {
  const prof = getUserProfile();
  return prof?.id || null;
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
  const profile = getUserProfile();

  if (profile) {
    userName.textContent = `${translations[lang].hello}, ${profile.first_name || translations[lang].guest}`;
    userProfilePic.src = profile.photo_url || 'https://dummyimage.com/50x50/000/fff&text=User';
    localStorage.setItem('tg_user', JSON.stringify(profile));
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
    const response = await fetch(`/api/predictions?userId=${userId}`);
    predictions = await response.json();

    const profile = getUserProfile();
    const balanceResponse = await fetch('/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action: 'get',
        profile
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

function renderPredictions() {
  const { predictionsContainer } = getDOMElements();
  predictionsContainer.innerHTML = '';

  predictions.forEach(p => {
    const div = document.createElement('div');
    div.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
    div.setAttribute('data-id', p.id);

    const shownText = p.isUnlocked
      ? translatePredictionText(p.predictionText, lang)
      : translations[lang].locked;

    div.innerHTML = `
      <div class="teams">
        <span class="tournament">${p.tournament}</span>
        <div class="team-row"><img src="${p.logo1}"> ${p.team1}</div>
        <div class="team-row"><img src="${p.logo2}"> ${p.team2}</div>
      </div>
      <span class="odds">${p.odds}</span>
      <div class="prediction-text">${shownText}</div>
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
