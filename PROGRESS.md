# Progress

## Milestone 1 — Vertical slice ✅

Flow: Hebrew/English toggle → choose a material → drag out a panel in 3D → grow a second panel at 90° → finger-joint connection → add a cutout in either view → resize it numerically → switch views → undo → autosave, reload and reopen → download SVG and DXF at true size.

Implemented
- Serializable design model (`src/model`): panels with frames, details, connections, piece quantities, sheet placements; stable IDs; `schemaVersion` with a migration hook; JSON project save/open.
- Geometry: frames and panel growth, finger-joint layout with clearance applied once, manufactured outlines, rectangle/rounded-rectangle/circle details with true arcs.
- Store: transactions (`apply`/`preview`/`commit`/`cancel`), undo/redo shared across views, shared selection.
- 3D workspace (React Three Fiber): draw panels on the floor, select panels/edges/shapes, edge toolbar with ghost preview (shows angle and material side), grow with up/down flip, draw and drag shapes on panel faces, move root panels, perspective/orthographic switch that keeps view direction and framing (`O`), orientation gizmo, fit view.
- Cut plan (SVG): all pieces packed on sheets (shelf packing, quantity copies), select, draw, move and corner-resize shapes, pan/zoom; edits change the same panels as 3D.
- Inspector: exact panel width/height, shape size/diameter/position/radius/operation, quantity, connection type and finger count, material values (labelled as calibration starting points).
- Autosave to IndexedDB, restored on reload; save-state indicator.
- Export: SVG (mm page size + matching viewBox) and DXF R12 (`$INSUNITS` 4) with LightBurn palette colours per operation; one file or one per sheet; nominal kerf mode shown in the dialog and file name; pre-export validation (shape outside panel, too-thin web, piece larger than sheet) with click-to-select.
- i18n catalog for every UI string; Hebrew is a full RTL layout; canvases and numbers are never mirrored. First-use hint sequence in both languages.

Verified
- `npm test` — 19 Vitest tests: panel growth geometry, joint complementarity and corner coverage, regeneration on thickness/finger-count change, butt fallback, true-size export, independent DXF/SVG reader check (ezdxf + svgpathtools: units, layers, closure, circles and arcs kept), transactions (one drag = one step, cancel), project round-trip and rejection, Hebrew catalog completeness, no hard-coded UI text.
- `npm run e2e` — Playwright, real browser with WebGL: the full milestone-1 flow in Hebrew (drawing in 3D by mouse, cutout drawn on the upright wall in 3D, rectangle drawn in the cut plan, undo/redo, reload restores everything, SVG/DXF downloads checked with the independent readers); and an offline test (network disabled after load: design, save project, download SVG and DXF, no network requests).
- `npm run build` passes.

Known limitations at the end of milestone 1
- (Resolved in milestone 2: closing seams, three-panel corners, angles, folds, tabs/slots, glue flaps, half-laps.)
- No smart snapping, multiple selection, align/distribute, arrays or solo view yet (milestone 3); drawing snaps to a 1 mm grid.
- No text, SVG import, manual sheet placement or compensated kerf mode yet (milestone 4). Packing is bounding-box shelf packing.
- LightBurn colour mapping follows its documented palette but has not been tested in LightBurn itself.
- The production bundle is a single ~1.2 MB chunk (three.js); code splitting is a later optimisation.

## Milestone 2 — Connections and angles ✅

Implemented
- **Seam geometry derived from 3D** (`src/model/seams.ts`): every joint is computed from the panels' frames and sizes on every edit, so it follows size, thickness, clearance, count, spacing, position and angle changes. Three configurations are recognised: two edges meeting at an outer corner, an edge meeting a face (standing on it, or running into it), and two upright panels crossing.
- **Connection kinds:** finger joints (any two meeting edges, not only parent/child), tabs and slots (edge or interior slots; slots are the exact projection of each tab, so they also come out at an angle in side walls), slide fit, folds, glue flaps (on a grown panel's edge onto its parent at any angle, or on closing seams with the owner cut back by the thickness), half-laps, and edge-to-edge.
- **Angles:** 90° (default), 60°, 45°, 30°, 15° on the edge toolbar and editable afterwards on the connection; the ghost shows the result. Offered connections follow the actual angle: 90° gets everything the material supports; card/corrugated at other angles get folds and glue flaps; plywood at other angles leans on its parent and needs side walls.
- **Leaning plywood:** with no side walls the angled option is disabled with the reason and an *Add side walls* button (sized to enclose the leaning panel). The leaning panel's side tabs pass through angled slots in the side walls; deleting a side wall flags it as unsupported.
- **Three-panel corners:** the earlier panel owns the corner (finger segment ownership is deterministic, see DECISIONS.md); verified volumetrically.
- **Closing seams:** meeting/overlapping panels are detected and offered in the inspector with a *Connect* button and suitable kinds; unconnected overlaps are flagged. A connection whose edges stop meeting keeps its last valid joint and is flagged instead of reshaping anything.
- **Folded nets:** panels joined by folds are one piece, unfolded about their fold lines (with the material's fold allowance) and unioned into one outline; folds and glue-flap folds export as score lines. Quantities apply to the whole net. The cut plan edits details on any panel of a net.
- **Dividers:** *Add a divider* on a panel with walls: position, direction and height. Plywood: tabs through base and wall slots, half-laps where dividers cross. Card/corrugated: slide fit between walls (no wall slots), resting on the base. Clear inside sizes are shown.
- Project files move to schema version 2 with a migration from version 1.

Verified
- `npm test` — 37 Vitest tests, including 17 new joint tests. A volumetric checker samples 3D points and asserts **no two manufactured panels ever occupy the same space** (and corners are filled) for: a plywood box with four closing finger seams (three-panel corners), the same after size/thickness/finger-count changes, tab-and-slot walls, a 30° leaning panel in side-wall slots (and after changing to 45°), and a plywood organiser with two crossing dividers before and after moving one. Also: slot width = thickness + clearance and slot angle = 30°; unsupported flag without/after deleting side walls; folded tray is one piece with 4 fold score lines and correct net size; glue flaps on corners; corrugated dividers have no wall slots; broken seam keeps its last geometry; v1→v2 migration; folded tray export checked with ezdxf/svgpathtools (one closed cut outline, 8 score lines).
- `npm run e2e` — 4 Playwright tests: the milestone-1 slice, offline, a plywood organiser built through the UI (corners connected from the inspector, two dividers, half-lap, moving a divider, no export issues), and the leaning-panel flow (angled option blocked with the reason, add side walls, grow, delete a wall → "leans but nothing holds it" in the export check, clicking it selects the panel).

Known limitations after milestone 2
- Glue flaps on closing seams are placed on the earlier panel of the pair; there is no control yet to move a flap to the other panel.
- Folds render in 3D as two panels meeting; the bend itself (and the fold allowance) is only in the flat net.
- A leaning panel taller than its side walls is not flagged; make the walls taller (*Add side walls* sizes them for the current height and angle).
- Half-lap slots are cut from the top of the earlier divider and the bottom of the later one; a divider's own base tabs at the crossing are removed by the half-lap.
- Closing seams are offered, not created automatically, except for dividers and leaning panels (whose connections are generated together).


## Milestone 3 — Editing tools ✅

Implemented
- **Solo panel view**: double-click a panel (3D or cut plan) or *Open face-on (solo) view* in the inspector opens that panel face-on with the same tools, selection and history. *Back to …* (or Esc with nothing selected) returns to the previous view; the 3D camera (position, target, zoom, perspective/orthographic) and the cut plan's pan/zoom are kept.
- **Multiple selection**: Shift/Ctrl-click to add or remove shapes (3D, cut plan, solo); drag on empty space for a selection box (cut plan and solo; right-drag pans there). The inspector says how many shapes and on which panel(s).
- **Group edits**: drag any selected shape to move the whole group (one undo step; each shape moves on its own panel, mapped through the view); duplicate (*Duplicate* or Ctrl+D), delete, nudge with the arrow keys (1 mm, Shift = 10 mm); resize about the group's box with corner handles or exact group width/height.
- **Align** (left/right/top/bottom edges, centres) and **distribute** (equal gaps, equal centre spacing) within one flat surface — one panel or panels lying in the same plane. When the shapes are on panels facing different ways, the buttons are disabled and the reason is shown.
- **Live arrays**: row or grid arrays with editable columns, rows and centre-to-centre spacing; copies follow every change to the shape, are cut/exported/validated like normal shapes, and are saved in the project. *Explode array* turns them into independent shapes.
- **Smart snapping** while drawing, moving and resizing, in 3D, cut plan and solo view: panel corners, edge midpoints and centre; other shapes' corners, edge midpoints and centres (array copies included); alignment with any of those; equal spacing between neighbours. The shapes being moved are excluded; the active target and guide lines are drawn; the threshold is a fixed 10 screen pixels at any zoom; Alt disables it. Snapping creates no stored relationship. Without a nearby target, values fall on a 1 mm grid.
- **Keyboard**: Delete/Backspace, arrows (+Shift), Esc (cancel drag → leave tool → clear selection → leave solo view), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+D, O (perspective/orthographic).
- Project schema v3 (optional `array` on shapes).

Verified
- `npm test` — 47 Vitest tests; new: group move/duplicate/delete, resize about the group box, align edges/centres, equal gaps and equal centre spacing, refusal across non-coplanar panels, alignment across two separate coplanar panels, live arrays (geometry, export holes, save/reopen, explode), snapping to the panel centre and other shapes with self-exclusion, and equal-spacing guides.
- `npm run e2e` — 6 Playwright tests; new editing test: double-click a panel in 3D → solo view; draw by mouse with snapping (a drag starting 1.5 px off lands exactly aligned, guides shown); box-select; align tops; equal gaps; group drag = one undo step and undo; arrow nudges; Ctrl+D and Delete; Shift-click to deselect; group width; grid array then explode; back to 3D with the camera unchanged; align disabled with the reason shown for shapes on perpendicular panels.

Known limitations at the end of milestone 3
- Multiple selection covers shapes (cutouts, engravings, scores), not whole panels.
- Box selection is in the 2D views only (in 3D, Shift-click).
- Moving a group across panels that face different ways moves each shape by the projection of the drag onto its own panel.
- Resizing a group with handles is offered when all shapes are on one panel (numeric group size likewise).

## Milestone 4 — Text, import and quantity ✅

Implemented
- **Text** (Text tool, 3D or 2D): Hebrew and English, editable as text in the inspector (value, font, letter height, engrave or cut-through). Three bundled OFL fonts covering both scripts (Rubik, Frank Ruhl Libre, Amatic SC), loaded in the background. Layout follows the Unicode bidi algorithm (bidi-js), including mixed Hebrew/English/numbers and mirrored brackets. Glyphs are turned into outline polygons (curves flattened at a declared 0.02 mm tolerance) for display, validation and export, so files never reference a font. An engraved text shape is one SVG path with even-odd fill so letter counters stay holes in LightBurn.
- **SVG import** (*Import SVG*, onto the selected/solo panel): path, rect, circle, ellipse, polygon, closed polylines, nested transforms and elliptical arcs. Open lines are dropped with a note; files with only text, pictures or nothing closed are refused with the reason; very detailed shapes are simplified. The shape keeps its proportions, can be resized, and stays a vector shape in the project.
- **Quantity and packing**: copies per piece; packing fills each sheet from the top-left around any hand-placed pieces, largest first, with part spacing and sheet margin. Rotation only when the material has no grain/flute direction or the student allows it (*Allow turning pieces against the grain*). A folded net packs as one unit.
- **Manual sheet placement**: drag a piece on the cut plan (also to another sheet); it stays where it was put, and the other pieces pack around it. *Rotate on sheet* turns one copy (blocked, with the reason, against the grain). *Repack* clears hand placements after a confirmation; nothing is ever repacked silently.
- **Validation before export**: added text that failed to outline (with the missing characters), cut-through letters whose middles would fall out, overlapping or touching cut-out shapes (double cut lines, array copies included), pieces that overlap on a sheet or lie outside it (drawn in red on the cut plan). Each message selects the affected panel or shape when clicked.
- **Kerf modes**: Nominal (default, with the LightBurn note) or Compensated: outer outlines grow and holes shrink by kerf/2; islands inside cut-outs grow. Lines move, arcs keep their centre (arcs stay arcs), opening corners get a round join, closing corners are trimmed. An offset that collapses, reverses or crosses itself blocks the download and names the piece. The mode and kerf are in the dialog and the file name.
- Project schema v4 (text and imported shapes, rotation setting).

Verified
- `npm test` — 61 Vitest tests; new: bidi visual order (mixed Hebrew/English/numbers, brackets), outlines in all three fonts with no missing glyphs, text exported as closed outlines in visual order with no font references (SVG and DXF), stencil warning, SVG import (transforms, arcs, open lines dropped, text/picture/non-SVG refused), imported shapes at exact size and saved in the project, **the kerf acceptance check (50×50 with Ø10 and kerf 0.2 → 50.2×50.2 and Ø9.8 compensated, unchanged nominal, arcs kept)**, compensated finger-jointed outlines, blocked collapse, **quantity 30 packed without overlaps, within margins, no rotation against the grain**, manual placements kept with overlap/off-sheet flags, folded net copies, overlapping cut-outs flagged.
- `npm run e2e` — 8 Playwright tests (stable at 3× repeats with 6 parallel browsers); new: Text tool on a panel in 3D, Hebrew/English text edited in the inspector, SVG import onto the panel and a refused text-only SVG with its reason, downloads without font references; quantity 30 on the cut plan, dragging a copy off the sheet (kept, flagged in red and in the download checks), rotation blocked by grain, Repack, nominal vs compensated downloads (file names, hole radius 4.925 mm).
- Fixed along the way: number fields could commit a stale value when typed and confirmed very quickly (they now read the input itself on Enter); clicking a panel with the Text tool no longer clears the new selection.

Known limitations at the end of milestone 4
- Text is laid out on one line; no kerning; no stencil bridges for cut-through text (warned instead).
- SVG import ignores strokes widths, CSS styles and `<use>` references; curves are flattened (16 segments per Bézier) before simplification.
- Packing is bounding-box based (no true-shape nesting). Manual pieces are not snapped to each other.
- Kerf compensation offsets each contour on its own; two cut-outs that end up touching after compensation are caught by validation of the nominal shapes only.

## Milestone 5 — Templates ✅

Implemented
- **Template registry** (`src/templates`): each template is an id, version, parameter schema with defaults, compatible materials, a generator that outputs the ordinary design model, and optional checks. The inspector builds the parameter controls from the schema; adding a template needs only its definition, generator and tests.
- **Start from** *Blank design*, *Organiser with dividers* or *Card / tile stand* on the first screen (materials a template does not support are disabled).
- **Organiser with dividers**: inner or outer size, height, dividers in each direction, divider height, lid (none / lift-off), lid rim height. Plywood: finger-jointed box, dividers with tabs through wall and base slots, half-laps where they cross. Corrugated (1.6 / 4 mm) and card: folded tray with glue flaps at the corners, dividers that slide in with clearance and cross with half-laps, no wall slots. **Lift-off lid**: a shallow upside-down tray (finger-jointed in plywood, folded with glue flaps in corrugated) whose inner size is the box's outer size + 2 × clearance; it is rebuilt whenever the box size, thickness or clearance change, and dividers taller than the walls with the lid on are flagged.
- **Card / tile stand**: card/tile width and thickness, lean angle (15/30/45/60°), number of slots, base depth. Plywood: base, two side walls and leaning supports held by angled tab-and-slot seams in the side walls, plus a low front lip. Card/corrugated: folded side walls, supports attached with glue flaps to the base and to both side walls, folded front lip. Supports that do not fit on the base are flagged.
- **Regeneration keeps user edits by id**: template panels have stable ids (`t:<role>`, e.g. `t:wall0`, `t:divX2`); on a parameter or material change, cutouts and text stay on their panels, user-added panels and their connections, names, quantities, hand placements and the box's position are kept, and shapes on panels that no longer exist are listed (*These edits could not be kept…*). Each parameter change is one undo step.
- Template designs are edited with the normal tools (they are ordinary panels and connections). Project schema v5 (template reference).

Verified
- `npm test` — 72 Vitest tests; new: every template × material variant generates a design with no broken connections and no validation issues; ids are stable across generations; plywood organiser (8 finger seams, 2 half-laps, wall and base slots, **volumetric no-overlap check of the whole box with dividers**); corrugated 1.6 and 4 mm organisers (folded tray as one piece, 4 glue flaps, no wall slots); **user cutouts and text survive parameter changes, lost edits are listed**; divider slots follow a size change; **lid inner size = box outer size + 2 × clearance in plywood and corrugated, after changing box size and after changing thickness and clearance**; dividers-taller-than-walls flag; plywood stand supported at 15/30/45/60°; card and corrugated stands glued; supports-too-deep flag.
- `npm run e2e` — 10 Playwright tests; new: start from the organiser in plywood, draw a cutout on a wall in its solo view, change width, divider count and lid in the inspector (cutout kept, lid follows), undo/redo a parameter change, lost-edit message, no export issues; corrugated card stand and changing its angle.

Known limitations at the end of milestone 5
- One template instance per design.
- The card/tile stand has no stop at the top of a support; cards lean on the support's face.
- Changing a template parameter replaces the template panels: a manual edit to a template panel's size (rather than a template parameter) is replaced by the parameter-driven size.

## Milestone 6 — Class submission and teacher view ✅

Implemented
- **Cloudflare Worker** (`worker/index.ts`): one Worker serves the static app and `/api`. **D1 via Drizzle** (`worker/schema.ts`, migration `drizzle/0000_init.sql`) for classes and submission records; **R2** for submitted project files and previews. `wrangler.toml` with D1/R2/assets bindings; secrets for the teacher key and session signing.
- **Student submission**: class code + display name (remembered locally), design title; uploads the project JSON, a preview SVG and the material. The server accepts only project files it can parse and migrate with the app's own code, caps sizes, refuses unsafe previews, rate-limits per class and per browser, refuses closed classes. The newest submission from a browser replaces the previous one; history is kept for the teacher. A class material profile that differs from the design is explained, with *Switch to the class profile*. Network/server failures are explained plainly and *Download for laser* is offered; local work is untouched. Validation problems are shown before sending.
- **Teacher view** (`/#/teacher`): sign in (one teacher key, HMAC-signed HttpOnly session cookie); create/close/reopen/delete classes with short random codes; class material profile; submissions list with preview, name, title, material, pieces, status and time (replaced ones on request); per-submission SVG/DXF/project downloads regenerated from the project file (never a submitted SVG); **batching** of submissions with the same material and thickness onto shared sheets with the student's name (or initials) on the GUIDE layer, using the same packer and writers; mixed materials refused with an explanation; **mark as cut** per submission or for a selection; delete submissions. Auto-refresh every 20 s and a Refresh button.

Verified
- `npm test` — 79 Vitest tests; new Worker tests run the real SQL migration on SQLite (`node:sqlite`) with a D1 stand-in and an in-memory R2: teacher auth (wrong key, forged cookie), class creation and code format, student submit → teacher list → project/preview download → mark as cut, resubmission replaces with history kept, refusals (unknown code, malformed project, unsafe preview, oversized file, missing name, per-browser flood → 429, closed class → 403), class material profile returned to students, deleting a class removes its R2 files. Batching tests: shared sheets with labels inside each piece on the GUIDE layer (SVG and DXF), mixed materials refused.
- `npm run e2e` — 12 Playwright tests, now including **acceptance check 10 against the real Worker** (workerd via `wrangler dev`, local D1/R2): teacher signs in and creates a class; three students (Hebrew and English names, two plywood, one corrugated) submit with the code; the teacher sees them, mixed-material batching is refused, the two plywood submissions are batched onto shared sheets and downloaded (GUIDE and CUT layers, no font text), both are marked as cut, and a single submission downloads as files regenerated from its project; a class material profile mismatch is explained and *Switch to the class profile* submits with it; with the server unreachable the student sees a plain message, the download is offered and works, and the design is unchanged.
- `npx wrangler deploy --dry-run` bundles the Worker with its D1, R2 and assets bindings; `npm run typecheck` covers the Worker with the Workers types.

Known limitations at the end of milestone 6
- Teacher access is one shared key (see DECISIONS.md), not a magic link or passkey.
- Not deployed from this environment (no Cloudflare account); the deployment steps are in the README and were checked with `wrangler deploy --dry-run` and local `wrangler dev`.
- Batched sheets use nominal kerf; the teacher sets the kerf in LightBurn.
- Previews are SVG drawings of the first sheet (not 3D renders).
- No automatic expiry of submissions (the teacher deletes classes at the end of term).

## Visual overhaul ✅

The brief and the interview decisions are in `VISUAL_OVERHAUL.md`; the design decisions are in DECISIONS.md (*Visual overhaul*). Review screenshots (English and Hebrew) are in `docs/overhaul-shots/`.

Implemented
- Token-based styling, Rubik UI font, inline SVG icon set; one-row top bar with project menu, material pill and *Material & sheet* drawer; floating dark tool rail with shortcuts and operation swatches; contextual card (inspector) and grow card in the same slot; coach-mark tips that skip "draw your first panel" for templates.
- 3D stage: per-part tinted faces and darker cut edges, optional outlines, contact shadow, Auto/Simple/Rich quality with GTAO, on-demand rendering, view cube, screen-sized edge picking with hints, ghost with blocked (amber) state, angle arc, push-pull arrows, flip badge, in-place dimensions, joint pills, fold beads and creases, fold/unfold slider. Auto-fit when the view shows none of the design.
- Cards: scrub fields, steppers, segmented choices, the angle dial; one-at-a-time joint list; collapsible divider adder.
- Role names for parts across the 3D view, cards and cut plan; matched part tints in the cut plan; material-tinted sheet with a chip; RTL-aware fit.
- Start screen: material then template, with sheet-corner drawings and template pictures rendered from the generators.

Verified
- `npm test` — all app tests pass (71). `worker/api.test.ts` needs `drizzle-orm` installed (`npm ci`); it was not installed in this environment.
- Playwright — all 11 browser specs pass, including a new `overhaul.spec.ts` (start screen, drawer, role names, fold slider, in-place dimension, joint pill, dial detents by click and keys, flip badge, ghost height label, view settings, project menu). The classroom spec was not run here because the Worker needs `drizzle-orm`; nothing it uses changed except `open-teacher`, which moved into the project menu (the spec navigates to `/#/teacher` directly).
- Push-pull drag checked by hand in a real browser (one drag = one undo step).

Known limitations after the overhaul
- Push-pull arrows are not covered by an automated test (their screen position depends on the camera).
- Rich quality was checked on a GPU; software rendering always uses Simple.
- The grow card sits in the card slot, not next to the edge (see DECISIONS.md).

## Hinge dial and joints display ✅

Implemented (supersedes the overhaul's flip badge and dial detents)
- One hinge angle from 0° to 360° replaces Up/Down (`src/model/hinge.ts`): 90 upright, 180 flat, 270 on the other face. The model still stores `angle` + `dir` (`fromHinge` / `hingeOf`).
- `checkHinge` zones on the card dial (`AngleDial`) and the stage knob (`AngleArc`): red only for lying on the parent (within 10°) or going below the floor; amber notes for plywood leaning without side walls, leaning outward, or flat; green otherwise. *Add side walls* is offered where it helps. Plywood off 90° may also be butt-glued.
- Preferred joints (`pref`) come back when the angle allows; meeting panels are joined automatically after every edit (`autoConnect`), unjoined pairs are remembered.
- Joint pills hidden by default (*Show joints*); the angle is at the top of the panel card; joint list and open seams are in a collapsed *Joints (advanced)* section with a *Connect all* notice.

Verified: `tests/hinge.test.ts`, `tests/autojoin.test.ts`, `overhaul.spec.ts` and `joints.spec.ts`.

## Milestone 7 — Foundation: schema v6 ✅

Implemented
- Schema v6 (`src/model/types.ts`): every panel has a `sketch` — root panels a free polygon (`pts`, `edgeIds`), grown panels a parametric wall (`corners`, `inserts`); `w`/`h` are the sketch's bounding size. Details may be `add` and `polygon` with `through`/`regular`; `Design.trays`; `Connection.trayId`.
- Edge keys (`src/model/edges.ts`): `e<n>`, wall inserts, `<detail>.<i>`, `<key>#<n>` pieces, `face`. `EdgeRef.edge`, `ConnGeom.edges[].edge` and per-edge notch maps are keyed. `panelEdges` is the one place that lists a panel's growable edges.
- Migration v5 → v6 (`serialize.ts`): roots become 4-point polygons, grown panels plain wall sketches, edge n → `e<n>`, -1 → `face`, in connections and stored geometry.
- Generalised to keyed polygon edges: frames and `growFrame`, edge-on-face clipping to any outline (`faceFit`), seam detection over all edges, the manufactured outline (offset edges meet at any corner angle), fold nets (`foldXform`), `checkHinge`, `hasSideWalls` / `addSideWalls` (the polygon's neighbouring edges), part and edge names, the inspector's *Grow from* buttons, stage edge picking and hinge widgets.

Verified
- `npx tsc -b --noEmit` and the Worker typecheck: clean.
- `npm test`: 129 tests pass, including the golden exports (both templates in every material, five hand-built designs) and the five v5 project files, all byte-identical in SVG and DXF; the `ezdxf` checks ran.
- New `tests/edges.test.ts`: migration shape, rectangle keys, a pentagon base's keys and neighbours, a wall grown from a sloped edge, side walls on polygon neighbours, hinge zones on a sloped edge.
- Playwright: all 13 specs pass (including the classroom spec against the real Worker).

## Milestone 8 — Polygon bases ✅

Implemented
- Polygon tool (`G`, `src/views/polyTool.tsx`): click corners on the floor for a new base or on a panel for a `polygon` shape (stored like an imported path, so move/resize/array/snap work). Closes on the first point or Enter; Backspace removes the last corner; Esc cancels; Shift locks 15° steps; typing a number sets the segment length; the closing segment turns red and says "crosses itself" when the outline would cross. Its floating card switches to a regular n-gon (3–12 sides, drag from the centre, Shift turns in 15° steps).
- Model: `addPolygonPanel`, `regularPolygon`, `isSimplePolygon`, `moveVertex`, `insertVertex` (first half keeps the id, the second gets a new `e<n>`), `deleteVertex` (the edge before absorbs the next; at least three stay), `addPolygonShape`. A wall whose edge is deleted stays where it was and its joint is flagged broken.
- Outline editing: *Edit outline* on a base's card shows vertex handles (drag; select + Delete) and edge-midpoint "+" handles; other parts ignore the pointer meanwhile. Enter/Esc ends it.
- Joints at any corner angle (`src/model/seams.ts`): corners are detected from 30° to 150°. Angled fingers cut `t / sin α` deep (`t·cot(α/2)` when acute, with the owner's end trimmed by `t·cot α` so it does not poke out); square-cut corners leave gaps of `t·|cot α|`, noted in the joint card. Glue flaps fold by the corner angle onto the other wall's inner face. New corner tab-and-slot (every material, the corrugated default): the owner is cut back to the receiver's inner face except at its tabs; slots are the tab volume projected onto the receiver plus c/2; the receiver's end is extended by a web so the slots are closed holes. Corrugated tabs are at least max(4 mm, 3t) wide.
- Validation: slots are checked against the real manufactured outline (inside it, with at least the minimum web).
- Polygon walls are named *Wall n* (by edge).

Verified
- `tests/polygon.test.ts`: hexagon geometry, self-intersection refused, vertex move/insert/delete, deleted-edge wall flagged; a hand-built **hexagon plywood tray**: six finger corners at 120°, volume occupied at most once (0.55 mm sampling), gap on every corner's inner face = `t·|cot 120°|` ± 0.03 mm, export check clean, 7 pieces; **corrugated hexagon tray**: six tab-and-slot corners with closed slots, one folded net, clean export check; card hexagon tray with glue flaps on the inner faces; a 60° triangle tray without overlap.
- `tests/e2e/polygon.spec.ts`: click-drawn pentagon base, grow from its sloped edge, vertex drag re-sizes the wall, 8-sided n-gon, a polygon shape on a panel, cut plan; Hebrew card. Screenshots in `docs/polygon-shots/` (English and Hebrew).
- Golden exports: unchanged except `hand-corr-dividers` (its hand-built corrugated corners now default to tab-and-slot instead of glue flaps, as the brief asks). Templates keep glue-flap corners on card and corrugated, so their goldens are byte-identical.
- `npm test` 141 passed; Playwright 15 passed (2 screenshot specs skipped unless `SHOTS=1`); typecheck clean.

## Milestone 9 — Add/Cut on outlines ✅

Implemented
- Own outline (`src/model/outline.ts`): sketch ∪ Add shapes − Cut shapes, with booleans from `polygon-clipping`; Cuts win over Adds whatever the order. A Cut entirely inside stays a hole and keeps its arcs; a Cut across the edge becomes a notch (curves flattened at 0.01 mm). Results are cached by content.
- Edge pieces and shape edges: each straight segment of the result is keyed by its source — a sketch edge keeps its key (`e2`, or `e2#0`, `e2#1` when split), a shape segment is `<detail>.<i>`. All of them can grow panels (5 mm or longer). A key whose edge was split finds its first piece, so a wall stays where it was.
- Joints re-lay over the surviving contact: closing seams are kept on whole edges and laid out for every pair of pieces that meet; a piece pair too short for fingers gives way on one side; a seam whose contact a cut took is flagged *too little contact* (`Connection.thin`).
- Wall sets (`reconcileWallSets` in `solve`): a wall on an edge a cut splits becomes one wall per piece (`<wall>~1` …, same height, angle and joint), and shapes go to the wall whose part contains their centre. A derived wall whose piece disappears is removed, or kept and flagged when it has shapes.
- Vertex insert splits a wall the same way; vertex delete merges the walls of the two edges (both walls' shapes kept, at their place in space) or moves a lone wall onto the merged edge.
- Fragments: a panel its cuts split gives one piece per fragment in the cut plan (*Base (1/2)*, *(2/2)*), with a warning; slivers thinner than half the minimum web are flagged.
- Tools: the op row is **Add · Cut · Engrave · Score** (`op-add`); the shape card offers all four. Outline shapes show as dashed, selectable handles in the cut plan. Shape edits re-solve the design (walls and joints follow).
- Validation: shapes are checked against the real outline on non-rectangular panels; an Add standing alone or a Cut that misses the panel is flagged; split, sliver, orphaned wall and too-little-contact messages (English and Hebrew).

Fixes found while checking in the browser
- Outline results were cached with references to immer drafts (crash after an edit); sketch points are now copied.
- Wall-set copies used `structuredClone`, which cannot clone a draft; a JSON copy is used.
- Sloped fold strips overlap their panels by 1e-5 mm so the union joins them (a hexagon card/corrugated net was silently several outlines).

Verified
- `tests/outline.test.ts` (10 tests): notch vs hole (arcs kept), piece keys and positions, Add + Cut precedence and a hole inside an Add, growing from a shape edge, **L-notch** (walls shorten, new shape edges, no overlap), **middle notch** (wall split into two with their own finger joints on `e0#0`/`e0#1`, shape moved to the right half, no overlap, orphan flag after the notch is removed), derived wall removed with its piece, corner notch re-lays fingers / flags too little contact, **vertex insert/delete** splitting and merging walls with their shapes, fragments as two pieces with a warning, slivers.
- `tests/e2e/shapes.spec.ts`: a Cut dragged across a free edge (two growable pieces), across a walled edge (the wall splits), an Add tab, the cut plan (3 pieces, the Add selectable). Screenshots `docs/polygon-shots/*-05-*`, `*-06-*`.
- `npm test` 151 passed; all app Playwright specs pass.

## Milestone 10 — Extrude and trays ✅

Implemented
- `Design.trays` (`src/model/trays.ts`): `{ baseId, height, wallKind, cornerKind, openEdges }`. Reconciliation in `solve` stands a wall on every growable base edge (5 mm or longer) that has none and is not open, with stable ids `<tray>/<edge>` and connection `<tray>/c/<edge>`; walls whose edge disappears are removed (or kept and flagged when they carry shapes). New edges from Add/Cut shapes and vertex inserts get walls automatically.
- Defaults: card and corrugated walls fold up from the base (one net); corners glue flaps (card) or tab-and-slot (corrugated); plywood finger walls and finger corners. Tray corners take the tray's corner joint; any one seam can still be changed.
- Shared height: push-pull or typing the height on any tray wall changes `tray.height` (walls standing on the base are `H − t`, finger walls `H`); *Own height* keeps one wall's height (`customHeight`), and unticking returns it to the tray's.
- Deleting a tray wall adds its edge to `openEdges`; *Wall it* on the tray card closes it.
- Inside corners (a reflex vertex with walls on both edges): the wall on the outgoing edge reaches back across the corner (`Panel.ext`, derived each solve) by `t / sin(turn)`, plus a web when that corner is tab-and-slot, so its slots are closed; where it reaches over the base it sits on the base face. The corner is joined edge-on-face.
- Interface: *Extrude walls* on a free base's card shows a ghost tray with a push-pull arrow and an in-place height, the default joints, and *Add walls* / *Cancel*. The tray card has height, wall and corner joints, the crease-loop note (folded walls), short-edge and open-side notes with *Wall it* buttons. A tray wall's card says its height is shared and offers *Own height*. A Cut shape on a tray base that reaches a walled edge shows the hint about tray edges always getting walls.

Verified
- `tests/trays.test.ts`: card hexagon tray (6 folded walls with stable ids, glue corners, **one net**, clean export check); corrugated 4/1.6 (tab-and-slot corners) and plywood (fingers) hexagon trays without overlap and clean; **push-pull on one wall changes all** and own height; delete + Wall it; **L-notch on a tray base**: walls shorten, two new walls, the inside corner joined (tab-and-slot through the reaching wall), no overlap, clean export check; vertex insert splits a tray wall (still one net); a 4.2 mm edge stays open and is counted.
- `tests/e2e/trays.spec.ts`: hexagon with the n-gon tool, Extrude card and ghost dimension, Add walls, tray height, a wall's height edit changes the tray, delete a wall and *Wall it*, one piece in the cut plan. Screenshots `docs/polygon-shots/*-07..09-*`.
- `npm test` 158 passed; app Playwright specs pass.

Not done
- A crease between two walls of a tray is not offered (it would need nets that fold across closing seams); the tray card says why.

## Milestone 11 — Wall outline editing ✅

Implemented
- Wall sketch editing (`src/model/ops.ts`): `setWallCorner` (top corners move freely; the attached bottom edge is locked), `addWallInsert` / `moveWallInsert` / `deleteWallInsert` (a point at fraction t along a free edge, pushed `off` mm outward; a gable is one insert on `e2`). The part of an edge after an insert takes the insert's id as its key. Points scale with the width and keep their offsets when the height changes.
- *Edit outline* on a wall's card: draggable top-corner and insert handles, "+" on every free edge segment, greyed bottom corners; Delete removes a selected insert (or resets a corner).
- Sloped edges are ordinary keyed edges: grow from them with the hinge dial and zones (a roof on a gable), and joints re-lay when the gable changes.
- Corner slivers: where a wall's outline runs on past the end of a shared corner edge into the other panel's slab (a wall lowered at the corner), that sliver is cut away (`ConnGeom.cuts`, subtracted in layer 7, in the cut file and in 3D).

Verified
- `tests/walls.test.ts`: gable keys and apex, bottom corners locked to the edge, points keep offsets on height change, insert delete; a top corner lowered at a finger corner (corner re-lays, no overlap); **a roof grown from a gable's sloped edge**: hinge zones on the slope, roof width = slope length and runs along it, **steeper gable re-lays the roof's fingers**, no overlap at the joint.
- `tests/e2e/walls.spec.ts`: "+" on a wall's top edge, drag the point up into a gable, grow a roof from the slope in the grow card. Screenshot `docs/polygon-shots/*-10-gable-roof.png`.
- `npm test` 161 passed; golden exports unchanged.

## Milestone 12 — Through-cuts ✅

Implemented
- `src/model/through.ts` (layer 5): a Cut with `through` removes material from every other panel along its source panel's normal, both ways. Parallel panels get the shape translated; oblique panels get the shape swept between their two faces (the laser cuts square, so any part of the thickness in the path is removed); edge-on panels get strips across them where the shape crosses the band their thickness makes in the source plane. Panels grown from edges the cut made on its source are left out. The regions are derived (cached by content), never stored; the source keeps one live shape.
- Joints re-lay over the contact that is left (`survivingContact`, sampled every 0.25 mm on both panels): fingers and tabs are laid out per surviving interval.
- Layer 7: the regions are subtracted in the cut file and in 3D (holes where they fall inside). A panel split by a through-cut becomes fragments (*Divider 1 (1/2)*, *(2/2)*) with a warning; a panel removed entirely is flagged *removed by a cut*, left out of the cut file and shown as a faint ghost, and comes back when the cut is deleted. Oblique and edge-on cuts are flagged as approximated bevels.
- Interface: the op row's *Cut through* switch (`op-through`) appears with Cut; the shape card has a *Cut through* checkbox and "Cuts N panels". While a through-cut is drawn or selected, every panel it reaches is outlined in amber and a badge shows the count. Clicking where it cut another panel selects the source shape, so move, resize and array act on the one feature.

Verified
- `tests/through.test.ts`: **the chamfer** (front wall's own corner notch, the back wall loses the same 200 mm² triangle, the edge-on left wall loses its top 20 mm along its whole length, the right wall untouched; the front/left finger seam re-lays with no overlap; bevel flagged); **moving the source** updates the panels it reaches; **deleting it restores every panel**; a through-slot that splits a wall into two pieces with a warning; a cut covering a whole panel removes it (kept, flagged, not in the cut file) and deleting the cut restores it; **a base hole cuts a full-height slot in the divider over it** (two fragments), with the count known before commit.
- `tests/e2e/through.spec.ts`: Cut + Cut through, a rectangle across a wall corner shows "Cuts 2 panels" **before the mouse is released**, the shape card agrees, Engrave hides the switch, clicking the cut on the back wall selects the source, unticking restores; a circle under a divider shows "Cuts 1 panels" mid-drag. Screenshots `docs/polygon-shots/*-11-*`, `*-12-*`.
- `npm test` 165 passed; app Playwright specs pass.

Not done
- The cut plan draws derived cuts in the normal cut colour but has no link marker on hover.
- A polygon drawn with the polygon tool shows its count once closed (the drag preview is for rectangles, rounded rectangles and circles).

## Milestone 13 — Corrugated locks ✅

Implemented
- Through tabs on tab-and-slot joints (`Connection.tabLen: 'flush' | 'through'`, `lockDepth`, default max(4 mm, 1.5t)): a through tab passes the receiver and reaches `lockDepth` past its far face, with a score across the tab where it leaves the slot, so it folds under and locks without glue. Works on edge-on-face seams (a wall on a base: the score is at the base's underside) and on corner tab-and-slot (the score is at the receiving wall's outer face). Slots are unchanged: the tab's volume inside the receiver, + c/2 all round — (t + c) × (w + c).
- Flute-aware minimum tab width: on corrugated, tabs are at least max(4 mm, 3t) wide; the tab count drops to fit (already used by corner tab-and-slot since milestone 8).
- Interface: the joint card (Joints, advanced) for tab-and-slot has *Tabs: Flush / Through, fold under*, the fold-under length, and the minimum-width note on corrugated; a tray with tab-and-slot corners has the same switch on its card for all its corners (and corners it makes later).

Verified
- `tests/locks.test.ts`: a **corr-4 tray with through tabs**: four tab-and-slot corners whose slots are exactly (t + c) × (w + c), and the exported file has every one of them; tabs protrude by the lock depth (6 mm), one score per tab on the owner's edge line (the receiver's far face) as long as the tab, the outline really reaches 6 mm past the edge, clean export check; corrugated tabs at least 12 mm wide even when 20 tabs are asked for; a corrugated wall on a base with through tabs (score at the underside, slot t + c across, no overlap).
- `tests/e2e/trays.spec.ts`: the tray card's *Through* switch sets every corner and the joint card shows the fold-under length.
- `npm test` 169 passed.

Not done
- The 3D view draws through tabs straight (as cut), not folded under.

## Milestone 14 — Fold-over reinforcement ✅

Implemented
- `Panel.foldOvers[]` (`src/model/foldover.ts`), an edge feature on a card or corrugated wall's free edge: `{ edge, depth (null = down to the base, or a partial hem), lock: 'glue' | 'tabs', locks, lockDepth }`. Its geometry is drawn in the wall's own flat coordinates, so the net needs no change: a rim strip 2t + fa with a score at each edge; the liner (h − t, or the hem depth), shortened by t at each end where a neighbouring wall meets it and by 2t where that neighbour also has a fold-over; lock tabs (trapezoids tapered 18% of their width, width clamp(0.16L, max(4, 3t), max(14, 6t)), two at 0.3L/0.7L when they fit, else one; reach t + max(4, 1.5t)) with a score at each root.
- Lock slots in the base: each tab's volume inside the base projected and grown by c/2 (clearance once, CutForge's rule), set back so at least the minimum web stays to the base edge.
- The wall's cut holes continue through the liner where they overlap it, aligned by the fold; engrave and score shapes stay on the outer wall.
- 3D: the liner on the wall's inner face, a rounded rim along the folded edge, the tabs through the base (straight); the fold slider swings the liner and tabs out to the flat net pose.
- Card: *Fold-over (double wall)* on a wall's card — add (top edge), liner down to the base / partial hem, glue / lock tabs, tab count and length, remove. Default lock: tabs on corrugated, glue on card. Not offered on plywood.
- Validation: wall height ≤ 2t, hem > 0.45h, lock tabs on a hem, lock depth > 0.6h, edge < 2c + 2 mm + 2 × tab width, clearance < 0.75t (advice), liners meeting at a corner, and on 4 mm board a fold score running across the flutes (also shown on the fold-over card). Slot webs are checked by the existing slot check.

Verified
- `tests/foldover.test.ts`: offered on card/corrugated free edges only (tabs default on corrugated, glue on card); a **corr-1.6 tray with fold-over and lock tabs on all walls makes one net**, rim 2t + fa, liner h − t, lock depth t + 4, two tabs, 2 + 2 scores per wall, export check clean apart from the clearance advice; **liners shortened 2t at both ends where both walls fold over** (t where only one does), no liner collision; **every slot keeps at least the minimum web**; **a handle hole on a reinforced wall also cuts the liner**, at the folded-back position; validation of a low wall, a deep hem, tabs on a hem, and flute direction on 4 mm board.
- `tests/e2e/foldover.spec.ts`: add from the wall card, lock tabs and tab length shown, partial hem switches to glue, unfold with the fold slider, one net in the cut plan, remove. Screenshots `docs/polygon-shots/*-13..15-*` (folded, unfolding, net).
- `npm test` 175 passed.

## Final verification — polygons, cuts and corrugated (milestones 7–14) ✅

Acceptance checks (`polygons-and-corrugated-agent-prompt.md` §8) and where each is verified:

1. **Rectangle safety** — every pre-existing unit test and Playwright spec passes; golden SVG/DXF of both templates in every material and five hand-built designs are byte-identical, and five saved v5 project files migrate to byte-identical exports (`tests/golden.test.ts`). The one intended golden change is `hand-corr-dividers` (corrugated corners now default to tab-and-slot, milestone 8).
2. **Polygons** — click-drawn base with a typed 120 mm segment and a Shift-locked 15° segment, extruded (`tests/e2e/flow.spec.ts`); an 8-gon and a hexagon n-gon (`polygon.spec.ts`, `trays.spec.ts`); vertex move re-angles walls and re-lays joints, insert splits a wall with shapes going to the half with their centre (`polygon.test.ts`, `outline.test.ts`, `trays.test.ts`).
3. **Shapes** — hole vs notch, Add joins, Cuts win whatever the order, notches re-lay fingers or flag too little contact (`outline.test.ts`, `shapes.spec.ts`).
4. **Through-cuts** — the front-wall chamfer cuts the front and back walls and trims the left wall's top; joints re-lay; moving the source updates every panel; deleting restores every panel (`through.test.ts`, `through.spec.ts`).
5. **Fragments** — *(1/2)*, *(2/2)* pieces with a warning (own cuts and through-cuts); a fully removed panel is flagged, ghosted and restored (`outline.test.ts`, `through.test.ts`).
6. **Hinge on polygon edges** — zones and side-wall offers on polygon and sloped edges; red only for lying on the parent and below the floor (`edges.test.ts`, `walls.test.ts`).
7. **Corrugated** — tab-and-slot corners at 120° with through tabs and fold-over: clearance applied once, slot webs at least `minWeb`, and an independent reader (ezdxf, svgpathtools) confirms every closed cut and every score in the export; save/reload gives the same SVG (`acceptance.test.ts`, `locks.test.ts`, `foldover.test.ts`).
8. **Interface** — every new string in `en.ts` and `he.ts` (`i18n.test.ts`); Hebrew screenshots of each new widget in `docs/polygon-shots/he-*`; new controls have testids; new joint details (tab length, fold-under length, angle gap) are in *Joints (advanced)*; the stage still renders on demand (no new per-frame work).

The brief's end-to-end flow (§14) runs in `tests/e2e/flow.spec.ts`: draw a polygon base, extrude, push-pull the height on the stage, cut through a corner (live count), see the bevel warning in the export check, then autosave, reload and download the identical SVG.

Fixed during the final pass
- **Autosave missed drag edits** (pre-existing): a drag (push-pull, drawing a shape, moving a vertex) ends its transaction without a new design object, so the autosave waited for the next edit; it now saves on commit.
- The inspector card could cover the stage's bottom-right buttons when tall (tray card); it now stops above them and scrolls.
- Sloped walls with fold-overs (or other additions) are joined to their additions in their own exact coordinates before being turned into the net, so no hairline gaps split the net.

Commands run (all passing): `npm run typecheck` (app and Worker), `npm test` (178 tests in 22 files, including the Worker API tests and the ezdxf/svgpathtools reader checks), `npm run build`, and the full Playwright suite `npx playwright test` (23 passed, 12 screenshot-only specs skipped unless `SHOTS=1`), with `PW_CHROMIUM_PATH` pointing at the pre-installed headless shell.

Remaining limitations (polygons, cuts and corrugated)
- Arcs are not refitted after booleans: a curved shape that crosses an outline (or a through-cut region) exports as short straight segments. (Since milestone 62, circular arcs are given back at export; see there.)
- Through-cuts go through the whole design; there is no per-cut depth.
- Fold scores are plain SCORE lines: no crush-score style for 4 mm board.
- The packer does not turn pieces for flute direction; fold-over scores across the flutes are only warned about.
- Inside corners that are not square are closed by an approximate reach (`t / sin` of the turn); a crease between two tray walls is not offered (it would need nets that fold across closing seams).
- Through tabs and fold-over lock tabs are drawn straight in 3D (not folded under).
- The cut plan has no hover link marker for derived through-cuts, and the polygon tool's count badge appears once the polygon is closed.
- Digital checks are not physical proof: fold-over and lock fits need a test cut on the classroom's board.

## Milestone 15 — Grow pill and fold slider ✅

Implemented
- **Edge hit targets leave room for the push-pull arrows** (`src/views/edgeGaps.ts`, `EdgeHandle` in `View3D.tsx`). An edge's invisible grow target is split into up to four pieces, re-measured every rendered frame, with a gap of 22 px each side of the edge's midpoint (the arrow's 14 px grab sphere plus a margin) and of any push-pull anchor lying on the edge (a gable's apex). Pieces shorter than 12 px on screen are dropped: on a short edge the arrow wins, and *Grow from* on the card still works.
- **The *+ Grow* pill follows the pointer** along the edge, kept on the parts of the edge that can be grown from (never in a gap); it keeps `pointer-events: none`.
- **Push-pull arrows always win:** their meshes report their hits as nearest (`priorityRaycast`), so even where a target overlaps them on screen the arrow takes the drag.
- **Arrows on the real outline:** the width arrow sits on the outline's right side at half height and the height arrow on its top at half width — a gable's apex instead of a point inside the wall. On rectangles nothing moves.
- **Fold slider on the stage:** one bar at the bottom centre (above the hint, clear of the bottom-right dock and the view cube), shown while the design has a net of two or more panels; removed from View settings and from the panel card. On stages narrower than 900 px it moves to the left and above the card dock. `fold-slider` / `fold-play` / `fold-range` testids are kept.

Verified
- `tests/handles.test.ts`: on a plain wall, a gable wall (at two zooms) and every wall of a plywood hexagon tray, no hit piece comes within the gap of either push-pull anchor or the edge midpoint, and the pill position is always outside every gap; a short edge seen from far away has no hit target.
- `tests/e2e/refine.spec.ts`: hovering a wall's right and top edges at seven points each, the pill never shows inside the midpoint gap (and does show away from it); dragging `pp-width` and `pp-height` from those midpoints resizes the wall with the panel still selected and nothing grown. Reproduced first: with the old `EdgeHandle` the same drag selected the edge. The fold slider shows on the stage for a card tray and a corrugated tray (and folds/unfolds), not for plywood, and never in View settings or the panel card.
- Screenshots: `docs/refine-shots/{en,he}-15-grow-pill-and-fold-bar.png`.

## Milestone 16 — Reliable auto-connection ✅

Reproduced first: `tests/autoseam.test.ts` builds 500 seeded random designs in six families (boxes, trays, dividers, leaning panels, notched walls, dragged floor panels; plywood, card and both corrugated boards), runs `solve` + `autoConnect` after every edit as the editor does, and checks with an independent sampler (`slabContacts` in `tests/solid.ts`: both faces and every side face of each nominal slab against every other slab) that **every pair whose slabs touch or overlap has a connection or an export-check message naming both**. Against the milestone-15 code 58 seeds failed; they are kept as fixed cases (`FIXED`).

Real causes the fuzz test found
- **Contacts no joint can use were silent** (54 seeds, all dragged floor panels): two bases side by side in one plane (touching or overlapping), walls of two boxes face to face (or overlapping), and grazes where only two panel ends meet over a t × t patch. There is no joint for these; they now get a message with the reason.
- **Dividers placed into each other were silent** (3 corrugated seeds): two parallel dividers overlapping or face to face. Now *panels collide* / *face to face*.
- **A crash** (1 seed, card tray with an opened side): `polygon-clipping` threw while merging a net, so the export check itself failed. `src/geom/clip.ts` retries such unions/differences on a coarser grid (and finally one polygon at a time); the first attempt is the plain call, so every result that worked before is unchanged.

The brief's four causes, each confirmed with a test that fails on the old seam code and passes now (`milestone 16: causes of missed joints`)
1. **Only touching counted** → an edge lying anywhere inside the other panel's slab (an overlap of up to t) is joined at the contact: `faceFit(…, inside)` seats the joint at the edge's actual depth (gaps cut back to the receiver's near face, tabs to its far face). Test: a front wall typed 0.5–3 mm into a lid is joined, with no overlap (volumetric check).
2. **One seam per pair** → `seamsBetween` returns every distinct place two panels meet; a seam is identified by both edge keys (`seamKey`), and two candidates are the same seam only if they use the same two edges or touch in the same place (contact segments within 2t). `findOpenSeams` drops only seams an existing connection already covers; pairs joined by a grown connection are still joined by it alone; `noAutoSeams` stays keyed by pair. Test: a lid on a wall with a notched top meets it along two edges and gets two joints.
3. **Angled faces skipped** → closing seams look for edge-on-face contacts at any angle from 30° to 150° (`faceFit(…, angled)`), and their geometry is laid out with the angled fit. Test: a panel leaning back at 45° with its top edge on the back wall gets a tab joint there.
4. **Non-convex receivers** → `clipToOutline` returns every run of the owner edge on the receiver's outline, and the joint is laid out on each (`FaceFit.runs`). Test: a divider end meeting a wall with a slot cut in from its end has tabs below and above the slot.

Messages (`src/model/contact.ts`, `contactIssues` in `validate.ts`)
- Pairs that touch or overlap with no joint are found by sampling each panel's side faces (every 1.5 mm, three depths) and both faces (2.5 mm grid) against the other slab; contacts under 1.5 mm long (a corner grazing a face) are left out. Only unjoined pairs are sampled (about 1 ms for a 15-panel organiser), and results are cached by geometry.
- *Panels X and Y run into each other* (`val.collide`) when one is inside the other and no joint fits; *X and Y touch but are not joined* with a reason: side by side in one plane, face to face, unjoined by hand, meeting at under 30°, meeting over only ~N mm, or no joint fits.
- Joint messages carry both panels (`Issue.pair`); clicking one selects both (`Selection.also`), shown selected in 3D and on the cut plan.

Verified
- `npm test`: 244 tests, including the 500-seed fuzz test (~25 s), the 58 fixed seeds and the four cause tests. **Every golden SVG/DXF export is byte-identical** (no intended changes), and every pre-existing seam test passes unchanged.
- Playwright: `refine.spec.ts` — two dividers placed into each other: the export check shows *run into each other*, clicking it selects both, and the Hebrew message shows. Full app suite passes.
- Fixed a pre-existing flaky check in `through.spec.ts` (it also failed under load on the starting commit): the linked-selection click is re-projected and retried until it lands.

## Milestone 17 — Move and rotate gizmo (schema v7) ✅

Implemented
- **Schema v7.** `Detail.rot` (degrees, counter-clockwise about the shape's centre; missing = 0) and floor-panel yaw, kept in the floor panel's own frame (`u` and `v` turned about world Y), so there is one authority and everything grown on it follows through `solve`. The v6 → v7 migration has nothing to convert: v6 has no turned shapes and every v6 floor panel's frame is unturned.
- **Turned geometry** (layer 2): `shapeContours` turns a shape's contours about its centre as a rigid transform, so a rounded rectangle keeps true arcs (SVG `A`, DXF bulges); circles are left untouched (their export does not change at all). Array copies turn as a group about the array's centre. `detailBBox` and the snap targets use the turned corners (edge midpoints, centre); align and distribute use the turned bounds; the export check measures turned shapes as polygons.
- **Operations:** `rotateDetails` (about the shapes' centre, or each shape's own when one), `rotatePanel` / `setPanelYaw` / `panelYaw` for floor panels (about the panel's centre).
- **Gizmo** (`Gizmo` in `src/views/widgets.tsx`), screen-sized and drawn on top: a centre pad (free move in the plane), two axis arrows, and a ring. Rotation snaps to 15°, Shift gives 1°, Alt turns snapping off. While dragging, the angle or offset shows next to it, and digits typed then Enter apply an exact value. Escape cancels; each drag is one undo step.
  - **Shapes:** shown for selected shapes on one panel, in that panel's plane; moves use the existing smart snap. Dragging an unselected shape still moves it as before.
  - **Floor panels:** shown for a selected floor panel, on its top face; it moves on the floor and turns about the vertical with everything grown on it (trays and template boxes turn as one assembly). Grown panels keep the hinge dial and never show it.
- **Floor-panel moves snap** to other floor panels' corners (corner to corner) and edges (up to two edge lines combined), both for the gizmo and for dragging the panel itself; Alt turns it off, and the 1 mm grid is used otherwise (`snapFloor` in `src/model/snap.ts`).
- **Cut plan and face-on view:** a rotation ring around the selected shapes (15° / Shift 1° / Alt free). A turned shape's resize handles sit on its turned corners and resize along its own sides.
- **Card fields:** *Rotation* for shapes (not circles) and floor panels (`detail-rot`, `panel-yaw`).
- **Templates:** a turned template box keeps its turn when its settings change (regeneration copies the floor panel's whole frame).

Verified
- `tests/golden.test.ts`: five **v6 project fixtures** (polygon tray with a through-cut, corrugated fold-over with through tabs, card gable with a roof, the hand-built plywood box, the organiser with a lid), saved by the v6 code with the exports it made, load into v7 and export **byte-identical SVG and DXF**; every older golden is unchanged.
- `tests/rotate.test.ts`: a rectangle cut turned 30° has the turned corners (and snapping finds them); **read back with ezdxf and svgpathtools, the hole's DXF and SVG vertices are the turned corners**; a turned rounded rectangle keeps four arcs (DXF bulges tan 22.5°, SVG arcs r = 5) with its sides at 25°; an array turns as a group; a circle's export is unchanged by rotation; rotation survives save/reload with the same SVG; **a plywood box turned 45° exports the same pieces (to 1e-6 mm), keeps every joint (none broken), has no overlapping material and a clean export check**; yaw set and set back restores the frame; a turned template base keeps its yaw through regeneration; floor-panel snapping (edge, corner, nothing near).
- `tests/e2e/refine.spec.ts`: **turning a shape with the gizmo ring gives 30° from a 32° drag and +17° with Shift**; one undo step per turn; typing 45 + Enter while dragging; the card's rotation field; a floor panel turned 30° from its card with no broken joint; in the face-on view the ring turns a shape 45° and a turned shape resizes along its own sides.
- Screenshots: `docs/refine-shots/{en,he}-17-shape-gizmo.png`, `…-17-floor-gizmo.png`.

## Milestone 18 — Dividers ✅

Implemented
- **Divider sets** (`Design.dividerSets`, `src/model/dividers.ts`): *Across* and *Along* counts, a height, and *even* or *by compartment size* spacing in the base's rectangular clear inside (between the walls' inner faces). Reconciled in `solve` like tray walls: members have stable ids `<set>/a<n>` / `<set>/l<n>`, and only their offsets and heights are written, so changing a count, the box size or the walls re-spaces them; their joints are the ordinary ones (plywood tabs into base and wall slots, card/corrugated slide fits with no wall slots, half-laps where they cross). By size: compartments of that size while the last keeps at least 5 mm (it takes the rest). Counts of 0 and 0 remove the set and its dividers.
- **The divider card** (*Add a divider*) now starts with *Automatic dividers* (`div-across`, `div-along`, `div-set-height`, `div-mode-even` / `div-mode-size`, `div-size`, `div-set-count`, `div-respace`); the single-divider controls stay below it under *One divider* with their testids. On a base whose inside is not a rectangle the card says to drag or use *Divider between*.
- **Drag:** a selected divider (a panel standing at 90° some way in from its parent's edge) shows an amber slide arrow on its face (`div-slide`) along its normal. It snaps to equal compartments on both sides, to even spacing of the whole row, and to a neighbouring compartment's width (Alt: 1 mm steps). The compartment sizes along its row are shown above the dividers (`div-comp-<i>`); the two next to the selected divider can be typed. Dragging a set member takes it out of the set (it is renamed and keeps its place, the members after it move down one and the set re-spaces); *Space evenly again* brings dragged dividers back.
- **Divider between two faces:** Shift-click a wall face, then the face opposite (picked faces are kept in the store, not the design; the hint says what to do). At the second click a *Divider between* pill (`div-between`) makes a divider square to both faces from the base edge that runs that way, centred on the second click, as tall as the lower wall minus 5 mm; auto-connection joins both ends. Faces that are not parallel within 1°, do not face each other, or do not stand on the same base grey the pill with the reason (`div-between-why`). Escape or a plain click clears the pick.

Verified
- `tests/dividers.test.ts`: **a 2 × 3 set in a plywood box** — even compartments, 6 half-laps, no broken joint, a clean export check and **no overlapping material (volumetric)**, saved and reloaded; **changing the box width re-spaces it**, changing a count re-spaces it; by-size spacing; **dragging one divider out of the set** (it keeps its offset and is listed as loose) **re-spaces the rest**, and *Space evenly again* brings it back; **card, corrugated 1.6 and 4 mm**: slide fits to the walls, no wall slots from the dividers, half-laps; **between two faces** in plywood, card and corrugated: one joint at each end, the divider's mid-plane through the second click; refusals (not parallel, not facing, another base); emptying a set; the drag snapping rules.
- `tests/e2e/refine.spec.ts` (plywood and corrugated 4 mm): set 2 across and 1 along from the card; drag a divider with its slide arrow — it leaves the set and the selection follows it; compartment sizes shown; *Space evenly again*; Shift-click two opposite inner wall faces and press *Divider between* — joined at both ends (tab-and-slot in plywood, slide in corrugated); a left wall and the front wall grey the pill with the reason; Escape clears it; no joint messages in the export check.
- Found and fixed while testing: emptying a set left its dividers behind as ordinary dividers.
- Screenshots: `docs/refine-shots/{en,he}-18-divider-set-card.png`, `…-18-divider-slide.png`, `…-18-between-refused.png`.

## Milestone 19 — Adaptive grow ✅

Implemented (`src/model/adapt.ts`, `src/views/ghost.ts`, `GrowGhost` in `View3D.tsx`, the grow card)
- **Partial width:** `Connection.span = [s0, s1]` (mm along the parent edge from its start; absent = the whole edge, so older projects are unchanged; tray walls ignore it). The child's frame moves s0 along the edge and its width is s1 − s0; finger and tab joints come from the actual edge overlap, so they lie only over the span. Folded nets, fold strips and grown glue flaps start at s0. Several panels can stand on one edge as long as their spans do not overlap: an edge is offered for growing while a free stretch of at least 5 mm is left (`edgeFreeSpans`, `edgeHasRoom`), and the ghost takes the largest free stretch by default. On the stage the ghost has two end handles (`ghost-span-0/1`) that slide along the edge and snap to its ends and middle, to the ends of panels already grown there, and to where other panels meet the edge line; the card has *Starts at* / *Ends at* (`grow-span-start`, `grow-span-end`).
- **Height and angle snapping:** dragging the ghost's height arrow snaps its free edge to another panel's corners lying in its plane (a neighbouring wall's top) and to faces crossing its growth direction (the opposite wall's outer face for a lid), with a guide line along the snapped edge; the hinge dial snaps (within 3°) to angles at which the free edge rests on another panel's corner. Alt turns both off.
- **Adapting to what it meets** (*Adapt to neighbours*, `grow-adapt`, on by default): the ghost's top is brought down, column by column, to the near face of any panel it would run into (whichever of the ghost's two faces meets it first), within that panel's outline; panels it starts against (its parent and the panels beside it) are left out, and the end columns carry the trimmed line on. A panel its top edge meets at an outer corner is left to the corner joint (a lid reaching the opposite wall). The result is simplified and stored at commit as ordinary wall corners and inserts (`grow-adapted` note on the card). It is not re-derived afterwards, so it cannot cycle with the panels it was trimmed against; auto-connection then joins the trimmed edges.
- **Edit outline on the ghost** (`grow-edit-outline`): the ghost's top corners can be dragged and points added and dragged on its free edges before committing (starting from the adaptive trim); the edits are committed as the panel's outline.
- The ghost's height arrow sits on its trimmed outline.

Verified
- `tests/adapt.test.ts`: **a half-width plywood wall has fingers only over its span, no overlap (volumetric)**; a second wall takes the other half and a third is refused; a card wall on part of an edge folds out at its place in the net; span snap targets; **a lid ghost from the back wall has the front wall's outer face (80 mm) among its height targets, and grown at that height it is joined to the front wall at a corner**; a new wall's height snaps to its neighbour's top; **a wall grown under a sloped roof gets a gable (lower at the front) that is joined to the roof automatically, with no overlap and no joint messages**; with nothing in the way (or adapting off) the wall stays a rectangle.
- `tests/e2e/refine.spec.ts`: dragging a lid ghost's height arrow to 79.2 mm snaps to 80 and the lid is joined to the front wall; dragging a ghost's end handle to the middle snaps the span to [0, 60], the wall is 60 wide with fingers only there, and the rest of the edge is offered next; a side wall under a roof is trimmed (*Trimmed to fit* note) into a gable joined to the roof; *Adapt to neighbours* off gives the plain rectangle; *Edit outline* on the ghost and dragging its top-left corner commits that outline.
- Screenshots: `docs/refine-shots/{en,he}-19-adapted-gable-ghost.png`, `…-19-span-and-outline.png`.

## Milestone 20 — Through-cut editing and snapping ✅

What worked before: on its source panel a through-cut could be moved by dragging (3D and 2D) and resized with the cut plan's handles or the card; on the panels it reaches it could only be clicked to select the source (`ThroughLinks`). Polygon shapes have no vertex editing anywhere (only their box is resized), so that is still the case on reached panels.

Implemented
- **Editing from any panel a through-cut reaches** (`ThroughEdit` in `View3D.tsx`): with a through-cut selected, its (turned) corners are shown on its own panel and on every panel it reaches that is not edge-on, mapped along the cut direction; dragging one resizes the source about the opposite corner, along its own sides. On each reached panel a gizmo (pad, arrows, ring) moves and turns the source. Every edit changes the one live source shape.
- **Snap targets from the real outline:** `snapContext` takes the panel's own outline (vertices and edge midpoints of `panelEdges`, e.g. a gable's apex or a polygon base's corners) and its centre; on a rectangle these are the same nine targets as before, so every existing snap test passes unchanged.
- **Through-cut snapping:** while a through-cut is moved or resized, the outlines (vertices, edge midpoints) and shapes (corners, centres) of every panel in its path are added as targets, projected along the cut direction into its own plane (`throughTargets`).
- **Live count while drawing a polygon through-cut:** the *Cuts N panels* badge updates as vertices are placed (it was only shown after closing).

Verified
- `tests/throughedit.test.ts`: **a shape on a gable wall snaps to its apex**; a rectangle's targets are exactly the old nine; **a through-cut's corner snaps to the top edge of a divider it passes through** (and a plain cut on the same wall does not see the divider).
- `tests/e2e/refine.spec.ts`: **a through-cut seen on the back wall is resized there** (dragging its corner on the back wall, the opposite corner stays) **and turned there** (the back wall's gizmo ring: 32° → 30°), both changing the source on the front wall; the polygon tool shows *Cuts N panels* before the polygon is closed.
- Screenshots: `docs/refine-shots/{en,he}-20-through-cut-edit.png`.

## Final verification — interaction refinements (milestones 15–20) ✅

Acceptance checks (`interaction-refinements-agent-prompt.md` §8):
1. **Safety** — every pre-existing Vitest test and Playwright spec passes. All golden SVG/DXF exports, the v5 project fixtures and the new v6 fixtures are byte-identical; there were no intended changes to golden files.
2. **Handles** — `tests/handles.test.ts` (plain, gable and tray walls: no grow target within the gap of a push-pull anchor); push-pull wins over grow (`refine.spec.ts`, milestone 15). Other new handles (gizmo, divider slide arrow, span ends) are placed clear of the arrows and win raycast ties like them.
3. **Seams** — the fuzz test passes 500 seeds (and the 58 seeds that failed before); no touching pair is left without a joint or a message.
4. **Gizmo** — shapes and floor panels move and rotate with snapping; rotation survives save/reload and the export matches (`rotate.test.ts`, `refine.spec.ts`).
5. **Dividers** — automatic, dragged and between-faces dividers in plywood, card and corrugated, with no overlap and a clean export check (`dividers.test.ts`, `refine.spec.ts` for plywood and corrugated 4 mm).
6. **Grow** — height and angle snapping, partial width, adaptive trims; the result is joined (`adapt.test.ts`, `refine.spec.ts`).
7. **Through-cuts** — edited from any panel they reach, with snap targets from those panels (`throughedit.test.ts`, `refine.spec.ts`).
8. **Interface** — every new string is in `en.ts` and `he.ts` (`i18n.test.ts`, including the hard-coded-text scan); Hebrew screenshots of each new widget in `docs/refine-shots/he-*`; new controls have testids; the fold slider is on the stage whenever there is a fold; nothing new renders continuously (the canvas still renders on demand; the new widgets only work while dragging).

Commands run (all passing): `npm run typecheck` (app and Worker), `npm test` (281 tests in 28 files, with the ezdxf/svgpathtools reader checks), `npm run build`, and the full Playwright suite `npx playwright test` (34 passed, including the classroom spec against the real Worker via `wrangler dev`; 22 screenshot-only specs skipped unless `SHOTS=1`), with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

Fixed along the way (not in the brief): a `polygon-clipping` crash when merging some nets (found by the fuzz test); emptying a divider set left its dividers behind; a flaky linked-selection click in `through.spec.ts` that also failed on the starting commit.

Remaining limitations (milestones 15–20)
- Collisions are flagged, not resolved; panels side by side in one plane (two half-width walls on one edge, two floor panels pushed together) are reported as touching but not joined, since no joint fits there.
- Through-cuts: corner handles and the gizmo are not shown on panels the cut meets edge-on (the strips); polygon shapes have no vertex editing (on any panel); snapping to the panels in a cut's path aligns x/y in the source plane (it does not slide along an oblique edge).
- *Divider between* needs a base edge that runs along the faces' normal, so it cannot be used between a regular hexagon's opposite walls (greyed with that reason). Automatic dividers need a rectangular inside; lowering a count removes the last dividers with any shapes on them.
- The adaptive trim samples the ghost's width in 96 columns, so where a partial obstacle ends the corner can be off by up to 1/96 of the width; trims are stored at commit and do not follow a neighbour that moves later (by design).
- Floor-panel snapping compares the floor panels' outlines, not the walls standing on them. The gizmo's typed values are relative to where the drag started.
- The fold slider moves to the left above the card on stages narrower than 900 px; that layout was checked only by CSS, not in a test.
- Digital checks are not physical proof: through-cut bevels, slide fits and adaptive joints need a test cut on the classroom's board.

## Milestone 21 — Gizmo drag stability ✅

Causes (as in `GIZMO_JOINTS_FLAPS.md` §3): the shape gizmo read the shapes' start positions and box from the live design, which already held the last preview, so each pointer move added the whole offset again; a group's turn pivot was the centre of the live (already turned) box; grazing views turned a pixel into tens of millimetres; the arrow shafts were 4 px targets. The floor gizmo and the through-cut gizmo already moved from the drag's base and were not affected by the first cause.

Implemented (`ShapeGizmo`, `FloorGizmo` in `src/views/View3D.tsx`; `Gizmo`, `grazingMap`, `useGrazing` in `src/views/widgets.tsx`)
- Every start value (shape positions, the box used for snapping, the turn pivot, the floor panel's centre) is read from the drag's base design (`txnBase`), frozen at pointer-down.
- A turn measures its screen angle about where the gizmo was at pointer-down, and the gizmo stays there until the turn ends.
- **Grazing views:** when the plane is within 20° of edge-on (pad) or an axis within 20° of the view direction (arrow), the drag moves by screen distance: one pixel is one pixel's worth of millimetres at the gizmo. The pad moves along the plane's in-screen direction as seen, and up the screen moves it away along the plane's depth direction; an arrow moves along its own screen direction (up = away when it points straight at the viewer).
- **Hit zones:** an invisible 16 px wide zone along each arrow, a 22 px pad, and a 13 px ball as the pad's hit zone so it can be grabbed edge-on (the pad wins where an end-on arrow overlaps it).
- A panel's dimension labels are hidden while its plane is seen within 20° of edge-on: they pile up on the panel there and covered the gizmo's pad.

Verified
- `tests/e2e/gizmo.spec.ts`: **dragging the pad (15, 10 mm) and each arrow (20 mm) in 1, 5 and 30 pointer moves lands on the same place** (and the other coordinate does not move on an arrow); **turning two shapes by 90° keeps the pivot** ((40, 35) → (60, 15), (80, 35) → (60, 55)); **a floor panel seen 5° above edge-on moves a few millimetres away for 12 px up the screen**, in 1, 5 and 30 moves.
- The milestone 17 and 20 gizmo specs (`refine.spec.ts`) pass unchanged.

## Milestone 22 — Glue flaps fold off their panel ✅

Implemented (`withFold` in `src/model/seams.ts`, `flapMatrix` in `src/views/foldView.ts`, `Flaps` in `View3D.tsx`)
- Each 3D flap (`Flap3d`, `src/model/types.ts`) also records its `owner` (the panel it is cut from), its `hinge` (two points in the owner's local coordinates) and its `angle` (degrees, from lying flat beside the owner to folded). All three kinds record it: corner glue flaps, glue flaps on edge-on-face seams, and grown glue flaps.
- The hinge and angle are solved from the flap as cut (the owner's added outline) and the flap as folded: the axis runs along the score line, and the pivot is the line about which the flat slab's base turns onto the folded slab's base. For a 90° fold that is half a thickness out from the fold and mid-thickness, as for folded nets.
- The view draws a flap with its owner's fold transform, turned about the hinge by −angle × (1 − foldT). At foldT = 1 it is exactly where it was drawn before; at 0 it lies flat beside its panel as in the cut net. Flaps take their owner's colour. Older stored geometry without an owner is drawn on the receiver as before.
- Divider renames carry the owner along.

Verified
- `tests/flaps.test.ts`: for tray corners (card), a wall glued at 60° (grown glue) and a divider glued to the walls (edge on face), **the folded pose is the old matrix exactly, and the flat pose matches the net's added outline through the owner's thickness (within 1e-6 mm)**; half folded, the hinge is carried by the owner's transform.
- `tests/e2e/gizmo.spec.ts`: on a corrugated tray with glue corners, the drawn flaps lie flat on the floor beside their own wall (not on the wall they glue to) at foldT = 0, stand against the receiving wall at 1, and have left the floor with their wall at 0.5.
- Exports are unchanged: the golden SVG/DXF tests pass. The new fields are in the stored joint geometry only, and that geometry is recomputed on solve.

## Milestone 23 — Design-wide joint kinds ✅

Implemented (`src/model/jointDefaults.ts`, `setAllJoints` / `setDefaultFlap` in `src/model/ops.ts`)
- `Design.joints?: { base?, corner?, flap? }`, optional: designs without it load, solve and export exactly as before, and save without the field.
- `setAllJoints(d, group, kind)` sets `kind` and `pref` on every joint of the group that may take it (including hand-set ones, which stay hand-set), sets trays' wall or corner kind where allowed, records the default and returns `{ changed, kept }`. `groupKinds` gives a group's list (kinds allowed for at least one of its joints) and `groupShown` its current value.
- New joints use the default where allowed: `connectSeam` (corners and edge-on-face seams, so automatic joins too), growing from an edge (`growKind`, and the remembered wish), dividers (`addDivider`, *Divider between*, divider sets: `dividerKind`), side walls, new trays (`newTrayKinds`, also on the extrude card and ghost). A tray's own corner and wall joint still wins for its seams. When a joint's own wish is not allowed, it falls back to the design's kind before the material's.
- `joints.flap` replaces the automatic glue flap width on joints without their own (`flapWidth`; the joint card shows it).
- Template regeneration (sizes, material) re-applies the design's choices.

Verified (`tests/jointdefaults.test.ts`)
- Lists: a plywood box offers fingers, tabs and slots, butt for both groups; an empty card design offers what a new joint could take; a card wall at 60° narrows the wall-to-base list to fold and glue.
- **A plywood box changed to tabs and slots wall to base: 4 changed, walls stand in, no overlap (volumetric), no messages**; a hand-set corner is changed too and stays hand-set; **a card wall at 70°/60° keeps its fold when tabs are chosen and is counted as kept**.
- New corners, grown walls, dividers (but not fingers on a face) and trays take the defaults; a tray's own corner kind wins and a later design-wide change reaches it.
- The design flap width replaces the automatic width, a joint's own width wins, *automatic* removes it; the defaults survive save and load, and a design without them saves no `joints`.

## Milestone 24 — Settings card when nothing is selected ✅

Implemented (`src/ui/DesignSettings.tsx`, `Inspector.tsx`; snapping in `src/store/store.ts`)
- With nothing selected, the card (*Design settings*) shows the template's sizes when there is a template, then:
  - **Joints**: *Wall to base* and *Corners* lists (`joints-base`, `joints-corner`); after a change a note says how many changed and how many kept theirs (`joints-<group>-result`). Card and corrugated also get the default glue flap width (`settings-flap`) with *Back to automatic*.
  - **Material and fit**: the material's name, thickness, kerf and clearance (`settings-thickness`, `-kerf`, `-clearance`), the same edit as the drawer (`useMaterialEdit`), and *Change material…* (`open-drawer`) opening the drawer.
  - **Snapping** (saved with the view options): smart snapping (`settings-snap`), grid step (`settings-grid`, 1 mm) and turn step (`settings-turn`, 15°). Smart snapping off is checked everywhere Alt was (`noSmartSnap`): 3D and cut-plan shape drags and drawing, the gizmo, floor panels, through-cut corners, the grow ghost and hinge rest angles. The grid step (`gridSnap`) and turn step (`snapAngle`) apply in the 3D view and the cut plan.
- Every new string is in `en.ts` and `he.ts`.

Verified (`tests/e2e/gizmo.spec.ts`)
- **On card, *Wall to base* → tabs and slots changes the three square walls and reports 3 kept (the wall at 70° and its two edge-on-face seams); one undo step restores them and the default.** The flap width default is set and reset.
- Clearance typed in the card is what the drawer shows; *Change material…* opens the drawer.
- With smart snapping off, a 5 mm grid and a 10° turn step, a shape dragged with the gizmo lands on the grid (not on the wall's centre line it would otherwise snap to) and a 34° ring drag turns it 30°; the preferences are stored per viewer.
- Screenshots: `docs/gizmo-shots/{en,he}-24-settings-card.png`, `…-22-flaps-half-folded.png`.

## Final verification — gizmo, joints, flaps and settings (milestones 21–24) ✅

Commands run (all passing): `npm run typecheck` (app and Worker), `npm test` (291 tests in 30 files; the ezdxf/svgpathtools reader checks are skipped here, since the Python packages are not installed), `npm run build`, and the full Playwright suite `npx playwright test` (39 passed, including the classroom spec against the real Worker; 22 screenshot-only specs skipped unless `SHOTS=1`), with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. Golden SVG/DXF exports and the v5/v6 fixtures are byte-identical.

Remaining limitations (milestones 21–24)
- At the 20° grazing threshold the gizmo's speed per pixel changes (about 2.9× slower just inside it than a plane hit just outside it).
- The gizmo ring in a grazing view still measures the screen angle about its centre, which is hard to use when the ring is seen edge-on.
- A design-wide kind that the current material does not allow (fingers after switching to card) is remembered but unused until the material allows it again; the list then shows the kind most joints have.
- The settings card is taller than a short stage and scrolls inside the card dock.
- Plans for the last three: `GIZMO_JOINTS_FLAPS.md` §4; done in milestones 25–27 (below).

## Follow-up — snapping toggles, add ghosts, outline snapping and curves ✅

Implemented
- **Separate snapping toggles** (`settings-snap`, `settings-grid-snap` in the settings card): smart snapping and grid snapping turn off independently (the grid step field is greyed while the grid is off); Alt turns off both for one drag (`gridSnap(x, ev)`, `noSmartSnap(ev)`), in the 3D view, the cut plan and outline editing.
- **Darker add ghosts:** the grow ghost and the extrude preview (`STAGE.ghost`, `ghostEdge`, `ghostOpacity` in `src/views/palette.ts`).
- **Outline point snapping** (`outlineTargets`, `snapOutlinePoint` in `src/model/snap.ts`; `placeVertex` in `src/views/polyTool.tsx`): base vertices, wall top corners and inserted points snap to corners, then edges, of the outline itself and of panels in or standing on its plane, then into line with its own points, then to the grid. A marker shows what it snapped to.
- **Auto-curve points** (`setPointCurve`, `curveBlocked`, `pointCurve` in `ops.ts`; `curveRing` in `edges.ts`): in outline editing, the selected point's card row (*Point: Corner / Curve*, `point-corner`, `point-curve-auto`) makes it a smooth curve; refused with a note (`point-curve-blocked`) while an edge beside it is joined. The "+" handles sit on the curve.

Verified
- `tests/curves.test.ts`: a base corner becomes a curve through it (its two edges flattened, the others unchanged, smooth through the point, the box holds the outline); curves are not growable or joined, the design validates and exports; a joined edge blocks a curve; a wall's top corner curve keeps the attached bottom straight; moving a curve point and save/load keep it; outline snapping to a neighbouring floor panel's corner, onto its edge and in line with its own point, never to itself; grid off and Alt give 0.01 mm values.
- `tests/e2e/gizmo.spec.ts`: on the grid with both toggles on, off it with Alt, and with the grid off while smart snapping still snaps to the wall's centre; dragging a base corner next to a neighbouring panel's corner lands on it exactly, and next to its edge lands on the edge; a selected point becomes a curve and back.
- Screenshots: `docs/gizmo-shots/{en,he}-25-snapping-toggles.png`, `…-25-curve-point.png`.

Remaining (follow-up)
- Curves are auto only: no handles to shape them yet (`curve` leaves room for `'bezier'`). Exports carry the flattened curve (segments within 0.02 mm), not true curves.
- An auto curve can bulge well past its points (e.g. a curve at a rectangle's corner pushes the next edge outward); there is no check that a curve crosses another edge of the outline.
- The grow ghost's outline handles (*Edit outline* on the ghost) do not snap to corners and edges yet.

## Milestone 25 — The gizmo ring seen edge-on ✅

Implemented (`Gizmo` in `src/views/widgets.tsx`, `src/views/grazing.ts`)
- When the ring's plane is within 20° of edge-on (`grazingRing`, the same threshold as the pad), a camera-facing ring of the same screen radius (64 px) replaces the flattened one, in a lighter amber, with the turn's axis drawn as a short line through the centre. Dragging around it measures the screen angle as before.
- Positive stays counter-clockwise seen from the normal's side: the sign is taken from the camera's side at pointer-down (exactly edge-on: the normal's side).
- **Dead zone:** pointer positions within 12 px of the centre (`RING_DEAD_PX`) hold the turn; when the pointer comes out, the turn carries on from there, so passing over the centre does not flip it by 180°. This applies in every view.
- Typed angles, Shift for 1° and Alt for free turning are unchanged.

Verified
- `tests/grazing.test.ts`: `grazingRing` is true within 20° of edge-on (0°, 5°, ±19.5°) and false at 25°, 60° and 90°, whatever the vectors' lengths or the normal's sign.
- `tests/e2e/gizmo.spec.ts`: with the camera 5° from a wall's plane, 32° around the screen-facing ring turns the shape 30°; a drag straight across the centre turns nothing, and 47° on from there gives 45°, not 225°.

## Milestone 26 — Joint choices per material ✅

Implemented (`src/model/jointDefaults.ts`, `setMaterial` / `applyJointChoices` in `ops.ts`, `regenerate` in `src/templates/registry.ts`, `src/ui/DesignSettings.tsx`)
- `Design.joints` is now one set of choices per material kind: `{ plywood?: { base?, corner?, flap? }, card?: {…}, corrugated?: {…} }`. `jointsOf(d)` reads the current material's; `setAllJoints` and `setDefaultFlap` write it (`patchJoints`); empty sets and an empty `joints` are removed, so a design without choices saves exactly as before.
- Older files with the flat form are read into the file's material slot (`normalizeJoints`, run by `solve`, so on load too). No schema bump.
- Changing the material kind (`setMaterial`, so the drawer, the class profile and the settings card; template regeneration too) re-applies the new material's stored choices to every joint. A switch to card and back to plywood restores the plywood choices exactly; card keeps its own.
- **The note:** when a group's list cannot show a choice, a note under it says why (`joints-<group>-inactive`):
  - another material's choice kept for later: *Finger joint does not work on card: these joints use Fold. Your choice comes back if you switch to plywood again.*
  - the current material's own choice fits none of its joints (angle or type): *Tabs and slots does not fit any of these joints (their angle or type): they use Fold.*

Verified
- `tests/jointdefaults.test.ts`: plywood corners set to tabs and slots, then card (plywood's choice kept, card on its own), card corners glue, back to plywood (tabs and slots again), back to card (glue again); the notes for another material's and the current material's choice; a flat-form file loads into its material's slot and applies; the organiser template keeps every material's choices through material changes. Existing tests now expect the per-material form.
- `tests/e2e/settings.spec.ts`: fingers on plywood corners, the drawer switched to card: the note names Finger joint, card, the kind in use and plywood; back to plywood, fingers are chosen again and the note is gone.

## Milestone 27 — A settings card that fits a short stage ✅

Implemented (`src/ui/DesignSettings.tsx`, `TemplateSection` in `src/ui/TemplateUI.tsx`, `ViewPrefs.sections` in `src/store/store.ts`)
- *Template*, *Joints*, *Material and fit* and *Snapping* are collapsible sections (`settings-head-<section>`), each closed header summing up what is set on a second line (`settings-sum-<section>`): *Organiser with dividers · 160 × 110 × 45 mm*, *Slide fit · Glue flap*, *Corrugated 1.6 mm · clearance 0.2*, *Smart · Grid 1 mm · 15°*.
- Which sections are open is saved per viewer with the view options (`viewPrefs.sections`) as soon as one is opened or closed.
- **Until then:** the template's sizes and *Joints* start open, and the others closed. *Joints* starts closed on a stage shorter than 700 px, or when the card would scroll with it open; this is checked when the stage changes size and for each new design or template, not when the content grows (it would close while being used).
- The long joints help became the short note's tooltip (*Changes every joint, also new ones.*), and the template note in the card is shortened the same way.

Verified (`tests/e2e/settings.spec.ts`, at 1366 × 768)
- A blank design: *Joints* open, the others closed, the card does not scroll, and the closed headers show the material and snapping summaries. Opening *Snapping*, changing a toggle and reloading keeps it open; the summary follows the setting.
- The organiser: its sizes open, *Joints* closed to make room; with the sizes closed the card does not scroll.
- The existing settings tests open the sections they use.

Remaining (milestones 25–27)
- A long template (the organiser's eight sizes) still makes the card scroll on a Chromebook while its sizes are open; its sizes were kept open by default because they are what a template is for.
- The flat-ring/proxy switch happens at 20°: moving the camera across it swaps the ring mid-view.

## Milestone 28 — Placed and construction panels (model) ✅

Implemented (`src/model/place.ts`; `addPlacedPanel`, `movePlaced`, `rotatePlaced`, `placedCentre`, `rehost`, `setConstruction` in `ops.ts`)
- `Panel.place?: { host, face, x, y, rot, pose, side? }`: on the floor (`host: null`, the floor's coordinates as floor panels: x along world X, y along world −Z) or a face of another panel (`face` 1: its material side, −1: its plane), flat (the panel's origin and its u axis turned by `rot` in the host's plane) or standing (its bottom line from (x, y) along `rot`, rising out of the face; `side` says which side of the line its material is on). Floor panels without `place` are unchanged (schema 8 needs no conversion).
- `solve` derives a placed panel's frame from its host's (`placeFrame`) in the same pass as grown frames (hosts first, so a panel can sit on a grown wall and panels can sit on placed panels); a cycle is refused (`placeCycle`). The fold view carries placed panels with their host.
- Moving, turning and `normalizeSketch` work in the host's plane for placed panels (`movePanel`/`rotatePanel` carry floor moves into it; `panelYaw` is the place's turn).
- Deleting a host drops the panels placed on it to the floor (`dropToFloor`): flat stays flat with its centre where it was seen from above, standing stays standing with its bottom line where it was; panels placed on *them* keep following them.
- Joints: a standing placed panel is an edge on a face (`connectSeams`, the design's *Wall to base* kind: tabs and slots on plywood); a flat one is not joined to its host and is not reported as touching it (`flatOnHost`, seams and contacts).
- `Panel.construction` on a net's root (`constructionSet`: grown panels inherit it): left out of seams and automatic joints, contacts, validation, through-cuts (neither cuts nor is cut), fold nets, pieces, packing, export and the cut plan; its own grown connections carry no joint. It stays a snap target, a host and a grow parent. `setConstruction` marks the net's root (removing its joints) or makes it real again (joining it).

Verified (`tests/placed.test.ts`)
- **A flat panel and a standing shelf on a wall keep their place on it when the base moves and turns and when the wall grows**; in the fold view they ride with it.
- **Deleting the host drops them to the floor in place**: flat on the floor with the same centre seen from above, standing on the floor on the same line; a panel placed on the dropped one keeps following it.
- **A standing panel on a plywood base gets tab-and-slot (slots in the base), its bottom on the face; a flat one makes no joint and the export check is clean** (three pieces).
- **A construction box is missing from pieces and export, makes no joints, is still a snap target; switched real it gets its four corners and six pieces.** A panel placed on a construction panel is real and not joined to it. Saving keeps `place` and `construction`; designs without them save neither.

## Milestone 29 — The Panel tool on faces, as a ghost ✅

Implemented (`src/views/panelTool.tsx`; `faceTargets`, `snapOnFace` in `snap.ts`; `PlacedGizmo` and the `ghost-draw` / `placed-move` drags in `View3D.tsx`; `src/ui/PlacedUI.tsx`; `setPlacedPose` in `ops.ts`; `panelGhost`, `panelPose`, `standHeight` in the store)
- With the Panel tool the face under the pointer is outlined (`FaceHover`; which face from the hit's depth in the slab, `faceAt`). Dragging on it, or on the floor, draws a ghost in that face's plane: a rectangle lying flat on it, or (Standing) a line with a wall standing on it at the last height used (40 mm the first time).
- Points snap (`faceTargets`): the host's corners, edge midpoints, centre and shapes; panels already lying on that face; and where each face of a panel standing on or through the face crosses it, so a partition drawn wall to wall ends exactly on both walls' inner faces. Alt or smart snapping off: the grid.
- After release the ghost waits: its corners (or line ends) can be dragged, W and H typed on the stage, a standing ghost's height pushed or typed and its material side flipped (`ghost-flip`). The ghost bar (`panel-ghost-bar`): Flat | Standing, Construction, ✓ (Enter), ✕ (Esc). ✓ makes it (a floor panel when flat on the floor, else a placed panel, joined as milestone 28 describes), selects it and returns to Select; choosing another tool or selecting something drops it.
- A selected placed panel's gizmo moves it in its host's plane (its footprint's corners snapping to the face's targets) and turns it about the host's normal; dragging the panel itself moves it in that plane. Its card says what it is on (*On panel 3, inner face*; top/underside on a floor panel), switches Flat/Standing, and every panel's card has *Construction* (its net becomes a guide).

Verified (`tests/e2e/boards.spec.ts`)
- **A flat panel drawn on a wall's inner face snaps to the wall's corner**: placed at (0, 20), 30 × 20, on face 1; it is selected, the card reads *inner face*, and the tool is back on Select.
- **A standing line drawn across a box from just inside one side wall to just inside the other lands on both walls' inner faces (x 3 and 77), the typed height is 25, ✓ joins it to the base and both walls with tabs and slots, each with slots.**
- Esc drops the ghost and leaves the design as it was. The older specs that draw panels press ✓ after drawing.

## Milestone 30 — One floating ✓ everywhere ✅

Implemented (`ConfirmBar`, `PendingBar`, `PendingBarHtml` in `panelTool.tsx`; `pending`, `beginPending`, `confirmPending`, `cancelPending` in the store; `doGrow`, `growOverlap`, `ownGrowKind` in `views/ghost.ts`)
- One floating bar (✓ / ✕, Enter / Esc, ignored while typing in a field) next to every ghost, in the look of the grow pill.
- **Grow**: the ghost carries the bar (`grow-ghost-bar`, its ✓ keeps the `grow-go` id); *Grow panel* left the card, which keeps angle, height, span, joint and adapt. A fold whose net would overlap when flat (milestone 35) turns the ghost amber, names the panels and offers *Cut it as its own piece* (`grow-own`: the wall-to-base kind if it is not a fold, else glue on card, tabs on corrugated).
- **Extrude**: the tray ghost carries the bar (`extrude-go`, `extrude-cancel`); *Add walls* left the card.
- **Shapes** (rectangle, rounded rectangle, circle, polygon after closing, text, imported SVG, and a polygon floor panel), in 3D, the face-on view and the cut plan: what the tool made waits for ✓ while its handles, sizes and Add/Cut/Engrave/Score can still change. ✓ keeps everything since it was made as **one undo step** and returns to Select; ✕, Esc, undo, another tool, selecting something else or starting another drawing take it away again (the design and history from before it). The grow joint now follows the parent board's material (`growKind`).

Verified (`tests/e2e/boards.spec.ts`)
- **A rectangle drawn, resized in its card, then ✓: one undo step more than before, Select on; undo removes it and redo brings it back. ✕, Esc and choosing another tool each leave the design as it was; a text placed and confirmed with Enter.**
- Grow is confirmed on the stage in one undo step and the card's button is gone; a rectangle drawn in the cut plan waits for ✓.
- The older specs (editing, flow, polygon, shapes, slice, templates, text and SVG, through-cuts, trays) press ✓ where they draw; the whole app suite passes (52 specs).

## Milestone 31 — Selecting and arranging boards ✅

Implemented (`src/model/arrange.ts`; `selectedPanelIds`, `panelSel`, `clickPanel` in the store; `GroupGizmo` in `View3D.tsx`; `src/ui/MultiPanel.tsx`)
- A panel selection holds every selected panel (`{ kind: 'panel', id, ids }`); Shift-click (or Ctrl, Cmd on a Mac) adds or removes a panel, in 3D and on the cut plan. It replaces the Shift-click face pick and the display-only `also` (an export-check message about two panels selects both).
- With several panels selected the card (`inspector-multi-panel`) aligns them (left, centre, right, top, middle, bottom) and distributes them (equal gaps or equal centre spacing, the outer two staying put) when they share a surface (`commonPlane`): floor panels, or panels placed on the same face (in its plane, by their footprints there). Otherwise the buttons are greyed with the reason (*These panels are not on the same surface*). The material list sets them all (milestone 36).
- Several parallel dividers grown from the same edge of one base get *Equal compartments* (`distributeDividers`) between their outermost neighbours (the walls' inner faces or the next dividers).
- The group gizmo (and dragging one of the group) moves several floor panels, or several panels placed on one face, together.

Verified
- `tests/arrange.test.ts`: floor panels distributed with equal gaps (the outer two in place), aligned on their tops and left edges; panels placed on one face aligned and spaced in its plane, a mix refused; three dividers in equal compartments between the walls.
- `tests/e2e/boards.spec.ts`: Shift-click three floor panels, distribute them, undo restores them; Shift-click takes one out again.

## Milestone 32 — Dividers, one manual way ✅

Implemented (`wallPicks`, `planDividerFor`, `addDividerFor` in `ops.ts`; `DividerButton` in `View3D.tsx`)
- With two walls selected (a divider counts as a wall) a floating **+ Divider** button (`add-divider`) sits between them. It reuses `planDividerBetween` with each wall's face towards the other, and puts the divider halfway along the stretch where the two walls overlap (not at a click); its height is the lower wall's top less `DIVIDER_GAP`, its ends are joined to both walls, and it crosses other dividers with half-laps. When no divider fits it is greyed with the reason (`add-divider-why`, the `div.why.*` texts).
- Selecting a wall shows *Shift-click the wall opposite to add a divider between them.* Dragging a divider (its arrow, snapping to equal compartments) and the clickable compartment sizes are as before.
- Removed: `DividerSet`, `reconcileDividerSets`, `setDividerSet`, `releaseDivider`, `respaceDividers`, `canDividerSet`, `dividerSetOf`, `memberOf`; the card's *Add a divider* section (automatic and *One divider*); the `facePick` state, its Shift-click and the *Divider between* pill; their strings. `addDivider` stays for the organiser template.
- Older files: the schema 8 migration drops `dividerSets`; every member stays where it is as an ordinary divider with its id and joints.

Verified
- `tests/dividers.test.ts`: in plywood, card and corrugated boxes, + Divider between the left and right walls is centred along them, below the lower wall's top, joined to both, with a clean check; walls that are not parallel are refused with the reason; **a v7 file with a 2 × 1 set keeps every member and exports the same file** after migration. The face-to-face divider and drag-snapping tests are kept.
- `tests/e2e/refine.spec.ts` (plywood and corrugated 4 mm): click a wall (the hint), Shift-click the opposite one, + Divider: centred and joined to both; dragged away and back it snaps to the equal-compartment position; a wall and a wall at right angles to it give a greyed button with the reason. `joints.spec.ts` makes its two crossing dividers with + Divider.

## Milestone 33 — Copy and paste shapes ✅

Implemented (`clipboard`, `copyShapes`, `pasteShapes`, `movePaste`, `pasting`, `pointerHit` in the store; Cmd/Ctrl+C and +V in `hooks.ts`)
- Cmd/Ctrl+C copies the selected shapes (their details with op, rotation, arrays and through-cut, laid out around their common centre). The clipboard is in the app, so it survives switching views but not a reload.
- Cmd/Ctrl+V pastes them onto the panel under the pointer (3D, the face-on view and the cut plan), centred there on the grid and snapped by the group's box to that panel's targets, as a ghost that follows the pointer (laid out again on the design from before the paste, so no history while it moves) until a click puts it down; then it waits for ✓ like any ghost (milestone 30): one undo step. With nothing under the pointer it goes on the last selected panel's centre. Shapes partly off the panel are kept, and the export check says so as usual.

Verified
- `tests/e2e/boards.spec.ts`: **two shapes copied from the base and pasted onto the back wall keep their layout and are centred on the wall** (the pointer a hair off its centre); one undo step removes the paste and leaves the originals.
- `tests/store.test.ts`: with nothing under the pointer the paste is centred on the last selected panel, keeps its layout and a through-cut; ✓ is one undo step; ✕ leaves the design as it was.

## Milestone 35 (engine) — Nets that lie flat ✅

Implemented (`src/model/flatnet.ts`; `netOverlaps`, `flatPanel`, `netFolds`, `cornerFoldXform` in `pieces.ts`; `Tray.flat`, `fixes`, `fixPlan`, `pin` in `types.ts`)
- `netOverlaps(d)`: every fold net flattened panel by panel (outline with joints, plus flaps, fold-over rim and liner) and intersected pair by pair; overlaps over 0.5 mm² with their area and region. The export check reports them (`val.netOverlap`, both panels selected when clicked); the cut plan draws the region in red on the piece, and the 3D view on the net's root plane while it is unfolded.
- `fixFlatNets` runs at the end of `solve` for trays on card and corrugated (`Tray.flat`, `auto` by default). For each overlap, largest first, the first fix that clears it is kept and the design is solved again:
  1. **trim**: a corner glue flap between the two walls is clipped along the other wall's side edge, 1 mm short of it, flat and folded alike; if its average width falls below the minimum flap (half the automatic width) the flap moves to the corner's other wall.
  2. **hinge**: the giving-way wall folds off its other neighbour across a convex corner (that corner becomes a fold, `Connection.hingeOf`; the wall is cut back by the corner, unfolds in line with the neighbour in the net, `cornerFoldXform`, with a fold strip and score) and is glued to the base along its bottom. Kept only when it then overlaps nothing (or the student pinned it). The fold view turns it with its neighbour.
  3. **own**: the wall leaves the net and joins the base with the design's wall-to-base kind for its material (glue on card, tabs and slots on corrugated when that kind is a fold).
- Which wall gives way: against the base, the wall; between walls, the shorter, or the later in the base's edge order. At an inside corner the giving-way wall is also the one that closes the corner (`fixPlan.extOn` moves the corner extension to it), so the other stays clear of the base. `Tray.pin` (the tray card's per-wall choice: automatic, fold off its neighbour, own piece, the other wall gives way) overrides.
- `fixes` and `fixPlan` are re-made on every solve (stable ids, so shapes stay on their wall); a tray wall's offset now follows its joint (`defaultOffset`), and the tab-and-slot offset keeps the slot web at the material's minimum after the slot grows by half the clearance (corrugated 1.6 tab-and-slot walls were 0.1 mm short of it before).
- `flatHeight` (`trayFlatInfo`): the tallest wall height at which the net lies flat in one piece (no wall cut as its own piece; trims and hinges keep it whole), by binary search in 0.5 mm steps on a copy of the base alone (kept per base, so a new height costs one solve); Infinity when any height does. The extrude ghost marks it on the walls (`flat-tick`), its arrow snaps to it within 2 mm, and walls that would be changed are drawn amber. The extrude and tray cards say what changes (`flat-own`: *Above 50 mm, wall 5 is cut as its own piece so the net lies flat.*, `flat-hinge`, `flat-trim`); the tray card offers *Lower to …* (`flat-lower`) and *Keep in one piece* (`flat-keep`, `Tray.flat = 'off'`), and back (`flat-auto`).

Verified
- `tests/flatnet.test.ts`: **rectangle, triangle, hexagon, octagon and L bases × card, corrugated 1.6 and 4 mm × 20, 40 and 80 mm walls all lie flat after `solve`** (`netOverlaps` empty, no joint broken, no `val.netOverlap`); **the L tray hinges its closing wall at 20 mm (one piece) and cuts it as its own piece at 80 mm (two pieces)** in all three materials; **the octagon's card flaps are trimmed and keep at least the minimum width**, flat and folded alike; hinged and separate walls overlap nothing in 3D, keep their shapes and pass the export check; in the fold view a hinged wall lies flat at foldT 0 and stands at 1; pins (own piece, the other wall gives way); *Keep in one piece* leaves the overlap and the export check reports it; convex bases have no flat height limit.
- `tests/e2e/boards.spec.ts`: extruding an L card base shows the hinge note and the flat-height tick; at 80 mm the note names the wall cut as its own piece and the height; after *Add walls*, *Lower to …* sets the tray to the flat height and the note goes.
- Golden SVG/DXF exports and fixtures are byte-identical.

Differences from the plan
- **The flat height of the L base is its notch less the hinged wall's glue flap** (50 mm on card, 46 mm on corrugated 1.6, for a 60 mm notch), not the notch itself: the flap along the hinged wall's bottom reaches the opposite wall first.
- **A hinged wall is glued to the base on corrugated too** (the plan had tabs and slots): tabs need the wall to stand in from the edge, which would take its side edge off the neighbour's and break the fold it hangs from.
- The grow ghost's overlap check (amber with *Cut it as its own piece*) came with the ghost bar (milestone 30).

## Milestone 35 (edge picking) — Growing on part of an edge ✅

Implemented (`startSpanPick` in `EdgeHandle`, `SpanPickLabel` in `View3D.tsx`; `spanPick` in the store; new targets in `spanTargets`, `adapt.ts`)
- A plain click on an edge grows on the whole free stretch, as before. **Cmd-drag (Mac) / Ctrl-drag (Windows) along a free edge** sets the start where the drag begins and the end where it is released, with the grow ghost following live; **two Cmd/Ctrl-clicks** do the same for trackpads. While the end is being placed a label shows its distances from both ends of the edge; typing a number and Enter sets it (mm from the edge's start); Esc cancels. Afterwards the span's end squares and *Starts at / Ends at* fields work as before, and ✓ grows it (milestone 30).
- Both points snap with smart snapping (Alt or snapping off: the grid). Besides the edge's ends and middle, the ends of free stretches and of panels already grown on it, and where other panels meet the edge line, the targets now include **the base's own shapes** (their corners and centres, seen across onto the edge), **equal thirds and quarters of each free stretch**, and **the mirror of a span on the opposite (parallel) edge**, so two partial walls can line up face to face.
- Only Cmd counts on a Mac (Ctrl-click is a right-click there). Cmd/Ctrl-click on a face stays multi-select (milestone 31); on an edge, whose hit target wins over the face, it picks a span.

Verified
- `tests/adapt.test.ts`: the front edge's targets include a base shape's corners and centre, a quarter and two thirds of the edge, and both ends of a partial wall on the back edge mirrored across.
- `tests/e2e/boards.spec.ts`: **Ctrl-drag along a base's front edge from near a third to near the middle shows the distance label, snaps to exactly [40, 60] of 120 mm, and ✓ grows the panel on that part.**

## Milestone 36 — A material for each board ✅

Implemented (`src/model/materials.ts`: `matOf`, `tOf`, `profileOf`, `pairFilter`, `connectionsForPair`, `materialsInUse`, `normalizeMaterials`; `setPanelMaterial`, `editMaterial` in `ops.ts`; `pairKinds`, `ownerMaterial` in `jointDefaults.ts`)
- `Panel.material?` (a profile id) and `Design.materials?` (the other profiles boards use). Absent: the working material (`Design.material`), so designs with one material load, solve and export exactly as before. Schema 8 (v7 files load unchanged).
- A grown board takes its parent's material (stored on the board when it is grown: tray walls, grown walls, dividers, side walls), so a box grown from a 6 mm base stays 6 mm when the working material changes. Boards drawn on the floor take the working material.
- Every place a board is involved reads that board's own material: frames and seating (the parent's thickness for where a child stands, the child's for its own slab), fingers (each side cut as deep as the other board, trims by its own), tabs and slots (slots as wide as the tab board plus the receiver's clearance, webs by the receiver's material, tab counts and lock depth by the tab board's), glue flaps (the owner's flap width and slab), half-laps (each slot as wide as the other board), slides, tray heights and inside-corner extensions, fold-overs, through-cuts, contacts, seams and their de-duplication, snapping, adapt and hinge targets, validation (web, sheet size, fold-over rules).
- Allowed kinds for a pair: fingers (and leaning plywood) need both boards in plywood, folds both in the same card or corrugated material (kind and thickness); the rest work across materials. A joint that no longer fits falls back to the design's choice for the feature-carrying board's material kind, keeping its wish (`pref`), so switching back restores it; a board leaving its net's material is cut as its own piece. The design-wide joint lists change the joints carried by boards of the working material's kind.
- Packing: each material on its own sheets (its size, grain), placements name their material (`mat`, absent for the working material) and count sheets per material; manual moves stay on the material's sheets. `sheetGroups` lists them. Export: `prepareExport` groups sheets by material (`materials`), each compensated with its own kerf; the export dialog downloads one file per material (`<name>-<material>-<mode>-kerf<k>mm.svg`), and one material keeps the old name. Teacher batches group by material too.
- UI: the board card's *Material* list (`board-material`: *Same as working*, materials in this design, built-in materials, *Custom…* with kind and thickness), a note listing the joints that changed kind (`board-mat-result`) and one when the board was cut from its fold net (`board-own-piece`); boards are drawn in their own material's colour, a shade darker per further thickness of the same kind (`boardColors`); a legend of materials with board counts by the view settings when more than one is used (`material-legend`, a chip selects those boards); the drawer lists every material in use with counts, kerf and clearance (`drawer-in-use`); the cut plan puts a heading over each material's sheets (`mat-heading-<id>`) and colours sheets by material; class submission lists boards in other materials than the class profile. Template regeneration keeps boards' own materials.

Verified
- `tests/boardmaterials.test.ts`: **a plywood box with one wall in 6 mm plywood: the base is cut 6 mm deep for that wall's fingers and the wall 3 mm deep for the base's; no joint broken, the export check is clean and no point lies in two boards (volumetric)**; a grown board takes its parent's material and keeps it when the working material changes, a new floor panel takes the working one; **a card tray with one wall in corrugated: the fold falls back (the wish is kept), the change is reported, the wall becomes its own piece, and switching back restores the fold and one net**; two materials pack onto separate sheets of each material's size and export as two groups; a design with one material exports byte-identically after switching a board away and back; save and load keep overrides; a v7 file loads unchanged.
- `tests/e2e/boards.spec.ts`: switching a wall to corrugated 4 mm in the card changes its colour and its slab depth (3 → 4 mm) in 3D, the legend appears, the cut plan shows a heading for each material, and the export downloads two files named by material.
- Golden SVG/DXF exports and the v5/v6 fixtures are byte-identical.

## Milestone 34 — Final verification: panels anywhere, drafts, boards, dividers, flat nets and board materials (milestones 28–36) ✅

Commands run (all passing): `npm run typecheck` (app and Worker), `npm test` (374 tests in 36 files; the ezdxf/svgpathtools reader checks are skipped here, since the Python packages are not installed), `npm run build`, and the full Playwright suite `npx playwright test` (57 passed, including the classroom spec against the real Worker; 40 screenshot-only specs skipped unless `SHOTS=1`), with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. Golden SVG/DXF exports and the v5/v6 fixtures are byte-identical; the 500-design autoseam test passes.

- Screenshots (`SHOTS=1 npx playwright test -c pw-app.config.ts panel-shots`), English and Hebrew, in `docs/panel-shots/`: a flat panel on a wall with the ghost bar, a standing partition (ghost and made), a construction plane with a panel on it, aligned boards, + Divider, a paste ghost, the flat-height tick, an amber wall with its note, a hinged wall folding, Ctrl-drag on an edge, a mixed-material box, the board card's material list, the legend, and the cut plan with two material headings.
- README *Using it* steps 2, 3, 10 and 15 rewritten, steps 18–22 added; DECISIONS has a section for this round.
- The older end-to-end specs press ✓ where they draw (milestone 30) and use + Divider (milestone 32).

Remaining limitations (milestones 28–36)
- A pasted shape follows the pointer only while the pointer is over a bare part of a panel (the pasted shapes themselves do not pass the pointer on).
- Placed panels: a standing panel's bottom stays on its face (its outline cannot be pulled below it); multiple selection is by click, not a box.
- Flat nets: the hinge is tried only across a convex corner next to the giving-way wall; a hinged wall is glued to the base on corrugated too. Panels grown by hand (not tray walls) are warned about, not changed.
- Board materials: a template's sizes are worked out in the working material only; the teacher's batch groups by material but still requires the students' working materials to match.

## Milestone 37 — Quick build: the mode and the feature table ✅

Implemented (`src/easy/features.ts`, `src/easy/Gate.tsx`, `src/easy/mode.ts`, `src/easy/QuickRail.tsx`; brief in `EASY_MODE.md`)
- `ViewPrefs.mode` (`'quick' | 'workshop'`), saved with the other view preferences and never part of the design. A browser with saved preferences keeps the Workshop it knows; a new browser starts in Quick build. A *Quick build | Workshop* toggle in the top bar (`mode-toggle`); switching stops the current tool and changes nothing in the design.
- One table (`FEATURES`) says what Quick build does with each feature: shown, read-only, chosen by the app (`auto`: hidden, the default applies) or hidden. Components ask `useFeature(f)` or wrap their control in `<Gate f>`; a unit test checks the table covers every feature asked for and that every feature Quick build changes is asked for.
- Hidden or automatic in Quick build: the Workshop tool rail and operation dots (the shape card has *Cut out | Engrave*), Score and Add, the joint lists and *Joints (advanced)*, seam pills (shown with *How it's built*, the joints view's Quick build name), the settings card's *Joints* and *Snapping* sections, the grow card's angle dial, span ends, outline handles and side controls (an edge picked in Quick build grows at 90° on the whole edge, adapting, with the design's joint), the hinge, curved points, fold-overs, a tray's own wall heights, joint lists and *Keep in one piece*, board materials and placed/construction controls, the first-use hints. Read-only: *Material and fit* and the material drawer.
- Quick build's rail: *Select* and the five actions (*Box*, *Wall / lid*, *Divider*, *Hole*, *Text & stickers*), with keys V, B, W, D, H, T; a hole is cut out and text engraved by default; one line of guidance on an empty design replaces the hints. (The actions' tools are milestone 38.)
- Parts made with Workshop tools (`workshopOnly`: an angled hinge, a fold-over, a through-cut on or reaching it, another material, a construction guide) show in Quick build with a read-only card (*Made in Workshop: …*, *Open in Workshop*); their edges, gizmos and slides are not offered and they cannot be dragged.
- *More…* at the bottom of a panel's or shape's card shows that card's Workshop version (joints, hinge, fold-over, …) until the selection changes; the mode is not switched.
- Classes: `mode` (`'quick' | 'workshop' | null`), `mode_locked` and `missions` columns (migration `0001_quick_build`, with the submissions' `mission`, `goals_met`, `goals_total` for milestone 40); the teacher picks *Students start in* and *Students cannot switch*; `GET /api/class/:code` returns them. A student following the class link (`/?class=CODE`) or submitting with its code gets the class's mode, and a locked mode hides the toggle.

Verified
- `tests/easymode.test.ts`: the feature table covers every feature asked for; Workshop shows everything; switching the mode leaves the design and its history unchanged; a locked class mode cannot be switched; an edge picked in Quick build grows at 90° on the whole edge, adapting; angled, fold-over and other-material boards are Workshop-only, straight walls are not.
- `tests/e2e/quick.spec.ts` (a new browser): Quick build is on, no hints, five actions and no Workshop tools or operation dots; the settings card has no Joints or Snapping; a wall's card has no joints or hinge until *More…*, which resets on the next selection; a leaning wall made in Workshop is read-only; H starts a cut hole; *Open in Workshop* shows today's editor with the design unchanged, and the choice survives a reload.
- `tests/e2e/classroom.spec.ts`: a class locked to Quick build: a student from its link starts there with no toggle (also after a reload); unlocked, the toggle is back. The other specs open in the Workshop (their browsers carry saved preferences).

## Milestone 38 — Quick build: the five actions ✅

Implemented (`src/easy/recipes.ts`, `src/easy/actions.ts`, `src/easy/stickers.ts`, the rail's action card in `src/easy/QuickRail.tsx`)
- Each action is a recipe over existing ops, run as a ghost and made with ✓ (Enter) as one undo step; the rail then goes back to *Select*. The action card next to the rail holds its few choices and one line of help (also shown under the stage).
- **Box** (`boxRecipe`): *Rectangle* or *Regular* (3–12 sides, inscribed in the dragged square). Drag on the floor: the base waits for ✓ while its walls rise as a ghost at the last height used (45 mm the first time), with Extrude's push-pull arrow, typed height and flat-net tick; ✓ makes base and tray together (one step), ✕ drops both. The same as drawing the base and pressing Extrude in Workshop.
- **Wall / lid** (`wallRecipe`): free edges show on hover; a click opens the grow ghost at 90° on the whole edge, fitted to its neighbours, with the design's joint (Workshop's grow card with its defaults, `growWith`). It starts at the height that fits (`quickWallHeight`): a lid across to the far face of the opposite wall, a wall as tall as the walls beside it.
- **Divider** (`planDividerLine`, `dividerLine`): draw a line on a box's base (or start on any part of the box: the line is drawn on its base). Its ends snap to the inner faces of the walls within 15 mm. From wall to wall across facing, parallel walls it is the divider `addDividerBetween` makes at the line's position (height: the lower wall less the gap; crossing dividers get half-laps as before); otherwise a panel placed standing on the base. While drawing and on the ghost bar the compartments either side are shown (*Divider: 40.5 mm | 70.5 mm*). Workshop gets the same gesture: the Panel tool's ghost bar offers *Divider* on a box's base, so milestone 32 does not leave Workshop without an easy divider path.
- **Hole**: circle, rectangle or rounded rectangle from the card (the last one used stays), drawn on a panel, cut out; the shape card offers *Cut out | Engrave*.
- **Text & stickers**: text as before, engraved; eight stickers drawn for CutForge (`THIRD_PARTY.md`), stored like an imported SVG (`addPathShape`), placed by clicking a panel at a quarter of its smaller side, engraved.
- Test hook `__cutforge.projectWorld(x, y, z)`.

Verified
- `tests/quickrecipes.test.ts`: a rectangle Box equals the floor panel plus Extrude, a regular Box the polygon base plus Extrude; Wall / lid equals Workshop's grow card with its defaults (through the store); a wall-to-wall line equals + Divider between the two walls, an off-centre line stands at the line with the compartments adding up to the inside, a line that stops short is a standing placed panel; Hole and stickers are the shape ops; stickers are closed outlines in their unit box; a lid starts at the box's depth and a wall at its neighbours' height.
- `tests/e2e/quick.spec.ts`: Box (dragged on the floor), Lid (the back wall's top edge, no angle dial), two Dividers (lines across the base), a Hole, Text and a Sticker on the front wall, each with ✓: seven actions, seven undo steps, then seven undos return to the empty design. Workshop: the Panel tool on a box's base, *Divider*, ✓ makes a divider.
- EN/HE screenshots of each action's ghost in `docs/quick-shots/` (`SHOTS=1 npx playwright test -c pw-app.config.ts quick-shots`).

## Milestone 39 — Quick build: guardrails and Ready to cut ✅

Implemented (`src/easy/guard.ts`, `src/easy/fix.ts`, `src/easy/ReadyBadge.tsx`; `panelFit`/`shapeFit` in `src/model/validate.ts`)
- **Keep-out zones** from the geometry the export check uses: the panel's manufactured outline (with its joint notches) inset by the material's minimum web, every slot, tab and fold-over hole on the panel, and the other cut-outs (a web apart). The export check's own rule for a shape on a plain rectangle (a web inside its deepest joint notch) is shared with the guard (`shapeFit`), so a shape the guard allows is one the check accepts. Engravings only have to stay on the panel and off the slots.
- **Every edit in Quick build is guarded** in the store (`apply` and `preview`, so drags, the gizmo, typed values, drawing, arrays and pastes alike): shapes the edit changed that land in a zone are pulled back along the change to the farthest allowed point (a group by one common amount, keeping its formation); a new shape is shrunk about its centre until it fits, and one that fits nowhere there is not made; text placed with a click moves to the nearest place it fits. The guard runs on the geometry the edit started from, then again after solve (joints may move around the shapes). A tooltip by the shape says why (*Kept 2 mm from the edge / the joints / the next cut-out*), and while a shape is dragged the zones of its panel show as a faint amber line. Workshop is unchanged.
- **Text** keeps a minimum letter height per material (engraved: 4 mm, or the thickness; cut out: 8 mm, or three thicknesses).
- **One-click fixes** (`fixIssue`) for what cannot be prevented: a shape outside the panel, too close to its edge or overlapping another cut-out moves to the nearest allowed place (smaller if it fits nowhere at its size); cut-out text with closed middles is engraved; a panel bigger than the sheet is shrunk to it; pieces off their sheet or overlapping are packed again. Workshop's export check gets the same *Fix* buttons.
- **Ready to cut badge** in the top bar in Quick build (it replaces the export check list there): green *Ready to cut ✓* when nothing blocks cutting, else *1 thing to fix* / *N things to fix*; its panel lists each with *Show* and *Fix* (or *Fix it in Workshop*); warnings that do not block cutting (a split panel, a bevelled through-cut) are listed as notes.
- **Sheet meter** next to it: *1 sheet · 12% used* with a thumbnail of the first sheet, from the packer.

Verified
- `tests/guard.test.ts`: a circle dragged toward the edge stops a web away and says why; on a box base a hole stops short of the finger joints; a group keeps its formation; cut-outs keep apart while an engraving may come close to the edge; a new shape across the edge is shrunk, one outside the panel is not made; text keeps a readable size; each fix (outside, too thin, overlapping, stencil text, too big for the sheet, off its sheet) clears its issue and adds none.
- `tests/autoseam.test.ts`: **500 seeded sequences of Quick build actions and drags** (a rectangular or regular box, dividers, holes drawn anywhere, random drags, engraved text) through the guard: the export check reports nothing that blocks cutting after any of them.
- `tests/e2e/quick.spec.ts`: a circle dragged past a base's edge stops at the zone, the tooltip shows, the badge stays green and the meter shows one sheet; a panel narrowed under its shape in Workshop shows *1 thing to fix* in Quick build, and *Fix* makes it *Ready to cut ✓*.
- Screenshots: a clamped drag, the badge with its fix, the badge and meter (`docs/quick-shots/`).

## Milestone 40 — Quick build: missions, what goes inside, and the payoff ✅

Implemented (`src/easy/missions.ts`, `src/easy/objects.ts`, `src/easy/InsideUI.tsx`, `src/easy/assemble.ts`, `src/easy/sheet.ts`)
- **Missions**, a registry like the templates': `{ id, version, title, description, materials, template | start, contents, goals }`. A goal is a check over the design as it is now, with a label, the panel it points to and a group (one star per group whose goals are all met, three at most). Goal kinds: an object fits (the placed object, or any compartment that would hold it), compartment counts, a lid, fits on one sheet (the packer), ready to cut (milestone 39), a name engraved (text other than the placeholder), a sticker, and the card stand's deck and angle (its template parameters).
- **The first four**: *Pencil box* (holds 12 pencils, 3 compartments, one sheet, ready to cut, your name engraved), *Dice tray* (a hexagon tray made with Box: 6 dice fit, one sheet, ready to cut, a sticker), *Card stand* (the card stand template: your deck fits, one sheet, ready to cut, leans back 45° or less), *Game organiser* (4 compartments, a lid, a deck fits, one sheet, ready to cut). Each starter meets some goals and none completely.
- **Start screen**: in Quick build, step 2 offers the missions (with their goals) after the templates and *Blank*; a class can limit which (the teacher's *Missions offered*, the `missions` column; a student following the class link gets the list). `Design.mission = { id, version }`; template regeneration keeps the mission and the objects.
- **Mission card** on the stage: the checklist, checked live (deferred), stars, *Mission complete!*; a goal selects what it is about.
- **What goes inside**: an object library (pencil, marker, dice, deck of cards, phone, coin, *Your own size*). `compartments()` splits a box's clear inside by its dividers (a rectangle base; another outline gets the largest centred rectangle); `capacity()` counts how many lie flat either way round and stack; `contentFit()` says whether a placed lot fits its compartment (with the material's clearance) or how much wider, deeper or taller it needs to be. The box card's *What goes inside* adds an object to a free compartment it fits (count, custom size, remove); on the stage each lot is a translucent block resting on the floor, green when it fits and amber with what it needs, and can be dragged. Objects are kept with the design (`Design.contents`), ignored by pieces, packing and export, so they survive a reload and a submission.
- **Show how it goes together** (the view dock's play button): the folds close, then each separate piece comes down into place, one at a time (view only).
- **Teacher**: the submissions table shows the mission and *N of M goals* (sent by the student's app; the Worker accepts small consistent numbers only, and only when the project names a mission).

Verified
- `tests/missions.test.ts`: for each mission, the starter is not complete and a reference solution (dividers moved, a name engraved, a bigger tray with a sticker, the stand's thickness and angle, a lift-off lid and a cross divider) meets every goal with the full stars; an object fits a compartment exactly when its footprint plus clearance is inside, half a millimetre less says *0.5 mm wider*, and stacking counts layers.
- `tests/e2e/quick.spec.ts`: start *Pencil box*, the pencils do not fit; size the compartments on the stage (the dividers' compartment labels) until the pencils' compartment turns green; engrave a name: the checklist is complete with three stars, the badge is green, and it all survives a reload.
- `tests/e2e/classroom.spec.ts`: a class offering only *Pencil box* (in Quick build): the student from its link sees only that mission, submits, and the teacher sees *Pencil box · 3 of 5 goals*.
- Screenshots: the start screen with missions, a mission with objects in compartments (green and amber), the assembly animation (`docs/quick-shots/`).

## Milestone 41 — Final verification: Quick build (milestones 37–40) ✅

Commands run (all passing): `npm run typecheck` (app and Worker), `npm test` (408 tests in 40 files, including the 500 Quick build guardrail sequences and the 500-design autoseam test; the ezdxf/svgpathtools reader checks are skipped here since the Python packages are not installed), `npm run build`, and the full Playwright suite `npx playwright test` (66 passed, including the classroom spec against the real Worker with a locked Quick build class and a class offering one mission; 48 screenshot-only specs skipped unless `SHOTS=1`), with `PW_CHROMIUM_PATH` set to the pre-installed Chromium. Golden SVG/DXF exports and the v5/v6 fixtures are byte-identical: designs without a mission or objects are unchanged, and nothing Quick build adds reaches pieces, packing or export.

- **Classroom run-through** (`tests/e2e/quick.spec.ts`, in English and in Hebrew): a new browser starts in Quick build, picks *Pencil box*, sizes the compartments until the pencils fit, engraves a name, and reaches *Mission complete* with three stars and *Ready to cut ✓* — in about ten seconds of scripted work (the test checks it stays well under twenty minutes; a student's own pace is the real measure).
- Screenshots, English and Hebrew, in `docs/quick-shots/` (`SHOTS=1 npx playwright test -c pw-app.config.ts quick-shots`): Quick build and Workshop side by side on the same organiser, an empty Quick build stage, each action's ghost (Box, Divider, Lid, Hole, Sticker) and the result, a clamped drag with its tooltip, the badge with a fix and the meter, the start screen with missions, a mission with objects in compartments (green and amber), and the assembly animation.
- README has a *Quick build* section and the teacher's new class settings; DECISIONS has a *Quick build* section (a mode is a viewer preference, the feature table, recipes over existing ops, guardrails prevent instead of report, fixes are narrow, missions as a registry, compartments).

Remaining limitations (milestones 37–40)
- Compartments assume each divider runs the whole way across; a box that is not a rectangle has one compartment (the largest centred rectangle of its inside). Objects lie flat, either way round.
- The guardrails keep cut-outs a web apart but do not stop two new shapes made in one edit (a paste of several, an exploded array) from touching each other; the badge then offers the fix. Text is guarded by its box.
- The Box action's *Regular* footprint is inscribed in the dragged square; *Freeform* is Workshop's polygon tool.
- In the e2e test the pencils' compartment is sized by typing on the dividers' compartment labels on the stage rather than by dragging the slide arrow.
- Goals met are counted by the student's app; the Worker only checks the numbers are consistent.

## Follow-up — joints, materials, the joints view, the ✓, moving and the Panel tool ✅

1. **Default joints for dividers and added walls**: an edge meeting a face (divider bottoms and ends, standing panels, walls meeting a face) now gets tabs in slots where they can be made, then glue flaps, and a slide fit only last; before, card and corrugated got a slide fit (or, for a grown divider, no joint at all). `jointWorks`/`fallBack` in `ops.ts` pass over a kind that cannot be laid out, whose slots would leave less than the material's web, or that would make a tray's net need changing to lie flat. Saved files keep their joints (the v5 corrugated organiser keeps its own golden export); new corrugated and card organisers export with tabs and slots (golden files updated).
2. **Quick build can change the material** (the material pill and the settings card's *Change material…*); kerf, clearance and sheet stay read-only.
3. **Joints view**: a bigger, labelled *Joints* button; while on, every joint has a label (all of them, or the selected panel's), the move, turn and grow handles are hidden, and clicking a label opens a menu of the kinds that joint can take, with *All joint settings…* (Quick build shows the menu read-only).
4. **The grow and extrude ✓ bar** sits below the height arrow (and above other stage labels, so it is always clickable).
5. **Moving a panel sticks to other panels' planes** (`src/model/planeSnap.ts`): dragging a floor panel, a placed panel, or using their gizmos snaps faces flush and edges in line, in two directions.
6. **The Panel tool in three clicks**: the face (or floor), then *Flat* or *Standing* on two small planes shown there (or their labels), then the drag. Standing lines (and Quick build's divider lines) snap level and parallel within 7°, then land on wall faces along that line; Alt draws freely.

Verified: `tests/dividers.test.ts`, `tests/joints.test.ts`, `tests/templates.test.ts` (tabs and slots for divider ends on every material, no slot without its web), `tests/planesnap.test.ts` (a box moved towards another lands flush and in line; a standing panel slides flush against a wall), `tests/flatnet.test.ts` (unchanged: a joint that would change a net falls back), golden exports; e2e: the joint menu changes a joint and the handles hide (`overhaul.spec.ts`), the three-click Panel tool with Esc and a level snap, the ✓ below the grow arrow (`boards.spec.ts`), Quick build's material change (`quick.spec.ts`); every spec drawing panels uses the new flow.

## Follow-up — more ways for tabs to hold: self-locking tabs and bolts ✅

- Tab-and-slot joints (between walls and bases, divider ends, tray corners, standing panels) choose how their tabs hold (`tabLen`): *Flush*, *Through, fold under* (card and corrugated), **Self-locking (snap)** (all materials: through tabs with barbs that catch behind the other panel and a slit so the tab flexes in), or **Bolts and nuts (M3)** (plywood ≥ 3 mm: a T-slot for an M3 nut in the tab panel's edge and a screw hole in the other panel, at both ends of the joint).
- Chosen from the joint's label menu on the stage (joints view), the joint card (a list, with the lock depth for snap and through tabs and the screw count for bolts), and a tray's card for all its corners.
- Geometry in `seams.ts` (`snapTab`, `boltSite`, `tabLocks`, `snapDepth`, `BOLT`, `boltCount`); barbs are in-plane joint additions (`adds[].flat`), unioned into the panel in 3D and in the cut pieces; slits and T-slots are joint cuts.

Verified: `tests/locktabs.test.ts` (the options per material; on plywood, corrugated and card the snap tabs reach the snap depth past the far face with two barbs each and a slit, the piece grows, and the export check is unchanged; bolted divider ends have two T-slots (stem and nut pocket) and two screw holes of the screw's size plus clearance, still clean; a tray's corners bolt together), e2e: the joint menu sets a joint to self-locking and offers bolts on plywood (`boards.spec.ts`), the tray's tab list (`trays.spec.ts`).

## Follow-up — Workshop by default, grouped shapes with clear operations, Quick build joints, one panel's joints ✅

1. A new browser starts in the **Workshop** (`initialPrefs`); Quick build stays one click away and is remembered.
2. **Workshop's rail**: Select, Panel, **Shapes** (rectangle, rounded rectangle, circle in one button, showing the current one; `R`/`U`/`C` still pick them), Polygon, Text, Import. While a shape tool is in use a card shows the shape choice and the operations as pictures with words (*Cut out*: a hole, or a notch across the edge; *Engrave*; *Score line*; *Add material*), with *Cut through the whole design* under Cut. A selected shape's card uses the same pictures and says which operation it has.
3. **Quick build's joints**: the settings card shows *Wall to base* and *Corners*; the joint label menu is no longer greyed out.
4. **Joints view** (both modes): labels only the selected panel's (or wall's) joints; nothing selected: no labels, and the hint says to select a panel.

Verified: `tests/e2e/quick.spec.ts` (a new browser opens in the Workshop; Quick build's joints view labels nothing until a wall is selected, then exactly its joints, and its menu changes a joint; Quick build's settings card shows the joint lists), every spec drawing shapes uses the Shapes card (`shapeTool`, `opPick` in `tests/e2e/util.ts`), and Quick build specs set Quick build explicitly (`QUICK_STATE`).

## Bug-fix pass (BUGFIX_PLAN.md) — phases 1–2: crashes and piece identity ✅

Fixed (each with its repro moved to `tests/regress/`):
- **B1** A fold whose parent or child edge is gone, or which is broken, no longer folds (`foldHolds` in `pieces.ts`): its child is cut as a net of its own and the joint still reads *broken*. `netGroups` also never drops a fold child its parent could not unfold.
- **B2** `safeUnion([])` and a difference of nothing return `[]`; a panel its own cut removes completely is reported `val.removed` (worded for any cut) instead of crashing.
- **B3** Project files and class submissions are checked before `solve` (`src/model/check.ts`): types, finite numbers within 100 000 mm, sketches, shapes, frames, placements, joints, trays and their references; dangling placements, joints to missing boards and trays without a base are dropped; anything else, any throw from `solve`, or a frame that blows up while solving is refused as `ProjectError('damaged')` (new `err.damaged` message). Contact sampling skips non-finite edges and caps its steps; SVG import drops non-finite shapes; the open-file alert never shows a raw error; the teacher batch names and leaves out submissions it cannot load (`teach.skipped`).
- **B4** An error boundary around the stage, rail and inspector (`src/ui/ErrorBoundary.tsx`) shows *Something went wrong* with Undo and *Reload the last good version*. Autosave saves only designs that validate without throwing and that the editor drew, and clears its timer on unmount.
- **B5** Fragment keys are `<key>@n` (`src/model/keys.ts`), never `<key>~n`, which wall-set members use; placement keys are split on their last `#`. `SCHEMA_VERSION` 9 moves v8 fragment placements to the new keys, keeping manual ones.

Verified: `npm run typecheck && npm test`; every phase 1–2 repro passes; model fuzz `FUZZ_N=600`: no `no edge` errors; load fuzz `FUZZ_N=300`, and `HUGE=1 FUZZ_N=1000` at seeds 1000, 3000, 6000 and 9000: no non-`ProjectError` throw, no NaN export, no hang (the corpus of goldens, templates, missions and 200 random designs all still load); pipeline fuzz `FUZZ_N=200`: copies equal placements for every design; `worker/api.test.ts` refuses two damaged submissions with 400; e2e `tests/e2e/crash.spec.ts` forces a render throw, recovers with Undo and with *Reload the last good version*, and a reload after a crash opens the last good design. `tests/outline.test.ts` and `tests/through.test.ts` asserted the old `~n` fragment keys and now assert `@n`.

## Bug-fix pass — phase 3: joint geometry that mis-cut ✅

- **B6** An explicit finger count is clamped to `maxFingers` (the largest odd n with fingers at least as wide as the thicker board), where it is used; the Fingers stepper's max follows.
- **B7** A butt corner cuts the owner wall back by the other wall's thickness (the slide corner's cut-back, no clearance).
- **B8** On a corner between boards of different thickness, the corner tabs keep the next edge's joint depth plus the web clear at each end.
- **B9** A notched outline that would cross itself is built as a boolean instead (`panelOutlines`, possibly in parts); `val.tooThin` flags a cut that comes into a joint's cut-back band, or within the web of it, without crossing that edge.
- **B10** `setWallCorner` and `setEdgeLength` refuse outlines that cross themselves (the corner drag stops at the last valid place); `val.selfCross` reports any sketch that does.
- **B11** *+ Divider* is refused (`div.why.tooShort`) where the base edge it would grow from is shorter than the wall-to-wall gap.

Verified: each repro (B6 also in 6 mm ply, B8 on 4–8-gons in card, corr-1.6 and corr-4, B9 also for a 0.5 mm web and a clean control, B11 on 8- and 12-gons and a rectangle control) in `tests/regress/`; volumetric overlap fuzz `OV_N=200` plus the default 30: no overlapping solids; model fuzz `FUZZ_N=200`: `pieces:outerSelfCross` and the notch-related `outline:selfCross` classes gone; `FUZZ_PLAUSIBLE=1 FUZZ_N=200`: no self-crossing outline; `tests/autoseam.test.ts` (500 Quick build sequences) still has nothing blocking; golden exports unchanged.

## Bug-fix pass — phase 4: kerf compensation and outline hygiene ✅

- **B12** Piece outlines drop points closer than 1e-4 mm; `offsetContour` tidies its input (micro segments, collinear lines), removes a short line whose two corners are both trimmed when it collapses, and tapers a jog under the kerf between parallel lines, instead of refusing. Folded walls on sloped edges (3–7-gon card and corrugated boxes, the Dice tray mission) export compensated.
- **B13** The offset's self-intersection check counts touching and collinear overlaps; `val.sliver` reports a rectangular board whose opposite joints leave less than the web between them.
- **B14** Rings and holes of no area (|area| < 1e-6 mm²) are dropped in `ownOutline` and the piece contours.

Verified: the repros in `tests/regress/`; pipeline fuzz (`FUZZ_N=300`): pieces refused compensation 158 → 25, and no compensated outline moves the wrong way; offset fuzz (3000 shapes): every result at |d|, fewer refusals (357 → 340); goldens: `hand-ply-box-compensated` now compensates a text cut it used to leave nominal, `v6-card-gable` lost one micro segment (both regenerated, the v6 file itself unchanged). Still refused (the export names the piece): spikes and slivers narrower than the kerf (a corner turning back more than ~160°), nubs under the kerf, and a few offsets that cross at a neck narrower than the kerf; the laser cannot cut these as drawn.

## Bug-fix pass — phase 5: sheets and Quick build ✅

- **B15** The sheet check is per piece (its whole net), inside the margin, turning only where the grain allows: a piece that fits only turned is `val.tooBigGrain` (Fix: allow turning), one too big either way `val.tooBig` (Fix: shrink its root uniformly, with the tray height, divider offsets and boards placed on it, until the net fits). Every Fix returns true only when its issue is gone.
- **B16** A piece in the sheet's margin is `val.offSheet`; the packer's fallback for a piece that fits nowhere starts on sheet 0, so there is no empty first sheet.
- **B17** A shape's own outlines are not checked against each other (array copies still are); a cut-out path shape with nested outlines is `val.stencilShape` (Fix: engrave).
- **B18** The adaptive grow trims a ghost's sides too, where boards beside it cross them (a lid on a polygon box), keeps the lower trim in its end columns and at bends, and stays a clearance away from boards it only touches at a corner.
- **B19** A divider line's plan never shows a board lower than `MIN_PANEL`, which is what ✓ makes.
- **B20** In a teacher batch, each design's working material is taken as the first's, so calibrated materials share sheets; the batch card shows the kerf used.
- **B21** Batch labels are scaled to fit their piece both ways, or left out below 1 mm.

Verified: the repros in `tests/regress/` (B15 rewritten for the new issue keys; B16 with a 2000 × 60 board on sheet 0 and one export sheet; B17 with a cut "O" still `val.stencil`, an engraved smile clean and overlapping array copies still reported; B18 on 5–8-gon boxes in all four materials; B21 new, `tests/regress/batch-labels.test.ts`); Quick build fuzz (`tests/bugs-output/quick.test.ts`): no Fix reports success with its issue still there (was 47 `offSheet`, 3 `shapesOverlap`), no standing plan of height 0 (was 12); batch fuzz clean; `tests/adapt.test.ts` (the gable under a sloped roof still meets and joins the roof). Still open: the Quick build fuzz's `val.tooBig` Fix can bring up other issues on the shrunk box (32 of 45, e.g. an unjoined overlap); it existed before this pass (31) and is listed for a later look.

## Bug-fix pass — phase 6: model consistency ✅

- **B22** One helper removes a panel and everything naming it (`removePanelRecord` in `place.ts`: hosted panels drop to the floor where they are); deleting and both reconciliations use it, and `solve` drops any orphan from an older file to the floor.
- **B23** `seamStillFits` looks both ways (what `seamsBetween` finds depends on the order, and `findOpenSeams` looks from the earlier panel); `autoConnect` keeps no automatic seam that is broken as soon as it is joined, or left broken by one joined after it.
- **B24** `solve` repeats a pass (at most 3; a development warning if it does not settle) when the pass changed what it read at its start: every joint's kind, the trays' kinds and their flat-net plans.
- **B25** `solve` re-fits each tray's wall and corner kinds to its base's material (the design's choice for it, else the material's defaults) before the walls are reconciled.

Verified: the repros in `tests/regress/` (B25's written for the fix: five material switches and a construction base); model fuzz `FUZZ_N=600`: no dangling host (new invariant); `FUZZ_N=300 FUZZ_FROM=301`: no solve-twice or round-trip differences; `FUZZ_AUTOIDEM=1 FUZZ_N=300`: `idem:autoConnect` 15 → 10. Still open: those 10 involve walls split by through-cuts next to leaning panels, where a seam is joined and then dropped on the next run; and the fuzz classes `flat:autoTrayOverlapsOther` (a tray's flat-net fix cannot clear an overlap with a board that is not one of its walls; reported by validate), `joint:holeOutside` (a corner's tab slot lands outside a much-cut wall; reported) and `ref:edgeGoneNotBroken` (a grown fold kept on an edge a cut removed is not flagged broken, though B1 keeps it from folding), all present before this pass.

## Bug-fix pass — phases 7–8: UI, tests and final check ✅

- **U1** The top bar fits from 768 px up in both modes and languages: buttons never wrap; below 1500 px *Submit to class* becomes an icon and *Submit* and the brand name hides; the material pill shows only its swatch below 1300 px (1500 px in Quick build); below 1000 px (1380 px in Quick build, which also holds the Ready badge) Submit, the mode switch and the language move into a ⋯ menu (`top-more`) and Download shortens. Download, Undo and Redo always stay on the bar.
- **U2** The contact shadow is removed (drei's one-frame capture drew it away from the boxes).
- **U3** Replaced by milestones 42–43.
- **U4** The two flaky specs waited a fixed 300 ms after moving the camera; a shared `settle()` (`tests/e2e/util.ts`) waits until the camera stops.
- **Clean-up** Every repro is in `tests/regress/`; the fuzzers are in `tests/fuzz/`, part of `npm test` at small counts (`FUZZ_N` and the other variables in each file run them longer; `STRICT=1` on the Quick build fuzzer also reports the known open class). `vitest.bugs.config.ts`, `test:bugs` and the `exclude` are gone.
- Found by the full e2e run and fixed: Quick build hid Submit at exactly 1400 px; B18's side trims cut a leaning panel's sides back from the side walls that hold it.

Verified: `npm run typecheck && npm test` (543 passed, 7 skipped: ezdxf not installed, and the replay tool); full e2e (`npm run e2e`, with the Worker): 95 passed, 50 skipped (`SHOTS`), and the two failures found were fixed and their specs re-run green; `topbar.spec.ts` 20/20; `--repeat-each=10` on the two flaky specs: 20/20. Fresh-seed fuzz, cut short at the owner's request: model `FUZZ_N=1200`: no crash, no dangling host, no solve or round-trip difference; overlap `OV_N=300`: one design with overlapping solids (not triaged); load `HUGE=1 FUZZ_N=1000`: clean. The pipeline, Quick build, template, offset, batch, degenerate and kerf fuzzers were not re-run at large counts here (they ran clean, apart from the classes listed in the phase sections, during their phases).

Left open: Quick build's tooBig Fix can bring up other issues on the shrunk box; 10 in 300 designs where automatic joining churns (walls split by through-cuts); the model fuzz classes `flat:autoTrayOverlapsOther`, `joint:holeOutside`, `ref:edgeGoneNotBroken`, `outline:selfCross:wallCorners` and, at seed 2369, `pieces:outerSelfCross`; one overlap-fuzz design.

## Milestone 42 — the Board tool in one drag, with a perpendicular toggle ✅

Implemented (`BOARD_TOOL_PLAN.md`; `src/views/board.ts`, `src/views/panelTool.tsx`, `src/views/View3D.tsx`, `src/ui/Toolbar.tsx`, `src/ui/PlacedUI.tsx`, `flipPlacedSide` in `src/model/ops.ts`)
- **One drag**: with the Board tool (renamed from *Panel* in English), pressing on the face under the pointer or on the floor starts the board there at once; releasing a drag of at least `MIN_PANEL` makes it (one `apply`, one undo step), selects it and returns to Select. A click or a shorter drag makes nothing and keeps the tool; Esc during the drag drops it. The face under the pointer is outlined as before, and the floor shows a small square at the snapped point. The three-click picker (`panelPick`, `PanelPicker`, the *Flat*/*Standing* planes, the `pick.*` strings, `.pose-pick`) is gone, and so are the Board tool's ✓ bar and the ghost's handles, W/H fields, height arrow, flip and pose/construction controls; Quick build's Divider still waits for ✓ with its handles and compartment note.
- **What a release makes** is a pure function, `boardFromGhost(d, ghost)` (`src/views/board.ts`): a floor board, a board flat or standing on a face, or (perpendicular on, on a box base's inner face: `drawsDivider`) a divider line through Quick build's `dividerLine`: from wall to wall a divider, otherwise a standing board. `confirmPanelGhost` runs it in one `apply` without a bar.
- **The perpendicular button** (`tool-panel-standing`, *Perpendicular board*): a lighter button behind the Board button that slides out by its width plus 6 px toward the stage while the tool is active (right in English, left in Hebrew; 160 ms ease-out both ways; `inert` and hidden when the tool is not active; no slide under `prefers-reduced-motion`); pressed, it uses the rail's accent. The main button's icon follows the pose (`panel` or the new `panelStanding`). The pose is remembered in `viewPrefs.boardPose` (`setBoardPose`), flat the first time. `P` chooses the tool; `P` again toggles the button. Hidden with the tool in Quick build and outside the 3D view.
- **On the made board**: a standing board starts at the last height used (40 mm the first time) and its height changes with its H field and height arrow; *Flip side* on its card (`placed-flip`) and a flip badge on the stage while it is selected (`placed-flip-badge`) put its material on the other side of its line (`flipPlacedSide`); *Construction* is the card's checkbox.
- **Text**: one hint line for the Board tool (and a perpendicular variant), `hint.1` and `view.empty3d` name the Board tool and the perpendicular button, in English and Hebrew. README and DECISIONS (*The Board tool draws in one drag*, replacing *The Panel tool takes three clicks*) updated.

Verified
- `tests/board.test.ts`: `flipPlacedSide` keeps the board's line where it was and puts its material on the other side (and back), leaves a flat board alone; the H field changes a standing board's height; on release a flat floor drag equals the floor panel drawn there, a click or a drag under `MIN_PANEL` makes nothing, perpendicular on a plain board is a standing board at the given height, on a box's base a wall-to-wall line equals *+ Divider* between those walls and a line that stops short stands on the base; only a standing line on a base's inner face is a divider line; through the store, release is one undo step, selects the board and goes back to Select, and the pose is kept.
- `tests/e2e/boards.spec.ts`: *the Board tool draws in one drag; the perpendicular button slides out and is remembered* (the flyout appears to the right of the Board button, unpressed; a floor drag makes an 80 × 60 board, selected, Select, one undo step, no ✓ bar; perpendicular on, a line 5° off level on the board makes a level standing board 40 mm tall, undo removes it; Flip side on the card and the stage badge, the H field; on a tray's base a wall-to-wall line shows *divider-live* while drawing and makes a divider joined to both walls; after a reload the flyout is still pressed and `P` toggles it; a click makes nothing and Esc during a drag makes nothing), *Hebrew: the flyout is left of the button; with reduced motion it has no animation*, a flat board on a wall's inner face snapped to its corner, a wall-to-wall line across a box's base (a divider with slots in the base and both walls), Esc during the drag. Every spec that drew a board uses `drawBoard` (`tests/e2e/util.ts`): `boards`, `quick` (Workshop's divider line), `text-pack`, `joints`, `slice`, `editing`, `offline`, `panel-shots`. Screenshots of the rail with the flyout out and pressed, in English and Hebrew: `docs/panel-shots/*-42-rail-flyout-*.png`.
- `grep -rn "panelPick\|PanelPicker\|pick-flat\|pick-standing\|pose-pick" src tests` finds nothing.

## Milestone 43 — a first-use tour from the welcome screen ✅

Implemented (`TOUR_PLAN.md`; `src/tour/steps.ts`, `src/tour/TourOverlay.tsx`, `src/tour/TourNudge.tsx`, `src/tour/stage.ts`, the tour state in `src/store/store.ts`)
- **Steps** (`TOUR_STEPS`): a declarative list of 13 cards (a welcome and 12 steps), each with an anchor (a selector, a point on the stage from the design, or the centre; a function when it moves on as the student goes, e.g. the Board button, then the perpendicular button, then the box's floor), English and Hebrew text, a check over the editor's state against the design the step began with, what *Skip step* applies (model ops), what runs on entering, and a "Not quite" line. The stage points (base centre, the back wall's top-edge midpoint, the box's floor, the front wall's centre) are small pure functions over the design.
- **Store**: `tour: { step, entry } | null`, `startTour()` (Workshop, a new blank plywood 3 mm design as Start with *Blank*, the welcome screen closed, a three-quarter camera over the origin), `tourNext()`, `tourBack()`, `endTour()` (sets `cutforge.tourDone`). Not saved: a reload ends it.
- **Progress** (`useTourProgress`): on entering a step its `prepare` runs (e.g. the Board tool for the perpendicular step, the joints view on a wall, the design card's *Joints* section open, a higher camera and the lid left off the stage for the divider); when its check turns true (not during a gesture, not while a shape waits for ✓) the next step follows 0.6 s later. *Skip step* runs the step's ops in one `apply`.
- **Overlay**: a ring around the anchor with the rest dimmed (`pointer-events: none`, pulsing unless reduced motion), the card beside it (`role="dialog"`, *Step n of 12*, *Back*, *Skip step*, *End tour*, *Next* on explain-only steps, *Done* at the end), placed on the side with room and never over the anchor, the top bar or the rail, and correct in RTL. Focus moves to the card on each step unless a field is being typed in. The stage registers its projection and camera (`registerStage`), re-projected every frame, so the ring follows orbiting and zooming and hides off-screen. Step 2 has a hand cursor dragging over the floor until the student starts drawing.
- **Welcome screen and menu**: a tour card above step 1 (*Take the tour*, `tour-start`) until `tourDone`, then a footer link (`tour-link`); neither when a class locks Quick build. The project menu has *Take the tour* (`menu-tour`) behind the same confirm as *New design*.
- **Tips replaced**: `Hints.tsx` and the `hint.*` strings are gone; a first-time student who chose Start gets one note, *New here? Take the 3-minute tour* (`tour-nudge`), dismissed for good with *No thanks*.

Verified
- `tests/tour.test.ts`: for each step, the design before it (every earlier step skipped, in order) does not pass its check; doing the thing with ops does (a 110 × 90 floor board, Extrude, the lid grown from the back wall's top edge with the Workshop grow's defaults, card, another corner kind, plywood, a wall-to-wall divider line, a confirmed circle cut out of the front wall), and a small board, a board drawn on the wall instead of the lid, a line that stops short, a circle still waiting for ✓ or engraved do not (with the "Not quite" lines); Skip passes it. Skipping every step from 1 to 12 ends with a tray, a lid, a divider and a window in plywood, and `validate` reports nothing blocking. The divider step leaves the lid off the stage.
- `tests/e2e/tour.spec.ts`: **English, every step by hand** (the mouse on the stage, the `__cutforge` projection helpers for points): each card in turn with the ring around its anchor (the Board button, the floor point, the perpendicular button, Extrude walls and its ✓, the grow ✓, the material pill and the card material, the joints button, the *Corners* list, the Board tool again, the Shapes button and *Circle*, the shape's ✓, *Download for laser*), the steps advancing by themselves, and a final design with a tray, a lid, a divider and a cut-out on the front wall; **Hebrew**: the card sits left of the rail in RTL, *Skip step* through to the end makes the same box; *End tour* at step 4 keeps the design, the menu's *Take the tour* asks first (and No keeps the design), and the welcome screen after *New design* shows the footer link instead of the card; a first-time *Start* shows the *New here?* note, which opens the tour; a class locking Quick build gets no tour; at 1366 × 768 and 1280 × 800, in both languages, no card leaves the window or covers *Download for laser* or the rail. Screenshots of every card in English and Hebrew (and the welcome screen) in `docs/tour-shots/` (`SHOTS=1`).
- Every spec that dismissed the tips dismisses the *New here?* note instead (`tour-nudge-dismiss`).

## Milestone 61 — foundations: derived data outside the design, the harness ✅

Plan: `PACKAGING_PLAN.md` (milestones 61–72; it replaces the parked curved-walls branch).

Implemented (`src/model/derived.ts`, `src/model/geometry.ts`, `src/model/foldover.ts`, `src/model/pieces.ts`, `src/store/store.ts`, `tests/harness.ts`)
- **Solving outside Immer.** The store's edits (`apply`, `preview`, the paste that follows the pointer) still make their change in a draft, but solve, connect and the Quick build guard now run on a plain copy (`settle`): solving reads the whole design many times over, and through Immer's proxies that cost about three times as much (a 160 × 110 card tray with three dividers: 23 ms in a draft, 8 ms on a copy, in Node here).
- **Unchanged parts keep their identity.** `reconcile` swaps every part of the result equal to the same part before for the old object, so a design that solves to itself is the same object, and an edit to one panel leaves the other panels' objects as they were.
- **Derived data cached per design.** `memo(d, key, fn)` caches against a frozen design (the store's are all frozen) and works it out every time for one still being edited, so it is never stale.
  - `panelExtras` and `panelNotches` build every panel's joint geometry in one pass over the connections (and fold-overs) and serve each panel from it. Before, each call scanned every connection and recomputed every fold-over, once per panel asked about.
  - `allFoldOvers` is cached the same way.
  - `ConnGeom.lines` (open cut lines) is read now, for milestone 63's hinge slits.
- **One fold strip function.** `foldBand(d, c)` draws the strip and score of a grown fold and of a tray corner made a fold (they were two near-copies in `groupPieces`); milestone 63 gives it a radius.
- **The harness** (`tests/harness.ts`): `idempotence`, `roundTrip`, `sweepBack` (a setting swept and returned gives the same design, ids included), `lostShapes`, `timeOf` and `speedRatio` (ratios, so a budget holds on any machine).

Verified
- `tests/stability.test.ts` (13): trays in card, corrugated and plywood with dividers, a fold-over and a hole solve to themselves and save and reopen to themselves; a hexagon tray's height and a box's size swept and returned; resizing never removes a panel with shapes; on a frozen design `panelNotches`, `panelExtras`, `allFoldOvers` and the pieces equal the plain ones; `settle` equals solving in a draft, keeps an unchanged design's identity and freezes its result; an edit through the store equals solving it by hand; on the organiser (4 × 3 dividers) asking every panel for its joint geometry takes under half as long on a frozen design.
- Golden exports byte-identical. Unit suite: 556 pass, 7 skipped; typecheck clean.
- Browser (`--grep-invert classroom`): 90 passed, 0 failed, 57 skipped (`crash.spec` failed once while a file it served was being rewritten, and passed when run again).

## Milestone 62 — round outlines and bend limits ✅

Implemented (`PACKAGING_PLAN.md` §6.2; `src/geom/fillet.ts`, `src/model/edges.ts`, `src/model/round.ts`, `src/model/ops.ts`, `src/geom/arcfit.ts`, `src/export/prepare.ts`, `src/export/offset.ts`, `src/model/materials.ts`, `src/views/polyTool.tsx`, `src/ui/Inspector.tsx`, `src/ui/MaterialDrawer.tsx`)
- **Rebuilt from the parked branch's milestone 45**, which was sound (its problems were in the curved walls that came after it): its commits were taken and changed where the plan says.
- **Rounded corners:** `curve: 'round'` with `r`; arcs keyed `<edge>^~<n>`. Point card: *Corner · Curve · Round*, with a radius (`point-round`, `point-radius`). Base card: *Corner radius* for all of them (`round-corner-all`).
- **The clamp (new):** an edge at least 5 mm long before rounding keeps 5 mm of straight edge (`KEEP_STRAIGHT`, the same 5 mm as trays' `MIN_EDGE`), so rounding never takes a wall away. Shorter edges keep what they can (their arcs meet); round bases' arcs still meet. The card says when a corner was made smaller (`round-clamped`) and, on a point, how large it may be (`point-radius-max`, from `maxFillet`).
- **The fillet maths** is in `src/geom/fillet.ts` (`fillets`, `maxFillet`, `arcPoints`), on plain points, so the waffle branch's `src/sculpt/round.ts` can be folded into it when both are in. `sketchFillets` / `sketchMaxRadius` pick the clamp for a sketch.
- **Round bases:** circle, four-centre oval, stadium (`Sketch.round`, `roundPts`, `ovalRadii`, `defaultEnd`); ops `addRoundPanel`, `setRoundShape`, `convertToPoints`, `setPointRound`, `setCornerRadius`, `addRoundedRect`; their card (`round-section`).
- **Polygon tool:** *Round* and *Rounded*; on a panel they draw the shape as a polygon shape.
- **Arcs back at export** (`refitArcs`); kerf compensation follows arcs that meet tangentially. `src/geom/arcfit.ts` is byte-identical to the waffle branch's copy (SHA-256 `16d760b6…abb3d`).
- **Bend limits** on materials (`bend`, `bendDefaults`, `bendOf`) and in the material drawer (`drawer-bend`, `mat-smoothR`, `mat-patternR`).
- **No schema change** (still 9): the fields are new and optional; the plan bumps the schema once, at milestone 70.
- English and Hebrew strings (two new: `round.clamped`, `round.largest`).

Verified
- `tests/round.test.ts` (17): the parked branch's cases (circles, stadiums, ovals both ways, the draftsman's default, resizing and shape changes, *Convert to points*, save/load with an identical export, rounded rectangles, bend defaults, export as SVG arcs and DXF bulges, kerf compensation of arcs, a 12-gon kept as lines), with the clamp case rewritten (a 40 × 20 rectangle at 15 is 7.5 round with 5 mm short sides; a 3 mm side's arcs meet; a stadium's still meet), plus a tray on a rounded rectangle keeping its four walls at every radius from 3 to 80 mm, and that radius swept and returned giving the same design.
- Golden exports byte-identical. Unit suite: 573 pass, 7 skipped; typecheck clean.
- Browser: new `round.spec.ts` (from the parked branch); full app suite (`--grep-invert classroom`): 92 passed, 0 failed, 57 skipped.

Limitations
- Tray walls stand on straight edges only: curves are left open until wings (milestone 64) and round boxes (milestone 65).
- A converted oval's points sit outside it (the rhombus); its corners are dragged from there.
- Auto (Bézier) curves are still exported as short segments; only circular arcs come back.

## Milestone 63 — folds with a radius, and bend patterns ✅

Implemented (`PACKAGING_PLAN.md` §4.2, §4.3, §5; `src/model/bands.ts`, `src/model/bendPatterns.ts`, `src/model/seams.ts`, `src/model/pieces.ts`, `src/model/validate.ts`, `src/easy/fix.ts`, `src/export/prepare.ts`, `src/export/bendTest.ts`, `src/export/label.ts`, `src/views/foldView.ts`, `src/views/bandMesh.tsx`, `src/ui/BendUI.tsx`, `src/ui/Connections.tsx`, `src/ui/Inspector.tsx`, `src/ui/MaterialDrawer.tsx`)
- **The model.** `Connection.radius` (inner radius) and `Connection.bend` (`pattern`, `density`) on a grown fold. Absent: a crease on card and corrugated, the material's pattern radius on plywood. A band is derived (`bandOf`), never stored.
- **The geometry: inside the corner.** Both panels keep the frames a sharp fold gives them, so the box's outer size, and everything built on it, stay where they were. In the fold's cross-section the outer faces' lines meet at a point O; the outer arc (radius r + t) is tangent to both, Ro·cot(a/2) from O; the parent is cut back to its tangent point (`trimP`, a notch along the edge) and the child to its own (`trimC`, a notch along its bottom). The developed width at the neutral line is θ·(r + k·t).
- **In the net** the band is a strip of that width between the cut-back panels (`foldBand` → `bandStrip`): `foldXform`'s allowance becomes `lb − trimP − trimC`; at radius 0 nothing changes.
- **Boards across a band** (side walls under a hinged lid) are cut back to its inner face (`bandCrossings`: the corner region from O out to the inner arc, mapped onto each board standing square to the edge within its span and overlapping it), so their corner is rounded to the hinge.
- **Patterns** (`src/model/bendPatterns.ts`): a registry with `smooth` (all), `score` (card) and `slits` (plywood straight-slit living hinge).
  - Lines: spacing ρ·pitch/reach, held between half and twice the pitch.
  - Slits: link length ℓ from slits of at most 24 mm with bridges of max(3, t); spacing p = √(C·ℓ·ρ) while p ≤ t, else C·ℓ·ρ/t, with C the material's `strain` (0.016 for plywood, which gives 2.0 mm at ρ 30 with 20 mm slits); at least max(1.2, t/2). The reach follows from the smallest spacing, so a short band reaches less tight, and one too short for a slit cannot have slits.
  - `patternWhy`: `radius` (with the radius it needs), `short` (with the length), `material`. `bandPattern`: the choice if offered, else the first that works, else the tightest-reaching (flagged). `density` 1, 0.75 or 0.5 only makes lines denser.
- **Plywood folds** (a living hinge): `connectionsFor` offers `fold` last at every angle, never as a default; the design-wide joint lists leave it out. `pairFilter` allows a fold between boards of the same plywood.
- **Export:** scores on the SCORE layer, slits as open CUT lines (`op: 'cut'`, `role: 'line'`), also from `ConnGeom.lines`; kerf compensation shortens an open cut line by half the kerf at each end (`shortenOpen`).
- **Checks** (`bendIssues`): `val.bendTight` (no pattern reaches; a crease in plywood too), `val.bendStyle` (the chosen one does not), `val.bendShort`, `val.bendRoom` (the cuts would take a whole board). *Fix*: the radius needed, *Automatic*, or the largest radius that fits.
- **3D:** `bandMesh.tsx` draws the band's curved slab with its lines on its outer face. In the fold view a band unrolls (`bandPose`, `bandChildMove`): it turns k·φ, its outer length going from the arc's to the strip's, so flat the child lands where the net puts it.
- **Card:** the *Bend* section (*Living hinge* on plywood) on the folded board's card: *Bend radius*, *Pattern* (each pattern the material offers, greyed with its reason where it cannot work: `Segmented` options can now be disabled), *Lines* (*As needed*, *Denser*, *Densest*) and what that makes (`bend-makes`).
- **Bend test:** *Download a bend test* in the material drawer (`mat-bend-test`): five zones at 0.7–1.6 × the pattern's reach on a 40 mm strip, each labelled on the GUIDE layer (`pieceLabel`, now in `src/export/label.ts`).
- English and Hebrew strings.

Verified
- `tests/bands.test.ts` (15): a crease has no band; a quarter turn's developed width, the arc's points all Ro from its centre from one tangent point to the other, the notches at the trims, the child's cut-back bottom on the arc's end in 3D; the fold view (no move folded, the strip's end flat); a card lid at radius 8 is one piece with scores at the calculated spacing, lies flat and exports; radius 12 smooth, radius 2 named; a plywood lid on a living hinge is one piece with its back wall, its slits a bridge from the band's edges, compensated slits shorter by exactly the kerf; idempotence, save and reopen, a radius swept and returned; the slit formula; why a pattern cannot be used; denser on request; the four fixes; the bend test for card and plywood.
- Updated `hinge`, `joints`, `jointdefaults`: plywood offers a living hinge last at every angle (not in the design-wide lists).
- **Golden exports:** every existing case byte-identical; new `band-card-score-r8`, `band-ply-hinge`, `band-ply-hinge-compensated`.
- Unit suite: 591 pass, 7 skipped; typecheck clean.
- Browser: full app suite (`--grep-invert classroom`): 94 passed, 0 failed, 57 skipped. New `tests/e2e/bands.spec.ts` (a plywood lid's *Living hinge* card: radius 30, Automatic's slits, Smooth greyed with 150 mm, Densest, a radius of 5 named and 40 clear, the fold slider; a card fold given a radius of 8 is scored and of 0 a crease again). Checked by eye: the band closed, half open and flat.

Limitations
- Bands are on grown folds only; tray corners made folds (`hingeOf`) keep a crease: rounded corners come as wings (milestone 64).
- Pattern lines show in 3D on the band's outer face only, and only with outlines on.
- A lid grown flush on a box's walls is reported as overlapping them, as before (the band does not change that).

## Milestone 64 — curved tray walls ✅

Implemented (`PACKAGING_PLAN.md` §4.2, §4.4–§4.7; `src/model/wings.ts`, `src/model/bands.ts`, `src/model/ops.ts`, `src/model/seams.ts`, `src/model/pieces.ts`, `src/model/jointDefaults.ts`, `src/model/validate.ts`, `src/model/check.ts`, `src/model/edges.ts`, `src/easy/fix.ts`, `src/easy/recipes.ts`, `src/easy/QuickRail.tsx`, `src/views/foldView.ts`, `src/views/View3D.tsx`, `src/ui/CornersUI.tsx`, `src/ui/BendUI.tsx`, `src/ui/connLabel.ts`)
- **The model.** A tray on a base with rounded corners stands its walls on the straight edges only (milestone 62 keeps every one). Each rounded convex corner between two walls is a connection (`Connection.wing`, id `wing:<A>|<B>`), from the wall before it (A, edge e1) to the wall after it (B, edge e3). Its band (`wingBand`) is carried by A: cross-section from A's end into A and towards the box's inside, the arc on the base's fillet centre, outer radius from the wall's outer face, inner radius that less the thickness, developed width θ·(r + k·t). No wall is cut back: both end at the fillet's tangent points.
- **Kinds** (`wingKinds`): plywood `fold` (one piece) · `key` · `butt`; card and corrugated `glue` · `fold` · `butt`. One piece only where B is not already folded off the base. New kind `key` (schema-free: optional). Their kinds are their own: `jointGroup` leaves them out of the design-wide lists, `autoConnect` never removes them; `reconcileWings` (after the tray walls stand) makes and removes them, and `planWings` fits the kinds.
- **Geometry** (`wingGeom`): one piece adds nothing to the walls: B continues A in the net (`netFolds`, B at A's end plus the band) and `foldBand` draws the strip with its pattern. Otherwise the band is material added past A's end with its pattern, then a glue lip (as wide as fits between the walls in the flat net; folded onto B's inner face in 3D), a puzzle key with its socket in B, or nothing. Under a band whose wall stands down beside the base (plywood fingers) the base is cut back to the band's inner face, so it wraps round it.
- **Plywood strips** (`planStrip`): the walls round one-piece corners are one strip; closed all round, it is keyed shut at the corner nearest the back left (`Tray.closeAt` moves it: *Closing seam* on the tray card); keyed again wherever it grows longer than the sheet (`stripMax`). A corner the student set by hand keeps its kind.
- **Stability** (§4.6): corners are keyed by their two walls, so a radius swept up and down leaves the design as it was; a wall too short for fingers (5 mm) is still a wall (found by its joint's own key, not by whether the joint holds).
- **Speed** (§4.7): no polygon clipping in solve for corners. A curved outline is worked out once per shape and shared, frozen (`sketchRing`), and looked up by key (`findEdge`'s index), instead of rebuilding a rounded base's arcs on every edge lookup; corners and their bands are worked out once per solve pass. A 120 × 80 rounded card tray solves in about 1.3 ms here (the parked branch: 12.4 ms), within twice the square tray.
- **Checks:** the bend checks cover corners; for a corner the radius in the message and its *Fix* is the base's corner radius (the inner radius plus the wall's thickness and inset).
- **3D:** every corner's band drawn (its pattern on its outer face), unrolling with the fold view; a one-piece corner carries the next wall. Joint labels sit in the middle of the band; a one-piece corner reads *One piece*, a plywood fold *Living hinge* (`connKindKey`).
- **Cards:** the tray card's *Rounded corners (n)* (all corners one way, `setTrayCorners`) and *Closing seam* (`setClosingCorner`), with a note when the strip is keyed apart for the sheet; a corner's own card shows its band (radius read-only: the base's).
- **Quick build:** *Box* · *Rounded* (`box-rounded`) with *Corner radius* (`box-corner`, default 15), raised to what the walls bend to at the box's height (`roundedMin`: the patterns' reach plus the thickness), with a note (`box-reach`). The base's corner note now uses the same reach.
- **Fixed on the way:** the slit layout let one slit run past the 24 mm maximum (it rounded the count instead of rounding up), which made a 40 mm band look bendier than it is; the milestone-63 plywood hinge goldens changed with it. A three.js mesh had a `data-testid`, which React Three Fiber refuses: removed.
- Files: `check.ts` accepts `key`, `radius`, `bend`, `wing` and `Tray.closeAt`. English and Hebrew strings.

Verified
- `tests/wings.test.ts` (8): a card rounded tray is five panels with four glued corners, one piece, flat, clean; each band leaves one wall's end and arrives exactly at the next wall's start (3D, card and plywood); plywood is one strip of four walls with three hinge corners and a key at the back left, slits in every band, the base cut back; a strip longer than the sheet keyed apart, and the closing corner moved; a corner set by hand keeps its kind, and one piece is not offered where the next wall folds off the base; corrugated corners at 15 named and fixed by rounding the base; walls and corners kept at every radius from 3 to 60, swept and returned, idempotent, saved and reopened; solve within twice the square tray.
- **Golden exports:** new `rounded-tray-card`, `rounded-tray-ply-strip`; `band-ply-hinge*` regenerated (the slit layout fix); every other case byte-identical.
- Unit suite: 599 pass, 7 skipped; typecheck clean.
- Browser: new `tests/e2e/wings.spec.ts` (Quick build's Rounded box in plywood: the radius raised, the strip with three hinges and a key, ready to cut; Workshop: a card tray's corners all made plain from the tray card; a plywood strip's closing seam moved). Full app suite (`--grep-invert classroom`): 97 passed, 0 failed, 57 skipped.

Limitations
- Concave rounded corners (a reflex vertex) are left open.
- A corner's lip on a many-sided base is narrowed to fit the flat net; very small radii on 6+ sides can leave too little lip (it is left off).
- The joint labels of a corner list kinds in the menu, but the corner's band (pattern, density) is set on its card only.

## Milestone 65 — round boxes ✅

Implemented (`PACKAGING_PLAN.md` §4.2, §4.5, §6.2; `src/model/round.ts`, `src/model/wings.ts`, `src/model/ops.ts`, `src/model/validate.ts`, `src/model/check.ts`, `src/easy/recipes.ts`, `src/easy/QuickRail.tsx`, `src/views/foldView.ts`, `src/ui/CornersUI.tsx`)
- **The seam flat** (`RoundShape.seam`, `withSeam`, `defaultSeam`): a chord where the outline's outward normal points at `at` (the back left), 12 / 16 / 20 mm wide by material. The rounded corner whose arc faces it is split: two rounded corners where the arc's tangents meet the chord's, and the chord's ends between them, sharp (edge `seam`); the rest of the outline stays on its circles. Added when a circle or oval is walled (`addTray`), kept by shape changes and resizing, and made from the start by Quick build's Round box (so the extrude ghost has a wall to show).
- **Runs** (`cornersOf`): a corner is now the run between two walls, through every point and zero-length edge in between: arcs (fillets of one circle merged) and creases (a sharp point turning at most 35°: where the seam flat meets the curve). A run may come back to its own wall (`a` = `b`: a round box's one wall). A stadium's end is one 180° arc; an oval's rim with a seam flat, five.
- **A band per arc** (`wingBands`): each from its arc's start, at the wall's offset in from the outline and its height; `pos` along the strip; `wingLength`, `wingStrip` (the strip with every band's pattern, and a score at each crease on card and corrugated). The fold view chains them (each band rides on the moves of those before it; a one-piece next wall on all of them). The bend checks take the first band that falls short.
- **What holds the bands to the base** (`Tray.curveKind`, `curveKindOf`, `curveKinds`; *Curved walls held to the base by* on the tray card): glue teeth (card; corrugated under walls at the edge), folded in onto the base in 3D, left off where a wall folded off the base would put them on it in the net; tabs through slots that follow the curve (corrugated walls standing in by a web; the slots 0.05 mm further in, since a flattened circle runs inside the true one); nothing. Plywood bands wrap round the base, cut back per arc. By default only round bases hold their bands (their walls are nearly all band).
- **Kinds:** a run back to its own wall cannot be one piece: card and corrugated glue it, plywood keys it shut.
- **Quick build:** *Box* · *Round* (`box-round`): a drag within a tenth of square is a circle, else an oval with the draftsman's ends; a circle at least twice `roundedMin` across, an oval's ends at least `roundedMin` round, grown about the drag's centre.
- Files: `check.ts` accepts `round.seam` and `Tray.curveKind`. English and Hebrew strings.

Verified
- `tests/roundbox.test.ts` (9): the seam flat in each material (its width, facing 135°, every other point on the circle); a stadium has none and two corners; a circle in card, corrugated and plywood is two panels, one corner from its wall back to itself (crease, arc, crease), its band ending exactly at the wall's start in 3D, its length the formula, no issues, flat, exported; card teeth folded onto the base and none near it in the net, one piece; corrugated tabs in curved slots with no slot too near the edge; a plywood circle keyed shut, the base cut back, slits; ovals (five bands, end to end in 3D and along the strip) and stadiums (one band per end), clean; idempotent, saved and reopened, resized and back; Quick build's recipe (circle, oval with ends of at least the minimum, a small drag grown).
- Updated `round.test.ts`: a walled circle has one wall, on its seam flat.
- **Golden exports:** new `round-box-card-circle`, `round-box-ply-circle`, `round-box-corr-oval`; `rounded-tray-ply-strip` regenerated (the base's cut-back is now sampled along the arc itself, a hair different); every other case byte-identical.
- Unit suite: 613 pass, 7 skipped; typecheck clean.
- Browser: `wings.spec.ts` gains Quick build's Round box in card (a circle with a 12 mm seam flat, one glued corner, ready to cut). Full app suite (`--grep-invert classroom`): 98 passed, 0 failed, 57 skipped.

Limitations
- Shapes, text and stickers are not drawn or picked on bands yet: put them on the wall's flat part (a round box's seam wall is narrow).
- In the fold view a crease does not straighten as the net opens (the strip shows its small kinks flat).
- A card oval's strip may be longer than a card sheet: it is reported (`val.tooBig`), not split (milestone 69).

## Milestone 66 — the pattern library ✅

Implemented (`PACKAGING_PLAN.md` §5.1–§5.3; `src/model/bendPatterns.ts`, `src/model/types.ts`, `src/model/geometry.ts`, `src/model/pieces.ts`, `src/model/wings.ts`, `src/model/validate.ts`, `src/easy/fix.ts`, `src/export/prepare.ts`, `src/export/bendTest.ts`, `src/ui/MaterialDrawer.tsx`, `src/ui/ExportDialog.tsx`, `src/views/bandMesh.tsx`)
- **Four more patterns:** *Perforated* (card, corrugated: staggered cut dashes a web from the band's edges; card reaches 0.75 of its pattern radius), *Kiss-scored* (corrugated: scores in the inner liner), *Wave slits* and *Diamonds* (plywood). Automatic's order: card smooth, scored, perforated; corrugated smooth, kiss, perforated; plywood smooth, straight, wave, diamonds.
- **Slit shapes on one rule** (`slitLike`): the links' free length and the closest column spacing are scaled per shape (wave 1.6 and 1.2, diamonds 2.2 and 1.3), so wave slits reach about 0.9 and diamonds about 0.77 of straight slits' radius, with columns further apart. Starting values, to calibrate with the bend test.
- **Cut paths:** a pattern's lines gain `paths` (open polylines: wave slits; closed: diamonds), carried as `ConnGeom.cutPaths` and `PanelExtras.paths` (never part of a board's outline or slots), into the net (`pathContour`: an open line or a hole), the fold strips, 3D and the bend test; kerf compensation shortens an open path as one chain and shrinks a diamond as a hole.
- **Kiss scores face up:** a piece with kiss-scored bends is mirrored in its box at export and labelled *THIS SIDE UP (kiss scores)* on the guide layer, in the student's language (`ExportLabels`).
- **The flute check** (`val.fluteBend`): a smooth corrugated bend whose axis lies across the flutes as its piece is laid on the sheet (net turn and placement); *Fix* perforates it. A corrugated round box's wall is now tab-and-slot by default, so its strip is its own piece with the flutes up the wall.
- **Bend test:** a pattern list beside *Download a bend test* (`mat-bend-test-pattern`).
- **Speed:** a band's pattern depends only on its numbers and is worked out once (`bandPattern`'s cache); the harness's `speedRatio` now times batches in turn and compares each side's fastest, so a ratio is no longer at the mercy of a busy machine.
- English and Hebrew strings.

Verified
- `tests/patterns.test.ts` (8): each material's patterns in order; diamonds reach tighter than wave slits, wave than straight; card perforations at 3.5 mm (dashes a web from the edges, at most 3 mm); corrugated kiss scores on a rounded tray at 14 mm, the export mirrored with its guide note, clean; wave slits as open paths and diamonds as holes, in the net and exported compensated; every reason (radius with its value, short, material) and Automatic's fallback; a corrugated rounded tray at 40 mm with bends across the flutes on two corners, fixed by perforating them; the bend test for every pattern.
- Updated: `wings.test.ts` (corrugated corners named only below kiss scores' reach: 6 mm), `roundbox.test.ts` (a corrugated round box's wall stands in by its web and meets its band within 1 mm at the seam).
- **Golden exports:** new `pattern-card-perf`, `pattern-corr-kiss`, `pattern-ply-wave`, `pattern-ply-diamond`, `pattern-ply-diamond-compensated`; `round-box-corr-oval` regenerated (its wall is now its own piece); every other case byte-identical.
- Unit suite: 625 pass, 7 skipped; typecheck clean.
- Browser: full app suite (`--grep-invert classroom`): 97 passed, 1 failed, 57 skipped; the failure (`settings.spec`, the start screen over the card after a reload under load) passed 9 times out of 9 run on its own.

Limitations
- The cut plan shows a kiss-scored piece as designed; only the file is mirrored.
- At a round box's seam a wall standing in from the edge meets its band within the web × tan(half the crease) (0.4 mm for corrugated): the closing lip or key takes it up.
- Pattern line spacings and slit factors are starting values: calibrate with the bend test.

## Milestone 67 — closures ✅

Implemented (`PACKAGING_PLAN.md` §7; `src/model/closures.ts`, `src/model/types.ts`, `src/model/ops.ts`, `src/model/seams.ts`, `src/model/geometry.ts`, `src/model/jointDefaults.ts`, `src/model/validate.ts`, `src/model/check.ts`, `src/ui/ClosureUI.tsx`, `src/ui/EdgeBar.tsx`, `src/ui/Inspector.tsx`)
- **Sealing** (`sealFor`, `sealOf`): a panel folded off a tray wall's top edge seals the box when its far edge reaches the opposite wall, from 3 mm short of its inside face to its outside face; the walls under its sides are found the same way. The same test runs on the grow ghost.
- **The closure joint:** while a lid seals its box, `reconcileClosures` (in solve, once frames are placed) keeps a connection of kind `closure` on it (`close:<lid>`), with the walls it covers (`covers`); its geometry (`closureGeom`) is the lid's settings made real, so nets, 3D flaps, export and the checks pick it up like any joint. Pulled short, the joint goes; the settings (`Design.closures[lid]`) stay and return with it; a lid deleted takes its settings.
- **What it covers:** no other joint is made between the lid and the walls it covers (`findOpenSeams` and `autoConnect` skip them, and remove an automatic one already there); the touching-but-not-joined check counts them joined.
- **Styles** (`closureStyles`): card *Tuck* (default), *Tuck with slit locks*, *Tab lock*, *Rests*, *Glued*; corrugated *Tab lock* (default), *Tuck*, *Rests*, *Glued*; plywood *Rests*.
  - The lip: on the lid's far edge, inset by the thickness and 0.5 mm each side, corners rounded 4 mm, scored at the fold, 30% of the lid's depth (12–22 mm) unless set; in 3D folded down inside the front wall.
  - Slit locks: 4 mm slits at the ends of the lip's fold into the lid; the dust flaps get a 3 mm shoulder.
  - Tab lock: a tongue (at most 25 mm, 30% of the lip) a wall's thickness and 4 mm past the lip, through a slot (tongue and clearance by lid thickness and clearance) where the lip ends on the front wall.
  - Dust flaps: on the side walls' top edges, up to 45% of the lid's width deep, tapered 15° at the hinge (clear of a hinge band's curve) and 8° at the front, relieved for the lip; in 3D folded in under the lid.
  - Thumb notch: a half-round of 9 mm in the front wall's top, at its middle.
  - Glued: a glue flap on the lid's far edge, inside the front wall.
- **Plain edge flaps** (`Panel.edgeFlaps`, `addEdgeFlap`, `setEdgeFlap`, `edgeFlapGeom`): a scored lip on any free edge of a card or corrugated board, tapered 30° at its ends; *Add a flap* on the edge's card.
- **Cards:** *Closes the box* on the lid's card (`closure-section`): what it reaches, the style, its help line, the lip, dust flaps, thumb notch. The grow card says when the ghost will close the box and with what (`grow-closes`).
- Files: `check.ts` accepts `Design.closures`, `edgeFlaps` and the `closure` kind. English and Hebrew strings.

Verified
- `tests/closures.test.ts` (7): a card lid at the front wall's inside face seals the box (both side walls found), a tuck closure with its lip and two dust flaps folded in 3D, no other joint or open seam with the walls it covers, no issues, flat, one piece, exported; pulled short it goes and pushed back returns with its settings (slit locks, thumb notch); corrugated's tab lock with its slot; rests and glued; plywood rests on its living hinge with nothing named; the lip's length rule; idempotent and reopened; plain edge flaps (scored, 15 mm out, none on plywood, removed).
- **Golden exports:** new `closure-card-tuck-lock`, `closure-corr-tab`; `band-card-score-r8` and `pattern-card-perf` regenerated (their lids reach the front wall, so they now close the box with a tuck); every other case byte-identical.
- Unit suite: 635 pass, 7 skipped; typecheck clean.
- Browser: new `tests/e2e/closures.spec.ts` (a card lid grown to the front wall: the grow card says it will close the box with a tuck flap; its card sets a tuck with slit locks and a thumb notch). Full app suite (`--grep-invert classroom`): 99 passed, 0 failed, 57 skipped.

Limitations
- The closing edge is the lid's far edge; per-edge roles (a lip on a side) are not offered yet.
- A corner glue flap beside a lid's band is clipped by the band's corner cut and can leave a sliver.
- Sealing is found for lids over tray walls only.

## Milestone 68 — glue-free joints and cartons ✅

Implemented (`PACKAGING_PLAN.md` §8; `src/model/seams.ts` `slitLock`, `src/model/cartons.ts`, `src/model/place.ts`, `src/model/flatnet.ts`, `src/model/closures.ts`, `src/model/ops.ts`, `src/model/materials.ts`, `src/model/check.ts`, `src/easy/actions.ts`, `src/easy/QuickRail.tsx`, `src/easy/mode.ts`, `src/ui/CornersUI.tsx`, `src/ui/TrayUI.tsx`)
- **Slit lock** (kind `lock`): offered just after every glue flap on card and corrugated (corners, edges on faces, grown boards at any angle). Its geometry is the glue flap's with tongues on the flap's far edge (one; two on a flap 60 mm or more): a neck (10 mm card, 14 corrugated, at most 35% of the edge) and a head wider each side (2 / 3 mm), 5 mm long on card, the other board's thickness and 4 mm on corrugated; in the other board, where the folded flap's far edge lies, a slit (card: one cut line) or a slot (corrugated: the flap's thickness and the clearance). It works on design-wide *Corners* too.
- **Open-base trays** (`Tray.base 'open'`): the base joins the guides (never cut or joined; its walls are not), the walls are not joined to it, and `planOpenTrays` makes the tray's fold plan a strip: each wall folds off the one before it in the base's order, from the wall after the glue seam (the corner nearest the back left), so three corners become folds (milestone 35's hinged corners) and one stays the corner joint: the manufacturer's joint. `fixFlatNets` leaves an open tray's plan alone.
- **Ends** (`Tray.top`, `Tray.bottom`):
  - Tuck top: a lid the tray keeps (`<tray>/top`, folded off the back wall's top edge, its depth fitted to the front wall's inside face on every solve: `reconcileTopLids`, `fitTopLids`), closed by milestone 67's closure.
  - Flapped ends (`end:<tray>:top|bottom`, closure joints derived by `endGeom`, kept by `reconcileEnds`): *seal* (front and back flaps meeting in the middle, side flaps a little under half the width); *snap* (the 1-2-3 bottom: the back flap over half the depth with a notch, the side flaps cut towards the front and hooked, the front flap with a tongue that locks under the back flap's notch); *tuck* (a reverse tuck bottom: the front wall's flap the whole depth with a lip, dust flaps on the sides). In 3D the flaps lie folded across the end, layer on layer, on the base's plane or at the walls' tops.
- **Cards:** the tray card's *Base*, *Top* and *Bottom* (`setTrayEnds`); Quick build's *Box* · *Bottom: Base · Snap-lock · Tuck* (a carton: open base, that bottom, a tuck top), only for four-sided card and corrugated boxes. An open base is not shown as a Workshop guide in Quick build.
- Files: `check.ts` accepts `lock` and the trays' `base`, `top`, `bottom`. English and Hebrew strings.

Verified
- `tests/cartons.test.ts` (8): a card tray's four slit-lock corners (a flap and a tongue on one wall, a slit in the other, no glue, clean, flat, exported); corrugated slit locks' slots clear of the edges; an open base (never cut; three folds and one glue seam; one piece of the four walls; flat; clean); a reverse tuck carton (the lid's closure, three bottom flaps, one piece, one glue seam); a tuck top with a snap-lock bottom (four shaped flaps, one piece); seal ends top and bottom; back to a cut base; idempotent and reopened.
- Updated `jointdefaults`, `joints`: the slit lock after each glue flap.
- **Golden exports:** new `lock-card-tray`, `carton-card-tuck-snap`, `carton-card-reverse-tuck`, `carton-corr-seal`; every other case byte-identical.
- Unit suite: 647 pass, 7 skipped; typecheck clean.
- Browser: `closures.spec.ts` gains Quick build's Box with a snap-lock bottom (an open base, snap bottom, tuck top, ready to cut). Full app suite (`--grep-invert classroom`): 100 passed, 0 failed, 57 skipped.

Limitations
- **The snap-lock bottom's proportions are not proven:** the plan called for cutting three sizes in card and corrugated 1.6 before this milestone; there is no laser here. Cut one and try it before a class set (the tray card says so).
- Flapped ends and open bases need four walls; ends on other shapes are not offered.
- A crash-lock (pre-glued) bottom is not offered.

## Milestone 69 — splitting and nesting ✅

Implemented (`PACKAGING_PLAN.md` §9; `src/model/split.ts`, `src/model/nest.ts`, `src/model/pack.ts`, `src/model/pieces.ts`, `src/model/ops.ts`, `src/model/check.ts`, `src/model/validate.ts`, `src/export/prepare.ts`, `src/export/batch.ts`, `src/ui/SplitUI.tsx`, `src/ui/Connections.tsx`, `src/ui/Inspector.tsx`, `src/ui/MaterialDrawer.tsx`, `src/views/Plan2D.tsx`)
- **Cutting a net at a fold:** a grown crease (not a band, not a closure's hinge) can be cut. The cut fold becomes the joint a wall cut as its own piece gets: a tray wall the design's wall-to-base joint (`ownKind`), any other board a glue flap on the same edge (it keeps its place). The kind is re-derived on every pass (`applyCut`, after the joint's own kind is fitted); `Connection.split` marks it.
- **Only when it must** (default, `Design.split` absent): after a solve, `fitSplit` looks at each net as it would be whole (every cut fold folded again) and, where it does not fit its sheet inside the margin (turned where the grain allows), cuts the fold that most reduces the overflow (then the one leaving the smallest largest part) until every part fits; the cuts are `Connection.autoCut`, kept while they still help and dropped once the net fits whole again (then solved again; at most three rounds). A fast look (the boards' outlines only, 40 mm of slack) skips all this for nets well inside their sheet. *Never* keeps every net whole (the export check reports it too big, as before). *To save material* also offers *Save material* (offered in every mode but *Never*).
- **Pins:** each fold's card (and the folded board's card) has *Automatic · Keep whole · Cut here* (`Connection.cut`), which the app obeys; a note says why a fold is cut and how the parts join.
- **Copies:** a part cut off a net is cut as many times as the net (`quantityRoot`); the board card's *Copies to cut* edits the net's number.
- **Save material** (`planSaveMaterial`): a beam search (three wide, three cuts deep) over the free folds, each cut set scored by its parts' boxes laid out by the bounding-box packer: sheets, then the sheet area the layout takes (whole sheets and the used band of the last one), then the number of cuts. The best is then checked for real (the design solved with the cuts, laid out as the cut plan lays it out); it is offered only when it takes fewer sheets or at least a twentieth of a sheet less. The preview reads *16 pieces, not 4. 1 sheet, not 2 sheets. 3 more glue joints.*; *Apply* pins the folds as cut, in one undo step.
- **True-shape nesting** (`nest`): each piece becomes a bitmap of cells (about 200 000 per sheet, never finer than 1 mm) of every cell its outline touches, grown by half the spacing; turned 0° or 180° (and 90°/270° where the grain allows), never mirrored. Largest first, each at its highest place (the sheet fills from the top left), choosing either the turn that sits highest or the one that reaches least far right; three orders × two choices, the best layout kept, and never more sheets than the bounding-box packer (its layout is used then). Free-run arrays per row make a test skip straight past what blocks it. *Nest* in the cut plan stores the layout (`SheetPlacement.nested`, with the piece's size): it is kept as manual moves are, until the piece changes size (then the box packer places it again). *Repack* drops it without asking. Placements can now turn 180° and 270°.
- **The yield report** in the cut plan: sheets, percent used, metres of cut, pieces, glue joints, with *Nest* and *Save material*.
- **Settings:** *Material & sheet* → *Split a net into pieces: Only when it must · To save material · Never*.
- Files: `check.ts` accepts `cut`, `autoCut`, `split`, `Design.split`, rotations 180/270 and `nested`. English and Hebrew strings.

Verified
- `tests/split.test.ts` (9): a card tray net taller than the sheet is cut into pieces that fit (no *too big*); one that fits is not cut; *Never* keeps it whole and reports it; lowered, the app's cut goes; *Keep whole* moves the cut elsewhere, *Cut here* cuts a small tray, the cut part keeps the net's copies; idempotent and reopened; *Save material* on a class set of four 60 × 60 × 50 trays: 2 sheets → 1, the reported gain equals the one measured after *Apply*, idempotent; nothing to save without folds; kept folds are never in a plan.
- `tests/nest.test.ts` (3): on twenty designs (the golden designs as a class cuts them, card and corrugated trays in sets of 4–12) nesting never takes more sheets than the box packer and takes fewer on five (round box 2 → 1, carton 2 → 1, square trays 2 → 1, 3 → 2, 4 → 3); every pair of nested pieces at least the spacing apart (polygon distance), inside the margin, only 0°/180° on corrugated; a nested layout checks clean and goes back to the packer when a piece changes size.
- Updated `repro-margin-overflow`, `flatnet` (L base), `cartons` (back to a cut base): those nets are longer than the sheet, so they now keep `split: 'never'` to test what they were written for.
- **Golden exports:** byte-identical.
- Unit suite: 659 pass, 7 skipped; typecheck clean.
- Browser: new `split.spec.ts` (a class set's yield report, *Save material* 2 sheets → 1 with one undo step, *Nest*; a tall tray cut to fit, *Keep whole* moves the cut). Full app suite (`--grep-invert classroom`): 100 passed, 2 failed, 57 skipped; both failures then fixed or passed alone: milestone 35's L tray (the flat-height probe cut its net to fit the sheet; the probe now never splits) and the gizmo steps (ran during a dev-server reload), both pass on a rerun.

Limitations
- **A board longer than the sheet with no fold to cut is not split across** (a puzzle key or a glued lap, §9.1): the export check still reports it too big.
- Nesting runs on the main thread, on demand (0.1–0.5 s for the designs above), not in a Worker; copies are not tried as an interlocked pair explicitly (each copy tries 180° on its own, which finds the same interlock when there is one).
- Nesting gains little on box nets with glue flaps on every arm (their flaps keep them from interlocking); it helps most with copies and pieces of different shapes.
- *Save material* compares bounding-box layouts (as the sheet meter shows them before nesting); a nested layout may do better still.
- A fold on a rounded tray's corner band (a wing) or with a radius is never cut.

## Milestone 70 — dividers that find their own ends ✅

Implemented (`PACKAGING_PLAN.md` §6.1, `DIVIDERS_PLAN.md`; the parked branch's milestone 44 commits `3dacd3c`, `70a5e69`, `d9336cf`, and `src/model/dividers.ts`, `src/model/ops.ts`, `src/model/seams.ts`, `src/model/geometry.ts`, `src/model/split.ts`, `src/ui/PlacedUI.tsx`)
- **Milestone 44, rebuilt by taking it:** a divider is a line drawn on its base (`Panel.divider` `{ at, rot, reach }`), a standing board whose ends `reconcileDividers` finds on every solve, in creation order (the far face of the first board beyond its reach; dividers within the reach crossed with half-laps, down to 30°); the Divider tool (`D`) in both modes with grid, Shift 30° and Alt free snapping and the ghost's end marks; the card's *Clear behind*, *Angle* and *Ends* ‹ ›; compartments as regions; schema 10 migrating grown dividers in place (golden exports byte-identical). Its tests (`dividerEnds`, the updated `dividers`, `arrange`, `joints`, `quickrecipes`, … and `e2e/dividers.spec.ts`) came with it. Conflicts only in `ops.ts` imports, `recipes.ts` imports, `Inspector.tsx` and the docs.
- **Ends on curved walls (new):** `footprints` also returns each tray corner's band as facets (one per 7.5° of its arcs, between the band's two faces at the wall-before's distances from the base's edge, from the model like the walls'). An end meeting one stops at the band's inner face; its joint is derived (`bandend:<divider>:<end>`, `Connection.bandEnd`, kept by `reconcileDividers` like closures): a glue flap on the divider's end edge on card and corrugated (`flapOn`, milestone 67's flap), a slide fit on plywood. The card names it *The curved corner of …*.
- **Fixed limitations of milestone 44:** a line run into a corner (another wall entered before it leaves the first) stops at the corner's inner point (`DividerEnd.corner`); a turn that would meet a board under 30° is refused (`rotatePlaced` returns false and leaves it), so no divider is left with an unjoined end.
- **Splitting (milestone 69) counts corner bands:** the size estimate now includes the band strips a wall carries, so a card round box whose strip makes its net taller than the sheet is cut (base and strip) as it should be.

Verified
- `tests/dividerEnds.test.ts` (26): milestone 44's 20, and a divider across a round box in card, corrugated and plywood joined at both ends on its band (glue flaps, slide fit), stopping inside it, no overlap, idempotent, reopened; a rounded tray's divider near a corner ends on both bands, one on the straight on the walls, deleting it removes its band joints; a line into a corner; a turn under 30° refused.
- **Golden exports:** byte-identical (including the organiser and the v7 divider file through the migration).
- Unit suite: 685 pass, 7 skipped; typecheck clean.
- Browser: the parked branch's `dividers.spec.ts` and updated `boards`, `quick`, `joints`, `refine` specs came with it. Full app suite (`--grep-invert classroom`): 106 passed, 0 failed, 57 skipped.

Limitations
- A divider's glue flap on a band is not drawn in 3D (it is cut and scored in the file).
- Dividers still stand at 90° to the base and are straight (curved dividers are out of scope).

## Milestone 71 — lids: telescoping, matched walls, arched ✅

Implemented (`PACKAGING_PLAN.md` §6.3; `src/model/lid.ts`, `src/model/match.ts`, `src/model/ops.ts`, `src/model/closures.ts`, `src/model/seams.ts`, `src/model/check.ts`, `src/ui/CornersUI.tsx`, `src/ui/TrayUI.tsx`, `src/ui/Inspector.tsx`, `src/model/snap.ts`)
- **Telescoping lid** (`Tray.lidOf`, `addLid`, `reconcileLids`; from the parked branch's milestone 46): a shallow tray of the box's outline grown by its wall's thickness and the clearance, turned over on top of it, rim 12 mm, re-made from the box on every solve (the box resized, the lid follows). Rectangles and polygons grow edge by edge, rounded corners' radii by the gap; a round base (circle, oval) is made again at the grown size (`roundPts`: an offset four-centre oval is one, radii + gap) with its seam flat, so the lid's band runs all round as the box's does. *Add a lid* on the tray card; the lid's card says it is one.
- **Matched walls** (`WallSketch.match`, `src/model/match.ts`; the parked branch's commit `1356542`, taken): a wall's top follows a parallel wall facing it, projected through 3D (an off-centre arch is not mirrored); editing either edits the shared top; *Own outline* keeps the shape and drops the link; *Copy outline from…* for any wall once; facing walls' top points are outline snap targets. Its references to bent walls (the parked model) are gone.
- **Arched lid** (`addArchedLid`, new on this branch's bands): folded off the back wall's top with a radius, a 4 mm flat strip across, and folded down with the same radius into a flap that tucks inside the front wall. The arch keeps the box's envelope (milestone 63): its radius is half the inside depth less the strip, never under the material's pattern radius, and leaves the flap at least 5 mm above the base (a deeper or lower box gets a flat-topped barrel; one too low is refused, and the button says why). The end walls are cut to the arch where the bands cross them (milestone 63's `bandCrossings`). Corrugated takes a perforated (or kiss-scored) bend where that reaches; the hinge wall's tab-and-slot corners become glue (the arch takes their top). No closure is derived for it (`sealOf` skips a lid with a flap off its far edge); its flap and sides count as covered like a closure's (`closureCovers` via `archLids`), so they are not reported unjoined. *Add an arched lid* on the tray card.
- **Fixed on the way (milestone 63):** a joint on a board a band cuts back (a radiused lid's hinge wall) kept its flaps, slots and scores past the cut: the corner glue flaps of such a wall ran up into the band. `connectionGeom` now clips every joint's geometry to what the band leaves, on both boards (through 3D for the other one's).
- Files: `check.ts` accepts `Tray.lidOf` and `WallSketch.match`. English and Hebrew strings.

Verified
- `tests/lids.test.ts` (14): telescoping lids in card, corrugated and plywood (sizes, above the box, following a resize, no overlap, idempotent, reopened; one lid per box, none on a lid); a round corrugated box's lid round with its band; a rounded box's lid with radii + gap. Arched lids in card, corrugated 1.6 and 4, plywood, at 120 × 80 × 60 and 150 × 120 × 50: two bands that fit, the end walls cut where they cross, no closure, a clean check, one piece on card and corrugated, idempotent, reopened; a plywood box 40 mm tall refused with the design unchanged.
- `tests/matchedWalls.test.ts` (6, from the parked branch).
- **Golden exports:** `band-card-score-r8` and `pattern-card-perf` change, as intended: the back wall's corner glue flaps stop at the band's cut-back instead of running into it (and a stray sliver on the side flap goes). Every other case byte-identical.
- Unit suite: 705 pass, 7 skipped; typecheck clean.
- Browser: new `lids.spec.ts` (the tray card's arched lid and telescoping lid, the lid's card, matched walls' card). Full app suite (`--grep-invert classroom`): 109 passed, 0 failed, 57 skipped.

Limitations
- The arched lid runs back to front only (from the wall on the base's e2); the flap is friction-held inside the front wall (glue it for a permanent box). The end walls' arched tops are their cut-back corners: the arch's sides rest on them unglued.
- A telescoping lid's rim is 12 mm; change it with the lid tray's height. Lids are Workshop only (Quick build has none).

## Milestone 72 — final verification ✅

Everything re-run on the final commit of `PACKAGING_PLAN.md` (milestones 61–72):
- Unit suite (`npx vitest run`): 705 pass, 7 skipped (the optional Python DXF reader check, no `ezdxf`); typecheck clean (app and Worker); `npm run build` succeeds (one ~1.7 MB chunk, as before).
- Golden exports: byte-identical except the two listed at milestone 71 (`band-card-score-r8`, `pattern-card-perf`: a fix).
- Browser, app (`--grep-invert classroom`): 109 passed, 0 failed, 57 skipped. Classroom (the real Worker with local D1 and R2, `--grep classroom`): 4 passed, 0 failed. Together the whole browser suite passes.

What the plan delivered, in one line each
- 61 Derived data outside the design (frozen designs, `memo`, `settle`), the harness (idempotence, round trip, sweep and return, lost shapes, speed ratios).
- 62 Round outlines (rounded corners, circles, ovals, stadiums), the 5 mm clamp, arcs back at export, bend limits.
- 63 Folds with a radius: bands that keep the box's envelope, boards across them cut back, scores and living-hinge slits.
- 64 Rounded tray corners as bands carried by the wall before (one piece, glued lip, key or plain); plywood strips keyed shut and for the sheet.
- 65 Round boxes: a seam flat, a band all round, glue teeth or curved slots to the base.
- 66 The pattern library (smooth, scored, perforated, kiss-scored, straight / wave slits, diamonds), density from the radius and material, the bend test.
- 67 Closures: a lid that reaches the opposite wall closes the box (tuck, tuck with slit locks, tab lock, rests, glued; dust flaps, thumb notch, lip).
- 68 Slit-lock joints (no glue), open-base trays (tubes) and carton ends (tuck, snap-lock 1-2-3, seal).
- 69 Splitting a net at a fold when it must or to save material (pins, the planner's stated gain), true-shape nesting, the yield report.
- 70 Dividers drawn as lines that find their own ends, now also on curved walls; corner and shallow-turn fixes; schema 10.
- 71 Telescoping lids, matched walls, arched lids; joints clipped where a band cuts a board back.

Changes from the plan (each is recorded at its milestone)
- Nesting runs on the main thread, on demand, not in a Worker; it takes 0.1–0.5 s here for class sets of up to 32 pieces. Copies try 180° one by one rather than as an explicit interlocked pair.
- A single board longer than its sheet is not split across with a key or lap; it is reported.
- The arched lid is two radiused folds with a narrow strip between (a barrel when the box is deep or low), back to front only; the end walls' arches are the band crossings' cuts.
- The snap-lock bottom was built without the planned test cuts (no laser here).

Resolved since they were listed
- Milestone 65's card oval strip too long for its sheet: such a box is now cut at its base fold so the strip and base are separate pieces (milestones 69–70); a strip longer than the sheet itself is still reported (a band is never cut).
- Milestone 67's sliver beside a lid's band: corner flaps now stop at the band's cut-back (milestone 71).

Needs the owner (cannot be done here)
- **Real cuts** on the school's materials, before a class set: the bend test strips (card scores and perforations, corrugated kiss scores, plywood slits: the spacings are starting values); a snap-lock bottom in card and corrugated 1.6 (three sizes); slit-lock tongues; a tuck closure's lip fit; an arched lid; a nested sheet (spacing and kerf).
- **LightBurn**: import a nested, kiss-scored and mirrored file once on the classroom machine (layer colours, the *THIS SIDE UP* label).
- **Safari and a Chromebook**: nesting and solve speed on a slow machine (*Nest* and *Save material* run on the main thread), and the 3D bands with software WebGL.
- **Hebrew**: the new strings of milestones 61–72 should be read by a native speaker (plan §12, decision 12).

## Maintenance round (after milestone 72) ✅

Reported on the live site: the 3D view out of step with edits, general instability, floating stage labels, and a busy contextual card. Then: Round and Rounded as rail buttons of their own, and a check that each feature of milestones 61–72 exists for a student. Every fix has a test that fails without it (`tests/e2e/maintenance.spec.ts` for the interface).

3D view
- **A joint changed on the card, the cut plan changed, the stage did not.** The selected panel's highlight (drei `Edges`) reused one fat-line buffer whose draw count three.js fixes the first time it is drawn: after a joint change it kept the old outline, or drew stray segments across the stage. Every outline is now its own (`MeshEdges`, panels and ghosts). A panel's slab is rebuilt whenever its 2D outline changes (`panelShape` / `shapeKey`), not when a hand-kept list of inputs changes: a neighbour's slots and a fold-over's lock slots were missing from that list.
- **Rich quality turned the stage grey**: its output pass tone-maps the whole picture, background included. The background is drawn in the colour that tone-maps back to `#eef1f5` (three's ACES curve inverted).
- Plain edge flaps (milestone 67) show on the stage, flat in the board's plane as on the cut plan; a reverse tuck bottom's lip turns up inside the back wall instead of running 18 mm past it; bend beads and bands take their board's own material colour.
- The view cube sits above the view buttons on the left in Hebrew.

Floating stage elements
- Zoomed in, a ghost's ✓/✕ bar and a standing board's flip badge slid under the contextual card, seen but not clickable. They follow their point but are kept in the part of the stage the rail, the card and the bottom bars leave free (`StageHtml keepInStage`). Dimension, compartment and angle labels hide while their box would be under that chrome (`hideUnderChrome`). Both look again on the frame after they first appear (the stage draws on demand).
- Stage cards follow the interface direction: in Hebrew the polygon card hid behind the settings card.
- The bottom hint wraps clear of the corner cards and stacks under the fold slider; Round, Rounded and Regular show their own hint.
- The top bar overflowed between 1000 and 1180 px (Download and the language off the bar, both directions): the compact bar now starts at 1180 px. The top bar spec covers 1024, 1100 and 1180 px.

The contextual card
- Sections 14 px apart, fields 10 px, buttons 8 px; lists of big buttons no longer 4 px apart. Multi-selection cards are sections (Group size, Align, Distribute) and say why instead of showing greyed grids; Joints (advanced) is one header with a count; Edges lists only edges a board can still grow from. A field whose control does not fit wraps it under its label; Quick build's Box footprint picker (130 px out of its card) is a 2 × 2 grid.

Round and Rounded
- Rail buttons of their own (`tool-round`, `tool-rounded`, icons of a round and a rounded board); the Polygon card offers click corners and Regular only, and G goes back to polygon corners. Underneath it is still the one drawing tool.

Milestones 61–72, driven through the interface
- Works: rounded corners and round bases, folds with a radius and the pattern library, curved tray walls, Quick build's Round and Rounded boxes, closures, slit locks and carton ends, splitting, Save material, Nest, dividers on round boxes, telescoping lids, matched walls, arched lids.
- Fixed:
  - Workshop could not wall a circle or oval (Extrude: "each of the 0 edges", no ghost, no ✓): the ghost now previews the seam flat `addTray` makes (`withSeam`), with a ribbon along curved edges.
  - An arched lid's end walls kept a column as wide as the material beside the arc (0.5 × 37.5 mm on card; on plywood a stick cut as its own piece): the band's crossing cut now carries on past the box's faces.
  - A card box with a tuck lid (Quick build's Box and Lid) was "too big for the sheet" and not cut, and Quick build's Fix shrank the box, losing the closure: `fitSplit` measured outlines plus 40 mm, not the flaps and lips. It measures what the cut plan cuts now.
  - Check messages named boards by number ("The bend between 3 and 4"); walls on rounded bases were "Wall 1, 24, 47, 70"; "close the box with a Rests on the walls", "1 pieces"; the glue joint count counted finger joints and slit locks, not glued corners, nor copies; the export dialog counted boards as pieces; a divider in a round box snapped to 45°; Quick build's lid card hid the closure style behind More….
- Not changed here: shapes cannot be drawn on a band (listed below); on corrugated, the automatic bend pattern can choose Smooth across the flutes and the check then asks for a Fix per corner (choosing well needs the sheet layout).

Tests
- `wings.spec` read `__cutforge.issues()`, which did not exist, so its "no bend issue" check could not fail: the hook exists now. `slice.spec` and `settings.spec` reloaded before the autosave had run.
- Goldens: `band-card-score-r8` and `pattern-card-perf` are regenerated. Their designs were too big for a card sheet and stayed whole; they are now cut in two. `bands.test`'s radius-8 case uses a box that fits.
- Stability: seeded random interaction runs (1,100 random clicks, drags, tool and view switches, undo and redo) with no page error or crash card.
- Final run: unit suite 716 pass, 7 skipped; typecheck clean; `npm run build` succeeds; browser, app (`--grep-invert classroom`): 129 passed, 0 failed, 57 skipped (screenshot specs). The classroom specs (they need the Worker) were not run; nothing in the Worker or the teacher view changed.

## Milestone 73 — Quick build catches up ✅

Implemented (`LIDS_LINES_PROJECTS_PLAN.md` Part E, §10; `src/easy/lid.ts`, `src/ui/LidUI.tsx`, `src/ui/Pictures.tsx`, `src/easy/features.ts`, `src/easy/actions.ts`, `src/easy/recipes.ts`, `src/easy/QuickRail.tsx`, `src/easy/missions.ts`, `src/model/names.ts`, `src/ui/SplitUI.tsx`, `src/ui/DesignSettings.tsx`, `src/ui/ExportDialog.tsx`, `src/views/View3D.tsx`). No model change; no schema change.
- **One lid per box, made one way** (`boxLid`, `setBoxLid`, `lidWhy`): the engine's lids (a cap, a tuck top, a living hinge, an arched lid, a carton's flaps, a board grown across with fingers) read as *None · Lifts off · Hinged · Arched · Fixed · Flaps*. `setBoxLid` replaces a box's lid in one edit, removes every board and joint of the old one, and moves the shapes on its top to the new top (those that no longer fit are counted on the card). *Hinged* is the back wall's tuck top in every material: a tuck lid on card, a tab lid on corrugated, a living hinge on plywood, offered only where its bend fits (tried on a copy; the answer is kept per box shape).
- **The *Lid* section** replaces *Add a lid* and *Add an arched lid* on a box's card, and shows on its lid's card too, in both modes: *None · Lifts off · Hinged* as pictures (Workshop adds *Arched*, and *Fixed* when the box has one). A choice that cannot be made is greyed and says why when tapped (*A carton closes with its tuck top*, *Too small for a living hinge in this material*). *Select the lid* goes to the lid's card, where a folded lid's closure style stays.
- **Box** (Quick build): *Footprint* and *Kind* as pictures. *With a lid* makes the box and its cap in one ✓ (one undo step); *Carton* a tube with a tuck top and a bottom that snaps shut (greyed on plywood and on footprints other than a rectangle, with the reason). The kind last made is remembered per browser (`ViewPrefs.boxKind`); Workshop's Extrude is unaffected. A carton's card has *Bottom: Snaps shut · Tucks in · Flaps to glue* as pictures and none of the *Base / Top / Bottom* lists.
- **Wall / lid** across a box's top (Quick build): when the ghost would close the box, its bar says *Closes the box: a lid that lifts off* (plywood) or *a hinged lid* (card, corrugated) and ✓ makes the box's lid with `setBoxLid`. It can no longer finger-joint or glue a box shut. Elsewhere it is a wall, as before (`quickWallRecipe`).
- **The feature table** has rows for milestones 61–72 (`lid`, `lid.advanced`, `tray.ends`, `tray.corners`, `bend`, `edgeFlap`, `match`, `split`, `yield`, `saveBoard`, `saveBoard.steps`, `joints.noGlue`, `export.kerf`) and a list of every card section with its feature (`SECTIONS`); the cards ask for them. Quick build no longer shows a fold's bend radius, pattern and lines, a tray's rounded-corner lists, the carton lists, a closure's lip, dust flaps and thumb notch, *Add a flap*, *Match top with*, a fold's cut choice, the yield line, *Nest*, *Save material* or the kerf choice. All are under *More…*.
- **No glue**: one switch in the settings card's *Joints* (card and corrugated) that slit-locks every corner. **Use less board** over the cut plan: nests the pieces (one undo step), then offers the folds to cut that would save board in one popover (*Now 2 sheets. Can be 1 sheet, with 3 more glue joints.* · *Do it* · *Leave it*), or says *This is already the least board*. Workshop has it beside *Nest* and *Save material*.
- **The download** in Quick build is nominal and says where the kerf is set (*Kerf 0.1 mm is set on the laser*).
- **Words and names**: a footprint's second size reads *Depth* and a box's walls *Height* in Quick build; a lid is *Lid*, a cap's walls *Front lid rim* … (or *Lid rim 3*), an arched lid's flap *Lid flap*, in both modes (they were *Panel 6* and *Wall 1*).
- **Missions**: the goal *A lid* counts a box's lid however it was made.
- English and Hebrew strings; unused strings of the old Box bottom and lid buttons removed.

Verified
- `tests/quickTable.test.ts` (5): every card section has a test id listed with its feature; every listed section exists; a section whose feature Quick build hides or chooses asks for it; every such feature is asked for; the features by state are spelled out. Checked by removing the bend card's gate: two of the tests fail.
- `tests/boxLid.test.ts` (14): each kind of lid read (cap, tuck top, living hinge, arched, flaps, a finger-jointed board as *Fixed*, a short flap as none); names; from each lid to each other in card, corrugated and plywood (nothing of the old lid left, the same boards, joints and check as making that lid on a fresh box, idempotent, reopened); shapes carried and counted; the reasons (a carton, a 60 × 40 × 30 mm plywood box for the living hinge and the arch) and a probe that changes nothing; Wall / lid across the top the same as the *Lid* section in every material; Box *With a lid* and *Carton*; the mission goal.
- `tests/fuzz/quick.test.ts` gains the Box's kind and the *Lid* section (a choice offered is made, nothing of the old lid left). At 150 sessions it found one bug, fixed with its own test: a board grown off a carton's tuck lid stayed behind when the lid was replaced. `setBoxLid` now also refuses a lid other than its tuck top on a carton, as the card does.
- Unit suite: 735 pass, 7 skipped; typecheck clean (app and Worker).
- **Golden exports:** byte-identical (nothing in the model changed).
- Browser: new `quick-revised.spec.ts` (7): a plywood box with a lid in one drag and ✓, its lid changed to *Hinged*, then *None*, then made again with Wall / lid, in English and Hebrew at 1400 and 1024 px; a card carton's card, its bottom, its lid's card, *No glue*, *Use less board* and the download, in both languages, with nothing Quick build hides on screen; Workshop's *Lid* section with *Arched* and every list still there. `quick.spec`, `lids.spec`, `closures.spec` and `maintenance.spec` follow the new controls (the cramped-buttons check treats a picture row as one control, as it does a segmented one). Full app suite (`--grep-invert classroom`): 135 passed, 1 failed, 61 skipped (screenshot specs); the one failure was that cramped-buttons check, which passes since (re-run with `quick-revised` and `lids`: 18 passed); the classroom specs (they need the Worker) were not run, and nothing in the Worker changed. Screenshots: `docs/lid-shots/` (`SHOTS=1`, `lid-shots.spec.ts`).

Limitations
- *Lifts off* is the cap only, and *Automatic* is not yet a choice (milestone 74). The ghost of Wall / lid shows a board across the top, not the cap it will make; its bar says what ✓ makes.
- On card and corrugated a hinged lid is on the back wall, whichever top edge Wall / lid was used on.
- The 3D stage's dimension labels still read *W / H* for a footprint.
- Locks and *Open / Close* come with milestones 75–77.

## Milestone 74 — the net and 3D in step ✅

`ROADMAP.md` (which merges `UI_CLEANUP_PLAN.md`, `LIDS_LINES_PROJECTS_PLAN.md` and `PACKAGING_AND_LEARNING.md`), cleanup plan Part 1. Each fix came after a test that failed without it.
- **Slit locks**: each tongue folds with its flap in 3D (it was cut but never drawn), and each card slit shows as a dark line on the other wall; corrugated slots were already holes.
- **Closures**: a tab lid's tongue folds down with its lip.
- **Curved walls**: a round box's tabs fill their curved slots in the base; a plywood strip's key sits in its socket; a divider's glue flap on a band is folded against the band (it had no 3D side). A band's arc is drawn in about 4° steps, so a round box is round.
- **The check (1.4)**: `tests/netIn3d.test.ts` runs every template in every material, rounded and round boxes, closed boxes, cartons, slit-lock trays, dividers ending on bands and the hand-built golden designs: whatever a joint adds to the net is drawn in 3D. It found the problems above (19 designs failing before).
- **Dividers narrow on the cut plan (1.3)**: not reproduced. Driven in the browser (template, the D tool, Quick build, rectangular, rounded and round boxes, card and plywood) the pieces were as long as their boards. A test keeps it so; it needs the design the owner saw.

Verified: unit suite 811 pass, 7 skipped; typecheck clean; golden exports byte-identical; browser `wings`, `round`, `closures`, `dividers`, `bands`: 14 passed. Looked at in the browser: a card slit-lock tray at mid-fold, rounded and round boxes in card and plywood.

## Milestone 75 — one Shapes tool ✅

`ROADMAP.md`; `UI_CLEANUP_PLAN.md` Part 2. The Workshop rail is *Select · Shapes · Divider · Text · Import* (ten buttons before). Shapes opens its footprints (Rectangle, Rounded, Circle, Polygon, Regular) under its button; its card's operators lead with **Board**, then cut, engrave, score and add; Standing is offered under Board for the rectangle. Board drawn on a board makes a board lying on it for every footprint (`addPlacedOutline`); another operator drawn on the floor makes nothing and the card says so. P, P P, R, U, C, G keep working. Import SVG with Board makes a board from the outline. Quick build's rail is unchanged.
- Tests: `tests/shapesTool.test.ts` (16): every footprint × operator draws with the tool it stands for and is read back; a fresh session starts on Board; the cut plan has no Board or polygon; a polygon, round and rounded board placed on a face, flush; a crossing polygon refused. The browser specs that clicked the old buttons (`boards`, `round`, `maintenance`, `polygon`, `trays`, `quick`, `refine`, `shots`, `panel-shots`, `tour`) go through the new controls.

## Milestone 76 — lids beside the box ✅

`ROADMAP.md`; `UI_CLEANUP_PLAN.md` Part 3 with `LIDS_LINES_PROJECTS_PLAN.md` §3.5 brought forward. A lid of its own lies beside its box, rim up, front right, 20 mm clear, moved along to a free spot, kept where the student drags it (`Tray.lidAt`). A folded lid is shown opened back. The *Lid* section has **Put on / Take off** (a cap) and **Close / Open** (a folded lid): view only, not saved. A lid shown away from its place cannot be drawn on until shut; selecting it shows it where it is. Dust flaps stay on their side walls when the lid opens.
- Tests: `tests/lidPose.test.ts` (5): beside, put on (lands on the on-box pose), picked stays beside, on while going together; moving a cap changes no piece and Put on still lands it; a new lid skips a board in its way; a folded lid in card and plywood is open by default, shut when closed, picked, folding or going together, and the design is never changed. `tests/lids.test.ts` follows the new pose. Browser: `lids.spec` gains the Put on and Close controls.
- Golden exports byte-identical.

## Milestone 77 — grow that closes the box ✅

`UI_CLEANUP_PLAN.md` Part 5. When the grow ghost would close a box, whatever its joint, the grow card shows *Closes the box* with what ✓ makes as pictures: on card and corrugated each closure style or a lid that lifts off; on plywood *Hinged* (living hinge, where it fits), *Lifts off* or *Fixed*. One ✓, one undo step; the ghost's bar says what it makes.
- Tests: `tests/growCloses.test.ts` (12): the choices per material and joint (finger, tab and slot, the design's), each choice made gives that lid and passes the export check, idempotent; a ghost short of the far wall closes nothing. Browser: `grow-cleanup.spec.ts`.
- Not done: *Rests* on plywood (it is the Flat lid of milestone 79) and boxes built from boards without a tray.

## Milestone 78 — grow made easier, a quieter interface ✅

`UI_CLEANUP_PLAN.md` Parts 4 and 6. The height arrow snaps to and names the far wall and the neighbours' heights; the grow card is height, *Closes the box*, and one *More…* row; the settings card folds to its header once there are boards; the view cube and buttons are one cluster; the bottom hint says how to grow an edge and the card no longer repeats it; *Edges* starts closed with its count.
- Found and fixed on the way: a spec that selects an edge by number crashed the new closing check; the view settings opened under the cards once the cluster grew; the Shapes card's operators dropped a shape still waiting for ✓; Import with a board selected made a board instead of a shape on it (both milestone 75).
- Tests: `growCloses.test.ts` height marks; browser `grow-cleanup.spec.ts` (first visit: folded settings, More…, the hint, Edges).

## Milestone 79 — the lid generator: Cap and Flat ✅

`LIDS_LINES_PROJECTS_PLAN.md` §3.2 (milestone 74 there). *Lifts off* has a *Kind* row: **Cap** or **Flat**, the one *Automatic* makes marked, the other greyed with its reason where it cannot be made. A Flat lid is one board beside the box, held on the walls' tops by tabs through slots worked out in its pose on the box; plywood makes one by default (Quick build's *With a lid* too). A cap's rim can be *Shallow*, *Half* or *Full*.
- Tests: `tests/lidKinds.test.ts` (7): Automatic per material; each reason (card, round box, open side, walls of different heights) and a cap still allowed; a Flat lid in plywood and corrugated: tabs flush with its top, each in its slot with the fit and a web to the edge, its own piece, nothing glued, no check issue, idempotent and saved and opened unchanged; it follows a resize and a height; Flat to Cap to Flat to none leaves nothing behind; a cap's rim. Goldens: `lid-flat-ply`, `lid-flat-corr4`, `lid-cap-full-corr16` (new); every other golden byte-identical. Browser: `lids.spec` gains the Kind and Rim rows and the reason on card.
- Not yet: `val.lidKind`, the Extrude card's Lid row, Inset and Drop-in (milestone 80), the fit spike on real plywood.

## Milestone 80 — the Drop-in lid ✅ (Inset deferred)

`LIDS_LINES_PROJECTS_PLAN.md` §3.2 (milestone 75 there, less the pose: milestone 76). *Lifts off* gains **Drop-in**: one board inside the walls on the dividers, a finger hole clear of them, offered where the dividers are lower than the walls by its thickness. Inset is deferred (`DECISIONS.md`).
- Tests: `lidKinds.test.ts` (+4): in plywood, corrugated and card, a box with two crossing dividers: the lid is the inside less the fit, rests on the dividers, its finger hole clears both, its own piece, no check issue, idempotent and saved unchanged; a box without dividers is refused with the reason. Golden `lid-dropin-ply` (new); every other golden byte-identical.

## Milestone 81 — the pin hinge: deferred

It needs its spike in real plywood (`DECISIONS.md`). Plywood's *Hinged* stays the living hinge.

## Milestone 82 — hasps and the Escape box ✅

`LIDS_LINES_PROJECTS_PLAN.md` §3.4 (milestone 77 there), on Flat lids. The *Lid* section has **Locks: None · 1 · 2 · 3** (and the hole size in Workshop): the front wall's tabs grow into tongues with a padlock hole above the lid. Greyed with the reason off plywood or without a Flat lid. A new mission, **Escape box**.
- Tests: `lidKinds.test.ts` (+5): one, two and three hasps: as many tongues and slots, each hole's lowest point at least 1 mm above the lid's top, slots the tongue's width plus the fit, no check issue, idempotent and saved unchanged; the reasons; the Escape box starts with no goal met. `missions.test.ts`: its reference solution meets every goal. Golden `lid-flat-ply-hasp2` (new); every other golden byte-identical.
- Not yet: hasps on a cap or a hinged lid; `val.haspThin` and `val.haspBlocked` (the sizes are made safe instead: the web is never under 4 mm).

## Milestone 83 — lines in the engine ✅

`LIDS_LINES_PROJECTS_PLAN.md` §5 (milestone 78 there). `Panel.lines` with five types, clipped to the board and its holes, dashed per material at export, checked (a cut that would split the piece, a line off the board), drawn in 3D. Made through `ops` only; the tool is milestone 84.
- Tests: `tests/lines.test.ts` (8): dash layout (perforation starts with a cut, cut-crease with a tie, round a corner, shorter than a dash), arcs from a bulge, dash lengths per material, clipping at the outline and at a cut-out shape's hole, every type on its layer in the file (counts of dashes), the checks, kerf compensation leaves open lines in place. Golden `lines-card` (new); every other golden byte-identical.

## Milestone 84 — the Line footprint ✅

`LIDS_LINES_PROJECTS_PLAN.md` §6 (milestone 79 there), adapted: *Line* is the Shapes tool's sixth footprint (`L`) with the line types as its operators. A board's card lists its lines with their type and Delete, in both modes.
- Tests: `shapesTool.test.ts` (Line draws with the polygon tool, open); browser `lines.spec.ts`: a perforation of three points and Enter on a board, retyped as a crease on the card, deleted.
- Not yet: editing a line's points or arcs on the stage, selecting it on the stage, a line across folds on the cut plan.

## Milestone 85 — how a fold is made ✅ (per joint)

`LIDS_LINES_PROJECTS_PLAN.md` §5.3 (milestone 80 there). A crease fold can be a score, a perforation or a cut-crease, on its joint's card in Workshop.
- Tests: `lines.test.ts`: a card tray's fold as a perforation and a cut-crease puts dashes on CUT and no score, and back to a score; saved and opened unchanged. `quickTable.test.ts`: `crease` is chosen by the app in Quick build. Every golden byte-identical.
- Not yet: the design-wide choice, creases on the back.

## Milestone 86 — the library ✅

`LIDS_LINES_PROJECTS_PLAN.md` §7.1 and §8 (milestone 81 there). Designs are kept in the browser, listed on the start screen as *Your designs* (open, duplicate, rename, delete and restore), reached from the project menu; *New design* keeps the open one; two tabs on one design never overwrite each other silently.
- Tests: `tests/library.test.ts` (3, `fake-indexeddb`): a design saved before the library opens first and is listed; ten designs list newest first from their cards and the last open one opens; duplicate, rename, delete and restore. Browser `library.spec.ts` (2): New keeps the open design, the library lists, opens, duplicates, renames, deletes and restores, a reload opens the open design; a change in a second tab shows the notice and *Reload* takes it.

## Milestone 89 — dimensions on the dieline ✅ (blank sizes, glue, legend)

`LIDS_LINES_PROJECTS_PLAN.md` §9 (milestone 84 there), in part. The cut plan has a legend and a *Dimensions* button (blank sizes, *glue* on glue flaps); the download dialog can add names and sizes on the guide layer.
- Tests: `tests/annotate.test.ts` (2): a folded card tray has a name per board, its blank size, *glue* on every glue flap, all on the piece; annotations reach the file only when asked and only on GUIDE. `quickTable.test.ts`: `export.annotations` is chosen by the app in Quick build. Every golden byte-identical.
- Not yet: dimension chains, the grain arrow, the title block (spec sheet, milestone 90).

## Milestone 87 — projects ✅

`LIDS_LINES_PROJECTS_PLAN.md` §7.2 (milestone 82 there). Designs move into named projects in the library; a project saves to one file and opens again; the download can cut the whole project, one batch per material.
- Tests: `library.test.ts` (+3): a project of three designs round-trips through one file and a single-design file still opens (and still parses for the Worker); a two-material project makes two batches; designs join a project by name, keep it through autosave, and leave it. Browser `library.spec.ts` (+1): two designs moved into a project, grouped in the library, and *The whole project* downloads.
- Not yet: *Compare*.

## Milestone 88 — sizes ✅ (in the download)

`LIDS_LINES_PROJECTS_PLAN.md` §7.3 (milestone 83 there). A design with one box (or a template) has sizes in its settings card; each is the master with its numbers, checked and downloaded under its own name.
- Tests: `tests/sizes.test.ts` (4): a hinged card box in three sizes: its lid closes each, a centred window stays centred, a corner hole keeps its distance, each is clean and exports, the master is untouched; a change to the master shows in every size; a box with a Flat lid and a divider sizes with its lid, the divider keeping its share; sizes need one box. `quickTable.test.ts`: `sizes` hidden in Quick build. Browser `sizes.spec.ts`: a size added in the settings card and downloaded under its name.
- Not yet: showing a size on the stage.

## Milestone 90 — the spec sheet ✅ (fitted pages)

`LIDS_LINES_PROJECTS_PLAN.md` §9 (milestone 85 there). *Print a plan* (A4 or A3) in the download dialog: one page per kind of piece at a stated scale, with its annotations, a title block and the legend.
- Tests: `tests/spec.test.ts` (2): the largest scale that fits; a folded card tray and a board give a page each, the tray's net at 1 : 2 on A4 with its blank size, title block and legend; the print view has a page per piece and an A4 landscape `@page`. Browser `spec.spec.ts`: the print view opens with the page and its scale.
- Not yet: the tiled 1 : 1 print.

## Milestone 91 — verification of 74–90 ✅

- Unit suite: 891 pass, 7 skipped; typecheck clean (app and Worker); `npm run build` succeeds (one ~1.6 MB chunk, as before).
- Golden exports: every file from before milestone 74 byte-identical; new goldens for the Flat lid (plywood, corrugated), a full-rim cap, a Drop-in lid, a Flat lid with two hasps, and lines of each type.
- Browser, app (`--grep-invert classroom`): 147 passed, 0 failed, 61 skipped (screenshot specs). The classroom specs need the Worker and were not run; the Worker reads single-design project files as before (`library.test.ts`).
- Deferred, with the reason in `ROADMAP.md` §3 *Status* and §4: the pin hinge (81: a plywood spike), the Inset lid, hasps on caps, Compare, a size shown on the stage, the tiled 1 : 1 print, dimension chains, creases on the back.
- Needs the owner: the design that showed dividers narrow on the cut plan; real cuts of the Flat lid's fit (0.3 mm), the Drop-in lid and the hasps; LightBurn's reading of guide-layer text and dashed lines; Hebrew strings of 74–90 read by a native speaker.

## The fold overhaul (19 November) ✅

The owner's report (dividers short, gaps at the side walls, corners not flush, a lid folded inwards and mirrored). See `DECISIONS.md`. A crease folds where the mid-planes meet, so a folded box is the size of its 3D model (it was about 2t larger); no fold strip or jogs in the net; flaps crease half a thickness in; tab-and-slot corners are flush with open notches; a lid's folds (which turn away from the scored face) are perforated by default. Schema 11.

Verified: unit suite 914 pass, 7 skipped; typecheck clean; goldens regenerated for card and corrugated (plywood byte-identical); browser specs 143 passed (`dividers`, `closures`, `foldover`, `joints`, `lids`, `lines`, `split`, `trays`, `wings`, `bands`, `polygon`, `round`, `spec`, `templates` and the rest of the app-only suite). Looked at in the browser: a corrugated tray's corner in 3D, its net, a card box with dividers and its cap lid on the cut plan.
- Needs the owner: a real fold of card and 4 mm corrugated to confirm the crease rule (calibrate with *Fold allowance* if a material folds larger).

## Milestone 92 — what Quick build left half-done ✅

`GUIDED_MODE.md` G1 (`ROADMAP.md` §5). Each fix came after a test that failed without it.
- **A draft is never saved.** Autosave writes `designToSave(state)`: while a ghost waits for ✓ (a Box footprint, a shape, a pasted group), the design from before it; when ✓ or ✗ ends the draft, the design then. A reload before ✓ leaves nothing behind.
- **Template sizes keep the dividers where they were put** (`keepDividerPlaces` in `src/templates/registry.ts`): in a row the student changed (a divider moved from where the template put it, or one the student added), each divider keeps its share of the row through a change of width, depth or height; one more divider goes to the middle of the widest space; a row no one moved keeps the template's even spacing; no space ends smaller than `MIN_COMPARTMENT`, else the row keeps the template's places.
- **The too-big fix ends clean, or says it did not work.** On a copy: a template's design shrinks through its own sizes in millimetres (`shrinkTemplate`, regenerated, a few passes), so the next size change does not grow it back; any other design as before. The copy is taken only when the piece fits and no new kind of blocking issue appears; otherwise the design is untouched and `fixIssue` returns false. The Quick build fuzzer's known exception (`added`) is gone: it is strict by default now.
- **Quick build's empty stage** shows no hint (it named the Board tool, which Quick build does not have; the note beside the rail says where to start). Workshop unchanged.

Verified
- `tests/regress/repro-draft-saved.test.ts` (3): a Box footprint before ✓ saves the empty design and after ✓ the box; a shape waiting for ✓ saves the board without it; the empty-stage hint by mode.
- `tests/regress/repro-template-dividers.test.ts` (10): in plywood and corrugated, a divider moved 9 mm stays through a height change, keeps its share through a width change, two stay and the third fills the widest space when the count goes up, an unmoved row stays even; the too-big fix on a template on a small sheet shrinks its sizes and a later size change does not bring the issue back; a fix that cannot be made leaves the design object identical.
- `tests/fuzz/quick.test.ts` with `STRICT=1 FUZZ_N=40`: no failure (it found 7 sessions of new issues after the shrink before).
- Unit suite 927 pass, 7 skipped; typecheck clean; goldens byte-identical.
- Browser (dev server, Quick build, plywood): a Box dragged and not confirmed, reloaded: no board; the empty stage has no hint.

## Milestone 93 — size intent ✅

`DIELINE_DNA_PLAN.md` D5a (`ROADMAP.md` §5). `src/model/boxSize.ts`, `src/ui/BoxSizeUI.tsx`; `Design.sizeAs` (optional; absent = outside; no schema change).
- **`boxSize(d, tray, as)` / `setBoxSize(d, tray, size, as)` / `outsideFor`**: a box's width, depth and height *outside* (the base's outline and the tray's height, as stored), *inside* (less the walls on each side, and less what lies under and over the inside: a cut base, an open base's bottom flaps, a closed top) or *crease to crease* (half of that, since a fold lies where the mid-planes meet). Each wall's own thickness counts. The base grows from its own origin, so dividers keep their distance from the left and front.
- **The box's card**: *Sizes are: Outside · Inside · Crease to crease* above the base's sizes (crease to crease only on card and corrugated); *Width inside*, *Depth inside* and *Height inside* (or *(creases)*) show and take the sizes so stated. Quick build hides the switch (`size.as`); the fields follow the design's intent in both modes.
- **A change of board keeps the stated size**: `setMaterial` and `editMaterial` run inside `keepingStatedSizes`, so a box stated by its inside keeps it on a thicker board (its outside grows).
- **Milestone 88's sizes** read their numbers in the design's intent (`applySize` through `outsideFor`).

Verified
- `tests/sizeIntent.test.ts` (23): in each of the four materials, the inside equals the measured clear space between the walls (`clearSpans`) and the inside height is the outside less the base; each intent round-trips; card 0.5 → corrugated 4 with *Inside* keeps the inside to 1e-6 while the outside grows by 7 mm; with *Outside* only the thickness changes; *crease to crease* is kept; a carton loses a thickness under (its bottom flaps) and over (its tuck top); a divider keeps its distance from the left side when the box widens; a size row read inside; a bad intent in a file is dropped.
- `tests/quickTable.test.ts`: `size.as` hidden in Quick build. Unit suite and typecheck green; goldens byte-identical.
- Browser (dev server, card, Workshop): a 120 × 80 box's card shows *Inside: 119*; typing 100 makes the base 101 outside.

Limitations
- The stage's W / H labels still show outside sizes. A base that is not a rectangle takes its walls' thickness on both sides. Templates keep their own *Sizes are* parameter (the organiser's); the sentence builder writes `Design.sizeAs` (milestone 95).

## Milestone 94 — the sentence's contract and resolver ✅

`SENTENCE_BUILDER_PLAN.md` S1. No interface. `src/templates/types.ts`, `src/sentence/resolve.ts`; `organiser` and `stand` gain `limits`.
- **The contract**: a parameter may say `when` (it is in the sentence only then), `allowed` per option (an option that cannot be made is not offered), `why` (the reason one dropped out), `fallback`, `addon: { off }` (a clause added with *+ more*), `affects` (boards to light up). A template may say `limits(m, p)` (each number's range now, and why it ends there), `canMake(m)` (kind and thickness; `materials` still decides when absent, through `makes`), `status`, `fallback(m)` (the structure to become), `sentence` and `word`. Old templates need none of them.
- **The resolver**: `resolve` (every word's state: shown, the allowed options, the range and its reason), `choose` (one word changed; every later word checked in order, and only those; a word no longer allowed takes its fallback, a number moves to the nearest end of its new range, each a `Change` with its reason; a typed number outside its own range is refused with the range), `chooseStructure` (shared words kept), `chooseMaterial` (the structure's fallback when the material cannot make it, then every word), `largestOk` (bisection for limits with no formula: at most eight builds, cached).
- **Organiser**: the divider counts end where a space would be under `MIN_COMPARTMENT`, the dividers' height at the walls under a lift-off lid. **Stand**: as many slots as the base's depth holds.

Verified
- `tests/sentence.resolve.test.ts` (11): on a made-up structure, a change re-checks only the later words; a changed earlier word moves later numbers into range, each reported once; a dropped option's fallback and reason; a refused number with its range; choosing the current value changes nothing and `resolve` agrees; lists hold only allowed options; a material change re-checks every word; a structure the material cannot make becomes its fallback keeping shared words; bisection within its step in eight builds, cached. The organiser's count falls with a narrower box; the stand's slots end at what its base holds.
- Goldens and template tests unchanged; unit suite and typecheck green.

## Milestone 95 — the sentence's box, tray and spaces ✅

`SENTENCE_BUILDER_PLAN.md` S2. `src/templates/structures/box.ts`, registered as templates `box` and `tray` (kept off the welcome screen's preset grid until milestone 98).
- **Words** (in sentence order): width, depth, height, *inside · outside · crease to crease* (no creases on plywood), shape (*square corners · rounded corners · round · straight sides*, with the number of sides), and the add-ons: a lid (*lifts off · hinged · arched*; the box only), spaces (*into nx × ny* or *of about sx × sy mm*; a size only on square or rounded corners), a window and a finger notch in the front wall (the box), two handle slots (the tray). The build is `boxRecipe`, `setBoxSize` in the stated intent (milestone 93, so the design remembers it), `dividerLine` at equal steps, `holeRecipe`, `setBoxLid`.
- **Every list asks the engine** (`cleanWith`): an option is offered when the structure built with it, the later add-ons off, has nothing that stops the cut (`validate`), and for a lid when `lidWhy` allows it and the lid is really made. Cached per material and words; a word's own value is checked first, so a change only builds for the add-ons that are on.
- **Ranges**: width, depth and height end at the largest size that still cuts clean with square corners and no add-ons, found by bisection over builds (nine at most, cached, worked out only for the number asked about); counts end where a space would be under `MIN_COMPARTMENT`; a wanted space size at the inside. A size inside its range that the engine would still not cut clean (found: a corrugated net that fits only against the grain at some depths) is refused with its reason (`TemplateDef.accepts`).
- **Spaces** are measured on the built design (`compartments`); the formula only chooses the count: n = max(1, floor((W + t) / (s + t))).
- **Stable ids for generated designs** (`renameIds` in the registry): every board gets a role (base, each wall by its edge, dividers in order, a lid's parts), trays get stable ids, and every reference follows (a deep rename of exact ids, and of ids built from a tray's). Joints the engine derives (`lidtab:…`, `close:…`, wings) keep their own ids and are made again by `solve`: renaming them left stale copies beside new ones, which broke a plywood Flat lid with dividers.

Verified
- `tests/sentence.box.test.ts` (15): random walks through the box's and the tray's words in all four materials (any word, back as well as forward, a number past its end refused), each step built and checked: no blocking issue, no word left on a value its list does not offer; spaces measured equal the formula to 0.1 mm (count) and are at least the size asked (size); a narrower box lowers a count with its reason; round and many-sided boxes offer a count only; the inside survives a change of board; every hidden option has a reason; a regenerated box keeps every board's id.
- The walks found, and this milestone fixed: rounded walls bent too tight on tall boxes (the corner now bends for the walls' full height), a window too close to a finger notch, a box too tall for an arched or hinged lid, round boxes whose wall strip is longer than a sheet, the Flat lid broken by the renaming above.
- `tests/fuzz/templates.test.ts` keeps free random parameters for the preset templates only (the structures go through their resolver); it found that a rounded box with a hinged lid and free random sizes breaks two export invariants (an oversized piece not reported, contour counts differing): left as a separate task.
- Goldens byte-identical; unit suite and typecheck green.

Limitations
- A change that needs the size ranges again (a new width re-checks the depth's and height's ends) can take up to about a second of builds the first time; the sentence (milestone 97) shows the static range until they are ready.

## Milestone 96 — the sentence's carton and sleeve ✅

`SENTENCE_BUILDER_PLAN.md` S3. `src/templates/structures/carton.ts`, registered as `carton` and `sleeve`.
- **A carton** (card, and corrugated up to 2 mm): sizes in the stated intent, *a top that tucks in · a top of four flaps*, *a bottom that snaps shut · tucks in · of four flaps*, and the add-ons *a thumb notch* and *without dust flaps* (on a tucked top, through `setClosure`) and a window in the front. **A sleeve** (card and corrugated): the tube open at both ends, with a window. Built with `addTray(…, { base: 'open', top, bottom })` and `setBoxSize`.
- **The carton builder moved into the app**: the golden designs' `cartonDesign` is now `src/templates/structures/carton.ts`'s, and the three carton goldens are byte-identical.
- **On a board that does not fold**, a carton becomes *a box with a lid that lifts off* (`fallback`, and `fallbackWords` set when it does), a sleeve a box; neither is listed on plywood (`canMake`).
- **Every change must leave a sentence the engine cuts clean** (`accepts`, the whole sentence built): a choice or a number that does not is refused with its reason. *Inside · outside · crease to crease* is now asked of the engine too. Both found by a longer walk (25 walks × 10 steps): a round box divided 16 × 12 (its dividers collide) and a tall tray whose sizes turned from outside to inside grew past the sheet.
- `NOTE_KEYS` has its own module (`src/easy/notes.ts`): the structures import the checks, which import the template registry, which lists the structures; the golden designs import the registry first.

Verified
- `tests/sentence.carton.test.ts` (10): walks through cartons (card, corrugated 1.6) and sleeves (card, both corrugated), every step built clean; plywood lists neither, 4 mm corrugated no carton; box → carton → box keeps the sizes and the window; a carton on card becomes a box with a lid that lifts off on plywood, its width kept and the change reported; a thumb notch and no dust flaps change what is cut; the design remembers *inside*.
- Goldens byte-identical (the cartons now built by the app); unit suite and typecheck green.

## Milestone 97 — the sentence component ✅

`SENTENCE_BUILDER_PLAN.md` S4. `src/sentence/Sentence.tsx`, `Word.tsx`, `NumberWord.tsx`, `model.ts`, `SentenceDev.tsx`; styles in `styles.css`.
- **One whole sentence per language with named slots** (`sen.s.box`, `sen.s.carton`, `sen.s.sleeve`) and a clause per add-on (`sen.add.*`), joined by each language's rule; never glued from fragments. Numbers sit in `<bdi dir="ltr">`.
- **A word** is a button with a dashed underline and ▾, at least 44 px tall, named so it makes sense alone (*Lid: a lid that lifts off. Change.*); its list follows the select-only combobox pattern (Enter or Space opens, arrows and type-ahead move, Enter picks, Esc closes) and is worked out when it opens, with a small picture per option for the structure, the shape, the lid and a carton's ends (`renderThumbnail`, cached).
- **A number** is a field five characters wide; focusing it opens a slider with − and +, its range and why it ends there (the word's own bounds at once, the engine's when worked out). Enter or leaving commits, Esc puts it back, sums and percents work (`evalNumber(text, base)`: `150%`); a refused number keeps its value and shows *From … to … mm: why*.
- ***+ more*** lists the add-ons that are off and can be made; each one on is a clause with ×. **The line under the sentence** is measured on the built design (each space, or how many spaces of about the size asked and their exact size, or the range on a round box; the outside; pieces; sheets and use), with the first thing that stops the cut. **Change notes** say what changed and why, and are read out from an `aria-live` region. **The picture** is rebuilt 150 ms after the last change. **Under 600 px** the same words are labelled rows.
- A development page, `?sentence`, shows the sentence with step 1's materials and a language switch.

Verified
- `tests/sentence.model.test.ts` (4): every structure's sentence splits into slots that are its words, in both languages; clauses follow the words (a polygon's sides, an add-on on, the rest in *+ more*); the line is measured (each space of a 3 × 2 plywood box, outside 166 × 116 × 48 mm, pieces, one sheet; size mode gives the count and spaces at least as big as asked).
- `tests/i18n.test.ts`: every slot of an English sentence, clause or line is in the Hebrew one, and the reverse.
- Browser, `tests/e2e/sentence.spec.ts` (5) in English and Hebrew at 1366 px and in English at 375 px: every word chosen with the keyboard alone (structure, a number, an add-on through *+ more*, its ×); a narrower box lowers the space count, with the note and the live region; a count past its end refused with its range; the narrow layout has the same state and no sideways scroll.
- Looked at in Hebrew (1366 px) and at 375 px: the sentence reads right to left with its numbers left to right; the slider sits under its field on a phone.

Limitations
- Focusing a word does not light up the boards it affects in the picture (`affects` is in the contract; the picture is a thumbnail image).
- A change that needs the engine's ranges again can take up to about a second the first time (milestone 95).

## Milestone 98 — the welcome screen says what to make ✅

`SENTENCE_BUILDER_PLAN.md` S5. `src/ui/StartScreen.tsx`, `src/templates/stand.ts`, `src/main.tsx`.
- **Step 2 is *Blank design* or the sentence**, the sentence's picture beside it; the template grid's cards are gone. Touching any word of the sentence chooses it; *Start* runs `generate` with its words. Missions stay below in Quick build; *Your designs* stays above step 1.
- **Step 1's material drives the sentence** (`chooseMaterial`): a word or a structure the material cannot make becomes what it can, and the note under the sentence says so (*a carton on card → a box with a lid that lifts off on plywood*). Nothing is greyed.
- **The card stand is a structure** (*a card stand for cards … mm wide and … mm thick, leaning at …, with … slots on a base … mm deep*); **the organiser is no longer offered** (a new organiser is *a box … with a lid that lifts off, divided into 3 × 2 spaces*). Saved organisers and the two missions that start from it are unchanged.
- The test hook gains `startTemplate(id, material)` for browser specs that start a preset the welcome screen no longer lists; `templates`, `overhaul`, `maintenance`, `quick-shots` and `classroom` use it (`startTemplate` in `tests/e2e/util.ts`).

Verified
- Browser `tests/e2e/start-sentence.spec.ts` (3): *Blank design* gives an empty design in each of the four materials; every structure the sentence lists starts from it in every material that lists it, with no blocking issue (plywood lists no carton); a carton on card filled in, then plywood: a box with a lid that lifts off, the width kept, the note shown, and that is what starts. `templates.spec` (the organiser through the hook; the stand from the sentence), `overhaul.spec`, `maintenance.spec`: passed.
- A longer walk (25 walks × 10 steps) through the box, the tray, the carton and the sleeve in their materials: no failure.
- Unit suite and typecheck green; goldens byte-identical.

## Milestone 99 — the preset card after Start ✅

`SENTENCE_BUILDER_PLAN.md` S6. `src/ui/TemplateUI.tsx`, `src/templates/registry.ts` (`changeMaterial`).
- **The template card follows the sentence's rules**: it shows only the words that apply now (`when`, `only`), each list only the options allowed now (worked out once per set of words), and a change goes through `choose`: later words are checked again and what was dropped or moved is said in notes on the card (*Spaces across: 3, because each space at least 5 mm*); a number past its end, or a change the engine would not cut clean, is refused with its range or reason and the design is untouched. The organiser and the stand get the same checks (their limits from milestone 94).
- **A change of board in the drawer** runs the sentence's material check for a structure first (`changeMaterial`): a carton changed to plywood becomes a box with a lid that lifts off, its sizes kept, its boards keeping their roles so shapes on them stay.

Verified
- `tests/sentence.card.test.ts` (5): a narrower box drops spaces it can no longer hold and says so; a count past its end is refused; a name engraved on the front wall after *Start* survives a change of width; a divider moved after *Start* stays through a change of height; a carton changed to plywood becomes a box with a lid that lifts off, keeping its width.
- Browser `tests/e2e/sentence-card.spec.ts`: a plywood box divided 12 across from the sentence; on its card the words a count does not use are not shown; width 60 lowers the count with a note; 20 across is refused with its range and nothing changes.
- Unit suite and typecheck green; goldens byte-identical.

## Milestone 100 — verification of the sentence (94–99) ✅

`SENTENCE_BUILDER_PLAN.md` S7.
- **The random walks at length**: 40 walks of 12 steps through every structure in every material that lists it (the box and the tray in all four, the carton in card and corrugated 1.6, the sleeve in card and both corrugated, the card stand in all four): over 8,000 steps, each built and checked. The box, tray, carton and sleeve passed. The card stand (walked from this milestone) did not at first: its slots could be more than a shallow base holds after a change of the base, and its sizes could pass a sheet. Fixed: the base's depth now starts at what its slots need (a limit that follows the slots), and the stand refuses a change the engine would not cut clean (`accepts`), as the other structures do. Re-walked: no failure.
- Unit suite and typecheck green; goldens byte-identical; `sentence.spec`, `sentence-card.spec`, `start-sentence.spec`, `templates.spec` pass. `classroom.spec` needs the Worker and was not run (the start of its designs goes through the test hook since milestone 98).
- In the dev server, in both languages, every structure the sentence lists in card and plywood started from the sentence and was ready to cut (no blocking issue), with no page error.
- `README.md` describes the sentence and the size intent.

Needs the owner
- The Hebrew sentences (`sen.*`) read by a native speaker (the owner said they will check them); the word *קרטון* for *a carton* in particular.
- Whether the welcome screen's default sentence should be the plan's example (a box with a lid that lifts off, 3 × 2 spaces) rather than a plain box.

## Milestone 101 — outline mode ✅

`DIELINE_DNA_PLAN.md` D0 (the owner's request of 19 November). `src/model/outlineWhy.ts`, `src/store/store.ts`, `src/views/View3D.tsx`, `src/views/polyTool.tsx`, `src/ui/Inspector.tsx`.
- **An *Outlines* switch in the stage's view cluster**, beside *Joints*: while it is on, the board under the pointer shows its points faintly, and grabbing one edits that board in the same press (no selecting, no card). Selecting a board edits its outline; selecting another moves the editing there. The grow, move and turn handles are hidden as in the joints view, and boards stay pickable. Joints and outline mode exclude each other; turning it on picks the Select tool and edits what is selected; off lets go.
- **One rule for which outlines can be edited** (`outlineWhy`), used by the card's *Edit outline* and the mode: a board drawn as points and a grown wall can; a round board, a curved wall, a divider and a lid the generator made cannot, and the hint says why when one is hovered.
- **Keys**: only the board being edited answers; in the mode Esc lets go of the point, then of the board, and the mode stays on (the switch leaves it). The card's *Edit outline* reads *Editing (outline mode)* while the mode is on.
- Quick build hides the switch (`outline.mode`).

Verified
- `tests/outlineMode.test.ts` (5): selecting edits an editable board, moves to another, not a round one; turning on edits the selection, off lets go; joints and the mode exclude each other; without the mode nothing changes; `outlineWhy` for a base, a wall, a divider, a generated lid and a round board.
- Browser `tests/e2e/outline-mode.spec.ts` (English and Hebrew): two boards, the switch on, a corner of one dragged after hovering it, then a corner of the other straight away without clicking it first; one undo per drag restores each; Esc, then the switch off.
- Found on the way: the faint points vanished as the pointer reached a corner (it leaves the board there), so the last board hovered keeps them until another is hovered. `polygon`, `refine`, `wall-outline` and `joints` specs pass; unit suite and typecheck green; goldens byte-identical.

Limitations
- On a touch screen there is no hover: a tap selects the board, which then shows its points (not tried on a device).

## Milestone 102 — the sketch engine and the 2D canvas ✅

`DIELINE_DNA_PLAN.md` D0b-1. Nothing a student sees changes.
- **`src/sketch/*.ts` ported unchanged from `claude/guided-mode`** (its milestones 56–59): the sketch model as a graph of points and segments (lines, arcs by bulge, cubic Beziers, construction lines, locked points), flattening, regions (holes and islands), the edit operations (split, remove, weld, fillet and chamfer corners, scale and turn a selection, mirror, align, typed lengths and angles, duplicate, stamps), snapping, hit testing, selection and the tools as pure reducers. The types `SkPt`, `SkSeg`, `SketchGraph` are in `src/model/types.ts` (not part of any design yet).
- **`src/views/canvas2d.tsx`**: the view box (zoom about the pointer, pan, fit, kept per view), selection handles with optional side handles, the turn ring and the marquee, as one module; `Plan2D` uses it (the cut plan and the solo view behave as before).
- **Adapters** (`src/sketch/cutforge.ts`): a root board's outline as one closed chain whose segment ids are its edge ids, and back (`graphBoard`: refused unless still one closed simple loop; every edge keeps its id where it still exists, a split edge's first piece keeps it, `insertVertex`'s rule); a shape (rectangle, rounded rectangle, circle, polygon, path with holes) as a graph in its own frame, and back as a polygon or path in its unit box, its centre and turn kept.
- `evalNumber(text, base)` reads a percent of the value it replaces (from milestone 97).

Verified
- The ported tests: `sketchmodel`, `sketchregions`, `sketchops` (less the cases that load waffle sculptures through the 3D kernel), `sketchdraw`, `sketchedit`: 58 pass on `main`.
- `tests/sketchAdapters.test.ts` (15): every root board of nine golden designs round-trips with the same points, curves, edge ids and exported cut; a split edge keeps its id on its first piece and the second gets a new one; a graph that is no longer one closed loop is refused with the design untouched; polygons (turned or not) and a path with a hole round-trip to the same outline in the same place; a rectangle, a rounded rectangle and a circle have the right areas.
- Browser specs over the cut plan and the solo view (`editing`, `shapes`, `text-pack`, `split`, `templates`, `boards`): 23 passed. Unit suite and typecheck green; goldens byte-identical.

## Milestone 103 — the transform frame in 2D ✅

`DIELINE_DNA_PLAN.md` D0c (after `claude/guided-mode`'s scale frame). `src/views/frameScale.ts`, `src/views/Plan2D.tsx`, `src/ui/Inspector.tsx`.
- **A selected shape on the cut plan or in the solo view** has side handles besides its corners: corners change both directions, sides one; **Shift or *Keep proportions*** scales both alike by the direction moved furthest; **Alt** scales about the middle (and, as before, drops smart snapping). A turned shape scales along its own axes; a circle keeps its proportions. Every move previews from the box at the drag's start and commits once (Esc cancels). Several shapes' box keeps proportions the same way.
- **W and H pills** beside the frame take a size, a sum (`60+20`) or a percent (`150%`); with *Keep proportions* the other size follows. The card's width and height do the same, and *Keep proportions* is a tick on the shape's card (`viewPrefs.keepRatio`, per browser).
- **A shape too small on screen** for handles (under 24 px each way) shows only its pills and moves.
- Quick build keeps its corners and turn knob only (`transform.sides`).

Verified
- `tests/transformFrame.test.ts` (7): a corner keeps the far corner; with proportions kept both scale by the direction moved furthest; a side changes one direction, centred across, or both with proportions kept; Alt about the middle; a turned shape along its own axes; a circle alike; a typed size with and without proportions.
- Browser `tests/e2e/transform-2d.spec.ts`: in the solo view a cut-out's right side dragged 20 mm changes only its width; *W* typed `150%` makes it 120 mm; with *Keep proportions* on, *H* typed `60+20` makes the height 80 and doubles the width. `editing`, `shapes`, `text-pack`, `through` pass. Unit suite and typecheck green.

Limitations
- The 3D gizmo's handles are unchanged (its card's sizes follow *Keep proportions*).

## Milestone 104 — edit outlines in the 2D view ✅

`DIELINE_DNA_PLAN.md` D0b-2 (the owner's request: edit a shape's outline in the 2D view, double-clicked into). `src/sketch/edit2d.ts`, `src/views/Edit2D.tsx`, `src/views/Plan2D.tsx`; `Detail.sketch` (optional).
- **Double-click into a board** (in 3D or on the cut plan) opens it face-on, as before. There, **a double-click on a shape** (a cut-out, an engraving, a score, an added piece) shows its points; **on one of the board's lines**, the line's points; **on the board away from its shapes**, the board's own outline. On the cut plan's sheets, a double-click on a shape opens the board face-on already editing it.
- **Editing**: drag a point (it snaps to the outline's own points, middles and crossings, then the grid; Alt frees it); `+` at a segment's middle adds a point; click a point to select it, Delete removes it (never below three on an outline, two on a line); Esc lets go of the point, then of the outline; Enter or *Done* finishes. A small card says what is edited and offers, for a selected point, *Corner: Sharp · Round · Cut* with its size, and for a selected line, *Straight · Curved* and its typed length (the far end moves, alone on a closed outline). Each change is one undo step. The shape's move, scale and turn handles are hidden meanwhile.
- **Shapes keep their curves**: a shape edited this way keeps its outline as a sketch graph (`Detail.sketch`, in its own frame), so its rounded corners, arcs and curves stay editable; its flattened outline stays in `path` for everything else. A rectangle becomes four points, a rounded rectangle keeps its radius as rounded corners, a circle two half arcs. Resizing the shape (frame, card, a fix) scales its graph with it; a damaged graph in a file is dropped (its outline stays).
- **Boards** keep every edge's id (joints stay on their edges); a change that would open the outline or make it cross itself is refused. **Walls** (grown boards) move their top corners only, their bottom corners locked. **Lines** keep their type and group.
- Quick build does not offer it (`edit2d`).

Verified
- `tests/edit2d.test.ts` (9): a rectangular cut-out's corner dragged (turned 0° and 30°) moves only that corner; a rounded rectangle's corners carry its radius, a circle stays round; a fillet on four corners survives saving, opening and a resize; `+` and Delete, and a triangle's point not deleted; a board's typed edge length moves only its far end and keeps every edge id; an outline left open is refused with the design untouched; a wall's top corner moves, a bottom one does not; a line's point moved keeps its type and group.
- Browser `tests/e2e/outline-2d.spec.ts` (English and Hebrew, and from the cut plan): a board with a window face-on; double-click into the window, drag a corner out, type a side's length, round a corner (three undo steps); Esc twice; double-click the board away from the window and drag its corner (the window kept); from the cut plan's sheets a double-click on a round window lands face-on editing it.
- `editing`, `shapes`, `text-pack`, `transform-2d`, `lines`, `polygon`, `outline-mode`, `templates`, `through` specs pass; unit suite and typecheck green; goldens byte-identical.

Limitations
- Outline mode (milestone 101) does not yet enter a shape with a single click in the face-on view (a double-click does); *Nets* (milestone 113) is not built.
- A board's curved edges are shown with the editor's own curve while editing; their exact shape is the board's curve rule.
- Mirror and align for a shape's several outlines are not on the card yet (the engine has them).

## Code splitting (20 November, before Guided) ✅

The app was one JavaScript file (2.42 MB, 713 KB compressed). Now:
- **The libraries in files of their own** (`vite.config.ts`, Rolldown's `advancedChunks`): three.js (815 KB), the React 3D renderer (416 KB), React. They change far less often than the app, so a browser keeps them across releases and downloads only the app's own code again.
- **Loaded when first used** (`React.lazy` in `App.tsx`): the cut plan and face-on view with the 2D editing (36 KB), the download dialog with the export and print code (11 KB, plus its helpers), the teacher's view (12 KB), the sentence's development page.
- **The font parser (opentype.js, 237 KB) loads with the fonts** (`loadBundledFonts` imports it), not with the app; tests register fonts through `src/text/registerFont.ts`.
- What the welcome screen loads before it can show: about 2.13 MB (630 KB compressed), down from 2.42 MB (713 KB); the font parser follows in parallel.

Verified
- Production build served with `vite preview`: the welcome screen loads the app, React, three.js and the 3D renderer; the cut plan's file arrives when *Cut plan* is opened, the download dialog's when it is opened; the teacher view loads; a Hebrew and English text shape is outlined (the fonts parse); no page error apart from the teacher view's call to the class server, which was not running.
- Unit suite and typecheck green; goldens byte-identical.

## Milestone 105 (Guided G2) — the mode and the shell ✅

`GUIDED_MODE.md` G2, `HANDOFF_105-118.md` §105. `src/easy/features.ts`, `src/easy/mode.ts`, `src/store/store.ts`, `src/store/hooks.ts`, `src/App.tsx`, `src/views/View3D.tsx`, `src/views/Plan2D.tsx`, `src/ui/TopBar.tsx`, `src/ui/openFile.ts` (new, shared), `src/teacher/TeacherApp.tsx`, `worker/index.ts`; new `src/guided/` (`GuidedApp`, `GuidedTopBar`, `SideSheet`, `AddBar`, `ViewButtons`, `GuidedLayer`, `camera.ts`, `thing.ts`).
- **A third level, Guided**, below Quick build. Until milestone 110 it is reached with `?guided` once (saved in this browser's preferences as `guidedPreview`), which adds it to the level switch; nothing starts in it yet. A class can be set to start in Guided (the teacher's list and the Worker accept it).
- **Guided's shell** replaces the top bar, the rail, the card and the Workshop dock: a top bar with home, the thing's name, the steps *1 Build · 2 Decorate · 3 Send*, Undo and Redo with their words and a menu (*Start something new*, *Open a saved file*, *Save a copy*, the language, *More tools (Quick build)*, *All tools (Workshop)*, *Teacher view*); a side sheet with the thing's inside size, its spaces and its lid; view buttons *Look around*, *From above*, *Closer*, *Further*; the mission card. The stage shows no grow arrows, gizmos, divider button or slide, dock, view cube, fold bar or hint, and does not pan; the thing opens seen from 50° up in front and is framed again when it changes size. Every button is at least 44 px. In Hebrew the sheet and the bar swap sides; the stage stays left to right.
- **What a step is**: view state (not saved, not in the history); changing it clears the selection and closes the face-on view; a new design starts at Build. The steps' contents come in 107–109.
- **Underneath**: a full Guided column in the feature table (`GUIDED`, checked complete by the compiler), 14 new rows for the stage, the keys and the cut plan (each with all three states); `featureState` and `useFeature` pick by mode, so Guided never falls through to Workshop. The guard runs in Guided as in Quick build (`keepsCuttable`). In Guided the letter keys and Ctrl+C/V/D do nothing and Delete removes only a divider. Switching to Guided clears the joints view, outline mode, 2D editing and the face-on view. Workshop and Quick build are unchanged.

Decisions (the handoff's defaults, owner questions 3 and 7)
- The preview flag is `?guided`, saved in prefs, not a development-build switch (Playwright runs the dev server).
- The Hebrew name is a placeholder, *מודרך*, to be reviewed with the `sen.*` and `g.*` words.
- *Start something new* asks nothing (the open design stays in *Your designs* since milestone 86); no `Confirm.tsx`.
- Eight rows Guided hides by not mounting what holds them (the card, the dock, the fold bar, the 3D gizmos) are listed with where they live in `tests/quickTable.test.ts` (`GUIDED_BY_SHELL`) rather than gated inside components Guided never shows.

Verified
- `tests/guidedmode.test.ts` (13): three levels and their columns; the switch offers Guided only with the flag; switching to and from Guided leaves the design and its history unchanged; switching clears the joints view, outline mode and the face-on view; a class locked in Guided stays there; the step is view state; a shape pushed into the edge keep-out is moved back in Guided; `b` and `p` do not change the tool and Ctrl+C/V/D do nothing in Guided (Workshop's `p` still does); Delete removes a divider but not a wall; the opening view is 50° up in front of the thing; the side sheet's facts.
- `tests/guidedwords.test.ts` (4): every key under `src/guided/` is `g.*` or a shared prefix; no English `g.*` string says joint, kerf, tray, panel, edge, SVG and the rest; only `App.tsx` imports `src/guided/`, lazily; Guided imports none of the other levels' cards and bars.
- `tests/quickTable.test.ts`: the section and use checks run for Guided's column too, and its *show* and *auto* lists are snapshot. `worker/api.test.ts`: a class patched to Guided reads back Guided; an unknown level is ignored.
- In the browser (screenshots, English 1366 × 768 and Hebrew 1024 × 768): the shell with a box, no sideways scroll, the stage's test ids only Guided's own. Browser specs `topbar`, `quick`, `offline` pass. Unit suite and typecheck green; goldens byte-identical.

Limitations
- The steps are empty (Build, Decorate and Send arrive in 107–109); home and *Start something new* open the welcome screen until the gallery (106).
- Not tried on a touch screen.

## Milestone 106 (Guided G3) — things and the gallery ✅

`GUIDED_MODE.md` G3, `HANDOFF_105-118.md` §106. New `src/guided/things.ts`, `src/guided/GuidedStart.tsx`, `src/easy/plainThings.ts`; `src/easy/missions.ts`, `src/easy/mode.ts`, `src/teacher/TeacherApp.tsx`, `src/views/thumbnail.ts`.
- **In Guided, the first screen is a gallery**: *What do you want to make?* with large cards drawn by the real renderer: the missions (Pencil box, Dice tray, Card stand, Game organiser), then *Box*, *Box with a lid*, *Round box*, *Carton*. One tap starts it, named as its card, at Build. Above the cards: the class's board in one line (*Your class cuts in …*), or four board chips (the last choice remembered). A thing that cannot be made in the board is greyed and says why (the carton on plywood or 4 mm corrugated). Under the cards: *Open a saved file* and *Start with more tools* (not in a locked class). Coming back (home or *Start something new*): the newest three designs first as *Keep working on …*, then *All my designs*.
- **Quick build and Workshop keep their welcome screen with the sentence**, unchanged; the gallery exists only in Guided.
- **Plain things are the sentence's structures with set words** (box 120 × 80 × 45 inside; with a lid that lifts off; round 100 × 100; the carton's defaults), then detached from the template so nothing rebuilds them from the words (a change of board, the class's profile, a fix).
- **Pencil box and Game organiser are version 2**: plain boxes with dividers of their own (the box structure's equal spacing), so Guided's arrows and one kind of lid serve them. They start with the same inside sizes, spaces and goals as version 1 in every board (the pencils still need 14.2 mm more on plywood). This also changes how they start in Quick build: a box with the *Lid* section instead of the organiser's form. A saved version-1 design still opens and its goals still count.
- **A class's board** is kept from its link (`classMaterial` in the preferences) and every thing starts in it. **The class's list** also names the plain things; a list from before names none and offers them all. The teacher's card says *Things offered* with both groups, *Guided* among the levels, and *Students stay in this level*.
- **Thumbnails** (the welcome screen's too) are drawn as the stage shows the design: bent walls as their bands, folds at rest. A round box's card showed only its base before.

Decisions (the handoff's defaults, owner questions 6, 8, 9, 10, 12, and 4c)
- Plain things are detached from their template. The Escape box stays with Quick build and Workshop (its padlock needs hasps). The carton is greyed with its reason, not hidden. An older class list offers every plain thing. The round box is 100 × 100 outside, its inside measured. Pencil box and Game organiser rebuilt as boxes (version 2).
- The owner, 20 November: the gallery is the way in only in Guided; Quick build and Workshop keep the sentence. For milestone 110: Guided goes in the level switch for everyone, **Workshop stays the default for a new browser**, and new classes are unchanged.

Verified
- `tests/guidedthings.test.ts` (11): every thing starts with no blocking issue in every board it can be made in; plain things are boxes sized by the inside with no template; the carton cannot start on plywood or 4 mm corrugated; the Escape box is not in Guided; class lists (none, one mission from before, one mission and one thing); the class's profile is the board a thing starts in, else the last chosen, else plywood.
- `tests/missions.test.ts`: reference solutions of the version-2 missions (dividers slid, a divider added, a lid); a saved version-1 Pencil box still opens and its goals count; version 2 starts with version 1's goals on the four boards.
- Browser: the gallery in English (1366 × 768) and Hebrew (1024 × 768), no sideways scroll; the Pencil box starts with 186 × 60 × 30 inside and 3 spaces; *Keep working on …* after home. The full browser suite (app specs, 162) passes; the sentence’s walks (6 × 20 steps) and the fuzz suite pass; new `tests/e2e/guided-fence.spec.ts`: Workshop and Quick build open on the sentence with no Guided part, and a trip to Guided and back leaves the design and the level as they were. `quick.spec` finds the version-2 dividers and front wall in the design instead of by version 1's names. Goldens byte-identical.

Limitations
- `classroom.spec.ts` (with the Worker) was updated for the longer class list but not run here.
- *Keep working on …* shows a design's saved picture, which a design saves only after its first change.

## Milestone 107 (Guided G4) — Build ✅

`GUIDED_MODE.md` G4, `HANDOFF_105-118.md` §107. New `src/guided/box.ts`, `fit.ts`, `apply.ts`, `GuidedLayer.tsx`, `steps/Build.tsx`, `Demo.tsx`, `GuidedNote.tsx`, `pictures.tsx`, `templateControls.ts`; `src/easy/features.ts` (the Build sheet's sections), `src/store/store.ts` (`guidedSpace`, `guidedNote`).
- **Size by touching it.** Three arrows on the box: *Wide*, *Deep*, *Tall*, on the sides that move. A drag changes the box live and is one undo step; each arrow's label takes a typed number. Sizes are always the inside. A size the sheet cannot take stops at the largest that fits and says *That is as big as the sheet allows*.
- **Dividers.** Each has a round grip on its top (a third of the way along, clear of the objects' tags). Sliding it snaps to equal spaces near the middle. Tapping a divider offers *Remove*; only a divider can be removed.
- **Spaces.** Tapping a space selects it: its inside size, *Split it* with two pictures (*Front to back*, *Side to side*; greyed with the reason when a half would be under 20 mm), and what is in it. *Divider* on the add bar splits the selected space, or the largest, across its longer side.
- **Lid.** *Lid* on the add bar: *None · Lifts off · Hinged*, each greyed with today's reason when it cannot be made; the kind stays automatic, no hasps. A carton also has its *Bottom* pictures.
- **What goes inside.** Six objects as pictures; a tap puts one in the selected space or the best free one. Each lot shows its count (− +), *fits* in green or *needs {n} mm more* in amber, **Make it fit** and *Take out*. *Make it fit* grows the box by what is missing and gives all of it to that space: every divider beyond the space moves with it, so the other spaces keep their sizes; a box that is not a rectangle grows all round. It says *They cannot all fit on one sheet* when it cannot.
- **Other things.** The card stand (and a saved version-1 organiser) shows its sizes as sliders with plain names (*How far it leans*). A design that is more than one box says *Made with more tools: you can decorate it and send it*, with a button to Quick build (or Workshop when a part needs it), and has no arrows.
- **More about this box**, folded shut: how the corners hold (the two joint lists) and *No glue* on card and corrugated.
- **Pictures of the gestures**: pull an arrow, slide a divider, drag to look around, shown the first time a box is built and again from *How?* on the add bar; still under reduced motion.
- **Guided's one rule**: a Build action, or the end of a drag, that would leave the thing impossible to cut is not made, and a note says so (`guidedApply`, `guidedCommit`). The fuzz found the cases: a lid on a hexagonal tray in 4 mm corrugated, a divider slid onto a wall's slot, a box shrunk past its dividers.

Decisions
- No feature rows for Guided-only widgets (the arrows, grips and spaces): `src/guided/` mounts only in Guided. The Build sheet's sections are in `SECTIONS`.
- Guided's lid picker is built on `PictureChoice` + `lidWhy` + `setBoxLid`, not on `LidSection`, so the style row and hasps never show (no `lid.style`/`lid.locks` rows needed).
- *More about this box* uses the joint names (*Finger joint*…) inside the fold (owner call 4a); `conn.` is on the words test's shared list.

Verified
- `tests/guidedbox.test.ts` (11): sizes round-trip in the four boards; a name on the front wall survives a resize; dividers keep their distance from the left and the front; a split goes through the middle of one space, stays in it, adds one space and leaves the others; a split leaving a half under 20 mm is refused; *Divider* splits the largest space across its longer side; move and remove leave the other dividers; each lid choice is what `setBoxLid` makes; a lid follows a resize (Flat on plywood, cap on card); `kindOf` (plain things and mission boxes are boxes, the stand a template, a box with a wall added *more*); the rule refuses a change with a new blocking problem, with no undo step, and keeps a good one.
- `tests/guidedfit.test.ts` (5): Pencil box, the pencils fit, the box is 14.2 mm deeper, the other spaces within 0.1 mm, a second call changes nothing; every mission lot fits in every board with nothing blocking; the dice tray grows all round; a lot too big for the sheet gives null; a divider across a space beyond the grown one moves with it.
- `tests/fuzz/guided.test.ts`: random things, boards and Build actions (size, split, move, remove, lid, objects, *Make it fit*) through the guard and the rule: nothing throws, nothing blocking after any step, and fewer than a quarter of actions refused (run at 60 sessions × 10 steps).
- In the browser (Pencil box, plywood, 1366 × 768): pull deeper, tap a space and split it, *Make it fit* (the goal ticks), a lid on and off, slide a grip, then Undo back to the start, one step per action. The card stand's lean slider meets *Leans back at 45° or less*; the Game organiser in Hebrew at 1024 × 768 with no sideways scroll. Browser specs `guided-fence`, `quick`, `quick-revised`, `dividers`, `lids`, `templates`, `offline`, `start-sentence` pass; unit suite and typecheck green; goldens byte-identical.

Limitations
- Not tried on a trackpad or touch screen (owner question 2). The arrows are the stage's push-pull handles (14 px cones): big enough with a mouse, to be checked by finger.
- A drag changes the design live rather than moving an outline; one undo step either way.
- Objects can be dragged to another space with the existing tag drag (Quick build's), not yet with a Guided-specific grip.

## Milestone 108 (Guided G5) — Decorate ✅

`GUIDED_MODE.md` G5, `HANDOFF_105-118.md` §108. New `src/guided/decorate.ts`, `src/guided/steps/Decorate.tsx`; `src/views/Plan2D.tsx` (the guard face-on, the hint and legend through the table), `src/views/View3D.tsx` (Guided's words in the guard's tip), `src/easy/missions.ts` (*Your name* is a placeholder), `src/easy/features.ts`.
- **Step 2, Decorate.** The arrows and grips go. One tap on a side opens it face-on (Guided has no double-click); *Back to the box* closes it. A divider, a curved side (a round box's wall) or a part made with all tools says why it cannot be decorated.
- **Name, Sticker, Window** on the add bar, each placed in the middle of the open side (or the front, which then opens), selected and ready to drag:
  - *Name* is engraved (never cut), already saying the student's name when the app knows it (from sending), else *Your name*; letters at least as tall as the board allows, at most a third of the side. Its card: what it says, a size slider (from the board's smallest readable size), the three fonts.
  - *Sticker*: the eight stickers as pictures, a quarter of the side, engraved.
  - *Window*: circle, rounded or rectangle, a third of the side, cut out; its card has *Cut out · Engrave*.
  - Every decoration has *Copy* and *Remove*. Each action is one undo step, through Guided's rule (a change that cannot be cut is not made).
- **The guard face-on** (Guided and Quick build): while a shape on the open side is selected, its keep-out shows as a dashed outline, and the tip *Kept 2 mm from the side* (*from the corner teeth*, *from the next cut-out*) shows by the shape after the guard moves it. The 3D tip uses the same words in Guided.
- **Nothing of the Workshop face-on view in Guided**: no outline editing, side handles, operation dots, arrays or align (their rows were hidden in 105), and now no layer legend and no hint bar (*Shift-click…*, *Alt to drag*).

Decisions
- New rows `solo.guard` (Guided and Quick build show; Workshop never guards, so it has no tip to show) and `plan.legend` (Guided hide); the face-on hint follows `stage.hint`.
- *Your name* does not meet *Your name engraved*.

Verified
- `tests/guideddecorate.test.ts` (6): a name, a sticker and a window in the middle of every side that can be decorated, of every thing in every board, leave no new blocking problem; the front of a plain box takes all three in every board; a divider, a round box's wall and a side too small say why and make nothing; a real name meets the goal, *Your name* (both languages) and *Text* do not; a name on a lid's top stays when the lid changes kind; the face-on view's Workshop controls are hidden in Guided.
- In the browser (Pencil box, English and Hebrew, 1366 × 768): Decorate, tap the front (face-on, *Decorating Front wall*), *Name* typed *Maya* / *מאיה* (the goal ticks), a star dragged into the corner stops short with the tip, *Back to the box* (both show on the box). Browser specs `guided-fence`, `editing`, `shapes`, `text-pack`, `transform-2d`, `outline-2d`, `quick`, `spec`, `sizes` pass; unit suite and typecheck green; goldens byte-identical.

Limitations
- A box with rounded corners (made with more tools) has bands on its walls' edges, so its walls count as curved and cannot be decorated in Guided.
- The keep-out outline shows while a shape is selected, not only while it is dragged.
- Not tried on a touch screen.

## Milestone 109 (Guided G6) — Send ✅

`GUIDED_MODE.md` G6, `HANDOFF_105-118.md` §109. New `src/guided/steps/Send.tsx`, `src/net/submit.ts`, `src/export/files.ts`, `src/ui/printPlan.ts`; `src/ui/SubmitDialog.tsx` and `src/ui/ExportDialog.tsx` use them (no change for Quick build and Workshop); `src/guided/GuidedTopBar.tsx` (the dot), `src/store/store.ts` (Send shows the sheet).
- **Step 3, Send.** The stage becomes the sheet as the laser will cut it: a picture, nothing dragged, no *Repack*, no layer legend.
- **The check**: *Ready to cut ✓*, or each problem in plain words (*A decoration goes past the side of Front wall*) with **Fix** for the thirteen the app can fix; anything else says *This needs your teacher*, with *Open with more tools* when the class allows it. A dot on *3 Send* in the top bar turns amber while something needs fixing.
- *One sheet of board* / *{n} sheets*, and **Use less board** when it takes more than one.
- **The mission's goals and stars** when there is one.
- **Watch it go together** plays the assembly on the box and **See it flat** (card and corrugated) unfolds it; *Show the sheet* goes back.
- **One button, waiting for the check**: with a class code (from the class link or typed after *I have a class code*), **Send to my teacher**, asking the name once; a class in another board asks *Your class cuts in Plywood 3 mm. Switch to it?* and checks again after switching. Without a class, **Download the file**: the SVG at its true size, no dialog. *More download options* opens the full dialog; *Print a plan* prints the A4 plan.
- **Underneath**: sending moved out of the dialog into `src/net/submit.ts` (the class lookup, the profile check, the switch to the class's board, the upload, the remembered code and name); the printed plan into `src/ui/printPlan.ts` and the file names into `src/export/files.ts`, so Send loads neither dialog.

Decisions
- Send waits for the check (no *Download anyway* in Guided); *More download options* is the way out (owner call 4b's default).
- No row for the one-tap download: it is Guided-only code.

Verified
- `tests/guidedsend.test.ts` (4, the class server mocked): a class in another board is seen and the switch puts the design in it with nothing blocking; a closed class and no network say so; a send carries the design, a picture and the goals, and a second send is sent again; a failed send keeps the download, an SVG named by board and kerf.
- `tests/e2e/guided.spec.ts` (8: English and Hebrew, 1366 × 768 and 1024 × 768, taps only, no sideways scroll): the gallery, the Pencil box, *Make it fit* (the goal ticks), a name on the front, Send: *Ready to cut ✓*, three stars, the dot clear, the download an SVG; *Box with a lid* changed to *Hinged* and back with Undo; the other levels' controls absent.
- `tests/e2e/classroom.spec.ts` with the real Worker (5 passed, run here for the first time since milestone 100): a class set to Guided, locked, in plywood: its link opens the gallery with *Your class cuts in Plywood 3 mm* and no chips, no way to the other levels; *Send to my teacher*; the teacher sees *Pencil box · 5 of 5 goals*. The earlier classroom tests (the profile switch, a failed send, a locked Quick build class, a class's missions) pass through the refactored dialog.
- Browser specs `spec`, `flow`, `offline`, `guided-fence`, `library`, `split` pass; unit suite and typecheck green; goldens byte-identical.

Limitations
- Headless Chromium names a download with Hebrew letters *download*; the spec checks the file's contents there (a real browser keeps the name).
- *Print a plan* is A4 only in Guided.

## Milestone 111 (Dieline D3a) — the edge-feature registry ✅

`DIELINE_DNA_PLAN.md` D3, step 1; `HANDOFF_105-118.md` §111. New `src/model/edgeFeatures.ts`; `src/model/geometry.ts` (`extrasByPanel` reads the registry; `edgeFlapGeom` and `flapOn` moved to the registry's file and re-exported, so `dividers.ts` and the tests are unchanged).
- **One list of what sits on a free edge**: `EDGE_FEATURES` holds two kinds, fold-overs and flaps, each saying which items a board carries (`on`) and what each adds (`geom`: adds, scores with their `toward`, holes in any board, liner holes, and hinged parts, empty until 112). `edgeFeatures(d)` gives every hit (memoised on a frozen design under `'edgeFeatures'`) and `featuresOnEdge(d, board, edge)` the ones on one edge (for 112 and 113).
- **`extrasByPanel` runs one loop over the registry** in place of its two, in the same order as before (every fold-over by `d.order`, then every flap), and keeps `only`: a fold-over's lock slots still land in the base when only the base is asked for.
- No change in output, no control, no words.

Verified
- New goldens `foldover-corr` and `flap-card-plain`, generated on the code before the change (its own commit), and every golden byte-identical after it.
- `tests/edgefeatures.test.ts` (5): the fold-over hits equal `allFoldOvers` field for field (scores keep `toward`; the slots are in the base); the flap hits equal `edgeFlapGeom`; `extrasByPanel`, whole and for every board, deep-equals a copy of the old function on a corrugated fold-over, a card board with plain flaps, a card tray and a closed card box; the base still gets its slots; a flap on a joined edge gives nothing.
- Unit suite and typecheck green.

## Milestone 112 (Dieline D3b) — shaped flaps: tuck, dust, glue, hang ✅

`DIELINE_DNA_PLAN.md` D3, step 2; `HANDOFF_105-118.md` §112. `src/model/edgeFeatures.ts` (`FLAP_DEFAULTS`, `flapSpec`, `flapOutline`, `flapGeom`, the hinged part), `src/model/types.ts` (`EdgeFlap`, `FlapShape`), `src/model/check.ts`, `src/model/ops.ts` (`addEdgeFlap`, `setEdgeFlap`, `canFoldOver`), `src/model/validate.ts` (`val.flapNarrow`), `src/easy/fix.ts`, `src/easy/mode.ts`, `src/easy/features.ts` (`'flap.shape'`), `src/ui/EdgeBar.tsx`, `src/ui/Pictures.tsx`, `src/views/View3D.tsx`, `src/views/three-geom.ts`.
- **Five shapes on a free edge**, on the grow card's flap block (Workshop, under *More…*): **Plain** (milestone 67's lip, unchanged), **Tuck** (inset t + 0.5 at both ends, rounded 4 mm, 30 % of the board's depth, 12–22 mm), **Dust flap** (sloped 15° and 8°, 0.45 of the edge, 12–40 mm), **Glue flap** (the material's glue flap width) and **Hang tab** (25 mm, flat, a round 6 mm hole or a 32 × 6 mm euro slot 10 mm from its far edge).
- **Each has its settings** below the pictures: how far it folds (0–180°, 90 for the folding shapes), *In* or *Out*, the two slopes, the corner radius and, for a hang tab, its hole. A field not set takes its shape's default, so a file stores only what the student changed.
- **They fold in 3D** with the fold slider: a flap at more than 0° is a slab turned about its crease (half a thickness inside the edge, where folding shapes crease), drawn by the joints' flap renderer; a plain flap and a hang tab at 0° stay in the board's plane.
- **A flap folding *out* is cut as a perforation** (the fold overhaul's rule for folds away from the scored face); the card says so.
- **One feature per edge**: a flap is refused on an edge with a fold-over and a fold-over on an edge with a flap (`flap.why.taken`), and the button says why it is greyed (plywood, joined, taken). Old files with both keep both.
- **A check**: *the flap is wider than its edge allows* (`val.flapNarrow`) when its slopes would leave less than 4 mm of far edge (the outline clamps them); **Fix** makes it a plain flap.
- **Quick build** shows a board with a shaped flap read-only (*it has a shaped flap*), as it does fold-overs.

Verified
- `tests/flapshapes.test.ts` (10): each shape's outline, far edge and crease; a tuck's inset, radius and length; a hang tab flat with one hole in its own board, the euro slot cut as a hole; a flap with no shape equal to `flapOn` byte for byte; slopes clamped to 4 mm with the check and its fix; at fold 0 the slab lies on the net's outline and at 1 its far edge stands 15 mm off the board on the material side (*Out*: the other side); *Out* perforated and *In* scored; one feature per edge both ways; plywood refused; a new shape resets the slopes; a file with a bad slope, angle or shape keeps its flap.
- New goldens `flap-card-tuck-dust` and `flap-card-hang` (looked at); every older golden, `flap-card-plain` and `foldover-corr` included, byte-identical.
- `tests/e2e/flaps.spec.ts` (English and Hebrew): a tray wall's top edge, *Add a flap*, *Tuck* (folds 90°), the fold slider unfolds and folds it, *Hang tab* (0°) with a euro slot, the cut plan still one piece. `foldover.spec.ts` passes. Looked at in the browser: the tuck folded into the box, the dust flap turning with its wall at half fold.
- Unit suite and typecheck green; `quickTable.test.ts` lists `'flap.shape'` as hidden in Quick build and Guided.

Limitations
- The 3D slab of a folded flap turns about the crease's mid-plane; where it meets another board it may pass through it (no collision is checked).
- The glue areas of shaped glue flaps are not yet named on the cut plan's *Dimensions* or the spec sheet.
- Hang hole sizes are starting values until checked against the school's hooks.

## Milestone C1 (Styles) — named styles in the sentence, and the card grid ✅

`SENTENCE_STYLES_PLAN.md` C1. New `src/templates/styles.ts`, `src/sentence/StyleCards.tsx`, `tests/styles.test.ts`, `tests/e2e/styles.spec.ts`; `src/sentence/Sentence.tsx`, `src/sentence/Word.tsx`, `src/ui/StartScreen.tsx`, `src/store/store.ts` (`ViewPrefs.startView`), `src/easy/features.ts` (`'start.cards'`).
- **A style is a name for a set of the sentence's words** (`STYLES`): its structure and the words it fixes. Picking one fills them in; the sentence's first word then reads the style (*a reverse tuck end carton*), and changing one of its words renames it (*a tuck-top snap-lock carton*) or goes back to the plain structure (*a carton*). Nothing new is stored: `styleOf` works it out from the words.
- **Eight styles** that the engine already makes: Open tray, Hinged-lid tray, Hexagon box + lid, Tray + lid, Reverse tuck end, Tuck-top snap-lock, Sealed-end carton, Open sleeve. Each has a name, a line saying what it is and what it is for (*Cosmetics*, *Pharma*, *Gift*…).
- **The first word's list is grouped** (*Boxes and trays · Cartons · More*), each style with its picture and its line under its name; a style that fixes no word of its own (Open tray, Open sleeve) is its structure's entry, whose line names it.
- **The card grid**: a *Sentence · Cards* switch above step 2 (the sentence by default, remembered per browser). The cards are the same styles, each with its picture at the sentence's sizes, its line and its uses; picking one fills in the sentence, so switching back shows the same thing. Only what the material can make is listed (plywood: no cartons or sleeves), never greyed.

Verified
- `tests/styles.test.ts` (6): every style's words exist on its structure and it has its words in English; choosing a style gives words that are that style in every material that lists it; a changed word renames it, the most specific style wins (a hexagon box with a lid is not *Tray + lid*); every listed style builds with nothing blocking in each material that lists it; plywood lists no carton or sleeve; random walks starting from each style stay clean.
- `tests/e2e/styles.spec.ts` (4, English and Hebrew): the grouped list, a style picked and renamed by a changed word, started as the carton it says; the card grid by default off, cards on the switch, a card filling the sentence, plywood hiding cartons, the switch remembered. `start-sentence.spec.ts` updated for style entries (a style starts as its structure).
- Looked at in the browser: the grouped list and the card grid. Unit suite and typecheck green; goldens byte-identical.

Limitations
- The cards' pictures are the sentence's thumbnails: a sealed carton and a sleeve show without their end flaps.
- Trade codes are stored but not shown until the owner checks them.
- Guided's gallery does not show the styles yet (its things are still the plain structures).

## Milestone C2 (Styles) — straight tuck end, the regular slotted container, the drawer box ✅

`SENTENCE_STYLES_PLAN.md` C2. `src/model/types.ts` (`TrayTop`, `TrayBottom`), `src/model/cartons.ts` (`tuckBack`, `rsc` ends), `src/model/check.ts`, `src/model/ops.ts`, `src/ui/CornersUI.tsx`, `src/templates/structures/carton.ts`, new `src/templates/structures/drawer.ts`, `src/templates/structures/box.ts` (`drawerShell`), `src/templates/styles.ts`, `src/guided/things.ts`.
- **Straight tuck end**: a carton's bottom tuck can fold off the back wall, like its top (`Tray.bottom: 'tuckBack'`), its lip turning up inside the front. In the sentence it is a clause, *both tucking in from the back* (`tuckFrom`), offered when the top and the bottom both tuck; without it the carton is a reverse tuck. The tray card's *Bottom* list has *Tuck flap off the back (straight)*.
- **Regular slotted container** (FEFCO 0201): an `rsc` end for a carton's top and bottom. Every flap half the box's smaller side deep, straight slots between flaps; the long sides' flaps meet in the middle and the short sides' leave a gap. The four-flap end made before is FEFCO 0204 (all flaps meet) and stays as it was. Corrugated only; **4 mm corrugated now makes a carton**, with these ends only.
- **The drawer box**: a new structure, *a drawer box whose drawer is … wide, … deep and … mm tall*. An open tray, and a sleeve sized from the tray as built (its outside, plus the board's clearance twice across and once over the top), cut beside it as a tube with a thumb notch at each open end. Changing a size re-sizes the sleeve. Card and corrugated; on plywood it becomes a box with a lid that lifts off.
- **Three more styles**: *Straight tuck end*, *Shipping box (RSC)* (a group of its own, *Shipping*), *Drawer box*.
- Guided's plain *Carton* keeps its own rule (card and thin corrugated): its carton tucks.

Verified
- `tests/c2.test.ts` (4): the reverse tuck's big bottom flap is on the front wall and the straight tuck's on the back; an RSC of 300 × 200 × 200 in 4 mm corrugated has four flaps per end, each just under 100 mm deep; the drawer's sleeve inside is the tray's outside plus the clearance (and follows a change of width), with two thumb notches on one face; no drawer on plywood. `tests/sentence.carton.test.ts`: thick corrugated now offers a carton with shipping flaps top and bottom only.
- New goldens `carton-card-straight-tuck`, `carton-corr4-rsc`, `drawer-card` (looked at); every older golden byte-identical.
- `start-sentence.spec.ts`: every structure and style the sentence lists starts clean in every material (the drawer, the straight tuck and the RSC on 4 mm included). Unit suite and typecheck green.

Limitations
- The RSC's slot width (the walls' gap at the corners) is the four-flap end's; real slotted containers use about one thickness, to check on stock.
- The drawer's sleeve is cut standing on end beside the tray; in the model it does not hold the drawer.

## Milestone 113 (Dieline D1) — the Net view: *Sheets · Nets* in the cut plan ✅

`DIELINE_DNA_PLAN.md` D1; `HANDOFF_105-118.md` §113. New `src/views/netPick.ts`, `src/views/NetView.tsx`; `src/views/Plan2D.tsx` (a `net` mode, the picking layer `NetPicks`, the switch), `src/views/View3D.tsx` (`preview`), `src/easy/features.ts` (`'plan.nets'`, `StagePreview`), `src/App.tsx`, `src/ui/Inspector.tsx`, `src/store/store.ts` (`planMode`, `netPreview`).
- **A *Sheets · Nets* switch** in the cut plan's dock (Workshop). *Nets* shows each piece's net once, side by side and top-aligned, without sheets, packing or *Repack*; the overlaps check, names, *Dimensions* and the legend stay.
- **Every edge of every board can be picked in the flat**: a free edge selects the edge, so its grow card (and *Add a flap*) opens on the side as in 3D; a fold selects the board it folds and opens its joint (the hinge dial for a grown board); another joint selects its board with that joint open. A free edge shows a `+` on hover; the picked edge is drawn thick. Fold lines in the net can be clicked too.
- **Each fold has a chip** on its crease with its angle and a valley (V) or mountain (M) mark.
- **The folded model beside the net** (40 %, at least 320 px): it orbits, folds with the fold slider and shows the selection; nothing on it edits (its dock, edge handles, gizmos and widgets are hidden through `StagePreview`). An edge picked in the flat can be grown with the preview's ✓ until 114 moves it to the flat. *Folded preview* turns it off (remembered per browser); under 900 px wide it is not mounted, and *Show it folded* shows it in place of the net.
- **Double-click in Nets edits outlines in place** (a shape, a line, or the board itself), with no face-on view: D2's *outline editing in the flat* comes with it.
- Hidden in Quick build and Guided; a stored *Nets* in a level that hides it shows the sheets.

Verified
- `tests/netpick.test.ts` (5): a card tray is one piece whose wall tops are free, wall bottoms and base edges folds and wall sides glued joints; every edge lies on the piece's outline or a fold's crease in copy coordinates; a carton's glue seam is joined; a hexagon tray's six turned wall tops are free; one chip per fold with its angle. `tests/store.test.ts`: the choice is written to this browser and kept across views.
- `tests/e2e/nets.spec.ts` (4): Nets in English and Hebrew (a wall's top opens the edge card, a fold opens its joint, the preview's fold slider, the preview turned off); at 800 px the preview shown in place of the net; no switch in Quick build and a stored choice shows the sheets. Looked at in the browser.
- Unit suite and typecheck green; goldens byte-identical (view only); `quickTable.test.ts` lists `'plan.nets'` hidden.

Limitations
- At 800 px the plan dock is crowded and its last buttons can sit under the card.
- The grow card can cover part of the preview.
- Nets of many pieces are a long row (fit and zoom work).

## Milestone 114 (Dieline D2) — building in the flat ✅

`DIELINE_DNA_PLAN.md` D2; `HANDOFF_105-118.md` §114. `src/views/ghost.ts` (`growConfirm`), `src/views/netPick.ts` (`ghostInNet`), `src/views/Plan2D.tsx` (the ghost, three drag handles, the ✓ bar), `src/views/panelTool.tsx` (`ConfirmBarHtml`), `src/views/View3D.tsx`, `src/geom/vec.ts` (`invertX`), `src/easy/features.ts` (`'net.build'`).
- **Grow in the flat**: in *Nets*, a picked free edge shows the new board as a dashed ghost in the net, exactly where ✓ will put it (it is grown on a copy of the design as ✓ grows it, and read from that copy's net). A joint that is not a fold shows its board beside the edge, *Cut as its own piece*. Amber when the hinge is blocked or the net would overlap, with *Cut it as its own piece*.
- **A height handle** on the ghost's far edge: dragged along the board, it snaps to the heights that mean something (the far wall a lid reaches, the neighbours' heights), says which, and otherwise to the grid; Esc puts the height back.
- **✓ in the flat**: a bar beside the ghost, with what it makes (*Closes the box: Tuck flap*), Enter and Esc. The stage and the flat share one decision (`growConfirm`, taken out of the 3D grow): Quick build's lid across a box, Workshop's closing choice, or a plain grow. With building in the flat on, the folded preview has no ghost or ✓ of its own.
- **A flap's length** is dragged by a handle at the middle of its far edge, and a selected rectangular board's size by handles on its free right and far edges (a grown board's far edge). Each drag is one undo step.
- **Outlines are edited in place** by double-click (built with 113).

Verified
- `tests/netbuild.test.ts` (6): the ghost of a lid off a card tray wall, of a hexagon tray's turned wall and of a part-edge grow lies where ✓ puts the board (every corner within 1e-6, compared in the parent board's frame); the ghost's place does not change with its height; one ✓ for both views (a tray top in Workshop offers what closes the box, a free root edge grows a board); three flap-length previews and a commit are one undo step and Esc leaves the design as it was; a board resize is one step and its grown board follows its edge.
- `tests/e2e/nets-build.spec.ts` (English and Hebrew): a card tray in Nets, its back wall's top picked, the ghost and one ✓ only, the height handle dragged, ✓ makes the lid, one undo removes it; a flap's length dragged in one step. `grow-cleanup.spec.ts`, `closures.spec.ts` and `lids.spec.ts` pass after the ✓ was taken out of the 3D grow. Looked at in the browser.
- Unit suite and typecheck green; goldens byte-identical.

Limitations
- Board handles only on edges that grow away from the board's anchor (a root board's right and far edges, a grown board's far edge); tray walls and bases are sized on their cards.
- The ghost of a band fold (a fold with a radius) has not been checked against ✓ (no free edge in the golden designs to try).
- Hand-grown walls in Nets do not offer *Closes the box* (D4, waiting for the owner): start from a tray.

## Milestone C3 (Styles) — the crash-lock (auto) bottom ✅

`SENTENCE_STYLES_PLAN.md` C3. `src/model/cartons.ts` (a `crash` end), `src/model/types.ts` (`TrayBottom`, `ConnGeom.glueAt`), `src/export/annotate.ts`, `src/templates/structures/carton.ts`, `src/templates/styles.ts`, `src/ui/CornersUI.tsx`.
- **A crash-lock bottom** for a carton (ECMA B40): the front and back flaps half the depth deep, each with a 45° crease from its hinge corner to the middle that cuts off a right-angled glue triangle, at diagonally opposite corners; the side flaps meet in the middle. Glued flat at the triangles, it locks itself when the carton is squared up. In 3D it is shown erected and closed.
- **Card only**: the sentence's *bottom* word offers *a bottom that locks itself* on card; the tray card's *Bottom* list has *Crash-lock (auto) bottom*.
- **Glue where it goes**: the triangles carry the word *glue* on the cut plan's *Dimensions* and the spec sheet (a joint's `glueAt`), and so, now, do 112's glue-shaped flaps.
- **One more style**: *Auto-bottom (crash-lock)*, a tuck top and a crash-lock bottom.

Verified
- `tests/c3.test.ts` (5): a crash-lock carton builds with nothing blocking; each major flap has one diagonal crease with equal legs of about half the inside depth, two glue places; folded, the flaps leave less than 2 % of the bottom uncovered (slivers along the walls); card offers it and corrugated never does, and the style is listed on card only; the triangles are named *glue* on the cut plan.
- New golden `carton-card-crash` (looked at); every older golden byte-identical. Unit suite and typecheck green.

Limitations
- The major flaps' free edges are straight: a real crash-lock interlocks them with a stepped edge. The triangles do the gluing; the lock's shape is to try on stock.
- Die Cut Studio's two auto-bottom cards differ in which wall the top tuck folds from; CutForge's top tuck always folds off the back, so they are one style here.
- The sizes are starting values until cut and tried.

## Milestone C4 (Styles) — the gable top box and the one-piece hexagon box ✅

`SENTENCE_STYLES_PLAN.md` C4. `src/templates/structures/carton.ts` (a `gable` top, `GABLE_MIN_DEPTH`), `src/templates/styles.ts` (`hexBox`, `gable`, styles that start at their own sizes).
- **Spike first** (as the plan asked): side walls peaked with a wall insert, roofs grown from the front and back walls' tops at 135°, glued to the peaks by `autoConnect`, solve and check clean, as long as the roofs stop short of the ridge (two roofs meeting edge to edge at 90° collide, and no joint fits there).
- **A gable top** for a carton (card): the side walls peaked to a ridge half the depth above their tops (45° roofs); a roof off the front and the back walls' tops, glued to the peaks, stopping 3 thicknesses and a millimetre short of the ridge; a handle slot in each roof near the ridge, the two in line when folded. In the sentence: *with a gable top with a handle*; it is offered from 50 mm deep (a shallower box's short roofs would overlap the peaks in the flat).
- **A one-piece hexagon box**: a box of six sides with a hinged lid, already one piece on card (the base, six walls and the lid on one net). The *Hexagon box* style is these words; no new geometry.
- **A style that cannot be made at the sentence's sizes starts at its structure's own**, with a note per size changed (*this style is not made at the sizes you had…*), so the card grid lists it whatever the sentence held.
- **Two more styles**: *Gable top box*, *Hexagon box*.

Verified
- `tests/c4.test.ts` (7): a gable top box builds clean in one piece with a handle slot in each roof; the slots line up in 3D within 0.5 mm; wherever the sentence offers a gable top it builds clean, and a shallow box is not offered one; the gable style is listed from the sentence's first words; a shallow box chosen as a gable starts deeper and says so; card only; the one-piece hexagon box builds clean in one piece on card and is not listed in corrugated.
- New goldens `gable-card`, `hex-box-card`; every older golden byte-identical. Looked at in 3D. Unit suite and typecheck green.

Limitations
- The roofs are glued to the peaks: the gable box opens at its bottom (a tuck), not at the top. Die Cut Studio's lock ears into slits near the apex (glue-free, openable) are not built: tabs into the sloped peaks left slots too close to their edge.
- The ridge stays open by about 2.5 mm on card (the roofs stop short).
- Carton ends on tubes of more than four sides are not built: the hexagon box is a box with a hinged lid instead (same use, one piece).

## Milestone C5 (Styles) — flat pieces: two envelopes, a presentation folder, a gift-card holder ✅

`SENTENCE_STYLES_PLAN.md` C5. New `src/templates/structures/flat.ts` (`envelope`, `folder`, `cardHolder`); `src/templates/registry.ts`, `src/templates/styles.ts`.
- **Spike first**: a board grown at any angle from 180° (flat) to 3° (folded almost shut) solves, exports as one piece and checks clean — `DIELINE_DNA_PLAN.md` D7's first question, answered.
- **An envelope** for a card of a given size (2 mm round it), *with pointed flaps* (a diamond or wedding envelope: four pointed flaps with rounded tips, their slopes worked out to leave a 6 mm tip, folded over the board in order — sides, bottom, then the closing flap on top) or *with a pocket and a closing flap* (a portrait wallet: a pocket folded up over three quarters of it and glued at its sides, a closing flap with rounded corners). All 112's shaped flaps.
- **A presentation folder**: two covers joined by a fold, open flat; a pocket folded up on each, stopping short of the spine (the pockets would meet there in the flat) and glued at its outer side; slits for a business card (90 × 50) on the right pocket.
- **A gift-card holder** for a card of a given size (86 × 54 by default): two faces folded open, four corner slits on one for the card.
- Card only. **Four more styles** in the *Flat pieces* group: *Diamond envelope*, *Pocket envelope*, *Presentation folder*, *Gift-card holder*. With C1–C4, nineteen of Die Cut Studio's twenty styles; the pillow box needs curved creases.

Verified
- `tests/c5.test.ts` (5): the diamond envelope is one piece with four folded flaps, the closing flap folding last; the pocket envelope's pocket covers over 60 % of it; the folder is one piece, each pocket glued on one side, two slits on the right pocket; the holder is one piece with four slits; the four styles are listed on card and each builds clean from the sentence's first words, and none is made in corrugated or plywood. `tests/templates.test.ts` takes flat pieces of one to four boards.
- New goldens `envelope-card-pointed`, `envelope-card-pocket`, `folder-card`, `card-holder-card` (looked at); every older golden byte-identical.
- `start-sentence.spec.ts` (every structure and style the sentence lists starts clean in every material) and `styles.spec.ts` pass. Unit suite and typecheck green.

Limitations
- Folded flaps that turn 176–179° lie in the board's own plane in 3D, with only a slight tilt between layers; the model does not stack them a thickness apart.
- The folder's pockets are glued on their outer side only; the spine side is left open.
- The envelope is sized by the card inside; a letter folded in thirds is not a word.

## Milestone 110 (Guided G7) — Guided in the level switch ✅

`GUIDED_MODE.md` G7, `HANDOFF_105-118.md` §110, as the owner decided on 20 November: **Guided is in the level switch for everyone; a new browser and a new class still start in Workshop.** The gallery is the way in only in Guided; Quick build and Workshop keep the sentence's welcome screen. `src/easy/mode.ts`; `README.md`, `EASY_MODE.md`, `LIDS_LINES_PROJECTS_PLAN.md` §10, `DECISIONS.md`.
- **The switch** in Quick build's and Workshop's top bar has three levels, *Guided · Quick build · Workshop*, with no flag (the `?guided` of 105 is no longer needed and is harmless). Where the bar is narrow they are in the ⋯ menu, as before. Guided's menu has *More tools (Quick build)* and *All tools (Workshop)*. A locked class hides all of them.
- **Between levels** nothing changes the design. A design that is more than one box shows, in Guided's Build, *Made with more tools: you can decorate it and send it* with a button to Quick build, or to Workshop when a part needs it.
- **Docs**: README's three levels and a *Guided* section; one line at the top of `EASY_MODE.md` and of the lids plan's §10 pointing to Guided; a *Guided* section in `DECISIONS.md`.

Decisions
- Not done, by the owner's choice: a new browser starting in Guided, and the Worker creating classes in Guided. `quick.spec`'s *a new browser starts in the Workshop* stays as it is.

Verified (the final check of the Guided block, 105–110)
- `tests/guidedmode.test.ts` (14): the switch offers the three levels; a new browser, and a browser with saved preferences but no level, start in Workshop; a locked class cannot switch; a box with a wall added in Quick build is *more* in Guided and unchanged by the trip there and back.
- `tests/e2e/guided.spec.ts` (9): the 8 of 109, and Guided → Quick build → Guided on one design with the design unchanged. `tests/e2e/topbar.spec.ts` gains Guided's bar at the same eight sizes in both languages (the steps, Undo, Redo and the menu always on it); the three-level switch fits Quick build's and Workshop's bars at all eight. `guided-fence.spec`: Workshop and Quick build open on the sentence, with Guided offered in the switch and their own level kept.
- Unit suite (1172 passed) and typecheck green. The full browser suite of app specs: 191 passed. `classroom.spec.ts` with the real Worker: 5 passed. The sentence's walks (6 × 20) and the fuzz suites (Quick build and Guided, 30 sessions) pass. Goldens byte-identical.
- Production build: Guided's own file is 47 KB (15 KB compressed), loaded only in Guided and fetched once the editor is up for offline use; the app's entry is 399 KB (124 KB compressed) beside the shared libraries, as after code splitting.

Limitations (the Guided block)
- Waiting for the owner: real students on a Chromebook; a trackpad and a touch screen for every drag; the Hebrew name of the level (*מודרך*, a placeholder) and every `g.*` string, with the `sen.*` words; the calls of `GUIDED_MODE.md` §4 as taken (joints under *More about this box*, Send waiting for the check, the two missions rebuilt as boxes).
- The arrows and grips are the stage's push-pull handles (14 px cones, a larger invisible target): to be tried by finger.

## Milestone 119 (Shapes R0) — spike: the face graph and the unfolder on fixtures, timed ✅

`SHAPES_TO_DIELINES_PLAN.md` R0. New `tests/spike/facegraph.ts` (a face graph from hand-written polygons or from a kernel mesh), `tests/spike/unfoldSpike.ts` (a greedy unfolder with seeded restarts), `tests/spike/spike.test.ts`; `manifold-3d` 3.5.4 in `package.json` (Apache-2.0, `THIRD_PARTY.md`).
- **Face graph**: flat faces with their outline and holes in their own frame, and the edges they share with the angle inside the solid. From a kernel mesh, adjacent triangles in one plane (within 1e-6 on the normal, 1e-4 mm on the plane) are one face, and each face's boundary is walked into rings (the largest the outline, the others holes).
- **Unfolder** (`MODEL_MODES_RESEARCH.md` §3's pipeline, written fresh): edges joined flattest and longest first with union-find; a join is refused when the joined island would overlap itself (bounding boxes, then separating axes for convex faces or `polygon-clipping` for others, retried on coarser grids, a failure counting as an overlap) or would not fit the sheet in any of 8 turns; restarts with seeded jitter until the budget runs out, keeping the fewest islands, then the shortest cut. No flaps yet.

Numbers (Node 22, vitest; the card sheet less its margins, 490 × 290 mm; budget 400 ms; seed 1):

| Fixture | Faces | Edges | Inside corners | Extract ms | First pass ms | Unfold ms | Restarts | Islands | No overlap | Fits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cube 60 | 6 | 12 | 0 | 0.8 | 0.9 | 1 | 1 | 1 | yes | yes |
| hexagonal prism (r 40, h 60) | 8 | 18 | 0 | 0.3 | 0.2 | 0 | 1 | 1 | yes | yes |
| square pyramid (base 80, h 60) | 5 | 8 | 0 | 0.2 | 0.3 | 0 | 1 | 1 | yes | yes |
| diamond, 8 sides (r 40) | 17 | 32 | 0 | 0.5 | 1.4 | 1 | 1 | 1 | yes | yes |
| L-prism (80 × 70, h 50) | 8 | 18 | 1 | 0.4 | 4.6 | 5 | 1 | 1 | yes | yes |
| house (80 × 60 × 50, roof 30) | 7 | 15 | 0 | 0.3 | 0.1 | 0 | 1 | 1 | yes | yes |
| cylinder, 12 facets (kernel) | 14 | 36 | 0 | 5.5 | 0.5 | 1 | 1 | 1 | yes | yes |
| box with a through-hole, 16-facet hole (kernel) | 22 | 60 | 16 | 7.2 | 3.1 | 401 | 434 | 2 | yes | yes |
| sphere, 8 facets (kernel) | 32 | 48 | 0 | 2.1 | 0.6 | 1 | 1 | 1 | yes | yes |
| torus 12 × 8 (kernel) | 96 | 192 | 48 | 3.8 | 8.9 | 407 | 51 | 2 | yes | yes |
| torus 16 × 12 (kernel) | 192 | 384 | 96 | 4.6 | 45.2 | 400 | 15 | 5 | yes | yes |

In Chromium (the dev server, the same unfolder, after a warm-up), first pass / whole unfold with the 400 ms budget:

| Fixture | 1× CPU | 4× CPU throttling (a school Chromebook, roughly) |
| --- | --- | --- |
| diamond (17 faces) | 1.5 ms / 2 ms, 1 piece | 1.3 ms / 1 ms, 1 piece |
| torus 12 × 8 (96 faces) | 10.8 ms / 403 ms, 2 pieces | 31.8 ms / 407 ms, 2 pieces |
| torus 16 × 12 (192 faces) | 35.3 ms / 417 ms, 5 pieces | 167.2 ms / 488 ms, 6 pieces |

- **Every fixture unfolds with no overlap and fits the sheet**; the same seed gives the same net.
- **Extraction is cheap** (under 8 ms for every kernel fixture); unfolding is what costs. A form that unfolds to one piece is done in its first pass; one that does not spends the whole restart budget looking for fewer pieces.
- **Found on the way**: a revolution's facets are planar only to about 1e-7, so a coplanarity tolerance of 1e-9 split every quad into two triangles (a 192-face torus became 384 faces); and `polygon-clipping` throws on many of the near-degenerate pairs that gives. Separating axes for convex faces avoid it and are much faster.

Limitations
- No flaps in the overlap test yet (R5 adds them, so real nets are a little larger); no coplanar merges across shapes (the house is written merged; R3's `tidy` does it).
- Timed on this machine, not on a real Chromebook; the 4× throttle stands in for one.

## Fix: a teacher's batch cuts kiss-scored pieces as the student's export does ✅

`HANDOFF_105-118.md` finding 8, checked and fixed. `src/export/batch.ts`.
- **The batch now mirrors a kiss-scored piece** in its box and adds its *THIS SIDE UP (kiss scores)* note (milestone 66), as `prepareExport` does: before, it would have been cut with its scored face down. On such a piece the note takes the upper half and the owner's name the lower half.
- **Arcs are refitted** before compensation, as in the student's export (milestone 62): before, a batch cut curved outlines as many short lines.

Verified
- `tests/regress/repro-batch-kiss-mirror.test.ts`: a one-design batch of a kiss-scored corrugated tray gives exactly the student's export's scores and cuts, with more guide text (the note and the name). It failed before the fix. The batch tests (`batch.test.ts`, `fuzz/batch.test.ts`, the batch regressions) pass; unit suite and typecheck green; goldens byte-identical.

## Milestone 116 (Dieline D5b) — board grades ✅

`DIELINE_DNA_PLAN.md` D5b; `HANDOFF_105-118.md` §116. New `src/model/boards.ts` (`BOARD_GRADES`, `FAMILIES`, `ALL_PROFILES`, `profileById`); `src/model/materials.ts` (`CARD_FOLD_MAX`, `foldsAsCarton`); `src/ui/MaterialDrawer.tsx`, `src/ui/BoardMaterial.tsx`, `src/teacher/TeacherApp.tsx`, `src/ui/materialName.ts`, `src/ui/TopBar.tsx`, `src/ui/Library.tsx`, `src/main.tsx`; the structures and Quick build's carton recipe; `src/easy/features.ts` (`'drawer.grades'`).
- **Ten more boards** beside the four classroom materials: folding boxboard 0.3, 0.4 and 0.6 mm; greyboard 1, 1.5 and 2 mm (card, bending far less tightly); corrugated B flute 3 mm and double wall 7 mm; plywood 4 and 6 mm. Kerf scaled from the nearest classroom board by the square root of the thickness, its clearance (plywood 0.1), no fold allowance. Starting values, said so under the list.
- **The material drawer's *More boards…*** (Workshop) lists them by family, each family's classroom board first; choosing one changes the material as the four buttons do (a stated inside size is kept). A board's own material and a teacher's class material offer the grades too.
- **Card folds up to 1 mm**: greyboard over 1 mm makes no carton, sleeve, drawer or flat piece in the sentence and Quick build's *Carton* makes it an open box (it was offered folding cartons before, `HANDOFF_105-118.md` finding 3). Corrugated keeps its rules (cartons with shipping flaps up to 4 mm, sleeves up to 4 mm), so double wall 7 mm makes neither.
- The welcome screen's step 1 keeps the four classroom materials.

Verified
- `tests/boardGrades.test.ts` (4): ten grades, none clashing with a built-in id, each found and named; every grade survives a save and load, cuts a tray (and the organiser where offered) with nothing blocking, and exports; greyboard over 1 mm folds into nothing, double wall makes no carton or sleeve, B flute a carton with shipping flaps only, thin boxboard folds as card; with the inside stated, card 0.5 → greyboard 2 mm keeps the inside to 1e-6 while the outside grows by 3 mm. The existing carton, size-intent, board-material and template tests unchanged.
- `tests/e2e/grades.spec.ts` (2): Workshop's *More boards…* → *Greyboard 2 mm*, the pill names it and the box keeps its inside; no *More boards…* in Quick build.
- Unit suite and typecheck green; goldens byte-identical (the grades are data).

Limitations
- Every grade's kerf, clearance and greyboard's bend are starting values, unverified on stock (D10's real-cut list).
- Greyboard 1 mm folds (the ceiling is 1 mm inclusive).

## Before a deploy (20 November): the full browser run, two dock fixes, the crash-lock held back ✅

`src/styles.css`, `src/views/Plan2D.tsx`, `src/model/cartons.ts` (`CRASH_LOCK_OFFERED`), `src/templates/structures/carton.ts`, `src/templates/styles.ts`, `src/ui/CornersUI.tsx`, `tests/c3.test.ts`.
- **The full browser run of the app specs** (every spec but the classroom one, which needs the Worker; the `SHOTS` specs skip themselves): 204 passed, 61 skipped, 1 failed: `split.spec.ts`'s *Save material* sat under the design card, because milestone 113's *Sheets · Nets* switch made the plan dock wider.
- **The plan dock wraps** before the card at the inline end (in the Net view, where the card is over the folded preview, it may use the plan's width), and *Fit* frames the sheets below it however many rows it has.
- **The ✓ of a grow in the flat sits in the middle of its ghost** (at its far edge it could run under the wrapped dock, a lid grown towards the top).
- **The crash-lock bottom is held back** until the owner has confirmed the patent question: `CRASH_LOCK_OFFERED = false` hides the sentence's *a bottom that locks itself*, the *Auto-bottom* style and the tray card's option (shown only on a tray that already has one). The engine still builds it, so a design that has one opens and cuts as before; one line turns it back on.

Verified
- After the fixes: `split.spec.ts`, `nets.spec.ts`, `nets-build.spec.ts`, `text-pack.spec.ts`, `spec.spec.ts`, `transform-2d.spec.ts` and `outline-2d.spec.ts` (19 passed); `styles.spec.ts` and `start-sentence.spec.ts` with the crash-lock held (7 passed).
- `classroom.spec.ts` with the real Worker (`wrangler dev`, a local D1 and R2): 5 passed. The production build (`npm run build`) succeeds and ships no WASM (the shape kernel is used only by the R0 spike's test).
- Unit suite (1265 passed) and typecheck green; goldens byte-identical.

## Milestone 120 (Shapes R1) — the shape modeller on this branch ✅

`SHAPES_TO_DIELINES_PLAN.md` R1. Brought **by path** from `claude/guided-mode` at `e450c6b` (*after milestone 60: hands-on fixes to the sketch and shape tools*), never merged: `src/sculpt/**` (the kernel, primitives, Solid / Hole, Combine, scale, turn, rounded corners, sketches on the floor and on upright planes extruded or revolved, the 2D sketch view, `faces.ts`, the outcome registry), `src/views/polyDraw.ts`, `src/ui/SketchTopBar.tsx`, and the tests `sculptkernel`, `sculptscale`, `sculptsketch`, `sculptfaces`, `outcomes`. `src/waffle/**`, the `waffle` field and the waffle tests stay on PR #6.
- **The design fields** `kind?: 'waffle'` (read as *has shapes*, `isSculpture`), `sculpt?` and `outcome?: 'fold' | 'boards' | 'waffle'` (`src/model/types.ts`). **Absent `outcome` means not made yet** (decision 11); on PR #6 it meant the waffle, so a waffle file opened here opens as shapes not made yet, its `waffle` field kept untouched. No schema bump; `checkSculpt` reads the shapes on load and drops an unknown outcome.
- **The outcome hooks** (`registerOutcome`, `outcomeHooks` in `pieces.ts`) only for an outcome whose parts are not the design's boards; `partOf` is generic (`{ group, id, label }`). *Fold it* and *Build from boards* will make ordinary panels and connections, so they register no hooks: their pieces and checks are the boards'.
- **The stage bar** (`src/ui/ShapeStageBar.tsx`, in the top bar instead of the level switch): *1 Shape · Fold it · Build from boards*. An outcome's button works once its code registers `make` with `registerOutcomeUi`; until then it is greyed, *· Coming next*.
- **The welcome screen's *Shapes*** row (feature `'start.shapes'`: Workshop only, `'hide'` in Quick build and Guided).
- The store's sculpt state, the sketch session and its own history, `clickShape`, the `'shape'` selection and the sculpt keys; `src/sculpt/load.ts` loads the kernel when a sculpture opens (box designs never download it); the Worker serves `.wasm` as `application/wasm` whatever the static assets say (`wasmTyped`, the check `WAFFLE_MODE.md` §12 left open).
- `src/sketch/**` was already here (102) and is used as it is; the branch's older copy was not brought.

Verified
- The ported sculpt tests (98) pass. `outcomes.test.ts` rewritten for this branch: nothing in `src/sculpt` imports `src/waffle` and `src/waffle` is absent; a sculpture with no outcome has no pieces and no checks; an outcome with hooks gives both; every known outcome survives a save and load and an unknown one is dropped. `worker/api.test.ts`: a `.wasm` file comes back as `application/wasm`.
- `tests/e2e/shapes-port.spec.ts`: *Shapes* from the welcome screen, a box sized 80 × 80 × 40, a cylinder made a hole, both combined; *Fold it* and *Build from boards* greyed with *Coming next*; no level switch; no page errors.
- Unit suite and typecheck green; goldens byte-identical. A look in the dev server at 1400 px: the top bar fits.

Limitations
- `sculptscale`'s percent test was cut to this branch's `evalNumber` (milestone 97 reads a percent only as the whole entry; `50%+5` is not read).
- The shape stage's cards and the sketch view keep the waffle branch's look; R2 and R13 change the workplane.

## Milestone 121 (Shapes R2) — the Tinkercad-style workplane ✅

`SHAPES_TO_DIELINES_PLAN.md` R2. `src/sculpt/build.ts` (`flatCorners`, taper, hull), `src/sculpt/ops.ts` (`PRIMITIVES`, `hullShapes`), `src/sculpt/workplane.ts` (new: `upTo`, `dropOffset`), `src/sculpt/ui/commands.ts`, `src/sculpt/ui/SculptView3D.tsx`, `src/sculpt/ui/SculptCard.tsx`, `src/sculpt/polyhedron.ts` (roles); `Shape3.taper`, `crown`, `table`, `hull` and the kinds `wedge`, `roof`, `gem` (optional, checked on load).
- **Flat-faced shapes**, each a tile on the Shapes card: a **wedge** (full height at the back, a slope to the front edge), a **roof** (a triangular prism, its ridge along its width) and a **diamond** (`gem`: sides 5–12, default 8; width, depth and height; crown height; table as a share of the width, default 55%; a pavilion to a point, a girdle fitted to the width and depth, a crown up to a flat table). Each is the hull of its corners, so every face is flat.
- **Taper** on a box and a prism: *Top width* and *Top depth* as a percentage of the base, making a frustum (a tapered planter).
- **Hull**: with several solids selected, *Wrap in a hull* (beside *Combine*) makes one flat-faced body round them, a group marked `hull`, so ungrouping gives them back. The quickest way to a low-poly form that folds well.
- **Typed sizes** were already on the handles (*W*, *D*, *H* labels open a number box) and the card.
- **Nudges**: arrow keys move the selection 1 mm, Shift 5 mm (was 10); **a key held down is one undo step** (a transaction committed when the key comes up), along the workplane's own axes when there is one.
- **The workplane**: *W*, then a click on a face, sets it (Shift takes the face's other side; a click on the floor puts it back on the floor). It is drawn as a blue square with a grid. New shapes from the tiles stand on it, turned to it. *D* drops the selection onto it (onto the floor when there is none): its lowest point comes to the plane.
- **Face roles**: a wedge's `bottom`, `+x`, `-x`, `-z`, `slope`; a roof's `bottom`, `+x`, `-x`, `slopeFront`, `slopeBack`; a diamond's `table`, `crown<k>`, `pavilion<k>`; a hull's `h<azimuth>.<elevation>`.

Verified
- `tests/flatshapes.test.ts` (12, with the kernel): a wedge and a roof have 5 flat faces, a diamond 17, a tapered box 6; an 8-sided diamond's face graph has a table, 8 crown and 8 pavilion faces; a wedge and a roof name their slopes; a gem as the hull of a prism and an upside-down pyramid is one body keyed by the hull; a tapered hexagonal planter keeps 8 faces and folds from card; the new fields survive a save and load and a bad taper is dropped; a shape placed on a workplane stands on it; *D* drops a raised box onto a level and a sloped plane; the plane's axes lie in it.
- `tests/sculptkernel.test.ts`: the wedge's, roof's and diamond's volumes within 0.5% of their formulas.
- `tests/e2e/shapes-port.spec.ts` updated: since 126 *Fold it* and *Build from boards* work once there is a shape.
- A look in the dev server: the eleven tiles, a diamond with its sides, crown and table, the workplane's hint.

Limitations
- **ΔX and ΔZ readouts** that stay after a move and can be typed into, with Tab, are not built (132 adds the second half of the workplane).
- A shape dragged from its tile does not yet lie down on the face under the pointer; the tiles place it on the workplane.
- The workplane is not saved with the design; turns do not yet follow it.

## Milestone 122 (Shapes R3) — the face graph with stable keys ✅

`SHAPES_TO_DIELINES_PLAN.md` R3 (§4.2). New `src/sculpt/polyhedron.ts` (the bridge: `shapePolyhedron`, `facetedCopy`, `DEFAULT_FACETS`); `polyIssues` and `MAX_FACES` in `src/model/polyhedron.ts` (its builders came with 123).
- **The bridge**: the solid is built with Make's facet counts on a copy (12 per full turn for card, 8 for boards; a shape's own *Faces* or a per-shape count wins; an extrusion's curves get a quarter of it), its mesh merged, each triangle named by the shape its run came from and its **role in that shape's own frame**, and the face graph made from them. Adjacent coplanar triangles are one face, across shapes too (keys joined with `+`).
- **Roles** (§4.2's table): a box's `top`, `bottom`, `+x`, `-x`, `+z`, `-z`; a prism's and a pyramid's `side<k>` by the footprint edge whose outward normal is nearest (a rounded corner's facets `corner<k>/a<deg>`); a cylinder's and a cone's `cap0`, `cap1` and `f<i>` by angle round; a sphere's `f<i>.<j>`, a torus's `f<i>.<j>` round and across the tube; an extrusion's `top`, `bottom`, `seg:<segment id>` over a straight line and `seg:<id>/f<k>` along a curve. A Hole's faces are `hole:<shape>:<role>`. Facets of curves are marked `ruled` or `curved`.
- **Checks** (`polyIssues(P, t)`): faces narrower than about 1.5t across (twice their area over their outline), faces under 4t², more than 200 faces (119's limit), and the graph's own (an open or non-manifold edge).
- **Fix found on the way** (`src/sculpt/build.ts`): the shape cache was keyed by geometry only, so two shapes alike shared one body and its faces were credited to the first one built. The key now includes the shape's id.

Verified
- `tests/sculptpolyhedron.test.ts` (8, with the kernel): a box gives 6 faces keyed by role and 12 edges at 90°; an L-extrusion 8 faces, 6 of them `seg:` walls, one edge at 270°; two boxes flush merge their top, bottom and two long sides (keyed by both); a box with a through-hole has a top and a bottom with one hole each and 12 `hole:` walls, its rim 24 edges at 90°; a cylinder at 12 facets 14 faces, 12 edges at 150°, the shape's own `facets` untouched; resizing and moving a box, and moving an extrusion's sketch points, keep every key; 8 and 12 facets keep every key but the facets'; a 1 mm slab is a sliver at 3 mm, a 32-facet sphere is too many faces.
- The ported sculpt tests and `outcomes` still pass; typecheck green.

Limitations
- A diamond's roles (`table`, `crown<i>`, `pavilion<i>`) come with its primitive (121).
- A revolve's facets are keyed by direction (`f<i>.<j>`), not by its profile's segments.

## Milestone 123 (Shapes R4) — free boards and seam folds in the engine ✅

`SHAPES_TO_DIELINES_PLAN.md` R4 (§4.3). New `src/model/seamFold.ts` (`seamFit`, `seamGlue`), `src/model/seamNet.ts` (`addSeamNet`), `src/model/polyhedron.ts` (the face graph's types and builders, written now because R4's solids need them; R3 adds the kernel bridge); `addFreePanel` in `src/model/ops.ts`; `Panel.src`, `Connection.seam` and `Connection.src` (optional, checked on load, no schema bump).
- **Free boards** (E1, E5): `addFreePanel` puts a polygon on any plane, **material side up** (v turned round when the material lies against u × v), so its creases are scored on the face that ends up inside, as every board the app makes. Edge *i* of the outline as given is always `e<i>`, even when the points are stored in the other order. Holes become cut-out shapes.
- **Seam folds** (E2): a fold between two free boards whose edges lie on one line, at **any dihedral from 5° to 355°** (175–185° are one plane). It is a tray corner made a fold (`hingeOf` its child), with `seamFit` in place of `cornerFit` in `cornerFoldXform`, `foldBand` and the fold view's hinge (which now turns past 180° the right way for an inside corner). **Nothing is cut back**: the crease's place (`foldLay`, the overhaul's rule) takes up the thickness. Valley or mountain from the dihedral's side.
- **Seam glue and slit locks at any angle** (E4): a tapered flap on the owner's edge, scored, folded onto the receiver's inside face; recorded for the fold view as tray corners' flaps are. A slit lock is made from it by the existing `slitLock`.
- **`solve` never re-fits a seam's kind** (the maker chose it), and seams are `auto: false`, so `autoConnect` after an edit neither removes nor adds one.
- `netOverlaps` leaves out the strip two boards of a seam fold share along their crease (one board, counted twice).
- `addSeamNet(d, polyhedron, plan)`: a board per face, seam folds along the plan's fold tree (walked from each island's first face), glue (or `plan.seam`'s kind) on every other edge, ids from keys (`f:<face>`, `s:<edge>`).

Verified
- `tests/seamfold.test.ts` (25), on hand-written solids (`tests/solids.ts`: a box, prisms, a pyramid, a diamond, an L-prism, a house): the face graphs are closed with the expected angles (90°, 120°, about 56° and 108°, 150°, one 270°); a cube, a hexagonal prism, a square pyramid and a 12-sided tube each fold into one piece with no overlap, every seam laid out; at fold 1 the fold view is where the boards are, at 0 they lie in one plane; every glue flap is drawn folded with the area it has in the net; the cube's flaps lie on their receivers' inside faces, inside their outlines; slit locks on a cube, the tube and the pyramid have their tongues and slits; `autoConnect` changes no seam; boards and seams survive a save and load.
- **Four new goldens**: `seam-cube-card`, `seam-hexprism-card`, `seam-pyramid-card`, `seam-tube12-card` (the tube's net does not fit the card sheet, so milestone 69 cuts its top off with flaps). Every old golden byte-identical. Unit suite and typecheck green.

Limitations
- Neighbouring boards at a shared corner overlap by under 1 mm² in the flat net (the crease strips meet there); cut as one outline it only stops a V-gap short of its corner. The tests take 1 mm² as their floor for seam nets.
- Edges on a face's holes are left unjoined (openings, 130). The goldens' nets are a simple breadth-first tree; the unfolder (124) chooses real ones.
- The seam flap's depth and taper are R6's to choose; for now 8–15 mm by thickness, at most a third of the seam, tapered at 45°.

## Milestone 124 (Shapes R5) — the unfolder ✅

`SHAPES_TO_DIELINES_PLAN.md` R5 (§4.4). New `src/model/unfold.ts` (`unfold`, `islandOrder`, `ringsOverlap`, `fitsSheet`, `flapTaperLen`); `Connection.flapTaper`; `addSeamNet` takes the unfolder's flap depths and tapers.
- **The pipeline** of `MODEL_MODES_RESEARCH.md` §3, written fresh from R0's spike: edges in order of weight (flat and long first; *Fewer cuts* weights length six times more), a greedy join with union-find refused when the island would overlap itself or no longer fit the sheet in any of 8 turns, then restarts with seeded jitter, keeping the fewest pieces, then the shortest cut.
- **Flaps are in the overlap test.** When a join closes an edge inside the island (one that will never fold), that edge's flap must fit there or the join is refused. A flap goes on the face with the smaller area-to-perimeter ratio (on a near tie, the one carrying fewer flaps, so they alternate round a chain), at full depth at 45°, then narrowing more steeply at its ends (2.5× and 5× its depth along the edge), then at 60% and 35% depth, on either face. The edges between pieces get theirs last; one that still does not fit is dropped and listed. **A dropped flap counts as a piece** when restarts are compared.
- **Fixed edges first**: a fixed fold is joined before anything else (listed if it cannot be); a fixed cut is never folded. **Open faces** are left out.
- **Deterministic**: the seed is a string (the design's id); restarts are counted (40 by default), not timed, with a 2 s safety cap, so the same design gives the same net on any machine. The pieces are listed largest first, each face's place in its piece's flat layout returned.
- **Issues**: a face larger than the sheet; a split, saying why (the sheet, an overlap, the student's cuts); a dropped flap; a fixed fold that could not be made.

Verified
- `tests/unfold.test.ts` (21): a cube, a hexagonal prism, a square pyramid, an 8-sided diamond, an L-prism, a house and a 12-sided tube each unfold on A4 with no face or flap overlapping and every flap placed, each piece fitting; a cube is one piece with 7 flaps; the same seed gives the same folds and flaps; a fixed cut is not folded and a fixed fold is; a 270 × 30 × 150 box is split to fit A4 with *split: sheet*, and a face larger than the sheet is named; open faces are left out; *Fewer cuts* cuts no more; through the engine (`addSeamNet` with the unfolder's folds, flap sides, depths and tapers), each fixture cuts as many pieces as islands with no overlap and no broken seam.
- Timing (Node, the card sheet): 14 faces 1 ms, a 32-face sphere 8 ms, a 72-face sphere 10 ms (one piece, no restarts); a 144-face torus 35 ms first pass, 505 ms with 40 restarts, 9 pieces. Unit suite and typecheck green.

Limitations
- A dense, saddle-shaped form (the torus) splits into many pieces: the flap rule is strict. Its net is still cuttable and glueable.
- Edges on a face's holes are not joined or flapped (openings, 130); a through-hole's walls come out as a tube of their own.
- No merge pass after the restarts: a greedy pass already tries every edge, so it would find none.

## Milestone 125 (Shapes R6) — joints chosen for the material and its thickness ✅

`SHAPES_TO_DIELINES_PLAN.md` R6 and decision 12. New `src/model/jointChoice.ts` (`chooseJoint`, `closingFace`, `flapDepthFor`, `tabsFor`, `fingersFor`); `src/model/reassemble.ts` (`reassemble`, `rechooseJoints`, `clearMade`; the engine half of 126 and 127); `Design.make` (`MakeSpec`), `Connection.why` and `Connection.picked` (optional, checked on load, no schema bump); 14 *why* strings in English and Hebrew.
- **One pure chooser** for every seam: a fold kept in a net, a cut seam in a net, or a corner between boards, by material, thickness, length, angle, the faces' spans and whether the seam is on the face that closes last. Each choice says why (`joint.why.*`).
  - **Card up to 1 mm**: folds folded; cut seams a glue flap, 8–15 mm by thickness and never deeper than a third of the smaller face; a **slit lock** on the face that closes last when the seam is 25 mm or more. Greyboard over 1 mm: nothing folds; seams glued.
  - **Corrugated**: folds creased, a **cut-crease** on 4 mm board folding under 30°; seams of 30 mm or more (3 tabs' worth on 4 mm) **tabs and slots**, tabs max(8, 5t) wide; shorter ones glued (12–20 mm on 1.6, 18–25 mm on 4); board corners outside 30–150° glued.
  - **Plywood**: **fingers** at 60–120°, an odd count about max(3t, 10 mm) wide; **tabs and slots** at 30–60° and 120–150°; **butt and glue** under 4t or outside 30–150°; **the board that closes last** (the largest facing up) carries tabs into the others, so it drops in from outside.
- **A seam's tabs and slots** use the ordinary corner geometry (`cornerTabs`), so corrugated nets get them with no new joint code.
- **A change of material or thickness** (`rechooseJoints`) chooses again every made joint the student did not pick (a kind set on the joint card marks it `picked`) and says how many changed; a fold stays a fold.
- **The reassembler** (§4.5): clears what the last Make made (hand-made boards stay), then *Fold it* (the unfolder with the chooser's flap depths and the material's thickness as the flaps' clearance, `addSeamNet`, the chooser's kind and sizes on each seam, the unfolder's flap size kept) or *Build from boards* (a board on each face, material inward, corners found by `autoConnect`, each given the chooser's joint and its edge's key; corners it could not join listed). Ids from keys; the design's id seeds the unfolder.

Verified
- `tests/jointChoice.test.ts` (16): one test per rule above, the board that closes last, and a change of material that re-chooses every joint but the one the student picked (a pyramid from card to corrugated; a plywood box 3 to 6 mm).
- `tests/reassemble.test.ts` (11): a cube, a hexagonal prism, a pyramid, a diamond, an L-prism and a house folded from card cut as many pieces as the unfolder made, with no overlap, nothing broken, ids from keys, every joint with a *why*; the same shapes give the same design twice; Make again replaces only what it made; a corrugated cube folds with tabs on its long seams; the spec survives a save and load; a plywood box is six boards, eight finger corners and a lid on four tab corners it carries; a diamond's corners outside 30–150° are listed in plywood; a corrugated 4 mm house has tabs where the corners allow.
- **Six new goldens**: `make-cube-card-0.5`, `make-cube-corr-1.6`, `make-cube-corr-4`, `make-cube-ply-3`, `make-house-card`, `make-house-ply-3`. Every old golden byte-identical. Unit suite and typecheck green.
- `netOverlaps` now leaves out the corners where creased neighbours meet (four times the crease's width), as the export check runs it at 0.5 mm².

Limitations
- **Every flap depth, tab width, finger size and the slit lock's minimum are starting values, unverified on real stock** (the owner's testers check one cube per material before 133).
- The house folds in two pieces on the card sheet: the unfolder's flap rule is strict.
- Board corners outside 30–150° are left unjoined and listed; their one-click fixes come with 127's Make card.

## Milestone 126 (Shapes R7) — *Fold it*, in one click ✅

`SHAPES_TO_DIELINES_PLAN.md` R7, decision 0. New `src/make/` (`run.ts`: `makeNow`, `canMake`, `materialFor`, `polyOf`; `MakeCard.tsx`; `register.ts`; `unfold.worker.ts`), registered with the shape kernel's loader (`App.tsx`); `MakeSpec.seams`; the stage-2 outcome chooser removed from the shape card (the stage bar has the two buttons).
- **The click**: *Fold it* on the stage bar makes the face graph (12 faces round a curve), unfolds it (in a **Worker** over 40 faces, R0's decision; on the main thread under), reassembles it as one undo step, switches to stage 2 on the **Workshop's own 3D view of the made boards** and plays the fold from flat to closed over 1.5 s. The material is the design's when it folds, else card. No dialog comes first.
- **The Make card** (only to refine): the material pill (a change re-chooses every joint not set by hand and says how many changed; a material that cannot fold offers *Build from boards*), *N pieces · N folds · N flaps*, *Seams* (Automatic · Glue · Slit locks · Tab and slot), *Pieces* (Fewest pieces · Fewer cuts), *Faces around a curve* when a curved shape is there, how the net was split (said, not listed as a problem), the problems with their fixes, and *Make again*.
- **Problems and fixes**: a face larger than the sheet (*Make it smaller*: every shape 80%); a flap with no room (*Tab and slot instead*, *Fold it here*); too many faces, a tiny face or a sliver (*Fewer faces*); an open shape. Each fix makes the model again with the change.
- *1 Shape* on the stage bar goes back to the shapes with nothing lost; the made boards stay in the design.

Verified
- `tests/e2e/make-fold.spec.ts`: *Shapes* in card, a house drawn as a gable end extruded 60 mm, one click on *Fold it*: the design is folded (7 boards, 5 or more folds), no problem listed, the exported SVG has as many outer outlines as the net has pieces, *1 Shape* returns to the shapes with the boards kept; no page errors.
- A look in the dev server: the house folds up from its net and closes, slit locks on the roof's last face.
- The engine tests of 125 (`reassemble.test.ts`) cover the cube, prism, pyramid, diamond, L-prism and house folded from card; unit suite and typecheck green.

Limitations
- **Leave open** (faces clicked in 3D) and **fold / cut by edge** in 3D are not built yet: the spec carries them (`open`, `edges`) and 130 adds the picking. Edges and faces in 3D are not highlighted with the Net view.
- **Seam numbers** on the guide layer come with the assembly steps (131).
- *Make it smaller* scales every shape by 80%; it does not split a face.
- A sharp fold (under 20°) is not yet warned about.

## Milestone 127 (Shapes R8) — *Build from boards*, in one click ✅

`SHAPES_TO_DIELINES_PLAN.md` R8. `src/model/reassemble.ts` (boards: the walls round a through-hole, *no board goes in last*), `src/make/run.ts`, `src/make/MakeCard.tsx`.
- **The click**: *Build from boards* makes a board on each face (material inward, so the shape is the outside), joins the corners as for any box (`autoConnect`), gives each the chooser's joint and its reason, and shows the boards coming in one after another, **the board that closes last last** (milestone 40's assembly animation). The material is the design's when it makes boards, else plywood 3 mm.
- **Holes stay cut-outs.** A through-hole's walls meet the boards round it along the hole's rim, where no corner joint can be cut: they are left out and listed (*A hole's 12 walls are left out*).
- **Problems**: a corner outside 30–150° (*Glue it* on corrugated, *Fold it instead*, *Fewer faces*); no face facing up, so no board can go in last (*Fold it instead*); the face graph's own (tiny, sliver, too many faces).

Verified
- `tests/e2e/make-boards.spec.ts`: *Shapes* in plywood, the house, one click on *Build from boards*: 7 boards, 15 corners, none broken, fingers and tabs, no problem listed, 7 outlines in the SVG, *1 Shape* keeps everything; no page errors.
- `tests/reassemble.test.ts` (17): a plywood box's boards span the shape's outside sizes exactly (100 × 80 × 90); an L-shelf and a hexagonal planter join every corner with nothing listed; a tall spire has no board to put in last; and 125's box, diamond and house cases.
- A look in the dev server: the plywood house, fingers on the walls and angled tabs on the roof.

Limitations
- **Size is: Inside** is not offered for made boards: it needs the solid offset outwards by the thickness, which is left for later.
- *Square this corner* (the protractor, 132) is not among the fixes yet; *Merge into neighbour* is not built.
- The boards' assembly animation is the Workshop's (pieces drop in from above in order), not a path per board.

## Milestone 128 (Shapes R9) — Guided: a pyramid and a diamond ✅

`SHAPES_TO_DIELINES_PLAN.md` R9. New `src/model/solids.ts` (`solidPoly`, `SOLID_LIMITS`); `src/guided/things.ts` (`SHAPE_THINGS`, `startSolid`), `src/guided/box.ts` (`kindOf` → `'solid'`), `src/guided/steps/Build.tsx` (`SolidSliders`); `MakeSpec.solid` (checked on load, any design: `checkMake`).
- **Two things in Guided's gallery**: *Pyramid* (width, height, sides 3–8, default 4) and *Diamond* (width, height, sides 6–10, default 8; the crown 27% of the height and the table 55% of the width, fixed). **Always folded from card**, whatever material the student chose.
- **No kernel**: Guided starts a thing at once, so the two are face graphs written in the engine, keyed exactly as the shape modeller keys a pyramid and a diamond, and made with the same reassembler (*Fold it*, the chooser's joints, the unfolder seeded by the design's id).
- **Build** shows only their three sliders; a change makes the model again as one undo step through Guided's guard, keeping every decoration by face (129's carry-over). No workplane, no stage bar, no Make card. **Decorate and Send** work on the made boards unchanged; Send's printed plan lists the seams in order (131).
- **Found on the way, in the unfolder** (`src/model/unfold.ts`): it now lays a folded face across its parent's edge by the crease's overlap (t / tan(α/2)), as the engine does; it allows faces and flaps a corner sliver under 3t² by area (the export check allows 4t²); it fits a net to the sheet only square to its first board (0° or 90°, as the cut plan lays a piece) and roots each piece at that board; and it fits a slit lock's flap with its tongue. Before, a few sizes made nets the export check (and so Guided's guard) refused, or the cut plan cut again.
- Feature rows: shown in Guided; the gallery is Guided's own (Quick build and Workshop have no gallery of these).

Verified
- `tests/guidedShapes.test.ts` (6): the gallery offers both; each is folded from card even when started in plywood, with nothing to fix, its folded preview closed, its seams numbered; a diamond made 10-sided and 140 wide keeps an engraving on its table; the spec survives a save and load; **a sweep of every size the sliders offer** (both shapes, every side count, the smallest, middle and largest width and height: 108 models) folds with no net overlap, so the guard never refuses a slider.
- `tests/e2e/guided-diamond.spec.ts`: Guided, the gallery's *Diamond*, its sides slider to 10 (21 boards), no workplane or Make card, Send, an SVG downloaded; no page errors. `make-fold`, `make-boards` and `shapes-port` pass again.
- **Four goldens changed on purpose** (125's `make-cube-card-0.5`, `make-cube-corr-1.6`, `make-cube-corr-4`, `make-house-card`): the unfolder's crease overlap and square sheet fit give different nets. Every older golden byte-identical. Unit suite (1,505) and typecheck green.

Limitations
- The two are not offered in Workshop's welcome screen (the plan's *Workshop's library*); a Workshop student builds them from the *Diamond* and *Pyramid* tiles under *Shapes*.

## Milestone 129 (Shapes R10) — linked to the shape ✅

`SHAPES_TO_DIELINES_PLAN.md` R10, decision 3. `src/model/reassemble.ts` (`gather`, `applyCarry`, `detach`, `Lost`), `src/make/run.ts` (`shapesChanged`), `src/make/MakeCard.tsx`; `MakeSpec.shapeKey`.
- **Ids from keys** (since 123), and **the spec is stored** with the shapes' key when made.
- **Carried across a remake by key** (§4.5 step 3): every hand-added shape, text, line, edge flap and fold-over on a board whose face still exists; every joint kind the student picked (the joint card marks it) with its options (finger and tab counts, crease, tab lock); every fold the student cut or kept in the cut plan (milestone 69's choice), which becomes a fixed cut or fold for the unfolder.
- **What has no face or edge left is listed once** (*2 of your changes could not be kept*) and dropped from the spec.
- ***Update from shape*** replaces *Make again* on the Make card when the shapes changed since they were made; *Fold it* or *Build from boards* on the stage bar does the same.
- ***Detach from the shapes*** (one way, asked first): the shapes, the spec and every key go; the boards and joints stay as they are (a seam keeps laying out as a seam). Undo brings the link back.

Verified
- `tests/linked.test.ts` (3): a slit lock (set on the joint card), a cut fold and an engraved text on the house are all kept when it is made again 20 mm taller, and the walls are taller; with the roof deleted, the wall's cut-out stays and the roof's engraving and the roof seam's lock are listed (one face, one edge) and dropped from the spec; *Detach* leaves a plain box design whose boards and seams lay out exactly as before.
- Goldens byte-identical; the engine tests of 125–127 unchanged.

Limitations
- A shape moved so that a face's role changes (a box turned on its side keeps its roles; a prism given more sides renames its sides past the old count) loses the work on the faces that changed name.
- Hand-added boards (not made from a face) are kept but not checked for whether they still touch anything.

## Milestone 130 (Shapes R11) — openings, and a lid by a cut ✅

`SHAPES_TO_DIELINES_PLAN.md` R11. `src/sculpt/polyhedron.ts` (`splitPolyhedra`, the cut keyed `cut`), `src/model/polyhedron.ts` (`movePoly`, `mergePoly`, `prefixPoly`, `polyBounds`), `src/model/reassemble.ts` (the lid's hem), `src/make/run.ts` (`polyOf` with a lid, `LID_OPEN`), `src/make/MakeCard.tsx`, `src/make/MadeFace.tsx` (new), `src/model/unfold.ts`, `src/model/pieces.ts`; `MakeSpec.lid`.
- **Leave open**: a made board's own card has *Leave this face open*; the model is made again without it. On card the edges round an open face are cut and get no flap; on boards its corners go. The Make card says how many faces are open, with *Close them all*.
- **A lid by a cut**: *A lid by a cut* on the Make card, *Lid, from the top* (20 mm by default). The kernel splits the solid with a level plane (`splitByPlane`); each half becomes its own face graph with the cut face keyed `cut` and left open, the lid's keys prefixed `lid/`, and the lid is set down beside the box, 20 mm clear, its cut on the floor. Both halves are made as one model (two nets, or two sets of boards).
- **On card, the lid gets a hem** round its rim (a scored edge flap folded in at 180°, 6–10 mm), so it keeps its shape. The lid and the box have the same outline at the cut, so the lid sits on the box flush.
- **The unfolder's flap clearance** (from 125) now grows a flap deeper and its far corners further along its edge, but keeps its base on the edge's ends: past them is the corner the neighbouring faces share. Before, almost every closing flap at a corner was refused, and an open box came out in two pieces. **The house now folds in one piece.**
- **`netOverlaps` allows made boards a corner sliver under 4t²** (1 mm² on card), where the creases shift neighbours by up to a thickness.

Verified
- `tests/openings.test.ts` (5, with the kernel): a cube with its top open folds as one piece of five boards with four flaps and no overlap; in plywood it is five boards and eight corners; a cube split 20 mm below its top gives a box and a lid, each with five faces and the cut; on card the box is 40 mm and the lid 20 mm tall, the same width within 0.5 mm, four hems round the lid, two pieces; in plywood ten boards and sixteen corners, none broken.
- **Two goldens changed on purpose** (125's `make-cube-card-0.5` and `make-house-card`): the unfolder's new clearance gives a different net, the house in one piece. Every older golden byte-identical. The engine tests of 123–129 pass.

Limitations
- **Board lids have no lip**: a plywood lid sits on its box flush (the plan's lip sized by the clearance is left for later).
- The card lid's hem strengthens its rim; it does not plug into the box.
- Faces are left open from a board's card, not by clicking faces in the shape stage.

## Milestone 131 (Shapes R12) — assembly: seam numbers, the order, the steps ✅

`SHAPES_TO_DIELINES_PLAN.md` R12. New `src/model/assembly.ts` (`assemblySteps`, `seamNumbers`) and `src/make/Steps.tsx`; `src/export/annotate.ts` (kind `seam`), `src/export/spec.ts` (`SpecText.seams`), `src/ui/printPlan.ts`, `src/make/MakeCard.tsx`.
- **The order**: a made model's cut seams (or a board model's corners) piece by piece, then by how far their boards are from the piece's first board along its folds; **the seams of the face that closes last come last**: the boards round an opening when there is one, else the chooser's closing face (R6).
- **Paired seam numbers**: each flap (or, for tabs and fingers, its board's edge) and its partner edge carry the seam's number, on the cut plan's annotations (milestone 89, shown with *Dimensions*) and on the GUIDE layer when the export is asked for them (off by default, so files do not change).
- **The steps**, on the Make card: *Putting it together: N steps*, *Start*, *Next*, *Back*; each step says its seam's kind and boards (*3: slit lock, Roof to Gable*) and selects the two boards on the 3D stage with the model folded up.
- **The printed plan** (90) lists each page's seams in order (*Seams, in order: 1 glue · 2 glue · 3 slit lock*).

Verified
- `tests/assembly.test.ts` (5): the house's cut seams are each one step, numbered 1…n, the roof's (the face that closes last) at the end; an open box's four seams; a plywood box's twelve corners with the lid board's last; each seam number twice on the plan (flap and partner edge); the printed plan's seam line. `spec.test.ts` and the i18n tests unchanged.

Limitations
- **Glue areas are not shaded** on the guide layer; the word *glue* on each flap (89) stays as it was.
- The steps view is a list on the Make card with the seam's boards selected in 3D, not a view of its own with the fold slider stepping per seam.
- The house closes in 9 seams on the card sheet (its net is one piece with 6 folds), not the plan's 6.

## Milestone 132 (Shapes R13) — the workplane, second part ✅

`SHAPES_TO_DIELINES_PLAN.md` R13. New `src/sculpt/arrange.ts` (`alignShapes`, `mirrorShapes`) and `src/sculpt/protractor.ts`; `src/sculpt/build.ts` (`chamferPlanes`, `bodyFaces`, `loftCorners`), `src/sculpt/polyhedron.ts` (roles), `src/sculpt/ui/SculptCard.tsx`, `src/sculpt/ui/SculptView3D.tsx`, `src/sculpt/ui/commands.ts`; `Shape3.chamfers` and `n2`, the kind `loft` (checked on load); `src/model/reassemble.ts`.
- **Chamfer** on a box or a prism: *Top edges*, *Upright edges*, *Bottom edges*, and the distance. Stored as `chamfers: { a, b, d }[]` (the two faces by role) and rebuilt with the shape: each edge cut off by a plane through the two lines `d` in from it. The chamfer faces are named by their two faces (`ch:top|+x`).
- **Loft**: a new tile, from one outline to another with straight walls: base sides, top sides (a square to an octagon by default) and top size. Each outline is fitted to the width and depth; the loft is their hull, so every face is flat.
- **Line up and mirror** (several shapes selected): per axis, min, middle or max to the last shape clicked, and mirror across the selection's middle. A mirrored extrusion's outline turns the other way (its arcs and handles with it).
- **Edit group**: *E* opens the selected group in place (as a double-click does).
- **Protractor**: *P*, then two faces: *90° — fingers* in plywood, *160° — edge to edge*, *90° — glue* in card; its words are the joint chooser's (125).
- **Snapping to other shapes' edges and middles while moving** came with the port (`snapMove`).
- Found on the way: a slit lock squeezed below the room its tongue needs is glued with the flap the net has room for, not given a flap deeper than the net allows.

Verified
- `tests/workplane2.test.ts` (6, with the kernel): a box with its top edges chamfered has 10 flat faces named as above, about the volume a 45° chamfer takes, and **folds in one click** with nothing broken and no overlap; a hexagonal prism with chamfered upright edges has 14 faces; **a square-to-octagon loft** has a 4-sided base, an 8-sided top, every face flat, and **folds in one click**; lining up to min, middle and max on each axis; mirroring two boxes swaps their sides, and an L extrusion mirrors in place with its outline turned; the protractor's readings in plywood and card.
- The engine tests of 123–131 pass; goldens unchanged; unit suite and typecheck green. A look in the dev server: the loft and its fields.

Limitations
- No guide line is drawn while a move snaps to another shape; Alt pauses snapping as before.
- Line up has no dots on the stage (its buttons are on the card); a mirror is exact for shapes square to the world (a turned shape's own asymmetry is not reflected).
- Chamfers on a tapered box or prism, and on an extrusion's edges, are not offered.

## Milestone 133 (Shapes R14) — verification of 119–132 ✅

`SHAPES_TO_DIELINES_PLAN.md` R14. `README.md` (*From shapes to folds and boards*, Guided's gallery), `ROADMAP.md` (status rows for 119–133); `src/model/seamNet.ts`, `src/model/reassemble.ts` (board names).
- **Each milestone's checks again**: typecheck clean; **the unit suite, 1,515 tests, green**; the goldens byte-identical except the cases this plan added (123's four seam nets; 125's six made models, two of which, and then four, changed on purpose in 130 and 128 as the unfolder improved).
- **The browser specs**: `shapes-port` (120), `make-fold` (126), `make-boards` (127), `guided-diamond` (128), and Guided's own `guided` spec (both languages, 1366 and 1024 px): 13 passed.
- **A hands-on pass in the dev server**: Guided's gallery with *Pyramid* and *Diamond*; the pyramid's three sliders; *Shapes* in card, a box, *Fold it*, *A lid by a cut* (the box and its lid beside it, both open at the cut), the steps selecting each seam's two boards; the cut plan; *Build from boards* in plywood (fingers and angled tabs on a house); a loft and a diamond on the workplane. No page errors anywhere.
- **Found in the hands-on pass, fixed**: made boards were named by their face keys (`lid/s_…:-x`) on the cut plan and the board card. They are numbered now, as the Workshop numbers boards (*Panel 7*, *Base*).

Remaining limitations (this plan)
- Flap depths, tab widths, finger sizes and the slit lock's minimum are **unverified on real stock** (the owner's testers: one cube per material).
- Not built: the ΔX/ΔZ readouts after a move; a shape lying down on the face under the pointer while dragged from its tile; picking faces to leave open and edges to fold or cut on the 3D stage (a board's card has *Leave this face open*); *Size is: Inside* for boards; a lip on board lids; shaded glue areas; a steps view of its own; a guide line while snapping.
- A dense, saddle-shaped form (a 144-face torus) folds in many pieces; the unfolder runs in a Worker over 40 faces.
- The two Guided shapes are Guided's; Workshop builds them from the *Pyramid* and *Diamond* tiles.

## Fix: the net Make reports is the net it lays ✅

Found with a probe over 222 solids, materials and facet counts (now `tests/foldNet.test.ts`). The unfolder folded seams within 5° of flat, which `seamFit` refused to lay, so each became a broken fold and its face a loose piece at its own place: a 40-facet sphere in corrugated was reported as **1 piece** and cut as 241; a half sphere 1 → 121, a torus 1 → 24–40, a shallow 40-facet cone 2 → 41, a flat 24-sided pyramid 2 → 25. Ideas from papercraft (behaviour only, `THIRD_PARTY.md`).
- `src/model/foldRules.ts` (new, pure): the seam-fold limits (5°–355°), `SOFT_FOLD` (3°) and `creaseSum`, the closed form of `creaseDepths` for a made seam. Shared by the unfolder and the engine.
- `seamFit` lays folds near flat (the 5°-from-flat refusal is gone); `foldBand` draws no score on a seam fold within 3° of flat (the board bends there by itself).
- The unfolder never folds what the engine cannot lay, and lays each fold with the engine's crease shift at every dihedral (inside corners and the fold allowance included; before, only under 180° and without the allowance). New spec fields `foldAllowance` and `avoid`; `unfoldSpecOf` builds the same spec here and in the Worker.
- Make checks the net as laid (`netProblems`): a broken seam fold, or two boards of one piece overlapping, gets its fold cut (for an overlap, the fold between the two that frees the fewest boards), and it unfolds again, up to 6 times. The split it reports counts the pieces as laid.

## Flaps sized for the board they are glued to ✅

A glue flap or slit lock was sized only against the flat net, so folded it could lie past the board it is glued to: up to 44 mm² past a cone's sliver of a face, 41 mm² past a tall pyramid's. Papercraft's approach (behaviour only, `THIRD_PARTY.md`), written fresh in `src/model/unfold.ts`:
- **Each end narrows at the receiver's corner there** (`receiver`): no steeper than its corner less 2° (at most 85°); 45° where the corner allows, as before. The two ends are sized apart: `Unfolding.flapTaperB`, `Connection.flapTaperB`, mapped onto the board's edge by position (made boards are mirrored, so their edges run the other way).
- **No deeper than lies inside the receiver, folded** (`sizesFor`), its far edge a thickness clear of the receiver's other edges; the deepest found by halving, then 60% and 35% of it, either side, deepest first.
- **A long wedge on a sliver**: such a flap may narrow by up to `TAPER_MAX` (0.45) of its seam at each end, keeping a top a tenth of it; other flaps keep the third as before. The engine reads `flapTaperB` as the mark of a flap sized this way, so designs saved earlier keep their flaps.
- Where no flap of a useful depth fits the receiver on either side, the flap is fitted to the net alone, as before.
- Over 670 flaps on 11 solids in card and corrugated: the overhang went from 170 mm² (5 flaps over 1 mm², the worst 44 mm²) to none, with no flap dropped; the flap area changed by −2% (only flaps that overhung shrank). `tests/foldNet.test.ts` checks it. The goldens: `make-house-card` changes by 1e-4 mm (tapers now stored at both ends).

## Milestone 134 (QA fix round Q0) — safety nets first ✅

`QA_FIX_PLAN.md` Q0, from the browser QA of 20 November (`docs/cutforge-browser-qa-2026-11-20/REPORT.md`). Tests only: no app code changed. The failing tests are the to-do list for 135–145.
- **QA repros** (`tests/qa/`, in `npm test`): one test per finding that shows in the model, written as `it.fails` (it states what should hold, fails today, and counts as a pass); the fixing milestone flips it to `it`. 18 today:
  - joints (135): walls standing on the base turn the corners into half-laps behind the list; a corner choice then changes 0 joints; a mixed group shows one kind; a kind offered that only another material's boards take; *Wall to base* changes dividers' joints and a tuck lid's fold; the count on an open carton; a hand-set joint lost on a material round trip;
  - status (137): an empty design has no blocking problem (card and plywood);
  - curves (138): the card's minimum bend radius (21.5 mm) and the export check (19 mm passes) disagree; *Hinged* is offered on a rounded box;
  - Guided (139, 142): a name, a sticker and a window land on top of each other; a pyramid's name is dropped by *Sides 4 → 3*;
  - Quick build (143): *Use less board* adds glue joints under *No glue*;
  - the promise gate: 8 seeded op sequences break the joint promises.
- **Promise checks** (`tests/qa/promises.ts`): `changeGroup` runs a joint change as the Workshop editor does (`setAllJoints`, `solve`, `autoConnect`) and lists the promised joints that ended otherwise; `shownLies` lists the joints a group's list does not show truly. Joints are followed by the two boards they join: `autoConnect` makes joints again under new ids, sometimes on other edges.
- **The fuzzer** (`tests/fuzz/fuzz.ts`) runs the promise checks after every joint op (`promises` option; `FUZZ_PROMISES=0` leaves them out). Over 40 seeds it reports `promise:listTrue:base` on 10 and `promise:listTrue:corner` on 2. It still reports `idem:solve` and `roundtrip` on seed 6, which were there before.
- **Copy ratchet** (`tests/qa/copy.test.ts`, list in `copy-ratchet.json`): fails on a new offender and on a fixed one still listed. Today 4 strings with "(s)", 47 counts with no singular, 8 files using the browser's own `confirm` / `alert` / `prompt`.
- Not reproduced in the model, left to the truth spec (milestone 145): an arched lid offered and then not made (I9); *Hinged → None* leaving the back wall invisible (C2) — the model restores the walls' sizes, so it is a drawing or Quick-build path.
- Corrections to the report found while writing the repros: the first of two tabs does show "changed in another tab" (the faults are the false alarm on opening and the *Saving…* label); the template card does note that a hinged lid removed the spaces (its reason is vague).

Verified: typecheck; `npm test` (1572 passed, 18 expected fail; `wings.test.ts`'s timing test failed once under the full parallel run and passes alone, three times out of three).

## Milestone 135 (QA fix round Q1) — joint changes made rigid ✅

The owner's report: "when I change joint types, usually not all of them change, and sometimes nothing changes" (`REPORT.md` §10).
- **The root cause (J-a, J-b, J-e, J-f):** a tray's walls with *Tabs and slots* into the base stand 3 mm in from its edge (room for the slots) but kept the base's full length, so their ends crossed; the join step then made the corners half-laps, out of every corner group. Every corner choice after that changed nothing, and the list kept showing the old one. Now a tray wall standing in spans the inset ring's edge (`insetSpan` in `ops.ts`): it ends where the inset lines meet at each outside corner whose next edge also has an inset wall (`offset / tan(θ/2)`). A 120 × 80 plywood tray's walls stand at 114 × 74 and keep their finger corners. Inside corners and open sides are as before.
- **Lists show what the joints are:** `groupShown` is the kind the group's joints have; when they differ it is undefined and the list shows a disabled *Mixed (3 Glue flap, 1 Slit lock)*, so choosing any kind applies it. Same on the tray's own card (`TrayUI.tsx`, which also lists a kind its joints have that it would not offer, such as an open carton's edge-to-edge walls) and in Guided's *More about this box*.
- **Only kinds that do something:** a list offers kinds the working material's joints can take (`ownGroupJoints`); a kind only another material's boards take is no longer offered. The part card offers `allowedKinds`, the same rule as the 3D joint label, so a kind it offers is never ignored by `setConnection`.
- **What *Wall to base* covers:** `groupOf(d, c)`: a board grown off a grown board (a tuck top, a hinged lid) is not *wall to base*; its lid's controls set it. Dividers stay in it (milestone 23), and the note says how many of the changed joints were theirs.
- **An honest note:** `setAllJoints` returns `JointChange` (`changed`, `kept`, `held`, `dividers`, `other`), counted after the solve by the boards each joint joins. The note says each part (*N joints changed. 9 of them are dividers' joints. 3 were set back by the box itself…*), and is cleared by the next edit.
- **A joint set by hand is kept:** `setConnection` marks it `picked`; a change of material re-applies the design's choices to every other joint (`keepPicked`), and a design-wide choice still applies to all (it clears the mark).
- New strings: `settings.changedOne`, `keptN`, `heldN`, `dividersN`, `otherN`, `mixed`, `mixedShort`, `g.joints.mixed`, and the short names `conn.short.lock`, `key`, `closure`.
- Tests: 10 joint repros and the promise gate in `tests/qa` flipped to `it`; `jointdefaults.test.ts` reads the richer result. Over 120 fuzz seeds no promise is broken (the classes left, `idem:solve` and `roundtrip` on seed 6 and `flat:autoTrayOverlapsOther` on seed 82, were there before 135). The copy ratchet lost `settings.changed`.

Verified: typecheck; `npm test` (1583 passed, 7 expected fail; `foldNet.test.ts`'s sphere test timed out once under the full parallel run and passes alone); in the dev server, the report's sequence on a card tray (*Corners → Slit lock*, *Wall to base → Tabs and slots*, *Corners → Glue flap*) changes 4 joints each time with true lists, and a hand-set corner shows *Mixed (3 Glue flap, 1 Slit lock)* until *Glue flap* changes the one left.

## Milestone 136 (QA fix round Q2) — saving with two tabs ✅

`REPORT.md` A10 (as corrected): opening a design in a second tab told the first it "was changed in another tab", and the first then showed *Saving…* for ever while nothing was saved.
- Each tab keeps the text of what it last loaded or saved; a change that leaves it the same is not saved, so opening a design saves nothing.
- Each save tells other tabs its hash (FNV-1a of the saved text, `hashOf` in `store/hooks.ts`); a tab that already has that content ignores it.
- While the conflict waits for *Reload* or *Keep mine*, the save label is a new state, `paused`: *Not saved: this design was changed in another tab. Choose Reload or Keep mine.*

Verified in the dev server with two tabs: opening the second raises nothing in the first; a change in the first is saved and warns the second; an edit in the second then shows the paused label.

## Milestone 137 (QA fix round Q3) — truthful status, names and counts ✅

- **Nothing to cut** (`REPORT.md` #1, H2): `validate` reports `val.empty` for a design with no board to cut (a shape on the Shapes stage, not made yet, is not one). *Ready to cut* never shows for it; the download dialog says why its *Download* is greyed (and no longer offers *Download anyway* for an empty design).
- **Guided on an empty design** opens its gallery, not an empty Build step, and the gallery's board follows the open design's until the student picks one (B1).
- **Counts** (H11): `translate` reads `{n|piece|pieces}` (`plurals` in `src/i18n`); 17 strings in English and Hebrew use it (*1 piece · 8 folds*, *1 sheet, 0 pieces*, *1 face left open*, *1 shape*). The four "(s)" strings are gone; the copy ratchet's list went from 46 counts to 30.
- **Names:** every box's base is *Base* (*Base 2* … with several boxes); a model made from shapes calls the face it stands on *Base* (a pyramid's square or pentagon; a diamond has none); "Width follows the edge of panel Panel 5" lost its first "panel". Guided's untitled design is *Untitled design*, as in the other levels (it was *My thing*).
- **Notes that go stale:** the joint note (135) and the Make card's *The material changed* belong to the design they were made for; the next edit hides them.
- **A lid by a cut** is not reported as *It lies flat in 2 pieces*: the lid is a second body, not a split.

Verified: typecheck; the QA repros for empty designs flipped to `it`; in the dev server, an empty plywood design's download dialog and Guided's gallery as above.

## Milestone 138 (QA fix round Q4) — curves and lids: one rule, and the gate ✅

- **One minimum bend radius** (`REPORT.md` I1, I11): `roundedMin` is now the export check's own answer, found on a probe box of the same board and height (a few ms a try, kept per board and height). Plywood 3 mm: 21.5 / 19 / 12.5 mm for 20 / 40 / 80 mm walls (it said 29 / 21.5 / 13.5, while the check passed at 21.2 / 18.8 / 12.5); card and corrugated were already the same. The card's warning, Quick build's box and the export check now give one number.
- **A tight bend shows in Workshop as it happens** (owner's decision 3): the *Ready to cut* badge appears in Workshop's top bar while something blocks cutting, and only then.
- **Rounding a finished box** (C3): `roundTrayCorners` rounds every outside corner of a box's base to the least radius its walls bend at; the walls stay and bend round each corner (a living hinge with a key on plywood, glued lips on card). The box card offers it as *Round the corners*; greyed, with why, under a hinged or arched lid. In *Edit outline*, *Curve* is greyed with the reason (a smooth curve cannot hold a joint), *Round* says it keeps the walls, and a box's corner starts at the least radius (it started at 10 mm). Quick build's outline help no longer points at card controls it does not have.
- **Gated, with reasons** (C1, C10): *Hinged* on a box with rounded corners (also Guided's *Round box*) says a hinged lid needs square corners; an arched lid's reason names the board's bend and the inside depth and height it needs (it said only "tall enough"; on a 135 × 66 box the depth is what falls short). A lid that could not be made says why on the card (I9: nothing happened, silently).
- **Inside height kept** (C7): `setBoxLid` keeps a box stated by its inside at that size (a hinged lid made it 0.5 mm lower in card and 3 mm in plywood). The golden `hex-box-card` changes on purpose: its walls are 0.5 mm taller.
- **Not reproduced:** C2 (*Hinged → None* leaving the back wall unseen, 150 vs 147 mm): the design after it is identical to before, field for field, and the stage draws the box whole. The blank stage seen then was the camera not framing a new box (H7, milestone 140).

Verified: typecheck; `npm test` (one timing test in `wings.test.ts` fails only under the full parallel run, as before); QA repros for the radius and the hinged lid flipped to `it`; in the dev server, a plywood box's card shows *Round the corners*.

## Milestone 139 (QA fix round Q5) — where new things appear, and the camera ✅

- **A finished sketch beside the shapes** (`REPORT.md` #2): `besideOthers` moves a new solid made inside another along +x, 10 mm clear of every shape it meets (a solid standing on another, from a workplane on its top, stays).
- **Decorations apart** (B6): Guided's name, sticker and window take the free place nearest the middle of the side (2 mm clear of the others, where the laser can cut), instead of all three in the middle.
- **A ready shape keeps its decorations** (B8): when *Sides* takes away the face a name was on, the name goes to the face that looks most nearly the same way, centred on it. On a student's own shape a lost face is still listed as lost (milestone 129).
- **The camera** (#5-#6, H7, §8): *Fit view* frames the design in the part of the stage the rail and the card leave free (it framed the whole canvas, half under the card), never from below the floor; a new or opened design is framed when it appears (it kept the last design's view, once below the floor).
- Not done here: Quick build's *Wall / lid* picking an edge behind the one clicked, and Guided's divider grip on the width arrow (both left for milestone 145's browser pass).

Verified: typecheck; `npm test`; QA repros for the sketch, the decorations and the pyramid's name pass (`tests/qa/placement.test.ts`, `guided.test.ts`); in the dev server, *Fit view* puts a 150 × 100 box whole beside the card.

## Fix: a rounded card box changed to plywood ✅

The owner's report during the fix round: an open box with rounded corners built in card, then changed to plywood, "results in a ridiculous object".
- **Cause:** the box's walls kept card's joint to the base, a fold. Plywood allows a fold (a living hinge), so nothing replaced it: every wall became a living hinge bending off the base, and the net lay over itself (`val.netOverlap`). Its 15 mm corners were also tighter than plywood bends at 45 mm (`val.bendTight`). The same happened from corrugated 1.6 mm; from corrugated 4 mm only the folds.
- **Fix** (`ops.ts`, `toNewBoard`, run by `setMaterial` when the kind of board changes): a box's wall and corner joints that the new board would never choose for a whole box take its defaults (a fold to the base becomes plywood's finger joint), as do walls grown by hand that fold by default; a joint set by hand keeps its kind. Rounded corners tighter than the new board bends grow to its least radius (`roundedMin`, through `setRoundMinOf`). A box stated by its inside keeps that size.
- **Now:** card, corrugated 1.6 and 4 mm rounded boxes changed to plywood end exactly as the same box made in plywood (finger joints to the base, a living hinge at each corner keyed once, base and wall strip as two pieces, nothing flagged); plywood → card → plywood comes back unchanged. `tests/qa/material.test.ts`.

## Milestone 140 (QA fix round Q6) — modes and the level switch ✅

- **One place for the level switch** (`REPORT.md` #3, H1, owner's decision 5): the *Guided · Quick build · Workshop* switch stays in the top bar at every width (smaller below 1480 px, the sheet meter's words go first) and in every state; it no longer moves into ⋯ when Quick build's badge shows. The Shapes stage has it too (it had none: the only way out was *New design*), and Guided's bar shows it beside the design's name (it was only in ☰).
- **Joints and Outlines under the card** (§2.3): one row of full-size labelled buttons at the bottom of the right-hand card (`CardModes`), not small toggles in the view cluster, where *Outlines* hung its label below the bar. Turning one on turns the other off.
- **One way out of outline editing** (§8): in outline mode the card's *Edit outline* button is its *Done* (it was a greyed *Editing (outline mode)*); the row's button reads *Done* too.
- **A new icon for editing an outline** (§2.4): an open line with a dot at each point (`outlineEdit`), no longer the Sketch tool's pentagon.
- **Nothing carries into the next design** (H3): a new or opened design starts with *Joints* and *Outlines* off.
- After a load the stage checks again, once it has its size, that the design is in view.
- E2E specs updated for the owner's decision: the Shapes stage has the level switch (`shapes-port.spec.ts`); Guided's bar has it (`guided.spec.ts`).

Verified: typecheck; `npm test`; in the dev server at 1366 × 768, Quick build with a box shows the level switch and the badge together, and the card's row.

## Milestone 141 (QA fix round Q7) — gizmos ✅

- **Turn rings by axis** (`REPORT.md` #4): on the Shapes stage the three rings were one yellow and could not be told apart; each now has its axis's colour (red about across, green about up, blue about front to back), as the move arrows do (`ringColor` on `Gizmo`).
- **A place to read and correct a drag** (#5): the shape card has *Across* and *Front to back* beside *Lift* (it had only *Lift*). The gizmos' live readout was already there.
- Not done: arrows that grow with zoom, a visible turn snap, and moving the Workshop board ring off its arrows and labels (left for the browser pass, milestone 145).

## Milestones 142–143 (QA fix round Q8–Q9) — Guided, Quick build and the app's own dialogs ✅

- **Guided says why** (`REPORT.md` B3–B9): a change Guided refuses names the problem it would have made (*Not changed: …*, from the new blocking problem itself), not only "impossible to cut"; a typed size under 10 mm says the least a box can be (5 mm became 10 mm with no word). Decorations and the pyramid's name: milestone 139.
- **Use less board keeps No glue** (C8): a wall cut off its base, or any grown board's cut fold, is joined with a slit lock when the design's corners are slit locks (`noGlue`, `ownKind`, `cutKind`).
- **The app's own dialogs** (§8, §11): `askConfirm`, `tellUser` and `askText` (`src/ui/AppDialog.tsx`) replace the browser's `confirm`, `alert` and `prompt` in all 8 files (sketch *Cancel*, *Detach*, the tour, the teacher's deletes, *Rename* and *Move to project*, SVG import messages, a file that would not open, *Repack*). The copy ratchet's list of them is empty. E2E specs answer the new dialog (`answerDialog` in `tests/e2e/util.ts`).
- **The sketch's measurement labels** (#8): the white halo is sized to the text (`0.22em`), not 3 px, which inside the sketch's SVG is 3 mm, about three letters tall.

Verified: typecheck; `npm test` (1597 passed; every QA repro now passes); `tests/e2e/library.spec.ts` (rename and move through the new dialog).

## Fix: shapes folded from card reported problems they do not have ✅

The owner's report during the fix round: Quick build lists many errors after folding a shape (a loft of 4 to 8 sides in card), though the dieline looks right.
- **Cause:** the check for boards that touch without a joint (`contactIssues`) took faces that meet only at a corner of the shape as boards: on a 4-to-8 loft the faces round each top corner overlap by more than 0.5 mm in their thickness there (4 × *run into each other*); on a cone every side meets every other at the tip (24 × *too short to join*). Every other shape tile was already clean.
- **Fix:** on a model folded from card (`make.as === 'fold'`), two faces of the made shape that share exactly one corner are not reported (`meetAtCorner`): card bends there. A model built from boards keeps the check (boards are thick).
- `tests/qa/folds.test.ts`: every shape tile, folded from card at 40 mm, has nothing to fix.

## Milestone 144 (QA fix round Q10) — accessibility ✅

- The welcome screen's material radios are named by their material (three card boards shared the name of their description).
- Each row of *Your designs* opens with a name: *Open Pencil box*.
- Behind the welcome screen the editor and its bar are `inert`: not read out or reached with Tab.
- Correction to `REPORT.md` §11: the lid buttons do say which is chosen (`aria-checked` on radios); the first check looked for `aria-pressed`. Guided's sliders are named by the label round them.

## Milestone 145 (QA fix round Q11) — verification of 134–144 ✅

- `npm test`: 1609 passed (every QA repro, the joint promise gate, the copy ratchet and the fold check of every shape tile).
- E2E specs whose expectations changed: `library.spec.ts` (the app's dialog), `shapes-port.spec.ts` and `guided.spec.ts` (the level switch): all pass.
- In the dev server: the report's joint sequence, two tabs, an empty design, *Fit view*, the level switch at 1366 px, the folded 4-to-8 loft, and a rounded card box changed to plywood with the material pill, each as described in `REPORT.md` §13–§14.
- `REPORT.md` has the round's results (§13), the owner's reports during it (§14), corrections (§15) and what is still open (§16).

## The welcome screen's redesign (owner, 20 November) ✅

- *New blank design* is a tile in the materials' row: it starts an empty grid in the material picked (it was step 2's *Blank design* plus the bottom *Start*). Double-clicking a material does the same.
- The sentence has its own, smaller *Start*, and so does the card view of styles (*Cards*); the bottom *Start* is gone.
- A mission (Quick build) starts on its click; Workshop's *Shapes* row starts on its click too (it has nothing to set), with an arrow instead of a radio dot.
- E2E specs follow: `start-sentence` / `start-cards` replace `tpl-sentence` + `start-go`; missions and *Shapes* need no `start-go`; `start-go` is the blank tile.

## Milestone 146 (presets overhaul) — one catalogue ✅

- `src/templates/catalogue.ts`: 16 cards over today's structures, styles, missions and Guided things (`PRESETS_OVERHAUL.md` §6, less the new cards of 152–153). The sentence's first word, Guided's gallery, the teacher's list of plain things and Quick build's *Follow a mission* read it.
- No list shows a design twice: the sentence's first word on card went from 20 entries to 18 (*a carton* and *an envelope* were the snap-lock and diamond styles), on 4 mm board from 10 to 9 (*a carton* was the RSC). *A tray* picked from a box starts 30 mm tall (and a box from a tray 45 mm), with a note.
- `?presets&mat=<board>` (development): the contact sheet of every list in a board; `npm run preset-sheet` saves `docs/preset-shots/sheet-<board>.png`.
- Tests: `tests/presetCatalogue.test.ts` (membership, a design's card, own sizes, each design once on the cut geometry, structural look-alikes) and `tests/e2e/preset-sheet.spec.ts` (picture look-alikes). Known look-alikes: box/tray (structure); the tuck cartons, closed cartons, the envelopes and the sleeve (pictures), each with the milestone that settles it.

## Milestone 147 (presets overhaul) — pictures draw everything ✅

- `src/views/illustrate.ts`: folded flaps (joints, carton ends, shaped edge flaps), fold-over liners and a board's cut and perforated lines are drawn; card's contrast raised; `pictureCoverage` for the tests. `src/views/picture.ts`: the WebGL fallback at ×2.
- `tests/illustrate.test.ts`: every preset (sentence, Guided, missions) in every board draws everything its design has.
- Look-alikes after 147: the RSC and the closed sealed carton no longer look like the sleeve or the open box on 4 mm board; sealed/RSC, box/sealed on 1.6 mm and the two envelopes wait for 148's poses; the tuck cartons for 151.

## Milestone 148 (presets overhaul) — poses ✅

- `src/views/pose.ts`: `autoPose` and `posedDisplay` (lids, a carton's top flaps, a flat piece's back flap, the drawer assembled, a sleeve laid down, ghosts); `src/views/illustrate.ts` draws through it and gains the soap and letter props.
- `src/model/cartons.ts`: end flaps carry their hinge, so the fold slider unfolds them too.
- `tests/pose.test.ts`: the drawer's tray inside its sleeve, end flaps unfolding in line with their walls, poses never change the design, each kind's pose.
- Look-alikes after 148: only the tuck cartons (pictures, until 151) and box/tray (structure, until 153) are left.

## Milestone 149 (presets overhaul) — engine: ends per wall ✅

- `src/model/types.ts`: `EndFlapKind`, `EndFlap`, `EndSpec`, `Tray.ends`; `TrayTop` / `TrayBottom` gain `full`. `src/model/cartons.ts`: `END_STYLES`, `endSpec`, `endStyleOf`, and `endGeom` drawing wall by wall. `src/model/ops.ts`: `setEndFlap`.
- The full-overlap box (FEFCO 0203) on corrugated: the carton's words, the tray card, the style list and the *Box with flaps* card.
- `tests/ends.test.ts`: styles are their lists, full overlap builds clean, three lists that are no style build with nothing blocking, one wall set on its own and back. Carton goldens unchanged.

## Milestone 150 (presets overhaul) — engine: preset records and the recogniser ✅

- `src/templates/records.ts`: `PresetRecord`, `recordOf`, `fits`, `recordKey`. `src/templates/catalogue.ts`: every variant's `match`, `recognise`, `tradeCode`; `cardOfDesign` recognises designs made by hand.
- `tests/records.test.ts`: every style recognised back in every board that lists it, structures' own words, Guided's things, hand-made designs (Quick build's carton, a walled box, a hexagon with a lid), records independent of size. `tests/presetCatalogue.test.ts`: the structural look-alikes by record.

## Milestone 151 (presets overhaul) — views and variants ✅

- `src/views/illustrate.ts`: `ViewName` and `scene` (any view), `bottomOpen`; `src/views/picture.ts`: the card's view by recognition. `src/templates/catalogue.ts`: `Card.view`, `siblingsOf`. `src/ui/TemplateUI.tsx`: the *Kind* switch. `src/views/palette.ts`: card's stage colour.
- `tests/variants.test.ts` and `tests/e2e/variants.spec.ts`: siblings, picking one, one undo step.
- Look-alikes after 151: the straight tuck and the snap-lock on 1.6 mm (pictures), box/tray and the two organiser missions (records): all in 153.

## Milestone 152 (presets overhaul) — the stage ✅

- `src/views/pose.ts`: `stageFlapT`, `shownBox`; `src/views/lidPose.ts`: `closeK`; `src/easy/assemble.ts`: the closing phase; `src/views/View3D.tsx`: flaps open on the stage, framing on the shown box, the camera on the test hook; `src/ui/LidUI.tsx`: *Close* for a top of flaps.
- `tests/stagePose.test.ts` and `tests/e2e/stage-frame.spec.ts`: flaps open and shut, lids closing in the animation, the shown box, five presets framed whole at 1366 × 768, the animation running through its closing.

## Milestone 153 (presets overhaul) — challenges and merges ✅

- `src/templates/catalogue.ts`: one entry per card, `Card.word`, `entryLabel`; `src/sentence/Sentence.tsx`: a card's word and kinds in the list; `src/templates/structures/box.ts`: handles on a box; `src/ui/StartScreen.tsx`: the challenge's card.
- `tests/presetLookalikes.ts` is empty; `styles.spec.ts`, `sentence.spec.ts` and `sentence.model.test.ts` follow the one-entry list and the box's handles.

## Milestone 154 (presets overhaul) — engine: corner rules ✅ (the gusset; the inward ear deferred)

- `src/model/seams.ts`: `gussetFits`, `gussetGeom`, the gusset among card and corrugated corners; `src/model/jointDefaults.ts`: offered only where it fits; `src/model/types.ts` / `check.ts`: the kind; `src/templates/records.ts`: `corner` in the record; `conn.gusset` in both languages.
- `tests/corners.test.ts`: offered on card and corrugated only, one uncut net with the creases and four folded gussets on card and 1.6 mm board, never offered on a hexagon, the record's slot.

## Milestone 155 (presets overhaul) — new presets on the engine as it is ✅

- `src/templates/styles.ts`: `roundBox`, `penCup`, `windowCarton`, `phoneStand`, `StyleDef.sizes`; `src/templates/catalogue.ts`: the Round box in the sentence, the Pen cup and Window carton cards, the Phone stand variant, `Card.view.prop`; `src/templates/records.ts`: `window`, `supports`; `src/views/illustrate.ts`: the cup's pencils and the window carton's product; `src/views/three-geom.ts`: `robustClip`.
- Every new style is in the catalogue and record tests (membership, recognition in every board, each design once per list).

## Milestone 156 (presets overhaul) — engine: strip and wrap builders ✅

- `src/model/builders.ts`: `addStrip`, `addWrap`; `src/templates/structures/insert.ts`: the insert; styles `uLiner`, `zProfile`, `angleGuard`, `accordionPad` and the *Insert* card; records' `strip`, `folds`, `accordion`.
- `tests/builders.test.ts`: U, Z, L and accordion strips fold as asked and cut as one clean piece; a wrapper's root lies flat with glued flanges; every insert profile on card, 1.6 and 4 mm board builds clean and is recognised.

## Milestone 157 (presets overhaul) — new presets that needed engine work (beta) ✅

- `src/templates/structures/shaped.ts`: the magazine file (sloped side walls to a low front, a finger pull in the back), the dice tower (2–4 slanted baffles, a way out at the bottom of the front) and the mailer box (one wrap, its lid tucked behind the front); three beta cards; records' `slope`, `baffles`, `wrap`; English and Hebrew words.
- `tests/shaped.test.ts`: each cuts clean in every board it is offered in and is recognised as its own card; the magazine file's front is low and its sides slope (also at a 50 mm front); every dice tower baffle is joined to both side walls, at every depth and height and as many baffles as have room; each starts clean from the sizes the sentence carries over from another card; the mailer opens its lid and the dice tower ghosts its near walls in their pictures; the mailer is seven boards, its tuck just behind the front and narrower than it; none is an open box.

## Milestone 158 (presets overhaul) — engine: custom presets ✅

- `src/templates/custom.ts`: records of slots, `choicesFor` (built and checked, refusals with reasons), `buildCustom`, `customOf`, `nameOf`, `customCard`, `startFromPreset`; `src/ui/PresetEditor.tsx`: *Make it a preset* in Workshop's settings card (picture choices per slot, the catalogue's name for it, *Save as preset*) and *Your presets* on the start screen; `src/store/persist.ts`: `listPresets`, `savePreset`, `deletePreset`; English and Hebrew words.
- `tests/customPresets.test.ts`: a gable top on a snap-lock bottom and a gusseted octagon build clean; a refused choice says why (a tube in plywood, a round tube, a gusset on a hexagon) and every refusal in four boards has a reason; the corner rule outlives a change of sizes; a record round-trips through a saved preset, the design it opens as and the file format; the recogniser names a tuck-top snap-lock and a hexagonal lidded box exactly and a gable on a crash-lock bottom as nearest; a saved preset's card pattern fits its designs at any size.
- `tests/e2e/custom-presets.spec.ts`: a card box's corners made gussets from the slot's pictures, saved, and started again from *Your presets* with gusset corners; a tube refused on plywood says why and changes nothing.
- Found on the way, existing before this milestone (it failed on `main` too): `tests/e2e/settings.spec.ts` (lines 25 and 55), the settings card scrolling at 1366 × 768 since it gained *Sizes* and the *No glue* switch. Fixed: the card now stops 12 px above the view dock (it measures 149 px, 16 px from the bottom; it left 210 px), and the settings card's sections sit 10 px apart, not 14.

## Milestone 159 (presets overhaul) — words and pictures ✅

- `docs/preset-shots/after/`: `sheet-<board>-en.png` and `-he.png` for card, 1.6 mm and 4 mm corrugated and plywood; `sentence-list-card-en.png` and `-he.png`; `stage-after-start.png`. Made by `npm run preset-after` (`tests/e2e/preset-after.spec.ts`).
- `README.md`: *Presets: ready starting points*, for students and for teachers.
- Hebrew: every new key of 146–158 has its translation (i18n test).

## Milestone 160 (presets overhaul) — the stage shows the closure and opens it for work (owner's review)

- `src/model/closures.ts`: a lid's lip and tongue hinged on the lid (they ride on it, unfold in line with it); dust flaps hinged on their walls' tops; `src/views/pose.ts`: `stageFlapT` opens them while the lid is open, `openWrapOnStage` opens a mailer's lid; `src/views/View3D.tsx` uses both.
- `tests/stageOpen.test.ts`: lips and dust flaps on card and corrugated hinged trays ride on their boards and lie in line with them when unfolded; on the stage they open with the lid and shut when it is closed, picked or closed at the end of going together; a mailer's lid opens unless shut or picked. `tests/stagePose.test.ts` follows (the open box holds the shut one within a board).
- E2E: `closures`, `lids`, `stage-frame`, `quick-shots`, `preset-sheet` pass.

## Milestone 160 (presets overhaul) — verification ✅

- `npm run typecheck` and `npm run build`: clean.
- `npm test`: 1697 passed (7 skipped), golden exports byte-identical.
- E2E, every app spec (`pw-app.config.ts`, 280): 195 passed and 62 skipped on the first run; every failure was checked:
  - **caused by this branch: none.** `settings.spec` (lines 25, 55) failed on `main` too and is fixed here; `classroom.spec` (5) needs the Worker and passes with it (`playwright.config.ts`); `maintenance.spec:185` passes on its own (its camera hook is not up yet under load).
  - **failing on `main` as well** (left for their own fix, a task is queued): `quick.spec:13`, `sentence-card.spec:7`, `quick-revised.spec:92` (en, he), `gizmo.spec:50/252/376`, `refine.spec:25/341`, `through.spec:16`, `crash.spec:16`, `maintenance.spec:104`, `overhaul.spec:10`, `round.spec:27`, `topbar.spec:75` (Guided, en, 768 × 1024: the bar is 814 px wide).
- The owner's review during 160 (the stage did not show the closing lip; templates should be edited with lid and lips open) is done (above).
- Known, not fixed: with the fold slider at 0, a card hinged tray's lid stands upright instead of lying in the net.

## Milestones 161–166 (presets from boards, `BOXES_PRESETS_PLAN.md`) ✅ first part

- **161** the kit (`structures/boards.ts`): `boardStock`, `boardBox` (tabs on 4 mm board, fingers on plywood), the joint census and `tests/boardBuilt.test.ts` (every board-built card on plywood 3 and 4 mm board: clean at its defaults and at each size's ends or refused with a reason, the census kept, recognised as its card, a shape kept through a size change, not offered on card or 1.6 mm board).
- **162** the plywood drawer (its sleeve four fingered boards); the *Open-front box*.
- **163** angled tabs on 4 mm board; the card stand on 4 mm board leans in slots (`stand-corr-4` golden changed on purpose).
- **164** *Pen holder*, *Scoop tray*, *Bird house* (plywood only).
- **165** the `slot` body; *Laptop stand*, *Grid insert*, *Shelf*, *Bottle rack*.
- **166** *Desk sign*, *Slanted shelf*, *Bookend*.
- Contact sheets updated (`npm run preset-sheet`, `docs/preset-shots/sheet-*.png`): no look-alikes in any board.
- **169** *Sliding-lid box* (rails making a groove on each side wall, the lid drawn a third out).
- Not done from the plan, each with its reason in DECISIONS.md: the closed lidded box and organiser heights (open), the book stand and the uneven box (look-alikes), the bird house on 4 mm board, frames (no face-to-face joint), the game board, the Shapes footprints (gear, knob, hole pattern, puzzle cut) and stacking feet.

## Milestone 171 (every doable boxes.py design in plywood, `BOXES_PLYWOOD_PLAN.md`) ✅ the owner's picks I

- **Plywood 5 and 8 mm** grades beside 4 and 6 (owner: plywood 3 to 8 mm). Every existing plywood structure builds clean at 3, 5 and 8 mm at its defaults; at 8 mm the card stand and the pen holder refuse their default sizes with a reason.
- **Pictures:** the desk sign from behind (`rear34`, its feet in view); small boxes on the shelf's boards and cards on the slanted shelf's tiers (prop `goods`); the shelf and slanted shelf no lower than 120 mm (picked from a 45 mm box, the shelf was a stack of boards and looked like a lidded box).
- **Half box** (boxes.py HalfBox; the *Bookend* card renamed): triangular sides; variants *Wall shelf* (two keyholes in the back), *Clamping square* (square clamp holes in both sides), *Bookend with one side* (the 166 bookend; a design saved before keeps it).
- **Keyholes** (E0): `keyholeShape`, `hangByKeyholes` in the board kit; a detail marked `mount: 'keyhole'`; the record's `hang`.
- **Box words** (UniversalBox, TwoPiece; plywood only): lid *closed* (a top fixed on, the engine's *fixed* lid), *rim* (a lid half or fully as deep as the box), handles *grips*. Lidded box variants *Two-piece box* and *Closed box*.
- `tests/plywood171.test.ts`.
- Moved to later milestones: a handle on the lid and the base's overhang (173, with the other lid work).

## Milestone 172 (every doable boxes.py design in plywood) ✅ the owner's picks II, shelves

- **Shelf *Rack*** (StorageRack): rails between the lowest and highest shelves (`rails`, `rail`); record `rails` on a slot body.
- **Slanted shelf words** (DisplayShelf, plywood): `lip`, `spaces` on each shelf, `back`, `slope` (sides cut back); tilt 30° and 35°.
- **Bin rack** (BinTray, plywood, new card): rows of bins with a 45° slope across each row's foot, keyholes in the back.
- **Wall rack** (WallRack, plywood, new card): a back hung by keyholes with lipped shelves.
- Every board of these is held by tabs in slots (lips and frames given the board round their slots); `tests/plywood172.test.ts`.

## Milestone 173 (every doable boxes.py design in plywood) ✅ the face-glued joint; lid and base words

- **E1, the face-glued joint** (`laminate`): two boards face to face are found, joined and checked like any seam; nothing is cut; the cut plan's annotations say *glue* on each. `laminateBoards`, `placeBoardOn` in ops.
- **Box words** (plywood only): lid *plug* and lid *brim* (UniversalBox's flat and flatbrim lids: a board glued under the top, or strips in slots under it, inside the walls), a *handle on the lid*, a *base plate* wider than the box (BasedBox, glued under the base). Lidded box variants *Plug-lid box* and *Brim-lid box*.
- `tests/plywood173.test.ts`.

## Milestone 182 (every doable boxes.py design in plywood) ✅ in part: layered things

- **Frame** (PhotoFrame, plywood, new card): front, pocket layer and back glued face to face, on two feet; variants *Plaque* (EngravingFrame) and *Shadow box* (Shadowbox).
- **Spool** (Spool, FilamentSpool, plywood, new card): two flanges on a hub of rings glued face to face.
- Record body `layers` (`layers`, `deep`, `disc`). `tests/plywood182.test.ts`.
- Not built: the light box, the twist-lid box and the drill box (`DECISIONS.md` says why).
## Milestone 177 (every doable boxes.py design in plywood) ✅ stacking feet (E6)

- **Stacking edges** (`Panel.stack`, `src/model/stack.ts`): feet under a board's ends and a tongue over its top, added after its joints in the cut, the 3D and the pictures; a base finger's notch over a foot becomes a slot. Goldens unchanged.
- **Words** (plywood): `stack` on the box and tray (style *Crate*, with handle slots), the open-front box (*Stacking notes box*) and the shelf's rack (*Stacking rack*).
- **Stacking bin** (StackableBin) and **Sieve stack** (BrickSorter), new plywood cards (`boardStacks.ts`).
- Records `stack` and `sieve`; pictures show two stacked (`Pose.stack`). `tests/plywood177.test.ts` (two stack within the play, and no further).
## Milestone 180 (every doable boxes.py design in plywood) ✅ any footprint (E7)

- **Inside corners fingered** (`Tray.insideCorners`): both walls reach to where their inner faces meet and are fingered as a corner seen from inside; `cornerFit` finds such corners on the inner faces. Trays that do not ask are unchanged.
- **`Footprint` `'outline'`** (any polygon from points; `addOutlineBase`), `growOutline` for sizes said inside.
- **Records:** footprints `free` and `concave` (with `sides`), `star`.
- **Chamfered box** (AngledBox), **Coffin box** (Coffin; a lid that lifts off, a cross engraved), **Tetromino box** (Tetris: L, T, S, Z), **Star box** (4 to 8 points): plywood only, beta; `tests/plywood180.test.ts`.
- The taper spike failed (compound-angle corners are not found); the Feeder waits on it.

## Milestone 181 (every doable boxes.py design in plywood) ✅ a band round any outline (E8)

- Rounded corners on chosen corners of any outline (`curve: 'round'` on an outline's points); a corner that turns less than 90° bends round a larger radius.
- **U box** (UBox: the base bends up into the front and back), **Rounded polygon box** (RoundedRegularBox), **Rounded trapezoid box** (RoundedTrapezoidBox: all, back two or front two corners), **Heart box** (HeartBox, a lid that drops in): plywood 3 and 4 mm (`bendsRound`), beta; `tests/plywood181.test.ts`.
- Records `rounded`, `bends`.
## Milestone 178 (every doable boxes.py design in plywood) ✅ part 1: nineteen of §3.2

- **New cards** (plywood, beta): *Scoop organiser* (SmallPartsTray2), *Console* with a *Wedge* style (Console, Ramp), *Dispenser*, *Castle tower*, *Gridfinity base*, *Cutlery caddy* (Silverware), *Record rack* (DiscRack), *Motor bracket* (NemaMount), *Pegboard* with a *Standing pegboard* style (SkadisBoard, SkadisStand), *Honeycomb rack* (WineRack: diamond cells).
- **On existing cards**: *Divider tray* on the organiser card (loose dividers in half-slots), *Scoop at both ends* (scoop tray `scoops`), *Compartment box* (sliding-lid box `parts`), *Uneven file* (magazine file `uneven`, `low`), *Flyer stand* on the stand card (Display).
- Records: `loose`, `partitions`, `bothEnds`, `uneven`, `chute`, `crenels`, `openings`, `carry`, `combs`, `motor`, `pegs`, `foot`.
- `tests/plywood178.test.ts`; `tests/templates.test.ts` lists the flyer stand and pegboard among the designs of fewer than four boards.
- Left for a later part: showcase, louvred box, can dispenser, bottle stack, jar rack, book cover, clock face, laser jigs, pizza peel, and the challenges (`DECISIONS.md`).

## Milestone 176 (every doable boxes.py design in plywood) ✅ pin hinges (E5), beta until cut

- **E5, the pin hinge** (`src/model/pinHinge.ts`): a lid on the walls' tops, two hinges behind the back wall, knuckle boards on the back wall and on the lid in turn along the hinge line, a hole for a dowel or wire through each; the box's knuckles carry a stop the lid rests on at 105°. `Panel.pinLid`, `Panel.knuckle`, `addPinLid` in ops; `reconcilePinLids` on every solve; the lid opens about the hinge line on the stage and in pictures.
- **Box words** (plywood): lid *pins* (*a lid on pin hinges*) and `pin` (the pin's size, 2 to 6 mm). Hinged box variant *Pin-hinge box* (IntegratedHingeBox).
- **Dice box** (DiceBox) and **Chest** (PirateChest), new plywood cards (`boardHinges.ts`).
- Records `pins`, `crown`. `tests/plywood176.test.ts`: knuckles interleave a play apart on one line; the lid sweeps to its stop touching nothing; stage and picture poses; saving.
- Not built: the chest hinge and an all-wood pin, side-pivot hinged box, coin safe, picture theatre (`DECISIONS.md` says why, and what to test-cut).

## Milestone 174 (every doable boxes.py design in plywood) ✅ the tambour door; roll-top box

- **E2, a strip on a path** (`src/model/tambour.ts`): boards joined by living-hinge bands along a path of straight runs and quarter turns, its straight boards slit as its bands are, built shut, half open or open. A strip's boards end at their bands' tangent points for contacts and seams (`src/model/stripTrim.ts`).
- **Roll-top box** (plywood, new card, beta): one corner (ShutterBox), two corners, bread box (BreadBox); rails glued on the side walls make the groove where it is open, an inner shell with a band at its corner where the door goes when open. 8 mm plywood is refused (it does not bend round such a corner).
- `tests/plywood174.test.ts`.

## Milestone 175 (every doable boxes.py design in plywood) ✅ a wrap that opens, a latch; flex-door box

- **E3**: a strip round two side plates whose ends are doors on their bands; pictures swing them open (`Pose.doors`). **E4**: a tab on each plate in a notch in the door's end.
- **Flex-door box** (plywood, new card, beta): two doors (DoubleFlexDoorBox); variant one door (FlexBox). Record body `ring`.
- Not built: FlexBox2, FlexBox4 and the book box (`DECISIONS.md` says why). `tests/plywood175.test.ts`.
## Milestone 183 (every doable boxes.py design in plywood) ✅ parts in the Shapes tool, gearbox, game board

- **Parts** (`Detail.part`, `src/model/parts.ts`): gear (involute, undercut from the rack's sweep), timing pulley (GT2, GT3, T5), knob (round bites or wavy, bore round, D or hex), hole pattern (hex or square grid in a rectangle or a circle; *Make it a live array*), fan grille, motor mount (NEMA 14, 17, 23), 7-segment digits, drill gauge (sizes engraved, following it: `labelOf`), puzzle cut (lines that cut the board into pieces: `BoardLine.pieces`). Shapes tool → *Parts* (3D): a click on a board, or with *Board* on the floor. Their sizes stay editable on their card; stretched or edited by hand they become plain shapes.
- **Cards** (plywood, beta, `structures/boardGears.ts`): *Gearbox* (GearBox: 1–3 stages on two axles, each gear glued through a ring to the next pinion) and *Game board* (RoyalGame: Ur's board engraved on a lid that lifts off, a token tray glued inside). Records `gears`, `game`.
- Engine: the seams search works each board's edges out once (`withEdgeMemo`); a gear board made it 200× slower.
- `tests/plywood183.test.ts`. Not made: a knob card (a plain board's look), Planetary and Linkage (`DECISIONS.md`).
## Milestone 179 (every doable boxes.py design in plywood) ✅: wall-mounted

- **Hang by keyholes or a cleat** on every wall card (wall rack, bin rack, half box, pegboard and the new ones): the cleat is two layers glued face to face on the back and the same two on the wall, the hook dropping behind the wall cleat's front layer (`hangByCleat`, `Panel.cleat`).
- **New cards** (plywood, beta): *Tool holder* (slotted, round holes, *Wrench holder*, *Pliers holder*), *Hooks* (hooks, *Key board*, *Pin row*), *Roll holder*, *Hopper*, *Wall steps* (steps, *Drill stand*, *Wall drill box*); the *Wall tray* challenge on the organiser.
- Records: `notches`, `wells`, `hooks`, `bar`, `steps`, `stepped`, `cleat`; `crenels` go down and back up.
- `tests/plywood179.test.ts`; `tests/templates.test.ts` lists the roll holder among the designs of fewer than four boards.
- Not built: caliper and plane holders, WallConsole, WallStackableBin (`DECISIONS.md`).

## Milestone 178 (every doable boxes.py design in plywood) ✅ part 2

- **New cards** (plywood, beta): *Showcase*, *Louvred box*, *Can dispenser*, *Book cover* (3 mm), *Clock face*; on the bottle rack card *Bottle stack* and *Jar rack*.
- **Challenges**: *Card box*, *Display case*, *Traffic light* (lidded box), *Computer board rack* (shelf), *Game box insert* (organiser).
- Records: `coin`, `cradles`, `spine`; `disc` on a slot body.
- `tests/plywood178b.test.ts`; `tests/missions.test.ts` has their reference solutions.
- Not built: laser jigs, pizza peel, HobbyCase, TriangleLamp, OrganPipe, BeeQueenCage (`DECISIONS.md`).

## Milestone 184 (every doable boxes.py design in plywood) ✅ bigger than 600 × 400; enclosures

- **E9:** the limits the sheet bounds open up on 787 × 488 (box, tray, frame, flex-door box, U box, rounded trapezoid, wall rack, pegboard, bottle rack, hooks, can dispenser, jar rack); the rest end at the sentence's 300 mm first (owner). The drawer offers plywood's two sheets in one click (`PLY_SHEETS`); a challenge larger than 600 × 400 starts on 787 × 488 (`Mission.sheet`).
- **Split with keys** (`src/model/keySplit.ts`, `Panel.keyed`): a plywood board too big for its sheet is cut across into pieces that fit, joined by dovetail keys, when the student picks *Split with keys* in the export check or the ready badge; worked out in the cut, clear of holes and shapes; a note says so (`val.keyed`).
- **Box words (plywood):** lid *a top screwed on corner blocks*; *rack*: a front panel for a 19-inch or 10-inch rack, or rails for Eurorack modules (`structures/enclosure.ts`, `Panel.fitting`).
- **Challenges:** *Electronics box*, *19-inch rack box* (787 × 488), *Seven-segment clock* (Workshop) on the lidded box; *Eurorack case* on the open box; *LED matrix box* on the organiser.
- `tests/plywood184.test.ts`; `tests/missions.test.ts` has the reference solutions.
- Not built: HobbyCase, Arcade, AirPurifier, CarbonFilter, Rack19HalfWidth, the latched hatches (`DECISIONS.md`).

## Milestone 185 (every doable boxes.py design in plywood) ✅ verification

- **The lane in numbers:** 74 cards and 123 variants over 73 structures (66 make plywood), 16 challenges; the sentence's first word lists 62 cards on plywood 3 mm (about 31 before milestone 171). Every card and word of milestones 171–184 is beta until cut (`BOXES_PLYWOOD_PLAN.md` §7, the test-cut list).
- `npm run typecheck` clean; `npm run build` passes; `npm test`: 2078 passed (7 skipped), goldens byte-identical.
- Look-alikes (`preset-sheet.spec`): none new in any board; contact sheets regenerated (`docs/preset-shots/sheet-*.png`).
- **Found and fixed:** the first-word list on plywood took 22 s to work out (each of about 97 entries settling its sizes by bisecting the largest that lies on the sheet). A size is now checked by one build (`Limit.holds`), one under its least rises to it without the bisection, and the sheet limits stay lazy: 6 s. `start-sentence.spec` (every structure starts in every board) is one test per board.
- **Every app spec** (`pw-app.config.ts`, 280): 192 passed, 62 skipped, 26 failed on the first run. None is caused by this lane once the list is quick:
  - failing at milestone 160 as well: `quick.spec:13`, `sentence-card.spec:7`, `quick-revised.spec:92` (en, he), `gizmo.spec:50/252/376`, `refine.spec:25/341`, `through.spec:16`, `crash.spec:16`, `maintenance.spec:104`, `overhaul.spec:10`, `round.spec:27`, `topbar.spec:75`; `classroom.spec` (5) needs the Worker; `maintenance.spec:185` passes on its own;
  - failing before milestone 171 too (checked on 4efeed9, after the presets-from-boards merge): `sentence.spec:13` (en, he: the keyboard walk), `topbar.spec:61` (Quick build 1280 × 800 and Hebrew 1024 × 768: the bar is 1 px too wide);
  - `start-sentence.spec:25` was this lane's (the slow list): fixed, passes per board.

## Remaining limitations (whole project)
- LightBurn colour/layer mapping follows LightBurn's documented palette but was not imported into LightBurn itself here; please check on the classroom machine. Fit claims also need a calibration test cut on scrap.
- Text is single-line without kerning; cut-through text has no stencil bridges (flagged instead).
- Packing is bounding-box based until *Nest* is pressed (true-shape raster nesting, milestone 69).
- Bands (folds with a radius, rounded corners, round boxes) carry no shapes or text yet; a band is never cut to fit a sheet. (Milestone 65 planned shapes on a round box's wall; not done.)
- Corrugated: the automatic bend pattern can choose Smooth for a bend that lies across the flutes on the sheet; the export check flags it and its Fix (per corner) perforates it.
- Nesting and *Save material* run on the main thread. A plywood board longer than its sheet is split across with puzzle keys only when asked (*Split with keys*, milestone 184); card and corrugated boards, and boards folded in a net, are not.
- Pattern spacings, slit factors and the snap-lock bottom's proportions are starting values until cut on the school's materials.
- Multiple selection covers shapes, not whole panels; box selection is 2D-only.
- Half-laps are detected for upright panels only. (A grown panel can now stand on part of an edge, milestone 19.)
- The production build is split (20 November): libraries in their own files, the cut plan, download dialog, teacher view and font parser loaded when first used.
