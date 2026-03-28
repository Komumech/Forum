'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  LiveKitRoom, 
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  GridLayout,
  ParticipantTile,
  FocusLayout,
  CarouselLayout,
  useChat,
  useRemoteParticipants,
  useDataChannel,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, DataPacket_Kind } from 'livekit-client';
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
  Copy,
  Check,
  Pin,
  PinOff,
  Layout as LayoutIcon,
  Maximize
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

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user]);

  // 1. Initial Camera Preview for "Green Room"
  useEffect(() => {
    if (!isReady) {
      if (!navigator.mediaDevices) return;
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        }).catch(err => {
          console.error("Camera access denied", err);
        });
    }
  }, [isReady]);

  // 2. Fetch Token once user clicks "Join"
  const handleJoin = async () => {
    if (!name) return;
    try {
      const metadata = JSON.stringify({ pending: true });
      const resp = await fetch(`/api/get-participant-token?room=${room}&username=${name}&metadata=${metadata}`);
      const data = await resp.json();
      setToken(data.token);
      setIsReady(true);
    } catch (e) {
      console.error("Failed to get token", e);
    }
  };

  // --- VIEW 1: PRE-JOIN (THE GREEN ROOM) ---
  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-12 bg-white p-8 md:p-12 rounded-[24px] shadow-sm border border-slate-100">
          
          <div className="flex-1 w-full relative aspect-video bg-[#202124] rounded-2xl overflow-hidden shadow-inner">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain bg-black scale-x-[-1]" />
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
                placeholder="Enter your name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 bg-[#f1f3f4] border-none rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-[16px] transition-all text-[#3c4043]"
              />
              <button 
                onClick={handleJoin}
                disabled={!name}
                className="w-full py-4 bg-[#1a73e8] text-white rounded-full font-medium text-[15px] hover:bg-[#185abc] active:scale-[0.98] transition-all disabled:bg-[#e8eaed] disabled:text-[#9aa0a6]"
              >
                Ask to join
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
  return (
    <main className="h-screen bg-[#202124] overflow-hidden relative font-sans">
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100dvh' }}
        onDisconnected={() => router.push('/')}
      >
        <MeetingRoomContent room={room} />
      </LiveKitRoom>
    </main>
  );
}

