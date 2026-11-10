# Bug-fix plan (after milestone 41, main at 25674dd)

A testing pass on 2026-11-10 found about 30 bugs. Some crash the app, some write cut files that cut wrong, and some leave Quick build students stuck. Each engine bug has a failing repro test on this branch. This file says what to fix, where to look, how to fix it and how to tell it's done. It's written for an agent working without the session that found the bugs.

Line numbers are for 25674dd and will drift; search for the function names.

## Before you start

```bash
git checkout claude/bugfix-plan
npm ci
npx playwright install chromium          # e2e; or set PW_CHROMIUM_PATH to a Chromium you have
python3 -m pip install ezdxf svgpathtools  # optional: the 6 export tests that read DXF and SVG with an independent library
npm run typecheck && npm test            # must be green before you change anything
npm run test:bugs -- repro-              # the open repros: all fail today (48 failing tests, 1 passing control)
```

**Where things are**
- **Repros and fuzzers:** `tests/bugs-model/` (modelling ops, solver, joints) and `tests/bugs-output/` (pieces, packing, export, Quick build, loading files, templates, batch).
- **Kept out of `npm test`:** both folders are excluded in `vite.config.ts`. They run with `vitest.bugs.config.ts` (`npm run test:bugs`).
- **One repro on its own:**
  ```bash
  npx vitest run -c vitest.bugs.config.ts tests/bugs-model/repro-cut-covers-panel.test.ts
  ```
- **The fuzzers:** add `--disableConsoleIntercept` to see their summaries.
  - **`tests/bugs-model/fuzz.test.ts`:** a seeded op generator, the full invariant check after every op, and a delta-debug shrinker. Variables:
    - `FUZZ_FROM`, `FUZZ_N`, `FUZZ_STEPS`, `FUZZ_SKIP`, `FUZZ_OUT`
    - `FUZZ_SHRINK=1`: shrink a failure to its smallest case
    - `FUZZ_AUTOIDEM=1`: also check that `autoConnect` changes nothing when run twice
    - `FUZZ_PLAUSIBLE=1`: only inputs the UI can send
  - **`tests/bugs-model/overlap.test.ts`:** do solids overlap?
  - **`tests/bugs-output/*.test.ts`** (`pipeline`, `quick`, `load`, `templates`, `offset`, `batch`, `degenerate`):
    - `FUZZ_N`, `FUZZ_SEED`
    - `HUGE=1`: include values like `1e308`, which hang today (see B3)

**Rules for every fix**
1. **Prove the bug first.** Run its repro and watch it fail. Fix the cause, not the symptom. Rerun the repro: it passes.
2. **Move the repro into `tests/`.** It becomes a regression test: merge it into the matching existing test file (e.g. `trays.test.ts`, `export.test.ts`) or keep it as its own file. Repros import `../../src/...`, so fix the paths when you move them.
3. **Don't weaken a repro's assertions to get it to pass.** If a repro expects the wrong thing, say why in the commit message and in PROGRESS.md, then change it.
4. **Run the checks.** `npm run typecheck && npm test` after every fix. Run the e2e specs for the area after any UI or behaviour change. When a phase ends, run the fuzzers for that area with fresh seeds.
5. **Follow the repo's habits:** record user-visible decisions in DECISIONS.md, and close each phase with a short PROGRESS.md section listing the bugs fixed and how they were verified.
6. **Commit per bug and open one PR per phase**, phases in order. Phases 1–2 matter most: they're crashes and corrupt data.
7. **Don't deploy, and don't touch Worker secrets** (`SITE_PASSWORD`, `TEACHER_KEY`, `SESSION_SECRET`). The owner deploys.
8. **When the last repro has moved:** delete `tests/bugs-model/`, `tests/bugs-output/` and `vitest.bugs.config.ts`, remove the `exclude` line in `vite.config.ts` and the `test:bugs` script, and fold the fuzzers you want to keep into `tests/` with small default iteration counts.

## Bug list

Severity:
- **crash:** an exception or hang reachable from the UI or a file.
- **mis-cut:** the cut file is wrong.
- **data:** the saved design is corrupt.
- **stuck:** a student can't get out of a state.
- **UI:** layout or visuals.
- **minor:** cosmetic.

