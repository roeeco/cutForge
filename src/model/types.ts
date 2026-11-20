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
  /** Extra length a real crease takes up, beyond folding about the middle of the corner (mm, a calibration; 0 by default). Before schema 11: a strip added outside every fold. */
  foldAllowance: number;
  sheetW: number;
  sheetH: number;
  /** Grain/flute direction on the sheet: along sheet x, along y, or none. */
  grain: 'x' | 'y' | 'none';
  /** How tightly it bends (milestone 62, PACKAGING_PLAN.md §6.2); absent: its kind's defaults (`bendDefaults`). */
  bend?: BendLimits;
  /** Dash lengths of a drawn perforation and cut-crease, [cut, tie] mm (milestone 83); absent: its kind's (`lineDashes`). */
  lines?: { perf: [number, number]; crease: [number, number] };
};

/**
 * How tightly a material bends (starting points: calibrate with a test strip).
 * `smoothR`: the smallest radius it bends to on its own; `patternR`: with its
 * kind's pattern (scores, liner scoring, a living hinge); `pitch`: that
 * pattern's line spacing; `k`: the neutral-line factor (developed length =
 * angle × (inner radius + k·t)). Millimetres.
 */
export type BendLimits = { smoothR: number; patternR: number; pitch: number; k: number; /** Plywood living hinges: the shear strain its links may take (milestone 63; absent: 0.016). */ strain?: number };

/** A bend pattern (milestone 63, PACKAGING_PLAN.md §5.1). */
export type PatternId = 'smooth' | 'score' | 'perf' | 'kiss' | 'slits' | 'wave' | 'diamond';
/** How dense a band's pattern is: 1 automatic, less denser (never sparser than it must be). */
export type BendDensity = 1 | 0.75 | 0.5;
/** A band's stored bend choices (milestone 63); absent: automatic. */
export type BendChoice = { pattern?: PatternId | 'auto'; density?: BendDensity };

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
  /** Milestone 104: the shape's outline as an editable graph (its own frame, mm about its centre); `path` keeps the outline it flattens to. */
  sketch?: SketchGraph;
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
 * (milestone 62): a tangent circular arc of radius `r` replaces the corner
 * (clamped so the arcs on an edge never overlap).
 */
export type SketchPt = P2 & { curve?: CurveKind; r?: number };
/**
 * A round base (milestone 62, PACKAGING_PLAN.md §6.2): a circle, a four-centre
 * oval (end radius `rEnd`) or a stadium filling the panel's w × h. Its points
 * are made from it (`roundPts`), so its card edits sizes, not points.
 */
export type RoundShape = {
  shape: 'circle' | 'oval' | 'stadium';
  rEnd?: number;
  /**
   * Milestone 65: a seam flat, a chord `w` mm wide where the outline's outward
   * normal points at `at` (radians), so a wall can stand there and its strip
   * start and close on a flat place. Added when a circle or oval is walled.
   */
  seam?: { at: number; w: number };
};
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
  /** Milestone 67: plain flaps on free edges (card and corrugated): a scored lip, `len` mm, tapered at its ends. */
  edgeFlaps?: EdgeFlap[];
  /** Lines drawn on the board (milestone 83, LIDS_LINES_PROJECTS_PLAN.md Part B): open, in its local coordinates. */
  lines?: BoardLine[];
  /** A one-board lid of a box (milestone 79): its box's tray and its kind. A *Flat* lid rests on the walls' tops, held by their tabs through its slots; a *Drop-in* lid (milestone 80) lies inside the walls on the dividers. */
  lidOf?: { tray: string; kind: 'flat' | 'dropin'; /** Padlock hasps through a Flat lid (milestone 82): how many along the front, and the hole (mm). */ hasps?: { n: 1 | 2 | 3; hole: number } };
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
  /** Milestone 123 (SHAPES_TO_DIELINES_PLAN.md §4.3): a free board made from a face of a shape (`FaceKey`). Absent: a hand-made board. */
  src?: { face: string };
};

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
/** A line type (milestone 83): a slit, a fold or decorative score, a tear line, a fold for board a score barely marks, a reference never cut. */
export type LineType = 'cut' | 'crease' | 'perf' | 'cutcrease' | 'guide';
/** A drawn line on a board, in the board's local coordinates. `bulge` bows the segment that starts at a point into an arc (DXF's bulge: tan of a quarter of the turn). */
export type BoardLine = { id: string; pts: (P2 & { bulge?: number })[]; type: LineType; group?: string };

