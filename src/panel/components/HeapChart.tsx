import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useSessionState } from '../runtime';
import { formatBytes } from '@/shared/leak';

/** Heap-usage timeline: agent memory samples + snapshot markers. Drag to zoom, dbl-click to reset. */
export function HeapChart({ height }: { height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const events = useSessionState((s) => s.events);
  const snapshots = useSessionState((s) => s.snapshots);

  const data = useMemo<uPlot.AlignedData>(() => {
    const ts: number[] = [];
    const used: number[] = [];
    for (const e of events) {
      if (e.kind === 'memory-sample') {
        ts.push(e.t / 1000);
        used.push(e.usedJSHeapSize);
      }
    }
    return [ts, used];
  }, [events]);

  const snapshotTimes = useMemo(() => snapshots.map((s) => s.time / 1000), [snapshots]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: height - 8,
      cursor: { drag: { x: true, y: false } },
      legend: { show: false },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: '#94a3b8',
          grid: { stroke: 'rgba(39, 52, 73, 0.5)' },
          ticks: { stroke: 'rgba(39, 52, 73, 0.5)' },
          font: '10px Inter, sans-serif',
        },
        {
          stroke: '#94a3b8',
          grid: { stroke: 'rgba(39, 52, 73, 0.5)' },
          ticks: { stroke: 'rgba(39, 52, 73, 0.5)' },
          font: '10px Inter, sans-serif',
          size: 64,
          values: (_u, vals) => vals.map((v) => formatBytes(v)),
        },
      ],
      series: [
        {},
        {
          label: 'JS heap',
          stroke: '#4f8cff',
          width: 1.5,
          fill: 'rgba(79, 140, 255, 0.08)',
          points: { show: false },
        },
      ],
      hooks: {
        drawClear: [
          (u) => {
            // snapshot markers as vertical lines
            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
            ctx.setLineDash([4, 4]);
            for (const t of snapshotTimes) {
              const x = u.valToPos(t, 'x', true);
              if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
              ctx.beginPath();
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
              ctx.stroke();
            }
            ctx.restore();
          },
        ],
      },
    };

    const plot = new uPlot(opts, data, el);
    plotRef.current = plot;
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: height - 8 }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // recreate when marker set changes (hooks capture snapshotTimes)
  }, [snapshotTimes, height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data]);

  const empty = data[0].length === 0;
  return (
    <div style={{ position: 'relative', height: '100%', padding: '4px 0' }}>
      <div ref={containerRef} style={{ height: '100%', opacity: empty ? 0.3 : 1 }} />
      {empty && (
        <div
          className="muted"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--fs-sm)',
            pointerEvents: 'none',
          }}
        >
          Heap timeline appears here once the page agent starts sampling.
        </div>
      )}
    </div>
  );
}
