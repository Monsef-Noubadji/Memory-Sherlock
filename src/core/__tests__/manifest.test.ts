import { describe, expect, it } from 'vitest';
import manifest from '../../../manifest.config';

interface ManifestWithIcons {
  icons?: Record<number, string>;
}

describe('extension manifest', () => {
  it('declares the generated extension icon set', async () => {
    const resolved = (await manifest) as ManifestWithIcons;
    expect(resolved.icons).toEqual({
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    });
  });
});
