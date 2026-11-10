# CutForge: images on boards: brief (draft)

Planning notes from 2026-11-10, written after milestones 21–24 and the follow-up, for a new feature: putting a picture on a board, then either **printing it** on paper (A4/A3, glued on) or **tracing it** into engrave or score lines on the board itself. Built on `claude/image-board-wall-planning-1kdgu9`. **Draft:** the open questions in §2 still need answers before milestone 28 starts.

## 1. What changes for a student

- **Image mode.** A new stage toggle (*Images*, next to *Show joints*) turns on a focused mode: joints, grow handles, gizmos, dimensions and hints are hidden, and boards only answer to the pointer for images. Esc or the toggle leaves the mode.
- **A "+" on the board under the pointer.** Hovering a board face shows a "+" button at the pointer. Clicking it (or dropping a file on the face) opens a file picker. The image lands centred on that face, as large as fits inside the board's outline.
- **Scale and place.** Corner handles scale proportionally. With **Shift** held they scale freely (unproportional). Dragging the image moves it, and the ring turns it, as for other shapes. The image is always clipped to the board's outline and its holes, on the stage and in the cut plan.
- **Two ways to use it**, chosen in the image's card:
  - **Print as is**: the clipped image becomes a *print piece*, laid out on **paper sheets** (A4 or A3) after the material sheets in the cut plan. *Download prints* gives 300 dpi JPGs, one per paper sheet, at true size.
  - **Trace**: *Fill* (engrave areas) or *Outline* (score lines around areas), with threshold, smoothing and "ignore specks" sliders and a live preview on the board. Applying the trace adds it to the same board as an engrave or score shape, so it shows on that board in the cut plan and exports in the existing layers.

## 2. Decisions

### Proposed (from the code and the research)

