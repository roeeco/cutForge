// Editor store: the design, transactions with undo/redo, shared selection and UI state.
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { Design, DetailOp, DetailShape } from '../model/types';
import { createDesign } from '../model/ops';
import { translate, type Lang, type MsgKey } from '../i18n';
import type { GrowDir } from '../model/frame';

export type Selection =
  | { kind: 'panel'; id: string }
  | { kind: 'edge'; panelId: string; edge: number }
  | { kind: 'detail'; id: string }
  | null;

export type Tool = 'select' | 'panel' | DetailShape;
export type View = '3d' | '2d';

export type GrowOptions = { height: number; dir: GrowDir; angle: number };

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
  lang: Lang;
  grow: GrowOptions;
  needsMaterial: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'failed';
  exportOpen: boolean;

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
  setLang: (l: Lang) => void;
  setGrow: (g: Partial<GrowOptions>) => void;
  set: (p: Partial<Pick<State, 'needsMaterial' | 'saveState' | 'exportOpen'>>) => void;
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
  return d.order.some((id) => d.panels[id]?.details.some((x) => x.id === s.id)) ? s : null;
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
  lang: initialLang(),
  grow: { height: 60, dir: 'up', angle: 90 },
  needsMaterial: true,
  saveState: 'idle',
  exportOpen: false,

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
  replaceDesign: (d, needsMaterial = false) => set({ design: d, past: [], future: [], txnBase: null, selection: null, needsMaterial }),
  select: (s) => set({ selection: s }),
  setTool: (t) => set({ tool: t }),
  setShapeOp: (o) => set({ shapeOp: o }),
  setView: (v) => set({ view: v, tool: v === '2d' && get().tool === 'panel' ? 'select' : get().tool }),
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
}));

export function useT() {
  const lang = useStore((s) => s.lang);
  return (key: MsgKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
