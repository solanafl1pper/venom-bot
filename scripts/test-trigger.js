'use strict';

/**
 * Проверка триггеров, вариантов написания и cooldown'а.
 * Запуск: node scripts/test-trigger.js
 */

const {
  matchTrigger,
  normalize,
  pickMessage,
  TRIGGERS,
  VICTORY_MESSAGES,
  SHEEP_MESSAGES,
  SHEEP,
  SHEEP_IMAGE_URL,
  VICTORY_IMAGE_URL,
  COOLDOWN_MS,
} = require('../src/commands/trigger');
const { EventEmitter } = require('node:events');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

function idOf(content) {
  const t = matchTrigger(content);
  return t ? t.id : null;
}

console.log('\nНормализация:');
check('ZOV → зов', normalize('ZOV') === 'зов', normalize('ZOV'));
check('зov → зов', normalize('зov') === 'зов', normalize('зov'));
check('RPP → рпп', normalize('RPP') === 'рпп', normalize('RPP'));
check('PПП → ппп (латинская P = П)', normalize('PПП') === 'ппп', normalize('PПП'));
check('ё → е', normalize('побЁда') === 'победа', normalize('побЁда'));

const GROUPS = [
  {
    label: 'РПП',
    id: 'rpp',
    match: [
      'РПП', 'рпп', 'рПп', 'РПП!', 'Давай РПП уже', 'РПП РПП',
      'р.п.п', 'р п п', 'р  п  п', 'р_п_п', 'р-п-п', 'р/п/п', 'р*п*п',
      'рпп.', '[рпп]', '(рпп)', 'рпп?', 'рпп,', 'рпп!',
      'ррр', 'рррр', 'РРР',
      'RPP', 'RPP!', 'rpп', 'рПП', 'ZOV', 'з о в',
    ],
    no: ['привет', 'алла', 'ааллах', 'пп', 'рр', 'р п'],
  },
  {
    label: '3 слова победы',
    id: 'three',
    match: [
      '3 слова победы', '3 СЛОВА ПОБЕДЫ', '3  слова   победы',
      '3. слова. победы', '3-слова-победы', '3_слова_победы',
      'три слова победы', 'З слова победы', '3слов победы',
      '3 слова победы!', 'давай 3 слова победы',
    ],
    notId: ['победы', 'слова', '3 слова'],
  },
  {
    label: 'победа',
    id: 'victory',
    match: [
      'победа', 'ПОБЕДА', 'Победа', 'победу', 'победы', 'победой', 'победе',
      'победа!', 'победа!!!', 'сегодня победа', 'спортивная победа',
      'фраза: победа.', '[победа]', 'ПОБЕДА РОССИИ',
      'victory', 'VICTORY', 'VICTORY!', 'победа victory',
      'ZOV', 'zov', 'ZOV ZOV ZOV', 'зов', 'ЗОВ', 'з о в', 'з.о.в', 'З-О-В',
    ],
    no: ['победитель', 'победач', 'допобеда', 'привет', 'zovv', 'позов', 'зовут'],
  },
  {
    label: 'аллах',
    id: 'sheep',
    match: [
      'аллах', 'АЛЛАХ', 'Аллах', 'алах', 'АЛАХ', 'Алах', 'алаха', 'алаху',
      'аллаха', 'аллаху', 'аллахом', 'аллахе', 'аллахи', 'Аллахи',
      'алахом', 'Аллах Акбар', 'аллаху акбар', 'акбар', 'АКБАР', 'акабар',
      'аллаха.', 'позови аллаха', '@аллах', '#аллах',
    ],
    no: ['привет', 'алла', 'ааллах', 'алмаз', 'алкоголь', 'малахи', 'аллахий', 'палах', 'ллах', 'ЛЛАХ', 'ллаха'],
  },
];

for (const g of GROUPS) {
  console.log(`\n${g.label}:`);
  let hits = 0;
  for (const text of g.match) {
    const got = idOf(text);
    if (got) hits += 1;
    check(`совпадение: ${JSON.stringify(text)}`, got !== null, `→ ${got}`);
  }
  for (const text of g.no || []) {
    check(`пропуск: ${JSON.stringify(text)}`, idOf(text) === null, `→ ${idOf(text)}`);
  }
  for (const text of g.notId || []) {
    check(`не ${g.label}: ${JSON.stringify(text)}`, idOf(text) !== g.id, `→ ${idOf(text)}`);
  }
  check(`${g.label}: все варианты пойманы`, hits === g.match.length, `${hits}/${g.match.length}`);
}

