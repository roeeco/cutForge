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

## 5. Milestones 92–118: the plans of 19 November

Three plans were written on 19 November and are rebased onto `main` at `1917440` (milestone 91 and the fold overhaul):

| Plan | Came from | Milestones |
| --- | --- | --- |
| `SENTENCE_BUILDER_PLAN.md` | the owner, 19 November | S1–S7: the welcome screen's presets become one sentence of words to pick |
| `DIELINE_DNA_PLAN.md` | this branch; takes the sketch engine, the 2D canvas and the scale frame from `claude/guided-mode` (its §0b) | D0–D10 (less D6): editing in 2D, inside sizes, the flat workspace, flaps, artwork, production |
| `GUIDED_MODE.md` | `claude/guided-mode` (only the plan and the mock-ups in `docs/guided-mockups/` were brought over; the branch's waffle and sculpt code stays on PR #6) | G1–G7: a first level, *Guided*, below Quick build |

The plans name their milestones by letter; **this table is the only place that numbers them.** The rules of §1 still settle conflicts, with one more: **4b. A level never sees another level's controls by accident**: every new feature row says its state in Guided, Quick build and Workshop.

### 5.1 Order

| # | Milestone | Plan | Why here |
| --- | --- | --- | --- |
| **92** | **What Quick build left half-done**: an unconfirmed draft is never saved; template sizes keep the dividers where they were put; the too-big fix ends clean; no Board-tool hint in Quick build | Guided G1 | Rule 1.2, bugs first. Re-checked on `1917440`: `useAutosave` still saves the design while a ghost is pending, and `regenerate` still has no divider step. The sentence (S2, S6) and milestone 88's sizes of a template need the divider fix. |
| **93** | **Size intent** (*Outside · Inside · Crease to crease*), `boxSize` / `setBoxSize` | Dieline D5a | The sentence's `sizeAs` word (S2) and Guided's Build (G4) both size by the inside through it |
| **94** | **The contract and the resolver** | Sentence S1 | The owner's newest plan; pure code |
| **95** | **The box, the tray and spaces** | Sentence S2 | |
| **96** | **The carton and the sleeve** | Sentence S3 | Replaces Dieline D6's style cards |
| **97** | **The sentence component** | Sentence S4 | Can run beside 96 |
| **98** | **The welcome screen** | Sentence S5 | |
| **99** | **The preset card after Start** | Sentence S6 | |
| **100** | **Sentence verification** | Sentence S7 | |
| **101** | **Outline mode** | Dieline D0 | The owner's request |
| **102** | **The sketch engine and the 2D canvas** (ported) | Dieline D0b-1 | No visible change; 104, 108 (Decorate) and 113 build on its `canvas2d` |
| **103** | **The transform frame in 2D** | Dieline D0c | `transform.sides` hidden in Guided |
| **104** | **Edit outlines in the 2D view** | Dieline D0b-2 | The owner's request; `edit2d` hidden in Guided |
| **105** | **The mode and the shell** | Guided G2 | |
| **106** | **Things and the gallery** | Guided G3 | Its plain things are the sentence's structures (95–96) with their default words |
| **107** | **Build** | Guided G4 | Uses 93 |
| **108** | **Decorate** | Guided G5 | In the solo view as refactored by 102 |
| **109** | **Send** | Guided G6 | Uses *Print a plan* (90) and *Use less board* (73) |
| **110** | **Guided becomes the way in** | Guided G7 | A new browser and a new class start in Guided |
| **111** | **The edge-feature registry** | Dieline D3a | No output change |
| **112** | **Shaped flaps** (tuck, dust, glue, hang) | Dieline D3b | Opens the sentence's later mailer and envelope (§8 there) |
| **113** | **The Net view** (*Sheets · Nets* in the cut plan) | Dieline D1 | |
| **114** | **Building in the flat** | Dieline D2 | |
| **115** | **The artwork template** (PDF and SVG) | Dieline D8 | |
| **116** | **Board grades** | Dieline D5b | The sentence's lists take them unchanged (they check the thickness) |
| **117** | **Production**: nicks, fill the sheet, cost | Dieline D9 | |
| **118** | **Verification of 92–117** | all three (D10, G7's final check; S7 already done at 100) | |
| — | Closures anywhere; fold along a line | Dieline D4, D7 | Wait for the owner (`DIELINE_DNA_PLAN.md` §7, question 8) and D7's spike |
| — | The sentence's later items (a mailer, sized by contents, a sentence bar in the design, Guided's gallery opening with the sentence; the drawer and the envelope came with C2 and C5) | Sentence §8 | Registered as `planned`, not shown |
| C1 | **Named styles in the sentence, and a card grid of them** (*Sentence · Cards* on the welcome screen) | `SENTENCE_STYLES_PLAN.md` | Built beside 111–114 (20 November); letters, not numbers: §5.3 numbers 119–133 |
| C2 | **Straight tuck end, the regular slotted container, the drawer box** | `SENTENCE_STYLES_PLAN.md` | |
| C3 | **The crash-lock (auto) bottom** | `SENTENCE_STYLES_PLAN.md` | The owner confirms the patent question (§0 there) before it ships |
| C4 | **The gable top box and the one-piece hexagon box** | `SENTENCE_STYLES_PLAN.md` | Carton ends on tubes of more than four sides not built (the hexagon box is a box with a hinged lid) |
| C5 | **Flat pieces: two envelopes, a presentation folder, a gift-card holder** | `SENTENCE_STYLES_PLAN.md` | Uses 112's shaped flaps; answers D7's first question (a grown board folds flat and exports at any angle) |

The three plans' blocks can move as blocks: Guided (105–110) needs only 92 and 93 (and 102 for Decorate, which can rebase either way); the 2D editing (101–104) needs nothing before it; the sentence (94–100) needs 92 and 93.

**Status (20 November):** 92–114 and 116 built, C1–C5, and **119–133, the shapes plan, built** (see `PROGRESS.md`); **the QA fix round, 134–145, built (§5.4)**; next: 115, 117, 118. Guided is in the level switch for everyone; Workshop stays the default (the owner, 20 November). The pillow box of Die Cut Studio's twenty styles is not planned (curved creases).

**Next:** `HANDOFF_105-118.md` has a brief for each of 105–118, checked against the code on 20 November, and corrects rows 12 and 13 of §5.2 below (card thickness for folding; plain flaps score on the edge). `next-session-prompt.md` is the prompt to start the next session from.

### 5.2 Where the plans meet, and how each meeting is settled

| # | Topic | Plans | Settled |
| --- | --- | --- | --- |
| 1 | Numbers | Guided 87–93 and Dieline 92–103 overlapped `main` and each other; the sentence asked for Guided to be renumbered | §5.1 numbers all three. |
| 2 | **Inside sizes** | Sentence S2 builds `boxSize` / `setBoxSize` "in `sizes.ts`"; Guided G4 has `insideSize` / `setInsideSize`; Dieline D5 has `boxSize` with `Design.sizeAs` | **One meaning of inside**: Dieline **D5a** (93), in `src/model/boxSize.ts` (`sizes.ts` is milestone 88's). The sentence's `sizeAs` word writes `Design.sizeAs`; Guided's functions are thin wrappers. *A divider keeps its distance from the side that did not move* goes in `setBoxSize`. |
| 3 | **What a design starts from** | Sentence structures (`src/templates/structures/`); Guided G3 `things.ts`; Dieline D6 `STYLES` and start-screen cards | **The template registry is the one list.** The sentence builds it (94–96); Guided's plain things are structures with their default words; **D6 is dropped** (its cartons are S3's words, its mailer and *start from the product* are the sentence's §8). |
| 4 | **The divider fix** | Guided G1 item 2; the sentence's S2 "if `main` does not have it" | G1 is 92, first; S2 relies on it. |
| 5 | **The welcome screen** | Sentence S5 replaces the template grid in `StartScreen`; Guided G3 replaces `StartScreen` with a gallery in Guided; Dieline D6 had a styles row | `StartScreen` (Workshop, Quick build) gets the sentence; Guided has its gallery; the gallery may later open with the sentence (sentence §8). |
| 6 | **Hidden or greyed** | The sentence hides what a material cannot make; the rest of the app greys with a reason (73, 78) | Hidden in the sentence's lists and the template card (S6) only; elsewhere unchanged. |
| 7 | **The face-on view** | Guided G5 (corners, turn knob, no double-click); Dieline D0b-1, D0c, D0b-2 | Both, gated: `transform.sides` and `edit2d` are `'hide'` in Guided. |
| 8 | ***Make it fit*** | Guided G4 `fitContent`; the sentence's later *sized by what goes inside*; Dieline D6's `fitToContents` | Guided's is built first (107), through `setBoxSize`; the sentence's word uses the same path; D6's is dropped with D6. |
| 9 | **Feature table** | Guided adds a second table; every new Dieline and sentence control has a row | Rule 4b: each row states all three levels. `quickTable.test.ts` checks both modes from 105. |
| 10 | **Ghost and ✓** | Guided does without; Dieline D2's grow in the flat uses it | *Nets* is hidden in Guided. |
| 11 | **Lid kinds** | Built (79–82) | The sentence's *a lid that lifts off* and Guided's *Lifts off* use kind *Automatic*; the card after *Start* offers the others in Workshop and Quick build. |
| 12 | **Board grades** | Dieline D5b; sentence §8 *More boards* | The sentence's `materials(m)` and `allowed` check the thickness, so grades need no change there. |
| 13 | **The fold overhaul** (`923e0c5`, `1917440`) | A crease now lies where the mid-planes meet (`src/model/crease.ts`), `foldAllowance` defaults to 0, flaps crease `scoreIn` inside their edge, lid rims are perforated by default, schema 11 | Dieline D2's ghost in the flat and D3's shaped flaps use `foldLay` / `scoreIn`; D5a's *crease to crease* is *outside − t* for a folded box; D8's `perf` layer includes the rims' automatic perforations. The sentence reads sizes from the built design, so it is unaffected. |
| 14 | **The guided-mode branch's code** | Dieline D0b-1 ports `src/sketch/*` and `canvas2d.tsx` | **No git merge of `claude/guided-mode`.** It forked at milestone 43 (`c47c273`); a merge conflicts in 14 files and would mark the waffle commits merged under PR #6. Files are brought over by path, with the branch named in the commit. |

### 5.3 Milestones 119–133: from shapes to folds and boards (plan of 20 November)

`SHAPES_TO_DIELINES_PLAN.md` (R0–R14), with the owner's answers of the same day (its §9).
- **The owner's mission:** a Tinkercad-inspired workplane where one click turns the shape into a folded or panel assembly, with every joint fitted to the material and its thickness.
- **The port:** the shape modeller of PR #6 (`claude/waffle-mode`, not live) is brought over by path (rule 14 of §5.2), shapes only. The waffle stays on PR #6 for now.
- **The engine** gains a face graph, seam folds between free boards, an unfolder, a joint chooser and a reassembler.
- **Levels:** Workshop has the workplane. Guided gets a pyramid and a diamond (rule 4b).

| # | Milestone | Plan | Status |
| --- | --- | --- | --- |
| **119** | Spike: face graph and unfolder on fixtures, timed | R0 | ✅ |
| **120** | The shape modeller on this branch (port, shapes only) | R1 | ✅ |
| **121** | The Tinkercad-style workplane: typed sizes, place on a face, flat-faced shapes, the diamond | R2 | ✅ (ΔX/ΔZ readouts left) |
| **122** | The face graph with stable keys | R3 | ✅ |
| **123** | Free boards and seam folds in the engine | R4 | ✅ |
| **124** | The unfolder | R5 | ✅ |
| **125** | Joints chosen for the material and its thickness | R6 | ✅ (sizes unverified on stock) |
| **126** | *Fold it*, in one click | R7 | ✅ |
| **127** | *Build from boards*, in one click | R8 | ✅ (*Size is: Inside* left) |
| **128** | Guided: a pyramid and a diamond | R9 | ✅ |
| **129** | Linked to the shape: update, carry-over, detach | R10 | ✅ |
| **130** | Openings, and a lid by a cut | R11 | ✅ (board lids have no lip) |
| **131** | Assembly: seam numbers, fold order, steps | R12 | ✅ (glue areas not shaded) |
| **132** | The workplane, second part: align and mirror, snap, edit group, protractor, loft, chamfer | R13 | ✅ |
| **133** | Verification of 119–132 | R14 | ✅ |

- **The one-click core is 119–127.** 120 and 123 can run side by side (`src/sculpt` against `src/model`).
- **Nothing here waits for 110–118.** 126 shows its net in the Net view (113) when that is built, and in the Cut plan otherwise. 128 adds two things to Guided's gallery (106).

### 5.4 Milestones 134–145: the QA fix round (plan of 20 November, evening)

`QA_FIX_PLAN.md` (Q0–Q11), from the three browser passes in `docs/cutforge-browser-qa-2026-11-20/REPORT.md`, with the
owner's decisions of the same day (its §4: every recommendation taken). Bugs before features (rule 1.2): **this round
comes before 115, 117 and 118.**
- **The causes:** controls that show a stored wish instead of the model; one rule kept in several copies; side effects
  nobody is told about; checks that run late; modes nobody owns; stage overlays that don't know about each other;
  curved walls bolted on (plan §1).
- **The structural answers:** outcome reports from every operation touched; one rulebook for "can this be made?";
  controls that show the model; one owner for modes; one placement service and stage layout; curved combinations
  gated with a reason until a structural plan (plan §2).
- **The safety nets:** promise checks in the fuzzer, copy checks, a capability snapshot, and one truth spec run only
  when the UI changes (light testing routine).

| # | Milestone | Plan | Status |
| --- | --- | --- | --- |
| **134** | Safety nets first: promise checks, copy checks, failing repros for every high finding | Q0 | ✅ (18 repros in `tests/qa`) |
| **135** | Joint changes made rigid | Q1 | ✅ (the cause was tray geometry; no separate `jointPlan.ts` was needed) |
| **136** | Saving and two tabs | Q2 | ✅ |
| **137** | Truthful status: empty designs, notes, names, plurals | Q3 | ✅ |
| **138** | One rulebook for lids and curves, and the gate; live check in Workshop | Q4 | ✅ |
| **139** | Placement and the stage layout | Q5 | ✅ (two interaction items left to 145) |
| **140** | Modes and the level switch; *Joints* and *Outlines* in the card | Q6 | ✅ |
| **141** | Gizmos | Q7 | ✅ (ring colours, position fields; the rest left to 145) |
| **142** | Guided specifics | Q8 | ✅ |
| **143** | Quick build and Shapes specifics | Q9 | ✅ |
| **144** | Accessibility | Q10 | ✅ |
| **145** | Verification of 134–144 | Q11 | ✅ (open items: `REPORT.md` §16) |

- **Order:** 134 first; 135 and 136 next (lying controls and lost data). 137–139 can run side by side after 134
  (model and validate, rules and lids, placement and stage). 140 and 141 share the stage overlays: one after the other.
  142–144 fit anywhere after 137.
- **Not in this round:** structural curved walls (a plan of their own), the teacher view (F) and offline (G3), which
  the browser passes could not test.

### 5.5 Milestones 146–160: the presets overhaul (plan of 21 November, with the preset engine of `DIELINE_GENERATOR_ANALYSIS.md`)

`PRESETS_OVERHAUL.md`, from a contact sheet of every preset in every material (`docs/preset-shots/before/`): 38
entries in four lists (structures, styles, missions, Guided things), about 15 of them different from each other;
pictures that leave out flaps and show every preset from one view as it is cut; and gaps for plywood and 4 mm board.
The answer is one catalogue of cards, a view-only pose per card shared by the pictures and the stage, and new cards
only once the pictures can tell them apart.

| # | Milestone | Plan | Status |
| --- | --- | --- | --- |
| **146** | One catalogue: the lists read it, each design once; the contact sheet; the look-alike tests and their allowlists | §7 | ✅ |
| **147** | Pictures draw everything: flaps, edge features, cut lines, windows; card's contrast | §7 | ✅ |
| **148** | Poses: flap hinges, edge-flap angles, the drawer assembled, cutaways, props | §7 | ✅ |
| **149** | Engine: ends per wall | §7, analysis §3.2 | ✅ |
| **150** | Engine: preset records and the recogniser | §7, analysis §4 | ✅ |
| **151** | Views and variants: per-card camera, the view from below, the variant switch; the stage's card colour | §7 | ✅ (bottom flaps hang open instead of an inset) |
| **152** | The stage: hero pose, framing, *Show how it closes* | §7 | ✅ |
| **153** | Challenges and merges | §7 | ✅ (allowlists empty) |
| **154** | Engine: corner rules (gusset, inward ear) | §7, analysis §3.3 | ✅ the gusset (the inward ear deferred) |
| **155** | New cards on the engine as it is | §7 | ✅ |
| **156** | Engine: strip and wrap builders | §7, analysis §3.1 | ✅ (and the insert) |
| **157** | New cards that need engine work (beta) | §7 | ✅ (magazine file, dice tower, mailer box) |
| **158** | Engine: custom presets | §7, analysis §4 | ✅ (record editor, Your presets) |
| **159** | Words and pictures | §7 | ✅ (after pictures in en and he, README) |
| **160** | Verification | §7 | |
