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
  }, 2500);
}

/* ========================================================
   1. State & DOM References
======================================================== */
let discordSdk = null;
const savedProfile = JSON.parse(safeStorage.get('venom_2048_profile', '{}') || '{}');

let currentUser = {
  id: savedProfile.id || 'guest_' + Math.floor(Math.random() * 10000),
  username: savedProfile.username || 'Игрок',
  avatar: savedProfile.avatar || null,
  avatarEmoji: savedProfile.avatarEmoji || '👑',
};

let roomId = 'default_room';
let gameMode = 'solo'; // 'solo' | 'duel'
let duelPollTimer = null;
let syncDebounceTimer = null;
let currentRoundId = 1;

// Бот Вася в дуэли
let botInterval = null;
let isBotActive = false;
let botScore = 0;
let botMaxTile = 2;
let botMoves = 0;
let botBoard = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

// Соперник
let lastOpponent = null;

// Игровая логика
let board = [];
let tileIdSeq = 1;
let isMoving = false;
let movesCount = 0;
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

// Duel Bar
const myAvatarEmoji = document.getElementById('myAvatarEmoji');
const myDuelName = document.getElementById('myDuelName');
const myDuelScore = document.getElementById('myDuelScore');
const myMaxTileBadge = document.getElementById('myMaxTileBadge');
const btnMyAvatar = document.getElementById('btnMyAvatar');
const btnEditName = document.getElementById('btnEditName');

const oppAvatarEmoji = document.getElementById('oppAvatarEmoji');
const oppDuelName = document.getElementById('oppDuelName');
const oppDuelScore = document.getElementById('oppDuelScore');
const oppMaxTileBadge = document.getElementById('oppMaxTileBadge');
const duelStatusText = document.getElementById('duelStatusText');
const oppMovesText = document.getElementById('oppMovesText');
const oppMiniBoard = document.getElementById('oppMiniBoard');

const duelBarMe = document.getElementById('duelBarMe');
const duelBarOpp = document.getElementById('duelBarOpp');

// Overlays
const gameOverOverlay = document.getElementById('gameOverOverlay');
const overlayScoreEl = document.getElementById('overlayScore');
const menuOverlay = document.getElementById('menuOverlay');
const duelResultOverlay = document.getElementById('duelResultOverlay');
const duelResultIcon = document.getElementById('duelResultIcon');
const duelResultTitle = document.getElementById('duelResultTitle');
const duelResultDesc = document.getElementById('duelResultDesc');
const summaryMyAvatar = document.getElementById('summaryMyAvatar');
const summaryMyName = document.getElementById('summaryMyName');
const summaryMyScore = document.getElementById('summaryMyScore');
const summaryMyMaxTile = document.getElementById('summaryMyMaxTile');
const summaryOppAvatar = document.getElementById('summaryOppAvatar');
const summaryOppName = document.getElementById('summaryOppName');
const summaryOppScore = document.getElementById('summaryOppScore');
const summaryOppMaxTile = document.getElementById('summaryOppMaxTile');
const btnDuelRematch = document.getElementById('btnDuelRematch');
const btnDuelClose = document.getElementById('btnDuelClose');

// Profile Overlay
const profileOverlay = document.getElementById('profileOverlay');
const avatarPickerRow = document.getElementById('avatarPickerRow');
const nicknameInput = document.getElementById('nicknameInput');
const btnSaveProfile = document.getElementById('btnSaveProfile');
const btnOpenProfileFromMenu = document.getElementById('btnOpenProfileFromMenu');

