import { formatBytes, type LeakCandidate } from '@/shared/leak';
import type { Explanation, FixSuggestion } from '@/core/ai/types';

export interface ReportEntry {
  candidate: LeakCandidate;
  explanation?: Explanation;
  fix?: FixSuggestion;
}

/** Markdown report for export / sharing. */
export function buildMarkdownReport(entries: ReportEntry[], pageUrl?: string): string {
  const lines: string[] = [
    '# Memory Sherlock Report',
    '',
    ...(pageUrl ? [`**Page:** ${pageUrl}`, ''] : []),
    `**Leak candidates:** ${entries.length}`,
    '',
  ];
  for (const { candidate: c, explanation, fix } of entries) {
    lines.push(
      `## ${c.title}`,
      '',
      `| | |`,
      `|---|---|`,
      `| Classification | \`${c.classification}\` |`,
      `| Severity | ${'★'.repeat(c.severity)}${'☆'.repeat(5 - c.severity)} |`,
      `| Confidence | ${c.confidence}% |`,
      `| Retained | ${formatBytes(c.retainedBytes)} |`,
      `| Count | ${c.count} |`,
      ...(c.owner.functionName || c.owner.url
        ? [`| Owner | ${[c.owner.functionName, c.owner.url].filter(Boolean).join(' — ')} |`]
        : []),
      '',
    );
    if (explanation) {
      lines.push(explanation.summary, '', `**Why:** ${explanation.why}`, '', `**Fix:** ${explanation.recommendation}`, '');
    } else {
      lines.push(`**Suggested fix pattern:** ${c.fixPattern}`, '');
    }
    if (fix) {
      lines.push('```' + fix.language, fix.patch, '```', '', `_${fix.rationale}_`, '');
    }
  }
  return lines.join('\n');
}
