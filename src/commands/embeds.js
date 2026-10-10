'use strict';

const { EmbedBuilder } = require('discord.js');
const { totalPoints, worstTier, statusLine, sentenceFromPoints, ratingFor, recordLine, plural, MAX_ARTICLES } = require('../engine');
const { tierInfo } = require('../data/articles');

const WINDOW_DAYS = 3;

// Мягкая палитра «дружеского бота» — без мрачных оттенков.
const COLORS = {
  base: 0x5865f2,
  sheep: 0xfacc15,
  zov: 0xa78bfa,
  clean: 0x34d399,
  warn: 0xfb7185,
};

function fmtDuration(ms) {
  if (ms <= 0) return 'сейчас';
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0
      ? `${d} ${plural(d, 'день', 'дня', 'дней')} ${rh} ч`
      : `${d} ${plural(d, 'день', 'дня', 'дней')}`;
  }
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
    return '✨ Чисто. Ни одной статьи, все сроки истекли.';
  }
  const shown = record
    .map((item, i) => {
      const tier = tierInfo(item.tier);
      return `${i + 1}. 📕 **${item.article} ${item.part}** — ${item.title}\n　 ${item.sanction} · ${tier.name}`;
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
    .setAuthor({ name: 'у нас тут своя судимость' })
    .setDescription(`${mention}`)
    .addFields(
      { name: '📖 Статьи', value: articlesField(record).slice(0, 1024) },
      { name: 'Итог', value: statusLine(record), inline: true },
      { name: 'Срок', value: sentenceFromPoints(points), inline: true },
      { name: '📚 Судимостей', value: `${record.length} из ${MAX_ARTICLES}`, inline: true },
      { name: '🏆 Рекорд', value: `${best} ${plural(best, 'статья', 'статьи', 'статей')}`, inline: true },
    )
    .setFooter({
      text: `рейтинг ${ratingFor(user)} за ${WINDOW_DAYS} дня · попытка №${user.rolls || 0}`,
    })
    .setTimestamp();

  if (isRecord) {
    embed.addFields({
      name: '🏆 НОВЫЙ РЕКОРД',
      value: `Ты словил **${record.length}** ${plural(record.length, 'статью', 'статьи', 'статей')} — больше, чем когда-либо!`,
    });
  }

  return embed;
}

function buildCooldownEmbed({ user, mention, waitMs }) {
  const record = user.current || [];
  const best = user.bestCount || record.length;
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setAuthor({ name: 'у нас тут своя судимость' })
    .setDescription(`${mention} ⏳ **Кулдаун.**`)
    .addFields(
      { name: '⏳ До новой попытки', value: fmtDuration(waitMs), inline: true },
      { name: '📚 Сейчас в деле', value: `${record.length} из ${MAX_ARTICLES}`, inline: true },
      { name: '🏆 Рекорд', value: `${best} ${plural(best, 'статья', 'статьи', 'статей')}`, inline: true },
    )
    .setFooter({ text: 'новая попытка будет доступна через 15 минут' })
    .setTimestamp();
}

function buildTopEmbed(storage, users) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle('🏆 Топ судимости')
    .setDescription(`Лучший результат за последние ${WINDOW_DAYS} дня`);

  if (users.length === 0) {
    embed.addFields({ name: 'Пока пусто', value: 'Никто ещё ни разу не погорел.' });
  } else {
    const rows = users.map((u, i) => {
      const points = totalPoints(u.current);
      const score = ratingFor(u);
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      return (
        `${medal} <@${u.userId}> — **${score}** очк\n` +
        `　 срок ${sentenceFromPoints(points)} · ${recordLine(u.current)} · 🏆${u.bestCount || 0}`
      );
    });
    embed.addFields({ name: 'Рейтинг', value: rows.join('\n').slice(0, 1024) });
  }

  const s = storage.stats();
  embed.setFooter({
    text: `всего: ${s.users} · с судимостью: ${s.convicted} · рекорд: ${s.bestCount} ст.`,
  });

  return embed;
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.base)
    .setTitle('Как тут всё устроено')
    .setDescription(
      `Каждый вызов /судимость — свежий розыгрыш: выпадает от 1 до ${MAX_ARTICLES} статей.\n` +
        `Побьёшь свой рекорд — попадёшь в /рейтинг. Кулдаун между попытками — 15 минут.`,
    )
    .addFields(
      { name: '/судимость', value: 'твоя судимость', inline: true },
      { name: '/судимость @user', value: 'судимость друга (с пингом)', inline: true },
      { name: '/рейтинг', value: 'топ-10 по строгости', inline: true },
      { name: '/2048', value: 'играть в 2048 кнопками', inline: true },
      { name: '/погода', value: 'погода в городе', inline: true },
      { name: '/погода Казань', value: 'погода в конкретном городе', inline: true },
      { name: '/рандом', value: 'случайный состав на Доту 2', inline: true },
    )
    .addFields({
      name: '🗣 Слова-триггеры',
      value:
        'Пишешь в чат **рпп**, **победа**, **3 слова победы** или **аллах** — ' +
        'бот отвечает сам. Регистр и точки не важны.',
    })
    .setFooter({ text: `бот для своих · ${fmtDate(Date.now())}` });
}

module.exports = { buildSudEmbed, buildCooldownEmbed, buildTopEmbed, buildHelpEmbed, fmtDuration, fmtDate, COLORS };