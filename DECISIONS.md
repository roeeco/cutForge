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
- **Through tab length:** `t + lockDepth`, where `lockDepth` (default max(4 mm, 1.5t): 6 mm on 4 mm board, 4 mm on 1.6 mm) is the part past the receiver's far face that folds under. This is the same reach as a fold-over lock tab (t + max(4, 1.5t)). The score is a plain SCORE-layer line across the tab.
- **Through tabs are set per joint** (*Joints, advanced*) or for all the corners of a tray (tray card); changing it makes an automatic joint manual, so it is kept.
- **Fold-over in the folded pose:** the outer wall keeps its height; the 180° bend takes the top t of it, and the liner runs from there down to the base (h − t), so the lock tabs pass straight through the base and fold under. The 3D view swings the liner about a line t in from the edge, at the wall's inner face.
- **Fold-over is offered on the top edge** (`e2`) from the card; the model accepts any free edge, but lock tabs need the liner to reach the base (a partial hem is glued; the export check says so if tabs are chosen).
- **Clearance advice:** foldform's "c < 0.75t" rule is kept as advice in the export check; with CutForge's default calibration values it shows on corrugated board until the classroom calibrates the clearance with a test cut.
- **Flute direction** is checked against the packed sheet layout (the first copy): a fold score that runs less than 45° from across the flutes on 4 mm board is flagged. The packer is unchanged.

## Interaction refinements (see `INTERACTION_REFINEMENTS.md`)
- **Grow targets and push-pull arrows** (milestone 15): an edge's grow target leaves a gap of 22 screen px each side of its midpoint and of any push-pull anchor on it; pieces under 12 px are dropped. The pill follows the pointer on the remaining pieces (or sits at 30% along the edge before the pointer moves). Push-pull arrows also win any raycast tie. The arrows sit on the panel's real outline (right side at half height, top at half width), which is the same place on a rectangle.
- **Fold slider** lives only on the stage (bottom centre) while a net of two or more panels exists; on stages under 900 px wide it sits at the left above the card dock.
- **Touching** (milestone 16) means a sample of one slab within 0.05 mm of the other, over a contact at least 1.5 mm long; a corner grazing a face is not a contact. Contacts under 10 mm that no joint uses are reported as too short.
- **Overlap up to t** is an edge lying inside the other panel's slab: it is joined at the edge's actual depth. Anything else that overlaps with no joint is *panels collide*.
- **Several seams per pair:** a seam is its two edge keys; a second candidate is the same seam if it uses the same two edges or its contact lies within 2t of one already kept. Parent and child (a grown connection) are joined by that connection only.
- Clicking a joint message selects both panels (the first as the primary, the other shown selected too).
- **Rotation** (milestone 17): shapes store `rot` in degrees (missing = 0, never written as 0). Floor-panel yaw is not a separate field: it is the floor panel's frame, turned about world Y around the panel's centre; the card shows it from the frame's `u` axis. Circles ignore rotation. A group of shapes turns about the centre of their centres (one shape about itself).
- **Gizmo placement:** on a shape it sits at the selection's centre in the panel's plane; on a floor panel at the panel's centre on its top face. Its handles win any raycast tie (like the push-pull arrows). The 3D gizmo is offered alongside the existing drags rather than replacing them.
- **Typed values while dragging** follow the handle: an angle for the ring, an offset for an arrow, "x y" for the pad; they apply relative to where the drag started.
- **Floor snapping** compares outlines of floor panels only (not their walls); a corner within the snap distance of another corner wins over edge lines.
- **Divider sets** (milestone 18): *Across* dividers are parallel to the base's left edge (e3) and spaced along its width; *Along* dividers are parallel to its front edge (e0). The clear inside is measured between walls standing at the base's edges (offset up to max(t, 6 mm)); without a wall the base edge is the limit. A dragged member is renamed (a new id), the members after it are renumbered down so their shapes stay with them, and by-size spacing becomes even spacing with the rest. Removing members (a lower count) deletes them with any shapes on them.
- **Divider between two faces** stands on the base edge whose direction is parallel to the faces' normal (within 1°), on the nearer side of the click; on a base with no such edge (a regular hexagon's opposite walls) the pill is greyed with that reason. Its height is the lower wall's top above the base, minus t, minus 5 mm.
- **The divider slide arrow** sits on the divider's face at 30% of its height, clear of the height arrow, the hinge knob and the compartment labels, which sit above the row at 82% along it.
- **Partial width** (milestone 19) is stored only when it is less than the whole edge. A wall set on a split edge keeps the span on its first piece; its derived walls take their whole piece. Joints need no span logic of their own: they are laid out over where the edges actually overlap.
- **Adaptive trim** samples the ghost's width in 96 columns and simplifies the top line to 0.02 mm; the trim follows the obstacle's near face exactly (no clearance added): the joint that auto-connection then makes applies the clearance once, as everywhere else.
- **Height and angle snap targets** come from other panels' outline corners (both faces) and, for height, from faces crossing the growth direction; the snap distance is the usual 10 screen pixels for height and span, 3° for the hinge.
- **Through-cut editing** (milestone 20) shows corner handles on the source and every non-edge-on panel the cut reaches, and a gizmo on the reached panels (the source keeps its own). Corners are dragged on the reached panel's mid-plane and mapped back to the source by orthogonal projection onto its plane (the cut runs along the source's normal, so this is the same mapping).
- **Snap targets** come from the panel's own outline (sketch, Adds and Cuts) instead of its bounding box; the box's centre is kept as a target.
- **The live through-cut count** while drawing a polygon recomputes on a copy of the design when the polygon so far changes by a whole millimetre.

