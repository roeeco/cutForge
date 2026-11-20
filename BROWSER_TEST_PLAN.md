# CutForge — browser test plan (for an agent using a browser)

A list of tests, grouped by user level and use case, each with what to do and what to see.
It is written for an agent that drives a real browser (clicks, typing, screenshots), not for
the automated Playwright suite in `tests/e2e/`.

## How to run it

- **Where:** the preview link you are given (a `…workers.dev` URL), or `npm run dev` on a local
  checkout of `claude/modest-ride-j5iqa3`. If the site asks for a password, ask the owner for it.
  Never write the password, a teacher key or a student name into a report.
- **A clean start for each section:** open a fresh browser profile or private window, so the
  level, language and saved designs start from scratch. A new browser starts in the **Workshop**
  in English.
- **Window sizes:** run each section at **1366 × 768**. Run the tests marked **[1024]** again at
  **1024 × 768** (a school laptop).
- **Language:** run each section in English. Run the tests marked **[HE]** again in Hebrew: the
  language button (*עברית*) is in the top bar and on the welcome screen. In Hebrew the layout runs
  right to left, and nothing should be clipped or overlap.
- **Changing level:** the level switch in the top bar reads *Guided · Quick build · Workshop*. On a
  narrow window it is in the **⋯** menu.
- **Guided is taps only.** In Guided, use only clicks and typing into fields: no keyboard
  shortcuts, no right-click, no double-click.
- **Downloads:** whenever a test downloads a file, open it (SVG in the browser) and look at it:
  red lines are cut, blue are scored, black are engraved, green are guides.

### Recording results

For each test, record:
- **Result:** pass, fail or blocked.
- **Steps that differed** from the instructions.
- **What you saw**, with a screenshot of the end state and of any failure.
- **Browser console errors**, if the agent can read the console.

A test fails when:
- an expected thing does not happen;
- an error page or a blank stage appears;
- a button stays greyed with no reason given;
- text is cut off or overlaps at the tested size;
- an undo does not bring back the earlier state.

### The UI sweep: on every screen, in every test

Functional tests miss most visual and consistency bugs. While you run any test, check each new screen and state against
this list, and record what you find as a **UI issue** with the screen, the window size, the language and a screenshot.
A UI issue does not fail the test it was found in. List it separately in the report, ranked *high* (wrong or misleading),
*medium* (gets in the way) or *low* (cosmetic).

1. **Fit.**
   - No text is cut off or ellipsed where the full word matters: names, chips, font previews, button labels.
   - No label is wider than its button.
   - No horizontal scroll.
   - Check at 1366, at 1024 and in Hebrew.
2. **Overlap.** Nothing covers anything else unless it is meant to. Look in particular at:
   - tooltips over panels;
   - stage labels over gizmos or over each other;
   - warning chips over size labels;
   - pop-ups over the hint bar;
   - the right-hand card over the model;
   - floating buttons over the sheet.
3. **One visible state.**
   - Exactly one tool looks active on the rail.
   - A toggle clearly shows whether it is on.
   - A mode that stays on (Joints, Outlines, Follow, Frame) is visible while it is on.
   - Every mode has a visible way out (a *Done* or the same button), and Esc behaves the same everywhere.
4. **Truthful status.**
   - Badges, ticks, goals and *Ready to cut* match what is on the stage. For example, an empty design is never *ready*.
   - Counts use the right number form (*1 piece*, not *1 pieces*).
   - A greyed control says why when tapped.
5. **Same thing, same word.** The same action, size or object has the same name in every level and panel. Check these pairs against each other:
   - *Joints* / *How it's built*;
   - *Download* / *Download for laser*;
   - *Width · Depth · Height* / *W · H* / *Width · Height*;
   - the design's name in the top bar, in Guided and in *Your designs*;
   - the level's name in the switch and in menus.
6. **No duplicates.**
   - One action has one main place. Note any action reachable from two places on the same screen, such as *Edit outline* in the card and *Outlines* in the bottom bar.
   - The same help text should not appear in both the tool panel and the hint bar.
   - A sentence or card should not repeat itself.
7. **One meaning per icon.** No icon is used for two different tools (for example, the pentagon for both *Sketch* and *Outlines*).
8. **No flashes or jumps.**
   - No blank screen longer than about ⅓ s after a level, view or step change.
   - No layout jump when pictures load.
   - The camera does not jump on a plain selection.
   - A new object appears in view, not under the card, off-screen or inside another object.
9. **Handles and gizmos.**
   - Handles are large enough to grab (about 24 px or more) and scale sensibly with zoom.
   - Each axis has its own colour.
   - Handles are not hidden by the object they move.
   - A live number (distance, angle, size) shows while dragging, and the card can type the same value.
10. **Drawn text on the stage.**
    - Measurements, snap labels and seam numbers are legible at the closest and farthest zoom.
    - They have no blotchy halos and do not collide with engravings or piece names.
11. **Accessible names.** Every control has a unique accessible name that says what it does. Read the page's accessibility tree once per screen: no unnamed buttons, and no several radios sharing one name.

---

