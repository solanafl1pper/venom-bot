'use strict';

/**
 * Проверка обработчиков команд без подключения к Discord.
 * Имитирует interactionCreate и считает ответы/ошибки.
 * Запуск: node scripts/test-commands.js
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { EventEmitter } = require('node:events');
const { SlashCommandBuilder } = require('discord.js');

const { Storage } = require('../src/storage');
const { register } = require('../src/commands');

const file = path.join(os.tmpdir(), `sud-cmd-${Date.now()}.json`);
const storage = new Storage(file).load();
const client = new EventEmitter();
register(client, storage);

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

const cmdSud = new SlashCommandBuilder()
  .setName('судимость')
  .setDescription('test')
  .addUserOption((o) => o.setName('участник').setDescription('test'));
const cmdTop = new SlashCommandBuilder().setName('рейтинг').setDescription('test');
const cmdHelp = new SlashCommandBuilder().setName('помощь').setDescription('test');
client.slashCommands = [cmdSud, cmdTop, cmdHelp];

console.log('\nРегистрация команд:');
for (const c of client.slashCommands) {
  const json = c.toJSON();
  check(`/${json.name} валидно`, Boolean(json.name && json.description));
}

const deletedMessages = [];

function serialize(payload) {
  if (!payload || !payload.embeds) return payload;
  return { ...payload, embeds: payload.embeds.map((e) => (e.toJSON ? e.toJSON() : e)) };
}

let messageSeq = 0;
function makeInteraction(commandName, { userId = '10', optionUserId = null } = {}) {
  const state = { deferred: 0, replies: 0, edits: 0, errors: [], payload: null };
  const target = optionUserId
    ? { id: optionUserId, username: 'target' }
    : { id: userId, username: 'author' };

  const interaction = {
    isChatInputCommand: () => true,
    commandName,
    guildId: '1',
    channelId: 'chan-1',
    user: { id: userId, username: 'author' },
    options: {
      getUser: (name) => (name === 'участник' && optionUserId ? target : null),
    },
    get deferred() {
      return state.deferred > 0;
    },
    get replied() {
      return state.replies > 0 || state.edits > 0;
    },
    deferReply: async () => {
      state.deferred += 1;
    },
    reply: async (p) => {
      state.replies += 1;
      state.payload = serialize(p);
    },
    editReply: async (p) => {
      state.edits += 1;
      state.payload = serialize(p);
      messageSeq += 1;
      const id = `bot-${messageSeq}`;
      return {
        id,
        delete: async () => {
          deletedMessages.push(id);
        },
      };
    },
  };

  return { interaction, state };
}

async function run(name, opts) {
  const { interaction, state } = makeInteraction(name, opts);
  client.emit('interactionCreate', interaction);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return state;
}

(async () => {
  console.log('\n/судимость (свой):');
  {
    const st = await run('судимость', { userId: '10' });
    check('ответ отправлен', st.replies + st.edits === 1, `defer=${st.deferred} reply=${st.replies} edit=${st.edits}`);
    check('не было повторного defer', st.deferred === 1, `defer=${st.deferred}`);
    check('embed приложен', Boolean(st.payload?.embeds?.[0]));
    const text = JSON.stringify(st.payload);
    check('есть пинг автора', text.includes('<@10>'));
    check('есть поле рекорда', text.includes('Рекорд'));
    check('есть счётчик судимостей', text.includes('из 15'));
  }

  console.log('\n/судимость (другой участник):');
  {
    const st = await run('судимость', { userId: '20', optionUserId: '99' });
    check('ответ отправлен', st.replies + st.edits === 1, `reply=${st.replies} edit=${st.edits}`);
    check('пингует целевого', JSON.stringify(st.payload).includes('<@99>'));
    check('запись создана для цели', Boolean(storage.getUser('99')));
  }

  console.log('\n/судимость повторно — кулдаун:');
  {
    const rolls = storage.getUser('10').rolls;
    const st = await run('судимость', { userId: '10' });
    check('ответ отправлен', st.replies + st.edits === 1);
    check('показан кулдаун', JSON.stringify(st.payload).includes('Кулдаун'));
    check('новая попытка не засчитана', storage.getUser('10').rolls === rolls, `rolls ${storage.getUser('10').rolls}`);
  }

  console.log('\n/судимость — старое сообщение удаляется:');
  {
    storage.getUser('10').lastRollAt = Date.now() - 16 * 60 * 1000;
    const rolls = storage.getUser('10').rolls;
    const st = await run('судимость', { userId: '10' });
    check('ответ отправлен', st.replies + st.edits === 1);
    check('прошлое сообщение удалено', deletedMessages.length >= 1, `удалено ${deletedMessages.length}`);
    check('новый розыгрыш засчитан', storage.getUser('10').rolls === rolls + 1, `rolls ${storage.getUser('10').rolls}`);
  }

  console.log('\n/рейтинг:');
  {
    const st = await run('рейтинг');
    check('ответ отправлен', st.replies + st.edits === 1, `defer=${st.deferred} reply=${st.replies} edit=${st.edits}`);
    check('defer ровно один', st.deferred === 1, `defer=${st.deferred}`);
    check('embed приложен', Boolean(st.payload?.embeds?.[0]));
    check(
      'заголовок рейтинга',
      st.payload?.embeds?.[0]?.title === '🏆 Топ судимости',
      JSON.stringify(st.payload),
    );
  }

  console.log('\n/помощь:');
  {
    const st = await run('помощь');
    check('ответ отправлен', st.replies + st.edits === 1, `defer=${st.deferred} reply=${st.replies} edit=${st.edits}`);
    check('без defer', st.deferred === 0, `defer=${st.deferred}`);
    check('приватный ответ', st.payload?.ephemeral === true);
  }

  console.log('\nНеизвестная команда:');
  {
    const st = await run('нетакая');
    check('молча проигнорирована', st.replies + st.edits === 0 && st.deferred === 0);
  }

  console.log('\nОшибка внутри обработчика:');
  {
    const saved = storage.top;
    storage.top = () => {
      throw new Error('boom');
    };
    const st = await run('рейтинг');
    check('показан embed с ошибкой', Boolean(st.payload?.embeds?.[0]));
    check(
      'заголовок «Ошибка»',
      st.payload?.embeds?.[0]?.title === 'Ошибка',
      JSON.stringify(st.payload),
    );
    storage.top = saved;
  }

  fs.rmSync(file, { force: true });
  console.log(failures === 0 ? '\nВсе проверки пройдены.\n' : `\nПровалено проверок: ${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();