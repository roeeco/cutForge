# CutForge polygons, extrude and cuts: brief

Decisions from the design interview (2026-11-07). This brief covers sketched polygon outlines for bases and walls, extruding a base into a tray, shapes that add or subtract material (including notches at edges), and cuts that go through the whole design. It changes the model, geometry, joints and tools. It does not change export formats, the Worker or the visual language from `VISUAL_OVERHAUL.md`.

Start it on its own branch after the visual overhaul has merged, because both touch the toolbar, the inspector cards and `View3D`.

## 1. What a student can do

- **Sketch a base**: draw a polygon on the floor (click vertices), or a regular n-gon (choose the number of sides, drag the radius), or start from a rectangle and add or subtract shapes on it.
- **Extrude a base**: one action stands a wall at 90° on every straight edge, all at one height. The result is a *tray*.
- **Shape any panel**: draw a shape on a panel and choose **Add** (joins the outline), **Cut** (a hole if inside, a notch if it crosses the edge), **Engrave** or **Score**. Walls can also be reshaped directly by dragging their free corners and inserting points on their free edges.
- **Cut through**: a Cut shape with *Cut through* on removes material from every panel in its path, looking straight through the source panel. Example: a triangle over the top-left corner of a box's front wall chamfers that corner on the front and back walls and trims the top of the left wall, which lies edge-on in the cut's path.

## 2. Decisions

| Topic | Decision |
| --- | --- |
| Base creation | **Click-to-place polygon**, **regular n-gon preset**, and **rectangle + Add/Cut shapes**. Edges are straight only; shapes can be curved. |
| Extrude | **A wall on every edge**, one height, one wall-to-base joint: an open tray. |
| Extrude angle and linking | **90°, shared height.** The tray has one height. Push-pull on any wall changes all of them. Walls can still be reshaped individually, and deleting a wall opens that side. |
| Corners not at 90° | **Plywood: angled fingers.** **Card: glue flap or crease.** **Corrugated: tab-and-slot.** Tab-and-slot is also offered for every material at any corner angle. |
| Card and corrugated extrude | **Walls fold up from the base** (one net). Corners: glue flaps on card, tab-and-slot on corrugated. The student can change any corner afterwards. |
| Non-rectangular walls | **Both**: Add/Cut shapes, and direct editing of the free corners and edges. |
| Cut crossing a jointed edge | **The joint re-lays** over the remaining contact on both panels. Too little contact flags the seam. |
| Cut through: scope | **Everything in its path.** It is a 3D cut, so edge-on panels are trimmed as well. |
| Cut through: depth | **Through the whole design**, in both directions along the source panel's normal. |
| Cut through: storage | **One live feature** owned by the source panel. Moving it updates every panel it cuts; selecting it on any panel selects the original. |
| A cut splits or removes a panel | **Allowed, with a warning.** Fragments become separate pieces in the cut plan, and the inspector and export check say so. A removed panel is flagged, not deleted. |
| Base edits after extrude | **Walls follow the edges.** Moving a vertex resizes and turns the adjacent walls. Inserting a vertex splits a wall; deleting one merges two. |
| Edges created by Add/Cut shapes | **Growable automatically.** Every straight edge of a panel's own outline can grow a panel. |
| New edges on a tray | **Always walled.** Any new straight edge of a tray base gets a wall at the tray height. |
| Growing from edges | **Any straight edge of any panel**, sloped edges included (a roof on a gable). |
| Toolbar | **Op row + Through toggle.** Polygon joins Rect / Rounded rect / Circle. On the floor it makes a base; on a panel it makes a shape. The op row becomes **Add · Cut · Engrave · Score**, and *Cut through* appears when Cut is chosen. |

## 3. The concept: one pipeline, in layers

Coherence comes from a fixed evaluation order. Each layer reads only from the layers above it, which rules out cycles where a wall moves because of a cut that depends on where the wall is.

