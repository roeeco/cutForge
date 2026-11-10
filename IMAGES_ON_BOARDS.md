# CutForge: images on boards: brief

Planning notes from 2026-11-10, written after milestones 21–24 and the follow-up. The feature puts a picture on a board, then either **prints it** on paper (A4/A3, glued on) or **traces it** into engrave or score lines on the board itself. Built on `claude/image-board-wall-planning-1kdgu9`. The decisions in §2 come from the interview of 2026-11-10.

## 1. What changes for a student

- **Image mode.** A new stage toggle, *Images*, next to *Show joints*. While it is on, joint pills and every handle (grow, hinge, gizmos, dimensions) are hidden, and boards only answer to the pointer for images. Boards stay fully visible, with no dimming. Esc or the toggle leaves the mode.
- **A "+" on the board under the pointer.** Hovering a board face shows a "+" at the pointer. Clicking it, or dropping a file on the face, opens a file picker. The image lands centred on that face, as large as fits inside the board's outline.
- **Scale and place.** Corner handles scale proportionally, and with **Shift** held they scale freely. Dragging moves the image and the ring turns it. The image is clipped to the board's outline and holes.
- **One use per image**, chosen in its card:
  - **Print as is**: the clipped image, with a 5 mm bleed, becomes a *print piece* on **paper sheets** (A4 or A3) after the material sheets in the cut plan. *Download prints* gives 300 dpi JPGs at true size. A print too large for A3 is flagged.
  - **Trace**: first a **black-and-white threshold** step, with a live preview on the board. A slider simplifies the image before anything is traced. Then one of two kinds:
    - **Fill**: contours of the black areas, engraved.
    - **Outline**: centerline single strokes, scored, or contour lines around the areas.

    *Apply* adds the result to the same board, so it shows on that board in the cut plan and exports in the existing layers.
- **Across neighbouring walls.** In the cut plan, a selected image or trace has an optional toggle, *Spread onto neighbours*. When it is on, the neighbouring walls appear unfolded around the board as faint outlines, and the transform handles can stretch the image or trace across them. In 3D the image wraps around the corners. Each wall gets its own part: its own print piece, or its own traced shapes.

## 2. Decisions

### From the interview (2026-11-10)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Uses | **Print or trace, never both.** One image, one use. |
| 2 | Prints larger than A3 | **Warn.** The export check flags a print larger than the printable A3 area (287 × 410 mm with 5 mm margins, bleed included). There is no tiling. |
| 3 | Bleed | **5 mm** past the board's outline. A thin grey trim line marks the true outline. |
| 4 | Server | **Only traces reach the server.** They are vector shapes inside `project.json`. Image files (printed images and trace sources) are never uploaded: a submission strips the `assets` field. The teacher's app shows a print as a grey placeholder piece on its paper sheet. Laser files are unaffected, because prints never reach them. |
| 5 | Trace kinds | **Fill = contours** (closed areas with holes, engrave layer). **Outline = centerline** single strokes (open lines, score layer), with *Contour lines* as a second outline style. Before either, a **threshold** step turns the image into black and white with an adjustable slider, plus *Ignore specks* and *Invert*, to simplify it. |
| 6 | Colour | **Black and white only.** No posterize or grey levels. |
| 7 | Image mode | **Pills and handles hidden**, other boards neither dimmed nor hidden. |
| 8 | Spreading | **An optional toggle in the cut plan**: an image or trace can be stretched with the transform handles across neighbouring walls (§3, milestone 34). |

### Proposed (from the code and the research)

