# Waffle mode: shapes in, slotted slices out (milestones 49–54)

Status: plan, 2026-11-12. Nothing is built yet.

Branch: `claude/waffle-mode`, off `main` (which ends at milestone 43). Milestones 44–48 belong to the parked curved-walls branch, so the waffle starts at 49. §3.5 lists what is copied from that branch.

Waffle mode adds a second kind of CutForge design. The student builds a solid from ready-made shapes and from sketches that are extruded or revolved. 3D files are not supported yet. CutForge then cuts the solid into two crossing families of slotted slices (a waffle, also called interlocked slices). The slices slide together, can stand in a base plate, and every part is labelled. The cut plan, materials, packing, export, autosave and class submission are the ones box designs already use.

The research behind this plan is in `MODEL_MODES_RESEARCH.md`: open-source slicers and unfolders, in-browser mesh tools, and why MocknSlice's versions fell short. It also covers the later modes: papercraft unfolding, 3D-file import, stacked and radial slices.

## 1. Decisions (interview, 2026-11-12)

| Question | Decision |
|---|---|
| Where it lives | A new design type in CutForge: *Waffle sculpture* on the start screen. Everything after the slices are made is shared with box designs. |
| First technique | Interlocked (waffle) slices only. Papercraft unfolding, stacked and radial slices, and 3D-file import come later (§11). |
| Where the form comes from | Built in the app from primitives, plus sketches that are extruded or revolved. No mesh import, simplification or retopology for now. |
| Combining shapes | Tinkercad-style **Solid / Hole** and **Group / Ungroup**. Everything stays editable. |
| Radius tool | Type a radius in mm, then click a point. It rounds sketch corners and the footprint corners of shapes (a box becomes a rounded box). It does not round 3D edges. |
| Sketch planes | The floor, and upright planes that can be turned and moved. Not the faces of shapes. |
| Snap angles | Sketch lines snap to **30° steps** by default; hold Alt to draw freely. This keeps the straight sides of extrusions at angles a later *wrap with panels* step can join (§11.1). |
| Waffle | Two crossing families at 90°. The pair turns about the vertical. Spacing is set by count or by distance, and any slice can be dragged, added or deleted. Family A's slots open from the top and family B's from the bottom, so every waffle can be assembled. |
| Assembly aids | Engraved part labels (`A3`, with the partner's number beside each slot), an optional **base plate**, and an **assembly steps** view. No slot-fit test strip for now. |
| Mode switch | One interface for waffle designs. The *Quick build / Workshop* switch is hidden for them for now. |

## 2. What we borrow, and what we avoid

- **The benchmark is Slicer for Fusion 360's *Interlocked* technique.** It has two families, spacing by count or distance, draggable single slices, labels like `Z-6-2`, and named errors: unconnected pieces, part too small or narrow, notches split a part, notch hits a hole, part too large for the sheet. We match its error list (§6.4) and its labels (§6.6).
- **Lamina** (AGPL, behaviour only, no code) does two things worth matching:
  - It cuts one slot per stretch of shared material along each crossing line. Our split height (§6.3) is the general form of that.
  - It finds pieces that nothing holds and offers to add a crossing slice through them (§6.4).
- **MocknSlice's waffle** shows what to avoid:
  - Its default *alternating* slot pattern can't be assembled from rigid stock: no push-together order exists for a 2×2 grid.
  - Its slot depth came from scanning each 2D outline, not the shared material.
  - A strict checker blocked output on a plain sphere.
  - Every slice through a torus became two pieces that nothing held.

  In this design, slot directions never alternate. Problems are listed with a fix button, and the file is still made.
- **Libraries:**
  - `manifold-3d` (Apache-2.0) is the one new dependency (§3.2). It handles primitives, extrude and revolve, booleans, slicing, projection, and 2D booleans and offsets.
  - Already in CutForge: `polygon-clipping`, `opentype.js` text outlines, and the packer and writers.
  - Copied from the parked branch (§3.5): arc refitting (`src/geom/arcfit.ts`) and the rounded-corner maths.
  - Record `manifold-3d` in `THIRD_PARTY.md` when it is added.

## 3. Architecture

### 3.1 A design type, not a new app

`Design.kind = 'waffle'` marks a waffle design. When it is absent, the design is a box design, which covers every file made before milestone 49. A waffle design keeps `panels`, `connections` and `trays` empty and adds `sculpt` (the shapes) and `waffle` (the slicing settings). Box code is not touched. The places that branch are listed in §3.4.

### 3.2 The shape kernel: manifold-3d

- **Package:** `manifold-3d` 3.5.4: a 541 KB WASM file (about 205 KB gzipped) plus 19 KB of gzipped JS.
- **Lazy loading:** it loads with a dynamic `import()` only when a waffle design opens, so box designs never download it. Calls are synchronous once `await kernel()` has resolved. That keeps CutForge's model of deriving everything at render time. Move the work to a Worker only if profiling asks for it (§10).
- **Freeing memory:** every `Manifold` and `CrossSection` has to be freed with `.delete()`. One helper, `scope(fn)`, records what is created inside it and frees everything except the returned value. A test counts live objects.
- **How smooth curves are:** set circle segments so the chord error stays at or below 0.02 mm (n = ⌈π / acos(1 − 0.02/r)⌉, at most 360). Waffle pieces run `refitArcs` (§3.5) on their closed cut contours, so circles and rounded corners leave as true arcs. `prepareExport` and box exports are unchanged.
- **One way to build every shape:** every primitive is built from a 2D `CrossSection`. The sketch tool and the radius tool then share that path:

| Shape | Built as | Card |
|---|---|---|
| Box | footprint rectangle (with corner radii), extruded | W, D, H, corner radii |
| Cylinder | circle, extruded | Ø, H |
| Cone | circle extruded with `scaleTop` = top Ø / base Ø (0 gives a point) | base Ø, top Ø, H |
| Prism | regular n-gon (with corner radii), extruded | sides 3–12, Ø, H |
| Pyramid | n-gon extruded with `scaleTop` 0 (or a top size, for a frustum) | sides, base, top, H |
| Sphere | `Manifold.sphere`, scaled when W, D and H differ | W, D, H |
| Half sphere | sphere ∩ box | W, D, H |
| Torus | circle, revolved | Ø, tube Ø |
| Extrude | sketch → `CrossSection` → `extrude` | height, *Edit sketch* |
| Revolve | sketch → `CrossSection` → `revolve` about the chosen axis | angle (360°, or 30° steps), *Edit sketch* |

### 3.3 What is derived from what

```
shapes (saved) ──build──▶ solid (Manifold, world mm, y-up)
solid ──project()──▶ footprint            (base plate outline, default slice range)
solid ──trimByPlane (base plate)──▶ trimmed solid
trimmed solid ──to plane frame, slice(0)──▶ section per slice plane
section ──simplify, decompose()──▶ regions = raw parts
raw parts + crossings ──slots (§6.3)──▶ slotted parts + checks
+ plate tabs and slots + labels ──▶ pieces (TaggedContour)
pieces ──existing──▶ pieceCopies → pack → prepareExport → SVG / DXF
```

Only three things are saved: the shapes, the waffle settings, and slice positions the student set by hand. The solid is cached under a stable key made from the shape tree. Sections are cached under the solid's key plus the plane.

Coordinates: CutForge's world is y-up, in mm. `slice()` cuts at z = height, so the solid is transformed to put the slice plane at z = 0, with x running along the slice (s) and y as world up.

### 3.4 Where the code branches

| File | Change |
|---|---|
| `src/model/types.ts` | `Design.kind`, `sculpt`, `waffle`. **No schema bump.** The fields are optional, and no `kind` means a box design. `main` is at version 9 and the parked branch already uses 10–14, so a bump here would collide when that branch merges. A waffle file with no `sculpt` opens as an empty waffle design. |
| `src/model/pieces.ts` `buildPieces` | For waffle designs, `wafflePieces(d)` from `src/waffle/pieces.ts`. `pieceMat` returns the working material. |
| `src/views/Plan2D.tsx` | Selection and hover go through `pl.copy.panels`. Waffle pieces have `panels: []`, so add a small adapter for what a placed piece selects: panel ids for boxes, part ids for waffles. Panel-only overlays stay box-only. |
| `src/App.tsx` | The 3D view becomes `SculptView3D` for waffle designs. |
| `src/ui/Toolbar.tsx`, `src/ui/Inspector.tsx` | The waffle rail and cards, from `src/sculpt/ui/*` and `src/waffle/ui/*`. |
| `src/ui/StartScreen.tsx` | *Waffle sculpture* next to the templates. Material step as today: card, corrugated and plywood are all allowed. |
| `src/ui/TopBar.tsx` | Waffle designs only: the stage stepper **1 Shape · 2 Waffle**, and the mode switch hidden. |
| `src/model/validate.ts` and the export check | Waffle designs run `waffleChecks` only. |
| `src/views/thumbnail.ts` | A waffle thumbnail, for submissions and the teacher view. |
| `src/store/*` | Waffle actions are pure Design → Design functions in `src/sculpt/ops.ts` and `src/waffle/ops.ts`, through the existing history. One ✓ is one undo step. |
| `src/i18n/en.ts`, `he.ts` | Every new string in both languages. The coverage test already checks this. |

New folders:
- `src/sculpt/`: shapes, the kernel, sketch → `CrossSection`, shape tools.
- `src/waffle/`: families, sections, slots, plate, labels, checks, pieces, assembly steps.

### 3.5 What comes from the parked curved-walls branch

The waffle is built on `main` and does not merge `claude/charming-einstein-lqhfxq`. That branch's bent walls, bend patterns, strips and arched lids are parked as buggy. Exactly two pieces of its milestone 45 come over:

1. **`src/geom/arcfit.ts`:** copied **byte-identical** (`git show origin/claude/charming-einstein-lqhfxq:src/geom/arcfit.ts`), so a later merge of that branch doesn't conflict there. Only `src/waffle/pieces.ts` calls it; box exports don't change. This happens in milestone 51.
2. **The rounded-corner maths:** a tangent arc replaces a corner, flattened within 0.02 mm with every point on the circle, and the arcs on one edge are scaled down until they meet rather than overlap. It is re-written as waffle code in `src/sculpt/round.ts`, from the `src/model/edges.ts` changes in commit `3d19686`, and works on the waffle's own point type (§4). This happens in milestone 49, for box and prism corners.

Record both in `DECISIONS.md` under *Waffle mode*.

## 4. Data model

```ts
// added to Design
/** Absent: a box design (everything before milestone 49). */
kind?: 'waffle';
sculpt?: Sculpt;
waffle?: WaffleSpec;

export type Sculpt = {
  shapes: Record<string, Shape3>;
  /** Top-level shapes, in creation order (group members are listed by their group). */
  order: string[];
};

export type ShapeKind =
  | 'box' | 'cylinder' | 'cone' | 'prism' | 'pyramid'
  | 'sphere' | 'halfsphere' | 'torus' | 'extrude' | 'revolve' | 'group';

export type Shape3 = {
  id: string;
  name: string;
  kind: ShapeKind;
  /** Tinkercad's Hole: inside a group it is subtracted from the group's solids; outside one it cuts nothing. */
  hole?: true;
  /** Position of its local origin (mm, world) and its turn (unit quaternion [x, y, z, w]). */
  at: V3;
  q: [number, number, number, number];
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
  /** Revolve: degrees (360 default) and axis (the plane's axis line, or a straight edge of the outline). */
  angle?: number;
  axis?: { kind: 'plane' } | { kind: 'edge'; i: number };
  /** Group: its members (each still a Shape3 with its own Solid/Hole). */
  children?: string[];
  color?: string;
};

/**
 * A point of a waffle sketch: a Corner (neither field), a Curve (`curve: 'auto'`, as on main's
 * base outlines), or a Round corner (`r` > 0 mm, a tangent arc; §3.5).
 */
export type SculptPt = { x: number; y: number; curve?: 'auto'; r?: number };
/** A closed outline in the shape's local XY. */
export type ShapeSketch = { plane: 'floor' | 'upright'; pts: SculptPt[] };

export type WaffleSpec = {
  /** Family A's direction in top view (degrees about the vertical); family B is at +90°. */
  turn: number;
  a: WaffleFamily;
  b: WaffleFamily;
  /** Slot width = thickness + clearance (mm). Absent: the material's clearance. */
  clearance?: number;
  base?: BasePlate;
};

export type WaffleFamily = {
  /** Even spacing: how many slices, or the gap between them (mm). */
  spacing: { by: 'count'; n: number } | { by: 'gap'; mm: number };
  /**
   * Set once the student moves, adds or deletes a slice: each slice's position (mm along the
   * family's normal, from the solid's centre) and a stable id. Absent: evenly spaced.
   */
  slices?: { id: string; at: number }[];
};

export type BasePlate = {
  shape: 'rect' | 'round' | 'outline';
  /** How far it reaches beyond the sculpture's footprint (mm). */
  margin: number;
  /** The sculpture is cut flat this far above its lowest point (mm); the plate's top is there. */
  flat: number;
};
```

Labels number each family's slices in order along its normal. Adding or deleting a slice renumbers the family, which is expected. Ids keep any per-slice state attached to the right slice.

## 5. Stage 1: Shape

### 5.1 Layout

The frame is the same as the Workshop's:
- **Top bar:** design name, material pill, stepper **1 Shape · 2 Waffle**, and *3D | Cut plan*.
- **Left:** the rail.
- **Right:** the card.
- **Middle:** the stage, with the floor grid.

The cut plan works at any time. Before stage 2 has been opened it shows the waffle with default settings, so there is never an empty screen.

| Rail button | Key | Notes |
|---|---|---|
| Select | V | |
| Shapes | S | |
| Sketch | K | |
| Radius | F | |
| Solid / Hole | H | |
| Group / Ungroup | Ctrl+G / Ctrl+Shift+G | shown when the selection allows |

Keys belong to the design type, so they don't clash with the box rail's keys (P, D, R, U, C, G, T).

### 5.2 Shapes

- **The card:** shows the eight shapes as tiles drawn by the real renderer, plus *Solid / Hole* for the next shape.
- **Placing one:**
  - Press and drag on the floor, or on the top of a shape under the pointer, to draw the footprint. For a sphere or torus you drag the diameter. Shift keeps it square or round. This is like the Quick build *Box*.
  - On release, a ghost appears at the last height used (the first time: the shorter side of the footprint). Drag its top arrow or type the height, then ✓ or Enter.
  - A click without a drag drops a 40 mm shape there.
  - Every new shape is a ghost first, as everywhere in CutForge.
- **Snapping:**
  - To the 1 mm grid.
  - Footprint edges and centres snap to other shapes' bounding boxes. Alt turns snapping off.
  - A shape dropped on another lands on its top.
- **Changing its size afterwards:**
  - Numbers on the card.
  - On the stage: teal arrows on the footprint's sides (W, D) and top (H), as for board sizes. Shift-drag keeps the proportions.
  - A white *lift* arrow raises it off what it stands on.

### 5.3 Solid, Hole and groups

- **Solid or Hole:** every shape is one or the other. A Solid shows its colour; a Hole is grey, see-through and striped. Switch it on the card or with H.
- **Group** (Ctrl+G, two or more selected) makes one shape: all its Solids joined, minus all its Holes. A group is a Solid unless it is switched to Hole; a group of holes makes one complex hole.
- **Ungroup** gives the members back exactly as they were.
- **A Hole outside any group cuts nothing.** It shows as a grey ghost, as in Tinkercad, which many students already know. The check list says *This hole isn't grouped, so it cuts nothing*, with the fix **Group it with what it touches**.
- **Top level:** all top-level Solids are joined. Separate solids are allowed. Pieces of them that the waffle can't hold are flagged at stage 2.
- **Working inside a group:** double-click it to select and edit its members; everything else is dimmed and Esc leaves, like the solo view.

### 5.4 Moving and turning

The existing gizmo, extended to 3D:
- A square drags on the floor plane.
- Arrows move along the two floor axes and up.
- Three rings turn about the vertical and the two floor axes, in 15° steps (Shift for 1°, Alt for free). A typed number plus Enter while dragging works as it does now.

Turns are stored as a quaternion, so they compose cleanly; the card has *Reset turn*. Bounding boxes snap flush against other shapes and the floor. Duplicate (Ctrl+D), Delete, and the arrow keys (1 mm, Shift 10 mm) work as in box designs.

### 5.5 Sketch, then Extrude or Revolve

- **The plane** is chosen on the tool's card: *Floor* or *Upright*.
  - An upright plane is a grid standing on the floor through the selection's centre (or the origin). It faces the nearest 30° step towards the camera.
  - Drag its edge arrow to move it along its normal; its ring turns it in 30° steps.
  - A dashed vertical line on it is its **axis**, for Revolve.
- **Drawing** works like today's polygon tool: click corners; close on the first point or with Enter; Backspace removes a point; Esc cancels; a typed number plus Enter sets an exact length. Two things change:
  - Segments **snap to 30° steps by default**, measured from the plane's horizontal, and **Alt draws freely**. Today Shift gives 15° steps; waffle mode's default is 30°.
  - Points also snap to the plane's axis line.
- **After closing,** a ghost appears with **Extrude | Revolve** on the card. Extrude is preselected on the floor; Revolve is preselected on an upright plane when the outline touches or sits beside the axis.
  - **Extrude:** drag the arrow or type the height. On an upright plane it goes towards the viewer; dragging through the plane sends it to the other side.
  - **Revolve:** about the plane's axis line, or click a straight edge of the outline to use that edge instead. The angle is 360°, or 30° steps for a part turn. An outline that crosses its axis is amber, with *The outline crosses its axis: move it to one side*.
  - ✓ makes the shape. It is a Solid, and can be switched to Hole like any shape.
- **Editing later:** an extrusion's or revolve's card has **Edit sketch**. It shows the outline on its plane with the existing outline handles: drag a point, **+** on an edge adds one, Delete removes one, and each point is *Corner*, *Curve* or *Round* with a radius. The solid follows live.
- Outlines that cross themselves are refused, as the polygon tool does now.

### 5.6 Radius tool

- **The card:** *Radius* in mm (default 5), and *Sharp* (radius 0).
- **What it can round** (these light up on hover):
  - every corner of an extrusion's or revolve's outline, shown where it is in 3D (an extrusion's corner is a vertical edge, highlighted along its length);
  - the footprint corners of boxes and prisms;
  - the base corners of pyramids.
- **Clicking:** rounds that corner (sets `r` on the point). Shift-click rounds several; a shape's card has *Round all corners*.
- **A radius too big for the corner** is clamped so neighbouring arcs never overlap (the clamp ported from milestone 45, §3.5). A badge says *5 mm → 3.2 mm here*.
- **Rounded corners stay editable:** in *Edit sketch*, and in a box's or prism's list of corner radii.

## 6. Stage 2: Waffle

### 6.1 Families and planes

- **Defaults** when stage 2 first opens:
  - `turn` 0°: family A is seen face-on from the front, and family B from the side.
  - Each family gets n = clamp(round(extent / 35 mm), 3, 9) slices, centred in n equal bands across the solid. No slice sits at the very tip.
- **The card:**
  - for A and B: *Count | Gap*, with the number;
  - *Turn* (0–90°; there is also a ring on the stage at the solid's centre, in 15° steps);
  - *Clearance*;
  - *Base plate*;
  - *Equal spacing*, which drops hand-placed positions.
- **On the stage:** the solid is see-through; slices are slabs, A in one colour and B in another, with their slots.
- **Editing single slices:**
  - Click a slice to select it. Its arrow drags it along its normal: 1 mm steps, snapping to equal-spacing positions and to the solid's centre, with typed numbers as everywhere.
  - Delete removes it.
  - **+ Slice** on the card adds one halfway into its family's widest gap.
  - Any of these stores the family's positions in `slices`.
  - Slices of one family stay at least t + 2 mm apart. Dragging stops there.

### 6.2 Sections and parts

- For each slice plane: `slice(0)` in the plane's frame, then `simplify(0.01)`, then `decompose()` into regions.
- Each region is one part: `A3`, or `A3·1`, `A3·2` when a slice cuts the solid into several regions.
- Regions under (3t)² in area, or narrower than 2t throughout, are left out. An info line says so (*2 tiny bits left out*); it is not counted as a problem.
- With a base plate, the solid is trimmed at the plate's top first (`trimByPlane`), so parts stand on the plate.

### 6.3 Slots: one split height per crossing

Both families are vertical, so an A slice *a* and a B slice *b* meet along a vertical line L. Let J = solid ∩ L: a set of height intervals, read from *a*'s section at L's position along it. If J is empty, the two slices don't meet and get no slot.

**B slides down onto A.** Along L, everything A keeps must therefore be below everything B keeps. One height *m* per crossing sets this:
- **A's slot:** width t + clearance, centred on L. It runs from *m* **up through the part's top**: to its bounding box plus 1 mm, so nothing above can block the slide.
- **B's slot:** same width. It runs from *m* **down through the part's bottom**.
- **Choosing *m*:**
  - Candidates sit at r ∈ {0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65} of each interval of J, tallest interval first.
  - They are ranked by: parts the two slots split (region counts before and after); then ligaments under the minimum (the material left beside or beyond the slot; at least max(2t, 3 mm) on plywood and 3t on card or corrugated); then |r − 0.5|.
  - The cheapest wins. A crossing where every candidate splits a part becomes a check (§6.4).
- **One interval** (the usual case, with nothing in the way): *m* is its middle, the classic half-lap.
- **Several intervals** (a torus, a hollow): the slot also runs through the other intervals, which is what lets the slices go together. If that splits a part, the check says so.
- **Cutting:** slot rectangles are subtracted from the regions with `CrossSection` difference. They reach 1 mm past the outline so no hair-thin sliver is left.

**Why it always assembles:**
- Every A slice keeps material only below its crossings' split heights, and every B slice only above.
- All motion is vertical.
- So each B slice dropped straight down meets no A material on any crossing line.
- A unit test asserts this on every fixture.

Slot directions never alternate.

Left for later:
- A lead-in flare at the slot mouth (Fusion's *notch factor*). The mouth meets sloped outlines at different heights, so a flare needs its own care.
- Dog-bone reliefs. These are for CNC; a laser doesn't need them.

### 6.4 Checks and fixes

The checks appear in the export check and as badges on the stage. Clicking one selects the slice.

| Check | When | Fix |
|---|---|---|
| *A3·2 isn't held by anything* | a part, after slotting, with no crossing and no plate tabs | **Add a slice through it**: a slice of the other family through its widest point |
| *A slot splits A3* | every split height cuts a part in two | **Move the slice**: nudges of ±t to ±10 mm are tried, and the nearest one that clears it is offered |
| *Thin beside the slot in B2* | ligament under the minimum | the same nudge search |
| *A2 and A3 are too close* | same family, gap under t + 2 mm | drag it |
| *B4 is larger than the sheet* | larger than the sheet both ways | none yet (puzzle splitting comes later) |
| *A hole isn't grouped* | §5.3 | **Group it with what it touches** |
| *Nothing to slice* | the solid is empty | none |

The file is always made. Problems are warnings that name the part, never a blank result. This is the opposite of MocknSlice.

### 6.5 Base plate

- **Turned on** by the *Base plate* tick on the waffle card.
- **Shape:** *Rect*, *Round*, or *Outline* (the sculpture's top-view outline from `project()`, grown by the margin).
- **Margin:** default 10 mm.
- **Cut flat at:** default 0, the sculpture's lowest point. An arrow on the stage raises the cutting plane and shows the cut, so a sphere can stand.
- **Thickness:** the material's.
- **Tabs:** every part whose bottom outline runs along the plate (a straight run of more than 3t) gets tabs down through it.
  - Size: width max(3t, 8 mm), clamped to the run; length equal to the plate's thickness.
  - Count: one per run under 60 mm, two above (at 25% and 75%).
  - They keep at least t + 2 mm from any B slot mouth on that edge.
  - The plate gets a matching slot for each tab: the tab plus clearance.
- **Label:** *Base*.
- **Order:** the plate first, then the A slices into it, then the B slices dropped from above. Their tabs reach the plate last.
- A part that touches the plate only at a point gets no tab; its crossings hold it.

### 6.6 Labels

- **Part labels:** each part gets an engraved label, such as `A3` or `A3·2`.
  - It sits at the point deepest inside the part, measured on the part minus its slots (pole of inaccessibility, about 60 lines of our own code).
  - Text height is up to 8 mm and shrinks to fit, down to 3 mm. If it can't fit even then, it goes on the guide layer only.
- **Partner labels:** beside each slot mouth, inside the part, the partner's label in 3 mm text. For example, A3's slot that B5 slides into says `B5`.
- **How they are drawn:** text outlines come from the existing `outlineText` (opentype, Rubik), on the engrave layer. On card and corrugated the material's engrave settings apply as they do today.
- **Letters:** A and B in both languages, so parts read the same on any sheet.
- **Cut plan:** shows the labels exactly as they will be engraved.

### 6.7 Assembly steps view

- A **Steps** button on the waffle stage opens a step slider: ‹ Step n of N ›.
- The order is:
  1. the plate;
  2. the A slices one at a time, standing in place;
  3. the B slices one at a time, each shown first above the sculpture with a down arrow, then dropped into place in a short animation.
- Each step's line names the part, e.g. *Slide B3 down over A1–A4*.
- View only; nothing is saved.

## 7. Cut plan and export

- **Pieces:** each part is a piece. Keys are `w:A3`, `w:A3·2`, `w:base`; the `w:` prefix keeps them apart from panel ids, and `·` is not one of the separators already in use (`@`, `#`, `~`).
- **Copies and packing:** quantity works as today, and packing uses the existing shelf packer. It packs bounding boxes, so irregular parts waste some sheet; true nesting is a later improvement.
- **Grain and flutes:** corrugated parts keep their flutes vertical (up the slice). Plywood grain follows the sheet as now.
- **Export:** `prepareExport` is unchanged. Outlines, slots and plate slots go on the cut layer, labels on the engrave layer. Arcs are refit, and kerf compensation works as for boxes.
- **Selection:** selecting a part in the cut plan selects its slice in 3D, and the other way round.

## 8. Materials

| Material | Clearance (default: the profile's) | Minimum ligament | Notes |
|---|---|---|---|
| Plywood 3–6 mm | profile (about 0.1 mm) | max(2t, 3 mm) | |
| Card | profile (0 or less: snug) | 3t | small sculptures; card flexes |
| Corrugated | profile (about −0.2 to 0: it compresses) | 3t | flutes vertical in every slice |

The waffle card's *Clearance* overrides the profile's for this design.

## 9. Milestones

Testing follows the light routine for each milestone: `npm run typecheck`, `npm test`, a quick look in the dev server, and at most one e2e spec (milestone 54). Geometry is covered by unit tests.

**Milestone 49: Waffle designs and shapes**
- *Waffle sculpture* on the start screen; `Design.kind`, `sculpt`, `waffle` (no schema bump, §3.4); save, open and autosave.
- The rounded-corner maths in `src/sculpt/round.ts` (§3.5).
- **Spike first:** `manifold-3d` builds with Vite 8 and loads from the Worker's static assets in Chrome and Safari and on a school Chromebook. Record its size and first-load time. If it fails, see §10.1.
- The kernel (`scope`, cache, smoothness), all eight shapes, the Shapes tool (drag, ghost, ✓), size arrows, lift, the 3D gizmo, duplicate and delete, Solid/Hole, and group/ungroup/work inside a group.
- Done when a student can build *a box with a round hole and a cone on top* and reopen it from a file.
- Tests:
  - the volume of each primitive is within 0.5% of its formula;
  - a Hole cuts only inside its group;
  - save and open round-trip;
  - no `Manifold` objects are left alive after a rebuild.

**Milestone 50: Sketch, extrude, revolve, radius**
- Floor and upright planes (move, turn in 30° steps, axis line); drawing with 30° snaps by default and Alt for free; typed lengths; Extrude and Revolve ghosts; choosing an edge as the axis; *Edit sketch*; the radius tool, with clamping.
- Done when a vase (a revolved half profile), a rounded box, and an L-shaped extrusion with a 30° chamfer can each be made and edited.
- Tests:
  - sketch → `CrossSection` with Round points stays within 0.02 mm of the true arc;
  - an outline crossing its axis is refused;
  - the radius clamp works.

**Milestone 51: Slices and parts**
- Stage 2: families, turn, count or gap, dragging, adding and deleting single slices with ids; sections → regions → parts (no slots yet); slabs in 3D.
- `wafflePieces` in the cut plan and export, with the Plan2D selection adapter; tiny bits left out.
- `src/geom/arcfit.ts` copied byte-identical (§3.5); waffle pieces refit their arcs.
- Done when a sphere's slices export as circles within 0.05 mm of the true radius, written as arcs in SVG and DXF.
- Tests: sections of a box, cylinder, sphere and torus; part counts.

**Milestone 52: Slots that slide together**
- Crossing lines, intervals, split-height choice, slots through the outline, clearance per material; the checks and fixes in §6.4.
- Done when a sphere, a torus, the L-extrusion and the vase each export at default spacing with no problems listed. If one can't be cleared, it must at least be listed with a working fix.
- Tests:
  - the assembly property (A keeps material only below *m*, B only above);
  - every slot opens through its part's outline in its family's direction;
  - the split-height ranking on a fixture with a neck.

**Milestone 53: Base plate and labels**
- The plate (shape, margin, *cut flat at*), tabs and plate slots; part labels and partner labels; labels in the cut plan.
- Done when a sphere stands on a round plate in the export.
- Tests:
  - labels stay inside their part, at least 1 mm from every cut;
  - tabs keep clear of B slot mouths.

**Milestone 54: Assembly steps and finishing**
- The steps view; English and Hebrew review of every new string; the waffle thumbnail for submissions and the teacher view.
- `README.md` section, `DECISIONS.md` entries, `PROGRESS.md`, and `THIRD_PARTY.md` (manifold-3d).
- One e2e spec: build a shape → waffle → export, then check that the SVG has the expected part count.

## 10. Risks

1. **WASM on school machines.** About 205 KB gzipped, loaded only for waffle designs, with a loading state. If `manifold-3d` can't ship, the fallback is `three-bvh-csg` (MIT) for the 3D preview's booleans, with sections computed per shape and joined in 2D. A planar cut commutes with the booleans, and the shapes are simple. More code, but no WASM.
2. **Main-thread speed.** Target: under 50 ms per edit for 20 shapes and 2 × 8 slices. Above that, the derivation moves to a Worker and the last result stays on screen meanwhile.
3. **Leaks.** Every kernel call goes through `scope`, and a dev counter checks for objects left alive.
4. **Box regressions** from the Plan2D adapter and the `buildPieces` branch. Box unit tests run each milestone.
5. **The parked branch merging later.** The waffle is built on `main`, with two pieces copied from milestone 45 (§3.5). When the curved-walls branch is fixed and merged:
   - `arcfit.ts` is identical on both, so it merges cleanly.
   - The rounded-corner maths exists twice. Fold `src/sculpt/round.ts` into the branch's version then.
   - The schema numbers don't collide, because the waffle adds none.
6. **Engraving on card** can scorch. The material's engrave settings apply, and labels can be switched to the guide layer.
7. **Thin shells** give many tiny parts. They are left out with an info line, and the checks name what is left.

## 11. Later

### 11.1 Wrapping a waffle with panels

The 30° sketch snap keeps every straight side of an extrusion at an angle CutForge's angled joints know: 90°, 60° or 30° between neighbours. A later step could turn chosen flat faces of the solid into CutForge boards: the side faces of an extrusion, or a box's top. Those boards would be slotted onto tabs on the slices' outer edges, which would need two things:
- the solid's flat faces, with stable ids. Keep each shape's face groups from manifold (`originalID`/`faceID`) in the kernel from milestone 49, so they are there when needed;
- a joint where a slice's edge meets a board face, much like a divider meeting a wall.

### 11.2 Other slicing techniques

These all reuse §6.2's sections:
- **Stacked:** horizontal planes, glued. Dowel holes go in the area common to every layer, and each layer has the next layer's outline engraved on it.
- **Radial:** planes through a vertical axis, plus a core ring.
- **Curve ribs:** ribs along a curve, with a spine.

### 11.3 3D files and papercraft unfolding

See `MODEL_MODES_RESEARCH.md`:
- **Import:** meshoptimizer 1.3 for simplification and its voxel remesher, and manifold-3d to check and join the result.
- **Low-poly:** variational shape approximation (VSA), written in TypeScript.
- **Unfolding:** greedy joins with an overlap check at every join, randomised restarts, and tabs counted in the overlap check.

Once a mesh can come in, the waffle stage here slices it unchanged.
