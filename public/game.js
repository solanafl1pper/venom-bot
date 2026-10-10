'use strict';

const CLIENT_ID = '1558214657137975357';
const SIZE = 4;

let discordSdk = null;
let currentUser = {
  id: 'guest',
  username: 'Игрок',
  avatar: null,
};

let board = [];
let score = 0;
let bestScore = 0;
let isGameOver = false;

// DOM Elements
const boardEl = document.getElementById('board');
const tileContainer = document.getElementById('tileContainer');
const currentScoreEl = document.getElementById('currentScore');
const bestScoreEl = document.getElementById('bestScore');
const btnNewGame = document.getElementById('btnNewGame');
const btnMenu = document.getElementById('btnMenu');
const btnOverlayRestart = document.getElementById('btnOverlayRestart');
const btnCloseMenu = document.getElementById('btnCloseMenu');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const overlayScoreEl = document.getElementById('overlayScore');
const menuOverlay = document.getElementById('menuOverlay');

const userNameEl = document.getElementById('userName');
const userAvatarEl = document.getElementById('userAvatar');
const userStatusEl = document.getElementById('userStatus');

/* ========================================================
   1. Discord Embedded App SDK Integration
======================================================== */
async function initDiscord() {
  try {
    const { DiscordSDK } = await import('https://esm.sh/@discord/embedded-app-sdk');
    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();

    // Авторизация в Discord
    const { code } = await discordSdk.commands.authorize({
      client_id: CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds.members.read'],
    });

    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (res.ok) {
      const { access_token } = await res.json();
      await discordSdk.commands.authenticate({ access_token });
    }

    if (discordSdk.user) {
      currentUser.id = discordSdk.user.id;
      currentUser.username = discordSdk.user.username;
      if (discordSdk.user.avatar) {
        currentUser.avatar = `https://cdn.discordapp.com/avatars/${discordSdk.user.id}/${discordSdk.user.avatar}.png?size=128`;
      }
    }

    updateUserUI();
    fetchUserBestScore();
  } catch (err) {
    console.log('[Discord SDK] Работаем в обычном веб-режиме:', err.message);
    if (userStatusEl) userStatusEl.textContent = 'Веб-версия';
    const saved = localStorage.getItem('2048_best');
    if (saved) setBestScore(parseInt(saved, 10));
  }
}

function updateUserUI() {
  if (userNameEl) userNameEl.textContent = currentUser.username;
  if (currentUser.avatar && userAvatarEl) {
    userAvatarEl.src = currentUser.avatar;
  }
  if (userStatusEl) {
    userStatusEl.textContent = currentUser.id === 'guest' ? 'Гость' : 'Discord Activity';
  }
}

async function fetchUserBestScore() {
  if (currentUser.id === 'guest') return;
  try {
    const res = await fetch(`/api/score?userId=${currentUser.id}`);
    if (res.ok) {
      const data = await res.json();
      if (data.best) setBestScore(data.best);
    }
  } catch {
    /* оффлайн */
  }
}

async function syncBestScoreWithBot(newScore) {
  if (currentUser.id === 'guest') {
    localStorage.setItem('2048_best', String(newScore));
    return;
  }

  try {
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        username: currentUser.username,
        score: newScore,
      }),
    });
  } catch (err) {
    console.error('Ошибка синхронизации очков:', err);
  }
}

function setBestScore(val) {
  bestScore = val;
  if (bestScoreEl) bestScoreEl.textContent = val;
}

/* ========================================================
   2. 2048 Engine
======================================================== */
function initGame() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  score = 0;
  isGameOver = false;
  currentScoreEl.textContent = '0';
  gameOverOverlay.classList.add('hidden');
  menuOverlay.classList.add('hidden');

  spawnTile();
  spawnTile();
  renderBoard();
}

function spawnTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c] === 0) empty.push({ r, c });
    }
  }
  if (!empty.length) return;
  const { r, c } = empty[Math.floor(Math.random() * empty.length)];
  board[r][c] = Math.random() < 0.9 ? 2 : 4;
}

function getCellMetrics() {
  const rect = boardEl.getBoundingClientRect();
  const isMobile = window.innerWidth <= 400;
  const gap = isMobile ? 8 : 12;
  const padding = isMobile ? 8 : 12;
  const cellSize = (rect.width - padding * 2 - gap * (SIZE - 1)) / SIZE;
  return { gap, padding, cellSize };
}