console.log('\nКанонические формы дают правильный триггер:');
const CANONICAL = [
  ['РПП', 'rpp'],
  ['р.п.п', 'rpp'],
  ['ррр', 'rpp'],
  ['RPP', 'rpp'],
  ['3 слова победы', 'three'],
  ['3 слова победы!', 'three'],
  ['3слов победы', 'three'],
  ['3. слова. победы', 'three'],
  ['З слова победы', 'three'],
  ['победа', 'victory'],
  ['победу', 'victory'],
  ['ПОБЕДЫ', 'victory'],
  ['victory', 'victory'],
  ['ZOV', 'victory'],
  ['аллах', 'sheep'],
  ['алах', 'sheep'],
  ['АЛАХ', 'sheep'],
  ['аллаха', 'sheep'],
  ['Аллах Акбар', 'sheep'],
  ['акбар', 'sheep'],
];
for (const [text, expected] of CANONICAL) {
  check(`${JSON.stringify(text)} → ${expected}`, idOf(text) === expected, `получено ${idOf(text)}`);
}

console.log('\nТексты ответов:');
check('фраз победы 15+', VICTORY_MESSAGES.length >= 15, `штук ${VICTORY_MESSAGES.length}`);
check('нет дубликатов (победа)', new Set(VICTORY_MESSAGES).size === VICTORY_MESSAGES.length);
check('везде есть ZOV', VICTORY_MESSAGES.every((m) => m.includes('ZOV')));
check('фраз про стадо 4+', SHEEP_MESSAGES.length >= 4, `штук ${SHEEP_MESSAGES.length}`);
check('везде есть бараны', SHEEP_MESSAGES.every((m) => m.includes('🐏')));
check('нет оскорблений в стаде', SHEEP_MESSAGES.every((m) => !/пидр|хуй|ебан|сука/i.test(m)));
check('нет оскорблений в победе', VICTORY_MESSAGES.every((m) => !/пидр|хуй|ебан|сука/i.test(m)));
check('нет иероглифов', [...VICTORY_MESSAGES, ...SHEEP_MESSAGES].every((m) => !/[　-鿿＀-￯]/.test(m)));
check('нет пустых', [...VICTORY_MESSAGES, ...SHEEP_MESSAGES].every((m) => m.trim().length > 0));

const victoryCounts = new Set();
for (let i = 0; i < 20000; i += 1) victoryCounts.add(pickMessage(VICTORY_MESSAGES));
check('все фразы победы достижимы', victoryCounts.size === VICTORY_MESSAGES.length);

const sheepCounts = new Set();
for (let i = 0; i < 20000; i += 1) sheepCounts.add(pickMessage(SHEEP_MESSAGES));
check('все фразы стада достижимы', sheepCounts.size === SHEEP_MESSAGES.length);

console.log('\nСтруктура триггеров:');
check('4 триггера', TRIGGERS.length === 4, `штук ${TRIGGERS.length}`);
for (const t of TRIGGERS) {
  check(`${t.label}: есть пул фраз`, Array.isArray(t.messages) && t.messages.length > 0);
  check(`${t.label}: есть заголовок`, typeof t.title === 'string' && t.title.length > 0);
  check(`${t.label}: есть цвет`, typeof t.color === 'number');
}
check('аллах отвечает баранами', TRIGGERS.find((t) => t.id === 'sheep').messages === SHEEP_MESSAGES);
check('остальные отвечают ZOV', TRIGGERS.filter((t) => t.id !== 'sheep').every((t) => t.messages === VICTORY_MESSAGES));

console.log('\nБез картинки бот всё равно отвечает:');
{
  const t = require('../src/commands/trigger.js');
  check('ссылка на картинку есть', typeof t.SHEEP_IMAGE_URL === 'string' && t.SHEEP_IMAGE_URL.startsWith('https://'), t.SHEEP_IMAGE_URL);

  const withoutImage = { ...t.TRIGGERS.find((x) => x.id === 'sheep'), image: null };
  const built = t.buildEmbed(withoutImage, 'тест', '<@1>');
  const target = built.container || built.embed;
  check('embed собирается без картинки', Boolean(target));
  const withoutImgJson = target.toJSON();
  check('embed без ссылки на файл', !withoutImgJson.components?.some((c) => c.type === 12));
  check('текст на месте', JSON.stringify(withoutImgJson).includes('тест'));
}

