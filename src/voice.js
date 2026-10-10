'use strict';

/**
 * Подсчёт времени в голосовых каналах для лампового сервера друзей.
 * - Считает чистое время в войсе в реальном времени.
 * - Каждые 30 секунд сохраняет прогресс в sud.json, чтобы ничего не терялось при перезапуске.
 * - Подхватывает участников, которые уже сидели в войсе на момент старта бота.
 */

function plural(n, one, few, many) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatVoiceDuration(ms) {
  if (!ms || ms <= 0) return '0 мин';
  const totalMinutes = Math.floor(ms / (60 * 1000));
  if (totalMinutes === 0) return 'меньше минуты';
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0 || days > 0) parts.push(`${hours} ч`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} мин`);
  return parts.join(' ');
}

function formatHoursDecimal(ms) {
  if (!ms || ms <= 0) return '0 ч';
  const hours = ms / (60 * 60 * 1000);
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} ч`;
}

function getVoiceTop(storage, activeSessions = new Map(), limit = 10, guildId = null) {
  const now = Date.now();
  const users = storage.allUsers();
  const withVoice = users.map((u) => {
    const session = activeSessions.get(u.userId);
    const activeDelta = session ? Math.max(0, now - session.lastFlushedAt) : 0;
    const totalMs = (u.voiceTimeMs || 0) + activeDelta;
    return {
      userId: u.userId,
      username: u.username,
      guildId: u.guildId,
      totalMs,
      sessions: u.voiceSessions || (session ? 1 : 0),
      active: Boolean(session),
      channelId: session?.channelId || null,
    };
  });

  const filtered = guildId
    ? withVoice.filter((u) => !u.guildId || u.guildId === guildId)
    : withVoice;

  return filtered
    .filter((u) => u.totalMs > 0 || u.active)
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, limit);
}

function getUserVoiceRank(storage, activeSessions = new Map(), userId, guildId = null) {
  const top = getVoiceTop(storage, activeSessions, 999999, guildId);
  const index = top.findIndex((u) => u.userId === String(userId));
  return index === -1 ? null : { rank: index + 1, total: top.length };
}

class VoiceTracker {
  constructor(storage) {
    this.storage = storage;
    this.activeSessions = new Map(); // userId -> { joinedAt, lastFlushedAt, channelId, guildId, username }
    this.flushInterval = null;
  }

  start(client) {
    client.on('voiceStateUpdate', (oldState, newState) => {
      this.handleVoiceStateUpdate(oldState, newState);
    });

    this.flushInterval = setInterval(() => {
      this.flushActive();
    }, 30_000);
    this.flushInterval.unref?.();

    if (client.isReady?.()) {
      this.scanGuilds(client);
    } else {
      client.once('clientReady', () => {
        this.scanGuilds(client);
      });
    }
  }

