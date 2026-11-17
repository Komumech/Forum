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
  Bot,
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
    desc: 'Capture full video & audio with active speaker switching.',
  },
  {
    icon: FileText,
    title: 'Presentations & Docs',
    desc: 'Share multi-page PDFs, slides & stage templates cleanly.',
  },
  {
    icon: Languages,
    title: 'Live Transcripts',
    desc: 'Always-on speaker-attributed transcripts saved cleanly in one file.',
  },
  {
    icon: Bot,
    title: 'AI Meeting Summary',
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
      if (!result) throw new Error('Gemini returned an empty summary.');

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
            title: `AI Summary: ${meetingTitle || roomId}`,
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
      setSummaryError(err?.message || 'Failed to generate AI summary.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#FBFBFA] text-slate-900 flex flex-col justify-between p-6 sm:p-10 md:p-12 overflow-y-auto">
      {/* Minimal Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2.5">
          <img src="/forum-logo.png" alt="Forum" className="w-6 h-6 rounded-md object-contain" />
          <span className="text-sm font-medium text-slate-900 tracking-tight">Forum</span>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-xl border border-neutral-200 bg-white hover:border-slate-400 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          {user ? 'Back to Dashboard' : 'Return Home'}
        </button>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl mx-auto my-8 space-y-8">
        <section className="bg-white border border-neutral-200/80 rounded-2xl p-6 sm:p-10 space-y-6">
          <div className="space-y-1.5">
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
              {meetingTitle || `Room ${roomId}`}
            </p>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-slate-900">
              {isSubmitted ? 'Thank you for rating this session' : 'How was your meeting?'}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {isSubmitted
                ? 'Your rating and notes are saved to Forum insights.'
                : 'Take a moment to rate the audio, video, and call experience.'}
            </p>
          </div>

          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 1-5 Star Selector */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 sm:gap-3" role="radiogroup" aria-label="Meeting rating">
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
                          'p-2.5 sm:p-3 rounded-xl border transition-colors duration-150 cursor-pointer',
                          filled
                            ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-700'
                            : 'bg-[#FBFBFA] border-neutral-200/80 text-slate-300 hover:border-slate-300 hover:text-slate-400'
                        )}
                      >
                        <Star
                          size={22}
                          className={cn(filled ? 'fill-emerald-600 text-emerald-700' : 'text-current')}
                        />
                      </button>
                    );
                  })}
                  {rating > 0 && (
                    <span className="ml-2 text-xs font-mono text-slate-500 tabular-nums">
                      {rating} / 5
                    </span>
                  )}
                </div>

                {/* Contextual Response Message */}
                {isLowRating && (
                  <div className="p-3.5 rounded-xl bg-stone-50 border border-neutral-200/80 text-sm text-slate-800">
                    <p className="font-medium text-slate-900">We&apos;ll do better next time.</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Tell us what felt off — audio, connection, controls, or workflow — so we can fix it.
                    </p>
                  </div>
                )}

                {isHighRating && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-sm text-emerald-900">
                    <p className="font-medium">
                      {rating === 5
                        ? 'So glad it sounded and ran great — thank you!'
                        : rating === 4
                          ? 'Glad you had a smooth session — thanks for the rating.'
                          : 'Thanks for sharing — we would love to hear how we can make it a 5.'}
                    </p>
                    <p className="text-xs text-emerald-800/80 mt-0.5">
                      Optional feedback helps shape what we refine next.
                    </p>
                  </div>
                )}
              </div>

              {/* Feedback Textarea */}
              <div className="space-y-2">
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
                  className="w-full py-3.5 px-4 border border-neutral-200 bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 resize-none"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/70 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-rose-700">{errorMsg}</p>
                  <SendErrorFeedbackButton errorMessage={errorMsg} source="Meeting Rating" />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={onDone}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Skip for now
                </button>

                <button
                  type="submit"
                  disabled={rating < 1 || isSubmitting}
                  className="px-5 py-3 rounded-xl bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap"
                >
                  {isSubmitting ? 'Saving Rating…' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          ) : (
            <div className="pt-2 space-y-5">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/70">
                <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <Check size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-emerald-950">
                    Rated {rating} / 5 {isLowRating ? "— We'll do better next time." : '— Saved cleanly.'}
                  </p>
                  {comment.trim() && (
                    <p className="text-xs text-emerald-800/80 truncate mt-0.5">“{comment.trim()}”</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onDone}
                  className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  {user ? 'Go to Dashboard' : 'Back to Home'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/feedback')}
                  className="px-4 py-3 rounded-xl bg-white hover:border-slate-400 border border-neutral-200 text-slate-700 text-xs sm:text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <BarChart3 size={15} />
                  <span>View Feedback & Stats</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* End-of-Meeting AI Summary Card */}
        <section className="bg-white border border-neutral-200/80 rounded-2xl p-6 sm:p-10 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Bot size={16} className="text-emerald-700 shrink-0" />
                <h2 className="text-base sm:text-lg font-medium text-slate-900 tracking-tight">
                  End-of-Meeting AI Summary
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-lg">
                Explain what this meeting covered, key speaker highlights, and concrete action items based on the session transcript.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isGeneratingSummary}
                onClick={() => void handleGenerateEndSummary('summary')}
                className="px-4 py-2.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {isGeneratingSummary && <Loader2 size={13} className="animate-spin" />}
                <span>{summaryText ? 'Regenerate Summary' : 'Summarize Meeting'}</span>
              </button>
              <button
                type="button"
                disabled={isGeneratingSummary}
                onClick={() => void handleGenerateEndSummary('action_items')}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:border-slate-400 border border-neutral-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                Action Items
              </button>
            </div>
          </div>

          {summaryError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/70 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-rose-700">{summaryError}</p>
              <SendErrorFeedbackButton errorMessage={summaryError} source="AI Meeting Summary" />
            </div>
          )}

          {summaryText && (
            <div className="space-y-3 pt-3 border-t border-neutral-200/60">
              <textarea
                rows={8}
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                className="w-full p-4 rounded-xl bg-[#FBFBFA] border border-neutral-200/80 text-xs sm:text-sm text-slate-800 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {savedSummaryToNotes
                    ? 'Saved to your Notes as a single summary file'
                    : 'Ready to copy or download'}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(summaryText).catch(() => {});
                      setCopiedSummary(true);
                      setTimeout(() => setCopiedSummary(false), 1800);
                    }}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    {copiedSummary ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
                    <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([summaryText], { type: 'text/markdown;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `forum-summary-${Date.now()}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
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
          <section className="bg-white border border-neutral-200/80 rounded-2xl p-6 sm:p-10 space-y-6">
            <div className="space-y-1.5">
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-700">
                Explore Forum
              </p>
              <h2 className="text-xl sm:text-2xl font-light tracking-tight text-slate-900">
                Hey, don&apos;t leave yet — try our other features
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Sign in with Google to save every transcript, AI summary, recording, presentation, and calendar schedule across devices.
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
                    <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200/80 flex items-center justify-center text-emerald-700 shrink-0">
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

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void onLogin()}
                className="px-5 py-3 rounded-xl bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-xs sm:text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
              >
                <span>Sign in with Google to Try All Features</span>
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/count')}
                className="px-4 py-3 rounded-xl border border-neutral-200 bg-white hover:border-slate-400 text-slate-700 text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Meeting Stats
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="w-full max-w-4xl mx-auto text-center">
        <p className="text-xs text-slate-400">Forum Video Conferencing</p>
      </footer>
    </div>
  );
}
