import React, { useState, useEffect } from 'react';
import {
  BarChart2, Plus, CheckCircle2, XCircle, Trash2,
  Award, X, Check
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy
} from 'firebase/firestore';
import { cn } from '../lib/utils';

export interface PollItem {
  id: string;
  type: 'poll' | 'quiz';
  question: string;
  options: string[];
  correctOptionIndex?: number;
  explanation?: string;
  votes: Record<string, number>;
  status: 'active' | 'ended';
  createdBy: string;
  createdAt: any;
}

interface MeetingPollsProps {
  roomId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  isCoHost: boolean;
}

export default function MeetingPolls({
  roomId,
  userId,
  userName,
  isHost,
  isCoHost
}: MeetingPollsProps) {
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [pollType, setPollType] = useState<'poll' | 'quiz'>('poll');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correctIndex, setCorrectIndex] = useState<number>(0);
  const [explanation, setExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManagePolls = isHost || isCoHost;

  useEffect(() => {
    if (!roomId) return;
    const q = query(
      collection(db, 'rooms', roomId, 'polls'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as PollItem[];
      setPolls(items);
    }, (err) => {
      console.warn('[MeetingPolls] Snapshot notice:', err);
    });
    return () => unsubscribe();
  }, [roomId]);

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      const next = options.filter((_, i) => i !== index);
      setOptions(next);
      if (correctIndex >= next.length) {
        setCorrectIndex(0);
      }
    }
  };

  const handleOptionTextChange = (text: string, index: number) => {
    const next = [...options];
    next[index] = text;
    setOptions(next);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'rooms', roomId, 'polls'), {
        type: pollType,
        question: question.trim(),
        options: cleanOptions,
        correctOptionIndex: pollType === 'quiz' ? correctIndex : null,
        explanation: pollType === 'quiz' ? explanation.trim() : null,
        votes: {},
        status: 'active',
        createdBy: userName || 'Host',
        createdAt: serverTimestamp()
      });
      setQuestion('');
      setOptions(['', '']);
      setCorrectIndex(0);
      setExplanation('');
      setIsCreating(false);
    } catch (err) {
      console.error('[MeetingPolls] Create error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (pollId: string, optionIndex: number) => {
    try {
      const pollRef = doc(db, 'rooms', roomId, 'polls', pollId);
      await updateDoc(pollRef, {
        [`votes.${userId}`]: optionIndex
      });
    } catch (err) {
      console.error('[MeetingPolls] Vote error:', err);
    }
  };

  const handleEndPoll = async (pollId: string) => {
    try {
      await updateDoc(doc(db, 'rooms', roomId, 'polls', pollId), {
        status: 'ended'
      });
    } catch (err) {
      console.error('[MeetingPolls] End poll error:', err);
    }
  };

  const handleDeletePoll = async (pollId: string) => {
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'polls', pollId));
    } catch (err) {
      console.error('[MeetingPolls] Delete poll error:', err);
    }
  };

  return (
    <div className="flex flex-col h-full divide-y divide-neutral-200/60">
      {/* Header */}
      <div className="pb-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart2 size={16} className="text-slate-600 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 truncate">
            Polls & Quizzes ({polls.length})
          </h3>
        </div>

        {canManagePolls && !isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate shrink-0"
          >
            <Plus size={13} className="shrink-0" />
            <span>New Poll</span>
          </button>
        )}
      </div>

      {/* Creator Form */}
      {isCreating && canManagePolls && (
        <form onSubmit={handleCreatePoll} className="py-4 space-y-3.5 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900">
              Create {pollType === 'quiz' ? 'Scored Quiz' : 'Live Poll'}
            </span>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPollType('poll')}
              className={cn(
                "py-2 px-3 text-xs font-medium rounded-xl border transition-colors cursor-pointer text-center whitespace-nowrap truncate",
                pollType === 'poll'
                  ? "bg-emerald-50/90 text-emerald-900 border-emerald-600/50"
                  : "bg-white text-slate-600 border-neutral-200 hover:border-slate-400"
              )}
            >
              Standard Poll
            </button>
            <button
              type="button"
              onClick={() => setPollType('quiz')}
              className={cn(
                "py-2 px-3 text-xs font-medium rounded-xl border transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 whitespace-nowrap truncate",
                pollType === 'quiz'
                  ? "bg-emerald-50/90 text-emerald-900 border-emerald-600/50"
                  : "bg-white text-slate-600 border-neutral-200 hover:border-slate-400"
              )}
            >
              <Award size={13} className="shrink-0" />
              <span>Scored Quiz</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={pollType === 'quiz' ? "Enter quiz question..." : "What would you like to ask?"}
              className="w-full py-2.5 px-3.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Options {pollType === 'quiz' && <span className="text-emerald-700 text-[11px]">(Mark correct answer)</span>}
            </label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                {pollType === 'quiz' && (
                  <input
                    type="radio"
                    name="correct-option"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                    className="text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                    title="Mark as correct answer"
                  />
                )}
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => handleOptionTextChange(e.target.value, i)}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 py-2 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                  required
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(i)}
                    className="p-1.5 text-slate-400 hover:text-rose-700 rounded-lg cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}

            {options.length < 6 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium py-1 px-2 rounded-lg hover:bg-stone-100 flex items-center gap-1 cursor-pointer whitespace-nowrap truncate"
              >
                <Plus size={12} className="shrink-0" />
                <span>Add Option</span>
              </button>
            )}
          </div>

          {pollType === 'quiz' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Explanation (Optional)
              </label>
              <input
                type="text"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Briefly explain the correct answer..."
                className="w-full py-2 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
              />
            </div>
          )}

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3.5 py-2 bg-white hover:bg-stone-50 border border-neutral-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer whitespace-nowrap truncate"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !question.trim() || options.filter(o => o.trim()).length < 2}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-xl disabled:opacity-40 cursor-pointer whitespace-nowrap truncate"
            >
              {isSubmitting ? 'Launching...' : 'Launch to Call'}
            </button>
          </div>
        </form>
      )}

      {/* Polls List */}
      <div className="flex-1 overflow-y-auto pt-4 divide-y divide-neutral-200/60 custom-scroll">
        {polls.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            No active polls or quizzes right now.
          </div>
        ) : (
          polls.map(item => {
            const totalVotes = Object.keys(item.votes || {}).length;
            const userVoteIndex = item.votes?.[userId];
            const hasVoted = userVoteIndex !== undefined;
            const isEnded = item.status === 'ended';

            return (
              <div key={item.id} className="py-4 first:pt-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={cn(
                        "font-medium",
                        item.type === 'quiz' ? "text-emerald-800" : "text-slate-600"
                      )}>
                        {item.type === 'quiz' ? 'Quiz' : 'Poll'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className={isEnded ? "text-slate-400" : "text-emerald-700 font-medium"}>
                        {isEnded ? 'Closed' : 'Active'}
                      </span>
                    </div>
                    <h4 className="text-xs font-semibold text-slate-900 leading-snug break-words">
                      {item.question}
                    </h4>
                  </div>

                  {canManagePolls && (
                    <div className="flex items-center gap-1 shrink-0">
                      {!isEnded && (
                        <button
                          type="button"
                          onClick={() => handleEndPoll(item.id)}
                          className="px-2.5 py-1 bg-white hover:bg-stone-50 text-slate-700 border border-neutral-200 hover:border-slate-400 text-[11px] font-medium rounded-lg cursor-pointer whitespace-nowrap truncate"
                        >
                          Close
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeletePoll(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-700 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {item.options.map((optionText, optIdx) => {
                    const voteCount = Object.values(item.votes || {}).filter(v => v === optIdx).length;
                    const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const isSelectedByUser = userVoteIndex === optIdx;
                    const isCorrect = item.type === 'quiz' && item.correctOptionIndex === optIdx;

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        disabled={isEnded}
                        onClick={() => handleVote(item.id, optIdx)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border text-xs font-medium transition-colors relative overflow-hidden flex items-center justify-between gap-3 cursor-pointer disabled:cursor-default bg-white",
                          isSelectedByUser
                            ? "border-emerald-600/60 text-slate-900"
                            : "border-neutral-200/80 text-slate-700 hover:border-slate-400"
                        )}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-emerald-50/70 transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />

                        <div className="relative z-10 flex items-center gap-2.5 min-w-0">
                          <span className={cn(
                            "w-4 h-4 rounded-md border flex items-center justify-center shrink-0",
                            isSelectedByUser
                              ? "border-emerald-700 bg-emerald-700 text-white"
                              : "border-neutral-300 bg-white"
                          )}>
                            {isSelectedByUser && <Check size={10} />}
                          </span>
                          <span className="truncate">{optionText}</span>
                          {isEnded && isCorrect && (
                            <span title="Correct answer" className="text-emerald-700 shrink-0">
                              <CheckCircle2 size={13} />
                            </span>
                          )}
                        </div>

                        <div className="relative z-10 text-[11px] font-mono text-slate-500 shrink-0">
                          {percent}% ({voteCount})
                        </div>
                      </button>
                    );
                  })}
                </div>

                {item.type === 'quiz' && hasVoted && (
                  <div className={cn(
                    "pl-3 border-l-2 py-0.5 text-xs space-y-1",
                    userVoteIndex === item.correctOptionIndex
                      ? "border-emerald-600 text-emerald-800"
                      : "border-amber-500 text-amber-900"
                  )}>
                    <div className="flex items-center gap-1.5 font-medium">
                      {userVoteIndex === item.correctOptionIndex ? (
                        <>
                          <CheckCircle2 size={14} className="text-emerald-700 shrink-0" />
                          <span>Correct answer</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={14} className="text-amber-700 shrink-0" />
                          <span>Correct answer: {item.options[item.correctOptionIndex || 0]}</span>
                        </>
                      )}
                    </div>
                    {item.explanation && (
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {item.explanation}
                      </p>
                    )}
                  </div>
                )}

                <div className="text-[11px] text-slate-400">
                  {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
