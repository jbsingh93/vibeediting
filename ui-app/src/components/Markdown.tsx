/**
 * components/Markdown.tsx — UIP6.8: render the lib/markdown.ts AST as React nodes. React escapes
 * every string; `dangerouslySetInnerHTML` is never used (footgun §7.16). Mono on code, hairline
 * tables, doc-08 tone.
 */
import { parseMarkdown, safeHref, type InlineToken, type MdBlock } from '../lib/markdown';

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((tok, i) => {
        switch (tok.t) {
          case 'text':
            return <span key={i}>{tok.text}</span>;
          case 'code':
            return (
              <code key={i} className="mono" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '1px 5px', fontSize: '0.92em' }}>
                {tok.text}
              </code>
            );
          case 'bold':
            return (
              <strong key={i}>
                <Inline tokens={tok.children} />
              </strong>
            );
          case 'italic':
            return (
              <em key={i}>
                <Inline tokens={tok.children} />
              </em>
            );
          case 'link': {
            const href = safeHref(tok.href);
            if (!href) return <span key={i}>{tok.href}</span>;
            return (
              <a key={i} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                <Inline tokens={tok.children} />
              </a>
            );
          }
        }
      })}
    </>
  );
}

function Block({ b }: { b: MdBlock }) {
  switch (b.t) {
    case 'heading': {
      const size = [22, 18, 15.5, 14, 13.5, 13][Math.min(b.level, 6) - 1];
      return (
        <div role="heading" aria-level={b.level} style={{ fontSize: size, fontWeight: 700, margin: '14px 0 6px' }}>
          <Inline tokens={b.inline} />
        </div>
      );
    }
    case 'para':
      return (
        <p style={{ margin: '8px 0', fontSize: 13.5, lineHeight: 1.6 }}>
          <Inline tokens={b.inline} />
        </p>
      );
    case 'code':
      return (
        <pre className="mono" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: 12, margin: '10px 0', fontSize: 12, lineHeight: 1.55, overflow: 'auto', whiteSpace: 'pre' }}>
          {b.text}
        </pre>
      );
    case 'list':
      return b.ordered ? (
        <ol style={{ margin: '8px 0', paddingLeft: 22, fontSize: 13.5, lineHeight: 1.6 }}>
          {b.items.map((it, i) => (
            <li key={i}>
              <Inline tokens={it} />
            </li>
          ))}
        </ol>
      ) : (
        <ul style={{ margin: '8px 0', paddingLeft: 22, fontSize: 13.5, lineHeight: 1.6 }}>
          {b.items.map((it, i) => (
            <li key={i}>
              <Inline tokens={it} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5, lineHeight: 1.5, minWidth: 320 }}>
            <thead>
              <tr>
                {b.header.map((cell, i) => (
                  <th key={i} style={{ ...cellStyle, fontWeight: 700, background: 'var(--surface-2)' }}>
                    <Inline tokens={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={cellStyle}>
                      <Inline tokens={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'quote':
      return (
        <blockquote style={{ margin: '10px 0', padding: '6px 14px', borderLeft: '3px solid var(--hairline)', color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
          {b.lines.map((l, i) => (
            <div key={i}>
              <Inline tokens={l} />
            </div>
          ))}
        </blockquote>
      );
    case 'hr':
      return <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '14px 0' }} />;
  }
}

export function Markdown({ md }: { md: string }) {
  const blocks = parseMarkdown(md);
  return (
    <div data-testid="markdown" style={{ color: 'var(--secondary)' }}>
      {blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  border: '1px solid var(--hairline)',
  padding: '5px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
};
