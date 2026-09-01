import React, { useState, useEffect, useRef } from 'react';

export type AIVideoPreset = 'auto' | 'studio' | 'lowlight' | 'smooth' | 'sharp' | 'warm' | 'off';

export interface AIVideoEnhanceOptions {
  preset: AIVideoPreset;
  brightness: number; // 80 - 140 (default 100)
  contrast: number;   // 80 - 140 (default 100)
  saturation: number; // 80 - 140 (default 100)
  warmth: number;     // -20 to +20 (default 0)
  sharpness: boolean;
  autoFraming: boolean;
}

export interface AIAutoAnalysisState {
  isAnalyzing: boolean;
  condition: 'optimal' | 'lowlight' | 'backlit' | 'warm_cast' | 'cool_cast' | 'overexposed';
  diagnosis: string;
  dynamicBrightness: number;
  dynamicContrast: number;
  dynamicSaturation: number;
  dynamicWarmth: number;
  dynamicShadowLift: number;
  lastAnalyzedAt: number;
}

export const DEFAULT_AI_VIDEO_ENHANCE: AIVideoEnhanceOptions = {
  preset: 'auto',
  brightness: 125,
  contrast: 110,
  saturation: 112,
  warmth: 2,
  sharpness: true,
  autoFraming: true,
};

export const AI_PRESET_CONFIGS: Record<AIVideoPreset, { label: string; desc: string; config: Partial<AIVideoEnhanceOptions> }> = {
  auto: {
    label: 'Auto (AI Dynamic)',
    desc: 'Real-time intelligent lighting, complexion, and exposure calibration',
    config: { preset: 'auto', brightness: 125, contrast: 110, saturation: 112, warmth: 2, sharpness: true, autoFraming: true }
  },
  studio: {
    label: 'Studio lighting',
    desc: 'Balanced exposure, lifted midtones and natural portrait contrast',
    config: { preset: 'studio', brightness: 122, contrast: 114, saturation: 112, warmth: 2, sharpness: true, autoFraming: true }
  },
  lowlight: {
    label: 'Low-light boost',
    desc: 'Deep exposure boost and shadow lift for dim rooms',
    config: { preset: 'lowlight', brightness: 145, contrast: 118, saturation: 115, warmth: 4, sharpness: true, autoFraming: true }
  },
  smooth: {
    label: 'Skin smoothing',
    desc: 'Noticeable portrait softening, reduced blemishes, and radiant skin tone',
    config: { preset: 'smooth', brightness: 118, contrast: 106, saturation: 112, warmth: 4, sharpness: false, autoFraming: true }
  },
  sharp: {
    label: 'Edge sharpness',
    desc: 'Crisp facial contours and high-definition texture',
    config: { preset: 'sharp', brightness: 115, contrast: 120, saturation: 110, warmth: 0, sharpness: true, autoFraming: true }
  },
  warm: {
    label: 'Warm daylight',
    desc: 'Golden-hour warm complexion and rich color grading',
    config: { preset: 'warm', brightness: 118, contrast: 110, saturation: 122, warmth: 8, sharpness: false, autoFraming: true }
  },
  off: {
    label: 'Off',
    desc: 'Unprocessed camera capture',
    config: { preset: 'off', brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpness: false, autoFraming: false }
  }
};

/**
 * Computes high-performance CSS filter string for live video processing
 */
export function getAIVideoFilterStyle(
  options?: AIVideoEnhanceOptions | null,
  autoMetrics?: Partial<AIAutoAnalysisState> | null
): string {
  if (!options || options.preset === 'off') return 'none';

  if (options.preset === 'auto') {
    // Dynamic real-time auto calibration using live frame feedback
    const b = (autoMetrics?.dynamicBrightness || options.brightness || 125) / 100;
    const c = (autoMetrics?.dynamicContrast || options.contrast || 110) / 100;
    const s = (autoMetrics?.dynamicSaturation || options.saturation || 112) / 100;
    const warmth = autoMetrics?.dynamicWarmth ?? options.warmth ?? 2;
    const sepia = warmth > 0 ? (warmth * 0.5) / 100 : 0;
    const hueRotate = warmth < 0 ? `${warmth * 0.8}deg` : '0deg';
    const shadowLift = autoMetrics?.dynamicShadowLift || 0;

    // Pure hardware-accelerated CSS tone curve with active luminance boost
    const filterParts = [
      `brightness(${b.toFixed(2)})`,
      `contrast(${c.toFixed(2)})`,
      `saturate(${s.toFixed(2)})`,
    ];

    if (sepia > 0) filterParts.push(`sepia(${sepia.toFixed(3)})`);
    if (hueRotate !== '0deg') filterParts.push(`hue-rotate(${hueRotate})`);
    if (shadowLift > 5) {
      filterParts.push(`drop-shadow(0 0 1px rgba(255,255,255,${Math.min(0.3, shadowLift / 100).toFixed(2)}))`);
    }

    return filterParts.join(' ');
  }

  switch (options.preset) {
    case 'smooth':
      return `brightness(1.18) contrast(1.06) saturate(1.12) sepia(0.04)`;

    case 'studio':
      return `brightness(1.22) contrast(1.14) saturate(1.12) drop-shadow(0 0 1px rgba(255,255,255,0.15))`;

    case 'lowlight':
      return `brightness(1.45) contrast(1.18) saturate(1.15) sepia(0.03)`;

    case 'sharp':
      return `brightness(1.15) contrast(1.20) saturate(1.10)`;

    case 'warm':
      return `brightness(1.18) contrast(1.10) saturate(1.22) sepia(0.12) hue-rotate(-4deg)`;

    default:
      const b = (options.brightness || 120) / 100;
      const c = (options.contrast || 108) / 100;
      const s = (options.saturation || 110) / 100;
      const sepia = options.warmth > 0 ? (options.warmth * 0.6) / 100 : 0;
      return `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${sepia})`;
  }
}

