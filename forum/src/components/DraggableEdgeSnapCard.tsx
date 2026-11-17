import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

interface DraggableEdgeSnapCardProps {
  children: React.ReactNode;
  className?: string;
  boundsMode?: 'viewport' | 'container';
  containerRef?: React.RefObject<HTMLDivElement | null>;
  padding?: number;
  initialCorner?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  onSnapSideChange?: (side: 'left' | 'right') => void;
}

export default function DraggableEdgeSnapCard({
  children,
  className,
  boundsMode = 'viewport',
  containerRef,
  padding = 12,
  initialCorner = 'bottom-right',
  onSnapSideChange,
}: DraggableEdgeSnapCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const posRef = useRef<{ x: number; y: number } | null>(null);
  posRef.current = pos;

  const onSnapSideChangeRef = useRef(onSnapSideChange);
  onSnapSideChangeRef.current = onSnapSideChange;

  const dragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const getBounds = useCallback(() => {
    const cardEl = cardRef.current;
    const cardW = cardEl?.offsetWidth || 160;
    const cardH = cardEl?.offsetHeight || 160;

    let areaW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    let areaH = typeof window !== 'undefined' ? window.innerHeight : 768;

    if (boundsMode === 'container' && containerRef?.current) {
      areaW = containerRef.current.clientWidth || areaW;
      areaH = containerRef.current.clientHeight || areaH;
    }

    const minX = padding;
    const maxX = Math.max(padding, areaW - cardW - padding);
    const minY = padding;
    const maxY = Math.max(padding, areaH - cardH - padding);

    return { cardW, cardH, areaW, areaH, minX, maxX, minY, maxY };
  }, [boundsMode, containerRef, padding]);

  const computeInitialPos = useCallback(() => {
    const { minX, maxX, minY, maxY } = getBounds();
    const x = initialCorner.includes('left') ? minX : maxX;
    const y = initialCorner.includes('top') ? minY : maxY;
    return { x, y };
  }, [getBounds, initialCorner]);

  // Initialize and keep clipped inside bounds on resize / orientation change
  useEffect(() => {
    const syncBounds = () => {
      const { minX, maxX, minY, maxY, areaW, cardW } = getBounds();
      setPos((prev) => {
        if (!prev) {
          return computeInitialPos();
        }
        const snappedX = prev.x + cardW / 2 < areaW / 2 ? minX : maxX;
        const clampedY = Math.max(minY, Math.min(maxY, prev.y));
        if (Math.abs(prev.x - snappedX) < 0.5 && Math.abs(prev.y - clampedY) < 0.5) {
          return prev;
        }
        return { x: snappedX, y: clampedY };
      });
    };

    syncBounds();
    const rafId = requestAnimationFrame(syncBounds);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncBounds);
      if (cardRef.current) observer.observe(cardRef.current);
      if (boundsMode === 'container' && containerRef?.current) {
        observer.observe(containerRef.current);
      }
    }

    window.addEventListener('resize', syncBounds);
    return () => {
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', syncBounds);
    };
  }, [boundsMode, computeInitialPos, containerRef, getBounds]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dx = e.clientX - session.startClientX;
      const dy = e.clientY - session.startClientY;

      if (!session.moved && Math.hypot(dx, dy) < 4) return;
      session.moved = true;
      setIsDragging(true);

      const { minX, maxX, minY, maxY } = getBounds();
      const nextX = Math.max(minX, Math.min(maxX, session.originX + dx));
      const nextY = Math.max(minY, Math.min(maxY, session.originY + dy));
      setPos({ x: nextX, y: nextY });
    };

    const handlePointerEnd = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const hadMoved = session.moved;
      dragSessionRef.current = null;
      setIsDragging(false);

      if (!hadMoved) return;

      const { minX, maxX, minY, maxY, areaW, areaH, cardW, cardH } = getBounds();
      const current = posRef.current || computeInitialPos();

      const snapLeft = current.x + cardW / 2 < areaW / 2;
      const snappedX = snapLeft ? minX : maxX;

      let snappedY = Math.max(minY, Math.min(maxY, current.y));
      if (snappedY - minY < 28) {
        snappedY = minY;
      } else if (maxY - snappedY < 28) {
        snappedY = maxY;
      } else if (areaH < cardH + padding * 2) {
        snappedY = minY;
      }

      setPos({ x: snappedX, y: snappedY });
      onSnapSideChangeRef.current?.(snapLeft ? 'left' : 'right');
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [computeInitialPos, getBounds, padding]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [data-no-drag="true"]')) {
      return;
    }

    const currentPos = posRef.current || computeInitialPos();
    if (!posRef.current) setPos(currentPos);

    dragSessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: currentPos.x,
      originY: currentPos.y,
      moved: false,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const resolvedPos = pos || computeInitialPos();

  return (
    <div
      ref={cardRef}
      onPointerDown={handlePointerDown}
      style={{
        position: boundsMode === 'viewport' ? 'fixed' : 'absolute',
        left: `${resolvedPos.x}px`,
        top: `${resolvedPos.y}px`,
        touchAction: 'none',
        transition: isDragging
          ? 'none'
          : 'left 260ms cubic-bezier(0.22, 1, 0.36, 1), top 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease-out',
      }}
      className={cn(
        'select-none',
        isDragging ? 'cursor-grabbing shadow-2xl ring-2 ring-white/25' : 'cursor-grab',
        className
      )}
    >
      {children}
    </div>
  );
}
