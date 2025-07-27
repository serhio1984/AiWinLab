const { generatePredictions } = require('./prediction-generator');

cron.schedule('0 18 * * *', async () => {
    console.log('⏰ Генерация черновиков прогнозов (18:00 Киев)');
    try {
        const predictions = await generatePredictions();
        console.log(`✅ Сгенерировано и сохранено в черновики: ${predictions.length}`);
    } catch (err) {
        console.error('❌ Ошибка генерации черновиков:', err);
    }
}, { timezone: 'Europe/Kiev' });
