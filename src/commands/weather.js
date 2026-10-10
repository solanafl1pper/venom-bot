'use strict';

const { EmbedBuilder } = require('discord.js');
const { getWeather } = require('../weather');

const DEFAULT_CITY = () => process.env.WEATHER_CITY || 'Москва';

const TIPS = [
  'Зонт в сумку, или будет мокро.',
  'Если на улице так — сиди дома и играй в 2048.',
  'Погода не портит настроение. Настроение портит погода.',
  'Когда зонт не нужен — значит, будет дождь.',
  'Температура терпимая. Куртка лишняя.',
];

function pickTip(rng = Math.random) {
  return TIPS[Math.floor(rng() * TIPS.length)];
}

function buildWeatherEmbed(weather, requested) {
  const embed = new EmbedBuilder()
    .setColor(0x60a5fa)
    .setTitle(`${weather.emoji} ${weather.city}`)
    .addFields(
      { name: 'Сейчас', value: `${weather.temp}\n${weather.text}`, inline: true },
      { name: 'Статус', value: requested ? `спросил: ${requested}` : 'город по умолчанию', inline: true },
    )
    .setFooter({ text: pickTip() })
    .setTimestamp();

  return embed;
}

function buildErrorEmbed(city, err) {
  return new EmbedBuilder()
    .setColor(0xfb7185)
    .setTitle('🌧️ Не получилось')
    .setDescription(
      `Не смог узнать погоду${city ? ` для «${city}»` : ''}.\n` +
        'Проверь название города или попробуй позже.\n' +
        `Ответ сервера: \`${err}\``,
    );
}

function registerWeather(client) {
  client.handleWeather = async (interaction, storage) => {
    const requested = (interaction.options?.getString?.('город') || '').trim();
    const city = requested || DEFAULT_CITY();

    let weather;
    try {
      weather = await getWeather(city);
    } catch (err) {
      console.error('[погода]', err.message);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [buildErrorEmbed(city, err.message)] });
      } else {
        await interaction.reply({ embeds: [buildErrorEmbed(city, err.message)], ephemeral: true });
      }
      return;
    }

    if (!weather) {
      const msg = 'Погодный сервис молчит. Попробуй через минуту.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [buildErrorEmbed(city, msg)] });
      } else {
        await interaction.reply({ embeds: [buildErrorEmbed(city, msg)], ephemeral: true });
      }
      return;
    }

    const embed = buildWeatherEmbed(weather, requested);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  };

  return client.handleWeather;
}

module.exports = { registerWeather, buildWeatherEmbed, buildErrorEmbed, pickTip, TIPS };