/* ========================================================
   2. Theme Toggle (Light / Dark)
======================================================== */
function initTheme() {
  const saved = safeStorage.get('venom_2048_theme', 'dark');
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
   3. Player Profile Customization (Никнейм & Аватар)
======================================================== */
function initProfileUI() {
  updateUserUI();

  if (btnMyAvatar) btnMyAvatar.onclick = openProfileModal;
  if (btnEditName) btnEditName.onclick = openProfileModal;
  if (myDuelName) myDuelName.onclick = openProfileModal;
  if (btnOpenProfileFromMenu) {
    btnOpenProfileFromMenu.onclick = () => {
      if (menuOverlay) menuOverlay.classList.add('hidden');
      openProfileModal();
    };
  }

  if (avatarPickerRow) {
    avatarPickerRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.avatar-option-btn');
      if (!btn) return;
      avatarPickerRow.querySelectorAll('.avatar-option-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentUser.avatarEmoji = btn.dataset.emoji || '👑';
    });
  }

  if (btnSaveProfile) {
    btnSaveProfile.onclick = () => {
      const nick = nicknameInput.value.trim();
      if (nick) currentUser.username = nick;
      saveProfile();
      updateUserUI();
      if (profileOverlay) profileOverlay.classList.add('hidden');
      showToast(`Профиль сохранён: ${currentUser.username}`);
      if (gameMode === 'duel') triggerDuelSync();
    };
  }
}

function openProfileModal() {
  if (nicknameInput) nicknameInput.value = currentUser.username;
  if (avatarPickerRow) {
    avatarPickerRow.querySelectorAll('.avatar-option-btn').forEach((b) => {
      if (b.dataset.emoji === currentUser.avatarEmoji) b.classList.add('selected');
      else b.classList.remove('selected');
    });
  }
  if (profileOverlay) profileOverlay.classList.remove('hidden');
}

function saveProfile() {
  safeStorage.set(
    'venom_2048_profile',
    JSON.stringify({
      id: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar,
      avatarEmoji: currentUser.avatarEmoji,
    }),
  );
}

function updateUserUI() {
  if (myDuelName) myDuelName.textContent = currentUser.username;
  if (myAvatarEmoji) myAvatarEmoji.textContent = currentUser.avatarEmoji || '👑';
  if (summaryMyName) summaryMyName.textContent = currentUser.username;
  if (summaryMyAvatar) summaryMyAvatar.textContent = currentUser.avatarEmoji || '👑';
}

/* ========================================================
   4. Mode Switching & Multiplayer Duel
======================================================== */
function setupModes() {
  if (btnModeSolo) btnModeSolo.onclick = () => setMode('solo');
  if (btnModeDuel) btnModeDuel.onclick = () => setMode('duel');

  // Пригласить в активность через Discord SDK
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

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(window.location.href);
          showToast('🔗 Ссылка скопирована! Отправь её другу в чат');
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

  if (btnDuelRematch) {
    btnDuelRematch.onclick = async () => {
      if (duelResultOverlay) duelResultOverlay.classList.add('hidden');
      try {
        await fetch('/api/duel/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId }),
        });
      } catch {}
      initGame();
      if (isBotActive) startBotDuel();
      showToast('⚔️ Новый раунд начался!');
    };
  }

  if (btnDuelClose) {
    btnDuelClose.onclick = () => {
      if (duelResultOverlay) duelResultOverlay.classList.add('hidden');
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

/* ========================================================
   5. Live Bot Opponent Engine (Виртуальный соперник)
======================================================== */
function startBotDuel() {
  isBotActive = true;
  botScore = 0;
  botMaxTile = 2;
  botMoves = 0;
  botBoard = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  botBoard[0][0] = 2;
  botBoard[1][1] = 2;

  if (oppDuelName) oppDuelName.textContent = 'Бот Вася';
  if (oppAvatarEmoji) oppAvatarEmoji.textContent = '🤖';
  if (oppDuelScore) oppDuelScore.textContent = '0';
  if (oppMaxTileBadge) oppMaxTileBadge.textContent = '🎯 2';

  renderMiniBoard(botBoard);

  if (botInterval) clearInterval(botInterval);
  botInterval = setInterval(() => {
    if (!isBotActive) return;

    botMoves += 1;
    const gained = Math.floor(Math.random() * 8 + 2) * 2;
    botScore += gained;

    if (botScore > 200 && botMaxTile < 64) botMaxTile = 64;
    if (botScore > 600 && botMaxTile < 128) botMaxTile = 128;
    if (botScore > 1200 && botMaxTile < 256) botMaxTile = 256;
    if (botScore > 2400 && botMaxTile < 512) botMaxTile = 512;
    if (botScore > 4000 && botMaxTile < 1024) botMaxTile = 1024;

    // Генерируем живое поле бота
    updateBotMiniGrid();
    renderMiniBoard(botBoard);

    if (oppDuelScore) oppDuelScore.textContent = botScore;
    if (oppMaxTileBadge) oppMaxTileBadge.textContent = `🎯 ${botMaxTile}`;
    if (oppMovesText) oppMovesText.textContent = `ходов: ${botMoves}`;

    updateDuelProgress(score, botScore);

    // Если игра игрока завершилась, а бот ещё играл
    if (isGameOver) {
      stopBotDuel();
      showDuelResults({
        isPlayerWinner: score >= botScore,
        myName: currentUser.username,
        myScore: score,
        myMaxTile: getMaxTile(),
        oppName: 'Бот Вася 🤖',
        oppScore: botScore,
        oppMaxTile: botMaxTile,
      });
    }
  }, 1300);
}

function updateBotMiniGrid() {
  const vals = [0, 2, 4, 8, 16, 32, 64, 128, 256, 512];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (Math.random() < 0.25) {
        const pool = vals.filter((v) => v <= botMaxTile);
        botBoard[r][c] = pool[Math.floor(Math.random() * pool.length)];
      }
    }
  }
}

