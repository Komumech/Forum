import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
  RoomAudioRenderer,
  TrackReferenceOrPlaceholder,
  useRemoteParticipants,
  useLocalParticipant,
} from '@livekit/components-react';
import { Track, Participant } from 'livekit-client';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { StageMediaOverlayRenderer, StageOverlayState } from '../components/StreamMediaOverlay';
import { SendErrorFeedbackButton } from '../components/ErrorFeedbackModal';

const ISOLATED_TRACK_SOURCES = [
  { source: Track.Source.Camera, withPlaceholder: true },
  { source: Track.Source.ScreenShare, withPlaceholder: false },
];

export default function IsolatedFeed() {
  const { room, identity } = useParams<{ room: string; identity: string }>();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');
  const fitMode = searchParams.get('fit') === 'contain' ? 'object-contain' : 'object-cover';
  const showInfo = searchParams.get('info') === 'true';

  const [livekitToken, setLivekitToken] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isTokenValid, setIsTokenValid] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stageOverlay, setStageOverlay] = useState<StageOverlayState | null>(null);

  const decodedIdentity = useMemo(() => {
    return identity ? decodeURIComponent(identity) : '';
  }, [identity]);

  // Listen for live stage media / template updates for this room
  useEffect(() => {
    if (!room) return;
    return onSnapshot(doc(db, 'rooms', room), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStageOverlay(data?.stageOverlay || null);
      }
    }, () => {});
  }, [room]);

  // Listen to Firestore to verify token revocation status if a token was supplied
  useEffect(() => {
    if (!room || !tokenParam) {
      setIsTokenValid(true);
      return;
    }

    const q = query(
      collection(db, 'rooms', room, 'feedExports'),
      where('token', '==', tokenParam)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        // If specific token not found, check if room allows open feeds or if token is revoked
        setIsTokenValid(false);
      } else {
        const docData = snapshot.docs[0].data();
        setIsTokenValid(docData.active !== false);
      }
    }, (err) => {
      console.warn('[IsolatedFeed] Could not verify export token with Firestore:', err);
      // Fall back to allowing feed if Firestore rules or offline
      setIsTokenValid(true);
    });

    return () => unsubscribe();
  }, [room, tokenParam]);

  // Obtain subscriber-only LiveKit token
  useEffect(() => {
    if (!room || !decodedIdentity) return;

    let isMounted = true;
    const fetchToken = async () => {
      try {
        setIsLoading(true);
        const viewerIdentity = `OBS_Viewer_${Math.random().toString(36).substring(2, 9)}`;
        const meta = JSON.stringify({ isObsViewer: true, target: decodedIdentity });
        
        let tokenData: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(
              `/api/get-participant-token?room=${encodeURIComponent(room)}&username=${encodeURIComponent(viewerIdentity)}&metadata=${encodeURIComponent(meta)}&subscriberOnly=true`,
              { cache: 'no-store' }
            );

            if (res.ok) {
              tokenData = await res.json();
              if (tokenData?.token) break;
            } else {
              const postRes = await fetch('/api/get-participant-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  room,
                  username: viewerIdentity,
                  metadata: meta,
                  subscriberOnly: true
                })
              });
              if (postRes.ok) {
                tokenData = await postRes.json();
                if (tokenData?.token) break;
              }
            }
          } catch (err) {
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 500 * attempt));
            }
          }
        }

        if (!tokenData?.token) {
          throw new Error('Failed to generate viewer token from conference server');
        }

        if (isMounted) {
          setLivekitToken(tokenData.token);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('[IsolatedFeed] Token Error:', err);
          setError(err.message || 'Failed to connect to isolated feed');
          setIsLoading(false);
        }
      }
    };

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [room, decodedIdentity]);

  if (!isTokenValid) {
    return (
      <div className="w-screen h-screen bg-black text-slate-400 flex flex-col items-center justify-center p-6 text-center font-mono select-none gap-3">
        <div className="w-3 h-3 bg-red-500 rounded-full" />
        <p className="text-sm uppercase tracking-wider text-slate-300 font-semibold">Feed Token Revoked</p>
        <p className="text-xs text-slate-500">This isolated broadcast link has been deactivated by the meeting host.</p>
        <SendErrorFeedbackButton variant="dark" errorMessage="Isolated feed token revoked" source="Isolated Feed" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-screen h-screen bg-black text-slate-400 flex flex-col items-center justify-center p-6 text-center font-mono select-none gap-3">
        <div className="w-3 h-3 bg-yellow-500 rounded-full" />
        <p className="text-sm uppercase tracking-wider text-slate-300 font-semibold">Feed Error</p>
        <p className="text-xs text-slate-500">{error}</p>
        <SendErrorFeedbackButton variant="dark" errorMessage={error} source="Isolated Feed" />
      </div>
    );
  }

  if (isLoading || !livekitToken) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
      </div>
    );
  }

  const serverUrl = import.meta.env.VITE_LIVEKIT_URL || 'https://forum-xchlx8up.livekit.cloud';

  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white relative select-none">
      <LiveKitRoom
        token={livekitToken}
        serverUrl={serverUrl}
        connect={true}
        audio={true}
        video={false}
        className="w-full h-full"
      >
        <IsolatedParticipantRenderer
          targetIdentity={decodedIdentity}
          fitMode={fitMode}
          showInfo={showInfo}
          stageOverlay={stageOverlay}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

