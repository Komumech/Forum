import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, BarChart3, MessageSquare } from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

interface FeedbackItem {
  id: string;
  category?: 'meeting_rating' | 'error_report';
  roomId: string;
  meetingTitle: string;
  errorContext?: string;
  pageUrl?: string;
  rating: number;
  comment: string;
  userName: string;
  isGuest?: boolean;
  createdAt?: any;
  createdAtMs?: number;
}

export default function FeedbackPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | '5' | '4' | '3' | 'low' | 'issues'>('all');

  useEffect(() => {
    const q = query(collection(db, 'meetingFeedback'), orderBy('createdAtMs', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as FeedbackItem[];
        setItems(list);
        setIsLoaded(true);
      },
      (err) => {
        console.warn('[FeedbackPage] snapshot fallback without orderBy:', err);
        const fallbackUnsub = onSnapshot(collection(db, 'meetingFeedback'), (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as FeedbackItem[];
          list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
          setItems(list);
          setIsLoaded(true);
        });
        return () => fallbackUnsub();
      }
    );
    return () => unsub();
  }, []);

  const ratingItems = useMemo(
    () => items.filter((i) => i.category !== 'error_report'),
    [items]
  );

  const issueItems = useMemo(
    () => items.filter((i) => i.category === 'error_report'),
    [items]
  );

  const stats = useMemo(() => {
    const total = ratingItems.length;
    if (total === 0) {
      return { avg: '0.0', total: 0, fiveStarCount: 0, satisfactionPct: 0 };
    }
    const sum = ratingItems.reduce((acc, item) => acc + (Number(item.rating) || 0), 0);
    const fiveStarCount = ratingItems.filter((item) => item.rating === 5).length;
    const positiveCount = ratingItems.filter((item) => item.rating >= 3).length;
    return {
      avg: (sum / total).toFixed(1),
      total,
      fiveStarCount,
      satisfactionPct: Math.round((positiveCount / total) * 100),
    };
  }, [ratingItems]);

  const filteredItems = useMemo(() => {
    if (filterMode === 'all') return items;
    if (filterMode === 'issues') return issueItems;
    if (filterMode === 'low') return ratingItems.filter((i) => i.rating < 3);
    const target = Number(filterMode);
    return ratingItems.filter((i) => i.rating === target);
  }, [items, issueItems, ratingItems, filterMode]);

  const formatTimestamp = (item: FeedbackItem) => {
    const ms =
      item.createdAt?.toMillis?.() ||
      (item.createdAt?.seconds ? item.createdAt.seconds * 1000 : item.createdAtMs);
    if (!ms) return 'Just now';
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-slate-900 p-6 sm:p-10 md:p-12 selection:bg-stone-200">
      {/* Top Minimal Header */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 pb-8 border-b border-neutral-200/70">
        <button
          type="button"
          onClick={() => navigate(user ? '/dashboard' : '/')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft size={16} />
          <span>{user ? 'Back to Dashboard' : 'Home'}</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/stats')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 bg-white hover:border-slate-400 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <BarChart3 size={14} />
            <span>Stats & Count</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 cursor-pointer"
          >
            <img src="/forum-logo.png" alt="Forum" className="w-6 h-6 rounded-md object-contain" />
            <span className="text-sm font-medium text-slate-900 tracking-tight hidden sm:inline">Forum</span>
          </button>
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto py-10 space-y-10">
        {/* Heading */}
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Session Reviews & Issue Reports
          </p>
          <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-slate-900">
            Meeting Ratings &amp; Feedback
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
            Verified post-meeting ratings, participant comments, and reported error feedback across Forum.
          </p>
        </div>

        {/* Summary Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-1.5">
            <span className="text-xs text-slate-500">Average Rating</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-light text-slate-900 tabular-nums">{stats.avg}</span>
              <span className="text-xs text-slate-400">/ 5.0</span>
            </div>
          </div>

          <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-1.5">
            <span className="text-xs text-slate-500">Session Reviews</span>
            <p className="text-3xl font-light text-slate-900 tabular-nums">{stats.total}</p>
          </div>

          <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-1.5">
            <span className="text-xs text-slate-500">Positive (3★+)</span>
            <p className="text-3xl font-light text-slate-900 tabular-nums">{stats.satisfactionPct}%</p>
          </div>

          <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-1.5">
            <span className="text-xs text-slate-500">Issue Reports</span>
            <p className="text-3xl font-light text-slate-900 tabular-nums">{issueItems.length}</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: `All (${items.length})` },
              { id: '5', label: '5 Stars' },
              { id: '4', label: '4 Stars' },
              { id: '3', label: '3 Stars' },
              { id: 'low', label: 'Needs Attention (1–2★)' },
              { id: 'issues', label: `Error Reports (${issueItems.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={cn(
                'px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap',
                filterMode === tab.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-neutral-200 hover:border-slate-400'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Feedback List */}
        {!isLoaded ? (
          <div className="space-y-4">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="h-28 bg-white border border-neutral-200/70 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white border border-neutral-200/80 rounded-2xl p-12 text-center space-y-3">
            <MessageSquare size={28} className="mx-auto text-slate-300" />
            <p className="text-sm font-medium text-slate-800">No feedback matches this filter yet</p>
            <p className="text-xs text-slate-500">
              Ratings submitted after meetings and error reports appear here immediately.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const isErrorReport = item.category === 'error_report';
              const isLow = item.rating < 3;
              return (
                <article
                  key={item.id}
                  className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">
                          {item.userName || 'Guest Participant'}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500 truncate">
                          {item.meetingTitle || `Room ${item.roomId}`}
                        </span>
                        {item.pageUrl && (
                          <>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-xs font-mono text-slate-400">{item.pageUrl}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">
                        {formatTimestamp(item)}
                      </p>
                    </div>

                    {isErrorReport ? (
                      <span className="text-xs font-medium text-rose-700 shrink-0">
                        Issue Report
                      </span>
                    ) : (
                      <div className="flex flex-nowrap items-center gap-1 shrink-0">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={14}
                            className={
                              s <= item.rating
                                ? isLow
                                  ? 'fill-amber-500 text-amber-600 shrink-0'
                                  : 'fill-slate-900 text-slate-900 shrink-0'
                                : 'text-slate-200 shrink-0'
                            }
                          />
                        ))}
                        <span className="ml-1.5 text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap shrink-0">
                          {item.rating}/5
                        </span>
                      </div>
                    )}
                  </div>

                  {item.errorContext && (
                    <p className="text-xs font-mono text-rose-700 bg-rose-50/70 border border-rose-200/70 rounded-xl px-3 py-2 break-words">
                      {item.errorContext}
                    </p>
                  )}

                  {item.comment ? (
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {item.comment}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Rated without written comment</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
