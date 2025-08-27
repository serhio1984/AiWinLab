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
    openAll: (price) => `Открыть всё за ${price} монет`,
    openedAll: "Все прогнозы уже открыты"
  },
  uk: {
    slogan: "Розумні ставки. Великі виграші.",
    hello: "Привіт",
    guest: "Гість",
    buyCoins: "Купити монети",
    unlock: "Розблокувати",
    locked: "🔒 Прогноз заблоковано",
    notEnough: "Недостатньо монет",
    openAll: (price) => `Відкрити все за ${price} монет`,
    openedAll: "Усі прогнози вже відкриті"
  },
  en: {
    slogan: "Smart bets. Big wins.",
    hello: "Hello",
    guest: "Guest",
    buyCoins: "Buy coins",
    unlock: "Unlock",
    locked: "🔒 Prediction locked",
    notEnough: "Not enough coins",
    openAll: (price) => `Unlock all for ${price} coins`,
    openedAll: "All predictions are already unlocked"
  }
};

/** Нормализатор строк */
const norm = (s) =>
  String(s || '')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim();

/** Убираем ведущий префикс "Футбол." из названия турнира (если он пришёл из БД) */
function cleanTournamentTitle(tournament) {
  if (!tournament) return '';
  // Сносим только самое начало строки: "Футбол." (с точкой/без и в любом регистре)
  return tournament.replace(/^\s*футбол\.?\s*/i, '').trim();
}

/**
 * Визуальный перевод текста прогноза.
 * ОРИГИНАЛ из БД не меняем — возвращаем только строку для отображения.
 */
function translatePredictionText(original, target) {
  try {
    if (!original || target === 'ru') return original;

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

      // ===== Фора =====
      {
        re: new RegExp(`^${TEAM}\\s+Фора\\s*([\\+\\-]?${NUM})$`, 'i'),
        tr: (m) => {
          const team = m[1];
          const h = (m[2] || '').replace(',', '.');
          if (target === 'en') return `${team} Handicap ${h}`;
          return `${team} Фора ${h}`; // укр. термин часто такой же
        }
      },

      // ===== Исходы =====
      {
        re: new RegExp(`^Победа\\s+${TEAM}$`, 'i'),
        tr: (m) => target === 'en' ? `Win ${m[1]}` : `Перемога ${m[1]}`
      },
      { re: /^Ничья$/i, tr: () => (target === 'en' ? 'Draw' : 'Нічия') },

      // Короткие исходы
      { re: /^П1$/i, tr: () => (target === 'en' ? 'Home win' : 'Перемога господарів') },
      { re: /^П2$/i, tr: () => (target === 'en' ? 'Away win' : 'Перемога гостей') },
      { re: /^Х$/i,  tr: () => (target === 'en' ? 'Draw' : 'Нічия') },
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
    buyBtn: document.querySelector('.buy-btn'),
    unlockAllBar: document.getElementById('unlockAllBar'),
    unlockAllBtn: document.getElementById('unlockAllBtn')
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

    // 2) Баланс + профиль
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
    renderUnlockAllButton();
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
 * Рендер карточек:
 * - predictionText визуально переводим (если разблокирован)
 * - из tournament убираем ведущий "Футбол."
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

    const tourShown = cleanTournamentTitle(p.tournament);

    div.innerHTML = `
      <div class="teams">
        <span class="tournament">${tourShown}</span>
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

/** Цена «Открыть всё»: ceil(count / 1.3) */
function calcUnlockAllPrice() {
  const count = Array.isArray(predictions) ? predictions.length : 0;
  if (count <= 0) return 0;
  return Math.ceil(count / 1.3);
}
function hasLocked() {
  return predictions.some(p => !p.isUnlocked);
}
function renderUnlockAllButton() {
  const { unlockAllBar, unlockAllBtn } = getDOMElements();
  if (!unlockAllBar || !unlockAllBtn) return;

  const locked = hasLocked();
  if (!locked) {
    unlockAllBar.style.display = 'none';
    return;
  }

  const price = calcUnlockAllPrice();
  unlockAllBtn.textContent = translations[lang].openAll(price);
  unlockAllBar.style.display = 'block';

  unlockAllBtn.onclick = async () => {
    try {
      unlockAllBtn.disabled = true;
      const userId = getUserId();
      if (!userId) return;

      if (coins < price) {
        alert(translations[lang].notEnough);
        unlockAllBtn.disabled = false;
        return;
      }

      const resp = await fetch('/api/unlock-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, price })
      });
      const data = await resp.json();

      if (!data.ok) {
        alert(data.error || 'Ошибка разблокировки');
        unlockAllBtn.disabled = false;
        return;
      }

      coins = data.coins ?? coins;
      updateBalance();

      predictions = predictions.map(p => ({ ...p, isUnlocked: true }));
      renderPredictions();
      renderUnlockAllButton();
    } catch (e) {
      console.error('Unlock-all error:', e);
      alert('Ошибка соединения');
    } finally {
      unlockAllBtn.disabled = false;
    }
  };
}

// Автообновление раз в 30 сек
setInterval(loadPredictions, 30000);

// Инициализация
loadUserData();
loadPredictions();