| ID | Phase | Severity | Bug | Repro |
|---|---|---|---|---|
| B1 | 1 | crash | Removing the edge a fold child hangs from crashes `validate`, `buildPieces` and export ("no edge e0"); with a tray, every later edit throws | `bugs-model/repro-missing-fold-edge`, `bugs-output/repro-fold-edge-cut-away` |
| B2 | 1 | crash | A cut shape bigger than its panel crashes `buildPieces` and `validate`; on a tray wall `solve` throws | `bugs-model/repro-cut-covers-panel` |
| B3 | 1 | crash, mis-cut | Project files and class submissions aren't validated: they load, then crash, export `NaN` or hang | `bugs-output/repro-load-unvalidated`, `bugs-output/repro-huge-coordinate-hang` |
| B4 | 1 | crash | No error boundary; a design that throws may be autosaved and crash again on reload (suspected) | none; check by hand |
| B5 | 2 | mis-cut, data | Piece keys collide (`<wall>~n`): two pieces cut on top of each other; copies and board material ignored on wall-set members | `bugs-output/repro-piece-key-collision` |
| B6 | 3 | mis-cut | Any odd finger count is honoured: fingers narrower than the board make the base and walls overlap | `bugs-model/repro-finger-corner-overlap` |
| B7 | 3 | mis-cut | Butt corners on plywood: both walls stay full length and fill the same corner | `bugs-model/repro-butt-corner-overlap` |
| B8 | 3 | mis-cut | A plywood tray with one wall in another material: neighbours' outlines cross themselves | `bugs-model/repro-mixed-material-corner` |
| B9 | 3 | mis-cut | A notch cut down into the bottom finger zone: self-crossing outline, or a 0.5 mm web, both silent | `bugs-model/repro-notch-into-fingers` |
| B10 | 3 | mis-cut | Wall corner drag and typed wall width can make outlines cross themselves | `bugs-model/repro-wall-corner-selfcross`, `bugs-model/repro-edge-length-selfcross` |
| B11 | 3 | mis-cut | "+ Divider" between opposite walls of an octagon or 12-gon: 61 mm divider in a 142 mm gap, no joints | `bugs-model/repro-divider-octagon` |
| B12 | 4 | stuck | Kerf-compensated export refuses folded walls on sloped edges (3–7-gon card or corrugated boxes, the Dice tray mission) | `bugs-output/repro-kerf-polygon-fold` |
| B13 | 4 | mis-cut | Kerf compensation shrinks a narrow finger-jointed wall by 0.15 mm, unflagged | `bugs-output/repro-kerf-narrow-wall` |
| B14 | 4 | minor | Zero-area rings and slivers cut as tiny slits; 0.02 mm bow-tie on a side wall under a folded lid | `bugs-output/repro-degenerate-hole`, `bugs-model/repro-hinge-sliver`, `bugs-model/repro-lid-sidewall-selfcross` |
| B15 | 5 | stuck | Box too big for the sheet: only `offSheet` reported, and its Fix does nothing; `tooBig` ignores grain and the folded net | `bugs-output/repro-offsheet-fix` |
| B16 | 5 | minor | Piece placed into the sheet margin, unflagged; an oversized piece leaves an empty sheet 1 in the export | `bugs-output/repro-margin-overflow`, plus a new test |
| B17 | 5 | stuck | A cut-out sticker with nested outlines is "overlapping itself"; Fix does nothing | `bugs-output/repro-sticker-selfoverlap` |
| B18 | 5 | stuck | Quick build lid on a hexagonal box runs 1.5 mm into two walls | `bugs-output/repro-hex-lid-collides` |
| B19 | 5 | minor | Divider ghost on a low box shows height 1, ✓ makes 5 mm | `bugs-output/repro-divider-plan-height` |
| B20 | 5 | minor | Teacher batch: a student with a calibrated material gets separate sheets | `bugs-output/repro-batch-custom-material` |
| B21 | 5 | minor | Batch name labels taller than tiny pieces | none; write one (`batch.test.ts` seed 56) |
| B22 | 6 | data | A panel placed on a tray wall keeps a dangling `place.host` when reconciliation removes the wall; it can't be moved | `bugs-model/repro-dangling-host` |
| B23 | 6 | minor | `autoConnect` never settles after a notch at a tray wall's corner (seam re-made with a new id every edit) | `bugs-model/repro-autoconnect-churn` |
| B24 | 6 | mis-cut | `solve` isn't idempotent on a corrugated tray with a concave base (0.9 mm differs after reopening) | `bugs-model/repro-solve-not-idempotent` |
| B25 | 6 | minor | Tray wall and corner kinds left invalid after a material change (suspected) | none; write one first |
| U1 | 7 | UI | Top bar overflows below ~1390 px (Quick build) and 1366 px (Workshop): Download, Submit and language toggle off-screen or clipped | new e2e |
| U2 | 7 | UI | 3D contact shadows drawn well away from the boxes | new e2e or manual screenshot |
| U3 | 7 | UI | First tip and empty-stage hint say "drag", but the Panel tool takes three clicks | i18n strings |
| U4 | 7 | tests | Two e2e specs are flaky (~50%) on main and the previous main | `boards.spec.ts:394`, `walls.spec.ts:8` |

