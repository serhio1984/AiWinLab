const telegram = window.Telegram?.WebApp;

if (telegram) {
    telegram.ready();
    telegram.expand();
    console.log('✅ Telegram WebApp initialized');
}

// ===== Языковая поддержка =====
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

let coins = 0;
let predictions = [];

function getUserId() {
    const tgUser = telegram?.initDataUnsafe?.user;
    if (tgUser?.id) return tgUser.id;
    try {
        const local = JSON.parse(localStorage.getItem('tg_user'));
        return local?.id || null;
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
        sloganEl: document.querySelector('.logo p'),
        buyBtn: document.querySelector('.buy-btn')
    };
}

function loadUserData() {
    const { userProfilePic, userName, sloganEl, buyBtn } = getDOMElements();
    let user = telegram?.initDataUnsafe?.user;

    if (!user) {
        try {
            const saved = localStorage.getItem('tg_user');
            if (saved) user = JSON.parse(saved);
        } catch {}
    }

    if (user) {
        userName.textContent = `${translations[lang].hello}, ${user.first_name || translations[lang].guest}`;
        userProfilePic.src = user.photo_url || 'https://dummyimage.com/50x50/000/fff&text=User';
        localStorage.setItem('tg_user', JSON.stringify(user));
    } else {
        userName.textContent = `${translations[lang].hello}, ${translations[lang].guest}`;
        userProfilePic.src = 'https://dummyimage.com/50x50/000/fff&text=User';
    }

    if (sloganEl) sloganEl.textContent = translations[lang].slogan;
    if (buyBtn) buyBtn.textContent = translations[lang].buyCoins;
}

async function loadPredictions() {
    const { predictionsContainer } = getDOMElements();
    const userId = getUserId();
    if (!userId) return;

    try {
        const response = await fetch(`/api/predictions?userId=${userId}`);
        predictions = await response.json();

        const balanceResponse = await fetch('/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'get' })
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

        div.innerHTML = `
            <div class="teams">
                <span class="tournament">${p.tournament}</span>
                <div class="team-row"><img src="${p.logo1}"> ${p.team1}</div>
                <div class="team-row"><img src="${p.logo2}"> ${p.team2}</div>
            </div>
            <span class="odds">${p.odds}</span>
            <div class="prediction-text">${p.isUnlocked ? p.predictionText : translations[lang].locked}</div>
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

setInterval(loadPredictions, 30000);

// Инициализация
loadUserData();
loadPredictions();
