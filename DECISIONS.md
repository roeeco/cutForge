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
- **Divider between two faces** (milestone 44: replaces "stands on the base edge whose direction is parallel to the faces' normal") runs square to both faces through the second pick, halfway between them, and reaches almost to both, so its ends are the two picked boards and any dividers between are crossed. No base edge is needed, so opposite walls of a hexagon or octagon take one. Its height is the lower wall's top above the base, minus t, minus 5 mm.
- **The divider slide arrow** sits on the divider's face at 30% of its height and moves it along its normal; the compartment labels sit above its row, a third of the way along the divider from its middle.
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

## Panels anywhere, drafts, boards, dividers, flat nets and board materials (see `PANELS_AND_DIVIDERS.md`)

- **Placed panels are separate nets.** A panel drawn on a face (`Panel.place`) is never folded to or grown from its host; its frame is derived from the host's in `solve` (hosts first, in the same pass as grown panels), so it follows the host. Flat on a face it is not joined and not reported as touching; standing, its bottom edge is an edge on a face (the design's *Wall to base* kind). Deleting the host drops it to the floor where it was seen from above, keeping its pose.
- **Construction is a property of a net**, stored on its root; grown panels inherit it. Construction panels are left out of seams, contacts, validation, through-cuts, fold nets, pieces, packing and export, and stay snap targets, hosts and grow parents. Panels placed on a construction panel are real.
- **A ghost first, then ✓.** Panel ghosts, grow, extrude, every shape tool and paste wait for a floating ✓ (Enter) or ✕ (Esc). A shape ghost is real in the design while it waits (so its handles and op work as usual) and is recorded with the design and history from before it: ✓ collapses everything since into one undo step and returns to *Select*; ✕, Esc, undo, another tool, another selection or another drawing restore that design.
- **Panel selections hold several panels**; align and distribute need one surface (the floor, or one face of one host).
- **Dividers have one manual flow** (*+ Divider* between two selected walls, halfway along their overlap). Automatic divider sets are gone; older files keep their members as ordinary dividers.
- **Nets lie flat.** For each overlap in a tray's flat net (largest first) the first of trim, hinge, own piece that clears it is kept; fixes are recomputed on every solve (`Tray.fixes`, `fixPlan`) and can be pinned per wall (`Tray.pin`) or turned off (`Tray.flat = 'off'`). A hinged wall folds off its *other* neighbour across a convex corner (the corner becomes a fold, `Connection.hingeOf`) and is glued to the base, on corrugated too (tabs would move it off the neighbour's edge). At an inside corner the giving-way wall also closes the corner. The flat height counts only walls cut as their own piece (trims and hinges keep the net whole).
- **A material for each board.** `Panel.material` names a profile (in `Design.materials`); absent is the working material, so single-material designs are unchanged. Grown boards copy their parent's material when made. Joints read each board's thickness (fingers as deep as the other board, slots as wide as the tab board plus the receiver's clearance); fingers and leaning plywood need both boards in plywood, folds both in the same card or corrugated material; other kinds work across materials. Each material packs onto its own sheets and exports to its own file with its own kerf; one material keeps the old file names.
- **A tray wall's offset follows its joint** (`defaultOffset`), and a tab-and-slot offset keeps the slot web at the material's minimum after the slot grows by half the clearance.

## Quick build (see `EASY_MODE.md`)

- **A mode is a viewer preference, not part of the design** (`ViewPrefs.mode`, per browser). New browsers start in Quick build, browsers with saved preferences in Workshop. A class sets the default (`classes.mode`) and can lock it (`mode_locked`); a student gets it from the class link or when submitting with the code. Switching stops the current tool and changes nothing in the design or its history.
- **One feature table** (`src/easy/features.ts`) decides what Quick build shows (`show`, `readonly`, `auto`: hidden with the default applied, `hide`); components ask `useFeature` or wrap a control in `<Gate f>`. Workshop shows everything. A unit test keeps the table and the code in step. *More…* renders a card under a `ModeOverride` set to Workshop.
- **Workshop-only parts** (`workshopOnly`: an angled hinge, a fold-over, a through-cut on or reaching the panel, another material, a construction guide) are shown read-only in Quick build: no card controls, no edges, gizmo, slide or drag.
- **Every action is a recipe over existing ops** (`src/easy/recipes.ts`), so nothing new reaches the model, exports or golden files: Box is a floor panel (or a regular polygon base) plus Extrude, Wall / lid is the grow card's defaults at 90° on the whole edge with adapt on, Divider is a divider line (milestone 44: `dividerLine`, never a standing board), Hole and stickers are shapes. Quick build's Box waits for ✓ as one step with its tray.
- **Guardrails prevent rather than report.** In Quick build every edit (apply and preview) is guarded in the store: changed shapes are pulled back along the change to the farthest allowed point (one common amount for a group), new shapes shrink about their centre or are not made, text moves to the nearest place it fits. The zones are the export check's own geometry, and its rule for shapes on a plain rectangle is shared (`shapeFit`), so the guard never allows what the check refuses. The guard runs before and after solve, since joints can move around shapes. Text is checked by its box for speed.
- **Fixes are narrow**: each changes only what its issue is about (move or shrink one shape, engrave stencil text, shrink a panel to its sheet, repack). Warnings that do not stop a cut (split panels, bevelled through-cuts) are notes, not blockers.
- **Missions are a registry**, like templates: a template with parameters (or a recipe), objects placed at the start, and goals checked live against the design. `Design.mission` and `Design.contents` are optional, view-only for pieces, packing and export, kept by template regeneration. Goals met are counted by the student's app and stored with the submission for the teacher.
- **Compartments** (milestone 44: replaces "a rectangular base's clear inside cut by its dividers") are the regions of a base's outline left once every standing board's footprint is taken away (walls, dividers, standing boards). A region that is a rectangle along the base's axes is its own size; any other gets the largest centred rectangle in it. Regions narrower than 5 mm (outside a wall standing in from the edge) are not compartments. An object belongs to the region its centre is in. Objects lie flat either way round and stack; the clearance is kept once around the lot.
- **Stickers** are drawn for CutForge in code (closed outlines in a unit box), so there is nothing to license or fetch.

## Follow-up fixes (after milestone 41)

- **An edge on a face is joined with tabs and slots first**, then a glue flap (card and corrugated), and a slide fit only last (`FACE_ORDER`). A kind is passed over when it cannot be made: the joint does not lay out, a slot would not keep the material's web inside its panel, or (for a tray's own panels) it would make the tray's net need changing to lie flat. This applies to new joints (dividers, divider ends, standing panels, walls meeting a face); joints already in a saved file keep their kind, so old files export as before.
- **Quick build lets the material change**; only its numbers (kerf, clearance, sheet) stay read-only.
- **Joints view**: a joint's label opens a menu of the kinds it can take; Quick build shows the menu but leaves the choice to Workshop. Turning the view on hides the move, turn and grow handles so the joints read clearly.
- **The grow and extrude ✓ sit below their height arrow**, above every other stage label.
- **Moving sticks to planes**: in the plane a panel moves in, every panel is lines (faces of those standing across it, edges of those lying in it); a moving line within reach of a parallel one snaps onto it, and a second contact in another direction fixes the other axis. This comes before the older corner snapping.
- **The Board tool draws in one drag** (milestone 42; it replaces the three clicks of the follow-up fixes): pressing on the face under the pointer, or the floor (a small square marks the floor point), starts the board there, and releasing a drag of at least `MIN_PANEL` makes it as one undo step, selects it and returns to Select; a click or a shorter drag makes nothing and keeps the tool, Esc during the drag drops it. There is no ✓ bar for the Board tool (shapes, grow, extrude and Quick build's Divider keep theirs). Flat or standing is chosen on the rail with two ordinary buttons, *Board* and *Standing board* just below it (the same tool, `panelPose` flat or standing). They replaced a *Perpendicular board* button that slid out beside Board only while the tool was active, which students did not discover. `P` chooses Board and, pressed again, switches between Board and Standing board. Each button sets the pose, so it is not remembered between sessions. What the standing ghost used to offer moved to the board once made: it starts at the last height used (40 mm the first time) and is changed with its H field and height arrow; *Flip side* on its card and a flip badge on the stage put its material on the other side of its line (`flipPlacedSide`); *Construction* is the card's checkbox. Standing board always makes a standing board, also on a box's base (milestone 44: dividers have their own tool, see *Dividers find their own ends*). A standing line snaps level and parallel within 7° (the face's axes, its edges, panels standing on it), then its end lands on a wall face along that line. In English the tool is called *Board*.
- **More ways for tabs to hold** are options of tab-and-slot (`Connection.tabLen` / `Tray.tabLen`: `flush`, `through`, `snap`, `bolt`), not new joint kinds, so every rule about where tab-and-slot is allowed still applies. Self-locking tabs reach `snapDepth` (max 3 mm, 1.2t) past the far face; a right-triangle barb on each side (0.5 mm, 0.8 on corrugated) is square to the far face and ramps to the tip; a slit (2 × barb + 0.2, at least 0.8 mm) runs from past the tip back to the near face plus the other panel's thickness and two thicknesses more, when each half keeps the material's web (else half-height barbs, no slit). The barbs are joint additions in the panel's own plane (`adds[].flat`, shown in 3D too); the slit is a joint cut. Bolts are M3 × 12 (nut 5.5 × 2.4): offered on plywood 3 mm and thicker, placed in the two end gaps of a joint when the gap keeps a web either side of the nut; the T-slot's nut pocket sits 2 mm short of the screw's end. Plywood is not offered *Through, fold under* (it cannot fold); a value already set stays offered.
- **Workshop is the default mode** for a new browser (Quick build is still a viewer preference, and a class can still start its students in it, locked or not).
- **Workshop's rail groups the shapes** (rectangle, rounded rectangle, circle) under one *Shapes* button, as Quick build's Hole; the four operations live on the shape card, shown only while a shape tool (Shapes, Polygon, Text) is in use, as pictures of what they do to the board with a name and a line of description. The colours stay on the cut plan and on the icons as a hint.
- **Quick build's joints are changeable**: the settings card's *Wall to base* and *Corners* lists are shown, and a joint's label menu works in both modes.
- **The joints view labels only the selected panel's joints**; with nothing selected it labels none (and says to select one).

