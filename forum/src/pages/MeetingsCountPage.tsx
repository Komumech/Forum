import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Video, Star, ArrowRight } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface SessionWindow {
  sid: string;
  startedAtMs: number;
  lastActiveAtMs: number;
}

interface EventSignal {
  ts: number;
  sessionSid?: string;
}

function toTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// Group unlinked historical timestamps (separated by >25 min gaps) into distinct completed sessions
function countUnmatchedHistoricalClusters(
  events: EventSignal[],
  trackedSessions: SessionWindow[]
): number {
  const trackedSids = new Set(trackedSessions.map((s) => s.sid));
  const unmatchedTimestamps: number[] = [];

  for (const ev of events) {
    if (ev.sessionSid && trackedSids.has(ev.sessionSid)) continue;
    if (!ev.ts || ev.ts <= 0) continue;

    const coveredByTracked = trackedSessions.some(
      (s) =>
        ev.ts >= s.startedAtMs - 5 * 60_000 &&
        ev.ts <= (s.lastActiveAtMs || s.startedAtMs) + 35 * 60_000
    );
    if (!coveredByTracked) {
      unmatchedTimestamps.push(ev.ts);
    }
  }

  if (unmatchedTimestamps.length === 0) return 0;
  unmatchedTimestamps.sort((a, b) => a - b);

  let clusters = 1;
  let clusterAnchor = unmatchedTimestamps[0];
  for (let i = 1; i < unmatchedTimestamps.length; i++) {
    if (unmatchedTimestamps[i] - clusterAnchor > 25 * 60_000) {
      clusters += 1;
    }
    clusterAnchor = unmatchedTimestamps[i];
  }
  return clusters;
}

function DigitalDigitCell({ digit }: { digit: string }) {
  return (
    <div
      className="relative flex items-center justify-center w-12 h-20 sm:w-16 sm:h-28 md:w-20 md:h-32 bg-[#111317] rounded-2xl border border-neutral-800/80 shadow-xs select-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Subtle split-flap hairline divider */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/[0.07]" />
      <span className="font-mono font-medium text-4xl sm:text-6xl md:text-7xl text-[#FBFBFA] tabular-nums tracking-tight leading-none transition-transform duration-150 ease-out">
        {digit}
      </span>
    </div>
  );
}

