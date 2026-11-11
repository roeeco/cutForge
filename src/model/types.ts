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
  /** How tightly it bends (milestone 45, CURVED_WALLS.md §3.3); absent: its kind's defaults (`bendDefaults`). */
  bend?: BendLimits;
};

/**
 * How tightly a material bends (starting points: calibrate with a test strip).
 * `smoothR`: the smallest radius it bends to on its own; `patternR`: with its
 * kind's pattern (scores, liner scoring, a living hinge); `pitch`: that
 * pattern's line spacing; `k`: the neutral-line factor (developed length =
 * angle × (inner radius + k·t)). Millimetres.
 */
export type BendLimits = { smoothR: number; patternR: number; pitch: number; k: number };

/**
 * How a bent wall bends (milestone 47): on its own (`smooth`), with score
 * lines (`score`, card), with the inner liner kiss-scored (`kiss`,
 * corrugated), perforated (`perf`: short cut dashes) or with a living hinge
 * (`lattice`, plywood); `auto` picks the first of its material's styles that
 * bends as tight as the curve.
 */
export type BendStyle = 'auto' | 'smooth' | 'score' | 'kiss' | 'perf' | 'lattice';
/**
 * A bent wall's stored bend choices (milestone 47); absent: automatic.
 * `pitch`: line spacing (mm, null = automatic, following the curve); `face`:
 * which face is up when it is cut, so kiss scores land on it (1: the wall's
 * inner face, the box's inside; −1: its outer face). Absent: the face inside
 * most of its bends.
 */
export type BendChoice = { style?: BendStyle; pitch?: number | null; face?: 1 | -1 };

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
export type CurveKind = 'auto' | 'round';
/**
 * A sketch point (a polygon vertex) and how the outline passes it. 'round'
 * (milestone 45): a tangent circular arc of radius `r` replaces the corner
 * (clamped so the arcs on an edge never overlap).
 */
export type SketchPt = P2 & { curve?: CurveKind; r?: number };
/**
 * A round base (milestone 45, CURVED_WALLS.md §6.1): a circle, a four-centre
 * oval (end radius `rEnd`) or a stadium filling the panel's w × h. Its points
 * are made from it (`roundPts`), so its card edits sizes, not points.
 */
export type RoundShape = { shape: 'circle' | 'oval' | 'stadium'; rEnd?: number };
export type WallCorner = 'tl' | 'tr' | 'bl' | 'br';
export type WallSketch = {
  kind: 'wall';
  /** Free-corner offsets; the bottom corners move only along the attached edge (dx). */
  corners?: Partial<Record<WallCorner, { dx: number; dy: number; curve?: CurveKind }>>;
  inserts?: WallInsert[];
  /**
   * Milestone 46: the wall whose top outline this one follows (a parallel wall
   * facing it), projected through 3D; its top corners and top-edge points are
   * derived from it (src/model/match.ts).
   */
  match?: string;
};
/**
 * Layer 1 of a panel's outline (POLYGONS_AND_CUTS.md §3). Root panels are
 * free polygons (edge i runs pts[i] → pts[i+1], CCW, named edgeIds[i]);
 * grown panels are a parametric w × h rectangle with corner offsets and
 * inserted points on their free edges.
 */
export type Sketch = { kind: 'poly'; pts: SketchPt[]; edgeIds: string[]; round?: RoundShape } | WallSketch;

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
  /** Placed on the floor or a face of another panel (milestone 28): its frame follows the host. Absent: a floor panel or a grown panel, as before. */
  place?: PanelPlace;
  /** A guide (milestone 28), on the root of a net: drawn and snapped to, never cut or joined. Grown panels inherit it. */
  construction?: true;
  /**
   * A divider (milestone 44): a standing board on its base (`place`) drawn as
   * a line. Its ends are found on every solve (src/model/dividers.ts), so
   * `place.x/y` and `w` are derived; this record is what the student drew.
   */
  divider?: DividerRec;
  /**
   * Derived (milestone 46, re-made by `solve`): a wall standing on a curve run
   * of its base is bent along it. Its outline, shapes and joints stay in flat
   * (s, y) coordinates; `facets` place it in 3D (src/model/bent.ts), and
   * `frame` is the facet at its middle. Never saved.
   */
  bent?: Bent;
  /** A bent wall's bend choices (milestone 47): style, line spacing, which face is up. Absent: automatic. */
  bend?: BendChoice;
};

