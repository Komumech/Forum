import React, { useState, useEffect } from 'react';
import {
  ThumbsUp, Send, Check, CheckCircle2,
  HelpCircle, UserCheck, Trash2
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { cn } from '../lib/utils';

export interface QAItem {
  id: string;
  question: string;
  authorName: string;
  authorId: string;
  createdAt: any;
  upvotes: string[];
  answer?: string;
  answeredBy?: string;
  answeredAt?: any;
  isAnsweredLive?: boolean;
  isDismissed?: boolean;
}

interface MeetingQAProps {
  roomId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  isCoHost: boolean;
  selectedAnswerers: string[];
  onUpdateAnswerers?: (answerers: string[]) => Promise<void>;
  participants: Array<{ identity: string; name: string }>;
}

export default function MeetingQA({
  roomId,
  userId,
  userName,
  isHost,
  isCoHost,
  selectedAnswerers = [],
  onUpdateAnswerers,
  participants = []
}: MeetingQAProps) {
  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unanswered' | 'answered'>('all');
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManageAnswerers, setShowManageAnswerers] = useState(false);

  const isAuthorizedAnswerer =
    isHost ||
    isCoHost ||
    selectedAnswerers.includes(userId) ||
    selectedAnswerers.includes(userName);

  useEffect(() => {
    if (!roomId) return;
    const q = query(
      collection(db, 'rooms', roomId, 'qa'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as QAItem[];
      setQuestions(items);
    }, (err) => {
      console.warn('[MeetingQA] Snapshot error:', err);
    });
    return () => unsubscribe();
  }, [roomId]);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'rooms', roomId, 'qa'), {
        question: newQuestionText.trim(),
        authorName: isAnonymous ? 'Anonymous' : (userName || 'Participant'),
        authorId: userId,
        createdAt: serverTimestamp(),
        upvotes: [userId],
        isAnsweredLive: false,
        isDismissed: false
      });
      setNewQuestionText('');
      setIsAnonymous(false);
    } catch (err) {
      console.error('[MeetingQA] Ask error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleUpvote = async (item: QAItem) => {
    try {
      const ref = doc(db, 'rooms', roomId, 'qa', item.id);
      const hasUpvoted = item.upvotes?.includes(userId);
      await updateDoc(ref, {
        upvotes: hasUpvoted ? arrayRemove(userId) : arrayUnion(userId)
      });
    } catch (err) {
      console.error('[MeetingQA] Upvote error:', err);
    }
  };

  const handleSubmitAnswer = async (questionId: string) => {
    if (!answerDraft.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ref = doc(db, 'rooms', roomId, 'qa', questionId);
      await updateDoc(ref, {
        answer: answerDraft.trim(),
        answeredBy: userName || 'Host',
        answeredAt: serverTimestamp(),
        isAnsweredLive: false
      });
      setAnsweringQuestionId(null);
      setAnswerDraft('');
    } catch (err) {
      console.error('[MeetingQA] Answer error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAnsweredLive = async (questionId: string) => {
    try {
      const ref = doc(db, 'rooms', roomId, 'qa', questionId);
      await updateDoc(ref, {
        isAnsweredLive: true,
        answeredBy: userName || 'Host',
        answeredAt: serverTimestamp()
      });
    } catch (err) {
      console.error('[MeetingQA] Mark answered live error:', err);
    }
  };

  const handleDismiss = async (questionId: string) => {
    try {
      const ref = doc(db, 'rooms', roomId, 'qa', questionId);
      await updateDoc(ref, {
        isDismissed: true
      });
    } catch (err) {
      console.error('[MeetingQA] Dismiss error:', err);
    }
  };

  const handleDelete = async (questionId: string) => {
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'qa', questionId));
    } catch (err) {
      console.error('[MeetingQA] Delete error:', err);
    }
  };

  const filteredQuestions = questions.filter(q => {
    if (q.isDismissed && !isAuthorizedAnswerer) return false;
    if (activeFilter === 'answered') return !!q.answer || q.isAnsweredLive;
    if (activeFilter === 'unanswered') return !q.answer && !q.isAnsweredLive;
    return true;
  });

  const sortedQuestions = [...filteredQuestions].sort((a, b) => {
    const votesA = a.upvotes?.length || 0;
    const votesB = b.upvotes?.length || 0;
    return votesB - votesA;
  });

  return (
    <div className="flex flex-col h-full divide-y divide-neutral-200/60">
      {/* Header & Filter Controls */}
      <div className="pb-4 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <HelpCircle size={16} className="text-slate-600 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              Q&A ({questions.length})
            </h3>
            {isAuthorizedAnswerer && !isHost && (
              <span className="text-[11px] font-medium text-emerald-700 shrink-0">
                · Answerer
              </span>
            )}
          </div>

          {isHost && (
            <button
              type="button"
              onClick={() => setShowManageAnswerers(!showManageAnswerers)}
              className="px-2.5 py-1.5 bg-white hover:bg-stone-50 text-slate-700 border border-neutral-200 hover:border-slate-400 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate shrink-0"
            >
              <UserCheck size={13} className="shrink-0" />
              <span>{showManageAnswerers ? 'Done' : 'Answerers'}</span>
            </button>
          )}
        </div>

        {isHost && showManageAnswerers && (
          <div className="p-3 bg-white rounded-xl border border-neutral-200/80 text-xs space-y-2">
            <p className="text-slate-600 leading-relaxed">
              Allow selected participants to answer questions alongside Host & Co-hosts:
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1.5">
              {participants.length === 0 ? (
                <p className="text-slate-400">No other participants in call</p>
              ) : (
                participants.map(p => {
                  const isChecked = selectedAnswerers.includes(p.identity) || selectedAnswerers.includes(p.name);
                  return (
                    <label key={p.identity} className="flex items-center gap-2 text-slate-700 hover:text-slate-900 cursor-pointer select-none py-0.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (!onUpdateAnswerers) return;
                          const next = isChecked
                            ? selectedAnswerers.filter(x => x !== p.identity && x !== p.name)
                            : [...selectedAnswerers, p.identity];
                          onUpdateAnswerers(next);
                        }}
                        className="rounded border-neutral-300 text-emerald-700 focus:ring-0"
                      />
                      <span className="truncate">{p.name || p.identity.split('#')[0]}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: `All (${questions.length})` },
            { id: 'unanswered', label: `Open (${questions.filter(q => !q.answer && !q.isAnsweredLive).length})` },
            { id: 'answered', label: `Answered (${questions.filter(q => !!q.answer || q.isAnsweredLive).length})` }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id as any)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap truncate",
                activeFilter === tab.id
                  ? "bg-emerald-50/90 text-emerald-900 border-emerald-200/80"
                  : "bg-white text-slate-600 border-neutral-200/70 hover:border-slate-400"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ask Question Form */}
      <form onSubmit={handleAskQuestion} className="py-4 space-y-3 shrink-0">
        <textarea
          rows={2}
          value={newQuestionText}
          onChange={(e) => setNewQuestionText(e.target.value)}
          placeholder="Ask a question for the speakers..."
          className="w-full py-3 px-3.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded border-neutral-300 text-emerald-700 focus:ring-0"
            />
            <span>Ask anonymously</span>
          </label>
          <button
            type="submit"
            disabled={!newQuestionText.trim() || isSubmitting}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap truncate shrink-0"
          >
            <Send size={12} className="shrink-0" />
            <span>Post Question</span>
          </button>
        </div>
      </form>

      {/* Questions List */}
      <div className="flex-1 overflow-y-auto pt-4 divide-y divide-neutral-200/60 custom-scroll">
        {sortedQuestions.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            No questions match this filter yet.
          </div>
        ) : (
          sortedQuestions.map(item => {
            const hasUpvoted = item.upvotes?.includes(userId);
            const isAnswering = answeringQuestionId === item.id;

            return (
              <div
                key={item.id}
                className={cn(
                  "py-4 first:pt-0 space-y-2.5",
                  item.isDismissed && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 leading-relaxed break-words">
                      {item.question}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Asked by <span className="text-slate-600 font-medium">{item.authorName}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleUpvote(item)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer shrink-0 whitespace-nowrap",
                      hasUpvoted
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200/80"
                        : "bg-white text-slate-600 border-neutral-200 hover:border-slate-400"
                    )}
                    title="Upvote question"
                  >
                    <ThumbsUp size={12} className={hasUpvoted ? "text-emerald-700" : "text-slate-400"} />
                    <span>{item.upvotes?.length || 0}</span>
                  </button>
                </div>

                {item.answer && (
                  <div className="pl-3 border-l-2 border-emerald-600/50 space-y-1 py-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-800">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>Answered by {item.answeredBy || 'Speaker'}</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {item.answer}
                    </p>
                  </div>
                )}

                {item.isAnsweredLive && !item.answer && (
                  <div className="text-[11px] text-emerald-800 flex items-center gap-1.5">
                    <Check size={13} className="shrink-0" />
                    <span>Answered live on video</span>
                  </div>
                )}

                {(isAuthorizedAnswerer || item.authorId === userId) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {isAuthorizedAnswerer ? (
                      <div className="flex items-center gap-1.5">
                        {!item.answer && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isAnswering) {
                                setAnsweringQuestionId(null);
                              } else {
                                setAnsweringQuestionId(item.id);
                                setAnswerDraft(item.answer || '');
                              }
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-stone-50 text-slate-700 border border-neutral-200 hover:border-slate-400 text-[11px] font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap truncate"
                          >
                            {isAnswering ? 'Cancel' : 'Type Answer'}
                          </button>
                        )}

                        {!item.isAnsweredLive && !item.answer && (
                          <button
                            type="button"
                            onClick={() => handleMarkAnsweredLive(item.id)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70 text-[11px] font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap truncate"
                          >
                            Answer Live
                          </button>
                        )}

                        {!item.isDismissed && (
                          <button
                            type="button"
                            onClick={() => handleDismiss(item.id)}
                            className="px-2 py-1 text-slate-400 hover:text-slate-700 text-[11px] font-medium rounded-lg cursor-pointer whitespace-nowrap truncate"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    ) : <span />}

                    {(isHost || item.authorId === userId) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-700 transition-colors cursor-pointer"
                        title="Delete question"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}

                {isAnswering && (
                  <div className="pt-1 space-y-2">
                    <textarea
                      rows={2}
                      value={answerDraft}
                      onChange={(e) => setAnswerDraft(e.target.value)}
                      placeholder="Write your answer..."
                      className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAnsweringQuestionId(null)}
                        className="px-3 py-1.5 bg-white border border-neutral-200 hover:border-slate-400 text-slate-600 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap truncate"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmitAnswer(item.id)}
                        disabled={!answerDraft.trim() || isSubmitting}
                        className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap truncate"
                      >
                        Publish Answer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
