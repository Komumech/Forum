import React, { useState, useRef, useEffect } from 'react';
import {
  Video, Monitor, Square, Play, Pause, Download,
  Check, RefreshCw, X, AlertCircle, Save, Trash2
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection, addDoc, serverTimestamp, query, where,
  onSnapshot, deleteDoc, doc
} from 'firebase/firestore';
import { cn } from '../lib/utils';
import { makeWebmSeekable } from '../utils/webmFixer';
import { SendErrorFeedbackButton } from './ErrorFeedbackModal';

interface SavedClip {
  id: string;
  title: string;
  durationSeconds: number;
  type: 'screen' | 'camera';
  userName?: string;
  createdAt?: any;
}

interface ClipsBasicProps {
  userId?: string;
  userName?: string;
  onClose?: () => void;
}

export default function ClipsBasic({
  userId = 'guest',
  userName = 'User',
  onClose
}: ClipsBasicProps) {
  const isScreenCaptureAllowed = React.useMemo(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return false;
    try {
      const policy = (document as any).permissionsPolicy || (document as any).featurePolicy;
      if (policy && typeof policy.allowsFeature === 'function') {
        return Boolean(policy.allowsFeature('display-capture'));
      }
    } catch {}
    return true;
  }, []);

  const [screenBlockedByPolicy, setScreenBlockedByPolicy] = useState(!isScreenCaptureAllowed);
  const [sourceMode, setSourceMode] = useState<'screen' | 'camera'>(() => (isScreenCaptureAllowed ? 'screen' : 'camera'));
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [clipTitle, setClipTitle] = useState(`Clip ${new Date().toLocaleDateString()}`);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedClips, setSavedClips] = useState<SavedClip[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const recordedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    recordedUrlRef.current = recordedUrl;
  }, [recordedUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
    };
  }, []);

  // Real-time saved clips library
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'clips'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as SavedClip[];
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
      setSavedClips(list);
    }, (err) => {
      console.warn('[ClipsBasic] Library snapshot notice:', err);
    });
    return () => unsubscribe();
  }, [userId]);

  const startRecording = async () => {
    setError(null);
    setSavedNotice(false);
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    chunksRef.current = [];
    setRecordingSeconds(0);

    try {
      let stream: MediaStream;
      if (sourceMode === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioTrack = micStream.getAudioTracks()[0];
          if (audioTrack) stream.addTrack(audioTrack);
        } catch {
          // Optional mic track
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopRecording();
        };
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1_800_000,
        audioBitsPerSecond: 128_000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      const recStartMs = Date.now();
      recorder.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, { type: 'video/webm' });
        const fullBlob = await makeWebmSeekable(rawBlob, Date.now() - recStartMs);
        const url = URL.createObjectURL(fullBlob);
        setRecordedBlob(fullBlob);
        setRecordedUrl(url);
        setIsRecording(false);
        setIsPaused(false);
        if (timerRef.current) clearInterval(timerRef.current);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);

      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      const rawMessage = String(err?.message || '');
      const isPolicyBlocked =
        rawMessage.toLowerCase().includes('display-capture') ||
        rawMessage.toLowerCase().includes('permissions policy') ||
        (sourceMode === 'screen' && err?.name === 'NotAllowedError' && rawMessage.toLowerCase().includes('disallowed'));

      if (isPolicyBlocked) {
        setScreenBlockedByPolicy(true);
        setSourceMode('camera');
        setError('Screen capture is restricted in this embedded preview. Switched to Camera Message.');
      } else {
        setError(rawMessage || 'Permission denied or media source unavailable');
      }
      setIsRecording(false);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
      } catch {}
      mediaRecorderRef.current.stop();
    }
  };

  const handleDownload = () => {
    if (!recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = `${clipTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveToClips = async () => {
    if (!recordedBlob || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await addDoc(collection(db, 'clips'), {
        title: clipTitle.trim() || 'Untitled Clip',
        userId,
        userName,
        durationSeconds: recordingSeconds,
        createdAt: serverTimestamp(),
        type: sourceMode
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save clip record');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSavedClip = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'clips', id));
    } catch (err) {
      console.warn('[ClipsBasic] Delete error:', err);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="divide-y divide-neutral-200/60 space-y-6">
      <div className="pb-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Video size={16} className="text-slate-700 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Video Recorder
              </h3>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200/70 rounded-xl text-rose-700 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
            <SendErrorFeedbackButton errorMessage={error} source="Video Clips" />
          </div>
        )}

        {savedNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200/70 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <Check size={14} className="shrink-0" />
            <span>Clip saved to your library.</span>
          </div>
        )}

        {/* Mode Selection */}
        {!isRecording && !recordedUrl && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={screenBlockedByPolicy}
                onClick={() => !screenBlockedByPolicy && setSourceMode('screen')}
                className={cn(
                  "p-3.5 rounded-xl border text-left transition-colors space-y-1 bg-white",
                  screenBlockedByPolicy
                    ? "border-neutral-200/70 text-slate-400 bg-stone-50/70 cursor-not-allowed"
                    : sourceMode === 'screen'
                      ? "border-emerald-600/60 bg-emerald-50/40 text-slate-900 cursor-pointer"
                      : "border-neutral-200 text-slate-600 hover:border-slate-400 cursor-pointer"
                )}
              >
                <div className="flex items-center gap-2">
                  <Monitor size={15} className="shrink-0" />
                  <span className="text-xs font-semibold">Screen Recording</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {screenBlockedByPolicy ? 'Restricted in embedded preview' : 'Screen or window'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('camera')}
                className={cn(
                  "p-3.5 rounded-xl border text-left transition-colors cursor-pointer space-y-1 bg-white",
                  sourceMode === 'camera'
                    ? "border-emerald-600/60 bg-emerald-50/40 text-slate-900"
                    : "border-neutral-200 text-slate-600 hover:border-slate-400"
                )}
              >
                <div className="flex items-center gap-2">
                  <Video size={15} className="shrink-0" />
                  <span className="text-xs font-semibold">Camera Message</span>
                </div>
                <p className="text-[11px] text-slate-500">Webcam & microphone</p>
              </button>
            </div>

            <button
              type="button"
              onClick={startRecording}
              className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap truncate"
            >
              <Video size={14} className="shrink-0" />
              <span>Start Recording Clip</span>
            </button>
          </div>
        )}

        {/* Active Recording */}
        {isRecording && (
          <div className="p-6 bg-white rounded-2xl border border-neutral-200/80 text-center space-y-4">
            <div className="flex items-center justify-center gap-2.5">
              <span className={cn("text-xs font-medium", isPaused ? "text-amber-700" : "text-rose-600")}>
                {isPaused ? 'Paused' : 'Recording'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-base font-mono font-medium text-slate-900 tabular-nums">
                {formatTime(recordingSeconds)}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Capturing {sourceMode === 'screen' ? 'screen' : 'camera'} feed
            </p>

            <div className="flex items-center justify-center gap-2 pt-1">
              {isPaused ? (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="px-4 py-2 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-800 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate"
                >
                  <Play size={13} className="shrink-0" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="px-4 py-2 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-800 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate"
                >
                  <Pause size={13} className="shrink-0" />
                  <span>Pause</span>
                </button>
              )}

              <button
                type="button"
                onClick={stopRecording}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate"
              >
                <Square size={13} className="shrink-0" />
                <span>Finish Recording</span>
              </button>
            </div>
          </div>
        )}

        {/* Review Recorded Clip */}
        {recordedUrl && !isRecording && (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-neutral-200/80 bg-[#141517] aspect-video max-h-72 flex items-center justify-center">
              <video
                ref={videoPreviewRef}
                src={recordedUrl}
                controls
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={clipTitle}
                onChange={(e) => setClipTitle(e.target.value)}
                className="flex-1 py-2.5 px-3.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
              />
              <span className="text-xs font-mono text-slate-500 shrink-0">
                {formatTime(recordingSeconds)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (recordedUrl) URL.revokeObjectURL(recordedUrl);
                  setRecordedUrl(null);
                  setRecordedBlob(null);
                }}
                className="px-3.5 py-2 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-700 text-xs font-medium rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate"
              >
                <RefreshCw size={13} className="shrink-0" />
                <span>Record New</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveToClips}
                  disabled={isSaving}
                  className="px-3.5 py-2 bg-emerald-50/90 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 text-xs font-medium rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate disabled:opacity-50"
                >
                  <Save size={13} className="shrink-0" />
                  <span>{isSaving ? 'Saving...' : 'Save Clip'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate"
                >
                  <Download size={13} className="shrink-0" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Saved Clips Library */}
      <div className="pt-5 space-y-3">
        <h4 className="text-xs font-semibold text-slate-900">
          Saved Clips ({savedClips.length})
        </h4>
        {savedClips.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">
            Saved clips will appear in your library here.
          </p>
        ) : (
          <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white overflow-hidden">
            {savedClips.map(clip => (
              <div key={clip.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-medium text-slate-900 truncate">{clip.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {clip.type === 'screen' ? 'Screen Recording' : 'Camera Message'} · {formatTime(clip.durationSeconds || 0)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSavedClip(clip.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Delete clip record"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
