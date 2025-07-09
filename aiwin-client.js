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
let coins = parseInt(localStorage.getItem('coins')) || 0;
let unlockedPredictions = JSON.parse(localStorage.getItem('unlockedPredictions')) || [];

function initializeCoins() {
    if (!localStorage.getItem('visited')) {
        coins = 5;
        localStorage.setItem('coins', coins);
        localStorage.setItem('visited', 'true');
    }
}

// Получение элементов DOM после загрузки
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

    // Если нет user из Telegram SDK — берём из localStorage
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
    if (!predictionsContainer) {
        console.error('predictionsContainer is undefined');
        return;
    }
    console.log('Starting loadPredictions');

    const userId = telegram?.initDataUnsafe?.user?.id || 'default-user';
    console.log('User ID:', userId);
    if (!userId) {
        console.warn('User ID not available. Predictions may not load correctly.');
        predictions = [];
        renderPredictions();
        return;
    }

    try {
        const predictionsResponse = await fetch('/api/predictions');
        console.log('Predictions response status:', predictionsResponse.status);
        if (!predictionsResponse.ok) throw new Error(`HTTP error! Status: ${predictionsResponse.status}`);
        const serverPredictions = await predictionsResponse.json();
        console.log('Server predictions raw:', serverPredictions);
        predictions = Array.isArray(serverPredictions)
            ? serverPredictions.map(p => ({
                ...p,
                id: Number(p.id),
                isUnlocked: unlockedPredictions.map(Number).includes(Number(p.id))
            }))
            : [];
        console.log('Processed predictions:', predictions);

        const balanceResponse = await fetch('/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'get' })
        });
        console.log('Balance response status:', balanceResponse.status);
        if (!balanceResponse.ok) throw new Error(`HTTP error! Status: ${balanceResponse.status}`);
        const balanceData = await balanceResponse.json();
        console.log('Balance data:', balanceData);
        coins = balanceData.coins || 0;
        localStorage.setItem('coins', coins);
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
    if (!predictionsContainer) {
        console.error('predictionsContainer is undefined');
        return;
    }
    console.log('Starting updatePredictions');

    try {
        const response = await fetch('/api/predictions');
        console.log('Update response status:', response.status);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const serverPredictions = await response.json();
        console.log('Update server predictions:', serverPredictions);
        predictions = Array.isArray(serverPredictions)
            ? serverPredictions.map(p => ({
                ...p,
                id: Number(p.id),
                isUnlocked: unlockedPredictions.map(Number).includes(Number(p.id))
            }))
            : [];
        console.log('Updated predictions:', predictions);
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
    const url = '/balance';
    console.log('Sending request to:', url);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'update', amount: -1 })
        });
        console.log('Unlock balance response status:', res.status);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        console.log('Unlock balance data:', data);
        if (data.coins === undefined || data.coins < 0) {
            coins = 0; // Сброс на 0 при некорректном ответе
        } else {
            coins = data.coins;
        }
        localStorage.setItem('coins', coins);

        unlockedPredictions.push(id);
        const prediction = predictions.find(p => Number(p.id) === Number(id));
        if (prediction) prediction.isUnlocked = true;

        localStorage.setItem('unlockedPredictions', JSON.stringify(unlockedPredictions));
        updateBalance();
        renderPredictions();

    } catch (error) {
        console.error('Ошибка при списании монеты:', error);
        alert('Не удалось списать монету. Попробуйте ещё раз.');
        // Восстановим монеты, если ошибка
        coins = parseInt(localStorage.getItem('coins')) + 1 || 5;
        localStorage.setItem('coins', coins);
        updateBalance();
    }
}

function updateBalance() {
    const { coinBalance } = getDOMElements();
    if (coinBalance) {
        coinBalance.textContent = coins;
    } else {
        console.error('coinBalance element not found');
    }
}

function renderPredictions() {
    const { predictionsContainer } = getDOMElements();
    if (!predictionsContainer) {
        console.error('predictionsContainer is undefined');
        return;
    }
    console.log('Rendering predictions, count:', predictions.length);
    predictionsContainer.innerHTML = '';
    if (predictions.length === 0) {
        predictionsContainer.innerHTML = '<p style="color: #ff6200;">Нет прогнозов для отображения.</p>';
        console.log('No predictions to render.');
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

// Установка интервала для обновлений
setInterval(updatePredictions, 5000);

initializeCoins();
loadUserData();