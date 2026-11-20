# CutForge: from shapes to folds and boards — plan (milestones R0–R12)

Status: plan, 2026-11-20. Nothing here is built.

**Read first.**
- **Base:** `origin/claude/modest-ride-j5iqa3` at `779c3ac` (milestones 92–109 and 111 built, 110 in progress). This plan was written there. `origin/main` is at `1917440` (milestone 91 and the fold overhaul); everything named below as "on main" is also on that branch.
- **Numbers:** `ROADMAP.md` §5 reserves 92–118. This plan's milestones are named by letter (R for *reassemble*) and numbered **119–131** in `ROADMAP.md` §5.3, which this commit adds.
- **Where the shape modeller is now.** The primitive modeller (`src/sculpt/`, about 4,900 lines with the waffle) is built but **not live**. It sits on `claude/waffle-mode`, open as PR #6 (milestones 49–60). The local branch has one more commit than PR #6: `e450c6b`, *hands-on fixes to the sketch and shape tools*. The kernel is `manifold-3d` 3.5.4. Its WASM is bundled by Vite as a local asset, with no CDN, so it works offline once the app's files are cached.
- **References:** SketchForge-3D (`Formsmith746/SketchForge-3D`) and layerling (`henmedia/layerling`). **Both are AGPL-3.0, so they are behaviour references only.** Under `THIRD_PARTY.md`, nothing may be copied or translated from them. CutForge is a closed web app, and adopting AGPL code would oblige it to publish its whole source. Every idea taken from them is re-designed here in CutForge's own terms and named in §2.4.

**The mission (owner, 20 November).** *A Tinkercad-inspired environment that, at the click of a button, turns the resulting shape into a panel or folded assembly.* Two rules follow from it, and every section below serves them:
1. **The shape stage is a Tinkercad-style workplane**: drop a shape, drag it to size, make it a hole, group. It is the main place a student works (R1, R2).
2. **One click makes it.** *Fold it* and *Build from boards* sit on the shape stage's bar. One click gives a finished, cuttable assembly with every choice made automatically: material, facets, net, flaps, joints and seam numbers. All the controls of §5 are refinements after the click, never questions before it. A student who never opens the Make card still gets a model that cuts and assembles.

**The idea in one paragraph.** A student builds a form from ready-made shapes: boxes, prisms, wedges, extrusions of sketches, Solid and Hole, groups. CutForge then **reassembles that form in the dieline engine CutForge already has**. Each flat face of the solid becomes a CutForge board: a `Panel` with a frame and an outline. Each shared edge becomes a CutForge `Connection`:
- for card, a **fold** where the net stays joined, and a **glue flap** or **slit lock** where it is cut;
- for plywood or corrugated, a **finger joint**, **tab and slot** or **butt** joint.

From there everything is the engine everyone already uses: creases where the mid-planes meet, flaps, the cut plan, nesting, labels, checks, SVG and DXF, the spec sheet. There is no second geometry path and no second exporter. The two new parts of the engine are:
- a **face graph** (`src/model/polyhedron.ts`), which turns a solid into named flat faces and shared edges;
- an **unfolder and reassembler** (`src/model/unfold.ts`, `src/model/reassemble.ts`), which turn a face graph into panels and connections.

Both are pure, take no kernel, and could later take a hand-built box or an imported mesh.

---

## 1. What is already there, so it is not rebuilt