/**
 * Real-time AI Video Auto-Enhancement Hook
 * Constantly samples video frames, computes lighting & color distributions,
 * runs adaptive auto-tuning, and calls Gemini AI vision endpoint for deep scene calibration.
 */
export function useAIVideoAutoEnhancer(
  trackRefOrMediaStream: any,
  options?: AIVideoEnhanceOptions
): {
  filterStyle: string;
  autoState: AIAutoAnalysisState;
} {
  const [autoState, setAutoState] = useState<AIAutoAnalysisState>({
    isAnalyzing: false,
    condition: 'optimal',
    diagnosis: 'AI Auto-Tuning initialized: continuously calibrating exposure and skin tones.',
    dynamicBrightness: 125,
    dynamicContrast: 110,
    dynamicSaturation: 112,
    dynamicWarmth: 2,
    dynamicShadowLift: 8,
    lastAnalyzedAt: Date.now(),
  });

  const lastGeminiCallRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!options || options.preset !== 'auto') return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 64;
      canvasRef.current.height = 48;
    }

    const interval = setInterval(() => {
      try {
        // Find active video element associated with local stream or any rendered video
        let videoEl: HTMLVideoElement | null = null;
        const videos = document.querySelectorAll('video');
        
        if (trackRefOrMediaStream?.publication?.track?.mediaStreamTrack) {
          const trackId = trackRefOrMediaStream.publication.track.mediaStreamTrack.id;
          for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            if (v.srcObject && (v.srcObject as MediaStream).getTracks().some(t => t.id === trackId)) {
              videoEl = v;
              break;
            }
          }
        }

        // Fallback: pick the first playing video element with valid dimensions
        if (!videoEl) {
          for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            if (v.readyState >= 2 && v.videoWidth > 0 && !v.paused) {
              videoEl = v;
              break;
            }
          }
        }

        if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        let totalLuma = 0;
        let centerLuma = 0;
        let centerCount = 0;
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        const pixelCount = canvas.width * canvas.height;

        const minX = Math.floor(canvas.width * 0.25);
        const maxX = Math.floor(canvas.width * 0.75);
        const minY = Math.floor(canvas.height * 0.2);
        const maxY = Math.floor(canvas.height * 0.8);

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            totalLuma += luma;
            totalR += r;
            totalG += g;
            totalB += b;

            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
              centerLuma += luma;
              centerCount++;
            }
          }
        }

        const avgLuma = totalLuma / pixelCount;
        const avgCenterLuma = centerCount > 0 ? centerLuma / centerCount : avgLuma;
        const avgR = totalR / pixelCount;
        const avgG = totalG / pixelCount;
        const avgB = totalB / pixelCount;

        // Lighting & color condition detection with aggressive lowlight rescue
        let condition: AIAutoAnalysisState['condition'] = 'optimal';
        let targetBrightness = 125;
        let targetContrast = 110;
        let targetSaturation = 112;
        let targetWarmth = 2;
        let targetShadowLift = 8;
        let diagnosis = 'Balanced lighting & healthy skin tone calibration active.';

        // Backlight detection: background is significantly brighter than face/center
        if (avgLuma > avgCenterLuma + 15 && avgCenterLuma < 135) {
          condition = 'backlit';
          targetBrightness = Math.min(160, Math.round(132 + (135 - avgCenterLuma) * 0.5));
          targetContrast = 118;
          targetShadowLift = 30;
          targetSaturation = 116;
          diagnosis = 'Backlit subject detected: lifting face midtones and shadow details.';
        } else if (avgLuma < 120) {
          // Low light / normal indoor environment - boost with crystal clear visibility
          condition = 'lowlight';
          targetBrightness = Math.min(165, Math.round(135 + (120 - avgLuma) * 0.45));
          targetContrast = 116;
          targetShadowLift = 35;
          targetSaturation = 118;
          diagnosis = 'Dim environment detected: actively brightening exposure & midtones.';
        } else if (avgLuma > 220) {
          // Overexposed
          condition = 'overexposed';
          targetBrightness = 105;
          targetContrast = 108;
          targetShadowLift = 0;
          targetSaturation = 105;
          diagnosis = 'High ambient glare detected: suppressing highlight blowout.';
        } else if (avgR > avgB * 1.35 && avgR > avgG * 1.15) {
          // Warm tungsten bulb
          condition = 'warm_cast';
          targetBrightness = 130;
          targetContrast = 112;
          targetSaturation = 110;
          targetWarmth = -4; // cool down slightly
          diagnosis = 'Warm incandescent cast detected: balancing white point and cooling shadows.';
        } else if (avgB > avgR * 1.25) {
          // Cool monitor / fluorescent
          condition = 'cool_cast';
          targetBrightness = 132;
          targetContrast = 110;
          targetSaturation = 116;
          targetWarmth = 6; // warm up
          diagnosis = 'Cool monitor glow detected: infusing warm daylight vibrancy.';
        } else {
          // Optimal default: nice healthy radiance
          condition = 'optimal';
          targetBrightness = 128;
          targetContrast = 112;
          targetSaturation = 114;
          targetWarmth = 2;
          targetShadowLift = 10;
          diagnosis = 'Balanced lighting & healthy skin tone calibration active.';
        }

        // Smoothly interpolate current state towards targets
        setAutoState(prev => ({
          ...prev,
          condition,
          diagnosis,
          dynamicBrightness: Math.round(prev.dynamicBrightness * 0.7 + targetBrightness * 0.3),
          dynamicContrast: Math.round(prev.dynamicContrast * 0.7 + targetContrast * 0.3),
          dynamicSaturation: Math.round(prev.dynamicSaturation * 0.7 + targetSaturation * 0.3),
          dynamicWarmth: Math.round(prev.dynamicWarmth * 0.7 + targetWarmth * 0.3),
          dynamicShadowLift: Math.round(prev.dynamicShadowLift * 0.7 + targetShadowLift * 0.3),
          lastAnalyzedAt: Date.now(),
        }));

        // Periodic deep Gemini AI analysis (every 20 seconds or upon significant scene transition)
        const now = Date.now();
        if (now - lastGeminiCallRef.current > 20000 && (condition === 'lowlight' || condition === 'backlit' || condition === 'warm_cast' || condition === 'cool_cast')) {
          lastGeminiCallRef.current = now;
          const snapshotBase64 = canvas.toDataURL('image/jpeg', 0.6);
          fetch('/api/ai/analyze-feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: snapshotBase64,
              currentBrightness: targetBrightness,
              currentContrast: targetContrast,
            })
          })
          .then(res => res.json())
          .then(data => {
            if (data?.enhancements) {
              const e = data.enhancements;
              setAutoState(prev => ({
                ...prev,
                diagnosis: e.diagnosis || prev.diagnosis,
                dynamicBrightness: e.brightness || prev.dynamicBrightness,
                dynamicContrast: e.contrast || prev.dynamicContrast,
                dynamicSaturation: e.saturation || prev.dynamicSaturation,
                dynamicWarmth: e.warmth ?? prev.dynamicWarmth,
                dynamicShadowLift: e.shadowLift ?? prev.dynamicShadowLift,
              }));
            }
          })
          .catch(err => {
            console.debug('[AI Auto-Enhance] Deep scene analysis:', err);
          });
        }
      } catch (err) {
        console.debug('[AI Auto-Enhance] Loop debug:', err);
      }
    }, 1800);

    return () => clearInterval(interval);
  }, [trackRefOrMediaStream, options?.preset]);

  const filterStyle = getAIVideoFilterStyle(options, autoState);

  return { filterStyle, autoState };
}