/**
 * One planar facet of a bent panel: its flat x range [s0, s1] and where that
 * part lies. A bent panel's facets also carry the outer-face points at their
 * ends (`a`, `b`, at y = 0) and the inward directions there (`ma`, `mb`), so
 * neighbouring facets meet without a gap.
 */
export type Facet = { s0: number; s1: number; frame: Frame; a?: V3; b?: V3; ma?: V3; mb?: V3 };
/**
 * A bent wall (milestone 46): its run on the base, its facets, and how its
 * flat x maps onto the base outline (`pts`: developed length s at each run
 * vertex, the vertex on the base outline and its inward unit normal). `off` is how far in from the base outline the wall's outer face
 * stands, `lift` how high its bottom is above the base's plane.
 */
export type Bent = {
  run: string;
  base: string;
  closed: boolean;
  facets: Facet[];
  pts: { s: number; p: P2; n: P2 }[];
  off: number;
  lift: number;
  /** Tightest radius of the run (mm). */
  minR: number;
  /** Derived (milestone 47): the bend pattern cut into it (src/model/bendPattern.ts). */
  pattern?: BendInfo;
};

/** A zone of a bent wall that turns one way, and what is cut into it there. */
export type BendZone = { s0: number; s1: number; sign: 1 | -1; turn: number; minR: number; style: Exclude<BendStyle, 'auto'>; lines: number; /** lines a shape or joint cut short */ broken: number; /** what broke them, when too few lines are left to turn it: a shape (`byId`) or a joint */ by?: 'shape' | 'joint'; byId?: string };
/**
 * Derived: a bent wall's bend pattern (milestone 47). `style` as resolved
 * (`auto` chose it when `auto`), `face` which face is up when cut (see
 * `BendChoice`), its zones, and the problems found: a zone a shape or joint
 * cut through so it cannot turn enough (`broken`), a zone too short for its
 * turn (`short`), a kiss-scored strip bending both ways (`twoWay`), the style
 * reaching less tight than the curve (`reach`, its radius).
 */
export type BendInfo = { style: Exclude<BendStyle, 'auto'>; auto: boolean; face: 1 | -1; mirror: boolean; zones: BendZone[]; reach: number; pitch: number };


/**
 * A divider as drawn, in its base's local coordinates: a point on its
 * mid-plane, its direction (degrees), and how far the drawn line reached each
 * way from that point (mm, `reach[0]` ≤ 0 ≤ `reach[1]`). Each end runs to the
 * first board beyond its reach; dividers it passes on the way are crossed.
 */
export type DividerRec = { at: P2; rot: number; reach: [number, number] };

/**
 * Where a placed panel sits (milestone 28). `host` null is the floor. `x`, `y`
 * and `rot` (degrees) are in the host's local coordinates (the floor's: x along
 * world X, y along world −Z). Flat: the panel's origin and its u axis turned
 * by `rot`. Standing: the start of its bottom line and the line's direction;
 * its height is the panel's `h`, and `side` says which side of the line the
 * material is on. `face` is the host's face it is on (1: its material side,
 * −1: its plane).
 */
