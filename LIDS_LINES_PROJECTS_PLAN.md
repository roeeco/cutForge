# CutForge: lids, lines, projects, dieline sheets, and Quick build revised: plan (milestones 73–86)

Planning notes from 2026-11-17, revised 2026-11-18. **Status: plan only, nothing built.**

This plan covers the first four items of the gap review of 2026-11-17 (a packaging designer's view, and a pedagogy student's view: escape boxes, props, game sets), a revision of Quick build so that it carries them, and the owner's addition of 2026-11-18:

1. Lids (Part A):
   - **a lid of its own, generated for a box where one is possible, in several kinds, in both modes** (added 2026-11-18);
   - a plywood lid that hinges and locks.
2. A line tool with line types: cut, crease, perforation (Part B).
3. A project that holds several designs, with duplicate and sizes (Part C).
4. A labelled, dimensioned dieline export (Part D).
5. Quick build revised to fit milestones 61–72 and Parts A–D, and kept simple (Part E).

**Start from `main` at `c841816`.** It holds the packaging plan (milestones 61–72, merged as pull request 7) and the maintenance round after it. This branch has `main` merged in, so every code reference below is to the tree beside this file. Milestone numbers start at 73 (`main` ends at 72; the unmerged waffle branch uses 49–60).

**What changed in this plan since it was first written:**
- *17 Nov:* the packaging branch finished. Its milestone 71 added a telescoping lid (*Add a lid* on a box's card), so Part A uses that lid and no longer invents a lift-off lid.
- *17 Nov:* a second plan was committed, `PACKAGING_AND_LEARNING.md` (`claude/busy-pascal-9rlxzv`, its milestones 44–55), written from the old `main`. §16 says what of it is already built, what this plan takes over and what stays there.
- *18 Nov:* `main` moved to `c841816`. The maintenance round fixed three things this plan had listed (the export dialog's piece count, *1 pieces*, boards named by number in check messages) and put a lid's closure style on its card in Quick build on purpose; both are taken into account below.
- *18 Nov:* generated lids added (§3.2, milestones 74–75). Milestones renumbered to 73–86.

## 1. What was found (the evidence for each part)

| # | Finding | Evidence |
| --- | --- | --- |
| A | **One kind of separate lid, made by a button, with no conditions.** A box's card has *Add a lid*: a shallow tray turned over on the box (milestone 71). There is no flat lid, no lid that fits inside, and the lid is not offered while the box is being made. Nothing stops it on a box with an open side or walls of different heights. | `addLid` in `src/model/ops.ts` checks only that the tray exists and has no lid; `placeLid` (`src/model/lid.ts`) sets it at `box.height`. `TrayLids` in `src/ui/CornersUI.tsx`. |
| A | **The other way to make a lid cannot open.** Quick build's *Wall / lid* on a plywood box's back wall makes a lid finger-jointed on all four edges, with no closure on its card. | Driven in the browser at `b7a4ac0`: the lid's joints were `finger` to the back, front, left and right walls. Unchanged on `main`: `sealOf` (`src/model/closures.ts`) only accepts a lid whose own joint is a `fold`; `closureStyles('plywood')` is `['rest']`; `wallRecipe` (`src/easy/recipes.ts`) grows with the design's joint. |
| A | **Nothing locks, and plywood has no hinge but the living hinge.** No hasp, padlock hole or hinge pin anywhere. | No such geometry in `src/model`. |
| A | **A lid cannot be opened on screen.** The fold slider unfolds the whole net; there is no way to open one lid and look inside. | `foldDisplay(d, foldT)` takes one number for the design. |
| B | **Every shape is closed.** There is no way to draw a crease, a slit or a perforation. | `DetailShape` is `rect, roundrect, circle, text, path, polygon`; the polygon tool always closes; SVG import drops open lines (`openDropped`). |
| B | **A fold is always one score line.** Perforations exist only inside bend bands. A fold's direction (`foldDir`, valley or mountain) can be set on the joint's card and changes the dash in the 3D fold view, but the cut plan and the file treat both the same. | `foldBand` in `src/model/pieces.ts` emits `op: 'score'`; `foldDir` is read in `Connections.tsx` and `foldView.ts` (`Bend.mountain`) and nowhere in `pieces.ts` or `src/export`. |
| C | **One design per browser.** | `src/store/persist.ts`: one IndexedDB key, `current-design`. *New* replaces it. |
| D | **The dieline has no dimensions and the file no labels.** | The cut plan draws panel names only. A snap-lock carton's exported SVG held two groups (`SCORE`, `CUT`) and 13 paths. The GUIDE layer is used only for a teacher batch's names and the kiss-score note (`src/export/label.ts`). |
| D | **Names.** A lid is *Panel 6*, and a telescoping lid's parts are *Panel 2* and *Wall 1…4*. A box's footprint is labelled *Width / Height*, and a carton's uncut footprint is called *Base*. | `panelLabel` in `src/model/names.ts` knows template lids only (`t:lid…`); `insp.height`. |
| E | **Quick build has not kept up with milestones 61–72.** Their controls were added to the shared cards with no row in the feature table, so Quick build shows all of them. | On `main`, `BendUI.tsx`, `ClosureUI.tsx`, `CornersUI.tsx` and `SplitUI.tsx` call `useFeature` nowhere. Seen in Quick build on a card carton: *Base: Open (a tube)*, *Top* and *Bottom* lists on the box's card; the yield line, *Nest* and *Save material* over the cut plan; the kerf choice in the download dialog. The same holds for *Bend radius*, *Pattern* and *Lines* on a folded board, a closure's lip, dust flaps and thumb notch, *Match top with*, and *Add an arched lid*. (A closure's *style* is on the lid's card in Quick build by decision: `PACKAGING_PLAN.md` decision 8. It stays.) |

## 2. Decisions (defaults; §13 lists the ones the owner should confirm)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Order | E's first milestone (73) comes first: it needs no model change and fixes what students see today. Then A → B → C → D. C is independent and can be built in parallel. D comes after B so its legend knows the line types. |
| 2 | Generated lids | **A box can be given a lid of its own in four kinds:** *Cap*, *Flat*, *Inset*, *Drop-in*. Each is offered only where it can be made, greyed with the reason and a fix otherwise. *Automatic* picks one by material. The lid is made with the box or added later, in both modes, and follows the box afterwards. |
| 3 | A lid in Quick build | **A lid made in Quick build always opens.** It lifts off unless the student chooses *Hinged*. *Wall / lid* can no longer glue a box shut. Workshop keeps the joint chosen on the grow card. |
| 4 | Hinges for plywood | **A pin hinge** (the lid's own tabs turning in round holes in the side walls) and the existing **living hinge**. No bought hardware. Sliding lids need a groove, so two layers: later (§15). |
| 5 | Locks | **A staple through the lid:** a tongue on the front wall's top edge with a hole for a padlock above the lid. One to three of them. Plywood only. |
| 6 | Lines | **Their own list on a board** (`Panel.lines`), not a new `Detail` shape. A drawn crease is a mark: it does not fold the board in 3D. |
| 7 | Line types | *Cut*, *Crease*, *Perforation* (tears), *Cut-crease* (folds), *Guide* (never cut). Dashes are made at export from two numbers per material. |
| 8 | Library | **Designs live in the browser**, in IndexedDB, as today. No accounts, no server storage. A project is a named group of designs, saved as one file. |
| 9 | Sizes | **Derived, not copied.** A size is a row of numbers applied to the master on demand, so a change to the master reaches every size. Called *Sizes*, not *variants*: `PACKAGING_AND_LEARNING.md` uses *variant* for an alternative design kept for comparison, which here is a duplicate in the same project. |
| 10 | Dimensioned output | **Annotations on the GUIDE layer** of the laser file (a tick, off by default), and a **spec sheet** printed from the browser (so *Save as PDF* works) or downloaded as SVG. No PDF library. Trade PDFs with spot colours stay in `PACKAGING_PLAN.md` §14.6. |
| 11 | Quick build | **The rail does not grow.** New abilities go on the card of the thing they belong to, as one question with pictures. Every engineering control added since milestone 41 gets a row in the feature table. |

---

# Part A: lids (milestones 74–77)

## 3. The model

### 3.1 The lids a box can have

| Lid | Model today | Opens | This plan |
| --- | --- | --- | --- |
| **Of its own** (lifts off) | *Cap* only: a second tray on the box, `Tray.lidOf` (milestone 71) | yes | Four kinds, generated (§3.2). Gains hasps (§3.4) and the open pose (§3.5). |
| **Folded** (card, corrugated) | A board folded off a wall's top with a closure, `Design.closures` (67); a carton's `Tray.top` (68) | yes | Unchanged. Gains the open pose. |
| **Arched** | `archLids` (71) | yes | Unchanged. |
| **Grown with a plywood joint** | A board grown from a wall's top with `finger` or `tabslot` | **no** | Recognised as a lid, named *Fixed*, and offered a hinge. |
| **Hinged on pins** (plywood) | — | yes | New (§3.3). |

- **A grown lid is recognised by what it does, not by its joint.** Today `sealOf` needs the lid's own connection to be a `fold`. Change: a lid is a board grown from a tray wall's top edge whose far edge reaches the opposite wall (`reachFor` already finds that wall and the side walls), whatever its joint.
- `ClosureStyle` gains `hinge` (the pin hinge) and `fixed` (the joints the board was grown with). `closureStyles('plywood')` becomes `['hinge', 'rest', 'fixed']`.
- **Old files open unchanged:** a sealing plywood lid with finger or tab joints and no stored closure reads as `fixed`, and its geometry is what it is today. Nothing to migrate.
- The living hinge stays what it is (a `fold` with a radius, milestone 63) and is offered beside the pin hinge as *Hinged, one piece (living hinge)*, greyed with the reason when the box is too small for the material's radius.

### 3.2 A lid of its own, generated

#### The four kinds

| Kind | What it is | Pieces | Card | Corrugated | Plywood | Footprints |
| --- | --- | --- | --- | --- | --- | --- |
| **Cap** (exists) | A shallow tray turned over on the box, a wall and a clearance wider all round. Its rim is *Shallow* (12 mm, today's), *Half* or *Full* (the box's height: a shoebox lid). | top and rim | ✓ | ✓ | ✓ | any walled footprint, round ones included |
| **Flat** | One board lying on the walls' tops, a few millimetres wider than the box all round, held in place by tabs on the walls' top edges that pass through slots in it. | 1 | — | ✓ | ✓ | needs two straight walls that are not in line |
| **Inset** | A board flush with the box's outside, with a low rim under it that drops inside the walls. | top and rim | — | ✓ | ✓ | any whose inside is at least 20 mm across |
| **Drop-in** | One board inside the walls, resting on the dividers, with a finger hole. The contents are held down and the walls stand above the lid. | 1 | ✓ | ✓ | ✓ | any; needs dividers |

Why the two dashes on card: 0.5 mm tabs do not hold a lid, and a folded rim cannot stand in from its board's edge. On card the *Cap* does both jobs.

#### How each is made, from what exists

- **Cap:** `addLid`, as it is. The rim choice sets its tray's height (`addLid` already takes `rim`).
- **Flat:** a board placed as `placeLid` places a cap's top, with a gap of `defaultOffset(d, 'tabslot')` (3 mm on 3 mm plywood: the web a slot needs, and a lip to lift the lid by) and lying on the walls' tops, not turned over. Each straight wall of 30 mm or more gets the joint a divider's end already has, an edge on a face by `tabslot` (`faceFit` and `cornerTabs` in `src/model/seams.ts`): tabs on the wall's top edge, slots in the lid, one tab under 80 mm and two above, flush with the lid's top. Two new fields on that connection:
  - `fit?: number`: the clearance used in place of the joint clearance (0.3 mm by default against 0.1), so the lid lifts.
  - `loose?: true`: never glued. It is not counted as a glue joint, it is assembled last, and it parts in the open pose.
- **Inset:** the cap's code with two differences: its top is the box's outline, not grown, and its rim stands in from the top's edge by the box's wall and the fit (`Tray.inset`). Tab-and-slot walls already stand in from their base's edge by `defaultOffset`; this sets that distance. Rim 10 mm.
- **Drop-in:** a board whose outline is the box's inside less the fit (`insideOutline(d, tray)`: the base's outline moved in to the walls' inner faces, by `grownPts` with a negative gap), placed on the dividers' tops. A 20 mm finger hole at its centre, moved aside when a divider runs under it.

Stored, beside what milestone 71 stores: `Tray.lidKind?: 'cap' | 'inset'` on the lid's tray (absent: `cap`, so old files are unchanged), and `Panel.lidOf?: { tray: string; kind: 'flat' | 'dropin' }` on a one-board lid. `reconcileLids` (`src/model/lid.ts`) keeps all four on their box. One reader, `boxLid(d, trayId)` (§10.4), hides where each is stored.

#### When a lid can be generated

`lidChoices(d, trayId)` returns every kind with `ok`, or with a reason and, where there is one, a fix. The picker lists all four and greys the ones that cannot be made, as the bend pattern picker does. Today `addLid` checks none of this.

| Reason | Line on the card | Fix offered |
| --- | --- | --- |
| The box has an open side | *A lid needs walls all round* | *Wall it* |
| The walls' tops are not level (a wall with its own height, a gable, a slanted or matched top) | *The walls' tops are not level* | *Make the walls one height* |
| The box closes another way (a carton's top flaps, a hinged or arched lid) | *This box closes with its flaps* | — (choosing a kind replaces it, §10.4) |
| Flat or Inset on card | *On card, use the Cap* | *Cap* |
| Flat on a round box (one wall, no straight sides) | *A round box's lid needs a rim* | *Cap* |
| Inset on a box under 20 mm inside | *Too small for a rim inside* | *Cap* |
| Drop-in with no dividers, or dividers less than the lid's thickness below the walls' tops | *Needs dividers at least 3 mm lower than the walls* | *Lower the dividers by 3 mm* |
| The lid's board does not fit the sheet | *The lid is larger than the sheet* | — (a net is cut to fit; a single board is reported, as today) |

#### Automatic

- **Which kind:** the first that can be made, in the material's order. Plywood: *Flat*, then *Cap*. Corrugated: *Cap*, then *Flat*. Card: *Cap*. (*Flat* first on plywood because it is one board and no glue, where a cap is five boards and eight finger joints.)
- **Made with the box:** Quick build's Box · *With a lid* (§10.3), and Workshop's Extrude card, which gains *Lid: None · Automatic · Cap · Flat · Inset · Drop-in* as pictures. One ✓ makes the box and its lid, one undo step.
- **Added later:** the box's card, in both modes (§4, §10.4).
- **Kept in step on every solve:** the lid follows the box's outline, size, wall thickness, clearance and height. It takes the box's material unless it is given its own. Its copies to cut follow the box's.
- **Never re-planned silently** (`PACKAGING_PLAN.md` §4.6 rule 5): *Automatic* chooses once, when the lid is made. If the box later changes so that its lid's kind cannot be made (a wall gets its own height; the last divider is deleted under a drop-in lid), the lid stays, the export check says so (`val.lidKind`, with the reason from the table), and its *Fix* offers the kind *Automatic* would choose now.
- **Its own piece:** the lid is cut as its own piece or pieces and named *Lid*, *Lid rim* (`src/model/names.ts`).

### 3.3 The pin hinge

All of it is in-plane geometry on three boards, so it fits `ConnGeom` (`adds`, `holes`, `edges`) with no new machinery. The lid lies on the walls' tops, flush with their outer faces. Starting geometry, for thickness t and clearance c:

- **Pins:** each of the lid's side edges carries a tab t wide and t + 1 long, centred t/2 from the lid's back edge. Its cross-section is t × t, so it turns in a round hole of diameter `√2·t + 2c + 0.2`.
- **Ears:** each side wall gets a rounded ear on its top edge at the back: a disc of radius `hole/2 + 3` about the pin's axis (which is t/2 above the wall's top), joined to the wall. The round top is what lets the lid's shoulders swing past.
- **Shoulders:** the lid is cut back by `t + c` along each side from its back edge to 1 mm past the ear, so it sits between the ears there and on top of the side walls further forward.
- **Relief:** the lid's lower back corner swings 0.21·t below the wall top, so the back wall's top is lowered by `0.21·t + 0.3` under the lid (0.9 mm at 3 mm).
- **Assembly order:** the pins are captured between the side walls, so the lid goes in before the second side wall. *Show how it goes together* (`src/easy/assemble.ts`) must place it then, and never glue it.

**These numbers are set by a spike before milestone 76**, as the snap-lock bottom's were: cut three boxes (80 × 60 × 40, 150 × 100 × 60, 250 × 180 × 80 mm) in 3 mm plywood. Adjust until each opens past 100°, stays open, closes flat and does not bind. The numbers and their limits go into `DECISIONS.md`. If the back-wall relief reads badly, the alternative is to move the axis behind the back wall (ears that reach back past the corner); the spike decides. **The same spike cuts a Flat lid and an Inset lid** on each size, to set the lid fit (0.3 mm to start).

### 3.4 The hasp

A tongue on the front wall's top edge passes up through the lid; a padlock goes through the tongue's hole above the lid. The tongue is `hole + 2·web` wide (web = max(4, t + 1)) and rises to `1 + hole + web` above the lid's top face, with a round hole whose lowest point is 1 mm above the lid. Hole 8 mm by default (6, 8, 10 on the card: a luggage padlock's shackle is 3–4 mm, a classroom padlock's 5–6).

| Lid | Where the tongue passes |
| --- | --- |
| **Flat** | It is one of the lid's locating tabs, grown tall. Nothing else changes. |
| **Hinged on pins, or resting** (flush with the wall's outer face) | A notch in the lid's front edge, the tongue's size plus 0.3 mm each side. A hinged lid's front edge moves back as it rises, away from the tongue, so the notch needs no extra room. |
| **Cap** | A closed slot in the lid's top, over the box's wall. That wall lies `t + c` in from the lid's edge, exactly where the rim's finger notches are, so the rim's joint leaves that stretch to the lid: it is generated in two ranges either side of the tongue (`connectionGeomOne` already takes a range), and between them the lid's top runs to its edge. |
| **Inset** | The same closed slot, with the rim under it interrupted for the tongue's width. |
| **Drop-in, folded, arched** | No hasp (the lid is inside the walls, or is card). |

- **How many:** one, two or three, spread along the front (*three locks, three puzzles* is the escape-box case).
- Stored where the lid's other settings are: `hasps?: { n: 1 | 2 | 3; hole: number }` on the closure of a grown lid, on the lid's tray, or in `Panel.lidOf`.
- Checks: `val.haspThin` (the web round a hole or beside a slot is below the material's minimum), `val.haspBlocked` (a shape on the lid in the padlock's way).
- **Part of the spike:** whether a lift-off lid locked at the front can be tilted off at the back. A cap's or an inset lid's rim, and a flat lid's back tabs, should stop that; where one does not on the largest size, that kind gets a second hasp at the back by default.

### 3.5 Opening a lid on screen

- View state, not design: `openLids: Record<string, number>` in the store (0 closed, 1 open), cleared on reload.
- `lidPose(d, lid, k)` gives the lid's matrix: a lift of 1.5 × the box's height (a lid of its own, its rim with it), a turn about the pin axis (`hinge`), the band's own unrolling (living hinge), or a turn about the crease (folded lids, with their lip and dust flaps). `foldDisplay` (`src/views/foldView.ts`) applies it to the lid and to everything built on it. A `fixed` lid has no pose.
- A round **Open / Close** badge on the lid on the stage, and the same on the box's card. Objects placed inside (*What goes inside*) are then visible.

## 4. In the interface

One section, **Lid**, on a box's card in both modes, in place of milestone 71's two buttons. Selecting the lid shows the same section. `boxLid` reads what the box has; `setBoxLid(d, trayId, choice)` makes or changes it in one undo step (§10.4).

| | Quick build | Workshop |
| --- | --- | --- |
| **While making the box** | Box · *Kind: With a lid* makes the automatic lid | The Extrude card's *Lid* row: *None · Automatic* and every kind |
| **Lid** | *None · Lifts off · Hinged* | The same, with *Arched* and *Fixed* |
| **Style** (under *Lifts off*) | The four kinds as pictures, the automatic one chosen, the others greyed with their reason and fix | The same |
| **Sizes** | — (*More…*) | Cap: rim *Shallow · Half · Full* or a number. Flat: lip, tabs per wall. Inset: rim. Drop-in: finger hole. All: fit. |
| **Locks** | *None · 1 · 2 · 3* | The same, with the hole size |
| **Open / Close** | ✓ | ✓ |
| **A grown lid** | Cannot be made glued shut | Its card shows its closure (`src/ui/ClosureUI.tsx`); one grown with fingers shows *Fixed*, with *Make it hinged* and *Replace with a lid of its own* |

- **A mission, *Escape box*** (`src/easy/missions.ts`): a plywood box with goals *the lid opens*, *it takes a padlock*, *a clue is engraved inside*, *fits one sheet*, *ready to cut*. If briefs are built (`PACKAGING_AND_LEARNING.md` milestone 50) it is written as one, with nothing ticked on arrival.
- **Templates:** the organiser's *Lift-off lid* parameter (`src/templates/organiser.ts`, its own shallow tray) is left as it is. Moving it onto the generator is a preset matter (`PRESETS_PLAN.md`).

---

# Part B: lines and line types (milestones 78–80)

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

### 5.3 How a fold is made (milestone 80)

- `Connection.crease?: 'score' | 'perf' | 'cutcrease'` on fold joints (and a lid's hinge), absent meaning `score`. The design-wide choice sits with the other joint choices, per material (`DesignJoints.crease`). Defaults do not change, so every golden export stays byte-identical.
- The score lines a joint contributes (`ConnGeom.scores`, `FoldStrip.scores`) carry their connection, and `groupPieces` turns them into dashes on the CUT layer when the style asks.
- **Mountain folds.** A score works best on the outside of a fold. Creases whose `foldDir` is `mountain` go on their own layer, `SCORE_BACK` (a fifth LightBurn colour), when *Creases on the back* is ticked in the export dialog; a second, mirrored file for the back of the sheet reuses what kiss scores already do (`kissPanels` and the *THIS SIDE UP* label in `src/export/prepare.ts`). Off by default: one file, one side, as today.

## 6. In the interface (Workshop)

- **The Line tool** (`L`) on Workshop's rail. Click points; double-click or Enter ends the line; Esc cancels; Backspace removes the last point. Shift holds 15° steps, typing a number sets a segment's length (both as the polygon tool does). It is a mode of the code in `src/views/polyTool.tsx` that does not close, with a rail button of its own, as Round and Rounded now have.
- Its card: the five types, each with a picture of its line, as the shape card's operations have.
- **It waits for ✓** like everything else, and one ✓ is one undo step.
- **Editing:** a selected line shows its points. Drag a point; **+** on a segment adds one; Delete removes one; drag a segment's middle to bow it into an arc (double-click the middle to straighten it). The gizmo moves and turns it. Ctrl+C, Ctrl+V and Ctrl+D work as for shapes.
- **Snapping:** ends snap to the board's edges and corners, to fold lines, to other lines' ends and to shapes, through the existing snap code with the line's box and points.
- **Selection:** a new kind, `{ kind: 'line', id, ids }`. The export check's messages select it.
- **In the cut plan, a line drawn across folds** is split at each fold into one line per board (each segment mapped back through the piece's `NetPanel.xf`), with one `group`. That is how a tear strip runs round a carton.
- **3D:** lines are drawn on the board's faces by the code that draws shape outlines (`DetailLines`), dashed for the dashed types.
- **Quick build** has no Line tool (§10.3).

---

# Part C: projects (milestones 81–83)

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
- **Which designs can have sizes:** a template design (its parameters), or a design with exactly one box (a lid of its own counts as part of its box). Otherwise the control is greyed with the reason (*Sizes need one box; this design has 3. Use Duplicate*).
- **What follows a size:**
  - Walls follow the base, as they do on any resize. A lid of its own follows its box already (`reconcileLids`).
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

# Part D: the dieline as a document (milestones 84–85)

## 9. What is drawn, and where

One function, `annotate(d, copies, placements, t)`, returns annotations in sheet coordinates. Two renderers use it: the cut plan (SVG with real text) and the export.

| Annotation | From | Notes |
| --- | --- | --- |
| **Board names** | `panelLabel` | As the cut plan shows them today. |
| **Blank size** | each piece's box | Overall width × height, outside the piece. |
| **Dimension chains** | the piece's fold lines and outer edges (`PieceCopy.panels` and each board's edges) | Along the bottom and the left side, crease to crease. Only when every fold in the piece is parallel to the piece's box; otherwise each board gets *w × h* under its name. |
| **Glue areas** | `ConnGeom.flaps3d` of the joints the yield report counts as glued | A dashed outline where the flap lands on the other board, and the word *glue* on the flap. Slit locks, tucks and `loose` lid joints get none. |
| **Grain or flute arrow** | `MaterialProfile.grain` and the piece's turn on the sheet | One per piece; none when the material has no grain. |
| **Fold direction** | `Connection.foldDir` | Spec sheet only: valley dashed, mountain dash-dot, by convention. |
| **Line legend** | the types the design uses | *Cut*, *Crease*, *Perforation*, *Cut-crease*, *Guide*, with the dash lengths. |
| **Title block** | the design and `yieldReport` | Name, date, material and thickness, blank size, clear inside size (`clearSpans`), pieces, glue joints, metres of cut, kerf mode. |

- **In the cut plan:** the line legend is always in the corner (it is small, and it says what red and blue mean). A *Dimensions* toggle beside *Repack* turns on sizes, glue areas and the arrow (remembered per browser, as `viewPrefs.dims` is for 3D).
- **In the laser file:** *Add names and sizes (guide layer)* in the export dialog, off by default so today's files do not change. Text is outlined with `outlineText`, as `src/export/label.ts` does, because LightBurn must not need the font. Dimension lines are plain lines. Everything is on GUIDE, whose output is off.
- **The spec sheet:** one page per kind of piece, drawn as large as fits A4 or A3 landscape with its scale stated (*1 : 2*; *1 : 1* when it fits), dimensions and glue areas on, the title block and legend at the foot. It is an SVG with real text (Rubik, already bundled; Hebrew set right to left). *Print* opens it in a print view (`@page` sized to the sheet) so the browser's *Save as PDF* gives a PDF; *Download SVG* gives the file.
- **Actual size, on several pages:** the same sheet at 1 : 1, tiled across A4 or A3 pages with 10 mm overlap marks, fold lines dashed, for a paper mock-up before board is used.
- **Numbers** use the student's precision (`DISPLAY_PRECISION_STUDENT`, 0.1 mm) and `fmtNum`, so Hebrew and English agree with the cards.
- Board names in annotations are the labels the editor shows, as the maintenance round made check messages (`issueVars`).

The always-visible legend and the 1 : 1 print come from `PACKAGING_AND_LEARNING.md` milestone 54, which this part replaces except for its artwork guide (§16).

---

# Part E: Quick build, revised (milestone 73, and a row in each later one)

## 10. Quick build

### 10.1 Rules

`EASY_MODE.md`'s decisions stand: expression stays open, engineering is automatic, everything is a ghost that ✓ makes, the same design opens in both modes. Five rules are added so that Quick build stays small as the engine grows:

1. **The rail does not grow.** Select and six actions, as today. A new ability goes on the card of the thing it belongs to.
2. **One question per thing, in a student's words, answered with pictures.** At most four choices in a row; the rest is under *More…*.
3. **Every control has a row in the feature table.** A test fails when a card section has none (§12), so the next engine milestone cannot leak into Quick build unnoticed.
4. **One way to make each thing.** The same lid whichever way it was asked for.
5. **Nothing made in Quick build needs Workshop to work.** A lid opens; a carton closes; a file is ready to cut.

### 10.2 What a student can make, and how many choices it takes

| To make | Steps today | Steps after |
| --- | --- | --- |
| An open box, any footprint | Box, drag, ✓ | The same |
| A box with a lid that lifts off | Box, drag, ✓; select the base; *Add a lid* on its card | Box · *With a lid*, drag, ✓ |
| The same with another kind of lid | Not possible (one kind) | …then *Style* on its card: one click |
| A hinged, lockable plywood box | Not possible | Box · *With a lid*, drag, ✓; *Lid: Hinged*; *Locks: 1* |
| A carton that closes | Box · *Bottom: Snap-lock*, drag, ✓ | Box · *Carton*, drag, ✓ |
| A glue-free card tray | Settings → *Joints* → *Corners* → *Slit lock* | Settings → **No glue** |
| Fewer sheets | *Nest*, then *Save material*, read its plan | **Use less board** |

### 10.3 The rail and its cards

| Action | Its card today | Its card after |
| --- | --- | --- |
| **Box** (`B`) | *Rectangle · Regular · Rounded · Round* (a 2 × 2 grid), sides, corner radius; *Bottom: Base · Snap-lock · Tuck* (card and corrugated rectangles) | **Shape:** the same four, as pictures, with sides or corner radius under the one chosen. **Kind:** *Open box · With a lid · Carton*, as pictures. *With a lid* makes the box and its automatic lid (§3.2) in the one ✓. *Carton* is a tube with a tuck top and a bottom that snaps shut; greyed with the reason on plywood and on other footprints (*A carton folds from card or corrugated, on a rectangle*). The last kind used is remembered. |
| **Wall / lid** (`W`) | A wall on a free edge; on a box's top edge, a board across the top joined with the design's joint | Walls as today. **A ghost that would close a box makes the box's lid** (§10.4): its label reads *Closes the box: a lid that lifts off* (or *hinged*), and ✓ runs `setBoxLid`. It can no longer glue a box shut. |
| **Divider** (`D`), **Standing board** (`D D`) | As built in milestone 70 | Unchanged |
| **Hole** (`H`) | Circle, rectangle, rounded rectangle | Unchanged. (Ready-made cut-outs such as a finger hole or a handle, from `PACKAGING_AND_LEARNING.md` milestone 48, would be a second tab here, as stickers are for text.) |
| **Text & stickers** (`T`) | Text or a sticker | Unchanged |

There is **no Line tool** in Quick build: line types are engineering. Lines made in Workshop show; they can be selected, moved and deleted, and their card offers *More…*.

### 10.4 One lid

The box's card gets one section, **Lid** (§4). In Quick build it is three rows, each of pictures:

- **Lid:** *None · Lifts off · Hinged*.
- **Style**, under *Lifts off*: *Cap · Flat · Inset · Drop-in*. The automatic one is chosen; one that cannot be made is greyed, and tapping it shows its reason and its fix (§3.2). From milestone 74; in milestone 73 *Lifts off* is the cap.
- **Locks:** *None · 1 · 2 · 3* (plywood; greyed on card and corrugated with *A padlock needs plywood*, and on a drop-in lid).
- **Open / Close.**

What *Hinged* and a carton's lid make, by material:

| Choice | Card | Corrugated | Plywood |
| --- | --- | --- | --- |
| *Hinged* | Folded lid with a tuck flap (67) | Folded lid with a tab lock (67) | Pin hinge (milestone 76). Until then, and under *More…* after, the living hinge where the box is large enough, else greyed with the reason. |
| On a *Carton* | Tuck top (68), the only choice besides *None* | The same | — |

- `boxLid(d, trayId)` reads what the box has and `setBoxLid(d, trayId, choice)` makes it, both in a new `src/easy/lid.ts` used by both modes. `setBoxLid` is one undo step: it removes the lid the box has and makes the new one. Shapes and text on the old lid's top are carried to the new one by their distance from its centre; what no longer fits is listed, as `regenerate` lists what it cannot keep.
- A folded lid's closure *style* stays on its card (`PACKAGING_PLAN.md` decision 8, kept by the maintenance round).
- A carton's card also keeps **Bottom:** *Snaps shut · Tucks in · Flaps to glue*, as pictures. *Base: Open (a tube)* is not shown: *Carton* means it.
- What stays automatic, with *More…* to reach it: a cap's rim, a flat lid's lip and tabs, the fit, the finger hole, a closure's lip length, dust flaps and thumb notch, the hasp's hole size.

### 10.5 The feature table (`src/easy/features.ts`)

Rows to add. *auto* means the control is hidden and the default applies; a board made with a hidden feature shows read-only with *More…*, as today.

| Feature | Controls | Quick build |
| --- | --- | --- |
| `lid` | The *Lid* section: lid, style, locks, open; a folded lid's closure style | show |
| `lid.advanced` | *Arched*, *Fixed*, rim, lip, tabs, fit, finger hole, a closure's lip, dust flaps and thumb notch, hole size | auto |
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
| `crease` | A fold's crease style, *Creases on the back* (80) | auto |
| `library` | *Your designs*, *Duplicate*, the project menu's list (81–82) | show |
| `project.cutAll` | *The whole project* in the download dialog (82) | show, when the design is in a project |
| `sizes` | The *Sizes* table (83) | hide |
| `plan.dims` | *Dimensions* on the cut plan (84) | show |
| `export.annotations` | *Add names and sizes (guide layer)* (84) | auto: off |
| `export.spec` | *Print a plan* (85) | show |

### 10.6 The top bar, the cut plan and the download

- **Top bar:** unchanged but for the menu by the design's name, which gains *Your designs* and *Duplicate*.
- **Cut plan:** *Repack*, **Use less board** and *Dimensions*. *Use less board* runs the nester, then looks for folds to cut (`planSaveMaterial`), and shows one popover: *Now 2 sheets. Can be 1 sheet, with 3 more glue joints.* with *Do it* and *Leave it*. When nothing helps it says so (*This is already the least board*).
- **Download:** *SVG · DXF*, **Print a plan** (the spec sheet, from milestone 85), and *Download*. Kerf is nominal; the line under it says where the kerf is set (*Kerf 0.15 mm is set on the laser*).
- **Ready to cut** is unchanged. With one lid per box it no longer passes a box that cannot be opened, because Quick build cannot make one.

### 10.7 Plain words

| Workshop says | Quick build says |
| --- | --- |
| *Telescoping lid*, *Add a lid* | *Lifts off* · *Cap* |
| *Closure* | *Hinged* lid (its style keeps its name: *Tuck flap*, *Tab lock*) |
| *Snap-lock (1-2-3)* · *Tuck flap* · *Four flaps* (bottom) | *Snaps shut* · *Tucks in* · *Flaps to glue* |
| *Base: Open (a tube)* | not shown (*Carton*) |
| *Slit lock (no glue)* | *No glue* |
| *Nest*, *Save material* | *Use less board* |
| *Width* / *Height* of a footprint, *Tray height* | *Width · Depth · Height* |
| *Panel 6*; *Panel 2*, *Wall 1* of a lid | *Lid*; *Lid*, *Lid rim* |

The four lid kinds keep one name in both modes (*Cap*, *Flat*, *Inset*, *Drop-in*): their pictures carry the meaning.

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
| **73** | **Quick build catches up.** §10 with what `main` already has: the Box card's *Kind*; the *Lid* section over the existing lids (`boxLid`, `setBoxLid`; *Lifts off* is the cap; *Hinged* on plywood by living hinge where it fits); *Wall / lid* makes the box's lid; the feature rows for 61–72; **No glue**; **Use less board**; the download dialog; plain words and names; the test of rule 3. No model change. | In Quick build: a plywood box with a lid is one drag and ✓, and its lid lifts off; *Wall / lid* across a box's top never makes a finger-jointed lid; a carton's card shows *Lid* and *Bottom* and no other list; nothing in §10.5's hide and auto rows is on screen. Workshop is unchanged but for the *Lid* section replacing two buttons. Golden exports byte-identical. |
| **74** | **The lid generator.** §3.2: `lidChoices` with reasons and fixes, *Automatic*, the *Flat* lid, the cap's rim choices, the *Style* row in both modes, the Extrude card's *Lid* row, `val.lidKind`, names. | A plywood box made *With a lid* gets a flat lid in one ✓ and a card box a cap; every reason in §3.2's table is produced by a test and cleared by its fix; a flat lid's tabs are flush with its top and it follows the box through a resize, a material change and a wall thickness change; old files with a cap lid open unchanged. Goldens for a flat lid in plywood and corrugated, and a full-rim cap. |
| **75** | **Two more lids, and opening one.** §3.2's *Inset* and *Drop-in*; §3.1's recognition of grown lids and `fixed`; §3.5's `lidPose` and *Open / Close*. | An inset lid's rim clears the walls by the fit all round, on a rectangle, a hexagon and a rounded box; a drop-in lid rests on the dividers and its finger hole misses them; every lid kind opens and closes on the stage; an old file with a finger-jointed lid opens unchanged and reads *Fixed*. |
| **76** | **The pin hinge**, after its spike (§3.3). *Hinged* on plywood in Quick build becomes the pin hinge. | A hinged plywood box exports clean; the three spike sizes open past 100° and close flat; the assembly view places the lid before the second side wall. The spike's lid fit is written into `DECISIONS.md`. |
| **77** | **Hasps and the Escape box mission.** §3.4, *Locks* in the *Lid* section, the mission. | A box with one, two and three hasps exports clean on a flat, a cap, an inset and a hinged lid; an 8 mm rod passes each cut hasp above the lid; the mission's goals tick off on the path a student takes. |
| **78** | **Lines in the engine.** §5.1, §5.2: `Panel.lines`, clipping, dashes, the material's dash numbers, checks, SVG and DXF. Made through `ops` only; no tool yet. | Goldens for each type, straight and arced. Every existing golden byte-identical. An open DXF line reads back as one polyline in the Python check. |
| **79** | **The Line tool.** §6. | A slit, a curved crease and a perforation drawn in 3D and in the cut plan; a line drawn across a carton's folds becomes one line per board and moves as one. In Quick build the line shows, moves and deletes, and there is no tool for it. |
| **80** | **How a fold is made.** §5.3: crease styles per joint and design-wide, creases on the back. | A corrugated tray with cut-crease folds exports dashes on the CUT layer and no score there; a mountain fold lands on `SCORE_BACK` when asked, and nowhere new when not. |
| **81** | **The library.** §7.1, the start screen's grid, duplicate, rename, delete and restore, the two-tab notice. | A browser with a design from before the change opens it as the first entry; ten designs list from `meta` without loading one of them; a design changed in a second tab is not overwritten. |
| **82** | **Projects.** §7.2: groups, the project file, the menu, *Cut the whole project*, *Compare*. | A project of three designs saves to one file and opens in another browser; a single-design file still submits to a class; a two-material project batches into two sets of sheets. |
| **83** | **Sizes.** §7.3. | A tuck carton with a window and three sizes: each size's lid closes, the window stays centred, each exports under its own name; a change to the master shows in every size. A box with a lid of its own sizes with its lid. |
| **84** | **Dimensions on the dieline.** §9: `annotate`, the legend, the cut plan toggle, the guide-layer option; *Footprint* for a carton's uncut base. | A reverse-tuck carton's chain sums to its blank size to 0.05 mm; a hexagonal tray falls back to per-board sizes; files exported without the option are byte-identical to today's. |
| **85** | **The spec sheet**, fitted to a page and at actual size on several. | A4 and A3 pages at a stated scale, in English and Hebrew; printing gives one page per piece kind; the tiled print measures true with a ruler. |
| **86** | **Final verification** in the usual form: everything re-run, `PROGRESS.md` complete, limitations listed, what needs the owner listed (real cuts of the lids, hinge and hasp, LightBurn's reading of `SCORE_BACK` and of guide text, Safari, a Chromebook, a class trying Quick build). | — |

Order: 73 first. Then 74 → 75 → 76 → 77; 78 → 79 → 80; 81 → 82 → 83; 84 → 85. The four runs are independent, except that 84's legend lists 78's line types (if D is built first, the legend has *Cut* and *Crease* only), and 77's hasps can ship on the lids of 74 alone if 75 and 76 are late. If time is short: 73, 74, 77 on flat and cap lids, 78–79, 81 and 84 are the core; 75, 76, 80, 82–83 and 85 can follow.

## 12. Tests to add

- `quickTable.test.ts` (rule 3): every section a card can render names a feature, and every feature in the table is used; the list of features shown in Quick build is a snapshot, so adding one is a visible change in review.
- `lidKinds.test.ts`: for each kind, material and footprint (rectangle, hexagon, rounded, circle): `lidChoices` says what §3.2's tables say; each reason is produced and its fix clears it; *Automatic* picks by material; the lid's outline and place against closed forms (a flat lid's slots over the walls' tops with the web kept; an inset rim a fit inside the walls; a drop-in board a fit inside and on the dividers); the lid follows the box through a resize, a material change and a thickness change and comes back the same after a sweep (ids included); a lid's joints are `loose` and not counted as glue; `val.lidKind` when the box stops allowing its lid, and never a silent change of kind.
- `boxLid.test.ts`: `boxLid` reads each lid; `setBoxLid` from each to each other, per material, is one step and leaves no board or joint of the old lid; shapes on the lid's top are carried or listed; *Wall / lid* across a box's top gives the same design as the *Lid* section; Quick build and Workshop make the same design from the same choice.
- `lids.test.ts` (extends `main`'s): a grown lid is recognised with each joint; an old finger-jointed lid reads `fixed` with unchanged geometry; the closure goes when the lid is pulled short and returns with its settings; each kind's pose at 0 and 1.
- `pinHinge.test.ts`: the pin, ear, shoulder and relief sizes from §3.3's formulas; **a sweep of the lid from 0° to 100° in 2° steps with no overlap** between the lid's solid and the walls' (the solids the tests already build in `tests/solid.ts`).
- `hasp.test.ts`: the tongue clears the lid; the hole's lowest point is above the lid; a flat lid's hasp is one of its tabs; on a cap the rim's fingers leave the slot's stretch and the web holds; one to three placed evenly.
- `lines.test.ts`: dash layout (ends, arcs, a line shorter than one dash); clipping at the outline and at holes; `val.lineSplits`; open lines untouched by kerf compensation; a cut-plan stroke split at folds maps back to the right boards.
- `creases.test.ts`: styles per joint; the design-wide choice per material; `SCORE_BACK` only when asked.
- `library.test.ts` (with `fake-indexeddb`, a dev dependency): migration from `current-design`; `meta` kept in step with `designs`; delete and restore; the version raised with a store already present.
- `sizes.test.ts`: `applySize` leaves the master untouched; a sealing lid seals in every size; anchors (centred stays centred, edge distance kept); a sweep of sizes up and back returns the same design, ids included (the harness of `tests/harness.ts`).
- `annotate.test.ts`: chains sum to the blank size; the fallback for non-parallel folds; a glue area for every glue joint and none for locks or loose lids; label text outlines stay inside their piece.
- Goldens: a flat lid, a full-rim cap, an inset lid, a drop-in lid, a hinged box with a hasp, each line type, a cut-crease tray, an annotated carton, a spec sheet.
- Browser specs: one per milestone on the path a student takes, in Quick build wherever the feature is there; for 73, each row of §10.2 in English and Hebrew, at 1400 and 1024 px; for 74, the same lid made in each mode.
- The idempotence and sweep fuzzers run over designs with lids of every kind, hasps and lines; `tests/fuzz/quick.test.ts` gains *Kind*, *Lid* and *Style*.

## 13. Decisions still open (defaults; change them here before work starts)

| # | Topic | Default |
| --- | --- | --- |
| 1 | Which lid *Automatic* makes | Plywood: *Flat*. Corrugated and card: *Cap*. The alternative is *Cap* everywhere (what *Add a lid* makes today). |
| 2 | The four kinds | *Cap*, *Flat*, *Inset*, *Drop-in*. A sleeve and a sliding lid are left for later (§15). |
| 3 | A flat lid's lip | The slot's web (3 mm on 3 mm plywood), which also gives a grip. |
| 4 | The Box action's *Kind* | *Open box · With a lid · Carton*, the last used remembered; a new browser starts on *Open box*. |
| 5 | A lid across a box's top in **Workshop** | Keeps the grow card's joint (*Fixed* on plywood). Quick build never makes one. |
| 6 | *Hinged* on plywood before the pin hinge exists | The living hinge where the box is large enough, else greyed. |
| 7 | Hasp hole | 8 mm, with 6 and 10 under *More…*. |
| 8 | A lift-off lid with one hasp | One at the front, unless the spike shows it tilts off; then two. |
| 9 | What Quick build hides from 61–72 | §10.5. A closure's style stays on its card (decided); bend radius, closure details and the carton lists move under *More…*. |
| 10 | The Line tool in Quick build | Not on the rail. |
| 11 | Dash lengths | The table in §5.2, per material, editable in the drawer. |
| 12 | Deleted designs | Kept 30 days. |
| 13 | Sizes on designs with more than one box | Not offered. |
| 14 | Spec sheet output | Browser print and SVG; no PDF library. |
| 15 | Annotations in the laser file | Off by default. |
| 16 | Levels or two modes | Not decided here (`PACKAGING_AND_LEARNING.md` §6.1). §10.8 holds either way. |
| 17 | Who owns the overlap with `PACKAGING_AND_LEARNING.md` | As §16 proposes. |
| 18 | Names in the UI | *Open box*, *With a lid*, *Carton*, *Lifts off*, *Hinged*, *Fixed*, *Cap*, *Flat*, *Inset*, *Drop-in*, *Automatic*, *Locks*, *No glue*, *Use less board*, *Line*, *Crease*, *Perforation*, *Cut-crease*, *Guide*, *Your designs*, *Project*, *Sizes*, *Print a plan*. Hebrew to be reviewed by a native speaker. |

## 14. Risks

1. **A lid that does not fit.** Lift-off lids live on a few tenths of a millimetre. Guard: one `fit` number per lid with a stated default, the spike cuts every kind on three sizes before the numbers are fixed, and the bend test's neighbour in the drawer could gain a lid-fit coupon if the spike shows the need.
2. **The inset rim uses a wall offset the engine has only used at one value.** Tab-and-slot walls stand in by `defaultOffset`; an inset lid asks for more. Guard: a test on rectangle, hexagon and rounded footprints before the interface is built; if corners do not close at the larger offset, *Inset* ships for rectangles first, greyed elsewhere with the reason.
3. **The pin hinge's fit.** It depends on real kerf and real plywood. Hence the spike before the milestone, the sweep test, and *Fit* on the card. If it cannot be made reliable, plywood keeps its lift-off lids and the living hinge, hasps go on those, and the pin hinge is listed as later.
4. **Changing a lid's kind loses work.** A lid's top is a different board in each kind. Guard: shapes are carried by their place on the top, what cannot be kept is listed before ✓, and it is one undo step.
5. **Lid recognition that surprises.** A board that happens to cover a box becomes a lid. Guard: only a board grown from a tray wall's top edge, only when it reaches the opposite wall, and the ghost says what it will make before ✓, as closures do today.
6. **Quick build hides something a class already uses.** Milestone 73 hides controls that have been visible since 61–72 (bend radius, closure details, the carton lists). Guard: every one is still under *More…*, a design that uses one opens unchanged, and the README lists what moved.
7. **Lines against the rest of the engine.** A cut line near a joint weakens it, and a line on a board whose outline changes can end up outside it. Guard: clipping at build time, the web check, and lines moving with their board's outline as shapes do.
8. **Dashes in the file size.** A long perforation is hundreds of short lines. DXF writes each as a `LINE` today; measure a worst case (a tear strip round a 600 mm carton) before deciding whether more is needed.
9. **Browser storage is not a backup.** A cleared browser loses the library. Guard: the persistence request, *Save project* in the menu, and a line under *Your designs* saying where designs are kept.
10. **Sizes and free editing.** A shape anchored to an edge can land badly at an extreme size. Guard: each size is checked and named in the message; the limit to one box.
11. **Schema.** `Panel.lines`, `Panel.lidOf`, `Tray.lidKind`, `Tray.inset`, `Design.sizes`, `Connection.fit`, `Connection.loose`, `Connection.crease` and the new `Closure` fields are optional, so no migration and one schema bump (for `check.ts` to know them). The Worker reads submissions with the app's code, so it must be deployed with the app, as for every schema change.
12. **Size.** Fourteen milestones. The core named in §11 is seven.

## 15. Left for later

- **A sleeve** (a tube the box slides into): it is a tube lying on its side, and trays stand on the floor.
- **Sliding lids and drawers:** a groove needs two layers of board.
- **A drop-in lid without dividers,** resting on ledges glued inside the walls.
- **Hasps on corrugated,** if a class asks: flutes tear round a hole, so it needs its own test.
- **Fold along a drawn line:** turning a straight crease that runs from edge to edge into a real fold (the board becomes two, joined by a `fold`). Today a drawn crease is a mark.
- **Tear strip in one action:** two perforations and a pull tab, from one line.
- **A game-parts generator** (token and tile sheets with numbering): item 5 of the review, not in this plan.
- **Handing a class a starter design**, and library sync between devices: both need the server. `PACKAGING_AND_LEARNING.md` milestone 53 (teacher-written briefs) covers the first.

## 16. Relation to other branches and plans

| Branch or plan | Relation |
| --- | --- |
| `PACKAGING_PLAN.md` (61–72, built, in `main`) | The base. Part A extends its closures and lids (`closures.ts`, `lid.ts`, `ClosureUI.tsx`, `CornersUI.tsx`). Part B's dash generator is separate from bend patterns (`bendPatterns.ts`), which stay as they are. Part D reuses `yieldReport`. Part E gives its controls their Quick build rows. |
| `PACKAGING_AND_LEARNING.md` (plan, `claude/busy-pascal-9rlxzv`) | Written from the old `main`, so it plans some things `main` now has, and some this plan covers. Row by row below. Its milestone numbers (44–55) are all used; renumber it after 86 when it is built. |
| ↳ its 46 (closures) and 47 (tube nets) | **Already built** as packaging 67 and 68, on a different model (`Design.closures` and `Tray.base: 'open'`, not `Panel.flaps` and a second unfolding strategy). Its findings D1 and D3 do not hold on `main`: a tuck carton built there in Quick build is one tube with one glue seam. Drop both, keeping only 46's check *This lid has nothing holding it shut*, which §10.6 makes unnecessary in Quick build and which Workshop could still use. |
| ↳ its 44 (first-minute fixes) | Complementary; build it before or beside 73. Two of its items are done here in 73 instead: the names (*Lid*, *Depth*) and the download dialog. The maintenance round already did a third (the top bar between 1000 and 1180 px). The rest stays there: the start screen's first question, rail labels, one hint, reasons on greyed buttons. |
| ↳ its 45 (levels) | Independent of this plan (§10.8). It decides how features are grouped; this plan decides what *Guided* contains. |
| ↳ its 48 (styles) and 49 (start from the product) | Not in this plan. *Kind: With a lid* and *Carton* (§10.3) are the Box action's two built-in styles; a style library would sit on the start screen beside it. Its *Lift-off lid box* style is a box with a generated lid (§3.2). |
| ↳ its 50, 51, 53 (briefs, guardrails, teacher briefs) | Not in this plan. The *Escape box* mission (77) becomes a brief when 50 exists. |
| ↳ its 52 (journal, variants, reflection, feedback) | Its *variants* are this plan's duplicates in a project with *Compare* (§7.2): use the library, not a second store (`kv/variants`). The journal, reflection and feedback stay there. |
| ↳ its 54 (dieline output) | **Replaced by Part D**, which takes its always-visible legend and 1 : 1 print. Its artwork guide (face templates, a preview texture) stays there, or with `PACKAGING_PLAN.md` §14.5. |
| `PRESETS_PLAN.md` | Its organiser's *hinged lid* on plywood ("a slot hinge") becomes this plan's pin hinge, and its lift-off lid can be a generated one. Its settings card is where *Sizes* would sit for a preset. |
| `IMAGES_ON_BOARDS.md` | Shares the IndexedDB version bump (§7.1) and open lines (§5.1). Its print pieces would get names and sizes from `annotate` for free. Its *Images* toggle needs a row in the feature table like everything else (rule 3). |
| `claude/waffle-mode` | Independent. A waffle design is one more design in the library. |

## References in the code

| For | Read |
| --- | --- |
| Lids of their own | `placeLid`, `grownPts`, `lidGap`, `reconcileLids`, `lidOn` in `src/model/lid.ts`; `addLid`, `addArchedLid`, `defaultOffset` in `src/model/ops.ts`; `TrayLids`, `TrayEnds` in `src/ui/CornersUI.tsx`; `tests/lids.test.ts` |
| Tabs through a face, and joints over a range | `faceFit`, `cornerTabs`, `connectionGeomOne`, `seamKinds`, `fingerCountFor` in `src/model/seams.ts` |
| A box's inside | `clearBox` in `src/model/dividers.ts`; `compartments` in `src/easy/objects.ts`; `clearSpans` in `src/model/measure.ts` |
| Lid recognition and closures | `reachFor`, `sealOf`, `closureStyles`, `reconcileClosures`, `archLids` in `src/model/closures.ts`; `src/ui/ClosureUI.tsx` |
| Quick build | `QUICK_ACTIONS` in `src/easy/QuickRail.tsx`; `boxFootprintGo`, `extrudeGo` in `src/easy/actions.ts`; `wallRecipe`, `boxRecipe` in `src/easy/recipes.ts`; `src/easy/features.ts`; `workshopOnly` in `src/easy/mode.ts`; `src/easy/missions.ts`; `EASY_MODE.md` |
| Cards that need feature rows | `src/ui/BendUI.tsx`, `ClosureUI.tsx`, `CornersUI.tsx`, `SplitUI.tsx`, `MatchSection` in `Inspector.tsx`, `ExportDialog.tsx` |
| Names | `panelLabel`, `issueVars` in `src/model/names.ts` |
| Poses in 3D | `foldDisplay`, `flapMatrix` in `src/views/foldView.ts`; `src/easy/assemble.ts` |
| Open contours in pieces and files | `pathContour`, `foldBand`, `groupPieces` in `src/model/pieces.ts`; `src/export/svg.ts`, `src/export/dxf.ts`; `compensatePiece` in `src/export/prepare.ts` |
| Drawing by clicking points | `src/views/polyTool.tsx` |
| Autosave and the project file | `src/store/persist.ts`, `src/store/hooks.ts`, `src/model/serialize.ts` |
| Batching designs onto shared sheets | `batchExport` in `src/export/batch.ts` |
| Nesting and saving board | `nest` in `src/model/nest.ts`; `planSaveMaterial`, `yieldReport` in `src/model/split.ts` |
| Resizing | `setPanelSize`, `setTrayHeight` in `src/model/ops.ts`; `regenerate` in `src/templates/registry.ts` |
| Labels on the guide layer | `pieceLabel` in `src/export/label.ts`; `src/export/layers.ts` |
| Piece geometry for dimensions | `PieceCopy`, `pieceCopies` in `src/model/pack.ts`; `NetPanel` in `src/model/pieces.ts` |
