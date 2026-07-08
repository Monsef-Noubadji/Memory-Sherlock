import type { LeakOwner, RetainerStep } from '@/shared/leak';

const FRAME_RE = /at\s+(?:(.+?)\s+\()?((?:https?|file|chrome-extension):[^)\s]+?):(\d+):(\d+)\)?/;

/** Best-effort owner from a creation stack: first frame with a URL. */
export function ownerFromStack(stack: string[]): LeakOwner {
  for (const frame of stack) {
    const m = FRAME_RE.exec(frame);
    if (m) {
      return { functionName: m[1], url: `${m[2]}:${m[3]}`, stack };
    }
  }
  return stack.length > 0 ? { stack } : {};
}

/** Best-effort owner from a retainer path: nearest closure/context node. */
export function ownerFromRetainerPath(path: RetainerStep[]): LeakOwner {
  for (const step of path) {
    if (step.nodeType === 'closure' && step.nodeName) {
      return { functionName: step.nodeName };
    }
  }
  return {};
}