function MeetingRoomContent({ room }: { room: string }) {
  const router = useRouter();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send: sendChat } = useChat();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'chat' | 'settings' | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");

  // Layout & Stacking States
  const [layoutMode, setLayoutMode] = useState<'auto' | 'tiled' | 'sidebar' | 'spotlight'>('auto');
  const [pinnedIdentities, setPinnedIdentities] = useState<Set<string>>(new Set());
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(16);

  // Determine effective layout based on Auto logic
  const isScreenSharing = tracks.some(t => t.source === Track.Source.ScreenShare);
  const hasPins = pinnedIdentities.size > 0;
  
  const effectiveLayout = layoutMode === 'auto' 
    ? (isScreenSharing || hasPins ? 'sidebar' : 'tiled') 
    : layoutMode;

  useEffect(() => {
    setMeetingUrl(window.location.href);
  }, []);

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

  // Permission Logic
  useDataChannel((msg) => {
    const decoder = new TextDecoder();
    const payload = decoder.decode(msg.payload);
    if (payload === 'JOIN_APPROVED') setIsAdmitted(true);
  });

  useEffect(() => {
    const metadata = localParticipant.metadata ? JSON.parse(localParticipant.metadata) : {};
    if (!metadata.pending || remoteParticipants.length === 0) setIsAdmitted(true);
  }, [localParticipant.metadata, remoteParticipants.length]);

  const admitParticipant = (identity: string) => {
    const encoder = new TextEncoder();
    localParticipant.publishData(
      encoder.encode('JOIN_APPROVED'),
      DataPacket_Kind.RELIABLE,
      { destinationIdentities: [identity] }
    );
  };

  const pendingParticipants = remoteParticipants.filter(p => {
    try { return p.metadata && JSON.parse(p.metadata).pending; } catch { return false; }
  });

  const activeParticipants = remoteParticipants.filter(p => {
    try { return !p.metadata || !JSON.parse(p.metadata).pending; } catch { return true; }
  });

  // Filter and Sort Tracks based on Google rules
  const processedTracks = tracks.filter(t => {
    // 1. Admit Filter
    const p = activeParticipants.find(ap => ap.identity === t.participant.identity);
    const isAdmittedOrLocal = !!p || t.participant.identity === localParticipant.identity;
    
    // 2. Hide Non-Video Filter
    if (hideNonVideo && !t.participant.isCameraEnabled) return false;
    
    return isAdmittedOrLocal;
  }).sort((a, b) => {
    // 3. Priority: Pinned > Speaking > Rest
    const aPinned = pinnedIdentities.has(a.participant.identity) ? 1 : 0;
    const bPinned = pinnedIdentities.has(b.participant.identity) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aSpeaking = a.participant.isSpeaking ? 1 : 0;
    const bSpeaking = b.participant.isSpeaking ? 1 : 0;
    return bSpeaking - aSpeaking;
  }).slice(0, maxParticipants);

  // Stacking Rule: 1:1 Floating Self-View
  const totalPeople = activeParticipants.length + 1;
  const isOneOnOne = totalPeople === 2;
  const mainGridTracks = isOneOnOne 
    ? processedTracks.filter(t => t.participant.identity !== localParticipant.identity)
    : processedTracks;

  // Priority Focus logic: Screenshare > Pinned > Active Speaker
  const focusTrack = tracks.find(t => t.source === Track.Source.ScreenShare) || 
                     processedTracks.find(t => pinnedIdentities.has(t.participant.identity)) || 
                     processedTracks.find(t => t.participant.isSpeaking) || 
                     processedTracks[0];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#202124] flex-col relative">
      
      {/* AGGRESSIVE CSS OVERRIDES: Obliterates Glows, Outlines, and Borders */}
      <style jsx global>{`
        .lk-video-conference, 
        .lk-grid-layout,
        .lk-focus-layout {
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) !important;
          padding: 1rem !important;
          gap: 12px !important;
          background: transparent !important;
        }

        .lk-participant-tile {
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }

        /* Remove ALL tracking/glowing shadows and outlines injected by LiveKit */
        .lk-participant-tile,
        .lk-participant-tile[data-lk-speaking="true"],
        .lk-participant-tile:focus,
        .lk-participant-tile:focus-within {
          border: 2px solid transparent !important;
          box-shadow: none !important;
          outline: none !important;
          background-color: #3c4043 !important;
          border-radius: 12px;
          overflow: hidden;
        }

        .lk-participant-tile[data-lk-speaking="true"] {
          border-color: #8ab4f8 !important;
        }


        /* Target the internal elements that might carry default styling */
        .lk-participant-tile::after,
        .lk-participant-tile::before {
          box-shadow: none !important;
          border: none !important;
          outline: none !important;
        }

        
        /* Standard Grid: Contain to prevent stretching and resolution distortion */
        .lk-grid-layout .lk-participant-tile video {
          object-fit: contain !important;
          background-color: #000 !important;
        }

        /* Focus/Spotlight: Contain (Full) to ensure presentation/face isn't cut */
        .lk-focus-layout video,
        .spotlight-view video {
          object-fit: contain !important;
        }
        
        /* Custom Scrollbar for Chat */
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 10px; }
      `}</style>

      {/* TOP BRANDING BAR */}
      <div className="absolute top-4 left-4 z-50 pointer-events-none">
        <div className="flex items-center gap-2 bg-[#202124]/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
          <div className="w-5 h-5 bg-indigo-500 rounded flex items-center justify-center text-[10px] font-bold text-white">F</div>
          <span className="text-white text-[13px] font-medium tracking-wide">Forum | {room}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative bg-[#202124] pb-12 transition-all duration-[800ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"> 
        <div className={`flex-1 relative flex flex-col transition-all duration-[800ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${activeTab ? 'mr-2' : ''}`}>
          {!isAdmitted ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white space-y-4">
              <div className="w-12 h-12 border-4 border-[#8ab4f8] border-t-transparent rounded-full animate-spin mb-2" />
              <h2 className="text-[24px] font-normal">Asking to join...</h2>
              <p className="text-[#9aa0a6]">Someone in the meeting will let you in soon.</p>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#202124] p-2 sm:p-4 overflow-hidden">
              <div className="lk-video-conference-inner w-full max-w-[1600px] mx-auto h-full flex items-center justify-center">
                {effectiveLayout === 'spotlight' && focusTrack ? (
                  <div className="w-full h-full p-4 animate-in fade-in zoom-in-95 duration-700 spotlight-view">
                    <ParticipantTile trackRef={focusTrack} className="w-full h-full" />
                  </div>
                ) : effectiveLayout === 'sidebar' && focusTrack ? (
                  <div className="flex w-full h-full gap-4 animate-in fade-in duration-700">
                    <div className="flex-[3] h-full">
                      <ParticipantTile trackRef={focusTrack} className="w-full h-full" />
                    </div>
                    <div className="w-[240px] h-full overflow-y-auto custom-scroll space-y-3 pr-2 hidden md:block">
                      {processedTracks.filter(t => t !== focusTrack).map(t => (
                        <div key={t.participant.identity} className="aspect-video w-full relative group">
                           <ParticipantTile trackRef={t} />
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
                  <GridLayout tracks={mainGridTracks}>
                    <ParticipantTile />
                  </GridLayout>
                )}
              </div>

              {/* FLOATING SELF-VIEW (PIPPED) */}
              {isOneOnOne && (
                <div className="absolute bottom-24 right-8 w-64 aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-white/10 z-[80] animate-in slide-in-from-bottom-4 duration-700">
                  <ParticipantTile 
                    trackRef={processedTracks.find(t => t.participant.identity === localParticipant.identity)} 
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR PANEL */}
        {activeTab && (
          <aside 
            key={activeTab} 
            className="w-[360px] bg-white m-4 ml-0 rounded-2xl flex flex-col shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-right-full duration-[800ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
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
                  {pendingParticipants.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[12px] font-bold text-[#1a73e8] uppercase tracking-wider">Waiting to join ({pendingParticipants.length})</p>
                      {pendingParticipants.map(p => (
                        <div key={p.identity} className="flex items-center justify-between bg-blue-50/50 p-3 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-2">
                          <span className="text-[14px] font-medium text-[#202124]">{p.identity}</span>
                          <div className="flex gap-2">
                            <button onClick={() => admitParticipant(p.identity)} className="px-3 py-1.5 bg-[#1a73e8] text-white text-xs font-medium rounded-full hover:bg-[#185abc] transition-colors">Admit</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-4">
                    <p className="text-[12px] font-bold text-[#5f6368] uppercase tracking-wider">In call</p>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-[13px] font-bold">You</div>
                      <span className="text-[14px] text-[#202124] font-medium">{localParticipant.identity}</span>
                    </div>
                    {activeParticipants.map(p => (
                      <div key={p.identity} className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-100 text-[#1a73e8] rounded-full flex items-center justify-center text-[13px] font-bold">{p.identity.charAt(0).toUpperCase()}</div>
                        <span className="text-[14px] text-[#202124] font-medium">{p.identity}</span>
                      </div>
                    ))}
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
      </div>

      {/* GOOGLE-STYLE FLOATING CONTROL DOCK */}
      <div className="absolute bottom-5 left-0 right-0 flex items-center justify-between px-6 z-[70] pointer-events-none">
        
        {/* Left: Time (Hidden on small screens) */}
        <div className="hidden xl:flex items-center text-white/90 text-[15px] font-medium pointer-events-auto">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()} | {room}
        </div>

        {/* Center: Main Controls */}
        <div className="flex items-center gap-3 pointer-events-auto mx-auto">
            <button 
              onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
              className={`p-3 rounded-full transition-all ${!localParticipant.isMicrophoneEnabled ? 'bg-[#ea4335] hover:bg-[#d93025]' : 'bg-[#3c4043] hover:bg-[#4a4e51]'} text-white`}
            >
              {localParticipant.isMicrophoneEnabled ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            
            <button 
              onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
              className={`p-3 rounded-full transition-all ${!localParticipant.isCameraEnabled ? 'bg-[#ea4335] hover:bg-[#d93025]' : 'bg-[#3c4043] hover:bg-[#4a4e51]'} text-white`}
            >
              {localParticipant.isCameraEnabled ? <VideoIcon size={22} /> : <VideoOff size={22} />}
            </button>

            <button 
              onClick={() => setIsHandRaised(!isHandRaised)}
              className={`p-3 rounded-full transition-all ${isHandRaised ? 'bg-[#fbbc04] text-[#202124] hover:bg-[#f2a900]' : 'bg-[#3c4043] hover:bg-[#4a4e51] text-white'}`}
            >
              <Hand size={22} />
            </button>

            <button 
              onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled)}
              className={`p-3 rounded-full transition-all ${localParticipant.isScreenShareEnabled ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4a4e51] text-white'}`}
            >
              {localParticipant.isScreenShareEnabled ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
            </button>

            <button 
              onClick={() => setActiveTab(activeTab === 'settings' ? null : 'settings')}
              className={`p-3 rounded-full transition-all hidden sm:block ${activeTab === 'settings' ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4a4e51] text-white'}`}
            >
              <MoreVertical size={22} /></button>
            
            {/* End Call Pill */}
            <button 
              onClick={() => router.push('/')}
              className="px-5 py-3 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white transition-all shadow-md ml-2 flex items-center gap-2"
            >
              <PhoneOff size={22} />
            </button>
        </div>

        {/* Right: Tab Controls */}
        <div className="flex items-center gap-1 pointer-events-auto">
          <button 
            onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')}
            className={`p-2.5 rounded-full transition-all ${activeTab === 'info' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
          >
            <Info size={22} />
          </button>

          {/* Stacked Avatars and Count */}
          <button 
            onClick={() => setActiveTab(activeTab === 'users' ? null : 'users')}
            className={`relative flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${activeTab === 'users' ? 'text-[#8ab4f8] bg-[#8ab4f8]/20' : 'text-white hover:bg-white/10'}`}
          >
            <div className="flex -space-x-2 mr-1">
              {[localParticipant, ...activeParticipants].slice(0, 3).map((p, i) => (
                <div 
                  key={p.identity} 
                  style={{ zIndex: 3 - i }}
                  className="w-6 h-6 rounded-full border-2 border-[#202124] bg-indigo-500 text-[10px] flex items-center justify-center font-bold"
                >
                  {p.identity.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-sm font-medium">
              {[localParticipant, ...activeParticipants].length}
            </span>
            {pendingParticipants.length > 0 && (
               <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#fbbc04] rounded-full border-2 border-[#202124]"></span>
            )}
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
  );
}

/**
 * --- CustomParticipantTile ---
 * Wraps the standard tile to show the profile image when the camera is off.
 */
function CustomParticipantTile({ trackRef, className }: { trackRef?: TrackReference, className?: string }) {
  const { participant } = useParticipantInfo({ participant: trackRef?.participant });
  
  const getAvatar = () => {
    try {
      const meta = participant?.metadata ? JSON.parse(participant.metadata) : {};
      return meta.avatar;
    } catch { return null; }
  };

  const avatar = getAvatar();
  const isCameraOff = participant && !participant.isCameraEnabled;

  return (
    <div className={`relative w-full h-full ${className}`}>
      <ParticipantTile trackRef={trackRef} />
      {isCameraOff && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#202124]">
          {avatar ? (
            <img src={avatar} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-[#3c4043] shadow-2xl" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center text-3xl font-bold text-white shadow-2xl">
              {participant?.identity?.charAt(0).toUpperCase()}
            </div>
          )}
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