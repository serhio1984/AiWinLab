const axios = require('axios');
const OpenAI = require('openai');

const API_KEY = process.env.FOOTBALL_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const API_URL = 'https://v3.football.api-sports.io/fixtures?date=';

const openai = new OpenAI({ apiKey: OPENAI_KEY });

function getRandomOdds() {
    return (1.5 + Math.random() * 2).toFixed(2);
}

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

async function generateAIPrediction(home, away) {
    if (!OPENAI_KEY) return `${home} или ${away} победит.`;
    try {
        const prompt = `Дай краткий прогноз на матч ${home} против ${away}. Укажи вероятного победителя и причину (2 предложения).`;
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        return response.choices[0].message.content;
    } catch (e) {
        console.error('Ошибка AI-прогноза:', e.message);
        return `${home} или ${away} имеет хорошие шансы на победу.`;
    }
}

async function generatePredictions() {
    const matches = await fetchMatches();
    if (!matches.length) {
        console.warn('Нет матчей на сегодня.');
        return [];
    }

    const predictions = [];
    for (let i = 0; i < Math.min(5, matches.length); i++) {
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
    return predictions;
}

module.exports = { generatePredictions };
