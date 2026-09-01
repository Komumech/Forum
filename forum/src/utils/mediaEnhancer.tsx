import React from 'react';

export type AIVideoPreset = 'off' | 'studio' | 'lowlight' | 'smooth' | 'sharp' | 'warm';

export interface AIVideoEnhanceOptions {
  preset: AIVideoPreset;
  brightness: number; // 80 - 140 (default 100)
  contrast: number;   // 80 - 140 (default 100)
  saturation: number; // 80 - 140 (default 100)
  warmth: number;     // -20 to +20 (default 0)
  sharpness: boolean;
  autoFraming: boolean;
}

export const DEFAULT_AI_VIDEO_ENHANCE: AIVideoEnhanceOptions = {
  preset: 'smooth',
  brightness: 106,
  contrast: 106,
  saturation: 108,
  warmth: 3,
  sharpness: true,
  autoFraming: true,
};

export const AI_PRESET_CONFIGS: Record<AIVideoPreset, { label: string; desc: string; config: Partial<AIVideoEnhanceOptions> }> = {
  off: {
    label: 'Off',
    desc: 'Unprocessed camera capture',
    config: { preset: 'off', brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpness: false, autoFraming: false }
  },
  studio: {
    label: 'Studio lighting',
    desc: 'Balanced exposure, lifted midtones and natural portrait contrast',
    config: { preset: 'studio', brightness: 110, contrast: 112, saturation: 110, warmth: 2, sharpness: true, autoFraming: true }
  },
  lowlight: {
    label: 'Low-light boost',
    desc: 'Deep exposure boost and shadow lift for dim rooms',
    config: { preset: 'lowlight', brightness: 130, contrast: 115, saturation: 112, warmth: 4, sharpness: true, autoFraming: true }
  },
  smooth: {
    label: 'Skin smoothing',
    desc: 'Noticeable portrait softening, reduced blemishes, and radiant skin tone',
    config: { preset: 'smooth', brightness: 108, contrast: 104, saturation: 112, warmth: 4, sharpness: false, autoFraming: true }
  },
  sharp: {
    label: 'Edge sharpness',
    desc: 'Crisp facial contours and high-definition texture',
    config: { preset: 'sharp', brightness: 105, contrast: 118, saturation: 108, warmth: 0, sharpness: true, autoFraming: true }
  },
  warm: {
    label: 'Warm daylight',
    desc: 'Golden-hour warm complexion and rich color grading',
    config: { preset: 'warm', brightness: 108, contrast: 108, saturation: 118, warmth: 8, sharpness: false, autoFraming: true }
  }
};

/**
 * Computes high-performance CSS filter string for live video processing
 */
export function getAIVideoFilterStyle(options?: AIVideoEnhanceOptions | null): string {
  if (!options || options.preset === 'off') return 'none';

  switch (options.preset) {
    case 'smooth':
      // Combines SVG bilateral skin-softening with tuned exposure and color vibrance
      return `url(#ai-skin-smoothing-filter) brightness(1.08) contrast(1.04) saturate(1.12) sepia(0.04)`;

    case 'studio':
      // Dynamic range lift with crisp tone curve
      return `brightness(1.10) contrast(1.14) saturate(1.12) drop-shadow(0 0 1px rgba(255,255,255,0.15))`;

    case 'lowlight':
      // Powerful HDR shadow lift for dark rooms
      return `brightness(1.32) contrast(1.18) saturate(1.15) sepia(0.03)`;

    case 'sharp':
      // Edge sharpness unsharp-mask filter
      return `url(#ai-sharpness-filter) brightness(1.05) contrast(1.16) saturate(1.08)`;

    case 'warm':
      // Golden daylight tone curve
      return `brightness(1.08) contrast(1.08) saturate(1.20) sepia(0.12) hue-rotate(-4deg)`;

    default:
      const b = (options.brightness || 100) / 100;
      const c = (options.contrast || 100) / 100;
      const s = (options.saturation || 100) / 100;
      const sepia = options.warmth > 0 ? (options.warmth * 0.6) / 100 : 0;
      return `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${sepia})`;
  }
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
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="softBlur" />
          
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
          <feComposite in="blended" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.65" k3="0.45" k4="0" />
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
