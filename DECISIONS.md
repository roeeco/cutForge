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
- **Seating:** finger joints use *overlap* seating (the new panel's first t mm overlap the parent's edge strip, where the fingers are cut). All other connections stand the new panel *on* the parent's face next to the edge, so nothing overlaps. Tab-and-slot walls stand in from the edge by a default of max(min web, t) so a web of material stays outside the slots.
- **Leaning panels** are lifted by t·cos(angle) so their lower slab corner rests on the parent face (a square-cut edge touches along one line) instead of dipping into it.

## Finger joints
- Odd finger count (default: about `max(3 × thickness, 10 mm)` per finger, minimum 3; editable). Segment 0 and the last segment belong to the parent, so the parent owns both corners.
- **Finger seams between any two edges** are laid out along the shared line, over the part where both edges overlap. The panel that comes first in creation order is side `a` and owns the even segments, including both end segments.
- **Three-panel corner rule:** where three perpendicular panels meet, the corner cube belongs to the panel created first. This follows from the rule above: the base (first) owns the ends of both its seams, and of two walls the earlier one owns the ends of their vertical seam while its own corner is already cut back by the base seam. The volumetric test checks that each point of the corner is material exactly once.
- **Clearance is applied once per connection:** the parent's slots are widened by `clearance / 2` at each interior end; the child's fingers stay nominal. Depth is the nominal thickness.
- Materials that cannot take finger joints fall back to an edge-to-edge (butt) connection automatically when the material changes.

## Other connections
- **Clearance applied once per connection:** fingers widen the `a` side's slots by c/2 at each interior end; tab-and-slot slots are the tab's footprint grown by c/2 on every side (so the slot is tab + c in both directions) and tabs stay nominal; slide fits stop the edge c short; half-lap slots are t + c wide. Nothing else adds clearance.
- **Tabs:** about one tab per 40 mm (editable), laid out in 2n+1 equal segments with tabs on the odd ones, so the ends of an edge are never tabs. Tabs are exactly the receiver's thickness long, flush with its far face.
- **Slots** are computed as the projection of each tab's volume onto the receiving panel, so slots in side walls for leaning panels come out at the lean angle and the exact width automatically.
- **Glue flaps:** on a grown panel, the flap is on the new panel's bottom edge and folds onto the parent face towards the parent's interior. On a closing seam, the flap is on the earlier panel, which is cut back by the other panel's thickness; the flap folds onto the other panel's inner face. Width: 10 mm card, max(15 mm, 4t) corrugated; tapered 45° ends.
- **Half-laps:** the earlier divider is slotted from its top edge, the later from its bottom edge, each to half the shared height.
- **Folded nets:** a child panel is unfolded rigidly about its fold line into the parent's flat coordinates (mirrored where needed so the material side stays the same), offset by the material's fold allowance, with the score line in the middle of that strip. Mountain/valley is recorded per fold (default: valley for *Up*).
- **Broken seams:** each connection stores its last valid geometry. If its edges stop meeting after an edit, that geometry is kept and the connection is flagged `broken` (shown in the inspector and the export check) rather than reshaping any panel.
- **Card/corrugated dividers** rest on the base and slide between the walls with the fit clearance (no wall slots, which would weaken them); plywood dividers use tabs into base and wall slots.

## Pieces and quantity
- A piece is one panel or one folded net (rooted at its earliest panel). Quantity is stored on the piece's root; copies share geometry and the packer places each copy. Outlines of a net (and glue flaps) are unioned with `polygon-clipping`; coordinates are snapped to 1e-7 mm first so panels that touch exactly stay touching after transforms.

## Export
- Nominal export is the default and, in milestone 1, the only mode. Kerf compensation will be applied only in export preparation (`src/export/prepare.ts`), never in the model.
- DXF is R12 for the widest compatibility. Closed contours are written as closed `POLYLINE`s with bulges (arcs preserved, single closed shape on every layer), whole circles as `CIRCLE`, open contours as `LINE`/`ARC`. SVG writes stroke-only paths with arcs on every layer (engrave areas are closed paths; set the layer to *Fill* in LightBurn).

