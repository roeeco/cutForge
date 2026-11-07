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
- Only parent–child joints: two walls grown from adjacent edges of a base overlap at their shared corner (no closing seams or three-panel corner rule yet — milestone 2).
- 90° only; no folds, tabs/slots, glue flaps or half-laps yet (milestone 2). Paper and corrugated materials join edge to edge for now, and say so.
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


## Milestones 3–6
Not started.
