// aiwin-client.js
const telegram = window.Telegram?.WebApp;

if (telegram) {
  telegram.ready();
  telegram.expand();
  console.log('✅ Telegram WebApp initialized');
}

// ===== Языки (визуальный перевод UI и прогноза) =====
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

// ===== Переводы стран (UI) =====
const COUNTRY_TR = {
  ru: {
    'England':'Англия','Scotland':'Шотландия','Wales':'Уэльс','Northern Ireland':'Северная Ирландия','Ireland':'Ирландия',
    'Spain':'Испания','Italy':'Италия','Germany':'Германия','France':'Франция','Netherlands':'Нидерланды','Portugal':'Португалия',
    'Belgium':'Бельгия','Switzerland':'Швейцария','Austria':'Австрия','Turkey':'Турция','Greece':'Греция','Denmark':'Дания',
    'Norway':'Норвегия','Sweden':'Швеция','Poland':'Польша','Czech Republic':'Чехия','Czechia':'Чехия','Croatia':'Хорватия',
    'Serbia':'Сербия','Romania':'Румыния','Hungary':'Венгрия','Slovakia':'Словакия','Slovenia':'Словения','Bulgaria':'Болгария',
    'Bosnia and Herzegovina':'Босния и Герцеговина','North Macedonia':'Северная Македония','Albania':'Албания','Kosovo':'Косово',
    'Montenegro':'Черногория','Moldova':'Молдова','Ukraine':'Украина','Lithuania':'Литва','Latvia':'Латвия','Estonia':'Эстония',
    'Finland':'Финляндия','Iceland':'Исландия','Georgia':'Грузия','Armenia':'Армения','Azerbaijan':'Азербайджан','Cyprus':'Кипр',
    'Andorra':'Андорра','Faroe Islands':'Фарерские о-ва','Gibraltar':'Гибралтар','Luxembourg':'Люксембург','Liechtenstein':'Лихтенштейн',
    'Malta':'Мальта','Monaco':'Монако','San Marino':'Сан-Марино','Israel':'Израиль','Kazakhstan':'Казахстан',
    'International':'Международный','World':'Мир','Europe':'Европа'
  },
  uk: {
    'England':'Англія','Scotland':'Шотландія','Wales':'Уельс','Northern Ireland':'Північна Ірландія','Ireland':'Ірландія',
    'Spain':'Іспанія','Italy':'Італія','Germany':'Німеччина','France':'Франція','Netherlands':'Нідерланди','Portugal':'Португалія',
    'Belgium':'Бельгія','Switzerland':'Швейцарія','Austria':'Австрія','Turkey':'Туреччина','Greece':'Греція','Denmark':'Данія',
    'Norway':'Норвегія','Sweden':'Швеція','Poland':'Польща','Czech Republic':'Чехія','Czechia':'Чехія','Croatia':'Хорватія',
    'Serbia':'Сербія','Romania':'Румунія','Hungary':'Угорщина','Slovakia':'Словаччина','Slovenia':'Словенія','Bulgaria':'Болгарія',
    'Bosnia and Herzegovina':'Боснія і Герцеговина','North Macedonia':'Північна Македонія','Albania':'Албанія','Kosovo':'Косово',
    'Montenegro':'Чорногорія','Moldova':'Молдова','Ukraine':'Україна','Lithuania':'Литва','Latvia':'Латвія','Estonia':'Естонія',
    'Finland':'Фінляндія','Iceland':'Ісландія','Georgia':'Грузія','Armenia':'Вірменія','Azerbaijan':'Азербайджан','Cyprus':'Кіпр',
    'Andorra':'Андорра','Faroe Islands':'Фарерські о-ви','Gibraltar':'Гібралтар','Luxembourg':'Люксембург','Liechtenstein':'Ліхтенштейн',
    'Malta':'Мальта','Monaco':'Монако','San Marino':'Сан-Марино','Israel':'Ізраїль','Kazakhstan':'Казахстан',
    'International':'Міжнародний','World':'Світ','Europe':'Європа'
  },
  en: {} // по умолчанию оставляем, как в API
};

