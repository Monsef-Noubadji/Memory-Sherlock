import type { TelemetryEvent } from '@/shared/telemetry';

/**
 * Ring buffer of agent telemetry with monotonically increasing indices, so
 * the panel can poll `since(nextIndex)` without missing or duplicating
 * events (unless it falls more than `capacity` behind).
 */
export class TelemetryBuffer {
  private events: TelemetryEvent[] = [];
  /** Global index of events[0]. */
  private baseIndex = 0;

  constructor(private capacity = 10_000) {}

  push(batch: TelemetryEvent[]): void {
    this.events.push(...batch);
    const overflow = this.events.length - this.capacity;
    if (overflow > 0) {
      this.events.splice(0, overflow);
      this.baseIndex += overflow;
    }
  }

  since(index: number): { events: TelemetryEvent[]; nextIndex: number } {
    const start = Math.max(index - this.baseIndex, 0);
    return {
      events: this.events.slice(start),
      nextIndex: this.baseIndex + this.events.length,
    };
  }
}
