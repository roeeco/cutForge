# CutForge: images on boards: brief

Planning notes from 2026-11-10, written after milestones 25–41 (Quick build) and their follow-up, on `claude/zen-bell-k1gy09`. The feature puts a picture on a board, then either **prints it** on paper (A4/A3, glued on) or **traces it** into engrave or score lines on the board itself. Built on `claude/image-board-wall-planning-1kdgu9`, which merges that branch. The decisions in §2 come from the interview of 2026-11-10. §3 lists the code from milestones 25–41 that the feature reuses.

## 1. What changes for a student

- **Image mode.** A labelled stage toggle, *Images*, next to *Joints*, working like the joints view: while it is on, joint labels and every handle (move, turn, grow, hinge) are hidden, and boards only answer to the pointer for images. Boards stay fully visible, with no dimming. *Images* and *Joints* turn each other off. Esc or the toggle leaves the mode. It is the same in Quick build and Workshop.
- **A "+" on the board under the pointer.** Hovering a board face highlights the face (as the Panel tool does) and shows a "+" at the pointer. Hovering the edge shows none, and so do construction panels. Clicking the "+", or dropping a file on the face, adds the image. It lands centred on that face, as large as fits inside the board's outline, and waits for the floating **✓** like everything else that is made.
- **Scale and place.** Corner handles scale proportionally, and with **Shift** held they scale freely. Dragging moves the image with the usual snapping (centre, edges, other shapes), and the ring turns it. The image is clipped to the board's outline, its joints and its holes.
- **One use per image**, chosen in its card:
  - **Print as is**: the clipped image, with a 5 mm bleed, becomes a *print piece* on **paper sheets** (A4 or A3), shown after the material sheets in the cut plan. *Download prints* gives 300 dpi JPGs at true size. A print too large for A3 gets a warning.
  - **Trace**: the floating bar beside the board holds a **black-and-white threshold** slider, with a live preview on the board, and *Fill* / *Outline*:
    - **Fill**: contours of the black areas, engraved.
    - **Outline**: centerline single strokes, or contour lines around the areas, scored.

    ✓ puts the result on the same board, so it shows on that board in the cut plan and exports in the existing layers.
- **Across neighbouring walls.** In the cut plan, a selected image or trace has an optional toggle, *Spread onto neighbours*. When it is on, the neighbouring walls appear unfolded around the board as faint outlines, and the transform handles can stretch the image or trace across them. In 3D the image wraps around the corners. Each wall gets its own part: its own print piece, or its own traced shapes.

## 2. Decisions

### From the interview (2026-11-10)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Uses | **Print or trace, never both.** One image, one use. |
| 2 | Prints larger than A3 | **Warn.** A print larger than the printable A3 area (287 × 410 mm with 5 mm margins, bleed included) gets a warning. There is no tiling. |
| 3 | Bleed | **5 mm** past the board's outline. A thin grey trim line marks the true outline. |
| 4 | Server | **Only traces reach the server.** They are vector shapes inside `project.json`. Image files (printed images and trace sources) are never uploaded. The teacher's app shows a print as a grey placeholder on its paper sheet. Laser files are unaffected. |
| 5 | Trace kinds | **Fill = contours** (closed areas with holes, engrave layer). **Outline = centerline** single strokes (open lines, score layer), with *Contour lines* as a second outline style. Before either, a **threshold** step turns the image into black and white with an adjustable slider, plus *Ignore specks* and *Invert*. |
| 6 | Colour | **Black and white only.** No posterize or grey levels. |
| 7 | Image mode | **Pills and handles hidden.** Other boards are neither dimmed nor hidden. |
| 8 | Spreading | **An optional toggle in the cut plan**: an image or trace can be stretched with the transform handles across neighbouring walls (§4). |
| 9 | Quick build | **Images and tracing in Quick build too.** |

### Proposed

