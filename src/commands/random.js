'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const dota = require('../data/dota');
const { StratzClient } = require('../stratz');

const ROLE_ID = () => process.env.DOTA_ROLE_ID || '1554512622634803223';

const stratz = new StratzClient();

/** Участники с нужной ролью, ботов пропускаем. */
function membersWithRole(guild, roleId) {
  if (!guild) return [];
  const role = guild.roles?.cache?.get(roleId);
  if (!role) return [];
  const ids = role.members ? [...role.members.keys()] : [];
  return ids
    .map((id) => guild.members?.cache?.get(id))
    .filter(Boolean)
    .filter((m) => !m.user.bot);
}

/**
 * Герои для позиции: сперва Stratz (топ по пик-рейту), при ошибке —
 * локальный список. Возвращает { list, source }.
 */
function heroesForPosition(posKey, stratzByPosition, rng) {
  const meta = stratzByPosition?.[posKey];
  if (Array.isArray(meta) && meta.length > 0) {
    return { list: meta.map((h) => h.name), source: 'stratz' };
  }
  return { list: dota.heroesFor(posKey).map((h) => h.name), source: 'local' };
}

/** Собирает состав: игрок → герой → позиция и линия. */
function buildLineup(members, rng = Math.random, stratzByPosition = null) {
  const usedHeroes = new Set();
  const usedPlayers = new Set();
  const rows = [];
  let source = 'local';

  for (const posKey of dota.ORDER) {
    const pos = dota.POSITIONS[posKey];
    const { list, source: used } = heroesForPosition(posKey, stratzByPosition, rng);
    if (used === 'stratz') source = 'stratz';

    const free = list.filter((name) => !usedHeroes.has(name));
    const heroName = dota.pick(free.length ? free : list, rng);
    usedHeroes.add(heroName);

    const freePlayers = members.filter((m) => !usedPlayers.has(m.id));
    const member = freePlayers.length ? dota.pick(freePlayers, rng) : null;
    if (member) usedPlayers.add(member.id);

    rows.push({ pos, hero: heroName, member });
  }

  return { rows, source };
}

function buildLineupContainer({ lineup, roleName }) {
  const { rows, source } = lineup;
  const container = new ContainerBuilder().setAccentColor(0x818cf8);

  const lines = rows.map((row) => {
    const who = row.member ? `<@${row.member.id}>` : '*слот свободен*';
    return `• ${row.pos.emoji} **${row.hero}** (${row.pos.label}) — ${who} · *${row.pos.lane}*`;
  });

  const players = rows.filter((r) => r.member).map((r) => r.member.id);

  const content = [
    '### 🎮 Состав на Доту 2',
    lines.join('\n'),
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const metaText = `📊 Источник: *${source === 'stratz' ? 'Stratz мета' : 'проверенный пул'}*${roleName ? ` · роль: *${roleName}*` : ''}`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(metaText));

  return { container, embed: container, players };
}

function buildEmptyContainer(roleId) {
  const container = new ContainerBuilder().setAccentColor(0xfca5a5);
  const text = [
    '### ⚠️ Никого не нашлось',
    `Для сбора команды нужны участники с ролью \`${roleId}\`.`,
    'Проверь настройки роли в `.env` (DOTA_ROLE_ID).',
  ].join('\n');
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return container;
}

async function handleRANDOM(interaction) {
  const roleId = ROLE_ID();
  const guild = interaction.guild;
  const role = guild?.roles?.cache?.get(roleId);
  const members = membersWithRole(guild, roleId);

  if (members.length === 0) {
    const container = buildEmptyContainer(roleId);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
      await interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }
    return;
  }

  const { container, players } = buildLineupContainer({
    lineup: buildLineup(members, Math.random, await stratz.load()),
    roleName: role?.name,
  });

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: players },
  };

  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply(payload);
}

module.exports = {
  handleRANDOM,
  membersWithRole,
  buildLineup,
  heroesForPosition,
  buildLineupContainer,
  buildEmptyContainer,
  buildLineupEmbed: buildLineupContainer,
  buildEmptyEmbed: buildEmptyContainer,
  stratz,
  ROLE_ID,
};