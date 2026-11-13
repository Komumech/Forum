import { makeWebmSeekable } from './webmFixer';

export interface RecordedMeetingResult {
  blob: Blob;
  url: string;
  durationSeconds: number;
  filename: string;
  mode: 'video' | 'audio';
}

export interface RecorderParticipantSnapshot {
  identity: string;
  displayName: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted?: boolean;
}

export interface RecorderStartOptions {
  mode?: 'video' | 'audio';
  meetingTitle?: string;
  getParticipants?: () => RecorderParticipantSnapshot[];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export class MeetingCompositeRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private drawInterval: ReturnType<typeof setInterval> | null = null;
  private drawWorker: Worker | null = null;
  private drawWorkerUrl: string | null = null;
  private audioSyncInterval: ReturnType<typeof setInterval> | null = null;
  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private connectedAudioSources = new Map<string, MediaStreamAudioSourceNode>();
  private keepaliveOsc: OscillatorNode | null = null;
  private compositeStream: MediaStream | null = null;
  private startedAt = 0;
  private pausedDurationMs = 0;
  private pausedAt = 0;
  private mode: 'video' | 'audio' = 'video';
  private logoImg: HTMLImageElement | null = null;
  private avatarCache = new Map<string, HTMLImageElement | 'failed'>();
  private displayedSpeakerId: string | null = null;
  private lastSpeakerSwitchAt = 0;

  private preloadLogo(): HTMLImageElement {
    const img = new Image();
    img.src = '/forum-logo.png';
    img.onerror = () => {
      if (!img.src.endsWith('/forum-logo.svg')) {
        img.src = '/forum-logo.svg';
      }
    };
    return img;
  }

