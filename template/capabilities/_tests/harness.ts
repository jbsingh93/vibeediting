/**
 * Minimal dependency-free test harness for the capability layer (plan X.1 "media gate").
 * No Jest/Vitest — runs under the pinned `tsx`. Register with test(), run with runAll().
 */
type TestFn = () => void | Promise<void>;
interface Case { name: string; fn: TestFn }

const queue: Case[] = [];

export function test(name: string, fn: TestFn): void {
  queue.push({ name, fn });
}

export function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(`${msg ?? 'not equal'} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertIncludes(haystack: string, needle: string, msg?: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${msg ?? 'missing substring'} — expected output to include "${needle}"`);
  }
}

export async function assertThrows(fn: () => unknown, msg?: string): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(msg ?? 'expected the call to throw, but it did not');
}

export async function runAll(): Promise<number> {
  let pass = 0;
  let fail = 0;
  console.log(`\nvibe capability tests — ${queue.length} case(s)\n` + '─'.repeat(64));
  for (const c of queue) {
    try {
      await c.fn();
      console.log(`  ✓ ${c.name}`);
      pass++;
    } catch (e) {
      console.log(`  ✗ ${c.name}`);
      console.log(`      ${e instanceof Error ? e.message : String(e)}`);
      fail++;
    }
  }
  console.log('─'.repeat(64));
  console.log(`${pass} passed · ${fail} failed`);
  return fail === 0 ? 0 : 1;
}
