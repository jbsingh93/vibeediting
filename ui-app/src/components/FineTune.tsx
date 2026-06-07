/**
 * components/FineTune.tsx — UI-P4: the fine-tune editor ("your hands for the last 5%").
 *
 * One in-memory EditModel drives everything: the Player preview re-renders from inputProps on
 * every drag (the comps bake their JSON at bundle time, so live preview MUST flow through props),
 * and ▸ Save writes the SAME public/<p>/*.json files the real comps import — preview and render
 * never disagree. Undo/redo wraps the whole model (Ctrl+Z / Ctrl+Y); drags commit one undo step
 * on pointer-up. Saving while the agent has a stage running surfaces the UIP4.4 fork gate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { api } from '../lib/api';
import type { AssetInfo, FinetuneDoc, RenderInfo, StageName } from '../lib/types';
import {
  type AudioMixDoc,
  type AudioTrack,
  type CaptionWord,
  type History,
  type RemappedWord,
  type SegmentsDoc,
  EMPTY_AUDIO_MIX,
  addTrack,
  alignToVoice,
  applyRemappedWordEdit,
  edlTotalFrames,
  historyInit,
  historyPush,
  historyRedo,
  historyUndo,
  isEmphasized,
  moveTrack,
  moveWord,
  nudgeSegment,
  pickDefaultRender,
  placeEdl,
  remapEdlCaptions,
  resetToBaseline,
  resizeWord,
  setTrackDuck,
  setTrackGain,
  snapMs,
  toggleEmphasis,
  voWindows,
  xToMs,
} from '../lib/finetune';
import { AUDIO_CATEGORIES } from '../lib/assets';
import { ASSETS_RELOAD_EVENT } from '../lib/upload';
import { subscribe as subscribeWs } from '../lib/ws';
import type { ManifestWsMessage } from '../lib/types';
import { capFileName, capKeyForFile, edlDefaults } from '../lib/edl-registry';
import { diffDocs, type DiffRow } from '../lib/diff';
import { setSelection } from '../lib/selection';
import { SCHEMA_LOADERS, hasPropsSchema, type SchemaEntry } from '../lib/schema-registry';
import { findBlockArrays, getAtPath, setAtPath } from '../lib/schema-form';
import { COMP_LOADERS, type CompId } from '../lib/comp-registry';
import type { LoadedComp } from '../lib/comp-registry';
import { FineTunePreview } from '../editor/FineTunePreview';
import { RenderPreview } from '../editor/RenderPreview';
import { EmptyState } from './EmptyState';
import { CaptionTrack, type ChipEditKind, type ChipId } from './finetune/CaptionTrack';
import { SegmentTrack } from './finetune/SegmentTrack';
import { SceneTrack, sceneBlocks } from './finetune/SceneTrack';
import { AudioTracksUI } from './finetune/AudioTracksUI';
import {
  AudioInspector,
  InspectorShell,
  SchemaForm,
  SegmentInspector,
  WordInspector,
} from './finetune/Inspector';
import { GhostBtn, Playhead, Ruler, TrackRow } from './finetune/timeline-ui';

// ── the editing model ───────────────────────────────────────────────────────────

interface EditModel {
  segDocName: string | null;
  segDoc: SegmentsDoc | null; // emphasisWords stripped into `emphasis`
  captions: Record<string, CaptionWord[]>; // capKey → words (source-time when EDL)
  props: Record<string, unknown> | null;
  audioMix: AudioMixDoc;
  emphasis: string[];
  emphasisTouched: boolean;
}

interface LoadedCtx {
  docs: FinetuneDoc[];
  shas: Record<string, string>;
  captionFiles: Record<string, string>; // capKey → basename
  baselines: Record<string, CaptionWord[]>;
  srcExists: Record<string, boolean>;
  audioAssets: AssetInfo[];
  schemaEntry: SchemaEntry | null;
  propsOnDisk: boolean;
  segHadEmphasis: boolean;
  initial: EditModel;
  captionStyle: { fontSize: number; paddingBottom: number };
}

type Sel =
  | { t: 'word'; id: ChipId }
  | { t: 'seg'; index: number }
  | { t: 'scene'; index: number }
  | { t: 'audio'; id: string }
  | null;

const dim = { width: 1080, height: 1920 };

export function FineTune({ project, runningStage }: { project: string; runningStage?: StageName | null }) {
  const [ctx, setCtx] = useState<LoadedCtx | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // UIP6.10 — a clean slate (no editable docs yet) is a designed state, not a load error.
  const [emptyDocs, setEmptyDocs] = useState(false);
  const [history, setHistory] = useState<History<EditModel> | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [pxPerSec, setPxPerSec] = useState(60);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [previewComp, setPreviewComp] = useState(false);
  // Render preview (Julian 2026-06-07): fine-tune is an editor over the RENDERED VERSIONS —
  // pick any render (v1/v2/deliverable) as the editing background instead of the data
  // reconstruction. renderSel = the chosen RenderInfo.url; meta is probed off a detached <video>.
  const [renders, setRenders] = useState<RenderInfo[]>([]);
  const [renderSel, setRenderSel] = useState<string | null>(null);
  const [renderMeta, setRenderMeta] = useState<{ durationSec: number; width: number; height: number } | null>(null);
  const [overlayCaptions, setOverlayCaptions] = useState(true);
  const [saveState, setSaveState] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const [forkPrompt, setForkPrompt] = useState<{ stage: StageName; error: string } | null>(null);
  const [fileConflict, setFileConflict] = useState<string | null>(null);
  const [segChoice, setSegChoice] = useState<string | null>(null);
  const [compLoaded, setCompLoaded] = useState<LoadedComp | null>(null);
  // UIP5.5 — inline agent-edit diffs: docs that changed on disk under the open editor.
  const [agentDiff, setAgentDiff] = useState<{ rows: DiffRow[]; theirsShas: Record<string, string>; names: string[] } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const playerRef = useRef<PlayerRef>(null);
  const dragBase = useRef<EditModel | null>(null);
  const lastGoodDuration = useRef(300);

  const model = history?.present ?? null;
  // beginDrag must capture the CURRENT model synchronously — a queued setState updater can run
  // after the first pointermove events, silently dropping the start of a drag (found in QA).
  const modelRef = useRef<EditModel | null>(model);
  modelRef.current = model;
  const ctxRef = useRef<LoadedCtx | null>(ctx);
  ctxRef.current = ctx;

  // ── load ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setCtx(null);
    setHistory(null);
    setSel(null);
    setLoadError(null);
    setEmptyDocs(false);
    setSaveState(null);
    setAgentDiff(null);
    setRenderSel(null);
    (async () => {
      try {
        const [state, assetsRes, schemaEntry, rendersRes] = await Promise.all([
          api.finetune(project).catch((e) => {
            if ((e as { status?: number }).status === 404) return { project, docs: [] as FinetuneDoc[] };
            throw e;
          }),
          api.assets(project).catch(() => ({ assets: [] as AssetInfo[] })),
          hasPropsSchema(project) ? SCHEMA_LOADERS[project]!() : Promise.resolve(null),
          api.renders(project).catch(() => ({ renders: [] as RenderInfo[] })),
        ]);
        if (!alive) return;
        const sortedRenders = [...rendersRes.renders].sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
        setRenders(sortedRenders);
        const docs = state.docs;
        if (docs.length === 0 && !schemaEntry) {
          setEmptyDocs(true); // designed empty state — auto-recovers when the first doc lands
          return;
        }
        const shas: Record<string, string> = {};
        for (const d of docs) shas[d.name] = d.sha256;

        // assets → existence + audio picker (public/<p>/ files, public-rooted paths)
        const publicAssets = assetsRes.assets.filter((a) => a.origin === 'public');
        const srcExists: Record<string, boolean> = {};
        for (const a of publicAssets) srcExists[a.relPath.replace(/^public\//, '')] = true;
        for (const d of docs) if (d.srcExists) Object.assign(srcExists, d.srcExists);
        const audioAssets = publicAssets.filter((a) => AUDIO_CATEGORIES.has(a.category)); // UIP6.6 split

        // segments doc (the EDL) — user-selectable when several exist
        const segDocs = docs.filter((d) => d.kind === 'segments');
        const segDocName = segChoice && segDocs.some((d) => d.name === segChoice) ? segChoice : segDocs[0]?.name ?? null;
        const segRaw = segDocs.find((d) => d.name === segDocName)?.data as (SegmentsDoc & { emphasisWords?: string[] }) | undefined;
        const segHadEmphasis = Array.isArray(segRaw?.emphasisWords);
        const segDoc: SegmentsDoc | null = segRaw
          ? { fps: segRaw.fps, crossfadeFrames: segRaw.crossfadeFrames, src: segRaw.src, segments: segRaw.segments }
          : null;

        // captions binding: EDL cap keys → captions-<key>.json; otherwise the first captions doc
        const captionDocs = docs.filter((d) => d.kind === 'captions');
        const captions: Record<string, CaptionWord[]> = {};
        const captionFiles: Record<string, string> = {};
        const baselines: Record<string, CaptionWord[]> = {};
        const bind = (key: string, doc: FinetuneDoc | undefined) => {
          if (!doc) return;
          captions[key] = doc.data as CaptionWord[];
          captionFiles[key] = doc.name;
          baselines[key] = (doc.baseline as CaptionWord[] | undefined) ?? (doc.data as CaptionWord[]).map((w) => ({ ...w }));
        };
        if (segDoc) {
          const keys = [...new Set(segDoc.segments.map((s) => s.cap ?? ''))];
          for (const key of keys) bind(key, captionDocs.find((d) => d.name === capFileName(key)));
        } else if (captionDocs.length > 0) {
          const first = captionDocs.find((d) => capKeyForFile(d.name) === '') ?? captionDocs[0];
          bind('', first);
        }

        // props (Zod-props comps): disk file beats schema defaults
        const propsDoc = docs.find((d) => d.kind === 'props');
        const props = (propsDoc?.data as Record<string, unknown> | undefined) ?? (schemaEntry ? schemaEntry.defaults : null);

        // emphasis: props-bound → segments-json → the comp's built-in list
        let emphasis: string[] = [];
        if (props && Array.isArray(props.emphasisWords)) emphasis = props.emphasisWords as string[];
        else if (segHadEmphasis && segRaw) emphasis = segRaw.emphasisWords as string[];
        else if (segDocName) emphasis = await edlDefaults(project).emphasis(segDocName);

        const audioDoc = docs.find((d) => d.kind === 'audio-mix');
        const audioMix = (audioDoc?.data as AudioMixDoc | undefined) ?? EMPTY_AUDIO_MIX;

        const initial: EditModel = {
          segDocName,
          segDoc,
          captions,
          props,
          audioMix,
          emphasis,
          emphasisTouched: false,
        };
        const defaults = edlDefaults(project);
        if (!alive) return;
        setCtx({
          docs,
          shas,
          captionFiles,
          baselines,
          srcExists,
          audioAssets,
          schemaEntry,
          propsOnDisk: !!propsDoc,
          segHadEmphasis,
          initial,
          captionStyle: { fontSize: defaults.captionFontSize, paddingBottom: defaults.captionPaddingBottom },
        });
        setHistory(historyInit(initial));
        // comp preview mounts the comp's real media (often gitignored/absent) — opt-in only.
        setPreviewComp(false);
        // Fine-tune is an editor over the RENDERED VERSIONS (Julian 2026-06-07): when the data
        // preview has no reconstructable video (no EDL segments, no props.videoSrc), default the
        // background to the NEWEST render instead of a placeholder — the chips land on real frames.
        const videoFromData = !!segDoc || (props != null && typeof (props as Record<string, unknown>).videoSrc === 'string');
        setRenderSel(pickDefaultRender(videoFromData, sortedRenders));
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [project, segChoice, reloadTick]);

  // UIP6.10 — the empty state AUTO-RECOVERS: re-fetch when an upload lands (assets-reload)
  // or the agent advances the manifest (it writes captions/segments around the same time).
  useEffect(() => {
    if (!emptyDocs) return;
    const bump = () => setReloadTick((t) => t + 1);
    window.addEventListener(ASSETS_RELOAD_EVENT, bump);
    const unsub = subscribeWs<ManifestWsMessage>('manifests', (msg) => {
      if ((msg.type === 'manifest' || msg.type === 'brief') && msg.project_id === project) bump();
    });
    return () => {
      window.removeEventListener(ASSETS_RELOAD_EVENT, bump);
      unsub();
    };
  }, [emptyDocs, project]);

  // render-mode metadata probe: a detached <video> reads duration + dimensions of the chosen
  // render so the Player can mount with the REAL aspect/length (RenderInfo carries neither).
  // An UNLOADABLE render (corrupt/truncated file) falls back to the data preview instead of
  // mounting junk — a decode error in the Player is never an acceptable editor state.
  useEffect(() => {
    setRenderMeta(null);
    if (!renderSel) return;
    let alive = true;
    const bail = () => {
      if (!alive) return;
      setRenderSel(null);
      setRenderMeta(null);
    };
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      if (!alive) return;
      if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth || !v.videoHeight) {
        bail();
        return;
      }
      setRenderMeta({ durationSec: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = bail;
    v.src = renderSel;
    return () => {
      alive = false;
      v.removeAttribute('src');
      v.load();
    };
  }, [renderSel]);

  // comp-mode Player loads the REAL comp lazily
  useEffect(() => {
    if (!previewComp || !ctx?.schemaEntry) return;
    let alive = true;
    COMP_LOADERS[ctx.schemaEntry.compId as CompId]()
      .then((l) => alive && setCompLoaded(l))
      .catch(() => alive && setCompLoaded(null));
    return () => {
      alive = false;
    };
  }, [previewComp, ctx?.schemaEntry]);

  // ── derived preview state ─────────────────────────────────────────────────────
  const fps = model?.segDoc?.fps ?? ctx?.schemaEntry?.fps ?? 30;

  const placed = useMemo(
    () => (model?.segDoc ? placeEdl(model.segDoc.segments, model.segDoc.fps, model.segDoc.crossfadeFrames) : []),
    [model?.segDoc],
  );

  const chips: RemappedWord[] = useMemo(() => {
    if (!model) return [];
    if (model.segDoc) return remapEdlCaptions(placed, model.segDoc.fps, model.captions);
    const words = model.captions[''] ?? [];
    return words.map((w, i) => ({ ...w, srcIndex: i, capKey: '', segIndex: 0 }));
  }, [model, placed]);

  const wins = useMemo(() => voWindows(chips), [chips]);

  const dataDuration = useMemo(() => {
    if (model?.segDoc) return edlTotalFrames(model.segDoc.segments, model.segDoc.fps, model.segDoc.crossfadeFrames);
    const lastMs = chips.reduce((m, c) => Math.max(m, c.endMs), 0);
    const audioEnd = (model?.audioMix.tracks ?? []).reduce((m, t) => Math.max(m, (t.offsetSec + 5) * 1000), 0);
    return Math.max(60, Math.round(((Math.max(lastMs, audioEnd) + 1000) / 1000) * fps));
  }, [model, chips, fps]);

  const compDuration = useMemo(() => {
    if (!previewComp || !ctx?.schemaEntry || !model?.props) return lastGoodDuration.current;
    try {
      const parsed = ctx.schemaEntry.parse(model.props);
      lastGoodDuration.current = ctx.schemaEntry.durationFromProps(parsed);
    } catch {
      /* keep last good while a field is mid-edit */
    }
    return lastGoodDuration.current;
  }, [previewComp, ctx?.schemaEntry, model?.props]);

  const renderDuration = renderMeta ? Math.max(1, Math.round(renderMeta.durationSec * fps)) : null;
  const durationInFrames = renderSel && renderDuration ? renderDuration : previewComp ? compDuration : dataDuration;
  const durationSec = durationInFrames / fps;
  const trackWidth = Math.max(300, durationSec * pxPerSec);

  // single-mode background video (e.g. a stitched.mp4) when it exists on disk
  const singleSrc = useMemo(() => {
    if (!model || model.segDoc) return null;
    const v = model.props?.videoSrc;
    return typeof v === 'string' && ctx?.srcExists[v] ? v : null;
  }, [model, ctx?.srcExists]);

  // ── edits ─────────────────────────────────────────────────────────────────────
  const commit = useCallback((next: EditModel) => {
    setHistory((h) => (h ? historyPush(h, next) : h));
    setSaveState(null);
  }, []);

  const transient = useCallback((next: EditModel) => {
    setHistory((h) => (h ? { ...h, present: next } : h));
  }, []);

  const beginDrag = useCallback(() => {
    dragBase.current = modelRef.current;
  }, []);

  const endDrag = useCallback(() => {
    const base = dragBase.current;
    dragBase.current = null;
    if (!base) return;
    setHistory((h) => (h && h.present !== base ? { past: [...h.past.slice(-99), base], present: h.present, future: [] } : h));
    setSaveState(null);
  }, []);

  const baseChips = useCallback((base: EditModel): RemappedWord[] => {
    if (base.segDoc) {
      const p = placeEdl(base.segDoc.segments, base.segDoc.fps, base.segDoc.crossfadeFrames);
      return remapEdlCaptions(p, base.segDoc.fps, base.captions);
    }
    return (base.captions[''] ?? []).map((w, i) => ({ ...w, srcIndex: i, capKey: '', segIndex: 0 }));
  }, []);

  const onChipDrag = useCallback(
    (id: ChipId, kind: ChipEditKind, deltaMs: number) => {
      const base = dragBase.current;
      if (!base) return;
      const bChips = baseChips(base);
      const chip = bChips.find((c) => c.capKey === id.capKey && c.srcIndex === id.srcIndex);
      if (!chip) return;
      // snap to the other words' boundaries (8 px feel)
      const thresh = xToMs(8, pxPerSec);
      const candidates = bChips
        .filter((c) => c !== chip)
        .flatMap((c) => [c.startMs, c.endMs]);
      let eff = deltaMs;
      if (kind === 'move' || kind === 'resize-start') {
        eff = snapMs(chip.startMs + deltaMs, candidates, thresh) - chip.startMs;
      } else {
        eff = snapMs(chip.endMs + deltaMs, candidates, thresh) - chip.endMs;
      }
      let captions: Record<string, CaptionWord[]>;
      if (base.segDoc) {
        const p = placeEdl(base.segDoc.segments, base.segDoc.fps, base.segDoc.crossfadeFrames);
        captions = applyRemappedWordEdit(base.captions, p, chip, { kind: kind === 'move' ? 'move' : kind, deltaMs: eff });
      } else {
        const words = base.captions[''] ?? [];
        const edited =
          kind === 'move'
            ? moveWord(words, id.srcIndex, eff)
            : resizeWord(words, id.srcIndex, kind === 'resize-start' ? 'start' : 'end', eff);
        captions = { ...base.captions, '': edited };
      }
      transient({ ...base, captions });
    },
    [baseChips, pxPerSec, transient],
  );

  const onSegDrag = useCallback(
    (index: number, field: 'srcStart' | 'srcEnd', deltaSec: number) => {
      const base = dragBase.current;
      if (!base?.segDoc) return;
      const segments = nudgeSegment(base.segDoc.segments, index, field, deltaSec);
      transient({ ...base, segDoc: { ...base.segDoc, segments } });
    },
    [transient],
  );

  const blocksPath = useMemo(() => {
    if (!ctx?.schemaEntry) return null;
    return findBlockArrays(ctx.schemaEntry.jsonSchema)[0] ?? null;
  }, [ctx?.schemaEntry]);

  const blockItems = useMemo(() => {
    if (!model?.props || !blocksPath) return [];
    const v = getAtPath(model.props, blocksPath.path);
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  }, [model?.props, blocksPath]);

  const blocks = useMemo(() => sceneBlocks(blockItems), [blockItems]);

  const onSceneDrag = useCallback(
    (index: number, field: 'startSec' | 'durationSec', deltaSec: number) => {
      const base = dragBase.current;
      if (!base?.props || !blocksPath) return;
      const items = getAtPath(base.props, blocksPath.path);
      if (!Array.isArray(items)) return;
      const item = items[index] as Record<string, unknown>;
      const cur = typeof item[field] === 'number' ? (item[field] as number) : 0;
      const next = Math.round(Math.max(field === 'durationSec' ? 0.2 : 0, cur + deltaSec) * 100) / 100;
      const nextItems = [...(items as Record<string, unknown>[])];
      nextItems[index] = { ...item, [field]: next };
      transient({ ...base, props: setAtPath(base.props, blocksPath.path, nextItems) });
    },
    [blocksPath, transient],
  );

  const onAudioDrag = useCallback(
    (id: string, deltaSec: number) => {
      const base = dragBase.current;
      if (!base) return;
      transient({ ...base, audioMix: { ...base.audioMix, tracks: moveTrack(base.audioMix.tracks, id, deltaSec) } });
    },
    [transient],
  );

  const editEmphasis = useCallback(
    (word: string) => {
      if (!model) return;
      const emphasis = toggleEmphasis(model.emphasis, word);
      const next: EditModel = { ...model, emphasis, emphasisTouched: true };
      if (model.props && Array.isArray(model.props.emphasisWords)) {
        next.props = { ...model.props, emphasisWords: emphasis };
      }
      commit(next);
    },
    [model, commit],
  );

  const editWord = useCallback(
    (id: ChipId, mutate: (words: CaptionWord[], index: number) => CaptionWord[]) => {
      if (!model) return;
      const words = model.captions[id.capKey];
      if (!words) return;
      commit({ ...model, captions: { ...model.captions, [id.capKey]: mutate(words, id.srcIndex) } });
    },
    [model, commit],
  );

  // ── save (UIP4.4) ─────────────────────────────────────────────────────────────
  const filesToSave = useCallback((): { name: string; data: unknown }[] => {
    if (!model || !ctx) return [];
    const out: { name: string; data: unknown }[] = [];
    const init = ctx.initial;
    for (const [key, words] of Object.entries(model.captions)) {
      const file = ctx.captionFiles[key];
      if (file && words !== init.captions[key]) out.push({ name: file, data: words });
    }
    if (model.segDoc && model.segDocName) {
      const segChanged = model.segDoc !== init.segDoc;
      const emphChanged = model.emphasisTouched && !(model.props && Array.isArray(model.props.emphasisWords));
      if (segChanged || emphChanged) {
        const data: SegmentsDoc & { emphasisWords?: string[] } = { ...model.segDoc };
        if (ctx.segHadEmphasis || emphChanged) data.emphasisWords = model.emphasis;
        out.push({ name: model.segDocName, data });
      }
    }
    if (model.audioMix !== init.audioMix) out.push({ name: 'audio-mix.json', data: model.audioMix });
    if (model.props && (model.props !== init.props || (!ctx.propsOnDisk && model.props !== ctx.schemaEntry?.defaults))) {
      if (model.props !== init.props) out.push({ name: 'props.json', data: model.props });
    }
    return out;
  }, [model, ctx]);

  const dirty = filesToSave().length > 0;

  const doSave = useCallback(
    async (fork?: boolean) => {
      if (!model || !ctx) return;
      const files = filesToSave();
      if (files.length === 0) return;
      const expect: Record<string, string> = {};
      for (const f of files) {
        const sha = ctx.shas[f.name];
        if (sha) expect[f.name] = sha;
      }
      setForkPrompt(null);
      setFileConflict(null);
      try {
        const res = await api.finetuneSave(project, { files, expect, fork });
        if ('conflict' in res) {
          if (res.conflict === 'stage-running') setForkPrompt({ stage: res.stage, error: res.error });
          else setFileConflict(res.error);
          return;
        }
        // success — current model becomes the new baseline-for-dirty
        setCtx({ ...ctx, shas: { ...ctx.shas, ...res.shas }, propsOnDisk: ctx.propsOnDisk || files.some((f) => f.name === 'props.json'), initial: model });
        setSaveState({
          msg: `✓ saved ${res.saved.join(', ')}${res.forked ? ` · forked v${res.forked.v} (${res.forked.stage})` : ''}${
            res.baselineCreated ? ` · baseline ${res.baselineCreated.join(', ')}` : ''
          }`,
          kind: 'ok',
        });
      } catch (e) {
        setSaveState({ msg: `✕ ${e instanceof Error ? e.message : String(e)}`, kind: 'err' });
      }
    },
    [model, ctx, project, filesToSave],
  );

  // ── keyboard ──────────────────────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        setHistory((h) => (h ? historyUndo(h) : h));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        setHistory((h) => (h ? historyRedo(h) : h));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave();
        return;
      }
      if (typing || !model) return;
      if (sel?.t === 'word' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const delta = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 100 : 10);
        if (model.segDoc) {
          const chip = chips.find((c) => c.capKey === sel.id.capKey && c.srcIndex === sel.id.srcIndex);
          if (!chip) return;
          commit({ ...model, captions: applyRemappedWordEdit(model.captions, placed, chip, { kind: 'move', deltaMs: delta }) });
        } else {
          editWord(sel.id, (w, i) => moveWord(w, i, delta));
        }
      }
    },
    [model, sel, chips, placed, commit, editWord, doSave],
  );

  // ── playhead sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setPlayheadFrame(e.detail.frame);
    p.addEventListener('frameupdate', onFrame);
    return () => p.removeEventListener('frameupdate', onFrame);
  }, [ctx, previewComp, renderSel, renderMeta]);

  const seekTo = useCallback((sec: number) => {
    playerRef.current?.seekTo(Math.round(sec * fps));
    setPlayheadFrame(Math.round(sec * fps));
  }, [fps]);

  // ── UIP5.5: selection-aware chat — publish what's selected for the agent composer ──
  useEffect(() => {
    if (!sel || !model) {
      setSelection(null);
      return;
    }
    const ms = (v: number) => `${(v / 1000).toFixed(2)}s`;
    if (sel.t === 'word') {
      const chip = chips.find((c) => c.capKey === sel.id.capKey && c.srcIndex === sel.id.srcIndex);
      if (chip) {
        setSelection({
          project,
          kind: 'word',
          label: `“${chip.text}”`,
          detail: `${ctx?.captionFiles[sel.id.capKey] ?? 'captions.json'} word ${sel.id.srcIndex}, on screen ${ms(chip.startMs)}–${ms(chip.endMs)}`,
        });
      }
    } else if (sel.t === 'seg' && model.segDoc) {
      const s = model.segDoc.segments[sel.index];
      if (s) {
        setSelection({
          project,
          kind: 'segment',
          label: `“${s.id ?? `#${sel.index + 1}`}”`,
          detail: `${model.segDocName ?? 'segments.json'} segment ${sel.index}, source ${s.srcStart.toFixed(2)}–${s.srcEnd.toFixed(2)}s`,
        });
      }
    } else if (sel.t === 'scene') {
      const b = blocks[sel.index];
      if (b) {
        setSelection({ project, kind: 'scene', label: `“${b.label}”`, detail: `props.json scene ${sel.index}, ${b.startSec.toFixed(2)}–${(b.startSec + b.durationSec).toFixed(2)}s` });
      }
    } else if (sel.t === 'audio') {
      const t = model.audioMix.tracks.find((x) => x.id === sel.id);
      if (t) {
        setSelection({ project, kind: 'audio', label: `“${t.id}”`, detail: `audio-mix.json ${t.role} track, offset ${t.offsetSec.toFixed(2)}s, gain ${t.gainDb} dB` });
      }
    }
  }, [sel, model, chips, blocks, ctx?.captionFiles, project]);

  // clear the published selection when the editor unmounts (tab switch / navigation)
  useEffect(() => () => setSelection(null), []);

  // ── UIP5.5: inline agent-edit diffs — watch for docs rewritten on disk under the editor ──
  const serializeDoc = useCallback((name: string): unknown => {
    const m = modelRef.current;
    const c = ctxRef.current;
    if (!m || !c) return undefined;
    for (const [key, file] of Object.entries(c.captionFiles)) if (file === name) return m.captions[key];
    if (m.segDoc && m.segDocName === name) {
      const data: SegmentsDoc & { emphasisWords?: string[] } = { ...m.segDoc };
      if (c.segHadEmphasis || m.emphasisTouched) data.emphasisWords = m.emphasis;
      return data;
    }
    if (name === 'audio-mix.json') return m.audioMix;
    if (name === 'props.json') return m.props ?? undefined;
    return c.docs.find((d) => d.name === name)?.data;
  }, []);

  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const state = await api.finetune(project);
        if (!alive || !ctxRef.current) return;
        const cur = ctxRef.current;
        const changed = state.docs.filter((d) => cur.shas[d.name] && d.sha256 !== cur.shas[d.name]);
        if (changed.length === 0) {
          setAgentDiff(null);
          return;
        }
        const theirsShas: Record<string, string> = {};
        const mine: Record<string, unknown> = {};
        const theirs: Record<string, unknown> = {};
        for (const d of changed) {
          theirsShas[d.name] = d.sha256;
          const m = serializeDoc(d.name);
          if (m !== undefined) {
            mine[d.name] = m;
            theirs[d.name] = d.data;
          }
        }
        const rows = diffDocs(mine, theirs);
        if (rows.length === 0) {
          // byte-different but structurally identical (formatting) — silently adopt the new shas
          setCtx((p) => (p ? { ...p, shas: { ...p.shas, ...theirsShas } } : p));
          setAgentDiff(null);
          return;
        }
        setAgentDiff({ rows, theirsShas, names: changed.map((d) => d.name) });
      } catch {
        /* server hiccup — try again next tick */
      }
    };
    const iv = setInterval(() => void tick(), 2500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [ctx, project, serializeDoc]);

  /** Accept the agent's files: merge JUST those docs from disk into the editor as ONE undo step
   *  (Ctrl+Z brings your version back — the "accept/undo" affordance). Unsaved edits in other docs
   *  stay. Falls back to a full reload if the fetch fails. */
  const acceptTheirs = useCallback(async () => {
    const diff = agentDiff;
    if (!diff) return;
    try {
      const state = await api.finetune(project);
      const cur = ctxRef.current;
      const m = modelRef.current;
      if (!cur || !m) return;
      let next: EditModel = { ...m };
      const newShas = { ...cur.shas };
      const newDocs = [...cur.docs];
      const init = { ...cur.initial };
      let segHadEmphasis = cur.segHadEmphasis;
      for (const d of state.docs) {
        if (!diff.names.includes(d.name)) continue;
        newShas[d.name] = d.sha256;
        const di = newDocs.findIndex((x) => x.name === d.name);
        if (di >= 0) newDocs[di] = d;
        else newDocs.push(d);
        for (const [key, file] of Object.entries(cur.captionFiles)) {
          if (file === d.name) {
            const words = d.data as CaptionWord[];
            next = { ...next, captions: { ...next.captions, [key]: words } };
            init.captions = { ...init.captions, [key]: words };
          }
        }
        if (next.segDoc && next.segDocName === d.name) {
          const raw = d.data as SegmentsDoc & { emphasisWords?: string[] };
          const segDoc: SegmentsDoc = { fps: raw.fps, crossfadeFrames: raw.crossfadeFrames, src: raw.src, segments: raw.segments };
          next = { ...next, segDoc };
          init.segDoc = segDoc;
          if (Array.isArray(raw.emphasisWords)) {
            next = { ...next, emphasis: raw.emphasisWords };
            init.emphasis = raw.emphasisWords;
            segHadEmphasis = true;
          }
        }
        if (d.name === 'audio-mix.json') {
          const mix = d.data as AudioMixDoc;
          next = { ...next, audioMix: mix };
          init.audioMix = mix;
        }
        if (d.name === 'props.json') {
          const props = d.data as Record<string, unknown>;
          next = { ...next, props };
          init.props = props;
        }
      }
      setCtx({ ...cur, shas: newShas, docs: newDocs, initial: init, segHadEmphasis });
      commit(next);
      setAgentDiff(null);
    } catch {
      setAgentDiff(null);
      setReloadTick((t) => t + 1);
    }
  }, [agentDiff, project, commit]);

  /** Keep my version: adopt the new disk shas (so Save can overwrite cleanly) and mark those docs
   *  dirty by breaking their reference equality with `initial` — the next ▸ Save writes mine back. */
  const keepMine = useCallback(() => {
    if (!agentDiff) return;
    setCtx((p) => {
      if (!p) return p;
      const init = { ...p.initial };
      for (const name of agentDiff.names) {
        for (const [key, file] of Object.entries(p.captionFiles)) {
          const words = init.captions[key];
          if (file === name && words) init.captions = { ...init.captions, [key]: words.map((w) => ({ ...w })) };
        }
        if (init.segDoc && init.segDocName === name) init.segDoc = { ...init.segDoc };
        if (name === 'audio-mix.json') init.audioMix = { ...init.audioMix };
        if (name === 'props.json' && init.props) init.props = { ...init.props };
      }
      return { ...p, shas: { ...p.shas, ...agentDiff.theirsShas }, initial: init };
    });
    setAgentDiff(null);
  }, [agentDiff]);

  // ── render ────────────────────────────────────────────────────────────────────
  if (loadError) return <EmptyState title="Fine-tune" hint={loadError} />;
  if (emptyDocs) {
    return (
      <div data-testid="finetune-empty">
        <EmptyState
          title="Nothing to fine-tune yet"
          hint={`The agent creates captions / segments / audio-mix JSON in public/${project}/ as it edits — this editor lights up by itself when the first doc lands. A finished render is NOT fine-tune data (watch drafts in the Preview tab); ask the agent to keep the timeline data-driven if this stays empty.`}
        />
      </div>
    );
  }
  if (!ctx || !model) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading fine-tune editor…</div>;

  const segDocs = ctx.docs.filter((d) => d.kind === 'segments');
  const canUndo = (history?.past.length ?? 0) > 0;
  const canRedo = (history?.future.length ?? 0) > 0;
  const hasCaptions = Object.keys(model.captions).length > 0;
  const selChip = sel?.t === 'word' ? chips.find((c) => c.capKey === sel.id.capKey && c.srcIndex === sel.id.srcIndex) ?? null : null;
  const selSeg = sel?.t === 'seg' ? model.segDoc?.segments[sel.index] ?? null : null;
  const selTrack = sel?.t === 'audio' ? model.audioMix.tracks.find((t) => t.id === sel.id) ?? null : null;
  const selScene = sel?.t === 'scene' ? blockItems[sel.index] ?? null : null;

  const previewToggleAvailable = !!ctx.schemaEntry;

  return (
    <div data-testid="finetune" tabIndex={0} onKeyDown={onKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 12, outline: 'none' }}>
      {/* header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {segDocs.length > 1 && (
          <select
            data-testid="ft-doc-select"
            value={model.segDocName ?? ''}
            onChange={(e) => setSegChoice(e.target.value)}
            style={{ background: 'var(--surface-1)', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 12 }}
          >
            {segDocs.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {previewToggleAvailable && (
          <GhostBtn
            testid="ft-preview-toggle"
            onClick={() => {
              setRenderSel(null);
              setPreviewComp((v) => !v);
            }}
            title="Switch between the data preview (captions/audio over footage) and the real composition (needs the comp's media on disk)"
          >
            {previewComp ? '▶ comp preview' : '▶ data preview'}
          </GhostBtn>
        )}
        {renders.length > 0 && (
          <select
            data-testid="ft-render-select"
            value={renderSel ?? ''}
            onChange={(e) => setRenderSel(e.target.value || null)}
            title="Edit against a RENDERED version: the chosen render becomes the preview background and your live chip edits overlay it"
            style={{ background: 'var(--surface-1)', color: renderSel ? 'var(--accent)' : 'var(--secondary)', border: `1px solid ${renderSel ? 'var(--accent)' : 'var(--hairline)'}`, borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 12, maxWidth: 240 }}
          >
            <option value="">▶ render preview…</option>
            {renders.map((r) => (
              <option key={r.url} value={r.url}>
                {r.scoped === false ? '⚠ ' : ''}{r.relPath}
              </option>
            ))}
          </select>
        )}
        {renderSel && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }} title="The render carries its OLD baked-in captions — toggle the live overlay off to review the visuals without double text">
            <input data-testid="ft-overlay-captions" type="checkbox" checked={overlayCaptions} onChange={(e) => setOverlayCaptions(e.target.checked)} />
            overlay live captions
          </label>
        )}
        <GhostBtn testid="ft-undo" onClick={() => setHistory((h) => (h ? historyUndo(h) : h))} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </GhostBtn>
        <GhostBtn testid="ft-redo" onClick={() => setHistory((h) => (h ? historyRedo(h) : h))} disabled={!canRedo} title="Redo (Ctrl+Y)">
          ↷ Redo
        </GhostBtn>
        {hasCaptions && (
          <>
            <GhostBtn
              testid="ft-align"
              onClick={() => {
                const captions: Record<string, CaptionWord[]> = {};
                for (const [key, words] of Object.entries(model.captions)) {
                  captions[key] = alignToVoice(words, ctx.baselines[key] ?? []);
                }
                commit({ ...model, captions });
              }}
              title="Snap every word's start to the nearest Whisper onset"
            >
              ⇤ Align to voice
            </GhostBtn>
            <GhostBtn
              testid="ft-reset"
              onClick={() => {
                const captions: Record<string, CaptionWord[]> = {};
                for (const [key] of Object.entries(model.captions)) {
                  captions[key] = resetToBaseline(ctx.baselines[key] ?? []);
                }
                commit({ ...model, captions });
              }}
              title="Restore the pristine Whisper transcript timings"
            >
              ⟲ Reset to Whisper
            </GhostBtn>
          </>
        )}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
          zoom
          <input data-testid="ft-zoom" type="range" min={20} max={300} value={pxPerSec} onChange={(e) => setPxPerSec(parseInt(e.target.value, 10))} />
        </label>
        {dirty && <span aria-hidden title="unsaved changes" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />}
        <button
          data-testid="ft-save"
          onClick={() => void doSave()}
          disabled={!dirty || !!forkPrompt}
          style={{
            background: dirty && !forkPrompt ? 'var(--accent)' : 'var(--surface-2)',
            color: dirty && !forkPrompt ? 'var(--primary)' : 'var(--muted)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 800,
            cursor: dirty ? 'pointer' : 'default',
          }}
        >
          ▸ Save
        </button>
      </div>

      {saveState && (
        <div data-testid="ft-save-status" className="mono" style={{ fontSize: 12, color: saveState.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
          {saveState.msg}
        </div>
      )}
      {runningStage && !forkPrompt && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          ⓘ the agent has <span className="mono">{runningStage}</span> running — saving will offer a version fork instead of touching the in-flight run
        </div>
      )}

      {/* UIP4.4 — the fork gate */}
      {forkPrompt && (
        <div
          data-testid="ft-fork-card"
          style={{ border: '1px solid var(--warn)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,176,32,0.07)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ fontWeight: 700, color: 'var(--warn)', fontSize: 13 }}>🔒 needs your decision — stage “{forkPrompt.stage}” is running</div>
          <div style={{ fontSize: 12.5, color: 'var(--secondary)' }}>{forkPrompt.error}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Fork & save keeps the in-flight version untouched and records your edit as the next version (the approved one is never overwritten).
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-testid="ft-fork-confirm"
              onClick={() => void doSave(true)}
              style={{ background: 'var(--accent)', color: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              ▸ Fork & save
            </button>
            <GhostBtn testid="ft-fork-cancel" onClick={() => setForkPrompt(null)}>
              Cancel
            </GhostBtn>
          </div>
        </div>
      )}
      {fileConflict && (
        <div data-testid="ft-file-conflict" style={{ border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 12.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
          ✕ {fileConflict}
          <GhostBtn testid="ft-reload" onClick={() => setSegChoice((c) => (c === null ? '' : null))}>
            Reload from disk
          </GhostBtn>
        </div>
      )}

      {/* UIP5.5 — inline agent-edit diff: a doc changed on disk while it was open here */}
      {agentDiff && (
        <div
          data-testid="ft-agent-diff"
          style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            🤖 the agent updated {agentDiff.names.join(', ')} while you were editing
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: '3px 10px', fontSize: 12, alignItems: 'baseline', maxHeight: 180, overflow: 'auto' }}>
            {agentDiff.rows.slice(0, 14).map((r, i) => (
              <div key={i} style={{ display: 'contents' }} data-testid="ft-diff-row">
                <span className="mono" style={{ color: 'var(--muted)', fontSize: 10.5 }}>{r.doc}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                <span className="mono">{r.mine}</span>
                <span aria-hidden style={{ color: 'var(--muted)' }}>→</span>
                <span className="mono" style={{ color: 'var(--secondary)', fontWeight: 700 }}>{r.theirs}</span>
              </div>
            ))}
          </div>
          {agentDiff.rows.length > 14 && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>… +{agentDiff.rows.length - 14} more change(s)</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostBtn testid="ft-diff-accept" onClick={() => void acceptTheirs()} title="Take the agent's version of these files (Ctrl+Z brings yours back)">
              Accept agent's version
            </GhostBtn>
            <GhostBtn testid="ft-diff-keep" onClick={keepMine} title="Keep editing your version — the next Save writes it back over the agent's">
              Keep mine (Save overwrites)
            </GhostBtn>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 250px', gap: 14, alignItems: 'start' }}>
        {/* preview + timeline */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            data-testid="ft-preview"
            style={{
              background: '#000',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              // explicit width — the Player sizes to 100% of it (a shrink-to-fit parent collapses to 0)
              width:
                renderSel && renderMeta
                  ? renderMeta.width > renderMeta.height
                    ? 'min(640px, 100%)'
                    : 280
                  : previewComp && compLoaded && compLoaded.width > compLoaded.height
                    ? 'min(640px, 100%)'
                    : 280,
              flex: 'none',
            }}
          >
            {renderSel ? (
              renderMeta ? (
                <Player
                  ref={playerRef}
                  component={RenderPreview}
                  inputProps={{
                    src: renderSel,
                    captions: overlayCaptions ? chips : [],
                    emphasisWords: model.emphasis,
                    captionFontSize: ctx.captionStyle.fontSize,
                    captionPaddingBottom: ctx.captionStyle.paddingBottom,
                  }}
                  durationInFrames={Math.max(1, durationInFrames)}
                  fps={fps}
                  compositionWidth={renderMeta.width}
                  compositionHeight={renderMeta.height}
                  controls
                  style={{ width: '100%' }}
                  acknowledgeRemotionLicense
                />
              ) : (
                <div data-testid="ft-render-loading" style={{ color: 'var(--muted)', fontSize: 12, padding: 20 }}>Loading render…</div>
              )
            ) : previewComp && ctx.schemaEntry ? (
              compLoaded ? (
                <Player
                  ref={playerRef}
                  component={compLoaded.component}
                  inputProps={model.props ?? {}}
                  durationInFrames={Math.max(1, durationInFrames)}
                  fps={compLoaded.fps}
                  compositionWidth={compLoaded.width}
                  compositionHeight={compLoaded.height}
                  controls
                  style={{ width: '100%' }}
                  acknowledgeRemotionLicense
                />
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 12, padding: 20 }}>Loading composition…</div>
              )
            ) : (
              <Player
                ref={playerRef}
                component={FineTunePreview}
                inputProps={{
                  placed,
                  crossfadeFrames: model.segDoc?.crossfadeFrames ?? 0,
                  defaultSrc: model.segDoc?.src ?? singleSrc,
                  srcExists: ctx.srcExists,
                  captions: chips,
                  emphasisWords: model.emphasis,
                  captionFontSize: ctx.captionStyle.fontSize,
                  captionPaddingBottom: ctx.captionStyle.paddingBottom,
                  audioTracks: model.audioMix.tracks,
                  audioSrcExists: ctx.srcExists,
                  voWins: wins,
                }}
                durationInFrames={Math.max(1, durationInFrames)}
                fps={fps}
                compositionWidth={dim.width}
                compositionHeight={dim.height}
                controls
                style={{ width: '100%' }}
                acknowledgeRemotionLicense
              />
            )}
          </div>

          {/* timeline */}
          <div
            data-testid="ft-timeline"
            style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', overflowX: 'auto', overflowY: 'hidden', background: 'var(--surface-1)', position: 'relative' }}
            onClick={() => setSel(null)}
          >
            <div style={{ position: 'relative', width: trackWidth + 52, minWidth: '100%' }}>
              <div style={{ marginLeft: 52, position: 'relative' }}>
                <Ruler durationSec={durationSec} pxPerSec={pxPerSec} onSeek={seekTo} />
                <Playhead sec={playheadFrame / fps} pxPerSec={pxPerSec} height={22 + (model.segDoc ? 43 : 0) + (blocks.length > 0 ? 43 : 0) + (hasCaptions ? 41 : 0) + 18 + 3 * 41} />
              </div>
              <div style={{ position: 'relative' }}>
                {model.segDoc && (
                  <TrackRow label="SEG" height={42} width={trackWidth}>
                    <SegmentTrack
                      placed={placed}
                      fps={model.segDoc.fps}
                      pxPerSec={pxPerSec}
                      selectedIndex={sel?.t === 'seg' ? sel.index : null}
                      onSelect={(index) => setSel({ t: 'seg', index })}
                      onDragStart={beginDrag}
                      onDragMove={onSegDrag}
                      onDragEnd={endDrag}
                    />
                  </TrackRow>
                )}
                {blocks.length > 0 && (
                  <TrackRow label="SCN" height={42} width={trackWidth}>
                    <SceneTrack
                      blocks={blocks}
                      pxPerSec={pxPerSec}
                      selectedIndex={sel?.t === 'scene' ? sel.index : null}
                      onSelect={(index) => setSel({ t: 'scene', index })}
                      onDragStart={beginDrag}
                      onDragMove={onSceneDrag}
                      onDragEnd={endDrag}
                    />
                  </TrackRow>
                )}
                {hasCaptions && (
                  <TrackRow label="TXT" height={40} width={trackWidth}>
                    <CaptionTrack
                      chips={chips}
                      pxPerSec={pxPerSec}
                      emphasis={model.emphasis}
                      selected={sel?.t === 'word' ? sel.id : null}
                      onSelect={(id) => setSel({ t: 'word', id })}
                      onToggleEmphasis={(chip) => editEmphasis(chip.text)}
                      onDragStart={beginDrag}
                      onDragMove={onChipDrag}
                      onDragEnd={endDrag}
                    />
                  </TrackRow>
                )}
                <div
                  data-testid="ft-lufs-chip"
                  className="mono"
                  style={{ paddingLeft: 60, fontSize: 10, color: 'var(--muted)', height: 18, lineHeight: '18px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-1)', position: 'sticky', left: 0 }}
                >
                  🔒 delivery master locked: −14 LUFS / −1 dBTP (loudnorm) — track gains feed the duck, never the master
                </div>
                <AudioTracksUI
                  tracks={model.audioMix.tracks}
                  width={trackWidth}
                  pxPerSec={pxPerSec}
                  audioAssets={ctx.audioAssets}
                  srcExists={ctx.srcExists}
                  selectedId={sel?.t === 'audio' ? sel.id : null}
                  onSelect={(id) => setSel({ t: 'audio', id })}
                  onAdd={(role, src) => commit({ ...model, audioMix: { ...model.audioMix, tracks: addTrack(model.audioMix.tracks, role, src) } })}
                  onDragStart={beginDrag}
                  onDragMove={onAudioDrag}
                  onDragEnd={endDrag}
                />
              </div>
            </div>
          </div>
        </div>

        {/* inspector */}
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 12, minHeight: 160 }}>
          {sel?.t === 'word' && selChip && (
            <WordInspector
              word={selChip}
              emphasized={isEmphasized(model.emphasis, selChip.text)}
              onText={(text) => editWord(sel.id, (w, i) => w.map((x, j) => (j === i ? { ...x, text } : x)))}
              onTime={(field, valueMs) => {
                if (!Number.isFinite(valueMs)) return;
                const srcWords = model.captions[sel.id.capKey];
                const w = srcWords?.[sel.id.srcIndex];
                if (!w) return;
                // numeric inputs are OUTPUT time; convert to a delta and reuse the clamped edit math
                const outVal = field === 'startMs' ? selChip.startMs : selChip.endMs;
                const delta = valueMs - outVal;
                if (model.segDoc) {
                  commit({
                    ...model,
                    captions: applyRemappedWordEdit(model.captions, placed, selChip, {
                      kind: field === 'startMs' ? 'resize-start' : 'resize-end',
                      deltaMs: delta,
                    }),
                  });
                } else {
                  editWord(sel.id, (words, i) => resizeWord(words, i, field === 'startMs' ? 'start' : 'end', delta));
                }
              }}
              onEmphasis={() => editEmphasis(selChip.text)}
            />
          )}
          {sel?.t === 'seg' && selSeg && model.segDoc && (
            <SegmentInspector
              segment={selSeg}
              onNudge={(field, d) => commit({ ...model, segDoc: { ...model.segDoc!, segments: nudgeSegment(model.segDoc!.segments, sel.index, field, d) } })}
              onSet={(field, v) => {
                if (!Number.isFinite(v)) return;
                const seg = model.segDoc!.segments[sel.index];
                if (!seg) return;
                const cur = seg[field];
                commit({ ...model, segDoc: { ...model.segDoc!, segments: nudgeSegment(model.segDoc!.segments, sel.index, field, v - cur) } });
              }}
            />
          )}
          {sel?.t === 'scene' && selScene && blocksPath && model.props && (
            <InspectorShell title={`scene ${blocks[sel.index]?.label ?? sel.index + 1}`}>
              <div style={{ display: 'flex', gap: 6 }}>
                <GhostBtn
                  testid="ft-scene-left"
                  disabled={sel.index === 0}
                  onClick={() => {
                    const items = [...blockItems];
                    const a = items[sel.index - 1];
                    const b = items[sel.index];
                    if (!a || !b) return;
                    items[sel.index - 1] = b;
                    items[sel.index] = a;
                    commit({ ...model, props: setAtPath(model.props!, blocksPath.path, items) });
                    setSel({ t: 'scene', index: sel.index - 1 });
                  }}
                  title="Move scene earlier"
                >
                  ◀
                </GhostBtn>
                <GhostBtn
                  testid="ft-scene-right"
                  disabled={sel.index >= blockItems.length - 1}
                  onClick={() => {
                    const items = [...blockItems];
                    const a = items[sel.index];
                    const b = items[sel.index + 1];
                    if (!a || !b) return;
                    items[sel.index] = b;
                    items[sel.index + 1] = a;
                    commit({ ...model, props: setAtPath(model.props!, blocksPath.path, items) });
                    setSel({ t: 'scene', index: sel.index + 1 });
                  }}
                  title="Move scene later"
                >
                  ▶
                </GhostBtn>
              </div>
              <SchemaForm
                schema={blocksPath.itemSchema}
                value={selScene}
                onChange={(nextItem) => {
                  const items = [...blockItems];
                  items[sel.index] = nextItem;
                  commit({ ...model, props: setAtPath(model.props!, blocksPath.path, items) });
                }}
                testidPrefix="ft-scene"
              />
            </InspectorShell>
          )}
          {sel?.t === 'audio' && selTrack && (
            <AudioInspector
              track={selTrack}
              onOffset={(v) => {
                if (!Number.isFinite(v)) return;
                commit({ ...model, audioMix: { ...model.audioMix, tracks: moveTrack(model.audioMix.tracks, sel.id, v - selTrack.offsetSec) } });
              }}
              onGain={(g) => commit({ ...model, audioMix: { ...model.audioMix, tracks: setTrackGain(model.audioMix.tracks, sel.id, g) } })}
              onDuck={(d) => commit({ ...model, audioMix: { ...model.audioMix, tracks: setTrackDuck(model.audioMix.tracks, sel.id, d) } })}
              onRemove={() => {
                commit({ ...model, audioMix: { ...model.audioMix, tracks: model.audioMix.tracks.filter((t) => t.id !== sel.id) } });
                setSel(null);
              }}
            />
          )}
          {!sel && ctx.schemaEntry && model.props && (
            <InspectorShell title={`${ctx.schemaEntry.compId} props`}>
              <SchemaForm
                schema={ctx.schemaEntry.jsonSchema}
                value={model.props}
                onChange={(next) => commit({ ...model, props: next })}
                testidPrefix="ft-props"
              />
            </InspectorShell>
          )}
          {!sel && (!ctx.schemaEntry || !model.props) && (
            <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
              Select a word, segment or audio pill to fine-tune it.
              <br />
              Drag chip edges to retime · double-click a word for emphasis · Ctrl+Z undoes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A type guard import-cycle helper: AudioTrack is referenced by props above. */
export type { AudioTrack };
