# Decisions

Defaults chosen where the brief left room. Each is reversible.

## Coordinates and units
- Internal units are floating-point millimetres. Geometric tolerance `1e-6 mm`, curve tolerance `0.01 mm`, display precision 0.1 mm (students) / 0.01 mm (material settings), snap in screen pixels — separate constants in `src/geom/types.ts`.
- 3D world is y-up; the floor is the XZ plane. A panel's local 2D coordinates have their origin at the bottom-left corner of its outline's bounding box; edges are named by keys (see *Polygons and cuts*), and a rectangle's edges are `e0` bottom, `e1` right, `e2` top, `e3` left (counter-clockwise).
- The cut plan uses sheet coordinates with y up from the bottom-left; SVG export flips y. Shelf packing starts at the top-left so files look like LightBurn's usual top-left origin.

## Panels, thickness and growing
- A panel's frame stores its plane origin, in-plane axes `u`, `v`, and the side of the plane the material lies on. The first panel lies on the floor with material rising upward.
- **Angle definition:** the angle between the new panel and its parent, measured inside the fold (between the two panels' material faces), so 90° stands the new panel upright. 180° would be flat.
- **Direction:** *Up* grows from the parent face the material lies towards, *Down* from the other face.
- **Hinge angle (interface):** students see one angle from 0° to 360°, measured from the parent's material face through the inside: 90° upright, 180° flat, 270° on the other face. It maps onto the stored angle and direction (Up a = a, Down a = 360 − a), so projects need no migration. Dragging snaps to 5° (Alt: 1°) with a pull onto multiples of 45°; any value can be typed.
- **Buildable angles** (`src/model/hinge.ts`), shown as zones on the dial. Only impossible angles are errors:
  - Red, and growing is blocked: within 10° of lying on the parent, or dipping below the floor.
  - Amber is a note only and never blocks:
    - plywood leaning over its parent without side walls: *Add side walls* is offered, and a glued edge-to-edge joint is also allowed;
    - plywood leaning out past the edge: only a glued edge holds it;
    - exactly flat (180°).
  - Card and corrugated fold or glue at any angle with no note.
  - The export check still flags a leaning panel that nothing holds.
  - Turning an existing panel into a red zone is refused and the reason is shown.
- **Stage hinge handle:** a knob with a short arc around the current angle and an angle label. The full colour-zoned circle and the reason appear on hover and while dragging.
- **Preferred joint.** Each connection remembers the joint that was asked for (`pref`). It defaults to fingers on plywood and a fold on card and corrugated, or whatever the student picked. When the angle or material rules it out, the joint falls back to the default for that case, and it returns to the preferred one as soon as that is allowed again (for example, plywood fingers at 90°, an angled tab joint at 65°, then fingers again back at 90°).
- **Automatic joining** (`autoConnect`, run after every edit and during drags). Panels that meet are joined without asking:
  - plywood corners get finger joints;
  - an edge meeting a face gets tabs and slots (a leaning panel against its side walls, divider ends);
  - card and corrugated corners get glue flaps, so a folded tray stays one net.

  When panels stop meeting, or now meet differently, their automatic joint is removed and re-made to match.

  Overriding:
  - Changing a joint's kind, or connecting by hand, makes it manual. A manual joint is kept, flagged broken, when the panels stop meeting.
  - Deleting a closing joint by hand records the pair (`noAutoSeams`), and it is not joined again until the student connects it.
  - Joints in projects saved earlier count as automatic.
- **Hinge knob placement:** the stage knob sits 20% along the edge (at most 40 mm in), not at the middle, so it never covers the height arrow when the panel is seen from above. Dragging works in screen space: around the circle where it is seen well, and along the knob's path (or up and down) where it is seen edge-on.
- **Joints on the stage** are hidden by default (*Show joints* toggle). Broken joints still show a pill. In the panel card the angle stays at the top level; the joint list and meeting panels are in a collapsed *Joints (advanced)* section, with a *Connect all* notice above it when panels meet without a joint.
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
- The first screen asks for the material first, then the template (mockup order), with the language toggle on the same screen so a Hebrew-speaking student can switch before choosing. Template pictures are rendered from the real template generators at load (`src/views/thumbnail.ts`), so they always match.
- Hebrew uses "לוח" for a panel and "גיליון" for a material sheet.

### Visual overhaul (see `VISUAL_OVERHAUL.md`)
- **Look:** warm cream shell (top bar, start screen, cut plan) with a teal accent; a cool grey 3D stage with a dark floating tool rail. Every UI colour is a token on `:root` in `src/styles.css`; part colours live in `src/views/palette.ts`. Light theme only; the tokens leave room for dark mode. UI font: Rubik (variable, Latin + Hebrew, bundled, offline).
- **Layout:** floating, contextual. The inspector is a card that appears only for a selection (or, with nothing selected, for a template's sizes). While an edge is selected, the grow card replaces it in the same place, so one task has one card. The grow card sits in the card slot rather than next to the edge so it never covers the ghost or the stage widgets, which are at the hinge.
- **Material calibration** (thickness, kerf, clearance, fold allowance, sheet, margin, gap, grain) lives only in the *Material & sheet* drawer, opened from the material pill. File actions (new, open, save) and the teacher link are in the project-name menu.
- **Part names:** a panel whose stored name is the automatic number is shown by role (template roles, or how it was made: base, front/right/back/left wall from the floor panel's edges, divider, leaning panel). The stored name is unchanged, so switching language renames parts and old projects get role names. A typed name always wins (`src/model/names.ts`).
- **3D parts:** flat tinted colour per material, with a deterministic small lightness/hue shift per part (by creation order) so neighbouring parts never merge; cut edges (extrusion sides) use a darker edge colour so thickness, fingers and tabs read. Outlines (`EdgesGeometry`, 25°) can be switched off. Selected parts get a thick teal outline and a slight lift; other parts dim slightly while something is selected.
- **Quality:** *Simple* = hemisphere + key light and a contact shadow re-rendered once after each finished edit; *Rich* adds GTAO ambient occlusion (three's `GTAOPass`). *Auto* (default) uses Simple on software renderers (SwiftShader/llvmpipe) and otherwise starts Rich and drops to Simple if orbiting runs slower than ~28 ms a frame; the result is remembered per browser. The canvas renders on demand, so an idle stage costs nothing. No shadow maps: 3 mm panels shadow-acne badly and the contact shadow carries the grounding cue.
- **Stage widgets** are drawn on top at a constant screen size: angle dial at the hinge (detents at the allowed angles, picked by the nearest projected handle), push-pull arrows (ghost height; selected panel width/height, one undo step per drag, Esc cancels), flip badge on the ghost, in-place W/H dimensions (click to type). DOM labels and buttons render into an overlay outside the canvas's event area so a click on them never also clicks the scene. The DOM angle dial in the cards is a keyboard-operable radiogroup that keeps the `grow-angle-*` / `conn-angle-*` test ids.
- **Edges** are picked with screen-sized hit targets (≈14 px at any zoom), shown as dashed hints on the selected/hovered panel, with a "+ Grow" pill on hover. Only free edges are pickable; connected edges show joint pills instead.
- **Joint pills** appear for the selected panel's connections (and broken connections always). Clicking one opens that joint in the card's joint list; the parent joint is open by default.
- **Folds:** a rounded bead (radius t/√2, centred on the corner square) along each fold with a dashed score-blue crease on the outside. The fold slider unfolds nets in the view only: each fold child's subtree turns rigidly about a hinge half a thickness below and into its bottom edge, which lays it flat beside its parent. Editing is paused while unfolded.
- **Number controls:** sizes are scrub fields (drag the label: 0.5 mm per 2 px, Shift ×10, Alt fine) that commit once on release; counts are − / + steppers with a short slider when the range is small (finger counts step by 2).
- **Cut plan:** the sheet is a light tint of the material (hairline flutes for corrugated), with a chip naming the sheet, material and size. Pieces use their part's tint and role name; lines keep the LightBurn operation colours. *Fit* frames the sheets in the area the rail and card leave free, on the correct sides in RTL.

## Polygons and cuts (see `POLYGONS_AND_CUTS.md`)
- **Sketch is the authority for a root panel's shape.** `w`/`h` are re-derived from the sketch's bounding box, which is kept at the local origin (moving the frame and the shapes when a vertex edit would move it). Resizing a root panel scales its sketch (`x / oldW × newW`, so a rectangle stays exact).
- **Edge keys** are strings throughout the model. Model functions also accept a number `n` for `e<n>` (and -1 for `face`), so rectangle code reads the same; anything stored is a key.
- **Template ids** keep the old edge numbers in derived connection ids (`t:c:base.0-wall0.0`), so ids are the same in v5 and v6 projects.
- A grown panel's width follows its parent edge. On a rectangle parent, typing the width resizes the parent as before; on a polygon parent it moves that edge's end vertex along the edge.
- **Edge-on-face clipping** uses the receiving panel's outline polygon (the longest inside run on a non-convex outline), so tabs stop where a polygon or notched panel ends.
- Edges shorter than 5 mm (`MIN_PANEL`) get no grow handle.
- **Polygon tool** works on the 3D stage only (its rail button is hidden in the cut plan and face-on view, like the panel tool); shapes drawn on panels are stored like imported paths. Double-click still opens the face-on view; outline editing is on the base's card (*Edit outline*), so the existing gesture keeps its meaning.
- **Corner angle range:** corners are detected and jointed from 30° to 150° (sin α ≥ 0.5). At 90° the old code path runs unchanged (byte-identical output).
- **Angled finger depth:** the panel that gives way is cut back `t / sin α` (obtuse) or `t·cot(α/2)` (acute); when acute, the owning panel's end is also trimmed by `t·cot α` so its square-cut end does not poke out past the other's outer face. Outer faces stay flush; the gaps are shown as a note in the joint card.
- **Corner tab-and-slot:** two walls whose ends meet at an outside corner cannot carry closed slots with flush outer faces (any slot would open at the receiver's end). The receiver's end is therefore extended past the corner by the slot's reach plus the minimum web; this small lip is the visible cost of closed slots. Tabs are as long as the receiver is deep along the owner (flush with its outer face).
- **Corrugated corners default to tab-and-slot** for hand-built designs. The organiser and card stand templates ask for glue flaps explicitly, so template designs (and their exports) are unchanged.
- **Corrugated tabs** are at least max(4 mm, 3t) wide, so a tab spans several flutes; the tab count drops to fit.
- **Vertex editing:** vertices snap to whole millimetres; a move or delete that would make the outline cross itself (or turn it inside out) is refused.
- **Shapes and outlines:** Adds are unioned with the sketch first, then crossing Cuts are subtracted, so a Cut always wins. A Cut is a hole only if it lies strictly inside the sketch (or the sketch with its Adds) without touching an edge; touching counts as crossing. Shape segments are numbered along each instance's flattened outline (`<detail>.<i>`, arrays `<detail>.<copy>_<i>`).
- **Closing seams stay on whole edges** (`e1`, not `e1#0`): the joint is laid out separately for each pair of pieces that meet. Pieces that meet over less than three fingers' room (3·max(t, 3 mm)) leave fingers out there, and the later panel gives way, so material never overlaps.
- **Wall sets keep one height, angle and joint** for all their walls (edit any one of them); derived walls copy the name and quantity of the wall they came from.
- **Fragments:** the largest keeps the piece's key and quantity; the others are `<key>~2` … and are cut in the same quantity. A sliver is a fragment whose area / half its perimeter is below half the minimum web.
- **Vertex delete** merges two walls into the one on the surviving edge; the removed wall's shapes keep their place in space along the merged edge, and panels grown from the removed wall move to the kept one.
- **Tray height is the outer height** from the underside of the base, as for the organiser template: walls that stand on the base are `H − t` tall, finger walls (which overlap the base edge) `H`.
- **Tray wall ids** are `<tray>/<edge key>`, so a wall keeps its id (and its shapes) as long as its edge does. A wall set made by a cut (`<wall>~1`) covers further pieces of a walled edge, so a tray never stands two walls on one piece.
- **Inside corners:** the wall on the edge leaving the reflex vertex reaches back across the corner; the other wall's end stands on its outer face (an edge-on-face seam, tab-and-slot on plywood and corrugated). With tab-and-slot it reaches a further minimum web + c/2 so the slots are closed. Corners that are not square are approximated by the same reach (`t / sin` of the turn).
- **Extrude is offered** only on a root panel with no tray and no wall at its edges (dividers standing inside are allowed). The ghost uses the material's default wall joint.
- **Wall outline handles:** the bottom (attached) corners are shown greyed and cannot be dragged on the stage (the brief's §10); the model still allows a bottom corner to slide along the edge (`setWallCorner` with dy forced to 0) for later use. Corner and insert moves snap to whole millimetres.
- **Corner slivers** are removed only past finger corners (the plywood case where a lowered wall meets a taller one); other corner joints are unchanged.
- **Through-cut regions** are sampled for joints at 0.25 mm along each shared edge; a surviving stretch shorter than three fingers' room gets no fingers. Edge-on strips run the full panel along the cut direction (the cut goes through the whole design).
- **A removed panel** stays in the model and the 3D view (faint amber ghost) and is left out of the cut plan; its joints break, which the export check also reports.
- **Linked selection** works in 3D (click the cut region on any panel it reaches). In the cut plan the derived cuts are part of each piece's outline and holes.