## Phase 1: crashes and hangs

### B1: a fold child whose parent edge is gone
- **Triggers** (all reachable):
  - a Cut or Add shape across the parent edge, e.g. card 120×80, fold wall on e0, `addDetail(base,'rect','cut',60,0,140,20)`
  - deleting a gable point a roof was grown from
  - deleting the base vertex a turned divider starts from
  - moving, resizing or changing the op of a shape a fold child stands on
- **Cause:** fold transforms look up the parent edge without checking it still exists:
  - `netFolds` (`pieces.ts` ~47-53) → `foldXform` → `frame.ts` `seg()` throws `no edge …`
  - the fold-strip loop in `buildPieces` (`pieces.ts` ~197, `edgeLocal(parent, c.a.edge)`)
  - `cornerFoldXform` (`pieces.ts` ~67-71) → `cornerFit` / `edgeLocal`

  `solve` already marks such a connection `broken`, but these paths don't skip broken folds. Once a tray exists, `fixFlatNets` → `netOverlaps` → `netGroups` throws inside `solve` itself.
- **Fix:**
  - Treat a fold whose parent or child edge is missing (`findEdge` returns null) or whose connection is `broken` as **not folding**: `netFolds` leaves it out (or its `xf` returns null), and the child becomes the root of its own net.
  - Skip it in the fold-strip loop and in `cornerFoldXform`.
  - A small `edgeLocalOrNull` helper keeps call sites honest; don't swallow the throw in `seg()` globally.
  - `deleteVertex`'s grown-child filter (`ops.ts` ~1118) only handles tabslot dividers. Remap or break every grown child on the deleted edge, whatever its kind.
  - The broken wall must still show as an issue (`val.broken` or similar), not disappear silently.
- **Done when:**
  - both repros pass
  - `npm run test:bugs -- fuzz` (model) at `FUZZ_N=600` reports no `no edge` errors
  - in the browser, cutting across a folded wall's edge shows the wall as broken, and the app keeps working

### B2: a cut that covers its whole panel
- **Cause:** `safeUnion([])` in `src/geom/clip.ts` (~22-40) returns `[undefined]`: `polygonClipping.union(undefined)` throws, and the fallback is `[polys[0]]`. That reaches `buildPieces` (`pieces.ts` ~213/224) and `flatPanel` (~281-286) when `ownOutline` has no rings.
- **Fix:**
  - `safeUnion([])` and `safeDifference` with an empty subject return `[]`.
  - Callers handle an empty `MultiPolygon` as "panel removed": `buildPieces` already returns `[]` for that, and `validate` has `val.removed`.
  - Check `flatPanel`, `netOverlaps` and the tray paths in `solve`.
  - Optional: cap shape W/H/diameter in the Inspector (`Inspector.tsx` ~146-150) at a few times the panel size.
- **Done when:** `repro-cut-covers-panel` passes, including the tray-wall case, and the design shows `val.removed` instead of throwing.

### B3: unvalidated project files and submissions
- **Cause:** `migrateDesign` (`serialize.ts` ~77) only checks that `panels` is an object, then calls `solve`.
- **Fuzz results:** of 297 mutated files that loaded:
  - 19 exported `NaN`
  - 14 crashed `validate`
  - 9 crashed `buildPieces` / `prepareExport`
  - 5 crashed `missionState`
  - 33 threw a plain `TypeError` instead of a `ProjectError`
  - one `x = 1e308` makes `contact.ts` ~83 loop forever (`n = ceil(Infinity / 1.5)`)
- **Fix:**
  - **A structural check after the migrations, before `solve`.** It verifies:
    - types and finite numbers, within a sane range (say |x| ≤ 100 000 mm)
    - sketch point arrays, detail fields, frames (unit-ish vectors) and placements
    - connection, tray and placement references
  - **On failure,** throw `ProjectError('damaged')` with a new i18n message (en and he). Drop or repair only what's clearly safe to drop (e.g. dangling placements).
  - **Wrap `solve` in `parseProject`** so any throw becomes a `ProjectError`.
  - **Defence in depth:** `contact.ts` skips non-finite segments and caps `n`. `svgImport` rejects non-finite numbers (e.g. `1e999`).
  - **Worker (`worker/index.ts`):** submissions already run `parseProject`. Also reject files that fail the structural check, and keep a size cap.
  - **Teacher batch (`makeBatch` in the teacher view):** try/catch per submission. Report which submissions couldn't be included instead of failing the whole batch.
  - **Open-file alert (`TopBar.tsx` `open`):** show the friendly message for any error, not `String(e)`.
