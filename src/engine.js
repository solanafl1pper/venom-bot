'use strict';

const { pickArticles, pointsOf, tierInfo, ARTICLES } = require('./data/articles');
const { DAY_MS } = require('./storage');

const MAX_ARTICLES = 15;
// Рейтинг учитывает лучший результат за последние трое суток.
const RATING_WINDOW_MS = 3 * DAY_MS;
const SAMPLE_LIMIT = 200;
// Между попытками словить судимость — 15 минут.
const COOLDOWN_MS = 15 * 60 * 1000;

function sentenceFromPoints(points) {
  if (points <= 0) return 'условный срок';
  const years = Math.min(25, Math.max(1, Math.round(points * 1.2)));
  return pluralYears(years);
}

function pluralYears(n) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} лет`;
  if (mod10 === 1) return `${n} год`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} года`;
  return `${n} лет`;
}

function plural(n, one, few, many) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function totalPoints(record) {
  if (!record || !record.length) return 0;
  return record.reduce((sum, item) => sum + item.points, 0);
}

function worstTier(record) {
  if (!record || !record.length) return null;
  const order = ['minor', 'medium', 'heavy', 'extreme'];
  return record.reduce((worst, item) => {
    return order.indexOf(item.tier) > order.indexOf(worst) ? item.tier : worst;
  }, 'minor');
}

function statusLine(record) {
  const points = totalPoints(record);
  if (points === 0) return '✨ Чист перед законом — святой человек';
  const tier = tierInfo(worstTier(record));
  return `${points} ${plural(points, 'очко', 'очка', 'очков')} тяжести · ${tier.name}`;
}

/**
 * Рейтинг участника: жёсткость срока (очки статей) плюс число судимостей.
 * Именно по нему сортируется /рейтинг.
 */
function rating(record) {
  if (!record || record.length === 0) return 0;
  return totalPoints(record) + record.length * 5;
}

function recordLine(record) {
  const n = record ? record.length : 0;
  return `${n} ${plural(n, 'статья', 'статьи', 'статей')}`;
}

/** Запоминает текущий результат, чтобы поймать пик за окно в трое суток. */
function recordSample(user, now = Date.now()) {
  if (!user.samples) user.samples = [];
  user.samples = user.samples.filter((s) => now - s.at <= RATING_WINDOW_MS);
  user.samples.push({
    at: now,
    rating: rating(user.current),
    points: totalPoints(user.current),
    articles: (user.current || []).length,
  });
  if (user.samples.length > SAMPLE_LIMIT) user.samples = user.samples.slice(-SAMPLE_LIMIT);
}

/** Лучший результат за последние трое суток. Давнее в зачёт не идёт. */
function ratingFor(user, now = Date.now()) {
  const fresh = (user.samples || []).filter((s) => now - s.at <= RATING_WINDOW_MS);
  if (fresh.length === 0) return rating(user.current);
  return fresh.reduce((max, s) => (s.rating > max ? s.rating : max), 0);
}

/**
 * Свежий розыгрыш: сколько статей выпадет на этот раз (от 1 до MAX_ARTICLES).
 */
function rollCount(rng = Math.random) {
  return 1 + Math.floor(rng() * MAX_ARTICLES);
}

/**
 * Каждый вызов команды — это новый розыгрыш: выпадает от 1 до MAX_ARTICLES
 * случайных статей, прошлый набор полностью заменяется. Если статей выпало
 * больше, чем когда-либо раньше, — это новый рекорд.
 */
function rollNew(user, rng = Math.random, now = Date.now()) {
  const count = rollCount(rng);
  const fresh = pickArticles(count, rng);
  const record = fresh.map((a) => ({
    article: a.article,
    part: a.part,
    title: a.title,
    sanction: a.sanction,
    tier: a.tier,
    points: pointsOf(a.tier),
  }));

  user.rolls = (user.rolls || 0) + 1;
  user.lastRollAt = now;
  user.current = record;

  const isRecord = record.length > (user.bestCount || 0);
  if (isRecord) user.bestCount = record.length;

  const points = totalPoints(record);
  if (points > (user.bestPoints || 0)) user.bestPoints = points;

  recordSample(user, now);

  user.history.unshift({
    at: now,
    articles: record.map((r) => `${r.article} ${r.part} УК РФ`),
    points,
    count: record.length,
    record: isRecord,
    total: record.length,
  });
  user.history = user.history.slice(0, 20);

  return {
    record,
    rolled: true,
    added: record,
    count: record.length,
    isRecord,
    bestCount: user.bestCount,
    bestPoints: user.bestPoints,
  };
}

function historyLine(entry) {
  return `${entry.articles.join(', ')} (${entry.points})`;
}

module.exports = {
  rollNew,
  rollCount,
  totalPoints,
  worstTier,
  statusLine,
  sentenceFromPoints,
  rating,
  ratingFor,
  recordSample,
  recordLine,
  plural,
  pluralYears,
  historyLine,
  MAX_ARTICLES,
  COOLDOWN_MS,
  RATING_WINDOW_MS,
  ARTICLES_COUNT: ARTICLES.length,
};