import { LocalVideoTrack } from 'livekit-client';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';

export type BackgroundMode = 'none' | 'blur' | 'image' | 'greenscreen' | 'color';

export interface BackgroundPreset {
  id: string;
  label: string;
  type: 'image' | 'color' | 'greenscreen';
  value: string; // URL or Hex
  previewColor?: string;
}

export const SOLID_STUDIO_COLORS: BackgroundPreset[] = [
  { id: 'chroma_green', label: 'Studio Green (Chroma Key)', type: 'greenscreen', value: '#00FF00', previewColor: '#00FF00' },
  { id: 'neon_green', label: 'Neon Screen', type: 'greenscreen', value: '#00E676', previewColor: '#00E676' },
  { id: 'studio_blue', label: 'Chroma Blue', type: 'greenscreen', value: '#0047FF', previewColor: '#0047FF' },
  { id: 'dark_studio', label: 'Dark Studio', type: 'color', value: '#121316', previewColor: '#121316' },
  { id: 'warm_studio', label: 'Warm Neutral', type: 'color', value: '#24201D', previewColor: '#24201D' },
  { id: 'cyber_indigo', label: 'Cyber Indigo', type: 'color', value: '#1E1B4B', previewColor: '#1E1B4B' },
  { id: 'clean_white', label: 'Radiant White', type: 'color', value: '#F8FAFC', previewColor: '#F8FAFC' },
];

export const VIRTUAL_BG_PRESETS: BackgroundPreset[] = [
  { id: 'office', label: 'Modern Office', type: 'image', value: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80' },
  { id: 'loft', label: 'Aesthetic Loft', type: 'image', value: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80' },
  { id: 'library', label: 'Bookshelf Studio', type: 'image', value: 'https://images.unsplash.com/photo-1507842229452-947547ff57b7?auto=format&fit=crop&w=1200&q=80' },
  { id: 'cafe', label: 'Warm Cafe', type: 'image', value: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80' },
  { id: 'nature', label: 'Calm Nature', type: 'image', value: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80' },
  { id: 'minimal', label: 'Minimalist Gradient', type: 'image', value: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80' },
];

let activeCanvasTrack: MediaStreamTrack | null = null;
let activeCanvasAnimation: number | null = null;

/**
 * Safely applies or switches virtual backgrounds / blur / green-screen on a video track.
 * Supports smooth hardware-accelerated processing and handles mobile browsers gracefully.
 */
export async function applyBackgroundEffect(
  videoTrack: LocalVideoTrack | null | undefined,
  mode: BackgroundMode,
  options?: {
    imageUrl?: string;
    colorHex?: string;
    blurRadius?: number;
    chromaKeyHex?: string;
  }
): Promise<boolean> {
  if (!videoTrack || !videoTrack.mediaStreamTrack) {
    console.warn('[applyBackgroundEffect] No active video track or mediaStreamTrack available');
    return false;
  }

  try {
    // 1. Stop any currently active track processor
    try {
      if (videoTrack.getProcessor()) {
        await videoTrack.stopProcessor();
      }
    } catch (stopErr) {
      console.warn('[applyBackgroundEffect] Error stopping previous processor:', stopErr);
    }

    if (mode === 'none') {
      return true;
    }

    if (mode === 'blur') {
      try {
        const processor = BackgroundBlur(options?.blurRadius || 14);
        await videoTrack.setProcessor(processor);
        console.log('[applyBackgroundEffect] Background blur applied successfully');
        return true;
      } catch (err) {
        console.warn('[applyBackgroundEffect] Track processor blur fallback:', err);
        return false;
      }
    }

    if (mode === 'image' || mode === 'color' || mode === 'greenscreen') {
      const bgSource = mode === 'image' 
        ? (options?.imageUrl || VIRTUAL_BG_PRESETS[0].value) 
        : (options?.colorHex || (mode === 'greenscreen' ? '#00FF00' : '#121316'));

      try {
        // If it's a solid color or green screen, generate a solid canvas data URL
        let finalImageSource = bgSource;
        if (mode === 'color' || mode === 'greenscreen' || bgSource.startsWith('#')) {
          const colorCanvas = document.createElement('canvas');
          colorCanvas.width = 64;
          colorCanvas.height = 64;
          const ctx = colorCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = bgSource.startsWith('#') ? bgSource : '#00FF00';
            ctx.fillRect(0, 0, 64, 64);
            finalImageSource = colorCanvas.toDataURL('image/png');
          }
        }

        const processor = VirtualBackground(finalImageSource);
        await videoTrack.setProcessor(processor);
        console.log('[applyBackgroundEffect] Virtual background applied successfully');
        return true;
      } catch (err) {
        console.warn('[applyBackgroundEffect] Track processor virtual background fallback:', err);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('[applyBackgroundEffect] Failed to apply background processor:', err);
    return false;
  }
}