- **Done when:**
  - both repros pass
  - `tests/bugs-output/load.test.ts` with `FUZZ_N=300` (and once with `HUGE=1`) reports no non-`ProjectError` throws, no `NaN` exports and no hang
  - a worker test shows a damaged submission is rejected with 400

### B4: resilience (check first)
- **Suspected:** after B1 or B2, a throwing render could blank the app. `useAutosave` (`store/hooks.ts` ~45) doesn't clear its save timer on unmount, so the bad design may be saved and crash again on reload.
- **Check first:** reproduce in the browser with the B1 trigger on `main` before fixing B1, or by injecting a throw.
- **Fix:**
  - Add a React error boundary around the stage and inspector. It shows "Something went wrong" with Undo and "Reload the last good version".
  - Autosave only designs that passed `solve` and `validate` without throwing. Clear the timer on unmount.
- **Done when:** an e2e spec (or unit test of the boundary) that forces a throw shows the recovery UI, and a reload doesn't crash.

## Phase 2: piece identity

### B5: piece key collisions
- **Cause:** two different things use the same `~n` suffix, and `pieceRoot()` (`pieces.ts` ~26) splits on `~`:
  - wall-set members are panels named `<wall>~n` (`ops.ts` `derivedOf` ~183, `reconcileWallSets`)
  - fragments of a piece split by a cut are keyed `<key>~n` (`pieces.ts` ~244)
- **Symptoms:**
  - Two pieces share a key, so `pack` keeps one placement for both, and `prepareExport` draws both pieces at the same spot. Compensated mode reuses one piece's contours.
  - Quantity (`d.pieces[...]`, written by the Inspector) and board material for a member `W~1` are read from `W` (`pack.ts` ~35-37).
- **Fix:**
  - Give fragments their own separator that no panel id can contain, e.g. `${key}@${i}`, and make `pieceRoot` strip only that suffix. Grep every `'~'` and `split('~')` in `src/` and classify each as "panel id" or "fragment".
  - Placement keys are `${pieceKey}#${copy}`. Every consumer that splits them must use `lastIndexOf('#')`, because tray wall ids on split edges can contain `#` (`tr_…/e1#0`); see template `regenerate`.
  - Add a test that no id from `newId`, trays, wall sets or split edges contains the fragment separator.
  - Bump `SCHEMA_VERSION` with a migration: placement and piece keys of the form `X~n#i`, where `X~n` is not a panel id, become `X@n#i`. Manual placements of fragments survive.
- **Done when:**
  - all three tests in `repro-piece-key-collision` pass
  - a golden v8 file with a manually placed fragment loads, and its placement is kept
  - the output pipeline fuzz shows copies equal to placements for every design

## Phase 3: joint geometry that mis-cuts

### B6: finger count unbounded
- **Cause:** `fingerCountFor` (`seams.ts` ~312-318) honours any odd count ≥ 3. The UI stepper allows 3–99 (`Connections.tsx` ~78). With 3 mm ply, 11 fingers on a 29 mm corner overlap (~0.35 mm shared material), and `validate` is silent. `minContact` already assumes fingers ≥ t.
- **Fix:**
  - Clamp to the largest odd n with `length / n ≥ t` (consider `≥ max(t, minWeb)`), in `fingerCountFor` and in `setConnection`.
  - The stepper's `max` comes from that limit.
  - Old files with too many fingers are clamped on load (by `solve`). Note it in DECISIONS.md.
- **Done when:** the repro passes for 3 mm and 6 mm ply, and `tests/bugs-model/overlap.test.ts` reports no finger overlaps.

### B7: butt corners on plywood
- **Cause:** a butt seam returns empty geometry (`seams.ts` ~557-560), so neither wall is cut back at the corner.
- **Fix:**
  - A butt corner shortens one wall (the `b` side, following the existing corner-ownership rule) by the other's thickness, with no fingers and no clearance. Reuse the cut-back that `slide` corners use, with clearance 0.
  - Or, if butt is meant only for card, remove it from `seamKinds(plywood,'corner')`. Decide, and record it in DECISIONS.md.
