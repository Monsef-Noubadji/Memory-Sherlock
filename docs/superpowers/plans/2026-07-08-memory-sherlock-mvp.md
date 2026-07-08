# Memory Sherlock MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A loadable MV3 Chrome DevTools extension that captures and parses real heap snapshots, runs 6 real leak detectors + 1 stub, explains leaks via a pluggable AI layer (heuristics default, Claude optional), inside a dark-first multi-panel DevTools UI — verified against a deliberately leaky test app.

**Architecture:** Hybrid data plane — `chrome.debugger`/CDP for heap snapshots (parsed in a Web Worker into DevTools-style columnar arrays with dominator-tree retained sizes) plus an injected page agent for behavioral telemetry (listeners, timers, observers, memory sampling). A pluggable detector registry consumes both and emits `LeakCandidate`s; an `ExplanationProvider` interface renders explanations/fixes.

**Tech Stack:** TypeScript (strict), React 18, Vite + @crxjs/vite-plugin (MV3), Zustand, @tanstack/react-virtual, uPlot, vitest, Puppeteer (e2e), pnpm.

## Global Constraints

- Package manager: pnpm. Node ≥ 20.
- TypeScript `strict: true` everywhere; no `any` in `src/shared` and `src/core`.
- Design tokens exactly per spec: bg `#0B0F17`, panel `#111827`, card `#1A2233`, border `#273449`, primary `#4F8CFF`, success `#22C55E`, warning `#F59E0B`, danger `#EF4444`, text `#F3F4F6`, muted `#94A3B8`. 8-pt spacing. Animations 150–250 ms, opacity/scale/slide only.
- The parsed heap graph never leaves the Web Worker; UI receives paged query results only.
- Detectors declare `requires: ('heap'|'diff'|'agent')[]` and are skipped (reported unavailable) when unmet — never guess.
- Commit after every task (conventional commits).

---

## Phase 1 — Workspace + Heap Engine (pure TS, unit-tested, no extension needed)

### Task 1.1: Scaffold workspace

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `index.html` (panel entry), `src/panel/main.tsx`, `src/panel/App.tsx`

**Interfaces:**
- Produces: a repo where `pnpm test` runs vitest and `pnpm build` runs vite + CRXJS (manifest added in Phase 2 — until then build only the panel entry).

- [ ] Step 1: `pnpm init`, add deps: `react react-dom zustand @tanstack/react-virtual uplot` and dev deps: `typescript vite @vitejs/plugin-react @crxjs/vite-plugin@beta vitest @types/react @types/react-dom @types/chrome puppeteer-core`.
- [ ] Step 2: Write `tsconfig.json` (strict, `moduleResolution: bundler`, jsx react-jsx, types: chrome, vitest paths `@/* → src/*`), `vite.config.ts` (react plugin only for now), `vitest.config.ts` (node env for core, jsdom not needed yet).
- [ ] Step 3: Smoke test `src/core/__tests__/smoke.test.ts` asserting `1+1===2`; run `pnpm vitest run` → PASS.
- [ ] Step 4: Commit `chore: scaffold workspace`.

### Task 1.2: Shared models

**Files:**
- Create: `src/shared/leak.ts`, `src/shared/messages.ts`, `src/shared/telemetry.ts`

**Interfaces (Produces — exact):**

```ts
// src/shared/leak.ts
export type LeakClassification =
  | 'detached-dom' | 'event-listener' | 'collection-growth' | 'timer'
  | 'observer' | 'closure' | 'react-fiber';
export interface LeakOwner { url?: string; functionName?: string; stack?: string[]; }
export interface LeakEvidence {
  retainerPath?: RetainerStep[]; creationStack?: string[];
  samples?: Array<{ t: number; value: number }>; detail?: string;
}
export interface RetainerStep { nodeName: string; nodeId: number; edgeName: string; nodeType: string; }
export interface LeakCandidate {
  id: string; classification: LeakClassification; title: string;
  severity: 1|2|3|4|5; confidence: number; // 0–100
  retainedBytes: number; count: number;
  owner: LeakOwner; evidence: LeakEvidence;
  fixPattern: string; docsUrl?: string; detectorId: string;
}
```

```ts
// src/shared/telemetry.ts — agent events
export type TelemetryEvent =
  | { kind: 'listener-added'|'listener-removed'; id: number; type: string; targetDesc: string; targetIsNode: boolean; stack: string[]; t: number }
  | { kind: 'timer-set'|'timer-cleared'; id: number; timerKind: 'interval'|'timeout'; stack: string[]; t: number }
  | { kind: 'observer-created'|'observer-observe'|'observer-disconnect'; id: number; observerType: string; stack: string[]; t: number }
  | { kind: 'target-removed'; ids: number[]; t: number }           // listener targets that left the DOM
  | { kind: 'memory-sample'; usedJSHeapSize: number; totalJSHeapSize: number; t: number };
```