function stopBotDuel() {
  isBotActive = false;
  if (botInterval) clearInterval(botInterval);
  botInterval = null;
}

/* ========================================================
   6. Multiplayer Duel Sync & Network Optimization
======================================================== */
function startDuelPolling() {
  stopDuelPolling();
  triggerDuelSync();
  duelPollTimer = setInterval(triggerDuelSync, 2500);
}

function stopDuelPolling() {
  if (duelPollTimer) clearInterval(duelPollTimer);
  duelPollTimer = null;
}

function triggerDuelSync() {
  if (gameMode !== 'duel') return;

  const maxTile = getMaxTile();
  const grid = getGridValues();

  fetch('/api/duel/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId,
      userId: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatarEmoji || '👑',
      score,
      maxTile,
      grid,
      moves: movesCount,
      isGameOver,
    }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      if (data.roundId && data.roundId > currentRoundId) {
        currentRoundId = data.roundId;
        initGame();
        showToast('⚔️ Соперник начал новый раунд!');
      }
      updateDuelUI(data.players || []);
    })
    .catch(() => {});
}

function updateDuelUI(players) {
  if (myDuelScore) myDuelScore.textContent = score;
  if (myMaxTileBadge) myMaxTileBadge.textContent = `🎯 ${getMaxTile()}`;

  const opponents = players.filter((p) => p.userId !== currentUser.id);

  if (opponents.length === 0) {
    if (!isBotActive && duelStatusText) {
      if (oppDuelName) oppDuelName.textContent = 'Ожидание...';
      if (oppDuelScore) oppDuelScore.textContent = '0';
      if (oppMaxTileBadge) oppMaxTileBadge.textContent = '🎯 2';
      duelStatusText.textContent = 'Позови друга кнопкой выше 👆';
    }
    return;
  }

  // Если зашёл реальный игрок — выключаем бота
  if (isBotActive) {
    stopBotDuel();
    if (btnToggleBot) btnToggleBot.textContent = '🤖 Дуэль с ботом';
  }

  opponents.sort((a, b) => b.score - a.score);
  const opp = opponents[0];
  lastOpponent = opp;

  if (oppDuelName) oppDuelName.textContent = opp.username;
  if (oppDuelScore) oppDuelScore.textContent = opp.score;
  if (oppAvatarEmoji) oppAvatarEmoji.textContent = opp.avatar || '⚔️';
  if (oppMaxTileBadge) oppMaxTileBadge.textContent = `🎯 ${opp.maxTile || 2}`;
  if (oppMovesText) oppMovesText.textContent = `ходов: ${opp.moves || 0}`;

  if (opp.grid) renderMiniBoard(opp.grid);
  updateDuelProgress(score, opp.score);

  // Проверка исхода дуэли
  if (isGameOver || opp.isGameOver) {
    const isPlayerWinner = score >= opp.score;
    showDuelResults({
      isPlayerWinner,
      myName: currentUser.username,
      myScore: score,
      myMaxTile: getMaxTile(),
      oppName: opp.username,
      oppScore: opp.score,
      oppMaxTile: opp.maxTile || 2,
    });
  }
}

