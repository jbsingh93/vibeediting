/**
 * lib/markdown.ts — UIP6.8: the SMALL in-house markdown parser (plan §6 design decision #5,
 * no dependency). Covers exactly the constructs CAPABILITIES.md and brief.md actually use:
 * headings, paragraphs, bold/italic/inline-code, fenced code blocks, tables, lists, blockquotes,
 * links, hr.
 *
 * ESCAPE-FIRST by construction (footgun §7.16): this module produces pure DATA (an AST of plain
 * strings) — never HTML. The renderer (components/Markdown.tsx) builds React nodes from it, and
 * React escapes all text; `dangerouslySetInnerHTML` is never used anywhere. Links are restricted
 * to http(s)/#/mailto — anything else (javascript: etc.) renders as plain text.
 */

export type InlineToken =
  | { t: 'text'; text: string }
  | { t: 'code'; text: string }
  | { t: 'bold'; children: InlineToken[] }
  | { t: 'italic'; children: InlineToken[] }
  | { t: 'link'; href: string; children: InlineToken[] };

export type MdBlock =
  | { t: 'heading'; level: number; inline: InlineToken[] }
  | { t: 'para'; inline: InlineToken[] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'list'; ordered: boolean; items: InlineToken[][] }
  | { t: 'table'; header: InlineToken[][]; rows: InlineToken[][][] }
  | { t: 'quote'; lines: InlineToken[][] }
  | { t: 'hr' };

/** Only safe link targets become <a>; anything else stays visible plain text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || h.startsWith('#') || /^mailto:/i.test(h)) return h;
  return null;
}

// ── inline ──────────────────────────────────────────────────────────────────────

interface InlineMatch {
  index: number;
  length: number;
  token: InlineToken;
}

function earliestMatch(text: string): InlineMatch | null {
  let best: InlineMatch | null = null;
  const consider = (m: InlineMatch | null): void => {
    if (m && (!best || m.index < best.index)) best = m;
  };

  // `code` — wins ties by being considered first at the same index (no nesting inside)
  const code = /`([^`\n]+)`/.exec(text);
  if (code) consider({ index: code.index, length: code[0].length, token: { t: 'code', text: code[1] ?? '' } });

  // **bold**
  const bold = /\*\*([^*\n]+(?:\*(?!\*)[^*\n]*)*)\*\*/.exec(text);
  if (bold) consider({ index: bold.index, length: bold[0].length, token: { t: 'bold', children: parseInline(bold[1] ?? '') } });

  // *italic* (not part of **) and _italic_ (word-bounded so snake_case survives)
  const ital = /(^|[^*])\*([^*\n]+)\*(?!\*)/.exec(text);
  if (ital) {
    const idx = ital.index + (ital[1] ?? '').length;
    consider({ index: idx, length: ital[0].length - (ital[1] ?? '').length, token: { t: 'italic', children: parseInline(ital[2] ?? '') } });
  }
  const und = /(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/.exec(text);
  if (und) {
    const idx = und.index + (und[1] ?? '').length;
    consider({ index: idx, length: und[0].length - (und[1] ?? '').length, token: { t: 'italic', children: parseInline(und[2] ?? '') } });
  }

  // [text](url)
  const link = /\[([^\]\n]+)\]\(([^)\n]+)\)/.exec(text);
  if (link) {
    consider({ index: link.index, length: link[0].length, token: { t: 'link', href: link[2] ?? '', children: parseInline(link[1] ?? '') } });
  }

  return best;
}

/** Tokenize one line of inline markdown into plain-string tokens (pure, total). */
export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let rest = text;
  for (;;) {
    const m = earliestMatch(rest);
    if (!m) {
      if (rest) out.push({ t: 'text', text: rest });
      return mergeText(out);
    }
    if (m.index > 0) out.push({ t: 'text', text: rest.slice(0, m.index) });
    // an unsafe link target downgrades to visible plain text (escape-first discipline)
    if (m.token.t === 'link' && !safeHref(m.token.href)) {
      out.push({ t: 'text', text: rest.slice(m.index, m.index + m.length) });
    } else {
      out.push(m.token);
    }
    rest = rest.slice(m.index + m.length);
  }
}

function mergeText(tokens: InlineToken[]): InlineToken[] {
  const out: InlineToken[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (t.t === 'text' && last?.t === 'text') last.text += t.text;
    else out.push(t);
  }
  return out;
}

// ── blocks ──────────────────────────────────────────────────────────────────────

const TABLE_DIVIDER = /^\|?[\s:|-]+\|?$/;

function splitRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  // split on unescaped pipes; "\|" stays a literal pipe in the cell
  return l.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Parse a markdown document into blocks (pure → unit-tested). */
export function parseMarkdown(md: string): MdBlock[] {
  const lines = md.split(/\r?\n/);
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code
    const fence = line.match(/^```\s*(\S*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        body.push(lines[i]!);
        i++;
      }
      i++; // closing fence (or EOF)
      blocks.push({ t: 'code', lang: fence[1] ?? '', text: body.join('\n') });
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ t: 'heading', level: (h[1] ?? '').length, inline: parseInline((h[2] ?? '').trim()) });
      i++;
      continue;
    }

    // hr
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }

    // table: a |-row followed by a divider row
    const nextLine = lines[i + 1];
    if (line.trimStart().startsWith('|') && nextLine !== undefined && TABLE_DIVIDER.test(nextLine.trim()) && nextLine.includes('-')) {
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: InlineToken[][][] = [];
      while (i < lines.length && lines[i]!.trimStart().startsWith('|')) {
        rows.push(splitRow(lines[i]!).map(parseInline));
        i++;
      }
      blocks.push({ t: 'table', header, rows });
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const qlines: InlineToken[][] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        const t = lines[i]!.replace(/^>\s?/, '');
        if (t.trim()) qlines.push(parseInline(t));
        i++;
      }
      blocks.push({ t: 'quote', lines: qlines });
      continue;
    }

    // list (single level; indented continuation lines append to the item)
    const li = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      const ordered = /^\d+\.$/.test(li[1] ?? '');
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i]!;
        const m = cur.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
        if (m && /^\d+\.$/.test(m[1] ?? '') === ordered) {
          items.push(m[2] ?? '');
          i++;
        } else if (cur.match(/^\s{2,}\S/) && items.length > 0 && !cur.trimStart().startsWith('|')) {
          items[items.length - 1] += ' ' + cur.trim();
          i++;
        } else {
          break;
        }
      }
      blocks.push({ t: 'list', ordered, items: items.map(parseInline) });
      continue;
    }

    // paragraph: contiguous plain lines
    const para: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,6})\s/.test(lines[i]!) &&
      !/^```/.test(lines[i]!) &&
      !/^>\s?/.test(lines[i]!) &&
      !lines[i]!.trimStart().startsWith('|') &&
      !lines[i]!.match(/^\s*([-*+]|\d+\.)\s+/) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!.trim())
    ) {
      para.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ t: 'para', inline: parseInline(para.join(' ')) });
  }

  return blocks;
}

/** Flatten a parsed doc back to plain text (the wiki's search corpus). */
export function inlineText(tokens: InlineToken[]): string {
  return tokens
    .map((t) => {
      if (t.t === 'text' || t.t === 'code') return t.text;
      return inlineText(t.children);
    })
    .join('');
}