### Test format

Each test has:
- an **ID** (section letter and number);
- a **goal**;
- **steps**;
- **expected** results.

Run the tests of a section in order unless a test says otherwise.

---

## A. Welcome screen and things shared by every level

**A1. The welcome screen loads [1024] [HE]**
- Steps: open the site in a fresh profile.
- Expected:
  - *What are you making?* is shown, with the four material cards and step 2 (*Blank design*, the sentence and, in Workshop, *Shapes*).
  - There is no horizontal scroll bar.

**A2. Language toggle [HE]**
- Steps: press *עברית* on the welcome screen, then press it again.
- Expected:
  - Every label switches to Hebrew, and the layout runs right to left.
  - It switches back to English and left to right.

**A3. A blank design**
- Steps: choose *Plywood 3 mm*, *Blank design*, *Start*.
- Expected:
  - An empty 3D workspace with a floor grid.
  - The material pill in the top bar reads *Plywood 3 mm*.

**A4. The sentence**
- Steps:
  1. On the welcome screen choose *Thick paper / card*.
  2. In the sentence, set *a box* that is *160* wide, *110* deep and *45* mm tall *inside*.
  3. Open **+ more**, add a lid that lifts off, and press *Start*.
- Expected:
  - The line under the sentence measures the box as you type.
  - After *Start*, a card box with a lid stands on the stage, and its card shows the same words.

**A5. A word the material cannot make**
- Steps: in the sentence choose *a carton*, then switch the material to *Plywood 3 mm*.
- Expected: the sentence changes what it says and a note explains why (for example, a carton on plywood becomes a box with a lid that lifts off).

**A6. Your designs**
- Steps:
  1. Make any design.
  2. Open the project menu (next to the design name) and choose *New design*.
  3. Open *Your designs…*.
- Expected:
  - Both designs are listed.
  - Open, duplicate, rename and delete each work; a deleted design can be restored.

**A7. Autosave and reload**
- Steps: change any design, wait for the save mark in the top bar, then reload the page.
- Expected: the same design comes back as it was left, including its view.

**A8. Undo and redo**
- Steps: in any level, make three changes, press Undo three times, then Redo three times.
- Expected: each step goes back and forward exactly one change.

**A9. Save and open a project file**
- Steps:
  1. In the project menu, choose *Save project*.
  2. Start a new design.
  3. Choose *Open* and pick the saved file.
- Expected: the design comes back exactly as it was.

**A10. Two tabs**
- Steps: open the same design in two tabs and change it in one.
- Expected: the other tab says it is out of date and offers to reload; neither tab overwrites the other.

**A11. The tour (Workshop)**
- Steps: on the welcome screen take the tour, following each card. Then take it again, using *Skip step*, *Back* and *End tour*.
- Expected:
  - Each step moves on by itself once it is done.
  - At the end a small box exists and is kept.

---

## B. Guided (level: *Guided*)

Switch to *Guided* in the level switch, or start in a class locked to Guided. Use taps only.

