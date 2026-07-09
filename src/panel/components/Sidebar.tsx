import { NAV } from '../nav';
import { Icon } from './Icon';
import { useAnalysisState, useUiState } from '../runtime';

export function Sidebar() {
  const route = useUiState((s) => s.route);
  const navigate = useUiState((s) => s.navigate);
  const candidateCount = useAnalysisState((s) => s.result?.candidates.length ?? 0);

  return (
    <nav
      style={{
        width: 176,
        flexShrink: 0,
        background: 'var(--panel)',
        borderRight: '1px solid var(--border)',
        padding: 'var(--s-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
      }}
    >
      {NAV.map((item) => {
        const active = route === item.route;
        return (
          <button
            key={item.route}
            onClick={() => navigate(item.route)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 'var(--radius)',
              fontSize: 'var(--fs-sm)',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--text)' : 'var(--muted)',
              background: active ? 'var(--primary-dim)' : 'transparent',
              transition: 'background var(--t-fast) var(--ease), color var(--t-fast) var(--ease)',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'var(--hover)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ color: active ? 'var(--primary)' : 'inherit', display: 'inline-flex' }}>
              <Icon name={item.icon} />
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.route === 'leaks' && candidateCount > 0 && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: 'var(--danger-dim)',
                  color: 'var(--danger)',
                  fontWeight: 600,
                }}
              >
                {candidateCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
