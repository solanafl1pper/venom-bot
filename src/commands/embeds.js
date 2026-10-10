'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
} = require('discord.js');
const {
  totalPoints,
  worstTier,
  sentenceFromPoints,
  ratingFor,
  recordLine,
  plural,
  MAX_ARTICLES,
} = require('../engine');
const { tierInfo } = require('../data/articles');

const WINDOW_DAYS = 3;

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
    return '✨ *Чисто! Ни одной статьи.*';
  }
  return record
    .map((item, i) => `${i + 1}. **ст. ${item.article} ${item.part}** — ${item.title} · *${item.sanction}*`)
    .join('\n')
    .slice(0, 2000);
}

function buildSudContainer({ user, mention, isRecord }) {
  const record = user.current || [];
  const points = totalPoints(record);
  const tier = record.length ? tierInfo(worstTier(record)) : null;
  const color = isRecord ? COLORS.sheep : (record.length ? (tier ? tier.color : COLORS.base) : COLORS.clean);
  const best = user.bestCount || record.length;

  const container = new ContainerBuilder().setAccentColor(color);

  const lines = [`### ⚖️ Судимость · ${mention}`];
  if (isRecord) {
    lines.push(`🎉 **Новый рекорд: ${record.length} ${plural(record.length, 'статья', 'статьи', 'статей')}!**\n`);
  }
  lines.push(articlesField(record));

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const stats = `📊 Статей: **${record.length} из ${MAX_ARTICLES}** · Срок: **${sentenceFromPoints(points)}** · Рекорд: **${best}**`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(stats));

  return container;
}

function buildCooldownContainer({ user, mention, waitMs }) {
  const record = user.current || [];
  const best = user.bestCount || record.length;
  const container = new ContainerBuilder().setAccentColor(COLORS.warn);

  const text = [
    `### ⏳ Кулдаун · ${mention}`,
    `Подожди ещё **${fmtDuration(waitMs)}** перед новой попыткой.`,
    `📊 В деле: **${record.length}/${MAX_ARTICLES}** · Рекорд: **${best}**`,
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return container;
}

function buildTopContainer(storage, users) {
  const container = new ContainerBuilder().setAccentColor(COLORS.accent);

  let rowsText = 'Пока пусто ✨ Ни у кого нет судимостей.';
  if (users.length > 0) {
    const rows = users.map((u, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      return `${medal} <@${u.userId}> — **${ratingFor(u)}** очков · ${recordLine(u.current)} (рекорд: ${u.bestCount || 0})`;
    });
    rowsText = rows.join('\n');
  }

  const header = `### 🏆 Топ судимостей\n${rowsText}`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

  const s = storage.stats();
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`👥 В базе: **${s.users}** · Осуждено: **${s.convicted}** · Рекорд: **${s.bestCount} ст.**`),
  );

  return container;
}

function buildHelpContainer() {
  const container = new ContainerBuilder().setAccentColor(COLORS.base);

  const text = [
    '### 🤖 Команды бота',
    '• **/судимость** [@участник] — проверить судимость',
    '• **/рейтинг** — топ по статьям',
    '• **/войс** [@участник] — время в голосовых каналах',
    '• **/войстоп** — топ любителей поболтать',
    '• **/2048** — сыграть в 2048',
    '• **/погода** [город] — погода за окном',
    '• **/рандом** — состав на Доту 2',
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('💬 Триггеры: **рпп**, **победа**, **3 слова победы**, **аллах**'),
  );

  return container;
}

module.exports = {
  buildSudContainer,
  buildCooldownContainer,
  buildTopContainer,
  buildHelpContainer,
  // Обратная совместимость с именами embed
  buildSudEmbed: buildSudContainer,
  buildCooldownEmbed: buildCooldownContainer,
  buildTopEmbed: buildTopContainer,
  buildHelpEmbed: buildHelpContainer,
  fmtDuration,
  fmtDate,
  COLORS,
};