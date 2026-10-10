'use strict';

import { SnakeGame } from './snake.js?v=multigames_hub_v9';

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
  }, 2800);
}

/* ========================================================
   1. State & DOM References
======================================================== */
let discordSdk = null;
let cachedInviteUrl = null;

let currentUser = {
  id: '566547457568276494',
  username: 'baal worship',
  avatar: 'https://cdn.discordapp.com/avatars/566547457568276494/1506363121c6ce8e148c9ccd26cb9639.png?size=256',
};

let roomId = 'default_room';
let gameMode = 'solo'; // 'solo' | 'duel'
let duelState = 'lobby'; // 'lobby' | 'playing' | 'finished'
let duelPollTimer = null;
let syncDebounceTimer = null;
let currentRoundId = 1;

// Бот в дуэли
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
const btnStopGame = document.getElementById('btnStopGame');
const btnMenu = document.getElementById('btnMenu');
const btnOverlayRestart = document.getElementById('btnOverlayRestart');
const btnCloseMenu = document.getElementById('btnCloseMenu');
const btnThemeToggle = document.getElementById('btnThemeToggle');
const themeIconEl = document.getElementById('themeIcon');

// Главный профиль игрока (всегда виден)
const mainProfileBar = document.getElementById('userProfileBar');
const mainProfileAvatar = document.getElementById('mainProfileAvatar');
const mainProfileName = document.getElementById('mainProfileName');
const mainProfileRecord2048 = document.getElementById('mainProfileRecord2048');
const mainProfileRecordSnake = document.getElementById('mainProfileRecordSnake');
const hubRecord2048 = document.getElementById('hubRecord2048');
const hubRecordSnake = document.getElementById('hubRecordSnake');

let bestScore2048 = 0;
let bestScoreSnake = 0;

const btnModeSolo = document.getElementById('btnModeSolo');
const btnModeDuel = document.getElementById('btnModeDuel');
const duelSection = document.getElementById('duelSection');

// Duel Lobby
const duelLobbyOverlay = document.getElementById('duelLobbyOverlay');
const lobbyMyAvatar = document.getElementById('lobbyMyAvatar');
const lobbyMyName = document.getElementById('lobbyMyName');
const lobbyOppAvatar = document.getElementById('lobbyOppAvatar');
const lobbyOppName = document.getElementById('lobbyOppName');
const lobbyOppStatus = document.getElementById('lobbyOppStatus');
const btnStartDuel = document.getElementById('btnStartDuel');
const btnDuelBotChoice = document.getElementById('btnDuelBotChoice');
const btnInviteChat = document.getElementById('btnInviteChat');
const btnCopyInvite = document.getElementById('btnCopyInvite');

// Duel In-Game Bar
const myDuelAvatar = document.getElementById('myDuelAvatar');
const myDuelName = document.getElementById('myDuelName');
const myDuelScore = document.getElementById('myDuelScore');
const myMaxTileBadge = document.getElementById('myMaxTileBadge');

const oppDuelAvatar = document.getElementById('oppDuelAvatar');
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
const btnBackToLobby = document.getElementById('btnBackToLobby');

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
   3. Discord Profile Porting
======================================================== */
function updateProfileUI() {
  // Обновляем аватары и ники во всех блоках интерфейса
  if (mainProfileName) mainProfileName.textContent = currentUser.username;
  if (mainProfileAvatar && currentUser.avatar) mainProfileAvatar.src = currentUser.avatar;
  if (mainProfileRecord2048) mainProfileRecord2048.textContent = bestScore;
  if (mainProfileRecordSnake) mainProfileRecordSnake.textContent = bestScoreSnake;
  if (hubRecord2048) hubRecord2048.textContent = bestScore;
  if (hubRecordSnake) hubRecordSnake.textContent = bestScoreSnake;

  if (myDuelName) myDuelName.textContent = currentUser.username;
  if (myDuelAvatar && currentUser.avatar) myDuelAvatar.src = currentUser.avatar;
  if (lobbyMyName) lobbyMyName.textContent = currentUser.username;
  if (lobbyMyAvatar && currentUser.avatar) lobbyMyAvatar.src = currentUser.avatar;
  if (summaryMyName) summaryMyName.textContent = currentUser.username;
  if (summaryMyAvatar && currentUser.avatar) summaryMyAvatar.src = currentUser.avatar;
}