/**
 * Global SVG filter definition component that powers hardware-accelerated
 * skin smoothing, beauty softening, and edge sharpening filters.
 */
export const AIEnhancementFilterDefs: React.FC = () => {
  return (
    <svg 
      className="sr-only fixed pointer-events-none" 
      aria-hidden="true" 
      width="0" 
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {/* Genuine Skin Smoothing & Soft Glow Filter */}
        <filter id="ai-skin-smoothing-filter" x="-10%" y="-10%" width="120%" height="120%">
          {/* Extract high-frequency luminance to isolate skin texture */}
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="softBlur" />
          
          {/* Smooth color matrix for skin tone leveling */}
          <feColorMatrix
            in="softBlur"
            type="matrix"
            values="1.02 0 0 0 0.02
                    0 1.02 0 0 0.01
                    0 0 0.98 0 0.00
                    0 0 0 1 0"
            result="colorToned"
          />

          {/* Soft-light blend of the smooth blur over the original sharp details */}
          <feBlend in="SourceGraphic" in2="colorToned" mode="soft-light" result="blended" />
          
          {/* Final composite preserving crisp eye/mouth details while smoothing skin */}
          <feComposite in="blended" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.68" k3="0.42" k4="0" />
        </filter>

        {/* High-Definition Edge Clarity & Sharpness Filter */}
        <filter id="ai-sharpness-filter" x="-10%" y="-10%" width="120%" height="120%">
          <feConvolveMatrix
            order="3"
            preserveAlpha="true"
            kernelMatrix=" 0  -0.45  0
                          -0.45  2.8 -0.45
                            0  -0.45  0"
            result="sharpened"
          />
        </filter>
      </defs>
    </svg>
  );
};
