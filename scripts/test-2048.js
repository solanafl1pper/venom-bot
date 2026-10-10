'use strict';

/**
 * Проверка логики 2048.
 * Запуск: node scripts/test-2048.js
 */

const g = require('../src/games/game2048');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

// Детерминированный генератор: всегда первая свободная клетка.
function firstFree() {
  let n = 0;
  return () => (n++ === 0 ? 0 : 0.5);
}

console.log('\nСлайд линии:');
check(
  'влево без слияния',
  JSON.stringify(g.moveLine([0, 2, 0, 4]).line) === JSON.stringify([2, 4, 0, 0]),
  JSON.stringify(g.moveLine([0, 2, 0, 4])),
);
check(
  'влево со слиянием',
  JSON.stringify(g.moveLine([2, 2, 0, 0]).line) === JSON.stringify([4, 0, 0, 0]),
  JSON.stringify(g.moveLine([2, 2, 0, 0])),
);
check('очки за слияние', g.moveLine([2, 2, 0, 0]).gained === 4);
check(
  'каскад не сливается в один ход',
  JSON.stringify(g.moveLine([2, 2, 2, 2]).line) === JSON.stringify([4, 4, 0, 0]),
  JSON.stringify(g.moveLine([2, 2, 2, 2])),
);
check(
  'каскад + очки',
  g.moveLine([2, 2, 2, 2]).gained === 8,
  String(g.moveLine([2, 2, 2, 2]).gained),
);
check(
  'влево не трогает правый край',
  JSON.stringify(g.moveLine([2, 2, 2, 4]).line) === JSON.stringify([4, 2, 4, 0]),
  JSON.stringify(g.moveLine([2, 2, 2, 4])),
);

console.log('\nХоды по полю:');
const b1 = [
  2, 2, 0, 0,
  0, 4, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
];
{
  const r = g.move(b1, 'left');
  check('влево двигает поле', r.moved);
  check('первая строка слилась', r.board[0] === 4, String(r.board[0]));
  check('очки начислены', r.gained === 4, String(r.gained));
}
{
  const r = g.move(b1, 'right');
  check('вправо прижимает к правому краю', r.board[3] === 4, String(r.board[3]));
}

console.log('\nВертикальные ходы:');
const b2 = [
  2, 0, 0, 0,
  2, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
];
{
  const r = g.move(b2, 'up');
  check('вверх двигает поле', r.moved);
  check('вверх сливает в вершину', r.board[0] === 4, String(r.board[0]));
  check('вверх начисляет очки', r.gained === 4, String(r.gained));
  check('вверх: нижняя клетка пуста', r.board[4] === 0, String(r.board[4]));
}
{
  const r = g.move(b2, 'down');
  check('вниз двигает поле', r.moved);
  check('вниз сливает в низ', r.board[12] === 4, String(r.board[12]));
  check('вниз начисляет очки', r.gained === 4, String(r.gained));
}
{
  const r = g.move(b1, 'up');
  check('вверх по горизонтальной паре — хода нет', r.moved === false);
}

console.log('\nСимметрия направлений:');
{
  const start = [
    2, 0, 2, 0,
    0, 4, 0, 8,
    0, 0, 16, 0,
    2, 2, 2, 2,
  ];
  const left = g.move(start, 'left').board;
  const mirrored = start.map((v, i) => v); // тот же массив
  const right = g.move(mirrored, 'right').board;
  // Строка 2 2 2 2: влево → [4,4,0,0], вправо → [0,0,4,4]
  check('строка из двоек влево', JSON.stringify(left.slice(12)) === JSON.stringify([4, 4, 0, 0]), JSON.stringify(left.slice(12)));
  check('строка из двоек вправо', JSON.stringify(right.slice(12)) === JSON.stringify([0, 0, 4, 4]), JSON.stringify(right.slice(12)));
}

console.log('\nХод без изменений:');
{
  const full = new Array(16).fill(2);
  // Забиваем поле так, чтобы ни одно направление не двигало.
  const stuck = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ];
  for (const dir of ['up', 'down', 'left', 'right']) {
    check(`нет хода: ${dir}`, g.move(stuck, dir).moved === false, `поля: ${stuck.length}`);
  }
  const state = { board: stuck, score: 10, moves: 3 };
  const res = g.applyMove(state, 'left');
  check('applyMove не меняет состояние', res.changed === false);
  check('счёт не меняется', res.state.score === 10);
  check('ходы не считаются', res.state.moves === 3);
  check('поле не мутируется', JSON.stringify(state.board) === JSON.stringify(stuck));
  void full;
}

