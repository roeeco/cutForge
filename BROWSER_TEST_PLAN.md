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
