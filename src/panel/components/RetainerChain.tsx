import type { RetainerStep } from '@/shared/leak';

/**
 * The signature visual: "what keeps this alive" rendered as a chain from the
 * leaked object up to the GC root. Each link is a node; the label between
 * links is the edge (property) name holding the reference.
 */
export function RetainerChain({ path }: { path: RetainerStep[] }) {
  if (path.length === 0) {
    return <span className="muted">No strong retainer path resolved.</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {path.map((step, i) => (
        <div key={`${step.nodeId}-${i}`} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 14,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                marginTop: 6,
                background: i === 0 ? 'var(--danger)' : i === path.length - 1 ? 'var(--success)' : 'var(--primary)',
                boxShadow: i === 0 ? '0 0 6px var(--danger)' : undefined,
                flexShrink: 0,
              }}
            />
            {i < path.length - 1 && (
              <span style={{ width: 1, flex: 1, background: 'var(--border)', minHeight: 10 }} />
            )}
          </div>
          <div style={{ paddingBottom: i < path.length - 1 ? 8 : 0, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 'var(--fs-sm)', wordBreak: 'break-all' }}>
              {step.nodeName || (i === path.length - 1 ? '(GC root)' : '(anonymous)')}
              <span className="muted" style={{ marginLeft: 6, fontSize: 'var(--fs-xs)' }}>
                {step.nodeType}
              </span>
            </div>
            {step.edgeName && (
              <div className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>
                holds via <span style={{ color: 'var(--warning)' }}>.{step.edgeName}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StackTrace({ stack }: { stack: string[] }) {
  if (stack.length === 0) return <span className="muted">No creation stack captured.</span>;
  return (
    <pre
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--s-2)',
        overflow: 'auto',
        maxHeight: 160,
        fontSize: 'var(--fs-xs)',
        lineHeight: 1.6,
        color: 'var(--muted)',
      }}
    >
      {stack.join('\n')}
    </pre>
  );
}
