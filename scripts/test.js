'use strict';

/**
 * Проверка логики и embed'ов без подключения к Discord.
 * Запуск: node scripts/test.js
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { rollNew, rollCount, totalPoints, sentenceFromPoints, rating, ratingFor, recordSample, plural, MAX_ARTICLES, COOLDOWN_MS } = require('../src/engine');
const { Storage, COOLDOWN_MS: STORAGE_COOLDOWN_MS, msUntilNextRoll, isDue } = require('../src/storage');
const { ARTICLES, pickArticles } = require('../src/data/articles');
const { buildSudEmbed, buildCooldownEmbed, buildTopEmbed, buildHelpEmbed } = require('../src/commands/embeds');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

console.log(`\nСтатьи УК РФ в базе: ${ARTICLES.length}\n`);

console.log('Распределение розыгрыша (100k прогонов):');
const tierHits = {};
const articleHits = new Set();
let totalArticles = 0;
let minCount = Infinity;
let maxCount = 0;
for (let i = 0; i < 100000; i += 1) {
  const count = rollCount();
  minCount = Math.min(minCount, count);
  maxCount = Math.max(maxCount, count);
  const picked = pickArticles(count, Math.random);
  totalArticles += picked.length;
  for (const a of picked) {
    tierHits[a.tier] = (tierHits[a.tier] || 0) + 1;
    articleHits.add(a.article);
  }
}
console.log(' ', tierHits);
console.log(
  `  статей за прогон: ${(totalArticles / 100000).toFixed(2)}, уникальных номеров выпало: ${articleHits.size}/${ARTICLES.length}`,
);
check('все статьи достижимы', articleHits.size === ARTICLES.length);
check('минимум 1 статья', minCount === 1, `min ${minCount}`);
check('максимум 15 статей', maxCount === MAX_ARTICLES, `max ${maxCount}`);

console.log('\nСвежий розыгрыш: 30 вызовов (набор полностью заменяется):');
const file = path.join(os.tmpdir(), `sud-test-${Date.now()}.json`);
const storage = new Storage(file).load();
storage.ensureUser('1', { username: 'tester' });

let now = Date.now();
let records = 0;
let prevBest = 0;
for (let call = 1; call <= 30; call += 1) {
  const user = storage.getUser('1');
  const res = rollNew(user, Math.random, now);
  check(`вызов ${call}: 1..15 статей`, res.count >= 1 && res.count <= MAX_ARTICLES, `статей ${res.count}`);
  check(`вызов ${call}: нет повторов`, new Set(res.record.map((a) => a.article)).size === res.record.length);
  check(`вызов ${call}: набор заменён`, user.current === res.record);
  const expectedRecord = res.count > prevBest;
  check(`вызов ${call}: флаг рекорда`, res.isRecord === expectedRecord, `isRecord=${res.isRecord}`);
  if (res.isRecord) {
    records += 1;
    prevBest = res.count;
    check(`вызов ${call}: рекорд обновлён`, user.bestCount === res.count, `best ${user.bestCount}`);
  }
  now += COOLDOWN_MS + 1000;
}
check('счётчик вызовов', storage.getUser('1').rolls === 30, `вызовов ${storage.getUser('1').rolls}`);
check('были рекорды', records >= 1, `рекордов ${records}`);
check('рекорд = макс. выпавшее', storage.getUser('1').bestCount === prevBest);

const user = storage.getUser('1');
check('история ограничена 20', user.history.length <= 20);

console.log('\nКулдаун 15 минут:');
{
  const u = storage.ensureUser('2', { username: 'cooldown' });
  const t0 = Date.now();
  rollNew(u, Math.random, t0);
  check('сразу после попытки — не готов', isDue(u, t0 + 1000) === false);
  check('осталось почти 15 минут', msUntilNextRoll(u, t0 + 1000) === COOLDOWN_MS - 1000, `rest ${msUntilNextRoll(u, t0 + 1000)}`);
  check('через 15 минут — готов', isDue(u, t0 + COOLDOWN_MS) === true);
  check('после кулдауна нет ожидания', msUntilNextRoll(u, t0 + COOLDOWN_MS + 1) === 0);
  check('дефолт кулдауна 15 мин', STORAGE_COOLDOWN_MS === COOLDOWN_MS && COOLDOWN_MS === 15 * 60 * 1000);
  // Второй розыгрыш внутри кулдауна всё равно меняет набор, если вызван напрямую.
  const before = u.current.length;
  const res = rollNew(u, () => 0, t0 + 2000);
  check('rollNew(0) даёт ровно 1 статью', res.count === 1, `count ${res.count}`);
  check('набор перезаписан', u.current.length === 1, `было ${before}`);
}

console.log('\nРейтинг: лучший результат за 3 дня:');
{
  const empty = [];
  const one = [{ points: 2 }];
  const many = [{ points: 1 }, { points: 1 }, { points: 1 }];
  check('пустая судимость — 0', rating(empty) === 0);
  check('жёсткость + количество', rating(many) > rating(one), `${rating(many)} vs ${rating(one)}`);
  check('рейтинг растёт от очков', rating([{ points: 8 }]) > rating([{ points: 1 }]));
  check('рейтинг растёт от числа статей', rating(many) > rating(one));

  const u = storage.ensureUser('3', { username: 'window' });
  const base = Date.now();
  const hour = 60 * 60 * 1000;

  u.current = [{ points: 1 }];
  recordSample(u, base);
  const low = rating(u.current);

  u.current = [{ points: 8 }, { points: 8 }];
  recordSample(u, base + hour);
  const peak = rating(u.current);
  check('пик считается в окне', ratingFor(u, base + hour) === peak, String(ratingFor(u, base + hour)));
  check('пик больше низкого', peak > low, `${peak} vs ${low}`);

  // Потом результат упал — в окне лежит и пик, и свежий низкий замер.
  u.current = [{ points: 1 }];
  recordSample(u, base + 2 * hour);
  check('в окне держится пик, а не последний', ratingFor(u, base + 2 * hour) === peak, String(ratingFor(u, base + 2 * hour)));

  // Ровно через 3 суток после пика он ещё засчитывается.
  check('на границе окна пик в зачёте', ratingFor(u, base + hour + 3 * 24 * hour) === peak, String(ratingFor(u, base + hour + 3 * 24 * hour)));

  // Чуть позже пик выпадает, остаётся только свежий низкий замер.
  const afterWindow = ratingFor(u, base + hour + 3 * 24 * hour + 5000);
  check('пик старше 3 дней выпадает', afterWindow === low, `${afterWindow} vs пик ${peak}`);

  const noSamples = storage.ensureUser('4', { username: 'empty' });
  noSamples.current = [{ points: 2 }];
  check('без замеров берётся текущий результат', ratingFor(noSamples, Date.now()) === rating(noSamples.current));
}

console.log('\nEmbed\'ы:');
try {
  const embed = buildSudEmbed({ user, mention: '<@1> побил рекорд!', isRecord: true, count: user.current.length });
  const json = embed.toJSON();
  check('судимость: есть поля', json.fields.length >= 4, `полей ${json.fields.length}`);
  check('судимость: есть автор', typeof json.author?.name === 'string');
  check('судимость: поле «Статьи»', json.fields.some((f) => f.name.includes('Статьи')));
  check('судимость: поле рекорда', json.fields.some((f) => f.name.includes('Рекорд')));
  check('судимость: баннер нового рекорда', json.fields.some((f) => f.name.includes('НОВЫЙ РЕКОРД')));

  const cool = buildCooldownEmbed({ user, mention: '<@1>', waitMs: 12 * 60 * 1000 }).toJSON();
  check('кулдаун: поле «До новой попытки»', cool.fields.some((f) => f.name.includes('До новой попытки')));
  check('кулдаун: заголовок про кулдаун', String(cool.description).includes('Кулдаун'));

  check('рейтинг: топ', buildTopEmbed(storage, storage.top(10)).toJSON().description.length > 0);
  check('помощь: команды', buildHelpEmbed().toJSON().fields.length === 8, `полей ${buildHelpEmbed().toJSON().fields.length}`);
} catch (err) {
  failures += 1;
  console.error('  FAIL сборка embed:', err.message);
}

console.log('\nСклонения:');
check('1 день', plural(1, 'день', 'дня', 'дней') === 'день');
check('3 дня', plural(3, 'день', 'дня', 'дней') === 'дня');
check('11 дней', plural(11, 'день', 'дня', 'дней') === 'дней');
check('21 день', plural(21, 'день', 'дня', 'дней') === 'день');

fs.rmSync(file, { force: true });

console.log(failures === 0 ? '\nВсе проверки пройдены.\n' : `\nПровалено проверок: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
