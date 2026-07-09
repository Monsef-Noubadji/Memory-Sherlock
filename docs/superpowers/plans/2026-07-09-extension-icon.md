# Extension Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished Memory Sherlock Chrome extension icon set and wire it into the manifest.

**Architecture:** Keep the icon source as deterministic SVG and generate required PNG sizes under Vite's `public` directory so they are copied to the extension root. Add a manifest test that locks the expected icon declarations.

**Tech Stack:** SVG, PNG assets, Manifest V3 config, Vitest, Vite/CRXJS.

## Global Constraints

- Use the approved direction: dark graphite rounded-square tile, refined magnifying glass, subtle heap-node pattern, restrained cyan/teal accent.
- Generated manifest paths must be `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, and `icons/icon128.png`.
- Do not rely on `HeapProfiler` or debugger behavior for this asset task.

---

### Task 1: Manifest Contract

**Files:**
- Create: `src/core/__tests__/manifest.test.ts`
- Modify: `manifest.config.ts`

**Interfaces:**
- Consumes: default export from `manifest.config.ts`
- Produces: manifest `icons` object with Chrome-required icon sizes.

- [ ] **Step 1: Write failing test**

Add a Vitest test importing the manifest and asserting `icons` equals `{ 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' }`.

- [ ] **Step 2: Run focused test**

Run: `pnpm vitest run src/core/__tests__/manifest.test.ts`
Expected: FAIL because `icons` is not configured.

- [ ] **Step 3: Add manifest icon paths**

Update `manifest.config.ts` with the `icons` block.

- [ ] **Step 4: Run focused test**

Run: `pnpm vitest run src/core/__tests__/manifest.test.ts`
Expected: PASS.

### Task 2: Icon Assets

**Files:**
- Create: `public/icons/icon.svg`
- Create: `public/icons/icon16.png`
- Create: `public/icons/icon32.png`
- Create: `public/icons/icon48.png`
- Create: `public/icons/icon128.png`

**Interfaces:**
- Consumes: manifest paths from Task 1.
- Produces: project-local icon assets copied into `dist/icons`.

- [ ] **Step 1: Create SVG source**

Add a 128 by 128 SVG with rounded graphite tile, heap nodes, and magnifier.

- [ ] **Step 2: Generate PNG sizes**

Generate PNG files for 16, 32, 48, and 128 px using the same design geometry.

- [ ] **Step 3: Verify files exist**

Run: `Get-ChildItem public/icons`
Expected: all five icon files are present.

### Task 3: Final Verification

**Files:**
- No additional files.

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Run focused manifest test**

Run: `pnpm vitest run src/core/__tests__/manifest.test.ts`
Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `pnpm build`
Expected: PASS and `dist/icons` contains the generated PNGs.
