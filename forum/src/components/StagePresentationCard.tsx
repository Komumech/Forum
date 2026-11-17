import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { StageOverlayState, StageOverlayTheme } from '../types/stage';
import {
  fetchDocumentPage,
  getCachedDocumentPage,
  preloadAllDocumentPages,
  type StageDocumentPageData,
} from '../utils/documentShare';

interface StagePresentationCardProps {
  overlay: StageOverlayState;
  roomId?: string;
  isCompact?: boolean;
  isPreview?: boolean;
  isPinned?: boolean;
  canControl?: boolean;
  showName?: boolean;
  onTogglePin?: () => void;
  onDismiss?: () => void;
  onChangePage?: (nextPage: number) => void;
}

function getCardThemeSurface(theme: StageOverlayTheme) {
  switch (theme) {
    case 'light':
      return 'bg-[#FBFBFA] text-slate-900';
    case 'stone':
      return 'bg-stone-100 text-slate-900';
    case 'emerald':
      return 'bg-[#10241d] text-emerald-50';
    case 'dark':
    default:
      return 'bg-[#141518] text-slate-50';
  }
}

function getSubtextClass(theme: StageOverlayTheme) {
  return theme === 'light' || theme === 'stone' ? 'text-slate-500' : 'text-slate-300';
}