/* ========================================================
   4. Mode Switching & Duel Lobby
======================================================== */
function setupModes() {
  if (btnModeSolo) {
    btnModeSolo.onclick = () => {
      gameMode = 'solo';
      btnModeSolo.classList.add('active');
      btnModeDuel.classList.remove('active');
      if (duelSection) duelSection.classList.add('hidden');
      if (duelLobbyOverlay) duelLobbyOverlay.classList.add('hidden');
      stopDuelPolling();
      stopBotDuel();
      initGame();
    };
  }

  if (btnModeDuel) {
    btnModeDuel.onclick = () => {
      gameMode = 'duel';
      btnModeDuel.classList.add('active');
      btnModeSolo.classList.remove('active');
      openDuelLobby();
      startDuelPolling();
    };
  }

  // Кнопка в лобби: Начать дуэль
  if (btnStartDuel) {
    btnStartDuel.onclick = () => {
      if (lastOpponent) {
        startDuelMatch(false);
      } else {
        // Если реального соперника нет — стартуем с ботом
        startDuelMatch(true);
      }
    };
  }

  // Кнопка в лобби: Играть с ботом
  if (btnDuelBotChoice) {
    btnDuelBotChoice.onclick = () => {
      startDuelMatch(true);
    };
  }

  // Кнопка в лобби: Позвать в чате сервера (с выбором канала)
  if (btnInviteChat) {
    btnInviteChat.onclick = () => {
      openChannelSelect('2048');
    };
  }

  // Кнопка в лобби: Скопировать ссылку
  if (btnCopyInvite) {
    btnCopyInvite.onclick = async () => {
      const urlToCopy = cachedInviteUrl || window.location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(urlToCopy);
          showToast('🔗 Ссылка на дуэль скопирована в буфер!');
          return;
        }
      } catch {}
      showToast(`Ссылка: ${urlToCopy}`);
    };
  }

  // Кнопка стопа игры (завершить и отправить счёт)
  if (btnStopGame) {
    btnStopGame.onclick = () => {
      if (isGameOver) return;
      isGameOver = true;
      handleGameOver();
      showToast('⏹️ Игра завершена, счёт зафиксирован!');
    };
  }

  // Кнопка реванша после дуэли
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

      if (isBotActive) {
        startDuelMatch(true);
      } else {
        startDuelMatch(false);
      }
      showToast('⚔️ Новый раунд начался!');
    };
  }

  // Вернуться в лобби дуэли
  if (btnBackToLobby) {
    btnBackToLobby.onclick = () => {
      if (duelResultOverlay) duelResultOverlay.classList.add('hidden');
      openDuelLobby();
    };
  }
}

/* ========================================================
   4.5 Channel Selection & Server Chat Invite
======================================================== */
let cachedChannels = null;
let currentInviteGame = '2048';

const channelSelectOverlay = document.getElementById('channelSelectOverlay');
const channelSelectDropdown = document.getElementById('channelSelectDropdown');
const btnConfirmSendInvite = document.getElementById('btnConfirmSendInvite');
const btnCancelSendInvite = document.getElementById('btnCancelSendInvite');

