'use strict';

/**
 * Триггеры на обычные сообщения в чате (без слешей).
 * ВАЖНО: требуется включённый Message Content Intent в Developer Portal.
 */

const {
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js');

const COOLDOWN_MS = 1_200;
const CLEAR_AFTER_MS = 30_000;

const SHEEP = '🐏🐏🐏';

// Картинка для триггера «аллах».
const SHEEP_IMAGE_URL =
  'https://media.discordapp.net/attachments/944945384550199296/1010517985829584946/1659812492677.gif';

// Картинка для триггеров «победа» и «рпп».
const VICTORY_IMAGE_URL =
  'https://cdn.discordapp.com/attachments/1329531462814273546/1545431810161250454/togif.gif';

const VICTORY_MESSAGES = [
  'Две полоски превращаются в три. ZOV ZOV ZOV.',
  'В сизофе сраные мечты. В девстейте — шансы на победу, а значит ZOV.',
  'Россия не сдаётся. Россия перепиливает игру и побеждает. ZOV ZOV ZOV.',
  'Стратегия простая: разведка, мобилизация, ZOV.',
  'Когда в лобби пусто, значит все уже в ZOV.',
  'Роскомнадзор заблокировал группу. Мы заблокировали карту. ZOV не заблокировать.',
  'Бутерброд можно отжарить. Победу — только удержать. Держим ZOV.',
  'У России две проблемы: песок и мотивация. Обе лечатся ZOV.',
  'База задержана. Это не отступление, это перегруппировка перед ZOV.',
  'Тактика: ZOV, ZOV, ZOV. Уставка: ZOV, ZOV, ZOV.',
  'Мы не воюем, мы тренируемся. Списком ZOV.',
  'Каждый второй фрагмент — за ZOV. Второй уходит следом.',
  'Россия — это ZOV, ZOV и немного ZOV.',
  'Скилл растёт не от коворкинга, а от ZOV.',
  'Выбирай ZOV. Не промахнёшься.',
  'Победа любит тех, кто первым кричит ZOV.',
];

const SHEEP_MESSAGES = [
  `${SHEEP} Аллах услышал. Ответ — стадо баранов.`,
  `${SHEEP}${SHEEP} Овцы идут на ZOV. Не спрашивай, зачем.`,
  `Стадо в курсе: ZOV ZOV ZOV. ${SHEEP}`,
  `${SHEEP} Не баран, но кричит ZOV громче тебя.`,
  `Бараны уже в лобби и зовут ZOV. ${SHEEP}${SHEEP}`,
  `${SHEEP} Кто позвал — тот и главный по ZOV. Стадо подтверждает.`,
];

/**
 * Визуальные аналоги латиницы → кириллица, чтобы «ZOV», «RPP» и «зоv»
 * читались как «зов» и «рпп».
 */
const HOMOGLYPHS = {
  a: 'а', b: 'в', c: 'с', d: 'д', e: 'е', g: 'г', h: 'н',
  k: 'к', m: 'м', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т',
  v: 'в', x: 'х', y: 'у', z: 'з',
};

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split('')
    .map((ch) => HOMOGLYPHS[ch] ?? ch)
    .join('');
}

// Граница слова: не буква и не цифра.
const PRE = '(?:^|[^0-9a-zа-яё])';
const POST = '(?:$|[^0-9a-zа-яё])';
// Разделители, которые вставляют внутрь слова: «р.п.п», «р п п», «р_п_п».
const SEP = '[\\s._\\-*!?/\\\\]';

const RPP = `${PRE}р${SEP}*п${SEP}*п${POST}`;
const RRR = `${PRE}р(?:${SEP}*р){2,}${POST}`;
const ZOV = `${PRE}з${SEP}*о${SEP}*в${POST}`;
// Падежные формы победы
const POBEDA = `${PRE}побед(?:ами|ах|ами|ей|ий|ии|ию|ия|а|у|ы|ой|е|ов)?${POST}`;
const THREE = `${PRE}(3|з)${SEP}*слов(?:ами|ам|ах|а|ов|у|е)?${SEP}*побед`;
const ALLAH = `${PRE}а(?:ла|лла)х(?:ами|ом|ах|ах|а|у|ы|е|и)?${POST}`;
const AKBAR = `${PRE}акбар${POST}`;
const AKABAR = `${PRE}акабар${POST}`;
const VICTORY_EN = `${PRE}victory${POST}`;

