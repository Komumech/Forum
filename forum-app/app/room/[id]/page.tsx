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
} from '@livekit/components-react';
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
  VolumeX
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
            object-fit: contain !important;
            background-color: #000 !important;
            width: 100% !important;
            height: 100% !important;
            border-radius: 16px !important;
            padding: 0 !important;
          }

          /* Global Sleek Scrollbars */
          * {
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
          }
          *::-webkit-scrollbar { width: 6px; height: 6px; }
          *::-webkit-scrollbar-track { background: transparent; }
          *::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 20px;
            backdrop-filter: blur(4px);
          }
        `}</style>
        <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-12 bg-white p-8 md:p-12 rounded-[24px] shadow-sm border border-slate-100">
          
          <div className="flex-1 w-full relative aspect-video bg-[#202124] rounded-2xl overflow-hidden shadow-inner">
            <video ref={videoRef} autoPlay muted playsInline className="scale-x-[-1]" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
               <div className="p-4 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10"><Mic size={24} /></div>
               <div className="p-4 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10"><VideoIcon size={24} /></div>
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
  
  // Fix: useDataChannel returns 'send', not 'publish'
  const { send: sendData } = useDataChannel("hand-raise");

  const tracks = useTracks(
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

  // Layout & Stacking States
  const [layoutMode, setLayoutMode] = useState<'auto' | 'tiled' | 'sidebar' | 'spotlight'>('auto');
  const [pinnedIdentities, setPinnedIdentities] = useState<Set<string>>(new Set());
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(16);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const getMetadata = (p: Participant) => {
    try { return p.metadata ? JSON.parse(p.metadata) : {}; }
    catch { return {}; }
  };

  // Determine effective layout based on Auto logic
  const isScreenSharing = tracks.some(t => t.source === Track.Source.ScreenShare && t.participant.identity !== localParticipant.identity);
  const hasPins = pinnedIdentities.size > 0;
  
  // Google Meet logic: If someone joins, shift to Sidebar (Spotlight + vertical list)
  const effectiveLayout = layoutMode === 'auto' 
    ? (isScreenSharing || hasPins ? 'sidebar' : 'tiled') 
    : layoutMode;

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
    } catch (err) {
      console.error("Failed to send hand-raise data", err);
    }
  };

  // Fix: Manually enable tracks ONLY after the user is admitted.
  // This prevents the "engine not connected within timeout" error.
  useEffect(() => {
    if (localParticipant) {
      localParticipant.setCameraEnabled(true);
      localParticipant.setMicrophoneEnabled(true);
    }
  }, [localParticipant]);

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

  // Filter and Sort Tracks based on Google rules
  const processedTracks = useMemo(() => {
    // If no tracks yet, return empty
    if (!tracks || tracks.length === 0) return [];

    const filtered = tracks.filter(t => {
      // 2. Hide Non-Video Filter
      if (hideNonVideo && !t.participant?.isCameraEnabled && !t.participant?.isLocal) return false;
      
      return true;
    });

    return filtered.sort((a, b) => {
      // 3. Priority: Pinned > Identity (Alphabetical for stability)
      const aId = a.participant?.identity || "";
      const bId = b.participant?.identity || "";
      
      const aPinned = pinnedIdentities.has(aId) ? 1 : 0;
      const bPinned = pinnedIdentities.has(bId) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned; // Pinned first

      // "AI" Alignment: Prioritize active speakers in the sorting order
      if (a.participant.isSpeaking !== b.participant.isSpeaking) return b.participant.isSpeaking ? 1 : -1;

      // Local participant always goes last to prevent "swapping" positions with guests
      if (a.participant.isLocal !== b.participant.isLocal) return a.participant.isLocal ? 1 : -1;

      return aId.localeCompare(bId);
    }).slice(0, maxParticipants);
  }, [tracks, pinnedIdentities, hideNonVideo, maxParticipants, localParticipant.identity, remoteParticipants]);

  // Stacking Rule: 1:1 Floating Self-View
  const totalPeople = remoteParticipants.length + 1;
  const isOneOnOne = totalPeople === 2;
  
  // Helper to calculate Grid Dimensions for Google Meet style
  const getGridDimensions = (count: number) => {
    if (count <= 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    if (count <= 12) return { cols: 4, rows: 3 };
    if (count <= 16) return { cols: 4, rows: 4 };
    return { cols: 5, rows: Math.ceil(count / 5) };
  };

  // Show all tracks in the grid, including local, so you can pin yourself
  const mainGridTracks = useMemo(() => {
    return processedTracks.filter((t, i, self) => self.findIndex(prev => prev.participant.sid === t.participant.sid) === i);
  }, [processedTracks]);

  const { cols, rows } = getGridDimensions(mainGridTracks.length);

  // Priority Focus logic: Screenshare > Pinned > Active Speaker
  const focusTrack = useMemo(() => 
    tracks.find(t => t.source === Track.Source.ScreenShare && !t.participant.isLocal) || 
    processedTracks.find(t => pinnedIdentities.has(t.participant.identity)) || 
    processedTracks[0],
  [tracks, processedTracks, pinnedIdentities]);

  // Helper to determine if a track has active video
  const isVideoActive = (track?: TrackReferenceOrPlaceholder) => 
    track?.publication?.isEnabled && !track?.publication?.isMuted;

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

        /* 2. Force the Tile to be a container that doesn't shrink */
        .lk-participant-tile {
          background-color: #3c404300 !important;
          border-radius: 16px !important;
          overflow: hidden !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: none !important;
          min-width: 0 !important; /* Prevents tile from being pushed by video aspect ratio */
          min-height: 0 !important;
        }

        /* 3. The "No-Stretch, No-Crop, Big-Video" Rule */
        .lk-participant-tile video {
          display: block !important;
          object-fit: contain !important; /* Changed to contain to preserve rectangular aspect ratio without cropping */
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          background-color: #000 !important;
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
        .lk-participant-tile[data-lk-speaking="true"] {
           box-shadow: none !important; /* Removed blue speaking borders */
           border: none !important;
           outline: none !important;
        }
        
        .lk-participant-tile {
          transition: all 1s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        /* Glassmorphism Classes */
        .glass-panel {
          background: rgba(103, 113, 142, 0.4) !important;
          backdrop-filter: blur(24px) saturate(180%) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        /* Device Menu Styling */
        .lk-device-menu {
          background: rgba(32, 33, 36, 0.9) !important;
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
          color: rgba(255, 255, 255, 0.4) !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
          padding: 8px 14px !important;
          margin: 0 !important;
          letter-spacing: 0.05em !important;
        }
      `}</style>

      <div className="flex flex-1 h-full overflow-hidden relative bg-[#202124] transition-all duration-[700ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] flex-col"> 
        <div className="flex-1 h-full relative flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 flex items-center justify-center bg-[#202124] p-2 sm:p-2 pb-24 overflow-hidden min-h-0">
              <div className="lk-video-conference-inner w-full max-w-[1600px] mx-auto h-full flex items-center justify-center max-h-full overflow-hidden">
                {(effectiveLayout === 'sidebar' || effectiveLayout === 'spotlight') && focusTrack ? (
                  <div className="flex w-full h-full gap-4 animate-in fade-in duration-1000 p-4">
                    {/* Main Spotlight Section */}
                    <div className="flex-[3] h-full relative p-2 lg:p-4 flex items-center justify-center">
                      <div className={`w-full ${isVideoActive(focusTrack) ? 'max-w-[720px]' : 'max-w-[900px]'} aspect-video h-auto shadow-2xl transition-all duration-500 rounded-2xl overflow-hidden`}>
                        <CustomParticipantTile trackRef={focusTrack} className="w-full h-full" raisedHands={raisedHands} onTogglePin={() => togglePin(focusTrack.participant.identity)} isPinned={pinnedIdentities.has(focusTrack.participant.identity)} />
                      </div>
                    </div>

                    {/* Vertical Sidebar Section */}
                    <div className="w-[200px] lg:w-[280px] h-full overflow-y-auto custom-scroll space-y-3 pr-2 hidden md:flex flex-col">
                      {processedTracks
                        .filter(t => t.participant.identity !== focusTrack.participant.identity)
                        .slice(0, 5) // Show up to 5 individual tiles
                        .map(t => (
                          <div key={t.participant.identity} className="aspect-video w-full shrink-0">
                            <CustomParticipantTile 
                              trackRef={t} 
                              raisedHands={raisedHands} 
                              isPinned={pinnedIdentities.has(t.participant.identity)}
                              onTogglePin={() => togglePin(t.participant.identity)}
                            />
                          </div>
                        ))}

                      {/* THE OTHERS STACK */}
                      {processedTracks.length > 6 && (
                        <div className="bg-[#3c4043] aspect-video rounded-2xl flex flex-col items-center justify-center p-4 gap-3 border border-white/5 shrink-0 shadow-lg">
                          <div className="flex -space-x-3">
                            {processedTracks.slice(6, 9).map((t, idx) => {
                              const meta = getMetadata(t.participant);
                              return (
                                <div 
                                  key={t.participant.identity} 
                                  className="w-10 h-10 rounded-full border-2 border-[#3c4043] bg-indigo-600 flex items-center justify-center text-[12px] font-bold text-white overflow-hidden shadow-md"
                                  style={{ zIndex: 3 - idx }}
                                >
                                  {meta.avatar ? (
                                    <img src={meta.avatar} className="w-full h-full object-cover" />
                                  ) : (
                                    t.participant.identity.charAt(0).toUpperCase()
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-white/70 text-[13px] font-medium tracking-wide">
                            +{processedTracks.length - 6} others
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center"> 
                    <div 
                      className={`grid gap-3 transition-all duration-500 ${mainGridTracks.length === 1 ? (isVideoActive(mainGridTracks[0]) ? 'max-w-[720px]' : 'max-w-[900px]') + ' w-full aspect-video h-auto self-center shadow-2xl' : 'w-full h-full'}`}
                      style={{ 
                        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` 
                      }}
                    >
                      {mainGridTracks.map((t) => (
                        <CustomParticipantTile 
                          key={`${t.participant.sid}-${t.source}`} 
                          trackRef={t}
                          raisedHands={raisedHands}
                          isPinned={pinnedIdentities.has(t.participant.identity)}
                          onTogglePin={() => togglePin(t.participant.identity)}
                        />
                      ))}
                    </div>
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
            <span className="opacity-60">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <div className="w-[1px] h-3 bg-white/10" />
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
                <div className="space-y-8">
                  <div className="space-y-4">
                    <p className="text-[12px] font-bold text-[#5f6368] uppercase tracking-wider">Change layout</p>
                    <div className="grid grid-cols-2 gap-3">
                      {['auto', 'tiled', 'sidebar', 'spotlight'].map((type) => (
                        <button
                          key={type}
                          onClick={() => setLayoutMode(type as any)}
                          className={`p-4 rounded-xl border text-sm font-medium transition-all flex flex-col items-center gap-2 ${layoutMode === type ? 'border-[#1a73e8] bg-blue-50 text-[#1a73e8]' : 'border-slate-200 text-[#5f6368] hover:bg-slate-50'}`}
                        >
                          <LayoutIcon size={20} />
                          <span className="capitalize">{type}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-[12px] font-bold text-[#5f6368] uppercase tracking-wider">Tiles ({maxParticipants})</p>
                    </div>
                    <input 
                      type="range" min="6" max="49" value={maxParticipants}
                      onChange={(e) => setMaxParticipants(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium text-[#3c4043]">Hide non-video participants</span>
                    <button 
                      onClick={() => setHideNonVideo(!hideNonVideo)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${hideNonVideo ? 'bg-[#1a73e8]' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${hideNonVideo ? 'left-6' : 'left-1'}`} />
                    </button>
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
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 glass-panel p-1.5 rounded-[22px] pointer-events-auto">
            <div className="flex items-center">
              <button 
                onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
                className={`p-2.5 rounded-xl transition-all ${!localParticipant.isMicrophoneEnabled ? 'bg-[#ea4335] text-white shadow-lg shadow-red-500/20' : 'text-white hover:bg-white/10'}`}
              >
                {localParticipant.isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <MediaDeviceMenu 
                kind="audioinput" 
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <ChevronDown size={14} />
              </MediaDeviceMenu>
            </div>
            
            <div className="w-[1px] h-6 bg-white/10 mx-1" />

            <div className="flex items-center">
              <button 
                onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
                className={`p-2.5 rounded-xl transition-all ${!localParticipant.isCameraEnabled ? 'bg-[#ea4335] text-white shadow-lg shadow-red-500/20' : 'text-white hover:bg-white/10'}`}
              >
                {localParticipant.isCameraEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
              </button>
              <MediaDeviceMenu 
                kind="videoinput" 
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <ChevronDown size={14} />
              </MediaDeviceMenu>
            </div>

            <div className="w-[1px] h-6 bg-white/10 mx-1" />

            <button 
              onClick={toggleHandRaise}
              className={`p-2.5 rounded-xl transition-all ${isHandRaised ? 'bg-[#fbbc04] text-[#202124] shadow-lg shadow-yellow-500/20' : 'text-white hover:bg-white/10'}`}
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
              onClick={() => { if(window.innerWidth < 640) setIsMoreMenuOpen(!isMoreMenuOpen); else setActiveTab(activeTab === 'settings' ? null : 'settings'); }}
              className={`p-2.5 rounded-xl transition-all ${(activeTab === 'settings' || isMoreMenuOpen) ? 'bg-[#8ab4f8] text-[#202124]' : 'text-white hover:bg-white/10'}`}
            >
              <MoreVertical size={20} /></button>
            
            {/* End Call Pill */}
            <div className="w-[1px] h-8 bg-white/10 mx-1" />
            <button 
              onClick={() => router.push('/')}
              className="p-2.5 rounded-xl bg-[#ea4335] hover:bg-[#d93025] text-white transition-all shadow-lg shadow-red-500/20 flex items-center justify-center"
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
function CustomParticipantTile({ trackRef, className, raisedHands, isPinned, onTogglePin, ...props }: any) {
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

  // Check if the specific track being rendered is actually enabled/subscribed
  const isVideoOff = !ref.publication || ref.publication.isMuted || !ref.publication.isEnabled;

  const isHandRaised = raisedHands?.[ref.participant.identity];
  
  let avatarUrl = "";
  try {
    const meta = JSON.parse(ref.participant.metadata || "{}");
    avatarUrl = meta.avatar;
  } catch (e) {}

  return (
    <div className={`relative w-full h-full group ${className}`}>
      {/* IMPORTANT: We put the ParticipantTile directly here. 
         The CSS above handles making it 'contain' and 'big'.
      */}
      <ParticipantTile trackRef={ref} {...props} />

      {/* PAIR: Name and Volume Indicator (Top Right) - Google Style */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-[#202124]/60 backdrop-blur-xl px-2.5 py-1 rounded-xl border border-white/5 shadow-lg group-hover:bg-[#202124]/80 transition-all">
        {!ref.participant.isMicrophoneEnabled && (
          <MicOff size={14} className="text-red-500 shrink-0" />
        )}
        
        <span className="text-white text-[12px] font-medium truncate">
          {ref.participant.identity === localParticipant.identity ? 'You' : ref.participant.identity.split('#')[0]}
        </span>
        
        {isHost && (
          <ShieldCheck size={12} className="text-blue-400" />
        )}
        
        {isSpeaking && (
          <div className="flex gap-[2px] items-center h-3 w-3">
            <div className="w-[2px] bg-[#8ab4f8] rounded-full animate-voice-bar-1"></div>
            <div className="w-[2px] bg-[#8ab4f8] rounded-full animate-voice-bar-2"></div>
            <div className="w-[2px] bg-[#8ab4f8] rounded-full animate-voice-bar-3"></div>
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
        <div className="absolute inset-0 flex items-center justify-center bg-[#3c4043] z-[10] rounded-2xl">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl">
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