## Bug-fix pass (BUGFIX_PLAN.md)

- **A fold that cannot fold is not folded.** When a fold's parent edge (or child edge) no longer exists, or the joint is broken, its child is cut as a separate piece and the joint is shown as broken, rather than the net being guessed.
- **Damaged files are refused, not repaired.** Only what is clearly safe is dropped on load: sheet placements and quantities that are malformed, joints naming a board that is not in the file, trays whose base is gone, derived data (joint geometry of a broken joint, wall extensions, net fixes). Any other wrong field refuses the whole file with "it is damaged". Sizes and coordinates must be finite and within 100 000 mm.
- **Autosave keeps the last good design.** A design that fails to validate or that the editor cannot draw is not saved; the error card can go back to the last one that was.
- **Fragments of a piece are `<key>@n`** (schema 9); wall-set members keep `<wall>~n`.
- **Finger counts are clamped where they are used**, not rewritten in the file: a seam takes at most `maxFingers` (fingers at least as wide as the thicker board). A longer seam gets the asked-for count back.
- **Butt corners are kept on every material**, as a plain cut-back of one wall by the other's thickness with no clearance (a slide corner with clearance 0).
- **A cut into a joint's band is reported, not prevented** (Workshop): the outline is still made correctly (perhaps in parts) and `val.tooThin` names the cut.
- **A divider line that cannot make a divider is refused with the reason** (milestone 44), never built as a standing board instead.
- **A piece in the sheet margin is a blocking issue** (`val.offSheet`, Fix: repack), not a note: a laser bed's margin is where the sheet is held. A piece is checked as a whole net, and turned only where the grain allows; one that fits only turned says so (`val.tooBigGrain`), and its Fix allows turning for the whole design.
- **The too-big Fix shrinks uniformly** (the board, its tray height, what stands on it), so a box keeps its proportions.
- **A cut-out drawing with outlines inside its outline is a stencil** (`val.stencilShape`, Fix: engrave), as cut-through text with closed letters is.
- **A wall-set member's own material is dropped when its edge merges again**: the merged wall is the base wall, with the base wall's material (as its other settings).
- **solve settles**: a pass that changes the joints' or trays' kinds is repeated (at most three passes), so what is exported equals what is saved and re-opened.
- **A teacher batch cuts with the first selected student's material settings** when the materials are the same kind and thickness; the batch card shows the kerf.

## The first-use tour (see `TOUR_PLAN.md`, milestone 43)
- **Workshop only.** Quick build has no Board tool: launching the tour switches the app to the Workshop, and the first card says so. When a class locks the mode to Quick build the welcome screen and the project menu do not offer it.
- **The tour builds its own design**: *Take the tour* starts a new blank design in plywood 3 mm, exactly as Start with *Blank*. The welcome screen only shows on first use or after *New design* (which already asks), and the project menu's *Take the tour* asks the same question before replacing a design that has boards. The student keeps the box (it autosaves like any design).
- **Hands-on.** Each step waits until its check of the editor's state turns true (compared with the design when the step began), shows it for 0.6 s and moves on; a gesture in progress or a shape still waiting for ✓ does not count. *Next* is offered only on steps that just explain (and on a step that was already done when it was entered, e.g. after *Back*). *Skip step* is always there and makes the step's result with model ops in one undo step; *Back* shows the previous card without undoing anything; *End tour* closes it. A short "Not quite …" line shows when the state clearly went another way (a board instead of the lid, a standing board instead of a divider, an engraving or a cut off the walls).
- **The steps**: the Board tool, a base on the floor (about 120 × 80; a hand shows the drag until it starts), the Standing board button (explained), Extrude walls, a lid grown on its own from the back wall's top edge at 90° (the Workshop grow's defaults; its arrow to the front wall), the material changed to card, what changed in the joints (the joints view on a wall), the corner joint chosen from the design card's list (only kinds the current material allows), back to plywood, a divider line drawn with the Divider tool (milestone 44), a circle cut out of the front wall, and where the cut plan and the download are. During the divider step the lid is left off the stage (view only) and the camera looks in from higher up, so the box's floor can be reached; the cut-out step puts the start camera back.
- **On screen**: a spotlight (a ring around the anchor, the rest dimmed; nothing blocks the pointer) and a card beside the anchor: at a part of the interface on its inline end, below anything in the top bar, and for a point on the stage well away on the rail's side, so the model and the card dock stay free; never over the anchor, the top bar or the rail. The ring follows the stage while the camera moves (the stage registers its projection, `src/tour/stage.ts`) and hides when the point is off-screen. No pulse or hand animation under reduced motion.
- **Not persisted**: a reload ends the tour. `localStorage['cutforge.tourDone']` is set when the tour finishes or is ended; from then on the welcome screen offers it as a footer link instead of a card.
- **The getting-started tips are gone** (`Hints.tsx`, `hint.*`). A first-time student who chose Start instead gets one small note, *New here? Take the 3-minute tour* (the tour after the same confirm); dismissing it sets `tourDone`.

## Bends, closures and dielines (`PACKAGING_PLAN.md`, milestones 61–72)
- **The plan replaces the parked curved-walls branch** (`claude/charming-einstein-lqhfxq`, its milestones 44–48). Nothing is merged from it; its code and tests are the reference for behaviour. Its own measurements: a rounded tray solved 11× slower than a square one, corners were separate panels stitched back by a polygon-clipping pass, and a corner radius swept up and down changed which panels existed.
- **Milestone 61: derived data stays out of the design.** A design that has left the store is frozen, so what is worked out from it is cached against the object (`memo`); one still being edited is never cached. The store solves on a plain copy and keeps unchanged parts by identity (`settle`, `reconcile`), so `solve` runs at plain-object speed and React's memos see only what changed.
- **Milestone 62: round outlines.** As the parked branch's milestone 45 (tangent arcs keyed `<edge>^~<n>`, within 0.02 mm, every point on the circle; the four-centre oval with the draftsman's default end radius; arcs given back at export by `arcfit.ts`; bend limits per material), with two changes:
  - **The clamp keeps walls.** An edge 5 mm or longer before rounding keeps 5 mm of straight edge; the parked branch scaled arcs until they met, so a rectangle rounded to its limit lost its short walls, and a radius swept back and forth made and removed walls. A true stadium or circle is a round base, whose arcs still meet.
  - **No schema bump** for round outlines: their fields are optional; the schema goes up once, at milestone 70.
