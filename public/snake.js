'use strict';

/* ========================================================
   SNAKE GAME ENGINE (ЗМЕЙКА · ПЛАВНЫЙ РЕЖИМ, МЕНЮ, СОЛО И ДУЭЛЬ)
======================================================== */

const GRID_SIZE = 20;

export class SnakeGame {
  constructor(options = {}) {
    this.canvas = document.getElementById('snakeCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.getCurrentUser = options.getCurrentUser || (() => ({ id: '566547457568276494', username: 'baal worship', avatar: '' }));
    this.getRoomId = options.getRoomId || (() => 'default_room');
    this.showToast = options.showToast || ((msg) => console.log(msg));
    this.onScoreUpdate = options.onScoreUpdate || (() => {});
    this.openChannelSelect = options.openChannelSelect || (() => {});

    // State: 'menu' | 'playing' | 'gameover' | 'duel_lobby' | 'duel_playing' | 'duel_results'
    this.state = 'menu';
    this.mode = 'solo'; // 'solo' | 'duel'
    this.duelState = 'lobby'; // 'lobby' | 'playing' | 'finished'
    this.isBotActive = false;
    this.lastOpponent = null;
    this.duelPollTimer = null;

    // Timing & Smooth Animation
    this.speedMode = 'normal'; // 'normal' (120ms) | 'fast' (78ms)
    this.stepInterval = 120;
    this.lastStepTime = performance.now();
    this.isRunning = false;
    this.rafId = null;

    this.score = 0;
    this.bestScore = 0;
    this.oppScore = 0;
    this.isGameOver = false;

    // Snake 1 (Player)
    this.snake1 = {
      body: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
      prevBody: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#10b981',
      headColor: '#059669',
      score: 0,
      ateApple: false,
    };

    // Snake 2 (Opponent / Bot Vasya in Duel)
    this.snake2 = {
      body: [{ x: 15, y: 10 }, { x: 16, y: 10 }, { x: 17, y: 10 }],
      prevBody: [{ x: 15, y: 10 }, { x: 16, y: 10 }, { x: 17, y: 10 }],
      dir: { x: -1, y: 0 },
      nextDir: { x: -1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#f59e0b',
      headColor: '#d97706',
      score: 0,
      ateApple: false,
    };

    // Food
    this.apples = [];
    this.goldenApple = null;

    // DOM Elements
    this.initDOMElements();
    this.initEvents();
    this.setupCanvas();
    this.fetchBestScore();
  }

  initDOMElements() {
    this.btnModeSolo = document.getElementById('btnSnakeModeSolo');
    this.btnModeDuel = document.getElementById('btnSnakeModeDuel');
    this.duelSection = document.getElementById('snakeDuelSection');

    // Menu Overlay Elements
    this.menuOverlay = document.getElementById('snakeMenuOverlay');
    this.menuRecordVal = document.getElementById('snakeMenuRecordVal');
    this.btnStartGame = document.getElementById('btnSnakeStartGame');
    this.btnMenuDuel = document.getElementById('btnSnakeMenuDuel');
    this.btnSpeedNormal = document.getElementById('btnSpeedNormal');
    this.btnSpeedFast = document.getElementById('btnSpeedFast');
    this.btnSnakeMenu = document.getElementById('btnSnakeMenu');
    this.btnGameOverMenu = document.getElementById('btnSnakeGameOverMenu');
    this.btnLobbyBackMenu = document.getElementById('btnSnakeLobbyBackMenu');

    // Duel HUD
    this.myAvatarEl = document.getElementById('snakeMyAvatar');
    this.myNameEl = document.getElementById('snakeMyName');
    this.myScoreEl = document.getElementById('snakeMyScore');
    this.myLengthEl = document.getElementById('snakeMyLength');

    this.oppAvatarEl = document.getElementById('snakeOppAvatar');
    this.oppNameEl = document.getElementById('snakeOppName');
    this.oppScoreEl = document.getElementById('snakeOppScore');
    this.oppLengthEl = document.getElementById('snakeOppLength');

    this.statusTextEl = document.getElementById('snakeDuelStatusText');
    this.barMeEl = document.getElementById('snakeDuelBarMe');
    this.barOppEl = document.getElementById('snakeDuelBarOpp');

    // Overlays
    this.lobbyOverlay = document.getElementById('snakeLobbyOverlay');
    this.lobbyMyAvatar = document.getElementById('snakeLobbyMyAvatar');
    this.lobbyMyName = document.getElementById('snakeLobbyMyName');
    this.lobbyOppAvatar = document.getElementById('snakeLobbyOppAvatar');
    this.lobbyOppName = document.getElementById('snakeLobbyOppName');
    this.lobbyOppStatus = document.getElementById('snakeLobbyOppStatus');

    this.btnStartDuel = document.getElementById('btnSnakeStartDuel');
    this.btnBotChoice = document.getElementById('btnSnakeBotChoice');
    this.btnInviteChat = document.getElementById('btnSnakeInviteChat');
    this.btnCopyInvite = document.getElementById('btnSnakeCopyInvite');

    this.gameOverOverlay = document.getElementById('snakeGameOverOverlay');
    this.overlayScoreEl = document.getElementById('snakeOverlayScore');
    this.btnOverlayRestart = document.getElementById('btnSnakeOverlayRestart');

    this.duelResultOverlay = document.getElementById('snakeDuelResultOverlay');
    this.duelResultIcon = document.getElementById('snakeDuelResultIcon');
    this.duelResultTitle = document.getElementById('snakeDuelResultTitle');
    this.duelResultDesc = document.getElementById('snakeDuelResultDesc');
    this.summaryMyAvatar = document.getElementById('snakeSummaryMyAvatar');
    this.summaryMyName = document.getElementById('snakeSummaryMyName');
    this.summaryMyScore = document.getElementById('snakeSummaryMyScore');
    this.summaryMyLength = document.getElementById('snakeSummaryMyLength');
    this.summaryOppAvatar = document.getElementById('snakeSummaryOppAvatar');
    this.summaryOppName = document.getElementById('snakeSummaryOppName');
    this.summaryOppScore = document.getElementById('snakeSummaryOppScore');
    this.summaryOppLength = document.getElementById('snakeSummaryOppLength');
    this.btnDuelRematch = document.getElementById('btnSnakeDuelRematch');
    this.btnBackToLobby = document.getElementById('btnSnakeBackToLobby');

    // Controls
    this.btnNewGame = document.getElementById('btnSnakeNewGame');
    this.btnStopGame = document.getElementById('btnSnakeStopGame');
  }

  setupCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.min(rect.width || 380, rect.height || 380);
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvasSize = size;
    this.dpr = dpr;

    if (this.ctx) {
      this.ctx.resetTransform?.();
      this.ctx.scale(dpr, dpr);
    }
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.setupCanvas();
      this.render(1);
    });

    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
      if (document.getElementById('sectionSnake')?.classList.contains('hidden')) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
        case 'ц':
        case 'Ц':
          e.preventDefault();
          this.changeDirection(0, -1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
        case 'ы':
        case 'Ы':
          e.preventDefault();
          this.changeDirection(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
        case 'ф':
        case 'Ф':
          e.preventDefault();
          this.changeDirection(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
        case 'в':
        case 'В':
          e.preventDefault();
          this.changeDirection(1, 0);
          break;
      }
    });

