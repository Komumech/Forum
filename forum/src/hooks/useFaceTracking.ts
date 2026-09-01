import { useEffect, useRef, useState } from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';

export interface FacePosition {
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
}

/**
 * Intelligent face tracking hook that detects the user's face in the video stream
 * and calculates the optimal CSS object-position (X%, Y%) to keep their face centered
 * when the video tile is cropped by container aspect ratios.
 */
export function useFaceTracking(
  trackRef?: TrackReferenceOrPlaceholder | null,
  enabled: boolean = true
): FacePosition {
  const [facePosition, setFacePosition] = useState<FacePosition>({ x: 50, y: 50 });
  const currentPosRef = useRef<FacePosition>({ x: 50, y: 50 });
  const targetPosRef = useRef<FacePosition>({ x: 50, y: 50 });
  const animFrameRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !trackRef?.publication?.track?.mediaStreamTrack) {
      setFacePosition({ x: 50, y: 50 });
      return;
    }

    const mediaStreamTrack = trackRef.publication.track.mediaStreamTrack;
    if (mediaStreamTrack.kind !== 'video' || mediaStreamTrack.readyState !== 'live') {
      return;
    }

    let isDestroyed = false;

    // Create a hidden video element for sampling
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    
    // Create an offscreen canvas for fast sampling (64x48)
    const canvas = document.createElement('canvas');
    const width = 64;
    const height = 48;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stream = new MediaStream([mediaStreamTrack]);
    video.srcObject = stream;
    video.play().catch(() => {});

    // Check for native FaceDetector support
    let nativeDetector: any = null;
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        nativeDetector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        nativeDetector = null;
      }
    }

    // Detection loop running at ~8 FPS (120ms) to save CPU/battery while remaining responsive
    const detectFace = async () => {
      if (isDestroyed || !video.videoWidth || !video.videoHeight || !ctx) return;

      try {
        let detectedCenterX: number | null = null;
        let detectedCenterY: number | null = null;

        if (nativeDetector) {
          try {
            const faces = await nativeDetector.detect(video);
            if (faces && faces.length > 0) {
              const face = faces[0].boundingBox;
              detectedCenterX = ((face.x + face.width / 2) / video.videoWidth) * 100;
              detectedCenterY = ((face.y + face.height / 2) / video.videoHeight) * 100;
            }
          } catch {
            nativeDetector = null;
          }
        }

        // Fast centroid skin & feature fallback detector
        if (detectedCenterX === null || detectedCenterY === null) {
          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;

          let sumX = 0;
          let sumY = 0;
          let totalWeight = 0;

          // Scan pixels for human skin tones & face features
          for (let y = 0; y < height; y++) {
            // Prioritize upper 65% of screen where faces naturally appear
            const verticalWeight = y < height * 0.75 ? 1.2 : 0.6;

            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];

              // Skin chrominance model
              const isSkin = 
                r > 70 && 
                g > 40 && 
                b > 20 && 
                r > g && 
                r > b && 
                (r - g) > 10 && 
                (r - b) > 10 &&
                Math.abs(r - g) < 120;

              if (isSkin) {
                const w = verticalWeight;
                sumX += x * w;
                sumY += y * w;
                totalWeight += w;
              }
            }
          }

          // If enough skin pixels were detected, calculate centroid
          if (totalWeight > (width * height * 0.02)) {
            const rawX = (sumX / totalWeight / width) * 100;
            const rawY = (sumY / totalWeight / height) * 100;

            // Clamp so we don't over-shift to the very extreme borders
            detectedCenterX = Math.max(20, Math.min(80, rawX));
            detectedCenterY = Math.max(15, Math.min(75, rawY));
          }
        }

        if (detectedCenterX !== null && detectedCenterY !== null) {
          targetPosRef.current = {
            x: detectedCenterX,
            y: detectedCenterY
          };
        }
      } catch {
        // Ignore sampling errors
      }
    };

    intervalRef.current = window.setInterval(detectFace, 125);

    // Smooth animation lerp loop (60 FPS) for buttery smooth camera re-centering
    const smoothUpdate = () => {
      if (isDestroyed) return;

      const cur = currentPosRef.current;
      const target = targetPosRef.current;

      const lerpFactor = 0.08; // Smooth exponential damping
      const nextX = cur.x + (target.x - cur.x) * lerpFactor;
      const nextY = cur.y + (target.y - cur.y) * lerpFactor;

      if (Math.abs(nextX - cur.x) > 0.05 || Math.abs(nextY - cur.y) > 0.05) {
        currentPosRef.current = { x: nextX, y: nextY };
        setFacePosition({
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10
        });
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

  return facePosition;
}