export default function MeetingsCountPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [targetCount, setTargetCount] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<{ standard: number; pmi: number }>({ standard: 0, pmi: 0 });
  const [displayCount, setDisplayCount] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [ratings, setRatings] = useState<number[]>([]);

  const animatedValRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const meetingRoomIds = new Set<string>();
    const roomDocsMap = new Map<
      string,
      {
        sessionLogs: SessionWindow[];
        sessionCount: number;
        archivedSessionCount: number;
      }
    >();
    const feedbackEventsByRoom = new Map<string, EventSignal[]>();
    const recordingEventsByRoom = new Map<string, EventSignal[]>();
    const noteEventsByRoom = new Map<string, EventSignal[]>();

    let meetingsReady = false;
    let roomsReady = false;

    const recomputeTotal = () => {
      const allRoomIds = new Set<string>([
        ...meetingRoomIds,
        ...roomDocsMap.keys(),
        ...feedbackEventsByRoom.keys(),
        ...recordingEventsByRoom.keys(),
      ]);

      let totalSum = 0;
      let standardTotal = 0;
      let pmiTotal = 0;

      allRoomIds.forEach((roomId) => {
        if (!roomId || roomId === 'unknown') return;
        const roomMeta = roomDocsMap.get(roomId);
        const trackedLogs = roomMeta?.sessionLogs || [];
        const archivedCount = roomMeta?.archivedSessionCount || 0;
        const trackedCount = Math.max(
          roomMeta?.sessionCount || 0,
          trackedLogs.length + archivedCount
        );

        const combinedHistoricalEvents: EventSignal[] = [
          ...(feedbackEventsByRoom.get(roomId) || []),
          ...(recordingEventsByRoom.get(roomId) || []),
          ...(noteEventsByRoom.get(roomId) || []),
        ];

        const unmatchedHistorical = countUnmatchedHistoricalClusters(
          combinedHistoricalEvents,
          trackedLogs
        );

        const countForRoom = Math.max(1, trackedCount + unmatchedHistorical);
        totalSum += countForRoom;
        if (roomId.startsWith('pmi-')) {
          pmiTotal += countForRoom;
        } else {
          standardTotal += countForRoom;
        }
      });

      setTargetCount(totalSum);
      setBreakdown({ standard: standardTotal, pmi: pmiTotal });
      if (meetingsReady || roomsReady) {
        setIsLoaded(true);
      }
    };

    const unsubMeetings = onSnapshot(
      collection(db, 'meetings'),
      (snap) => {
        meetingRoomIds.clear();
        snap.docs.forEach((d) => {
          const data = d.data();
          const key = (typeof data?.roomId === 'string' && data.roomId.trim()) ? data.roomId.trim() : d.id;
          meetingRoomIds.add(key);
        });
        meetingsReady = true;
        recomputeTotal();
      },
      (err) => {
        console.warn('[MeetingsCountPage] meetings snapshot notice:', err);
        meetingsReady = true;
        recomputeTotal();
      }
    );

    const unsubRooms = onSnapshot(
      collection(db, 'rooms'),
      (snap) => {
        roomDocsMap.clear();
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          const rawLogs = data.sessionLogs && typeof data.sessionLogs === 'object' ? data.sessionLogs : {};
          const sessionLogs: SessionWindow[] = Object.entries(rawLogs).map(([sid, val]: [string, any]) => ({
            sid,
            startedAtMs: Number(val?.startedAtMs || 0),
            lastActiveAtMs: Number(val?.lastActiveAtMs || val?.startedAtMs || 0),
          }));
          roomDocsMap.set(d.id, {
            sessionLogs,
            sessionCount: Number(data.sessionCount || 0),
            archivedSessionCount: Number(data.archivedSessionCount || 0),
          });
        });
        roomsReady = true;
        recomputeTotal();
      },
      (err) => {
        console.warn('[MeetingsCountPage] rooms snapshot notice:', err);
        roomsReady = true;
        recomputeTotal();
      }
    );

    const unsubFeedback = onSnapshot(
      collection(db, 'meetingFeedback'),
      (snap) => {
        const list: number[] = [];
        feedbackEventsByRoom.clear();

        snap.docs.forEach((d) => {
          const data = d.data() || {};
          if (data.category === 'error_report') return;

          const r = Number(data.rating || 0);
          if (r >= 1 && r <= 5) {
            list.push(r);
          }

          const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : '';
          if (roomId && roomId !== 'unknown') {
            const ts = toTimestampMs(data.createdAtMs) || toTimestampMs(data.createdAt);
            const arr = feedbackEventsByRoom.get(roomId) || [];
            arr.push({
              ts,
              sessionSid: typeof data.sessionSid === 'string' ? data.sessionSid : undefined,
            });
            feedbackEventsByRoom.set(roomId, arr);
          }
        });

        setRatings(list);
        recomputeTotal();
      },
      (err) => {
        console.warn('[MeetingsCountPage] feedback snapshot notice:', err);
      }
    );

    const unsubRecordings = onSnapshot(
      collection(db, 'recordings'),
      (snap) => {
        recordingEventsByRoom.clear();
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : '';
          if (!roomId) return;
          const ts = toTimestampMs(data.createdAt);
          const arr = recordingEventsByRoom.get(roomId) || [];
          arr.push({
            ts,
            sessionSid: typeof data.sessionSid === 'string' ? data.sessionSid : undefined,
          });
          recordingEventsByRoom.set(roomId, arr);
        });
        recomputeTotal();
      },
      (err) => {
        console.warn('[MeetingsCountPage] recordings snapshot notice:', err);
      }
    );

    const unsubNotes = onSnapshot(
      collection(db, 'notes'),
      (snap) => {
        noteEventsByRoom.clear();
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          if (data.type !== 'transcript' && data.type !== 'summary') return;
          const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : '';
          if (!roomId) return;
          const ts = toTimestampMs(data.createdAt) || toTimestampMs(data.updatedAt);
          const arr = noteEventsByRoom.get(roomId) || [];
          arr.push({ ts });
          noteEventsByRoom.set(roomId, arr);
        });
        recomputeTotal();
      },
      (err) => {
        console.warn('[MeetingsCountPage] notes snapshot notice:', err);
      }
    );

    return () => {
      unsubMeetings();
      unsubRooms();
      unsubFeedback();
      unsubRecordings();
      unsubNotes();
    };
  }, []);

  const ratingSummary = useMemo(() => {
    const total = ratings.length;
    if (total === 0) {
      return { avg: '0.0', total: 0, counts: [0, 0, 0, 0, 0] };
    }
    const sum = ratings.reduce((acc, r) => acc + r, 0);
    const counts = [5, 4, 3, 2, 1].map((star) => ratings.filter((r) => r === star).length);
    return {
      avg: (sum / total).toFixed(1),
      total,
      counts,
    };
  }, [ratings]);

  // Smooth cubic count-up animation whenever targetCount loads or increases
  useEffect(() => {
    if (!isLoaded) return;
    const fromVal = animatedValRef.current;
    const toVal = targetCount;

    if (fromVal === toVal) {
      setDisplayCount(toVal);
      return;
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const durationMs = fromVal === 0 ? 1300 : 520;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = Math.round(fromVal + (toVal - fromVal) * eased);
      animatedValRef.current = nextVal;
      setDisplayCount(nextVal);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        animatedValRef.current = toVal;
        setDisplayCount(toVal);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [targetCount, isLoaded]);

  const paddedDigits = Math.max(0, displayCount)
    .toString()
    .padStart(4, '0')
    .split('');

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-slate-900 flex flex-col justify-between p-6 sm:p-10 md:p-12 selection:bg-stone-200">
      {/* Top Minimal Navigation */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate(user ? '/dashboard' : '/')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors duration-150 cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft size={16} />
          <span>{user ? 'Back to Dashboard' : 'Home'}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2.5 cursor-pointer"
        >
          <img src="/forum-logo.png" alt="Forum" className="w-6 h-6 rounded-md object-contain" />
          <span className="text-sm font-medium text-slate-900 tracking-tight">Forum</span>
        </button>
      </header>

      {/* Center Digital Clock Counter + Live Meeting Ratings Summary */}
      <main className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center text-center py-12 space-y-10">
        <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-slate-900">
          Total Meetings Completed
        </h1>

        <div className="space-y-4">
          <div
            className="flex items-center justify-center gap-2.5 sm:gap-3.5 md:gap-4"
            aria-live="polite"
            aria-label={`Total meetings done: ${displayCount}`}
          >
            {paddedDigits.map((digit, index) => (
              <DigitalDigitCell key={`${index}-${paddedDigits.length}`} digit={digit} />
            ))}
          </div>

          {isLoaded && (
            <p className="text-xs text-slate-400 tabular-nums">
              {breakdown.standard} standard rooms · {breakdown.pmi} PMI sessions
            </p>
          )}
        </div>

        {/* Meeting Ratings Overview Card */}
        <section className="w-full max-w-xl bg-white border border-neutral-200/80 rounded-2xl p-6 sm:p-8 text-left space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Meeting Rating
              </span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-3xl font-light text-slate-900 tabular-nums">
                  {ratingSummary.avg}
                </span>
                <span className="text-xs text-slate-400">/ 5.0</span>
                <div className="flex items-center gap-0.5 ml-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={14}
                      className={
                        s <= Math.round(Number(ratingSummary.avg))
                          ? 'fill-emerald-600 text-emerald-700'
                          : 'text-slate-200'
                      }
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {ratingSummary.total === 0
                  ? 'No ratings recorded yet'
                  : `Based on ${ratingSummary.total} participant ${ratingSummary.total === 1 ? 'review' : 'reviews'}`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/feedback')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:border-slate-400 border border-neutral-200 text-xs font-medium text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>View Feedback</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {ratingSummary.total > 0 && (
            <div className="space-y-2 pt-3 border-t border-neutral-200/60">
              {[5, 4, 3, 2, 1].map((star, idx) => {
                const count = ratingSummary.counts[idx];
                const pct = Math.round((count / ratingSummary.total) * 100);
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-8 font-mono text-slate-500 tabular-nums">{star}★</span>
                    <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-slate-400 tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(user ? '/dashboard' : '/')}
            className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-800 border border-emerald-200/60 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-150 ease-out whitespace-nowrap cursor-pointer"
          >
            <Video size={15} />
            <span>Start a Meeting</span>
          </button>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="w-full max-w-5xl mx-auto text-center">
        <p className="text-xs font-mono text-slate-400 tracking-wider">
          komu-forum.vercel.app/stats
        </p>
      </footer>
    </div>
  );
}
