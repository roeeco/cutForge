# CutForge

A browser tool for high-school students to design laser-cut organisers and game parts from flat panels, edited directly in a 3D workspace and a 2D cut plan, and exported as true-size SVG/DXF for LightBurn.

Status: **Milestones 1–14 complete** — the original brief (`laser-fabrication-editor-agent-prompt.md`: vertical slice, connections and angles, editing tools, text/import/packing/validation/kerf, templates, class submission and teacher view), the visual overhaul, and polygons, cuts and corrugated joints (`polygons-and-corrugated-agent-prompt.md`: polygon bases, Add/Cut shapes, trays, wall outlines, through-cuts, corrugated locks, fold-over reinforcement). See `PROGRESS.md` for what was verified and the remaining limitations.

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
npx playwright test -c pw-app.config.ts --grep-invert classroom   # app specs only, no Worker
SHOTS=1 npx playwright test -c pw-app.config.ts shots             # review screenshots into docs/polygon-shots/
```

- Export tests also run an **independent reader check** with Python (`ezdxf` for DXF, `svgpathtools` for SVG) when available: `pip install ezdxf svgpathtools`. Without them that one test is skipped.
- The Playwright run also starts the real Worker (`wrangler dev`, local D1/R2 in `.wrangler/e2e`) for the class-submission tests.
- Playwright uses software WebGL (SwiftShader). If your Playwright browsers are installed somewhere non-standard, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Using it

1. *What are you making?* Choose a material, then a template (blank, *Organiser with dividers* or *Card / tile stand*), then **Start** (the interface language toggle is on the same screen). Template sizes are in the card on the right when nothing is selected. Kerf, clearance and sheet settings are in the **Material & sheet** drawer (click the material pill in the top bar). New / Open / Save project are in the menu next to the design name.
2. **Panel** tool (`P`): drag on the floor grid to draw a flat panel. Set exact sizes in the card, drag the teal arrows on the panel, or click the W/H labels on the stage to type a size.
3. Hover a panel to see its free edges, click one (or use *Grow from …* in the card), then **Grow panel**: a ghost shows the new panel and which side the material lies on. Drag the ball on the angle arc at the hinge (or use the dial in the card) for 90°, 60°, 45°, 30° or 15°, the round badge on the ghost to flip *Up/Down*, the arrow to set its height, and choose the connection: plywood offers finger joints and tabs and slots at 90°; card and corrugated offer folds, glue flaps and tabs and slots. An angled plywood panel needs side walls (*Add side walls*).
   - Where panels meet without a connection (e.g. two walls at a corner), the inspector lists them under *Meeting panels* with a **Connect** button.
   - *Add a divider* on a panel with walls; crossing dividers get half-laps automatically. *Clear inside sizes* shows the compartments.
4. **Rectangle / Rounded rectangle / Circle**: drag on a panel in 3D, or on a piece in the cut plan. Choose cut-through, engrave or score.
5. Switch between **3D workspace** and **Cut plan** at any time: both show the same panels; edits in either appear in the other.
6. **Download for laser** (SVG or DXF) and **Save project** (JSON). Work is also autosaved in the browser.

7. **Editing tools:** double-click a panel for a face-on *solo* view. Shift/Ctrl-click or drag a box to select several shapes, then move, resize, align, distribute or duplicate them. Turn a shape into a live row/grid array (and *Explode* it later). Shapes snap to panel and shape edges, centres and equal spacing (hold `Alt` to drag freely).

8. **Text and icons:** the *Text* tool places Hebrew or English text (edit it in the inspector; it is exported as outlines). *Import SVG* puts a simple icon on the selected panel. Set *Copies to cut* per piece; drag pieces on the cut plan to place them by hand; *Repack* to start over.

9. **Polygon bases** (`G`): click corners on the floor (Shift: 15° steps; type a number and Enter for an exact segment length; close on the first point or Enter, Backspace removes a corner, Esc cancels), or switch the tool's card to *Regular* and drag out an n-gon (3–12 sides). *Edit outline* on a base's card shows handles: drag a corner, click **+** on an edge to add one, select one and press Delete to remove it — walls standing on the edges follow. On a panel, the polygon tool draws a polygon shape.

10. **Extrude:** on a base with no walls, *Extrude walls* shows a ghost tray; drag its arrow or type the height, then **Add walls**. Every straight edge gets a wall at one height (card and corrugated walls fold up from the base; corners are glue flaps on card, tab-and-slot on corrugated, fingers on plywood). The tray card changes the height and joints; deleting a wall opens that side, *Wall it* closes it. Push-pull on any tray wall changes all of them (tick *Own height* to keep one wall different).

11. **Add / Cut / Engrave / Score:** the four dots under the tools. *Add* joins the outline (a tab), *Cut* is a hole inside or a notch across an edge (cuts always win over adds). Every straight edge a shape makes can grow a panel; walls on an edge a cut splits become one wall per piece. With **Cut** chosen, the **#** switch is *Cut through*: the shape removes material from every panel in its path through the whole design. While you draw it (or when it is selected), the panels it will cut are outlined in amber with a *Cuts N panels* badge; click it on any of those panels to select the original.

12. **Wall outlines:** *Edit outline* on a wall's card: drag its top corners, click **+** on its top or sides to add a point (pull it up for a gable). Grow a roof from a sloped edge like any other edge.

13. **Corrugated locks and fold-over:** in *Joints (advanced)*, tab-and-slot joints can have tabs that go *Through, fold under* (and the tray card has the same switch for its corners). On a card or corrugated wall, *Fold-over (double wall)* folds the top over into a liner on the inside: down to the base or a partial hem, glued or locked with tabs through slots in the base. Holes in the wall continue through the liner. The fold slider unfolds liners too.

**View settings** (sliders icon, bottom corner): outlines on/off, dimensions on/off, quality (*Auto*, *Simple*, *Rich*), and for folded card/corrugated designs a fold/unfold slider that shows the flat net (also in the part's card).

Keyboard: `V` select, `P` panel, `R` rectangle, `U` rounded rectangle, `C` circle, `G` polygon, `T` text, `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), `Delete`, `Ctrl+D` duplicate, `Esc` (cancel a drag / leave a tool / clear selection / leave solo view), arrow keys nudge the selected shapes 1 mm (`Shift` = 10 mm), `O` toggles perspective/orthographic.

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
