import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  Check,
  ArrowRight,
  Radio,
  Disc,
  FileText,
  Languages,
  CheckSquare,
  BarChart3,
  Copy,
  Download,
  Loader2,
} from 'lucide-react';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, komuDb, komuAuth } from '../firebase';
import { cn } from '../lib/utils';
import { SendErrorFeedbackButton } from './ErrorFeedbackModal';

interface PostMeetingFeedbackViewProps {
  roomId: string;
  sessionSid?: string;
  meetingTitle?: string;
  user: any;
  transcriptSnapshot?: string;
  participants?: string[];
  initialAiSummary?: string;
  onLogin: () => Promise<void> | void;
  onDone: () => void;
}

const FORUM_FEATURES = [
  {
    icon: Radio,
    title: 'Live Streaming',
    desc: 'Broadcast straight to YouTube, Twitch, or OBS clean feeds.',
  },
  {
    icon: Disc,
    title: 'HD Recording',
    desc: 'Capture full video and audio with active speaker switching.',
  },
  {
    icon: FileText,
    title: 'Presentations & Docs',
    desc: 'Share multi-page PDFs, slides, and stage templates cleanly.',
  },
  {
    icon: Languages,
    title: 'Live Transcripts',
    desc: 'Always-on speaker-attributed transcripts saved cleanly in one file.',
  },
  {
    icon: CheckSquare,
    title: 'Meeting Summary',
    desc: 'End-of-meeting overview of key points, decisions, and action items.',
  },
];

