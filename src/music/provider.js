'use strict';

const cp = require('node:child_process');
const { Readable } = require('node:stream');
const https = require('node:https');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const YouTube = require('youtube-sr').default;
const { Innertube, ClientType } = require('youtubei.js');
const ffmpegPath = require('ffmpeg-static');

let innertubeClient = null;
let soundcloudClientId = null;
let soundcloudClientExpires = 0;

async function getInnertube() {
  if (!innertubeClient) {
    innertubeClient = await Innertube.create({ client_type: ClientType.ANDROID });
  }
  return innertubeClient;
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          Referer: 'https://soundcloud.com/',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data }));
        res.on('error', reject);
      },
    );
  });
}

async function getSoundcloudClientId() {
  const now = Date.now();
  if (soundcloudClientId && now < soundcloudClientExpires) {
    return soundcloudClientId;
  }

  try {
    const res = await httpGet('https://soundcloud.com');
    if (res.status === 200) {
      const scriptUrls = [...res.data.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
      for (const scriptUrl of scriptUrls.reverse()) {
        const js = await httpGet(scriptUrl);
        const m =
          js.data.match(/client_id=([a-zA-Z0-9]{32})/) ||
          js.data.match(/client_id:"([a-zA-Z0-9]{32})"/) ||
          js.data.match(/"clientId":"([a-zA-Z0-9]{32})"/);
        if (m) {
          soundcloudClientId = m[1];
          soundcloudClientExpires = now + 6 * 60 * 60 * 1000;
          return soundcloudClientId;
        }
      }
    }
  } catch (err) {
    console.warn('[SoundCloud] Ошибка парсинга client_id:', err.message);
  }

  soundcloudClientId = 'kkwQI6ZGQuYhgXxczGGm6Ahx3K8a17q3';
  return soundcloudClientId;
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

async function resolveSoundCloud(query) {
  const cid = await getSoundcloudClientId();
  const isUrl = isSoundCloudUrl(query);

  let track = null;
  if (isUrl) {
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(query)}&client_id=${cid}`;
    const res = await httpGet(resolveUrl);
    if (res.status === 200) {
      track = JSON.parse(res.data);
    }
  }

  if (!track) {
    const cleanQuery = query.replace(/^sc:|^soundcloud:/i, '').trim();
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(cleanQuery)}&client_id=${cid}&limit=1`;
    const res = await httpGet(searchUrl);
    if (res.status === 200) {
      const data = JSON.parse(res.data);
      track = data.collection?.[0];
    }
  }

  if (!track || !track.media?.transcodings?.length) {
    throw new Error('Трек не найден на SoundCloud или недоступен.');
  }

  const transcodings = track.media.transcodings;
  const targetTranscoding =
    transcodings.find((t) => t.format?.protocol === 'progressive') || transcodings[0];

  const streamInfoRes = await httpGet(`${targetTranscoding.url}?client_id=${cid}`);
  if (streamInfoRes.status !== 200) {
    throw new Error('Не удалось получить поток SoundCloud.');
  }

  const streamInfo = JSON.parse(streamInfoRes.data);
  const streamUrl = streamInfo.url;
  if (!streamUrl) {
    throw new Error('Прямая ссылка на аудио SoundCloud отсутствует.');
  }

  const durationSec = Math.round((track.duration || 0) / 1000);
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;

  return {
    source: 'soundcloud',
    title: track.title || 'SoundCloud Track',
    author: track.user?.username || track.user?.name || 'SoundCloud',
    url: track.permalink_url || query,
    streamUrl,
    durationFormatted: `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`,
    durationSeconds: durationSec,
    thumbnail: track.artwork_url || track.user?.avatar_url || null,
  };
}

async function resolveYouTube(query) {
  let videoId = extractYouTubeId(query);
  let videoInfo = null;

  if (videoId) {
    try {
      videoInfo = await YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`);
    } catch {
      videoInfo = { id: videoId, title: 'YouTube Video' };
    }
  } else {
    videoInfo = await YouTube.searchOne(query);
    if (!videoInfo) {
      throw new Error('Видео на YouTube не найдено.');
    }
    videoId = videoInfo.id;
  }

  return {
    source: 'youtube',
    id: videoId,
    title: videoInfo.title || 'YouTube Audio',
    author: videoInfo.channel?.name || 'YouTube',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    durationFormatted: videoInfo.durationFormatted || '—',
    durationSeconds: videoInfo.duration ? Math.round(videoInfo.duration / 1000) : 0,
    thumbnail: videoInfo.thumbnail?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

async function resolveTrack(query) {
  const trimmed = query.trim();
  if (isSoundCloudUrl(trimmed) || /^sc:|^soundcloud:/i.test(trimmed)) {
    return await resolveSoundCloud(trimmed);
  }
  return await resolveYouTube(trimmed);
}

async function createTrackAudioResource(track) {
  if (track.source === 'soundcloud') {
    const ffmpegProc = cp.spawn(ffmpegPath, [
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
      '-i',
      track.streamUrl,
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ]);

    ffmpegProc.stderr.on('data', () => {});
    ffmpegProc.on('error', (err) => console.error('[FFmpeg SoundCloud]', err.message));

    const resource = createAudioResource(ffmpegProc.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    resource.ffmpegProc = ffmpegProc;
    return resource;
  }

  if (track.source === 'youtube') {
    const yt = await getInnertube();
    const webStream = await yt.download(track.id, { type: 'audio' });
    const nodeStream = Readable.fromWeb(webStream);

    const ffmpegProc = cp.spawn(ffmpegPath, [
      '-i',
      'pipe:0',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ]);

    nodeStream.pipe(ffmpegProc.stdin);
    ffmpegProc.stderr.on('data', () => {});
    ffmpegProc.on('error', (err) => console.error('[FFmpeg YouTube]', err.message));

    const resource = createAudioResource(ffmpegProc.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    resource.ffmpegProc = ffmpegProc;
    return resource;
  }

  throw new Error(`Неизвестный источник трека: ${track.source}`);
}

module.exports = {
  resolveTrack,
  createTrackAudioResource,
  isSoundCloudUrl,
  isYouTubeUrl,
};