| Need | State | Where |
| --- | --- | --- |
| Primitives: box, cylinder, cone, prism, pyramid, sphere, half sphere, torus, extrude, revolve | Built, not live (PR #6) | `src/sculpt/build.ts` `leafBody`, `ops.ts` `PRIMITIVES` |
| Solid / Hole, group / ungroup, scale, turn, rounded footprint corners | Built, not live | `src/sculpt/ops.ts`, `scale.ts`, `round.ts`, `tree.ts` |
| Sketches on the floor and on upright planes, extruded or revolved | Built. The engine is ported to this branch (milestone 102) | `src/sketch/*`; `src/sculpt/session.ts`, `sketch.ts` |
| A slot for outcomes after the shape stage (*1 Shape · 2 Make*), with `'fold'` reserved | Built, not live (milestone 60) | `src/sculpt/outcomes.ts`; `Design.outcome?: 'waffle' \| 'fold'`; `OutcomeHooks` in `src/model/pieces.ts` |
| Where each face came from (shape id plus manifold `faceID`), and whether it is flat, ruled or curved | Built, not live (milestone 60, §9.2 of `SKETCH_OVERHAUL.md`) | `src/sculpt/faces.ts` `solidFaces`, `foldable` |
| A per-shape *Faces* count for curved shapes ("for folding later") | Built, with no card field | `Shape3.facets` |
| Panels on any 3D frame | Built | `Frame = { o, u, v, side }`, `src/model/frame.ts` |
| Free polygon outlines | Built, for root panels only | `Sketch { kind: 'poly' }`, `addPolygonPanel`, `addPlacedOutline` |
| A fold between two panels that were not grown from each other | Built, for tray corners only (30–150°) | `hingeOf`, `cornerFoldXform` in `pieces.ts`; `cornerFit` in `seams.ts` |
| Crease placement at any angle | Built (the fold overhaul) | `src/model/crease.ts` `creaseDepths`, `foldLay` |
| Glue flaps and slit locks on closing seams | Built | `cornerGlue`, `grownGlue` ("works at any angle"), `slitLock` in `seams.ts`; `autoConnect` |
| Corner joints at 30–150°, including angled fingers | Built | `cornerFit`, `cornerDepths`, `connectionsFor`; `POLYGONS_AND_CUTS.md` §7 |
| Net overlap check, the 3D fold preview, nesting, export | Built | `netOverlaps`, `views/foldView.ts`, `nest.ts`, `export/prepare.ts` |
| Inside or outside sizes | Built (93) | `src/model/boxSize.ts`, `Design.sizeAs` |
| The edge-feature registry | Built (111) | `src/model/edgeFeatures.ts` |
| The Net view | Planned (113) | `DIELINE_DNA_PLAN.md` D1 |

## 2. What is missing

### 2.1 In the engine

| # | Gap | Evidence |
| --- | --- | --- |
| E1 | **No operation makes a panel with an arbitrary outline on an arbitrary frame.** `PanelPlace` is `flat` or `standing`, and grown children must be `WallSketch` quads on the parent's edge. | `types.ts` `PanelPlace`, `WallSketch`; `ops.ts` `growPanel`, `addPolygonPanel` |
| E2 | **A fold between two free panels exists only as a tray corner**, inside `cornerFit`'s 30–150°. A faceted cylinder needs folds at 150–175°. A pyramid's apex can need folds under 30°. | `seams.ts` `MIN_CORNER`/`MAX_CORNER` :47; `netFolds` `hingeOf` |
| E3 | **No unfolder.** Nets come from the grow tree. Nothing picks which edges of a closed solid stay folded and which are cut. | `netGroups` walks grown folds; a cycle leaves a child as its own piece (`pieces.ts` :164) |
| E4 | **Outside 30–150° a closing seam gets only butt or glue**, and card glue on a very shallow seam is untested. | `connectionsFor`; `DECISIONS.md` :121 |
| E5 | **Holes through a face** (a window, a through-hole wall) have no path from a polygon with holes into a panel. | `Panel.details` holds cut-outs, but no op builds them from rings |

### 2.2 In the shape modeller

| # | Gap | Evidence |
| --- | --- | --- |
| S1 | `solidFaces` gives triangle lists per face: **no outlines, no shared edges, no angles**. | `faces.ts` `Face = { shapeId, faceId, tris, kind, normal? }` |
| S2 | **Face ids are manifold's**, not stable across a resize or a change of faces count, so nothing a student sets on a face survives an edit. | manifold `faceID` is per original triangle set |
| S3 | **Few shapes are both flat-faced and useful:** no wedge, roof, taper, frustum box, loft between two outlines, hull, or chamfered edge. | `ShapeKind` |
| S4 | **Placing and sizing are drag-first.** No typed dimension on the handles, no placing a shape onto another's face, no align or mirror handles. | `SculptView3D.tsx`, `SculptCard.tsx` |

### 2.3 In what the student sees

There is no way to choose *fold it* or *build it from boards*, to see which parts are curved and how many faces they become, to pick a face to leave open, or to pick an edge to cut instead of fold.

### 2.4 What the two references show (behaviour only)

| Behaviour | Seen in | Taken as |
| --- | --- | --- |
| Dimension labels on the handles (width, depth, height, lift) that open a typed box on click; move readouts (ΔX, ΔZ) that stay after the drop and can be typed into, Tab between them | SketchForge | R2 *typed sizes* |
| A workplane on any clicked face (W); new shapes, nudges and turns follow it; *Drop to workplane* (D) | SketchForge; layerling's *Set down on faces* (a new shape lies down on the face under the pointer, sloped ones too) | R2 *place on a face* |
| Taper (top and bottom length and width) on boxes and prisms; wedge; roof | SketchForge; layerling's *Slope and narrow along* | R2 *flat-faced shapes* |
| Loft from one outline to another (square to round, with straight walls) | layerling | R2, as a flat-faced loft between two polygons (a round end is faceted) |
| Hull of the selected shapes | layerling | R2: the quickest way to a low-poly form that folds well |
| Chamfer an edge (stays flat-faced); fillet left out | both | R2, on straight edges of boxes, prisms and extrusions only |
| Align with min / centre / max dots, a locked shape as the anchor; mirror handles | SketchForge; layerling's *Match sizes* (Alt-drag stretches) | R2 |
| Snapping to other shapes' edges and centres while moving, with a guide line | layerling | R2 |
| A protractor between two faces (*45° · 135°*) | layerling | R2, and reused in Make to show why a corner cannot be a finger joint |
| Hollow with chosen sides open | layerling | R9, as *leave a face open*. Card and boards are already shells, so this is a choice of openings, not a wall thickness. |
| Split a body with a plane, or stretch it there | layerling | R9 *a lid by a cut*; stretch is left for later |
| Edit group (E) opens a group in place | layerling | R2 |
| A challenge panel: steps with required dimensions, a snap chip, a picture, a coachmark (with no automatic check) | SketchForge | Later, for Guided, with an automatic check (§10) |
| Many undo states, a held arrow key as one undo step, 1 mm nudge (Shift 5 mm) | SketchForge | R2, through CutForge's own history |

Left out on purpose: threads, gears, textures, fillets on 3D edges, STEP and meshes made exact. None of them fold or cut from flat stock.

---

## 3. Decisions (defaults; change them here before work starts)

| # | Topic | Decision |
| --- | --- | --- |
| 0 | One click | **Two buttons on the shape stage's bar: *Fold it* and *Build from boards*.** A click runs §4's whole pipeline with defaults: the design's material (or card for *Fold it*, plywood 3 mm for *Build from boards*), facets by decision 4, the net by decision 8, joints by decision 7. The view switches to the made model, folding together in 3D, with *Back to shape* beside it. No dialog comes before the result; any problem left is listed after it with a one-click fix. |
| 1 | Where it lives | **A sculpture design** (`Design.kind = 'waffle'`, read as *has shapes*; `isSculpture(d)`), stage **1 Shape · 2 Make**. Make offers *Fold it* (card, corrugated), *Boards* (plywood, corrugated) and *Slices* (the waffle). Each choice is shown only for the materials that can make it. |
| 2 | What Make produces | **Ordinary panels and connections, stored in `Design.panels` / `connections`.** After Make, the design is a box design with its shapes attached. Every Workshop tool works on the result: joints, flaps, text, cut-outs, the cut plan, Net view (113), artwork (115). Waffle pieces stay derived, as today. |
| 3 | Linked to the shape | **Linked.** Each made panel carries `src` (the face key, §4.2); each made connection carries the edge key. When the shape changes, *Update from shape* rebuilds and **carries the student's work across by key**: joint kinds, fold/cut per edge, faces left open, hand-added details. *Detach* (one-way) turns it into a plain box design. |
| 4 | Curved faces | **Faceted.** A curved or ruled face becomes N flat faces. N comes from *Faces around a curve* (default 12 per full turn for card, 8 for boards), settable per shape in Make. It never changes the shape stage's smooth look. Smooth bent walls are a separate, later milestone (R11), with a spike first. |
| 5 | The shape is | **The outside.** Boards stand inside the faces (material inward), so the made model has the shape's outside sizes. *Inside* is offered through `Design.sizeAs` (93) for boards only. |
| 6 | Seams on card | **Glue flaps** by default; *Slit locks* where a seam is long enough (`slitLock`'s minimum). The flap goes on the face with the smaller area-to-perimeter ratio, and alternates along a chain of cut edges. |
| 7 | Joints on boards | **`autoConnect` as it is**, so finger joints at 90° and angled fingers inside 30–150°. Outside that range: *glue* on corrugated, a listed problem with fixes on plywood (R7). |
| 8 | The net | **Fewest pieces that fit the sheet**, with no overlaps, flaps included in the overlap test. A *Fewer cuts* option weights long edges to stay folded. The result is deterministic: the seed is the design id, so a reload gives the same net. |
| 9 | Code from the references | **None.** Behaviour only (Read first). The unfolding research in `MODEL_MODES_RESEARCH.md` §3 still applies; the Blender add-on and PolyZamboni are GPL and also behaviour only. |
| 10 | Levels | **Workshop only** at first. Every new feature row is `'hide'` in Guided and Quick build (rule 4b of `ROADMAP.md` §5). A Guided path through shapes is §10's first later item. |
| 11 | The port | **By path, never a merge** (`ROADMAP.md` §5.2 row 14). `src/sculpt/*`, `src/waffle/*`, the kernel and their tests are brought from the local `claude/waffle-mode` at `e450c6b`, and that branch is named in the commit. The waffle comes along unchanged: it is the first outcome, and the stage bar, outcome registry and design type are built around it. PR #6 is then closed as superseded, not merged. |

## 4. Architecture

### 4.1 Layers

```
src/sculpt/          shapes, kernel (manifold-3d), shape UI          imports src/model types only
  polyhedron.ts      solid → Polyhedron  (the one kernel-touching step of this plan)
src/model/           the engine, never imports src/sculpt
  polyhedron.ts      Polyhedron type; tidy (merge coplanar, split T-junctions, drop collinear); checks
  unfold.ts          Polyhedron → which edges fold, islands, flap sides, flat layout
  reassemble.ts      Polyhedron + MakeSpec (+ previous design) → panels + connections, then solve()
src/make/            the Make stage's UI (card, 3D picking, issues); registers outcomes 'fold' and 'boards'
```

`src/model/*` stays free of WASM. The engine tests run on hand-written polyhedra (a cube, a prism, an L-prism, a house), and only the bridge tests need the kernel.

### 4.2 The face graph

```ts
// src/model/polyhedron.ts
export type FaceKey = string;   // stable: `${shapeId}:${role}`, roles below; merged faces join their keys with '+'
export type EdgeKey = string;   // `${faceKeyA}|${faceKeyB}` sorted, plus `#n` when two faces share more than one edge
export type PFace = {
  key: FaceKey;
  /** The face's plane frame: o on the plane, u and v in it, n = u × v pointing out of the solid. */
  frame: { o: V3; u: V3; v: V3 };
  outer: P2[];            // counter-clockwise in (u, v)
  holes: P2[][];          // clockwise
  /** Where it came from: one or more (shape, role) pairs, and whether it is a facet of a curve. */
  src: { shapeId: string; role: string }[];
  facetOf?: 'ruled' | 'curved';
};
export type PEdge = {
  key: EdgeKey; a: FaceKey; b: FaceKey;
  p: V3; q: V3;           // ends, in a's winding order
  /** Angle inside the solid between the faces, 0–360° (90 for a box, 270 for an inside corner, 180 never: those faces are merged). */
  dihedral: number;
};
export type Polyhedron = { faces: Record<FaceKey, PFace>; edges: Record<EdgeKey, PEdge>; issues: PolyIssue[] };
```

**Face roles (`S2`).** A role is read from the face's normal and centre in the shape's own frame, which `faces.ts` already computes:

| Shape | Roles |
| --- | --- |
| box, wedge, tapered box | `top`, `bottom`, `+x`, `-x`, `+z`, `-z` (a wedge's slope is `slope`) |
| prism, pyramid, frustum | `top`, `bottom`, `side0` … `side{n-1}` |
| extrude | `top`, `bottom`, `seg:<sketch segment id>`; a facet of an arc is `seg:<id>/f<k>` |
| cylinder, cone, revolve, sphere, torus | `cap0`, `cap1`, `f<i>` / `f<i>.<j>` by facet index |
| hull, loft | `h<k>`, sorted by normal direction (stable while the shape keeps its faces) |
| a face left by a Hole | the Hole's own key, prefixed with `hole:` |

So resizing a box, moving a sketch point or changing the facet count keeps every key that still exists. A key that has gone drops its overrides, and that is listed (R8).

**Bridge (`src/sculpt/polyhedron.ts`).** It runs in one `scope`:
1. `buildSolid` with Make's facet counts. `facets` is applied on a copy of the shapes, never stored on them.
2. `getMesh()` and `merge()` give shared vertices.
3. Triangles are grouped by `solidFaces` (run + `faceID`, merged by plane).
4. Each face's boundary edges are walked into rings.
5. Edges are paired across faces, and each edge's dihedral is read from the two normals and the solid's side.

**Tidy (`src/model/polyhedron.ts`):**
- merge adjacent faces that lie in one plane within 0.05°, also across shapes (a box flush on a box);
- split every edge at every vertex on it, so T-junctions pair up;
- drop collinear points within 0.01 mm;
- list slivers (narrower than 3 t), tiny faces (under 4 t²) and faces inside the solid's outline (`hole:` faces).

### 4.3 The engine changes

**Free boards (E1, E5).**
- `addFreePanel(d, { frame, outer, holes, side, src }): [Design, id]` in `ops.ts`. It writes a `poly` sketch on the given frame and turns each hole into a cut-out detail.
- `Panel.src?: { face: FaceKey }` is optional and stored, and `check.ts` accepts it.
- No schema bump: absent means a hand-made panel.

**Seam folds (E2).**
- A `Connection` of kind `fold`, not grown, gets `seam: true` when it joins two free panels along a shared edge.
- `netFolds` adds them beside `hingeOf`, with a transform that lays the child's edge on the parent's edge, rotated about it. This is `cornerFoldXform` generalised. The crease offset comes from `foldLay`, which already holds at any angle.
- **The fold's range is its own**, not `cornerFit`'s: any dihedral from 5° to 355° except 175–185°, where the faces were merged.
- `foldView` folds seam folds by their dihedral.
- Mountain or valley comes from the dihedral's side (under 180° folds towards the inside face). The overhaul's rule then perforates a fold that turns away from the scored face.

**Seam glue at any angle (E4).** For card and corrugated, a cut edge gets a glue flap (or slit lock) at any dihedral from 5° to 355°.
- The flap's 3D pose uses the dihedral, as `grownGlue` already does.
- `cornerFit`'s range is widened **for card glue and seam folds only**. Board joints keep 30–150°.

**What does not change:**
- grown panels, trays, closures, cartons and every existing golden;
- `autoConnect`, which is called with the seam folds already in place, so it closes only the cut edges.

### 4.4 The unfolder (`src/model/unfold.ts`)

```ts
export type UnfoldSpec = {
  sheet: { w: number; h: number };
  flap: (e: PEdge) => number;           // flap depth for a cut edge (0 for boards)
  prefer: 'pieces' | 'cuts';
  fixed: Record<EdgeKey, 'fold' | 'cut'>;   // the student's choices, kept
  open: FaceKey[];                       // faces left out
  seed: string;
  budgetMs: number;                      // default 400
};
export type Unfolding = {
  folds: Set<EdgeKey>;
  islands: FaceKey[][];
  flapOn: Record<EdgeKey, FaceKey>;
  place: Record<FaceKey, Xform2>;        // flat layout per island, for the Net view and the overlap check
  issues: UnfoldIssue[];                 // a piece too big for the sheet, a flap that could not fit
};
```

The method is the *recommended pipeline* of `MODEL_MODES_RESEARCH.md` §3, written fresh:
1. Every face starts as its own island, and edges are put in order of weight. Flat and long edges join first: `w = 0.5·convex/π or 1.0·concave/π − 0.05·len/avgLen`. With *Fewer cuts*, the length term is stronger.
2. **Greedy join** with union-find. A join is refused if:
   - the moved island crosses the other island or its flaps (bounding boxes first, then `polygon-clipping`), or
   - the joined island no longer fits the sheet in any of 8 turns.
3. **Restarts** with jittered weights until the budget runs out. The result kept has the fewest islands, then the shortest cut length. The jitter is seeded by `spec.seed`.
4. A **merge pass**, smallest island first.
5. **Flap sides**: the smaller area-to-perimeter ratio wins, alternating along chains. A flap that does not fit is shrunk, then flipped, then dropped with an issue.
6. `fixed` edges are honoured before anything else, so a student's *cut here* never moves.

Faces up to about 200 (a 12-faceted sphere has 144). If R0 measures over 50 ms for 200 faces on the preview build, the unfolder moves to a Worker, and the last result stays on screen meanwhile (as `WAFFLE_MODE.md` §10 planned).

### 4.5 Reassembly (`src/model/reassemble.ts`)

```ts
export type MakeSpec = {
  as: 'fold' | 'boards';
  facets?: { card?: number; boards?: number; byShape?: Record<string, number> };
  seams?: 'glue' | 'lock';                 // card
  prefer?: 'pieces' | 'cuts';
  open?: FaceKey[];                        // faces left out (openings)
  edges?: Record<EdgeKey, 'fold' | 'cut'>; // card: the student's fold / cut choices
  joints?: Record<EdgeKey, ConnectionKind>;// a joint kind the student picked
  detached?: true;
};
// Design gains: make?: MakeSpec   (optional; check.ts; no schema bump)

export function reassemble(d: Design, poly: Polyhedron, spec: MakeSpec): Design;
```

1. One `addFreePanel` for each face not in `open`. The material is the design's. `side` points into the solid. For boards, the frame is not moved (the outside stays the outside), and corners cut back through `cornerDepths` as today.
2. **Fold:** `unfold` runs. A seam fold goes on each edge in `folds`, and a glue or lock seam on each other edge, with the flap on `flapOn`'s face. **Boards:** `autoConnect` chooses each joint, and then `joints` overrides apply.
3. Carry-over from the previous made design, by key:
   - every hand-added detail on a panel whose `src` still exists (text, cut-outs, engraving, images);
   - each connection's options (finger count, tab length, crease style) for edges that still exist;
   - panels with no `src`: kept and listed if they no longer touch anything.
4. `solve(d)`, then the problem checks of R6 and R7.

It is pure and deterministic. The same shapes and spec give the same panels, ids included: ids are derived from keys, so the undo history and the golden files stay stable.

## 5. What the student sees

**The click.** On the shape stage's bar, beside the shape tools, are two big buttons: **Fold it** and **Build from boards**. One click:
- the shape folds itself up from its flat net in the 3D view (the fold slider runs from 0 to 1 over about 1.5 s);
- the cut plan is ready to download.

A second click on the same button after the shape has changed updates the model in place (R8). *Back to shape* returns to stage 1 with nothing lost.

**Stage 1, Shape.** It is what PR #6 built, plus R2: typed sizes on the handles, placing onto a face, the flat-faced shapes, align and mirror. A small badge on a curved shape reads *becomes 12 faces*, and only once Make is *Fold it* or *Boards*.

**Stage 2, Make (only to refine).** The card opens closed, under the made model, and has:
- **Make it as:** *Fold it* · *Boards* · *Slices*. A choice the material cannot make is not offered, and a line names the material that can.
- **Fold it:**
  - *Seams* (Glue · Slit locks)
  - *Pieces* (Fewest pieces · Fewer cuts)
  - *Faces around a curve* (a number per curved shape, shown only when there is one)
- **Boards:**
  - *Size is* (Outside · Inside)
  - *Joints* (Automatic, then the usual joint card per edge)
- **Leave open:** click faces in 3D. An open face turns to a dashed outline, and its edges get no flap.
- **Edges (Fold it):** click an edge in 3D to switch it between fold and cut. The edge turns red for cut and green for fold, and the Net updates.
- **Problems** (R6 and R7), each with its fix button.
- **Update from shape**, shown when the shape changed after Make. *Detach* sits in the ⋯ menu.

**The 3D view in Make** is the Workshop's own panel view on the made panels, with the fold slider (`foldView`). Joints, flaps, text and cut-outs are edited there with the usual cards. The 3D view and the Net view (113, if built; otherwise the Cut plan) **highlight the same face** on hover.

## 6. Milestones

| # | Number | Milestone | Size | Needs |
| --- | --- | --- | --- | --- |
| R0 | 119 | Spike: the face graph and unfolder on fixtures, timed | S | — |
| R1 | 120 | The shape modeller on this branch (port, waffle included) | L | — |
| R2 | 121 | The Tinkercad-style workplane: typed sizes, place on a face, flat-faced shapes, align and mirror | L | R1 |
| R3 | 122 | The face graph with stable keys | M | R1 |
| R4 | 123 | Free boards and seam folds in the engine | L | — |
| R5 | 124 | The unfolder | L | R3 (types), R4 |
| R6 | 125 | *Fold it* (card and corrugated) | L | R3, R4, R5 |
| R7 | 126 | *Boards* (plywood and corrugated) | L | R3, R4 |
| R8 | 127 | Linked to the shape: update, carry-over, detach | M | R6 or R7 |
| R9 | 128 | Openings, and a lid by a cut | M | R6, R7 |
| R10 | 129 | Assembly: seam numbers, fold order, the steps view | M | R6 |
| R11 | 130 | Smooth walls on curved faces (spike first; may be dropped) | L | R6, R7 |
| R12 | 131 | Verification of 119–130 | S | all |

**The one-click path is R1 → R3 → R4 → R5 → R6/R7.** R6 and R7 each end with their button working from a single click on default settings. Their refinement controls are the second half of each milestone.

**Order.** R0 comes first because it decides the face-count limit and whether a Worker is needed. R1 and R4 can run side by side: the port touches `src/sculpt`, and R4 touches `src/model`. **R4 is pure engine work and needs no shapes**: its tests use hand-written polyhedra. R2 can run beside R3–R5. **If time is short: R0, R1, R3, R4, R5, R6, R7, R12.** That gives fold-it and boards from the shapes PR #6 already has.

### R0. Spike (no interface)
- In `tests/spike/`:
  - hand-written face graphs for a cube, a hexagonal prism, a square pyramid, an L-prism and a house (a box with a roof prism, so it has coplanar merges);
  - kernel-built ones for a 12-facet cylinder, a box with a through-hole, an 8-facet sphere and a 12×8 torus.
- Measure:
  - extraction time;
  - unfold time at a 400 ms budget;
  - islands found;
  - whether every result is free of overlaps.
- Record the numbers in `PROGRESS.md`, and the face-count limit and the Worker decision in `DECISIONS.md`.
- **Done when** every fixture unfolds with no overlap and the numbers are recorded. Code from the spike is kept only if R3 or R5 would write it the same way.

### R1. The shape modeller on this branch (port)
- Bring over by path from local `claude/waffle-mode` at `e450c6b`:
  - `src/sculpt/**` and `src/waffle/**`;
  - the `Design` fields `kind`, `sculpt`, `waffle`, `outcome`;
  - the `OutcomeHooks` registry in `pieces.ts`;
  - the stage bar, the start-screen card and the sculpt tests.
  - `src/sketch/**` is already here (102) and is a superset. Re-point any import that differs, and do not copy the branch's older copy.
- `manifold-3d` 3.5.4 goes in `package.json` and in `THIRD_PARTY.md` (Apache-2.0).
- Check the WASM's content type on the Worker (`application/wasm`), as `WAFFLE_MODE.md` §12 left unchecked.
- Feature rows: the *Sculpture* start card is `'hide'` in Guided and Quick build.
- **Done when:**
  - a waffle sculpture can be built and exported here as on PR #6;
  - the box goldens are byte-identical;
  - the sculpt and waffle tests pass;
  - `src/sculpt/**` still imports nothing from `src/waffle/**` (the existing grep test).

### R2. The Tinkercad-style workplane
- **Typed sizes.** Clicking a size label on the handles (W, D, H, lift) opens a number box. After a move, ΔX and ΔZ stay visible and can be typed into, with Tab between them. Arrow keys nudge 1 mm (Shift 5 mm), and a held key is one undo step.
- **Place on a face.**
  - *W* then a click on a face sets the workplane. Shift flips it, and a click on empty floor resets it.
  - New shapes, nudges and turns follow the workplane.
  - *D* drops the selection onto it.
  - A new shape dragged over a face lies down on it, sloped faces included.
- **Flat-faced shapes:**
  - *Wedge* and *Roof* (a triangular prism).
  - *Taper*: top and bottom length and width on a box and a prism, giving a frustum.
  - *Loft* between two sketches: straight walls, with round ends faceted.
  - *Hull* of the selected shapes.
  - *Chamfer* on a straight edge of a box, prism or extrusion: a distance, stored on the shape as `chamfers?: { edge: role; d: number }[]` and rebuilt with it.
- **Align and mirror.** Min, centre and max dots per axis, with the clicked or locked shape as the anchor (Alt stretches to match). Mirror handles on the three axes.
- **Snap to shapes** while moving: edges and centres lock with a guide line, and Alt pauses it.
- **Edit group** (*E*) opens a group in place.
- **Protractor:** the angle between two clicked faces, with the CutForge reading beside it. For example: *92° — finger joint* or *160° — glue or fold only*.
- **Done when:**
  - a house (box + roof), a tapered planter (taper), a gem (hull of a prism and a pyramid) and a box with chamfered corners can each be built with typed sizes and no free dragging;
  - every new shape has a `faces.ts` test;
  - there are English and Hebrew strings.

### R3. The face graph with stable keys
- `src/model/polyhedron.ts`: the types, `tidy`, the checks, and `faceRoles` per kind (§4.2).
- `src/sculpt/polyhedron.ts`: the bridge.
- `facets` is applied from `MakeSpec` on a copy. A curved face's facets get `facetOf`.
- **Done when:**
  - a box gives 6 faces and 12 edges at 90°;
  - an L-extrusion gives 8 faces with one edge at 270°;
  - a house merges its coplanar faces;
  - a box with a through-hole gives a top and bottom with holes, plus the hole's walls as `hole:` faces;
  - resizing a box or moving a sketch point keeps every key;
  - changing the facet count keeps every key but the facets'.

### R4. Free boards and seam folds in the engine
- `addFreePanel`, `Panel.src`, holes as cut-outs.
- Seam folds in `netFolds`, `foldView` and `crease`, at any dihedral (§4.3).
- Card glue and slit locks on seams at any dihedral.
- `netOverlaps` over seam-folded nets.
- **New goldens:**
  - a cube from six free boards with seam folds and glue;
  - a hexagonal prism;
  - a square pyramid (folds at about 55°);
  - a 12-sided tube (folds at 150°).
- **Done when:**
  - those goldens are written and every old golden is byte-identical;
  - `netIn3d` holds for seam folds;
  - a cube folded in the 3D preview closes with its flaps on the right faces.

### R5. The unfolder
- `src/model/unfold.ts` as in §4.4, with the seeded restarts, flap sides and `fixed` edges.
- **Done when:**
  - every R0 fixture unfolds with no overlap and fits an A4 sheet at a size that should fit;
  - a cube gives one piece (a cross or similar);
  - the same seed gives the same net twice;
  - a `fixed` cut is never folded;
  - a fixture that cannot fit is split into pieces that do, with an issue naming why.

### R6. *Fold it*
- **First, the button.** *Fold it* on the shape bar runs `reassemble` for `as: 'fold'` with defaults, switches to the made model and plays the fold.
- **Then the refinements.** `src/make/` registers outcome `'fold'`, with the Make card (§5), edge picking and face picking in 3D.
- Card and corrugated only.
- Paired seam numbers on the guide layer: each glue flap and its partner edge get one number, as the waffle's labels do.
- **Problems** (in `validate.ts`, with `fixIssue` cases):
  - *a piece is too big for the sheet*, with fixes *Split it* (re-unfold with a smaller sheet) and *Make it smaller*;
  - *a fold is very sharp* (under 20°): a warning, no fix;
  - *a flap does not fit*: *Glue tape instead* or *Cut the next edge*;
  - *a face is tiny* (under 4 t²): *Merge into neighbour* or *Fewer faces*.
- **Done when** a cube, the house, a tapered planter, a hexagonal prism and a 12-sided cylinder each export as card **after one click and nothing else**, with:
  - no problems listed;
  - creases on the correct side;
  - flaps on alternating faces;
  - seam numbers that match.
- One e2e spec: build a house, choose *Fold it*, and check the SVG's piece count.

### R7. *Boards*
- **First, the button.** *Build from boards* on the shape bar runs `reassemble` for `as: 'boards'` with defaults and shows the boards coming together.
- **Then the refinements.** `autoConnect` sets the joints first, and then the student's `joints` overrides apply.
- Plywood and corrugated.
- *Size is* via `sizeAs`.
- Holes become cut-outs. `hole:` faces become boards only if every one of their edges can be joined; otherwise they are listed.
- **Problems:**
  - *a corner is outside 30–150°*: *Glue it* (corrugated), *Square this corner* (opens the protractor on the shape's two faces) or *Fewer faces*;
  - *a board is narrower than the joint needs*: *Merge into neighbour* or *Butt joint*;
  - *a face is tiny*.
- **Done when:**
  - a plywood box, the house, a hexagonal planter (taper) and an L-shelf each export after one click with finger joints, no listed problems, and outside sizes within kerf of the shape;
  - a plywood gem lists its sharp corners with working fixes.
- One e2e spec.

### R8. Linked to the shape
- `make` is stored. Ids are derived from keys.
- *Update from shape* appears when the shape's key (the solid cache key) differs from the one Make last used. Carry-over follows §4.5 step 3.
- Lost keys are listed once (*Two choices could not be kept: the edge between the roof and the gable no longer exists*).
- *Detach* (one-way) drops `src` and `make` and leaves an ordinary box design. Its undo restores the link.
- **Done when:**
  - a student who has set a slit lock, a cut edge and a text on the house can make the house 20 mm taller and keep all three;
  - deleting the roof keeps everything that is still there and lists the rest.

### R9. Openings, and a lid by a cut
- **Leave open** (clicked faces): the edges around an open face are cut. On card they get no flap; on boards their joints go away.
- **A lid by a cut** (layerling's *Split* as a behaviour):
  - A horizontal plane, dragged on the shape in stage 2, splits the made model in two: the box and the lid.
  - Each half is reassembled with the cut face open. On card the lid gets a rim strip (`foldover`'s hem); on boards it gets a lip.
  - The lid lands **beside the box** (decision 1 of `ROADMAP.md` §2).
- Hinged or tuck lids on made models wait for *Closures anywhere* (D4).
- **Done when:**
  - a cube with its top open folds as an open box;
  - a cube split 20 mm below its top gives a box and a lid that fit (card: within 0.5 mm; plywood: lid clearance from the material).

### R10. Assembly
- **Fold order:** islands are listed largest first, and within an island seams in the order that closes the form last at the open face, or else at the smallest face.
- The waffle's steps view (`src/waffle/ui/StepsLayer.tsx`) is generalised to step through seam numbers with the fold slider.
- Glue areas are shaded on the guide layer, using milestone 89's glue areas.
- **Done when** the house shows 6 steps that close it, and the printed spec sheet (90) lists the seams in order.

### R11. Smooth walls on curved faces (spike first)
- **Spike:** can a ruled face standing upright on a flat face (a cylinder, a rounded extrusion) become one bent band? On card it would be a scored or plain strip glued to its caps by flaps. On plywood it would be a kerf-bent band.
- **Per `curved-hinges-need-structure`, the band must be structural:** tabs on its edges into slots in the caps, not a strip that only covers space.
- If the spike shows the bands of milestones 63–66 (`bands.ts`, `bendPatterns.ts`) can take it, the face's *Faces around a curve* gets a *Smooth* choice. If not, this milestone is dropped and the reason is written in `DECISIONS.md`.

### R12. Verification
- Each milestone's checks again, the four goldens of R4, and the two e2e specs.
- A hands-on pass in the dev server.
- `README.md` gets a *From shapes to folds and boards* section.
- `ROADMAP.md` status rows.

**Every milestone ends** as the roadmap's do:
- `npm run typecheck` and `npm test`;
- golden exports byte-identical unless a case is new and listed;
- at most the one e2e spec for the milestone (the light routine);
- English and Hebrew strings;
- feature rows for all three levels;
- `PROGRESS.md` (Implemented / Verified / Limitations) and `DECISIONS.md`.

## 7. Tests to add

| File | What |
| --- | --- |
| `tests/polyhedron.test.ts` | Hand-written graphs: tidy merges, T-junction splits, dihedrals, slivers. |
| `tests/sculptpolyhedron.test.ts` | Kernel: box, L, house, through-hole, facets; stable keys across resize and facet changes. |
| `tests/seamfold.test.ts` | Seam folds at 30°, 55°, 90°, 150° and 270°: transforms, crease side, `foldView` closing, `netIn3d`. |
| `tests/unfold.test.ts` | No overlaps, sheet fit, determinism, `fixed` edges, flap sides alternate. |
| `tests/reassemble.test.ts` | Fold and boards on the fixtures; ids from keys; carry-over after resize and after a deleted shape. |
| `tests/golden*.ts` | Four new cases (R4), plus the house as card and as plywood (R6, R7). |
| `tests/e2e/make-fold.spec.ts`, `make-boards.spec.ts` | One each. |

## 8. Risks

1. **Face keys across booleans.** If manifold merges coplanar faces of two shapes into one `faceID`, roles come from `runOriginalID` first (as `SKETCH_OVERHAUL.md` §9.2 warned), and the merged face's key joins both. R3's tests pin this down.
2. **Numerical seams.** Edges must pair exactly after T-junction splitting. Every point is snapped to 1e-6 mm in the face frame before pairing, and the check lists unpaired edges rather than dropping them.
3. **Unfolding time on school machines.** It has a budget and seeded restarts, and the Worker is the fallback (R0 decides).
4. **Many small faces.** Spheres and tori give nets with dozens of pieces. The default facet counts are low, *Fewer faces* is always offered, and the curved badge says the count before Make.
5. **Boards at odd angles.** Most hulls and gems have corners outside 30–150°. Boards then lists them with fixes, and *Fold it* is suggested for such forms.
6. **Regression in boxes.** The engine changes are additive (`seam`, `src`), and the goldens are byte-identical except for the listed new cases.
7. **The port.** About 4,900 lines arrive at once. R1 changes no box code beyond the hooks PR #6 already had, and it is its own commit, so it can be reverted alone.
8. **AGPL references.** Anyone building this works from §2.4's behaviours, not from the repositories. `THIRD_PARTY.md` gains layerling beside SketchForge-3D.

## 9. Questions for the owner

1. **Linked or one-way** (decision 3). Linked costs R8; one-way would drop it and make *Update from shape* a fresh Make that loses hand edits.
2. **The waffle comes along** in the port (decision 11). Or should R1 bring only the shapes and leave the waffle on PR #6?
3. **Which of R2's interface items matter most?** If R2 must shrink, the proposed core is typed sizes, place on a face, wedge, taper and hull.
4. **Is R11 (smooth walls) wanted at all**, or is faceting enough for the classroom?
5. **Guided:** should a later Guided path start from a few ready shapes (*a house, a gem, a planter*) with *Fold it* only?

## 10. Left for later

- **Shapes in Guided and Quick build:** ready shapes with *Fold it*, and a challenge panel with an automatic check (SketchForge's challenges lack the check).
- **Importing 3D files** (STL, OBJ), low-poly by VSA, and repair: `MODEL_MODES_RESEARCH.md` §4. The face graph and unfolder take a mesh unchanged once it is in.
- **Wrapping a waffle with boards** (`WAFFLE_MODE.md` §11.1): it now has its engine (free boards on faces). It still needs a joint where a slice's edge meets a board.
- **Stretch at a plane, hollow with wall thickness, hole patterns on a face** (layerling behaviours): useful for boards later, not for folding.
- **Curved creases** (pillow packs) and **tuck lids on made models**: they wait for D4 and `DIELINE_DNA_PLAN.md` §9.
- **Seam numbers as engraving on plywood** (they are on the guide layer for now).

## 11. Relation to other plans

| Plan | Relation |
| --- | --- |
| `WAFFLE_MODE.md`, `SKETCH_OVERHAUL.md` (PR #6, 49–60) | R1 ports them. Their §11.1 and §9 are what R3–R7 build. PR #6 is closed as superseded after R1. |
| `DIELINE_DNA_PLAN.md` (101–117) | R4 extends the same engine and follows its rules 1–9. Shaped flaps (112) are offered on made card seams once built. The Net view (113) is where R6's net is shown; without it, the Cut plan. The artwork template (115) works on made nets unchanged. |
| `GUIDED_MODE.md` (105–110) | Untouched. Made designs are Workshop-only (decision 10). |
| `SENTENCE_BUILDER_PLAN.md` (94–100) | Untouched. A later sentence word *shaped like…* could start a sculpture (§10). |
| `MODEL_MODES_RESEARCH.md` | §3's unfolding pipeline is R5. §4's import is left for later. |

## References in the code

- Shapes (local `claude/waffle-mode` at `e450c6b`):
  - `src/sculpt/build.ts`: `leafBody`, `buildShape`, `buildSolid`, `shapeOfOriginal`, `meshArrays`.
  - `src/sculpt/faces.ts`: `solidFaces`, `foldable`.
  - `src/sculpt/outcomes.ts`: `registerOutcomeUi`.
  - `src/sculpt/kernel.ts`: `kernel`, `scope`, `circleSegments`.
  - `src/sculpt/ops.ts`: `PRIMITIVES`, `primitiveShape`, `createWaffleDesign`.
  - `src/model/pieces.ts` (branch): `OutcomeHooks`, `registerOutcome`.
- Engine (this branch):
  - `src/model/types.ts`: `Frame`, `Panel`, `Sketch`, `PanelPlace`, `Connection`, `ConnectionKind`, `SCHEMA_VERSION = 11`.
  - `src/model/pieces.ts`: `foldXform`, `netFolds`, `cornerFoldXform`, `netGroups`, `buildPieces`.
  - `src/model/seams.ts`: `cornerFit`, `MIN_CORNER`/`MAX_CORNER`, `cornerDepths`, `cornerGlue`, `grownGlue`, `slitLock`, `findOpenSeams`.
  - `src/model/crease.ts`: `creaseDepths`, `foldLay`.
  - `src/model/ops.ts`: `solve`, `autoConnect`, `addPolygonPanel`, `addPlacedOutline`, `growPanel`.
  - `src/model/materials.ts`: `connectionsFor`, `pairFilter`.
  - `src/views/foldView.ts`: `foldDisplay`.
  - `src/model/validate.ts`, `src/easy/fix.ts`, `src/easy/features.ts`, `src/model/check.ts`, `src/model/derived.ts` `memo`.