console.log('\nПоявление плиток:');
{
  const empty = g.emptyBoard();
  const withTile = g.spawn(empty, () => 0.5);
  check('плитка появилась', withTile.filter((v) => v !== 0).length === 1, JSON.stringify(withTile));
  check('значение 2 или 4', [2, 4].includes(withTile.find((v) => v !== 0)), JSON.stringify(withTile));
}
{
  const full = new Array(16).fill(2);
  check('на полном поле новая плитка не падает', JSON.stringify(g.spawn(full)) === JSON.stringify(full));
}
{
  // 20 запусков — всегда ровно одна новая плитка
  let ok = true;
  for (let i = 0; i < 20; i += 1) {
    const b = g.emptyBoard();
    const filled = g.spawn(b);
    if (filled.filter((v) => v !== 0).length !== 1) ok = false;
  }
  check('ровно одна плитка за раз', ok);
}

console.log('\nНовая игра:');
{
  const game = g.createGame();
  check('два хода на старте', game.board.filter((v) => v !== 0).length === 2, JSON.stringify(game.board));
  check('счёт ноль', game.score === 0);
  check('ходов ноль', game.moves === 0);
  check('размер поля 16', game.board.length === 16);
}

console.log('\nКонец игры:');
{
  const stuck = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ];
  check('нет ходов', g.hasMoves(stuck) === false);
  const full = new Array(16).fill(2);
  check('на полном поле ходы есть (есть пара)', g.hasMoves(full) === true);
  const withFree = g.emptyBoard();
  withFree[0] = 2;
  check('есть пустая клетка — ход есть', g.hasMoves(withFree) === true);
  check('максимум плитки', g.bestTile([0, 2048, 0, 4].concat(new Array(12).fill(0))) === 2048);
}

console.log('\nИгра целиком до проигрыша:');
{
  // Играем на фиксированных ходах, пока не закончится.
  const state = g.createGame(() => 0.99);
  let steps = 0;
  let over = false;
  const dirs = ['left', 'up', 'right', 'down'];
  while (!over && steps < 500) {
    const res = g.applyMove(state, dirs[steps % 4], () => 0.99);
    if (res.changed) Object.assign(state, res.state);
    over = res.gameOver;
    steps += 1;
    if (steps > 1 && res.changed === false && res.gameOver) break;
  }
  check('игра доходит до конца', over === true, `шагов ${steps}`);
  check('счёт растёт', state.score > 0, String(state.score));
  check('ходов больше нуля', state.moves > 0, String(state.moves));
  console.log(`  сыграно ${steps} ходов, счёт ${state.score}, максимум ${g.bestTile(state.board)}`);
}

console.log('\nОтрисовка:');
{
  const board = g.emptyBoard();
  board[0] = 2;
  board[5] = 4;
  board[10] = 64;
  board[15] = 2048;
  const art = g.render(board);
  console.log(art.split('\n').map((l) => `  |${l}|`).join('\n'));
  check('верхняя рамка', art.startsWith('┌'));
  check('нижняя рамка', art.endsWith('┘'));
  check('строк поля ровно 4', art.split('\n').filter((l) => l.startsWith('│')).length === 4, String(art.split('\n').filter((l) => l.startsWith('│')).length));
  check('рамок 5', art.split('\n').filter((l) => l.startsWith('┌') || l.startsWith('├') || l.startsWith('└')).length === 5);
  check('два числа видны', art.includes('2') && art.includes('2048'));
  check('пустая клетка точка', art.includes('·'));

  // Все линии одной ширины — иначе таблица разъедется.
  const widths = new Set(art.split('\n').map((l) => g.displayWidth(l)));
  check('все строки одной ширины', widths.size === 1, JSON.stringify([...widths]));
}

console.log(failures === 0 ? '\nВсе проверки пройдены.\n' : `\nПровалено проверок: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);