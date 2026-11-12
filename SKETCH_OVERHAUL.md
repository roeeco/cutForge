# Sketch and shape overhaul: a 2D sketcher, a scale frame, and a workbench ready for folding (milestones 55–60)

Status: built (milestones 55–60, 2026-11-12), on top of milestone 54 (`3977dad`). What was decided along the way is in `DECISIONS.md`; what was checked, in `PROGRESS.md`.

This plan replaces the sketch tool of milestone 50, adds scaling to the Shape stage, and separates the shape workbench from the waffle so a second outcome (folded card or thick paper) can be added later. Read `WAFFLE_MODE.md` first; section numbers like "WM §5.5" point into it.

## 1. Why

Found on 2026-11-12 in the dev server and the code:

| Problem | Where |
|---|---|
| Clicking a shape tile only chooses the next shape. Nothing appears until the user drags on the floor, so the tiles look broken. | `src/sculpt/ui/SculptCard.tsx` (tiles), `SculptScene` in `src/sculpt/ui/SculptView3D.tsx` |
| The last confirmed height is reused for the next shape whatever its kind: after a ring (10 mm thick) a new box is 10 mm tall. | `ShapeGhostBar.ok` stores `size[1]` in `sculpt.height`; the `up` handler in `SculptScene` reads it |
| Only primitives can be resized, one axis at a time (`SizeArrows`). Extrusions, revolves, groups and several shapes cannot be resized. Nothing keeps proportions. The comment about Shift on a sphere has no code behind it. | `SizeArrows` in `SculptView3D.tsx` |
| The sketch is drawn in the perspective 3D view, as one closed outline of straight lines. Closing depends on a 10 px reach with no cue. Editing is drag a point, add a point, delete a point. | `SketchDraw`, `SketchEdit` in `src/sculpt/ui/SketchLayer.tsx`; `src/views/polyDraw.ts` |
| The page scrolls sideways at 1024 px wide (`scrollWidth` 1172). | top bar |
| `src/sculpt/ui` imports waffle UI directly, so a second outcome has nowhere to plug in. | `SculptView3D.tsx`, `SculptCard.tsx` |

All eight primitives build and render correctly; no kernel fault was found.

## 2. Decisions

| Question | Decision |
|---|---|
| Model for the sketcher | Layerling's sketch mode (`https://layerling.com/guide/sketches.html`): a flat sheet, direct editing, typed lengths and angles. **No constraint solver.** Layerling is AGPL-3.0: match behaviour, read no source, copy no code or text. |
| Where sketching happens | A new flat view, `view: 'sketch'`, built on the SVG canvas pieces lifted out of `src/views/Plan2D.tsx`. Drawing and point editing leave the 3D view. |
| Angle snap | **Reverses WM §1 "Snap angles".** Points land on the grid; Shift snaps the new line to 15° steps. Alt keeps its CutForge meaning (`noSmartSnap`, `gridSnap`: no smart snaps, 0.01 mm). Update the WM §1 row and WM §11.1 when milestone 58 lands. |
| Sketch planes | Unchanged: the floor and upright planes. Not the faces of shapes. |
| Sketch contents | Several outlines, open or closed, of lines, arcs and Bezier curves; construction lines; holes. One sketch makes one body. |
| Rounded corners | Stay a property of the point (`r`), so the radius tool and *Round all corners* keep working. Chamfer is added the same way (`ch`). |
| Scaling | One frame for any selection, in 3D and in the sketch: corner handles change two directions, side handles one, Shift or *Keep proportions* scales alike. Sizes can be typed, as sums (`60+12.5`) or percent (`150%`). |
| Placing a primitive | A click on a tile places it; a drag from the tile places it where dropped; the footprint drag on the floor stays. |
| Second outcome | Folding is **prepared, not built**: an outcome registry, an `outcome` field, face provenance and a *Faces* count. Nothing about folding is visible to users in these milestones. |
| File format | No schema bump (WM §3.4 still holds). New fields are optional; milestone-50 sketches are converted on load in `checkSculpt`. |

## 3. Rules for the implementer

- Work in milestone order. One commit per milestone, named like the existing ones (`Milestone 55: …`). Do not push or deploy.
- Edits to a design are pure functions on an immer draft, called through `apply` / `preview` + `commit` in `src/store/store.ts`. One user action is one undo step.
- Every new string goes into both `src/i18n/en.ts` and `src/i18n/he.ts` (`tests/i18n.test.ts` checks parity). Stage canvases stay `dir="ltr"`.
- Every interactive element gets a `data-testid`; stage meshes use `userData.testId` as today.
- Keep the kernel rules of WM §3.2: `manifold-3d` is imported only by `src/sculpt/kernel.ts`; kernel objects are made inside `scope()`. The 2D sketch code (`src/sketch/*`) must not need the kernel.
- Manifold API: check names and signatures in `node_modules/manifold-3d/manifold-encapsulated-types.d.ts` before using them (`project`, `slice`, `asOriginal`, `originalID`, `runOriginalID`, `faceID` are there in 3.5.4). Do not rely on memory.
- After each milestone: `npm run typecheck`, `npm test`, and a short look in the dev server (`cutforge-dev` in `.claude/launch.json`, port 5199). Do not run the full e2e suite. `tests/e2e/waffle.spec.ts` drives the old sketch flow; update its sketch steps in milestone 57 and run only that spec if Playwright is available.
- `tests/golden.test.ts` must stay green and unchanged: box designs are not touched, except for the pure refactor of `Plan2D.tsx` in milestone 57.
- After each milestone add its section to `PROGRESS.md` and its decisions to `DECISIONS.md`, as milestones 49–54 did.
- Never set or read `SITE_PASSWORD`.

---

