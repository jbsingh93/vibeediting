/**
 * UIP2.6 — the canonical list of registered composition IDs. This file is the bridge between
 * the project's src/Root.tsx (the source of truth) and the comp registry. Keep it
 * dependency-free so the sync-check script can import it under tsx.
 *
 * A prebuilt client cannot bundle the user's own compositions, so v1 ships exactly the demo
 * composition the template registers (template/src/Root.tsx, id "DemoWelcome"). The list is the
 * extension point — adding an id here + a loader in comp-registry is how a future build (or an
 * upgrade-shipped convention) would surface more comps in the Player.
 */
export const COMP_IDS = ['DemoWelcome'] as const;

export type CompId = (typeof COMP_IDS)[number];

export const isCompId = (s: string): s is CompId => (COMP_IDS as readonly string[]).includes(s);
