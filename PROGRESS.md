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

## Remaining limitations (whole project)
- LightBurn colour/layer mapping follows LightBurn's documented palette but was not imported into LightBurn itself here; please check on the classroom machine. Fit claims also need a calibration test cut on scrap.
- Text is single-line without kerning; cut-through text has no stencil bridges (flagged instead).
- Packing is bounding-box based (no true-shape nesting).
- Multiple selection covers shapes, not whole panels; box selection is 2D-only.
- A grown panel always spans the full edge it grows from; half-laps are detected for upright panels only.
- The production bundle is one ~1.6 MB JavaScript chunk (fonts load separately); code splitting is a later optimisation.