  scanGuilds(client) {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.isVoiceBased?.() && channel.members) {
          for (const member of channel.members.values()) {
            if (!member.user?.bot) {
              this.handleJoin(member.id, channel.id, guild.id, member.user?.username || 'друг', now);
            }
          }
        }
      }
    }
  }

  handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;

    const userId = member.id;
    const username = member.user?.username || 'друг';
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (!oldChannelId && newChannelId) {
      this.handleJoin(userId, newChannelId, newState.guild.id, username);
      return;
    }

    if (oldChannelId && !newChannelId) {
      this.handleLeave(userId);
      return;
    }

    if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
      this.handleMove(userId, newChannelId, newState.guild.id, username);
    }
  }

  handleJoin(userId, channelId, guildId, username, now = Date.now()) {
    if (this.activeSessions.has(userId)) {
      const session = this.activeSessions.get(userId);
      session.channelId = channelId;
      session.guildId = guildId;
      return;
    }

    this.activeSessions.set(userId, {
      joinedAt: now,
      lastFlushedAt: now,
      channelId,
      guildId,
      username,
    });

    const user = this.storage.ensureUser(userId, { guildId, username });
    user.voiceSessions = (user.voiceSessions || 0) + 1;
    user.lastVoiceAt = now;
    this.storage.saveUser(user);
  }

  handleLeave(userId, now = Date.now()) {
    const session = this.activeSessions.get(userId);
    if (!session) return;

    const delta = Math.max(0, now - session.lastFlushedAt);
    const user = this.storage.ensureUser(userId, { guildId: session.guildId, username: session.username });
    user.voiceTimeMs = (user.voiceTimeMs || 0) + delta;
    user.lastVoiceAt = now;
    if (delta > 0 && session.channelId) {
      this.storage.addChannelTime(session.channelId, delta);
    }
    this.activeSessions.delete(userId);
    this.storage.saveUser(user);
  }

  handleMove(userId, newChannelId, guildId, username, now = Date.now()) {
    const session = this.activeSessions.get(userId);
    if (!session) {
      this.handleJoin(userId, newChannelId, guildId, username, now);
      return;
    }

    const delta = Math.max(0, now - session.lastFlushedAt);
    const user = this.storage.ensureUser(userId, { guildId, username });
    user.voiceTimeMs = (user.voiceTimeMs || 0) + delta;
    if (delta > 0 && session.channelId) {
      this.storage.addChannelTime(session.channelId, delta);
    }
    session.lastFlushedAt = now;
    session.channelId = newChannelId;
    session.guildId = guildId;
    this.storage.saveUser(user);
  }

  flushActive(now = Date.now()) {
    let changed = false;
    for (const [userId, session] of this.activeSessions.entries()) {
      const delta = Math.max(0, now - session.lastFlushedAt);
      if (delta > 0) {
        const user = this.storage.ensureUser(userId, { guildId: session.guildId, username: session.username });
        user.voiceTimeMs = (user.voiceTimeMs || 0) + delta;
        if (session.channelId) {
          this.storage.addChannelTime(session.channelId, delta);
        }
        session.lastFlushedAt = now;
        changed = true;
      }
    }
    if (changed) {
      this.storage.flush();
    }
  }

  getChannelLiveTime(channelId) {
    const stored = this.storage.getChannelTime(channelId);
    let activeDelta = 0;
    const now = Date.now();
    for (const session of this.activeSessions.values()) {
      if (session.channelId === String(channelId)) {
        activeDelta += Math.max(0, now - session.lastFlushedAt);
      }
    }
    return stored + activeDelta;
  }

  getGuildVoiceChannels(guild) {
    if (!guild?.channels?.cache) return [];
    const channels = [];
    for (const c of guild.channels.cache.values()) {
      if (c.isVoiceBased?.()) {
        const activeMembers = c.members
          ? [...c.members.values()].filter((m) => !m.user?.bot).map((m) => `<@${m.id}>`)
          : [];
        const totalMs = this.getChannelLiveTime(c.id);
        if (totalMs > 0 || activeMembers.length > 0) {
          channels.push({
            id: c.id,
            name: c.name,
            totalMs,
            activeMembers,
          });
        }
      }
    }
    return channels.sort((a, b) => {
      if (a.activeMembers.length !== b.activeMembers.length) {
        return b.activeMembers.length - a.activeMembers.length;
      }
      return b.totalMs - a.totalMs;
    });
  }

  getUserLiveStats(userId) {
    const user = this.storage.getUser(userId);
    const session = this.activeSessions.get(String(userId));
    const now = Date.now();
    const activeDelta = session ? Math.max(0, now - session.lastFlushedAt) : 0;
    const totalMs = (user?.voiceTimeMs || 0) + activeDelta;
    const sessions = user?.voiceSessions || (session ? 1 : 0);

    return {
      totalMs,
      formatted: formatVoiceDuration(totalMs),
      hoursDecimal: formatHoursDecimal(totalMs),
      sessions,
      active: Boolean(session),
      channelId: session?.channelId || null,
      currentSessionMs: session ? Math.max(0, now - session.joinedAt) : 0,
      currentSessionFormatted: session ? formatVoiceDuration(Math.max(0, now - session.joinedAt)) : null,
    };
  }

  getTop(limit = 10, guildId = null) {
    return getVoiceTop(this.storage, this.activeSessions, limit, guildId);
  }

  getRank(userId, guildId = null) {
    return getUserVoiceRank(this.storage, this.activeSessions, userId, guildId);
  }
}

module.exports = {
  VoiceTracker,
  formatVoiceDuration,
  formatHoursDecimal,
  getVoiceTop,
  getUserVoiceRank,
  plural,
};
