'use strict';

/**
 * Проверка токена и данных приложения через Discord API.
 * Запуск: node scripts/check-token.js
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return out;
}

function api(pathname, token) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: 'discord.com', path: pathname, headers: { Authorization: `Bot ${token}` } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', (err) => resolve({ status: 0, body: err.message }));
    req.end();
  });
}

async function main() {
  const env = loadEnv();
  const token = env.DISCORD_TOKEN;
  const clientId = env.DISCORD_CLIENT_ID;

  if (!token) {
    console.error('Нет DISCORD_TOKEN в .env');
    process.exit(1);
  }

  console.log('Проверяю токен...');
  const me = await api('/api/v10/users/@me', token);
  console.log('HTTP', me.status);

  if (me.status !== 200) {
    console.error('Токен не принят:', me.body.slice(0, 300));
    process.exit(1);
  }

  const bot = JSON.parse(me.body);
  console.log(`Бот: ${bot.username}#${bot.discriminator ?? '0'} (${bot.id})`);
  console.log(`Бот требует OAuth2-подтверждения: ${bot.mfa_required}`);

  const app = await api(`/api/v10/applications/${bot.id}`, token);
  console.log('Данные приложения — HTTP', app.status);
  if (app.status === 200) {
    const a = JSON.parse(app.body);
    console.log(`Имя приложения: ${a.name}`);
    console.log(`Совпадает ли client_id: ${a.id === clientId ? 'да' : `нет (в .env указано ${clientId})`}`);
  }

  const cmds = await api(`/api/v10/applications/${bot.id}/commands`, token);
console.log('Зарегистрированные команды — HTTP', cmds.status);
if (cmds.status === 200) {
    const list = JSON.parse(cmds.body);
    console.log(`Всего: ${list.length}`);
    for (const c of list) console.log(`  /${c.name} — ${c.description}`);
  }

  // Команды по серверам: они применяются мгновенно, в отличие от глобальных.
  const guilds = await api(`/api/v10/users/@me/guilds`, token);
  if (guilds.status === 200) {
    const list = JSON.parse(guilds.body);
    console.log(`\nСерверов с ботом: ${list.length}`);
    for (const g of list) {
      console.log(`  ${g.name} (${g.id})`);
      const gc = await api(`/api/v10/applications/${bot.id}/guilds/${g.id}/commands`, token);
      if (gc.status === 200) {
        const names = JSON.parse(gc.body).map((c) => `/${c.name}`);
        console.log(`    команд: ${names.length} — ${names.join(' ')}`);
      } else {
        console.log(`    команд: не удалось получить (HTTP ${gc.status})`);
      }
    }
  }
}

main();