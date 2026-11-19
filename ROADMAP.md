# CutForge: one roadmap (milestones 74–91 from the plans of 17–18 November; 92–111 from those of 19 November, §5)

Written 2026-11-18, after milestone 73. Three plans were committed within two days, each written from a different `main`:

| Plan | Branch it came from | Written from | Status |
| --- | --- | --- | --- |
| `UI_CLEANUP_PLAN.md` | `claude/ui-cleanup-plan` | `main` at `1c4cb96` (milestone 73) | the owner's own notes on the live site; newest |
| `LIDS_LINES_PROJECTS_PLAN.md` | `main` | `main` at `c841816`, rebased | 73 built; 74–86 not started |
| `PACKAGING_AND_LEARNING.md` | `claude/busy-pascal-9rlxzv` | `main` at `c47c273` (milestone 43) | not started; partly built since by 61–73 under other names |

The first two are copied into this branch beside this file so that every reference resolves. This file decides how they fit together: one order, one set of names, and what is left for later because it does not fit the direction the owner gave on 18 November.

## 1. Rules for settling a conflict

1. **The owner's notes win.** `UI_CLEANUP_PLAN.md` is the owner's notes with their answers. Where it and an older plan disagree, it is followed and the older plan is changed to fit.
2. **Bugs before features.** The owner's render bugs (cleanup Part 1) come first, before anything adds more geometry that could be drawn wrongly in the same way.
3. **The rail shrinks; it never grows.** Cleanup Part 2 takes Workshop's rail to five buttons and `LIDS_LINES_PROJECTS_PLAN.md` rule 10.1.1 keeps Quick build's at six. A later milestone that wanted a rail button of its own gets a place inside an existing one instead.
4. **What is already built is not planned again.** `PACKAGING_AND_LEARNING.md` milestones 46 and 47 (closures, tube nets) were built as packaging milestones 67 and 68 on a different model; they are dropped.
5. **What needs the server, an account model or a teaching decision the owner has not taken** is left for later (§4), because nothing in the owner's notes asks for it and each would change the classroom's workflow.

## 2. Where the plans meet, and how each meeting is settled

| # | Topic | Cleanup plan says | Lids plan says | Settled |
| --- | --- | --- | --- | --- |
| 1 | Where a lid of its own stands | Beside the box, on the floor, rim up, front-right, 20 mm clear (Part 3) | On top of the box; `lidPose` lifts it 1.5 × the box's height when opened (§3.5) | **Beside the box.** `lidPose` is kept for folded lids only, and *Put on* shows a lid of its own in place. Every lid kind of §3.2 (Cap, Flat, Inset, Drop-in) is placed beside the box the same way. |
| 2 | A folded lid on screen | Drawn opened back about 110° by default (Part 3.2) | Closed, with an *Open / Close* badge (§3.5) | **Open by default**, *Close* / *Put on* to check the fit; one badge, one store field (`lidsShown`), view state only. |
| 3 | The Line tool | Not mentioned; the rail goes to *Select · Shapes ▾ · Divider · Text · Import* | Its own rail button, `L` (§6) | **A sixth footprint, *Line*, in the Shapes menu.** Its operators are the line types (*Cut · Crease · Perforation · Cut-crease · Guide*) instead of *Board · Cut out · Engrave · Score · Add*. `L` still picks it. Quick build still has no line tool. |
| 4 | Plywood lids that close the box | *Fixed · Rests · Hinged (living hinge) · Lifts off* on the grow card (Part 5.2) | `closureStyles('plywood') = ['hinge', 'rest', 'fixed']`, `hinge` being the pin hinge (§3.1) | **Both, in two steps.** Milestone 77 gives plywood `fixed` and `rest` as closure styles, *Hinged* as the living hinge and *Lifts off* through `setBoxLid`. The pin hinge (milestone 81) joins *Hinged* when built, as the cleanup plan already says. |
| 5 | Recognising a grown lid | `sealFor` generalised from tray walls to any ring of standing boards (Part 5.3) | Recognise a lid by what it does, not by its joint (§3.1) | **Both, in milestone 77**: one recogniser, joint-independent, over tray walls first and then rings of boards. |
| 6 | One hint, not two | Part 6.3 | `PACKAGING_AND_LEARNING.md` 44 | The same item; built once in milestone 78. |
| 7 | Greyed buttons say why | Part 4 / 6 (fewer greyed buttons) | `PACKAGING_AND_LEARNING.md` 44 | Built in milestone 78 with the grow card's *Edges* list. |
| 8 | Names (*Lid*, *Depth*) | — | 73 (built) | Done. |
| 9 | Dieline legend and 1 : 1 print | — | Part D replaces `PACKAGING_AND_LEARNING.md` 54 | As the lids plan says (milestones 89–90). |
| 10 | *Variants* | — | Duplicates in a project with *Compare* (§7.2) | As the lids plan says; no second store. |
| 11 | The Board tool's key `P` | `P` picks *Rectangle + Board*, `P P` toggles standing | — | As the cleanup plan says. The Extrude and Divider keys are unchanged. |
| 12 | Quick build's rail | Unchanged (`QuickRail.tsx`) | Unchanged | Unchanged. Cleanup Part 2 is Workshop only. |

