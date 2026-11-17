# CutForge: packaging styles and learning by design: implementation plan

Planning notes from 2026-11-17, made after milestone 43. This brief starts at milestone 44. Nothing here is built or committed yet.

It is written from two seats at once:

- **The packaging designer** needs to get from a product to a correct, economical dieline quickly, across many box styles, and must not hit a ceiling.
- **The pedagogy scholar** (and the teacher and student they stand for) needs a tool where the thinking stays with the learner, the help fades as skill grows, and the teacher can see and respond to the process.

Quick build and Workshop already aim at these two seats. The plan keeps both and changes how they connect.

## 1. How this was assessed

- The live site (`cutforge.co-roee.workers.dev`) is blocked by this session's network policy, so the walk-through used a local dev build of `main` at `c47c273`. If the deployment is behind or ahead of that commit, some findings may not match it.
- Driven with a real browser at 1400 × 850 and 1024 × 700, in English and Hebrew: the start screen, a blank Quick build design in card (Box, Wall / lid, a second Wall on the lid, cut plan, download dialog, *Ready to cut* badge), the *Pencil box* mission, the submit dialog, and a tall carton built in Workshop through the app's own `ops`.
- The teacher view was **read in code only** (`src/teacher/TeacherApp.tsx`, `worker/schema.ts`), not run. Touch input was not tried.

## 2. What the walk-through found

### As a packaging designer

| # | Finding | Evidence |
| --- | --- | --- |
| D1 | **A carton cannot be closed.** A tuck flap grown from the lid's front edge is refused downwards and collides upwards. There are no dust flaps or lock tabs. | `growPanel(lid, 'e2', {dir:'down'})` returns null; `dir:'up'` gives *Panels 2 and 7 run into each other* in the export check. In Quick build all four *Grow from…* buttons on a lid are greyed with no reason shown. |
| D2 | **Only two starting points, neither is packaging.** Templates are *Organiser with dividers* and *Card / tile stand*. No tuck-end carton, mailer, sleeve, lift-off lid box, display tray. | `src/templates/registry.ts`: `TEMPLATES = [organiser, stand]`. |
| D3 | **Every box unfolds as a cross.** A 60 × 40 × 90 carton lays out as a tray net with four corner flaps, not a tube with one glue seam, so it wastes board and is not how a carton is made. | Cut plan of the tall carton. |
| D4 | **Sizing starts from the box, not the product.** *What goes inside* reports *13.5 mm deeper* but cannot resize the box. A blank Quick build box has no inside / outside switch (the organiser template has one). | Base card in the mission; `TemplateUI` only. |
| D5 | **Quick build's ceiling is all-or-nothing.** *More…* opens the whole Workshop card and closes again when the selection changes. A designer who wants only angles, or only per-joint control, has to live in Workshop. | `ModeOverride` in `src/easy/features.ts`; one global `mode`. |
| D6 | **Parts are not named for what they are.** The lid is *Panel 6*; the base's depth is labelled *Height* (the template calls it *Depth*, the object hint says *deeper*). | Panel cards; `insp.height`. |
| D7 | **The dieline is not annotated.** No legend on the cut plan, glue flaps are unlabelled, no overall dimensions, no flute or grain direction, no 1:1 print for a paper mock-up. | Cut plan and download dialog. |
| D8 | ***Ready to cut* is not *works as a box*.** The badge is green for a box whose lid has nothing holding it shut. | Badge on the lidded box. |
| D9 | **No way to compare alternatives.** One design per browser slot, no variants side by side, no board-use comparison. | `current-design` in IndexedDB. |

### As a pedagogy scholar

