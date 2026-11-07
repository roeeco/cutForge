// Editor store: the design, transactions with undo/redo, shared selection and UI state.
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { ConnectionKind, Design, DetailOp, DetailShape } from '../model/types';
import { connectionsFor } from '../model/materials';
import { createDesign } from '../model/ops';
import { translate, type Lang, type MsgKey } from '../i18n';
import type { GrowDir } from '../model/frame';

export type Selection =
  | { kind: 'panel'; id: string }
  | { kind: 'edge'; panelId: string; edge: number }
  /** One or more shapes; `id` is the primary (last clicked), `ids` all of them. */
  | { kind: 'detail'; id: string; ids: string[] }
  | null;

/** Ids of the selected shapes (empty when none). */
export function selectedDetailIds(s: Selection): string[] {
  return s?.kind === 'detail' ? s.ids : [];
}
export function detailSel(ids: string[]): Selection {
  return ids.length ? { kind: 'detail', id: ids[ids.length - 1], ids } : null;
}

export type Tool = 'select' | 'panel' | 'text' | Exclude<DetailShape, 'text' | 'path'>;
export type View = '3d' | '2d' | 'solo';

export type GrowOptions = { height: number; dir: GrowDir; angle: number; kind?: ConnectionKind };

export type Quality = 'auto' | 'simple' | 'rich';
/** How the 3D stage is drawn (per browser, not part of the design). */
export type ViewPrefs = { outlines: boolean; quality: Quality; dims: boolean };
const PREFS_KEY = 'cutforge.viewPrefs';
function initialPrefs(): ViewPrefs {
  const def: ViewPrefs = { outlines: true, quality: 'auto', dims: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return def;
}

type State = {
  design: Design;
  past: Design[];
  future: Design[];
  /** Design at the start of an open transaction (drag in progress). */
  txnBase: Design | null;
  selection: Selection;
  tool: Tool;
  shapeOp: DetailOp;
  view: View;
  /** Solo view: the panel shown face-on, and the view to return to. */
  soloPanel: string | null;
  prevView: '3d' | '2d';
  lang: Lang;
  grow: GrowOptions;
  needsMaterial: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'failed';
  exportOpen: boolean;
  /** Copy on the cut plan the student last clicked or moved (for rotate). */
  sheetCopy: string | null;
  viewPrefs: ViewPrefs;
  /** Material & sheet drawer open. */
  drawerOpen: boolean;
  /** Part under the pointer (either view), for cross-highlighting. */
  hoverPart: string | null;
  /** Folded nets: 1 = as designed, 0 = flat. View only. */
  foldT: number;
  /** Connection whose joint card is open (seam pill or inspector). */
  openJoint: string | null;

  /** Apply a complete edit as one undo step. */
  apply: (fn: (d: Draft<Design>) => unknown) => void;
  /** Live preview during a gesture: always re-applied to the state at gesture start. */
  preview: (fn: (d: Draft<Design>) => unknown) => void;
  commit: () => void;
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  replaceDesign: (d: Design, needsMaterial?: boolean) => void;
  select: (s: Selection) => void;
  setTool: (t: Tool) => void;
  setShapeOp: (o: DetailOp) => void;
  setView: (v: View) => void;
  openSolo: (panelId: string) => void;
  closeSolo: () => void;
  /** Click on a shape: replace the selection, or toggle it with Shift/Ctrl. */
  clickDetail: (id: string, additive: boolean) => void;
  setLang: (l: Lang) => void;
  setGrow: (g: Partial<GrowOptions>) => void;
  set: (p: Partial<Pick<State, 'needsMaterial' | 'saveState' | 'exportOpen' | 'sheetCopy' | 'drawerOpen' | 'hoverPart' | 'foldT' | 'openJoint'>>) => void;
  setPrefs: (p: Partial<ViewPrefs>) => void;
};

const HISTORY_LIMIT = 200;

function initialLang(): Lang {
  try {
    const l = localStorage.getItem('cutforge.lang');
    if (l === 'he' || l === 'en') return l;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('he') ? 'he' : 'en';
}

/** Drop a selection that no longer points at anything. */
function validSelection(d: Design, s: Selection): Selection {
  if (!s) return s;
  if (s.kind === 'panel') return d.panels[s.id] ? s : null;
  if (s.kind === 'edge') return d.panels[s.panelId] ? s : null;
  const ids = s.ids.filter((x) => d.order.some((id) => d.panels[id]?.details.some((y) => y.id === x)));
  return detailSel(ids);
}

export const useStore = create<State>()((set, get) => ({
  design: createDesign(),
  past: [],
  future: [],
  txnBase: null,
  selection: null,
  tool: 'select',
  shapeOp: 'cut',
  view: '3d',
  soloPanel: null,
  prevView: '3d',
  lang: initialLang(),
  grow: { height: 60, dir: 'up', angle: 90 },
  needsMaterial: true,
  saveState: 'idle',
  exportOpen: false,
  sheetCopy: null,
  viewPrefs: initialPrefs(),
  drawerOpen: false,
  hoverPart: null,
  foldT: 1,
  openJoint: null,

  apply: (fn) => {
    if (get().txnBase) get().commit();
    const cur = get().design;
    const next = produce(cur, (d) => void fn(d));
    if (next === cur) return;
    set({ design: next, past: [...get().past, cur].slice(-HISTORY_LIMIT), future: [], selection: validSelection(next, get().selection) });
  },
  preview: (fn) => {
    const base = get().txnBase ?? get().design;
    set({ txnBase: base, design: produce(base, (d) => void fn(d)) });
  },
  commit: () => {
    const { txnBase, design, past } = get();
    if (!txnBase) return;
    if (design === txnBase) return set({ txnBase: null });
    set({ txnBase: null, past: [...past, txnBase].slice(-HISTORY_LIMIT), future: [] });
  },
  cancel: () => {
    const { txnBase } = get();
    if (txnBase) set({ design: txnBase, txnBase: null });
  },
  undo: () => {
    const { past, future, design, txnBase } = get();
    if (txnBase) return get().cancel();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ design: prev, past: past.slice(0, -1), future: [design, ...future], selection: validSelection(prev, get().selection) });
  },
  redo: () => {
    const { past, future, design } = get();
    if (!future.length) return;
    const next = future[0];
    set({ design: next, past: [...past, design], future: future.slice(1), selection: validSelection(next, get().selection) });
  },
  replaceDesign: (d, needsMaterial = false) => set({ design: d, past: [], future: [], txnBase: null, selection: null, needsMaterial, view: get().view === 'solo' ? get().prevView : get().view, soloPanel: null, foldT: 1, openJoint: null }),
  select: (s) => set({ selection: s, openJoint: null }),
  setTool: (t) => set({ tool: t }),
  setShapeOp: (o) => set({ shapeOp: o }),
  setView: (v) => set({ view: v, tool: v !== '3d' && get().tool === 'panel' ? 'select' : get().tool, soloPanel: v === 'solo' ? get().soloPanel : null }),
  openSolo: (panelId) => {
    const cur = get().view;
    set({ view: 'solo', soloPanel: panelId, prevView: cur === 'solo' ? get().prevView : cur, tool: get().tool === 'panel' ? 'select' : get().tool });
  },
  closeSolo: () => set({ view: get().prevView, soloPanel: null }),
  clickDetail: (id, additive) => {
    const cur = selectedDetailIds(get().selection);
    if (!additive) return set({ selection: detailSel([id]) });
    set({ selection: detailSel(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) });
  },
  setLang: (l) => {
    try {
      localStorage.setItem('cutforge.lang', l);
    } catch {
      /* ignore */
    }
    set({ lang: l });
  },
  setGrow: (g) => set({ grow: { ...get().grow, ...g } }),
  set: (p) => set(p),
  setPrefs: (p) => {
    const next = { ...get().viewPrefs, ...p };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ viewPrefs: next });
  },
}));

/** Connection the grow card will use: the chosen one if this angle allows it. */
export function growKind(d: Design, g: GrowOptions): ConnectionKind {
  const options = connectionsFor(d.material, g.angle);
  return g.kind && options.includes(g.kind) ? g.kind : options[0];
}

export function useT() {
  const lang = useStore((s) => s.lang);
  return (key: MsgKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