## 3. Milestones

Each ends as the earlier ones do: typecheck, unit suite, golden exports byte-identical unless a change is intended and listed, the browser spec for that milestone, English and Hebrew strings, `README.md`, `DECISIONS.md`, `PROGRESS.md`, and a row in Quick build's feature table for anything new it shows or hides.

| # | Milestone | From | Notes |
| --- | --- | --- | --- |
| **74** | **The net and 3D in step**: slit-lock tongues and slits in 3D, curved-surface connections, dividers' width on the cut plan, a harness check that whatever a joint adds to the net is drawn in 3D | Cleanup Part 1 | Bugs first. Each reproduced by a failing test before its fix. |
| **75** | **One Shapes tool** with footprint × operator; the Board, Standing, Round, Rounded and Polygon buttons fold into it | Cleanup Part 2 | No model change. Old test ids kept as aliases. |
| **76** | **Lids beside the box**, folded lids shown open, *Put on / Take off* | Cleanup Part 3; lids plan §3.5 | Settles conflicts 1 and 2. View state only for the pose; `Tray.lidAt?` for a moved lid. |
| **77** | **Grow that closes the box**: style chosen on the grow card, plywood `fixed` / `rest`, any ring of boards; a grown lid recognised whatever its joint | Cleanup Part 5; lids plan §3.1 | Settles conflicts 4 and 5. |
| **78** | **Grow made easier and a quieter interface**: snaps while dragging, a shorter grow card, edges from the board's card, the settings card folded, one view cluster, one hint, sections closed by default, greyed buttons say why | Cleanup Parts 4 and 6; packaging-and-learning 44 (hint, reasons) | |
| **79** | **The lid generator**: `lidChoices` with reasons and fixes, *Automatic*, the *Flat* lid, a cap's rim choices, the *Style* row, `val.lidKind` | Lids plan 74 | Lids land beside the box (76). |
| **80** | **Inset and Drop-in lids** | Lids plan 75 (less the pose, done in 76) | |
| **81** | **The pin hinge** (starting numbers from §3.3; the spike needs real plywood, so the numbers are marked unverified) | Lids plan 76 | Joins *Hinged* on plywood. |
| **82** | **Hasps and the Escape box mission** | Lids plan 77 | |
| **83** | **Lines in the engine** (`Panel.lines`, dashes, checks, SVG and DXF) | Lids plan 78 | |
| **84** | **The Line footprint** in the Shapes menu | Lids plan 79, adapted (conflict 3) | |
| **85** | **How a fold is made** (crease styles, creases on the back) | Lids plan 80 | |
| **86** | **The library** of designs in the browser | Lids plan 81 | |
| **87** | **Projects** | Lids plan 82 | |
| **88** | **Sizes** | Lids plan 83 | |
| **89** | **Dimensions on the dieline** and the legend | Lids plan 84 | |
| **90** | **The spec sheet** | Lids plan 85 | |
| **91** | **Final verification** | Lids plan 86 | |