async function openChannelSelect(game = '2048') {
  currentInviteGame = game;
  if (!cachedChannels || cachedChannels.length === 0) {
    try {
      const params = new URLSearchParams();
      if (roomId && roomId !== 'default_room') params.set('channelId', roomId);
      if (currentUser?.id) params.set('userId', currentUser.id);
      const res = await fetch(`/api/channels?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        cachedChannels = data.channels || [];
      }
    } catch {}
  }

  if (channelSelectDropdown) {
    channelSelectDropdown.innerHTML = '';
    if (cachedChannels && cachedChannels.length > 0) {
      for (const ch of cachedChannels) {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `#${ch.name}`;
        channelSelectDropdown.appendChild(opt);
      }
    } else {
      const opt = document.createElement('option');
      opt.value = roomId;
      opt.textContent = 'Основной текстовый чат';
      channelSelectDropdown.appendChild(opt);
    }
  }

  if (channelSelectOverlay) {
    channelSelectOverlay.classList.remove('hidden');
  }
}

if (btnCancelSendInvite) {
  btnCancelSendInvite.onclick = () => {
    if (channelSelectOverlay) channelSelectOverlay.classList.add('hidden');
  };
}

if (btnConfirmSendInvite) {
  btnConfirmSendInvite.onclick = async () => {
    const selectedChannelId = channelSelectDropdown?.value || roomId;
    const selectedText = channelSelectDropdown?.selectedOptions?.[0]?.textContent || 'чат';
    btnConfirmSendInvite.textContent = '⏳ Отправляем...';

    try {
      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedChannelId,
          username: currentUser?.username || 'Игрок',
          userId: currentUser?.id,
          roomId: roomId,
          game: currentInviteGame,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.inviteUrl) cachedInviteUrl = data.inviteUrl;
        showToast(`📢 Вызов отправлен в ${selectedText}! Пацаны получили инвайт.`);
      } else {
        showToast('📢 Инвайт отправлен в чат!');
      }
    } catch {
      showToast('Ошибка при отправке инвайта.');
    } finally {
      btnConfirmSendInvite.textContent = '🚀 ОТПРАВИТЬ';
      if (channelSelectOverlay) channelSelectOverlay.classList.add('hidden');
    }
  };
}

/* ========================================================
   4.8 Mini-Games Hub Switcher (2048 & Змейка)
======================================================== */
let activeGame = 'hub';
let snakeGame = null;

const btnNavHub = document.getElementById('btnNavHub');
const btnNav2048 = document.getElementById('btnNav2048');
const btnNavSnake = document.getElementById('btnNavSnake');
const sectionHub = document.getElementById('sectionHub');
const section2048 = document.getElementById('section2048');
const sectionSnake = document.getElementById('sectionSnake');
const logoBoxEl = document.querySelector('.logo-box');

const cardSelect2048 = document.getElementById('cardSelect2048');
const cardSelectSnake = document.getElementById('cardSelectSnake');
const btnPlay2048 = document.getElementById('btnPlay2048');
const btnPlaySnake = document.getElementById('btnPlaySnake');

const btnBackToHubFrom2048 = document.getElementById('btnBackToHubFrom2048');
const btnBackToHubFromSnake = document.getElementById('btnBackToHubFromSnake');

function setupGameSwitcher() {
  if (btnNavHub) btnNavHub.onclick = () => switchActiveGame('hub');
  if (btnNav2048) btnNav2048.onclick = () => switchActiveGame('2048');
  if (btnNavSnake) btnNavSnake.onclick = () => switchActiveGame('snake');

  if (cardSelect2048) cardSelect2048.onclick = () => switchActiveGame('2048');
  if (btnPlay2048) {
    btnPlay2048.onclick = (e) => {
      e.stopPropagation();
      switchActiveGame('2048');
    };
  }

  if (cardSelectSnake) cardSelectSnake.onclick = () => switchActiveGame('snake');
  if (btnPlaySnake) {
    btnPlaySnake.onclick = (e) => {
      e.stopPropagation();
      switchActiveGame('snake');
    };
  }

  if (btnBackToHubFrom2048) btnBackToHubFrom2048.onclick = () => switchActiveGame('hub');
  if (btnBackToHubFromSnake) btnBackToHubFromSnake.onclick = () => switchActiveGame('hub');
}