| Topic | Proposal |
| --- | --- |
| The mode | **A view state, `imageMode`, not a design field.** Like `editOutline`, it makes panels `inert` to normal tools and gates `PanelWidgets`, `HingeWidget`, gizmos, `SeamPills` and dimensions. *Show joints* today only shows or hides pills, so `editOutline` is the pattern to copy. |
| Which face | **The hovered face**, taken from the hit's depth into the slab, as the *Divider between* Shift-click does (`side` −1 = plane face, the outer face of grown walls; 1 = far face). Hits on the edge band show no "+". |
| Model | **A new detail kind**: `shape: 'image'`, with `image: { asset, face, use: 'print' \| 'trace', spread?: boolean }`. It reuses selection, move, rotate, snapping and the card. `groupPieces` skips it for material sheets. |
| Traced result | **An ordinary `path` detail**: `op: 'engrave'` for fill, `'score'` for outline, plus `trace: { asset, params }` so *Re-trace* works on the student's own device. The source image detail is kept, hidden, on the board. |
| Open lines | **`path.lines?: P2[][]`** next to `path.polys`, for centerline strokes in the same unit box. SVG and DXF already write open contours (`Contour.closed`). `groupPieces` emits them as `role: 'line'`, and `detailContours` and the shape handles learn to carry them. |
| Image storage | **Blobs in IndexedDB, not in the design.** A new `assets` object store, keyed by the SHA-256 hash. The design keeps `assets?: Record<hash, { w, h, mime, name }>`, so autosave and undo snapshots stay small. |
| Import size | **Downscale on import** to what 300 dpi needs at the largest size the image can take, capped at 4000 px, then re-encode as JPEG 0.9. PNGs with transparency stay PNG: transparent areas are neither printed nor traced. EXIF orientation comes from `createImageBitmap`. |
| Project file | **Images are embedded in the `.cutforge.json`** as base64 under the optional `assets` field. Opening the file restores them to IndexedDB. There is no schema bump, and golden exports stay byte-identical. Submissions remove the field (decision 4). |
| 3D look | **A textured mesh of (board outline ∩ image rectangle)**, made with `polygon-clipping` (already a dependency) and `ShapeGeometry`. UVs map the image rectangle, and the mesh sits 0.15 mm off the chosen face. The same clip, grown by the bleed, gives the print piece. |
| Paper sheets | **A separate pack pass**: `pack()` with a paper-sized synthetic design, as `batch.ts` does. Settings: `print?: { paper: 'A4' \| 'A3' }`, with 5 mm printer margins and automatic orientation. They are drawn after the material sheets in `Plan2D`, with the chip *Paper n · A4*. Prints are never mirrored. |
| JPG export | **Rendered in a Worker** on an `OffscreenCanvas` at 300 dpi (A4 2480×3508 px, A3 3508×4961 px), then `convertToBlob('image/jpeg', 0.92)`. A small helper of our own sets 300 dpi in the JFIF header. Several sheets download as one zip made with **fflate**. |
| Threshold step | **Our own preprocessing in the trace Worker** on a ~1000 px proxy for the preview: grayscale, blur (*Smoothing*), threshold (starting at Otsu; slider), invert, and an area-based speck filter. *Apply* repeats it on the full image. |
| Fill trace | **`d3-contour`** (ISC) on the black-and-white image gives polygons with holes. Specks are dropped by area, then simplified with the Douglas–Peucker already in `svgImport.ts`/`adapt.ts`. Chaikin smoothing is optional. |
| Centerline trace | **`skeleton-tracing-js`** (MIT, LingDong) on the black-and-white image gives polylines. They are joined end to end where gaps are under 1 px, short spurs (under the *Ignore specks* length) are dropped, then simplified and smoothed. A stroke-width note says the laser draws a single line. |
| Mirroring | If the image is on the face that lies down in the cut plan (the plan views each panel from +u×v), the trace is **mirrored**, so it reads correctly on the finished board. The card says so. |
| Point budget | **Simplify until the trace is under 20 000 points.** A note says when detail was lost. |

### Libraries (licences checked 2026-11-10)

| Need | Use | Not used, and why |
| --- | --- | --- |
| Fill contours | **d3-contour** (ISC, ~38 kB) | potrace and all its ports (GPL-2, against `THIRD_PARTY.md`). autotrace (GPL). The npm `marchingsquares` packages (AGPL). opencv.js (~10 MB). |
| Centerline | **skeleton-tracing-js** (MIT, 1.0.4) | autotrace's centerline mode (GPL) |
| Zip | **fflate** (MIT) | JSZip (MIT/GPL-3 dual licence, heavier) |
| PDF fallback | **@cantoo/pdf-lib** (MIT, a maintained pdf-lib fork), only if the large-canvas fallback is needed (milestone 31) | jsPDF (larger) |
| HEIC photos | **None.** Safari decodes HEIC natively; elsewhere the student is asked for JPG or PNG. | `heic-to` and `libheif-js` (LGPL-3) |
| Later, for quality | VTracer (MIT/Apache-2.0), built with `wasm-pack --target web` | – |

