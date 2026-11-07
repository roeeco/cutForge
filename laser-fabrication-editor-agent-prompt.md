# Classroom laser design tool: implementation prompt

## 1. Goal

Build a browser tool that lets high-school students design laser-cut **organisers and game parts for class activities** (boxes with dividers, card and tile stands, boards, tokens) and turn them into accurate cut files for LightBurn.

A student starts from a template or a blank design, builds the object from flat panels in a 3D workspace, adds cutouts and Hebrew or English engraved text, sets how many copies of each piece they need, and gets packed cutting sheets. They then either **download the cut file directly** (SVG or DXF) or **submit it to their teacher's class** with a class code. The teacher sees submissions, combines pieces from several students onto shared sheets, downloads them for LightBurn, and marks them as cut.

The central requirement is **one design, edited directly in two views**: a 3D workspace and a 2D cut plan. An edit in either view changes the same panel immediately, with no regeneration step and no separate shape-edit, assembly or preview stages.

This is a focused panel-and-sheet tool for a 75-minute lesson, not a general CAD system. Do not introduce a solid-modeling kernel or an unrestricted geometric constraint solver. When a feature choice is unclear, prefer the version a 14-year-old can use correctly on the first try.

## 2. Who uses it

- **Students** (primary users): teenagers, many designing for the first time, on their own laptops (mixed hardware, often integrated graphics). A typical session is 75 minutes from opening the tool to a cut-ready file; work must also resume reliably in a later lesson.
- **Teacher**: creates a class, shares its code, reviews and batches submissions, cuts them in LightBurn, and marks them as cut.
- **Anyone else**: the editor and direct download work with no class, no account and no network connection after the app has loaded.

## 3. Decisions already made