## Editing
- Drawing snaps to a 1 mm grid in panel coordinates until smart snapping (milestone 3).
- Dragging a root panel on the floor moves it; dragging empty space orbits the camera. Child panels follow their parents.
- Every edit runs through the store's transactions: `apply` = one undo step, `preview` during a drag always re-applies to the state at the start of the gesture, `commit` makes the whole drag one undo step, `cancel` (Esc) restores. Edit recipes' return values are ignored so a recipe can't accidentally replace the design.

## Editing tools
- **Snapping** works in the panel's own coordinates. Candidate x/y values come from the panel (corners, edge midpoints, centre) and every other shape's box (corners, edge midpoints, centre, array copies included); a moving shape snaps its left/centre/right and bottom/centre/top; equal-spacing candidates centre a shape between its neighbours or repeat the neighbouring gap. The nearest candidate within 10 screen pixels wins (several equal ones all draw their guides). Alt turns it off. Snapping never stores a relationship.
- **Selection** of several shapes is stored as ids with a primary (the last clicked). Pressing on a shape that is already selected drags the whole group.
- **Align/distribute** require one flat surface: all shapes on panels that are coplanar (parallel normals, same plane). Boxes are measured in the primary shape's panel coordinates; distribute keeps the two outermost shapes where they are.
- **Group resize** scales centres and sizes about the opposite corner of the group box; circles stay circles (scaled by the geometric mean); array spacing scales with the group.
- **Arrays** are stored on the source shape (`array: { nx, ny, dx, dy }`, centre-to-centre spacing in panel coordinates) and expanded only when geometry is derived, so they stay live.
- **Solo view** reuses the 2D editor with a single panel in its own coordinates (no fold partners, no sheet). The 3D camera and each 2D view's framing are remembered for the session while another view is open.

## Templates
- Generated entities get stable ids from their role (`t:base`, `t:wall0`…`t:wall3`, `t:divX1`, `t:divY1`, `t:lidbase`, `t:lidwall0`, `t:side1`, `t:support1`, `t:lip`); connection ids are derived from their two ends. Regeneration builds a fresh design and carries user edits over by those ids.
- Organiser sizes: *inside* sizes add the wall thickness on each side (and the base thickness to the height); *outside* sizes are used as given. Dividers are spaced evenly in the clear inside.
- Lid: a lift-off telescoping tray, generated as a second piece next to the box, open side up in the 3D view (turn it over to use it). Inner size = box outer size + 2 × clearance; rim height is measured inside.
- Changing the material (or its thickness/clearance) of a template design regenerates it, so the lid, slots and inside sizes always match.
- Card stand support spacing = (card thickness + 3 mm + material thickness) / sin(angle), measured along the base; supports are 50 mm tall.

## Class submission and teacher access
- **Teacher access** uses one teacher key stored as a Worker secret (`TEACHER_KEY`), exchanged for a 12-hour HMAC-signed, HttpOnly, SameSite=Strict session cookie scoped to `/api`. The brief suggested an email magic link or passkey; a magic link needs an email-sending service and a passkey needs a registration flow, neither of which can be set up or tested in this environment. The key is the nearest reversible alternative: only the login endpoint changes if a magic link or passkey is added later.
- **Student identity** is a display name plus a random per-browser device id (so a resubmission replaces the previous one); no accounts.
- The server **never trusts submitted geometry**: it stores the project file and a preview; the teacher view regenerates SVG/DXF from the project with the student code. The server parses and migrates the project on upload to refuse malformed files and to record material and piece count.
- **Rate limits** are counted from D1 (submissions in the last 10 minutes per class and per device) rather than a separate store, so they need no extra binding.
- Batching requires the same material kind and thickness; the first submission's sheet size, margin and spacing are used. Labels use the GUIDE layer (green, C03); the name falls back to initials when it does not fit a piece, and is left out when even that does not fit.

## Interface
- The material and language choice appear together on the first screen so a Hebrew-speaking student can switch before choosing.
- Hebrew uses "לוח" for a panel and "גיליון" for a material sheet.
