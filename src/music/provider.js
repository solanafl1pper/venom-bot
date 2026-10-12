'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { Readable } = require('node:stream');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const YouTube = require('youtube-sr').default;
const scdl = require('soundcloud-downloader').default;

let cachedFfmpeg = null;
function getFfmpegBinary() {
  if (cachedFfmpeg) return cachedFfmpeg;
  const staticPath = require('ffmpeg-static');
  if (staticPath && fs.existsSync(staticPath)) {
    cachedFfmpeg = staticPath;
    return cachedFfmpeg;
  }

  try {
    const pkgDir = path.dirname(require.resolve('ffmpeg-static'));
    const installScript = path.join(pkgDir, 'install.js');
    if (fs.existsSync(installScript)) {
      console.log('[ffmpeg] Installing ffmpeg binary...');
      cp.spawnSync(process.execPath, [installScript], { stdio: 'inherit' });
      if (staticPath && fs.existsSync(staticPath)) {
        cachedFfmpeg = staticPath;
        return cachedFfmpeg;
      }
    }
  } catch (err) {
    console.warn('[ffmpeg] install script fallback error:', err.message);
  }

  cachedFfmpeg = 'ffmpeg';
  return cachedFfmpeg;
}

function cleanTitleForSearch(title) {
  if (!title) return '';
  return title
    .replace(/[\(\[](?:official\s*(?:video|audio|music\s*video|lyric\s*video)?|remaster(?:ed)?|4k|hd|lyrics?|visualizer|клип|премьера)[\)\]]/gi, '')
    .replace(/\|.*$/, '')
    .trim();
}

function isSoundCloudUrl(url) {
  return /^(https?:\/\/)?(www\.)?(m\.)?soundcloud\.com\/[\w\-_/]+$/i.test(url);
}

function isYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.*$/i.test(url);
}

function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return m && m[1].length === 11 ? m[1] : null;
}

/**
 * Получение метаданных YouTube без авторизации через oEmbed / youtube-sr
 */
