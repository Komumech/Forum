'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  LiveKitRoom, 
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  GridLayout,
  ParticipantTile,
  useChat,
  useRemoteParticipants,
  useDataChannel,
  TrackReference,
  useParticipantInfo,
  useMaybeTrackRefContext,
  useIsSpeaking,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, DataPacket_Kind, Participant, RemoteParticipant, VideoPresets, ScreenSharePresets } from 'livekit-client';
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
        video={{
          captureDefaults: {
            resolution: VideoPresets.h1080.resolution,
            frameRate: 30,
          },
          simulcast: true,
          adaptiveStream: true,
        }}
        audio={false}
        token={token}
        serverUrl={serverUrl}
        connect={true}
        data-lk-theme="default"
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        onDisconnected={() => router.push('/')}
      >
        <MeetingRoomContent room={room} />
      </LiveKitRoom>
    </main>
  );
}

function MeetingRoomContent({ room }: { room: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send: sendChat } = useChat();
  
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
  
  const effectiveLayout = layoutMode === 'auto' 
    ? (isScreenSharing || hasPins ? 'sidebar' : 'tiled') 
    : layoutMode;

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const toggleHandRaise = () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    const encoder = new TextEncoder();
    sendData(encoder.encode(JSON.stringify({ type: 'hand-raise', raised: newState })), { reliable: true });
    setRaisedHands(prev => ({ ...prev, [localParticipant.identity]: newState }));
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
      if (aPinned !== bPinned) return bPinned - aPinned;

      return aId.localeCompare(bId);
    }).slice(0, maxParticipants);
  }, [tracks, pinnedIdentities, hideNonVideo, maxParticipants]);

  // Stacking Rule: 1:1 Floating Self-View
  const totalPeople = remoteParticipants.length + 1;
  const isOneOnOne = totalPeople === 2;
  const mainGridTracks = useMemo(() => 
    isOneOnOne 
      ? processedTracks.filter(t => !t.participant.isLocal)
      : processedTracks,
  [isOneOnOne, processedTracks]);

  // Priority Focus logic: Screenshare > Pinned > Active Speaker
  const focusTrack = useMemo(() => 
    tracks.find(t => t.source === Track.Source.ScreenShare && !t.participant.isLocal) || 
    processedTracks.find(t => pinnedIdentities.has(t.participant.identity)) || 
    processedTracks.find(t => t.participant.isSpeaking) || 
    processedTracks[0],
  [tracks, processedTracks, pinnedIdentities]);

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
          background-color: #3c4043 !important;
          border-radius: 16px !important;
          overflow: hidden !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: none !important;
        }

        /* 3. The "No-Stretch, No-Crop, Big-Video" Rule */
        .lk-participant-tile video {
          display: block !important;
          object-fit: cover !important; /* Changed to cover for a more modern immersive feel */
          width: 70% !important;
          height: 74% !important;
          background-color: #000 !important;
          position: relative !important;
          z-index: 5 !important;
        }
        
        @media (max-width: 768px) {
          
          .lk-participant-tile video {
            width: 100% !important;
            height: 100% !important;
          }
        }

        /* Hide default bottom labels to prevent blocking */
        .lk-participant-name, .lk-focus-toggle-button {
          display: none !important;
        }

        /* Speaking Indicator Border */
        .lk-participant-tile[data-lk-speaking="true"] {
           outline: 3px solid #8ab4f8 !important;
           outline-offset: -3px;
        }


        /* Glassmorphism Classes */
        .glass-panel {
          background: rgba(32, 33, 36, 0.4) !important;
          backdrop-filter: blur(24px) saturate(180%) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
      `}</style>

      <div className="flex flex-1 overflow-hidden relative bg-[#202124] transition-all duration-[1000ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"> 
        <div className={`flex-1 relative flex flex-col transition-all duration-[1000ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${activeTab ? 'mr-2' : ''}`}>
            <div className="flex-1 flex items-center justify-center bg-[#202124] p-2 sm:p-4 overflow-hidden">
              <div className="lk-video-conference-inner w-full max-w-[1600px] mx-auto h-full flex items-center justify-center">
                {effectiveLayout === 'spotlight' && focusTrack ? (
                  <div className="w-full h-full p-4 animate-in fade-in zoom-in-95 duration-1000 spotlight-view">
                    <CustomParticipantTile trackRef={focusTrack} className="w-full h-full" raisedHands={raisedHands} />
                  </div>
                ) : effectiveLayout === 'sidebar' && focusTrack ? (
                  <div className="flex w-full h-full gap-4 animate-in fade-in duration-1000">
                    <div className="flex-[3] h-full relative">
                      <CustomParticipantTile trackRef={focusTrack} className="w-full h-full" raisedHands={raisedHands} />
                    </div>
                    <div className="w-[240px] h-full overflow-y-auto custom-scroll space-y-3 pr-2 hidden md:block">
                      {processedTracks.filter(t => t !== focusTrack).map(t => (
                        <div key={t.participant.identity} className="aspect-video w-full relative group">
                           <CustomParticipantTile trackRef={t} raisedHands={raisedHands} />
                           <button 
                            onClick={() => togglePin(t.participant.identity)}
                            className="absolute top-2 right-2 p-1.5 bg-black/40 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                           >
                             {pinnedIdentities.has(t.participant.identity) ? <PinOff size={14} /> : <Pin size={14} />}
                           </button>
                        </div>
                      ))}
                      {processedTracks.length > 6 && (
                        <div className="bg-[#3c4043] aspect-video rounded-xl flex items-center justify-center text-white text-xs font-medium">
                          +{processedTracks.length - 6} more
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 w-full h-full min-h-[400px]"> 
                    <GridLayout tracks={mainGridTracks} className="w-full h-full">
                      <CustomParticipantTile raisedHands={raisedHands} />
                    </GridLayout>
                  </div>
                )}
              </div>
        
        {/* TOP BRANDING BAR (Floating) */}
        <div className="absolute top-6 left-6 z-50 pointer-events-none">
          <div className="flex items-center gap-2 glass-panel px-4 py-2 rounded-2xl">
            <div className="w-6 h-6 bg-indigo-500 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shadow-lg">F</div>
            <span className="text-white/90 text-sm font-semibold tracking-tight">Forum <span className="text-white/40 mx-1">|</span> {room}</span>
          </div>
        </div>

        {/* FLOATING SELF-VIEW (PIPPED) */}
        {isOneOnOne && (
          <div className="absolute bottom-24 sm:bottom-8 right-8 w-40 sm:w-64 aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-white/10 z-[80] animate-in slide-in-from-bottom-4 duration-1000">
            <CustomParticipantTile 
              trackRef={processedTracks.find(t => t.participant.isLocal)} raisedHands={raisedHands}
            />
          </div>
        )}
      </div>

        {/* RIGHT SIDEBAR PANEL (Overlay Style) */}
        {activeTab && (
          <aside 
            key={activeTab} 
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
                <div className="flex flex-col h-full">
                  <div className="flex-1 space-y-4 mb-4">
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
                  <form 
                    onSubmit={(e) => { e.preventDefault(); if(chatInput.trim()){ sendChat(chatInput); setChatInput(""); }}}
                    className="flex gap-2 items-center bg-[#f1f3f4] rounded-full px-4 py-1.5"
                  >
                    <input 
                      type="text" 
                      placeholder="Send a message" 
                      className="bg-transparent outline-none flex-1 text-[14px] text-[#202124] h-10 placeholder:text-[#5f6368]"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                    />
                    <button type="submit" disabled={!chatInput.trim()} className="text-[#1a73e8] p-2 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50"><Send size={18} /></button>
                  </form>
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


        {/* Left: Time (Glass) */}
        <div className="absolute left-8 hidden xl:flex items-center glass-panel px-5 py-3 rounded-2xl text-white/80 text-sm font-medium pointer-events-auto">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Center: Main Taskbar */}
        <div className="flex items-center gap-3 glass-panel p-2 rounded-[24px] pointer-events-auto">
            <button 
              onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled, {
                resolution: ScreenSharePresets.h1080fps30.resolution,
              })}
              className={`p-3.5 rounded-2xl transition-all ${!localParticipant.isMicrophoneEnabled ? 'bg-[#ea4335] text-white shadow-lg shadow-red-500/20' : 'text-white hover:bg-white/10'}`}
            >
              {localParticipant.isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            
            <button 
              onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
              className={`p-3.5 rounded-2xl transition-all ${!localParticipant.isCameraEnabled ? 'bg-[#ea4335] text-white shadow-lg shadow-red-500/20' : 'text-white hover:bg-white/10'}`}
            >
              {localParticipant.isCameraEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
            </button>

            <button 
              onClick={toggleHandRaise}
              className={`p-3.5 rounded-2xl transition-all ${isHandRaised ? 'bg-[#fbbc04] text-[#202124] shadow-lg shadow-yellow-500/20' : 'text-white hover:bg-white/10'}`}
            >
              <Hand size={20} />
            </button>

            <button 
              onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled, {
                resolution: ScreenSharePresets.h1080fps30.resolution,
              })}
              className={`p-3.5 rounded-2xl transition-all hidden sm:flex ${localParticipant.isScreenShareEnabled ? 'bg-[#8ab4f8] text-[#202124] shadow-lg' : 'text-white hover:bg-white/10'}`}
            >
              {localParticipant.isScreenShareEnabled ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
            </button>

            <button 
              onClick={() => { if(window.innerWidth < 640) setIsMoreMenuOpen(!isMoreMenuOpen); else setActiveTab(activeTab === 'settings' ? null : 'settings'); }}
              className={`p-3.5 rounded-2xl transition-all ${(activeTab === 'settings' || isMoreMenuOpen) ? 'bg-[#8ab4f8] text-[#202124]' : 'text-white hover:bg-white/10'}`}
            >
              <MoreVertical size={22} /></button>
            
            {/* End Call Pill */}
            <div className="w-[1px] h-8 bg-white/10 mx-1" />
            <button 
              onClick={() => router.push('/')}
              className="p-3.5 rounded-2xl bg-[#ea4335] hover:bg-[#d93025] text-white transition-all shadow-lg shadow-red-500/20 flex items-center justify-center"
            >
              <PhoneOff size={22} />
            </button>
        </div>

        {/* Right: Side Taskbar (Tabs) */}
        <div className="absolute right-8 hidden sm:flex items-center gap-2 glass-panel p-2 rounded-[24px] pointer-events-auto">
          <button 
            onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')}
            className={`p-2.5 rounded-full transition-all ${activeTab === 'info' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
          >
            <Info size={22} />
          </button>

          {/* Stacked Avatars and Count */}
          <button 
            onClick={() => setActiveTab(activeTab === 'users' ? null : 'users')}
            className={`relative flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full transition-all ${activeTab === 'users' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
          >
            <div className="flex -space-x-2 mr-1">
              {[localParticipant, ...remoteParticipants].slice(0, 3).map((p, i) => {
                const meta = getMetadata(p);
                return (
                  <div 
                    key={p.sid || p.identity} 
                    style={{ zIndex: 3 - i }}
                    className="w-6 h-6 rounded-full border-2 border-[#202124] bg-indigo-500 overflow-hidden text-[10px] flex items-center justify-center font-bold"
                  >
                    {meta.avatar ? <img src={meta.avatar} className="w-full h-full object-cover" /> : p.identity.charAt(0).toUpperCase()}
                  </div>
                );
              })}
            </div>
            <span className="text-xs sm:text-sm font-medium">
              {[localParticipant, ...remoteParticipants].length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')}
            className={`p-2.5 rounded-full transition-all ${activeTab === 'chat' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
          >
            <MessageSquare size={22} />
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
function CustomParticipantTile({ trackRef, className, raisedHands, ...props }: any) {
  const trackRefFromContext = useMaybeTrackRefContext();
  const ref = trackRef || trackRefFromContext;

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
    <div className={`relative w-full h-full ${className}`}>
      {/* IMPORTANT: We put the ParticipantTile directly here. 
         The CSS above handles making it 'contain' and 'big'.
      */}
      <ParticipantTile trackRef={ref} {...props} />

      {/* PAIR: Name and Volume Indicator (Top Right) */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 max-w-[80%]">
        <span className="text-white text-[12px] font-medium truncate">
          {ref.participant.identity === 'local' ? 'You' : ref.participant.identity.split('#')[0]}
        </span>
        
        {isSpeaking && (
           <div className="flex gap-0.5 items-end h-3 w-3">
             <div className="w-[2px] bg-blue-400 rounded-full animate-voice-bar-1"></div>
             <div className="w-[2px] bg-blue-400 rounded-full animate-voice-bar-2"></div>
             <div className="w-[2px] bg-blue-400 rounded-full animate-voice-bar-3"></div>
           </div>
        )}
        {!ref.participant.isMicrophoneEnabled && (
          <MicOff size={12} className="text-red-400" />
        )}
      </div>

      {/* Hand Raised Indicator */}
      {isHandRaised && (
        <div className="absolute top-4 left-4 z-[20] bg-[#fbbc04] p-1.5 rounded-full shadow-lg animate-in zoom-in duration-300">
          <Hand size={18} className="text-[#202124]" />
        </div>
      )}
      
      {/* Overlay for when camera is off */}
      {isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#3c4043] z-[10] rounded-2xl">
          <div className="w-20 h-20 md:w-32 md:h-32 rounded-full bg-indigo-600 flex items-center justify-center text-3xl font-bold text-white">
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