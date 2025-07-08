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

const coinBalance = document.getElementById('coinBalance');
const predictionsContainer = document.getElementById('predictions');
const userProfilePic = document.getElementById('userProfilePic');
const userName = document.getElementById('userName');

function loadUserData() {
    if (telegram) {
        const user = telegram.initDataUnsafe.user;
        if (user) {
            console.log('User data loaded:', user);
            userName.textContent = user.first_name || 'Гость';
            userProfilePic.src = user.photo_url || 'https://dummyimage.com/50x50/000000/ffffff?text=User';
        } else {
            console.log('No user data in Telegram initData');
            userName.textContent = 'Гость (Тест)';
            userProfilePic.src = 'https://dummyimage.com/50x50/000000/ffffff?text=User';
        }
    } else {
        console.log('No Telegram available, using default user data');
        userName.textContent = 'Гость (Тест)';
        userProfilePic.src = 'https://dummyimage.com/50x50/000000/ffffff?text=User';
    }
}

async function loadPredictions() {
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
        console.log('Server predictions:', serverPredictions);
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
    try {
        const response = await fetch('/api/predictions');
        console.log('Update response status:', response.status);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const serverPredictions = await response.json();
        predictions = Array.isArray(serverPredictions)
            ? serverPredictions.map(p => ({
                ...p,
                id: Number(p.id),
                isUnlocked: unlockedPredictions.map(Number).includes(Number(p.id))
            }))
            : [];
        console.log('Updated predictions from server:', predictions);
        renderPredictions();
    } catch (error) {
        console.error('Error updating predictions:', error);
        predictions = [];
        renderPredictions();
    }
}

function unlockPrediction(id, button) {
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

function updateBalance() {
    coinBalance.textContent = coins;
}

function renderPredictions() {
    updateBalance();
    if (!predictionsContainer) {
        console.error('predictionsContainer is undefined');
        return;
    }
    predictionsContainer.innerHTML = '';
    console.log('Rendering predictions with details:', JSON.stringify(predictions.map(p => ({
        id: p.id,
        tournament: p.tournament,
        team1: p.team1,
        logo1: p.logo1,
        team2: p.team2,
        logo2: p.logo2,
        odds: p.odds,
        predictionText: p.predictionText,
        isUnlocked: p.isUnlocked
    })), null, 2));
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