`src/shared/messages.ts`: discriminated unions `PanelToBackground` (`attach`, `detach`, `takeSnapshot`, `collectGarbage`, `getTelemetry`), `BackgroundToPanel` (`session-state`, `snapshot-chunk`, `snapshot-done`, `telemetry-batch`, `error`) and `SessionState = 'idle'|'attaching'|'attached'|'capturing'|'detached'`.

- [ ] Steps: write files; typecheck `pnpm tsc --noEmit` → PASS; commit `feat: shared leak/telemetry/message models`.

### Task 1.3: Heap snapshot parser (worker-side, columnar)

**Files:**
- Create: `src/core/heap/format.ts` (V8 snapshot meta parsing), `src/core/heap/HeapGraph.ts`, `src/core/heap/parse.ts`
- Test: `src/core/heap/__tests__/parse.test.ts`, fixture builder `src/core/heap/__tests__/fixture.ts`

**Interfaces (Produces):**

```ts
export interface HeapGraph {
  nodeCount: number; edgeCount: number;
  nodeType(i: number): string; nodeName(i: number): string; nodeId(i: number): number;
  nodeSelfSize(i: number): number; nodeDetachedness(i: number): number;
  firstEdge(i: number): number; edgeCountOf(i: number): number; // edges are [firstEdge, firstEdge+edgeCountOf)
  edgeType(e: number): string; edgeName(e: number): string; edgeTarget(e: number): number; // target = node ordinal
  retainersOf(i: number): Array<{ node: number; edge: number }>;
  retainedSize(i: number): number; // filled by Task 1.4
}
export function parseSnapshot(json: V8Snapshot): HeapGraph;
```

Parsing rules: read `snapshot.meta.node_fields` / `edge_fields` / `*_types` dynamically (never hardcode column order); convert `to_node` byte offsets to ordinals; build inverse retainer index (counting sort by target). Fixture builder constructs tiny valid snapshots (`node()`/`edge()` DSL) so tests are readable.

Tests: parses a 4-node fixture (root → obj → array, detached div) with correct names/types/sizes; retainers inverse index correct; handles `detachedness` field present and absent.

- [ ] Steps: failing tests → run (FAIL: module missing) → implement → PASS → commit `feat: V8 heap snapshot parser with retainer index`.

### Task 1.4: Graph algorithms — dominators/retained sizes, retainer paths, detached DOM, aggregation, diff

**Files:**
- Create: `src/core/heap/dominators.ts`, `src/core/heap/paths.ts`, `src/core/heap/detached.ts`, `src/core/heap/aggregate.ts`, `src/core/heap/diff.ts`
- Test: `src/core/heap/__tests__/dominators.test.ts`, `paths.test.ts`, `detached.test.ts`, `aggregate.test.ts`, `diff.test.ts`

**Interfaces (Produces):**

```ts
export function computeRetainedSizes(g: HeapGraph): Float64Array;          // Cooper-Harvey-Kennedy iterative dominators from synthetic root; weak edges are non-owning
export function shortestRetainerPath(g: HeapGraph, node: number, maxLen?: number): RetainerStep[]; // reverse BFS to root, skip weak edges
export function findDetachedDom(g: HeapGraph): DetachedSubtree[];          // detachedness===2 or name starts 'Detached '; group into subtrees, pick top-retained representative
export interface ConstructorAggregate { name: string; count: number; shallow: number; retained: number; sampleNodes: number[]; }
export function aggregateByConstructor(g: HeapGraph): ConstructorAggregate[];
export interface SnapshotDiffRow { name: string; addedCount: number; removedCount: number; countDelta: number; sizeDelta: number; }
export function diffSnapshots(before: HeapGraph, after: HeapGraph): SnapshotDiffRow[]; // align by constructor name
```

Key test: hand-built diamond graph where retained size of a shared child accrues to the dominator, not either parent; weak-edge-only reachability doesn't create ownership; retainer path skips weak edges.

- [ ] Steps: per algorithm — failing test → implement → PASS; single commit `feat: heap algorithms (retained sizes, paths, detached DOM, aggregate, diff)`.

### Task 1.5: Heap worker + query protocol

