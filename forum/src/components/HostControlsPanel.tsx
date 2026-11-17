import React, { useState } from 'react';
import {
  Shield, Users, Radio, CircleDot, LayoutGrid, ChevronRight, ChevronLeft,
  Copy, Check, Key, Mic, VideoOff, VolumeX, MoreHorizontal, PhoneOff,
  Square, Pause, Play, Download, AlertCircle, Loader2, Layers
} from 'lucide-react';
import { cn } from '../lib/utils';
import CustomDropdown from './CustomDropdown';
import { SendErrorFeedbackButton } from './ErrorFeedbackModal';

export interface ParticipantItem {
  identity: string;
  name: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export interface LatestRecordingInfo {
  url: string;
  filename: string;
  durationSeconds: number;
  mode?: 'video' | 'audio';
}

type HostSection = 'home' | 'waiting' | 'security' | 'participants' | 'recording' | 'streaming';

interface HostControlsPanelProps {
  isHost: boolean;
  isCoHost: boolean;
  room: string;
  meetingTitle?: string;
  hostKey?: string;
  isLocked: boolean;
  allowUnmuteSelf: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  allowCoHostRecord: boolean;
  webinarMode: boolean;
  isStreaming: boolean;
  streamPlatform?: string;
  recordingStatus: 'idle' | 'recording' | 'paused';
  recordingSeconds?: number;
  latestRecording?: LatestRecordingInfo | null;
  coHosts: string[];
  panelists: string[];
  lobbyEnabled: boolean;
  pendingParticipants: Array<{ sid: string; identity: string }>;
  participants: ParticipantItem[];
  localIdentity: string;
  displayNames?: Record<string, string>;
  onToggleLock: (locked: boolean) => void;
  onToggleAllowUnmuteSelf: (allow: boolean) => void;
  onToggleAllowScreenShare: (allow: boolean) => void;
  onToggleAllowChat: (allow: boolean) => void;
  onToggleAllowCoHostRecord: (allow: boolean) => void;
  onToggleWebinarMode: (webinar: boolean) => void;
  onToggleLobby: (enabled: boolean) => void;
  onAdmitUser: (p: { sid: string; identity: string }) => void;
  onDeclineUser: (p: { sid: string; identity: string }) => void;
  onAdmitAllUsers: () => void;
  onMuteAll: () => void;
  onMuteParticipant: (identity: string) => void;
  onAskToUnmute: (identity: string) => void;
  onStopParticipantVideo: (identity: string) => void;
  onRenameParticipant: (identity: string, newName: string) => void;
  onRemoveParticipant: (identity: string) => void;
  onMakeCoHost: (identity: string) => void;
  onRemoveCoHost: (identity: string) => void;
  onPassHostRole: (identity: string, name: string) => void;
  onTogglePanelist: (identity: string) => void;
  onStartLiveStream: (platform: string, rtmpUrl: string, streamKey: string, layout: string) => Promise<void>;
  onStopLiveStream: () => Promise<void>;
  onStartRecording: (mode: 'video' | 'audio') => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
  onEndMeetingForAll: () => void;
  onOpenBreakoutRoomsTab: () => void;
  autoDownloadRecording?: boolean;
  onToggleAutoDownloadRecording?: (auto: boolean) => void;
  onOpenStageMediaTab?: () => void;
}

const STREAM_PRESETS: Record<string, string> = {
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
  facebook: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  rtmp: ''
};

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "w-10 h-5 rounded-full transition-colors relative inline-flex items-center shrink-0 cursor-pointer p-0.5 outline-none focus-visible:ring-1 focus-visible:ring-emerald-700/50",
        checked ? "bg-emerald-700" : "bg-neutral-300",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "w-4 h-4 rounded-full bg-white transition-transform shadow-xs block",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

export default function HostControlsPanel({
  isHost,
  isCoHost,
  room,
  meetingTitle,
  hostKey,
  isLocked,
  allowUnmuteSelf,
  allowScreenShare,
  allowChat,
  allowCoHostRecord,
  webinarMode,
  isStreaming,
  streamPlatform,
  recordingStatus,
  recordingSeconds = 0,
  latestRecording,
  coHosts = [],
  panelists = [],
  lobbyEnabled,
  pendingParticipants = [],
  participants = [],
  localIdentity,
  displayNames = {},
  onToggleLock,
  onToggleAllowUnmuteSelf,
  onToggleAllowScreenShare,
  onToggleAllowChat,
  onToggleAllowCoHostRecord,
  onToggleWebinarMode,
  onToggleLobby,
  onAdmitUser,
  onDeclineUser,
  onAdmitAllUsers,
  onMuteAll,
  onMuteParticipant,
  onAskToUnmute,
  onStopParticipantVideo,
  onRenameParticipant,
  onRemoveParticipant,
  onMakeCoHost,
  onRemoveCoHost,
  onPassHostRole,
  onTogglePanelist,
  onStartLiveStream,
  onStopLiveStream,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  onEndMeetingForAll,
  onOpenBreakoutRoomsTab,
  autoDownloadRecording = false,
  onToggleAutoDownloadRecording,
  onOpenStageMediaTab
}: HostControlsPanelProps) {
  const [section, setSection] = useState<HostSection>('home');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Streaming state
  const [targetPlatform, setTargetPlatform] = useState<'youtube' | 'facebook' | 'rtmp'>('youtube');
  const [streamLayout, setStreamLayout] = useState<'grid' | 'speaker' | 'single-speaker'>('grid');
  const [rtmpUrlInput, setRtmpUrlInput] = useState(STREAM_PRESETS.youtube);
  const [streamKeyInput, setStreamKeyInput] = useState('');
  const [isStreamBusy, setIsStreamBusy] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Recording & Playback state
  const [recordingMode, setRecordingMode] = useState<'video' | 'audio'>('video');
  const playbackVideoRef = React.useRef<HTMLVideoElement | null>(null);

  // Participant editing state
  const [openMenuIdentity, setOpenMenuIdentity] = useState<string | null>(null);
  const [renamingIdentity, setRenamingIdentity] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const seekRecordingBy = (deltaSeconds: number) => {
    const el = playbackVideoRef.current;
    if (!el) return;
    const maxDur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (latestRecording?.durationSeconds || 0);
    const nextTime = Math.max(0, Math.min(maxDur || el.currentTime + deltaSeconds, el.currentTime + deltaSeconds));
    el.currentTime = nextTime;
  };

  const canControlRecording = isHost || (isCoHost && allowCoHostRecord);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyHostKey = () => {
    if (!hostKey) return;
    navigator.clipboard.writeText(hostKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePlatformChange = (platform: string) => {
    const p = (platform as 'youtube' | 'facebook' | 'rtmp') || 'youtube';
    setTargetPlatform(p);
    setRtmpUrlInput(STREAM_PRESETS[p] ?? '');
    setStreamError(null);
  };

  const handleStartStreamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedUrl = rtmpUrlInput.trim();
    const cleanedKey = streamKeyInput.trim();
    if (!cleanedUrl || (targetPlatform !== 'rtmp' && !cleanedKey)) return;

    setStreamError(null);
    setIsStreamBusy(true);
    try {
      await onStartLiveStream(targetPlatform, cleanedUrl, cleanedKey, streamLayout);
      setStreamKeyInput('');
    } catch (err: any) {
      setStreamError(err?.message || 'Unable to start live stream. Check RTMP URL and stream key.');
    } finally {
      setIsStreamBusy(false);
    }
  };

  const handleStopStreamClick = async () => {
    setStreamError(null);
    setIsStreamBusy(true);
    try {
      await onStopLiveStream();
    } catch (err: any) {
      setStreamError(err?.message || 'Unable to stop live stream.');
    } finally {
      setIsStreamBusy(false);
    }
  };

  const commitRename = (identity: string) => {
    const cleaned = renameDraft.trim();
    if (cleaned) onRenameParticipant(identity, cleaned);
    setRenamingIdentity(null);
    setRenameDraft('');
  };

  const sectionTitles: Record<Exclude<HostSection, 'home'>, string> = {
    waiting: 'Waiting Room',
    security: 'Security & Access',
    participants: 'Participants',
    recording: 'Recording',
    streaming: 'Live Stream'
  };

  // Sub-view Header (Settings-style Back Navigation)
  if (section !== 'home') {
    return (
      <div className="space-y-5 text-slate-900">
        <div className="flex items-center gap-2 pb-3 border-b border-neutral-200/70">
          <button
            type="button"
            onClick={() => {
              setSection('home');
              setOpenMenuIdentity(null);
            }}
            className="p-1.5 -ml-1.5 hover:bg-stone-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="Back"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-slate-900">
            {sectionTitles[section]}
          </span>
        </div>

        {/* WAITING ROOM */}
        {section === 'waiting' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {pendingParticipants.length} {pendingParticipants.length === 1 ? 'person waiting' : 'people waiting'}
              </span>
              {pendingParticipants.length > 1 && (
                <button
                  type="button"
                  onClick={onAdmitAllUsers}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Admit all
                </button>
              )}
            </div>

            {pendingParticipants.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No one is waiting.</p>
            ) : (
              <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white overflow-hidden">
                {pendingParticipants.map(p => (
                  <div key={p.sid} className="flex items-center justify-between gap-2 px-3.5 py-3">
                    <span className="text-xs font-medium text-slate-800 truncate">
                      {p.identity.split('#')[0]}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDeclineUser(p)}
                        className="text-xs text-slate-500 hover:text-rose-700 font-medium px-2 py-1 cursor-pointer"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdmitUser(p)}
                        className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Admit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECURITY & ACCESS (Clean Settings-style Toggle Rows) */}
        {section === 'security' && (
          <div className="divide-y divide-neutral-200/60">
            <div className="flex items-center justify-between py-3.5 first:pt-0">
              <span className="text-sm text-slate-800">Lock meeting</span>
              <ToggleSwitch checked={isLocked} onChange={() => onToggleLock(!isLocked)} />
            </div>

            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-800">Waiting room</span>
              <ToggleSwitch checked={lobbyEnabled} onChange={() => onToggleLobby(!lobbyEnabled)} />
            </div>

            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-800">Allow self-unmute</span>
              <ToggleSwitch checked={allowUnmuteSelf} onChange={() => onToggleAllowUnmuteSelf(!allowUnmuteSelf)} />
            </div>

            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-800">Allow screen sharing</span>
              <ToggleSwitch checked={allowScreenShare} onChange={() => onToggleAllowScreenShare(!allowScreenShare)} />
            </div>

            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-800">Allow in-call chat</span>
              <ToggleSwitch checked={allowChat} onChange={() => onToggleAllowChat(!allowChat)} />
            </div>

            {isHost && (
              <div className="flex items-center justify-between py-3.5">
                <span className="text-sm text-slate-800">Webinar mode</span>
                <ToggleSwitch checked={webinarMode} onChange={() => onToggleWebinarMode(!webinarMode)} />
              </div>
            )}

            {isHost && (
              <div className="flex items-center justify-between py-3.5 last:pb-0">
                <span className="text-sm text-slate-800">Co-host recording</span>
                <ToggleSwitch checked={allowCoHostRecord} onChange={() => onToggleAllowCoHostRecord(!allowCoHostRecord)} />
              </div>
            )}
          </div>
        )}

        {/* PARTICIPANTS ROSTER */}
        {section === 'participants' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {participants.length} in call
              </span>
              <button
                type="button"
                onClick={onMuteAll}
                className="text-xs font-medium text-slate-700 hover:text-slate-900 px-3 py-1.5 bg-white hover:bg-stone-50 border border-neutral-200 rounded-lg cursor-pointer"
              >
                Mute all
              </button>
            </div>

            <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white">
              {participants.map(p => {
                const isSelf = p.identity === localIdentity;
                const resolvedName = displayNames[p.identity] || p.name || p.identity.split('#')[0];
                const isTargetCoHost = coHosts.includes(p.identity) || coHosts.includes(p.name);
                const isTargetPanelist = panelists.includes(p.identity) || panelists.includes(p.name);
                const isRenaming = renamingIdentity === p.identity;
                const isMenuOpen = openMenuIdentity === p.identity;

                return (
                  <div key={p.identity} className="px-3.5 py-2.5 space-y-2 relative">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename(p.identity);
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <input
                              type="text"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              autoFocus
                              className="flex-1 min-w-0 py-1 px-2 bg-stone-50 border border-neutral-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1 bg-emerald-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingIdentity(null)}
                              className="px-2 py-1 text-slate-500 text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-medium text-slate-900 truncate">
                              {resolvedName} {isSelf && '(You)'}
                            </span>
                            {isTargetCoHost && (
                              <span className="text-[11px] text-emerald-700 shrink-0">· Co-host</span>
                            )}
                            {webinarMode && isTargetPanelist && (
                              <span className="text-[11px] text-slate-500 shrink-0">· Panelist</span>
                            )}
                          </div>
                        )}
                      </div>

                      {!isSelf && !isRenaming && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => p.isMuted ? onAskToUnmute(p.identity) : onMuteParticipant(p.identity)}
                            title={p.isMuted ? 'Ask to unmute' : 'Mute'}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-stone-100 rounded-lg cursor-pointer"
                          >
                            {p.isMuted ? <Mic size={14} className="text-emerald-700" /> : <VolumeX size={14} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => onStopParticipantVideo(p.identity)}
                            title="Stop video"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-stone-100 rounded-lg cursor-pointer"
                          >
                            <VideoOff size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setOpenMenuIdentity(isMenuOpen ? null : p.identity)}
                            title="More actions"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-stone-100 rounded-lg cursor-pointer"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {isMenuOpen && !isSelf && (
                      <div className="pt-1 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingIdentity(p.identity);
                            setRenameDraft(resolvedName);
                            setOpenMenuIdentity(null);
                          }}
                          className="px-2.5 py-1 bg-stone-50 hover:bg-stone-100 border border-neutral-200 text-slate-700 text-[11px] font-medium rounded-lg cursor-pointer"
                        >
                          Rename
                        </button>

                        {webinarMode && (
                          <button
                            type="button"
                            onClick={() => {
                              onTogglePanelist(p.identity);
                              setOpenMenuIdentity(null);
                            }}
                            className="px-2.5 py-1 bg-stone-50 hover:bg-stone-100 border border-neutral-200 text-slate-700 text-[11px] font-medium rounded-lg cursor-pointer"
                          >
                            {isTargetPanelist ? 'Demote Attendee' : 'Make Panelist'}
                          </button>
                        )}

                        {isHost && (
                          <button
                            type="button"
                            onClick={() => {
                              isTargetCoHost ? onRemoveCoHost(p.identity) : onMakeCoHost(p.identity);
                              setOpenMenuIdentity(null);
                            }}
                            className="px-2.5 py-1 bg-stone-50 hover:bg-stone-100 border border-neutral-200 text-slate-700 text-[11px] font-medium rounded-lg cursor-pointer"
                          >
                            {isTargetCoHost ? 'Remove Co-host' : 'Make Co-host'}
                          </button>
                        )}

                        {isHost && (
                          <button
                            type="button"
                            onClick={() => {
                              onPassHostRole(p.identity, resolvedName);
                              setOpenMenuIdentity(null);
                            }}
                            className="px-2.5 py-1 bg-stone-50 hover:bg-stone-100 border border-neutral-200 text-slate-700 text-[11px] font-medium rounded-lg cursor-pointer"
                          >
                            Pass Host
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            onRemoveParticipant(p.identity);
                            setOpenMenuIdentity(null);
                          }}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 text-rose-700 text-[11px] font-medium rounded-lg cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RECORDING */}
        {section === 'recording' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-800">
                {recordingStatus === 'recording'
                  ? 'Recording active'
                  : recordingStatus === 'paused'
                    ? 'Recording paused'
                    : canControlRecording
                      ? 'Ready to record call'
                      : 'Restricted to host'}
              </span>
              {recordingStatus !== 'idle' && (
                <span className={cn(
                  "text-sm font-mono tabular-nums font-medium",
                  recordingStatus === 'recording' ? "text-rose-600" : "text-amber-700"
                )}>
                  {formatTimer(recordingSeconds)}
                </span>
              )}
            </div>

            {canControlRecording && (
              <div className="space-y-3">
                {recordingStatus === 'idle' ? (
                  <>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 rounded-xl border border-neutral-200/70">
                      <button
                        type="button"
                        onClick={() => setRecordingMode('video')}
                        className={cn(
                          "py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                          recordingMode === 'video'
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        Video + Audio
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordingMode('audio')}
                        className={cn(
                          "py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                          recordingMode === 'audio'
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        Audio Only
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onStartRecording(recordingMode)}
                      className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CircleDot size={14} />
                      <span>{recordingMode === 'audio' ? 'Start Audio Recording' : 'Start Recording'}</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={recordingStatus === 'recording' ? onPauseRecording : onResumeRecording}
                      className="flex-1 py-2.5 px-3 bg-white hover:bg-stone-50 text-slate-700 border border-neutral-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {recordingStatus === 'recording' ? <Pause size={13} /> : <Play size={13} />}
                      <span>{recordingStatus === 'recording' ? 'Pause' : 'Resume'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onStopRecording}
                      className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Square size={13} />
                      <span>Stop & Save</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {onToggleAutoDownloadRecording && (
              <div className="pt-4 border-t border-neutral-200/70 flex items-center justify-between gap-4">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-medium text-slate-900 block">Auto-download on leave or end</span>
                  <p className="text-[11px] text-slate-500">Save recording file automatically when ending call or closing tab</p>
                </div>
                <ToggleSwitch
                  checked={autoDownloadRecording}
                  onChange={() => onToggleAutoDownloadRecording(!autoDownloadRecording)}
                />
              </div>
            )}

            {latestRecording && recordingStatus === 'idle' && (
              <div className="pt-4 border-t border-neutral-200/70 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800">
                    {latestRecording.mode === 'audio' ? 'Last Audio Recording' : 'Last Recording'}
                  </span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {formatTimer(latestRecording.durationSeconds)}
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden border border-neutral-200/80 bg-[#131416] aspect-video">
                  <video
                    ref={playbackVideoRef}
                    src={latestRecording.url}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => seekRecordingBy(-10)}
                    className="px-3 py-2 bg-stone-100 hover:bg-stone-200/80 text-slate-700 rounded-xl text-xs font-medium cursor-pointer tabular-nums"
                  >
                    -10s
                  </button>
                  <button
                    type="button"
                    onClick={() => seekRecordingBy(10)}
                    className="px-3 py-2 bg-stone-100 hover:bg-stone-200/80 text-slate-700 rounded-xl text-xs font-medium cursor-pointer tabular-nums"
                  >
                    +10s
                  </button>
                  <a
                    href={latestRecording.url}
                    download={latestRecording.filename}
                    className="flex-1 py-2 px-3 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-800 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LIVE STREAM (Host Only — Wired to LiveKit RTMP Egress) */}
        {section === 'streaming' && isHost && (
          <div className="space-y-4">
            {streamError && (
              <div className="p-3 bg-rose-50 border border-rose-200/70 rounded-xl text-rose-700 text-xs flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{streamError}</span>
                </div>
                <SendErrorFeedbackButton errorMessage={streamError} source="Live Stream Controls" />
              </div>
            )}

            {isStreaming ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-900 font-medium">Broadcast active</span>
                  <span className="text-xs font-medium text-emerald-700 capitalize">
                    Live · {streamPlatform || 'RTMP'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isStreamBusy}
                  onClick={handleStopStreamClick}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isStreamBusy && <Loader2 size={14} className="animate-spin" />}
                  <span>{isStreamBusy ? 'Stopping...' : 'Stop Live Stream'}</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleStartStreamSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Platform
                  </label>
                  <CustomDropdown
                    compact
                    value={targetPlatform}
                    onChange={handlePlatformChange}
                    options={[
                      { value: 'youtube', label: 'YouTube Live' },
                      { value: 'facebook', label: 'Facebook Live' },
                      { value: 'rtmp', label: 'Custom RTMP' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Broadcast Layout
                  </label>
                  <CustomDropdown
                    compact
                    value={streamLayout}
                    onChange={(val) => setStreamLayout((val as 'grid' | 'speaker' | 'single-speaker') || 'grid')}
                    options={[
                      { value: 'grid', label: 'Grid · All Active Videos' },
                      { value: 'speaker', label: 'Speaker + Strip' },
                      { value: 'single-speaker', label: 'Single Speaker' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    RTMP Server URL
                  </label>
                  <input
                    type="text"
                    value={rtmpUrlInput}
                    onChange={(e) => setRtmpUrlInput(e.target.value)}
                    placeholder="rtmp://..."
                    className="w-full py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Stream Key {targetPlatform === 'rtmp' && '(optional if in URL)'}
                  </label>
                  <input
                    type="password"
                    value={streamKeyInput}
                    onChange={(e) => setStreamKeyInput(e.target.value)}
                    placeholder="Paste your stream key..."
                    className="w-full py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                    required={targetPlatform !== 'rtmp'}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isStreamBusy || !rtmpUrlInput.trim() || (targetPlatform !== 'rtmp' && !streamKeyInput.trim())}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-xl cursor-pointer disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  {isStreamBusy && <Loader2 size={14} className="animate-spin" />}
                  <span>{isStreamBusy ? 'Starting Stream...' : 'Go Live'}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  // HOME MENU VIEW (Clean, airy Settings-style categories)
  return (
    <div className="space-y-5 text-slate-900">
      {/* Compact Room Link & Host Key Row */}
      <div className="space-y-2.5 pb-4 border-b border-neutral-200/60">
        {meetingTitle && (
          <p className="text-sm font-medium text-slate-900 truncate">{meetingTitle}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex-1 py-2 px-3 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-700 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap truncate"
          >
            {copiedLink ? <Check size={13} className="text-emerald-700 shrink-0" /> : <Copy size={13} className="shrink-0" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </button>

          {hostKey && isHost && (
            <button
              type="button"
              onClick={handleCopyHostKey}
              title="Copy 6-digit Host Key"
              className="py-2 px-3 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-700 font-mono text-xs rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Key size={13} className="text-slate-500 shrink-0" />
              <span>{hostKey}</span>
              {copiedKey && <Check size={12} className="text-emerald-700 shrink-0" />}
            </button>
          )}
        </div>
      </div>

      {/* Category Navigation List */}
      <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white overflow-hidden">
        {pendingParticipants.length > 0 && (
          <button
            type="button"
            onClick={() => setSection('waiting')}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Users size={17} className="text-amber-600 shrink-0" />
              <span className="text-xs font-medium text-slate-900 truncate">Waiting Room</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-amber-700 tabular-nums">
                {pendingParticipants.length}
              </span>
              <ChevronRight size={15} className="text-slate-300" />
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => setSection('security')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Shield size={17} className="text-slate-500 shrink-0" />
            <span className="text-xs font-medium text-slate-800 truncate">Security & Access</span>
          </div>
          <ChevronRight size={15} className="text-slate-300 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setSection('participants')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Users size={17} className="text-slate-500 shrink-0" />
            <span className="text-xs font-medium text-slate-800 truncate">Manage Participants</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400 tabular-nums">{participants.length}</span>
            <ChevronRight size={15} className="text-slate-300" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSection('recording')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <CircleDot size={17} className={recordingStatus === 'recording' ? 'text-rose-600 shrink-0' : 'text-slate-500 shrink-0'} />
            <span className="text-xs font-medium text-slate-800 truncate">Recording</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {recordingStatus !== 'idle' && (
              <span className={cn(
                "text-[11px] font-medium",
                recordingStatus === 'recording' ? "text-rose-600" : "text-amber-700"
              )}>
                {recordingStatus === 'recording' ? 'Active' : 'Paused'}
              </span>
            )}
            <ChevronRight size={15} className="text-slate-300" />
          </div>
        </button>

        {isHost && (
          <button
            type="button"
            onClick={() => setSection('streaming')}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Radio size={17} className={isStreaming ? 'text-emerald-700 shrink-0' : 'text-slate-500 shrink-0'} />
              <span className="text-xs font-medium text-slate-800 truncate">Live Stream</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isStreaming && <span className="text-[11px] font-medium text-emerald-700">Live</span>}
              <ChevronRight size={15} className="text-slate-300" />
            </div>
          </button>
        )}

        {onOpenStageMediaTab && (
          <button
            type="button"
            onClick={onOpenStageMediaTab}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Layers size={17} className="text-slate-500 shrink-0" />
              <span className="text-xs font-medium text-slate-800 truncate">Media & Stage Templates</span>
            </div>
            <ChevronRight size={15} className="text-slate-300 shrink-0" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenBreakoutRoomsTab}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <LayoutGrid size={17} className="text-slate-500 shrink-0" />
            <span className="text-xs font-medium text-slate-800 truncate">Breakout Rooms</span>
          </div>
          <ChevronRight size={15} className="text-slate-300 shrink-0" />
        </button>
      </div>

      {/* End Meeting for Everyone (Host Only) */}
      {isHost && (
        <button
          type="button"
          onClick={onEndMeetingForAll}
          className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/70 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <PhoneOff size={14} />
          <span>End Meeting for Everyone</span>
        </button>
      )}
    </div>
  );
}
