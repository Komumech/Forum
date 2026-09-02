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
import { Track, ConnectionState, Participant, VideoPresets, AudioPresets, ScreenSharePresets, LocalVideoTrack } from 'livekit-client';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Hand, 
  MonitorUp, MonitorOff, MoreVertical, Info, Users, MessageSquare,
  X, Send, ChevronDown, Settings, Copy, Check, Pin, PinOff,
  Layout as LayoutIcon, ShieldCheck, UserX, VolumeX, Monitor, ArrowLeftRight, ArrowLeft,
  Sparkles, Camera, Speaker, Headphones, Clock, Smile, Heart, Languages,
  ChevronUp, ChevronLeft, ChevronRight, FileText, Plus, Search, Trash2, Archive, Save, LayoutGrid, Globe, Calendar, LayoutDashboard,
  Radio, Maximize2, Activity, CheckCheck, Cast, Sliders, Paperclip, ArrowDownToLine, Download,
  SwitchCamera, Wand2, SlidersHorizontal, Volume2
} from 'lucide-react';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import { SharedFileItem, SendFileDialog, SharedFileCard, FilesPanel } from '../components/FileTransfer';
import SettingsModal from '../components/SettingsModal';
import { useDeviceManager } from '../hooks/useDeviceManager';
import { AIVideoEnhanceOptions, DEFAULT_AI_VIDEO_ENHANCE, getAIVideoFilterStyle, useAIVideoAutoEnhancer, AIEnhancementFilterDefs } from '../utils/mediaEnhancer';
import { useFaceTracking } from '../hooks/useFaceTracking';
import { useVoiceActivity } from '../hooks/useVoiceActivity';
import { applyBackgroundEffect, BackgroundMode } from '../utils/backgroundProcessor';
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
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'chat' | 'settings' | 'waiting' | 'participants' | 'notes' | 'whiteboard' | 'files' | 'host_controls' | 'tools' | null>(null);
  const [isKomuToolsOpen, setIsKomuToolsOpen] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Enhanced Device Detection with Front/Back Camera Support
  const { 
    videoDevices, 
    audioDevices, 
    speakerDevices, 
    facingMode: currentFacingMode,
    refreshDevices 
  } = useDeviceManager();

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

    // Update presence to Busy in background if user is authenticated
    if (user) {
      setDoc(doc(db, 'userProfiles', user.uid), { status: 'busy' }, { merge: true }).catch(err => {
        console.warn("Could not update user profile status:", err);
      });
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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          // Try GET first
          const resp = await fetch(getUrl, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
          });
          clearTimeout(timeoutId);

          if (resp.ok) {
            tokenData = await resp.json();
            if (tokenData?.token) break;
          } else {
            // Try POST fallback
            const postController = new AbortController();
            const postTimeoutId = setTimeout(() => postController.abort(), 6000);
            const postResp = await fetch('/api/get-participant-token', {
              signal: postController.signal,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({
                room,
                username: uniqueIdentity,
                metadata
              })
            });
            clearTimeout(postTimeoutId);
            if (postResp.ok) {
              tokenData = await postResp.json();
              if (tokenData?.token) break;
            }
          }
        } catch (fetchErr) {
          lastFetchErr = fetchErr;
          console.warn(`[MeetingPage] Token fetch attempt ${attempt} failed:`, fetchErr);
          if (attempt < 3) {
            await new Promise(res => setTimeout(res, 400 * attempt));
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
      <div className="min-h-screen bg-white sm:bg-[#f4f5f6] flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center gap-8 lg:gap-14 bg-white sm:p-8 md:p-12 sm:rounded-[32px] sm:shadow-xl sm:border sm:border-gray-200/80">
          <div className="flex-1 w-full relative aspect-[4/3] sm:aspect-video bg-[#131416] rounded-2xl sm:rounded-3xl overflow-hidden shadow-inner group flex items-center justify-center">
            <div className="relative w-full h-full flex items-center justify-center">
              {preJoinCam && !cameraPermissionError ? (
                <video ref={videoRef} autoPlay muted playsInline className={cn("scale-x-[-1] w-full h-full object-cover", preJoinBg === 'blur' && "blur-md")} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#131416] p-6 text-center space-y-4">
                  {user?.photoURL ? (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-white/20 shadow-xl">
                      <img src={user.photoURL} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#202226] border border-white/10 flex items-center justify-center text-3xl sm:text-4xl font-bold text-white shadow-xl">
                      {name.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  {cameraPermissionError ? (
                    <div className="space-y-2 max-w-xs">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold border border-amber-500/25">
                        <VideoOff size={14} />
                        <span>Camera Off / Permission Needed</span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed">
                        You can join without video, or enable camera access in your browser.
                      </p>
                      <button
                        type="button"
                        onClick={requestCameraAccess}
                        className="mt-1 px-4 py-2 bg-[#4285f4] hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
                      >
                        Enable Camera
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs sm:text-sm font-medium">Camera is currently off</p>
                  )}
                </div>
              )}
            </div>
            
            {/* Audio & Video Controls with generous spacing */}
            <div className="absolute bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-4 transition-opacity z-20">
               <button 
                type="button"
                onClick={() => setPreJoinMic(!preJoinMic)}
                className={cn(
                  "w-12 h-12 rounded-full backdrop-blur-md border border-white/20 shadow-xl transition-all flex items-center justify-center active:scale-95",
                  preJoinMic ? "bg-[#282a2e]/90 text-white hover:bg-[#383a40]" : "bg-red-600 text-white hover:bg-red-500"
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
                  "w-12 h-12 rounded-full backdrop-blur-md border border-white/20 shadow-xl transition-all flex items-center justify-center active:scale-95",
                  preJoinCam ? "bg-[#282a2e]/90 text-white hover:bg-[#383a40]" : "bg-red-600 text-white hover:bg-red-500"
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
                    "w-12 h-12 rounded-full backdrop-blur-md border border-white/20 shadow-xl transition-all flex items-center justify-center active:scale-95",
                    preJoinBg !== 'none' ? "bg-[#4285f4] text-white hover:bg-blue-600" : "bg-[#282a2e]/90 text-white hover:bg-[#383a40]"
                  )}
                  title="Toggle Blur Effect"
                 >
                  <SlidersHorizontal size={20} />
                 </button>
               )}
            </div>

            {preJoinCam && videoDevices.length > 0 && (
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
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
                  className="bg-black/70 text-white text-xs px-2.5 py-1.5 rounded-xl border border-white/15 outline-none backdrop-blur-md"
                >
                  <option value="">Default Camera</option>
                  {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="w-full lg:w-[380px] space-y-6 text-center lg:text-left">
            <div>
              <div className="flex items-center justify-center lg:justify-start gap-2 text-accent-blue text-xs font-bold mb-2">
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

              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                {meetingDetails?.title || "Ready to join?"}
              </h1>
              {meetingDetails && (
                <p className="text-gray-500 text-xs sm:text-sm mt-1">
                  Hosted by <span className="font-bold text-accent-blue">{meetingDetails.hostName}</span>
                </p>
              )}
              <p className="text-gray-500 text-xs sm:text-sm mt-1">Room: <span className="font-mono font-bold text-accent-blue">{room}</span></p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className="space-y-4">
              {joinError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                  {joinError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 text-left">
                  Your Display Name <span className="text-accent-red">*</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Enter your name" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isJoining}
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-accent-blue focus:border-accent-blue outline-none text-sm font-semibold transition-all text-gray-900 placeholder:text-gray-400 disabled:opacity-60"
                />
              </div>

              <button 
                type="submit"
                disabled={!name.trim() || isJoining}
                className="w-full py-4 bg-accent-blue text-white rounded-xl font-bold text-sm hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-blue/25 flex items-center justify-center gap-2"
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
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
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
      options={{
        adaptiveStream: false,
        dynacast: false,
        videoCaptureDefaults: {
          resolution: VideoPresets.h1080.resolution,
        },
        publishDefaults: {
          videoSimulcastLayers: [
            VideoPresets.h1080,
            VideoPresets.h720,
            VideoPresets.h360
          ],
          videoEncoding: {
            maxBitrate: 3_500_000,
            maxFramerate: 30,
          },
          audioPreset: AudioPresets.musicHighQualityStereo,
          dtx: false,
          red: true,
          stopMicTrackOnMute: false,
        },
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 2,
          sampleRate: 48000,
        }
      }}
      onDisconnected={() => navigate('/')}
      className="h-full w-full"
    >
      <div className="flex flex-col h-full relative">
        <AIEnhancementFilterDefs />
        <MeetingRoomHeader 
          isRecording={isRecording} 
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
          meetingDetails={meetingDetails}
        />
      </div>
    </LiveKitRoom>
    </main>
  );
}

function MeetingRoomHeader({ isRecording }: { isRecording: boolean }) {
  if (!isRecording) return null;
  return (
    <header className="fixed top-3.5 left-4 z-30 pointer-events-none">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-full text-xs font-bold border border-red-500/30 backdrop-blur-md shadow-md">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span>REC</span>
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

function MeetingRoomContent({ room, videoDevices, audioDevices, speakerDevices, initialBg, initialMic, initialCam, activeTab, setActiveTab, meetingDetails }: { room: string, videoDevices: any[], audioDevices: any[], speakerDevices: any[], initialBg: 'none' | 'blur' | 'image', initialMic: boolean, initialCam: boolean, activeTab: any, setActiveTab: (t: any) => void, meetingDetails: any }) {
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
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return isMobileBrowser() || window.innerWidth < 640;
  }, []);

  // Screen orientation detection strictly for small handheld mobile devices rotated sideways
  const [isMobileLandscape, setIsMobileLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isTouchPhone = isMobileBrowser() || (window.innerWidth < 900 && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 1));
    return isTouchPhone && window.innerWidth > window.innerHeight && window.innerHeight < 520;
  });

  useEffect(() => {
    const handleOrientationChange = () => {
      const isTouchPhone = isMobileBrowser() || (window.innerWidth < 900 && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 1));
      setIsMobileLandscape(isTouchPhone && window.innerWidth > window.innerHeight && window.innerHeight < 520);
    };
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

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

  // Settings & Media Enhancements
  const [settingsCategory, setSettingsCategory] = useState<'video' | 'audio' | 'streaming' | 'general' | 'effects' | 'captions' | 'reactions'>('video');
  const [videoMirroring, setVideoMirroring] = useState(true);
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [aiDenoise, setAiDenoise] = useState(true);
  const [hvacFilter, setHvacFilter] = useState(true);
  const [vocalCompressor, setVocalCompressor] = useState(true);
  const [aiVideoOptions, setAiVideoOptions] = useState<AIVideoEnhanceOptions>(DEFAULT_AI_VIDEO_ENHANCE);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showParticipantNames, setShowParticipantNames] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [showClock, setShowClock] = useState(true);
  const [selectedResolution, setSelectedResolution] = useState<'360p' | '720p'>('720p');
  const [selectedBg, setSelectedBg] = useState<BackgroundMode>((initialBg as BackgroundMode) || 'none');
  const [selectedBgImage, setSelectedBgImage] = useState('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80');
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reactions, setReactions] = useState<{ id: number, emoji: string, x: number }[]>([]);
  const [isReactionsMenuOpen, setIsReactionsMenuOpen] = useState(false);

  const handleFlipCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (localParticipant?.isCameraEnabled) {
      try {
        await localParticipant.setCameraEnabled(true, {
          facingMode: nextFacing,
          resolution: VideoPresets.h1080.resolution,
        });
        setToastMessage(`Switched to ${nextFacing === 'user' ? 'Front' : 'Back'} Camera`);
        setTimeout(() => setToastMessage(null), 2500);
      } catch (err: any) {
        console.warn("Failed to switch camera:", err);
      }
    }
  };

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

  // Dynamic real-time AI auto enhancement engine
  const localCameraTrack = localParticipant?.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
  const { filterStyle: localAIVideoFilter, autoState: aiAutoState } = useAIVideoAutoEnhancer(
    { publication: { track: { mediaStreamTrack: localCameraTrack } } },
    aiVideoOptions
  );
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
    
    // 1. Immediate synchronous / direct clipboard copy to preserve user gesture
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(feedUrl);
        copied = true;
      }
    } catch (err) {
      console.warn("Direct clipboard write failed, attempting fallback textarea copy:", err);
    }

    if (!copied) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = feedUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        textArea.setAttribute("readonly", "");
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (fallbackErr) {
        console.warn("Fallback copy error:", fallbackErr);
      }
    }

    setToastMessage("Feed link copied to clipboard! Ready to paste into OBS or browser.");
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);

    // 2. Background async save to Firestore
    try {
      setDoc(doc(db, 'rooms', room, 'feedExports', exportId), {
        id: exportId,
        token: exportToken,
        roomId: room,
        participantIdentity: identity,
        participantName: participantName,
        isLocal: participant.isLocal,
        createdAt: Date.now(),
        active: true,
      }).catch(e => console.warn("Could not persist feed export to Firestore:", e));
    } catch (err) {
      console.warn("Could not save feed export to Firestore:", err);
    }
  };

  const copyVideoFrameSnapshot = async (participant: Participant) => {
    if (!participant) return;
    try {
      // Find video element matching this participant
      const videos = document.querySelectorAll('video');
      let targetVideo: HTMLVideoElement | null = null;
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const pSid = (v.closest('[data-participant-identity]') as HTMLElement)?.dataset?.participantIdentity;
        if (pSid === participant.identity || (!pSid && participant.isLocal)) {
          targetVideo = v;
          break;
        }
      }

      if (!targetVideo && videos.length > 0) {
        targetVideo = videos[0];
      }

      if (targetVideo && targetVideo.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = targetVideo.videoWidth;
        canvas.height = targetVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(targetVideo, 0, 0);
          canvas.toBlob(async (blob) => {
            if (blob && navigator.clipboard && (window as any).ClipboardItem) {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': blob })
                ]);
                setToastMessage("Video snapshot copied to clipboard as image!");
                setTimeout(() => setToastMessage(null), 3000);
                return;
              } catch (clipErr) {
                console.warn("ClipboardItem write failed:", clipErr);
              }
            }
            // Fallback download if clipboard item not supported
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `snapshot_${participant.identity.split('#')[0]}_${Date.now()}.png`;
            link.click();
            setToastMessage("Video snapshot saved!");
            setTimeout(() => setToastMessage(null), 3000);
          }, 'image/png');
          return;
        }
      }
      setToastMessage("Snapshot copied!");
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.warn("Snapshot capture error:", err);
      setToastMessage("Could not capture frame snapshot");
      setTimeout(() => setToastMessage(null), 2500);
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

  // Live Captions Logic with resilient auto-restart and speech activity
  useEffect(() => {
    if (!isCaptionsEnabled || !localParticipant) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not available in this browser environment.");
      return;
    }

    let isDestroyed = false;
    let recognition: any = null;

    const startRecognition = () => {
      if (isDestroyed || !isCaptionsEnabled) return;

      try {
        if (recognition) {
          try { recognition.abort(); } catch {}
        }

        recognition = new SpeechRecognition();
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

            // Broadcast transcription to other participants
            sendTranscription(new TextEncoder().encode(JSON.stringify({
              text: text,
              identity: localParticipant.identity,
              isFinal: finalTranscript !== ''
            })), { reliable: true });

            if (finalTranscript !== '') {
              appendToTranscriptNote("You", finalTranscript);
            }

            if (finalTranscript) {
              setTimeout(() => {
                setLocalTranscript(prev => prev === text ? "" : prev);
              }, 4000);
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech' || event.error === 'audio-capture') {
            // normal silence or brief pause, will restart cleanly
          }
        };

        recognition.onend = () => {
          if (!isDestroyed && isCaptionsEnabled) {
            setTimeout(startRecognition, 200);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn("Speech recognition restart note:", err);
      }
    };

    startRecognition();

    return () => {
      isDestroyed = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, [isCaptionsEnabled, localParticipant, isMicEnabled]);

  // Handle Incoming Transcriptions
  const { send: sendTranscription } = useDataChannel("transcription", (msg) => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(msg.payload));
      
      if (payload.isFinal) {
        appendToTranscriptNote(payload.identity.split('#')[0], payload.text);
      }

      setTranscriptions(prev => {
        // Keep only recent transcriptions within 6s
        const now = Date.now();
        const filtered = prev.filter(t => now - t.timestamp < 6000 && t.identity !== payload.identity);
        return [...filtered, {
          id: Math.random().toString(),
          identity: payload.identity,
          text: payload.text,
          timestamp: now
        }];
      });
    } catch {}
  });

  // Apply Background Effects (Blur, Green Screen Chroma Key, Studio Colors, Virtual Images)
  useEffect(() => {
    const applyProcessor = async () => {
      if (!localParticipant || !localParticipant.isCameraEnabled) return;
      
      const track = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack;
      if (!track) return;

      const bgSource = customBgImage || selectedBgImage;
      await applyBackgroundEffect(track, selectedBg, {
        imageUrl: bgSource,
        colorHex: selectedBgImage,
        chromaKeyHex: selectedBgImage,
        blurRadius: 12
      });
    };

    applyProcessor();
  }, [selectedBg, selectedBgImage, customBgImage, localParticipant, localParticipant?.isCameraEnabled]);

  // Apply Device Changes & Settings
  useEffect(() => {
    if (selectedVideoId && localParticipant?.isCameraEnabled) {
      localParticipant.setCameraEnabled(true, { deviceId: selectedVideoId }).catch(err => {
        console.warn("Could not switch video device:", err?.message || err);
      });
    }
  }, [selectedVideoId, localParticipant]);

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
                {(() => {
                  let pAvatar = "";
                  try {
                    pAvatar = JSON.parse(pendingParticipants[0]?.metadata || "{}").avatar;
                  } catch (e) {}
                  return pAvatar ? (
                    <img src={pAvatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/20" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                      {pendingParticipants[0].identity.charAt(0).toUpperCase()}
                    </div>
                  );
                })()}
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
        "flex-1 relative flex flex-col items-center justify-center p-2 sm:p-3 pt-1 sm:pt-2 bg-[#131416] overflow-hidden min-h-0 transition-all duration-300",
        isMobileLandscape 
          ? (isToolbarCollapsed ? "pr-2 sm:pr-3 pb-2 sm:pb-3" : "pr-[78px] sm:pr-[90px] pb-2 sm:pb-3") 
          : (isToolbarCollapsed ? "pb-2 sm:pb-3" : "pb-[96px] sm:pb-[106px]")
      )}>
        {/* Click Outside Backdrop for Dropdowns */}
        {(isMicMenuOpen || isCamMenuOpen || isReactionsMenuOpen || isMoreMenuOpen) && (
          <div 
            className="fixed inset-0 z-[65]" 
            onClick={() => {
              setIsMicMenuOpen(false);
              setIsCamMenuOpen(false);
              setIsReactionsMenuOpen(false);
              setIsMoreMenuOpen(false);
            }} 
          />
        )}
        <div className={cn(
          "relative w-full h-full transition-all duration-500 min-h-0 flex flex-col justify-center items-center",
          activeTab && activeTab !== 'settings' && !isMobile 
            ? (activeTab === 'whiteboard' ? "hidden md:block md:mr-[84vw] lg:mr-[76vw] xl:mr-[72vw]" : "lg:mr-[380px]") 
            : ""
        )}>
          {computedLayout === 'imo' && focusTrack ? (
            <div className="flex flex-col h-full w-full gap-3">
              {/* Top Filmstrip - Smaller and more compact */}
              <div className="h-[84px] md:h-[110px] flex items-center gap-2.5 overflow-x-auto pb-1.5 custom-scroll scroll-smooth px-1">
                {processedTracks.filter(t => t.participant.identity !== focusTrack.participant.identity).map(t => (
                  <div key={t.participant.sid} className="h-full aspect-video flex-shrink-0">
                    <CustomParticipantTile 
                      trackRef={t} 
                      raisedHands={raisedHands}
                      onTogglePin={() => togglePin(t.participant.identity)}
                      isPinned={pinnedIdentities.has(t.participant.identity)}
                      mirror={t.participant.isLocal && videoMirroring}
                      aiVideoFilter={t.participant.isLocal ? localAIVideoFilter : undefined}
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
              {/* Central Person - Respects original camera orientation and prevents top cropping */}
              <div className="flex-1 min-h-0 relative flex items-center justify-center p-2">
                <div className="w-full h-full max-w-4xl max-h-[calc(100vh-220px)] aspect-video flex items-center justify-center">
                  <CustomParticipantTile 
                    trackRef={focusTrack} 
                    raisedHands={raisedHands}
                    onTogglePin={() => togglePin(focusTrack.participant.identity)}
                    isPinned={pinnedIdentities.has(focusTrack.participant.identity)}
                    mirror={focusTrack.participant.isLocal && videoMirroring}
                    aiVideoFilter={focusTrack.participant.isLocal ? localAIVideoFilter : undefined}
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
            <div className="flex flex-col md:flex-row gap-3 h-full w-full">
              <div className="flex-[3] bg-bg-dark rounded-2xl overflow-hidden relative shadow-2xl border border-white/5">
                <CustomParticipantTile 
                  trackRef={focusTrack} 
                  raisedHands={raisedHands} 
                  isPinned={pinnedIdentities.has(focusTrack.participant.identity)}
                  onTogglePin={() => togglePin(focusTrack.participant.identity)}
                  mirror={focusTrack.participant.isLocal && videoMirroring}
                  aiVideoFilter={focusTrack.participant.isLocal ? localAIVideoFilter : undefined}
                  showName={showParticipantNames}
                  isFocal
                  onContextMenu={(e: any) => handleTileContextMenu(e, focusTrack)}
                  onCopyIsolatedFeed={() => copyIsolatedFeedLink(focusTrack.participant)}
                  onSendFile={(identity: string) => openSendFileFor(identity)}
                />
              </div>
              {/* Sidebar Rail - Fixed for mobile visibility */}
              <div className="w-full md:w-[260px] h-[110px] md:h-full overflow-x-auto md:overflow-y-auto flex md:flex-col gap-2.5 custom-scroll p-1 shrink-0">
                {processedTracks.filter(t => t.participant.sid !== focusTrack.participant.sid).map(t => (
                  <div key={t.participant.sid} className="h-full md:h-auto aspect-video flex-shrink-0">
                    <CustomParticipantTile 
                      trackRef={t} 
                      raisedHands={raisedHands}
                      onTogglePin={() => togglePin(t.participant.identity)}
                      isPinned={pinnedIdentities.has(t.participant.identity)}
                      mirror={t.participant.isLocal && videoMirroring}
                      aiVideoFilter={t.participant.isLocal ? localAIVideoFilter : undefined}
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
                    aiVideoFilter={mobilePrimaryTrack.participant.isLocal ? localAIVideoFilter : undefined}
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
                  "absolute bottom-4 z-20 w-[130px] h-[175px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-bg-dark active:scale-105 transition-transform cursor-move",
                  mobileOverlaySide === 'right' ? 'right-3' : 'left-3'
                )}>
                  <div className="relative w-full h-full">
                    <CustomParticipantTile 
                      trackRef={mobileSecondaryTrack} 
                      raisedHands={raisedHands}
                      onTogglePin={() => togglePin(mobileSecondaryTrack.participant.identity)}
                      isPinned={pinnedIdentities.has(mobileSecondaryTrack.participant.identity)}
                      mirror={mobileSecondaryTrack.participant.isLocal && videoMirroring}
                      aiVideoFilter={mobileSecondaryTrack.participant.isLocal ? localAIVideoFilter : undefined}
                      showName={showParticipantNames}
                      onContextMenu={(e: any) => handleTileContextMenu(e, mobileSecondaryTrack)}
                      onCopyIsolatedFeed={() => copyIsolatedFeedLink(mobileSecondaryTrack.participant)}
                      onSendFile={(identity: string) => openSendFileFor(identity)}
                    />
                    <div className="absolute top-2.5 right-2.5 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
              <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 min-h-0 min-w-0">
                <div className="w-full h-full max-w-[min(92vw,980px)] max-h-[calc(100vh-130px)] flex items-center justify-center">
                  <CustomParticipantTile 
                    trackRef={visibleTracks[0]} 
                    raisedHands={raisedHands}
                    onTogglePin={() => togglePin(visibleTracks[0].participant.identity)}
                    isPinned={pinnedIdentities.has(visibleTracks[0].participant.identity)}
                    mirror={visibleTracks[0].participant.isLocal && videoMirroring}
                    aiVideoFilter={visibleTracks[0].participant.isLocal ? localAIVideoFilter : undefined}
                    showName={showParticipantNames}
                    isFocal
                    onContextMenu={(e: any) => handleTileContextMenu(e, visibleTracks[0])}
                    onCopyIsolatedFeed={() => copyIsolatedFeedLink(visibleTracks[0].participant)}
                    onSendFile={(identity: string) => openSendFileFor(identity)}
                  />
                </div>
              </div>
            ) : (
              <div 
                className="grid gap-2 sm:gap-3 w-full h-full items-stretch min-h-0 min-w-0"
                style={{ 
                  gridTemplateColumns: isMobile
                    ? 'repeat(1, minmax(0, 1fr))'
                    : visibleTracks.length === 2 
                      ? 'repeat(auto-fit, minmax(320px, 1fr))' 
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
                    aiVideoFilter={t.participant.isLocal ? localAIVideoFilter : undefined}
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
          "fixed left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50 pointer-events-none transition-all duration-300",
          isToolbarCollapsed ? "bottom-16" : "bottom-[95px]"
        )}>
          <AnimatePresence>
            {isCaptionsEnabled && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="flex flex-col items-center gap-2 text-center"
              >
                {transcriptions.map(t => (
                  <motion.div 
                    key={t.id} 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-black/85 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-white/20 text-white text-base md:text-lg font-medium shadow-2xl inline-flex items-center gap-2 max-w-full"
                  >
                    <span className="text-blue-400 font-semibold px-2 py-0.5 rounded-md bg-blue-500/20 text-sm">
                      {t.identity.split('#')[0]}:
                    </span>
                    <span className="truncate">{t.text}</span>
                  </motion.div>
                ))}

                {localTranscript && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-black/90 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-blue-500/40 text-white text-base md:text-lg font-medium shadow-2xl inline-flex items-center gap-2 max-w-full ring-2 ring-blue-500/20"
                  >
                    <span className="text-blue-300 font-semibold px-2 py-0.5 rounded-md bg-blue-600/30 text-sm">
                      You:
                    </span>
                    <span className="truncate">{localTranscript}</span>
                  </motion.div>
                )}

                {!localTranscript && transcriptions.length === 0 && (
                  <div className="bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs text-white/80 shadow-lg flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>Live captions active — speak to transcribe</span>
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
                isMobileLandscape || isToolbarCollapsed ? "bottom-0" : "bottom-[88px]",
                activeTab === 'whiteboard' 
                  ? "w-full md:w-[84vw] lg:w-[76vw] xl:w-[72vw]" 
                  : (isMobile && !isMobileLandscape ? "w-full inset-x-0" : "w-[360px] sm:w-[380px] md:w-[400px]")
              )}
            >
              {/* Sidebar Header (Hidden for whiteboard since JointWorkspace renders its own unified top bar; minimal X-only for files) */}
              {activeTab !== 'whiteboard' && (
                <div className={cn(
                  "flex items-center px-4 sm:px-5 py-2.5 border-b border-gray-100 bg-white sticky top-0 z-10",
                  activeTab === 'files' ? "justify-end" : "justify-between"
                )}>
                  {activeTab !== 'files' && (
                    <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                      {activeTab === 'info' && <Info size={18} className="text-slate-700" />}
                      {(activeTab === 'participants' || activeTab === 'users') && <Users size={18} className="text-slate-700" />}
                      {activeTab === 'chat' && <MessageSquare size={18} className="text-slate-700" />}
                      {activeTab === 'waiting' && <ShieldCheck size={18} className="text-slate-700" />}
                      {activeTab === 'notes' && <FileText size={18} className="text-slate-700" />}
                      {activeTab === 'host_controls' && <ShieldCheck size={18} className="text-blue-600" />}
                      {activeTab === 'tools' && <LayoutGrid size={18} className="text-blue-600" />}
                      <span>
                        {activeTab === 'host_controls' 
                          ? "Host Controls" 
                          : activeTab === 'tools' 
                            ? "Tools & Workspace" 
                            : activeTab === 'info'
                              ? "Meeting Details"
                              : activeTab}
                      </span>
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
                {activeTab === 'host_controls' && (
                  <div className="space-y-6">
                    {/* Meeting Info & Joining Link */}
                    <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Meeting Information</p>
                        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          Room: {room}
                        </span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs text-gray-700 font-mono break-all select-all">
                        {window.location.href}
                      </div>
                      <button 
                        type="button"
                        onClick={handleCopy} 
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition-all text-xs font-bold shadow-sm active:scale-[0.98]"
                      >
                        {copied ? <Check size={16} className="text-white" /> : <Copy size={16} />}
                        <span>{copied ? 'Link Copied to Clipboard' : 'Copy Joining Link'}</span>
                      </button>
                    </div>

                    {/* Waiting Room & Admission Controls */}
                    <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">Waiting Room (Lobby)</p>
                          <p className="text-xs text-gray-500">
                            {pendingParticipants.length} waiting for approval
                          </p>
                        </div>
                        {pendingParticipants.length > 1 && isHost && (
                          <button
                            type="button"
                            onClick={admitAllUsers}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                          >
                            Admit All
                          </button>
                        )}
                      </div>

                      {pendingParticipants.length === 0 ? (
                        <div className="py-3 px-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
                          <p className="text-xs text-gray-500">No participants currently waiting in the lobby.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pendingParticipants.map(p => (
                            <div key={p.sid} className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200/80 transition-all">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {(() => {
                                  let pAvatar = "";
                                  try {
                                    pAvatar = JSON.parse(p.metadata || "{}").avatar;
                                  } catch (e) {}
                                  return pAvatar ? (
                                    <img src={pAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                                      {p.identity.charAt(0).toUpperCase()}
                                    </div>
                                  );
                                })()}
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-gray-900 block truncate">{p.identity.split('#')[0]}</span>
                                  <span className="text-[10px] text-amber-600 font-medium block">Waiting in lobby</span>
                                </div>
                              </div>
                              {isHost && (
                                <button 
                                  type="button"
                                  onClick={() => admitUser(p)}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                                >
                                  Admit
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* In-Call Participants Management */}
                    <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                          In-Call Participants ({remoteParticipants.length + 1})
                        </p>
                        {isHost && remoteParticipants.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              remoteParticipants.forEach(p => {
                                try {
                                  // Attempt remote track mute request if available
                                } catch (e) {}
                              });
                              setToastMessage("Requested all participants to mute");
                              setTimeout(() => setToastMessage(null), 2500);
                            }}
                            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Mute All
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5 rounded-xl overflow-hidden">
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
                  </div>
                )}

                {activeTab === 'tools' && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                      Collaboration & Tools
                    </p>

                    <button
                      type="button"
                      onClick={() => setActiveTab('whiteboard')}
                      className="w-full text-left p-4 bg-white hover:bg-blue-50/60 rounded-2xl border border-gray-200/80 hover:border-blue-300 transition-all shadow-sm group flex items-start gap-3.5"
                    >
                      <div className="p-2.5 rounded-xl bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                        <Monitor size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Joint Workspace</h3>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Collaborative whiteboard, shared drawing canvas, sticky notes, and diagrams.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('files')}
                      className="w-full text-left p-4 bg-white hover:bg-blue-50/60 rounded-2xl border border-gray-200/80 hover:border-blue-300 transition-all shadow-sm group flex items-start gap-3.5"
                    >
                      <div className="p-2.5 rounded-xl bg-purple-100 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                        <Paperclip size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-gray-900 group-hover:text-purple-600 transition-colors">Share Files</h3>
                          {sharedFiles.length > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                              {sharedFiles.length} file{sharedFiles.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Direct peer-to-peer file transfer and shared documents during the call.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('notes')}
                      className="w-full text-left p-4 bg-white hover:bg-blue-50/60 rounded-2xl border border-gray-200/80 hover:border-blue-300 transition-all shadow-sm group flex items-start gap-3.5"
                    >
                      <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                        <FileText size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">Meeting Notes & Live Transcript</h3>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Real-time live transcripts, meeting agendas, and collaborative notes.
                        </p>
                      </div>
                    </button>
                  </div>
                )}

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

        {/* Settings Central Modal with Full Mobile Optimization, Category Navigation & Custom Dropdowns */}
        <SettingsModal
          isOpen={activeTab === 'settings'}
          onClose={() => setActiveTab(null)}
          isMobile={isMobile}
          localParticipant={localParticipant}
          audioDevices={audioDevices as any}
          speakerDevices={speakerDevices as any}
          videoDevices={videoDevices as any}
          selectedAudioId={selectedAudioId}
          setSelectedAudioId={setSelectedAudioId}
          selectedSpeakerId={selectedSpeakerId}
          setSelectedSpeakerId={setSelectedSpeakerId}
          selectedVideoId={selectedVideoId}
          setSelectedVideoId={setSelectedVideoId}
          noiseCancellation={noiseCancellation}
          setNoiseCancellation={setNoiseCancellation}
          echoCancellation={echoCancellation}
          setEchoCancellation={setEchoCancellation}
          aiDenoise={aiDenoise}
          setAiDenoise={setAiDenoise}
          hvacFilter={hvacFilter}
          setHvacFilter={setHvacFilter}
          vocalCompressor={vocalCompressor}
          setVocalCompressor={setVocalCompressor}
          videoMirroring={videoMirroring}
          setVideoMirroring={setVideoMirroring}
          aiVideoOptions={aiVideoOptions}
          setAiVideoOptions={setAiVideoOptions}
          onFlipCamera={handleFlipCamera}
          facingMode={facingMode}
          showClock={showClock}
          setShowClock={setShowClock}
          lobbyEnabled={lobbyEnabled}
          setLobbyEnabled={setLobbyEnabled}
          isHost={isHost}
          room={room}
          isCaptionsEnabled={isCaptionsEnabled}
          setIsCaptionsEnabled={setIsCaptionsEnabled}
          selectedBg={selectedBg}
          setSelectedBg={setSelectedBg}
          selectedBgImage={selectedBgImage}
          setSelectedBgImage={setSelectedBgImage}
          customBgImage={customBgImage}
          setCustomBgImage={setCustomBgImage}
          bgImages={bgImages}
          activeFeedCount={activeFeedCount}
          feedExports={feedExports}
          streamProfile={streamProfile}
          setStreamProfile={setStreamProfile}
          liveResolution={liveResolution}
          liveFps={liveFps}
          liveBitrate={liveBitrate}
          copyIsolatedFeedLink={copyIsolatedFeedLink}
          copyExportLinkAgain={copyExportLinkAgain}
          revokeExportToken={revokeExportToken}
          copiedExportId={copiedExportId}
        />
      </div>

      {/* Taskbar - Clean Modern Bottom Dock for Desktop & Small Landscape Side Dock for mobile */}
      <AnimatePresence>
        {!isToolbarCollapsed && (
          <motion.div 
            initial={isMobileLandscape ? { x: 90, opacity: 0 } : { y: 88, opacity: 0 }}
            animate={isMobileLandscape ? { x: 0, opacity: 1 } : { y: 0, opacity: 1 }}
            exit={isMobileLandscape ? { x: 90, opacity: 0 } : { y: 88, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className={cn(
              "bg-[#121316] z-[70] transition-all duration-300 select-none",
              isMobileLandscape 
                ? "absolute top-0 right-0 bottom-0 w-[70px] sm:w-[80px] flex flex-col items-center justify-between py-2 sm:py-3 px-1.5 overflow-visible" 
                : "absolute bottom-0 left-0 right-0 h-[80px] md:h-[84px] flex items-center justify-between px-3 sm:px-6 md:px-8"
            )}
          >
            {/* Left: Balanced Spacer (Removed meeting code, time, and pulsing dot for minimalist layout) */}
            {!isMobileLandscape && (
              <div className="hidden md:flex flex-1 items-center justify-start" />
            )}

            {/* Main Controls: Centered on Desktop & Laptop */}
            <div className={cn(
              "flex flex-none items-center justify-center",
              isMobileLandscape ? "flex-col gap-2 sm:gap-2.5 w-full my-auto" : "gap-2 md:gap-3"
            )}>
              {/* Mic Control */}
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
                  isLandscape={isMobileLandscape}
                  title="Microphone (m)"
                />
                <AnimatePresence>
                  {isMicMenuOpen && !isMobile && (
                    <>
                      <div className="fixed inset-0 z-[110]" onClick={() => setIsMicMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "w-64 bg-[#282a2e]/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-2 z-[120]",
                          isMobileLandscape 
                            ? "fixed right-[78px] sm:right-[88px] top-1/2 -translate-y-1/2 max-h-[85vh]" 
                            : "absolute bottom-full mb-3 left-1/2 -translate-x-1/2"
                        )}
                      >
                        <p className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">Microphone</p>
                        <div className="max-h-48 overflow-y-auto custom-scroll">
                          {audioDevices.map(d => (
                            <button 
                              key={d.deviceId}
                              onClick={() => { setSelectedAudioId(d.deviceId); setIsMicMenuOpen(false); }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                                selectedAudioId === d.deviceId ? "bg-[#4285f4] text-white" : "text-slate-300 hover:bg-white/10"
                              )}
                            >
                              <Mic size={14} />
                              <span className="truncate">{d.label || `Microphone ${d.deviceId.slice(0, 4)}`}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Camera Control */}
              <div className="relative">
                <ControlButton 
                  onClick={async () => {
                    try {
                      const targetState = !localParticipant.isCameraEnabled;
                      setIsCamEnabled(targetState);
                      await localParticipant.setCameraEnabled(targetState);
                    } catch (err: any) {
                      console.warn("Camera toggle failed:", err?.message || err);
                    }
                  }}
                  icon={localParticipant.isCameraEnabled ? <VideoIcon size={isMobile ? 18 : 22} /> : <VideoOff size={isMobile ? 18 : 22} />}
                  micVideo={true}
                  enabled={localParticipant.isCameraEnabled}
                  onDropdownClick={() => setIsCamMenuOpen(!isCamMenuOpen)}
                  hasDropdown={!isMobile}
                  size={isMobile ? "small" : "normal"}
                  isLandscape={isMobileLandscape}
                  title="Camera (v)"
                />
                <AnimatePresence>
                  {isCamMenuOpen && !isMobile && (
                    <>
                      <div className="fixed inset-0 z-[110]" onClick={() => setIsCamMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "w-64 bg-[#282a2e]/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-2 z-[120]",
                          isMobileLandscape 
                            ? "fixed right-[78px] sm:right-[88px] top-1/2 -translate-y-1/2 max-h-[85vh]" 
                            : "absolute bottom-full mb-3 left-1/2 -translate-x-1/2"
                        )}
                      >
                        <p className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">Camera</p>
                        <div className="max-h-48 overflow-y-auto custom-scroll">
                          {videoDevices.map(d => (
                            <button 
                              key={d.deviceId}
                              onClick={() => { setSelectedVideoId(d.deviceId); setIsCamMenuOpen(false); }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                                selectedVideoId === d.deviceId ? "bg-[#4285f4] text-white" : "text-slate-300 hover:bg-white/10"
                              )}
                            >
                              <VideoIcon size={14} />
                              <span className="truncate">{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Mobile Flip Camera */}
              {isMobile && localParticipant.isCameraEnabled && (
                <ControlButton 
                  onClick={handleFlipCamera}
                  icon={<SwitchCamera size={18} />}
                  size="small"
                  isLandscape={isMobileLandscape}
                  title={`Flip Camera (${facingMode === 'user' ? 'Front' : 'Back'})`}
                />
              )}

              {/* Captions */}
              <ControlButton 
                active={isCaptionsEnabled} 
                onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
                size={isMobile ? "small" : "normal"}
                icon={<Languages size={isMobile ? 18 : 22} />}
                highlight={isCaptionsEnabled}
                isLandscape={isMobileLandscape}
                title="Captions (c)"
              />

              {!isMobile && (
                <>
                  <ControlButton 
                    active={isHandRaised} 
                    onClick={toggleHandRaise}
                    icon={<Hand size={22} />}
                    warning={isHandRaised}
                    isLandscape={isMobileLandscape}
                    title="Raise hand"
                  />
                  <ControlButton 
                    active={localParticipant.isScreenShareEnabled} 
                    onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled)}
                    icon={localParticipant.isScreenShareEnabled ? <MonitorOff size={22} /> : <MonitorUp size={22} />}
                    highlight={localParticipant.isScreenShareEnabled}
                    isLandscape={isMobileLandscape}
                    title="Share screen"
                  />
                </>
              )}

              {/* Reactions & Smile (Horizontal Menu Bar) */}
              <div className="relative">
                <ControlButton 
                  onClick={() => setIsReactionsMenuOpen(!isReactionsMenuOpen)}
                  icon={<Smile size={isMobile ? 18 : 22} />}
                  active={isReactionsMenuOpen}
                  size={isMobile ? "small" : "normal"}
                  isLandscape={isMobileLandscape}
                  title="Reactions"
                />
                <AnimatePresence>
                  {isReactionsMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[110]" onClick={() => setIsReactionsMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={cn(
                          "bg-[#282a2e]/98 backdrop-blur-2xl rounded-full shadow-2xl border border-white/10 px-3 py-1.5 z-[120] flex items-center gap-1.5 select-none",
                          isMobileLandscape 
                            ? "fixed right-[78px] sm:right-[88px] top-1/2 -translate-y-1/2" 
                            : "absolute bottom-full mb-3 left-1/2 -translate-x-1/2"
                        )}
                      >
                        {['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'].map(emoji => (
                          <button 
                            key={emoji}
                            type="button"
                            onClick={() => { sendReaction(emoji); setIsReactionsMenuOpen(false); }}
                            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-lg sm:text-xl hover:bg-white/15 rounded-full transition-transform active:scale-125 cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* End Call Button (Joined in the center button group) */}
              <button 
                type="button"
                onClick={() => navigate('/')}
                className={cn(
                  "bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer",
                  isMobile || isMobileLandscape ? "w-[44px] h-[44px] rounded-full" : "w-[48px] h-[48px] rounded-full"
                )}
                title="Leave Call"
              >
                <PhoneOff size={isMobile || isMobileLandscape ? 18 : 20} />
              </button>

              {/* More Options (3 Dots) */}
              <div className="relative">
                <ControlButton 
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  icon={<MoreVertical size={isMobile ? 18 : 20} />}
                  active={isMoreMenuOpen}
                  size={isMobile ? "small" : "normal"}
                  isLandscape={isMobileLandscape}
                  title="More options"
                />

                <AnimatePresence>
                  {isMoreMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[110]" onClick={() => setIsMoreMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "w-72 sm:w-80 bg-[#282a2e]/98 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-3 z-[120] overflow-y-auto custom-scroll",
                          isMobileLandscape 
                            ? "fixed right-[78px] sm:right-[88px] top-1/2 -translate-y-1/2 max-h-[90vh]" 
                            : "absolute bottom-full mb-3 right-0 sm:left-1/2 sm:-translate-x-1/2 max-w-[calc(100vw-24px)] max-h-[80vh]"
                        )}
                      >
                        {isMobile && (
                          <div className="p-2 flex items-center justify-between gap-1 mb-3 border-b border-white/10 pb-3 overflow-x-auto">
                            {['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'].map(emoji => (
                              <button 
                                key={emoji}
                                onClick={() => { sendReaction(emoji); setIsMoreMenuOpen(false); }}
                                className="w-8 h-8 flex items-center justify-center text-lg hover:bg-white/10 rounded-full transition-all active:scale-90 shrink-0"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Activities & Tools */}
                        <div className="space-y-1 mb-1">
                          <button 
                            onClick={() => { setActiveTab('tools'); setIsMoreMenuOpen(false); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <LayoutGrid size={16} className="text-slate-400" />
                              <span>Tools & Workspace</span>
                            </div>
                          </button>

                          <button 
                            onClick={() => { setActiveTab('host_controls'); setIsMoreMenuOpen(false); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <ShieldCheck size={16} className="text-slate-400" />
                              <span>Host controls</span>
                            </div>
                            {pendingParticipants.length > 0 && (
                              <span className="text-[10px] bg-amber-500 text-black font-bold px-1.5 py-0.5 rounded-full">
                                {pendingParticipants.length}
                              </span>
                            )}
                          </button>
                        </div>

                        <div className="h-px bg-white/10 my-2" />

                        {/* Layout & View */}
                        <div className="space-y-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-2 pt-1">
                            Layout & View
                          </p>
                          <button 
                            onClick={() => { setLayoutMode('tiled'); setIsMoreMenuOpen(false); }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors",
                              layoutMode === 'tiled' ? "text-[#4285f4] bg-[#4285f4]/10" : "text-white"
                            )}
                          >
                            <LayoutIcon size={16} className={layoutMode === 'tiled' ? "text-[#4285f4]" : "text-slate-400"} />
                            <span>Tiled layout</span>
                          </button>
                          <button 
                            onClick={() => { setLayoutMode('sidebar'); setIsMoreMenuOpen(false); }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors",
                              layoutMode === 'sidebar' ? "text-[#4285f4] bg-[#4285f4]/10" : "text-white"
                            )}
                          >
                            <Monitor size={16} className={layoutMode === 'sidebar' ? "text-[#4285f4]" : "text-slate-400"} />
                            <span>Sidebar layout</span>
                          </button>
                          <button 
                            onClick={() => { setLayoutMode('imo'); setIsMoreMenuOpen(false); }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors",
                              layoutMode === 'imo' ? "text-[#4285f4] bg-[#4285f4]/10" : "text-white"
                            )}
                          >
                            <LayoutIcon size={16} className={cn("text-slate-400", layoutMode === 'imo' && "text-[#4285f4] rotate-90")} />
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
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right: Tab Buttons (Host Controls, 3x3 Tools, Chat, Settings, Collapse) */}
            <div className={cn(
              "flex items-center",
              isMobileLandscape ? "flex-col gap-2 w-full mt-auto pt-2" : "flex-1 justify-end gap-1.5 sm:gap-2"
            )}>
              {!isMobileLandscape && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Host Controls button */}
                  <TabButton 
                    active={activeTab === 'host_controls'} 
                    onClick={() => setActiveTab(activeTab === 'host_controls' ? null : 'host_controls')} 
                    icon={<ShieldCheck size={20} />} 
                    badge={pendingParticipants.length > 0 ? pendingParticipants.length : undefined}
                    title="Host Controls" 
                  />

                  {/* 3x3 Dots Tools Button */}
                  <TabButton 
                    active={activeTab === 'tools' || activeTab === 'whiteboard' || activeTab === 'files'} 
                    onClick={() => setActiveTab(activeTab === 'tools' || activeTab === 'whiteboard' || activeTab === 'files' ? null : 'tools')} 
                    icon={<LayoutGrid size={20} />} 
                    badge={sharedFiles.length > 0 ? sharedFiles.length : undefined}
                    title="Tools & Workspace" 
                  />

                  {/* In-Call Chat */}
                  <TabButton 
                    active={activeTab === 'chat'} 
                    onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')} 
                    icon={<MessageSquare size={20} />} 
                    badge={chatMessages.length > 0 ? chatMessages.length : undefined} 
                    title="In-call Chat" 
                  />

                  {/* Settings */}
                  <TabButton 
                    active={activeTab === 'settings'} 
                    onClick={() => setActiveTab(activeTab === 'settings' ? null : 'settings')} 
                    icon={<Settings size={20} />} 
                    title="Settings" 
                  />
                </div>
              )}

              {/* Collapse Toolbar Button */}
              <button
                type="button"
                onClick={() => setIsToolbarCollapsed(true)}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="Collapse toolbar"
              >
                {isMobileLandscape ? <ChevronRight size={18} /> : <ChevronDown size={20} />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Restore Controls Button when toolbar is collapsed */}
      {isToolbarCollapsed && (
        <div 
          onMouseEnter={() => setIsBottomHovered(true)}
          onMouseLeave={() => setIsBottomHovered(false)}
          className={cn(
            "fixed z-[75] pointer-events-auto flex items-center justify-center",
            isMobileLandscape 
              ? "right-3 sm:right-4 top-1/2 -translate-y-1/2" 
              : "bottom-4 left-1/2 -translate-x-1/2"
          )}
        >
          <motion.button
            initial={isMobileLandscape ? { x: 30, opacity: 0 } : { y: 30, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={isMobileLandscape ? { x: 30, opacity: 0 } : { y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            onClick={() => setIsToolbarCollapsed(false)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#282a2e]/95 hover:bg-[#383a40] text-white border border-white/20 rounded-full shadow-2xl backdrop-blur-xl text-xs font-bold transition-all cursor-pointer group active:scale-95"
            title="Restore toolbar controls"
          >
            {isMobileLandscape ? (
              <ChevronLeft size={16} className="text-[#4285f4] group-hover:-translate-x-0.5 transition-transform" />
            ) : (
              <ChevronUp size={16} className="text-[#4285f4] group-hover:-translate-y-0.5 transition-transform" />
            )}
            <span>Show controls</span>
          </motion.button>
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
                <button
                  onClick={() => {
                    copyVideoFrameSnapshot(contextMenu.participant);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg hover:bg-white/10 transition-colors text-slate-200"
                >
                  <Camera size={14} className="text-emerald-400" />
                  <span>Copy Frame Snapshot</span>
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

function CustomParticipantTile({ trackRef, raisedHands, isPinned, onTogglePin, mirror, aiVideoFilter, showName = true, isFocal, onSpotlight, onContextMenu, onCopyIsolatedFeed, onSendFile }: any) {
  const { user } = useAuth();
  const isSpeaking = useIsSpeaking(trackRef?.participant);
  const isVideoOff = !trackRef?.publication || trackRef.publication.isMuted || !trackRef.publication.isEnabled;
  const isHandRaised = raisedHands?.[trackRef?.participant.identity];
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Real-time face tracking for auto-centering faces when cropped
  const facePos = useFaceTracking(trackRef, !isVideoOff && !isFocal);
  
  // Parse metadata for avatar
  const metadata = useMemo(() => {
    try {
      return JSON.parse(trackRef?.participant.metadata || "{}");
    } catch {
      return {};
    }
  }, [trackRef?.participant.metadata]);

  const userAvatar = (trackRef?.participant.isLocal && user?.photoURL) ? user.photoURL : metadata.avatar;

  return (
    <div 
      data-participant-identity={trackRef?.participant?.identity}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      className={cn(
        "group relative w-full h-full rounded-2xl overflow-hidden bg-[#141517] border-2 transition-all duration-300 select-none flex items-center justify-center",
        isSpeaking ? "border-accent-blue shadow-[0_0_20px_rgba(66,133,244,0.4)]" : "border-transparent"
      )}
    >
      {isVideoOff ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#18191b] to-[#222428]">
          {userAvatar ? (
            <div className={cn(
              "w-24 h-24 rounded-full overflow-hidden border-4 border-accent-blue/20 shadow-2xl transition-all",
              isSpeaking ? "ring-4 ring-accent-blue/40 scale-110" : ""
            )}>
              <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
        <div 
          className={cn("w-full h-full flex items-center justify-center transition-all duration-200 bg-[#121316]", mirror ? "scale-x-[-1]" : "")}
          style={{
            filter: aiVideoFilter || 'none'
          }}
        >
          <VideoTrack 
            trackRef={trackRef} 
            className="w-full h-full object-contain transition-[object-position] duration-150 ease-out bg-[#121316]"
            style={{
              objectPosition: 'center center'
            }}
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
                    {isPinned ? <PinOff size={14} /> : <Pin size={16} />}
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
  const { user } = useAuth();
  const metadata = useMemo(() => {
    try {
      return JSON.parse(participant?.metadata || "{}");
    } catch {
      return {};
    }
  }, [participant?.metadata]);

  const avatarUrl = (isLocal && user?.photoURL) ? user.photoURL : metadata.avatar;

  return (
    <div className="flex items-center justify-between py-2.5 px-3 border-b border-gray-100 bg-white hover:bg-gray-50/80 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold border border-blue-200 shrink-0">
            {participant?.identity ? participant.identity.charAt(0).toUpperCase() : "?"}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-gray-900 truncate">
            {participant?.identity?.split('#')[0] || "User"} {isLocal && "(You)"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!isLocal && onSendFile && participant?.identity && (
          <button
            onClick={() => onSendFile(participant.identity)}
            title={`Send file to ${participant.identity.split('#')[0]}`}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Paperclip size={14} />
          </button>
        )}
        {!participant?.isMicrophoneEnabled ? <MicOff size={14} className="text-accent-red" /> : <Mic size={14} className="text-gray-500" />}
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, icon, danger, warning, highlight, micVideo, enabled, title, hasDropdown, onDropdownClick, size, isLandscape }: any) {
  const isSmall = size === "small";
  return (
    <div className={cn("flex group/btn relative", isLandscape ? "flex-col items-center" : "flex-row items-center")}>
      <button 
        onClick={onClick}
        title={title}
        className={cn(
          "transition-all duration-200 ease-out flex items-center justify-center flex-shrink-0 shadow-sm cursor-pointer",
          isSmall 
            ? "w-[42px] h-[42px] sm:w-[46px] sm:h-[46px] rounded-full" 
            : (isLandscape ? "w-[46px] h-[46px] rounded-[16px]" : "w-[50px] h-[50px] sm:w-[54px] sm:h-[54px] rounded-full"),
          hasDropdown ? (isLandscape ? "rounded-b-none border-b border-white/10" : "rounded-r-none border-r border-white/10") : "",
          micVideo ? (
            enabled ? "bg-[#3c4043] text-white hover:bg-[#4a4e52]" : "bg-[#ea4335] text-white hover:bg-[#d93025]"
          ) : (
            danger && !active ? "bg-[#ea4335] text-white hover:bg-[#d93025]" : 
            warning && active ? "bg-amber-400 text-slate-950 hover:bg-amber-300 font-bold" :
            highlight && active ? "bg-[#4285f4] text-white hover:bg-[#3367d6]" :
            active ? "bg-[#4285f4] text-white hover:bg-[#3367d6]" : "bg-[#3c4043] text-white hover:bg-[#4a4e52]"
          ),
          "active:scale-95"
        )}
      >
        {icon}
      </button>
      {hasDropdown && (
        <button
          onClick={onDropdownClick}
          className={cn(
            "bg-[#3c4043] text-white/70 hover:text-white hover:bg-[#4a4e52] transition-all flex items-center justify-center cursor-pointer",
            isLandscape 
              ? "w-[46px] h-[16px] rounded-b-[16px] border-t border-white/10" 
              : (isSmall ? "w-[20px] h-[42px] sm:h-[46px] rounded-r-full border-l border-white/10" : "w-[22px] h-[50px] sm:h-[54px] rounded-r-full border-l border-white/10")
          )}
        >
          {isLandscape ? (
            <ChevronLeft size={13} className="group-hover/btn:translate-x-[-1px] transition-transform" />
          ) : (
            <ChevronUp size={15} className="group-hover/btn:translate-y-[-1px] transition-transform" />
          )}
        </button>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, badge, title }: any) {
  return (
    <button 
      onClick={onClick}
      title={title}
      className={cn(
        "w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-all duration-200 ease-out relative flex items-center justify-center cursor-pointer",
        active ? "bg-white/20 text-white shadow-md" : "bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
      )}
    >
      {icon}
      {badge !== undefined && (
        <span className="absolute -top-1 -right-1 bg-[#4285f4] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center border-2 border-[#202124]">
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



