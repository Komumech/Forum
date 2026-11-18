import React, { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Layout,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import StagePresentationCard from './StagePresentationCard';
import { SendErrorFeedbackButton } from './ErrorFeedbackModal';
import {
  DEFAULT_STAGE_OVERLAY,
  STAGE_TEMPLATES,
  type StageContentMode,
  type StageOverlayPosition,
  type StageOverlayState,
  type StageOverlayTheme,
  type StageTemplateDef,
} from '../types/stage';
import {
  processDocumentLink,
  processUploadedDocuments,
  saveDocumentPagesToFirestore,
} from '../utils/documentShare';

export {
  DEFAULT_STAGE_OVERLAY,
  STAGE_TEMPLATES,
  type StageContentMode,
  type StageOverlayPosition,
  type StageOverlayState,
  type StageOverlayTheme,
  type StageTemplateDef,
};

function compressOverlayMediaFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const maxSide = 1100;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 140_000 && quality > 0.45) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function getThemeClasses(theme: StageOverlayTheme) {
  switch (theme) {
    case 'light':
      return 'bg-[#FBFBFA]/95 text-slate-900 border-neutral-200/80';
    case 'stone':
      return 'bg-stone-100/95 text-slate-900 border-stone-300/70';
    case 'emerald':
      return 'bg-[#10241d]/95 text-emerald-50 border-emerald-800/70';
    case 'dark':
    default:
      return 'bg-[#141518]/92 text-slate-50 border-white/15';
  }
}

function getSubtextClass(theme: StageOverlayTheme) {
  return theme === 'light' || theme === 'stone' ? 'text-slate-500' : 'text-slate-300';
}

/**
 * Legacy overlay renderer retained for OBS / IsolatedFeed single-participant capture view.
 * In the main meeting room, active stage content renders via StagePresentationCard as its own stage tile.
 */