- **Milestone 63: a bend keeps the box's envelope.** A fold with a radius leaves both boards' frames where a sharp fold puts them and cuts each back to the arc's tangent point, so a living-hinge lid closes flush on its box and nothing built on the boards moves (the plan's first reading, a band outside the corner, would have lifted a plywood lid by 33 mm). The band is derived from the fold, never stored; a board standing across it is cut to clear it. Plywood folds only round a living hinge, offered last and per joint. Pattern density is computed (lines from the pitch over the reach; slits from the links' shear strain) and the student can only make it denser.
- **Milestone 64: a rounded corner is a band, not a wall.** A tray's walls stand on its base's straight edges only; each rounded corner is a connection from the wall before it to the wall after it, whose band the first wall carries and whose kind says how it meets the next (one piece, glued, keyed, plain). No panel is ever made or removed by rounding, so ids stay put; the parked branch made a panel per curve and stitched them back with polygon clipping. Plywood walls default to one strip keyed shut at the back left; card and corrugated to a glued lip, since their walls fold off the base and the next wall cannot also continue the band.
- **Milestone 65: a round base gets a seam flat, and a corner is a run.** A circle or oval walled gets a short chord at the back left for its one wall, so every wall stays a planar panel and the strip starts and closes on a flat place; the chord meets the curve at a small crease (a score on card, taken by the hinge on plywood). A corner is the run between two walls (possibly the same wall), made of arcs and creases, with one band per arc chained end to end. What holds bands to a base is the tray's choice (teeth, curved tab slots, nothing), on by default only for round bases.
- **Milestone 66: patterns are data, slits share one rule.** Each pattern is a registry entry (materials, reach in this band, why not, lines); wave slits and diamonds are straight slits with longer links and wider columns. A pattern's output is cached by its numbers. Kiss-scored pieces are mirrored at export only (the design and the cut plan are not). A smooth corrugated bend must lie along the flutes; corrugated round boxes cut their wall as its own piece so it can.
- **Milestone 67: a closure is a derived joint with stored settings.** Whether a lid seals is worked out on every solve; the joint that makes its lip, dust flaps, locks and notch exists only while it does, and stands for every joint between the lid and the walls it covers. The settings live on the design by lid, so a lid pulled short and pushed back gets its closure back as it was.
- **Milestone 68: cartons are trays.** A tube is a tray whose base only places its walls; its walls are a strip through the same hinged-corner plan that keeps nets flat, glued at the corner nearest the back left. A tuck top is a real lid the tray keeps (so milestone 67 closes it); flapped ends are derived joints like closures. A slit lock is a glue flap with tongues and slits, offered wherever a glue flap is.
- **Milestone 69: a net is cut only for a stated reason.** The app cuts a fold by itself only when the net does not fit its sheet, and keeps that cut until the net would fit whole again (never re-planned while it still helps); the student pins folds *Keep whole* or *Cut here*; *Save material* proposes cuts with their cost in pieces, sheets and glue joints and changes nothing until *Apply*. A cut part keeps its place on the edge (a glue flap) so the box does not change size; a tray wall uses the design's wall-to-base joint as a wall the flat-net fixer cuts off does. Nesting is on demand and stored like manual moves, but tied to each piece's size, so editing the design never leaves overlapping pieces behind; it is never allowed to take more sheets than the box packer.

## Dividers find their own ends (milestone 44, `DIVIDERS_PLAN.md`)
- **A divider is a line drawn on its base.** `Panel.divider` records what was drawn: a point on its mid-plane, its direction and how far the line reached each way (`reach`), in the base's coordinates. The board is a standing board on the base (`place`), whose position and length are derived: `reconcileDividers` finds them on every solve, before frames.
- **Where an end stops.** Along the line from its anchor, each end runs to the **far face** of the first board it meets beyond its reach:
  - Dividers it passes wholly within its reach are **crossed** (half-laps).
  - A board that is not a divider always stops it, and so does a divider it would cross at under 30°.
  - With no board, it stops at the base's edge.
  - The far face keeps old files exact: a divider across a box with walls on its edges spans the base's edge, as dividers grown from an edge did.
  - A board its anchor lies in: a divider there is crossed; a wall there refuses the line.
- **Order.** Dividers are worked out in creation order: each sees the walls and boards on its base and the dividers made before it. A later divider crossing an earlier one makes the half-lap; the earlier one never stops at a later one. This keeps it deterministic and free of cycles.
- **Footprints from the model, not frames.** Footprints of boards standing on the base are worked out in base coordinates from the model: walls by `spanFrame` from their connection, placed boards by `placeFrame`. So they never read a frame the solve has yet to update.
- **Old files (schema 10).** A panel grown at 90° from a base's edge, further in than its joint's own offset, becomes a divider with the same id, order, shapes, height and joint settings. Its grown connection becomes the same joint as an edge on the base's face. Every golden export is byte-identical. Grown panels on a split edge, or not on a base, stay as they were. One intended change: a divider in a box with tab-and-slot walls (walls standing a web in) now ends at the wall's outer face rather than poking past it to the base's edge.
- **Angles.**
  - Half-lap slots are t_other / sin α + t_own · |cot α| (+ clearance), down to 30°; at 90° that is exactly the old width.
  - End slots come out the same way from the tab-volume projection that already made angled slots for leaning panels.
  - A line meeting any board under 30° is refused with the reason: neither a crossing nor an edge-on-face joint can be laid out there. (The plan's "split into two Ts" was dropped, since those could not be joined either.)
- **Drawing.**
  - The line snaps along or across the base's grid: the first divider's direction, else the box's longest edge.
  - **Shift:** 30° steps from the box's axis. **Alt:** any angle.
  - Its position snaps, within the snap distance, to equal compartments in its row, the middle of its compartment, or in line with a parallel divider.
  - The ghost shows the divider at its derived length, with a mark at each end (joined to a board / open at the base's edge) and at each crossing. A refused line is amber with the reason, and ✓ is greyed.
- **Tools.** The Divider tool (`D`) is on both rails, and Board's Standing board never makes a divider. Quick build gains *Standing board* just below *Divider*; `D` again switches between them, as `P` does in Workshop.
- **After it is made.**
  - Moving or turning it (gizmo, slide arrow, the card's *Clear behind* and *Angle*) edits the drawn line; its ends follow.
  - *Ends* on its card names what each end meets, with ‹ › to stop a board sooner (`reach` into the last crossed divider) or reach one further (`reach` past the divider it ends on).
  - Its width is read-only. Deleting its base deletes it; laying it flat makes it a plain board.
- **Rows.** A divider's row is the line along its normal through its middle: the nearest board that is not a divider each way (or the base's edge) and the parallel dividers between. The slide arrow's snapping, the compartment labels and *Equal compartments* use it, so they work at any angle and on any base.
- **`renamePanel` and template ids keep placed boards' hosts** (and trays' bases). Before, a renamed base dropped the boards placed on it to the floor.
- **Milestone 70: dividers are the parked branch's milestone 44, taken whole.** Its three commits were taken (conflicts only where this branch had moved on), with its schema 10 migration: the schema goes up once, here, as planned. Added: a tray corner's band is a footprint like any wall (facets of the arc between the band's two faces, at the wall's distances from the base's edge, worked out from the model, not frames), so an end stops on its inner face. A band takes no slot (its pattern runs where one would be), so the end's joint is derived like a closure: a glue flap on the divider's end (card, corrugated), a slide fit (plywood). A line into a corner stops at the corner's inner point; a turn that would meet a board under 30° is refused at the turn instead of leaving the end unjoined.
- **Milestone 71: lids reuse what is there.** The telescoping lid and matched walls are the parked branch's, nearly unchanged (they never depended on its bent walls). The arched lid is not a new kind of part: it is two folds with a radius (milestone 63) and a flat strip between, sized so the arch keeps the box's envelope and its flap tucks inside the front wall; the end walls' arched tops come from the band crossings that already cut side walls under a radiused lid. That made one old gap visible and it is closed here: a joint's flaps and slots stop where a band cuts its board back.

## Maintenance round (after milestone 72)
- **Round and Rounded are rail buttons**, beside Polygon: each is a shape of its own (a circle, oval or stadium; a rectangle with round corners), not a mode of the polygon tool. They share its drawing code, so a drag on the floor makes a board and a drag on a board a shape, as before.
- **The stage's outline of a panel follows its 2D outline**, fingerprinted, rather than a list of what feeds it; the cost is about 1 ms per edit for 15 panels.
- **Controls stay clickable, labels step aside.** A ghost's ✓/✕ bar and the flip badge are kept beside the contextual card and the rail; passive labels (dimensions, compartments, the hinge angle) hide while they would be under them, rather than move away from what they measure.
- **Plain edge flaps show flat in 3D.** They hold nothing and fold whichever way the student wants, so the stage shows them as the cut plan does.
- **Glue joints** in the yield report are joints held by glue: glue flaps (rounded corners' glued lips among them) and glued lids, once per copy cut. Finger joints, tabs, slit locks and keys are not counted.
- **The card shows what can be done.** Edges lists only edges a board can still grow from; Align and Distribute say why when they cannot be used instead of showing greyed buttons.
- **Board names in messages** are the labels the editor shows ("Front wall"), resolved when the message is shown; the checks still store the board's own name.


## Milestone 73: Quick build catches up (LIDS_LINES_PROJECTS_PLAN.md Part E)
- **One reader and one setter for a box's lid** (`boxLid`, `setBoxLid` in `src/easy/lid.ts`), used by both modes, by Quick build's Box *With a lid* and by Wall / lid. The engine's lids stay stored as they were (a cap is `Tray.lidOf`, a hinged lid is the tray's tuck top `Tray.top 'tuck'`, an arched lid is two folds with a radius, a carton's flap top is `Tray.top 'seal'`), so there is no model change and no migration. A board grown across the top with a joint that does not fold is read as *Fixed*.
- **Hinged means folded off the back wall** (`Tray.top 'tuck'`), in every material: a tuck lid on card, a tab lid on corrugated, and on plywood the same fold, which plywood makes as a living hinge at its pattern radius. It follows the box's depth on every solve (`fitTopLids`), which a lid grown by hand does not. It is offered on plywood only where it can be made: tried on a copy, and greyed with *Too small for a living hinge* when the copy reports something new that blocks cutting (a 60 × 40 × 30 mm box).
- **Wall / lid across a box's top makes the box's lid** in Quick build: when the ghost would close the box (`sealFor`, as the grow card's *closes the box* note), ✓ runs `setBoxLid` instead of growing a board. It lifts off on plywood (a cap) and is hinged on card and corrugated, where a fold off a wall is what the student expects. On card and corrugated the hinge is the back wall's, whichever top edge was clicked. Workshop keeps the grow card's joint.
- **Changing a lid carries the shapes on its top** by their place in the world, projected onto the new top; those that no longer fit inside it are dropped and the card says how many. One undo step.
- **Greyed choices can still be tapped** (`aria-disabled`, not `disabled`): the tap shows the reason under the row, as the plan asks. (Playwright needs `force` to click them.)
- **Picture rows have as many columns as choices** (four in a row; two by two in the narrow Quick build card). Auto-fit columns made Chrome size the rows as if each item had a column of its own: twice as tall.
- **Rule 3 is a test** (`tests/quickTable.test.ts`): every `subsection` in the interface has a test id listed in `SECTIONS` (`src/easy/features.ts`) with its feature or `null` (core); a section whose feature Quick build hides or chooses must ask for it in its own file or in `Inspector.tsx`; every feature Quick build does not simply show is asked for; and the lists of features by state are spelled out, so a change for students is a visible change in review.
- **`saveBoard` and `saveBoard.steps`.** *Use less board* (nest, then offer the folds to cut) shows in both modes; *Nest* and *Save material* as two steps are Workshop's. *Use less board* nests at once (one undo step) and only offers the cuts.
- **No glue** sets every corner to a slit lock with the settings card's existing *Corners* choice (`setAllJoints`), and back to the material's first other corner kind. It shows in both modes, on card and corrugated.
- **Plain words are Quick build's only where they differ in meaning**: *Depth* for a footprint's second size and *Height* for a box's walls. *Lid* and *Lid rim* (and *Lid flap* for an arched lid's flap) replace *Panel 6* and *Wall 1* in both modes (`panelLabel`), since those names were wrong, not technical.
- **The Box action's kind is remembered per browser** (`ViewPrefs.boxKind`), and applies only to a box made with the Box action, never to Workshop's Extrude. A carton chosen where one cannot be made (plywood, a footprint other than a rectangle) makes an open box, and the picture is greyed with the reason.

## Milestone 74: the net and 3D in step (ROADMAP.md, UI_CLEANUP_PLAN.md Part 1)
- **A joint's additions say how 3D draws them.** Every `ConnGeom.adds` entry is drawn in the board's plane (`flat`), as part of a band (`band`, a rounded corner's strip), or by a folded flap of about its area in `flaps3d`. `tests/netIn3d.test.ts` checks this over every template in every material and every hand-built golden design, so a new joint that forgets its 3D side fails there.
- **A folded flap can have a plane of its own** (`Flap3d.frame`): a divider's glue flap on a band is turned a quarter about its crease against the band, and moves with the divider. A band has no flat face to put it on.
- **Tabs and keys of curved walls fill their slots in 3D**: a round box's tabs as curved pieces in the base's slots, a strip's key in its socket in the next wall. Both coloured as the wall they are cut from (`owner`).
- **Slits are dark lines on the board** (`faceSlits`): a slit lock's and a tuck lock's. A bend's slits stay on its band.
- **The flat net trims only a flap's own folded copy**: it used to pair a flap with any folded flap of the same owner and vertex count, which a slit lock's two tongues would have crossed.
- **A band's arc is drawn in steps of about 4°** (at least 24): a round box's band was a 24-sided polygon.
- **Dividers narrow on the cut plan: not reproduced.** Template dividers and dividers drawn with D (rectangular, rounded and round boxes; Workshop and Quick build; every material) have pieces as long as their boards in the browser and in the model. A test keeps it so; the owner is asked for the design that showed it.

## Milestone 75: one Shapes tool (UI_CLEANUP_PLAN.md Part 2)
- **Footprint × operator, no model change.** The rail is *Select · Shapes · Divider · Text · Import*. Shapes opens its five footprints (Rectangle, Rounded, Circle, Polygon, Regular) as a menu under its button; its card's operators lead with **Board**, then *Cut out · Engrave · Score line · Add material*. The pair picks one of the drawing tools that were there (`chooseShape` in the store, `shapeOf` reads it back): a rectangle board is the Board tool, a rounded or round board the polygon tool's Rounded / Round, a shape on a board the rectangle, rounded rectangle and circle tools, a polygon either way the polygon tool.
- **Board drawn on a board makes a board lying on it**, for every footprint (`addPlacedOutline`: a polygon, a round outline or a rounded rectangle placed flat on the face). Before, only the rectangle could; the others made a shape.
- **Other operators on the floor make nothing** and the card says *draw it on a board* (the polygon is refused at its first click). Standing is offered under Board for the rectangle only.
- **Keys**: P is Rectangle + Board, P again Flat ↔ Standing; R, U, C, G choose the footprint and keep the operator. A new session starts on Board.
- **Import SVG with Board** makes a board on the floor from the largest closed outline, at its own size; with another operator it is a shape on the selected board, as before.
- **On the cut plan** there is no Board and no polygon: Shapes offers the rectangle, rounded rectangle and circle with the four operators.
- **The old test ids were moved, not aliased.** Seven specs clicked the old buttons; they now go through `boardTool`, `shapeTool` and `drawBoard` in `tests/e2e/util.ts`, so no alias is left to remove later.
- The polygon card no longer has its own *Click corners · Regular* switch: the menu's Polygon and Regular are that switch.

## Milestone 76: lids beside the box (UI_CLEANUP_PLAN.md Part 3, LIDS_LINES_PROJECTS_PLAN.md §3.5)
- **A lid of its own lies beside its box in the design**, right side up, at the box's front right 20 mm clear of its walls, front edges in line. It is the old pose on the box turned half over about the box's u axis, so the lid's outline, its coordinates, its pieces and the files are the same (goldens unchanged). A new lid moves along in 10 mm steps until its footprint is clear of other floor boards; then, and when the student drags it, its place is kept as `Tray.lidAt` (optional, box-local; no schema bump). Old files open with the lid beside the box.
- **Put on / Take off and Close / Open are view state** (`lidShut` in the store, not saved): a lid of its own is shown on the box (`lidPutOn`), a folded lid shut. By default a folded lid (a tuck top, a living hinge, an arched lid) is shown opened back: a crease about 110° (20° past straight), a band unrolled to straight.
- **A lid shown away from its place cannot be drawn on** (its boards are inert), so picking never aims through a display move: the risk the plan asked to spike. Selecting the lid (*Select the lid*) shows it where it is: a folded lid shut, a lid of its own beside the box. The fold view and *Show how it goes together* show folded lids shut; the assembly shows a lid of its own on the box. The fold view shows a lid of its own beside the box, where its net unfolds.
- **Dust flaps ride on their side walls** (`Flap3d.frame` with `planeOf`): before, they rode on the lid and would have swung up with it.
- **Shapes carried from one lid to another** are carried by their place on the closed box (a cap's pose on its box), so changing a cap to a hinged lid keeps them where they were.

## Milestone 77: grow that closes the box (UI_CLEANUP_PLAN.md Part 5, LIDS_LINES_PROJECTS_PLAN.md §3.1)
- **The grow card chooses what ✓ makes** when the ghost would close a box (`closeChoices`, `closeAsRecipe` in `src/easy/lid.ts`), as pictures, before ✓, in one undo step. Card and corrugated: the fold with each of the material's closure styles, or a lid that lifts off. Plywood: *Hinged* (the living hinge, where `lidWhy` allows it, else greyed with the reason), *Lifts off*, *Fixed* (the board with the joint it was grown with). A carton closes with its tuck top. The default is the first that opens: plywood no longer gets a finger-jointed lid unless *Fixed* is picked.
- **Whatever the ghost's joint.** A ghost closes the box by where it reaches (`sealFor` on the ghost), not by how it is joined: the old check needed a fold, so plywood never got it.
- **Rests (plywood)** is left to the generated *Flat* lid (milestone 79): a board resting on the walls with nothing holding it is that lid. The pin hinge joins *Hinged* when it is built (milestone 81).
- **Rings of boards built with the Shapes tool** are not yet recognised as a box (they have no tray). Left for the lid generator, which needs the same "what is a box" answer; recorded in `ROADMAP.md`.
- Quick build's Wall / lid is unchanged: it already makes the box's lid with the same `setBoxLid`.

## Milestone 78: grow made easier, a quieter interface (UI_CLEANUP_PLAN.md Parts 4 and 6)
- **Heights that mean something** (`heightMarks`): the far wall a lid reaches, and the height of each board grown from the same board (the neighbours, the one across). The height arrow already snapped to edges and faces; it snaps to these too and names the one it is on (*Reaches the far wall*, *As tall as Back wall*).
- **A shorter grow card**: height, then *Closes the box* when it applies, then one *More…* row with the angle, joint, part of the edge, adapt, outline and edge flap. The row's state is remembered per browser (`ViewPrefs.growMore`); it starts shut.
- **The settings card folds to its header** once a board is on the stage and nothing is selected (`ViewPrefs.settingsOpen`, remembered); an empty stage still shows it open, since that is when its choices matter.
- **One cluster**: the view cube sits in a frame above the view buttons (a slot the stage draws the cube over); the view settings open over that slot.
- **One hint**: while an edge is selected the bottom hint says how to grow it, and the grow card no longer repeats it. The polygon hint no longer says what the floor or a board makes (the operator says that now).
- **Sections closed by default**: *Edges* on a board's card, with its count (`ViewPrefs.edgesOpen`). *Joints (advanced)* was already one closed header with a count; *Split* shows only where a fold can be cut, and stays as it is.
- **The test configuration opens what is closed by default** (`growMore`, `settingsOpen`, `edgesOpen` in the app and full Playwright configs and `tests/e2e/util.ts`), so the existing specs keep reaching their controls; `grow-cleanup.spec.ts` checks the defaults from a first visit.

## Milestone 79: the lid generator, Cap and Flat (LIDS_LINES_PROJECTS_PLAN.md §3.2, Part A)
- **Two kinds of lid that lifts off for now: Cap and Flat.** Inset and Drop-in are milestone 80. *Lifts off* on a box's card has a *Kind* row (pictures); a kind that cannot be made is greyed and says why (`lidStyleWhy`): Flat needs board that holds a tab (not card), straight walls (not a round box), walls all round, and level tops. A cap can always be made, as before.
- **Automatic** (what *Lifts off* and Quick build's *With a lid* make): a Flat lid on plywood where it can be made (one board, no glue; a cap is five boards and eight finger joints), else a cap. It chooses once, when the lid is made.
- **A Flat lid is one board** (`Panel.lidOf: { tray, kind: 'flat' }`), the base's outline grown by a lip (the slot's web, 3 mm, plus half the fit), lying beside its box like a cap (`Tray.lidAt` when moved), shown on the box by *Put on*. Its joint with each wall is derived on every solve (`lidtab:<lid>:<wall>`, a `closure` joint like a carton's ends), and its geometry is worked out **in the lid's pose on the box** (`flatOnFrame`), not from where it lies: tabs on each straight wall's top edge (none under 30 mm, one under 80, two above), as tall as the lid is thick so they are flush with its top, through slots in the lid a fit of 0.3 mm wider (`LID_FIT`) than the tab and the wall. Nothing is glued; the lid is its own piece.
- **A cap's rim**: *Shallow* (12 mm, as before), *Half* or *Full* the box's height (a shoebox lid), in Workshop (`lid.advanced`).
- **The stage draws a board's outline from its 2D outline** (`slabOutline`), not from the triangulated slab: slots near a board's edge made slivers whose arbitrary normals drew lines across the Flat lid's face.
- **Not yet**: `val.lidKind` (a box that stops allowing its lid's kind keeps the lid; the check does not say so yet), the Extrude card's *Lid* row, and the spike on real plywood that fixes the fit (0.3 mm is the plan's starting value).

## Milestone 80: the Drop-in lid (LIDS_LINES_PROJECTS_PLAN.md §3.2); Inset deferred
- **Drop-in**: one board inside the walls (the base's outline moved in by the wall's thickness and the fit; a round base's radii too), resting on the tallest divider, a 20 mm finger hole at its middle or, in 5 mm steps, the nearest spot clear of every divider by its radius and the divider's thickness (`Panel.lidOf.kind 'dropin'`). It lies beside the box and *Put on* shows it in place. It needs dividers at least its thickness lower than the walls; otherwise the *Kind* row greys it with that reason. The finger hole is an ordinary cut shape (it can be moved or deleted); while it is there it is kept clear of the dividers.
- **Inset is deferred.** It needs a tray's walls to stand in from their base's edge by the box's wall and the fit, with finger joints on plywood, which the engine has only done at the tab-and-slot offset (the plan's risk 2). A cap or a Flat lid covers the same need for now. Listed in `ROADMAP.md` §4.

## Milestone 81: the pin hinge — deferred
- Its numbers (pin, ears, shoulders, relief) are set by cutting three boxes in real plywood (`LIDS_LINES_PROJECTS_PLAN.md` §3.3 and risk 3). That spike cannot be done here, and a hinge that binds or falls out is worse than none. Plywood keeps its living hinge and its lids that lift off; *Hinged* on plywood stays the living hinge. Listed in `ROADMAP.md` §4 with what the spike must measure.

## Milestone 82: hasps and the Escape box (LIDS_LINES_PROJECTS_PLAN.md §3.4)
- **On a Flat lid first.** The front wall's locating tabs become one to three tongues (`Panel.lidOf.hasps`), each `hole + 2·web` wide (web = max(4, t + 1)) and rising `1 + hole + web` above the lid's top, with a round hole whose lowest point is 1 mm above the lid; the lid's slots are each tongue's width plus the fit. Nothing else changes: the tongues still locate the lid. Holes 6, 8 (default) or 10 mm (`lid.advanced`).
- **Cap, Inset and hinged lids take no hasp yet**: a cap needs its rim's finger joint split round the tongue (`connectionGeomOne` over two ranges), and the plan's spike decides whether a lift-off lid locked at the front tilts off at the back. The *Locks* row says why (*A padlock needs plywood*; *Locks go through a Flat lid*).
- **The Escape box mission** (plywood): an open box to start, so no goal is met on arrival (the starter-meets-nothing rule `PACKAGING_AND_LEARNING.md` asks of briefs); goals: the lid opens, it takes a padlock, fits one sheet, ready to cut, a clue engraved inside.

## Milestone 83: lines in the engine (LIDS_LINES_PROJECTS_PLAN.md §5)
- **Their own list on a board** (`Panel.lines: BoardLine[]`), not a new shape: open polylines in board coordinates whose segments can bow into arcs (`bulge`, DXF's convention), each *Cut*, *Crease*, *Perforation*, *Cut-crease* or *Guide* (`src/model/lines.ts`). Made through `addLine`, `updateLine`, `deleteLine` (a line drawn across folds shares a `group` and is deleted with it).
- **Clipped when pieces are built**: the parts outside the board's outline, inside a hole of its outline or inside a hole a cut-out shape makes are dropped (segment against polygon; no polygon clipping). Arcs are flattened to 3° steps there, so in the file a curved line is a polyline, not an arc: simpler, and the plan's arc-preserving output is left for when a curved crease needs it.
- **Dashed at export** from two numbers per material, [cut, tie] mm (`MaterialProfile.lines`, defaults by kind in `lineDashes`: card 1.5/0.7 and 4/2, thin corrugated 3/1.5 and 8/4, thick corrugated and plywood 4/2 and 10/5). A perforation starts with a cut so the tear starts; a cut-crease with a tie so the edge stays strong. Cut, perforation and cut-crease go on CUT, crease on SCORE, guide on GUIDE (whose output is off in LightBurn).
- **Kerf compensation** does not offset open lines sideways; it pulls a cut's ends in by half the kerf, as it already did for the app's other open cuts.
- **Checks**: `val.lineSplits` (a cut from edge to edge would split the piece; a perforation may), `val.lineOutside` (wholly off its board). `val.lineNear` (too close to a slot or joint) is not done yet.
- **3D** draws them on both faces of the board, dashed for the dashed types.

## Milestone 84: the Line footprint (LIDS_LINES_PROJECTS_PLAN.md §6, as ROADMAP.md conflict 3 settles it)
- **A sixth footprint in the Shapes menu, not a rail button** (`L`): its card offers the five line types instead of the operators; the polygon tool draws it point by point without closing. A second click on the last point, or Enter, ends it; Shift gives 15° steps and a typed number a segment's length, as for polygons. It is drawn on a board only (the floor says *Draw it on a board*), and is made at once as one undo step: a line has no ghost to confirm, since nothing about it changes the board's outline.
- **A board's card lists its lines** (*Lines*, with a count): each one's type, and Delete. In both modes: Quick build has no Line tool, but a line made in Workshop can be retyped and deleted there.
- **Not yet**: moving a line's points on the stage, bowing a segment into an arc by dragging its middle (`bulge` is in the model and the file; only `ops` set it), selecting a line on the stage, and splitting a line drawn on the cut plan across folds into one line per board.

## Milestone 85: how a fold is made (LIDS_LINES_PROJECTS_PLAN.md §5.3)
- **Per joint**: a crease fold's card (Workshop, `crease` feature; Quick build leaves it a score) has *Crease cut as: Score · Perforated · Cut-crease* (`Connection.crease`, absent = score, so every file is unchanged). A perforated or cut-crease fold's score line becomes dashes on the CUT layer with the material's line dashes (milestone 83). A fold with a radius keeps its own bend pattern and is not offered this.
- **Not yet**: the design-wide choice per material, and *Creases on the back* (`SCORE_BACK`, a mirrored second file): both need LightBurn checked by the owner first.

## Milestone 86: the library (LIDS_LINES_PROJECTS_PLAN.md §7.1, §8)
- **Designs live in the browser** (IndexedDB `cutforge` version 2): `designs` (each design as autosave writes it), `meta` (a card each: name, material, date, boards; the start screen reads only these), `kv` (`open-design`). Each store is made only if missing, so `IMAGES_ON_BOARDS.md`'s `assets` can land in either order. The design saved before the library (`kv/current-design`) is moved in once and opens as before.
- **The editor still holds one design.** *New design* keeps the open one in the library (no confirm any more); *Your designs…* in the project menu opens the start screen with the library above it (*Back to the open design* returns); *Duplicate* makes a copy with a new id and opens it. On the start screen each design has Open, Duplicate, Rename and Delete; deleted designs are listed under *Recently deleted* for 30 days, then dropped. The open design is renamed through the editor (its autosave would undo a rename in the library) and cannot be deleted while open.
- **Two tabs**: every save is announced on a `BroadcastChannel`; a tab with the same design open shows *This design was changed in another tab: Reload · Keep mine*, and does not autosave over it until one is chosen.
- **Undo history** stays per session and per design opened, as before (a design opened from the library starts with no history).
- **Not yet**: thumbnails on the cards (the material's picture stands in; rendering one on every save cost too much on a slow machine), `navigator.storage.persist()`, sheet and piece counts on the cards.

## Milestone 89: dimensions on the dieline (LIDS_LINES_PROJECTS_PLAN.md §9)
- **One function, two renderers**: `annotations(d, piece)` gives a piece's board names, its blank size (overall width × height) and the word *glue* on each glue flap, in the piece's coordinates. The cut plan draws them as text behind a *Dimensions* button (remembered per browser, `ViewPrefs.planDims`); the export outlines them onto the GUIDE layer when *Add names and sizes (guide layer)* is ticked (off by default, and Quick build keeps it off), so files exported without it are byte-identical.
- **A legend is always on the cut plan**: cut, score, engrave, guide, and the dashed lines when a design uses perforations or cut-creases.
- **Not yet**: dimension chains crease to crease (and their fallback to per-board sizes), the grain or flute arrow, fold direction marks, the title block. They belong with the spec sheet (milestone 90), which is not built.

## Milestone 87: projects (LIDS_LINES_PROJECTS_PLAN.md §7.2)
- **A project is a named group of designs in the library**: each design's card carries its `projectId`, the names are kept in `kv/projects` (no new store, no version bump). *Move to project* on a card takes a name: an existing project of that name, a new one, or none when empty. The library lists each project's designs under its name, then the rest.
- **The project file keeps the single-design format** for one design, so the Worker's reader and class submission are untouched; a project of several is `{ format, schemaVersion, savedAt, project: { name, designs } }` in the same `.cutforge.json`. *Save the whole project* in the menu writes it (a design in no project is saved alone); *Open* reads either kind and puts a project's designs in the library under its name, opening the first.
- **Cut the whole project**: the download offers *This design · The whole project* when the open design's project has others; the designs of one material share sheets with each piece named by its design on the GUIDE layer (the teacher's `batchExport`), one file per material.
- **Not yet**: *Compare* (two designs side by side with their numbers), and a project's own menu of its designs (the library does it).

## Milestone 88: sizes (LIDS_LINES_PROJECTS_PLAN.md §7.3)
- **Derived, not copied**: `Design.sizes` is rows of numbers (*Name · Width · Depth · Height*, or a template's parameters); `applySize` makes the master at that size on demand and nothing derived is stored, so a change to the master reaches every size. Offered for a template or a design with exactly one box (a lid of its own counts as part of it); otherwise the section says why (*Use Duplicate*).
- **What follows a size**: the base and so its walls; a lid of its own its box; a folded lid that closes the box is fitted again (the tuck top's own fitting); dividers keep their share of the base; shapes and lines are not scaled — one within 1 mm of its board's middle stays in the middle, any other keeps its distance from the nearer edge.
- **In the download**: *Sizes: Master · S · M · L* as checkboxes; each size's files carry its name; each checked size is run through the export check and its messages are named by the size.
- **The settings card** has a *Sizes* section (Workshop; Quick build hides it). **Not yet**: showing a size on the stage and the cut plan read-only (the plan's *Showing size L* banner); a size is seen through its download for now.

## Milestone 90: the spec sheet (LIDS_LINES_PROJECTS_PLAN.md §9)
- **One page per kind of piece** (copies alike are one page), drawn at the largest of 1 : 1, 1 : 2, 1 : 5, 1 : 10, 1 : 20 that fits A4 or A3 landscape, the scale stated; scores dashed, with the piece's annotations (board names, blank size, *glue*), a title block (name, date, material, blank size, pieces, glue joints, kerf, scale) and the line legend. An SVG with real text in a print view whose `@page` is the paper: *Print a plan* in the download dialog opens it and the browser's *Save as PDF* gives a PDF. No PDF library.
- **Not yet**: the 1 : 1 print tiled across pages with overlap marks, dimension chains on the page, fold direction marks.

## The fold overhaul (19 November, the owner's report)
- **The report**: dividers about two thicknesses short in the cut plan; a folded net leaving a thickness of gap at the side walls, corners not flush; the engine keeping edges exposed instead of one board's edge butting under the other; a card lid folded inwards, so it came out mirrored and did not fit a box that is not symmetric.
- **The cause** (reproduced in `tests/crease.test.ts`): every fold added a strip as wide as the material's fold allowance (about one thickness) *outside* the base, with the score in its middle. The base folded up at its outer size plus the allowance between scores, where a real crease gives inside size + t. The folded box came out about 2t larger than its 3D model (corrugated 4 mm: about 9 mm), so dividers sized from the model were short and walls stopped short of their neighbours. In 3D everything looked right, which is why milestone 74 could not reproduce it.
- **A crease folds where the two mid-planes meet** (`src/model/crease.ts`, the packaging rule *a panel between two scores is its inside size plus one thickness*). In the net the score lies on that line (at 90°, t/2 inside the parent's edge) and each part lies as far from it as its mid-plane is from it in 3D: a wall starts on the base's edge, no strip. It holds at any angle and for tray corners made folds. Bands (folds with a radius) keep their own developed width.
- **`foldAllowance` is now only a calibration**: extra length a real crease takes, 0 by default. Schema 11 migrates: a built-in material takes its new value; a custom one keeps what it had beyond one thickness.
- **Scores and strips run only where the child's material attaches** (a wall cut back at a corner): the base's edge runs straight on into the next wall's edge, no jogs.
- **Flaps crease by the same rule**: glue and lock flaps, a divider's flap on a band, a fold-over's rim: the score half a thickness inside the board's end.
- **Corners stay flush.** Tab-and-slot corners no longer carry the receiver past the corner for a web outside its slots (corrugated walls stood 3 mm proud); a slot at the receiver's end is an open notch, a box joint, which is how laser-cut cardboard corners are usually made. Inside corners no longer reach a web further either. A slot that lies clear of the end stays a closed hole.
- **A fold that turns away from the scored face is perforated by default.** Pieces are cut in their boards' coordinates; a lid's board is mirrored (turned over onto its box), so its rims fold away from the face the box's folds turn towards: outwards, which keeps its outline the box's own way round. A score folds well one way only, so those folds (and the lid's flaps) are perforated. The crease choice is now *Automatic · Score · Perforated · Cut-crease*; `Connection.crease: 'score'` keeps a score.
- **Tests changed on purpose**: card and corrugated goldens regenerated (`UPDATE_GOLDEN=1`, and `UPDATE_MIGRATED=1` for the exports old files now make); plywood goldens unchanged. Size-bound tests (splitting, the margin repro, the spec sheet's blank size, one nesting design) moved to sizes that still exercise them; the hinge-sliver repro checks an L tray, since flush corners let its 7-gon lie flat without a hinge.

## Milestone 92: what Quick build left half-done (GUIDED_MODE.md G1)
- **Autosave writes the design from before a draft**, not the draft (`designToSave`); the end of a draft (✓ or ✗) triggers a save even though the design object did not change at ✓.
- **Which dividers keep their place**: only rows the student changed. A row still at the template's spacing follows the template (so 2 → 3 dividers stays even), because keeping an untouched row's places would make the template look broken. "Changed" means a template divider more than 0.01 mm from where the template would put it with the old sizes, or any divider the student added in that row.
- **A share of the row** (the divider's centre between the row's two faces), not a distance from one side: a width change spreads the student's layout instead of crowding one end.
- **The too-big fix works on a copy** and is taken whole or not at all; for a template, every size in millimetres (`unit: 'mm'`) scales by one factor, never under its minimum, rounded to 0.1 mm. Templates' size limits already respect the four classroom sheets, so this matters for custom materials with small sheets.

## Milestone 93: size intent (DIELINE_DNA_PLAN.md D5a)
- **In `boxSize.ts`, not `sizes.ts`**: milestone 88 owns `sizes.ts` (size rows).
- **What lies under and over the inside**: a cut base (its thickness); an open base (a tube) its bottom flaps when it has a bottom, else nothing (a sleeve); a closed top (`top`) its thickness. A lid of its own does not count: inside is measured to the rim.
- **Crease to crease is half a wall less on each side**, because since the fold overhaul a crease lies where the two mid-planes meet; on plywood (no creases) the choice is not offered.
- **The intent is applied around a change of board** (`keepingStatedSizes`): the stated sizes are read before and set after. `ops.ts` imports `boxSize.ts`, which imports `setPanelSize` / `setTrayHeight` from `ops.ts`; the cycle is only between functions called at run time.
- **Dividers keep their distance from the left and front** when a box is resized through `setBoxSize` (the base grows from its origin), the rule Guided's Build and the sentence's spaces rely on.

## Milestone 94: the sentence's contract and resolver (SENTENCE_BUILDER_PLAN.md S1)
- **`canMake(m)` beside `materials`**, not in place of it: the welcome screen, the missions and saved files read `materials`; `makes(t, m)` asks `canMake` first.
- **A word not in the sentence keeps its value** (it is not reset when hidden), so it comes back as it was when an earlier word brings it back.
- **A choice not offered changes nothing** rather than being refused with a range: lists only ever offer allowed options.
- **A range that closes up keeps its lower end** (max never below min), so a number always has a value it can take.
- **Bisection**: both ends are tried first, then halvings, then the result is rounded down to the step; eight builds give about 1/64 of the range.

## Milestone 95: the sentence's box, tray and spaces (SENTENCE_BUILDER_PLAN.md S2)
- **The lists ask the engine by building** (`cleanWith`), not only through the functions the plan named (`lidWhy`, `roundedMin`): the random walks showed that each of those can say yes to something that then does not cut clean (a tall rounded box, an arched lid on a deep box). Building is 5–60 ms a time; the answers are cached.
- **The later add-ons are left off** when an option is asked about: each add-on is checked in its own turn, after the words before it.
- **Size ranges are found by bisection with square corners and no add-ons**, so they are the box's own limits; a shape or an add-on that does not fit at that size falls back after.
- **A size inside its range may still be refused** (`accepts`), because validity is not monotonic everywhere (a corrugated net that fits only turned against the grain at one depth fits again when deeper, once it is split). The note says to try a little more or less.
- **Shape before the add-ons, after the sizes**, so a change of size re-checks the shape.
- **Template ids**: tray ids become `t:tray1`, … and ids built from them follow; joint ids with `:`, `/`, `~` or `|` are the engine's and are left for `solve`. The organiser's and the stand's goldens are unchanged.

## Milestone 96: the sentence's carton and sleeve (SENTENCE_BUILDER_PLAN.md S3)
- **No tuck direction word**: the engine makes a carton's tuck top off the back wall and its tuck bottom off the front (a reverse tuck); a straight tuck (both off the same wall) is not in the engine, so it is not offered.
- **A carton needs corrugated no thicker than 2 mm** to tuck; a sleeve folds from 4 mm too.
- **`accepts` on every change**, not only numbers: a choice offered by its list was checked with the later add-ons off; the whole sentence can still miss (a count after a change of shape), so it is checked as it stands.

## Milestone 97: the sentence component (SENTENCE_BUILDER_PLAN.md S4)
- **A list is worked out when it opens**, after it has painted (*Working out what fits…*), because an option can take a build to answer; the sentence itself is resolved without its lists.
- **The structure word's list and the shape, lid and ends lists have pictures**; numbers and the other add-ons do not (a picture per window or notch says little at that size).
- **A choice refused by the engine** (rare: the whole sentence would not cut clean) leaves the word as it was and says *Not now: why* under the sentence.
- **The narrow layout labels each word with its parameter's name** and keeps the order of the sentence.

## Milestone 98: the welcome screen (SENTENCE_BUILDER_PLAN.md S5)
- **Touching the sentence chooses it** (focus or pointer anywhere in its row), so a student never has to find its radio first; *Blank design* is still chosen by default.
- **The default sentence is a plain box** (160 × 110 × 45 mm inside, no add-ons): the plan's example with a lid and spaces is one *+ more* away twice.
- **The organiser leaves the welcome screen but not the app**: its saved files open with their card; browser specs start it through the test hook.

## Milestone 99: the preset card after Start (SENTENCE_BUILDER_PLAN.md S6)
- **Notes on the card, not a toast**: the card already holds the template's other messages (shapes that could not be kept); the notes sit with them and stay until the next change.
- **The card's fields keep their own bounds**; the engine's range is shown when a number is refused (working it out for every field on every change would build the box many times).

## Milestone 100: verification of the sentence (SENTENCE_BUILDER_PLAN.md S7)
- **A lower limit that follows an earlier word**: the stand's base depth comes after its slots, so a change of slots moves the base up to what they need, and the base cannot be typed shallower than that.
- **Every structure refuses what would not cut clean** (`accepts`), the stand included: a structure's own number ranges cannot say everything (a sheet, a grain, a fold that does not fit), so the whole sentence is built and checked.

## Milestone 101: outline mode (DIELINE_DNA_PLAN.md D0)
- **`viewPrefs.outlineMode`** (`outlines` already means *draw outlines*), excluded with `joints` in `setPrefs`.
- **Boards stay pickable in the mode** (they are inert while one outline is edited outside it), so a click on another board moves the editing.
- **A generated Flat or Drop-in lid's outline is no longer editable** from its card: it is made again from its box (it was offered before and reset by the next change).
- **The last board hovered keeps its faint points**: a corner sits on the board's edge, so reaching for it leaves the board.

## Milestone 102: the sketch engine and the 2D canvas (DIELINE_DNA_PLAN.md D0b-1)
- **Ported as is** with its tests, its decisions in `claude/guided-mode`'s `DECISIONS.md` (milestones 56–59) holding here too; only its tests that need the waffle's 3D kernel stay there.
- **`canvas2d.tsx` is the branch's file**: `main`'s cut plan had the same view-box code and handles; the branch's are a superset (side handles off by default, a test-id prefix), so the cut plan is unchanged.
- **A board's curved edge is a Bezier in its graph only as a marker**: its shape stays the board's own curve rule (`curveRing`); writing back keeps *curve* on its first point.

## Milestone 103: the transform frame in 2D (DIELINE_DNA_PLAN.md D0c)
- **Alt keeps both meanings** in the 2D frame: scale about the middle (the branch's frame) and no smart snapping (CutForge's Alt everywhere).
- **The direction moved furthest leads** when proportions are kept (the branch's rule), so a corner drag never shrinks the side being pulled.
- **Pills drawn in the sheet** (`foreignObject`), at screen size, beside the frame's bottom and right; a click opens the input (not the press: the branch's lesson).

## Milestone 104: edit outlines in the 2D view (DIELINE_DNA_PLAN.md D0b-2)
- **Edited in place, one undo step per change**: no separate sketch view, no *Finish* (the owner's double-click-into flow; `claude/guided-mode`'s session is not used).
- **`Detail.sketch` beside `path`**: the graph is the editable source; `path` keeps the flattened outline every other part of the app reads (cut, snapping, guards), so nothing else had to change. The graph is in the shape's own frame and is scaled when the shape's box changes (`fitShapeSketch`), so the two never disagree.
- **A double-click finds the shape geometrically** (inside its outline or within six pixels of it, the smallest one): a cut-out's stroke is too thin to be the click's target.
- **The edit card sits on the side away from the shape's card** (left in English, right in Hebrew), placed by the page's direction: the 2D view itself is laid out left to right.
- **Boards: rounded corners, not cut ones**: a board stores a radius per corner; *Cut* is offered for shapes only.

## Code splitting (20 November)
- **Libraries bundled, not from a public CDN**: browsers keep a separate cache per site, so a CDN's copy is not shared with other sites; bundling keeps only the parts used; a school network that blocks a CDN, an outage, the offline mode and the students' privacy all argue for one origin; Cloudflare already serves the files from its edge.
- **Rolldown's `advancedChunks`** (Vite 8), not `manualChunks`, which merged three.js's core into the 3D renderer's file.
- **The 3D view is not deferred**: the welcome screen draws its pictures with three.js and the editor opens on the 3D view.

## Milestone 111: the edge-feature registry (DIELINE_DNA_PLAN.md D3a)
- **Fold-over issues stay where they are** (`foldOverIssues`): they mix rules for one fold-over with one between two (`val.linerCollide`) and a flute check that packs the whole design, which a per-item check cannot hold without packing once per item. The registry is about output; issues can move later.
- **`blocked` is optional** and filled in 112, when there are reasons to give (today `canFoldOver` answers yes or no).
- **A fold-over and a flap may still share an edge** in 111 (as before); 112 refuses new ones.
- **`edgeFlapGeom` and `flapOn` live in the registry's file** and `geometry.ts` re-exports them, which avoids an import cycle (`geometry.ts` → registry → `foldover.ts`).

## Milestone 112: shaped flaps (DIELINE_DNA_PLAN.md D3b)
- **Plain flaps stay as they were** (crease on the edge, no `toward`): a file made before 112 exports byte for byte. Only shaped flaps that fold crease half a thickness in; a plain flap can be made a *Glue flap* to get that.
- **Defaults are not stored**: a flap keeps only `shape`, `len` and what the student changed; a new shape starts again from its own defaults (its slopes, insets, radius, angle), keeping the length only when one is given.
- **The dust flap's numbers differ from a closure's on purpose**: 0.45 of the edge, at least 12 and at most 40 mm, no rounding. A hand flap has no lid to measure.
- **The folded slab is a `Flap3d`** drawn by the joints' `Flaps` renderer and unfolded by `flapMatrix`: no second renderer and no second fold maths.
- **One feature per edge** from now on; old files with a fold-over and a flap on one edge keep both.
- **The flap block stays under *More…*** on the grow card (the rail and the card stay quiet); it is reached from the flat in 113–114.
- **Quick build shows a shaped flap's board read-only** (`WorkshopWhy` `'flap'`), as it does fold-overs.

## Milestone C1: named styles and the card grid (SENTENCE_STYLES_PLAN.md)
- **A style is words, not a template**: `regenerate`, a change of material, sizes, missions and the library see an ordinary sentence design; nothing new is stored and the style is worked out from the words (`styleOf`, the most specific match).
- **The card grid is an alternative view of the same choice** (the owner, 20 November): the sentence stays the default; a *Sentence · Cards* switch, remembered per browser (`viewPrefs.startView`); picking a card fills in the sentence's words. Hidden in Guided, which has its own gallery.
- **Styles are listed only when the material can make them as they are** (every word they fix allowed after the resolver's checks), as the sentence's lists are: hidden, never greyed.
- **A style with no words of its own** (Open tray, Open sleeve) is not a second entry in the sentence's list: its structure's entry carries its name. It is a card of its own in the grid.
- **Trade codes are kept but not shown** until the owner checks each (the sentence plan's decision).
- **These milestones keep letters (C1–C5)**: ROADMAP §5.3 gives 119–133 to the shapes-to-dielines plan.

## Milestone C2: straight tuck, RSC, drawer (SENTENCE_STYLES_PLAN.md)
- **4 mm corrugated makes a carton with shipping (RSC) flaps only**; tucks, snap-locks and four-flap ends stay on card and corrugated up to 2 mm. Shipping boxes are what 4 mm board is for. (Guided's plain *Carton* keeps the old rule: its carton tucks.)
- **The straight tuck is a clause, not a third bottom option** in the sentence: *with a top that tucks in and a bottom that tucks in, both tucking in from the back*. The tray card lists it as a bottom kind of its own (`tuckBack`).
- **The four-flap end stays FEFCO 0204** (all flaps meet); the RSC is a new end, so no golden changed.
- **The drawer's sleeve is measured, not calculated**: it is sized from the tray as built, so the sleeve follows whatever the tray's walls and joints make its outside.
- **Tests import the template registry first** (as `goldenDesigns.ts` does): the structures import each other through it.

## Milestone 113: the Net view (DIELINE_DNA_PLAN.md D1)
- **A switch in the cut plan's dock, not a third top tab** (the plan's decision 2; the owner asked for a quieter interface).
- **The preview is the stage with its controls hidden by a context** (`StagePreview`, read by `useFeature`), not a second renderer: the same scene, the same fold slider.
- **The preview keeps the grow ghost and its ✓ in 113**, so an edge picked in the flat can already be grown; 114 moves the ✓ to the flat and hides it here (never both).
- **Hidden in Quick build and Guided** (the plan's §7 question 1; ROADMAP §5.2 row 10), and a stored *Nets* falls back to the sheets there.

## Milestone 114: building in the flat (DIELINE_DNA_PLAN.md D2)
- **The ghost is grown, not worked out**: on a copy of the design, as ✓ will grow it, and read from that copy's net through the parent board. Exact by construction (bands, per-board materials, re-rooted nets), for one grow on a copy per change, as the overlap check already did.
- **One ✓ decision for both views** (`growConfirm`), and never two ✓ bars: where building in the flat is on, the folded preview has none.
- **Handles capture the pointer** so a drag that ends over the folded preview still ends.
- **Board handles only where the board grows away from its anchor**; the other edges would move the board too, and trays are sized on their own cards.
- **Nets building is Workshop only** (the plan's §7 question 1; hidden in Quick build and Guided).

## Milestone C3: the crash-lock bottom (SENTENCE_STYLES_PLAN.md)
- **Built from public descriptions of the generic ECMA B40 bottom** (straight-edged major flaps, 45° glue triangles), not from any other tool's code. The patent named in Die Cut Studio's notes (US 6,386,437) is for the owner to confirm before this ships (`SENTENCE_STYLES_PLAN.md` §0).
- **One auto-bottom style, not two**: the two differ only in the wall the top tuck folds from, which CutForge does not offer.
- **Card only**, as the plan says: corrugated's flaps are too thick to glue flat and spring.
- **`ConnGeom.glueAt`** names glue on parts that are not glue flaps of their own; the annotations read it, and the exports are unchanged (annotations are an option of the plan, not of the file).

## Milestone C4: the gable top and the hexagon box (SENTENCE_STYLES_PLAN.md)
- **The gable's roofs stop short of the ridge** (3t + 1 mm): meeting edge to edge they collide, and no joint kind fits two edges at a mitre.
- **Glued to the peaks, not locked**: tab-and-slot roofs left slots too close to the peaks' sloped edges; lock ears would need slits the engine does not place on a sloped edge yet.
- **A gable top needs 50 mm of depth** (`GABLE_MIN_DEPTH`, a limit's `min`): below it the short roofs' glue flaps are clamped and overlap the peaks in the flat. The size limits' bisection assumes the small end works, so the floor is given to it.
- **The hexagon box is a box with a hinged lid**, not carton ends on a six-sided tube: already one piece and clean on card, it does what the style is for; n-sided carton ends stay unbuilt (`DIELINE_DNA_PLAN.md` §9).
- **A style starts at its structure's own sizes** when it cannot be made at the sentence's, with a note per size, rather than being hidden from the card grid.

## Milestone C5: flat pieces (SENTENCE_STYLES_PLAN.md)
- **Envelopes are one board with shaped flaps** (112), not a new kind of geometry: the pointed flaps' slopes are worked out from the edge and the length so their tip is 6 mm before rounding, which keeps them clear of the narrow-flap check.
- **The folder is shown open flat**: half open, its right cover meets the left pocket at the spine.
- **The folder's pockets stop 6 mm short of the spine** and are glued on their outer side only; full-width pockets with glue flaps on both sides overlap each other in the flat at the spine.
- **The flat pieces are card only** (thicker boards do not fold flat cleanly).
- **D7's first question is answered** (a grown board at 180° or folded almost shut solves, exports and checks clean); D7 itself (fold along a drawn line) stays with the owner.

## Guided (milestones 105–110, GUIDED_MODE.md)
- **Three levels: Guided · Quick build · Workshop.** A third mode value, `'guided'`, a viewer preference like the other two; a file opens the same in all three. Quick build keeps its name.
- **Every feature row states all three levels** (ROADMAP §5 rule 4b): `GUIDED` in `src/easy/features.ts` is a full column the compiler checks, so nothing of Quick build or Workshop shows in Guided by accident. Rows Guided hides by not mounting what holds them are listed, with where they live, in `tests/quickTable.test.ts`.
- **Guided's interface is its own** (`src/guided/`, its own lazily loaded file); one stage and one sheet view, which ask the table. Nothing outside `src/guided/` imports it except `App.tsx`; the stage draws Guided's handles through a slot.
- **No ghost and ✓ in Guided**: every action applies at once as one undo step. A change that would leave the thing impossible to cut is not made, and a note says so.
- **Guided changes a thing; it does not build from nothing.** No Box, Wall or Standing board; those are Quick build's. A design that is more than one box can be decorated and sent, with a button back to the tools that made it.
- **Sizes are always the inside**, through `boxSize` / `setBoxSize` (milestone 93). Plain things are the sentence's structures with set words, detached from the template so nothing rebuilds them from stale words.
- **Pencil box and Game organiser are boxes** (mission version 2); saved version-1 designs still open and count.
- **Send waits for the check**; *More download options* is the way out. A name is engraved, never cut. The Escape box (hasps) stays with Quick build and Workshop.
- **Guided is in the level switch for everyone; a new browser and a new class still start in Workshop** (the owner, 20 November). This replaces the plan's *a new browser and a new class start in Guided*.

## Milestone 119 (Shapes R0): the spike's two decisions
- **The face-count limit is 200 faces per made model.** At 192 faces the first pass takes 35 ms on this machine's Chromium and 167 ms at 4× CPU throttling; above 200, Make lists *too many faces* with *Fewer faces* as its fix. The default facet counts (12 per turn for card, 8 for boards) keep the plan's shapes far below it (a 12-facet cylinder is 14 faces, an 8-facet sphere 32).
- **The unfolder runs in a Worker** (from R5/R7). The plan's line was 50 ms for 200 faces on the preview build: unthrottled it is under (35 ms), but on a school-grade CPU it is over (167 ms), and any form that does not unfold to one piece spends the whole 400 ms restart budget either way. The first pass's result is shown at once and the restarts' better result replaces it when they finish (as `WAFFLE_MODE.md` §10 planned for slices). Small forms (under about 40 faces, a few milliseconds) may run on the main thread.
- **Coplanar faces are merged within 1e-6 on the normal and 1e-4 mm on the plane** (a revolution's facets are planar only to about 1e-7).
- **Convex faces are tested for overlap by separating axes**, and `polygon-clipping` (retried on coarser grids, a failure counted as an overlap) is kept for concave ones.
- **The spike's code stays in `tests/spike/`** as the reference; R3 and R5 write the engine's versions in `src/model/` in its own types.

## The batch's kiss-score note (20 November)
- **In English, the export's own words**: a teacher's batch mixes students and has no student language; the note is the same as a student's English export.
- **Note above, owner below** on a kiss-scored piece, so the two never overlap.

## Milestone 116: board grades (DIELINE_DNA_PLAN.md D5b)
- **Greyboard is card with a folding ceiling** (`CARD_FOLD_MAX = 1` mm, `foldsAsCarton`), one rule for the sentence's structures, Guided's carton and Quick build's *Carton*: no new material kind and no `folds` field.
- **The built-in corrugated boards are not repeated as grades**: the drawer's corrugated family shows corr-1.6 and corr-4 themselves.
- **Kerf by √(t / t₀)** from the nearest classroom board, rounded to 0.05 mm; clearance as that board's (plywood 0.1); fold allowance 0. Greyboard's bend: smooth radius 20t, pattern radius 6t (starting values, unverified).
- **Hidden in Quick build and Guided** (`'drawer.grades'`); the welcome screen's step 1 keeps the four classroom materials.
- **B flute 3 mm makes cartons with shipping flaps** (C2's rule for corrugated up to 4 mm), not none as the handoff's test list assumed.

## Milestone 120 (Shapes R1): the port
- **From `claude/guided-mode` at `e450c6b`**, which has the commit after PR #6 (`claude/waffle-mode` on the remote lacks it), by path.
- **Absent `outcome` is *not made yet***, not the waffle: a waffle file from PR #6 opens here as shapes, its `waffle` field kept for when the waffle joins.
- **The one-click buttons live on the stage bar** in the top bar, beside *1 Shape*, in place of *2 Waffle*; there is no *2 Make* step to pass through. A made outcome's button shows it pressed and goes back to it.
- **Outcomes made of boards register no piece hooks**: `buildPieces` and `validate` fall through to the boards, so the cut plan, the checks and the export need nothing new.
- **The sculpture keeps the top bar's 3D / Cut plan tabs**; the level switch is hidden on a sculpture (as on PR #6).
- **`.wasm` is typed by the Worker** (`wasmTyped`) as well as by the static assets, so the kernel streams in every deployment.

## Milestone 123 (Shapes R4): free boards and seam folds
- **A seam fold is a tray corner made a fold** (`hingeOf` its child) with its own fit (`seamFit`, 5°–355° except 175–185°), not a new kind of fold: the net, the fold view and the cut plan already handled those.
- **A seam fold is never cut back.** A tray's hinged wall was one; a made model's two faces are one creased board, so the crease's place takes up the thickness and the two outlines overlap by it in the net (their union is the piece).
- **Free boards lie material side up** (side 1), as every board the app makes, so seam creases are scored, not perforated. Edges keep their names (`e<i>` as given) when the points are stored the other way round.
- **A seam's kind belongs to its maker**: `solve` does not re-fit it and `autoConnect` leaves it alone (`auto: false`). R6's chooser sets it.
- **The face graph's builders came forward from R3** (`src/model/polyhedron.ts`): pairing by vertex index, runs of collinear edges with one neighbour joined (their middle points dropped from both faces), no T-junction splitting (a manifold mesh has none).
- **Face keys numbered with `*`** when one name covers two faces (never `~`, which marks a wall set's member in a board id).

## Milestone 122 (Shapes R3): face keys
- **Roles are read from directions in the shape's own frame** (its normal, and for facets its centre), never from manifold's `faceID`, which is per run and not stable across a resize.
- **A box's sides are named `+x`, `-x`, `+z`, `-z`** by its footprint edges (front, right, back, left in its own frame), so a turned box keeps them.
- **Curved shapes are cut into facets on a copy**; the shape stage keeps its smooth look and the student's *Faces* count, when set, wins.
- **The shape cache includes the shape's id**: provenance needs one body per shape, and the lost sharing (two identical shapes) is rare.
- **The sliver check uses twice the area over the outline's length** as a face's width (exact for a strip) at 1.5t, so a strip 3t wide is not listed.

## Milestone 124 (Shapes R5): the unfolder
- **Restarts are counted, not timed** (40, with a 2 s cap as a guard): the plan's *deterministic, the seed is the design id* holds only when the number of tries does not depend on the machine.
- **Flaps are fitted while joining**: an edge a join closes inside an island needs room for its flap there, or the join is refused. Checking flaps only at the end left nets too tight to glue.
- **A dropped flap counts as a piece**, so the search prefers two pieces that glue to one that does not.
- **A flap may narrow steeply at its ends** (its taper stored on the seam, `flapTaper`) before it is made shallower: a steep taper keeps the glue area, a shallow flap loses it.
- **The largest face roots each piece** (`islandOrder`), so the net is laid out from it.
- **Weights**: bend × (0.5 convex, 1 concave) − 0.05 × length / average length (0.3 with *Fewer cuts*); jitter ±0.175 after the first pass.
