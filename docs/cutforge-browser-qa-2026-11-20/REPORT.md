# CutForge browser QA — 20 Nov 2026

**Branch:** `claude/modest-ride-j5iqa3` at `0f285cd`, served locally with `npm run dev` (port 5199), in the Claude in-app browser.
**Procedure:** [`BROWSER_TEST_PLAN.md`](../../BROWSER_TEST_PLAN.md), run at 1366 × 768. Spot checks were also done at 1024 × 768 and in Hebrew.
**Rules:** no code was changed; downloads were not saved; no password, teacher key or student name was used.
**Console:** no errors or warnings were logged during the session.

This is a partial pass. It focused on the owner's concerns (switching modes, Guided with no shape, the Joints and Outlines buttons, the 3D gizmos, and placing a new sketch) plus a sample of each section. See the coverage table at the end.

---

## 1. Top findings (fix first)

| # | Where | What went wrong | Severity |
|---|---|---|---|
| 1 | Guided, empty design | Guided opens on an empty grid. The card says *"Made with more tools: you can decorate it and send it."* Its only button is *Change it with more tools (Quick build)*. There is no way back to the gallery except ☰ → *Start something new*. **Send** reports **Ready to cut ✓** with *Download the file* enabled, even though the sheet is empty. | High |
| 2 | Shapes, new sketch | A new sketch is drawn around the stage origin, which is usually inside the shape already there. *Finish sketch* then leaves the new extrusion (9 × 9 × 20 mm in the test) buried inside the existing group. Follow/Frame then zooms the camera into the group's wall, so the screen is one flat orange face with a gizmo floating on it. | High |
| 3 | Top bar, Quick build | At 1366 px the level switch (*Guided · Quick build · Workshop*), *Submit* and the language button move into **⋯** as soon as the first part makes the *Ready to cut* badge appear. With the same design in Workshop they stay in the bar. The level switch therefore changes place between levels and states. | High (mode switching) |
| 4 | 3D rotate gizmo (Shapes stage) | All three rings are the same yellow and overlap around the shape's bottom centre, so you can't tell which axis you are grabbing. A drag meant to spin around the vertical tipped the box onto its side. The card has no angle fields, so after a drag there is no number to read or correct. | High (gizmos) |
| 5 | 3D move gizmo (Shapes stage) | The arrows are about 30 CSS px and stay that size at any zoom. They are drawn through the solid at its bottom centre, and the depth (green) arrow is a short stub. They are small targets. No distance is shown while dragging, and the card has no X/Y position fields. | Medium-high |
| 6 | Workshop board gizmo | Move arrows, the yellow turn ring and the W/H labels all sit on top of each other on a small board. The ring overlaps the W label and the blue arrow sits on the ring. A ~35 px ring drag jumped to **−60°**. After a move, *Tabs ⚠* warnings land on top of the size labels. | Medium |
| 7 | Bottom view bar, *Outlines* | The button is 34 px wide but has a text label, so the word *Outlines* hangs below the bar under its icon (visible at every size). It does the same thing as the card's *Edit outline* button, but it is a **sticky global mode**: Esc clears the point, a second Esc deselects, and the mode stays on, so the next board you click shows outline handles again. In that mode the card button turns into a disabled *Editing (outline mode)* with no *Done*. | Medium |
| 8 | Sketch editor, live measurements | The live label while drawing (for example *10 mm ∠ 270°*) sits on a **large, ragged white blotch**. Cause: `src/styles.css:1212` gives `.sk-snap-label, .sk-dim-text` a white halo `stroke-width: 3px`. Inside the sketch SVG, px are user units (mm) while the text's `font-size` is about 1 unit (`fontSize={px * 12}`), so the halo is about 3× the letter height. The same rule hits the snap labels and the turn label (`SelectionLayer.tsx:191`). Fix direction: scale it like the rubber line already does (`strokeWidth={px * 3}`), or use `stroke-width: 0.2em`. | Medium (visual) |

---

## 2. Owner's observations — confirmed, plus my take

### 2.1 Switching between modes is cumbersome and unclear — **confirmed**
There are four overlapping "mode" axes, and each lives somewhere different:

1. **Level:** *Guided · Quick build · Workshop*. It sits in the top bar in Workshop, inside **⋯** in Quick build once a part exists, inside **☰** as *More tools / All tools* in Guided, and it is replaced entirely on the Shapes stage.
2. **View:** *3D workspace · Cut plan*. Guided calls these *Build · Decorate · Send* instead.
3. **Template / stage:** *Blank* vs *Shapes*. The Shapes stage swaps the level switch for *1 Shape · Fold it · Build from boards*, and the rail changes under you after *Fold it*.
4. **Tool sub-modes:** *Joints*, *Outlines*, *Move · Turn · Size*, *Follow*, *Frame*. These are toggles that stay on across designs and levels; Joints was still on after a level change and a new design.

Other things seen:
- Every level change shows a **1–2 s blank cream screen** before the editor comes back.
- Guided → Workshop lands on **Cut plan**, because Guided's last step was *Send*, not on the 3D view.
- The design name changes with the level: *Untitled design* in Workshop shows as *My thing* in Guided, and *Your designs* lists it as *Untitled design*.
- *1 Shape* reads like a count ("one shape"); it is the step number glued to the label. The card then says *"1 shapes"*.
- The Shapes stage gives no hint which level it is in, and *Download* there is called *Download for laser* everywhere else.
- Leaving the sketch editor swaps the top bar back to the Workshop bar (*Submit*, *Download for laser*, עברית) while the user is still in the Shapes flow.

**Suggestions**
- Give the level switch **one fixed place** in all three levels: the same segmented control at the left of the top bar, never in an overflow menu. In Guided, show it as a small *Guided ▾* chip instead of burying it in ☰.
- Show **what stays the same and what is lost** when changing level (one line under the control), and keep the current 3D/Cut-plan view across the change.
- Treat *Shapes* as a **stage within Workshop**, with a visible breadcrumb: *Shape → Fold it / Boards*. Rename *1 Shape* to *Shape*, or show steps as ①②③ chips like Guided does.
- Use a short fade, or keep the old frame, instead of a blank screen while the new level mounts.
- Reset sticky toggles (Joints, Outlines) when a new design starts, or show them as a visible "mode" banner.

