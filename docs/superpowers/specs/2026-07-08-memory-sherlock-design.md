# Memory Sherlock — MVP Design

**Date:** 2026-07-08
**Status:** Approved
**Scope decision:** Working MVP extension (real analysis, full UI shell, advanced features stubbed).
**Priority decision:** Analysis correctness wins trade-offs.
**AI decision:** Pluggable — heuristic provider by default, optional Claude API key.

## 1. Product summary

Memory Sherlock is a Chrome DevTools extension (Manifest V3) that automatically analyzes browser memory, classifies leaks, estimates confidence, explains root causes, and suggests code fixes. It does not replace DevTools' Memory tab — it interprets it. Every screen answers: what is leaking, why, where, and how to fix it.

## 2. Architecture — Approach A (hybrid)

Two complementary data sources:

1. **CDP via `chrome.debugger`** (structural truth): the background service worker attaches to the inspected tab and drives the `HeapProfiler` domain — heap snapshots streamed in chunks, `collectGarbage`, sampling heap profiles. Yields retained sizes, retainer chains, detached DOM subgraphs, constructor counts, snapshot diffs.
2. **Injected page agent** (behavioral truth): a content script injects a page-world script that instruments `EventTarget.prototype.addEventListener`/`removeEventListener`, `setInterval`/`setTimeout`/`clearInterval`/`clearTimeout`, `MutationObserver`/`ResizeObserver`/`IntersectionObserver`/`PerformanceObserver` construct/observe/disconnect, `AbortController`, and samples `performance.memory` on an interval. Yields creation stacks, owner attribution, missing-cleanup detection, and live timeline data.

### Data flow

```
page agent ──postMessage──▶ content script ──port──▶ background SW ◀──chrome.debugger──▶ inspected tab
                                                        │
                                              chrome.runtime port
                                                        │
                                                 DevTools panel (React)
                                                        │
                                              Web Worker (heap engine)
```

- The panel owns a single long-lived `chrome.runtime` port to the background, keyed by `chrome.devtools.inspectedWindow.tabId`.
- Heap snapshot chunks are forwarded to the panel and fed into the heap-engine Web Worker; the parsed graph never leaves the worker — the UI queries it via a request/response protocol.
- Agent telemetry events are buffered in the background (ring buffer) and streamed to the panel.

### Session state machine

`idle → attaching → attached → capturing → analyzing → attached` with error edges to `detached` (tab navigated, user cancelled the infobar, target crashed). Navigation of the inspected tab re-injects the agent and offers reattach. All states are visible in the UI status bar.

### Degraded modes

- **Agent blocked** (CSP or injection failure): CDP-only mode. Agent-dependent detectors report themselves unavailable; a capability banner explains what's missing. No guessing.
- **Debugger unavailable** (user declined, another debugger attached): agent-only mode. Snapshot features disabled with explanation.

## 3. Repository layout & stack

```
memory-sherlock/
├─ src/
│  ├─ panel/          # React app — DevTools panel UI (all screens)
│  ├─ background/     # MV3 service worker: debugger session, CDP driver, telemetry buffer
│  ├─ content/        # content script: page agent ↔ background bridge
│  ├─ agent/          # page-world instrumentation
│  ├─ devtools/       # devtools_page entry that registers the panel
│  ├─ core/
│  │  ├─ heap/        # snapshot parser + graph algorithms (runs in Web Worker)
│  │  ├─ detectors/   # detector engine + built-in detectors
│  │  └─ ai/          # ExplanationProvider: heuristic + Claude implementations
│  └─ shared/         # message protocol, LeakCandidate model, design tokens
├─ test-app/          # deliberately leaky demo app (one labeled leak per detector)
├─ e2e/               # detector correctness tests driving Chrome against test-app
└─ docs/
```

**Stack:** TypeScript (strict), React 18, Vite + CRXJS (MV3 build + HMR), Zustand (panel state), @tanstack/react-virtual (tables/trees), uPlot (timeline chart), hand-rolled CSS design system (custom properties from the spec palette; no CSS framework). pnpm.

## 4. Heap engine (correctness core)

Runs entirely in a Web Worker owned by the panel.

- **Parser:** streams V8 heap snapshot JSON into typed arrays (`nodes`, `edges`, `strings`, plus computed `firstEdgeIndex` and `retainers` inverse index) — the same columnar layout Chrome DevTools uses internally, so 100 MB+ snapshots parse in seconds and stay memory-lean.
- **Algorithms:**
  - Dominator tree (Lengauer–Tarjan or the simple iterative algorithm DevTools uses) → **retained sizes**.
  - Retainer paths: reverse-BFS from a node toward GC roots, skipping weak edges; returns the shortest strong path plus alternates.
  - Detached DOM: nodes whose name carries V8's `Detached ` marker, grouped into subtrees with a top-retained representative each.
  - Constructor aggregation: count/shallow/retained per constructor for the explorer.
  - **Diff:** align two snapshots by constructor (and by node id where trace ids allow); report added/deleted counts and size deltas.
- **Protocol:** panel sends `{id, op, params}`, worker replies `{id, result}` — ops like `aggregate`, `nodesForConstructor(page)`, `retainers(nodeId)`, `diff(snapshotA, snapshotB)`, `detachedDom()`. Paged results only; the graph never transfers.

## 5. Detector engine

```ts
interface Detector {
  id: string;
  title: string;
  requires: Array<'heap' | 'diff' | 'agent'>;
  analyze(ctx: DetectorContext): Promise<LeakCandidate[]>;
}
```

