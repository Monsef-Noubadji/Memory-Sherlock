import { useMemo } from 'react';
import { Badge, Button, EmptyState, SectionLabel } from './primitives';
import { Icon } from './Icon';
import { useAnalysisState, useRuntime, useUiState } from '../runtime';
import { buildMarkdownReport } from '../lib/report';

export function AiInspector() {
  const rt = useRuntime();
  const selectedId = useUiState((s) => s.selectedCandidateId);
  const result = useAnalysisState((s) => s.result);
  const explanations = useAnalysisState((s) => s.explanations);
  const fixes = useAnalysisState((s) => s.fixes);
  const explaining = useAnalysisState((s) => s.explaining);

  const candidate = useMemo(
    () => result?.candidates.find((c) => c.id === selectedId) ?? null,
    [result, selectedId],
  );
  const explanation = candidate ? explanations[candidate.id] : undefined;
  const fix = candidate ? fixes[candidate.id] : undefined;

  const exportReport = () => {
    const entries = (result?.candidates ?? []).map((c) => ({
      candidate: c,
      explanation: explanations[c.id],
      fix: fixes[c.id],
    }));
    void navigator.clipboard.writeText(buildMarkdownReport(entries));
  };

  return (
    <aside
      style={{
        height: '100%',
        background: 'var(--panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: 'var(--s-2) var(--s-3)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon name="insights" />
        <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>AI Inspector</span>
        <span style={{ flex: 1 }} />
        {explanation && <Badge tone={explanation.provider === 'claude' ? 'primary' : 'neutral'}>{explanation.provider}</Badge>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-3)' }}>
        {!candidate ? (
          <EmptyState
            title="No leak selected"
            hint="Pick a leak candidate to get an explanation of what is leaking, why, where, and how to fix it."
          />
        ) : (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <div style={{ fontWeight: 600 }}>{candidate.title}</div>

            {!explanation ? (
              <Button kind="primary" onClick={() => void rt.analysis.getState().explain(candidate)} disabled={explaining[candidate.id]}>
                {explaining[candidate.id] ? 'Explaining…' : 'Explain this leak'}
              </Button>
            ) : (
              <>
                <div>
                  <SectionLabel>What</SectionLabel>
                  <div style={{ fontSize: 'var(--fs-sm)' }}>{explanation.summary}</div>
                </div>
                <div>
                  <SectionLabel>Why</SectionLabel>
                  <div style={{ fontSize: 'var(--fs-sm)' }}>{explanation.why}</div>
                </div>
                <div>
                  <SectionLabel>Where</SectionLabel>
                  <div className="mono" style={{ fontSize: 'var(--fs-xs)', wordBreak: 'break-all' }}>
                    {explanation.where}
                  </div>
                </div>
                <div>
                  <SectionLabel>Recommendation</SectionLabel>
                  <div style={{ fontSize: 'var(--fs-sm)' }}>{explanation.recommendation}</div>
                </div>
              </>
            )}

            <div>
              <SectionLabel>Generated patch</SectionLabel>
              {!fix ? (
                <Button onClick={() => void rt.analysis.getState().generateFix(candidate)}>Generate fix</Button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                  <pre
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: 'var(--s-2)',
                      overflow: 'auto',
                      fontSize: 'var(--fs-xs)',
                      lineHeight: 1.6,
                    }}
                  >
                    {fix.patch}
                  </pre>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                    {fix.rationale}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
                    <Button onClick={() => void navigator.clipboard.writeText(fix.patch)}>
                      <Icon name="copy" size={12} /> Copy
                    </Button>
                    <Button disabled title="Coming soon">
                      Open in VS Code
                    </Button>
                    <Button disabled title="Coming soon">
                      Generate PR
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 'var(--s-2) var(--s-3)', borderTop: '1px solid var(--border)' }}>
        <Button kind="ghost" onClick={exportReport} title="Copies a Markdown report of all findings">
          <Icon name="copy" size={12} /> Export Markdown report
        </Button>
      </div>
    </aside>
  );
}
