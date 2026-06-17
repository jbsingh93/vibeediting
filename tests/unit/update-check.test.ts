/**
 * update-check.test.ts — the dependency-free "update available" notifier.
 *
 * Covers the pure decision logic: version comparison and the opt-out / non-interactive gate.
 * The network refresh is detached + fire-and-forget and is intentionally not exercised here.
 */
import { describe, it, expect } from 'vitest';
import { isVersionNewer, shouldSkipCheck, formatUpdateBanner } from '../../src/core/update-check.js';

describe('isVersionNewer', () => {
  it('detects a newer patch/minor/major', () => {
    expect(isVersionNewer('0.1.1', '0.1.0')).toBe(true);
    expect(isVersionNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isVersionNewer('1.0.0', '0.9.9')).toBe(true);
  });

  it('returns false for equal or older versions', () => {
    expect(isVersionNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isVersionNewer('0.1.0', '0.1.1')).toBe(false);
    expect(isVersionNewer('0.9.9', '1.0.0')).toBe(false);
  });

  it('tolerates v-prefix and prerelease/build suffixes', () => {
    expect(isVersionNewer('v0.1.1', '0.1.0')).toBe(true);
    expect(isVersionNewer('0.1.1-beta.1', '0.1.0')).toBe(true);
    expect(isVersionNewer('0.1.0', '0.1.0-rc.1')).toBe(false); // same core → not newer
  });

  it('is robust to malformed input', () => {
    expect(isVersionNewer('garbage', '0.1.0')).toBe(false);
    expect(isVersionNewer('', '0.1.0')).toBe(false);
  });
});

describe('shouldSkipCheck', () => {
  it('skips when explicitly opted out', () => {
    expect(shouldSkipCheck({ VIBE_NO_UPDATE_CHECK: '1' }, true)).toBe(true);
    expect(shouldSkipCheck({ NO_UPDATE_NOTIFIER: '1' }, true)).toBe(true);
  });

  it('skips in CI and when output is not a TTY', () => {
    expect(shouldSkipCheck({ CI: 'true' }, true)).toBe(true);
    expect(shouldSkipCheck({}, false)).toBe(true);
  });

  it('runs on an interactive terminal with no opt-out', () => {
    expect(shouldSkipCheck({}, true)).toBe(false);
  });
});

describe('formatUpdateBanner', () => {
  it('mentions both versions and the update command', () => {
    const banner = formatUpdateBanner('0.1.1', '0.1.0');
    expect(banner).toContain('0.1.1');
    expect(banner).toContain('0.1.0');
    expect(banner).toContain('npm i -g vibeediting');
  });
});
