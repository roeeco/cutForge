# CutForge interaction refinements: brief

Planning notes from 2026-11-09, made after milestones 7–14 (`claude/determined-heisenberg-r9mf5w`). This milestone set fixes issues found while using the app and reworks features that work but are too basic: dividers, growing, through-cut editing and the fold slider. It also adds one move-and-rotate gizmo. It does not change export formats, the Worker or the visual language from `VISUAL_OVERHAUL.md`.

Start it on its own branch from `claude/determined-heisenberg-r9mf5w` (or from `main` once that branch has merged).

## 1. What changes for a student

- **Grow never gets in the way.** The *+ Grow* pill and its hover target stay clear of the width and height arrows. Dragging a wall's edge to extend it always works.
- **Walls that touch always join.** If two panels touch or collide, they are joined. If they can't be joined, the export check says so. They never stay silently unjoined.
- **The fold slider is always there.** On card and corrugated, whenever the design has a fold, the fold/unfold slider sits at the bottom of the stage.
- **Move and rotate with one gizmo.** A selected shape, or a selected floor panel with everything grown on it, shows one gizmo: drag the centre or the arrows to move it, and drag the ring to rotate it. Both snap.
- **Dividers are quick to make and easy to change:**
  - *Automatic*: type a number of horizontal and vertical dividers, and they are spaced evenly in the clear inside.
  - *Drag*: drag a divider on the stage to move it. It snaps to equal spacing and to compartment centres, and the compartment sizes show while you drag.
  - *Between two faces*: Shift-click one wall's inner face, then the face opposite it. A *Divider between* pill appears where you clicked.
- **Grow adapts to what it meets.** The ghost's height and angle snap to other panels' edges. Its width can be less than the full edge. Its outline trims itself to fit the panels it would run into, such as a wall under a sloped roof. Editing the outline by hand is optional, and can be done on the ghost before you commit.
- **Through-cuts are edited like any other shape.** You can resize them, edit their vertices and use the gizmo on them from any panel they cut, with the same smart snapping. Snap targets include the panels they pass through.

## 2. Decisions

| Topic | Decision |
| --- | --- |
| Gizmo targets | **Shapes and floor panels.** Shapes move and rotate in their panel's plane. A floor panel moves on the floor and turns about the vertical axis, carrying its whole assembly. A grown panel keeps its hinge dial and does not get the gizmo. |
| Divider placement | **Automatic (H × V counts), drag, and between two faces** (Shift-click two opposing faces). The current *Add a divider* card becomes the automatic option. |
| Grow snapping | **Height and angle snap** to other panels' edges, **and partial width**: start and end slide along the edge and snap to corners, midpoints and other panels. |
| Grow outline | **Adapts automatically**: the ghost is trimmed to the panels it would collide with, and this can be turned off. **Edit outline on the ghost is optional**, available before committing. |
| Grow pill placement | **Never at the centre of an edge.** The centre belongs to the push-pull arrows. |
| Fold slider | **Always at the bottom of the stage** when the design has a fold (card or corrugated). It is no longer hidden in View settings or a panel's card. |
| Auto-connection | **No silent misses.** Every pair of panels whose slabs touch or overlap is either joined or flagged. |

## 3. Milestones

Bugs and small fixes come first, so they can ship on their own. Schema v7 (rotation) arrives with the gizmo.

### Milestone 15: grow pill and fold slider

**Cause, confirmed in code.** `PanelWidgets` puts the width arrow at `(w, h/2)` and the height arrow at `(w/2, h)` (`src/views/View3D.tsx:991-992`). Those are the midpoints of the right and top edges. `EdgeHandle` (`View3D.tsx:588`) puts its invisible hit box, about 14 px across, and the *+ Grow* pill on the midpoint of every free edge (`pos`, line 596). Both compete for the same pointer events.