function renderBoard(mergedCoords = []) {
  tileContainer.innerHTML = '';
  const { gap, cellSize } = getCellMetrics();

  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const val = board[r][c];
      if (val === 0) continue;

      const tile = document.createElement('div');
      const cls = val <= 2048 ? `tile-${val}` : 'tile-super';
      tile.className = `tile ${cls}`;
      if (mergedCoords.some((m) => m.r === r && m.c === c)) {
        tile.classList.add('merged');
      }

      const x = c * (cellSize + gap);
      const y = r * (cellSize + gap);
      tile.style.transform = `translate(${x}px, ${y}px)`;
      tile.style.width = `${cellSize}px`;
      tile.style.height = `${cellSize}px`;
      tile.textContent = val;
      tileContainer.appendChild(tile);
    }
  }
}

function moveLine(line) {
  const filtered = line.filter((v) => v !== 0);
  const out = [];
  let gained = 0;
  const merges = [];

  for (let i = 0; i < filtered.length; i += 1) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const mergedVal = filtered[i] * 2;
      out.push(mergedVal);
      gained += mergedVal;
      merges.push(out.length - 1);
      i += 1;
    } else {
      out.push(filtered[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { line: out, gained, merges };
}

function move(dir) {
  if (isGameOver) return;
  let changed = false;
  let gained = 0;
  const mergedCoords = [];

  if (dir === 'left') {
    for (let r = 0; r < SIZE; r += 1) {
      const res = moveLine(board[r]);
      gained += res.gained;
      if (res.line.some((v, c) => v !== board[r][c])) changed = true;
      board[r] = res.line;
      res.merges.forEach((c) => mergedCoords.push({ r, c }));
    }
  } else if (dir === 'right') {
    for (let r = 0; r < SIZE; r += 1) {
      const reversed = board[r].slice().reverse();
      const res = moveLine(reversed);
      gained += res.gained;
      const finalLine = res.line.reverse();
      if (finalLine.some((v, c) => v !== board[r][c])) changed = true;
      board[r] = finalLine;
      res.merges.forEach((c) => mergedCoords.push({ r, c: SIZE - 1 - c }));
    }
  } else if (dir === 'up') {
    for (let c = 0; c < SIZE; c += 1) {
      const col = [board[0][c], board[1][c], board[2][c], board[3][c]];
      const res = moveLine(col);
      gained += res.gained;
      for (let r = 0; r < SIZE; r += 1) {
        if (board[r][c] !== res.line[r]) changed = true;
        board[r][c] = res.line[r];
      }
      res.merges.forEach((r) => mergedCoords.push({ r, c }));
    }
  } else if (dir === 'down') {
    for (let c = 0; c < SIZE; c += 1) {
      const col = [board[3][c], board[2][c], board[1][c], board[0][c]];
      const res = moveLine(col);
      gained += res.gained;
      const finalCol = res.line.reverse();
      for (let r = 0; r < SIZE; r += 1) {
        if (board[r][c] !== finalCol[r]) changed = true;
        board[r][c] = finalCol[r];
      }
      res.merges.forEach((r) => mergedCoords.push({ r: SIZE - 1 - r, c }));
    }
  }

  if (changed) {
    score += gained;
    currentScoreEl.textContent = score;

    if (score > bestScore) {
      setBestScore(score);
      syncBestScoreWithBot(score);
    }

    spawnTile();
    renderBoard(mergedCoords);

    if (checkGameOver()) {
      isGameOver = true;
      showGameOver();
    }
  }
}

function checkGameOver() {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c] === 0) return false;
      if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return false;
      if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return false;
    }
  }
  return true;
}

function showGameOver() {
  overlayScoreEl.textContent = score;
  gameOverOverlay.classList.remove('hidden');
}

/* ========================================================
   3. Input Controls (Keyboard + Touch Swipes)
======================================================== */
window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
    case 'ф':
    case 'Ф':
      e.preventDefault();
      move('left');
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
    case 'в':
    case 'В':
      e.preventDefault();
      move('right');
      break;
    case 'ArrowUp':
    case 'w':
    case 'W':
    case 'ц':
    case 'Ц':
      e.preventDefault();
      move('up');
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
    case 'ы':
    case 'Ы':
      e.preventDefault();
      move('down');
      break;
  }
});

let touchStartX = 0;
let touchStartY = 0;

boardEl.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  },
  { passive: true },
);

boardEl.addEventListener(
  'touchend',
  (e) => {
    if (!touchStartX || !touchStartY) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) > 25) {
      if (absX > absY) {
        move(dx > 0 ? 'right' : 'left');
      } else {
        move(dy > 0 ? 'down' : 'up');
      }
    }
    touchStartX = 0;
    touchStartY = 0;
  },
  { passive: true },
);

btnNewGame.addEventListener('click', initGame);
btnOverlayRestart.addEventListener('click', initGame);

btnMenu.addEventListener('click', () => {
  menuOverlay.classList.remove('hidden');
});

btnCloseMenu.addEventListener('click', () => {
  menuOverlay.classList.add('hidden');
});

window.addEventListener('resize', () => renderBoard());

// Старт
initDiscord();
initGame();
