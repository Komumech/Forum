import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Pencil, Eraser, Type, Minus, Square, Circle, Undo, Trash2, Download,
  FileText, Plus, Copy, Check, Folder, Search, X, Edit2, Upload,
  FileCode2, FilePlus, RefreshCw, Layers, Eye, MoreVertical, CopyCheck, ArrowUpDown,
  Bot, Loader2, CornerDownLeft, CheckCheck, ChevronLeft, Maximize2, Minimize2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export interface WorkspaceFile {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
}

export interface RemoteCursor {
  senderId: string;
  name: string;
  initials: string;
  color: string;
  fileId: string;
  line: number;
  col: number;
  lastSeen: number;
}

interface Shape {
  id: string;
  type: 'pencil' | 'line' | 'rect' | 'circle' | 'text' | 'eraser';
  points: { x: number; y: number }[];
  color: string;
  width: number;
  text?: string;
}

interface JointWorkspaceProps {
  meetingId?: string;
  remoteParticipants?: any[];
  localParticipant?: any;
  user?: any;
  onBroadcast?: (data: any) => void;
  incomingBroadcast?: any;
  defaultMode?: 'editor' | 'whiteboard';
  onClose?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

// Material 3 neutral grey file icon component
function NeutralFileIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <FileText size={size} className="text-[#5f6368] shrink-0" />;
}

