'use strict';

/**
 * Тесты подсчёта времени в голосовых каналах.
 * Запуск: node scripts/test-voice.js
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const { Storage } = require('../src/storage');
const {
  VoiceTracker,
  formatVoiceDuration,
  formatHoursDecimal,
  getVoiceTop,
  getUserVoiceRank,
} = require('../src/voice');
const {
  buildVoiceUserEmbed,
  buildVoiceTopEmbed,
  buildVoiceRow,
} = require('../src/commands/voice');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

console.log('\nФорматирование времени в войсе:');
check('0 мс', formatVoiceDuration(0) === '0 мин', formatVoiceDuration(0));
check('30 секунд', formatVoiceDuration(30_000) === 'меньше минуты', formatVoiceDuration(30_000));
check('1 минута', formatVoiceDuration(60_000) === '1 мин', formatVoiceDuration(60_000));
check('45 минут', formatVoiceDuration(45 * 60 * 1000) === '45 мин', formatVoiceDuration(45 * 60 * 1000));
check('1 час 30 минут', formatVoiceDuration(90 * 60 * 1000) === '1 ч 30 мин', formatVoiceDuration(90 * 60 * 1000));
check('25 часов', formatVoiceDuration(25 * 3600 * 1000) === '1 д 1 ч', formatVoiceDuration(25 * 3600 * 1000));

console.log('\nДесятичные часы:');
check('0 мс', formatHoursDecimal(0) === '0 ч', formatHoursDecimal(0));
check('30 минут', formatHoursDecimal(30 * 60 * 1000) === '0.5 ч', formatHoursDecimal(30 * 60 * 1000));
check('1 час', formatHoursDecimal(3600 * 1000) === '1.0 ч', formatHoursDecimal(3600 * 1000));
check('20 часов', formatHoursDecimal(20 * 3600 * 1000) === '20 ч', formatHoursDecimal(20 * 3600 * 1000));

const tmpFile = path.join(os.tmpdir(), `sud-voice-${Date.now()}.json`);
const storage = new Storage(tmpFile).load();
const tracker = new VoiceTracker(storage);

console.log('\nЖизненный цикл войс-сессии:');
{
  const t0 = 1_000_000;
  // Пользователь заходит в войс
  tracker.handleJoin('user1', 'voice-1', 'guild-1', 'Вася', t0);
  check('сессия создана', tracker.activeSessions.has('user1'));
  check('канал запомнен', tracker.activeSessions.get('user1').channelId === 'voice-1');

  // Проверяем статистику прямо во время сессии (прошло 20 минут)
  const statsMid = tracker.getUserLiveStats('user1');
  check('активен', statsMid.active === true);
  check('канал в статистике', statsMid.channelId === 'voice-1');

  // Пользователь выходит спустя 30 минут (1 800 000 мс)
  const t1 = t0 + 1_800_000;
  tracker.handleLeave('user1', t1);
  check('сессия закрыта', !tracker.activeSessions.has('user1'));

  const user = storage.getUser('user1');
  check('время записано', user.voiceTimeMs === 1_800_000, `записано ${user.voiceTimeMs}`);
  check('сессий 1', user.voiceSessions === 1, `сессий ${user.voiceSessions}`);

  // Пользователь заходит второй раз на 15 минут
  const t2 = t1 + 60_000;
  tracker.handleJoin('user1', 'voice-2', 'guild-1', 'Вася', t2);
  tracker.handleLeave('user1', t2 + 900_000);

  const user2 = storage.getUser('user1');
  check('суммарное время (45 мин)', user2.voiceTimeMs === 2_700_000, `время ${user2.voiceTimeMs}`);
  check('сессий 2', user2.voiceSessions === 2, `сессий ${user2.voiceSessions}`);
}

console.log('\nПереход между каналами:');
{
  const t0 = 2_000_000;
  tracker.handleJoin('user2', 'channel-A', 'guild-1', 'Петя', t0);
  // Переход в channel-B через 10 минут
  tracker.handleMove('user2', 'channel-B', 'guild-1', 'Петя', t0 + 600_000);
  check('сессия всё ещё активна', tracker.activeSessions.has('user2'));
  check('канал обновлён', tracker.activeSessions.get('user2').channelId === 'channel-B');

  // Выход ещё через 20 минут
  tracker.handleLeave('user2', t0 + 1_800_000);
  const u2 = storage.getUser('user2');
  check('время суммарно 30 мин', u2.voiceTimeMs === 1_800_000, `время ${u2.voiceTimeMs}`);
}

console.log('\nПериодический сброс (flushActive):');
{
  const t0 = 3_000_000;
  tracker.handleJoin('user3', 'channel-C', 'guild-1', 'Коля', t0);
  // Промежуточный flush через 30 секунд
  tracker.flushActive(t0 + 30_000);
  const u3Mid = storage.getUser('user3');
  check('промежуточное время сохранено', u3Mid.voiceTimeMs === 30_000, `время ${u3Mid.voiceTimeMs}`);
  check('сессия осталась активной', tracker.activeSessions.has('user3'));

  tracker.handleLeave('user3', t0 + 90_000);
  const u3Final = storage.getUser('user3');
  check('итоговое время 90 сек', u3Final.voiceTimeMs === 90_000, `время ${u3Final.voiceTimeMs}`);
}

console.log('\nПодхват существующих участников (scanGuilds):');
{
  const fakeClient = {
    guilds: {
      cache: new Map([
        [
          'g1',
          {
            id: 'g1',
            channels: {
              cache: new Map([
                [
                  'vc1',
                  {
                    id: 'vc1',
                    isVoiceBased: () => true,
                    members: new Map([
                      ['user_in_vc', { id: 'user_in_vc', user: { id: 'user_in_vc', username: 'Онлайн', bot: false } }],
                      ['bot_in_vc', { id: 'bot_in_vc', user: { id: 'bot_in_vc', username: 'Бот', bot: true } }],
                    ]),
                  },
                ],
              ]),
            },
          },
        ],
      ]),
    },
  };

  tracker.scanGuilds(fakeClient);
  check('реальный участник подхвачен', tracker.activeSessions.has('user_in_vc'));
  check('бот пропущен', !tracker.activeSessions.has('bot_in_vc'));
  tracker.handleLeave('user_in_vc');
}

console.log('\nРейтинг и топ по войсу:');
{
  const top = tracker.getTop(5, 'guild-1');
  check('топ возвращает список', Array.isArray(top) && top.length > 0);
  check('первое место Вася (45 мин)', top[0].userId === 'user1');
  check('второе место Петя (30 мин)', top[1].userId === 'user2');

  const rank = tracker.getRank('user1', 'guild-1');
  check('ранг Васи равен 1', rank.rank === 1);
}

console.log('\nОтрисовка Embed-сообщений:');
{
  const targetUser = { id: 'user1', username: 'Вася' };
  const stats = tracker.getUserLiveStats('user1');
  const rank = tracker.getRank('user1', 'guild-1');
  const topUsers = tracker.getTop(5, 'guild-1');

  const userEmbed = buildVoiceUserEmbed({
    targetUser,
    stats,
    rank,
    topUsers,
    isSelf: true,
  });
  const jsonUser = userEmbed.toJSON();
  check('заголовок личной карточки', jsonUser.title.includes('Вася'));
  check('поля карточки присутствуют', jsonUser.fields.length >= 3);
  check('есть поле «Всего в войсе»', jsonUser.fields.some((f) => f.name.includes('Всего в войсе')));

  const topEmbed = buildVoiceTopEmbed({ topUsers });
  const jsonTop = topEmbed.toJSON();
  check('заголовок топа', jsonTop.title.includes('Топ по времени в войсе'));
  check('есть доска почёта', jsonTop.fields.some((f) => f.name.includes('Зал славы')));

  const row = buildVoiceRow();
  check('кнопки управления', row.components.length === 2);
}

fs.rmSync(tmpFile, { force: true });
console.log(failures === 0 ? '\nВсе проверки пройдены.\n' : `\nПровалено проверок: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
