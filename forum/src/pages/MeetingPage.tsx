import * as React from 'react';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Whiteboard from '../components/Whiteboard.tsx';
import { 
  LiveKitRoom, 
  useConnectionState,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useChat,
  useRemoteParticipants,
  useDataChannel,
  TrackReferenceOrPlaceholder,
  MediaDeviceMenu,
  useIsSpeaking,
  ConnectionQualityIndicator,
  useVisualStableUpdate,
  useMediaDevices,
} from '@livekit/components-react';
import { isMobileBrowser } from '@livekit/components-core';
import { Track, ConnectionState, Participant, VideoPresets, ScreenSharePresets, LocalVideoTrack } from 'livekit-client';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Hand, 
  MonitorUp, MonitorOff, MoreVertical, Info, Users, MessageSquare,
  X, Send, ChevronDown, Settings, Copy, Check, Pin, PinOff,
  Layout as LayoutIcon, ShieldCheck, UserX, VolumeX, Monitor, ArrowLeftRight, ArrowLeft,
  Sparkles, Camera, Speaker, Headphones, Clock, Smile, Heart, Languages,
  ChevronUp, FileText, Plus, Search, Trash2, Archive, Save, LayoutGrid, Globe, Calendar, LayoutDashboard,
  Radio, Maximize2, Activity, CheckCheck, Cast, Sliders, Paperclip, ArrowDownToLine, Download
} from 'lucide-react';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import { SharedFileItem, SendFileDialog, SharedFileCard, FilesPanel } from '../components/FileTransfer';
import SettingsModal from '../components/SettingsModal';
import { useAuth } from '../context/AuthContext';
import { db, auth, komuDb, komuAuth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy, runTransaction, arrayUnion } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export default function MeetingPage() {
  const { id: room } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, preferences, updatePreferences, komuUser, komuLogin, login } = useAuth();
  
  const queryName = searchParams.get('name') || '';
  const storedGuestName = typeof window !== 'undefined' ? localStorage.getItem('forum_guest_username') || '' : '';
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState(queryName || preferences?.displayName || user?.displayName || storedGuestName || "");
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'chat' | 'settings' | 'waiting' | 'participants' | 'notes' | 'whiteboard' | 'files' | null>(null);
  const [isKomuToolsOpen, setIsKomuToolsOpen] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Device Detection for Pre-join
  const videoDevices = useMediaDevices({ kind: 'videoinput' });
  const audioDevices = useMediaDevices({ kind: 'audioinput' });
  const speakerDevices = useMediaDevices({ kind: 'audiooutput' });

  useEffect(() => {
    const fetchDetails = async () => {
      if (!room) return;
      try {
        const q = query(collection(db, 'meetings'), where('roomId', '==', room));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setMeetingDetails(snap.docs[0].data());
        }
      } catch (err) {
        console.error("Failed to fetch meeting details:", err);
      }
    };
    fetchDetails();
  }, [room]);

  useEffect(() => {
    if (queryName) {
      setName(queryName);
    } else if (preferences?.displayName) {
      setName(preferences.displayName);
    } else if (user?.displayName && !name) {
      setName(user.displayName);
    }
  }, [user, preferences, queryName]);

  const [preJoinMic, setPreJoinMic] = useState(true);
  const [preJoinCam, setPreJoinCam] = useState(false); // Default to false or user-requested, gracefully enabled on mount if allowed
  const [preJoinBg, setPreJoinBg] = useState<'none' | 'blur' | 'image'>('none');
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);

  // 1. Initial Camera Preview for "Green Room" (Safe non-blocking)
  useEffect(() => {
    let isCancelled = false;

    if (!isReady) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraPermissionError("Camera not supported on this browser.");
        return;
      }

      if (!preJoinCam) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (isCancelled) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
          setCameraPermissionError(null);
        }).catch(err => {
          console.warn("Camera preview unavailable or permission dismissed:", err?.name || err?.message);
          if (!isCancelled) {
            setCameraPermissionError("Camera access not enabled. You can join with camera off or allow camera access in your browser.");
            setPreJoinCam(false);
          }
        });
    }

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isReady, preJoinCam]);

  const requestCameraAccess = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraPermissionError(null);
      setPreJoinCam(true);
    } catch (err: any) {
      console.warn("Camera permission request rejected:", err?.message || err);
      setCameraPermissionError("Camera permission denied. Please allow camera permissions in browser settings if you wish to use video.");
      setPreJoinCam(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim() || !room || isJoining) return;
    setIsJoining(true);
    setJoinError(null);
    
    // Save guest name for convenience
    try {
      localStorage.setItem('forum_guest_username', name.trim());
    } catch (e) {}

    // Update presence to Busy if user is authenticated
    if (user) {
      try {
        await setDoc(doc(db, 'userProfiles', user.uid), { status: 'busy' }, { merge: true });
      } catch (err) {
        console.warn("Could not update user profile status:", err);
      }
    }

    console.log(`[MeetingPage] Attempting to join room: ${room} as ${name}`);
    try {
      // Proactive host check for metadata
      const isLocalStorageHost = typeof window !== 'undefined' && (localStorage.getItem(`forum_room_host_${room}`) === 'true');
      const isAdmin = user?.email === "komumech@gmail.com";
      const isScheduledHost = meetingDetails && (meetingDetails.hostId === user?.uid || meetingDetails.hostEmail === user?.email);
      const hostDetected = !!(isAdmin || isScheduledHost || isLocalStorageHost);

      const metadata = JSON.stringify({ 
        pending: !hostDetected, // Hosts are never pending
        avatar: user?.photoURL || "",
        isHost: hostDetected
      });

      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;

      const uniqueIdentity = `${name.trim()}#${Math.floor(1000 + Math.random() * 9000)}`;
      const getUrl = `/api/get-participant-token?room=${encodeURIComponent(room)}&username=${encodeURIComponent(uniqueIdentity)}&metadata=${encodeURIComponent(metadata)}`;
      
      console.log(`[MeetingPage] Fetching token from: ${getUrl}`);

      let tokenData: any = null;
      let lastFetchErr: any = null;

      // Resilient fetch with up to 3 attempts
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Try GET first
          const resp = await fetch(getUrl, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
          });

          if (resp.ok) {
            tokenData = await resp.json();
            if (tokenData?.token) break;
          } else {
            // Try POST fallback
            const postResp = await fetch('/api/get-participant-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({
                room,
                username: uniqueIdentity,
                metadata
              })
            });
            if (postResp.ok) {
              tokenData = await postResp.json();
              if (tokenData?.token) break;
            }
          }
        } catch (fetchErr) {
          lastFetchErr = fetchErr;
          console.warn(`[MeetingPage] Token fetch attempt ${attempt} failed:`, fetchErr);
          if (attempt < 3) {
            await new Promise(res => setTimeout(res, 500 * attempt));
          }
        }
      }

      if (!tokenData?.token) {
        throw new Error(lastFetchErr?.message || "Could not retrieve access token from the conference server. Please check your connection and retry.");
      }

      console.log(`[MeetingPage] Token received successfully, connecting to LiveKit...`);
      setToken(tokenData.token);
      setIsReady(true);

      // Save last room to preferences if user is authenticated
      if (user) {
        updatePreferences({ 
          lastRoom: room, 
          lastJoinedAt: new Date().toISOString() 
        });
      }
    } catch (e: any) {
      console.error("[MeetingPage] Join Error:", e);
      setJoinError(e?.message || "Failed to connect to conference room. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#f4f5f6] flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-8 lg:gap-12 bg-white p-6 sm:p-10 md:p-12 rounded-[28px] shadow-xl border border-gray-100/80">
          <div className="flex-1 w-full relative aspect-video bg-bg-dark rounded-2xl overflow-hidden shadow-inner group">
            <div className="relative w-full h-full flex items-center justify-center">
              {preJoinCam && !cameraPermissionError ? (
                <video ref={videoRef} autoPlay muted playsInline className={cn("scale-x-[-1] w-full h-full object-cover", preJoinBg === 'blur' && "blur-md")} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#121824] to-[#1e293b] p-6 text-center space-y-3">
                  <div className="w-20 h-20 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                    {name.charAt(0).toUpperCase() || "?"}
                  </div>
                  {cameraPermissionError ? (
                    <div className="space-y-2 max-w-sm">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-semibold border border-amber-500/20">
                        <VideoOff size={14} />
                        <span>Camera Off / Permission Needed</span>
                      </div>
                      <p className="text-slate-400 text-xs">
                        You can join the room without video, or allow camera permissions in your browser.
                      </p>
                      <button
                        type="button"
                        onClick={requestCameraAccess}
                        className="mt-1 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-md"
                      >
                        Enable Camera
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs font-medium">Camera is currently off</p>
                  )}
                </div>
              )}
            </div>
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 transition-opacity z-10">
               <button 
                type="button"
                onClick={() => setPreJoinMic(!preJoinMic)}
                className={cn(
                  "p-3.5 rounded-full backdrop-blur-md border border-white/15 shadow-xl transition-all",
                  preJoinMic ? "bg-slate-800/90 text-white hover:bg-slate-700" : "bg-red-600 text-white hover:bg-red-500"
                )}
                title={preJoinMic ? "Mute Microphone" : "Unmute Microphone"}
               >
                {preJoinMic ? <Mic size={20} /> : <MicOff size={20} />}
               </button>
               <button 
                type="button"
                onClick={() => {
                  if (!preJoinCam && cameraPermissionError) {
                    requestCameraAccess();
                  } else {
                    setPreJoinCam(!preJoinCam);
                  }
                }}
                className={cn(
                  "p-3.5 rounded-full backdrop-blur-md border border-white/15 shadow-xl transition-all",
                  preJoinCam ? "bg-slate-800/90 text-white hover:bg-slate-700" : "bg-red-600 text-white hover:bg-red-500"
                )}
                title={preJoinCam ? "Turn Camera Off" : "Turn Camera On"}
               >
                {preJoinCam ? <VideoIcon size={20} /> : <VideoOff size={20} />}
               </button>
               {preJoinCam && (
                 <button 
                  type="button"
                  onClick={() => setPreJoinBg(preJoinBg === 'none' ? 'blur' : 'none')}
                  className={cn(
                    "p-3.5 rounded-full backdrop-blur-md border border-white/15 shadow-xl transition-all",
                    preJoinBg !== 'none' ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-800/90 text-white hover:bg-slate-700"
                  )}
                  title="Toggle Blur Effect"
                 >
                  <Sparkles size={20} />
                 </button>
               )}
            </div>

            {preJoinCam && videoDevices.length > 0 && (
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                <select 
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    navigator.mediaDevices?.getUserMedia({ video: { deviceId } })
                      .then(stream => {
                        streamRef.current = stream;
                        if (videoRef.current) videoRef.current.srcObject = stream;
                      })
                      .catch(err => {
                        console.warn("Could not switch camera preview device:", err);
                      });
                  }}
                  className="bg-black/70 text-white text-xs p-2 rounded-lg border border-white/15 outline-none backdrop-blur-md"
                >
                  <option value="">Default Camera</option>
                  {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="w-full lg:w-[380px] space-y-6 text-center lg:text-left">
            <div>
              <div className="flex items-center gap-2 text-accent-blue text-xs font-bold mb-3">
                {user ? (
                  <>
                    <ShieldCheck size={14} />
                    <span>Signed in as {user.displayName || user.email}</span>
                  </>
                ) : (
                  <>
                    <Globe size={14} />
                    <span>Guest Mode • No sign-in required</span>
                  </>
                )}
              </div>

              <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                {meetingDetails?.title || "Ready to join?"}
              </h1>
              {meetingDetails && (
                <p className="text-gray-500 text-sm mb-1">
                  Hosted by <span className="font-bold text-accent-blue">{meetingDetails.hostName}</span>
                </p>
              )}
              <p className="text-gray-500 text-sm">Room: <span className="font-mono font-bold text-accent-blue">{room}</span></p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className="space-y-4">
              {joinError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                  {joinError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 text-left">
                  Your Username / Display Name <span className="text-accent-red">*</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Enter your username" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isJoining}
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-accent-blue focus:border-accent-blue outline-none text-sm font-semibold transition-all text-gray-900 placeholder:text-gray-400 disabled:opacity-60"
                />
              </div>

              <button 
                type="submit"
                disabled={!name.trim() || isJoining}
                className="w-full py-3.5 bg-accent-blue text-white rounded-xl font-bold text-sm hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-blue/20 flex items-center justify-center gap-2"
              >
                {isJoining ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Connecting to meeting...</span>
                  </>
                ) : (
                  <span>Join meeting now</span>
                )}
              </button>

              {!user && (
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>Want to save notes & meetings?</span>
                  <button 
                    type="button" 
                    onClick={login}
                    className="font-bold text-accent-blue hover:underline"
                  >
                    Sign in with Google
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (token === "") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-light">
        <div className="w-10 h-10 border-[3px] border-accent-blue border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const serverUrl = import.meta.env.VITE_LIVEKIT_URL || "https://forum-xchlx8up.livekit.cloud";

  return (
    <main className="h-[100dvh] dark-theme overflow-hidden">
    <LiveKitRoom
      video={false}
      audio={false}
      token={token}
      serverUrl={serverUrl}
      connect={true}
      onDisconnected={() => navigate('/')}
      className="h-full w-full"
    >
      <div className="flex flex-col h-full relative">
        <MeetingRoomHeader 
          room={room || ""} 
          isRecording={isRecording} 
          setIsRecording={setIsRecording} 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isKomuToolsOpen={isKomuToolsOpen}
          setIsKomuToolsOpen={setIsKomuToolsOpen}
        />
        <MeetingRoomContent 
          room={room || ""} 
          videoDevices={videoDevices} 
          audioDevices={audioDevices} 
          speakerDevices={speakerDevices}
          initialBg={preJoinBg}
          initialMic={preJoinMic}
          initialCam={preJoinCam}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isKomuToolsOpen={isKomuToolsOpen}
          setIsKomuToolsOpen={setIsKomuToolsOpen}
          meetingDetails={meetingDetails}
        />
      </div>
    </LiveKitRoom>
    </main>
  );
}

function MeetingRoomHeader({ room, isRecording, setIsRecording, activeTab, setActiveTab, isKomuToolsOpen, setIsKomuToolsOpen }: { room: string, isRecording: boolean, setIsRecording: (v: boolean) => void, activeTab: any, setActiveTab: (t: any) => void, isKomuToolsOpen: boolean, setIsKomuToolsOpen: (v: boolean) => void }) {
  const [isAppsOpen, setIsAppsOpen] = useState(false);

  const apps = [
    { name: 'Search', url: 'https://komu-search.streamlit.app/', icon: <Search size={24} />, color: 'bg-blue-500' },
    { name: 'Dashboard', url: 'https://komuthemedashboard.vercel.app/', icon: <LayoutDashboard size={24} />, color: 'bg-indigo-500' },
    { name: 'Calendar', url: 'https://komucalendar.vercel.app/', icon: <img src="https://komuhost.vercel.app/calendarlogo.png" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />, color: 'bg-red-500' },
    { name: 'Notes', url: 'https://komunotes.vercel.app/', icon: <FileText size={24} />, color: 'bg-yellow-500' },
    { name: 'Forum', url: 'https://forum-bykomu.vercel.app/', icon: <img src="https://komuhost.vercel.app/favicon.ico" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />, color: 'bg-green-500' },
  ];

  return (
    <header className="fixed top-3.5 left-4 right-4 sm:left-6 sm:right-6 flex items-center justify-between z-30 pointer-events-none">
      <div className="flex items-center gap-3 pointer-events-auto">
        <div className="relative">
          <button 
            onClick={() => setIsKomuToolsOpen(!isKomuToolsOpen)} 
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white border border-white/15 shadow-xl backdrop-blur-md transition-all duration-200 ease-out cursor-pointer"
          >
            <Settings size={18} className="text-slate-300" />
            <span>Tools</span>
            <ChevronDown size={16} className={cn("transition-transform duration-200 text-slate-400", isKomuToolsOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {isKomuToolsOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                className="absolute top-[48px] left-0 z-[95] w-56 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700 shadow-2xl p-2"
              >
                <button 
                  onClick={() => { setActiveTab(activeTab === 'notes' ? null : 'notes'); setIsKomuToolsOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl text-sm transition-colors cursor-pointer",
                    activeTab === 'notes' ? "text-blue-400 bg-blue-600/10" : "text-white"
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", activeTab === 'notes' ? "bg-blue-600 text-white" : "bg-blue-600/20 text-blue-400")}>
                    <FileText size={18} />
                  </div>
                  <span>Notes</span>
                </button>
                <button 
                  onClick={() => { setActiveTab(activeTab === 'whiteboard' ? null : 'whiteboard'); setIsKomuToolsOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl text-sm transition-colors mt-1 cursor-pointer",
                    activeTab === 'whiteboard' ? "text-blue-400 bg-blue-600/10" : "text-white"
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", activeTab === 'whiteboard' ? "bg-blue-600 text-white" : "bg-blue-600/20 text-blue-400")}>
                    <Monitor size={18} />
                  </div>
                  <span>Whiteboard & Workspace</span>
                </button>
                <div className="h-px bg-white/10 my-2" />
                <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Komu Workspace Tools</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center gap-3 pointer-events-auto">
        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-full text-xs font-bold border border-red-500/30 backdrop-blur-md shadow-md">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span>REC</span>
          </div>
        )}
        <div className="relative">
          <button 
            onClick={() => setIsAppsOpen(!isAppsOpen)}
            className="w-10 h-10 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/15 shadow-xl backdrop-blur-md flex items-center justify-center transition-all cursor-pointer"
            title="Komu Apps"
          >
            <LayoutGrid size={20} />
          </button>
          
          <AnimatePresence>
            {isAppsOpen && (
              <>
                <div className="fixed inset-0 z-[90]" onClick={() => setIsAppsOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute top-12 right-0 z-[100] w-[320px] bg-white rounded-3xl shadow-2xl border border-gray-100 p-6"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {apps.map((app) => (
                      <a 
                        key={app.name}
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center p-3 rounded-2xl hover:bg-gray-50 transition-all group"
                      >
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-2 shadow-sm group-hover:shadow-md transition-shadow bg-gray-50 text-gray-600")}>
                          {app.icon}
                        </div>
                        <span className="text-[11px] font-bold text-gray-600 group-hover:text-gray-900">{app.name}</span>
                      </a>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function MeetingRoomContent({ room, videoDevices, audioDevices, speakerDevices, initialBg, initialMic, initialCam, activeTab, setActiveTab, isKomuToolsOpen, setIsKomuToolsOpen, meetingDetails }: { room: string, videoDevices: MediaDeviceInfo[], audioDevices: MediaDeviceInfo[], speakerDevices: MediaDeviceInfo[], initialBg: 'none' | 'blur' | 'image', initialMic: boolean, initialCam: boolean, activeTab: any, setActiveTab: (t: any) => void, isKomuToolsOpen: boolean, setIsKomuToolsOpen: (v: boolean) => void, meetingDetails: any }) {
  const navigate = useNavigate();
  const { user, loading, komuUser } = useAuth();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send: sendChat } = useChat();
  const connectionState = useConnectionState();
  const { send: sendHandRaise, message: handRaiseMessage } = useDataChannel("hand-raise");
  const { send: sendReactionData, message: reactionMessage } = useDataChannel("reaction");
  
  const isLocalStorageHost = typeof window !== 'undefined' && (localStorage.getItem(`forum_room_host_${room}`) === 'true');
  const isAdmin = user?.email === "komumech@gmail.com";
  const isScheduledHost = meetingDetails && (meetingDetails.hostId === user?.uid || meetingDetails.hostEmail === user?.email);
  const initialHostStatus = !!(isAdmin || isScheduledHost || isLocalStorageHost);

  const [isHost, setIsHost] = useState(initialHostStatus);
  const [isAdmitted, setIsAdmitted] = useState(() => {
    if (initialHostStatus) return true;
    if (meetingDetails?.waitingRoom === true) return false;
    return true; // Direct join by default for instant rooms
  });
  const [isMicEnabled, setIsMicEnabled] = useState(initialMic);
  const [isCamEnabled, setIsCamEnabled] = useState(initialCam);
  const [layoutMode, setLayoutMode] = useState<'auto' | 'tiled' | 'sidebar' | 'spotlight' | 'imo'>('auto');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isTranscriptActive, setIsTranscriptActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [spotlightIdentity, setSpotlightIdentity] = useState<string | null>(null);

  // Load initial settings from Dashboard/Settings
  useEffect(() => {
    if (user?.uid) {
      const saved = localStorage.getItem(`settings_${user.uid}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.muteOnJoin) setIsMicEnabled(false);
        if (parsed.videoOffOnJoin) setIsCamEnabled(false);
      }
    }
  }, [user]);

  // Re-sync if state was false but user/details loaded later
  useEffect(() => {
    const isLocal = typeof window !== 'undefined' && (localStorage.getItem(`forum_room_host_${room}`) === 'true');
    const isUserAdmin = user?.email === "komumech@gmail.com";
    const isSchedHost = meetingDetails && (meetingDetails.hostId === user?.uid || meetingDetails.hostEmail === user?.email);
    if (isUserAdmin || isSchedHost || isLocal) {
      setIsHost(true);
      setIsAdmitted(true);
    }
  }, [user, meetingDetails, room]);

  // Handle admission data message
  const { send: sendAdmit } = useDataChannel("admit-user", (msg) => {
    try {
      const raw = new TextDecoder().decode(msg.payload);
      if (raw === "admitted") {
        console.log("[MeetingPage] Admission received via Data Channel string");
        setIsAdmitted(true);
        return;
      }
      const data = JSON.parse(raw);
      const myId = localParticipant?.identity || "";
      const myBase = myId.split('#')[0];
      if (data.action === 'admit-all' || data.identity === myId || data.identity === myBase || data.baseName === myBase) {
        console.log("[MeetingPage] Admission received via Data Channel JSON:", data);
        setIsAdmitted(true);
      }
    } catch {
      // Fallback
      setIsAdmitted(true);
    }
  });

  // Track admission state to metadata
  useEffect(() => {
    if (isAdmitted && localParticipant && connectionState === ConnectionState.Connected) {
      try {
        localParticipant.setMetadata(JSON.stringify({
          pending: false,
          avatar: user?.photoURL || "",
          isHost: isHost
        }));
      } catch (e) {
        console.warn("Could not set localParticipant metadata:", e);
      }
    }
  }, [isAdmitted, localParticipant, isHost, user, connectionState]);
  const [pendingParticipants, setPendingParticipants] = useState<Participant[]>([]);
  const [admittedSids, setAdmittedSids] = useState<Set<string>>(new Set());
  const [lobbyEnabled, setLobbyEnabled] = useState(false);

  // Apply initial mic/cam settings safely once connection is established
  const hasAppliedInitialMediaRef = useRef(false);
  useEffect(() => {
    if (!localParticipant || connectionState !== ConnectionState.Connected || hasAppliedInitialMediaRef.current) return;
    hasAppliedInitialMediaRef.current = true;

    const savedSettings = user?.uid ? localStorage.getItem(`settings_${user.uid}`) : null;
    const parsed = savedSettings ? JSON.parse(savedSettings) : null;
    
    if (initialMic && parsed?.muteOnJoin !== true) {
      localParticipant.setMicrophoneEnabled(true).catch(err => {
        console.warn("Could not enable microphone on join:", err?.message || err);
      });
    }
    
    if (initialCam && parsed?.videoOffOnJoin !== true) {
      localParticipant.setCameraEnabled(true).catch(err => {
        console.warn("Could not enable camera on join:", err?.message || err);
      });
    }
  }, [localParticipant, connectionState, initialMic, initialCam, user]);

  // Waiting Room Logic
  useEffect(() => {
    if (!localParticipant || !room || loading) return;

    // Host Election & Admission Check
    const initializeRoom = async () => {
      if (!room || !localParticipant.identity) return;
      const myIdentity = localParticipant.identity;
      const myBaseName = myIdentity.split('#')[0];
      const roomRef = doc(db, 'rooms', room);

      try {
        // 1. Fetch meeting record if available
        let scheduledHostInfo = meetingDetails;
        if (!scheduledHostInfo) {
          const meetingsRef = collection(db, 'meetings');
          const qMeeting = query(meetingsRef, where('roomId', '==', room));
          const meetingSnap = await getDocs(qMeeting);
          if (!meetingSnap.empty) {
            scheduledHostInfo = meetingSnap.docs[0].data();
          }
        }

        // 2. Sync room state with transaction
        const isLocalHost = typeof window !== 'undefined' && (localStorage.getItem(`forum_room_host_${room}`) === 'true');
        const roomData = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(roomRef);
          if (snap.exists()) {
            return snap.data();
          }
          // Prioritize the scheduled host, local creator flag, or current user
          const initialHostId = scheduledHostInfo?.hostId || scheduledHostInfo?.hostEmail || (user ? (user.uid || user.email) : myIdentity);
          const defaultData = { 
            hostId: initialHostId,
            hostName: user?.displayName || myBaseName,
            createdAt: Date.now(),
            lobby: scheduledHostInfo?.waitingRoom === true ? true : false,
            admittedList: [initialHostId, myIdentity, myBaseName].filter(Boolean)
          };
          transaction.set(roomRef, defaultData);
          return defaultData;
        });

        if (!roomData) return;
        const currentLobby = roomData.lobby === true;
        setLobbyEnabled(currentLobby);

        // 3. Determine if I am the host
        const isUserAdmin = user?.email === "komumech@gmail.com";
        const isSchedHost = scheduledHostInfo && (scheduledHostInfo.hostId === user?.uid || scheduledHostInfo.hostEmail === user?.email);
        const isElectedHost = isLocalHost || 
                              (user && (roomData.hostId === user.uid || roomData.hostId === user.email)) || 
                              roomData.hostId === myIdentity ||
                              roomData.hostName === myBaseName;

        const amIHost = !!(isUserAdmin || isSchedHost || isElectedHost);

        if (amIHost) {
          console.log("[MeetingPage] Recognized as host for room:", room);
          setIsHost(true);
          setIsAdmitted(true);
          try {
            localParticipant.setMetadata(JSON.stringify({
              pending: false,
              avatar: user?.photoURL || "",
              isHost: true
            }));
          } catch (e) {}
        } else {
          // Check if already admitted in doc or subcollection
          const admittedInRoom = !currentLobby || 
                                 roomData.admittedList?.includes(myIdentity) || 
                                 roomData.admittedList?.includes(myBaseName) ||
                                 (user?.uid && roomData.admittedList?.includes(user.uid)) ||
                                 (user?.email && roomData.admittedList?.includes(user.email));

          const sanitizedId = encodeURIComponent(myIdentity).replace(/\./g, '_');
          const admittedRef = doc(db, 'rooms', room, 'admitted', sanitizedId);
          const admittedSnap = await getDoc(admittedRef);

          if (admittedInRoom || admittedSnap.exists()) {
            console.log("[MeetingPage] Admitted to room:", room);
            setIsAdmitted(true);
            try {
              localParticipant.setMetadata(JSON.stringify({
                pending: false,
                avatar: user?.photoURL || "",
                isHost: false
              }));
            } catch (e) {}
          } else {
            console.log("[MeetingPage] Waiting in lobby for host admission...");
            setIsAdmitted(false);
          }
        }
      } catch (err) {
        console.error("Room initialization error (fallback to admitted):", err);
        setIsAdmitted(true);
      }
    };

    initializeRoom();

    // Listen for room changes (lobby toggle & admittedList updates)
    const roomRef = doc(db, 'rooms', room);
    const unsubRoom = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const isLobby = data.lobby === true;
        setLobbyEnabled(isLobby);
        
        const myIdentity = localParticipant.identity || "";
        const myBaseName = myIdentity.split('#')[0];
        const isAdmittedByDoc = !isLobby || 
          data.admittedList?.includes(myIdentity) || 
          data.admittedList?.includes(myBaseName) ||
          (user?.uid && data.admittedList?.includes(user.uid)) ||
          (user?.email && data.admittedList?.includes(user.email));

        if (isAdmittedByDoc) {
          setIsAdmitted(true);
          try {
            localParticipant.setMetadata(JSON.stringify({
              pending: false,
              avatar: user?.photoURL || "",
              isHost: isHost
            }));
          } catch (e) {}
        }
      }
    });

    // Listen for subcollection admission
    let unsubAdmit = () => {};
    if (room && localParticipant && localParticipant.identity) {
      const myIdentity = localParticipant.identity;
      const sanitizedId = encodeURIComponent(myIdentity).replace(/\./g, '_');
      const admittedRef = doc(db, 'rooms', room, 'admitted', sanitizedId);
      unsubAdmit = onSnapshot(admittedRef, (docSnap) => {
        if (docSnap.exists()) {
          console.log("[MeetingPage] Admission detected via Firestore for:", myIdentity);
          setIsAdmitted(true);
          try {
            localParticipant.setMetadata(JSON.stringify({
              pending: false,
              avatar: user?.photoURL || "",
              isHost: isHost
            }));
          } catch (e) {}
        }
      });
    }

    return () => {
      unsubRoom();
      unsubAdmit();
    };
  }, [localParticipant, localParticipant?.identity, room, user, loading, initialMic, initialCam, isHost, meetingDetails]);

  // Host: Listen for pending participants
  useEffect(() => {
    if (!isHost) return;
    
    const pending = remoteParticipants.filter(p => {
      if (admittedSids.has(p.sid)) return false;
      try {
        const meta = JSON.parse(p.metadata || "{}");
        return meta.pending === true && meta.isHost !== true;
      } catch {
        return false;
      }
    });
    setPendingParticipants(pending);
  }, [remoteParticipants, isHost, admittedSids]);

  const admitUser = async (participant: Participant) => {
    if (!room || !isHost) return;
    const participantIdentity = participant.identity;
    if (!participantIdentity) return;
    const baseName = participantIdentity.split('#')[0];

    try {
      // 1. Immediate local state update for fast UI response
      setAdmittedSids(prev => new Set(prev).add(participant.sid));

      // 2. Add to Firestore subcollection with sanitized key
      const sanitizedId = encodeURIComponent(participantIdentity).replace(/\./g, '_');
      const admittedRef = doc(db, 'rooms', room, 'admitted', sanitizedId);
      await setDoc(admittedRef, { 
        identity: participantIdentity,
        name: baseName,
        admittedAt: serverTimestamp() 
      });

      // 3. Add to room doc admittedList
      const roomRef = doc(db, 'rooms', room);
      await setDoc(roomRef, {
        admittedList: arrayUnion(participantIdentity, baseName, sanitizedId)
      }, { merge: true });
      
      // 4. Send direct data channel broadcast
      sendAdmit(new TextEncoder().encode(JSON.stringify({
        action: 'admit',
        identity: participantIdentity,
        baseName
      })), { reliable: true });

      // Direct fallback string
      sendAdmit(new TextEncoder().encode("admitted"), { reliable: true });
    } catch (err) {
      console.error("Admit user error:", err);
    }
  };

  const admitAllUsers = async () => {
    if (!room || !isHost || pendingParticipants.length === 0) return;
    try {
      const allSids = new Set(admittedSids);
      const allIdentities: string[] = [];

      for (const p of pendingParticipants) {
        allSids.add(p.sid);
        if (p.identity) {
          allIdentities.push(p.identity);
          allIdentities.push(p.identity.split('#')[0]);
          const sanitizedId = encodeURIComponent(p.identity).replace(/\./g, '_');
          allIdentities.push(sanitizedId);
          const admittedRef = doc(db, 'rooms', room, 'admitted', sanitizedId);
          setDoc(admittedRef, { identity: p.identity, admittedAt: serverTimestamp() }).catch(() => {});
        }
      }

      setAdmittedSids(allSids);

      const roomRef = doc(db, 'rooms', room);
      await setDoc(roomRef, {
        admittedList: arrayUnion(...allIdentities)
      }, { merge: true });

      sendAdmit(new TextEncoder().encode(JSON.stringify({ action: 'admit-all' })), { reliable: true });
      sendAdmit(new TextEncoder().encode("admitted"), { reliable: true });
    } catch (err) {
      console.error("Admit all users error:", err);
    }
  };
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");

  const rawTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );

  const lastSpotlightChangeRef = useRef<number>(0);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const [transcriptions, setTranscriptions] = useState<{ id: string, identity: string, text: string, timestamp: number }[]>([]);
  const [localTranscript, setLocalTranscript] = useState("");
  const [isMicMenuOpen, setIsMicMenuOpen] = useState(false);
  const [isCamMenuOpen, setIsCamMenuOpen] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatRecipient, setChatRecipient] = useState<string>("everyone");
  const [copied, setCopied] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tracks = useVisualStableUpdate(rawTracks, 16);
  const isMobile = useMemo(() => typeof window !== 'undefined' && isMobileBrowser(), []);

  const [pinnedIdentities, setPinnedIdentities] = useState<Set<string>>(new Set());
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(16);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [mobilePrimaryIdentity, setMobilePrimaryIdentity] = useState<string | null>(null);
  const [mobileOverlaySide, setMobileOverlaySide] = useState<'right' | 'left'>('right');
  const [autoSaveTranscript, setAutoSaveTranscript] = useState(false);
  const [transcriptNoteId, setTranscriptNoteId] = useState<string | null>(null);
  const transcriptNoteIdRef = useRef<string | null>(null);
  const isCreatingTranscriptRef = useRef(false);
  const transcriptQueueRef = useRef<string[]>([]);
  const transcriptBufferRef = useRef<string[]>([]);
  const lastFlushTimeRef = useRef<number>(0);
  const flushIntervalRef = useRef<any>(null);

  // Settings
  const [settingsCategory, setSettingsCategory] = useState<'video' | 'audio' | 'streaming' | 'general' | 'effects' | 'captions' | 'reactions'>('video');
  const [videoMirroring, setVideoMirroring] = useState(true);
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [showParticipantNames, setShowParticipantNames] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [showClock, setShowClock] = useState(true);
  const [selectedResolution, setSelectedResolution] = useState<'360p' | '720p'>('720p');
  const [selectedBg, setSelectedBg] = useState<'none' | 'blur' | 'image'>(initialBg || 'none');
  const [selectedBgImage, setSelectedBgImage] = useState('https://picsum.photos/seed/office/1920/1080');
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reactions, setReactions] = useState<{ id: number, emoji: string, x: number }[]>([]);
  const [isReactionsMenuOpen, setIsReactionsMenuOpen] = useState(false);

  // Isolated Feed & Stream Monitor State
  interface FeedExportItem {
    id: string;
    token: string;
    roomId: string;
    participantIdentity: string;
    participantName: string;
    isLocal?: boolean;
    createdAt: number;
    active: boolean;
    revokedAt?: number;
  }

  const [feedExports, setFeedExports] = useState<FeedExportItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    participant: Participant;
    isLocal: boolean;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [streamProfile, setStreamProfile] = useState<'standard' | 'high'>('standard');
  const [copiedExportId, setCopiedExportId] = useState<string | null>(null);
  const [liveFps, setLiveFps] = useState<number>(30);
  const [liveResolution, setLiveResolution] = useState<string>("1280 × 720");
  const [liveBitrate, setLiveBitrate] = useState<string>("1.8 Mbps");

  // Shared In-Call Files State
  const [sharedFiles, setSharedFiles] = useState<SharedFileItem[]>([]);
  const [isSendFileDialogOpen, setIsSendFileDialogOpen] = useState(false);
  const [sendFileTarget, setSendFileTarget] = useState<string | undefined>(undefined);
  const [fileTransferToast, setFileTransferToast] = useState<{ id: string; name: string; size: number; senderName: string; downloadUrl?: string } | null>(null);
  const [chatSubTab, setChatSubTab] = useState<'messages' | 'files'>('messages');
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isBottomHovered, setIsBottomHovered] = useState(false);
  const incomingChunksRef = useRef<Map<string, { meta: any; chunks: string[] }>>(new Map());

  // Available remote participant options for direct file sending
  const participantOptions = useMemo(() => {
    return remoteParticipants.map(p => ({
      identity: p.identity,
      name: p.identity.split('#')[0]
    }));
  }, [remoteParticipants]);

  // Data Channel: In-Call File Transfer receiver
  const { send: sendFilePayload } = useDataChannel("file-transfer", (msg) => {
    try {
      const payloadText = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(payloadText);

      // Check if message is addressed to me (or to everyone)
      if (data.targetIdentity && data.targetIdentity !== localParticipant.identity && data.senderIdentity !== localParticipant.identity) {
        return; // Targeted private file not intended for this client
      }

      if (data.type === 'file-meta') {
        incomingChunksRef.current.set(data.fileId, {
          meta: data,
          chunks: new Array(data.totalChunks)
        });

        setSharedFiles(prev => {
          if (prev.some(f => f.id === data.fileId)) return prev;
          return [{
            id: data.fileId,
            name: data.fileName,
            size: data.fileSize,
            type: data.fileType,
            senderIdentity: data.senderIdentity,
            senderName: data.senderName,
            targetIdentity: data.targetIdentity,
            targetName: data.targetName,
            progress: 0,
            status: 'receiving',
            timestamp: data.timestamp || Date.now(),
            isOutgoing: false
          }, ...prev];
        });
      } else if (data.type === 'file-chunk') {
        const item = incomingChunksRef.current.get(data.fileId);
        if (item) {
          item.chunks[data.index] = data.chunk;
          const receivedCount = item.chunks.filter(Boolean).length;
          const progress = Math.round((receivedCount / item.meta.totalChunks) * 100);

          setSharedFiles(prev => prev.map(f => {
            if (f.id === data.fileId) {
              return { ...f, progress };
            }
            return f;
          }));
        }
      } else if (data.type === 'file-complete') {
        const item = incomingChunksRef.current.get(data.fileId);
        if (item) {
          const fullBase64 = item.chunks.join('');
          const byteCharacters = atob(fullBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: item.meta.fileType || 'application/octet-stream' });
          const downloadUrl = URL.createObjectURL(blob);

          setSharedFiles(prev => prev.map(f => {
            if (f.id === data.fileId) {
              return {
                ...f,
                downloadUrl,
                progress: 100,
                status: 'completed'
              };
            }
            return f;
          }));

          // Trigger received file notification toast
          setFileTransferToast({
            id: data.fileId,
            name: item.meta.fileName,
            size: item.meta.fileSize,
            senderName: item.meta.senderName,
            downloadUrl
          });
          setTimeout(() => setFileTransferToast(null), 8000);

          incomingChunksRef.current.delete(data.fileId);
        }
      }
    } catch (err) {
      console.warn("File transfer data channel message parsing error:", err);
    }
  });

  const handleSendFile = async (file: File, targetIdentity?: string, targetName?: string) => {
    if (!file) return;
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const myName = localParticipant.identity.split('#')[0];
    const localDownloadUrl = URL.createObjectURL(file);

    const newFileItem: SharedFileItem = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      senderIdentity: localParticipant.identity,
      senderName: myName,
      targetIdentity,
      targetName,
      downloadUrl: localDownloadUrl,
      progress: 0,
      status: 'sending',
      timestamp: Date.now(),
      isOutgoing: true
    };

    setSharedFiles(prev => [newFileItem, ...prev]);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64String = btoa(binary);

        const CHUNK_SIZE = 16384; // 16KB chunk size
        const totalChunks = Math.ceil(base64String.length / CHUNK_SIZE);

        // 1. Send metadata header
        const metaPayload = JSON.stringify({
          type: 'file-meta',
          fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          senderIdentity: localParticipant.identity,
          senderName: myName,
          targetIdentity,
          targetName,
          totalChunks,
          timestamp: Date.now()
        });

        await sendFilePayload(new TextEncoder().encode(metaPayload), { reliable: true });

        // 2. Stream chunk sequence
        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64String.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const chunkPayload = JSON.stringify({
            type: 'file-chunk',
            fileId,
            index: i,
            chunk,
            targetIdentity
          });

          await sendFilePayload(new TextEncoder().encode(chunkPayload), { reliable: true });
          
          const progress = Math.round(((i + 1) / totalChunks) * 100);
          setSharedFiles(prev => prev.map(f => f.id === fileId ? { ...f, progress } : f));
          
          if (i % 8 === 0) {
            await new Promise(r => setTimeout(r, 10));
          }
        }

        // 3. Send complete signal
        const completePayload = JSON.stringify({
          type: 'file-complete',
          fileId,
          targetIdentity
        });
        await sendFilePayload(new TextEncoder().encode(completePayload), { reliable: true });

        setSharedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'completed', progress: 100 } : f));
        setToastMessage(`Sent "${file.name}" successfully`);
        setTimeout(() => setToastMessage(null), 3000);
      } catch (err) {
        console.error("Failed to send file chunks:", err);
        setSharedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'failed' } : f));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const openSendFileFor = (targetIdentity?: string) => {
    setSendFileTarget(targetIdentity);
    setIsSendFileDialogOpen(true);
  };

  // Data Channel: Collaborative Joint Workspace (Files, Real Cursor Sync, Whiteboard Strokes)
  const [workspaceIncomingMsg, setWorkspaceIncomingMsg] = useState<any>(null);
  const { send: sendWorkspacePayload } = useDataChannel("workspace-sync", (msg) => {
    try {
      const payloadText = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(payloadText);
      setWorkspaceIncomingMsg({ ...data, _ts: Date.now() });
    } catch (err) {
      console.warn("Workspace sync message parsing error:", err);
    }
  });

  const handleBroadcastWorkspace = useCallback(async (data: any) => {
    try {
      const payloadText = JSON.stringify(data);
      const encoded = new TextEncoder().encode(payloadText);
      await sendWorkspacePayload(encoded, { reliable: true });
    } catch (err) {
      console.warn("Failed to broadcast workspace sync payload:", err);
    }
  }, [sendWorkspacePayload]);

  // Sync active isolated feed exports from Firestore
  useEffect(() => {
    if (!room) return;
    const q = collection(db, 'rooms', room, 'feedExports');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: FeedExportItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as FeedExportItem);
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setFeedExports(list);
    }, (err) => {
      console.warn('[MeetingPage] feedExports snapshot error:', err);
    });
    return () => unsubscribe();
  }, [room]);

  // Monitor outbound video telemetry from localParticipant
  useEffect(() => {
    const updateTelemetry = () => {
      if (!localParticipant) return;
      const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.videoTrack) {
        const mediaStreamTrack = camPub.videoTrack.mediaStreamTrack;
        const settings = mediaStreamTrack ? mediaStreamTrack.getSettings() : null;
        if (settings?.width && settings?.height) {
          setLiveResolution(`${settings.width} × ${settings.height}`);
        } else {
          setLiveResolution(streamProfile === 'high' ? '1920 × 1080' : '1280 × 720');
        }
        if (settings?.frameRate) {
          setLiveFps(Math.round(settings.frameRate));
        } else {
          setLiveFps(streamProfile === 'high' ? 60 : 30);
        }
        setLiveBitrate(streamProfile === 'high' ? '~3.5 Mbps' : '~1.8 Mbps');
      } else {
        setLiveResolution(streamProfile === 'high' ? '1920 × 1080' : '1280 × 720');
        setLiveFps(streamProfile === 'high' ? 60 : 30);
        setLiveBitrate('0.0 Mbps (Camera Off)');
      }
    };

    updateTelemetry();
    const interval = setInterval(updateTelemetry, 3000);
    return () => clearInterval(interval);
  }, [localParticipant, streamProfile, localParticipant?.isCameraEnabled]);

  const copyIsolatedFeedLink = async (participant: Participant) => {
    if (!room || !participant) return;
    const exportId = `exp_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const exportToken = `tok_${Math.random().toString(36).substring(2, 12)}`;
    const identity = participant.identity;
    const participantName = participant.identity.split('#')[0] || (participant.isLocal ? 'You' : 'Participant');
    
    const feedUrl = `${window.location.origin}/isolated-feed/${encodeURIComponent(room)}/${encodeURIComponent(identity)}?token=${exportToken}`;
    
    try {
      await setDoc(doc(db, 'rooms', room, 'feedExports', exportId), {
        id: exportId,
        token: exportToken,
        roomId: room,
        participantIdentity: identity,
        participantName: participantName,
        isLocal: participant.isLocal,
        createdAt: Date.now(),
        active: true,
      });
    } catch (err) {
      console.warn("Could not save feed export to Firestore:", err);
    }

    try {
      await navigator.clipboard.writeText(feedUrl);
      setToastMessage("Feed link copied to clipboard. Ready for OBS.");
      setTimeout(() => {
        setToastMessage((prev) => (prev === "Feed link copied to clipboard. Ready for OBS." ? null : prev));
      }, 3500);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const revokeExportToken = async (exportId: string) => {
    if (!room || !exportId) return;
    try {
      await updateDoc(doc(db, 'rooms', room, 'feedExports', exportId), {
        active: false,
        revokedAt: Date.now()
      });
    } catch (err) {
      try {
        await deleteDoc(doc(db, 'rooms', room, 'feedExports', exportId));
      } catch {}
    }
  };

  const copyExportLinkAgain = async (item: FeedExportItem) => {
    const feedUrl = `${window.location.origin}/isolated-feed/${encodeURIComponent(room)}/${encodeURIComponent(item.participantIdentity)}?token=${item.token}`;
    await navigator.clipboard.writeText(feedUrl);
    setCopiedExportId(item.id);
    setToastMessage("Feed link copied to clipboard. Ready for OBS.");
    setTimeout(() => {
      setCopiedExportId(null);
    }, 2000);
    setTimeout(() => {
      setToastMessage((prev) => (prev === "Feed link copied to clipboard. Ready for OBS." ? null : prev));
    }, 3500);
  };

  const activeFeedCount = useMemo(() => {
    return feedExports.filter(f => f.active !== false).length;
  }, [feedExports]);

  const handleTileContextMenu = (e: React.MouseEvent, trackRef: TrackReferenceOrPlaceholder) => {
    e.preventDefault();
    e.stopPropagation();
    if (!trackRef?.participant) return;
    const x = Math.min(e.clientX, window.innerWidth - 250);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    setContextMenu({
      isOpen: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      participant: trackRef.participant,
      isLocal: trackRef.participant.isLocal,
    });
  };

  const bgImages = [
    { id: 'office', url: 'https://picsum.photos/seed/office/1920/1080', label: 'Office' },
    { id: 'home', url: 'https://picsum.photos/seed/home/1920/1080', label: 'Home' },
    { id: 'nature', url: 'https://picsum.photos/seed/nature/1920/1080', label: 'Nature' },
    { id: 'abstract', url: 'https://picsum.photos/seed/abstract/1920/1080', label: 'Abstract' },
  ];

  // Transcript Auto-save Logic with Buffering
  const flushTranscriptBuffer = async () => {
    if (!transcriptNoteIdRef.current || transcriptBufferRef.current.length === 0) return;
    
    const linesToFlush = [...transcriptBufferRef.current];
    transcriptBufferRef.current = [];
    
    try {
      const noteRef = doc(komuDb, 'notes', transcriptNoteIdRef.current);
      await runTransaction(komuDb, async (transaction) => {
        const snap = await transaction.get(noteRef);
        if (snap.exists()) {
          const currentBody = snap.data().body || "";
          transaction.update(noteRef, {
            body: currentBody + linesToFlush.join(""),
            updatedAt: serverTimestamp()
          });
        }
      });
      lastFlushTimeRef.current = Date.now();
    } catch (err) {
      console.error("[MeetingPage] Failed to flush transcript buffer:", err);
      // Put back in queue if it failed
      transcriptBufferRef.current = [...linesToFlush, ...transcriptBufferRef.current];
    }
  };

  const appendToTranscriptNote = async (speaker: string, text: string) => {
    if (!autoSaveTranscript || !komuUser || !text) return;

    try {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const line = `\n[${timestamp}] ${speaker}: ${text}`;

      if (transcriptNoteIdRef.current) {
        transcriptBufferRef.current.push(line);
        
        // Flush if enough time passed (5 seconds)
        if (Date.now() - lastFlushTimeRef.current > 5000) {
          flushTranscriptBuffer();
        }
      } else if (!isCreatingTranscriptRef.current) {
        isCreatingTranscriptRef.current = true;
        const title = `Meeting Transcript: ${meetingDetails?.title || room} (${format(new Date(), 'PP')})`;
        const initialBody = `Meeting started at ${new Date().toLocaleString()}${line}`;
        
        const newDoc = await addDoc(collection(komuDb, 'notes'), {
          uid: komuUser.uid,
          title: title,
          body: initialBody + transcriptQueueRef.current.join(""),
          type: 'text',
          isArchive: false,
          isTrash: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          color: '#ffffff'
        });
        
        transcriptNoteIdRef.current = newDoc.id;
        setTranscriptNoteId(newDoc.id);
        transcriptQueueRef.current = [];
        isCreatingTranscriptRef.current = false;
        lastFlushTimeRef.current = Date.now();
      } else {
        // Queue messages while creating
        transcriptQueueRef.current.push(line);
      }
    } catch (err) {
      console.error("Failed to auto-save transcript to note:", err);
      isCreatingTranscriptRef.current = false;
    }
  };

  // Periodic flush interval
  useEffect(() => {
    if (autoSaveTranscript) {
      flushIntervalRef.current = setInterval(() => {
        flushTranscriptBuffer();
      }, 7000);
    } else {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
    }
    return () => {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
    };
  }, [autoSaveTranscript]);

  // Live Captions Logic
  useEffect(() => {
    if (!isCaptionsEnabled || !localParticipant) {
      if (recognitionRef.current) recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const text = (finalTranscript + interimTranscript).trim();
      if (text) {
        setLocalTranscript(text);

        // Broadcast transcription
        sendTranscription(new TextEncoder().encode(JSON.stringify({
          text: text,
          identity: localParticipant.identity,
          isFinal: finalTranscript !== ''
        })), { reliable: true });

        // Auto-save if final
        if (finalTranscript !== '') {
          appendToTranscriptNote("You", finalTranscript);
        }

        // Clear local transcript after a timeout if it was final
        if (finalTranscript) {
          setTimeout(() => setLocalTranscript(""), 3000);
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [isCaptionsEnabled, localParticipant]);

  // Handle Incoming Transcriptions
  const { send: sendTranscription } = useDataChannel("transcription", (msg) => {
    const payload = JSON.parse(new TextDecoder().decode(msg.payload));
    
    if (payload.isFinal) {
      appendToTranscriptNote(payload.identity.split('#')[0], payload.text);
    }

    setTranscriptions(prev => {
      // Keep only recent transcriptions
      const now = Date.now();
      const filtered = prev.filter(t => now - t.timestamp < 5000 && t.identity !== payload.identity);
      return [...filtered, {
        id: Math.random().toString(),
        identity: payload.identity,
        text: payload.text,
        timestamp: now
      }];
    });
  });

  // Apply Background Effects
  useEffect(() => {
    const applyProcessor = async () => {
      if (!localParticipant || !localParticipant.isCameraEnabled) return;
      
      const track = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack;
      if (!track) return;

      await track.stopProcessor();

      if (selectedBg === 'blur') {
        const processor = BackgroundBlur(10);
        await track.setProcessor(processor);
      } else if (selectedBg === 'image') {
        const bgUrl = customBgImage || selectedBgImage;
        const processor = VirtualBackground(bgUrl);
        await track.setProcessor(processor);
      }
    };

    applyProcessor();
  }, [selectedBg, selectedBgImage, customBgImage, localParticipant]);

  // Apply Device Changes & Settings
  useEffect(() => {
    if (!localParticipant?.isCameraEnabled || !selectedVideoId) return;
    
    // Verify device exists in available devices before switching
    const deviceExists = videoDevices.some(d => d.deviceId === selectedVideoId);
    if (!deviceExists) {
      console.warn("Selected video device not found:", selectedVideoId);
      return;
    }

    localParticipant.setCameraEnabled(true, { deviceId: selectedVideoId }).catch(err => {
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes("Could not start") || errorMsg.includes("NotFoundError")) {
        console.warn("Video device unavailable or already in use:", selectedVideoId);
        // Reset to first available device
        if (videoDevices.length > 0) {
          setSelectedVideoId(videoDevices[0].deviceId);
        }
      } else {
        console.warn("Could not switch video device:", errorMsg);
      }
    });
  }, [selectedVideoId, localParticipant, videoDevices]);

  useEffect(() => {
    if (localParticipant) {
      // Only apply if the track is actually enabled
      if (isMicEnabled) {
        localParticipant.setMicrophoneEnabled(true, { 
          deviceId: selectedAudioId,
          noiseSuppression: noiseCancellation,
          echoCancellation: echoCancellation,
          autoGainControl: autoGainControl,
        }).catch(err => {
          console.warn("Could not apply audio device/filter settings:", err?.message || err);
        });
      }
    }
  }, [selectedAudioId, noiseCancellation, echoCancellation, autoGainControl, localParticipant, isMicEnabled]);

  const sendReaction = (emoji: string) => {
    const id = Date.now();
    const x = 20 + Math.random() * 60; // Random horizontal position
    setReactions(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 4000);
    // Send to others via reaction data channel
    sendReactionData(new TextEncoder().encode(JSON.stringify({ type: 'reaction', emoji })), { reliable: true });
  };

  useEffect(() => {
    if (reactionMessage) {
      try {
        const data = JSON.parse(new TextDecoder().decode(reactionMessage.payload));
        if (data.type === 'reaction') {
          const id = Date.now();
          const x = 20 + Math.random() * 60;
          setReactions(prev => [...prev, { id, emoji: data.emoji, x }]);
          setTimeout(() => {
            setReactions(prev => prev.filter(r => r.id !== id));
          }, 4000);
        }
      } catch (e) {
        console.error("Failed to parse reaction", e);
      }
    }
  }, [reactionMessage]);

  useEffect(() => {
    if (handRaiseMessage) {
      try {
        const data = JSON.parse(new TextDecoder().decode(handRaiseMessage.payload));
        if (data.type === 'hand-raise' && data.identity) {
          setRaisedHands(prev => ({ ...prev, [data.identity]: data.raised }));
        }
      } catch (e) {
        console.error("Failed to parse hand raise", e);
      }
    }
  }, [handRaiseMessage]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const toggleHandRaise = () => {
    if (connectionState !== ConnectionState.Connected) return;
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    setRaisedHands(prev => ({ ...prev, [localParticipant.identity]: newState }));
    try {
      sendHandRaise(new TextEncoder().encode(JSON.stringify({
        type: 'hand-raise',
        raised: newState,
        identity: localParticipant.identity,
        displayName: localParticipant.identity.split('#')[0],
      })), { reliable: true });
    } catch (err) {
      console.error("Failed to send hand-raise data", err);
    }
  };

  const processedTracks = useMemo(() => {
    if (!tracks || tracks.length === 0) return [];

    // Filter and deduplicate tracks by participant
    const filtered = tracks.filter(t => {
      if (hideNonVideo && !t.participant?.isCameraEnabled && !t.participant?.isLocal && t.source !== Track.Source.ScreenShare) return false;
      
      // Filter out pending participants
      try {
        const meta = JSON.parse(t.participant.metadata || "{}");
        if (t.participant.isLocal) return true;
        
        // Hosts and Admitted participants are always visible
        if (meta.isHost === true) return true;
        
        // Show if explicitly admitted by host locally OR if metadata is not pending
        if (meta.pending === true) {
          if (isHost && admittedSids.has(t.participant.sid)) return true;
          return false;
        }
      } catch {}

      return true;
    }).filter((t, i, self) => {
      // If someone is screen sharing, we want to show both their camera and their screen share?
      // Actually Meet shows them separately. LiveKit useTracks with Camera and ScreenShare will give both.
      return true; 
    });

    return filtered.sort((a, b) => {
      const aId = a.participant?.identity || "";
      const bId = b.participant?.identity || "";
      
      // Screen shares always first
      const aScreen = a.source === Track.Source.ScreenShare ? 1 : 0;
      const bScreen = b.source === Track.Source.ScreenShare ? 1 : 0;
      if (aScreen !== bScreen) return bScreen - aScreen;

      // Pinned next
      const aPinned = pinnedIdentities.has(aId) ? 1 : 0;
      const bPinned = pinnedIdentities.has(bId) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      // Speaking next
      const aSpeaking = a.participant.isSpeaking ? 1 : 0;
      const bSpeaking = b.participant.isSpeaking ? 1 : 0;
      if (aSpeaking !== bSpeaking) return bSpeaking - aSpeaking;

      // Hand raised next
      const aHand = raisedHands[aId] ? 1 : 0;
      const bHand = raisedHands[bId] ? 1 : 0;
      if (aHand !== bHand) return bHand - aHand;

      // Local participant usually last or in a specific spot, but here we just sort
      if (a.participant.isLocal !== b.participant.isLocal) return a.participant.isLocal ? 1 : -1;
      
      return aId.localeCompare(bId);
    }).slice(0, maxParticipants);
  }, [tracks, pinnedIdentities, hideNonVideo, maxParticipants, raisedHands, localParticipant.identity]);

  const visibleTracks = useMemo(() => {
    const MAX_TILES = isMobile ? 6 : 12;
    if (processedTracks.length <= MAX_TILES) {
      return processedTracks;
    }
    return processedTracks.slice(0, MAX_TILES - 1);
  }, [processedTracks, isMobile]);

  const extraTrackCount = Math.max(0, processedTracks.length - visibleTracks.length);

  const participantGridColumns = useMemo(() => {
    if (visibleTracks.length <= 1) return "grid-cols-1";
    if (isMobile) return "grid-cols-2";
    if (visibleTracks.length === 2) return "grid-cols-1 md:grid-cols-2";
    if (visibleTracks.length <= 4) return "grid-cols-2 md:grid-cols-4";
    if (visibleTracks.length <= 6) return "grid-cols-3 md:grid-cols-4";
    return "grid-cols-4";
  }, [visibleTracks.length, isMobile]);

  const mobilePrimaryTrack = useMemo(() => {
    if (!visibleTracks.length) return null;
    return visibleTracks.find(t => t.participant.identity === mobilePrimaryIdentity) || visibleTracks[0];
  }, [visibleTracks, mobilePrimaryIdentity]);

  const mobileSecondaryTrack = useMemo(() => {
    if (!visibleTracks.length) return null;
    return visibleTracks.find(t => t.participant.identity !== mobilePrimaryTrack?.participant.identity) || visibleTracks[1] || null;
  }, [visibleTracks, mobilePrimaryTrack]);

  useEffect(() => {
    if (!isMobile || visibleTracks.length !== 2) return;
    const identities = visibleTracks.map(t => t.participant.identity);
    if (!mobilePrimaryIdentity || !identities.includes(mobilePrimaryIdentity)) {
      setMobilePrimaryIdentity(identities[0]);
    }
  }, [isMobile, visibleTracks, mobilePrimaryIdentity]);

  const computedLayout = useMemo(() => {
    const someoneIsSharing = processedTracks.some(t => t.source === Track.Source.ScreenShare);
    if (layoutMode === 'auto') {
      if (pinnedIdentities.size > 0 || someoneIsSharing) return 'sidebar';
      if (processedTracks.length > 3) return 'imo';
      return 'tiled';
    }
    return layoutMode;
  }, [layoutMode, pinnedIdentities.size, processedTracks]);

  // IMO View Spotlight Logic: minimum 1 minute hold
  useEffect(() => {
    if (computedLayout !== 'imo') return;
    const now = Date.now();
    const speakingParticipants = processedTracks.filter(t => t.participant.isSpeaking);
    const candidate = speakingParticipants[0]?.participant.identity || processedTracks[0]?.participant.identity;
    
    if (candidate && candidate !== spotlightIdentity) {
      if (now - lastSpotlightChangeRef.current > 60000 || !spotlightIdentity) {
        setSpotlightIdentity(candidate);
        lastSpotlightChangeRef.current = now;
      }
    }
  }, [processedTracks, computedLayout, spotlightIdentity]);

  const focusTrack = useMemo(() => {
    if (computedLayout === 'imo') {
      return processedTracks.find(t => t.participant.identity === spotlightIdentity) || processedTracks[0];
    }
    if (pinnedIdentities.size === 0) return processedTracks.find(t => t.source === Track.Source.ScreenShare) || processedTracks[0];
    return processedTracks.find(t => pinnedIdentities.has(t.participant.identity)) || processedTracks[0];
  }, [processedTracks, pinnedIdentities, computedLayout, spotlightIdentity]);

  const togglePin = (identity: string) => {
    setPinnedIdentities((prev) => {
      const next = new Set(prev);
      if (next.has(identity)) next.delete(identity);
      else if (next.size < 6) next.add(identity);
      return next;
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAdmitted && !isHost) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-dark p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-surface p-10 rounded-[32px] border border-white/10 text-center space-y-6 shadow-2xl"
        >
          <div className="w-20 h-20 bg-accent-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="text-accent-blue" size={40} />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Waiting to be admitted...</h2>
          <p className="text-text-secondary">The meeting host will let you in soon. Please stay on this screen.</p>
          <div className="pt-4 flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-accent-blue text-white rounded-xl font-bold hover:bg-blue-600 transition-all"
            >
              Retry Connection
            </button>
            <button 
              onClick={() => navigate('/dashboard')}
              className="text-accent-red font-bold hover:underline text-sm"
            >
              Leave meeting
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden h-full">
      {/* Host Admit Notification */}
      <AnimatePresence>
        {isHost && pendingParticipants.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg px-4 pointer-events-auto"
          >
            <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-2xl border border-white/15 shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  {pendingParticipants[0].identity.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {pendingParticipants.length === 1 
                      ? `${pendingParticipants[0].identity.split('#')[0]} wants to join`
                      : `${pendingParticipants[0].identity.split('#')[0]} and ${pendingParticipants.length - 1} other(s) waiting`}
                  </p>
                  <p className="text-xs text-slate-400">Waiting room admission</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pendingParticipants.length > 1 && (
                  <button 
                    onClick={admitAllUsers}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-500 transition-all shadow-sm"
                  >
                    Admit All ({pendingParticipants.length})
                  </button>
                )}
                <button 
                  onClick={() => admitUser(pendingParticipants[0])}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 transition-all shadow-sm"
                >
                  Admit
                </button>
                <button 
                  onClick={() => setActiveTab('waiting')}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                  title="View Waiting Room"
                >
                  <Users size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Area */}
      <div className={cn(
        "flex-1 relative flex items-center justify-center p-3 sm:p-4 pt-4 sm:pt-5 bg-slate-950 overflow-hidden min-h-0 transition-all duration-300",
        isToolbarCollapsed ? "pb-3 sm:pb-4" : "pb-[96px]"
      )}>
        {/* Click Outside Backdrop for Dropdowns */}
        {(isMicMenuOpen || isCamMenuOpen || isReactionsMenuOpen || isMoreMenuOpen || isKomuToolsOpen) && (
          <div 
            className="fixed inset-0 z-[65]" 
            onClick={() => {
              setIsMicMenuOpen(false);
              setIsCamMenuOpen(false);
              setIsReactionsMenuOpen(false);
              setIsMoreMenuOpen(false);
              setIsKomuToolsOpen(false);
            }} 
          />
        )}
        <div className={cn(
          "relative w-full h-full transition-all duration-500 min-h-0",
          activeTab && activeTab !== 'settings' && !isMobile 
            ? (activeTab === 'whiteboard' ? "hidden md:block md:mr-[84vw] lg:mr-[76vw] xl:mr-[72vw]" : "lg:mr-[380px]") 
            : ""
        )}>
          {computedLayout === 'imo' && focusTrack ? (
            <div className="flex flex-col h-full w-full gap-4">
              {/* Top Filmstrip - Smaller and more compact */}
              <div className="h-[90px] md:h-[130px] flex items-center gap-3 overflow-x-auto pb-2 custom-scroll scroll-smooth px-2">
                {processedTracks.filter(t => t.participant.identity !== focusTrack.participant.identity).map(t => (
                  <div key={t.participant.sid} className="h-full aspect-video flex-shrink-0">
                    <CustomParticipantTile 
                      trackRef={t} 
                      raisedHands={raisedHands}
                      onTogglePin={() => togglePin(t.participant.identity)}
                      isPinned={pinnedIdentities.has(t.participant.identity)}
                      mirror={t.participant.isLocal && videoMirroring}
                      showName={showParticipantNames}
                      onContextMenu={(e: any) => handleTileContextMenu(e, t)}
                      onCopyIsolatedFeed={() => copyIsolatedFeedLink(t.participant)}
                      onSendFile={(identity: string) => openSendFileFor(identity)}
                      onSpotlight={() => {
                        setSpotlightIdentity(t.participant.identity);
                        setLayoutMode('imo');
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* Central Person - Improved aspect ratio handling to prevent over-cropping */}
              <div className="flex-1 min-h-0 relative flex items-center justify-center">
                <div className="w-full h-full max-w-3xl max-h-[68dvh] aspect-video">
                  <CustomParticipantTile 
                    trackRef={focusTrack} 
                    raisedHands={raisedHands}
                    onTogglePin={() => togglePin(focusTrack.participant.identity)}
                    isPinned={pinnedIdentities.has(focusTrack.participant.identity)}
                    mirror={focusTrack.participant.isLocal && videoMirroring}
                    showName={showParticipantNames}
                    isFocal
                    onContextMenu={(e: any) => handleTileContextMenu(e, focusTrack)}
                    onCopyIsolatedFeed={() => copyIsolatedFeedLink(focusTrack.participant)}
                    onSendFile={(identity: string) => openSendFileFor(identity)}
                    onSpotlight={() => {
                      setSpotlightIdentity(focusTrack.participant.identity);
                      setLayoutMode('imo');
                    }}
                  />
                </div>
              </div>
            </div>
          ) : computedLayout === 'sidebar' && focusTrack ? (
            <div className="flex flex-col md:flex-row gap-4 h-full w-full">
              <div className="flex-[3] bg-bg-dark rounded-2xl overflow-hidden relative shadow-2xl border border-white/5">
                <CustomParticipantTile 
                  trackRef={focusTrack} 
                  raisedHands={raisedHands} 
                  isPinned={pinnedIdentities.has(focusTrack.participant.identity)}
                  onTogglePin={() => togglePin(focusTrack.participant.identity)}
                  showName={showParticipantNames}
                  isFocal
                  onContextMenu={(e: any) => handleTileContextMenu(e, focusTrack)}
                  onCopyIsolatedFeed={() => copyIsolatedFeedLink(focusTrack.participant)}
                  onSendFile={(identity: string) => openSendFileFor(identity)}
                />
              </div>
              {/* Sidebar Rail - Fixed for mobile visibility */}
              <div className="w-full md:w-[280px] h-[120px] md:h-full overflow-x-auto md:overflow-y-auto flex md:flex-col gap-3 custom-scroll p-1 shrink-0">
                {processedTracks.filter(t => t.participant.sid !== focusTrack.participant.sid).map(t => (
                  <div key={t.participant.sid} className="h-full md:h-auto aspect-video flex-shrink-0">
                    <CustomParticipantTile 
                      trackRef={t} 
                      raisedHands={raisedHands}
                      onTogglePin={() => togglePin(t.participant.identity)}
                      isPinned={pinnedIdentities.has(t.participant.identity)}
                      showName={showParticipantNames}
                      onContextMenu={(e: any) => handleTileContextMenu(e, t)}
                      onCopyIsolatedFeed={() => copyIsolatedFeedLink(t.participant)}
                      onSendFile={(identity: string) => openSendFileFor(identity)}
                      onSpotlight={() => {
                        setSpotlightIdentity(t.participant.identity);
                        setLayoutMode('imo');
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : isMobile && visibleTracks.length === 2 && mobilePrimaryTrack && mobileSecondaryTrack ? (
              <div className="relative w-full h-full">
                <div className="absolute inset-0 rounded-[28px] overflow-hidden bg-bg-dark">
                  <CustomParticipantTile 
                    trackRef={mobilePrimaryTrack} 
                    raisedHands={raisedHands}
                    onTogglePin={() => togglePin(mobilePrimaryTrack.participant.identity)}
                    isPinned={pinnedIdentities.has(mobilePrimaryTrack.participant.identity)}
                    mirror={mobilePrimaryTrack.participant.isLocal && videoMirroring}
                    showName={showParticipantNames}
                    isFocal
                    onContextMenu={(e: any) => handleTileContextMenu(e, mobilePrimaryTrack)}
                    onCopyIsolatedFeed={() => copyIsolatedFeedLink(mobilePrimaryTrack.participant)}
                    onSendFile={(identity: string) => openSendFileFor(identity)}
                  />
                </div>

                <motion.div 
                  drag
                  dragConstraints={containerRef}
                  dragMomentum={false}
                  className={cn(
                  "absolute bottom-4 z-20 w-[140px] h-[190px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-bg-dark active:scale-105 transition-transform cursor-move",
                  mobileOverlaySide === 'right' ? 'right-4' : 'left-4'
                )}>
                  <div className="relative w-full h-full">
                    <CustomParticipantTile 
                      trackRef={mobileSecondaryTrack} 
                      raisedHands={raisedHands}
                      onTogglePin={() => togglePin(mobileSecondaryTrack.participant.identity)}
                      isPinned={pinnedIdentities.has(mobileSecondaryTrack.participant.identity)}
                      mirror={mobileSecondaryTrack.participant.isLocal && videoMirroring}
                      showName={showParticipantNames}
                      onContextMenu={(e: any) => handleTileContextMenu(e, mobileSecondaryTrack)}
                      onCopyIsolatedFeed={() => copyIsolatedFeedLink(mobileSecondaryTrack.participant)}
                      onSendFile={(identity: string) => openSendFileFor(identity)}
                    />
                    <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setMobilePrimaryIdentity(mobileSecondaryTrack.participant.identity);
                        }}
                        className="px-2 py-1 rounded-full bg-black/70 text-white text-[11px] font-semibold hover:bg-black/90 transition-all shadow-lg"
                      >
                        Swap
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : visibleTracks.length === 1 ? (
              <div className="w-full h-full flex items-center justify-center p-4">
                <div className="w-full h-full max-w-5xl max-h-[72vh] aspect-video">
                  <CustomParticipantTile 
                    trackRef={visibleTracks[0]} 
                    raisedHands={raisedHands}
                    onTogglePin={() => togglePin(visibleTracks[0].participant.identity)}
                    isPinned={pinnedIdentities.has(visibleTracks[0].participant.identity)}
                    mirror={visibleTracks[0].participant.isLocal && videoMirroring}
                    showName={showParticipantNames}
                    onContextMenu={(e: any) => handleTileContextMenu(e, visibleTracks[0])}
                    onCopyIsolatedFeed={() => copyIsolatedFeedLink(visibleTracks[0].participant)}
                    onSendFile={(identity: string) => openSendFileFor(identity)}
                  />
                </div>
              </div>
            ) : (
              <div 
                className="grid gap-2 w-full h-full items-stretch"
                style={{ 
                  gridTemplateColumns: isMobile
                    ? 'repeat(1, minmax(0, 1fr))'
                    : visibleTracks.length === 2 
                      ? 'repeat(2, 1fr)' 
                      : `repeat(auto-fit, minmax(280px, 1fr))`,
                  gridAutoRows: (visibleTracks.length === 1 || (!isMobile && visibleTracks.length === 2)) ? '1fr' : 'minmax(180px, 1fr)'
                }}
              >
              {visibleTracks.map(t => (
                <div key={t.participant.sid} className="w-full h-full min-h-0 min-w-0 rounded-2xl overflow-hidden bg-bg-dark">
                  <CustomParticipantTile 
                    trackRef={t} 
                    raisedHands={raisedHands}
                    onTogglePin={() => togglePin(t.participant.identity)}
                    isPinned={pinnedIdentities.has(t.participant.identity)}
                    mirror={t.participant.isLocal && videoMirroring}
                    showName={showParticipantNames}
                    onContextMenu={(e: any) => handleTileContextMenu(e, t)}
                    onCopyIsolatedFeed={() => copyIsolatedFeedLink(t.participant)}
                    onSendFile={(identity: string) => openSendFileFor(identity)}
                  />
                </div>
              ))}
              {extraTrackCount > 0 && (
                <div className="relative w-full h-full min-h-0 min-w-0 rounded-2xl overflow-hidden bg-black/70 border border-white/10">
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 text-white">
                    <span className="text-4xl font-bold">+{extraTrackCount}</span>
                    <span className="mt-2 text-sm uppercase tracking-widest">more</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Captions Display */}
        <div className={cn(
          "fixed left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-50 pointer-events-none transition-all duration-300",
          isToolbarCollapsed ? "bottom-16" : "bottom-[100px]"
        )}>
          <AnimatePresence>
            {isCaptionsEnabled && (transcriptions.length > 0 || localTranscript) && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex flex-col items-center gap-2"
              >
                {transcriptions.map(t => (
                  <div key={t.id} className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white text-lg font-medium shadow-2xl">
                    <span className="text-blue-400 font-bold mr-2">{t.identity.split('#')[0]}:</span>
                    {t.text}
                  </div>
                ))}
                {localTranscript && (
                  <div className="bg-blue-600/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white text-lg font-medium shadow-2xl">
                    <span className="text-blue-200 font-bold mr-2">You:</span>
                    {localTranscript}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar Tabs (Participants, Chat, Info, Waiting) */}
        <AnimatePresence mode="wait">
          {activeTab && activeTab !== 'settings' && (
            <motion.div
              key="sidebar"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={cn(
                "fixed top-0 right-0 z-50 bg-white border-l border-gray-200 overflow-hidden flex flex-col shadow-2xl transition-all duration-300",
                isToolbarCollapsed ? "bottom-0" : "bottom-[88px]",
                activeTab === 'whiteboard' 
                  ? "w-full md:w-[84vw] lg:w-[76vw] xl:w-[72vw]" 
                  : (isMobile ? "w-full inset-x-0" : "w-[380px]")
              )}
            >
              {/* Sidebar Header (Hidden for whiteboard since JointWorkspace renders its own unified top bar; minimal X-only for files) */}
              {activeTab !== 'whiteboard' && (
                <div className={cn(
                  "flex items-center px-4 sm:px-5 py-2.5 border-b border-gray-100 bg-white sticky top-0 z-10",
                  activeTab === 'files' ? "justify-end" : "justify-between"
                )}>
                  {activeTab !== 'files' && (
                    <h2 className="text-sm sm:text-base font-bold text-slate-800 capitalize flex items-center gap-2">
                      {activeTab === 'info' && <Info size={18} className="text-slate-700" />}
                      {(activeTab === 'participants' || activeTab === 'users') && <Users size={18} className="text-slate-700" />}
                      {activeTab === 'chat' && <MessageSquare size={18} className="text-slate-700" />}
                      {activeTab === 'waiting' && <ShieldCheck size={18} className="text-slate-700" />}
                      {activeTab === 'notes' && <FileText size={18} className="text-slate-700" />}
                      {activeTab}
                    </h2>
                  )}
                  <button 
                    type="button"
                    onClick={() => setActiveTab(null)}
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              <div className={cn(
                "flex-1 min-h-0 bg-white flex flex-col",
                activeTab === 'whiteboard' ? "p-0 overflow-hidden" : "overflow-y-auto p-4 sm:p-5 custom-scroll bg-slate-50/30"
              )}>
                {activeTab === 'info' && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Joining info</p>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 break-all text-sm text-gray-900 leading-relaxed">
                        {window.location.href}
                      </div>
                      <button onClick={handleCopy} className="w-full flex items-center justify-center gap-2 bg-blue-100 text-blue-600 hover:bg-blue-200 px-4 py-3 rounded-xl transition-all text-sm font-bold">
                        {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                        {copied ? 'Copied' : 'Copy joining link'}
                      </button>
                    </div>
                  </div>
                )}
                {(activeTab === 'participants' || activeTab === 'users') && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Participants</p>
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{remoteParticipants.length + 1}</span>
                    </div>
                    <div className="space-y-1.5 rounded-2xl overflow-hidden">
                      <ParticipantItem 
                        participant={localParticipant} 
                        isLocal 
                      />
                      {remoteParticipants.map(p => (
                        <ParticipantItem 
                          key={p.sid} 
                          participant={p} 
                          onSendFile={(identity: string) => openSendFileFor(identity)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === 'chat' && (
                  <div className="flex flex-col h-full">
                    {/* Minimal Toggle: Messages / Shared Files */}
                    <div className="flex items-center gap-1.5 mb-3 bg-gray-100/90 p-1 rounded-xl">
                      <button
                        onClick={() => setChatSubTab('messages')}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                          chatSubTab === 'messages' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-800"
                        )}
                      >
                        Messages
                      </button>
                      <button
                        onClick={() => setChatSubTab('files')}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                          chatSubTab === 'files' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-800"
                        )}
                      >
                        <span>Files</span>
                        {sharedFiles.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-700 font-bold">
                            {sharedFiles.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {chatSubTab === 'files' ? (
                      <FilesPanel 
                        files={sharedFiles} 
                        onOpenSendDialog={() => openSendFileFor()} 
                      />
                    ) : (
                      <>
                        <div className="flex-1 space-y-3 mb-4 overflow-y-auto custom-scroll pr-1">
                          {chatMessages.length === 0 && sharedFiles.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                              <div className="p-4 bg-gray-100 rounded-full text-gray-600">
                                <MessageSquare size={32} />
                              </div>
                              <p className="text-sm text-gray-600">No messages yet. Start the conversation!</p>
                            </div>
                          ) : (
                            chatMessages.map((msg, i) => (
                              <div key={i} className="flex flex-col">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold text-blue-600">
                                    {msg.from?.identity === localParticipant.identity ? 'You' : msg.from?.identity.split('#')[0]}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-900 bg-gray-100 px-4 py-2 rounded-2xl rounded-tl-none inline-block max-w-[95%] border border-gray-200">
                                  {msg.message}
                                </p>
                              </div>
                            ))
                          )}
                          <div ref={chatEndRef} />
                        </div>
                        <form 
                          onSubmit={(e) => { 
                            e.preventDefault(); 
                            if(chatInput.trim()){ 
                              sendChat(chatInput); 
                              setChatInput(""); 
                            }
                          }}
                          className="flex gap-2 items-center bg-gray-100 rounded-2xl px-3 py-1 border border-gray-300 focus-within:border-blue-400 transition-all"
                        >
                          <button
                            type="button"
                            onClick={() => openSendFileFor()}
                            title="Send file in call"
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-200/60 rounded-xl transition-colors shrink-0"
                          >
                            <Paperclip size={18} />
                          </button>
                          <input 
                            type="text" 
                            placeholder="Send a message..." 
                            className="bg-transparent outline-none flex-1 text-sm text-gray-900 h-11 placeholder:text-gray-500"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                          />
                          <button 
                            type="submit" 
                            disabled={!chatInput.trim()} 
                            className="text-blue-600 p-2 hover:bg-blue-100 rounded-full transition-colors disabled:opacity-30 shrink-0"
                          >
                            <Send size={18} />
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )}
                {activeTab === 'files' && (
                  <FilesPanel 
                    files={sharedFiles} 
                    onOpenSendDialog={() => openSendFileFor()} 
                  />
                )}
                {activeTab === 'waiting' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Waiting Room</p>
                        <p className="text-xs text-gray-500">{pendingParticipants.length} participant(s) waiting</p>
                      </div>
                      {pendingParticipants.length > 1 && (
                        <button
                          onClick={admitAllUsers}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                        >
                          Admit All
                        </button>
                      )}
                    </div>
                    {pendingParticipants.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
                          <Users size={32} />
                        </div>
                        <p className="text-sm text-gray-500 font-medium">No one is waiting in the lobby.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingParticipants.map(p => (
                          <div key={p.sid} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200/80 transition-all">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                                {p.identity.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm font-semibold text-gray-900 block truncate">{p.identity.split('#')[0]}</span>
                                <span className="text-xs text-gray-400 block">Waiting for approval</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button 
                                onClick={() => admitUser(p)}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-all shadow-sm"
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
                {activeTab === 'notes' && (
                  <NotesPanel 
                    user={user} 
                    navigate={navigate} 
                    autoSaveTranscript={autoSaveTranscript}
                    setAutoSaveTranscript={setAutoSaveTranscript}
                    activeTranscriptNoteId={transcriptNoteId}
                  />
                )}
                {activeTab === 'whiteboard' && (
                  <div className="flex-1 flex flex-col min-h-0 bg-white p-0">
                    <Whiteboard 
                      meetingId={room} 
                      remoteParticipants={remoteParticipants}
                      localParticipant={localParticipant}
                      user={user}
                      onBroadcast={handleBroadcastWorkspace}
                      incomingBroadcast={workspaceIncomingMsg}
                      onClose={() => setActiveTab(null)}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Central Modal (Google Meet Style) */}
        <AnimatePresence mode="wait">
          {activeTab === 'settings' && (
            <motion.div
              key="settings-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            >
              <div className="absolute inset-0" onClick={() => setActiveTab(null)} />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-3xl h-[600px] overflow-hidden rounded-[8px] bg-white shadow-2xl flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 px-6 border-b border-gray-200">
                  <h2 className="text-xl font-normal text-gray-800">Settings</h2>
                  <button 
                    onClick={() => setActiveTab(null)}
                    className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                  >
                    <X size={24} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="flex flex-1 min-h-0 bg-white">
                  {/* Left Sidebar */}
                  <nav className="w-[240px] py-4 bg-white border-r border-gray-100">
                    {[
                      { id: 'audio', label: 'Audio', icon: Mic },
                      { id: 'video', label: 'Video', icon: VideoIcon },
                      { id: 'streaming', label: 'Streaming Feed', icon: Radio },
                      { id: 'general', label: 'General', icon: Settings },
                      { id: 'captions', label: 'Captions', icon: MessageSquare },
                      { id: 'reactions', label: 'Reactions', icon: Smile },
                      { id: 'effects', label: 'Effects', icon: Sparkles }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setSettingsCategory(cat.id as any)}
                        className={cn(
                          "w-full flex items-center gap-4 px-6 py-3.5 text-[14px] font-medium transition-all relative text-left",
                          settingsCategory === cat.id 
                            ? "text-[#1a73e8] bg-[#e8f0fe] rounded-r-full" 
                            : "text-[#5f6368] hover:bg-gray-50"
                        )}
                      >
                        <cat.icon size={19} strokeWidth={settingsCategory === cat.id ? 2.5 : 1.5} className="shrink-0" />
                        <span className="truncate">{cat.label}</span>
                        {settingsCategory === cat.id && (
                          <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#1a73e8]" />
                        )}
                      </button>
                    ))}
                  </nav>

                  {/* Main Content */}
                  <div className="flex-1 overflow-y-auto p-8 custom-scroll">
                    {/* Streaming Feed Settings */}
                    {settingsCategory === 'streaming' && (
                      <div className="max-w-xl space-y-6">
                        {/* Status Header */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200/80">
                          <div className="space-y-0.5">
                            <h4 className="text-sm font-semibold text-gray-900">Streaming Feed Status</h4>
                            <p className="text-xs text-gray-500">
                              {activeFeedCount > 0 
                                ? `${activeFeedCount} active isolated OBS feed source${activeFeedCount > 1 ? 's' : ''}` 
                                : 'No active isolated feeds currently exported'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium shrink-0">
                            <span className={cn("w-2 h-2 rounded-full", activeFeedCount > 0 ? "bg-emerald-500" : "bg-gray-400")} />
                            <span className={cn(activeFeedCount > 0 ? "text-emerald-700 font-semibold" : "text-gray-600")}>
                              {activeFeedCount > 0 ? 'Status: Streaming Feed Active' : 'Status: Inactive'}
                            </span>
                          </div>
                        </div>

                        {/* Outbound Feed Preview & Telemetry Panel */}
                        <section className="space-y-3.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">My Outbound Feed</h4>
                              <p className="text-xs text-gray-500">Live camera stream monitoring and encoder statistics</p>
                            </div>
                            <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">WebRTC Encoded</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
                            {/* Miniature Preview Box */}
                            <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center">
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
                                <div className="flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
                                  <VideoOff size={22} />
                                  <span className="text-xs">Camera is disabled</span>
                                </div>
                              )}
                              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/75 rounded text-[10px] font-mono text-white flex items-center gap-1.5 border border-white/10">
                                <span className={cn("w-1.5 h-1.5 rounded-full", localParticipant.isCameraEnabled ? "bg-emerald-400" : "bg-gray-400")} />
                                <span>{localParticipant.isCameraEnabled ? "LIVE OUTBOUND" : "OFFLINE"}</span>
                              </div>
                            </div>

                            {/* Telemetry Metrics */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/70 flex flex-col justify-between">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Resolution</span>
                                <span className="text-xs font-semibold text-gray-900 font-mono mt-1">{liveResolution}</span>
                              </div>
                              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/70 flex flex-col justify-between">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Framerate</span>
                                <span className="text-xs font-semibold text-gray-900 font-mono mt-1">{liveFps} FPS</span>
                              </div>
                              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/70 flex flex-col justify-between">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bitrate</span>
                                <span className="text-xs font-semibold text-gray-900 font-mono mt-1">{liveBitrate}</span>
                              </div>
                              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/70 flex flex-col justify-between">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">OBS Latency</span>
                                <span className="text-xs font-semibold text-emerald-700 font-mono mt-1">&lt; 120ms</span>
                              </div>
                            </div>
                          </div>

                          {/* Profile Toggle */}
                          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/70 flex items-center justify-between">
                            <div className="space-y-0.5 pr-4">
                              <span className="text-xs font-semibold text-gray-800">High-Performance Streaming Profile</span>
                              <p className="text-[11px] text-gray-500">Target 1080p@60fps (~3.5 Mbps) for crisp production captures</p>
                            </div>
                            <div 
                              className={cn("w-11 h-6 rounded-full relative cursor-pointer transition-colors shrink-0", streamProfile === 'high' ? "bg-blue-600" : "bg-gray-300")}
                              onClick={() => setStreamProfile(streamProfile === 'high' ? 'standard' : 'high')}
                            >
                              <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm", streamProfile === 'high' ? "left-6" : "left-1")} />
                            </div>
                          </div>
                        </section>

                        {/* Active Feed Exports */}
                        <section className="space-y-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">Active Isolated Feed Exports</h4>
                              <p className="text-xs text-gray-500">Tokenized OBS Browser Source links generated for this meeting</p>
                            </div>
                            {feedExports.length > 0 && (
                              <button
                                onClick={() => copyIsolatedFeedLink(localParticipant)}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                              >
                                + Export My Feed
                              </button>
                            )}
                          </div>

                          {feedExports.length === 0 ? (
                            <div className="p-5 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center space-y-2">
                              <Radio className="mx-auto text-gray-400" size={22} />
                              <p className="text-xs font-medium text-gray-700">No isolated feed links generated yet</p>
                              <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                                Right-click any participant's video tile in the call and click <span className="font-semibold text-gray-700">"Copy Isolated Feed Link"</span> to generate a dedicated OBS link.
                              </p>
                              <button
                                onClick={() => copyIsolatedFeedLink(localParticipant)}
                                className="mt-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium transition-colors shadow-sm inline-flex items-center gap-1.5"
                              >
                                <Radio size={13} className="text-blue-600" />
                                <span>Export My Feed Link for OBS</span>
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                              {feedExports.map((item) => (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors",
                                    item.active !== false ? "bg-white border-gray-200/80" : "bg-gray-50 border-gray-200/50 opacity-60"
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                                      {item.participantName?.charAt(0).toUpperCase() || 'P'}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-gray-800 truncate">{item.participantName}</span>
                                        <span className={cn("px-1.5 py-0.2 rounded text-[10px] font-medium", item.active !== false ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600")}>
                                          {item.active !== false ? 'Active' : 'Revoked'}
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-gray-400 font-mono truncate block">
                                        {item.token}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {item.active !== false ? (
                                      <>
                                        <button
                                          onClick={() => copyExportLinkAgain(item)}
                                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-1"
                                          title="Copy feed URL again"
                                        >
                                          {copiedExportId === item.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                          <span>{copiedExportId === item.id ? 'Copied' : 'Copy'}</span>
                                        </button>
                                        <button
                                          onClick={() => revokeExportToken(item.id)}
                                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Revoke Token"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[11px] text-gray-400 italic">Deactivated</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                    {/* Audio Settings */}
                    {settingsCategory === 'audio' && (
                      <div className="max-w-md space-y-10">
                        <section className="space-y-4">
                          <label className="text-sm font-medium text-[#1a73e8] block">Microphone</label>
                          <div className="relative">
                            <select 
                              value={selectedAudioId || audioDevices[0]?.deviceId}
                              onChange={(e) => setSelectedAudioId(e.target.value)}
                              className="w-full h-14 bg-white border border-gray-300 rounded-md px-4 pr-10 text-[14px] text-gray-900 appearance-none cursor-pointer focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] outline-none"
                            >
                              {audioDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId} className="text-gray-900">{device.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={20} />
                          </div>
                          <div className="flex items-center justify-between py-2 border-t border-gray-100 pt-4">
                             <div className="flex flex-col">
                                <span className="text-[14px] text-gray-700">Noise cancellation</span>
                                <span className="text-[12px] text-gray-500">Filters out background noise</span>
                             </div>
                             <div 
                               className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-all", noiseCancellation ? "bg-[#1a73e8]" : "bg-gray-300")}
                               onClick={() => setNoiseCancellation(!noiseCancellation)}
                             >
                                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", noiseCancellation ? "left-7" : "left-1")} />
                             </div>
                          </div>
                        </section>

                        <section className="space-y-4">
                          <label className="text-sm font-medium text-[#1a73e8] block">Speaker</label>
                          <div className="flex gap-4">
                            <div className="relative flex-1">
                              <select 
                                value={selectedSpeakerId || speakerDevices[0]?.deviceId}
                                onChange={(e) => setSelectedSpeakerId(e.target.value)}
                                className="w-full h-14 bg-white border border-gray-300 rounded-md px-4 pr-10 text-[14px] text-gray-900 appearance-none cursor-pointer focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] outline-none"
                              >
                                {speakerDevices.map(device => (
                                  <option key={device.deviceId} value={device.deviceId} className="text-gray-900">{device.label}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={20} />
                            </div>
                            <button 
                              onClick={() => {
                                const audio = new Audio('https://www.soundjay.com/buttons/beep-01a.mp3');
                                if (selectedSpeakerId) (audio as any).setSinkId?.(selectedSpeakerId);
                                audio.play();
                              }}
                              className="text-[#1a73e8] text-[14px] font-medium hover:bg-blue-50 px-4 py-2 rounded-md transition-all"
                            >
                              Test
                            </button>
                          </div>
                        </section>
                      </div>
                    )}

                    {/* Video Settings */}
                    {settingsCategory === 'video' && (
                      <div className="max-w-md space-y-10">
                         <section className="space-y-4">
                          <label className="text-sm font-medium text-[#1a73e8] block">Camera</label>
                          <div className="relative">
                            <select 
                              value={selectedVideoId || videoDevices[0]?.deviceId}
                              onChange={(e) => setSelectedVideoId(e.target.value)}
                              className="w-full h-14 bg-white border border-gray-300 rounded-md px-4 pr-10 text-[14px] text-gray-900 appearance-none cursor-pointer focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] outline-none"
                            >
                              {videoDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId} className="text-gray-900 bg-white">
                                  {device.label || `Camera ${device.deviceId.slice(0, 4)}`}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={20} />
                          </div>
                        </section>
                        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                           <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-gray-300">
                             <VideoIcon size={32} strokeWidth={1} />
                           </div>
                        </div>
                      </div>
                    )}

                    {/* Effects Settings */}
                    {settingsCategory === 'effects' && (
                      <div className="space-y-8">
                        <div>
                          <label className="text-sm font-medium text-[#1a73e8] mb-4 block">Backgrounds</label>
                          <div className="grid grid-cols-3 gap-4">
                            <button 
                              onClick={() => setSelectedBg('none')}
                              className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border transition-all",
                                selectedBg === 'none' ? "bg-[#e8f0fe] border-[#1a73e8] text-[#1a73e8]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                              )}
                            >
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                <X size={20} />
                              </div>
                              <span className="text-[12px] font-medium">None</span>
                            </button>
                            
                            <button 
                              onClick={() => {
                                fileInputRef.current?.click();
                              }}
                              className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
                            >
                              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#1a73e8]">
                                <Monitor size={20} />
                              </div>
                              <span className="text-[12px] font-medium">Upload Image</span>
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

                            <button 
                              onClick={() => setSelectedBg('blur')}
                              className={cn(
                                "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border transition-all",
                                selectedBg === 'blur' ? "bg-[#e8f0fe] border-[#1a73e8] text-[#1a73e8]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                              )}
                            >
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center bg-gradient-to-tr from-gray-200 to-gray-50 blur-[2px]" />
                              <span className="text-[12px] font-medium">Blur</span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[12px] font-medium text-gray-500">Preset backgrounds</label>
                          <div className="grid grid-cols-4 gap-3">
                            {bgImages.map(img => (
                              <button 
                                key={img.id}
                                onClick={() => {
                                  setSelectedBg('image');
                                  setSelectedBgImage(img.url);
                                  setCustomBgImage(null);
                                }}
                                className={cn(
                                  "relative aspect-video rounded-md overflow-hidden border-2 transition-all",
                                  selectedBg === 'image' && selectedBgImage === img.url && !customBgImage ? "border-[#1a73e8] scale-105 shadow-md" : "border-transparent hover:border-gray-200"
                                )}
                              >
                                <img src={img.url} alt={img.label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Captions Settings */}
                    {settingsCategory === 'captions' && (
                      <div className="max-w-md space-y-6">
                        <div className="p-6 bg-[#f8f9fa] rounded-xl flex items-center justify-between">
                           <div className="space-y-1">
                             <h4 className="text-[14px] font-medium text-gray-800">Live Captions</h4>
                             <p className="text-[12px] text-gray-500">Show what participants are saying on screen</p>
                           </div>
                           <div 
                             className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-all", isCaptionsEnabled ? "bg-[#1a73e8]" : "bg-gray-300")}
                             onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
                           >
                              <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", isCaptionsEnabled ? "left-7" : "left-1")} />
                           </div>
                        </div>
                        <div className="p-4 border border-gray-100 rounded-lg text-xs text-gray-500 leading-relaxed bg-white">
                           Note: Client-side captions use the Web Speech API. For best results, use a modern browser like Chrome or Edge.
                        </div>
                      </div>
                    )}

                    {/* General Settings */}
                    {settingsCategory === 'general' && (
                      <div className="max-w-md space-y-8">
                         <div className="flex items-center justify-between py-2 border-b border-gray-100 pb-6">
                             <div className="flex flex-col">
                                <span className="text-[14px] font-medium text-gray-800">Waiting Room</span>
                                <span className="text-[12px] text-gray-500">New participants must be admitted by host</span>
                             </div>
                             <div 
                               className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-all", lobbyEnabled ? "bg-blue-600 shadow-inner" : "bg-gray-200")}
                               onClick={async (e) => {
                                 e.stopPropagation();
                                 if (!isHost || !room) return;
                                 const next = !lobbyEnabled;
                                 setLobbyEnabled(next);
                                 try {
                                   await updateDoc(doc(db, 'rooms', room), { lobby: next });
                                 } catch (err) {
                                   console.error("Failed to update lobby setting:", err);
                                 }
                               }}
                             >
                                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm", lobbyEnabled ? "left-7" : "left-1")} />
                             </div>
                          </div>
                         <div className="flex items-center justify-between py-2">
                             <div className="flex flex-col">
                                <span className="text-[14px] font-medium text-gray-800">Show current time</span>
                                <span className="text-[12px] text-gray-500">Display Clock on the bottom bar</span>
                             </div>
                             <div 
                               className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-all", showClock ? "bg-blue-600 shadow-inner" : "bg-gray-200")}
                               onClick={() => setShowClock(!showClock)}
                             >
                                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm", showClock ? "left-7" : "left-1")} />
                             </div>
                          </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Taskbar */}
      <AnimatePresence>
        {!isToolbarCollapsed && (
          <motion.div 
            initial={{ y: 88, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 88, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="absolute bottom-0 left-0 right-0 h-[88px] flex items-center justify-between px-6 md:px-10 bg-slate-900/90 backdrop-blur-xl border-t border-white/5 z-[70]"
          >
            {/* Left: Meeting Info */}
            <div className="hidden md:flex flex-1 items-center justify-start gap-4">
              {showClock && (
                <div className="text-white">
                  <p className="text-base font-bold tracking-tight">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <div className="flex items-center gap-2 opacity-60">
                    <span className="w-1.5 h-1.5 bg-accent-blue rounded-full" />
                    <p className="text-xs font-semibold truncate max-w-[180px]">{room}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Center: Main Controls */}
            <div className="flex flex-none items-center gap-2 md:gap-3 justify-center">
              <div className="relative">
                <ControlButton 
                  onClick={async () => {
                    try {
                      const targetState = !localParticipant.isMicrophoneEnabled;
                      setIsMicEnabled(targetState);
                      await localParticipant.setMicrophoneEnabled(targetState);
                    } catch (err: any) {
                      console.warn("Microphone toggle failed:", err?.message || err);
                    }
                  }}
                  icon={localParticipant.isMicrophoneEnabled ? <Mic size={isMobile ? 18 : 22} /> : <MicOff size={isMobile ? 18 : 22} />}
                  micVideo={true}
                  enabled={localParticipant.isMicrophoneEnabled}
                  onDropdownClick={() => setIsMicMenuOpen(!isMicMenuOpen)}
                  hasDropdown={!isMobile}
                  size={isMobile ? "small" : "normal"}
                  title="Microphone (m)"
                />
                <AnimatePresence>
                  {isMicMenuOpen && !isMobile && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-64 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700 p-2 z-[70]"
                    >
                      <p className="text-[10px] font-bold text-slate-500 px-3 py-1 uppercase tracking-wider">Microphone</p>
                      <div className="max-h-48 overflow-y-auto custom-scroll">
                        {audioDevices.map(d => (
                          <button 
                            key={d.deviceId}
                            onClick={() => { setSelectedAudioId(d.deviceId); setIsMicMenuOpen(false); }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                              selectedAudioId === d.deviceId ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/5"
                            )}
                          >
                            <Mic size={14} />
                            <span className="truncate">{d.label || `Microphone ${d.deviceId.slice(0, 4)}`}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative">
                <ControlButton 
                  onClick={async () => {
                    if (!localParticipant) return;
                    try {
                      const targetState = !localParticipant.isCameraEnabled;
                      const previousState = localParticipant.isCameraEnabled;
                      
                      // If enabling camera, ensure device is available first
                      if (targetState && videoDevices.length === 0) {
                        console.warn("No camera devices available.");
                        setToastMessage("No camera devices available. Please check your hardware.");
                        setTimeout(() => setToastMessage(null), 4000);
                        return;
                      }
                      
                      try {
                        // Use current device or first available device
                        const deviceId = selectedVideoId && videoDevices.some(d => d.deviceId === selectedVideoId) 
                          ? selectedVideoId 
                          : videoDevices[0]?.deviceId;
                        
                        if (targetState && !deviceId) {
                          console.warn("Cannot enable camera: no valid device selected.");
                          return;
                        }
                        
                        const options = targetState && deviceId ? { deviceId } : undefined;
                        await localParticipant.setCameraEnabled(targetState, options);
                        
                        // Update device selection if enabling with specific device
                        if (targetState && deviceId && deviceId !== selectedVideoId) {
                          setSelectedVideoId(deviceId);
                        }
                        
                        setIsCamEnabled(targetState);
                        setToastMessage(targetState ? "Camera enabled" : "Camera disabled");
                        setTimeout(() => setToastMessage(null), 2000);
                      } catch (innerErr: any) {
                        setIsCamEnabled(previousState);
                        const errorMsg = innerErr?.message || String(innerErr);
                        
                        if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
                          setToastMessage("Camera permission denied. Check browser settings.");
                          console.warn("Camera permission denied.");
                        } else if (errorMsg.includes("NotFoundError") || errorMsg.includes("Could not start")) {
                          setToastMessage("Camera unavailable or already in use by another app.");
                          console.warn("Camera device unavailable.");
                        } else {
                          setToastMessage("Failed to toggle camera. Try again.");
                          console.warn("Camera toggle failed:", errorMsg);
                        }
                        setTimeout(() => setToastMessage(null), 4000);
                      }
                    } catch (err: any) {
                      console.error("Outer camera toggle error:", err?.message || err);
                    }
                  }}
                  icon={localParticipant.isCameraEnabled ? <VideoIcon size={isMobile ? 18 : 22} /> : <VideoOff size={isMobile ? 18 : 22} />}
                  micVideo={true}
                  enabled={localParticipant.isCameraEnabled}
                  onDropdownClick={() => setIsCamMenuOpen(!isCamMenuOpen)}
                  hasDropdown={!isMobile}
                  size={isMobile ? "small" : "normal"}
                  title="Camera (v)"
                />
                <AnimatePresence>
                  {isCamMenuOpen && !isMobile && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-64 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700 p-2 z-[70]"
                    >
                      <p className="text-[10px] font-bold text-slate-500 px-3 py-1 uppercase tracking-wider">Camera</p>
                      <div className="max-h-48 overflow-y-auto custom-scroll">
                        {videoDevices.map(d => (
                          <button 
                            key={d.deviceId}
                            onClick={() => { setSelectedVideoId(d.deviceId); setIsCamMenuOpen(false); }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                              selectedVideoId === d.deviceId ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/5"
                            )}
                          >
                            <VideoIcon size={14} />
                            <span className="truncate">{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <ControlButton 
                active={isCaptionsEnabled} 
                onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
                size={isMobile ? "small" : "normal"}
                icon={
                  <div className="relative">
                    <Languages size={isMobile ? 18 : 22} />
                    {isCaptionsEnabled && (
                      <motion.span 
                        animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.1, 0.9] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute -top-1.5 -right-1.5 px-1 bg-green-500 text-[8px] font-bold text-white rounded-md border border-slate-900 shadow-lg"
                      >
                        ON
                      </motion.span>
                    )}
                  </div>
                }
                highlight={isCaptionsEnabled}
                title="Captions (c)"
              />

              {!isMobile && (
                <>
                  <ControlButton 
                    active={isHandRaised} 
                    onClick={toggleHandRaise}
                    icon={<Hand size={22} />}
                    warning={isHandRaised}
                  />
                  <ControlButton 
                    active={localParticipant.isScreenShareEnabled} 
                    onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled)}
                    icon={localParticipant.isScreenShareEnabled ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
                    highlight={localParticipant.isScreenShareEnabled}
                  />
                </>
              )}

              <div className="relative flex items-center gap-1 md:gap-2">
                {!isMobile && (
                  <div className="relative">
                    <ControlButton 
                      onClick={() => setIsReactionsMenuOpen(!isReactionsMenuOpen)}
                      icon={<Smile size={22} />}
                      active={isReactionsMenuOpen}
                      title="Reactions"
                    />
                  </div>
                )}
                
                <div className="relative px-0.5">
                  <ControlButton 
                    onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                    icon={<MoreVertical size={20} />}
                    active={isMoreMenuOpen}
                    size={isMobile ? "small" : "normal"}
                  />

                  <AnimatePresence>
                    {isMoreMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-72 sm:w-80 bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-3 z-[70] max-h-[80vh] overflow-y-auto custom-scroll"
                      >
                      {isMobile && (
                        <div className="p-2 grid grid-cols-4 gap-2 mb-3 border-b border-white/10 pb-3">
                          {['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔'].map(emoji => (
                            <button 
                              key={emoji}
                              onClick={() => { sendReaction(emoji); setIsMoreMenuOpen(false); }}
                              className="w-full aspect-square flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-all active:scale-90"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Activities & Tools - Plain minimalist list buttons */}
                      <div className="space-y-1 mb-1">
                        <button 
                          onClick={() => { setActiveTab('whiteboard'); setIsMoreMenuOpen(false); }}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Monitor size={16} className="text-slate-400" />
                            <span>Joint workspace</span>
                          </div>
                        </button>

                        <button 
                          onClick={() => { setActiveTab('files'); setIsMoreMenuOpen(false); }}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Paperclip size={16} className="text-slate-400" />
                            <span>Share files</span>
                          </div>
                          {sharedFiles.length > 0 && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              {sharedFiles.length}
                            </span>
                          )}
                        </button>
                      </div>

                      <div className="h-px bg-white/10 my-2" />

                      {/* Standard Controls */}
                      <div className="space-y-1">
                        {isMobile && (
                          <>
                            <button 
                              onClick={() => { toggleHandRaise(); setIsMoreMenuOpen(false); }}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs transition-colors",
                                isHandRaised ? "text-yellow-400 bg-yellow-400/10" : "text-white"
                              )}
                            >
                              <Hand size={16} className={isHandRaised ? "text-yellow-400" : "text-slate-400"} />
                              <span>{isHandRaised ? "Lower hand" : "Raise hand"}</span>
                            </button>
                            <button 
                              onClick={() => { localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled); setIsMoreMenuOpen(false); }}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs transition-colors",
                                localParticipant.isScreenShareEnabled ? "text-green-400 bg-green-400/10" : "text-white"
                              )}
                            >
                              <MonitorUp size={16} className={localParticipant.isScreenShareEnabled ? "text-green-400" : "text-slate-400"} />
                              <span>Present screen</span>
                            </button>
                            <button 
                              onClick={() => { setActiveTab('chat'); setIsMoreMenuOpen(false); }}
                              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <MessageSquare size={16} className="text-slate-400" />
                                <span>In-call messages</span>
                              </div>
                              {chatMessages.length > 0 && (
                                <span className="px-1.5 py-0.2 bg-blue-500 text-white rounded-full text-[10px] font-bold">
                                  {chatMessages.length}
                                </span>
                              )}
                            </button>
                            <button 
                              onClick={() => { setActiveTab('participants'); setIsMoreMenuOpen(false); }}
                              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <Users size={16} className="text-slate-400" />
                                <span>Participants</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {remoteParticipants.length + 1}
                              </span>
                            </button>
                            <button 
                              onClick={() => { setActiveTab('notes'); setIsMoreMenuOpen(false); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                            >
                              <FileText size={16} className="text-slate-400" />
                              <span>Meeting notes</span>
                            </button>
                            <div className="h-px bg-white/10 my-1" />
                          </>
                        )}

                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-2 pt-1">
                          Layout & View
                        </p>
                        <button 
                          onClick={() => { setLayoutMode('tiled'); setIsMoreMenuOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors",
                            layoutMode === 'tiled' ? "text-accent-blue bg-accent-blue/10" : "text-white"
                          )}
                        >
                          <LayoutIcon size={16} className={layoutMode === 'tiled' ? "text-accent-blue" : "text-slate-400"} />
                          <span>Tiled layout</span>
                        </button>
                        <button 
                          onClick={() => { setLayoutMode('sidebar'); setIsMoreMenuOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors",
                            layoutMode === 'sidebar' ? "text-accent-blue bg-accent-blue/10" : "text-white"
                          )}
                        >
                          <Monitor size={16} className={layoutMode === 'sidebar' ? "text-accent-blue" : "text-slate-400"} />
                          <span>Sidebar layout</span>
                        </button>
                        <button 
                          onClick={() => { setLayoutMode('imo'); setIsMoreMenuOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors",
                            layoutMode === 'imo' ? "text-accent-blue bg-accent-blue/10" : "text-white"
                          )}
                        >
                          <LayoutIcon size={16} className={cn("text-slate-400", layoutMode === 'imo' && "text-accent-blue rotate-90")} />
                          <span>IMO view (filmstrip)</span>
                        </button>
                        <button 
                          onClick={() => { setHideNonVideo(!hideNonVideo); setIsMoreMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                        >
                          <UserX size={16} className="text-slate-400" />
                          <span>{hideNonVideo ? "Show non-video" : "Hide non-video"}</span>
                        </button>

                        <div className="h-px bg-white/10 my-1" />
                        <button 
                          onClick={() => { setActiveTab('settings'); setIsMoreMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                        >
                          <Settings size={16} className="text-slate-400" />
                          <span>Settings</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Right: End Call & Tabs & Collapse */}
            <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
              <div className="hidden md:flex items-center gap-1.5 lg:gap-2 mr-2 lg:mr-4">
                <TabButton active={activeTab === 'info'} onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')} icon={<Info size={20} />} title="Meeting Info" />
                <TabButton active={activeTab === 'users'} onClick={() => setActiveTab(activeTab === 'users' ? null : 'users')} icon={<Users size={20} />} badge={remoteParticipants.length + 1} title="Participants" />
                <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')} icon={<MessageSquare size={20} />} badge={chatMessages.length > 0 ? chatMessages.length : undefined} title="In-call Chat" />
                <TabButton active={activeTab === 'files'} onClick={() => setActiveTab(activeTab === 'files' ? null : 'files')} icon={<Paperclip size={20} />} badge={sharedFiles.length > 0 ? sharedFiles.length : undefined} title="Share Files" />
                <TabButton active={activeTab === 'whiteboard'} onClick={() => setActiveTab(activeTab === 'whiteboard' ? null : 'whiteboard')} icon={<Monitor size={20} />} title="Joint Workspace" />
                {isHost && (
                  <TabButton 
                    active={activeTab === 'waiting'} 
                    onClick={() => setActiveTab(activeTab === 'waiting' ? null : 'waiting')} 
                    icon={<ShieldCheck size={20} />} 
                    badge={pendingParticipants.length > 0 ? pendingParticipants.length : undefined}
                    title="Waiting Room"
                  />
                )}
              </div>
              <button 
                onClick={() => navigate('/')}
                className="w-[54px] h-[54px] md:w-[68px] md:h-[68px] bg-red-600 hover:bg-red-700 text-white rounded-[20px] md:rounded-[24px] flex items-center justify-center transition-all shadow-xl shadow-red-500/20 active:scale-95 group"
                title="Leave Call"
              >
                <PhoneOff size={isMobile ? 22 : 28} className="group-hover:rotate-12 transition-transform" />
              </button>

              {/* Collapse Toolbar Button (Material 3 style) */}
              <button
                onClick={() => setIsToolbarCollapsed(true)}
                className="p-2.5 sm:p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors ml-1"
                title="Collapse toolbar"
              >
                <ChevronDown size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Bottom Hover Zone when toolbar is collapsed */}
      {isToolbarCollapsed && (
        <div 
          onMouseEnter={() => setIsBottomHovered(true)}
          onMouseLeave={() => setIsBottomHovered(false)}
          className="fixed bottom-0 left-0 right-0 h-16 z-[75] flex items-end justify-center pb-3 pointer-events-auto"
        >
          <AnimatePresence>
            {isBottomHovered && (
              <motion.button
                initial={{ y: 24, opacity: 0, scale: 0.92 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 24, opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.16 }}
                onClick={() => setIsToolbarCollapsed(false)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900/95 hover:bg-slate-800 text-white border border-slate-700/80 rounded-full shadow-2xl backdrop-blur-md text-xs font-medium transition-all cursor-pointer group"
                title="Restore toolbar controls"
              >
                <ChevronUp size={16} className="text-[#a8c7fa] group-hover:-translate-y-0.5 transition-transform" />
                <span>Show meeting controls</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Right-Click Context Menu for Isolated Feed & Actions */}
      <AnimatePresence>
        {contextMenu && (
          <>
            <div 
              className="fixed inset-0 z-[120]" 
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              style={{ top: contextMenu.y, left: contextMenu.x }}
              className="fixed z-[130] w-56 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl p-1.5 text-xs text-slate-200 divide-y divide-slate-800"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 truncate">
                {contextMenu.participant.identity.split('#')[0]} {contextMenu.isLocal ? '(You)' : ''}
              </div>
              <div className="py-1 space-y-0.5">
                <button
                  onClick={() => {
                    togglePin(contextMenu.participant.identity);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg hover:bg-white/10 transition-colors text-slate-200"
                >
                  {pinnedIdentities.has(contextMenu.participant.identity) ? <PinOff size={14} /> : <Pin size={14} />}
                  <span>{pinnedIdentities.has(contextMenu.participant.identity) ? 'Unpin Feed' : 'Pin Feed'}</span>
                </button>
                <button
                  onClick={() => {
                    setSpotlightIdentity(contextMenu.participant.identity);
                    setLayoutMode('imo');
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg hover:bg-white/10 transition-colors text-slate-200"
                >
                  <Maximize2 size={14} />
                  <span>Maximize / Spotlight</span>
                </button>
                {!contextMenu.isLocal && (
                  <button
                    onClick={() => {
                      openSendFileFor(contextMenu.participant.identity);
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg hover:bg-white/10 transition-colors text-slate-200"
                  >
                    <Paperclip size={14} className="text-slate-400" />
                    <span>Send File in Call</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    copyIsolatedFeedLink(contextMenu.participant);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  <Radio size={14} className="text-blue-400" />
                  <span>Copy Isolated Feed Link</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* In-Call Send File Dialog Modal */}
      <SendFileDialog
        isOpen={isSendFileDialogOpen}
        onClose={() => setIsSendFileDialogOpen(false)}
        onSendFile={handleSendFile}
        participants={participantOptions}
        defaultRecipient={sendFileTarget}
      />

      {/* File Received Floating Notification */}
      <AnimatePresence>
        {fileTransferToast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 left-6 z-[140] flex items-center gap-3 px-4 py-3 bg-white text-gray-900 border border-gray-200 rounded-3xl shadow-xl backdrop-blur-md text-xs font-medium"
          >
            <div className="w-8 h-8 rounded-full bg-[#f1f3f4] text-gray-700 flex items-center justify-center shrink-0">
              <ArrowDownToLine size={16} />
            </div>
            <div className="min-w-0 max-w-[180px]">
              <p className="font-semibold truncate text-gray-900">{fileTransferToast.name}</p>
              <p className="text-[11px] text-gray-500 truncate">From {fileTransferToast.senderName}</p>
            </div>
            {fileTransferToast.downloadUrl && (
              <a
                href={fileTransferToast.downloadUrl}
                download={fileTransferToast.name}
                className="px-3.5 py-1.5 bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5"
              >
                <Download size={13} />
                <span>Save</span>
              </a>
            )}
            <button 
              onClick={() => setFileTransferToast(null)}
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-[#f1f3f4] rounded-full transition-colors ml-0.5"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimal Non-Intrusive Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-[140] flex items-center gap-2.5 px-4 py-3 bg-slate-900/95 text-slate-100 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md text-xs font-medium"
          >
            <Check className="text-emerald-400 shrink-0" size={16} />
            <span>{toastMessage}</span>
            <button 
              onClick={() => setToastMessage(null)}
              className="ml-2 p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Reactions Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
        <AnimatePresence>
          {reactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ y: '100vh', opacity: 0, scale: 0.5, x: `${r.x}%` }}
              animate={{ y: '-10vh', opacity: [0, 1, 1, 0], scale: [0.5, 1.5, 1.5, 1], x: [`${r.x}%`, `${r.x + (Math.random() * 10 - 5)}%`] }}
              transition={{ duration: 4, ease: "easeOut" }}
              className="absolute text-4xl select-none"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

function CustomParticipantTile({ trackRef, raisedHands, isPinned, onTogglePin, mirror, showName = true, isFocal, onSpotlight, onContextMenu, onCopyIsolatedFeed, onSendFile }: any) {
  const isSpeaking = useIsSpeaking(trackRef?.participant);
  const isVideoOff = !trackRef?.publication || trackRef.publication.isMuted || !trackRef.publication.isEnabled;
  const isHandRaised = raisedHands?.[trackRef?.participant.identity];
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Parse metadata for avatar
  const metadata = useMemo(() => {
    try {
      return JSON.parse(trackRef?.participant.metadata || "{}");
    } catch {
      return {};
    }
  }, [trackRef?.participant.metadata]);

  return (
    <div 
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      className={cn(
        "group relative w-full h-full rounded-2xl overflow-hidden bg-surface-lighter border-2 transition-all duration-300 select-none",
        isSpeaking ? "border-accent-blue shadow-[0_0_20px_rgba(66,133,244,0.4)]" : "border-transparent"
      )}
    >
      {isVideoOff ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a]">
          {metadata.avatar ? (
            <div className={cn(
              "w-24 h-24 rounded-full overflow-hidden border-4 border-accent-blue/20 shadow-2xl transition-all",
              isSpeaking ? "ring-4 ring-accent-blue/40 scale-110" : ""
            )}>
              <img src={metadata.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <div className={cn(
              "w-24 h-24 rounded-full bg-accent-blue flex items-center justify-center text-3xl font-bold text-white shadow-xl transition-all",
              isSpeaking ? "ring-4 ring-accent-blue/40" : ""
            )}>
              {trackRef?.participant.identity.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      ) : (
        <div className={cn("w-full h-full", mirror ? "scale-x-[-1]" : "")}>
          <VideoTrack 
            trackRef={trackRef} 
            className={cn("w-full h-full bg-black/40", isFocal ? "object-contain" : "object-cover")}
          />
        </div>
      )}

      {/* Overlay Info */}
      {showName && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 pointer-events-none">
          {!trackRef?.participant.isMicrophoneEnabled ? (
            <MicOff size={14} className="text-accent-red" />
          ) : isSpeaking ? (
            <div className="flex gap-0.5 items-end h-3">
              <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-0.5 bg-accent-blue" />
              <motion.div animate={{ height: [6, 12, 6] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-accent-blue" />
              <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-0.5 bg-accent-blue" />
            </div>
          ) : (
            <Mic size={14} className="text-white/70" />
          )}
          <span className="text-white text-[13px] font-medium truncate max-w-[140px]">
            {trackRef?.participant.identity.split('#')[0]}
            {trackRef?.participant.isLocal && " (You)"}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button 
          onClick={(e) => { e.stopPropagation(); onTogglePin?.(); }}
          className={cn(
            "p-2 rounded-lg backdrop-blur-md transition-all",
            isPinned ? "bg-accent-blue text-white" : "bg-black/40 text-white/70 hover:bg-black/60"
          )}
          title={isPinned ? "Unpin" : "Pin for me"}
        >
          {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <div className="relative">
          <button 
            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
            className="p-2 rounded-lg bg-black/40 text-white/70 hover:bg-black/60 backdrop-blur-md transition-all"
            title="More Options"
          >
            <MoreVertical size={16} />
          </button>
          
          <AnimatePresence>
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-[100] cursor-default" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 5 }}
                  className="absolute top-full right-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 z-[110]"
                >
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSpotlight?.(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                  >
                    <LayoutIcon size={14} />
                    Spotlight
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onTogglePin?.(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                  >
                    {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    {isPinned ? 'Unpin' : 'Pin for me'}
                  </button>
                  {!trackRef?.participant.isLocal && onSendFile && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onSendFile(trackRef?.participant.identity); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                    >
                      <Paperclip size={14} />
                      Send File
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); onCopyIsolatedFeed?.(); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-600/20 rounded-lg transition-colors font-medium text-left"
                  >
                    <Radio size={14} />
                    Copy Isolated Feed Link
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Hand Raised */}
      <AnimatePresence>
        {isHandRaised && (
          <motion.div 
            initial={{ scale: 0, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0, y: 20 }}
            className="absolute top-3 left-3 bg-yellow-400 p-2 rounded-lg shadow-xl z-20 flex items-center gap-2"
          >
            <Hand size={18} className="text-bg-dark" />
            <span className="text-[11px] font-bold text-bg-dark uppercase tracking-tighter">Raised</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ParticipantItem(props: any) {
  const { participant, isLocal, onSendFile } = props;
  return (
    <div className="flex items-center justify-between py-2.5 px-3 border-b border-gray-100 bg-white hover:bg-gray-50/80 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold border border-blue-200 shrink-0">
          {participant.identity.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-gray-900 truncate">
            {participant.identity.split('#')[0]} {isLocal && "(You)"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!isLocal && onSendFile && (
          <button
            onClick={() => onSendFile(participant.identity)}
            title={`Send file to ${participant.identity.split('#')[0]}`}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Paperclip size={14} />
          </button>
        )}
        {!participant.isMicrophoneEnabled ? <MicOff size={14} className="text-accent-red" /> : <Mic size={14} className="text-gray-500" />}
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, icon, danger, warning, highlight, micVideo, enabled, title, hasDropdown, onDropdownClick, size }: any) {
  const isSmall = size === "small";
  return (
    <div className="flex items-center group/btn relative">
      <button 
        onClick={onClick}
        title={title}
        className={cn(
          "transition-all duration-300 ease-out flex items-center justify-center flex-shrink-0 shadow-sm",
          isSmall ? "w-[48px] h-[48px] rounded-[16px]" : "w-[60px] h-[60px] rounded-[22px]",
          hasDropdown ? "rounded-r-none border-r border-white/5" : "",
          micVideo ? (
            enabled ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-red-600 text-white hover:bg-red-700"
          ) : (
            danger && !active ? "bg-red-600 text-white hover:bg-red-700" : 
            warning && active ? "bg-yellow-400 text-slate-900 hover:bg-white" :
            highlight && active ? "bg-accent-blue text-white" :
            active ? "bg-accent-blue text-white" : "bg-slate-800 text-white hover:bg-slate-700"
          ),
          "active:scale-95"
        )}
      >
        {icon}
      </button>
      {hasDropdown && (
        <button
          onClick={onDropdownClick}
          className="w-[28px] h-[60px] bg-slate-800 text-white/70 hover:text-white rounded-r-[22px] hover:bg-slate-700 transition-all flex items-center justify-center border-l border-white/10"
        >
          <ChevronUp size={16} className="group-hover/btn:translate-y-[-1px] transition-transform" />
        </button>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, badge }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-11 h-11 rounded-full transition-all duration-200 ease-out relative flex items-center justify-center",
        active ? "bg-white/10 text-white shadow-lg shadow-black/10" : "bg-transparent text-slate-200 hover:bg-white/10 hover:text-white"
      )}
    >
      {icon}
      {badge !== undefined && (
        <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 bg-white text-slate-900 text-[9px] font-bold px-1.5 rounded-full min-w-[18px]">
          {badge}
        </span>
      )}
    </button>
  );
}

const NotesPanel = React.memo(({ user, autoSaveTranscript, setAutoSaveTranscript, activeTranscriptNoteId }: { user: any, navigate: any, autoSaveTranscript: boolean, setAutoSaveTranscript: (v: boolean) => void, activeTranscriptNoteId?: string | null }) => {
  const { komuLogin, komuUser } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const [searchNotesTerm, setSearchNotesTerm] = useState("");
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const uid = komuUser?.uid;

  useEffect(() => {
    if (activeTranscriptNoteId && notes.length > 0 && !selectedNote) {
      const activeNote = notes.find(n => n.id === activeTranscriptNoteId);
      if (activeNote) {
        setSelectedNote(activeNote);
      }
    }
  }, [activeTranscriptNoteId, notes.length, selectedNote]);

  useEffect(() => {
    if (!uid) return;
    console.log("[NotesPanel] Fetching notes for Komu UID:", uid);
    try {
      // Query notes collection for this user's UID in the komu project
      const q = query(
        collection(komuDb, 'notes'),
        where('uid', '==', uid),
        where('isTrash', '==', false)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        // Manual sort in client
        data.sort((a: any, b: any) => {
          const tA = a.updatedAt?.toMillis?.() || 0;
          const tB = b.updatedAt?.toMillis?.() || 0;
          return tB - tA;
        });
        setNotes(data);

        // Update selected note if it was updated in background
        if (selectedNote) {
          const updatedSelected = data.find(n => n.id === selectedNote.id);
          if (updatedSelected && updatedSelected.body !== selectedNote.body) {
             setSelectedNote(updatedSelected);
          }
        }
      }, (err) => {
        console.error("NotesPanel fetch error (komu-notes project)::", err);
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("Firestore error in NotesPanel:", err);
    }
  }, [uid, selectedNote?.id]);

  const handleUpdateNote = async () => {
    if (!selectedNote || isSaving) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(komuDb, 'notes', selectedNote.id), {
        title: selectedNote.title,
        body: selectedNote.body,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to update note:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!komuUser || (!newNoteTitle.trim() && !newNoteBody.trim())) return;
    try {
      await addDoc(collection(komuDb, 'notes'), {
        uid: komuUser.uid,
        title: newNoteTitle,
        body: newNoteBody,
        type: 'text',
        isArchive: false,
        isTrash: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        color: '#ffffff'
      });
      setNewNoteTitle("");
      setNewNoteBody("");
      setIsCreatingNote(false);
    } catch (err) {
      console.error("Failed to add note to komu-notes project:", err);
    }
  };

  const toggleArchive = async (id: string, isArchive: boolean) => {
    try {
      await updateDoc(doc(komuDb, 'notes', id), { isArchive, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error("Failed to archive note:", err);
    }
  };

  const toggleTrash = async (id: string, isTrash: boolean) => {
    try {
      await updateDoc(doc(komuDb, 'notes', id), { isTrash, updatedAt: serverTimestamp() });
      if (selectedNote?.id === id) {
        setSelectedNote(null);
      }
    } catch (err) {
      console.error("Failed to trash note:", err);
    }
  };

  if (!user || !komuUser) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-8">
        <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 shadow-inner relative">
          <FileText size={48} />
          <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
             <ShieldCheck size={18} className="text-green-500" />
          </div>
        </div>
        <div className="space-y-3">
           <h3 className="text-xl font-bold text-gray-900 leading-tight">Secure Notes Sync</h3>
           <p className="text-sm text-gray-500 max-w-[240px] mx-auto">Access your Komu Notes directly in the meeting. Your notes are private and encrypted.</p>
        </div>
        <button 
          onClick={komuLogin}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>{user ? "Link Komu Account" : "Sign in with Google"}</span>
        </button>
      </div>
    );
  }

  if (selectedNote) {
    return (
      <div className="flex flex-col h-full bg-white -m-5 p-4 z-20">
        <div className="flex items-center gap-3 mb-4 sticky top-0 bg-white z-10 pb-2 border-b border-gray-50">
          <button 
             onClick={() => { handleUpdateNote(); setSelectedNote(null); }} 
             className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-all flex items-center justify-center"
             title="Back to list"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
             <input 
                value={selectedNote.title}
                onChange={(e) => setSelectedNote({...selectedNote, title: e.target.value})}
                placeholder="Title"
                className="w-full text-lg font-bold text-gray-900 bg-transparent border-none outline-none placeholder:text-gray-300"
                onBlur={handleUpdateNote}
             />
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={handleUpdateNote} 
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-500/10"
            >
              <Save size={14} />
              <span>{isSaving ? "Saving..." : "Save"}</span>
            </button>
            <button 
              onClick={() => toggleTrash(selectedNote.id, true)} 
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Delete note"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <textarea 
          value={selectedNote.body}
          onChange={(e) => setSelectedNote({...selectedNote, body: e.target.value})}
          placeholder="Start writing..."
          className="flex-1 w-full text-sm text-gray-800 bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-gray-300 custom-scroll"
          onBlur={handleUpdateNote}
        />
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
           <span className="text-[10px] text-gray-400 font-medium">
             Last edited {selectedNote.updatedAt?.toDate() ? format(selectedNote.updatedAt.toDate(), 'PPp') : 'Just now'}
           </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="mb-4 space-y-4 shrink-0">
        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                <Languages size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-900 leading-none mb-1">Auto-Transcript</span>
                <span className="text-[10px] text-gray-500 font-medium leading-none">Save meeting to notes</span>
              </div>
            </div>
            <button 
               onClick={() => setAutoSaveTranscript(!autoSaveTranscript)}
               className={cn(
                 "w-10 h-5 rounded-full relative transition-all duration-300",
                 autoSaveTranscript ? "bg-blue-600" : "bg-gray-300"
               )}
            >
              <div className={cn(
                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300",
                autoSaveTranscript ? "left-6" : "left-1"
              )} />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 peer-focus:text-blue-500 transition-colors" size={16} />
          <input 
            type="text"
            placeholder="Search notes..."
            value={searchNotesTerm}
            onChange={(e) => setSearchNotesTerm(e.target.value)}
            className="peer w-full pl-10 pr-4 py-2 bg-gray-100 border-2 border-transparent rounded-xl text-sm text-black focus:ring-4 focus:ring-blue-500/10 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm font-medium"
          />
        </div>
        {!isCreatingNote ? (
          <button 
            onClick={() => setIsCreatingNote(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-600/20"
          >
            <Plus size={18} />
            Take a note
          </button>
        ) : (
          <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-xl space-y-3">
            <input 
              type="text"
              placeholder="Title"
              autoFocus
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              className="w-full text-base font-bold bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-400"
            />
            <textarea 
              placeholder="Take a note..."
              value={newNoteBody}
              onChange={(e) => setNewNoteBody(e.target.value)}
              className="w-full text-sm bg-transparent border-none outline-none resize-none min-h-[100px] text-gray-800 placeholder:text-gray-400"
            />
            <div className="flex items-center justify-between pt-2">
               <button 
                onClick={() => { setIsCreatingNote(false); setNewNoteTitle(""); setNewNoteBody(""); }}
                className="text-xs font-bold text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button 
                disabled={!newNoteTitle.trim() && !newNoteBody.trim()}
                onClick={handleAddNote}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all font-medium"
              >
                Save note
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto custom-scroll pr-2">
        {notes
          .filter(n => n.title.toLowerCase().includes(searchNotesTerm.toLowerCase()) || n.body.toLowerCase().includes(searchNotesTerm.toLowerCase()))
          .map(note => (
          <div 
            key={note.id} 
            onClick={() => setSelectedNote(note)}
            className="group p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all relative cursor-pointer"
          >
            <h4 className="font-bold text-gray-900 text-sm mb-1">{note.title || "Untitled"}</h4>
            <p className="text-gray-600 text-xs line-clamp-3 leading-relaxed whitespace-pre-wrap">
              {note.body}
            </p>
            <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] text-gray-400 font-medium">
                {note.updatedAt?.toDate() ? new Date(note.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
              </span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleArchive(note.id, !note.isArchive); }} 
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                >
                  <Archive size={14} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleTrash(note.id, true); }} 
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {notes.length === 0 && !isCreatingNote && (
          <div className="h-40 flex flex-col items-center justify-center text-center p-6 space-y-3 text-gray-400">
            <FileText size={32} />
            <p className="text-xs">Your saved notes will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
});
