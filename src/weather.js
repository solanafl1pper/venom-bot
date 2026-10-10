'use strict';

/**
 * Погода через Open-Meteo (без API-ключа).
 * Если сеть недоступна — возвращаем null, статус это переживает.
 */

const https = require('node:https');

const CACHE_MS = 10 * 60 * 1000;

// Коды погоды WMO → эмодзи и подпись по-русски.
const WMO = {
  0: ['☀️', 'ясно'],
  1: ['🌤️', 'малооблачно'],
  2: ['⛅', 'переменная облачность'],
  3: ['☁️', 'пасмурно'],
  45: ['🌫️', 'туман'],
  48: ['🌫️', 'изморозь'],
  51: ['🌦️', 'морось'],
  53: ['🌦️', 'морось'],
  55: ['🌧️', 'морось'],
  56: ['🌧️', 'ледяная морось'],
  57: ['🌧️', 'ледяная морось'],
  61: ['🌧️', 'дождь'],
  63: ['🌧️', 'дождь'],
  65: ['🌧️', 'ливень'],
  66: ['🌧️', 'ледяной дождь'],
  67: ['🌧️', 'ледяной дождь'],
  71: ['🌨️', 'снег'],
  73: ['🌨️', 'снег'],
  75: ['❄️', 'снегопад'],
  77: ['❄️', 'снежная крупа'],
  80: ['🌦️', 'ливни'],
  81: ['🌦️', 'ливни'],
  82: ['⛈️', 'ливень с градом'],
  85: ['🌨️', 'снежные заряды'],
  86: ['❄️', 'снежные заряды'],
  95: ['⛈️', 'гроза'],
  96: ['⛈️', 'гроза с градом'],
  99: ['⛈️', 'гроза с градом'],
};

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'sud-bot/1.0' }, timeout: 8000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('таймаут')));
    req.on('error', reject);
  });
}

function plural(n, one, few, many) {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

function describe(code, temp) {
  const [emoji, text] = WMO[code] || ['🌡️', 'непонятная погода'];
  const rounded = Math.round(temp);
  const sign = rounded > 0 ? '+' : '';
  return { emoji, text, temp: `${sign}${rounded}°`, short: `${emoji} ${sign}${rounded}°` };
}

async function geocode(city) {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`;
  const data = await get(url);
  const place = data?.results?.[0];
  if (!place) throw new Error('город не найден');
  return {
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

async function fetchWeather(city = process.env.WEATHER_CITY || 'Москва') {
  const place = await geocode(city);
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${place.latitude}&longitude=${place.longitude}` +
    '&current=temperature_2m,weather_code&timezone=auto';
  const data = await get(url);
  const code = data?.current?.weather_code;
  const temp = data?.current?.temperature_2m;
  if (code === undefined || temp === undefined) throw new Error('неполный ответ');

  const w = describe(code, temp);
  return {
    city: place.name,
    ...w,
    line: `${place.name} ${w.temp} ${w.emoji}`,
    people: `${w.text}, ${Math.round(temp) > 0 ? '+' : ''}${Math.round(temp)}°`,
  };
}

class WeatherCache {
  constructor(city) {
    this.city = city || process.env.WEATHER_CITY || 'Москва';
    this.data = null;
    this.fetchedAt = 0;
    this.busy = false;
  }

  async get() {
    const fresh = this.data && Date.now() - this.fetchedAt < CACHE_MS;
    if (fresh) return this.data;
    if (this.busy) return this.data;

    this.busy = true;
    try {
      this.data = await fetchWeather(this.city);
      this.fetchedAt = Date.now();
    } catch (err) {
      console.error('[погода]', err.message);
      // Не сбрасываем прошлые данные: лучше старые, чем ничего.
    } finally {
      this.busy = false;
    }
    return this.data;
  }
}

// По одному кэшу на город, чтобы не долбить API и не терять данные.
const caches = new Map();

function cacheFor(city) {
  const key = (city || process.env.WEATHER_CITY || 'Москва').trim().toLowerCase();
  if (!caches.has(key)) caches.set(key, new WeatherCache(key));
  return caches.get(key);
}

async function getWeather(city) {
  return cacheFor(city).get();
}

module.exports = {
  WeatherCache,
  cacheFor,
  getWeather,
  fetchWeather,
  describe,
  plural,
  CACHE_MS,
  WMO,
};