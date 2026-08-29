export type AIVideoPreset = 'off' | 'studio' | 'lowlight' | 'crisp' | 'natural';

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
  preset: 'studio',
  brightness: 105,
  contrast: 108,
  saturation: 106,
  warmth: 2,
  sharpness: true,
  autoFraming: false,
};

export const AI_PRESET_CONFIGS: Record<AIVideoPreset, { label: string; desc: string; config: Partial<AIVideoEnhanceOptions> }> = {
  off: {
    label: 'Off',
    desc: 'Unprocessed camera feed',
    config: { preset: 'off', brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpness: false, autoFraming: false }
  },
  studio: {
    label: 'Studio Lighting',
    desc: 'Balanced lighting and clear contrast',
    config: { preset: 'studio', brightness: 106, contrast: 108, saturation: 106, warmth: 2, sharpness: true, autoFraming: false }
  },
  lowlight: {
    label: 'Low-Light Boost',
    desc: 'Enhance visibility in darker rooms',
    config: { preset: 'lowlight', brightness: 122, contrast: 112, saturation: 104, warmth: 4, sharpness: true, autoFraming: false }
  },
  crisp: {
    label: 'Crisp & Sharp',
    desc: 'Increased edge definition and clarity',
    config: { preset: 'crisp', brightness: 104, contrast: 114, saturation: 108, warmth: 0, sharpness: true, autoFraming: false }
  },
  natural: {
    label: 'Soft & Natural',
    desc: 'Slight warmth and balanced tones',
    config: { preset: 'natural', brightness: 106, contrast: 104, saturation: 108, warmth: 6, sharpness: false, autoFraming: false }
  }
};

/**
 * Computes CSS filter string for high-efficiency AI Video Enhancement
 */
export function getAIVideoFilterStyle(options: AIVideoEnhanceOptions): string {
  if (options.preset === 'off') return 'none';

  const b = options.brightness / 100;
  const c = options.contrast / 100;
  const s = options.saturation / 100;
  const sepia = options.warmth > 0 ? (options.warmth * 0.4) / 100 : 0;
  const hueRotate = options.warmth < 0 ? `${options.warmth}deg` : '0deg';

  return `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${sepia}) hue-rotate(${hueRotate})`;
}
