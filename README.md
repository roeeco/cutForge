# CutForge

A browser tool for high-school students to design laser-cut organisers and game parts from flat panels, edited directly in a 3D workspace and a 2D cut plan, and exported as true-size SVG/DXF for LightBurn.

Status: **Milestones 1 (vertical slice) and 2 (connections and angles) complete.** See `PROGRESS.md` for what works and what is still to come; the full brief is in `laser-fabrication-editor-agent-prompt.md`.

## Run locally

```bash
npm ci
npm run dev          # http://localhost:5199
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
```

The editor, autosave and downloads work with no backend and no network after the page has loaded.

## Tests

```bash
npm test             # Vitest: geometry, joints, export writers, history, project files, i18n coverage
npm run e2e          # Playwright: full vertical slice + offline check (starts the dev server)
```

- Export tests also run an **independent reader check** with Python (`ezdxf` for DXF, `svgpathtools` for SVG) when available: `pip install ezdxf svgpathtools`. Without them that one test is skipped.
- Playwright uses software WebGL (SwiftShader). If your Playwright browsers are installed somewhere non-standard, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Using it

1. Choose a material (and the interface language: English / עברית).
2. **Panel** tool: drag on the floor grid to draw a flat panel. Set exact sizes in the inspector.
3. Click an edge (or use *Grow from …* in the inspector), then **Grow panel**: a ghost shows the new panel and which side the material lies on. Pick the angle (90°, 60°, 45°, 30°, 15°), *Up/Down*, and the connection: plywood offers finger joints and tabs and slots at 90°; card and corrugated offer folds, glue flaps and tabs and slots. An angled plywood panel needs side walls (*Add side walls*).
   - Where panels meet without a connection (e.g. two walls at a corner), the inspector lists them under *Meeting panels* with a **Connect** button.
   - *Add a divider* on a panel with walls; crossing dividers get half-laps automatically. *Clear inside sizes* shows the compartments.
4. **Rectangle / Rounded rectangle / Circle**: drag on a panel in 3D, or on a piece in the cut plan. Choose cut-through, engrave or score.
5. Switch between **3D workspace** and **Cut plan** at any time: both show the same panels; edits in either appear in the other.
6. **Download for laser** (SVG or DXF) and **Save project** (JSON). Work is also autosaved in the browser.

Keyboard: `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), `Delete`, `Esc` (cancel a drag / leave a tool / clear selection), arrow keys nudge the selected shape 1 mm (`Shift` = 10 mm), `O` toggles perspective/orthographic.

## LightBurn

Files open at true size: SVG `width`/`height` are in `mm` with a matching `viewBox`; DXF is R12 in millimetres (`$INSUNITS` = 4). Circles and arcs stay circles and arcs (SVG `A` commands; DXF `CIRCLE` and bulged closed `POLYLINE`s).

Each operation uses a different colour from LightBurn's default palette so it lands on its own layer on import:

| Operation | SVG colour | DXF layer / ACI colour | LightBurn layer |
| --- | --- | --- | --- |
| Cut | `#FF0000` red | `CUT` / 1 (red) | C02 |
| Score | `#0000FF` blue | `SCORE` / 5 (blue) | C01 |
| Engrave | `#000000` black | `ENGRAVE` / 7 (black/white) | C00 |
| Guide (labels, later) | `#00E000` green | `GUIDE` / 3 (green) | C03 — set Output off |

The mapping follows LightBurn's documented default palette; it has not yet been checked by importing into a LightBurn installation (no LightBurn in the build environment). Please confirm on the classroom machine.

**Kerf.** Exports are **Nominal**: every shape is at its exact design size, and the file name says so (`…-nominal-kerf0.15mm.svg`). Set the kerf offset per layer in LightBurn (Cut layer → *Kerf offset*). Starting points: plywood 3 mm ≈ 0.15 mm, corrugated ≈ 0.2–0.25 mm, card ≈ 0.1 mm — measure with a test cut. A *Compensated* export mode is planned for milestone 4.

## Data stored

Milestone 1 stores data only in the student's browser (IndexedDB key `cutforge/kv/current-design`, plus the language and hint preference in `localStorage`). Nothing is sent to a server. Class submission (milestone 6) will document its server-side storage here.

## Cloudflare deployment

The app is static: `npm run build` and deploy `dist/` (e.g. Cloudflare Pages, or a Worker with static assets). The Worker API, D1 and R2 parts arrive with milestone 6.