## 4. Milestone 55: placing shapes, and the scale frame

### 4.1 Placing

Files: `src/sculpt/ui/SculptCard.tsx`, `src/sculpt/ui/SculptView3D.tsx`, `src/sculpt/ops.ts`, `src/store/store.ts`.

- New in `ops.ts`: `defaultPrimitive(kind, at: V3): Omit<Shape3, 'id' | 'name'>`: a 40 × 40 footprint through the existing `primitiveShape`, with the height from §4.2.
- New in `ops.ts`: `freeSpot(sc, w, d, near: {x, z}, step): {x, z}`: the grid point nearest `near` where a `w × d` box overlaps no top-level shape's `worldBox`; walk outward in +x in steps of `w + 10`, at most 40 tries, then give up and return `near`. `worldBox` is in `src/sculpt/ui/geom.ts`; move it to `src/sculpt/box.ts` (pure, re-exported from `geom.ts`) so `ops.ts` and `src/waffle/fixes.ts` do not import from `ui/`.
- **Click a tile** (pointer up within 4 px of pointer down): `apply` adds `defaultPrimitive` at `freeSpot` near the orbit target projected to the floor (register the target the way `stageCamera` in `SketchCard.tsx` registers the camera; add `target` beside `pos`). Select it, set the tool to `select`. No ghost: the scale frame is the way to size it.
- **Drag from a tile** (moved more than 4 px): set `sculpt.dragKind`. `SculptScene` shows a see-through shape at the pointer's floor hit (`useRayFromScreen`, grid-snapped) while it is set; pointer up over the canvas places it there, pointer up elsewhere or Esc cancels. Window listeners, as the footprint drag has.
- The tile still sets `sculpt.next`, so S and a footprint drag on the floor work as today, ghost and ✓ included.
- Tiles become `button`s with `aria-pressed` for the chosen one; label text *Click to add, or drag onto the stage* (`sculpt.tile.hint`).

### 4.2 Height memory

- `SculptUi.height: number | null` becomes `heights: Partial<Record<Primitive | 'extrude', number>>`.
- `ShapeGhostBar.ok` stores under the shape's kind, and only for `box`, `cylinder`, `cone`, `prism`, `pyramid`, `extrude`. Sphere, half sphere and ring never store or read one.
- The footprint `up` handler, `defaultPrimitive`, `SketchMode` and the sketch finish read `heights[kind]`, falling back to `min(w, d)` (primitives) or 20 (extrude).
- `replaceDesign` resets `heights` to `{}`.

### 4.3 Scale model

`Shape3` gains one optional field:

```ts
/** Stretch along the shape's own axes (x, up, z), applied to the built body before it is placed. Absent = [1, 1, 1]. */
stretch?: V3;
```

It is only used where the shape has no parameter of its own to change. New pure function in `src/sculpt/scale.ts`:

```ts
/** Scale a shape by f along its own axes (x, up, z), keeping the point `anchor` (shape-local, same axes) fixed. */
export function scaleShape(d: Design, id: string, f: V3, anchor: V3): void;
/** Scale several shapes by f along world axes about a world anchor. Returns false when that cannot be done exactly (see below). */
export function scaleShapes(d: Design, ids: string[], f: V3, anchor: V3): boolean;
/** The size the frame shows for a shape: its body's box in its own axes (x, up, z). */
export function shapeSize(sc: Sculpt, id: string): { min: V3; max: V3 } | null;
```

`scaleShape` by kind (all factors clamped so no size goes below 1 mm; uniform means the three factors agree within 1e-6):

| Kind | What changes |
|---|---|
| box, cylinder, cone, prism, pyramid, sphere, half sphere | `size` is multiplied per axis. `corners` radii are multiplied when uniform, otherwise kept (the fillet clamp in `round.ts` already trims them). |
| ring | `size[0]`, `size[2]` multiplied; `tube` multiplied by the up factor. Keep `size[1] === tube` through `updateShape`. |
| extrude | Sketch points are multiplied by the two in-plane factors; `height` by the factor along the plane's normal. Map the shape's (x, up, z) axes to sketch (x, y, normal) with `shapeMatrix`: floor sketch x → x, y → −z, normal → up; upright x → x, y → up, normal → z. Use `scaleSketch` from milestone 56; until then scale `pts` directly (`r` multiplied when uniform, kept otherwise). |
| revolve | Along the axis (sketch y): multiply sketch y. Radially: when the two radial factors agree, multiply sketch x; when they differ, multiply `stretch`. With an edge axis, always use `stretch`. |
| group | Multiply `stretch`. Members are not touched. |

`at` moves so the anchor stays fixed: `at += q · (anchor − f ∘ anchor)` in the parent's frame (reuse `qRot`).

`scaleShapes` for several shapes or a turned frame: a shape whose turn maps its axes onto world axes (every entry of its rotation matrix is 0 or ±1 within 1e-6) is scaled by the permuted factors, and its position scaled about the anchor. A shape turned any other way can only be scaled uniformly. If `f` is not uniform and such a shape is selected, return `false` and change nothing; the frame hides its side handles in that case and shows the hint *Group these shapes to stretch them* (`scale.groupFirst`).

Build and frames that must honour `stretch`:

