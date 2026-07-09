import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appPath = join(here, '..', 'test-app', 'index.html');

/** Serves the single-file test app on an ephemeral port. */
export async function serveTestApp(): Promise<{ url: string; close: () => Promise<void>; server: Server }> {
  const html = await readFile(appPath, 'utf8');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('failed to bind test-app server');
  return {
    url: `http://127.0.0.1:${addr.port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    server,
  };
}
