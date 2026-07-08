import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  id: string; // persistence key
  side: 'left' | 'right' | 'bottom';
  defaultSize: number;
  min: number;
  max: number;
  children: ReactNode;
}

/** A panel with one draggable hairline edge; size persists to localStorage. */
export function ResizablePanel({ id, side, defaultSize, min, max, children }: Props) {
  const key = `ms-pane-${id}`;
  const [size, setSize] = useState<number>(() => {
    const saved = Number(localStorage.getItem(key));
    return saved >= min && saved <= max ? saved : defaultSize;
  });
  const dragging = useRef(false);

  useEffect(() => {
    localStorage.setItem(key, String(size));
  }, [key, size]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const start = side === 'bottom' ? e.clientY : e.clientX;
      const startSize = size;
      const move = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const cur = side === 'bottom' ? ev.clientY : ev.clientX;
        const delta = side === 'left' ? cur - start : start - cur;
        setSize(Math.min(max, Math.max(min, startSize + delta)));
      };
      const up = () => {
        dragging.current = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [side, size, min, max],
  );

  const isVert = side !== 'bottom';
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 5,
    ...(isVert
      ? {
          top: 0,
          bottom: 0,
          width: 5,
          cursor: 'col-resize',
          [side === 'left' ? 'right' : 'left']: -2,
        }
      : { left: 0, right: 0, height: 5, cursor: 'row-resize', top: -2 }),
  };

  return (
    <div
      style={{
        position: 'relative',
        flexShrink: 0,
        ...(isVert ? { width: size } : { height: size }),
      }}
    >
      {children}
      <div
        onPointerDown={onPointerDown}
        style={handleStyle}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.background = 'var(--primary-border)')}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
      />
    </div>
  );
}
