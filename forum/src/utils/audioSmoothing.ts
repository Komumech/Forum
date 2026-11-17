import type { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';

export type AudioSoundMode = 'standard' | 'smooth' | 'performance';
export type PerformancePreset = 'vocal_acoustic' | 'instrument_band' | 'pure_direct';

export interface PerformanceAudioOptions {
  profile: PerformancePreset;
  inputGain: number;      // 0.6 to 1.8
  compressionMix: number; // 0.0 to 1.0 (parallel compression blend)
  warmthDb: number;       // -3 to +6 dB
  brillianceDb: number;   // -3 to +6 dB
  roomAmbience: number;   // 0.0 to 0.30 (studio stereo reverb wet send)
}

export const DEFAULT_PERFORMANCE_AUDIO_OPTIONS: PerformanceAudioOptions = {
  profile: 'vocal_acoustic',
  inputGain: 1.05,
  compressionMix: 0.55,
  warmthDb: 1.8,
  brillianceDb: 2.2,
  roomAmbience: 0.08,
};

export const PERFORMANCE_PRESET_CONFIGS: Record<
  PerformancePreset,
  Omit<PerformanceAudioOptions, 'profile'> & { label: string; description: string }
> = {
  vocal_acoustic: {
    label: 'Voice & Guitar',
    description: 'Warm, balanced clarity for singing and acoustic instruments.',
    inputGain: 1.05,
    compressionMix: 0.55,
    warmthDb: 1.8,
    brillianceDb: 2.2,
    roomAmbience: 0.08,
  },
  instrument_band: {
    label: 'Full Band',
    description: 'Dry, natural definition with room for drums, keys, and groups.',
    inputGain: 1.0,
    compressionMix: 0.35,
    warmthDb: 1.2,
    brillianceDb: 1.5,
    roomAmbience: 0.0,
  },
  pure_direct: {
    label: 'Raw Mic',
    description: 'Uncolored full-range microphone audio with peak protection only.',
    inputGain: 1.0,
    compressionMix: 0.0,
    warmthDb: 0.0,
    brillianceDb: 0.0,
    roomAmbience: 0.0,
  },
};

export interface SoundCaptureSettings {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channelCount: number;
}

const SOUND_MODE_STORAGE_KEY = 'forum_audio_sound_mode_v1';
const PERF_OPTS_STORAGE_KEY = 'forum_perf_audio_opts_v1';

export function getSavedAudioSoundMode(): AudioSoundMode {
  if (typeof window === 'undefined') return 'smooth';
  try {
    const val = localStorage.getItem(SOUND_MODE_STORAGE_KEY);
    if (val === 'standard' || val === 'smooth' || val === 'performance') {
      return val;
    }
  } catch {}
  return 'smooth';
}

export function saveAudioSoundMode(mode: AudioSoundMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_MODE_STORAGE_KEY, mode);
  } catch {}
}

export function getSavedPerformanceAudioOptions(): PerformanceAudioOptions {
  if (typeof window === 'undefined') return DEFAULT_PERFORMANCE_AUDIO_OPTIONS;
  try {
    const raw = localStorage.getItem(PERF_OPTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        profile:
          parsed.profile === 'vocal_acoustic' ||
          parsed.profile === 'instrument_band' ||
          parsed.profile === 'pure_direct'
            ? parsed.profile
            : 'vocal_acoustic',
        inputGain: typeof parsed.inputGain === 'number' ? Math.max(0.5, Math.min(2.0, parsed.inputGain)) : 1.05,
        compressionMix:
          typeof parsed.compressionMix === 'number' ? Math.max(0, Math.min(1, parsed.compressionMix)) : 0.55,
        warmthDb: typeof parsed.warmthDb === 'number' ? Math.max(-4, Math.min(6, parsed.warmthDb)) : 1.8,
        brillianceDb:
          typeof parsed.brillianceDb === 'number' ? Math.max(-4, Math.min(6, parsed.brillianceDb)) : 2.2,
        roomAmbience:
          typeof parsed.roomAmbience === 'number' ? Math.max(0, Math.min(0.35, parsed.roomAmbience)) : 0.08,
      };
    }
  } catch {}
  return DEFAULT_PERFORMANCE_AUDIO_OPTIONS;
}

export function savePerformanceAudioOptions(opts: PerformanceAudioOptions): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERF_OPTS_STORAGE_KEY, JSON.stringify(opts));
  } catch {}
}