console.log('\nCooldown и обработчик событий:');
check('интервал 1.2 секунды', COOLDOWN_MS === 1_200, String(COOLDOWN_MS));

function makeClient() {
  const client = new EventEmitter();
  const sent = [];
  const channel = {
    messages: { cache: new Map() },
    send: async (p) => {
      const payload = { ...p };
      if (p.embeds) payload.embeds = p.embeds.map((e) => (e.toJSON ? e.toJSON() : e));
      if (p.components) payload.components = p.components.map((c) => (c.toJSON ? c.toJSON() : c));
      sent.push(payload);
      return { ...payload, delete: async () => {} };
    },
  };
  client.channels = { cache: new Map([['c1', channel]]) };
  return { client, sent, channel };
}

function makeMessage(content, authorId = '5', bot = false, channel = null) {
  return { content, author: { id: authorId, bot }, channelId: 'c1', channel };
}

(async () => {
  const { register } = require('../src/commands/trigger');
  const { client, sent, channel } = makeClient();
  register(client);

  client.emit('messageCreate', makeMessage('привет', '5', false, channel));
  await new Promise((r) => setImmediate(r));
  check('обычное сообщение игнорируется', sent.length === 0);

  client.emit('messageCreate', makeMessage('р.п.п', '5', false, channel));
  await new Promise((r) => setImmediate(r));
  check('ответ на «р.п.п»', sent.length === 1, `отправлено ${sent.length}`);
  check('подпись РПП', JSON.stringify(sent[0]).includes('РПП'), JSON.stringify(sent[0]));
  check('пинг автора', JSON.stringify(sent[0]).includes('<@5>'));

  client.emit('messageCreate', makeMessage('ЗОВ', '5', false, channel));
  await new Promise((r) => setImmediate(r));
  check('cooldown блокирует повтор', sent.length === 1, `отправлено ${sent.length}`);

  client.emit('messageCreate', makeMessage('3 слова победы', '6', false, channel));
  await new Promise((r) => setImmediate(r));
  check('«3 слова победы» отдельной подписью', JSON.stringify(sent[1]).includes('3 слова победы'));
  check('другой автор проходит', sent.length === 2, `отправлено ${sent.length}`);

  client.emit('messageCreate', makeMessage('RPP', '7', false, channel));
  await new Promise((r) => setImmediate(r));
  check('латинское RPP поймано', sent.length === 3, `отправлено ${sent.length}`);

  client.emit('messageCreate', makeMessage('Аллах Акбар', '8', false, channel));
  await new Promise((r) => setImmediate(r));
  check('«Аллах Акбар» → бараны', JSON.stringify(sent[3]).includes('🐏'));
  check('в ответе бараны', JSON.stringify(sent[3]).includes('🐏'));
  check('аллах не выдал ZOV-заголовок', !JSON.stringify(sent[3]).includes('ПУТИН'));
  check('аллах не выдал оскорблений', !/пидр/i.test(JSON.stringify(sent[3])));

  check(
    'embed ссылается на гифку по URL',
    JSON.stringify(sent[3]).includes(SHEEP_IMAGE_URL),
    JSON.stringify(sent[3]),
  );
  check('вложения не шлются', !Array.isArray(sent[3]?.files) || sent[3].files.length === 0);

  check('embed РПП содержит картинку', JSON.stringify(sent[0]).includes(VICTORY_IMAGE_URL));

  client.emit('messageCreate', makeMessage('победа', '9', false, channel));
  await new Promise((r) => setImmediate(r));
  check('«победа» отдельным триггером', JSON.stringify(sent[4]).includes('победа'));
  check('у победы есть своя гифка', JSON.stringify(sent[4]).includes(VICTORY_IMAGE_URL));

  client.emit('messageCreate', makeMessage('3 слова победы', '9', true, channel));
  await new Promise((r) => setImmediate(r));
  check('сообщения ботов игнорируются', sent.length === 5, `отправлено ${sent.length}`);

  check('ответы хранятся в кэше', channel.messages.cache.size === 5);

  console.log(failures === 0 ? '\nВсе проверки пройдены.\n' : `\nПровалено проверок: ${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();