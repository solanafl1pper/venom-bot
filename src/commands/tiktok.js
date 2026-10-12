'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
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

function buildCaption(data) {
  const durStr = data.duration ? ` · ⏱️ \`${formatDuration(data.duration)}\`` : '';
  const sizeMb = (data.buffer.length / (1024 * 1024)).toFixed(1);
  return (
    `🎬 **${data.title.slice(0, 120)}**\n` +
    `👤 Автор: **@${data.author}**${durStr} · 💾 \`${sizeMb} MB\` · 💧 *Без водяного знака*`
  );
}

/**
 * Обработка слеш-команды /tiktok
 */
async function handleTikTokCommand(interaction) {
  const inputUrl = interaction.options.getString('ссылка');
  const targetUrl = extractTikTokUrl(inputUrl);

  if (!targetUrl) {
    await interaction.editReply({
      content:
        '⚠️ **Неверная ссылка**: укажи корректную ссылку на видео TikTok (например, `https://vt.tiktok.com/...` или `https://www.tiktok.com/@user/video/...`)!',
    });
    return;
  }

  try {
    const data = await downloadTikTok(targetUrl);

    if (data.tooLarge) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('📥 Скачать видео (HD)')
          .setStyle(ButtonStyle.Link)
          .setURL(data.downloadUrl),
      );
      await interaction.editReply({
        content: `⚠️ Видео **${data.title.slice(0, 100)}** превышает лимит загрузки Discord (25 МБ).\nСкачать без водяного знака:`,
        components: [row],
      });
      return;
    }

    const attachment = new AttachmentBuilder(data.buffer, {
      name: `tiktok_${Date.now()}.mp4`,
      description: data.title.slice(0, 100),
    });

    await interaction.editReply({
      files: [attachment],
    });
  } catch (err) {
    console.error('[tiktok] Command error:', err);
    await interaction.editReply({
      content: `⚠️ Не удалось скачать видео: ${err.message || 'попробуй позже'}`,
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

    if (data.tooLarge) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('📥 Скачать видео (HD)')
          .setStyle(ButtonStyle.Link)
          .setURL(data.downloadUrl),
      );
      await message.reply({
        content: `⚠️ Видео **${data.title.slice(0, 100)}** превышает лимит загрузки Discord (25 МБ).\nСкачать без водяного знака:`,
        components: [row],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const attachment = new AttachmentBuilder(data.buffer, {
      name: `tiktok_${Date.now()}.mp4`,
      description: data.title.slice(0, 100),
    });

    await message.reply({
      files: [attachment],
      allowedMentions: { repliedUser: false },
    });

    // Скрываем стандартный embed превью Discord для исходной ссылки
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
  buildCaption,
};