| Topic | Proposal |
| --- | --- |
| The mode | **`imageMode` in the store, not a view preference**, so it does not survive a reload as `viewPrefs.joints` does. One `handlesOff = prefs.joints \|\| imageMode` replaces the eleven `!jointsOn` checks in `View3D` (lines 643–714), and `SeamPills` is hidden while `imageMode` is on. Panels are **not** made `inert`, because `inert` turns off the raycast the "+" needs. Instead, `onPanelDown` and `onDetailDown` return early in image mode, except for image hits. Esc gets a branch in `hooks.ts`. |
| The image on its board | **`Panel.images?: BoardImage[]`, not a new `Detail` shape.** A `shape: 'image'` detail would fall through `detailContour` to a rectangle and be picked up by `groupPieces`, the Quick build guard, snapping, validation and the outline merges: about 50 `.details` call sites in 19 files, each needing a filter. Its own list touches none of them. A `BoardImage` is `{ id, asset, face, cx, cy, w, h, rot?, use: 'print' \| 'trace', spread?, hidden? }`, with a selection kind `'image'`. Snapping reuses `snapBox` with the image's rectangle, and handles reuse the corner-resize code (§3). Copy and paste and Cmd+D are left out at first. |
| Traced result | **An ordinary `path` detail** (`op: 'engrave'` for fill, `'score'` for outline) with `trace: { image, params }`. It gets snapping, copy and paste, arrays, the cut plan and export for free. The source image stays, `hidden`, for *Re-trace*. |
| Open lines | **`path.lines?: P2[][]`** next to `path.polys`. SVG already writes open contours. DXF writes them one `LINE` per segment today, so open contours become one R12 `POLYLINE` each, which keeps centerline files small. Golden exports are unchanged, because no existing design has open detail lines. |
| Quick build | **Feature table:** `images: 'show'`, and `'trace.advanced': 'auto'` for *Smoothing*, *Ignore specks*, *Invert* and *Contour lines*, which *More…* reveals. **The guard leaves traced details alone:** `trouble()` in `easy/guard.ts` would move or shrink an engrave shape near an edge, and is slow on large paths. Traces near slots get a note instead. **Score in Quick build:** `op.scoreAdd` stays hidden. Traced details show the trace card instead of the op toggle, which today would show a score shape as *Cut out*. **Locked boards:** Quick build locks boards made with Workshop tools, including boards of another material, but an image does not change the build, so they still take images. |
| Image storage | **Blobs in IndexedDB**, in a new `assets` store (the database goes to version 2), keyed by SHA-256. The design keeps only the hash in each `BoardImage`. |
| Import size | **Downscale on import** to what 300 dpi needs at the board's longer side, capped at 4000 px, then re-encode as JPEG 0.9. PNGs with transparency stay PNG, and transparent areas are neither printed nor traced. EXIF orientation comes from `createImageBitmap`. |
| Project file | **`assets` on `ProjectFile`, not on the design**: `serializeProject(d, { assets })` embeds base64 for *Save*. *Submit* calls it without assets (decision 4), so the Worker's 2 MB limit and parser are unchanged. No schema bump (stays at 8). |
| 3D look | **A textured mesh of (clip outline ∩ image rectangle)** on the chosen face, built like `FaceHover` (`ShapeGeometry`, 0.15 mm off the face), with UVs mapping the image rectangle. The clip outline is `panelCtx(d, p)` from `easy/guard.ts`: the outline with joint notches, slots and holes. |
| Traces in 3D | **One merged line geometry and one hit mesh per traced detail.** Today each contour gets its own `DetailLines` and two `DetailHit` meshes, which would be thousands of meshes for a trace. |
| Paper sheets | **Kept apart from the material layout.** Putting prints into `pieceCopies` would reach the Worker's piece count, the sheet meter, the *Fits on one sheet* mission goal, `sheetIssues`, `prepareExport` and `batch.ts`. Instead, `printCopies(d)` is packed by `packOne` (exported) on a `PAPER` profile that is not in `MATERIALS`: A4 210×297 or A3 297×420, 5 mm margins, no grain. Plan2D appends that group after the material groups and gets its first `<image>` drawing path (with a `clipPath`) for it. Setting: `print?: { paper: 'A4' \| 'A3' }`. Prints are never mirrored. |
| Print warnings | **Their own check**, not `sheetIssues`, which would make a too-large print a blocking *off sheet* error. *Ready to cut* is unaffected. |
| JPG export | **Rendered in a Worker** on an `OffscreenCanvas` at 300 dpi (A4 2480×3508, A3 3508×4961 px), then `convertToBlob('image/jpeg', 0.92)`. A small helper of our own writes 300 dpi into the JFIF header. Several sheets download as one zip made with **fflate**, through a new `downloadBlob`. |
| Trace pipeline | **Our own preprocessing in a Worker** on `ImageData`: grayscale, blur, threshold (starting at Otsu), invert and a speck filter. The preview runs on a ~1000 px proxy, and ✓ runs the full image. **Fill:** `d3-contour`. **Centerline:** `skeleton-tracing-js`, then gaps under 1 px joined and short spurs dropped. Both are simplified with the Douglas–Peucker in `adapt.ts`, exported for this, and capped at 20 000 points with a note when detail is lost. |
| Mirroring | If the image is on the face that lies down in the cut plan (the plan views each panel from +u×v), the trace is **mirrored**, so it reads correctly on the finished board. The card says so. |

