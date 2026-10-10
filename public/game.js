'use strict';

const CLIENT_ID = '1558214657137975357';
const SIZE = 4;

/* ========================================================
   0. Safe Storage & Toast Notification
======================================================== */
const safeStorage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, String(val));
    } catch {}
  },
};

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  if (window._toastTimeout) clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2600);
}

/* ========================================================
   1. State & DOM References
======================================================== */
let discordSdk = null;
let currentUser = {
  id: 'guest_' + Math.floor(Math.random() * 10000),
  username: 'Игрок',
  avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
};

let roomId = 'default_room';
let gameMode = 'solo'; // 'solo' | 'duel'
let duelPollTimer = null;
let botDuelInterval = null;
let botScore = 0;
let isBotActive = false;

let board = [];
let tileIdSeq = 1;
let isMoving = false;
let score = 0;
let bestScore = 0;
let isGameOver = false;

// DOM
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
const duelSection = document.getElementById('duelSection');
const btnInviteFriend = document.getElementById('btnInviteFriend');
const btnToggleBot = document.getElementById('btnToggleBot');

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
   2. Theme Toggle (Light / Dark)
======================================================== */
function initTheme() {
  const saved = safeStorage.get('venom_2048_theme', 'light');
  applyTheme(saved);

  if (btnThemeToggle) {
    btnThemeToggle.onclick = (e) => {
      e.preventDefault();
      const isDark = document.body.classList.contains('dark-theme');
      const nextTheme = isDark ? 'light' : 'dark';
      applyTheme(nextTheme);
      safeStorage.set('venom_2048_theme', nextTheme);
    };
  }
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeIconEl) themeIconEl.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-theme');
    if (themeIconEl) themeIconEl.textContent = '🌙';
  }
}

/* ========================================================
   3. Mode Switching & Duel Features
======================================================== */
function setupModes() {
  if (btnModeSolo) {
    btnModeSolo.onclick = () => setMode('solo');
  }

  if (btnModeDuel) {
    btnModeDuel.onclick = () => setMode('duel');
  }

  // Пригласить в активность
  if (btnInviteFriend) {
    btnInviteFriend.onclick = async () => {
      if (discordSdk && discordSdk.commands && typeof discordSdk.commands.openInviteDialog === 'function') {
        try {
          await discordSdk.commands.openInviteDialog();
          return;
        } catch (err) {
          console.log('[Discord SDK] openInviteDialog:', err.message);
        }
      }

      // Скопировать ссылку при клике вне Discord
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(window.location.href);
          showToast('🔗 Ссылка скопирована! Отправь её другу');
          return;
        }
      } catch {}
      showToast('Позови друга в голосовой канал Discord!');
    };
  }

  // Дуэль с ботом
  if (btnToggleBot) {
    btnToggleBot.onclick = () => {
      if (isBotActive) {
        stopBotDuel();
        btnToggleBot.textContent = '🤖 Дуэль с ботом';
        if (duelStatusText) duelStatusText.textContent = 'Бот остановлен';
        showToast('Дуэль с ботом завершена');
      } else {
        startBotDuel();
        btnToggleBot.textContent = '⏹️ Стоп бота';
        if (duelStatusText) duelStatusText.textContent = 'Баттл с ботом начался! 🔥';
        showToast('Бот Вася вступил в битву!');
      }
    };
  }
}

function setMode(mode) {
  gameMode = mode;
  if (mode === 'solo') {
    if (btnModeSolo) btnModeSolo.classList.add('active');
    if (btnModeDuel) btnModeDuel.classList.remove('active');
    if (duelSection) duelSection.classList.add('hidden');
    stopDuelPolling();
    stopBotDuel();
  } else {
    if (btnModeDuel) btnModeDuel.classList.add('active');
    if (btnModeSolo) btnModeSolo.classList.remove('active');
    if (duelSection) duelSection.classList.remove('hidden');
    startDuelPolling();
  }
}

