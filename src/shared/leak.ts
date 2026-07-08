export type LeakClassification =
  | 'detached-dom'
  | 'event-listener'
  | 'collection-growth'
  | 'timer'
  | 'observer'
  | 'closure'
  | 'react-fiber';

export interface LeakOwner {
  url?: string;
  functionName?: string;
  stack?: string[];
}

export interface RetainerStep {
  nodeName: string;
  nodeId: number;
  edgeName: string;
  nodeType: string;
}

export interface LeakEvidence {
  retainerPath?: RetainerStep[];
  creationStack?: string[];
  samples?: Array<{ t: number; value: number }>;
  detail?: string;
}

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface LeakCandidate {
  id: string;
  classification: LeakClassification;
  title: string;
  severity: Severity;
  /** 0–100 */
  confidence: number;
  retainedBytes: number;
  count: number;
  owner: LeakOwner;
  evidence: LeakEvidence;
  fixPattern: string;
  docsUrl?: string;
  detectorId: string;
}

/** Severity from retained bytes: <100KB=1, <500KB=2, <2MB=3, <10MB=4, else 5. */
export function severityFromBytes(bytes: number): Severity {
  if (bytes < 100 * 1024) return 1;
  if (bytes < 500 * 1024) return 2;
  if (bytes < 2 * 1024 * 1024) return 3;
  if (bytes < 10 * 1024 * 1024) return 4;
  return 5;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