### Libraries (licences checked 2026-11-10)

| Need | Use | Not used, and why |
| --- | --- | --- |
| Fill contours | **d3-contour** (ISC, ~38 kB) | potrace and all its ports (GPL-2, against `THIRD_PARTY.md`); autotrace (GPL); the npm `marchingsquares` packages (AGPL); opencv.js (~10 MB) |
| Centerline | **skeleton-tracing-js** (MIT, 1.0.4) | autotrace's centerline mode (GPL) |
| Zip | **fflate** (MIT) | JSZip (MIT/GPL-3 dual licence, heavier) |
| PDF fallback | **@cantoo/pdf-lib** (MIT, a maintained fork of pdf-lib), only if the large-canvas fallback is needed (milestone 45) | jsPDF (larger) |
| HEIC photos | **None.** Safari decodes HEIC natively; elsewhere the student is asked for JPG or PNG. | `heic-to`, `libheif-js` (LGPL-3) |
| Later, for quality | VTracer (MIT/Apache-2.0), built with `wasm-pack --target web` | – |

The app has no Worker, dynamic `import()` or raster code yet. The image Worker is the first, so every new dependency loads lazily inside it and the main bundle does not grow. Each one is recorded in `THIRD_PARTY.md`.

## 3. What milestones 25–41 already give us

| Need | Existing code | What it saves |
| --- | --- | --- |
| The face under the pointer | `faceAt(d, p, point)` and `hostFace(d, host, face)` (`views/panelTool.tsx:29, 36`), and the `onHoverPoint` feed that sets `faceHover` and `st.pointerHit` (`View3D.tsx:650`) | The "+" needs only a button following `pointerHit` (add `face` to it). Face picking is done. The plan's reference to the *Divider between* pick is out of date: that pick was removed in milestone 32. |
| Face highlight and image mesh | `FaceHover` (`panelTool.tsx:360`): the outline as `ShapeGeometry`, 0.15 mm off the chosen face | The image mesh is the same component with a clipped shape, UVs and a texture. |
| Drop target | `useRayFromScreen` (`widgets.tsx:35`) | A file drop finds its board and face with no pointer moves. |
| Confirm and undo | `ConfirmBar` (`panelTool.tsx:108`, with Enter/Esc and extra controls as `children`), `PendingBarHtml` for the cut plan, and `beginPending`/`confirmPending`/`cancelPending` (`store.ts:384`). The SVG import (`Toolbar.tsx:49`) is the template. | Placement waits for ✓ as one undo step. The threshold slider and *Fill / Outline* sit inside the floating bar, so there is no separate trace dialog. |
| Resize handles | `ThroughCorner` (`View3D.tsx:1930`): corner resize that respects rotation and snapping, with `preview`/`commit`. `ShapeGizmo` and `Gizmo` for move and turn. In the cut plan, `resize`, `Handles` and `RotRing` (`Plan2D.tsx:250, 752, 789`) | Only proportional-by-default with Shift for free is new: a few lines in each. Existing shapes keep free resize unless we also want Shift there. |
| Snapping | `snapContext`/`snapBox` (`snap.ts:16, 143`) | Images snap to the board's centre, edges and other shapes. |
| Clip outline | `panelCtx(d, p, moving)` (`easy/guard.ts:27`): the outline with joint notches, slots, tabs and holes | The clip for the 3D mesh, the print piece and spread parts. |
| Packing | `pack`/`packOne` per material, the `sheetGroups` slot loop and per-group piece dragging in Plan2D (milestone 36) | Paper sheets need `packOne` exported and one more group appended in Plan2D. |
| Spreading | `foldXform(…, allowance = 0)` and `cornerFoldXform` (`pieces.ts:29, 67`, which needs an allowance parameter), `flatPanel(d, id, xf)` (`:277`) for overlap tests, `composeX`. The **`through.ts` pattern**: a shape stored on its source panel, with per-panel regions that `groupPieces` emits on other pieces (`pieces.ts:219`), and `ThroughEdit`, which edits that source from handles drawn on other panels. | Spreading copies an existing architecture instead of inventing one. Missing: an `invertX` helper. |
| Engrave export | svg.ts writes one engrave detail as one even-odd path, and writes open contours | Fill traces with holes export correctly with no change. |
| Quick build | The feature table, *More…* (`ModeOverride`), and mission goals (`missions.ts`, e.g. the `sticker` goal) | The Quick build split is table rows. An optional *Put a picture on it* goal is about five lines. |
| Construction panels | `isConstruction` (`model/place.ts:98`) | The "+" skips them. |

