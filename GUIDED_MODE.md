# Guided mode: a first level built around a thing to make (milestones G1–G7)

Status: plan. Written 2026-11-18 against `claude/waffle-mode`; re-checked on 2026-11-19 against `origin/main` at `1c4cb96` (milestone 73), when the owner decided that **Quick build stays, as the middle level**; **rebased the same day onto `origin/main` at `1917440` and merged into one order with `SENTENCE_BUILDER_PLAN.md` and `DIELINE_DNA_PLAN.md` (`ROADMAP.md` §5)**. Nothing here is built. Mock-ups: `docs/guided-mockups/`.

**Guided** is a new first level, below Quick build: a student picks a thing, changes it by touching it, decorates it and sends it. It uses the engine Quick build already has (recipes, lids, dividers, guardrails, fixes, missions, objects). There are then three levels: **Guided · Quick build · Workshop**. Quick build and Workshop are not changed, apart from the fixes in milestone 87 and the two missions named in §4.

## 0. Base, and the other plans

- **Base:** `origin/main` at `1917440` (milestone 91 and the fold overhaul). This file came from `claude/guided-mode`, which sits on the waffle work (PR #6) that `main` does not have; only this file and the mock-ups were brought over, not the branch.
- **Numbers:** milestones are named **G1–G7** here (they were 87–93, which `main` has since used). Their real numbers are in `ROADMAP.md` §5, which orders them with `DIELINE_DNA_PLAN.md` (D0–D10).
- **Built on `main` since the first draft (74–91)** and now used here instead of waited for: lid kinds *Cap · Flat · Drop-in* and padlock hasps (79–82); lids beside the box and *Put on / Close* (76); *Your designs* and projects (86–87); sizes (88); names and sizes on the dieline (89); *Print a plan* (90); one *Shapes* tool and a five-button Workshop rail (75); the grow card that closes a box (77). `UI_CLEANUP_PLAN.md` is built (74–78). Lines (83–85) never appear in Guided.
- **`SENTENCE_BUILDER_PLAN.md`** (S1–S7, before G2): its structures (*a box*, *a tray*, *a carton*, *a sleeve*, *a card stand*) are the one list of things to start from; G3's plain things are those structures with their default words, not a list of their own. G1's divider fix is what its S2 relies on. Its sentence may later open Guided's gallery (its §8).
- **`DIELINE_DNA_PLAN.md`** shares four things with this plan; `ROADMAP.md` §5.2 settles each: inside sizes (G4 calls D5a's `boxSize` / `setBoxSize`), the face-on view (G5 runs in the solo view that D0b-1 refactors and D0b-2 / D0c add editing to, all hidden in Guided), *Make it fit* (G4's `fitContent` beside D6's `fitToContents`), and the gallery (D6 is dropped; the sentence's registry is the list).
- **`PACKAGING_AND_LEARNING.md`** (on `main`) proposes a ladder of levels, *Guided · Open · Workshop*. This plan builds that ladder's three rungs, with Quick build as the middle one; the proposal's unlockable groups of features are not part of it. `ROADMAP.md` §4 had left *Levels* for later; the owner's decision of 19 November takes it up.
- **Waffle** is not on `main`. When it is merged, its designs keep their own interface in every mode, and its card goes under the gallery.

## 1. Why

Looked at on 2026-11-19: `origin/main` run from a side checkout, in a browser with no saved data, at 1280 × 800. "Seen" means it happened on screen; "code" means it was read, not run; "listed" means `PROGRESS.md` already names it as open.

### 1.1 Nobody reaches it

| Problem | Evidence | Where |
|---|---|---|
| A new browser starts in Workshop. Missions show on the start screen only in Quick build, so a student who opens the plain link never sees them. | seen, code | `initialPrefs` in `src/store/store.ts`; `missions = quick ? … : []` in `StartScreen.tsx` |
| In Quick build the missions are the last thing on the start screen, under the material and the templates. | seen | `StartScreen.tsx` |
| The tour is switched off. Quick build's guidance is one sentence beside the rail. | code, seen | `TOUR_OFFERED = false`; `quick.guide` |
| At 1280 px, once there is a box, the badge and sheet meter take the room and *Submit* moves into the ⋯ menu. | seen | `TopBar.tsx` |

### 1.2 Workshop shows through

| Problem | Evidence | Where |
|---|---|---|
| With nothing selected the card opens on *Joints: Wall to base, Finger joint* and *Material and fit: clearance 0.1*. | seen | `DesignSettings.tsx`; `'settings.joints': 'show'` |
| On an empty Quick build stage the hint says *Choose the Board tool*. Quick build has no Board tool. | seen | `view.empty3d` in `View3D.tsx` |
| The download asks for SVG or DXF and says *Set the kerf offset on each layer in LightBurn*. | seen | `ExportDialog.tsx` |
| Hints and help name gestures a beginner does not have: *right-drag to pan*, *Shift: 30° steps; Alt: any angle*, *Shift-click the wall opposite*. | seen; the last one code | `tool.hint.select`, the Divider card, `div.pickHint` |
| A box's card says *Part*, *Rotation*, *Edit outline*, *Copies to cut*, *Tray*. On the stage a floor board's depth is still labelled *H*. | seen; the label is listed (73) | `Inspector.tsx`, `TrayUI.tsx` |
| A mission's sizes are a form of nine fields (*Sizes are: inside*, *Lid rim height*). | seen | `TemplateUI.tsx` |
| The rail is seven icons with no words. | seen | `QuickRail.tsx` |

### 1.3 Things that go wrong

| Problem | Evidence | Where |
|---|---|---|
| **An unconfirmed Box is saved.** Drag a footprint, reload before ✓: one board is in the design, with no walls, and the badge says *Ready to cut ✓*. Autosave writes the design while a ghost is pending. | seen | `useAutosave` in `src/store/hooks.ts`; `pending` in `store.ts` |
| **Template sizes undo moved dividers.** In the Pencil box, a divider moved from 21 to 30 mm with `setDividerOffset` goes back to 21 when *Height* is changed, with no note. Moving the dividers is how that mission is solved. | seen | `regenerate` in `src/templates/registry.ts` |
| **A mission opens side-on.** The Pencil box is seen from the front, so its spaces and the pencils are hidden behind the front wall. | seen | `CameraRig` in `View3D.tsx` |
| **The fix for a box too big for the sheet can bring up other problems.** `shrinkToSheet` also never touches a template's sizes, so on a template design the next size change would grow the box back. | listed; code | `src/easy/fix.ts` |
| *New design* asks with the browser's own confirm box, which the app's preview pane dismissed by itself. | code (seen on the older branch) | `TopBar.tsx` |
| The class's material is checked only when the student submits, after the design is finished. | code | `SubmitDialog.tsx`; `joinClassFromLink` |

### 1.4 Already fixed on `main` (found on the older branch, dropped from this plan)

- The divider line that depended on the camera: since milestone 70 a short line runs on to the next wall or divider. The same drag that made a stray board now makes *Divider 1*, joined to the base and both walls.
- A floor board's depth called *Height* on its card: *Depth* since milestone 73.
- The kerf choice in Quick build's download: gone since milestone 73.
- Two ways to make a lid: one *Lid* section with pictures since milestone 73.

## 2. What changes for a student

- **You start from a thing.** The first screen is a gallery: the missions, then *Box*, *Box with a lid*, *Round box* and *Carton*. One tap starts it. There is no material step and no empty grid.
- **Three steps, always in the top bar: Build, Decorate, Send.** Nothing else is there except Undo, Redo and a menu.
- **You change the thing by touching it.** Pull an arrow to make the box wider, deeper or taller. Slide a divider. Tap a space to split it. There are no tools to pick first and no ✓ to press; Undo is the way back.
- **You size it by what goes inside.** Add 12 pencils; the space is green when they fit and amber when they do not, with a *Make it fit* button.
- **Decorating happens face-on.** Tap a side; it opens flat. *Name*, *Sticker* and *Window* each land in the middle, ready to drag.
- **One finish.** *Send to my teacher* (or *Download the file* without a class). No file format, no kerf.
- **Every button has a word.** The interface never says joint, kerf, clearance, snapping, tray, panel, edge, extrude or footprint.
- **Mouse or one finger is enough.** No Shift, Ctrl, Alt, letter keys or right-drag are needed for anything.
- **More tools are one step away, when the teacher allows it:** Quick build, then Workshop.

## 3. The interface

### 3.1 The gallery

*What do you want to make?* Large cards, each with the thing drawn by the real renderer, its name and one line. Tapping a card starts it.

- **Material.** With a class that has a material profile: one line, *Your class cuts in Plywood 3 mm*, and nothing to choose. Otherwise a small row of four chips above the cards, plywood chosen, the last choice remembered.
- **Which cards.** The missions the class offers, then the plain things: *Box*, *Box with a lid*, *Round box*, *Carton*. Each plain thing is `boxRecipe` with a footprint, a kind and a starting size. *Carton* is greyed on plywood with today's reason.
- **Under the cards**, smaller: *Open a saved file*, and *Start with more tools* when the class allows it (Quick build's start screen).
- **Coming back.** *Start something new* in the menu shows the gallery with *Keep working on …* as the first card. *Your designs* (milestone 86) takes that place: the gallery shows the newest three designs first, and *All my designs* opens the library.

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
- **Menu**: *Start something new*, *Open a saved file*, *Save a copy*, the language, *More tools (Quick build)*, *All tools (Workshop)*, *Teacher view*.
- It fits from 1024 px wide with no sideways scroll; the stepper is never folded into a menu. In Hebrew the sheet and the mission card swap sides; the stage stays `dir="ltr"`.

### 3.3 Build

- **Size.** Three arrows on the box: wider, deeper, taller. Dragging one moves an outline and a label (*186 mm wide inside*); the design changes once, on release. A label can be tapped to type a number. Sizes are always the inside. A size that would not fit the sheet stops at the largest that does and says so.
- **Dividers.** Each has a round grip on its top. Dragging slides it, snapping to equal spaces, with the sizes of the spaces either side shown. Tapping it offers *Remove*.
- **Splitting.** Tap a space: its inside size shows, with a **+**. The + offers two pictures, *side to side* and *front to back* (only those that leave both halves 20 mm or more). The divider goes through the middle of that space and ends at the walls or dividers around it, as milestone 70's dividers do.
- **Lid.** *Lid* on the add bar opens today's three pictures, *None · Lifts off · Hinged*. One that cannot be made is greyed and says why, as now. A carton also has its *Bottom* pictures.
- **What goes inside.** *What goes inside* opens the seven objects as pictures. A tap puts one in the selected space, or the best free one. A count, *fits* in green or *needs 14 mm more* in amber, and **Make it fit**, which grows the box by what is missing and gives all of it to that space.
- **Other things.** A thing made from a template (the card stand) shows its own sizes as sliders with pictures. A design that is more than one box (a second box, a wall added by hand, a Workshop part) shows a note, *Made with more tools: you can decorate and send it*, a button back to those tools, and no arrows.
- **More about this box**, folded shut at the bottom of the sheet: how the corners hold (today's two joint lists, with pictures) and *No glue* on card and corrugated.

### 3.4 Decorate

- The arrows and grips go. Moving over the box lights the side under the pointer; a tap opens it face-on (today's solo view) with *Back to the box*.
- **Name**: engraved text in the middle, already saying the student's name when the app knows it. A text field, a size slider and the fonts the text card offers today.
- **Sticker**: the stickers as pictures; a tap places one in the middle.
- **Window**: circle, rounded rectangle or rectangle; *Cut out* or *Engrave*, each with a picture.
- A selected decoration is dragged to move, has corner handles and a turn knob, and *Copy* and *Remove*.
- The guardrails stay: a decoration stops a safe distance from the sides, the corners and other cut-outs, and a small note says why.

### 3.5 Send

- **The sheet**: the pieces as the laser will cut them, with their names. A picture only; nothing is dragged.
- **The check**: *Ready to cut ✓*, or each problem in plain words with **Fix**. What cannot be fixed says *Ask your teacher* (and *Open with more tools* when allowed).
- **Use less board**, when the pieces take more than one sheet: today's button and its one question.
- **The mission's goals and stars**, when there is one.
- **Watch it go together**: the assembly animation. For card and corrugated, *See it flat*.
- **The button.** With a class: **Send to my teacher**, which asks for a name once. Without one: **Download the file** (SVG, with no dialog), with *I have a class code* and *More download options* beside it.
- The button waits until the check is clear.

### 3.6 Words

| Today | Guided |
|---|---|
| Panel, board, part | side, bottom, lid, divider |
| Tray; Width · Depth · Height | wide, deep, tall (inside) |
| Compartment | space |
| Footprint, Kind | not shown (the gallery card chose them) |
| Copies to cut, Edit outline, Rotation | not shown |
| Download for laser | Download the file |
| Submit to class | Send to my teacher |
| Joints | How the corners hold (under *More about this box*) |
| Kerf, clearance, snapping, sheet settings | not shown |
| Lifts off, Hinged, No glue, Use less board, Cut out, Engrave, Ready to cut, Mission | kept, with their pictures |

### 3.7 What Guided leaves to the other two

- **To Quick build:** building from an empty floor, a second box, a wall or a standing board drawn by hand, a divider at any angle, outlines (gables), arrays, moving pieces on the sheet, SVG or DXF.
- **To Workshop:** polygons drawn by hand, angles, through-cuts, fold-overs, a second material, importing an SVG, lines (when built), kerf.

## 4. Decisions

| Topic | Decision |
|---|---|
| Three levels | **Guided · Quick build · Workshop** (decided 2026-11-19). Quick build keeps its name, its rail and its cards. |
| Name | **Guided**. A third mode value, `'guided'`, beside `'quick'` and `'workshop'`. The Hebrew name is chosen with the teacher. |
| What a mode is | Unchanged: a viewer preference, never part of the design. A file opens the same in every mode. |
| Default | **A new browser and a new class start in Guided**, from G7. This reverses the follow-up *Workshop by default*. A browser with saved preferences, and an existing class, keep their mode. |
| Engine | **No new design fields, no schema bump.** Guided calls existing ops and recipes. Golden exports stay byte-identical. |
| Shell | Guided has its own shell in `src/guided/`. There is still one stage (`View3D`) and one sheet view (`Plan2D`); the feature table decides what they show. |
| Feature table | Guided gets its own states beside Quick build's in `src/easy/features.ts`. Rule 3 of the lids plan holds for Guided too: every section of a Guided sheet names a feature, and `quickTable.test.ts` checks it. |
| Ghost and ✓ | **Not used in Guided.** Every action applies at once as one undo step. This reverses milestone 30, and §10.1 of the lids plan, for this mode only. |
| Scope | **Guided changes a thing; it does not build from nothing.** It has no Box, Wall or Standing board action: those are Quick build's. |
| Boxes | Every Guided box is a tray box made by `boxRecipe`, so today's lids, cartons and round boxes all work. |
| Dividers | Milestone 70's. Guided makes them by splitting a space and moves them with `setDividerOffset`. |
| Lid | `boxLid` and `setBoxLid`, with today's pictures *None · Lifts off · Hinged*. The kind (*Cap · Flat · Drop-in*, 79–80) is always *Automatic* in Guided; hasps (82) are not offered. |
| Sizes | Always the inside, through `boxSize(d, tray, 'inside')` / `setBoxSize` (`DIELINE_DNA_PLAN.md` D5a), so there is one meaning of *inside* in the app. |
| Joints | Chosen by the app. One folded row keeps them changeable. |
| Material | The class's, applied at the start. Without a class, a chip on the gallery. |
| Finish | The Send step. Students in a class never see a file format or kerf. |
| Moving up | The class decides: `mode` is the level students start in, and `modeLocked` (shown to the teacher as *Students stay in this level*) keeps them there. Without a class both other levels are in the menu. No schema change. |
| Between levels | A design opens the same in all three. In Guided, a design that is one box (or a template's thing) gets Build's arrows. Anything more is read-only in Build, with a button back to the level that made it, and can still be decorated and sent. |
| Teaching | Short looping pictures of each gesture, shown the first time. The tour stays off and stays Workshop's. |
| Input | The primary pointer does everything. Keys are extras: Undo, Redo, Delete, Esc, arrows. |

**My calls (say if you want them different):**

- **The middle level keeps the name Quick build.** `PACKAGING_AND_LEARNING.md` calls that rung *Open*.
- **A class has no "highest level" setting.** A teacher chooses where students start and whether they stay there, as today. Opening Quick build but not Workshop to a class would need a new column; it is left to the levels proposal.
- **The two organiser missions are rebuilt as recipes.** Pencil box and Game organiser start from the organiser template, which has its own older lid and its own divider counts. As version 2 they start from `boxRecipe` and `addDividerLine`, so one lid and one kind of divider serve every Guided box. This also changes what those two missions start as in Quick build: a box with the *Lid* section, in place of the template's form. Saved version-1 designs still open and still count their goals.
- **Joints stay one tap away**, under *More about this box*. A follow-up put them on Quick build's first card on purpose; this moves them off the first screen without removing them.
- **Send waits for the check.** Today a student can *Download anyway*.
- **Decorating is face-on**, not on the 3D box. It avoids drawing on a wall seen at a slant.
- **A name is engraved, never cut out**, so letters cannot lose their middles.
- **No levels or trophies.** The mission's stars stay; the concept image's *Level 4* bar does not.

## 5. Rules for the implementer

- Work on a new branch from `origin/main`. One commit per milestone, named with its number from `ROADMAP.md` §5 and its letter (`Milestone 92 (Guided G1): …`). Do not deploy. Guided is unfinished between G2 and G6; until G7 no browser and no class starts in it.
- Edits to a design are pure functions on an immer draft, through `apply` or `preview` + `commit` in `src/store/store.ts`. One student action is one undo step.
- The feature table (`src/easy/features.ts`) stays the only place that says what a mode shows. `View3D` and `Plan2D` ask it; they do not check the mode.
- `src/easy/` keeps the engine. New interface code goes in `src/guided/`. Nothing in `src/guided/` is imported by Workshop or Quick build components.
- Every new string goes into `src/i18n/en.ts` and `src/i18n/he.ts` under `g.*`. Every interactive element gets a `data-testid`.
- Hit targets are at least 44 px. Nothing in Guided may need a modifier key, a letter key, a double-click, a right-click or a hover.
- Check each function's signature before using it. The ones this plan names were found by `grep` on `main`, not read in full: `boxRecipe`, `boxTray`, `boxLid`, `setBoxLid`, `lidWhy`, `addDividerLine`, `setDividerOffset`, `dividersOn`, `dividerRow`, `setPanelSize`, `setTrayHeight`, `compartments`, `contentFit`, `bestCell`, `fixIssue`, `quickGuard`.
- After each milestone: `npm run typecheck`, `npm test`, and a short look in the dev server (`cutforge-dev`, port 5199). Do not run the full e2e suite or the `SHOTS` specs. G6 adds one spec, `tests/e2e/guided.spec.ts`; run only it and `classroom.spec.ts`.
- For a browser with no saved data, open `http://fresh.localhost:5199`: it is another origin, so the design and preferences on `localhost:5199` are not touched.
- `tests/golden.test.ts` must stay green and unchanged.
- After each milestone add its section to `PROGRESS.md` and its decisions to `DECISIONS.md`.
- Never set or read `SITE_PASSWORD`.

## 6. Milestones

### G1: what Quick build left half-done

Four fixes. No new interface. Each gets its repro in `tests/regress/` first.

1. **A draft is never saved.** In `useAutosave` (`src/store/hooks.ts`), while `pending` is set, save `pending.base` (the design before the draft) instead of `design`.
   - Test: start a Box and do not confirm; what `saveLocal` receives has no board. After ✓ it has the base and its walls. The same for a shape waiting for ✓.
2. **Template sizes keep the dividers where they were put.** In `regenerate` (`src/templates/registry.ts`), after `generate`:
   - every divider on the template's base that exists under the same id in the old design keeps its place as a fraction of the row it slides in (`dividerRow` gives the row's two ends), set with `setDividerOffset`;
   - dividers the student added on that base are kept the same way;
   - when a count goes up, the old ones keep their places and the new one goes to the middle of the widest gap; when it goes down, the highest-numbered goes;
   - no space ends smaller than `MIN_COMPARTMENT`.
   - Tests (`tests/templates.test.ts`): Pencil box, first divider moved +9 mm: after *Height* 30 → 32 it has not moved; after *Depth* 60 → 80 it is at the same fraction; 2 → 3 dividers keeps the first two; `tests/missions.test.ts` unchanged and green.
3. **The too-big fix ends clean, or says it did not work.**
   - On a template design, shrink through `regenerate` with scaled sizes, so the template's sizes stay true. Write the test first: after *Fix*, changing any template size must not bring `val.tooBig` back.
   - Run `STRICT=1` on `tests/fuzz/quick.test.ts`, find why other issues appear on the shrunk box, and fix that. `fixIssue` returns true only when the design has no new blocking issue; otherwise it leaves the design as it was.
4. **Quick build's empty stage does not name the Board tool.** In Quick build the hint under an empty stage is hidden (the note beside the rail already says where to start).

Dev look: in Quick build, drag a Box and reload before ✓ (nothing is left); Pencil box: slide a divider, change *Height* (it stays).

### G2: the mode and the shell

Files: `src/easy/features.ts`, `src/store/store.ts`, `src/App.tsx`, `src/views/View3D.tsx`, `worker/index.ts`, `src/net/api.ts`, `tests/quickTable.test.ts`; new `src/guided/GuidedApp.tsx`, `GuidedTopBar.tsx`, `Confirm.tsx`, `SideSheet.tsx`, `AddBar.tsx`.

- **The mode.** `Mode = 'guided' | 'quick' | 'workshop'`. The Worker's class patch (`worker/index.ts`, where it accepts `'quick'`) also accepts `'guided'`. No migration. Nothing starts in Guided yet: it is reached from the mode switch, which shows it only in a development build until G7.
- **Feature states.** `FEATURES` keeps Quick build's state for each feature; a second table gives Guided's, and a feature it does not list takes Quick build's. `useFeature` and `featureState` pick by mode. `SECTIONS` gains the sections of Guided's sheets, and `quickTable.test.ts` checks both modes.
- **The shell.** `App.tsx` renders `GuidedApp` in place of `TopBar`, `Toolbar`, `Inspector` and `MissionPanel` when the mode is Guided.
- **The step.** `guidedStep: 'build' | 'decorate' | 'send'` in the store: view state, not saved, not in the history. Changing step clears the selection and closes the face-on view.
- **The top bar** of §3.2. The stepper is a segmented control (`.seg`).
- **Feature rows**, new, `'show'` in Quick build and `'hide'` in Guided: `stage.edges` (`EdgeHandle`), `stage.panelWidgets`, `stage.floorGizmo`, `stage.placedGizmo`, `stage.dividerButton`, `stage.dock` (the view buttons and settings), `stage.foldBar`, `stage.hint`, `keys.tools` (the letter shortcuts in `src/store/hooks.ts`), `plan.edit` (dragging pieces, *Repack*). `View3D` mounts an empty `GuidedLayer` inside its scene in Guided. The guard (`quickGuard` in `store.ts`) runs in Guided as it does in Quick build.
- **Confirm.** *Start something new* asks in an in-app dialog (`Confirm.tsx`), not `window.confirm`.
- **The opening view.** In Guided a design opens seen from above and in front (about 50° up), so the inside of a box shows; it re-centres when the thing changes size.
- **Words test** (`tests/guidedwords.test.ts`): every key passed to `t()` under `src/guided/` starts with `g.` or with one of a short list of shared prefixes (`obj.`, `mission.`, `goal.`, `mat.`, the stickers' and lids' names); no English `g.*` string contains *joint, kerf, clearance, extrude, footprint, tray, panel, edge, grow, offset, nominal, compensat, DXF, SVG, LightBurn, snap, template*, apart from a short list of allowed keys.
- Tests: `tests/easymode.test.ts`: three mode ids; Quick build and Workshop behave exactly as before; switching to or from Guided leaves the design and history unchanged. `worker/api.test.ts`: a class patched to `'guided'` reads back `'guided'`.

Dev look: switch to Guided on a design with a box: the top bar with three steps, the box seen from above, no rail, no Workshop card. Quick build and Workshop look as they did.

### G3: things and the gallery

Files: new `src/guided/things.ts`, `src/guided/GuidedStart.tsx`; `src/easy/mode.ts`, `src/easy/missions.ts`, `src/teacher/TeacherApp.tsx`.

- **Things** (`things.ts`): the gallery's cards. `{ id, title, blurb, materials, start(material): Design }`: one for each mission (`startMission`), and the plain things. **(merged)** Each plain thing is a structure of `SENTENCE_BUILDER_PLAN.md` with set words, through `generate`: `box` (*a box*, rectangle, no lid, 120 × 80 × 45 mm inside), `box-lid` (the same, *with a lid that lifts off*), `round-box` (*a box*, round), `carton` (*a carton*; listed only where the structure's `materials(m)` allows it). `things.ts` holds only the set words, never a recipe.
- **Missions as recipes.** `pencil-box` and `game-organiser` become version 2: a `start` recipe (`boxRecipe`, then `addDividerLine` for each divider) that gives the same inside sizes and spaces as the template did. Their reference solutions in `tests/missions.test.ts` are rewritten with `setDividerOffset`, `addDividerLine` and `setBoxLid`. A saved version-1 design still opens and its goals still count.
- **The gallery** of §3.1 replaces `StartScreen` in Guided. Workshop and Quick build keep `StartScreen`. Thumbnails come from `renderThumbnail`, cached by thing and material as today.
- **The class's material at the start.** `joinClassFromLink` keeps the class's material profile (in the saved preferences, beside `missions`); the gallery starts every thing in it and hides the chips. `SubmitDialog`'s check stays as it is.
- **The class's list.** The existing `missions` list also accepts the plain things' ids. Check that the Worker's validation of that list accepts them.
- **Teacher's words** (`TeacherApp.tsx`): *Students start in: Guided / Quick build / Workshop*, *Students stay in this level* (`modeLocked`), *Things offered*.
- Tests (`tests/guidedthings.test.ts`): every card's starting design has no blocking issue in every material it lists; a class list of one mission gives one card; a class profile is the material of the design that starts; `carton` is not offered on plywood; each version-2 mission starts with the goals met that version 1 started with.

Dev look: the gallery in English and Hebrew; one tap starts the Pencil box; *Start something new* asks, then shows *Keep working on …* first.

### G4: Build

Files: new `src/guided/box.ts`, `fit.ts`, `GuidedLayer.tsx`, `steps/Build.tsx`, `Demo.tsx`; `src/templates/types.ts`, `stand.ts`; `src/ui/LidUI.tsx` and `Pictures.tsx` (reused); `src/easy/objects.ts`, `lid.ts` and `missions.ts` (read only).

- **The box model** (`box.ts`, pure). `kindOf(d)`: `'box'` (one floor board with one tray, its dividers and its lid, and nothing else), `'template'` (the stand, the organiser, a version-1 mission) or `'more'` (anything else: it gets the note of §3.3). For a box:

  | Function | What it does |
  |---|---|
  | `insideSize(d)` | `boxSize(d, tray, 'inside')` (D5a): the clear inside and the height to the lowest wall |
  | `setInsideSize(d, {w, d, h})` | `setBoxSize(d, tray, size, 'inside')` (D5a); then every divider keeps its distance from the side that did not move |
  | `spaces(d)` | `compartments()` |
  | `splitSpace(d, space, dir)` | `addDividerLine` through the middle of the space, as tall as the box's other dividers (or the walls less the usual gap) |
  | `moveDivider`, `removeDivider` | `setDividerOffset`; `deletePanel` |
  | `lid(d)`, `setLid(d, choice)`, `lidWhy` | `boxLid`, `setBoxLid`, `lidWhy` |

  Before building on them, check two things on `main` with a test each: what `setPanelSize` does to the dividers on a base, and that `compartments()` is right when a divider ends on another divider. Fix either here if it is not what the table says.
- **Template sizes as controls.** `TemplateDef` params get an optional `guided: { label, picture?, hide? }`. The stand shows *How wide are the cards*, *How far it leans*, *How many slots*, *How deep the base is* as sliders. The organiser shows width, depth, height and its two counts.
- **Arrows** (`GuidedLayer`): three `PushPull`-style handles on the box's right side, front side and rim. A drag shows an outline and a label and calls `setInsideSize` once on release. On release, if `val.tooBig` appears, step back to the largest size that fits (at most six tries) and show *That is as big as the sheet allows*. Labels take a typed number (`DimLabel` with `onCommit`).
- **Grips**: one per divider, reusing `DividerSlide`'s snapping and labels; one undo step per drag.
- **Spaces**: a tap on the floor of a space selects it: its size, its **+**, what is in it.
- **Add bar**: *Divider* (splits the selected space, or the largest), *Lid*, *What goes inside*.
- **Lid**: the *Lid* section's pictures from `LidUI`, in the side sheet. A carton's *Bottom* pictures beside them.
- **What goes inside**: the objects as pictures, the count, the fit, *Remove*, and dragging a lot to another space (`ContentsView`).
- **Make it fit** (`fit.ts`): `fitContent(d, contentId)` reads `contentFit(d, c).need`, grows the inside by it and moves every divider beyond that space by the same amount, so the other spaces keep their sizes. A box that is not a rectangle is scaled until it fits (at most six tries). It returns null when the result would not fit the sheet, and the sheet then says *They cannot all fit on one sheet*.
- **Pictures of gestures** (`Demo.tsx`): three short loops drawn in SVG and CSS (pull an arrow, slide a divider, drag to look around), each shown the first time, replayable from **?** on the add bar, a still picture under `prefers-reduced-motion`.
- Tests:
  - `tests/guidedbox.test.ts`: `setInsideSize` equals `setPanelSize` + `setTrayHeight`, keeps a name engraved on the front wall, and leaves each divider the same distance from the fixed side; split, move and remove leave the other dividers where they were; a split inside one space ends on that space's walls and dividers; each lid choice gives the design the *Lid* section gives; a lid follows the box through a resize.
  - `tests/guidedfit.test.ts`: Pencil box: `fitContent` on the pencils meets *Holds 12 pencils*, the box is 14.2 mm deeper, the other two spaces are within 0.1 mm of before, and a second call changes nothing; the dice tray grows until six dice fit; a lot too big for the sheet returns null.
  - `tests/fuzz/quick.test.ts` gains sequences of Guided actions (resize, split, move and remove dividers, lid, objects, *Make it fit*): no blocking issue after any of them.

Dev look: Pencil box: pull the box deeper, slide a divider, split a space, *Make it fit* on the pencils (the goal ticks), a lid on and off, Undo back through each step.

### G5: Decorate

Files: new `src/guided/steps/Decorate.tsx`, `decorate.ts`; `src/views/Plan2D.tsx` (the face-on view), `src/easy/guard.ts` (the note's words only).

- Step 2 of §3.4. A tap on a side calls `openSolo(panelId)`; *Back to the box* closes it. A side `workshopOnly` names cannot be opened and says why. A curved wall (a round box's band) cannot be decorated yet, as today, and says so.
- **Recipes** (`decorate.ts`): `addName` (`addText`, engraved, in the middle, sized between `minTextSize` and a third of the side), `addSticker` (`stickerRecipe`, a quarter of the side), `addWindow` (`holeRecipe`). Each is one `apply` and selects what it made. None goes through `pending`.
- In the face-on view in Guided: no operation dots, no Score or Add, no through-cut, no arrays; the selection frame, its corner handles and its turn knob stay. **(rebased)** The solo view also gets, from `DIELINE_DNA_PLAN.md`, side handles and *Keep proportions* (D0c, feature `transform.sides`) and double-click editing of outlines (D0b-2, feature `edit2d`): both `'hide'` in Guided, so a double-click or a side handle never appears there (rule: no double-click in Guided).
- The guard's note is reworded: *Kept 3 mm from the side*, *from the corner teeth*, *from the next cut-out*.
- Tests (`tests/guideddecorate.test.ts`): on every flat side of every thing in every material, a name, a sticker and a window placed in the middle leave no blocking issue; on a side too small for one, it is not made and the reason is returned; a pre-filled real name meets *Your name engraved*, the placeholder does not; decorations on a lid's top are carried when the lid's kind changes (what `setBoxLid` already does).

Dev look: Pencil box: open the front, add a name and type it, add a sticker, drag it to a corner (it stops short), go back to the box (both show).

### G6: Send

Files: new `src/guided/steps/Send.tsx`, `src/net/submit.ts`; `src/ui/SubmitDialog.tsx` (uses `submit.ts`), `src/ui/SplitUI.tsx` (*Use less board*, reused), `src/views/Plan2D.tsx`, `tests/e2e/guided.spec.ts`, `tests/e2e/classroom.spec.ts`.

- Step 3 of §3.5. The sheet is `Plan2D` with `plan.edit` hidden.
- **Print a plan** (milestone 90) is a small link under the sheet, A4, for a class without a laser in the room.
- **The check** lists `validate(d).filter(blocking)`, each through a Guided wording (`g.val.*`) for the keys `fixIssue` handles, with **Fix**. Any other key reads *This needs your teacher*.
- **Sending** moves out of `SubmitDialog.tsx` into `src/net/submit.ts` (the class lookup, the profile check, the upload, the remembered name and code); both callers use it. In Guided a class whose material differs from the design's asks once, *Your class cuts in … Switch to it?*, applies it and runs the check again.
- **Download** in Guided is SVG at nominal size with no dialog. *More download options* opens `ExportDialog`.
- **Watch it go together** plays `playAssembly` over the stage and returns to Send.
- Tests:
  - `tests/guidedsend.test.ts`: `submit.ts` against a mocked `api`: a class with a profile, a closed class, no network (the download is offered), a second send replaces the first.
  - `tests/e2e/guided.spec.ts`, in English and Hebrew, at 1366 × 768 and 1024 × 768: the gallery, Pencil box, *Make it fit*, a name, Send: *Ready to cut ✓* and three stars, the download is an SVG; then *Box with a lid*, its lid changed to *Hinged*. No step uses a key or a right-click.
  - `tests/e2e/classroom.spec.ts` gains a Guided class: a locked class's link with a material profile starts in that material, with no chips and no way to the other levels; *Send to my teacher*; the teacher sees *Pencil box · 5 of 5 goals*.

### G7: Guided becomes the way in

- **The default.** A new browser, and a new class, starts in Guided.
- **The switch.** Quick build's and Workshop's top bar switch shows three levels, *Guided · Quick build · Workshop*; Guided's menu has the other two. A locked class hides both. Where the bar is narrow the switch is in the ⋯ menu, as today.
- **Between levels.** Switching never changes the design. Coming down to Guided with a design that is more than one box shows §3.3's note; its button goes back to Quick build, or to Workshop when a part needs it (`workshopOnly`).
- Nothing of Quick build is removed: its rail, its cards, its start screen and its specs stay.
- Tests: `tests/easymode.test.ts`: a new browser starts in Guided, a browser with saved preferences keeps its mode, a locked class cannot switch; a box with a wall added in Quick build is `'more'` in Guided and is unchanged by the trip there and back. `guided.spec.ts` gains: from Guided to Quick build and back on one design.
- README: a *Guided* section, and the three levels. `EASY_MODE.md` and §10 of `LIDS_LINES_PROJECTS_PLAN.md` each get one line at the top pointing here. DECISIONS: a *Guided* section (three levels, Guided by default, no ghost and ✓ in Guided, Guided does not build from nothing).
- Final check: `npm run typecheck`, `npm test`, `npm run build` (note the size of the Guided chunk and of the entry), `guided.spec.ts` and `classroom.spec.ts`. By hand in the dev server, in both languages: every thing from the gallery to *Ready to cut ✓*.

## 7. Order and size

**G1 → G7** in that order; `ROADMAP.md` §5 places them among the dieline milestones.

- G1 stands alone and is worth shipping by itself: it fixes today's Quick build and Workshop. It goes first of everything (`ROADMAP.md` rule 1.2, bugs first).
- G2 must come before the rest: the shell is where every later piece lives.
- G1 is milestone 92 and comes before everything; G2–G7 are 105–110, after the sentence (94–100) and the 2D editing (101–104).
- G3 needs the sentence's structures (95–96); G4 needs D5a (93, `boxSize` / `setBoxSize`).
- G5 and G6 do not depend on each other and could swap. G5 runs in the solo view after D0b-1's canvas refactor; whichever lands second rebases on the other.
- A later Workshop or Quick build milestone that adds a control adds its Guided row (usually `'hide'`) in the same commit.

Rough sizes, as guesses: G1 is two or three days. G2 and G3 are three or four days each. G4 is the largest, about two weeks: the box model, *Make it fit* and the stage handles. G5 and G6 are about a week each. G7 is a day or two.

## 8. Not in this plan

- A Guided path for waffle sculptures.
- New missions or things beyond the ones `main` has.
- Projects and sizes (87–88) beyond the gallery's *Your designs*; lid kinds other than *Automatic*, hasps and *Put on / Close* (76–82); lines (83–85); everything in `DIELINE_DNA_PLAN.md` (each of its controls is `'hide'` in Guided).
- Decorating a curved wall.
- The Worker counting a mission's goals itself (it still trusts the student's numbers).
- Unlockable groups of features, and a highest level per class (`PACKAGING_AND_LEARNING.md`).
- Repairing the tour.
- Workshop's own wording and layout (`UI_CLEANUP_PLAN.md` has that).

## 9. Still needs the owner

- **Real students.** Three to five who have not seen it, 20 minutes each, on a school Chromebook: can each get from the link to *Sent* without help?
- **A trackpad and a touch screen.** Every drag in §3.3 and §3.4 by hand; only the mouse can be driven from a session.
- **Hebrew.** The mode's name, and a native speaker's review of every `g.*` string.
- **The calls in §4.** Especially joints off the first screen, Send waiting for the check, and the two missions rebuilt as recipes.
- **The mock-ups** are in `docs/guided-mockups/` (renamed). `easymode/DECISIONS.md` on the branch was a byte-identical copy of *One plywood organizer, two modes.png* and was not brought over.