If time is short, the core is 74–79, 82 on flat and cap lids, 83–84, 86 and 89.

### Status (2026-11-19)

| # | State | What is left (see `PROGRESS.md` and `DECISIONS.md` for each) |
| --- | --- | --- |
| 74 | ✅ built | Dividers narrow on the cut plan: not reproduced; needs the owner's design. |
| 75 | ✅ built | Old test ids were moved, not aliased. |
| 76 | ✅ built | — |
| 77 | ✅ built | *Rests* on plywood is the Flat lid (79); boxes built from boards without a tray do not close yet. |
| 78 | ✅ built | Rail labels and the start screen's first question left for later (§4). |
| 79 | ✅ built: Cap and Flat, Automatic, reasons, a cap's rim | `val.lidKind`, the Extrude card's *Lid* row, the fit spike. |
| 80 | ✅ Drop-in | Inset deferred (§4). |
| 81 | ⏸ deferred | Needs the plywood spike (§4). |
| 82 | ✅ on Flat lids, and the Escape box | Hasps on a cap or a hinged lid (§4). |
| 83 | ✅ built | `val.lineNear`; arcs are flattened in the file. |
| 84 | ✅ built | Editing a line's points and arcs on the stage; lines across folds on the cut plan. |
| 85 | ✅ per joint | The design-wide choice; creases on the back. |
| 86 | ✅ built | Card thumbnails; `navigator.storage.persist()`. |
| 87 | ✅ built | *Compare*. |
| 88 | ✅ in the settings card and the download | Showing a size on the stage. |
| 89 | ✅ blank sizes, glue, legend, guide-layer option | Dimension chains, the grain arrow, the title block. |
| 90 | ✅ fitted pages | The tiled 1 : 1 print. |
| 91 | ✅ verified | See `PROGRESS.md`. |

## 4. Left for later (does not fit the direction of 18 November)

| Item | From | Why it waits |
| --- | --- | --- |
| **Levels** (*Guided · Open · Workshop*) in place of the two modes | packaging-and-learning 45 | **Taken up on 19 November** as *Guided · Quick build · Workshop* (`GUIDED_MODE.md`, §5 below). The proposal's unlockable groups of features stay here. |
| **Briefs instead of checklists**, hint ladders, predict-then-check | packaging-and-learning 50 | A teaching decision (stars, what counts as a goal) the owner has not taken. The *Escape box* mission (82) is written so that it can become a brief. |
| **Guardrails that teach** (*Prevent · Warn · Off*), why cards, glossary | packaging-and-learning 51 | Changes Quick build's founding decision *Prevent, don't report* (`EASY_MODE.md`); needs the owner. |
| **Design journal, reflection, teacher feedback** | packaging-and-learning 52 | Needs Worker and database changes and a privacy review; nothing in the owner's notes asks for it. *Variants* is covered by projects (87). |
| **Teacher-written briefs** | packaging-and-learning 53 | Needs the server; follows briefs. |
| **A library of packaging styles**, *start from the product* | packaging-and-learning 48–49 | Quick build's *Kind* (*Open box · With a lid · Carton*) covers the first styles; a style library sits on the start screen and does not touch the owner's notes. |
| **The start screen's first question** (*Guided · Full workshop*), missions beside templates | packaging-and-learning 44 | Decides the default mode, an open decision (`DECISIONS.md`). |
| **Rail labels** (icon and word from 1200 px) | packaging-and-learning 44 | With five buttons the rail can take words; left for the interface pass after 78 so it is judged on the new rail. |
| **Artwork guide** (face templates, preview textures) | packaging-and-learning 54 | Belongs with `IMAGES_ON_BOARDS.md`. |
| **Closures as `Panel.flaps`, tube nets as a second unfolding** | packaging-and-learning 46–47 | Built as milestones 67–68 on another model. Dropped, not deferred. |
| A sleeve, sliding lids, ledges, corrugated hasps, fold along a drawn line, tear strip in one action, a game-parts generator, starter designs from the teacher, library sync | lids plan §15 | As that plan says. |
| **The pin hinge** (milestone 81) | lids plan §3.3 | Its sizes are set by cutting three plywood boxes (80 × 60 × 40, 150 × 100 × 60, 250 × 180 × 80 mm) until each opens past 100°, stays open and closes flat. Not possible without a laser and plywood. |
| **Hasps on a cap or a hinged lid** | lids plan §3.4 | A cap's rim joint has to be split round each tongue, and the spike must show whether a lid locked at the front tilts off at the back. Flat lids have them (milestone 82). |
| **The Inset lid** | lids plan §3.2 | Needs tray walls standing in from their base's edge by more than the tab-and-slot offset, with finger joints (the plan's risk 2). Cap, Flat and Drop-in cover the need meanwhile (milestones 79–80). |
| **Boxes built from boards** (no tray) closing with a grown lid | cleanup Part 5.3 | Needs one answer to "what is a box" shared with the lid generator. |
| `PRESETS_PLAN.md`, `IMAGES_ON_BOARDS.md`, the waffle branch | older branches | Not part of this round. The lids plan §16 says how each meets this work. |

