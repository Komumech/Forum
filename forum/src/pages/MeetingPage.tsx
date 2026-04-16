import * as React from 'react';
import { useEffect, useState, useRef, useMemo, Component } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Layout as LayoutIcon, ShieldCheck, UserX, VolumeX, Monitor, ArrowLeftRight,
  Sparkles, Camera, Speaker, Headphones, Clock, Smile, Heart
} from 'lucide-react';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import { useAuth } from '../context/AuthContext';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function MeetingPage() {
  const { id: room } = useParams();
  const navigate = useNavigate();
  const { user, preferences, updatePreferences } = useAuth();
  
  const [token, setToken] = useState("");
  const [name, setName] = useState(preferences?.displayName || user?.displayName || "");
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
    if (preferences?.displayName) {
      setName(preferences.displayName);
    } else if (user?.displayName && !name) {
      setName(user.displayName);
    }
  }, [user, preferences, name]);

  const [preJoinMic, setPreJoinMic] = useState(true);
  const [preJoinCam, setPreJoinCam] = useState(true);
  const [preJoinBg, setPreJoinBg] = useState<'none' | 'blur' | 'image'>('none');

  // 1. Initial Camera Preview for "Green Room"
  useEffect(() => {
    if (!isReady) {
      if (!navigator.mediaDevices) return;
      if (!preJoinCam) {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: true, audio: preJoinMic })
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
  }, [isReady, preJoinCam, preJoinMic]);

  const handleJoin = async () => {
    if (!name || !room) return;
    console.log(`[MeetingPage] Attempting to join room: ${room} as ${name}`);
    try {
      const metadata = JSON.stringify({ 
        pending: true, // Default to pending for waiting room
        avatar: user?.photoURL || "",
        isHost: false // Will be determined by host check
      });

      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;

      const uniqueIdentity = `${name}#${Math.floor(1000 + Math.random() * 9000)}`;
      const url = `/api/get-participant-token?room=${room}&username=${encodeURIComponent(uniqueIdentity)}&metadata=${encodeURIComponent(metadata)}`;
      
      console.log(`[MeetingPage] Fetching token from: ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Token API failed (${resp.status}): ${errorText}`);
      }

      const data = await resp.json();
      if (!data.token) throw new Error("No token returned from server");

      console.log(`[MeetingPage] Token received, connecting to LiveKit...`);
      setToken(data.token);
      setIsReady(true);

      // Save last room to preferences
      if (user) {
        updatePreferences({ 
          lastRoom: room, 
          lastJoinedAt: new Date().toISOString() 
        });
      }
    } catch (e) {
      console.error("[MeetingPage] Join Error:", e);
      alert(`Could not join the meeting: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-bg-light flex flex-col items-center justify-center p-6">
        <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-12 bg-white p-8 md:p-12 rounded-[24px] shadow-2xl border border-gray-100">
          <div className="flex-1 w-full relative aspect-video bg-bg-dark rounded-2xl overflow-hidden shadow-inner group">
            {preJoinCam ? (
              <video ref={videoRef} autoPlay muted playsInline className={cn("scale-x-[-1] w-full h-full object-cover", preJoinBg === 'blur' && "blur-md")} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a]">
                <div className="w-24 h-24 rounded-full bg-accent-blue flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                  {name.charAt(0).toUpperCase() || "?"}
                </div>
              </div>
            )}
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
               <button 
                onClick={() => setPreJoinMic(!preJoinMic)}
                className={cn(
                  "p-4 rounded-full backdrop-blur-md border border-white/10 shadow-xl transition-all",
                  preJoinMic ? "bg-surface/80 text-text-primary hover:bg-surface" : "bg-accent-red text-white hover:bg-red-600"
                )}
               >
                {preJoinMic ? <Mic size={24} /> : <MicOff size={24} />}
               </button>
               <button 
                onClick={() => setPreJoinCam(!preJoinCam)}
                className={cn(
                  "p-4 rounded-full backdrop-blur-md border border-white/10 shadow-xl transition-all",
                  preJoinCam ? "bg-surface/80 text-text-primary hover:bg-surface" : "bg-accent-red text-white hover:bg-red-600"
                )}
               >
                {preJoinCam ? <VideoIcon size={24} /> : <VideoOff size={24} />}
               </button>
               <button 
                onClick={() => setPreJoinBg(preJoinBg === 'none' ? 'blur' : 'none')}
                className={cn(
                  "p-4 rounded-full backdrop-blur-md border border-white/10 shadow-xl transition-all",
                  preJoinBg !== 'none' ? "bg-accent-blue text-white hover:bg-blue-600" : "bg-surface/80 text-text-primary hover:bg-surface"
                )}
               >
                <Sparkles size={24} />
               </button>
            </div>

            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
              <select 
                onChange={(e) => {
                  const deviceId = e.target.value;
                  navigator.mediaDevices.getUserMedia({ video: { deviceId } })
                    .then(stream => {
                      streamRef.current = stream;
                      if (videoRef.current) videoRef.current.srcObject = stream;
                    });
                }}
                className="bg-black/50 text-white text-xs p-2 rounded-lg border border-white/10 outline-none backdrop-blur-md"
              >
                <option value="">Default Camera</option>
                {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <div className="w-full lg:w-[380px] space-y-8 text-center lg:text-left">
            <div>
              <h1 className="text-[36px] font-normal text-text-primary-light tracking-tight mb-2">
                {meetingDetails?.title || "Ready to join?"}
              </h1>
              {meetingDetails && (
                <p className="text-text-secondary-light text-lg mb-1">
                  Hosted by <span className="font-bold text-accent-blue">{meetingDetails.hostName}</span>
                </p>
              )}
              <p className="text-text-secondary-light text-lg">Room: <span className="font-mono font-medium text-accent-blue">{room}</span></p>
            </div>
            <div className="space-y-5">
              <input 
                type="text" 
                placeholder="Your name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 bg-surface-lighter-light border-none rounded-lg focus:ring-2 focus:ring-accent-blue outline-none text-[16px] transition-all text-text-primary-light placeholder:text-text-secondary-light"
              />
              <button 
                onClick={handleJoin}
                disabled={!name}
                className="w-full py-4 bg-accent-blue text-white rounded-full font-medium text-[15px] hover:bg-blue-600 active:scale-[0.98] transition-all disabled:bg-surface-lighter-light disabled:text-text-secondary-light"
              >
                Join meeting
              </button>
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
    <main className="h-[100dvh] dark-theme overflow-hidden">
    <LiveKitRoom
      video={{ resolution: VideoPresets.h720.resolution, frameRate: 30 }}
      audio={true}
      token={token}
      serverUrl={serverUrl}
      connect={true}
      onDisconnected={() => navigate('/')}
      className="h-full w-full"
    >
      <div className="flex flex-col h-full relative">
        <MeetingRoomHeader room={room || ""} isRecording={isRecording} setIsRecording={setIsRecording} />
        <MeetingRoomContent 
          room={room || ""} 
          videoDevices={videoDevices} 
          audioDevices={audioDevices} 
          speakerDevices={speakerDevices}
          initialBg={preJoinBg}
          initialMic={preJoinMic}
          initialCam={preJoinCam}
        />
      </div>
    </LiveKitRoom>
    </main>
  );
}

function MeetingRoomHeader({ room, isRecording, setIsRecording }: { room: string, isRecording: boolean, setIsRecording: (v: boolean) => void }) {
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  return (
    <header className="absolute top-0 left-0 right-0 h-[72px] px-6 flex items-center justify-between bg-slate-950/90 z-[60] pointer-events-none">
      <div className="flex items-center gap-3 pointer-events-auto">
        <button onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-800/90 px-3 py-2 text-sm font-semibold text-white border border-white/10 transition-all duration-200 ease-out hover:bg-slate-700">
          <Settings size={18} />
          <span>Tools</span>
          <ChevronDown size={16} className={cn("transition-transform duration-200", isToolsMenuOpen && "rotate-180")} />
        </button>
        <AnimatePresence>
          {isToolsMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="absolute top-[72px] left-6 z-[70] w-56 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-2xl p-3"
            >
              <div className="text-sm text-slate-300">Tools menu coming soon</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="pointer-events-auto" />
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
  console.error(`Firestore Error [${operationType}] on [${path}]:`, error);
}

function MeetingRoomContent({ room, videoDevices, audioDevices, speakerDevices, initialBg, initialMic, initialCam }: { room: string, videoDevices: MediaDeviceInfo[], audioDevices: MediaDeviceInfo[], speakerDevices: MediaDeviceInfo[], initialBg: string, initialMic: boolean, initialCam: boolean }) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send: sendChat } = useChat();
  const connectionState = useConnectionState();
  const { send: sendHandRaise, message: handRaiseMessage } = useDataChannel("hand-raise");
  const { send: sendReactionData, message: reactionMessage } = useDataChannel("reaction");
  const { send: sendAdmit } = useDataChannel("admit-user");
  
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [pendingParticipants, setPendingParticipants] = useState<Participant[]>([]);

  // Waiting Room Logic
  useEffect(() => {
    if (!localParticipant || !room || loading) return;

    // Apply initial mic/cam settings
    localParticipant.setMicrophoneEnabled(initialMic);
    localParticipant.setCameraEnabled(initialCam);

    // Check if I am the host
    const checkHost = async () => {
      const myUid = user?.uid;
      const mySid = localParticipant.sid;
      if (!room) return;

      // CRITICAL: Default admin always has access
      if (user?.email === "komumech@gmail.com") {
        console.log("[MeetingPage] Admin access granted");
        setIsHost(true);
        setIsAdmitted(true);
        return;
      }

      const roomRef = doc(db, 'rooms', room);
      try {
        const roomSnap = await getDoc(roomRef);
        
        // Always check meetings collection as source of truth for scheduled meetings
        const meetingsRef = collection(db, 'meetings');
        const q = query(meetingsRef, where('roomId', '==', room));
        const meetingSnap = await getDocs(q);
        let scheduledHostId = null;
        
        if (!meetingSnap.empty) {
          scheduledHostId = meetingSnap.docs[0].data().hostId;
        }

        if (scheduledHostId && (scheduledHostId === myUid || scheduledHostId === mySid)) {
          console.log("[MeetingPage] Recognized as scheduled host");
          if (!roomSnap.exists()) {
            await setDoc(roomRef, { hostId: myUid || mySid, createdAt: serverTimestamp() });
          }
          setIsHost(true);
          setIsAdmitted(true);
          return;
        }

        if (!roomSnap.exists()) {
          // No room and no scheduled host match, first person in becomes host
          console.log("[MeetingPage] Creating new room, becoming host");
          await setDoc(roomRef, { hostId: myUid || mySid, createdAt: serverTimestamp() });
          setIsHost(true);
          setIsAdmitted(true);
        } else {
          const hostId = roomSnap.data().hostId;
          if (hostId === myUid || hostId === mySid) {
            console.log("[MeetingPage] Recognized as room host");
            setIsHost(true);
            setIsAdmitted(true);
          } else {
            console.log("[MeetingPage] Not recognized as host, checking admission");
            // Check if already admitted
            const myId = myUid || mySid;
            const admittedRef = doc(db, 'rooms', room, 'admitted', myId);
            const admittedSnap = await getDoc(admittedRef);
            if (admittedSnap.exists()) {
              setIsAdmitted(true);
            }
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `rooms/${room}`);
      }
    };

    checkHost();

    // Listen for admission
    const myId = user?.uid || localParticipant.sid;
    if (!isHost && myId && room) {
      const admittedRef = doc(db, 'rooms', room, 'admitted', myId);
      const unsubscribe = onSnapshot(admittedRef, (doc) => {
        if (doc.exists()) setIsAdmitted(true);
      }, (err) => {
        // Silent fail for admission check as it might not exist yet
      });
      return () => unsubscribe();
    }
  }, [localParticipant, room, user, loading, isHost, initialMic, initialCam]);

  // Host: Listen for pending participants
  useEffect(() => {
    if (!isHost) return;
    
    const pending = remoteParticipants.filter(p => {
      try {
        const meta = JSON.parse(p.metadata || "{}");
        return meta.pending === true;
      } catch {
        return false;
      }
    });
    setPendingParticipants(pending);
  }, [remoteParticipants, isHost]);

  const admitUser = async (participant: Participant) => {
    if (!room || !isHost) return;
    const participantId = participant.identity.split('#')[0] || participant.sid;
    if (!participantId) return;

    try {
      // Add to admitted collection in Firestore
      const admittedRef = doc(db, 'rooms', room, 'admitted', participantId);
      await setDoc(admittedRef, { admittedAt: serverTimestamp() });
      
      // Also send a data message as a fallback/speedup
      sendAdmit(new TextEncoder().encode("admitted"), { reliable: true, destinationIdentities: [participant.identity] });

      // Remove the participant from the local waiting list immediately so the admit button feels responsive
      setPendingParticipants(prev => prev.filter(p => p.sid !== participant.sid));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rooms/${room}/admitted/${participantId}`);
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

  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'chat' | 'settings' | 'waiting'> (null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatRecipient, setChatRecipient] = useState<string>("everyone");
  const [copied, setCopied] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const tracks = useVisualStableUpdate(rawTracks, 16);
  const isMobile = useMemo(() => typeof window !== 'undefined' && isMobileBrowser(), []);

  const [layoutMode, setLayoutMode] = useState<'auto' | 'tiled' | 'sidebar' | 'spotlight'>('auto');
  const [pinnedIdentities, setPinnedIdentities] = useState<Set<string>>(new Set());
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(16);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [mobilePrimaryIdentity, setMobilePrimaryIdentity] = useState<string | null>(null);
  const [mobileOverlaySide, setMobileOverlaySide] = useState<'right' | 'left'>('right');

  // Settings
  const [settingsCategory, setSettingsCategory] = useState<'video' | 'audio' | 'general' | 'effects'>('video');
  const [videoMirroring, setVideoMirroring] = useState(true);
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [showParticipantNames, setShowParticipantNames] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [showClock, setShowClock] = useState(true);
  const [selectedResolution, setSelectedResolution] = useState<'360p' | '720p'>('720p');
  const [selectedBg, setSelectedBg] = useState<'none' | 'blur' | 'image'>(initialBg || 'none');
  const [selectedBgImage, setSelectedBgImage] = useState('https://picsum.photos/seed/office/1920/1080');
  const [reactions, setReactions] = useState<{ id: number, emoji: string, x: number }[]>([]);
  const [isReactionsMenuOpen, setIsReactionsMenuOpen] = useState(false);

  const bgImages = [
    { id: 'office', url: 'https://picsum.photos/seed/office/1920/1080', label: 'Office' },
    { id: 'home', url: 'https://picsum.photos/seed/home/1920/1080', label: 'Home' },
    { id: 'nature', url: 'https://picsum.photos/seed/nature/1920/1080', label: 'Nature' },
    { id: 'abstract', url: 'https://picsum.photos/seed/abstract/1920/1080', label: 'Abstract' },
  ];

  // Apply Background Effects
  useEffect(() => {
    const applyProcessor = async () => {
      if (!localParticipant || !localParticipant.isCameraEnabled) return;
      
      const track = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack;
      if (!track) return;

      // Stop existing processor if any
      await track.stopProcessor();

      if (selectedBg === 'blur') {
        const processor = BackgroundBlur(10);
        await track.setProcessor(processor);
      } else if (selectedBg === 'image') {
        const processor = VirtualBackground(selectedBgImage);
        await track.setProcessor(processor);
      }
    };

    applyProcessor();
  }, [selectedBg, selectedBgImage, localParticipant]);

  // Apply Device Changes
  useEffect(() => {
    if (selectedVideoId) localParticipant.setCameraEnabled(true, { deviceId: selectedVideoId });
  }, [selectedVideoId, localParticipant]);

  useEffect(() => {
    if (selectedAudioId) localParticipant.setMicrophoneEnabled(true, { deviceId: selectedAudioId });
  }, [selectedAudioId, localParticipant]);

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
    const MAX_TILES = isMobile ? 8 : 12;
    if (processedTracks.length <= MAX_TILES) {
      return processedTracks;
    }
    return processedTracks.slice(0, MAX_TILES - 1);
  }, [processedTracks, isMobile]);

  const extraTrackCount = Math.max(0, processedTracks.length - visibleTracks.length);

  const participantGridColumns = useMemo(() => {
    if (visibleTracks.length <= 1) return "grid-cols-1";
    if (isMobile) return "grid-cols-2";
    if (visibleTracks.length <= 2) return "grid-cols-2 md:grid-cols-4";
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
      return (pinnedIdentities.size > 0 || someoneIsSharing) ? 'sidebar' : 'tiled';
    }
    return layoutMode;
  }, [layoutMode, pinnedIdentities.size, processedTracks]);

  const focusTrack = useMemo(() => {
    if (pinnedIdentities.size === 0) return processedTracks.find(t => t.source === Track.Source.ScreenShare) || processedTracks[0];
    return processedTracks.find(t => pinnedIdentities.has(t.participant.identity)) || processedTracks[0];
  }, [processedTracks, pinnedIdentities]);

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
            <Clock className="text-accent-blue animate-pulse" size={40} />
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
            className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 pointer-events-auto"
          >
            <div className="bg-surface/95 backdrop-blur-xl p-4 rounded-2xl border border-white/10 shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent-blue rounded-full flex items-center justify-center text-white font-bold">
                  {pendingParticipants[0].identity.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">{pendingParticipants[0].identity.split('#')[0]} wants to join</p>
                  <p className="text-xs text-text-secondary">{pendingParticipants.length} person(s) waiting</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => admitUser(pendingParticipants[0])}
                  className="px-4 py-2 bg-accent-blue text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-all"
                >
                  Admit
                </button>
                <button className="p-2 text-text-secondary hover:bg-white/5 rounded-lg transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Area */}
      <div className="flex-1 relative flex items-center justify-center p-4 pt-[60px] pb-[80px]">
        <div className={cn(
          "w-full h-full transition-all duration-500",
          activeTab ? "lg:mr-[320px]" : ""
        )}>
          {computedLayout === 'sidebar' && focusTrack ? (
            <div className="flex flex-col md:flex-row gap-4 h-full w-full">
              <div className="flex-[3] bg-bg-dark rounded-2xl overflow-hidden relative shadow-2xl border border-white/5">
                <CustomParticipantTile 
                  trackRef={focusTrack} 
                  raisedHands={raisedHands} 
                  isPinned={pinnedIdentities.has(focusTrack.participant.identity)}
                  onTogglePin={() => togglePin(focusTrack.participant.identity)}
                  showName={showParticipantNames}
                />
              </div>
              <div className="w-[280px] overflow-y-auto space-y-3 custom-scroll pr-2 hidden md:block shrink-0">
                {processedTracks.filter(t => t.participant.sid !== focusTrack.participant.sid).map(t => (
                  <div key={t.participant.sid} className="aspect-video">
                    <CustomParticipantTile 
                      trackRef={t} 
                      raisedHands={raisedHands}
                      onTogglePin={() => togglePin(t.participant.identity)}
                      isPinned={pinnedIdentities.has(t.participant.identity)}
                      showName={showParticipantNames}
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
                  />
                </div>

                <div className={cn(
                  "absolute bottom-4 z-20 w-[140px] h-[190px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-bg-dark",
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
                    />
                    <div className="absolute top-3 right-3 flex flex-col gap-2">
                      <button
                        onClick={() => {
                          setMobilePrimaryIdentity(mobileSecondaryTrack.participant.identity);
                        }}
                        className="px-2 py-1 rounded-full bg-black/70 text-white text-[11px] font-semibold hover:bg-black/90 transition-all"
                      >
                        Swap
                      </button>
                      <button
                        onClick={() => setMobileOverlaySide(prev => prev === 'right' ? 'left' : 'right')}
                        className="px-2 py-1 rounded-full bg-black/70 text-white text-[11px] font-semibold hover:bg-black/90 transition-all"
                      >
                        Move
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className="grid gap-2 w-full h-full items-stretch"
                style={{ 
                  gridTemplateColumns: isMobile
                    ? 'repeat(2, minmax(0, 1fr))'
                    : `repeat(auto-fit, minmax(280px, 1fr))`,
                  gridAutoRows: visibleTracks.length === 1 ? '1fr' : 'minmax(180px, 1fr)'
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

        {/* Sidebar Overlay */}
        <AnimatePresence>
          {activeTab && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActiveTab(null)} />
              <motion.div
                initial={{ y: 24, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 24, opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[32px] bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-slate-900 capitalize">{activeTab}</h2>
                  <button onClick={() => setActiveTab(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100">
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scroll">
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
                {activeTab === 'users' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Participants</p>
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                        {remoteParticipants.length + 1}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <ParticipantItem participant={localParticipant} isLocal />
                      {remoteParticipants.map(p => (
                        <ParticipantItem key={p.sid} participant={p} />
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === 'chat' && (
                  <div className="flex flex-col h-full">
                    <div className="flex-1 space-y-4 mb-4 overflow-y-auto custom-scroll pr-2">
                      {chatMessages.length === 0 ? (
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
                      className="flex gap-2 items-center bg-gray-100 rounded-2xl px-4 py-1 border border-gray-300 focus-within:border-blue-400 transition-all"
                    >
                      <input 
                        type="text" 
                        placeholder="Send a message" 
                        className="bg-transparent outline-none flex-1 text-sm text-gray-900 h-12 placeholder:text-gray-500"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                      />
                      <button type="submit" disabled={!chatInput.trim()} className="text-blue-600 p-2 hover:bg-blue-100 rounded-full transition-colors disabled:opacity-30">
                        <Send size={18} />
                      </button>
                    </form>
                  </div>
                )}
                {activeTab === 'waiting' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Waiting Room</p>
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                        {pendingParticipants.length}
                      </span>
                    </div>
                    {pendingParticipants.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-600">
                          <Users size={32} />
                        </div>
                        <p className="text-sm text-gray-600">No one is waiting to join.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingParticipants.map(p => (
                          <div key={p.sid} className="flex items-center justify-between p-3 bg-gray-100 rounded-xl border border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                                {p.identity.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-medium text-gray-900">{p.identity.split('#')[0]}</span>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => admitUser(p)}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-all"
                              >
                                Admit
                              </button>
                              <button className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-all">
                                <UserX size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'settings' && (
                  <div className="space-y-8">
                    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                  <aside className="space-y-3 rounded-[32px] border border-slate-200 bg-slate-50 p-5">
                    <div className="text-sm font-semibold uppercase tracking-wide text-slate-900">Settings</div>
                    {(['video', 'audio', 'general', 'effects'] as const).map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setSettingsCategory(cat)}
                        className={cn(
                          "w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all",
                          settingsCategory === cat ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </aside>
                  <div className="space-y-6 overflow-y-auto max-h-[70vh] pr-1">
                    
                    {settingsCategory === 'video' && (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                            <Camera size={14} /> Camera
                          </label>
                          <select 
                            value={selectedVideoId || videoDevices[0]?.deviceId}
                            onChange={(e) => setSelectedVideoId(e.target.value)}
                            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-xl text-sm outline-none text-gray-900 focus:border-blue-400 transition-all"
                          >
                            {videoDevices.map(device => (
                              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest">Resolution</label>
                          <select 
                            value={selectedResolution}
                            onChange={(e) => setSelectedResolution(e.target.value as any)}
                            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-xl text-sm outline-none text-gray-900 focus:border-blue-400 transition-all"
                          >
                            <option value="360p">Standard (360p)</option>
                            <option value="720p">High Definition (720p)</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-gray-200">
                          <span className="text-sm font-medium text-gray-900">Mirror my video</span>
                          <button onClick={() => setVideoMirroring(!videoMirroring)} className={cn("w-10 h-5 rounded-full transition-colors relative", videoMirroring ? "bg-blue-600" : "bg-gray-300")}>
                            <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm", videoMirroring ? "left-6" : "left-1")} />
                          </button>
                        </div>
                      </div>
                    )}

                    {settingsCategory === 'audio' && (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                            <Mic size={14} /> Microphone
                          </label>
                          <select 
                            value={selectedAudioId || audioDevices[0]?.deviceId}
                            onChange={(e) => setSelectedAudioId(e.target.value)}
                            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-xl text-sm outline-none text-gray-900 focus:border-blue-400 transition-all"
                          >
                            {audioDevices.map(device => (
                              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                            <Speaker size={14} /> Speaker
                          </label>
                          <div className="flex gap-2">
                            <select 
                              value={selectedSpeakerId || speakerDevices[0]?.deviceId}
                              onChange={(e) => setSelectedSpeakerId(e.target.value)}
                              className="flex-1 p-3 bg-gray-100 border border-gray-300 rounded-xl text-sm outline-none text-gray-900 focus:border-blue-400 transition-all"
                            >
                              {speakerDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                              ))}
                            </select>
                            <button 
                              onClick={() => {
                                const audio = new Audio('https://www.soundjay.com/buttons/beep-01a.mp3');
                                if (selectedSpeakerId) {
                                  (audio as any).setSinkId?.(selectedSpeakerId);
                                }
                                audio.play();
                              }}
                              className="px-4 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-300 text-blue-600 text-xs font-bold transition-all"
                            >
                              Test
                            </button>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-gray-200">
                            <span className="text-sm font-medium text-gray-900">Noise Cancellation</span>
                            <button onClick={() => setNoiseCancellation(!noiseCancellation)} className={cn("w-10 h-5 rounded-full transition-colors relative", noiseCancellation ? "bg-blue-600" : "bg-gray-300")}>
                              <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm", noiseCancellation ? "left-6" : "left-1")} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-gray-200">
                            <span className="text-sm font-medium text-gray-900">Echo Cancellation</span>
                            <button onClick={() => setEchoCancellation(!echoCancellation)} className={cn("w-10 h-5 rounded-full transition-colors relative", echoCancellation ? "bg-blue-600" : "bg-gray-300")}>
                              <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm", echoCancellation ? "left-6" : "left-1")} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsCategory === 'effects' && (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                            <Sparkles size={14} /> Visual Effects
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <button 
                              onClick={() => setSelectedBg('none')}
                              className={cn(
                                "aspect-video rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-all",
                                selectedBg === 'none' ? "border-blue-600 bg-blue-100" : "border-gray-300 hover:border-gray-400"
                              )}
                            >
                              <X size={16} />
                              <span className="text-xs text-gray-900">None</span>
                            </button>
                            <button 
                              onClick={() => setSelectedBg('blur')}
                              className={cn(
                                "aspect-video rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-all",
                                selectedBg === 'blur' ? "border-blue-600 bg-blue-100" : "border-gray-300 hover:border-gray-400"
                              )}
                            >
                              <div className="w-6 h-6 rounded-full bg-gray-300 blur-[2px]" />
                              <span className="text-xs text-gray-900">Blur</span>
                            </button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-widest">Background Images</label>
                          <div className="grid grid-cols-2 gap-3">
                            {bgImages.map(img => (
                              <button 
                                key={img.id}
                                onClick={() => {
                                  setSelectedBg('image');
                                  setSelectedBgImage(img.url);
                                }}
                                className={cn(
                                  "relative aspect-video rounded-xl overflow-hidden border-2 transition-all",
                                  selectedBg === 'image' && selectedBgImage === img.url ? "border-blue-600 scale-[1.02]" : "border-transparent hover:border-gray-300"
                                )}
                              >
                                <img src={img.url} alt={img.label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 bg-black/20 flex items-end p-2">
                                  <span className="text-xs font-medium text-white">{img.label}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsCategory === 'general' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-gray-200">
                          <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-900 block">Show clock</span>
                            <span className="text-xs text-gray-600">Display current time in meeting</span>
                          </div>
                          <button onClick={() => setShowClock(!showClock)} className={cn("w-10 h-5 rounded-full transition-colors relative", showClock ? "bg-blue-600" : "bg-gray-300")}>
                            <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm", showClock ? "left-6" : "left-1")} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-gray-200">
                          <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-900 block">Participant names</span>
                            <span className="text-xs text-gray-600">Show names on video tiles</span>
                          </div>
                          <button onClick={() => setShowParticipantNames(!showParticipantNames)} className={cn("w-10 h-5 rounded-full transition-colors relative", showParticipantNames ? "bg-blue-600" : "bg-gray-300")}>
                            <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm", showParticipantNames ? "left-6" : "left-1")} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-gray-200">
                          <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-900 block">Auto-admit users</span>
                            <span className="text-xs text-gray-600">Automatically admit participants from your organization</span>
                          </div>
                          <button className="w-10 h-5 rounded-full bg-gray-300 relative cursor-not-allowed opacity-50">
                            <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-xl border border-gray-200">
                          <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-900 block">Noise reduction (AI)</span>
                            <span className="text-xs text-gray-600">Use Gemini AI to filter background noise</span>
                          </div>
                          <button className="w-10 h-5 rounded-full bg-blue-600 relative">
                            <div className="absolute top-1 left-6 w-3 h-3 bg-white rounded-full" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
      </div>

      {/* Taskbar */}
      <div className="absolute bottom-0 left-0 right-0 h-[80px] flex items-center justify-between px-8 bg-transparent backdrop-blur-sm z-[60]">
        <div className="hidden md:flex items-center gap-4 w-1/3">
          {showClock && (
            <div className="text-white drop-shadow-lg">
              <p className="text-sm font-semibold">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 bg-accent-blue rounded-full animate-pulse" />
                <p className="text-xs text-text-secondary truncate max-w-[150px] font-medium">{room}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 md:gap-4 justify-center w-full md:w-1/3">
          <ControlButton 
            active={localParticipant.isMicrophoneEnabled} 
            onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
            icon={localParticipant.isMicrophoneEnabled ? <Mic size={22} /> : <MicOff size={22} />}
            micVideo={true}
            enabled={localParticipant.isMicrophoneEnabled}
          />
          <ControlButton 
            active={localParticipant.isCameraEnabled} 
            onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
            icon={localParticipant.isCameraEnabled ? <VideoIcon size={22} /> : <VideoOff size={22} />}
            micVideo={true}
            enabled={localParticipant.isCameraEnabled}
          />
          <div className="hidden sm:inline-flex">
            <ControlButton 
              active={isCaptionsEnabled} 
              onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
              icon={<MessageSquare size={22} />}
              highlight={isCaptionsEnabled}
              title="Turn on captions"
            />
          </div>
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
          <div className="relative flex items-center gap-2">
            {/* Reactions Dropdown Button */}
            <div className="relative">
<div className="hidden sm:inline-flex">
              <ControlButton 
                onClick={() => setIsReactionsMenuOpen(!isReactionsMenuOpen)}
                icon={<Smile size={22} />}
                active={isReactionsMenuOpen}
                title="Reactions"
              />
            </div>
              
              {/* Reactions Dropdown Menu */}
              <AnimatePresence>
                {isReactionsMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700 p-4 z-[70]"
                  >
                    <div className="flex items-center gap-2">
                      {['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔'].map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => {
                            sendReaction(emoji);
                            setIsReactionsMenuOpen(false);
                          }}
                          className="w-12 h-12 flex items-center justify-center text-2xl hover:bg-white/10 rounded-lg transition-all active:scale-90"
                          title={`Send ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <ControlButton 
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              icon={<MoreVertical size={22} />}
              active={isMoreMenuOpen}
            />

            <AnimatePresence>
              {isMoreMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-56 bg-surface/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-2 z-[70]"
                >
                  <button 
                    onClick={() => { setLayoutMode('tiled'); setIsMoreMenuOpen(false); setIsReactionsMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm transition-colors",
                      layoutMode === 'tiled' ? "text-accent-blue bg-accent-blue/5" : "text-text-primary"
                    )}
                  >
                    <LayoutIcon size={18} className={layoutMode === 'tiled' ? "text-accent-blue" : "text-text-secondary"} />
                    Tiled layout
                  </button>
                  <button 
                    onClick={() => { setLayoutMode('sidebar'); setIsMoreMenuOpen(false); setIsReactionsMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm transition-colors",
                      layoutMode === 'sidebar' ? "text-accent-blue bg-accent-blue/5" : "text-text-primary"
                    )}
                  >
                    <Monitor size={18} className={layoutMode === 'sidebar' ? "text-accent-blue" : "text-text-secondary"} />
                    Sidebar layout
                  </button>
                  <button 
                    onClick={() => { setHideNonVideo(!hideNonVideo); setIsMoreMenuOpen(false); setIsReactionsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors"
                  >
                    <UserX size={18} className="text-text-secondary" />
                    {hideNonVideo ? "Show non-video participants" : "Hide non-video participants"}
                  </button>
                  <button 
                    onClick={() => { window.open('https://whiteboard.google.com', '_blank'); setIsMoreMenuOpen(false); setIsReactionsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors"
                  >
                    <ArrowLeftRight size={18} className="text-text-secondary" />
                    Whiteboard (Open Jamboard)
                  </button>
                  <div className="h-px bg-white/5 my-2" />
                  <button 
                    onClick={() => { setActiveTab('settings'); setIsMoreMenuOpen(false); setIsReactionsMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors"
                  >
                    <Settings size={18} className="text-text-secondary" />
                    Settings
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="w-[56px] h-[56px] bg-red-600 hover:bg-red-700 text-white rounded-[18px] flex items-center justify-center transition-all shadow-xl shadow-red-500/20 active:scale-95"
          >
            <PhoneOff size={24} />
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 justify-end w-1/3">
          <TabButton active={activeTab === 'info'} onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')} icon={<Info size={22} />} />
          <TabButton active={activeTab === 'users'} onClick={() => setActiveTab(activeTab === 'users' ? null : 'users')} icon={<Users size={22} />} badge={remoteParticipants.length + 1} />
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')} icon={<MessageSquare size={22} />} badge={chatMessages.length > 0 ? chatMessages.length : undefined} />
          {isHost && (
            <TabButton 
              active={activeTab === 'waiting'} 
              onClick={() => setActiveTab(activeTab === 'waiting' ? null : 'waiting')} 
              icon={<ShieldCheck size={22} />} 
              badge={pendingParticipants.length > 0 ? pendingParticipants.length : undefined}
            />
          )}
        </div>
      </div>

      {/* Captions Overlay */}
      {isCaptionsEnabled && (
        <div className="fixed bottom-[100px] left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 pointer-events-none z-50">
          <div className="bg-black/60 backdrop-blur-xl p-4 rounded-2xl border border-white/10 text-center">
            <p className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-1">Captions (Beta)</p>
            <p className="text-white text-lg font-medium">
              {remoteParticipants.some(p => p.isSpeaking) || localParticipant.isSpeaking ? "The speaker is currently talking... (Live captions would appear here)" : "Waiting for speech..."}
            </p>
          </div>
        </div>
      )}

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

function CustomParticipantTile({ trackRef, raisedHands, isPinned, onTogglePin, mirror, showName = true }: any) {
  const isSpeaking = useIsSpeaking(trackRef?.participant);
  const isVideoOff = !trackRef?.publication || trackRef.publication.isMuted || !trackRef.publication.isEnabled;
  const isHandRaised = raisedHands?.[trackRef?.participant.identity];
  
  // Parse metadata for avatar
  const metadata = useMemo(() => {
    try {
      return JSON.parse(trackRef?.participant.metadata || "{}");
    } catch {
      return {};
    }
  }, [trackRef?.participant.metadata]);

  return (
    <div className={cn(
      "group relative w-full h-full rounded-2xl overflow-hidden bg-surface-lighter border-2 transition-all duration-300",
      isSpeaking ? "border-accent-blue shadow-[0_0_20px_rgba(66,133,244,0.4)]" : "border-transparent"
    )}>
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
            className="w-full h-full object-cover" 
          />
        </div>
      )}

      {/* Overlay Info */}
      {showName && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
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

      {/* Pin Button */}
      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={cn(
            "p-2 rounded-lg backdrop-blur-md transition-all",
            isPinned ? "bg-accent-blue text-white" : "bg-black/40 text-white/70 hover:bg-black/60"
          )}
        >
          {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <button className="p-2 rounded-lg bg-black/40 text-white/70 hover:bg-black/60 backdrop-blur-md transition-all">
          <MoreVertical size={16} />
        </button>
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
  const { participant, isLocal } = props;
  return (
    <div className="flex items-center justify-between py-3 px-3 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold border border-blue-200">
          {participant.identity.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">
            {participant.identity.split('#')[0]} {isLocal && "(You)"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!participant.isMicrophoneEnabled ? <MicOff size={14} className="text-accent-red" /> : <Mic size={14} className="text-gray-500" />}
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, icon, danger, warning, highlight, micVideo, enabled, title }: any) {
  return (
    <button 
      onClick={onClick}
      title={title}
      className={cn(
        "w-[56px] h-[56px] rounded-[18px] transition-all duration-200 ease-out flex items-center justify-center flex-shrink-0 shadow-sm shadow-black/10",
        micVideo ? (
          "bg-[#1a2639] text-white hover:bg-slate-700"
        ) : (
          danger && !active ? "bg-red-600 text-white hover:bg-red-700" : 
          warning && active ? "bg-yellow-300 text-slate-900 hover:bg-yellow-400" :
          highlight && active ? "bg-[#1a2639] text-white hover:bg-slate-700" :
          active ? "bg-[#1a2639] text-white hover:bg-slate-700" : "bg-[#1a2639] text-white hover:bg-slate-700"
        )
      )}
    >
      {icon}
    </button>
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
