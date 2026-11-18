# Guided mode: Quick build rebuilt around a thing to make (milestones 61–67)

Status: plan, 2026-11-18. Nothing here is built. It follows milestone 60 and replaces the interface described in `EASY_MODE.md` (milestones 37–41). The engine those milestones built (recipes, guardrails, fixes, missions, objects) stays.

**Read first.** This plan was written against `claude/waffle-mode` (milestone 60). `origin/main` is 30 commits ahead of that branch's base: milestones 61–73 are built there and 73–86 are planned, and they change Quick build (`src/easy/lid.ts`, `recipes.ts`, `objects.ts`, `fix.ts`, `features.ts`, `StartScreen.tsx`, and the autosave in `src/store/hooks.ts`). Before building anything here: redo §1 on `origin/main`, drop what is already fixed there, check §3 and §4 against main's lids and dividers, and renumber the milestones after the ones planned on main.

**Guided** is the new name and the new interface for Quick build. Workshop is not changed, apart from three shared fixes in milestone 61. Waffle designs keep today's interface in both modes.

## 1. Why

Looked at on 2026-11-18 in the dev server, in a browser with no saved data, at 1280 × 800, and in the code. "Seen" means it happened on screen; "code" means it was read, not run; "listed" means `PROGRESS.md` already names it as open.

### 1.1 Nobody reaches it

| Problem | Evidence | Where |
|---|---|---|
| A new browser starts in Workshop. Missions only show on the start screen in Quick build, so a student who opens the plain link never sees them. | code | `initialPrefs` in `src/store/store.ts`; `StartScreen.tsx` (`missions = quick ? … : []`) |
| In Quick build the missions are the last thing on the start screen, under the material and the templates, below the fold. | seen | `StartScreen.tsx` |
| The tour is switched off, and Quick build's only guidance is one sentence under the rail. | code | `TOUR_OFFERED = false` in `src/tour/TourNudge.tsx`; `quick.guide` |
| Below 1380 px wide, Quick build moves *Submit to class* into the ⋯ menu. On a 1366 px Chromebook the student's finish is hidden. | seen, listed (U1) | `TopBar.tsx` |

### 1.2 Workshop shows through

| Problem | Evidence | Where |
|---|---|---|
| With nothing selected the card opens on *Joints: Wall to base, Finger joint* and *Material and fit: clearance 0.1*. | seen | `DesignSettings.tsx`; `'settings.joints': 'show'` in `src/easy/features.ts` |
| *Download for laser* asks for SVG or DXF and for *Kerf compensation: Nominal / Compensated*. The feature table has no row for it. | seen | `ExportDialog.tsx` |
| Hints name Workshop gestures: *Shift-click the wall opposite to add a divider*, *right-drag to pan*. | seen | `View3D.tsx` (the hint line) |
| Cards use Workshop words: *Part*, *Copies to cut*, *Edit outline*, *Edges: Grow from top*, *Tray height*, *On base, top · Panel 2*. A floor board's depth is labelled *Height*. | seen | `Inspector.tsx`, `TrayUI.tsx` |
| A mission's sizes are a form of nine fields (*Sizes are: inside*, *Lid rim height*). | seen | `TemplateUI.tsx` |
| The rail and the view buttons are icons with no words. The cut plan keeps the five actions and *Repack*. | seen | `QuickRail.tsx`, `View3D.tsx`, `Plan2D.tsx` |

### 1.3 Things that go wrong

