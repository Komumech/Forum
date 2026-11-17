import { useEffect, useRef, useState } from 'react';
import { Participant } from 'livekit-client';

export interface VoiceActivityState {
  isSpeaking: boolean;
  volume: number; // 0 to 100
  bars: [number, number, number]; // 0 to 1 values for 3-bar visualizer
}

/**
 * High-performance real-time audio volume and frequency analyzer hook.
 * Directly taps into the MediaStreamTrack with Web Audio API AnalyserNode
 * to provide instantaneous, buttery smooth 60 FPS voice animations on participant tiles.
 */
const IDLE_VOICE_STATE: VoiceActivityState = {
  isSpeaking: false,
  volume: 0,
  bars: [0.15, 0.2, 0.15],
};

export function useVoiceActivity(participant?: Participant | null): VoiceActivityState {
  const [activity, setActivity] = useState<VoiceActivityState>(IDLE_VOICE_STATE);

  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!participant) {
      setActivity((prev) => (!prev.isSpeaking && prev.volume === 0 ? prev : IDLE_VOICE_STATE));
      return;
    }

    const audioTrackPub = participant.getTrackPublication('microphone' as any) ||
                          participant.audioTrackPublications.values().next().value;
    const mediaStreamTrack = audioTrackPub?.track?.mediaStreamTrack;

    if (!mediaStreamTrack || mediaStreamTrack.readyState !== 'live' || !participant.isMicrophoneEnabled) {
      setActivity((prev) => (!prev.isSpeaking && prev.volume === 0 ? prev : IDLE_VOICE_STATE));
      return;
    }

    let isDestroyed = false;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const stream = new MediaStream([mediaStreamTrack]);
      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let smoothVol = 0;
      let lastEmitTime = 0;
      let lastSpeaking = false;
      let lastVolume = 0;

      const checkAudio = () => {
        if (isDestroyed) return;

        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        let lowEnergy = 0;
        let midEnergy = 0;
        let highEnergy = 0;

        const binCount = dataArray.length;
        for (let i = 0; i < binCount; i++) {
          const val = dataArray[i];
          sum += val * val;
          if (i < binCount * 0.33) {
            lowEnergy += val;
          } else if (i < binCount * 0.66) {
            midEnergy += val;
          } else {
            highEnergy += val;
          }
        }

        const rms = Math.sqrt(sum / binCount);
        const rawVol = Math.min(100, Math.round((rms / 128) * 100));

        smoothVol = smoothVol * 0.7 + rawVol * 0.3;
        const normalizedVol = Math.round(smoothVol);
        const isSpeakingNow = normalizedVol > 10;

        const now = performance.now();
        const speakingChanged = isSpeakingNow !== lastSpeaking;
        const volumeChanged = Math.abs(normalizedVol - lastVolume) >= 3;

        if ((speakingChanged || volumeChanged || isSpeakingNow) && now - lastEmitTime >= 150) {
          lastEmitTime = now;
          lastSpeaking = isSpeakingNow;
          lastVolume = normalizedVol;

          if (!isSpeakingNow && normalizedVol < 3) {
            setActivity((prev) => (!prev.isSpeaking && prev.volume === 0 ? prev : IDLE_VOICE_STATE));
          } else {
            const bar1 = Math.max(0.15, Math.min(1, lowEnergy / (binCount * 0.33 * 220)));
            const bar2 = Math.max(0.2, Math.min(1, midEnergy / (binCount * 0.33 * 200)));
            const bar3 = Math.max(0.15, Math.min(1, highEnergy / (binCount * 0.33 * 180)));
            setActivity({
              isSpeaking: isSpeakingNow,
              volume: normalizedVol,
              bars: isSpeakingNow ? [bar1, bar2, bar3] : IDLE_VOICE_STATE.bars,
            });
          }
        }

        animFrameRef.current = requestAnimationFrame(checkAudio);
      };

      animFrameRef.current = requestAnimationFrame(checkAudio);
    } catch (err) {
      console.warn('AudioContext visualization setup note:', err);
    }

    return () => {
      isDestroyed = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch {}
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
    };
  }, [participant, participant?.isMicrophoneEnabled]);

  return activity;
}
