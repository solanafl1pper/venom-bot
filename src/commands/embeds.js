'use strict';

const { EmbedBuilder } = require('discord.js');
const { totalPoints, worstTier, statusLine, sentenceFromPoints, ratingFor, recordLine, plural, MAX_ARTICLES } = require('../engine');
const { tierInfo } = require('../data/articles');

const WINDOW_DAYS = 3;

// Легкая, воздушная и дружелюбная палитра для лампового бота
const COLORS = {
  base: 0x818cf8,   // мягкий лавандово-индиго
  sheep: 0xfde047,  // солнечный теплый желтый
  zov: 0xc084fc,    // мягкий фиалковый
  clean: 0x34d399,  // свежая мята
  warn: 0xfca5a5,   // мягкий персиково-коралловый
  accent: 0x38bdf8, // легкий небесный
};

function fmtDuration(ms) {
  if (ms <= 0) return 'прямо сейчас';
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0
      ? `${d} ${plural(d, 'день', 'дня', 'дней')} ${rh} ч`
      : `${d} ${plural(d, 'день', 'дня', 'дней')}`;
  }
  if (h === 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
}

function fmtDate(ts) {
  if (!ts) return 'неизвестно';
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function articlesField(record) {
  if (!record || record.length === 0) {
    return '✨ *Чисто! Ни одной статьи, абсолютно чистая биография.*';
  }
  const shown = record
    .map((item, i) => {
      const tier = tierInfo(item.tier);
      return `${i + 1}. 📜 **ст. ${item.article} ${item.part}** · *${item.title}*\n　 ↳ ${item.sanction} (${tier.name})`;
    })
    .join('\n');
  return shown.slice(0, 1024);
}

function buildSudEmbed({ user, mention, isRecord, count }) {
  const record = user.current || [];
  const points = totalPoints(record);
  const tier = record.length ? tierInfo(worstTier(record)) : null;
  const color = tier ? tier.color : COLORS.clean;
  const best = user.bestCount || record.length;

  const embed = new EmbedBuilder()
    .setColor(isRecord ? COLORS.sheep : color)
    .setAuthor({ name: '☕ Уголок судимостей для своих' })
    .setDescription(`${mention}`)
    .addFields(
      { name: '📖 Статьи', value: articlesField(record).slice(0, 1024) },
      { name: '⚖️ Вердикт', value: statusLine(record), inline: true },
      { name: '⏳ Срок', value: sentenceFromPoints(points), inline: true },
      { name: '📚 Судимостей', value: `${record.length} из ${MAX_ARTICLES}`, inline: true },
      { name: '🏆 Рекорд', value: `${best} ${plural(best, 'статья', 'статьи', 'статей')}`, inline: true },
    )
    .setFooter({
      text: `рейтинг ${ratingFor(user)} за ${WINDOW_DAYS} дня · попытка #${user.rolls || 0} · чисто для своих`,
    })
    .setTimestamp();

  if (isRecord) {
    embed.addFields({
      name: '🏆 НОВЫЙ РЕКОРД',
      value: `🎉 Ого! Ты словил **${record.length}** ${plural(record.length, 'статью', 'статьи', 'статей')} — это новый рекорд в нашей тусовке!`,
    });
  }

  return embed;
}

function buildCooldownEmbed({ user, mention, waitMs }) {
  const record = user.current || [];
  const best = user.bestCount || record.length;
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setAuthor({ name: '☕ Уголок судимостей для своих' })
    .setDescription(`${mention} ⏳ **Кулдаун!**\nОтдыхаем от суда, наливай чаёк или иди играть в 2048.`)
    .addFields(
      { name: '⏳ До новой попытки', value: fmtDuration(waitMs), inline: true },
      { name: '📚 Сейчас в деле', value: `${record.length} из ${MAX_ARTICLES}`, inline: true },
      { name: '🏆 Рекорд', value: `${best} ${plural(best, 'статья', 'статьи', 'статей')}`, inline: true },
    )
    .setFooter({ text: '☕ Кулдаун 15 минут — чтобы судьи успели передохнуть' })
    .setTimestamp();
}

function buildTopEmbed(storage, users) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.accent)
    .setTitle('🏆 Топ судимости')
    .setDescription(`✨ Доска почёта нашего чата за последние ${WINDOW_DAYS} дня`);

  if (users.length === 0) {
    embed.addFields({
      name: 'Пока пусто ✨',
      value: 'Все чисты перед законом! Самое время кому-то крутануть /судимость.',
    });
  } else {
    const rows = users.map((u, i) => {
      const points = totalPoints(u.current);
      const score = ratingFor(u);
      const medal = ['🥇', '🥈', '🥉'][i] || `▫️ ${i + 1}.`;
      return (
        `${medal} <@${u.userId}> — **${score}** очков\n` +
        `　 ↳ срок: ${sentenceFromPoints(points)} · ${recordLine(u.current)} · 🏆 рекорд: ${u.bestCount || 0}`
      );
    });
    embed.addFields({ name: '🌟 Рейтинг компании', value: rows.join('\n').slice(0, 1024) });
  }

  const s = storage.stats();
  embed.setFooter({
    text: `своих ребят в базе: ${s.users} · на карандаше: ${s.convicted} · рекорд чата: ${s.bestCount} ст.`,
  });

  return embed;
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.base)
    .setTitle('✨ Уютная справка по боту')
    .setDescription(
      `Бот сделан специально для нашего круга друзей! Крутим судимости, соревнуемся в рекордах, залипаем в 2048 и раскидываем пати в Доту.\n\n` +
        `🎲 Каждый вызов **/судимость** — свежий розыгрыш: выпадает от 1 до ${MAX_ARTICLES} статей. Кулдаун — 15 минут.`,
    )
    .addFields(
      { name: '/судимость', value: 'испытать удачу (1–15 статей)', inline: true },
      { name: '/судимость @друг', value: 'проверить друга с пингом', inline: true },
      { name: '/рейтинг', value: 'доска почёта нашего чата', inline: true },
      { name: '/войс', value: 'сколько часов сидел в войсе', inline: true },
      { name: '/войстоп', value: 'топ любителей поболтать', inline: true },
      { name: '/2048', value: 'уютная залипалка кнопками', inline: true },
      { name: '/погода', value: 'как там за окном сейчас', inline: true },
      { name: '/погода Казань', value: 'погода в любом городе', inline: true },
      { name: '/рандом', value: 'собрать состав на Доту 2', inline: true },
    )
    .addFields({
      name: '🗣 Секретные триггеры',
      value:
        'Пиши в чат слова **рпп**, **победа**, **3 слова победы** или **аллах** — ' +
        'бот отвечает сам. Регистр и разделители не важны.',
    })
    .setFooter({ text: `ламповый бот для своих · ${fmtDate(Date.now())}` });
}

module.exports = { buildSudEmbed, buildCooldownEmbed, buildTopEmbed, buildHelpEmbed, fmtDuration, fmtDate, COLORS };