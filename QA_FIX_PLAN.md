# QA fix round: plan (after milestone 133, branch `claude/modest-ride-j5iqa3` at `0f285cd`)

Written 2026-11-20 from the three browser passes in
[`docs/cutforge-browser-qa-2026-11-20/REPORT.md`](docs/cutforge-browser-qa-2026-11-20/REPORT.md). That report holds
about 90 findings. This file:
- groups them by what causes them (§1);
- proposes the structural changes that would fix whole groups and stop the next similar bug (§2);
- orders the fixes into milestones (§3);
- records the owner's decisions (§4).

**Status:** decisions settled (§4). **134 (Q0) and 135 (Q1) built** (see `PROGRESS.md`): the to-do list is `tests/qa/` (the `it.fails` repros left), the fuzzer's promise checks and the copy ratchet. The milestones are numbered 134–145 in ROADMAP §5.4. Line
numbers are for `0f285cd` and will drift; search for the function names.

Report references: **#n** = top finding n (§1 of the report), **C n** = curved finding (§7), **J-x** = joint row (§10),
and section numbers for the rest.

---

## 1. Connecting the dots: seven causes behind the findings

### P1. The screen shows a stored wish, not what the model is

Many controls read a field that records what was *asked for* instead of working out what the design *is*. When the
two drift apart, the screen lies, and picking the shown value does nothing.

