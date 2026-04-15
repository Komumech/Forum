'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  LiveKitRoom, 
  useConnectionState,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  GridLayout,
  ParticipantTile,
  useChat,
  useRemoteParticipants,
  useDataChannel,
  TrackReference,
  TrackReferenceOrPlaceholder,
  MediaDeviceMenu,
  useParticipantInfo,
  useMaybeTrackRefContext,
  useIsSpeaking,
  ConnectionQualityIndicator,
  useVisualStableUpdate,
} from '@livekit/components-react';
import { isMobileBrowser } from '@livekit/components-core';
import '@livekit/components-styles';
import { Track, ConnectionState, DataPacket_Kind, Participant, RemoteParticipant, VideoPresets, ScreenSharePresets } from 'livekit-client';
import { useParams, useRouter } from 'next/navigation';
import { 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  PhoneOff, 
  Hand, 
  MonitorUp, 
  MonitorOff,
  MoreVertical, 
  Info, 
  Users, 
  MessageSquare,
  X,
  Send,
  ChevronDown,
  Settings,
  Copy,
  Check,
  Pin,
  PinOff,
  Layout as LayoutIcon,
  Maximize,
  ShieldCheck,
  UserX,
  VolumeX,
  Volume2,
  Bell,
  Monitor,
  ArrowLeftRight
} from 'lucide-react';

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const room = params.id as string;
  
  const [token, setToken] = useState("");
  const [name, setName] = useState(user?.displayName || "");
  const [isReady, setIsReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user]);

  // 1. Initial Camera Preview for "Green Room"
  useEffect(() => {
    if (!isReady) {
      if (!navigator.mediaDevices) return;
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        }).catch(err => {
          console.error("Camera access denied", err);
        });
    }
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [isReady]);

  // 2. Fetch Token once user clicks "Join"
  const handleJoin = async () => {
    if (!name) return;
    try {
      const metadata = JSON.stringify({ 
        pending: false, 
        avatar: user?.photoURL || "" 
      });

      // Stop preview stream before joining LiveKit to release camera lock
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;

      const uniqueIdentity = `${name}#${Math.floor(1000 + Math.random() * 9000)}`;
      const url = `/api/get-participant-token?room=${room}&username=${encodeURIComponent(uniqueIdentity)}&metadata=${encodeURIComponent(metadata)}`;
      
      const resp = await fetch(url);
      
      if (!resp.ok) {
        const errorText = await resp.text().catch(() => "Unknown error");
        throw new Error(`Token API failed (${resp.status}): ${errorText}`);
      }

      const data = await resp.json();
      if (!data.token) {
        throw new Error("No token returned from server");
      }

      setToken(data.token);
      setIsReady(true);
    } catch (e) {
      // Use e.message to avoid the "{}" serialization issue in logs
      console.error("Join Error:", e instanceof Error ? e.message : String(e));
      alert("Could not join the meeting. Please check your connection or room code.");
    }
  };

  // --- VIEW 1: PRE-JOIN (THE GREEN ROOM) ---
  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-6 font-sans">
        <style jsx global>{`
          /* Force all video feeds to maintain aspect ratio and letterbox (Google Meet style) */
          video {
            object-fit: cover !important;
            background-color: #202124 !important;
            width: 100% !important;
            height: 100% !important;
            border-radius: 16px !important;
            padding: 0 !important;
          }

          /* Global BG-less Sleek Scrollbars */
          html, body, .custom-scroll, * {
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
          }
          *::-webkit-scrollbar {
            width: 6px; 
            height: 6px; 
          }
          *::-webkit-scrollbar-track { 
            background: transparent !important; 
            box-shadow: none !important;
            border: none !important;
          }
          *::-webkit-scrollbar-thumb {
            background: #3c4043 !important;
            border: 1px solid #000;
            border-radius: 20px;
          }
          
          /* Ensure settings container specifically has no scrollbar bg */
          .custom-scroll {
            background-clip: padding-box;
          }
        `}</style>
        <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-12 bg-white p-8 md:p-12 rounded-[24px] shadow-sm border border-slate-100">
          
          <div className="flex-1 w-full relative aspect-video bg-[#202124] rounded-2xl overflow-hidden shadow-inner">
            <video ref={videoRef} autoPlay muted playsInline className="scale-x-[-1]" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
               <div className="p-4 rounded-full bg-black/80 backdrop-blur-md text-white border border-white/10 shadow-xl"><Mic size={24} /></div>
               <div className="p-4 rounded-full bg-black/80 backdrop-blur-md text-white border border-white/10 shadow-xl"><VideoIcon size={24} /></div>
            </div>
          </div>

          <div className="w-full lg:w-[380px] space-y-8 text-center lg:text-left">
            <div>
              <h1 className="text-[36px] font-normal text-[#1f1f1f] tracking-tight mb-2">Ready to join?</h1>
              <p className="text-[#5f6368] text-lg">No one else is here yet</p>
            </div>
            <div className="space-y-5">
              <input 
                type="text" 
                placeholder="Your name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 bg-[#f1f3f4] border-none rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-[16px] transition-all text-[#3c4043]"
              />
              <button 
                onClick={handleJoin}
                disabled={!name}
                className="w-full py-4 bg-[#1a73e8] text-white rounded-full font-medium text-[15px] hover:bg-[#185abc] active:scale-[0.98] transition-all disabled:bg-[#e8eaed] disabled:text-[#9aa0a6]"
              >
                Join meeting
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: LOADING STATE ---
  if (token === "") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#202124]">
        <div className="w-10 h-10 border-[3px] border-[#8ab4f8] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- VIEW 3: ACTUAL MEETING ROOM ---
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  
  if (!serverUrl) {
    console.error("CRITICAL: NEXT_PUBLIC_LIVEKIT_URL is not defined in environment variables.");
  }

  return (
    <main className="h-[100dvh] bg-[#202124] overflow-hidden flex flex-col font-sans">
<LiveKitRoom
  // Video Capture settings (Camera)
  video={{
    resolution: VideoPresets.h1080.resolution,
    frameRate: 30,
  }}
  audio={true}
  token={token}
  serverUrl={serverUrl}
  connect={true}
  data-lk-theme="default"
  style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
  onDisconnected={() => router.push('/')}
>
<MeetingRoomContent room={room} token={token} />
</LiveKitRoom>
    </main>
  );
}

