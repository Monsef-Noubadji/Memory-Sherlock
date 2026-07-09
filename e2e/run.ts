import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import puppeteer, { type Browser, type Page, type CDPSession } from 'puppeteer-core';
import { serveTestApp } from './server';
import { parseSnapshotChunks, type HeapGraph } from '../src/core/heap/parse';
import { computeRetainedSizes } from '../src/core/heap/dominators';
import { diffSnapshots } from '../src/core/heap/diff';
import { aggregateByConstructor } from '../src/core/heap/aggregate';
import { createEngineState } from '../src/core/heap/protocol';
import { heapApiFromEngine } from '../src/core/detectors/heapApi';
import { TelemetryStore } from '../src/core/detectors/telemetryStore';
import { allDetectors } from '../src/core/detectors';
import { runDetectors } from '../src/core/detectors/run';
import type { DetectorContext } from '../src/core/detectors/types';
import type { LeakClassification } from '../src/shared/leak';
import type { TelemetryEvent } from '../src/shared/telemetry';

const CHROME_CANDIDATES = [
  `${process.env['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chrome/Edge executable found; set CHROME_PATH');
  return process.env.CHROME_PATH ?? found;
}

async function captureSnapshot(cdp: CDPSession): Promise<ReturnType<typeof parseSnapshotChunks>> {
  const chunks: string[] = [];
  const onChunk = (e: { chunk: string }) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, treatGlobalObjectsAsRoots: true });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const graph = parseSnapshotChunks(chunks);
  computeRetainedSizes(graph);
  return graph;
}

/**
 * The agent runs in the browser and posts telemetry to window; we collect it
 * in Node by exposing a binding. Returns installed collector.
 */
/** Bundles the real instrument module to a browser IIFE exposing window.__MS_installAgent. */
async function buildAgentBundle(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const result = await build({
    stdin: {
      contents: `import { installAgent } from '${join(here, '..', 'src', 'agent', 'instrument').replace(/\\/g, '/')}';
        (window).__MS_installAgent = installAgent;`,
      resolveDir: here,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
    platform: 'browser',
  });
  return result.outputFiles[0].text;
}

async function installBrowserAgent(page: Page, agentBundle: string): Promise<() => Promise<TelemetryEvent[]>> {
  await page.evaluateOnNewDocument((bundle: string) => {
    (window as unknown as { __MS_EVENTS__: unknown[] }).__MS_EVENTS__ = [];
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(bundle)();
    const install = (window as unknown as { __MS_installAgent: (w: unknown, cb: (e: unknown) => void) => void }).__MS_installAgent;
    install(window, (e) => (window as unknown as { __MS_EVENTS__: unknown[] }).__MS_EVENTS__.push(e));
  }, agentBundle);
  return async () =>
    (await page.evaluate(() => (window as unknown as { __MS_EVENTS__: TelemetryEvent[] }).__MS_EVENTS__ ?? [])) as TelemetryEvent[];
}

const EXPECTED: Array<{ button: string; classification: LeakClassification }> = [
  { button: 'leak-listener', classification: 'event-listener' },
  { button: 'leak-detached', classification: 'detached-dom' },
  { button: 'leak-cache', classification: 'collection-growth' },
  { button: 'leak-timer', classification: 'timer' },
  { button: 'leak-observer', classification: 'observer' },
  { button: 'leak-closure', classification: 'closure' },
];

async function main() {
  const app = await serveTestApp();
  let browser: Browser | null = null;
  let exitCode = 0;
  try {
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--no-sandbox', '--js-flags=--expose-gc'],
    });
    const page = await browser.newPage();
    const agentBundle = await buildAgentBundle();
    const collectEvents = await installBrowserAgent(page, agentBundle);
    await page.goto(app.url, { waitUntil: 'domcontentloaded' });

    const cdp = await page.target().createCDPSession();

    // baseline snapshot before any interaction
    console.log('Capturing baseline snapshot…');
    const before = await captureSnapshot(cdp);

    // trigger every planted leak, some repeatedly to build growth + repeat signatures
    for (let round = 0; round < 4; round++) {
      for (const { button } of EXPECTED) {
        await page.click(`#${button}`);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 200));

    console.log('Capturing post-interaction snapshot…');
    const after = await captureSnapshot(cdp);

    const events = await collectEvents();
    console.log(`Collected ${events.length} telemetry events.`);

    // Build detector context exactly as the panel would.
    const state = createEngineState();
    const afterId = registerSnapshot(state, after);

    const telemetry = new TelemetryStore();
    telemetry.ingest(events);

    const ctx: DetectorContext = {
      heap: heapApiFromEngine(state, afterId),
      diff: diffSnapshots(before, after),
      agent: telemetry,
    };

    const result = await runDetectors(allDetectors, ctx);
    const foundClasses = new Set(result.candidates.map((c) => c.classification));

    console.log(`\nDetectors produced ${result.candidates.length} candidates:`);
    for (const c of result.candidates) {
      console.log(`  [${c.classification}] ${c.title}  (sev ${c.severity}, ${c.confidence}%)`);
    }

    console.log('\nPlanted-leak coverage:');
    const missing: string[] = [];
    for (const { classification } of dedupe(EXPECTED)) {
      const ok = foundClasses.has(classification);
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${classification}`);
      if (!ok) missing.push(classification);
    }

    if (missing.length > 0) {
      console.error(`\n✗ Missing detections: ${missing.join(', ')}`);
      exitCode = 1;
    } else {
      console.log('\n✓ All planted leaks detected.');
    }
  } catch (err) {
    console.error('e2e harness error:', err);
    exitCode = 1;
  } finally {
    await browser?.close();
    await app.close();
  }
  process.exit(exitCode);
}

// We already have a parsed + dominated graph, so register it with the engine
// directly instead of re-serializing and re-parsing through the 'load' op.
function registerSnapshot(state: ReturnType<typeof createEngineState>, graph: HeapGraph): number {
  const id = state.nextId++;
  state.snapshots.set(id, { graph, aggregates: aggregateByConstructor(graph) });
  return id;
}

function dedupe<T extends { classification: LeakClassification }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.classification) ? false : (seen.add(i.classification), true)));
}

void main();
