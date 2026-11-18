import React, { useState, useEffect } from 'react';
import { Users, Play, Square, Check, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import CustomDropdown from './CustomDropdown';

export interface BreakoutRoomConfig {
  id: string;
  name: string;
  participants: string[];
}

interface BreakoutRoomControlsProps {
  isHost: boolean;
  isCoHost: boolean;
  isOpen: boolean;
  rooms: BreakoutRoomConfig[];
  currentRoomId: string | null;
  endsAt?: number | null;
  participants: Array<{ identity: string; name: string }>;
  onStartBreakoutRooms: (rooms: BreakoutRoomConfig[], durationMinutes: number) => Promise<void>;
  onUpdateAssignments?: (rooms: BreakoutRoomConfig[]) => Promise<void>;
  onCloseBreakoutRooms: () => void;
  onJoinRoom: (roomId: string | null) => void;
  onBroadcastMessage: (msg: string) => void;
}

export default function BreakoutRoomControls({
  isHost,
  isCoHost,
  isOpen,
  rooms = [],
  currentRoomId,
  endsAt,
  participants = [],
  onStartBreakoutRooms,
  onUpdateAssignments,
  onCloseBreakoutRooms,
  onJoinRoom,
  onBroadcastMessage
}: BreakoutRoomControlsProps) {
  const [numRooms, setNumRooms] = useState(2);
  const [duration, setDuration] = useState(15);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [customRoomList, setCustomRoomList] = useState<BreakoutRoomConfig[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [remainingText, setRemainingText] = useState<string | null>(null);

  const canManage = isHost || isCoHost;

  useEffect(() => {
    if (!isOpen || !endsAt) {
      setRemainingText(null);
      return;
    }
    const updateTimer = () => {
      const diff = Math.max(0, endsAt - Date.now());
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemainingText(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOpen, endsAt]);

  const buildDefaultRooms = (count: number) => {
    const generated: BreakoutRoomConfig[] = [];
    for (let i = 1; i <= count; i++) {
      generated.push({ id: `breakout-${i}`, name: `Room ${i}`, participants: [] });
    }
    participants.forEach((p, index) => {
      generated[index % count].participants.push(p.identity);
    });
    return generated;
  };

  const handleGenerateRooms = () => {
    setCustomRoomList(buildDefaultRooms(numRooms));
  };

  const handleAssignParticipantDraft = (participantId: string, targetRoomId: string) => {
    const base = customRoomList.length > 0 ? customRoomList : buildDefaultRooms(numRooms);
    const updated = base.map(r => ({
      ...r,
      participants: r.participants.filter(id => id !== participantId)
    }));
    if (targetRoomId !== 'main') {
      const target = updated.find(r => r.id === targetRoomId);
      if (target) target.participants.push(participantId);
    }
    setCustomRoomList(updated);
  };

  const handleReassignLiveParticipant = async (participantId: string, targetRoomId: string) => {
    if (!isHost || !onUpdateAssignments) return;
    const updated = rooms.map(r => ({
      ...r,
      participants: r.participants.filter(id => id !== participantId)
    }));
    if (targetRoomId !== 'main') {
      const target = updated.find(r => r.id === targetRoomId);
      if (target) target.participants.push(participantId);
    }
    await onUpdateAssignments(updated);
  };

  const handleLaunch = async () => {
    const listToLaunch = customRoomList.length > 0 ? customRoomList : buildDefaultRooms(numRooms);
    setIsInitializing(true);
    try {
      await onStartBreakoutRooms(listToLaunch, duration);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSendBroadcast = () => {
    if (!broadcastText.trim()) return;
    onBroadcastMessage(broadcastText.trim());
    setBroadcastText('');
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 2500);
  };

  if (!isHost && !isOpen) {
    return (
      <div className="py-10 px-4 text-center space-y-3">
        <Users size={24} className="mx-auto text-slate-400" />
        <h4 className="text-sm font-medium text-slate-900">Breakout Rooms Not Started</h4>
        <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
          {isCoHost
            ? 'Only the Host can create and launch breakout rooms. Once active, you can switch rooms and broadcast messages.'
            : 'Breakout rooms are not open right now. When the host opens rooms, your room assignment will appear here.'}
        </p>
      </div>
    );
  }

  const activeDraftRooms = customRoomList.length > 0 ? customRoomList : buildDefaultRooms(numRooms);

  return (
    <div className="divide-y divide-neutral-200/60 space-y-5">
      {/* Header */}
      <div className="pb-4 flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Users size={16} className="text-slate-600 shrink-0" />
            <span>Breakout Rooms</span>
          </h3>
          <p className="text-xs text-slate-500">
            {isOpen ? 'Group sessions are currently open' : 'Assign participants into smaller group rooms'}
          </p>
        </div>

        {isOpen && (
          <div className="flex items-center gap-2 shrink-0 text-xs">
            {remainingText && (
              <span className="font-mono text-slate-700 tabular-nums flex items-center gap-1">
                <Clock size={12} className="text-slate-500" />
                {remainingText}
              </span>
            )}
            <span className="font-medium text-emerald-700">Active</span>
          </div>
        )}
      </div>

      {/* Host Setup View (Before Launch) */}
      {!isOpen && isHost && (
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Rooms
              </label>
              <CustomDropdown
                compact
                value={String(numRooms)}
                onChange={(val) => {
                  setNumRooms(Number(val));
                  setCustomRoomList([]);
                }}
                options={[2, 3, 4, 5, 6].map(n => ({
                  value: String(n),
                  label: `${n} Rooms`
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Duration (min)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full min-h-[34px] py-1.5 px-3 bg-white border border-neutral-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">
              Assign Participants ({participants.length})
            </span>
            <button
              type="button"
              onClick={handleGenerateRooms}
              className="text-xs text-slate-700 hover:text-slate-900 font-medium py-1.5 px-3 bg-white hover:bg-stone-50 border border-neutral-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap truncate"
            >
              Auto-Distribute
            </button>
          </div>

          {participants.length > 0 && (
            <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white">
              {participants.map(p => {
                const assigned = activeDraftRooms.find(r => r.participants.includes(p.identity));
                return (
                  <div key={p.identity} className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs">
                    <span className="font-medium text-slate-800 truncate">{p.name}</span>
                    <div className="w-32 shrink-0">
                      <CustomDropdown
                        compact
                        value={assigned?.id || 'main'}
                        onChange={(val) => handleAssignParticipantDraft(p.identity, val)}
                        options={[
                          { value: 'main', label: 'Main Lobby' },
                          ...activeDraftRooms.map(r => ({ value: r.id, label: r.name }))
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={handleLaunch}
            disabled={isInitializing}
            className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap truncate"
          >
            <Play size={14} className="shrink-0" />
            <span>{isInitializing ? 'Opening Rooms...' : 'Open Breakout Rooms'}</span>
          </button>
        </div>
      )}

      {/* Active Breakout Rooms View */}
      {isOpen && (
        <div className="py-4 space-y-5">
          <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white overflow-hidden">
            {/* Main Meeting Lobby */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs">
              <div>
                <span className="font-medium text-slate-900 block">Main Meeting Lobby</span>
                <span className="text-[11px] text-slate-500">General stage</span>
              </div>
              <button
                type="button"
                onClick={() => onJoinRoom(null)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap truncate shrink-0",
                  currentRoomId === null
                    ? "bg-stone-100 text-slate-900 border-neutral-300"
                    : "bg-white hover:bg-stone-50 text-slate-700 border-neutral-200 hover:border-slate-400"
                )}
              >
                {currentRoomId === null ? 'You are here' : 'Join Lobby'}
              </button>
            </div>

            {rooms.map(room => {
              const isCurrent = currentRoomId === room.id;
              return (
                <div key={room.id} className="flex items-center justify-between gap-2 px-4 py-3 text-xs">
                  <div>
                    <span className="font-medium text-slate-900 block">{room.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {room.participants?.length || 0} assigned
                    </span>
                  </div>

                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => onJoinRoom(room.id)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap truncate shrink-0",
                        isCurrent
                          ? "bg-stone-100 text-slate-900 border-neutral-300"
                          : "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                      )}
                    >
                      {isCurrent ? 'You are here' : 'Join Room'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {isCurrent ? 'Your Room' : 'Active'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Host Live Reassignment */}
          {isHost && participants.length > 0 && onUpdateAssignments && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-700 block">Move Participants</span>
              <div className="divide-y divide-neutral-200/60 border border-neutral-200/70 rounded-xl bg-white">
                {participants.map(p => {
                  const assigned = rooms.find(r => r.participants?.includes(p.identity));
                  return (
                    <div key={p.identity} className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs">
                      <span className="text-slate-800 truncate">{p.name}</span>
                      <div className="w-32 shrink-0">
                        <CustomDropdown
                          compact
                          value={assigned?.id || 'main'}
                          onChange={(val) => handleReassignLiveParticipant(p.identity, val)}
                          options={[
                            { value: 'main', label: 'Main Lobby' },
                            ...rooms.map(r => ({ value: r.id, label: r.name }))
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Broadcast Message (Host & Co-host) */}
          {canManage && (
            <div className="pt-2 space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Broadcast to All Rooms
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="Send an announcement to all rooms..."
                  className="flex-1 py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                />
                <button
                  type="button"
                  onClick={handleSendBroadcast}
                  disabled={!broadcastText.trim()}
                  className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-xl cursor-pointer disabled:opacity-40 whitespace-nowrap truncate shrink-0"
                >
                  {broadcastSent ? <Check size={14} /> : 'Broadcast'}
                </button>
              </div>
            </div>
          )}

          {/* Close Breakout Rooms (Host Only) */}
          {isHost && (
            <button
              type="button"
              onClick={onCloseBreakoutRooms}
              className="w-full py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/70 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap truncate"
            >
              <Square size={14} className="shrink-0" />
              <span>Close All Breakout Rooms</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
