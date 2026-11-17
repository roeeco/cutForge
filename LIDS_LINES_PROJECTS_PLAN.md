# CutForge: lids that open, lines, projects and dieline sheets: plan (milestones 73–84)

Planning notes from 2026-11-17. **Status: plan only, nothing built.**

This plan covers the first four items of the gap review made the same day (a packaging designer's view, and a pedagogy student's view: escape boxes, props, game sets):

1. A plywood lid that opens and locks, in Quick build (Part A).
2. A line tool with line types: cut, crease, perforation (Part B).
3. A project that holds several designs, with duplicate and size variants (Part C).
4. A labelled, dimensioned dieline export (Part D).

**Start from the packaging branch** (`claude/loving-johnson-uk02v0`, `PACKAGING_PLAN.md`, milestones 61–72) once milestone 72 is done, or from `main` once it has merged. Part A builds on its closures (milestone 67) and living hinges (63), Part D on its yield report (69). Parts B and C need nothing from it and could start from `main` today. Milestone numbers start at 73 so they collide with nothing (`main` ends at 43; waffle 49–60; packaging 61–72).

Code references below are to the packaging branch at `b7a4ac0` (milestone 70).

## 1. What was found (the evidence for each part)

| # | Finding | Evidence |
| --- | --- | --- |
| A | **A plywood lid cannot open.** Quick build's *Wall / lid* on a plywood box's back wall makes a lid finger-jointed on all four edges, and its card offers no closure. | Driven in the browser: the lid's joints were `finger` to the back, front, left and right walls. `sealOf` (`src/model/closures.ts`) only accepts a lid whose own joint is a `fold`; `closureStyles('plywood')` is `['rest']`; `wallRecipe` (`src/easy/recipes.ts`) grows with the design's joint. |
| A | **Nothing locks.** No hasp, padlock hole, hinge pin or latch anywhere. | No such geometry in `src/model`. |
| A | **A lid cannot be opened on screen.** The fold slider unfolds the whole net; there is no way to open one lid and look inside. | `foldDisplay(d, foldT)` takes one number for the design. |
| B | **Every shape is closed.** There is no way to draw a crease, a slit or a perforation. | `DetailShape` is `rect, roundrect, circle, text, path, polygon`; the polygon tool always closes; SVG import drops open lines (`openDropped`). |
| B | **A fold is always one score line.** Perforations exist only inside bend bands. A fold's direction (`foldDir`, valley or mountain) can be set on the joint's card and changes the dash in the 3D fold view, but the cut plan and the file treat both the same. | `foldBand` in `src/model/pieces.ts` emits `op: 'score'`; `foldDir` is read in `Connections.tsx` and `foldView.ts` (`Bend.mountain`) and nowhere in `pieces.ts` or `src/export`. |
| C | **One design per browser.** | `src/store/persist.ts`: one IndexedDB key, `current-design`. *New* replaces it. |
| D | **The dieline has no dimensions and the file no labels.** | The cut plan draws panel names only. A snap-lock carton's exported SVG held two groups (`SCORE`, `CUT`) and 13 paths. The GUIDE layer is used only for a teacher batch's names and the kiss-score note (`src/export/label.ts`). |
| D | **Small defects seen on the way.** | The export dialog says *6 piece(s)* for a one-piece carton while the yield line says *1 pieces* (`ExportDialog.tsx:28` counts `d.pieces` records). A carton's tuck lid is named *Panel 6*. The carton card labels its footprint *Width / Height* on a *Base* that is never cut. |