| # | Finding | Evidence |
| --- | --- | --- |
| P1 | **Missions arrive mostly solved.** *Pencil box* opens with 3 of 5 goals ticked and one star. The remaining structural goal is met by typing one number into a template field. | Mission panel on open; `missions.ts` uses the organiser template with `dividersY: 2`. |
| P2 | **A mission is a checklist, not a brief.** No user, no need, no constraints to trade off, no reason for a goal. Stars reward ticking. | `Mission = { title, description, goals }`. |
| P3 | **Help does not fade.** Two fixed levels (Quick build, Workshop), chosen per class and optionally locked. Nothing between them and nothing that opens up as a student shows skill. | `classes.mode`, `mode_locked`. |
| P4 | **Mistakes are prevented, so they cannot teach.** Guardrails stop the shape and show a short note (*Kept 3 mm from the edge*). There is no setting for a class that is ready to see and fix a problem itself. | `src/easy/guard.ts`; decision *Prevent, don't report*. |
| P5 | **The engineering is hidden rather than explained.** *How it's built* labels joints but does not say why that joint, what the material allows, or what would happen otherwise. Jargon leaks into Quick build: *Corners can't be creased… a crease would close a loop*, *Kerf compensation: Nominal / Compensated*. | Base card on a card tray; download dialog in Quick build. |
| P6 | **No reflection and no process record.** Submit sends class code, name and title. The teacher sees the final file and goals met, not how the student got there or what they think of it. | `SubmitDialog.tsx`; `submissions` columns. |
| P7 | **Feedback is one-way.** The teacher can mark *cut* but cannot send a comment back. | `status: 'new' \| 'cut'`. |
| P8 | **Teachers cannot write a mission.** They pick from four built-in ones. | `classes.missions` is a list of built-in ids. |
| P9 | **The first minute is unguided.** The tour is switched off (`TOUR_OFFERED = false`), a new browser opens in Workshop, missions sit below the fold on the start screen, and the rail is icons only. | Start screen at 850 px height; `DECISIONS.md` line 222. |
| P10 | **Small frictions.** The same hint shows twice while a tool is active (card and bottom pill). The design name is cut to *Untitled desi*. At 1024 px the mode switch moves into the *…* menu and the mission panel covers the hint. | Screenshots at both widths. |

## 3. Principles

1. **One ladder, not two rooms.** Replace the binary mode with levels over the same feature table. Quick build and Workshop become the bottom and top rungs; a class, a mission or a person can sit anywhere between.
2. **Styles are the fast path for both seats.** A parametric packaging style is the designer's quick start and the student's worked example. One registry serves both.
3. **Start from what goes inside.** The product drives the size; the box follows.
4. **A brief before a checklist.** Goals come from a stated need and include at least one trade-off. Nothing is ticked on arrival that the student did not do.
5. **Explain, then fade.** Each automatic choice can say why. Guardrails have three settings: prevent, warn, off.
6. **The process is part of the work.** Snapshots, a short reflection, and a reply from the teacher.
7. **Same engine, same files.** As in `EASY_MODE.md`: modes and levels are viewer preferences. Golden exports stay byte-identical for designs that use none of the new features.

## 4. Milestones

### Milestone 44: first-minute fixes (small, no model changes)

- **Start screen** (`src/ui/StartScreen.tsx`): a first question, *How do you want to work?* with two cards, *Guided* and *Full workshop*, each with one line and a picture. It sets the starting level (milestone 45). Missions move up beside templates under one heading, *Start from*, with tabs *Styles · Briefs · Blank*.
- **Rail labels** (`src/easy/QuickRail.tsx`, `src/ui/Toolbar.tsx`, `src/styles.css`): icon and word at widths of 1200 px and up, icon only below.
- **One hint, not two:** while an action card is open, the bottom pill shows only the next step (*Click a free edge*), and the card keeps the full text.
- **Say why a button is greyed:** each disabled *Grow from…* button gets a line under the group (*This edge already meets the front wall*). `edgeHasRoom` in `src/model/adapt.ts` already knows; add a reason code.
- **Names:** a panel grown across the top of a box is named *Lid* (`quick.lid` exists); a base's second size is *Depth* everywhere (`insp.height` on a floor panel).
- **Top bar:** the design name ellipsis starts later (it has room at 1400 px); the mode / level control stays visible down to 1024 px and the sheet meter collapses first (`src/ui/TopBar.tsx`).
- **Download dialog in guided levels:** format only; the kerf choice sits under *More…* with the class profile's value shown (`src/ui/ExportDialog.tsx`, feature `export.kerf`).
- **Plain words in guided levels:** `tray.creaseLoop` and similar get a short version (*One corner is glued instead of folded*) with *Why?* opening the long one.
- **Tests:** e2e for the start screen choice, the disabled-edge reason, labels at 1400 and 1024 px in both languages.

### Milestone 45: levels instead of a binary mode

