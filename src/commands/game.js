'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const g = require('../games/game2048');

const TTL_MS = 2 * 60 * 60 * 1000;

function buildLaunchContainer(user, best, inviteUrl, channelName, game = '2048') {
  const isSnake = game === 'snake' || game === 'змейка';
  const accentColor = isSnake ? 0x10b981 : 0xedc22e;
  const title = isSnake ? '### 🐍 Змейка · Discord Activity' : '### 🎮 2048 · Discord Activity';
  const desc = isSnake
    ? 'Запускай Змейку прямо в Discord в один клик! Собирай яблоки, бей рекорды и сражайся в дуэли на одной карте.'
    : 'Запускай игру прямо в Discord в один клик! Собирай плитки, бей рекорды и соревнуйся с друзьями.';
  const recordLabel = isSnake ? '🏆 Твой рекорд в Змейке:' : '🏆 Твой рекорд:';
  const btnLabel = isSnake ? '🚀 Запустить Змейку' : '🚀 Запустить 2048';

  const container = new ContainerBuilder().setAccentColor(accentColor);

  const textLines = [
    title,
    desc,
    '',
    `${recordLabel} **${best || 0}**${channelName ? ` · Канал: **${channelName}**` : ''}`,
  ];

  if (inviteUrl) {
    textLines.push('', `👉 **Инвайт в игру:** ${inviteUrl}`);
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(textLines.join('\n')));

  if (inviteUrl) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(btnLabel)
        .setURL(inviteUrl),
    );
    container.addActionRowComponents(row);
  }

  return container;
}

function registerGame(client, storage) {
  client.handleGame = async (interaction) => {
    const userId = interaction.user.id;
    const isSnake = interaction.commandName === 'змейка';
    const gameKey = isSnake ? 'snake' : '2048';
    const best = storage ? storage.bestScore(gameKey, userId) : 0;
    const guild = interaction.guild;

    // Запоминаем, кто запустил команду для автоматической привязки рекорда в профиль
    if (storage) {
      if (!storage.data.meta) storage.data.meta = {};
      const avatarUrl = typeof interaction.user.displayAvatarURL === 'function'
        ? interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
        : null;
      storage.data.meta.lastLaunch = {
        userId,
        username: interaction.user.username,
        avatar: avatarUrl,
        guildId: guild?.id || null,
        game: gameKey,
        at: Date.now(),
      };
    }

    // Ищем голосовой канал: сначала где сидит автор, иначе любой доступный на сервере
    let voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel && guild?.channels?.cache) {
      voiceChannel =
        guild.channels.cache.find(
          (c) =>
            c.isVoiceBased() &&
            c.permissionsFor(guild.members.me || client.user.id)?.has?.('CreateInstantInvite'),
        ) || guild.channels.cache.find((c) => c.isVoiceBased());
    }

    let inviteUrl = null;
    let channelName = null;

    if (voiceChannel && typeof voiceChannel.createInvite === 'function') {
      channelName = voiceChannel.name;
      try {
        // Создаём инвайт для активности
        const invite = await voiceChannel.createInvite({
          targetType: 2, // InviteTargetType.EmbeddedApplication
          targetApplication: client.user.id,
          maxAge: 86400,
          maxUses: 0,
        });
        inviteUrl = invite.url;
      } catch {
        try {
          // Запасной вариант — стандартный инвайт в канал
          const fallbackInvite = await voiceChannel.createInvite({
            maxAge: 86400,
            maxUses: 0,
          });
          inviteUrl = fallbackInvite.url;
        } catch {
          /* нет прав на создание инвайта */
        }
      }

      if (storage) {
        if (!storage.data.meta.channelLaunches) storage.data.meta.channelLaunches = {};
        storage.data.meta.channelLaunches[voiceChannel.id] = {
          userId,
          username: interaction.user.username,
          avatar: typeof interaction.user.displayAvatarURL === 'function'
            ? interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
            : null,
          inviteUrl,
          game: gameKey,
          at: Date.now(),
        };
        if (storage.data.meta.lastLaunch) {
          storage.data.meta.lastLaunch.inviteUrl = inviteUrl;
          storage.data.meta.lastLaunch.game = gameKey;
        }
      }
    }

    const container = buildLaunchContainer(interaction.user, best, inviteUrl, channelName, gameKey);

    await interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  };

  return { client };
}

module.exports = {
  registerGame,
  buildLaunchContainer,
  buildGameContainer: (game, best) => buildLaunchContainer(null, best, null, null, '2048'),
  buildFinishedGameContainer: (game, best) => buildLaunchContainer(null, best, null, null, '2048'),
  buildEmbed: (game, best) => buildLaunchContainer(null, best, null, null, '2048'),
  buildFinishedEmbed: (game, best) => buildLaunchContainer(null, best, null, null, '2048'),
  TTL_MS,
};