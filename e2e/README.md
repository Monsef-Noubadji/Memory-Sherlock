# E2E detector correctness harness

`pnpm e2e` proves the analysis engine against a real browser end to end:

1. Serves `test-app/index.html` (one deliberately-planted leak per detector) on an ephemeral localhost port.
2. Launches system Chrome via `puppeteer-core` (found automatically; override with `CHROME_PATH`).
3. Injects the **real** page agent (`src/agent/instrument.ts`, bundled with esbuild) so listener/timer/observer telemetry is genuine.
4. Captures a baseline heap snapshot, clicks every leak trigger four times, captures a second snapshot — both over the raw Chrome DevTools Protocol (`HeapProfiler`).
5. Runs the **real** heap parser, dominator/retained-size pass, snapshot diff, and the full detector registry in Node.
6. Asserts every planted leak classification is detected; exits non-zero if any is missing.

This exercises the same code paths the extension panel uses, minus the DevTools shell — so a green run means the parser, algorithms, detectors, and agent all agree on real V8 data.

Requires Chrome or Edge installed. No bundled Chromium is downloaded.