| Problem | Evidence | Where |
|---|---|---|
| **An unconfirmed Box is saved.** Drag a footprint, reload before ✓: a stray flat board is in the design and the badge says *Ready to cut ✓*. Autosave writes the design while a ghost is pending. | seen, code | `useAutosave` in `src/store/hooks.ts`; `pending` in `store.ts` |
| **Template sizes undo moved dividers.** In the Pencil box, a divider moved from 21 to 30 mm goes back to 21 when *Height* is changed, with no note. Moving the dividers is how that mission is solved. | seen (offset set through the store) | `regenerate` in `src/templates/registry.ts` |
| **The divider line depends on the camera.** From the opening view the front wall hides most of the floor. A line started on a wall is carried through it and lands outside the box. A line drawn on the visible floor made a 40 × 37 mm board named *Panel 2* instead of a divider. | seen | the `tool === 'divider'` branch in `View3D.tsx`; `planDividerLine` in `src/easy/recipes.ts` |
| **Nothing shows where a wall or lid can go.** With *Wall / lid* chosen, edges appear only on the board under the pointer and are a few pixels wide. One click on the back wall's top edge made nothing. | seen once | `EdgeHandle`, `showEdges` in `View3D.tsx` |
| **A mission opens side-on.** The Pencil box is seen from the front, so its compartments and the pencils are hidden behind the front wall. | seen | `CameraRig` in `View3D.tsx` |
| **The fix for a box too big for the sheet can bring up other problems** (32 of 45 cases in the Quick build fuzz). On a template design it also leaves the template's sizes as they were, so the next size change grows the box back. | listed; code | `shrinkToSheet` in `src/easy/fix.ts` |
| *New design* asks with the browser's own confirm box, which some embedded browsers dismiss by themselves (the app's preview pane did). | seen, code | `TopBar.tsx` |
| The class's material is checked only when the student submits, after the design is finished. | code | `SubmitDialog.tsx`; `joinClassFromLink` in `src/easy/mode.ts` |

## 2. What changes for a student

- **You start from a thing.** The first screen is a gallery: *Pencil box*, *Dice tray*, *Card stand*, *Game organiser*, *My own box*. One tap starts it. There is no material step and no empty grid.
- **Three steps, always in the top bar: Build, Decorate, Send.** Nothing else is there except Undo, Redo and a menu.
- **You change the thing by touching it.** Pull an arrow to make the box wider, deeper or taller. Slide a divider. Tap a space to split it. There are no tools to pick first and no ✓ to press; Undo is the way back.
- **You size it by what goes inside.** Add 12 pencils; the space is green when they fit and amber when they do not, with a *Make it fit* button.
- **Decorating happens face-on.** Tap a side; it opens flat. *Name*, *Sticker* and *Window* each land in the middle, ready to drag.
- **One finish.** *Send to my teacher* (or *Download the file* without a class). No file format, no kerf.
- **Every button has a word.** The interface never says joint, kerf, clearance, snapping, tray, panel, edge, extrude or footprint.
- **Mouse or one finger is enough.** No Shift, Ctrl, Alt, letter keys or right-drag are needed for anything.
- **All tools are one step away, when the teacher allows it.** The menu has *All tools (Workshop)*.

## 3. The interface

### 3.1 The gallery

*What do you want to make?* Large cards, each with the thing drawn by the real renderer, its name and one line. Tapping a card starts it.

