# Memory Sherlock E2E Harness

This document answers the practical questions for running and extending the end-to-end detector correctness harness.

## Project Value Overview

Memory Sherlock helps developers move from "the tab is growing" to "this object graph is still alive because of this pattern." It combines browser telemetry, heap snapshot analysis, detector heuristics, and explanation tooling so memory leaks become inspectable engineering problems instead of vague performance anxiety.

The project is valuable because it:

- Connects behavioral signals, such as listeners, timers, observers, and collection growth, with structural heap evidence.
- Turns raw heap snapshots into focused leak candidates, retained sizes, constructor groups, diffs, and retainer paths.
- Gives teams a repeatable way to validate leak detectors against deliberately planted browser leaks.
- Fits the Chrome DevTools workflow while respecting extension platform limits; heap snapshots are imported from Chrome DevTools rather than captured through the blocked extension `HeapProfiler` path.

## 1. What

The E2E harness is a real-browser test for Memory Sherlock's leak detection pipeline.

When you run:

```bash
pnpm e2e
```

the harness:

1. Serves `test-app/index.html` from a temporary localhost server.
2. Launches an installed Chrome or Edge browser with `puppeteer-core`.
3. Injects the real page agent from `src/agent/instrument.ts`.
4. Captures a baseline V8 heap snapshot through raw Chrome DevTools Protocol `HeapProfiler`.
5. Clicks each planted leak trigger in the test app four times.
6. Captures a second heap snapshot.
7. Runs the real heap parser, retained-size computation, snapshot diff, telemetry store, detector registry, and detector runner.
8. Fails the process if any expected planted leak classification is missing.

The expected leak classes currently covered are:

- `event-listener`
- `detached-dom`
- `collection-growth`
- `timer`
- `observer`
- `closure`

This is not a UI test for the DevTools panel. It is a correctness harness for the engine, agent, heap parser, and detectors using real V8 heap data.

## 2. Why

Unit tests prove individual algorithms. This harness proves the pieces agree when they meet a real browser.

It catches problems that small tests often miss:

- Agent telemetry not matching detector expectations.
- Heap snapshot parsing issues against real V8 output.
- Retained-size or diff regressions that only appear on browser-produced graphs.
- Detector classifications drifting away from planted leak scenarios.
- Integration mistakes between heap data, telemetry data, and detector context assembly.

The harness uses raw CDP `HeapProfiler` because it runs from Node through Puppeteer. That is different from the Chrome extension runtime: the extension `chrome.debugger` API does not expose the `HeapProfiler` domain, so extension heap analysis uses imported `.heapsnapshot` files instead.

## 3. How To Setup

Install dependencies:

```bash
pnpm install
```

Make sure Chrome or Edge is installed. The harness checks these locations automatically:

- `%ProgramFiles%\Google\Chrome\Application\chrome.exe`
- `%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe`
- `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
- `%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`
- `/usr/bin/google-chrome`
- `/usr/bin/chromium-browser`
- `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

If your browser is somewhere else, set `CHROME_PATH`:

```powershell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
pnpm e2e
```

On macOS or Linux:

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm e2e
```

Run the harness:

```bash
pnpm e2e
```

A successful run prints detector candidates and a planted-leak coverage table ending with all expected classes passing. A failing run exits non-zero and prints either the missing detections or the harness error.

Useful companion checks:

```bash
pnpm test
pnpm typecheck
pnpm build
```

After `pnpm build`, Vite writes the unpacked Chrome extension to `dist/`. To try it in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project's `dist` folder.
5. Open DevTools on a page and select the **Memory Sherlock** panel.

Reload the extension from `chrome://extensions` after each new build.

## 4. Contributions

When changing detectors, telemetry, heap parsing, or the test app, keep the harness honest.

Good contribution flow:

1. Add or update the planted leak in `test-app/index.html`.
2. If the scenario needs browser telemetry, make sure the real agent in `src/agent/instrument.ts` emits the required event.
3. Add the expected button id and leak classification to `EXPECTED` in `e2e/run.ts`.
4. Run `pnpm e2e` and confirm the new scenario fails before the detector fix when possible.
5. Implement or adjust the detector.
6. Run `pnpm e2e` again and confirm the planted-leak coverage passes.
7. Run focused unit tests for the detector or heap code you changed.

Contribution guidelines:

- Keep planted leaks deterministic. Avoid timing-sensitive scenarios unless the detector is specifically about timing.
- Prefer small, named buttons in `test-app/index.html`; each button should trigger one clear leak pattern.
- Do not mock the detector pipeline in this harness. The point is to use the real parser, real agent, and real registry.
- Keep browser launch assumptions local to `findChrome()` in `e2e/run.ts`.
- Keep setup lightweight. `puppeteer-core` intentionally does not download Chromium, so contributors use their installed browser.

## 5. References

Project files:

- `e2e/run.ts`: main harness runner.
- `e2e/server.ts`: temporary localhost server for the test app.
- `test-app/index.html`: deliberately leaky browser page.
- `src/agent/instrument.ts`: browser-side telemetry agent injected by the harness.
- `src/core/heap/parse.ts`: V8 heap snapshot parser.
- `src/core/heap/dominators.ts`: retained-size computation.
- `src/core/heap/diff.ts`: snapshot diffing.
- `src/core/detectors/index.ts`: detector registry.
- `src/core/detectors/run.ts`: detector execution.

External references:

- Chrome DevTools Protocol `HeapProfiler`: https://chromedevtools.github.io/devtools-protocol/v8/HeapProfiler/
- Puppeteer CDP sessions: https://pptr.dev/api/puppeteer.cdpsession
- Chrome extension `chrome.debugger` API restrictions: https://developer.chrome.com/docs/extensions/reference/api/debugger