**Files:**
- Create: `src/core/heap/worker.ts` (Web Worker entry), `src/core/heap/HeapClient.ts` (panel-side async client), `src/core/heap/protocol.ts`
- Test: `src/core/heap/__tests__/protocol.test.ts` (run handler functions directly, no real Worker needed)

**Interfaces (Produces):**

```ts
// protocol ops (request/response, paged)
type Op =
  | { op: 'load'; chunks: string[] }                       // -> { snapshotId, nodeCount, totalSize }
  | { op: 'aggregate'; snapshotId: number; query?: string; sort: 'retained'|'shallow'|'count'; page: number; pageSize: number }
  | { op: 'nodes'; snapshotId: number; constructorName: string; page: number; pageSize: number }
  | { op: 'retainers'; snapshotId: number; nodeId: number }
  | { op: 'detached'; snapshotId: number }
  | { op: 'diff'; beforeId: number; afterId: number; page: number; pageSize: number }
  | { op: 'summary'; snapshotId: number };                 // heap size, object count, top constructors
class HeapClient { request<T>(op: Op): Promise<T>; }        // wraps postMessage with ids
```

- [ ] Steps: failing protocol tests (dispatch table given fixture chunks) → implement `handleOp(state, op)` pure function + thin worker wrapper → PASS → commit `feat: heap worker query protocol`.

---

## Phase 2 — Extension shell + data pipeline (loadable extension)

### Task 2.1: MV3 manifest + entries via CRXJS

**Files:**
- Create: `manifest.config.ts`, `src/devtools/devtools.html` + `devtools.ts` (registers "Memory Sherlock" panel), `src/panel/index.html`, update `vite.config.ts` with `crx({ manifest })`
- Manifest: `permissions: ["debugger","storage","scripting"]`, `host_permissions: ["<all_urls>"]`, background service worker, content script `src/content/index.ts` at `document_start` all frames false.

- [ ] Steps: build `pnpm build` → dist contains manifest + devtools page; load unpacked in Chrome manually later; commit `feat: MV3 extension shell with DevTools panel`.

### Task 2.2: Background CDP session (state machine + snapshot streaming)

**Files:**
- Create: `src/background/index.ts`, `src/background/DebuggerSession.ts`, `src/background/TelemetryBuffer.ts` (ring buffer, 10k events)
- Test: `src/background/__tests__/session.test.ts` (state machine with mocked `chrome.debugger`)

**Interfaces (Produces):** `DebuggerSession(tabId)` with `attach()`, `detach()`, `takeSnapshot(onChunk, onDone)` (sends `HeapProfiler.enable` + `takeHeapSnapshot {reportProgress:false}`, listens `HeapProfiler.addHeapSnapshotChunk`), `collectGarbage()`; emits `SessionState` transitions per spec §2 including `chrome.debugger.onDetach` → `detached`. Background routes panel port messages (by `tabId`) ↔ session ↔ content-script telemetry port.

- [ ] Steps: failing state-machine tests with `chrome` mock → implement → PASS → commit `feat: background debugger session + telemetry buffer`.

### Task 2.3: Page agent + content bridge

**Files:**
- Create: `src/agent/index.ts` (page world), `src/content/index.ts` (isolated world bridge)
- Test: `src/agent/__tests__/agent.test.ts` (jsdom: patched addEventListener/setInterval/observers emit correct TelemetryEvents; MutationObserver-based `target-removed` detection)

Agent details: patch prototypes idempotently (guard flag on `window`); every event carries `stack` from `new Error().stack` split/cleaned (drop agent frames); WeakRef registry of listener targets + a document-level MutationObserver that flags tracked targets no longer connected (`target-removed`); `performance.memory` sampled every 2 s (feature-detected). Agent → `window.postMessage({source:'memory-sherlock'})` → content script → `chrome.runtime.connect` port → background buffer. CSP/injection failure → content script reports `agent-unavailable` capability message.

- [ ] Steps: failing jsdom tests → implement → PASS → commit `feat: page instrumentation agent + content bridge`.

### Task 2.4: Panel ↔ background wiring + session store

**Files:**
- Create: `src/panel/stores/session.ts` (Zustand: session state, capabilities, telemetry stream, snapshot registry), `src/panel/lib/backgroundPort.ts`
- Test: `src/panel/__tests__/session-store.test.ts`

Snapshot flow: `takeSnapshot` → chunks accumulate in panel → `HeapClient.load(chunks)` → registry entry `{id, label, time, nodeCount, totalSize}`.

- [ ] Steps: failing store tests (mock port) → implement → PASS → commit `feat: panel session store and background wiring`.

---

