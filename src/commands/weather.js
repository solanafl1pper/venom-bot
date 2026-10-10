'use strict';

const { EmbedBuilder } = require('discord.js');
const { getWeather } = require('../weather');

const DEFAULT_CITY = () => process.env.WEATHER_CITY || 'Москва';

const TIPS = [
  '☕ Заваривай чай или кофе, самое время посидеть в войсе.',
  '🎮 Идеальная погода, чтобы залипнуть в 2048 или катнуть в Доту.',
  '🛋️ Если за окном сыро — плед, дискорд и чилл спасают.',
  '☀️ Кайфовая погодка, не забудь открыть форточку подышать.',
  '✨ Главное — чтобы в нашем чате было тепло и уютно.',
  '🧥 Одевайся по погоде, нам твои сопли в войсе не нужны.',
];

function pickTip(rng = Math.random) {
  return TIPS[Math.floor(rng() * TIPS.length)];
}

function buildWeatherEmbed(weather, requested) {
  const embed = new EmbedBuilder()
    .setColor(0x38bdf8)
    .setTitle(`${weather.emoji} ${weather.city}`)
    .addFields(
      { name: '🌡️ За окном', value: `**${weather.temp}**\n${weather.text}`, inline: true },
      { name: '📍 Локация', value: requested ? `запрос: **${requested}**` : 'город по умолчанию', inline: true },
    )
    .setFooter({ text: pickTip() })
    .setTimestamp();

  return embed;
}

function buildErrorEmbed(city, err) {
  return new EmbedBuilder()
    .setColor(0xfca5a5)
    .setTitle('🌧️ Ой, не вышло')
    .setDescription(
      `Не получилось узнать погоду${city ? ` для «${city}»` : ''}.\n` +
        'Проверь, правильно ли написан город, или попробуй чуть позже.\n' +
        `Ответ погодного сервера: \`${err}\``,
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