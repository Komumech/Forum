import React, { useState, useEffect } from 'react';
import {
  Layout, Plus, Trash2, ArrowLeft, ArrowRight, Download, Check
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy
} from 'firebase/firestore';
import { cn } from '../lib/utils';

export interface CanvasCard {
  id: string;
  columnId: 'ideas' | 'todo' | 'inprogress' | 'decisions';
  title: string;
  description?: string;
  tag?: string;
  color?: string;
  authorName?: string;
  createdAt: any;
}

interface MeetingCanvasProps {
  roomId?: string;
  userId?: string;
  userName?: string;
  compact?: boolean;
}

const COLUMNS = [
  { id: 'ideas', label: 'Ideas' },
  { id: 'todo', label: 'To Do' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'decisions', label: 'Decisions' },
] as const;

export default function MeetingCanvas({
  roomId,
  userId = 'user',
  userName = 'Member',
  compact = false
}: MeetingCanvasProps) {
  const [cards, setCards] = useState<CanvasCard[]>([]);
  const [selectedCompactColumn, setSelectedCompactColumn] = useState<CanvasCard['columnId']>('ideas');
  const [activeColumnForNew, setActiveColumnForNew] = useState<CanvasCard['columnId'] | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTag, setNewTag] = useState('');
  const [copiedExport, setCopiedExport] = useState(false);

  const collectionPath = roomId ? `rooms/${roomId}/canvas` : `users/${userId}/canvas`;

  useEffect(() => {
    const q = query(collection(db, collectionPath), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as CanvasCard[];
      setCards(items);
    }, (err) => {
      console.warn('[MeetingCanvas] Snapshot notice:', err);
    });
    return () => unsubscribe();
  }, [collectionPath]);

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !activeColumnForNew) return;

    try {
      await addDoc(collection(db, collectionPath), {
        columnId: activeColumnForNew,
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        tag: newTag.trim() || null,
        authorName: userName,
        createdAt: serverTimestamp()
      });
      setNewTitle('');
      setNewDesc('');
      setNewTag('');
      setActiveColumnForNew(null);
    } catch (err) {
      console.error('[MeetingCanvas] Add card error:', err);
    }
  };

  const handleMoveCard = async (cardId: string, currentCol: CanvasCard['columnId'], direction: 'left' | 'right') => {
    const order: CanvasCard['columnId'][] = ['ideas', 'todo', 'inprogress', 'decisions'];
    const idx = order.indexOf(currentCol);
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < order.length) {
      const targetCol = order[targetIdx];
      try {
        await updateDoc(doc(db, collectionPath, cardId), {
          columnId: targetCol
        });
      } catch (err) {
        console.error('[MeetingCanvas] Move error:', err);
      }
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await deleteDoc(doc(db, collectionPath, cardId));
    } catch (err) {
      console.error('[MeetingCanvas] Delete error:', err);
    }
  };

  const handleExportMarkdown = () => {
    const lines = [
      `# Canvas Workspace Export`,
      `Exported: ${new Date().toLocaleString()}`,
      ``
    ];

    COLUMNS.forEach(col => {
      lines.push(`## ${col.label}`);
      const colCards = cards.filter(c => c.columnId === col.id);
      if (colCards.length === 0) {
        lines.push(`_No items_`);
      } else {
        colCards.forEach(c => {
          lines.push(`- **${c.title}**${c.tag ? ` [${c.tag}]` : ''}`);
          if (c.description) lines.push(`  ${c.description}`);
        });
      }
      lines.push(``);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas-board-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  const columnsToRender = compact
    ? COLUMNS.filter(c => c.id === selectedCompactColumn)
    : COLUMNS;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header Bar */}
      <div className="pb-3 border-b border-neutral-200/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layout size={16} className="text-slate-600 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 truncate">
            Canvas Board ({cards.length})
          </h3>
        </div>

        <button
          type="button"
          onClick={handleExportMarkdown}
          className="px-3 py-1.5 bg-white hover:bg-stone-50 border border-neutral-200 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap truncate shrink-0"
        >
          {copiedExport ? <Check size={13} className="text-emerald-700 shrink-0" /> : <Download size={13} className="shrink-0" />}
          <span>{copiedExport ? 'Exported' : 'Export'}</span>
        </button>
      </div>

      {/* Compact Column Selector when inside narrow sidebar */}
      {compact && (
        <div className="grid grid-cols-4 gap-1.5 shrink-0">
          {COLUMNS.map(col => {
            const count = cards.filter(c => c.columnId === col.id).length;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => {
                  setSelectedCompactColumn(col.id);
                  setActiveColumnForNew(null);
                }}
                className={cn(
                  "py-2 px-2 rounded-xl border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate text-center",
                  selectedCompactColumn === col.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-neutral-200/70 hover:border-slate-400"
                )}
              >
                {col.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Board Columns */}
      <div className={cn("flex-1 min-h-0", !compact && "overflow-x-auto pb-2")}>
        <div className={cn(
          "h-full",
          compact ? "flex flex-col" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        )}>
          {columnsToRender.map(col => {
            const columnCards = cards.filter(c => c.columnId === col.id);

            return (
              <div
                key={col.id}
                className={cn(
                  "bg-white rounded-2xl border border-neutral-200/70 p-4 flex flex-col",
                  compact ? "flex-1 min-h-0" : "h-full min-h-[420px]"
                )}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200/60 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-slate-900 truncate">{col.label}</span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {columnCards.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveColumnForNew(activeColumnForNew === col.id ? null : col.id)}
                    className="px-2 py-1 text-slate-800 bg-stone-100 hover:bg-stone-200/70 border border-neutral-200 rounded-lg text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap truncate"
                  >
                    <Plus size={12} className="shrink-0" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Inline Card Creation */}
                {activeColumnForNew === col.id && (
                  <form onSubmit={handleAddCard} className="mb-3 p-3 bg-[#FBFBFA] rounded-xl border border-neutral-200 space-y-2 shrink-0">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Card title..."
                      autoFocus
                      className="w-full py-1.5 px-2.5 bg-white border border-neutral-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                      required
                    />
                    <textarea
                      rows={2}
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Details (optional)..."
                      className="w-full py-1.5 px-2.5 bg-white border border-neutral-200 rounded-lg text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 resize-none"
                    />
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="Tag (optional)"
                      className="w-full py-1.5 px-2.5 bg-white border border-neutral-200 rounded-lg text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                    />
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveColumnForNew(null)}
                        className="px-2.5 py-1 bg-white border border-neutral-200 text-slate-600 rounded-lg text-[11px] font-medium cursor-pointer whitespace-nowrap"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newTitle.trim()}
                        className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                )}

                {/* Cards List */}
                <div className="flex-1 overflow-y-auto divide-y divide-neutral-200/60 custom-scroll pr-0.5">
                  {columnCards.length === 0 && activeColumnForNew !== col.id && (
                    <div className="py-10 text-center text-slate-400 text-xs">
                      No items in {col.label}
                    </div>
                  )}

                  {columnCards.map(card => (
                    <div
                      key={card.id}
                      className="py-3 first:pt-0 space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-slate-900 leading-snug break-words">
                          {card.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          className="opacity-60 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-700 transition-opacity cursor-pointer shrink-0"
                          title="Delete card"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {card.description && (
                        <p className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap">
                          {card.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-0.5">
                        {card.tag ? (
                          <span className="text-[11px] font-medium text-slate-500">
                            #{card.tag}
                          </span>
                        ) : <span />}

                        <div className="flex items-center gap-1">
                          {col.id !== 'ideas' && (
                            <button
                              type="button"
                              onClick={() => handleMoveCard(card.id, card.columnId, 'left')}
                              className="p-1 hover:bg-stone-100 rounded-lg text-slate-500 hover:text-slate-900 cursor-pointer"
                              title="Move to previous stage"
                            >
                              <ArrowLeft size={12} />
                            </button>
                          )}
                          {col.id !== 'decisions' && (
                            <button
                              type="button"
                              onClick={() => handleMoveCard(card.id, card.columnId, 'right')}
                              className="p-1 hover:bg-stone-100 rounded-lg text-slate-500 hover:text-slate-900 cursor-pointer"
                              title="Move to next stage"
                            >
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