function updateDuelProgress(myVal, oppVal) {
  const total = myVal + oppVal;
  let myPercent = 50;
  if (total > 0) myPercent = Math.max(10, Math.min(90, Math.round((myVal / total) * 100)));

  if (duelBarMe) duelBarMe.style.width = `${myPercent}%`;
  if (duelBarOpp) duelBarOpp.style.width = `${100 - myPercent}%`;

  if (duelStatusText) {
    const diff = myVal - oppVal;
    if (diff > 0) {
      duelStatusText.textContent = `+${diff} ведёшь! 🔥`;
    } else if (diff < 0) {
      duelStatusText.textContent = `${diff} догоняй! ⚡`;
    } else {
      duelStatusText.textContent = 'Ничья! 🤝';
    }
  }
}

function renderMiniBoard(grid) {
  if (!oppMiniBoard || !Array.isArray(grid)) return;
  const cells = oppMiniBoard.querySelectorAll('.mini-cell');
  let idx = 0;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (idx >= cells.length) break;
      const val = grid[r] && grid[r][c] ? grid[r][c] : 0;
      const cell = cells[idx++];
      cell.className = `mini-cell ${val ? `val-${val <= 2048 ? val : 'super'}` : ''}`;
      cell.textContent = val ? (val >= 1000 ? `${Math.floor(val / 1000)}k` : String(val)) : '';
    }
  }
}

function showDuelResults({ isPlayerWinner, myName, myScore, myMaxTile, oppName, oppScore, oppMaxTile }) {
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');

  if (duelResultIcon) duelResultIcon.textContent = isPlayerWinner ? '🏆' : '💀';
  if (duelResultTitle) duelResultTitle.textContent = isPlayerWinner ? 'ПОБЕДА В ДУЭЛИ!' : 'ПОРАЖЕНИЕ В ДУЭЛИ';
  if (duelResultDesc) {
    const diff = Math.abs(myScore - oppScore);
    duelResultDesc.textContent = isPlayerWinner
      ? `Поздравляем! Ты обошёл соперника на ${diff} очков!`
      : `Соперник оказался сильнее на ${diff} очков. Требуй реванш!`;
  }

  if (summaryMyName) summaryMyName.textContent = myName;
  if (summaryMyScore) summaryMyScore.textContent = myScore;
  if (summaryMyMaxTile) summaryMyMaxTile.textContent = `🎯 ${myMaxTile}`;

  if (summaryOppName) summaryOppName.textContent = oppName;
  if (summaryOppScore) summaryOppScore.textContent = oppScore;
  if (summaryOppMaxTile) summaryOppMaxTile.textContent = `🎯 ${oppMaxTile}`;

  if (duelResultOverlay) duelResultOverlay.classList.remove('hidden');
}