1. **Sketch.** Each panel has a sketch outline. A base is a free polygon. A wall is a rectangle (width from its parent edge, height its own or the tray's) with corner offsets and inserted points on its free edges.
2. **Own outline** = sketch ∪ the panel's own *Add* shapes − its own *Cut* shapes, including its own through-cuts. Cuts always win over Adds, whatever order they were drawn in.
3. **Growable edges** = the straight segments of the own outline. Each one has a stable key from where it came from (§4).
4. **Walls and frames.** Panels are solved parents first, as `solve` does today. A child's width comes from its parent's edge piece; its frame comes from that edge's position and direction. Wall sets and trays are reconciled here (§6).
5. **Through-cuts from other panels** are applied to each panel's material (§8). They never move a panel and never create growable edges. That is the rule that breaks the cycle.
6. **Joints** are computed from the material that remains after step 5. Fingers, tabs, flaps and slots lay out over the surviving contact between two edges, at any angle (§7).
7. **Final outline** = material after step 5 − joint notches and slots + joint adds (flaps). Each connected component is one physical fragment (§9).

Student-facing summary, for the hint bar and the docs: *"The outline you draw decides where walls can stand. Shapes add or remove material. Through-cuts remove material everywhere they pass, but never move anything."*

## 4. Edges and their identity

Today an edge is an index 0–3 and `Notch` positions are measured along it. Edges become **keys**:

- Base sketch edges: `e<n>`, with a stable id per edge stored in the sketch. Inserting a vertex keeps the old id on the first half and gives the second half a new id.
- Wall sketch edges: `e0` bottom (attached, locked), `e1` right, `e2` top, `e3` left. An inserted point on a free edge splits it, and the new part takes the insert's id.
- Edges from shapes: `<detailId>.<segment>`.
- When a cut splits one straight edge into several pieces, the pieces are `<key>#0`, `<key>#1`, … in order along the edge.
- The panel face stays a special reference: `face` replaces `-1`.

`EdgeRef` becomes `{ panelId, edge: string }`. `Notch` and every per-edge array are keyed by edge key, and positions along an edge are measured from that piece's start vertex.

## 5. Wall outlines

A wall is a parametric rectangle so that it stretches correctly with its parent and with the tray height:

- `corners`: an optional `{dx, dy}` offset for each of the three free corners (top-left, top-right, and the bottom corners only along the edge, never off it).
- `inserts`: `{ id, edge: 'e1'|'e2'|'e3', t, off }`: a point at fraction `t` along a free edge, pushed `off` mm outward. A gable is one insert on `e2` at `t = 0.5` with `off = 30`.
- Width changes move points along the edge proportionally; height changes move the top edge, and points on it keep their offsets.
- A slanted side edge that no longer reaches its neighbour shortens the corner contact, and the corner joint re-lays (§7).

Base panels keep absolute vertices. Rectangle root panels become 4-vertex polygons.

## 6. Extrude, trays and wall sets

**Wall sets.** A grown wall is attached to an edge key, not to one piece. One physical wall is derived per surviving piece of that edge:

- When a cut splits the edge into two pieces, the wall becomes two walls. The second one gets a stable derived id (`<wallId>~1`) and copies the wall's settings. Shapes go to the wall that contains their centre.
- When pieces disappear, a derived wall with no shapes of its own is removed. One that has shapes is kept and flagged *broken*, keeping its last geometry, as broken seams do today.
- When a vertex is inserted, a wall on that edge splits the same way. When a vertex is deleted, two walls merge and both walls' shapes are kept.

**Trays.** `Design.trays[id] = { baseId, height, wallKind, cornerKind, openEdges: string[] }`.

- Extrude creates the tray, then reconciliation stands a wall on every growable edge of the base that is not in `openEdges`, using stable ids `<trayId>/<edgeKey>`.
- Deleting a tray wall adds its edge to `openEdges`. A **Wall it** button on the tray card removes it again.
- New edges from vertex inserts or Add/Cut shapes get walls automatically, as decided. Two exceptions, both noted on the tray card:
  - An edge shorter than `MIN_PANEL` (5 mm) stays open: *"2 edges too short for a wall"*.
  - A wall whose slab would overlap a neighbouring tray wall by more than the joint allows (for example the sides of a narrow notch) is flagged in validation and not hidden.
- Each tray corner gets a seam automatically using `cornerKind`. The student can change any one seam.
- Push-pull on any tray wall edits `tray.height`. A wall can override its height with its own value, and the card shows *"custom height"* with a reset button.

**Card nets.** Walls fold from the base, so a fold between two walls would close a loop in the net. The *Crease* option on a wall-to-wall corner is offered only when one of the two walls is not folded to the base; otherwise it is disabled with *"Would close a loop: glue one side."*

## 7. Joints at any angle

Seam detection (`cornerFit` in `src/model/seams.ts`) is generalised from perpendicular panels to any dihedral angle α between 30° and 150°. Contact is the overlap of two edge pieces along their shared line, after through-cuts (layer 6).

- **Angled fingers (plywood).** The finger depth is the distance across the other panel's slab along this panel's plane, `t / sin α`. Outer faces stay flush (outer dimensions, as today). The laser cuts square, so an outside corner that isn't 90° shows triangular gaps of about `t · |cot α|`; the inspector notes this. Ownership rules (earlier panel owns the end segments, three-panel corner rule) are unchanged.
- **Tab-and-slot (any material, any angle).** Slots stay the projection of each tab's volume onto the receiving panel, which the leaning-panel code already does. This is the corrugated default.
- **Glue flap (card).** The flap folds by the corner angle onto the other wall's inner face.
- **Crease (card).** Only where it doesn't close a loop (§6).
- Outside 30°–150°, only butt and glue are offered, and validation warns.
- **Re-lay.** Because joints come from the surviving contact, a notch in a jointed edge re-spaces the fingers or tabs on both panels. Contact shorter than one finger or tab leaves the seam flagged *too little contact* in the inspector and the export check.

## 8. Through-cuts

A Cut detail with `through: true`. In world space it is the shape extruded infinitely along the source panel's normal, both ways.

For each other panel P:

- **Region removed** = every point of P whose line along the cut direction passes through the shape. Because a laser can only cut perpendicular to the sheet, a point is removed when **any part of P's thickness** at that point is in the path. Compute it in P's coordinates:
  - Not edge-on: map the shape onto P's two faces (an affine oblique projection) and take the union of the swept region, the shape ⊕ the segment between the two copies.
  - Edge-on (the cut direction lies in P's plane): clip the shape by P's thickness band and take its extent along the band, which gives strips across P in the cut direction.
- **Parallel panels** reduce to the same shape translated, which is the common case.
- **Excluded**: panels grown from edges the through-cut itself created on its source panel (they lie on the prism's boundary).
- Where the removed region only partly covers a panel's thickness, it is marked *approximated bevel* in validation.

Interaction:

- While drawing with *Cut through* on, every panel it will hit is highlighted, with a count: *"Cuts 4 panels"*.
- Selecting the cut on any panel selects the source detail. Move, resize and array act on the source.
- The stored model has one detail on the source panel. Each other panel's cut is derived, never stored.
- In the cut plan the derived cuts draw in the normal cut colour, with a faint link marker on hover.

## 9. Fragments and removed panels

After layer 7, each connected component of a panel's material is a fragment.

- More than one fragment: every fragment is its own piece in the cut plan, labelled *Front wall (1/2)*, *(2/2)*. The inspector and export check warn: *"This cut splits Front wall into 2 pieces."* Fragments smaller than `minWeb` are flagged as slivers.
- No material left: the panel is flagged *removed by a cut*. It stays in the model, is hidden from the cut plan, and shows as a ghost in 3D, so deleting the cut brings it back.
- Fold nets: a fragment that loses its fold line becomes a separate piece, and a warning names the fold.

## 10. Tools and interaction

**Polygon tool (`G`).**
- Click to place vertices. Close by clicking the first point or pressing Enter. Backspace removes the last point; Esc cancels.
- Vertices snap to the grid and to edges and vertices, as smart snapping does today. Shift locks the segment to 15° steps. Typing a number while drawing sets the current segment's length.
- Self-intersecting polygons are refused, and the closing segment turns red.
- A sides stepper (3–12, `n-gon` mode) on the tool's floating card switches to drag-from-centre for a regular polygon. Shift rotates in 15° steps.
- **On the floor**, the polygon becomes a new base panel and the op row is hidden. **On a panel**, it becomes a `polygon` shape with the current op, stored like the `path` shape (points in a unit box, scaled to w × h), so move, resize, array, align and snapping work unchanged.

**Op row:** Add · Cut · Engrave · Score. A **Cut through** toggle appears when Cut is selected. All of these can be changed later on the shape's card.

**Vertex editing.**
- Double-click a base, or choose *Edit outline* on its card, to show vertex handles. Drag a handle; click an edge midpoint to insert a vertex; select a vertex and press Delete to remove it.
- On a wall, handles appear only on the free corners and on free edges (inserts). The attached edge is locked and its handles are shown greyed out.

**Extrude.**
- Select a base whose edges have no walls, then choose *Extrude walls* on its card.
- A ghost tray appears with a push-pull height arrow, the wall-to-base joint and the corner joint. *Add walls* commits.
- After that, the base's card shows the tray: height, joints, open edges, and *Wall it*.

**Grow from any edge.** Edge picking works on every straight edge piece, sloped ones included. The angle dial measures from that edge, as today.

## 11. Model changes (schema v6)

```ts
type Sketch =
  | { kind: 'poly'; pts: P2[]; edgeIds: string[] }   // root panels; edge i runs pts[i] → pts[i+1]
  | { kind: 'wall'; corners?: Partial<Record<'tl'|'tr'|'bl'|'br', { dx: number; dy: number }>>;
      inserts?: { id: string; edge: 'e1'|'e2'|'e3'; t: number; off: number }[] };

Panel  += { sketch: Sketch }            // w, h stay as the sketch's bounding size
Detail += { shape: ... | 'polygon'; op: 'add' | 'cut' | 'engrave' | 'score'; through?: boolean;
            regular?: { n: number } }   // regular kept until a vertex is edited
EdgeRef = { panelId: string; edge: string }  // 'e0'… | '<detail>.<i>' | with '#n' piece | 'face'
Connection += { trayId?: string }
Design += { trays: Record<string, Tray> }
ConnGeom.edges[].edge: string
```

**Migration v5 → v6:** each panel gets a sketch (a 4-point polygon for roots, a plain wall sketch for grown panels). Edge `n` becomes `e<n>` and `-1` becomes `face`. Notch arrays are re-keyed. A v5 design must produce **byte-identical SVG** after migration, checked against golden exports of both templates and the e2e fixtures.

## 12. Code affected

- `src/model/types.ts`, `serialize.ts`: schema v6 and the migration.
- `src/model/frame.ts`: edge functions by key over any polygon edge; `growFrame` from any edge direction.
- `src/model/geometry.ts`: the layered outline pipeline (§3) with booleans from `polygon-clipping`. Holes entirely inside the outline keep their arcs. Curved shapes that cross the outline are flattened at the 0.01 mm curve tolerance, so a notch from a circle exports as short segments in v1. Refitting arcs after booleans is left for later.
- `src/model/seams.ts`: contact between edge pieces at any angle; angled fingers; notches by key.
- `src/model/ops.ts`: polygon bases, extrude and trays, wall sets and reconciliation inside `solve`, vertex insert and delete with shapes moved to the right wall, grow from keys.
- `src/model/pieces.ts`: fragments as pieces; fold nets with polygon parents (`foldXform` from an edge key).
- `src/model/validate.ts`: splits, slivers, removed panels, too little contact, approximated bevels, tray edges too short or overlapping.
- `src/model/snap.ts`, `edit.ts`, `measure.ts`: polygon vertices and edges as snap candidates; coplanarity stays as it is.
- `src/views/three-geom.ts`, `View3D.tsx`, `Plan2D.tsx`: extrusion of any outline with holes; through-cut highlight; vertex handles; ghost tray.
- `src/ui/Toolbar.tsx`, `Inspector.tsx`, the edge bar or grow card, `Connections.tsx`: polygon tool, op row, Cut through, tray card, outline editing.
- `src/templates/*`: unchanged ids; they generate rectangles through the new sketch type.
- `src/i18n/en.ts`, `he.ts`: every new string, in both languages.

## 13. Order of work

1. **Foundation:** sketch type, edge keys, schema v6 and the migration. Rectangles still behave exactly as before, all existing tests pass and the golden SVGs are byte-identical.
2. **Polygon bases:** polygon and n-gon tools, vertex editing on bases, grow from any edge at 90°, seams at any angle (tab-and-slot, glue, butt), then angled fingers.
3. **Add/Cut on outlines:** the `add` op, cuts as notches, joint re-lay, fragments, growable shape edges, wall sets.
4. **Extrude and trays,** including card and corrugated defaults and the crease loop rule.
5. **Wall outline editing:** corners and inserts, growing from sloped edges (roof on a gable).
6. **Through-cuts:** prism projection, edge-on strips, highlight and count, linked selection, validation.
7. **Tests, docs, screenshots.**

## 14. Verification

- **Unit tests**
  - Migration golden SVG equality.
  - Hexagon tray in plywood: 6 walls; each corner's material occupies the volume at most once; gap size matches `t·|cot α|`.
  - L-notch on a tray base: walls shorten, two new walls appear, and the inner corner is joined.
  - A notch in the middle of a walled edge splits the wall, and the fingers re-lay on both parts.
  - Vertex insert and delete: walls split and merge, and shapes land on the wall that contains their centre.
  - The chamfer through-cut from §1: front and back walls lose the same triangle, the left wall loses its top strip, and the left/front finger seam re-lays.
  - A through-cut that splits a wall gives 2 pieces and a warning.
  - A through-cut covering a whole panel flags it as removed, and deleting the cut restores it.
  - A card hexagon tray unfolds into one net with glue flaps.
- **e2e:** draw a polygon base, extrude, push-pull the height, cut through a corner, check the warnings and export check, then save, reload and get the same SVG.
- **Done means:** `npm run typecheck`, `npm test` and `npm run e2e` are green, and `DECISIONS.md` gets a *Polygons and cuts* section.

## 15. Decided during the brief (not asked in the interview; say if any should change)

- Through-cuts never move panels or create growable edges on other panels. This is required to avoid cycles.
- Cuts always win over Adds, whatever order they were drawn in.
- A through-cut removes material wherever any part of a panel's thickness is in its path, because the laser can't cut bevels.
- Joint angles are limited to 30°–150°; outside that range only butt and glue are offered.
- Edges shorter than 5 mm stay open on a tray even though new edges are "always walled".
- Wall points scale with width along the edge and keep their offsets when the height changes.
- In v1, curved shapes that cross an outline export as short segments rather than arcs.

## 16. Watch-outs from the chosen combination

- **Through the whole design, both directions** means a round through-hole drawn on a base also cuts a full-height slot in any divider standing over it, because the divider is edge-on to a vertical cut. The hit-panel highlight and the "Cuts N panels" count are what make this visible before committing. If it turns out to surprise students, the cheapest fix is a per-cut depth field added later.
- **New tray edges always walled** means a small finger notch cut into a tray base edge grows three small walls around it. Finger notches belong on walls, which have no tray rule. The hint bar should say so when a Cut shape on a tray base touches a walled edge.
