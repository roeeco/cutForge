# CutForge

A browser tool for high-school students to design laser-cut organisers and game parts from flat panels, edited directly in a 3D workspace and a 2D cut plan, and exported as true-size SVG/DXF for LightBurn.

Status: **Milestones 1–27 complete** — the original brief (`laser-fabrication-editor-agent-prompt.md`: vertical slice, connections and angles, editing tools, text/import/packing/validation/kerf, templates, class submission and teacher view), the visual overhaul, and polygons, cuts and corrugated joints (`polygons-and-corrugated-agent-prompt.md`: polygon bases, Add/Cut shapes, trays, wall outlines, through-cuts, corrugated locks, fold-over reinforcement), then interaction refinements, the gizmo, design-wide joints and the settings card (milestones 15–27). See `PROGRESS.md` for what was verified and the remaining limitations.

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
SHOTS=1 npx playwright test -c pw-app.config.ts refine-shots      # milestones 15–20 screenshots into docs/refine-shots/
UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts               # only for an intended change in exported files
```

- `tests/autoseam.test.ts` builds 500 seeded random designs and checks that every pair of touching panels is joined or named by the export check (about 25 s).
- Export tests also run an **independent reader check** with Python (`ezdxf` for DXF, `svgpathtools` for SVG) when available: `pip install ezdxf svgpathtools`. Without them that one test is skipped.
- The Playwright run also starts the real Worker (`wrangler dev`, local D1/R2 in `.wrangler/e2e`) for the class-submission tests.
- Playwright uses software WebGL (SwiftShader). If your Playwright browsers are installed somewhere non-standard, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Using it

1. *What are you making?* Choose a material, then a template (blank, *Organiser with dividers* or *Card / tile stand*), then **Start** (the interface language toggle is on the same screen). With nothing selected, the card on the right has *Template* (its sizes), *Joints*, *Material and fit* and *Snapping*, each folding open from a header that sums up what is set (and stays open or closed the next time). Kerf, clearance and sheet settings are in the **Material & sheet** drawer (click the material pill in the top bar). New / Open / Save project are in the menu next to the design name.
2. **Panel** tool (`P`), in three clicks: **click** the face the panel goes on (any panel's face, or the floor grid; the face under the pointer lights up), **click** one of the two small planes that appear there (*Flat*: lying on the face; *Standing*: square to it, like a wall or a shelf), then **press and drag** on that face to draw it (Esc starts over). Flat, it is a rectangle square to the face. Standing, it is a line with a wall standing on it at the last height you used: the line snaps level and parallel (to the face's own directions, to its edges and to the panels already standing on it; hold Alt to draw freely), and its ends land on wall faces, corners and shapes, so a partition drawn wall to wall ends on both. On a box's floor the ghost bar also offers *Divider*. Drag its arrow or type its height; the round badge puts the material on the other side. Drag the ghost's corners or type W/H, tick *Construction* for a guide that is never cut, then press **✓** (or Enter); **✕** or Esc drops it. A panel placed on a face is its own piece and moves with that face; if the face's panel is deleted, it drops to the floor where it was. Set exact sizes in the card, drag the teal arrows on the panel, or click the W/H labels on the stage to type a size. Moving a panel (by dragging it or with the gizmo) sticks it to other panels: its faces snap flush against theirs and its edges in line with theirs.
3. Hover a panel to see its free edges, click one (or use *Grow from …* in the card): a ghost shows the new panel and which side the material lies on; press its **✓** (or Enter) to grow it. Hold Cmd (Mac) or Ctrl (Windows) and drag along the edge, or Cmd/Ctrl-click twice, to grow on just that part (the points snap to the edge's corners and middle, thirds and quarters, the base's shapes and the opposite wall; type a number and Enter for an exact distance). A fold that would make its net overlap when laid flat turns the ghost amber, with *Cut it as its own piece*. Drag the ball on the angle arc at the hinge (or use the dial in the card) for 90°, 60°, 45°, 30° or 15°, the round badge on the ghost to flip *Up/Down*, the arrow to set its height, and choose the connection: plywood offers finger joints and tabs and slots at 90°; card and corrugated offer folds, glue flaps and tabs and slots. An angled plywood panel needs side walls (*Add side walls*).
   - Where panels meet without a connection (e.g. two walls at a corner), the inspector lists them under *Meeting panels* with a **Connect** button.
   - Dividers: click a wall, Shift-click the wall opposite, then **+ Divider** (step 15); crossing dividers get half-laps automatically. *Clear inside sizes* shows the compartments.
4. **Shapes** (one rail button; `R`, `U`, `C` pick rectangle, rounded rectangle or circle directly): its card chooses the shape and what it does to the board, then drag on a panel in 3D, or on a piece in the cut plan.
5. Switch between **3D workspace** and **Cut plan** at any time: both show the same panels; edits in either appear in the other.
6. **Download for laser** (SVG or DXF) and **Save project** (JSON). Work is also autosaved in the browser.

7. **Editing tools:** double-click a panel for a face-on *solo* view. Shift/Ctrl-click or drag a box to select several shapes, then move, resize, align, distribute or duplicate them. Turn a shape into a live row/grid array (and *Explode* it later). Shapes snap to panel and shape edges, centres and equal spacing (hold `Alt` to drag freely).

8. **Text and icons:** the *Text* tool places Hebrew or English text (edit it in the inspector; it is exported as outlines). *Import SVG* puts a simple icon on the selected panel. Set *Copies to cut* per piece; drag pieces on the cut plan to place them by hand; *Repack* to start over.

9. **Polygon bases** (`G`): click corners on the floor (Shift: 15° steps; type a number and Enter for an exact segment length; close on the first point or Enter, Backspace removes a corner, Esc cancels), or switch the tool's card to *Regular* and drag out an n-gon (3–12 sides). *Edit outline* on a base's card shows handles: drag a corner, click **+** on an edge to add one, select one and press Delete to remove it — walls standing on the edges follow. On a panel, the polygon tool draws a polygon shape.

10. **Extrude:** on a base with no walls, *Extrude walls* shows a ghost tray; drag its arrow or type the height, then its **✓**. A tick on the walls marks the tallest height at which a card or corrugated net still lies flat in one piece; above it the walls that change turn amber. Every straight edge gets a wall at one height (card and corrugated walls fold up from the base; corners are glue flaps on card, tab-and-slot on corrugated, fingers on plywood). The tray card changes the height and joints; deleting a wall opens that side, *Wall it* closes it. Push-pull on any tray wall changes all of them (tick *Own height* to keep one wall different).

11. **Cut out / Engrave / Score line / Add material:** shown on the shape card while a shape tool (Shapes, Polygon, Text) is in use, each with a picture of what it does to the board and a line saying it (the cut plan keeps its colours). *Add* joins the outline (a tab), *Cut* is a hole inside or a notch across an edge (cuts always win over adds). Every straight edge a shape makes can grow a panel; walls on an edge a cut splits become one wall per piece. With **Cut out** chosen, *Cut through the whole design* (a tick under it) means the shape removes material from every panel in its path through the whole design. While you draw it (or when it is selected), the panels it will cut are outlined in amber with a *Cuts N panels* badge; click it on any of those panels to select the original.

12. **Wall outlines:** *Edit outline* on a wall's card: drag its top corners, click **+** on its top or sides to add a point (pull it up for a gable). Grow a roof from a sloped edge like any other edge.

13. **Corrugated locks and fold-over:** in *Joints (advanced)*, tab-and-slot joints can have tabs that go *Through, fold under* (and the tray card has the same switch for its corners). On a card or corrugated wall, *Fold-over (double wall)* folds the top over into a liner on the inside: down to the base or a partial hem, glued or locked with tabs through slots in the base. Holes in the wall continue through the liner. The fold slider unfolds liners too.

14. **Move and rotate gizmo:** select a shape, or a floor panel, to get a gizmo: drag the square to move it, an arrow to move along one direction, the ring to turn it (15° steps; hold `Shift` for 1°, `Alt` for no snapping). While dragging, type a number and press Enter for an exact angle or distance. A floor panel turns with everything built on it, and snaps to other floor panels' corners and edges when moved. Seen almost edge-on, the ring turns to face you, with the turn's axis drawn through it. Passing over the centre while turning does not flip the turn. In the cut plan and face-on view, selected shapes have a turning ring. *Rotation* is also in the card.

15. **Dividers:** click a wall, then Shift-click the wall opposite it (a divider counts as a wall): a floating **+ Divider** button puts a divider halfway between them, joined to both (greyed, with the reason, when those walls cannot take one). Select a divider and drag its amber arrow to move it: it snaps to equal compartments, and the compartment sizes show above the dividers (click the ones next to it to type a size). Select several parallel dividers on one base for *Equal compartments*.

16. **Growing adapts:** while growing, the height arrow snaps to other panels (a lid lands on the opposite wall, a wall matches its neighbour), and the angle dial snaps to where the panel would rest on another one. Drag the small squares at the ghost's ends (or type *Starts at* / *Ends at*) to grow on part of an edge; the rest of the edge can be grown from later. With *Adapt to neighbours* on, the ghost is trimmed where it would run into other panels (a wall under a sloped roof becomes a gable) and is joined to them. *Edit outline* on the grow card lets you shape the ghost before growing.

17. **Through-cuts from any side:** select a through-cut and its corners show on every panel it cuts; drag one to resize it from there, and use the gizmo shown on those panels to move or turn it. Its edges snap to the panels it passes through. While you draw a through-cut with the polygon tool, the *Cuts N panels* badge counts as you go.

18. **Several boards:** Shift-click (Ctrl, or Cmd on a Mac) panels to select several. Floor panels, or panels placed on one face, can be aligned and distributed like shapes and moved together with the gizmo.

19. **Copy and paste shapes:** Cmd/Ctrl+C copies the selected shapes; Cmd/Ctrl+V pastes them onto the panel under the pointer (it follows the pointer and snaps; click to put it down, then **✓**).

20. **Every new thing is a ghost first:** shapes, polygons, text, imported SVGs, grown panels and extruded walls wait for their floating **✓** (Enter) or **✕** (Esc); then the tool goes back to *Select*. One ✓ is one undo step.

21. **A material for each board:** a board's card has a *Material* list (*Same as working*, the design's other materials, the built-in ones, *Custom…*). Its colour, thickness and joints follow; the card says which joints changed. A grown board takes its parent's material. With more than one material, a legend by the view settings lists them (click one to select its boards), the cut plan puts each material on its own sheets under a heading, and the download is one file per material.

22. **Nets that lie flat:** card and corrugated trays never overlap themselves when laid flat: the app trims a corner flap, folds a wall off its neighbour instead of the base, or cuts it as its own piece, and the tray card says so (*Lower to …* keeps it in one piece; *Keep in one piece* turns this off, and the export check then shows the overlap in red).

**Fold slider:** for card and corrugated designs with a fold, a fold/unfold slider sits at the bottom of the stage; it shows the flat net (and the fold-over liners) without changing the design.

**Export check:** besides cutting problems, it says when two panels touch but are not joined (and why), or run into each other; clicking the message selects both.

**Joints per material:** the *Joints* choices are kept for each material. Switch to card and back to plywood and your plywood joints come back; a note under a list says when a choice is not in use and why.

**Joints view** (the *Joints* button by the view settings): select a panel or a wall and each of its joints gets a label on the stage (nothing is labelled while nothing is selected); click one for a menu of the kinds that joint can take (*All joint settings…* opens it in the card). While it is on, the move, turn and grow handles are hidden. New joints where an edge meets a face (dividers, walls added inside a box, standing panels) are tabs in slots where they can be made, else glue flaps (card and corrugated), else a slide fit. A tab-and-slot joint's *Tabs* list (in its menu, its card, or a tray's card for its corners) says how the tabs hold: *Flush*; *Through, fold under* (card and corrugated); *Self-locking (snap)*: each tab passes through, barbs on its sides catch behind the other panel and a slit down the tab lets it flex in, so it clicks home and stays; or *Bolts and nuts (M3)* (plywood): a T-slot in the tab panel's edge holds an M3 nut, a hole in the other panel takes an M3 × 12 mm screw, at the two ends of each joint (the card counts the screws and nuts to buy).

**View settings** (sliders icon, bottom corner): outlines on/off, dimensions on/off, quality (*Auto*, *Simple*, *Rich*).

Keyboard: `V` select, `P` panel, `R` rectangle, `U` rounded rectangle, `C` circle, `G` polygon, `T` text, `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), `Delete`, `Ctrl+D` duplicate, `Esc` (cancel a drag / leave a tool / clear selection / leave solo view), arrow keys nudge the selected shapes 1 mm (`Shift` = 10 mm), `O` toggles perspective/orthographic.