- **Done when:** `repro-butt-corner-overlap` passes and the volumetric overlap fuzz is clean for butt corners.

### B8: mixed-material tray corners
- **Symptom:** plywood tray 100×100×40 with wall e3 set to card or corrugated. The mixed corners become tabslot, and walls e0 and e2 cross themselves near the bottom corner (e.g. at (0, 3)). It happens on every n-gon from 4 to 8, but an all-plywood tabslot tray is fine.
- **Cause (suspected):** the mixed-thickness path of `cornerTabs` (`seams.ts` ~655). The corner tab notches start at s = 0, where the bottom finger notches already are.
- **Fix:** start the corner tabs past the other joint's depth (a keep-out at each end equal to the bottom joint depth plus min web), the way the same-material path does. Confirm by comparing notch lists for the mixed and same-material cases.
- **Done when:** `repro-mixed-material-corner` passes for 4–8-gons and all mixed pairs (card, corr-1.6, corr-4).

### B9: cuts into a joint zone
- **Symptom:** plywood tray 200×150×30, notch on wall e0 down to y = 2.5, where the bottom fingers are 3 mm deep. The outer contour crosses itself, and `validate` is silent. At y = 3.5 there's no crossing, but only a 0.5 mm web is left, also silent.
- **Cause:** `panelOutline` (`geometry.ts` ~63) applies joint notches to an edge's profile even when a shape no longer leaves that edge whole.
- **Fix:**
  - **Detect it:** a new `validate` issue (or reuse `val.tooThin`) when a cut comes closer than `minWeb` to a joint's notch band.
  - **Make the outline robust:** when a cut overlaps a notched edge, build that panel's outline as a boolean difference (outline minus notch polygons minus cuts) instead of editing the edge profile.
  - **Quick build:** `guard.ts` should already keep shapes out of the keep-out zone; check that it covers joint bands.
- **Done when:** the repro passes (no self-crossing, an issue reported for the 0.5 mm web), and the fuzz invariant "every outer contour is simple" holds.

### B10: edits that make outlines cross themselves
- **Cause:** two edits change an outline with no simplicity check, unlike `moveVertex` (`ops.ts` ~1062-1069):
  - `setWallCorner` (`ops.ts` ~1151-1161) and the corner drag (`polyTool.tsx` ~489)
  - `setEdgeLength` (`ops.ts` ~790-802), reached by typing a wall's width on a polygon tray, which moves a base vertex
- **Fix:**
  - **In the ops:** check the would-be outline with `isSimplePolygon`. On failure, return false and leave the design unchanged.
  - **During a drag:** clamp to the last valid position.
  - **Safety net:** a new `validate` issue `val.selfCross` for any panel whose outline isn't simple. Today these show up as a misleading `val.netOverlap`.
- **Done when:** both repros pass, and the model fuzz shows no non-simple outlines with `FUZZ_PLAUSIBLE=1`.

### B11: "+ Divider" on octagon and 12-gon trays
- **Cause:** `planDividerBetween` (`ops.ts` ~611-623) grows the divider from a base edge running along the walls' normal, and gives it that edge's length (61 mm in a 142 mm gap). It returns `ok: true`, and the divider gets 0 end joints.
- **Fix:**
  - Either build the divider to span the gap (width = wall-to-wall distance, joined at both ends), or return `{ ok: false, why }` with a message the UI shows.
  - Quick build's divider line (`addDividerBetween`) goes through the same plan.
  - Add a `validate` issue for a divider whose ends join nothing.
- **Done when:** `repro-divider-octagon` passes: a joined divider at both ends, or a refused plan. Never `ok` with 0 end joints.

## Phase 4: kerf compensation and outline hygiene

### B12: compensation refuses folds on sloped edges
- **Cause:** the fold strip overlaps both panels by 1e-5 on sloped edges (`pieces.ts` ~190-209). After the union, the outline has segments of ~2e-8 and ~6e-6 mm:
  - `cleanPolygon` (`geometry.ts` ~99) drops only duplicates closer than 1e-9.
  - `offsetContour` (`offset.ts` ~120) refuses a segment that vanishes at a concave corner instead of dropping it.

  3–7-gons fail and 8-gons pass. Overall, 163 of 1904 cut contours failed compensation in random designs.
- **Fix:**
  - **First:** in `offsetContour`, drop segments shorter than ~1e-4 mm (and merge collinear neighbours) before offsetting, and let a segment that collapses during the offset be removed rather than fail.
  - **Then consider:** raise the `cleanPolygon` tolerance to ~1e-6 mm. Run the golden tests (`tests/golden.test.ts`) before and after, and keep the change only if the goldens hold.
