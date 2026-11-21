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
  useRoomContext,
} from '@livekit/components-react';
import { isMobileBrowser } from '@livekit/components-core';
import { Track, ConnectionState, Participant, VideoPresets, AudioPresets, ScreenSharePresets, LocalVideoTrack, LocalAudioTrack, RoomEvent } from 'livekit-client';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Hand, 
  MonitorUp, MonitorOff, MoreVertical, Info, Users, MessageSquare,
  X, Send, ChevronDown, Settings, Copy, Check, Pin, PinOff,
  Layout as LayoutIcon, ShieldCheck, UserX, VolumeX, Monitor, ArrowLeftRight, ArrowLeft,
  Camera, Speaker, Headphones, Clock, Smile, Heart, Languages,
  ChevronUp, ChevronLeft, ChevronRight, FileText, Plus, Search, Trash2, Archive, Save, LayoutGrid, Globe, Calendar, LayoutDashboard,
  Radio, Maximize2, Minimize2, Activity, CheckCheck, Cast, Sliders, Paperclip, ArrowDownToLine, Download,
  SwitchCamera, SlidersHorizontal, Volume2, Loader2,
  Image as ImageIcon, Lock, Key, Crown, HelpCircle, BarChart2, Layers, PictureInPicture2
} from 'lucide-react';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import { SharedFileItem, SendFileDialog, SharedFileCard, FilesPanel } from '../components/FileTransfer';
import SettingsModal from '../components/SettingsModal';
import HostControlsPanel, { LatestRecordingInfo } from '../components/HostControlsPanel';
import MeetingQA from '../components/MeetingQA';
import MeetingPolls from '../components/MeetingPolls';
import MeetingCanvas from '../components/MeetingCanvas';
import ClipsBasic from '../components/ClipsBasic';
import DuplicateSessionModal from '../components/DuplicateSessionModal';
import HostKeyModal from '../components/HostKeyModal';
import BreakoutRoomControls, { BreakoutRoomConfig } from '../components/BreakoutRoomControls';
import DraggableEdgeSnapCard from '../components/DraggableEdgeSnapCard';
import MeetingPictureInPicture, { MeetingPictureInPictureHandle } from '../components/MeetingPictureInPicture';
import { useDeviceManager } from '../hooks/useDeviceManager';
import { MeetingCompositeRecorder, RecorderParticipantSnapshot } from '../utils/meetingRecorder';
import { AIVideoEnhanceOptions, DEFAULT_AI_VIDEO_ENHANCE, getAIVideoFilterStyle, useAIVideoAutoEnhancer, AIEnhancementFilterDefs } from '../utils/mediaEnhancer';
import { useFaceTracking } from '../hooks/useFaceTracking';
import { useVoiceActivity } from '../hooks/useVoiceActivity';
import { applyBackgroundEffect, BackgroundMode, VIRTUAL_BG_PRESETS } from '../utils/backgroundProcessor';
import { DEFAULT_MEETING_COVER } from '../assets/covers';
import { triggerForumPushNotification } from '../utils/pushNotifications';
import { downloadStyledTranscript } from '../utils/transcriptExport';
import {
  AudioSoundMode,
  PerformancePreset,
  PerformanceAudioOptions,
  PERFORMANCE_PRESET_CONFIGS,
  getSavedAudioSoundMode,
  saveAudioSoundMode,
  getSavedPerformanceAudioOptions,
  savePerformanceAudioOptions,
  getCaptureOptionsForSoundMode,
  ForumAudioSmoothingProcessor,
} from '../utils/audioSmoothing';
import {
  StageOverlayState,
  DEFAULT_STAGE_OVERLAY,
  StageStudioPanel,
} from '../components/StreamMediaOverlay';
import StagePresentationCard from '../components/StagePresentationCard';
import PostMeetingFeedbackView from '../components/PostMeetingFeedbackView';
import { SendErrorFeedbackButton } from '../components/ErrorFeedbackModal';
import { useAuth } from '../context/AuthContext';
import { db, auth, komuDb, komuAuth, firebaseConfig } from '../firebase';
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy, runTransaction, arrayUnion } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

