/**
 * src/server/watcher.ts — chokidar → WS /ws/manifests.
 *
 * Watches the durable projects root (manifest.json + provenance.log + brief.md), the
 * disposable out/work tree (budget.json) and brand/brand.json (the Brand page live-reloads
 * when the agent edits it — D9). Manifest writes are ATOMIC renames, so we handle BOTH `add`
 * and `change`, debounce 100 ms per project, and re-read with `readManifest` (which validates)
 * before broadcasting — a half-written file simply fails the read and the next clean event wins.
 *
 * NOTE: no `awaitWriteFinish`. Manifest writes are atomic (.tmp + rename), so there is never a
 * half-written file to wait on — and on Windows the write-finish stat-polling holds a transient
 * handle on manifest.json that collides with an external writer's rename (EPERM).
 */
import * as path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { projectDir, projectsRoot, workDir } from './context.js';
import { readManifest } from './manifest.js';
import { broadcast } from './ws-hub.js';

const debounce = new Map<string, ReturnType<typeof setTimeout>>();

function projectFromPath(root: string, file: string): string | null {
  const parts = path.relative(root, file).split(path.sep);
  return parts.length >= 1 && parts[0] && !parts[0].startsWith('..') ? parts[0] : null;
}

function emitManifest(project: string): void {
  try {
    broadcast('manifests', { type: 'manifest', project_id: project, manifest: readManifest(project) });
  } catch {
    /* malformed / mid-write — ignore; a later clean write re-fires */
  }
}

function scheduleManifest(project: string): void {
  const t = debounce.get(project);
  if (t) clearTimeout(t);
  debounce.set(
    project,
    setTimeout(() => {
      debounce.delete(project);
      emitManifest(project);
    }, 100),
  );
}

export function startWatcher(): FSWatcher {
  const root = projectsRoot();
  const work = workDir();
  const brandFile = path.join(projectDir(), 'brand', 'brand.json');
  const watcher = watch([root, work, brandFile], {
    ignoreInitial: true,
    persistent: true,
  });

  const onEvent = (file: string): void => {
    const base = path.basename(file);
    if (file === brandFile || (base === 'brand.json' && path.dirname(file) === path.dirname(brandFile))) {
      broadcast('manifests', { type: 'brand' });
      return;
    }
    if (base === 'manifest.json') {
      const id = projectFromPath(root, file);
      if (id) scheduleManifest(id);
    } else if (base === 'provenance.log') {
      const id = projectFromPath(root, file);
      if (id) broadcast('manifests', { type: 'provenance', project_id: id });
    } else if (base === 'brief.md') {
      const id = projectFromPath(root, file);
      if (id) broadcast('manifests', { type: 'brief', project_id: id });
    } else if (base === 'budget.json') {
      const id = projectFromPath(work, file);
      if (id) broadcast('manifests', { type: 'budget', project_id: id });
    }
  };

  watcher.on('add', onEvent).on('change', onEvent);
  return watcher;
}
