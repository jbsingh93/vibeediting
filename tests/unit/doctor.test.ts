import { describe, expect, it } from 'vitest';
import { runDoctorChecks } from '../../src/commands/doctor.js';

describe('vibe doctor (preliminary)', () => {
  it('always reports node + platform + agent rollup checks', () => {
    const checks = runDoctorChecks();
    const ids = checks.map((c) => c.id);
    expect(ids).toContain('node');
    expect(ids).toContain('platform');
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('ffmpeg');
    expect(ids).toContain('agent');
  });

  it('node check passes on the running toolchain (engines: >=20)', () => {
    const node = runDoctorChecks().find((c) => c.id === 'node');
    expect(node?.status).toBe('ok');
  });
});
