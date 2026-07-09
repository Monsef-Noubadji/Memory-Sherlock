import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Memory Sherlock',
  version: '0.1.0',
  description: 'AI-powered browser memory leak inspector',
  minimum_chrome_version: '111',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  permissions: ['debugger', 'storage'],
  host_permissions: ['http://*/*', 'https://*/*'],
  devtools_page: 'src/devtools/devtools.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/agent/index.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
    },
  ],
});
