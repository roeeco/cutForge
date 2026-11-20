import { outlineWhy } from '../model/outlineWhy';
import type { Edit2D } from '../sketch/edit2d';
// Editor store: the design, transactions with undo/redo, shared selection and UI state.
import { designKind } from '../model/jointDefaults';
import { create } from 'zustand';
import { quickGuard, type GuardNote } from '../easy/guard';
import { keepsCuttable, type Mode } from '../easy/features';
import { produce, type Draft } from 'immer';
import type { ClosureStyle, ConnectionKind, LineType, Design, Detail, DetailOp, DetailShape, MaterialProfile, SketchGraph, V3, WallSketch } from '../model/types';
import { connectionsFor, matOf, MATERIALS } from '../model/materials';
import { autoConnect, createDesign, findDetail, newId, setMaterial, solve } from '../model/ops';
import { requestCamera, TOUR_CAMERA } from '../tour/stage';
import { settle } from '../model/derived';
import { detailBBox } from '../model/geometry';
import { snapBox, snapContext } from '../model/snap';
import { translate, type Lang, type MsgKey } from '../i18n';
import { fromHinge } from '../model/hinge';
import { isSculpture, type Heights } from '../sculpt/ops';
import type { SketchPlane } from '../sculpt/sketch';
import { draftOf, finishBlock, planeFrame, shapeFrame, writeSketch } from '../sculpt/session';

export type Selection =
  /** `ids`: every selected panel (milestone 31), `id` the last clicked; absent: just `id`. */
  | { kind: 'panel'; id: string; ids?: string[] }
  | { kind: 'edge'; panelId: string; edge: string }
  /** One or more shapes; `id` is the primary (last clicked), `ids` all of them. */
  | { kind: 'detail'; id: string; ids: string[] }
  /** Sculpture designs (milestone 120): one or more 3D shapes; `id` is the last clicked. */
  | { kind: 'shape'; id: string; ids: string[] }
  | null;

/** Ids of the selected shapes (empty when none). */
export function selectedDetailIds(s: Selection): string[] {
  return s?.kind === 'detail' ? s.ids : [];
}
/** What clicking an export-check message selects: the shape, the panel, or both panels of a joint message. */
export function issueSelection(i: { target: { kind: 'panel' | 'detail' | 'shape' | 'none'; id: string }; pair?: [string, string] }): Selection {
  // a sculpture's checks select a shape, or nothing
  if (i.target.kind === 'shape') return { kind: 'shape', id: i.target.id, ids: [i.target.id] };
  if (i.target.kind === 'none') return null;
  if (i.target.kind === 'detail') return { kind: 'detail', id: i.target.id, ids: [i.target.id] };
  if (i.pair) return { kind: 'panel', id: i.pair[0], ids: [i.pair[0], i.pair[1]] };
  return { kind: 'panel', id: i.target.id };
}
/** Ids of the selected panels (empty when none). */
export function selectedPanelIds(s: Selection): string[] {
  return s?.kind === 'panel' ? (s.ids?.length ? s.ids : [s.id]) : [];
}
/** A panel selection of these ids (the last is the one clicked). */
export function panelSel(ids: string[]): Selection {
  return ids.length ? (ids.length === 1 ? { kind: 'panel', id: ids[0] } : { kind: 'panel', id: ids[ids.length - 1], ids }) : null;
}
export function detailSel(ids: string[]): Selection {
  return ids.length ? { kind: 'detail', id: ids[ids.length - 1], ids } : null;
}

/** The Shapes tool's footprints (milestone 75). */
export type ShapeFoot = 'rect' | 'rounded' | 'circle' | 'polygon' | 'regular' | 'line';
/** Tools the Shapes tool drives: a footprint drawn as a board or as a shape on one. */
export const SHAPE_DRAW_TOOLS = new Set<string>(['panel', 'rect', 'roundrect', 'circle', 'polygon']);

export type Tool = 'select' | 'panel' | 'text' | Exclude<DetailShape, 'text' | 'path'> | QuickTool | SculptTool;
/** Sculpture designs' tools (milestone 120): place shapes, sketch an outline, round corners. */
export type SculptTool = 'shapes' | 'sketch' | 'radius';
/** Ids of the selected 3D shapes (empty when none). */
export function selectedShapeIds(s: Selection): string[] {
  return s?.kind === 'shape' ? s.ids : [];
}
export function shapeSel(ids: string[]): Selection {
  return ids.length ? { kind: 'shape', id: ids[ids.length - 1], ids } : null;
}
/** Tools that work on the 3D stage only. */
const ONLY_3D = new Set<string>(['panel', 'box', 'wall', 'divider', 'shapes', 'sketch', 'radius']);
/** Quick build's own tools (milestones 37–38): a box, a wall or lid on an edge, a divider line, a sticker. */
export type QuickTool = 'box' | 'wall' | 'divider' | 'sticker';

/**
 * The Board tool's ghost (milestones 29, 42), in its host's local coordinates
 * (the floor's for `host` null): flat, the rectangle with corners `a` and `b`;
 * standing, the line from `a` to `b`, `height` tall, its material on `side`.
 * The Board tool makes it on release; Quick build's Divider waits for ✓.
 */
