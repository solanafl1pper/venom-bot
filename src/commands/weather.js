'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
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

function buildWeatherContainer(weather, requested) {
  const container = new ContainerBuilder().setAccentColor(0x38bdf8);
  const text = [
    `### ${weather.emoji} ${weather.city} · **${weather.temp}**`,
    `${weather.text}${requested ? ` · *запрос: ${requested}*` : ''}`,
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return container;
}

function buildErrorContainer(city, err) {
  const container = new ContainerBuilder().setAccentColor(0xfca5a5);
  const text = [
    `### 🌧️ Погода не найдена`,
    `Не удалось узнать погоду${city ? ` для «${city}»` : ''}.`,
    err ? `\`${err}\`` : 'Попробуй позже.',
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return container;
}

function registerWeather(client) {
  client.handleWeather = async (interaction) => {
    const requested = (interaction.options?.getString?.('город') || '').trim();
    const city = requested || DEFAULT_CITY();

    let weather;
    try {
      weather = await getWeather(city);
    } catch (err) {
      console.error('[погода]', err.message);
      const container = buildErrorContainer(city, err.message);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } else {
        await interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
      }
      return;
    }

    if (!weather) {
      const msg = 'Погодный сервис молчит. Попробуй через минуту.';
      const container = buildErrorContainer(city, msg);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } else {
        await interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
      }
      return;
    }

    const container = buildWeatherContainer(weather, requested);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
      await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  };

  return client.handleWeather;
}

module.exports = {
  registerWeather,
  buildWeatherContainer,
  buildErrorContainer,
  buildWeatherEmbed: buildWeatherContainer,
  buildErrorEmbed: buildErrorContainer,
  pickTip,
  TIPS,
};