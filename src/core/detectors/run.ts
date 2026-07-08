import type { Detector, DetectorContext, DetectorRunResult, Requirement } from './types';

function missingRequirements(d: Detector, ctx: DetectorContext): Requirement[] {
  return d.requires.filter((r) => ctx[r] === undefined);
}

export async function runDetectors(
  detectors: Detector[],
  ctx: DetectorContext,
): Promise<DetectorRunResult> {
  const result: DetectorRunResult = { candidates: [], unavailable: [] };
  await Promise.all(
    detectors.map(async (d) => {
      const missing = missingRequirements(d, ctx);
      if (missing.length > 0) {
        result.unavailable.push({ id: d.id, title: d.title, missing });
        return;
      }
      try {
        result.candidates.push(...(await d.analyze(ctx)));
      } catch {
        // a broken detector must never take the run down
        result.unavailable.push({ id: d.id, title: d.title, missing: [] });
      }
    }),
  );
  result.candidates.sort((a, b) => b.severity - a.severity || b.confidence - a.confidence);
  return result;
}
