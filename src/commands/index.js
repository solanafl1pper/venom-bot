'use strict';

const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { rollNew } = require('../engine');
const {
  buildSudContainer,
  buildCooldownContainer,
  buildTopContainer,
  buildHelpContainer,
} = require('./embeds');
const { registerWeather } = require('./weather');
const { registerGame } = require('./game');
const { handleRANDOM } = require('./random');
const { registerVoice } = require('./voice');
const { registerProfile } = require('./profile');
const { registerVPlay } = require('./vplay');
const { registerTikTok } = require('./tiktok');
const { VoiceTracker } = require('../voice');

function register(client, storage, tracker) {
  const cmdSud = new SlashCommandBuilder()
    .setName('судимость')
    .setDescription('Показывает судимость участника (по умолчанию — вашу)')
    .addUserOption((opt) =>
      opt.setName('участник').setDescription('Кого проверить').setRequired(false),
    );

  const cmdTop = new SlashCommandBuilder()
    .setName('рейтинг')
    .setDescription('Топ самых судимых участников');

  const cmdHelp = new SlashCommandBuilder()
    .setName('помощь')
    .setDescription('Справка по командам бота');

  const cmdProfile = new SlashCommandBuilder()
    .setName('профиль')
    .setDescription('Личный профиль: сообщения, судимости, рекорд 2048 и время в войсе')
    .addUserOption((opt) =>
      opt.setName('участник').setDescription('Кого проверить (по умолчанию — ты)').setRequired(false),
    );

  const cmdWeather = new SlashCommandBuilder()
    .setName('погода')
    .setDescription('Погода в городе')
    .addStringOption((opt) =>
      opt
        .setName('город')
        .setDescription('Город, например Казань. Без неё — город по умолчанию')
        .setRequired(false),
    );

  const cmdGame = new SlashCommandBuilder()
    .setName('2048')
    .setDescription('Запустить 2048 прямо в Discord');

  const cmdSnake = new SlashCommandBuilder()
    .setName('змейка')
    .setDescription('Запустить Змейку прямо в Discord');

  const cmdRandom = new SlashCommandBuilder()
    .setName('рандом')
    .setDescription('Случайный состав на Доту 2');

  const cmdVoice = new SlashCommandBuilder()
    .setName('войс')
    .setDescription('Сколько часов участник провёл в голосовых каналах')
    .addUserOption((opt) =>
      opt.setName('участник').setDescription('Кого проверить (по умолчанию — ты)').setRequired(false),
    );

  const cmdVoiceTop = new SlashCommandBuilder()
    .setName('войстоп')
    .setDescription('Топ участников по времени в голосовых каналах');

  const cmdVPlay = new SlashCommandBuilder()
    .setName('vplay')
    .setDescription('Включить музыку в голосовом канале (YouTube / SoundCloud)')
    .addStringOption((opt) =>
      opt.setName('запрос').setDescription('Название песни или ссылка на YouTube / SoundCloud').setRequired(true),
    );

  const cmdVSkip = new SlashCommandBuilder()
    .setName('vskip')
    .setDescription('Пропустить текущий трек в голосовом канале');

  const cmdVStop = new SlashCommandBuilder()
    .setName('vstop')
    .setDescription('Остановить музыку и выйти из голосового канала');

  const cmdVQueue = new SlashCommandBuilder()
    .setName('vqueue')
    .setDescription('Показать текущую очередь воспроизведения музыки');

  const cmdTikTok = new SlashCommandBuilder()
    .setName('tiktok')
    .setDescription('Скачать видео из TikTok без водяного знака')
    .addStringOption((opt) =>
      opt.setName('ссылка').setDescription('Ссылка на видео TikTok').setRequired(true),
    );

  client.slashCommands = [
    cmdSud,
    cmdTop,
    cmdHelp,
    cmdProfile,
    cmdWeather,
    cmdGame,
    cmdSnake,
    cmdRandom,
    cmdVoice,
    cmdVoiceTop,
    cmdVPlay,
    cmdVSkip,
    cmdVStop,
    cmdVQueue,
    cmdTikTok,
  ];

  const voiceTracker = tracker || client.voiceTracker || new VoiceTracker(storage);
  client.voiceTracker = voiceTracker;

  registerWeather(client);
  registerGame(client, storage);
  registerVoice(client, voiceTracker);
  registerProfile(client, storage, voiceTracker);
  registerVPlay(client);
  registerTikTok(client);

  // id прошлого ответа бота для «судимости» — чтобы удалять его при новой попытке.
  const lastSudMessage = new Map();

  async function handleSud(interaction) {
    const target = interaction.options.getUser('участник') || interaction.user;
    const now = Date.now();

    const user = storage.ensureUser(target.id, {
      username: target.username,
      guildId: interaction.guildId,
    });
    user.lastCheckAt = now;

    const wait = storage.msUntilNextRoll(user, now);
    if (user.lastRollAt && wait > 0) {
      const container = buildCooldownContainer({ user, mention: `<@${target.id}>`, waitMs: wait });
      storage.saveUser(user);
      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [target.id] },
      });
      return;
    }

    const key = `${interaction.channelId}:${target.id}`;
    const prev = lastSudMessage.get(key);
    lastSudMessage.delete(key);
    if (prev && typeof prev.delete === 'function') {
      try {
        await prev.delete();
      } catch {
        /* сообщение уже удалено */
      }
    }

    const result = rollNew(user, Math.random, now);
    storage.saveUser(user);

    const isSelf = target.id === interaction.user.id;
    const ping = result.isRecord
      ? `<@${target.id}> побил ${isSelf ? 'свой ' : ''}рекорд!`
      : `<@${target.id}>${isSelf ? ', ваша судимость' : ''}`;

    const container = buildSudContainer({
      user,
      mention: ping,
      isRecord: result.isRecord,
      count: result.count,
    });

    const sent = await interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: [target.id] },
    });
    if (sent && sent.id) lastSudMessage.set(key, sent);
  }

  async function handleTop(interaction) {
    const container = buildTopContainer(storage, storage.top(10));
    await interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  async function handleHelp(interaction) {
    const container = buildHelpContainer();
    await interaction.reply({
      components: [container],
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      ephemeral: true,
    });
  }

  const needsDefer = new Set([
    'судимость',
    'рейтинг',
    'профиль',
    'погода',
    '2048',
    'змейка',
    'рандом',
    'войс',
    'войстоп',
    'vplay',
    'vskip',
    'vstop',
    'vqueue',
    'tiktok',
  ]);

  const handlers = new Map([
    ['судимость', handleSud],
    ['рейтинг', handleTop],
    ['помощь', handleHelp],
    ['профиль', (i) => client.handleProfile(i)],
    ['погода', (i) => client.handleWeather(i, storage)],
    ['2048', (i) => client.handleGame(i)],
    ['змейка', (i) => client.handleGame(i)],
    ['рандом', (i) => handleRANDOM(i)],
    ['войс', (i) => client.handleVoice(i)],
    ['войстоп', (i) => client.handleVoiceTop(i)],
    ['vplay', (i) => client.handleVPlay(i)],
    ['vskip', (i) => client.handleVSkip(i)],
    ['vstop', (i) => client.handleVStop(i)],
    ['vqueue', (i) => client.handleVQueue(i)],
    ['tiktok', (i) => client.handleTikTok(i)],
  ]);

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers.get(interaction.commandName);
    if (!handler) return;

    try {
      if (needsDefer.has(interaction.commandName)) {
        await interaction.deferReply({ flags: [MessageFlags.IsComponentsV2] });
      }
      await handler(interaction);
    } catch (err) {
      console.error(`[команда ${interaction.commandName}]`, err.message);
      const fallback = new ContainerBuilder()
        .setAccentColor(0xfca5a5)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### ⚠️ Ошибка\nЧто-то пошло не так, попробуй ещё раз!'),
        );
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            components: [fallback],
            flags: MessageFlags.IsComponentsV2,
          });
        } else {
          await interaction.reply({
            components: [fallback],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
          });
        }
      } catch {
        /* игнорируем ошибку отправки fallback */
      }
    }
  });

  return { handlers };
}

module.exports = { register };