'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { resolveTrack } = require('../music/provider');
const { musicManager } = require('../music/queue');

function createMusicControls(queue) {
  const isPaused = queue ? queue.isPaused : false;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vplay_pause')
      .setLabel(isPaused ? 'Продолжить' : 'Пауза')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('vplay_skip')
      .setLabel('Скип')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('vplay_queue')
      .setLabel('Очередь')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('vplay_stop')
      .setLabel('Стоп')
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
      'Голосовой канал не найден',
      'Зайди в любой голосовой канал сервера.',
      0xef4444,
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
      'Укажи трек',
      'Введи название песни или ссылку.',
      0xef4444,
    );
    await interaction.editReply({
      components: [errorBox],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  try {
    const resolved = await resolveTrack(query);

    const queue = musicManager.getOrCreate({
      guildId: interaction.guildId,
      textChannel: interaction.channel,
      voiceChannel,
    });

    if (resolved.type === 'playlist') {
      for (const t of resolved.tracks) {
        t.requestedBy = interaction.user.id;
      }

      const result = await queue.enqueueMultiple(resolved.tracks);
      const controls = createMusicControls(queue);
      const playlistLink = resolved.url ? `[${resolved.title}](<${resolved.url}>)` : `**${resolved.title}**`;

      if (result.started) {
        const first = result.firstTrack || resolved.tracks[0];
        const currentLink = first ? `[${first.title}](<${first.url}>) · \`${first.durationFormatted}\`` : '';
        const container = buildMusicContainer(
          'Запущен плейлист',
          `${playlistLink} (${resolved.tracksCount} треков)\nСейчас играет: ${currentLink}`,
          0x5865f2,
        );

        await interaction.editReply({
          components: [container, controls],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        const container = buildMusicContainer(
          'Плейлист добавлен в очередь',
          `${playlistLink}\nДобавлено треков: ${resolved.tracksCount} (начиная с #${result.position}) · ${resolved.author}`,
          0x5865f2,
        );

        await interaction.editReply({
          components: [container, controls],
          flags: MessageFlags.IsComponentsV2,
        });
      }
      return;
    }

    const track = resolved;
    track.requestedBy = interaction.user.id;

    const result = await queue.enqueue(track);
    const controls = createMusicControls(queue);

    if (result.started) {
      const container = buildMusicContainer(
        'Сейчас играет',
        `[${track.title}](<${track.url}>)\n${track.author} · \`${track.durationFormatted}\``,
        0x5865f2,
      );

      await interaction.editReply({
        components: [container, controls],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      const container = buildMusicContainer(
        `В очереди (#${result.position})`,
        `[${track.title}](<${track.url}>)\n${track.author} · \`${track.durationFormatted}\``,
        0x5865f2,
      );

      await interaction.editReply({
        components: [container, controls],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch (err) {
    console.error('[vplay]', err);
    const errorBox = buildMusicContainer(
      'Ошибка',
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
    const box = buildMusicContainer('Ничего не играет', 'Включи трек командой /vplay', 0x94a3b8);
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  const skipped = queue.currentTrack;
  queue.skip();
  const box = buildMusicContainer('Трек пропущен', skipped ? skipped.title : 'Текущий трек', 0x5865f2);
  await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
}

async function handleVStop(interaction) {
  const queue = musicManager.get(interaction.guildId);
  if (!queue) {
    const box = buildMusicContainer('Плеер не активен', 'Бот не подключен к голосовому каналу.', 0x94a3b8);
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  queue.stop();
  const box = buildMusicContainer('Остановлено', 'Очередь очищена, бот отключился от канала.', 0xef4444);
  await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
}

async function handleVQueue(interaction) {
  const queue = musicManager.get(interaction.guildId);
  if (!queue || (!queue.currentTrack && queue.queue.length === 0)) {
    const box = buildMusicContainer('Очередь пуста', 'Включи трек командой /vplay', 0x94a3b8);
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  let text = '';
  if (queue.currentTrack) {
    text += `Сейчас играет:\n[${queue.currentTrack.title}](<${queue.currentTrack.url}>) (\`${queue.currentTrack.durationFormatted}\`)\n\n`;
  }

  if (queue.queue.length > 0) {
    text += `В очереди (${queue.queue.length}):\n`;
    queue.queue.slice(0, 10).forEach((t, i) => {
      text += `${i + 1}. [${t.title}](<${t.url}>) (\`${t.durationFormatted}\`)\n`;
    });
    if (queue.queue.length > 10) {
      text += `... и ещё ${queue.queue.length - 10} треков`;
    }
  } else {
    text += 'В очереди больше нет треков.';
  }

  const box = buildMusicContainer('Очередь', text, 0x5865f2);
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
      content: 'Плеер сейчас не активен.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (customId === 'vplay_pause') {
    if (queue.isPaused) {
      queue.resume();
      await interaction.reply({ content: 'Воспроизведение продолжено.', flags: [MessageFlags.Ephemeral] });
    } else {
      queue.pause();
      await interaction.reply({ content: 'Воспроизведение приостановлено.', flags: [MessageFlags.Ephemeral] });
    }
  } else if (customId === 'vplay_skip') {
    const skipped = queue.currentTrack?.title || 'трек';
    queue.skip();
    await interaction.reply({ content: `Пропущено: ${skipped}`, flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'vplay_stop') {
    queue.stop();
    await interaction.reply({ content: 'Воспроизведение остановлено.', flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'vplay_queue') {
    let text = queue.currentTrack
      ? `Сейчас играет: [${queue.currentTrack.title}](<${queue.currentTrack.url}>)\n`
      : '';
    if (queue.queue.length > 0) {
      text += `\nВ очереди (${queue.queue.length}):\n` +
        queue.queue.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
    } else {
      text += '\nОчередь пуста.';
    }
    await interaction.reply({ content: text, flags: [MessageFlags.Ephemeral] });
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
