# CutForge: render bugs, one Shapes tool, lids beside the box, grow that closes the box: plan

Written 2026-11-18 from the owner's notes on the live site, and revised the same day with the owner's answers. Nothing in this plan is built yet.

**Base:** `origin/main` at `1c4cb96` (milestone 73). Local `main` is at milestone 42, and `claude/waffle-mode` has uncommitted sketch work. Leave both alone and start a new branch from `origin/main`.

## The owner's notes
**First note:**
1. Slit locks and curved-surface connections render wrongly.
2. Dividers are far too narrow on the cut plan but look right in 3D.
3. These are only examples, so look for others like them.
4. The rounded and round boards belong under the Board button.
5. The interface should be less busy and easier to follow.
6. Growing should be easier.
7. Grow cannot make a closing mechanism when the board you grew closes the shape.

**Second note:**
8. Boards and shapes are mixed up: some boards work as modifiers, as shapes do. There should be no Board tool, only shapes with operators. By default a shape is placed as a board, and it can also cut, score and do everything shapes do today.
9. Keep grow working as it does now (no one-drag grow).
10. Lids should be made **beside** the box, so the box itself stays easy to edit.
11. For the open questions (plywood closures, which declutter items): the agent decides.

---

## Part 1: bugs (each one reproduced first, with a test that fails before the fix)

### 1.1 Slit lock in 3D
- **Found in the code:** `slitLock` (`src/model/seams.ts`) adds each tongue as a plain `add` on the flap's board. The 3D slab only takes adds marked `flat` (`src/views/three-geom.ts:30`). The folded glue flap comes from `flaps3d`, which holds the flap without its tongue. So the tongue is cut in the file but **never drawn in 3D**. The slit in the other board is a `line`: check whether 3D draws it at all.
- **To reproduce:** a card tray with *No glue* (settings card → Joints), at fold 0 and fold 1, one corner compared with the cut plan.
- **Fix:**
  - **The tongue:** carry each tongue into its `flaps3d` polygon, so the flap and its tongue are one outline folded together.
  - **The slit:** draw the receiver's slit in 3D as a dark line (card), or as the hole it already is (corrugated).
- **Test:** for every `lock` connection, each tongue is in `flaps3d` and nowhere flat on the wall.

### 1.2 Curved-surface connections (wings, bands, round boxes)
- **To reproduce,** at fold 0, mid-fold and fold 1, and against the cut plan:
  - a rounded tray in card (glued corners) and in plywood (the strip with its hinges and key);
  - a round box in each material (glue teeth, curved slots);
  - a divider that ends on a band (`bandend`);
  - an arched lid.
- **Already known** (`PROGRESS.md`, milestones 64–71), fix these too:
  - a divider's glue flap on a band is not drawn in 3D;
  - a corner glue flap next to a lid's band can leave a sliver.
- **Then fix** whatever the reproduction turns up: gaps or overlap where a band meets a wall, glue lips or teeth on the wrong side, z-fighting.
- **Test:** one per defect, in `tests/wings.test.ts` or `tests/roundbox.test.ts`.

### 1.3 Dividers narrow on the cut plan
- **To reproduce:**
  - the organiser template's dividers;
  - dividers drawn with the Divider tool (D) in a rectangular box, a rounded box and a round box.
  
  For each divider, compare the piece on the cut plan (`src/views/Plan2D.tsx`) with the board in 3D.
