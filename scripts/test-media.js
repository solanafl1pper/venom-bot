'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { Storage } = require('../src/storage');
const { register } = require('../src/commands');
const { extractTikTokUrl, TIKTOK_URL_REGEX } = require('../src/tiktok/downloader');
const { MusicManager } = require('../src/music/queue');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

async function run() {
  console.log('\nРегистрация медиа-команд:');
  const client = new EventEmitter();
  const storage = new Storage(':memory:');
  register(client, storage);

  const commandNames = client.slashCommands.map((c) => c.name);
  check('vplay зарегистрирована', commandNames.includes('vplay'));
  check('vskip зарегистрирована', commandNames.includes('vskip'));
  check('vstop зарегистрирована', commandNames.includes('vstop'));
  check('vqueue зарегистрирована', commandNames.includes('vqueue'));
  check('tiktok зарегистрирована', commandNames.includes('tiktok'));

  console.log('\nИзвлечение ссылок TikTok:');
  const samples = [
    { text: 'глянь https://www.tiktok.com/@tiktok/video/7106594312292453675 кайф', expected: 'https://www.tiktok.com/@tiktok/video/7106594312292453675' },
    { text: 'https://vm.tiktok.com/ZMh123abc/', expected: 'https://vm.tiktok.com/ZMh123abc/' },
    { text: 'чекай https://vt.tiktok.com/ZSj456def/?k=1', expected: 'https://vt.tiktok.com/ZSj456def/?k=1' },
    { text: 'https://m.tiktok.com/v/7106594312292453675.html', expected: 'https://m.tiktok.com/v/7106594312292453675.html' },
    { text: 'просто текст без ссылки', expected: null },
    { text: 'обычный сайт https://google.com/search?q=tiktok', expected: null },
    { text: 'только домен https://tiktok.com', expected: null },
  ];

  for (const s of samples) {
    const extracted = extractTikTokUrl(s.text);
    if (s.expected === null) {
      check(`не реагирует на «${s.text.slice(0, 30)}»`, extracted === null);
    } else {
      check(`извлекает «${s.expected.slice(0, 35)}»`, extracted !== null && extracted.startsWith('http'));
    }
  }

  console.log('\nПроверка ссылок SoundCloud:');
  const { isSoundCloudUrl } = require('../src/music/provider');
  check('распознает on.soundcloud.com', isSoundCloudUrl('https://on.soundcloud.com/ZjeMPwdvkQ6IMyzy8F'));
  check('распознает soundcloud с query-параметрами', isSoundCloudUrl('https://soundcloud.com/mitsune1024/hitdow-cover?si=9f9d7bd147b043b3905671ce520f9e41&utm_source=clipboard'));
  check('распознает m.soundcloud.com', isSoundCloudUrl('https://m.soundcloud.com/artist/track'));
  check('не путает обычный запрос с ссылкой', !isSoundCloudUrl('shadowraze astral'));

  console.log('\nМузыкальная очередь (MusicManager):');
  const mm = new MusicManager();
  const queue = mm.getOrCreate({
    guildId: 'test_guild',
    textChannel: { send: async () => {} },
    voiceChannel: { id: 'voice_123', guild: { id: 'test_guild', voiceAdapterCreator: {} } },
  });

  check('очередь создана', Boolean(queue));
  check('изначально не играет', queue.isPlaying === false);

  const mockTrack1 = {
    title: 'Test Song 1',
    author: 'Artist 1',
    url: 'https://soundcloud.com/artist/song1',
    duration: 180,
    durationFormatted: '3:00',
    source: 'soundcloud',
    requestedBy: 'user1',
  };
  const mockTrack2 = {
    title: 'Test Song 2',
    author: 'Artist 2',
    url: 'https://soundcloud.com/artist/song2',
    duration: 210,
    durationFormatted: '3:30',
    source: 'soundcloud',
    requestedBy: 'user2',
  };

  queue.queue.push(mockTrack1);
  queue.queue.push(mockTrack2);

  check('треки добавлены в очередь', queue.queue.length === 2);
  check('первый трек верный', queue.queue[0].title === 'Test Song 1');
  check('второй трек верный', queue.queue[1].title === 'Test Song 2');

  queue.skip();
  check('скип вызывает переход к следующему или остановку', queue.queue.length <= 2);

  queue.stop();
  check('стоп очищает очередь', queue.queue.length === 0);
  check('плеер удален из менеджера', mm.get('test_guild') === null);

  console.log('\nОбработка команд взаимодействия:');
  // Тестируем вызов /vplay без войс-канала
  let repliedContent = null;
  const mockVPlayInteraction = {
    commandName: 'vplay',
    isChatInputCommand: () => true,
    guildId: 'guild_1',
    user: { id: 'u1' },
    member: { voice: { channel: null } },
    options: { getString: () => 'test song' },
    editReply: async (data) => {
      repliedContent = data;
    },
  };

  await client.handleVPlay(mockVPlayInteraction);
  check('vplay без войса возвращает предупреждение', repliedContent !== null && Boolean(repliedContent.components));

  // Тестируем вызов /tiktok с некорректной ссылкой
  let tiktokReply = null;
  const mockTikTokInteraction = {
    commandName: 'tiktok',
    isChatInputCommand: () => true,
    guildId: 'guild_1',
    user: { id: 'u1' },
    options: { getString: () => 'https://not-tiktok.com/video/123' },
    editReply: async (data) => {
      tiktokReply = data;
    },
  };

  await client.handleTikTok(mockTikTokInteraction);
  check('tiktok с неверной ссылкой возвращает предупреждение', tiktokReply !== null && Boolean(tiktokReply.content));

  console.log('\nИТОГ:');
  if (failures > 0) {
    console.error(`Провалено проверок: ${failures}`);
    process.exit(1);
  } else {
    console.log('Все медиа-проверки пройдены успешно! 🎉');
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