export default function JointWorkspace({ 
  meetingId, 
  remoteParticipants = [], 
  localParticipant,
  user,
  onBroadcast,
  incomingBroadcast,
  defaultMode = 'editor',
  onClose,
  isMaximized = false,
  onToggleMaximize
}: JointWorkspaceProps) {
  const [mode, setMode] = useState<'editor' | 'whiteboard'>(defaultMode);
  
  const storageKey = `forum_workspace_files_${meetingId || 'local'}`;

  // Initialize files from localStorage or start empty
  const [files, setFiles] = useState<WorkspaceFile[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out untouched empty placeholder Untitled.txt files
          const cleaned = parsed.filter(f => !(f.name === 'Untitled.txt' && !f.content && f.id === 'file-1'));
          return cleaned;
        }
      }
    } catch {
      // Ignore parse error
    }
    return [];
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    return files[0]?.id || '';
  });

  // Responsive mobile sub-view: 'list' (files browser) or 'editor' (active document editor)
  const [mobileView, setMobileView] = useState<'list' | 'editor'>(() => {
    return files.length > 0 ? 'editor' : 'list';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Minimalist AI Assistance State
  const [isAIAssistOpen, setIsAIAssistOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<string>('');
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Real remote cursors
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());

  // References
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);

  // Active file
  const activeFile = files.find(f => f.id === activeFileId) || files[0] || null;

  // Save files to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(files));
    } catch (err) {
      console.warn('Failed to save files to localStorage', err);
    }
  }, [files, storageKey]);

  // Derive my user name & initials
  const myName = user?.displayName || localParticipant?.name || (localParticipant?.identity ? localParticipant.identity.split('#')[0] : 'You');
  const myInitials = (myName || 'U')
    .split(' ')
    .filter(Boolean)
    .map((n: string) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'U';

  const myId = localParticipant?.identity || user?.uid || 'local-user';

  // Real-time broadcast receiver
  useEffect(() => {
    if (!incomingBroadcast) return;
    const { type, senderId, fileId, content, name, initials, color, line, col, shape, shapes: incomingShapes, action } = incomingBroadcast;

    if (senderId === myId) return; // ignore self-broadcast

    if (type === 'cursor-move' && fileId && senderId) {
      setRemoteCursors(prev => {
        const next = new Map(prev);
        next.set(senderId, {
          senderId,
          name: name || 'User',
          initials: initials || 'U',
          color: color || '#0b57d0',
          fileId,
          line: line || 1,
          col: col || 1,
          lastSeen: Date.now()
        });
        return next;
      });
    } else if (type === 'file-edit' && fileId && content !== undefined) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content, updatedAt: Date.now() } : f));
    } else if (type === 'file-create' && fileId && incomingBroadcast.file) {
      setFiles(prev => {
        if (prev.some(f => f.id === fileId)) return prev;
        return [...prev, incomingBroadcast.file];
      });
    } else if (type === 'file-delete' && fileId) {
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } else if (type === 'file-rename' && fileId && name) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name, updatedAt: Date.now() } : f));
    } else if (type === 'whiteboard-stroke' && shape) {
      setShapes(prev => [...prev, shape]);
    } else if (type === 'whiteboard-clear') {
      setShapes([]);
    } else if (type === 'whiteboard-sync' && Array.isArray(incomingShapes)) {
      setShapes(incomingShapes);
    }
  }, [incomingBroadcast, myId]);

  // Periodically clean up stale remote cursors (inactive > 8s)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [key, cursor] of next.entries()) {
          if (now - cursor.lastSeen > 8000) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Broadcast cursor movement
  const broadcastCursor = useCallback((line: number, col: number) => {
    if (!onBroadcast || !activeFile) return;
    onBroadcast({
      type: 'cursor-move',
      senderId: myId,
      name: myName,
      initials: myInitials,
      color: '#0b57d0',
      fileId: activeFile.id,
      line,
      col
    });
  }, [onBroadcast, activeFile, myId, myName, myInitials]);

  // Handle local text editing
  const handleContentChange = (newContent: string) => {
    if (!activeFile) return;
    setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: newContent, updatedAt: Date.now() } : f));
    
    if (onBroadcast) {
      onBroadcast({
        type: 'file-edit',
        senderId: myId,
        fileId: activeFile.id,
        content: newContent
      });
    }
  };

  // Track cursor position on click / keyup / select
  const handleCursorMove = () => {
    if (!textareaRef.current) return;
    const { selectionStart, value } = textareaRef.current;
    const linesBefore = value.substring(0, selectionStart).split('\n');
    const currentLineNumber = linesBefore.length;
    const currentColNumber = linesBefore[linesBefore.length - 1].length + 1;
    setCursorPos({ line: currentLineNumber, col: currentColNumber });
    broadcastCursor(currentLineNumber, currentColNumber);
  };

  // Create new file
  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    let name = newFileName.trim();

    const newFile: WorkspaceFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      content: '',
      updatedAt: Date.now()
    };

    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setMobileView('editor');
    setNewFileName('');
    setIsCreatingFile(false);

    if (onBroadcast) {
      onBroadcast({
        type: 'file-create',
        senderId: myId,
        fileId: newFile.id,
        file: newFile
      });
    }
  };

  // Rename file
  const handleRenameSubmit = (fileId: string) => {
    if (!editingFileName.trim()) {
      setEditingFileId(null);
      return;
    }
    const newName = editingFileName.trim();
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName, updatedAt: Date.now() } : f));
    setEditingFileId(null);

    if (onBroadcast) {
      onBroadcast({
        type: 'file-rename',
        senderId: myId,
        fileId,
        name: newName
      });
    }
  };

  // Duplicate file
  const handleDuplicateFile = (file: WorkspaceFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const parts = file.name.split('.');
    const ext = parts.length > 1 ? `.${parts.pop()}` : '';
    const baseName = parts.join('.');
    const dupName = `${baseName} (Copy)${ext}`;

    const newFile: WorkspaceFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: dupName,
      content: file.content,
      updatedAt: Date.now()
    };

    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setMobileView('editor');

    if (onBroadcast) {
      onBroadcast({
        type: 'file-create',
        senderId: myId,
        fileId: newFile.id,
        file: newFile
      });
    }
  };

  // Delete file
  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = files.filter(f => f.id !== id);
    setFiles(updated);
    if (activeFileId === id) {
      if (updated.length > 0) {
        setActiveFileId(updated[0].id);
      } else {
        setActiveFileId('');
        setMobileView('list');
      }
    }

    if (onBroadcast) {
      onBroadcast({
        type: 'file-delete',
        senderId: myId,
        fileId: id
      });
    }
  };

  // Upload file handler
  const handleFileUpload = (uploadedFiles: FileList | null) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    Array.from(uploadedFiles).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const textContent = (event.target?.result as string) || '';
        const newFile: WorkspaceFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          content: textContent,
          updatedAt: Date.now()
        };

        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newFile.id);
        setMobileView('editor');

        if (onBroadcast) {
          onBroadcast({
            type: 'file-create',
            senderId: myId,
            fileId: newFile.id,
            file: newFile
          });
        }
      };
      reader.readAsText(file);
    });
  };

  // Drag and Drop files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Copy code / content
  const handleCopyCode = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Download active file
  const handleDownloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  // AI Workspace Assistant handler
  const handleRunAIAssist = async (actionType: string, customInstruction?: string) => {
    if (!activeFile) return;
    setAiLoading(true);
    setAiAction(actionType);
    setAiResult(null);
    setAiNotice(null);

    try {
      const response = await fetch('/api/ai/workspace-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: activeFile.content,
          action: actionType,
          instruction: customInstruction || aiPrompt,
          fileName: activeFile.name
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      if (data.result) {
        setAiResult(data.result);
      }
    } catch (err: any) {
      console.warn("AI workspace assist error:", err);
      setAiNotice("Could not process request. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAIResult = () => {
    if (!aiResult || !activeFile) return;
    handleContentChange(aiResult);
    setAiResult(null);
    setIsAIAssistOpen(false);
    setAiPrompt('');
  };

  const handleAppendAIResult = () => {
    if (!aiResult || !activeFile) return;
    const updatedContent = activeFile.content ? `${activeFile.content}\n\n${aiResult}` : aiResult;
    handleContentChange(updatedContent);
    setAiResult(null);
    setIsAIAssistOpen(false);
    setAiPrompt('');
  };

  // ==========================================
  // WHITEBOARD DRAWING ENGINE (HIGH PERFORMANCE)
  // ==========================================
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pencil' | 'line' | 'rect' | 'circle' | 'text' | 'eraser'>('pencil');
  const [drawColor, setDrawColor] = useState('#1f1f1f');
  const [lineWidth, setLineWidth] = useState(3);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

  const shapesRef = useRef<Shape[]>([]);
  shapesRef.current = shapes;
  const currentShapeRef = useRef<Shape | null>(null);

  // Render canvas
  const renderShapes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allShapes = [...shapesRef.current, ...(currentShapeRef.current ? [currentShapeRef.current] : [])];

    allShapes.forEach(shape => {
      ctx.beginPath();
      ctx.strokeStyle = shape.type === 'eraser' ? '#ffffff' : shape.color;
      ctx.lineWidth = shape.type === 'eraser' ? shape.width * 4 : shape.width;

      if (shape.type === 'pencil' || shape.type === 'eraser') {
        if (shape.points.length < 2) {
          if (shape.points.length === 1) {
            ctx.fillStyle = shape.type === 'eraser' ? '#ffffff' : shape.color;
            ctx.arc(shape.points[0].x, shape.points[0].y, shape.width / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          return;
        }
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
      } else if (shape.type === 'line') {
        if (shape.points.length < 2) return;
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else if (shape.type === 'rect') {
        if (shape.points.length < 2) return;
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      } else if (shape.type === 'circle') {
        if (shape.points.length < 2) return;
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (shape.type === 'text' && shape.text) {
        ctx.font = `bold ${shape.width * 5}px Roboto, sans-serif`;
        ctx.fillStyle = shape.color;
        ctx.fillText(shape.text, shape.points[0].x, shape.points[0].y);
      }
    });
  }, []);

  // Resize listener
  useEffect(() => {
    if (mode !== 'whiteboard') return;

    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        renderShapes();
      }
    };

    updateCanvasSize();
    const observer = new ResizeObserver(() => requestAnimationFrame(updateCanvasSize));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mode, renderShapes]);

  useEffect(() => {
    if (mode === 'whiteboard') {
      renderShapes();
    }
  }, [shapes, mode, renderShapes]);

  const getCanvasPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const pos = getCanvasPos(e);
    setIsDrawing(true);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

    if (tool === 'text') {
      setTextInput({ x: pos.x, y: pos.y, value: '' });
      setIsDrawing(false);
      return;
    }

    const newShape: Shape = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: tool,
      points: [pos],
      color: tool === 'eraser' ? '#ffffff' : drawColor,
      width: lineWidth
    };

    currentShapeRef.current = newShape;
    renderShapes();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !currentShapeRef.current) return;
    const pos = getCanvasPos(e);

    if (currentShapeRef.current.type === 'pencil' || currentShapeRef.current.type === 'eraser') {
      currentShapeRef.current.points.push(pos);
    } else {
      currentShapeRef.current.points = [currentShapeRef.current.points[0], pos];
    }
    renderShapes();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || !currentShapeRef.current) return;
    setIsDrawing(false);

    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const finishedShape = currentShapeRef.current;
    currentShapeRef.current = null;

    setUndoStack(prev => [...prev, shapesRef.current]);
    setShapes(prev => [...prev, finishedShape]);

    if (onBroadcast) {
      onBroadcast({
        type: 'whiteboard-stroke',
        senderId: myId,
        shape: finishedShape
      });
    }
  };

  const clearCanvas = () => {
    setUndoStack(prev => [...prev, shapes]);
    setShapes([]);
    if (onBroadcast) {
      onBroadcast({
        type: 'whiteboard-clear',
        senderId: myId
      });
    }
  };

  const undoCanvas = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setShapes(prev);
    if (onBroadcast) {
      onBroadcast({
        type: 'whiteboard-sync',
        senderId: myId,
        shapes: prev
      });
    }
  };

  const exportWhiteboard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'workspace_whiteboard.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Filtered files
  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const lines = (activeFile?.content || '').split('\n');
  const wordCount = (activeFile?.content || '').trim().split(/\s+/).filter(Boolean).length;
  const charCount = (activeFile?.content || '').length;

  // Active remote cursors in currently opened file
  const activeRemoteCursorsInFile = Array.from(remoteCursors.values()).filter(c => c.fileId === activeFile?.id);

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col h-full w-full bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden select-none transition-colors",
        isDraggingOver && "ring-2 ring-slate-800 bg-slate-50/50"
      )}
    >
      {/* Hidden File Input for uploading */}
      <input 
        ref={fileUploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* Top Navigation Bar */}
      <div className="px-3.5 sm:px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between gap-2.5 shrink-0">
        {/* Left: Mode Toggle */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="inline-flex p-1 bg-stone-100 rounded-xl border border-neutral-200/70 shrink-0">
            <button
              onClick={() => setMode('editor')}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap",
                mode === 'editor' 
                  ? "bg-white text-slate-900 shadow-xs font-medium border border-neutral-200/60" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50 font-normal"
              )}
            >
              <FileText size={14} className={mode === 'editor' ? 'text-slate-800' : 'text-slate-500'} />
              <span>Documents</span>
            </button>
            <button
              onClick={() => setMode('whiteboard')}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap",
                mode === 'whiteboard' 
                  ? "bg-white text-slate-900 shadow-xs font-medium border border-neutral-200/60" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50 font-normal"
              )}
            >
              <Pencil size={14} className={mode === 'whiteboard' ? 'text-slate-800' : 'text-slate-500'} />
              <span>Whiteboard</span>
            </button>
          </div>
        </div>

        {/* Right: Mode Actions & Close Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {mode === 'whiteboard' && (
            <div className="flex items-center gap-1.5">
              <button 
                onClick={undoCanvas} 
                className="flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-xs"
                title="Undo last stroke"
              >
                <Undo size={13} />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button 
                onClick={clearCanvas} 
                className="flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-300 hover:border-red-200 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-xs"
                title="Clear Canvas"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Clear</span>
              </button>
              <button 
                onClick={exportWhiteboard}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-gray-800 border border-gray-300/80 rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-xs"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          )}

          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              className="p-1.5 hover:bg-stone-100 rounded-xl text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title={isMaximized ? "Restore View" : "Maximize Workspace"}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}

          {onClose && (
            <div className="flex items-center pl-1 border-l border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                title="Close Workspace"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace Body */}
      {mode === 'editor' ? (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden bg-white">
          {/* Left Column: Files Explorer (Responsive Mobile Full-width or Desktop Sidebar) */}
          <div className={cn(
            "w-full md:w-64 lg:w-72 bg-[#f8f9fa] border-r border-gray-200 flex flex-col shrink-0 min-h-0",
            mobileView === 'editor' ? "hidden md:flex" : "flex flex-1"
          )}>
            {/* Explorer Header */}
            <div className="p-3 border-b border-gray-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 tracking-wider uppercase">
                <Folder size={14} className="text-gray-500" />
                <span>Files</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileUploadInputRef.current?.click()}
                  className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200/70 rounded-lg transition-colors cursor-pointer"
                  title="Upload File"
                >
                  <Upload size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFile(true)}
                  className="p-1.5 text-gray-700 hover:text-gray-900 hover:bg-gray-200/70 rounded-lg transition-colors cursor-pointer"
                  title="Create New Document"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Inline New File Input Form */}
            <AnimatePresence>
              {isCreatingFile && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleCreateFile}
                  className="p-2.5 bg-white border-b border-gray-200 flex items-center gap-1.5"
                >
                  <input
                    autoFocus
                    type="text"
                    placeholder="File name (e.g. notes.txt)"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="flex-1 px-2.5 py-1 bg-gray-50 border border-gray-300 rounded-lg text-xs outline-none focus:border-gray-500 text-gray-900"
                  />
                  <button
                    type="submit"
                    className="p-1.5 bg-[#f1f3f4] hover:bg-[#e2e7eb] text-gray-800 border border-gray-300 rounded-md text-xs cursor-pointer shadow-xs"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsCreatingFile(false); setNewFileName(''); }}
                    className="p-1.5 text-gray-500 hover:text-gray-800 rounded-md text-xs cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Search Filter - Shown only when 4 or more files */}
            {files.length >= 4 && (
              <div className="p-2 border-b border-gray-200">
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs">
                  <Search size={13} className="text-gray-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-xs text-gray-900 placeholder-gray-400"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Files List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scroll">
              {filteredFiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
                  <div className="w-10 h-10 rounded-2xl bg-neutral-100 border border-neutral-200/60 flex items-center justify-center mb-2.5 text-slate-500">
                    <FileText size={18} />
                  </div>
                  <p className="text-xs font-medium text-slate-800 mb-0.5">No files yet</p>
                  <p className="text-[11px] text-slate-400 max-w-[170px] leading-relaxed">
                    Use the + icon above to start your first document.
                  </p>
                </div>
              ) : (
                filteredFiles.map(file => {
                  const isActive = file.id === activeFileId;
                  const isEditing = editingFileId === file.id;

                  if (isEditing) {
                    return (
                      <div key={file.id} className="p-1.5 bg-white rounded-xl border border-gray-400 flex items-center gap-1">
                        <input
                          autoFocus
                          type="text"
                          value={editingFileName}
                          onChange={(e) => setEditingFileName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit(file.id);
                            if (e.key === 'Escape') setEditingFileId(null);
                          }}
                          className="flex-1 px-2 py-1 text-xs outline-none bg-transparent text-gray-900"
                        />
                        <button
                          onClick={() => handleRenameSubmit(file.id)}
                          className="p-1 text-gray-700 hover:bg-gray-100 rounded cursor-pointer"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingFileId(null)}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  }

                  // Count real active remote editors in this file
                  const remoteEditorsCount = Array.from(remoteCursors.values()).filter(c => c.fileId === file.id).length;

                  return (
                    <div
                      key={file.id}
                      onClick={() => {
                        setActiveFileId(file.id);
                        setMobileView('editor');
                      }}
                      className={cn(
                        "group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all",
                        isActive
                          ? "bg-slate-200/80 text-slate-900 font-semibold shadow-xs border border-slate-300/60"
                          : "text-gray-700 hover:bg-gray-200/60 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <NeutralFileIcon name={file.name} size={15} />
                        <span className="truncate">{file.name}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Real active participants badge */}
                        {remoteEditorsCount > 0 && (
                          <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-800 text-[8px] font-bold flex items-center justify-center shadow-xs border border-slate-300">
                            {remoteEditorsCount}
                          </div>
                        )}

                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFileId(file.id);
                              setEditingFileName(file.name);
                            }}
                            className="p-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded transition-colors cursor-pointer"
                            title="Rename"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => handleDuplicateFile(file, e)}
                            className="p-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded transition-colors cursor-pointer"
                            title="Duplicate"
                          >
                            <CopyCheck size={12} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteFile(file.id, e)}
                            className="p-1 text-gray-500 hover:text-red-600 hover:bg-white rounded transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Left Column Footer */}
            {files.length > 0 && (
              <div className="p-2.5 px-3 border-t border-gray-200 bg-[#f8f9fa] flex items-center justify-between text-[11px] text-gray-500">
                <span>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
              </div>
            )}
          </div>

          {/* Right Column: Universal Document / Notes Editor */}
          <div className={cn(
            "flex-1 flex flex-col min-h-0 bg-white overflow-hidden",
            mobileView === 'list' ? "hidden md:flex" : "flex flex-1"
          )}>
            {activeFile ? (
              <>
                {/* Editor Sub-Header */}
                <div className="px-3.5 sm:px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between gap-2.5 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setMobileView('list')}
                      className="md:hidden flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Back to file list"
                    >
                      <ChevronLeft size={14} />
                      <span>Files</span>
                    </button>
                    <NeutralFileIcon name={activeFile.name} size={15} />
                    <span className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{activeFile.name}</span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Real Remote Active Collaborators in this file */}
                    {activeRemoteCursorsInFile.map((cursor) => (
                      <div
                        key={cursor.senderId}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200"
                        title={`${cursor.name} is editing line ${cursor.line}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                        <span>{cursor.name}</span>
                        <span className="text-[9px] text-gray-500">L{cursor.line}</span>
                      </div>
                    ))}

                    {/* Minimalist AI Assistant Toggle */}
                    <button
                      onClick={() => setIsAIAssistOpen(!isAIAssistOpen)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer shadow-xs border",
                        isAIAssistOpen 
                          ? "bg-slate-200 border-slate-300 text-slate-900" 
                          : "bg-white border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700"
                      )}
                      title="AI Workspace Assistant"
                    >
                      <Bot size={13} className="text-gray-600" />
                      <span>AI Assist</span>
                    </button>

                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 rounded-full text-xs font-medium transition-colors cursor-pointer shadow-xs"
                      title="Copy text to clipboard"
                    >
                      {copiedCode ? <Check size={13} className="text-gray-800" /> : <Copy size={13} />}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={handleDownloadFile}
                      className="p-1.5 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 rounded-full transition-colors cursor-pointer shadow-xs"
                      title="Download File"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>

                {/* Minimalist AI Assistant Panel */}
                <AnimatePresence>
                  {isAIAssistOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-[#f8f9fa] border-b border-gray-200 p-3 space-y-2.5 overflow-hidden text-xs text-gray-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-medium text-gray-800">
                          <Bot size={14} className="text-gray-600" />
                          <span>AI Workspace Assistant</span>
                          <span className="text-[10px] text-gray-400 font-normal">Gemini</span>
                        </div>
                        <button
                          onClick={() => { setIsAIAssistOpen(false); setAiResult(null); }}
                          className="p-1 text-gray-400 hover:text-gray-700 rounded-md cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </div>

                      {/* Quick Action Chips */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          disabled={aiLoading}
                          onClick={() => handleRunAIAssist('improve')}
                          className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Improve Clarity
                        </button>
                        <button
                          disabled={aiLoading}
                          onClick={() => handleRunAIAssist('fix')}
                          className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Fix Grammar & Typos
                        </button>
                        <button
                          disabled={aiLoading}
                          onClick={() => handleRunAIAssist('format')}
                          className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Format & Structure
                        </button>
                        <button
                          disabled={aiLoading}
                          onClick={() => handleRunAIAssist('summarize')}
                          className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Summarize Key Points
                        </button>
                      </div>

                      {/* Custom Prompt Input */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (aiPrompt.trim()) {
                            handleRunAIAssist('custom', aiPrompt.trim());
                          }
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder="Or instruct AI (e.g. 'Convert to bullet points', 'Add python docstrings')..."
                          className="flex-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 outline-none focus:border-gray-500 placeholder:text-gray-400"
                        />
                        <button
                          type="submit"
                          disabled={aiLoading || !aiPrompt.trim()}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <CornerDownLeft size={12} />}
                          <span>Run</span>
                        </button>
                      </form>

                      {/* Loading status (clean and static without pulsing) */}
                      {aiLoading && (
                        <div className="flex items-center gap-2 py-1 text-gray-500 text-xs">
                          <Loader2 size={13} className="animate-spin text-gray-600" />
                          <span>Generating AI suggestion...</span>
                        </div>
                      )}

                      {/* Result Box */}
                      {aiResult && (
                        <div className="bg-white border border-gray-300 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-800 text-[11px] uppercase tracking-wide">
                              AI Suggestion ({aiAction})
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={handleApplyAIResult}
                                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer"
                              >
                                <CheckCheck size={12} />
                                <span>Replace All</span>
                              </button>
                              <button
                                onClick={handleAppendAIResult}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Append
                              </button>
                              <button
                                onClick={() => setAiResult(null)}
                                className="px-2 py-1 text-gray-500 hover:text-gray-800 rounded-lg text-xs cursor-pointer"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                          <pre className="max-h-40 overflow-y-auto p-2.5 bg-gray-50 rounded-lg text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed custom-scroll border border-gray-200/60">
                            {aiResult}
                          </pre>
                        </div>
                      )}

                      {aiNotice && (
                        <p className="text-xs text-red-600">{aiNotice}</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Editor Workspace Surface with Multi-User Cursors */}
                <div className="flex-1 relative flex overflow-auto bg-white select-text">
                  {/* Line Numbers Column */}
                  <div className="w-12 py-3 bg-[#fafafa] border-r border-gray-200 text-gray-400 text-right pr-3 select-none shrink-0 font-mono text-xs leading-6">
                    {lines.map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "h-6 flex items-center justify-end",
                          cursorPos.line === i + 1 ? "text-gray-900 font-bold" : ""
                        )}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Text Area & Live Remote Cursors Overlay */}
                  <div className="relative flex-1 min-w-[300px]">
                    <textarea
                      ref={textareaRef}
                      value={activeFile.content}
                      onChange={(e) => handleContentChange(e.target.value)}
                      onKeyUp={handleCursorMove}
                      onClick={handleCursorMove}
                      onSelect={handleCursorMove}
                      spellCheck={false}
                      placeholder="Type notes, code, documents, or paste content here..."
                      className="w-full h-full p-3 font-mono text-xs sm:text-[13px] leading-6 bg-transparent text-gray-900 resize-none outline-none border-none whitespace-pre overflow-auto placeholder-gray-400"
                    />

                    {/* Real Remote Cursors Overlay */}
                    <div className="absolute inset-0 pointer-events-none p-3 overflow-hidden">
                      {activeRemoteCursorsInFile.map((cursor) => {
                        const topPx = (cursor.line - 1) * 24 + 12;
                        const leftPx = Math.min(800, (cursor.col - 1) * 7.8 + 12);

                        return (
                          <motion.div
                            key={cursor.senderId}
                            initial={false}
                            animate={{ top: topPx, left: leftPx }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="absolute z-20 flex flex-col items-start"
                          >
                            {/* Compact Initials Tag directly attached on top of cursor */}
                            <div
                              style={{ backgroundColor: cursor.color || '#5f6368' }}
                              className="px-1 py-0.2 rounded-full text-white text-[9px] font-bold shadow-xs whitespace-nowrap transform -translate-y-full -translate-x-1/2 left-1/2 mb-0.5 tracking-tight"
                              title={cursor.name}
                            >
                              {cursor.initials}
                            </div>

                            {/* Clean Vertical Cursor Bar without pulsing */}
                            <div
                              style={{ backgroundColor: cursor.color || '#5f6368' }}
                              className="w-[2px] h-5 rounded-full shadow-xs"
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Editor Footer Status Bar */}
                <div className="px-4 py-1.5 bg-[#f8f9fa] border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-500 font-sans shrink-0">
                  <div className="flex items-center gap-3">
                    <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                    <span>•</span>
                    <span>{lines.length} lines</span>
                    <span>•</span>
                    <span>{wordCount} words</span>
                    <span>•</span>
                    <span>{charCount} chars</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Auto-saved locally</span>
                  </div>
                </div>
              </>
            ) : (
              /* Clean Minimalist Empty State when no file is selected */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white my-auto">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 border border-neutral-200/60 flex items-center justify-center mb-3 text-slate-500">
                  <FileText size={20} />
                </div>
                <h3 className="text-xs font-semibold text-slate-900 mb-1">No file selected</h3>
                <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                  Select a document from the left or click + to start a new file.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Whiteboard Canvas Mode */
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {/* Whiteboard Controls Bar */}
          <div className="p-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
            {/* Tool Selection */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTool('pencil')}
                className={cn(
                  "p-2 rounded-full transition-colors cursor-pointer",
                  tool === 'pencil' ? "bg-slate-200 text-slate-900 border border-slate-300 shadow-xs font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                title="Pencil (Draw)"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={cn(
                  "p-2 rounded-full transition-colors cursor-pointer",
                  tool === 'eraser' ? "bg-slate-200 text-slate-900 border border-slate-300 shadow-xs font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                title="Eraser"
              >
                <Eraser size={15} />
              </button>
              <button
                onClick={() => setTool('text')}
                className={cn(
                  "p-2 rounded-full transition-colors cursor-pointer",
                  tool === 'text' ? "bg-slate-200 text-slate-900 border border-slate-300 shadow-xs font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                title="Text"
              >
                <Type size={15} />
              </button>
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <button
                onClick={() => setTool('line')}
                className={cn(
                  "p-2 rounded-full transition-colors cursor-pointer",
                  tool === 'line' ? "bg-slate-200 text-slate-900 border border-slate-300 shadow-xs font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                title="Line"
              >
                <Minus size={15} />
              </button>
              <button
                onClick={() => setTool('rect')}
                className={cn(
                  "p-2 rounded-full transition-colors cursor-pointer",
                  tool === 'rect' ? "bg-slate-200 text-slate-900 border border-slate-300 shadow-xs font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                title="Rectangle"
              >
                <Square size={15} />
              </button>
              <button
                onClick={() => setTool('circle')}
                className={cn(
                  "p-2 rounded-full transition-colors cursor-pointer",
                  tool === 'circle' ? "bg-slate-200 text-slate-900 border border-slate-300 shadow-xs font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                title="Circle"
              >
                <Circle size={15} />
              </button>
            </div>

            {/* Stroke Color & Width */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={drawColor}
                onChange={(e) => setDrawColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border border-gray-300"
                title="Color Picker"
              />
              <select
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="bg-white border border-gray-300 hover:border-gray-400 rounded-full text-xs font-medium px-2.5 py-1 outline-none text-gray-700 cursor-pointer"
              >
                {[2, 3, 5, 8, 12, 18].map(w => (
                  <option key={w} value={w}>{w}px stroke</option>
                ))}
              </select>
            </div>
          </div>

          {/* Canvas Area */}
          <div ref={containerRef} className="flex-1 bg-white cursor-crosshair relative overflow-hidden select-none">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 touch-none w-full h-full bg-white select-none"
            />

            {/* Text Input Box on Canvas */}
            {textInput && (
              <div
                className="absolute z-10 p-2 bg-white rounded-xl shadow-lg border border-gray-200 min-w-[200px]"
                style={{ left: textInput.x, top: textInput.y }}
              >
                <input
                  autoFocus
                  className="w-full px-2 py-1 text-xs border-none outline-none text-gray-900"
                  placeholder="Type text and press Enter..."
                  value={textInput.value}
                  onChange={e => setTextInput({ ...textInput, value: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (textInput.value) {
                        const newShape: Shape = {
                          id: `text-${Date.now()}`,
                          type: 'text',
                          points: [{ x: textInput.x, y: textInput.y }],
                          color: drawColor,
                          width: lineWidth,
                          text: textInput.value
                        };
                        setUndoStack(prev => [...prev, shapes]);
                        setShapes(prev => [...prev, newShape]);
                        if (onBroadcast) {
                          onBroadcast({
                            type: 'whiteboard-stroke',
                            senderId: myId,
                            shape: newShape
                          });
                        }
                      }
                      setTextInput(null);
                    } else if (e.key === 'Escape') {
                      setTextInput(null);
                    }
                  }}
                  onBlur={() => {
                    if (textInput.value) {
                      const newShape: Shape = {
                        id: `text-${Date.now()}`,
                        type: 'text',
                        points: [{ x: textInput.x, y: textInput.y }],
                        color: drawColor,
                        width: lineWidth,
                        text: textInput.value
                      };
                      setUndoStack(prev => [...prev, shapes]);
                      setShapes(prev => [...prev, newShape]);
                      if (onBroadcast) {
                        onBroadcast({
                          type: 'whiteboard-stroke',
                          senderId: myId,
                          shape: newShape
                        });
                      }
                    }
                    setTextInput(null);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
