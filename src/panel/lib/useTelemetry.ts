import { useMemo } from 'react';
import { TelemetryStore } from '@/core/detectors';
import { useSessionState } from '../runtime';

/** Live TelemetryStore rebuilt from the session's event log. */
export function useTelemetry(): TelemetryStore {
  const events = useSessionState((s) => s.events);
  return useMemo(() => {
    const store = new TelemetryStore();
    store.ingest(events);
    return store;
  }, [events]);
}
