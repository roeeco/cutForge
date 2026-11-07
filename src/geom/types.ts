// Core 2D geometry types. All units are millimetres (floating point), y-up.

export type Vec2 = { x: number; y: number };

/** A straight segment from a to b. */
export type LineSeg = { k: 'L'; a: Vec2; b: Vec2 };
/**
 * A circular arc from a to b around centre c with radius r.
 * ccw = true means the arc runs counter-clockwise (positive angle) from a to b.
 * A full circle is represented by two half arcs.
 */
export type ArcSeg = { k: 'A'; a: Vec2; b: Vec2; c: Vec2; r: number; ccw: boolean };
export type Seg = LineSeg | ArcSeg;

/** A chain of segments. Closed contours end where they start. */
export type Contour = { segs: Seg[]; closed: boolean };

/** Operation a contour stands for in the cut file. */
export type Op = 'cut' | 'score' | 'engrave' | 'guide';

/**
 * A contour tagged with its operation and role.
 * role 'outer' = a piece's outside boundary, 'hole' = interior cut-through,
 * 'line' = open score/guide line, 'fill' = engraving area (closed, filled by LightBurn).
 */
export type TaggedContour = {
  op: Op;
  role: 'outer' | 'hole' | 'line' | 'fill';
  contour: Contour;
  /** Source reference for validation/selection (panel id, detail id...). */
  ref?: { panelId?: string; detailId?: string; pieceKey?: string; foldId?: string };
};

/** 2D rigid transform: rotate by `rot` radians, then translate. Optional mirror on x before rotation. */
export type Xform2 = { tx: number; ty: number; rot: number; mirror?: boolean };

export const GEOM_EPS = 1e-6; // geometric tolerance (mm)
export const CURVE_TOL = 0.01; // curve approximation tolerance (mm)
export const DISPLAY_PRECISION_STUDENT = 1; // decimals (0.1 mm)
export const DISPLAY_PRECISION_MATERIAL = 2; // decimals (0.01 mm)
export const SNAP_PX = 10; // screen-space snap distance (pixels)
