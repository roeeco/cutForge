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

## Milestone 2 — Connections and angles
Not started.

## Milestones 3–6
Not started.
