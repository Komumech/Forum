import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Mic, 
  Video as VideoIcon, 
  VideoOff, 
  Radio, 
  Settings as SettingsIcon, 
  MessageSquare, 
  Smile, 
  ChevronRight, 
  ChevronLeft, 
  Copy, 
  Check, 
  Trash2, 
  Volume2, 
  Image as ImageIcon,
  Shield,
  Clock,
  Subtitles,
  Globe,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Palette,
  Bell
} from 'lucide-react';
import {
  getPushPreferences,
  savePushPreferences,
  getNotificationSupportStatus,
  requestForumNotificationPermission,
  triggerForumPushNotification
} from '../utils/pushNotifications';
import { VideoTrack } from '@livekit/components-react';
import { Track, Participant } from 'livekit-client';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import CustomDropdown, { DropdownOption } from './CustomDropdown';
import { 
  AIVideoPreset, 
  AIVideoEnhanceOptions, 
  DEFAULT_AI_VIDEO_ENHANCE, 
  AI_PRESET_CONFIGS, 
  getAIVideoFilterStyle 
} from '../utils/mediaEnhancer';
import { SOLID_STUDIO_COLORS, VIRTUAL_BG_PRESETS } from '../utils/backgroundProcessor';

export type SettingsCategoryType = 'video' | 'audio' | 'effects' | 'streaming' | 'general' | 'captions' | 'reactions';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
  localParticipant: Participant;
  audioDevices: MediaDeviceInfo[];
  speakerDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioId: string;
  setSelectedAudioId: (id: string) => void;
  selectedSpeakerId: string;
  setSelectedSpeakerId: (id: string) => void;
  selectedVideoId: string;
  setSelectedVideoId: (id: string) => void;
  noiseCancellation: boolean;
  setNoiseCancellation: (val: boolean) => void;
  echoCancellation: boolean;
  setEchoCancellation: (val: boolean) => void;
  aiDenoise?: boolean;
  setAiDenoise?: (val: boolean) => void;
  hvacFilter?: boolean;
  setHvacFilter?: (val: boolean) => void;
  vocalCompressor?: boolean;
  setVocalCompressor?: (val: boolean) => void;
  videoMirroring: boolean;
  setVideoMirroring: (val: boolean) => void;
  aiVideoOptions?: AIVideoEnhanceOptions;
  setAiVideoOptions?: (opts: AIVideoEnhanceOptions) => void;
  onFlipCamera?: () => void;
  facingMode?: 'user' | 'environment';
  showClock: boolean;
  setShowClock: (val: boolean) => void;
  lobbyEnabled: boolean;
  setLobbyEnabled: (val: boolean) => void;
  isHost: boolean;
  room: string | undefined;
  isCaptionsEnabled: boolean;
  setIsCaptionsEnabled: (val: boolean) => void;
  selectedBg: 'none' | 'blur' | 'image' | 'greenscreen' | 'color';
  setSelectedBg: (val: any) => void;
  selectedBgImage: string;
  setSelectedBgImage: (val: string) => void;
  customBgImage: string | null;
  setCustomBgImage: (val: string | null) => void;
  bgImages: Array<{ id: string; url: string; label: string }>;
  activeFeedCount: number;
  feedExports: any[];
  streamProfile: 'standard' | 'high';
  setStreamProfile: (val: 'standard' | 'high') => void;
  liveResolution: string;
  liveFps: number;
  liveBitrate: string;
  copyIsolatedFeedLink: (p: Participant) => void;
  copyExportLinkAgain: (item: any) => void;
  revokeExportToken: (id: string) => void;
  copiedExportId: string | null;
  initialCategory?: SettingsCategoryType;
}

// Material 3 Switch Component
function MaterialSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "w-11 h-6 rounded-full transition-colors relative inline-flex items-center shrink-0 cursor-pointer p-0.5 outline-none focus-visible:ring-1 focus-visible:ring-emerald-700/50",
        checked ? "bg-emerald-700" : "bg-neutral-300",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "w-5 h-5 rounded-full bg-white transition-transform shadow-xs block",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