/**
 * Returns optimal browser WebRTC capture constraints for each sound profile.
 * In 'performance' mode, ALL Chromium/WebRTC speech DSP flags (googNoiseSuppression,
 * googAutoGainControl, googEchoCancellation, googHighpassFilter, etc.) are explicitly
 * disabled alongside standard constraints so live vocals & instruments remain crisp,
 * stereo, full-bandwidth (48kHz), and never pump, duck, or chop out.
 */
export function getCaptureOptionsForSoundMode(
  mode: AudioSoundMode,
  userNoiseCancellation: boolean,
  userEchoCancellation: boolean,
  deviceId?: string
): Record<string, any> {
  const opts: Record<string, any> = {
    sampleRate: 48000,
    sampleSize: 24,
    channelCount: mode === 'performance' ? 2 : 1,
    latency: 0.01,
  };

  if (deviceId && deviceId !== 'default') {
    opts.deviceId = deviceId;
  }

  if (mode === 'performance') {
    opts.noiseSuppression = false;
    opts.autoGainControl = false;
    opts.echoCancellation = false;
    // Bypass vendor Chromium voice DSP pipelines that gate sustained singing or instruments
    opts.googNoiseSuppression = false;
    opts.googNoiseSuppression2 = false;
    opts.googAutoGainControl = false;
    opts.googAutoGainControl2 = false;
    opts.googEchoCancellation = false;
    opts.googHighpassFilter = false;
    opts.googTypingNoiseDetection = false;
    opts.googAudioMirroring = false;
  } else if (mode === 'smooth') {
    opts.noiseSuppression = false;
    opts.autoGainControl = false;
    opts.echoCancellation = userEchoCancellation;
    opts.googNoiseSuppression = false;
    opts.googNoiseSuppression2 = false;
    opts.googAutoGainControl = false;
    opts.googAutoGainControl2 = false;
    opts.googTypingNoiseDetection = false;
  } else {
    opts.noiseSuppression = userNoiseCancellation;
    opts.autoGainControl = true;
    opts.echoCancellation = userEchoCancellation;
  }

  return opts;
}

/**
 * Generates an algorithmic stereo acoustic studio impulse response buffer (~0.62s decay)
 * with smooth high-frequency air rolloff for natural warmth on live vocals/instruments.
 */
function createStudioImpulseBuffer(ctx: AudioContext, durationSec = 0.62, decay = 3.2): AudioBuffer {
  const sampleRate = ctx.sampleRate || 48000;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const channelData = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Gentle pre-delay (~14ms) so dry consonants stay razor sharp
      if (i < Math.floor(sampleRate * 0.014)) {
        channelData[i] = 0;
        continue;
      }
      const env = Math.pow(1 - t, decay);
      const white = Math.random() * 2 - 1;
      lp = lp * 0.72 + white * 0.28;
      channelData[i] = lp * env * 0.45;
    }
  }
  return buffer;
}

/**
 * Multi-Stage Real-Time Studio Web Audio DSP Processor attached to LiveKit LocalAudioTrack.
 * Chain:
 *   Input -> Input Gain Trim -> Sub-Rumble High-Pass -> Mud Cut (280Hz) -> Warmth Low-Shelf ->
 *   Presence Clarity (3.2kHz) -> De-Esser (6.5kHz) -> Silky Air High-Shelf (10.5kHz) ->
 *   [Parallel Compression Bus: Dry Path + Soft-Knee Compressor Wet Path] ->
 *   [Optional Filtered Studio Stereo Convolver Ambience Send] ->
 *   True-Peak Brickwall Limiter -> MediaStreamAudioDestination
 */
