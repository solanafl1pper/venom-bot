'use strict';

const { EmbedBuilder } = require('discord.js');
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

function buildLineupEmbed({ lineup, roleName }) {
  const { rows, source } = lineup;

  const lines = rows.map((row) => {
    const who = row.member ? `<@${row.member.id}>` : 'слот свободен';
    return `${row.pos.emoji} **${row.hero}** — ${row.pos.label}\n　 ↳ лайн: *${row.pos.lane}* · ${who}`;
  });

  const players = rows.filter((r) => r.member).map((r) => r.member.id);

  const embed = new EmbedBuilder()
    .setColor(0x818cf8)
    .setTitle('🎮 Состав на Доту · Играем вместе!')
    .addFields({ name: '✨ Распределение по позициям', value: lines.join('\n\n') })
    .setFooter({
      text:
        (source === 'stratz' ? 'герои подобраны по мете Stratz' : 'герои из проверенного пула') +
        (roleName ? ` · роль «${roleName}»` : '') +
        ' · без тильта и на победку',
    })
    .setTimestamp();

  return { embed, players };
}

function buildEmptyEmbed(roleId) {
  return new EmbedBuilder()
    .setColor(0xfca5a5)
    .setTitle('Никого не нашлось')
    .setDescription(
      'Для сбора команды нужны участники с ролью, а сейчас никого с ней нет на сервере.\n' +
        `ID роли: \`${roleId}\`\n\n` +
        'Проверь, что роль выдана ребятам, и её ID совпадает с `DOTA_ROLE_ID` в файле `.env`.',
    )
    .setFooter({ text: 'ждём сбор состава' });
}

async function handleRANDOM(interaction) {
  const roleId = ROLE_ID();
  const guild = interaction.guild;
  const role = guild?.roles?.cache?.get(roleId);
  const members = membersWithRole(guild, roleId);

  if (members.length === 0) {
    const embed = buildEmptyEmbed(roleId);
    if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [embed] });
    else await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const { embed, players } = buildLineupEmbed({
    lineup: buildLineup(members, Math.random, await stratz.load()),
    roleName: role?.name,
  });

  const payload = { embeds: [embed], allowedMentions: { users: players } };
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply(payload);
}

module.exports = {
  handleRANDOM,
  membersWithRole,
  buildLineup,
  heroesForPosition,
  buildLineupEmbed,
  buildEmptyEmbed,
  stratz,
  ROLE_ID,
};