export default function SettingsModal({
  isOpen,
  onClose,
  isMobile,
  localParticipant,
  audioDevices,
  speakerDevices,
  videoDevices,
  selectedAudioId,
  setSelectedAudioId,
  selectedSpeakerId,
  setSelectedSpeakerId,
  selectedVideoId,
  setSelectedVideoId,
  noiseCancellation,
  setNoiseCancellation,
  echoCancellation,
  setEchoCancellation,
  videoMirroring,
  setVideoMirroring,
  aiVideoOptions = DEFAULT_AI_VIDEO_ENHANCE,
  setAiVideoOptions,
  onFlipCamera,
  showClock,
  setShowClock,
  lobbyEnabled,
  setLobbyEnabled,
  isHost,
  room,
  isCaptionsEnabled,
  setIsCaptionsEnabled,
  selectedBg,
  setSelectedBg,
  selectedBgImage,
  setSelectedBgImage,
  customBgImage,
  setCustomBgImage,
  bgImages,
  feedExports,
  streamProfile,
  setStreamProfile,
  copyIsolatedFeedLink,
  copyExportLinkAgain,
  revokeExportToken,
  copiedExportId,
  initialCategory
}: SettingsModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategoryType>(initialCategory || 'video');
  const [mobileView, setMobileView] = useState<'categories' | 'detail'>('categories');

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
      if (isMobile) {
        setMobileView('detail');
      }
    }
  }, [initialCategory, isOpen, isMobile]);

  const [testAudioPlaying, setTestAudioPlaying] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState('en-US');
  const [reactionSounds, setReactionSounds] = useState(true);
  const [floatingReactions, setFloatingReactions] = useState(true);
  const [resolutionPreference, setResolutionPreference] = useState<'1080p' | '720p' | '360p'>('1080p');
  const [pushPrefs, setPushPrefs] = useState(() => getPushPreferences());
  const [notifPermission, setNotifPermission] = useState(() => getNotificationSupportStatus());
  const [testPushSent, setTestPushSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories: Array<{ id: SettingsCategoryType; label: string; icon: React.ComponentType<any> }> = [
    { id: 'video', label: 'Video', icon: VideoIcon },
    { id: 'audio', label: 'Audio', icon: Mic },
    { id: 'effects', label: 'Visual effects', icon: ImageIcon },
    { id: 'streaming', label: 'Streaming feed', icon: Radio },
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'captions', label: 'Captions', icon: MessageSquare },
    { id: 'reactions', label: 'Reactions', icon: Smile },
  ];

  // Options for custom dropdowns
  const micOptions: DropdownOption[] = audioDevices.map((d, i) => ({
    value: d.deviceId,
    label: d.label || `Microphone ${i + 1}`,
    icon: <Mic size={16} />
  }));

  const speakerOptions: DropdownOption[] = speakerDevices.map((d, i) => ({
    value: d.deviceId,
    label: d.label || `Speaker ${i + 1}`,
    icon: <Volume2 size={16} />
  }));

  const cameraOptions: DropdownOption[] = videoDevices.map((d, i) => ({
    value: d.deviceId,
    label: d.label || `Camera ${i + 1}`,
    icon: <VideoIcon size={16} />
  }));

  const videoEnhanceOptions: DropdownOption[] = [
    { value: 'auto', label: 'Auto (AI Dynamic)', sublabel: 'Auto-adjusts lighting, exposure & skin tones in real-time' },
    { value: 'studio', label: 'Studio lighting', sublabel: 'Enhanced exposure and natural warmth' },
    { value: 'lowlight', label: 'Low-light boost', sublabel: 'Increases brightness in dim environments' },
    { value: 'smooth', label: 'Skin smoothing', sublabel: 'Gentle portrait soften and balanced tone' },
    { value: 'sharp', label: 'Edge sharpness', sublabel: 'High-contrast edge definition' },
    { value: 'warm', label: 'Warm daylight', sublabel: 'Warm golden color balance' },
    { value: 'off', label: 'Off', sublabel: 'Original camera capture' }
  ];

  const resolutionOptions: DropdownOption[] = [
    { value: '1080p', label: 'High definition (1080p)', sublabel: 'Uses more data' },
    { value: '720p', label: 'Standard definition (720p)', sublabel: 'Balanced' },
    { value: '360p', label: 'Low definition (360p)', sublabel: 'Uses less data' }
  ];

  const languageOptions: DropdownOption[] = [
    { value: 'en-US', label: 'English (United States)', icon: <Globe size={16} /> },
    { value: 'en-GB', label: 'English (United Kingdom)', icon: <Globe size={16} /> },
    { value: 'es-ES', label: 'Spanish (Español)', icon: <Globe size={16} /> },
    { value: 'fr-FR', label: 'French (Français)', icon: <Globe size={16} /> },
    { value: 'de-DE', label: 'German (Deutsch)', icon: <Globe size={16} /> },
    { value: 'ja-JP', label: 'Japanese (日本語)', icon: <Globe size={16} /> },
    { value: 'pt-BR', label: 'Portuguese (Brasil)', icon: <Globe size={16} /> },
    { value: 'zh-CN', label: 'Chinese (Simplified)', icon: <Globe size={16} /> }
  ];

  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micTestVolume, setMicTestVolume] = useState(0); // 0 to 100
  const [micTestStatus, setMicTestStatus] = useState<string>('Ready to test');
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnimRef = useRef<number | null>(null);

  const stopMicTest = useCallback(() => {
    if (micAnimRef.current) {
      cancelAnimationFrame(micAnimRef.current);
      micAnimRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (micAudioCtxRef.current) {
      try { micAudioCtxRef.current.close(); } catch {}
      micAudioCtxRef.current = null;
    }
    setIsTestingMic(false);
    setMicTestVolume(0);
  }, []);

  const startMicTest = async () => {
    stopMicTest();
    try {
      setIsTestingMic(true);
      setMicTestStatus('Listening...');

      let stream: MediaStream;
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedAudioId && selectedAudioId !== 'default' 
            ? { deviceId: selectedAudioId } 
            : true
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        const liveTrack = localParticipant?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
        if (liveTrack && liveTrack.readyState === 'live') {
          const clonedTrack = liveTrack.clone();
          clonedTrack.enabled = true;
          stream = new MediaStream([clonedTrack]);
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }

      // Ensure all tracks in test stream are explicitly active
      stream.getAudioTracks().forEach(t => { t.enabled = true; });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      micAudioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const vol = Math.min(100, Math.round((rms / 128) * 100));
        setMicTestVolume(vol);

        if (vol > 15) {
          setMicTestStatus('Voice detected (Crisp audio signal)');
        } else if (vol > 3) {
          setMicTestStatus('Sound detected');
        } else {
          setMicTestStatus('Listening... speak into your microphone');
        }

        micAnimRef.current = requestAnimationFrame(loop);
      };

      loop();
    } catch (err: any) {
      console.warn("Mic test error:", err);
      setIsTestingMic(false);
      setMicTestStatus('Could not access selected microphone. Check permissions.');
    }
  };

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, [stopMicTest]);

  // If user changes microphone while test is running, re-test with new device
  useEffect(() => {
    if (isTestingMic) {
      startMicTest();
    }
  }, [selectedAudioId]);

  if (!isOpen) return null;

  const handleTestSpeaker = async () => {
    try {
      setTestAudioPlaying(true);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      if (selectedSpeakerId && (ctx as any).setSinkId) {
        try { await (ctx as any).setSinkId(selectedSpeakerId); } catch {}
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.68);
      setTimeout(() => {
        setTestAudioPlaying(false);
        try { ctx.close(); } catch {}
      }, 750);
    } catch {
      setTestAudioPlaying(false);
    }
  };

  const handleLobbyToggle = async () => {
    if (!isHost || !room) return;
    const next = !lobbyEnabled;
    setLobbyEnabled(next);
    try {
      await updateDoc(doc(db, 'rooms', room), { lobby: next });
    } catch (err) {
      console.error("Failed to update lobby setting:", err);
    }
  };

  const applyAIPreset = (preset: AIVideoPreset) => {
    if (!setAiVideoOptions) return;
    const cfg = AI_PRESET_CONFIGS[preset]?.config || AI_PRESET_CONFIGS.off.config;
    setAiVideoOptions({
      ...aiVideoOptions,
      ...cfg,
      preset
    } as AIVideoEnhanceOptions);
  };

  // Render settings content for a category
  const renderCategoryContent = (categoryId: SettingsCategoryType) => {
    switch (categoryId) {
      case 'video':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Camera Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#1f1f1f] block">
                  Camera
                </label>
                {onFlipCamera && (
                  <button
                    type="button"
                    onClick={onFlipCamera}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw size={13} />
                    <span>Flip camera</span>
                  </button>
                )}
              </div>
              <CustomDropdown
                options={cameraOptions.length > 0 ? cameraOptions : [{ value: 'default', label: 'Default Camera' }]}
                value={selectedVideoId || videoDevices[0]?.deviceId || 'default'}
                onChange={setSelectedVideoId}
                placeholder="Select camera"
              />
            </div>

            {/* Video Enhancement Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1f1f1f] block">
                Video enhancement
              </label>
              <CustomDropdown
                options={videoEnhanceOptions}
                value={aiVideoOptions?.preset || 'off'}
                onChange={(val) => applyAIPreset(val as AIVideoPreset)}
                placeholder="Video enhancement"
              />
            </div>

            {/* Video Preview */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1f1f1f] block">
                Preview
              </label>
              <div className="relative aspect-video w-full bg-[#1e1f20] rounded-xl overflow-hidden border border-[#e0e2ec] flex items-center justify-center">
                {localParticipant.isCameraEnabled ? (
                  <div 
                    className="w-full h-full"
                    style={{ filter: getAIVideoFilterStyle(aiVideoOptions) }}
                  >
                    <VideoTrack
                      trackRef={{
                        participant: localParticipant,
                        source: Track.Source.Camera,
                        publication: localParticipant.getTrackPublication(Track.Source.Camera),
                      } as any}
                      className={cn("w-full h-full object-cover", videoMirroring ? "scale-x-[-1]" : "")}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-[#8e918f] gap-2 p-6 text-center">
                    <VideoOff size={24} />
                    <span className="text-xs font-normal">Camera is off</span>
                  </div>
                )}
              </div>
            </div>

            {/* Mirror Video Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-[#e0e2ec]">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-medium text-[#1f1f1f] block">Mirror my video</span>
                <p className="text-xs text-[#444746]">Flips your self-view horizontally</p>
              </div>
              <MaterialSwitch
                checked={videoMirroring}
                onChange={() => setVideoMirroring(!videoMirroring)}
              />
            </div>

            {/* Send Resolution */}
            <div className="space-y-2 pt-2 border-t border-[#e0e2ec]">
              <label className="text-sm font-medium text-[#1f1f1f] block">Send resolution</label>
              <CustomDropdown
                options={resolutionOptions}
                value={resolutionPreference}
                onChange={(val) => setResolutionPreference(val as any)}
              />
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Microphone Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1f1f1f] block">
                Microphone
              </label>
              <CustomDropdown
                options={micOptions.length > 0 ? micOptions : [{ value: 'default', label: 'Default Microphone' }]}
                value={selectedAudioId || audioDevices[0]?.deviceId || 'default'}
                onChange={setSelectedAudioId}
                placeholder="Select microphone"
              />
            </div>

            {/* Live Microphone Testing Section */}
            <div className="p-3.5 bg-stone-50/80 rounded-2xl border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Mic size={14} className={isTestingMic ? "text-emerald-700" : "text-slate-500"} />
                    <span className="text-xs font-semibold text-slate-900 block truncate">Test Microphone</span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{micTestStatus}</p>
                </div>
                <button
                  type="button"
                  onClick={isTestingMic ? stopMicTest : startMicTest}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap shadow-xs border shrink-0",
                    isTestingMic
                      ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                      : "bg-white border-neutral-300 text-slate-800 hover:bg-stone-50"
                  )}
                >
                  {isTestingMic ? "Stop Test" : "Test Mic"}
                </button>
              </div>

              {/* Dynamic VU Meter Level Bar */}
              <div className="space-y-1">
                <div className="h-2 w-full bg-neutral-200/80 rounded-lg overflow-hidden p-0.5">
                  <div
                    className={cn(
                      "h-full rounded-md transition-all duration-75",
                      micTestVolume > 60 ? "bg-amber-500" : "bg-emerald-600"
                    )}
                    style={{ width: `${isTestingMic ? Math.max(3, micTestVolume) : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Mute</span>
                  <span>{isTestingMic ? `${micTestVolume}%` : 'Idle'}</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            {/* Noise Cancellation Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-[#e0e2ec]">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-medium text-[#1f1f1f] block">Noise cancellation</span>
                <p className="text-xs text-[#444746]">Filters out background sounds from your microphone</p>
              </div>
              <MaterialSwitch
                checked={noiseCancellation}
                onChange={() => setNoiseCancellation(!noiseCancellation)}
              />
            </div>

            {/* Echo Cancellation Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-[#e0e2ec]">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-medium text-[#1f1f1f] block">Echo cancellation</span>
                <p className="text-xs text-[#444746]">Reduces audio feedback</p>
              </div>
              <MaterialSwitch
                checked={echoCancellation}
                onChange={() => setEchoCancellation(!echoCancellation)}
              />
            </div>

            {/* Speaker Selection & Test */}
            <div className="space-y-2 pt-2 border-t border-[#e0e2ec]">
              <label className="text-sm font-medium text-[#1f1f1f] block">
                Speakers
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <CustomDropdown
                    options={speakerOptions.length > 0 ? speakerOptions : [{ value: 'default', label: 'Default Speaker' }]}
                    value={selectedSpeakerId || speakerDevices[0]?.deviceId || 'default'}
                    onChange={setSelectedSpeakerId}
                    placeholder="Select speaker"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTestSpeaker}
                  className="px-4 py-2.5 border border-neutral-300 hover:bg-neutral-50 text-slate-800 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  <Volume2 size={15} className={testAudioPlaying ? "text-emerald-700" : ""} />
                  <span>{testAudioPlaying ? "Playing..." : "Test Audio"}</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'effects':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Background Modes */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-[#1f1f1f] block">
                Virtual Background & Green Screen
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBg('none');
                    setCustomBgImage(null);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all cursor-pointer",
                    selectedBg === 'none' 
                      ? "bg-stone-100 border-slate-900 text-slate-900 font-medium shadow-xs" 
                      : "bg-white border-neutral-200 text-slate-700 hover:bg-stone-50"
                  )}
                >
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                    <X size={16} />
                  </div>
                  <span className="text-xs">None</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedBg('blur');
                    setCustomBgImage(null);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all cursor-pointer",
                    selectedBg === 'blur' 
                      ? "bg-stone-100 border-slate-900 text-slate-900 font-medium shadow-xs" 
                      : "bg-white border-neutral-200 text-slate-700 hover:bg-stone-50"
                  )}
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#94a3b8] to-[#cbd5e1] flex items-center justify-center blur-[1.5px] border border-white/40" />
                  <span className="text-xs">Blur</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedBg('greenscreen');
                    setSelectedBgImage('#00FF00');
                    setCustomBgImage(null);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all cursor-pointer",
                    selectedBg === 'greenscreen' || (selectedBg === 'color' && selectedBgImage === '#00FF00')
                      ? "bg-stone-100 border-slate-900 text-slate-900 font-medium shadow-xs" 
                      : "bg-white border-neutral-200 text-slate-700 hover:bg-stone-50"
                  )}
                >
                  <div className="w-8 h-8 rounded-xl bg-[#00FF00] flex items-center justify-center text-black font-medium shadow-inner border border-black/10">
                    <Sparkles size={14} className="text-emerald-950" />
                  </div>
                  <span className="text-xs">Green Screen</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all cursor-pointer",
                    selectedBg === 'image' && customBgImage 
                      ? "bg-stone-100 border-slate-900 text-slate-900 font-medium shadow-xs" 
                      : "bg-white border-neutral-200 text-slate-700 hover:bg-stone-50"
                  )}
                >
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                    <ImageIcon size={16} />
                  </div>
                  <span className="text-xs truncate max-w-[85px]">Custom Photo</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setCustomBgImage(url);
                        setSelectedBg('image');
                      }
                    }}
                  />
                </button>
              </div>
            </div>

            {/* Studio Green & Solid Chroma Backdrops */}
            <div className="space-y-3 pt-3 border-t border-neutral-200/60">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-900 block">
                  Studio Colors & Green Screens
                </label>
                <span className="text-[11px] text-slate-400">Stream and backdrop keying</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {SOLID_STUDIO_COLORS.map((item) => {
                  const isSelected = (selectedBg === item.type || selectedBg === 'color') && selectedBgImage === item.value && !customBgImage;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCustomBgImage(null);
                        setSelectedBgImage(item.value);
                        setSelectedBg(item.type);
                      }}
                      className={cn(
                        "relative flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer text-left group",
                        isSelected ? "border-slate-900 bg-stone-100 shadow-xs" : "border-neutral-200 bg-white hover:border-slate-400"
                      )}
                    >
                      <div 
                        className="w-7 h-7 rounded-lg shrink-0 shadow-xs border border-black/10 flex items-center justify-center"
                        style={{ backgroundColor: item.value }}
                      >
                        {isSelected && <Check size={12} className={item.value === '#F8FAFC' || item.value === '#00FF00' || item.value === '#00E676' ? "text-black" : "text-white"} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-slate-900 block truncate">{item.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preset Photo Backgrounds */}
            <div className="space-y-3 pt-3 border-t border-neutral-200/60">
              <label className="text-sm font-semibold text-slate-900 block">
                Virtual Scene Backgrounds
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {VIRTUAL_BG_PRESETS.map((img) => {
                  const isSelected = selectedBg === 'image' && selectedBgImage === img.value && !customBgImage;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => {
                        setCustomBgImage(null);
                        setSelectedBgImage(img.value);
                        setSelectedBg('image');
                      }}
                      className={cn(
                        "relative aspect-video rounded-xl overflow-hidden border transition-all cursor-pointer group shadow-xs",
                        isSelected ? "border-slate-900 ring-2 ring-slate-900/20" : "border-neutral-200 hover:border-slate-400"
                      )}
                    >
                      <img src={img.value} alt={img.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-2">
                        <span className="text-xs font-medium text-white truncate">{img.label}</span>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'streaming':
        return (
          <div className="space-y-6 max-w-xl">
            {/* High Performance Profile */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-medium text-[#1f1f1f] block">High-performance profile</span>
                <p className="text-xs text-[#444746]">Prioritizes higher frame rate (60 FPS) for streaming</p>
              </div>
              <MaterialSwitch
                checked={streamProfile === 'high'}
                onChange={() => setStreamProfile(streamProfile === 'high' ? 'standard' : 'high')}
              />
            </div>

            {/* Active Feed Exports */}
            <div className="space-y-3 pt-3 border-t border-neutral-200/70">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900">OBS Browser Source feeds</span>
                <button
                  type="button"
                  onClick={() => copyIsolatedFeedLink(localParticipant)}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
                >
                  + Export my feed link
                </button>
              </div>

              {feedExports.length === 0 ? (
                <div className="p-4 bg-stone-50 rounded-xl border border-neutral-200/70 text-center space-y-1">
                  <p className="text-xs text-slate-700">No exported feeds</p>
                  <p className="text-[11px] text-slate-500">
                    Export your camera stream or right-click any video tile in the call to generate a link for OBS.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                  {feedExports.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-xl border border-neutral-200/70 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-slate-900 truncate block">{item.participantName}</span>
                        <span className="text-[11px] text-slate-500 font-mono truncate block">{item.token}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyExportLinkAgain(item)}
                          className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200/70 text-slate-800 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          {copiedExportId === item.id ? <Check size={12} className="text-emerald-700" /> : <Copy size={12} />}
                          <span>{copiedExportId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => revokeExportToken(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Revoke Link"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'general':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Waiting Room */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-[#444746]" />
                  <span className="text-sm font-medium text-[#1f1f1f]">Waiting room</span>
                </div>
                <p className="text-xs text-[#444746]">
                  {isHost ? "Require host admission before participants can join" : "Controlled by meeting host"}
                </p>
              </div>
              <MaterialSwitch
                checked={lobbyEnabled}
                onChange={handleLobbyToggle}
                disabled={!isHost}
              />
            </div>

            {/* Show Clock */}
            <div className="flex items-center justify-between py-2 border-t border-[#e0e2ec]">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-[#444746]" />
                  <span className="text-sm font-medium text-[#1f1f1f]">Show clock</span>
                </div>
                <p className="text-xs text-[#444746]">Display current time on bottom toolbar</p>
              </div>
              <MaterialSwitch
                checked={showClock}
                onChange={() => setShowClock(!showClock)}
              />
            </div>

            {/* Browser Push Notifications */}
            <div className="space-y-3 py-3 border-t border-[#e0e2ec]">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-[#444746]" />
                    <span className="text-sm font-medium text-[#1f1f1f]">Push notifications</span>
                  </div>
                  <p className="text-xs text-[#444746]">
                    {notifPermission === 'granted'
                      ? 'Alert for waiting room requests and scheduled meetings'
                      : notifPermission === 'denied'
                        ? 'Blocked in browser site settings'
                        : notifPermission === 'unsupported'
                          ? 'Not supported on this browser'
                          : 'Allow desktop notifications from Forum'}
                  </p>
                </div>
                {notifPermission === 'granted' ? (
                  <MaterialSwitch
                    checked={pushPrefs.enabled}
                    onChange={() => {
                      const next = { ...pushPrefs, enabled: !pushPrefs.enabled };
                      setPushPrefs(next);
                      savePushPreferences(next);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={notifPermission === 'unsupported' || notifPermission === 'denied'}
                    onClick={async () => {
                      const res = await requestForumNotificationPermission();
                      setNotifPermission(res);
                      if (res === 'granted') {
                        const next = { ...pushPrefs, enabled: true };
                        setPushPrefs(next);
                        savePushPreferences(next);
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                  >
                    Enable
                  </button>
                )}
              </div>

              {notifPermission === 'granted' && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      await triggerForumPushNotification({
                        title: 'Forum Notifications Active',
                        body: 'You will receive alerts for waiting room visitors and meetings.',
                        url: window.location.pathname,
                        tag: `test-${Date.now()}`
                      });
                      setTestPushSent(true);
                      setTimeout(() => setTestPushSent(false), 2500);
                    }}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap"
                  >
                    {testPushSent ? 'Test notification sent' : 'Send test notification'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'captions':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Live Captions Toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-2">
                  <Subtitles size={16} className="text-[#444746]" />
                  <span className="text-sm font-medium text-[#1f1f1f]">Live captions</span>
                </div>
                <p className="text-xs text-[#444746]">Display real-time subtitles during call</p>
              </div>
              <MaterialSwitch
                checked={isCaptionsEnabled}
                onChange={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
              />
            </div>

            {/* Language Selector */}
            <div className="space-y-2 pt-2 border-t border-[#e0e2ec]">
              <label className="text-sm font-medium text-[#1f1f1f] block">
                Spoken language
              </label>
              <CustomDropdown
                options={languageOptions}
                value={captionLanguage}
                onChange={setCaptionLanguage}
              />
            </div>
          </div>
        );

      case 'reactions':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Floating Reactions */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-medium text-[#1f1f1f] block">Floating reactions</span>
                <p className="text-xs text-[#444746]">Show emojis sent by participants on screen</p>
              </div>
              <MaterialSwitch
                checked={floatingReactions}
                onChange={() => setFloatingReactions(!floatingReactions)}
              />
            </div>

            {/* Reaction Sounds */}
            <div className="flex items-center justify-between py-2 border-t border-[#e0e2ec]">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-medium text-[#1f1f1f] block">Reaction sounds</span>
                <p className="text-xs text-[#444746]">Play sounds when emojis are sent</p>
              </div>
              <MaterialSwitch
                checked={reactionSounds}
                onChange={() => setReactionSounds(!reactionSounds)}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-3xl h-[85vh] max-h-[620px] bg-white rounded-3xl shadow-xl border border-[#e0e2ec] flex flex-col overflow-hidden z-10">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e2ec] shrink-0">
          <div className="flex items-center gap-3">
            {isMobile && mobileView === 'detail' && (
              <button
                type="button"
                onClick={() => setMobileView('categories')}
                className="p-1 hover:bg-[#1f1f1f]/5 rounded-full text-[#444746] transition-colors cursor-pointer mr-1"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="text-lg font-medium text-[#1f1f1f]">
              {isMobile && mobileView === 'detail' 
                ? categories.find(c => c.id === selectedCategory)?.label 
                : "Settings"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[#1f1f1f]/5 active:bg-[#1f1f1f]/10 rounded-full text-[#444746] hover:text-[#1f1f1f] transition-colors cursor-pointer"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 min-h-0 bg-white">
          {/* Desktop Left Navigation */}
          <nav className="hidden md:flex flex-col w-60 border-r border-neutral-200/70 p-3.5 space-y-1.5 overflow-y-auto custom-scroll shrink-0 bg-stone-50/50">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer",
                    isActive 
                      ? "bg-slate-200/80 text-slate-900 font-medium border border-neutral-200/60" 
                      : "text-slate-600 hover:bg-neutral-100/70 hover:text-slate-900"
                  )}
                >
                  <Icon size={17} className={cn("shrink-0", isActive ? "text-slate-900" : "text-slate-500")} />
                  <span className="text-sm truncate">{cat.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 md:p-10 custom-scroll">
            {isMobile && mobileView === 'categories' ? (
              <div className="space-y-1.5">
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setMobileView('detail');
                      }}
                      className="w-full flex items-center justify-between p-4 hover:bg-stone-50 rounded-xl transition-colors text-left cursor-pointer border border-transparent hover:border-neutral-200/60"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <Icon size={18} className="text-slate-600 shrink-0" />
                        <span className="text-sm font-medium text-slate-900 truncate">{cat.label}</span>
                      </div>
                      <ChevronRight size={18} className="text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              renderCategoryContent(selectedCategory)
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-neutral-200/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
