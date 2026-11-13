import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';

interface DuplicateSessionModalProps {
  isOpen: boolean;
  onTakeOver: () => void;
  onReturnToDashboard: () => void;
  isReplacedNotice?: boolean;
}

export default function DuplicateSessionModal({
  isOpen,
  onTakeOver,
  onReturnToDashboard,
  isReplacedNotice = false
}: DuplicateSessionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl border border-neutral-200/80 p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl border border-amber-200/60 shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              {isReplacedNotice ? 'Session Switched Elsewhere' : 'Active Session Detected'}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {isReplacedNotice
                ? 'You joined this meeting from another tab or device. This connection has been paused to prevent audio echo and duplicate seats.'
                : 'You are already connected to this meeting on another tab or device. Continue here to move your session cleanly.'}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-200/60 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-stone-50 border border-neutral-200 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap truncate text-center"
          >
            Return to Dashboard
          </button>
          <button
            type="button"
            onClick={onTakeOver}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap truncate text-center"
          >
            {isReplacedNotice ? 'Resume Here' : 'Take Over Session Here'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
