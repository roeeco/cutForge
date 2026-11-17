# CutForge: lids that open, lines, projects, dieline sheets, and Quick build revised: plan (milestones 73–85)

Planning notes from 2026-11-17. **Status: plan only, nothing built.**

This plan covers the first four items of the gap review made the same day (a packaging designer's view, and a pedagogy student's view: escape boxes, props, game sets), and a revision of Quick build so that it carries them:

1. A plywood lid that opens and locks, in Quick build (Part A).
2. A line tool with line types: cut, crease, perforation (Part B).
3. A project that holds several designs, with duplicate and sizes (Part C).
4. A labelled, dimensioned dieline export (Part D).
5. Quick build revised to fit milestones 61–72 and Parts A–D, and kept simple (Part E).

**Revised the same day** after two things landed on the remote:
- The packaging branch finished (`claude/loving-johnson-uk02v0` at `91bcc29`, milestone 72). Milestone 71 added a telescoping lid (*Add a lid* on a box's card), so Part A no longer invents a lift-off lid: it uses that one.
- A second plan was committed, `PACKAGING_AND_LEARNING.md` (`claude/busy-pascal-9rlxzv`, its milestones 44–55), written from `main`. It overlaps this plan and the packaging branch. §16 says what is already built, what this plan takes over and what stays there.

**Start from the packaging branch** at `91bcc29`, or from `main` once it has merged. Parts A, D and E build on its closures (67), cartons (68), yield report (69) and lids (71). Parts B and C need nothing from it. Milestone numbers start at 73 (`main` ends at 43; waffle 49–60; packaging 61–72).

Code references are to the packaging branch at `91bcc29`.

## 1. What was found (the evidence for each part)

| # | Finding | Evidence |
| --- | --- | --- |
| A | **Two ways to make a lid, and one of them cannot open.** A box's card has *Add a lid*: a telescoping lid that lifts off, in any material (milestone 71). But Quick build's *Wall / lid* on a plywood box's back wall makes a lid finger-jointed on all four edges, with no closure on its card. | Driven in the browser at `b7a4ac0`: the lid's joints were `finger` to the back, front, left and right walls. `sealOf` (`src/model/closures.ts`) only accepts a lid whose own joint is a `fold`; `closureStyles('plywood')` is `['rest']`; `wallRecipe` (`src/easy/recipes.ts`) grows with the design's joint. `addLid` is in `src/model/ops.ts`, `TrayLids` in `src/ui/CornersUI.tsx`. |
| A | **Nothing locks, and plywood has no hinge but the living hinge.** No hasp, padlock hole or hinge pin anywhere. | No such geometry in `src/model`. |
| A | **A lid cannot be opened on screen.** The fold slider unfolds the whole net; there is no way to open one lid and look inside. | `foldDisplay(d, foldT)` takes one number for the design. |
| B | **Every shape is closed.** There is no way to draw a crease, a slit or a perforation. | `DetailShape` is `rect, roundrect, circle, text, path, polygon`; the polygon tool always closes; SVG import drops open lines (`openDropped`). |
| B | **A fold is always one score line.** Perforations exist only inside bend bands. A fold's direction (`foldDir`, valley or mountain) can be set on the joint's card and changes the dash in the 3D fold view, but the cut plan and the file treat both the same. | `foldBand` in `src/model/pieces.ts` emits `op: 'score'`; `foldDir` is read in `Connections.tsx` and `foldView.ts` (`Bend.mountain`) and nowhere in `pieces.ts` or `src/export`. |
| C | **One design per browser.** | `src/store/persist.ts`: one IndexedDB key, `current-design`. *New* replaces it. |
| D | **The dieline has no dimensions and the file no labels.** | The cut plan draws panel names only. A snap-lock carton's exported SVG held two groups (`SCORE`, `CUT`) and 13 paths. The GUIDE layer is used only for a teacher batch's names and the kiss-score note (`src/export/label.ts`). |
| D | **Small defects seen on the way.** | The export dialog says *6 piece(s)* for a one-piece carton while the yield line says *1 pieces* (`ExportDialog.tsx:28` counts `d.pieces` records). A carton's tuck lid is named *Panel 6*. A box's footprint is labelled *Width / Height*, and a carton's uncut footprint is called *Base*. |
| E | **Quick build has not kept up with milestones 61–72.** Their controls were added to the shared cards with no row in the feature table, so Quick build shows all of them. | `BendUI.tsx`, `ClosureUI.tsx`, `CornersUI.tsx` and `SplitUI.tsx` call `useFeature` nowhere. Seen in Quick build on a card carton: *Base: Open (a tube)*, *Top* and *Bottom* lists on the box's card; *1 sheet • 22% used • 1.2 m cut • 1 pieces • 1 glue joints*, *Nest* and *Save material* over the cut plan; the kerf choice in the download dialog. The same holds for *Bend radius*, *Pattern* and *Lines* on a folded board, a closure's lip, dust flaps and thumb notch, *Match top with*, and *Add an arched lid*. |

## 2. Decisions (defaults; §13 lists the ones the owner should confirm)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Order | E's first milestone (73) comes first: it needs no model change and fixes what students see today. Then A → B → C → D, the order of the review. C is independent and can be built in parallel. D comes after B so its legend knows the line types. |
| 2 | A lid in Quick build | **A lid made in Quick build always opens.** It lifts off (milestone 71's telescoping lid) unless the student chooses *Hinged*. *Wall / lid* can no longer glue a box shut. Workshop keeps the joint chosen on the grow card. |
| 3 | Hinges for plywood | **A pin hinge** (the lid's own tabs turning in round holes in the side walls) and the existing **living hinge**. No bought hardware. Sliding lids need a groove, so two layers: later (§15). |
| 4 | Locks | **A staple through the lid:** a tongue on the front wall's top edge with a hole for a padlock above the lid. One to three of them. Plywood only. |
| 5 | Lines | **Their own list on a board** (`Panel.lines`), not a new `Detail` shape. A drawn crease is a mark: it does not fold the board in 3D. |
| 6 | Line types | *Cut*, *Crease*, *Perforation* (tears), *Cut-crease* (folds), *Guide* (never cut). Dashes are made at export from two numbers per material. |
| 7 | Library | **Designs live in the browser**, in IndexedDB, as today. No accounts, no server storage. A project is a named group of designs, saved as one file. |
| 8 | Sizes | **Derived, not copied.** A size is a row of numbers applied to the master on demand, so a change to the master reaches every size. Called *Sizes*, not *variants*: `PACKAGING_AND_LEARNING.md` uses *variant* for an alternative design kept for comparison, which here is a duplicate in the same project. |
| 9 | Dimensioned output | **Annotations on the GUIDE layer** of the laser file (a tick, off by default), and a **spec sheet** printed from the browser (so *Save as PDF* works) or downloaded as SVG. No PDF library. Trade PDFs with spot colours stay in `PACKAGING_PLAN.md` §14.6. |
| 10 | Quick build | **The rail does not grow.** New abilities go on the card of the thing they belong to, as one question with pictures. Every engineering control added since milestone 41 gets a row in the feature table. |

---

# Part A: lids that open and lock (milestones 74–76)

## 3. The model

### 3.1 The lids a box can have

Three kinds of lid exist after milestone 72, in two models. This part adds a fourth and makes them one choice.

| Lid | Model today | Opens | This plan |
| --- | --- | --- | --- |
| **Lifts off** | A second tray on the box, `Tray.lidOf` (milestone 71) | yes | Unchanged. Gains hasps (§3.3) and the open pose (§3.4). |
| **Folded** (card, corrugated) | A board folded off a wall's top with a closure, `Design.closures` (67); a carton's `Tray.top` (68) | yes | Unchanged. Gains the open pose. |
| **Arched** | `archLids` (71) | yes | Unchanged. |
| **Grown with a plywood joint** | A board grown from a wall's top with `finger` or `tabslot` | **no** | Recognised as a lid, named *Fixed*, and offered a hinge. |
| **Hinged on pins** (plywood) | — | yes | New (§3.2). |

- **A lid is recognised by what it does, not by its joint.** Today `sealOf` needs the lid's own connection to be a `fold`. Change: a lid is a board grown from a tray wall's top edge whose far edge reaches the opposite wall (`reachFor` already finds that wall and the side walls), whatever its joint.
- `ClosureStyle` gains `hinge` (the pin hinge) and `fixed` (the joints the board was grown with). `closureStyles('plywood')` becomes `['hinge', 'rest', 'fixed']`.
- **Old files open unchanged:** a sealing plywood lid with finger or tab joints and no stored closure reads as `fixed`, and its geometry is what it is today. Nothing to migrate.
- The living hinge stays what it is (a `fold` with a radius, milestone 63) and is offered beside the pin hinge as *Hinged, one piece (living hinge)*, greyed with the reason when the box is too small for the material's radius.
- `Closure` gains `fit?: number` (the hinge's running clearance) and `hasps?: { n: 1 | 2 | 3; hole: number }`. A telescoping lid keeps its hasps on its tray (`Tray.hasps`, the same shape), because it has no closure record.

### 3.2 The pin hinge

All of it is in-plane geometry on three boards, so it fits `ConnGeom` (`adds`, `holes`, `edges`) with no new machinery. The lid lies on the walls' tops, flush with their outer faces. Starting geometry, for thickness t and clearance c:

- **Pins:** each of the lid's side edges carries a tab t wide and t + 1 long, centred t/2 from the lid's back edge. Its cross-section is t × t, so it turns in a round hole of diameter `√2·t + 2c + 0.2`.
- **Ears:** each side wall gets a rounded ear on its top edge at the back: a disc of radius `hole/2 + 3` about the pin's axis (which is t/2 above the wall's top), joined to the wall. The round top is what lets the lid's shoulders swing past.
- **Shoulders:** the lid is cut back by `t + c` along each side from its back edge to 1 mm past the ear, so it sits between the ears there and on top of the side walls further forward.
- **Relief:** the lid's lower back corner swings 0.21·t below the wall top, so the back wall's top is lowered by `0.21·t + 0.3` under the lid (0.9 mm at 3 mm).
- **Assembly order:** the pins are captured between the side walls, so the lid goes in before the second side wall. *Show how it goes together* (`src/easy/assemble.ts`) must place it then, and never glue it.

**These numbers are set by a spike before milestone 75**, as the snap-lock bottom's were: cut three boxes (80 × 60 × 40, 150 × 100 × 60, 250 × 180 × 80 mm) in 3 mm plywood. Adjust until each opens past 100°, stays open, closes flat and does not bind. The numbers and their limits go into `DECISIONS.md`. If the back-wall relief reads badly, the alternative is to move the axis behind the back wall (ears that reach back past the corner); the spike decides.

### 3.3 The hasp

A tongue on the front wall's top edge passes up through the lid; a padlock goes through the tongue's hole above the lid.

- **On the wall:** the tongue is `hole + 2·web` wide (web = max(4, t + 1)) and rises to `1 + hole + web` above the lid's top face, with a round hole whose lowest point is 1 mm above the lid. Hole 8 mm by default (6, 8, 10 on the card: a luggage padlock's shackle is 3–4 mm, a classroom padlock's 5–6).
- **In a hinged or resting lid** (flush with the wall's outer face): a notch in its front edge, the tongue's size plus 0.3 mm each side. A hinged lid's front edge moves back as it rises, away from the tongue, so the notch needs no extra room.
- **In a telescoping lid:** a closed slot in the lid's top, over the box's wall. That wall lies `t + c` in from the lid's edge, exactly where the rim's finger notches are, so **the rim's joint leaves that stretch to the lid**: it is generated in two ranges either side of the tongue (`connectionGeomOne` already takes a range), and between them the lid's top runs to its edge. That keeps about t of board between the slot and the edge.
- **How many:** one, two or three, spread along the front (*three locks, three puzzles* is the escape-box case).
- Checks: `val.haspThin` (the web round a hole or beside a slot is below the material's minimum), `val.haspBlocked` (a shape on the lid in the padlock's way).
- **Part of the spike:** whether a telescoping lid locked at the front can be tilted off at the back. Its rim should stop that; if it does not on the largest size, a lift-off lid gets a second hasp at the back by default.

### 3.4 Opening a lid on screen

- View state, not design: `openLids: Record<string, number>` in the store (0 closed, 1 open), cleared on reload.
- `lidPose(d, lid, k)` gives the lid's matrix: a lift of 1.5 × the box's height (a telescoping lid, its rim with it), a turn about the pin axis (`hinge`), the band's own unrolling (living hinge), or a turn about the crease (folded lids, with their lip and dust flaps). `foldDisplay` (`src/views/foldView.ts`) applies it to the lid and to everything built on it. A `fixed` lid has no pose.
- A round **Open / Close** badge on the lid on the stage, and the same on the box's card. Objects placed inside (*What goes inside*) are then visible.

## 4. In the interface

- **Quick build:** the box's *Lid* section and the *Wall / lid* action, both in Part E (§10.4). They are where a student meets all of this.
- **Workshop:** the lid's card (`src/ui/ClosureUI.tsx`) lists the styles its material offers, with *Fit*, *Locks* and the hole size, and *Open*. The box's card keeps *Add a lid* and *Add an arched lid*. A lid grown with fingers shows *Fixed*, with *Make it hinged* and *Replace with a lid that lifts off*.
- **A mission, *Escape box*** (`src/easy/missions.ts`): a plywood box with goals *the lid opens*, *it takes a padlock*, *a clue is engraved inside*, *fits one sheet*, *ready to cut*. If briefs are built (`PACKAGING_AND_LEARNING.md` milestone 50) it is written as one, with nothing ticked on arrival.
- **Names:** a lid is named *Lid* (`src/model/names.ts`), not *Panel 6*.

---

# Part B: lines and line types (milestones 77–79)

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

### 5.3 How a fold is made (milestone 79)

- `Connection.crease?: 'score' | 'perf' | 'cutcrease'` on fold joints (and a lid's hinge), absent meaning `score`. The design-wide choice sits with the other joint choices, per material (`DesignJoints.crease`). Defaults do not change, so every golden export stays byte-identical.
- The score lines a joint contributes (`ConnGeom.scores`, `FoldStrip.scores`) carry their connection, and `groupPieces` turns them into dashes on the CUT layer when the style asks.
- **Mountain folds.** A score works best on the outside of a fold. Creases whose `foldDir` is `mountain` go on their own layer, `SCORE_BACK` (a fifth LightBurn colour), when *Creases on the back* is ticked in the export dialog; a second, mirrored file for the back of the sheet reuses what kiss scores already do (`kissPanels` and the *THIS SIDE UP* label in `src/export/prepare.ts`). Off by default: one file, one side, as today.

## 6. In the interface (Workshop)

- **The Line tool** (`L`) on Workshop's rail. Click points; double-click or Enter ends the line; Esc cancels; Backspace removes the last point. Shift holds 15° steps, typing a number sets a segment's length (both as the polygon tool does). It is a mode of the code in `src/views/polyTool.tsx` that does not close.
- Its card: the five types, each with a picture of its line, as the shape card's operations have.
- **It waits for ✓** like everything else, and one ✓ is one undo step.
- **Editing:** a selected line shows its points. Drag a point; **+** on a segment adds one; Delete removes one; drag a segment's middle to bow it into an arc (double-click the middle to straighten it). The gizmo moves and turns it. Ctrl+C, Ctrl+V and Ctrl+D work as for shapes.
- **Snapping:** ends snap to the board's edges and corners, to fold lines, to other lines' ends and to shapes, through the existing snap code with the line's box and points.
- **Selection:** a new kind, `{ kind: 'line', id, ids }`. The export check's messages select it.
- **In the cut plan, a line drawn across folds** is split at each fold into one line per board (each segment mapped back through the piece's `NetPanel.xf`), with one `group`. That is how a tear strip runs round a carton.
- **3D:** lines are drawn on the board's faces by the code that draws shape outlines (`DetailLines`), dashed for the dashed types.
- **Quick build** has no Line tool (§10.3).

---

# Part C: projects (milestones 80–82)

## 7. The model

### 7.1 The library

IndexedDB `cutforge` goes to version 2. `onupgradeneeded` creates each store only if it is missing, so this plan and `IMAGES_ON_BOARDS.md` (which adds `assets`) can land in either order, each raising the version by one.

| Store | Key | Value |
| --- | --- | --- |
| `kv` (exists) | | Gains `open-design` (the id of the design being edited). `current-design` is read once, moved into `designs`, then left alone. |
| `designs` | design id | The design, as autosave writes it today. |
| `meta` | design id | `{ id, name, updatedAt, material, pieces, sheets, pct, cut, glue, thumb, projectId? }`. The start screen reads only this store, so it opens fast with many designs. The numbers are the yield report's; `thumb` is the SVG from `renderThumbnail` (`src/views/thumbnail.ts`). Both are made on save. |
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
- **Compare:** two designs of a project side by side, their thumbnails over their numbers from `meta` (pieces, sheets, percent used, metres of cut, glue joints). An alternative is a duplicate in the same project. This is what `PACKAGING_AND_LEARNING.md` milestone 52 calls *variants*, without a second store (§16).

### 7.3 Sizes

```ts
/** A size of the design: the master with these sizes applied. */
export type BoxSize = { id: string; name: string; w?: number; d?: number; h?: number; params?: Record<string, number | string> };
// Design.sizes?: BoxSize[]
```

- `applySize(design, s)` is a pure function: a copy of the master, its sizes set, solved. Nothing derived is stored, so sizes never drift from the master.
- **Which designs can have sizes:** a template design (its parameters), or a design with exactly one box (a telescoping lid counts as part of its box). Otherwise the control is greyed with the reason (*Sizes need one box; this design has 3. Use Duplicate*).
- **What follows a size:**
  - Walls follow the base, as they do on any resize. A telescoping lid follows its box already (`reconcileLids`).
  - **A grown lid that closes the box in the master closes it in every size:** its depth is fitted again to the opposite wall (`reachFor`).
  - Dividers keep their share of the width (`DividerRec.at` scaled), so equal compartments stay equal.
  - Shapes, text and lines are not scaled. One within 1 mm of its board's centre line stays centred; any other keeps its distance from the nearer edge.
- **Each size is checked.** The export check runs per size, and its messages name it (*Size L: the window is too close to the edge*).
- Sizes are stated as the master's are (the footprint as drawn). When `PACKAGING_PLAN.md` §14.2 (inside, outside, crease to crease) is built, a size's numbers take that meaning with it.

## 8. In the interface

- **The start screen** gets *Your designs* above *What are you making?*: a grid of thumbnails with name, material and date, newest first, grouped by project. Each has *Open*, *Duplicate*, *Rename*, *Move to project…*, *Delete*. With no designs the screen is as it is today.
- **The project menu** (the arrow by the design's name) lists the project's other designs to switch to, with *New design in this project*, *Duplicate*, *All designs…*, *Save project*, *Open…*.
- **Sizes** in the settings card (nothing selected): a small table of *Name · Width · Depth · Height* with **+ Size**. Choosing a row shows that size on the stage and in the cut plan, read-only, under a banner *Showing size L · Back to the master*. Editing happens on the master.
- **The export dialog:** *Sizes: ☑ Master ☑ S ☑ L*, one set of files per size, the size in the file name. In a project, *This design · The whole project*.
- What Quick build shows of this is in §10.5.

---

# Part D: the dieline as a document (milestones 83–84)

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

- **In the cut plan:** the line legend is always in the corner (it is small, and it says what red and blue mean). A *Dimensions* toggle beside *Repack* turns on sizes, glue areas and the arrow (remembered per browser, as `viewPrefs.dims` is for 3D).
- **In the laser file:** *Add names and sizes (guide layer)* in the export dialog, off by default so today's files do not change. Text is outlined with `outlineText`, as `src/export/label.ts` does, because LightBurn must not need the font. Dimension lines are plain lines. Everything is on GUIDE, whose output is off.
- **The spec sheet:** one page per kind of piece, drawn as large as fits A4 or A3 landscape with its scale stated (*1 : 2*; *1 : 1* when it fits), dimensions and glue areas on, the title block and legend at the foot. It is an SVG with real text (Rubik, already bundled; Hebrew set right to left). *Print* opens it in a print view (`@page` sized to the sheet) so the browser's *Save as PDF* gives a PDF; *Download SVG* gives the file.
- **Actual size, on several pages:** the same sheet at 1 : 1, tiled across A4 or A3 pages with 10 mm overlap marks, fold lines dashed, for a paper mock-up before board is used.
- **Numbers** use the student's precision (`DISPLAY_PRECISION_STUDENT`, 0.1 mm) and `fmtNum`, so Hebrew and English agree with the cards.

**Defects fixed in milestone 83** (§1, row D): the export dialog counts pieces as the yield report does (`pieceCopies`), with *1 piece* in the singular; a carton's uncut footprint is called *Footprint*. (Names and *Width · Depth · Height* are fixed earlier, in milestone 73.)

The always-visible legend and the 1 : 1 print come from `PACKAGING_AND_LEARNING.md` milestone 54, which this part replaces except for its artwork guide (§16).

---

# Part E: Quick build, revised (milestone 73, and a row in each later one)

## 10. Quick build

### 10.1 Rules

`EASY_MODE.md`'s decisions stand: expression stays open, engineering is automatic, everything is a ghost that ✓ makes, the same design opens in both modes. Five rules are added so that Quick build stays small as the engine grows:

1. **The rail does not grow.** Select and six actions, as today. A new ability goes on the card of the thing it belongs to.
2. **One question per thing, in a student's words, answered with pictures.** At most three or four choices in view; the rest is under *More…*.
3. **Every control has a row in the feature table.** A test fails when a card section has none (§12), so the next engine milestone cannot leak into Quick build unnoticed.
4. **One way to make each thing.** The same lid whichever way it was asked for.
5. **Nothing made in Quick build needs Workshop to work.** A lid opens; a carton closes; a file is ready to cut.

### 10.2 What a student can make, and how many choices it takes

| To make | Steps today | Steps after |
| --- | --- | --- |
| An open box, any footprint | Box, drag, ✓ | The same |
| A box with a lid that lifts off | Box, drag, ✓; select the base; *Add a lid* on its card | Box · *With a lid*, drag, ✓ |
| A hinged, lockable plywood box | Not possible | Box · *With a lid*, drag, ✓; *Lid: Hinged*; *Locks: 1* |
| A carton that closes | Box · *Bottom: Snap-lock*, drag, ✓ | Box · *Carton*, drag, ✓ |
| A glue-free card tray | Settings → *Joints* → *Corners* → *Slit lock* | Settings → **No glue** |
| Fewer sheets | *Nest*, then *Save material*, read its plan | **Use less board** |

### 10.3 The rail and its cards

| Action | Its card today | Its card after |
| --- | --- | --- |
| **Box** (`B`) | *Rectangle · Regular · Rounded · Round*, sides, corner radius; *Bottom: Base · Snap-lock · Tuck* (card and corrugated rectangles) | **Shape:** the same four, as pictures, with sides or corner radius under the one chosen. **Kind:** *Open box · With a lid · Carton*, as pictures. *With a lid* makes the box and its default lid in the one ✓. *Carton* is a tube with a tuck top and a bottom that snaps shut; greyed with the reason on plywood and on other footprints (*A carton folds from card or corrugated, on a rectangle*). The last kind used is remembered. |
| **Wall / lid** (`W`) | A wall on a free edge; on a box's top edge, a board across the top joined with the design's joint | Walls as today. **A ghost that would close a box makes the box's lid** (§10.4): its label reads *Closes the box: a lid that lifts off* (or *hinged*), and ✓ runs `setBoxLid`. It can no longer glue a box shut. |
| **Divider** (`D`), **Standing board** (`D D`) | As built in milestone 70 | Unchanged |
| **Hole** (`H`) | Circle, rectangle, rounded rectangle | Unchanged. (Ready-made cut-outs such as a finger hole or a handle, from `PACKAGING_AND_LEARNING.md` milestone 48, would be a second tab here, as stickers are for text.) |
| **Text & stickers** (`T`) | Text or a sticker | Unchanged |

There is **no Line tool** in Quick build: line types are engineering. Lines made in Workshop show; they can be selected, moved and deleted, and their card offers *More…*.

### 10.4 One lid

The box's card gets one section, **Lid**, in place of milestone 71's two buttons, milestone 68's *Top* list and (in Quick build) the lid's own closure section. Selecting the lid shows the same section.

- **Lid:** *None · Lifts off · Hinged*, as pictures. *More…* adds *Arched* and *Fixed*.
- **Locks:** *None · 1 · 2 · 3* (plywood; greyed on card and corrugated with *A padlock needs plywood*).
- **Open / Close.**

What each choice makes, by material (`boxLid(d, trayId)` reads it, `setBoxLid(d, trayId, kind)` makes it, both in a new `src/easy/lid.ts`):

| Choice | Card | Corrugated | Plywood |
| --- | --- | --- | --- |
| *Lifts off* (the default) | Telescoping lid (71) | Telescoping lid | Telescoping lid |
| *Hinged* | Folded lid with a tuck flap (67) | Folded lid with a tab lock (67) | Pin hinge (milestone 75). Until then, and under *More…* after, the living hinge where the box is large enough, else greyed with the reason. |
| On a *Carton* | Tuck top (68), the only choice besides *None* | The same | — |

- `setBoxLid` is one undo step. It removes the lid the box has and makes the new one. Shapes and text on the old lid's top are carried to the new one by their distance from its centre; what no longer fits is listed, as `regenerate` lists what it cannot keep.
- A carton's card also keeps **Bottom:** *Snaps shut · Tucks in · Flaps to glue*, as pictures. *Base: Open (a tube)* is not shown: *Carton* means it.
- What stays automatic, with *More…* to reach it: the closure's style within a kind, lip length, dust flaps, thumb notch, the hinge's fit, the hasp's hole size, the telescoping lid's rim height.

### 10.5 The feature table (`src/easy/features.ts`)

Rows to add. *auto* means the control is hidden and the default applies; a board made with a hidden feature shows read-only with *More…*, as today.

| Feature | Controls | Quick build |
| --- | --- | --- |
| `lid` | The *Lid* section: kind, locks, open | show |
| `lid.advanced` | *Arched*, *Fixed*, closure style, lip, dust flaps, thumb notch, fit, hole size, rim | auto |
| `tray.ends` | *Base*, *Top*, *Bottom* lists (68) | hide: *Kind* and *Lid* replace them; *Bottom* shows as pictures on a carton |
| `tray.corners` | *Rounded corners* join, *Closing seam* (64), *Curved walls held to the base by* (65) | auto |
| `bend` | *Bend radius*, *Pattern*, *Lines* (63, 66) | auto |
| `edgeFlap` | *Add a flap* on a free edge (67) | hide |
| `match` | *Match top with*, *Own outline*, *Copy outline from* (71) | hide |
| `split` | A fold's *Automatic · Keep whole · Cut here*; *Split a net into pieces* in the drawer (69) | auto (*Only when it must*) |
| `yield` | The yield line's cut length, pieces and glue joints (69) | hide: the sheet meter in the top bar already says sheets and percent |
| `saveBoard` | *Nest* and *Save material* (69) | show, as one button, **Use less board** (§10.6) |
| `joints.noGlue` | *Slit lock* for corners and flaps (68) | show, as one switch, **No glue**, in the settings card's *Joints* (card and corrugated) |
| `export.kerf` | *Nominal · Compensated* | auto: nominal, with the class profile's kerf shown under *More…* |
| `lines` | The Line tool and a line's type (Part B) | hide the tool; lines show and can be moved and deleted |
| `crease` | A fold's crease style, *Creases on the back* (79) | auto |
| `library` | *Your designs*, *Duplicate*, the project menu's list (80–81) | show |
| `project.cutAll` | *The whole project* in the download dialog (81) | show, when the design is in a project |
| `sizes` | The *Sizes* table (82) | hide |
| `plan.dims` | *Dimensions* on the cut plan (83) | show |
| `export.annotations` | *Add names and sizes (guide layer)* (83) | auto: off |
| `export.spec` | *Print a plan* (84) | show |

### 10.6 The top bar, the cut plan and the download

- **Top bar:** unchanged but for the menu by the design's name, which gains *Your designs* and *Duplicate*.
- **Cut plan:** *Repack*, **Use less board** and *Dimensions*. *Use less board* runs the nester, then looks for folds to cut (`planSaveMaterial`), and shows one popover: *Now 2 sheets. Can be 1 sheet, with 3 more glue joints.* with *Do it* and *Leave it*. When nothing helps it says so (*This is already the least board*).
- **Download:** *SVG · DXF*, **Print a plan** (the spec sheet, from milestone 84), and *Download*. Kerf is nominal; the line under it says where the kerf is set (*Kerf 0.15 mm is set on the laser*).
- **Ready to cut** is unchanged. With one lid per box it no longer passes a box that cannot be opened, because Quick build cannot make one.

### 10.7 Plain words

| Workshop says | Quick build says |
| --- | --- |
| *Telescoping lid* | *Lifts off* |
| *Closure*, *Tuck flap*, *Tab lock* | *Hinged* lid (the style is automatic) |
| *Snap-lock (1-2-3)* · *Tuck flap* · *Four flaps* (bottom) | *Snaps shut* · *Tucks in* · *Flaps to glue* |
| *Base: Open (a tube)* | not shown (*Carton*) |
| *Slit lock (no glue)* | *No glue* |
| *Nest*, *Save material* | *Use less board* |
| *Width* / *Height* of a footprint, *Tray height* | *Width · Depth · Height* |
| *Panel 6* | *Lid* |

### 10.8 If levels are built

`PACKAGING_AND_LEARNING.md` milestone 45 proposes levels (*Guided · Open · Workshop*) in place of the two modes, with each feature in a group that can be unlocked. This part is written so that it holds either way:

- **With two modes** (today): the table's states are Quick build's.
- **With levels:** they are *Guided*'s, and each row names its group: `lid.advanced`, `tray.corners`, `joints.noGlue` → `joints`; `bend`, `crease`, `split`, `edgeFlap` → `folds`; `lines` → `ops`; `match` → `outline`; `sizes`, `export.annotations`, `export.kerf`, `yield` → a new group, `production`. *Open* would then show the Line tool, per-joint choices and *Sizes* without the rest of Workshop.

Milestone 73 does not need levels and does not block them.

---

## 11. Milestones

Each is shippable on its own and ends as the others in `PROGRESS.md` do: unit suite, typecheck, golden exports (byte-identical unless the change is intended and listed), the app's browser suite, English and Hebrew strings, `README.md`, `DECISIONS.md` and `EASY_MODE.md` updated. **Each milestone after 73 adds its own rows to the feature table** (§10.5) and its Quick build browser spec.

| # | Milestone | Done when |
| --- | --- | --- |
| **73** | **Quick build catches up.** §10 with what milestones 61–72 already built: the Box card's *Kind*; the *Lid* section over the existing lids (`boxLid`, `setBoxLid`; on plywood *Lifts off*, and *Hinged* by living hinge where it fits); *Wall / lid* makes the box's lid; the feature rows for 61–72; **No glue**; **Use less board**; the download dialog; plain words and names; the test of rule 3. No model change. | In Quick build: a plywood box with a lid is one drag and ✓, and its lid lifts off; *Wall / lid* across a box's top never makes a finger-jointed lid; a carton's card shows *Lid* and *Bottom* and no other list; nothing in §10.5's hide and auto rows is on screen. Workshop is unchanged. Golden exports byte-identical. |
| **74** | **Lids recognised, and opening a lid.** §3.1, §3.4: a lid whatever its joint, `fixed`, `lidPose` for every lid kind, *Open / Close*. | Every lid kind opens and closes on the stage and shows what is inside; an old file with a finger-jointed lid opens unchanged, reads *Fixed* in Workshop, and can be made hinged or replaced. |
| **75** | **The pin hinge**, after its spike (§3.2). *Hinged* on plywood in Quick build becomes the pin hinge. | A hinged plywood box exports clean; the three spike sizes open past 100° and close flat; the assembly view places the lid before the second side wall. |
| **76** | **Hasps and the Escape box mission.** §3.3, *Locks* in the *Lid* section, the mission. | A box with one, two and three hasps exports clean, on a telescoping lid and on a hinged one; an 8 mm rod passes each cut hasp above the lid; the mission's goals tick off on the path a student takes. |
| **77** | **Lines in the engine.** §5.1, §5.2: `Panel.lines`, clipping, dashes, the material's dash numbers, checks, SVG and DXF. Made through `ops` only; no tool yet. | Goldens for each type, straight and arced. Every existing golden byte-identical. An open DXF line reads back as one polyline in the Python check. |
| **78** | **The Line tool.** §6. | A slit, a curved crease and a perforation drawn in 3D and in the cut plan; a line drawn across a carton's folds becomes one line per board and moves as one. In Quick build the line shows, moves and deletes, and there is no tool for it. |
| **79** | **How a fold is made.** §5.3: crease styles per joint and design-wide, creases on the back. | A corrugated tray with cut-crease folds exports dashes on the CUT layer and no score there; a mountain fold lands on `SCORE_BACK` when asked, and nowhere new when not. |
| **80** | **The library.** §7.1, the start screen's grid, duplicate, rename, delete and restore, the two-tab notice. | A browser with a design from before the change opens it as the first entry; ten designs list from `meta` without loading one of them; a design changed in a second tab is not overwritten. |
| **81** | **Projects.** §7.2: groups, the project file, the menu, *Cut the whole project*, *Compare*. | A project of three designs saves to one file and opens in another browser; a single-design file still submits to a class; a two-material project batches into two sets of sheets. |
| **82** | **Sizes.** §7.3. | A tuck carton with a window and three sizes: each size's lid closes, the window stays centred, each exports under its own name; a change to the master shows in every size. A box with a telescoping lid sizes with its lid. |
| **83** | **Dimensions on the dieline.** §9: `annotate`, the legend, the cut plan toggle, the guide-layer option, the defects. | A reverse-tuck carton's chain sums to its blank size to 0.05 mm; a hexagonal tray falls back to per-board sizes; files exported without the option are byte-identical to today's. |
| **84** | **The spec sheet**, fitted to a page and at actual size on several. | A4 and A3 pages at a stated scale, in English and Hebrew; printing gives one page per piece kind; the tiled print measures true with a ruler. |
| **85** | **Final verification** in the usual form: everything re-run, `PROGRESS.md` complete, limitations listed, what needs the owner listed (real cuts of the hinge and hasp, LightBurn's reading of `SCORE_BACK` and of guide text, Safari, a Chromebook, a class trying Quick build). | — |

Order: 73 first. Then 74 → 75 → 76; 77 → 78 → 79; 80 → 81 → 82; 83 → 84. The four runs are independent, except that 83's legend lists 77's line types (if D is built first, the legend has *Cut* and *Crease* only). If time is short: 73, 74, 76 on telescoping lids only, 77–78, 80 and 83 are the core; 75, 79, 81–82 and 84 can follow.

## 12. Tests to add

- `quickTable.test.ts` (rule 3): every section a card can render names a feature, and every feature in the table is used; the list of features shown in Quick build is a snapshot, so adding one is a visible change in review.
- `boxLid.test.ts`: `boxLid` reads each lid kind; `setBoxLid` from each kind to each other, per material, is one step and leaves no board or joint of the old lid; shapes on the lid's top are carried or listed; *Wall / lid* across a box's top gives the same design as the *Lid* section.
- `lids.test.ts` (extends the packaging branch's): a lid is recognised with each joint; an old finger-jointed lid reads `fixed` with unchanged geometry; the closure goes when the lid is pulled short and returns with its settings; each kind's pose at 0 and 1.
- `pinHinge.test.ts`: the pin, ear, shoulder and relief sizes from §3.2's formulas; **a sweep of the lid from 0° to 100° in 2° steps with no overlap** between the lid's solid and the walls' (the solids the tests already build in `tests/solid.ts`).
- `hasp.test.ts`: the tongue clears the lid; the hole's lowest point is above the lid; on a telescoping lid the rim's fingers leave the slot's stretch and the web holds; one to three placed evenly.
- `lines.test.ts`: dash layout (ends, arcs, a line shorter than one dash); clipping at the outline and at holes; `val.lineSplits`; open lines untouched by kerf compensation; a cut-plan stroke split at folds maps back to the right boards.
- `creases.test.ts`: styles per joint; the design-wide choice per material; `SCORE_BACK` only when asked.
- `library.test.ts` (with `fake-indexeddb`, a dev dependency): migration from `current-design`; `meta` kept in step with `designs`; delete and restore; the version raised with a store already present.
- `sizes.test.ts`: `applySize` leaves the master untouched; a sealing lid seals in every size; anchors (centred stays centred, edge distance kept); a sweep of sizes up and back returns the same design, ids included (the harness of `PACKAGING_PLAN.md` §11).
- `annotate.test.ts`: chains sum to the blank size; the fallback for non-parallel folds; a glue area for every glue joint and none for locks; label text outlines stay inside their piece.
- Goldens: a box with a telescoping lid and a hasp, a hinged box with a hasp, each line type, a cut-crease tray, an annotated carton, a spec sheet.
- Browser specs: one per milestone on the path a student takes, in Quick build wherever the feature is there; for 73, each row of §10.2 in English and Hebrew, at 1400 and 1024 px.
- The idempotence and sweep fuzzers run over designs with lids, hasps and lines; `tests/fuzz/quick.test.ts` gains *Kind* and *Lid*.

## 13. Decisions still open (defaults; change them here before work starts)

| # | Topic | Default |
| --- | --- | --- |
| 1 | The Box action's *Kind* | *Open box · With a lid · Carton*, the last used remembered; a new browser starts on *Open box*. |
| 2 | A lid across a box's top in **Workshop** | Keeps the grow card's joint (*Fixed* on plywood). Quick build never makes one. |
| 3 | *Hinged* on plywood before the pin hinge exists | The living hinge where the box is large enough, else greyed. |
| 4 | Hasp hole | 8 mm, with 6 and 10 under *More…*. |
| 5 | A lift-off lid with one hasp | One at the front, unless the spike shows it tilts off; then two. |
| 6 | The Line tool in Quick build | Not on the rail. |
| 7 | Dash lengths | The table in §5.2, per material, editable in the drawer. |
| 8 | Deleted designs | Kept 30 days. |
| 9 | Sizes on designs with more than one box | Not offered. |
| 10 | Spec sheet output | Browser print and SVG; no PDF library. |
| 11 | Annotations in the laser file | Off by default. |
| 12 | Levels or two modes | Not decided here (`PACKAGING_AND_LEARNING.md` §6.1). §10.8 holds either way. |
| 13 | Who owns the overlap with `PACKAGING_AND_LEARNING.md` | As §16 proposes. |
| 14 | Names in the UI | *Open box*, *With a lid*, *Carton*, *Lifts off*, *Hinged*, *Fixed*, *Locks*, *No glue*, *Use less board*, *Line*, *Crease*, *Perforation*, *Cut-crease*, *Guide*, *Your designs*, *Project*, *Sizes*, *Print a plan*. Hebrew to be reviewed by a native speaker. |

## 14. Risks

1. **The pin hinge's fit.** It depends on real kerf and real plywood. Hence the spike before the milestone, the sweep test, and *Fit* on the card. If it cannot be made reliable, plywood keeps the telescoping lid and the living hinge, hasps go on those, and the pin hinge is listed as later.
2. **Changing a lid's kind loses work.** A lid's top is a different board in each kind. Guard: shapes are carried by their place on the top, what cannot be kept is listed before ✓, and it is one undo step.
3. **Lid recognition that surprises.** A board that happens to cover a box becomes a lid. Guard: only a board grown from a tray wall's top edge, only when it reaches the opposite wall, and the ghost says what it will make before ✓, as closures do today.
4. **Quick build hides something a class already uses.** Milestone 73 hides controls that have been visible since 61–72 (bend radius, closure details, the carton lists). Guard: every one is still under *More…*, a design that uses one opens unchanged, and the README lists what moved.
5. **Lines against the rest of the engine.** A cut line near a joint weakens it, and a line on a board whose outline changes can end up outside it. Guard: clipping at build time, the web check, and lines moving with their board's outline as shapes do.
6. **Dashes in the file size.** A long perforation is hundreds of short lines. DXF writes each as a `LINE` today; measure a worst case (a tear strip round a 600 mm carton) before deciding whether more is needed.
7. **Browser storage is not a backup.** A cleared browser loses the library. Guard: the persistence request, *Save project* in the menu, and a line under *Your designs* saying where designs are kept.
8. **Sizes and free editing.** A shape anchored to an edge can land badly at an extreme size. Guard: each size is checked and named in the message; the limit to one box.
9. **Schema.** `Panel.lines`, `Design.sizes`, `Tray.hasps`, `Connection.crease` and the new `Closure` fields are optional, so no migration and one schema bump (for `check.ts` to know them). The Worker reads submissions with the app's code, so it must be deployed with the app, as for every schema change.
10. **Size.** Thirteen milestones. The core named in §11 is seven.

## 15. Left for later

- **Sliding lids and drawers:** a groove needs two layers of board.
- **A flush lift-off lid** (the lid's own notches over wide fingers on the walls, no rim): the telescoping lid covers the need.
- **Hasps on corrugated,** if a class asks: flutes tear round a hole, so it needs its own test.
- **Fold along a drawn line:** turning a straight crease that runs from edge to edge into a real fold (the board becomes two, joined by a `fold`). Today a drawn crease is a mark.
- **Tear strip in one action:** two perforations and a pull tab, from one line.
- **A game-parts generator** (token and tile sheets with numbering): item 5 of the review, not in this plan.
- **Handing a class a starter design**, and library sync between devices: both need the server. `PACKAGING_AND_LEARNING.md` milestone 53 (teacher-written briefs) covers the first.

## 16. Relation to other branches and plans

| Branch or plan | Relation |
| --- | --- |
| `PACKAGING_PLAN.md` (61–72, built, `claude/loving-johnson-uk02v0`) | The base. Part A extends its closures and lids (`closures.ts`, `lid.ts`, `ClosureUI.tsx`, `CornersUI.tsx`). Part B's dash generator is separate from bend patterns (`bendPatterns.ts`), which stay as they are. Part D reuses `yieldReport`. Part E gives its controls their Quick build rows. |
| `PACKAGING_AND_LEARNING.md` (plan, `claude/busy-pascal-9rlxzv`) | Written from `main`, so it plans some things the packaging branch has built, and some this plan covers. Row by row below. Its milestone numbers (44–55) collide with the parked branches (44–48) and waffle (49–60); renumber it after 85 when it is built. |
| ↳ its 46 (closures) and 47 (tube nets) | **Already built** as packaging 67 and 68, on a different model (`Design.closures` and `Tray.base: 'open'`, not `Panel.flaps` and a second unfolding strategy). Its findings D1 and D3 do not hold on the packaging branch: a tuck carton built there in Quick build is one tube with one glue seam. Drop both, keeping only 46's check *This lid has nothing holding it shut*, which §10.6 makes unnecessary in Quick build and which Workshop could still use. |
| ↳ its 44 (first-minute fixes) | Complementary; build it before or beside 73. Two of its items are done here in 73 instead: the names (*Lid*, *Depth*) and the download dialog. The rest stays there: the start screen's first question, rail labels, one hint, reasons on greyed buttons, the top bar at 1024 px. |
| ↳ its 45 (levels) | Independent of this plan (§10.8). It decides how features are grouped; this plan decides what *Guided* contains. |
| ↳ its 48 (styles) and 49 (start from the product) | Not in this plan. *Kind: With a lid* and *Carton* (§10.3) are the Box action's two built-in styles; a style library would sit on the start screen beside it. Its *Lift-off lid box* style is milestone 71's telescoping lid. |
| ↳ its 50, 51, 53 (briefs, guardrails, teacher briefs) | Not in this plan. The *Escape box* mission (76) becomes a brief when 50 exists. |
| ↳ its 52 (journal, variants, reflection, feedback) | Its *variants* are this plan's duplicates in a project with *Compare* (§7.2): use the library, not a second store (`kv/variants`). The journal, reflection and feedback stay there. |
| ↳ its 54 (dieline output) | **Replaced by Part D**, which takes its always-visible legend and 1 : 1 print. Its artwork guide (face templates, a preview texture) stays there, or with `PACKAGING_PLAN.md` §14.5. |
| `PRESETS_PLAN.md` | Its organiser's *hinged lid* on plywood ("a slot hinge") becomes this plan's pin hinge, and its lift-off lid is the telescoping lid. Its settings card is where *Sizes* would sit for a preset. |
| `IMAGES_ON_BOARDS.md` | Shares the IndexedDB version bump (§7.1) and open lines (§5.1). Its print pieces would get names and sizes from `annotate` for free. Its *Images* toggle needs a row in the feature table like everything else (rule 3). |
| `claude/waffle-mode` | Independent. A waffle design is one more design in the library. |

## References in the code

| For | Read |
| --- | --- |
| Lid recognition and closures | `reachFor`, `sealOf`, `closureStyles`, `reconcileClosures`, `archLids` in `src/model/closures.ts`; `src/ui/ClosureUI.tsx` |
| Telescoping lids | `placeLid`, `reconcileLids`, `lidOn` in `src/model/lid.ts`; `addLid`, `addArchedLid` in `src/model/ops.ts`; `TrayLids`, `TrayEnds` in `src/ui/CornersUI.tsx` |
| Finger and tab geometry | `connectionGeomOne`, `cornerTabs`, `fingerCountFor` in `src/model/seams.ts` |
| Quick build | `QUICK_ACTIONS` in `src/easy/QuickRail.tsx`; `boxFootprintGo`, `extrudeGo` in `src/easy/actions.ts`; `wallRecipe`, `boxRecipe` in `src/easy/recipes.ts`; `src/easy/features.ts`; `workshopOnly` in `src/easy/mode.ts`; `src/easy/missions.ts`; `EASY_MODE.md` |
| Cards that need feature rows | `src/ui/BendUI.tsx`, `ClosureUI.tsx`, `CornersUI.tsx`, `SplitUI.tsx`, `MatchSection` in `Inspector.tsx`, `ExportDialog.tsx` |
| Poses in 3D | `foldDisplay`, `flapMatrix` in `src/views/foldView.ts`; `src/easy/assemble.ts` |
| Open contours in pieces and files | `pathContour`, `foldBand`, `groupPieces` in `src/model/pieces.ts`; `src/export/svg.ts`, `src/export/dxf.ts`; `compensatePiece` in `src/export/prepare.ts` |
| Drawing by clicking points | `src/views/polyTool.tsx` |
| Autosave and the project file | `src/store/persist.ts`, `src/store/hooks.ts`, `src/model/serialize.ts` |
| Batching designs onto shared sheets | `batchExport` in `src/export/batch.ts` |
| Nesting and saving board | `nest` in `src/model/nest.ts`; `planSaveMaterial`, `yieldReport` in `src/model/split.ts` |
| Resizing | `setPanelSize`, `setTrayHeight` in `src/model/ops.ts`; `regenerate` in `src/templates/registry.ts` |
| Labels on the guide layer | `pieceLabel` in `src/export/label.ts`; `src/export/layers.ts` |
| Piece geometry for dimensions | `PieceCopy`, `pieceCopies` in `src/model/pack.ts`; `NetPanel` in `src/model/pieces.ts`; `clearSpans` in `src/model/measure.ts` |