- Leave a gap in the edge hit target around the midpoint, at least the arrow's screen size plus a margin. Show the pill near the pointer, clamped out of that gap, or else at a fixed point at about 30% along the edge.
- When an edge is too short for that gap, the arrow wins and the edge can be grown from the card's *Grow from* buttons instead.
- **Fold slider.** It is now shown in View settings (`View3D.tsx:1255`) and in a panel's card only when that panel is in a net (`Inspector.tsx:139`). Move it to a stage bar at the bottom centre, shown while `netGroups(design)` has a group of 2 or more. Keep it clear of the bottom-right buttons and the view cube. Remove the other two copies.
- Tests: an e2e that drags `pp-width` and `pp-height` while hovering the edge, and checks the size changed and nothing was grown; the slider shows for a card tray and hides for plywood.

### Milestone 16: reliable auto-connection

The cause is not reproduced yet. The first step is a repeatable failing case. Likely causes found by reading `seamBetween` / `findOpenSeams` / `autoConnect` (`src/model/seams.ts:735-767`, `src/model/ops.ts:383`):

1. **Only touching counts.** `cornerFit` and `faceFit` need edges within `TOL = 0.02 mm` of a face or edge. Panels that overlap ("collide") after a drag, a typed size or a rotation are never detected.
2. **One seam per pair.** `seamBetween` returns the first match, and `connectedPair` skips any pair that already has a connection of any kind. A second contact between the same two panels is never joined. Examples: a wall touching another along two edges, an L-shaped outline, or a grown panel that also touches its parent's neighbour.
3. **Angled faces are skipped.** `seamBetween` calls `faceFit` with `angled = false`, so an edge meeting a face at an angle other than 90° is never found automatically.
4. **Non-convex receivers.** `clipToOutline` keeps only the longest run on the receiving outline, so a contact split by a notch only partly joins.

Plan:

- Write a fuzz test with seeded random boxes, trays, dividers and leaning panels, and assert this rule: *every pair of manufactured panels whose slabs touch or overlap (checked with the volumetric sampler in `tests/solid.ts`) has a connection or a flag*. Fix what it finds, in the order above.
- Overlap: treat a small overlap of up to `t` as touching, and seat the joint at the contact. A larger overlap gets a new *panels collide* flag that selects both panels.
- Allow several seams per pair, keyed by both edges, not just by the pair. `noAutoSeams` stays keyed by pair, since unjoining by hand applies to the whole pair.
- Detect angled edge-on-face contact automatically, and offer the joints `seamKinds` allows.
- Add a validation message: *X and Y touch but are not joined*. It is shown only when no joint fits, with a reason.

### Milestone 17: move and rotate gizmo (schema v7)

