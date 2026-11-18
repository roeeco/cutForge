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
SHOTS=1 npx playwright test -c pw-app.config.ts tour             # the first-use tour, every card in English and Hebrew, into docs/tour-shots/
UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts               # only for an intended change in exported files
```

- `tests/autoseam.test.ts` builds 500 seeded random designs and checks that every pair of touching panels is joined or named by the export check (about 25 s).
- Export tests also run an **independent reader check** with Python (`ezdxf` for DXF, `svgpathtools` for SVG) when available: `pip install ezdxf svgpathtools`. Without them that one test is skipped.
- The Playwright run also starts the real Worker (`wrangler dev`, local D1/R2 in `.wrangler/e2e`) for the class-submission tests.
- Playwright uses software WebGL (SwiftShader). If your Playwright browsers are installed somewhere non-standard, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Using it

0. **New here?** The welcome screen offers a hands-on **tour** (about 3 minutes, in the Workshop): you build a small box yourself with the Board tool, extrude its walls, grow a lid on its own, switch the material to card and back to see the joints change, choose the corner joints, draw a divider and cut a window. Each step moves on by itself once you have done it; *Skip step* does it for you, *Back* shows the previous card, *End tour* stops. You keep the box. Take it again from the project menu (*Take the tour*).
1. *What are you making?* Choose a material, then a template (blank, *Organiser with dividers* or *Card / tile stand*), then **Start** (the interface language toggle is on the same screen). With nothing selected, the card on the right has *Template* (its sizes), *Joints*, *Material and fit* and *Snapping*, each folding open from a header that sums up what is set (and stays open or closed the next time). Kerf, clearance and sheet settings are in the **Material & sheet** drawer (click the material pill in the top bar). New / Open / Save project are in the menu next to the design name.
2. **Shapes** tool (`P`; milestone 75): the rail is *Select · Shapes · Divider · Text · Import*. Shapes opens its footprints under its button (*Rectangle*, *Rounded*, *Circle*, *Polygon*, *Regular*; `R`, `U`, `C`, `G`), and its card chooses what the footprint does: **Board** (the default: a new board on the floor, or lying on the board you draw on, in any footprint) or *Cut out · Engrave · Score line · Add material* on a board. With the rectangle and Board, in one drag: **press and drag** on the face the board goes on (any panel's face, or the floor grid; the face or floor point under the pointer lights up) and **release**: the board is made, selected, and the rail goes back to Select (a click or a tiny drag makes nothing; Esc during the drag drops it). *Flat* draws a board lying flat, a rectangle square to the face; *Standing*, beside it on the card, draws a line with a board standing on it at the last height you used (press `P` again to switch between the two). The line snaps level and parallel (to the face's own directions, to its edges and to the panels already standing on it; hold Alt to draw freely), and its ends land on wall faces, corners and shapes. (Dividers have their own tool, `D`: see 15.) Afterwards change its height with its H field or arrow, *Flip side* (on its card, or the round badge on the stage) to put the material on the other side, or tick *Construction* for a guide that is never cut. A panel placed on a face is its own piece and moves with that face; if the face's panel is deleted, it drops to the floor where it was. Set exact sizes in the card, drag the teal arrows on the panel, or click the W/H labels on the stage to type a size. Moving a panel (by dragging it or with the gizmo) sticks it to other panels: its faces snap flush against theirs and its edges in line with theirs.
3. Hover a panel to see its free edges, click one (or use *Grow from …* in the card): a ghost shows the new panel and which side the material lies on; press its **✓** (or Enter) to grow it. Hold Cmd (Mac) or Ctrl (Windows) and drag along the edge, or Cmd/Ctrl-click twice, to grow on just that part (the points snap to the edge's corners and middle, thirds and quarters, the base's shapes and the opposite wall; type a number and Enter for an exact distance). A fold that would make its net overlap when laid flat turns the ghost amber, with *Cut it as its own piece*. Drag the ball on the angle arc at the hinge (or use the dial in the card) for 90°, 60°, 45°, 30° or 15°, the round badge on the ghost to flip *Up/Down*, the arrow to set its height, and choose the connection: plywood offers finger joints and tabs and slots at 90°; card and corrugated offer folds, glue flaps and tabs and slots. An angled plywood panel needs side walls (*Add side walls*).
   - Where panels meet without a connection (e.g. two walls at a corner), the inspector lists them under *Meeting panels* with a **Connect** button.
   - Dividers: click a wall, Shift-click the wall opposite, then **+ Divider** (step 15); crossing dividers get half-laps automatically. *Clear inside sizes* shows the compartments.
4. **Shapes on a board**: choose a footprint and an operator other than Board, then drag on a panel in 3D, or on a piece in the cut plan (where Board and the polygons are not offered). *Import* with Board makes a board from the SVG's outline.
5. Switch between **3D workspace** and **Cut plan** at any time: both show the same panels; edits in either appear in the other.
6. **Download for laser** (SVG or DXF) and **Save project** (JSON). Work is also autosaved in the browser.

7. **Editing tools:** double-click a panel for a face-on *solo* view. Shift/Ctrl-click or drag a box to select several shapes, then move, resize, align, distribute or duplicate them. Turn a shape into a live row/grid array (and *Explode* it later). Shapes snap to panel and shape edges, centres and equal spacing (hold `Alt` to drag freely).

8. **Text and icons:** the *Text* tool places Hebrew or English text (edit it in the inspector; it is exported as outlines). *Import SVG* puts a simple icon on the selected panel. Set *Copies to cut* per piece; drag pieces on the cut plan to place them by hand; *Repack* to start over.

9. **Polygon bases** (`G`): click corners on the floor (Shift: 15° steps; type a number and Enter for an exact segment length; close on the first point or Enter, Backspace removes a corner, Esc cancels), or switch the tool's card to *Regular* and drag out an n-gon (3–12 sides). **Round** drags a box that a circle, an oval or a stadium fills (Shift keeps it square). **Rounded** drags a rectangle with its corners rounded to the card's radius. A round base's card has its shape, an oval's end radius (with the side radius that meets it), and *Convert to points* for free editing; a base with rounded corners has one *Corner radius* for them all. *Edit outline* on a base's card shows handles: drag a corner, click **+** on an edge to add one, select one and press Delete to remove it — walls standing on the edges follow. A selected point can be a *Corner*, a *Curve* or **Round** (a tangent arc of the radius you type). Arcs are cut as true arcs. Tray walls stand on straight edges only for now; walls that bend round curves come next. On a panel, the polygon tool draws a polygon shape.

10. **Extrude:** on a base with no walls, *Extrude walls* shows a ghost tray; drag its arrow or type the height, then its **✓**. A tick on the walls marks the tallest height at which a card or corrugated net still lies flat in one piece; above it the walls that change turn amber. Every straight edge gets a wall at one height (card and corrugated walls fold up from the base; corners are glue flaps on card, tab-and-slot on corrugated, fingers on plywood). The tray card changes the height and joints; deleting a wall opens that side, *Wall it* closes it. Push-pull on any tray wall changes all of them (tick *Own height* to keep one wall different).

11. **Cut out / Engrave / Score line / Add material:** shown on the shape card while a shape tool (Shapes, Polygon, Text) is in use, each with a picture of what it does to the board and a line saying it (the cut plan keeps its colours). *Add* joins the outline (a tab), *Cut* is a hole inside or a notch across an edge (cuts always win over adds). Every straight edge a shape makes can grow a panel; walls on an edge a cut splits become one wall per piece. With **Cut out** chosen, *Cut through the whole design* (a tick under it) means the shape removes material from every panel in its path through the whole design. While you draw it (or when it is selected), the panels it will cut are outlined in amber with a *Cuts N panels* badge; click it on any of those panels to select the original.

12. **Wall outlines:** *Edit outline* on a wall's card: drag its top corners, click **+** on its top or sides to add a point (pull it up for a gable). Grow a roof from a sloped edge like any other edge.

13. **Corrugated locks and fold-over:** in *Joints (advanced)*, tab-and-slot joints can have tabs that go *Through, fold under* (and the tray card has the same switch for its corners). On a card or corrugated wall, *Fold-over (double wall)* folds the top over into a liner on the inside: down to the base or a partial hem, glued or locked with tabs through slots in the base. Holes in the wall continue through the liner. The fold slider unfolds liners too.

14. **Move and rotate gizmo:** select a shape, or a floor panel, to get a gizmo: drag the square to move it, an arrow to move along one direction, the ring to turn it (15° steps; hold `Shift` for 1°, `Alt` for no snapping). While dragging, type a number and press Enter for an exact angle or distance. A floor panel turns with everything built on it, and snaps to other floor panels' corners and edges when moved. Seen almost edge-on, the ring turns to face you, with the turn's axis drawn through it. Passing over the centre while turning does not flip the turn. In the cut plan and face-on view, selected shapes have a turning ring. *Rotation* is also in the card.

15. **Dividers** (`D`): draw a line inside a box with the **Divider** tool, then ✓ (Enter). You don't have to reach the walls:
    - **Where the ends go:** each end runs on to the next wall or divider beyond where your line stopped. Stop short of a divider and it meets it as a T; cross a divider and the two get half-laps, and the end runs on to the next board.
    - **Direction:** the line lines up with the box (or with the first divider, once there is one). Hold **Shift** for 30° steps, **Alt** for any angle. Its position snaps to equal compartments and in line with other dividers.
    - **The ghost** marks what each end meets and where it crosses. A line that can't make a divider is amber and says why: its middle is in a wall, or it meets a board at under 30°, where no joint holds.
    - **Angled joints:** slots are widened for the angle.
    - **Curved walls:** in a round box or at a rounded corner an end stops on the curved wall's inside face and is glued to it with a flap on the divider's end (card, corrugated) or pressed against it (plywood). A line run into a corner stops at the corner's inner point. Turning a divider so it would meet a board at under 30° is refused.
    - **Afterwards:** move a divider with its amber arrow (it snaps to equal compartments; the compartment sizes show above, and you can type the two next to it), or turn it with the gizmo. Its ends follow, and they follow when the boards they meet move or are deleted. Its card has *Clear behind*, *Angle* and *Ends*: ‹ › stops an end a board sooner or lets it reach one further.
    - **Two walls:** you can also click a wall, then Shift-click the one opposite (a divider counts as a wall), for a floating **+ Divider** halfway between them.
    - **Several dividers:** select several parallel ones on one base for *Equal compartments*.

16. **Growing adapts:** while growing, the height arrow snaps to other panels (a lid lands on the opposite wall, a wall matches its neighbour), and the angle dial snaps to where the panel would rest on another one. Drag the small squares at the ghost's ends (or type *Starts at* / *Ends at*) to grow on part of an edge; the rest of the edge can be grown from later. With *Adapt to neighbours* on, the ghost is trimmed where it would run into other panels (a wall under a sloped roof becomes a gable) and is joined to them. *Edit outline* on the grow card lets you shape the ghost before growing.

17. **Through-cuts from any side:** select a through-cut and its corners show on every panel it cuts; drag one to resize it from there, and use the gizmo shown on those panels to move or turn it. Its edges snap to the panels it passes through. While you draw a through-cut with the polygon tool, the *Cuts N panels* badge counts as you go.

18. **Several boards:** Shift-click (Ctrl, or Cmd on a Mac) panels to select several. Floor panels, or panels placed on one face, can be aligned and distributed like shapes and moved together with the gizmo.

19. **Copy and paste shapes:** Cmd/Ctrl+C copies the selected shapes; Cmd/Ctrl+V pastes them onto the panel under the pointer (it follows the pointer and snaps; click to put it down, then **✓**).

20. **Every new thing is a ghost first:** shapes, polygons, text, imported SVGs, grown panels and extruded walls wait for their floating **✓** (Enter) or **✕** (Esc); then the tool goes back to *Select*. One ✓ is one undo step.

21. **A material for each board:** a board's card has a *Material* list (*Same as working*, the design's other materials, the built-in ones, *Custom…*). Its colour, thickness and joints follow; the card says which joints changed. A grown board takes its parent's material. With more than one material, a legend by the view settings lists them (click one to select its boards), the cut plan puts each material on its own sheets under a heading, and the download is one file per material.

22. **Nets that lie flat:** card and corrugated trays never overlap themselves when laid flat: the app trims a corner flap, folds a wall off its neighbour instead of the base, or cuts it as its own piece, and the tray card says so (*Lower to …* keeps it in one piece; *Keep in one piece* turns this off, and the export check then shows the overlap in red).

23. **Bends and living hinges:** a board folded off another (a lid off a box's back wall) has a *Bend* section on its card. *Bend radius* 0 is a crease; a radius curves the fold round instead, inside the box's corner, and both boards are cut back to where the curve meets them. Plywood folds only this way: choose *Living hinge* as the joint (it starts at the material's pattern radius). *Pattern* lists what the material offers (card: *Smooth*, *Scored*, *Perforated*; corrugated: *Smooth*, *Kiss-scored*, *Perforated*; plywood: *Smooth*, *Straight slits*, *Wave slits*, *Diamonds*); *Automatic* picks the first that bends as tight as the radius, and one that cannot is greyed with the reason (*Needs a radius of 150 mm or more here*). The spacing of the lines is worked out from the radius and the material; *Lines* can only make them denser. A board standing across the bend (a side wall under a hinged lid) gets its corner rounded to clear it. The export check names a bend that is too tight, a chosen pattern that does not reach, one too short for slits, and a radius too big for its boards, each with *Fix*. *Download a bend test* in the material drawer gives a strip of five zones of the chosen pattern at radii around its limit, to calibrate on scrap. Kiss scores are cut in the inner liner, so a piece that has them is mirrored in the file and marked *THIS SIDE UP (kiss scores)* on the guide layer. A smooth bend in corrugated across the flutes is named by the export check (*Fix* perforates it); a corrugated round box's wall is cut as its own piece so its flutes run up the wall.

24. **Curved walls on rounded corners:** extrude a tray on a base with rounded corners and its walls stand on the straight sides, each corner a curved band from the end of one wall to the start of the next: glued to it with a lip on card and corrugated, one strip with living hinges on plywood (keyed shut at the back left; *Closing seam* on the tray card moves it, and a strip longer than the sheet is keyed apart where it must be). *Rounded corners* on the tray card joins all of them one way (one piece, glued, keyed or plain); a corner's own card shows its bend. Quick build's *Box* has a *Rounded* footprint with a corner radius, raised to what the walls bend to in the material. Rounding a corner never removes a wall: each straight side keeps 5 mm.

25. **Round boxes:** extrude a tray on a circle or an oval and the base gets a *seam flat* (a short straight edge at the back left: 12 mm on card, 16 on corrugated, 20 on plywood) for its one wall; the wall's band runs all the way round and closes on it (glued on card and corrugated, keyed on plywood). A stadium's straight sides take walls and its ends are bands. Under the bands the tray card's *Curved walls held to the base by* chooses glue teeth folded onto the base (card), tabs in slots that follow the curve (corrugated walls standing in from the edge), or nothing; plywood bands wrap round the base, cut back for them. Quick build's *Box* has a *Round* footprint: a square drag makes a circle, a longer one an oval, no tighter than the walls bend.

26. **Lids that close the box:** grow a lid by a fold off a wall's top edge; while it reaches the opposite wall the grow card says it will close the box (the height arrow snaps to that wall's inside face). Made, the lid's card has *Closes the box*: *Tuck flap* (card's default: a lip that tucks inside the front wall, dust flaps on the side walls folded in under the lid), *Tuck flap with slit locks*, *Tab lock* (corrugated's default: a tongue on the lip through a slot in the front wall), *Rests on the walls* (plywood), or *Glued*; the lip's length, the dust flaps, and a thumb notch in the front wall. The closure replaces any other joint between the lid and those walls. Pull the lid short and it stops closing the box; bring it back and its settings return. Any free edge of a card or corrugated board can take a plain flap too (*Add a flap* on the edge's card).

27. **Glue-free joints and cartons:** wherever a glue flap is offered on card or corrugated there is *Slit lock (no glue)*: the flap's tongues push through slits in the other board (on corrugated, slots) and stay. *Joints → Corners → Slit lock* makes a whole tray glue-free. The tray card turns a tray into a carton: *Base: Open (a tube)* leaves the base uncut and folds the walls off each other in one strip, glued at one corner (the back left); *Top* is open, a *Tuck flap* (a lid the tray keeps, closed as above) or *Four flaps*; an open base's *Bottom* is open, a *Snap-lock (1-2-3)*, a *Tuck flap* (reverse tuck) or *Four flaps*. That makes straight tuck, reverse tuck, tuck top with snap-lock bottom, seal-end cartons and sleeves from one footprint and a height. Quick build's *Box* has the kind *Carton* (a tuck top and a bottom that snaps shut; the carton's card changes the bottom). The snap-lock's proportions are starting values: cut one and try it before a class set.

28. **Splitting and nesting:** a net too big for its sheet is cut at a fold so its pieces fit (a tray wall then joins its base as a wall cut on its own does; another board keeps its place with a glue flap), and the cut goes again once the net fits whole. A folded board's card has *Automatic · Keep whole · Cut here* for its fold. The cut plan shows the yield (sheets, % used, metres of cut, pieces, glue joints); *Save material* looks for folds to cut so the pieces take fewer sheets and says what it costs (*16 pieces, not 4. 1 sheet, not 2 sheets. 3 more glue joints.*) before *Apply*; *Nest* fits the pieces by their real shapes (turned only as the grain allows, never mirrored, the spacing kept) and never takes more sheets than before. *Material & sheet* → *Split a net into pieces*: *Only when it must*, *To save material* or *Never*.

29. **Lids:** a box's card (and its lid's) has a **Lid** section: *None*, *Lifts off* (a telescoping, hat-box lid of the box's outline grown by the wall and the clearance, lying beside the box rim up, so the box stays easy to work on, and following it when it changes; drag it elsewhere and it stays there; round for a round box), *Hinged* (folded off the back wall: a tuck lid on card, a tab lid on corrugated, a living hinge on plywood) and *Arched* (curved off the back wall's top, across, and down into the front wall; the end walls are cut to the arch). One that cannot be made here is greyed, and says why when tapped (a box too low for the material's bend, a plywood box too small for a living hinge). Changing the lid replaces the old one in one undo step and moves the shapes on its top. A board grown across the top with finger or tab joints shows as *Fixed*: it does not open. *Put on* shows a lid of its own on the box to check the fit (*Take off* puts it back beside); a folded lid is shown opened back so the inside stays clear, and *Close* shows it shut (or select it to draw on it). Both are only how it is shown. A wall's card has *Match top with* (a parallel wall facing it shares its top outline; editing either changes both), *Own outline* and *Copy outline from*.

**Fold slider:** for designs with a fold (card and corrugated, and plywood with a living hinge), a fold/unfold slider sits at the bottom of the stage; it shows the flat net (and the fold-over liners) without changing the design.

**Export check:** besides cutting problems, it says when two panels touch but are not joined (and why), or run into each other; clicking the message selects both.

**Joints per material:** the *Joints* choices are kept for each material. Switch to card and back to plywood and your plywood joints come back; a note under a list says when a choice is not in use and why.

**Joints view** (the *Joints* button by the view settings): select a panel or a wall and each of its joints gets a label on the stage (nothing is labelled while nothing is selected); click one for a menu of the kinds that joint can take (*All joint settings…* opens it in the card). While it is on, the move, turn and grow handles are hidden. New joints where an edge meets a face (dividers, walls added inside a box, standing panels) are tabs in slots where they can be made, else glue flaps (card and corrugated), else a slide fit. A tab-and-slot joint's *Tabs* list (in its menu, its card, or a tray's card for its corners) says how the tabs hold: *Flush*; *Through, fold under* (card and corrugated); *Self-locking (snap)*: each tab passes through, barbs on its sides catch behind the other panel and a slit down the tab lets it flex in, so it clicks home and stays; or *Bolts and nuts (M3)* (plywood): a T-slot in the tab panel's edge holds an M3 nut, a hole in the other panel takes an M3 × 12 mm screw, at the two ends of each joint (the card counts the screws and nuts to buy).

**View settings** (sliders icon, bottom corner): outlines on/off, dimensions on/off, quality (*Auto*, *Simple*, *Rich*).

Keyboard: `V` select, `P` panel, `D` divider, `R` rectangle, `U` rounded rectangle, `C` circle, `G` polygon, `T` text, `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), `Delete`, `Ctrl+D` duplicate, `Esc` (cancel a drag / leave a tool / clear selection / leave solo view), arrow keys nudge the selected shapes 1 mm (`Shift` = 10 mm), `O` toggles perspective/orthographic.

