'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getFfmpegBinary } = require('../music/provider');
const tiktokDl = require('@tobyg74/tiktok-api-dl');

const TIKTOK_URL_REGEX =
  /https?:\/\/(?:(?:www|m|vt|vm)\.)?tiktok\.com\/(?:@[\w.-]+\/video\/\d+|v\/\d+(?:\.html)?|t\/[A-Za-z0-9_-]+|[A-Za-z0-9_-]{5,30})(?:\S*)?/i;

const DISCORD_MAX_BYTES = 24.5 * 1024 * 1024; // ~24.5MB safe limit for free Discord uploads

/**
 * Извлекает первую ссылку на TikTok из текста.
 */
function extractTikTokUrl(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(TIKTOK_URL_REGEX);
  return match ? match[0] : null;
}

/**
 * Раскрывает короткие ссылки (vm.tiktok.com, vt.tiktok.com) через редирект.
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
 * Загружает буфер по ссылке с повторной попыткой при необходимости.
 */
async function fetchVideoBuffer(downloadUrl) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Referer: 'https://www.tiktok.com/',
  };

  const res = await fetch(downloadUrl, { headers });
  if (!res.ok) {
    throw new Error(`Не удалось скачать видео (HTTP ${res.status})`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Сжимает видео с помощью ffmpeg, если его размер превышает лимит Discord (~24.5MB).
 */
async function compressVideo(inputBuffer) {
  const ffmpeg = getFfmpegBinary();
  if (!ffmpeg) return inputBuffer;
  if (inputBuffer.length <= DISCORD_MAX_BYTES) return inputBuffer;

  const tempIn = path.join(os.tmpdir(), `tt_in_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  const tempOut = path.join(os.tmpdir(), `tt_out_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

  try {
    await fs.promises.writeFile(tempIn, inputBuffer);

    await new Promise((resolve, reject) => {
      const proc = spawn(
        ffmpeg,
        [
          '-y',
          '-i', tempIn,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '30',
          '-vf', 'scale=-2:720',
          '-c:a', 'aac',
          '-b:a', '96k',
          tempOut,
        ],
        { stdio: 'ignore' },
      );

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      proc.on('error', reject);
    });

    const compressed = await fs.promises.readFile(tempOut);
    return compressed.length < inputBuffer.length ? compressed : inputBuffer;
  } catch (err) {
    console.warn('[tiktok] ffmpeg compression failed:', err.message);
    return inputBuffer;
  } finally {
    fs.promises.unlink(tempIn).catch(() => {});
    fs.promises.unlink(tempOut).catch(() => {});
  }
}

/**
 * Попытка получить видео без водяного знака через TikWM API.
 */
async function fetchViaTikWM(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`TikWM HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'TikWM returned non-zero code');
  }

  const data = json.data;
  const playUrl = data.hdplay || data.play;
  if (!playUrl) {
    throw new Error('TikWM video URL not found');
  }

  const title = data.title || 'TikTok видео';
  const author = data.author?.nickname || data.author?.unique_id || 'TikTok';
  const duration = data.duration || 0;

  // Скачиваем видео
  let buffer = await fetchVideoBuffer(playUrl);
  if (buffer.length > DISCORD_MAX_BYTES && data.play && data.hdplay && playUrl === data.hdplay) {
    // Пробуем SD версию, если HD слишком большой
    try {
      const sdBuffer = await fetchVideoBuffer(data.play);
      if (sdBuffer.length < buffer.length) {
        buffer = sdBuffer;
      }
    } catch {
      // игнорируем ошибку SD и сжимаем что есть
    }
  }

  buffer = await compressVideo(buffer);

  return {
    buffer,
    title,
    author,
    duration,
    downloadUrl: playUrl,
    sizeBytes: buffer.length,
    tooLarge: buffer.length > DISCORD_MAX_BYTES,
  };
}

/**
 * Fallback: получение видео через библиотеку @tobyg74/tiktok-api-dl
 */
async function fetchViaTiktokApiDl(url) {
  let result = null;

  for (const version of ['v1', 'v3', 'v2']) {
    try {
      const res = await tiktokDl.Downloader(url, { version });
      if (res && res.status === 'success' && res.result) {
        result = res.result;
        break;
      }
    } catch {
      // пробуем следующую версию
    }
  }

  if (!result) {
    throw new Error('Не удалось получить информацию о видео через альтернативный источник');
  }

  let videoUrl = null;
  let title = result.desc || 'TikTok видео';
  let author = result.author?.nickname || result.author?.username || 'TikTok';
  let duration = 0;

  if (result.video) {
    videoUrl = result.video.playAddr?.[0] || result.video.downloadAddr?.[0];
    duration = Math.round((result.video.duration || 0) / 1000);
  } else if (result.videoHD || result.videoSD) {
    videoUrl = result.videoHD || result.videoSD;
  }

  if (!videoUrl) {
    throw new Error('Ссылка на видео без водяного знака не найдена');
  }

  let buffer = await fetchVideoBuffer(videoUrl);
  buffer = await compressVideo(buffer);

  return {
    buffer,
    title,
    author,
    duration,
    downloadUrl: videoUrl,
    sizeBytes: buffer.length,
    tooLarge: buffer.length > DISCORD_MAX_BYTES,
  };
}

/**
 * Основная функция загрузки видео TikTok без водяного знака.
 */
async function downloadTikTok(inputUrl) {
  const expanded = await expandUrl(inputUrl);

  try {
    return await fetchViaTikWM(expanded);
  } catch (tikwmErr) {
    console.warn('[tiktok] TikWM error, falling back to secondary API:', tikwmErr.message);
    return await fetchViaTiktokApiDl(expanded);
  }
}

module.exports = {
  extractTikTokUrl,
  expandUrl,
  downloadTikTok,
  TIKTOK_URL_REGEX,
  DISCORD_MAX_BYTES,
};
