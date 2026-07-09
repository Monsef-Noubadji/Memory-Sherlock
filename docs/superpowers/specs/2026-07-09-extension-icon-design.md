# Extension Icon Design

## Goal

Create a classy Memory Sherlock extension icon that works at Chrome toolbar and extension-management sizes.

## Direction

Use a dark graphite rounded-square tile with a refined magnifying glass over a subtle heap-node pattern. The icon should read as memory inspection and debugging at a glance, while staying polished and restrained rather than playful.

## Assets

- `public/icons/icon.svg`: source design at 128 by 128.
- `public/icons/icon16.png`: Chrome toolbar-scale raster.
- `public/icons/icon32.png`: intermediate raster.
- `public/icons/icon48.png`: extension-management raster.
- `public/icons/icon128.png`: Chrome Web Store and high-density raster.

## Manifest

`manifest.config.ts` will include an `icons` block pointing at the generated PNG files. The paths must be relative to the extension root after Vite copies `public`.

## Verification

Add a Vitest check that the manifest declares all required icon sizes and paths. Run typecheck, focused manifest test, and production build.