## 2. Decisions (defaults; §12 lists the ones the owner should confirm)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Order | A → B → C → D, the order of the review. C is independent and can be built in parallel. D comes after B so its legend knows the line types. |
| 2 | A lid's default | **In Quick build, a lid that closes a plywood box lifts off.** It is never glued shut unless the student chooses *Fixed*. Workshop keeps the joint chosen on the grow card, and offers the same choice afterwards. |
| 3 | Hinges for plywood | **A pin hinge** (the lid's own tabs turning in round holes in the side walls) and the existing **living hinge**. No bought hardware. Sliding lids need a groove, so two layers: later (§14). |
| 4 | Locks | **A staple through the lid:** a tongue on the front wall's top edge with a hole for a padlock above the lid. One to three of them. |
| 5 | Lines | **Their own list on a board** (`Panel.lines`), not a new `Detail` shape. A drawn crease is a mark: it does not fold the board in 3D. |
| 6 | Line types | *Cut*, *Crease*, *Perforation* (tears), *Cut-crease* (folds), *Guide* (never cut). Dashes are made at export from two numbers per material. |
| 7 | Library | **Designs live in the browser**, in IndexedDB, as today. No accounts, no server storage. A project is a named group of designs, saved as one file. |
| 8 | Size variants | **Derived, not copied.** A variant is a row of sizes applied to the master on demand, so a change to the master reaches every size. |
| 9 | Dimensioned output | **Annotations on the GUIDE layer** of the laser file (a tick, off by default), and a **spec sheet** printed from the browser (so *Save as PDF* works) or downloaded as SVG. No PDF library. Trade PDFs with spot colours stay in `PACKAGING_PLAN.md` §14.6. |

---

# Part A: lids that open and lock (milestones 73–75)

## 3. The model

### 3.1 A lid is recognised by what it does, not by its joint

Today `sealOf` needs the lid's own connection to be a `fold`. Change: a lid is **a board grown from a tray wall's top edge whose far edge reaches the opposite wall** (`reachFor` already finds that wall and the side walls), whatever its joint. The closure then says how the lid meets *every* wall it covers, the wall it grew from included when that joint is not a fold or a hinge.

`ClosureStyle` gains three values. Plywood offers `lift`, `hinge`, `rest`, `fixed`; card and corrugated keep their lists and gain `lift`.

| Style | The lid | The wall it grew from | The other walls | Glue |
| --- | --- | --- | --- | --- |
| `lift` (**Lift-off**, the Quick build default on plywood) | Wide notches in its edges | Wide fingers on the top edge | The same | none |
| `hinge` (**Hinged**) | A pin on each side near the back, see §3.2 | Top lowered a little under the lid's back edge | Rests on them | none |
| `rest` (exists) | Plain | Plain | Plain | none |
| `fixed` (**Fixed**) | Today's joints (fingers or tabs) | Today's | Today's | yes |

- **Lift-off is the finger joint, loosened.** The geometry comes from the existing finger generator (`connectionGeomOne` in `src/model/seams.ts`) with two changes: the lid clearance (`Closure.fit`, default 0.3 mm, against the joint clearance of 0.1) and one or two wide fingers per side instead of many (`liftFingers(len)`: one under 80 mm, else two). The lid drops straight down and lifts straight up.
- **`fixed` is what a plywood lid is today**, so old files open unchanged: a sealing lid with finger or tab joints and no stored closure reads as `fixed`. Nothing to migrate.
- The living hinge stays what it is (a `fold` with a radius, milestone 63) and is offered beside *Hinged* as *Hinged, one piece (living hinge)*, greyed with the reason when the box is too small for the material's radius.
- `Closure` gains `fit?: number`, `pull?: 'none' | 'notch' | 'hole'` (how fingers get under a lift-off lid: a half-round notch in the front wall's top, which `thumb` already draws, or a 20 mm hole in the lid), and `hasps?: { n: 1 | 2 | 3; hole: number }` (§3.3).

### 3.2 The pin hinge

All of it is in-plane geometry on three boards, so it fits `ConnGeom` (`adds`, `holes`, `edges`) with no new machinery. Starting geometry, for thickness t and clearance c:

- **Pins:** each of the lid's side edges carries a tab t wide and t + 1 long, centred t/2 from the lid's back edge. Its cross-section is t × t, so it turns in a round hole of diameter `√2·t + 2c + 0.2`.
- **Ears:** each side wall gets a rounded ear on its top edge at the back: a disc of radius `hole/2 + 3` about the pin's axis (which is t/2 above the wall's top), joined to the wall. The round top is what lets the lid's shoulders swing past.
- **Shoulders:** the lid is cut back by `t + c` along each side from its back edge to 1 mm past the ear, so it sits between the ears there and on top of the side walls further forward.
- **Relief:** the lid's lower back corner swings 0.21·t below the wall top, so the back wall's top is lowered by `0.21·t + 0.3` under the lid (0.9 mm at 3 mm).
- **Assembly order:** the pins are captured between the side walls, so the lid goes in before the second side wall. *Show how it goes together* (`src/easy/assemble.ts`) must place it then, and never glue it.

**These numbers are set by a spike before milestone 74**, as the snap-lock bottom's were: cut three boxes (80 × 60 × 40, 150 × 100 × 60, 250 × 180 × 80 mm) in 3 mm plywood, and in 4 mm corrugated to learn whether the hinge is worth offering there. Adjust until each opens past 100°, stays open, closes flat and does not bind. The numbers and their limits go into `DECISIONS.md`. If the back-wall relief reads badly, the alternative is to move the axis behind the back wall (ears that reach back past the corner); the spike decides.

### 3.3 The hasp

- **On the wall:** a tongue on the front wall's top edge, `hole + 2·web` wide (web = max(4, t + 1)), rising `t_lid + 1 + hole + web` above where the lid's top face lies, with a round hole whose lowest point is 1 mm above the lid. Hole 8 mm by default (6, 8, 10 on the card: a luggage padlock's shackle is 3–4 mm, a classroom padlock's 5–6).
- **In the lid:** a notch in its front edge (a closed slot when the lid overhangs the wall), the tongue's size plus the lid clearance each side. A hinged lid's front edge moves back as it rises, away from the tongue, so the notch needs no extra room.
- **How many:** one, two or three, spread along the front (*three locks, three puzzles* is the escape-box case). A lift-off lid locked at the front only can be tilted off at the back, so *Lift-off* with a hasp gets one at the back too, and the card says so (*2 padlocks, or tie the back one with a cable tie*).
- With a `lift` lid a hasp replaces the finger at its place.
- Checks: `val.haspThin` (the web round the hole is below the material's minimum), `val.haspLow` (a shape on the lid in the padlock's way).

### 3.4 Opening a lid on screen

- View state, not design: `openLids: Record<string, number>` in the store (0 closed, 1 open), cleared on reload.
- `lidPose(d, lidId, k)` gives the lid's matrix: a turn about the pin axis (`hinge`), the band's own unrolling (living hinge), a turn about the crease (card and corrugated lids), or a lift of 1.5 × the box's height (`lift`). `foldDisplay` (`src/views/foldView.ts`) applies it to the lid and to everything built on it.
- A round **Open / Close** badge on the lid on the stage, and the same on its card. Objects placed inside (*What goes inside*) are then visible.

## 4. In the interface

- **Quick build, *Wall / lid*:** while the ghost would close the box, its label reads *Closes the box: lifts off* and the tool's card shows *Lid: Lift-off · Hinged · Fixed* and *Lock: none · 1 · 2 · 3*. ✓ makes the lid and its closure in one undo step.
- **The lid's card** (`src/ui/ClosureUI.tsx`): the style list, *Fit* (Workshop only), *Finger pull*, *Locks* with the hole size, and *Open*.
- **Workshop:** the same section on any sealing lid. The joint chosen on the grow card still applies when the style is *Fixed*.
- **A mission, *Escape box*** (`src/easy/missions.ts`): a plywood box with goals *the lid opens*, *it takes a padlock*, *a clue is engraved inside*, *fits one sheet*, *ready to cut*.
- **Names:** a board with a closure is named *Lid* (`src/model/names.ts`), not *Panel 6*.

---

# Part B: lines and line types (milestones 76–78)

## 5. The model

### 5.1 Lines on a board

```ts
/** A drawn line on a board, in the board's local coordinates. */
export type BoardLine = {
  id: string;
  /** Its points in order; `bulge` bows the segment that starts here into an arc (DXF's bulge: tan of a quarter of the turn). */
  pts: (P2 & { bulge?: number })[];
  type: 'cut' | 'crease' | 'perf' | 'cutcrease' | 'guide';
  /** Lines drawn in one stroke across folds: selected, moved and deleted together. */
  group?: string;
};
// Panel.lines?: BoardLine[]
```

**Why its own list and not a `Detail`:** the same reason `IMAGES_ON_BOARDS.md` gives for `Panel.images`. A new detail shape would reach 57 `.details` call sites in 22 files (outline merges for *Add* and *Cut*, `holeCuts`, the Quick build guard, through-cuts, arrays), all of which assume a closed shape with an inside. A separate list touches none of them. That plan's traced centerlines (`path.lines`) can be stored as `BoardLine`s of type `crease` when it is built, so there is one open-line path through the export, not two.

**Bulge and not Bézier:** an arc maps exactly onto `ArcSeg`, SVG's `A` and DXF's bulge, so curved creases stay arcs in the file, as the README promises for everything else.

### 5.2 Line types

| Type | In the file | Meaning | Notes |
| --- | --- | --- | --- |
| *Cut* | CUT layer, open | A slit | May touch the outline at one end only. A cut from edge to edge would split the piece without the app knowing: refused, with the fix *Make it a perforation* (`val.lineSplits`). |
| *Crease* | SCORE layer | A fold line or a decorative score | |
| *Perforation* | CUT layer, dashes | Tears along the line | Starts with a cut where it meets the outline, so the tear starts. |
| *Cut-crease* | CUT layer, longer dashes | Folds along the line; for board a laser score barely marks | Starts with a tie at the outline, so the edge stays strong. |
| *Guide* | GUIDE layer | A reference line, never cut | LightBurn's output for that layer is off, as for labels. |

- **Dashes are made at export**, not stored: `dashes(line, [cut, tie])` walks the line's length (arcs included) and returns the cut pieces. The two pairs live on the material (`MaterialProfile.lines?: { perf: [number, number]; crease: [number, number] }`), with defaults per kind like `bendDefaults`: card 1.5 / 0.7 and 4 / 2 mm, corrugated 1.6 3 / 1.5 and 8 / 4, corrugated 4 and plywood 4 / 2 and 10 / 5. Starting points; the material drawer edits them, and the note there says to try them on scrap.
- **Kerf compensation leaves open lines alone**, as it already does (`compensatePiece` offsets closed cut contours only).
- **Lines are clipped to the board** when pieces are built: the parts of a line outside the outline or inside a hole are dropped (a segment against a polygon, no polygon clipping). An arc that is clipped is flattened; one that is not stays an arc.
- **Checks:** `val.lineSplits`; `val.lineNear` (a *Cut* or *Perforation* closer than the material's web to a slot, a joint or another cut, reusing `minWeb`); `val.lineOutside` (wholly off the board).

### 5.3 How a fold is made (milestone 78)

- `Connection.crease?: 'score' | 'perf' | 'cutcrease'` on fold joints (and a lid's hinge), absent meaning `score`. The design-wide choice sits with the other joint choices, per material (`DesignJoints.crease`). Defaults do not change, so every golden export stays byte-identical.
- The score lines a joint contributes (`ConnGeom.scores`, `FoldStrip.scores`) carry their connection, and `groupPieces` turns them into dashes on the CUT layer when the style asks.
- **Mountain folds.** A score works best on the outside of a fold. Creases whose `foldDir` is `mountain` go on their own layer, `SCORE_BACK` (a fifth LightBurn colour), when the student ticks *Creases on the back* in the export dialog; a second, mirrored file for the back of the sheet reuses what kiss scores already do (`kissPanels` and the *THIS SIDE UP* label in `src/export/prepare.ts`). Off by default: one file, one side, as today.

## 6. In the interface

- **The Line tool** (`L`) on Workshop's rail. Click points; double-click or Enter ends the line; Esc cancels; Backspace removes the last point. Shift holds 15° steps, typing a number sets a segment's length (both as the polygon tool does). It is a mode of the code in `src/views/polyTool.tsx` that does not close.
- Its card: the five types, each with a picture of its line, as the shape card's operations have.
- **It waits for ✓** like everything else, and one ✓ is one undo step.
- **Editing:** a selected line shows its points. Drag a point; **+** on a segment adds one; Delete removes one; drag a segment's middle to bow it into an arc (double-click the middle to straighten it). The gizmo moves and turns it. Ctrl+C, Ctrl+V and Ctrl+D work as for shapes.
- **Snapping:** ends snap to the board's edges and corners, to fold lines, to other lines' ends and to shapes, through the existing snap code with the line's box and points.
- **Selection:** a new kind, `{ kind: 'line', id, ids }`. The export check's messages select it.
- **In the cut plan, a line drawn across folds** is split at each fold into one line per board (each segment mapped back through the piece's `NetPanel.xf`), with one `group`. That is how a tear strip runs round a carton.
- **3D:** lines are drawn on the board's faces by the code that draws shape outlines (`DetailLines`), dashed for the dashed types.
- **Quick build:** the Line tool is not on its rail. Lines made in Workshop show and can be selected and deleted there; *More…* opens the Workshop card. This is one row in `src/easy/features.ts`.

---

# Part C: projects (milestones 79–81)

## 7. The model

### 7.1 The library

IndexedDB `cutforge` goes to version 2. `onupgradeneeded` creates each store only if it is missing, so this plan and `IMAGES_ON_BOARDS.md` (which adds `assets`) can land in either order, each raising the version by one.

| Store | Key | Value |
| --- | --- | --- |
| `kv` (exists) | | Gains `open-design` (the id of the design being edited). `current-design` is read once, moved into `designs`, then left alone. |
| `designs` | design id | The design, as autosave writes it today. |
| `meta` | design id | `{ id, name, updatedAt, material, pieces, sheets, thumb, projectId? }`. The start screen reads only this store, so it opens fast with many designs. `thumb` is the SVG from `renderThumbnail` (`src/views/thumbnail.ts`), made on save. |
| `projects` | project id | `{ id, name, order: string[] }` |

- **The editor does not change.** The store still holds one `design`. Switching designs saves the open one and calls `replaceDesign`. Undo history is kept per design in memory for the session (the last 50 steps) and is gone after a reload, as today.
- **Two tabs:** a `BroadcastChannel` announces every save. A tab holding the same design shows *Changed in another tab: Reload · Keep mine* and never overwrites silently.
- **Deleting** moves a design to a *Recently deleted* list for 30 days.
- **Storage:** `navigator.storage.persist()` is asked for once, after the second design is made. A full or blocked store shows the existing *Could not save* state, with *Save project* as the way out.

### 7.2 Projects and files

- A **project** is a named, ordered group of designs: the box, its tokens, its cards.
- **The project file** keeps today's format for one design, so the Worker's parser and class submission are untouched. A project of several is `{ format, schemaVersion, savedAt, project: { name, designs: Design[] } }` in the same `.cutforge.json`; `parseProject` reads either, and *Open* adds what it finds to the library.
- **Submitting** stays one design at a time.
- **Cut the whole project:** the designs of one material share sheets, each piece labelled with its design's name on the GUIDE layer. This is `batchExport` (`src/export/batch.ts`), which the teacher view already uses for a class; a project with several materials gets one batch per material, where the teacher's refuses.

### 7.3 Size variants

```ts
/** A size of the design: the master with these sizes applied. */
export type Variant = { id: string; name: string; w?: number; d?: number; h?: number; params?: Record<string, number | string> };
// Design.variants?: Variant[]
```

- `applyVariant(design, v)` is a pure function: a copy of the master, its sizes set, solved. Nothing derived is stored, so variants never drift from the master.
- **Which designs can have sizes:** a template design (its parameters), or a design with exactly one tray or carton (its footprint's width and depth, and its height). Otherwise the control is greyed with the reason (*Sizes need one box; this design has 3. Use Duplicate*).
- **What follows a size:**
  - Walls follow the base, as they do on any resize.
  - **A lid that closes the box in the master closes it in every size:** its depth is fitted again to the opposite wall (`reachFor`).
  - Dividers keep their share of the width (`DividerRec.at` scaled), so equal compartments stay equal.
  - Shapes, text and lines are not scaled. One within 1 mm of its board's centre line stays centred; any other keeps its distance from the nearer edge.
- **Each size is checked.** The export check runs per variant, and its messages name the size (*Size L: the window is too close to the edge*).
- Sizes are stated as the master's are (the footprint as drawn). When `PACKAGING_PLAN.md` §14.2 (inside, outside, crease to crease) is built, a variant's numbers take that meaning with it.

## 8. In the interface

- **The start screen** gets *Your designs* above *What are you making?*: a grid of thumbnails with name, material and date, newest first, grouped by project. Each has *Open*, *Duplicate*, *Rename*, *Move to project…*, *Delete*. With no designs the screen is as it is today.
- **The project menu** (the arrow by the design's name) lists the project's other designs to switch to, with *New design in this project*, *Duplicate*, *All designs…*, *Save project*, *Open…*.
- **Sizes** in the settings card (nothing selected): a small table of *Name · Width · Depth · Height* with **+ Size**. Choosing a row shows that size on the stage and in the cut plan, read-only, under a banner *Showing size L · Back to the master*. Editing happens on the master.
- **The export dialog:** *Sizes: ☑ Master ☑ S ☑ L*, one set of files per size, the size in the file name. In a project, *This design · The whole project*.
- **Quick build** shows the library and *Duplicate*. *Sizes* and *Cut the whole project* are Workshop (two rows in `features.ts`).

---

# Part D: the dieline as a document (milestones 82–83)

## 9. What is drawn, and where

One function, `annotate(d, copies, placements, t)`, returns annotations in sheet coordinates. Two renderers use it: the cut plan (SVG with real text) and the export.

| Annotation | From | Notes |
| --- | --- | --- |
| **Board names** | `panelLabel` | As the cut plan shows them today. |
| **Blank size** | each piece's box | Overall width × height, outside the piece. |
| **Dimension chains** | the piece's fold lines and outer edges (`PieceCopy.panels` and each board's edges) | Along the bottom and the left side, crease to crease. Only when every fold in the piece is parallel to the piece's box; otherwise each board gets *w × h* under its name. |
| **Glue areas** | `ConnGeom.flaps3d` of `glue` joints, glued fold-overs and glued closures | A dashed outline where the flap lands on the other board, and the word *glue* on the flap. Slit locks and tucks get none. |
| **Grain or flute arrow** | `MaterialProfile.grain` and the piece's turn on the sheet | One per piece; none when the material has no grain. |
| **Fold direction** | `Connection.foldDir` | Spec sheet only: valley dashed, mountain dash-dot, by convention. |
| **Line legend** | the types the design uses | *Cut*, *Crease*, *Perforation*, *Cut-crease*, *Guide*, with the dash lengths. |
| **Title block** | the design and `yieldReport` | Name, date, material and thickness, blank size, clear inside size (`clearSpans`), pieces, glue joints, metres of cut, kerf mode. |

- **In the cut plan:** a *Dimensions* toggle beside *Repack* (remembered per browser, as `viewPrefs.dims` is for 3D).
- **In the laser file:** *Add names and sizes (guide layer)* in the export dialog, off by default so today's files do not change. Text is outlined with `outlineText`, as `src/export/label.ts` does, because LightBurn must not need the font. Dimension lines are plain lines. Everything is on GUIDE, whose output is off.
- **The spec sheet:** *Download spec sheet* in the export dialog. One page per kind of piece, drawn as large as fits A4 or A3 landscape with its scale stated (*1 : 2*; *1 : 1* when it fits), dimensions and glue areas on, the title block and legend at the foot. It is an SVG with real text (Rubik, already bundled; Hebrew set right to left). *Print* opens it in a print view (`@page` sized to the sheet) so the browser's *Save as PDF* gives a PDF; *Download SVG* gives the file.
- **Numbers** use the student's precision (`DISPLAY_PRECISION_STUDENT`, 0.1 mm) and `fmtNum`, so Hebrew and English agree with the cards.

**Defects fixed in milestone 82** (§1, row D): the export dialog counts pieces as the yield report does (`pieceCopies`), with *1 piece* in the singular; a lid is named *Lid*; a carton's card reads *Length · Width · Depth* and calls an uncut base *Footprint*.

---

## 10. Milestones

Each is shippable on its own and ends as the others in `PROGRESS.md` do: unit suite, typecheck, golden exports (byte-identical unless the change is intended and listed), the app's browser suite, English and Hebrew strings, `README.md` and `DECISIONS.md` updated.

| # | Milestone | Done when |
| --- | --- | --- |
| **73** | **Lids that lift off, and opening a lid.** §3.1 (lid recognition whatever the joint; `lift`, `fixed`), §3.4, the Quick build choice, *Lid* names. | In Quick build, *Wall / lid* on a plywood box makes a lid with no glued joint; it opens on the stage; old files with a finger-jointed lid open unchanged and read *Fixed*. Golden for a lift-off box. |
| **74** | **The pin hinge**, after its spike (§3.2). | A hinged plywood box exports clean; the three spike sizes open past 100° and close flat; the assembly view places the lid before the second side wall. |
| **75** | **Hasps and the Escape box mission.** §3.3, finger pulls, the mission. | A box with one, two and three hasps exports clean; an 8 mm rod passes each cut hasp above the lid; the mission's goals tick off on the path a student takes. |
| **76** | **Lines in the engine.** §5.1, §5.2: `Panel.lines`, clipping, dashes, the material's dash numbers, checks, SVG and DXF. Made through `ops` only; no tool yet. | Goldens for each type, straight and arced. Every existing golden byte-identical. An open DXF line reads back as one polyline in the Python check. |
| **77** | **The Line tool.** §6. | A slit, a curved crease and a perforation drawn in 3D and in the cut plan; a line drawn across a carton's folds becomes one line per board and moves as one. |
| **78** | **How a fold is made.** §5.3: crease styles per joint and design-wide, creases on the back. | A corrugated tray with cut-crease folds exports dashes on the CUT layer and no score there; a mountain fold lands on `SCORE_BACK` when asked, and nowhere new when not. |
| **79** | **The library.** §7.1, the start screen's grid, duplicate, rename, delete and restore, the two-tab notice. | A browser with a design from before the change opens it as the first entry; ten designs list from `meta` without loading one of them; a design changed in a second tab is not overwritten. |
| **80** | **Projects.** §7.2: groups, the project file, the menu, *Cut the whole project*. | A project of three designs saves to one file and opens in another browser; a single-design file still submits to a class; a two-material project batches into two sets of sheets. |
| **81** | **Size variants.** §7.3. | A tuck carton with a window and three sizes: each size's lid closes, the window stays centred, each exports under its own name; a change to the master shows in every size. |
| **82** | **Dimensions on the dieline.** §9: `annotate`, the cut plan toggle, the guide-layer option, the defects. | A reverse-tuck carton's chain sums to its blank size to 0.05 mm; a hexagonal tray falls back to per-board sizes; files exported without the option are byte-identical to today's. |
| **83** | **The spec sheet.** | A4 and A3 pages at a stated scale, in English and Hebrew; printing gives one page per piece kind. |
| **84** | **Final verification** in the usual form: everything re-run, `PROGRESS.md` complete, limitations listed, what needs the owner listed (real cuts of the hinge and hasp, LightBurn's reading of `SCORE_BACK` and of guide text, Safari, a Chromebook). | — |

Order: 73 → 74 → 75; 76 → 77 → 78; 79 → 80 → 81; 82 → 83. The four runs are independent, except that 82's legend lists 76's line types (if D is built first, the legend has *Cut* and *Crease* only). If time is short: 73, 75 with lift-off lids only, 76–77, 79 and 82 are the core; 74, 78, 80–81 and 83 can follow.

## 11. Tests to add

- `lids.test.ts`: a lid is recognised with each joint; `lift` fingers at the lid clearance; an old finger-jointed lid reads `fixed`; the closure goes when the lid is pulled short and returns with its settings; the lid's pose at 0 and 1.
- `pinHinge.test.ts`: the pin, ear, shoulder and relief sizes from §3.2's formulas; **a sweep of the lid from 0° to 100° in 2° steps with no overlap** between the lid's solid and the walls' (the solids the tests already build in `tests/solid.ts`).
- `hasp.test.ts`: the tongue clears the lid by the lid clearance; the hole's lowest point is above the lid; web checks; one to three placed evenly.
- `lines.test.ts`: dash layout (ends, arcs, a line shorter than one dash); clipping at the outline and at holes; `val.lineSplits`; open lines untouched by kerf compensation; a cut-plan stroke split at folds maps back to the right boards.
- `creases.test.ts`: styles per joint; the design-wide choice per material; `SCORE_BACK` only when asked.
- `library.test.ts` (with `fake-indexeddb`, a dev dependency): migration from `current-design`; `meta` kept in step with `designs`; delete and restore; the version raised with a store already present.
- `variants.test.ts`: `applyVariant` leaves the master untouched; a sealing lid seals in every size; anchors (centred stays centred, edge distance kept); a sweep of sizes up and back returns the same design, ids included (the harness of `PACKAGING_PLAN.md` §11).
- `annotate.test.ts`: chains sum to the blank size; the fallback for non-parallel folds; a glue area for every glue joint and none for locks; label text outlines stay inside their piece.
- Goldens: a lift-off box, a hinged box with a hasp, each line type, a cut-crease tray, an annotated carton, a spec sheet.
- Browser specs: one per milestone, on the path a student takes, in Quick build where the feature is there.
- The idempotence and sweep fuzzers run over designs with lids, hasps and lines.

## 12. Decisions still open (defaults; change them here before work starts)

| # | Topic | Default |
| --- | --- | --- |
| 1 | A sealing plywood lid in **Workshop** | Keeps the grow card's joint (*Fixed*). The alternative is *Lift-off* everywhere, which changes what an existing workflow makes. |
| 2 | Hinge offered on corrugated 4 mm | Decided by the spike. Card and corrugated 1.6 keep their folded lids. |
| 3 | Hasp hole | 8 mm, with 6 and 10 on the card. |
| 4 | Lift-off lid with one hasp | A second hasp at the back is added. The alternative, hooked tabs at the back so one padlock is enough, is in §14. |
| 5 | The Line tool in Quick build | Not on the rail. |
| 6 | Dash lengths | The table in §5.2, per material, editable in the drawer. |
| 7 | Deleted designs | Kept 30 days. |
| 8 | Variants on designs with more than one box | Not offered. |
| 9 | Spec sheet output | Browser print and SVG; no PDF library. |
| 10 | Annotations in the laser file | Off by default. |
| 11 | Names in the UI | *Lift-off*, *Hinged*, *Fixed*, *Lock*, *Line*, *Crease*, *Perforation*, *Cut-crease*, *Guide*, *Your designs*, *Project*, *Sizes*, *Spec sheet*. Hebrew to be reviewed by a native speaker. |

## 13. Risks

1. **The pin hinge's fit.** It depends on real kerf and real plywood. Hence the spike before the milestone, the sweep test, and *Fit* on the card. If it cannot be made reliable, ship lift-off lids and the living hinge, and list the pin hinge as later.
2. **Lid recognition that surprises.** A board that happens to cover a box becomes a lid. Guard: only a board grown from a tray wall's top edge, only when it reaches the opposite wall, and the ghost says what it will make before ✓, as closures do today.
3. **Lines against the rest of the engine.** A cut line near a joint weakens it, and a line on a board whose outline changes can end up outside it. Guard: clipping at build time, the web check, and lines moving with their board's outline as shapes do.
4. **Dashes in the file size.** A long perforation is hundreds of short lines. DXF writes each as a `LINE` today; write a dashed line's pieces as they come and measure a worst case (a tear strip round a 600 mm carton) before deciding whether more is needed.
5. **Browser storage is not a backup.** A cleared browser loses the library. Guard: the persistence request, *Save project* in the menu, and a line under *Your designs* saying where designs are kept.
6. **Variants and free editing.** A shape anchored to an edge can land badly at an extreme size. Guard: each size is checked and named in the message; the limit to one box.
7. **Schema.** `Panel.lines`, `Design.variants`, `Connection.crease` and the new `Closure` fields are optional, so no migration and one schema bump (for `check.ts` to know them). The Worker reads submissions with the app's code, so it must be deployed with the app, as for every schema change.
8. **Size.** Twelve milestones. The core named in §10 is six.

## 14. Left for later

- **Sliding lids and drawers:** a groove needs two layers of board.
- **Hooked back tabs** for a lift-off lid locked by one padlock.
- **Fold along a drawn line:** turning a straight crease that runs from edge to edge into a real fold (the board becomes two, joined by a `fold`). Today a drawn crease is a mark.
- **Tear strip in one action:** two perforations and a pull tab, from one line.
- **A game-parts generator** (token and tile sheets with numbering): item 5 of the review, not in this plan.
- **Handing a class a starter design**, and library sync between devices: both need the server.

## 15. Relation to other branches and plans

| Branch or plan | Relation |
| --- | --- |
| `PACKAGING_PLAN.md` (61–72, `claude/loving-johnson-uk02v0`) | The base. Part A extends its closures (`src/model/closures.ts`, `ClosureUI.tsx`) and removes its rule that a plywood lid can only rest. Part B's dash generator is separate from bend patterns (`bendPatterns.ts`), which stay as they are. Part D reuses `yieldReport`. |
| `PRESETS_PLAN.md` | Its organiser's *hinged lid* on plywood ("a slot hinge") becomes this plan's pin hinge, and its lift-off lid can use `lift`. Its settings card is where *Sizes* would sit for a preset. |
| `IMAGES_ON_BOARDS.md` | Shares the IndexedDB version bump (§7.1) and open lines (§5.1). Its print pieces would get names and sizes from `annotate` for free. |
| `claude/waffle-mode` | Independent. A waffle design is one more design in the library. |

## References in the code

| For | Read |
| --- | --- |
| Lid recognition and closures | `reachFor`, `sealOf`, `closureStyles`, `reconcileClosures` in `src/model/closures.ts`; `src/ui/ClosureUI.tsx` |
| Finger and tab geometry | `connectionGeomOne`, `cornerTabs`, `fingerCountFor` in `src/model/seams.ts` |
| Quick build's lid | `wallRecipe` in `src/easy/recipes.ts`; `src/easy/features.ts`; `src/easy/missions.ts` |
| Poses in 3D | `foldDisplay`, `flapMatrix` in `src/views/foldView.ts`; `src/easy/assemble.ts` |
| Open contours in pieces and files | `pathContour`, `foldBand`, `groupPieces` in `src/model/pieces.ts`; `src/export/svg.ts`, `src/export/dxf.ts`; `compensatePiece` in `src/export/prepare.ts` |
| Drawing by clicking points | `src/views/polyTool.tsx` |
| Autosave and the project file | `src/store/persist.ts`, `src/store/hooks.ts`, `src/model/serialize.ts` |
| Batching designs onto shared sheets | `batchExport` in `src/export/batch.ts` |
| Resizing | `setPanelSize`, `setTrayHeight` in `src/model/ops.ts`; `regenerate` in `src/templates/registry.ts` |
| Labels on the guide layer | `pieceLabel` in `src/export/label.ts`; `src/export/layers.ts` |
| Piece geometry for dimensions | `PieceCopy`, `pieceCopies` in `src/model/pack.ts`; `NetPanel` in `src/model/pieces.ts`; `clearSpans` in `src/model/measure.ts` |