function startBotDuel() {
  isBotActive = true;
  botScore = 0;
  if (oppDuelName) oppDuelName.textContent = 'Бот Вася 🤖';
  if (oppDuelScore) oppDuelScore.textContent = '0';
  if (oppDuelAvatar) {
    oppDuelAvatar.src =
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f59e0b"%3E%3Cpath d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72V7h2a3 3 0 0 1 3 3v2h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v1a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-1H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1v-2a3 3 0 0 1 3-3h2V5.72A2 2 0 0 1 12 2zm-3 8a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zm6 0a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1z"/%3E%3C/svg%3E';
  }

  if (botDuelInterval) clearInterval(botDuelInterval);
  botDuelInterval = setInterval(() => {
    if (!isBotActive) return;
    botScore += Math.floor(Math.random() * 12 + 4) * 2;
    if (oppDuelScore) oppDuelScore.textContent = botScore;

    if (duelStatusText) {
      if (score > botScore) {
        duelStatusText.textContent = 'Ты ведёшь! 🔥';
      } else if (score < botScore) {
        duelStatusText.textContent = 'Бот обгоняет! ⚡';
      } else {
        duelStatusText.textContent = 'Ничья! 🤝';
      }
    }
  }, 1200);
}

function stopBotDuel() {
  isBotActive = false;
  if (botDuelInterval) clearInterval(botDuelInterval);
  botDuelInterval = null;
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
    /* оффлайн режим */
  }
}

function updateDuelUI(players) {
  if (myDuelScore) myDuelScore.textContent = score;

  const opponents = players.filter((p) => p.userId !== currentUser.id);

  if (opponents.length === 0) {
    if (!isBotActive && duelStatusText) {
      if (oppDuelName) oppDuelName.textContent = 'Ожидание...';
      if (oppDuelScore) oppDuelScore.textContent = '0';
      duelStatusText.textContent = 'Позови друга кнопкой выше 👆';
    }
    return;
  }

  // Если пришёл реальный игрок — выключаем тренировочного бота
  if (isBotActive) {
    stopBotDuel();
    if (btnToggleBot) btnToggleBot.textContent = '🤖 Дуэль с ботом';
  }

  opponents.sort((a, b) => b.score - a.score);
  const opp = opponents[0];

  if (oppDuelName) oppDuelName.textContent = opp.username;
  if (oppDuelScore) oppDuelScore.textContent = opp.score;
  if (oppDuelAvatar && opp.avatar) oppDuelAvatar.src = opp.avatar;

  if (duelStatusText) {
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
}

function getMaxTile() {
  let max = 0;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r] && board[r][c] && board[r][c].value > max) max = board[r][c].value;
    }
  }
  return max;
}

/* ========================================================
   4. Discord SDK & Identity
======================================================== */
async function initDiscord() {
  const urlParams = new URLSearchParams(window.location.search);
  const channelIdParam = urlParams.get('channel_id');
  if (channelIdParam) roomId = channelIdParam;

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
    console.log('[Discord SDK] Веб-режим:', err.message);
    if (userStatusEl) userStatusEl.textContent = 'Веб-версия';
    updateUserUI();
    const saved = safeStorage.get('venom_2048_best');
    if (saved) setBestScore(parseInt(saved, 10));
  }
}

function updateUserUI() {
  if (userNameEl) userNameEl.textContent = currentUser.username;
  if (userAvatarEl && currentUser.avatar) userAvatarEl.src = currentUser.avatar;
  if (myDuelAvatar && currentUser.avatar) myDuelAvatar.src = currentUser.avatar;
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
  } catch {}
}

async function syncBestScoreWithBot(newScore) {
  safeStorage.set('venom_2048_best', String(newScore));
  if (currentUser.id.startsWith('guest_')) return;

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
  } catch {}
}

function setBestScore(val) {
  bestScore = val;
  if (bestScoreEl) bestScoreEl.textContent = val;
}

/* ========================================================
   5. 2048 Engine: Smooth Sliding & Centered Montserrat Tiles
======================================================== */
function initGame() {
  if (tileContainer) tileContainer.innerHTML = '';
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  score = 0;
  isGameOver = false;
  isMoving = false;
  if (currentScoreEl) currentScoreEl.textContent = '0';
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
  if (menuOverlay) menuOverlay.classList.add('hidden');

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
    merged: false,
    el: null,
  };

  board[r][c] = tile;
  createTileDOM(tile, true);
  return tile;
}

function createTileDOM(tile, isNew = false) {
  const el = document.createElement('div');
  const cls = tile.value <= 2048 ? `tile-${tile.value}` : 'tile-super';
  el.className = `tile ${cls} ${isNew ? 'tile-new' : ''}`;
  el.setAttribute('data-val', tile.value);

  // Плавное процентное позиционирование с учётом зазора между плитками
  el.style.transform = `translate(calc(${tile.c} * (100% + var(--tile-gap))), calc(${tile.r} * (100% + var(--tile-gap))))`;

  const inner = document.createElement('div');
  inner.className = 'tile-inner';
  inner.textContent = tile.value;

  el.appendChild(inner);
  if (tileContainer) tileContainer.appendChild(el);

  tile.el = el;
  return el;
}

