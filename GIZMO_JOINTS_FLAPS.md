# CutForge: gizmo, joints, flaps and settings: brief

Planning notes from 2026-11-09, made after milestones 15–20 (`claude/determined-gauss-325m9f`), from using the deployed app. Built on `claude/gizmo-joints-flaps`, which branches from it.

## 1. What changes for a student

- **The gizmo follows the pointer.** Moving or turning a shape or a floor panel goes exactly where the pointer goes, with a trackpad or a mouse, however slowly you drag.
- **One choice changes every joint.** With nothing selected, the card has *Wall to base* and *Corners* joint lists. They offer only joints the material supports. Choosing one changes every joint of that kind of seam (including joints set by hand) and is the default for new ones.
- **Glue flaps fold off their own panel.** In the fold simulation a glue flap turns about its score line on the panel it belongs to, and lands on the panel it is glued to as the fold closes.
- **Settings when nothing is selected.** The card shows joint defaults, the material's fit values and snapping.

## 2. Decisions (from the interview)

| Topic | Decision |
| --- | --- |
| Bulk joints | **Two lists**: *Wall to base* (grown walls, dividers on a base, edge-on-face seams) and *Corners* (wall-to-wall closing seams). Each offers the kinds the material allows for at least one joint in that group. |
| Joints set by hand | **Changed too.** A single joint can still be changed afterwards. Joints the chosen kind can't be (angle, material) keep theirs, and the card says how many. |
| New joints | **The lists are the design's defaults.** A tray's own wall and corner joint still wins on that tray. |
| Flap timing | **Together with the panels**: a flap's turn follows the slider over its whole range. |
| Empty card | **Joint defaults, material and fit, snapping.** View options stay in View settings. |
| Material | **Common fields in the card** (thickness, kerf, clearance), plus a button that opens the material drawer to switch material. |

## 3. Milestones

### Milestone 21: gizmo drag stability

**Causes, confirmed in code and in a test.**

1. **Moves compound.** `ShapeGizmo` (`src/views/View3D.tsx`) reads the shapes' start positions from the live design, which already holds the last preview. Each pointer move then adds the whole offset again (`cx = moved cx + total du`). Dragging the pad 15 mm moved the shape 15 mm in one step, 45 mm in 5 steps and 234 mm in 30 steps. Trackpads send many small moves, so they suffer most. `ThroughEdit` already reads from `txnBase` and is not affected.
2. **The pivot drifts.** For several shapes, the turn pivot is the centre of their live (already turned) bounding box, so it moves during the turn. The gizmo centre moves with it, and the screen angle is measured from a moving point.
3. **Grazing views.** The pad intersects the pointer ray with the panel's plane, and an arrow takes the closest point on its axis. When the plane (or the axis) is nearly edge-on to the camera, a pixel of pointer travel becomes tens of millimetres.
4. **Small targets.** The arrow shafts are 4 px wide, and only the cone is easy to hit.

**Fix.**

- Read every start value (shape positions, bounding box for snapping, pivot) from the drag's base design, frozen at pointer-down.
- Grazing views: when the plane is within 20° of edge-on, or an axis within 20° of the view direction, move by screen distance instead. Project the axes to the screen and convert pixels to millimetres at the gizmo.
- Invisible hit zones about 16 px wide along each arrow, and a slightly larger pad.
- Tests: e2e drags of the pad and each arrow in 1, 5 and 30 steps land on the same place, and a two-shape turn keeps its pivot.

### Milestone 22: glue flaps fold off their panel

**Cause.** `flaps3d` is stored and drawn in the receiving panel's frame (`seams.ts`: `glue`, `cornerGlue`, `grownGlue`), and drawn with that panel's fold transform. In the fold view it rides on the receiver.

