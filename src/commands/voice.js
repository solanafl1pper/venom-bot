'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { formatVoiceDuration, formatHoursDecimal, plural } = require('../voice');

function buildVoiceUserEmbed({ targetUser, stats, rank, topUsers, isSelf }) {
  const embed = new EmbedBuilder()
    .setColor(0x38bdf8)
    .setTitle(`🎙️ Войс-досье · ${targetUser.username}`)
    .setAuthor({ name: '☕ Уголок войса для своих' })
    .setDescription(
      isSelf
        ? 'Твоё время, проведённое в голосовых каналах с друзьями.'
        : `Сколько времени <@${targetUser.id}> провёл в голосовых каналах с друзьями.`,
    )
    .addFields(
      {
        name: '🕒 Всего в войсе',
        value: `**${stats.formatted}**\n*(~${stats.hoursDecimal})*`,
        inline: true,
      },
      {
        name: '🎧 Посиделок',
        value: `${stats.sessions} ${plural(stats.sessions, 'сессия', 'сессии', 'сессий')}`,
        inline: true,
      },
      {
        name: '🏆 Место в топе',
        value: rank ? `#**${rank.rank}** из ${rank.total}` : 'пока без места',
        inline: true,
      },
    );

  const statusText = stats.active
    ? `🟢 **Сейчас в войсе:** <#${stats.channelId}>\n↳ сидит уже: **${stats.currentSessionFormatted}**`
    : '💤 Сейчас не в голосовом канале';

  embed.addFields({ name: 'Статус сейчас', value: statusText, inline: false });

  if (topUsers && topUsers.length > 0) {
    const miniTop = topUsers
      .slice(0, 5)
      .map((u, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `▫️ ${i + 1}.`;
        const activeMark = u.active ? ' 🟢' : '';
        return `${medal} <@${u.userId}> — **${formatVoiceDuration(u.totalMs)}**${activeMark}`;
      })
      .join('\n');
    embed.addFields({ name: '🌟 Топ-5 любителей войса', value: miniTop, inline: false });
  }

  embed.setFooter({ text: 'считаем каждую минуту живого общения · для своих' }).setTimestamp();

  return embed;
}

function buildVoiceTopEmbed({ topUsers }) {
  const embed = new EmbedBuilder()
    .setColor(0x818cf8)
    .setTitle('🏆 Топ по времени в войсе')
    .setAuthor({ name: '☕ Уголок войса для своих' })
    .setDescription('Кто больше всех сидит в голосовых каналах и тащит ламповую атмосферу:');

  if (!topUsers || topUsers.length === 0) {
    embed.addFields({
      name: 'Пока пусто ✨',
      value: 'Ещё никто не посидел в войсе при боте. Залетайте в любой голосовой канал!',
    });
  } else {
    const rows = topUsers.map((u, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `▫️ ${i + 1}.`;
      const activeMark = u.active ? ' 🟢 *(в войсе сейчас)*' : '';
      return `${medal} <@${u.userId}> — **${formatVoiceDuration(u.totalMs)}**${activeMark}\n　 ↳ посиделок: ${u.sessions} · ~${formatHoursDecimal(u.totalMs)}`;
    });

    embed.addFields({
      name: '👑 Зал славы голосовых каналов',
      value: rows.join('\n').slice(0, 1024),
    });
  }

  const totalTimeMs = (topUsers || []).reduce((acc, u) => acc + u.totalMs, 0);
  embed.setFooter({
    text: `всего насидели всей компанией: ${formatVoiceDuration(totalTimeMs)} · чисто для своих`,
  }).setTimestamp();

  return embed;
}

function buildVoiceRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('voice:top')
      .setLabel('🏆 Топ войса')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('voice:me')
      .setLabel('👤 Моё время')
      .setStyle(ButtonStyle.Primary),
  );
}

function registerVoice(client, tracker) {
  client.handleVoice = async (interaction) => {
    const target = interaction.options?.getUser?.('участник') || interaction.user;
    const isSelf = target.id === interaction.user.id;
    const stats = tracker.getUserLiveStats(target.id);
    const rank = tracker.getRank(target.id, interaction.guildId);
    const topUsers = tracker.getTop(5, interaction.guildId);

    const embed = buildVoiceUserEmbed({
      targetUser: target,
      stats,
      rank,
      topUsers,
      isSelf,
    });

    const payload = {
      embeds: [embed],
      components: [buildVoiceRow()],
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
    const embed = buildVoiceTopEmbed({ topUsers });

    const payload = {
      embeds: [embed],
      components: [buildVoiceRow()],
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
      if (interaction.customId === 'voice:top') {
        const topUsers = tracker.getTop(10, interaction.guildId);
        const embed = buildVoiceTopEmbed({ topUsers });
        await interaction.reply({
          embeds: [embed],
          components: [buildVoiceRow()],
          ephemeral: true,
        });
      } else if (interaction.customId === 'voice:me') {
        const stats = tracker.getUserLiveStats(interaction.user.id);
        const rank = tracker.getRank(interaction.user.id, interaction.guildId);
        const topUsers = tracker.getTop(5, interaction.guildId);
        const embed = buildVoiceUserEmbed({
          targetUser: interaction.user,
          stats,
          rank,
          topUsers,
          isSelf: true,
        });
        await interaction.reply({
          embeds: [embed],
          components: [buildVoiceRow()],
          ephemeral: true,
        });
      }
    } catch (err) {
      console.error('[voice-button]', err.message);
    }
  });

  return { tracker };
}

module.exports = {
  buildVoiceUserEmbed,
  buildVoiceTopEmbed,
  buildVoiceRow,
  registerVoice,
};
