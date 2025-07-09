
const telegram = window.Telegram?.WebApp;
if (telegram) {
    telegram.ready();
    telegram.expand();
    console.log('Telegram WebApp initialized and expanded');
    loadUserData();
    loadPredictions();
} else {
    console.log('Telegram WebApp not available');
    loadUserData();
    loadPredictions();
}

let predictions = [];
let coins = 0;
let unlockedPredictions = JSON.parse(localStorage.getItem('unlockedPredictions')) || [];

function getDOMElements() {
    return {
        coinBalance: document.getElementById('coinBalance'),
        predictionsContainer: document.getElementById('predictions'),
        userProfilePic: document.getElementById('userProfilePic'),
        userName: document.getElementById('userName')
    };
}

function loadUserData() {
    const { userProfilePic, userName } = getDOMElements();
    if (!userName || !userProfilePic) {
        console.error('DOM elements not found');
        return;
    }

    let user = telegram?.initDataUnsafe?.user;

    if (!user) {
        const savedUser = localStorage.getItem('tg_user');
        if (savedUser) {
            try {
                user = JSON.parse(savedUser);
                console.log('👤 Восстановлен пользователь из localStorage:', user);
            } catch (e) {
                console.warn('Не удалось распарсить tg_user из localStorage:', e);
            }
        }
    }

    if (user) {
        userName.textContent = user.first_name || 'Гость';
        userProfilePic.src = user.photo_url || 'https://dummyimage.com/50x50/000000/ffffff?text=User';
    } else {
        console.log('User не найден');
        userName.textContent = 'Гость (Тест)';
        userProfilePic.src = 'https://dummyimage.com/50x50/000000/ffffff?text=User';
    }
}

async function loadPredictions() {
    const { predictionsContainer } = getDOMElements();
    if (!predictionsContainer) return;

    const userId = telegram?.initDataUnsafe?.user?.id || 'default-user';

    try {
        const predictionsResponse = await fetch('/api/predictions');
        const serverPredictions = await predictionsResponse.json();
        predictions = Array.isArray(serverPredictions)
            ? serverPredictions.map(p => ({
                ...p,
                id: Number(p.id),
                isUnlocked: unlockedPredictions.map(Number).includes(Number(p.id))
            }))
            : [];

        const balanceResponse = await fetch('/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'get' })
        });
        const balanceData = await balanceResponse.json();
        coins = balanceData.coins || 0;
        updateBalance();
        renderPredictions();
    } catch (error) {
        console.error('Error loading predictions or balance:', error);
        predictions = [];
        renderPredictions();
        if (telegram) alert('Ошибка загрузки данных. Проверьте подключение или обратитесь к поддержке.');
    }
}

async function updatePredictions() {
    const { predictionsContainer } = getDOMElements();
    if (!predictionsContainer) return;

    try {
        const response = await fetch('/api/predictions');
        const serverPredictions = await response.json();
        predictions = Array.isArray(serverPredictions)
            ? serverPredictions.map(p => ({
                ...p,
                id: Number(p.id),
                isUnlocked: unlockedPredictions.map(Number).includes(Number(p.id))
            }))
            : [];
        renderPredictions();
    } catch (error) {
        console.error('Error updating predictions:', error);
        predictions = [];
        renderPredictions();
    }
}

async function unlockPrediction(id, button) {
    if (coins < 1) {
        alert('Недостаточно монет! Купите ещё за Telegram Stars.');
        return;
    }

    const userId = telegram?.initDataUnsafe?.user?.id || 'default-user';

    try {
        const res = await fetch('/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'update', amount: -1 })
        });
        const data = await res.json();
        coins = data.coins >= 0 ? data.coins : 0;

        unlockedPredictions.push(id);
        const prediction = predictions.find(p => Number(p.id) === Number(id));
        if (prediction) prediction.isUnlocked = true;

        localStorage.setItem('unlockedPredictions', JSON.stringify(unlockedPredictions));
        updateBalance();
        renderPredictions();
    } catch (error) {
        console.error('Ошибка при списании монеты:', error);
        alert('Не удалось списать монету. Попробуйте ещё раз.');
    }
}

function updateBalance() {
    const { coinBalance } = getDOMElements();
    if (coinBalance) {
        coinBalance.textContent = coins;
    }
}

function renderPredictions() {
    const { predictionsContainer } = getDOMElements();
    if (!predictionsContainer) return;

    predictionsContainer.innerHTML = '';
    if (predictions.length === 0) {
        predictionsContainer.innerHTML = '<p style="color: #ff6200;">Нет прогнозов для отображения.</p>';
        return;
    }

    predictions.forEach(p => {
        const div = document.createElement('div');
        div.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
        div.setAttribute('data-id', p.id);
        div.innerHTML = `
            <div class="teams">
                <span class="tournament">${p.tournament || 'Нет турнира'}</span>
                <div class="team-row"><img src="${p.logo1 || 'https://dummyimage.com/30x30'}" alt="${p.team1}"> ${p.team1 || 'Команда 1'}</div>
                <div class="team-row"><img src="${p.logo2 || 'https://dummyimage.com/30x30'}" alt="${p.team2}"> ${p.team2 || 'Команда 2'}</div>
            </div>
            <span class="odds">${p.odds || '0.00'}</span>
            <div class="prediction-text">${p.predictionText || 'Нет прогноза'}</div>
            <button class="buy-btn unlock-btn" onclick="unlockPrediction(${p.id}, this)">Разблокировать</button>
        `;
        predictionsContainer.appendChild(div);
    });
}

setInterval(updatePredictions, 5000);
loadUserData();
