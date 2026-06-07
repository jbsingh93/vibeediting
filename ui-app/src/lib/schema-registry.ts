/**
 * lib/schema-registry.ts — UIP4.3: the Zod-props comps' editing contracts. Each entry lazily
 * loads the comp's REAL timeline schema (the same `*PropsSchema` the project's Root.tsx validates
 * with), exports it as a JSON-schema tree for the generated inspector (lib/schema-form), and knows
 * how to recompute `durationInFrames` from edited props so the Player stays honest while editing.
 *
 * v1 ships NONE: the template's only composition (DemoWelcome) takes no props, and a prebuilt
 * client can't know the user's own Zod-props comps. The registry structure + types + helper
 * (`entry`) are kept intact as the extension point — user projects register schema comps via
 * upgrade-shipped conventions; until then `SCHEMA_LOADERS` is empty and the FineTune editor falls
 * back to its data-driven (captions/segments/audio) surface for every project.
 */
import { z } from 'zod';
import type { JsonSchemaNode } from './schema-form';
import type { CompId } from './comp-ids';

export interface SchemaEntry {
  compId: CompId;
  /** JSON-schema of the props object (for the generated inspector). */
  jsonSchema: JsonSchemaNode;
  /** validate + normalize edited props (the comp's own Zod schema). */
  parse: (props: unknown) => Record<string, unknown>;
  defaults: Record<string, unknown>;
  fps: number;
  durationFromProps: (props: Record<string, unknown>) => number; // frames
}

type SchemaLoader = () => Promise<SchemaEntry>;

/**
 * project folder (public/<p>/) → its Zod-props comp's schema loader.
 *
 * Empty in v1 (see file header). To register a schema comp, add an entry that lazily imports the
 * comp's timeline and returns `entry(compId, propsSchema, defaults, fps, durationFromProps)`.
 */
export const SCHEMA_LOADERS: Record<string, SchemaLoader> = {};

/**
 * Build a SchemaEntry from a comp's Zod props schema. Retained as the registry's extension point
 * (a future SCHEMA_LOADERS registration calls it); kept byte-faithful to the parent so registered
 * comps behave identically.
 */
export function entry(
  compId: CompId,
  schema: z.ZodType,
  defaults: unknown,
  fps: number,
  durationFromProps: (props: Record<string, unknown>) => number,
): SchemaEntry {
  return {
    compId,
    jsonSchema: z.toJSONSchema(schema, { io: 'input' }) as JsonSchemaNode,
    parse: (props: unknown) => schema.parse(props) as Record<string, unknown>,
    defaults: { ...(defaults as Record<string, unknown>) },
    fps,
    durationFromProps,
  };
}

export function hasPropsSchema(project: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCHEMA_LOADERS, project);
}
