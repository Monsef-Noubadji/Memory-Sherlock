import { severityFromBytes, type LeakCandidate } from '@/shared/leak';
import type { Detector } from './types';

/**
 * Stub detector (deep fiber-tree analysis is post-MVP). Confidence is a
 * flat 40: growing FiberNode counts correlate with retained React trees but
 * need a fiber walk to prove.
 */
export const reactFiberDetector: Detector = {
  id: 'react-fiber',
  title: 'React Fibers (preview)',
  requires: ['heap', 'diff'],
  async analyze(ctx): Promise<LeakCandidate[]> {
    const fiberRow = ctx.diff!.find((r) => r.name === 'FiberNode');
    if (!fiberRow || fiberRow.countDelta <= 0) return [];
    const { rows } = await ctx.heap!.aggregate('FiberNode', 'count', 0, 1);
    const total = rows[0]?.count ?? fiberRow.countDelta;
    const retained = rows[0]?.retained ?? 0;
    return [
      {
        id: 'react-fiber:growth',
        classification: 'react-fiber',
        title: `React fiber count grew by ${fiberRow.countDelta} (now ~${total})`,
        severity: severityFromBytes(retained),
        confidence: 40,
        retainedBytes: retained,
        count: total,
        owner: {},
        evidence: {
          detail: `FiberNode instances grew by ${fiberRow.countDelta} between snapshots. Growing fiber counts often indicate unmounted component trees retained by refs, contexts, or external stores. Full fiber-tree attribution is coming in a future release.`,
        },
        fixPattern: 'Check refs/contexts/subscriptions that might hold unmounted components; unsubscribe in useEffect cleanup.',
        docsUrl: 'https://react.dev/reference/react/useEffect#disconnecting-from-a-server',
        detectorId: 'react-fiber',
      },
    ];
  },
};
