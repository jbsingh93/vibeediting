/**
 * `src/components/` barrel — the public component surface of the scaffolded project.
 *
 * Import any component, the brand provider, or the caption utilities from here:
 *   import { BrandContext, HookText, Counter, KineticCaptions, ConfettiBurst } from './components';
 *
 * `Caption` (the caption row type) is re-exported once, from `./captions` — its single
 * source of truth. `KineticCaptions` consumes that same type, so we export only its
 * component value here to avoid a duplicate-symbol clash.
 */

// Brand system — provider, hook, defaults, project brand (brand/brand.json), and types.
export { BrandContext, useBrand, BRAND_DEFAULT, PROJECT_BRAND, brandFromConfig } from './BrandContext';
export type { Brand } from './BrandContext';

// Caption schema + utilities (incl. the `Caption` type).
export * from './captions';

// EDL (segments.json) schema + utilities — the canonical cut contract (D25/D32).
export * from './edl';

// Caption renderers.
export { KineticCaptions } from './KineticCaptions';

// Scene / card / chart components.
export { HookText } from './HookText';
export { Counter } from './Counter';
export { TikTokCaptions } from './TikTokCaptions';
export { QuoteCard } from './QuoteCard';
export { TweetCard } from './TweetCard';
export { BarChart } from './BarChart';
export type { Bar } from './BarChart';
export { Checklist } from './Checklist';
export { NotificationToast } from './NotificationToast';
export { HighlightCard } from './HighlightCard';
export { SplitCompare } from './SplitCompare';

// Motion atoms + overlays.
export * from './motion';