const TRIGGERS = [
  {
    id: 'rpp',
    label: 'РПП',
    pattern: new RegExp(`${RPP}|${RRR}`),
    title: 'РОССИЯ ПУТИН ПОБЕДА! ZOV ZOV ZOV',
    color: 0xc084fc,
    messages: VICTORY_MESSAGES,
    image: VICTORY_IMAGE_URL,
    words: ['РПП', 'рпп', 'р.п.п', 'р п п', 'р_п_п', 'р-п-п', 'р/п/п', 'ррр', 'PПП', 'RPP', 'ZOV', 'з о в'],
  },
  {
    id: 'three',
    label: '3 слова победы',
    pattern: new RegExp(`${THREE}`),
    title: 'РОССИЯ ПУТИН ПОБЕДА! ZOV ZOV ZOV',
    color: 0xc084fc,
    messages: VICTORY_MESSAGES,
    image: VICTORY_IMAGE_URL,
    words: ['3 слова победы', '3 слова', '3. слова. победы', '3-слова-победы', 'З слова победы'],
  },
  {
    id: 'victory',
    label: 'победа',
    pattern: new RegExp(`${POBEDA}|${ZOV}`),
    raw: new RegExp(`${VICTORY_EN}`),
    title: 'РОССИЯ ПУТИН ПОБЕДА! ZOV ZOV ZOV',
    color: 0xc084fc,
    messages: VICTORY_MESSAGES,
    image: VICTORY_IMAGE_URL,
    words: ['победа', 'ПОБЕДА', 'победу', 'победы', 'победой', 'victory', 'ZOV', 'зов'],
  },
  {
    id: 'sheep',
    label: 'аллах',
    pattern: new RegExp(`${ALLAH}|${AKBAR}|${AKABAR}`),
    title: `${SHEEP} СТАДО В СБОРЕ ${SHEEP}`,
    color: 0xfde047,
    messages: SHEEP_MESSAGES,
    image: SHEEP_IMAGE_URL,
    words: ['аллах', 'АЛЛАХ', 'аллаха', 'аллаху', 'аллахом', 'аллахе', 'Аллахи', 'акбар', 'Аллах Акбар', 'акабар'],
  },
];

function pickMessage(pool, rng = Math.random) {
  return pool[Math.floor(rng() * pool.length)];
}

function matchTrigger(content) {
  if (typeof content !== 'string' || !content) return null;
  const raw = content.toLowerCase().replace(/ё/g, 'е');
  const norm = normalize(raw);
  for (const trigger of TRIGGERS) {
    if (trigger.raw && trigger.raw.test(raw)) return trigger;
    if (trigger.pattern.test(norm)) return trigger;
  }
  return null;
}

function buildTriggerContainer(trigger, message, mention, showImage = true) {
  const container = new ContainerBuilder().setAccentColor(trigger.color);

  const text = [
    `### ${trigger.label} · ${mention}`,
    message,
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

  if (showImage && trigger.image) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(trigger.image),
      ),
    );
  }

  return { container, embed: container };
}

function register(client, storage) {
  const lastFired = new Map();
  const sentTimer = new Map();
  let victoryHitCount = 0;

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (storage && typeof storage.incrementMessages === 'function') {
      storage.incrementMessages(message.author.id, {
        username: message.author.username,
        guildId: message.guildId,
      });
    }

    const trigger = matchTrigger(message.content);
    if (!trigger) return;

    const now = Date.now();
    const last = lastFired.get(message.author.id) || 0;
    if (now - last < COOLDOWN_MS) return;
    lastFired.set(message.author.id, now);

    const channel = client.channels.cache.get(message.channelId);
    const cacheKey = `sud-bot-msg-${message.channelId}-${message.author.id}`;
    const previous = channel?.messages?.cache?.get(cacheKey);
    if (previous && typeof previous.delete === 'function') {
      previous.delete().catch(() => {});
    }

    // Картинка к победе и рпп появляется раз в пару сообщений (каждый 2-й раз)
    let showImage = Boolean(trigger.image);
    if (trigger.id === 'rpp' || trigger.id === 'victory' || trigger.id === 'three') {
      victoryHitCount += 1;
      showImage = victoryHitCount % 2 === 0;
    }

    try {
      const { container } = buildTriggerContainer(
        trigger,
        pickMessage(trigger.messages),
        `<@${message.author.id}>`,
        showImage,
      );
      const payload = {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [message.author.id] },
      };

      const sent = await message.channel.send(payload);
      if (sent && channel?.messages?.cache) {
        channel.messages.cache.set(cacheKey, sent);
        if (sentTimer.get(cacheKey)) clearTimeout(sentTimer.get(cacheKey));
        const timer = setTimeout(() => {
          sent.delete().catch(() => {});
          channel.messages.cache.delete(cacheKey);
          sentTimer.delete(cacheKey);
        }, CLEAR_AFTER_MS);
        timer.unref?.();
        sentTimer.set(cacheKey, timer);
      }
    } catch (err) {
      console.error('[триггер]', err.message);
    }
  });

  return { TRIGGERS };
}

module.exports = {
  register,
  matchTrigger,
  normalize,
  pickMessage,
  buildTriggerContainer,
  buildEmbed: buildTriggerContainer,
  TRIGGERS,
  VICTORY_MESSAGES,
  SHEEP_MESSAGES,
  SHEEP,
  SHEEP_IMAGE_URL,
  VICTORY_IMAGE_URL,
  COOLDOWN_MS,
  CLEAR_AFTER_MS,
};