## Phase 3 — Detectors + AI layer

### Task 3.1: Detector engine + registry

**Files:**
- Create: `src/core/detectors/types.ts`, `src/core/detectors/registry.ts`, `src/core/detectors/run.ts`
- Test: `src/core/detectors/__tests__/registry.test.ts`

**Interfaces (Produces):**

```ts
export interface DetectorContext {
  heap?: HeapQueryApi;            // wraps HeapClient for latest snapshot
  diff?: SnapshotDiffRow[];       // latest pair, if ≥2 snapshots
  agent?: TelemetryStore;         // indexed telemetry (listeners/timers/observers with lifecycle joins)
}
export interface Detector { id: string; title: string; requires: Requirement[]; analyze(ctx: DetectorContext): Promise<LeakCandidate[]>; }
export interface DetectorRunResult { candidates: LeakCandidate[]; unavailable: Array<{ id: string; title: string; missing: Requirement[] }>; }
export async function runDetectors(detectors: Detector[], ctx: DetectorContext): Promise<DetectorRunResult>;
```

`TelemetryStore` (in `src/core/detectors/telemetryStore.ts`): ingests `TelemetryEvent[]`, exposes `liveListeners()` (added − removed, joined with `target-removed`), `liveTimers()`, `liveObservers()`, `memorySeries()`, `repeatSignatures(kind)` (same creation-stack signature registered ≥N times).

- [ ] Steps: TDD registry skip-when-missing behavior + telemetry store joins → commit `feat: detector engine, registry, telemetry store`.

### Task 3.2: The six detectors + React stub

**Files:**
- Create: `src/core/detectors/detachedDom.ts`, `eventListener.ts`, `collectionGrowth.ts`, `timer.ts`, `observer.ts`, `closure.ts`, `reactFiber.ts`, `index.ts` (registry of all)
- Test: one test file per detector under `src/core/detectors/__tests__/`, using heap fixtures (Task 1.3 builder) + synthetic telemetry.

Rubrics (severity from retainedBytes thresholds 100KB/500KB/2MB/10MB; confidence documented per detector):
1. **detachedDom** (`heap`): from `findDetachedDom`; confidence 95 with strong retainer path, 70 without; owner from retaining closure's script name when resolvable in path.
2. **eventListener** (`agent`): live listeners whose target was removed → conf 90; window/document listeners with repeat signature ≥3 → conf 75.
3. **collectionGrowth** (`diff`+`heap`): constructors Map/Set/Array/Object with countDelta>0 and sizeDelta>50KB across diff → conf 60 + 10 per additional confirming snapshot pair (cap 85).
4. **timer** (`agent`): live intervals older than 30s with repeat signature → conf 80; single long-lived interval → conf 55.
5. **observer** (`agent`): observers observing with zero disconnect and target removed → conf 85.
6. **closure** (`heap`+`diff`): `closure`/`context`-type nodes retained >250KB that grew in diff → conf 65; evidence lists captured edge names.
7. **reactFiber stub** (`heap`): counts `FiberNode` constructor; growing across diff → single low-confidence (40) candidate.

- [ ] Steps: per detector TDD; commit `feat: six leak detectors + react stub`.

### Task 3.3: AI layer

**Files:**
- Create: `src/core/ai/types.ts` (`ExplanationProvider`, `Explanation {summary, why, where, recommendation}`, `FixSuggestion {language, patch, rationale}`), `src/core/ai/heuristic.ts` (template per classification, interpolating owner/evidence — e.g. event-listener → useEffect cleanup patch skeleton), `src/core/ai/claude.ts` (fetch `https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-6`, structured evidence in prompt, 15 s timeout → fallback to heuristic), `src/core/ai/provider.ts` (chooses by stored key)
- Test: heuristic snapshot tests per classification; claude provider with mocked fetch (success, timeout-fallback).

- [ ] Steps: TDD → commit `feat: pluggable explanation providers (heuristic + Claude)`.

---

## Phase 4 — Panel UI

### Task 4.1: Design system + app shell

**Files:**
- Create: `src/panel/styles/tokens.css` (spec palette + spacing + typography), `src/panel/styles/base.css`, `src/panel/components/` primitives: `Badge.tsx`, `SeverityPill.tsx`, `Card.tsx`, `Button.tsx`, `Kbd.tsx`, `EmptyState.tsx`, `SplitPane.tsx` (pointer-based resizable, persisted to localStorage), `src/panel/AppShell.tsx` (topbar / sidebar / main / AI inspector / bottom timeline slots), `src/panel/nav.ts` (11 sidebar items per spec), Zustand `ui` store (route, panel sizes, selected candidate).

