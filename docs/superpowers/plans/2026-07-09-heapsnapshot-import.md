# Heapsnapshot Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual `.heapsnapshot` import so Memory Sherlock can analyze exported Chrome heap snapshots without `HeapProfiler` access from `chrome.debugger`.

**Architecture:** The UI reads a selected file as text and delegates loading to the session store. The store passes that text as one chunk to the existing heap worker and records snapshot metadata using the existing `SnapshotMeta` shape.

**Tech Stack:** React 18, Zustand vanilla store, Vitest, TypeScript, existing heap worker protocol.

## Global Constraints

- Do not call `HeapProfiler.*` for the manual import path.
- Reuse the existing `loadSnapshot(chunks: string[])` dependency.
- Imported snapshot labels use the selected filename or `Imported snapshot`.
- Parse and file read failures surface through the existing `errors` array.

---

### Task 1: Store Import Action

**Files:**
- Modify: `src/panel/stores/session.ts`
- Test: `src/panel/__tests__/session-store.test.ts`

**Interfaces:**
- Consumes: `SessionDeps.loadSnapshot(chunks: string[]): Promise<LoadResult>`
- Produces: `SessionSlice.importSnapshot(fileName: string, text: string): Promise<void>`

- [ ] **Step 1: Write failing tests**

Add tests that call `store.getState().importSnapshot('baseline.heapsnapshot', '{"snapshot":true}')` and assert `loadSnapshot` receives `['{"snapshot":true}']`, `snapshots[0].label` is `baseline.heapsnapshot`, `loadingSnapshot` returns to `false`, and rejected loads append an `import failed: ...` error.

- [ ] **Step 2: Run focused test**

Run: `pnpm vitest run src/panel/__tests__/session-store.test.ts`
Expected: FAIL because `importSnapshot` does not exist.

- [ ] **Step 3: Implement store action**

Add `importSnapshot` to `SessionSlice` and implement it by setting `loadingSnapshot`, awaiting `loadSnapshot([text])`, appending `SnapshotMeta`, and catching failures into `errors`.

- [ ] **Step 4: Run focused test**

Run: `pnpm vitest run src/panel/__tests__/session-store.test.ts`
Expected: PASS.

### Task 2: Snapshot Screen Import Controls

**Files:**
- Modify: `src/panel/screens/Snapshots.tsx`
- Modify: `src/panel/components/StatusBar.tsx`
- Modify: `src/panel/components/CommandPalette.tsx`
- Modify: `src/panel/screens/DetachedDom.tsx`

**Interfaces:**
- Consumes: `SessionSlice.importSnapshot(fileName: string, text: string): Promise<void>`
- Produces: visible import action in empty state and toolbar.

- [ ] **Step 1: Add a hidden file input helper**

Use a `useRef<HTMLInputElement>(null)` and a `handleImportFile` callback that reads the selected file with `file.text()` and awaits `rt.session.getState().importSnapshot(file.name, text)`.

- [ ] **Step 2: Add import actions**

Render an `Import snapshot` button in the empty state and an `Import` button in the snapshot toolbar. Both trigger the hidden file input. Set `accept=".heapsnapshot,.json,application/json"`.

- [ ] **Step 3: Remove blocked debugger capture prompts**

Remove status bar and command palette actions for attach, garbage collection, and live heap snapshot capture. Update empty states that mention capture so they point to imported `.heapsnapshot` files instead.

- [ ] **Step 4: Verify manually through tests/build**

Run: `pnpm typecheck`
Expected: PASS.

### Task 3: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run full tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS.