New dependencies load lazily with `import()` inside Workers, which starts the code splitting `PROGRESS.md` asks for. Each one is recorded in `THIRD_PARTY.md`.

## 3. Spreading onto neighbouring walls

**What a neighbour is.** A panel that shares an edge with the image's board through a connection (fold, finger, tab-and-slot, butt or glue). Only direct neighbours count, one level out. That covers wrapping around both side corners of a wall and onto the base or the lid. A panel never gets the same image twice.

**Unfolding.** Each neighbour is unfolded about the shared edge into the board's plane, with the same rigid unfold and mirroring as folded nets (`foldXform` in `pieces.ts`), but without the fold allowance:
- Outer faces of joined panels are flush (`DECISIONS.md`), so an image on the outer face wraps exactly.
- On the inner face, the corner loses t of image width; the card notes this.
- Neighbours whose unfolded outline would overlap another unfolded neighbour drop out of the spread, and the card names them.

**Where it is stored.** The image detail stays on its host board, in the host's coordinates, and may now extend past the host's outline. Its `spread: true` marks it. Derived per panel, not stored:
- the part on each panel = image rectangle ∩ (that panel's outline in host coordinates);
- mapped back into that panel's own coordinates.

So moving or resizing the walls later keeps the image in place on the host and re-cuts the parts.

**Prints and traces.**
- A spread print gives one print piece per panel it touches, each with its own 5 mm bleed.
- When the panels are in one folded net (card and corrugated), they stay one print piece, matching the net's outline.
- A spread trace is traced once in host coordinates. Its rings and lines are clipped per panel, with `polygon-clipping` for fill and segment clipping for lines, and emitted on each panel's contours.
- Each part keeps a `ref` to the host detail, so clicking it in the plan selects the image.

**Interaction in the cut plan.**
- Selecting an image or trace shows its full rectangle, dashed past its board, with transform handles: move, corners proportional, Shift free, rotate.
- Toggling *Spread onto neighbours* (`image-spread`) draws the unfolded neighbours as faint outlines attached to the selected piece while it stays selected. The handles can then drag across them.
- With spreading off, the image is clamped to its board, as on the stage.
- The 3D stage shows the wrapped result on every touched panel.

## 4. Milestones

Each is a day or two. Numbering continues after the planned 25–27.

### Milestone 28: image mode and placing an image

- `imageMode` in the store (outside history), a stage toggle (`toggle-images`) and Esc to leave. Overlays are gated where `editOutline` already gates them, and the hint is `image.hint`.
- `FaceAdd` widget: a screen-sized DOM "+" (`StageHtml`, `pointerEvents` on) following the pointer on the hovered face (`side` ±1), hidden on edge-band hits. Click opens a file input; drop works too.
- Import: `createImageBitmap`, downscale, hash, blob into IndexedDB (an `assets` store in `persist.ts`), then an `image` detail fitted inside the outline.
- 3D: a textured clipped mesh per image detail, with a texture cache keyed by hash.
- Handles in image mode: drag moves, corners scale proportionally, **Shift** scales freely, the ring turns. Each gesture is `preview`/`commit` and one undo step.
- Card: *Print as is* / *Trace*, size in mm, *Replace image*, *Delete*.
- Tests: unit tests for the fit inside an L-shaped outline and the clip polygon; e2e tests for the toggle hiding pills and handles (other boards still drawn), "+" on a face but not on an edge, placing a fixture PNG, a corner drag keeping the aspect ratio, a Shift drag not keeping it, and undo.

### Milestone 29: keeping images

- Autosave references hashes only. The design's `assets` map lists them, and unused blobs are removed on load.
- Saving a project embeds the used assets as base64, and opening restores them. A missing asset shows a placeholder with *Replace image*.
- Submissions strip `assets` (decision 4). The Worker's 2 MB limit is unchanged. The teacher's app draws print pieces as placeholders.
- Tests: save and load round trip (fake-indexeddb); a submitted project has no `assets` but keeps its traces; golden exports without images byte-identical; an old v7 file opens unchanged.

### Milestone 30: print pieces on paper sheets

- `printPieces(d)`: each `use: 'print'` image gives its clipped outline grown by the 5 mm bleed, the trim line, and the image transform.
- `packPrints(d)` reuses `pack()` with the paper size. *Prints* (A4 / A3) goes in the settings card.
- Plan2D draws paper sheets after material sheets: images (`<image>` with a `clipPath`) and trim lines. Prints can be moved, with placements kept per key.
- Validation: a warning for a print larger than the printable A3 area (decision 2), and one for a missing image.
- Tests: unit tests for the bleed outline, packing on A4 versus A3 and automatic rotation, and the A3 warning at 288 mm; e2e for the paper sheet and its chip.

### Milestone 31: downloading prints

- *Download prints* in the export dialog. A Worker renders each paper sheet at 300 dpi to JPEG, sets 300 dpi in the JFIF header, and zips several sheets (fflate). `downloadBlob` sits next to `downloadText`.
- Fallback when a canvas that large fails (iOS 17 and older: 16.7 M px; A3 at 300 dpi is 17.4 M): render in strips into a PDF (pdf-lib), or suggest A4.
- Tests: unit tests that the JFIF density reads 300 × 300 and the size is exactly 2480×3508 for A4; an e2e download of a zip with two JPGs.

### Milestone 32: threshold step and fill trace

- A trace Worker that lazy-loads `d3-contour`.
- Card, step 1 (*Black and white*):
  - *Threshold* (starts at Otsu), *Smoothing*, *Ignore specks* and *Invert*.
  - A live black-and-white preview on the board, debounced, from the proxy.
- Card, step 2 (*Fill*): contours, speck filter, simplify, optional Chaikin, and mirroring for the down face.
- *Apply* adds the engrave `path` detail with its `trace` params and hides the source. *Re-trace* reopens the steps with the stored params.
- Tests:
  - unit, on a synthetic image: a black ring on white gives one ring with one hole, with the right area within 1%;
  - unit: the threshold slider changes the ring count as expected, specks are dropped, and the point cap is respected;
  - unit: mirroring on the far face, and the export carries the trace on the engrave layer as one even-odd path;
  - e2e: apply and undo.

### Milestone 33: outline trace: centerline and contour lines

- `path.lines` (open polylines) in the model, carried by `detailContours`, `groupPieces` (as `role: 'line'`), Plan2D, the shape handles and validation.
- Outline styles:
  - *Centerline*: `skeleton-tracing-js` in the Worker, then join gaps, drop spurs, simplify and smooth.
  - *Contour lines*: the fill contours as score rings.
- Both go on the score layer.
- Tests:
  - unit: a 6 px wide black stroke "L" gives one polyline with one bend, within 1 px of the stroke's middle;
  - unit: a ring gives one closed loop, and spurs under the speck length are dropped;
  - unit: SVG and DXF write open paths on the score layer, and golden exports are unchanged;
  - e2e: centerline apply.

### Milestone 34: spreading onto neighbouring walls

- `neighbourUnfold(d, panelId)`: direct neighbours unfolded into the host's plane, with overlapping ones dropped and named.
- `spreadParts(d, detail)`: the image rectangle (prints) or traced rings and lines (traces), clipped per panel and mapped into each panel's coordinates. Used by the 3D view, `printPieces` and `groupPieces`.
- Plan2D: the full-rectangle handles for a selected image or trace, the *Spread onto neighbours* toggle (`image-spread`), and faint unfolded neighbours while it is selected. With the toggle off, the image is clamped to its board.
- Tests:
  - unit, on a box: an image on the front wall spread across its left corner gives two parts whose edges meet on the shared corner line, exact on the outer face and short by t on the inner face;
  - unit: a card net keeps one print piece, and a spread trace's lines are split at the corner;
  - unit: moving the side wall's height re-cuts the parts;
  - e2e: a toggle and a handle drag across a corner, with both walls showing the image in 3D.