### 2.2 Guided opens with no shape — **confirmed** (finding #1)
**Suggestions**
- When Guided is entered with an empty design, or with one it cannot edit, open the **gallery** (*What do you want to make?*) directly, with *Keep working on …* hidden when there is nothing to keep.
- Disable *Decorate* and *Send* until there is something on the sheet. *Ready to cut* must never be shown for zero pieces.
- Fix the card text: *"Made with more tools"* is wrong for an empty design.

### 2.3 Move *Joints* and *Outlines* to the bottom of the contextual card — **agree**
Today the bottom-right view bar mixes **view** controls (perspective, fit, view cube, play, view settings) with **editing** modes (Joints, Outlines). Outlines also duplicates the card's *Edit outline* button. Moving both to a single row attached to the bottom of the right-hand card:
- puts them next to what they act on (the selected board);
- lets them be **full-size labelled buttons**, which fixes the overflowing *Outlines* label;
- removes the duplicate *Edit outline* button inside the card (keep one entry point);
- leaves the bottom bar purely for the view.

Extra notes:
- Quick build calls the same Joints button *How it's built*; use one name in all levels.
- The row should also hold a clear **Done** state for outline editing, instead of the disabled *Editing (outline mode)* button.
- When nothing is selected, the row can stay on the *Design settings* card, because Joints view is useful without a selection.

### 2.4 Outline-edit icon — **agree**
The current icon is a closed pentagon (`M12 3.5 20 9.3 17 19h-10L4 9.3Z`) with no vertices marked. **The same pentagon is the rail icon for *Sketch* on the Shapes stage**, so two different tools share one picture. An **open** polyline with **filled dots at each corner** (and one small "+" on an edge) reads as "edit points" and no longer clashes with Sketch.

On the stage itself, the corner dots and the white "+" edge squares are also small. Enlarge them to match the new icon.

### 2.5 Move and rotate gizmos — **confirmed clunky** (findings #4–6)
**Suggestions**
- Colour the rotate rings by axis (red/green/blue, like the move arrows), and fade or hide the ring that is nearly edge-on to the camera.
- Scale gizmos with the selection, with a minimum and maximum screen size. Draw them **on top**, but anchored at the shape's centre or top, not through the bottom face.
- Show a live readout while dragging (*+12 mm*, *45°*). Add **X / Y / Lift** and **Turn** fields to the shape card, so a drag can be read and corrected.
- Make the turn snap step visible (15°) and less sensitive. A tiny drag should not jump 60°.
- Let *Move · Turn · Size* switch on stage, with hotkeys (for example G / R / S), or show move and turn together as Tinkercad does. Today the user must go back to the card to change handle type.
- On Workshop boards, separate the ring from the arrows (larger ring radius, or ring only on hover), and move the stage labels off the gizmo.

### 2.6 New sketch placed in the middle — **confirmed** (finding #2)
**Suggestions**
- On *Finish sketch*, if the new solid's footprint intersects an existing shape, place it **beside** the bounding box of the existing shapes (on +X, with a 10 mm gap). An alternative is to open the sketch sheet offset to free floor space.
- Show the other shapes' footprints in the sketch view as a faint guide (this works today), and draw the new outline where it will actually land.
- *Frame* on a selection that is hidden inside another solid should frame the whole scene, or make the occluding shape transparent, rather than putting the camera inside a wall.
- The sketch's *Preview* box did not show the outline being drawn, only the old shapes. When the sketch was reopened with *Edit sketch*, the preview did show the finished extrusion (green) standing inside the grey group, which confirms the bug.

### 2.7 White blotches under sketch measurements — **confirmed** (finding #8)
Seen with the Line tool: after one segment, the live *length ∠ angle* label sits on an irregular white blob several times taller than the text. A selected edge's label (*9 mm*) uses a pill and looks fine, so only the SVG text halo is affected. Also, once a segment is placed, its length is no longer shown even with *Show measurements* ticked; only the live segment and a selected edge show one.

---

## 3. Results by test

Legend: ✅ pass · ⚠️ pass with issues · ❌ fail · ⏭ not run

### A. Welcome and shared
| Test | Result | Notes |
|---|---|---|
| A1 welcome | ⚠️ | No horizontal scroll at 1366 or 1024. *Start* is below the fold at 1366 × 768. At 1024 the material cards wrap 2 × 2 and Start is far down. **Plywood is pre-selected** in a fresh profile. |
| A2 Hebrew toggle | ✅ | RTL and back to LTR are correct. |
| A3 blank design | ⏭ | Done as part of other tests. |
| A4 sentence | ⚠️ | (1) The *outside …* line does **not** update while typing; it updates only when the number popover closes. (2) After adding a lid, the sentence says the lid twice: *"a tray with a lid that lifts off … with a lid that lifts off"*. (3) Tab from the width field goes into the slider popover, which covers the next words. (4) After *Start*, the camera is not fitted: the lid is cut off at the right edge. (5) Clicking the box selects *Front wall*, so the card does not show the sentence's words. |
| A6 your designs | ⚠️ | An **unused empty "Untitled design"** from the fresh start stays in the list. There were three *Untitled design* entries at the end, two of them plywood and indistinguishable. Thumbnails show a material swatch, not the design. Actions are icon-only. *Back to the open design* is styled like a text input. The project menu has both *Save project* and *Save the whole project* (unclear difference). |
| A7 autosave / reload | ✅ | Design and view came back after about 1 s of blank stage. |
| A8, A9, A10, A11 | ⏭ | Not run. Undo was used throughout and each Undo reversed one step. |

### B. Guided
| Test | Result | Notes |
|---|---|---|
| B1 gallery | ⚠️ | Pictures take about 2 s to appear (blank tiles first, then a layout jump when *Keep working on …* replaces *Back to what you were making*). The **board chip defaulted to Plywood although the open design was card**. Tapping the greyed *Carton* does nothing: no "why", no offer to switch to card. *Pyramid / Diamond* on plywood give no hint that they will switch to card. |
| B2 pencil box | ✅/⚠️ | *Make it fit* → the goal turned green (about 0.5 s lag in the card). The name landed on the front wall; Send showed *Ready to cut ✓* and ★★★. Issues: (1) In Decorate, the **turn ring around the name is much larger than the wall** and spills above and below it. (2) The font chips are cut off (*"Your …"*) until the text is short. (3) Entering the face-on view flashes a blank screen. (4) On the Send sheet, the engraved name **overlaps the "Front wall" label**. (5) *Watch it go together* covers the bottom of the sheet. The download was not saved. |
| B10 Guided menu | ⚠️ | *Start something new*, *More tools*, *All tools* work. Changing level lands on Cut plan (see 2.1). The menu does not show which level you are in. |
| B11 nothing of other levels | ✅ | No rail, joints toggle or material pill in Guided. |
| **Extra** — Guided on empty design | ❌ | See finding #1. |
| B3–B9 | ⏭ | Not run. |

