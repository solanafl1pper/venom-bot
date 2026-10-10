'use strict';

/**
 * Проба Stratz API: отвечает ли без токена и что в ответе.
 * Запуск: node scripts/test-stratz-live.js
 */

const https = require('node:https');

const token = process.env.STRATZ_TOKEN || process.argv[2] || '';
const withToken = Boolean(token);

const query = `{
  heroes {
    id
    name
    roles
    stats {
      pickRate
      winRate
    }
  }
}`;

const body = JSON.stringify({ query });

const req = https.request(
  {
    hostname: 'api.stratz.com',
    path: '/graphql',
    method: 'POST',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'sud-bot/1.0',
      ...(withToken ? { 'Client-ID': token } : {}),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      console.log('токен:', withToken ? 'есть' : 'нет');
      console.log('HTTP', res.statusCode);
      const text = data.trim();
      console.log('ответ:', text.length > 400 ? `${text.slice(0, 400)}...` : text);
      try {
        const json = JSON.parse(text);
        if (json.data && json.data.heroes) {
          console.log('героев в ответе:', json.data.heroes.length);
          console.log('пример:', JSON.stringify(json.data.heroes[0]));
          const withStats = json.data.heroes.filter((h) => h.stats && h.stats.pickRate > 0);
          console.log('героев с pickRate:', withStats.length);
        }
      } catch {
        /* не JSON — уже напечатали */
      }
    });
  },
);

req.on('timeout', () => req.destroy(new Error('таймаут')));
req.on('error', (err) => console.log('ошибка сети:', err.message));
req.end(body);