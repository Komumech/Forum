import React, { useState, useRef } from 'react';
import { 
  X, 
  Mic, 
  Video as VideoIcon, 
  VideoOff, 
  Radio, 
  Settings as SettingsIcon, 
  MessageSquare, 
  Smile, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  Copy, 
  Check, 
  Trash2, 
  Volume2, 
  Monitor,
  Shield,
  Clock,
  Subtitles,
  Sliders,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VideoTrack } from '@livekit/components-react';
import { Track, Participant } from 'livekit-client';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import CustomDropdown, { DropdownOption } from './CustomDropdown';

export type SettingsCategoryType = 'audio' | 'video' | 'streaming' | 'general' | 'captions' | 'reactions' | 'effects';

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
  videoMirroring: boolean;
  setVideoMirroring: (val: boolean) => void;
  showClock: boolean;
  setShowClock: (val: boolean) => void;
  lobbyEnabled: boolean;
  setLobbyEnabled: (val: boolean) => void;
  isHost: boolean;
  room: string | undefined;
  isCaptionsEnabled: boolean;
  setIsCaptionsEnabled: (val: boolean) => void;
  selectedBg: 'none' | 'blur' | 'image';
  setSelectedBg: (val: 'none' | 'blur' | 'image') => void;
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
  activeFeedCount,
  feedExports,
  streamProfile,
  setStreamProfile,
  liveResolution,
  liveFps,
  liveBitrate,
  copyIsolatedFeedLink,
  copyExportLinkAgain,
  revokeExportToken,
  copiedExportId
}: SettingsModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategoryType>('audio');
  const [mobileView, setMobileView] = useState<'categories' | 'detail'>('categories');
  const [testAudioPlaying, setTestAudioPlaying] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState('en-US');
  const [reactionSounds, setReactionSounds] = useState(true);
  const [floatingReactions, setFloatingReactions] = useState(true);
  const [resolutionPreference, setResolutionPreference] = useState<'720p' | '1080p' | '360p'>('720p');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const categories: Array<{ id: SettingsCategoryType; label: string; icon: React.ComponentType<any>; description: string }> = [
    { id: 'audio', label: 'Audio', icon: Mic, description: 'Microphone, speaker & audio processing' },
    { id: 'video', label: 'Video', icon: VideoIcon, description: 'Camera, resolution & preview' },
    { id: 'streaming', label: 'Streaming Feed', icon: Radio, description: 'Isolated OBS feeds & stream output' },
    { id: 'general', label: 'General', icon: SettingsIcon, description: 'Waiting room, clock & call preferences' },
    { id: 'captions', label: 'Captions', icon: MessageSquare, description: 'Live subtitles & spoken language' },
    { id: 'reactions', label: 'Reactions', icon: Smile, description: 'Floating emojis & sound effects' },
    { id: 'effects', label: 'Effects', icon: Sparkles, description: 'Virtual backgrounds & blur' }
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

  const resolutionOptions: DropdownOption[] = [
    { value: '1080p', label: 'High Definition (1080p)', sublabel: 'Crisp video, requires higher bandwidth' },
    { value: '720p', label: 'Standard HD (720p)', sublabel: 'Balanced quality and performance' },
    { value: '360p', label: 'Standard (360p)', sublabel: 'Saves data and battery' }
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

  const handleTestSpeaker = () => {
    try {
      setTestAudioPlaying(true);
      const audio = new Audio('https://www.soundjay.com/buttons/beep-01a.mp3');
      if (selectedSpeakerId && (audio as any).setSinkId) {
        (audio as any).setSinkId(selectedSpeakerId).catch(() => {});
      }
      audio.play().catch(() => {});
      setTimeout(() => setTestAudioPlaying(false), 800);
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

  // Render settings content for a category
  const renderCategoryContent = (categoryId: SettingsCategoryType) => {
    switch (categoryId) {
      case 'audio':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Microphone Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Microphone
              </label>
              <CustomDropdown
                options={micOptions.length > 0 ? micOptions : [{ value: 'default', label: 'Default Microphone' }]}
                value={selectedAudioId || audioDevices[0]?.deviceId || 'default'}
                onChange={setSelectedAudioId}
                placeholder="Select Microphone"
              />
            </div>

            {/* Audio Enhancements */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-gray-800 block">Noise Cancellation</span>
                  <p className="text-xs text-gray-500 leading-relaxed">Filters background noise and keyboard clicks</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNoiseCancellation(!noiseCancellation)}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                    noiseCancellation ? "bg-[#1a73e8]" : "bg-gray-300"
                  )}
                >
                  <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", noiseCancellation ? "left-7" : "left-1")} />
                </button>
              </div>

              <div className="border-t border-gray-200/60 pt-3 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-gray-800 block">Echo Cancellation</span>
                  <p className="text-xs text-gray-500 leading-relaxed">Prevents feedback loop when not using headphones</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEchoCancellation(!echoCancellation)}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                    echoCancellation ? "bg-[#1a73e8]" : "bg-gray-300"
                  )}
                >
                  <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", echoCancellation ? "left-7" : "left-1")} />
                </button>
              </div>
            </div>

            {/* Speaker Selection & Test */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Speaker & Output
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <CustomDropdown
                    options={speakerOptions.length > 0 ? speakerOptions : [{ value: 'default', label: 'Default Speaker' }]}
                    value={selectedSpeakerId || speakerDevices[0]?.deviceId || 'default'}
                    onChange={setSelectedSpeakerId}
                    placeholder="Select Speaker"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTestSpeaker}
                  className="px-4 py-3 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-[#1a73e8] border border-gray-300/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  <Volume2 size={16} className={testAudioPlaying ? "animate-bounce text-[#1a73e8]" : ""} />
                  <span>{testAudioPlaying ? "Playing..." : "Test Audio"}</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Camera Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Camera Device
              </label>
              <CustomDropdown
                options={cameraOptions.length > 0 ? cameraOptions : [{ value: 'default', label: 'Default Camera' }]}
                value={selectedVideoId || videoDevices[0]?.deviceId || 'default'}
                onChange={setSelectedVideoId}
                placeholder="Select Camera"
              />
            </div>

            {/* Live Camera Preview */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Camera Preview
              </label>
              <div className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden border border-gray-200 shadow-xs flex items-center justify-center">
                {localParticipant.isCameraEnabled ? (
                  <VideoTrack
                    trackRef={{
                      participant: localParticipant,
                      source: Track.Source.Camera,
                      publication: localParticipant.getTrackPublication(Track.Source.Camera),
                    } as any}
                    className={cn("w-full h-full object-cover", videoMirroring ? "scale-x-[-1]" : "")}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-2 p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-slate-400">
                      <VideoOff size={24} />
                    </div>
                    <span className="text-xs font-medium text-slate-400">Camera is currently off</span>
                    <span className="text-[11px] text-slate-600">Turn on your camera in the call to preview</span>
                  </div>
                )}
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/75 rounded-full text-[10px] font-medium text-white flex items-center gap-1.5 border border-white/10 backdrop-blur-md">
                  <span className={cn("w-1.5 h-1.5 rounded-full", localParticipant.isCameraEnabled ? "bg-emerald-400" : "bg-gray-400")} />
                  <span>{localParticipant.isCameraEnabled ? "Live Camera" : "Inactive"}</span>
                </div>
              </div>
            </div>

            {/* Video Preferences */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-gray-800 block">Mirror My Video</span>
                  <p className="text-xs text-gray-500 leading-relaxed">Flips your self-view like a mirror</p>
                </div>
                <button
                  type="button"
                  onClick={() => setVideoMirroring(!videoMirroring)}
                  className={cn(
                    "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                    videoMirroring ? "bg-[#1a73e8]" : "bg-gray-300"
                  )}
                >
                  <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", videoMirroring ? "left-7" : "left-1")} />
                </button>
              </div>

              <div className="border-t border-gray-200/60 pt-3 space-y-2">
                <label className="text-xs font-semibold text-gray-700 block">Send Resolution</label>
                <CustomDropdown
                  options={resolutionOptions}
                  value={resolutionPreference}
                  onChange={(val) => setResolutionPreference(val as any)}
                />
              </div>
            </div>
          </div>
        );

      case 'streaming':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Status Header */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold text-gray-900">Streaming Feed Status</h4>
                <p className="text-xs text-gray-500">
                  {activeFeedCount > 0 
                    ? `${activeFeedCount} active isolated OBS feed source${activeFeedCount > 1 ? 's' : ''}` 
                    : 'No active isolated feeds currently exported'}
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium self-start sm:self-auto shrink-0 shadow-xs">
                <span className={cn("w-2 h-2 rounded-full", activeFeedCount > 0 ? "bg-emerald-500" : "bg-gray-400")} />
                <span className={cn(activeFeedCount > 0 ? "text-emerald-700 font-semibold" : "text-gray-600")}>
                  {activeFeedCount > 0 ? 'Active Feed' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Outbound Telemetry */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Outbound Statistics</h4>
                <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">WebRTC Encoded</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Resolution</span>
                  <span className="text-xs font-semibold text-gray-900 font-mono mt-1 block">{liveResolution}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Framerate</span>
                  <span className="text-xs font-semibold text-gray-900 font-mono mt-1 block">{liveFps} FPS</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Bitrate</span>
                  <span className="text-xs font-semibold text-gray-900 font-mono mt-1 block">{liveBitrate}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">OBS Latency</span>
                  <span className="text-xs font-semibold text-emerald-700 font-mono mt-1 block">&lt; 120ms</span>
                </div>
              </div>
            </div>

            {/* High Performance Profile */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-gray-800 block">High-Performance Profile</span>
                <p className="text-xs text-gray-500 leading-relaxed">Target 1080p@60fps for crisp video captures</p>
              </div>
              <button
                type="button"
                onClick={() => setStreamProfile(streamProfile === 'high' ? 'standard' : 'high')}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                  streamProfile === 'high' ? "bg-[#1a73e8]" : "bg-gray-300"
                )}
              >
                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", streamProfile === 'high' ? "left-7" : "left-1")} />
              </button>
            </div>

            {/* Active Feed Exports */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">OBS Isolated Links</h4>
                <button
                  type="button"
                  onClick={() => copyIsolatedFeedLink(localParticipant)}
                  className="text-xs font-semibold text-[#1a73e8] hover:underline cursor-pointer"
                >
                  + Export My Feed
                </button>
              </div>

              {feedExports.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center space-y-2">
                  <Radio className="mx-auto text-gray-400" size={24} />
                  <p className="text-xs font-semibold text-gray-800">No isolated feeds active</p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Export your camera stream or right click any tile to generate an isolated browser source link for OBS Studio.
                  </p>
                  <button
                    type="button"
                    onClick={() => copyIsolatedFeedLink(localParticipant)}
                    className="mt-2 px-4 py-2 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-gray-800 border border-gray-300/80 rounded-full text-xs font-medium transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                  >
                    <Radio size={14} className="text-[#1a73e8]" />
                    <span>Export Feed URL for OBS</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                  {feedExports.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-xl border border-gray-200/80 flex items-center justify-between gap-3 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#1a73e8] flex items-center justify-center font-bold text-xs shrink-0">
                          {item.participantName?.charAt(0).toUpperCase() || 'P'}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-gray-900 truncate block">{item.participantName}</span>
                          <span className="text-[11px] text-gray-400 font-mono truncate block">{item.token}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyExportLinkAgain(item)}
                          className="px-3 py-1.5 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-gray-700 border border-gray-300/60 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {copiedExportId === item.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                          <span>{copiedExportId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => revokeExportToken(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Revoke Token"
                        >
                          <Trash2 size={15} />
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
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-gray-700" />
                  <span className="text-sm font-semibold text-gray-900">Waiting Room (Lobby)</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {isHost ? "Require new participants to be admitted by host" : "Controlled by meeting host"}
                </p>
              </div>
              <button
                type="button"
                disabled={!isHost}
                onClick={handleLobbyToggle}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors shrink-0",
                  isHost ? "cursor-pointer" : "opacity-50 cursor-not-allowed",
                  lobbyEnabled ? "bg-[#1a73e8]" : "bg-gray-300"
                )}
              >
                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", lobbyEnabled ? "left-7" : "left-1")} />
              </button>
            </div>

            {/* Show Clock */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-700" />
                  <span className="text-sm font-semibold text-gray-900">Show Clock</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">Display current local time on the bottom toolbar</p>
              </div>
              <button
                type="button"
                onClick={() => setShowClock(!showClock)}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                  showClock ? "bg-[#1a73e8]" : "bg-gray-300"
                )}
              >
                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", showClock ? "left-7" : "left-1")} />
              </button>
            </div>
          </div>
        );

      case 'captions':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Live Captions Toggle */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Subtitles size={16} className="text-gray-700" />
                  <span className="text-sm font-semibold text-gray-900">Live Captions</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">Display real-time subtitles of speech during call</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                  isCaptionsEnabled ? "bg-[#1a73e8]" : "bg-gray-300"
                )}
              >
                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", isCaptionsEnabled ? "left-7" : "left-1")} />
              </button>
            </div>

            {/* Language Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Spoken Language
              </label>
              <CustomDropdown
                options={languageOptions}
                value={captionLanguage}
                onChange={setCaptionLanguage}
              />
            </div>

            <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 text-xs text-blue-800 leading-relaxed flex items-start gap-2.5">
              <MessageSquare size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <span>
                Real-time speech recognition runs directly on your device using Web Speech API for zero latency and privacy.
              </span>
            </div>
          </div>
        );

      case 'reactions':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Floating Reactions */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-gray-900 block">Floating Emoji Reactions</span>
                <p className="text-xs text-gray-500 leading-relaxed">Display animated emojis floating up the screen</p>
              </div>
              <button
                type="button"
                onClick={() => setFloatingReactions(!floatingReactions)}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                  floatingReactions ? "bg-[#1a73e8]" : "bg-gray-300"
                )}
              >
                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", floatingReactions ? "left-7" : "left-1")} />
              </button>
            </div>

            {/* Reaction Sounds */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-gray-900 block">Reaction Sounds</span>
                <p className="text-xs text-gray-500 leading-relaxed">Play subtle chimes when reactions are sent</p>
              </div>
              <button
                type="button"
                onClick={() => setReactionSounds(!reactionSounds)}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors cursor-pointer shrink-0",
                  reactionSounds ? "bg-[#1a73e8]" : "bg-gray-300"
                )}
              >
                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs", reactionSounds ? "left-7" : "left-1")} />
              </button>
            </div>

            {/* Reaction Quick Presets */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Quick Reactions Preview
              </label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200/80">
                {['💖', '👍', '🎉', '👏', '😂', '😮'].map((emoji) => (
                  <span key={emoji} className="text-2xl hover:scale-125 transition-transform cursor-default select-none">
                    {emoji}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );

      case 'effects':
        return (
          <div className="space-y-6 max-w-xl">
            {/* Background Modes */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Background Mode
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedBg('none')}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border transition-all cursor-pointer",
                    selectedBg === 'none' 
                      ? "bg-[#e8f0fe] border-[#1a73e8] text-[#1a73e8] font-semibold" 
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                    <X size={18} />
                  </div>
                  <span className="text-xs">None</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedBg('blur')}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border transition-all cursor-pointer",
                    selectedBg === 'blur' 
                      ? "bg-[#e8f0fe] border-[#1a73e8] text-[#1a73e8] font-semibold" 
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-300 to-gray-100 flex items-center justify-center blur-[1px]" />
                  <span className="text-xs">Blur</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#1a73e8]">
                    <Monitor size={18} />
                  </div>
                  <span className="text-xs">Upload</span>
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

            {/* Virtual Background Presets */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Virtual Background Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {bgImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      setSelectedBg('image');
                      setSelectedBgImage(img.url);
                      setCustomBgImage(null);
                    }}
                    className={cn(
                      "relative aspect-video rounded-xl overflow-hidden border-2 transition-all cursor-pointer",
                      selectedBg === 'image' && selectedBgImage === img.url && !customBgImage
                        ? "border-[#1a73e8] ring-2 ring-[#1a73e8]/30 shadow-md scale-102"
                        : "border-transparent hover:border-gray-300"
                    )}
                  >
                    <img src={img.url} alt={img.label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="settings-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-xs flex items-center justify-center md:p-6"
      >
        {/* Modal Window: Fullscreen on mobile/tablet, centered dialog on desktop */}
        <motion.div
          initial={{ scale: isMobile ? 1 : 0.96, opacity: 0, y: isMobile ? 20 : 0 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: isMobile ? 1 : 0.96, opacity: 0, y: isMobile ? 20 : 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            "bg-white flex flex-col overflow-hidden",
            isMobile 
              ? "fixed inset-0 w-full h-[100dvh] rounded-none z-[160]" 
              : "w-full max-w-3xl h-[620px] rounded-3xl shadow-2xl border border-gray-200"
          )}
        >
          {/* MOBILE VIEW HANDLING */}
          {isMobile ? (
            <div className="flex flex-col h-full w-full bg-white overflow-hidden">
              {mobileView === 'categories' ? (
                /* Mobile Category List View */
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Sticky Header - Always visible, never cropped */}
                  <div className="sticky top-0 z-30 px-5 py-4 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 shadow-xs">
                    <h2 className="text-lg font-bold text-gray-900">Settings</h2>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                      title="Close Settings"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  {/* Categories List */}
                  <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setMobileView('detail');
                        }}
                        className="w-full p-4 bg-white hover:bg-gray-50 active:bg-[#e8f0fe] rounded-2xl border border-gray-200/90 flex items-center justify-between gap-4 transition-all text-left shadow-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#f1f3f4] text-gray-800 flex items-center justify-center shrink-0 border border-gray-200/60">
                            <cat.icon size={20} />
                          </div>
                          <div className="min-w-0">
                            <span className="text-base font-semibold text-gray-900 block truncate">{cat.label}</span>
                            <span className="text-xs text-gray-500 block truncate">{cat.description}</span>
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-gray-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Mobile Detail Settings View */
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Sticky Detail Header with Back Button and Close Button */}
                  <div className="sticky top-0 z-30 px-4 py-3.5 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 shadow-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setMobileView('categories')}
                        className="p-2 -ml-1 hover:bg-gray-100 rounded-full text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                        title="Back to Settings"
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <h2 className="text-base font-bold text-gray-900 capitalize truncate">
                        {categories.find(c => c.id === selectedCategory)?.label || 'Settings'}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                      title="Close Settings"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  {/* Category Detail Content */}
                  <div className="flex-1 overflow-y-auto custom-scroll p-5 pb-12">
                    {renderCategoryContent(selectedCategory)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* DESKTOP VIEW HANDLING: Split Sidebar + Content */
            <div className="flex flex-col h-full w-full overflow-hidden">
              {/* Desktop Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 bg-white">
                <h2 className="text-lg font-bold text-gray-900">Settings</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  title="Close Settings"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-1 min-h-0 bg-white">
                {/* Left Navigation Sidebar */}
                <nav className="w-60 py-3 bg-[#f8f9fa] border-r border-gray-200 shrink-0 overflow-y-auto custom-scroll">
                  {categories.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={cn(
                          "w-full flex items-center gap-3.5 px-5 py-3 text-sm font-medium transition-all text-left cursor-pointer relative",
                          isSelected
                            ? "text-[#1a73e8] bg-[#e8f0fe] font-semibold"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                      >
                        <cat.icon size={18} className={cn(isSelected ? "text-[#1a73e8]" : "text-gray-500")} />
                        <span className="truncate">{cat.label}</span>
                        {isSelected && (
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-[#1a73e8]" />
                        )}
                      </button>
                    );
                  })}
                </nav>

                {/* Right Content Panel */}
                <div className="flex-1 overflow-y-auto custom-scroll p-7 bg-white">
                  {renderCategoryContent(selectedCategory)}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