### C. Quick build
| Test | Result | Notes |
|---|---|---|
| C1 box action | ⚠️ | Ghost walls rise and ✓ makes the box. Issues: (1) The tooltip *Box B* overlaps the options panel title. (2) The same hint text appears both in the options panel and in the bottom hint bar. (3) After ✓, **both Select and Box look highlighted** on the rail. (4) The stage label says **H 56 mm** for the base's depth, while the card says *Depth* in Quick build and *Height* in Workshop. Use one word. (5) The top bar collapses (finding #3). |
| Cut plan in Quick build | ⚠️ | After switching from Guided, a dark block sat behind the cut-plan toolbar at top-left, overlapping the rail. |
| C2–C12 | ⏭ | Not run. |

### D. Workshop
| Test | Result | Notes |
|---|---|---|
| D5 edit outline | ⚠️ | Dragging a corner works and the walls follow. *Curve / Round* are greyed with a clear reason. Issues: see finding #7 (sticky mode, no Done, disabled button). |
| D10 joints view | ⚠️ | The label popup works and *Tabs and slots* applied; Undo reverted it. The card does not list the selected joint's kind or options (it still shows the base). The popup covers the bottom hint bar. |
| D1–D4, D6–D9, D11–D19 | ⏭ | Not run. |

### E. Shapes → fold / boards
| Test | Result | Notes |
|---|---|---|
| E1 shape stage | ⚠️ | The bar shows *1 Shape · Fold it · Build from boards*, greyed until a shape exists ✅. Issues: the design name is truncated (*Untitled de*) at 1366. The bottom-right has *Follow / Frame* instead of the usual view bar. **Frame is a toggle that looks like a button**: the first press turned it off. Wheel zoom is very slow (10 ticks barely move). At 1024 the card covers part of the model. |
| E2 place shapes | ⚠️ | Box and cylinder tiles work. The **second shape was placed partly under the right-hand card** and off-screen. The panel says *Click to add, or drag*, while the bottom hint says *Drag on the floor … a click makes a 40 mm shape*. |
| E3 handles | ⚠️ | Move, Turn and Size all work; the W label → 70 works. See findings #4–5. Size grows symmetrically, which pushed the box under the card. Handles behind the shape show through it. |
| E4 hole + combine | ✅ | The hole cut through and the group was made. The *Ungroup* button wraps its icon above the text. The camera jumped on every selection with Follow on. |
| E9 Fold it | ⚠️ | It folded, giving *"1 pieces · 5 folds · 7 flaps"* (grammar). The material pill appears twice (top bar and Make card). The Joints view was still on from earlier. |
| E10 / E11 Build from boards | ⚠️ | Boards came in one by one, giving 6 boards with fingers. The **material switched card → plywood silently** (no note). The Make card still says *"Fold every crease first"* for plywood boards. Boards are named *Panel 1…6* rather than *Top / Front …*. |
| E21 back to shape | ⚠️ | The shapes are kept, but the camera jumps to a very close view, and the box changed colour from the selected teal to plywood tan. The card repeats *"fold it from card or build it from boards"* twice. |
| **Extra** — new sketch | ❌ | See finding #2. The rail's Sketch icon is the same pentagon as Outlines. |
| E5–E8, E12–E20, E22 | ⏭ | Not run. |

### F. Teacher — ⏭ blocked
This needs the teacher key and the Worker back end; `npm run dev` serves only the front end.

### G. Across the app
| Test | Result | Notes |
|---|---|---|
| G1 Hebrew | ⚠️ partial | Only the welcome screen was checked (correct). |
| G2 1024 | ⚠️ partial | Welcome is OK. On the Shapes stage the material pill shrinks to a swatch and the card overlaps the model. |
| G3 offline | ⏭ | Not run (no network toggle). |
| G4 console | ✅ | No errors. |

---

## 4. Redundancy / simplification list
- *Edit outline* (card) and *Outlines* (bottom bar) do the same thing. Keep one, in the card row.
- *Joints* (Workshop) and *How it's built* (Quick build) are the same button with different names.
- Bottom hint bar text repeats the tool panel's own help (Box tool, Shapes tool). Keep one.
- The material is shown in the top-bar pill and again in the Make card.
- *Save project* and *Save the whole project* both appear in the project menu.
- The sentence states the lid twice once a lid is added.
- The "Your sculpture" card repeats *"When the shape is ready: Fold it, or Build from boards"*.
- *Download* (Shapes stage) vs *Download for laser* (everywhere else).
- Width / Depth / Height vs W / H labels vs Width / Height (Workshop base): pick one naming per level.

## 5. Accessibility notes (from the accessibility tree)
- The three card-type material radios all have the **same accessible name**, the description (*"Folds, glue flaps and tabs and slots…"*), rather than the material name.
- The *Wall to base* and *Corners* selects are labelled by their value (*"Finger joint"*), not by their purpose.
- Several icon buttons have no name (welcome screen and design list actions).
- The *+ more* word reads *"+ more: + more. Change."*.

## 6. Coverage
About 30 of ~90 plan tests were exercised, fully or in part. Not covered: most of C and D, E5–E8 and E12–E22, all of F, and G3. These need another pass. Downloads (SVG/DXF/print) were not saved, so their contents were not checked.

---

# Second pass — 20 Nov 2026 (later the same day)

Same build and set-up. Covered Workshop D1–D3, D7, D13, D14 and D17 (dialog only); curved edges everywhere (new plan
section I); B4; parts of B1 and E10–E12; and the UI sweep (new plan section "The UI sweep" and section H) applied
throughout. The test plan now has the UI sweep, **H1–H12** (UI bugs and consistency) and **I1–I11** (curved edges).

## 7. Curved edges — findings (plan section I)

