// Editor store: the design, transactions with undo/redo, shared selection and UI state.
import { designKind } from '../model/jointDefaults';
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { ConnectionKind, Design, DetailOp, DetailShape, WallSketch } from '../model/types';
import { connectionsFor, matOf } from '../model/materials';
import { autoConnect, createDesign, solve, type FacePick } from '../model/ops';
import { translate, type Lang, type MsgKey } from '../i18n';
import { fromHinge } from '../model/hinge';

export type Selection =
  /** `also`: other panels shown selected with it (both panels a joint message is about). */
  | { kind: 'panel'; id: string; also?: string[] }
  | { kind: 'edge'; panelId: string; edge: string }
  /** One or more shapes; `id` is the primary (last clicked), `ids` all of them. */
  | { kind: 'detail'; id: string; ids: string[] }
  | null;

/** Ids of the selected shapes (empty when none). */
export function selectedDetailIds(s: Selection): string[] {
  return s?.kind === 'detail' ? s.ids : [];
}
/** What clicking an export-check message selects: the shape, the panel, or both panels of a joint message. */
export function issueSelection(i: { target: { kind: 'panel' | 'detail'; id: string }; pair?: [string, string] }): Selection {
  if (i.target.kind === 'detail') return { kind: 'detail', id: i.target.id, ids: [i.target.id] };
  if (i.pair) return { kind: 'panel', id: i.pair[0], also: [i.pair[1]] };
  return { kind: 'panel', id: i.target.id };
}
export function detailSel(ids: string[]): Selection {
  return ids.length ? { kind: 'detail', id: ids[ids.length - 1], ids } : null;
}

export type Tool = 'select' | 'panel' | 'text' | Exclude<DetailShape, 'text' | 'path'>;

/**
 * The Panel tool's ghost (milestone 29), in its host's local coordinates (the
 * floor's for `host` null): flat, the rectangle with corners `a` and `b`;
 * standing, the line from `a` to `b`, `height` tall, its material on `side`.
 */
export type PanelGhost = {
  host: string | null;
  face: 1 | -1;
  pose: 'flat' | 'standing';
  a: { x: number; y: number };
  b: { x: number; y: number };
  height: number;
  side: 1 | -1;
  construction: boolean;
  /** The pointer is still down (drawing). */
  drawing: boolean;
};
export type View = '3d' | '2d' | 'solo';

/** Grow card settings. `angle` is the hinge angle, 0–360° (see src/model/hinge.ts). */
export type GrowOptions = {
  height: number;
  angle: number;
  kind?: ConnectionKind;
  /** Part of the edge to grow on ([s0, s1] mm from its start); null: the largest free stretch (usually the whole edge). */
  span?: [number, number] | null;
  /** Trim the new panel to what it would run into (default on). */
  adapt?: boolean;
  /** Outline edits made on the ghost (wall corners and inserts); null: none (the adaptive trim, if on). */
  sketch?: WallSketch | null;
  /** The ghost's outline handles are shown. */
  editGhost?: boolean;
};

/** A just-made thing waiting for ✓: what it is, and the design and history from before it was made. */
export type Pending = { kind: 'shape' | 'panel'; ids: string[]; panelId: string; base: Design; pastLen: number };

