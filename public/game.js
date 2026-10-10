'use strict';

const CLIENT_ID = '1558214657137975357';
const SIZE = 4;

let discordSdk = null;
let currentUser = {
  id: 'guest_' + Math.floor(Math.random() * 10000),
  username: 'Игрок',
  avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
};

let roomId = 'default_room';
let gameMode = 'solo'; // 'solo' | 'duel'
let duelPollTimer = null;

let board = []; // 4x4 array of tile objects: { id, value, r, c } or null
let tileIdSeq = 1;
const tileElements = new Map(); // id -> DOMElement

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
const btnThemeToggle = document.getElementById('btnThemeToggle');
const themeIconEl = document.getElementById('themeIcon');

const btnModeSolo = document.getElementById('btnModeSolo');
const btnModeDuel = document.getElementById('btnModeDuel');
const duelBar = document.getElementById('duelBar');
const myDuelAvatar = document.getElementById('myDuelAvatar');
const myDuelName = document.getElementById('myDuelName');
const myDuelScore = document.getElementById('myDuelScore');
const oppDuelAvatar = document.getElementById('oppDuelAvatar');
const oppDuelName = document.getElementById('oppDuelName');
const oppDuelScore = document.getElementById('oppDuelScore');
const duelStatusText = document.getElementById('duelStatusText');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const overlayScoreEl = document.getElementById('overlayScore');
const menuOverlay = document.getElementById('menuOverlay');
const userNameEl = document.getElementById('userName');
const userAvatarEl = document.getElementById('userAvatar');
const userStatusEl = document.getElementById('userStatus');

/* ========================================================
   1. Theme Management
======================================================== */
function initTheme() {
  const saved = localStorage.getItem('venom_2048_theme') || 'light';
  applyTheme(saved);

  btnThemeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('venom_2048_theme', newTheme);
  });
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    themeIconEl.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-theme');
    themeIconEl.textContent = '🌙';
  }
}

/* ========================================================
   2. Discord SDK & Score Sync
======================================================== */
async function initDiscord() {
  try {
    const { DiscordSDK } = await import('https://esm.sh/@discord/embedded-app-sdk');
    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();

    if (discordSdk.channelId) {
      roomId = discordSdk.channelId;
    }

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
    console.log('[Discord SDK] Локальный/веб режим:', err.message);
    if (userStatusEl) userStatusEl.textContent = 'Веб-версия';
    updateUserUI();
    const saved = localStorage.getItem('venom_2048_best');
    if (saved) setBestScore(parseInt(saved, 10));
  }
}

function updateUserUI() {
  if (userNameEl) userNameEl.textContent = currentUser.username;
  if (userAvatarEl) userAvatarEl.src = currentUser.avatar;
  if (myDuelAvatar) myDuelAvatar.src = currentUser.avatar;
  if (myDuelName) myDuelName.textContent = currentUser.username;
}

async function fetchUserBestScore() {
  if (currentUser.id.startsWith('guest_')) return;
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
  if (currentUser.id.startsWith('guest_')) {
    localStorage.setItem('venom_2048_best', String(newScore));
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
  } catch {
    /* оффлайн */
  }
}

function setBestScore(val) {
  bestScore = val;
  if (bestScoreEl) bestScoreEl.textContent = val;
}

/* ========================================================
   3. Multiplayer Duel Mode
======================================================== */
function setupModes() {
  btnModeSolo.addEventListener('click', () => {
    gameMode = 'solo';
    btnModeSolo.classList.add('active');
    btnModeDuel.classList.remove('active');
    duelBar.classList.add('hidden');
    stopDuelPolling();
  });

  btnModeDuel.addEventListener('click', () => {
    gameMode = 'duel';
    btnModeDuel.classList.add('active');
    btnModeSolo.classList.remove('active');
    duelBar.classList.remove('hidden');
    startDuelPolling();
  });
}

function startDuelPolling() {
  stopDuelPolling();
  syncDuelState();
  duelPollTimer = setInterval(syncDuelState, 1500);
}

function stopDuelPolling() {
  if (duelPollTimer) clearInterval(duelPollTimer);
  duelPollTimer = null;
}

async function syncDuelState() {
  if (gameMode !== 'duel') return;

  const maxTile = getMaxTile();
  try {
    const res = await fetch('/api/duel/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        score,
        maxTile,
        isGameOver,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      updateDuelUI(data.players || []);
    }
  } catch {
    /* оффлайн */
  }
}

function updateDuelUI(players) {
  myDuelScore.textContent = score;

  const opponents = players.filter((p) => p.userId !== currentUser.id);

  if (opponents.length === 0) {
    oppDuelName.textContent = 'Ждём друга...';
    oppDuelScore.textContent = '0';
    oppDuelAvatar.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2380848e"%3E%3Cpath d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/%3E%3C/svg%3E';
    duelStatusText.textContent = 'Один в войсе';
    return;
  }

  // Берём лучшего соперника
  opponents.sort((a, b) => b.score - a.score);
  const opp = opponents[0];

  oppDuelName.textContent = opp.username;
  oppDuelScore.textContent = opp.score;
  if (opp.avatar) oppDuelAvatar.src = opp.avatar;

  if (score > opp.score) {
    duelStatusText.textContent = 'Ты ведёшь! 🔥';
  } else if (score < opp.score) {
    duelStatusText.textContent = 'Догоняй! ⚡';
  } else {
    duelStatusText.textContent = 'Ничья! 🤝';
  }

  if (opp.isGameOver && !isGameOver) {
    duelStatusText.textContent = `${opp.username} выбыл! 💥`;
  }
}

function getMaxTile() {
  let max = 0;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c] && board[r][c].value > max) max = board[r][c].value;
    }
  }
  return max;
}

