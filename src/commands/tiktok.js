'use strict';

const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const { extractTikTokUrl, downloadTikTok } = require('../tiktok/downloader');

const processedMessages = new Set();
const lastProcessedByUser = new Map();
const COOLDOWN_MS = 2_000;

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function buildTikTokContainer(data, userMention) {
  const durStr = data.duration ? ` · ⏱️ \`${formatDuration(data.duration)}\`` : '';
  const sizeMb = (data.buffer.length / (1024 * 1024)).toFixed(1);
  const desc =
    `📹 **[${data.title.slice(0, 150)}](${data.downloadUrl})**\n\n` +
    `👤 Автор: **@${data.author}**${durStr}\n` +
    `💾 Размер: \`${sizeMb} MB\` · 💧 *Без водяного знака*\n` +
    (userMention ? `👤 Отправил: ${userMention}` : '');

  return new ContainerBuilder()
    .setAccentColor(0xfe2c55)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### 🎵 TikTok Video\n${desc}`),
    );
}

/**
 * Обработка слеш-команды /tiktok
 */
async function handleTikTokCommand(interaction) {
  const inputUrl = interaction.options.getString('ссылка');
  const targetUrl = extractTikTokUrl(inputUrl);

  if (!targetUrl) {
    const errorBox = new ContainerBuilder()
      .setAccentColor(0xfca5a5)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '### ⚠️ Неверная ссылка\nУкажи корректную ссылку на видео TikTok (например, `https://vt.tiktok.com/...` или `https://www.tiktok.com/@user/video/...`)!',
        ),
      );
    await interaction.editReply({
      components: [errorBox],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  try {
    const data = await downloadTikTok(targetUrl);
    const container = buildTikTokContainer(data, `<@${interaction.user.id}>`);

    if (data.tooLarge) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('📥 Скачать видео (HD)')
          .setStyle(ButtonStyle.Link)
          .setURL(data.downloadUrl),
      );
      await interaction.editReply({
        content: '⚠️ Видео превышает лимит загрузки Discord (25 МБ). Используй кнопку ниже для просмотра и скачивания:',
        components: [container, row],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const attachment = new AttachmentBuilder(data.buffer, {
      name: `tiktok_${Date.now()}.mp4`,
      description: data.title.slice(0, 100),
    });

    await interaction.editReply({
      content: `🎬 **${data.title.slice(0, 100)}** (автор: @${data.author})`,
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    console.error('[tiktok] Command error:', err);
    const errorBox = new ContainerBuilder()
      .setAccentColor(0xef4444)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ⚠️ Ошибка загрузки\nНе удалось скачать видео: ${err.message || 'попробуй позже'}`,
        ),
      );
    await interaction.editReply({
      components: [errorBox],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

/**
 * Обработка ссылок в обычном чате
 */
async function handleChatMessage(message) {
  if (!message || message.author?.bot || !message.content) return;

  const url = extractTikTokUrl(message.content);
  if (!url) return;

  // Защита от дублей
  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);
  if (processedMessages.size > 200) {
    const first = processedMessages.values().next().value;
    processedMessages.delete(first);
  }

  const now = Date.now();
  const lastUserTime = lastProcessedByUser.get(message.author.id) || 0;
  if (now - lastUserTime < COOLDOWN_MS) return;
  lastProcessedByUser.set(message.author.id, now);

  try {
    if (message.channel && typeof message.channel.sendTyping === 'function') {
      message.channel.sendTyping().catch(() => {});
    }

    const data = await downloadTikTok(url);
    const container = buildTikTokContainer(data, `<@${message.author.id}>`);

    if (data.tooLarge) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('📥 Скачать видео (HD)')
          .setStyle(ButtonStyle.Link)
          .setURL(data.downloadUrl),
      );
      await message.reply({
        content: '⚠️ Видео превышает лимит загрузки Discord (25 МБ). Ссылка без водяного знака:',
        components: [container, row],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const attachment = new AttachmentBuilder(data.buffer, {
      name: `tiktok_${Date.now()}.mp4`,
      description: data.title.slice(0, 100),
    });

    await message.reply({
      content: `🎬 **${data.title.slice(0, 100)}** (автор: @${data.author})`,
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { repliedUser: false },
    });

    // Пытаемся скрыть стандартный ембед дискорда у оригинального сообщения
    if (message.suppressEmbeds && typeof message.suppressEmbeds === 'function') {
      message.suppressEmbeds(true).catch(() => {});
    }
  } catch (err) {
    console.error('[tiktok] Chat auto-download error:', err.message);
  }
}

function registerTikTok(client) {
  client.handleTikTok = handleTikTokCommand;
  client.on('messageCreate', handleChatMessage);
}

module.exports = {
  registerTikTok,
  handleTikTokCommand,
  handleChatMessage,
  buildTikTokContainer,
};
