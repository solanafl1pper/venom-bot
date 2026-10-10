'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const g = require('../games/game2048');

const TTL_MS = 2 * 60 * 60 * 1000;
const BUTTONS = [
  { dir: 'up', label: '⬆️', style: ButtonStyle.Primary },
  { dir: 'left', label: '⬅️', style: ButtonStyle.Secondary },
  { dir: 'down', label: '⬇️', style: ButtonStyle.Secondary },
  { dir: 'right', label: '➡️', style: ButtonStyle.Secondary },
];

function buildEmbed(game, best) {
  const tile = g.bestTile(game.board);
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('2048')
    .setDescription(`\`\`\`\n${g.render(game.board)}\n\`\`\``)
    .addFields(
      { name: 'Счёт', value: `${game.score}`, inline: true },
      { name: 'Ходов', value: `${game.moves}`, inline: true },
      { name: 'Максимум', value: `${tile}`, inline: true },
    )
    .setFooter({ text: best ? `рекорд: ${best}` : 'рекорд пока пустой' })
    .setTimestamp();

  return embed;
}

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

/** Вторая строка: сдаться и начать заново. */
function buildControlRow(prefix, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:end`)
      .setLabel('🏁 Завершить')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${prefix}:restart`)
      .setLabel('🔄 Заново')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function buildFinishedEmbed(game, best, reason) {
  const tile = g.bestTile(game.board);
  const won = tile >= g.TARGET;
  const headline =
    reason === 'end'
      ? '🏁 Игру завершил игрок'
      : won
        ? '🏆 Собрал 2048!'
        : '🁡 Ходов нет — конец';

  return new EmbedBuilder()
    .setColor(won ? 0xfbbf24 : 0xfb7185)
    .setTitle(headline)
    .setDescription(`\`\`\`\n${g.render(game.board)}\n\`\`\``)
    .addFields(
      { name: 'Счёт', value: `${game.score}`, inline: true },
      { name: 'Максимум', value: `${tile}`, inline: true },
      { name: 'Ходов', value: `${game.moves}`, inline: true },
    )
    .setFooter({ text: `рекорд: ${best ?? game.score}` })
    .setTimestamp();
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

    const message = await interaction.editReply({
      embeds: [buildEmbed(game, best)],
      components: [buildRow(`g2048:${userId}`), buildControlRow(`g2048:${userId}`)],
    });

    remember(message.id, userId, game);
    collect(message, userId);
  };

  function collect(message, userId) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.customId.startsWith(`g2048:${userId}:`),
      time: TTL_MS,
    });

    collector.on('collect', async (i) => {
      const entry = games.get(message.id);
      if (!entry) {
        await i.reply({ content: 'Игра уже закрыта. Начни новую: /2048', ephemeral: true }).catch(() => {});
        return;
      }

      const dir = i.customId.split(':')[2];
      await i.deferUpdate().catch(() => {});

      // Кнопки управления: завершить или начать заново.
      if (dir === 'end' || dir === 'restart') {
        stopTimer(message.id);
        const best = saveBest(userId, entry.game.score);

        if (dir === 'end') {
          await message.edit({
            embeds: [buildFinishedEmbed(entry.game, best, 'end')],
            components: [buildRow(`g2048:${userId}`, true), buildControlRow(`g2048:${userId}`, true)],
          });
          return;
        }

        entry.game = g.createGame();
        games.set(message.id, { ...entry, game: entry.game });
        remember(message.id, userId, entry.game);
        await message.edit({
          embeds: [buildEmbed(entry.game, best)],
          components: [buildRow(`g2048:${userId}`), buildControlRow(`g2048:${userId}`)],
        });
        return;
      }

      const result = g.applyMove(entry.game, dir);
      if (!result.changed) {
        // Ход не изменил поле — сообщаем и не тратим попытку.
        await i.followUp({ content: 'Так поле не сдвинется. Попробуй другую стрелку.', ephemeral: true }).catch(() => {});
        return;
      }

      entry.game = result.state;
      const best = saveBest(userId, entry.game.score);

      if (result.gameOver) {
        stopTimer(message.id);
        await message.edit({
          embeds: [buildFinishedEmbed(entry.game, best, 'over')],
          components: [buildRow(`g2048:${userId}`, true), buildControlRow(`g2048:${userId}`, true)],
        });
        return;
      }

      await message.edit({
        embeds: [buildEmbed(entry.game, best)],
        components: [buildRow(`g2048:${userId}`), buildControlRow(`g2048:${userId}`)],
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
  buildEmbed,
  buildRow,
  buildControlRow,
  buildFinishedEmbed,
  TTL_MS,
};