export type PanelGhost = {
  host: string | null;
  face: 1 | -1;
  pose: 'flat' | 'standing';
  a: { x: number; y: number };
  b: { x: number; y: number };
  height: number;
  side: 1 | -1;
  /** A divider line on a box's base (milestone 38): from wall to wall it becomes a divider, otherwise a standing panel. */
  divider?: boolean;
  /** The pointer is still down (drawing); Quick build's Divider then waits for ✓. */
  drawing: boolean;
};
export type View = '3d' | '2d' | 'solo' | 'sketch';

/** The 2D sketcher's tools (SKETCH_OVERHAUL.md §6.2 on `claude/guided-mode`). */
export type SkTool = 'select' | 'line' | 'arc' | 'smooth' | 'bezier' | 'points' | 'erase' | 'tape';
/** What is selected in the sketch view: points, segments, and maybe one curve handle (a Bezier's end). */
export type SkSelection = { pts: string[]; segs: string[]; handle?: { seg: string; end: 'a' | 'b' } };
/** A sketch being drawn or edited in the 2D sketch view; the design is changed only by Finish. */
export type SketchSession = {
  /** The shape being edited, or null for a new one. */
  shapeId: string | null;
  plane: SketchPlane;
  /** The sketch's local → world matrix, and whether it is a rigid move. */
  M: number[];
  rigid: boolean;
  mode: 'extrude' | 'revolve';
  draft: SketchGraph;
  /** The draft when the session opened (for Cancel's question). */
  start: SketchGraph;
  past: SketchGraph[];
  future: SketchGraph[];
  /** The draft before a gesture's previews (like the design's txnBase). */
  txn: SketchGraph | null;
  sel: SkSelection;
  tool: SkTool;
  /** New lines are construction lines. */
  cons: boolean;
  /** Show measurements. */
  dims: boolean;
  /** The group new shapes go into. */
  into: string | null;
};
/** The sketch view's own undo history holds this many steps. */
const SKETCH_HISTORY = 200;

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
  /** When the ghost would close a box (milestone 77): what ✓ makes, chosen on the grow card (absent: the default). */
  closeAs?: CloseAs | null;
};

/** What a grow that closes a box makes (milestone 77): a lid of the *Lid* section, the board with its joint (*Fixed*), or a fold with this closure. */
export type CloseAs = 'liftoff' | 'hinged' | 'fixed' | `style:${ClosureStyle}`;

/** A just-made thing waiting for ✓: what it is, and the design and history from before it was made. */
export type Pending = { kind: 'shape' | 'panel' | 'sculpt'; ids: string[]; panelId: string; base: Design; pastLen: number };

/** The design autosave writes (milestone 92): while a draft waits for ✓, the design from before it, so a reload never keeps an unconfirmed draft. */
export function designToSave(s: { design: Design; pending: Pending | null }): Design {
  return s.pending ? s.pending.base : s.design;
}

/** Quick build grows at 90° on the whole edge, adapting, with the design's joint (feature 'grow.advanced' is 'auto', milestone 37). */
const QUICK_GROW: Partial<GrowOptions> = { angle: 90, span: null, adapt: true, kind: undefined, sketch: null, editGhost: false };

/**
 * Quick build keeps shapes where the laser can cut them (milestone 39): the
 * edit's shapes are pulled out of the keep-out zones, and the tooltip told why.
 */
function guarded(d: Design, base: Design) {
  // a sculpture before Make has no boards to solve or join (milestone 120)
  if (isSculpture(d) && !d.outcome) return;
  if (!keepsCuttable(useStore.getState().viewPrefs.mode)) {
    solve(d);
    autoConnect(d);
    return;
  }
  const note = quickGuard(base, d);
  if (note) queueMicrotask(() => useStore.setState({ guardNote: { ...note, at: Date.now() } }));
}

export type Quality = 'auto' | 'simple' | 'rich';
/** How the 3D stage is drawn (per browser, not part of the design). */
export type ViewPrefs = {
  outlines: boolean;
  quality: Quality;
  dims: boolean;
  joints: boolean;
  /** Outline mode (milestone 101): every editable board's outline can be edited on the stage straight away. Excludes `joints`. */
  outlineMode?: boolean;
  /** Keep proportions when a shape is scaled (milestone 103): the 2D frame, the card's sizes and the 3D gizmo share it. */
  keepRatio?: boolean;
  /** Smart snapping (to other shapes, edges, panels, rest angles). Alt turns it off for one drag. */
  snap: boolean;
  /** Grid snapping: positions round to the grid step where no smart target is near. Alt turns it off for one drag. */
  grid: boolean;
  /** Grid step (mm). */
  gridStep: number;
  /** Turn step (degrees) for the gizmo ring and the cut plan's turn knob. */
  turnStep: number;
  /** The shape stage's camera frames what is selected (on unless set to false). */
  follow?: boolean;
  /** Open sections of the settings card, as last left by this viewer; absent: the defaults (see DesignSettings). */
  sections?: Partial<Record<SettingsSection, boolean>>;
  /** Guided, Quick build or Workshop (milestones 37, 105): a viewer preference, never part of the design. */
  mode?: Mode;
  /** Guided can be chosen from the level switch (milestone 105; set once by `?guided` until Guided is the way in). */
  guidedPreview?: boolean;
  /** The class chose the mode and does not let it change (milestone 37). */
  modeLocked?: boolean;
  /** The class's board (milestone 106): Guided's gallery starts every thing in it and shows no choice. */
  classMaterial?: MaterialProfile;
  /** The board last chosen on Guided's gallery (milestone 106; a material id). */
  guidedMaterial?: string;
  /** The missions the class offers (milestone 40; from 106 also Guided's plain things); absent: all. */
  missions?: string[];
  /** Quick build's Box: the kind last made (milestone 73); absent: an open box. */
  boxKind?: BoxKind;
  /** The grow card's *More…* (angle, joint, part of the edge, adapt, outline) is open (milestone 78). */
  growMore?: boolean;
  /** The cut plan shows blank sizes and glue areas (milestone 89). */
  planDims?: boolean;
  /** The cut plan shows the sheets (absent) or the nets one by one (milestone 113). */
  planMode?: 'sheets' | 'nets';
  /** The folded preview beside the Net view (absent: shown, milestone 113). */
  netPreview?: boolean;
  /** The welcome screen's step 2 as the sentence (absent) or as cards of named styles (milestone C1). */
  startView?: 'sentence' | 'cards';
  /** A board's *Edges* list is open (milestone 78; closed by default). */
  edgesOpen?: boolean;
  /** The settings card is open while there are boards and nothing is selected (milestone 78; it folds to its header by default). */
  settingsOpen?: boolean;
};
/** What Quick build's Box makes (LIDS_LINES_PROJECTS_PLAN.md §10.3): an open box, a box with a lid of its own, or a carton. */
export type BoxKind = 'open' | 'lid' | 'carton';
export type SettingsSection = 'template' | 'joints' | 'material' | 'snapping' | 'sizes';
const PREFS_KEY = 'cutforge.viewPrefs';
/**
 * A browser's view preferences from what it saved (`raw`, or null for a new
 * browser): Workshop unless this browser (or its class) chose another level.
 * `search`: the page's query; `?guided` lets Guided be chosen (milestone 105).
 */