export default function StagePresentationCard({
  overlay,
  roomId,
  isCompact = false,
  isPreview = false,
  isPinned = false,
  canControl = true,
  showName = true,
  onTogglePin,
  onDismiss,
  onChangePage,
}: StagePresentationCardProps) {
  const isLightLike = overlay.theme === 'light' || overlay.theme === 'stone';
  const surfaceCls = getCardThemeSurface(overlay.theme);
  const subCls = getSubtextClass(overlay.theme);

  const docState = overlay.mode === 'document' ? overlay.document : null;
  const currentPageNum = Math.max(1, docState?.currentPage || 1);

  const [resolvedPage, setResolvedPage] = useState<StageDocumentPageData | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string>(overlay.mediaUrl || '');
  const [isResolvingMedia, setIsResolvingMedia] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState(false);

  // Resolve large media image stored via Firestore stageDocs if needed
  useEffect(() => {
    setMediaLoadError(false);
    if (overlay.mediaUrl) {
      setResolvedMediaUrl(overlay.mediaUrl);
      setIsResolvingMedia(false);
      return;
    }
    if (!overlay.mediaStorageDocId || !roomId) {
      setResolvedMediaUrl('');
      setIsResolvingMedia(false);
      return;
    }
    const cached = getCachedDocumentPage(overlay.mediaStorageDocId, 1);
    if (cached?.imageUrl) {
      setResolvedMediaUrl(cached.imageUrl);
      setIsResolvingMedia(false);
      return;
    }
    let cancelled = false;
    setIsResolvingMedia(true);
    fetchDocumentPage(roomId, overlay.mediaStorageDocId, 1)
      .then((p) => {
        if (!cancelled && p?.imageUrl) setResolvedMediaUrl(p.imageUrl);
      })
      .finally(() => {
        if (!cancelled) setIsResolvingMedia(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overlay.mediaUrl, overlay.mediaStorageDocId, roomId]);

  // Preload & resolve current document page
  useEffect(() => {
    if (!docState || docState.sourceType !== 'pages') {
      setResolvedPage(null);
      return;
    }

    const inlineMatch = docState.inlinePages?.find((p) => p.pageNumber === currentPageNum);
    if (inlineMatch) {
      setResolvedPage(inlineMatch);
      setIsLoadingPage(false);
      return;
    }

    const cached = getCachedDocumentPage(docState.docId, currentPageNum);
    if (cached) {
      setResolvedPage(cached);
      setIsLoadingPage(false);
      return;
    }

    if (!roomId) return;

    let cancelled = false;
    setIsLoadingPage(true);
    fetchDocumentPage(roomId, docState.docId, currentPageNum)
      .then((page) => {
        if (!cancelled) {
          setResolvedPage(page);
          setIsLoadingPage(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingPage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [docState?.docId, docState?.sourceType, docState?.inlinePages, currentPageNum, roomId]);

  useEffect(() => {
    if (docState?.docId && docState.sourceType === 'pages' && roomId) {
      void preloadAllDocumentPages(roomId, docState.docId);
    }
  }, [docState?.docId, docState?.sourceType, roomId]);

  const effectiveMediaUrl = resolvedMediaUrl || overlay.mediaUrl || '';
  const hasVideo = /\.(mp4|webm|mov)(\?|$)/i.test(effectiveMediaUrl);

  const renderDocumentBody = () => {
    if (!docState) return null;

    if (docState.sourceType === 'embed' && docState.embedUrl) {
      return (
        <div className="relative w-full h-full bg-[#111215]">
          <iframe
            src={docState.embedUrl}
            title={docState.title}
            className="w-full h-full border-0 bg-white"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          />
          {isCompact && <div className="absolute inset-0 bg-transparent" />}
        </div>
      );
    }

    if (isLoadingPage && !resolvedPage) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#141517] text-slate-300 gap-2">
          <div className="w-5 h-5 border-2 border-white/25 border-t-white rounded-full animate-spin" />
          {!isCompact && <span className="text-xs text-slate-400">Loading page {currentPageNum}…</span>}
        </div>
      );
    }

    if (resolvedPage?.kind === 'text') {
      return (
        <div
          className={cn(
            'w-full h-full flex flex-col justify-center overflow-hidden',
            surfaceCls,
            isCompact ? 'p-3' : isPreview ? 'p-4' : 'p-6 sm:p-10'
          )}
        >
          {resolvedPage.heading && (
            <p
              className={cn(
                'font-mono uppercase tracking-wider opacity-60 truncate mb-2',
                isCompact ? 'text-[8px]' : isPreview ? 'text-[9px]' : 'text-xs'
              )}
            >
              {resolvedPage.heading}
            </p>
          )}
          <div
            className={cn(
              'whitespace-pre-wrap leading-relaxed overflow-y-auto custom-scroll font-normal',
              isCompact ? 'text-[9px]' : isPreview ? 'text-[10px]' : 'text-xs sm:text-base'
            )}
          >
            {resolvedPage.text}
          </div>
        </div>
      );
    }

    if (resolvedPage?.imageUrl) {
      return (
        <div className="w-full h-full bg-[#111215] flex items-center justify-center overflow-hidden">
          <img
            src={resolvedPage.imageUrl}
            alt={`${docState.title} — Page ${currentPageNum}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain select-none"
          />
        </div>
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center bg-[#141517] text-slate-400 text-xs">
        Document ready to present
      </div>
    );
  };

  const renderTemplateOrMediaBody = () => {
    const isImageOnly = overlay.templateId === 'center-media';

    if (isImageOnly) {
      return (
        <div className={cn('w-full h-full flex flex-col items-center justify-center', surfaceCls, isCompact ? 'p-2' : isPreview ? 'p-3' : 'p-4 sm:p-6')}>
          {isResolvingMedia && !effectiveMediaUrl ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 opacity-75">
              <div className="w-5 h-5 border-2 border-current/25 border-t-current rounded-full animate-spin" />
              {!isCompact && <span className="text-xs">Loading stage media…</span>}
            </div>
          ) : effectiveMediaUrl && !mediaLoadError ? (
            <div className="flex-1 min-h-0 w-full rounded-xl overflow-hidden flex items-center justify-center bg-black/10">
              {hasVideo ? (
                <video
                  src={effectiveMediaUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={() => setMediaLoadError(true)}
                  className={cn('w-full h-full', overlay.mediaFit === 'cover' ? 'object-cover' : 'object-contain')}
                />
              ) : (
                <img
                  src={effectiveMediaUrl}
                  alt={overlay.title || 'Stage media'}
                  referrerPolicy="no-referrer"
                  onError={() => setMediaLoadError(true)}
                  className={cn('w-full h-full', overlay.mediaFit === 'cover' ? 'object-cover' : 'object-contain')}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center gap-2 opacity-65 px-4">
              <ImageIcon size={isCompact ? 18 : 28} />
              {!isCompact && (
                <span className="text-xs">
                  {mediaLoadError
                    ? 'Unable to load this external media URL'
                    : 'Upload an image or paste a media URL'}
                </span>
              )}
            </div>
          )}
          {overlay.title && !isCompact && (
            <p className={cn('pt-2 font-medium tracking-tight text-center truncate max-w-full', isPreview ? 'text-[11px]' : 'text-sm')}>
              {overlay.title}
            </p>
          )}
        </div>
      );
    }

    if (overlay.templateId === 'media-split') {
      return (
        <div className={cn('w-full h-full grid grid-cols-2', surfaceCls)}>
          <div className="bg-black/10 h-full flex items-center justify-center overflow-hidden">
            {isResolvingMedia && !effectiveMediaUrl ? (
              <div className="w-5 h-5 border-2 border-current/25 border-t-current rounded-full animate-spin" />
            ) : effectiveMediaUrl && !mediaLoadError ? (
              hasVideo ? (
                <video src={effectiveMediaUrl} autoPlay loop muted playsInline onError={() => setMediaLoadError(true)} className="w-full h-full object-cover" />
              ) : (
                <img src={effectiveMediaUrl} alt={overlay.title} referrerPolicy="no-referrer" onError={() => setMediaLoadError(true)} className="w-full h-full object-cover" />
              )
            ) : (
              <div className="flex flex-col items-center gap-1.5 opacity-45 px-3 text-center">
                <ImageIcon size={isCompact ? 16 : 26} />
                {mediaLoadError && !isCompact && <span className="text-[11px]">Media unavailable</span>}
              </div>
            )}
          </div>
          <div className={cn('flex flex-col justify-center min-w-0', isCompact ? 'p-2.5' : isPreview ? 'p-3.5 space-y-1' : 'p-6 sm:p-8 space-y-2.5')}>
            <h3 className={cn('font-light tracking-tight leading-snug line-clamp-2', isCompact ? 'text-[10px]' : isPreview ? 'text-xs' : 'text-xl sm:text-2xl')}>
              {overlay.title}
            </h3>
            {!isCompact && overlay.subtitle && (
              <p className={cn('font-normal line-clamp-2', isPreview ? 'text-[10px]' : 'text-xs sm:text-sm', subCls)}>
                {overlay.subtitle}
              </p>
            )}
            {!isCompact && !isPreview && overlay.body && (
              <p className={cn('text-xs leading-relaxed whitespace-pre-line line-clamp-4', subCls)}>
                {overlay.body}
              </p>
            )}
          </div>
        </div>
      );
    }

    if (overlay.templateId === 'agenda') {
      return (
        <div className={cn('w-full h-full flex flex-col justify-center overflow-hidden', surfaceCls, isCompact ? 'p-3' : isPreview ? 'p-4 space-y-2' : 'p-7 sm:p-10 space-y-4')}>
          <div className="space-y-0.5 min-w-0">
            <h3 className={cn('font-light tracking-tight truncate', isCompact ? 'text-[11px]' : isPreview ? 'text-sm' : 'text-2xl sm:text-3xl')}>
              {overlay.title}
            </h3>
            {!isCompact && overlay.subtitle && (
              <p className={cn(isPreview ? 'text-[10px]' : 'text-xs sm:text-sm', subCls)}>{overlay.subtitle}</p>
            )}
          </div>
          {!isCompact && (
            <div className="divide-y divide-current/10 border-t border-current/10">
              {(overlay.points || []).filter(Boolean).slice(0, isPreview ? 3 : 6).map((pt, idx) => (
                <div key={idx} className={cn('flex items-baseline gap-3', isPreview ? 'py-1.5' : 'py-2.5')}>
                  <span className={cn('font-mono opacity-50 tabular-nums shrink-0', isPreview ? 'text-[9px]' : 'text-xs')}>
                    0{idx + 1}
                  </span>
                  <span className={cn('font-normal leading-snug truncate', isPreview ? 'text-[10px]' : 'text-sm sm:text-base')}>
                    {pt}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (overlay.templateId === 'quote') {
      return (
        <div className={cn('w-full h-full flex flex-col items-center justify-center text-center overflow-hidden', surfaceCls, isCompact ? 'p-3' : isPreview ? 'p-4 space-y-2' : 'p-8 sm:p-12 space-y-4')}>
          <p className={cn('font-light tracking-tight leading-snug line-clamp-4', isCompact ? 'text-[10px]' : isPreview ? 'text-xs' : 'text-xl sm:text-3xl')}>
            “{overlay.title}”
          </p>
          {!isCompact && (overlay.meta || overlay.subtitle) && (
            <p className={cn(isPreview ? 'text-[10px]' : 'text-xs sm:text-sm', subCls)}>
              {overlay.meta || overlay.subtitle}
            </p>
          )}
        </div>
      );
    }

    if (overlay.templateId === 'lyric') {
      return (
        <div className={cn('w-full h-full flex flex-col items-center justify-center text-center overflow-hidden', surfaceCls, isCompact ? 'p-3' : isPreview ? 'p-4 space-y-1.5' : 'p-8 sm:p-10 space-y-3')}>
          {!isCompact && overlay.subtitle && (
            <p className={cn('uppercase tracking-widest font-mono', isPreview ? 'text-[9px]' : 'text-xs', subCls)}>
              {overlay.subtitle}
            </p>
          )}
          <div className={cn('font-light leading-relaxed whitespace-pre-line line-clamp-5', isCompact ? 'text-[10px]' : isPreview ? 'text-[11px]' : 'text-base sm:text-2xl')}>
            {overlay.body || overlay.title}
          </div>
        </div>
      );
    }

    if (
      overlay.templateId === 'lower-third' ||
      overlay.templateId === 'guest-spotlight' ||
      overlay.templateId === 'performance-title' ||
      overlay.templateId === 'announcement'
    ) {
      return (
        <div className={cn('w-full h-full flex items-center justify-center overflow-hidden', surfaceCls, isCompact ? 'p-3' : isPreview ? 'p-4' : 'p-8 sm:p-12')}>
          <div className={cn('w-full max-w-2xl flex items-center gap-4', isCompact ? 'gap-2' : '')}>
            {effectiveMediaUrl && (
              <div className={cn('rounded-xl overflow-hidden shrink-0 border border-current/15', isCompact ? 'w-8 h-8' : isPreview ? 'w-11 h-11' : 'w-16 h-16 sm:w-20 sm:h-20')}>
                <img src={effectiveMediaUrl} alt={overlay.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={cn('min-w-0 flex-1 space-y-1 pl-3 border-l-2 border-emerald-600', isCompact && 'pl-2')}>
              {!isCompact && overlay.meta && (
                <p className={cn('font-mono uppercase tracking-wider opacity-60', isPreview ? 'text-[8px]' : 'text-xs')}>
                  {overlay.meta}
                </p>
              )}
              <h3 className={cn('font-light tracking-tight leading-tight line-clamp-2', isCompact ? 'text-[11px]' : isPreview ? 'text-sm' : 'text-2xl sm:text-3xl')}>
                {overlay.title}
              </h3>
              {!isCompact && overlay.subtitle && (
                <p className={cn('truncate', isPreview ? 'text-[10px]' : 'text-sm sm:text-base', subCls)}>
                  {overlay.subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    /* Welcome, Starting Soon, BRB, Closing, Q&A Prompt, Contact Card */
    return (
      <div className={cn('w-full h-full flex flex-col items-center justify-center text-center overflow-hidden', surfaceCls, isCompact ? 'p-3 space-y-1' : isPreview ? 'p-4 space-y-1.5' : 'p-8 sm:p-10 space-y-3')}>
        {!isCompact && effectiveMediaUrl && (
          <div className={cn('mx-auto rounded-2xl overflow-hidden border border-current/10 shrink-0', isPreview ? 'w-10 h-10' : 'w-20 h-20')}>
            <img src={effectiveMediaUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="space-y-1 max-w-full">
          <h3 className={cn('font-light tracking-tight leading-tight line-clamp-2', isCompact ? 'text-[11px]' : isPreview ? 'text-sm' : 'text-2xl sm:text-4xl')}>
            {overlay.title}
          </h3>
          {!isCompact && overlay.subtitle && (
            <p className={cn('font-normal line-clamp-2', isPreview ? 'text-[10px]' : 'text-sm sm:text-base', subCls)}>
              {overlay.subtitle}
            </p>
          )}
        </div>
        {!isCompact && overlay.body && (
          <p className={cn('leading-relaxed max-w-md mx-auto whitespace-pre-line line-clamp-3', isPreview ? 'text-[9px]' : 'text-xs sm:text-sm', subCls)}>
            {overlay.body}
          </p>
        )}
        {!isCompact && !isPreview && overlay.meta && (
          <p className="text-xs font-mono opacity-60 pt-1">{overlay.meta}</p>
        )}
      </div>
    );
  };

  const labelText = docState
    ? docState.title
    : overlay.title || 'Stage Card';

  return (
    <div
      className={cn(
        'group relative w-full h-full rounded-2xl overflow-hidden border select-none block',
        isLightLike && !docState ? 'bg-[#FBFBFA] border-neutral-200/80' : 'bg-[#141517] border-white/10'
      )}
    >
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        {docState ? renderDocumentBody() : renderTemplateOrMediaBody()}
      </div>

      {/* Top-Right Action Controls (Pin, Open External Link, Stop Presenting) */}
      {!isCompact && !isPreview && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {docState?.externalUrl && (
            <a
              href={docState.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg bg-black/55 hover:bg-black/80 text-white/85 hover:text-white backdrop-blur-md border border-white/10 transition-colors"
              title="Open original document link"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {onTogglePin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              className={cn(
                'p-2 rounded-lg backdrop-blur-md border border-white/10 transition-colors cursor-pointer',
                isPinned ? 'bg-emerald-700 text-white' : 'bg-black/55 text-white/80 hover:bg-black/80 hover:text-white'
              )}
              title={isPinned ? 'Unpin card' : 'Pin card'}
            >
              {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          )}
          {canControl && onDismiss && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-2 rounded-lg bg-black/55 hover:bg-rose-600 text-white/85 hover:text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
              title="Remove from live stage"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Simple & Minimal Next / Back Pagination Bar for Document Slides */}
      {docState && docState.sourceType === 'pages' && docState.totalPages > 1 && !isCompact && (
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/75 backdrop-blur-md border border-white/15 rounded-xl shadow-xl',
            isPreview ? 'bottom-2 px-1.5 py-0.5' : 'bottom-3 px-2 py-1'
          )}
        >
          <button
            type="button"
            disabled={currentPageNum <= 1}
            onClick={(e) => {
              e.stopPropagation();
              onChangePage?.(Math.max(1, currentPageNum - 1));
            }}
            className="p-1.5 rounded-lg text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Previous page"
          >
            <ChevronLeft size={isPreview ? 13 : 16} />
          </button>
          <span className={cn('font-mono text-white/90 tabular-nums px-1.5 whitespace-nowrap', isPreview ? 'text-[10px]' : 'text-xs')}>
            {currentPageNum} / {docState.totalPages}
          </span>
          <button
            type="button"
            disabled={currentPageNum >= docState.totalPages}
            onClick={(e) => {
              e.stopPropagation();
              onChangePage?.(Math.min(docState.totalPages, currentPageNum + 1));
            }}
            className="p-1.5 rounded-lg text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Next page"
          >
            <ChevronRight size={isPreview ? 13 : 16} />
          </button>
        </div>
      )}

      {/* Bottom-left Stage Card Label matching Participant Tiles */}
      {showName && !isPreview && (
        <div
          className={cn(
            'absolute flex items-center gap-1.5 bg-black/65 backdrop-blur-md rounded-lg border border-white/10 pointer-events-none z-10',
            isCompact ? 'bottom-1.5 left-1.5 px-2 py-0.5' : 'bottom-3 left-3 px-3 py-1.5'
          )}
        >
          {docState ? (
            <FileText size={isCompact ? 11 : 13} className="text-emerald-400 shrink-0" />
          ) : (
            <Layers size={isCompact ? 11 : 13} className="text-emerald-400 shrink-0" />
          )}
          <span
            className={cn(
              'text-white font-medium truncate',
              isCompact ? 'text-[10px] max-w-[95px]' : 'text-[12px] max-w-[190px]'
            )}
          >
            {labelText}
          </span>
        </div>
      )}
    </div>
  );
}