- **Done when:**
  - `repro-kerf-polygon-fold` passes (triangle fold, and the Dice tray mission in card and corrugated)
  - `tests/bugs-output/pipeline.test.ts` shows compensation failures near zero; look at every one that's left and list it in PROGRESS.md

### B13: compensation silently shrinks a narrow wall
- **Symptom:** ply-3 `regularPolygon(9, 13.38)` with `addTray(40.7)`. Fingers from both corners leave a 0.18 mm spine in the nominal outline. The offset accepts the self-touching ring: `selfIntersects` / `segsCross` (`offset.ts` ~62-68) only catch strict crossings, so the top side moves inward by 0.075.
- **Fix:**
  - Count touching and collinear overlaps as intersections, so the offset refuses instead of passing silently.
  - Report the narrow spine in `validate` (`val.tooThin`: a web under `minWeb` between corner joints). On short edges, reduce corner fingers (fewer, or none) before the web gets that thin.
- **Done when:** `repro-kerf-narrow-wall` passes (correct outline, or refusal plus an issue), and no compensated outline moves inward anywhere in the pipeline fuzz.

### B14: slivers
- **Fix:**
  - Drop rings and holes with |area| < 1e-6 mm² wherever outlines are turned into contours: `ringContours` in `buildPieces`, and `outline.ts`, which only drops rings with < 3 points.
  - For the hinge sliver (`pieces.ts` ~174-190) and the 0.02 mm bow-tie on a side wall under a folded lid (`growPanel(tray/e2, 'e2', fold)` on card), find where the strip and the corner cut-back disagree. Don't just filter: a bow-tie is a real crossing.
- **Done when:** all three repros pass.

## Phase 5: sheets and Quick build

### B15: too big for the sheet
- **Cause:**
  - The `tooBig` check (`validate.ts` ~49-50) compares the single panel's bounding box and assumes it may turn. But a piece is the whole folded net, and it may not turn when the grain forbids it (`grain !== 'none' && !allowRotate`).
  - So a 300×500 plywood box base only gets `val.offSheet`, and `fixIssue('val.offSheet')` (`easy/fix.ts` ~43-47) clears placements and returns true while the issue stays. That happened in 122 of 122 fuzz cases.
- **Fix:**
  - Check `tooBig` per **piece** (`pieceCopies` w/h), honouring the grain rule, and report it once on the piece's root panel.
  - `offSheet` fix: repack, re-run the sheet check, and return true only if that issue is gone.
  - When a piece can't fit as it stands, the badge offers the right fix instead:
    - "Allow turning" if it fits turned against the grain
    - otherwise the `tooBig` shrink, scaled uniformly; the current `scaleSketch` scales polygons unevenly
- **Done when:** `repro-offsheet-fix` passes, and in `tests/bugs-output/quick.test.ts` every Fix that returns true removes its issue.

### B16: margins and the empty first sheet
- **Cause:**
  - The fallback for a piece that fits nowhere (`pack.ts` ~125) puts it at the margin of a **new** sheet. `lastSheet` starts at 0 even when nothing is placed, so a lone oversized piece lands on sheet 2, and the export includes an empty sheet 1.
  - `offSheet` (`validate.ts` ~306) compares against the bare sheet, so a piece that fits the sheet but not its margin goes into the margin, unreported.
- **Fix:**
  - Start `lastSheet` at −1 when there's nothing placed.
  - Let the sheet check flag pieces that cross the margin, either as a blocking issue or a note. Decide which, and record it.
- **Done when:**
  - `repro-margin-overflow` passes
  - a new test passes: one 2000×60 panel is placed on sheet 0, `prepareExport` returns one sheet, and `val.tooBig` is reported