export function defaultPrefs(raw: string | null, search = ''): ViewPrefs {
  const def: ViewPrefs = { outlines: true, quality: 'auto', dims: true, joints: false, snap: true, grid: true, gridStep: 1, turnStep: 15 };
  let p: ViewPrefs = { ...def, mode: 'workshop' };
  try {
    if (raw) p = { ...p, ...JSON.parse(raw) };
  } catch {
    /* a broken save: the defaults */
  }
  if (new URLSearchParams(search).has('guided')) p.guidedPreview = true;
  return p;
}
function initialPrefs(): ViewPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    /* storage unavailable */
  }
  const p = defaultPrefs(raw, typeof location === 'undefined' ? '' : location.search);
  if (p.guidedPreview && !raw?.includes('guidedPreview')) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }
  return p;
}

/** Guided's three steps (milestone 105): view state, not saved and not in the history. */
export type GuidedStep = 'build' | 'decorate' | 'send';

/** The first-use tour (milestone 43): the step shown, and the design when it was entered (what the step compares with). Not saved. */
export type TourState = { step: number; entry: Design };

/** Set when the first-use tour was finished or ended (milestone 43). */
export const TOUR_DONE_KEY = 'cutforge.tourDone';
export function tourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Sculpture designs' editor state (milestone 120): not saved with the design. */
export type SculptUi = {
  /** The stage: 1 Shape, or 2 Make (what the design's outcome makes). */
  stage: 'shape' | 'make';
  /** The Shapes tool's next shape, and whether it is a Hole. */
  next: import('../sculpt/ops').Primitive;
  nextHole: boolean;
  /** A shape being dragged from its tile onto the stage, or null. */
  dragKind: SculptUi['next'] | null;
  /** The heights new shapes start at, by kind (the last one confirmed); empty the first time. */
  heights: Heights;
  /** Which handles the selected shapes show: move (arrows), turn (rings) or size (the scale frame). */
  xform: 'move' | 'turn' | 'size';
  /** The group being worked inside (double-click), or null. */
  focus: string | null;
  /** The kernel has loaded. */
  ready: boolean;
  /** The kernel failed to load. */
  failed: boolean;
  /** The sketch tool's plane. */
  plane: { kind: 'floor' } | { kind: 'upright'; o: V3; ang: number };
  /** The workplane new shapes stand on (milestone 121), or null for the floor; `picking`: the next click on a face sets it. */
  work?: { o: V3; n: V3 } | null;
  picking?: boolean;
  /** The protractor (milestone 132): picking its faces, the first face's normal, and the reading. */
  protractor?: { n1?: V3; read?: { deg: number; kind: ConnectionKind } } | null;
};

