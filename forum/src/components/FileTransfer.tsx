import * as React from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  FileText, Image as ImageIcon, Film, Music, Archive, Code, FileCode,
  File, Download, Send, Paperclip, X, Check, ArrowDownToLine, Users, User,
  Clock, Shield, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export interface SharedFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  senderIdentity: string;
  senderName: string;
  targetIdentity?: string; // empty means Everyone
  targetName?: string;
  downloadUrl?: string;
  progress: number;
  status: 'sending' | 'receiving' | 'completed' | 'failed';
  timestamp: number;
  isOutgoing: boolean;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileIcon(type: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return <ImageIcon className="text-gray-600" size={20} />;
  }
  if (type.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
    return <Film className="text-gray-600" size={20} />;
  }
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return <Music className="text-gray-600" size={20} />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return <Archive className="text-gray-600" size={20} />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'go', 'rs', 'cpp', 'c', 'java'].includes(ext)) {
    return <FileCode className="text-gray-600" size={20} />;
  }
  if (type.includes('pdf') || ext === 'pdf') {
    return <FileText className="text-gray-600" size={20} />;
  }
  return <File className="text-gray-600" size={20} />;
}

// Dialog for selecting recipient and sending file
interface SendFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Array<{ identity: string; name: string }>;
  defaultRecipient?: string;
  onSendFile: (file: File, targetIdentity?: string, targetName?: string) => Promise<void>;
}

export function SendFileDialog({ isOpen, onClose, participants, defaultRecipient, onSendFile }: SendFileDialogProps) {
  const [selectedRecipient, setSelectedRecipient] = useState<string>(defaultRecipient || 'everyone');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultRecipient) {
      setSelectedRecipient(defaultRecipient);
    }
  }, [defaultRecipient]);

  if (!isOpen) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isSending) return;

    try {
      setIsSending(true);
      const target = selectedRecipient === 'everyone' ? undefined : selectedRecipient;
      const targetUser = participants.find(p => p.identity === target);
      const targetName = targetUser ? targetUser.name : (target ? target.split('#')[0] : undefined);
      
      await onSendFile(selectedFile, target, targetName);
      setSelectedFile(null);
      onClose();
    } catch (err) {
      console.error("Failed to send file", err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden z-10"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-[#1f1f1f]">Send File</h3>
            <p className="text-xs text-gray-500">Direct peer-to-peer file transfer</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-[#1f1f1f] hover:bg-[#f1f3f4] rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Recipient Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700">
              Send to
            </label>
            <div className="relative">
              <select
                value={selectedRecipient}
                onChange={(e) => setSelectedRecipient(e.target.value)}
                className="w-full h-11 bg-[#f8f9fa] border border-gray-300 rounded-xl px-4 text-xs font-medium text-gray-900 focus:bg-white focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all cursor-pointer"
              >
                <option value="everyone">Everyone in this call (Broadcast)</option>
                {participants.map(p => (
                  <option key={p.identity} value={p.identity}>
                    Direct to {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* File Dropzone */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700">
              Select or drop file
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2",
                dragOver ? "border-[#0b57d0] bg-[#f8f9fa]" : "border-gray-300 hover:border-[#0b57d0] bg-[#f8f9fa]",
                selectedFile ? "border-solid border-gray-300 bg-white" : ""
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />

              {selectedFile ? (
                <div className="flex items-center gap-3 w-full p-2">
                  <div className="w-10 h-10 bg-[#f1f3f4] rounded-xl flex items-center justify-center shrink-0 text-gray-700">
                    {getFileIcon(selectedFile.type, selectedFile.name)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{selectedFile.name}</p>
                    <p className="text-[11px] text-gray-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-[#f1f3f4] text-gray-700 flex items-center justify-center mb-1">
                    <Paperclip size={18} />
                  </div>
                  <p className="text-xs font-semibold text-gray-800">
                    Click to browse or drop file here
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Documents, images, slides, code, or archives
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isSending}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-gray-800 border border-gray-300/80 rounded-full font-medium text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              <Send size={14} />
              <span>{isSending ? "Sending..." : "Send"}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// Card for displaying a single shared file
export function SharedFileCard({ file }: { file: SharedFileItem }) {
  const isDirect = !!file.targetIdentity;

  const handleDownload = () => {
    if (!file.downloadUrl) return;
    const a = document.createElement('a');
    a.href = file.downloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="p-3 rounded-2xl border border-gray-200 bg-white space-y-2">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#f1f3f4] flex items-center justify-center shrink-0 text-gray-700">
            {getFileIcon(file.type, file.name)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate" title={file.name}>
              {file.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-500">
              <span>{formatFileSize(file.size)}</span>
              <span>•</span>
              <span className="truncate">
                {file.isOutgoing ? (
                  isDirect ? `To ${file.targetName || 'Participant'}` : 'To Everyone'
                ) : (
                  `From ${file.senderName}`
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-[11px] text-gray-500 font-medium">
          {isDirect ? (
            <span>Direct</span>
          ) : (
            <span>Room</span>
          )}
        </div>
      </div>

      {file.status === 'receiving' || file.status === 'sending' ? (
        <div className="space-y-1">
          <div className="w-full bg-[#f1f3f4] rounded-full h-1 overflow-hidden">
            <div 
              className="bg-gray-600 h-full rounded-full transition-all duration-200" 
              style={{ width: `${Math.max(5, file.progress)}%` }} 
            />
          </div>
          <p className="text-[10px] text-gray-400 text-right">{file.progress}%</p>
        </div>
      ) : file.downloadUrl ? (
        <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-gray-100">
          <span className="text-[10px] text-gray-400 font-medium">
            {new Date(file.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 rounded-full text-[11px] font-medium transition-colors cursor-pointer shadow-xs"
          >
            <ArrowDownToLine size={12} />
            <span>Download</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Dedicated In-Call Files Panel
interface FilesPanelProps {
  files: SharedFileItem[];
  onOpenSendDialog: () => void;
}

export function FilesPanel({ files, onOpenSendDialog }: FilesPanelProps) {
  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Shared Files</h3>
          <p className="text-[11px] text-gray-500">{files.length} {files.length === 1 ? 'file' : 'files'} in this call</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 custom-scroll pr-1">
        {files.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center p-6 space-y-3 bg-[#f8f9fa] rounded-2xl border border-gray-200">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-500 border border-gray-200">
              <Paperclip size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-800">No files shared yet</p>
              <p className="text-[11px] text-gray-500 mt-0.5 max-w-[200px]">
                Send documents, images, or code to participants in this call.
              </p>
            </div>
            <button
              onClick={onOpenSendDialog}
              className="mt-1 px-5 py-2 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-gray-800 border border-gray-300/80 text-xs font-medium rounded-full transition-colors cursor-pointer shadow-xs"
            >
              Share file
            </button>
          </div>
        ) : (
          <>
            {files.map(file => (
              <SharedFileCard key={file.id} file={file} />
            ))}
            <div className="pt-2 flex justify-center">
              <button
                onClick={onOpenSendDialog}
                className="px-5 py-2 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-gray-800 border border-gray-300/80 text-xs font-medium rounded-full transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                <Paperclip size={14} />
                <span>Share another file</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
