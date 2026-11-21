import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export const MP4_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1.4d401f,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4;codecs=avc1.42E01E,opus',
  'video/mp4;codecs=avc1,opus',
  'video/mp4;codecs=vp9,opus',
  'video/mp4',
] as const;

export function pickSupportedMp4Mime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  for (const mime of MP4_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {}
  }
  return null;
}

export interface Mp4RecorderOptions {
  stream: MediaStream;
  sourceCanvas?: HTMLCanvasElement | null;
  fps?: number;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
}

export class Mp4VideoRecorder {
  private mode: 'native' | 'webcodecs' | null = null;

  // Native MediaRecorder state
  private mediaRecorder: MediaRecorder | null = null;
  private nativeChunks: Blob[] = [];
  private nativeMime = 'video/mp4';

  // WebCodecs + mp4-muxer fallback state
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private videoEncoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private frameWorker: Worker | null = null;
  private frameWorkerUrl: string | null = null;
  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private previewVideoEl: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private audioCtx: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private audioMuteSink: GainNode | null = null;
  private startPerfMs = 0;
  private pausedAtPerfMs = 0;
  private totalPausedMs = 0;
  private frameCount = 0;
  private audioFramesWritten = 0;
  private audioSampleRate = 48000;
  private isPaused = false;
  private isStopping = false;
  private isFinalized = false;

  get state(): 'inactive' | 'recording' | 'paused' {
    if (this.mode === 'native' && this.mediaRecorder) {
      return this.mediaRecorder.state;
    }
    if (this.mode === 'webcodecs') {
      if (this.isStopping || this.isFinalized) return 'inactive';
      return this.isPaused ? 'paused' : 'recording';
    }
    return 'inactive';
  }