| Seen as | Field read instead of the model |
|---|---|
| Joint dropdowns show a kind the joints don't have; "0 joints changed" (J-a, J-b, J-e, J-f) | `groupShown` → stored `d.joints` (`jointDefaults.ts:150`); `tray.wallKind / cornerKind` (`TrayUI.tsx:101`) |
| *Saving…* for ever while autosave has stopped (§11, A10) | `saveState` set to `saving` before the save; the "other tab" branch returns without changing it (`store/hooks.ts:53`) |
| *Ready to cut ✓* on an empty design (#1, §11) | `validate` has no "nothing to cut" issue; Send treats "no blockers" as ready |
| Corner radius field 15 mm, corners built at 21.5 mm (C8); card 150 mm vs cut plan 147 mm (C2) | the asked value, not the built one |
| Old notes on a new design ("22 joints changed", "The material changed…") (§11) | notes kept in component state, not tied to the design |
| Gallery chip says card on a plywood design (B1, §11); lid buttons don't say which is on (§11 a11y) | chip from the last gallery visit; no `aria-pressed` |

### P2. One rule, several copies

The same question is answered in two to four places, and the answers differ.

| Question | Copies | Seen as |
|---|---|---|
| How tight can this material bend? | `roundedMin` in `Inspector.tsx:471` (21.5 mm) and `bendOf` in `validate.ts:159` (18.8 mm) | Card warns, download check disagrees, *Fix* leaves the warning (§11) |
| Which joint kinds may this joint take? | `allowedKinds`, `pairKinds`, `kindsFor` (`Connections.tsx:25`), the tray's own list | One place offers a kind another silently ignores (§10.1 #8) |
| Can this box have this lid? | per-control checks | *Hinged* greyed on round boxes, allowed on rounded ones and broken there (C1); *Arched* refused with no size (I9) |
| Where does a new thing go? | `freeSpot` (shape tiles only), `freeLidSpot`, Guided "middle of the side" (`guided/decorate.ts`), sketch finish at the origin | Sketch inside a shape (#2); sticker and window on top of the name (§11); lid under the card (§8) |
| What is this part called? | template numbers (*1…6*, two parts named *6*), Quick build *Panel 3*, Workshop *Front wall*, shapes *Panel 1…17* | §11, E10 |
| How do we ask "are you sure?" | app dialogs, and native `confirm()` in 5 places (sketch cancel, Detach, tour, teacher ×2) | §8, §11 |
| How do we say a count? | every string by hand; no plural support in `src/i18n` | *1 pieces*, *1 faces*, *sheet(s)* (H11) |

### P3. Changes with side effects nobody is told about

An action changes, removes or clamps something beyond what was asked, and either says nothing or says something
generic.

- `setAllJoints` counts before `solve`, and then `fixKind` / `autoConnect` override part of it (§10.1 #4–5).
- Template *Lid → hinged* removes every divider, with only a vague reason (J-j). Pyramid *Sides 8 → 5* drops the
  name that was on face 8 with no note (§11).
- A material change re-chooses joints and wipes hand-set ones (§10.1 #7). *Build from boards* switches the material
  with no note (E10).
- *Use less board* puts glue flaps back under *No glue* (§11). *Hinged → None* leaves the back wall broken (C2). A lid
  change moves the inside height 34 → 37 mm (C7).
- Typed sizes are clamped (5 → 10 mm) with no note (§11). The level switch renames the design (§11).
- Guided already has a guard that knows **why** it refused (`newProblems` in `guided/apply.ts`), but it throws the
  reason away and shows "That would make it impossible to cut".

### P4. Checks run late, or not at all

- Workshop has no live check: a rounded box built with a bend that is too tight shows nothing until *Download* (§11).
- `validate` has no check for:
  - an empty design (#1);
  - a cut-out over an engraving (§11);
  - a lid that leaves part of the opening uncovered (C1);
  - parts that cross each other in 3D: the hinged lid in the side wall (C5), the diamond's boards (E20).

  So *Ready to cut* is green over all of them.

### P5. Modes nobody owns

Level, stage, view, overlays (*Joints*, *Outlines*, fold slider, *Follow*, *Frame*) and the camera are separate store
fields, each reset (or not) by hand.

- The level switch lives in four places and is missing on the Shapes stage (#3, H1).
- *Outlines* and *Joints* survive a new design (#7, H3), and so does the camera, once below the floor (H7).
- Outline editing has two exits (§8). The fold slider is a hidden edit lock (§8).
- Guided opens on an empty design (#1).

### P6. Things on the stage don't know about each other

Every overlay places itself alone: gizmos, size labels, joint chips, warning chips, ✓ chips, the right-hand card.

- Labels sit on labels, and the ring sits on the arrows (#6, J chips, §8).
- The divider grip sits on the width arrow (§11). *Fit view* ignores the card (§8).
- New parts and the folded preview land under the card (E2, §8).

### P7. Curved walls are still bolted on

C1–C12, I9 and the radius rules all come from curved walls being drawn as walls that happen to bend, not as parts with
their own joints. The owner already parked this (2026-11-11): the next step is **structural joints**, not more hinge
tools. Most curved options can be reached today and then don't make a valid box.

### P8. The tests check structure, not promises

`tests/fuzz/fuzz.ts` already runs about 50 model operations at random, including `setAllJoints`, `setTrayKinds` and
`setMaterial`, and checks after each one that:
- numbers are finite and references hold;
- every board is in one net;
- the design survives a round trip.

`tests/fuzz/overlap.test.ts` checks that solids don't overlap, for some cases.

None of them checks what the user was **promised**:
- the joint asked for is the joint made;
- whatever was removed or clamped was reported;
- the card agrees with the cut plan;
- an empty design isn't ready.

The browser passes found these bugs by reading the model through the dev hook `window.__cutforge` and comparing it with
the screen. That comparison can be automated.

---

## 2. Structural changes: what would stop the next similar bug

Two kinds: changes to the product and its code (S), and changes to how we work and test (O). Each says which causes it
removes, what it costs, and the recommendation. The owner took every recommendation (§4), and the milestones in §3
build on them.

### Product and code

**S1. Every action reports its outcome.**
- Model operations return `Outcome = { changed, kept: [ref, reason], removed: [ref, reason], adjusted: [field, asked, got, reason] }`.
- The store shows one note from it, in one notice component. That component replaces `g.refused`, `settings.kept`, the
  joints result note, `quick.boxReach` and the other one-off notes.
- Rule: an operation that removes or adjusts anything the user made must list it. Undo brings it back.
- *Removes:* P3, and the dishonest counts in P1.
- *Cost:* medium–high if done everywhere at once. Low if each operation adopts it when touched, starting with those in
  the findings: joints, template rebuild, material, Guided sizes and sides, *Use less board*, *Make*.
- **Recommend:** yes, adopted per operation. New operations must use it.

**S2. One rulebook for "can this be made?"**
- A `src/model/rules/` module answers each question once, as `{ ok, reason, fix? }`. Examples: `minBendRadius(material,
  height, pattern)`, `jointKinds(d, connection)`, `lidKinds(d, box)`, `canRoundCorner(d, point)`, `spacesAllowed(d, box)`.
- Every control greys or hides from it. `validate` checks with it. Quick build and Guided offer from it.
- The owner's rule stays: the sentence builder **hides** what a material can't make; elsewhere options are **greyed with
  the reason**. The rulebook supplies both.
- *Removes:* P2's rule copies and part of P4.
- *Cost:* medium.
- **Recommend:** yes, starting with the three rules that disagree today: bend radius, joint kinds, lids on curved boxes.

**S3. Controls show the model.**
- Derived readers that every control uses for its value, for example:
  - `jointState(d, scope)` → a kind, or *Mixed (3 Tabs, 1 Fingers)*;
  - `builtSize(d, part)`, shared by the card and the cut plan;
  - `saveStatus` with a *paused* state.
- No control's `value` comes from a preference field.
- *Removes:* P1.
- *Cost:* low–medium, control by control.
- **Recommend:** yes.

**S4. One owner for modes.**
- One `editorMode` record holds the level, the stage, the overlay (joints, outline, fold preview) and the camera, with
  explicit enter and exit.
- `newDesign()` and `openDesign()` reset everything that belongs to a design: camera, overlays, notes, selection.
- One level-switch component, in one place, in every level and on the Shapes stage.
- *Removes:* P5. It also carries the owner's own asks: the level switch in one place (report §2.1), and *Joints* and
  *Outlines* as one row at the bottom of the card (§2.3).
- *Cost:* medium.
- **Recommend:** yes.

**S5. One placement service and one stage layout.**
- `findFreeSpot(scene, footprint, near, avoid)` serves sketch finish, shape tiles, lids, new boards and dividers.
  `findFreeSpotOnFace(panel, size, avoid)` serves Guided decorations and Workshop details, keeping clear of edges, teeth
  and other details.
- A shared **visible stage rectangle** (the window minus the card, rail and bars) is used by *Fit view*, *Follow*,
  placement and the first camera of a design.
- One label-layout pass moves stage chips off each other and off the gizmo.
- *Removes:* P6, and the placement copies in P2.
- *Cost:* medium.
- **Recommend:** yes.

**S6. Curved walls: gate now, make structural later.**
- In this round, only fix the curved findings that lose or break data (C2, C7). Use the rulebook (S2) to **grey, with
  the reason**, every curved combination that can't be made correctly yet: *Hinged* on rounded boxes, *Arched* where it
  fails, rounding a joined corner (offer *Round the corners* as a rebuild instead).
- Then plan a separate milestone for structural curved walls, as the owner asked on 2026-11-11.
- *Removes:* the C findings, honestly, without a half-fix.
- *Cost:* low now; the structural rebuild is a plan of its own.
- **Recommend:** gate now.

### How we work and test

**O1. Promise checks in the fuzzer.** Add to `check()` in `tests/fuzz/fuzz.ts`:
1. After any joint operation, every joint in scope has the kind, or is in the outcome's `kept` with a reason.
2. No joint has a kind outside `jointKinds`.
3. Boards removed between two steps appear in that step's `removed`.
4. Each card size equals its piece size.
5. An empty design is never ready.
6. Overlap (`overlap.test.ts`) also runs on the fuzzed designs that have lids and curved walls.

It runs in `npm test` with today's small default counts, so it fits the light testing routine. *Recommend:* yes; it
is the cheapest way to catch the bugs this round didn't see.

**O2. One "truth" browser spec.** `tests/e2e/truth.spec.ts` turns the third pass's probes into a spec:
- read each control's shown value and compare it with the model through `window.__cutforge` (joints, sizes, save state,
  ready);
- check the bounding boxes of the stage labels, chips and card for overlap at 1366 and 1024.

Run it only when a change touches the UI, as the routine already says. *Recommend:* yes.

**O3. Copy checks in `tests/i18n.test.ts`.**
- A plural helper on `Intl.PluralRules`, with English and Hebrew forms.
- The test fails on `(s)`, on a `{n}` string without plural forms, and on raw edge words (*bottom edge*) in 3D cards.
- A source check fails on `confirm(` and `alert(`. There is no ESLint here, so a grep test is enough.

*Recommend:* yes; it is small.

**O4. Accessibility in the same spec.**
- Every `select` and range has a label, every icon button a name, and every toggle `aria-pressed`.
- `@axe-core/playwright` on the welcome screen and one editor screen.

*Recommend:* yes, as part of O2.

**O5. A capability snapshot.**
- A test prints the rulebook's answers for material × footprint × lid × spaces × hinge as a table and compares it with
  a stored copy, like the golden exports.
- A combination changes only on purpose, and the diff shows exactly which. This would have caught *Hinged* being
  allowed on rounded boxes but not round ones.

*Recommend:* yes, once S2 exists.

**O6. Definition of done.** Every milestone in this round adds three lines to the usual list:
1. Which reader its controls show (S3).
2. Which outcome its operations report (S1).
3. That the UI sweep (`BROWSER_TEST_PLAN.md`) was run on the screens it touched, and the matching rows of sections H,
   I and J.

---

## 3. The milestones

Bugs come before features (ROADMAP rule 1.2), so this round goes **before** 115, 117 and 118, as milestones
**134–145** (Q0 = 134 … Q11 = 145, ROADMAP §5.4). Each ends as usual (typecheck, unit suite, golden exports, the one
browser spec, English and Hebrew strings, `PROGRESS.md`), plus O6.

| # | Milestone | Findings | Built on |
|---|---|---|---|
| **Q0** | **Safety nets first.** Promise checks in the fuzzer (O1), copy checks (O3), a failing repro test for each high finding. The failing tests are the to-do list, as in `BUGFIX_PLAN.md`. | all High | O1, O3 |
| **Q1** | **Joint changes made rigid.** `src/model/jointPlan.ts`: `planJointChange` and `applyJointChange`. Every joint control goes through it: design card, tray card, part card, 3D label popover, Guided, *No glue*, material change. Groups by role (wall, corner, divider, lid hinge); a *Mixed* value; one allowed rule; counts read after `solve`; kept joints listed by name and reason; a forced kind (walls on the base's face → half-lap corners) shown greyed with its reason, never stored to apply later; hand-set joints kept through material changes and *Make again*. | J-a…J-i, §10.1 | S1, S2, S3 |
| **Q2** | **Saving and two tabs.** Opening a design must not count as a change (no save on load, or compare content). The label says *Not saved: changed in another tab* while paused. The choice stays offered until made. Optional: open a second tab read-only with *Edit here instead* (Web Locks), if the owner prefers. | A10 | S3 |
| **Q3** | **Truthful status everywhere.** `val.empty`. Guided opens the gallery on an empty design; *Decorate* and *Send* wait for a thing. *Download* greyed with a reason. Notes cleared with the design. One naming function for parts (no duplicates, no numbers). The level switch keeps the name. Plural helper used everywhere. | #1, H2, H11, §11 | S1, S3, O3 |
| **Q4** | **One rulebook for lids and curves, and the gate.** One `minBendRadius`; the rounded tool defaults to it. Workshop shows tight bends on the stage, not only at *Download*. *Hinged* / *Arched* availability with reasons that name the change needed. *Round the corners* as a rebuild action. *Hinged → None* restores the walls exactly; lid changes keep the inside height. Template *Lid → hinged* names why the spaces go (not "would not cut cleanly"). A board-joint angle check for *Build from boards* (diamond). | C1–C12, I1, I9, J-j, E20 | S2, S6, O5 |
| **Q5** | **Placement and the stage.** Sketch lands beside the shapes. Guided and Workshop details find a free spot on the face. A cut-out over an engraving is flagged. Lids stay clear of the card. *Fit view* uses the visible rectangle. The label-layout pass moves the divider grip off the width arrow. Wall / lid picks the nearest edge, not the one behind. | #2, B6, §8, §11 | S5 |
| **Q6** | **Modes and the level switch.** One `editorMode`. The level switch in one place, Shapes stage included. A new design resets camera, overlays and notes. *Joints* and *Outlines* as one row at the bottom of the card with full-size buttons and one *Done*. The new outline icon (open polyline, larger dots). The fold slider shows that it locks editing. | #3, #7, §2.1–2.4, H1, H3, H7 | S4 |
| **Q7** | **Gizmos.** Rings coloured by axis, the edge-on ring faded. A size clamped between a minimum and a maximum. Live readout. *X / Y / Lift / Turn* fields in the shape card. A visible 15° snap. On boards, the ring apart from the arrows. | #4–#6, §2.5 | S5 (layout) |
| **Q8** | **Guided specifics.** Guided's guard shows the real reason. *Copy* works. A change of *Sides* moves decorations to the nearest face or names what was dropped. Pyramid and diamond nets labelled *Base / Side n*. The gallery chip follows the design. Clamped sizes say why. | §11 B3–B9 | S1 |
| **Q9** | **Quick build and Shapes specifics.** *Use less board* respects *No glue*. The box tool keeps its kind. A box card, not the Workshop part card, in Quick build. Make-card wording. App dialogs instead of `confirm()`. The sketch label halo fix (#8). | §11, #8 | S1, O3 |
| **Q10** | **Accessibility.** Names for material radios, design rows, sliders and selects; `aria-pressed` on toggles; the editor made inert behind the welcome screen. | §5, §11 | O4 |
| **Q11** | **Verification.** Run `BROWSER_TEST_PLAN.md` sections H, I and J and the failed rows of A–E again. Update the report. Run the fuzzer at higher counts once. | all | O2 |

**Order and parallel work.**
- Q0 first.
- Q1 and Q2 next: both are data-loss or lying-control bugs.
- Q3–Q5 can run in parallel sessions once Q0 is in. They touch different files: model and validate; rules and lids;
  placement and stage.
- Q6 and Q7 share the stage overlay code, so run them one after the other.
- Q8–Q10 are small and fit anywhere after Q3.

**Size:** Q1, Q4 and Q6 are the large ones (each about one long session). The rest are each half a session or less.

**What this round does not do:**
- Structural curved walls (S6's later plan).
- The teacher view (F, never tested: needs the key and the Worker).
- Offline (G3).
- The *Low* findings that S1–S5 don't fix as a side effect. A few small ones are in Q9; the rest are left for later.

---

## 4. Decisions (settled by the owner, 2026-11-20: "as recommended")

1. **Outcome reports (S1):** adopted per operation, as each is touched. Every operation in a finding of this round
   adopts it, and new operations must.
2. **Curved walls (S6):** gated now. Only C2 and C7 (lost or broken data) are fixed in this round. The other curved
   combinations are greyed with a reason. Structural curved walls get a plan of their own later.
3. **Workshop check:** problems such as a too-tight bend show on the stage as they happen, not only at *Download* (Q4).
4. **Two tabs (Q2):** both tabs can edit, with the conflict warning fixed as in Q2. The second tab is not read-only.
5. **Level switch (S4):** one fixed segmented control in every level and on the Shapes stage; in Guided a small chip.
6. **Testing (O1–O5):** the promise checks and copy checks run in `npm test`. The truth spec (O2, with O4) runs only
   when a change touches the UI. This is within the light testing routine.
7. **Numbering:** this round is milestones **134–145** (Q0–Q11), in ROADMAP §5.4, built **before** 115, 117 and 118.