    // Touch Swipe Controls on Canvas
    let touchStartX = 0;
    let touchStartY = 0;

    if (this.canvas) {
      this.canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      this.canvas.addEventListener('touchend', (e) => {
        if (!touchStartX || !touchStartY) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (Math.max(absX, absY) > 20) {
          if (absX > absY) {
            this.changeDirection(dx > 0 ? 1 : -1, 0);
          } else {
            this.changeDirection(0, dy > 0 ? 1 : -1);
          }
        }
        touchStartX = 0;
        touchStartY = 0;
      }, { passive: true });
    }

    // On-screen D-Pad buttons
    const bindDpad = (id, dx, dy) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.changeDirection(dx, dy);
        });
      }
    };
    bindDpad('snakeBtnU', 0, -1);
    bindDpad('snakeBtnD', 0, 1);
    bindDpad('snakeBtnL', -1, 0);
    bindDpad('snakeBtnR', 1, 0);

    // Menu Buttons
    if (this.btnStartGame) this.btnStartGame.onclick = () => this.startSoloGame();
    if (this.btnMenuDuel) this.btnMenuDuel.onclick = () => this.switchMode('duel');

    if (this.btnSpeedNormal) {
      this.btnSpeedNormal.onclick = () => this.setSpeed('normal');
    }
    if (this.btnSpeedFast) {
      this.btnSpeedFast.onclick = () => this.setSpeed('fast');
    }

    if (this.btnSnakeMenu) this.btnSnakeMenu.onclick = () => this.showMenu();
    if (this.btnGameOverMenu) this.btnGameOverMenu.onclick = () => this.showMenu();
    if (this.btnLobbyBackMenu) this.btnLobbyBackMenu.onclick = () => this.showMenu();

    // Mode Buttons
    if (this.btnModeSolo) {
      this.btnModeSolo.onclick = () => this.switchMode('solo');
    }
    if (this.btnModeDuel) {
      this.btnModeDuel.onclick = () => this.switchMode('duel');
    }

    // Action buttons
    if (this.btnNewGame) this.btnNewGame.onclick = () => this.startSoloGame();
    if (this.btnOverlayRestart) this.btnOverlayRestart.onclick = () => this.startSoloGame();

    if (this.btnStopGame) {
      this.btnStopGame.onclick = () => {
        if (this.isGameOver || this.state === 'menu') return;
        this.stopGame(true);
      };
    }

    // Duel Actions
    if (this.btnStartDuel) this.btnStartDuel.onclick = () => this.startDuelMatch(false);
    if (this.btnBotChoice) this.btnBotChoice.onclick = () => this.startDuelMatch(true);

    if (this.btnInviteChat) {
      this.btnInviteChat.onclick = () => {
        this.openChannelSelect('snake');
      };
    }

    if (this.btnCopyInvite) {
      this.btnCopyInvite.onclick = async () => {
        const url = window.location.href;
        try {
          await navigator.clipboard.writeText(url);
          this.showToast('📋 Ссылка на дуэль скопирована!');
        } catch {
          this.showToast('Ссылка: ' + url);
        }
      };
    }

    if (this.btnDuelRematch) {
      this.btnDuelRematch.onclick = () => {
        this.startDuelMatch(this.isBotActive);
      };
    }

    if (this.btnBackToLobby) {
      this.btnBackToLobby.onclick = () => {
        this.openLobby();
      };
    }
  }

  setSpeed(mode) {
    this.speedMode = mode;
    this.stepInterval = mode === 'fast' ? 78 : 120;
    if (this.btnSpeedNormal) {
      this.btnSpeedNormal.classList.toggle('active', mode === 'normal');
    }
    if (this.btnSpeedFast) {
      this.btnSpeedFast.classList.toggle('active', mode === 'fast');
    }
  }

  showMenu() {
    this.state = 'menu';
    this.stopLoop();
    this.isGameOver = false;

    if (this.btnModeSolo) this.btnModeSolo.classList.add('active');
    if (this.btnModeDuel) this.btnModeDuel.classList.remove('active');
    if (this.duelSection) this.duelSection.classList.add('hidden');
    if (this.lobbyOverlay) this.lobbyOverlay.classList.add('hidden');
    if (this.gameOverOverlay) this.gameOverOverlay.classList.add('hidden');
    if (this.duelResultOverlay) this.duelResultOverlay.classList.add('hidden');
    if (this.menuOverlay) this.menuOverlay.classList.remove('hidden');

    if (this.menuRecordVal) this.menuRecordVal.textContent = this.bestScore || 0;

    // Peaceful preview state on canvas
    this.snake1 = {
      body: [
        { x: 9, y: 10 },
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
        { x: 5, y: 10 },
      ],
      prevBody: [
        { x: 9, y: 10 },
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
        { x: 5, y: 10 },
      ],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#10b981',
      headColor: '#059669',
      score: 0,
      ateApple: false,
    };
    this.apples = [{ x: 14, y: 10 }];
    this.goldenApple = null;

    this.startPreviewLoop();
  }

  changeDirection(dx, dy) {
    if (this.isGameOver || this.state === 'menu') return;
    const queue = this.snake1.inputQueue;
    const lastDir = queue.length > 0 ? queue[queue.length - 1] : this.snake1.dir;

    // Запрет разворота на 180 градусов
    if (lastDir.x === -dx && lastDir.x !== 0) return;
    if (lastDir.y === -dy && lastDir.y !== 0) return;

    // Игнорируем нажатие той же кнопки
    if (lastDir.x === dx && lastDir.y === dy) return;

    if (queue.length < 2) {
      queue.push({ x: dx, y: dy });
    }
  }

  switchMode(newMode) {
    this.mode = newMode;
    if (newMode === 'solo') {
      if (this.btnModeSolo) this.btnModeSolo.classList.add('active');
      if (this.btnModeDuel) this.btnModeDuel.classList.remove('active');
      if (this.duelSection) this.duelSection.classList.add('hidden');
      if (this.lobbyOverlay) this.lobbyOverlay.classList.add('hidden');
      this.stopDuelPolling();
      this.showMenu();
    } else {
      if (this.btnModeDuel) this.btnModeDuel.classList.add('active');
      if (this.btnModeSolo) this.btnModeSolo.classList.remove('active');
      if (this.menuOverlay) this.menuOverlay.classList.add('hidden');
      this.openLobby();
      this.startDuelPolling();
    }
  }

  openLobby() {
    this.duelState = 'lobby';
    this.state = 'duel_lobby';
    this.stopLoop();
    this.isBotActive = false;
    if (this.menuOverlay) this.menuOverlay.classList.add('hidden');
    if (this.duelSection) this.duelSection.classList.add('hidden');
    if (this.duelResultOverlay) this.duelResultOverlay.classList.add('hidden');
    if (this.gameOverOverlay) this.gameOverOverlay.classList.add('hidden');
    if (this.lobbyOverlay) this.lobbyOverlay.classList.remove('hidden');

    const user = this.getCurrentUser();
    if (this.lobbyMyName) this.lobbyMyName.textContent = user.username;
    if (this.lobbyMyAvatar && user.avatar) this.lobbyMyAvatar.src = user.avatar;

    // Peaceful preview for duel lobby
    this.snake1 = {
      body: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }],
      prevBody: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#10b981',
      headColor: '#059669',
      score: 0,
      ateApple: false,
    };
    this.snake2 = {
      body: [{ x: 15, y: 15 }, { x: 16, y: 15 }, { x: 17, y: 15 }],
      prevBody: [{ x: 15, y: 15 }, { x: 16, y: 15 }, { x: 17, y: 15 }],
      dir: { x: -1, y: 0 },
      nextDir: { x: -1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#f59e0b',
      headColor: '#d97706',
      score: 0,
      ateApple: false,
    };
    this.apples = [{ x: 10, y: 10 }];
    this.goldenApple = null;
    this.render(1);
  }

  startSoloGame() {
    this.mode = 'solo';
    this.state = 'playing';
    this.isGameOver = false;
    this.score = 0;
    this.onScoreUpdate(0, this.bestScore);

    if (this.menuOverlay) this.menuOverlay.classList.add('hidden');
    if (this.gameOverOverlay) this.gameOverOverlay.classList.add('hidden');
    if (this.duelResultOverlay) this.duelResultOverlay.classList.add('hidden');
    if (this.lobbyOverlay) this.lobbyOverlay.classList.add('hidden');
    if (this.duelSection) this.duelSection.classList.add('hidden');

    this.snake1 = {
      body: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
      prevBody: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#10b981',
      headColor: '#059669',
      score: 0,
      ateApple: false,
    };

    this.apples = [this.getRandomEmptyCell([this.snake1.body])];
    this.goldenApple = null;

    this.startLoop();
    this.render(0);
  }

  startDuelMatch(withBot = false) {
    this.mode = 'duel';
    this.duelState = 'playing';
    this.state = 'duel_playing';
    this.isGameOver = false;
    this.isBotActive = withBot;

    if (this.menuOverlay) this.menuOverlay.classList.add('hidden');
    if (this.lobbyOverlay) this.lobbyOverlay.classList.add('hidden');
    if (this.duelResultOverlay) this.duelResultOverlay.classList.add('hidden');
    if (this.duelSection) this.duelSection.classList.remove('hidden');

    const user = this.getCurrentUser();
    if (this.myNameEl) this.myNameEl.textContent = user.username;
    if (this.myAvatarEl && user.avatar) this.myAvatarEl.src = user.avatar;

    if (withBot) {
      if (this.oppNameEl) this.oppNameEl.textContent = 'Бот Вася';
      if (this.oppAvatarEl) this.oppAvatarEl.src = 'https://cdn.discordapp.com/embed/avatars/2.png';
      this.showToast('⚔️ Дуэль с ботом на одной карте началась!');
    } else {
      if (this.lastOpponent) {
        if (this.oppNameEl) this.oppNameEl.textContent = this.lastOpponent.username;
        if (this.oppAvatarEl && this.lastOpponent.avatar) this.oppAvatarEl.src = this.lastOpponent.avatar;
      }
      this.showToast('⚔️ Дуэль игроков на одной карте началась!');
    }

    this.snake1 = {
      body: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }],
      prevBody: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#10b981',
      headColor: '#059669',
      score: 0,
      ateApple: false,
    };

    this.snake2 = {
      body: [{ x: 15, y: 15 }, { x: 16, y: 15 }, { x: 17, y: 15 }],
      prevBody: [{ x: 15, y: 15 }, { x: 16, y: 15 }, { x: 17, y: 15 }],
      dir: { x: -1, y: 0 },
      nextDir: { x: -1, y: 0 },
      inputQueue: [],
      isAlive: true,
      color: '#f59e0b',
      headColor: '#d97706',
      score: 0,
      ateApple: false,
    };

    this.apples = [
      { x: 10, y: 10 },
      { x: 5, y: 15 },
      { x: 15, y: 5 },
    ];

    this.updateDuelHUD();
    this.startLoop();
    this.render(0);
  }

  startLoop() {
    this.stopLoop();
    this.isRunning = true;
    this.lastStepTime = performance.now();

    const loop = (timestamp) => {
      if (!this.isRunning) return;

      const now = performance.now();
      const delta = now - this.lastStepTime;

      if (delta >= this.stepInterval) {
        this.step();
        this.lastStepTime = now;
      }

      if (this.isGameOver) return;

      const t = Math.min(1, Math.max(0, (now - this.lastStepTime) / this.stepInterval));
      this.render(t);

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stopLoop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  startPreviewLoop() {
    this.stopLoop();
    this.isRunning = true;
    const loop = () => {
      if (!this.isRunning || this.state !== 'menu') return;
      this.render(1);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  step() {
    if (this.isGameOver) return;

    // 1. Потребляем очередь направления Змейки 1
    if (this.snake1.inputQueue.length > 0) {
      this.snake1.nextDir = this.snake1.inputQueue.shift();
    }
    this.snake1.dir = { ...this.snake1.nextDir };

    if (this.mode === 'duel') {
      if (this.isBotActive) {
        this.stepBotVasyaAI();
      }
      this.snake2.dir = { ...this.snake2.nextDir };
    }

    // Сохраняем предыдущие координаты для плавной интерполяции
    this.snake1.prevBody = this.snake1.body.map((p) => ({ x: p.x, y: p.y }));
    if (this.mode === 'duel') {
      this.snake2.prevBody = this.snake2.body.map((p) => ({ x: p.x, y: p.y }));
    }

    // 2. Двигаем Змейку 1
    const head1 = {
      x: this.snake1.body[0].x + this.snake1.dir.x,
      y: this.snake1.body[0].y + this.snake1.dir.y,
    };

    // 3. Двигаем Змейку 2 (если дуэль)
    let head2 = null;
    if (this.mode === 'duel') {
      head2 = {
        x: this.snake2.body[0].x + this.snake2.dir.x,
        y: this.snake2.body[0].y + this.snake2.dir.y,
      };
    }

    // 4. Проверка столкновений Змейки 1 (стены и собственный хвост)
    if (head1.x < 0 || head1.x >= GRID_SIZE || head1.y < 0 || head1.y >= GRID_SIZE) {
      this.snake1.isAlive = false;
    }
    if (this.snake1.body.some((seg, idx) => idx > 0 && seg.x === head1.x && seg.y === head1.y)) {
      this.snake1.isAlive = false;
    }

    // 5. Проверка столкновений Змейки 2 (стены и свой хвост)
    if (this.mode === 'duel') {
      if (head2.x < 0 || head2.x >= GRID_SIZE || head2.y < 0 || head2.y >= GRID_SIZE) {
        this.snake2.isAlive = false;
      }
      if (this.snake2.body.some((seg, idx) => idx > 0 && seg.x === head2.x && seg.y === head2.y)) {
        this.snake2.isAlive = false;
      }

      // Перекрёстные столкновения
      if (head1.x === head2.x && head1.y === head2.y) {
        if (this.snake1.body.length > this.snake2.body.length) {
          this.snake2.isAlive = false;
        } else if (this.snake2.body.length > this.snake1.body.length) {
          this.snake1.isAlive = false;
        } else {
          this.snake1.isAlive = false;
          this.snake2.isAlive = false;
        }
      }

      if (this.snake2.body.some((seg) => seg.x === head1.x && seg.y === head1.y)) {
        this.snake1.isAlive = false;
        this.snake2.score += 100;
      }

      if (this.snake1.body.some((seg) => seg.x === head2.x && seg.y === head2.y)) {
        this.snake2.isAlive = false;
        this.snake1.score += 100;
      }
    }

    // Если кто-то погиб
    if (!this.snake1.isAlive || (this.mode === 'duel' && !this.snake2.isAlive)) {
      this.handleGameOver();
      return;
    }

    // Добавляем новые головы
    this.snake1.body.unshift(head1);
    if (this.mode === 'duel') {
      this.snake2.body.unshift(head2);
    }

    // 6. Поедание яблок Змейкой 1
    const apple1Idx = this.apples.findIndex((a) => a.x === head1.x && a.y === head1.y);
    if (apple1Idx !== -1) {
      this.snake1.score += 10;
      this.snake1.ateApple = true;
      this.score = this.snake1.score;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        if (this.menuRecordVal) this.menuRecordVal.textContent = this.bestScore;
      }
      this.onScoreUpdate(this.score, this.bestScore);
      this.apples[apple1Idx] = this.getRandomEmptyCell([this.snake1.body, this.snake2.body]);
      if (this.mode === 'solo' && Math.random() < 0.25 && !this.goldenApple) {
        this.goldenApple = this.getRandomEmptyCell([this.snake1.body]);
      }
    } else if (this.goldenApple && head1.x === this.goldenApple.x && head1.y === this.goldenApple.y) {
      this.snake1.score += 30;
      this.snake1.ateApple = true;
      this.score = this.snake1.score;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        if (this.menuRecordVal) this.menuRecordVal.textContent = this.bestScore;
      }
      this.onScoreUpdate(this.score, this.bestScore);
      this.goldenApple = null;
    } else {
      this.snake1.ateApple = false;
      this.snake1.body.pop();
    }

    // 7. Поедание яблок Змейкой 2 (в дуэли)
    if (this.mode === 'duel') {
      const apple2Idx = this.apples.findIndex((a) => a.x === head2.x && a.y === head2.y);
      if (apple2Idx !== -1) {
        this.snake2.score += 10;
        this.snake2.ateApple = true;
        this.apples[apple2Idx] = this.getRandomEmptyCell([this.snake1.body, this.snake2.body]);
      } else {
        this.snake2.ateApple = false;
        this.snake2.body.pop();
      }
      this.updateDuelHUD();
    }
  }

  stepBotVasyaAI() {
    const head = this.snake2.body[0];
    const target = this.apples[0] || { x: 10, y: 10 };

    const candidates = [
      { dir: { x: 0, y: -1 }, next: { x: head.x, y: head.y - 1 } },
      { dir: { x: 0, y: 1 }, next: { x: head.x, y: head.y + 1 } },
      { dir: { x: -1, y: 0 }, next: { x: head.x - 1, y: head.y } },
      { dir: { x: 1, y: 0 }, next: { x: head.x + 1, y: head.y } },
    ];

    const currentDir = this.snake2.dir;

    const safeMoves = candidates.filter((c) => {
      if (c.dir.x === -currentDir.x && currentDir.x !== 0) return false;
      if (c.dir.y === -currentDir.y && currentDir.y !== 0) return false;

      if (c.next.x < 0 || c.next.x >= GRID_SIZE || c.next.y < 0 || c.next.y >= GRID_SIZE) return false;

      if (this.snake2.body.some((seg) => seg.x === c.next.x && seg.y === c.next.y)) return false;
      if (this.snake1.body.some((seg) => seg.x === c.next.x && seg.y === c.next.y)) return false;

      return true;
    });

    if (safeMoves.length === 0) return;

    safeMoves.sort((a, b) => {
      const distA = Math.abs(a.next.x - target.x) + Math.abs(a.next.y - target.y);
      const distB = Math.abs(b.next.x - target.x) + Math.abs(b.next.y - target.y);
      return distA - distB;
    });

    this.snake2.nextDir = safeMoves[0].dir;
  }

  getRandomEmptyCell(bodies = []) {
    let cell;
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      cell = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      const occupied = bodies.some((b) => b && b.some((s) => s.x === cell.x && s.y === cell.y));
      if (!occupied) return cell;
    }
    return { x: 10, y: 10 };
  }

  stopGame(isManual = false) {
    this.isGameOver = true;
    this.stopLoop();
    this.handleGameOver(isManual);
  }

  handleGameOver(isManual = false) {
    this.isGameOver = true;
    this.state = 'gameover';
    this.stopLoop();

    const finalScore = this.snake1.score;
    this.saveScoreToBot(finalScore);

    if (this.mode === 'duel') {
      const isPlayerWinner = this.snake1.isAlive && (!this.snake2.isAlive || this.snake1.score >= this.snake2.score);
      const oppName = this.isBotActive ? 'Бот Вася' : (this.lastOpponent?.username || 'Соперник');
      const oppAvatar = this.isBotActive ? 'https://cdn.discordapp.com/embed/avatars/2.png' : (this.lastOpponent?.avatar || 'https://cdn.discordapp.com/embed/avatars/1.png');

      this.showDuelResults({
        isPlayerWinner,
        myScore: this.snake1.score,
        myLength: this.snake1.body.length,
        oppName,
        oppAvatar,
        oppScore: this.snake2.score,
        oppLength: this.snake2.body.length,
      });
      return;
    }

    // Соло
    if (this.overlayScoreEl) this.overlayScoreEl.textContent = finalScore;
    if (this.gameOverOverlay) this.gameOverOverlay.classList.remove('hidden');
    if (isManual) this.showToast('⏹️ Игра завершена, счёт зафиксирован в профиль!');
    this.render(1);
  }

  updateDuelHUD() {
    if (this.myScoreEl) this.myScoreEl.textContent = this.snake1.score;
    if (this.myLengthEl) this.myLengthEl.textContent = `📏 ${this.snake1.body.length}`;

    if (this.oppScoreEl) this.oppScoreEl.textContent = this.snake2.score;
    if (this.oppLengthEl) this.oppLengthEl.textContent = `📏 ${this.snake2.body.length}`;

    const total = this.snake1.score + this.snake2.score;
    let pct = 50;
    if (total > 0) pct = Math.max(10, Math.min(90, Math.round((this.snake1.score / total) * 100)));

    if (this.barMeEl) this.barMeEl.style.width = `${pct}%`;
    if (this.barOppEl) this.barOppEl.style.width = `${100 - pct}%`;

    if (this.statusTextEl) {
      const diff = this.snake1.score - this.snake2.score;
      if (diff > 0) this.statusTextEl.textContent = `+${diff} ведёшь! 🔥`;
      else if (diff < 0) this.statusTextEl.textContent = `${diff} догоняй! ⚡`;
      else this.statusTextEl.textContent = 'Очки равны! 🤝';
    }
  }

  showDuelResults({ isPlayerWinner, myScore, myLength, oppName, oppAvatar, oppScore, oppLength }) {
    if (this.duelResultIcon) this.duelResultIcon.textContent = isPlayerWinner ? '🏆' : '💀';
    if (this.duelResultTitle) this.duelResultTitle.textContent = isPlayerWinner ? 'ПОБЕДА В ЗМЕЙКЕ!' : 'ПОРАЖЕНИЕ В ЗМЕЙКЕ';
    if (this.duelResultDesc) {
      this.duelResultDesc.textContent = isPlayerWinner
        ? 'Красава! Ты переиграл соперника на одном поле!'
        : 'Соперник выжил дольше. Возьми реванш прямо сейчас!';
    }

    const user = this.getCurrentUser();
    if (this.summaryMyAvatar && user.avatar) this.summaryMyAvatar.src = user.avatar;
    if (this.summaryMyName) this.summaryMyName.textContent = user.username;
    if (this.summaryMyScore) this.summaryMyScore.textContent = myScore;
    if (this.summaryMyLength) this.summaryMyLength.textContent = `📏 ${myLength}`;

    if (this.summaryOppAvatar && oppAvatar) this.summaryOppAvatar.src = oppAvatar;
    if (this.summaryOppName) this.summaryOppName.textContent = oppName;
    if (this.summaryOppScore) this.summaryOppScore.textContent = oppScore;
    if (this.summaryOppLength) this.summaryOppLength.textContent = `📏 ${oppLength}`;

    if (this.duelResultOverlay) this.duelResultOverlay.classList.remove('hidden');
    this.render(1);
  }

  // Расчёт плавных интерполированных координат сегментов
  getInterpolatedPoints(snakeObj, t, cellSize) {
    const body = snakeObj.body;
    const prev = snakeObj.prevBody || body;
    const pts = [];

    for (let i = 0; i < body.length; i++) {
      const p = prev[i] || body[i];
      const c = body[i];
      const ix = p.x + (c.x - p.x) * t;
      const iy = p.y + (c.y - p.y) * t;
      pts.push({
        x: ix,
        y: iy,
        cx: (ix + 0.5) * cellSize,
        cy: (iy + 0.5) * cellSize,
      });
    }

    return pts;
  }

  // Рендеринг холста с плавной интерполяцией
  render(t = 1) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const size = this.canvasSize || 380;
    const cellSize = size / GRID_SIZE;

    ctx.clearRect(0, 0, size, size);

    // Сетка / шахматный фон
    const isDark = document.body.classList.contains('dark-theme');
    const bg1 = isDark ? '#2b2d31' : '#bbada0';
    const bg2 = isDark ? '#26282c' : '#b2a497';

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? bg1 : bg2;
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }

    // Отрисовка Змейки 1 (Зелёная)
    this.renderSnake(this.snake1, cellSize, '#10b981', '#059669', t);

    // Отрисовка Змейки 2 (Оранжевая в Дуэли)
    if (this.mode === 'duel') {
      this.renderSnake(this.snake2, cellSize, '#f59e0b', '#d97706', t);
    }

    // Отрисовка Яблок (🍎)
    for (const apple of this.apples) {
      this.renderApple(apple.x, apple.y, cellSize, false);
    }

    // Отрисовка Золотого Яблока (⭐)
    if (this.goldenApple) {
      this.renderApple(this.goldenApple.x, this.goldenApple.y, cellSize, true);
    }
  }

  renderSnake(snakeObj, cellSize, bodyColor, headColor, t = 1) {
    const ctx = this.ctx;
    const body = snakeObj.body;
    if (!body || body.length === 0) return;

    const pts = this.getInterpolatedPoints(snakeObj, t, cellSize);
    const radius = cellSize * 0.42;

    ctx.save();

    // 1. Непрерывное плавное туловище змейки
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = radius * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(pts[0].cx, pts[0].cy);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].cx, pts[i].cy);
    }
    ctx.stroke();

    // 2. Блик по хребту змейки (объём)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = radius * 0.75;
    ctx.stroke();

    // 3. Голова змейки
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.arc(pts[0].cx, pts[0].cy, radius * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // 4. Направление головы для глазок и языка
    const forwardX = snakeObj.dir.x;
    const forwardY = snakeObj.dir.y;
    const rightX = -forwardY;
    const rightY = forwardX;

    // Высовывающийся раздвоенный язычок
    const now = performance.now();
    const tongueCycle = (now % 1800) / 1800;
    if (tongueCycle < 0.28 && !this.isGameOver) {
      const tongueProgress = Math.sin((tongueCycle / 0.28) * Math.PI);
      const tongueLen = radius * 0.85 * tongueProgress;
      const tx = pts[0].cx + forwardX * (radius * 1.05 + tongueLen);
      const ty = pts[0].cy + forwardY * (radius * 1.05 + tongueLen);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = Math.max(1.5, cellSize * 0.09);
      ctx.beginPath();
      ctx.moveTo(pts[0].cx + forwardX * radius * 0.9, pts[0].cy + forwardY * radius * 0.9);
      ctx.lineTo(tx, ty);
      ctx.lineTo(tx + (forwardX + rightX * 0.6) * 3, ty + (forwardY + rightY * 0.6) * 3);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + (forwardX - rightX * 0.6) * 3, ty + (forwardY - rightY * 0.6) * 3);
      ctx.stroke();
    }

    // 5. Глазки
    const eyeForwardOffset = radius * 0.32;
    const eyeSideOffset = radius * 0.54;
    const eyeR = Math.max(2.5, radius * 0.38);
    const pupilR = Math.max(1.4, eyeR * 0.55);

    const eye1 = {
      x: pts[0].cx + forwardX * eyeForwardOffset + rightX * eyeSideOffset,
      y: pts[0].cy + forwardY * eyeForwardOffset + rightY * eyeSideOffset,
    };
    const eye2 = {
      x: pts[0].cx + forwardX * eyeForwardOffset - rightX * eyeSideOffset,
      y: pts[0].cy + forwardY * eyeForwardOffset - rightY * eyeSideOffset,
    };

    // Белки
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1.x, eye1.y, eyeR, 0, Math.PI * 2);
    ctx.arc(eye2.x, eye2.y, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Зрачки со взглядом вперёд
    const pupilOffset = eyeR * 0.28;
    const p1 = { x: eye1.x + forwardX * pupilOffset, y: eye1.y + forwardY * pupilOffset };
    const p2 = { x: eye2.x + forwardX * pupilOffset, y: eye2.y + forwardY * pupilOffset };

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, pupilR, 0, Math.PI * 2);
    ctx.arc(p2.x, p2.y, pupilR, 0, Math.PI * 2);
    ctx.fill();

    // Блики в зрачках
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p1.x - 0.7, p1.y - 0.7, pupilR * 0.4, 0, Math.PI * 2);
    ctx.arc(p2.x - 0.7, p2.y - 0.7, pupilR * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  renderApple(ax, ay, cellSize, isGolden = false) {
    const ctx = this.ctx;
    const cx = ax * cellSize + cellSize / 2;
    const cy = ay * cellSize + cellSize / 2;

    // Плавная анимация дыхания / пульсации яблока
    const now = performance.now();
    const bounce = Math.sin(now * 0.005 + ax + ay) * 0.05;
    const radius = cellSize * (0.38 + bounce);

    ctx.save();

    // Сияние вокруг золотого яблока
    if (isGolden) {
      const glowR = radius * (1.3 + Math.sin(now * 0.008) * 0.15);
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, glowR);
      grad.addColorStop(0, 'rgba(234, 179, 8, 0.45)');
      grad.addColorStop(1, 'rgba(234, 179, 8, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Тело яблока
    ctx.fillStyle = isGolden ? '#facc15' : '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Блик на яблоке
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Листик
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(cx + radius * 0.35, cy - radius * 0.65, radius * 0.38, radius * 0.2, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Сеть & рекорды
  async fetchBestScore() {
    try {
      const res = await fetch('/api/identify');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.bestSnake === 'number') {
          this.bestScore = data.bestSnake;
          if (this.menuRecordVal) this.menuRecordVal.textContent = this.bestScore;
          this.onScoreUpdate(this.score, this.bestScore);
        }
      }
    } catch {}
  }

  async saveScoreToBot(finalScore) {
    if (!finalScore || finalScore <= 0) return;
    const user = this.getCurrentUser();
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          username: user.username,
          score: finalScore,
          channelId: this.getRoomId(),
          game: 'snake',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.best) {
          this.bestScore = data.best;
          if (this.menuRecordVal) this.menuRecordVal.textContent = this.bestScore;
          this.onScoreUpdate(this.score, this.bestScore);
        }
        this.showToast(`🐍 Рекорд в Змейке (${finalScore}) сохранён в /профиль!`);
      }
    } catch {}
  }

  startDuelPolling() {
    this.stopDuelPolling();
    this.triggerSnakeSync();
    this.duelPollTimer = setInterval(() => this.triggerSnakeSync(), 2000);
  }

  stopDuelPolling() {
    if (this.duelPollTimer) clearInterval(this.duelPollTimer);
    this.duelPollTimer = null;
  }

  async triggerSnakeSync() {
    if (this.mode !== 'duel') return;
    const user = this.getCurrentUser();
    try {
      const res = await fetch('/api/snake/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.getRoomId(),
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
          score: this.snake1.score,
          isAlive: this.snake1.isAlive,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const opponents = (data.players || []).filter((p) => p.userId !== user.id);
        if (opponents.length > 0) {
          this.lastOpponent = opponents[0];
          if (this.lobbyOppName) this.lobbyOppName.textContent = this.lastOpponent.username;
          if (this.lobbyOppAvatar && this.lastOpponent.avatar) this.lobbyOppAvatar.src = this.lastOpponent.avatar;
          if (this.lobbyOppStatus) {
            this.lobbyOppStatus.textContent = 'В ЛОББИ ✅';
            this.lobbyOppStatus.style.color = '#10b981';
          }
        } else {
          this.lastOpponent = null;
          if (this.lobbyOppName) this.lobbyOppName.textContent = 'Ожидание...';
          if (this.lobbyOppStatus) {
            this.lobbyOppStatus.textContent = 'НЕ ПОДКЛЮЧЁН';
            this.lobbyOppStatus.style.color = '#ef4444';
          }
        }
      }
    } catch {}
  }
}
