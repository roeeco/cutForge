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
- Arcs are not refitted after booleans: a curved shape that crosses an outline (or a through-cut region) exports as short straight segments.
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

## Remaining limitations (whole project)
- LightBurn colour/layer mapping follows LightBurn's documented palette but was not imported into LightBurn itself here; please check on the classroom machine. Fit claims also need a calibration test cut on scrap.
- Text is single-line without kerning; cut-through text has no stencil bridges (flagged instead).
- Packing is bounding-box based (no true-shape nesting).
- Multiple selection covers shapes, not whole panels; box selection is 2D-only.
- Half-laps are detected for upright panels only. (A grown panel can now stand on part of an edge, milestone 19.)
- The production bundle is one ~1.6 MB JavaScript chunk (fonts load separately); code splitting is a later optimisation.
