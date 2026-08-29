import { useState, useEffect, useCallback } from 'react';

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  facing?: 'user' | 'environment' | 'unknown';
}

export function useDeviceManager() {
  const [videoDevices, setVideoDevices] = useState<DeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<DeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<DeviceInfo[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasPermission, setHasPermission] = useState(false);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const vDevices: DeviceInfo[] = [];
      const aDevices: DeviceInfo[] = [];
      const sDevices: DeviceInfo[] = [];

      let camCount = 0;
      let micCount = 0;
      let spkCount = 0;

      let granted = false;

      devices.forEach((d) => {
        if (d.label) granted = true;

        if (d.kind === 'videoinput') {
          camCount++;
          const labelLower = (d.label || '').toLowerCase();
          let facing: 'user' | 'environment' | 'unknown' = 'unknown';
          
          if (labelLower.includes('front') || labelLower.includes('user') || labelLower.includes('facetime') || labelLower.includes('selfie')) {
            facing = 'user';
          } else if (labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('environment') || labelLower.includes('wide') || labelLower.includes('ultra')) {
            facing = 'environment';
          }

          let displayLabel = d.label;
          if (!displayLabel) {
            displayLabel = camCount === 1 ? 'Default / Front Camera' : `Camera ${camCount}`;
          }

          vDevices.push({
            deviceId: d.deviceId,
            label: displayLabel,
            kind: d.kind,
            facing
          });
        } else if (d.kind === 'audioinput') {
          micCount++;
          let displayLabel = d.label;
          if (!displayLabel) {
            displayLabel = micCount === 1 ? 'Default Microphone' : `Microphone ${micCount}`;
          }
          aDevices.push({
            deviceId: d.deviceId,
            label: displayLabel,
            kind: d.kind
          });
        } else if (d.kind === 'audiooutput') {
          spkCount++;
          let displayLabel = d.label;
          if (!displayLabel) {
            displayLabel = spkCount === 1 ? 'Default Speaker' : `Speaker ${spkCount}`;
          }
          sDevices.push({
            deviceId: d.deviceId,
            label: displayLabel,
            kind: d.kind
          });
        }
      });

      setHasPermission(granted);
      setVideoDevices(vDevices);
      setAudioDevices(aDevices);
      setSpeakerDevices(sDevices);
    } catch (err) {
      console.warn('[useDeviceManager] Device enumeration error:', err);
    }
  }, []);

  useEffect(() => {
    refreshDevices();

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  // Front/Back mobile camera switcher
  const getNextCameraFacing = useCallback(() => {
    return facingMode === 'user' ? 'environment' : 'user';
  }, [facingMode]);

  return {
    videoDevices,
    audioDevices,
    speakerDevices,
    facingMode,
    setFacingMode,
    hasPermission,
    refreshDevices,
    getNextCameraFacing
  };
}
