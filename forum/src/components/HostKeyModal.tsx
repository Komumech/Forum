import React, { useState } from 'react';
import { X, Key, Check, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { SendErrorFeedbackButton } from './ErrorFeedbackModal';

interface HostKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClaimHost: (key: string) => Promise<boolean>;
  currentHostName?: string;
}

export default function HostKeyModal({
  isOpen,
  onClose,
  onClaimHost,
  currentHostName
}: HostKeyModalProps) {
  const [hostKey, setHostKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostKey.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const valid = await onClaimHost(hostKey.trim());
      if (valid) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setHostKey('');
        }, 1200);
      } else {
        setError('Incorrect Host Key. Verify the 6-digit code and try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to claim host authority');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        className="w-full max-w-md bg-white rounded-2xl border border-neutral-200/80 p-6 sm:p-8 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-medium text-slate-900 tracking-tight flex items-center gap-2">
              <Key size={17} className="text-emerald-700 shrink-0" />
              <span>Claim Host Role</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Enter the meeting 6-digit Host Key to assume host authority.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {currentHostName && (
          <p className="text-xs text-slate-500 border-t border-neutral-200/60 pt-3">
            Current Host: <span className="font-medium text-slate-800">{currentHostName}</span>
          </p>
        )}

        {success ? (
          <div className="p-4 bg-stone-50 border border-neutral-200/80 rounded-xl text-slate-800 text-xs flex items-center gap-2.5">
            <Check size={16} className="text-slate-900 shrink-0" />
            <span className="font-medium">Host authority granted.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                6-Digit Host Key
              </label>
              <input
                type="text"
                maxLength={6}
                value={hostKey}
                onChange={(e) => {
                  setHostKey(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                placeholder="e.g. 583921"
                autoFocus
                className="w-full py-3 px-4 bg-white border border-neutral-200 rounded-xl text-sm font-mono tracking-widest text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50"
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200/70 rounded-xl text-rose-700 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
                <SendErrorFeedbackButton errorMessage={error} source="Claim Host Key" />
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-white hover:bg-stone-50 border border-neutral-200 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap truncate"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || hostKey.length < 4}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap truncate"
              >
                {isSubmitting ? 'Verifying...' : 'Claim Host'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