export type Quality = 'auto' | 'simple' | 'rich';
/** How the 3D stage is drawn (per browser, not part of the design). */
export type ViewPrefs = {
  outlines: boolean;
  quality: Quality;
  dims: boolean;
  joints: boolean;
  /** Smart snapping (to other shapes, edges, panels, rest angles). Alt turns it off for one drag. */
  snap: boolean;
  /** Grid snapping: positions round to the grid step where no smart target is near. Alt turns it off for one drag. */
  grid: boolean;
  /** Grid step (mm). */
  gridStep: number;
  /** Turn step (degrees) for the gizmo ring and the cut plan's turn knob. */
  turnStep: number;
  /** Open sections of the settings card, as last left by this viewer; absent: the defaults (see DesignSettings). */
  sections?: Partial<Record<SettingsSection, boolean>>;
};
export type SettingsSection = 'template' | 'joints' | 'material' | 'snapping';
const PREFS_KEY = 'cutforge.viewPrefs';
function initialPrefs(): ViewPrefs {
  const def: ViewPrefs = { outlines: true, quality: 'auto', dims: true, joints: false, snap: true, grid: true, gridStep: 1, turnStep: 15 };
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
  /** New Cut shapes cut through the whole design. */
  shapeThrough: boolean;
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
  /** Polygon tool: click vertices, or drag a regular n-gon. */
  polyMode: 'click' | 'ngon';
  ngonSides: number;
  /** Base whose outline vertices are being edited, and the picked vertex. */
  editOutline: string | null;
  /** A base vertex index, or on a wall a free corner ('tl' | 'tr') or an inserted point's id. */
  selVertex: number | string | null;
  /** Extrude in progress: the base and the tray height being previewed (a ghost on the stage). */
  extrude: { baseId: string; height: number } | null;
  /** Faces Shift-clicked on the stage for *Divider between* (not part of the design). */
  facePick: FacePick[];
  /** The Panel tool's ghost (milestone 29): drawn on the floor or a face, then made with ✓ or dropped with ✕. */
  panelGhost: PanelGhost | null;
  /** The Panel tool's pose for the next ghost, and the height a standing ghost starts at (the last one used). */
  panelPose: 'flat' | 'standing';
  standHeight: number;
  /**
   * Something a drawing tool just made (milestone 30), waiting for ✓: shapes
   * (or a polygon panel), still adjustable. ✓ keeps it as one undo step and
   * goes back to Select; ✕ (or another tool, another selection, another
   * drawing) takes it away again.
   */
  pending: Pending | null;
  beginPending: (p: Omit<Pending, 'base' | 'pastLen'>) => void;
  confirmPending: () => void;
  cancelPending: () => void;

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
  set: (p: Partial<Pick<State, 'needsMaterial' | 'saveState' | 'exportOpen' | 'sheetCopy' | 'drawerOpen' | 'hoverPart' | 'foldT' | 'openJoint' | 'polyMode' | 'ngonSides' | 'editOutline' | 'selVertex' | 'extrude' | 'shapeThrough' | 'facePick' | 'panelGhost' | 'panelPose' | 'standHeight'>>) => void;
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
  shapeThrough: false,
  view: '3d',
  soloPanel: null,
  prevView: '3d',
  lang: initialLang(),
  grow: { height: 60, angle: 90 },
  needsMaterial: true,
  saveState: 'idle',
  exportOpen: false,
  sheetCopy: null,
  viewPrefs: initialPrefs(),
  drawerOpen: false,
  hoverPart: null,
  foldT: 1,
  openJoint: null,
  polyMode: 'click',
  ngonSides: 6,
  editOutline: null,
  selVertex: null,
  extrude: null,
  facePick: [],
  panelGhost: null,
  panelPose: 'flat',
  standHeight: 40,
  pending: null,
  beginPending: (p) => {
    const { past } = get();
    // made by the last edit: the design before it is the last history entry
    if (!past.length) return;
    set({ pending: { ...p, base: past[past.length - 1], pastLen: past.length - 1 } });
  },
  confirmPending: () => {
    const g = get().pending;
    if (!g) return;
    if (get().txnBase) get().commit();
    // everything since it was made is one undo step
    set({ pending: null, past: [...get().past.slice(0, g.pastLen), g.base].slice(-HISTORY_LIMIT), future: [] });
    set({ tool: 'select', editOutline: null, selVertex: null, panelGhost: null });
  },
  cancelPending: () => {
    const g = get().pending;
    if (!g) return;
    set({ pending: null, txnBase: null, design: g.base, past: get().past.slice(0, g.pastLen), future: [], selection: validSelection(g.base, get().selection) });
  },

  apply: (fn) => {
    if (get().txnBase) get().commit();
    const cur = get().design;
    const edited = produce(cur, (d) => void fn(d));
    if (edited === cur) return;
    // shapes can change outlines, and outlines move walls and joints
    const next = produce(edited, (d) => {
      solve(d as Design);
      autoConnect(d as Design);
    });
    set({ design: next, past: [...get().past, cur].slice(-HISTORY_LIMIT), future: [], selection: validSelection(next, get().selection) });
  },
  preview: (fn) => {
    const base = get().txnBase ?? get().design;
    set({
      txnBase: base,
      design: produce(base, (d) => {
        fn(d);
        solve(d as Design);
        autoConnect(d as Design);
      }),
    });
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
    if (get().pending) return get().cancelPending();
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
  replaceDesign: (d, needsMaterial = false) => set({ design: d, past: [], future: [], txnBase: null, selection: null, panelGhost: null, pending: null, needsMaterial, view: get().view === 'solo' ? get().prevView : get().view, soloPanel: null, foldT: 1, openJoint: null }),
  select: (s) => {
    const g = get().pending;
    if (g && !(s && ((s.kind === 'detail' && s.ids.every((x) => g.ids.includes(x))) || (s.kind === 'panel' && g.ids.includes(s.id))))) get().cancelPending();
    set({ selection: validSelection(get().design, s), openJoint: null, panelGhost: null, ...(s?.kind === 'edge' && !(get().selection?.kind === 'edge' && (get().selection as { panelId: string }).panelId === s.panelId && (get().selection as { edge: string }).edge === s.edge) ? { grow: { ...get().grow, span: null, sketch: null, editGhost: false } } : {}), ...(s?.kind === 'panel' && s.id === get().extrude?.baseId ? {} : { extrude: null }), ...(s?.kind === 'panel' && s.id === get().editOutline ? {} : { editOutline: null, selVertex: null }) });
  },
  setTool: (t) => {
    // another tool drops what the last one made and was not confirmed
    if (get().pending) get().cancelPending();
    set({ tool: t, editOutline: null, selVertex: null, panelGhost: null });
  },
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
/** Smart snapping is off for this drag: Alt is held, or it is turned off in the settings. */
export function noSmartSnap(ev?: { altKey: boolean } | null): boolean {
  return !!ev?.altKey || !useStore.getState().viewPrefs.snap;
}

/**
 * Round to the grid step (mm) from the settings; with grid snapping off (or
 * Alt held during the drag) only to 0.01 mm, so values stay readable.
 */
export function gridSnap(x: number, ev?: { altKey: boolean } | null): number {
  const { grid, gridStep } = useStore.getState().viewPrefs;
  if (ev?.altKey || grid === false) return Math.round(x * 100) / 100;
  const step = gridStep > 0 ? gridStep : 1;
  return Math.round(Math.round(x / step) * step * 1e6) / 1e6;
}

/** The turn step (degrees) from the settings. */
export function turnStep(): number {
  const s = useStore.getState().viewPrefs.turnStep;
  return s > 0 ? s : 15;
}

export function growKind(d: Design, g: GrowOptions, parentId?: string): ConnectionKind {
  // the new panel is made in its parent's material (milestone 36)
  const m = parentId && d.panels[parentId] ? matOf(d, parentId) : d.material;
  const options = connectionsFor(m, fromHinge(g.angle).angle);
  return g.kind && options.includes(g.kind) ? g.kind : (designKind(d, 'base', options, m.kind) ?? options[0]);
}

export function useT() {
  const lang = useStore((s) => s.lang);
  return (key: MsgKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
