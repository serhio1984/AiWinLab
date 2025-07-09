const telegram = window.Telegram?.WebApp;

if (telegram) {
    telegram.ready();
    telegram.expand();
    console.log('Telegram WebApp initialized and expanded');
} else {
    console.log('Telegram WebApp not available');
}

let coins = 0;
let predictions = [];
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
    if (!userName || !userProfilePic) return;

    let user = telegram?.initDataUnsafe?.user;

    if (!user) {
        const saved = localStorage.getItem('tg_user');
        if (saved) {
            try {
                user = JSON.parse(saved);
                console.log('👤 Восстановлен пользователь:', user);
            } catch (e) {
                console.warn('Ошибка чтения tg_user из localStorage:', e);
            }
        }
    }

    if (user) {
        userName.textContent = user.first_name || 'Гость';
        userProfilePic.src = user.photo_url || 'https://dummyimage.com/50x50/000000/ffffff?text=User';
    } else {
        userName.textContent = 'Гость (Тест)';
        userProfilePic.src = 'https://dummyimage.com/50x50/000000/ffffff?text=User';
    }
}

async function loadPredictions() {
    const { predictionsContainer } = getDOMElements();
    if (!predictionsContainer) return;

    const userId = telegram?.initDataUnsafe?.user?.id || JSON.parse(localStorage.getItem('tg_user') || '{}').id;
    if (!userId) {
        console.warn('User ID not available.');
        predictions = [];
        renderPredictions();
        return;
    }

    try {
        const predictionsResponse = await fetch('/api/predictions');
        if (!predictionsResponse.ok) throw new Error(`HTTP error! Status: ${predictionsResponse.status}`);
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
        if (!balanceResponse.ok) throw new Error(`HTTP error! Status: ${balanceResponse.status}`);
        const balanceData = await balanceResponse.json();
        coins = balanceData.coins || 0;

        updateBalance();
        renderPredictions();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        predictions = [];
        renderPredictions();
    }
}

async function unlockPrediction(id) {
    const userId = telegram?.initDataUnsafe?.user?.id || JSON.parse(localStorage.getItem('tg_user') || '{}').id;

    if (coins < 1) {
        alert('Недостаточно монет!');
        return;
    }

    try {
        const response = await fetch('/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'update', amount: -1 })
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            alert('Не удалось списать монету. Попробуйте позже.');
            console.error('Ошибка при списании:', data.error);
            return;
        }

        coins = data.coins;
        unlockedPredictions.push(id);
        localStorage.setItem('unlockedPredictions', JSON.stringify(unlockedPredictions));

        const prediction = predictions.find(p => Number(p.id) === Number(id));
        if (prediction) prediction.isUnlocked = true;

        updateBalance();
        renderPredictions();
    } catch (e) {
        console.error('Ошибка при попытке списания монеты:', e);
        alert('Произошла ошибка. Попробуйте позже.');
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
                <div class="team-row"><img src="${p.logo1 || 'https://dummyimage.com/30x30'}" alt="${p.team1}"> ${p.team1}</div>
                <div class="team-row"><img src="${p.logo2 || 'https://dummyimage.com/30x30'}" alt="${p.team2}"> ${p.team2}</div>
            </div>
            <span class="odds">${p.odds || '0.00'}</span>
            <div class="prediction-text">${p.isUnlocked ? p.predictionText : '🔒 Прогноз заблокирован'}</div>
            ${!p.isUnlocked ? `<button class="buy-btn unlock-btn" onclick="unlockPrediction(${p.id})">Разблокировать</button>` : ''}
        `;
        predictionsContainer.appendChild(div);
    });
}

setInterval(loadPredictions, 5000);

loadUserData();
loadPredictions();
