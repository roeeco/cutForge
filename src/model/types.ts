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

export type DetailShape = 'rect' | 'roundrect' | 'circle';
export type DetailOp = 'cut' | 'engrave' | 'score';

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
};

export type Panel = {
  id: string;
  name: string;
  /** Nominal outline: rectangle (0,0)-(w,h) in local coordinates. Edges: 0 bottom, 1 right, 2 top, 3 left (CCW). */
  w: number;
  h: number;
  frame: Frame;
  details: Detail[];
};

export type EdgeRef = { panelId: string; edge: number };

export type ConnectionKind = 'finger' | 'butt';

/**
 * A connection owns the relationship between two panel edges and regenerates
 * both sides. `a` is the parent edge, `b` the child edge (child edge 0 runs
 * the same direction as the parent edge).
 */
export type Connection = {
  id: string;
  kind: ConnectionKind;
  a: EdgeRef;
  b: EdgeRef;
  /** Angle between child and parent panel, degrees (see DECISIONS.md). */
  angle: number;
  /** Which face of the parent the child rises from. */
  dir: 'up' | 'down';
  /** Requested finger count (odd, >=3). null = automatic from target width. */
  fingers: number | null;
};

export type SheetPlacement = { sheet: number; x: number; y: number; rot: 0 | 90; manual: boolean };

export type PieceSettings = { quantity: number };

export type Design = {
  schemaVersion: number;
  id: string;
  name: string;
  material: MaterialProfile;
  panels: Record<string, Panel>;
  /** Display/creation order of panels. */
  order: string[];
  connections: Record<string, Connection>;
  pieces: Record<string, PieceSettings>;
  /** Sheet placements keyed by `${pieceKey}#${copyIndex}`. */
  placements: Record<string, SheetPlacement>;
  sheetSpacing: number;
  sheetMargin: number;
};

export const SCHEMA_VERSION = 1;
