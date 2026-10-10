'use strict';

/**
 * Статус бота в Discord: сколько людей на серверах.
 * Погода сюда намеренно не выводится — она живёт в команде /погода.
 */

const { ActivityType } = require('discord.js');

const REFRESH_MS = 5 * 60 * 1000;
const NOTE = 'жми /судимость';

function plural(n, one, few, many) {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

function totalMembers(client) {
  let total = 0;
  for (const guild of client.guilds.cache.values()) {
    total += guild.memberCount || 0;
  }
  return total;
}

function memberLine(client) {
  const total = totalMembers(client);
  const guilds = client.guilds.cache.size;
  if (total === 0) return '👥 никого пока нет';
  return `👥 ${total} ${plural(total, 'человек', 'человека', 'человек')} · ${guilds} ${plural(guilds, 'сервер', 'сервера', 'серверов')}`;
}

function buildStatus(client) {
  return {
    name: memberLine(client).slice(0, 128),
    state: NOTE,
  };
}

function startPresence(client) {
  const update = () => {
    const { name, state } = buildStatus(client);
    try {
      client.user.setActivity(name, { type: ActivityType.Watching, state });
      console.log(`[статус] ${name} | ${state}`);
    } catch (err) {
      console.error('[статус]', err.message);
    }
  };

  update();
  const timer = setInterval(update, REFRESH_MS);
  timer.unref?.();

  return { update };
}

module.exports = { startPresence, totalMembers, memberLine, buildStatus, NOTE, REFRESH_MS };