## Quick build

A new browser starts in the **Workshop** (everything above); **Quick build** is one click away, and is remembered for that browser. The *Quick build | Workshop* switch in the top bar changes only what is shown, never the design, so a file opens the same in both. A class can choose the mode its students start in, and lock it.

1. **Start**: choose a material, then a template, *Blank*, or a **mission**: a starting design with goals (*Pencil box*, *Dice tray*, *Card stand*, *Game organiser*). The mission card on the stage ticks the goals off as you work and gives a star for each group done; click a goal to select what it is about.
2. **The actions** on the rail (keys in brackets), each a ghost that **✓** (Enter) makes as one undo step:
   - **Box** (`B`): the **Footprint** (*Rectangle*, *Regular* with 3–12 sides, *Rounded*, *Round*) and the **Kind**, as pictures: *Open box*, *With a lid* (the box and a lid that lifts off, made in the one ✓) or *Carton* (a tube with a tuck top and a bottom that snaps shut; card and corrugated, on a rectangle). The kind last made is remembered. Drag the footprint on the floor; the walls rise at the last height used; drag their arrow or type the height, then ✓.
   - **Wall / lid** (`W`): click a free edge. The new panel stands at 90° on the whole edge, fitted to its neighbours, starting at the height that fits. Across a box's top it makes the box's **lid**, one that opens: it lifts off on plywood and is hinged on card and corrugated (the ghost says which). It never glues or finger-joints a box shut.
   - **Divider** (`D`): draw a line inside a box; each end runs on to the next wall or divider, crossing the dividers the line passes (Shift: 30° steps). The compartment sizes show. Every line makes a divider, or says why it can't.
   - **Standing board** (`D` again, or the button just below Divider): a board standing along a line on the floor or a face.
   - **Hole** (`H`): circle, rectangle or rounded rectangle, cut out (or *Engrave* in the shape's card).
   - **Text & stickers** (`T`): text, engraved, or one of the bundled stickers.
3. **The app does most of the engineering**: angles, kerf, clearance, folds and snapping are chosen for you. The joints are chosen too, but stay yours to change: *Wall to base* and *Corners* in the settings card, and any one joint from its label in *How it's built* (the joints button by the view settings; select a panel to see its joints). Parts made with Workshop tools (an angled panel, a fold-over, a through-cut, a board in another material, a construction guide) show read-only with *Open in Workshop*; **More…** at the bottom of a card shows its Workshop version until you select something else.
4. **You can't make a file the laser can't cut**: shapes stop a safe distance from edges, joints and each other while you drag them (a faint amber line shows the limits, a note says why), and text stays readable. The **Ready to cut ✓** badge in the top bar turns into *1 thing to fix* when something still needs it (say, a panel made smaller in Workshop): open it and press **Fix**. Next to it the **sheet meter** shows how many sheets and how much of them the pieces use.
5. **A box's lid**: the box's card (and its lid's) has **Lid: None · Lifts off · Hinged**, as pictures. *Lifts off* is a cap: a shallow tray over the box, a wall and a clearance wider all round. *Hinged* folds off the back wall: a tuck lid on card, a tab lid on corrugated, a living hinge on plywood (greyed, with the reason, when the box is too small for the bend). A choice that cannot be made is greyed; tap it to see why. Changing the lid is one undo step, and shapes on the old lid's top move to the new one. A carton's card shows its lid and its **Bottom**: *Snaps shut · Tucks in · Flaps to glue*.
6. **Less glue, less board**: **No glue** in the settings card's *Joints* locks every corner with tongues through slits (card and corrugated). On the cut plan, **Use less board** fits the pieces closer, then offers the folds to cut that would save board (*Now 2 sheets. Can be 1 sheet, with 3 more glue joints.*); *Do it* or *Leave it*. The download is nominal: the kerf is set on the laser, and the dialog says how much.
7. **What goes inside**: the box's card adds pencils, markers, dice, a deck of cards, a phone, a coin or your own size to a compartment. Each shows on the stage resting inside: green when it fits, amber with how much more room it needs. Drag it to another compartment. **Show how it goes together** (the play button by the view settings) folds the box up and brings each piece in, one at a time.

Controls of milestones 61–72 that Quick build now leaves to the app (all still under **More…**, and a design that uses them opens unchanged): a fold's bend radius, pattern and lines; a tray's rounded-corner joins and closing seam; a carton's *Base / Top / Bottom* lists (Quick build has *Kind*, *Lid* and the *Bottom* pictures); a closure's lip, dust flaps and thumb notch (its style stays on the lid's card); *Add a flap*; *Match top with*; a fold's *Keep whole / Cut here*; the yield line's cut length, pieces and glue joints; *Nest* and *Save material* (one button, *Use less board*); the kerf choice in the download. In Workshop the box's card has the same **Lid** section, with *Arched* too, in place of *Add a lid* and *Add an arched lid*; a board grown across a box's top with finger joints reads *Fixed* there.

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
