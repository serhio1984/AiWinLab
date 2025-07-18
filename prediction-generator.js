function getRandomOdds() {
    return (1.5 + Math.random() * 2).toFixed(2);
}

function getRandomMatch() {
    const teams = [
        ['Барселона', 'Реал Мадрид'],
        ['Манчестер Сити', 'Ливерпуль'],
        ['Бавария', 'ПСЖ'],
        ['Челси', 'Арсенал'],
        ['Интер', 'Милан']
    ];
    return teams[Math.floor(Math.random() * teams.length)];
}

async function generatePredictions() {
    const predictions = [];
    for (let i = 0; i < 5; i++) {
        const [team1, team2] = getRandomMatch();
        predictions.push({
            id: Date.now() + i,
            tournament: 'UEFA Champions League',
            team1,
            logo1: `https://dummyimage.com/50x50/ff6200/fff&text=${team1[0]}`,
            team2,
            logo2: `https://dummyimage.com/50x50/ff6200/fff&text=${team2[0]}`,
            odds: getRandomOdds(),
            predictionText: `${team1} победит ${team2}`
        });
    }
    return predictions;
}

module.exports = { generatePredictions };
