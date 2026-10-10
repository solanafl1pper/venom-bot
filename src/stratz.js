'use strict';

/**
 * Герои и меты из Stratz API (stratz.com/developers/applications).
 * Без токена или при ошибке сети откатываемся на локальный список.
 */

const https = require('node:https');

const ENDPOINT = 'https://api.stratz.com/graphql';
const CACHE_MS = 12 * 60 * 60 * 1000;
const TOP_PER_POSITION = 14;

const QUERY = `{
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

// Stratz отдаёт роли числами либо строками — приводим к нашим позициям.
const ROLE_MAP = {
  1: ['carry'],            // Carry
  2: ['mid', 'soft'],      // Nuker
  3: ['carry'],            // Escape
  4: ['carry', 'offlane'], // Pusher
  5: ['offlane', 'soft'],  // Initiator
  6: ['offlane'],          // Durable
  7: ['soft', 'offlane'],  // Disabler
  8: ['soft', 'hard'],     // Support
};

const ROLE_BY_NAME = {
  carry: 1,
  nuker: 2,
  escape: 3,
  pusher: 4,
  initiator: 5,
  durable: 6,
  disabler: 7,
  support: 8,
};

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  const out = [];
  for (const role of roles) {
    if (typeof role === 'number') {
      out.push(role);
      continue;
    }
    if (typeof role === 'string') {
      const id = ROLE_BY_NAME[role.trim().toLowerCase()];
      if (id) out.push(id);
    }
  }
  return out;
}

function positionsFor(roles) {
  const positions = [];
  for (const role of normalizeRoles(roles)) {
    for (const pos of ROLE_MAP[role] || []) {
      if (!positions.includes(pos)) positions.push(pos);
    }
  }
  return positions;
}

function postGraphql(token, query, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: 'api.stratz.com',
        path: '/graphql',
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'sud-bot/1.0',
          // Stratz просит bearer-токен; Client-ID оставлен для совместимости.
          Authorization: `Bearer ${token}`,
          'Client-ID': token,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Stratz HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error('Stratz вернул не JSON'));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Stratz таймаут')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Разбирает ответ Stratz в список { name, positions, pickRate, winRate }. */
function parseHeroes(payload) {
  const list = payload?.data?.heroes;
  if (!Array.isArray(list) || list.length === 0) throw new Error('Stratz: пустой ответ');

  const heroes = [];
  for (const hero of list) {
    if (!hero || typeof hero.name !== 'string') continue;
    const positions = positionsFor(hero.roles);
    if (positions.length === 0) continue;
    heroes.push({
      name: hero.name,
      id: hero.id ?? null,
      positions,
      pickRate: Number(hero?.stats?.pickRate) || 0,
      winRate: Number(hero?.stats?.winRate) || 0,
    });
  }

  if (heroes.length < 20) throw new Error('Stratz: слишком мало героев');
  return heroes;
}

/** Топ героев по пик-рейту для каждой позиции. */
function topByPosition(heroes, limit = TOP_PER_POSITION) {
  const byPosition = {};
  for (const [pos] of Object.entries(require('./data/dota').POSITIONS)) {
    const pool = heroes
      .filter((h) => h.positions.includes(pos))
      .sort((a, b) => b.pickRate - a.pickRate);
    byPosition[pos] = pool.slice(0, limit);
  }
  return byPosition;
}

class StratzClient {
  constructor(token) {
    this.token = token || process.env.STRATZ_TOKEN || '';
    this.heroes = null;
    this.byPosition = null;
    this.fetchedAt = 0;
    this.busy = false;
    this.lastError = null;
  }

  get enabled() {
    return Boolean(this.token);
  }

  async load() {
    if (!this.enabled) {
      this.lastError = 'нет STRATZ_TOKEN';
      return null;
    }
    if (this.heroes && Date.now() - this.fetchedAt < CACHE_MS) return this.byPosition;
    if (this.busy) return this.byPosition;

    this.busy = true;
    try {
      const payload = await postGraphql(this.token, QUERY);
      if (payload?.errors && payload.errors.length) {
        throw new Error(`Stratz: ${payload.errors[0].message}`);
      }
      this.heroes = parseHeroes(payload);
      this.byPosition = topByPosition(this.heroes);
      this.fetchedAt = Date.now();
      this.lastError = null;
      console.log(`[stratz] героев получено: ${this.heroes.length}`);
    } catch (err) {
      this.lastError = err.message;
      console.error('[stratz]', err.message);
    } finally {
      this.busy = false;
    }
    return this.byPosition;
  }
}

module.exports = {
  StratzClient,
  parseHeroes,
  positionsFor,
  normalizeRoles,
  topByPosition,
  postGraphql,
  QUERY,
  CACHE_MS,
  TOP_PER_POSITION,
};