**B1. The gallery [1024] [HE]**
- Steps: open Guided's start.
- Expected:
  - *What do you want to make?* is shown, with the missions (*Pencil box*, *Dice tray*, *Card stand*, *Game organiser*).
  - Then *Box*, *Box with a lid*, *Round box*, *Carton*, *Pyramid* and *Diamond*, each drawn as a picture.
  - Board chips (or the class's board) are shown.
  - A thing the board cannot make is greyed and says why when tapped.

**B2. Pencil box, the whole path**
- Steps:
  1. Tap *Pencil box*; dismiss the gestures' pictures with their button.
  2. In **Build**, tap *What goes inside*, then pencils, then **Make it fit**.
  3. In **Decorate**, tap the front side, then *Name*; type a name.
  4. Go back, then **Send** → **Download the file**.
- Expected:
  - The pencil goal turns green after *Make it fit*.
  - The name lands on the front and the name goal turns green.
  - Send shows *ready*, three stars and the sheet, and an SVG downloads.

**B3. Build a box by touch**
- Steps:
  1. Tap *Box*.
  2. Pull the width arrow, then tap its size label and type 150.
  3. Tap a space and split it *Front to back*; slide the new divider by its round grip.
  4. Tap the divider and remove it.
- Expected:
  - Each change happens at once and is one undo step.
  - Sizes are the inside, and a size the sheet cannot take stops at the largest that fits.

**B4. Lids in Guided**
- Steps: tap *Box with a lid*, then choose *Lid*: *None*, *Hinged*, *Lifts off*; then Undo.
- Expected:
  - The lid changes each time.
  - Undo brings back the previous lid, and the sheet's word for the lid follows.

**B5. A change that cannot be cut is refused**
- Steps: in *Box*, try to make the box tiny, or split a space below the minimum.
- Expected: nothing changes, and a note says why.

**B6. Decorate**
- Steps:
  1. Tap a side.
  2. Add *Name*, *Sticker* and *Window* (*Cut out* and *Engrave*).
  3. Drag them, resize them, *Copy* one and *Remove* one.
- Expected:
  - Each item stays a safe distance from the edges, the corner teeth and the other cut-outs.
  - A note says why when a drag stops short.

**B7. Send's tools**
- Steps: in **Send**, try *Use less board*, *Watch it go together*, *See it flat* and *Print a plan*.
- Expected:
  - The pieces move closer on the sheet, the box folds up, it lies flat, and a print page opens.
  - The printed page has a title block.

**B8. Pyramid**
- Steps:
  1. Tap *Pyramid*.
  2. In **Build**, move the *Width*, *Height* and *Sides* sliders, including Sides 3 and 8.
  3. Go to **Decorate**, add a name on one face, then come back and change *Sides*.
  4. **Send** → download.
- Expected:
  - The material is always card, even if another board was chosen.
  - The pyramid updates after each slider move; no change is refused.
  - The name stays on its face after the size change.
  - Send's check is clean and the SVG is a folding net with glue flaps.
  - In the printed plan, the title block has a line *Seams, in order: 1 glue · 2 glue …*.

**B9. Diamond**
- Steps: as B8 with *Diamond*, Sides 6 to 10.
- Expected:
  - 17 faces at 8 sides, 21 at 10.
  - The fold preview (*Watch it go together*) closes into a gem.
  - The download is a card net.

**B10. Guided's menu**
- Steps: in the top bar menu, try *Start something new*, *Save a copy*, the language, *More tools (Quick build)* and *All tools (Workshop)*.
- Expected: each does what it says; the design is unchanged by a level change.

**B11. Nothing of the other levels shows**
- Steps: look at every Guided screen.
- Expected:
  - There is no tool rail, joints toggle, material pill or level-switch row inside the editor.
  - There is no *Fold it* / *Build from boards* bar.

---

## C. Quick build (level: *Quick build*)

**C1. Box action [1024]**
- Steps:
  1. On the rail, choose **Box**.
  2. Pick the footprint *Rectangle* and the kind *Open box*.
  3. Drag on the floor, drag the height arrow, press ✓.
- Expected:
  - The walls rise as a ghost.
  - ✓ makes the box as one undo step, and the rail returns to Select.

**C2. Box kinds and footprints**
- Steps: repeat C1 with *With a lid*, then *Carton* (on card); then the *Regular* (6 sides), *Rounded* and *Round* footprints.
- Expected:
  - *With a lid* makes a lid lying beside the box.
  - *Carton* makes a tube with a tuck top and a snap-lock bottom.
  - The round footprint makes a round box no tighter than the walls bend.

**C3. Wall / lid**
- Steps: choose **Wall / lid**, click a free top edge of an open box, then ✓.
- Expected: a lid that opens (hinged on card, lifts off on plywood); never glued or finger-jointed shut.

**C4. Divider and standing board**
- Steps:
  1. Choose **Divider** and draw a line inside a box that stops short of the walls; press ✓.
  2. Draw a second line crossing the first.
  3. Choose *Standing board* and draw a board on the floor.
- Expected:
  - The ends run on to the walls and compartment sizes show.
  - Crossing dividers get half-laps.

**C5. Hole and Text & stickers**
- Steps: add a circle *Hole* on a wall, a text, and a sticker; then drag the hole towards an edge.
- Expected: the hole stops a safe distance from the edge, with an amber limit line and a note.

**C6. Ready to cut and Fix**
- Steps:
  1. Switch to Workshop and make a wall too small for its joints.
  2. Switch back to Quick build.
  3. Open the badge (*1 thing to fix*) and press **Fix**.
- Expected: the badge returns to **Ready to cut ✓**.

**C7. The Lid section and carton bottom**
- Steps: on a box's card, try *Lid: None · Lifts off · Hinged*, then *Put on*; on a carton try *Bottom* (*Snaps shut · Tucks in · Flaps to glue*).
- Expected: each changes in one undo step; a greyed choice says why when tapped.

**C8. No glue, and Use less board**
- Steps:
  1. On a card box, turn on **No glue** in the settings card.
  2. In the cut plan, press **Use less board**, then *Do it*.
- Expected: the corners become slit locks; the plan uses fewer sheets and says how many more glue joints.

**C9. What goes inside**
- Steps: on a box's card, add dice to a compartment, then drag them to another.
- Expected: green when they fit, amber with how much more room is needed.

**C10. Missions**
- Steps: start each Quick build mission (*Pencil box*, *Dice tray*, *Card stand*, *Game organiser*, *Escape box*) and complete one.
- Expected: the goals tick off and stars appear; clicking a goal selects what it is about.

**C11. Workshop parts are read-only**
- Steps: in Workshop, make an angled panel; switch to Quick build and select it.
- Expected: its card is read-only with *Open in Workshop*; **More…** shows its Workshop version.

**C12. Show how it goes together**
- Steps: press the play button by the view settings.
- Expected: the nets fold and each piece comes in from above, in turn.

---

## D. Workshop: boxes and boards (level: *Workshop*)

**D1. Shapes tool: a board**
- Steps:
  1. Press `P` (Shapes), choose *Rectangle* and **Board**.
  2. Drag on the floor; set W and H by typing on the stage labels.
- Expected: the board is made and selected, and the rail returns to Select.

**D2. Grow a wall**
- Steps:
  1. Hover a board's edge and click it.
  2. Drag the angle ball to 90°, set the height, choose the joint, press ✓.
- Expected:
  - Plywood offers fingers and tabs; card offers folds and glue flaps.
  - The cut plan shows matching joints.

**D3. Extrude walls**
- Steps: on a base with no walls, choose *Extrude walls*, drag the height, then ✓; delete one wall, then press *Wall it*.
- Expected: walls stand on every straight edge; a deleted side opens and *Wall it* closes it.

**D4. Polygon, round and rounded bases**
- Steps: with `G`, click a pentagon; with *Round*, draw an oval; with *Rounded*, draw a rounded rectangle; extrude each.
- Expected:
  - Curved walls bend round (living hinges on plywood, glued lips on card).
  - Arcs are true arcs in the SVG.

**D5. Edit outline**
- Steps: on a base, choose *Edit outline*; drag a corner, add a point with **+**, and make one point *Round*.
- Expected: the walls follow the new outline.

**D6. Dividers (`D`)**
- Steps:
  1. Draw a divider that stops short of the walls, a crossing one, and one at an angle with Shift.
  2. Slide a divider by its arrow; type a compartment size.
- Expected: the ends run on, half-laps appear, and a line that cannot be made is amber and says why.

**D7. Lids**
- Steps: on a box's card, try *Lid*: *Lifts off* (each kind: *Cap*, *Flat*, *Drop-in*), *Hinged*, *Arched*; then *Put on* / *Take off*.
- Expected: each lid fits its box; a greyed kind says why.

**D8. Closures**
- Steps: grow a lid off a card box's back wall across to the front; on its card choose each *Closes the box* style.
- Expected: tuck flap, slit locks, tab lock, rests on the walls, glued; dust flaps appear where they belong.

**D9. Cartons**
- Steps: on a card tray's card, set *Base: Open (a tube)*, *Top: Tuck flap*, *Bottom: Snap-lock*.
- Expected: one strip of walls glued at one corner, and the net lies flat.

**D10. Joints view**
- Steps: press *Joints*, select a wall, click a joint label and change its kind.
- Expected: the joint changes; the card lists its kind and options.

**D11. Material for each board**
- Steps: on one board's card set *Material* to card while the design is plywood.
- Expected: its joints change and the card says which; the cut plan puts each material on its own sheets.

**D12. Material drawer and board grades**
- Steps: click the material pill and open *More boards…*; choose *Greyboard 2 mm*.
- Expected: the pill names it, and a box keeps its stated inside size.

**D13. Bends and the fold slider**
- Steps: on a hinged lid's *Bend*, set a radius and a pattern; move the fold slider at the bottom.
- Expected:
  - The fold curves.
  - A pattern that cannot reach is greyed with a reason.
  - The slider unfolds the net without changing the design.

**D14. Cut plan, Nets and editing in 2D**
- Steps:
  1. Switch to **Cut plan**; turn on *Dimensions*.
  2. Drag a piece; press *Repack*, *Nest* and *Save material*.
  3. Switch *Sheets · Nets*.
- Expected:
  - The yield line updates.
  - *Nets* shows each net with a folded preview, and hovering highlights the same face.

**D15. Solo view, copy and paste**
- Steps:
  1. Double-click a panel for its face-on view; add a text and a cut-out.
  2. Copy the cut-out (Ctrl+C) and paste it (Ctrl+V) on another panel, then press ✓.
- Expected: the shapes appear on the right panel and in 3D.

**D16. Lines**
- Steps: with `L`, draw a *Crease*, a *Perforation* and a *Cut* line across a board's edge.
- Expected: dashes appear; a cut from edge to edge is flagged.

**D17. Download**
- Steps: press **Download for laser**; download SVG, then DXF, then *Compensated*; turn on names and sizes on the guide layer; then *Print a plan*.
- Expected:
  - The files are true size, with the colours as above.
  - The file name says nominal or compensated and the kerf.
  - The print page has one page per kind of piece.

**D18. The export check**
- Steps: make two panels touch without a joint, then open the download.
- Expected: the check lists it; clicking the message selects both panels.

**D19. Splitting a net too big for the sheet**
- Steps: make a card tray larger than the sheet.
- Expected: the net is cut at a fold into pieces that fit; the board's card offers *Automatic · Keep whole · Cut here*.

---

## E. Workshop: shapes to folds and boards (milestones 119–133)

Start each test from the welcome screen: choose the material named, then **Shapes**, then *Start*.
Wait until the *Loading* note on the stage disappears.

**E1. The shape stage [1024] [HE]**
- Steps: start *Shapes* in card.
- Expected:
  - The top bar shows *1 Shape · Fold it · Build from boards* in place of the level switch.
  - The shape rail and the *Your sculpture* card are shown.
  - *Fold it* and *Build from boards* are greyed until a shape is placed.

**E2. Place and size shapes**
- Steps:
  1. Press `S` (Shapes); click each tile in turn: box, cylinder, cone, prism, pyramid, sphere, half sphere, ring, wedge, roof, diamond, loft.
  2. For one of them, type Width, Depth and Height in its card.
- Expected: each shape appears selected, with its own fields (sides, top, crown, table, top sides, top size).

**E3. Move, turn and size handles**
- Steps:
  1. Select a box; use *Handles: Move · Turn · Size*.
  2. Drag an arrow, turn it on a ring, and click the W label on the stage to type 70.
  3. Press the arrow keys, then hold one down; press Shift with the arrow keys.
- Expected:
  - Each handle works.
  - An arrow press moves 1 mm and Shift moves 5 mm.
  - A held key is undone in one step.

**E4. Solid, Hole and Combine**
- Steps:
  1. Place a box and a cylinder that goes through it; make the cylinder a *Hole* (`H`).
  2. Shift-click both and press *Combine*.
- Expected: the hole cuts through the box. *Ungroup* gives the two shapes back.

**E5. Hull, taper and chamfer**
- Steps:
  1. Place a prism and a pyramid; select both and press *Wrap in a hull*.
  2. On a box, set *Top width* 60%.
  3. On another box, open *Chamfer* and tick *Top edges*, distance 6.
- Expected: one flat-faced body, a frustum, and bevelled top edges.

**E6. Workplane and drop**
- Steps:
  1. Press `W`, then click the top of a box; place a new cylinder from its tile.
  2. Press `D` with a raised shape selected.
  3. Press `W`, then click the floor.
- Expected:
  - A blue square marks the workplane, and the cylinder stands on the box's top.
  - `D` drops the shape onto the plane; the floor click puts the plane back on the floor.

**E7. Line up, mirror, Edit group, protractor**
- Steps:
  1. Select two shapes; in *Line up*, press X min, then Z middle, then the mirror button on X.
  2. Combine two shapes and press `E`.
  3. Press `P`, then click two faces of a box at right angles.
- Expected:
  - The shapes line up and swap sides.
  - `E` opens the group in place.
  - The hint reads like *90° — glue* in card or *90° — fingers* in plywood.

**E8. Sketch, then extrude**
- Steps: choose the sketch tool (`K`), press Enter, draw a closed L outline in the 2D view, set *Extrude*, then *Finish*.
- Expected: an L-shaped solid; double-clicking it reopens its sketch.

**E9. Fold it in one click (card)**
- Steps: place a box (or a house: a box with a roof on top), then press **Fold it** once.
- Expected:
  - The view switches to the Workshop 3D view and the model folds up from flat over about 1.5 s.
  - The Make card reads *Folded*, with *N pieces · N folds · N flaps*.
  - No *To look at* problems are listed.
  - In the cut plan the net has scored folds and glue flaps or slit locks.
  - The download is a clean SVG.

**E10. Build from boards in one click (plywood)**
- Steps: start in *Plywood 3 mm*, place a box, press **Build from boards**.
- Expected:
  - The boards come in one by one, the top one last.
  - The corners have finger joints and the top board has tabs.
  - Six pieces in the cut plan.

**E11. The material Make chose**
- Steps: in plywood, press **Fold it**; in card, press **Build from boards**.
- Expected: *Fold it* switches the design to card, and *Build from boards* to plywood 3 mm.

**E12. The Make card's refinements**
- Steps: after E9, change *Seams* to *Slit locks*, then *Tab and slot*; *Pieces* to *Fewer cuts*; and, with a cylinder in the shape, *Faces around a curve* to 8.
- Expected: each change remakes the model at once and the summary line follows.

**E13. Change the material after Make**
- Steps: after E9, open the material pill and choose *Corrugated 1.6 mm*.
- Expected:
  - A note says how many joints were chosen again.
  - Long seams become tabs and slots.

**E14. Why each joint**
- Steps: in the made model, press *Joints* and select a board; click a joint label.
- Expected: its card says why that joint was chosen (for example *Slit lock: this face closes last…*).

**E15. Leave a face open**
- Steps: after E9 on a box, select the top board and press *Leave this face open*.
- Expected:
  - The model is made again without it.
  - The Make card says *1 faces left open* (with *Close them all*); the edges round the opening have no flaps.

**E16. A lid by a cut**
- Steps: on the Make card, tick *A lid by a cut*; set *Lid, from the top* to 25.
- Expected:
  - The box and a lid lie side by side, both open at the cut, with the same outline.
  - On card, the lid has a hem round its rim.

**E17. Assembly steps and seam numbers**
- Steps:
  1. On the Make card, press *Start*, then *Next* several times.
  2. In the cut plan, turn on *Dimensions*.
  3. Use *Print a plan*.
- Expected:
  - Each step names a seam and its two boards, and selects them on the stage.
  - Each number appears twice on the plan (on the flap and on its partner edge).
  - The printed plan lists the seams in order.

**E18. Linked to the shape**
- Steps:
  1. After E9, engrave a text on a board and change one seam's joint on its card to *Slit lock*.
  2. Press *1 Shape* and make the box 20 mm taller.
  3. Press **Fold it** (or *Update from shape* on the Make card).
- Expected:
  - The text and the slit lock are still there.
  - If something could not be kept, one note says how many.

**E19. Detach**
- Steps: on the Make card, press *Detach from the shapes* and confirm; then Undo.
- Expected:
  - After Detach the shape bar disappears and the design is an ordinary box design that still cuts the same.
  - Undo brings the link back.

**E20. Problems and fixes**
- Steps:
  1. Make a box larger than the card sheet and press **Fold it**.
  2. Place a diamond in plywood and press **Build from boards**.
- Expected:
  - The large box: the split is said, and *Make it smaller* is offered if a face is bigger than the sheet.
  - The diamond: *A corner of …° cannot take a board joint* with *Fold it instead* and *Fewer faces*; each fix works.

**E21. Back to shape keeps everything**
- Steps: after any Make, press *1 Shape*, then the outcome's button again.
- Expected: the shapes are as left, and the made model is still there to update.

**E22. A larger form**
- Steps: place a ring (torus) and a sphere and press **Fold it**.
- Expected:
  - A *Working out the net…* note may show briefly.
  - The model folds in several pieces, nothing freezes, and no overlap is listed.

---

## F. Teacher view and class submissions

The teacher key comes from the owner. Do not record it anywhere.

**F1. Sign in**
- Steps: open `/#/teacher` (the link is in the top bar) and sign in with the teacher key; try a wrong key first.
- Expected: the wrong key is refused, and the right key shows the classes.

**F2. Create a class**
- Steps: create a class; set its material profile, its starting level (*Guided*, *Quick build* or *Workshop*, locked), and the missions offered.
- Expected: a short class code and a class link (`/?class=CODE`).

**F3. A student joins by link**
- Steps: in another private window, open the class link.
- Expected:
  - The editor starts in the class's level, locked if set.
  - Only the chosen missions are offered, and the class's board is named.

**F4. Submit**
- Steps:
  1. As the student, make a box and press *Submit to class*; enter the code and a display name.
  2. Submit again from the same window.
- Expected: it is sent; the second submission replaces the first (history kept for the teacher).

**F5. Submit while offline**
- Steps: turn the network off (browser devtools) and submit.
- Expected: the app says the server cannot be reached and offers *Download for laser*; the design is untouched.

**F6. The teacher sees the work**
- Steps: in the teacher view, open the class.
- Expected:
  - The submission shows a preview, the name, the title, the mission's goals, the material, the pieces and the status.
  - SVG, DXF and project downloads work.

**F7. Batch and mark as cut**
- Steps: with two submissions of the same material, select both and press *batch*; then *mark as cut*; then try a batch with mixed materials.
- Expected:
  - Shared sheets with each student's name on the green guide layer.
  - The status changes to cut.
  - Mixed materials are refused with an explanation.

**F8. A submitted made model**
- Steps: submit a design made with *Shapes* → **Fold it**, and a Guided *Diamond*.
- Expected: the teacher's preview and SVG show the folded nets as the student saw them.

---

## G. Across the app

**G1. Hebrew end to end [HE]**
- Steps: run B2, C1, E9 and F4 in Hebrew.
- Expected:
  - Every label is Hebrew and the layout is right to left.
  - Numbers and units read left to right inside their fields.

**G2. Narrow window [1024]**
- Steps: run A1, B1, C1, E1 and E9 at 1024 × 768.
- Expected:
  - The top bar fits, with the ⋯ menu holding what moved.
  - No horizontal scroll and no hidden ✓ button.

**G3. Offline after the first load**
- Steps: load the site once, turn the network off, then reload and start a Shapes design; place a shape and press **Fold it**.
- Expected: the app and the shape kernel still work (they are cached).

**G4. No console errors**
- Steps: across all sections, read the console.
- Expected: no uncaught errors. Warnings about three.js `Clock` can be ignored.

---

## H. UI bugs and consistency (targeted)

These tests hunt UI problems on purpose. Run them after A–G, at 1366 × 768 unless marked otherwise, and apply the UI sweep
above to every step.

**H1. Where the level switch lives [1024] [HE]**
- Steps:
  1. In each level (Guided, Quick build, Workshop) and on the Shapes stage, with an empty design and then with one part, note where the level switch is.
  2. Use it to go to each other level.
- Expected:
  - The switch is in the same place in every level and state, and the current level is marked.
  - Changing level keeps the design, its name and the current view (3D or cut plan), with no blank screen.

**H2. Empty design in every level**
- Steps: start a *Blank design*, then visit Guided (Build, Decorate, Send), Quick build and Workshop without adding anything.
- Expected:
  - Each level says what to do first. Guided offers its gallery.
  - Nothing says *Ready to cut*, and *Download* is greyed with a reason.

**H3. Modes that stay on**
- Steps:
  1. Turn on *Joints*, *Outlines*, *Follow* and *Frame* one at a time.
  2. Press Esc twice, select another part, change level, and start a new design.
- Expected:
  - Each mode shows that it is on.
  - Each has a visible way out.
  - The modes do not carry silently into a new design.

**H4. Terms audit**
- Steps: for one box, read every label naming its sizes, its joints, the download and the design, in Guided, Quick build, Workshop and the Shapes stage.
- Expected: one word per thing (see the UI sweep, item 5). List every pair that differs.

**H5. Icon audit**
- Steps: hover every icon on the rails, the bottom bars and the cards, in all levels, and list icon → tooltip.
- Expected: no icon stands for two different things.

**H6. Overlap at the extremes [1024] [HE]**
- Steps:
  1. Select a small board (20 × 20 mm) and a large one; zoom fully in and fully out.
  2. Repeat with joint labels on (*Joints*) and with a warning showing.
- Expected: gizmo, stage labels, warning chips and the card never cover each other or the part being edited.

**H7. Where new things appear**
- Steps:
  1. On the Shapes stage with one shape in the middle, add a shape from each tile.
  2. Draw a new sketch and press *Finish sketch*.
  3. In Workshop, add a board with the Shapes tool by a single click.
- Expected:
  - Each new object is fully visible, not under the card and not inside an existing shape (a sketch lands beside the shapes already there).
  - *Frame* shows it.

**H8. Gizmo usability (Shapes stage and Workshop)**
- Steps:
  1. With *Move*, drag each arrow and the square.
  2. With *Turn*, turn the shape a quarter turn about each axis.
  3. With *Size*, drag a corner.
  4. Repeat on a Workshop board.
- Expected:
  - Each axis is told apart by colour.
  - A live readout shows the distance or angle.
  - A small drag makes a small change (no 60° jumps).
  - The handle is not hidden by the shape.
  - The card shows the resulting value.

**H9. Drawn labels in the sketch editor**
- Steps:
  1. In a sketch, draw lines with *Show measurements* on.
  2. Select an edge.
  3. Zoom fully in and out.
- Expected: the live length and angle, the snap labels and the selected edge's size are crisp, with no white blotches, at every zoom.

**H10. Loading and switching flashes**
- Steps: reload, open the Guided gallery, open a face-on view in Decorate, open a sketch, and switch levels, watching the first second each time.
- Expected:
  - No blank screen longer than about ⅓ s.
  - No layout jump when pictures arrive; placeholders keep their size.

**H11. Status words**
- Steps: read every badge, count and goal after each of B2, C1, E9 and E10.
- Expected:
  - Counts read naturally (*1 piece*, *2 pieces*).
  - Instructions fit the material (no *fold every crease* on plywood boards).
  - Goals tick as soon as they are met.

**H12. Accessible names**
- Steps: on the welcome screen, the editor in each level and the Shapes stage, read the accessibility tree.
- Expected:
  - Every button and field has a name that says its purpose.
  - Each material radio is named by its material.

---

## I. Curved edges everywhere (living hinges, rounded and round boxes, curved lids)

Curved walls show up in many places: the Quick build *Box* footprints (*Rounded*, *Round*), Workshop's round shapes
(`R` · `U` · `C`: rounded rectangle, circle / oval / stadium), *Edit outline* points set to *Curve* or *Round*, a wall's
*Bend radius*, *Hinged* lids (a living hinge on plywood, a fold on card), *Arched* lids, Guided's *Round box*, and
*Faces around a curve* on the Shapes stage.

Run every test in **plywood 3 mm** and again in **card**. On each result:
- check it from four sides with the lid open and closed, and through the fold slider;
- open the cut plan and the SVG;
- apply the UI sweep.

A test fails if:
- a part goes through another, or a gap shows where parts should meet;
- a part is shown in the cut plan but not in 3D (or the other way round);
- a wall is kept that no longer has an edge to stand on;
- the card's sizes disagree with the cut plan's;
- *Ready to cut* shows over any of these.

**I1. Rounded box from scratch (Quick build)**
- Steps:
  1. *Box* → *Rounded*.
  2. Set the corner radius below the material's minimum, then draw and press ✓.
- Expected:
  - The radius field shows the radius that will actually be used, or refuses the lower value with a reason.
  - Walls bend round every corner with hinge slits (plywood) or glued lips (card).
  - The straight walls and the bends meet without gaps or overlap.
  - The ghost shows the curved corners while drawing.

**I2. Round and oval boxes**
- Steps: make a *Round* box in Quick build, an *Oval* and a *Stadium* in Workshop (`C`), and Guided's *Round box*; extrude each.
- Expected:
  - One continuous bent wall with a single closing seam, and no stray nub or tab at the seam.
  - Pulling a size arrow changes the size smoothly (no jump to the sheet's maximum on a short drag).

**I3. Hinged lid on a rectangular box**
- Steps:
  1. On a box's card choose *Lid: Hinged*.
  2. Press *Close* and *Open*, and move the fold slider through the whole range.
  3. Select the lid part of the hinged panel.
- Expected:
  - The closed lid covers the whole opening and rests on the walls.
  - While opening, nothing passes through a side wall; the bend unrolls rather than turning as a rigid block.
  - The lid part can be selected.
  - The hinge slits cover only the bend, not the whole back wall, unless the card says why.

**I4. Hinged lid on a rounded box**
- Steps: on a rounded-corner box, choose *Hinged*, then *Close*.
- Expected: either the lid follows the rounded outline and closes the whole opening, or *Hinged* is greyed with a reason (as it is for round and oval boxes). A rectangular lid covering part of the opening is a fail.

**I5. Lid switching on curved boxes**
- Steps: on a rounded box and on a round box, cycle *None → Lifts off → Hinged → None*, undoing once after each step.
- Expected:
  - Each lid fits.
  - The inside height does not change unless the card says why.
  - *None* restores the walls exactly as they were: same sizes in the card and the cut plan, visible from every side.
  - No lid part is left behind.

**I6. Convert a straight box to rounded corners**
- Steps:
  1. On a finished rectangular box, try to round one corner (*Edit outline* → corner → *Round*), in Workshop and in Quick build.
  2. If it is refused, follow the reason it gives (remove the joints or walls), round the corner, then *Wall it* / *Extrude walls* again.
  3. Try the same on all four corners.
- Expected:
  - There is a clear way to do it, either a single action (for example *Round the corners* on the box's card) or steps the app explains.
  - The rebuilt walls bend round the new corners.
  - No old straight wall is kept, and nothing ends up inside out or invisible.
  - Undo returns the box exactly.

**I7. Change a curved box after it is made**
- Steps: on rounded, round and oval boxes:
  1. change the width, depth, height and corner radius;
  2. add a divider across, and one along;
  3. add a hole and a text on a bent wall.
- Expected:
  - Walls, hinge slits and lips follow every change.
  - Dividers end on the curved wall, or a note says why they cannot.
  - Shapes on a bent wall stay off the hinge slits.

**I8. Bend radius on a fold (card)**
- Steps: on a card box, set one corner's *Bend radius* to 5, then 20, and try each bend pattern.
- Expected:
  - The fold curves in 3D and in the net.
  - A pattern that cannot reach that radius is greyed with a reason.
  - The scored lines in the SVG follow the bend.

**I9. Arched lid**
- Steps: on boxes of several sizes and shapes, try *Lid: Arched*.
- Expected:
  - Where it is offered it fits.
  - Where it is greyed, tapping says why, and the reason names a change that would make it possible.

**I10. Curves on the Shapes stage**
- Steps: place a cylinder, then press *Fold it* and *Build from boards*; set *Faces around a curve* to 6, 8 and 16.
- Expected:
  - Both outcomes use the same default number of faces, or say why they differ.
  - The summary follows each change.
  - A plain prism lies flat in one piece, or the card's reason holds up when you look at the net.

**I11. Curves in the files**
- Steps: download the SVG and DXF of I1, I2, I3 and I8.
- Expected:
  - Arcs are true arcs.
  - Hinge slits stay inside the bend zone and away from joints and edges.
  - Nothing overlaps on the sheet.

---

## J. Changing joint types

Each test compares three things after every change: what the dropdown or label says, what the cut plan and the 3D
*Joints* view show, and the note ("N joints changed"). In the dev build, `window.__cutforge.store.getState().design.connections`
lists every joint's actual kind; read it before and after each step. Run on card and on plywood 3 mm, on a box with a
lid and two crossing dividers.

A test fails if:
- a dropdown or label shows a kind that some of its joints don't have;
- a change touches joints outside the group it names, or changes another group's joints;
- the note's count differs from the joints that really changed, or a kept joint isn't named with its reason;
- a choice is stored but not applied, or applied later by an unrelated change.

**J1. Design-wide groups**
- Steps: in *Design settings → Joints*, set *Wall to base* to each kind in turn, then *Corners* to each kind, in both
  orders.
- Expected: exactly the joints of that group change, every time; the other group never changes; the note counts them.

**J2. A kind that forces another**
- Steps: set *Wall to base* to *Tabs and slots* (walls on the base's face), then choose each *Corners* kind.
- Expected: either the corner kind is applied, or the corner dropdown shows the forced kind (for example *Half-lap*,
  greyed) with the reason, and the other choices are greyed with it. Never "0 joints changed" with the dropdown showing
  the new kind.

**J3. Mixed joints**
- Steps: change one corner by its label in the *Joints* view, then open *Design settings*.
- Expected: the *Corners* dropdown says *Mixed*; choosing any kind (including the one shown before) changes all corners.

**J4. The tray's own card and the design card agree**
- Steps: on a base's card, change *Walls* and *Corners*; compare with *Design settings*.
- Expected: the same groups, the same kinds offered (no *Fold* on plywood), the same joints changed, and both cards show
  the same value afterwards.

**J5. Joints that belong to no group**
- Steps: with a lid and crossing dividers, change every group.
- Expected: lid joints and divider crossings are either in a named group or listed as "not changed: …" with the reason.

**J6. Choices survive rebuilding**
- Steps: after J1, change the box's width, add and remove a divider, change the lid, change the material and back,
  press *Make again* on a made model.
- Expected: every joint keeps the chosen kind, or one note says which changed and why. Dividers are never deleted by a
  lid change without a note.