function updateTilePosition(tile) {
  if (!tile || !tile.el) return;
  tile.el.style.transform = `translate(calc(${tile.c} * (100% + var(--tile-gap))), calc(${tile.r} * (100% + var(--tile-gap))))`;
}

function move(dir) {
  if (isGameOver || isMoving) return;

  const vectors = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
  };
  const vector = vectors[dir];
  if (!vector) return;

  const rOrder = vector[0] === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cOrder = vector[1] === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];

  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c]) board[r][c].merged = false;
    }
  }

  let moved = false;
  let scoreGained = 0;
  const tilesToClean = [];

  for (const r of rOrder) {
    for (const c of cOrder) {
      const tile = board[r][c];
      if (!tile) continue;

      let targetR = r;
      let targetC = c;

      while (true) {
        const nextR = targetR + vector[0];
        const nextC = targetC + vector[1];
        if (nextR < 0 || nextR >= SIZE || nextC < 0 || nextC >= SIZE) break;

        const neighbor = board[nextR][nextC];
        if (!neighbor) {
          targetR = nextR;
          targetC = nextC;
        } else if (neighbor.value === tile.value && !neighbor.merged && !tile.merged) {
          targetR = nextR;
          targetC = nextC;
          break;
        } else {
          break;
        }
      }

      if (targetR !== r || targetC !== c) {
        moved = true;
        const targetTile = board[targetR][targetC];

        if (targetTile && targetTile.value === tile.value) {
          // Слияние двух одинаковых плиток
          board[r][c] = null;
          tile.r = targetR;
          tile.c = targetC;
          updateTilePosition(tile);

          const mergedTile = {
            id: tileIdSeq++,
            value: tile.value * 2,
            r: targetR,
            c: targetC,
            merged: true,
            el: null,
          };
          board[targetR][targetC] = mergedTile;
          scoreGained += mergedTile.value;

          tilesToClean.push({
            oldTile1: tile,
            oldTile2: targetTile,
            newTile: mergedTile,
          });
        } else {
          // Просто скольжение в пустую клетку
          board[r][c] = null;
          board[targetR][targetC] = tile;
          tile.r = targetR;
          tile.c = targetC;
          updateTilePosition(tile);
        }
      }
    }
  }

  if (moved) {
    isMoving = true;
    score += scoreGained;
    if (currentScoreEl) currentScoreEl.textContent = score;

    if (score > bestScore) {
      setBestScore(score);
      syncBestScoreWithBot(score);
    }

    if (gameMode === 'duel') syncDuelState();

    setTimeout(() => {
      for (const { oldTile1, oldTile2, newTile } of tilesToClean) {
        if (oldTile1.el) oldTile1.el.remove();
        if (oldTile2.el) oldTile2.el.remove();

        createTileDOM(newTile, false);
        if (newTile.el) newTile.el.classList.add('tile-merged');
      }

      spawnTile();
      isMoving = false;

      if (checkGameOver()) {
        isGameOver = true;
        showGameOver();
        if (gameMode === 'duel') syncDuelState();
      }
    }, 110);
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
  if (overlayScoreEl) overlayScoreEl.textContent = score;
  if (gameOverOverlay) gameOverOverlay.classList.remove('hidden');

  if (isBotActive) {
    if (score > botScore) {
      showToast(`🏆 Ты победил Бота! (${score} против ${botScore})`);
    } else {
      showToast(`🤖 Бот Вася выиграл дуэль (${botScore} против ${score})`);
    }
  }
}

/* ========================================================
   6. Controls & Input Listeners
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

if (boardEl) {
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
}

if (btnNewGame) btnNewGame.onclick = initGame;
if (btnOverlayRestart) btnOverlayRestart.onclick = initGame;

if (btnMenu) {
  btnMenu.onclick = () => {
    if (menuOverlay) menuOverlay.classList.remove('hidden');
  };
}

if (btnCloseMenu) {
  btnCloseMenu.onclick = () => {
    if (menuOverlay) menuOverlay.classList.add('hidden');
  };
}

window.addEventListener('resize', () => {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r] && board[r][c]) updateTilePosition(board[r][c]);
    }
  }
});

/* ========================================================
   7. Application Entry Point
======================================================== */
initTheme();
setupModes();
initDiscord();
initGame();
