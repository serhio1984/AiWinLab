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

// ===== Перевод текста прогноза (РУ → UK/EN) =====
function translatePredictionText(text, lang) {
    if (!text || lang === 'ru') return text; // оригинал на рус — показываем как есть
    const t = text.trim();

    // Помощники
    const num = '([0-9]+(?:[\\.,][0-9]+)?)';
    const team = '(.+?)';

    // Порядок важен: от более специфичных к общим
    const patterns = [
        // Обе забьют: да/нет
        {
            re: new RegExp(`^Обе\\s+забьют\\s*[:\\-–]?\\s*(да|нет)$`, 'i'),
            tr: (m) => {
                const yn = m[1].toLowerCase();
                if (lang === 'en') return `Both teams to score — ${yn === 'да' ? 'yes' : 'no'}`;
                return `Обидві заб'ють — ${yn === 'да' ? 'так' : 'ні'}`;
            }
        },
        // Обе забьют (без да/нет) — трактуем как "да"
        {
            re: /^Обе\s+забьют$/i,
            tr: () => (lang === 'en' ? 'Both teams to score' : "Обидві заб'ють")
        },
        // Двойной шанс {TEAM} или ничья
        {
            re: new RegExp(`^Двойной\\s+шанс\\s+${team}\\s+или\\s+ничья$`, 'i'),
            tr: (m) => {
                const tm = m[1];
                if (lang === 'en') return `Double chance ${tm} or draw`;
                return `Подвійний шанс ${tm} або нічия`;
            }
        },
        // Двойной шанс ничья или {TEAM}
        {
            re: new RegExp(`^Двойной\\s+шанс\\s+ничья\\s+или\\s+${team}$`, 'i'),
            tr: (m) => {
                const tm = m[1];
                if (lang === 'en') return `Double chance draw or ${tm}`;
                return `Подвійний шанс нічия або ${tm}`;
            }
        },
        // Тотал больше X
        {
            re: new RegExp(`^Тотал\\s+больше\\s+${num}$`, 'i'),
            tr: (m) => {
                const n = m[1].replace(',', '.');
                if (lang === 'en') return `Over ${n} goals`;
                return `Тотал більше ${n}`;
            }
        },
        // Тотал меньше X
        {
            re: new RegExp(`^Тотал\\s+меньше\\s+${num}$`, 'i'),
            tr: (m) => {
                const n = m[1].replace(',', '.');
                if (lang === 'en') return `Under ${n} goals`;
                return `Тотал менше ${n}`;
            }
        },
        // Фора ±X на {TEAM}
        {
            re: new RegExp(`^Фора\\s*([\\+\\-]?${num})\\s*на\\s+${team}$`, 'i'),
            tr: (m) => {
                const h = m[1].replace(',', '.');
                const tm = m[2];
                if (lang === 'en') return `Handicap ${tm} ${h}`;
                return `Фора ${tm} ${h}`;
            }
        },
        // Победа {TEAM}
        {
            re: new RegExp(`^Победа\\s+${team}$`, 'i'),
            tr: (m) => {
                const tm = m[1];
                if (lang === 'en') return `Win ${tm}`;
                return `Перемога ${tm}`;
            }
        },
        // Ничья
        {
            re: /^Ничья$/i,
            tr: () => (lang === 'en' ? 'Draw' : 'Нічия')
        },
    ];

    for (const p of patterns) {
        const m = t.match(p.re);
        if (m) return p.tr(m);
    }
    // Не распознали — оставим как есть (лучше показать оригинал, чем ошибиться)
    return t;
}

let coins = 0;
let predictions = [];

// Профиль пользователя из Telegram / localStorage
function getUserProfile() {
    let u = telegram?.initDataUnsafe?.user;
    if (!u) {
        try {
            const saved = localStorage.getItem('tg_user');
            if (saved) u = JSON.parse(saved);
        } catch {}
    }
    if (!u) return null;
    return {
        id: u.id,
        username: u.username || null,
        first_name: u.first_name || null,
        last_name: u.last_name || null,
        photo_url: u.photo_url || null
    };
}

function getUserId() {
    const prof = getUserProfile();
    return prof?.id || null;
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
    const profile = getUserProfile();

    if (profile) {
        userName.textContent = `${translations[lang].hello}, ${profile.first_name || translations[lang].guest}`;
        userProfilePic.src = profile.photo_url || 'https://dummyimage.com/50x50/000/fff&text=User';
        localStorage.setItem('tg_user', JSON.stringify(profile));
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
        const response = await fetch(`/api/predictions?userId=${userId}`);
        predictions = await response.json();

        const profile = getUserProfile();
        const balanceResponse = await fetch('/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                action: 'get',
                profile
            })
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

        const shownText = p.isUnlocked
            ? translatePredictionText(p.predictionText, lang)
            : translations[lang].locked;

        div.innerHTML = `
            <div class="teams">
                <span class="tournament">${p.tournament}</span>
                <div class="team-row"><img src="${p.logo1}"> ${p.team1}</div>
                <div class="team-row"><img src="${p.logo2}"> ${p.team2}</div>
            </div>
            <span class="odds">${p.odds}</span>
            <div class="prediction-text">${shownText}</div>
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

// Автообновление раз в 30 сек
setInterval(loadPredictions, 30000);

// Инициализация
loadUserData();
loadPredictions();
