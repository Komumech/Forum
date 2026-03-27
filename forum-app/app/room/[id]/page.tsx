'use client';

import { useEffect, useState, useRef } from 'react';
import { 
  LiveKitRoom, 
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  GridLayout,
  ParticipantTile,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
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
  X
} from 'lucide-react';

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const room = params.id as string;
  
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 1. Initial Camera Preview for "Green Room"
  useEffect(() => {
    if (!isReady) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        }).catch(err => console.error("Camera access denied", err));
    }
  }, [isReady]);

  // 2. Fetch Token once user clicks "Join"
  const handleJoin = async () => {
    if (!name) return;
    try {
      const resp = await fetch(`/api/get-participant-token?room=${room}&username=${name}`);
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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 w-full relative aspect-video bg-[#202124] rounded-2xl overflow-hidden shadow-xl">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
               <button className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all"><Mic size={24} /></button>
               <button className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all"><VideoIcon size={24} /></button>
            </div>
          </div>

          <div className="w-full lg:w-[380px] space-y-8 text-center lg:text-left">
            <h1 className="text-4xl font-normal text-slate-800 tracking-tight">Ready to join?</h1>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Enter your name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-4 border-b-2 border-slate-200 focus:border-blue-600 outline-none text-xl transition-all"
              />
              <button 
                onClick={handleJoin}
                disabled={!name}
                className="w-full py-4 bg-blue-600 text-white rounded-full font-semibold shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all disabled:bg-slate-200 disabled:shadow-none"
              >
                Join now
              </button>
            </div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Powered by Forum</p>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: LOADING STATE ---
  if (token === "") {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- VIEW 3: ACTUAL MEETING ROOM ---
  return (
    <main className="h-screen bg-[#202124] overflow-hidden relative">
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
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'chat' | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* CSS for Active Speaker Glow */}
      <style jsx global>{`
        .lk-participant-tile[data-lk-speaking="true"] {
          border: 3px solid #1a73e8 !important;
          border-radius: 8px;
          box-shadow: 0 0 15px rgba(26, 115, 232, 0.5);
          transition: all 0.2s ease;
        }
        .lk-participant-tile {
          border: 2px solid transparent;
          transition: all 0.2s ease;
        }
        .lk-grid-layout {
          padding: 1rem;
          background-color: transparent;
        }
      `}</style>

      <div className="flex-1 relative flex flex-col">
        <div className="lk-video-conference flex-1">
        <div className="lk-video-conference-inner">
          <GridLayout tracks={tracks}>
            <ParticipantTile />
          </GridLayout>
        </div>
      </div>

        {/* TOP BRANDING BAR */}
        <div className="fixed top-4 left-6 z-50">
          <div className="flex items-center gap-2 bg-[#202124]/60 backdrop-blur-lg px-4 py-2 rounded-lg border border-white/10 shadow-2xl">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-lg">F</div>
            <span className="text-white text-sm font-medium tracking-tighter opacity-90 uppercase">FORUM | {room}</span>
          </div>
        </div>

        {/* CONTROL DOCK */}
        <div className="h-20 flex items-center justify-between px-8 z-50 bg-[#202124]">
          
          <div className="hidden lg:flex items-center text-white/90 text-sm font-medium gap-2">
            <span>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <span className="opacity-40">|</span>
            <span className="tracking-wide">{room}</span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
              className={`p-3.5 rounded-full transition-all ${!localParticipant.isMicrophoneEnabled ? 'bg-red-500 hover:bg-red-600' : 'bg-[#3c4043] hover:bg-[#4a4e51]'} text-white`}
            >
              {localParticipant.isMicrophoneEnabled ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            
            <button 
              onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
              className={`p-3.5 rounded-full transition-all ${!localParticipant.isCameraEnabled ? 'bg-red-500 hover:bg-red-600' : 'bg-[#3c4043] hover:bg-[#4a4e51]'} text-white`}
            >
              {localParticipant.isCameraEnabled ? <VideoIcon size={22} /> : <VideoOff size={22} />}
            </button>

            <button 
              onClick={() => setIsHandRaised(!isHandRaised)}
              className={`p-3.5 rounded-full transition-all ${isHandRaised ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-[#3c4043] hover:bg-[#4a4e51]'} text-white`}
            >
              <Hand size={22} />
            </button>

            <button 
              onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled)}
              className={`p-3.5 rounded-full transition-all ${localParticipant.isScreenShareEnabled ? 'bg-blue-500' : 'bg-[#3c4043] hover:bg-[#4a4e51]'} text-white`}
            >
              {localParticipant.isScreenShareEnabled ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
            </button>

            <button className="p-3.5 rounded-full bg-[#3c4043] hover:bg-[#4a4e51] text-white transition-all"><MoreVertical size={22} /></button>
            
            <button 
              onClick={() => router.push('/')}
              className="px-6 py-3 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white transition-all shadow-lg ml-4"
            >
              <PhoneOff size={24} />
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-1">
            <button 
              onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')}
              className={`p-3 rounded-full transition-all ${activeTab === 'info' ? 'text-blue-400 bg-blue-400/10' : 'text-white/70 hover:bg-white/10'}`}
            >
              <Info size={20} />
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'users' ? null : 'users')}
              className={`p-3 rounded-full transition-all ${activeTab === 'users' ? 'text-blue-400 bg-blue-400/10' : 'text-white/70 hover:bg-white/10'}`}
            >
              <Users size={20} />
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')}
              className={`p-3 rounded-full transition-all ${activeTab === 'chat' ? 'text-blue-400 bg-blue-400/10' : 'text-white/70 hover:bg-white/10'}`}
            >
              <MessageSquare size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR PANEL */}
      {activeTab && (
        <aside className="w-[360px] bg-white m-4 ml-0 rounded-2xl flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between p-6">
            <h2 className="text-xl font-normal text-slate-800 capitalize">
              {activeTab === 'info' ? 'Meeting details' : activeTab}
            </h2>
            <button 
              onClick={() => setActiveTab(null)}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 px-6 overflow-y-auto">
            {activeTab === 'info' && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2">Joining info</p>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-sm text-slate-700 break-all mb-4">https://forum.komumech.com/room/{room}</p>
                    <button className="text-blue-600 text-sm font-medium hover:underline">Copy joining info</button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'users' && (
              <p className="text-slate-400 text-center mt-20">Participant list will appear here</p>
            )}
            {activeTab === 'chat' && (
              <p className="text-slate-400 text-center mt-20">In-call messages will appear here</p>
            )}
          </div>
        </aside>
      )}

      <RoomAudioRenderer />
    </div>
  );
}