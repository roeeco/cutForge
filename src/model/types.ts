// The authoritative, serializable design model. Everything else (3D meshes,
// cut-plan drawings, validation, packing, export) is derived from this.
// Units: millimetres. 3D world is y-up (ground plane = XZ).

export type V3 = [number, number, number];

export type MaterialKind = 'card' | 'corrugated' | 'plywood';

export type MaterialProfile = {
  id: string;
  kind: MaterialKind;
  /** i18n key for the display name, or a literal name for custom profiles. */
  nameKey: string;
  thickness: number; // measured thickness (mm)
  kerf: number; // laser kerf width (mm)
  clearance: number; // joint fit clearance (mm)
  foldAllowance: number; // fold/score allowance (mm)
  sheetW: number;
  sheetH: number;
  /** Grain/flute direction on the sheet: along sheet x, along y, or none. */
  grain: 'x' | 'y' | 'none';
};

/**
 * A panel's placement in 3D. `o` is the origin of the panel's local 2D
 * coordinates, `u`/`v` are its unit in-plane axes. The material occupies the
 * slab from the plane towards `side * (u × v)` with the material thickness.
 */
export type Frame = { o: V3; u: V3; v: V3; side: 1 | -1 };

export type DetailShape = 'rect' | 'roundrect' | 'circle' | 'text' | 'path' | 'polygon';
/** add: joins the panel outline; cut: a hole inside, a notch across the edge. */
export type DetailOp = 'add' | 'cut' | 'engrave' | 'score';

/** A detail drawn on a panel, in the panel's local coordinates (centre based). */
export type Detail = {
  id: string;
  shape: DetailShape;
  op: DetailOp;
  cx: number;
  cy: number;
  w: number; // for circles: diameter
  h: number; // for circles: equals w
  r?: number; // corner radius for roundrect
  /** Text shapes: the text stays editable; outlines are derived (see src/text). */
  text?: { value: string; font: string; size: number };
  /** Imported vector shapes and polygons: closed polygons in a unit box (-0.5..0.5), scaled to w × h. */
  path?: { polys: P2[][] };
  /** Cut only: removes material from every panel in its path, along this panel's normal (both ways). */
  through?: boolean;
  /** Polygon shapes drawn as a regular n-gon (kept until a vertex is edited). */
  regular?: { n: number };
  /** Live array: nx × ny copies, dx/dy centre-to-centre spacing (panel coords). Linear = one of nx/ny is 1. */
  array?: DetailArray;
  /** Rotation in degrees (counter-clockwise) about the shape's centre; an array turns as a group about its centre. Missing = 0. */
  rot?: number;
};

export type DetailArray = { nx: number; ny: number; dx: number; dy: number };

/** A wall inserted point: at fraction t along a free edge, pushed `off` mm outward. */
export type WallInsert = { id: string; edge: 'e1' | 'e2' | 'e3'; t: number; off: number; curve?: CurveKind };
/**
 * How the outline passes a point: absent = a corner; 'auto' = a smooth curve
 * through it, tangent to the line between its neighbours, with handles a
 * third of each side's length (src/model/edges.ts). Room for 'bezier'
 * (handles of its own) later.
 */
export type CurveKind = 'auto';
/** A sketch point (a polygon vertex) and how the outline passes it. */
export type SketchPt = P2 & { curve?: CurveKind };
export type WallCorner = 'tl' | 'tr' | 'bl' | 'br';
export type WallSketch = {
  kind: 'wall';
  /** Free-corner offsets; the bottom corners move only along the attached edge (dx). */
  corners?: Partial<Record<WallCorner, { dx: number; dy: number; curve?: CurveKind }>>;
  inserts?: WallInsert[];
};
/**
 * Layer 1 of a panel's outline (POLYGONS_AND_CUTS.md §3). Root panels are
 * free polygons (edge i runs pts[i] → pts[i+1], CCW, named edgeIds[i]);
 * grown panels are a parametric w × h rectangle with corner offsets and
 * inserted points on their free edges.
 */
export type Sketch = { kind: 'poly'; pts: SketchPt[]; edgeIds: string[] } | WallSketch;

export type Panel = {
  id: string;
  name: string;
  /** Bounding size of the sketch, in local coordinates from (0,0). A grown panel's w comes from its parent edge. */
  w: number;
  h: number;
  sketch: Sketch;
  frame: Frame;
  details: Detail[];
  /** Tray walls on edges that a cut removed, kept (with their shapes) until the edge returns. */
  broken?: boolean;
  /** A tray wall with its own height instead of the tray's. */
  customHeight?: boolean;
  /** Fold-over (double-wall) reinforcement on free edges (card and corrugated). */
  foldOvers?: FoldOver[];
  /**
   * Derived (re-made by `solve`): how far a wall reaches past the start/end of
   * its parent edge, to close an inside corner of a tray.
   */
  ext?: { s: number; e: number };
  /**
   * The board's own material (a profile id: one of `Design.materials`, or a
   * built-in one). Absent: the working material (`Design.material`).
   */
  material?: string;
};