## Quick build

A new browser starts in the **Workshop** (everything above); **Quick build** is one click away, and is remembered for that browser. The *Quick build | Workshop* switch in the top bar changes only what is shown, never the design, so a file opens the same in both. A class can choose the mode its students start in, and lock it.

1. **Start**: choose a material, then a template, *Blank*, or a **mission**: a starting design with goals (*Pencil box*, *Dice tray*, *Card stand*, *Game organiser*). The mission card on the stage ticks the goals off as you work and gives a star for each group done; click a goal to select what it is about.
2. **Five actions** on the rail (keys in brackets), each a ghost that **✓** (Enter) makes as one undo step:
   - **Box** (`B`): *Rectangle* or *Regular* (3–12 sides). Drag the footprint on the floor; the walls rise at the last height used; drag their arrow or type the height, then ✓.
   - **Wall / lid** (`W`): click a free edge. The new panel stands at 90° on the whole edge, fitted to its neighbours, starting at the height that fits (a lid reaches across to the opposite wall).
   - **Divider** (`D`): draw a line inside a box, from wall to wall; its ends snap to the walls and the compartment sizes show. A line that stops short makes a panel standing on the base. (Workshop's Panel tool offers the same *Divider* line on a box's base.)
   - **Hole** (`H`): circle, rectangle or rounded rectangle, cut out (or *Engrave* in the shape's card).
   - **Text & stickers** (`T`): text, engraved, or one of the bundled stickers.
3. **The app does most of the engineering**: angles, kerf, clearance, folds and snapping are chosen for you. The joints are chosen too, but stay yours to change: *Wall to base* and *Corners* in the settings card, and any one joint from its label in *How it's built* (the joints button by the view settings; select a panel to see its joints). Parts made with Workshop tools (an angled panel, a fold-over, a through-cut, a board in another material, a construction guide) show read-only with *Open in Workshop*; **More…** at the bottom of a card shows its Workshop version until you select something else.
4. **You can't make a file the laser can't cut**: shapes stop a safe distance from edges, joints and each other while you drag them (a faint amber line shows the limits, a note says why), and text stays readable. The **Ready to cut ✓** badge in the top bar turns into *1 thing to fix* when something still needs it (say, a panel made smaller in Workshop): open it and press **Fix**. Next to it the **sheet meter** shows how many sheets and how much of them the pieces use.
5. **What goes inside**: the box's card adds pencils, markers, dice, a deck of cards, a phone, a coin or your own size to a compartment. Each shows on the stage resting inside: green when it fits, amber with how much more room it needs. Drag it to another compartment. **Show how it goes together** (the play button by the view settings) folds the box up and brings each piece in, one at a time.

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
- **Teacher** (`/#/teacher`, link in the top bar): sign in with the teacher key; create classes (each gets a short code like `6GDAFC`), close/reopen or delete them, attach a material profile, choose the mode students start in (*Quick build* or *Workshop*, optionally locked) and the missions offered; share the class link (`/?class=CODE`) so students start that way; see submissions with preview, student name, title (and the mission with its goals met), material, pieces and status; download a submission's SVG/DXF/project (always regenerated from the submitted project with the same code students use); select submissions of the same material and **batch** them onto shared sheets (each piece labelled with the student's name on the green GUIDE layer — set that layer's output off in LightBurn); **mark as cut** one by one or for a batch. Mixed materials are refused with an explanation.
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