export type PanelPlace = { host: string | null; face: 1 | -1; x: number; y: number; rot: number; pose: 'flat' | 'standing'; side?: 1 | -1 };

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
  | 'teeth' // a bent wall's tapered glue teeth, folded onto its base (milestone 46)
  | 'wrap' // a bent wall around its base, glued to the base's edge (milestone 46)
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
   * null = max(4, 1.5t)), with a score where they leave the slot; or
   * self-locking (`snap`: through, with barbs that catch behind the far face
   * and a slit so the tab flexes); or held with bolts in captive nuts (`bolt`:
   * flush tabs, a T-slot for an M3 nut in the tab panel between tabs, a hole
   * in the other panel).
   */
  tabLen?: TabLock;
  lockDepth?: number | null;
  /**
   * Derived (milestone 35): a tray corner made a fold so a wall lies flat
   * beside its neighbour (`kind` 'fold' on a closing seam); the panel that
   * folds off the other one.
   */
  hingeOf?: string;
};

/** How tab-and-slot tabs hold: flush, through and folded under, self-locking barbs, or bolts in captive nuts. */
export type TabLock = 'flush' | 'through' | 'snap' | 'bolt';

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
  /** Extra material joined to a panel outline (glue flaps; `flat`: in the panel's own plane in 3D too, e.g. a locking tab's barbs). */
  adds: { panelId: string; poly: P2[]; flat?: boolean }[];
  /** Score lines (flap folds). */
  scores: { panelId: string; a: P2; b: P2 }[];
  /** Glue flaps folded in 3D: polygon in the receiving panel's local coords, slab z range there. */
  flaps3d: Flap3d[];
  /** Material a joint removes from a panel's outline (layer 7), e.g. a sliver past a corner joint. */
  cuts?: { panelId: string; poly: P2[] }[];
  /** Bolts in captive nuts the joint uses (each a screw and a nut to buy). */
  bolts?: number;
  /** Open cut lines (milestone 47: a bend's perforations and living-hinge cuts). */
  lines?: { panelId: string; a: P2; b: P2 }[];
};

/** `sheet` counts the sheets of the copy's own material; `mat` is that material's id (absent: the working material). */
export type SheetPlacement = { sheet: number; x: number; y: number; rot: 0 | 90; manual: boolean; mat?: string };

export type PieceSettings = { quantity: number };

/** An object resting in a box (milestone 40): which one, how many, where on the base (base-local centre), its own size for a custom one. */
export type Content = { id: string; object: string; baseId: string; x: number; y: number; count?: number; w?: number; d?: number; h?: number };

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
  /** The Quick build mission this design was started from (milestone 40), so a submission shows which. */
  mission?: { id: string; version: number };
  /** Objects placed in its compartments (milestone 40): view state kept with the design, ignored by pieces, packing and export. */
  contents?: Content[];
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
  /** Tab-and-slot corners: how their tabs hold (see `Connection.tabLen`). */
  tabLen?: TabLock;
  /**
   * Nets that lie flat (milestone 35): 'auto' (default) changes the net where
   * walls would overlap when it lies flat; 'off' keeps it in one piece (the
   * export check then reports the overlap).
   */
  flat?: 'auto' | 'off';
  /** Derived (re-made by `solve`): how each wall (by base edge key) was changed so the net lies flat. */
  fixes?: Record<string, TrayFix>;
  /**
   * Derived with `fixes`: which wall a hinged wall folds off (by base edge key),
   * the corner joints whose flap was trimmed or moved, and inside corners
   * (by the outgoing edge's key) where the incoming wall closes the corner
   * because it gives way.
   */
  fixPlan?: { hinge?: Record<string, string>; trim?: string[]; swap?: string[]; extOn?: Record<string, 'prev'> };
  /** The student's choice for a wall the app changed: hinge it, cut it as its own piece, or let the corner's other wall give way. */
  pin?: Record<string, 'hinge' | 'own' | 'other'>;
  /** Milestone 46: the joint of its bent walls (on curve runs) with the base; absent: chosen from `wallKind` and the material. */
  curveKind?: ConnectionKind;
  /** Milestone 46: this tray is the telescoping lid of the tray named (its base follows that box's outline, turned over on top of it). */
  lidOf?: string;
};

/** How a tray wall was changed so its net lies flat: its glue flap trimmed, hinged off its neighbour, or cut as its own piece. */
export type TrayFix = 'trim' | 'hinge' | 'own';

export const SCHEMA_VERSION = 13;