/**
 * Fold-over on a free edge: a rim strip and a liner folded onto the wall's
 * inner face, glued or locked with tabs through slots in the base.
 */
export type FoldOver = {
  id: string;
  edge: string;
  /** null = the liner runs down to the base; a number = a partial hem (mm, at most 0.45 h). */
  depth: number | null;
  lock: 'glue' | 'tabs';
  /** Lock tab count (null = automatic: two when they fit, else one). */
  locks: number | null;
  /** Tab reach past the liner's end (null = t + max(4, 1.5t)). */
  lockDepth: number | null;
};

/** An edge of a panel by key (see src/model/edges.ts); 'face' means the panel's face. */
export type EdgeRef = { panelId: string; edge: string };

export type ConnectionKind =
  | 'finger' // complementary fingers on two meeting edges (plywood, 90°)
  | 'tabslot' // tabs on one edge through slots in the other panel (90°, incl. angled slots in side walls)
  | 'slide' // edge stops short of the other panel's face by the fit clearance (no slots)
  | 'fold' // panels stay one piece, joined by a score line
  | 'glue' // glue flap on one panel's edge, folded onto the other panel's face
  | 'halflap' // crossing panels with half-depth slots
  | 'lean' // angled plywood panel resting on its parent, held by side walls
  | 'butt'; // edge to edge, no joint

/**
 * A connection owns the relationship between two panels and regenerates
 * both sides together.
 *
 * Grown connections (`grown: true`) attach a child to a parent edge: `a` is the
 * parent edge, `b` the child's edge 0 (same direction), and the child's frame
 * is derived from it. Other connections join existing panels (closing seams,
 * divider ends, half-laps): `a` is the edge that carries the joint features
 * (fingers: the earlier panel, which owns the corners), `b` the other panel's
 * edge or face (edge -1).
 */
export type Connection = {
  id: string;
  kind: ConnectionKind;
  a: EdgeRef;
  b: EdgeRef;
  grown: boolean;
  /** Grown only: angle between child and parent panel, degrees (see DECISIONS.md). */
  angle: number;
  /** Grown only: which face of the parent the child rises from. */
  dir: 'up' | 'down';
  /** Grown only: distance the child stands in from the parent edge (mm), e.g. dividers and tab-and-slot walls. */
  offset: number;
  /**
   * Grown only: the part of the parent edge the child stands on, [s0, s1] in mm
   * from the edge (piece)'s start. Absent: the whole edge. Tray walls ignore it.
   */
  span?: [number, number];
  /** Requested finger count (odd, >=3). null = automatic from target width. */
  fingers: number | null;
  /** Requested tab count. null = automatic. */
  tabs: number | null;
  /** Glue flap width (mm). null = automatic from material. */
  flap: number | null;
  /** Fold direction seen from the material side of the parent. */
  foldDir: 'valley' | 'mountain';
  /**
   * The joint the student (or the template) asked for. When the angle or
   * material rules it out, `kind` falls back to the default, and it returns
   * to `pref` as soon as that is allowed again. Missing = `kind`.
   */
  pref?: ConnectionKind;
  /**
   * Closing seams are kept automatically (removed when the panels stop meeting,
   * re-made when they meet) unless this is `false`: joined or changed by hand.
   */
  auto?: boolean;
  /** Last valid derived geometry, kept when the panels stop meeting (see `broken`). */
  geom?: ConnGeom;
  /** True when the joined edges no longer meet; `geom` is the last valid result. */
  broken?: boolean;
  /** Made by a tray's reconciliation (wall-to-base or corner seam). */
  trayId?: string;
  /** Broken because the panels still meet but too briefly for the joint (a cut took the contact). */
  thin?: boolean;
  /**
   * Tab-and-slot: tabs flush with the receiver's far face (default), or long
   * enough to pass through and fold under (`lockDepth` mm past the far face,
   * null = max(4, 1.5t)), with a score where they leave the slot.
   */
  tabLen?: 'flush' | 'through';
  lockDepth?: number | null;
};

export type Notch = { s0: number; s1: number; depth: number };
export type P2 = { x: number; y: number };

/**
 * A glue flap as folded in 3D: polygon in the receiving panel's local coords,
 * slab z range there. For the fold view it also records the panel it belongs
 * to (`owner`, where it is cut), the line it turns about (`hinge`: two points in
 * the owner's local coords, z into the material) and the turn (degrees, right
 * hand about hinge[0] → hinge[1]) from lying flat beside the owner, as in the
 * cut net, to where it is folded. Older files without them draw it on the
 * receiver.
 */