export class ForumAudioSmoothingProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = 'forum-audio-smoothing';
  processedTrack?: MediaStreamTrack;

  private mode: AudioSoundMode;
  private perfOptions: PerformanceAudioOptions;
  private audioCtx: AudioContext | null = null;
  private ownsAudioContext = false;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode | null = null;
  private highPassNode: BiquadFilterNode | null = null;
  private mudCutNode: BiquadFilterNode | null = null;
  private warmthShelfNode: BiquadFilterNode | null = null;
  private presenceNode: BiquadFilterNode | null = null;
  private deEsserNode: BiquadFilterNode | null = null;
  private airShelfNode: BiquadFilterNode | null = null;

  private compressorNode: DynamicsCompressorNode | null = null;
  private compWetGainNode: GainNode | null = null;
  private dryGainNode: GainNode | null = null;
  private sumBusNode: GainNode | null = null;

  private reverbHighPassNode: BiquadFilterNode | null = null;
  private reverbLowPassNode: BiquadFilterNode | null = null;
  private convolverNode: ConvolverNode | null = null;
  private reverbSendGainNode: GainNode | null = null;

  private limiterNode: DynamicsCompressorNode | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;

  constructor(
    initialMode: AudioSoundMode = 'smooth',
    initialPerfOptions: PerformanceAudioOptions = DEFAULT_PERFORMANCE_AUDIO_OPTIONS
  ) {
    this.mode = initialMode;
    this.perfOptions = initialPerfOptions;
  }

  private applyPresetParameters() {
    if (
      !this.audioCtx ||
      !this.inputGainNode ||
      !this.highPassNode ||
      !this.mudCutNode ||
      !this.warmthShelfNode ||
      !this.presenceNode ||
      !this.deEsserNode ||
      !this.airShelfNode ||
      !this.compressorNode ||
      !this.compWetGainNode ||
      !this.dryGainNode ||
      !this.sumBusNode ||
      !this.reverbSendGainNode ||
      !this.limiterNode
    ) {
      return;
    }

    const now = this.audioCtx.currentTime;

    if (this.mode === 'performance') {
      const p = this.perfOptions;
      const isPure = p.profile === 'pure_direct';

      this.inputGainNode.gain.setTargetAtTime(p.inputGain, now, 0.03);

      // Sub-rumble clean cut without touching vocal/guitar fundamentals
      this.highPassNode.frequency.setTargetAtTime(isPure ? 22 : 34, now, 0.03);
      this.highPassNode.Q.setTargetAtTime(0.6, now, 0.03);

      // Subtle boxy mid-mud dip around 280Hz
      this.mudCutNode.frequency.setTargetAtTime(280, now, 0.03);
      this.mudCutNode.Q.setTargetAtTime(1.2, now, 0.03);
      this.mudCutNode.gain.setTargetAtTime(isPure ? 0 : -1.5, now, 0.03);

      // Warmth low-shelf
      this.warmthShelfNode.frequency.setTargetAtTime(175, now, 0.03);
      this.warmthShelfNode.gain.setTargetAtTime(isPure ? 0 : p.warmthDb, now, 0.03);

      // Vocal / instrument presence lift
      this.presenceNode.frequency.setTargetAtTime(3200, now, 0.03);
      this.presenceNode.Q.setTargetAtTime(0.95, now, 0.03);
      this.presenceNode.gain.setTargetAtTime(isPure ? 0 : p.profile === 'vocal_acoustic' ? 1.8 : 1.0, now, 0.03);

      // Gentle de-esser around 6.5kHz
      this.deEsserNode.frequency.setTargetAtTime(6500, now, 0.03);
      this.deEsserNode.Q.setTargetAtTime(2.0, now, 0.03);
      this.deEsserNode.gain.setTargetAtTime(isPure ? 0 : -1.2, now, 0.03);

      // Silky air shelf
      this.airShelfNode.frequency.setTargetAtTime(10500, now, 0.03);
      this.airShelfNode.gain.setTargetAtTime(isPure ? 0 : p.brillianceDb, now, 0.03);

      // Parallel compression: blends uncompressed transients with smooth sustained studio squeeze
      const compMix = isPure ? 0 : Math.max(0, Math.min(1, p.compressionMix));
      this.compressorNode.threshold.setTargetAtTime(-18, now, 0.03);
      this.compressorNode.knee.setTargetAtTime(28, now, 0.03);
      this.compressorNode.ratio.setTargetAtTime(2.6, now, 0.03);
      this.compressorNode.attack.setTargetAtTime(0.014, now, 0.03);
      this.compressorNode.release.setTargetAtTime(0.36, now, 0.03);

      this.dryGainNode.gain.setTargetAtTime(1 - compMix * 0.55, now, 0.03);
      this.compWetGainNode.gain.setTargetAtTime(compMix * 0.72, now, 0.03);
      this.sumBusNode.gain.setTargetAtTime(isPure ? 1.0 : 1.08, now, 0.03);

      // Filtered algorithmic room ambience send
      this.reverbSendGainNode.gain.setTargetAtTime(isPure ? 0 : p.roomAmbience, now, 0.03);

      // True-peak protection limiter
      this.limiterNode.threshold.setTargetAtTime(-1.0, now, 0.02);
      this.limiterNode.knee.setTargetAtTime(2, now, 0.02);
      this.limiterNode.ratio.setTargetAtTime(16, now, 0.02);
      this.limiterNode.attack.setTargetAtTime(0.001, now, 0.02);
      this.limiterNode.release.setTargetAtTime(0.07, now, 0.02);
    } else if (this.mode === 'smooth') {
      this.inputGainNode.gain.setTargetAtTime(1.0, now, 0.03);

      this.highPassNode.frequency.setTargetAtTime(72, now, 0.03);
      this.highPassNode.Q.setTargetAtTime(0.7, now, 0.03);

      this.mudCutNode.frequency.setTargetAtTime(290, now, 0.03);
      this.mudCutNode.Q.setTargetAtTime(1.2, now, 0.03);
      this.mudCutNode.gain.setTargetAtTime(-1.2, now, 0.03);

      this.warmthShelfNode.frequency.setTargetAtTime(210, now, 0.03);
      this.warmthShelfNode.gain.setTargetAtTime(1.8, now, 0.03);

      this.presenceNode.frequency.setTargetAtTime(3000, now, 0.03);
      this.presenceNode.Q.setTargetAtTime(0.9, now, 0.03);
      this.presenceNode.gain.setTargetAtTime(1.2, now, 0.03);

      this.deEsserNode.frequency.setTargetAtTime(6200, now, 0.03);
      this.deEsserNode.Q.setTargetAtTime(1.8, now, 0.03);
      this.deEsserNode.gain.setTargetAtTime(-1.8, now, 0.03);

      this.airShelfNode.frequency.setTargetAtTime(10000, now, 0.03);
      this.airShelfNode.gain.setTargetAtTime(0.8, now, 0.03);

      this.compressorNode.threshold.setTargetAtTime(-22, now, 0.03);
      this.compressorNode.knee.setTargetAtTime(30, now, 0.03);
      this.compressorNode.ratio.setTargetAtTime(3.2, now, 0.03);
      this.compressorNode.attack.setTargetAtTime(0.011, now, 0.03);
      this.compressorNode.release.setTargetAtTime(0.32, now, 0.03);

      this.dryGainNode.gain.setTargetAtTime(0.25, now, 0.03);
      this.compWetGainNode.gain.setTargetAtTime(0.95, now, 0.03);
      this.sumBusNode.gain.setTargetAtTime(1.16, now, 0.03);

      this.reverbSendGainNode.gain.setTargetAtTime(0, now, 0.03);

      this.limiterNode.threshold.setTargetAtTime(-1.8, now, 0.02);
      this.limiterNode.knee.setTargetAtTime(3, now, 0.02);
      this.limiterNode.ratio.setTargetAtTime(14, now, 0.02);
      this.limiterNode.attack.setTargetAtTime(0.002, now, 0.02);
      this.limiterNode.release.setTargetAtTime(0.08, now, 0.02);
    } else {
      this.inputGainNode.gain.setTargetAtTime(1.0, now, 0.03);

      this.highPassNode.frequency.setTargetAtTime(88, now, 0.03);
      this.highPassNode.Q.setTargetAtTime(0.7, now, 0.03);

      this.mudCutNode.gain.setTargetAtTime(0, now, 0.03);
      this.warmthShelfNode.frequency.setTargetAtTime(200, now, 0.03);
      this.warmthShelfNode.gain.setTargetAtTime(0.6, now, 0.03);

      this.presenceNode.gain.setTargetAtTime(0.6, now, 0.03);
      this.deEsserNode.frequency.setTargetAtTime(6500, now, 0.03);
      this.deEsserNode.gain.setTargetAtTime(-1.0, now, 0.03);
      this.airShelfNode.gain.setTargetAtTime(0, now, 0.03);

      this.compressorNode.threshold.setTargetAtTime(-20, now, 0.03);
      this.compressorNode.knee.setTargetAtTime(24, now, 0.03);
      this.compressorNode.ratio.setTargetAtTime(2.6, now, 0.03);
      this.compressorNode.attack.setTargetAtTime(0.009, now, 0.03);
      this.compressorNode.release.setTargetAtTime(0.24, now, 0.03);

      this.dryGainNode.gain.setTargetAtTime(0.35, now, 0.03);
      this.compWetGainNode.gain.setTargetAtTime(0.75, now, 0.03);
      this.sumBusNode.gain.setTargetAtTime(1.05, now, 0.03);

      this.reverbSendGainNode.gain.setTargetAtTime(0, now, 0.03);

      this.limiterNode.threshold.setTargetAtTime(-2.0, now, 0.02);
      this.limiterNode.knee.setTargetAtTime(4, now, 0.02);
      this.limiterNode.ratio.setTargetAtTime(12, now, 0.02);
      this.limiterNode.attack.setTargetAtTime(0.002, now, 0.02);
      this.limiterNode.release.setTargetAtTime(0.08, now, 0.02);
    }
  }

  setMode(mode: AudioSoundMode) {
    this.mode = mode;
    this.applyPresetParameters();
  }

  setPerformanceOptions(opts: PerformanceAudioOptions) {
    this.perfOptions = opts;
    this.applyPresetParameters();
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (opts.audioContext) {
      this.audioCtx = opts.audioContext;
      this.ownsAudioContext = false;
    } else {
      this.audioCtx = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
      this.ownsAudioContext = true;
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }

    const ctx = this.audioCtx;
    const source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
    const inputGain = ctx.createGain();

    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';

    const mudCut = ctx.createBiquadFilter();
    mudCut.type = 'peaking';

    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowshelf';

    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';

    const deEsser = ctx.createBiquadFilter();
    deEsser.type = 'peaking';

    const airShelf = ctx.createBiquadFilter();
    airShelf.type = 'highshelf';

    const compressor = ctx.createDynamicsCompressor();
    const compWet = ctx.createGain();
    const dryGain = ctx.createGain();
    const sumBus = ctx.createGain();

    const reverbHP = ctx.createBiquadFilter();
    reverbHP.type = 'highpass';
    reverbHP.frequency.value = 260;

    const reverbLP = ctx.createBiquadFilter();
    reverbLP.type = 'lowpass';
    reverbLP.frequency.value = 5200;

    const convolver = ctx.createConvolver();
    convolver.buffer = createStudioImpulseBuffer(ctx, 0.62, 3.2);

    const reverbSend = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 2;

    // Input & 6-stage Studio EQ Chain
    source.connect(inputGain);
    inputGain.connect(highPass);
    highPass.connect(mudCut);
    mudCut.connect(warmth);
    warmth.connect(presence);
    presence.connect(deEsser);
    deEsser.connect(airShelf);

    // Parallel Compression Split -> Sum Bus
    airShelf.connect(dryGain);
    dryGain.connect(sumBus);

    airShelf.connect(compressor);
    compressor.connect(compWet);
    compWet.connect(sumBus);

    // Studio Room Ambience Parallel Send
    sumBus.connect(reverbHP);
    reverbHP.connect(reverbLP);
    reverbLP.connect(convolver);
    convolver.connect(reverbSend);
    reverbSend.connect(limiter);

    // Direct Dry+Compressed Bus -> True Peak Limiter -> Destination
    sumBus.connect(limiter);
    limiter.connect(dest);

    this.sourceNode = source;
    this.inputGainNode = inputGain;
    this.highPassNode = highPass;
    this.mudCutNode = mudCut;
    this.warmthShelfNode = warmth;
    this.presenceNode = presence;
    this.deEsserNode = deEsser;
    this.airShelfNode = airShelf;
    this.compressorNode = compressor;
    this.compWetGainNode = compWet;
    this.dryGainNode = dryGain;
    this.sumBusNode = sumBus;
    this.reverbHighPassNode = reverbHP;
    this.reverbLowPassNode = reverbLP;
    this.convolverNode = convolver;
    this.reverbSendGainNode = reverbSend;
    this.limiterNode = limiter;
    this.destNode = dest;

    this.applyPresetParameters();
    this.processedTrack = dest.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    const nodes: Array<{ disconnect: () => void } | null> = [
      this.sourceNode,
      this.inputGainNode,
      this.highPassNode,
      this.mudCutNode,
      this.warmthShelfNode,
      this.presenceNode,
      this.deEsserNode,
      this.airShelfNode,
      this.compressorNode,
      this.compWetGainNode,
      this.dryGainNode,
      this.sumBusNode,
      this.reverbHighPassNode,
      this.reverbLowPassNode,
      this.convolverNode,
      this.reverbSendGainNode,
      this.limiterNode,
      this.destNode,
    ];
    nodes.forEach((n) => {
      try {
        n?.disconnect();
      } catch {}
    });

    this.sourceNode = null;
    this.inputGainNode = null;
    this.highPassNode = null;
    this.mudCutNode = null;
    this.warmthShelfNode = null;
    this.presenceNode = null;
    this.deEsserNode = null;
    this.airShelfNode = null;
    this.compressorNode = null;
    this.compWetGainNode = null;
    this.dryGainNode = null;
    this.sumBusNode = null;
    this.reverbHighPassNode = null;
    this.reverbLowPassNode = null;
    this.convolverNode = null;
    this.reverbSendGainNode = null;
    this.limiterNode = null;
    this.destNode = null;
    this.processedTrack = undefined;

    if (this.ownsAudioContext && this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch {}
    }
    this.audioCtx = null;
    this.ownsAudioContext = false;
  }
}