| Topic | Proposal |
| --- | --- |
| The mode | **A view state, `imageMode`, not a design field.** Like `editOutline`, it makes panels `inert` to normal tools and hides `PanelWidgets`, `HingeWidget`, gizmos, `SeamPills` and dimensions. Note: *Show joints* today only shows or hides joint pills, so `editOutline` is the better pattern to copy. |
| Which face | **The hovered face.** The face comes from the hit's depth into the slab, as the *Divider between* Shift-click already does (`side` −1 = plane face, which is the outer face of grown walls; 1 = far face). Hits on the edge band show no "+". |
| Model | **A new detail kind**: `shape: 'image'`, with `image: { asset, face, use: 'print' \| 'trace' }`. It reuses selection, move, rotate, snapping and the card. It is skipped by `groupPieces` for material sheets, so it never reaches the laser files. |
| Traced result | **An ordinary `path` detail** (`op: 'engrave'` for fill, `'score'` for outline), plus `trace: { asset, params }` so it can be re-traced later. The source image detail is kept hidden on the board. Export, packing and validation need no change. |
| Image storage | **Blobs in IndexedDB, not in the design.** A new `assets` object store, keyed by the SHA-256 hash. The design keeps `assets?: Record<hash, { w, h, mime, name }>`. Autosave and undo snapshots then stay small. |
| Import size | **Downscale on import** to what 300 dpi needs at the largest size the image can take on its board (the board's longer side), capped at 4000 px, then re-encode as JPEG 0.9. PNGs with transparency stay PNG (transparent areas are not printed and do not trace). EXIF orientation comes from `createImageBitmap`. |
| Project file | **Images embedded in the `.cutforge.json`** as base64 under an optional `assets` field when saving. Opening a project puts them back into IndexedDB. No schema bump: like `joints?`, the field is optional and golden exports stay byte-identical. |
| 3D look | **A textured mesh of (board outline ∩ image rectangle)**, made with `polygon-clipping` (already a dependency) and triangulated by `ShapeGeometry`. UVs map the image rectangle, and the mesh sits 0.15 mm off the chosen face, like details. The same clip gives the print piece's outline. |
| Paper sheets | **A separate pack pass** with `pack()` and a paper-sized synthetic design (as `batch.ts` already does). Settings: `print?: { paper: 'A4' \| 'A3', margin: 5 }` with automatic orientation. They are drawn after the material sheets in `Plan2D`, with the chip *Paper n · A4*. Print pieces are never mirrored. |
| Print piece content | **The clipped image, plus a thin grey trim line** along the clip outline so it can be cut out with scissors. There is no bleed (see Q3). |
| JPG export | **Each paper sheet is rendered on an `OffscreenCanvas` in a Worker** at 300 dpi (A4 2480×3508 px, A3 3508×4961 px), using `convertToBlob('image/jpeg', 0.92)`. A ~20-line helper of our own writes 300 dpi into the JFIF header (`changedpi` corrupts files without an APP0 segment). Several sheets download as one zip made with **fflate** (stored, not compressed). |
| Trace engine | **Our own preprocessing plus `d3-contour`** (ISC, ~38 kB, no wasm). Preprocessing runs on `ImageData` in a Worker: grayscale, blur, threshold (Otsu by default) and invert. `d3-contour` turns the result into polygons with holes. Specks are dropped by area, and outlines are simplified with the Douglas–Peucker already in `svgImport.ts`/`adapt.ts`. Chaikin smoothing is optional. The live preview traces a ~1000 px proxy and *Apply* traces the full image. |
| Trace placement | **Traced rings in the detail's unit box**, then `addPathShape`, the same entry the SVG import uses. If the image is on the face that lies down in the cut plan (the plan views each panel from +u×v), the trace is **mirrored**, so it reads correctly on the finished board, and the card says so. |
| Point budget | **Simplify until the trace is under a cap** (e.g. 20 000 points per trace, the same idea as the SVG import's 4000). A note says when detail was lost. |

### Libraries considered (licences checked 2026-11-10)

| Need | Use | Not used, and why |
| --- | --- | --- |
| Contours / fill trace | **d3-contour** (ISC) | **potrace and all its ports** (GPL-2, against `THIRD_PARTY.md`). **autotrace** (GPL). The npm `marchingsquares` packages (AGPL). **opencv.js** (Apache-2.0, but ~10 MB). |
| Better-quality or colour trace (later) | **VTracer** (MIT/Apache-2.0), built ourselves with `wasm-pack --target web`, because the npm build targets Node | **imagetracerjs** (Unlicense) and `@image-tracer-ts/core` (MIT) work, but are slower and lower quality than VTracer. |
| Centerline (single-stroke lines, later) | **skeleton-tracing-js** (MIT, LingDong), then simplify | – |
| Zip | **fflate** (MIT) | JSZip (MIT/GPL-3 dual licence, heavier) |
| PDF (optional, later) | **@cantoo/pdf-lib** (MIT, a maintained fork of pdf-lib). It embeds JPGs without re-encoding and keeps true size. | jsPDF (MIT, larger) |
| HEIC photos | **None.** Safari decodes HEIC natively; elsewhere the student is asked for a JPG or PNG | `heic-to` and `libheif-js` are LGPL-3. |

Every new dependency is lazy-loaded with `import()` inside the Worker, which also starts the code splitting `PROGRESS.md` asks for. Each one is recorded in `THIRD_PARTY.md`.

### Open questions (please decide)

1. **Print and trace on the same image?** Proposal: an image has one use. *Duplicate* makes a second copy for the other use.
2. **A print piece larger than the printable A3 area** (287 × 410 mm): (a) the export check flags it and A4/A3 cannot print it, or (b) it is **tiled** across sheets with a 10 mm overlap and alignment marks. Proposal: (a) in milestone 30, (b) as a later milestone.
3. **Bleed**: should the printed image extend 2 mm past the board's outline (easier to glue on without a white edge), or stop exactly at the outline? Proposal: 2 mm bleed, with the trim line on the true outline.
4. **Classroom submissions**: should the teacher get the prints? If so, images have to reach the server. The project's 2 MB limit is too small for them, so they would go to R2 as separate files next to `project.json` (a new upload step and a list in the submission). Proposal: yes, in milestone 31. Alternatively, only students download prints.
5. **"Outline" trace**: (a) **contour lines** around each filled area (closed rings, score layer), or (b) **centerline** single strokes for line art (open lines, which the model cannot hold yet). Proposal: (a) now and (b) later.
6. **Colour images and photos**: is one threshold (black and white) enough to start? Or do we want *posterize* (2–4 grey levels, as nested engrave areas for different laser power) from the start? Proposal: black and white first, posterize in milestone 33.
7. **Hide or dim** the rest of the stage in image mode: should other boards stay fully visible (only widgets hidden), or be dimmed so the target board stands out? Proposal: keep boards visible and hide every widget and pill.

## 3. Milestones

Each is a day or two. Numbering continues after the planned 25–27.

### Milestone 28: image mode and placing an image

- `imageMode` in the store (outside history), a stage toggle (`toggle-images`) and Esc to leave. Overlays are gated where `editOutline` already gates them, and the hint is `image.hint`.
- `FaceAdd` widget: a screen-sized DOM "+" (`StageHtml`, `pointerEvents` on) that follows the pointer on the hovered face (`side` ±1), hidden on edge-band hits. Click → file input. Drop works too.
- Import: `createImageBitmap`, downscale, hash, store the blob in IndexedDB (`assets` store in `persist.ts`), and add the `image` detail fitted inside the outline's bounding box, then shrunk until it is inside the outline.
- 3D: textured clipped mesh per image detail, using the texture cache keyed by hash.
- Handles in image mode: drag to move, corners scale proportionally, **Shift** scales freely, the ring turns. Transactions use `preview`/`commit`, and one undo step per gesture.
- Card: *Print as is* / *Trace*, size in mm, *Replace image*, *Delete*.
- Tests: unit tests for the fit inside an L-shaped outline and the clip polygon; e2e tests for the toggle hiding pills and handles, "+" on a face but not on an edge, placing from a fixture PNG, a corner drag keeping the aspect ratio, a Shift drag not keeping it, and undo.

### Milestone 29: keeping images

- Autosave references hashes only. The design's `assets` map lists them, and unused blobs are cleaned up on load.
- Saving a project embeds the used assets as base64, and opening one restores them. A missing asset shows a placeholder with *Replace image*.
- Tests: save and load round trip (fake-indexeddb), golden exports of designs without images byte-identical, an old v7 file opening unchanged.

### Milestone 30: print pieces on paper sheets

- `printPieces(d)`: each `use: 'print'` image becomes its clipped outline plus the image transform (and bleed, Q3).
- `packPrints(d)` reuses `pack()` with the paper size and margin. Paper settings go in the settings card under *Prints* (A4 / A3).
- Plan2D draws paper sheets after material sheets, with the images drawn (`<image>` with a `clipPath`) and the trim line. Prints can be selected and moved as other pieces can, with placements kept per key.
- Validation: a print larger than the printable area (Q2), and a print with no image data.
- Tests: unit tests for packing on A4 versus A3 and automatic rotation; e2e for a paper sheet appearing with its chip.

### Milestone 31: downloading prints

- *Download prints* in the export dialog: a Worker renders each paper sheet at 300 dpi to JPEG, the JFIF density helper sets 300 dpi, and more than one sheet downloads as a zip (fflate). A `downloadBlob` sits next to `downloadText`.
- Fallback when a canvas that large fails (iOS 17 and older allows 16.7 M px; A3 at 300 dpi is 17.4 M): render in strips and offer a PDF (pdf-lib), or tell the student to use A4.
- If Q4 is yes: submissions upload the image assets to R2, and the teacher's app can download prints.
- Tests: unit tests that the JFIF density reads 300 × 300 and the pixel size is exactly 2480×3508 for A4; an e2e download of a zip containing two JPGs.

### Milestone 32: tracing (fill and outline)

- A trace Worker that lazy-loads `d3-contour`. Steps: preprocess (grayscale, blur, Otsu threshold or a slider, invert), contours, drop specks below an area, simplify (tolerance from a *Smoothing* slider), optional Chaikin, and mirror for the down face.
- Card: *Fill* / *Outline*, *Threshold*, *Smoothing*, *Ignore specks*, *Invert*. The live preview on the board traces the proxy, debounced. *Apply* adds the `path` detail (engrave or score) with `trace` params and hides the source image.
- *Re-trace* on a traced shape reopens the sliders with its stored params.
- Tests: unit tests on a synthetic image (a black ring on white gives one ring with one hole, the right area within 1%, specks dropped, the point cap respected), mirroring for the far face, and the export carrying the trace on the engrave layer; an e2e test for apply and undo.

### Milestone 33 (later): richer tracing and prints

- Posterize (Q6) into nested engrave levels; centerline tracing with skeleton-tracing (Q5), which needs open polylines in `path`; tiling large prints (Q2); and VTracer for colour images.