## Gizmo, joints, flaps and settings (see `GIZMO_JOINTS_FLAPS.md`)
- **Gizmo start values** (milestone 21) all come from the design at pointer-down (`txnBase`): positions, the box used for snapping, the pivot. During a turn the gizmo stays where the turn started.
- **Grazing views:** within 20° of edge-on (pad) or of the view direction (arrow), one pointer pixel moves one pixel's worth of millimetres at the gizmo (`mmPerPx`). Up the screen moves away from the camera. The switch at 20° changes the speed (a plane hit there moves about 2.9× as far per pixel); the jump was judged less confusing than a leap of tens of millimetres.
- **Gizmo hit zones:** 16 px wide along each arrow, a 13 px ball for the pad (wins over an arrow seen end-on). The pad is drawn 22 px wide.
- **Dimension labels** of a panel seen within 20° of edge-on are hidden.
- **Flap hinge** (milestone 22) is solved, not written per kind: the axis is the score line, and the pivot is where the flat slab's base mid-line turns onto the folded one. A flap is coloured as the panel it is cut from.
- **Joint groups** (milestone 23): *Wall to base* is every grown connection (a panel on the panel it grows from) and every edge-on-face seam; *Corners* is every wall-to-wall closing seam. Half-laps are in neither. A group's list offers the kinds allowed for at least one of its joints (all a new 90° joint could take while the group is empty), in the material's order. Without a design choice the list shows the kind most of the group's joints have.
- **Dividers in a design-wide change** take only the kinds an edge on a face may have (plywood: tabs and slots or butt; card and corrugated: glue or butt), so choosing fingers or a fold leaves them as they are (counted as kept). A new divider takes the design's wall-to-base kind when it is one of those.
- **A design-wide change** sets `kind` and `pref` and leaves `auto` as it was: hand-set joints stay hand-set and automatic ones automatic. It also sets every tray's wall or corner kind where a tray allows it, so the tray card agrees. A new tray starts from the design's kinds (where allowed); kinds passed to `addTray` (a template's) win, and so does a tray's own joint for the seams it makes afterwards.
- **Falling back:** when a joint's own wish is not allowed (angle, material) it takes the design's kind when allowed, else the material's first, as before.
- **Templates** carry the design's joint choices through a regeneration (size or material change): they are applied to the regenerated joints again.
- **Glue flap width:** `joints.flap` replaces the automatic width on every glue joint without its own width; *Back to automatic* removes it (and `joints` itself when empty, so such a design saves exactly as before).
- **Settings card** (milestone 24) is shown whenever nothing is selected, in both views, headed *Design settings*: the template's sizes first (when there is a template), then *Joints*, *Material and fit* (thickness, kerf, clearance; the same edit as the drawer, so a template regenerates) with *Change material…* opening the drawer (`open-drawer`, the old link's testid), then *Snapping*.
- **Snapping preferences** live with the view options (per browser, `cutforge.viewPrefs`): two toggles, *Smart snapping* (to other shapes, panel outlines and edges, floor panels, a ghost's neighbours, hinge rest angles, outline points) and *Grid* (positions round to the grid step where no smart target is near; 1 mm by default), plus the turn step (15°). Each toggle is independent; holding Alt during a drag turns off both for that drag (positions then keep 0.01 mm). The turn step applies whenever Alt is not held; the hinge dial keeps its 5° steps.
- **Add ghosts** (a grown panel before it is made, the extrude preview) are drawn in a darker teal (`#13897f`, 50% opaque, edges `#0b4f4a`) so they read on the light stage.
- **Outline point snapping:** a dragged point lands on a corner within reach first (the outline's own other points, and the corners of panels lying in this panel's plane or standing on it, within a thickness of its slab), then onto an edge (its own edges not touching the point, and those panels' edges), then in line (x or y) with its own other points, then on the grid. Reach is the usual 10 screen pixels. A ring marks the corner, and guide lines show the edge or the alignment. The grow ghost's outline handles are not included yet.
- **Auto-curve points:** a point stored with `curve: 'auto'` (a base polygon's vertex, a wall's top corner or inserted point) makes the outline a smooth curve through it, tangent to the line between its neighbours, with handles a third of each side's length (the usual "auto smooth" node). At a plain corner the curve's handle points along the edge. Curves are flattened in layer 1 within 0.02 mm, into segments keyed `<edge>~<n>`: everything downstream (outline, joints, exports) stays polyline-based, and exports carry the flattened polyline. Curved segments are never offered for growing, trays or automatic joints. A point cannot be curved while an edge beside it is joined (a joint, a grown panel, a fold-over); the card says so. The bounding size (`w`, `h`) follows the curve, which can bulge past its points. The wall's attached bottom edge never curves (its corners cannot be curves).
- **Edge-on ring** (milestone 25): within 20° of edge-on the ring is replaced, not joined, by a camera-facing ring of the same screen size in a lighter amber, with the turn's axis drawn through the centre. Turning by screen angle is well-defined on it because it is a full circle on screen. A 12 px dead zone round the centre holds the turn in every view; on leaving it the turn continues from the new pointer angle instead of jumping.
- **Joint choices per material kind** (milestone 26): each material kind keeps its own *Wall to base*, *Corners* and flap width. A change of material kind re-applies the new kind's choices (a change of values within one kind does not, so hand-set joints stay). The old flat form belongs to the material the file was saved with. A choice that does not fit is never dropped; the card says why it is not in use.
- **Settings sections** (milestone 27): open state is a viewer preference saved on first use. Before that, the template's sizes are always open (even if the card then scrolls) and *Joints* is open only when it fits.