- **Model of a level** (`src/easy/features.ts`): `FEATURES` gains a `group` per feature (`angles`, `joints`, `outline`, `folds`, `materials`, `ops`, `snapping`, `through`). `ViewPrefs.unlocked: FeatureGroup[]` sits beside `mode`. `useFeature(f)` returns `'show'` when the mode is Workshop **or** the feature's group is unlocked.
- **Three named presets:** *Guided* (today's Quick build), *Open* (Quick build's five actions plus angles, outline curves, per-joint choice and part-of-edge growing), *Workshop* (everything). The top bar switch becomes these three.
- **Personal toolkit** (the designer's side): a *Tools* popover on the rail lists the groups with switches. *More…* on a card gains *Keep this open*, which unlocks that card's group instead of resetting on the next selection.
- **Parts made above the current level** stay read-only with a reason, as now; the button becomes *Unlock angles* (unlocks the group) instead of only *Open in Workshop*. `workshopOnly()` in `src/easy/mode.ts` maps each reason to a group.
- **Class control** (`worker/schema.ts`, `drizzle/0002_levels.sql`, `TeacherApp.tsx`): `classes.unlocked` (JSON list of groups, null = by preset). The teacher sets the starting preset and may add or lock groups. `GET /api/classes/:code` returns it; `applyClassMode` applies it.
- **Fading** (optional per class): a group unlocks for a student when a brief that teaches it is completed (milestone 49 records this in `ViewPrefs.earned`). The teacher can turn this off.
- **Migration:** `mode: 'quick'` reads as *Guided*, `'workshop'` as *Workshop*; `mode_locked` keeps its meaning.
- **Tests:** unit: every feature has a group; unlocking a group never changes the design (deep-equal); the old two modes behave exactly as before. e2e: unlock *angles* in Guided, the grow card shows the dial and nothing else changes.

### Milestone 46: closures (the engine piece the styles need)

A closure is a flap on a panel's free edge that tucks beside, or locks into, another panel. It is modelled like a fold-over (`src/model/foldover.ts`): an edge feature of its panel, not a grown panel, so it does not take part in the collision and seam rules that refuse it today.

- **Model** (`src/model/types.ts`): `Panel.flaps?: Flap[]`, `Flap = { edge, kind: 'tuck' | 'dust' | 'lock' | 'glue', depth, taper, span? }`. Card and corrugated only.
- **Geometry** (`src/model/closure.ts`, new): outline per kind (tuck: rounded corners and a friction nick; dust: tapered both sides; lock: a tab plus a matching slit in the facing wall; glue: today's glue flap, now also placeable by hand). Clearance from the material. A tuck flap sits inside the facing wall by `thickness + clearance`.
- **Unfolding and pieces** (`src/model/flatnet.ts`, `pieces.ts`): flaps join the net like fold-over liners; the fold slider folds them.
- **Checks** (`src/model/validate.ts`): a lid with no closure and no lift-off rim gives a note, *This lid has nothing holding it shut* (a note in Guided, with a one-click *Add a tuck flap*). This is finding D8.
- **Interface:** in the Wall / lid action, a lid's ghost offers *Closure: None · Tuck · Lock* on the stage. In Open and Workshop levels, any free edge's card has *Add a flap*.
- **Tests:** unit: each kind's outline is simple, stays inside the sheet, and its net does not overlap for a range of sizes; a tuck flap on a 60 × 40 × 90 carton passes `validate`. Golden files for one carton per closure kind. Fuzz: extend `tests/fuzz/quick.test.ts` with flaps.

### Milestone 47: tube nets

- **A second unfolding strategy** (`src/model/flatnet.ts`): *tray* (today: walls fold from the base) or *tube* (the four walls in a row with one glue seam, top and bottom panels and flaps hanging off them). Chosen automatically by board use when height is greater than the shorter footprint side, and shown on the tray card as *Layout: Tray · Tube* in Open and Workshop.
- **Sheet meter** shows both figures when the other layout would save more than 10% (*Tube layout would use 31% instead of 44%*), with a button.
- **Tests:** unit: both layouts fold to the same 3D box (same panel frames); neither overlaps; golden files for a tube carton in card and corrugated.

### Milestone 48: a library of packaging styles

Templates become *styles*, in the same registry (`src/templates/`), each a `TemplateDef` with a few named parameters and inside / outside sizing.

| Style | Materials | Needs |
| --- | --- | --- |
| Tuck-end carton (straight and reverse tuck) | card | 46, 47 |
| Tray and sleeve | card, corrugated | 47 |
| Lift-off lid box (base and lid) | all | none (the organiser's lid logic) |
| Mailer with a hinged tuck-front lid | corrugated | 46 |
| Display tray with a low front | card, corrugated | wall outlines (exists) |
| Hexagon gift box | card, plywood | polygon trays (exist), 46 for card |
| Hang-tab carton | card | 46, a hang-hole shape |
| Organiser with dividers, Card / tile stand | as now | none |

- **Start screen:** *Styles* shows them as cards with a filter by material and a search field; each card says what it is for in one line.
- **Insert into a design:** in Open and Workshop, *Add a style* places a second style in the current design (a tray inside a sleeve), using `generate` into a sub-design merged with fresh ids.
- **Detaching:** editing a style's panels by hand keeps what `regenerate` already keeps, and lists what it cannot.
- **Features as presets** (`src/easy/stickers.ts` pattern): thumb notch, window, hang hole, handle slot, as one-click shapes that place themselves on the selected wall.
- **Tests:** per style: generates in each allowed material, passes `validate`, one sheet at default size, golden export; regenerate keeps a user shape.

### Milestone 49: start from the product

- **Fit the box to its contents** (`src/easy/objects.ts`, `InsideUI.tsx`): where the card says *Needs more room: 13.5 mm deeper*, add *Make it fit*, which resizes the compartment (moving a divider or the base) with the material's clearance plus a chosen allowance (*snug · easy · padded*). One undo step.
- **Start from a product:** on the start screen, *What goes inside?* (pick objects or type W × D × H and a count), then a style; the style's parameters are solved from the contents.
- **Inside / outside switch** on every box's card, not only the organiser's (`setPanelSize` with the wall thickness).
- **Custom objects** keep a name, and a class can ship its own list (the product the class is packaging).
- **Tests:** unit: after *Make it fit*, `contentFit` is true and no other compartment shrinks below its own contents; solving a style from contents gives inside sizes ≥ contents + allowance.

### Milestone 50: briefs instead of checklists

- **Mission becomes Brief** (`src/easy/missions.ts`): add `context` (who it is for and why), `constraints` (sheet count, board area, material), `criteria` (today's goals, each with a `why` line), and `stretch` goals. `template` becomes optional starting **parts**, not a solved box.
- **Nothing pre-ticked:** a brief's starter must meet none of its structural criteria (a unit test enforces it). *Ready to cut* and *Fits on one sheet* are shown as constraints that stay true, not as goals achieved.
- **Three ways in**, chosen by the teacher or the student: *Worked example* (the finished style, to take apart and change), *Half built* (the box without dividers or lid), *Blank*. Stars are replaced by the criteria met and the stretch goals reached.
- **Hint ladder** per criterion: (1) a question (*How long is a pencil?*), (2) where to look (the compartment lights up), (3) the step (*Drag this divider*). The number of hints used is kept with the design.
- **Predict, then check:** before the first cut-plan view, one prompt: *How many sheets will this need?* The answer is compared with the meter.
- **At least one trade-off per brief:** for example, *holds 12 pencils* against *uses less than half a sheet*.
- **Briefs that teach a group** (for milestone 45's fading): *Leaning stand* earns `angles`, *Folded tray with a liner* earns `folds`.
- **Tests:** unit: every brief's starter meets no structural criterion and its reference solution meets all; hints exist in both languages for every criterion.

### Milestone 51: guardrails that can teach

- **Three settings** (`src/easy/guard.ts`, feature `guard`): *Prevent* (today), *Warn* (the shape goes where it is dragged, turns amber, and the badge explains what would happen on the laser, with *Fix* and *Show me why*), *Off* (Workshop's export check). A class chooses; Guided defaults to Prevent, Open to Warn.
- **Why cards** (`src/easy/why.ts`, new): one short explanation with a small picture for each automatic choice and each issue kind (finger joint, tab and slot, glue flap, minimum web, kerf, clearance, grain). Opened from *How it's built* labels, from a clamp note and from the badge.
- **Glossary:** the same cards, searchable from the *?* in the top bar.
- **Tests:** unit: every `val.*` key and every joint kind has a why card in both languages (the i18n coverage test extended); the fuzz invariant (no blocking issue) still holds under *Prevent*.

### Milestone 52: process, reflection and feedback

- **Design journal** (`Design.journal?`, ignored by pieces, packing and export): a snapshot (thumbnail, piece count, board use, criteria met) at each ✓ of a structural action, capped at 30. A strip under the stage scrubs through them.
- **Variants** (finding D9): *Keep as a variant* stores the current design beside the working one (IndexedDB, `cutforge/kv/variants/<designId>`), with a compare view of two variants: 3D side by side, pieces, sheets, board use.
- **Reflection on submit** (`SubmitDialog.tsx`): two short prompts, set by the teacher or the brief (*What would you change after cutting it?*). Stored with the submission.
- **Teacher view** (`TeacherApp.tsx`, `worker/index.ts`, `drizzle/0003_feedback.sql`): the journal strip, hints used, the reflection; a comment box and a *Needs another look* status. New columns: `reflection`, `hints_used`, `feedback`, `feedback_at`; `status` gains `'returned'`.
- **The reply reaches the student:** on opening the app, the last submission's feedback is fetched by device id and class code and shown once on the design it belongs to.
- **Privacy:** the journal and reflection are sent only on submit; the *Data stored* section of the README is updated; limits on size (journal ≤ 300 KB) are enforced by the Worker.
- **Tests:** worker: feedback round trip, size limits, a returned submission can be replaced. e2e: submit with a reflection, teacher comments, student sees it.

### Milestone 53: teacher-written briefs

- **A brief as data** (`src/easy/briefSchema.ts`): the criteria the built-in goals already use (objects fit, compartment count, has lid, has closure, board use ≤ n%, sheets ≤ n, text or sticker present), composed in a form, with a starter chosen from the styles or from one of the teacher's own project files.
- **Storage:** `briefs` table (class id, JSON, starter project key in R2); `GET /api/classes/:code` lists them; they appear on the student's start screen first.
- **Teacher view:** *New brief* form with a live preview of the student's start screen card; the class's own object list (milestone 49).
- **Tests:** worker: a brief with an unknown criterion kind is refused; e2e: a teacher writes a brief, a student starts and completes it.

### Milestone 54: dieline output

- **Cut plan legend** (finding D7): cut, score, engrave, glue area, always visible in the corner (`src/views/Plan2D.tsx`).
- **Annotations layer:** overall sizes of each piece, glue areas hatched and labelled, flute or grain arrow, part names. On the green GUIDE layer in SVG and DXF, so LightBurn output stays off by default.
- **Print 1:1:** a PDF (or tiled A4 / A3 print view) of the net with fold lines dashed, for a paper mock-up before using board.
- **Artwork guide:** export each face's outline as an SVG template for graphics, and import an image onto a face as a preview-only texture in 3D (never cut).
- **Tests:** golden files gain an annotated variant; existing goldens unchanged (annotations are opt-in in the download dialog).

### Milestone 55: verification

- `npm test`, the app e2e specs, goldens (byte-identical where no new feature is used), fuzz.
- **Designer run:** from a product size to a downloaded tuck-end carton, a mailer and a tray with sleeve, each under 5 minutes in the Open level, with the tube layout chosen where it saves board.
- **Classroom run:** a new browser, a class link, one brief from *Half built* to submitted with a reflection in under 25 minutes, in English and Hebrew; the teacher returns a comment and the student sees it.
- EN/HE screenshots into `docs/styles-shots/` and `docs/brief-shots/`; README, `PROGRESS.md`, `DECISIONS.md` (levels replace the binary mode; closures are edge features; briefs; guardrail settings).

## 5. Order and size

Suggested order: **44 → 45 → 46 → 48 (the styles that need no tube) → 50 → 49 → 47 → rest of 48 → 51 → 52 → 53 → 54 → 55.**

- **44** is two or three days and is worth shipping alone.
- **45** is about a week; it is what both seats lean on.
- **46** is one to two weeks and carries the most engine risk (net overlap and clearance for flaps). **47** is about a week and should come after 46 has settled.
- **48** is about three days per style once 46 exists.
- **49–51** are about a week each. **52–53** are one to two weeks each, mostly the Worker and teacher view. **54** is about a week.

These are rough sizes from reading the code, not measured.

## 6. Decisions to make before building

1. **Levels replace the two-mode switch** (milestone 45). This revises the decision *A mode is a viewer preference* into *a level is a viewer preference*. The alternative is to keep two modes and only add *Keep this open* to *More…*, which is cheaper but leaves finding P3 open.
2. **Which mode a new browser starts in.** `DECISIONS.md` currently says Workshop. Milestone 44 asks instead of deciding. If asking is unwanted, Guided is the better default for a class tool.
3. **Guardrail default for Open level:** Warn (proposed) or Prevent.
4. **Stars:** removed in favour of criteria and stretch goals (proposed), or kept beside them.
5. **Student feedback without accounts:** the reply is matched by device id and class code (proposed). A student who changes computer does not see it. The alternative is a short personal code shown at submit.
6. **Style list for the first release:** the table in milestone 48 is a proposal; say which four matter most.
7. **Hebrew names** for *Guided*, *Open*, *Brief*, *Tuck flap*, *Dust flap*, to choose with the teacher.
