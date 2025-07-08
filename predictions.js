// predictions.js

// Инициализация Telegram Web App и загрузка прогнозов
const telegram = window.Telegram?.WebApp;

// Основная инициализация WebApp
function initializeWebApp() {
    if (telegram) {
        telegram.ready(() => {
            telegram.expand();
            console.log('Telegram WebApp initialized and expanded');
            loadUserData();
            loadPredictions();
        });
    } else {
        console.log('Telegram WebApp not available');
        loadUserData();
        loadPredictions();
    }
}

let predictions = [];
let coins = parseInt(localStorage.getItem('coins')) || 0;
let unlockedPredictions = JSON.parse(localStorage.getItem('unlockedPredictions')) || [];

// Начисляем стартовые монеты при первом визите
function initializeCoins() {
    if (!localStorage.getItem('visited')) {
        coins = 5;
        localStorage.setItem('coins', coins);
        localStorage.setItem('visited', 'true');
    }
}

// Элементы DOM
const coinBalance = document.getElementById('coinBalance');
const predictionsContainer = document.getElementById('predictions');
const userProfilePic = document.getElementById('userProfilePic');
const userName = document.getElementById('userName');

// Загрузка данных пользователя из Telegram или тестового режима
function loadUserData() {
    if (telegram) {
        const user = telegram.initDataUnsafe.user;
        if (user) {
            userName.textContent = user.first_name || 'Гость';
            userProfilePic.src = user.photo_url || 'https://dummyimage.com/50x50/000000/ffffff?text=User';
        }
    } else {
        userName.textContent = 'Гость (Тест)';
        userProfilePic.src = 'https://dummyimage.com/50x50/000000/ffffff?text=User';
    }
}

// Основная функция загрузки прогнозов и баланса
async function loadPredictions() {
    const userId = telegram?.initDataUnsafe?.user?.id;
    console.log('User ID:', userId);
    if (!userId) {
        console.warn('User ID not available. Predictions may not load correctly.');
        predictions = [];
        renderPredictions();
        return;
    }

    try {
        const predictionsResponse = await fetch('https://aiwinlab.onrender.com/api/predictions');
        if (!predictionsResponse.ok) throw new Error(`HTTP error! Status: ${predictionsResponse.status}`);
        const serverPredictions = await predictionsResponse.json();
        predictions = Array.isArray(serverPredictions)
            ? serverPredictions.map(p => ({
                ...p,
                id: Number(p.id),
                isUnlocked: unlockedPredictions.map(Number).includes(Number(p.id))
            }))
            : [];

        const balanceResponse = await fetch('https://aiwinlab.onrender.com/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'get' })
        });
        if (!balanceResponse.ok) throw new Error(`HTTP error! Status: ${balanceResponse.status}`);
        const balanceData = await balanceResponse.json();
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

// Периодическое обновление списка прогнозов
async function updatePredictions() {
    try {
        const response = await fetch('https://aiwinlab.onrender.com/api/predictions');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
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

// Функция разблокировки прогноза за монету
function unlockPrediction(id) {
    if (coins < 1) {
        alert('Недостаточно монет! Купите ещё за Telegram Stars.');
        return;
    }
    coins--;
    unlockedPredictions.push(id);
    const prediction = predictions.find(p => Number(p.id) === Number(id));
    if (prediction) prediction.isUnlocked = true;
    localStorage.setItem('coins', coins);
    localStorage.setItem('unlockedPredictions', JSON.stringify(unlockedPredictions));
    renderPredictions();
}

// Обновление отображаемого баланса
function updateBalance() {
    coinBalance.textContent = coins;
}

// Рендеринг карточек прогнозов
function renderPredictions() {
    updateBalance();
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
            <button class="buy-btn unlock-btn" onclick="unlockPrediction(${p.id})">Разблокировать</button>
        `;
        predictionsContainer.appendChild(div);
    });
}

// Запуск инициализации после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    initializeCoins();
    initializeWebApp();
    setInterval(updatePredictions, 5000);
});