async function getYouTubeMetadata(urlOrQuery) {
  const isUrl = isYouTubeUrl(urlOrQuery);
  if (isUrl) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlOrQuery)}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title,
          author: data.author_name,
          url: urlOrQuery,
        };
      }
    } catch {}

    const videoId = extractYouTubeId(urlOrQuery);
    if (videoId) {
      try {
        const ytVideo = await YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`);
        if (ytVideo) {
          return {
            title: ytVideo.title,
            author: ytVideo.channel?.name || 'YouTube',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationFormatted: ytVideo.durationFormatted,
          };
        }
      } catch {}
    }
  }

  try {
    const ytVideo = await YouTube.searchOne(urlOrQuery);
    if (ytVideo) {
      return {
        title: ytVideo.title,
        author: ytVideo.channel?.name || 'YouTube',
        url: ytVideo.url,
        durationFormatted: ytVideo.durationFormatted,
      };
    }
  } catch {}

  return null;
}

/**
 * Поиск полноценного воспроизводимого аудио-трека через SoundCloud
 */
async function findSoundCloudAudio(searchQuery) {
  const clean = searchQuery.replace(/^sc:|^soundcloud:/i, '').trim();
  const searchRes = await scdl.search({ query: clean, limit: 12, resourceType: 'tracks' }).catch(() => null);
  const items = searchRes?.collection || [];

  if (items.length === 0) {
    throw new Error(`Трек не найден: ${searchQuery}`);
  }

  // Приоритет: треки длиннее 40 сек, чтобы отфильтровать 30-секундные превью
  let best = items.find((t) => (t.duration / 1000) > 40 && t.permalink_url);
  if (!best) {
    best = items[0];
  }

  const durationSec = Math.round((best.duration || 0) / 1000);
  const m = Math.floor(durationSec / 60);
  const s = durationSec % 60;
  const durationFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;

  return {
    title: best.title || clean,
    author: best.user?.username || best.user?.name || 'SoundCloud',
    url: best.permalink_url,
    durationFormatted,
    durationSeconds: durationSec,
    thumbnail: best.artwork_url || best.user?.avatar_url || null,
  };
}

/**
 * Единая точка разрешения трека (YouTube или SoundCloud)
 */
async function resolveTrack(query) {
  const trimmed = query.trim();

  // 1. Прямая ссылка на SoundCloud
  if (isSoundCloudUrl(trimmed)) {
    const info = await scdl.getInfo(trimmed).catch(() => null);
    if (info) {
      const durSec = Math.round((info.duration || 0) / 1000);
      const m = Math.floor(durSec / 60);
      const s = durSec % 60;
      return {
        source: 'soundcloud',
        title: info.title || 'SoundCloud Track',
        author: info.user?.username || 'SoundCloud',
        url: info.permalink_url || trimmed,
        audioUrl: info.permalink_url || trimmed,
        durationFormatted: `${m}:${s < 10 ? '0' : ''}${s}`,
        durationSeconds: durSec,
        thumbnail: info.artwork_url || null,
      };
    }
    // Если getInfo не сработал, ищем как поисковый запрос
    const scAudio = await findSoundCloudAudio(trimmed);
    return {
      source: 'soundcloud',
      title: scAudio.title,
      author: scAudio.author,
      url: scAudio.url,
      audioUrl: scAudio.url,
      durationFormatted: scAudio.durationFormatted,
      durationSeconds: scAudio.durationSeconds,
      thumbnail: scAudio.thumbnail,
    };
  }

  // 2. Ссылка на YouTube
  if (isYouTubeUrl(trimmed)) {
    const ytMeta = await getYouTubeMetadata(trimmed);
    const ytTitle = ytMeta?.title || trimmed;
    const ytAuthor = ytMeta?.author || 'YouTube';
    const cleaned = cleanTitleForSearch(ytTitle);
    const searchTarget = ytAuthor && !cleaned.toLowerCase().includes(ytAuthor.toLowerCase())
      ? `${cleaned} ${ytAuthor}`
      : cleaned;

    const scAudio = await findSoundCloudAudio(searchTarget).catch(() => findSoundCloudAudio(cleaned));

    return {
      source: 'youtube',
      title: ytTitle,
      author: ytAuthor,
      url: ytMeta?.url || trimmed,
      audioUrl: scAudio.url,
      durationFormatted: ytMeta?.durationFormatted || scAudio.durationFormatted,
      durationSeconds: scAudio.durationSeconds,
      thumbnail: scAudio.thumbnail,
    };
  }

  // 3. Поисковый запрос с префиксом SoundCloud (sc: / soundcloud:)
  if (/^sc:|^soundcloud:/i.test(trimmed)) {
    const scAudio = await findSoundCloudAudio(trimmed);
    return {
      source: 'soundcloud',
      title: scAudio.title,
      author: scAudio.author,
      url: scAudio.url,
      audioUrl: scAudio.url,
      durationFormatted: scAudio.durationFormatted,
      durationSeconds: scAudio.durationSeconds,
      thumbnail: scAudio.thumbnail,
    };
  }

  // 4. Обычный текстовый поиск песни по названию
  // Сначала проверяем на YouTube для точного названия и автора
  let ytMeta = null;
  try {
    ytMeta = await getYouTubeMetadata(trimmed);
  } catch {}

  const searchTarget = ytMeta ? `${cleanTitleForSearch(ytMeta.title)} ${ytMeta.author || ''}` : trimmed;
  const scAudio = await findSoundCloudAudio(searchTarget).catch(() => findSoundCloudAudio(trimmed));

  return {
    source: ytMeta ? 'youtube' : 'soundcloud',
    title: ytMeta?.title || scAudio.title,
    author: ytMeta?.author || scAudio.author,
    url: ytMeta?.url || scAudio.url,
    audioUrl: scAudio.url,
    durationFormatted: ytMeta?.durationFormatted || scAudio.durationFormatted,
    durationSeconds: scAudio.durationSeconds,
    thumbnail: scAudio.thumbnail,
  };
}

/**
 * Создание аудиопотока для голосового канала Discord (без ошибок блокировки IP и login required)
 */
async function createTrackAudioResource(track) {
  const ffmpeg = getFfmpegBinary();
  const streamUrl = track.audioUrl || track.url;

  if (!streamUrl) {
    throw new Error('Ссылка на аудиопоток отсутствует.');
  }

  // Скачиваем аудио через soundcloud-downloader (надёжный CDN без логина)
  const nodeStream = await scdl.download(streamUrl);

  const ffmpegProc = cp.spawn(ffmpeg, [
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ]);

  nodeStream.pipe(ffmpegProc.stdin);

  ffmpegProc.stderr.on('data', () => {});
  ffmpegProc.on('error', (err) => console.error('[FFmpeg Audio Stream]', err.message));

  const resource = createAudioResource(ffmpegProc.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });

  resource.ffmpegProc = ffmpegProc;
  return resource;
}

module.exports = {
  resolveTrack,
  createTrackAudioResource,
  isSoundCloudUrl,
  isYouTubeUrl,
  getFfmpegBinary,
};