/** A size of a design (milestone 88): its box's width, depth and height, or a template's parameters. */
export type BoxSize = { id: string; name: string; w?: number; d?: number; h?: number; params?: Record<string, number | string> };

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
  | 'lock' // a glue flap whose tongues push through slits in the other panel: no glue (milestone 68)
  | 'halflap' // crossing panels with half-depth slots
  | 'lean' // angled plywood panel resting on its parent, held by side walls
  | 'key' // two boards end to end, held by a puzzle key cut across the seam (milestone 64)
  | 'closure' // how a lid closes the box it seals: its lip, dust flaps, locks (milestone 67; derived from `Design.closures`)
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
  /** How a crease is cut (milestone 85): a score, a perforation, or a cut-crease for board a score barely marks. Absent: automatic, a score where it folds towards the scored face and a perforation where it folds away from it (a lid's rims, the overhaul of 19 November). */
  crease?: 'score' | 'perf' | 'cutcrease';
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
   * A fold's inner bend radius (milestone 63, mm): a band of material that
   * curves round instead of a crease. Absent: a crease (card and corrugated),
   * or the material's pattern radius on plywood (a living hinge).
   */
  radius?: number;
  /** A band's bend pattern and density (milestone 63). Absent: automatic. */
  bend?: BendChoice;
  /**
   * Derived (milestone 35): a tray corner made a fold so a wall lies flat
   * beside its neighbour (`kind` 'fold' on a closing seam); the panel that
   * folds off the other one.
   */
  hingeOf?: string;
  /**
   * Milestone 64: the join round a tray's rounded corner, from the wall before
   * it (`a`, its edge e1) to the wall after it (`b`, its edge e3). The curve is
   * a band carried by the wall before: one piece with the next wall (`fold`),
   * glued to it with a lip (`glue`), keyed into it (`key`), or plain (`butt`).
   */
  wing?: true;
  /** Milestone 67: a lid's closure (derived while it seals its box): the walls it covers, whose joints with the lid it replaces. */
  covers?: string[];
  /**
   * Milestone 69: the student's choice for a fold: cut the net here (the two
   * parts join with the joint a wall cut as its own piece gets) or never cut it.
   * Absent: the app cuts it only when the net does not fit its sheet.
   */
  cut?: 'cut' | 'keep';
  /** Milestone 69: the app cut the net at this fold so it fits its sheet (kept until it is no longer needed). */
  autoCut?: true;
  /** Derived (milestone 69): this fold is cut; the parts join by `kind`. */
  split?: true;
  /** Derived (milestone 70): a divider's end on a tray corner's band (that corner's wing connection id); `b` is the wall carrying the band. */
  bandEnd?: string;
  /**
   * Milestone 123 (SHAPES_TO_DIELINES_PLAN.md §4.3): a seam of a made model, between two free
   * boards whose edges meet along a line, at any angle from 5° to 355°. A seam fold is kind
   * 'fold' with `hingeOf` its child (the board laid flat off the other in the net); a cut seam
   * is 'glue' or 'lock' (`a` carries the flap). Its kind is set by whoever made it and is never
   * re-fitted by `solve`. Absent: an ordinary joint.
   */
  seam?: true;
  /** Milestone 124: a seam flap's taper, how far it narrows at each end along its edge (mm). Absent: its depth (45°). */
  flapTaper?: number;
  /** Milestone 125: why the chooser picked this joint (an i18n key), shown on the joint card. */
  why?: string;
  /** Milestone 125: the student picked this joint's kind; a change of material keeps it. */
  picked?: true;
  /** Milestone 123: the edge of the face graph this seam was made from (`EdgeKey`). */
  src?: string;
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
/** A flap's shape (milestone 112): plain (milestone 67's lip), a tuck, a dust flap, a glue flap or a hang tab. */
export type FlapShape = 'plain' | 'tuck' | 'dust' | 'glue' | 'hang';
/**
 * A flap on a free edge (milestone 67; shaped in 112). Only `id`, `edge` and
 * `len` are stored for a plain flap made by hand; every other field, when
 * absent, takes its shape's default (`FLAP_DEFAULTS`).
 */
export type EdgeFlap = {
  id: string; edge: string; len: number;
  shape?: FlapShape;
  /** Slope of its two ends (degrees from square, at the edge's start and end). */
  taper?: [number, number];
  /** How far in from the edge's two ends it starts (mm). */
  inset?: [number, number];
  /** Radius of its two far corners (mm). */
  r?: number;
  /** How far it is folded in the model (degrees; 0: flat beside its board). */
  angle?: number;
  /** Folded towards the board's material side (`in`) or away from it (`out`, cut as a perforation). */
  dir?: 'in' | 'out';
  /** A hang tab's hole. */
  hole?: 'round' | 'euro';
};