- **Suspects, in order:**
  1. The cut plan's pieces come from a copy of the design taken before `reconcileDividers` found the divider's ends (milestone 61's `settle` / `memo`).
  2. A `bandend` slide fit cuts along the wrong axis.
  3. The half-lap depth is taken from the wrong board.
- **Test:** each divider's piece is as wide as the distance between its ends in 3D, give or take the joint at each end.

### 1.4 The rest of this class of bug (the net and 3D out of step)
- **An automatic check:** a harness check (`tests/harness`, milestone 61), run over every golden design and every template in every material:
  - whatever a connection adds to the net is drawn in 3D (it is `flat`, or part of a `flaps3d`);
  - each piece's outline on the cut plan matches its board's outline in 3D.
  
  Slit locks fail it today, and so will any new joint that forgets its 3D side.
- **A pass by hand:** each feature from milestones 61–73 (closures, carton ends, edge flaps, telescoping and arched lids, splitting) in 3D beside the cut plan. Each mismatch is handled as in 1.1–1.3.

---

## Part 2: one Shapes tool, with operators (the Board tool goes)

### What is mixed up today
| Tool | Drawn on the floor | Drawn on a board |
| --- | --- | --- |
| **Board** (P) | a new board | a new board lying on that face |
| **Standing board** (P P) | a standing board | a standing board, or a divider on a box's base |
| **Shapes**: Rectangle, Rounded, Circle (R U C) | nothing | a shape with the chosen operator (cut, engrave, score, add) |
| **Polygon** (G), **Round**, **Rounded** | a new board | a shape with the chosen operator |

The same picture (a rounded rectangle) can be found under two buttons that do different things. Some buttons make a board in one place and a modifier in another.

### The new model: footprint × operator
**One tool, Shapes.** The student picks a footprint and an operator.
- **Footprints:**
  - Rectangle
  - Rounded rectangle
  - Circle / oval
  - Polygon (click corners)
  - Regular polygon
- **Operators** (on the shape card, as today's op list):
  - **Board**, the default. It makes a new board, flat or standing.
  - Cut out
  - Engrave
  - Score line
  - Add material
- **Where each operator can go:**
  - **On the floor**, only *Board* applies. The others are greyed and say *Draw it on a board*.
  - **On a board**, *Board* makes a board lying on that face, as the Board tool does today. The other operators work as shapes always have.
- **Standing** is a choice under *Board* (*Flat · Standing*), offered for the rectangle only. On the other footprints it is greyed with a reason.
  - A standing line drawn across a box's base becomes a divider, as milestone 42 does now.
  - The Divider tool (D) keeps its own button, because it is a different gesture: a line that finds its own ends.
- **Through the whole design** stays as the check under *Cut out*.
- **Import SVG** gets the same operator list. *Board* makes a board from the imported outline, which the model's `addPolygonPanel` can already do for closed outlines.
- **Text** keeps its own button.

### Nothing changes in the model
Boards (`Panel`) and shapes (`Shape` on a panel) stay as they are, with no schema change. Only the tool layer maps footprint × operator onto the existing ops:
- **Board:**
  - Rectangle uses `panelTool`'s ghost.
  - Rounded uses `addRoundedRect`.
  - Circle uses `addRoundPanel`.
  - Polygon uses `addPolygonPanel`.
  - Standing uses the standing ghost or the divider.
- **Any other operator:** `addShape` / `addPolygonShape` with that operator.

The drawing gestures stay as they are: drag for the rectangle, rounded rectangle, circle and regular polygon; clicks for the polygon. Golden exports stay byte-identical.

### The rail
Today there are ten buttons. After this there are five:

**Select · Shapes ▾ · Divider · Text · Import**

- **Shapes ▾:**
  - While the tool is active, the five footprints open as a **vertical menu** under the button, and the rail's other buttons move down to make room. The button shows the last footprint used.
  - The op list on the shape card leads with **Board**, then the operators.
  - This is the owner's "rounded and round under the regular board button", made general.
- **Keys:**
  - R, U, C and G still choose rectangle, rounded, circle and polygon.
  - P becomes *Rectangle + Board*, and P again switches Flat ↔ Standing, so the old habit still works.
  - The operator is remembered as `shapeOp` already is, but a fresh session starts on *Board*.
- **Hidden in Quick build** (it has its own rail, `src/easy/QuickRail.tsx`, unchanged) and on the cut plan, as now.
- **Code:** `src/ui/Toolbar.tsx`, `src/store/store.ts` (`Tool`, `setTool`, `choosePolyTool`, `shapeOp` with a new `'board'` value used by the tools only), `src/views/View3D.tsx` (which tool handles the press), `src/views/panelTool.tsx`, `src/views/polyTool.tsx`, `src/store/hooks.ts` (keys), `src/ui/icons.tsx`, the hints, en and he strings.
- **Specs to update:** those that click `tool-panel`, `tool-panel-standing`, `tool-round`, `tool-rounded` or `tool-polygon`. Keep the old test ids as aliases on the new controls for one release, so the specs can move over gradually.

---

## Part 3: lids are made beside the box

### Today
`placeLid` (`src/model/lid.ts`) puts a lid of its own (the cap, milestone 71) upside down **on top** of the box, and `reconcileLids` puts it back there on every edit. Folded lids (a tuck top, a living hinge, an arched lid, a grown board) are attached to a wall and drawn closed. Either way the lid covers the box, and the student has to work around it to edit the walls, dividers and inside.

### The plan
1. **A lid of its own sits beside the box:**
   - **Where:** on the floor, right side up (rim up), at the box's front-right, 20 mm clear of it, along the box's own axis. If something is already there, it moves in 10 mm steps until it touches nothing, as a paste does in the sketch view.
   - **It follows the box:** `reconcileLids` keeps it beside the box through a resize, a move or a turn.
   - **It can be moved:** a lid the student drags stays where it was put, as an offset from the box (`Tray.lidAt?`, optional, so no schema bump; `check.ts` accepts it).
2. **A folded lid is shown open:**
   - **How:** a tuck top, a living hinge, an arched lid or a grown lid is drawn opened back (about 110°) by default, so the inside stays clear.
   - **Display only:** this changes how it is drawn, not the design. The design still says closed, so the closure joint and checks are unchanged.
   - **Where it comes from:** this is the lid plan's `lidPose` / *Open · Close* (`LIDS_LINES_PROJECTS_PLAN.md` §3.5, milestone 75), brought forward and defaulting to *open*.
3. **Put on / Take off:**
   - **The control:** a round badge on the lid and on the box's card, *Put on* / *Close*, shows the lid in place to check the fit, and *Take off* / *Open* returns it. It is view state and is cleared on reload.
   - **Fold and assembly views:** they always show the lid on the box.
4. **Both modes:** a lid made in Quick build (*With a lid*, the *Lid* section, *Wall / lid*) lands beside the box or opens back in the same way.
5. **Old files:** a cap that was on top opens beside the box (it is re-placed on load, as today). Pieces and exports don't depend on where a lid stands, so golden exports should stay byte-identical. Check that `pack` and `nest` never read 3D positions.
6. **Risk, so spike it first:** drawing a shape on a folded lid that is *shown* open needs the stage to aim through the display transform. The fold view already shows boards away from their design place. Check whether picking and drawing work there. If not, a folded lid's face can be edited only after *Close*, and the card says so.

---

## Part 4: grow, made easier (the operation stays as it is)
The steps stay as they are: select an edge, see the card and the arrow, set the height, ✓. Only these change:
- **Snaps that mean something, while dragging the arrow:**
  - the neighbouring walls' height;
  - the opposite wall's height;
  - for a board grown across, *reaches the far wall*.
  
  Each shows as a labelled tick, the same idea as `snapLineEnd`.
- **A shorter card:**
  - Height first.
  - *Closes the box* when it applies (Part 5).
  - One *More…* row holding angle, joint, span, *Adapt* and *Edit outline* (the parts already marked `advanced` in `src/ui/EdgeBar.tsx`).
- **Edges from the board's card:** the *Edges* list on a board's card selects an edge for growing, so a student never has to aim at a 3 mm edge in 3D.

## Part 5: grow that closes the box

### Today
Milestone 67's `sealFor` notices when a grown board closes a box, and the grow card says so (`grow-closes`), always with the material's first closure style. That falls short in four ways:
- the student can't choose the style before ✓;
- it only works for a fold (`eg.kind === 'fold'`), so **plywood never gets it**;
- it only works for lids over **tray walls**, not over walls the student built from boards;
- the closing edge is always the lid's far edge.

### The plan
1. **Choose on the grow card:**
   - **What shows:** when the ghost would close the box, the card shows *Closes the box* with the choices as pictures (as on the lid's own card, `src/ui/ClosureUI.tsx`), with the default chosen.
   - **On ✓:** it makes the lid and its closure in one undo step.
2. **Plywood choices, decided now** (no wait for milestones 74–77):
   - **Fixed:** finger-jointed shut, as today.
   - **Rests:** sits on the walls.
   - **Hinged:** a living hinge on the grown edge, where it fits. The check is `lidWhy`, and otherwise it is greyed with the reason.
   - **Lifts off:** the grown board is swapped for a cap made with `setBoxLid`, which lands beside the box (Part 3).
   
   The pin hinge (milestone 76) and hasps (77) join this list when they are built.
3. **Boards, not only trays:** generalise `sealFor` from tray walls to any ring of standing boards joined at their corners (found from the connections), so a box built with the Shapes tool closes too.
4. **The same decision in both modes:** Quick build's *Wall / lid* already turns a closing board into the box's lid (`wallClosesBox` → `setBoxLid` in `src/easy/lid.ts`). Workshop's grow card uses the same functions, so the two can't drift apart.

## Part 6: a less busy interface (all four, decided)
1. **The design settings card** shrinks to its header (*Design settings ▸*) once there is a board on the stage and nothing is selected. A click opens it.
2. **One cluster of view buttons:** the bottom-right buttons (cube, fit, Joints, assembly, settings) and the TOP / FRONT buttons become one.
3. **One hint, not two:** where the bottom hint and a card say the same thing, the card's line goes.
4. **Card sections closed by default:** *Joints (advanced)*, *Edges* and *Split* start closed, each with its count.

Then a short pass by hand, each card at 1024 and 1400 px in both languages. Anything with more than about eight controls showing gets trimmed.

---

## Order
1. **Part 1**, bugs first: 1.1, 1.3, 1.2, then 1.4's check.
2. **Part 2:** one Shapes tool. It changes the most specs, so it goes before the parts that add cards.
3. **Part 3:** lids beside the box. Spike the risk in item 6 first.
4. **Part 5:** grow that closes the box (it uses Part 3's placing for *Lifts off*).
5. **Part 4:** grow made easier.
6. **Part 6:** a less busy interface.

Each part ends with the light routine:
- `npm run typecheck` and `npm test`;
- a quick look in the dev server;
- at most the e2e spec for that part.

Golden exports stay byte-identical; any intended change is listed. `README.md`, `DECISIONS.md` and `PROGRESS.md` are updated, along with English and Hebrew strings. Quick build's feature table (`src/easy/features.ts`) gets a row for anything new it shows or hides.

## Still open (defaults chosen; say if you want them different)
1. **Where a lid lands:** front-right of the box, 20 mm away.
2. **How far a folded lid opens:** about 110°.
3. **P with no Board tool:** P picks *Rectangle + Board*.
4. **Old test ids:** they stay as aliases for one release.