`DetectorContext` exposes the heap-worker query API, the latest snapshot diff, and the agent telemetry store. Detectors register in a plugin registry; each is independently pluggable and unit-testable. A detector whose `requires` aren't satisfied is skipped and listed as unavailable.

**LeakCandidate model:** `id, classification, title, severity (1–5), confidence (0–100), retainedBytes, count, owner {url, functionName, stack?}, evidence {retainerPath?, creationStack?, samples?}, fixPattern, docsUrl`.

**MVP detectors (6 real):**

1. **DetachedDOMDetector** (heap): detached subtrees, representative node, retainer path to the leak root, owner from the retaining closure's script when resolvable.
2. **EventListenerDetector** (agent + heap): listeners added but never removed whose target left the DOM, or window/document listeners created per-mount without cleanup (repeat-signature detection). Creation stack = owner.
3. **CollectionGrowthDetector** (diff + heap): Maps/Sets/Arrays/plain objects growing monotonically across ≥2 snapshots; ranked by retained-size delta.
4. **TimerDetector** (agent): intervals/timeouts never cleared whose callbacks close over detached nodes or unmounted scopes; repeated registration signatures.
5. **ObserverDetector** (agent): observers constructed and observing but never disconnected past their target's removal.
6. **ClosureRetentionDetector** (heap + diff): closures (`context` nodes) with large retained sizes that grew across snapshots; reports the captured variables from edge names.

**Stub plugin:** ReactDetector — identifies `FiberNode` constructors, counts fibers, flags fiber counts growing across snapshots. Deep fiber-tree walking is post-MVP; the React page renders what this provides plus agent data.

Severity = f(retainedBytes, growth slope); confidence = per-detector rubric (e.g., detached + strong retainer path + creation stack = high; heuristic constructor-name match alone = low). Rubrics documented in each detector file.

## 6. AI layer

```ts
interface ExplanationProvider {
  explain(candidate: LeakCandidate): Promise<Explanation>; // prose: what/why/where
  suggestFix(candidate: LeakCandidate): Promise<FixSuggestion>; // patch text + rationale
}
```

- **HeuristicProvider** (default, offline): template engine keyed on `classification` + evidence fields. Produces the explanation, recommendation, and a code-patch skeleton (e.g., the `useEffect` cleanup return for a listener leak). Deterministic → unit-testable.
- **ClaudeProvider** (optional): API key stored via `chrome.storage.local`, entered in Settings. Sends the structured evidence (never page content beyond stacks/URLs) to the Claude API; renders richer prose and a concrete patch. Timeouts/failures fall back to the heuristic output.
- The AI Inspector shows a provider badge (Heuristic / Claude) on every explanation. Copy-patch and export-Markdown-report work with both. "Open in VS Code" and "Generate PR" buttons render but are stubbed (tooltip: coming soon).

## 7. UI

DevTools panel registered from `devtools_page`. Layout per spec: top status bar, icon+label sidebar, main content, AI Inspector right panel, bottom timeline — resizable panels (pointer-event based, persisted sizes), dark-first with the spec palette as CSS custom properties, Inter for UI + system monospace for data, 8-pt spacing, 150–250 ms opacity/scale transitions.

**Fully functional MVP screens:** Overview dashboard (live cards from agent sampling + latest snapshot; click-to-drill-down), Heap Snapshots explorer (capture, list, constructor aggregate view with search/sort/virtualization, retainers pane, diff mode), Leak Candidates (cards with severity/confidence/retained/owner, grouping, Inspect → evidence, Generate Fix → AI Inspector), Detached DOM, Event Listeners (virtualized table, missing-cleanup highlighting), Timeline (uPlot: heap size, GC events, snapshot markers; zoom + brush + hover), Settings (API key, sampling interval, detector toggles).

**Thin-but-real screens:** React, Observers, Caches — render real agent/stub-detector data with reduced depth. Command palette (Ctrl/Cmd-K) for navigation and actions.

## 8. Correctness verification

- **test-app/**: small React (Vite) app with labeled, intentional leaks — one per detector pattern: missing `useEffect` listener cleanup, detached dialog subtree kept by a module ref, module-level growing `Map`, uncleared interval capturing component state, un-disconnected `ResizeObserver`, closure retaining a large array. Each leak has a data attribute / registry entry stating its expected classification.
- **Unit tests:** heap parser + algorithms against fixture snapshots (small snapshots checked into `e2e/fixtures`, generated from test-app); detector logic against synthetic contexts; heuristic provider snapshots.
- **E2E:** script drives Chrome (Puppeteer with the extension loaded, or CDP directly against test-app for the engine path), captures snapshots before/after interactions, runs detectors, asserts every planted leak is detected with the expected classification and no false positive exceeds a noise budget.

## 9. Error handling summary

- Debugger detach / tab navigation → session state machine, visible status, one-click reattach.
- Snapshot parse failure → error surface in Snapshots screen with retry; raw chunks discarded.
- Agent injection blocked → CDP-only capability banner (see Degraded modes).
- Claude API failure → automatic heuristic fallback with a notice.
- Worker crash → worker restarted; parsed snapshots reloaded from retained chunk cache if available, else marked stale.

## 10. Out of scope (this build)

Deep React fiber-tree analysis, Vue/Angular/Svelte adapters, Sankey/flame/treemap visualizations (timeline + retainer tree only for MVP), VS Code / GitHub / CI integrations, PR generation, memory-growth prediction, framework cache inspectors (React Query/Apollo/SWR) beyond generic collection growth.