export type Flap3d = { panelId: string; poly: P2[]; z0: number; z1: number; owner?: string; hinge?: [V3, V3]; angle?: number; /** The folded slab's own plane, when it is not `panelId`'s (a divider's flap folded against a band, milestone 74); it still moves with `panelId`. */ frame?: Frame; /** The board whose plane and coordinates `frame` is, when it is one (a dust flap under its lid, milestone 76). */ planeOf?: string };

/** Geometry a connection contributes to its panels (all in panel-local mm). */
export type ConnGeom = {
  /** Edge profile changes: positive depth cuts back, negative protrudes. */
  edges: { panelId: string; edge: string; notches: Notch[] }[];
  /** Interior cut-outs (slots). */
  holes: { panelId: string; poly: P2[] }[];
  /** Extra material joined to a panel outline (glue flaps; `flat`: in the panel's own plane in 3D too, e.g. a locking tab's barbs). */
  adds: { panelId: string; poly: P2[]; flat?: boolean; /** Drawn in 3D as a band (a rounded corner's strip), not as a slab or a flap. */ band?: boolean }[];
  /** Score lines (flap folds). `toward`: the flap folds towards the panel's material side (1) or away from it (-1); absent: not known (a score that only marks). */
  scores: { panelId: string; a: P2; b: P2; toward?: 1 | -1 }[];
  /** Glue flaps folded in 3D: polygon in the receiving panel's local coords, slab z range there. */
  flaps3d: Flap3d[];
  /** Where glue goes on a part that is not a glue flap of its own (milestone C3: a crash-lock bottom's glue triangles), named on the cut plan. */
  glueAt?: { panelId: string; at: P2 }[];
  /** Material a joint removes from a panel's outline (layer 7), e.g. a sliver past a corner joint. */
  cuts?: { panelId: string; poly: P2[] }[];
  /** Bolts in captive nuts the joint uses (each a screw and a nut to buy). */
  bolts?: number;
  /** Open cut lines (milestone 63: a bend's perforations and living-hinge slits), on the CUT layer. */
  lines?: { panelId: string; a: P2; b: P2 }[];
  /** Cut paths of a bend pattern (milestone 66: wave slits, open; diamonds, closed), on the CUT layer; never part of the board's outline or its slots. */
  cutPaths?: { panelId: string; pts: P2[]; closed: boolean }[];
};

/** `sheet` counts the sheets of the copy's own material; `mat` is that material's id (absent: the working material). */
/**
 * `rot` 180 and 270 (milestone 69): nested pieces turned half round (allowed
 * whatever the grain) or a quarter the other way. `nested`: placed by the
 * nester, for a piece of this size (kept while the piece keeps it).
 */
export type SheetPlacement = { sheet: number; x: number; y: number; rot: 0 | 90 | 180 | 270; manual: boolean; mat?: string; nested?: { w: number; h: number } };

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
  /**
   * Milestone 69: when a net is cut into pieces: only when it does not fit its
   * sheet (absent, the default), also where the student applies *Save
   * material*'s plan, or never.
   */
  split?: 'must' | 'save' | 'never';
  /** Panel pairs ("idA|idB", sorted) the student unjoined: never connected automatically again. */
  noAutoSeams?: string[];
  /** Trays: bases extruded into walls on every edge (see src/model/trays.ts). */
  trays: Record<string, Tray>;
  /** The template this design was generated from, with its parameters. */
  template?: { id: string; version: number; params: Record<string, number | string> };
  /** How a box's sizes are stated (milestone 93): outside (absent), inside, or crease to crease. Stored geometry stays outside sizes; a change of board keeps the size so stated. */
  sizeAs?: 'inside' | 'crease';
  /** Sizes of the design (milestone 88): each the master with these numbers applied, worked out on demand, never stored. */
  sizes?: BoxSize[];
  /** The Quick build mission this design was started from (milestone 40), so a submission shows which. */
  mission?: { id: string; version: number };
  /** Objects placed in its compartments (milestone 40): view state kept with the design, ignored by pieces, packing and export. */
  contents?: Content[];
  /**
   * Milestone 67: how each lid closes the box it seals, by lid panel id. Kept
   * while the lid does not seal (pulled short), so its settings come back with
   * it; the closure's joint is made from it only while it seals.
   */
  closures?: Record<string, Closure>;
  /**
   * Design-wide joint defaults (see src/model/jointDefaults.ts): the kind for
   * wall-to-base joints (grown panels and edge-on-face seams) and for corners
   * (wall-to-wall closing seams), used for new joints where allowed; and the
   * glue flap width (mm) replacing the automatic one. Absent: the material's.
   */
  joints?: JointChoices;
  /**
   * The design type (milestone 120, ported from `claude/guided-mode`'s milestone 49).
   * Absent: a box design (every file made before). 'waffle' is read as *has shapes*
   * (`isSculpture`): the design is made of shapes, and its `outcome` says what they
   * became. The stored value keeps its old name so the waffle can join with no migration.
   */
  kind?: 'waffle';
  /** Sculpture designs: the shapes the solid is built from. */
  sculpt?: Sculpt;
  /**
   * A sculpture design's outcome: what its shapes were made into (folded card,
   * boards, or later the waffle's slices). Absent: not made yet (SHAPES_TO_DIELINES_PLAN.md decision 11).
   */
  outcome?: OutcomeKind;
  /** Milestone 126: how the shapes were made into boards (the Make card's settings and the student's choices by key). Absent: not made. */
  make?: MakeSpec;
};

