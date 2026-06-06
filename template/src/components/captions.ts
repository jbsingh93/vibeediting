import { z } from 'zod';

/**
 * Zod schema for the word-level caption format produced by our Whisper pipeline
 * (`capabilities/ingest/transcribe.ts`) and consumed by `KineticCaptions`. Matches the
 * `@remotion/captions` `Caption` shape. (Replaces unchecked `as Caption[]`.)
 *
 * `timestampMs` / `confidence` are tolerated as missing (→ null) so the schema does
 * not reject otherwise-valid transcripts, but every other field is enforced.
 */
export const captionSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable().default(null),
  confidence: z.number().nullable().default(null),
});

export const captionsSchema = z.array(captionSchema);

export type Caption = z.infer<typeof captionSchema>;

/**
 * Validate an imported captions JSON at composition load. Throws a readable error
 * (rather than rendering garbage) when the data is malformed — fail fast.
 */
export function parseCaptions(data: unknown): Caption[] {
  const result = captionsSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues;
    const preview = issues
      .slice(0, 5)
      .map((i) => `[${i.path.join('.') || 'root'}] ${i.message}`)
      .join('; ');
    throw new Error(`Invalid captions JSON (${issues.length} issue(s)): ${preview}`);
  }
  return result.data;
}

/** Normalize a word for punctuation-insensitive matching (emphasis words, etc.). */
export function normalizeWord(w: string): string {
  return w.trim().toLowerCase().replace(/[.,!?…:;"'`]/g, '');
}

/**
 * Build a punctuation-insensitive emphasis matcher from a base word list, so callers
 * list each base word once ("winner") instead of every variant ("winner.", "winner,").
 */
export function makeEmphasisMatcher(emphasisWords: string[]): (text: string) => boolean {
  const set = new Set(emphasisWords.map(normalizeWord));
  return (text: string) => set.has(normalizeWord(text));
}
