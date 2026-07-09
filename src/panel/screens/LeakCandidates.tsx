import { useMemo, useState } from 'react';
import { Badge, Button, Card, ConfidenceMeter, EmptyState, SectionLabel, SeverityStars } from '../components/primitives';
import { RetainerChain, StackTrace } from '../components/RetainerChain';
import { useAnalysisState, useRuntime, useUiState } from '../runtime';
import { groupCandidates, type GroupBy } from '../lib/grouping';
import { formatBytes, type LeakCandidate } from '@/shared/leak';

const CLASS_LABEL: Record<string, string> = {
  'detached-dom': 'Detached DOM',
  'event-listener': 'Event Listener',
  'collection-growth': 'Growing Collection',
  timer: 'Timer',
  observer: 'Observer',
  closure: 'Closure',
  'react-fiber': 'React Fiber',
};

export function LeakCandidates() {
  const rt = useRuntime();
  const result = useAnalysisState((s) => s.result);
  const running = useAnalysisState((s) => s.running);
  const lastRunAt = useAnalysisState((s) => s.lastRunAt);
  const [groupBy, setGroupBy] = useState<GroupBy>('severity');
  const [inspected, setInspected] = useState<string | null>(null);

  const groups = useMemo(() => groupCandidates(result?.candidates ?? [], groupBy), [result, groupBy]);

  if (!result) {
    return (
      <EmptyState
        title="No analysis yet"
        hint="Run the detectors to scan for detached DOM, listener leaks, growing collections, timers, observers, and closure retention. For best results, take two snapshots (before/after an interaction) first."
        action={
          <Button kind="primary" onClick={() => void rt.analysis.getState().runAnalysis()} disabled={running}>
            {running ? 'Analyzing…' : 'Run analysis'}
          </Button>
        }
      />
    );
  }

  if (result.candidates.length === 0) {
    return (
      <EmptyState
        title="No leaks detected"
        hint={`All available detectors came back clean${lastRunAt ? ` at ${new Date(lastRunAt).toLocaleTimeString()}` : ''}. Interact with the page, take another snapshot, and analyze again to catch growth patterns.`}
        action={<Button onClick={() => void rt.analysis.getState().runAnalysis()}>Re-run analysis</Button>}
      />
    );
  }

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
        <SectionLabel>
          {result.candidates.length} leak candidate{result.candidates.length === 1 ? '' : 's'}
        </SectionLabel>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          Group by
        </span>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} style={{ background: 'var(--card)' }}>
          <option value="severity">Severity</option>
          <option value="type">Type</option>
          <option value="owner">Owner</option>
          <option value="confidence">Confidence</option>
        </select>
        <Button onClick={() => void rt.analysis.getState().runAnalysis()} disabled={running}>
          {running ? 'Analyzing…' : 'Re-run'}
        </Button>
      </div>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 'var(--s-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--s-2)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{CLASS_LABEL[g.key] ?? g.key}</span>
            <Badge>{g.items.length}</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            {g.items.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                inspected={inspected === c.id}
                onInspect={() => setInspected(inspected === c.id ? null : c.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CandidateCard({
  candidate: c,
  inspected,
  onInspect,
}: {
  candidate: LeakCandidate;
  inspected: boolean;
  onInspect: () => void;
}) {
  const rt = useRuntime();
  const selectCandidate = useUiState((s) => s.selectCandidate);

  const generateFix = () => {
    selectCandidate(c.id);
    void rt.analysis.getState().explain(c);
    void rt.analysis.getState().generateFix(c);
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--fs-md)' }}>{c.title}</span>
        <Badge tone="primary">{CLASS_LABEL[c.classification]}</Badge>
        <span style={{ flex: 1 }} />
        <SeverityStars severity={c.severity} />
        <ConfidenceMeter value={c.confidence} />
      </div>

      <div className="mono muted" style={{ display: 'flex', gap: 'var(--s-3)', fontSize: 'var(--fs-xs)', margin: '8px 0', flexWrap: 'wrap' }}>
        {c.retainedBytes > 0 && <span>retained {formatBytes(c.retainedBytes)}</span>}
        <span>×{c.count}</span>
        {(c.owner.functionName || c.owner.url) && (
          <span style={{ color: 'var(--primary)' }}>{c.owner.functionName ?? ''} {c.owner.url ?? ''}</span>
        )}
      </div>

      <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{c.fixPattern}</div>

      <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
        <Button onClick={onInspect}>{inspected ? 'Hide evidence' : 'Inspect'}</Button>
        <Button kind="primary" onClick={generateFix}>
          Generate fix
        </Button>
        {c.docsUrl && (
          <Button kind="ghost" onClick={() => window.open(c.docsUrl, '_blank')}>
            Docs ↗
          </Button>
        )}
      </div>

      {inspected && (
        <div className="fade-in" style={{ marginTop: 'var(--s-3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)' }}>
          {c.evidence.detail && (
            <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--s-2)' }}>{c.evidence.detail}</div>
          )}
          {c.evidence.retainerPath && (
            <div style={{ marginBottom: 'var(--s-2)' }}>
              <SectionLabel>Retainer path</SectionLabel>
              <RetainerChain path={c.evidence.retainerPath} />
            </div>
          )}
          {c.evidence.creationStack && (
            <div>
              <SectionLabel>Creation stack</SectionLabel>
              <StackTrace stack={c.evidence.creationStack} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
