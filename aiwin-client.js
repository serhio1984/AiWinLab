<script>
const telegram = window.Telegram?.WebApp;

if (telegram) {
    telegram.ready();
    telegram.expand();
    console.log('✅ Telegram WebApp initialized');
} else {
    console.warn('❗ Telegram WebApp not available. Работает в тестовом режиме.');
}

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
        userName: document.getElementById('userName')
    };
}

function loadUserData() {
    const { userProfilePic, userName } = getDOMElements();
    let user = telegram?.initDataUnsafe?.user;

    if (!user) {
        try {
            const saved = localStorage.getItem('tg_user');
            if (saved) user = JSON.parse(saved);
        } catch (e) {
            console.warn('Ошибка чтения tg_user из localStorage:', e);
        }
    }

    if (user) {
        userName.textContent = user.first_name || 'Пользователь';
        userProfilePic.src = user.photo_url || 'https://dummyimage.com/50x50/000/fff&text=User';
        localStorage.setItem('tg_user', JSON.stringify(user));
    } else {
        userName.textContent = 'Гость';
        userProfilePic.src = 'https://dummyimage.com/50x50/000/fff&text=User';
    }
}

async function loadPredictions() {
    const { predictionsContainer } = getDOMElements();
    const userId = getUserId();
    if (!predictionsContainer || !userId) {
        console.warn('Предсказания не загружены. userId:', userId);
        return;
    }

    try {
        const response = await fetch(`/api/predictions?userId=${userId}`);
        if (!response.ok) throw new Error('Ошибка загрузки прогнозов');

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
        console.error('❌ Ошибка загрузки данных:', e);
        predictions = [];
        renderPredictions();
        if (telegram) alert('Ошибка загрузки данных. Проверьте подключение.');
    }
}

async function unlockPrediction(predictionId) {
    const userId = getUserId();
    if (!userId) return alert('Пользователь не определён');
    if (coins < 1) return alert('Недостаточно монет для разблокировки');

    try {
        const response = await fetch('/api/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, predictionId })
        });

        const result = await response.json();
        if (result.success) {
            coins = result.coins;
            updateBalance();
            await loadPredictions();
        } else {
            alert(result.message || 'Не удалось разблокировать');
        }
    } catch (e) {
        console.error('❌ Ошибка при разблокировке:', e);
        alert('Ошибка при разблокировке.');
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
        predictionsContainer.innerHTML = '<p style="color: #ff6200;">Нет доступных прогнозов.</p>';
        return;
    }

    predictions.forEach(p => {
        const card = document.createElement('div');
        card.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
        card.setAttribute('data-id', p.id);

        const teamsBlock = document.createElement('div');
        teamsBlock.className = 'teams';

        const tournament = document.createElement('span');
        tournament.className = 'tournament';
        tournament.textContent = p.tournament || 'Без турнира';
        teamsBlock.appendChild(tournament);

        const team1 = document.createElement('div');
        team1.className = 'team-row';
        team1.innerHTML = `<img src="${p.logo1 || ''}" alt="${p.team1 || ''}"> ${p.team1 || ''}`;
        teamsBlock.appendChild(team1);

        const team2 = document.createElement('div');
        team2.className = 'team-row';
        team2.innerHTML = `<img src="${p.logo2 || ''}" alt="${p.team2 || ''}"> ${p.team2 || ''}`;
        teamsBlock.appendChild(team2);

        card.appendChild(teamsBlock);

        const odds = document.createElement('span');
        odds.className = 'odds';
        odds.textContent = p.odds || '0.00';
        card.appendChild(odds);

        const predictionText = document.createElement('div');
        predictionText.className = 'prediction-text';
        predictionText.textContent = p.isUnlocked ? p.predictionText : '🔒 Прогноз заблокирован';
        card.appendChild(predictionText);

        if (!p.isUnlocked) {
            const unlockBtn = document.createElement('button');
            unlockBtn.className = 'buy-btn unlock-btn';
            unlockBtn.textContent = 'Разблокировать';
            unlockBtn.onclick = () => unlockPrediction(p.id);
            card.appendChild(unlockBtn);
        }

        predictionsContainer.appendChild(card);
    });
}

// ⏱ Обновление раз в 30 сек
const intervalId = setInterval(loadPredictions, 30000);
window.onunload = () => clearInterval(intervalId);

// ▶️ Инициализация
loadUserData();
loadPredictions();
</script>
