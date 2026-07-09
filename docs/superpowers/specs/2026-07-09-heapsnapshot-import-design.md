# Heapsnapshot Import Design

## Goal

Let Memory Sherlock analyze V8 `.heapsnapshot` files exported from Chrome DevTools, without relying on the blocked `HeapProfiler` domain in the extension `chrome.debugger` API.

## Architecture

The panel will add a manual import path that reads a local `.heapsnapshot` file as text and passes it to the existing heap worker as a single snapshot chunk. The worker already parses Chrome heap snapshot JSON through `load { chunks }`, computes retained sizes, and stores the parsed graph by snapshot id. The session store will expose an `importSnapshot(fileName, text)` action so UI code does not duplicate loading, metadata creation, or error handling.

## Components

- `src/panel/stores/session.ts`: add `importSnapshot(fileName, text)` to call `loadSnapshot([text])`, create a `SnapshotMeta`, and report parse failures through existing `errors`.
- `src/panel/screens/Snapshots.tsx`: add file input controls in both the empty state and snapshot toolbar. Accept `.heapsnapshot` and `.json`, read via `File.text()`, and call the store action.
- `src/panel/components/StatusBar.tsx` and `src/panel/components/CommandPalette.tsx`: remove visible debugger snapshot commands that route into the blocked extension CDP path.
- `src/panel/screens/DetachedDom.tsx`: point users to imported snapshots when no heap snapshot is loaded.
- `src/panel/__tests__/session-store.test.ts`: cover successful import metadata and failed import error handling.

## UX

When there are no snapshots, the primary action becomes importing a `.heapsnapshot`. Existing live capture controls may remain visible only when the debugger is attached, but manual import must work without debugger attachment. Imported snapshot labels use the original filename, falling back to `Imported snapshot` if needed.

## Error Handling

File read failures and parser failures are surfaced in the existing session error list. Pending chunks are not used for imports, so a failed import must not disturb in-progress debugger snapshot chunks.

## Testing

Use store-level tests for the import behavior. Existing heap parser tests cover the snapshot JSON format; the import feature only needs to prove it passes file text into `loadSnapshot([text])`, registers metadata, and reports failures.
