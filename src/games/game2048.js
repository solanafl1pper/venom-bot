'use strict';

/**
 * Ядро игры 2048 — чистая логика, без Discord.
 * Поле 4x4, хранится плоским массивом из 16 чисел, 0 — пусто.
 */

const SIZE = 4;
const CELLS = SIZE * SIZE;
const TARGET = 2048;

const DIRS = {
  left: 0,
  right: 1,
  up: 2,
  down: 3,
};

function emptyBoard() {
  return new Array(CELLS).fill(0);
}

/** Индекс клетки (i — номер линии, j — позиция в линии от края движения). */
function indexFor(i, j, dir) {
  switch (dir) {
    case 'left':
      return i * SIZE + j;
    case 'right':
      return i * SIZE + (SIZE - 1 - j);
    case 'up':
      return j * SIZE + i;
    case 'down':
      return (SIZE - 1 - j) * SIZE + i;
    default:
      throw new Error(`неизвестное направление: ${dir}`);
  }
}

/** Сдвиг одной линии к началу с однократным слиянием соседей. */
function moveLine(line) {
  const compact = line.filter((v) => v !== 0);
  const out = [];
  let gained = 0;

  for (let i = 0; i < compact.length; i += 1) {
    if (i + 1 < compact.length && compact[i] === compact[i + 1]) {
      const merged = compact[i] * 2;
      out.push(merged);
      gained += merged;
      i += 1;
    } else {
      out.push(compact[i]);
    }
  }
  while (out.length < SIZE) out.push(0);

  return { line: out, gained };
}

function move(board, dir) {
  const next = new Array(CELLS).fill(0);
  let gained = 0;

  for (let i = 0; i < SIZE; i += 1) {
    const line = [];
    for (let j = 0; j < SIZE; j += 1) line.push(board[indexFor(i, j, dir)]);
    const result = moveLine(line);
    gained += result.gained;
    for (let j = 0; j < SIZE; j += 1) next[indexFor(i, j, dir)] = result.line[j];
  }

  let moved = false;
  for (let i = 0; i < CELLS; i += 1) {
    if (next[i] !== board[i]) {
      moved = true;
      break;
    }
  }

  return { board: next, gained, moved };
}

/** Новая плитка в случайной пустой клетке: 90% двойка, 10% четвёрка. */
function spawn(board, rng = Math.random) {
  const free = [];
  for (let i = 0; i < CELLS; i += 1) if (board[i] === 0) free.push(i);
  if (free.length === 0) return board;

  const at = free[Math.floor(rng() * free.length)];
  const next = board.slice();
  next[at] = rng() < 0.9 ? 2 : 4;
  return next;
}

function hasMoves(board) {
  for (let i = 0; i < CELLS; i += 1) if (board[i] === 0) return true;
  for (let i = 0; i < SIZE; i += 1) {
    for (let j = 0; j < SIZE; j += 1) {
      const v = board[i * SIZE + j];
      if (j + 1 < SIZE && board[i * SIZE + j + 1] === v) return true;
      if (i + 1 < SIZE && board[(i + 1) * SIZE + j] === v) return true;
    }
  }
  return false;
}

function bestTile(board) {
  return board.reduce((max, v) => (v > max ? v : max), 0);
}

function createGame(rng = Math.random) {
  let board = emptyBoard();
  board = spawn(board, rng);
  board = spawn(board, rng);
  return { board, score: 0, moves: 0 };
}

/** Один ход. Если поле не изменилось — ход не засчитывается. */
function applyMove(state, dir, rng = Math.random) {
  if (!DIRS.hasOwnProperty(dir)) throw new Error(`неизвестное направление: ${dir}`);

  const result = move(state.board, dir);
  if (!result.moved) return { state, changed: false, gameOver: false };

  const next = {
    board: spawn(result.board, rng),
    score: state.score + result.gained,
    moves: state.moves + 1,
  };
  return { state: next, changed: true, gameOver: !hasMoves(next.board) };
}

// Ширина строки в терминальных колонках.
// Псевдографика ( рамки ─ │ ┌ ) занимает одну колонку,
// эмодзи и прочие символы выше U+2000 — две.
function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code >= 0x2500 && code <= 0x257f) w += 1;
    else if (code > 0x2000) w += 2;
    else w += 1;
  }
  return w;
}

function pad(str, width) {
  const left = Math.floor((width - displayWidth(str)) / 2);
  const right = width - displayWidth(str) - left;
  return `${' '.repeat(Math.max(0, left))}${str}${' '.repeat(Math.max(0, right))}`;
}

const CELL = 6;

function render(board) {
  const top = `┌${'─'.repeat(CELL)}┬${'─'.repeat(CELL)}┬${'─'.repeat(CELL)}┬${'─'.repeat(CELL)}┐`;
  const mid = `├${'─'.repeat(CELL)}┼${'─'.repeat(CELL)}┼${'─'.repeat(CELL)}┼${'─'.repeat(CELL)}┤`;
  const bottom = `└${'─'.repeat(CELL)}┴${'─'.repeat(CELL)}┴${'─'.repeat(CELL)}┴${'─'.repeat(CELL)}┘`;

  const rows = [];
  for (let i = 0; i < SIZE; i += 1) {
    const cells = [];
    for (let j = 0; j < SIZE; j += 1) {
      const v = board[i * SIZE + j];
      cells.push(` ${pad(v === 0 ? '·' : String(v), CELL - 2)} `);
    }
    rows.push(`│${cells.join('│')}│`);
  }

  return [top, ...rows.slice(0, 1), mid, ...rows.slice(1, 2), mid, ...rows.slice(2, 3), mid, ...rows.slice(3, 4), bottom]
    .join('\n');
}

module.exports = {
  SIZE,
  CELLS,
  TARGET,
  DIRS,
  emptyBoard,
  indexFor,
  moveLine,
  move,
  spawn,
  hasMoves,
  bestTile,
  createGame,
  applyMove,
  render,
  displayWidth,
};