/** How a sculpture is made (SHAPES_TO_DIELINES_PLAN.md §4.5). Keys are the face graph's (`FaceKey`, `EdgeKey`). */
export type MakeSpec = {
  as: 'fold' | 'boards';
  /** Faces around a curve: the default for card or boards, and per shape. */
  facets?: { card?: number; boards?: number; byShape?: Record<string, number> };
  /** Fewest pieces, or fewer cuts. */
  prefer?: 'pieces' | 'cuts';
  /** Faces left out (openings). */
  open?: string[];
  /** Card: the student's fold or cut by edge. */
  edges?: Record<string, 'fold' | 'cut'>;
  /** A joint kind the student picked, by edge. */
  joints?: Record<string, ConnectionKind>;
};

/** What a sculpture's shapes become (SHAPES_TO_DIELINES_PLAN.md decision 1). */
export type OutcomeKind = 'fold' | 'boards' | 'waffle';

/** A sculpture design's shapes (WAFFLE_MODE.md §4 on `claude/guided-mode`). */
export type Sculpt = {
  shapes: Record<string, Shape3>;
  /** Top-level shapes, in creation order (group members are listed by their group). */
  order: string[];
};

export type ShapeKind = 'box' | 'cylinder' | 'cone' | 'prism' | 'pyramid' | 'sphere' | 'halfsphere' | 'torus' | 'extrude' | 'revolve' | 'group';

/** A unit quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number];

export type Shape3 = {
  id: string;
  name: string;
  kind: ShapeKind;
  /** Tinkercad's Hole: inside a group it is subtracted from the group's solids; outside one it cuts nothing. */
  hole?: true;
  /** Position of its local origin (mm, world; a member's is in its group's frame) and its turn. */
  at: V3;
  q: Quat;
  /** Size before turning (mm): x, up, z. Not for groups, extrudes or revolves. */
  size?: V3;
  /** Prism and pyramid sides (3–12). */
  n?: number;
  /** Cone and pyramid: top size as a fraction of the base (0 = a point). */
  top?: number;
  /** Torus: tube diameter (mm). */
  tube?: number;
  /** Box and prism: footprint corner radii by corner index (absent or 0 = sharp). */
  corners?: number[];
  /** Extrude and revolve: the outline. */
  sketch?: ShapeSketch;
  /** Extrude: height (mm; negative = the other side of an upright plane). */
  height?: number;
  /** Revolve: degrees (360 default) and axis (the plane's axis line, or a straight segment of the sketch). */
  angle?: number;
  axis?: { kind: 'plane' } | { kind: 'seg'; id: string };
  /** Group: its members (each still a Shape3 with its own Solid/Hole). */
  children?: string[];
  color?: string;
  /** Stretch along the shape's own axes (x, up, z), applied to the built body before it is placed. Absent = [1, 1, 1]. */
  stretch?: V3;
  /**
   * Faces (3–64): a cylinder, cone, sphere, half sphere, ring or revolve goes round in this many
   * flat pieces, and an extrusion's arcs and curves are cut into this many per quarter turn,
   * in place of the 0.02 mm rule. Absent: smooth.
   */
  facets?: number;
};

/**
 * A point of a primitive's footprint outline: a Corner (neither field), a Curve (`curve: 'auto'`),
 * or a Round corner (`r` > 0 mm, a tangent arc).
 */
export type SculptPt = { x: number; y: number; curve?: 'auto'; r?: number };