- **Model.** Add `Detail.rot` (degrees, around the shape's centre) and a floor-panel yaw. A floor panel's frame `u` and `v` turn about world Y, and its children follow through `solve`. Migration from v6 to v7 sets both to 0, so v6 exports stay byte-identical (add a golden test).
- **Geometry.** Rotated shapes go through `polygon-clipping` as polygons. A circle is unchanged by rotation. A rounded rectangle's arcs must be rotated in the SVG and DXF writers. Snapping uses the rotated shape's corners, not its bounding box. Arrays rotate as a group around the array's centre.
- **Gizmo** (`src/views/widgets.tsx`): a centre pad for free move, two axis arrows, and a rotation ring, all screen-sized. Rotation snaps to 15°, Shift gives 1° steps and Alt turns snapping off. Moves use the existing smart snap (`src/model/snap.ts`). Floor-panel moves gain snapping to other floor panels' edges, where today they snap only to the grid. While dragging, the gizmo shows the angle and the offset, and both can be typed. It works in 3D and in the 2D plan (rotation only for shapes there).
- Grown panels keep the hinge dial, and the gizmo is not shown for them.

### Milestone 18: dividers

The divider card today (`DividerAdder`, `src/ui/Connections.tsx:225`) is a hidden collapsible with an edge dropdown, a position and a height. `addDivider` (`ops.ts:421`) grows from base edge 0 or 3 at an offset.

- **Automatic.** The card shows *Across* and *Along* counts, the height, and *even* or *by compartment size*. It generates dividers spaced evenly in the clear inside, like `templates/organiser.ts` does, with half-laps where they cross. The dividers stay a set (`Design.dividerSets`), so changing a count re-spaces them, and changing the box re-spaces them too. A divider dragged by hand leaves the set and keeps its position.
- **Drag.** A selected divider shows a slide handle along its normal, which changes the grow offset. It snaps to equal spacing, compartment centres and the other dividers. While dragging, every compartment size along that axis is shown and can be typed.
- **Between two faces.** Shift-click two faces. If they face each other, are parallel within 1°, and both stand on the same base, show *Divider between* at the second click. It makes a divider square to both, at the clicked position (projected), with the height of the lower wall minus the default gap. Joints on both ends are added by auto-connection. Polygon trays allow any two opposing parallel walls. On non-parallel faces the pill appears greyed with the reason.
- Polygon bases: the automatic option is offered only on rectangular clear insides. Other shapes get *drag* and *between two faces*.

### Milestone 19: adaptive grow

- **Snapping height and angle.** While the ghost's push-pull or hinge dial is dragged, its free edge snaps to other panels' edges, faces and heights. Examples: a lid lands on the opposite wall, and a new wall matches its neighbour's height. Snaps show as guides, and Alt turns them off.
- **Partial width.** `Connection` gets `span: [s0, s1]` along the parent edge (it defaults to the whole edge). The ghost shows two end handles that snap to corners, midpoints, other panels and existing grown panels. This lifts the *A grown panel always spans the full edge* limitation. Joints, wall sets and trays have to handle a span less than the whole edge. Trays keep full-width walls.
- **Adapting to what it meets.** Compute the ghost panel's collision with every panel in its path, using the layer-5 machinery from `through.ts`, and trim its outline to the contact. A wall under a sloped roof gets a gable, and a panel grown into a neighbour stops at its face. The trims are stored as ordinary wall-sketch corners and inserts, so they stay editable. An *Adapt to neighbours* switch on the grow card (on by default) turns this off.
- **Edit outline on the ghost** (optional): an *Edit outline* toggle on the grow card turns on the milestone-11 corner and insert handles on the ghost before committing.
- After a commit, auto-connection joins the trimmed edges (milestone 16).

### Milestone 20: through-cut editing and snapping

- Check first which edits work on a through-cut today, on its source panel and on panels it reaches. `ThroughLinks` (`View3D.tsx:755`) only selects the source. Then make resize handles, vertex editing (polygons) and the gizmo appear on any panel the cut reaches, with the shape projected onto that panel, so edits act on the one live feature.
- Smart snap: today `snapContext` uses the panel's bounding box `0..w × 0..h` and its own shapes. Change it to:
  - the real own outline (polygon vertices, edge midpoints, wall gables);
  - for a through-cut, the outlines and shapes of every panel in its path, projected into the source plane.
- The polygon tool's live count badge works while the polygon is being drawn (a limitation from milestone 12).

### Final verification

- All golden exports are byte-identical except where a change is intended and listed.
- v6 projects migrate to v7 with no change in their output.
- The full Vitest and Playwright suites pass.
- Every new string is in both `en.ts` and `he.ts`, with Hebrew screenshots of each new widget.
- The auto-connection fuzz test runs at least 500 seeds and finds nothing.
- The stage still renders on demand.

## 4. Settled points

Decided on 2026-11-09:

- **Rotating floor panels in trays and templates is allowed.** A tray turns as one rigid assembly. A template's floor panel keeps its rotation when the template's settings change.
- **A hand-dragged divider leaves its automatic set** and keeps its position, and the rest of the set re-spaces. The divider card shows a *Space evenly again* button that brings dragged dividers back into the set.
- **Overlap up to t counts as touching** and is joined at the contact. A deeper overlap gets the *panels collide* flag.
