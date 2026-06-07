/**
 * lib/graph.ts — UIP5.2: the node-graph layout (pure). The manifest's recorded stages become a
 * read-mostly DAG in canonical STAGE_ORDER: one node per recorded stage, sequential edges (that IS
 * the pipeline's dependency order — doc 02 §Concept D kept as an advanced view). Pure math:
 * unit-testable, no DOM/SVG here.
 */
import { STAGE_ORDER, type Manifest, type Stage, type StageName, type StageStatus } from './types';

export const NODE_W = 148;
export const NODE_H = 58;
export const GAP_X = 46;
export const GAP_Y = 30;
export const PAD = 14;

export interface GraphNode {
  id: StageName;
  status: StageStatus;
  gate: boolean;
  approved: boolean | undefined;
  versions: number;
  outputs: number;
  attempts: number;
  error?: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: StageName;
  to: StageName;
  /** start/end anchor points (node edge midpoints) for the SVG path. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** true when the edge wraps to the next row (drawn as an elbow, not a straight line). */
  wrap: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/**
 * Lay the recorded stages out left→right, wrapping every `cols` nodes (snake-free: every row reads
 * left→right; the wrap edge elbows down). Only stages present on the manifest become nodes.
 */
export function buildGraph(m: Manifest, cols = 4): GraphLayout {
  const stages = m.stages as Record<string, Stage | undefined>;
  const present = STAGE_ORDER.filter((s) => stages[s]);
  const nodes: GraphNode[] = present.map((id, i) => {
    const s = stages[id]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id,
      status: s.status,
      gate: m.approvals_required.includes(id),
      approved: s.approved,
      versions: s.versions?.length ?? 0,
      outputs: s.outputs.length,
      attempts: s.attempts,
      error: s.error,
      x: PAD + col * (NODE_W + GAP_X),
      y: PAD + row * (NODE_H + GAP_Y),
    };
  });

  const edges: GraphEdge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1]!;
    const b = nodes[i]!;
    const wrap = b.y !== a.y;
    edges.push({
      from: a.id,
      to: b.id,
      x1: wrap ? a.x + NODE_W / 2 : a.x + NODE_W,
      y1: wrap ? a.y + NODE_H : a.y + NODE_H / 2,
      x2: wrap ? b.x + NODE_W / 2 : b.x,
      y2: wrap ? b.y : b.y + NODE_H / 2,
      wrap,
    });
  }

  const usedCols = Math.min(cols, Math.max(1, nodes.length));
  const rows = Math.max(1, Math.ceil(nodes.length / cols));
  return {
    nodes,
    edges,
    width: PAD * 2 + usedCols * NODE_W + (usedCols - 1) * GAP_X,
    height: PAD * 2 + rows * NODE_H + (rows - 1) * GAP_Y,
  };
}

/** SVG path for an edge: straight when in-row, an elbow when wrapping to the next row. */
export function edgePath(e: GraphEdge): string {
  if (!e.wrap) return `M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}`;
  const midY = (e.y1 + e.y2) / 2;
  return `M ${e.x1} ${e.y1} L ${e.x1} ${midY} L ${e.x2} ${midY} L ${e.x2} ${e.y2}`;
}

/** Pretty-printed manifest (or one stage's record) for the raw-JSON drawer. */
export function rawJson(m: Manifest, stage?: StageName | null): string {
  const stages = m.stages as Record<string, Stage | undefined>;
  if (stage && stages[stage]) {
    return JSON.stringify({ [stage]: stages[stage] }, null, 2);
  }
  return JSON.stringify(m, null, 2);
}