- **Material.** With a class that has a material profile: one line, *Your class cuts in Plywood 3 mm*, and nothing to choose. Otherwise a small row of four chips above the cards, plywood chosen, the last choice remembered.
- **Which cards.** Every mission the class offers (all of them without a class), then *My own box*: the organiser template at 120 × 80 × 45 mm inside, no dividers, no lid.
- **Under the cards**, smaller: *Waffle sculpture* (opens today's workbench), *Open a saved file*, and *Start with all tools* when Workshop is allowed.
- **Coming back.** *Start something new* in the menu shows the gallery with *Keep working on …* as the first card.

### 3.2 The frame

```
┌───────────────────────────────────────────────────────────────────────┐
│ ▣  Pencil box       1 Build · 2 Decorate · 3 Send       Undo  Redo  ☰ │
├───────────────────────────────────────────────────────────────────────┤
│                                                      ┌──────────────┐ │
│                                                      │ Pencil box   │ │
│              the thing, seen from above and          │ Inside       │ │
│              in front, with its arrows               │ 186 × 60 × 30│ │
│                                                      │ 3 spaces     │ │
│ ┌──────────────┐                                     │ Lid: none    │ │
│ │ Mission ★☆☆  │                                     └──────────────┘ │
│ │ ○ Holds 12 … │                                                      │
│ └──────────────┘  [ Divider ] [ Lid ] [ What goes inside ]  [⌂] [▲]   │
└───────────────────────────────────────────────────────────────────────┘
```

- **Top bar**: home (the gallery), the design's name, the stepper, Undo and Redo with their words, the menu. A dot on *3 Send* turns amber when something needs fixing.
- **Add bar**, bottom centre: two or three large buttons, each an icon over a word. Its contents depend on the step.
- **Side sheet**: what is selected, in at most four rows. With nothing selected, the thing itself.
- **Mission card**, bottom corner: the goals and stars, as today.
- **View buttons**: *Look around* (the opening view), *From above*, zoom in and out. Dragging empty space turns the view. Nothing pans; the thing stays centred.
- **Menu**: *Start something new*, *Open a saved file*, *Save a copy*, the language, *All tools (Workshop)*, *Teacher view*.
- It fits from 1024 px wide with no sideways scroll; the stepper is never folded into a menu. In Hebrew the sheet and the mission card swap sides; the stage stays `dir="ltr"`.

### 3.3 Build

- **Size.** Three arrows on the box: wider, deeper, taller. Dragging one moves an outline and a label (*186 mm wide inside*); the design changes once, on release. A label can be tapped to type a number. Sizes are always the inside. A size that would not fit the sheet stops at the largest that does and says so.
- **Dividers.** Each has a round grip on its top. Dragging slides it, snapping to equal spaces, with the sizes of the spaces either side shown. Tapping it offers *Remove*.
- **Splitting.** Tap a space: its inside size shows, with a **+**. The + offers two pictures, *side to side* and *front to back* (only those that leave both halves 20 mm or more). The divider goes through the middle of that space and runs the whole way across the box.
- **Lid.** *Lid* on the add bar puts on or takes off the lift-off lid (rectangular boxes).
- **What goes inside.** *What goes inside* opens the seven objects as pictures. A tap puts one in the selected space, or the best free one. A count, *fits* in green or *needs 14 mm more* in amber, and **Make it fit**, which grows the box by what is missing and gives all of it to that space.
- **Other things.** A thing that is not a box (the card stand) shows its own sizes as sliders with pictures. A design made with Workshop tools shows a note, *Made with all the tools: you can decorate and send it*, and no arrows.
- **More about this box**, folded shut at the bottom of the sheet: how the corners hold (today's two joint lists, with pictures).

### 3.4 Decorate

- The arrows and grips go. Moving over the box lights the side under the pointer; a tap opens it face-on (today's solo view) with *Back to the box*.
- **Name**: engraved text in the middle, already saying the student's name when the app knows it. A text field, a size slider and the fonts the text card offers today.
- **Sticker**: the eight stickers as pictures; a tap places one in the middle.
- **Window**: circle, rounded rectangle or rectangle; *Cut out* or *Engrave*, each with a picture.
- A selected decoration is dragged to move, has corner handles and a turn knob, and *Copy* and *Remove*.
- The guardrails stay: a decoration stops a safe distance from the sides, the corners and other cut-outs, and a small note says why.

### 3.5 Send

- **The sheet**: the pieces as the laser will cut them, with their names. A picture only; nothing is dragged.
- **The check**: *Ready to cut ✓*, or each problem in plain words with **Fix**. What cannot be fixed says *Ask your teacher* (and *Open in all tools* when allowed).
- **The mission's goals and stars**, when there is one.
- **Watch it go together**: the assembly animation. For card and corrugated, *See it flat*.
- **The button.** With a class: **Send to my teacher**, which asks for a name once. Without one: **Download the file** (SVG at nominal size, the export dialog's defaults, with no dialog), with *I have a class code* and *More download options* beside it.
- The button waits until the check is clear.

### 3.6 Words

| Today | Guided |
|---|---|
| Panel, board, part | side, bottom, lid, divider |
| Width and Height of a base; Tray height | wide, deep, tall (inside) |
| Compartment | space |
| Extrude walls, Grow from top | not shown |
| Copies to cut, Edit outline, Rotation | not shown |
| Download for laser | Download the file |
| Submit to class | Send to my teacher |
| Joints | How the corners hold (under *More about this box*) |
| Kerf, clearance, snapping, sheet settings | not shown |
| Cut out, Engrave, Ready to cut, Mission | kept, with pictures |

### 3.7 What Guided leaves to Workshop

Building from an empty floor, extra boxes, walls and lids grown from an edge, outlines (gables), polygons drawn by hand, angles, through-cuts, fold-overs, a second material, arrays, importing an SVG, moving pieces on the sheet, kerf and file format.

## 4. Decisions

| Topic | Decision |
|---|---|
| Name | **Guided** and **Workshop**. In prefs and class rows `'quick'` reads as `'guided'`. The Hebrew name is chosen with the teacher. |
| What a mode is | Unchanged: a viewer preference, never part of the design. A file opens the same in both. |
| Default | **A new browser starts in Guided.** This reverses the follow-up *Workshop by default*. A browser with saved preferences keeps its mode. |
| Engine | **No new design fields, no schema bump.** Guided calls existing ops, `regenerate` and the recipes. Golden exports stay byte-identical. |
| Shell | Guided has its own shell in `src/guided/`. There is still one stage (`View3D`) and one sheet view (`Plan2D`); the feature table decides what they show. |
| Ghost and ✓ | **Not used in Guided.** Every action applies at once as one undo step. This reverses milestone 30 for this mode only. |
| Scope | **Guided changes a thing; it does not build from nothing.** Quick build's *Box* and *Wall / lid* actions and the drawn divider line go. |
| Boxes | A rectangular box in Guided is the organiser template. Its sizes, dividers and lid change through `regenerate`. |
| Dividers | Whole-span only, as the template makes them. Their places are kept when sizes change (milestone 61). |
| Sizes | Always the inside. The template's *Sizes are* is fixed to `inner` and hidden; the dividers' height follows the box's. |
| Joints | Chosen by the app. One folded row keeps them changeable. |
| Material | The class's, applied at the start. Without a class, a chip on the gallery. |
| Finish | The Send step. Students in a class never see a file format or kerf. |
| Workshop | The class decides (`modeLocked`, shown to the teacher as *Students can open all tools*). Without a class it is in the menu. |
| Teaching | Short looping pictures of each gesture, shown the first time. The tour stays off and stays Workshop's. |
| Input | The primary pointer does everything. Keys are extras: Undo, Redo, Delete, Esc, arrows. |
| Waffle | Not part of this plan. |

**My calls (say if you want them different):**

- **Joints stay one tap away**, under *More about this box*. A follow-up put them on Quick build's first card on purpose; this moves them off the first screen without removing them.
- **Send waits for the check.** Today a student can *Download anyway*.
- **Decorating is face-on**, not on the 3D box. It avoids drawing on a wall seen at a slant.
- **A name is engraved, never cut out**, so letters cannot lose their middles.
- **One design at a time**, as now. A gallery of a student's own saved designs is not in this plan.
- **No levels or trophies.** The mission's stars stay; the concept image's *Level 4* bar does not.
- **A lid only for rectangular boxes.** The dice tray gets none.
- **The dice tray is not a template.** A tray's wall ids come from its tray id, which `regenerate` would not keep, so decorations would be lost. It stays a tray box with its own small code path.

## 5. Rules for the implementer

- Commit or stash the uncommitted sketch work on `claude/waffle-mode` first, then work on a new branch from it. One commit per milestone, named like the others (`Milestone 61: …`). Do not push or deploy. Guided is unfinished between milestones 62 and 66, so the branch is not deployed before 67.
- Edits to a design are pure functions on an immer draft, through `apply` or `preview` + `commit` in `src/store/store.ts`. One student action is one undo step.
- The feature table (`src/easy/features.ts`) stays the only place that says what a mode shows. `View3D` and `Plan2D` ask it; they do not check the mode.
- `src/easy/` keeps the engine (recipes, guard, fix, missions, objects, sheet, assemble). New interface code goes in `src/guided/`. Nothing in `src/guided/` is imported by Workshop components.
- Every new string goes into `src/i18n/en.ts` and `src/i18n/he.ts` under `g.*`. Every interactive element gets a `data-testid`.
- Hit targets are at least 44 px. Nothing in Guided may need a modifier key, a letter key, a double-click, a right-click or a hover.
- Check each op's name and signature in `src/model/ops.ts` before using it. The ones this plan names (`addDivider`, `setDividerOffset`, `setPanelSize`, `setTrayHeight`, `setMaterial`, `addText`) were found by `grep`, not read in full.
- After each milestone: `npm run typecheck`, `npm test`, and a short look in the dev server (`cutforge-dev`, port 5199). Do not run the full e2e suite or the `SHOTS` specs. Milestone 66 adds one spec, `tests/e2e/guided.spec.ts`; run only it and `classroom.spec.ts`.
- For a browser with no saved data, open `http://fresh.localhost:5199`: it is another origin, so the design and preferences on `localhost:5199` are not touched.
- `tests/golden.test.ts` must stay green and unchanged.
- After each milestone add its section to `PROGRESS.md` and its decisions to `DECISIONS.md`.
- Never set or read `SITE_PASSWORD`.

## 6. Milestones

### Milestone 61: what Quick build left half-done

Four fixes in shared code. No new interface. Each gets its repro in `tests/regress/` first.

1. **A draft is never saved.** In `useAutosave` (`src/store/hooks.ts`), while `pending` is set, save `pending.base` (the design before the draft) instead of `design`.
   - Test: start a Box and do not confirm; what `saveLocal` receives has no board. After ✓ it has the base and four walls. The same for a shape waiting for ✓.
2. **Template sizes keep the dividers where they were put.** In `regenerate` (`src/templates/registry.ts`), after `generate`:
   - every divider on the template's base (a grown panel at 90°, standing beyond the wall band: the test `compartments()` uses) that exists under the same id in the old design keeps its place as a fraction of the clear inside (`clearBox`), set with `setDividerOffset`;
   - dividers the student added on that base are scaled the same way;
   - when a count goes up, the old ones keep their places and the new one goes to the middle of the widest gap; when it goes down, the highest-numbered goes;
   - no space ends smaller than `MIN_COMPARTMENT`.
   - Tests (`tests/templates.test.ts`): Pencil box, first divider moved +9 mm: after *Height* 30 → 32 it has not moved; after *Depth* 60 → 80 it is at the same fraction; 2 → 3 dividers keeps the first two; `tests/missions.test.ts` unchanged and green.
3. **A divider line stays inside its box.** Workshop's *Standing board* line on a box's base has the same fault as Quick build's Divider. Before `planDividerLine`, clamp both ends to the base's clear inside (`clearBox`; the outline for a base that is not a rectangle), in a pure helper next to it.
   - A drag across the whole box, walls included, is then a wall-to-wall divider even when the walls hide the floor.
   - Test: a line whose start is 20 mm outside the back wall plans the same divider as one started on that wall's inner face; a line from 20 mm outside the front wall to 20 mm outside the back wall of a 124 × 99 box is a divider, not a standing board.
4. **The too-big fix ends clean, or says it did not work.**
   - On a template design, shrink through `regenerate` with scaled sizes, so the template's sizes stay true. Write the test first: after *Fix*, changing any template size must not bring `val.tooBig` back.
   - Run `STRICT=1` on `tests/fuzz/quick.test.ts`, find why other issues appear on the shrunk box, and fix that. `fixIssue` returns true only when the design has no new blocking issue; otherwise it leaves the design as it was.
   - Move the scaling of what stands on a base (divider offsets, placed boards) out of `shrinkToSheet` into one helper, `scaleOnBase`, for milestone 64 to share.

Dev look: in today's Quick build, drag a Box and reload before ✓ (nothing is left); Pencil box: slide a divider, change *Height* (it stays).

### Milestone 62: the mode and the shell

Files: `src/easy/features.ts`, `src/store/store.ts`, `src/App.tsx`, `src/views/View3D.tsx`, `worker/index.ts`, `src/net/api.ts`, new `src/guided/GuidedApp.tsx`, `GuidedTopBar.tsx`, `Confirm.tsx`, `SideSheet.tsx`, `AddBar.tsx`.

- **The mode.** `Mode = 'guided' | 'workshop'`. `initialPrefs`: a saved `'quick'` becomes `'guided'`; no saved preferences gives `'guided'`. The Worker's class patch (`worker/index.ts`, where it accepts `'quick'`) accepts `'guided'`, and `'quick'` in a row or a request is read as `'guided'`. No migration.
- **The shell.** `App.tsx` renders `GuidedApp` in place of `TopBar`, `Toolbar`, `Inspector` and `MissionPanel` when the mode is Guided and the design is not a sculpture (`isSculpture`).
- **The step.** `guidedStep: 'build' | 'decorate' | 'send'` in the store: view state, not saved, not in the history. Changing step clears the selection and closes the face-on view.
- **The top bar** of §3.2. The stepper reuses the waffle stepper's styles (`.seg.stage-seg` in `TopBar.tsx`).
- **Feature rows**, all `'hide'` in Guided: `stage.edges` (`EdgeHandle`), `stage.panelWidgets`, `stage.floorGizmo`, `stage.placedGizmo`, `stage.dividerButton`, `stage.dock` (the view buttons and settings), `stage.foldBar`, `stage.hint`, `keys.tools` (the letter shortcuts in `src/store/hooks.ts`), `plan.edit` (dragging pieces, *Repack*). `View3D` mounts an empty `GuidedLayer` inside its scene in Guided. The guard (`quickGuard` in `store.ts`) runs in Guided as it did in Quick build.
- **Confirm.** *Start something new* asks in an in-app dialog (`Confirm.tsx`), not `window.confirm`.
- **The opening view.** A design opens seen from above and in front (about 50° up), so the inside of a box shows; it re-centres when the thing changes size.
- **Words test** (`tests/guidedwords.test.ts`): every key passed to `t()` under `src/guided/` starts with `g.` or with one of a short list of shared prefixes (`obj.`, `mission.`, `goal.`, `mat.`, the stickers' names); no English `g.*` string contains *joint, kerf, clearance, extrude, footprint, tray, panel, edge, grow, offset, nominal, compensat, DXF, SVG, LightBurn, snap, template*, apart from a short list of allowed keys.
- Tests: `tests/easymode.test.ts` updated: the mode ids, `'quick'` read as `'guided'`, a new browser in Guided, the table covers every feature asked for, switching leaves the design and history unchanged. `worker/api.test.ts`: a class patched to `'guided'` reads back `'guided'`; a row holding `'quick'` reads back `'guided'`.

Dev look: `fresh.localhost:5199` opens Guided: the top bar with three steps, the stage with an organiser seen from above, no rail, no Workshop card. `localhost:5199` (saved preferences) still opens Workshop.

### Milestone 63: things and the gallery

Files: new `src/guided/things.ts`, `src/guided/GuidedStart.tsx`; `src/easy/mode.ts`, `src/easy/missions.ts`, `src/teacher/TeacherApp.tsx`.

- **Things** (`things.ts`): the gallery's cards. `{ id, title, blurb, materials, start(material): Design }`: one for each mission (`startMission`) and `my-box` (the organiser, 120 × 80 × 45 inside, no dividers, no lid, `sizeMode: 'inner'`).
- **The gallery** of §3.1 replaces `StartScreen` in Guided. Workshop keeps `StartScreen`. Thumbnails come from `renderThumbnail`, cached by thing and material as today.
- **The class's material at the start.** `joinClassFromLink` keeps the class's material profile (in the saved preferences, beside `missions`); the gallery starts every thing in it and hides the chips. `SubmitDialog`'s check stays as it is for Workshop.
- **The class's list.** The existing `missions` list also accepts `my-box`. Check the Worker's validation of that list accepts it.
- **Teacher's words** (`TeacherApp.tsx`): *Students start in: Guided / All tools*, *Students can open all tools* (the opposite of `modeLocked`), *Things offered* (the missions and *Their own box*). A new class starts in Guided with all tools closed.
- Tests (`tests/guidedthings.test.ts`): every card's starting design has no blocking issue in every material it lists; a class list of one mission gives one card; a class profile is the material of the design that starts; `my-box` has one space and no lid.

Dev look: the gallery in English and Hebrew; one tap starts the Pencil box; *Start something new* asks, then shows *Keep working on …* first.

### Milestone 64: Build

Files: new `src/guided/box.ts`, `fit.ts`, `GuidedLayer.tsx`, `steps/Build.tsx`, `Demo.tsx`; `src/templates/types.ts`, `organiser.ts`, `stand.ts`; `src/easy/objects.ts` and `missions.ts` (read only). Workshop keeps `src/easy/InsideUI.tsx` (its *What goes inside* section and its mission card); Guided has its own, over the same functions.

- **The box model** (`box.ts`, pure). `kindOf(d)`: `'organiser'` (the organiser template), `'tray'` (a floor board with one tray: Quick build's Box, the dice tray), `'template'` (another template: the stand) or `'free'`.

  | Function | Organiser | Tray box |
  |---|---|---|
  | `insideSize(d)` | `clearBox` and the lowest wall | the same |
  | `setInsideSize(d, {w, d, h})` | `regenerate` with width, depth, height (the dividers stay as far below the rim as they were, and at least 5 mm tall) | `setPanelSize` on the base, `setTrayHeight`, `scaleOnBase` |
  | `dividers(d)` | both rows with their places | the same |
  | `addDividerAt(d, dir, at)` | the count + 1 through `regenerate`, then `setDividerOffset` to `at` | `addDivider` |
  | `moveDivider`, `removeDivider` | `setDividerOffset`; the count − 1 with the others kept in place | `setDividerOffset`; `deletePanel` |
  | `hasLid`, `setLid` | the template's `lid` | not offered |

  A `regenerate` result replaces the whole design in one `apply`, as `TemplateSection` does.
- **Template sizes as controls.** `TemplateDef` params get an optional `guided: { label, picture?, hide? }`. The organiser hides all of its own (the stage does them). The stand shows *How wide are the cards*, *How far it leans*, *How many slots*, *How deep the base is* as sliders.
- **Arrows** (`GuidedLayer`): three `PushPull`-style handles on the box's right side, front side and rim. A drag shows an outline and a label and calls `setInsideSize` once on release. On release, if `val.tooBig` appears, step back to the largest size that fits (at most six tries) and show *That is as big as the sheet allows*. Labels take a typed number (`DimLabel` with `onCommit`).
- **Grips**: one per divider, reusing `DividerSlide`'s snapping and labels; one undo step per drag.
- **Spaces**: a tap on the floor of a space selects it (`compartments()`): its size, its **+**, what is in it.
- **Add bar**: *Divider* (splits the selected space, or the largest), *Lid*, *What goes inside*.
- **What goes inside**: the objects as pictures, the count, the fit, *Remove*, and dragging a lot to another space (`ContentsView`).
- **Make it fit** (`fit.ts`): `fitContent(d, contentId)` reads `contentFit(d, c).need`, grows the inside by it and moves every divider beyond that space by the same amount, so the other spaces keep their sizes. A tray box is scaled until it fits (at most six tries). It returns null when the result would not fit the sheet, and the sheet then says *They cannot all fit on one sheet*.
- **Pictures of gestures** (`Demo.tsx`): three short loops drawn in SVG and CSS (pull an arrow, slide a divider, drag to look around), each shown the first time, replayable from **?** on the add bar, a still picture under `prefers-reduced-motion`.
- Tests:
  - `tests/guidedbox.test.ts`: `setInsideSize` on the organiser changes the template's sizes, keeps a name engraved on the front wall and keeps the dividers' fractions; on a tray box it equals `setPanelSize` + `setTrayHeight`; add, move and remove leave the other dividers where they were; the lid goes on and off.
  - `tests/guidedfit.test.ts`: Pencil box: `fitContent` on the pencils meets *Holds 12 pencils*, the box is 14.2 mm deeper, the other two spaces are within 0.1 mm of before, and a second call changes nothing; the dice tray grows until six dice fit; a lot too big for the sheet returns null.
  - `tests/fuzz/quick.test.ts` gains sequences of Guided actions (resize, add, move and remove dividers, lid, objects, *Make it fit*): no blocking issue after any of them.

Dev look: Pencil box: pull the box deeper, slide a divider, split a space, *Make it fit* on the pencils (the goal ticks), Undo back through each step.

### Milestone 65: Decorate

Files: new `src/guided/steps/Decorate.tsx`, `decorate.ts`; `src/views/Plan2D.tsx` (the face-on view), `src/easy/guard.ts` (the note's words only).

- Step 2 of §3.4. A tap on a side calls `openSolo(panelId)`; *Back to the box* closes it. A side `workshopOnly` names cannot be opened and says why.
- **Recipes** (`decorate.ts`): `addName` (`addText`, engraved, in the middle, sized between `minTextSize` and a third of the side), `addSticker` (`stickerRecipe`, a quarter of the side), `addWindow` (`holeRecipe`). Each is one `apply` and selects what it made. None goes through `pending`.
- In the face-on view in Guided: no operation dots, no Score or Add, no through-cut, no arrays (existing rows); the selection frame, its corner handles and its turn knob stay.
- The guard's note is reworded: *Kept 3 mm from the side*, *from the corner teeth*, *from the next cut-out*.
- Tests (`tests/guideddecorate.test.ts`): on every side of every thing in every material, a name, a sticker and a window placed in the middle leave no blocking issue; on a side too small for one, it is not made and the reason is returned; a pre-filled real name meets *Your name engraved*, the placeholder does not.

Dev look: Pencil box: open the front, add a name and type it, add a sticker, drag it to a corner (it stops short), go back to the box (both show).

### Milestone 66: Send

Files: new `src/guided/steps/Send.tsx`, `src/net/submit.ts`; `src/ui/SubmitDialog.tsx` (uses `submit.ts`), `src/views/Plan2D.tsx`, `src/easy/fix.ts` (read only), `tests/e2e/guided.spec.ts`, `tests/e2e/classroom.spec.ts`.

- Step 3 of §3.5. The sheet is `Plan2D` with `plan.edit` hidden.
- **The check** lists `validate(d).filter(blocking)`, each through a Guided wording (`g.val.*`) for the keys `fixIssue` handles, with **Fix**. Any other key reads *This needs your teacher*.
- **Sending** moves out of `SubmitDialog.tsx` into `src/net/submit.ts` (the class lookup, the profile check, the upload, the remembered name and code); both callers use it. In Guided a class whose material differs from the design's asks once, *Your class cuts in … Switch to it?*, applies it and runs the check again.
- **Download** in Guided calls the export with today's defaults and no dialog. *More download options* opens `ExportDialog`.
- **Watch it go together** plays `playAssembly` over the stage and returns to Send.
- Tests:
  - `tests/guidedsend.test.ts`: `submit.ts` against a mocked `api`: a class with a profile, a closed class, no network (the download is offered), a second send replaces the first.
  - `tests/e2e/guided.spec.ts`, in English and Hebrew, at 1366 × 768 and 1024 × 768: a new browser, the gallery, Pencil box, *Make it fit*, a name, Send: *Ready to cut ✓* and three stars, the download is an SVG. No step uses a key or a right-click.
  - `tests/e2e/classroom.spec.ts`: its Quick build cases become Guided: a class link with a material profile starts in that material with no chips and no *All tools*; *Send to my teacher*; the teacher sees *Pencil box · 5 of 5 goals*.

### Milestone 67: Quick build's interface goes

- Delete `src/easy/QuickRail.tsx` and `ReadyBadge.tsx` and what only they used: the tools `box`, `wall`, `divider` and `sticker`, their branches in `View3D.tsx`, `QUICK_KEYS`, the *Quick build | Workshop* switch in `TopBar.tsx`. Keep what Workshop uses (`InsideUI.tsx`, `dividerLine`, `planDividerLine`, `isBoxBase`, the Extrude ✓ in `actions.ts`): let `tsc` and `grep` decide, not this list.
- Remove the strings nothing uses any more (among `quick.*`, `mode.quick*`, `ready.*`, `sheet.*`) from both languages.
- Delete `tests/e2e/quick.spec.ts` and `quick-shots.spec.ts`. The unit tests of the engine stay.
- README: *Quick build* becomes *Guided*. `EASY_MODE.md` gets one line at the top: superseded by this plan. DECISIONS: a *Guided* section with the three reversals (Guided by default, no ghost and ✓ in Guided, Guided does not build from nothing).
- Final check: `npm run typecheck`, `npm test`, `npm run build` (note the size of the Guided chunk and of the entry), `guided.spec.ts` and `classroom.spec.ts`. By hand in the dev server, in both languages: every thing from the gallery to *Ready to cut ✓*.

## 7. Order and size

**61, 62, 63, 64, 65, 66, 67**, in that order.

- 61 stands alone and is worth shipping by itself: it fixes today's Quick build and Workshop.
- 62 must come before the rest: the shell is where every later piece lives.
- 65 and 66 do not depend on each other and could swap.

Rough sizes, as guesses: 61 is two or three days. 62 and 63 are three or four days each. 64 is the largest, about two weeks: the box model, *Make it fit* and the stage handles. 65 and 66 are about a week each. 67 is two or three days.

## 8. Not in this plan

- A Guided path for waffle sculptures.
- New things beyond the four missions and *My own box* (a phone stand, a name sign).
- A lid for boxes that are not rectangles; dividers that stop at another divider (`compartments()` still assumes each one runs the whole way).
- A gallery of a student's own saved designs.
- The Worker counting a mission's goals itself (it still trusts the student's numbers).
- Repairing the tour.
- Workshop's own wording and layout.

## 9. Still needs the owner

- **Real students.** Three to five who have not seen it, 20 minutes each, on a school Chromebook: can each get from the link to *Sent* without help?
- **A trackpad and a touch screen.** Every drag in §3.3 and §3.4 by hand; only the mouse can be driven from a session.
- **Hebrew.** The mode's name, and a native speaker's review of every `g.*` string.
- **The calls in §4.** Especially joints off the first screen, Send waiting for the check, and Guided not building from nothing.
- **`easymode/`.** The concept images are untracked. `easymode/DECISIONS.md` is a PNG with the same size as *One plywood organizer, two modes.png*; it looks like a copy under the wrong name.
