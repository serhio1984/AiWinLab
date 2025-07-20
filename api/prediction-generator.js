const axios = require('axios');
const OpenAI = require('openai');

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ODDS_API_KEY = 'd0c08025a01a64651cd3c9d15a29e242';

const API_URL = 'https://v3.football.api-sports.io/fixtures?date=';
const ODDS_API_URL = 'https://api.the-odds-api.com/v4/sports/soccer/odds?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=' + ODDS_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_KEY });

function getRandomOdds() {
    const odds = [1.5, 1.7, 1.9, 2.0, 2.3, 2.5, 3.0, 3.5];
    return odds[Math.floor(Math.random() * odds.length)].toFixed(2);
}

async function fetchMatches() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const res = await axios.get(`${API_URL}${today}`, {
            headers: { 'x-apisports-key': FOOTBALL_API_KEY }
        });
        return res.data.response || [];
    } catch (e) {
        console.error('Ошибка загрузки матчей:', e.message);
        return [];
    }
}

async function fetchRealOdds(team1, team2) {
    try {
        const res = await axios.get(ODDS_API_URL);
        const games = res.data;
        for (const game of games) {
            if (
                game.home_team.toLowerCase().includes(team1.toLowerCase()) ||
                game.away_team.toLowerCase().includes(team2.toLowerCase())
            ) {
                if (game.bookmakers?.length > 0 && game.bookmakers[0].markets?.length > 0) {
                    return game.bookmakers[0].markets[0].outcomes[0].price;
                }
            }
        }
        return null;
    } catch (e) {
        console.error('Ошибка загрузки коэффициентов (The Odds API):', e.message);
        return null;
    }
}

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

        const realOdds = await fetchRealOdds(home, away);
        const odds = realOdds || getRandomOdds();

        predictions.push({
            id: Date.now() + i,
            tournament: match.league.name,
            team1: home,
            logo1: match.teams.home.logo,
            team2: away,
            logo2: match.teams.away.logo,
            odds,
            predictionText: aiText
        });
    }

    return predictions;
}

module.exports = { generatePredictions };