type State = {
  design: Design;
  sculpt: SculptUi;
  /** The 2D sketch view's session, or null. */
  sketch: SketchSession | null;
  /** Open the sketch view on a shape's sketch, or on the sketch tool's plane for a new one. */
  openSketch: (shapeId: string | null) => void;
  /** Edit the draft (immer): one step of the sketch's own history, or with `preview` a step of a gesture (see sketchCommit). */
  sketchEdit: (fn: (sk: Draft<SketchGraph>) => unknown, opts?: { preview?: boolean }) => boolean;
  sketchCommit: () => void;
  sketchCancelGesture: () => void;
  sketchUndo: () => void;
  sketchRedo: () => void;
  /** Change the session's view state (tool, selection, mode, construction, measurements). */
  setSketch: (p: Partial<Pick<SketchSession, 'tool' | 'sel' | 'mode' | 'cons' | 'dims'>>) => void;
  /** Write the draft into the design (one undo step) and go back to 3D; false when it cannot be built. */
  finishSketch: () => boolean;
  /** Close the session without changing the design. */
  cancelSketch: () => void;
  /** The radius tool's radius (mm; 0 = sharp), also used by Round all corners. */
  sculptRadius: number;
  /** An outcome's assembly steps view: the step shown (0-based), or null. View only. */
  steps: number | null;
  setSculpt: (p: Partial<SculptUi>) => void;
  past: Design[];
  future: Design[];
  /** Design at the start of an open transaction (drag in progress). */
  txnBase: Design | null;
  selection: Selection;
  tool: Tool;
  shapeOp: DetailOp;
  /** The Shapes tool (milestone 75): the footprint drawn, and whether it makes a board (the operator *Board*) or works on one (`shapeOp`). */
  shapeFoot: ShapeFoot;
  shapeBoard: boolean;
  /** Why the last shape was not made (an operator other than *Board* drawn on the floor), for the shape card. */
  shapeNote: 'onBoard' | null;
  /** Lids shown shut (milestone 76), by their box's tray: a lid of its own put on its box, a folded lid closed. View only, not saved. */
  lidShut: Record<string, boolean>;
  /** Another tab saved the design open here (milestone 86): autosave waits until Reload or Keep mine. */
  otherTab?: boolean;
  /** Put a box's lid on (or close it), or take it off (open it). */
  setLidShut: (trayId: string, shut: boolean) => void;
  /** Quick build: the tool each action last used (a hole's shape, text or a sticker). */
  quickLast: Partial<Record<string, Tool>>;
  /** Quick build's guardrails (milestone 39): what the last edit was kept from, for the tooltip. */
  guardNote: (GuardNote & { at: number }) | null;
  /** Quick build's Box (milestone 38): the footprint, a regular footprint's sides, and the last height used. */
  boxFoot: 'rect' | 'regular' | 'rounded' | 'round';
  boxSides: number;
  /** Quick build's Rounded box: its corner radius (milestone 64). */
  boxCorner: number;
  boxHeight: number;
  /** The sticker the Sticker tool places. */
  sticker: string;
  /** Show how it goes together (milestone 40): the animation's progress 0–1, or null. */
  assemble: number | null;
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
  /** Guided's step (milestone 105). */
  guidedStep: GuidedStep;
  /** Change Guided's step: the selection clears and the face-on view closes. */
  setGuidedStep: (s: GuidedStep) => void;
  /** Guided's selected space (milestone 107): its index in the box's spaces; view state. */
  guidedSpace: number | null;
  /** Guided's short note on the stage (a size stopped at the sheet, a split refused), and when it was set. */
  guidedNote: { key: MsgKey; vars?: Record<string, string | number>; at: number } | null;
  /** Material & sheet drawer open. */
  drawerOpen: boolean;
  /** Part under the pointer (either view), for cross-highlighting. */
  hoverPart: string | null;
  /** Folded nets: 1 = as designed, 0 = flat. View only. */
  foldT: number;
  /** Connection whose joint card is open (seam pill or inspector). */
  openJoint: string | null;
  /** Polygon tool: click vertices, or drag a regular n-gon. */
  polyMode: 'click' | 'ngon' | 'round' | 'rounded' | 'line';
  /** The Line footprint's type (milestone 84). */
  lineType: LineType;
  ngonSides: number;
  /** The polygon tool's Round mode: which round shape a drag makes (milestone 62). */
  roundShape: 'circle' | 'oval' | 'stadium';
  /** The polygon tool's Rounded mode: the corner radius (mm). */
  roundCorner: number;
  /** Base whose outline vertices are being edited, and the picked vertex. */
  editOutline: string | null;
  /** Milestone 104: the outline being edited in the 2D view (a shape, a board, a line), and its selected point. */
  edit2d: Edit2D | null;
  sel2d: string | null;
  /** A base vertex index, or on a wall a free corner ('tl' | 'tr') or an inserted point's id. */
  selVertex: number | string | null;
  /** Extrude in progress: the base and the tray height being previewed (a ghost on the stage). */
  extrude: { baseId: string; height: number } | null;
  /** The Board tool's ghost while drawing on the floor or a face (milestones 29, 42); release makes it. */
  panelGhost: PanelGhost | null;
  /** The Board tool's pose for the next board (the Board or Standing board button on the rail), and the height a standing board starts at (the last one used). */
  panelPose: 'flat' | 'standing';
  standHeight: number;
  /**
   * Something a drawing tool just made (milestone 30), waiting for ✓: shapes
   * (or a polygon panel), still adjustable. ✓ keeps it as one undo step and
   * goes back to Select; ✕ (or another tool, another selection, another
   * drawing) takes it away again.
   */
  pending: Pending | null;
  /** Copied shapes (milestone 33): in the app, not the system clipboard; centred on (0, 0). */
  clipboard: Detail[] | null;
  /** A paste following the pointer, until a click puts it down (then it waits for ✓ like any ghost). */
  pasting: boolean;
  /**
   * Picking part of an edge to grow on (milestone 35): its start, and its end
   * while dragging (null: waiting for a second Cmd/Ctrl-click or a typed
   * distance); `typed` is a distance being typed for the end.
   */
  spanPick: { panelId: string; edge: string; s0: number; s1: number | null; typed: string } | null;
  /** The panel point under the pointer (local mm), where a paste lands. Not reactive state for drawing. */
  pointerHit: { panelId: string; x: number; y: number; tol?: number } | null;
  copyShapes: () => boolean;
  pasteShapes: () => boolean;
  /** Move the paste to a panel point (the pasted group's centre), snapping by its box. */
  movePaste: (panelId: string, x: number, y: number, tol?: number) => void;
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
  /** Choose the Shapes tool's footprint and operator (either left as it is when omitted) and the drawing tool they make. */
  chooseShape: (foot?: ShapeFoot, board?: boolean) => void;
  setView: (v: View) => void;
  openSolo: (panelId: string) => void;
  closeSolo: () => void;
  /** Click on a shape: replace the selection, or toggle it with Shift/Ctrl. */
  clickDetail: (id: string, additive: boolean) => void;
  /** Click on a 3D shape: select it, or toggle it with Shift/Ctrl. */
  clickShape: (id: string, additive: boolean) => void;
  /** Click on a panel: select it, or (Shift/Ctrl) add it to or take it from the selected panels (milestone 31). */
  clickPanel: (id: string, additive: boolean) => void;
  setLang: (l: Lang) => void;
  setGrow: (g: Partial<GrowOptions>) => void;
  set: (p: Partial<Pick<State, 'needsMaterial' | 'saveState' | 'exportOpen' | 'sheetCopy' | 'drawerOpen' | 'hoverPart' | 'foldT' | 'openJoint' | 'shapeNote' | 'lineType' | 'polyMode' | 'ngonSides' | 'roundShape' | 'roundCorner' | 'editOutline' | 'selVertex' | 'edit2d' | 'sel2d' | 'extrude' | 'shapeThrough' | 'panelGhost' | 'standHeight' | 'pasting' | 'spanPick' | 'boxFoot' | 'boxSides' | 'boxCorner' | 'boxHeight' | 'sticker' | 'assemble'>>) => void;
  setPrefs: (p: Partial<ViewPrefs>) => void;
  /** Flat or standing boards: the rail's Board and Standing board buttons set it before choosing the Board tool. */
  setBoardPose: (pose: 'flat' | 'standing') => void;
  /**
   * The rail's Polygon, Round and Rounded buttons: one drawing tool underneath
   * (a board on the floor, a shape on a face), each its own button. Polygon
   * keeps its last mode (click corners or regular).
   */
  choosePolyTool: (kind: 'polygon' | 'round' | 'rounded') => void;
  /** The first-use tour (milestone 43), or null. */
  tour: TourState | null;
  /** Start the tour: Workshop, a new blank plywood 3 mm design (as Start with Blank), the welcome screen closed, a known camera. */
  startTour: () => void;
  tourNext: () => void;
  tourBack: () => void;
  /** End the tour (finished or not): the design stays, and the welcome screen offers the tour as a link from now on. */
  endTour: () => void;
};