## 4. Spreading onto neighbouring walls

**What a neighbour is.** A panel that shares an edge with the image's board through a connection, one level out. That covers both side corners plus the base or the lid. A panel never gets the same image twice.

**Unfolding.**
- A grown child unfolds about the shared edge with `foldXform(parent, edge, 0)`.
- A tray corner unfolds with `cornerFoldXform`, with a new allowance parameter set to 0.
- A parent unfolds onto its child by the inverse.

Outer faces of joined panels are flush (`DECISIONS.md`), so an image on the outer face wraps exactly. On the inner face, the corner loses t of image width, and the card notes this. A neighbour whose unfolded `flatPanel` outline overlaps another one's drops out, and the card names it.

**Where it is stored.** As with through-cuts: the `BoardImage` (or the traced detail) stays on its host board, in the host's coordinates, and may extend past the host's outline when `spread` is set. Derived per panel, not stored:
- each panel's part = image rectangle ∩ that panel's `panelCtx` outline unfolded into host coordinates;
- mapped back into that panel's own coordinates.

Moving or resizing walls later re-cuts the parts.

**Prints and traces.**
- A spread print gives one print piece per panel it touches, each with its own 5 mm bleed.
- When the panels are in one folded net (card and corrugated, `netGroups`), they stay one print piece, matching the net.
- A spread trace is traced once in host coordinates. Its rings and lines are clipped per panel (`polygon-clipping` for fill, segment clipping for lines), and `groupPieces` emits them on each panel's piece, as through-cut regions are.

**Interaction.** In the cut plan, the selected image or trace shows its full rectangle, dashed past its board, with transform handles: move, corners proportional, Shift free, rotate. Toggling *Spread onto neighbours* (`image-spread`) draws the unfolded neighbours as faint outlines around the selected piece, and the handles can drag across them. With the toggle off, the image is clamped to its board. In 3D, the parts on the neighbours are drawn with the host's handles, as `ThroughEdit` does.

## 5. Milestones

Each is a day or two. Numbering continues after milestone 41 and its follow-up. Milestones 42 and 48 are smaller than in the first draft because of §3.

### Milestone 42: image mode and placing an image

- `imageMode` in the store, the labelled stage toggle (`toggle-images`), and Esc. `handlesOff` replaces the `!jointsOn` checks, with `SeamPills` hidden and early returns in `onPanelDown`/`onDetailDown`. Feature table: `images: 'show'`.
- The "+": a stage button at `pointerHit` (with `face` added), shown when the hit is on a face (`faceAt`) and not on the edge band. The face is highlighted with `FaceHover`, and construction panels are skipped. Click opens a file input. A drop on the stage uses `useRayFromScreen`.
- Import: `createImageBitmap`, downscale, hash, blob into IndexedDB (`assets` store, database version 2), then a `BoardImage` fitted inside the outline, selected and pending (✓).
- 3D: `ImageFace` (the `FaceHover` recipe with the `panelCtx` clip and a texture), with textures cached by hash.
- Handles: move with `snapBox`; corners from `ThroughCorner`, proportional by default and free with Shift; the ring from `Gizmo`.
- Card: *Print as is* / *Trace*, size in mm, *Replace image*, *Delete*.
- Tests:
  - unit: the fit inside an L-shaped outline, and the clip against a board with finger notches and a hole;
  - e2e: the toggle hides handles and pills, while other boards are still drawn and still selectable after leaving;
  - e2e: "+" on a face, not on an edge or a construction panel;
  - e2e: placing a fixture PNG, then ✓, then undo;
  - e2e: a corner drag keeps the aspect ratio, and a Shift drag does not;
  - e2e: the same placement in Quick build.

### Milestone 43: keeping images

- Autosave keeps hashes only, and blobs no `BoardImage` uses are removed on load.
- `serializeProject(d, { assets })` embeds base64 for *Save*, and opening a file restores the blobs. *Submit* sends no assets. A missing asset shows a placeholder with *Replace image*.
- Tests:
  - save and load round trip (fake-indexeddb);
  - a submitted project has no assets but keeps its traces, and passes the Worker's parser;
  - golden exports byte-identical;
  - a v8 file without images opens unchanged.

### Milestone 44: print pieces on paper sheets