function IsolatedParticipantRenderer({
  targetIdentity,
  fitMode,
  showInfo,
  stageOverlay,
}: {
  targetIdentity: string;
  fitMode: string;
  showInfo: boolean;
  stageOverlay: StageOverlayState | null;
}) {
  const tracks = useTracks(ISOLATED_TRACK_SOURCES);

  const remoteParticipants = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();

  // Find the track for the target participant
  const targetTrack = useMemo(() => {
    // 1. Try exact identity match on track
    const exact = tracks.find(
      (t) => t.participant.identity === targetIdentity
    );
    if (exact) return exact;

    // 2. Try normalized identity match (without hash)
    const baseTarget = targetIdentity.split('#')[0].toLowerCase();
    const fuzzy = tracks.find(
      (t) => t.participant.identity.split('#')[0].toLowerCase() === baseTarget
    );
    if (fuzzy) return fuzzy;

    // 3. If there is only one track in the room, use it
    if (tracks.length === 1) return tracks[0];

    return null;
  }, [tracks, targetIdentity]);

  const targetParticipant = useMemo(() => {
    if (targetTrack?.participant) return targetTrack.participant;
    return remoteParticipants.find(
      (p) =>
        p.identity === targetIdentity ||
        p.identity.split('#')[0].toLowerCase() === targetIdentity.split('#')[0].toLowerCase()
    );
  }, [targetTrack, remoteParticipants, targetIdentity]);

  const isVideoOff =
    !targetTrack?.publication ||
    targetTrack.publication.isMuted ||
    !targetTrack.publication.isEnabled;

  const displayName = targetIdentity.split('#')[0];

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {targetTrack && !isVideoOff ? (
        <div className="absolute inset-0 w-full h-full">
          <VideoTrack
            trackRef={targetTrack as any}
            className={`w-full h-full ${fitMode} bg-black`}
          />
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a0c] text-slate-500 font-mono">
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-2xl font-bold text-slate-400 mb-3 border border-slate-700/40">
            {displayName.charAt(0).toUpperCase() || '?'}
          </div>
          <span className="text-sm font-semibold text-slate-300 tracking-wide">{displayName}</span>
          <span className="text-xs text-slate-600 mt-1">Camera is off or feed paused</span>
        </div>
      )}

      {showInfo && (
        <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-mono text-slate-300 z-10 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>OBS Feed: {displayName}</span>
        </div>
      )}

      <StageMediaOverlayRenderer
        overlay={stageOverlay?.broadcastToParticipants === false ? null : stageOverlay}
      />
    </div>
  );
}