// ===== Переводы лиг (без страны в названии!) =====
const LEAGUE_TR = {
  ru: {
    // Еврокубки
    'UEFA Champions League':'Лига Чемпионов',
    'Champions League':'Лига Чемпионов',
    'UEFA Europa League':'Лига Европы',
    'Europa League':'Лига Европы',
    'UEFA Europa Conference League':'Лига Конференций',
    'Europa Conference League':'Лига Конференций',
    'UEFA Super Cup':'Суперкубок УЕФА',
    'Super Cup':'Суперкубок УЕФА',

    // Топ
    'Premier League':'Премьер-лига',
    'La Liga':'Ла Лига',
    'Serie A':'Серия А',
    'Bundesliga':'Бундеслига',
    'Ligue 1':'Лига 1',
    'Eredivisie':'Эредивизи',
    'Primeira Liga':'Примейра Лига',

    // Другие примеры
    'Scottish Premiership':'Премьер-лига',
    'Super Lig':'Суперлига',
    'Süper Lig':'Суперлига',
    'Super League 1':'Суперлига',
    'Super League Greece':'Суперлига',
    'Jupiler Pro League':'Про Лига',
    'Pro League':'Про Лига',
    'First Division A':'Первый дивизион A',
    'Austrian Bundesliga':'Бундеслига',
    'Swiss Super League':'Суперлига',
    'Super League':'Суперлига',
    'Ekstraklasa':'Экстракласса',
    'Ukrainian Premier League':'Премьер-лига',
    'Eliteserien':'Элитсериен',
    'Allsvenskan':'Аллсвенскан',
    'Superliga':'Суперлига',
    'Danish Superliga':'Суперлига',
    'Czech Liga':'Первая лига',
    'Fortuna Liga':'Фортуна Лига',
    '1. Liga':'Первая лига',
    'HNL':'HNL',
    '1. HNL':'1. HNL',
    'SuperLiga':'Суперлига',
    'Liga I':'Лига I',
    'NB I':'NB I',
    'PrvaLiga':'Первая лига',
    'First League':'Первая лига',
    'Veikkausliiga':'Вейккауслига',
    'Urvalsdeild':'Урвалсдейлд',
    'Úrvalsdeild':'Урвалсдейлд',
    'First Division':'Высший дивизион',
    'Premier Division':'Премьер-дивизион',
    'Cymru Premier':'Камри Премьер',

    // Кубки
    'FA Cup':'Кубок',
    'EFL Cup':'Кубок лиги',
    'Carabao Cup':'Кубок лиги',
    'Community Shield':'Суперкубок',
    'Copa del Rey':'Кубок',
    'Supercopa':'Суперкубок',
    'Coppa Italia':'Кубок',
    'Supercoppa':'Суперкубок',
    'DFB-Pokal':'Кубок',
    'DFB Pokal':'Кубок',
    'DFB Supercup':'Суперкубок',
    'Coupe de France':'Кубок',
    'Trophée des Champions':'Суперкубок',
    'Trophee des Champions':'Суперкубок',
    'KNVB Beker':'Кубок',
    'Johan Cruijff Schaal':'Суперкубок',
    'Johan Cruijff Shield':'Суперкубок',
    'Taça de Portugal':'Кубок',
    'Taca de Portugal':'Кубок',
    'Supertaça':'Суперкубок',
    'Scottish Cup':'Кубок',
    'Scottish League Cup':'Кубок лиги',
    'Austrian Cup':'Кубок',
    'ÖFB-Cup':'Кубок',
    'OFB-Cup':'Кубок',
    'Swiss Cup':'Кубок',
    'Schweizer Cup':'Кубок',
    'Greek Cup':'Кубок',
    'Turkish Cup':'Кубок',
    'Belgian Cup':'Кубок',
    'Croatian Cup':'Кубок',
    'Romanian Cup':'Кубок',
    'Hungarian Cup':'Кубок',
    'Polish Cup':'Кубок',
    'Czech Cup':'Кубок',
    'Slovak Cup':'Кубок',
    'Danish Cup':'Кубок',
    'Norwegian Cup':'Кубок',
    'Swedish Cup':'Кубок',
    'Finnish Cup':'Кубок',
    'Ukrainian Cup':'Кубок'
  },
  uk: {
    'UEFA Champions League':'Ліга чемпіонів',
    'Champions League':'Ліга чемпіонів',
    'UEFA Europa League':'Ліга Європи',
    'Europa League':'Ліга Європи',
    'UEFA Europa Conference League':'Ліга конференцій',
    'Europa Conference League':'Ліга конференцій',
    'UEFA Super Cup':'Суперкубок УЄФА',
    'Super Cup':'Суперкубок УЄФА',

    'Premier League':'Премʼєр-ліга',
    'La Liga':'Ла Ліга',
    'Serie A':'Серія A',
    'Bundesliga':'Бундесліга',
    'Ligue 1':'Ліга 1',
    'Eredivisie':'Ередивізі',
    'Primeira Liga':'Примейра Ліга',

    'Scottish Premiership':'Премʼєр-ліга',
    'Super Lig':'Суперліга',
    'Süper Lig':'Суперліга',
    'Super League 1':'Суперліга',
    'Super League Greece':'Суперліга',
    'Jupiler Pro League':'Про Ліга',
    'Pro League':'Про Ліга',
    'First Division A':'Перший дивізіон A',
    'Austrian Bundesliga':'Бундесліга',
    'Swiss Super League':'Суперліга',
    'Super League':'Суперліга',
    'Ekstraklasa':'Екстракляса',
    'Ukrainian Premier League':'Премʼєр-ліга',
    'Eliteserien':'Елітсерієн',
    'Allsvenskan':'Аллсвенскан',
    'Superliga':'Суперліга',
    'Danish Superliga':'Суперліга',
    'Czech Liga':'Перша ліга',
    'Fortuna Liga':'Фортуна Ліга',
    '1. Liga':'Перша ліга',
    'HNL':'HNL',
    '1. HNL':'1. HNL',
    'SuperLiga':'Суперліга',
    'Liga I':'Ліга I',
    'NB I':'NB I',
    'PrvaLiga':'Перша ліга',
    'First League':'Перша ліга',
    'Veikkausliiga':'Вейккаусліга',
    'Urvalsdeild':'Урвалсдейлд',
    'Úrvalsdeild':'Урвалсдейлд',
    'First Division':'Вищий дивізіон',
    'Premier Division':'Премʼєр-дивізіон',
    'Cymru Premier':'Камрі Премʼєр',

    'FA Cup':'Кубок',
    'EFL Cup':'Кубок ліги',
    'Carabao Cup':'Кубок ліги',
    'Community Shield':'Суперкубок',
    'Copa del Rey':'Кубок',
    'Supercopa':'Суперкубок',
    'Coppa Italia':'Кубок',
    'Supercoppa':'Суперкубок',
    'DFB-Pokal':'Кубок',
    'DFB Pokal':'Кубок',
    'DFB Supercup':'Суперкубок',
    'Coupe de France':'Кубок',
    'Trophée des Champions':'Суперкубок',
    'Trophee des Champions':'Суперкубок',
    'KNVB Beker':'Кубок',
    'Johan Cruijff Schaal':'Суперкубок',
    'Johan Cruijff Shield':'Суперкубок',
    'Taça de Portugal':'Кубок',
    'Taca de Portugal':'Кубок',
    'Supertaça':'Суперкубок',
    'Scottish Cup':'Кубок',
    'Scottish League Cup':'Кубок ліги',
    'Austrian Cup':'Кубок',
    'ÖFB-Cup':'Кубок',
    'OFB-Cup':'Кубок',
    'Swiss Cup':'Кубок',
    'Schweizer Cup':'Кубок',
    'Greek Cup':'Кубок',
    'Turkish Cup':'Кубок',
    'Belgian Cup':'Кубок',
    'Croatian Cup':'Кубок',
    'Romanian Cup':'Кубок',
    'Hungarian Cup':'Кубок',
    'Polish Cup':'Кубок',
    'Czech Cup':'Кубок',
    'Slovak Cup':'Кубок',
    'Danish Cup':'Кубок',
    'Norwegian Cup':'Кубок',
    'Swedish Cup':'Кубок',
    'Finnish Cup':'Кубок',
    'Ukrainian Cup':'Кубок'
  },
  en: {
    // Euro cups (leave as-is or standard English)
    'UEFA Champions League':'UEFA Champions League',
    'Champions League':'UEFA Champions League',
    'UEFA Europa League':'UEFA Europa League',
    'Europa League':'UEFA Europa League',
    'UEFA Europa Conference League':'UEFA Europa Conference League',
    'Europa Conference League':'UEFA Europa Conference League',
    'UEFA Super Cup':'UEFA Super Cup',
    'Super Cup':'UEFA Super Cup',

    // Top
    'Premier League':'Premier League',
    'La Liga':'La Liga',
    'Serie A':'Serie A',
    'Bundesliga':'Bundesliga',
    'Ligue 1':'Ligue 1',
    'Eredivisie':'Eredivisie',
    'Primeira Liga':'Primeira Liga',

    // Others
    'Scottish Premiership':'Scottish Premiership',
    'Super Lig':'Super Lig',
    'Süper Lig':'Süper Lig',
    'Super League 1':'Super League 1',
    'Super League Greece':'Super League',
    'Jupiler Pro League':'Pro League',
    'Pro League':'Pro League',
    'First Division A':'First Division A',
    'Austrian Bundesliga':'Bundesliga',
    'Swiss Super League':'Super League',
    'Super League':'Super League',
    'Ekstraklasa':'Ekstraklasa',
    'Ukrainian Premier League':'Premier League',
    'Eliteserien':'Eliteserien',
    'Allsvenskan':'Allsvenskan',
    'Superliga':'Superliga',
    'Danish Superliga':'Superliga',
    'Czech Liga':'Czech First League',
    'Fortuna Liga':'Fortuna Liga',
    '1. Liga':'First League',
    'HNL':'HNL',
    '1. HNL':'1. HNL',
    'SuperLiga':'SuperLiga',
    'Liga I':'Liga I',
    'NB I':'NB I',
    'PrvaLiga':'PrvaLiga',
    'First League':'First League',
    'Veikkausliiga':'Veikkausliiga',
    'Urvalsdeild':'Úrvalsdeild',
    'Úrvalsdeild':'Úrvalsdeild',
    'First Division':'First Division',
    'Premier Division':'Premier Division',
    'Cymru Premier':'Cymru Premier',

    // Cups
    'FA Cup':'FA Cup',
    'EFL Cup':'EFL Cup',
    'Carabao Cup':'EFL Cup',
    'Community Shield':'Community Shield',
    'Copa del Rey':'Copa del Rey',
    'Supercopa':'Supercopa',
    'Coppa Italia':'Coppa Italia',
    'Supercoppa':'Supercoppa',
    'DFB-Pokal':'DFB-Pokal',
    'DFB Pokal':'DFB-Pokal',
    'DFB Supercup':'DFB Supercup',
    'Coupe de France':'Coupe de France',
    'Trophée des Champions':'Trophée des Champions',
    'Trophee des Champions':'Trophée des Champions',
    'KNVB Beker':'KNVB Beker',
    'Johan Cruijff Schaal':'Johan Cruijff Schaal',
    'Johan Cruijff Shield':'Johan Cruijff Shield',
    'Taça de Portugal':'Taça de Portugal',
    'Taca de Portugal':'Taça de Portugal',
    'Supertaça':'Supertaça',
    'Scottish Cup':'Scottish Cup',
    'Scottish League Cup':'Scottish League Cup',
    'Austrian Cup':'Austrian Cup',
    'ÖFB-Cup':'ÖFB-Cup',
    'OFB-Cup':'ÖFB-Cup',
    'Swiss Cup':'Swiss Cup',
    'Schweizer Cup':'Swiss Cup',
    'Greek Cup':'Greek Cup',
    'Turkish Cup':'Turkish Cup',
    'Belgian Cup':'Belgian Cup',
    'Croatian Cup':'Croatian Cup',
    'Romanian Cup':'Romanian Cup',
    'Hungarian Cup':'Hungarian Cup',
    'Polish Cup':'Polish Cup',
    'Czech Cup':'Czech Cup',
    'Slovak Cup':'Slovak Cup',
    'Danish Cup':'Danish Cup',
    'Norwegian Cup':'Norwegian Cup',
    'Swedish Cup':'Swedish Cup',
    'Finnish Cup':'Finnish Cup',
    'Ukrainian Cup':'Ukrainian Cup'
  }
};

