'use strict';

/**
 * Генерирует инвайт-ссылку для добавления бота на сервер.
 * Запуск: npm run invite [GUILD_ID]
 *
 * Если передан GUILD_ID — бот сразу попадёт на этот сервер в режиме разработчика
 * и команды станут видны сразу, а не в течение часа.
 */

const fs = require('node:fs');
const path = require('node:path');

const CLIENT_ID = process.argv[3] || process.env.DISCORD_CLIENT_ID || readEnvClientId();
const GUILD_ID = process.argv[2] || null;

function readEnvClientId() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return null;
  const match = fs.readFileSync(file, 'utf8').match(/^DISCORD_CLIENT_ID=(.+)$/m);
  return match ? match[1].trim() : null;
}

if (!CLIENT_ID) {
  console.error('Не найден DISCORD_CLIENT_ID. Добавь его в .env или передай аргументом.');
  process.exit(1);
}

// 104324673 = Use Application Commands, 8 = View Channel, 274145026560 = Send/Embed/Attach (старые биты)
const PERMISSIONS = 519232247103;

const params = new URLSearchParams({
  client_id: CLIENT_ID,
  permissions: String(PERMISSIONS),
  scope: 'bot applications.commands',
});

if (GUILD_ID) params.set('guild_id', GUILD_ID);

const url = `https://discord.com/oauth2/authorize?${params}`;

console.log(url);
console.log('\nОткрой ссылку в браузере и добавь бота на сервер.');
if (!GUILD_ID) {
  console.log('Чтобы команды появились сразу на конкретном сервере:');
  console.log(`  npm run invite <ID_СЕРВЕРА>`);
}
console.log('ID сервера включается в Discord: Параметры сервера → Виджет ID.');