'use strict';

const { MessageFlags } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { createTrackAudioResource } = require('./provider');

class GuildQueue {
  constructor({ guildId, textChannel, voiceChannel, onEmpty }) {
    this.guildId = guildId;
    this.textChannel = textChannel;
    this.voiceChannel = voiceChannel;
    this.onEmpty = onEmpty;

    this.queue = [];
    this.currentTrack = null;
    this.currentResource = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.idleTimer = null;

    this.player = createAudioPlayer();
    this.connection = null;

    this.initPlayerEvents();
  }

  initPlayerEvents() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.cleanupCurrentResource();
      this.playNext(true);
    });

    this.player.on('error', (err) => {
      console.error(`[Плеер ${this.guildId}] Ошибка:`, err.message);
      this.cleanupCurrentResource();
      this.playNext(true);
    });
  }

  cleanupCurrentResource() {
    if (this.currentResource?.ffmpegProc) {
      try {
        this.currentResource.ffmpegProc.kill();
      } catch {}
    }
    this.currentResource = null;
  }

  async connect() {
    if (
      this.connection &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      return this.connection;
    }

    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guildId,
      adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.connection.subscribe(this.player);

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });

    return this.connection;
  }

  async enqueue(track) {
    this.resetIdleTimer();
    this.queue.push(track);

    if (!this.isPlaying) {
      await this.playNext(false);
      return { started: true, track };
    }

    return { started: false, track, position: this.queue.length };
  }

  async enqueueMultiple(tracks) {
    if (!tracks || tracks.length === 0) return { started: false, count: 0 };
    this.resetIdleTimer();

    const wasPlaying = this.isPlaying;
    const initialPosition = this.queue.length + 1;

    for (const track of tracks) {
      this.queue.push(track);
    }

    if (!wasPlaying) {
      await this.playNext(false);
      return { started: true, count: tracks.length, firstTrack: this.currentTrack };
    }

    return { started: false, count: tracks.length, position: initialPosition };
  }

  async playNext(isAutoAdvance = false) {
    this.resetIdleTimer();

    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentTrack = null;
      this.startIdleTimer();
      return;
    }

    this.currentTrack = this.queue.shift();
    this.isPlaying = true;
    this.isPaused = false;

    try {
      await this.connect();
      const resource = await createTrackAudioResource(this.currentTrack);
      this.currentResource = resource;
      this.player.play(resource);

      if (isAutoAdvance) {
        this.notifyNowPlaying(this.currentTrack);
      }
    } catch (err) {
      console.error(`[Воспроизведение ${this.guildId}]`, err.message);
      if (this.textChannel) {
        this.textChannel
          .send(`Не удалось воспроизвести **${this.currentTrack.title}**: ${err.message}`)
          .catch(() => {});
      }
      this.playNext(true);
    }
  }

  notifyNowPlaying(track) {
    if (!this.textChannel) return;
    const msg = `Сейчас играет: [${track.title}](<${track.url}>) (${track.durationFormatted})`;
    this.textChannel.send({ content: msg, flags: [MessageFlags.SuppressEmbeds] }).catch(() => {});
  }

  skip() {
    if (!this.isPlaying && this.queue.length === 0) return false;
    this.cleanupCurrentResource();
    this.player.stop();
    return true;
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return false;
    const ok = this.player.pause();
    if (ok) this.isPaused = true;
    return ok;
  }

  resume() {
    if (!this.isPlaying || !this.isPaused) return false;
    const ok = this.player.unpause();
    if (ok) this.isPaused = false;
    return ok;
  }

  stop() {
    this.queue = [];
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTrack = null;
    this.cleanupCurrentResource();
    this.player.stop();
    this.destroy();
  }

  startIdleTimer() {
    this.resetIdleTimer();
    this.idleTimer = setTimeout(() => {
      console.log(`[Войс ${this.guildId}] Автоотключение из-за бездействия`);
      this.destroy();
    }, 60_000);
  }

  resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  destroy() {
    this.resetIdleTimer();
    this.cleanupCurrentResource();
    try {
      this.player.stop(true);
    } catch {}
    try {
      if (this.connection) {
        this.connection.destroy();
      }
    } catch {}
    this.connection = null;

    if (typeof this.onEmpty === 'function') {
      this.onEmpty(this.guildId);
    }
  }
}

class MusicManager {
  constructor() {
    this.queues = new Map();
  }

  get(guildId) {
    return this.queues.get(guildId) || null;
  }

  getOrCreate({ guildId, textChannel, voiceChannel }) {
    let q = this.queues.get(guildId);
    if (!q) {
      q = new GuildQueue({
        guildId,
        textChannel,
        voiceChannel,
        onEmpty: (id) => this.queues.delete(id),
      });
      this.queues.set(guildId, q);
    } else {
      q.textChannel = textChannel;
      q.voiceChannel = voiceChannel;
    }
    return q;
  }

  delete(guildId) {
    const q = this.queues.get(guildId);
    if (q) {
      q.destroy();
      this.queues.delete(guildId);
    }
  }
}

const musicManager = new MusicManager();

module.exports = {
  GuildQueue,
  MusicManager,
  musicManager,
};
