# CutForge

A browser tool for high-school students to design laser-cut organisers and game parts from flat panels, edited directly in a 3D workspace and a 2D cut plan, and exported as true-size SVG/DXF for LightBurn.

Status: **Milestones 1–6 complete** (vertical slice, connections and angles, editing tools, text/import/packing/validation/kerf, templates, class submission and teacher view). See `PROGRESS.md` for what was verified and the remaining limitations. See `PROGRESS.md` for what works and what is still to come; the full brief is in `laser-fabrication-editor-agent-prompt.md`.

## Run locally

```bash
npm ci
npm run dev          # http://localhost:5199
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
```

The editor, autosave and downloads work with no backend and no network after the page has loaded.

To try class submission and the teacher view locally, run the Worker next to the dev server (Vite proxies `/api` to it):

```bash
printf 'TEACHER_KEY="choose-a-key"\nSESSION_SECRET="a-long-random-string"\n' > .dev.vars   # once
npm run dev:worker   # http://localhost:8787 (local D1 + R2 in .wrangler/)
npm run dev          # http://localhost:5199 — teacher view at /#/teacher
```

## Tests

```bash
npm test             # Vitest: geometry, joints, export writers, history, project files, i18n coverage
npm run e2e          # Playwright: full vertical slice + offline check (starts the dev server)
```

- Export tests also run an **independent reader check** with Python (`ezdxf` for DXF, `svgpathtools` for SVG) when available: `pip install ezdxf svgpathtools`. Without them that one test is skipped.
- The Playwright run also starts the real Worker (`wrangler dev`, local D1/R2 in `.wrangler/e2e`) for the class-submission tests.
- Playwright uses software WebGL (SwiftShader). If your Playwright browsers are installed somewhere non-standard, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Using it

1. Choose how to start (blank, *Organiser with dividers* or *Card / tile stand*), then a material (and the interface language: English / עברית). Template sizes are changed in the inspector when nothing is selected.
2. **Panel** tool: drag on the floor grid to draw a flat panel. Set exact sizes in the inspector.
3. Click an edge (or use *Grow from …* in the inspector), then **Grow panel**: a ghost shows the new panel and which side the material lies on. Pick the angle (90°, 60°, 45°, 30°, 15°), *Up/Down*, and the connection: plywood offers finger joints and tabs and slots at 90°; card and corrugated offer folds, glue flaps and tabs and slots. An angled plywood panel needs side walls (*Add side walls*).
   - Where panels meet without a connection (e.g. two walls at a corner), the inspector lists them under *Meeting panels* with a **Connect** button.
   - *Add a divider* on a panel with walls; crossing dividers get half-laps automatically. *Clear inside sizes* shows the compartments.
4. **Rectangle / Rounded rectangle / Circle**: drag on a panel in 3D, or on a piece in the cut plan. Choose cut-through, engrave or score.
5. Switch between **3D workspace** and **Cut plan** at any time: both show the same panels; edits in either appear in the other.
6. **Download for laser** (SVG or DXF) and **Save project** (JSON). Work is also autosaved in the browser.

7. **Editing tools:** double-click a panel for a face-on *solo* view. Shift/Ctrl-click or drag a box to select several shapes, then move, resize, align, distribute or duplicate them. Turn a shape into a live row/grid array (and *Explode* it later). Shapes snap to panel and shape edges, centres and equal spacing (hold `Alt` to drag freely).

8. **Text and icons:** the *Text* tool places Hebrew or English text (edit it in the inspector; it is exported as outlines). *Import SVG* puts a simple icon on the selected panel. Set *Copies to cut* per piece; drag pieces on the cut plan to place them by hand; *Repack* to start over.

Keyboard: `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), `Delete`, `Ctrl+D` duplicate, `Esc` (cancel a drag / leave a tool / clear selection / leave solo view), arrow keys nudge the selected shapes 1 mm (`Shift` = 10 mm), `O` toggles perspective/orthographic.

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

**Kerf.** The default export is **Nominal**: every shape is at its exact design size, and the file name says so (`…-nominal-kerf0.15mm.svg`). Set the kerf offset per layer in LightBurn (Cut layer → *Kerf offset*). Starting points: plywood 3 mm ≈ 0.15 mm, corrugated ≈ 0.2–0.25 mm, card ≈ 0.1 mm — measure with a test cut. **Compensated** export instead grows outlines and shrinks holes by half the kerf in the file (`…-compensated-kerf0.15mm.svg`); then set LightBurn's kerf offset to 0 so it is not applied twice.

## Class submission and the teacher view

- **Students**: *Submit to class* → class code + display name (remembered in this browser) → the project file, a small preview and the material are sent. Submitting again from the same browser replaces the previous submission (the teacher can still see the history). If the class has a calibrated material profile and the design differs, the student is told and can switch to the class profile. If the server can't be reached, the app says so and offers *Download for laser* instead; nothing in the editor changes.
- **Teacher** (`/#/teacher`, link in the top bar): sign in with the teacher key; create classes (each gets a short code like `6GDAFC`), close/reopen or delete them, attach a material profile; see submissions with preview, student name, title, material, pieces and status; download a submission's SVG/DXF/project (always regenerated from the submitted project with the same code students use); select submissions of the same material and **batch** them onto shared sheets (each piece labelled with the student's name on the green GUIDE layer — set that layer's output off in LightBurn); **mark as cut** one by one or for a batch. Mixed materials are refused with an explanation.
- **Abuse limits**: at most 120 submissions per class and 6 per browser in any 10 minutes; project ≤ 2 MB, preview ≤ 600 KB; only project files the app can read are accepted (parsed and migrated by the server with the app's own code); previews containing scripts are refused. Class codes are random (6 characters, no look-alike letters) and classes can be closed.

## Data stored

- **In the student's browser**: the current design (IndexedDB `cutforge/kv/current-design`), language, hint and last class code/display name, and a random device id (`localStorage`). This stays until the browser's site data is cleared.
- **On the server (only when a student submits)**: in D1 — class name, code, open/closed, optional material profile; per submission: class, display name, design title, material, thickness, piece count, status, time, whether it was replaced, and a random device id (only the first 6 characters are shown to the teacher). In R2 — the submitted project file and its preview SVG. No email addresses, passwords or accounts for students.
- **How long**: until the teacher deletes the submission or the class (deleting a class deletes all its submissions and files). There is no automatic expiry; delete classes at the end of the term.

## Cloudflare deployment

One Worker serves the built app (static assets) and the `/api` routes, with D1 (Drizzle schema in `worker/schema.ts`, SQL migrations in `drizzle/`) and an R2 bucket.

```bash
npx wrangler login
npx wrangler d1 create cutforge            # copy the database_id into wrangler.toml
npx wrangler r2 bucket create cutforge-submissions
npm run db:migrate                          # apply drizzle/*.sql to the remote D1
npx wrangler secret put TEACHER_KEY         # the teacher's sign-in key
npx wrangler secret put SESSION_SECRET      # a long random string
npm run deploy                              # vite build + wrangler deploy
```

After a schema change: edit `worker/schema.ts`, run `npm run db:generate`, then `npm run db:migrate`. `npm run typecheck` checks both the app and the Worker.
