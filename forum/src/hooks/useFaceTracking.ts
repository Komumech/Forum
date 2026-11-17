import { useEffect, useRef, useState, useMemo, CSSProperties } from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';

export interface FacePosition {
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
  width?: number; // approx percentage
  height?: number;
}

export interface FaceTrackingResult {
  facePosition: FacePosition;
  faceLuma: number; // 0 to 255
  frameLuma: number; // 0 to 255
  isFaceDark: boolean;
  faceSpotlightActive: boolean;
  faceSpotlightStyle: CSSProperties;
}

/**
 * Intelligent face tracking & targeted facial lighting hook.
 * 1. Detects face position (X, Y) to keep video centered.
 * 2. Samples face vs frame luminance in real-time.
 * 3. Generates dynamic facial studio spotlight illumination when the face is in shadow or backlit.
 */
export function useFaceTracking(
  trackRef?: TrackReferenceOrPlaceholder | null,
  enabled: boolean = true
): FaceTrackingResult {
  const [facePosition, setFacePosition] = useState<FacePosition>({ x: 50, y: 50, width: 35, height: 40 });
  const [faceLuma, setFaceLuma] = useState<number>(140);
  const [frameLuma, setFrameLuma] = useState<number>(130);
  const [spotlightIntensity, setSpotlightIntensity] = useState<number>(0);

  const currentPosRef = useRef<FacePosition>({ x: 50, y: 50, width: 35, height: 40 });
  const targetPosRef = useRef<FacePosition>({ x: 50, y: 50, width: 35, height: 40 });
  const targetSpotlightRef = useRef<number>(0);
  const currentSpotlightRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !trackRef?.publication?.track?.mediaStreamTrack) {
      setFacePosition((prev) => (prev.x === 50 && prev.y === 50 ? prev : { x: 50, y: 50, width: 35, height: 40 }));
      setSpotlightIntensity((prev) => (prev === 0 ? prev : 0));
      return;
    }

    const mediaStreamTrack = trackRef.publication.track.mediaStreamTrack;
    if (mediaStreamTrack.kind !== 'video' || mediaStreamTrack.readyState !== 'live') {
      return;
    }

    let isDestroyed = false;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    const canvas = document.createElement('canvas');
    const width = 64;
    const height = 48;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stream = new MediaStream([mediaStreamTrack]);
    video.srcObject = stream;
    video.play().catch(() => {});

    let lastLumaEmit = 0;

    // Detection loop running at ~4 FPS (250ms)
    const detectFace = async () => {
      if (isDestroyed || !video.videoWidth || !video.videoHeight || !ctx) return;

      try {
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        let sumX = 0;
        let sumY = 0;
        let totalSkinWeight = 0;
        let totalFrameLuma = 0;
        let facePixelLumaSum = 0;
        let facePixelCount = 0;

        const pixelCount = width * height;

        for (let y = 0; y < height; y++) {
          const verticalWeight = y < height * 0.75 ? 1.2 : 0.6;

          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            totalFrameLuma += lum;

            const isSkin =
              r > 60 &&
              g > 35 &&
              b > 20 &&
              r > g &&
              r > b &&
              (r - g) > 8 &&
              (r - b) > 8 &&
              Math.abs(r - g) < 130;

            if (isSkin) {
              const w = verticalWeight;
              sumX += x * w;
              sumY += y * w;
              totalSkinWeight += w;
              facePixelLumaSum += lum;
              facePixelCount++;
            }
          }
        }

        const avgFrameLuma = Math.round(totalFrameLuma / pixelCount);

        let detectedCenterX = 50;
        let detectedCenterY = 45;
        let avgFaceLuma = avgFrameLuma;

        if (totalSkinWeight > (pixelCount * 0.015)) {
          const rawX = (sumX / totalSkinWeight / width) * 100;
          const rawY = (sumY / totalSkinWeight / height) * 100;

          detectedCenterX = Math.max(20, Math.min(80, rawX));
          detectedCenterY = Math.max(15, Math.min(75, rawY));
          avgFaceLuma = Math.round(facePixelLumaSum / Math.max(1, facePixelCount));
        }

        const now = performance.now();
        if (now - lastLumaEmit >= 500) {
          lastLumaEmit = now;
          setFrameLuma((prev) => (Math.abs(prev - avgFrameLuma) >= 4 ? avgFrameLuma : prev));
          setFaceLuma((prev) => (Math.abs(prev - avgFaceLuma) >= 4 ? avgFaceLuma : prev));
        }

        targetPosRef.current = {
          x: detectedCenterX,
          y: detectedCenterY,
          width: 36,
          height: 42,
        };

        let intensity = 0;
        if (avgFaceLuma < 125) {
          intensity = Math.min(0.48, ((125 - avgFaceLuma) / 100) * 0.55 + 0.12);
        } else if (avgFrameLuma > avgFaceLuma + 18) {
          intensity = Math.min(0.42, ((avgFrameLuma - avgFaceLuma) / 80) * 0.45);
        }

        targetSpotlightRef.current = intensity;
      } catch {
        // Ignore sampling errors
      }
    };

    intervalRef.current = window.setInterval(detectFace, 250);

    let lastFrameEmit = 0;
    const smoothUpdate = () => {
      if (isDestroyed) return;

      const cur = currentPosRef.current;
      const target = targetPosRef.current;

      const lerpFactor = 0.08;
      const nextX = cur.x + (target.x - cur.x) * lerpFactor;
      const nextY = cur.y + (target.y - cur.y) * lerpFactor;

      const curSpot = currentSpotlightRef.current;
      const targetSpot = targetSpotlightRef.current;
      const nextSpot = curSpot + (targetSpot - curSpot) * 0.06;

      currentSpotlightRef.current = nextSpot;
      currentPosRef.current = { ...cur, x: nextX, y: nextY };

      const now = performance.now();
      if (now - lastFrameEmit >= 180) {
        lastFrameEmit = now;
        const roundedX = Math.round(nextX * 10) / 10;
        const roundedY = Math.round(nextY * 10) / 10;
        setFacePosition((prev) =>
          Math.abs(roundedX - prev.x) > 0.8 || Math.abs(roundedY - prev.y) > 0.8
            ? { x: roundedX, y: roundedY, width: 36, height: 42 }
            : prev
        );
        setSpotlightIntensity((prev) => (Math.abs(nextSpot - prev) > 0.03 ? nextSpot : prev));
      }

      animFrameRef.current = requestAnimationFrame(smoothUpdate);
    };

    animFrameRef.current = requestAnimationFrame(smoothUpdate);

    return () => {
      isDestroyed = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      video.srcObject = null;
      video.remove();
      canvas.remove();
    };
  }, [trackRef?.publication?.track?.mediaStreamTrack, enabled]);

  // Dynamic CSS spotlight overlay style targeting user's face coordinates
  const faceSpotlightStyle = useMemo<CSSProperties>(() => {
    if (spotlightIntensity <= 0.02) {
      return { display: 'none' };
    }

    const clampedIntensity = Math.min(0.5, spotlightIntensity);
    const alphaCore = (clampedIntensity * 0.95).toFixed(3);
    const alphaMid = (clampedIntensity * 0.45).toFixed(3);

    return {
      backgroundImage: `radial-gradient(ellipse 42% 48% at ${facePosition.x}% ${facePosition.y}%, rgba(255, 248, 235, ${alphaCore}) 0%, rgba(255, 244, 225, ${alphaMid}) 42%, rgba(255, 240, 215, 0.02) 75%, transparent 100%)`,
      mixBlendMode: 'screen',
      filter: 'blur(12px)',
      opacity: Math.min(1, spotlightIntensity * 1.8),
      pointerEvents: 'none',
    };
  }, [facePosition.x, facePosition.y, spotlightIntensity]);

  return {
    facePosition,
    faceLuma,
    frameLuma,
    isFaceDark: faceLuma < 125,
    faceSpotlightActive: spotlightIntensity > 0.02,
    faceSpotlightStyle,
  };
}
