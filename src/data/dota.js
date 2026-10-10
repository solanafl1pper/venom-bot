'use strict';

/**
 * Герои Dota 2 с основными позициями.
 * pos: carry | mid | offlane | soft | hard
 */

const POSITIONS = {
  carry: { key: 'carry', label: 'Керри', lane: 'безопасная линия', emoji: '⚔️' },
  mid: { key: 'mid', label: 'Мид', lane: 'центр', emoji: '🔮' },
  offlane: { key: 'offlane', label: 'Оффлейн', lane: 'сложная линия', emoji: '🪨' },
  soft: { key: 'soft', label: 'Софт-саппорт', lane: 'своя линия', emoji: '🧡' },
  hard: { key: 'hard', label: 'Хард-саппорт', lane: 'своя линия', emoji: '❤️' },
};

const ORDER = ['carry', 'mid', 'offlane', 'soft', 'hard'];

const HEROES = [
  { name: 'Anti-Mage', pos: ['carry'] },
  { name: 'Juggernaut', pos: ['carry'] },
  { name: 'Slark', pos: ['carry'] },
  { name: 'Phantom Assassin', pos: ['carry'] },
  { name: 'Faceless Void', pos: ['carry'] },
  { name: 'Spectre', pos: ['carry'] },
  { name: 'Terrorblade', pos: ['carry'] },
  { name: 'Phantom Lancer', pos: ['carry'] },
  { name: 'Viper', pos: ['carry', 'mid'] },
  { name: 'Lifestealer', pos: ['carry'] },
  { name: 'Monkey King', pos: ['carry'] },
  { name: 'Sniper', pos: ['carry'] },
  { name: 'Luna', pos: ['carry'] },
  { name: 'Morphling', pos: ['carry', 'mid'] },
  { name: 'Windranger', pos: ['carry', 'offlane'] },
  { name: 'Zeus', pos: ['mid'] },
  { name: 'Puck', pos: ['mid'] },
  { name: 'Queen of Pain', pos: ['mid'] },
  { name: 'Storm Spirit', pos: ['mid'] },
  { name: 'Invoker', pos: ['mid'] },
  { name: 'Outworld Destroyer', pos: ['mid'] },
  { name: 'Templar Assassin', pos: ['mid'] },
  { name: 'Ember Spirit', pos: ['mid', 'carry'] },
  { name: 'Void Spirit', pos: ['mid'] },
  { name: 'Tiny', pos: ['mid', 'offlane'] },
  { name: 'Timbersaw', pos: ['offlane'] },
  { name: 'Earthshaker', pos: ['offlane', 'soft'] },
  { name: 'Brewmaster', pos: ['offlane'] },
  { name: 'Bristleback', pos: ['offlane'] },
  { name: 'Centaur Warrunner', pos: ['offlane'] },
  { name: 'Pudge', pos: ['offlane', 'soft'] },
  { name: 'Mars', pos: ['offlane'] },
  { name: 'Axe', pos: ['offlane'] },
  { name: 'Underlord', pos: ['offlane', 'soft'] },
  { name: 'Crystal Maiden', pos: ['soft', 'hard'] },
  { name: 'Lion', pos: ['soft'] },
  { name: 'Shadow Demon', pos: ['soft'] },
  { name: 'Ancient Apparition', pos: ['soft'] },
  { name: 'Witch Doctor', pos: ['soft'] },
  { name: 'Rubick', pos: ['soft'] },
  { name: 'Oracle', pos: ['soft'] },
  { name: "Nature's Prophet", pos: ['carry', 'soft'] },
  { name: 'Chen', pos: ['soft'] },
  { name: 'Warlock', pos: ['soft'] },
  { name: 'Disruptor', pos: ['hard'] },
  { name: "Disciple of Zeus", pos: ['hard'] },
  { name: 'Ogre Magi', pos: ['soft', 'hard'] },
  { name: 'Kotl', pos: ['hard'] },
  { name: 'Visage', pos: ['hard'] },
  { name: 'Bane', pos: ['hard'] },
];

function heroesFor(pos) {
  return HEROES.filter((h) => h.pos.includes(pos));
}

function pick(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

function pickMany(list, count, rng = Math.random) {
  const pool = list.slice();
  const out = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

module.exports = { POSITIONS, ORDER, HEROES, heroesFor, pick, pickMany };