'use strict';

/**
 * Проверка /рандом: состав, позиции, лейны, фильтр по роли.
 * Запуск: node scripts/test-random.js
 */

const dota = require('../src/data/dota');
const {
  membersWithRole,
  buildLineup,
  buildLineupEmbed,
  buildEmptyEmbed,
  ROLE_ID,
} = require('../src/commands/random');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

function member(id, name, bot = false) {
  return { id, user: { id, username: name, bot }, bot };
}

function fakeGuild({ roleId, roleIds, names }) {
  const role = { id: roleId, name: 'Капитаны', members: new Map(roleIds.map((id) => [id, {}])) };
  return {
    roles: { cache: new Map([[roleId, role]]) },
    members: { cache: new Map(names.map((m) => [m.id, m])) },
  };
}

const ROLE = '1554512622634803223';

console.log('\nДанные героев:');
check('позиций 5', dota.ORDER.length === 5, String(dota.ORDER.length));
check('героев достаточно', dota.HEROES.length >= 40, String(dota.HEROES.length));
for (const pos of dota.ORDER) {
  const list = dota.heroesFor(pos);
  check(`${pos}: есть герои`, list.length >= 3, `штук ${list.length}`);
  check(`${pos}: у позиции есть лейн`, typeof dota.POSITIONS[pos].lane === 'string');
}
check('имена героев уникальны', (() => {
  const names = dota.HEROES.map((h) => h.name);
  return new Set(names).size === names.length;
})(), 'есть повторы');
check('тактик больше нет', dota.STRATEGIES === undefined && dota.TASKS === undefined);
check('предметов больше нет', dota.KEY_ITEMS === undefined && dota.LANE_PLAN === undefined);

console.log('\nФильтр по роли:');
{
  const names = [member('1', 'a'), member('2', 'b'), member('3', 'бот', true)];
  const guild = fakeGuild({ roleId: ROLE, roleIds: ['1', '2', '3'], names });
  const found = membersWithRole(guild, ROLE);
  check('берёт только участников с ролью', found.length === 2, String(found.length));
  check('ботов не берёт', found.every((m) => !m.bot));
}
{
  const guild = fakeGuild({ roleId: ROLE, roleIds: [], names: [member('1', 'a')] });
  check('пустая роль → пустой список', membersWithRole(guild, ROLE).length === 0);
}
check('нет гильда → пустой список', membersWithRole(null, ROLE).length === 0);
{
  const names = [member('1', 'a')];
  const guild = fakeGuild({ roleId: ROLE, roleIds: ['1'], names });
  check('неизвестная роль → пустой список', membersWithRole(guild, 'нет-такой').length === 0);
}

console.log('\nСостав:');
{
  const names = Array.from({ length: 5 }, (_, i) => member(String(i + 1), `игрок${i + 1}`));
  const guild = fakeGuild({ roleId: ROLE, roleIds: names.map((m) => m.id), names });

  let firstFailure = null;
  for (let run = 0; run < 300 && !firstFailure; run += 1) {
    const lineup = buildLineup(membersWithRole(guild, ROLE));
    if (lineup.rows.length !== 5) firstFailure = `строк ${lineup.rows.length}`;
    else if (lineup.rows.map((r) => r.pos.key).join(',') !== dota.ORDER.join(',')) firstFailure = 'порядок позиций';
    else {
      const heroes = lineup.rows.map((r) => r.hero);
      if (new Set(heroes).size !== 5) firstFailure = 'герои повторились';
      else {
        const players = lineup.rows.filter((r) => r.member).map((r) => r.member.id);
        if (new Set(players).size !== players.length) firstFailure = 'игроки повторились';
        else {
          const bad = lineup.rows.find(
            (r) => !dota.heroesFor(r.pos.key).some((h) => h.name === r.hero),
          );
          if (bad) firstFailure = `герой не подходит позиции: ${bad.pos.key} → ${bad.hero}`;
          else if (lineup.rows.some((r) => !r.pos.lane)) firstFailure = 'где-то нет лейна';
        }
      }
    }
  }
  check('300 раскладов без ошибок', firstFailure === null, firstFailure || '');
  check('пять строк', firstFailure === null);
  check('позиции по порядку', firstFailure === null);
  check('герои уникальны', firstFailure === null);
  check('игроки уникальны', firstFailure === null);
  check('герой подходит позиции', firstFailure === null);
  check('у каждого есть лейн', firstFailure === null);
}

console.log('\nМало участников:');
{
  const names = [member('1', 'a'), member('2', 'b')];
  const guild = fakeGuild({ roleId: ROLE, roleIds: ['1', '2'], names });
  const lineup = buildLineup(membersWithRole(guild, ROLE));
  check('слоты всё равно 5', lineup.rows.length === 5);
  check('кому-то достался свободный слот', lineup.rows.some((r) => r.member === null));
  const { embed } = buildLineupEmbed({ lineup, roleName: 'Капитаны' });
  check('embed собирается', typeof embed.toJSON().fields[0].value === 'string');
  check('свободный слот помечен', embed.toJSON().fields[0].value.includes('слот свободен'));
}

console.log('\nEmbed:');
{
  const names = Array.from({ length: 5 }, (_, i) => member(String(i + 1), `игрок${i + 1}`));
  const guild = fakeGuild({ roleId: ROLE, roleIds: names.map((m) => m.id), names });
  const { embed, players } = buildLineupEmbed({
    lineup: buildLineup(membersWithRole(guild, ROLE)),
    roleName: 'Капитаны',
  });
  const json = embed.toJSON();
  const text = json.fields[0].value;

  check('заголовок про состав', typeof json.title === 'string' && json.title.length > 0);
  check('пять блоков', text.split('\n\n').length === 5, String(text.split('\n\n').length));
  check('все пять пингов', (text.match(/<\@\d+>/g) || []).length === 5);
  check('передано 5 игроков для пинга', players.length === 5, String(players.length));
  check('указаны лейны', (text.match(/лайн:/g) || []).length === 5, String((text.match(/лайн:/g) || []).length));
  check('указаны позиции', text.includes('Керри') && text.includes('Мид') && text.includes('Оффлейн'));
  check('блок в лимите 1024', text.length <= 1024, String(text.length));
  check('подпись с ролью', json.footer.text.includes('Капитаны'));

  check('тактик нет', !/Цель|тактик|задач/i.test(JSON.stringify(json)), JSON.stringify(json).slice(0, 200));
  check(' предметов нет', !/Blink|Glimmer|AKBAR/i.test(JSON.stringify(json)));
  check('описания пустое', json.description === undefined || json.description === '');

  console.log('\nПример:\n');
  console.log(`  ${json.title}`);
  for (const line of text.split('\n\n')) console.log(`  ${line.replace(/\n/g, '\n  ')}`);
}

console.log('\nПустой embed:');
{
  const json = buildEmptyEmbed(ROLE).toJSON();
  check('заголовок', json.title === 'Никого не нашлось');
  check('показывает ID роли', json.description.includes(ROLE));
  check('подсказывает про .env', json.description.includes('DOTA_ROLE_ID'));
}

console.log('\nID роли из настроек:');
check('роль по умолчанию верный', ROLE_ID() === ROLE, ROLE_ID());

console.log(failures === 0 ? '\nВсе проверки пройдены.\n' : `\nПровалено проверок: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);