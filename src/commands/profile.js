'use strict';

const {
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');

const CREATOR_ID = '566547457568276494';

function buildProfileContainer({ targetUser, userData, best2048, bestSnake, voiceStats }) {
  const isCreator = String(targetUser.id) === CREATOR_ID;
  const container = new ContainerBuilder().setAccentColor(isCreator ? 0xf59e0b : 0x818cf8);

  const avatarUrl = typeof targetUser.displayAvatarURL === 'function'
    ? targetUser.displayAvatarURL({ extension: 'png', size: 256 })
    : null;
  const messagesCount = userData?.messages || 0;
  const rollsCount = userData?.rolls || 0;
  const bestArticles = userData?.bestCount || 0;
  const gameScore = best2048 || 0;
  const snakeScore = bestSnake || 0;
  const voiceTime = voiceStats?.formatted || '0 сек';
  const voiceSessions = voiceStats?.sessions || 0;

  const headerText = isCreator
    ? `### 👑 ${targetUser.username} · СОЗДАТЕЛЬ БОТА\n⚡ **Статус**: Архитектор системы · Полный доступ`
    : `### 👤 Профиль · ${targetUser.username}`;

  if (avatarUrl) {
    const headerSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
    container.addSectionComponents(headerSection);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Блок статистики
  const statsLines = [
    `💬 Сообщений в чате: **${messagesCount}**`,
    `⚖️ Всего судимостей: **${rollsCount}** (рекорд: **${bestArticles}** ст.)`,
    `🎮 Рекорд в 2048: **${gameScore}** очков`,
    `🐍 Рекорд в Змейке: **${snakeScore}** очков`,
    `🎙️ Время в войсе: **${voiceTime}** (${voiceSessions} сессий)`,
  ];

  if (voiceStats?.active) {
    statsLines.push(`🟢 Сейчас в войсе: <#${voiceStats.channelId}> (${voiceStats.currentSessionFormatted})`);
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statsLines.join('\n')));

  if (isCreator) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '✨ *«Верховный разработчик и повелитель кода. Все права защищены.»* 🚀',
      ),
    );
  }

  return container;
}

function registerProfile(client, storage, tracker) {
  client.handleProfile = async (interaction) => {
    const target = interaction.options?.getUser?.('участник') || interaction.user;
    const userData = storage.ensureUser(target.id, {
      username: target.username,
      guildId: interaction.guildId,
    });
    const best2048 = storage.bestScore('2048', target.id);
    const bestSnake = storage.bestScore('snake', target.id);
    const voiceStats = tracker.getUserLiveStats(target.id);

    const container = buildProfileContainer({
      targetUser: target,
      userData,
      best2048,
      bestSnake,
      voiceStats,
    });

    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  };

  return client.handleProfile;
}

module.exports = {
  buildProfileContainer,
  registerProfile,
  CREATOR_ID,
};
