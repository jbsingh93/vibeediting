import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VERSION, PRODUCT_NAME } from '../../src/version.js';

describe('version', () => {
  it('matches package.json version (runtime walk works from src/)', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it('exposes the product name', () => {
    expect(PRODUCT_NAME).toBe('JBS Vibe Editing');
  });
});