| # | Where | What went wrong | Severity |
|---|---|---|---|
| C1 | Hinged lid on a **rounded-corner** box (Quick build → Lid: Hinged → Close; also seen in Guided) | The lid is a **rectangle** spanning only the straight back wall. Closed, it covers the back part of the box and leaves the **front of the opening uncovered**. The rounded corners show **gaps on both sides**, and its ends overhang the curved corner walls. *Ready to cut ✓* still shows. Round and oval boxes correctly grey out *Hinged*, so the rounded-rectangle box should too, or the lid should follow the outline. | High |
| C2 | Hinged → *None* on a rectangular plywood box | Afterwards the **Back wall is invisible from inside the box**: the 3D shows only a stub at one corner, and it appears only when the camera orbits behind or below the box (faces look inside out). The card says **150 mm** wide while the cut plan lists **147 × 40**. The box looks like it lost a wall. | High |
| C3 | Converting a straight box to rounded corners | Not possible as one step. *Edit outline* → a corner → *Curve / Round* is greyed with *"a curved edge cannot hold a joint. Remove the joint first."*, and every base corner carries wall joints. The only route found is to delete the walls, round the corner, then *Wall it* again. In **Quick build** the outline hint says *"Make a point a curve in the card"*, but the Quick build card has **no point controls**. There is no *Round the corners* action on the box card. | High |
| C4 | Hinged lid on a rectangular box (open) | The 3D shows the hinge **flat**: the lid rises straight up as an extension of the back wall. The lid part above the wall **can't be selected**; clicks pass through it to the wall behind. The **whole back wall** is covered in hinge slits, not just a bend zone. The side walls get a quarter-round cut at the back, which leaves a visible gap beside the flat back wall when open. | Medium |
| C5 | Hinged lid opening (fold slider with the lid closed) | The bent part turns as a **rigid block** instead of unrolling. Near the front, the flat lid appears to **pass into the side wall** during the motion. This matches the owner's report of hinged lids colliding with walls; it needs a closer look at higher zoom. | Medium (likely) |
| C6 | Hinged lid, Workshop vs Quick build | *Close / Open* exist only on the Quick build box card. In Workshop the closed state can't be viewed, so collisions can't be checked there. | Medium |
| C7 | Lid switching | Changing *Hinged → Lifts off* in Guided changed the inside height **34 → 37 mm** with no note. Undo restored it. | Medium |
| C8 | Rounded box, Quick build Box tool | The *Corner radius* field reads **15 mm**, while the text below says the corners **will be 21.5 mm**. Show the real value, or refuse the lower one. While drawing, the ghost shows only straight walls with **gaps at the corners**. *Ready to cut ✓* appears in the top bar while the ghost is still unconfirmed. | Medium |
| C9 | Oval box (Workshop `C` → Oval → Extrude walls) | A small square **nub sticks out at the wall seam** on one end. | Low–medium |
| C10 | Guided *Round box* | A ~40 px pull on the Wide arrow jumped **99 → 151 mm** (sheet maximum). On a round card box the lift-off lid is placed **beside** the box, while on a rounded plywood box it is placed **on** the box. *Hinged* is greyed with *"This lid cannot be made on this box."*, with no reason given. The *Wide* label sits on top of the lid. | Medium |
| C11 | Shapes → curves | *Build from boards* defaults to **8** *Faces around a curve*; *Fold it* defaults to **12**. A 40 mm cylinder folds into **2 pieces** with the note *"one piece would overlap itself"*. A plain prism with two caps normally lies flat in one piece, so this deserves a check. Changing faces 12 → 8 updated the summary correctly. Boards took about 10 s to come in. | Low–medium |
| C12 | Wall naming on curved boxes | Rounded boxes name their walls *Wall 2…*; rectangular boxes use *Front wall / Back wall*. The outline uses *bottom / left edge* (2D words) in the card (*Wall it: bottom*, *Base • bottom edge*, *Along the bottom edge*). | Low |

Not reached in this pass: I8 (bend radius with patterns), I9 (Arched was greyed on every box tried, with no reason seen), I11 (files).

## 8. More UI bugs and inconsistencies (UI sweep / section H)

**High**
- **H1 — no way out of the Shapes stage.** On the Shapes stage the ⋯ menu holds only *Submit to class* and the language. There is **no level switch at all**, so the only way out is *New design*.
- **H7 — a new design inherits the camera.** Starting a new design kept the previous design's camera. In this run it was **under the floor**, so drawing on the floor did nothing. With the Box tool active, a left-drag to orbit started drawing a footprint instead.
- **Quick build, outline editing.** The hint points to card controls that don't exist (see C3).

**Medium**
- **Selection sticks.** With one part selected, clicking an adjacent part often keeps the first selection, especially when the click lands near the selected part's gizmo. Esc first, then click, works.
- **Card keeps its scroll position across selections.** Selecting a new part opens its card mid-scroll, with the part's name hidden (seen in Workshop and the cut plan).
- **Grow-a-wall chip.** *+ Grow* appears only on hover over a 3 mm edge. Clicking the edge or the teal edge triangle does nothing.
- **The same outline-editing mode has two different exits.** From the card's *Edit outline* the button becomes **Done**. From the bottom bar's *Outlines* it becomes a disabled **Editing (outline mode)**. *Edit outline* also appears in the grow-wall card, so there are three entry points.
- **Cut plan → Nets.** The nets are drawn tiny and their labels overlap (*Right wall* over *80 × 40 mm*, *Left wall* over *Front wall*). The *Folded preview* pane is mostly **covered by the right-hand card**, and the Fold slider box overlaps the preview. Switching to Nets shows a ~2 s blank.
- **Dimensions in the cut plan.** The size labels sit on top of the hinge slits and of other labels.
- **Wheel zoom.** It is extremely slow in Workshop and on the Shapes stage (10 ticks barely move). *Fit view* crops the model behind the Fold bar.
- **The camera can orbit below the floor.**
- **View cube.** Clicking a face does not snap the view.
- **Dialogs.** The sketch *Cancel* uses a **native browser confirm** (*"Leave without keeping the changes…"*), unlike the app's own dialogs; in some automated browsers it is silently dismissed. The Download dialog says **"1 sheet(s), 5 piece(s)"**, and its **radio dots sit above and to the left of their labels**.
- **Lift-off lids land where you can't see them.** A new lid on a box is placed **under the right-hand card** (Workshop) or half off-screen (Quick build).
- **Guided gallery.** It shows **three identical "Keep working on My thing" cards with blank thumbnails**. Choosing the *Thick paper / card* chip does not change the pictures (they stay plywood).
- **Shapes stage on first load.** Clicks on the rail and tiles were **silently dropped** while the shape kernel loaded, with no *Loading* note visible.
- **The rail looks like it has two active tools.** After drawing, *Shapes* keeps its highlighted look (it has focus) while *Select* is the real active tool.
- **Messages that don't fit.**
  - *Drop-in* lid greyed: *"Needs dividers at least the lid's thickness lower than the walls"* on a box with no dividers.
  - *"Shift-click the wall opposite to add a divider"* shows for a lone wall with nothing opposite.
  - *"Fold every crease first"* on plywood boards.
