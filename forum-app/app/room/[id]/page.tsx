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
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, DataPacket_Kind, Participant, RemoteParticipant } from 'livekit-client';
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
        pending: true, 
        avatar: user?.photoURL || "" 
      });

      // Stop preview stream before joining LiveKit to release camera lock
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;

      const resp = await fetch(`/api/get-participant-token?room=${room}&username=${encodeURIComponent(name)}&metadata=${encodeURIComponent(metadata)}`);
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
        <style jsx global>{`
          /* Force all video feeds to maintain aspect ratio and letterbox (Google Meet style) */
          video {
            object-fit: contain !important;
            background-color: #000 !important;
            width: 100% !important;
            height: 100% !important;
            border-radius: 16px !important;
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
        connect={true}
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
  const { user } = useAuth();
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

  // Stabilize participant lists by only re-calculating when identities or metadata change.
  // remoteParticipants array reference changes frequently (on every audio level/speaking update).
  const pendingParticipants = useMemo(() => 
    remoteParticipants.filter(p => {
      try { return p.metadata && JSON.parse(p.metadata).pending; } catch { return false; }
    }), 
    [remoteParticipants.map(p => p.identity + p.metadata).join(',')]
  );

  const activeParticipants = useMemo(() => 
    remoteParticipants.filter(p => {
      try { return !getMetadata(p).pending; } catch { return true; }
    }), 
    [remoteParticipants.map(p => p.identity + p.metadata).join(',')]
  );

  // Stabilize the host logic: The person who joined first is the host.
  const isHost = useMemo(() => {
    if (remoteParticipants.length === 0) return true;
    
    // The host is the one who joined first among active (admitted) participants
    const activeOnes = [localParticipant, ...activeParticipants];
    const sorted = [...activeOnes].sort((a, b) => {
      const tA = a.joinedAt?.getTime() || Date.now();
      const tB = b.joinedAt?.getTime() || Date.now();
      return tA - tB;
    });
    
    return sorted[0]?.identity === localParticipant.identity;
  }, [localParticipant.identity, localParticipant.joinedAt, activeParticipants, remoteParticipants.length]);

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

  // Permission Logic
  useDataChannel((msg) => {
    const decoder = new TextDecoder();
    const payload = decoder.decode(msg.payload);
    if (payload === 'JOIN_APPROVED') setIsAdmitted(true);
  });

  useEffect(() => {
    if (isHost) {
      setIsAdmitted(true);
    } else {
      const meta = getMetadata(localParticipant);
      if (meta.pending === false) setIsAdmitted(true);
    }

    // Once admitted, non-hosts update their metadata so everyone sees them as active
    if (isAdmitted && !isHost) {
      const meta = getMetadata(localParticipant);
      if (meta.pending !== false) {
        localParticipant.setMetadata(JSON.stringify({ ...meta, pending: false })).catch(err => {
          console.error("Failed to update admitted metadata", err);
        });
      }
    }
  }, [isHost, localParticipant.metadata]);

  const admitParticipant = (identity: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode('JOIN_APPROVED');
    localParticipant.publishData(data, {
      reliable: true,
      destinationIdentities: [identity],
    });
  };

  // Filter and Sort Tracks based on Google rules
  const processedTracks = useMemo(() => {
    // If no tracks yet, return empty
    if (!tracks || tracks.length === 0) return [];

    const filtered = tracks.filter(t => {
      // Ensure we always have a reference to the participant
      const isLocal = t.participant?.isLocal || (t.participant?.identity === localParticipant.identity && localParticipant.identity !== "");
      // 1. Admit Filter
      const p = activeParticipants.find(ap => ap.identity === t.participant?.identity);
      const isAdmittedOrLocal = !!p || isLocal;
      
      // 2. Hide Non-Video Filter
      if (hideNonVideo && !t.participant?.isCameraEnabled && !isLocal) return false;
      
      return isAdmittedOrLocal;
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
  }, [tracks, activeParticipants, pinnedIdentities, hideNonVideo, maxParticipants]);

  // Stacking Rule: 1:1 Floating Self-View
  const totalPeople = activeParticipants.length + 1;
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
          border-radius: 16px !important;
          overflow: hidden;
          position: relative;
          z-index: 1;
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
        .lk-participant-tile video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          background-color: #000 !important;
          border-radius: 16px !important;
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
            <div className="flex-1 flex flex-col items-center justify-center bg-[#202124] p-6 relative">
              <div className="w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative mb-8">
                {tracks.find(t => t.participant?.isLocal && t.source === Track.Source.Camera) ? (
                  <CustomParticipantTile 
                    trackRef={tracks.find(t => t.participant?.isLocal && t.source === Track.Source.Camera)} 
                    className="w-full h-full"
                  />
                ) : <div className="w-full h-full bg-black animate-pulse flex items-center justify-center text-slate-500">Starting camera...</div>}
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center p-6 backdrop-blur-sm">
                  <div className="w-12 h-12 border-4 border-[#8ab4f8] border-t-transparent rounded-full animate-spin mb-4" />
                  <h2 className="text-[24px] font-medium text-white">Asking to join...</h2>
                  <p className="text-[#9aa0a6] mt-2">Someone in the meeting will let you in soon.</p>
                </div>
              </div>
              <div className="absolute bottom-10 flex gap-4">
                <AudioLevelIndicator />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#202124] p-2 sm:p-4 overflow-hidden">
              <div className="lk-video-conference-inner w-full max-w-[1600px] mx-auto h-full flex items-center justify-center">
                {effectiveLayout === 'spotlight' && focusTrack ? (
                  <div className="w-full h-full p-4 animate-in fade-in zoom-in-95 duration-700 spotlight-view">
                    <CustomParticipantTile trackRef={focusTrack} className="w-full h-full" />
                  </div>
                ) : effectiveLayout === 'sidebar' && focusTrack ? (
                  <div className="flex w-full h-full gap-4 animate-in fade-in duration-700">
                    <div className="flex-[3] h-full relative">
                      <CustomParticipantTile trackRef={focusTrack} className="w-full h-full" />
                    </div>
                    <div className="w-[240px] h-full overflow-y-auto custom-scroll space-y-3 pr-2 hidden md:block">
                      {processedTracks.filter(t => t !== focusTrack).map(t => (
                        <div key={t.participant.identity} className="aspect-video w-full relative group">
                           <CustomParticipantTile trackRef={t} />
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
                  <GridLayout tracks={mainGridTracks} className="w-full h-full">
                    <CustomParticipantTile />
                  </GridLayout>
                )}
              </div>

              {/* FLOATING SELF-VIEW (PIPPED) */}
              {isOneOnOne && (
                <div className="absolute bottom-24 right-8 w-64 aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-white/10 z-[80] animate-in slide-in-from-bottom-4 duration-700">
                  <CustomParticipantTile 
                    trackRef={processedTracks.find(t => t.participant.isLocal)} 
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
                  {isHost && pendingParticipants.length > 0 && (
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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          {user?.photoURL ? (
                            <img src={user.photoURL} className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-[13px] font-bold">You</div>
                          )}
                          <span className="text-[14px] text-[#202124] font-medium">{localParticipant.identity} (You)</span>
                        </div>
                        {isHost && <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-bold text-blue-600 uppercase tracking-tight"><ShieldCheck size={12} /> Host</div>}
                      </div>
                      {activeParticipants.map(p => {
                        const meta = getMetadata(p);
                        return (
                          <div key={p.identity} className="flex items-center justify-between group py-1">
                            <div className="flex items-center gap-3">
                              {meta.avatar ? (
                                <img src={meta.avatar} className="w-9 h-9 rounded-full object-cover" />
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
 * --- CustomParticipantTile Component ---
 * A wrapper around ParticipantTile to allow for custom styling and behavior.
 */
function CustomParticipantTile({ trackRef, className, ...props }: any) {
  // Consume trackRef from context if not provided as a prop (essential for GridLayout)
  const trackRefFromContext = useMaybeTrackRefContext();
  const ref = trackRef || trackRefFromContext;

  // Guard: If no track reference exists yet, return an empty container to prevent crashes
  if (!ref) return <div className={`lk-participant-tile ${className}`} {...props} />;

  const participant = ref.participant;
  
  // Show avatar if:
  // 1. Participant has explicitly turned their camera off
  // 2. Or the track is currently muted
  // Note: We don't check for !ref.publication here because it can be null for a split second 
  // while joining, which causes the "black flash".
  const isVideoOff = !participant.isCameraEnabled || ref.publication?.isMuted;
  
  let avatarUrl = "";
  if (participant?.metadata) {
    try {
      const meta = JSON.parse(participant.metadata);
      avatarUrl = meta.avatar;
    } catch (e) {}
  }

  return (
    <div className={`relative w-full h-full overflow-hidden rounded-2xl ${className}`}>
      <ParticipantTile trackRef={ref} {...props} />
      
      {isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#3c4043] z-[10]">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={participant?.identity} 
              className="w-20 h-20 md:w-32 md:h-32 rounded-full object-cover border-4 border-white/5 shadow-2xl animate-in fade-in zoom-in duration-500" 
            />
          ) : (
            <div className="w-20 h-20 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl md:text-5xl font-bold text-white shadow-2xl animate-in fade-in zoom-in duration-500">
              {participant?.identity?.charAt(0).toUpperCase() || 'U'}
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