export function StageMediaOverlayRenderer({
  overlay,
  canDismiss,
  onDismiss,
}: {
  overlay: StageOverlayState | null;
  canDismiss?: boolean;
  onDismiss?: () => void;
}) {
  if (!overlay || !overlay.active) return null;

  if (overlay.mode === 'document' && overlay.document) {
    return (
      <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center">
        <div className="pointer-events-auto relative w-full max-w-4xl max-h-[82vh] aspect-video">
          <div className="absolute inset-0 w-full h-full">
            <StagePresentationCard
              overlay={overlay}
              canControl={canDismiss}
              onDismiss={onDismiss}
            />
          </div>
        </div>
      </div>
    );
  }

  const isLightLike = overlay.theme === 'light' || overlay.theme === 'stone';
  const subCls = getSubtextClass(overlay.theme);
  const surfaceCls = getThemeClasses(overlay.theme);
  const hasVideo = /\.(mp4|webm|mov)(\?|$)/i.test(overlay.mediaUrl || '');

  if (overlay.position === 'top-banner' || overlay.templateId === 'announcement') {
    return (
      <div className="pointer-events-none absolute top-4 inset-x-4 z-30 flex justify-center">
        <div
          className={cn(
            'pointer-events-auto relative max-w-2xl px-5 py-2.5 rounded-xl border backdrop-blur-md flex items-center gap-4',
            surfaceCls
          )}
        >
          <p className="text-xs sm:text-sm font-medium tracking-tight leading-snug">
            {overlay.title}
          </p>
          {canDismiss && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Hide overlay"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (
    overlay.position === 'bottom-left' ||
    overlay.templateId === 'lower-third' ||
    overlay.templateId === 'guest-spotlight' ||
    overlay.templateId === 'performance-title'
  ) {
    return (
      <div className="pointer-events-none absolute bottom-5 left-5 z-30 max-w-[calc(100%-2.5rem)] sm:max-w-md">
        <div
          className={cn(
            'pointer-events-auto relative rounded-2xl border backdrop-blur-md px-5 py-3.5 flex items-center gap-3.5',
            surfaceCls
          )}
        >
          {overlay.mediaUrl && (
            <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-current/10">
              <img src={overlay.mediaUrl} alt={overlay.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-emerald-600 shrink-0" />
              <p className="text-sm sm:text-base font-medium tracking-tight truncate">
                {overlay.title}
              </p>
            </div>
            {overlay.subtitle && (
              <p className={cn('text-xs truncate pl-3.5', subCls)}>{overlay.subtitle}</p>
            )}
          </div>
          {canDismiss && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Hide overlay"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  const isImageOnly = overlay.templateId === 'center-media';
  const maxWidthClass =
    overlay.mediaSize === 'lg'
      ? 'max-w-3xl w-[90%]'
      : overlay.mediaSize === 'sm'
        ? 'max-w-md w-[85%]'
        : 'max-w-xl w-[88%]';

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-8">
      <div
        className={cn(
          'pointer-events-auto relative rounded-2xl border backdrop-blur-md overflow-hidden',
          maxWidthClass,
          surfaceCls
        )}
      >
        {canDismiss && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              'absolute top-3 right-3 z-10 p-1.5 rounded-lg transition-colors cursor-pointer',
              isLightLike ? 'text-slate-500 hover:text-slate-900 hover:bg-black/5' : 'text-slate-300 hover:text-white hover:bg-white/10'
            )}
            title="Hide from stage"
          >
            <X size={15} />
          </button>
        )}

        {isImageOnly ? (
          <div className="p-4 sm:p-5 space-y-3">
            {overlay.mediaUrl ? (
              <div className="w-full max-h-[54vh] rounded-xl overflow-hidden flex items-center justify-center bg-black/10">
                {hasVideo ? (
                  <video
                    src={overlay.mediaUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className={cn(
                      'max-h-[54vh] w-full rounded-xl',
                      overlay.mediaFit === 'cover' ? 'object-cover' : 'object-contain'
                    )}
                  />
                ) : (
                  <img
                    src={overlay.mediaUrl}
                    alt={overlay.title || 'Stage Media'}
                    referrerPolicy="no-referrer"
                    className={cn(
                      'max-h-[54vh] w-full rounded-xl',
                      overlay.mediaFit === 'cover' ? 'object-cover' : 'object-contain'
                    )}
                  />
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-xs opacity-70">
                Add an image upload or URL to display media here
              </div>
            )}
            {overlay.title && (
              <p className="text-sm font-medium tracking-tight text-center">{overlay.title}</p>
            )}
          </div>
        ) : (
          <div className="p-8 sm:p-10 text-center space-y-3">
            <h3 className="text-2xl sm:text-3xl font-light tracking-tight leading-tight">
              {overlay.title}
            </h3>
            {overlay.subtitle && <p className={cn('text-sm', subCls)}>{overlay.subtitle}</p>}
            {overlay.body && (
              <p className={cn('text-xs sm:text-sm leading-relaxed max-w-md mx-auto whitespace-pre-line', subCls)}>
                {overlay.body}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface StageStudioPanelProps {
  overlay: StageOverlayState;
  roomId?: string;
  presenterName?: string;
  presenterIdentity?: string;
  onChangeOverlay: (next: StageOverlayState) => void;
}

export function StageStudioPanel({
  overlay,
  roomId,
  presenterName,
  presenterIdentity,
  onChangeOverlay,
}: StageStudioPanelProps) {
  const [filterCat, setFilterCat] = useState<'all' | 'docs' | 'stage' | 'media' | 'overlay'>('all');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [docLinkInput, setDocLinkInput] = useState('');
  const [docStatus, setDocStatus] = useState<string | null>(null);
  const [isDocLoading, setIsDocLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  const withPresenter = (next: StageOverlayState): StageOverlayState => ({
    ...next,
    presenterName: presenterName || next.presenterName,
    presenterIdentity: presenterIdentity || next.presenterIdentity,
    updatedAt: Date.now(),
  });

  const selectTemplate = (tpl: StageTemplateDef) => {
    onChangeOverlay(
      withPresenter({
        ...overlay,
        active: true,
        mode: tpl.defaults.mode || (tpl.category === 'media' ? 'media' : 'template'),
        templateId: tpl.id,
        position: tpl.position,
        theme: tpl.theme,
        title: tpl.defaults.title ?? '',
        subtitle: tpl.defaults.subtitle ?? '',
        body: tpl.defaults.body ?? '',
        meta: tpl.defaults.meta ?? '',
        mediaFit: tpl.defaults.mediaFit ?? overlay.mediaFit,
        mediaSize: tpl.defaults.mediaSize ?? overlay.mediaSize,
        points: tpl.defaults.points ? [...tpl.defaults.points] : [],
        document: null,
      })
    );
  };

  const handleMediaFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const dataUrl = await compressOverlayMediaFile(file);
      let mediaStorageDocId: string | undefined;

      if (roomId && dataUrl.length > 25_000) {
        mediaStorageDocId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await saveDocumentPagesToFirestore(roomId, mediaStorageDocId, [
          { pageNumber: 1, kind: 'image', imageUrl: dataUrl },
        ]);
      }

      onChangeOverlay(
        withPresenter({
          ...overlay,
          active: true,
          mode: 'media',
          templateId: overlay.templateId === 'media-split' ? 'media-split' : 'center-media',
          mediaUrl: mediaStorageDocId ? '' : dataUrl,
          mediaStorageDocId,
          document: null,
        })
      );
    } catch {
      setUploadError('Please select a valid image file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);
    setIsDocLoading(true);
    setDocStatus('Preparing document…');

    try {
      const docState = await processUploadedDocuments(files, roomId || 'local', (msg) =>
        setDocStatus(msg)
      );
      onChangeOverlay(
        withPresenter({
          ...overlay,
          active: true,
          mode: 'document',
          templateId: 'document',
          title: docState.title,
          document: docState,
        })
      );
      setDocStatus(null);
    } catch (err: any) {
      setUploadError(err?.message || 'Could not process this document.');
      setDocStatus(null);
    } finally {
      setIsDocLoading(false);
      e.target.value = '';
    }
  };

  const handleDocumentLinkLoad = async () => {
    if (!docLinkInput.trim()) return;
    setUploadError(null);
    setIsDocLoading(true);
    setDocStatus('Loading link…');
    try {
      const docState = await processDocumentLink(docLinkInput, roomId || 'local', (msg) =>
        setDocStatus(msg)
      );
      onChangeOverlay(
        withPresenter({
          ...overlay,
          active: true,
          mode: 'document',
          templateId: 'document',
          title: docState.title,
          document: docState,
        })
      );
      setDocLinkInput('');
      setDocStatus(null);
    } catch (err: any) {
      setUploadError(err?.message || 'Could not load document link.');
      setDocStatus(null);
    } finally {
      setIsDocLoading(false);
    }
  };

  const handlePageChange = (nextPage: number) => {
    if (!overlay.document) return;
    onChangeOverlay(
      withPresenter({
        ...overlay,
        document: {
          ...overlay.document,
          currentPage: Math.max(1, Math.min(overlay.document.totalPages, nextPage)),
        },
      })
    );
  };

  const filteredTemplates = STAGE_TEMPLATES.filter(
    (t) => filterCat === 'all' || t.category === filterCat
  );

  const isDocActive = overlay.mode === 'document' && !!overlay.document;

  return (
    <div className="space-y-6 text-slate-900">
      {/* Live Card Preview & Stream Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900">Stage Card Preview</p>
            <p className="text-[11px] text-slate-500">
              {overlay.active
                ? overlay.broadcastToParticipants !== false
                  ? 'Live in its own card for everyone in the meeting'
                  : 'Shown on your stage only · Toggle below to share with others'
                : 'Previewing locally · Click Show on Stream to present'}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onChangeOverlay(
                withPresenter({
                  ...overlay,
                  active: !overlay.active,
                })
              )
            }
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-medium transition-colors duration-150 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0',
              overlay.active
                ? 'bg-stone-100 text-slate-900 border border-neutral-300 hover:bg-stone-200/70'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            )}
          >
            {overlay.active ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{overlay.active ? 'Hide from Stream' : 'Show on Stream'}</span>
          </button>
        </div>

        {/* Display Live View to Other Participants Toggle */}
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white border border-neutral-200/80 rounded-xl">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-900">Display Live View to Other Participants</p>
            <p className="text-[11px] text-slate-500 truncate">
              {overlay.broadcastToParticipants !== false
                ? 'Synced live with everyone in the room'
                : 'Private preview — hidden from remote participants'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={overlay.broadcastToParticipants !== false}
            onClick={() =>
              onChangeOverlay(
                withPresenter({
                  ...overlay,
                  broadcastToParticipants: overlay.broadcastToParticipants === false,
                })
              )
            }
            className={cn(
              'w-10 h-5.5 rounded-full transition-colors duration-150 relative inline-flex items-center shrink-0 cursor-pointer p-0.5 outline-none focus-visible:ring-1 focus-visible:ring-emerald-700/50',
              overlay.broadcastToParticipants !== false ? 'bg-emerald-700' : 'bg-neutral-300'
            )}
            title="Toggle visibility for other participants"
          >
            <span
              className={cn(
                'w-4.5 h-4.5 rounded-full bg-white transition-transform shadow-xs block',
                overlay.broadcastToParticipants !== false ? 'translate-x-4.5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-[#FBFBFA] border border-neutral-200/80 shadow-sm">
          <div className="absolute inset-0 w-full h-full">
            <StagePresentationCard
              overlay={overlay}
              roomId={roomId}
              isPreview
              onChangePage={handlePageChange}
            />
          </div>
        </div>

        {/* Inline Slide Pagination Controls when Document is Loaded */}
        {isDocActive && overlay.document && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white border border-neutral-200/80 rounded-xl">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={14} className="text-emerald-700 shrink-0" />
              <span className="text-xs font-medium text-slate-800 truncate">
                {overlay.document.title}
              </span>
            </div>
            {overlay.document.sourceType === 'pages' && overlay.document.totalPages > 1 ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={overlay.document.currentPage <= 1}
                  onClick={() => handlePageChange(overlay.document!.currentPage - 1)}
                  className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-stone-50 text-slate-700 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-mono text-slate-600 tabular-nums px-1.5 whitespace-nowrap">
                  {overlay.document.currentPage} / {overlay.document.totalPages}
                </span>
                <button
                  type="button"
                  disabled={overlay.document.currentPage >= overlay.document.totalPages}
                  onClick={() => handlePageChange(overlay.document!.currentPage + 1)}
                  className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-stone-50 text-slate-700 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
                  title="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-500 shrink-0 whitespace-nowrap">
                {overlay.document.sourceType === 'embed' ? 'Interactive embed' : '1 page'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Category Tabs — Generous Spacing, Zero Truncation */}
      <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl border border-neutral-200/60">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'docs', label: 'Docs & Slides' },
            { id: 'stage', label: 'Stage Cards' },
            { id: 'media', label: 'Media' },
            { id: 'overlay', label: 'Titles' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterCat(tab.id)}
            className={cn(
              'flex-1 py-2 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
              filterCat === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Document & Presentation Sharing */}
      {(filterCat === 'all' || filterCat === 'docs') && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-800">
              Share Document or Presentation
            </label>
            <span className="text-[11px] text-slate-500">PDF, Slides, Images, Links</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDocLoading}
              onClick={() => docFileRef.current?.click()}
              className="flex-1 py-3 px-4 bg-white hover:bg-stone-50 border border-neutral-200 hover:border-slate-400 rounded-xl text-xs font-medium text-slate-800 flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {isDocLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span>{docStatus || 'Upload Document (PDF, Images, Text)'}</span>
            </button>
            <input
              ref={docFileRef}
              type="file"
              multiple
              accept=".pdf,application/pdf,image/*,.txt,.md,.markdown,.csv,.json"
              onChange={handleDocumentUpload}
              className="hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="url"
                value={docLinkInput}
                onChange={(e) => setDocLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleDocumentLinkLoad();
                  }
                }}
                placeholder="Paste Google Slides, PDF, Docs, Canva, or Figma link..."
                className="w-full py-2.5 pl-9 pr-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
              />
            </div>
            <button
              type="button"
              disabled={isDocLoading || !docLinkInput.trim()}
              onClick={() => void handleDocumentLinkLoad()}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Present Link
            </button>
          </div>
          {uploadError && (
            <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-rose-700">{uploadError}</p>
              <SendErrorFeedbackButton errorMessage={uploadError} source="Stage Media & Docs" />
            </div>
          )}
        </div>
      )}

      {/* Templates Grid — Full Readable Labels, No Cropped Text or Nested Scrollbar */}
      {filterCat !== 'docs' && (
        <div className="space-y-3 pt-2 border-t border-neutral-200/70">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-800">
              Templates
            </label>
            <span className="text-[11px] text-slate-500">
              Opens in its own stage card
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {filteredTemplates.map((tpl) => {
              const isSelected = overlay.mode !== 'document' && overlay.templateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => selectTemplate(tpl)}
                  className={cn(
                    'px-3.5 py-3 rounded-xl border text-left text-xs font-medium transition-colors cursor-pointer flex items-center gap-2.5 leading-snug',
                    isSelected
                      ? 'bg-stone-100 text-slate-900 border-slate-900/30'
                      : 'bg-white text-slate-700 border-neutral-200/80 hover:border-slate-400'
                  )}
                >
                  <Layout size={14} className="shrink-0 opacity-60" />
                  <span>{tpl.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Style, Media & Content Editor (shown when editing Templates or Media) */}
      {filterCat !== 'docs' && !isDocActive && (
        <>
          <div className="space-y-2.5 pt-2 border-t border-neutral-200/70">
            <label className="text-xs font-semibold text-slate-800 block">
              Card Surface
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['light', 'dark', 'stone', 'emerald'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    onChangeOverlay(
                      withPresenter({
                        ...overlay,
                        theme: t,
                      })
                    )
                  }
                  className={cn(
                    'py-2 px-3 rounded-xl border text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap',
                    overlay.theme === t
                      ? 'border-slate-900 bg-stone-100 text-slate-900'
                      : 'border-neutral-200/80 bg-white text-slate-600 hover:border-slate-400'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-neutral-200/70">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">
                Stage Image or Video
              </label>
              {(overlay.mediaUrl || overlay.mediaStorageDocId) && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeOverlay(
                      withPresenter({
                        ...overlay,
                        mediaUrl: '',
                        mediaStorageDocId: undefined,
                      })
                    )
                  }
                  className="text-xs text-slate-500 hover:text-rose-700 cursor-pointer whitespace-nowrap"
                >
                  Remove media
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={overlay.mediaUrl.startsWith('data:') ? '' : overlay.mediaUrl}
                onChange={(e) =>
                  onChangeOverlay(
                    withPresenter({
                      ...overlay,
                      active: true,
                      mode: overlay.templateId === 'center-media' ? 'media' : overlay.mode || 'template',
                      mediaUrl: e.target.value,
                      mediaStorageDocId: undefined,
                    })
                  )
                }
                placeholder={
                  overlay.mediaUrl.startsWith('data:') || overlay.mediaStorageDocId
                    ? 'Uploaded image active on card'
                    : 'Paste image or video URL...'
                }
                className="flex-1 py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-3.5 py-2.5 bg-white hover:bg-stone-50 border border-neutral-200 hover:border-slate-400 rounded-xl text-xs font-medium text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ImageIcon size={13} />
                <span>Upload Image</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleMediaFileUpload}
                className="hidden"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-neutral-200/70">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Title</label>
              <input
                type="text"
                value={overlay.title}
                onChange={(e) =>
                  onChangeOverlay(withPresenter({ ...overlay, title: e.target.value }))
                }
                placeholder="Main headline..."
                className="w-full py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
              />
            </div>

            {overlay.templateId !== 'announcement' && overlay.templateId !== 'center-media' && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Subtitle</label>
                <input
                  type="text"
                  value={overlay.subtitle}
                  onChange={(e) =>
                    onChangeOverlay(withPresenter({ ...overlay, subtitle: e.target.value }))
                  }
                  placeholder="Subtitle or role..."
                  className="w-full py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                />
              </div>
            )}

            {(overlay.templateId === 'lyric' ||
              overlay.templateId === 'welcome' ||
              overlay.templateId === 'starting-soon' ||
              overlay.templateId === 'brb' ||
              overlay.templateId === 'closing' ||
              overlay.templateId === 'media-split' ||
              overlay.templateId === 'qa-prompt' ||
              overlay.templateId === 'contact-card') && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Body Text</label>
                <textarea
                  rows={3}
                  value={overlay.body}
                  onChange={(e) =>
                    onChangeOverlay(withPresenter({ ...overlay, body: e.target.value }))
                  }
                  placeholder="Enter stage text..."
                  className="w-full py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 resize-none"
                />
              </div>
            )}

            {(overlay.templateId === 'quote' ||
              overlay.templateId === 'closing' ||
              overlay.templateId === 'contact-card' ||
              overlay.templateId === 'performance-title') && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Credit / Link
                </label>
                <input
                  type="text"
                  value={overlay.meta}
                  onChange={(e) =>
                    onChangeOverlay(withPresenter({ ...overlay, meta: e.target.value }))
                  }
                  placeholder="Attribution or URL..."
                  className="w-full py-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                />
              </div>
            )}

            {overlay.templateId === 'agenda' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">Agenda Items</label>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeOverlay(
                        withPresenter({
                          ...overlay,
                          points: [...(overlay.points || []), 'New agenda point'],
                        })
                      )
                    }
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Plus size={12} />
                    <span>Add item</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {(overlay.points || []).map((pt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={pt}
                        onChange={(e) => {
                          const nextPts = [...(overlay.points || [])];
                          nextPts[i] = e.target.value;
                          onChangeOverlay(withPresenter({ ...overlay, points: nextPts }));
                        }}
                        className="flex-1 py-2 px-3 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextPts = (overlay.points || []).filter((_, idx) => idx !== i);
                          onChangeOverlay(withPresenter({ ...overlay, points: nextPts }));
                        }}
                        className="p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