function getGridValues() {
  return board.map((row) => row.map((tile) => (tile ? tile.value : 0)));
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
   7. Discord Identity & Reliable Score Saving to /профиль
======================================================== */
async function initDiscord() {
  const urlParams = new URLSearchParams(window.location.search);
  const channelIdParam = urlParams.get('channel_id');
  if (channelIdParam) roomId = channelIdParam;

  // Автоматическая идентификация через сервер бота (по голосовому каналу или лаунчеру)
  try {
    const identRes = await fetch(`/api/identify?channelId=${roomId}`);
    if (identRes.ok) {
      const identData = await identRes.json();
      if (identData.user) {
        currentUser.id = identData.user.userId;
        currentUser.username = identData.user.username;
        if (identData.user.avatar) currentUser.avatar = identData.user.avatar;
        saveProfile();
        updateUserUI();
        console.log(`[клиент] Привязан к Discord: ${currentUser.username} (${currentUser.id})`);
      }
    }
  } catch {}

  // Попытка OAuth через Discord SDK
  try {
    const { DiscordSDK } = await import('https://esm.sh/@discord/embedded-app-sdk');
    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();

    if (discordSdk.channelId) roomId = discordSdk.channelId;

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
      saveProfile();
      updateUserUI();
    }
  } catch (err) {
    console.log('[Discord SDK] Режим прямой связи:', err.message);
  }

  fetchUserBestScore();
}

async function fetchUserBestScore() {
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

  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        username: currentUser.username,
        score: newScore,
        channelId: roomId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.userId && data.userId !== currentUser.id) {
        currentUser.id = data.userId;
        saveProfile();
      }
      if (data.best) setBestScore(data.best);
    }
  } catch {}
}

function setBestScore(val) {
  bestScore = val;
  if (bestScoreEl) bestScoreEl.textContent = val;
}

/* ========================================================
   8. 2048 Game Engine: Sliding & Merging
======================================================== */
function initGame() {
  if (tileContainer) tileContainer.innerHTML = '';
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  score = 0;
  movesCount = 0;
  isGameOver = false;
  isMoving = false;

  if (currentScoreEl) currentScoreEl.textContent = '0';
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
  if (duelResultOverlay) duelResultOverlay.classList.add('hidden');
  if (menuOverlay) menuOverlay.classList.add('hidden');

  spawnTile();
  spawnTile();

  if (gameMode === 'duel') triggerDuelSync();
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
    movesCount += 1;
    score += scoreGained;
    if (currentScoreEl) currentScoreEl.textContent = score;

    if (score > bestScore) {
      setBestScore(score);
      syncBestScoreWithBot(score);
    }

    // Дебаунс отправки статуса дуэли при активных свайпах
    if (gameMode === 'duel') {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(triggerDuelSync, 200);
    }

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
        handleGameOver();
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

function handleGameOver() {
  syncBestScoreWithBot(score);

  if (gameMode === 'duel') {
    triggerDuelSync();
    if (isBotActive) {
      stopBotDuel();
      showDuelResults({
        isPlayerWinner: score >= botScore,
        myName: currentUser.username,
        myScore: score,
        myMaxTile: getMaxTile(),
        oppName: 'Бот Вася 🤖',
        oppScore: botScore,
        oppMaxTile: botMaxTile,
      });
      return;
    }

    if (lastOpponent) {
      showDuelResults({
        isPlayerWinner: score >= lastOpponent.score,
        myName: currentUser.username,
        myScore: score,
        myMaxTile: getMaxTile(),
        oppName: lastOpponent.username,
        oppScore: lastOpponent.score,
        oppMaxTile: lastOpponent.maxTile || 2,
      });
      return;
    }
  }

  // Обычный Game Over в соло
  if (overlayScoreEl) overlayScoreEl.textContent = score;
  if (gameOverOverlay) gameOverOverlay.classList.remove('hidden');
}

/* ========================================================
   9. Controls & Input Listeners
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
   10. Application Entry Point
======================================================== */
initTheme();
initProfileUI();
setupModes();
initDiscord();
initGame();
