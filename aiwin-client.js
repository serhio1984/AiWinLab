// aiwin-client.js — обновлённый

const telegram = window.Telegram?.WebApp;

try {
  if (telegram) {
    telegram.ready?.();
    telegram.expand?.();
    console.log('✅ Telegram WebApp initialized');
  }
} catch (e) {
  console.warn('Telegram init error:', e.message);
}

let coins = 0;
let predictions = [];
let intervalId = null;

// ---------- helpers ----------
function sanitize(s) {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[ch]));
}

function getUserId() {
  const tgUser = telegram?.initDataUnsafe?.user;
  if (tgUser?.id) return String(tgUser.id);
  try {
    const local = JSON.parse(localStorage.getItem('tg_user'));
    return local?.id ? String(local.id) : null;
  } catch {
    return null;
  }
}

function getDOMElements() {
  return {
    coinBalance: document.getElementById('coinBalance'),
    predictionsContainer: document.getElementById('predictions'),
    userProfilePic: document.getElementById('userProfilePic'),
    userName: document.getElementById('userName'),
  };
}

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ---------- user ----------
function loadUserData() {
  const { userProfilePic, userName } = getDOMElements();
  let user = telegram?.initDataUnsafe?.user;

  if (!user) {
    try {
      const saved = localStorage.getItem('tg_user');
      if (saved) user = JSON.parse(saved);
    } catch {}
  }

  if (user) {
    userName.textContent = user.first_name || 'Пользователь';
    userProfilePic.src = user.photo_url || 'https://dummyimage.com/50x50/000/fff&text=User';
    // сохраним для оффлайна
    try { localStorage.setItem('tg_user', JSON.stringify(user)); } catch {}
  } else {
    userName.textContent = 'Гость';
    userProfilePic.src = 'https://dummyimage.com/50x50/000/fff&text=User';
  }
}

// ---------- balance ----------
async function loadBalance(userId) {
  const { coinBalance } = getDOMElements();
  try {
    // основной вариант: POST /balance { userId, action:get }
    const r = await fetch('/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'get' }),
    });

    let data;
    if (r.ok) {
      data = await r.json();
    } else {
      // fallback: GET /balance?userId=...
      data = await fetchJSON(`/balance?userId=${encodeURIComponent(userId)}`);
    }

    coins = Number(data?.coins ?? data?.balance ?? 0);
  } catch (e) {
    console.warn('Balance load error:', e.message);
    coins = 0;
  } finally {
    updateBalance();
  }
}

function updateBalance() {
  const { coinBalance } = getDOMElements();
  if (coinBalance) coinBalance.textContent = coins;
}

// ---------- predictions ----------
async function loadPredictions() {
  const { predictionsContainer } = getDOMElements();
  const userId = getUserId();
  if (!userId) {
    console.warn('No userId — skip loadPredictions');
    return;
  }

  try {
    // основной вариант
    let data;
    try {
      data = await fetchJSON(`/api/predictions?userId=${encodeURIComponent(userId)}`);
    } catch {
      // fallback: черновики без пер-юзерных флагов
      data = await fetchJSON(`/api/draft_predictions`);
      // если draft не содержит isUnlocked, пометим всё как locked
      if (Array.isArray(data)) {
        data = data.map((p) => ({ ...p, isUnlocked: Boolean(p.isUnlocked) }));
      }
    }

    // баланс подтянем рядом
    await loadBalance(userId);

    predictions = Array.isArray(data) ? data : [];
    renderPredictions();
  } catch (e) {
    console.error('Ошибка загрузки прогнозов:', e);
    predictions = [];
    renderPredictions();
  }
}

function renderPredictions() {
  const { predictionsContainer } = getDOMElements();
  if (!predictionsContainer) return;

  predictionsContainer.innerHTML = '';

  if (!predictions.length) {
    const empty = document.createElement('div');
    empty.style.color = '#ff6200';
    empty.style.fontWeight = 'bold';
    empty.textContent = 'Пока нет прогнозов. Загляни позже!';
    predictionsContainer.appendChild(empty);
    return;
  }

  for (const p of predictions) {
    predictionsContainer.appendChild(renderCard(p));
  }
}

function renderCard(p) {
  const div = document.createElement('div');
  div.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
  div.setAttribute('data-id', sanitize(p.id));

  // odds — показываем только если есть и похоже на число
  const oddsStr = (p.odds != null && String(p.odds).trim() !== '') ? String(p.odds).trim() : null;
  const oddsHTML = oddsStr ? `<span class="odds">${sanitize(oddsStr)}</span>` : '';

  div.innerHTML = `
    <div class="teams">
      <span class="tournament">${sanitize(p.tournament)}</span>
      <div class="team-row"><img src="${sanitize(p.logo1)}" alt=""> ${sanitize(p.team1)}</div>
      <div class="team-row"><img src="${sanitize(p.logo2)}" alt=""> ${sanitize(p.team2)}</div>
    </div>
    ${oddsHTML}
    <div class="prediction-text">${p.isUnlocked ? sanitize(p.predictionText) : '🔒 Прогноз заблокирован'}</div>
  `;

  if (!p.isUnlocked) {
    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'buy-btn unlock-btn';
    unlockBtn.textContent = 'Разблокировать';
    unlockBtn.onclick = () => unlockPrediction(p.id);
    div.appendChild(unlockBtn);
  }

  return div;
}

// ---------- unlock ----------
async function unlockPrediction(predictionId) {
  const userId = getUserId();
  if (!userId) return alert('Открой через Telegram для разблокировки.');
  if (coins < 1) return alert('Недостаточно монет');

  try {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, predictionId }),
    });
    const result = await res.json();

    if (result?.success || result?.ok) {
      coins = Number(result.coins ?? result.balance ?? coins);
      updateBalance();
      await loadPredictions();
    } else {
      alert(result?.message || result?.reason || 'Ошибка при разблокировке');
    }
  } catch (e) {
    console.error('Unlock error:', e.message);
    alert('Ошибка разблокировки. Попробуй ещё раз.');
  }
}

// ---------- init ----------
function startAutoRefresh() {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(loadPredictions, 30000);
}

loadUserData();
loadPredictions().finally(startAutoRefresh);

// корректное закрытие
window.addEventListener('unload', () => {
  if (intervalId) clearInterval(intervalId);
});
