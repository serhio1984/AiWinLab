const axios = require('axios');
const OpenAI = require('openai');

const ODDS_API_KEY = process.env.ODDS_API_KEY || 'd0c08025a01a64651cd3c9d15a29e242';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_KEY });

const ODDS_API_URL = `https://api.the-odds-api.com/v4/sports/soccer/odds/?regions=eu&markets=h2h&apiKey=${ODDS_API_KEY}`;

// Случайные коэффициенты (если нет от API)
function getRandomOdds() {
  const odds = [1.5, 1.7, 1.9, 2.0, 2.3, 2.5, 3.0, 3.5];
  return odds[Math.floor(Math.random() * odds.length)].toFixed(2);
}

// Получение матчей с Odds API
async function fetchMatches() {
  try {
    const res = await axios.get(ODDS_API_URL);
    const games = res.data || [];

    const matches = games.map((g, i) => ({
      id: Date.now() + i,
      tournament: g.sport_title || 'Футбол',
      team1: g.home_team,
      logo1: 'https://img.icons8.com/fluency/48/soccer-ball.png', // заглушка
      team2: g.away_team,
      logo2: 'https://img.icons8.com/fluency/48/soccer-ball.png',
      odds: g.bookmakers?.[0]?.markets?.[0]?.outcomes?.[0]?.price || getRandomOdds()
    }));

    console.log(`🎯 Найдено матчей (Odds API): ${matches.length}`);
    return matches;
  } catch (e) {
    console.error('Ошибка загрузки матчей с The Odds API:', e.message);
    return [];
  }
}

// Генерация прогнозов одним запросом
async function generateAllPredictions(matches) {
  const matchesList = matches
    .map((m, i) => `${i + 1}. ${m.team1} vs ${m.team2}`)
    .join("\n");

  const prompt = `
Ты спортивный аналитик. 
Сделай краткий прогноз для каждого матча ниже в формате ставок 
(например: "Победа {team1}", "Тотал больше 2.5", "Фора -1.5 на {team2}", "Двойной шанс {team1} или ничья", "Ничья").
Ответь строго в формате "номер. прогноз" на русском, без пояснений.
Список матчей:
${matchesList}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    const resultText = response.choices[0].message.content.trim();
    const predictions = resultText.split("\n").map(line => line.replace(/^\d+\.\s*/, '').trim());
    return predictions;
  } catch (e) {
    console.error('Ошибка AI-прогноза:', e.message);
    return matches.map(m => `Победа ${m.team1}`);
  }
}

// Генерация 20 прогнозов
async function generatePredictions() {
  let matches = await fetchMatches();
  if (!matches.length) {
    console.warn('Нет матчей с The Odds API.');
    return [];
  }

  // Берём максимум 20 матчей
  matches = matches.slice(0, 20);

  // Генерируем прогнозы
  const aiPredictions = await generateAllPredictions(matches);

  // Формируем список прогнозов
  const predictions = matches.map((match, i) => ({
    id: match.id,
    tournament: match.tournament,
    team1: match.team1,
    logo1: match.logo1,
    team2: match.team2,
    logo2: match.logo2,
    odds: match.odds,
    predictionText: aiPredictions[i] || `Победа ${match.team1}`
  }));

  // Если матчей < 20, дублируем
  while (predictions.length < 20 && matches.length > 0) {
    const randomMatch = matches[Math.floor(Math.random() * matches.length)];
    predictions.push({
      ...randomMatch,
      id: Date.now() + predictions.length,
      predictionText: `Победа ${randomMatch.team1}`
    });
  }

  console.log(`✅ Сформировано прогнозов: ${predictions.length}`);
  return predictions;
}

module.exports = { generatePredictions };
