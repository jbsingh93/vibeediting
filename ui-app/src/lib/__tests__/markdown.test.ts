/**
 * Ported from the parent p6-pure.test.ts in-house-markdown block (the constructs + escape-first
 * safety). The CAPABILITIES.md round-trip smoke is dropped — it read a repo-root doc from a
 * server-context test; the parser itself is fully exercised here by the per-construct cases.
 */
import { describe, it, expect } from 'vitest';
import { parseInline, parseMarkdown, safeHref, inlineText } from '../markdown';

describe('lib/markdown.ts (in-house, escape-first)', () => {
  it('parses inline bold / italic / code / links into plain-string tokens', () => {
    const t = parseInline('a **bold** and *ital* with `code` and [link](https://x.dk)');
    expect(t).toEqual([
      { t: 'text', text: 'a ' },
      { t: 'bold', children: [{ t: 'text', text: 'bold' }] },
      { t: 'text', text: ' and ' },
      { t: 'italic', children: [{ t: 'text', text: 'ital' }] },
      { t: 'text', text: ' with ' },
      { t: 'code', text: 'code' },
      { t: 'text', text: ' and ' },
      { t: 'link', href: 'https://x.dk', children: [{ t: 'text', text: 'link' }] },
    ]);
  });
  it('downgrades unsafe link targets to visible plain text (escape-first)', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    const t = parseInline('[x](javascript:alert(1))');
    expect(t).toEqual([{ t: 'text', text: '[x](javascript:alert(1))' }]);
  });
  it('keeps snake_case out of italics and ** inside code spans literal', () => {
    expect(parseInline('use plan_gate_stage here')).toEqual([{ t: 'text', text: 'use plan_gate_stage here' }]);
    expect(parseInline('`a ** b`')).toEqual([{ t: 'code', text: 'a ** b' }]);
  });
  it('parses headings, hr, blockquote, and fenced code (content verbatim, never re-parsed)', () => {
    const blocks = parseMarkdown('# H1\n\n---\n\n> quoted **line**\n\n```bash\nnpx tsx x.ts --flag **notbold**\n```');
    expect(blocks[0]).toMatchObject({ t: 'heading', level: 1 });
    expect(blocks[1]).toEqual({ t: 'hr' });
    expect(blocks[2]!.t).toBe('quote');
    expect(blocks[3]).toEqual({ t: 'code', lang: 'bash', text: 'npx tsx x.ts --flag **notbold**' });
  });
  it('parses tables incl. escaped pipes, and both list kinds', () => {
    const blocks = parseMarkdown('| A | B |\n|---|---|\n| 1 | a \\| b |\n\n- one\n- two\n\n1. first\n2. second');
    const table = blocks[0]!;
    expect(table.t).toBe('table');
    if (table.t === 'table') {
      expect(inlineText(table.header[0]!)).toBe('A');
      expect(inlineText(table.rows[0]![1]!)).toBe('a | b');
    }
    expect(blocks[1]).toMatchObject({ t: 'list', ordered: false });
    expect(blocks[2]).toMatchObject({ t: 'list', ordered: true });
  });
  it('joins paragraph continuation lines', () => {
    const blocks = parseMarkdown('one line\ntwo line\n\nnext para');
    expect(blocks).toHaveLength(2);
    if (blocks[0]!.t === 'para') expect(inlineText(blocks[0]!.inline)).toBe('one line two line');
  });
});