**Fix.** Each 3D flap also records its owner, the hinge (the score line, in the owner's frame, at the face it folds from) and its fold angle (flat on the owner to on the receiver). The view draws it with the owner's fold transform, turned about the hinge by `angle × foldT`. At `foldT = 1` it sits exactly where it does today, and at `0` it lies flat beside its panel as in the cut net. Tests: a unit test that the folded pose matches today's flap and the flat pose matches the net's added outline; an e2e check that the flap's position follows its owner.

### Milestone 23: design-wide joint kinds

- `Design.joints?: { base?: ConnectionKind; corner?: ConnectionKind; flap?: number }`, optional, so v7 files load unchanged and exports stay byte-identical.
- `setAllJoints(d, group, kind)` sets `kind` and `pref` on every connection of that group where the kind is allowed, records the default, and returns how many it changed and kept.
- New joints use the default when allowed: `connectSeam` (corners and edge-on-face seams), growing a wall from an edge, dividers, and side walls. A tray's own `wallKind` and `cornerKind` still win. `flap` replaces the automatic flap width when set.

### Milestone 24: settings card when nothing is selected

- **Joints**: the two lists (with the kept count after a change), and the default glue-flap width on card and corrugated.
- **Material and fit**: thickness, kerf and clearance (the same fields as the drawer, kept in sync), and *Change material…*, which opens the drawer.
- **Snapping** (a viewer preference, saved like the view options): smart snapping on or off (off works like holding Alt), the grid step (1 mm by default), and the turn step (15° by default).
- Template sizes, when the design has a template, stay at the top of the card.

## 4. Plan for the remaining limitations (milestones 25–27)

Written 2026-11-09, after milestones 21–24 and the follow-up (snapping toggles, darker add ghosts, outline point snapping, auto-curve points). Each milestone is small and independent, so they can ship in any order.

### Milestone 25: the gizmo ring seen edge-on

**Problem.** The ring turns by the pointer's screen angle about the gizmo centre (`Gizmo` in `src/views/widgets.tsx`). When the ring's plane is nearly edge-on it is drawn as a thin line or ellipse: the pointer can't follow it around, and a small move near the centre swings the angle wildly.

**Fix.**
- **A screen-facing ring while grazing.** When the ring's plane is within 20° of edge-on (the same `GRAZING_DEG` test as the pad), draw a second, camera-facing ring of the same screen radius in place of the flattened one, in a lighter tint, with the turn's axis shown as a short line through the centre. Dragging around it measures the screen angle as today: the angle is well-defined because the proxy is a full circle on screen.
- **Sign.** Positive stays counter-clockwise seen from the normal's side: the sign comes from N·(camera − centre) at pointer-down, as now. Edge-on, that dot product is near zero, so use the side the camera was on when the drag began, and fall back to the normal's side when it is exactly edge-on.
- **Dead zone.** Ignore pointer positions within 12 px of the centre (keep the last angle), so passing near the centre does not jump by 180°. Apply it in every view, not only grazing ones.
- Typed angles, Shift for 1° and Alt for free turning are unchanged.

**Tests.**
- e2e: a wall shape with the camera 5° above the wall's plane; dragging around the proxy ring 32° lands on 30°, the same as from the front.
- e2e: a drag that crosses the centre does not flip the angle.
- unit: `grazingRing(N, view)` returns true within 20° of edge-on, and false at 25°.

### Milestone 26: a design-wide joint the material does not allow

**Problem.** `Design.joints.base` / `.corner` can hold a kind the current material does not allow (fingers, after switching plywood → card). It is kept on purpose, so switching back restores it. Meanwhile it is unused, and the list silently shows the kind most joints have.

**Fix.**
- **Say what happens.** When the stored kind is not among the group's kinds, the list shows the kind in use and a note under it: *"Finger joint does not work on card: these joints use Fold. Your choice comes back if you switch to plywood again."* (`joints-<group>-inactive`).
- **One choice per material kind.** Store `joints` per material kind: `joints?: { plywood?: {...}; card?: {...}; corrugated?: {...} }`, and keep reading the old flat form (it migrates to the current material's kind on load). A switch to card and back then restores the plywood choices exactly, and card gets its own choices. The flap width already only applies to card and corrugated.
- **Material change.** `setMaterial` and `changeMaterial` re-apply the new material's stored choices (`setAllJoints` for each set group), as template regeneration already does.
- **Schema.** No version bump: `joints` is optional and the old flat form is still read. Exports of designs without `joints` stay byte-identical (golden tests).

**Tests.**
- unit: plywood with corners set to tab-and-slot, then card (the stored plywood choice is kept, card uses its default), card corners set to glue, back to plywood (tab-and-slot again), back to card (glue again).
- unit: a flat-form `joints` file loads into the current material's slot.
- e2e: the inactive note shows after a material change and names both kinds.

### Milestone 27: a settings card that fits a short stage

**Problem.** The card shows four blocks (template, joints, material and fit, snapping) and is taller than the stage on a Chromebook (1366 × 768, about 560 px of card space). It scrolls inside the dock, and *Snapping* is below the fold.

**Fix.**
- **Collapsible sections.** Joints, Material and fit, and Snapping become collapsible sections, using the existing `collapse-head` pattern from *Joints (n)* and *Add a divider*.
- **Summaries in the headers.** Each header shows a one-line summary, so a closed section still says what is set: *Joints — Fold · Glue flap*, *Material — Corrugated 1.6 mm · clearance 0.2*, *Snapping — Smart · Grid 1 mm · 15°*.
- **Open state per viewer.** Each section's open/closed state is saved with the view options. Defaults: Joints open, the others closed. On a stage shorter than 700 px, every section starts closed except the template's sizes.
- **Shorter notes.** The long help note under the joint lists becomes the list's `title` (a tooltip) plus a short *Changes every joint, also new ones*.

**Tests.**
- e2e at 1366 × 768: with the default open state the card does not scroll (`scrollHeight <= clientHeight`). Opening a section and reloading keeps it open.
- i18n: the new header summaries and notes are in `en.ts` and `he.ts`, with Hebrew screenshots.

### Order and size

Each milestone is a day or less. Suggested order: 27 (affects every student, on every Chromebook), then 26 (a confusing silent state), then 25 (a rare camera angle). None of them changes exports.