export type EditorState = State;

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

/** Put copied shapes (centred on 0, 0) on a panel around (x, y), with the given new ids. */
function pasteInto(d: Draft<Design> | Design, panelId: string, x: number, y: number, clip: Detail[], ids: string[]) {
  const p = d.panels[panelId];
  if (!p) return;
  clip.forEach((dt, i) => p.details.push({ ...JSON.parse(JSON.stringify(dt)), id: ids[i], cx: dt.cx + x, cy: dt.cy + y }));
}

/** Drop a selection that no longer points at anything. */
function validSelection(d: Design, s: Selection): Selection {
  if (!s) return s;
  if (s.kind === 'panel') return panelSel(selectedPanelIds(s).filter((id) => d.panels[id]));
  if (s.kind === 'edge') return d.panels[s.panelId] ? s : null;
  if (s.kind === 'shape') return shapeSel(s.ids.filter((id) => !!d.sculpt?.shapes[id]));
  const ids = s.ids.filter((x) => d.order.some((id) => d.panels[id]?.details.some((y) => y.id === x)));
  return detailSel(ids);
}

export const useStore = create<State>()((set, get) => ({
  design: createDesign(),
  sculpt: { stage: 'shape', xform: 'move', next: 'box', nextHole: false, dragKind: null, heights: {}, focus: null, ready: false, failed: false, plane: { kind: 'floor' } },
  sculptRadius: 5,
  sketch: null,
  openSketch: (shapeId) => {
    const st = get();
    const sc = st.design.sculpt;
    const s = shapeId ? sc?.shapes[shapeId] : null;
    if (shapeId && !s?.sketch) return;
    st.cancelPending();
    if (st.txnBase) st.commit();
    const fr = s && sc ? shapeFrame(sc, shapeId!)! : planeFrame(st.sculpt.plane);
    const draft: SketchGraph = s ? draftOf(s) : { pts: {}, segs: {}, order: [] };
    const mode = s?.kind === 'revolve' ? 'revolve' : 'extrude';
    set({
      sketch: { shapeId, plane: fr.plane, M: fr.M, rigid: fr.rigid, mode, draft, start: draft, past: [], future: [], txn: null, sel: { pts: [], segs: [] }, tool: s ? 'select' : 'line', cons: false, dims: true, into: st.sculpt.focus },
      view: 'sketch',
      prevView: '3d',
    });
  },
  sketchEdit: (fn, opts) => {
    const k = get().sketch;
    if (!k) return false;
    let ok = true;
    if (opts?.preview) {
      const base = k.txn ?? k.draft;
      const next = produce(base, (x) => void (ok = fn(x) !== false));
      set({ sketch: { ...k, txn: base, draft: ok ? next : base } });
      return ok;
    }
    const base = k.txn ? (get().sketchCommit(), get().sketch!) : k;
    const next = produce(base.draft, (x) => void (ok = fn(x) !== false));
    if (!ok || next === base.draft) return ok;
    set({ sketch: { ...base, draft: next, past: [...base.past, base.draft].slice(-SKETCH_HISTORY), future: [], sel: liveSel(next, base.sel) } });
    return true;
  },
  sketchCommit: () => {
    const k = get().sketch;
    if (!k?.txn) return;
    if (k.txn === k.draft) return set({ sketch: { ...k, txn: null } });
    set({ sketch: { ...k, txn: null, past: [...k.past, k.txn].slice(-SKETCH_HISTORY), future: [], sel: liveSel(k.draft, k.sel) } });
  },
  sketchCancelGesture: () => {
    const k = get().sketch;
    if (k?.txn) set({ sketch: { ...k, draft: k.txn, txn: null } });
  },
  sketchUndo: () => {
    const k = get().sketch;
    if (!k) return;
    if (k.txn) return get().sketchCancelGesture();
    if (!k.past.length) return;
    const prev = k.past[k.past.length - 1];
    set({ sketch: { ...k, draft: prev, past: k.past.slice(0, -1), future: [k.draft, ...k.future], sel: liveSel(prev, k.sel) } });
  },
  sketchRedo: () => {
    const k = get().sketch;
    if (!k?.future.length) return;
    const next = k.future[0];
    set({ sketch: { ...k, draft: next, past: [...k.past, k.draft], future: k.future.slice(1), sel: liveSel(next, k.sel) } });
  },
  setSketch: (p) => {
    const k = get().sketch;
    if (k) set({ sketch: { ...k, ...p } });
  },
  finishSketch: () => {
    const st = get();
    const k = st.sketch;
    if (!k) return false;
    if (k.txn) st.sketchCommit();
    const shape = k.shapeId ? st.design.sculpt?.shapes[k.shapeId] : null;
    if (finishBlock(k.draft, k.mode, shape)) return false;
    let id = '';
    st.apply((d) => void (id = writeSketch(d as Design, { shapeId: k.shapeId, plane: k.plane, mode: k.mode, draft: k.draft, heights: st.sculpt.heights, into: k.into })));
    set({ sketch: null, view: '3d', tool: 'select' });
    if (id) get().select({ kind: 'shape', id, ids: [id] });
    return true;
  },
  cancelSketch: () => set({ sketch: null, view: get().view === 'sketch' ? '3d' : get().view }),
  steps: null,
  // a stage change closes the assembly steps view and the sketch view
  setSculpt: (p) => set({ sculpt: { ...get().sculpt, ...p }, ...(p.stage ? { steps: null } : {}), ...(p.stage && get().sketch ? { sketch: null, view: get().view === 'sketch' ? '3d' : get().view } : {}) }),
  past: [],
  future: [],
  txnBase: null,
  selection: null,
  tool: 'select',
  shapeOp: 'cut',
  shapeFoot: 'rect',
  shapeBoard: true,
  shapeNote: null,
  lineType: 'crease',
  lidShut: {},
  setLidShut: (trayId, shut) => set({ lidShut: { ...get().lidShut, [trayId]: shut } }),
  quickLast: {},
  guardNote: null,
  boxFoot: 'rect',
  boxSides: 6,
  boxCorner: 15,
  boxHeight: 45,
  sticker: 'star',
  assemble: null,
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
  guidedStep: 'build',
  guidedSpace: null,
  guidedNote: null,
  setGuidedStep: (g) => {
    if (get().view === 'solo') get().closeSolo();
    // Send shows the sheet (milestone 109); Build and Decorate the thing, folded up
    set({ view: g === 'send' ? '2d' : '3d', foldT: 1, assemble: null });
    set({ guidedStep: g, guidedSpace: null, selection: null, edit2d: null, sel2d: null, editOutline: null, selVertex: null, tool: 'select' });
  },
  drawerOpen: false,
  hoverPart: null,
  foldT: 1,
  openJoint: null,
  polyMode: 'click',
  ngonSides: 6,
  roundShape: 'circle',
  roundCorner: 15,
  editOutline: null,
  edit2d: null,
  sel2d: null,
  selVertex: null,
  extrude: null,
  panelGhost: null,
  panelPose: 'flat',
  standHeight: 40,
  pending: null,
  clipboard: null,
  pasting: false,
  spanPick: null,
  pointerHit: null,
  tour: null,
  startTour: () => {
    const st = get();
    if (st.viewPrefs.mode !== 'workshop') st.setPrefs({ mode: 'workshop' });
    if (st.viewPrefs.joints) st.setPrefs({ joints: false });
    if (st.viewPrefs.outlineMode) st.setPrefs({ outlineMode: false });
    // a new design, as Start with Blank makes it
    st.replaceDesign(createDesign(), true);
    get().apply((d) => setMaterial(d, MATERIALS.find((m) => m.id === 'ply-3') ?? d.material));
    set({ past: [], future: [], needsMaterial: false, view: '3d', tool: 'select', extrude: null, drawerOpen: false, exportOpen: false, tour: { step: 0, entry: get().design } });
    requestCamera(...TOUR_CAMERA);
  },
  tourNext: () => {
    const t = get().tour;
    if (t) set({ tour: { step: t.step + 1, entry: get().design } });
  },
  tourBack: () => {
    const t = get().tour;
    if (t) set({ tour: { step: Math.max(0, t.step - 1), entry: get().design } });
  },
  endTour: () => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    set({ tour: null });
  },
  copyShapes: () => {
    const ids = selectedDetailIds(get().selection);
    const d = get().design;
    const dts = ids.map((id) => findDetail(d, id)?.detail).filter((x): x is Detail => !!x);
    if (!dts.length) return false;
    const bbs = dts.map(detailBBox);
    const cx = (Math.min(...bbs.map((b) => b.minX)) + Math.max(...bbs.map((b) => b.maxX))) / 2;
    const cy = (Math.min(...bbs.map((b) => b.minY)) + Math.max(...bbs.map((b) => b.maxY))) / 2;
    set({ clipboard: dts.map((dt) => ({ ...JSON.parse(JSON.stringify(dt)), cx: dt.cx - cx, cy: dt.cy - cy })) });
    return true;
  },
  pasteShapes: () => {
    const clip = get().clipboard;
    if (!clip?.length) return false;
    get().cancelPending();
    const d = get().design;
    // under the pointer, else the centre of the last selected panel
    const hit = get().pointerHit;
    const sel = get().selection;
    const lastPanel = sel?.kind === 'panel' ? sel.id : sel?.kind === 'edge' ? sel.panelId : sel?.kind === 'detail' ? findDetail(d, sel.id)?.panel.id : d.order[d.order.length - 1];
    const target = hit && d.panels[hit.panelId] ? hit : lastPanel && d.panels[lastPanel] ? { panelId: lastPanel, x: d.panels[lastPanel].w / 2, y: d.panels[lastPanel].h / 2 } : null;
    if (!target) return false;
    const ids = clip.map(() => newId('x'));
    get().apply((x) => pasteInto(x, target.panelId, target.x, target.y, clip, ids));
    set({ selection: detailSel(ids) });
    get().beginPending({ kind: 'shape', ids, panelId: target.panelId });
    set({ pasting: !!hit });
    // under the pointer: on the grid, snapping by the group's box
    if (hit && target === hit) get().movePaste(hit.panelId, gridSnap(hit.x), gridSnap(hit.y), hit.tol ?? 0);
    return true;
  },
  movePaste: (panelId, x, y, tol = 0) => {
    const g = get().pending, clip = get().clipboard;
    if (!g || !clip || !get().pasting) return;
    // laid out again on the design from before the paste: no history while it follows the pointer
    let q = { x, y };
    if (tol > 0) {
      const ctx = snapContext(g.base, panelId, new Set());
      const bbs = clip.map(detailBBox);
      const box = { minX: x + Math.min(...bbs.map((b) => b.minX)), maxX: x + Math.max(...bbs.map((b) => b.maxX)), minY: y + Math.min(...bbs.map((b) => b.minY)), maxY: y + Math.max(...bbs.map((b) => b.maxY)) };
      const sn = ctx ? snapBox(ctx, box, tol) : null;
      if (sn) q = { x: x + sn.dx, y: y + sn.dy };
    }
    const pasted = produce(g.base, (dd) => void pasteInto(dd, panelId, q.x, q.y, clip, g.ids));
    const next = settle(pasted, (dd) => {
      solve(dd);
      autoConnect(dd);
    });
    set({ design: next, pending: { ...g, panelId } });
  },
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
    set({ pending: null, pasting: false, past: [...get().past.slice(0, g.pastLen), g.base].slice(-HISTORY_LIMIT), future: [] });
    set({ tool: 'select', editOutline: null, selVertex: null, panelGhost: null });
  },
  cancelPending: () => {
    const g = get().pending;
    if (!g) return;
    set({ pending: null, pasting: false, txnBase: null, design: g.base, past: get().past.slice(0, g.pastLen), future: [], selection: validSelection(g.base, get().selection) });
  },

  apply: (fn) => {
    if (get().txnBase) get().commit();
    const cur = get().design;
    const edited = produce(cur, (d) => void fn(d));
    if (edited === cur) return;
    // shapes can change outlines, and outlines move walls and joints
    const next = settle(edited, (d) => guarded(d, cur));
    if (next === cur) return;
    set({ design: next, past: [...get().past, cur].slice(-HISTORY_LIMIT), future: [], selection: validSelection(next, get().selection) });
  },
  preview: (fn) => {
    const base = get().txnBase ?? get().design;
    set({
      txnBase: base,
      design: settle(produce(base, (d) => void fn(d)), (d) => guarded(d, base)),
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
    // the design's undo leaves the sketch view (its own undo is sketchUndo)
    if (get().sketch) set({ sketch: null, view: get().view === 'sketch' ? '3d' : get().view });
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
  replaceDesign: (d, needsMaterial = false) => set({ sculpt: { ...get().sculpt, stage: 'shape', focus: null, dragKind: null, heights: {} }, sketch: null, steps: null, ...(get().tool === 'shapes' || get().tool === 'sketch' || get().tool === 'radius' ? { tool: 'select' as Tool } : {}), design: d, past: [], future: [], txnBase: null, selection: null, guidedStep: 'build', guidedSpace: null, guidedNote: null, panelGhost: null, pending: null, edit2d: null, sel2d: null, needsMaterial, view: get().view === 'solo' ? get().prevView : get().view === 'sketch' ? '3d' : get().view, soloPanel: null, foldT: 1, openJoint: null }),
  select: (s) => {
    const g = get().pending;
    if (g && !(s && ((s.kind === 'detail' && s.ids.every((x) => g.ids.includes(x))) || (s.kind === 'shape' && s.ids.every((x) => g.ids.includes(x))) || (s.kind === 'panel' && g.ids.includes(s.id))))) get().cancelPending();
    set({ selection: validSelection(get().design, s), openJoint: null, panelGhost: null, ...(s?.kind === 'edge' ? {} : { spanPick: null }), ...(s?.kind === 'edge' && !(get().selection?.kind === 'edge' && (get().selection as { panelId: string }).panelId === s.panelId && (get().selection as { edge: string }).edge === s.edge) ? { grow: { ...get().grow, span: null, sketch: null, editGhost: false, ...(get().viewPrefs.mode === 'quick' ? QUICK_GROW : {}) } } : {}), ...(s?.kind === 'panel' && s.id === get().extrude?.baseId ? {} : { extrude: null }), ...(s?.kind === 'panel' && s.id === get().editOutline ? {} : get().viewPrefs.outlineMode && s?.kind === 'panel' && !s.ids?.length && !outlineWhy(get().design, s.id) ? { editOutline: s.id, selVertex: null } : { editOutline: null, selVertex: null }) });
  },
  setTool: (t) => {
    // another tool drops what the last one made and was not confirmed
    if (get().pending) get().cancelPending();
    const act = t === 'circle' || t === 'rect' || t === 'roundrect' ? 'hole' : t === 'text' || t === 'sticker' ? 'text' : null;
    set({ tool: t, editOutline: null, selVertex: null, panelGhost: null, ...(act ? { quickLast: { ...get().quickLast, [act]: t } } : {}) });
  },
  setShapeOp: (o) => set({ shapeOp: o }),
  chooseShape: (foot, board) => {
    const s = get();
    const f = foot ?? s.shapeFoot;
    // boards are made on the 3D stage; on the cut plan a shape works on a piece, and polygons are drawn in 3D only
    const in3d = s.view === '3d';
    if (!in3d && (f === 'polygon' || f === 'regular' || f === 'line')) return;
    const b = in3d && (board ?? s.shapeBoard);
    set({ shapeFoot: f, shapeNote: null, ...(in3d ? { shapeBoard: b } : {}) });
    const poly = (m: State['polyMode']) => {
      if (get().tool !== 'polygon') get().setTool('polygon');
      if (get().polyMode !== m) set({ polyMode: m });
    };
    if (f === 'line') return poly('line');
    if (f === 'polygon') return poly('click');
    if (f === 'regular') return poly('ngon');
    if (b) return f === 'rect' ? get().setTool('panel') : poly(f === 'rounded' ? 'rounded' : 'round');
    get().setTool(f === 'rect' ? 'rect' : f === 'rounded' ? 'roundrect' : 'circle');
  },
  setView: (v) => set({ view: v, ...(v !== 'sketch' && get().sketch ? { sketch: null } : {}), tool: v !== '3d' && ONLY_3D.has(get().tool) ? 'select' : get().tool, soloPanel: v === 'solo' ? get().soloPanel : null }),
  openSolo: (panelId) => {
    const cur = get().view;
    set({ view: 'solo', soloPanel: panelId, prevView: cur === 'solo' || cur === 'sketch' ? get().prevView : cur, tool: ONLY_3D.has(get().tool) ? 'select' : get().tool });
  },
  closeSolo: () => set({ view: get().prevView, soloPanel: null, edit2d: null, sel2d: null }),
  clickPanel: (id, additive) => {
    const cur = selectedPanelIds(get().selection);
    if (!additive) return get().select({ kind: 'panel', id });
    get().select(panelSel(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  },
  clickShape: (id, additive) => {
    const cur = selectedShapeIds(get().selection);
    if (!additive) return get().select(shapeSel([id]));
    get().select(shapeSel(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  },
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
    // the joints view and outline mode exclude each other (milestone 101)
    if (p.outlineMode) next.joints = false;
    if (p.joints) next.outlineMode = false;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ viewPrefs: next });
    if (p.outlineMode === true) {
      // the mode edits what is selected (or the next board picked) with the Select tool
      const sel = get().selection;
      set({ tool: 'select', editOutline: sel?.kind === 'panel' && !sel.ids?.length && !outlineWhy(get().design, sel.id) ? sel.id : null, selVertex: null });
    } else if (p.outlineMode === false || p.joints) set({ editOutline: null, selVertex: null });
  },
  setBoardPose: (pose) => set({ panelPose: pose }),
  choosePolyTool: (kind) => {
    const cur = get().polyMode;
    const mode = kind === 'polygon' ? (cur === 'ngon' ? 'ngon' : 'click') : kind;
    if (get().tool !== 'polygon') get().setTool('polygon');
    if (cur !== mode) set({ polyMode: mode });
  },
}));

/** A sketch selection with only what still exists in the draft. */
function liveSel(sk: SketchGraph, sel: SkSelection): SkSelection {
  const pts = sel.pts.filter((p) => sk.pts[p]), segs = sel.segs.filter((g) => sk.segs[g]);
  const handle = sel.handle && sk.segs[sel.handle.seg]?.k === 'bez' ? sel.handle : undefined;
  return pts.length === sel.pts.length && segs.length === sel.segs.length && handle === sel.handle ? sel : { pts, segs, ...(handle ? { handle } : {}) };
}

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

/**
 * The interface's direction. The 3D stage is laid out left to right (its
 * canvas and on-model labels), so cards and bars on it set this themselves.
 * Components that call it re-render with the language through `useT`.
 */
export function uiDir(): 'rtl' | 'ltr' {
  return useStore.getState().lang === 'he' ? 'rtl' : 'ltr';
}
