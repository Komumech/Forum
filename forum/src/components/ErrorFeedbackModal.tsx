import React, { useEffect, useState } from 'react';
import { X, Check, AlertCircle, MessageSquarePlus } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export interface ErrorFeedbackDetail {
  errorMessage: string;
  source?: string;
}

const ERROR_FEEDBACK_EVENT = 'forum-open-error-feedback';

export function triggerErrorFeedback(errorMessage: string, source?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ErrorFeedbackDetail>(ERROR_FEEDBACK_EVENT, {
      detail: { errorMessage, source },
    })
  );
}

export function SendErrorFeedbackButton({
  errorMessage,
  source,
  className = '',
  variant = 'light',
}: {
  errorMessage: string;
  source?: string;
  className?: string;
  variant?: 'light' | 'dark';
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        triggerErrorFeedback(errorMessage, source);
      }}
      className={
        variant === 'dark'
          ? `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${className}`
          : `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-stone-50 border border-rose-200/80 text-rose-800 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${className}`
      }
    >
      <MessageSquarePlus size={12} />
      <span>Send feedback</span>
    </button>
  );
}

export function ErrorFeedbackModal() {
  const { user } = useAuth();
  const [detail, setDetail] = useState<ErrorFeedbackDetail | null>(null);
  const [comment, setComment] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<ErrorFeedbackDetail>;
      if (!custom.detail) return;
      setDetail(custom.detail);
      setComment('');
      setSentSuccess(false);
      setSubmitError(null);
    };
    window.addEventListener(ERROR_FEEDBACK_EVENT, handler);
    return () => window.removeEventListener(ERROR_FEEDBACK_EVENT, handler);
  }, []);

  if (!detail) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setSubmitError(null);
    try {
      const displayName =
        user?.displayName ||
        (typeof window !== 'undefined' ? localStorage.getItem('forum_guest_username') : null) ||
        'Forum User';

      await addDoc(collection(db, 'meetingFeedback'), {
        category: 'error_report',
        roomId: detail.source || 'app',
        meetingTitle: detail.source ? `Issue: ${detail.source}` : 'App Error Report',
        errorContext: detail.errorMessage,
        rating: 1,
        comment: comment.trim() || `Reported error: ${detail.errorMessage}`,
        userId: user?.uid || 'guest',
        userName: displayName,
        userEmail: user?.email || '',
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : '',
        isGuest: !user,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
      setSentSuccess(true);
      setTimeout(() => {
        setDetail(null);
        setSentSuccess(false);
      }, 1500);
    } catch (err: any) {
      console.error('[ErrorFeedbackModal] Failed to submit:', err);
      setSubmitError('Could not submit right now. Please check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setDetail(null)}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl border border-neutral-200/80 shadow-xl p-6 sm:p-7 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Send error feedback
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Share what happened so we can resolve this issue quickly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/70 text-xs text-rose-800 space-y-1">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle size={13} className="shrink-0" />
            <span>{detail.source ? `Error in ${detail.source}` : 'Error details'}</span>
          </div>
          <p className="text-[11px] text-rose-700 break-words leading-relaxed">
            {detail.errorMessage}
          </p>
        </div>

        {sentSuccess ? (
          <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 text-xs flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <Check size={13} />
            </div>
            <span className="font-medium">Feedback sent — thank you.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="error-feedback-notes" className="text-xs font-medium text-slate-700 block">
                What were you trying to do? (optional)
              </label>
              <textarea
                id="error-feedback-notes"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add any extra context..."
                className="w-full py-3 px-3.5 bg-white border border-neutral-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 resize-none"
              />
            </div>

            {submitError && (
              <p className="text-xs text-rose-600">{submitError}</p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="px-4 py-2.5 rounded-xl border border-neutral-200 bg-white hover:border-slate-400 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isSending ? 'Sending…' : 'Send Feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
