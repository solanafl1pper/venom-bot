'use strict';

/**
 * Живая проверка погодного API.
 * Запуск: node scripts/test-weather-live.js
 */

const { fetchWeather } = require('../src/weather');

const city = process.argv[2] || process.env.WEATHER_CITY || 'Москва';

fetchWeather(city)
  .then((w) => {
    console.log('город:  ', w.city);
    console.log('строка: ', w.line);
    console.log('текст:  ', w.people);
    console.log('эмодзи: ', w.emoji);
    if (!w.line.includes(w.city)) {
      console.error('FAIL: в строке нет города');
      process.exit(1);
    }
    console.log('\nПогодный API отвечает корректно.');
  })
  .catch((err) => {
    console.error('FAIL: погода недоступна —', err.message);
    process.exit(1);
  });