/* ========================================================
   4. 2048 Engine With Real Sliding Animations
======================================================= */
function getCellMetrics() {
  const rect = boardEl.getBoundingClientRect();
  const isMobile = window.innerWidth <= 400;
  const gap = isMobile ? 8 : 12;
  const padding = isMobile ? 8 : 12;
  const cellSize = (rect.width - padding * 2 - gap * (SIZE - 1)) / SIZE;
  return { gap, padding, cellSize };
}

function initGame() {
  // Очищаем DOM и состояние
  tileContainer.innerHTML = '';
  tileElements.clear();
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  score = 0;
  isGameOver = false;
  currentScoreEl.textContent = '0';
  gameOverOverlay.classList.add('hidden');
  menuOverlay.classList.add('hidden');

  spawnTile();
  spawnTile();

  if (gameMode === 'duel') syncDuelState();
}

function spawnTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!board[r][c]) empty.push({ r, c });
    }
  }
  if (!empty.length) return null;

  const { r, c } = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  const tile = {
    id: tileIdSeq++,
    value,
    r,
    c,
  };

  board[r][c] = tile;
  createTileDOM(tile, true);
  return tile;
}

function createTileDOM(tile, isNew = false) {
  const { gap, cellSize } = getCellMetrics();
  const el = document.createElement('div');
  const cls = tile.value <= 2048 ? `tile-${tile.value}` : 'tile-super';
  el.className = `tile ${cls} ${isNew ? 'new-tile' : ''}`;

  const x = tile.c * (cellSize + gap);
  const y = tile.r * (cellSize + gap);
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.style.width = `${cellSize}px`;
  el.style.height = `${cellSize}px`;
  el.textContent = tile.value;

  tileContainer.appendChild(el);
  tileElements.set(tile.id, el);
  return el;
}

function updateTilePosition(tile) {
  const el = tileElements.get(tile.id);
  if (!el) return;

  const { gap, cellSize } = getCellMetrics();
  const x = tile.c * (cellSize + gap);
  const y = tile.r * (cellSize + gap);
  el.style.transform = `translate(${x}px, ${y}px)`;
}

function updateTileValue(tile) {
  const el = tileElements.get(tile.id);
  if (!el) return;

  el.className = `tile ${tile.value <= 2048 ? `tile-${tile.value}` : 'tile-super'} merged-tile`;
  el.textContent = tile.value;
}

function removeTileDOM(tileId) {
  const el = tileElements.get(tileId);
  if (el) {
    el.remove();
    tileElements.delete(tileId);
  }
}

function move(dir) {
  if (isGameOver) return;

  const vectors = {
    up: { r: -1, c: 0 },
    down: { r: 1, c: 0 },
    left: { r: 0, c: -1 },
    right: { r: 0, c: 1 },
  };
  const vector = vectors[dir];
  if (!vector) return;

  const rOrder = vector.r === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cOrder = vector.c === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];

  let moved = false;
  let scoreGained = 0;
  const mergedMap = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const tilesToRemove = [];

  for (const r of rOrder) {
    for (const c of cOrder) {
      const tile = board[r][c];
      if (!tile) continue;

      let nextR = r;
      let nextC = c;

      // Ищем максимально далёкую клетку
      while (true) {
        const testR = nextR + vector.r;
        const testC = nextC + vector.c;
        if (testR < 0 || testR >= SIZE || testC < 0 || testC >= SIZE) break;

        const neighbor = board[testR][testC];
        if (!neighbor) {
          nextR = testR;
          nextC = testC;
        } else if (neighbor.value === tile.value && !mergedMap[testR][testC]) {
          // Слияние!
          nextR = testR;
          nextC = testC;
          break;
        } else {
          break;
        }
      }

      if (nextR !== r || nextC !== c) {
        moved = true;
        const targetTile = board[nextR][nextC];

        if (targetTile && targetTile.value === tile.value) {
          // Сливаемся
          mergedMap[nextR][nextC] = true;
          board[r][c] = null;

          tile.r = nextR;
          tile.c = nextC;
          updateTilePosition(tile);

          // Обновляем целевую плитку
          targetTile.value *= 2;
          scoreGained += targetTile.value;

          tilesToRemove.push(tile.id);
          setTimeout(() => {
            removeTileDOM(tile.id);
            updateTileValue(targetTile);
          }, 115);
        } else {
          // Просто перемещение
          board[r][c] = null;
          board[nextR][nextC] = tile;
          tile.r = nextR;
          tile.c = nextC;
          updateTilePosition(tile);
        }
      }
    }
  }

  if (moved) {
    score += scoreGained;
    currentScoreEl.textContent = score;

    if (score > bestScore) {
      setBestScore(score);
      syncBestScoreWithBot(score);
    }

    if (gameMode === 'duel') {
      syncDuelState();
    }

    setTimeout(() => {
      spawnTile();
      if (checkGameOver()) {
        isGameOver = true;
        showGameOver();
        if (gameMode === 'duel') syncDuelState();
      }
    }, 115);
  }
}

function checkGameOver() {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!board[r][c]) return false;
      const val = board[r][c].value;
      if (c + 1 < SIZE && board[r][c + 1] && board[r][c + 1].value === val) return false;
      if (r + 1 < SIZE && board[r + 1][c] && board[r + 1][c].value === val) return false;
    }
  }
  return true;
}

function showGameOver() {
  overlayScoreEl.textContent = score;
  gameOverOverlay.classList.remove('hidden');
}

/* ========================================================
   5. Input Controls (Keyboard + Touch Swipes)
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

window.addEventListener('resize', () => {
  // Пересчитываем координаты плиток при изменении размера окна
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c]) updateTilePosition(board[r][c]);
    }
  }
});

// Запуск игры
initTheme();
setupModes();
initDiscord();
initGame();