function MeetingRoomContent({ room, token }: { room: string; token: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send: sendChat } = useChat();
  const connectionState = useConnectionState();
  const processorRef = useRef<any>(null);
  const { send: sendData } = useDataChannel("hand-raise");
  const rawTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'chat' | 'settings' | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatRecipient, setChatRecipient] = useState<string>("everyone");
  const [copied, setCopied] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isSwapped, setIsSwapped] = useState(false);

  // Google Meet Level Stability: Only update the array when major changes occur 
  // or use a visual stable update to prevent "Tile Flicker"
  const tracks = useVisualStableUpdate(rawTracks, 16);

  // --- SPATIAL ENGINE STATES ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [lastSpokenMap, setLastSpokenMap] = useState<Map<string, number>>(new Map());
  
  const isMobile = useMemo(() => typeof window !== 'undefined' && isMobileBrowser(), []);

  // Observe container size for Dynamic Grid Math
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContainerDimensions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Layout & Stacking States
  const [layoutMode, setLayoutMode] = useState<'auto' | 'tiled' | 'sidebar' | 'spotlight'>('auto');
  const [pinnedIdentities, setPinnedIdentities] = useState<Set<string>>(new Set());
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(16);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Advanced Settings States
  const VIRTUAL_BGS = [
    { id: 'none', label: 'None', url: '' },
    { id: 'blur', label: 'Blur', url: '' },
    { id: 'office', label: 'Office', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80' },
    { id: 'nature', label: 'Nature', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80' }
  ];
  const [settingsCategory, setSettingsCategory] = useState<'video' | 'audio' | 'general' | 'advanced' | 'effects'>('video');
  const [videoMirroring, setVideoMirroring] = useState(true);
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [showParticipantNames, setShowParticipantNames] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [showClock, setShowClock] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");
  const [selectedCam, setSelectedCam] = useState<string>("");

  const [inputLevel, setInputLevel] = useState(0);
  const [selectedResolution, setSelectedResolution] = useState<'360p' | '720p'>('720p');
  const [receiveResolution, setReceiveResolution] = useState<'360p' | '720p'>('720p');
  const [lowLightCorrection, setLowLightCorrection] = useState(true);
  const [reactionSounds, setReactionSounds] = useState(true);
  const [selectedBg, setSelectedBg] = useState('none');
  const [customBgs, setCustomBgs] = useState<{id: string, label: string, url: string}[]>([]);

  // Persistent Preferences: Load on Mount
  useEffect(() => {
    const saved = localStorage.getItem(`meeting_prefs_${user?.uid || 'guest'}`);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.layoutMode) setLayoutMode(p.layoutMode);
        if (p.hideNonVideo !== undefined) setHideNonVideo(p.hideNonVideo);
        if (p.maxParticipants) setMaxParticipants(p.maxParticipants);
        if (p.videoMirroring !== undefined) setVideoMirroring(p.videoMirroring);
        if (p.noiseCancellation !== undefined) setNoiseCancellation(p.noiseCancellation);
        if (p.echoCancellation !== undefined) setEchoCancellation(p.echoCancellation);
        if (p.showParticipantNames !== undefined) setShowParticipantNames(p.showParticipantNames);
        if (p.autoGainControl !== undefined) setAutoGainControl(p.autoGainControl);
        if (p.showClock !== undefined) setShowClock(p.showClock);
        if (p.selectedResolution) setSelectedResolution(p.selectedResolution);
        if (p.lowLightCorrection !== undefined) setLowLightCorrection(p.lowLightCorrection);
        if (p.reactionSounds !== undefined) setReactionSounds(p.reactionSounds);
        if (p.selectedBg) setSelectedBg(p.selectedBg);
        if (p.customBgs) setCustomBgs(p.customBgs);
      } catch (e) {
        console.error("Failed to load preferences", e);
      }
    }
  }, [user]);

  // Persistent Preferences: Save on Change
  useEffect(() => {
    const prefs = {
      layoutMode, hideNonVideo, maxParticipants, videoMirroring,
      noiseCancellation, echoCancellation, showParticipantNames,
      autoGainControl, showClock, selectedResolution,
      lowLightCorrection, reactionSounds, selectedBg, customBgs
    };
    localStorage.setItem(`meeting_prefs_${user?.uid || 'guest'}`, JSON.stringify(prefs));
  }, [
    layoutMode, hideNonVideo, maxParticipants, videoMirroring,
    noiseCancellation, echoCancellation, showParticipantNames,
    autoGainControl, showClock, selectedResolution,
    lowLightCorrection, reactionSounds, selectedBg, customBgs, user
  ]);

  const getMetadata = (p: Participant) => {
    try { return p.metadata ? JSON.parse(p.metadata) : {}; }
    catch { return {}; }
  };

  // Fetch available devices and monitor audio level for settings preview
  useEffect(() => {
    const getDevices = async () => {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setDevices(devs);
      
      // Auto-select current devices if not set
      if (!selectedMic) setSelectedMic(devs.find(d => d.kind === 'audioinput')?.deviceId || "");
      if (!selectedSpeaker) setSelectedSpeaker(devs.find(d => d.kind === 'audiooutput')?.deviceId || "");
      if (!selectedCam) setSelectedCam(devs.find(d => d.kind === 'videoinput')?.deviceId || "");
    };
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    
    let interval: NodeJS.Timeout;
    if (activeTab === 'settings') {
      interval = setInterval(() => {
        setInputLevel(localParticipant.audioLevel || 0);
      }, 100);
    }

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
      if (interval) clearInterval(interval);
    };
  }, [activeTab, localParticipant, selectedMic, selectedSpeaker, selectedCam]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const toggleHandRaise = () => {
    // Gracefully handle connection state to prevent "PC manager is closed"
    if (connectionState !== ConnectionState.Connected) {
      console.warn("Cannot raise hand: Not connected to room");
      return;
    }

    const newState = !isHandRaised;
    setIsHandRaised(newState);
    const encoder = new TextEncoder();
    try {
      sendData(encoder.encode(JSON.stringify({ type: 'hand-raise', raised: newState })), { reliable: true });
      setRaisedHands(prev => ({ ...prev, [localParticipant.identity]: newState }));
      
      // Play local sound for self
      if (newState && reactionSounds) {
        playReactionSound();
      }
    } catch (err) {
      console.error("Failed to send hand-raise data", err);
    }
  };

  // Play sound helper
  const playReactionSound = () => {
    const audio = new Audio('https://www.soundjay.com/buttons_c2026/sounds/button-10.mp3'); 
    audio.volume = 0.4;
    audio.play().catch(() => {});
  };

  // Watch for remote hand raises to play sound
  useEffect(() => {
    if (reactionSounds) {
      const activeHands = Object.values(raisedHands).filter(v => v).length;
      if (activeHands > 0) playReactionSound();
    }
  }, [raisedHands, reactionSounds]);

  // Handle Speaker Testing
  const handleTestSpeakers = async () => {
    const audio = new Audio('https://www.soundjay.com/buttons/beep-01a.mp3');
    try {
      if (selectedSpeaker && 'setSinkId' in audio) {
        await (audio as any).setSinkId(selectedSpeaker);
      }
      await audio.play();
    } catch (err) {
      console.error("Speaker test failed:", err);
    }
  };

  // Handle Background Upload
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const newBg = {
          id: `custom-${Date.now()}`,
          label: 'Custom Image',
          url: base64
        };
        setCustomBgs(prev => [newBg, ...prev].slice(0, 4));
      };
      reader.readAsDataURL(file);
    }
  };

  // Reactive Audio Constraints: Ensures Noise Suppression and AGC updates live
  useEffect(() => {
    if (localParticipant && connectionState === ConnectionState.Connected) {
      localParticipant.setMicrophoneEnabled(true, {
        noiseSuppression: noiseCancellation,
        echoCancellation: echoCancellation,
        autoGainControl: autoGainControl,
      });
    }
  }, [localParticipant, noiseCancellation, echoCancellation, autoGainControl, connectionState]);

  // Video Effects Logic (Background Blur & Virtual BGs)
  useEffect(() => {
    let isCurrent = true;

    const applyVideoProcessor = async () => {
      try {
        const track = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;

        // Safeguard 1: Ensure track exists and is enabled
        if (!track || !localParticipant.isCameraEnabled || !isCurrent) return;

        // Safeguard 2: Wait for dimensions to avoid "could not determine track dimensions"
        if (!track.dimensions || track.dimensions.width === 0) {
          // Retry in 200ms if dimensions aren't ready yet
          setTimeout(() => { if (isCurrent) applyVideoProcessor(); }, 200);
          return;
        }

        // Cleanup previous processor to prevent "Abort handler" conflicts
        if (processorRef.current) {
          await track.stopProcessor();
          processorRef.current = null;
        }

        if (selectedBg === 'none' || !isCurrent) return;

        if (selectedBg === 'blur') {
          const { BackgroundBlur } = await import('@livekit/track-processors');
          processorRef.current = BackgroundBlur(10);
          await track.setProcessor(processorRef.current);
        } else {
          const allBgs = [...VIRTUAL_BGS, ...customBgs];
          const bg = allBgs.find(b => b.id === selectedBg);
          if (bg?.url) {
            const { VirtualBackground } = await import('@livekit/track-processors');
            processorRef.current = VirtualBackground(bg.url);
            await track.setProcessor(processorRef.current);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Ignore Abort errors as they are expected during rapid switching
        if (!errorMessage.includes("Abort")) {
          console.error("Failed to apply video processor:", error);
          setSelectedBg('none');
        }
      }
    };

    applyVideoProcessor();
    return () => { isCurrent = false; };
  }, [selectedBg, localParticipant.isCameraEnabled, customBgs]);

  // Stabilize the host logic: The person who joined first is the host.
  const isHost = useMemo(() => {
    if (remoteParticipants.length === 0) return true;
    
    // Determine host by sorting all participants by join time + identity tie-breaker
    const all = [localParticipant, ...remoteParticipants];
    const sorted = [...all].sort((a, b) => {
      const tA = a.joinedAt?.getTime() || Number.MAX_SAFE_INTEGER;
      const tB = b.joinedAt?.getTime() || Number.MAX_SAFE_INTEGER;
      return tA - tB;
    });
    
    return sorted[0]?.identity === localParticipant.identity;
  }, [localParticipant, remoteParticipants]);

  const handleCopy = () => {
    navigator.clipboard.writeText(meetingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePin = (identity: string) => {
    setPinnedIdentities((prev) => {
      const next = new Set(prev);
      if (next.has(identity)) next.delete(identity);
      else if (next.size < 6) next.add(identity); // Limit to 6 pins
      return next;
    });
  };

  useEffect(() => {
    setMeetingUrl(window.location.href);
  }, []);

  // --- DYNAMIC REORDERING SYSTEM (The "Google Meet" Brain) ---
  const processedTracks = useMemo(() => {
    if (!tracks || tracks.length === 0) return [];

    const filtered = tracks.filter(t => {
      if (hideNonVideo && !t.participant?.isCameraEnabled && !t.participant?.isLocal) return false;
      return true;
    }).filter((t, i, self) => {
      const firstIndex = self.findIndex(prev => prev.participant.sid === t.participant.sid);
      return i === firstIndex;
    });

    return filtered.sort((a, b) => {
      const aId = a.participant?.identity || "";
      const bId = b.participant?.identity || "";
      
      // 1. Priority: Pinned
      const aPinned = pinnedIdentities.has(aId) ? 1 : 0;
      const bPinned = pinnedIdentities.has(bId) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      // 2. Priority: Screen Share
      const aScreen = a.source === Track.Source.ScreenShare ? 1 : 0;
      const bScreen = b.source === Track.Source.ScreenShare ? 1 : 0;
      if (aScreen !== bScreen) return bScreen - aScreen;

      // 3. Priority: Active Speaker
      const aSpeaking = a.participant.isSpeaking ? 1 : 0;
      const bSpeaking = b.participant.isSpeaking ? 1 : 0;
      if (aSpeaking !== bSpeaking) return bSpeaking - aSpeaking;

      // 4. Priority: Raised Hands
      const aHand = raisedHands[aId] ? 1 : 0;
      const bHand = raisedHands[bId] ? 1 : 0;
      if (aHand !== bHand) return bHand - aHand;

      // 5. Priority: Video ON vs Audio Only
      const aVideo = a.participant.isCameraEnabled ? 1 : 0;
      const bVideo = b.participant.isCameraEnabled ? 1 : 0;
      if (aVideo !== bVideo) return bVideo - aVideo;

      // Final stability: Local participant last, then alphabetical
      if (a.participant.isLocal !== b.participant.isLocal) return a.participant.isLocal ? 1 : -1;
      return aId.localeCompare(bId);
    }).slice(0, maxParticipants);
  }, [tracks, pinnedIdentities, hideNonVideo, maxParticipants, raisedHands]);
  
  // --- 3. DYNAMIC GRID MATHEMATICS ---
  const gridConfig = useMemo(() => {
    const count = processedTracks.length;
    if (count <= 1) return { cols: 1 };
    
    if (isMobile) {
      if (count === 2) return { cols: 1 };
      return { cols: 2 };
    }

    if (count <= 4) return { cols: 2 };
    if (count <= 9) return { cols: 3 };
    return { cols: 4 };
  }, [processedTracks, isMobile]);

  // Helper to determine if a track has active video
  const isVideoActive = (track?: TrackReferenceOrPlaceholder) => 
    track?.publication?.isEnabled && !track?.publication?.isMuted;

  // Compute layout based on layoutMode and participant state
  const computedLayout = useMemo(() => {
    const someoneIsSharing = processedTracks.some(t => t.source === Track.Source.ScreenShare);
    
    if (layoutMode === 'auto') {
      return (pinnedIdentities.size > 0 || someoneIsSharing) ? 'sidebar' : 'tiled';
    }
    return layoutMode;
  }, [layoutMode, pinnedIdentities, processedTracks]);

  // Derive focusTrack from pinned identities (first pinned participant's track)
  const focusTrack = useMemo(() => {
    if (pinnedIdentities.size === 0) return null;
    return processedTracks.find(t => pinnedIdentities.has(t.participant.identity)) || null;
  }, [processedTracks, pinnedIdentities]);

  // Calculate hidden count
  const hiddenCount = useMemo(() => {
    const visibleCount = computedLayout === 'sidebar' || computedLayout === 'spotlight' 
      ? (focusTrack ? 1 : 0) + (computedLayout === 'sidebar' ? processedTracks.filter(t => t.participant.sid !== focusTrack?.participant.sid).length : 0)
      : processedTracks.length;
    return Math.max(0, processedTracks.length - visibleCount);
  }, [computedLayout, focusTrack, processedTracks]);

  // Mobile 2-Participant View Logic
  const isMobileTwoPerson = isMobile && processedTracks.length === 2;
  const [mainTrack, floatingTrack] = useMemo(() => {
    if (!isMobileTwoPerson) return [null, null];
    return isSwapped ? [processedTracks[1], processedTracks[0]] : [processedTracks[0], processedTracks[1]];
  }, [isMobileTwoPerson, isSwapped, processedTracks]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#202124] relative">
      
      <style jsx global>{`
        /* 1. Make the Grid fill the screen */
        .lk-video-conference, 
        .lk-grid-layout {
          height: 100% !important;
          width: 100% !important;
          padding: 8px !important;
          gap: 8px !important;
          background: transparent !important;
        }

        /* 1. Force the Tile Container to be the boundary */
        .lk-participant-tile {
          background-color: transparent !important;
          border-radius: 16px !important;
          overflow: hidden !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: none !important; /* Remove default border */
          width: 100% !important;
          height: 100% !important;
        }

        /* 2. The Video Aspect Ratio Rule */
        .lk-participant-tile video {
          display: block !important;
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          background-color: #000 !important;
        }

        /* 3. Grid Item Sizing */
        .grid > div {
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Sidebar Layout Specifics */
        .sidebar-container {
          display: flex;
          flex-direction: row;
          width: 100%;
          height: 100%;
        }
        @media (max-width: 768px) {
          .sidebar-container {
            flex-direction: column;
          }
        }

        /* Voice Bar Animations */
        @keyframes voice-bar {
          0%, 100% { height: 3px; }
          50% { height: 12px; }
        }
        .animate-voice-bar-1 { animation: voice-bar 0.6s infinite ease-in-out; }
        .animate-voice-bar-2 { animation: voice-bar 0.6s infinite ease-in-out 0.2s; }
        .animate-voice-bar-3 { animation: voice-bar 0.6s infinite ease-in-out 0.4s; }

        @media (max-width: 768px) {
          .lk-participant-tile video {
            width: 100% !important;
            height: 100% !important;
          }
        }

        /* Hide default LiveKit labels */
        .lk-participant-name, .lk-focus-toggle-button, .lk-audio-visualizer, .lk-track-muted-indicator {
          display: none !important;
        }

        /* Google Meet Style Spotlight/Speaking Border */
        .lk-participant-tile[data-lk-speaking="true"] video {
           outline: 4px solid #8ab4f8 !important;
           outline-offset: -4px !important;
           border-radius: 16px !important;
        }
        
        .lk-participant-tile {
          transition: all 1s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        /* Device Menu Styling */
        .lk-device-menu {
          background: rgba(20, 21, 23, 0.95) !important;
          backdrop-filter: blur(24px) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 16px !important;
          padding: 8px !important;
          color: white !important;
          box-shadow: 0 20px 50px rgba(0,0,0,0.6) !important;
          z-index: 200 !important;
          width: 280px !important; /* Fixed width to prevent "too wide" menus */
          max-height: 400px !important;
          overflow-y: auto !important;
        }
        .lk-device-menu-item {
          padding: 10px 14px !important;
          border-radius: 8px !important;
          font-size: 13px !important;
          cursor: pointer !important;
          transition: background 0.2s !important;
        }
        .lk-device-menu-item:hover {
          background: rgba(255, 255, 255, 0.1) !important;
        }

        /* Device Menu Labels */
        .lk-device-menu h6 {
          color: #ffffff !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
          padding: 8px 14px !important;
          margin: 0 !important;
          letter-spacing: 0.05em !important;
        }

        .glass-panel {
          background: rgba(32, 33, 36, 0.86) !important;
          backdrop-filter: blur(24px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4) !important;
        }
      `}</style>

      <style jsx global>{`
        /* Specific fix for Settings Scrollbars */
        .custom-scroll::-webkit-scrollbar-track { background: transparent !important; }
      `}</style>

      <div className="flex-1 overflow-hidden relative bg-[#202124] transition-all duration-[700ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] flex flex-col"> 
        <div className="flex-1 relative flex flex-col overflow-hidden min-h-0">
            <div ref={containerRef} className="flex-1 flex items-center justify-center bg-[#202124] p-2 md:p-6 lg:p-8 pb-20 md:pb-28 overflow-hidden min-h-0">
              <div className={`w-full mx-auto h-full flex items-center justify-center overflow-hidden ${processedTracks.length <= 2 && !isMobile ? 'max-w-[1200px]' : 'max-w-[1600px]'}`}>
                {isMobileTwoPerson ? (
                  /* --- MOBILE 2-PARTICIPANT PIP VIEW --- */
                  <div className="relative w-full h-full flex items-center justify-center">
                    <div className="w-full h-full max-h-[85vh] aspect-[9/16] sm:aspect-video rounded-3xl overflow-hidden shadow-2xl">
                      <CustomParticipantTile 
                        trackRef={mainTrack} 
                        className="w-full h-full" 
                        raisedHands={raisedHands} 
                        onTogglePin={() => togglePin(mainTrack!.participant.identity)} 
                        isPinned={pinnedIdentities.has(mainTrack!.participant.identity)} 
                      />
                    </div>
                    
                    {/* Floating Tile */}
                    <div className="absolute top-4 right-4 w-[110px] h-[160px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 z-[100] bg-black">
                      <CustomParticipantTile 
                        trackRef={floatingTrack} 
                        className="w-full h-full" 
                        raisedHands={raisedHands}
                        showName={false}
                      />
                      <button 
                        onClick={() => setIsSwapped(!isSwapped)}
                        className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity z-[110]"
                      >
                        <div className="bg-white/20 backdrop-blur-md p-2 rounded-full text-white">
                          <ArrowLeftRight size={20} />
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (computedLayout === 'sidebar' || computedLayout === 'spotlight') && focusTrack ? (
                  <div className="sidebar-container gap-4 animate-in fade-in duration-1000 p-4">
                    {/* Main Spotlight Section */}
                    <div className="flex-1 flex items-center justify-center relative min-w-0 h-full">
                      <div className="w-full h-full max-w-full max-h-full aspect-video shadow-2xl rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                        <CustomParticipantTile trackRef={focusTrack} className="w-full h-full" raisedHands={raisedHands} onTogglePin={() => togglePin(focusTrack.participant.identity)} isPinned={pinnedIdentities.has(focusTrack.participant.identity)} />
                      </div>
                    </div>

                    {/* Vertical Sidebar (Only if NOT in Spotlight) */}
                    {computedLayout === 'sidebar' && (
                      <div className="w-[180px] sm:w-[220px] lg:w-[280px] h-full overflow-y-auto custom-scroll space-y-3 pr-2 flex flex-col shrink-0">
                        {processedTracks
                        .filter(t => t.participant.sid !== focusTrack.participant.sid)
                        .map(t => (
                          <div key={t.participant.identity} className="aspect-video w-full shrink-0 flex items-center justify-center">
                            <CustomParticipantTile 
                              trackRef={t} 
                              raisedHands={raisedHands} 
                              isPinned={pinnedIdentities.has(t.participant.identity)}
                              onTogglePin={() => togglePin(t.participant.identity)}
                              className="w-full h-full"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`w-full h-full flex items-center justify-center overflow-hidden ${!isMobile ? 'max-h-[88vh]' : ''}`}> 
                    <div className="flex flex-wrap gap-3 justify-center items-center w-full max-w-full max-h-full">
                      {processedTracks.map((t) => (
                        <div 
                          key={`${t.participant.sid}-${t.source}`} 
                          className="flex items-center justify-center transition-all duration-500"
                          style={{ 
                            /* Dynamically calculate width based on columns to keep tiles large and centered */
                            width: processedTracks.length === 1 ? '100%' : `calc(${100 / gridConfig.cols}% - 12px)`,
                            aspectRatio: isMobile && processedTracks.length === 2 ? 'auto' : '16/9',
                            maxHeight: isMobile && processedTracks.length === 2 ? '42%' : 'none'
                          }}
                        >
                          <CustomParticipantTile 
                            trackRef={t}
                            raisedHands={raisedHands}
                            isPinned={pinnedIdentities.has(t.participant.identity)}
                            mirror={t.participant.isLocal && videoMirroring}
                            showName={showParticipantNames}
                            onTogglePin={() => togglePin(t.participant.identity)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rule 6: Hidden Count Indicator (Mobile Collapse) */}
                {isMobile && hiddenCount > 0 && (
                  <div className="absolute bottom-24 left-1/2 -translate-x-1/2 glass-panel px-4 py-1.5 rounded-full text-white/70 text-[10px] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-bottom-2">
                    + {hiddenCount} other participants
                  </div>
                )}
              </div>
        
        {/* TOP BRANDING BAR (Floating) */}
        <div className="absolute top-4 left-6 z-50 pointer-events-auto flex items-center gap-3">
          <div className="flex items-center gap-2 glass-panel px-4 py-2.5 rounded-2xl">
            <div className="w-6 h-6 bg-indigo-500 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shadow-lg">F</div>
            <span className="text-white/90 text-sm font-semibold tracking-tight">Forum <span className="text-white/40 mx-1">|</span> {room}</span>
          </div>
          
          {/* Clock & Connection Quality moved here to clear the bottom-left */}
          <div className="hidden md:flex items-center gap-3 glass-panel px-4 py-2.5 rounded-2xl text-white/80 text-sm font-medium">
            {showClock && <span className="opacity-60">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            {showClock && <div className="w-[1px] h-3 bg-white/10" />}
            <ConnectionQualityIndicator participant={localParticipant} />
          </div>
        </div>

        {/* Connection State Overlay */}
        {connectionState === ConnectionState.Connecting && token !== "" && (
          <div className="absolute inset-0 bg-[#202124] z-[200] flex items-center justify-center animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-4 text-white">
              <div className="w-8 h-8 border-[2px] border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-xs font-medium tracking-widest uppercase opacity-50">Connecting...</p>
            </div>
          </div>
        )}

        {connectionState === ConnectionState.Reconnecting && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center animate-in fade-in duration-300">
            <div className="glass-panel p-8 rounded-3xl flex flex-col items-center gap-4 text-white">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium tracking-wide text-center">Network issue detected.<br/>Reconnecting...</p>
            </div>
          </div>
        )}

      </div>

        {/* RIGHT SIDEBAR PANEL (Overlay Style) */}
        {activeTab && (
          <aside
            key={activeTab} 
            /* Back to fixed overlay for all screens to prevent grid shifting */
            className="fixed inset-y-4 right-4 w-[calc(100%-32px)] sm:w-[380px] bg-white rounded-[28px] flex flex-col shadow-2xl z-[150] overflow-hidden animate-in fade-in slide-in-from-right-8 duration-[800ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          >
            <div className="flex items-center justify-between p-5 shrink-0 border-b border-slate-100">
              <h2 className="text-[18px] font-medium text-[#202124] capitalize">
                {activeTab === 'info' ? 'About this call' : activeTab}
              </h2>
              <button onClick={() => setActiveTab(null)} className="p-2 hover:bg-slate-100 rounded-full text-[#5f6368] transition-colors"><X size={20} /></button>
            </div>
            
            <div className="flex-1 px-5 overflow-y-auto pb-6 pt-4">
              {activeTab === 'info' && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-[12px] font-bold text-[#5f6368] uppercase tracking-wider">Joining info</p>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 break-all text-[14px] text-[#3c4043] leading-relaxed">
                      {meetingUrl}
                    </div>
                    <button 
                      onClick={handleCopy}
                      className="flex items-center gap-2 text-[#1a73e8] hover:bg-blue-50 px-4 py-2.5 rounded-full transition-all text-sm font-medium w-fit"
                    >
                      {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                      {copied ? 'Copied link' : 'Copy joining info'}
                    </button>
                  </div>
                </div>
              )}
              {activeTab === 'users' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-[12px] font-bold text-[#5f6368] uppercase tracking-wider">In call</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          {user?.photoURL ? (
                            <img src={user.photoURL} className="w-9 h-9 rounded-full object-cover bg-slate-100" />
                          ) : (
                            <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-[13px] font-bold">You</div>
                          )}
                          <span className="text-[14px] text-[#202124] font-medium">{localParticipant.identity} (You)</span>
                        </div>
                        {isHost && <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-bold text-blue-600 uppercase tracking-tight"><ShieldCheck size={12} /> Host</div>}
                      </div>
                      {remoteParticipants.map(p => {
                        const meta = getMetadata(p);
                        return (
                          <div key={p.identity} className="flex items-center justify-between group py-1">
                            <div className="flex items-center gap-3">
                              {meta.avatar ? (
                                <img src={meta.avatar} className="w-9 h-9 rounded-full object-cover bg-slate-100" />
                              ) : (
                                <div className="w-9 h-9 bg-blue-100 text-[#1a73e8] rounded-full flex items-center justify-center text-[13px] font-bold">{p.identity.charAt(0).toUpperCase()}</div>
                              )}
                              <span className="text-[14px] text-[#202124] font-medium">{p.identity}</span>
                            </div>
                            {isHost && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"><VolumeX size={16} /></button>
                                <button className="p-1.5 hover:bg-red-50 rounded-full text-red-500"><UserX size={16} /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'chat' && (
                <div className="flex flex-col h-full relative">
                  <div className="flex-1 space-y-4 mb-4 custom-scroll overflow-y-auto pr-2">
                    {chatMessages.length === 0 ? (
                       <p className="text-center text-[#5f6368] text-sm mt-10">Messages can only be seen by people in the call and are deleted when the call ends.</p>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div key={i} className="flex flex-col">
                          <span className="text-[11px] font-semibold text-[#5f6368] mb-1">
                            {msg.from?.identity === localParticipant.identity ? 'You' : msg.from?.identity}
                          </span>
                          <p className="text-[14px] text-[#202124] bg-[#f1f3f4] px-4 py-2.5 rounded-[16px] rounded-tl-sm inline-block max-w-[90%] leading-relaxed">{msg.message}</p>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat Controls and Input */}
                  <div className="mt-auto space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#5f6368] uppercase tracking-widest">To:</span>
                      <select 
                        value={chatRecipient}
                        onChange={(e) => setChatRecipient(e.target.value)}
                        className="text-[12px] bg-slate-100 border-none rounded-lg px-2 py-1 outline-none text-[#1a73e8] font-medium cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        <option value="everyone">Everyone</option>
                        {remoteParticipants.map(p => (
                          <option key={p.identity} value={p.identity}>{p.identity.split('#')[0]}</option>
                        ))}
                      </select>
                    </div>

                    <form 
                      onSubmit={(e) => { 
                        e.preventDefault(); 
                        if(chatInput.trim()){ 
                          sendChat(chatInput, { 
                            destinationIdentities: chatRecipient === "everyone" ? undefined : [chatRecipient] 
                          }); 
                          setChatInput(""); 
                        }
                      }}
                      className="flex gap-2 items-center bg-[#f1f3f4] rounded-full px-4 py-1.5"
                    >
                      <input 
                        type="text" 
                        placeholder={chatRecipient === 'everyone' ? "Send a message to everyone" : `Message ${chatRecipient.split('#')[0]}`} 
                        className="bg-transparent outline-none flex-1 text-[14px] text-[#202124] h-10 placeholder:text-[#5f6368]"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                      />
                      <button type="submit" disabled={!chatInput.trim()} className="text-[#1a73e8] p-2 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50"><Send size={18} /></button>
                    </form>
                  </div>
                </div>
              )}
              {activeTab === 'settings' && (
                <div className="flex flex-col h-full">
                  {/* Category Tabs */}
                  <div className="flex border-b border-slate-100 mb-6 shrink-0 overflow-x-auto no-scrollbar">
                    {(['video', 'audio', 'general', 'effects'] as const).map((cat, idx) => (
                      <button
                        key={cat}
                        onClick={() => setSettingsCategory(cat)}
                        className={`px-4 pb-3 text-[11px] font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                          settingsCategory === cat 
                            ? 'border-[#1a73e8] text-[#1a73e8]' 
                            : 'border-transparent text-[#5f6368] hover:text-[#202124]'
                        }`}
                      >
                        {cat === 'effects' ? 'Visual Effects' : cat}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 custom-scroll space-y-10 pb-8">
                    {settingsCategory === 'video' && (
                      <div className="space-y-10">
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-black uppercase tracking-widest">Camera Source</label>
                          <select 
                            value={selectedCam}
                            onChange={(e) => {
                              const id = e.target.value;
                              setSelectedCam(id);
                              localParticipant.setCameraEnabled(true, { deviceId: id });
                            }}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-black font-medium"
                          >
                            {devices.filter(d => d.kind === 'videoinput').map(d => (
                              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-3">
                          <label className="text-[11px] font-bold text-black uppercase tracking-widest">Send Resolution (HD)</label>
                          <div className="flex gap-2">
                            {(['360p', '720p'] as const).map(res => (
                              <button
                                key={res}
                                onClick={() => setSelectedResolution(res)}
                                className={`flex-1 py-2 rounded-lg border text-[13px] font-medium transition-all ${
                                  selectedResolution === res ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {res === '720p' ? 'High Definition (720p)' : 'Standard (360p)'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4 pt-2 border-t border-slate-100 pt-6">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <span className="text-sm font-bold text-black">Mirror my video</span>
                              <p className="text-[11px] text-slate-600">Horizontally flip your self-view</p>
                            </div>
                            <button onClick={() => setVideoMirroring(!videoMirroring)} className={`w-10 h-5 rounded-full transition-colors relative ${videoMirroring ? 'bg-[#1a73e8]' : 'bg-slate-300'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${videoMirroring ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <span className="text-sm font-bold text-black">Adjust for low light</span>
                              <p className="text-[11px] text-slate-600">Automatically brighten your video</p>
                            </div>
                            <button onClick={() => setLowLightCorrection(!lowLightCorrection)} className={`w-10 h-5 rounded-full transition-colors relative ${lowLightCorrection ? 'bg-[#1a73e8]' : 'bg-slate-300'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${lowLightCorrection ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsCategory === 'audio' && (
                      <div className="space-y-10">
                        <div className="space-y-4">
                          <label className="text-[11px] font-bold text-black uppercase tracking-widest">Microphone</label>
                          <select 
                            value={selectedMic}
                            onChange={(e) => {
                              const id = e.target.value;
                              setSelectedMic(id);
                              localParticipant.setMicrophoneEnabled(true, { deviceId: id });
                            }}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none text-black !text-black font-medium"
                          >
                            {devices.filter(d => d.kind === 'audioinput').map(d => (
                              <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,5)}`}</option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2 mt-3 px-1">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex gap-[2px]">
                              {[...Array(15)].map((_, i) => (
                                <div key={i} className={`flex-1 h-full transition-colors ${inputLevel > (i / 15) ? (i > 11 ? 'bg-red-400' : 'bg-blue-500') : 'bg-slate-200'}`} />
                              ))}
                            </div>
                            <Mic size={14} className={inputLevel > 0.05 ? "text-blue-500" : "text-slate-400"} />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-[11px] font-bold text-black uppercase tracking-widest">Speaker</label>
                            <select 
                              value={selectedSpeaker}
                              onChange={(e) => setSelectedSpeaker(e.target.value)}
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none text-black !text-black font-medium"
                            >
                              {devices.filter(d => d.kind === 'audiooutput').map(d => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0,5)}`}</option>
                              ))}
                            </select>
                          </div>
                          <button 
                            onClick={handleTestSpeakers}
                            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-[11px] font-bold text-slate-700 transition-colors uppercase border border-slate-200"
                          >
                            Test Speakers
                          </button>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <span className="text-sm font-bold text-black">Noise suppression</span>
                              <p className="text-[11px] text-slate-600">Filter background noise</p>
                            </div>
                            <button onClick={() => setNoiseCancellation(!noiseCancellation)} className={`w-10 h-5 rounded-full transition-colors relative ${noiseCancellation ? 'bg-[#1a73e8]' : 'bg-slate-300'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${noiseCancellation ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsCategory === 'general' && (
                      <div className="space-y-10">
                        <div className="space-y-4">
                          <label className="text-[11px] font-bold text-black uppercase tracking-widest">Layout Preference</label>
                          <div className="grid grid-cols-2 gap-3">
                            {['auto', 'tiled', 'sidebar', 'spotlight'].map((type) => (
                              <button
                                key={type}
                                onClick={() => setLayoutMode(type as any)}
                                className={`p-4 rounded-xl border text-[13px] font-medium transition-all flex flex-col items-center gap-2 ${layoutMode === type ? 'border-[#1a73e8] bg-blue-50 text-[#1a73e8]' : 'border-slate-200 text-[#5f6368] hover:bg-slate-50'}`}
                              >
                                <LayoutIcon size={20} />
                                <span className="capitalize">{type}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[11px] font-bold text-black uppercase tracking-widest">Maximum Tiles ({maxParticipants})</label>
                          <input 
                            type="range" min="6" max="49" value={maxParticipants}
                            onChange={(e) => setMaxParticipants(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                          />
                        </div>

                        <div className="space-y-4 pt-2 border-t border-slate-100 pt-6">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-black">Hide non-video participants</span>
                            <button onClick={() => setHideNonVideo(!hideNonVideo)} className={`w-10 h-5 rounded-full transition-colors relative ${hideNonVideo ? 'bg-[#1a73e8]' : 'bg-slate-300'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${hideNonVideo ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-black">Show meeting clock</span>
                            <button onClick={() => setShowClock(!showClock)} className={`w-10 h-5 rounded-full transition-colors relative ${showClock ? 'bg-[#1a73e8]' : 'bg-slate-300'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showClock ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsCategory === 'effects' && (
                      <div className="space-y-10">
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-black uppercase tracking-widest">Visual Effects</label>
                            <label className="cursor-pointer bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition-colors uppercase">
                              Upload Image
                              <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
                            </label>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            {customBgs.map((bg) => (
                              <button key={bg.id} onClick={() => setSelectedBg(bg.id)} className={`relative aspect-video rounded-xl border-2 overflow-hidden transition-all ${selectedBg === bg.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-100'}`}>
                                <img src={bg.url} className="w-full h-full object-cover" alt="Custom" />
                              </button>
                            ))}
                            {VIRTUAL_BGS.map((bg) => (
                              <button
                                key={bg.id}
                                onClick={() => setSelectedBg(bg.id)}
                                className={`relative aspect-video rounded-xl border-2 transition-all overflow-hidden group ${
                                  selectedBg === bg.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-100'
                                }`}
                              >
                                {bg.url ? (
                                  <img src={bg.url} className="w-full h-full object-cover" alt={bg.label} />
                                ) : (
                                  <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                                    {bg.id === 'blur' ? <Monitor size={20} /> : <X size={20} />}
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                <span className="absolute bottom-1 left-2 text-[10px] font-bold text-white drop-shadow-md">{bg.label}</span>
                              </button>
                            ))}
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <span className="text-sm font-bold text-black">Reaction sounds</span>
                              <p className="text-[11px] text-slate-600">Audible pings for hand raises and emojis</p>
                            </div>
                            <button onClick={() => setReactionSounds(!reactionSounds)} className={`w-10 h-5 rounded-full transition-colors relative ${reactionSounds ? 'bg-[#1a73e8]' : 'bg-slate-300'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${reactionSounds ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

      {/* FLOATING TASKBAR UI */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center px-6 z-[120] pointer-events-none">
        
        {/* MOBILE MORE MENU */}
        {isMoreMenuOpen && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[280px] glass-panel rounded-3xl p-2 flex flex-col gap-1 pointer-events-auto sm:hidden animate-in slide-in-from-bottom-4 duration-300">
            <button 
              onClick={() => { setActiveTab('info'); setIsMoreMenuOpen(false); }}
              className="flex items-center gap-3 w-full p-4 rounded-2xl text-white hover:bg-white/10 transition-colors"
            >
              <Info size={20} /> <span className="text-sm font-medium">Meeting info</span>
            </button>
            <button 
              onClick={() => { setActiveTab('users'); setIsMoreMenuOpen(false); }}
              className="flex items-center gap-3 w-full p-4 rounded-2xl text-white hover:bg-white/10 transition-colors"
            >
              <Users size={20} /> <span className="text-sm font-medium">Participants</span>
            </button>
            <button 
              onClick={() => { setActiveTab('chat'); setIsMoreMenuOpen(false); }}
              className="flex items-center gap-3 w-full p-4 rounded-2xl text-white hover:bg-white/10 transition-colors"
            >
              <MessageSquare size={20} /> <span className="text-sm font-medium">In-call messages</span>
            </button>
            <button 
              onClick={() => { 
                localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled, {
                  resolution: ScreenSharePresets.h1080fps30.resolution,
                });
                setIsMoreMenuOpen(false);
              }}
              className={`flex items-center gap-3 w-full p-4 rounded-2xl transition-colors ${localParticipant.isScreenShareEnabled ? 'text-blue-400' : 'text-white'}`}
            >
              {localParticipant.isScreenShareEnabled ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
              <span className="text-sm font-medium">{localParticipant.isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}</span>
            </button>
            <div className="h-[1px] bg-white/10 my-1" />
            <button 
              onClick={() => { setActiveTab('settings'); setIsMoreMenuOpen(false); }}
              className="flex items-center gap-3 w-full p-4 rounded-2xl text-white hover:bg-white/10 transition-colors"
            >
              <Settings size={20} /> <span className="text-sm font-medium">Settings</span>
            </button>
          </div>
        )}


        {/* Center: Main Taskbar */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 sm:gap-2 glass-panel p-1.5 rounded-[22px] pointer-events-auto max-w-[95vw]">
            <div className="flex items-center">
              <button 
                onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
                className={`p-2 sm:p-2.5 rounded-xl transition-all ${!localParticipant.isMicrophoneEnabled ? 'bg-[#ea4335] text-white shadow-lg shadow-red-500/20' : 'text-white hover:bg-white/10'}`}
              >
                {localParticipant.isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <MediaDeviceMenu
                kind="audioinput" 
                className="p-1 text-white/70 hover:text-white transition-colors hidden sm:block"
              >
                <ChevronDown size={14} />
              </MediaDeviceMenu>
            </div>
            
            <div className="w-[1px] h-6 bg-white/10 mx-1" />

            <div className="flex items-center">
              <button 
                onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
                className={`p-2 sm:p-2.5 rounded-xl transition-all ${!localParticipant.isCameraEnabled ? 'bg-[#ea4335] text-white shadow-lg shadow-red-500/20' : 'text-white hover:bg-white/10'}`}
              >
                {localParticipant.isCameraEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
              </button>
              <MediaDeviceMenu
                kind="videoinput" 
                className="p-1 text-white/70 hover:text-white transition-colors hidden sm:block"
              >
                <ChevronDown size={14} />
              </MediaDeviceMenu>
            </div>

            <div className="w-[1px] h-6 bg-white/10 mx-1" />

            <button 
              onClick={toggleHandRaise}
              className={`p-2 sm:p-2.5 rounded-xl transition-all ${isHandRaised ? 'bg-[#fbbc04] text-[#202124] shadow-lg shadow-yellow-500/20' : 'text-white hover:bg-white/10'}`}
            >
              <Hand size={20} />
            </button>

            <button 
              onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled, {
                resolution: ScreenSharePresets.h1080fps30.resolution,
              })}
              className={`p-2.5 rounded-xl transition-all hidden sm:flex ${localParticipant.isScreenShareEnabled ? 'bg-[#8ab4f8] text-[#202124] shadow-lg' : 'text-white hover:bg-white/10'}`}
            >
              {localParticipant.isScreenShareEnabled ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
            </button>

            <div className="w-[1px] h-6 bg-white/10 mx-1 hidden sm:block" />

            {/* Combined Tab Buttons (Info, Users, Chat) */}
            <div className="hidden sm:flex items-center gap-1">
              <button 
                onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')}
                className={`p-2.5 rounded-xl transition-all ${activeTab === 'info' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
              >
                <Info size={20} />
              </button>

              <button 
                onClick={() => setActiveTab(activeTab === 'users' ? null : 'users')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all ${activeTab === 'users' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
              >
                <div className="flex -space-x-2">
                  {[localParticipant, ...remoteParticipants].slice(0, 3).map((p, i) => {
                    const meta = getMetadata(p);
                    return (
                      <div 
                        key={p.sid || p.identity} 
                        className="w-5 h-5 rounded-full border border-[#202124] bg-indigo-500 overflow-hidden text-[8px] flex items-center justify-center font-bold"
                        style={{ zIndex: 3 - i }}
                      >
                        {meta.avatar ? <img src={meta.avatar} className="w-full h-full object-cover" /> : p.identity.charAt(0).toUpperCase()}
                      </div>
                    );
                  })}
                </div>
                <span className="text-xs font-medium">{[localParticipant, ...remoteParticipants].length}</span>
              </button>

              <button 
                onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')}
                className={`p-2.5 rounded-xl transition-all ${activeTab === 'chat' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
              >
                <MessageSquare size={20} />
              </button>
            </div>

            <div className="w-[1px] h-6 bg-white/10 mx-1 hidden sm:block" />

            <button 
              onClick={() => { if(typeof window !== 'undefined' && window.innerWidth < 640) setIsMoreMenuOpen(!isMoreMenuOpen); else setActiveTab(activeTab === 'settings' ? null : 'settings'); }}
              className={`p-2 sm:p-2.5 rounded-xl transition-all ${(activeTab === 'settings' || isMoreMenuOpen) ? 'bg-[#8ab4f8] text-[#202124]' : 'text-white hover:bg-white/10'}`}
            >
              <MoreVertical size={20} /></button>
            
            {/* End Call Pill */}
            <div className="w-[1px] h-8 bg-white/10 mx-1" />
            <button 
              onClick={() => router.push('/')}
              className="p-2 sm:p-2.5 rounded-xl bg-[#ea4335] hover:bg-[#d93025] text-white transition-all shadow-lg shadow-red-500/20 flex items-center justify-center"
            >
              <PhoneOff size={20} />
            </button>
        </div>

        <RoomAudioRenderer />
      </div>
    </div>
    </div>
    </div>
  );
}

/**
 * --- CustomParticipantTile Component ---
 * A wrapper around ParticipantTile to allow for custom styling and behavior.
 */
function CustomParticipantTile({ trackRef, className, raisedHands, isPinned, onTogglePin, mirror, showName = true, ...props }: any) {
  const trackRefFromContext = useMaybeTrackRefContext();
  const ref = trackRef || trackRefFromContext;
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  const isHost = useMemo(() => {
    const all = [localParticipant, ...remoteParticipants];
    const sorted = [...all].sort((a, b) => (a.joinedAt?.getTime() || 0) - (b.joinedAt?.getTime() || 0));
    return sorted[0]?.identity === ref?.participant.identity;
  }, [localParticipant, remoteParticipants, ref]);

  const isSpeaking = useIsSpeaking(ref?.participant);
  if (!ref) return null;

  const isVideoOff = !ref.publication || ref.publication.isMuted || !ref.publication.isEnabled;
  const isHandRaised = raisedHands?.[ref.participant.identity];
  
  // Speaking border logic matching Google Meet exactly
  const speakingStyles = isSpeaking && !isVideoOff ? "ring-4 ring-[#8ab4f8] ring-inset" : "";
  const speakingAvatarStyles = isSpeaking && isVideoOff ? "ring-4 ring-[#8ab4f8]" : "";

  let avatarUrl = "";
  try {
    const meta = JSON.parse(ref.participant.metadata || "{}");
    avatarUrl = meta.avatar;
  } catch (e) {}

  return (
    <div className={`relative aspect-video bg-[#202124] rounded-2xl overflow-hidden group shadow-lg flex items-center justify-center border-none outline-none ${speakingStyles} ${className}`} style={{ width: '100%', height: '100%' }}>
      <div className={`w-full h-full ${mirror ? 'scale-x-[-1]' : ''}`}>
        <ParticipantTile trackRef={ref} {...props} />
      </div>

      {/* PAIR: Name and Volume Indicator (Top Right) - Google Style */}
      <div className={`absolute top-3 right-3 z-30 flex items-center gap-2 bg-[#000000]/60 backdrop-blur-xl px-2.5 py-1.5 rounded-xl border border-white/10 shadow-xl group-hover:bg-[#000000]/80 transition-all ${!showName && !isSpeaking ? 'opacity-0 group-hover:opacity-100' : ''}`}>
        {!ref.participant.isMicrophoneEnabled && (
          <MicOff size={14} className="text-red-500 shrink-0" />
        )}
        
        {showName && <span className="text-white text-[12px] font-medium truncate">{ref.participant.identity === localParticipant.identity ? 'You' : ref.participant.identity.split('#')[0]}</span>}
        
        {isHost && (
          <ShieldCheck size={12} className="text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        )}
        
        {isSpeaking ? (
          <div className="flex gap-[2px] items-center h-3 w-3">
            <div className="w-[2px] bg-[#8ab4f8] rounded-full animate-voice-bar-1"></div>
            <div className="w-[2px] bg-[#8ab4f8] rounded-full animate-voice-bar-2"></div>
            <div className="w-[2px] bg-[#8ab4f8] rounded-full animate-voice-bar-3"></div>
          </div>
        ) : (
          <div className="flex gap-[3px] items-center h-3 px-0.5">
            <div className="w-[3px] h-[3px] bg-white/40 rounded-full"></div>
            <div className="w-[3px] h-[3px] bg-white/40 rounded-full"></div>
            <div className="w-[3px] h-[3px] bg-white/40 rounded-full"></div>
          </div>
        )}
      </div>

      {/* Pin/Spotlight Button (Top Left) - Only visible on hover */}
      {onTogglePin && (
        <button 
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={`absolute top-3 left-3 z-30 p-2 rounded-xl border border-white/10 backdrop-blur-xl transition-all shadow-lg opacity-0 group-hover:opacity-100 ${isPinned ? 'bg-blue-500 text-white opacity-100' : 'bg-[#202124]/60 text-white/70 hover:bg-[#202124]/90 hover:text-white'}`}
        >
          {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      )}

      {/* Hand Raised Indicator */}
      {isHandRaised && (
        <div className="absolute bottom-3 right-3 z-[40] bg-[#fbbc04] p-1.5 rounded-full shadow-xl animate-in zoom-in duration-300">
          <Hand size={16} className="text-[#202124]" />
        </div>
      )}
      
      {/* Overlay for when camera is off */}
      {isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#202124] z-[10] rounded-2xl">
          <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl transition-all duration-300 ${speakingAvatarStyles}`}>
            {avatarUrl ? <img src={avatarUrl} className="rounded-full w-full h-full object-cover" /> : ref.participant.identity.charAt(0)}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * --- AudioLevelIndicator Component ---
 * Uses the participant's built-in audioLevel property to avoid type errors.
 */
function AudioLevelIndicator() {
  const { localParticipant } = useLocalParticipant();
  const [level, setLevel] = useState(0);

  useEffect(() => {
    // Read directly from the localParticipant object which natively handles volume calculations
    const interval = setInterval(() => {
      setLevel(localParticipant.audioLevel || 0);
    }, 50);
    return () => clearInterval(interval);
  }, [localParticipant]);

  const dot1Active = level > 0.05;
  const dot2Active = level > 0.15;
  const dot3Active = level > 0.30;

  return (
    <div className="flex gap-1 items-center bg-[#3c4043]/80 px-3 py-2 rounded-full border border-white/10 shadow-lg backdrop-blur-md">
      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-75 ${dot1Active ? 'bg-[#8ab4f8] scale-150' : 'bg-white/40'}`}></div>
      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-75 delay-75 ${dot2Active ? 'bg-[#8ab4f8] scale-150' : 'bg-white/40'}`}></div>
      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-75 delay-150 ${dot3Active ? 'bg-[#8ab4f8] scale-150' : 'bg-white/40'}`}></div>
    </div>
  );
}