/** A shape's sketch, in the shape's local XY. */
export type ShapeSketch = { plane: 'floor' | 'upright'; v: 2 } & SketchGraph;

/**
 * How a lid closes (milestone 67, PACKAGING_PLAN.md §7): a tuck lip inside the
 * front wall with dust flaps on the side walls (`tuck`), the same with slit
 * locks (`tuckLock`), a lip with a tongue through a slot in the front wall
 * (`tab`), resting on the walls (`rest`), or glued to the front wall
 * (`glued`). `lip`: the lip's length (null: 30% of the lid's depth, 12–22 mm);
 * `thumb`: a half-round notch in the front wall's top; `dust`: dust flaps on
 * the side walls (tuck and tab).
 */
export type Closure = { style: ClosureStyle; lip?: number | null; thumb?: boolean; dust?: boolean };
export type ClosureStyle = 'tuck' | 'tuckLock' | 'tab' | 'rest' | 'glued';

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
  /** Milestone 64: a plywood strip all round is closed with a key at the corner after this wall (absent: the corner nearest the back left). */
  closeAt?: string;
  /**
   * Milestone 68: an open base (`open`): the base only places the walls (never
   * cut or joined); the walls fold off each other in one strip, glued at one
   * corner (the back left): a tube. Absent: a base that is cut.
   */
  base?: 'open';
  /** Milestone 68: how the top closes: a tuck lid folded off the back wall (`tuck`), or four flaps (`seal`); C2: a regular slotted container's flaps (`rsc`); absent: open. */
  top?: TrayTop;
  /** Milestone 68: how an open base closes: four flaps (`seal`), a snap-lock (1-2-3) bottom (`snap`), or a reverse tuck flap (`tuck`, off the front wall); C2: a straight tuck (`tuckBack`, off the back wall, as the top's) or RSC flaps (`rsc`); C3: a crash-lock (auto) bottom (`crash`); absent: open (a sleeve). */
  bottom?: TrayBottom;
  /** Milestone 65: what holds its curved walls to the base (glue teeth, tabs in curved slots, nothing); absent: by the base and material (`curveKindOf`). */
  curveKind?: 'teeth' | 'tabslot' | 'none';
  /** Milestone 71: this tray is the telescoping lid of the tray named (its base follows that box's outline, turned over on top of it). */
  lidOf?: string;
  /** A lid of its own moved by the student (milestone 76): where it lies beside its box, the corner of its outline nearest the box's front left, in the box base's coordinates. Absent: at the box's front right, 20 mm clear. */
  lidAt?: { x: number; y: number };
};

/** How a carton's top closes (milestones 68, C2). */
export type TrayTop = 'tuck' | 'seal' | 'rsc';
/** How a carton's open base closes (milestones 68, C2). */
export type TrayBottom = 'seal' | 'snap' | 'tuck' | 'tuckBack' | 'rsc' | 'crash';
export const TRAY_TOPS: TrayTop[] = ['tuck', 'seal', 'rsc'];
export const TRAY_BOTTOMS: TrayBottom[] = ['seal', 'snap', 'tuck', 'tuckBack', 'rsc', 'crash'];

/** How a tray wall was changed so its net lies flat: its glue flap trimmed, hinged off its neighbour, or cut as its own piece. */
export type TrayFix = 'trim' | 'hinge' | 'own';

export const SCHEMA_VERSION = 11;

/**
 * The 2D sketch model (milestone 102, ported from `claude/guided-mode`'s
 * SKETCH_OVERHAUL.md §5.1, used by the 2D outline editing): a graph of points
 * and segments. `SkPt.smooth`: its two curve handles stay in line. `r` / `ch`:
 * a rounded or chamfered corner (mm), only where exactly two straight lines meet.
 */
export type SkPt = { x: number; y: number; smooth?: true; r?: number; ch?: number; lock?: true };
/** A sketch segment between two points; `cons`: a construction line (never part of what is cut). */
export type SkSeg = { a: string; b: string; cons?: true } & (
  | { k: 'line' }
  /** A circular arc; bulge = tan(sweep / 4), positive = counter-clockwise from a to b (the DXF convention). */
  | { k: 'arc'; bulge: number }
  /** A cubic Bezier; handles are offsets from their own end point. */
  | { k: 'bez'; ha: P2; hb: P2 }
);
/** A 2D sketch: a graph of points and segments (a point may carry any number). `order` lists segment ids in drawing order. */
export type SketchGraph = { pts: Record<string, SkPt>; segs: Record<string, SkSeg>; order: string[] };
