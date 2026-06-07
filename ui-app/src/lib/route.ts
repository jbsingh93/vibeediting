/** Dead-simple hash router. Routes: #/, #/project/<id>, #/health, #/queue, #/new[/wizard|/agent],
 *  #/finetune[/<id>], #/keys, #/brand. UIP6.1: bare #/new = the creation-mode chooser. */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'project'; id: string }
  | { name: 'health' }
  | { name: 'queue' }
  | { name: 'new'; mode?: 'wizard' | 'agent' }
  | { name: 'finetune'; id: string | null }
  | { name: 'keys' }
  | { name: 'brand' };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  if (clean === 'health') return { name: 'health' };
  if (clean === 'queue') return { name: 'queue' };
  if (clean === 'new') return { name: 'new' };
  if (clean === 'new/wizard') return { name: 'new', mode: 'wizard' };
  if (clean === 'new/agent') return { name: 'new', mode: 'agent' };
  if (clean === 'keys') return { name: 'keys' };
  if (clean === 'brand') return { name: 'brand' };
  if (clean === 'finetune') return { name: 'finetune', id: null };
  const ft = clean.match(/^finetune\/(.+)$/);
  if (ft) return { name: 'finetune', id: decodeURIComponent(ft[1]!) };
  const m = clean.match(/^project\/(.+)$/);
  if (m) return { name: 'project', id: decodeURIComponent(m[1]!) };
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
