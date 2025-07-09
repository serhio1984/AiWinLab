<script>
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

function getUserId() {
    return telegram?.initDataUnsafe?.user?.id ||
        (localStorage.getItem('tg_user') ? JSON.parse(localStorage.getItem('tg_user')).id : null);
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
        localStorage.setItem('tg_user', JSON.stringify(user));
    } else {
        userName.textContent = 'Гость (Тест)';
        userProfilePic.src = 'https://dummyimage.com/50x50/000000/ffffff?text=User';
    }
}

async function loadPredictions() {
    const { predictionsContainer } = getDOMElements();
    if (!predictionsContainer) return;

    const userId = getUserId();
    if (!userId) {
        console.warn('User ID not available.');
        predictions = [];
        renderPredictions();
        return;
    }

    try {
        const response = await fetch(`/api/predictions?userId=${userId}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
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
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        predictions = [];
        renderPredictions();
        if (telegram) alert('Ошибка загрузки данных. Проверьте подключение.');
    }
}

async function unlockPrediction(id) {
    const userId = getUserId();
    if (!userId) return alert('Ошибка: пользователь не определён');
    if (coins < 1) return alert('Недостаточно монет!');

    try {
        const response = await fetch('/api/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, predictionId: id })
        });

        const result = await response.json();
        if (result.success) {
            coins = result.coins;
            updateBalance();
            await loadPredictions(); // обновим список прогнозов
        } else {
            alert(result.message || 'Не удалось разблокировать прогноз');
        }
    } catch (e) {
        alert('Ошибка при разблокировке.');
        console.error(e);
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

        const teamsDiv = document.createElement('div');
        teamsDiv.className = 'teams';

        const tournamentSpan = document.createElement('span');
        tournamentSpan.className = 'tournament';
        tournamentSpan.textContent = p.tournament || 'Нет турнира';
        teamsDiv.appendChild(tournamentSpan);

        const team1Div = document.createElement('div');
        team1Div.className = 'team-row';
        const team1Img = document.createElement('img');
        team1Img.src = p.logo1 || 'https://dummyimage.com/30x30';
        team1Img.alt = p.team1 || 'Команда 1';
        team1Div.appendChild(team1Img);
        team1Div.appendChild(document.createTextNode(` ${p.team1 || 'Команда 1'}`));
        teamsDiv.appendChild(team1Div);

        const team2Div = document.createElement('div');
        team2Div.className = 'team-row';
        const team2Img = document.createElement('img');
        team2Img.src = p.logo2 || 'https://dummyimage.com/30x30';
        team2Img.alt = p.team2 || 'Команда 2';
        team2Div.appendChild(team2Img);
        team2Div.appendChild(document.createTextNode(` ${p.team2 || 'Команда 2'}`));
        teamsDiv.appendChild(team2Div);

        div.appendChild(teamsDiv);

        const oddsSpan = document.createElement('span');
        oddsSpan.className = 'odds';
        oddsSpan.textContent = p.odds || '0.00';
        div.appendChild(oddsSpan);

        const predictionTextDiv = document.createElement('div');
        predictionTextDiv.className = 'prediction-text';
        predictionTextDiv.textContent = p.isUnlocked ? (p.predictionText || 'Нет прогноза') : '🔒 Прогноз заблокирован';
        div.appendChild(predictionTextDiv);

        if (!p.isUnlocked) {
            const unlockButton = document.createElement('button');
            unlockButton.className = 'buy-btn unlock-btn';
            unlockButton.textContent = 'Разблокировать';
            unlockButton.onclick = () => unlockPrediction(p.id);
            div.appendChild(unlockButton);
        }

        predictionsContainer.appendChild(div);
    });
}

// ⏱ Автообновление каждые 30 секунд
const intervalId = setInterval(loadPredictions, 30000);
window.onunload = () => clearInterval(intervalId);

// 🔄 Запуск
loadUserData();
loadPredictions();
</script>
