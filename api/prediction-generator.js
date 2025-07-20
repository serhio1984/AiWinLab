const axios = require('axios');
const OpenAI = require('openai');

const API_KEY = process.env.FOOTBALL_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const API_URL = 'https://v3.football.api-sports.io/fixtures?date=';

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Возможные коэффициенты (для теста — случайные)
function getRandomOdds() {
    const odds = [1.5, 1.7, 1.9, 2.0, 2.3, 2.5, 3.0, 3.5];
    return odds[Math.floor(Math.random() * odds.length)].toFixed(2);
}

// Получаем список матчей на сегодня
async function fetchMatches() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const res = await axios.get(`${API_URL}${today}`, {
            headers: { 'x-apisports-key': API_KEY }
        });
        return res.data.response || [];
    } catch (e) {
        console.error('Ошибка загрузки матчей:', e.message);
        return [];
    }
}

// Генерация прогноза ИИ (короткий, на русском)
async function generateAIPrediction(home, away) {
    const prompt = `
Ты спортивный аналитик. 
Дай один краткий прогноз на матч ${home} против ${away}. 
Формат: только результат (например, "Победа ${home}", "Тотал больше 2.5", "Фора -1.5 на ${away}", "Двойной шанс ${home} или ничья", "Ничья"). 
Пиши на русском. Никаких объяснений.
    `;
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        return response.choices[0].message.content.trim();
    } catch (e) {
        console.error('Ошибка AI-прогноза:', e.message);
        return `Победа ${home}`;
    }
}

// Генерация 20 прогнозов
async function generatePredictions() {
    const matches = await fetchMatches();
    if (!matches.length) {
        console.warn('Нет матчей на сегодня.');
        return [];
    }

    const predictions = [];
    const maxPredictions = 20;
    const matchCount = Math.min(maxPredictions, matches.length);

    for (let i = 0; i < matchCount; i++) {
        const match = matches[i];
        const home = match.teams.home.name;
        const away = match.teams.away.name;
        const aiText = await generateAIPrediction(home, away);

        predictions.push({
            id: Date.now() + i,
            tournament: match.league.name,
            team1: home,
            logo1: match.teams.home.logo,
            team2: away,
            logo2: match.teams.away.logo,
            odds: getRandomOdds(),
            predictionText: aiText
        });
    }

    // Если матчей меньше 20 — дублируем с другими прогнозами (fallback)
    while (predictions.length < maxPredictions) {
        const randomMatch = matches[Math.floor(Math.random() * matches.length)];
        const home = randomMatch.teams.home.name;
        const away = randomMatch.teams.away.name;
        const aiText = await generateAIPrediction(home, away);

        predictions.push({
            id: Date.now() + predictions.length,
            tournament: randomMatch.league.name,
            team1: home,
            logo1: randomMatch.teams.home.logo,
            team2: away,
            logo2: randomMatch.teams.away.logo,
            odds: getRandomOdds(),
            predictionText: aiText
        });
    }

    return predictions;
}

module.exports = { generatePredictions };