export type Flap3d = { panelId: string; poly: P2[]; z0: number; z1: number; owner?: string; hinge?: [V3, V3]; angle?: number };

/** Geometry a connection contributes to its panels (all in panel-local mm). */
export type ConnGeom = {
  /** Edge profile changes: positive depth cuts back, negative protrudes. */
  edges: { panelId: string; edge: string; notches: Notch[] }[];
  /** Interior cut-outs (slots). */
  holes: { panelId: string; poly: P2[] }[];
  /** Extra material joined to a panel outline (glue flaps). */
  adds: { panelId: string; poly: P2[] }[];
  /** Score lines (flap folds). */
  scores: { panelId: string; a: P2; b: P2 }[];
  /** Glue flaps folded in 3D: polygon in the receiving panel's local coords, slab z range there. */
  flaps3d: Flap3d[];
  /** Material a joint removes from a panel's outline (layer 7), e.g. a sliver past a corner joint. */
  cuts?: { panelId: string; poly: P2[] }[];
};

/** `sheet` counts the sheets of the copy's own material; `mat` is that material's id (absent: the working material). */
export type SheetPlacement = { sheet: number; x: number; y: number; rot: 0 | 90; manual: boolean; mat?: string };

export type PieceSettings = { quantity: number };

export type Design = {
  schemaVersion: number;
  id: string;
  name: string;
  /** The working material: boards without their own material use it. */
  material: MaterialProfile;
  /** Other materials boards use (`Panel.material`), by profile id; absent when every board uses the working material. */
  materials?: Record<string, MaterialProfile>;
  panels: Record<string, Panel>;
  /** Display/creation order of panels. */
  order: string[];
  connections: Record<string, Connection>;
  pieces: Record<string, PieceSettings>;
  /** Sheet placements keyed by `${pieceKey}#${copyIndex}`. */
  placements: Record<string, SheetPlacement>;
  sheetSpacing: number;
  sheetMargin: number;
  /** Let the packer turn pieces 90° against the grain/flute direction. */
  allowRotate?: boolean;
  /** Panel pairs ("idA|idB", sorted) the student unjoined: never connected automatically again. */
  noAutoSeams?: string[];
  /** Trays: bases extruded into walls on every edge (see src/model/trays.ts). */
  trays: Record<string, Tray>;
  /** The template this design was generated from, with its parameters. */
  template?: { id: string; version: number; params: Record<string, number | string> };
  /** Automatic dividers on a base (see src/model/dividers.ts). */
  dividerSets?: Record<string, DividerSet>;
  /**
   * Design-wide joint defaults (see src/model/jointDefaults.ts): the kind for
   * wall-to-base joints (grown panels and edge-on-face seams) and for corners
   * (wall-to-wall closing seams), used for new joints where allowed; and the
   * glue flap width (mm) replacing the automatic one. Absent: the material's.
   */
  joints?: JointChoices;
};

export type DesignJoints = { base?: ConnectionKind; corner?: ConnectionKind; flap?: number };
/**
 * The design-wide joint choices, one set per material kind (milestone 26): a
 * switch to card and back to plywood restores the plywood choices, and card
 * keeps its own. Older files have one flat `DesignJoints`; it is read into the
 * current material's slot (`normalizeJoints`).
 */
export type JointChoices = Partial<Record<MaterialKind, DesignJoints>>;

/**
 * Dividers made and spaced automatically in a rectangular clear inside:
 * `across` dividers parallel to the base's left edge (spaced along its width),
 * `along` dividers parallel to its front edge (spaced along its depth). Even
 * spacing, or compartments of `size` mm (the last takes the rest). Members are
 * `<id>/a<n>` and `<id>/l<n>`; a divider dragged by hand leaves the set and is
 * listed in `loose` until *Space evenly again*.
 */
export type DividerSet = {
  id: string;
  baseId: string;
  across: number;
  along: number;
  height: number;
  mode: 'even' | 'size';
  size?: number;
  loose?: string[];
};

/** A base extruded into walls on every straight edge, at one shared height. */
export type Tray = {
  id: string;
  baseId: string;
  height: number;
  /** Wall-to-base joint and wall-to-wall corner joint. */
  wallKind: ConnectionKind;
  cornerKind: ConnectionKind;
  /** Edges left without a wall (deleted walls; "Wall it" removes them again). */
  openEdges: string[];
  /** Tab-and-slot corners: tabs that pass through and fold under. */
  tabLen?: 'flush' | 'through';
};

export const SCHEMA_VERSION = 8;