| Topic | Decision |
| --- | --- |
| Stack | React + TypeScript + Vite; three.js (React Three Fiber acceptable) for 3D; Vitest for geometry/unit tests; Playwright for interaction tests. |
| Hosting and backend | Cloudflare: static app plus a Worker API, D1 (via Drizzle) for classes and submission records, R2 for submitted project and preview files. Foldform's Worker/D1/Drizzle setup is a reference. |
| Backend is optional | Designing, saving and **downloading SVG/DXF never require the backend**. Export runs entirely in the browser. Only class submission and the teacher view use the network; if it is unreachable, the student can still download their file. |
| Student identity | Display name + class code. No student accounts, passwords or email addresses. |
| Teacher access | One teacher login (e.g. email magic link or passkey). The teacher creates classes, gets a short code per class, and can close a class or delete its submissions. |
| Interface language | Hebrew and English with a toggle; Hebrew uses a full right-to-left layout. Route every UI string through an i18n catalog from the first milestone. Numbers, units and the canvas are never mirrored. |
| Start view | A new design opens in the 3D workspace. The first panel is drawn on the ground plane, so single flat pieces (tokens, boards) work naturally. |
| Downstream software | LightBurn. Exports use LightBurn-friendly colors, units and layers (section 10). |
| Internal units | Floating-point millimetres. Convert at explicit boundaries: Foldform integer micrometres (÷1000), Die Cut Studio PDF points (×25.4/72). Keep geometric tolerance (e.g. 1e-6 mm), display precision (0.1 mm for students, 0.01 mm in the material settings) and screen-space snap distance (pixels) as separate constants. |
| Local storage | Autosave in the browser (IndexedDB), plus download/open of a portable JSON project file with a `schemaVersion` and migrations. |
| Code reuse | Copy or adapt code only from MocknSlice and Foldform (owner's code, reuse authorized), Die Cut Studio (MIT, keep its notice) and Extrudo's `packages/io` (MIT, keep its notice). Extrudo's GPL-3.0-or-later code and SketchForge-3D's AGPL-3.0-only code are **behavior references only: do not copy or translate them**. Record every copied or adapted file in `THIRD_PARTY.md` with repository, commit and license. |
| Out of scope for this release | Lid wizard (three/four selected edges; the organiser template's own lid option in section 9 is in scope), paper matchbox and its reinforced tray, the Die Cut Studio extension proof, living hinges, finger joints at angles other than 90°, touch/tablet input, image/photo engraving. |

If any decision turns out to be unworkable, choose the nearest reversible alternative and record the reason in `DECISIONS.md`.

## 4. Working approach

- Inspect the provided workspace and its instructions first. Preserve existing work and follow its conventions. If it is empty, start fresh with the stack above.
- Begin with a short written plan that follows the milestones in section 13, then build and validate. Make reasonable, reversible decisions without stopping for routine approvals. For consequential ambiguities, choose a default, record it in `DECISIONS.md`, and continue.
- The repositories in the appendix are optional sources of code and ideas, not a stack to assemble.
- Never present a control, template or preview as finished if it is inactive or a placeholder.

## 5. Design model (build this first)

Everything is derived from one authoritative, serializable design model.

- **Single authority.** 3D display, cut-plan geometry, validation, packing and export are all derived from the model. Rendering objects and mesh indices are never the editing authority.
- **Stable identities.** Panels, edges, details (cutouts, scores, engravings, text), connections, arrays and template-generated entities carry stable IDs. User edits are stored against those IDs and survive template regeneration.
- **Pieces vs panels.** A *piece* is one connected flat outline to be cut. Panels joined by folds belong to one piece and stay together as a flat net; panels joined by seams (finger joints, tabs/slots, glue flaps to another piece) are separate pieces.
- **Quantity.** Each piece has a quantity (default 1). Copies share geometry; the packer places each copy.
- **Two placements.** Assembly placement (from the parent connection) and sheet placement (from the packer or manual adjustment) are separate. Moving a piece on a sheet never moves it in the assembly.
- **Nominal vs manufactured geometry.** The model stores nominal geometry. Fit clearance belongs to connections; kerf compensation happens only in export preparation (section 10). Neither is applied twice.
- **History.** All changes go through transactions: a completed drag or committed numeric edit is one undo step; cancel restores the previous state. Selection and undo are shared across views.
- **Responsiveness.** Cheap previews run synchronously during drags. Heavier work (packing, text outlining, export preparation) runs off the critical path, keeps only the newest pending request, discards stale results, and keeps the last valid state on failure. Keep the 3D view light enough for integrated laptop graphics: no heavy post-processing, modest shadows, simple materials.

## 6. The workspace

1. **3D workspace.** Selecting a panel makes its plane the drawing surface. Selecting an edge lets the student grow a new panel from it: a ghost preview shows the new plane and which side the material thickness lies on. The student picks the angle (section 8), the inward/outward direction, and the connection type, then keeps drawing. Provide orbit/pan/zoom, an orientation control, and a perspective/orthographic switch that preserves view direction and framing.
2. **2D cut plan.** Shows every piece flat on packed sheets. Students edit outlines, cutouts and text here with the same tools as in 3D. Changes appear in 3D immediately. Pieces can be nudged or rotated manually after packing; flag overlaps and pieces outside the sheet.
3. **Solo panel view.** Double-clicking a panel (or an equivalent button or keyboard action) opens a face-on 2D view of that panel with the same tools, selection and history. An obvious control returns to the previous view and camera.

A cutout drawn on an upright panel in 3D appears on the matching flat piece; a detail edited in the cut plan updates the same panel in the assembled object.

**First-use guidance.** On a blank design, show a short, dismissible hint sequence (draw a panel → grow a panel from an edge → add a cutout → export). Keep hints in both languages and out of the way once dismissed.

## 7. Drawing and editing

- **Shapes.** Drag to create rectangles, rounded rectangles and circles. Closed polygons with editable vertices. Each shape is a panel outline, cutout, score line or engraving.
- **Text.** Hebrew and English text as engraving (or as a cut-through stencil). Choose from a few bundled, licensed fonts that cover both scripts. Lay out Hebrew right-to-left, including mixed Hebrew/English/numbers in one line, with correct bidi ordering. Convert text to outline paths for export so LightBurn never needs the font. Text stays editable as text in the project.
- **Imported SVG.** Students can import a simple SVG icon or symbol as an engraving or cutout. Reject or simplify files that are not closed vector paths, and explain why.
- **Direct manipulation and inspector.** Move and resize with handles. The inspector shows exact width, height or diameter, position and rotation, and states which panel or selection the values describe.
- **Multiple selection.** Shift/Ctrl-click and rectangle selection; group move, duplicate, delete and resize about the group's bounding box.
- **Align and distribute** by edges, centers, equal gaps and equal center spacing, within one panel's plane. Explain why the action is unavailable when a selection spans panels on different planes.
- **Arrays.** Linear and rectangular arrays with editable count and spacing that stay live after creation. An explicit "Explode array" action turns an array into independent details. (Arrays repeat details *within* a panel; piece quantity repeats whole pieces on the sheet.)
- **Smart snapping** while drawing, moving and resizing: endpoints, edges, midpoints, shape centers, bounding-box centers, the enclosing panel's center, alignment with other details, and equal-spacing guides. Exclude the geometry being manipulated from self-snaps, show the active target and guides, and use a fixed screen-space threshold at every zoom. Snapping creates no persistent relationship; only connections and arrays are persistent.
- **Keyboard.** Delete, arrow-key nudge (larger step with Shift), Escape to cancel, standard undo/redo.

## 8. Materials, angles and connections

**Materials.** Material is chosen first and stays editable.

| Profile | Starting thickness | Connections offered |
| --- | --- | --- |
| Thick paper / card | measured caliper (start at 0.5 mm) | folds, glue flaps, tabs/slots |
| Corrugated cardboard | 1.6 mm | folds, glue flaps, tabs/slots, half-laps |
| Corrugated cardboard | 4 mm | as above, larger fold allowance |
| Plywood | 3 mm | finger joints, tabs/slots, half-laps; no folds |

Each profile stores measured thickness, laser kerf, joint fit clearance, fold/score allowance, sheet size, and grain/flute direction. Values are labeled as starting points to calibrate on the actual material and laser. Students can see these values; a teacher-provided profile can be loaded from a template or class (section 12) so the whole class uses the same calibration. Allow a custom profile.

**Angles.** New panels join at **90° by default**, with **60°, 45°, 30° and 15°** as quick choices, plus the inward/outward flip. Define the angle as the angle between the new panel and its parent panel, show it on the ghost preview, and record the definition in `DECISIONS.md`.

**What each angle allows.** A laser cuts straight through the sheet, so a slot or finger joint only fits two panels that meet at 90°. The engine offers connections by the actual angle between the two panels:

- **90°:** every connection the material supports.
- **15°–60°, paper and corrugated:** folds and glue flaps only.
- **15°–60°, plywood:** no direct connection to the panel it leans on. The leaning panel is held by **side walls**: panels that stand at 90° to both the leaning panel and its base. Tabs on the leaning panel's side edges pass through slots cut in the side walls at the lean angle. Because the leaning panel and each side wall meet at 90°, these slots fit square. The leaning panel's bottom edge simply rests on the base.

When a student picks a non-90° angle in plywood and no side wall exists yet, the edge toolbar disables the angled tab-and-slot choice and explains why ("An angled panel needs a side wall to hold it"). It then offers to add a pair of side walls at 90° to the base, sized to enclose the leaning panel. If a side wall is later deleted or moved away, flag the leaning panel as unsupported instead of silently keeping a slot that cannot grip.

**Connections.** A connection owns the relationship between its panels and regenerates both sides together whenever dimensions, material thickness, count, spacing, clearance or angle change.

- **Finger joints**: plywood, 90° only. Use a deterministic corner-ownership rule at three-panel corners (state it in `DECISIONS.md`).
- **Tabs and slots**, including slots inside a receiving panel (not only on its edge), only between panels that meet at 90°. A slot cut in a side wall may run at any angle within that wall, which is how plywood holds leaning panels (see "What each angle allows").
- **Folds**: paper and corrugated, at any of the offered angles, with a recorded fold direction (mountain/valley) and exported as score lines. Folded panels stay in one piece.
- **Glue flaps**: belong to a specified panel and fold toward the receiving panel.
- **Half-laps** for crossing dividers.
- Mixed connection types within one design.

Clearance is applied once per connection. Clear internal dimensions shown to the student reflect material thickness and clearance.

**Closing seams.** When a new panel's edge meets an existing panel's edge, offer to connect them. If connected edges stop meeting after an edit, show the mismatch and keep the last valid result instead of silently reshaping the object.

**Dividers.** For organisers: dividers in either direction with editable count, spacing, individual positions and height. A divider meets a wall in the middle of the wall's face, not at its edge, so finger joints do not apply. Default connections by material:

- **Plywood:** tabs on the divider's ends and bottom edge pass through interior slots in the walls and base (the existing tab-and-slot connection); crossing dividers join with half-laps. The grid locks without glue.
- **Corrugated and card:** dividers cross with half-laps and slide in between the walls with a fit clearance, or attach with short glue flaps. No through-slots in the walls, which would weaken them.

Generate all of a divider's connections together; slots and half-laps in the receiving parts follow when a divider moves or changes height. Show the clear compartment sizes.

## 9. Templates

A student starts from **New blank design** or a template. Ship these two templates, each in the listed material variants:

| Template | Variants | Parameters |
| --- | --- | --- |
| Organiser with dividers | Plywood 3 mm, finger-jointed; Corrugated 1.6 / 4 mm, folded tray with glue flaps | inner or outer size, height, divider count in each direction, divider height, lid (none / lift-off), lid rim height |
| Card / tile stand | Plywood 3 mm: base plus two side walls with angled slots that hold the leaning card supports; Card or corrugated with folded support | card/tile width and thickness, lean angle (15/30/45/60°), number of slots, base depth |

**Organiser lid option.** The organiser template has an optional lift-off lid that slides down over the outside of the walls (a telescoping lid):

- **Plywood:** a top panel with a shallow rim of four strips joined to it and to each other with finger joints, forming an upside-down shallow tray. Its inner size = the box's outer size + 2 × fit clearance.
- **Corrugated:** a shallow folded tray built like the organiser itself (scored folds, glue flaps), with inner size = the box's outer size + 2 × fit clearance. Allow for the board thickness at the folds and respect flute direction.

The lid regenerates whenever the box size, material thickness or clearance changes. Divider height may not exceed wall height while a lid is on; flag it if it does. The lid is ordinary panels and connections, so students can add cutouts or engraved text to it.

Templates generate the same panels, details and connections as free drawing and are edited with the normal tools. When a parameter changes, keep user-added details (cutouts, text) attached to their panels by ID, and list any edits that could not be preserved.

Use a small template registry: ID, version, parameter schema with defaults, compatible materials, and a generator that outputs the ordinary design model. The inspector derives template controls from the schema. Adding a template later should need only its definition, generator and tests, with no new screen and no new document format. A teacher can also share any saved project file as a starter for students.

## 10. Sheets, packing and export

**Packing.** The cut plan packs all pieces (including quantity copies) onto as many sheets as needed, using the material's sheet size, a part spacing setting, and a sheet margin. A folded net packs as one unit. Respect grain/flute direction (no rotation against it unless the student allows it). Start with bounding-box packing with 90° rotations; true-shape nesting is optional if time allows. Repacking is explicit (a "Repack" button) or automatic only when no manual adjustments would be lost; never silently discard manual placements.

**Direct download (no backend).** "Download for laser" exports the packed sheets as SVG (default, one file per sheet or a single multi-sheet file) or DXF, plus "Save project" for the JSON file. This works offline and never contacts the server.

**LightBurn conventions.**
- Units: SVG `width`/`height` in `mm` with a matching viewBox; DXF in millimetres (`$INSUNITS` 4). Imported files must open at true size.
- Operations on separate layers with LightBurn's standard palette colors, so each operation lands on its own LightBurn layer automatically: one color for cut, one for score, one for engrave (verify the exact hex values against LightBurn's palette and document the mapping in the app and the README). Paths are strokes; engraving areas are closed paths LightBurn can fill.
- Kerf: default to **Nominal** export, matching the usual LightBurn workflow of setting kerf offset per layer, and show a short note saying so. Offer **Compensated** export (outer contours outward, holes inward by half the kerf) for users who prefer it. Show the active mode and kerf value in the export dialog and file name so compensation is never applied twice. Offset line-and-arc contours analytically so arcs stay arcs; if an offset is invalid (self-intersection, collapse), block that export and point to the piece.
- Curves: preserve circles and circular arcs in both formats; when approximation is needed, use a declared tolerance (e.g. 0.01 mm).

**Validation before export or submission.** Flag open contours, duplicate cut lines, holes outside their panel, features thinner than a safe minimum for the material, unresolved connections, text that failed to outline, and overlapping or out-of-sheet pieces. Explain each problem in plain language and select the affected geometry when clicked. Validation, download and submission all use the same prepared geometry.

**Writer note.** If you reuse Extrudo's MIT `packages/io` writers: its DXF writer emits closed contours as single bulge POLYLINEs only on *fill* layers (stroke layers become separate LINE/ARC entities), but the same `fill` flag makes the SVG writer fill shapes, which LightBurn treats as engraving. Configure layers per format rather than sharing one setting.

## 11. Class submission (optional, uses the backend)

- **Joining.** "Submit to class" asks for the class code and the student's display name (remembered locally after the first time). No other personal data is collected.
- **Submitting.** Upload the project JSON, a preview image, and the material profile used. The server stores them in R2 with a D1 record (class, display name, title, material, piece count, time, status). A student can resubmit; the newest submission replaces the previous one from the same device, with history kept for the teacher.
- **Failure handling.** If the network or server fails, say so plainly and offer "Download for laser" instead. Never lose the student's local work.
- **Abuse limits.** Rate-limit submissions per class code, cap file sizes, and accept only well-formed project files. Class codes are short, random, and can be closed by the teacher.

## 12. Teacher view

- Sign in, create and close classes, and see each class's code.
- **Submissions list** per class with preview, student name, title, material, piece count and status (*New*, *Cut*). Download a submission's SVG/DXF or project file.
- **Batch onto shared sheets.** Select submissions with the same material and thickness, and pack all their pieces (with quantities) onto shared sheets using the same packer and export code as students. Label each piece on a non-cutting guide layer with the student's name or initials so cut parts can be sorted. Refuse to batch mixed materials and explain why.
- **Mark as cut** per submission or for a whole batch.
- **Class material profile.** Optionally attach a calibrated material profile to a class; students who submit to that class are warned if their design uses different kerf/thickness values and can switch to the class profile.
- Delete submissions or whole classes; describe in the README what data is stored and for how long.

The teacher view regenerates export geometry from the submitted project files with the same code the students use; it never trusts a submitted SVG.

## 13. Milestones

Work in order. Each milestone ends with a passing build, its tests, and a note in `PROGRESS.md`. If time runs out, finish and verify the current milestone rather than leaving several half-built.

1. **Vertical slice.** Hebrew/English toggle in place → choose a material → drag out a panel in 3D → grow a second panel at 90° → finger-joint connection → add a cutout in either view → resize it numerically → switch views → undo → autosave, reload and reopen → **download SVG and DXF** that open at true size in LightBurn.
2. **Connections and angles.** Folds, tabs/slots (including interior slots, and angled slots in side walls for leaning plywood panels), glue flaps, half-laps, three-panel corners, closing-seam detection.
3. **Editing tools.** Multiple selection, snapping with guides, align/distribute, arrays, solo view, keyboard behavior.
4. **Text, import and quantity.** Hebrew/English text to outlines, SVG import, piece quantity, packing onto sheets, pre-export validation, kerf modes.
5. **Templates.** Organiser with dividers and card/tile stand, all variants.
6. **Class submission and teacher view.** Worker API, D1/R2, submission flow with download fallback, submissions list, batching, mark as cut.

## 14. Acceptance checks

Automate wherever practical:

1. Editing in either primary view changes the same panel without a regeneration step or loss of selection; solo view returns to the previous view and camera with changes intact.
2. Snap guides, multiple selection, exact sizing, arrays and distribution give predictable results in panel coordinates.
3. Connected edges stay complementary after changes to dimensions, thickness, clearance, count, spacing and angle. A 3 mm plywood panel leaning at 30° is held by side-wall slots that fit its thickness plus clearance; with no side walls, the angled tab-and-slot option is unavailable and the reason is shown; deleting a side wall flags the leaning panel as unsupported. Divider half-laps follow their dividers.
4. Each template variant can be customized with normal tools, and user-added cutouts and text survive a parameter change. Plywood dividers pass through wall and base slots that follow them when moved; corrugated dividers have no wall slots. The lid's inner size equals the box's outer size plus twice the clearance, in both materials, after changing box size and thickness.
5. Mixed Hebrew, English and numbers in one text line export as outlines in the correct visual order; the exported file contains no font references.
6. A piece with quantity 30 packs onto sheets without overlaps, within margins, and respecting grain direction; a folded net stays in one piece.
7. Save/reopen and undo/redo preserve details, text, arrays, connections, quantities and manual sheet placements. One drag is one history step.
8. With the network disabled, a student can design, save and download SVG and DXF.
9. Exports open at true size and land on separate LightBurn layers for cut, score and engrave. Kerf check: a 50 × 50 mm panel with a Ø10 mm hole and 0.2 mm kerf exports in *Compensated* mode as 50.2 × 50.2 mm with a Ø9.8 mm hole, and unchanged in *Nominal* mode. Check closure, duplicates, holes and curves with an independent reader (Python `ezdxf` for DXF; an SVG path parser or Inkscape CLI for SVG).
10. Submission: a student submits with a class code and name; the teacher sees it, batches it with another submission of the same material onto shared sheets with name labels on the guide layer, downloads the result, and marks both as cut. Mixed-material batching is refused with an explanation. A failed submission offers the download instead and loses no work.
11. The Hebrew interface is fully right-to-left and usable; no UI string is hard-coded outside the i18n catalog.

Digital validation is not physical proof: fit claims require calibrating the material profile and test cuts on scrap.

## 15. Final report

Finish with: a working build; local run, test and Cloudflare deployment instructions in `README.md` (including the LightBurn color mapping and recommended kerf settings); `DECISIONS.md`, `PROGRESS.md` and `THIRD_PARTY.md`; a concise account of what was implemented and how it was verified; and a specific list of remaining limitations. Do not claim features that exist only as inactive controls or placeholder previews.

---

## Appendix: repository references

Consult selectively, within the reuse rule in section 3. Snapshots reviewed on 7 November 2026; check for relevant changes before adapting code.

| Repository | Commit | License | Use |
| --- | --- | --- | --- |
| [zoltanf/extrudo](https://github.com/zoltanf/extrudo) | `3dc1ec1fa46c84dce852d6f51944475587704759` | GPL-3.0-or-later; `packages/io` MIT | interaction reference; MIT I/O reusable |
| [Formsmith746/SketchForge-3D](https://github.com/Formsmith746/SketchForge-3D) | `e9cb8e8681f92e12f6044e046046cf1d363f6811` | AGPL-3.0-only | interaction reference only |
| [roeeco/foldform](https://github.com/roeeco/foldform) | `4a90768c28eb5d672c6b6beeeb15b6ae38d93b97` | owner's code, reuse authorized | paper constructions, export, Cloudflare setup |
| [roeeco/Mocknslice](https://github.com/roeeco/Mocknslice) | `79966c924415ed00a860ce0c3578540ecdcec5da` | owner's code, reuse authorized | joints, dividers, output prep, templates |
| [pradeepsiddappa/diecutstudio](https://github.com/pradeepsiddappa/diecutstudio) | `3584baa4ac5d1e213a92a79b60622564518955ec` | MIT | fold math, tab/slot primitives |

The live apps ([Extrudo](https://app.extrudo.org), [SketchForge demo](https://sketchforge3d.com/demo)) help if you can open a browser; the repositories and documentation are enough otherwise.

### Extrudo: sketch-tool quality and editing feedback (behavior reference; MIT I/O reusable)

- `apps/web/src/sketch/tools/tool.ts`, `rectangle.ts`, `host.ts`, `SketchOverlay.tsx`: small tool state machines, previews, Width/Height fields beside the cursor, snap glyphs, contextual prompts. Its rectangle tool is click-based; ours is drag-to-create.
- `apps/web/src/viewport/camera.ts`: ray-to-plane picking and screen-distance conversion.
- `packages/sketch/src/inference/inference.ts`, `pick.ts`: a prioritized snap order (points → intersections/midpoints → guide crossings → curves → alignment → grid), alignment guides, face-center targets, window vs crossing selection on tilted planes. Its snapping applies while drawing; geometry drags go through its constraint solver, so snapping during move/resize must be built here.
- `apps/web/src/sketch/tools/DimensionLabels.tsx`, `dimension.ts`, `apps/web/src/sketch/panels.tsx`: dimension editing, unit/expression input, selection-sensitive properties.
- `packages/sketch/src/modify/transform.ts`, `apps/web/src/sketch/tools/transform.ts`: mirror/copy/scale/pattern with live numeric feedback (its patterns emit copies, not live arrays).
- `packages/core/src/history.ts`, `docs/adr/0092-live-handle-drags.md`: cancellable transactions, one undo step per drag, "only the newest pending preview" scheduling.
- **Reusable under MIT:** `packages/io/src/drawing.ts`, `svg.ts`, `dxf.ts`, `transform.ts` with `packages/io/LICENSE`: a millimetre drawing model (lines, circular/elliptical arcs, Béziers; y-up) and SVG/DXF writers (SVG keeps arcs and Béziers and uses mm page size; DXF R12 keeps circles/arcs and flattens ellipses/Béziers to a tolerance). Write an adapter from our model; Extrudo's own sketch-to-drawing adapter is GPL. See the writer note in section 10.
- `e2e/sketch-select.spec.ts`, `sketch-tools.spec.ts`, `sketch-dimensions.spec.ts`, `packages/io/src/io.test.ts`: test patterns.
- Not applicable: its OpenCascade kernel, planegcs solver, mechanical assembly joints, and sandboxed plugin API.

### SketchForge-3D: 3D workspace interaction (reference only)

- `README.md`, screenshots and the live demo: workplane with grid and snap settings, selection outlines, transform handles, camera controls, orientation cube, inspector values tied to visible geometry, and an orthographic/perspective switch (key **O**) that preserves view direction and framing. Its guided "challenges" (key tag, nameplate) are a useful model for the first-use hints.
- The owner's permission for MocknSlice and Foldform does not extend to this repository.

### Foldform: paper constructions, export, Cloudflare setup

- `app/lib/template-kernel.ts`: `buildRectangularTray`, `buildProfileTray`, `NetFace`, `FoldConnection`: glue-corner trays and material-compensated rims, useful for the corrugated organiser.
- `app/lib/dieline.ts`: `generateBoxWithLid`, measurement parsing, named anchors and dimensions.
- `app/lib/exporters.ts`: SVG/DXF serialization with analytic arcs and path roles (outer cut, internal cut, crease, perforation, glue boundary).
- `app/Editor.tsx`: numeric inspector behavior and highlighting the geometry a measurement affects.
- `worker/index.ts`, `db/`, `drizzle/`, `package.json`: Cloudflare Worker with a D1 binding, Drizzle and Wrangler. The schema is empty; treat it as a deployment skeleton.
- Limits: parameter-driven 2D editor; kerf stored but not applied in generation/export; score allowance is an estimate (1.25 × caliper) that must stay calibratable.

### MocknSlice: joints, dividers, output preparation, templates

- `src/geometry/panelConstruction/fingerJoints.ts`, `dividerJoints.ts`, `validateReciprocalJoints.ts`: complementary joints, stock-aware dimensions, divider crossings, matching-geometry checks.
- `src/components/panels/panelComposer/PanelLocalPreview.tsx`, `PanelFeatureInspector.tsx`: panel-local drag/resize and committing a gesture as one edit.
- `src/domain/designGraph.ts`: panel, connection and feature concepts (evaluate the concepts; its graph migration may be incomplete).
- `src/geometry/output/prepareFabricationOutput.ts`, `evaluateExportReadiness.ts`: nominal geometry separate from compensated output, with validation and export sharing one prepared result; also a material-usage estimate. Its `offsetClosedPathForKerf` handles straight-segment polygons only; arcs need separate handling.
- `src/templates/types.ts`, `registry.ts`, `src/domain/classroomRecipes.ts`: versioned, editable template definitions and classroom box/divider settings, close to this tool's organiser template.
- Limits: detail edits require explicit regeneration; enclosure `tab-slot` mode is retired and rejected; single-feature editor without snapping, multi-select or arrays; production DXF deferred (ADR 0010).

### Die Cut Studio: fold math and primitives

- `src/core/fold/solve.ts`: renderer-independent rigid transforms about hinges.
- `src/core/fold/specs.ts`: per-crease fold direction, signed angle and sequencing.
- `src/core/craft.ts`: hole grids/rings and thickness-aware tab/slot primitives.
- `src/core/models/openTray.ts`, `drawerBox.ts`, `registry.ts`: model composition, useful when adding templates later.
- `tests/diecut.test.ts`: checks for folded dimensions, hole ownership and physical export size.
- Limits: PDF points with y down; the fold engine needs a hinge tree and explicit fold metadata and does no collision or material simulation; its DXF writer flattens curves. Preserve MIT attribution.
