'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { rollNew } = require('../engine');
const { buildSudEmbed, buildCooldownEmbed, buildTopEmbed, buildHelpEmbed } = require('./embeds');
const { registerWeather } = require('./weather');
const { registerGame } = require('./game');
const { handleRANDOM } = require('./random');
const { registerVoice } = require('./voice');
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
    .setDescription('Топ-10 самых судимых участников');

  const cmdHelp = new SlashCommandBuilder()
    .setName('помощь')
    .setDescription('Справка по командам бота');

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
    .setDescription('Играть в 2048 прямо в чате');

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

  client.slashCommands = [
    cmdSud,
    cmdTop,
    cmdHelp,
    cmdWeather,
    cmdGame,
    cmdRandom,
    cmdVoice,
    cmdVoiceTop,
  ];

  const voiceTracker = tracker || client.voiceTracker || new VoiceTracker(storage);
  client.voiceTracker = voiceTracker;

  registerWeather(client);
  registerGame(client, storage);
  registerVoice(client, voiceTracker);

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
      const embed = buildCooldownEmbed({ user, mention: `<@${target.id}>`, waitMs: wait });
      storage.saveUser(user);
      await interaction.editReply({ embeds: [embed], allowedMentions: { users: [target.id] } });
      return;
    }

    const key = `${interaction.channelId}:${target.id}`;
    const prev = lastSudMessage.get(key);
    lastSudMessage.delete(key);
    if (prev && typeof prev.delete === 'function') {
      try {
        await prev.delete();
      } catch {
        /* сообщение уже удалено — не мешает */
      }
    }

    const result = rollNew(user, Math.random, now);
    storage.saveUser(user);

    const isSelf = target.id === interaction.user.id;
    const ping = result.isRecord
      ? `<@${target.id}> побил ${isSelf ? 'свой ' : ''}рекорд!`
      : `<@${target.id}>${isSelf ? ', ваша судимость' : ''}`;

    const embed = buildSudEmbed({
      user,
      mention: ping,
      isRecord: result.isRecord,
      count: result.count,
    });

    const sent = await interaction.editReply({
      embeds: [embed],
      allowedMentions: { users: [target.id] },
    });
    if (sent && sent.id) lastSudMessage.set(key, sent);
  }

  async function handleTop(interaction) {
    await interaction.editReply({ embeds: [buildTopEmbed(storage, storage.top(10))] });
  }

  async function handleHelp(interaction) {
    await interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
  }

  const needsDefer = new Set(['судимость', 'рейтинг', 'погода', '2048', 'рандом', 'войс', 'войстоп']);

  const handlers = new Map([
    ['судимость', handleSud],
    ['рейтинг', handleTop],
    ['помощь', handleHelp],
    ['погода', (i) => client.handleWeather(i, storage)],
    ['2048', (i) => client.handleGame(i)],
    ['рандом', (i) => handleRANDOM(i)],
    ['войс', (i) => client.handleVoice(i)],
    ['войстоп', (i) => client.handleVoiceTop(i)],
  ]);

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers.get(interaction.commandName);
    if (!handler) return;

    try {
      if (needsDefer.has(interaction.commandName)) await interaction.deferReply();
      await handler(interaction);
    } catch (err) {
      console.error(`[команда ${interaction.commandName}]`, err.message);
      const fallback = new EmbedBuilder()
        .setColor(0xfca5a5)
        .setTitle('Ошибка')
        .setDescription('Что-то пошло не так, но это мелочи. Попробуй нажать ещё разок! ✨');
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [fallback] });
        } else {
          await interaction.reply({ embeds: [fallback], ephemeral: true });
        }
      } catch {
        /* ответ неотправлен — молча игнорируем */
      }
    }
  });

  return { handlers };
}

module.exports = { register };