- `src/sculpt/build.ts`: `leafBody(k, s)` result gets `.scale(s.stretch)` before `shapeMatrix`; a group's joined body gets `.scale(g.stretch)` before `m4(g.at, g.q)`. Add `'stretch'` to `GEOM_FIELDS`.
- `src/sculpt/ops.ts`: `parentMatrix` multiplies in the group's stretch (add `m4Scale(v)` to `src/sculpt/xform.ts`). `worldPose` normalises the matrix columns before `m4Quat`. `moveShapes` and `turnShapes` already work through `m4Inv(parentMatrix)`; check both against a stretched group in tests.
- `ungroupShape`: with a uniform stretch, bake it into every member (`scaleShape` about the group's origin). With a non-uniform stretch, bake it into members whose turn is axis-aligned to the group; wrap each other member in a group of one that carries the stretch. The picture never changes on ungroup.
- `src/sculpt/check.ts`: `stretch` must be three finite numbers above 0, else deleted.
- `roundable`/`cornerHeight` in `src/sculpt/sketch.ts` and `RadiusMarks`: marks are placed through the same matrix as the body, so include the stretch.

### 4.4 The frame in 3D

New `src/sculpt/ui/ScaleFrame.tsx`, replacing `SizeArrows`. Shown in stage 1 with the Select tool, for one or more selected shapes, not while a ghost is pending. `ShapeGizmo` (move, lift, rings) stays.

- One shape: the frame is its own box (`shapeSize`) drawn in its own axes, so a turned shape has a turned frame. Several shapes: the world box (`unionBox`).
- Handles, drawn with `ScreenSized` + `priorityRaycast` and dragged with `useHandleDrag` (all in `src/views/widgets.tsx`), each projected onto its axis with `closestOnLine`:
  - four bottom corners (white squares): width and depth, anchor at the opposite bottom corner;
  - four bottom side middles (dark squares): one direction, anchor at the opposite side;
  - one top centre (white cone, where the height arrow is today): height, anchor at the bottom.
- Shift, or `viewPrefs.keepRatio`, makes every handle scale all three directions by the same factor (the factor of the dragged direction). Alt scales about the centre.
- Values snap with `gridSnap(size, ev)`; `snapMove`-style snapping of the moving side to other shapes' boxes can reuse `snapMove`/`snapLift` in `geom.ts` (side handles only).
- Drag = `preview(scaleShapes…)` from the transaction base each move (compute factors from the start box, never accumulate), `commit` on release, `cancel` on Esc.
- Three `DimLabel`s (W, D, H) on the frame; committing one calls the same scale with that factor (and all three when proportions are kept).
- Card (`SculptCard.tsx`): Width, Depth, Height fields for every kind, groups and several shapes included, through `shapeSize` and `scaleShapes`; a *Keep proportions* switch (`viewPrefs.keepRatio`, saved per browser as the other prefs are).
- Percent: extend `evalNumber` in `src/ui/NumField.tsx` with an optional `base` argument so `150%` means `1.5 × base`; `NumField` passes its current value. Sums already work.

### 4.5 Layout

Find what overflows the top bar at 1024 px (`document.documentElement.scrollWidth > innerWidth` in the dev server) and fix it in `src/styles.css`; no horizontal page scroll at 1024 × 768 in English or Hebrew.

### 4.6 Tests (`tests/sculptscale.test.ts`)

- Each kind scaled by (2, 1, 1), (1, 3, 1), (1, 1, 0.5) and (2, 2, 2): the built body's `boundingBox` is the old one scaled about the anchor within 0.05 mm, and the volume scales by the product within 0.5 % (rounded corners excluded from the volume check).
- A revolve stretched radially by different factors keeps its axis and gets a `stretch`; scaled uniformly it has none.
- A group of a box and a turned (25°) cylinder stretched (2, 1, 1): bounding box doubles in x; ungroup leaves the solid's volume and box unchanged, the cylinder inside a group of one.
- `scaleShapes` returns `false` for a non-uniform factor on a 25°-turned shape, and changes nothing.
- `freeSpot` avoids an occupied spot. Heights: a ring then a box gives a box at its own default height.
- Save and open round-trips `stretch`; a bad `stretch` is dropped.

---

## 5. Milestone 56: the sketch model (pure code, no UI)

New folder `src/sketch/`: no imports from `src/sculpt`, `src/waffle`, React or the kernel, so box designs can use it later.

### 5.1 Types (`src/model/types.ts`)

```ts
/** A sketch point. `smooth`: its two curve handles stay in line. `r` / `ch`: a rounded or chamfered corner (mm), only where exactly two straight lines meet. */
export type SkPt = { x: number; y: number; smooth?: true; r?: number; ch?: number; lock?: true };
/** A sketch segment between two points. */
export type SkSeg = { a: string; b: string; cons?: true } & (
  | { k: 'line' }
  /** A circular arc; bulge = tan(sweep / 4), positive = counter-clockwise from a to b (the DXF convention). */
  | { k: 'arc'; bulge: number }
  /** A cubic Bezier; handles are offsets from their own end point. */
  | { k: 'bez'; ha: P2; hb: P2 }
);
export type Sketch = { pts: Record<string, SkPt>; segs: Record<string, SkSeg>; order: string[] };
export type ShapeSketch = { plane: 'floor' | 'upright'; v: 2 } & Sketch;
```

- It is a graph: a point may carry any number of segments. `order` lists segment ids in drawing order (stable rendering and tests).
- Ids come from `newId('p')` / `newId('g')` (`src/model/ops.ts`).
- `Shape3.axis` becomes `{ kind: 'plane' } | { kind: 'seg'; id: string }`.
- `SculptPt` stays for primitive footprints (`footprint`, `withRadii`, `fillets`).

### 5.2 Loading old sketches (`src/sculpt/check.ts`)

`shapeOk` accepts both forms. When `sketch.pts` is an array (milestone 50): make points `p0…pn` and a closed chain of segments; a point with `r` keeps it; where either end has `curve: 'auto'`, the segment becomes a `bez` with the same control points `flattenSketch` uses today (pull that maths out of `src/sculpt/round.ts` as `autoHandles(pts): { ha: P2; hb: P2 }[]`, and mark those points `smooth`). `axis: { kind: 'edge', i }` becomes `{ kind: 'seg', id: <segment i> }`. Then validate the v2 form: finite numbers, every segment's ends exist, `bulge` within ±50, `order` lists every segment once; a bad segment is dropped, a sketch with no segments fails the shape.

### 5.3 Files and functions

`src/sketch/model.ts`
- `emptySketch()`, `addPt(sk, p)`, `addSeg(sk, seg)`, `segsAt(sk, ptId)`, `degree`, `otherEnd`, `cloneSketch`, `bounds(sk, ids?)`.
- `chains(sk, { cons: false })`: maximal runs of segments through points of degree 2, each `{ segs: string[]; closed: boolean }`.

`src/sketch/flatten.ts`
- `arcOf(a, b, bulge): { c: P2; r: number; a0: number; sweep: number }` and `bulgeThrough(a, b, via): number` (three-point arc).
- `segPoints(sk, segId, tol = 0.02): P2[]`: a line is its ends; an arc is cut so every chord is within `tol` and every point is on the circle (as `arcPoints` in `round.ts` does); a Bezier is flattened by recursive subdivision to `tol`.
- `cornerCut(sk, ptId): { t1: P2; t2: P2; c?: P2; r?: number } | null`: the fillet or chamfer at a point with `r` or `ch`, valid only when exactly two non-construction lines meet there. Reuse the tangent-arc and clamp maths of `fillets` in `round.ts` (each corner takes at most 45 % of a side it shares with another cut corner).
- `flatChain(sk, chain, tol)`: the chain's polyline with corner cuts applied.

`src/sketch/regions.ts` (uses `polygon-clipping`, already a dependency)
1. Flatten every non-construction segment. Where two flattened segments from different segments cross or touch away from a shared point, add a node there (planar subdivision; do not change the stored sketch).
2. Split the graph into connected components.
3. In each component trace faces: at every node sort the outgoing edges by angle; walk each directed edge taking the next edge clockwise at each node; keep the faces with positive area. The component's filled outline is the union of its faces.
4. Nesting: component B is inside A when every vertex of B's outline is inside A's and their edges do not cross. A component's parent is the smallest one that contains it.
5. Region of a component = its outline minus the regions of its children (so an outline inside a hole is solid again). The sketch's region = the union of the regions of the root components. Two outlines that overlap without containing each other merge; the overlap is not a hole.
- `sketchRegion(sk): P2[][][]`: a multipolygon (outer rings counter-clockwise, holes clockwise), cached by content in a `WeakMap` keyed on the sketch object.
- `openEnds(sk): string[]`: points of degree 1 on non-construction segments.
- `sketchState(sk): { area: number; open: string[]; empty: boolean }`.

`src/sketch/ops.ts` (each returns `false` and changes nothing when refused; locked points never move)
- `movePts(sk, ids, dx, dy)`; `setPt(sk, id, p)`.
- `splitSeg(sk, segId, t): ptId`: a point on a segment (a line gives two lines; an arc two arcs on the same circle; a Bezier by de Casteljau).
- `removePt(sk, id)`: degree 2 joins the neighbours with a line (or a Bezier if either was curved); other degrees remove the point and its segments.
- `eraseSeg(sk, segId)`; points left with no segment are removed.
- `weld(sk, keep, drop)`: move every segment end from `drop` to `keep`; remove zero-length and duplicate segments.
- `addLine`, `addArc`, `addBez`: each can start or end on an existing point id, and calls `splitCrossings(sk, newSegId)`, which puts a shared point wherever the new segment crosses an existing non-construction one. Construction segments are never cut and never cut others.
- `setSegKind(sk, ids, 'line' | 'bez')`: *Curve line* gives each end a handle one third of the way along the chord; *Straight line* drops them.
- `setSmooth(sk, ptIds, on)`: handles at the point become collinear, lengths kept; `curveThrough(sk, ptIds)` lays Catmull-Rom handles through an ordered run of points.
- `setCorner(sk, ptIds, { r } | { ch } | null)`: returns how many points were skipped (not a corner between two straight lines).
- `transform(sk, sel, M: [a, b, c, d, e, f])`: an affine map of the selected points, with their handles and arcs. Under a map that is not a similarity, arcs are replaced by Beziers (one per 90° of sweep). `r` and `ch` are multiplied when the map is a similarity, kept otherwise. `scaleSel(sk, sel, anchor, sx, sy)` and `rotateSel(sk, sel, centre, deg)` are built on it; `scaleSketch(sk, sx, sy)` is `scaleSel` of everything about the origin (used by §4.3).
- `mirror(sk, sel, axis: { a: P2; b: P2 })`: adds mirrored copies; points on the axis are shared.
- `setLength(sk, segId, len, { fixed: ptId, both?: boolean })` and `setAngle(sk, ptId, deg, turnSeg)`: the moved end carries every point reached from it without passing a locked point or the fixed one (flood fill over the graph); refuse when that would move a locked point.
- `align(sk, chains, mode)`; `duplicate(sk, sel, dx, dy)`; `setCons(sk, segIds, on)`; `setLock(sk, ptIds, on)`.
- `stamp(sk, kind, at, opts)`: ready-made outlines as ordinary points and segments: `rect`, `circle` (two half arcs, bulge ±1), `oval` (four Beziers), `halfcircle`, `triangle`, `hexagon`, `polygon` (n sides, 3–24), `star` (n points, inner size 10–90 %). Default 20 mm across.

`src/sketch/snap.ts`
- `snapTargets(sk, { exclude, underlay }): { ends: P2[]; mids: P2[]; centres: P2[]; crossings: P2[]; body: P2[] }`: segment ends, middles of straight lines, centres of arcs and rounded corners, crossings of construction lines with anything, and the corners of the bodies shown underneath.
- `snapPoint(raw, ctx): { p: P2; kind: 'close' | 'end' | 'mid' | 'centre' | 'cross' | 'body' | 'angle' | 'grid' | 'free'; ptId?: string }`. `ctx` carries the tolerance in mm (px × mm per px), the chain being drawn, and the key state. Order: the chain's first point (12 px) → any point (10 px) → middles, centres, crossings, body corners (8 px) → with Shift, the 15° step from the last point with the length rounded to the grid step → the grid. With `noSmartSnap` only the grid rule applies, and `gridSnap` already rounds to 0.01 mm under Alt.

`src/sketch/dims.ts`: `segLength` (arc and curve lengths from the flattened points), `cornerAngle(sk, ptId)` (inside angle on a closed outline; null where a curve meets or more than two segments meet), `parsePolar("50<30")`.

### 5.4 Wiring into the shape code

- `src/sculpt/build.ts`: `sketchSection(k, sketch)` becomes `k.CrossSection.ofPolygons(rings, 'Positive')` from `sketchRegion` (flatten every ring list into one array of rings). `axisOutline` takes the region's rings; an edge axis reads the segment's two points. `crossesAxis` tests all rings. Revolve keeps its mirror rule. `footprint` shapes keep the old path (`flattenSketch` on `SculptPt[]`).
- `src/sculpt/sketch.ts`: `sketchOk` becomes `!sketchState(sk).empty`; the point edits (`moveSketchPoint`, `insertSketchPoint`, `deleteSketchPoint`, `setSketchPointKind`) are removed in milestone 57; `roundCorner` and `roundable` use `setCorner` and the points where two straight lines meet, addressed by point id.
- `RadiusMarks` keys its marks by point id for sketch shapes.

### 5.5 Tests (`tests/sketchmodel.test.ts`, `tests/sketchregions.test.ts`, `tests/sketchops.test.ts`)

- Flatten: arc points lie on the circle and chords stay within 0.02 mm; a Bezier's flattening stays within 0.02 mm of the curve at 200 samples; `bulgeThrough` round-trips.
- Regions: a square; a square with a circle inside (area = square − circle within 0.1 %); two overlapping squares (area of the union); a square inside a hole inside a square; a rectangle with a line across it (same area as the rectangle); an open chain (no area, two open ends); a construction line through a square (ignored).
- Ops: `splitCrossings` on a line across a circle makes two shared points and four circle arcs; `weld` closes a hexagon with one side erased; `removePt` keeps a closed outline closed; a non-uniform `transform` turns a circle into Beziers whose bounds are the scaled box within 0.05 mm; a uniform one keeps arcs; `setLength` moves the far end and what hangs on it, and is refused when that end is locked; `setAngle` keeps the turned line's length; `mirror` of a half outline whose ends are on the axis gives one closed outline; `setCorner` skips a point where a curve meets and reports it.
- Loading: a milestone-50 sketch (corner, curve and round points, an edge axis) builds a body with the same volume as before within 0.1 % (keep a fixture made on `3977dad`); `tests/sculptsketch.test.ts` is updated to the new form.

---

## 6. Milestone 57: the 2D sketch workspace

### 6.1 Shared canvas pieces (pure refactor)

New `src/views/canvas2d.tsx`, lifted from `Plan2D.tsx` without changing behaviour:

- `useViewBox(svgRef, key, initial)`: the `VB` state, the `savedVB` map, `svgPoint(ev)`, `mmPerPx()`, `onWheel`, `zoom(k)`, `fit(box)`, and the pan drag (middle or right button; left button when the tool is not Select).
- `Handles` gains four side handles (`side` prop, off by default so the cut plan is unchanged) and stays drawn in screen-sized units.
- `RotRing`, and the marquee rectangle as `Marquee`.

`Plan2D.tsx` imports them. `npm test` (golden included) must pass before any sketch code is added.

### 6.2 Session state (`src/store/store.ts`)

```ts
export type View = '3d' | '2d' | 'solo' | 'sketch';
export type SkTool = 'select' | 'line' | 'arc' | 'smooth' | 'bezier' | 'points' | 'erase' | 'tape';
export type SketchSession = {
  /** The shape being edited, or null for a new one. */
  shapeId: string | null;
  plane: SketchPlane;              // from src/sculpt/sketch.ts
  mode: 'extrude' | 'revolve';
  draft: Sketch;
  past: Sketch[]; future: Sketch[];
  sel: { pts: string[]; segs: string[] };
  tool: SkTool;
  cons: boolean;                   // new lines are construction lines
  dims: boolean;                   // show measurements
};
sketch: SketchSession | null;
openSketch(shapeId: string | null): void;   // sets view 'sketch', remembers prevView
sketchEdit(fn: (sk: Sketch) => unknown, opts?: { preview?: boolean }): void;  // immer on draft, own history (limit 200)
sketchUndo(): void; sketchRedo(): void;
finishSketch(): void; cancelSketch(): void;
```

- The draft is not in the design until *Finish*, so autosave and the design's history are untouched while sketching.
- `finishSketch`: one `apply`. For an existing shape it writes `sketch` and `kind` (through `setSketchMode`); for a new one it calls `addShape(sketchShape(…))` with `heights.extrude`. Then: view back to `3d`, tool `select`, the shape selected. Disabled while the region is empty or a revolve crosses its axis (`revolveBlocked`).
- `cancelSketch`: drop the session; when the draft differs from where it started, ask once (`sketch.discard`, the existing confirm pattern).
- `replaceDesign`, `undo` on the design and a stage change close the session.
- Ctrl+Z / Ctrl+Shift+Z in `src/store/hooks.ts` go to `sketchUndo` / `sketchRedo` while `view === 'sketch'`.
- `SculptUi.editSketch` and `selPoint` are removed.

### 6.3 Entering and leaving

- **New sketch:** the Sketch tool (K) in 3D keeps its card (`SketchToolCard`) with the plane choice and the `UprightPlane` handles, and gains a primary button *Draw on this plane* (Enter) → `openSketch(null)`.
- **Edit:** *Edit sketch* on the card, or a double-click on an extrusion or revolve (`onShapeDouble`; groups keep *work inside*) → `openSketch(id)`. The plane comes from the shape (`at`, `q`, `sketch.plane`).
- `App.tsx`: `view === 'sketch' && session` renders `LazySketchView` (add to `src/sculpt/ui/lazy.tsx`). The top bar's view tabs are replaced, while sketching, by the badge *Extrude | Revolve*, *Sketch undo/redo*, *Cancel* and *Finish sketch* (`TopBar.tsx`); the stage switch is disabled.
- Remove `SketchDraw` and `SketchEdit` from `SketchLayer.tsx`. `UprightPlane`, `AxisPicker`, `RadiusMarks` and `ExtrudeArrow` stay.

### 6.4 The view (`src/sculpt/ui/SketchView2D.tsx` and `src/sculpt/ui/sketch2d/*`)

An SVG, `dir="ltr"`, sketch y up (draw with `y → −y`). Layers, bottom to top:

1. **Sheet and grid:** minor lines at `viewPrefs.gridStep` (hidden when closer than 6 px), major every 10 steps, the origin cross. For a revolve, the axis: the line x = 0 or the chosen segment, dashed amber, with the label *Axis*.
2. **Underlay:** the other top-level shapes as faint outlines on this plane. In `src/sculpt/underlay.ts`: for each visible top-level shape except the one edited, `buildShape(k, sc, id).transform(inverse of planeMatrix(plane)).project().toPolygons()`, cached by `shapeKey` + plane. Its vertices are the `body` snap targets. Skip the layer when the kernel is not ready.
3. **Region fill:** `sketchRegion(draft)` as one path, 12 % tint, even-odd.
4. **Segments:** solid lines 2 px; construction lines dashed and paler; locked paler still; selected in the selection colour; open ends marked with an amber ring.
5. **Points:** white squares for corners, round for smooth points, amber for `r`/`ch` corners; handles of the selected Bezier ends as lines with round knobs.
6. **Tool overlay:** rubber band, snap marker (a blue ring at the target, with a small label: *End*, *Middle*, *Centre*, *Close*), the length and angle at the pointer.
7. **Selection frame and measurements** (milestone 59).

Around the canvas:
- **Rail** (reuse the rail's styling from `SculptRail.tsx`): Select V, Line 1, Bezier 2, Smooth curve 3, Add/remove points 4, Arc A, Add shape (menu), Erase E, Construction line (toggle), Tape measure.
- **Preview** (`sketch2d/Preview3D.tsx`, lazy): a 240 × 180 inset, bottom right, with its own small R3F `Canvas` and `OrbitControls`. It builds the draft as a one-shape `Sculpt` (`buildShape` on `{ shapes: { tmp }, order: ['tmp'] }`) 120 ms after the last change and shows the other shapes dimmed. A double-click resets its view. It can be folded away.
- **View keys:** wheel zooms about the pointer; middle or right button pans; Home fits the sketch; F fits the selection; + and − zoom.
- **Hint line** at the bottom, as the other views have.

### 6.5 Tests

- `tests/sketchsession.test.ts`: open on a shape, edit, undo, redo, finish → the design's history has exactly one new entry and the shape's body changed; cancel leaves the design object identical; a new sketch on an upright plane becomes a revolve only when chosen.
- Update the sketch steps of `tests/e2e/waffle.spec.ts`.
- Dev look: draw nothing yet (tools come next); open an existing extrusion, see its outline, the underlay and the preview, pan and zoom, Finish and Cancel.

---

## 7. Milestone 58: drawing tools

All tools share one pointer path in `sketch2d/useSketchPointer.ts`: pointer → `svgPoint` → sketch coordinates → `snapPoint` → the tool's handler. A point is placed on pointer up when the pointer moved under 4 px (as milestone 50 does), so a pan never adds a point.

### 7.1 Line (1) and the chain

State: `{ first: ptId; last: ptId; n: number }`.
- Each click adds a point (or uses the existing one it snapped to) and a line from `last`; `addLine` puts points at crossings.
- **Closing:** once the chain has two segments, its first point is drawn larger (6 px → 9 px), with a ring, and the label *Close shape* when the pointer is within 12 px; the rubber band jumps to it and the region tint previews the closed shape. A click there closes the outline and ends the chain; the tool stays on Line.
- A click on any other existing point joins it and ends the chain there too.
- Enter closes the chain to its first point when it has two segments or more. A double-click on the last point, or a right-click without moving, ends it open. Esc ends it open and keeps what is drawn; a second Esc picks Select. Backspace removes the last point.
- Shift: 15° steps from the last point, length in grid steps.
- **Numbers:** typing a digit while a chain is open shows two fields at the pointer, *Length* and *Angle*. `<` or Tab moves to the angle; Enter places the point (`parsePolar`, sums through `evalNumber`); an empty angle follows the pointer; Esc closes the fields and keeps the chain. Angles count counter-clockwise from the right.
- With *Construction line* on, new segments get `cons`.

### 7.2 Other tools

- **Arc (A):** two clicks for the ends, a third for a point the arc passes through (`bulgeThrough`); a preview and the radius follow the pointer. Ends snap onto existing points, so an arc can close an outline. Esc drops the clicks so far.
- **Smooth curve (3):** clicks as for Line; every segment is a Bezier and after each click `curveThrough` relays the handles of the chain. Closes and ends as Line does.
- **Bezier (2):** click and drag: the drag sets the point's out-handle (and the mirrored in-handle); a plain click leaves a corner.
- **Add shape:** a menu of the `stamp` kinds with *Sides / points* and *Star inner size* at the bottom. A click stamps at the middle of the view; a drag from the menu places it at the drop point, snapping its centre.
- **Add/remove points (4):** a click on a segment → `splitSeg`; a click on a point → `removePt`.
- **Erase (E):** a click on a point or segment removes it; a drag box removes what is inside.
- **Tape measure:** two clicks; shows the distance; changes nothing.

Digit keys choose tools only while no chain is open; with Select and something selected, 1 makes lines straight and points corners, 2 makes lines curves, 3 makes points smooth.

### 7.3 Open ends

- The view's status line says *2 open ends* and rings them. *Finish sketch* builds the body from closed outlines only and is disabled when there are none.
- Dragging an open end onto another point (Select) welds them within 10 px: the snap marker says *Join*.

### 7.4 Tests (`tests/sketchdraw.test.ts`, on the tool reducers, no DOM)

Write each tool as a pure reducer `(state, event) → { state, edits }` so it can be tested without a browser.
- Four clicks and a click on the first point give a closed outline with four segments and a region; Enter does the same; a right-click leaves it open with two open ends.
- Typed `50<30` puts the point at (43.30, 25.00) from the last one.
- Shift gives multiples of 15°. Under Alt the point is not on the grid.
- A line across a rectangle makes two points on its sides. An arc's third click gives the expected radius.
- Smooth curve through four clicked points closed on the first has no corner (handles in line at every point).

---

## 8. Milestone 59: select and edit

### 8.1 Selecting

- A click on a point or segment selects it; a click inside a closed outline selects the whole outline (all its points and segments; inside a hole, the hole); Shift-click adds or removes; a drag on empty space is a marquee.
- Dragging moves the selection; a segment moves by its two ends. Shift keeps the move on one axis. The selection's middle snaps to the targets of §5.3; a dragged point ignores the middles of its own lines.
- Arrow keys move by one grid step, Shift by ten. Locked points do not move, and a move that includes one is refused.

### 8.2 The frame

For a selection with two points or more: the box around it, with `Handles` (four corners and four sides) and rotate arrows beyond the corners.
- Corner: width and height together; Shift or *Keep proportions* (`viewPrefs.keepRatio`, the same switch as in 3D) keeps the proportions. Side: one direction. Alt scales about the middle. All through `scaleSel` from the state at drag start.
- Rotate: `rotateSel` about the middle; inside the ring the turn snaps to 22.5°, outside it goes in whole degrees, Shift gives 15° steps; the angle shows at the pointer. R turns a selected closed outline by 45°.
- Width and height pills on the frame; a click lets the user type a size, a sum or a percent.

### 8.3 The bar above the sketch (`sketch2d/SketchBar.tsx`)

Shown for the current selection:
- always: X and Y of the selection's middle (mm from the origin, Y up), W and H, *Keep proportions*;
- two outlines or more: align left, centre, right, top, middle, bottom;
- points: *Corner* / *Smooth*; *Fillet corner* and *Chamfer corner* with a field and ✓ (several corners at once; the message says how many were skipped); *Lock* (Ctrl+L);
- segments: *Curve line* / *Straight line*; *Construction* / *Make a line*; with three points or more, *Curve through points*;
- anything: *Mirror* (Left–right, Top–bottom, or Across a line, then click the line), Duplicate, Delete.
- one point: its X and Y; one handle: *Handle X*, *Handle Y* (offsets from its point); arrows move a clicked handle by a grid step.

### 8.4 Measurements

- A selected straight line shows its length in a pill; a selected point shows the lengths of its lines and, where two straight lines meet, the angle with a small arc, plus the angles at the two neighbouring corners.
- A click on a length pill: type a length; Enter applies `setLength` (start fixed; the selected end moves when an end is selected; Alt+Enter grows both ways); Esc cancels. Curves show a length that cannot be typed.
- A click on an angle: type an angle; the line that will turn is dashed; Tab switches to the other; Enter applies `setAngle`.
- *Show measurements* in the rail hides them all.

### 8.5 Clipboard and keys

Copy, cut, paste, duplicate (pasted geometry lands 10 mm away on a spot where it touches nothing, and stays selected), Delete. Keys in sketch mode are handled by a `sketchKey(e)` beside `sculptKey` in `src/sculpt/ui/commands.ts`, called from `src/store/hooks.ts` when `view === 'sketch'`.

### 8.6 The radius tool in 3D

Unchanged for the user: `RadiusMarks` lists the corners `setCorner` accepts, and a click sets `r` on that point id.

### 8.7 Tests (`tests/sketchedit.test.ts`)

- A corner drag with *Keep proportions* scales both directions alike; a side drag changes one; a typed `150%` width with proportions kept changes the height too.
- A click inside a ring's hole selects the inner outline only.
- Align centre both ways puts two circles on one centre.
- `setLength` and `setAngle` through the pills' handlers; a locked corner is worked around.
- Fillet on a selected rectangle rounds four corners alike; on a selection with a smooth point it reports one skipped.
- Paste lands clear of existing geometry.

Dev look: draw an L shape, close it, round a corner, type a side's length, scale it with Shift, finish, see the body; reopen it by double-click.

---

## 9. Milestone 60: outcomes, and what folding will need

Folding itself (unfolding faces into nets, glue tabs, score lines) is a later plan; `MODEL_MODES_RESEARCH.md` holds the research. This milestone only makes room for it.

### 9.1 An outcome registry

- `Design.outcome?: 'waffle' | 'fold'`; absent means `'waffle'`. `Design.kind` stays `'waffle'` in files (it now means *a sculpture design*); add `isSculpture(d)` in `src/sculpt/ops.ts` and use it where code means "has shapes" rather than "is sliced".
- `src/model/pieces.ts`: `WaffleHooks` / `registerWaffle` become `OutcomeHooks` / `registerOutcome(id, hooks)` with the same members; `buildPieces`, `validate`, the export dialog and the submit dialog look the hooks up by `d.outcome ?? 'waffle'`. Keep `waffleHooksNow` as a thin alias until its callers are moved.
- New `src/sculpt/outcomes.ts`:

```ts
export type OutcomeUi = { id: 'waffle' | 'fold'; nameKey: string; Layer: React.ComponentType; Card: React.ComponentType; Bar?: React.ComponentType; load: () => Promise<unknown> };
export function registerOutcomeUi(o: OutcomeUi): void;
export function outcomeUi(id: string): OutcomeUi | undefined;
```

- `src/waffle/load.ts` registers the waffle's `WaffleLayer`, `WaffleCard` and `StepsBar`. `SculptView3D.tsx` and `SculptCard.tsx` render `outcomeUi(...)` and no longer import from `src/waffle`. `lazyHandlers.deleteSlice` in `commands.ts` moves into the registry as an optional `onDelete`.
- `SculptUi.stage` becomes `'shape' | 'make'`; the top bar shows *1 Shape · 2 Waffle* as today while only one outcome is registered, and *2 Make* with a chooser in the stage-2 card once there are two. No fold entry is registered in this milestone, so users see no change.

### 9.2 Face provenance (`src/sculpt/faces.ts`)

Folding needs to know which flat or developable face each part of the surface came from.

- In `leafBody`, call `asOriginal()` on each leaf body and keep `originalID() → shape id` in a map beside the shape cache (ids are per kernel session; rebuild the map when a body is rebuilt).
- `solidFaces(k, sc): Face[]` reads `getMesh()` of the solid (`runOriginalID`, `runIndex`, `faceID`) and groups triangles into faces by run and `faceID`:

```ts
export type Face = { shapeId: string; faceId: number; tris: Uint32Array; kind: 'flat' | 'ruled' | 'curved'; normal?: V3 };
```

- `kind`: `flat` when the triangles are coplanar within 0.01 mm. Otherwise by source: the wall of a cylinder, cone, or of an extrusion along an arc or curve is `ruled` (it unrolls without stretching); a sphere, half sphere, ring, or a revolve of a curved profile is `curved` (it does not).
- `foldable(sc): { ok: boolean; curved: string[] }` lists the shapes that have `curved` faces.
- Check in the type file how `faceID` survives booleans in 3.5.4 before relying on it; if coplanar faces are merged across shapes, split them by `runOriginalID`.

### 9.3 A *Faces* count

- `Shape3.facets?: number` (3–64): when set, a cylinder, cone, sphere, half sphere, ring and revolve use it in place of `circleSegments`, and the arcs and curves of an extrusion's sketch are cut into that many pieces per quarter turn in place of the 0.02 mm rule. Add it to `GEOM_FIELDS` and `check.ts`.
- No field on the card yet; it is set only by tests and, later, by the fold outcome.

### 9.4 Tests (`tests/outcomes.test.ts`, `tests/sculptfaces.test.ts`)

- With only the waffle registered, pieces, checks and the thumbnail are what they were (`tests/waffle*.test.ts` unchanged).
- `src/sculpt/**` has no import from `src/waffle/**` (a test that greps the folder).
- A box gives six flat faces naming the box; a box with a cylinder Hole grouped in it gives flat faces plus one ruled face naming the cylinder; a sphere gives a curved face and `foldable` lists it.
- `facets: 12` on a cylinder gives a 12-sided prism whose volume matches the formula for one.

---

## 10. Order, size and risks

| Milestone | Depends on | Size |
|---|---|---|
| 55 Placing and the scale frame | none | medium |
| 56 Sketch model | none (55 uses `scaleSketch` once it exists) | large; the region tracing is the hard part |
| 57 Sketch workspace | 56 | medium |
| 58 Drawing tools | 57 | medium |
| 59 Select and edit | 58 | large |
| 60 Outcomes | 55 | small to medium |

Risks, and what to do about them:
- **Region tracing on curved, touching or nearly coincident segments.** Work on the flattened polylines only; merge nodes closer than 1e-6 mm; drop faces under 0.01 mm². If a sketch still fails, fall back to the union of its closed chains and report it in `sketchState`.
- **`stretch` on groups** makes `parentMatrix` non-rigid. Every user of `worldPose`, `parentMatrix` and `m4Quat` must be checked: `ShapeGizmo`, `ScaleFrame`, `RadiusMarks`, `sketchMatrix`, `addShape` into a group, `ungroupShape`, and `src/waffle/fixes.ts`.
- **A sketch opened on a shape inside a stretched or turned group.** Its plane comes from `sketchMatrix`; if that matrix is not a rigid move, open the sketch in the shape's own frame and hide the underlay.
- **Two canvases at once** (the sketch's preview and nothing else): the main 3D canvas is unmounted while `view === 'sketch'`, so only one WebGL context is live.
- **Bundle size:** the sketch view and its preview are lazy chunks; box designs must not download them (check `npm run build` output as milestone 49 did).

## 11. Not in this plan

- Freehand drawing, picture templates and tracing, sweep along a path, strokes, notes.
- Sketching on the face of a shape.
- A constraint solver or stored dimensions.
- Folding: unfolding, tabs, score lines, and its stage-2 UI.
- Using the new sketcher for box designs' outlines.
