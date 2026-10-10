'use strict';

/**
 * Проверка статуса и погоды.
 * Запуск: node scripts/test-presence.js
 */

const { totalMembers, memberLine, buildStatus, REFRESH_MS } = require('../src/presence');
const { describe, plural, WMO } = require('../src/weather');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

function fakeClient(guilds) {
  return {
    guilds: { cache: new Map(guilds.map((g, i) => [String(i), g])) },
    cache: { size: guilds.length },
  };
}

console.log('\nПодсчёт участников:');
check(
  'пустой бот',
  totalMembers(fakeClient([])) === 0,
  String(totalMembers(fakeClient([]))),
);
check(
  'один сервер',
  totalMembers(fakeClient([{ memberCount: 2048 }])) === 2048,
  String(totalMembers(fakeClient([{ memberCount: 2048 }]))),
);
check(
  'несколько серверов',
  totalMembers(fakeClient([{ memberCount: 100 }, { memberCount: 50 }])) === 150,
  String(totalMembers(fakeClient([{ memberCount: 100 }, { memberCount: 50 }]))),
);
check(
  'memberCount undefined не ломает',
  totalMembers(fakeClient([{ memberCount: 10 }, {}])) === 10,
  String(totalMembers(fakeClient([{ memberCount: 10 }, {}]))),
);

console.log('\nСтрока статуса:');
check('2048 человек', memberLine(fakeClient([{ memberCount: 2048 }])) === '👥 2048 человек · 1 сервер', memberLine(fakeClient([{ memberCount: 2048 }])));
check('1 человек', memberLine(fakeClient([{ memberCount: 1 }])).startsWith('👥 1 человек ·'), memberLine(fakeClient([{ memberCount: 1 }])));
check('3 человека', memberLine(fakeClient([{ memberCount: 3 }])).startsWith('👥 3 человека ·'), memberLine(fakeClient([{ memberCount: 3 }])));
check('5 человек', memberLine(fakeClient([{ memberCount: 5 }])).startsWith('👥 5 человек ·'), memberLine(fakeClient([{ memberCount: 5 }])));
check('пусто', memberLine(fakeClient([])) === '👥 никого пока нет', memberLine(fakeClient([])));
check(
  'длина строки в лимите Discord (128)',
  memberLine(fakeClient([{ memberCount: 2048 }])).length <= 128,
);

console.log('\nПогода:');
check('ясно', JSON.stringify(describe(0, 12)) === JSON.stringify({ emoji: '☀️', text: 'ясно', temp: '+12°', short: '☀️ +12°' }), JSON.stringify(describe(0, 12)));
check('минус без плюса', describe(0, -5).temp === '-5°', describe(0, -5).temp);
check('ноль без плюса', describe(0, 0).temp === '0°', describe(0, 0).temp);
check('дождь', describe(61, 8).text === 'дождь', describe(61, 8).text);
check('снег', describe(75, -2).text === 'снегопад', describe(75, -2).text);
check('гроза', describe(95, 20).emoji === '⛈️', describe(95, 20).emoji);
check('неизвестный код не падает', describe(999, 10).text === 'непонятная погода', describe(999, 10).text);
check('все 28 кодов WMO описаны', Object.keys(WMO).length === 28, String(Object.keys(WMO).length));

console.log('\nСборка статуса:');
{
  const client = fakeClient([{ memberCount: 2048 }]);
  const status = buildStatus(client);
  check('люди в статусе', status.name.includes('2048'), status.name);
  check('подпись отдельно', status.state.length > 0, status.state);
  check('строки в лимите 128', status.name.length <= 128 && status.state.length <= 128);
  check('погоды в статусе нет', !/°|☀|🌧|🌤|Москва|погода/i.test(`${status.name} ${status.state}`), `${status.name} | ${status.state}`);

  const long = buildStatus(fakeClient([{ memberCount: 999999999 }]));
  check('обрезается до 128', long.name.length <= 128, `длина ${long.name.length}`);
}

console.log('\nСклонения:');
check('1 человек', plural(1, 'человек', 'человека', 'человек') === 'человек');
check('2048 человек', plural(2048, 'человек', 'человека', 'человек') === 'человек');
check('3 человека', plural(3, 'человек', 'человека', 'человек') === 'человека');
check('11 человек', plural(11, 'человек', 'человека', 'человек') === 'человек');
check('1 сервер', plural(1, 'сервер', 'сервера', 'серверов') === 'сервер');
check('5 серверов', plural(5, 'сервер', 'сервера', 'серверов') === 'серверов');

console.log('\nИнтервал обновления:');
check('5 минут', REFRESH_MS === 5 * 60 * 1000, String(REFRESH_MS));

console.log(failures === 0 ? '\nВсе проверки пройдены.\n' : `\nПровалено проверок: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);