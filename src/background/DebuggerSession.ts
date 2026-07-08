import type { SessionState } from '@/shared/messages';

const PROTOCOL_VERSION = '1.3';

function lastErrorMessage(): string | undefined {
  return chrome.runtime.lastError?.message;
}

/**
 * State machine around chrome.debugger for one inspected tab:
 * idle -> attaching -> attached -> capturing -> attached, with error edges
 * to detached (tab navigated/closed, user cancelled the infobar).
 */
export class DebuggerSession {
  state: SessionState = 'idle';
  private chunkSink: ((chunk: string) => void) | null = null;

  constructor(
    readonly tabId: number,
    private onState: (state: SessionState, reason?: string) => void,
  ) {
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === this.tabId && this.state !== 'idle') {
        this.setState('detached', reason);
      }
    });
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId !== this.tabId) return;
      if (method === 'HeapProfiler.addHeapSnapshotChunk' && this.chunkSink) {
        this.chunkSink((params as { chunk: string }).chunk);
      }
    });
  }

  private setState(state: SessionState, reason?: string): void {
    this.state = state;
    this.onState(state, reason);
  }

  private send(method: string, params?: object): Promise<object | undefined> {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId: this.tabId }, method, params, (result) => {
        const err = lastErrorMessage();
        if (err) reject(new Error(`${method}: ${err}`));
        else resolve(result);
      });
    });
  }

  async attach(): Promise<void> {
    if (this.state === 'attached' || this.state === 'capturing') return;
    this.setState('attaching');
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ tabId: this.tabId }, PROTOCOL_VERSION, () => {
          const err = lastErrorMessage();
          if (err) reject(new Error(err));
          else resolve();
        });
      });
      await this.send('HeapProfiler.enable');
      this.setState('attached');
    } catch (err) {
      this.setState('idle', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async detach(): Promise<void> {
    if (this.state === 'idle' || this.state === 'detached') return;
    await new Promise<void>((resolve) => {
      chrome.debugger.detach({ tabId: this.tabId }, () => {
        void lastErrorMessage(); // already-detached is fine
        resolve();
      });
    });
    this.setState('idle');
  }

  /** Streams snapshot chunks to onChunk; resolves when V8 finished serializing. */
  async takeSnapshot(onChunk: (chunk: string) => void): Promise<void> {
    if (this.state !== 'attached') throw new Error(`cannot capture in state ${this.state}`);
    this.setState('capturing');
    this.chunkSink = onChunk;
    try {
      await this.send('HeapProfiler.takeHeapSnapshot', {
        reportProgress: false,
        treatGlobalObjectsAsRoots: true,
        captureNumericValue: false,
      });
      this.setState('attached');
    } catch (err) {
      if ((this.state as SessionState) === 'capturing') this.setState('attached');
      throw err;
    } finally {
      this.chunkSink = null;
    }
  }

  async collectGarbage(): Promise<void> {
    await this.send('HeapProfiler.collectGarbage');
  }
}
