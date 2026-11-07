# Decisions

Defaults chosen where the brief left room. Each is reversible.

## Coordinates and units
- Internal units are floating-point millimetres. Geometric tolerance `1e-6 mm`, curve tolerance `0.01 mm`, display precision 0.1 mm (students) / 0.01 mm (material settings), snap in screen pixels — separate constants in `src/geom/types.ts`.
- 3D world is y-up; the floor is the XZ plane. A panel's local 2D coordinates have their origin at the bottom-left corner of its outline; edges are numbered 0 bottom, 1 right, 2 top, 3 left (counter-clockwise).
- The cut plan uses sheet coordinates with y up from the bottom-left; SVG export flips y. Shelf packing starts at the top-left so files look like LightBurn's usual top-left origin.

## Panels, thickness and growing
- A panel's frame stores its plane origin, in-plane axes `u`, `v`, and the side of the plane the material lies on. The first panel lies on the floor with material rising upward.
- **Angle definition:** the angle between the new panel and its parent, measured inside the fold (between the two panels' material faces), so 90° stands the new panel upright. 180° would be flat.
- **Direction:** *Up* grows from the parent face the material lies towards, *Down* from the other face.
- The new panel's material always lies on the inside of the fold and the panels' outer faces are flush: panels are sized by **outer dimensions**, and the first `t` mm of the new panel overlap the parent's edge strip, which is where the joint is cut.
- A connected child panel's width is owned by its parent edge. Editing the child's width resizes the parent edge instead (and the inspector says so). Child frames are re-derived from their connection after every edit (`solve`), so the assembly never needs a regeneration step.
- Milestone 1 offers 90° only; other angles come with folds and side-wall slots in milestone 2 (the edge toolbar says so rather than showing an inactive choice).

## Finger joints
- Odd finger count (default: about `max(3 × thickness, 10 mm)` per finger, minimum 3; editable). Segment 0 and the last segment belong to the parent, so the parent owns both corners.
- **Corner ownership for three-panel corners** is milestone 2. Planned rule: at a corner where three mutually perpendicular panels meet, the corner cube belongs to the panel created first (lowest creation order); the others are cut back by the thickness there.
- **Clearance is applied once per connection:** the parent's slots are widened by `clearance / 2` at each interior end; the child's fingers stay nominal. Depth is the nominal thickness.
- Materials that cannot take finger joints fall back to an edge-to-edge (butt) connection automatically when the material changes.

## Pieces and quantity
- Milestone 1: every panel is one piece (folds that join panels into one net arrive in milestone 2). Quantity is stored per piece; copies share geometry and the packer places each copy.

## Export
- Nominal export is the default and, in milestone 1, the only mode. Kerf compensation will be applied only in export preparation (`src/export/prepare.ts`), never in the model.
- DXF is R12 for the widest compatibility. Closed contours are written as closed `POLYLINE`s with bulges (arcs preserved, single closed shape on every layer), whole circles as `CIRCLE`, open contours as `LINE`/`ARC`. SVG writes stroke-only paths with arcs on every layer (engrave areas are closed paths; set the layer to *Fill* in LightBurn).

## Editing
- Drawing snaps to a 1 mm grid in panel coordinates until smart snapping (milestone 3).
- Dragging a root panel on the floor moves it; dragging empty space orbits the camera. Child panels follow their parents.
- Every edit runs through the store's transactions: `apply` = one undo step, `preview` during a drag always re-applies to the state at the start of the gesture, `commit` makes the whole drag one undo step, `cancel` (Esc) restores. Edit recipes' return values are ignored so a recipe can't accidentally replace the design.

## Interface
- The material and language choice appear together on the first screen so a Hebrew-speaking student can switch before choosing.
- Hebrew uses "לוח" for a panel and "גיליון" for a material sheet.