  async start(options: Mp4RecorderOptions): Promise<void> {
    this.cleanup();

    const {
      stream,
      sourceCanvas,
      fps = 24,
      videoBitsPerSecond = 1_800_000,
      audioBitsPerSecond = 128_000,
    } = options;

    const nativeMime = pickSupportedMp4Mime();
    if (nativeMime) {
      this.mode = 'native';
      this.nativeMime = nativeMime;
      this.nativeChunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: nativeMime,
        videoBitsPerSecond,
        audioBitsPerSecond,
      });
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          this.nativeChunks.push(ev.data);
        }
      };
      this.mediaRecorder = recorder;
      recorder.start(500);
      return;
    }

    // Fallback: WebCodecs VideoEncoder (+ AudioEncoder) muxed via mp4-muxer into genuine .mp4
    if (typeof VideoEncoder === 'undefined') {
      throw new Error('MP4 recording is not supported in this browser. Please use Chrome, Edge, or Safari.');
    }

    let videoW = sourceCanvas?.width || 1280;
    let videoH = sourceCanvas?.height || 720;
    let videoEl: HTMLVideoElement | null = null;

    if (!sourceCanvas) {
      const vTrack = stream.getVideoTracks()[0];
      const settings = vTrack?.getSettings?.();
      if (settings?.width && settings?.height) {
        videoW = settings.width;
        videoH = settings.height;
      }
      videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.autoplay = true;
      videoEl.srcObject = stream;
      try {
        await videoEl.play();
      } catch {}
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        videoW = videoEl.videoWidth;
        videoH = videoEl.videoHeight;
      }
      this.previewVideoEl = videoEl;
    }

    // H.264 requires even width/height
    const encW = Math.max(2, videoW & ~1);
    const encH = Math.max(2, videoH & ~1);

    const videoCodecCandidates: Array<{ webcodec: string; muxerCodec: 'avc' | 'vp9' | 'av1' }> = [
      { webcodec: 'avc1.42001f', muxerCodec: 'avc' },
      { webcodec: 'avc1.42001e', muxerCodec: 'avc' },
      { webcodec: 'avc1.4d001f', muxerCodec: 'avc' },
      { webcodec: 'vp09.00.10.08', muxerCodec: 'vp9' },
      { webcodec: 'av01.0.04M.08', muxerCodec: 'av1' },
    ];

    let chosenVideo: { webcodec: string; muxerCodec: 'avc' | 'vp9' | 'av1' } | null = null;
    for (const c of videoCodecCandidates) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec: c.webcodec,
          width: encW,
          height: encH,
          bitrate: videoBitsPerSecond,
          framerate: fps,
        });
        if (res.supported) {
          chosenVideo = c;
          break;
        }
      } catch {}
    }

    if (!chosenVideo) {
      throw new Error('MP4 video encoding is unavailable in this browser.');
    }

    const hasAudio = stream.getAudioTracks().some((t) => t.readyState === 'live');
    let chosenAudio: { webcodec: string; muxerCodec: 'aac' | 'opus'; sampleRate: number } | null = null;

    if (hasAudio && typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx({ latencyHint: 'playback' });
        this.audioCtx = ctx;
        const sr = ctx.sampleRate || 48000;
        this.audioSampleRate = sr;

        const audioCandidates: Array<{ webcodec: string; muxerCodec: 'aac' | 'opus' }> = [
          { webcodec: 'mp4a.40.2', muxerCodec: 'aac' },
          { webcodec: 'opus', muxerCodec: 'opus' },
        ];
        for (const ac of audioCandidates) {
          try {
            const res = await AudioEncoder.isConfigSupported({
              codec: ac.webcodec,
              numberOfChannels: 1,
              sampleRate: sr,
              bitrate: audioBitsPerSecond,
            });
            if (res.supported) {
              chosenAudio = { ...ac, sampleRate: sr };
              break;
            }
          } catch {}
        }

        if (!chosenAudio) {
          try {
            await ctx.close();
          } catch {}
          this.audioCtx = null;
        }
      }
    }

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: chosenVideo.muxerCodec,
        width: encW,
        height: encH,
        frameRate: fps,
      },
      ...(chosenAudio
        ? {
            audio: {
              codec: chosenAudio.muxerCodec,
              numberOfChannels: 1,
              sampleRate: chosenAudio.sampleRate,
            },
          }
        : {}),
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    this.muxer = muxer;

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (!this.isFinalized) {
          muxer.addVideoChunk(chunk, meta);
        }
      },
      error: (err) => {
        console.warn('[Mp4VideoRecorder] VideoEncoder notice:', err);
      },
    });
    videoEncoder.configure({
      codec: chosenVideo.webcodec,
      width: encW,
      height: encH,
      bitrate: videoBitsPerSecond,
      framerate: fps,
    });
    this.videoEncoder = videoEncoder;

    if (chosenAudio && this.audioCtx) {
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          if (!this.isFinalized) {
            muxer.addAudioChunk(chunk, meta);
          }
        },
        error: (err) => {
          console.warn('[Mp4VideoRecorder] AudioEncoder notice:', err);
        },
      });
      audioEncoder.configure({
        codec: chosenAudio.webcodec,
        numberOfChannels: 1,
        sampleRate: chosenAudio.sampleRate,
        bitrate: audioBitsPerSecond,
      });
      this.audioEncoder = audioEncoder;

      const audioOnlyStream = new MediaStream(stream.getAudioTracks());
      const src = this.audioCtx.createMediaStreamSource(audioOnlyStream);
      const proc = this.audioCtx.createScriptProcessor(4096, 1, 1);
      const sink = this.audioCtx.createGain();
      sink.gain.value = 0;

      this.audioFramesWritten = 0;
      proc.onaudioprocess = (ev) => {
        if (this.isPaused || this.isStopping || this.isFinalized || !this.audioEncoder) return;
        if (this.audioEncoder.state !== 'configured') return;
        const input = ev.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        const timestampUs = Math.round((this.audioFramesWritten / this.audioSampleRate) * 1_000_000);
        this.audioFramesWritten += copy.length;
        try {
          const audioData = new AudioData({
            format: 'f32',
            sampleRate: this.audioSampleRate,
            numberOfFrames: copy.length,
            numberOfChannels: 1,
            timestamp: timestampUs,
            data: copy,
          });
          this.audioEncoder.encode(audioData);
          audioData.close();
        } catch {}
      };

      src.connect(proc);
      proc.connect(sink);
      sink.connect(this.audioCtx.destination);
      this.audioSource = src;
      this.audioProcessor = proc;
      this.audioMuteSink = sink;
      void this.audioCtx.resume().catch(() => {});
    }

    if (!sourceCanvas) {
      const off = document.createElement('canvas');
      off.width = encW;
      off.height = encH;
      this.offscreenCanvas = off;
      this.offscreenCtx = off.getContext('2d');
    }

    this.mode = 'webcodecs';
    this.startPerfMs = performance.now();
    this.pausedAtPerfMs = 0;
    this.totalPausedMs = 0;
    this.frameCount = 0;
    this.isPaused = false;
    this.isStopping = false;
    this.isFinalized = false;

    const captureFrame = () => {
      if (this.isPaused || this.isStopping || this.isFinalized || !this.videoEncoder) return;
      if (this.videoEncoder.state !== 'configured') return;
      if (this.videoEncoder.encodeQueueSize > 8) return;

      let frameSource: CanvasImageSource | null = sourceCanvas || null;
      if (!frameSource && this.previewVideoEl && this.offscreenCanvas && this.offscreenCtx) {
        if (this.previewVideoEl.readyState < 2 || this.previewVideoEl.videoWidth === 0) return;
        this.offscreenCtx.fillStyle = '#000000';
        this.offscreenCtx.fillRect(0, 0, encW, encH);
        this.offscreenCtx.drawImage(this.previewVideoEl, 0, 0, encW, encH);
        frameSource = this.offscreenCanvas;
      }
      if (!frameSource) return;

      const elapsedMs = Math.max(0, performance.now() - this.startPerfMs - this.totalPausedMs);
      const timestampUs = Math.round(elapsedMs * 1000);
      const durationUs = Math.round(1_000_000 / fps);
      try {
        const frame = new VideoFrame(frameSource, { timestamp: timestampUs, duration: durationUs });
        const keyFrame = this.frameCount % (fps * 2) === 0;
        this.frameCount += 1;
        this.videoEncoder.encode(frame, { keyFrame });
        frame.close();
      } catch {}
    };

    captureFrame();
    const intervalMs = Math.max(20, Math.round(1000 / fps));
    try {
      const workerBlob = new Blob([`setInterval(() => postMessage(1), ${intervalMs});`], {
        type: 'application/javascript',
      });
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);
      worker.onmessage = captureFrame;
      this.frameWorker = worker;
      this.frameWorkerUrl = workerUrl;
    } catch {
      this.frameInterval = setInterval(captureFrame, intervalMs);
    }
  }

  pause(): void {
    if (this.mode === 'native' && this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.pause();
      return;
    }
    if (this.mode === 'webcodecs' && !this.isPaused && !this.isStopping) {
      this.isPaused = true;
      this.pausedAtPerfMs = performance.now();
      if (this.audioCtx && this.audioCtx.state === 'running') {
        void this.audioCtx.suspend().catch(() => {});
      }
    }
  }

  resume(): void {
    if (this.mode === 'native' && this.mediaRecorder?.state === 'paused') {
      this.mediaRecorder.resume();
      return;
    }
    if (this.mode === 'webcodecs' && this.isPaused && !this.isStopping) {
      if (this.pausedAtPerfMs > 0) {
        this.totalPausedMs += performance.now() - this.pausedAtPerfMs;
        this.pausedAtPerfMs = 0;
      }
      this.isPaused = false;
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }
    }
  }

  flushBestEffortBlob(): Blob | null {
    if (this.mode === 'native') {
      try {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
      } catch {}
      if (this.nativeChunks.length === 0) return null;
      return new Blob(this.nativeChunks, { type: 'video/mp4' });
    }

    if (this.mode === 'webcodecs' && this.muxer && !this.isFinalized) {
      try {
        this.isStopping = true;
        this.isFinalized = true;
        this.muxer.finalize();
        const buf = this.muxer.target.buffer;
        if (buf.byteLength > 0) {
          return new Blob([buf], { type: 'video/mp4' });
        }
      } catch {}
    }
    return null;
  }

  async stop(): Promise<Blob> {
    if (this.mode === 'native') {
      const recorder = this.mediaRecorder;
      if (!recorder || recorder.state === 'inactive') {
        const blob = new Blob(this.nativeChunks, { type: 'video/mp4' });
        this.cleanup();
        return blob;
      }
      return new Promise<Blob>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          const blob = new Blob(this.nativeChunks, { type: 'video/mp4' });
          this.cleanup();
          resolve(blob);
        };
        recorder.onstop = () => setTimeout(finish, 60);
        try {
          if (recorder.state === 'recording') {
            recorder.requestData();
          }
          recorder.stop();
        } catch {
          finish();
        }
      });
    }

    if (this.mode === 'webcodecs' && this.muxer) {
      this.isStopping = true;
      this.stopCaptureLoops();
      try {
        if (this.videoEncoder && this.videoEncoder.state === 'configured') {
          await this.videoEncoder.flush();
        }
      } catch {}
      try {
        if (this.audioEncoder && this.audioEncoder.state === 'configured') {
          await this.audioEncoder.flush();
        }
      } catch {}
      if (!this.isFinalized) {
        this.isFinalized = true;
        try {
          this.muxer.finalize();
        } catch {}
      }
      const buffer = this.muxer.target.buffer;
      const blob = new Blob([buffer], { type: 'video/mp4' });
      this.cleanup();
      return blob;
    }

    this.cleanup();
    return new Blob([], { type: 'video/mp4' });
  }

  private stopCaptureLoops(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    if (this.frameWorker) {
      this.frameWorker.terminate();
      this.frameWorker = null;
    }
    if (this.frameWorkerUrl) {
      URL.revokeObjectURL(this.frameWorkerUrl);
      this.frameWorkerUrl = null;
    }
    if (this.audioProcessor) {
      try {
        this.audioProcessor.disconnect();
        this.audioProcessor.onaudioprocess = null;
      } catch {}
      this.audioProcessor = null;
    }
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch {}
      this.audioSource = null;
    }
    if (this.audioMuteSink) {
      try {
        this.audioMuteSink.disconnect();
      } catch {}
      this.audioMuteSink = null;
    }
  }

  cleanup(): void {
    this.stopCaptureLoops();
    if (this.videoEncoder) {
      try {
        if (this.videoEncoder.state !== 'closed') this.videoEncoder.close();
      } catch {}
      this.videoEncoder = null;
    }
    if (this.audioEncoder) {
      try {
        if (this.audioEncoder.state !== 'closed') this.audioEncoder.close();
      } catch {}
      this.audioEncoder = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.previewVideoEl) {
      try {
        this.previewVideoEl.srcObject = null;
      } catch {}
      this.previewVideoEl = null;
    }
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.muxer = null;
    this.mediaRecorder = null;
    this.nativeChunks = [];
    this.mode = null;
  }
}
