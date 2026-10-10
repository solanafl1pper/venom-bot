'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;
// Кулдаун между попытками словить судимость.
const COOLDOWN_MS = 15 * 60 * 1000;

function nextRollAt(user) {
  if (!user || !user.lastRollAt) return 0;
  return user.lastRollAt + COOLDOWN_MS;
}

function msUntilNextRoll(user, now = Date.now()) {
  return Math.max(0, nextRollAt(user) - now);
}

function isDue(user, now = Date.now()) {
  return !user || !user.lastRollAt || now - user.lastRollAt >= COOLDOWN_MS;
}

class Storage {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.dir = path.dirname(this.filePath);
    this.tmpPath = `${this.filePath}.tmp`;
    this.queue = Promise.resolve();
    this.data = { version: 1, users: {}, games: {}, channels: {}, meta: { lastDailyReset: null } };
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          version: parsed.version || 1,
          users: parsed.users || {},
          games: parsed.games || {},
          channels: parsed.channels || {},
          meta: { lastDailyReset: parsed.meta?.lastDailyReset || null, ...(parsed.meta || {}) },
        };
      } catch (err) {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        fs.renameSync(this.filePath, backup);
        console.error(`[storage] Файл повреждён, переименован в ${backup}:`, err.message);
      }
    }
    return this;
  }

  flush() {
    this.queue = this.queue.then(async () => {
      const payload = JSON.stringify(this.data);
      await fsp.mkdir(this.dir, { recursive: true });
      await fsp.writeFile(this.tmpPath, payload, 'utf8');
      await fsp.rename(this.tmpPath, this.filePath);
    }).catch((err) => {
      console.error('[storage] Ошибка записи:', err.message);
    });
    return this.queue;
  }

  getUser(userId) {
    return this.data.users[String(userId)] || null;
  }

  ensureUser(userId, profile = {}) {
    const key = String(userId);
    if (!this.data.users[key]) {
      this.data.users[key] = {
        userId: key,
        username: profile.username || 'неизвестно',
        guildId: profile.guildId || null,
        createdAt: Date.now(),
        lastRollAt: null,
        lastCheckAt: null,
        rolls: 0,
        current: null,
        bestCount: 0,
        bestPoints: 0,
        history: [],
        messages: 0,
        voiceTimeMs: 0,
        voiceSessions: 0,
        lastVoiceAt: null,
      };
    } else {
      if (profile.username) this.data.users[key].username = profile.username;
      if (this.data.users[key].messages === undefined) this.data.users[key].messages = 0;
      if (this.data.users[key].voiceTimeMs === undefined) this.data.users[key].voiceTimeMs = 0;
      if (this.data.users[key].voiceSessions === undefined) this.data.users[key].voiceSessions = 0;
      if (this.data.users[key].lastVoiceAt === undefined) this.data.users[key].lastVoiceAt = null;
    }
    if (profile.guildId) this.data.users[key].guildId = profile.guildId;
    return this.data.users[key];
  }

  incrementMessages(userId, profile = {}) {
    const user = this.ensureUser(userId, profile);
    user.messages = (user.messages || 0) + 1;
    return user.messages;
  }

  saveUser(user) {
    this.data.users[String(user.userId)] = user;
    this.flush();
    return user;
  }

  allUsers() {
    return Object.values(this.data.users);
  }

  nextRollAt(user) {
    return nextRollAt(user);
  }

  msUntilNextRoll(user, now = Date.now()) {
    return msUntilNextRoll(user, now);
  }

  bestScore(game, userId) {
    const byGame = this.data.games[game] || {};
    return byGame[String(userId)] || 0;
  }

  setBestScore(game, userId, score) {
    if (!this.data.games[game]) this.data.games[game] = {};
    const key = String(userId);
    const current = this.data.games[game][key] || 0;
    if (score > current) {
      this.data.games[game][key] = score;
      this.flush();
    }
    return this.data.games[game][key];
  }

  ratingOf(user, now = Date.now()) {
    const { ratingFor } = require('./engine');
    return ratingFor(user, now);
  }

  top(limit = 10, now = Date.now()) {
    return this.allUsers()
      .filter((u) => u.current && u.current.length > 0)
      .sort((a, b) => {
        const diff = this.ratingOf(b, now) - this.ratingOf(a, now);
        if (diff !== 0) return diff;
        return (b.bestCount || 0) - (a.bestCount || 0);
      })
      .slice(0, limit);
  }

  getChannelTime(channelId) {
    return this.data.channels?.[String(channelId)] || 0;
  }

  addChannelTime(channelId, ms) {
    if (!this.data.channels) this.data.channels = {};
    const key = String(channelId);
    this.data.channels[key] = (this.data.channels[key] || 0) + ms;
    this.flush();
    return this.data.channels[key];
  }

  stats() {
    const users = this.allUsers();
    const withRecord = users.filter((u) => u.current && u.current.length > 0);
    const totalArticles = withRecord.reduce(
      (sum, u) => sum + u.current.reduce((s, x) => s + x.points, 0),
      0,
    );
    const bestCount = users.reduce((max, u) => Math.max(max, u.bestCount || 0), 0);
    return {
      users: users.length,
      convicted: withRecord.length,
      totalArticles,
      bestCount,
    };
  }
}

module.exports = {
  Storage,
  DAY_MS,
  COOLDOWN_MS,
  nextRollAt,
  msUntilNextRoll,
  isDue,
};