### B17: a sticker overlapping itself
- **Cause:** `shapeIssues` (`validate.ts` ~275) compares contour pairs that belong to the **same** detail. A path or sticker with nested outlines (a smiley's eyes inside its face) is reported as overlapping itself. There's no stencil check for path shapes.
- **Fix:**
  - Skip pairs from the same detail.
  - Add the stencil check for path shapes cut out (islands that fall out), using the existing `val.stencil` rule and its Fix (engrave instead).
- **Done when:** `repro-sticker-selfoverlap` passes, and a cut-out "O" shape still reports `val.stencil`.

### B18: hexagonal lid collides
- **Symptom:** `boxRecipe` regular, 6 sides, 200, height 40, then `wallRecipe(…/e1, 'e2', quickWallHeight(...))` (the lid). It gives two `val.collide`, 1.49 mm into the walls, in ply-3 and corrugated. Rectangular boxes are fine.
- **Cause (suspected):** the adapt fit in `growWith` (`views/ghost.ts`) for edges that aren't axis-aligned.
- **Fix:** find why the lid isn't inset the way it is on rectangles. Quick build must only make lids that don't collide.
- **Done when:** the repro passes for 5–8-gon boxes in all materials.

### B19: divider ghost height
- **Cause:** `planDividerLine` on a 6 mm-tall card box plans height 1, but the panel made is 5 mm (`MIN_PANEL`). `dividerHeight` rounding is in `recipes.ts` ~136.
- **Fix:** plan and make agree. Clamp to `MIN_PANEL` in the plan, or refuse with a reason when the box is too low.
- **Done when:** `repro-divider-plan-height` passes.

### B20: teacher batch and calibrated materials
- **Cause:** `sameMaterial` (`batch.ts` ~15) compares kind and thickness only, but copies keep their own material ids (`batch.ts` ~37), so `pack` splits them onto separate sheets.
- **Fix:** when the batch accepts designs as the same material, give all copies one batch material id (the first design's profile). Show the kerf used in the batch dialog.
- **Done when:** `repro-batch-custom-material` passes.

### B21: batch labels on tiny pieces
- **Cause:** `batch.ts` ~19 uses a minimum text size of 2 mm and doesn't check the label's height.
- **Fix:** scale the label to fit the piece (both dimensions), or leave it out when it can't fit.
- **Done when:** a new test passes: a 1.68×1.22 mm piece gets no label, or one inside its bounds.

## Phase 6: model consistency

### B22: dangling host
- **Cause:** walls removed by tray reconciliation (`trays.ts` ~76-80) or by wall-set reconciliation (`ops.ts` ~236-243) skip the hosted-panel handling `deletePanel` does (`ops.ts` ~1296-1301). The placed panel keeps `place.host` = a deleted id, and `movePanel` refuses to move it.
- **Fix:**
  - Factor the clean-up out of `deletePanel` into one helper (rehost or drop to floor, plus connections, pieces and placements), and use it on every path that removes a panel.
  - Add a fuzz invariant: every `place.host` names an existing panel.
- **Done when:** `repro-dangling-host` passes, and the invariant holds over `FUZZ_N=600`.

### B23: autoConnect churn
- **Cause:** after a notch at a tray wall's corner, `seamStillFits` (`seams.ts` ~1028-1036) rejects an auto seam that `findOpenSeams` / `dedupeSeams` (`seams.ts` ~958-1025) then finds again. The two disagree on split edges keyed by `baseKey`, so `autoConnect` (`ops.ts` ~513-531) deletes and re-adds it, with a new id, on every edit.
- **Fix:** make both sides use the same key and fit logic for split edges.
- **Done when:** `repro-autoconnect-churn` passes for all 4 materials, and the model fuzz with `FUZZ_AUTOIDEM=1` is clean.

### B24: `solve` isn't idempotent
- **Symptom:** corr-1.6, an 8-point concave base, `addTray(79)`. A second `solve` moves a notch from 12.096 to 13.027, and the result settles after one more pass. So the export right after an edit differs from the file once it's reopened.
- **Cause (suspected):**
  - `insideCornerExtensions` (`ops.ts` ~91-101) reads seam kinds left from the previous pass, before they're re-fitted (`ops.ts` ~150-160).
  - `fixFlatNets` (`flatnet.ts` ~248-283) doesn't re-solve after its last change.
- **Fix:** fit seam kinds before computing extensions. As a backstop, have `solve` iterate to a fixed point (at most 3 passes) and warn in development if it doesn't converge.
- **Done when:** `repro-solve-not-idempotent` passes, and the model fuzz's "solve twice changes nothing" and "save → load round-trip equal" invariants hold.

### B25: stale tray kinds after a material change (write a repro first)
- **Suspected:** `setMaterial` / `setPanelMaterial` leave `tray.wallKind` / `cornerKind` invalid for the new material (e.g. `fold` on plywood). Walls made in that state are sized with the stale kind (3 mm short) for one solve. It was only seen with construction bases.
- **Also seen:**
  - `normalizeMaterials` runs before `reconcileWallSets` removes derived walls.
  - A material set on a derived wall `~n` is lost when the edge merges again.
- **Fix:** re-fit tray kinds with `fitKind` when the material changes, and keep a derived wall's material when wall sets merge, or document that it's dropped.
- **Done when:** a new repro exists and passes.

## Phase 7: UI and tests

### U1: top bar overflow
- **Measured on 25674dd** (`header.scrollWidth`, the 60 px `.topbar`, `flex-wrap: nowrap`):

  | Mode | Bar needs | What breaks |
  |---|---|---|
  | Workshop | 1366 px | At 1280, Submit to class pokes above the bar and the language toggle is off-screen |
  | Quick build (with the Ready badge) | 1386 px | At 1366 × 768, Submit is clipped and the language toggle is off-screen; at 1280, Download for laser is cut off |

  At 768 (tablet), the view switch, undo/redo, Submit, Download and the language toggle are all unreachable. Between 1366 and ~1500 px, "Submit to class" breaks over three lines inside the bar.
- **Fix (CSS-first, `src/styles.css` and `TopBar.tsx`):**
  - **Narrower widths:** below ~1500 px, Submit to class and the sheet meter go compact (icon plus short label, tooltip with the full text), and the brand name hides. The existing `.hide-narrow` at 1100 px is too late.
  - **Tablets:** below ~1000 px, move the less-used items (Submit, language, save state) into the project menu, or an overflow "⋯" menu.
  - **Download:** "Download for laser" and Undo/Redo must always stay visible.
  - **Language:** check Hebrew too (`dir="rtl"`).
- **Done when:** a new e2e spec checks, at 1280×800, 1366×768 and 1440×900 in both modes and both languages, plus 768×1024:
  - `header.scrollWidth <= header.clientWidth`
  - every header button lies inside the viewport and inside the bar's height

### U2: contact shadows offset
- **Symptom:** on the live site, each box's soft floor shadow is drawn well behind and to the side of the box (from the top view, roughly 170 px right and 150 px up, the same for both boxes). It persists after a reload.
- **Code:** `<ContactShadows key={shadowKey} frames={1} position={[sc.x, -0.05, sc.z]} scale={ss} …>` in `View3D.tsx` ~596-623 (drei 10.7.9).
- **Root cause not found.** Hypotheses to test, one at a time:
  1. **The one-frame capture misses the new position.** With `frames={1}` and a remount on every edit, the capture may render before the remounted group's world matrix is at `sc`. Try `frames={2}`, or force `updateMatrixWorld` before the capture.
  2. **The plane is mirrored.** The plane's `scale [1,-1,1]` and the group's rotation may mirror the shadow about the scene centre.
  3. **The bounds don't match the meshes.** `bounds` (from `design` frames and `display.xf`) may not match where the meshes are drawn.
- **Done when:** in the top view, each shadow sits under its box. Prove it with a screenshot in PROGRESS.md, or with an e2e test that reads canvas pixels under and beside a box.

### U3: onboarding text
- **Problem:** the Panel tool takes three clicks (face, Flat or Standing, then the drag; see DECISIONS.md), but two strings still say "drag on the grid". Dragging first just orbits the camera:
  - `hint.1` (`src/i18n/en.ts` ~385)
  - `view.empty3d` (~73)
- **Fix:** rewrite both in en and he. Check `tests/i18n.test.ts` passes.
- **Also seen:** the new-panel ✓ bar covers the panel's length label while the ghost is waiting. Move the bar, or the label.

### U4: flaky e2e specs
- **Which:** `tests/e2e/boards.spec.ts:394` (Ctrl-drag along an edge: `span-pick-label` never appears) and `tests/e2e/walls.spec.ts:8` (a click on a wall's top edge in outline editing adds no point). They fail about half the time on both 25674dd and fc404f0, so they're not regressions.
- **Fix:** find the race, likely hover or pick state not ready before `mouse.down` or the click after `fit-view`. Wait on a real condition (a test id, a store value) instead of a timeout.
- **Done when:**
  ```bash
  npx playwright test -c pw-app.config.ts --repeat-each=10 tests/e2e/boards.spec.ts:394 tests/e2e/walls.spec.ts:8
  ```
  passes 20/20.

## Phase 8: final check
1. `npm run typecheck && npm test && npm run e2e`: all green. With ezdxf installed, nothing is skipped except the `SHOTS` specs.
2. Run every fuzzer with fresh seeds and larger counts (model `FUZZ_N=1200`, output fuzzers `FUZZ_N=1000`, `load` with `HUGE=1`). Triage anything new: fix it, or list it in PROGRESS.md.
3. Clean up as in rule 8.
4. A PROGRESS.md section for the whole pass: bugs fixed, decisions made, what was verified, and anything left open.