- [ ] Steps: build renders shell with all nav items; commit `feat: design system and resizable app shell`.

### Task 4.2: Overview dashboard + Timeline

**Files:**
- Create: `src/panel/screens/Overview.tsx` (cards: Heap Size, Retained Size, Objects, Detached DOM, Growing Collections, Listeners, Timers, Observers, Memory Growth, Leak Score — each click-navigates), `src/panel/screens/Timeline.tsx` + `src/panel/components/HeapChart.tsx` (uPlot: memory-sample series, snapshot markers, zoom/brush/hover), leak score = weighted candidate severities.

- [ ] Steps: component tests for card wiring + leak score fn; commit `feat: overview dashboard and timeline`.

### Task 4.3: Heap Snapshot explorer

**Files:**
- Create: `src/panel/screens/Snapshots.tsx` (capture button, snapshot list, constructor aggregate table — virtualized, search/sort — node drill-down page, retainers pane rendering `RetainerStep[]`, diff mode selector rendering `SnapshotDiffRow[]`).

- [ ] Steps: table logic tests (sort/search reducers); commit `feat: heap snapshot explorer with diff mode`.

### Task 4.4: Leak Candidates + AI Inspector

**Files:**
- Create: `src/panel/screens/LeakCandidates.tsx` (cards per spec: title, severity stars, confidence, retained, owner, pattern; group-by selector severity/type/owner/confidence; Inspect → evidence view; Generate Fix → AI Inspector), `src/panel/AiInspector.tsx` (explanation sections what/why/where/recommendation, provider badge, patch block with Copy, stubbed Open-in-VS-Code / Generate-PR buttons, Export Markdown report).

- [ ] Steps: grouping reducer tests + markdown-report snapshot test; commit `feat: leak candidates and AI inspector`.

### Task 4.5: Remaining screens + command palette + settings

**Files:**
- Create: `src/panel/screens/DetachedDom.tsx`, `EventListeners.tsx` (virtualized table: event, target, owner, age, cleanup status; danger highlighting), `Observers.tsx`, `React.tsx` (fiber counts + stub candidate), `Caches.tsx` (collection aggregates from heap), `AiInsights.tsx` (all explanations list), `Settings.tsx` (Claude key via chrome.storage, sampling interval, detector toggles), `src/panel/CommandPalette.tsx` (Ctrl/Cmd-K, navigation + actions: take snapshot, run detectors).

- [ ] Steps: settings persistence test (mock chrome.storage); commit `feat: remaining screens, settings, command palette`.

---

## Phase 5 — Verification

### Task 5.1: test-app with labeled leaks

**Files:**
- Create: `test-app/` (separate Vite React app, own package.json) with routes each planting one leak, registered in `window.__PLANTED_LEAKS__: Array<{id, classification}>`: missing-listener-cleanup dialog, detached dialog kept by module ref, module-level growing Map on click, uncleared interval capturing state, undisconnected ResizeObserver, closure retaining 1MB array.

- [ ] Steps: `pnpm --dir test-app dev` runs; commit `feat: leaky test app`.

### Task 5.2: E2E detector correctness

**Files:**
- Create: `e2e/run.ts` (puppeteer-core: launch Chrome, open test-app, interact per leak, capture two heap snapshots via raw CDP, run heap engine + detectors in Node, assert every planted classification appears with confidence ≥ its rubric floor and report false-positive noise), `e2e/README.md`, npm script `pnpm e2e`.

- [ ] Steps: run against test-app → all planted leaks detected; fix detector gaps until green; commit `test: e2e detector correctness harness`.

### Task 5.3: Manual extension smoke + polish pass

- [ ] Load `dist/` unpacked, open DevTools panel on test-app, verify: attach → snapshot → candidates → AI explanation → timeline. Fix integration bugs. Commit `fix: integration polish`.

---

## Self-Review Notes

- Spec coverage: §2 pipeline → Tasks 2.1–2.4; §4 heap engine → 1.3–1.5; §5 detectors → 3.1–3.2; §6 AI → 3.3; §7 UI screens → 4.1–4.5; §8 verification → 5.1–5.3; degraded modes → 2.2/2.3 (capability messages) surfaced in 4.1 shell banner.
- Type names consistent: `LeakCandidate`, `RetainerStep`, `SnapshotDiffRow`, `DetectorContext`, `TelemetryEvent` defined once in Tasks 1.2/1.4/3.1 and consumed by name elsewhere.
- No TBDs; rubric numbers and thresholds are explicit.
