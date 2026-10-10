'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const g = require('../games/game2048');

const TTL_MS = 2 * 60 * 60 * 1000;
const BUTTONS = [
  { dir: 'up', label: '⬆️', style: ButtonStyle.Primary },
  { dir: 'left', label: '⬅️', style: ButtonStyle.Secondary },
  { dir: 'down', label: '⬇️', style: ButtonStyle.Secondary },
  { dir: 'right', label: '➡️', style: ButtonStyle.Secondary },
];

function buildRow(prefix, disabled = false) {
  return new ActionRowBuilder().addComponents(
    BUTTONS.map((b) =>
      new ButtonBuilder()
        .setCustomId(`${prefix}:${b.dir}`)
        .setLabel(b.label)
        .setStyle(b.style)
        .setDisabled(disabled),
    ),
  );
}

function buildControlRow(prefix, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:end`)
      .setLabel('🏁 Закончить')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${prefix}:restart`)
      .setLabel('🔄 Заново')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function tileColor(tile) {
  if (tile >= 2048) return 0xf59e0b; // Золотой
  if (tile >= 1024) return 0xec4899; // Неоновый розовый
  if (tile >= 512) return 0x06b6d4;  // Неоновый циан
  if (tile >= 128) return 0x3b82f6;  // Яркий синий
  return 0x8b5cf6;                   // Фиолетовый
}

function tileBadge(tile) {
  if (tile >= 2048) return '👑 МАСТЕР 2048';
  if (tile >= 1024) return '🔥 ГРАНДМАСТЕР';
  if (tile >= 512) return '💎 ЭКСПЕРТ';
  if (tile >= 256) return '⚡ ПРОФИ';
  if (tile >= 128) return '🎯 НА РАЗГОНЕ';
  return '🕹️ СТАРТ';
}

function buildGameContainer(game, best, prefix, disabled = false) {
  const tile = g.bestTile(game.board);
  const container = new ContainerBuilder().setAccentColor(tileColor(tile));

  const text = [
    `### 🎮 2048 · ${tileBadge(tile)}`,
    '```',
    g.render(game.board),
    '```',
    `⚡ Счёт: **${game.score}** · ⭐ Макс: **${tile}** · 🎲 Ходов: **${game.moves}**`,
    best ? `🏆 Твой рекорд: **${best}**` : '✨ Установи первый рекорд!',
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  if (prefix) {
    container.addActionRowComponents(buildRow(prefix, disabled), buildControlRow(prefix, disabled));
  }
  return container;
}

function buildFinishedGameContainer(game, best, reason) {
  const tile = g.bestTile(game.board);
  const won = tile >= g.TARGET;
  const headline =
    reason === 'end'
      ? '👋 Партия завершена'
      : won
        ? '👑 ПОБЕДА! Плитка 2048 собрана!'
        : '💥 Игра окончена · Ходов больше нет';

  const container = new ContainerBuilder().setAccentColor(won ? 0xf59e0b : 0xfca5a5);

  const text = [
    `### ${headline}`,
    '```',
    g.render(game.board),
    '```',
    `🎯 Итоговый счёт: **${game.score}** · ⭐ Макс: **${tile}** · 🏆 Рекорд: **${best ?? game.score}**`,
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return container;
}

function registerGame(client, storage) {
  const games = new Map(); // messageId -> { userId, game }

  const stopTimer = (messageId) => {
    const entry = games.get(messageId);
    if (entry?.timer) clearTimeout(entry.timer);
    games.delete(messageId);
  };

  const remember = (messageId, userId, game) => {
    stopTimer(messageId);
    const timer = setTimeout(() => games.delete(messageId), TTL_MS);
    timer.unref?.();
    games.set(messageId, { userId, game, timer });
  };

  const saveBest = (userId, score) => {
    const best = storage.bestScore('2048', userId);
    if (score > best) {
      storage.setBestScore('2048', userId, score);
      return score;
    }
    return best;
  };

  client.handleGame = async (interaction) => {
    const userId = interaction.user.id;
    const game = g.createGame();
    const best = storage.bestScore('2048', userId);
    const prefix = `g2048:${userId}`;

    const container = buildGameContainer(game, best, prefix);
    const message = await interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });

    remember(message.id, userId, game);
    collect(message, userId);
  };

  function collect(message, userId) {
    const prefix = `g2048:${userId}`;
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.customId.startsWith(`${prefix}:`),
      time: TTL_MS,
    });

    collector.on('collect', async (i) => {
      const entry = games.get(message.id);
      if (!entry) {
        const closed = new ContainerBuilder()
          .setAccentColor(0xfca5a5)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('### ⏳ Партия закрыта\nНачни новую: **/2048**'));
        await i.reply({ components: [closed], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] }).catch(() => {});
        return;
      }

      const dir = i.customId.split(':')[2];
      await i.deferUpdate().catch(() => {});

      if (dir === 'end' || dir === 'restart') {
        stopTimer(message.id);
        const best = saveBest(userId, entry.game.score);

        if (dir === 'end') {
          const finished = buildFinishedGameContainer(entry.game, best, 'end');
          await message.edit({
            components: [finished],
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        }

        entry.game = g.createGame();
        games.set(message.id, { ...entry, game: entry.game });
        remember(message.id, userId, entry.game);
        const fresh = buildGameContainer(entry.game, best, prefix);
        await message.edit({
          components: [fresh],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      const result = g.applyMove(entry.game, dir);
      if (!result.changed) {
        const hint = new ContainerBuilder()
          .setAccentColor(0xfca5a5)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('Так поле не сдвинется. Попробуй другую стрелку.'));
        await i.followUp({ components: [hint], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] }).catch(() => {});
        return;
      }

      entry.game = result.state;
      const best = saveBest(userId, entry.game.score);

      if (result.gameOver) {
        stopTimer(message.id);
        const over = buildFinishedGameContainer(entry.game, best, 'over');
        await message.edit({
          components: [over],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      const updated = buildGameContainer(entry.game, best, prefix);
      await message.edit({
        components: [updated],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', () => {
      const entry = games.get(message.id);
      if (!entry) return;
      if (entry.timer) clearTimeout(entry.timer);
      games.delete(message.id);
    });
  }

  return { games, client };
}

module.exports = {
  registerGame,
  buildGameContainer,
  buildFinishedGameContainer,
  buildEmbed: (game, best) => buildGameContainer(game, best),
  buildFinishedEmbed: (game, best, reason) => buildFinishedGameContainer(game, best, reason),
  buildRow,
  buildControlRow,
  TTL_MS,
};