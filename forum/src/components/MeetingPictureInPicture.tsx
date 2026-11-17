import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2 } from 'lucide-react';

export interface MeetingPictureInPictureHandle {
  openPiP: () => Promise<boolean>;
  closePiP: () => Promise<void>;
  togglePiP: () => Promise<void>;
}

interface MeetingPictureInPictureProps {
  activeTrack: TrackReferenceOrPlaceholder | null;
  participantCount: number;
  roomTitle: string;
  isMicEnabled: boolean;
  isCamEnabled: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
  autoPipEnabled: boolean;
  videoMirroring: boolean;
  onPiPStateChange?: (active: boolean) => void;
}

const MeetingPictureInPicture = React.forwardRef<MeetingPictureInPictureHandle, MeetingPictureInPictureProps>(
  (
    {
      activeTrack,
      participantCount,
      roomTitle,
      isMicEnabled,
      isCamEnabled,
      onToggleMic,
      onToggleCam,
      onLeave,
      autoPipEnabled,
      videoMirroring,
      onPiPStateChange,
    },
    ref
  ) => {
    const pipVideoRef = useRef<HTMLVideoElement | null>(null);
    const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const docPipWinRef = useRef<Window | null>(null);
    const docPipVideoElRef = useRef<HTMLVideoElement | null>(null);
    const avatarImgRef = useRef<{ url: string; img: HTMLImageElement } | null>(null);
    const openedAutomaticallyRef = useRef(false);

    const [docPipContainer, setDocPipContainer] = useState<HTMLElement | null>(null);
    const [isPiPActive, setIsPiPActive] = useState(false);

    const activeTrackRef = useRef(activeTrack);
    activeTrackRef.current = activeTrack;
    const participantCountRef = useRef(participantCount);
    participantCountRef.current = participantCount;
    const videoMirroringRef = useRef(videoMirroring);
    videoMirroringRef.current = videoMirroring;
    const isPiPActiveRef = useRef(isPiPActive);
    isPiPActiveRef.current = isPiPActive;

    const updatePiPActive = useCallback(
      (next: boolean) => {
        setIsPiPActive(next);
        onPiPStateChange?.(next);
      },
      [onPiPStateChange]
    );

    const getSpeakerInfo = useCallback((trackRef: TrackReferenceOrPlaceholder | null) => {
      if (!trackRef?.participant) {
        return { name: roomTitle || 'Meeting', avatar: '', isVideoOn: false, isScreen: false, isLocal: false, isMuted: false };
      }
      const rawId = trackRef.participant.identity || 'Participant';
      const name = rawId.split('#')[0] || 'Participant';
      let avatar = '';
      try {
        avatar = JSON.parse(trackRef.participant.metadata || '{}')?.avatar || '';
      } catch {}
      const pub = trackRef.publication;
      const isVideoOn = Boolean(pub && !pub.isMuted && pub.isEnabled && pub.track?.mediaStreamTrack);
      const isScreen = trackRef.source === Track.Source.ScreenShare;
      const isMuted = !trackRef.participant.isMicrophoneEnabled;
      return {
        name: trackRef.participant.isLocal ? `${name} (You)` : name,
        avatar,
        isVideoOn,
        isScreen,
        isLocal: trackRef.participant.isLocal,
        isMuted,
      };
    }, [roomTitle]);

    // Sync active track's MediaStreamTrack into hidden sourceVideoRef (for canvas compositing) & Document PiP video
    useEffect(() => {
      const mediaTrack = activeTrack?.publication?.track?.mediaStreamTrack || null;
      const isLive = Boolean(
        mediaTrack &&
          activeTrack?.publication &&
          !activeTrack.publication.isMuted &&
          activeTrack.publication.isEnabled
      );

      if (sourceVideoRef.current) {
        if (mediaTrack && isLive) {
          sourceVideoRef.current.srcObject = new MediaStream([mediaTrack]);
          sourceVideoRef.current.play().catch(() => {});
        } else {
          sourceVideoRef.current.srcObject = null;
        }
      }

      if (docPipVideoElRef.current) {
        if (mediaTrack && isLive) {
          docPipVideoElRef.current.srcObject = new MediaStream([mediaTrack]);
          docPipVideoElRef.current.play().catch(() => {});
        } else {
          docPipVideoElRef.current.srcObject = null;
        }
      }
    }, [
      activeTrack?.participant?.identity,
      activeTrack?.source,
      activeTrack?.publication?.trackSid,
      activeTrack?.publication?.isMuted,
      activeTrack?.publication?.isEnabled,
      docPipContainer,
    ]);

    // Paint live 640x360 composite frame into canvas -> pipVideoRef (works with video ON or OFF)
    useEffect(() => {
      if (typeof document === 'undefined') return;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      canvasRef.current = canvas;
      const ctx = canvas.getContext('2d');

      const drawFrame = () => {
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        const info = getSpeakerInfo(activeTrackRef.current);

        // Background
        ctx.fillStyle = '#141517';
        ctx.fillRect(0, 0, w, h);

        const srcVid = sourceVideoRef.current;
        if (info.isVideoOn && srcVid && srcVid.readyState >= 2 && srcVid.videoWidth > 0) {
          const vw = srcVid.videoWidth;
          const vh = srcVid.videoHeight;
          const scale = Math.min(w / vw, h / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          const dx = (w - dw) / 2;
          const dy = (h - dh) / 2;

          ctx.save();
          if (info.isLocal && !info.isScreen && videoMirroringRef.current) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(srcVid, w - dx - dw, dy, dw, dh);
          } else {
            ctx.drawImage(srcVid, dx, dy, dw, dh);
          }
          ctx.restore();
        } else {
          // Clean minimalist avatar / initials state
          if (info.avatar && (!avatarImgRef.current || avatarImgRef.current.url !== info.avatar)) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = info.avatar;
            avatarImgRef.current = { url: info.avatar, img };
          }
          const loadedImg = avatarImgRef.current?.url === info.avatar && avatarImgRef.current.img.complete && avatarImgRef.current.img.naturalWidth > 0
            ? avatarImgRef.current.img
            : null;

          const r = 46;
          const cx = w / 2;
          const cy = h / 2 - 12;

          if (loadedImg) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(loadedImg, cx - r, cy - r, r * 2, r * 2);
            ctx.restore();
          } else {
            ctx.fillStyle = '#22252b';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#e2e8f0';
            ctx.font = '500 34px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(info.name.charAt(0).toUpperCase(), cx, cy + 2);
          }
        }

        // Bottom subtle name & participant bar
        const grad = ctx.createLinearGradient(0, h - 76, 0, h);
        grad.addColorStop(0, 'rgba(18,19,22,0)');
        grad.addColorStop(1, 'rgba(18,19,22,0.88)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h - 76, w, 76);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '500 18px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const label = info.isScreen ? `${info.name}'s screen` : info.name;
        ctx.fillText(label.slice(0, 32), 20, h - 26);

        ctx.fillStyle = info.isMuted ? '#fca5a5' : '#86efac';
        ctx.font = '500 14px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'right';
        const statusText = `${info.isMuted ? 'Muted' : 'Live'} · ${participantCountRef.current} in call`;
        ctx.fillText(statusText, w - 20, h - 26);
      };

      drawFrame();

      try {
        const capStream = canvas.captureStream(15);
        streamRef.current = capStream;
        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = capStream;
          pipVideoRef.current.play().catch(() => {});
        }
      } catch {}

      let timerId: number;
      const tick = () => {
        drawFrame();
        const interval = isPiPActiveRef.current || document.visibilityState === 'hidden' ? 66 : 900;
        timerId = window.setTimeout(tick, interval);
      };
      timerId = window.setTimeout(tick, 500);

      return () => {
        window.clearTimeout(timerId);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
    }, [getSpeakerInfo]);

    // Sync autoPictureInPicture attribute on video element
    useEffect(() => {
      if (pipVideoRef.current) {
        try {
          (pipVideoRef.current as any).autoPictureInPicture = autoPipEnabled;
        } catch {}
      }
    }, [autoPipEnabled]);

    const closePiP = useCallback(async () => {
      openedAutomaticallyRef.current = false;
      try {
        if (docPipWinRef.current && !docPipWinRef.current.closed) {
          docPipWinRef.current.close();
        }
      } catch {}
      docPipWinRef.current = null;
      setDocPipContainer(null);

      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        }
      } catch {}

      try {
        const vid = pipVideoRef.current as any;
        if (vid?.webkitPresentationMode === 'picture-in-picture' && typeof vid.webkitSetPresentationMode === 'function') {
          vid.webkitSetPresentationMode('inline');
        }
      } catch {}

      updatePiPActive(false);
    }, [updatePiPActive]);

    const openPiP = useCallback(async (isAutoTrigger = false): Promise<boolean> => {
      // 1. Prefer Document Picture-in-Picture (Google Meet style interactive floating window)
      const docPip = (window as any).documentPictureInPicture;
      if (docPip && typeof docPip.requestWindow === 'function') {
        try {
          if (docPipWinRef.current && !docPipWinRef.current.closed) {
            docPipWinRef.current.focus();
            updatePiPActive(true);
            return true;
          }
          const pipWindow: Window = await docPip.requestWindow({
            width: 340,
            height: 235,
          });
          docPipWinRef.current = pipWindow;
          openedAutomaticallyRef.current = isAutoTrigger;

          // Inject clean minimal stylesheet into Document PiP window
          const styleEl = pipWindow.document.createElement('style');
          styleEl.textContent = `
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            html, body { width: 100%; height: 100%; background: #141517; color: #f8fafc; overflow: hidden; }
            button { cursor: pointer; border: none; outline: none; }
          `;
          pipWindow.document.head.appendChild(styleEl);

          const rootDiv = pipWindow.document.createElement('div');
          rootDiv.style.width = '100%';
          rootDiv.style.height = '100%';
          pipWindow.document.body.appendChild(rootDiv);

          pipWindow.addEventListener('pagehide', () => {
            docPipWinRef.current = null;
            setDocPipContainer(null);
            openedAutomaticallyRef.current = false;
            updatePiPActive(false);
          });

          setDocPipContainer(rootDiv);
          updatePiPActive(true);
          return true;
        } catch {
          // Fall through to standard Video PiP
        }
      }

      // 2. Standard Video Picture-in-Picture (Chrome, Edge, Safari, Firefox, Mobile Chrome/Android)
      const vid = pipVideoRef.current as any;
      if (!vid) return false;

      try {
        await vid.play().catch(() => {});
        if (document.pictureInPictureEnabled && typeof vid.requestPictureInPicture === 'function') {
          if (document.pictureInPictureElement !== vid) {
            await vid.requestPictureInPicture();
          }
          openedAutomaticallyRef.current = isAutoTrigger;
          updatePiPActive(true);
          return true;
        }
        // iOS Safari WebKit PiP fallback
        if (typeof vid.webkitSupportsPresentationMode === 'function' && vid.webkitSupportsPresentationMode('picture-in-picture')) {
          vid.webkitSetPresentationMode('picture-in-picture');
          openedAutomaticallyRef.current = isAutoTrigger;
          updatePiPActive(true);
          return true;
        }
      } catch {
        return false;
      }

      return false;
    }, [updatePiPActive]);

    const togglePiP = useCallback(async () => {
      if (isPiPActiveRef.current) {
        await closePiP();
      } else {
        await openPiP(false);
      }
    }, [closePiP, openPiP]);

    useImperativeHandle(
      ref,
      () => ({
        openPiP: () => openPiP(false),
        closePiP,
        togglePiP,
      }),
      [closePiP, openPiP, togglePiP]
    );

    // Listen to standard Video PiP enter/leave events
    useEffect(() => {
      const vid = pipVideoRef.current;
      if (!vid) return;

      const handleEnter = () => updatePiPActive(true);
      const handleLeave = () => {
        openedAutomaticallyRef.current = false;
        updatePiPActive(false);
      };

      vid.addEventListener('enterpictureinpicture', handleEnter);
      vid.addEventListener('leavepictureinpicture', handleLeave);
      return () => {
        vid.removeEventListener('enterpictureinpicture', handleEnter);
        vid.removeEventListener('leavepictureinpicture', handleLeave);
      };
    }, [updatePiPActive]);

    // Register MediaSession controls & Chromium Automatic PiP on tab switch
    useEffect(() => {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      const ms = navigator.mediaSession as any;

      try {
        if ('MediaMetadata' in window) {
          ms.metadata = new MediaMetadata({
            title: roomTitle || 'Forum Meeting',
            artist: `${participantCount} ${participantCount === 1 ? 'participant' : 'participants'} live`,
            album: 'Forum Live',
          });
        }
      } catch {}

      const safeSetHandler = (action: string, handler: (() => void) | null) => {
        try {
          ms.setActionHandler(action, handler);
        } catch {}
      };

      safeSetHandler('enterpictureinpicture', autoPipEnabled ? () => { void openPiP(true); } : null);
      safeSetHandler('togglemicrophone', onToggleMic);
      safeSetHandler('togglecamera', onToggleCam);
      safeSetHandler('hangup', onLeave);

      try {
        if (typeof ms.setMicrophoneActive === 'function') ms.setMicrophoneActive(isMicEnabled);
        if (typeof ms.setCameraActive === 'function') ms.setCameraActive(isCamEnabled);
      } catch {}

      return () => {
        safeSetHandler('enterpictureinpicture', null);
        safeSetHandler('togglemicrophone', null);
        safeSetHandler('togglecamera', null);
        safeSetHandler('hangup', null);
      };
    }, [autoPipEnabled, isCamEnabled, isMicEnabled, onLeave, onToggleCam, onToggleMic, openPiP, participantCount, roomTitle]);

    // Best-effort Auto-PiP on tab leave & auto-restore when returning to the meeting tab
    useEffect(() => {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (autoPipEnabled && !isPiPActiveRef.current) {
            void openPiP(true);
          }
        } else if (document.visibilityState === 'visible') {
          if (openedAutomaticallyRef.current && isPiPActiveRef.current) {
            void closePiP();
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [autoPipEnabled, closePiP, openPiP]);

    const speakerInfo = getSpeakerInfo(activeTrack);

    return (
      <>
        {/* Offscreen video elements used for live canvas compositing and Video PiP */}
        <video
          ref={sourceVideoRef}
          muted
          playsInline
          autoPlay
          className="fixed w-[2px] h-[2px] opacity-0 pointer-events-none -z-10"
        />
        <video
          ref={pipVideoRef}
          muted
          playsInline
          autoPlay
          className="fixed w-[2px] h-[2px] opacity-0 pointer-events-none -z-10"
        />

        {/* Document PiP Portal (Google-Meet-style floating window with controls) */}
        {docPipContainer &&
          createPortal(
            <div
              style={{
                width: '100%',
                height: '100%',
                background: '#141517',
                color: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Video / Avatar Viewport */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#121316',
                  overflow: 'hidden',
                }}
              >
                {speakerInfo.isVideoOn ? (
                  <video
                    ref={(el) => {
                      docPipVideoElRef.current = el;
                      const mediaTrack = activeTrack?.publication?.track?.mediaStreamTrack;
                      if (el && mediaTrack) {
                        el.srcObject = new MediaStream([mediaTrack]);
                        el.play().catch(() => {});
                      }
                    }}
                    muted
                    playsInline
                    autoPlay
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      transform:
                        speakerInfo.isLocal && !speakerInfo.isScreen && videoMirroring
                          ? 'scaleX(-1)'
                          : 'none',
                    }}
                  />
                ) : speakerInfo.avatar ? (
                  <img
                    src={speakerInfo.avatar}
                    alt={speakerInfo.name}
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: '9999px',
                      objectFit: 'cover',
                      border: '2px solid rgba(255,255,255,0.16)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: '9999px',
                      background: '#22252b',
                      border: '1px solid rgba(255,255,255,0.16)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 500,
                      color: '#f1f5f9',
                    }}
                  >
                    {speakerInfo.name.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Top Overlay Bar */}
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    right: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#f8fafc',
                      background: 'rgba(0,0,0,0.62)',
                      padding: '4px 8px',
                      borderRadius: 8,
                      maxWidth: '72%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {speakerInfo.name} · {participantCount}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      window.focus();
                      void closePiP();
                    }}
                    title="Return to meeting tab"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.62)',
                      color: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Maximize2 size={13} />
                  </button>
                </div>
              </div>

              {/* Bottom Controls Bar */}
              <div
                style={{
                  height: 50,
                  background: '#18191c',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '0 12px',
                }}
              >
                <button
                  type="button"
                  onClick={onToggleMic}
                  title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isMicEnabled ? '#2a2d32' : '#fce8e6',
                    color: isMicEnabled ? '#ffffff' : '#b3261e',
                  }}
                >
                  {isMicEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                </button>

                <button
                  type="button"
                  onClick={onToggleCam}
                  title={isCamEnabled ? 'Turn off camera' : 'Turn on camera'}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isCamEnabled ? '#2a2d32' : '#fce8e6',
                    color: isCamEnabled ? '#ffffff' : '#b3261e',
                  }}
                >
                  {isCamEnabled ? <Video size={15} /> : <VideoOff size={15} />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void closePiP();
                    onLeave();
                  }}
                  title="Leave call"
                  style={{
                    width: 40,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#ea4335',
                    color: '#ffffff',
                  }}
                >
                  <PhoneOff size={15} />
                </button>
              </div>
            </div>,
            docPipContainer
          )}
      </>
    );
  }
);

MeetingPictureInPicture.displayName = 'MeetingPictureInPicture';
export default MeetingPictureInPicture;
