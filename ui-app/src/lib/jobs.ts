/** useJobs — fetch the job table once, then stay live via /ws/jobs (no polling). */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { subscribe } from './ws';
import type { JobRecord, JobsWsMessage } from './types';

export function useJobs(): { jobs: JobRecord[]; error: string | null; reload: () => void } {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .jobs()
      .then((r) => {
        setJobs(r.jobs);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reload();
    return subscribe<JobsWsMessage>('jobs', (msg) => {
      if (msg.type !== 'job') return;
      setJobs((prev) => {
        const i = prev.findIndex((j) => j.id === msg.job.id);
        if (i >= 0) {
          const next = [...prev];
          next[i] = msg.job;
          return next;
        }
        return [msg.job, ...prev];
      });
    });
  }, [reload]);

  return { jobs, error, reload };
}

/** Jobs that are queued or running (the top-bar chip + queue badges). */
export function activeJobs(jobs: JobRecord[]): JobRecord[] {
  return jobs.filter((j) => j.status === 'queued' || j.status === 'running');
}
