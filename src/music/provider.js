'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createAudioResource, StreamType } = require('@discordjs/voice');
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

/**
 * Проверяет, является ли строка ссылкой на SoundCloud (полная, мобильная или короткая).
 */
function isSoundCloudUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    /https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/[\w\-_/]+/i.test(url) ||
    /https?:\/\/on\.soundcloud\.com\/[\w\-_]+/i.test(url) ||
    /https?:\/\/soundcloud\.app\.goo\.gl\/[\w\-_]+/i.test(url)
  );
}

/**
 * Раскрывает короткие ссылки (например, on.soundcloud.com/...)
 */
async function expandUrl(rawUrl) {
  try {
    const res = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    return res.url || rawUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Очищает ссылку SoundCloud от параметров запроса (si, utm_source и т.д.)
 */
function cleanSoundCloudUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

/**
 * Поиск трека на SoundCloud по названию.
 */
async function searchSoundCloudTrack(query) {
  const cleanQuery = query.replace(/^sc:|^soundcloud:/i, '').trim();
  const searchRes = await scdl
    .search({ query: cleanQuery, limit: 15, resourceType: 'tracks' })
    .catch(() => null);

  const items = searchRes?.collection || [];
  if (items.length === 0) {
    throw new Error(`Трек не найден на SoundCloud: ${cleanQuery}`);
  }

  // Приоритет: треки длиннее 40 секунд, чтобы исключить 30-секундные превью
  let best = items.find((t) => (t.duration / 1000) > 40 && t.permalink_url);
  if (!best) {
    best = items[0];
  }

  const durationSec = Math.round((best.duration || 0) / 1000);
  const m = Math.floor(durationSec / 60);
  const s = durationSec % 60;
  const durationFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;

  return {
    source: 'soundcloud',
    title: best.title || cleanQuery,
    author: best.user?.username || best.user?.name || 'SoundCloud',
    url: best.permalink_url,
    durationFormatted,
    durationSeconds: durationSec,
    thumbnail: best.artwork_url || best.user?.avatar_url || null,
  };
}

/**
 * Разрешение ссылки или поискового запроса SoundCloud.
 */
async function resolveTrack(query) {
  const trimmed = query.trim();

  // Если это ссылка на SoundCloud (полная или короткая)
  if (isSoundCloudUrl(trimmed)) {
    const expanded = await expandUrl(trimmed);
    const cleaned = cleanSoundCloudUrl(expanded);

    try {
      const info = await scdl.getInfo(cleaned);
      if (info) {
        const durationSec = Math.round((info.duration || 0) / 1000);
        const m = Math.floor(durationSec / 60);
        const s = durationSec % 60;
        return {
          source: 'soundcloud',
          title: info.title || 'SoundCloud Track',
          author: info.user?.username || info.user?.name || 'SoundCloud',
          url: cleaned,
          durationFormatted: `${m}:${s < 10 ? '0' : ''}${s}`,
          durationSeconds: durationSec,
          thumbnail: info.artwork_url || info.user?.avatar_url || null,
        };
      }
    } catch (infoErr) {
      console.warn('[SoundCloud] getInfo failed, falling back to search:', infoErr.message);
    }

    // Если getInfo не сработал напрямую, ищем по ссылке
    return await searchSoundCloudTrack(cleaned);
  }

  // Во всех остальных случаях — текстовый поиск напрямую на SoundCloud
  return await searchSoundCloudTrack(trimmed);
}

/**
 * Создание аудиопотока для голосового канала Discord из SoundCloud
 */
async function createTrackAudioResource(track) {
  const ffmpeg = getFfmpegBinary();
  const streamUrl = track.url;

  if (!streamUrl) {
    throw new Error('Ссылка на трек отсутствует.');
  }

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
  ffmpegProc.on('error', (err) => console.error('[FFmpeg SoundCloud]', err.message));

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
  getFfmpegBinary,
};