- `printCopies(d)`: each `use: 'print'` image gives its clip outline grown by the 5 mm bleed, the trim line, and the image transform.
- They are packed with the exported `packOne` on the `PAPER` profile, and Plan2D appends the paper group. Its sheets draw the image (`<image>` + `clipPath`) and the trim line, and print pieces can be dragged like other pieces. *Prints* (A4 / A3) goes in the settings card.
- The print check warns when a print is larger than the printable A3 area, and when an image is missing.
- Tests:
  - unit: the bleed outline, packing on A4 versus A3 with rotation, and the warning at 288 mm;
  - unit: the sheet meter, piece count and `prepareExport` are unchanged by a print;
  - e2e: the paper sheet and its chip.

### Milestone 45: downloading prints

- *Download prints* in the export dialog. The image Worker renders each paper sheet at 300 dpi to JPEG and writes the JFIF density, and fflate zips several sheets. A new `downloadBlob` sits next to `downloadText`.
- Fallback when a canvas that large fails (iOS 17 and older: 16.7 M px; A3 at 300 dpi is 17.4 M): render in strips into a PDF (pdf-lib), or suggest A4.
- Tests:
  - unit: the JFIF density reads 300 × 300, and an A4 sheet is exactly 2480×3508 px;
  - e2e: a zip download with two JPGs.

### Milestone 46: threshold step and fill trace

- The image Worker lazy-loads `d3-contour`.
- Choosing *Trace* opens a `ConfirmBar` beside the board. It holds *Threshold* (starting at Otsu) and *Fill / Outline*, with *Smoothing*, *Ignore specks* and *Invert* behind *More…* in Quick build. The board shows the black-and-white preview, debounced, from the proxy.
- ✓ adds the engrave `path` detail with its `trace` params, hides the source image, and is one undo step. *Re-trace* on a traced detail reopens the bar with the stored params.
- 3D: merged line and hit geometry per traced detail.
- Quick build: the guard skips traced details, and the trace card replaces the op toggle for them.
- Tests:
  - unit: a black ring on white gives one ring with one hole, with the area right within 1%;
  - unit: the threshold changes the ring count as expected, specks are dropped, and the point cap is respected;
  - unit: mirroring on the far face, and the SVG has the engrave layer as one even-odd path;
  - e2e: apply and undo, in both modes.

### Milestone 47: outline trace: centerline and contour lines

- `path.lines` in the model, carried by `detailContours`, `groupPieces` (as `role: 'line'`), Plan2D and the shape handles. DXF writes open contours as `POLYLINE`.
- Outline styles:
  - *Centerline*: `skeleton-tracing-js`, then gaps joined, spurs dropped, simplified and smoothed.
  - *Contour lines*: the fill contours as score rings.
- Tests:
  - unit: a 6 px black "L" gives one polyline with one bend, within 1 px of the stroke's middle;
  - unit: a ring gives one closed loop;
  - unit: SVG and DXF write open paths on the score layer, and golden exports are unchanged;
  - e2e: a centerline trace in Quick build shows its trace card, not *Cut out*.

### Milestone 48: spreading onto neighbouring walls

- `neighbourUnfold(d, panelId)` from `foldXform`/`cornerFoldXform` with allowance 0, plus the inverse for the parent. `flatPanel` drops overlapping neighbours.
- `spreadParts(d, host, item)`, modelled on `through.ts`: per-panel parts for prints (`printCopies`), traces (`groupPieces`) and 3D (`ImageFace`).
- Plan2D: full-rectangle handles, the *Spread onto neighbours* toggle (`image-spread`), and faint unfolded neighbours while the item is selected. With the toggle off, the item is clamped. In 3D, parts on the neighbours carry the host's handles (`ThroughEdit` pattern).
- Tests:
  - unit, on a box: an image on the front wall spread across its left corner gives two parts that meet on the corner line, exact on the outer face and short by t on the inner face;
  - unit: a card net stays one print piece, and a spread trace's lines are split at the corner;
  - unit: changing the side wall's height re-cuts the parts;
  - e2e: the toggle and a handle drag across a corner, with both walls showing the image in 3D.

### Milestone 49: final verification

- `npm run typecheck`, `npm test`, `npm run build` and the full Playwright suite. Golden SVG/DXF exports are byte-identical for designs without images.
- Hebrew and English screenshots (`docs/image-shots/`), in Workshop and in Quick build: image mode with the "+", the threshold bar, a fill trace and a centerline trace, a paper sheet in the cut plan, and an image spread across a corner.
- Bundle check: the image Worker and its libraries are separate lazy chunks.
- `THIRD_PARTY.md` lists d3-contour (ISC), skeleton-tracing-js (MIT), fflate (MIT) and, if used, @cantoo/pdf-lib (MIT).
