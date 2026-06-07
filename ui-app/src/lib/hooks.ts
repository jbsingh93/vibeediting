/** Data hooks: fetch once, then stay live via /ws/manifests (no polling, no reload). */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { subscribe } from './ws';
import { deriveSummary } from './summary';
import type { Manifest, ManifestWsMessage, ProjectsResponse } from './types';

export function useProjects(): { data: ProjectsResponse | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .projects()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reload();
    return subscribe<ManifestWsMessage>('manifests', (msg) => {
      if (msg.type !== 'manifest') return;
      const summary = deriveSummary(msg.manifest);
      setData((prev) => {
        if (!prev) return prev;
        const i = prev.projects.findIndex((p) => p.project_id === summary.project_id);
        const projects = [...prev.projects];
        if (i >= 0) projects[i] = summary;
        else projects.unshift(summary);
        return { ...prev, projects };
      });
    });
  }, [reload]);

  return { data, error, reload };
}

export function useProject(id: string): { manifest: Manifest | null; error: string | null; reload: () => void } {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .project(id)
      .then((m) => {
        setManifest(m);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [id]);

  useEffect(() => {
    reload();
    return subscribe<ManifestWsMessage>('manifests', (msg) => {
      if (msg.type === 'manifest' && msg.project_id === id) setManifest(msg.manifest);
    });
  }, [id, reload]);

  return { manifest, error, reload };
}