const ROOM_TRACK_SOURCES = [
  { source: Track.Source.Camera, withPlaceholder: true },
  { source: Track.Source.ScreenShare, withPlaceholder: false },
];
const ROOM_TRACK_OPTIONS = { onlySubscribed: true };

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
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'chat' | 'settings' | 'waiting' | 'participants' | 'notes' | 'whiteboard' | 'files' | 'host_controls' | 'tools' | 'qa' | 'polls' | 'canvas' | 'breakout' | 'clips' | 'stage' | null>(null);
  const [isKomuToolsOpen, setIsKomuToolsOpen] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState<any>(null);
  const [postMeetingFeedback, setPostMeetingFeedback] = useState<{
    roomId: string;
    sessionSid?: string;
    meetingTitle: string;
    destination: string;
    transcriptSnapshot?: string;
    participants?: string[];
    initialAiSummary?: string;
  } | null>(null);
  const sessionSummaryDataRef = useRef<{
    sessionSid?: string;
    transcriptSnapshot: string;
    participants: string[];
    initialAiSummary?: string;
  }>({ transcriptSnapshot: '', participants: [] });
  const intentionalExitRef = useRef(false);
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
        const directDoc = await getDoc(doc(db, 'meetings', room));
        if (directDoc.exists()) {
          setMeetingDetails(directDoc.data());
          return;
        }
        const q = query(collection(db, 'meetings'), where('roomId', '==', room));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setMeetingDetails(snap.docs[0].data());
          return;
        }
        // Fallback to room document if meetings record was not created
        const roomDoc = await getDoc(doc(db, 'rooms', room));
        if (roomDoc.exists()) {
          setMeetingDetails(roomDoc.data());
        }
      } catch (err) {
        console.error("Failed to fetch meeting details:", err);
      }
    };
    fetchDetails();
  }, [room]);

  useEffect(() => {
    const isInvite = searchParams.get('invite') === '1';
    if (!isInvite || !room) return;
    if (!user?.uid) {
      try {
        localStorage.setItem('pending_forum_invite', room);
      } catch {}
      return;
    }
    const emailLower = user.email?.toLowerCase();
    const inviteeName = user.displayName || user.email?.split('@')[0] || 'Participant';
    const meetingRef = doc(db, 'meetings', room);
    getDoc(meetingRef)
      .then(async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const existingAccepted: string[] = Array.isArray(data.acceptedUids) ? data.acceptedUids : [];
        const wasAccepted = existingAccepted.includes(user.uid);
        await updateDoc(meetingRef, {
          participants: arrayUnion(user.uid),
          acceptedUids: arrayUnion(user.uid),
          acceptedNames: arrayUnion(inviteeName),
          ...(emailLower ? { invitedEmails: arrayUnion(emailLower) } : {})
        });
        if (!wasAccepted && data.hostId && data.hostId !== user.uid) {
          const nextCount = new Set([...existingAccepted, ...(Array.isArray(data.participants) ? data.participants : []), user.uid]).size;
          await addDoc(collection(db, 'notifications'), {
            userId: data.hostId,
            type: 'meeting',
            title: `Invite Accepted: ${data.title || room}`,
            message: `${inviteeName} accepted your invite · ${nextCount} ${nextCount === 1 ? 'participant' : 'participants'} confirmed`,
            roomId: room,
            read: false,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [searchParams, room, user]);

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

    // Update live presence to In Meeting if user is authenticated (preserve previous non-meeting status)
    if (user) {
      getDoc(doc(db, 'userProfiles', user.uid))
        .then((snap) => {
          const curStatus = snap.exists() ? snap.data()?.status : 'available';
          const prevStatus =
            curStatus && curStatus !== 'in_meeting' && curStatus !== 'offline'
              ? curStatus
              : snap.data()?.previousStatus && snap.data()?.previousStatus !== 'in_meeting'
                ? snap.data()?.previousStatus
                : 'available';
          return setDoc(
            doc(db, 'userProfiles', user.uid),
            {
              status: 'in_meeting',
              previousStatus: prevStatus,
              currentRoomId: room,
              inMeetingHeartbeat: Date.now(),
              isOnline: true,
              lastSeen: new Date().toISOString(),
            },
            { merge: true }
          );
        })
        .catch((err) => {
          console.warn("Could not update user profile status:", err);
        });
    }

    console.log(`[MeetingPage] Attempting to join room: ${room} as ${name}`);
    try {
      // Proactive host check for metadata
      const isSessionHost = typeof window !== 'undefined' && (sessionStorage.getItem(`forum_room_host_${room}`) === 'true');
      const isAdmin = user?.email === "komumech@gmail.com" || user?.email === "komumechupdates@gmail.com";
      const isScheduledHost = meetingDetails && (
        (user?.uid && meetingDetails.hostId === user.uid) ||
        (user?.email && meetingDetails.hostEmail?.toLowerCase() === user.email.toLowerCase()) ||
        (user?.email && meetingDetails.createdBy?.toLowerCase() === user.email.toLowerCase())
      );
      const hostDetected = !!(isAdmin || isScheduledHost || isSessionHost);
      let hostPrefRequireWaitingRoom = false;
      try {
        if (user?.uid) {
          const saved = localStorage.getItem(`settings_${user.uid}`);
          if (saved) {
            hostPrefRequireWaitingRoom = JSON.parse(saved)?.requireWaitingRoom === true;
          }
        }
      } catch {}

      let roomLobbyRequired = meetingDetails?.waitingRoom === true;
      try {
        const roomSnap = await Promise.race([
          getDoc(doc(db, 'rooms', room)),
          new Promise<null>((res) => setTimeout(() => res(null), 1800))
        ]);
        if (roomSnap && roomSnap.exists()) {
          roomLobbyRequired = roomSnap.data()?.lobby === true;
        } else if (hostDetected) {
          roomLobbyRequired = meetingDetails?.waitingRoom === true || hostPrefRequireWaitingRoom;
        }
      } catch {}

      // Persist host details into Firestore meeting & room doc if recognized as host
      if (hostDetected && room) {
        const hostId = user ? user.uid : `guest_${room}`;
        const hostEmail = user?.email || "";
        const hostName = user?.displayName || user?.email?.split('@')[0] || name.trim() || "Host";

        setDoc(doc(db, 'meetings', room), {
          roomId: room,
          title: meetingDetails?.title || `Meeting ${room}`,
          hostId,
          hostEmail,
          hostName,
          createdBy: hostEmail || hostName,
          createdAt: serverTimestamp(),
          status: 'active'
        }, { merge: true }).catch(() => {});

        setDoc(doc(db, 'rooms', room), {
          hostId,
          hostEmail,
          hostName,
          createdAt: Date.now(),
          lobby: roomLobbyRequired,
          admittedList: [hostId, hostEmail, hostName].filter(Boolean)
        }, { merge: true }).catch(() => {});
      }

      const metadata = JSON.stringify({ 
        pending: !hostDetected && roomLobbyRequired,
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
      intentionalExitRef.current = false;
      setPostMeetingFeedback(null);
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

  if (postMeetingFeedback) {
    return (
      <PostMeetingFeedbackView
        roomId={postMeetingFeedback.roomId}
        sessionSid={postMeetingFeedback.sessionSid}
        meetingTitle={postMeetingFeedback.meetingTitle}
        user={user}
        transcriptSnapshot={postMeetingFeedback.transcriptSnapshot}
        participants={postMeetingFeedback.participants}
        initialAiSummary={postMeetingFeedback.initialAiSummary}
        onLogin={login}
        onDone={() => {
          const dest = postMeetingFeedback.destination;
          setPostMeetingFeedback(null);
          navigate(dest);
        }}
      />
    );
  }

  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#FBFBFA] flex flex-col items-center justify-center p-3 sm:p-8 lg:p-12 selection:bg-stone-200">
        <div className="w-full max-w-5xl bg-white rounded-3xl border border-neutral-200/70 shadow-xs overflow-hidden flex flex-col lg:flex-row lg:min-h-[600px] transition-all duration-300">
          {/* Left: Camera Preview Viewport */}
          <div className="flex-1 min-h-[300px] sm:min-h-[360px] lg:min-h-full bg-[#141517] relative flex items-center justify-center overflow-hidden p-3 sm:p-6">
            <div className="relative w-full min-h-[268px] sm:aspect-video lg:h-full rounded-2xl overflow-hidden bg-[#18191c] flex items-center justify-center">
              {preJoinCam && !cameraPermissionError ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className={cn("scale-x-[-1] w-full h-full object-cover", preJoinBg === 'blur' && "blur-md")} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center px-5 pt-6 pb-20 sm:pb-24 space-y-3">
                  {user?.photoURL ? (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border border-white/10 shadow-lg shrink-0">
                      <img src={user.photoURL} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#222428] border border-white/10 flex items-center justify-center text-2xl sm:text-3xl font-light text-slate-200 shadow-lg shrink-0">
                      {name.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  {cameraPermissionError ? (
                    <div className="space-y-2 max-w-xs text-center">
                      <p className="text-slate-400 text-xs leading-relaxed">
                        Camera access is disabled in browser settings. You can join with camera off.
                      </p>
                      <button
                        type="button"
                        onClick={requestCameraAccess}
                        className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium rounded-xl border border-white/10 transition-colors cursor-pointer"
                      >
                        Enable Camera
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs font-normal">Camera is off</p>
                  )}
                </div>
              )}

              {/* Minimal floating media controls */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
                <button 
                  type="button"
                  onClick={() => setPreJoinMic(!preJoinMic)}
                  className={cn(
                    "w-11 h-11 rounded-2xl backdrop-blur-md border border-white/15 transition-colors flex items-center justify-center cursor-pointer",
                    preJoinMic ? "bg-[#282a2e]/90 text-white hover:bg-[#383a40]" : "bg-red-500/90 text-white hover:bg-red-600"
                  )}
                  title={preJoinMic ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {preJoinMic ? <Mic size={18} /> : <MicOff size={18} />}
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
                    "w-11 h-11 rounded-2xl backdrop-blur-md border border-white/15 transition-colors flex items-center justify-center cursor-pointer",
                    preJoinCam ? "bg-[#282a2e]/90 text-white hover:bg-[#383a40]" : "bg-red-500/90 text-white hover:bg-red-600"
                  )}
                  title={preJoinCam ? "Turn Camera Off" : "Turn Camera On"}
                >
                  {preJoinCam ? <VideoIcon size={18} /> : <VideoOff size={18} />}
                </button>
                {preJoinCam && (
                  <button 
                    type="button"
                    onClick={() => setPreJoinBg(preJoinBg === 'none' ? 'blur' : 'none')}
                    className={cn(
                      "w-11 h-11 rounded-2xl backdrop-blur-md border border-white/15 transition-colors flex items-center justify-center cursor-pointer",
                      preJoinBg !== 'none' ? "bg-white text-slate-900" : "bg-[#282a2e]/90 text-white hover:bg-[#383a40]"
                    )}
                    title="Toggle Blur Effect"
                  >
                    <SlidersHorizontal size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Joining Card & Input Area */}
          <div className="w-full lg:w-[420px] p-5 sm:p-10 lg:p-14 flex flex-col justify-between bg-white">
            <div className="space-y-6">
              {meetingDetails?.coverImage && (
                <div className="w-full aspect-video rounded-2xl overflow-hidden border border-neutral-200/80 bg-stone-100">
                  <img
                    src={meetingDetails.coverImage}
                    alt={meetingDetails?.title || 'Meeting Cover'}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div>
                <span className="text-[11px] font-mono tracking-widest text-slate-400 uppercase">
                  Room: {room}
                </span>
                <h1 className="text-3xl sm:text-4xl font-light text-slate-900 tracking-tight mt-2">
                  {meetingDetails?.title || "Join Meeting"}
                </h1>
                {meetingDetails?.hostName && (
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
                    Hosted by {meetingDetails.hostName}
                  </p>
                )}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className="space-y-4">
                {joinError && (
                  <div className="p-3 bg-red-50 border border-red-200/80 rounded-xl text-xs text-red-700 font-normal leading-relaxed space-y-2">
                    <p>{joinError}</p>
                    <SendErrorFeedbackButton errorMessage={joinError} source="Join Meeting" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">
                    Your Name
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="Enter your name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isJoining}
                    className="w-full px-4 py-3.5 bg-stone-50/70 border border-neutral-200/80 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 text-sm font-normal text-slate-900 placeholder:text-slate-400 transition-colors disabled:opacity-60"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={!name.trim() || isJoining}
                  className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium tracking-tight whitespace-nowrap truncate transition-colors shadow-xs active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isJoining ? (
                    <span>Connecting...</span>
                  ) : (
                    <span>Join meeting</span>
                  )}
                </button>
              </form>
            </div>

            <div className="pt-6 border-t border-neutral-100 mt-6">
              {user ? (
                <p className="text-xs text-slate-400 font-normal">
                  Signed in as <span className="text-slate-600 font-medium">{user.displayName || user.email}</span>
                </p>
              ) : (
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Guest Mode</span>
                  <button 
                    type="button" 
                    onClick={login}
                    className="text-slate-800 hover:underline font-medium"
                  >
                    Sign in with Google
                  </button>
                </div>
              )}
            </div>
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
    <main className="fixed inset-0 h-[100dvh] w-full bg-[#121316] dark-theme overflow-hidden select-none">
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
            maxBitrate: 4_500_000,
            maxFramerate: 30,
          },
          screenShareEncoding: {
            maxBitrate: 5_000_000,
            maxFramerate: 30,
          },
          screenShareSimulcastLayers: [
            ScreenSharePresets.h1080fps30,
            ScreenSharePresets.h720fps15,
          ],
          degradationPreference: 'maintain-resolution',
          audioPreset: AudioPresets.musicHighQualityStereo,
          dtx: false,
          red: true,
          stopMicTrackOnMute: false,
        },
        audioCaptureDefaults: getCaptureOptionsForSoundMode(getSavedAudioSoundMode(), true, true)
      }}
      onDisconnected={() => {
        if (!intentionalExitRef.current) {
          if (user?.uid) {
            setDoc(
              doc(db, 'userProfiles', user.uid),
              {
                status: 'available',
                currentRoomId: null,
                inMeetingHeartbeat: null,
                isOnline: true,
                lastSeen: new Date().toISOString(),
              },
              { merge: true }
            ).catch(() => {});
          }
          setPostMeetingFeedback({
            roomId: room || '',
            meetingTitle: meetingDetails?.title || `Room ${room || ''}`,
            destination: user ? '/dashboard' : '/',
            transcriptSnapshot: sessionSummaryDataRef.current.transcriptSnapshot,
            participants: sessionSummaryDataRef.current.participants,
            initialAiSummary: sessionSummaryDataRef.current.initialAiSummary,
          });
          setIsReady(false);
          setToken('');
        }
      }}
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
          onRecordingChange={setIsRecording}
          sessionSummaryDataRef={sessionSummaryDataRef}
          onExitToFeedback={(destination: string, summaryData) => {
            intentionalExitRef.current = true;
            const resolved = summaryData || sessionSummaryDataRef.current;
            setPostMeetingFeedback({
              roomId: room || '',
              sessionSid: resolved.sessionSid,
              meetingTitle: meetingDetails?.title || `Room ${room || ''}`,
              destination,
              transcriptSnapshot: resolved.transcriptSnapshot,
              participants: resolved.participants,
              initialAiSummary: resolved.initialAiSummary,
            });
            setIsReady(false);
            setToken('');
          }}
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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-xl text-xs font-medium border border-red-500/30 backdrop-blur-md">
        <div className="w-2 h-2 bg-red-500 rounded-full" />
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

function MeetingRoomContent({ room, videoDevices, audioDevices, speakerDevices, initialBg, initialMic, initialCam, activeTab, setActiveTab, meetingDetails, onRecordingChange, sessionSummaryDataRef, onExitToFeedback }: { room: string, videoDevices: any[], audioDevices: any[], speakerDevices: any[], initialBg: 'none' | 'blur' | 'image', initialMic: boolean, initialCam: boolean, activeTab: any, setActiveTab: (t: any) => void, meetingDetails: any, onRecordingChange?: (recording: boolean) => void, sessionSummaryDataRef?: React.MutableRefObject<{ sessionSid?: string; transcriptSnapshot: string; participants: string[]; initialAiSummary?: string }>, onExitToFeedback?: (destination: string, summaryData?: { sessionSid?: string; transcriptSnapshot: string; participants: string[]; initialAiSummary?: string }) => void }) {
  const navigate = useNavigate();
  const { user, loading, komuUser } = useAuth();
  const lkRoom = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send: sendChat } = useChat();
  const connectionState = useConnectionState();
  const safeSendData = useCallback(
    (
      sendFn: ((payload: Uint8Array, options?: { reliable?: boolean }) => Promise<void>) | undefined,
      data: unknown,
      reliable = true
    ) => {
      if (!sendFn || lkRoom?.state !== ConnectionState.Connected) return;
      try {
        const bytes =
          data instanceof Uint8Array
            ? data
            : typeof data === 'string'
              ? new TextEncoder().encode(data)
              : new TextEncoder().encode(JSON.stringify(data));
        Promise.resolve(sendFn(bytes, { reliable })).catch(() => {});
      } catch {}
    },
    [lkRoom]
  );
  const { send: sendHandRaise, message: handRaiseMessage } = useDataChannel("hand-raise");
  const { send: sendReactionData, message: reactionMessage } = useDataChannel("reaction");
  
  const isSessionHost = typeof window !== 'undefined' && (sessionStorage.getItem(`forum_room_host_${room}`) === 'true' || localStorage.getItem(`forum_room_host_${room}`) === 'true');
  const isAdmin = user?.email === "komumech@gmail.com" || user?.email === "komumechupdates@gmail.com";
  const isScheduledHost = meetingDetails && (
    (user?.uid && meetingDetails.hostId === user.uid) ||
    (user?.email && meetingDetails.hostEmail?.toLowerCase() === user.email.toLowerCase()) ||
    (user?.email && meetingDetails.createdBy?.toLowerCase() === user.email.toLowerCase())
  );
  const initialHostStatus = !!(isAdmin || isScheduledHost || isSessionHost);

  const [isHost, setIsHost] = useState(initialHostStatus);
  const [coHosts, setCoHosts] = useState<string[]>([]);
  const coHostsRef = useRef<string[]>([]);
  coHostsRef.current = coHosts;
  const isHostRef = useRef<boolean>(initialHostStatus);
  isHostRef.current = isHost;

  // Host Controls Channel for remote mute, removal, and end meeting commands
  const { send: sendHostControl } = useDataChannel("host-controls", (msg) => {
    try {
      const raw = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(raw);
      const myId = localParticipant?.identity || "";
      const myBase = myId.split('#')[0];
      const amIAdmin = isHostRef.current || coHostsRef.current.includes(myId) || coHostsRef.current.includes(myBase);

      if (data.action === 'mute-all' && !amIAdmin) {
        localParticipant?.setMicrophoneEnabled(false);
        setIsMicEnabled(false);
        setToastMessage("You were muted by the meeting host");
        setTimeout(() => setToastMessage(null), 3000);
      } else if (data.action === 'mute-participant' && (data.targetIdentity === myId || data.targetIdentity === myBase)) {
        localParticipant?.setMicrophoneEnabled(false);
        setIsMicEnabled(false);
        setToastMessage("You were muted by the meeting host");
        setTimeout(() => setToastMessage(null), 3000);
      } else if (data.action === 'stop-video' && (data.targetIdentity === myId || data.targetIdentity === myBase)) {
        localParticipant?.setCameraEnabled(false);
        setIsCamEnabled(false);
        setToastMessage("Your video was stopped by the meeting host");
        setTimeout(() => setToastMessage(null), 3000);
      } else if (data.action === 'ask-unmute' && (data.targetIdentity === myId || data.targetIdentity === myBase)) {
        setToastMessage("The host has asked you to unmute your microphone");
        setTimeout(() => setToastMessage(null), 4000);
      } else if (data.action === 'decline-waiting' && (data.targetIdentity === myId || data.targetIdentity === myBase)) {
        setToastMessage("Your request to join was declined by the host");
        setTimeout(() => requestExitWithRecordingGuard(user ? '/dashboard' : '/'), 1200);
      } else if (data.action === 'remove-participant' && (data.targetIdentity === myId || data.targetIdentity === myBase)) {
        setToastMessage("You have been removed from the meeting by the host");
        setTimeout(() => requestExitWithRecordingGuard(user ? '/dashboard' : '/'), 1200);
      } else if (data.action === 'end-meeting') {
        setToastMessage("The meeting has been ended by the host");
        setTimeout(() => requestExitWithRecordingGuard(user ? '/dashboard' : '/'), 900);
      }
    } catch (e) {
      console.warn("Host control error:", e);
    }
  });

  const [isAdmitted, setIsAdmitted] = useState(() => {
    if (initialHostStatus) return true;
    if (meetingDetails?.waitingRoom === true) return false;
    return true; // Default to open admission unless room lobby is explicitly enabled
  });
  const [isMicEnabled, setIsMicEnabled] = useState(initialMic);
  const [isCamEnabled, setIsCamEnabled] = useState(initialCam);
  const [layoutMode, setLayoutMode] = useState<'auto' | 'tiled' | 'sidebar' | 'spotlight' | 'imo'>('auto');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isTranscriptActive, setIsTranscriptActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [spotlightIdentity, setSpotlightIdentity] = useState<string | null>(null);
  const [isWorkspaceMaximized, setIsWorkspaceMaximized] = useState(false);
  const [activeSpeakerIdentity, setActiveSpeakerIdentity] = useState<string | null>(null);
  const lastSpeakerChangeRef = useRef<number>(0);
  const [sidebarStageView, setSidebarStageView] = useState<'row' | 'column'>('row');
  const [sidebarStagePinnedIdentity, setSidebarStagePinnedIdentity] = useState<string | null>(null);
  // Settings & Category
  const [settingsCategory, setSettingsCategory] = useState<'video' | 'audio' | 'streaming' | 'general' | 'effects' | 'captions' | 'reactions'>('video');

  // Zoom-Grade Host & Co-host Authority State
  const [isLocked, setIsLocked] = useState(false);
  const [isRoomLockedBlocked, setIsRoomLockedBlocked] = useState(false);
  const [allowUnmuteSelf, setAllowUnmuteSelf] = useState(true);
  const [allowScreenShare, setAllowScreenShare] = useState(true);
  const [allowChat, setAllowChat] = useState(true);
  const [allowCoHostRecord, setAllowCoHostRecord] = useState(true);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [latestRecording, setLatestRecording] = useState<LatestRecordingInfo | null>(null);
  const meetingRecorderRef = useRef<MeetingCompositeRecorder | null>(null);
  const latestRecordingUrlRef = useRef<string | null>(null);
  const [autoDownloadRecording, setAutoDownloadRecording] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('forum_auto_download_recording_v1');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const autoDownloadRecordingRef = useRef(autoDownloadRecording);
  autoDownloadRecordingRef.current = autoDownloadRecording;
  const [autoDownloadTranscript, setAutoDownloadTranscript] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('forum_auto_download_transcript_v1');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const autoDownloadTranscriptRef = useRef(autoDownloadTranscript);
  autoDownloadTranscriptRef.current = autoDownloadTranscript;
  const recordingStatusRef = useRef(recordingStatus);
  recordingStatusRef.current = recordingStatus;
  const isExitingAfterRecordingRef = useRef(false);
  const hasDownloadedTranscriptRef = useRef(false);
  const cachedIdTokenRef = useRef<string | null>(null);
  const transcriptAutoDownloadHelpersRef = useRef<{
    saveKeepalive: () => void;
    downloadFile: () => void;
  }>({ saveKeepalive: () => {}, downloadFile: () => {} });

  useEffect(() => {
    const unsub = onIdTokenChanged(komuAuth, async (u) => {
      if (!u) {
        cachedIdTokenRef.current = null;
        return;
      }
      try {
        cachedIdTokenRef.current = await u.getIdToken();
      } catch {}
    });
    return () => unsub();
  }, []);
  const [isSavingRecordingBeforeExit, setIsSavingRecordingBeforeExit] = useState(false);
  const [recordingExitModal, setRecordingExitModal] = useState<{
    open: boolean;
    destination: string;
    isEndForAll?: boolean;
  } | null>(null);
  const [webinarMode, setWebinarMode] = useState(false);
  const [panelists, setPanelists] = useState<string[]>([]);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamPlatform, setStreamPlatform] = useState('youtube');
  const [activeEgressId, setActiveEgressId] = useState<string | null>(null);
  const [previousSidebarTab, setPreviousSidebarTab] = useState<string | null>(null);
  const navigateSidebar = useCallback((nextTab: any, fromTab?: any) => {
    setPreviousSidebarTab(fromTab ?? null);
    setActiveTab(nextTab);
  }, [setActiveTab]);
  const [hostKey, setHostKey] = useState<string>(meetingDetails?.hostKey || '492018');
  const [roomHostName, setRoomHostName] = useState<string>(meetingDetails?.hostName || '');
  const [roomHostIdentity, setRoomHostIdentity] = useState<string>('');
  const [isHostKeyModalOpen, setIsHostKeyModalOpen] = useState(false);
  const [isDuplicateSessionOpen, setIsDuplicateSessionOpen] = useState(false);
  const [isSessionReplaced, setIsSessionReplaced] = useState(false);
  const [breakoutRooms, setBreakoutRooms] = useState<BreakoutRoomConfig[]>([]);
  const [isBreakoutOpen, setIsBreakoutOpen] = useState(false);
  const [breakoutEndsAt, setBreakoutEndsAt] = useState<number | null>(null);
  const [currentBreakoutRoomId, setCurrentBreakoutRoomId] = useState<string | null>(null);
  const [broadcastBanner, setBroadcastBanner] = useState<string | null>(null);
  const [selectedAnswerers, setSelectedAnswerers] = useState<string[]>([]);
  const sessionTokenRef = useRef<string>(Math.random().toString(36).substring(2) + Date.now().toString(36));
  const sessionKeyRef = useRef<string>('');

  // Sound Smoothing & Live Performance Mode + Stage Media Overlay State
  const [audioSoundMode, setAudioSoundMode] = useState<AudioSoundMode>(() => getSavedAudioSoundMode());
  const [performanceAudioOptions, setPerformanceAudioOptions] = useState<PerformanceAudioOptions>(() =>
    getSavedPerformanceAudioOptions()
  );
  const audioSmoothCtxRef = useRef<AudioContext | null>(null);
  const audioSmoothProcessorRef = useRef<ForumAudioSmoothingProcessor | null>(null);
  const [stageOverlay, setStageOverlay] = useState<StageOverlayState>(DEFAULT_STAGE_OVERLAY);
  const stageOverlayRef = useRef<StageOverlayState>(stageOverlay);
  stageOverlayRef.current = stageOverlay;

  const buildCompactStagePayload = useCallback(
    (overlay: StageOverlayState, overrideActive?: boolean) => {
      const effectiveActive = overrideActive !== undefined ? overrideActive : overlay.active;
      return JSON.parse(
        JSON.stringify({
          ...overlay,
          active: effectiveActive,
          document: overlay.document
            ? {
                ...overlay.document,
                inlinePages:
                  overlay.document.pageStorage === 'firestore'
                    ? undefined
                    : overlay.document.inlinePages,
              }
            : null,
        })
      );
    },
    []
  );

  const { send: sendStageOverlayData } = useDataChannel("stage-overlay", (msg) => {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(msg.payload));
      if (!parsed || typeof parsed !== 'object') return;

      if (parsed.type === 'request-stage-state') {
        const cur = stageOverlayRef.current;
        const myId = localParticipant?.identity;
        const isMyPresentation =
          cur.presenterIdentity === myId || (!cur.presenterIdentity && isHostRef.current);
        if (cur.active && cur.broadcastToParticipants !== false && isMyPresentation) {
          const payload = buildCompactStagePayload(cur, true);
          const encoded = new TextEncoder().encode(JSON.stringify(payload));
          if (encoded.byteLength < 55000) {
            safeSendData(sendStageOverlayData, encoded, true);
          }
        }
        return;
      }

      if (typeof parsed.active === 'boolean') {
        if (parsed.broadcastToParticipants === false && parsed.active) {
          return;
        }
        const cur = stageOverlayRef.current;
        if (
          typeof cur.updatedAt === 'number' &&
          typeof parsed.updatedAt === 'number' &&
          parsed.updatedAt < cur.updatedAt
        ) {
          return;
        }
        setStageOverlay(parsed);
      }
    } catch {}
  });

  const updateStageOverlay = useCallback(async (next: StageOverlayState) => {
    setStageOverlay(next);
    const shouldBroadcast = next.active && next.broadcastToParticipants !== false;
    const compactPayload = buildCompactStagePayload(next, shouldBroadcast);
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(compactPayload));
      if (encoded.byteLength < 55000) {
        safeSendData(sendStageOverlayData, encoded, true);
      }
    } catch {}
    if (room) {
      setDoc(doc(db, 'rooms', room), { stageOverlay: compactPayload }, { merge: true }).catch(() => {});
    }
  }, [room, sendStageOverlayData, safeSendData, buildCompactStagePayload]);

  // Multi-Tab Chat & Plain-Text Meeting Activity Log State
  interface ChatTabItem {
    id: string;
    name: string;
    createdBy?: string;
    createdAt: number;
  }
  interface ExtendedChatMessage {
    id: string;
    tabId: string;
    senderIdentity?: string;
    senderName: string;
    text: string;
    timestamp: number;
    isSystem?: boolean;
  }
  const [chatTabs, setChatTabs] = useState<ChatTabItem[]>([
    { id: 'general', name: 'General', createdAt: 0 }
  ]);
  const [activeChatTabId, setActiveChatTabId] = useState<string>('general');
  const [isAddingChatTab, setIsAddingChatTab] = useState(false);
  const [newChatTabName, setNewChatTabName] = useState('');
  const [customTabMessages, setCustomTabMessages] = useState<ExtendedChatMessage[]>([]);
  const [activityLogs, setActivityLogs] = useState<ExtendedChatMessage[]>([]);

  const appendActivityLog = useCallback((text: string) => {
    setActivityLogs((prev) => {
      const recent = prev[prev.length - 1];
      if (recent && recent.text === text && Date.now() - recent.timestamp < 2500) {
        return prev;
      }
      return [
        ...prev.slice(-80),
        {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tabId: 'general',
          senderName: '',
          text,
          timestamp: Date.now(),
          isSystem: true,
        },
      ];
    });
  }, []);

  const { send: sendMultiChatData } = useDataChannel("multi-chat", (msg) => {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(msg.payload));
      if (parsed.type === 'create-tab' && parsed.tab?.id) {
        setChatTabs((prev) => (prev.some((t) => t.id === parsed.tab.id) ? prev : [...prev, parsed.tab]));
      } else if (parsed.type === 'close-tab' && parsed.tabId && parsed.tabId !== 'general') {
        setChatTabs((prev) => prev.filter((t) => t.id !== parsed.tabId));
        setActiveChatTabId((cur) => (cur === parsed.tabId ? 'general' : cur));
      } else if (parsed.type === 'tab-message' && parsed.msg?.id) {
        setCustomTabMessages((prev) => (prev.some((m) => m.id === parsed.msg.id) ? prev : [...prev, parsed.msg]));
        if (parsed.msg.senderIdentity !== localParticipant?.identity && activeTab !== 'chat') {
          if (typeof document !== 'undefined' && document.hidden) {
            void triggerForumPushNotification({
              title: `${parsed.msg.senderName} in Chat`,
              body: parsed.msg.text,
              url: window.location.pathname,
              tag: `chat-${room}`
            });
          } else {
            setToastMessage(`${parsed.msg.senderName}: ${parsed.msg.text.slice(0, 60)}`);
            setTimeout(() => setToastMessage(null), 3500);
          }
        }
      }
    } catch {}
  });

  // Real user presence status inside active meeting (In Meeting + 25s heartbeat -> restore previous status on exit)
  const previousUserStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    getDoc(doc(db, 'userProfiles', user.uid))
      .then((snap) => {
        if (!active) return;
        const data = snap.exists() ? snap.data() : undefined;
        const st = data?.status;
        if (st && st !== 'in_meeting' && st !== 'offline') {
          previousUserStatusRef.current = st;
        } else if (data?.previousStatus && data.previousStatus !== 'in_meeting' && data.previousStatus !== 'offline') {
          previousUserStatusRef.current = data.previousStatus;
        } else {
          previousUserStatusRef.current = 'available';
        }
        return setDoc(doc(db, 'userProfiles', user.uid), {
          status: 'in_meeting',
          previousStatus: previousUserStatusRef.current,
          currentRoomId: room || null,
          inMeetingHeartbeat: Date.now(),
          isOnline: true,
          lastSeen: new Date().toISOString()
        }, { merge: true });
      })
      .catch(() => {});

    const heartbeatTimer = setInterval(() => {
      if (!active || !user?.uid) return;
      setDoc(doc(db, 'userProfiles', user.uid), {
        status: 'in_meeting',
        currentRoomId: room || null,
        inMeetingHeartbeat: Date.now(),
        isOnline: true,
        lastSeen: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }, 25_000);

    const handleMeetingUnload = () => {
      if (!user?.uid) return;
      const restoreStatus = previousUserStatusRef.current || 'available';
      void setDoc(doc(db, 'userProfiles', user.uid), {
        status: restoreStatus,
        currentRoomId: null,
        inMeetingHeartbeat: null,
        isOnline: true,
        lastSeen: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleMeetingUnload);

    return () => {
      active = false;
      clearInterval(heartbeatTimer);
      window.removeEventListener('beforeunload', handleMeetingUnload);
      const restoreStatus = previousUserStatusRef.current || 'available';
      setDoc(doc(db, 'userProfiles', user.uid), {
        status: restoreStatus,
        currentRoomId: null,
        inMeetingHeartbeat: null,
        isOnline: true,
        lastSeen: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    };
  }, [user?.uid, room]);

  const toggleAutoDownloadRecording = useCallback((next: boolean) => {
    setAutoDownloadRecording(next);
    autoDownloadRecordingRef.current = next;
    try {
      localStorage.setItem('forum_auto_download_recording_v1', String(next));
    } catch {}
  }, []);

  const stopAndSaveRecordingNow = useCallback(async () => {
    const recorder = meetingRecorderRef.current;
    meetingRecorderRef.current = null;
    setRecordingStatus('idle');
    recordingStatusRef.current = 'idle';
    onRecordingChange?.(false);
    if (room) {
      updateDoc(doc(db, 'rooms', room), { recordingStatus: 'idle' }).catch(() => {});
    }
    if (!recorder) return null;

    const result = await recorder.stop(room);
    if (latestRecordingUrlRef.current) {
      URL.revokeObjectURL(latestRecordingUrlRef.current);
    }
    latestRecordingUrlRef.current = result.url;
    setLatestRecording({
      url: result.url,
      filename: result.filename,
      durationSeconds: result.durationSeconds,
      mode: result.mode,
    });
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    addDoc(collection(db, 'recordings'), {
      title: `${meetingDetails?.title || room} ${result.mode === 'audio' ? 'Audio' : 'Recording'}`,
      roomId: room,
      ...(activeSessionSidRef.current ? { sessionSid: activeSessionSidRef.current } : {}),
      filename: result.filename,
      durationSeconds: result.durationSeconds,
      mode: result.mode,
      participants: user?.uid ? [user.uid] : [],
      createdBy: user?.uid || localParticipant?.identity || 'guest',
      createdAt: serverTimestamp()
    }).catch(() => {});

    appendActivityLog('Recording stopped and downloaded');
    return result;
  }, [room, meetingDetails?.title, user?.uid, localParticipant?.identity, onRecordingChange, appendActivityLog]);

  const executeExitAction = useCallback(async (destination: string, isEndForAll?: boolean) => {
    isExitingAfterRecordingRef.current = true;
    if (isEndForAll && room) {
      safeSendData(sendHostControl, { action: 'end-meeting' }, true);
      try {
        await updateDoc(doc(db, 'rooms', room), { status: 'ended' });
      } catch {}
      try {
        await updateDoc(doc(db, 'meetings', room), { status: 'ended' });
      } catch {}
    }

    // Flush any pending interim/buffered transcripts cleanly before leaving and auto-download
    try {
      await flushTranscriptBeforeExitRef.current();
    } catch {}
    transcriptAutoDownloadHelpersRef.current.saveKeepalive();
    transcriptAutoDownloadHelpersRef.current.downloadFile();

    // Update active session end timestamp before leaving
    if (room && activeSessionSidRef.current) {
      const safeSid = activeSessionSidRef.current;
      const endedMs = Date.now();
      updateDoc(doc(db, 'rooms', room), {
        [`sessionLogs.${safeSid}.lastActiveAtMs`]: endedMs,
      }).catch(() => {});
      updateDoc(doc(db, 'rooms', room, 'sessions', safeSid), {
        lastActiveAtMs: endedMs,
      }).catch(() => {});
    }

    if (user?.uid) {
      const restoreStatus = previousUserStatusRef.current || 'available';
      try {
        await setDoc(doc(db, 'userProfiles', user.uid), {
          status: restoreStatus,
          currentRoomId: null,
          inMeetingHeartbeat: null,
          isOnline: true,
          lastSeen: new Date().toISOString()
        }, { merge: true });
      } catch {}
    }

    onExitToFeedback?.(destination, sessionSummaryDataRef?.current);
    try {
      await lkRoom?.disconnect();
    } catch {}
    if (!onExitToFeedback) {
      navigate(destination);
    }
  }, [room, sendHostControl, safeSendData, user?.uid, lkRoom, navigate, onExitToFeedback, sessionSummaryDataRef]);

  const requestExitWithRecordingGuard = useCallback(async (destination: string, isEndForAll = false) => {
    if (recordingStatusRef.current !== 'idle' && meetingRecorderRef.current) {
      if (autoDownloadRecordingRef.current) {
        setIsSavingRecordingBeforeExit(true);
        try {
          await stopAndSaveRecordingNow();
        } finally {
          setIsSavingRecordingBeforeExit(false);
        }
        await executeExitAction(destination, isEndForAll);
      } else {
        setRecordingExitModal({ open: true, destination, isEndForAll });
      }
      return;
    }
    await executeExitAction(destination, isEndForAll);
  }, [stopAndSaveRecordingNow, executeExitAction]);

  // Auto-save transcript & auto-download transcript + recording on abrupt page close, refresh, or navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      transcriptAutoDownloadHelpersRef.current.saveKeepalive();
      if (recordingStatusRef.current !== 'idle' && !isExitingAfterRecordingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const handlePageHide = () => {
      transcriptAutoDownloadHelpersRef.current.saveKeepalive();
      transcriptAutoDownloadHelpersRef.current.downloadFile();
      if (recordingStatusRef.current !== 'idle' && !isExitingAfterRecordingRef.current && autoDownloadRecordingRef.current) {
        meetingRecorderRef.current?.flushBestEffortDownload(room);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [room]);

  // Recording elapsed timer
  useEffect(() => {
    if (recordingStatus === 'idle') {
      setRecordingSeconds(0);
      return;
    }
    if (recordingStatus !== 'recording') return;
    const timer = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [recordingStatus]);

  // Save/download transcript & flush active recording on SPA unmount (e.g. Browser Back), then clean up resources
  useEffect(() => {
    return () => {
      transcriptAutoDownloadHelpersRef.current.saveKeepalive();
      transcriptAutoDownloadHelpersRef.current.downloadFile();
      if (recordingStatusRef.current !== 'idle' && !isExitingAfterRecordingRef.current && autoDownloadRecordingRef.current) {
        meetingRecorderRef.current?.flushBestEffortDownload(room);
      }
      meetingRecorderRef.current?.cleanup();
      if (latestRecordingUrlRef.current) {
        URL.revokeObjectURL(latestRecordingUrlRef.current);
      }
      if (audioSmoothCtxRef.current) {
        audioSmoothCtxRef.current.close().catch(() => {});
        audioSmoothCtxRef.current = null;
      }
    };
  }, [room]);

  const getLiveAudioTracks = useCallback((): MediaStreamTrack[] => {
    const seenIds = new Set<string>();
    const tracks: MediaStreamTrack[] = [];
    const pushTrack = (mediaTrack?: MediaStreamTrack | null) => {
      if (!mediaTrack || mediaTrack.readyState !== 'live' || mediaTrack.kind !== 'audio') return;
      if (seenIds.has(mediaTrack.id)) return;
      seenIds.add(mediaTrack.id);
      tracks.push(mediaTrack);
    };
    const addTracksFromParticipant = (p: any) => {
      if (!p?.audioTrackPublications) return;
      p.audioTrackPublications.forEach((pub: any) => {
        pushTrack(pub?.track?.mediaStreamTrack);
      });
    };
    addTracksFromParticipant(localParticipant);
    remoteParticipants.forEach(addTracksFromParticipant);

    // Fallback: collect live audio tracks attached to RoomAudioRenderer <audio>/<video> elements
    if (typeof document !== 'undefined') {
      document.querySelectorAll('audio, video').forEach((el: any) => {
        const stream = el?.srcObject;
        if (stream && typeof stream.getAudioTracks === 'function') {
          stream.getAudioTracks().forEach((t: MediaStreamTrack) => pushTrack(t));
        }
      });
    }
    return tracks;
  }, [localParticipant, remoteParticipants]);

  const isCoHost = useMemo(() => {
    if (isHost) return false;
    const myId = localParticipant?.identity || "";
    const myBase = myId.split('#')[0];
    return coHosts.includes(myId) || coHosts.includes(myBase) || (!!user?.email && coHosts.includes(user.email));
  }, [isHost, coHosts, localParticipant?.identity, user?.email]);

  const hasAdminAuthority = isHost || isCoHost;

  const getDisplayName = useCallback((identity?: string) => {
    if (!identity) return 'Participant';
    const base = identity.split('#')[0];
    return displayNames[identity] || displayNames[base] || base;
  }, [displayNames]);

  // Plain-text meeting activity logs (join, leave, recording, sharing)
  const getDisplayNameRef = useRef(getDisplayName);
  getDisplayNameRef.current = getDisplayName;
  const selfJoinedLoggedRef = useRef(false);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    if (!selfJoinedLoggedRef.current) {
      selfJoinedLoggedRef.current = true;
      appendActivityLog('You joined the meeting');
    }
    if (!stageOverlayRef.current.active) {
      safeSendData(sendStageOverlayData, { type: 'request-stage-state' }, true);
      const retryTimer = setTimeout(() => {
        if (!stageOverlayRef.current.active) {
          safeSendData(sendStageOverlayData, { type: 'request-stage-state' }, true);
        }
      }, 1200);
      return () => clearTimeout(retryTimer);
    }
  }, [connectionState, appendActivityLog, safeSendData, sendStageOverlayData]);

  useEffect(() => {
    if (!lkRoom) return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const onJoined = (p: Participant) => {
      if (p.identity.startsWith('OBS_Viewer_')) return;
      appendActivityLog(`${getDisplayNameRef.current(p.identity)} joined`);

      const cur = stageOverlayRef.current;
      const myId = localParticipant?.identity;
      const isMyPresentation =
        cur.presenterIdentity === myId || (!cur.presenterIdentity && isHostRef.current);
      if (cur.active && cur.broadcastToParticipants !== false && isMyPresentation) {
        const rebroadcast = () => {
          const latest = stageOverlayRef.current;
          if (!latest.active || latest.broadcastToParticipants === false) return;
          const payload = buildCompactStagePayload(latest, true);
          const encoded = new TextEncoder().encode(JSON.stringify(payload));
          if (encoded.byteLength < 55000) {
            safeSendData(sendStageOverlayData, encoded, true);
          }
        };
        timeouts.push(setTimeout(rebroadcast, 500));
        timeouts.push(setTimeout(rebroadcast, 1500));
      }
    };
    const onLeft = (p: Participant) => {
      if (p.identity.startsWith('OBS_Viewer_')) return;
      appendActivityLog(`${getDisplayNameRef.current(p.identity)} left`);
    };
    lkRoom.on(RoomEvent.ParticipantConnected, onJoined);
    lkRoom.on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => {
      timeouts.forEach(clearTimeout);
      lkRoom.off(RoomEvent.ParticipantConnected, onJoined);
      lkRoom.off(RoomEvent.ParticipantDisconnected, onLeft);
    };
  }, [lkRoom, appendActivityLog, localParticipant?.identity, buildCompactStagePayload, safeSendData, sendStageOverlayData]);

  // Track unread incoming General LiveKit chat notifications when chat panel is closed
  const lastProcessedChatTsRef = useRef<number>(Date.now());
  useEffect(() => {
    if (chatMessages.length === 0) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (!latest || latest.timestamp <= lastProcessedChatTsRef.current) return;
    lastProcessedChatTsRef.current = latest.timestamp;
    if (latest.from?.identity === localParticipant?.identity) return;
    const sender = getDisplayNameRef.current(latest.from?.identity);
    if (activeTab !== 'chat') {
      if (typeof document !== 'undefined' && document.hidden) {
        void triggerForumPushNotification({
          title: `${sender} in Chat`,
          body: latest.message,
          url: window.location.pathname,
          tag: `chat-${room}`
        });
      } else {
        setToastMessage(`${sender}: ${latest.message.slice(0, 60)}`);
        setTimeout(() => setToastMessage(null), 3500);
      }
    }
  }, [chatMessages, localParticipant?.identity, activeTab, room]);

  // Live participant snapshot ref for MeetingCompositeRecorder (7-sec speaker avatar & waveform)
  const recorderParticipantsRef = useRef<RecorderParticipantSnapshot[]>([]);
  useEffect(() => {
    const snapshots: RecorderParticipantSnapshot[] = [];
    if (localParticipant?.identity) {
      snapshots.push({
        identity: localParticipant.identity,
        displayName: getDisplayName(localParticipant.identity),
        avatarUrl: user?.photoURL || undefined,
        isSpeaking: localParticipant.isSpeaking,
        isMuted: !localParticipant.isMicrophoneEnabled,
      });
    }
    remoteParticipants.forEach((p) => {
      let avatarUrl: string | undefined;
      try {
        const meta = JSON.parse(p.metadata || '{}');
        if (meta?.avatar) avatarUrl = meta.avatar;
      } catch {}
      snapshots.push({
        identity: p.identity,
        displayName: getDisplayName(p.identity),
        avatarUrl,
        isSpeaking: p.isSpeaking,
        isMuted: !p.isMicrophoneEnabled,
      });
    });
    recorderParticipantsRef.current = snapshots;
  }, [localParticipant, remoteParticipants, displayNames, user?.photoURL, getDisplayName, localParticipant?.isSpeaking, localParticipant?.isMicrophoneEnabled]);

  // Live local microphone audio activity & silent unmuted warning
  const localVoice = useVoiceActivity(localParticipant);
  const [showUnmutedNoAudioWarning, setShowUnmutedNoAudioWarning] = useState(false);
  const unmutedSilenceDurationRef = useRef<number>(0);
  const warningDismissedPermanentlyRef = useRef<boolean>(false);

  const handleDismissSilenceWarning = () => {
    warningDismissedPermanentlyRef.current = true;
    setShowUnmutedNoAudioWarning(false);
  };

  const handleOpenMicTest = () => {
    warningDismissedPermanentlyRef.current = true;
    setShowUnmutedNoAudioWarning(false);
    setSettingsCategory('audio');
    setActiveTab('settings');
  };

  useEffect(() => {
    // If permanently dismissed by user clicking X or Test Mic, NEVER show again
    if (warningDismissedPermanentlyRef.current) {
      setShowUnmutedNoAudioWarning(false);
      return;
    }

    if (!localParticipant?.isMicrophoneEnabled || !isMicEnabled) {
      setShowUnmutedNoAudioWarning(false);
      unmutedSilenceDurationRef.current = 0;
      return;
    }

    if (localVoice.volume > 8) {
      setShowUnmutedNoAudioWarning(false);
      unmutedSilenceDurationRef.current = 0;
      return;
    }

    const timer = setInterval(() => {
      if (warningDismissedPermanentlyRef.current) return;
      unmutedSilenceDurationRef.current += 1;
      if (unmutedSilenceDurationRef.current >= 5) {
        setShowUnmutedNoAudioWarning(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [localParticipant?.isMicrophoneEnabled, isMicEnabled, localVoice.volume]);

  // Load initial settings from Dashboard/Settings and sync auto-download transcript preference
  useEffect(() => {
    if (!user?.uid) return;
    try {
      const saved = localStorage.getItem(`settings_${user.uid}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.muteOnJoin) setIsMicEnabled(false);
        if (parsed.videoOffOnJoin) setIsCamEnabled(false);
        if (typeof parsed.autoDownloadTranscript === 'boolean') {
          setAutoDownloadTranscript(parsed.autoDownloadTranscript);
        }
      }
    } catch {}

    const unsubProfile = onSnapshot(doc(db, 'userProfiles', user.uid), (snap) => {
      if (!snap.exists()) return;
      const remoteAuto = snap.data()?.settings?.autoDownloadTranscript;
      if (typeof remoteAuto === 'boolean') {
        setAutoDownloadTranscript(remoteAuto);
        try {
          localStorage.setItem('forum_auto_download_transcript_v1', remoteAuto ? 'true' : 'false');
        } catch {}
      }
    }, () => {});

    return () => unsubProfile();
  }, [user]);

  // Re-sync if state was false but user/details loaded later
  useEffect(() => {
    const isLocal = typeof window !== 'undefined' && (sessionStorage.getItem(`forum_room_host_${room}`) === 'true' || localStorage.getItem(`forum_room_host_${room}`) === 'true');
    const isUserAdmin = user?.email === "komumech@gmail.com" || user?.email === "komumechupdates@gmail.com";
    const isSchedHost = meetingDetails && (
      (user?.uid && meetingDetails.hostId === user.uid) ||
      (user?.email && meetingDetails.hostEmail?.toLowerCase() === user.email.toLowerCase())
    );
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
    } catch (err) {
      console.warn("[MeetingPage] Admit message notice:", err);
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
      localParticipant.setCameraEnabled(true, {
        resolution: VideoPresets.h1080.resolution,
      }).catch(err => {
        console.warn("Could not enable camera on join:", err?.message || err);
      });
    }
  }, [localParticipant, connectionState, initialMic, initialCam, user]);

  // Waiting Room Logic & Accurate Per-Session Counter (supports repeated PMI calls)
  const initializedRoomRef = useRef(false);
  const activeSessionSidRef = useRef<string>('');
  const registeredSessionSidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !lkRoom || !room) return;
    let cancelled = false;
    let heartbeatTimer: any = null;

    const registerActiveSession = async () => {
      let rawSid = '';
      try {
        rawSid = (await lkRoom.getSid()) || '';
      } catch {}
      if (!rawSid && !cancelled) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          rawSid = (await lkRoom.getSid()) || '';
        } catch {}
      }
      if (cancelled) return;

      const safeSid = (rawSid || `s_${room}_${Math.floor(Date.now() / (10 * 60_000))}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      activeSessionSidRef.current = safeSid;
      if (sessionSummaryDataRef?.current) {
        sessionSummaryDataRef.current.sessionSid = safeSid;
      }

      const roomRef = doc(db, 'rooms', room);
      const sessionRef = doc(db, 'rooms', room, 'sessions', safeSid);

      if (!registeredSessionSidsRef.current.has(safeSid)) {
        registeredSessionSidsRef.current.add(safeSid);
        try {
          await runTransaction(db, async (tx) => {
            const sessionSnap = await tx.get(sessionRef);
            const roomSnap = await tx.get(roomRef);
            const nowMs = Date.now();

            if (!sessionSnap.exists()) {
              tx.set(sessionRef, {
                sessionSid: safeSid,
                roomId: room,
                isPmi: room.startsWith('pmi-'),
                startedAtMs: nowMs,
                lastActiveAtMs: nowMs,
              });
            } else {
              tx.update(sessionRef, { lastActiveAtMs: nowMs });
            }

            const existingData = roomSnap.exists() ? roomSnap.data() : {};
            const prevLogs: Record<string, { startedAtMs: number; lastActiveAtMs: number }> =
              existingData?.sessionLogs && typeof existingData.sessionLogs === 'object'
                ? { ...existingData.sessionLogs }
                : {};
            let archivedCount = Number(existingData?.archivedSessionCount || 0);

            if (!prevLogs[safeSid]) {
              prevLogs[safeSid] = { startedAtMs: nowMs, lastActiveAtMs: nowMs };
            } else {
              prevLogs[safeSid] = {
                ...prevLogs[safeSid],
                lastActiveAtMs: nowMs,
              };
            }

            // Cap rolling map at 400 newest entries to keep room doc lightweight
            const entries = Object.entries(prevLogs);
            if (entries.length > 400) {
              entries.sort((a, b) => (a[1]?.startedAtMs || 0) - (b[1]?.startedAtMs || 0));
              const overflow = entries.length - 400;
              archivedCount += overflow;
              const trimmedLogs: Record<string, { startedAtMs: number; lastActiveAtMs: number }> = {};
              entries.slice(overflow).forEach(([k, v]) => {
                trimmedLogs[k] = v;
              });
              tx.set(
                roomRef,
                {
                  sessionLogs: trimmedLogs,
                  archivedSessionCount: archivedCount,
                  sessionCount: archivedCount + Object.keys(trimmedLogs).length,
                },
                { merge: true }
              );
            } else {
              tx.set(
                roomRef,
                {
                  sessionLogs: prevLogs,
                  archivedSessionCount: archivedCount,
                  sessionCount: archivedCount + entries.length,
                },
                { merge: true }
              );
            }
          });
        } catch (err) {
          console.warn('[MeetingPage] Session tracking notice:', err);
          registeredSessionSidsRef.current.delete(safeSid);
        }
      }

      heartbeatTimer = setInterval(() => {
        if (cancelled || !activeSessionSidRef.current) return;
        const ts = Date.now();
        updateDoc(roomRef, {
          [`sessionLogs.${safeSid}.lastActiveAtMs`]: ts,
        }).catch(() => {});
        updateDoc(sessionRef, {
          lastActiveAtMs: ts,
        }).catch(() => {});
      }, 90_000);
    };

    void registerActiveSession();

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };
  }, [connectionState, lkRoom, room, sessionSummaryDataRef]);

  useEffect(() => {
    if (!localParticipant || !room || loading) return;
    const myIdentity = localParticipant.identity || "";
    if (!myIdentity) return;
    const myBaseName = myIdentity.split('#')[0];
    const roomRef = doc(db, 'rooms', room);

    // Host Election & Admission Check (runs once per session)
    if (!initializedRoomRef.current) {
      initializedRoomRef.current = true;

      const initializeRoom = async () => {
        try {
          // 1. Fetch meeting record if available using direct doc get
          let scheduledHostInfo = meetingDetails;
          if (!scheduledHostInfo) {
            try {
              const meetingSnap = await getDoc(doc(db, 'meetings', room));
              if (meetingSnap.exists()) {
                scheduledHostInfo = meetingSnap.data();
              }
            } catch (e) {
              console.warn("[MeetingPage] Meeting doc lookup note:", e);
            }
          }

          // 2. Fetch or initialize room document
          const isSessionHost = typeof window !== 'undefined' && (sessionStorage.getItem(`forum_room_host_${room}`) === 'true');
          let roomData: any = null;
          try {
            const snap = await getDoc(roomRef);
            if (snap.exists()) {
              roomData = snap.data();
            } else {
              const initialHostId = scheduledHostInfo?.hostId || scheduledHostInfo?.hostEmail || (user?.uid ? user.uid : "");
              const initialHostEmail = scheduledHostInfo?.hostEmail || user?.email || "";
              const defaultData = { 
                hostId: initialHostId,
                hostEmail: initialHostEmail,
                hostName: scheduledHostInfo?.hostName || user?.displayName || "Host",
                hostKey: scheduledHostInfo?.hostKey || String(Math.floor(100000 + Math.random() * 900000)),
                createdAt: Date.now(),
                lobby: scheduledHostInfo?.waitingRoom === true,
                admittedList: [initialHostId, initialHostEmail].filter(Boolean)
              };
              await setDoc(roomRef, defaultData, { merge: true });
              roomData = defaultData;
            }
          } catch (docErr) {
            console.warn("[MeetingPage] room doc fetch/create error:", docErr);
          }

          const currentLobby =
            typeof roomData?.lobby === 'boolean'
              ? roomData.lobby
              : scheduledHostInfo?.waitingRoom === true;
          setLobbyEnabled(currentLobby);
          if (roomData?.hostKey) setHostKey(roomData.hostKey);
          if (roomData?.hostName) setRoomHostName(roomData.hostName);

          // 3. Determine if I am the host
          const isUserAdmin = user?.email === "komumech@gmail.com" || user?.email === "komumechupdates@gmail.com";
          const isSchedHost = scheduledHostInfo && (
            (user?.uid && scheduledHostInfo.hostId === user.uid) ||
            (user?.email && scheduledHostInfo.hostEmail?.toLowerCase() === user.email.toLowerCase()) ||
            (user?.email && scheduledHostInfo.createdBy?.toLowerCase() === user.email.toLowerCase())
          );
          const isRoomDocHost = roomData && (
            (user?.uid && (roomData.hostId === user.uid || roomData.hostEmail?.toLowerCase() === user.email?.toLowerCase())) ||
            (user?.email && roomData.hostEmail?.toLowerCase() === user.email.toLowerCase())
          );

          const amIHost = !!(isUserAdmin || isSchedHost || isRoomDocHost || isSessionHost);

          if (roomData?.hostIdentity) setRoomHostIdentity(roomData.hostIdentity);

          if (amIHost) {
            console.log("[MeetingPage] Recognized as host for room:", room);
            setIsHost(true);
            setIsAdmitted(true);
            setIsRoomLockedBlocked(false);
            setRoomHostIdentity(myIdentity);
            setDoc(roomRef, {
              hostIdentity: myIdentity,
              hostName: getDisplayName(myIdentity),
              ...(user?.uid ? { hostId: user.uid } : {}),
              ...(user?.email ? { hostEmail: user.email } : {})
            }, { merge: true }).catch(() => {});
            try {
              localParticipant.setMetadata(JSON.stringify({
                pending: false,
                avatar: user?.photoURL || "",
                isHost: true
              }));
            } catch (e) {}
          } else {
            // Check if already admitted in doc or subcollection
            const admittedInRoom = roomData?.admittedList?.includes(myIdentity) || 
                                   roomData?.admittedList?.includes(myBaseName) ||
                                   (user?.uid && roomData?.admittedList?.includes(user.uid)) ||
                                   (user?.email && roomData?.admittedList?.includes(user.email));

            if (roomData?.isLocked && !admittedInRoom) {
              setIsRoomLockedBlocked(true);
              setIsAdmitted(false);
              return;
            }

            let admittedInSubcollection = false;
            try {
              const sanitizedId = encodeURIComponent(myIdentity).replace(/\./g, '_');
              const admittedRef = doc(db, 'rooms', room, 'admitted', sanitizedId);
              const admittedSnap = await getDoc(admittedRef);
              admittedInSubcollection = admittedSnap.exists();
            } catch (e) {}

            if (!currentLobby || admittedInRoom || admittedInSubcollection) {
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
    }

    // Listen for room changes (lobby, host authority, breakouts, streaming)
    const unsubRoom = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const isLobby = data.lobby === true;
        setLobbyEnabled(isLobby);
        if (data.coHosts && Array.isArray(data.coHosts)) setCoHosts(data.coHosts);
        if (typeof data.isLocked === 'boolean') setIsLocked(data.isLocked);
        if (typeof data.allowUnmuteSelf === 'boolean') setAllowUnmuteSelf(data.allowUnmuteSelf);
        if (typeof data.allowScreenShare === 'boolean') setAllowScreenShare(data.allowScreenShare);
        if (typeof data.allowChat === 'boolean') setAllowChat(data.allowChat);
        if (typeof data.allowCoHostRecord === 'boolean') setAllowCoHostRecord(data.allowCoHostRecord);
        if (data.recordingStatus === 'idle' || data.recordingStatus === 'recording' || data.recordingStatus === 'paused') {
          setRecordingStatus(data.recordingStatus);
          onRecordingChange?.(data.recordingStatus === 'recording');
        }
        if (typeof data.webinarMode === 'boolean') setWebinarMode(data.webinarMode);
        if (data.panelists && Array.isArray(data.panelists)) setPanelists(data.panelists);
        if (data.displayNames && typeof data.displayNames === 'object') setDisplayNames(data.displayNames);
        if (typeof data.isStreaming === 'boolean') setIsStreaming(data.isStreaming);
        if (data.streamPlatform) setStreamPlatform(data.streamPlatform);
        if (data.egressId !== undefined) setActiveEgressId(data.egressId || null);
        if (data.hostKey) setHostKey(data.hostKey);
        if (data.hostName) setRoomHostName(data.hostName);
        if (data.hostIdentity) setRoomHostIdentity(data.hostIdentity);
        if (data.breakoutRooms && Array.isArray(data.breakoutRooms)) setBreakoutRooms(data.breakoutRooms);
        if (typeof data.isBreakoutOpen === 'boolean') {
          setIsBreakoutOpen(data.isBreakoutOpen);
          if (!data.isBreakoutOpen) setCurrentBreakoutRoomId(null);
        }
        if (data.breakoutEndsAt !== undefined) setBreakoutEndsAt(data.breakoutEndsAt);
        if (data.broadcastBanner !== undefined) setBroadcastBanner(data.broadcastBanner);
        if (data.selectedAnswerers && Array.isArray(data.selectedAnswerers)) setSelectedAnswerers(data.selectedAnswerers);
        if (data.stageOverlay && typeof data.stageOverlay === 'object') {
          const incoming = data.stageOverlay as StageOverlayState;
          const cur = stageOverlayRef.current;
          const isMyPrivatePreview =
            cur.active &&
            cur.broadcastToParticipants === false &&
            (!cur.presenterIdentity || cur.presenterIdentity === myIdentity) &&
            incoming.broadcastToParticipants === false;
          const isStale =
            typeof cur.updatedAt === 'number' &&
            typeof incoming.updatedAt === 'number' &&
            incoming.updatedAt < cur.updatedAt;
          const isSameTimestampFromSelf =
            typeof cur.updatedAt === 'number' &&
            incoming.updatedAt === cur.updatedAt &&
            incoming.presenterIdentity === myIdentity;
          if (!isMyPrivatePreview && !isStale && !isSameTimestampFromSelf) {
            if (!(incoming.broadcastToParticipants === false && incoming.active)) {
              setStageOverlay(incoming);
            }
          }
        }

        // Host transfer detection
        if (data.hostId && user?.uid && data.hostId === user.uid && !isHostRef.current) {
          setIsHost(true);
          setIsAdmitted(true);
          setIsRoomLockedBlocked(false);
        } else if (data.hostIdentity && (data.hostIdentity === myIdentity || data.hostIdentity === myBaseName) && !isHostRef.current) {
          setIsHost(true);
          setIsAdmitted(true);
          setIsRoomLockedBlocked(false);
        } else if (isHostRef.current && data.hostIdentity && data.hostIdentity !== myIdentity && data.hostIdentity !== myBaseName && !isAdmin) {
          setIsHost(false);
        }

        // Meeting ended detection
        if (data.status === 'ended') {
          setToastMessage("The meeting has been ended by the host");
          setTimeout(() => void requestExitWithRecordingGuard(user ? '/dashboard' : '/'), 900);
        }
        
        if (!isHostRef.current) {
          const inAdmittedList =
            data.admittedList?.includes(myIdentity) || 
            data.admittedList?.includes(myBaseName) ||
            (user?.uid && data.admittedList?.includes(user.uid)) ||
            (user?.email && data.admittedList?.includes(user.email));

          if (data.isLocked && !inAdmittedList && !data.coHosts?.includes(myIdentity)) {
            setIsRoomLockedBlocked(true);
          } else {
            setIsRoomLockedBlocked(false);
          }

          const isAdmittedByDoc = !isLobby || inAdmittedList;

          setIsAdmitted(Boolean(isAdmittedByDoc));
          try {
            localParticipant.setMetadata(JSON.stringify({
              pending: !isAdmittedByDoc,
              avatar: user?.photoURL || "",
              isHost: false
            }));
          } catch (e) {}
        }
      }
    }, (err) => {
      console.warn("[MeetingPage] Room snapshot notice:", err);
    });

    // Listen for subcollection admission with non-fatal error handler
    let unsubAdmit = () => {};
    try {
      const sanitizedId = encodeURIComponent(myIdentity).replace(/\./g, '_');
      const admittedRef = doc(db, 'rooms', room, 'admitted', sanitizedId);
      unsubAdmit = onSnapshot(admittedRef, (docSnap) => {
        if (docSnap.exists()) {
          console.log("[MeetingPage] Admission detected via Firestore for:", myIdentity);
          setIsAdmitted(true);
          setIsRoomLockedBlocked(false);
          try {
            localParticipant.setMetadata(JSON.stringify({
              pending: false,
              avatar: user?.photoURL || "",
              isHost: isHostRef.current
            }));
          } catch (e) {}
        }
      }, (err) => {
        console.warn("[MeetingPage] Admit snapshot notice:", err);
      });
    } catch (e) {}

    // Duplicate session registration & takeover detection
    const currentSessionToken = sessionTokenRef.current;
    const sessionKey = user?.uid || encodeURIComponent(myBaseName);
    sessionKeyRef.current = sessionKey;
    const sessionRef = doc(db, 'rooms', room, 'activeSessions', sessionKey);

    setDoc(sessionRef, {
      sessionToken: currentSessionToken,
      identity: myIdentity,
      displayName: myBaseName,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    }, { merge: true }).catch(() => {});

    const unsubSession = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        const sData = snap.data();
        if (sData.sessionToken && sData.sessionToken !== sessionTokenRef.current) {
          setIsDuplicateSessionOpen(true);
          setIsSessionReplaced(true);
        }
      }
    }, () => {});

    const unsubTabs = onSnapshot(collection(db, 'rooms', room, 'chatTabs'), (snap) => {
      const remoteTabs: ChatTabItem[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setChatTabs([{ id: 'general', name: 'General', createdAt: 0 }, ...remoteTabs.filter((t) => t.id !== 'general')]);
    }, () => {});

    const unsubTabMsgs = onSnapshot(collection(db, 'rooms', room, 'chatMessages'), (snap) => {
      const msgs: ExtendedChatMessage[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setCustomTabMessages((prev) => {
        const map = new Map<string, ExtendedChatMessage>();
        prev.forEach((m) => map.set(m.id, m));
        msgs.forEach((m) => map.set(m.id, m));
        return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
      });
    }, () => {});

    return () => {
      unsubRoom();
      unsubAdmit();
      unsubSession();
      unsubTabs();
      unsubTabMsgs();
    };
  }, [localParticipant, room, user, loading, meetingDetails]);

  // Host & Co-host: Track pending participants when Waiting Room is enabled; auto-admit if disabled
  const prevPendingCountRef = useRef<number>(0);
  useEffect(() => {
    if (!hasAdminAuthority) return;

    const rawPending = remoteParticipants.filter(p => {
      if (admittedSids.has(p.sid)) return false;
      try {
        const meta = JSON.parse(p.metadata || "{}");
        return meta.pending === true && meta.isHost !== true;
      } catch {
        return false;
      }
    });

    if (!lobbyEnabled) {
      setPendingParticipants([]);
      prevPendingCountRef.current = 0;
      if (rawPending.length > 0) {
        setAdmittedSids(prev => {
          const next = new Set(prev);
          rawPending.forEach(p => next.add(p.sid));
          return next;
        });
        safeSendData(sendAdmit, { action: 'admit-all' }, true);
        safeSendData(sendAdmit, "admitted", true);
      }
      return;
    }

    setPendingParticipants(rawPending);

    if (rawPending.length > prevPendingCountRef.current && typeof document !== 'undefined' && document.hidden) {
      const guestName = rawPending[0]?.identity?.split('#')[0] || 'Someone';
      void triggerForumPushNotification({
        title: 'Waiting Room Request',
        body: rawPending.length === 1
          ? `${guestName} is waiting to join ${meetingDetails?.title || room}`
          : `${guestName} and ${rawPending.length - 1} others are waiting to join`,
        url: window.location.pathname,
        tag: `waiting-room-${room}`
      });
    }
    prevPendingCountRef.current = rawPending.length;
  }, [remoteParticipants, hasAdminAuthority, admittedSids, lobbyEnabled, meetingDetails?.title, room, safeSendData, sendAdmit]);

  const admitUser = async (participant: Participant) => {
    if (!room || !hasAdminAuthority) return;
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
      safeSendData(sendAdmit, {
        action: 'admit',
        identity: participantIdentity,
        baseName
      }, true);

      // Direct fallback string
      safeSendData(sendAdmit, "admitted", true);
    } catch (err) {
      console.error("Admit user error:", err);
    }
  };

  const declineUser = (p: { sid: string; identity: string }) => {
    if (!room || !hasAdminAuthority || !p.identity) return;
    setAdmittedSids(prev => new Set(prev).add(p.sid));
    safeSendData(sendHostControl, {
      action: 'decline-waiting',
      targetIdentity: p.identity
    }, true);
    setToastMessage(`Declined ${getDisplayName(p.identity)}`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const admitAllUsers = async () => {
    if (!room || !hasAdminAuthority || pendingParticipants.length === 0) return;
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

      safeSendData(sendAdmit, { action: 'admit-all' }, true);
      safeSendData(sendAdmit, "admitted", true);
    } catch (err) {
      console.error("Admit all users error:", err);
    }
  };
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");

  const rawTracks = useTracks(ROOM_TRACK_SOURCES, ROOM_TRACK_OPTIONS);

  const lastSpotlightChangeRef = useRef<number>(0);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const MAX_TRANSCRIPT_BLOCK_CHARS = 380;
  const [transcriptions, setTranscriptions] = useState<{ id: string; identity: string; speaker?: string; timeLabel?: string; text: string; timestamp: number }[]>([]);
  const [localTranscript, setLocalTranscript] = useState("");
  const [activeCaption, setActiveCaption] = useState<{ identity: string; text: string; isLocal?: boolean } | null>(null);
  const captionTimeoutRef = useRef<any>(null);
  const showSingleCaption = useCallback((identity: string, text: string, isLocal = false) => {
    setActiveCaption({ identity, text, isLocal });
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    captionTimeoutRef.current = setTimeout(() => {
      setActiveCaption(null);
    }, 3500);
  }, []);
  useEffect(() => {
    return () => {
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    };
  }, []);
  const [isMicMenuOpen, setIsMicMenuOpen] = useState(false);
  const [isCamMenuOpen, setIsCamMenuOpen] = useState(false);
  const [isScreenMenuOpen, setIsScreenMenuOpen] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatRecipient, setChatRecipient] = useState<string>("everyone");
  const [copied, setCopied] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobilePipStageRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<MeetingPictureInPictureHandle>(null);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [autoPipOnTabLeave, setAutoPipOnTabLeave] = useState<boolean>(() => {
    try {
      return localStorage.getItem('forum_auto_pip_v1') !== 'false';
    } catch {
      return true;
    }
  });
  const toggleAutoPipOnTabLeave = useCallback((next: boolean) => {
    setAutoPipOnTabLeave(next);
    try {
      localStorage.setItem('forum_auto_pip_v1', next ? 'true' : 'false');
    } catch {}
  }, []);

  const tracks = useVisualStableUpdate(rawTracks, 16);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isMobileBrowser() || window.innerWidth < 768;
  });

  // Screen orientation detection strictly for small handheld mobile devices rotated sideways
  const [isMobileLandscape, setIsMobileLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isTouchPhone = isMobileBrowser() || (window.innerWidth < 900 && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 1));
    return isTouchPhone && window.innerWidth > window.innerHeight && window.innerHeight < 520;
  });

  useEffect(() => {
    const handleViewportChange = () => {
      const isTouchPhone = isMobileBrowser() || (window.innerWidth < 900 && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 1));
      setIsMobile(isMobileBrowser() || window.innerWidth < 768);
      setIsMobileLandscape(isTouchPhone && window.innerWidth > window.innerHeight && window.innerHeight < 520);
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, []);

  const [pinnedIdentities, setPinnedIdentities] = useState<Set<string>>(new Set());
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(16);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const sheetTouchStartYRef = useRef<number | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isMoreMenuOpen && isMobile && !isMobileLandscape) {
      const prevHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;
      const prevBodyOverscroll = document.body.style.overscrollBehaviorY;
      document.documentElement.style.overscrollBehaviorY = 'contain';
      document.body.style.overscrollBehaviorY = 'contain';
      return () => {
        document.documentElement.style.overscrollBehaviorY = prevHtmlOverscroll;
        document.body.style.overscrollBehaviorY = prevBodyOverscroll;
      };
    }
  }, [isMoreMenuOpen, isMobile, isMobileLandscape]);

  const updateAutoDownloadTranscript = useCallback((next: boolean) => {
    setAutoDownloadTranscript(next);
    try {
      localStorage.setItem('forum_auto_download_transcript_v1', next ? 'true' : 'false');
      if (user?.uid) {
        const key = `settings_${user.uid}`;
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(key, JSON.stringify({ ...parsed, autoDownloadTranscript: next }));
        setDoc(doc(db, 'userProfiles', user.uid), {
          settings: { autoDownloadTranscript: next }
        }, { merge: true }).catch(() => {});
      }
    } catch {}
  }, [user?.uid]);

  const [mobilePrimaryIdentity, setMobilePrimaryIdentity] = useState<string | null>(null);
  const [mobileOverlaySide, setMobileOverlaySide] = useState<'right' | 'left'>('right');
  const [autoSaveTranscript, setAutoSaveTranscript] = useState(true);
  const autoSaveTranscriptRef = useRef(true);
  useEffect(() => {
    autoSaveTranscriptRef.current = autoSaveTranscript;
  }, [autoSaveTranscript]);
  const localTranscriptRef = useRef("");
  useEffect(() => {
    localTranscriptRef.current = localTranscript;
  }, [localTranscript]);
  const [transcriptNoteId, setTranscriptNoteId] = useState<string | null>(null);
  const transcriptNoteIdRef = useRef<string | null>(null);
  const transcriptBlocksRef = useRef<{ id: string; identity: string; speaker: string; timeLabel: string; text: string; timestamp: number }[]>([]);
  const existingTranscriptPrefixRef = useRef<string>('');
  const transcriptSessionStartRef = useRef<string>(new Date().toLocaleString());
  const hasLoadedExistingTranscriptRef = useRef<boolean>(false);
  const hasCreatedTranscriptDocRef = useRef<boolean>(false);
  const isSyncingTranscriptRef = useRef<boolean>(false);
  const transcriptNeedsResyncRef = useRef<boolean>(false);
  const transcriptDirtyRef = useRef<boolean>(false);
  const lastCommittedSpeechRef = useRef<{ speaker: string; text: string; at: number } | null>(null);
  const isCreatingTranscriptRef = useRef(false);
  const transcriptBufferRef = useRef<string[]>([]);
  const lastFlushTimeRef = useRef<number>(0);
  const flushIntervalRef = useRef<any>(null);

  // Media Enhancements & Video
  const [videoMirroring, setVideoMirroring] = useState(true);
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [aiDenoise, setAiDenoise] = useState(true);
  const [hvacFilter, setHvacFilter] = useState(true);
  const [vocalCompressor, setVocalCompressor] = useState(true);
  const [aiVideoOptions, setAiVideoOptions] = useState<AIVideoEnhanceOptions>(DEFAULT_AI_VIDEO_ENHANCE);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showParticipantNames, setShowParticipantNames] = useState(true);
  const [showClock, setShowClock] = useState(true);
  const [selectedResolution, setSelectedResolution] = useState<'360p' | '720p' | '1080p'>('1080p');
  const [selectedBg, setSelectedBg] = useState<BackgroundMode>((initialBg as BackgroundMode) || 'none');
  const [selectedBgImage, setSelectedBgImage] = useState(VIRTUAL_BG_PRESETS[0]?.value || DEFAULT_MEETING_COVER);
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reactions, setReactions] = useState<{ id: number, emoji: string, x: number }[]>([]);
  const [isReactionsMenuOpen, setIsReactionsMenuOpen] = useState(false);

  // Apply Virtual Background / Blur to Local Camera Video Track
  useEffect(() => {
    const updateBackgroundEffect = async () => {
      if (!localParticipant || !localParticipant.isCameraEnabled) return;
      const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
      const camTrack = camPub?.videoTrack as LocalVideoTrack | undefined;
      if (!camTrack) return;

      try {
        await applyBackgroundEffect(camTrack, selectedBg, {
          imageUrl: customBgImage || selectedBgImage,
          colorHex: selectedBg === 'greenscreen' ? '#00FF00' : selectedBgImage,
          chromaKeyHex: selectedBg === 'greenscreen' ? '#00FF00' : selectedBgImage,
          blurRadius: 14,
        });
      } catch (err) {
        console.warn("[MeetingPage] Background processor application failed:", err);
      }
    };

    updateBackgroundEffect();
  }, [selectedBg, selectedBgImage, customBgImage, localParticipant, localParticipant?.isCameraEnabled]);

  const [streamProfile, setStreamProfile] = useState<'standard' | 'high'>('high');

  const getCameraVideoPreset = useCallback((res: '360p' | '720p' | '1080p', highPerf: boolean) => {
    const base =
      res === '1080p'
        ? VideoPresets.h1080.resolution
        : res === '720p'
          ? VideoPresets.h720.resolution
          : VideoPresets.h360.resolution;
    return {
      ...base,
      frameRate: highPerf && res !== '360p' ? 60 : 30,
    };
  }, []);

  const handleFlipCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (localParticipant?.isCameraEnabled) {
      try {
        await localParticipant.setCameraEnabled(true, {
          facingMode: nextFacing,
          resolution: getCameraVideoPreset(selectedResolution, streamProfile === 'high'),
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
  const [copiedExportId, setCopiedExportId] = useState<string | null>(null);
  const [hostConfirmModal, setHostConfirmModal] = useState<{
    type: 'remove-participant' | 'end-meeting';
    targetIdentity?: string;
    name?: string;
  } | null>(null);

  // Dynamic real-time AI auto enhancement engine
  const localCameraTrack = localParticipant?.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
  const { filterStyle: localAIVideoFilter, autoState: aiAutoState } = useAIVideoAutoEnhancer(
    { publication: { track: { mediaStreamTrack: localCameraTrack } } },
    aiVideoOptions
  );
  const [liveFps, setLiveFps] = useState<number>(60);
  const [liveResolution, setLiveResolution] = useState<string>("1920 × 1080");
  const [liveBitrate, setLiveBitrate] = useState<string>("~4.5 Mbps");

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

        if (lkRoom?.state !== ConnectionState.Connected) {
          throw new Error('Room disconnected during file send');
        }
        await sendFilePayload(new TextEncoder().encode(metaPayload), { reliable: true });

        // 2. Stream chunk sequence
        for (let i = 0; i < totalChunks; i++) {
          if (lkRoom?.state !== ConnectionState.Connected) {
            throw new Error('Room disconnected during file send');
          }
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
        if (lkRoom?.state === ConnectionState.Connected) {
          await sendFilePayload(new TextEncoder().encode(completePayload), { reliable: true });
        }

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
    if (lkRoom?.state !== ConnectionState.Connected) return;
    try {
      const payloadText = JSON.stringify(data);
      const encoded = new TextEncoder().encode(payloadText);
      await sendWorkspacePayload(encoded, { reliable: true });
    } catch (err) {
      console.warn("Failed to broadcast workspace sync payload:", err);
    }
  }, [sendWorkspacePayload, lkRoom]);

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
        setLiveBitrate(streamProfile === 'high' ? '~4.5 Mbps' : '~1.8 Mbps');
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

  const bgImages = VIRTUAL_BG_PRESETS.map(p => ({ id: p.id, url: p.value, label: p.label }));

  // Clean formatted speaker attribution & Transcript Auto-save Logic
  const getMySpeakerName = useCallback(() => {
    const raw = localParticipant?.identity;
    if (raw) {
      const resolved = getDisplayName(raw);
      if (resolved && resolved !== 'Participant') return resolved;
    }
    if (user?.displayName) return user.displayName;
    if (typeof window !== 'undefined') {
      const guestStored = localStorage.getItem('forum_guest_username');
      if (guestStored?.trim()) return guestStored.trim();
    }
    return 'Speaker';
  }, [localParticipant?.identity, getDisplayName, user?.displayName]);

  const guestTranscriptKey = room ? `forum_guest_transcript_${room}` : '';
  const fullTranscriptLogRef = useRef<string>('');

  const persistGuestTranscriptLocal = useCallback((bodyText: string) => {
    if (!guestTranscriptKey || typeof window === 'undefined') return;
    try {
      const title = `Meeting Transcript: ${meetingDetails?.title || room} (${format(new Date(), 'PP')})`;
      localStorage.setItem(
        guestTranscriptKey,
        JSON.stringify({
          title,
          roomId: room,
          body: bodyText,
          updatedAt: Date.now(),
        })
      );
    } catch {}
  }, [guestTranscriptKey, meetingDetails?.title, room]);

  const safeRoomKey = (room || 'room').replace(/[^a-zA-Z0-9_-]/g, '_');

  const getTranscriptTitleAndHeader = useCallback(() => {
    const title = `Meeting Transcript: ${meetingDetails?.title || room} (${format(new Date(), 'PP')})`;
    const header = `# ${title}\n**Date:** ${transcriptSessionStartRef.current}\n**Room:** ${room}\n\n## Live Transcript\n`;
    return { title, header };
  }, [meetingDetails?.title, room]);

  const buildCompleteTranscriptText = useCallback((includeInterim = true) => {
    const { header } = getTranscriptTitleAndHeader();
    const baseHeader = existingTranscriptPrefixRef.current
      ? `${existingTranscriptPrefixRef.current.trimEnd()}\n`
      : header;

    const blocks = transcriptBlocksRef.current.map((b) => ({ ...b }));
    const interimClean = includeInterim ? localTranscriptRef.current.replace(/\s+/g, ' ').trim() : '';
    if (interimClean) {
      const mySpeaker = getMySpeakerName();
      const now = Date.now();
      const ts = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const last = blocks[blocks.length - 1];
      if (
        last &&
        last.speaker === mySpeaker &&
        now - last.timestamp < 120_000 &&
        last.text.length + 1 + interimClean.length <= MAX_TRANSCRIPT_BLOCK_CHARS
      ) {
        if (!(interimClean.length > 4 && last.text.toLowerCase().endsWith(interimClean.toLowerCase()))) {
          blocks[blocks.length - 1] = {
            ...last,
            text: `${last.text} ${interimClean}`.trim(),
          };
        }
      } else {
        blocks.push({
          id: 'interim',
          identity: localParticipant?.identity || mySpeaker,
          speaker: mySpeaker,
          timeLabel: ts,
          text: interimClean,
          timestamp: now,
        });
      }
    }

    const formattedBlocks = blocks
      .map((b) => `\n**[${b.timeLabel}] ${b.speaker}:** ${b.text}\n`)
      .join('');

    return `${baseHeader}${formattedBlocks}`;
  }, [getTranscriptTitleAndHeader, getMySpeakerName, localParticipant?.identity]);

  const flushTranscriptBuffer = useCallback(async () => {
    const activeUser = user || komuUser;
    if (!activeUser) return;
    if (!transcriptDirtyRef.current && transcriptBlocksRef.current.length === 0) return;

    if (isSyncingTranscriptRef.current) {
      transcriptNeedsResyncRef.current = true;
      return;
    }

    const deterministicId = transcriptNoteIdRef.current || `transcript_${activeUser.uid}_${safeRoomKey}`;
    isSyncingTranscriptRef.current = true;

    try {
      do {
        transcriptNeedsResyncRef.current = false;
        transcriptDirtyRef.current = false;

        if (!hasLoadedExistingTranscriptRef.current) {
          try {
            const snap = await getDoc(doc(komuDb, 'notes', deterministicId));
            if (snap.exists()) {
              hasCreatedTranscriptDocRef.current = true;
              const existingBody = (snap.data()?.body || '').trimEnd();
              if (existingBody && !existingTranscriptPrefixRef.current) {
                existingTranscriptPrefixRef.current = existingBody;
              }
            }
          } catch {}
          hasLoadedExistingTranscriptRef.current = true;
        }

        const { title } = getTranscriptTitleAndHeader();
        const canonicalBody = buildCompleteTranscriptText(false);
        fullTranscriptLogRef.current = canonicalBody;

        const payload: Record<string, any> = {
          uid: activeUser.uid,
          title,
          body: canonicalBody,
          type: 'transcript',
          roomId: room || '',
          isArchive: false,
          isTrash: false,
          updatedAt: serverTimestamp(),
          color: '#ffffff',
        };
        if (!hasCreatedTranscriptDocRef.current) {
          payload.createdAt = serverTimestamp();
        }

        await setDoc(doc(komuDb, 'notes', deterministicId), payload, { merge: true });
        hasCreatedTranscriptDocRef.current = true;
        transcriptNoteIdRef.current = deterministicId;
        setTranscriptNoteId(deterministicId);
        lastFlushTimeRef.current = Date.now();
      } while (transcriptNeedsResyncRef.current);
    } catch (err) {
      console.error("[MeetingPage] Failed to sync transcript note:", err);
      transcriptDirtyRef.current = true;
    } finally {
      isSyncingTranscriptRef.current = false;
    }
  }, [user, komuUser, safeRoomKey, getTranscriptTitleAndHeader, buildCompleteTranscriptText, room]);

  const createTranscriptNoteDocIfNeeded = useCallback(async () => {
    const activeUser = user || komuUser;
    if (!activeUser || isCreatingTranscriptRef.current) return;
    const deterministicId = `transcript_${activeUser.uid}_${safeRoomKey}`;
    if (transcriptNoteIdRef.current === deterministicId && hasCreatedTranscriptDocRef.current) return;

    isCreatingTranscriptRef.current = true;
    try {
      const noteRef = doc(komuDb, 'notes', deterministicId);
      if (!hasLoadedExistingTranscriptRef.current) {
        try {
          const snap = await getDoc(noteRef);
          if (snap.exists()) {
            hasCreatedTranscriptDocRef.current = true;
            const existingBody = (snap.data()?.body || '').trimEnd();
            if (existingBody && !existingTranscriptPrefixRef.current) {
              existingTranscriptPrefixRef.current = existingBody;
            }
          }
        } catch {}
        hasLoadedExistingTranscriptRef.current = true;
      }

      const { title } = getTranscriptTitleAndHeader();
      const canonicalBody = buildCompleteTranscriptText(false);
      fullTranscriptLogRef.current = canonicalBody;

      const payload: Record<string, any> = {
        uid: activeUser.uid,
        title,
        body: canonicalBody,
        type: 'transcript',
        roomId: room || '',
        isArchive: false,
        isTrash: false,
        updatedAt: serverTimestamp(),
        color: '#ffffff',
      };
      if (!hasCreatedTranscriptDocRef.current) {
        payload.createdAt = serverTimestamp();
      }
      await setDoc(noteRef, payload, { merge: true });
      hasCreatedTranscriptDocRef.current = true;
      transcriptNoteIdRef.current = deterministicId;
      setTranscriptNoteId(deterministicId);
      lastFlushTimeRef.current = Date.now();
    } catch (err) {
      console.error("[MeetingPage] Failed to create single transcript note:", err);
    } finally {
      isCreatingTranscriptRef.current = false;
    }
  }, [user, komuUser, safeRoomKey, getTranscriptTitleAndHeader, buildCompleteTranscriptText, room]);

  // Create/attach the single background transcript doc once connected (no duplicates)
  useEffect(() => {
    if (!autoSaveTranscript || !(user || komuUser) || connectionState !== ConnectionState.Connected) return;
    if (!transcriptNoteIdRef.current && !isCreatingTranscriptRef.current) {
      void createTranscriptNoteDocIfNeeded();
    }
  }, [autoSaveTranscript, user, komuUser, connectionState, createTranscriptNoteDocIfNeeded]);

  const appendToTranscriptNote = useCallback(async (speaker: string, text: string, identityArg?: string) => {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (!autoSaveTranscriptRef.current || !cleanText) return;

    const cleanSpeaker = speaker && speaker !== 'You' ? speaker : getMySpeakerName();
    const now = Date.now();
    const prevCommit = lastCommittedSpeechRef.current;
    if (
      prevCommit &&
      prevCommit.speaker === cleanSpeaker &&
      now - prevCommit.at < 2500 &&
      (prevCommit.text.toLowerCase() === cleanText.toLowerCase() ||
        (cleanText.length > 5 && prevCommit.text.toLowerCase().endsWith(cleanText.toLowerCase())))
    ) {
      return;
    }
    lastCommittedSpeechRef.current = { speaker: cleanSpeaker, text: cleanText, at: now };

    const resolvedIdentity = identityArg || localParticipant?.identity || cleanSpeaker;
    const timeLabel = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const chunks: string[] = [];
    if (cleanText.length <= MAX_TRANSCRIPT_BLOCK_CHARS) {
      chunks.push(cleanText);
    } else {
      let remaining = cleanText;
      while (remaining.length > MAX_TRANSCRIPT_BLOCK_CHARS) {
        let splitIdx = remaining.lastIndexOf('. ', MAX_TRANSCRIPT_BLOCK_CHARS);
        if (splitIdx < MAX_TRANSCRIPT_BLOCK_CHARS * 0.4) {
          splitIdx = remaining.lastIndexOf(' ', MAX_TRANSCRIPT_BLOCK_CHARS);
        }
        if (splitIdx <= 0) splitIdx = MAX_TRANSCRIPT_BLOCK_CHARS;
        chunks.push(remaining.slice(0, splitIdx + 1).trim());
        remaining = remaining.slice(splitIdx + 1).trim();
      }
      if (remaining) chunks.push(remaining);
    }

    const blocks = transcriptBlocksRef.current;
    for (const piece of chunks) {
      const currentLast = blocks[blocks.length - 1];
      const canMerge = Boolean(
        currentLast &&
        currentLast.speaker === cleanSpeaker &&
        now - currentLast.timestamp < 120_000 &&
        currentLast.text.length + 1 + piece.length <= MAX_TRANSCRIPT_BLOCK_CHARS
      );

      if (canMerge) {
        if (!(piece.length > 4 && currentLast.text.toLowerCase().endsWith(piece.toLowerCase()))) {
          blocks[blocks.length - 1] = {
            ...currentLast,
            text: `${currentLast.text} ${piece}`.trim(),
            timestamp: now,
          };
        }
      } else {
        blocks.push({
          id: `tb_${now}_${Math.random().toString(36).slice(2, 7)}`,
          identity: resolvedIdentity,
          speaker: cleanSpeaker,
          timeLabel,
          text: piece,
          timestamp: now,
        });
      }
    }

    setTranscriptions([...blocks.slice(-80)]);

    const fullBody = buildCompleteTranscriptText(false);
    fullTranscriptLogRef.current = fullBody;
    hasDownloadedTranscriptRef.current = false;
    transcriptDirtyRef.current = true;
    persistGuestTranscriptLocal(fullBody);

    const activeUser = user || komuUser;
    if (!activeUser) return;

    if (Date.now() - lastFlushTimeRef.current > 550) {
      void flushTranscriptBuffer();
    }
  }, [user, komuUser, localParticipant?.identity, getMySpeakerName, buildCompleteTranscriptText, persistGuestTranscriptLocal, flushTranscriptBuffer]);

  const persistTranscriptKeepalive = useCallback((includeInterim = true) => {
    if (!autoSaveTranscriptRef.current) return;
    const bodyText = buildCompleteTranscriptText(includeInterim);
    const hasSpokenLines =
      transcriptBlocksRef.current.length > 0 ||
      Boolean(localTranscriptRef.current.trim()) ||
      bodyText.includes('**[');
    if (!hasSpokenLines) return;

    persistGuestTranscriptLocal(bodyText);

    const activeUser = user || komuUser;
    if (!activeUser?.uid) return;

    const deterministicId = transcriptNoteIdRef.current || `transcript_${activeUser.uid}_${safeRoomKey}`;
    const { title } = getTranscriptTitleAndHeader();

    // Always write a local recovery entry synchronously in case browser kills network before completion
    try {
      const raw = localStorage.getItem('forum_pending_transcript_sync_v1');
      const existing = raw ? JSON.parse(raw) : {};
      existing[deterministicId] = {
        docId: deterministicId,
        uid: activeUser.uid,
        title,
        body: bodyText,
        roomId: room || '',
        updatedAt: Date.now(),
      };
      localStorage.setItem('forum_pending_transcript_sync_v1', JSON.stringify(existing));
    } catch {}

    const token = cachedIdTokenRef.current;
    if (!token) return;

    const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const url =
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(dbId)}/documents/notes/${encodeURIComponent(deterministicId)}` +
      `?updateMask.fieldPaths=uid&updateMask.fieldPaths=title&updateMask.fieldPaths=body&updateMask.fieldPaths=type&updateMask.fieldPaths=roomId&updateMask.fieldPaths=isArchive&updateMask.fieldPaths=isTrash&updateMask.fieldPaths=updatedAt`;

    const payload = JSON.stringify({
      fields: {
        uid: { stringValue: activeUser.uid },
        title: { stringValue: title },
        body: { stringValue: bodyText },
        type: { stringValue: 'transcript' },
        roomId: { stringValue: room || '' },
        isArchive: { booleanValue: false },
        isTrash: { booleanValue: false },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    });

    try {
      void fetch(url, {
        method: 'PATCH',
        keepalive: payload.length <= 60000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      }).then((res) => {
        if (res.ok) {
          try {
            const raw = localStorage.getItem('forum_pending_transcript_sync_v1');
            if (raw) {
              const map = JSON.parse(raw);
              delete map[deterministicId];
              if (Object.keys(map).length === 0) {
                localStorage.removeItem('forum_pending_transcript_sync_v1');
              } else {
                localStorage.setItem('forum_pending_transcript_sync_v1', JSON.stringify(map));
              }
            }
          } catch {}
        }
      }).catch(() => {});
    } catch {}
  }, [buildCompleteTranscriptText, persistGuestTranscriptLocal, user, komuUser, safeRoomKey, getTranscriptTitleAndHeader, room]);

  const downloadTranscriptFileIfNeeded = useCallback(() => {
    if (hasDownloadedTranscriptRef.current || !autoSaveTranscriptRef.current || !autoDownloadTranscriptRef.current) return;
    const bodyText = buildCompleteTranscriptText(true);
    const hasSpokenLines =
      transcriptBlocksRef.current.length > 0 ||
      Boolean(localTranscriptRef.current.trim()) ||
      bodyText.includes('**[');
    if (!hasSpokenLines) return;

    hasDownloadedTranscriptRef.current = true;
    try {
      const { title } = getTranscriptTitleAndHeader();
      downloadStyledTranscript({
        roomId: room || safeRoomKey,
        title,
        dateText: transcriptSessionStartRef.current,
        rawBody: bodyText,
      });
    } catch {
      hasDownloadedTranscriptRef.current = false;
    }
  }, [buildCompleteTranscriptText, getTranscriptTitleAndHeader, room, safeRoomKey]);

  transcriptAutoDownloadHelpersRef.current = {
    saveKeepalive: () => persistTranscriptKeepalive(true),
    downloadFile: downloadTranscriptFileIfNeeded,
  };

  const flushTranscriptBeforeExit = useCallback(async () => {
    const pendingInterim = localTranscriptRef.current.trim();
    if (pendingInterim) {
      const speakerName = getMySpeakerName();
      localTranscriptRef.current = "";
      setLocalTranscript("");
      await appendToTranscriptNote(speakerName, pendingInterim, localParticipant?.identity);
    }
    if (transcriptDirtyRef.current) {
      await flushTranscriptBuffer();
    }
  }, [getMySpeakerName, localParticipant?.identity, appendToTranscriptNote, flushTranscriptBuffer]);

  const flushTranscriptBeforeExitRef = useRef(flushTranscriptBeforeExit);
  flushTranscriptBeforeExitRef.current = flushTranscriptBeforeExit;

  // AI Meeting Summary State (Uses AI on-demand / end-of-meeting — NOT live background polling)
  const [isAiSummarizing, setIsAiSummarizing] = useState(false);
  const [aiSummaryStatus, setAiSummaryStatus] = useState<string | null>(null);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [lastAiSyncedAt, setLastAiSyncedAt] = useState<number | null>(null);
  const [generatedAiNote, setGeneratedAiNote] = useState<string>(() => {
    if (typeof window === 'undefined' || !room) return '';
    try {
      return localStorage.getItem(`forum_guest_ai_notes_${room}`) || '';
    } catch {
      return '';
    }
  });

  const buildMeetingTranscriptSnapshot = useCallback(() => {
    const mySpeaker = getMySpeakerName();
    const transcriptLines: string[] = [];
    transcriptions.forEach((t) => {
      const speakerLabel =
        t.identity === localParticipant?.identity || t.identity === 'You'
          ? mySpeaker
          : getDisplayName(t.identity);
      const tsLabel = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      transcriptLines.push(`[${tsLabel}] ${speakerLabel}: ${t.text}`);
    });
    if (localTranscriptRef.current.trim()) {
      transcriptLines.push(`[Live] ${mySpeaker}: ${localTranscriptRef.current.trim()}`);
    }
    if (transcriptBufferRef.current.length > 0) {
      transcriptLines.push(...transcriptBufferRef.current);
    }
    chatMessages.forEach((c) => {
      transcriptLines.push(`[Chat] ${getDisplayName(c.from?.identity)}: ${c.message}`);
    });

    const participantsList = Array.from(
      new Set([mySpeaker, ...remoteParticipants.map((p) => getDisplayName(p.identity))].filter(Boolean))
    );

    const transcriptSnapshot =
      transcriptLines.join("\n").trim() ||
      fullTranscriptLogRef.current.trim() ||
      `Meeting session "${meetingDetails?.title || room}" in room ${room}. Participants present: ${participantsList.join(', ')}.`;

    return { transcriptSnapshot, participantsList };
  }, [getMySpeakerName, transcriptions, localParticipant?.identity, getDisplayName, chatMessages, remoteParticipants, meetingDetails?.title, room]);

  useEffect(() => {
    if (!sessionSummaryDataRef) return;
    const { transcriptSnapshot, participantsList } = buildMeetingTranscriptSnapshot();
    sessionSummaryDataRef.current = {
      sessionSid: activeSessionSidRef.current || undefined,
      transcriptSnapshot,
      participants: participantsList,
      initialAiSummary: generatedAiNote || undefined,
    };
  }, [sessionSummaryDataRef, buildMeetingTranscriptSnapshot, generatedAiNote]);

  const persistAiNoteToFirestore = useCallback(async (noteText: string) => {
    if (!noteText.trim()) return;
    try {
      if (room) localStorage.setItem(`forum_guest_ai_notes_${room}`, noteText);
    } catch {}

    const activeUser = user || komuUser;
    if (!activeUser?.uid) {
      setLastAiSyncedAt(Date.now());
      return;
    }

    const summaryDocId = `summary_${activeUser.uid}_${safeRoomKey}`;
    const title = `AI Summary: ${meetingDetails?.title || room} (${format(new Date(), 'PP')})`;
    await setDoc(doc(komuDb, 'notes', summaryDocId), {
      uid: activeUser.uid,
      title,
      body: noteText,
      type: 'summary',
      roomId: room || '',
      isArchive: false,
      isTrash: false,
      updatedAt: serverTimestamp(),
      color: '#ffffff'
    }, { merge: true });
    setLastAiSyncedAt(Date.now());
  }, [user, komuUser, meetingDetails?.title, room, safeRoomKey]);

  const generateAiMeetingSummary = useCallback(async (
    formatType: 'summary' | 'action_items' | 'full_notes' = 'summary'
  ) => {
    if (isAiSummarizing) return;
    setIsAiSummarizing(true);
    setAiSummaryError(null);
    setAiSummaryStatus("Generating AI meeting summary…");
    try {
      const { transcriptSnapshot, participantsList } = buildMeetingTranscriptSnapshot();

      const res = await fetch('/api/ai/meeting-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptSnapshot,
          existingNotes: generatedAiNote || undefined,
          meetingTitle: meetingDetails?.title || `Meeting ${room}`,
          participants: participantsList,
          formatType
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `AI summary failed (HTTP ${res.status})`);
      }

      const generatedNote = data.result || data.summary || data.notes || "";
      if (!generatedNote) {
        throw new Error("Gemini returned an empty AI summary response.");
      }

      setGeneratedAiNote(generatedNote);
      setAiSummaryError(null);
      await persistAiNoteToFirestore(generatedNote);

      setToastMessage(
        formatType === 'action_items'
          ? "Action items generated & saved"
          : "AI meeting summary generated & saved"
      );
      setTimeout(() => setToastMessage(null), 3000);
      setAiSummaryStatus(null);
    } catch (err: any) {
      const msg = err?.message || "Could not generate AI meeting summary right now.";
      console.warn("AI summary error:", msg);
      setAiSummaryError(msg);
      setAiSummaryStatus(null);
    } finally {
      setIsAiSummarizing(false);
    }
  }, [
    isAiSummarizing,
    buildMeetingTranscriptSnapshot,
    generatedAiNote,
    meetingDetails?.title,
    room,
    persistAiNoteToFirestore,
  ]);

  // Periodic background flush & guaranteed keepalive save on tab hide / unload / unmount
  useEffect(() => {
    if (autoSaveTranscript) {
      flushIntervalRef.current = setInterval(() => {
        void flushTranscriptBuffer();
      }, 1500);
    } else {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      void flushTranscriptBuffer();
    }

    const handleVisibilityOrUnload = () => {
      if (document.visibilityState === 'hidden') {
        transcriptAutoDownloadHelpersRef.current.saveKeepalive();
        void flushTranscriptBuffer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrUnload);

    return () => {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      transcriptAutoDownloadHelpersRef.current.saveKeepalive();
      void flushTranscriptBeforeExitRef.current();
    };
  }, [autoSaveTranscript, flushTranscriptBuffer]);

  const getMySpeakerNameRef = useRef(getMySpeakerName);
  getMySpeakerNameRef.current = getMySpeakerName;
  const appendToTranscriptNoteRef = useRef(appendToTranscriptNote);
  appendToTranscriptNoteRef.current = appendToTranscriptNote;

  // Live Captions & Always-On Background Transcription
  // On mobile devices, never invoke window.SpeechRecognition (which triggers Android/iOS OS chimes and interrupts call audio);
  // instead capture voice quietly from a cloned LiveKit microphone track and transcribe voiced chunks in the background.
  useEffect(() => {
    const shouldTranscribe = (autoSaveTranscript || isCaptionsEnabled) && localParticipant?.isMicrophoneEnabled;
    if (!shouldTranscribe) {
      if (localTranscriptRef.current.trim()) {
        const pending = localTranscriptRef.current.trim();
        const mySpeaker = getMySpeakerNameRef.current();
        localTranscriptRef.current = "";
        setLocalTranscript("");
        void appendToTranscriptNoteRef.current(mySpeaker, pending, localParticipant?.identity);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      void flushTranscriptBuffer();
      return;
    }

    const isHandheldMobile =
      isMobileBrowser() ||
      (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

    if (isHandheldMobile) {
      let isCancelled = false;
      let clonedTrack: MediaStreamTrack | null = null;
      let audioCtx: AudioContext | null = null;
      let rmsInterval: any = null;
      let chunkTimeout: any = null;
      let recorder: MediaRecorder | null = null;
      let activeChunks: BlobPart[] = [];
      let peakRmsInChunk = 0;
      let isTranscribing = false;

      const pickSupportedMime = () => {
        if (typeof MediaRecorder === 'undefined') return '';
        const candidates = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg;codecs=opus',
        ];
        return candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
      };

      const sendVoicedChunk = async (blob: Blob) => {
        if (isCancelled || blob.size < 1800) return;
        if (isTranscribing) return;
        isTranscribing = true;
        try {
          const base64: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = typeof reader.result === 'string' ? reader.result : '';
              const comma = res.indexOf(',');
              resolve(comma >= 0 ? res.slice(comma + 1) : res);
            };
            reader.onerror = () => reject(new Error('Audio read error'));
            reader.readAsDataURL(blob);
          });

          if (!base64 || isCancelled) return;
          const resp = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: blob.type || 'audio/webm',
            }),
          });
          if (!resp.ok || isCancelled) return;
          const data = await resp.json().catch(() => ({}));
          const text = String(data?.text || '').replace(/\s+/g, ' ').trim();
          if (!text || isCancelled) return;

          const mySpeaker = getMySpeakerNameRef.current();
          void appendToTranscriptNoteRef.current(mySpeaker, text, localParticipant?.identity);
          safeSendData(sendTranscription, {
            text,
            identity: localParticipant?.identity,
            isFinal: true,
          }, true);
          if (isCaptionsEnabled) {
            showSingleCaption(mySpeaker, text, true);
          }
        } catch {
          // Silent background fallback — never interrupt meeting audio or display intrusive popups
        } finally {
          isTranscribing = false;
        }
      };

      const startSilentMobileCapture = () => {
        const micPub = localParticipant?.getTrackPublication(Track.Source.Microphone);
        const rawTrack = micPub?.track?.mediaStreamTrack;
        if (!rawTrack || rawTrack.readyState !== 'live' || typeof MediaRecorder === 'undefined') return;

        clonedTrack = rawTrack.clone();
        const stream = new MediaStream([clonedTrack]);

        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            audioCtx = new AudioCtx();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const dataArr = new Uint8Array(analyser.fftSize);
            rmsInterval = setInterval(() => {
              if (isCancelled) return;
              analyser.getByteTimeDomainData(dataArr);
              let sumSq = 0;
              for (let i = 0; i < dataArr.length; i++) {
                const v = (dataArr[i] - 128) / 128;
                sumSq += v * v;
              }
              const rms = Math.sqrt(sumSq / dataArr.length);
              if (rms > peakRmsInChunk) peakRmsInChunk = rms;
            }, 120);
          }
        } catch {}

        const mimeType = pickSupportedMime();
        const launchSegment = () => {
          if (isCancelled || !clonedTrack || clonedTrack.readyState !== 'live') return;
          activeChunks = [];
          peakRmsInChunk = 0;
          try {
            recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          } catch {
            return;
          }

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) activeChunks.push(ev.data);
          };

          recorder.onstop = () => {
            const hadVoice = !audioCtx || peakRmsInChunk > 0.015;
            const chunksCopy = activeChunks;
            const outType = recorder?.mimeType || mimeType || 'audio/webm';
            activeChunks = [];
            if (!isCancelled && hadVoice && chunksCopy.length > 0) {
              const blob = new Blob(chunksCopy, { type: outType });
              void sendVoicedChunk(blob);
            }
            if (!isCancelled) {
              setTimeout(launchSegment, 80);
            }
          };

          try {
            recorder.start();
            chunkTimeout = setTimeout(() => {
              if (recorder && recorder.state === 'recording') {
                try {
                  recorder.stop();
                } catch {}
              }
            }, 5500);
          } catch {}
        };

        launchSegment();
      };

      const bootTimer = setTimeout(startSilentMobileCapture, 250);

      return () => {
        isCancelled = true;
        clearTimeout(bootTimer);
        if (chunkTimeout) clearTimeout(chunkTimeout);
        if (rmsInterval) clearInterval(rmsInterval);
        if (recorder && recorder.state === 'recording') {
          try {
            recorder.onstop = null;
            recorder.stop();
          } catch {}
        }
        if (clonedTrack) {
          try {
            clonedTrack.stop();
          } catch {}
        }
        if (audioCtx) {
          audioCtx.close().catch(() => {});
        }
      };
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not supported in this browser.");
      return;
    }

    let isDestroyed = false;
    let recognition: any = null;
    let restartTimeout: any = null;
    let retryCount = 0;
    let sessionInterim = '';

    const commitPendingInterim = () => {
      const leftover = (sessionInterim || localTranscriptRef.current).replace(/\s+/g, ' ').trim();
      if (!leftover) return;
      sessionInterim = '';
      localTranscriptRef.current = '';
      setLocalTranscript('');
      const mySpeaker = getMySpeakerNameRef.current();
      void appendToTranscriptNoteRef.current(mySpeaker, leftover, localParticipant?.identity);
      safeSendData(sendTranscription, {
        text: leftover,
        identity: localParticipant?.identity,
        isFinal: true
      }, true);
    };

    const scheduleRestart = (baseMs = 350) => {
      if (isDestroyed) return;
      if (restartTimeout) clearTimeout(restartTimeout);
      const delay = Math.min(baseMs * Math.pow(1.4, retryCount), 3000);
      retryCount++;
      restartTimeout = setTimeout(startRecognition, delay);
    };

    const startRecognition = () => {
      if (isDestroyed) return;

      try {
        if (recognition) {
          try {
            recognition.onresult = null;
            recognition.onend = null;
            recognition.onerror = null;
            recognition.abort();
          } catch {}
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          retryCount = 0;
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const chunk = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              finalTranscript += chunk;
            } else {
              interimTranscript += chunk;
            }
          }

          const mySpeaker = getMySpeakerNameRef.current();
          const cleanedFinal = finalTranscript.replace(/\s+/g, ' ').trim();
          const cleanedInterim = interimTranscript.replace(/\s+/g, ' ').trim();

          if (cleanedFinal) {
            sessionInterim = '';
            void appendToTranscriptNoteRef.current(mySpeaker, cleanedFinal, localParticipant?.identity);
            safeSendData(sendTranscription, {
              text: cleanedFinal,
              identity: localParticipant?.identity,
              isFinal: true
            }, true);
          }

          // Preserve live interim words cleanly — never wipe interim when final also arrived
          sessionInterim = cleanedInterim;
          localTranscriptRef.current = cleanedInterim;
          setLocalTranscript(cleanedInterim);

          const captionSpeech = cleanedInterim || cleanedFinal;
          if (captionSpeech) {
            if (isCaptionsEnabled) {
              showSingleCaption(mySpeaker, captionSpeech, true);
            }
            if (cleanedInterim) {
              safeSendData(sendTranscription, {
                text: cleanedInterim,
                identity: localParticipant?.identity,
                isFinal: false
              }, true);
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            console.warn("Speech recognition blocked by permissions:", event.error);
            commitPendingInterim();
            isDestroyed = true;
            return;
          }
          if (event.error === 'aborted' || event.error === 'no-speech' || event.error === 'network' || event.error === 'audio-capture') {
            commitPendingInterim();
            scheduleRestart(600);
          }
        };

        recognition.onend = () => {
          commitPendingInterim();
          if (!isDestroyed) {
            scheduleRestart(250);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn("Speech recognition restart scheduled:", err);
        scheduleRestart(900);
      }
    };

    startRecognition();

    return () => {
      isDestroyed = true;
      if (restartTimeout) clearTimeout(restartTimeout);
      commitPendingInterim();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isCaptionsEnabled, autoSaveTranscript, localParticipant?.isMicrophoneEnabled, localParticipant?.identity]);

  // Handle Incoming Transcriptions
  const { send: sendTranscription } = useDataChannel("transcription", (msg) => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(msg.payload));
      const speakerLabel = getDisplayName(payload.identity);
      if (payload.text) {
        showSingleCaption(speakerLabel, payload.text, false);
      }

      if (payload.isFinal && payload.text) {
        void appendToTranscriptNoteRef.current(speakerLabel, payload.text, payload.identity);
      }
    } catch {}
  });

  // Apply Camera Device, Resolution & Profile Settings safely
  const prevCamSettingsRef = useRef<{ videoId: string; res: string; profile: string } | null>(null);
  useEffect(() => {
    const cur = { videoId: selectedVideoId, res: selectedResolution, profile: streamProfile };
    const prev = prevCamSettingsRef.current;
    prevCamSettingsRef.current = cur;
    if (!prev) return;
    if (prev.videoId === cur.videoId && prev.res === cur.res && prev.profile === cur.profile) return;
    if (localParticipant?.isCameraEnabled) {
      localParticipant.setCameraEnabled(true, {
        ...(selectedVideoId && selectedVideoId !== 'default' ? { deviceId: selectedVideoId } : {}),
        facingMode,
        resolution: getCameraVideoPreset(selectedResolution, streamProfile === 'high'),
      }).catch(err => {
        console.warn("Could not switch camera settings:", err?.message || err);
      });
    }
  }, [selectedVideoId, selectedResolution, streamProfile, localParticipant, facingMode, getCameraVideoPreset]);

  useEffect(() => {
    saveAudioSoundMode(audioSoundMode);
    if (audioSmoothProcessorRef.current) {
      audioSmoothProcessorRef.current.setMode(audioSoundMode);
    }
  }, [audioSoundMode]);

  useEffect(() => {
    savePerformanceAudioOptions(performanceAudioOptions);
    if (audioSmoothProcessorRef.current) {
      audioSmoothProcessorRef.current.setPerformanceOptions(performanceAudioOptions);
    }
  }, [performanceAudioOptions]);

  useEffect(() => {
    if (!localParticipant || !isMicEnabled) return;
    let cancelled = false;

    const applyAudioSetup = async () => {
      const audioOpts = getCaptureOptionsForSoundMode(
        audioSoundMode,
        noiseCancellation,
        echoCancellation,
        selectedAudioId && selectedAudioId !== 'default' ? selectedAudioId : undefined
      );
      try {
        await localParticipant.setMicrophoneEnabled(true, audioOpts);
      } catch (err: any) {
        console.warn("Could not apply audio device/filter settings:", err?.message || err);
        return;
      }

      if (cancelled) return;
      const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
      const audioTrack = micPub?.audioTrack as LocalAudioTrack | undefined;
      if (!audioTrack) return;

      try {
        if (!audioSmoothCtxRef.current || audioSmoothCtxRef.current.state === 'closed') {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          audioSmoothCtxRef.current = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
        }
        if (audioSmoothCtxRef.current.state === 'suspended') {
          await audioSmoothCtxRef.current.resume().catch(() => {});
        }
        (audioTrack as any).setAudioContext?.(audioSmoothCtxRef.current);

        if (!audioSmoothProcessorRef.current) {
          audioSmoothProcessorRef.current = new ForumAudioSmoothingProcessor(audioSoundMode, performanceAudioOptions);
        } else {
          audioSmoothProcessorRef.current.setMode(audioSoundMode);
          audioSmoothProcessorRef.current.setPerformanceOptions(performanceAudioOptions);
        }

        if (audioTrack.getProcessor() !== audioSmoothProcessorRef.current) {
          await audioTrack.setProcessor(audioSmoothProcessorRef.current as any);
        }
      } catch (procErr) {
        console.warn("[AudioSmoothing] Web Audio processor fallback:", procErr);
      }
    };

    void applyAudioSetup();
    return () => {
      cancelled = true;
    };
  }, [selectedAudioId, noiseCancellation, echoCancellation, audioSoundMode, localParticipant, isMicEnabled, localParticipant?.isMicrophoneEnabled]);

  const sendReaction = (emoji: string) => {
    const id = Date.now();
    const x = 20 + Math.random() * 60; // Random horizontal position
    setReactions(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 4000);
    // Send to others via reaction data channel
    safeSendData(sendReactionData, { type: 'reaction', emoji }, true);
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
  }, [chatMessages, customTabMessages, activityLogs, activeChatTabId]);

  const toggleHandRaise = () => {
    if (connectionState !== ConnectionState.Connected) return;
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    setRaisedHands(prev => ({ ...prev, [localParticipant.identity]: newState }));
    safeSendData(sendHandRaise, {
      type: 'hand-raise',
      raised: newState,
      identity: localParticipant.identity,
      displayName: localParticipant.identity.split('#')[0],
    }, true);
  };

  const getTrackKey = useCallback((t?: TrackReferenceOrPlaceholder | null) => {
    if (!t?.participant) return '';
    return `${t.participant.identity}::${t.source}`;
  }, []);

  const isTrackPinned = useCallback((t?: TrackReferenceOrPlaceholder | null) => {
    if (!t?.participant) return false;
    return pinnedIdentities.has(getTrackKey(t)) || pinnedIdentities.has(t.participant.identity);
  }, [pinnedIdentities, getTrackKey]);

  const processedTracks = useMemo(() => {
    if (!tracks || tracks.length === 0) return [];

    // Filter out hidden non-video (always keep ScreenShare) and pending waiting-room participants
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
    });

    // Strictly deterministic sort — NEVER reorder by isSpeaking so Grid cards never jump when someone talks
    return filtered.sort((a, b) => {
      const aId = a.participant?.identity || "";
      const bId = b.participant?.identity || "";
      
      // Screen shares always ordered consistently first
      const aScreen = a.source === Track.Source.ScreenShare ? 1 : 0;
      const bScreen = b.source === Track.Source.ScreenShare ? 1 : 0;
      if (aScreen !== bScreen) return bScreen - aScreen;

      // Pinned tracks next
      const aPinned = isTrackPinned(a) ? 1 : 0;
      const bPinned = isTrackPinned(b) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      // Remote participants before local participant, then alphabetical identity for zero-jitter Grid stability
      if (a.participant.isLocal !== b.participant.isLocal) return a.participant.isLocal ? 1 : -1;
      if (aId !== bId) return aId.localeCompare(bId);
      return String(a.source).localeCompare(String(b.source));
    }).slice(0, maxParticipants);
  }, [tracks, isTrackPinned, hideNonVideo, maxParticipants, isHost, admittedSids]);

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

  type StageTileItem =
    | { kind: 'track'; key: string; trackRef: TrackReferenceOrPlaceholder }
    | { kind: 'stage_card'; key: 'stage-presentation-card'; overlay: StageOverlayState };

  const stageItems = useMemo<StageTileItem[]>(() => {
    const trackItems: StageTileItem[] = processedTracks.map((t) => ({
      kind: 'track',
      key: getTrackKey(t),
      trackRef: t,
    }));

    if (!stageOverlay.active) return trackItems;

    const stageItem: StageTileItem = {
      kind: 'stage_card',
      key: 'stage-presentation-card',
      overlay: stageOverlay,
    };

    // Place pinned items first; otherwise keep Stage Card and Screen Shares at top of presentation priority
    const combined = [stageItem, ...trackItems];
    return combined.sort((a, b) => {
      const aPinned = pinnedIdentities.has(a.key) || (a.kind === 'track' && pinnedIdentities.has(a.trackRef.participant.identity)) ? 1 : 0;
      const bPinned = pinnedIdentities.has(b.key) || (b.kind === 'track' && pinnedIdentities.has(b.trackRef.participant.identity)) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aPri = a.kind === 'stage_card' ? 2 : a.trackRef.source === Track.Source.ScreenShare ? 1 : 0;
      const bPri = b.kind === 'stage_card' ? 2 : b.trackRef.source === Track.Source.ScreenShare ? 1 : 0;
      return bPri - aPri;
    });
  }, [processedTracks, stageOverlay, getTrackKey, pinnedIdentities]);

  const visibleStageItems = useMemo(() => {
    const MAX_TILES = isMobile ? 6 : 12;
    if (stageItems.length <= MAX_TILES) return stageItems;
    return stageItems.slice(0, MAX_TILES - 1);
  }, [stageItems, isMobile]);

  const extraStageItemCount = Math.max(0, stageItems.length - visibleStageItems.length);

  const mobilePrimaryItem = useMemo(() => {
    if (!visibleStageItems.length) return null;
    return (
      visibleStageItems.find((item) =>
        item.key === mobilePrimaryIdentity ||
        (item.kind === 'track' && item.trackRef.participant.identity === mobilePrimaryIdentity)
      ) || visibleStageItems[0]
    );
  }, [visibleStageItems, mobilePrimaryIdentity]);

  const mobileSecondaryItem = useMemo(() => {
    if (!visibleStageItems.length || !mobilePrimaryItem) return null;
    return visibleStageItems.find((item) => item.key !== mobilePrimaryItem.key) || visibleStageItems[1] || null;
  }, [visibleStageItems, mobilePrimaryItem]);

  const twoTileKeys =
    visibleStageItems.length === 2
      ? `${visibleStageItems[0]?.key || ''}|${visibleStageItems[1]?.key || ''}`
      : '';

  useEffect(() => {
    if (!isMobile || !twoTileKeys) return;
    const keys = twoTileKeys.split('|');
    if (!mobilePrimaryIdentity || !keys.includes(mobilePrimaryIdentity)) {
      setMobilePrimaryIdentity(keys[0]);
    }
  }, [isMobile, twoTileKeys, mobilePrimaryIdentity]);

  const isPortraitMobile = isMobile && !isMobileLandscape;

  const computedLayout = useMemo(() => {
    const someoneIsSharing = processedTracks.some(t => t.source === Track.Source.ScreenShare) || stageOverlay.active;
    if (layoutMode === 'auto') {
      if (pinnedIdentities.size > 0 || someoneIsSharing) return 'sidebar';
      if (isPortraitMobile && stageItems.length > 6) return 'sidebar';
      if (spotlightIdentity) return 'imo';
      return 'tiled';
    }
    return layoutMode;
  }, [layoutMode, pinnedIdentities.size, processedTracks, spotlightIdentity, stageOverlay.active, isPortraitMobile, stageItems.length]);

  // IMO View Spotlight Logic: minimum 1 minute hold (never runs in Grid view)
  useEffect(() => {
    if (computedLayout !== 'imo') return;
    const now = Date.now();
    const speakingParticipants = processedTracks.filter(t => t.participant.isSpeaking && t.source !== Track.Source.ScreenShare);
    const candidateTrack = speakingParticipants[0] || processedTracks[0];
    const candidate = candidateTrack ? getTrackKey(candidateTrack) : null;
    
    if (candidate && candidate !== spotlightIdentity) {
      if (now - lastSpotlightChangeRef.current > 60000 || !spotlightIdentity) {
        setSpotlightIdentity(candidate);
        lastSpotlightChangeRef.current = now;
      }
    }
  }, [processedTracks, computedLayout, spotlightIdentity, getTrackKey]);

  // Active speaker tracking with a long 15-second cooldown + sustained-speaking confirmation (never forces switches in Grid view)
  const pendingSpeakerTimeoutRef = useRef<any>(null);
  useEffect(() => {
    const SPEAKER_SWITCH_COOLDOWN_MS = 15000;
    const SUSTAINED_SPEECH_MS = 1200;

    if (processedTracks.length === 0) return;
    if (!activeSpeakerIdentity) {
      const initial = processedTracks.find(t => t.source !== Track.Source.ScreenShare) || processedTracks[0];
      if (initial) {
        setActiveSpeakerIdentity(initial.participant.identity);
        lastSpeakerChangeRef.current = Date.now();
      }
      return;
    }

    if (computedLayout === 'tiled') return;

    const currentSpeakerStillSpeaking = processedTracks.some(
      t => t.participant.identity === activeSpeakerIdentity && t.participant.isSpeaking
    );
    if (currentSpeakerStillSpeaking) {
      if (pendingSpeakerTimeoutRef.current) {
        clearTimeout(pendingSpeakerTimeoutRef.current);
        pendingSpeakerTimeoutRef.current = null;
      }
      return;
    }

    const speakingTrack = processedTracks.find(t => t.participant.isSpeaking);
    if (!speakingTrack) {
      if (pendingSpeakerTimeoutRef.current) {
        clearTimeout(pendingSpeakerTimeoutRef.current);
        pendingSpeakerTimeoutRef.current = null;
      }
      return;
    }

    const candidateId = speakingTrack.participant.identity;
    if (candidateId === activeSpeakerIdentity) return;

    const now = Date.now();
    if (now - lastSpeakerChangeRef.current < SPEAKER_SWITCH_COOLDOWN_MS) return;

    if (pendingSpeakerTimeoutRef.current) clearTimeout(pendingSpeakerTimeoutRef.current);
    pendingSpeakerTimeoutRef.current = setTimeout(() => {
      if (Date.now() - lastSpeakerChangeRef.current >= SPEAKER_SWITCH_COOLDOWN_MS) {
        setActiveSpeakerIdentity(candidateId);
        lastSpeakerChangeRef.current = Date.now();
      }
      pendingSpeakerTimeoutRef.current = null;
    }, SUSTAINED_SPEECH_MS);

    return () => {
      if (pendingSpeakerTimeoutRef.current) {
        clearTimeout(pendingSpeakerTimeoutRef.current);
        pendingSpeakerTimeoutRef.current = null;
      }
    };
  }, [processedTracks, activeSpeakerIdentity, computedLayout]);

  // Reset workspace maximized mode when switching tabs
  useEffect(() => {
    if (activeTab !== 'whiteboard') {
      setIsWorkspaceMaximized(false);
    }
  }, [activeTab]);

  const activeSpeakerTrack = useMemo(() => {
    if (!activeSpeakerIdentity) return processedTracks[0] || null;
    return processedTracks.find(t => t.participant.identity === activeSpeakerIdentity && t.source !== Track.Source.ScreenShare)
      || processedTracks.find(t => t.participant.identity === activeSpeakerIdentity)
      || processedTracks[0] || null;
  }, [processedTracks, activeSpeakerIdentity]);

  const isSidebarOpenOnDesktop = !isMobile && !isMobileLandscape && !!activeTab && activeTab !== 'settings' && !isWorkspaceMaximized;
  const sidebarWidthStyle = isSidebarOpenOnDesktop
    ? activeTab === 'whiteboard'
      ? '56vw'
      : activeTab === 'stage'
        ? '480px'
        : '380px'
    : '0px';

  const sidebarStageFocusItem = useMemo(() => {
    if (sidebarStagePinnedIdentity) {
      const found = visibleStageItems.find(
        (item) => item.key === sidebarStagePinnedIdentity || (item.kind === 'track' && item.trackRef.participant.identity === sidebarStagePinnedIdentity)
      );
      if (found) return found;
    }
    const stageCard = visibleStageItems.find((item) => item.kind === 'stage_card');
    if (stageCard) return stageCard;
    const screenItem = visibleStageItems.find((item) => item.kind === 'track' && item.trackRef.source === Track.Source.ScreenShare);
    if (screenItem) return screenItem;
    if (activeSpeakerIdentity) {
      const found = visibleStageItems.find((item) => item.kind === 'track' && item.trackRef.participant.identity === activeSpeakerIdentity);
      if (found) return found;
    }
    return visibleStageItems[0] || null;
  }, [visibleStageItems, sidebarStagePinnedIdentity, activeSpeakerIdentity]);

  const focusItem = useMemo(() => {
    if (computedLayout === 'imo') {
      return stageItems.find((item) => item.key === spotlightIdentity || (item.kind === 'track' && item.trackRef.participant.identity === spotlightIdentity))
        || stageItems.find((item) => item.kind === 'stage_card')
        || stageItems.find((item) => item.kind === 'track' && item.trackRef.source === Track.Source.ScreenShare)
        || stageItems[0];
    }
    if (pinnedIdentities.size > 0) {
      return stageItems.find((item) => pinnedIdentities.has(item.key) || (item.kind === 'track' && isTrackPinned(item.trackRef))) || stageItems[0];
    }
    const stageCard = stageItems.find((item) => item.kind === 'stage_card');
    if (stageCard) return stageCard;
    const screenItem = stageItems.find((item) => item.kind === 'track' && item.trackRef.source === Track.Source.ScreenShare);
    if (screenItem) return screenItem;
    if (spotlightIdentity) {
      const spotted = stageItems.find((item) => item.key === spotlightIdentity || (item.kind === 'track' && item.trackRef.participant.identity === spotlightIdentity));
      if (spotted) return spotted;
    }
    if (activeSpeakerIdentity) {
      return stageItems.find((item) => item.kind === 'track' && item.trackRef.participant.identity === activeSpeakerIdentity) || stageItems[0];
    }
    return stageItems[0];
  }, [stageItems, pinnedIdentities, isTrackPinned, computedLayout, spotlightIdentity, activeSpeakerIdentity]);

  const togglePin = (trackKey: string) => {
    setPinnedIdentities((prev) => {
      const next = new Set(prev);
      if (next.has(trackKey)) next.delete(trackKey);
      else if (next.size < 6) next.add(trackKey);
      return next;
    });
  };

  const stopScreenShare = useCallback(async () => {
    try {
      await localParticipant.setScreenShareEnabled(false);
    } catch {}
    for (const pub of Array.from(localParticipant.trackPublications.values())) {
      if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
        try {
          if (pub.track) {
            await localParticipant.unpublishTrack(pub.track, true);
            pub.track.stop();
          }
        } catch {}
      }
    }
    setIsScreenSharing(false);
    appendActivityLog('You stopped sharing screen');
    setToastMessage("Stopped screen sharing");
    setTimeout(() => setToastMessage(null), 2000);
  }, [appendActivityLog, localParticipant]);

  const startScreenShare = useCallback(async (preferredSurface?: 'monitor' | 'window' | 'browser') => {
    if (!allowScreenShare && !hasAdminAuthority) {
      setToastMessage("Screen sharing is disabled by the host");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setToastMessage("Screen sharing is not supported in this browser");
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    try {
      // Stop any active share before switching to a new monitor / app window / tab
      if (localParticipant.isScreenShareEnabled) {
        try {
          await localParticipant.setScreenShareEnabled(false);
        } catch {}
        for (const pub of Array.from(localParticipant.trackPublications.values())) {
          if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
            try {
              if (pub.track) {
                await localParticipant.unpublishTrack(pub.track, true);
                pub.track.stop();
              }
            } catch {}
          }
        }
      }

      const videoConstraint: any = preferredSurface
        ? {
            displaySurface: preferredSurface,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          }
        : {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          };

      let displayStream: MediaStream | null = null;
      const attempts: any[] = [
        {
          video: videoConstraint,
          audio: true,
          monitorTypeSurfaces: 'include',
          surfaceSwitching: 'include',
          selfBrowserSurface: 'exclude',
          systemAudio: 'include',
          preferCurrentTab: false,
        },
        {
          video: videoConstraint,
          audio: false,
          monitorTypeSurfaces: 'include',
          surfaceSwitching: 'include',
          selfBrowserSurface: 'exclude',
          preferCurrentTab: false,
        },
        {
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: false,
        },
      ];

      let lastErr: any = null;
      for (const opts of attempts) {
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia(opts);
          break;
        } catch (err: any) {
          lastErr = err;
          const name = err?.name || '';
          const msg = String(err?.message || '').toLowerCase();
          // Abort immediately if the user explicitly cancelled or browser blocked permissions policy
          if (
            name === 'NotAllowedError' ||
            name === 'AbortError' ||
            msg.includes('display-capture') ||
            msg.includes('permissions policy') ||
            msg.includes('permission denied by system')
          ) {
            throw err;
          }
        }
      }

      if (!displayStream) {
        throw lastErr || new Error('Could not capture screen');
      }

      const rawVideoTrack = displayStream.getVideoTracks()[0];
      if (!rawVideoTrack) {
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error('No screen video track was returned');
      }

      try {
        rawVideoTrack.contentHint = 'detail';
      } catch {}

      const localScreenVideo = new LocalVideoTrack(rawVideoTrack, undefined, false);
      localScreenVideo.source = Track.Source.ScreenShare;

      const rawAudioTrack = displayStream.getAudioTracks()[0];
      let localScreenAudio: LocalAudioTrack | null = null;
      if (rawAudioTrack) {
        localScreenAudio = new LocalAudioTrack(rawAudioTrack, undefined, false);
        localScreenAudio.source = Track.Source.ScreenShareAudio;
      }

      await localParticipant.publishTrack(localScreenVideo, {
        source: Track.Source.ScreenShare,
        simulcast: true,
      });

      if (localScreenAudio) {
        try {
          await localParticipant.publishTrack(localScreenAudio, {
            source: Track.Source.ScreenShareAudio,
          });
        } catch {}
      }

      rawVideoTrack.addEventListener('ended', () => {
        void (async () => {
          try {
            await localParticipant.unpublishTrack(localScreenVideo, true);
            localScreenVideo.stop();
          } catch {}
          if (localScreenAudio) {
            try {
              await localParticipant.unpublishTrack(localScreenAudio, true);
              localScreenAudio.stop();
            } catch {}
          }
          setIsScreenSharing(false);
          appendActivityLog('You stopped sharing screen');
        })();
      });

      setIsScreenSharing(true);
      appendActivityLog('You started sharing screen');
      setToastMessage("Screen sharing started");
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err: any) {
      const errName = err?.name || '';
      const errMsg = String(err?.message || err || '');
      if (errMsg.toLowerCase().includes('display-capture') || errMsg.toLowerCase().includes('permissions policy')) {
        setToastMessage("Screen share is blocked inside this preview frame — open the meeting in a standalone browser tab to share screens or apps.");
      } else if (errName === 'NotAllowedError' || errName === 'AbortError') {
        setToastMessage("Screen sharing was cancelled or permission was denied");
      } else {
        setToastMessage(errMsg || "Could not start screen sharing");
      }
      setTimeout(() => setToastMessage(null), 4500);
    }
  }, [allowScreenShare, appendActivityLog, hasAdminAuthority, localParticipant]);

  const toggleScreenShare = async () => {
    if (localParticipant.isScreenShareEnabled) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isRoomLockedBlocked && !hasAdminAuthority) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#141517] p-6">
        <div className="max-w-md w-full bg-white p-8 sm:p-10 rounded-2xl border border-neutral-200/80 text-center space-y-5">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto text-slate-700 border border-neutral-200/70">
            <Lock size={26} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-medium text-slate-900 tracking-tight">Meeting is Locked</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              The host has locked this room to new participants.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2.5">
            {!isHost && (
              <button
                type="button"
                onClick={() => setIsHostKeyModalOpen(true)}
                className="w-full py-3 px-4 bg-white hover:bg-stone-50 text-slate-800 border border-neutral-200 hover:border-slate-400 rounded-xl text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer"
              >
                Claim Host with Host Key
              </button>
            )}
            <button 
              type="button"
              onClick={() => void requestExitWithRecordingGuard(user ? '/dashboard' : '/')}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer"
            >
              Leave Meeting
            </button>
          </div>
        </div>
        <HostKeyModal
          isOpen={isHostKeyModalOpen}
          onClose={() => setIsHostKeyModalOpen(false)}
          currentHostName={roomHostName || meetingDetails?.hostName}
          onClaimHost={async (enteredKey: string) => {
            const roomSnap = await getDoc(doc(db, 'rooms', room));
            const validKey = roomSnap.data()?.hostKey || hostKey;
            if (enteredKey.trim() === String(validKey).trim()) {
              await updateDoc(doc(db, 'rooms', room), {
                hostId: user?.uid || localParticipant.identity,
                hostIdentity: localParticipant.identity,
                hostEmail: user?.email || '',
                hostName: getDisplayName(localParticipant.identity),
              });
              setIsHost(true);
              setIsAdmitted(true);
              setIsRoomLockedBlocked(false);
              return true;
            }
            return false;
          }}
        />
      </div>
    );
  }

  if (!isAdmitted && !hasAdminAuthority) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#141517] p-6">
        <div className="max-w-md w-full bg-white p-8 sm:p-10 rounded-2xl border border-neutral-200/80 text-center space-y-5">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto text-slate-700 border border-neutral-200/70">
            <Clock size={26} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-medium text-slate-900 tracking-tight">Waiting to be admitted</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              The meeting host will let you in soon. Please stay on this screen.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2.5">
            <button 
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer"
            >
              Retry Connection
            </button>
            <button
              type="button"
              onClick={() => setIsHostKeyModalOpen(true)}
              className="w-full py-2.5 px-4 bg-white hover:bg-stone-50 text-slate-700 border border-neutral-200 hover:border-slate-400 rounded-xl text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer"
            >
              Claim Host Role
            </button>
            <button 
              type="button"
              onClick={() => void requestExitWithRecordingGuard(user ? '/dashboard' : '/')}
              className="py-2 text-xs text-red-600 hover:text-red-700 font-medium whitespace-nowrap truncate cursor-pointer"
            >
              Leave meeting
            </button>
          </div>
        </div>
        <HostKeyModal
          isOpen={isHostKeyModalOpen}
          onClose={() => setIsHostKeyModalOpen(false)}
          currentHostName={roomHostName || meetingDetails?.hostName}
          onClaimHost={async (enteredKey: string) => {
            const roomSnap = await getDoc(doc(db, 'rooms', room));
            const validKey = roomSnap.data()?.hostKey || hostKey;
            if (enteredKey.trim() === String(validKey).trim()) {
              await updateDoc(doc(db, 'rooms', room), {
                hostId: user?.uid || localParticipant.identity,
                hostIdentity: localParticipant.identity,
                hostEmail: user?.email || '',
                hostName: getDisplayName(localParticipant.identity),
              });
              setIsHost(true);
              setIsAdmitted(true);
              return true;
            }
            return false;
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden h-full">
      {/* Broadcast & Breakout Room Status Banner */}
      <AnimatePresence>
        {(broadcastBanner || currentBreakoutRoomId) && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-[95] flex flex-wrap items-center justify-center gap-2 px-4 pointer-events-auto"
          >
            {currentBreakoutRoomId && (
              <div className="flex items-center gap-2.5 px-3.5 py-2 bg-white/95 backdrop-blur-md text-slate-900 rounded-xl border border-neutral-200/80 text-xs">
                <span className="font-medium whitespace-nowrap truncate">
                  {breakoutRooms.find(r => r.id === currentBreakoutRoomId)?.name || 'Breakout Room'}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentBreakoutRoomId(null)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer"
                >
                  Return to Main Room
                </button>
              </div>
            )}
            {broadcastBanner && (
              <div className="flex items-center gap-3 px-4 py-2 bg-white/95 backdrop-blur-md text-slate-900 rounded-xl border border-neutral-200/80 text-xs max-w-md">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 shrink-0">
                  Broadcast
                </span>
                <span className="text-slate-700 truncate">{broadcastBanner}</span>
                <button
                  type="button"
                  onClick={() => setBroadcastBanner(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Dismiss"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Host & Co-Host Admit Notification — shows all pending participants + quick disable toggle */}
      <AnimatePresence>
        {hasAdminAuthority && lobbyEnabled && pendingParticipants.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="absolute top-3 sm:top-16 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-md pointer-events-auto"
          >
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-neutral-200/80 shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                    Waiting to join ({pendingParticipants.length})
                  </p>
                  <p className="text-[11px] text-slate-500">Approval is currently required</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {pendingParticipants.length > 1 && (
                    <button 
                      type="button"
                      onClick={admitAllUsers}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Admit All
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      setLobbyEnabled(false);
                      try {
                        await setDoc(doc(db, 'rooms', room), { lobby: false }, { merge: true });
                      } catch {}
                      await admitAllUsers();
                      setToastMessage("Waiting room turned off — everyone can join freely");
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-slate-700 text-[11px] font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                    title="Turn off waiting room and let everyone join freely"
                  >
                    Turn off approval
                  </button>
                </div>
              </div>

              <div className="max-h-[210px] overflow-y-auto custom-scroll divide-y divide-neutral-100">
                {pendingParticipants.map((p) => {
                  let pAvatar = "";
                  try {
                    pAvatar = JSON.parse(p.metadata || "{}").avatar;
                  } catch {}
                  const displayName = p.identity.split('#')[0];
                  return (
                    <div key={p.sid} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {pAvatar ? (
                          <img src={pAvatar} alt={displayName} className="w-8 h-8 rounded-xl object-cover shrink-0 border border-neutral-200" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 bg-stone-100 border border-neutral-200 rounded-xl flex items-center justify-center text-slate-700 font-medium text-xs shrink-0">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                          {displayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          type="button"
                          onClick={() => declineUser({ sid: p.sid, identity: p.identity })}
                          className="px-2.5 py-1.5 bg-white hover:bg-stone-50 text-slate-600 border border-neutral-200 hover:border-slate-400 text-xs font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Decline
                        </button>
                        <button 
                          type="button"
                          onClick={() => admitUser(p)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Admit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Area */}
      <div className={cn(
        "flex-1 relative flex flex-col items-center justify-center p-1.5 sm:p-3 pt-1.5 sm:pt-2 bg-[#131416] overflow-hidden min-h-0 transition-all duration-300",
        isMobileLandscape 
          ? (isToolbarCollapsed ? "pr-2 sm:pr-3 pb-2 sm:pb-3" : "pr-[78px] sm:pr-[90px] pb-2 sm:pb-3") 
          : (isToolbarCollapsed ? "pb-1.5 sm:pb-3" : "pb-[84px] sm:pb-[96px]")
      )}>
        {/* Floating Silence Alert: Zero circles, zero pills, stage-centered */}
        <AnimatePresence>
          {showUnmutedNoAudioWarning && (
            <div 
              style={isSidebarOpenOnDesktop ? { width: `calc(100% - ${sidebarWidthStyle})`, left: 0 } : undefined}
              className={cn(
                "fixed top-14 sm:top-16 z-50 flex items-center justify-center pointer-events-none transition-all duration-300",
                isSidebarOpenOnDesktop ? "left-0" : "inset-x-0"
              )}
            >
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 bg-[#18191c]/95 text-slate-200 rounded-xl border border-neutral-700/60 shadow-xl backdrop-blur-md text-xs font-normal"
              >
                <span className="text-slate-200 select-none">
                  You're unmuted, but no microphone input is detected
                </span>
                <button
                  type="button"
                  onClick={handleOpenMicTest}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Test Mic
                </button>
                <button
                  type="button"
                  onClick={handleDismissSilenceWarning}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="Dismiss alert"
                >
                  <X size={14} />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Click Outside Backdrop for Dropdowns */}
        {(isMicMenuOpen || isCamMenuOpen || isScreenMenuOpen || isReactionsMenuOpen || isMoreMenuOpen) && (
          <div 
            className="fixed inset-0 z-[65]" 
            onClick={() => {
              setIsMicMenuOpen(false);
              setIsCamMenuOpen(false);
              setIsScreenMenuOpen(false);
              setIsReactionsMenuOpen(false);
              setIsMoreMenuOpen(false);
            }} 
          />
        )}
        <div 
          style={isSidebarOpenOnDesktop ? { width: `calc(100% - ${sidebarWidthStyle})`, maxWidth: `calc(100% - ${sidebarWidthStyle})`, marginRight: sidebarWidthStyle } : { width: '100%' }}
          className={cn(
            "relative h-full transition-all duration-300 min-h-0 flex flex-col justify-center items-center overflow-hidden",
            isWorkspaceMaximized ? "hidden" : ""
          )}
        >
          {(() => {
            const renderStageItemTile = (
              item: StageTileItem,
              opts?: { isFocal?: boolean; isCompact?: boolean; isMobilePortrait?: boolean; interactive?: boolean }
            ) => {
              const isFocal = opts?.isFocal ?? false;
              const isCompact = opts?.isCompact ?? false;
              const interactive = opts?.interactive ?? !isCompact;

              if (item.kind === 'stage_card') {
                return (
                  <StagePresentationCard
                    overlay={item.overlay}
                    roomId={room}
                    isCompact={isCompact}
                    isPinned={pinnedIdentities.has(item.key)}
                    canControl={interactive}
                    showName={showParticipantNames}
                    onTogglePin={interactive ? () => togglePin(item.key) : undefined}
                    onDismiss={
                      interactive
                        ? () => void updateStageOverlay({ ...item.overlay, active: false, updatedAt: Date.now() })
                        : undefined
                    }
                    onChangePage={
                      interactive
                        ? (nextPage) => {
                            if (!item.overlay.document) return;
                            void updateStageOverlay({
                              ...item.overlay,
                              document: {
                                ...item.overlay.document,
                                currentPage: nextPage,
                              },
                              updatedAt: Date.now(),
                            });
                          }
                        : undefined
                    }
                  />
                );
              }

              const t = item.trackRef;
              return (
                <CustomParticipantTile
                  trackRef={t}
                  raisedHands={raisedHands}
                  onTogglePin={interactive ? () => togglePin(item.key) : undefined}
                  isPinned={isTrackPinned(t)}
                  mirror={t.source !== Track.Source.ScreenShare && t.participant.isLocal && videoMirroring}
                  aiVideoFilter={t.source !== Track.Source.ScreenShare && t.participant.isLocal ? localAIVideoFilter : undefined}
                  showName={isCompact ? true : showParticipantNames}
                  isFocal={isFocal}
                  isCompact={isCompact}
                  isMobilePortrait={opts?.isMobilePortrait}
                  onContextMenu={interactive ? (e: any) => handleTileContextMenu(e, t) : undefined}
                  onCopyIsolatedFeed={interactive ? () => copyIsolatedFeedLink(t.participant) : undefined}
                  onSendFile={interactive ? (identity: string) => openSendFileFor(identity) : undefined}
                />
              );
            };

            const getItemDisplayLabel = (item: StageTileItem) => {
              if (item.kind === 'stage_card') {
                return item.overlay.document?.title || item.overlay.title || 'Stage Card';
              }
              const name = item.trackRef.participant.identity.split('#')[0];
              return item.trackRef.source === Track.Source.ScreenShare ? `${name} (Screen)` : name;
            };

            if (isSidebarOpenOnDesktop) {
              return (
                <div className="relative w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 min-h-0 min-w-0">
                  {visibleStageItems.length <= 1 ? (
                    visibleStageItems[0] ? (
                      <div className="w-full h-full flex items-center justify-center p-3 sm:p-5 min-h-0 min-w-0">
                        <div className="relative w-full max-w-[min(860px,calc((100vh-140px)*16/9))] aspect-video rounded-2xl overflow-hidden shadow-2xl bg-bg-dark border border-white/5">
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(visibleStageItems[0], { isFocal: true })}
                          </div>
                        </div>
                      </div>
                    ) : null
                  ) : (
                    <div className="w-full h-full flex items-center justify-center gap-3 sm:gap-4 p-3 sm:p-4 min-h-0 min-w-0 max-h-[calc(100vh-120px)]">
                      {sidebarStageFocusItem && (
                        <div className="flex-1 min-w-0 h-full flex items-center justify-center">
                          <div className="relative w-full max-w-[min(860px,calc((100vh-150px)*16/9))] aspect-video rounded-2xl overflow-hidden bg-bg-dark shadow-2xl border border-white/5">
                            <div className="absolute inset-0 w-full h-full">
                              {renderStageItemTile(sidebarStageFocusItem, { isFocal: true })}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="w-[144px] sm:w-[164px] h-full max-h-[calc(100vh-140px)] flex flex-col md:justify-center gap-3 overflow-y-auto custom-scroll shrink-0 py-1 pr-1">
                        {visibleStageItems
                          .filter((item) => item.key !== sidebarStageFocusItem?.key)
                          .map((item) => (
                            <div
                              key={item.key}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSidebarStagePinnedIdentity(item.key)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setSidebarStagePinnedIdentity(item.key); }}
                              className="relative w-full aspect-[16/10] rounded-xl overflow-hidden bg-bg-dark border border-white/10 hover:border-white/30 transition-all shrink-0 cursor-pointer shadow-md select-none"
                              title={`Click to focus on ${getItemDisplayLabel(item)}`}
                            >
                              <div className="absolute inset-0 w-full h-full">
                                {renderStageItemTile(item, { isCompact: true, interactive: false })}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <>
                {/* Floating Layout Switcher */}
                {visibleStageItems.length > 1 && !isMobile && (
                  <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-40 flex items-center gap-1 bg-[#1a1b1e]/90 backdrop-blur-md p-1 rounded-xl border border-white/10 select-none shadow-md">
                    <button
                      type="button"
                      onClick={() => { setLayoutMode('tiled'); setSpotlightIdentity(null); }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap",
                        computedLayout === 'tiled' ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                      )}
                      title="Grid View (Everyone Equal)"
                    >
                      Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayoutMode('imo');
                        if (!spotlightIdentity && activeSpeakerTrack) {
                          setSpotlightIdentity(getTrackKey(activeSpeakerTrack));
                        }
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap",
                        computedLayout === 'imo' ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                      )}
                      title="Speaker + Filmstrip Row"
                    >
                      Speaker (Row)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayoutMode('sidebar');
                        if (!spotlightIdentity && activeSpeakerTrack) {
                          setSpotlightIdentity(getTrackKey(activeSpeakerTrack));
                        }
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap",
                        computedLayout === 'sidebar' ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                      )}
                      title="Speaker + Side Column"
                    >
                      Speaker (Column)
                    </button>
                  </div>
                )}

                {computedLayout === 'imo' && focusItem ? (
                  <div className="flex flex-col h-full w-full gap-3 items-center justify-center p-2 sm:p-4 min-h-0">
                    <div className="h-[84px] md:h-[96px] w-full max-w-4xl flex items-center justify-center gap-2.5 overflow-x-auto py-1 px-2 custom-scroll scroll-smooth shrink-0">
                      {stageItems
                        .filter((item) => item.key !== focusItem.key)
                        .map((item) => (
                          <div
                            key={item.key}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSpotlightIdentity(item.key)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setSpotlightIdentity(item.key); }}
                            className="relative w-[140px] sm:w-[154px] h-[78px] sm:h-[86px] rounded-xl overflow-hidden bg-bg-dark border border-white/10 hover:border-white/30 transition-all shrink-0 cursor-pointer shadow-md select-none"
                            title={`Focus on ${getItemDisplayLabel(item)}`}
                          >
                            <div className="absolute inset-0 w-full h-full">
                              {renderStageItemTile(item, { isCompact: true, interactive: false })}
                            </div>
                          </div>
                        ))}
                    </div>

                    <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                      <div className="relative w-full max-w-[min(820px,calc((100vh-230px)*16/9))] aspect-video rounded-2xl overflow-hidden shadow-2xl bg-bg-dark">
                        <div className="absolute inset-0 w-full h-full">
                          {renderStageItemTile(focusItem, { isFocal: true })}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : computedLayout === 'sidebar' && focusItem ? (
                  <div className={cn(
                    "flex flex-col md:flex-row h-full w-full max-w-6xl items-center justify-center min-h-0",
                    isPortraitMobile
                      ? "gap-2 px-1 pt-0.5 pb-1"
                      : "gap-3 sm:gap-5 px-2.5 sm:px-5 pt-2 md:pt-14 pb-2 md:pb-3"
                  )}>
                    <div className="flex-1 md:flex-[3] w-full h-full min-w-0 min-h-0 flex items-center justify-center">
                      {(() => {
                        const isFocusPortraitCamera =
                          isPortraitMobile &&
                          (focusItem.kind !== 'track' || focusItem.trackRef.source !== Track.Source.ScreenShare) &&
                          focusItem.kind !== 'stage_card';
                        return (
                          <div
                            className={cn(
                              "relative bg-bg-dark overflow-hidden shadow-2xl border border-white/5",
                              isFocusPortraitCamera
                                ? "w-full h-full rounded-2xl"
                                : "w-full max-w-[min(860px,calc((100vh-205px)*16/9))] aspect-video rounded-2xl"
                            )}
                          >
                            <div className="absolute inset-0 w-full h-full">
                              {renderStageItemTile(focusItem, {
                                isFocal: true,
                                isMobilePortrait: isFocusPortraitCamera,
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {isPortraitMobile ? (
                      <div className="w-full h-[116px] overflow-x-auto custom-scroll py-0.5 shrink-0 flex items-center">
                        <div className="flex items-center justify-center gap-2 min-w-full w-max px-0.5">
                          {stageItems
                            .filter((item) => item.key !== focusItem.key)
                            .map((item) => (
                              <div
                                key={item.key}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSpotlightIdentity(item.key)}
                                onKeyDown={(e) => { if (e.key === 'Enter') setSpotlightIdentity(item.key); }}
                                className="relative w-[108px] h-[108px] aspect-square rounded-2xl overflow-hidden bg-bg-dark border border-white/10 hover:border-white/30 transition-all shrink-0 cursor-pointer shadow-md select-none"
                                title={`Focus on ${getItemDisplayLabel(item)}`}
                              >
                                <div className="absolute inset-0 w-full h-full">
                                  {renderStageItemTile(item, {
                                    isCompact: true,
                                    interactive: false,
                                    isMobilePortrait: true,
                                  })}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex md:flex-col md:justify-center gap-2.5 md:gap-3 custom-scroll p-1 shrink-0 w-full md:w-[164px] lg:w-[180px] h-[96px] md:h-full max-h-[calc(100vh-185px)] overflow-x-auto md:overflow-y-auto">
                        {stageItems
                          .filter((item) => item.key !== focusItem.key)
                          .map((item) => (
                            <div
                              key={item.key}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSpotlightIdentity(item.key)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setSpotlightIdentity(item.key); }}
                              className="relative rounded-xl overflow-hidden bg-bg-dark border border-white/10 hover:border-white/30 transition-all shrink-0 cursor-pointer shadow-md select-none w-[144px] sm:w-[156px] md:w-full h-full md:h-auto aspect-[16/10]"
                              title={`Focus on ${getItemDisplayLabel(item)}`}
                            >
                              <div className="absolute inset-0 w-full h-full">
                                {renderStageItemTile(item, {
                                  isCompact: true,
                                  interactive: false,
                                  isMobilePortrait: false,
                                })}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : isMobile && visibleStageItems.length === 2 && layoutMode !== 'tiled' && mobilePrimaryItem && mobileSecondaryItem ? (
                  <div ref={mobilePipStageRef} className="relative w-full h-full">
                    <div className="absolute inset-0 rounded-[28px] overflow-hidden bg-bg-dark">
                      {renderStageItemTile(mobilePrimaryItem, { isFocal: true, isMobilePortrait: isPortraitMobile })}
                    </div>

                    <DraggableEdgeSnapCard
                      boundsMode="container"
                      containerRef={mobilePipStageRef}
                      padding={12}
                      initialCorner={mobileOverlaySide === 'left' ? 'bottom-left' : 'bottom-right'}
                      onSnapSideChange={setMobileOverlaySide}
                      className="z-20 w-[132px] h-[176px] rounded-3xl overflow-hidden border border-white/15 shadow-2xl bg-bg-dark"
                    >
                      <div className="relative w-full h-full">
                        {renderStageItemTile(mobileSecondaryItem, { isCompact: true, isMobilePortrait: isPortraitMobile })}
                        <button
                          type="button"
                          data-no-drag="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMobilePrimaryIdentity(mobileSecondaryItem.key);
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/65 hover:bg-black/90 text-white border border-white/15 transition-colors shadow-md cursor-pointer"
                          title="Swap main view"
                        >
                          <ArrowLeftRight size={12} />
                        </button>
                      </div>
                    </DraggableEdgeSnapCard>
                  </div>
                ) : visibleStageItems.length === 1 ? (
                  <div className={cn(
                    "w-full h-full flex items-center justify-center min-h-0 min-w-0",
                    isPortraitMobile ? "p-1" : "p-2 sm:p-4"
                  )}>
                    <div
                      className={cn(
                        "relative w-full transition-all duration-300 ease-out",
                        isPortraitMobile
                          ? "h-full rounded-2xl overflow-hidden shadow-2xl"
                          : "max-w-[min(860px,calc((100vh-200px)*16/9))] aspect-video rounded-2xl overflow-hidden shadow-2xl"
                      )}
                    >
                      <div className="absolute inset-0 w-full h-full">
                        {renderStageItemTile(visibleStageItems[0], {
                          isFocal: true,
                          isMobilePortrait: isPortraitMobile,
                        })}
                      </div>
                    </div>
                  </div>
                ) : visibleStageItems.length === 2 ? (
                  <div className={cn(
                    "w-full h-full flex items-center justify-center min-h-0 min-w-0",
                    isPortraitMobile ? "p-1" : "p-2.5 sm:p-6"
                  )}>
                    <div
                      className={cn(
                        "w-full max-w-6xl items-center justify-items-center",
                        isPortraitMobile
                          ? "h-[82%] max-h-[580px] grid grid-cols-2 grid-rows-1 gap-2"
                          : "grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6"
                      )}
                    >
                      {visibleStageItems.map((item) => (
                        <div
                          key={item.key}
                          className={cn(
                            "relative w-full overflow-hidden bg-bg-dark shadow-xl min-w-0 border border-white/5",
                            isPortraitMobile
                              ? "h-full rounded-2xl"
                              : "max-w-[calc((100vh-190px)*16/9)] aspect-video rounded-2xl"
                          )}
                        >
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(item, { isFocal: true, isMobilePortrait: isPortraitMobile })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : visibleStageItems.length === 3 ? (
                  isPortraitMobile ? (
                    <div className="w-full h-full p-1 min-h-0 min-w-0">
                      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-2">
                        {visibleStageItems.slice(0, 2).map((item) => (
                          <div
                            key={item.key}
                            className="relative w-full h-full overflow-hidden bg-bg-dark shadow-xl border border-white/5 min-w-0 min-h-0 rounded-2xl"
                          >
                            <div className="absolute inset-0 w-full h-full">
                              {renderStageItemTile(item, { isMobilePortrait: true })}
                            </div>
                          </div>
                        ))}
                        <div className="col-span-2 w-[calc(50%-4px)] mx-auto h-full relative overflow-hidden bg-bg-dark shadow-xl border border-white/5 min-w-0 min-h-0 rounded-2xl">
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(visibleStageItems[2], { isMobilePortrait: true })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2.5 sm:p-5 min-h-0 min-w-0 gap-2.5 sm:gap-4">
                      <div className="w-full max-w-5xl grid grid-cols-2 gap-2.5 sm:gap-4 items-center justify-items-center">
                        {visibleStageItems.slice(0, 2).map((item) => (
                          <div
                            key={item.key}
                            className="relative w-full overflow-hidden bg-bg-dark shadow-xl border border-white/5 min-w-0 max-w-[calc(((100vh-200px)/2)*16/9)] aspect-video rounded-2xl"
                          >
                            <div className="absolute inset-0 w-full h-full">
                              {renderStageItemTile(item, { isMobilePortrait: false })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="w-full max-w-5xl flex items-center justify-center">
                        <div className="relative w-full overflow-hidden bg-bg-dark shadow-xl border border-white/5 min-w-0 max-w-[min(50%,calc(((100vh-200px)/2)*16/9))] aspect-video rounded-2xl">
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(visibleStageItems[2], { isMobilePortrait: false })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ) : visibleStageItems.length === 4 ? (
                  <div className={cn(
                    "w-full h-full flex items-center justify-center min-h-0 min-w-0",
                    isPortraitMobile ? "p-1" : "p-2.5 sm:p-5"
                  )}>
                    <div
                      className={cn(
                        "w-full grid",
                        isPortraitMobile
                          ? "h-full grid-cols-2 grid-rows-2 gap-2"
                          : "max-w-5xl grid-cols-2 gap-4 items-center justify-items-center"
                      )}
                    >
                      {visibleStageItems.map((item) => (
                        <div
                          key={item.key}
                          className={cn(
                            "relative w-full overflow-hidden bg-bg-dark shadow-xl border border-white/5 min-w-0",
                            isPortraitMobile
                              ? "h-full min-h-0 rounded-2xl"
                              : "max-w-[calc(((100vh-200px)/2)*16/9)] aspect-video rounded-2xl"
                          )}
                        >
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(item, { isMobilePortrait: isPortraitMobile })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : visibleStageItems.length <= 6 ? (
                  <div className={cn(
                    "w-full h-full flex items-center justify-center min-h-0 min-w-0",
                    isPortraitMobile ? "p-1" : "p-2 sm:p-4"
                  )}>
                    <div
                      className={cn(
                        "w-full grid transition-all duration-300 ease-out",
                        isPortraitMobile
                          ? "h-full grid-cols-2 grid-rows-3 gap-2"
                          : "max-w-5xl grid-cols-2 md:grid-cols-3 gap-3 max-h-[calc(100vh-160px)] items-center justify-items-center"
                      )}
                    >
                      {visibleStageItems.map((item) => (
                        <div
                          key={item.key}
                          className={cn(
                            "relative w-full overflow-hidden bg-bg-dark shadow-md min-w-0",
                            isPortraitMobile
                              ? "h-full min-h-0 rounded-2xl border border-white/5"
                              : "aspect-video max-h-[calc((100vh-190px)/2)] rounded-xl"
                          )}
                        >
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(item, { isMobilePortrait: isPortraitMobile })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : visibleStageItems.length <= 9 ? (
                  <div className="w-full h-full flex items-center justify-center p-2 sm:p-3 min-h-0 min-w-0">
                    <div className="w-full max-w-5xl grid grid-cols-3 gap-2.5 max-h-[calc(100vh-160px)] items-center justify-center transition-all duration-300 ease-out">
                      {visibleStageItems.map((item) => (
                        <div
                          key={item.key}
                          className="relative w-full aspect-video max-h-[calc((100vh-190px)/3)] rounded-xl overflow-hidden bg-bg-dark shadow-md min-w-0"
                        >
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(item)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2 sm:p-3 min-h-0 min-w-0 overflow-y-auto custom-scroll">
                    <div className="w-full max-w-6xl grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[calc(100vh-160px)] items-center justify-center transition-all duration-300 ease-out">
                      {visibleStageItems.map((item) => (
                        <div
                          key={item.key}
                          className="relative w-full aspect-video max-h-[calc((100vh-190px)/4)] rounded-lg overflow-hidden bg-bg-dark shadow-sm min-w-0"
                        >
                          <div className="absolute inset-0 w-full h-full">
                            {renderStageItemTile(item)}
                          </div>
                        </div>
                      ))}
                      {extraStageItemCount > 0 && (
                        <div className="w-full aspect-video max-h-[calc((100vh-190px)/4)] rounded-lg overflow-hidden bg-black/70 border border-white/10 flex flex-col items-center justify-center text-center p-2 text-white min-w-0">
                          <span className="text-xl sm:text-2xl font-bold">+{extraStageItemCount}</span>
                          <span className="text-[10px] uppercase tracking-widest text-slate-400">more</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Live Captions Display */}
        <div 
          style={isSidebarOpenOnDesktop ? { width: `calc(100% - ${sidebarWidthStyle})`, left: 0 } : undefined}
          className={cn(
            "fixed z-50 pointer-events-none transition-all duration-300",
            isSidebarOpenOnDesktop
              ? "left-0 flex justify-center px-4"
              : "left-1/2 -translate-x-1/2 w-full max-w-2xl px-4",
            isToolbarCollapsed ? "bottom-16" : "bottom-[95px]"
          )}
        >
          <AnimatePresence>
            {isCaptionsEnabled && (
              <motion.div 
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="flex justify-center text-center max-w-2xl mx-auto"
              >
                {activeCaption ? (
                  <div className="bg-black/90 backdrop-blur-xl px-5 py-2.5 rounded-xl border border-white/15 text-white text-sm sm:text-base font-medium shadow-2xl inline-flex items-baseline gap-2 max-w-full leading-snug">
                    <span className={cn(
                      "font-semibold text-xs uppercase tracking-wider shrink-0",
                      activeCaption.isLocal ? "text-emerald-400" : "text-amber-300"
                    )}>
                      {activeCaption.identity}:
                    </span>
                    <span className="line-clamp-2 text-left">{activeCaption.text}</span>
                  </div>
                ) : (
                  <div className="bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-xl border border-white/10 text-xs text-stone-300 shadow-md">
                    Subtitles active · Speak to display live captions
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar Tabs (Participants, Chat, Info, Waiting, Workspace) */}
        <AnimatePresence mode="wait">
          {activeTab && activeTab !== 'settings' && (
            <motion.div
              key="sidebar"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={cn(
                isMobile && !isMobileLandscape 
                  ? "fixed inset-0 z-[100] bg-white overflow-hidden flex flex-col" 
                  : isWorkspaceMaximized && activeTab === 'whiteboard'
                    ? "fixed inset-0 z-[110] bg-[#121316] p-2 sm:p-3 overflow-hidden flex flex-col transition-all duration-300"
                    : "fixed top-0 right-0 bottom-0 z-[80] bg-[#121316] p-2 sm:p-2.5 overflow-hidden flex flex-col transition-all duration-300",
                !(isWorkspaceMaximized && activeTab === 'whiteboard') && (
                  activeTab === 'whiteboard' 
                    ? (isMobile && !isMobileLandscape ? "w-full" : "w-full md:w-[56vw]") 
                    : activeTab === 'stage'
                      ? (isMobile && !isMobileLandscape ? "w-full" : "w-full md:w-[480px]")
                      : (isMobile && !isMobileLandscape ? "w-full" : "w-full md:w-[410px]")
                )
              )}
            >
              {/* Inner container with sleek rounded edges and tips */}
              <div className="h-full w-full rounded-2xl border border-neutral-200/80 shadow-2xl overflow-hidden flex flex-col bg-white">
              {/* Sidebar Header */}
              {activeTab !== 'whiteboard' && (
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/60 bg-[#FBFBFA] sticky top-0 z-10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {previousSidebarTab && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab(previousSidebarTab as any);
                          setPreviousSidebarTab(null);
                        }}
                        className="p-1.5 -ml-1.5 hover:bg-stone-200/70 rounded-xl text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                        title="Back"
                      >
                        <ChevronLeft size={19} />
                      </button>
                    )}
                    <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2.5 truncate">
                      {!previousSidebarTab && (
                        <>
                          {activeTab === 'info' && <Info size={18} className="text-slate-700 shrink-0" />}
                          {(activeTab === 'participants' || activeTab === 'users') && <Users size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'chat' && <MessageSquare size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'waiting' && <ShieldCheck size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'notes' && <FileText size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'host_controls' && <ShieldCheck size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'tools' && <LayoutGrid size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'qa' && <HelpCircle size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'polls' && <BarChart2 size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'canvas' && <LayoutDashboard size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'breakout' && <Radio size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'clips' && <Camera size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'stage' && <Layers size={18} className="text-slate-700 shrink-0" />}
                          {activeTab === 'files' && <Paperclip size={18} className="text-slate-700 shrink-0" />}
                        </>
                      )}
                      <span className="truncate">
                        {activeTab === 'host_controls'
                          ? "Host Controls"
                          : activeTab === 'tools'
                            ? "Tools & Workspace"
                            : activeTab === 'stage'
                              ? "Stage Media & Docs"
                              : activeTab === 'info'
                                ? "Meeting Details"
                                : activeTab === 'chat'
                                  ? "In-Call Chat"
                                  : activeTab === 'participants' || activeTab === 'users'
                                    ? "Participants"
                                    : activeTab === 'waiting'
                                      ? "Waiting Room"
                                      : activeTab === 'files'
                                        ? "Shared Files"
                                        : activeTab === 'notes'
                                          ? "Notes & Transcripts"
                                          : activeTab === 'qa'
                                            ? "Live Q&A"
                                            : activeTab === 'polls'
                                              ? "Polls & Quizzes"
                                              : activeTab === 'canvas'
                                                ? "Canvas Board"
                                                : activeTab === 'breakout'
                                                  ? "Breakout Rooms"
                                                  : activeTab === 'clips'
                                                    ? "Clips Recording"
                                                    : activeTab}
                      </span>
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(null);
                      setPreviousSidebarTab(null);
                    }}
                    className="p-1.5 hover:bg-stone-200/60 rounded-xl text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
                    title="Close"
                  >
                    <X size={19} />
                  </button>
                </div>
              )}
              <div className={cn(
                "flex-1 min-h-0 bg-white flex flex-col",
                activeTab === 'whiteboard'
                  ? "p-0 overflow-hidden"
                  : activeTab === 'stage'
                    ? "overflow-y-auto p-5 sm:p-6 custom-scroll bg-[#FBFBFA]"
                    : "overflow-y-auto p-5 sm:p-6 custom-scroll bg-[#FBFBFA]"
              )}>
                {activeTab === 'host_controls' && (
                  <HostControlsPanel
                    isHost={isHost}
                    isCoHost={isCoHost}
                    room={room}
                    meetingTitle={meetingDetails?.title || `Meeting ${room}`}
                    hostKey={hostKey}
                    isLocked={isLocked}
                    allowUnmuteSelf={allowUnmuteSelf}
                    allowScreenShare={allowScreenShare}
                    allowChat={allowChat}
                    allowCoHostRecord={allowCoHostRecord}
                    webinarMode={webinarMode}
                    isStreaming={isStreaming}
                    streamPlatform={streamPlatform}
                    recordingStatus={recordingStatus}
                    recordingSeconds={recordingSeconds}
                    latestRecording={latestRecording}
                    coHosts={coHosts}
                    panelists={panelists}
                    lobbyEnabled={lobbyEnabled}
                    pendingParticipants={pendingParticipants.map(p => ({ sid: p.sid, identity: p.identity }))}
                    participants={[
                      { identity: localParticipant.identity, name: getDisplayName(localParticipant.identity) + " (You)", isMuted: !localParticipant.isMicrophoneEnabled, isVideoOff: !localParticipant.isCameraEnabled },
                      ...remoteParticipants.map(p => ({
                        identity: p.identity,
                        name: getDisplayName(p.identity),
                        isMuted: !p.isMicrophoneEnabled,
                        isVideoOff: !p.isCameraEnabled
                      }))
                    ]}
                    localIdentity={localParticipant.identity}
                    displayNames={displayNames}
                    onToggleLock={async (locked) => {
                      setIsLocked(locked);
                      await updateDoc(doc(db, 'rooms', room), { isLocked: locked });
                      setToastMessage(locked ? "Meeting locked to new joins" : "Meeting unlocked");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onToggleAllowUnmuteSelf={async (allow) => {
                      setAllowUnmuteSelf(allow);
                      await updateDoc(doc(db, 'rooms', room), { allowUnmuteSelf: allow });
                      setToastMessage(allow ? "Participants can unmute themselves" : "Participants prevented from unmuting");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onToggleAllowScreenShare={async (allow) => {
                      setAllowScreenShare(allow);
                      await updateDoc(doc(db, 'rooms', room), { allowScreenShare: allow });
                      setToastMessage(allow ? "Participant screen sharing allowed" : "Participant screen sharing disabled");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onToggleAllowChat={async (allow) => {
                      setAllowChat(allow);
                      await updateDoc(doc(db, 'rooms', room), { allowChat: allow });
                      setToastMessage(allow ? "In-call chat enabled" : "In-call chat disabled for participants");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onToggleAllowCoHostRecord={async (allow) => {
                      if (!isHost) return;
                      setAllowCoHostRecord(allow);
                      await updateDoc(doc(db, 'rooms', room), { allowCoHostRecord: allow });
                      setToastMessage(allow ? "Co-hosts can control recording" : "Recording restricted to host only");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onToggleWebinarMode={async (webinar) => {
                      setWebinarMode(webinar);
                      await updateDoc(doc(db, 'rooms', room), { webinarMode: webinar });
                      setToastMessage(webinar ? "Webinar mode enabled" : "Standard meeting mode");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onToggleLobby={async (enabled) => {
                      setLobbyEnabled(enabled);
                      await setDoc(doc(db, 'rooms', room), { lobby: enabled }, { merge: true });
                      if (!enabled) {
                        await admitAllUsers();
                      }
                      setToastMessage(enabled ? "Waiting room enabled" : "Waiting room disabled — everyone can join freely");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onAdmitUser={(p) => {
                      const found = remoteParticipants.find(r => r.sid === p.sid || r.identity === p.identity);
                      if (found) admitUser(found);
                    }}
                    onDeclineUser={(p) => declineUser(p)}
                    onAdmitAllUsers={admitAllUsers}
                    onMuteAll={() => {
                      safeSendData(sendHostControl, { action: 'mute-all' }, true);
                      setToastMessage("Muted all participants");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onMuteParticipant={(targetId) => {
                      safeSendData(sendHostControl, { action: 'mute-participant', targetIdentity: targetId }, true);
                      setToastMessage("Muted participant");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onAskToUnmute={(targetId) => {
                      safeSendData(sendHostControl, { action: 'ask-unmute', targetIdentity: targetId }, true);
                      setToastMessage(`Asked ${getDisplayName(targetId)} to unmute`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onStopParticipantVideo={(targetId) => {
                      safeSendData(sendHostControl, { action: 'stop-video', targetIdentity: targetId }, true);
                      setToastMessage("Stopped participant video");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onRenameParticipant={async (targetId, newName) => {
                      if (!hasAdminAuthority || !newName.trim()) return;
                      const trimmed = newName.trim();
                      setDisplayNames(prev => ({ ...prev, [targetId]: trimmed }));
                      await updateDoc(doc(db, 'rooms', room), { [`displayNames.${targetId}`]: trimmed });
                      setToastMessage(`Renamed participant to ${trimmed}`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onRemoveParticipant={(targetId) => {
                      safeSendData(sendHostControl, { action: 'remove-participant', targetIdentity: targetId }, true);
                      setToastMessage("Removed participant");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onMakeCoHost={async (targetId) => {
                      if (!isHost) return;
                      await updateDoc(doc(db, 'rooms', room), { coHosts: arrayUnion(targetId) });
                      setToastMessage(`Made ${getDisplayName(targetId)} a co-host`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onRemoveCoHost={async (targetId) => {
                      if (!isHost) return;
                      const next = coHosts.filter(c => c !== targetId);
                      await updateDoc(doc(db, 'rooms', room), { coHosts: next });
                      setToastMessage(`Removed ${getDisplayName(targetId)} as co-host`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onPassHostRole={async (targetId, targetName) => {
                      if (!isHost) return;
                      await updateDoc(doc(db, 'rooms', room), { hostIdentity: targetId, hostName: targetName });
                      setIsHost(false);
                      setToastMessage(`Transferred host role to ${targetName}`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onTogglePanelist={async (targetId) => {
                      const isPan = panelists.includes(targetId);
                      const next = isPan ? panelists.filter(p => p !== targetId) : [...panelists, targetId];
                      setPanelists(next);
                      await updateDoc(doc(db, 'rooms', room), { panelists: next });
                    }}
                    onStartLiveStream={async (platform, rtmpUrl, streamKeyVal, streamLayoutVal) => {
                      if (!isHost) return;
                      const res = await fetch('/api/livekit/egress-start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          room,
                          rtmpUrl,
                          streamKey: streamKeyVal,
                          layout: streamLayoutVal || 'grid'
                        })
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        throw new Error(data?.error || 'Failed to start RTMP live stream. Check your RTMP URL and stream key.');
                      }
                      const egressId = data?.egressId || null;
                      setActiveEgressId(egressId);
                      setIsStreaming(true);
                      setStreamPlatform(platform);
                      updateDoc(doc(db, 'rooms', room), {
                        isStreaming: true,
                        streamPlatform: platform,
                        egressId
                      }).catch(() => {});
                      setToastMessage(`Live stream started on ${platform}`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onStopLiveStream={async () => {
                      if (!isHost) return;
                      const res = await fetch('/api/livekit/egress-stop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          egressId: activeEgressId,
                          room
                        })
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        throw new Error(data?.error || 'Failed to stop live stream');
                      }
                      setActiveEgressId(null);
                      setIsStreaming(false);
                      updateDoc(doc(db, 'rooms', room), {
                        isStreaming: false,
                        egressId: null
                      }).catch(() => {});
                      setToastMessage("Live stream stopped");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onStartRecording={async (mode) => {
                      if (!isHost && !(isCoHost && allowCoHostRecord)) return;
                      try {
                        const recorder = new MeetingCompositeRecorder();
                        await recorder.start(getLiveAudioTracks, room, {
                          mode,
                          meetingTitle: meetingDetails?.title || `Meeting ${room}`,
                          getParticipants: () => recorderParticipantsRef.current,
                          getStageOverlay: () => stageOverlayRef.current,
                        });
                        meetingRecorderRef.current = recorder;
                        setRecordingSeconds(0);
                        setRecordingStatus('recording');
                        onRecordingChange?.(true);
                        updateDoc(doc(db, 'rooms', room), { recordingStatus: 'recording' }).catch(() => {});
                        appendActivityLog(mode === 'audio' ? 'Audio recording started' : 'Recording started');
                        setToastMessage(mode === 'audio' ? "Audio recording started" : "Recording started");
                        setTimeout(() => setToastMessage(null), 2500);
                      } catch (err: any) {
                        setToastMessage(err?.message || "Could not start recording in this browser");
                        setTimeout(() => setToastMessage(null), 3500);
                      }
                    }}
                    onPauseRecording={async () => {
                      if (!isHost && !(isCoHost && allowCoHostRecord)) return;
                      meetingRecorderRef.current?.pause();
                      setRecordingStatus('paused');
                      onRecordingChange?.(false);
                      updateDoc(doc(db, 'rooms', room), { recordingStatus: 'paused' }).catch(() => {});
                      setToastMessage("Recording paused");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onResumeRecording={async () => {
                      if (!isHost && !(isCoHost && allowCoHostRecord)) return;
                      meetingRecorderRef.current?.resume();
                      setRecordingStatus('recording');
                      onRecordingChange?.(true);
                      updateDoc(doc(db, 'rooms', room), { recordingStatus: 'recording' }).catch(() => {});
                      setToastMessage("Recording resumed");
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    onStopRecording={async () => {
                      if (!isHost && !(isCoHost && allowCoHostRecord)) return;
                      await stopAndSaveRecordingNow();
                      setToastMessage("Recording saved & downloaded");
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    onEndMeetingForAll={() => {
                      if (!isHost) return;
                      setHostConfirmModal({ type: 'end-meeting' });
                    }}
                    onOpenBreakoutRoomsTab={() => navigateSidebar('breakout', 'host_controls')}
                    autoDownloadRecording={autoDownloadRecording}
                    onToggleAutoDownloadRecording={toggleAutoDownloadRecording}
                    onOpenStageMediaTab={() => navigateSidebar('stage', 'host_controls')}
                  />
                )}

                {activeTab === 'tools' && (
                  <div className="space-y-4">
                    <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-2xl bg-white overflow-hidden">
                      {[
                        {
                          id: 'notes' as const,
                          label: 'Notes, Transcripts & AI Summary',
                          subtitle: 'Live background transcript, personal notes & recap',
                          icon: <FileText size={18} />,
                        },
                        {
                          id: 'stage' as const,
                          label: 'Docs, Media & Templates',
                          subtitle: 'Present slides, PDFs, images & lower thirds',
                          icon: <Layers size={18} />,
                        },
                        {
                          id: 'whiteboard' as const,
                          label: 'Joint Workspace',
                          subtitle: 'Draw and collaborate live on a shared board',
                          icon: <Monitor size={18} />,
                        },
                        {
                          id: 'files' as const,
                          label: 'Share Files',
                          subtitle: 'Send documents or media to everyone in the room',
                          icon: <Paperclip size={18} />,
                          count: sharedFiles.length > 0 ? sharedFiles.length : undefined,
                        },
                        {
                          id: 'qa' as const,
                          label: 'Live Q&A',
                          subtitle: 'Collect and answer audience questions',
                          icon: <HelpCircle size={18} />,
                        },
                        {
                          id: 'polls' as const,
                          label: 'Polls & Quizzes',
                          subtitle: 'Run quick live votes with participants',
                          icon: <BarChart2 size={18} />,
                        },
                        {
                          id: 'canvas' as const,
                          label: 'Canvas Board',
                          subtitle: 'Visual brainstorming board for the session',
                          icon: <LayoutDashboard size={18} />,
                        },
                        {
                          id: 'breakout' as const,
                          label: 'Breakout Rooms',
                          subtitle: 'Split attendees into smaller discussion groups',
                          icon: <Radio size={18} />,
                        },
                        {
                          id: 'clips' as const,
                          label: 'Clips',
                          subtitle: 'Record short shareable video highlights',
                          icon: <Camera size={18} />,
                        },
                      ].map((tool) => (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => navigateSidebar(tool.id, 'tools')}
                          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50/90 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-start gap-3.5 min-w-0">
                            <span className="mt-0.5 text-slate-500 group-hover:text-emerald-700 transition-colors shrink-0">
                              {tool.icon}
                            </span>
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-slate-900 block leading-snug">
                                {tool.label}
                              </span>
                              <span className="text-xs text-slate-500 block leading-snug mt-0.5">
                                {tool.subtitle}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {tool.count !== undefined && (
                              <span className="text-xs font-mono text-slate-500 tabular-nums">
                                {tool.count}
                              </span>
                            )}
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'stage' && (
                  <StageStudioPanel
                    overlay={stageOverlay}
                    roomId={room}
                    presenterName={getDisplayName(localParticipant.identity)}
                    presenterIdentity={localParticipant.identity}
                    onChangeOverlay={updateStageOverlay}
                  />
                )}

                {activeTab === 'qa' && (
                  <div className="flex-1 min-h-0 flex flex-col p-2">
                    <MeetingQA
                      roomId={room}
                      userId={user?.uid || localParticipant.identity}
                      userName={getDisplayName(localParticipant.identity)}
                      isHost={isHost}
                      isCoHost={isCoHost}
                      selectedAnswerers={selectedAnswerers}
                      onUpdateAnswerers={async (answerers) => {
                        if (!hasAdminAuthority) return;
                        setSelectedAnswerers(answerers);
                        await updateDoc(doc(db, 'rooms', room), { selectedAnswerers: answerers });
                      }}
                      participants={[
                        { identity: localParticipant.identity, name: getDisplayName(localParticipant.identity) + " (You)" },
                        ...remoteParticipants.map(p => ({ identity: p.identity, name: getDisplayName(p.identity) }))
                      ]}
                    />
                  </div>
                )}

                {activeTab === 'polls' && (
                  <div className="flex-1 min-h-0 flex flex-col p-2">
                    <MeetingPolls
                      roomId={room}
                      userId={user?.uid || localParticipant.identity}
                      userName={getDisplayName(localParticipant.identity)}
                      isHost={isHost}
                      isCoHost={isCoHost}
                    />
                  </div>
                )}

                {activeTab === 'canvas' && (
                  <div className="flex-1 min-h-0 flex flex-col p-2">
                    <MeetingCanvas
                      roomId={room}
                      userId={user?.uid || localParticipant.identity}
                      userName={getDisplayName(localParticipant.identity)}
                      compact={true}
                    />
                  </div>
                )}

                {activeTab === 'breakout' && (
                  <div className="flex-1 min-h-0 flex flex-col p-2">
                    <BreakoutRoomControls
                      isHost={isHost}
                      isCoHost={isCoHost}
                      isOpen={isBreakoutOpen}
                      rooms={breakoutRooms}
                      currentRoomId={currentBreakoutRoomId}
                      endsAt={breakoutEndsAt}
                      participants={[
                        { identity: localParticipant.identity, name: getDisplayName(localParticipant.identity) + " (You)" },
                        ...remoteParticipants.map(p => ({ identity: p.identity, name: getDisplayName(p.identity) }))
                      ]}
                      onStartBreakoutRooms={async (rooms, durationMinutes) => {
                        if (!isHost) return;
                        const endsAt = Date.now() + durationMinutes * 60 * 1000;
                        setBreakoutRooms(rooms);
                        setBreakoutEndsAt(endsAt);
                        setIsBreakoutOpen(true);
                        await updateDoc(doc(db, 'rooms', room), { breakoutRooms: rooms, isBreakoutOpen: true, breakoutEndsAt: endsAt });
                        setToastMessage(`Breakout rooms opened (${durationMinutes}m)`);
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                      onUpdateAssignments={async (rooms) => {
                        if (!isHost) return;
                        setBreakoutRooms(rooms);
                        await updateDoc(doc(db, 'rooms', room), { breakoutRooms: rooms });
                      }}
                      onCloseBreakoutRooms={async () => {
                        if (!isHost) return;
                        setIsBreakoutOpen(false);
                        setBreakoutEndsAt(null);
                        setCurrentBreakoutRoomId(null);
                        await updateDoc(doc(db, 'rooms', room), { isBreakoutOpen: false, breakoutEndsAt: null });
                        setToastMessage("All breakout rooms closed");
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                      onJoinRoom={(targetRoomId) => {
                        setCurrentBreakoutRoomId(targetRoomId);
                        const targetName = targetRoomId
                          ? (breakoutRooms.find(r => r.id === targetRoomId)?.name || 'Breakout Room')
                          : 'Main Room';
                        setToastMessage(`Moved to ${targetName}`);
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                      onBroadcastMessage={async (msg) => {
                        if (!isHost && !isCoHost) return;
                        setBroadcastBanner(msg);
                        await updateDoc(doc(db, 'rooms', room), { broadcastBanner: msg });
                        setToastMessage("Broadcast sent to all rooms");
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                    />
                  </div>
                )}

                {activeTab === 'clips' && (
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scroll">
                    <ClipsBasic
                      userId={user?.uid || localParticipant.identity}
                      userName={getDisplayName(localParticipant.identity)}
                      onClose={() => navigateSidebar(null, null)}
                    />
                  </div>
                )}

                {activeTab === 'info' && (
                  <div className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-neutral-200/70 shadow-xs space-y-4">
                      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Joining info</p>
                      <div className="bg-stone-50 p-4 rounded-xl border border-neutral-200/80 break-all text-sm font-mono text-slate-700 leading-relaxed">
                        {window.location.href}
                      </div>
                      <button 
                        onClick={handleCopy} 
                        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-xl transition-all text-sm font-medium shadow-xs cursor-pointer active:scale-[0.98]"
                      >
                        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        <span>{copied ? 'Copied to Clipboard' : 'Copy Joining Link'}</span>
                      </button>
                    </div>
                  </div>
                )}
                {(activeTab === 'participants' || activeTab === 'users') && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-slate-500">
                        In Call ({remoteParticipants.length + 1})
                      </span>
                    </div>
                    <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white overflow-hidden">
                      <ParticipantItem 
                        participant={localParticipant} 
                        isLocal
                        displayName={getDisplayName(localParticipant.identity)}
                        isHostRole={isHost}
                        isCoHostRole={isCoHost}
                      />
                      {remoteParticipants.map(p => {
                        let pMeta: any = {};
                        try { pMeta = JSON.parse(p.metadata || '{}'); } catch {}
                        const pBase = p.identity.split('#')[0];
                        const pIsHost =
                          pMeta.isHost === true ||
                          (!!roomHostIdentity && (p.identity === roomHostIdentity || pBase === roomHostIdentity.split('#')[0]));
                        const pIsCoHost =
                          !pIsHost && (coHosts.includes(p.identity) || coHosts.includes(pBase));

                        return (
                          <ParticipantItem 
                            key={p.sid} 
                            participant={p}
                            displayName={getDisplayName(p.identity)}
                            isHostRole={pIsHost}
                            isCoHostRole={pIsCoHost}
                            onSendFile={(identity: string) => openSendFileFor(identity)}
                          />
                        );
                      })}
                    </div>
                    {!isHost && (
                      <button
                        type="button"
                        onClick={() => setIsHostKeyModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-white hover:bg-stone-50 border border-neutral-200/80 rounded-xl text-sm font-medium text-slate-700 transition-colors whitespace-nowrap truncate cursor-pointer"
                      >
                        <Key size={15} className="text-emerald-700 shrink-0" />
                        <span>Claim Host Role</span>
                      </button>
                    )}
                  </div>
                )}
                {activeTab === 'chat' && (
                  <div className="flex flex-col h-full">
                    {/* Toggle: Messages / Shared Files */}
                    <div className="flex items-center gap-1.5 mb-3 bg-stone-100 p-1 rounded-xl shrink-0">
                      <button
                        type="button"
                        onClick={() => setChatSubTab('messages')}
                        className={cn(
                          "flex-1 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                          chatSubTab === 'messages' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                        )}
                      >
                        Messages
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatSubTab('files')}
                        className={cn(
                          "flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap",
                          chatSubTab === 'files' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                        )}
                      >
                        <span>Files</span>
                        {sharedFiles.length > 0 && (
                          <span className="text-xs text-slate-400 font-normal">
                            ({sharedFiles.length})
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
                        {/* Custom Multi-Tab Chat Bar */}
                        <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-neutral-200/70 overflow-x-auto no-scrollbar shrink-0">
                          {chatTabs.map((tab) => {
                            const active = activeChatTabId === tab.id;
                            return (
                              <div
                                key={tab.id}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-xl border transition-colors shrink-0",
                                  active
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-slate-600 border-neutral-200/80 hover:border-slate-300"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setActiveChatTabId(tab.id)}
                                  className="px-3 py-1.5 text-[13px] font-medium cursor-pointer whitespace-nowrap"
                                >
                                  {tab.name}
                                </button>
                                {tab.id !== 'general' && (
                                  <button
                                    type="button"
                                    title="Close tab"
                                    onClick={() => {
                                      setChatTabs((prev) => prev.filter((t) => t.id !== tab.id));
                                      if (activeChatTabId === tab.id) setActiveChatTabId('general');
                                      safeSendData(sendMultiChatData, { type: 'close-tab', tabId: tab.id }, true);
                                      deleteDoc(doc(db, 'rooms', room, 'chatTabs', tab.id)).catch(() => {});
                                    }}
                                    className="pr-2 py-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => setIsAddingChatTab((prev) => !prev)}
                            title="New chat tab"
                            className="p-1.5 rounded-xl border border-neutral-200 bg-white hover:bg-stone-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                          >
                            <Plus size={15} />
                          </button>
                        </div>

                        {isAddingChatTab && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const clean = newChatTabName.trim();
                              if (!clean) return;
                              const newTab: ChatTabItem = {
                                id: `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
                                name: clean.slice(0, 24),
                                createdBy: getDisplayName(localParticipant.identity),
                                createdAt: Date.now(),
                              };
                              setChatTabs((prev) => [...prev, newTab]);
                              setActiveChatTabId(newTab.id);
                              setNewChatTabName('');
                              setIsAddingChatTab(false);
                              safeSendData(sendMultiChatData, { type: 'create-tab', tab: newTab }, true);
                              setDoc(doc(db, 'rooms', room, 'chatTabs', newTab.id), newTab).catch(() => {});
                            }}
                            className="flex items-center gap-1.5 mb-3 shrink-0"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={newChatTabName}
                              onChange={(e) => setNewChatTabName(e.target.value)}
                              placeholder="Tab name (e.g. Q&A, Links)..."
                              className="flex-1 px-3 py-2 text-[13px] bg-white border border-neutral-200 rounded-xl outline-none focus:ring-1 focus:ring-emerald-700/50 text-slate-900"
                            />
                            <button
                              type="submit"
                              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium rounded-xl cursor-pointer whitespace-nowrap"
                            >
                              Add
                            </button>
                          </form>
                        )}

                        <div className="flex-1 space-y-3 mb-4 overflow-y-auto custom-scroll pr-1">
                          {(() => {
                            const items: ExtendedChatMessage[] =
                              activeChatTabId === 'general'
                                ? [
                                    ...chatMessages.map((m, idx) => ({
                                      id: `lk_${m.timestamp}_${idx}`,
                                      tabId: 'general',
                                      senderIdentity: m.from?.identity,
                                      senderName: m.from?.identity === localParticipant.identity ? 'You' : getDisplayName(m.from?.identity),
                                      text: m.message,
                                      timestamp: m.timestamp,
                                      isSystem: false,
                                    })),
                                    ...activityLogs,
                                  ].sort((a, b) => a.timestamp - b.timestamp)
                                : customTabMessages.filter((m) => m.tabId === activeChatTabId);

                            if (items.length === 0) {
                              return (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-400">
                                  <MessageSquare size={28} />
                                  <p className="text-[13px]">
                                    {activeChatTabId === 'general'
                                      ? 'No messages yet. Activity logs and messages appear here.'
                                      : `No messages in ${chatTabs.find((t) => t.id === activeChatTabId)?.name || 'this tab'} yet.`}
                                  </p>
                                </div>
                              );
                            }

                            return items.map((item) => {
                              if (item.isSystem) {
                                return (
                                  <p
                                    key={item.id}
                                    className="text-xs text-slate-400 text-center py-0.5 select-none"
                                  >
                                    {item.text} · {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                );
                              }
                              return (
                                <div key={item.id} className="flex flex-col">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[13px] font-medium text-slate-900">
                                      {item.senderIdentity === localParticipant.identity ? 'You' : item.senderName}
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <p className="text-[13px] text-slate-800 bg-stone-100 px-4 py-2.5 rounded-2xl rounded-tl-sm inline-block max-w-[95%] border border-neutral-200/60 leading-relaxed">
                                    {item.text}
                                  </p>
                                </div>
                              );
                            });
                          })()}
                          <div ref={chatEndRef} />
                        </div>
                        {!allowChat && !hasAdminAuthority ? (
                          <div className="px-4 py-3 bg-stone-100 border border-neutral-200/80 rounded-xl text-[13px] text-slate-500 text-center shrink-0">
                            Chat has been disabled by the host.
                          </div>
                        ) : (
                          <form 
                            onSubmit={(e) => { 
                              e.preventDefault(); 
                              if (!allowChat && !hasAdminAuthority) return;
                              const trimmed = chatInput.trim();
                              if (!trimmed) return;
                              if (activeChatTabId === 'general') {
                                sendChat(trimmed);
                              } else {
                                const msgObj: ExtendedChatMessage = {
                                  id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                  tabId: activeChatTabId,
                                  senderIdentity: localParticipant.identity,
                                  senderName: getDisplayName(localParticipant.identity),
                                  text: trimmed,
                                  timestamp: Date.now(),
                                };
                                setCustomTabMessages((prev) => [...prev, msgObj]);
                                safeSendData(sendMultiChatData, { type: 'tab-message', msg: msgObj }, true);
                                setDoc(doc(db, 'rooms', room, 'chatMessages', msgObj.id), msgObj).catch(() => {});
                              }
                              setChatInput(""); 
                            }}
                            className="flex gap-2 items-center bg-stone-50 rounded-xl px-3 py-1.5 border border-neutral-200/80 focus-within:border-slate-400 transition-all shrink-0"
                          >
                            <button
                              type="button"
                              onClick={() => openSendFileFor()}
                              title="Send file in call"
                              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-stone-200/60 rounded-xl transition-colors shrink-0 cursor-pointer"
                            >
                              <Paperclip size={16} />
                            </button>
                            <input 
                              type="text" 
                              placeholder={`Message ${chatTabs.find((t) => t.id === activeChatTabId)?.name || 'chat'}...`}
                              className="bg-transparent outline-none flex-1 text-xs text-slate-900 h-9 placeholder:text-slate-400"
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                            />
                            <button 
                              type="submit" 
                              disabled={!chatInput.trim()} 
                              className="text-slate-900 p-2 hover:bg-stone-200/60 rounded-lg transition-colors disabled:opacity-30 shrink-0 cursor-pointer"
                            >
                              <Send size={16} />
                            </button>
                          </form>
                        )}
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
                  <div className="space-y-5">
                    {hasAdminAuthority && (
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-stone-50 border border-neutral-200/70">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900">Require approval to join</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {lobbyEnabled ? 'Guests wait for you to admit them' : 'Everyone can join freely'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={lobbyEnabled}
                          onClick={async () => {
                            const next = !lobbyEnabled;
                            setLobbyEnabled(next);
                            await setDoc(doc(db, 'rooms', room), { lobby: next }, { merge: true });
                            if (!next) await admitAllUsers();
                            setToastMessage(next ? 'Waiting room enabled' : 'Waiting room disabled — everyone can join freely');
                            setTimeout(() => setToastMessage(null), 2500);
                          }}
                          className={cn(
                            "w-11 h-6 rounded-full relative transition-colors shrink-0 cursor-pointer p-0.5",
                            lobbyEnabled ? "bg-slate-900" : "bg-neutral-300"
                          )}
                        >
                          <span className={cn("w-5 h-5 bg-white rounded-full transition-transform shadow-xs block", lobbyEnabled ? "translate-x-5" : "translate-x-0")} />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-slate-700 uppercase tracking-wider">Waiting Room</p>
                        <p className="text-xs text-slate-500">{pendingParticipants.length} participant(s) waiting</p>
                      </div>
                      {pendingParticipants.length > 1 && (
                        <button
                          type="button"
                          onClick={admitAllUsers}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition-colors whitespace-nowrap truncate cursor-pointer"
                        >
                          Admit All
                        </button>
                      )}
                    </div>
                    {pendingParticipants.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400 border border-neutral-200/70">
                          <Users size={24} />
                        </div>
                        <p className="text-sm text-slate-500 font-normal">No one is waiting in the lobby.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {pendingParticipants.map(p => (
                          <div key={p.sid} className="flex items-center justify-between p-3 bg-white rounded-xl border border-neutral-200/70 transition-colors gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 bg-stone-100 border border-neutral-200 rounded-xl flex items-center justify-center text-slate-700 font-medium text-xs shrink-0">
                                {p.identity.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-slate-900 block truncate">{p.identity.split('#')[0]}</span>
                                <span className="text-xs text-slate-400 block">Waiting for approval</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button 
                                type="button"
                                onClick={() => admitUser(p)}
                                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition-colors whitespace-nowrap truncate cursor-pointer"
                              >
                                Admit
                              </button>
                              <button 
                                type="button"
                                onClick={() => declineUser({ sid: p.sid, identity: p.identity })}
                                className="px-2.5 py-1.5 bg-white hover:bg-stone-50 text-slate-700 border border-neutral-200 hover:border-slate-400 text-xs font-medium rounded-xl transition-colors whitespace-nowrap truncate cursor-pointer"
                              >
                                Decline
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
                    roomId={room}
                    mySpeakerName={getMySpeakerName()}
                    resolveSpeakerName={getDisplayName}
                    autoSaveTranscript={autoSaveTranscript}
                    setAutoSaveTranscript={setAutoSaveTranscript}
                    liveTranscriptions={transcriptions}
                    liveInterim={localTranscript}
                    onFlushTranscript={flushTranscriptBeforeExit}
                    isAiSummarizing={isAiSummarizing}
                    aiSummaryStatus={aiSummaryStatus}
                    aiSummaryError={aiSummaryError}
                    lastAiSyncedAt={lastAiSyncedAt}
                    generatedAiNote={generatedAiNote}
                    onUpdateGeneratedAiNote={(val: string) => {
                      setGeneratedAiNote(val);
                      try {
                        if (room) localStorage.setItem(`forum_guest_ai_notes_${room}`, val);
                      } catch {}
                    }}
                    onSaveAiNoteToCloud={() => void persistAiNoteToFirestore(generatedAiNote)}
                    onGenerateAiNote={(ft) => void generateAiMeetingSummary(ft)}
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
                      onBack={previousSidebarTab ? () => {
                        setActiveTab(previousSidebarTab as any);
                        setPreviousSidebarTab(null);
                        setIsWorkspaceMaximized(false);
                      } : undefined}
                      onClose={() => { setActiveTab(null); setPreviousSidebarTab(null); setIsWorkspaceMaximized(false); }}
                      isMaximized={isWorkspaceMaximized}
                      onToggleMaximize={() => setIsWorkspaceMaximized(!isWorkspaceMaximized)}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Edge-Clipping Draggable PiP Meeting Card during Workspace Maximize Mode */}
      {isWorkspaceMaximized && (activeSpeakerTrack || visibleTracks[0]) && (() => {
        const workspacePipTrack = activeSpeakerTrack || visibleTracks[0];
        return (
          <DraggableEdgeSnapCard
            boundsMode="viewport"
            padding={16}
            initialCorner="bottom-right"
            className="z-[120] w-60 sm:w-72 aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-[#141517]"
          >
            <div className="w-full h-full relative">
              <CustomParticipantTile 
                trackRef={workspacePipTrack} 
                raisedHands={raisedHands}
                isPinned={pinnedIdentities.has(workspacePipTrack.participant.identity)}
                mirror={workspacePipTrack.source !== Track.Source.ScreenShare && workspacePipTrack.participant.isLocal && videoMirroring}
                aiVideoFilter={workspacePipTrack.source !== Track.Source.ScreenShare && workspacePipTrack.participant.isLocal ? localAIVideoFilter : undefined}
                showName={false}
                isMiniCard
              />

              {/* Floating Top Header: Active speaker label & Restore button */}
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
                <span className="text-[11px] font-medium text-white/90 bg-black/65 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/10 truncate max-w-[140px]">
                  {workspacePipTrack.participant.identity.split('#')[0]} {workspacePipTrack.participant.isLocal && "(You)"}
                </span>
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={() => setIsWorkspaceMaximized(false)}
                  className="p-1.5 rounded-xl bg-black/65 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
                  title="Restore Side-by-Side View"
                >
                  <Minimize2 size={13} />
                </button>
              </div>

              {/* Floating Bottom: Audio & Video Icon Buttons */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-auto bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-2xl border border-white/15 shadow-xl">
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={async () => {
                    try {
                      const target = !localParticipant.isMicrophoneEnabled;
                      setIsMicEnabled(target);
                      await localParticipant.setMicrophoneEnabled(target);
                    } catch (err) {}
                  }}
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer",
                    localParticipant.isMicrophoneEnabled
                      ? "bg-white/15 text-white hover:bg-white/25"
                      : "bg-red-500/90 text-white hover:bg-red-600"
                  )}
                  title={localParticipant.isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {localParticipant.isMicrophoneEnabled ? <Mic size={14} /> : <MicOff size={14} />}
                </button>

                <button
                  type="button"
                  data-no-drag="true"
                  onClick={async () => {
                    try {
                      const target = !localParticipant.isCameraEnabled;
                      setIsCamEnabled(target);
                      await localParticipant.setCameraEnabled(target, target ? {
                        ...(selectedVideoId && selectedVideoId !== 'default' ? { deviceId: selectedVideoId } : {}),
                        facingMode,
                        resolution: getCameraVideoPreset(selectedResolution, streamProfile === 'high'),
                      } : undefined);
                    } catch (err) {}
                  }}
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer",
                    localParticipant.isCameraEnabled
                      ? "bg-white/15 text-white hover:bg-white/25"
                      : "bg-red-500/90 text-white hover:bg-red-600"
                  )}
                  title={localParticipant.isCameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
                >
                  {localParticipant.isCameraEnabled ? <VideoIcon size={14} /> : <VideoOff size={14} />}
                </button>
              </div>
            </div>
          </DraggableEdgeSnapCard>
        );
      })()}

        {/* Settings Central Modal with Full Mobile Optimization, Category Navigation & Custom Dropdowns */}
        <SettingsModal
          isOpen={activeTab === 'settings'}
          onClose={() => setActiveTab(null)}
          isMobile={isMobile}
          initialCategory={settingsCategory}
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
          audioSoundMode={audioSoundMode}
          setAudioSoundMode={setAudioSoundMode}
          performanceAudioOptions={performanceAudioOptions}
          setPerformanceAudioOptions={setPerformanceAudioOptions}
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
          autoDownloadTranscript={autoDownloadTranscript}
          setAutoDownloadTranscript={updateAutoDownloadTranscript}
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
          selectedResolution={selectedResolution}
          setSelectedResolution={setSelectedResolution}
          liveResolution={liveResolution}
          liveFps={liveFps}
          liveBitrate={liveBitrate}
          copyIsolatedFeedLink={copyIsolatedFeedLink}
          copyExportLinkAgain={copyExportLinkAgain}
          revokeExportToken={revokeExportToken}
          copiedExportId={copiedExportId}
        />

        {/* Host Action Confirmation Dialog */}
        <AnimatePresence>
          {hostConfirmModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                className="bg-white w-full max-w-sm rounded-2xl border border-neutral-200/80 shadow-2xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    {hostConfirmModal.type === 'end-meeting' ? 'End Meeting for Everyone?' : 'Remove Participant?'}
                  </h3>
                  <button 
                    onClick={() => setHostConfirmModal(null)} 
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {hostConfirmModal.type === 'end-meeting'
                    ? 'This will disconnect all participants and conclude the call.'
                    : `Are you sure you want to remove ${hostConfirmModal.name || 'this participant'} from the meeting?`}
                </p>
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setHostConfirmModal(null)}
                    className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (hostConfirmModal.type === 'remove-participant' && hostConfirmModal.targetIdentity) {
                        safeSendData(sendHostControl, {
                          action: 'remove-participant',
                          targetIdentity: hostConfirmModal.targetIdentity
                        }, true);
                        setToastMessage(`Removed ${hostConfirmModal.name || 'participant'}`);
                        setTimeout(() => setToastMessage(null), 2500);
                      } else if (hostConfirmModal.type === 'end-meeting') {
                        setHostConfirmModal(null);
                        await requestExitWithRecordingGuard(user ? '/dashboard' : '/', true);
                        return;
                      }
                      setHostConfirmModal(null);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer"
                  >
                    {hostConfirmModal.type === 'end-meeting' ? 'End Meeting' : 'Remove'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Taskbar - Clean Modern Bottom Dock for Desktop & Small Landscape Side Dock for mobile */}
      <AnimatePresence>
        {!isToolbarCollapsed && !isWorkspaceMaximized && (
          <motion.div 
            initial={isMobileLandscape ? { x: 90, opacity: 0 } : { y: 88, opacity: 0 }}
            animate={isMobileLandscape ? { x: 0, opacity: 1 } : { y: 0, opacity: 1 }}
            exit={isMobileLandscape ? { x: 90, opacity: 0 } : { y: 88, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            style={!isMobileLandscape && isSidebarOpenOnDesktop ? { width: `calc(100% - ${sidebarWidthStyle})`, right: 'auto' } : undefined}
            className={cn(
              "bg-[#121316] z-[70] transition-all duration-300 select-none overflow-visible",
              isMobileLandscape 
                ? "absolute top-0 right-0 bottom-0 w-[70px] sm:w-[80px] flex flex-col items-center justify-between py-2 sm:py-3 px-1.5 overflow-visible" 
                : "absolute bottom-0 left-0 h-[80px] md:h-[84px] flex items-center justify-between gap-2 px-3 sm:px-6 md:px-8 border-t border-white/5",
              !isMobileLandscape && !isSidebarOpenOnDesktop ? "w-full right-0" : ""
            )}
          >
            {/* Left: Meeting Name / Info or Centering Spacer */}
            {!isMobile && !isMobileLandscape && (
              <div className={cn(
                "items-center justify-start min-w-0 z-10 pointer-events-auto",
                isSidebarOpenOnDesktop
                  ? (activeTab === 'whiteboard' ? "hidden" : "hidden xl:flex flex-1")
                  : "hidden lg:flex flex-1"
              )}>
                {!isSidebarOpenOnDesktop && (
                  <span className="text-xs text-slate-400 font-normal truncate max-w-[200px]">
                    {meetingDetails?.title || room}
                  </span>
                )}
              </div>
            )}

            {/* Main Controls: Clean flex centering without overlapping side buttons */}
            <div 
              className={cn(
                isMobileLandscape 
                  ? "flex flex-col gap-2 sm:gap-2.5 w-full my-auto flex-none items-center justify-center" 
                  : "flex items-center justify-center pointer-events-auto z-20 shrink-0",
                isMobile && !isMobileLandscape ? "flex-1" : ""
              )}
            >
              <div className={cn(
                "flex items-center justify-center pointer-events-auto",
                isMobile && !isMobileLandscape 
                  ? "flex-1 justify-around max-w-md mx-auto px-1" 
                  : isSidebarOpenOnDesktop
                    ? "gap-1.5 sm:gap-2"
                    : "gap-2 md:gap-3"
              )}>
              {/* Mic Control */}
              <div className="relative">
                <ControlButton 
                  onClick={async () => {
                    if (!localParticipant.isMicrophoneEnabled && !allowUnmuteSelf && !hasAdminAuthority) {
                      setToastMessage("The host has muted participants and prevented unmuting");
                      setTimeout(() => setToastMessage(null), 3000);
                      return;
                    }
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
                  size={isMobile || isSidebarOpenOnDesktop ? "small" : "normal"}
                  isLandscape={isMobileLandscape}
                  title="Microphone (m)"
                />
                <AnimatePresence>
                  {isMicMenuOpen && !isMobile && (
                    <>
                      <div className="fixed inset-0 z-[110]" onClick={() => setIsMicMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 4 }}
                        transition={{ duration: 0.14 }}
                        className={cn(
                          "w-80 max-w-[calc(100vw-2rem)] bg-[#1d1f23]/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-3 z-[120] space-y-3",
                          isMobileLandscape 
                            ? "fixed right-[78px] sm:right-[88px] top-1/2 -translate-y-1/2 max-h-[85vh]" 
                            : "absolute bottom-full mb-3 left-1/2 -translate-x-1/2"
                        )}
                      >
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-slate-400 px-2">Microphone</p>
                          <div className="max-h-40 overflow-y-auto custom-scroll space-y-0.5">
                            {audioDevices.map(d => {
                              const isSelected = selectedAudioId === d.deviceId;
                              return (
                                <button 
                                  key={d.deviceId}
                                  type="button"
                                  onClick={() => { setSelectedAudioId(d.deviceId); setIsMicMenuOpen(false); }}
                                  className={cn(
                                    "w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors flex items-center justify-between gap-2.5 cursor-pointer",
                                    isSelected ? "bg-white/10 text-white font-medium" : "text-slate-300 hover:bg-white/5"
                                  )}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Mic size={13} className={isSelected ? "text-emerald-400 shrink-0" : "text-slate-400 shrink-0"} />
                                    <span className="truncate">{d.label || `Microphone ${d.deviceId.slice(0, 4)}`}</span>
                                  </div>
                                  {isSelected && <Check size={14} className="text-emerald-400 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-white/10 space-y-2">
                          <p className="text-xs font-medium text-slate-400 px-1">Sound mode</p>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-black/30 rounded-xl border border-white/5">
                            {([
                              { id: 'standard', label: 'Standard' },
                              { id: 'smooth', label: 'Smooth' },
                              { id: 'performance', label: 'Live Music' },
                            ] as const).map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setAudioSoundMode(m.id);
                                  if (m.id !== 'performance') setIsMicMenuOpen(false);
                                }}
                                className={cn(
                                  "py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate",
                                  audioSoundMode === m.id
                                    ? "bg-white/15 text-emerald-300 border border-emerald-500/30"
                                    : "text-slate-400 hover:text-slate-200"
                                )}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>

                          {audioSoundMode === 'performance' && (
                            <div className="flex items-center justify-between gap-2 px-1 pt-1">
                              <span className="text-[11px] text-slate-400 truncate">
                                Style: <span className="text-slate-200 font-medium">{PERFORMANCE_PRESET_CONFIGS[performanceAudioOptions.profile].label}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsMicMenuOpen(false);
                                  setSettingsCategory('audio');
                                  setActiveTab('settings');
                                }}
                                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Audio Settings →
                              </button>
                            </div>
                          )}
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
                      await localParticipant.setCameraEnabled(targetState, targetState ? {
                        ...(selectedVideoId && selectedVideoId !== 'default' ? { deviceId: selectedVideoId } : {}),
                        facingMode,
                        resolution: getCameraVideoPreset(selectedResolution, streamProfile === 'high'),
                      } : undefined);
                    } catch (err: any) {
                      console.warn("Camera toggle failed:", err?.message || err);
                    }
                  }}
                  icon={localParticipant.isCameraEnabled ? <VideoIcon size={isMobile ? 18 : 22} /> : <VideoOff size={isMobile ? 18 : 22} />}
                  micVideo={true}
                  enabled={localParticipant.isCameraEnabled}
                  onDropdownClick={() => setIsCamMenuOpen(!isCamMenuOpen)}
                  hasDropdown={!isMobile}
                  size={isMobile || isSidebarOpenOnDesktop ? "small" : "normal"}
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
                                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 cursor-pointer",
                                selectedVideoId === d.deviceId ? "bg-slate-700 text-white font-medium" : "text-slate-300 hover:bg-white/10"
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

              {/* Captions (Desktop / Landscape) - Hidden when sidebar is open to preserve the 4-control clean layout */}
              {!isMobile && !isSidebarOpenOnDesktop && (
                <ControlButton 
                  active={isCaptionsEnabled} 
                  onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
                  size="normal"
                  icon={<Languages size={22} />}
                  highlight={isCaptionsEnabled}
                  isLandscape={isMobileLandscape}
                  title="Captions (c)"
                />
              )}

              {/* Hand Raise (Desktop) - Hidden when sidebar is open to preserve the 4-control clean layout */}
              {!isMobile && !isSidebarOpenOnDesktop && (
                <ControlButton 
                  active={isHandRaised} 
                  onClick={toggleHandRaise}
                  icon={<Hand size={22} />}
                  warning={isHandRaised}
                  isLandscape={isMobileLandscape}
                  title="Raise hand"
                />
              )}

              {/* Screen Share (Desktop & narrow non-mobile viewports supporting display capture) */}
              {(!isMobile || (!isMobileBrowser() && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia)) && (
                <div className="relative">
                  <ControlButton 
                    active={localParticipant.isScreenShareEnabled} 
                    onClick={toggleScreenShare}
                    onDropdownClick={() => setIsScreenMenuOpen(v => !v)}
                    hasDropdown={!isMobile}
                    icon={localParticipant.isScreenShareEnabled ? <MonitorOff size={isMobile ? 18 : 22} /> : <MonitorUp size={isMobile ? 18 : 22} />}
                    highlight={localParticipant.isScreenShareEnabled}
                    size={isMobile || isSidebarOpenOnDesktop ? "small" : "normal"}
                    isLandscape={isMobileLandscape}
                    title={localParticipant.isScreenShareEnabled ? "Stop sharing" : "Share screen, projector, or app"}
                  />
                  <AnimatePresence>
                    {isScreenMenuOpen && !isMobile && (
                      <>
                        <div className="fixed inset-0 z-[110]" onClick={() => setIsScreenMenuOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={cn(
                            "w-64 bg-[#282a2e]/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-2 z-[120] space-y-1",
                            isMobileLandscape 
                              ? "fixed right-[78px] sm:right-[88px] top-1/2 -translate-y-1/2" 
                              : "absolute bottom-full mb-3 left-1/2 -translate-x-1/2"
                          )}
                        >
                          <p className="text-[10px] font-bold text-slate-400 px-2.5 py-1 uppercase tracking-wider">Share Source</p>
                          <button
                            type="button"
                            onClick={() => { setIsScreenMenuOpen(false); void startScreenShare('monitor'); }}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            Entire Screen / Projector (Desktop 1, 2…)
                          </button>
                          <button
                            type="button"
                            onClick={() => { setIsScreenMenuOpen(false); void startScreenShare('window'); }}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            Another App Window
                          </button>
                          <button
                            type="button"
                            onClick={() => { setIsScreenMenuOpen(false); void startScreenShare('browser'); }}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            Browser Tab
                          </button>
                          {localParticipant.isScreenShareEnabled && (
                            <button
                              type="button"
                              onClick={() => { setIsScreenMenuOpen(false); void stopScreenShare(); }}
                              className="w-full text-left px-3 py-2 rounded-xl text-xs text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer"
                            >
                              Stop Sharing
                            </button>
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Reactions & Smile (Mobile and Desktop) - Hidden when sidebar is open to preserve the 4-control clean layout */}
              {(!isSidebarOpenOnDesktop || isMobile) && (
                <div className="relative">
                  <ControlButton 
                    onClick={() => setIsReactionsMenuOpen(!isReactionsMenuOpen)}
                    icon={<Smile size={isMobile ? 18 : 22} />}
                    active={isReactionsMenuOpen}
                    size={isMobile || isSidebarOpenOnDesktop ? "small" : "normal"}
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
                          "bg-[#282a2e]/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 px-3 py-2 z-[120] flex items-center gap-1.5 select-none",
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
                            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-lg sm:text-xl hover:bg-white/15 rounded-xl transition-transform active:scale-125 cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              )}

              {/* More Options (3 Dots) - Houses Overflow Items with Slide-Up Sheet on Mobile */}
              <div className="relative">
                <ControlButton 
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  icon={<MoreVertical size={isMobile ? 18 : 20} />}
                  active={isMoreMenuOpen}
                  size={isMobile || isSidebarOpenOnDesktop ? "small" : "normal"}
                  isLandscape={isMobileLandscape}
                  title="More options"
                />
                {isMobile && !isMobileLandscape && (chatMessages.length > 0 || pendingParticipants.length > 0) && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-slate-400 rounded-full ring-2 ring-[#202124] pointer-events-none" />
                )}

                <AnimatePresence>
                  {isMoreMenuOpen && (
                    <>
                      {/* Mobile Slide-Up Bottom Sheet */}
                      {isMobile && !isMobileLandscape ? (
                        <>
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs"
                            onClick={() => setIsMoreMenuOpen(false)} 
                          />
                          <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 280 }}
                            style={{ overscrollBehaviorY: 'contain' }}
                            className="fixed inset-x-0 bottom-0 z-[130] bg-[#1a1c1e] text-white rounded-t-3xl border-t border-white/10 shadow-2xl pb-6 max-h-[68dvh] flex flex-col overflow-hidden overscroll-contain"
                          >
                            {/* Drag handle & Close Header (Prevents accidental browser pull-to-refresh) */}
                            <div
                              className="px-5 pt-2.5 pb-2 border-b border-white/10 flex items-center justify-between shrink-0 touch-none select-none"
                              onTouchStart={(e) => {
                                sheetTouchStartYRef.current = e.touches[0]?.clientY ?? null;
                              }}
                              onTouchMove={(e) => {
                                const startY = sheetTouchStartYRef.current;
                                const curY = e.touches[0]?.clientY;
                                if (startY !== null && curY !== undefined && curY - startY > 6) {
                                  e.preventDefault();
                                }
                              }}
                              onTouchEnd={(e) => {
                                const startY = sheetTouchStartYRef.current;
                                const endY = e.changedTouches[0]?.clientY;
                                sheetTouchStartYRef.current = null;
                                if (startY !== null && endY !== undefined && endY - startY > 44) {
                                  setIsMoreMenuOpen(false);
                                }
                              }}
                            >
                              <span className="text-xs font-medium text-slate-300">More options</span>
                              <button
                                type="button"
                                onClick={() => setIsMoreMenuOpen(false)}
                                className="w-10 h-1 bg-white/25 rounded-full cursor-pointer"
                                aria-label="Drag or tap to close menu"
                              />
                              <button
                                type="button"
                                onClick={() => setIsMoreMenuOpen(false)}
                                className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                                aria-label="Close options"
                              >
                                <X size={16} />
                              </button>
                            </div>

                            {/* Menu Actions Scroll Container */}
                            <div
                              ref={sheetScrollRef}
                              style={{ overscrollBehaviorY: 'contain' }}
                              onTouchStart={(e) => {
                                if ((sheetScrollRef.current?.scrollTop ?? 0) <= 0) {
                                  sheetTouchStartYRef.current = e.touches[0]?.clientY ?? null;
                                } else {
                                  sheetTouchStartYRef.current = null;
                                }
                              }}
                              onTouchMove={(e) => {
                                const startY = sheetTouchStartYRef.current;
                                const curY = e.touches[0]?.clientY;
                                if (
                                  startY !== null &&
                                  curY !== undefined &&
                                  curY - startY > 10 &&
                                  (sheetScrollRef.current?.scrollTop ?? 0) <= 0
                                ) {
                                  e.preventDefault();
                                }
                              }}
                              onTouchEnd={(e) => {
                                const startY = sheetTouchStartYRef.current;
                                const endY = e.changedTouches[0]?.clientY;
                                sheetTouchStartYRef.current = null;
                                if (
                                  startY !== null &&
                                  endY !== undefined &&
                                  endY - startY > 64 &&
                                  (sheetScrollRef.current?.scrollTop ?? 0) <= 0
                                ) {
                                  setIsMoreMenuOpen(false);
                                }
                              }}
                              className="flex-1 overflow-y-auto overscroll-contain custom-scroll p-4 space-y-4"
                            >
                              {/* Section 1: Collaboration & Workspace */}
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 pb-1">
                                  Collaboration
                                </p>
                                
                                <button 
                                  type="button"
                                  onClick={() => { navigateSidebar('whiteboard', null); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <LayoutGrid size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Joint Workspace</span>
                                  </div>
                                </button>

                                <button 
                                  type="button"
                                  onClick={() => { navigateSidebar('chat', null); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <MessageSquare size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">In-Call Chat</span>
                                  </div>
                                  {chatMessages.length > 0 && (
                                    <span className="text-xs text-slate-400 font-normal">
                                      ({chatMessages.length})
                                    </span>
                                  )}
                                </button>

                                <button 
                                  type="button"
                                  onClick={() => { navigateSidebar('notes', null); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <FileText size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Meeting Minutes</span>
                                  </div>
                                </button>

                                {hasAdminAuthority ? (
                                  <button 
                                    type="button"
                                    onClick={() => { navigateSidebar('host_controls', null); setIsMoreMenuOpen(false); }}
                                    className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer group"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                        <ShieldCheck size={18} />
                                      </div>
                                      <span className="text-sm font-medium text-white block">Host Controls</span>
                                    </div>
                                    {pendingParticipants.length > 0 && (
                                      <span className="text-xs text-slate-400 font-normal">
                                        ({pendingParticipants.length} waiting)
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  <button 
                                    type="button"
                                    onClick={() => { setIsHostKeyModalOpen(true); setIsMoreMenuOpen(false); }}
                                    className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer group"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                        <Key size={18} />
                                      </div>
                                      <span className="text-sm font-medium text-white block">Claim Host Role</span>
                                    </div>
                                  </button>
                                )}
                              </div>

                              <div className="h-px bg-white/10 mx-2" />

                              {/* Section 2: In-Call Media & Video Controls */}
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 pb-1">
                                  In-Call Controls
                                </p>

                                <button 
                                  type="button"
                                  onClick={() => { 
                                    setIsMoreMenuOpen(false); 
                                    setSettingsCategory('effects'); 
                                    setActiveTab('settings'); 
                                  }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <ImageIcon size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Visual Effects</span>
                                  </div>
                                  <span className="text-xs font-normal text-slate-400 capitalize">
                                    {selectedBg === 'none' ? 'Off' : selectedBg}
                                  </span>
                                </button>

                                {localParticipant.isCameraEnabled && (
                                  <button 
                                    type="button"
                                    onClick={() => { handleFlipCamera(); setIsMoreMenuOpen(false); }}
                                    className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                        <SwitchCamera size={18} />
                                      </div>
                                      <span className="text-sm font-medium text-white block">Flip Camera</span>
                                    </div>
                                    <span className="text-xs font-normal text-slate-400">
                                      {facingMode === 'user' ? 'Front' : 'Back'}
                                    </span>
                                  </button>
                                )}

                                <button 
                                  type="button"
                                  onClick={() => { toggleHandRaise(); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <Hand size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">
                                      {isHandRaised ? 'Lower Hand' : 'Raise Hand'}
                                    </span>
                                  </div>
                                </button>

                                <button 
                                  type="button"
                                  onClick={() => { setIsCaptionsEnabled(!isCaptionsEnabled); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <Languages size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Live Captions</span>
                                  </div>
                                  <span className="text-xs font-normal text-slate-400">
                                    {isCaptionsEnabled ? 'On' : 'Off'}
                                  </span>
                                </button>

                                {typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && (
                                  <button 
                                    type="button"
                                    onClick={() => { setIsMoreMenuOpen(false); toggleScreenShare(); }}
                                    className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                        {localParticipant.isScreenShareEnabled ? <MonitorOff size={18} /> : <MonitorUp size={18} />}
                                      </div>
                                      <span className="text-sm font-medium text-white block">
                                        {localParticipant.isScreenShareEnabled ? 'Stop Screen Share' : 'Share Screen'}
                                      </span>
                                    </div>
                                  </button>
                                )}
                              </div>

                              <div className="h-px bg-white/10 mx-2" />

                              {/* Section 3: View & Settings */}
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 pb-1">
                                  View & Settings
                                </p>

                                <button 
                                  type="button"
                                  onClick={() => { setIsMoreMenuOpen(false); void pipRef.current?.togglePiP(); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <PictureInPicture2 size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Floating Mini View</span>
                                  </div>
                                  <span className="text-xs font-normal text-slate-400">
                                    {isPiPActive ? 'Active' : 'Pop out'}
                                  </span>
                                </button>

                                <button 
                                  type="button"
                                  onClick={() => toggleAutoPipOnTabLeave(!autoPipOnTabLeave)}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <Monitor size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Auto-float on tab leave</span>
                                  </div>
                                  <span className="text-xs font-normal text-slate-400">
                                    {autoPipOnTabLeave ? 'On' : 'Off'}
                                  </span>
                                </button>

                                <button 
                                  type="button"
                                  onClick={() => { setLayoutMode(layoutMode === 'tiled' ? 'sidebar' : 'tiled'); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <LayoutIcon size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Layout View</span>
                                  </div>
                                  <span className="text-xs font-normal text-slate-400 capitalize">
                                    {layoutMode}
                                  </span>
                                </button>

                                <button 
                                  type="button"
                                  onClick={() => { setActiveTab('settings'); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center shrink-0">
                                      <Settings size={18} />
                                    </div>
                                    <span className="text-sm font-medium text-white block">Settings</span>
                                  </div>
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        </>
                      ) : (
                        /* Desktop / Landscape Floating Dropdown Menu */
                        <>
                          <div className="fixed inset-0 z-[110]" onClick={() => setIsMoreMenuOpen(false)} />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={cn(
                              "w-72 sm:w-80 bg-[#282a2e]/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-3 z-[130] overflow-y-auto custom-scroll",
                              isMobileLandscape 
                                ? "fixed right-[78px] sm:right-[88px] top-1/2 -translate-y-1/2 max-h-[90vh]" 
                                : "absolute bottom-full mb-3 left-1/2 -translate-x-1/2 max-w-[min(340px,calc(100vw-24px))] max-h-[80vh]"
                            )}
                          >
                            {/* In-Call Quick Reactions */}
                            <div className="p-1.5 bg-white/5 rounded-xl border border-white/10 mb-2">
                              <div className="flex items-center justify-between gap-1">
                                {['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '👎'].map(emoji => (
                                  <button 
                                    key={emoji}
                                    type="button"
                                    onClick={() => { sendReaction(emoji); setIsMoreMenuOpen(false); }}
                                    className="w-7 h-7 flex items-center justify-center text-base hover:bg-white/15 rounded-lg transition-transform active:scale-125 cursor-pointer"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* In-Call Media & Actions */}
                            <div className="space-y-1 mb-1.5">
                              <button 
                                type="button"
                                onClick={() => { toggleHandRaise(); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <Hand size={16} className={isHandRaised ? "text-amber-400" : "text-slate-400"} />
                                  <span>{isHandRaised ? "Lower Hand" : "Raise Hand"}</span>
                                </div>
                              </button>

                              <button 
                                type="button"
                                onClick={() => { setIsCaptionsEnabled(!isCaptionsEnabled); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <Languages size={16} className={isCaptionsEnabled ? "text-emerald-400" : "text-slate-400"} />
                                  <span>Live Captions</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  {isCaptionsEnabled ? "On" : "Off"}
                                </span>
                              </button>

                              <button 
                                type="button"
                                onClick={() => { 
                                  setIsMoreMenuOpen(false); 
                                  setSettingsCategory('effects'); 
                                  setActiveTab('settings'); 
                                }}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <ImageIcon size={16} className="text-slate-400" />
                                  <span>Visual Effects</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-normal capitalize">
                                  {selectedBg === 'none' ? 'Off' : selectedBg}
                                </span>
                              </button>
                            </div>

                            <div className="h-px bg-white/10 my-1.5" />

                            {/* Activities & Host on Desktop */}
                            <div className="space-y-1 mb-1">
                              <button 
                                type="button"
                                onClick={() => { navigateSidebar('whiteboard', null); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <LayoutGrid size={16} className="text-slate-400" />
                                  <span>Joint Workspace</span>
                                </div>
                              </button>

                              <button 
                                type="button"
                                onClick={() => { navigateSidebar('chat', null); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <MessageSquare size={16} className="text-slate-400" />
                                  <span>In-Call Chat</span>
                                </div>
                              </button>

                              <button 
                                type="button"
                                onClick={() => { navigateSidebar('participants', null); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <Users size={16} className="text-slate-400" />
                                  <span>Participants</span>
                                </div>
                              </button>

                              {hasAdminAuthority ? (
                                <button 
                                  type="button"
                                  onClick={() => { navigateSidebar('host_controls', null); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <ShieldCheck size={16} className="text-slate-400" />
                                    <span>Host Controls</span>
                                  </div>
                                  {pendingParticipants.length > 0 && (
                                    <span className="text-[10px] text-slate-400 font-normal">
                                      ({pendingParticipants.length})
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <button 
                                  type="button"
                                  onClick={() => { setIsHostKeyModalOpen(true); setIsMoreMenuOpen(false); }}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl text-xs text-white transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <Key size={16} className="text-slate-400" />
                                    <span>Claim Host Role</span>
                                  </div>
                                </button>
                              )}
                            </div>

                            <div className="h-px bg-white/10 my-1.5" />

                            {/* Layout & View */}
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 pt-1">
                                Layout & View
                              </p>
                              <button 
                                type="button"
                                onClick={() => { setLayoutMode('tiled'); setIsMoreMenuOpen(false); }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors cursor-pointer",
                                  layoutMode === 'tiled' ? "text-white bg-white/10 font-medium" : "text-slate-300"
                                )}
                              >
                                <LayoutIcon size={16} className="text-slate-400" />
                                <span>Tiled layout</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => { setLayoutMode('sidebar'); setIsMoreMenuOpen(false); }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors cursor-pointer",
                                  layoutMode === 'sidebar' ? "text-white bg-white/10 font-medium" : "text-slate-300"
                                )}
                              >
                                <Monitor size={16} className="text-slate-400" />
                                <span>Sidebar layout</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => { setLayoutMode('imo'); setIsMoreMenuOpen(false); }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs transition-colors cursor-pointer",
                                  layoutMode === 'imo' ? "text-white bg-white/10 font-medium" : "text-slate-300"
                                )}
                              >
                                <LayoutIcon size={16} className="text-slate-400 rotate-90" />
                                <span>IMO view (filmstrip)</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => { setHideNonVideo(!hideNonVideo); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-slate-300 transition-colors cursor-pointer"
                              >
                                <UserX size={16} className="text-slate-400" />
                                <span>{hideNonVideo ? "Show non-video" : "Hide non-video"}</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => { setIsMoreMenuOpen(false); void pipRef.current?.togglePiP(); }}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                              >
                                <span className="flex items-center gap-3">
                                  <PictureInPicture2 size={16} className="text-slate-400" />
                                  <span>Floating Mini View (PiP)</span>
                                </span>
                                <span className="text-[10px] text-slate-400">{isPiPActive ? 'Active' : 'Pop out'}</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => toggleAutoPipOnTabLeave(!autoPipOnTabLeave)}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                              >
                                <span className="flex items-center gap-3">
                                  <Monitor size={16} className="text-slate-400" />
                                  <span>Auto-float on tab switch</span>
                                </span>
                                <span className="text-[10px] text-slate-400">{autoPipOnTabLeave ? 'On' : 'Off'}</span>
                              </button>

                              <div className="h-px bg-white/10 my-1" />
                              <button 
                                type="button"
                                onClick={() => { setActiveTab('settings'); setIsMoreMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-xl text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                              >
                                <Settings size={16} className="text-slate-400" />
                                <span>Settings</span>
                              </button>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* End Call Button - Squircle Matching Other Buttons */}
              <button 
                type="button"
                onClick={() => void requestExitWithRecordingGuard(user ? '/dashboard' : '/')}
                className={cn(
                  "bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer shrink-0",
                  isMobile || isMobileLandscape || isSidebarOpenOnDesktop
                    ? "w-[46px] h-[44px] rounded-[18px]" 
                    : "w-[48px] h-[48px] sm:w-[52px] sm:h-[48px] rounded-2xl"
                )}
                title="Leave Call"
              >
                <PhoneOff size={isMobile || isMobileLandscape ? 17 : 20} />
              </button>
            </div>
          </div>

          {/* Right: Tab Buttons (Host Controls, 4-Square Tools, Chat, Settings, Collapse) */}
          {!isMobile && (
            <div className={cn(
              "flex items-center z-10 pointer-events-auto",
              isMobileLandscape ? "flex-col gap-2 w-full mt-auto pt-2" : "flex-1 justify-end gap-1.5 sm:gap-2"
            )}>
              {!isMobileLandscape && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Host Controls button */}
                  {hasAdminAuthority && (
                    <TabButton 
                      active={activeTab === 'host_controls'} 
                      onClick={() => navigateSidebar(activeTab === 'host_controls' ? null : 'host_controls', null)} 
                      icon={<ShieldCheck size={20} />} 
                      badge={pendingParticipants.length > 0 ? pendingParticipants.length : undefined}
                      title="Host Controls" 
                    />
                  )}

                  {/* 4-Square Tools Button */}
                  <TabButton 
                    active={activeTab === 'tools' || activeTab === 'whiteboard' || activeTab === 'files'} 
                    onClick={() => navigateSidebar(activeTab === 'tools' || activeTab === 'whiteboard' || activeTab === 'files' ? null : 'tools', null)} 
                    icon={<LayoutGrid size={20} />} 
                    badge={sharedFiles.length > 0 ? sharedFiles.length : undefined}
                    title="Tools & Workspace" 
                  />

                  {/* In-Call Chat */}
                  <TabButton 
                    active={activeTab === 'chat'} 
                    onClick={() => navigateSidebar(activeTab === 'chat' ? null : 'chat', null)} 
                    icon={<MessageSquare size={20} />} 
                    badge={chatMessages.length > 0 ? chatMessages.length : undefined} 
                    title="In-call Chat" 
                  />

                  {/* Picture-in-Picture Floating Mini View */}
                  <TabButton 
                    active={isPiPActive} 
                    onClick={() => void pipRef.current?.togglePiP()} 
                    icon={<PictureInPicture2 size={19} />} 
                    title={isPiPActive ? "Close Floating Mini View" : "Floating Mini View (Picture-in-Picture)"} 
                  />

                  {/* Settings */}
                  <TabButton 
                    active={activeTab === 'settings'} 
                    onClick={() => navigateSidebar(activeTab === 'settings' ? null : 'settings', null)} 
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
          )}
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
        {toastMessage && (() => {
          const isErrorToast = /\b(could not|failed|error|blocked|denied|not supported|prevented)\b/i.test(toastMessage);
          return (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-24 right-6 z-[140] flex items-center gap-2.5 px-4 py-3 bg-slate-900/95 text-slate-100 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md text-xs font-medium max-w-md flex-wrap"
            >
              {isErrorToast ? (
                <Lock className="text-rose-400 shrink-0" size={15} />
              ) : (
                <Check className="text-emerald-400 shrink-0" size={16} />
              )}
              <span className="flex-1 min-w-0">{toastMessage}</span>
              {isErrorToast && (
                <SendErrorFeedbackButton variant="dark" errorMessage={toastMessage} source="Meeting Room" />
              )}
              <button 
                onClick={() => setToastMessage(null)}
                className="ml-1 p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors cursor-pointer shrink-0"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })()}
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

      {/* Host Key Claim Modal */}
      <HostKeyModal
        isOpen={isHostKeyModalOpen}
        onClose={() => setIsHostKeyModalOpen(false)}
        currentHostName={roomHostName || meetingDetails?.hostName}
        onClaimHost={async (enteredKey: string) => {
          const roomSnap = await getDoc(doc(db, 'rooms', room));
          const validKey = roomSnap.data()?.hostKey || hostKey;
          if (enteredKey.trim() === String(validKey).trim()) {
            const newHostName = getDisplayName(localParticipant.identity);
            await updateDoc(doc(db, 'rooms', room), {
              hostId: user?.uid || localParticipant.identity,
              hostIdentity: localParticipant.identity,
              hostEmail: user?.email || '',
              hostName: newHostName,
            });
            setIsHost(true);
            setIsAdmitted(true);
            setIsRoomLockedBlocked(false);
            setToastMessage("You are now the meeting host");
            setTimeout(() => setToastMessage(null), 3000);
            return true;
          }
          return false;
        }}
      />

      {/* Duplicate Session Detection Modal */}
      <DuplicateSessionModal
        isOpen={isDuplicateSessionOpen}
        isReplacedNotice={isSessionReplaced}
        onTakeOver={async () => {
          const nextToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
          sessionTokenRef.current = nextToken;
          setIsDuplicateSessionOpen(false);
          setIsSessionReplaced(false);
          const key = sessionKeyRef.current || user?.uid || encodeURIComponent(localParticipant.identity.split('#')[0]);
          await setDoc(doc(db, 'rooms', room, 'activeSessions', key), {
            sessionToken: nextToken,
            identity: localParticipant.identity,
            lastSeen: Date.now()
          }, { merge: true }).catch(() => {});
          setToastMessage("Session active on this device");
          setTimeout(() => setToastMessage(null), 2500);
        }}
        onReturnToDashboard={() => void requestExitWithRecordingGuard(user ? '/dashboard' : '/')}
      />

      {/* Active Recording Exit Guard Modal */}
      <AnimatePresence>
        {recordingExitModal?.open && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="bg-white w-full max-w-md rounded-2xl border border-neutral-200/80 shadow-2xl p-6 space-y-5"
            >
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">Recording in Progress</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  You have an active recording running. Download it before leaving so your recording is not lost.
                </p>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoDownloadRecording}
                  onChange={(e) => toggleAutoDownloadRecording(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 text-slate-900 focus:ring-slate-900/30 cursor-pointer"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  Always auto-download recordings when leaving, ending a meeting, or closing this tab
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingRecordingBeforeExit}
                  onClick={() => setRecordingExitModal(null)}
                  className="px-3.5 py-2 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-700 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  Stay in Call
                </button>
                <button
                  type="button"
                  disabled={isSavingRecordingBeforeExit}
                  onClick={async () => {
                    const { destination, isEndForAll } = recordingExitModal;
                    setRecordingExitModal(null);
                    meetingRecorderRef.current?.cleanup();
                    meetingRecorderRef.current = null;
                    setRecordingStatus('idle');
                    onRecordingChange?.(false);
                    await executeExitAction(destination, isEndForAll);
                  }}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/70 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  Discard & Leave
                </button>
                <button
                  type="button"
                  disabled={isSavingRecordingBeforeExit}
                  onClick={async () => {
                    const { destination, isEndForAll } = recordingExitModal;
                    setIsSavingRecordingBeforeExit(true);
                    try {
                      await stopAndSaveRecordingNow();
                    } finally {
                      setIsSavingRecordingBeforeExit(false);
                    }
                    setRecordingExitModal(null);
                    await executeExitAction(destination, isEndForAll);
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {isSavingRecordingBeforeExit ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  <span>{isSavingRecordingBeforeExit ? 'Finalizing...' : 'Download & Leave'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MeetingPictureInPicture
        ref={pipRef}
        activeTrack={activeSpeakerTrack || visibleTracks[0] || null}
        participantCount={remoteParticipants.length + 1}
        roomTitle={meetingDetails?.title || room}
        isMicEnabled={localParticipant.isMicrophoneEnabled}
        isCamEnabled={localParticipant.isCameraEnabled}
        onToggleMic={async () => {
          try {
            const target = !localParticipant.isMicrophoneEnabled;
            setIsMicEnabled(target);
            await localParticipant.setMicrophoneEnabled(target);
          } catch {}
        }}
        onToggleCam={async () => {
          try {
            const target = !localParticipant.isCameraEnabled;
            setIsCamEnabled(target);
            await localParticipant.setCameraEnabled(target, target ? {
              ...(selectedVideoId && selectedVideoId !== 'default' ? { deviceId: selectedVideoId } : {}),
              facingMode,
              resolution: getCameraVideoPreset(selectedResolution, streamProfile === 'high'),
            } : undefined);
          } catch {}
        }}
        onLeave={() => void requestExitWithRecordingGuard(user ? '/dashboard' : '/')}
        autoPipEnabled={autoPipOnTabLeave}
        videoMirroring={videoMirroring}
        onPiPStateChange={setIsPiPActive}
      />

      <RoomAudioRenderer />
    </div>
  );
}

function CustomParticipantTile({ trackRef, raisedHands, isPinned, onTogglePin, mirror, aiVideoFilter, showName = true, isFocal, isCompact, isMiniCard, isMobilePortrait, onSpotlight, onContextMenu, onCopyIsolatedFeed, onSendFile }: any) {
  const { user } = useAuth();
  const isScreenShare = trackRef?.source === Track.Source.ScreenShare;
  const isSpeaking = useIsSpeaking(trackRef?.participant);
  const isVideoOff = !trackRef?.publication || trackRef.publication.isMuted || !trackRef.publication.isEnabled;
  const isHandRaised = !isScreenShare && raisedHands?.[trackRef?.participant.identity];
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Real-time face tracking for camera tiles only (never on screen shares)
  const facePos = useFaceTracking(trackRef, !isVideoOff && !isFocal && !isScreenShare);
  
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
        if (onContextMenu && !isCompact) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      className={cn(
        "group relative w-full h-full rounded-2xl overflow-hidden bg-[#141517] border-2 transition-all duration-300 select-none flex items-center justify-center",
        !isScreenShare && isSpeaking ? "border-accent-blue shadow-[0_0_20px_rgba(66,133,244,0.4)]" : "border-transparent"
      )}
    >
      {isVideoOff ? (
        <div className={cn(
          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#18191b] to-[#222428]",
          isMiniCard && "pb-8",
          isCompact && "pb-3.5"
        )}>
          {userAvatar ? (
            <div className={cn(
              isCompact
                ? (isMobilePortrait ? "w-11 h-11 shrink-0 aspect-square" : "w-9 h-9 shrink-0 aspect-square")
                : isMiniCard
                  ? "w-14 h-14 shrink-0 aspect-square"
                  : isFocal 
                    ? "w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 shrink-0 aspect-square" 
                    : "w-16 h-16 sm:w-20 sm:h-20 shrink-0 aspect-square",
              "rounded-full overflow-hidden border-2 border-accent-blue/20 shadow-xl transition-all",
              isSpeaking ? "ring-4 ring-accent-blue/40 scale-105" : ""
            )}>
              <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <div className={cn(
              isCompact
                ? (isMobilePortrait ? "w-11 h-11 shrink-0 aspect-square text-base" : "w-9 h-9 shrink-0 aspect-square text-xs sm:text-sm")
                : isMiniCard
                  ? "w-14 h-14 shrink-0 aspect-square text-xl"
                  : isFocal 
                    ? "w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 shrink-0 aspect-square text-2xl sm:text-4xl" 
                    : "w-16 h-16 sm:w-20 sm:h-20 shrink-0 aspect-square text-xl sm:text-2xl",
              "rounded-full bg-accent-blue flex items-center justify-center font-bold text-white shadow-xl transition-all",
              isSpeaking ? "ring-4 ring-accent-blue/40 scale-105" : ""
            )}>
              {trackRef?.participant.identity.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      ) : (
        <div 
          className={cn("w-full h-full flex items-center justify-center transition-all duration-200 bg-[#121316]", !isScreenShare && mirror ? "scale-x-[-1]" : "")}
          style={{
            filter: isScreenShare ? 'none' : (aiVideoFilter || 'none')
          }}
        >
          <VideoTrack 
            trackRef={trackRef} 
            className={cn(
              "w-full h-full transition-[object-position] duration-150 ease-out bg-[#121316]",
              !isScreenShare && isMobilePortrait ? "object-cover" : "object-contain"
            )}
            style={{
              objectPosition: 'center center'
            }}
          />
        </div>
      )}

      {/* Overlay Info */}
      {showName && (
        <div className={cn(
          "absolute flex items-center gap-1.5 bg-black/65 backdrop-blur-md rounded-lg border border-white/10 pointer-events-none",
          isCompact
            ? "bottom-1.5 left-1.5 max-w-[calc(100%-12px)] px-2 py-0.5"
            : "bottom-2.5 sm:bottom-3 left-2.5 sm:left-3 max-w-[calc(100%-20px)] px-2.5 sm:px-3 py-1 sm:py-1.5"
        )}>
          {isScreenShare ? (
            <MonitorUp size={isCompact ? 11 : 14} className="text-emerald-400 shrink-0" />
          ) : !trackRef?.participant.isMicrophoneEnabled ? (
            <MicOff size={isCompact ? 11 : 14} className="text-accent-red shrink-0" />
          ) : isSpeaking ? (
            <div className="flex gap-0.5 items-end h-3">
              <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-0.5 bg-accent-blue" />
              <motion.div animate={{ height: [6, 12, 6] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-accent-blue" />
              <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-0.5 bg-accent-blue" />
            </div>
          ) : (
            <Mic size={isCompact ? 11 : 14} className="text-white/70 shrink-0" />
          )}
          <span className={cn(
            "text-white font-medium truncate min-w-0",
            isCompact ? "text-[11px]" : "text-xs sm:text-[13px]"
          )}>
            {isScreenShare
              ? (trackRef?.participant.isLocal ? "Your screen" : `${trackRef?.participant.identity.split('#')[0]}'s screen`)
              : `${trackRef?.participant.identity.split('#')[0]}${trackRef?.participant.isLocal ? " (You)" : ""}`}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      {!isCompact && (
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
      )}

      {/* Hand Raised - Icon ONLY, no text */}
      <AnimatePresence>
        {isHandRaised && (
          <motion.div 
            initial={{ scale: 0, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0, y: 12 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="absolute top-3 left-3 bg-amber-400 text-slate-950 w-8 h-8 rounded-xl shadow-lg z-20 flex items-center justify-center backdrop-blur-sm pointer-events-none"
            title="Hand raised"
          >
            <Hand size={16} className="text-slate-950" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ParticipantItem(props: any) {
  const { participant, isLocal, displayName, isHostRole, isCoHostRole, onSendFile } = props;
  const { user } = useAuth();
  const metadata = useMemo(() => {
    try {
      return JSON.parse(participant?.metadata || "{}");
    } catch {
      return {};
    }
  }, [participant?.metadata]);

  const avatarUrl = (isLocal && user?.photoURL) ? user.photoURL : metadata.avatar;
  const resolvedLabel = displayName || participant?.identity?.split('#')[0] || "User";

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white hover:bg-stone-50/80 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-200" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-8 h-8 bg-stone-100 text-slate-700 rounded-xl flex items-center justify-center text-xs font-medium border border-neutral-200/70 shrink-0">
            {resolvedLabel.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-slate-900 truncate">
            {resolvedLabel} {isLocal && "(You)"}
          </span>
          {(isHostRole || metadata.isHost === true) && (
            <span title="Host" className="text-amber-600 shrink-0 flex items-center">
              <Crown size={15} />
            </span>
          )}
          {!(isHostRole || metadata.isHost === true) && isCoHostRole && (
            <span title="Co-host" className="text-emerald-700 shrink-0 flex items-center">
              <ShieldCheck size={15} />
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!isLocal && onSendFile && participant?.identity && (
          <button
            onClick={() => onSendFile(participant.identity)}
            title={`Send file to ${resolvedLabel}`}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          >
            <Paperclip size={14} />
          </button>
        )}
        {!participant?.isMicrophoneEnabled ? <MicOff size={14} className="text-rose-500" /> : <Mic size={14} className="text-slate-400" />}
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
          "transition-all duration-150 ease-out flex items-center justify-center flex-shrink-0 cursor-pointer shadow-xs active:scale-95",
          isSmall 
            ? "w-[46px] h-[44px] rounded-[18px]" 
            : (isLandscape ? "w-[46px] h-[44px] rounded-[18px]" : "w-[48px] h-[48px] sm:w-[52px] sm:h-[48px] rounded-2xl"),
          hasDropdown ? (isLandscape ? "rounded-b-none border-b border-white/10" : "rounded-r-none border-r border-white/10") : "",
          micVideo ? (
            enabled 
              ? "bg-[#2a2d32] text-white hover:bg-[#383b40]" 
              : "bg-[#fce8e6] text-[#b3261e] hover:bg-[#fad2cf] border border-red-200/50"
          ) : (
            danger && !active ? "bg-[#ea4335] text-white hover:bg-[#d93025]" : 
            warning && active ? "bg-amber-100 text-amber-900 border border-amber-300/60 font-medium" :
            highlight && active ? "bg-white/25 text-white border border-white/20" :
            active ? "bg-white/20 text-white" : "bg-[#2a2d32] text-white hover:bg-[#383b40]"
          )
        )}
      >
        {icon}
      </button>
      {hasDropdown && (
        <button
          onClick={onDropdownClick}
          className={cn(
            "bg-[#2a2d32] text-white/70 hover:text-white hover:bg-[#383b40] transition-all flex items-center justify-center cursor-pointer",
            isLandscape 
              ? "w-[46px] h-[16px] rounded-b-2xl border-t border-white/10" 
              : (isSmall ? "w-[18px] h-[44px] rounded-r-[18px] border-l border-white/10" : "w-[20px] h-[48px] rounded-r-2xl border-l border-white/10")
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
        "w-10 h-10 sm:w-11 sm:h-11 rounded-2xl transition-all duration-150 ease-out relative flex items-center justify-center cursor-pointer shadow-xs",
        active ? "bg-white/20 text-white shadow-xs" : "bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
      )}
    >
      {icon}
      {badge !== undefined && (
        <span className="absolute -top-1 -right-1 bg-slate-800 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-lg min-w-[18px] text-center border border-white/20">
          {badge}
        </span>
      )}
    </button>
  );
}

const NotesPanel = React.memo(({
  user,
  roomId,
  mySpeakerName = 'Speaker',
  resolveSpeakerName,
  autoSaveTranscript,
  setAutoSaveTranscript,
  liveTranscriptions = [],
  liveInterim = '',
  onFlushTranscript,
  isAiSummarizing = false,
  aiSummaryStatus,
  aiSummaryError,
  lastAiSyncedAt = null,
  generatedAiNote = '',
  onUpdateGeneratedAiNote,
  onSaveAiNoteToCloud,
  onGenerateAiNote,
}: {
  user: any;
  navigate: any;
  roomId?: string;
  mySpeakerName?: string;
  resolveSpeakerName?: (identity?: string) => string;
  autoSaveTranscript: boolean;
  setAutoSaveTranscript: (v: boolean) => void;
  liveTranscriptions?: Array<{ id: string; identity: string; speaker?: string; timeLabel?: string; text: string; timestamp: number }>;
  liveInterim?: string;
  onFlushTranscript?: () => Promise<void> | void;
  isAiSummarizing?: boolean;
  aiSummaryStatus?: string | null;
  aiSummaryError?: string | null;
  lastAiSyncedAt?: number | null;
  generatedAiNote?: string;
  onUpdateGeneratedAiNote?: (val: string) => void;
  onSaveAiNoteToCloud?: () => Promise<void> | void;
  onGenerateAiNote?: (formatType: 'summary' | 'action_items' | 'full_notes') => void;
}) => {
  const { komuLogin, komuUser } = useAuth();
  const [panelTab, setPanelTab] = useState<'notes' | 'transcript' | 'summary'>('notes');
  const [notes, setNotes] = useState<any[]>([]);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const [searchNotesTerm, setSearchNotesTerm] = useState("");
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedAiNote, setCopiedAiNote] = useState(false);
  const [savedCloudFlash, setSavedCloudFlash] = useState(false);
  const [savedTranscriptFlash, setSavedTranscriptFlash] = useState(false);
  const isDirtySelectedNoteRef = useRef(false);

  const uid = (user || komuUser)?.uid;

  const formatEntrySpeaker = (rawIdentity?: string) => {
    if (!rawIdentity || rawIdentity === 'You') return mySpeakerName;
    if (resolveSpeakerName) return resolveSpeakerName(rawIdentity);
    return rawIdentity.split('#')[0] || mySpeakerName;
  };

  useEffect(() => {
    if (!uid) return;
    try {
      const q = query(
        collection(komuDb, 'notes'),
        where('uid', '==', uid),
        where('isTrash', '==', false)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        data.sort((a: any, b: any) => {
          const tA = a.updatedAt?.toMillis?.() || 0;
          const tB = b.updatedAt?.toMillis?.() || 0;
          return tB - tA;
        });
        setNotes(data);

        // Only update the currently open note if user isn't actively editing unsaved text
        if (selectedNote && !isDirtySelectedNoteRef.current) {
          const updatedSelected = data.find(n => n.id === selectedNote.id);
          if (updatedSelected && updatedSelected.body !== selectedNote.body) {
            setSelectedNote(updatedSelected);
          }
        }
      }, (err) => {
        console.error("NotesPanel fetch error:", err);
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
      isDirtySelectedNoteRef.current = false;
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
        roomId: roomId || '',
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
      console.error("Failed to add note:", err);
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
        isDirtySelectedNoteRef.current = false;
        setSelectedNote(null);
      }
    } catch (err) {
      console.error("Failed to trash note:", err);
    }
  };

  // Note detail view (clean Back navigation — never loops back into a transcript)
  if (selectedNote && panelTab === 'notes') {
    return (
      <div className="flex flex-col h-full bg-white -m-5 p-5 z-20">
        <div className="flex items-center gap-3 mb-4 sticky top-0 bg-white z-10 pb-3 border-b border-neutral-200/60">
          <button 
            type="button"
            onClick={() => {
              void handleUpdateNote();
              isDirtySelectedNoteRef.current = false;
              setSelectedNote(null);
            }} 
            className="p-2 hover:bg-stone-100 rounded-xl text-slate-500 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer"
            title="Back to notes list"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <input 
              value={selectedNote.title}
              onChange={(e) => {
                isDirtySelectedNoteRef.current = true;
                setSelectedNote({ ...selectedNote, title: e.target.value });
              }}
              placeholder="Title"
              className="w-full text-base font-semibold text-slate-900 bg-transparent border-none outline-none placeholder:text-slate-300"
              onBlur={() => void handleUpdateNote()}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              type="button"
              onClick={() => {
                const blob = new Blob([`${selectedNote.title || 'Note'}\n\n${selectedNote.body || ''}`], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `forum-note-${Date.now()}.md`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              title="Download .md"
            >
              <Download size={15} />
            </button>
            <button 
              type="button"
              onClick={() => void handleUpdateNote()} 
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl disabled:opacity-50 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Save size={13} />
              <span>{isSaving ? "Saving..." : "Save"}</span>
            </button>
            <button 
              type="button"
              onClick={() => void toggleTrash(selectedNote.id, true)} 
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              title="Delete note"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <textarea 
          value={selectedNote.body}
          onChange={(e) => {
            isDirtySelectedNoteRef.current = true;
            setSelectedNote({ ...selectedNote, body: e.target.value });
          }}
          placeholder="Start writing..."
          className="flex-1 w-full text-sm text-slate-800 bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-slate-300 custom-scroll font-sans"
          onBlur={() => void handleUpdateNote()}
        />
        <div className="mt-4 pt-4 border-t border-neutral-200/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium">
            Last edited {selectedNote.updatedAt?.toDate() ? format(selectedNote.updatedAt.toDate(), 'PPp') : 'Just now'}
          </span>
        </div>
      </div>
    );
  }

  const personalAndSavedNotes = notes.filter((n) => n.type !== 'transcript');
  const roomTranscriptDoc = notes.find(
    (n) => n.type === 'transcript' && (!roomId || n.roomId === roomId || n.id.includes(roomId.replace(/[^a-zA-Z0-9_-]/g, '_')))
  );

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Clean 3-Tab Separation: Notes | Transcript (No AI) | Summary (AI) */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-xl shrink-0">
        {([
          { id: 'notes' as const, label: 'Notes' },
          { id: 'transcript' as const, label: 'Transcript' },
          { id: 'summary' as const, label: 'AI Summary' },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setPanelTab(tab.id);
              if (tab.id !== 'notes') {
                isDirtySelectedNoteRef.current = false;
                setSelectedNote(null);
              }
            }}
            className={cn(
              "py-2 px-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate",
              panelTab === tab.id
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-1 space-y-4">
        {/* TAB 1: PERSONAL NOTES (separate from auto-updating transcripts) */}
        {panelTab === 'notes' && (
          <>
            {!uid ? (
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 text-center space-y-3">
                <p className="text-sm font-medium text-slate-900">Sync personal notes across meetings</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Sign in with Google to save your notes, transcripts, and AI summaries in one place.
                </p>
                <button
                  type="button"
                  onClick={komuLogin}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-[13px] rounded-xl transition-colors cursor-pointer"
                >
                  Sign in with Google
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 peer-focus:text-slate-800 transition-colors" size={16} />
                    <input 
                      type="text"
                      placeholder="Search saved notes..."
                      value={searchNotesTerm}
                      onChange={(e) => setSearchNotesTerm(e.target.value)}
                      className="peer w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200/80 rounded-xl text-sm text-slate-900 focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 outline-none transition-all font-normal placeholder:text-slate-400"
                    />
                  </div>
                  {!isCreatingNote ? (
                    <button 
                      type="button"
                      onClick={() => setIsCreatingNote(true)}
                      className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-xl hover:bg-slate-800 transition-all font-medium text-[13px] shadow-xs cursor-pointer whitespace-nowrap"
                    >
                      <Plus size={16} />
                      <span>Take a note</span>
                    </button>
                  ) : (
                    <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-sm space-y-3">
                      <input 
                        type="text"
                        placeholder="Title"
                        autoFocus
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                        className="w-full text-sm font-semibold bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400"
                      />
                      <textarea 
                        placeholder="Take a note..."
                        value={newNoteBody}
                        onChange={(e) => setNewNoteBody(e.target.value)}
                        className="w-full text-[13px] bg-transparent border-none outline-none resize-none min-h-[90px] text-slate-700 placeholder:text-slate-400 leading-relaxed"
                      />
                      <div className="flex items-center justify-between pt-2">
                        <button 
                          type="button"
                          onClick={() => { setIsCreatingNote(false); setNewNoteTitle(""); setNewNoteBody(""); }}
                          className="text-[13px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button 
                          type="button"
                          disabled={!newNoteTitle.trim() && !newNoteBody.trim()}
                          onClick={() => void handleAddNote()}
                          className="px-4 py-2 bg-slate-900 text-white text-[13px] font-medium rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer"
                        >
                          Save note
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {personalAndSavedNotes
                    .filter(n => (n.title || '').toLowerCase().includes(searchNotesTerm.toLowerCase()) || (n.body || '').toLowerCase().includes(searchNotesTerm.toLowerCase()))
                    .map(note => (
                      <div 
                        key={note.id} 
                        onClick={() => {
                          isDirtySelectedNoteRef.current = false;
                          setSelectedNote(note);
                        }}
                        className="group p-4 bg-white border border-neutral-200/70 rounded-2xl hover:border-slate-400 hover:shadow-xs transition-all relative cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="font-semibold text-slate-900 text-sm truncate">{note.title || "Untitled"}</h4>
                          {note.type === 'summary' && (
                            <span className="text-[11px] font-medium text-slate-500 shrink-0">
                              Summary
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 text-[13px] line-clamp-3 leading-relaxed whitespace-pre-wrap">
                          {note.body}
                        </p>
                        <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs text-slate-400 font-medium">
                            {note.updatedAt?.toDate() ? new Date(note.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void toggleArchive(note.id, !note.isArchive); }} 
                              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-stone-100 rounded-lg transition-all cursor-pointer"
                            >
                              <Archive size={14} />
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void toggleTrash(note.id, true); }} 
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  {personalAndSavedNotes.length === 0 && !isCreatingNote && (
                    <div className="py-8 flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-400">
                      <FileText size={24} />
                      <p className="text-[13px]">Personal notes and saved meeting summaries appear here.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* TAB 2: ALWAYS-ON MEETING TRANSCRIPT (NO AI — Pure speech-to-text synced in background to ONE single file) */}
        {panelTab === 'transcript' && (
          <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-slate-700 shrink-0">
                  <Languages size={17} />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-slate-900 block leading-snug">Meeting Transcript</span>
                  <span className="text-xs text-slate-500 block leading-snug">
                    {autoSaveTranscript
                      ? uid
                        ? 'Auto-saving in background · 1 single file'
                        : 'Capturing locally · Auto-downloads on exit'
                      : 'Transcript paused'}
                  </span>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setAutoSaveTranscript(!autoSaveTranscript)}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-all duration-200 cursor-pointer shrink-0",
                  autoSaveTranscript ? "bg-slate-900" : "bg-neutral-300"
                )}
                title="Toggle background transcript"
              >
                <div className={cn(
                  "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-200",
                  autoSaveTranscript ? "left-6" : "left-1"
                )} />
              </button>
            </div>

            {(liveTranscriptions.length > 0 || liveInterim || roomTranscriptDoc?.body) ? (
              <div className="pt-2.5 border-t border-neutral-200/70 space-y-3">
                <div className="max-h-80 overflow-y-auto custom-scroll space-y-3 text-[13px] text-slate-700 bg-[#FBFBFA] rounded-xl p-3.5 border border-neutral-200/60">
                  {liveTranscriptions.length > 0 ? (
                    liveTranscriptions.map((entry) => {
                      const ts = entry.timeLabel || new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const speakerText = entry.speaker || formatEntrySpeaker(entry.identity);
                      return (
                        <div key={entry.id} className="leading-relaxed space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{speakerText}</span>
                            <span className="text-[11px] font-mono text-slate-400 tabular-nums">{ts}</span>
                          </div>
                          <p className="text-slate-700 leading-relaxed">{entry.text}</p>
                        </div>
                      );
                    })
                  ) : roomTranscriptDoc?.body ? (
                    <pre className="whitespace-pre-wrap font-sans text-[13px] text-slate-700 leading-relaxed">
                      {roomTranscriptDoc.body}
                    </pre>
                  ) : null}
                  {liveInterim && (
                    <div className="leading-relaxed text-slate-400 italic space-y-0.5">
                      <span className="font-semibold not-italic text-slate-600">{mySpeakerName} (speaking…)</span>
                      <p>{liveInterim}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  {onFlushTranscript && uid && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onFlushTranscript();
                        setSavedTranscriptFlash(true);
                        setTimeout(() => setSavedTranscriptFlash(false), 1800);
                      }}
                      className="text-[13px] font-medium text-slate-800 hover:text-slate-950 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Save size={13} />
                      <span>{savedTranscriptFlash ? 'Synced' : 'Sync File Now'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const textOut = liveTranscriptions.length > 0
                        ? [
                            ...liveTranscriptions.map((t) => `\n**[${t.timeLabel || new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${t.speaker || formatEntrySpeaker(t.identity)}:** ${t.text}\n`),
                            ...(liveInterim ? [`\n**[Live] ${mySpeakerName}:** ${liveInterim}\n`] : [])
                          ].join('')
                        : (roomTranscriptDoc?.body || '');
                      downloadStyledTranscript({
                        roomId: roomId || 'meeting',
                        title: `Meeting Transcript — ${roomId || 'Session'}`,
                        dateText: format(new Date(), 'PPpp'),
                        rawBody: textOut,
                      });
                    }}
                    className="text-[13px] font-medium text-slate-700 hover:text-slate-950 cursor-pointer ml-auto flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download size={13} />
                    <span>Download Transcript</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-slate-500 leading-relaxed pt-1">
                Transcript capture stays on automatically in the background whenever participants speak—no AI required, saved cleanly into one file without duplicates.
              </p>
            )}
          </div>
        )}

        {/* TAB 3: AI MEETING SUMMARY (Uses AI — End-of-Meeting or Manual Trigger) */}
        {panelTab === 'summary' && (
          <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-slate-700 shrink-0">
                <FileText size={17} />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-slate-900 block leading-snug">AI Meeting Summary</span>
                <span className="text-xs text-slate-500 block leading-snug">
                  {isAiSummarizing
                    ? (aiSummaryStatus || 'Creating your summary…')
                    : lastAiSyncedAt
                      ? `Saved ${new Date(lastAiSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Turns your transcript into a readable recap'}
                </span>
              </div>
            </div>

            {onGenerateAiNote && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isAiSummarizing}
                  onClick={() => onGenerateAiNote('summary')}
                  className="w-full py-2.5 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {isAiSummarizing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  <span>{isAiSummarizing ? 'Writing Recap…' : 'Write Meeting Recap'}</span>
                </button>
                <button
                  type="button"
                  disabled={isAiSummarizing}
                  onClick={() => onGenerateAiNote('action_items')}
                  className="w-full py-2.5 px-3.5 bg-[#FBFBFA] hover:bg-stone-100 text-slate-700 border border-neutral-200/80 rounded-xl text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <CheckCheck size={14} />
                  <span>Extract Tasks & Next Steps</span>
                </button>
              </div>
            )}

            {aiSummaryError && (
              <div className="p-3 bg-rose-50/70 border border-rose-200/70 rounded-xl space-y-2">
                <p className="text-xs text-rose-700 leading-snug">{aiSummaryError}</p>
                <SendErrorFeedbackButton errorMessage={aiSummaryError} source="AI Meeting Summary" />
              </div>
            )}

            {generatedAiNote ? (
              <div className="space-y-3 pt-2 border-t border-neutral-200/60">
                <textarea
                  rows={10}
                  value={generatedAiNote}
                  onChange={(e) => onUpdateGeneratedAiNote?.(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#FBFBFA] border border-neutral-200/80 text-[13px] text-slate-800 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-emerald-700/50 custom-scroll"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(generatedAiNote).catch(() => {});
                        setCopiedAiNote(true);
                        setTimeout(() => setCopiedAiNote(false), 1800);
                      }}
                      className="text-[13px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {copiedAiNote ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
                      <span>{copiedAiNote ? 'Copied' : 'Copy'}</span>
                    </button>
                    {onSaveAiNoteToCloud && uid && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onSaveAiNoteToCloud();
                          setSavedCloudFlash(true);
                          setTimeout(() => setSavedCloudFlash(false), 1800);
                        }}
                        className="text-[13px] font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Save size={13} />
                        <span>{savedCloudFlash ? 'Saved' : 'Save Summary'}</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([generatedAiNote], { type: 'text/markdown;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `forum-ai-summary-${Date.now()}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="text-[13px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download size={13} />
                    <span>Download .md</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-slate-500 leading-relaxed pt-1">
                Whenever you want a recap (best at the end of your meeting), choose an option above to turn the transcript into a clean summary or list of follow-up tasks.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
