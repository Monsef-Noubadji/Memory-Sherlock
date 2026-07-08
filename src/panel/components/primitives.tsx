import type { CSSProperties, ReactNode } from 'react';
import type { Severity } from '@/shared/leak';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const colors: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: 'var(--hover)', fg: 'var(--muted)' },
    primary: { bg: 'var(--primary-dim)', fg: 'var(--primary)' },
    success: { bg: 'var(--success-dim)', fg: 'var(--success)' },
    warning: { bg: 'var(--warning-dim)', fg: 'var(--warning)' },
    danger: { bg: 'var(--danger-dim)', fg: 'var(--danger)' },
  };
  const c = colors[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 8px',
        borderRadius: 999,
        fontSize: 'var(--fs-xs)',
        fontWeight: 500,
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function SeverityStars({ severity }: { severity: Severity }) {
  const color = severity >= 4 ? 'var(--danger)' : severity >= 3 ? 'var(--warning)' : 'var(--muted)';
  return (
    <span aria-label={`severity ${severity} of 5`} style={{ color, letterSpacing: 1, fontSize: 'var(--fs-sm)' }}>
      {'★'.repeat(severity)}
      <span style={{ opacity: 0.25 }}>{'★'.repeat(5 - severity)}</span>
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const tone = value >= 85 ? 'var(--success)' : value >= 60 ? 'var(--warning)' : 'var(--muted)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 48,
          height: 4,
          borderRadius: 2,
          background: 'var(--border)',
          overflow: 'hidden',
          display: 'inline-block',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${value}%`,
            height: '100%',
            background: tone,
            transition: 'width var(--t-med) var(--ease)',
          }}
        />
      </span>
      <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: tone }}>
        {value}%
      </span>
    </span>
  );
}

export function Card({
  children,
  onClick,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className="ms-card"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--s-3)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'border-color var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-border)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = 'default',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
}) {
  const styles: Record<string, CSSProperties> = {
    default: { background: 'var(--card)', border: '1px solid var(--border)' },
    primary: { background: 'var(--primary)', color: '#fff', border: '1px solid transparent' },
    ghost: { background: 'transparent', color: 'var(--muted)', border: '1px solid transparent' },
    danger: { background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid transparent' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 'var(--radius)',
        fontSize: 'var(--fs-sm)',
        fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity var(--t-fast) var(--ease), background var(--t-fast) var(--ease)',
        ...styles[kind],
      }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--s-2)',
        padding: 'var(--s-5)',
        textAlign: 'center',
        color: 'var(--muted)',
        height: '100%',
        minHeight: 160,
      }}
    >
      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {hint && <div style={{ fontSize: 'var(--fs-sm)', maxWidth: 380 }}>{hint}</div>}
      {action}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 'var(--fs-xs)',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        marginBottom: 'var(--s-2)',
      }}
    >
      {children}
    </div>
  );
}
