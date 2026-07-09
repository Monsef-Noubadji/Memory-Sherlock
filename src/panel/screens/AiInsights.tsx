import { Badge, Button, Card, EmptyState, SectionLabel } from '../components/primitives';
import { useAnalysisState, useUiState } from '../runtime';
import { buildMarkdownReport } from '../lib/report';

export function AiInsights() {
  const result = useAnalysisState((s) => s.result);
  const explanations = useAnalysisState((s) => s.explanations);
  const fixes = useAnalysisState((s) => s.fixes);
  const selectCandidate = useUiState((s) => s.selectCandidate);

  const explained = (result?.candidates ?? []).filter((c) => explanations[c.id]);

  if (explained.length === 0) {
    return (
      <EmptyState
        title="No insights generated yet"
        hint="Explanations you generate from leak candidates collect here. Select a candidate and hit 'Generate fix' to build up a report."
      />
    );
  }

  const exportAll = () => {
    void navigator.clipboard.writeText(
      buildMarkdownReport(explained.map((c) => ({ candidate: c, explanation: explanations[c.id], fix: fixes[c.id] }))),
    );
  };

  return (
    <div className="fade-in" style={{ padding: 'var(--s-3)', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--s-3)' }}>
        <SectionLabel>{explained.length} explained leak(s)</SectionLabel>
        <span style={{ flex: 1 }} />
        <Button onClick={exportAll}>Copy Markdown report</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        {explained.map((c) => {
          const e = explanations[c.id];
          return (
            <Card key={c.id} onClick={() => selectCandidate(c.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                <span style={{ fontWeight: 600 }}>{c.title}</span>
                <Badge tone={e.provider === 'claude' ? 'primary' : 'neutral'}>{e.provider}</Badge>
                {fixes[c.id] && <Badge tone="success">patch ready</Badge>}
              </div>
              <div className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
                {e.summary}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
