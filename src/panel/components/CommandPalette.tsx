import { useEffect, useMemo, useRef, useState } from 'react';
import { NAV } from '../nav';
import { Icon } from './Icon';
import { useRuntime, useUiState } from '../runtime';

interface Command {
  id: string;
  label: string;
  icon: string;
  run: () => void;
}

export function CommandPalette() {
  const rt = useRuntime();
  const open = useUiState((s) => s.paletteOpen);
  const setOpen = useUiState((s) => s.setPaletteOpen);
  const navigate = useUiState((s) => s.navigate);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(
    () => [
      ...NAV.map((n) => ({
        id: `nav-${n.route}`,
        label: `Go to ${n.label}`,
        icon: n.icon,
        run: () => navigate(n.route),
      })),
      {
        id: 'snapshot',
        label: 'Take heap snapshot',
        icon: 'camera',
        run: () => rt.session.getState().takeSnapshot(),
      },
      {
        id: 'analyze',
        label: 'Run leak detectors',
        icon: 'search',
        run: () => void rt.analysis.getState().runAnalysis(),
      },
      { id: 'gc', label: 'Collect garbage', icon: 'trash', run: () => rt.session.getState().collectGarbage() },
      { id: 'attach', label: 'Attach debugger', icon: 'play', run: () => rt.session.getState().attach() },
    ],
    [navigate, rt],
  );

  const filtered = useMemo(
    () => commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query],
  );

  if (!open) return null;

  const exec = (cmd: Command) => {
    setOpen(false);
    cmd.run();
  };

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        className="fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxHeight: 380,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          alignSelf: 'flex-start',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            else if (e.key === 'Enter' && filtered[active]) exec(filtered[active]);
          }}
          placeholder="Type a command…"
          style={{ border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, padding: 'var(--s-2) var(--s-3)', background: 'transparent' }}
        />
        <div style={{ overflowY: 'auto' }}>
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onClick={() => exec(c)}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '8px 16px',
                fontSize: 'var(--fs-sm)',
                color: i === active ? 'var(--text)' : 'var(--muted)',
                background: i === active ? 'var(--primary-dim)' : 'transparent',
              }}
            >
              <Icon name={c.icon} />
              {c.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="muted" style={{ padding: 'var(--s-3)', fontSize: 'var(--fs-sm)' }}>
              No matching commands.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