function switchActiveGame(gameName) {
  activeGame = gameName;

  if (gameName === 'hub') {
    if (btnNavHub) btnNavHub.classList.add('active');
    if (btnNav2048) btnNav2048.classList.remove('active');
    if (btnNavSnake) btnNavSnake.classList.remove('active');

    if (sectionHub) sectionHub.classList.remove('hidden');
    if (section2048) section2048.classList.add('hidden');
    if (sectionSnake) sectionSnake.classList.add('hidden');

    if (logoBoxEl) logoBoxEl.textContent = 'ИГРЫ';
    if (currentScoreEl) currentScoreEl.textContent = '—';
    if (bestScoreEl) bestScoreEl.textContent = '—';

    // ОСТАНАВЛИВАЕМ ВСЁ В 2048 (БОТ, ДУЭЛЬ, ТАЙМЕРЫ)
    stopBotDuel();
    stopDuelPolling();
    isMoving = false;

    // ОСТАНАВЛИВАЕМ ВСЁ В ЗМЕЙКЕ
    if (snakeGame) {
      snakeGame.stopLoop();
      snakeGame.stopDuelPolling();
    }

    updateProfileUI();
  } else if (gameName === '2048') {
    if (btnNav2048) btnNav2048.classList.add('active');
    if (btnNavHub) btnNavHub.classList.remove('active');
    if (btnNavSnake) btnNavSnake.classList.remove('active');

    if (section2048) section2048.classList.remove('hidden');
    if (sectionHub) sectionHub.classList.add('hidden');
    if (sectionSnake) sectionSnake.classList.add('hidden');

    if (logoBoxEl) logoBoxEl.textContent = '2048';
    if (currentScoreEl) currentScoreEl.textContent = score;
    if (bestScoreEl) bestScoreEl.textContent = bestScore;

    // ОСТАНАВЛИВАЕМ ЗМЕЙКУ
    if (snakeGame) {
      snakeGame.stopLoop();
      snakeGame.stopDuelPolling();
    }

    if (!board.some((row) => row.some((tile) => tile !== null))) {
      initGame();
    }
  } else if (gameName === 'snake') {
    if (btnNavSnake) btnNavSnake.classList.add('active');
    if (btnNavHub) btnNavHub.classList.remove('active');
    if (btnNav2048) btnNav2048.classList.remove('active');

    if (sectionSnake) sectionSnake.classList.remove('hidden');
    if (sectionHub) sectionHub.classList.add('hidden');
    if (section2048) section2048.classList.add('hidden');

    if (logoBoxEl) logoBoxEl.textContent = 'ЗМЕЙКА';

    // ОСТАНАВЛИВАЕМ ВСЁ В 2048 (БОТ, ДУЭЛЬ, ТАЙМЕРЫ)
    stopBotDuel();
    stopDuelPolling();
    isMoving = false;

    if (!snakeGame) {
      snakeGame = new SnakeGame({
        getCurrentUser: () => currentUser,
        getRoomId: () => roomId,
        showToast,
        onBackToHub: () => switchActiveGame('hub'),
        onScoreUpdate: (s, b) => {
          bestScoreSnake = b;
          updateProfileUI();
          if (activeGame === 'snake') {
            if (currentScoreEl) currentScoreEl.textContent = s;
            if (bestScoreEl) bestScoreEl.textContent = b;
          }
        },
        openChannelSelect: (g) => openChannelSelect(g),
      });
      snakeGame.showMenu();
    } else {
      if (currentScoreEl) currentScoreEl.textContent = snakeGame.score;
      if (bestScoreEl) bestScoreEl.textContent = snakeGame.bestScore;
      snakeGame.setupCanvas();
      if (snakeGame.state === 'menu') {
        snakeGame.showMenu();
      } else {
        snakeGame.render(0);
      }
    }
  }
}

function openDuelLobby() {
  duelState = 'lobby';
  stopBotDuel();
  if (duelSection) duelSection.classList.add('hidden');
  if (duelResultOverlay) duelResultOverlay.classList.add('hidden');
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
  if (duelLobbyOverlay) duelLobbyOverlay.classList.remove('hidden');
}

