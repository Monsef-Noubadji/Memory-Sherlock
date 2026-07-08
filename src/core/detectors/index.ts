import { detachedDomDetector } from './detachedDom';
import { eventListenerDetector } from './eventListener';
import { collectionGrowthDetector } from './collectionGrowth';
import { timerDetector } from './timer';
import { observerDetector } from './observer';
import { closureDetector } from './closure';
import { reactFiberDetector } from './reactFiber';
import type { Detector } from './types';

/** The pluggable registry — order is presentation order for "unavailable" lists. */
export const allDetectors: Detector[] = [
  detachedDomDetector,
  eventListenerDetector,
  collectionGrowthDetector,
  timerDetector,
  observerDetector,
  closureDetector,
  reactFiberDetector,
];

export { runDetectors } from './run';
export { TelemetryStore } from './telemetryStore';
export { heapApiFromEngine, heapApiFromClient } from './heapApi';
export type { Detector, DetectorContext, DetectorRunResult, HeapQueryApi, Requirement } from './types';
