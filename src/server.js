'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const duelRooms = new Map();
const snakeDuelRooms = new Map();

function createServer(storage, client) {
  const publicDir = path.join(__dirname, '..', 'public');

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (
      pathname !== '/api/duel/sync' &&
      pathname !== '/api/duel/state' &&
      pathname !== '/api/snake/sync' &&
      pathname !== '/health'
    ) {
      console.log(`[веб] ${req.method} ${pathname}`);
    }

    // 1. Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }

    // 1.5 API: Identify user from recent command launch, active voice, or fallback
    if (pathname === '/api/identify' && req.method === 'GET') {
      const channelId = url.searchParams.get('channelId');
      const meta = storage?.data?.meta;
      let user = null;

      if (channelId && meta?.channelLaunches?.[channelId]) {
        user = meta.channelLaunches[channelId];
      } else if (meta?.lastLaunch && Date.now() - meta.lastLaunch.at < 2 * 60 * 60 * 1000) {
        user = meta.lastLaunch;
      }

      let channelMembers = [];
      if (client?.channels?.cache) {
        let channel = channelId ? client.channels.cache.get(channelId) : null;
        if (!channel) {
          channel = client.channels.cache.find((c) => c.isVoiceBased() && c.members && c.members.size > 0);
        }
        if (channel?.members) {
          channelMembers = Array.from(channel.members.values())
            .filter((m) => !m.user?.bot)
            .map((m) => ({
              userId: m.user.id,
              username: m.displayName || m.user.globalName || m.user.username,
              avatar: typeof m.user.displayAvatarURL === 'function'
                ? m.user.displayAvatarURL({ extension: 'png', size: 128 })
                : null,
            }));
        }
      }

      // Если лаунчер не зафиксирован — берём первого участника войса или создателя бота
      if (!user) {
        if (channelMembers.length > 0) {
          user = channelMembers[0];
        } else {
          const creatorId = '566547457568276494';
          let discordUser = client?.users?.cache?.get(creatorId);
          if (!discordUser && client?.users) {
            try {
              discordUser = await client.users.fetch(creatorId);
            } catch {}
          }
          user = {
            userId: creatorId,
            username: discordUser?.globalName || discordUser?.username || 'baal worship',
            avatar: discordUser && typeof discordUser.displayAvatarURL === 'function'
              ? discordUser.displayAvatarURL({ extension: 'png', size: 256 })
              : 'https://cdn.discordapp.com/avatars/566547457568276494/1506363121c6ce8e148c9ccd26cb9639.png?size=256',
          };
        }
      }

      let inviteUrl = null;
      if (channelId && meta?.channelLaunches?.[channelId]?.inviteUrl) {
        inviteUrl = meta.channelLaunches[channelId].inviteUrl;
      } else if (meta?.lastLaunch?.inviteUrl) {
        inviteUrl = meta.lastLaunch.inviteUrl;
      }

      const best2048 = user?.userId && storage ? storage.bestScore('2048', user.userId) : 0;
      const bestSnake = user?.userId && storage ? storage.bestScore('snake', user.userId) : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          user,
          bestScore: best2048,
          best2048,
          bestSnake,
          channelMembers,
          inviteUrl,
        })
      );
      return;
    }

    // 1.7 API: Get sendable text channels for inviting (filtered to user's active voice guild)
    if (pathname === '/api/channels' && req.method === 'GET') {
      const channels = [];
      const queryChannelId = url.searchParams.get('channelId');
      const queryUserId = url.searchParams.get('userId');
      const targetUserId = queryUserId || storage?.data?.meta?.lastLaunch?.userId || '566547457568276494';

      let activeGuild = null;

      // 1. If voice channel ID is provided, look up its guild directly
      if (queryChannelId && queryChannelId !== 'default_room' && client?.channels?.cache) {
        const ch = client.channels.cache.get(queryChannelId);
        if (ch?.guild) {
          activeGuild = ch.guild;
        }
      }

      // 2. Check if voice session tracker has the user's active session
      if (!activeGuild && targetUserId && client?.voiceTracker?.activeSessions) {
        const session = client.voiceTracker.activeSessions.get(targetUserId);
        if (session) {
          if (session.guildId && client.guilds?.cache) {
            activeGuild = client.guilds.cache.get(session.guildId);
          } else if (session.channelId && client.channels?.cache) {
            activeGuild = client.channels.cache.get(session.channelId)?.guild;
          }
        }
      }

      // 3. Search guilds for where targetUserId is currently in a voice channel
      if (!activeGuild && targetUserId && client?.guilds?.cache) {
        for (const guild of client.guilds.cache.values()) {
          const vs = guild.voiceStates?.cache?.get(targetUserId);
          if (vs?.channelId) {
            activeGuild = guild;
            break;
          }
          const inVoice = guild.channels?.cache?.some(
            (c) => c.isVoiceBased?.() && c.members?.has?.(targetUserId)
          );
          if (inVoice) {
            activeGuild = guild;
            break;
          }
        }
      }

      // 4. Fallback: check storage metadata
      if (!activeGuild && storage?.data?.meta) {
        if (queryChannelId && storage.data.meta.channelLaunches?.[queryChannelId]) {
          const ch = client?.channels?.cache?.get(queryChannelId);
          if (ch?.guild) activeGuild = ch.guild;
        }
        if (!activeGuild && storage.data.meta.lastLaunch?.guildId && client?.guilds?.cache) {
          activeGuild = client.guilds.cache.get(storage.data.meta.lastLaunch.guildId);
        }
      }

      // If activeGuild is resolved, ONLY return channels from that active guild!
      const targetGuilds = activeGuild
        ? [activeGuild]
        : (client?.guilds?.cache ? Array.from(client.guilds.cache.values()) : []);

      for (const guild of targetGuilds) {
        for (const ch of guild.channels.cache.values()) {
          if (
            ch.isTextBased() &&
            !ch.isThread() &&
            ch.permissionsFor(client.user.id)?.has('SendMessages')
          ) {
            channels.push({
              id: ch.id,
              name: ch.name,
              guildName: guild.name,
            });
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, channels, activeGuild: activeGuild?.name || null }));
      return;
    }

    // 1.8 API: Send invitation directly to server chat via bot
    if (pathname === '/api/send-invite' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { channelId, username, game, roomId: clientRoomId, userId: clientUserId } = JSON.parse(body || '{}');
          let sent = false;
          let inviteUrl = null;
          const isSnake = game === 'snake' || game === 'змейка';
          const gameTitle = isSnake ? 'Змейку 🐍' : '2048 🔢';
          const accentColor = isSnake ? 0x10b981 : 0xedc22e;

          if (client) {
            let targetTextChannel = null;

            if (channelId) {
              const ch = client.channels.cache.get(channelId);
              if (
                ch &&
                ch.isTextBased() &&
                ch.permissionsFor(client.user.id)?.has('SendMessages')
              ) {
                targetTextChannel = ch;
              }
            }

            // Find voice channel to create or reuse invite
            let voiceChannel = null;
            if (clientRoomId && client.channels.cache.has(clientRoomId)) {
              const vc = client.channels.cache.get(clientRoomId);
              if (vc?.isVoiceBased?.()) voiceChannel = vc;
            }

            const targetUserId = clientUserId || storage?.data?.meta?.lastLaunch?.userId || '566547457568276494';
            if (!voiceChannel && targetUserId) {
              const session = client.voiceTracker?.activeSessions?.get(targetUserId);
              if (session?.channelId && client.channels.cache.has(session.channelId)) {
                voiceChannel = client.channels.cache.get(session.channelId);
              }
            }

            if (!voiceChannel && targetUserId && client.guilds?.cache) {
              for (const g of client.guilds.cache.values()) {
                const vs = g.voiceStates?.cache?.get(targetUserId);
                if (vs?.channelId && client.channels.cache.has(vs.channelId)) {
                  voiceChannel = client.channels.cache.get(vs.channelId);
                  break;
                }
              }
            }

            if (!voiceChannel && storage?.data?.meta?.lastLaunch?.inviteUrl) {
              inviteUrl = storage.data.meta.lastLaunch.inviteUrl;
            }

            if (voiceChannel && typeof voiceChannel.createInvite === 'function' && !inviteUrl) {
              try {
                const invite = await voiceChannel.createInvite({
                  targetType: 2,
                  targetApplication: client.user.id,
                  maxAge: 86400,
                  maxUses: 0,
                });
                inviteUrl = invite.url;
              } catch {
                try {
                  const fallbackInvite = await voiceChannel.createInvite({
                    maxAge: 86400,
                    maxUses: 0,
                  });
                  inviteUrl = fallbackInvite.url;
                } catch {}
              }
            }

            if (!targetTextChannel && voiceChannel?.guild) {
              targetTextChannel = voiceChannel.guild.channels.cache.find(
                (c) =>
                  c.isTextBased() &&
                  !c.isThread() &&
                  c.permissionsFor(client.user.id)?.has('SendMessages')
              );
            }

            if (!targetTextChannel) {
              for (const guild of client.guilds.cache.values()) {
                const tc = guild.channels.cache.find(
                  (c) =>
                    c.isTextBased() &&
                    !c.isThread() &&
                    c.permissionsFor(client.user.id)?.has('SendMessages')
                );
                if (tc) {
                  targetTextChannel = tc;
                  break;
                }
              }
            }

            if (targetTextChannel) {
              try {
                const container = new ContainerBuilder().setAccentColor(accentColor);
                const desc = isSnake
                  ? `⚔️ **${username || 'Игрок'}** вызывает всех на битву в **Змейку (Дуэль на одной карте)**!\nЗаходи и покажи свой скилл!`
                  : `⚔️ **${username || 'Игрок'}** вызывает всех в **2048 (Дуэль)**!\nКто наберёт больше очков?`;

                container.addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    `### ⚔️ Приглашение в ${gameTitle}\n${desc}${inviteUrl ? `\n\n👉 **Инвайт:** ${inviteUrl}` : ''}`
                  )
                );

                if (inviteUrl) {
                  const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Link)
                      .setLabel(isSnake ? '🐍 Зайти в Змейку' : '🎮 Зайти в 2048')
                      .setURL(inviteUrl)
                  );
                  container.addActionRowComponents(row);
                }

                await targetTextChannel.send({
                  components: [container],
                  flags: MessageFlags.IsComponentsV2,
                });
                sent = true;
              } catch {
                const link = inviteUrl || 'жми команду в чате';
                await targetTextChannel.send(
                  `⚔️ **${username || 'Игрок'}** зовёт всех в **${gameTitle} (Дуэль)**!\n👉 Залетайте в игру: ${link}`
                );
                sent = true;
              }
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, sent, inviteUrl }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 2. API: Token exchange
    if (pathname === '/api/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { code } = JSON.parse(body || '{}');
          const clientId = process.env.DISCORD_CLIENT_ID;
          const clientSecret = process.env.DISCORD_CLIENT_SECRET;

          if (!clientSecret) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'DISCORD_CLIENT_SECRET not configured' }));
            return;
          }

          const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
          });

          const response = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
          });

          const data = await response.json();
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 3. API: Get score
    if (pathname === '/api/score' && req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      const gameParam = url.searchParams.get('game') || '2048';
      const best = userId && storage ? storage.bestScore(gameParam, userId) : 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ best, game: gameParam }));
      return;
    }

    // 4. API: Save score
    if (pathname === '/api/score' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          let { userId, score, username, channelId, game } = JSON.parse(body || '{}');
          const gameKey = game === 'snake' ? 'snake' : '2048';

          // Автоматическая привязка к Discord ID лаунчера, если ID гостевой
          if ((!userId || userId.startsWith('guest_')) && storage) {
            const meta = storage.data?.meta;
            if (channelId && meta?.channelLaunches?.[channelId]) {
              userId = meta.channelLaunches[channelId].userId;
              username = meta.channelLaunches[channelId].username;
            } else if (meta?.lastLaunch && Date.now() - meta.lastLaunch.at < 2 * 60 * 60 * 1000) {
              userId = meta.lastLaunch.userId;
              username = meta.lastLaunch.username;
            } else {
              userId = '566547457568276494';
              username = username || 'baal worship';
            }
          }

          if (userId && typeof score === 'number' && storage) {
            storage.setBestScore(gameKey, userId, score);
            if (username) storage.ensureUser(userId, { username });
            console.log(`[рекорд ${gameKey}] Сохранён рекорд ${score} очков для ${username || userId} (${userId})`);
          }
          const best = userId && storage ? storage.bestScore(gameKey, userId) : score;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, best, userId, game: gameKey }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 5. API: Duel sync (multiplayer live scores)
    if (pathname === '/api/duel/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const {
            roomId = 'main',
            userId,
            username,
            avatar,
            score = 0,
            maxTile = 2,
            grid = null,
            moves = 0,
            isGameOver = false,
          } = JSON.parse(body || '{}');

          if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'userId required' }));
            return;
          }

          if (!duelRooms.has(roomId)) {
            duelRooms.set(roomId, { players: new Map(), roundId: 1 });
          }
          const roomObj = duelRooms.get(roomId);
          const room = roomObj.players;
          const now = Date.now();

          // Очистка старых участников (> 90 сек неактивны)
          for (const [uid, p] of room.entries()) {
            if (now - p.lastSeen > 90_000 && uid !== userId) room.delete(uid);
          }

          room.set(userId, {
            userId,
            username: username || 'Игрок',
            avatar: avatar || null,
            score,
            maxTile,
            grid: grid || null,
            moves,
            isGameOver,
            lastSeen: now,
          });

          const players = Array.from(room.values());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, roundId: roomObj.roundId, players }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 6. API: Duel state
    if (pathname === '/api/duel/state' && req.method === 'GET') {
      const roomId = url.searchParams.get('roomId') || 'main';
      const roomObj = duelRooms.get(roomId);
      const players = roomObj ? Array.from(roomObj.players.values()) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ roundId: roomObj?.roundId || 1, players }));
      return;
    }

    // 7. API: Duel reset (новые раунды)
    if (pathname === '/api/duel/reset' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const { roomId = 'main' } = JSON.parse(body || '{}');
        const roomObj = duelRooms.get(roomId);
        if (roomObj) {
          roomObj.roundId = (roomObj.roundId || 1) + 1;
          for (const p of roomObj.players.values()) {
            p.score = 0;
            p.maxTile = 2;
            p.grid = null;
            p.moves = 0;
            p.isGameOver = false;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, roundId: roomObj?.roundId || 1 }));
      });
      return;
    }

    // 8. API: Snake duel sync (shared map multiplayer)
    if (pathname === '/api/snake/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const {
            roomId = 'main',
            userId,
            username,
            avatar,
            snake,
            dir,
            score = 0,
            isAlive = true,
          } = JSON.parse(body || '{}');

          if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'userId required' }));
            return;
          }

          if (!snakeDuelRooms.has(roomId)) {
            snakeDuelRooms.set(roomId, {
              roundId: 1,
              players: new Map(),
              apples: [
                { x: 10, y: 10 },
                { x: 5, y: 15 },
                { x: 15, y: 5 },
              ],
            });
          }

          const roomObj = snakeDuelRooms.get(roomId);
          const room = roomObj.players;
          const now = Date.now();

          // Очистка неактивных игроков (> 60 сек)
          for (const [uid, p] of room.entries()) {
            if (now - p.lastSeen > 60_000 && uid !== userId) room.delete(uid);
          }

          room.set(userId, {
            userId,
            username: username || 'Игрок',
            avatar: avatar || null,
            snake: snake || [],
            dir: dir || 'right',
            score,
            isAlive: Boolean(isAlive),
            lastSeen: now,
          });

          const players = Array.from(room.values());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: true,
              roundId: roomObj.roundId,
              players,
              apples: roomObj.apples,
            })
          );
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 9. API: Snake apple eaten
    if (pathname === '/api/snake/eat' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const { roomId = 'main', appleIndex } = JSON.parse(body || '{}');
          const roomObj = snakeDuelRooms.get(roomId);
          if (roomObj && Array.isArray(roomObj.apples)) {
            const newApple = {
              x: Math.floor(Math.random() * 18) + 1,
              y: Math.floor(Math.random() * 18) + 1,
            };
            if (typeof appleIndex === 'number' && roomObj.apples[appleIndex]) {
              roomObj.apples[appleIndex] = newApple;
            } else {
              roomObj.apples.push(newApple);
              if (roomObj.apples.length > 3) roomObj.apples.shift();
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, apples: roomObj?.apples || [] }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 10. API: Snake duel reset
    if (pathname === '/api/snake/reset' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const { roomId = 'main' } = JSON.parse(body || '{}');
        const roomObj = snakeDuelRooms.get(roomId);
        if (roomObj) {
          roomObj.roundId = (roomObj.roundId || 1) + 1;
          roomObj.players.clear();
          roomObj.apples = [
            { x: 10, y: 10 },
            { x: 5, y: 15 },
            { x: 15, y: 5 },
          ];
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, roundId: roomObj?.roundId || 1 }));
      });
      return;
    }

    // 5. Static files
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  });

  return server;
}

function startServer(storage, client) {
  console.log(`[веб-сервер] env: SERVER_PORT=${process.env.SERVER_PORT}, PORT=${process.env.PORT}`);

  const candidatePorts = [
    Number(process.env.SERVER_PORT) || null,
    Number(process.env.PORT) || null,
    8080,
    3000,
    5000,
  ].filter((p, i, arr) => p && arr.indexOf(p) === i);

  const servers = [];

  for (const port of candidatePorts) {
    try {
      const server = createServer(storage, client);
      server.on('error', (err) => {
        console.log(`[веб-сервер] Ошибка на порту ${port}: ${err.message}`);
      });
      server.listen(port, '0.0.0.0', () => {
        console.log(`[веб-сервер] 2048 Activity слушает 0.0.0.0:${port}`);
      });
      servers.push(server);
    } catch (err) {
      console.log(`[веб-сервер] Исключение на порту ${port}: ${err.message}`);
    }
  }

  return servers[0];
}

module.exports = { createServer, startServer };