function startDuelMatch(withBot = false) {
  duelState = 'playing';
  if (duelLobbyOverlay) duelLobbyOverlay.classList.add('hidden');
  if (duelResultOverlay) duelResultOverlay.classList.add('hidden');
  if (duelSection) duelSection.classList.remove('hidden');

  initGame();

  if (withBot) {
    startBotDuel();
    showToast('Баттл с ботом начался! 🔥');
  } else {
    stopBotDuel();
    triggerDuelSync();
    showToast('Дуэль против игрока началась! ⚔️');
  }
}

/* ========================================================
   5. Live Bot Engine (Виртуальный соперник)
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
  if (oppDuelAvatar) oppDuelAvatar.src = 'https://cdn.discordapp.com/embed/avatars/2.png';
  if (oppDuelScore) oppDuelScore.textContent = '0';
  if (oppMaxTileBadge) oppMaxTileBadge.textContent = '🎯 2';

  renderMiniBoard(botBoard);

  if (botInterval) clearInterval(botInterval);
  botInterval = setInterval(() => {
    if (!isBotActive || duelState !== 'playing') return;

    botMoves += 1;
    const gained = Math.floor(Math.random() * 8 + 2) * 2;
    botScore += gained;

    if (botScore > 200 && botMaxTile < 64) botMaxTile = 64;
    if (botScore > 600 && botMaxTile < 128) botMaxTile = 128;
    if (botScore > 1200 && botMaxTile < 256) botMaxTile = 256;
    if (botScore > 2400 && botMaxTile < 512) botMaxTile = 512;
    if (botScore > 4000 && botMaxTile < 1024) botMaxTile = 1024;

    updateBotMiniGrid();
    renderMiniBoard(botBoard);

    if (oppDuelScore) oppDuelScore.textContent = botScore;
    if (oppMaxTileBadge) oppMaxTileBadge.textContent = `🎯 ${botMaxTile}`;
    if (oppMovesText) oppMovesText.textContent = `ходов: ${botMoves}`;

    updateDuelProgress(score, botScore);

    if (isGameOver) {
      stopBotDuel();
      showDuelResults({
        isPlayerWinner: score >= botScore,
        myName: currentUser.username,
        myScore: score,
        myMaxTile: getMaxTile(),
        oppName: 'Бот Вася',
        oppAvatar: 'https://cdn.discordapp.com/embed/avatars/2.png',
        oppScore: botScore,
        oppMaxTile: botMaxTile,
      });
    }
  }, 1250);
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
   6. Multiplayer Duel Sync & Network Logic
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
      avatar: currentUser.avatar,
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
        if (duelState === 'playing') {
          initGame();
          showToast('⚔️ Соперник перезапустил раунд!');
        }
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
    lastOpponent = null;
    if (lobbyOppName) lobbyOppName.textContent = 'Ожидание...';
    if (lobbyOppStatus) {
      lobbyOppStatus.textContent = 'НЕ ПОДКЛЮЧЁН';
      lobbyOppStatus.style.color = '#ef4444';
    }

    if (!isBotActive && duelStatusText) {
      if (oppDuelName) oppDuelName.textContent = 'Ожидание...';
      if (oppDuelScore) oppDuelScore.textContent = '0';
      if (oppMaxTileBadge) oppMaxTileBadge.textContent = '🎯 2';
      duelStatusText.textContent = 'Ожидание соперника...';
    }
    return;
  }

  opponents.sort((a, b) => b.score - a.score);
  const opp = opponents[0];
  lastOpponent = opp;

  // Обновляем соперника в лобби
  if (lobbyOppName) lobbyOppName.textContent = opp.username;
  if (lobbyOppAvatar && opp.avatar) lobbyOppAvatar.src = opp.avatar;
  if (lobbyOppStatus) {
    lobbyOppStatus.textContent = 'В ЛОББИ ✅';
    lobbyOppStatus.style.color = '#10b981';
  }

  // Если зашёл реальный игрок — выключаем бота
  if (isBotActive) {
    stopBotDuel();
  }

  // Обновляем панель во время матча
  if (oppDuelName) oppDuelName.textContent = opp.username;
  if (oppDuelScore) oppDuelScore.textContent = opp.score;
  if (oppDuelAvatar && opp.avatar) oppDuelAvatar.src = opp.avatar;
  if (oppMaxTileBadge) oppMaxTileBadge.textContent = `🎯 ${opp.maxTile || 2}`;
  if (oppMovesText) oppMovesText.textContent = `ходов: ${opp.moves || 0}`;

  if (opp.grid) renderMiniBoard(opp.grid);
  updateDuelProgress(score, opp.score);

  if (duelState === 'playing' && (isGameOver || opp.isGameOver)) {
    duelState = 'finished';
    const isPlayerWinner = score >= opp.score;
    showDuelResults({
      isPlayerWinner,
      myName: currentUser.username,
      myScore: score,
      myMaxTile: getMaxTile(),
      oppName: opp.username,
      oppAvatar: opp.avatar || 'https://cdn.discordapp.com/embed/avatars/1.png',
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

function showDuelResults({ isPlayerWinner, myName, myScore, myMaxTile, oppName, oppAvatar, oppScore, oppMaxTile }) {
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');

  if (duelResultIcon) duelResultIcon.textContent = isPlayerWinner ? '🏆' : '💀';
  if (duelResultTitle) duelResultTitle.textContent = isPlayerWinner ? 'ПОБЕДА В ДУЭЛИ!' : 'ПОРАЖЕНИЕ В ДУЭЛИ';
  if (duelResultDesc) {
    const diff = Math.abs(myScore - oppScore);
    duelResultDesc.textContent = isPlayerWinner
      ? `Поздравляем! Ты обошёл соперника на ${diff} очков!`
      : `Соперник набрал на ${diff} очков больше. Потребуй реванш!`;
  }

  if (summaryMyName) summaryMyName.textContent = myName || currentUser.username;
  if (summaryMyAvatar && currentUser.avatar) summaryMyAvatar.src = currentUser.avatar;
  if (summaryMyScore) summaryMyScore.textContent = myScore;
  if (summaryMyMaxTile) summaryMyMaxTile.textContent = `🎯 ${myMaxTile}`;

  if (summaryOppName) summaryOppName.textContent = oppName;
  if (summaryOppScore) summaryOppScore.textContent = oppScore;
  if (summaryOppMaxTile) summaryOppMaxTile.textContent = `🎯 ${oppMaxTile}`;
  if (summaryOppAvatar && oppAvatar) summaryOppAvatar.src = oppAvatar;

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
   7. Discord Identity & Final Score Saving
======================================================== */
async function fetchProfile() {
  const urlParams = new URLSearchParams(window.location.search);
  const channelIdParam = urlParams.get('channel_id');
  if (channelIdParam) roomId = channelIdParam;

  try {
    const identRes = await fetch(`/api/identify?channelId=${roomId}`);
    if (identRes.ok) {
      const identData = await identRes.json();
      if (identData.inviteUrl) cachedInviteUrl = identData.inviteUrl;

      if (identData.user) {
        currentUser.id = identData.user.userId;
        currentUser.username = identData.user.username;
        if (identData.user.avatar) currentUser.avatar = identData.user.avatar;
      }
      if (identData.bestScore !== undefined && identData.bestScore > 0) {
        setBestScore(identData.bestScore);
      }
      if (identData.bestSnake !== undefined && identData.bestSnake > 0) {
        bestScoreSnake = identData.bestSnake;
      }
      updateProfileUI();
      console.log(`[профиль] Discord профиль: ${currentUser.username} (${currentUser.id})`);
    }
  } catch (err) {
    console.warn('[профиль] Ошибка получения профиля:', err);
  }
}

