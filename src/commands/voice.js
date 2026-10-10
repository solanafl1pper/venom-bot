'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { formatVoiceDuration } = require('../voice');

function formatChannelsList(channels) {
  if (!channels || channels.length === 0) return '• нет войс-каналов';
  return channels
    .slice(0, 8)
    .map((c) => {
      const time = formatVoiceDuration(c.totalMs);
      const online = c.activeMembers?.length ? ` · 🟢 ${c.activeMembers.join(', ')}` : '';
      return `• <#${c.id}> — **${time}**${online}`;
    })
    .join('\n');
}

function buildVoiceUserContainer({ targetUser, stats, channelsList }) {
  const container = new ContainerBuilder().setAccentColor(0x38bdf8);

  const status = stats.active
    ? `🟢 <#${stats.channelId}> (${stats.currentSessionFormatted})`
    : '💤 не в войсе';

  const userText = [
    `### 🎙️ Войс · ${targetUser.username}`,
    `🕒 Всего в войсе: **${stats.formatted}** · 🎧 Сессий: **${stats.sessions}**`,
    `Статус: ${status}`,
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(userText));

  if (channelsList && channelsList.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### 🔊 Голосовые каналы\n${formatChannelsList(channelsList)}`),
    );
  }

  container.addActionRowComponents(buildVoiceRow());
  return container;
}

function buildVoiceTopContainer({ topUsers, channelsList }) {
  const container = new ContainerBuilder().setAccentColor(0x818cf8);

  const rows = (topUsers || []).slice(0, 10).map((u, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const inVoice = u.active ? (u.channelId ? ` · 🟢 <#${u.channelId}>` : ' · 🟢') : '';
    return `${medal} <@${u.userId}> — **${formatVoiceDuration(u.totalMs)}**${inVoice}`;
  });

  const text = [
    `### 🏆 Топ по времени в войсе`,
    rows.length ? rows.join('\n') : 'Никто ещё не сидел в войсе',
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

  if (channelsList && channelsList.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### 🔊 Голосовые каналы\n${formatChannelsList(channelsList)}`),
    );
  }

  container.addActionRowComponents(buildVoiceRow());
  return container;
}

function buildVoiceRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('voice:top')
      .setLabel('🏆 Топ')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('voice:me')
      .setLabel('👤 Мой войс')
      .setStyle(ButtonStyle.Primary),
  );
}

function registerVoice(client, tracker) {
  client.handleVoice = async (interaction) => {
    const target = interaction.options?.getUser?.('участник') || interaction.user;
    const stats = tracker.getUserLiveStats(target.id);
    const channelsList = tracker.getGuildVoiceChannels(interaction.guild);

    const container = buildVoiceUserContainer({
      targetUser: target,
      stats,
      channelsList,
    });

    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: [target.id] },
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  };

  client.handleVoiceTop = async (interaction) => {
    const topUsers = tracker.getTop(10, interaction.guildId);
    const channelsList = tracker.getGuildVoiceChannels(interaction.guild);
    const container = buildVoiceTopContainer({ topUsers, channelsList });

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

  client.on('interactionCreate', async (interaction) => {
    if (typeof interaction.isButton !== 'function' || !interaction.isButton()) return;
    if (!interaction.customId?.startsWith('voice:')) return;

    try {
      const channelsList = tracker.getGuildVoiceChannels(interaction.guild);
      if (interaction.customId === 'voice:top') {
        const topUsers = tracker.getTop(10, interaction.guildId);
        const container = buildVoiceTopContainer({ topUsers, channelsList });
        await interaction.reply({
          components: [container],
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
      } else if (interaction.customId === 'voice:me') {
        const stats = tracker.getUserLiveStats(interaction.user.id);
        const container = buildVoiceUserContainer({
          targetUser: interaction.user,
          stats,
          channelsList,
        });
        await interaction.reply({
          components: [container],
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
      }
    } catch (err) {
      console.error('[voice-button]', err.message);
    }
  });

  return { tracker };
}

module.exports = {
  buildVoiceUserContainer,
  buildVoiceTopContainer,
  buildVoiceUserEmbed: buildVoiceUserContainer,
  buildVoiceTopEmbed: buildVoiceTopContainer,
  buildVoiceRow,
  formatChannelsList,
  registerVoice,
};