## 5. Milestones 92–111: the plans of 19 November

Two plans were written on 19 November, each first from `main` at `1c4cb96` (milestone 73), and both rebased onto `3709043` (milestone 91):

| Plan | Came from | Milestones |
| --- | --- | --- |
| `GUIDED_MODE.md` | `claude/guided-mode` (only the plan and the mock-ups in `docs/guided-mockups/` were brought over; the branch's waffle and sculpt code stays on PR #6) | G1–G7: a first level, *Guided*, below Quick build |
| `DIELINE_DNA_PLAN.md` | this branch; takes the sketch engine, the 2D canvas and the scale frame from `claude/guided-mode` (its §0b) | D0–D10: editing in 2D, the flat workspace, flaps, sizes, artwork, production |

The two plans name their milestones by letter; **this table is the only place that numbers them.** The rules of §1 still settle conflicts, with one more: **4b. A level never sees another level's controls by accident**: every new feature row says its state in Guided, Quick build and Workshop.

### 5.1 Order

| # | Milestone | Plan | Why here |
| --- | --- | --- | --- |
| **92** | **What Quick build left half-done**: an unconfirmed draft is never saved; template sizes keep the dividers where they were put; the too-big fix ends clean; no Board-tool hint in Quick build | Guided G1 | Rule 1.2, bugs first. The first two were re-checked on `3709043`: `useAutosave` still saves the design while a ghost is pending, and `regenerate` still has no divider step. It also makes milestone 88's sizes of a template keep their dividers. |
| **93** | **Outline mode** | Dieline D0 | The owner's request; small |
| **94** | **The sketch engine and the 2D canvas** (ported) | Dieline D0b-1 | No visible change; 96, 101 (Decorate's face-on view) and 106 build on its `canvas2d` |
| **95** | **The transform frame in 2D** | Dieline D0c | Small; `transform.sides` hidden in Guided |
| **96** | **Edit outlines in the 2D view** | Dieline D0b-2 | The owner's request; `edit2d` hidden in Guided |
| **97** | **Size intent** (*Outside · Inside · Crease to crease*) | Dieline D5a | Guided's Build sizes by the inside through it |
| **98** | **The mode and the shell** | Guided G2 | |
| **99** | **Things and the gallery** | Guided G3 | |
| **100** | **Build** | Guided G4 | Uses 97 |
| **101** | **Decorate** | Guided G5 | In the solo view as refactored by 94 |
| **102** | **Send** | Guided G6 | Uses *Print a plan* (90) and *Use less board* (73) |
| **103** | **Guided becomes the way in** | Guided G7 | A new browser and a new class start in Guided |
| **104** | **The edge-feature registry** | Dieline D3a | No output change |
| **105** | **Shaped flaps** (tuck, dust, glue, hang) | Dieline D3b | |
| **106** | **The Net view** (*Sheets · Nets* in the cut plan) | Dieline D1 | |
| **107** | **Building in the flat** | Dieline D2 | |
| **108** | **The artwork template** (PDF and SVG) | Dieline D8 | |
| **109** | **Board grades** | Dieline D5b | |
| **110** | **Production**: nicks, fill the sheet, cost | Dieline D9 | |
| **111** | **Verification of 92–110** | both (D10, and Guided's final check in G7) | |
| — | Closures anywhere; the style catalogue; fold along a line | Dieline D4, D6, D7 | Wait for the owner (`DIELINE_DNA_PLAN.md` §7, questions 8 and 9) and D7's spike |

If the owner wants Guided sooner, 98–103 can move up to follow 92 and 97 directly; nothing in 93–96 is needed by them except 94's canvas refactor for 101 (Decorate), which can rebase either way.

### 5.2 Where the two plans meet, and how each meeting is settled

| # | Topic | Guided says | Dieline says | Settled |
| --- | --- | --- | --- | --- |
| 1 | Numbers | 87–93 | 92–103 | Both were taken or overlapping; §5.1 numbers both. |
| 2 | Inside sizes | `insideSize` / `setInsideSize` in `src/guided/box.ts` | `boxSize` / `setBoxSize` with `Design.sizeAs` in `src/model/boxSize.ts` (D5a) | **One meaning of inside**: D5a's functions; Guided's are thin wrappers. *Divider keeps its distance from the side that did not move* goes in `setBoxSize`, so Workshop gets it too. D5 is split so D5a comes before Guided. |
| 3 | The face-on view | Decorate in the solo view: corner handles and a turn knob, no double-click, no modifier keys | D0b-1 refactors that view (`canvas2d`); D0c adds side handles and *Keep proportions*; D0b-2 adds double-click editing | Both, gated: `transform.sides` and `edit2d` are `'hide'` in Guided. Guided's Decorate gets the refactor for free. |
| 4 | *Make it fit* | `fitContent(d, contentId)`: grow one space by what is missing | D6 `fitToContents(d, trayId, room)`: the whole box round its contents | Both, side by side, both through `setBoxSize`; Guided's is built first (100). |
| 5 | A list of things to start from | G3's `things.ts` for the gallery | D6's `STYLES` on the start screen | **One registry.** Built by Guided (99); D6, if the owner says go, extends it with sizes and trade codes rather than adding a second list. |
| 6 | Feature table | A second table of states for Guided; a feature it does not list takes Quick build's | Every new control `'hide'` in Quick build | Every dieline control is then `'hide'` in Guided too; rule 4b asks each new row to say so. `quickTable.test.ts` checks both modes from 98. |
| 7 | Ghost and ✓ | Not used in Guided | D2's grow in the flat uses the ghost | *Nets* (`plan.nets`) is hidden in Guided, so no conflict. |
| 8 | Lid kinds | "join the Lid row when built" | — | Built (79–82). Guided always uses *Automatic*; no hasps. |
| 9 | Coming back to a design | *Keep working on …*, then *Your designs* "when 81 is built" | — | Built as 86: the gallery leads with the newest designs. |
| 10 | Start screen | Gallery replaces `StartScreen` in Guided | D6's *Packaging styles* row on `StartScreen` (Workshop) | Separate screens, one registry (row 5). |
| 11 | Levels in §4 | Takes up *Levels* | — | §4's row now says so. |
| 12 | The branch's code | Guided does not need the waffle | D0b-1 ports `src/sketch/*` and `canvas2d.tsx` | **No git merge of `claude/guided-mode`.** It forked at milestone 43 (`c47c273`), 48 milestones behind; a merge conflicts in 14 files and would mark the waffle commits merged under PR #6. Files are brought over by path, with the branch named in the commit. |