async function initDiscord() {
  await fetchProfile();

  // Попытка нативного OAuth в Discord SDK
  try {
    const { DiscordSDK } = await import('https://esm.sh/@discord/embedded-app-sdk');
    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();

    if (discordSdk.channelId) {
      roomId = discordSdk.channelId;
      await fetchProfile();
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
        currentUser.avatar = `https://cdn.discordapp.com/avatars/${discordSdk.user.id}/${discordSdk.user.avatar}.png?size=256`;
      }
      updateProfileUI();
      fetchUserBestScore();
    }
  } catch (err) {
    console.log('[Discord SDK] Работа в связке с сервером:', err.message);
  }

  updateProfileUI();
  fetchUserBestScore();
}

async function fetchUserBestScore() {
  try {
    const res2048 = await fetch(`/api/score?userId=${currentUser.id}&game=2048`);
    if (res2048.ok) {
      const data = await res2048.json();
      if (data.best) setBestScore(data.best);
    }
    const resSnake = await fetch(`/api/score?userId=${currentUser.id}&game=snake`);
    if (resSnake.ok) {
      const data = await resSnake.json();
      if (data.best) bestScoreSnake = data.best;
    }
  } catch {}
  updateProfileUI();
}

// СОХРАНЕНИЕ ТОЛЬКО В КОНЦЕ ИГРЫ
async function saveFinalScoreToBot(finalScore) {
  if (finalScore <= 0) return;
  safeStorage.set('venom_2048_best', String(Math.max(bestScore, finalScore)));

  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        username: currentUser.username,
        score: finalScore,
        channelId: roomId,
        game: '2048',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.userId && data.userId !== currentUser.id) {
        currentUser.id = data.userId;
      }
      if (data.best) {
        setBestScore(data.best);
      }
      showToast(`🏆 Рекорд ${finalScore} сохранён в профиль Discord!`);
      console.log(`[рекорд] Финальный счёт ${finalScore} успешно записан в профиль Discord!`);
    }
  } catch {}
}

