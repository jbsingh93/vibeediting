/** Pure: derive a gallery ManifestSummary from a full Manifest (also used to live-patch the gallery). */
import type { Manifest, ManifestSummary, StageName, Stage } from './types';

export function deriveSummary(m: Manifest): ManifestSummary {
  const blockedStages = (Object.entries(m.stages) as [StageName, Stage][])
    .filter(([, s]) => s.status === 'blocked')
    .map(([name]) => name);
  return { project_id: m.project_id, status: m.status, updated_at: m.updated_at, blockedStages };
}