- **Fold slider is a hidden mode.** Moving it deselects the part and locks editing (*"Showing the net unfolded. Fold it back up to edit."*).

**Low**
- Raw 2D edge names (*bottom edge*, *left edge*) in 3D cards.
- *Extrude walls* is offered on a lid.
- Assembly animation for 10 boards takes ~10 s, with no skip.

## 9. Test results, second pass

| Test | Result | Notes |
|---|---|---|
| D1 board | ✅ | Typing W on the stage label works. See the rail highlight issue above. |
| D2 grow a wall | ⚠️ | Works via the hover chip only. The card calls the front edge the *bottom edge*. The joint choice is hidden behind *More*. |
| D3 extrude / Wall it | ✅ | *Wall it: bottom* closes the deleted side. The ✓ chip overlaps the base's gizmo and the W label. |
| D7 lids | ⚠️ | Lifts off and Hinged work. Drop-in's reason is misleading. Arched is greyed. The new lid lands under the card. |
| D13 fold slider | ⚠️ | Works, but it is a hidden edit lock (above). |
| D14 cut plan / Nets | ⚠️ | Dimensions and Repack work. Nets view has overlapping labels and the preview is covered (above). |
| D17 download dialog | ⚠️ | It opens slowly; see the radio alignment and *(s)* wording above. No file was saved. |
| B4 lids in Guided | ✅/⚠️ | Undo works; the height changed silently (C7). |
| E10–E12 (cylinder) | ⚠️ | See C11. |
| I1–I7, I10 | ❌/⚠️ | See C1–C12. |
| H1, H3, H7, H10 | ❌/⚠️ | See section 8. |

**Still not run:**
- A8–A11.
- B3, B5–B9.
- C2–C12.
- D4–D6, D8–D12, D15, D16, D18, D19.
- E5–E8, E13–E22.
- F (blocked).
- G3.
- H2, H4–H6, H8, H9, H11, H12 as dedicated runs. Several of their checks were covered in passing.
- I8, I9, I11.

---

# Third pass — 20 Nov 2026 (evening)

Same build (`claude/modest-ride-j5iqa3`, dev server on port 5199, 1366 × 768). Covered most of what the second pass left:
A8, A10, A11 (tour is off); B3, B5–B9; C2–C4, C7, C8, C12; D4, D6, D10, D11, D17 (files read in the page, nothing saved
to disk); E5, E13, E15, E16, E19–E22; H2, H11, H12; I9, I11. Plus the owner's new request: **changing joint
types** (section 10). File downloads were captured inside the page and read there; no file was written to disk.

## 10. Joint-type changes — "not all of them change, sometimes nothing changes"

**Confirmed, and reproducible.** The model was read directly after each change (dev build), so every claim below
compares what the dropdown says with what the joints actually are.

### What happens

| # | Steps | What the dropdown says | What the joints really are | Note shown |
|---|---|---|---|---|
| J-a | Card box. *Design settings → Wall to base: Tabs and slots* | Corners still *Slit lock* | All 4 corners silently became **half-laps** (and their remembered choice was overwritten) | "4 joints changed." (the 4 corners are not counted) |
| J-b | Then *Corners: Glue flap* | *Glue flap* | Still **half-laps** — nothing changed | "**0 joints changed.**" |
| J-c | Then *Wall to base: Fold* | — | Corners jump to **Glue flap**: the choice from J-b, applied late | "4 joints changed." |
| J-d | Plywood box (welcome sentence, lid + 3 spaces). *Wall to base: Edge to edge* | — | 4 wall-to-base joints **and 9 divider joints** changed (dividers are not "wall to base") | "13 joints changed." |
| J-e | Plywood, *Wall to base: Tabs and slots*, then *Corners: Edge to edge* | *Edge to edge* | Corners are **half-laps** | — |
| J-f | Base's own card (*Corners* on the tray) → *Finger joint*, then *Edge to edge* | *Finger joint* / *Edge to edge* | Still **half-laps** both times — **nothing changes** | none |
| J-g | Base's card → *Walls: Finger joint* | — | Corners jump to **Edge to edge** (the J-f choice); dividers stay *Tabs and slots* (the design-wide *Wall to base* does change dividers, the tray's own does not) | none |
| J-h | Base's card on **plywood** offers *Walls: Fold*; design settings does not | *Fold* | 4 plywood walls become folds | none |
| J-i | Lid joints (*closure*) and divider crossings (*half-lap*) | — | Never touched by any group, never listed | — |
| J-j | Template card: *Lid → a hinged lid* with 3 spaces | Spaces: *no spaces* | All dividers removed; *Spaces* is then hidden while the lid is hinged | *Corrected while planning:* the card does note the change, but its reason is vague: "it would not cut cleanly with the words before it" |

Earlier passes saw the same thing from the outside: the 3D *Joints* view shows overlapping chips at corners, and the
cut plan sometimes keeps the old joint.

### Why (from the browser; the code trace is below)

1. **A hidden rule overrides the corner choice.** When walls stand on the base's face (*Tabs and slots* or *Edge to
   edge* to the base), corners are forced to half-laps. The forced kind is applied silently, the corner dropdown keeps
   showing the old choice, and choosing a corner kind afterwards stores it without applying it ("0 joints changed").
   It surfaces later, when the base joint changes again.
2. **The dropdown shows the stored preference, not the joints.** When the joints differ from the preference, or from
   each other, the dropdown still shows one value. Picking the value it already shows fires no change at all.
3. **The groups mean different things in different places.** The design-wide *Wall to base* includes dividers; the
   tray's own *Walls* does not; lids and divider crossings belong to no group. The two places also offer different
   kinds (*Fold* on plywood in one, *Edge to edge* in the other).
4. **The count is not the whole story.** "N joints changed" counts only the group's joints, not the side effects
   (J-a, J-d), and "kept" never says which joints were kept or why.
