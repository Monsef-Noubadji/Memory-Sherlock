import { isAgentMessage } from '@/shared/telemetry';
import type { ContentToBackground } from '@/shared/messages';

// Isolated-world bridge: page agent (postMessage) -> background (port).

let port: chrome.runtime.Port | null = null;
let agentSeen = false;

function send(msg: ContentToBackground): void {
  try {
    if (!port) {
      port = chrome.runtime.connect({ name: 'telemetry' });
      port.onDisconnect.addListener(() => {
        port = null;
      });
    }
    port.postMessage(msg);
  } catch {
    port = null;
  }
}

window.addEventListener('message', (ev: MessageEvent) => {
  if (ev.source !== window || !isAgentMessage(ev.data)) return;
  if (!agentSeen) {
    agentSeen = true;
    send({ type: 'agent-ready' });
  }
  if (ev.data.events.length > 0) {
    send({ type: 'telemetry', events: ev.data.events });
  }
});

// If the MAIN-world agent never announces itself (e.g. blocked), report it.
setTimeout(() => {
  if (!agentSeen) send({ type: 'agent-unavailable', reason: 'agent did not initialize within 5s' });
}, 5000);
