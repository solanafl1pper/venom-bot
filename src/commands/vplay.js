'use strict';

const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { resolveTrack } = require('../music/provider');
const { musicManager } = require('../music/queue');

function createMusicControls(queue) {
  const isPaused = queue ? queue.isPaused : false;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vplay_pause')
      .setLabel(isPaused ? '▶️ Продолжить' : '⏸️ Пауза')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('vplay_skip')
      .setLabel('⏭️ Скип')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('vplay_queue')
      .setLabel('📜 Очередь')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('vplay_stop')
      .setLabel('⏹️ Стоп')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildMusicContainer(title, description, color = 0x5865f2) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n${description}`),
    );
}

async function handleVPlay(interaction) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    const errorBox = buildMusicContainer(
      '🔇 Ты не в голосовом канале',
      'Зайди в любой голосовой канал сервера, чтобы включить музыку!',
      0xfca5a5,
    );
    await interaction.editReply({
      components: [errorBox],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  const query = interaction.options.getString('запрос');
  if (!query) {
    const errorBox = buildMusicContainer(
      '❓ Укажи трек',
      'Введи название песни или ссылку на YouTube / SoundCloud!',
      0xfca5a5,
    );
    await interaction.editReply({
      components: [errorBox],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  try {
    const track = await resolveTrack(query);
    track.requestedBy = interaction.user.id;

    const queue = musicManager.getOrCreate({
      guildId: interaction.guildId,
      textChannel: interaction.channel,
      voiceChannel,
    });

    const result = await queue.enqueue(track);
    const controls = createMusicControls(queue);

    const sourceLabel = track.source === 'soundcloud' ? '🟠 SoundCloud' : '🔴 YouTube';
    const accentColor = track.source === 'soundcloud' ? 0xff7700 : 0xff0000;

    if (result.started) {
      const container = buildMusicContainer(
        '🎶 Включаем в войсе',
        `**[${track.title}](${track.url})**\n\n` +
          `👤 Автор: **${track.author}**\n` +
          `⏱ Длительность: \`${track.durationFormatted}\`\n` +
          `📡 Источник: **${sourceLabel}**\n` +
          `🔊 Канал: <#${voiceChannel.id}>\n` +
          `🙋 Заказал: <@${interaction.user.id}>`,
        accentColor,
      );

      await interaction.editReply({
        components: [container, controls],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      const container = buildMusicContainer(
        '⏳ Добавлено в очередь',
        `**[${track.title}](${track.url})**\n\n` +
          `👤 Автор: **${track.author}**\n` +
          `⏱ Длительность: \`${track.durationFormatted}\`\n` +
          `🔢 Позиция в очереди: **#${result.position}**\n` +
          `📡 Источник: **${sourceLabel}**\n` +
          `🙋 Заказал: <@${interaction.user.id}>`,
        0x10b981,
      );

      await interaction.editReply({
        components: [container, controls],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch (err) {
    console.error('[vplay]', err);
    const errorBox = buildMusicContainer(
      '⚠️ Ошибка поиска трека',
      `Не удалось загрузить трек: ${err.message}`,
      0xef4444,
    );
    await interaction.editReply({
      components: [errorBox],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

async function handleVSkip(interaction) {
  const queue = musicManager.get(interaction.guildId);
  if (!queue || !queue.isPlaying) {
    const box = buildMusicContainer('ℹ️ Сейчас ничего не играет', 'Включи музыку через `/vplay`!', 0x94a3b8);
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  const skipped = queue.currentTrack;
  queue.skip();
  const box = buildMusicContainer('⏭️ Трек пропущен', `Пропущен: **${skipped ? skipped.title : 'Текущий трек'}**`, 0x10b981);
  await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
}

async function handleVStop(interaction) {
  const queue = musicManager.get(interaction.guildId);
  if (!queue) {
    const box = buildMusicContainer('ℹ️ Плеер не активен', 'Бот сейчас не в голосовом канале.', 0x94a3b8);
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  queue.stop();
  const box = buildMusicContainer('⏹️ Музыка остановлена', 'Бот отключился от голосового канала, очередь очищена.', 0xef4444);
  await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
}

async function handleVQueue(interaction) {
  const queue = musicManager.get(interaction.guildId);
  if (!queue || (!queue.currentTrack && queue.queue.length === 0)) {
    const box = buildMusicContainer('📜 Очередь пуста', 'Включи трек командой `/vplay <название или ссылка>`!', 0x94a3b8);
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  let text = '';
  if (queue.currentTrack) {
    text += `▶️ **Сейчас играет:**\n[${queue.currentTrack.title}](${queue.currentTrack.url}) (\`${queue.currentTrack.durationFormatted}\`) — <@${queue.currentTrack.requestedBy}>\n\n`;
  }

  if (queue.queue.length > 0) {
    text += `📜 **Следующие треки (${queue.queue.length}):**\n`;
    queue.queue.slice(0, 10).forEach((t, i) => {
      text += `${i + 1}. [${t.title}](${t.url}) (\`${t.durationFormatted}\`) — <@${t.requestedBy}>\n`;
    });
    if (queue.queue.length > 10) {
      text += `*... и ещё ${queue.queue.length - 10} треков в очереди*`;
    }
  } else {
    text += '*В очереди больше нет треков.*';
  }

  const box = buildMusicContainer('🎶 Очередь воспроизведения', text, 0x5865f2);
  const controls = createMusicControls(queue);
  await interaction.editReply({ components: [box, controls], flags: MessageFlags.IsComponentsV2 });
}

async function handleMusicButtons(interaction) {
  if (typeof interaction.isButton !== 'function' || !interaction.isButton()) return;
  const customId = interaction.customId;
  if (!customId.startsWith('vplay_')) return;

  const queue = musicManager.get(interaction.guildId);
  if (!queue) {
    await interaction.reply({
      content: '❌ Музыкальный плеер сейчас не играет.',
      ephemeral: true,
    });
    return;
  }

  if (customId === 'vplay_pause') {
    if (queue.isPaused) {
      queue.resume();
      await interaction.reply({ content: '▶️ Воспроизведение продолжено!', ephemeral: true });
    } else {
      queue.pause();
      await interaction.reply({ content: '⏸️ Воспроизведение поставлено на паузу!', ephemeral: true });
    }
  } else if (customId === 'vplay_skip') {
    const skipped = queue.currentTrack?.title || 'трек';
    queue.skip();
    await interaction.reply({ content: `⏭️ Пропущен: **${skipped}**!`, ephemeral: true });
  } else if (customId === 'vplay_stop') {
    queue.stop();
    await interaction.reply({ content: '⏹️ Музыка остановлена, бот вышел из войса.', ephemeral: true });
  } else if (customId === 'vplay_queue') {
    let text = queue.currentTrack
      ? `▶️ **Сейчас:** [${queue.currentTrack.title}](${queue.currentTrack.url})\n`
      : '';
    if (queue.queue.length > 0) {
      text += `\n📜 **В очереди (${queue.queue.length}):**\n` +
        queue.queue.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
    } else {
      text += '\n*Очередь пуста.*';
    }
    await interaction.reply({ content: text, ephemeral: true });
  }
}

function registerVPlay(client) {
  client.handleVPlay = handleVPlay;
  client.handleVSkip = handleVSkip;
  client.handleVStop = handleVStop;
  client.handleVQueue = handleVQueue;

  client.on('interactionCreate', handleMusicButtons);
}

module.exports = {
  registerVPlay,
  handleVPlay,
  handleVSkip,
  handleVStop,
  handleVQueue,
};