function trCountryUI(country, l) {
  if (!country) return '';
  const dict = COUNTRY_TR[l] || {};
  return dict[country] || country;
}

function trLeagueUI(league, l) {
  if (!league) return '';
  const dict = LEAGUE_TR[l] || {};
  return dict[league] || league;
}

/**
 * Визуальный перевод текста прогноза.
 * Оригинал НЕ модифицируем, только возвращаем строку для отображения.
 */
function translatePredictionText(original, target) {
  try {
    if (!original || target === 'ru') return original;

    const norm = (s) =>
      s.replace(/[–—−]/g, '-')
       .replace(/\s+/g, ' ')
       .replace(/\s*-\s*/g, ' - ')
       .trim();

    const t = norm(original);

    const NUM  = '([0-9]+(?:[\\.,][0-9]+)?)';
    const TEAM = '(.+?)';

    const rules = [
      // ОБЕ ЗАБЬЮТ
      {
        re: /^Обе(?:\s+команды)?\s+забьют\s*[-:() ]*\s*(да|нет)$/i,
        tr: (m) => {
          const yn = (m[1] || '').toLowerCase();
          if (target === 'en') return `Both teams to score — ${yn === 'да' ? 'yes' : 'no'}`;
          return `Обидві заб'ють — ${yn === 'да' ? 'так' : 'ні'}`;
        }
      },
      {
        re: /^Обе(?:\s+команды)?\s+забьют$/i,
        tr: () => (target === 'en' ? 'Both teams to score' : "Обидві заб'ють")
      },

      // Тоталы
      {
        re: new RegExp(`^Тотал\\s+больше\\s+${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}`
      },
      {
        re: new RegExp(`^Тотал\\s+меньше\\s+${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}`
      },
      {
        re: new RegExp(`^ТБ\\s*${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Over ${m[1].replace(',', '.')} goals` : `Тотал більше ${m[1].replace(',', '.')}`
      },
      {
        re: new RegExp(`^ТМ\\s*${NUM}$`, 'i'),
        tr: (m) => target === 'en' ? `Under ${m[1].replace(',', '.')} goals` : `Тотал менше ${m[1].replace(',', '.')}`
      },

      // Фора
      {
        re: new RegExp(`^Фора\\s*([\\+\\-]?${NUM})\\s*на\\s+${TEAM}$`, 'i'),
        tr: (m) => {
          const h = (m[1] || '').replace(',', '.');
          const tm = m[2];
          if (target === 'en') return `Handicap ${tm} ${h}`;
          return `Фора ${tm} ${h}`.replace('Фора', 'Фора'); // в укр теж "Фора" зазвичай
        }
      },
      {
        re: new RegExp(`^${TEAM}\\s+Фора\\s*([\\+\\-]?${NUM})$`, 'i'),
        tr: (m) => {
          const tm = m[1];
          const h = (m[2] || '').replace(',', '.');
          if (target === 'en') return `Handicap ${tm} ${h}`;
          return `${tm} Фора ${h}`;
        }
      },

      // Исходы
      { re: new RegExp(`^Победа\\s+${TEAM}$`, 'i'), tr: (m) => target === 'en' ? `Win ${m[1]}` : `Перемога ${m[1]}` },
      { re: /^Ничья$/i, tr: () => (target === 'en' ? 'Draw' : 'Нічия') },

      // Короткие исходы
      { re: /^П1$/i, tr: () => (target === 'en' ? 'Home win' : 'Перемога господарів') },
      { re: /^П2$/i, tr: () => (target === 'en' ? 'Away win' : 'Перемога гостей') },
      { re: /^Х$/i,  tr: () => (target === 'en' ? 'Draw' : 'Нічия') },
      { re: /^1Х$/i, tr: () => (target === 'en' ? '1X (home or draw)' : '1X (господарі або нічия)') },
      { re: /^Х2$/i, tr: () => (target === 'en' ? 'X2 (draw or away)' : 'X2 (нічия або гості)') },
      { re: /^12$/i, tr: () => (target === 'en' ? '12 (no draw)' : '12 (без нічиєї)') }
    ];

    for (const r of rules) {
      const m = t.match(r.re);
      if (m) return r.tr(m);
    }
    return original;
  } catch (e) {
    console.error('translatePredictionText error:', e);
    return original;
  }
}

let coins = 0;
let predictions = [];

// ===== Профиль пользователя (только чтение для UI и balance) =====
function getUserProfileRaw() {
  let u = telegram?.initDataUnsafe?.user;
  if (!u) {
    try {
      const saved = localStorage.getItem('tg_user');
      if (saved) u = JSON.parse(saved);
    } catch {}
  }
  return u || null;
}
function getUserId() {
  const u = getUserProfileRaw();
  return u?.id || null;
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
  const u = getUserProfileRaw();

  if (u) {
    userName.textContent = `${translations[lang].hello}, ${u.first_name || translations[lang].guest}`;
    userProfilePic.src = u.photo_url || 'https://dummyimage.com/50x50/000/fff&text=User';
    localStorage.setItem('tg_user', JSON.stringify(u));
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
    // 1) Берём опубликованные прогнозы (оригинал из БД)
    const response = await fetch(`/api/predictions?userId=${userId}`);
    predictions = await response.json();

    // 2) Обновляем/получаем баланс + сохраняем профиль на сервере
    const u = getUserProfileRaw();
    const balanceResponse = await fetch('/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action: 'get',
        profile: u
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

// Построение строки турнира: "ДД.ММ.ГГ Страна. Лига"
function formatTournamentLine(p) {
  const countryDisp = trCountryUI(p.country || '', lang);
  const leagueDisp  = trLeagueUI(p.league || '', lang);

  // Международные (сборные/еврокубки): если страна = International/Europe/World — показываем только лигу
  const isInternational = /^(International|World|Europe)$/i.test(p.country || '');

  if (isInternational) {
    return `${p.date || ''} ${leagueDisp}`.trim();
  }
  // Обычные лиги/домашние кубки: Страна. Лига (без дублирования страны внутри названия лиги!)
  return `${p.date || ''} ${countryDisp ? countryDisp + '. ' : ''}${leagueDisp}`.trim();
}

/**
 * Рендер карточек: исходные данные из БД, в DOM показываем перевод,
 * а оригинал кладём в data-original (на будущее/отладку).
 */
function renderPredictions() {
  const { predictionsContainer } = getDOMElements();
  predictionsContainer.innerHTML = '';

  predictions.forEach(p => {
    const div = document.createElement('div');
    div.className = `prediction ${p.isUnlocked ? 'unlocked' : 'locked'}`;
    div.setAttribute('data-id', p.id);

    const textOriginal = p.predictionText || '';
    const textShown = p.isUnlocked
      ? translatePredictionText(textOriginal, lang)
      : translations[lang].locked;

    // ВАЖНО: теперь строим строку турнира из country/league/date, чтобы убрать дубли страны
    const tournamentUI = formatTournamentLine(p);

    div.innerHTML = `
      <div class="teams">
        <span class="tournament">${tournamentUI}</span>
        <div class="team-row"><img src="${p.logo1}"> ${p.team1}</div>
        <div class="team-row"><img src="${p.logo2}"> ${p.team2}</div>
      </div>
      <span class="odds">${p.odds}</span>
      <div class="prediction-text" data-original="${textOriginal.replace(/"/g, '&quot;')}">${textShown}</div>
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