export default function PostMeetingFeedbackView({
  roomId,
  sessionSid = '',
  meetingTitle,
  user,
  transcriptSnapshot = '',
  participants = [],
  initialAiSummary = '',
  onLogin,
  onDone,
}: PostMeetingFeedbackViewProps) {
  const navigate = useNavigate();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [summaryText, setSummaryText] = useState(initialAiSummary);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [savedSummaryToNotes, setSavedSummaryToNotes] = useState(false);

  const activeStar = hoveredRating || rating;
  const isLowRating = rating > 0 && rating < 3;
  const isHighRating = rating >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const displayName =
        user?.displayName ||
        (typeof window !== 'undefined' ? localStorage.getItem('forum_guest_username') : null) ||
        'Guest Participant';

      await addDoc(collection(db, 'meetingFeedback'), {
        category: 'meeting_rating',
        roomId: roomId || 'unknown',
        ...(sessionSid ? { sessionSid } : {}),
        meetingTitle: meetingTitle || `Meeting ${roomId || ''}`.trim(),
        rating,
        comment: comment.trim(),
        userId: user?.uid || 'guest',
        userName: displayName,
        userEmail: user?.email || '',
        isGuest: !user,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
      setIsSubmitted(true);
    } catch (err: any) {
      console.error('[PostMeetingFeedback] Submit error:', err);
      setErrorMsg('Could not save your rating right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateEndSummary = async (formatType: 'summary' | 'action_items' = 'summary') => {
    if (isGeneratingSummary) return;
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      const sourceText =
        transcriptSnapshot.trim() ||
        `Meeting "${meetingTitle || roomId}" wrapped up with participants: ${participants.join(', ') || 'Attendees'}.`;

      const res = await fetch('/api/ai/meeting-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: sourceText,
          meetingTitle: meetingTitle || `Meeting ${roomId}`,
          participants,
          formatType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Could not generate meeting summary (HTTP ${res.status})`);
      }
      const result = data.summary || data.notes || data.result || '';
      if (!result) throw new Error('Summary service returned an empty response.');

      setSummaryText(result);
      try {
        if (roomId) localStorage.setItem(`forum_guest_ai_summary_${roomId}`, result);
      } catch {}

      const activeUid = komuAuth.currentUser?.uid || user?.uid;
      if (activeUid && roomId) {
        const safeRoomKey = roomId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
        const summaryDocId = `summary_${activeUid}_${safeRoomKey}`;
        await setDoc(
          doc(komuDb, 'notes', summaryDocId),
          {
            uid: activeUid,
            title: `Meeting Summary: ${meetingTitle || roomId}`,
            body: result,
            type: 'summary',
            roomId,
            isArchive: false,
            isTrash: false,
            updatedAt: serverTimestamp(),
            color: '#ffffff',
          },
          { merge: true }
        );
        setSavedSummaryToNotes(true);
      }
    } catch (err: any) {
      setSummaryError(err?.message || 'Failed to generate meeting summary.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#FBFBFA] text-slate-900 flex flex-col justify-between px-4 py-5 sm:px-8 sm:py-8 md:p-12 overflow-y-auto">
      {/* Minimal Header */}
      <header className="w-full max-w-3xl mx-auto flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2.5">
          <img src="/forum-logo.png" alt="Komu" className="w-6 h-6 rounded-md object-contain" />
          <span className="text-sm font-semibold text-slate-900 tracking-tight">Komu</span>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="px-3.5 py-2 rounded-xl border border-neutral-200 bg-white hover:border-slate-400 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          {user ? 'Back to Dashboard' : 'Return Home'}
        </button>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl mx-auto my-6 sm:my-10 space-y-5 sm:space-y-6">
        <section className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 truncate">
              {meetingTitle || `Room ${roomId}`}
            </p>
            <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-slate-900">
              {isSubmitted ? 'Thank you for rating this session' : 'How was your meeting?'}
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              {isSubmitted
                ? 'Your rating and notes are saved to session insights.'
                : 'Rate the audio, video, and call reliability.'}
            </p>
          </div>

          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1-5 Star Selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 sm:justify-start" role="radiogroup" aria-label="Meeting rating">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {[1, 2, 3, 4, 5].map((starVal) => {
                      const filled = starVal <= activeStar;
                      return (
                        <button
                          key={starVal}
                          type="button"
                          role="radio"
                          aria-checked={rating === starVal}
                          aria-label={`${starVal} ${starVal === 1 ? 'star' : 'stars'}`}
                          onMouseEnter={() => setHoveredRating(starVal)}
                          onMouseLeave={() => setHoveredRating(0)}
                          onClick={() => setRating(starVal)}
                          className={cn(
                            'w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl border transition-colors duration-150 cursor-pointer shrink-0',
                            filled
                              ? 'bg-stone-100 border-slate-900/30 text-slate-900'
                              : 'bg-white border-neutral-200/80 text-slate-300 hover:border-slate-300 hover:text-slate-500'
                          )}
                        >
                          <Star
                            size={18}
                            className={cn(filled ? 'fill-slate-900 text-slate-900' : 'text-current')}
                          />
                        </button>
                      );
                    })}
                  </div>
                  {rating > 0 && (
                    <span className="text-xs font-mono text-slate-500 tabular-nums whitespace-nowrap shrink-0 sm:ml-2">
                      {rating}/5
                    </span>
                  )}
                </div>

                {/* Contextual Response Message (Clean unboxed text) */}
                {isLowRating && (
                  <div className="pt-1 space-y-0.5 text-sm">
                    <p className="font-medium text-slate-900">We&apos;ll do better next time.</p>
                    <p className="text-xs text-slate-500">
                      Let us know what felt off — audio, connection, controls, or layout.
                    </p>
                  </div>
                )}

                {isHighRating && (
                  <div className="pt-1 space-y-0.5 text-sm">
                    <p className="font-medium text-slate-900">
                      {rating === 5
                        ? 'Glad everything ran smoothly — thank you!'
                        : rating === 4
                          ? 'Glad you had a great session — thanks for the rating.'
                          : 'Thanks for sharing — tell us what we can improve to make it a 5.'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Optional feedback helps shape upcoming releases.
                    </p>
                  </div>
                )}
              </div>

              {/* Feedback Textarea */}
              <div className="space-y-1.5">
                <label htmlFor="post-meeting-feedback-text" className="text-xs font-medium text-slate-700 block">
                  {isLowRating ? 'What could we improve?' : 'Share quick feedback (optional)'}
                </label>
                <textarea
                  id="post-meeting-feedback-text"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    isLowRating
                      ? 'Share what interrupted your call...'
                      : 'Tell us what stood out or what feature you want next...'
                  }
                  className="w-full py-3 px-3.5 border border-neutral-200 bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900/20 focus:border-slate-400 resize-none"
                />
              </div>

              {errorMsg && (
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-rose-700">{errorMsg}</p>
                  <SendErrorFeedbackButton errorMessage={errorMsg} source="Meeting Rating" />
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={onDone}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Skip for now
                </button>

                <button
                  type="submit"
                  disabled={rating < 1 || isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                >
                  {isSubmitting ? 'Saving…' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-5 pt-1">
              <div className="space-y-1.5 border-t border-neutral-100 pt-4">
                <div className="flex items-center gap-2 text-slate-900">
                  <Check size={16} className="text-slate-700 shrink-0" />
                  <p className="text-sm font-medium text-slate-900">
                    Rated <span className="whitespace-nowrap font-mono tabular-nums">{rating}/5</span>{' '}
                    <span className="text-slate-500 font-normal">
                      {isLowRating ? "— We'll do better next time." : '— Saved cleanly.'}
                    </span>
                  </p>
                </div>
                {comment.trim() && (
                  <p className="text-xs text-slate-500 pl-6 break-words">“{comment.trim()}”</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onDone}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap text-center"
                >
                  {user ? 'Go to Dashboard' : 'Back to Home'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/feedback')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:border-slate-400 border border-neutral-200 text-slate-700 text-xs sm:text-sm font-medium transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <BarChart3 size={15} />
                  <span>View Feedback &amp; Stats</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* End-of-Meeting Summary Card */}
        <section className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-base sm:text-lg font-medium text-slate-900 tracking-tight">
              End-of-Meeting Summary
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Generate a structured recap of what was covered, speaker highlights, and concrete action items from your session transcript.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5">
            <button
              type="button"
              disabled={isGeneratingSummary}
              onClick={() => void handleGenerateEndSummary('summary')}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              {isGeneratingSummary && <Loader2 size={13} className="animate-spin" />}
              <span>{summaryText ? 'Regenerate Summary' : 'Summarize Meeting'}</span>
            </button>
            <button
              type="button"
              disabled={isGeneratingSummary}
              onClick={() => void handleGenerateEndSummary('action_items')}
              className="px-4 py-2.5 rounded-xl bg-white hover:border-slate-400 border border-neutral-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center whitespace-nowrap"
            >
              Action Items
            </button>
          </div>

          {summaryError && (
            <div className="p-3.5 rounded-xl bg-stone-50 border border-rose-200/80 flex flex-wrap items-center justify-between gap-2.5">
              <p className="text-xs text-rose-700 leading-snug">{summaryError}</p>
              <SendErrorFeedbackButton errorMessage={summaryError} source="Meeting Summary" />
            </div>
          )}

          {summaryText && (
            <div className="space-y-3 pt-3 border-t border-neutral-200/60">
              <textarea
                rows={8}
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-[#FBFBFA] border border-neutral-200/80 text-xs sm:text-sm text-slate-800 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-slate-900/20"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {savedSummaryToNotes
                    ? 'Saved to your Notes'
                    : 'Ready to copy or download'}
                </span>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(summaryText).catch(() => {});
                      setCopiedSummary(true);
                      setTimeout(() => setCopiedSummary(false), 1800);
                    }}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    {copiedSummary ? <Check size={13} className="text-slate-900" /> : <Copy size={13} />}
                    <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([summaryText], { type: 'text/markdown;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `komu-summary-${Date.now()}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Download size={13} />
                    <span>Download .md</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Guest Feature Prompt Card — shown specifically when user is not signed in */}
        {!user && (
          <section className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-8 space-y-5">
            <div className="space-y-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Explore Komu
              </p>
              <h2 className="text-lg sm:text-xl font-medium tracking-tight text-slate-900">
                Hey, don&apos;t leave yet — try our other features
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Sign in with Google to save every transcript, summary, recording, presentation, and calendar schedule across devices.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FORUM_FEATURES.map((feat) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={feat.title}
                    className="p-3.5 rounded-xl bg-[#FBFBFA] border border-neutral-200/70 flex items-start gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200/80 flex items-center justify-center text-slate-700 shrink-0">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{feat.title}</p>
                      <p className="text-xs text-slate-500 leading-snug mt-0.5">{feat.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void onLogin()}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>Sign in with Google to Try All Features</span>
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/count')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-neutral-200 bg-white hover:border-slate-400 text-slate-700 text-xs sm:text-sm font-medium transition-colors cursor-pointer text-center whitespace-nowrap"
              >
                Meeting Stats
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="w-full max-w-3xl mx-auto text-center">
        <p className="text-xs text-slate-400">Komu Video Conferencing</p>
      </footer>
    </div>
  );
}
