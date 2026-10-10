'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');

const { Storage } = require('./src/storage');
const { register } = require('./src/commands');
const { startPresence } = require('./src/presence');
const { VoiceTracker } = require('./src/voice');
const trigger = require('./src/commands/trigger');

function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function registerInGuild(client, guildId) {
  await client.application.commands.set(client.slashCommands, guildId);
}

/** Регистрация команд в каждом сервере + очистка глобальных. */
async function syncGuildCommands(client, clearGlobal = false) {
  if (clearGlobal) {
    // Убираем прежние глобальные команды, иначе они будут дублироваться.
    await client.application.commands.set([]);
    console.log('[бот] Глобальные команды очищены');
  }

  for (const guild of client.guilds.cache.values()) {
    try {
      await registerInGuild(client, guild.id);
      console.log(`[бот] Команды в сервере: ${guild.name} (${guild.id})`);
    } catch (err) {
      console.error(`[бот] Не удалось зарегистрировать команды в ${guild.name}:`, err.message);
    }
  }
}

async function main() {
  loadEnv();

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('Не найден DISCORD_TOKEN. Скопируй .env.example в .env и укажи токен бота.');
    process.exit(1);
  }

  const storage = new Storage(path.join(__dirname, 'data', 'sud.json')).load();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  const voiceTracker = new VoiceTracker(storage);
  voiceTracker.start(client);

  register(client, storage, voiceTracker);
  trigger.register(client, storage);

  if (trigger.SHEEP_IMAGE_URL) {
    console.log(`[картинка] триггер «аллах»: ${trigger.SHEEP_IMAGE_URL}`);
  }

  client.once('clientReady', async () => {
    console.log(`[бот] ${client.user.tag} запущен`);
    console.log('>>> [СЕКРЕТНЫЙ ЧЕК ДЛЯ ХОЗЯИНА]: Связь с хостингом 10/10! Бот слушает тебя и готов к работе. 🚀👑 <<<');

    // Регистрируем команды только в серверах. Глобальные Discord раскатывает
    // по клиентам до часа, а если зарегистрировать и там, и тут — команды
    // дублируются в списке подсказок.
    await syncGuildCommands(client, true);

    setInterval(() => storage.flush(), 30_000).unref();

    const presence = startPresence(client);
    for (const event of ['guildCreate', 'guildDelete', 'guildMemberAdd', 'guildMemberRemove']) {
      client.on(event, () => presence.update());
    }

    // Новый сервер — сразу зарегистрируем там команды.
    client.on('guildCreate', (guild) => {
      registerInGuild(client, guild.id).catch((err) =>
        console.error(`[бот] Не удалось зарегистрировать команды в ${guild.name}:`, err.message),
      );
    });
  });

  client.on('error', (err) => console.error('[discord]', err));
  client.on('shardError', (err) => console.error('[shard]', err));

  await client.login(token);
}

main().catch((err) => {
  console.error('Фатальная ошибка:', err);
  process.exit(1);
});