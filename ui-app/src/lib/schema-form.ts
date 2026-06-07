/**
 * lib/schema-form.ts — UIP4.3: the inspector is LITERALLY a form generated from the comp's Zod
 * schema (the "truthful editor" rule — the editor only edits what the schema expresses).
 * Zod 4's `z.toJSONSchema()` gives a plain JSON-schema tree; this walks it into flat form fields.
 * Pure → unit-tested (UIP4.T1 "schema-form generation").
 */

export interface JsonSchemaNode {
  type?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  anyOf?: JsonSchemaNode[];
}

export type FormFieldKind = 'number' | 'text' | 'boolean' | 'select' | 'tags';

export interface FormField {
  /** dotted path inside the object being edited (e.g. "pulse.cx"). */
  path: string;
  label: string;
  kind: FormFieldKind;
  options?: string[]; // select
  min?: number;
  max?: number;
  required: boolean;
  default?: unknown;
}

/** Unwrap zod's optional/nullable anyOf wrappers down to the real node. */
function unwrap(node: JsonSchemaNode): JsonSchemaNode {
  if (node.anyOf) {
    const real = node.anyOf.find((n) => n.type !== 'null');
    if (real) return unwrap(real);
  }
  return node;
}

/**
 * Walk a JSON-schema object into flat form fields. Arrays of OBJECTS are skipped — those are
 * timeline blocks (scenes/beats), not inspector fields. Nested plain objects flatten with a
 * dotted path. Unknown types are skipped (never render a control the schema can't round-trip).
 */
export function schemaToFields(schema: JsonSchemaNode, prefix = ''): FormField[] {
  const node = unwrap(schema);
  if (node.type !== 'object' || !node.properties) return [];
  const required = new Set(node.required ?? []);
  const fields: FormField[] = [];
  for (const [key, rawChild] of Object.entries(node.properties)) {
    const child = unwrap(rawChild);
    const path = prefix ? `${prefix}.${key}` : key;
    const base = { path, label: key, required: required.has(key), default: rawChild.default };
    if (child.enum && child.enum.every((e) => typeof e === 'string')) {
      fields.push({ ...base, kind: 'select', options: child.enum as string[] });
    } else if (child.type === 'number' || child.type === 'integer') {
      fields.push({ ...base, kind: 'number', min: child.minimum, max: child.maximum });
    } else if (child.type === 'string') {
      fields.push({ ...base, kind: 'text' });
    } else if (child.type === 'boolean') {
      fields.push({ ...base, kind: 'boolean' });
    } else if (child.type === 'array' && child.items && unwrap(child.items).type === 'string') {
      fields.push({ ...base, kind: 'tags' });
    } else if (child.type === 'object') {
      fields.push(...schemaToFields(child, path));
    }
    // arrays of objects / unknown types → not inspector material (blocks or agent territory)
  }
  return fields;
}

/** Read a dotted path off an object. */
export function getAtPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Immutably set a dotted path on an object (creates intermediate objects as needed). */
export function setAtPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root = { ...(obj as Record<string, unknown>) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    const child = cur[k];
    cur[k] = child && typeof child === 'object' ? { ...(child as Record<string, unknown>) } : {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]!] = value;
  return root as T;
}

/** Locate the schema node for an array-of-objects property (the scene/beat block list). */
export function findBlockArrays(schema: JsonSchemaNode): { path: string; itemSchema: JsonSchemaNode }[] {
  const node = unwrap(schema);
  if (node.type !== 'object' || !node.properties) return [];
  const out: { path: string; itemSchema: JsonSchemaNode }[] = [];
  for (const [key, rawChild] of Object.entries(node.properties)) {
    const child = unwrap(rawChild);
    if (child.type === 'array' && child.items && unwrap(child.items).type === 'object') {
      out.push({ path: key, itemSchema: unwrap(child.items) });
    }
  }
  return out;
}