5. **Regeneration rewrites joints.** Template changes (lid, spaces) rebuild the parts and re-derive joints. Removing
   the dividers is noted, but only with a vague reason (J-j).


### 10.1 Causes in the code

Traced read-only; the starred claims were also reproduced with a throwaway script against `src/model`. Line numbers are
from this branch.

1. **The list shows the saved choice, not the joints.** `groupShown` (`src/model/jointDefaults.ts:150`) returns the
   design's stored choice whenever one is set, and only otherwise counts the real kinds. `DesignSettings.tsx:96` and
   Guided's `Build.tsx:192` use it as the `<select>` value, so when joints differ the list lies, and re-picking the shown
   value fires no change.* (J-b, J-e, J-f)
2. **The list offers kinds the change then refuses.** `groupKinds` (`jointDefaults.ts:134`) gathers kinds from every
   joint in the group, including boards of another material; `setAllJoints` (`ops.ts:1966`) silently skips those and
   doesn't count them.* A plywood design with one card board, *Corners → Glue*: `{changed: 0, kept: 2}`, list says Glue.
3. **The tray card has its own copy.** `TrayUI.tsx:101/110` shows `tray.wallKind / cornerKind`, ignoring per-joint
   edits; its options (`:78`) leave out `butt`, so an open-base tray shows its first option and picking it does nothing.
   `setTrayKinds` (`ops.ts:557`) doesn't check the board pair, and `solve` reverts it. (J-f, J-g, J-h)
4. **`solve` overrides after the count.** `setAllJoints` counts before `solve` (`ops.ts:1971–1981`); `fixKind`
   (`flatnet.ts:67–91`, called from `ops.ts:229/266`) then forces flat-net walls to glue or butt and hinged corners to
   fold.* An open carton: *Wall to base → Glue* reports 4 changed, 3 revert.
5. **Broken joints are replaced or dropped.** After the change `autoConnect` (`ops.ts:762`) deletes broken automatic
   seams and `connectSeam` / `fallBack` (`ops.ts:703, 734–746`) re-make them as tabs → glue → slide, or drop a corner
   (`:779`). The half-lap corners in J-a / J-e fit this path; the note still counts the joints as changed.
6. **Groups are too broad and have holes.** `jointGroup` (`jointDefaults.ts:81`) puts every grown joint in *Wall to
   base*: dividers (J-d) and a carton's tuck-lid hinge, which *Wall to base → Glue* turns from a fold into a glue flap.*
   Rounded corners, lid closures and half-laps return `null` and are never touched or listed (J-i).
7. **Later actions undo a choice.** `setMaterial` (`ops.ts:1838`) re-runs `setAllJoints` through `applyJointChoices`
   and wipes hand-set joints.* Made models (`reassemble.ts:368–388`) never read the design's joint choices.
   `reconcileWallSets` (`ops.ts:328`) copies a leader wall's kind onto its derived walls.
8. **Four "allowed" rules.** Design card and 3D popover use `allowedKinds`; `setConnection` and `solve` use `pairKinds`;
   the part card's *Joints (advanced)* uses `kindsFor` (`Connections.tsx:25–30`); the tray card uses the base's
   material. So one place offers a kind another silently ignores.
9. **The note can't be trusted.** It is computed before `solve`, leaves out skipped joints, names none of them, isn't
   shown in Guided, and stays on screen after later edits.

### 10.2 Proposed fix — make the mechanism rigid

1. **One path for every change.** A new `src/model/jointPlan.ts`:
   - `planJointChange(d, scope, kind)` returns one row per joint in scope: `{id, from, to, status}`, where status is
     *will change · already · not allowed (reason) · other material · managed by the app (flat net, carton, wall set) ·
     not in this group*. Scope is a group, a tray's walls or corners, or one joint.
   - `applyJointChange(d, plan)` applies it, runs `solve` and `autoConnect`, then **reads the kinds again** and returns
     what really happened.
   - The design card, Guided, *No glue*, the tray card, the 3D label popover, the part card and the material change all
     call it; nothing else writes `c.kind` for a user choice.
2. **One rule for what is allowed:** `allowedKinds` (board-pair aware) everywhere; remove `kindsFor`; the tray card
   offers what that tray's joints can all take.