  private getCachedAvatar(url?: string): HTMLImageElement | null {
    if (!url) return null;
    const cached = this.avatarCache.get(url);
    if (cached === 'failed') return null;
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => {
      this.avatarCache.set(url, 'failed');
    };
    img.src = url;
    this.avatarCache.set(url, img);
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  private syncAudioTracks(getAudioTracks: () => MediaStreamTrack[]): void {
    const audioCtx = this.audioCtx;
    const dest = this.audioDest;
    const analyser = this.analyser;
    if (!audioCtx || !dest || !analyser) return;

    if (audioCtx.state === 'suspended' && this.pausedAt === 0) {
      void audioCtx.resume().catch(() => {});
    }

    const currentTracks = getAudioTracks().filter((t) => t && t.readyState === 'live');
    const liveIds = new Set(currentTracks.map((t) => t.id));

    // Disconnect ended tracks so stale sources don't accumulate
    for (const [trackId, source] of this.connectedAudioSources.entries()) {
      if (!liveIds.has(trackId)) {
        try {
          source.disconnect();
        } catch {}
        this.connectedAudioSources.delete(trackId);
      }
    }

    // Directly tap each live MediaStreamTrack without .clone() (cloning remote WebRTC tracks can output silence in Chromium)
    for (const track of currentTracks) {
      if (this.connectedAudioSources.has(track.id)) continue;
      try {
        const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
        src.connect(analyser);
        src.connect(dest);
        this.connectedAudioSources.set(track.id, src);
      } catch {
        // Ignore transient track binding error
      }
    }
  }

  private resolveDisplayedSpeaker(participants: RecorderParticipantSnapshot[]): RecorderParticipantSnapshot | null {
    if (!participants || participants.length === 0) {
      this.displayedSpeakerId = null;
      return null;
    }

    const now = Date.now();
    const SPEAKER_INTERVAL_MS = 7000;
    const current = participants.find((p) => p.identity === this.displayedSpeakerId);
    const activeSpeakers = participants.filter((p) => p.isSpeaking);

    if (!current) {
      const next = activeSpeakers[0] || participants.find((p) => !p.isMuted) || participants[0];
      this.displayedSpeakerId = next.identity;
      this.lastSpeakerSwitchAt = now;
      return next;
    }

    if (activeSpeakers.length > 0 && !current.isSpeaking && now - this.lastSpeakerSwitchAt >= SPEAKER_INTERVAL_MS) {
      const next = activeSpeakers[0];
      this.displayedSpeakerId = next.identity;
      this.lastSpeakerSwitchAt = now;
      return next;
    }

    if (activeSpeakers.length > 0 && current.identity !== activeSpeakers[0].identity && now - this.lastSpeakerSwitchAt >= SPEAKER_INTERVAL_MS) {
      const next = activeSpeakers[0];
      this.displayedSpeakerId = next.identity;
      this.lastSpeakerSwitchAt = now;
      return next;
    }

    return current;
  }

  private drawForumWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, darkBg: boolean) {
    const padX = 28;
    const padY = 24;
    const boxW = 116;
    const boxH = 44;
    const bx = width - boxW - padX;
    const by = height - boxH - padY;

    ctx.save();
    drawRoundedRect(ctx, bx, by, boxW, boxH, 13);
    ctx.fillStyle = darkBg ? 'rgba(15, 23, 42, 0.78)' : 'rgba(255, 255, 255, 0.94)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = darkBg ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.08)';
    ctx.stroke();

    const iconSize = 26;
    const ix = bx + 11;
    const iy = by + (boxH - iconSize) / 2;

    if (this.logoImg && this.logoImg.complete && this.logoImg.naturalWidth > 0) {
      ctx.drawImage(this.logoImg, ix, iy, iconSize, iconSize);
    }

    ctx.fillStyle = darkBg ? '#F8FAFC' : '#0F172A';
    ctx.font = '600 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Forum', ix + iconSize + 9, by + boxH / 2 + 1);
    ctx.restore();
  }

  private drawAudioWave(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    speakerIsActive: boolean
  ) {
    const barCount = 41;
    const barWidth = 10;
    const barGap = 8;
    const totalWidth = barCount * barWidth + (barCount - 1) * barGap;
    const startX = centerX - totalWidth / 2;
    const t = Date.now() / 1000;

    let avgEnergy = 0;
    if (this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      const len = Math.min(32, this.freqData.length);
      for (let i = 0; i < len; i++) sum += this.freqData[i];
      avgEnergy = len > 0 ? sum / (len * 255) : 0;
    }

    const activeBoost = Math.max(avgEnergy, speakerIsActive ? 0.36 : 0.08);

    ctx.save();
    for (let i = 0; i < barCount; i++) {
      const distFromCenter = Math.abs(i - (barCount - 1) / 2) / ((barCount - 1) / 2);
      const centerEnvelope = Math.exp(-Math.pow(distFromCenter * 2.15, 2));

      let binVal = 0;
      if (this.freqData && this.freqData.length > 0) {
        const binIdx = Math.min(
          this.freqData.length - 1,
          Math.floor((Math.abs(i - (barCount - 1) / 2) / (barCount / 2)) * 28)
        );
        binVal = this.freqData[binIdx] / 255;
      }

      const harmonic =
        0.5 +
        0.3 * Math.sin(t * 7.2 + i * 0.55) +
        0.2 * Math.cos(t * 4.4 - i * 0.9);

      const energy = Math.min(1, Math.max(0.05, binVal * 0.85 + activeBoost * harmonic));
      const maxH = 128;
      const minDot = 8;
      const barH =
        distFromCenter > 0.72
          ? minDot + energy * 10 * (1 - distFromCenter)
          : minDot + centerEnvelope * energy * maxH;

      const x = startX + i * (barWidth + barGap);
      const y = centerY - barH / 2;

      if (distFromCenter > 0.68) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(165, 180, 252, ${0.42 + (1 - distFromCenter) * 0.5})`;
      } else {
        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, '#818cf8');
        grad.addColorStop(0.5, '#2563eb');
        grad.addColorStop(1, '#6366f1');
        ctx.fillStyle = grad;
        ctx.shadowColor = 'rgba(59, 130, 246, 0.42)';
        ctx.shadowBlur = 14 * centerEnvelope;
      }

      drawRoundedRect(ctx, x, y, barWidth, barH, barWidth / 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSpeakerStudioCard(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    roomLabel: string,
    speaker: RecorderParticipantSnapshot | null
  ) {
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, 820);
    bgGrad.addColorStop(0, '#ffffff');
    bgGrad.addColorStop(1, '#eef2f7');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const cardW = 1040;
    const cardH = 490;
    const cardX = (width - cardW) / 2;
    const cardY = (height - cardH) / 2 - 8;

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 42;
    ctx.shadowOffsetY = 16;
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 36);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 36);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.stroke();
    ctx.restore();

    const avatarSize = 128;
    const avatarX = width / 2;
    const avatarY = cardY + 124;
    const speakerName = speaker?.displayName || 'Meeting Audio';
    const isSpeaking = Boolean(speaker?.isSpeaking);

    let liveLevel = 0;
    if (this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);
      let s = 0;
      for (let i = 0; i < 16; i++) s += this.freqData[i];
      liveLevel = s / (16 * 255);
    }

    const haloRadius = avatarSize / 2 + 10 + liveLevel * 18;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, haloRadius, 0, Math.PI * 2);
    ctx.fillStyle = isSpeaking || liveLevel > 0.08 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(148, 163, 184, 0.1)';
    ctx.fill();
    ctx.restore();

    const avatarImg = this.getCachedAvatar(speaker?.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();

    if (avatarImg) {
      ctx.drawImage(avatarImg, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
    } else {
      const avGrad = ctx.createLinearGradient(avatarX - 60, avatarY - 60, avatarX + 60, avatarY + 60);
      avGrad.addColorStop(0, '#1e293b');
      avGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = avGrad;
      ctx.fillRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 48px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(speakerName.charAt(0).toUpperCase(), avatarX, avatarY + 2);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = isSpeaking || liveLevel > 0.08 ? '#3b82f6' : 'rgba(15, 23, 42, 0.12)';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(speakerName, width / 2, avatarY + 98);

    ctx.fillStyle = '#64748b';
    ctx.font = '400 15px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${roomLabel}  ·  ${isSpeaking ? 'Speaking' : 'Audio recording'}`, width / 2, avatarY + 128);
    ctx.restore();

    this.drawAudioWave(ctx, width / 2, cardY + cardH - 102, isSpeaking);
  }

  private drawSpeakerCornerOverlay(
    ctx: CanvasRenderingContext2D,
    height: number,
    speaker: RecorderParticipantSnapshot | null
  ) {
    if (!speaker) return;
    const x = 28;
    const y = height - 72;
    const w = 248;
    const h = 48;

    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = speaker.isSpeaking ? 'rgba(59, 130, 246, 0.65)' : 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();

    const r = 16;
    const ax = x + 24;
    const ay = y + h / 2;
    const avatarImg = this.getCachedAvatar(speaker.avatarUrl);

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, ax - r, ay - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(ax - r, ay - r, r * 2, r * 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(speaker.displayName.charAt(0).toUpperCase(), ax, ay + 1);
    }
    ctx.restore();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '500 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = speaker.displayName.length > 18 ? `${speaker.displayName.slice(0, 17)}…` : speaker.displayName;
    ctx.fillText(label, ax + r + 10, ay + 1);
    ctx.restore();
  }

  start(
    getAudioTracks: () => MediaStreamTrack[],
    roomName: string,
    options?: RecorderStartOptions
  ): void {
    this.cleanup();

    this.mode = options?.mode || 'video';
    this.logoImg = this.preloadLogo();
    this.displayedSpeakerId = null;
    this.lastSpeakerSwitchAt = 0;

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');

    this.startedAt = Date.now();
    this.pausedDurationMs = 0;
    this.pausedAt = 0;
    this.chunks = [];

    // Always initialize AudioContext + silent keepalive clock so MediaRecorder has continuous audio PTS
    // even when everyone starts muted, and dynamically bind new/unmuted tracks every 350ms.
    const audioTracks: MediaStreamTrack[] = [];
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx({ latencyHint: 'playback' });
      this.audioCtx = audioCtx;
      void audioCtx.resume().catch(() => {});

      const dest = audioCtx.createMediaStreamDestination();
      this.audioDest = dest;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      this.analyser = analyser;
      this.freqData = new Uint8Array(analyser.frequencyBinCount);

      // Ultra-quiet silent keepalive routed only to dest (never to analyser) so Opus frame timestamps never gap
      const osc = audioCtx.createOscillator();
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0.00001;
      osc.frequency.value = 40;
      osc.connect(silentGain);
      silentGain.connect(dest);
      osc.start();
      this.keepaliveOsc = osc;

      this.syncAudioTracks(getAudioTracks);
      this.audioSyncInterval = setInterval(() => {
        this.syncAudioTracks(getAudioTracks);
      }, 350);

      dest.stream.getAudioTracks().forEach((t) => audioTracks.push(t));
    } catch (err) {
      console.warn('[MeetingCompositeRecorder] AudioContext setup notice:', err);
    }

    const roomLabel = options?.meetingTitle || roomName;

    const drawFrame = () => {
      if (!ctx) return;
      if (this.pausedAt > 0) return;

      const participants = options?.getParticipants ? options.getParticipants() : [];
      const speaker = this.resolveDisplayedSpeaker(participants);

      const videos =
        this.mode === 'audio'
          ? []
          : Array.from(document.querySelectorAll('video')).filter(
              (v) => v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0 && v.offsetWidth > 0 && v.offsetHeight > 0
            );

      if (videos.length === 0) {
        this.drawSpeakerStudioCard(ctx, canvas.width, canvas.height, roomLabel, speaker);
        this.drawForumWatermark(ctx, canvas.width, canvas.height, false);
        return;
      }

      ctx.fillStyle = '#131416';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const count = Math.min(videos.length, 9);
      const cols = count === 1 ? 1 : count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / cols);
      const gap = 12;
      const cellW = (canvas.width - gap * (cols + 1)) / cols;
      const cellH = (canvas.height - gap * (rows + 1)) / rows;

      for (let i = 0; i < count; i++) {
        const video = videos[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gap + col * (cellW + gap);
        const y = gap + row * (cellH + gap);

        ctx.fillStyle = '#1c1e22';
        ctx.fillRect(x, y, cellW, cellH);

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.min(cellW / vw, cellH / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = x + (cellW - dw) / 2;
        const dy = y + (cellH - dh) / 2;

        try {
          ctx.drawImage(video, dx, dy, dw, dh);
        } catch {
          // Ignore transient frame read error
        }
      }

      this.drawSpeakerCornerOverlay(ctx, canvas.height, speaker);
      this.drawForumWatermark(ctx, canvas.width, canvas.height, true);
    };

    drawFrame();

    // Use an unthrottled Web Worker timer so switching browser tabs never starves video frames
    try {
      const workerBlob = new Blob(['setInterval(() => postMessage(1), 41);'], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);
      worker.onmessage = drawFrame;
      this.drawWorker = worker;
      this.drawWorkerUrl = workerUrl;
    } catch {
      this.drawInterval = setInterval(drawFrame, 1000 / 24);
    }

    const canvasStream = canvas.captureStream(24);
    const allTracks = [...canvasStream.getVideoTracks(), ...audioTracks];

    const compositeStream = new MediaStream(allTracks);
    this.compositeStream = compositeStream;

    // Prefer VP8+Opus: faster real-time encoding without frame drops or truncated WebM clusters
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

    const recorder = new MediaRecorder(compositeStream, {
      mimeType,
      videoBitsPerSecond: 1_800_000,
      audioBitsPerSecond: 128_000,
    });
    this.mediaRecorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    recorder.start(1000);
  }

  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.pausedAt = Date.now();
      if (this.audioCtx && this.audioCtx.state === 'running') {
        void this.audioCtx.suspend().catch(() => {});
      }
    }
  }

  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      if (this.pausedAt) {
        this.pausedDurationMs += Date.now() - this.pausedAt;
        this.pausedAt = 0;
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }
      this.mediaRecorder.resume();
    }
  }

  stop(roomName: string): Promise<RecordedMeetingResult> {
    return new Promise((resolve) => {
      const elapsedMs = Math.max(
        1000,
        Date.now() -
          this.startedAt -
          this.pausedDurationMs -
          (this.pausedAt ? Date.now() - this.pausedAt : 0)
      );
      const durationSeconds = Math.max(1, Math.round(elapsedMs / 1000));
      const suffix = this.mode === 'audio' ? 'audio' : 'video';
      const filename = `forum-${roomName.replace(/[^a-zA-Z0-9_-]/g, '_')}-${suffix}-${Date.now()}.webm`;
      const currentMode = this.mode;

      let finalized = false;
      const finalizeChunks = async () => {
        if (finalized) return;
        finalized = true;
        const rawBlob = new Blob(this.chunks, { type: 'video/webm' });
        const fixedBlob = await makeWebmSeekable(rawBlob, elapsedMs);
        const url = URL.createObjectURL(fixedBlob);
        this.cleanup();
        resolve({ blob: fixedBlob, url, durationSeconds, filename, mode: currentMode });
      };

      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        void finalizeChunks();
        return;
      }

      this.mediaRecorder.onstop = () => {
        setTimeout(() => {
          void finalizeChunks();
        }, 60);
      };

      try {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
        this.mediaRecorder.stop();
      } catch {
        void finalizeChunks();
      }
    });
  }

  cleanup(): void {
    if (this.drawInterval) {
      clearInterval(this.drawInterval);
      this.drawInterval = null;
    }
    if (this.drawWorker) {
      this.drawWorker.terminate();
      this.drawWorker = null;
    }
    if (this.drawWorkerUrl) {
      URL.revokeObjectURL(this.drawWorkerUrl);
      this.drawWorkerUrl = null;
    }
    if (this.audioSyncInterval) {
      clearInterval(this.audioSyncInterval);
      this.audioSyncInterval = null;
    }
    for (const source of this.connectedAudioSources.values()) {
      try {
        source.disconnect();
      } catch {}
    }
    this.connectedAudioSources.clear();
    if (this.keepaliveOsc) {
      try {
        this.keepaliveOsc.stop();
        this.keepaliveOsc.disconnect();
      } catch {}
      this.keepaliveOsc = null;
    }
    if (this.compositeStream) {
      this.compositeStream.getTracks().forEach((t) => t.stop());
      this.compositeStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.audioDest = null;
    this.analyser = null;
    this.freqData = null;
    this.canvas = null;
    this.mediaRecorder = null;
  }
}