function setBestScore(val) {
  bestScore = val;
  bestScore2048 = val;
  if (activeGame === '2048' && bestScoreEl) bestScoreEl.textContent = val;
  updateProfileUI();
}

/* ========================================================
   8. 2048 Game Engine: Sliding & Game Loop
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

  if (gameMode === 'duel' && duelState === 'playing') triggerDuelSync();
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
  if (activeGame !== '2048' || isGameOver || isMoving || (gameMode === 'duel' && duelState !== 'playing')) return;

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

    // Обновляем лучший счёт локально
    if (score > bestScore) {
      setBestScore(score);
    }

    // В дуэли транслируем текущие очки сопернику
    if (gameMode === 'duel' && duelState === 'playing') {
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

// Завершение игры: ТОЛЬКО ЗДЕСЬ сохраняются очки в профиль
function handleGameOver() {
  saveFinalScoreToBot(score);

  if (gameMode === 'duel') {
    duelState = 'finished';
    triggerDuelSync();

    if (isBotActive) {
      stopBotDuel();
      showDuelResults({
        isPlayerWinner: score >= botScore,
        myName: currentUser.username,
        myScore: score,
        myMaxTile: getMaxTile(),
        oppName: 'Бот Вася',
        oppAvatar: 'https://cdn.discordapp.com/embed/avatars/2.png',
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
        oppAvatar: lastOpponent.avatar || 'https://cdn.discordapp.com/embed/avatars/1.png',
        oppScore: lastOpponent.score,
        oppMaxTile: lastOpponent.maxTile || 2,
      });
      return;
    }
  }

  // Одиночная игра: Game Over
  if (overlayScoreEl) overlayScoreEl.textContent = score;
  if (gameOverOverlay) gameOverOverlay.classList.remove('hidden');
}

/* ========================================================
   9. Controls & Input Listeners
======================================================== */
window.addEventListener('keydown', (e) => {
  if (activeGame !== '2048') return;

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
      if (activeGame !== '2048') return;
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
      if (activeGame !== '2048') return;
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
setupModes();
setupGameSwitcher();
updateProfileUI();
initDiscord();
initGame();
switchActiveGame('hub');