3. **Groups by role, not by geometry.** Give each joint a `role` (*wall · corner · divider · lid hinge · closure · seam*).
   *Wall to base* covers walls (dividers get their own row or are named in the note); lid hinges and closures keep their
   own controls. A rule that forces a kind (walls on the base's face → half-lap corners) is shown in the corner list as
   the forced kind, greyed, with its reason — never stored as a choice that applies later.
4. **Lists show the truth.** The value comes from the joints in scope; when they differ, show a disabled *Mixed (3 Tabs,
   1 Fingers)* entry so every real kind fires a change. Kinds no joint can take aren't offered.
5. **An honest result.** Counts come from after the solve. Every joint not changed is listed by name with its reason and
   a *select* link. Shown in Guided too, and cleared on the next edit.
6. **A user's pick is kept.** A `userKind` set only by an explicit per-joint pick; material changes, group changes,
   *Make again* and wall sets respect it. When `fixKind` must override it, the plan reports the conflict instead of
   doing it silently. Made models apply the design's group choices to new edges.
7. **Template rebuilds keep or report.** A lid or spaces change that removes parts (J-j) says what was removed, or is
   greyed with the reason (*Spaces can't be used with a hinged lid*).

**Files:** `jointDefaults.ts`, `ops.ts` (`setAllJoints`, `setTrayKinds`, `setConnection`, `applyJointChoices`,
`setMaterial`), `flatnet.ts`, `reassemble.ts`, `types.ts`, `DesignSettings.tsx`, `TrayUI.tsx`, `Connections.tsx`, the 3D
seam pills in `View3D.tsx`, `guided/steps/Build.tsx`, `MakeCard.tsx`, and both i18n files.

**Tests that pin it down** (`tests/jointplan.test.ts`): after any change, every joint in scope has the kind or appears
in the result with a reason; a mixed group shows *Mixed* and re-applying the previously shown kind changes the rest; the
forced half-lap case never reports "0 changed" with the new kind shown; a tuck-lid hinge is untouched by *Wall to base*;
a hand-set joint survives a material round trip and *Make again*; the part card, popover and both cards offer the same
kinds for the same joint. The browser routine now has matching checks as plan section **J1–J6**.

## 11. Other findings, third pass

**High**
- **Two tabs lose work (A10).** With the same design open in a second tab, the first tab's change sat on *Saving…* for
  more than 20 s and never saved. Closing the other tab didn't help. After a reload the change was gone (*Fold it* had
  switched the design to card; it came back as plywood). Reproduced twice, once from a clean reload. One tab alone
  saves within a second.
  *Correction, checked while planning:* the first tab **does** show *"This design was changed in another tab. Reload ·
  Keep mine"*. My first check looked for it in the second tab only. The real faults:
  - Merely **opening** the design in a second tab raises the alarm; nothing was changed there. The new tab saves on
    load.
  - While the alarm is up, autosave stops (`src/store/hooks.ts:53`), but the label still says *Saving…* instead of "Not
    saved".
  - Unless *Keep mine* is pressed, later work in that tab is lost on reload.
- **Empty design is "Ready to cut" (H2, confirms #1).** Guided *Send* on an empty design shows *Ready to cut ✓*, an
  enabled *Download the file*, *Watch it go together* and *Print a plan*. *Decorate* says "Tap a side of the box" with
  no box. Workshop's *Download for laser* button stays enabled; the dialog then shows *1 sheet(s), 0 piece(s)* with a
  greyed *Download* and no reason.
- **Guided decorations are placed on top of each other (B6).** A new *Sticker* and a new *Window* both land exactly on
  the name in the middle of the side. A cut-out window can be dragged onto the engraved name with no limit or note.
  *Ready to cut ✓* still shows. *Copy* only deselects; no copy appears.
- **Decorations vanish when Sides change (B8).** A name on Pyramid's *Panel 8* disappeared without a note when *Sides*
  went from 8 to 5.
- **Pyramid net mislabelled (B8).** A triangle is labelled *Base* and the pentagon base is *Panel 6*. Diamond's net has
  a triangle labelled *Base* too.
- **Use less board ignores No glue (C8).** With *No glue* on, *Use less board* offered "11% less board, with 2 more glue
  joints". *Do it* added glue flaps back (*No glue* stays ticked) and the sheet went from 39% to 40% used.
- **Diamond from boards (E20).** In plywood, *Build from boards* on a diamond made 25 boards that stick out unevenly,
  with **no problem listed** and no *Fold it instead* / *Fewer faces* offered.
- **Rounded box: two different minimum radii (I1, I11).** Workshop's rounded rectangle defaults to **15 mm**. The card
  warns it needs **21.5 mm**, but walls are extruded anyway. The download check then lists four corners "tighter than
  its material bends … needs 18.8 mm", each with its own *Fix* (no *Fix all*). After fixing (18.9 mm) the card still
  warns that it needs 21.5 mm. One rule, two numbers.
- **Arched lid never works on a rounded box (I9).** At 40, 80 and 150 mm tall it is refused with "needs a box tall
  enough for the material's bend and a flap below it", which doesn't say how tall. At 80 mm there was no note and no
  lid either.

**Medium**
- **Level switch renames the design (H1).** Switching an *Untitled design* to Guided renamed it *My thing*.
- **Guided gallery's board chip ignores the design (B1).** A plywood design opened the gallery with *Thick paper / card*
  selected.
- **Typed sizes are clamped silently (B5).** Typing 5 mm for Box width made it 10 mm with no note. Pyramid at 200 mm
  refuses Sides 5–8 with "That would make it impossible to cut", which doesn't say why (the sheet). The slider still
  reaches 8.
- **Divider grip on top of the width arrow (B3).** A divider slid near a wall puts its round grip on the *Wide* arrow,
  and the divider can't be tapped there to remove it.
- **Quick build card for a box is the Workshop part card.** It shows "Base", *Edit outline*, *Extrude walls* (while
  drawing) and the jargon note "Corners can't be creased: the walls already fold from the base, so a crease would close
  a loop. Glue one side." A carton's card is titled *Panel 3*; a wall's card says "follows the edge of panel Panel 5".
- ~~**Template boxes have numbered parts.**~~ *Corrected while fixing:* the numbers were the stored names, read from the model; the editor shows role names over them (*Base*, *Front wall*). The real naming faults were a second box's base (*Panel 3*) and a pyramid's net (a side called *Base*), fixed in milestone 137.
- **Wall / lid picks the wrong edge (C3).** Clicking the open box's back top edge took the front wall of the carton
  behind it ("Front wall · top edge").
- **Kind resets in the Box tool (C2).** After *Regular* + *Open box*, going back to *Rectangle* selected *Carton* again.
- **Stale notes carry over.** A new design's settings card showed "22 joints changed" from the previous design; the
  Make card kept "The material changed: 2 joints were chosen again" after *1 Shape* → *Fold it*.
- **Hinged lid drops dividers (J-j above)**, with only a vague reason.
- **Make card wording.** "It lies flat in 2 pieces (one piece would overlap itself)" when the 2 pieces are just the
  box and its lid by a cut.
- **Detach asks with a native browser confirm** (*"Detach: the boards stay as they are… Go on?"*), like sketch *Cancel*.
- **Card divider in a plywood box is nearly invisible in 3D (D11).** The cut plan and SVG are right (its own sheet,
  slots sized for 0.5 mm); in 3D it is a hairline.
- **After reload the 3D stage was blank** until switching to the cut plan and back (seen once, with an oval box).
- **Show how it goes together (C12)** zooms so close that most of the animation is off-screen or behind the card.

**Low**
- Counts: *1 pieces*, *1 faces left open*, *1 shapes*, *sheet(s) / piece(s)* (H11).
- *Standing board* shows its shortcut as *D D*, sharing *D* with *Divider*.
- Guided face-on view for a pyramid says *Back to the box*; faces are *Panel 1…17*.
- The project menu has both *Save project* and *Save the whole project* with no hint of the difference.
- *Your designs* lists many identical *Untitled design* rows with generic thumbnails.
- In the SVG, every rounded corner arc is followed by three tiny straight segments (~0.75 mm), not a clean arc end.
- *Print a plan* opens a pop-up that the in-app browser blocked, so the print page was not checked.

**Accessibility (H12)**
- The material radios on the welcome screen are named by their description; three share the same name.
- Each design row's *open* button has no name.
- Guided's *Width / Height / Sides* sliders have no names.
- Lid buttons (*None / Lifts off / Hinged*) don't expose which one is selected (no `aria-pressed`).
- The editor's controls stay in the accessibility tree behind the welcome screen.

**Passed**
- B3 (width typed, divider added, slid, removed); B9 Diamond (17 faces at 8 sides, 21 at 10, folds into a gem).
- C2 (lid beside the box, *Put on*, carton tuck top, regular footprint); C4 (dividers run on, compartments shown, cut
  plan has half-laps); C7 (carton bottoms, one undo step each); A8 (undo / redo one step each).
- D4 (pentagon box with finger joints); D6 (angled divider, 112°); D10 (joint label → *Tabs*); D11 (card board on its
  own sheet; file names per material).
- E5 (hull); E13 (corrugated: "2 joints were chosen again"); E15 (*Leave this face open* / *Close them all*); E16 (lid
  by a cut); E19 (detach, undo); E21; E22 (ring + sphere: 12 pieces, no freeze).
- I11: arcs are true arcs (`A` commands); hinge slits sit 12 mm inside the wall's edges, clear of the joints.

## 12. Still not run

- A9 (save and open a project file), A11 (the tour is off), G3 (offline needs the network turned off, not possible in
  the in-app browser), F (needs the teacher key and the Worker back end).
- C5, C6, C9–C11; D5 (covered by C3), D8, D9, D12, D15, D16, D18, D19; E6–E8, E14, E17, E18.
- H4–H6 and H8 as dedicated runs (covered in passing); I8 needs a hinged-lid bend on card.

---

# Fix round — results (milestones 134–145, 20 November)

The fixes for this report were built as `QA_FIX_PLAN.md`'s milestones 134–145, each committed on
`claude/modest-ride-j5iqa3` with its notes in `PROGRESS.md`. The safety nets of 134 stay in `npm test`:
- `tests/qa/` (every repro that could be shown in the model);
- the fuzzer's joint promise checks;
- the copy ratchet;
- a fold check of every shape tile.

**Every model-level repro now passes.**

## 13. What changed, by finding

| Finding | Status | Milestone |
|---|---|---|
| §10 joint types: not all change, or none (J-a…J-i) | Fixed at the cause. Tray walls with tabs into the base ran past each other and became half-laps; they now span the inset ring. Lists show the real kind or *Mixed*; only kinds that do something are offered; the note counts what happened; hand-set joints survive a material change. | 135 |
| A10 two tabs | Fixed: opening a design in a second tab no longer raises the alarm; *Not saved* instead of *Saving…* while a conflict waits. | 136 |
| #1, H2 empty design ready to cut | Fixed: `val.empty`; Guided opens its gallery on an empty design. | 137 |
| H11 counts, "(s)" | Fixed for 17 strings (plural forms in `translate`); 30 counted strings remain on the ratchet's list. | 137 |
| Names (*Panel 3*, pyramid *Base*, "panel Panel 5") | Fixed. | 137 |
| I1/I11 two minimum radii | Fixed: one rule (the export check's). | 138 |
| C1 hinged lid on rounded box | Gated with a reason (owner's decision). | 138 |
| C3 converting to rounded corners | *Round the corners* on the box card; *Curve* greyed with its reason; *Round* starts at the least radius. | 138 |
| C7 inside height on a lid change | Fixed. | 138 |
| I9 arched lid | Its reason names the sizes it needs; a lid that cannot be made says so. | 138 |
| C2 Hinged → None | Not reproduced: the design afterwards is identical, and the stage draws it whole. | — |
| Workshop sees tight bends only at download | The problems badge shows in Workshop while something blocks cutting. | 138 |
| #2 sketch inside a shape | Fixed: moved beside, 10 mm clear. | 139 |
| B6 decorations stacked | Fixed: the free place nearest the middle. | 139 |
| B8 name lost when *Sides* changes | Fixed for Guided's ready shapes. | 139 |
| *Fit view*, new design's camera, below the floor | Fixed: framed beside the card, from above, on open. | 139 |
| #3, H1 level switch | Fixed: one place in every level, the Shapes stage and Guided included. | 140 |
| #7, §2.3, §2.4 *Joints* / *Outlines* | One row under the card, one *Done*, new icon; off on a new design. | 140 |
| #4–#5 gizmos | Rings coloured by axis; *Across* and *Front to back* fields. Arrow scaling, the visible snap and the board ring are not done. | 141 |
| B5 silent clamp, Guided's generic refusal | Fixed: the note says why. | 142 |
| C8 *Use less board* vs *No glue* | Fixed. | 143 |
| Native `confirm` / `alert` / `prompt` | Replaced in all 8 files by the app's own dialog. | 143 |
| #8 sketch label blotches | Fixed (halo sized to the text). | 143 |
| §5 / §11 accessibility | Material radios and design rows named; editor inert behind the welcome screen. | 144 |

## 14. Reported by the owner during the round

- **A rounded open card box changed to plywood became "a ridiculous object".** Its walls kept card's fold to the base,
  which plywood allows as a living hinge, so every wall became one and the net lay over itself; its corners were also
  too tight. Fixed: a change of board kind gives the new board's defaults to joints it would never choose for a whole
  box, and grows the corners to its least radius. In the dev server, card → plywood now ends as a plywood box made
  from the start, with nothing flagged.
- **Folded shapes listed many problems** (a 4-to-8 loft in card). Faces that meet only at a corner of the shape were
  taken as boards colliding (loft: 4) or unjoined (cone: 24). Fixed for folded models; every shape tile now folds from
  card with nothing to fix. In the dev server the folded loft lists none.

## 15. Corrections to this report

- **A10:** the first tab does warn; the faults were the false alarm and the *Saving…* label.
- **J-j:** the template card notes the removed spaces; only its reason was vague.
- **Numbered parts (1–6, two named 6):** these were stored names read from the model; the editor shows role names over
  them.
- **Lid buttons:** they do expose their state (`aria-checked`).

## 16. Still open

- **Not done in this round:** the gizmos' arrow scaling and visible turn snap; separating the Workshop board ring from
  its arrows and labels; Quick build's *Wall / lid* picking an edge behind the one clicked; Guided's divider grip on
  the width arrow; the 30 counted strings left on the ratchet.
- **Seen once, not explained:** after a reload the stage drew nothing until *Fit view*. It happened only while the
  in-app browser pane was hidden (a hidden page gets no animation frames); with the pane shown the stage drew at once.
- **Not tested:** the teacher view (F) and offline (G3), as before.
- **Structural curved walls:** gated now; they need a plan of their own (owner's decision).
