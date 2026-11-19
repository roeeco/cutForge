# Handoff: milestones 105–118

Written 20 November 2026 on `claude/bold-archimedes-aib4wy` at `e88e115`, after milestones 92–104 and code splitting. One brief per milestone, checked against the code by reading it: paths and line numbers are those of `e88e115`, so grep a name before editing. *(unverified)* marks what was not checked. `ROADMAP.md` §5.1 numbers the milestones and §5.2 settles conflicts, except where this file corrects it (below). The prompt to start a session from is `next-session-prompt.md`.

Each brief has: **Depends on / unblocks**, **Already in the code**, **Stale in the plan**, **Steps**, **Feature-table rows** (Guided / Quick build / Workshop), **Words**, **Tests**, **Done when**, **Risks and owner questions**, **Size**.

## Findings that change the plans (read before any milestone)

1. **Guided must not fall through to Workshop.** `useFeature` / `featureState` (`src/easy/features.ts:188-195`) return `'show'` for every mode that is not `'quick'`. Workshop's letter keys fire on `mode !== 'quick'` (`src/store/hooks.ts:134`), and the guard runs only for `'quick'` (`src/store/store.ts:116`). Milestone 105 must give Guided a full column of its own (`satisfies Record<Feature, FeatureState>`) and turn every `!== 'quick'` into an explicit check; the Guided brief lists the 20 places that read the mode.
2. **Plain things are template designs.** `generate()` sets `d.template`, so a material change, the class-profile switch when sending, or the too-big fix runs the template again and undoes Guided's resizes. Recommended: a Guided start drops `d.template` (owner question 6 in the Guided part). The organiser mission has no tray, so Build's arrows need recipe versions of the pencil box and organiser.
3. **ROADMAP §5.2 row 12 is wrong for card.** The carton check takes card of any thickness (`src/templates/structures/carton.ts:26`), so a 2 mm greyboard grade would be offered folding cartons. Milestone 116 adds a thickness ceiling for folding (≤ 1 mm, owner to confirm). Quick build's carton recipe (`src/easy/recipes.ts:88`) also allows 4 mm corrugated, which the sentence refuses; 116 gives both one rule.
4. **The golden files do not cover the registry refactor.** No golden case has a fold-over or a plain edge flap, so "goldens unchanged" proves nothing for 111. Its brief adds `foldover-corr` and `flap-card-plain` goldens **generated before the refactor**, plus an old-vs-new test of `extrasByPanel`.
5. **ROADMAP §5.2 row 13 does not hold for plain flaps.** Plain flaps made by hand score on the edge (`scoreIn = 0`) and must keep doing so to stay byte-identical; only the new folding flap shapes of 112 crease *t/2* inside.
6. **No schema bump in 105–117** (it stays 11, `src/model/types.ts:521`). New fields are optional and must be validated: `check.ts` lets unknown fields on `edgeFlaps` (`:193-195`) and on a material (`material()`, `:58`) through.
7. **`src/net/` is the classroom network API**, not nets: the Net view's code goes in `src/views/`.
8. **Possible bug (unverified), not in any milestone:** `batchExport` (`src/export/batch.ts:66-78`) does not apply `prepareExport`'s kiss-score mirror, so a teacher's batch of kiss-scored pieces may be cut with the wrong face up. Check it before 117 (which touches batch export for nicks).

## Sizes

| # | Milestone | Size |
| --- | --- | --- |
| 105 | The mode and the shell | M |
| 106 | Things and the gallery | M/L |
| 107 | Build | L |
| 108 | Decorate | M |
| 109 | Send | M |
| 110 | Guided becomes the way in | S |
| 111 | The edge-feature registry | M |
| 112 | Shaped flaps | L |
| 113 | The Net view | M |
| 114 | Building in the flat | L |
| 115 | The artwork template | L |
| 116 | Board grades | S |
| 117 | Nicks, fill the sheet, cost | M |
| 118 | Verification | M |

Each part ends with its own **open questions for the owner**, each with a recommended default: take the default unless it blocks, and record it in `PROGRESS.md`.


---

## Part 1: Guided (105–110)

Checked on 2026-11-19 against `main` at `e88e115`. That is after code splitting, with milestones 92–104 built and G1 = 92 done.
Precedence when sources disagree: `ROADMAP.md` §5.2 settlements first, then the code as it is, then `GUIDED_MODE.md`.
I verified every `path:line` below by reading the file. A claim marked (unverified) was not.
Facts marked (scratch run) come from a throw-away vitest file kept outside the repo, run against the real modules. The repo was not modified.


### Guided: cross-cutting facts

#### 1. The mode today, and every place that reads it

- **The type.** `type Mode = 'quick' | 'workshop'` is at `src/easy/features.ts:9`.
  - `ViewPrefs.mode?: 'quick' | 'workshop'` at `src/store/store.ts:147` duplicates it.
  - `ClassMode = 'quick' | 'workshop' | null` at `src/net/api.ts:25` duplicates it too.
- **How the table is read.** Workshop is implicit: it always gets `'show'`.
  - `useFeature` at `features.ts:188-190`: `useMode() === 'quick' ? FEATURES[f] : 'show'`.
  - `featureState` at `features.ts:193-195` does the same.
  - **If `'guided'` is added to the type and nothing else changes, Guided gets every Workshop control.** Rewrite both functions first.
- **Every literal or comparison on the mode** (grep of `src/` and `worker/`). Each one must be decided for Guided:

  | Where | What it does now | What Guided needs |
  |---|---|---|
  | `src/store/store.ts:116` `guarded()` | runs `quickGuard` only when `mode === 'quick'`; otherwise `solve` + `autoConnect` | Guided must be guarded. Use a helper such as `keepsCuttable(mode) = mode !== 'workshop'`. The plan says "the guard runs in Guided as in Quick build". |
  | `store.ts:172,176` `initialPrefs()` | new browser → `'workshop'` | G7 changes the default. `initialPrefs` is not exported; export a pure `defaultPrefs(raw)` so it can be unit-tested. |
  | `store.ts:428` `startTour` | forces Workshop | keep (the tour stays Workshop's; `TOUR_OFFERED = false`, `src/tour/TourNudge.tsx:10`) |
  | `store.ts:568` `select` | `QUICK_GROW` when quick | nothing (Guided never grows) |
  | `src/store/hooks.ts:127` | Quick letter keys when `=== 'quick'` | fine as is |
  | **`hooks.ts:134`** | **Workshop letter keys when `!== 'quick'`** | **would fire in Guided.** Change to `=== 'workshop'`, or gate on the new `keys.tools` feature. |
  | `hooks.ts:98-115` | Ctrl+C / Ctrl+V / Ctrl+D; paste starts a **pending** ghost (`pasteShapes`, `store.ts:464`) | Guided has no ✓, so turn these off in Guided, or make them confirm at once |
  | `hooks.ts:116-118` | Delete/Backspace deletes a selected **panel** (any wall) | in Guided allow only dividers and decorations |
  | `src/ui/TopBar.tsx:17,126,177-179,227-229` | two-item switch; labels use a `m === 'quick' ? … : …` ternary | three items need a label map; G2 shows Guided in development only, G7 for everyone |
  | `src/ui/StartScreen.tsx:66,68` | tour gate; missions only when quick | Guided does not render `StartScreen` |
  | `src/ui/Inspector.tsx:50,107` | Quick read-only card and words | not rendered in Guided |
  | `src/ui/TrayUI.tsx:77` | Quick words | not rendered in Guided |
  | `src/views/View3D.tsx:171-172` | `locked()`: Workshop-only parts are inert in Quick | Guided needs the same (use the helper) |
  | `View3D.tsx:814` | `GuardOverlay` (keep-out hatch, *Kept … mm* tip) only when quick | Guided needs it too |
  | `View3D.tsx:2798-2799,2949` | `stageHintKey(…, mode: 'quick' \| 'workshop')` | widen the type; Guided hides the hint (`stage.hint`) |
  | `src/teacher/TeacherApp.tsx:231,236-239` | `<select>` of `''/quick/workshop` | add Guided (G3 teacher words) |
  | `src/easy/ReadyBadge.tsx:60`, `Inspector.tsx:87` | `setMode('workshop')` | not rendered in Guided |
  | `worker/index.ts:277` | PATCH accepts `null \| 'quick' \| 'workshop'` | add `'guided'` (no migration: `mode` is a `text` column, `worker/schema.ts:12`) |
  | `worker/index.ts:260` | `createClass` writes `mode: null` | G7 ("a new class starts in Guided") |
  | `src/easy/mode.ts:12,21,59` `setMode`, `applyClassMode`, `joinClassFromLink`; `src/ui/SubmitDialog.tsx:78` | typed through `Mode` | follow the type; `setMode('guided')` should also clear `viewPrefs.joints` and `outlineMode` (see 3 below) |

- **Inspector's *More…*** (`ModeOverride`, `features.ts:179`, used at `Inspector.tsx:67`) forces `'workshop'` inside a card. Guided does not mount `Inspector`.

#### 2. How the app routes today

- **`App.tsx`** (`src/App.tsx:80-141`) always renders `TopBar`, `Toolbar`, `Inspector` and `MissionPanel` (the last only when `view === '3d'`), plus:
  - `StartScreen` while `needsMaterial` (`:103`);
  - `MaterialDrawer` while `drawerOpen`;
  - the lazy `ExportDialog` while `exportOpen`;
  - `TourOverlay`.
- **Lazy parts** (`:20-23`): `Plan2D`, `ExportDialog`, `TeacherApp` and `SentenceDev` load on demand; `Plan2D` and `ExportDialog` are prefetched once the editor is up (`:53-60`). A Guided shell should be its own lazy chunk, reusing the same `Plan2D` lazy import rather than importing it eagerly. G7's final check asks for the chunk sizes.
- **The start screen.** `needsMaterial` starts `true` (`store.ts:399`). `useAutosave` (`hooks.ts:14`) calls `replaceDesign(d, false)` when a saved design loads, so only an empty browser sees the start screen.
  - The menu's *Your designs* sets `needsMaterial: true` (`TopBar.tsx:107`).
  - *New design* (`TopBar.tsx:98-106`) calls `replaceDesign(createDesign(d.material), true)` with **no confirm**: since 86 the open design stays in the library.
  - `StartScreen` (`src/ui/StartScreen.tsx`) has:
    - *Your designs* (`<Library/>`);
    - step 1, the material chips;
    - step 2, *Blank* or the **sentence** (`<Sentence>`, milestone 98; it calls `chooseMaterial` when the material changes);
    - missions only in Quick build (`:68-70`).
  - Its *Start* (`:80-93`) calls `startMission(ms, mat)` or `generate(templateById(id), mat, params)`.
  - Its test id is `material-dialog`.
- **Joining a class.** `joinClassFromLink` (`src/easy/mode.ts:49-64`) stores the class code in `localStorage['cutforge.classCode']`, calls `applyClassMode(cls.mode, cls.modeLocked)` and saves `missions` in prefs. **It does not keep the class's material** (`ClassInfo.material` exists, `api.ts:26`).
- **Prefs persistence.** `setPrefs` (`store.ts:621-637`) writes the whole `ViewPrefs` to `localStorage['cutforge.viewPrefs']`. `initialPrefs` reads it with `mode: 'workshop'` as the fallback (`:167-177`). The mode is a viewer preference and never part of the design.
- **History.** Edits go through `apply` (`store.ts:523-532`, one undo step) or `preview` + `commit` (`:533-544`). Both run `settle(…, guarded)`.
  - The ghost-and-✓ path is `pending` / `beginPending` / `confirmPending` (`:503-521`).
  - Autosave writes `designToSave()` (`store.ts:104`), which is `pending.base` while a draft waits (G1 / 92).
  - **Guided must never create `pending`.**
- **The solo (face-on) view.**
  - The store has `openSolo(panelId)` at `store.ts:596` and `closeSolo` at `:600`.
  - `App.tsx:89` renders `<Plan2D soloPanel>`, and `App.tsx:35-37` closes solo when the panel goes.
  - In 3D, a **double-click** into a board opens it face-on (milestone 104). Guided needs a single tap instead.
- **The test hook.** `window.__cutforge` (`src/main.tsx:25-35`) exposes `store`, `ops` (dev only), `issues()` and `startTemplate(id, matId)`. The e2e helper `startTemplate` is at `tests/e2e/util.ts:95`.
- **The e2e default.** `playwright.config.ts:10` gives **every** spec a `cutforge.viewPrefs` of `{mode:'workshop', …}`, so G7's new default does not break specs that do not override it.
  - `tests/e2e/quick.spec.ts:365-375` ("a new browser starts in the Workshop") clears the storage and **must be rewritten in G7**.
  - `tests/e2e/topbar.spec.ts:56-68` loops over the two modes at 8 widths.
  - `WORKSHOP_STATE` and `QUICK_STATE` are in `tests/e2e/util.ts:15-18,64-67`.
  - **The e2e server is `npx vite` (a development build).** Any switch item shown only in a development build appears in every spec, including `topbar.spec`'s overflow check at 1024 px.

#### 3. Things that leak between modes (view prefs)

- `viewPrefs.joints`: the joints view is read straight from prefs at `View3D.tsx:156-157,815`, not through a feature.
- `viewPrefs.outlineMode`: this one is gated by the `outline.mode` feature (`View3D.tsx:155-156`), but `select()` (`store.ts:568`) still reads the raw pref.
- Both can be left on from Workshop. `setMode('guided')` should clear them, as `startTour` does (`store.ts:429-430`).
- `viewPrefs.keepRatio` and `sections` are harmless.

#### 4. The feature table today (`src/easy/features.ts:12-112`)

- It has 49 rows of Quick build's states; Workshop is implied as `'show'`.
- `SECTIONS` (`:121-174`) maps every `<div className="subsection…" data-testid=…>` to a feature.
- `tests/quickTable.test.ts` checks:
  - every such section in any `.tsx` under `src/` is listed;
  - every listed section exists;
  - a section that Quick does not show asks for its feature;
  - every non-`'show'` feature is asked for somewhere;
  - the exact list of `'show'` rows.
- `tests/easymode.test.ts:24-45` checks that every feature asked for is listed, and that `featureState(f,'workshop') === 'show'` and `featureState(f,'quick') === FEATURES[f]`.
- **Any `subsection` div in `src/guided/` must be in `SECTIONS`**, or `quickTable.test.ts` fails.
- `Gate` is at `src/easy/Gate.tsx`.

#### 5. Template designs: the trap for Build (read this before 106/107)

- **A thing started from a sentence structure is a template design.**
  - `generate()` (`src/templates/registry.ts:71-79`) sets `d.template = {id, version, params}`.
  - `generateBox` (`src/templates/structures/box.ts:262-293`) sets `d.sizeAs = 'inside'` when the words say inside (the default, `box.ts:117`).
- **Anything that later regenerates the design rebuilds it from the stored `params`.** That covers:
  - `regenerate`, `changeMaterial` (`registry.ts:210`; used by the drawer, `MaterialDrawer.tsx:53`, and by `SubmitDialog`'s *Use the class's profile*, `SubmitDialog.tsx:84-90`);
  - `shrinkTemplate` (`src/easy/fix.ts:73`);
  - the settings card's template section (`TemplateUI.tsx:41-47`).
- So a box that Guided resized with `setBoxSize` and then sent to a class with another profile **would be rebuilt at its old size**.
  - Today the box card's size fields (`BoxSizeUI.tsx:21-25`) already edit template boxes directly, so the gap exists already.
  - Guided would hit it on every arrow drag.
  - **Decision needed in 106/107** (owner question 6).
- **Mission goals that read template params.**
  - `hasLid` (`src/easy/missions.ts:90`) passes when `d.template?.params.lid === 'liftoff'`, whatever the design now has.
  - `deckFits` (`:106-108`) and `angleChosen` (`:113`) read the stand's params. The stand must be changed through `regenerate`, never directly.

#### 6. What the engine gives Guided (verified exports)

| Need | Symbol | Where |
|---|---|---|
| inside sizes | `boxSize(d, trayId, as)`, `setBoxSize(d, trayId, size, as)`, `outsideFor`, `statedBoxes`, `keepingStatedSizes` | `src/model/boxSize.ts:57,86,69,24,99` |
| box of a base | `boxOfBase(d, panelId)`, `statedField`, `sizeAsOptions` | `src/ui/BoxSizeUI.tsx:10,21,16` (UI file: copy the logic, do not import UI into the model) |
| main tray, front wall, roles | `mainTray(d)`, `frontWall(d, trayId)`, `nameRoles` | `src/templates/structures/box.ts:24,29,306` |
| box recipe | `boxRecipe(d, foot, h, kind)`, `boxTray`, `dividerLine(d, base, a, b, h?)`, `holeRecipe`, `textRecipe`, `stickerRecipe` | `src/easy/recipes.ts:85,78,190,112,117,122` |
| dividers | `addDividerLine(d, baseId, a, b, height)`, `setDividerOffset(d, id, pos)`, `deletePanel` | `src/model/ops.ts:873,1010,1717` |
| | `dividerRow(d, id)`, `dividersOn(d, baseId)`, `setDividerPos`, `MIN_COMPARTMENT = 5` | `src/model/dividers.ts:491,548,537,20` |
| sizes (raw) | `setPanelSize`, `setTrayHeight` | `ops.ts:1059,537` |
| lid | `boxLid`, `setBoxLid(d, tray, choice, style?)`, `lidWhy`, `LidChoice`, `autoStyle`, `boxOfPanel` | `src/easy/lid.ts:59,142,187,36,351,97` |
| contents | `compartments`, `contentFit` (returns `need: {w,d,h}`), `bestCell`, `capacity`, `bundleSize`, `OBJECTS` (7: pencil, marker, dice, deck, phone, coin, custom) | `src/easy/objects.ts:72,140,160,129,172,16` |
| missions | `MISSIONS`, `missionById`, `startMission`, `placeContents`, `missionState` | `src/easy/missions.ts:158,211,214,229,247` |
| checks and fixes | `validate`, `blocking`, `canFix`, `fixIssue` (13 fixable keys, `FIXABLE` at `fix.ts:100`), `NOTE_KEYS` | `src/easy/fix.ts:98,101,104` |
| guard | `quickGuard`, `guardEdit`, `minTextSize`, `keepOutZones`, `GuardNote`/`GuardWhy` (`edge\|joint\|shape\|text`) | `src/easy/guard.ts:166,100,20,176,15-17` |
| why Workshop only | `workshopOnly(d, panelId)` | `src/easy/mode.ts:32` |
| text and decorations | `addText`, `setText`, `updateDetail`; `deleteDetails`, `duplicateDetails`, `moveDetails`; `FONTS`; `STICKERS`, `stickerSize` | `ops.ts:1746,1784,1800`; `src/model/edit.ts:33,18,10`; `src/text/fonts.ts:7`; `src/easy/stickers.ts:63,77` |
| assembly | `playAssembly` | `src/easy/assemble.ts:30` |
| sheet use | `sheetUse` | `src/easy/sheet.ts:8` |
| use less board | `lessBoard()`, `YieldBar` (gated by `saveBoard`, `saveBoard.steps`, `yield`) | `src/ui/SplitUI.tsx:162,44` |
| thumbnails | `renderThumbnail(d, w, h)` | `src/views/thumbnail.ts:10` |
| camera | `requestCamera(pos, target)` (the stage registers at `View3D.tsx:546`) | `src/tour/stage.ts:32` |
| pictures | `PictureChoice`, `Pic`, `PICS` (lid, foot and carton-end pictures; **no pictures of the objects**) | `src/ui/Pictures.tsx:18,114` |
| templates | `TEMPLATES` (organiser, stand, box, tray, carton, sleeve), `STRUCTURES()`, `templateById`, `defaults`, `generate`, `regenerate`, `changeMaterial`, `makes(t, m)` | `registry.ts:18,20,23,26,71,89,210`; `types.ts:75` |
| resolver | `choose`, `chooseMaterial`, `rangeNow`, `optionsNow`, `shownNow` | `src/sentence/resolve.ts:121,161,43,37,31` |
| network | `api.classInfo`, `api.submit`, `deviceId` | `src/net/api.ts:30-31,52` |

Not exported, but named in the plan:
- `DividerSlide` (`View3D.tsx:2306`), `ContentsView` (`:1208`), `EdgeHandle` (`:1028`), `GuardOverlay` (`:1246`). They are private to `View3D.tsx`.
- `PushPull` (`src/views/widgets.tsx:234`) and `DimLabel` (`:439`, which has `onCommit`) **are** exported.
- `shrinkToSheet` (`fix.ts:25`) is private.
- `lidChoices` does not exist under that name: the 79 generator is `lidStyleWhy` / `autoStyle` in `lid.ts`.

#### 7. Facts from the scratch run (`generate`, `startMission`, `validate` on the 4 built-in materials `card-0.5`, `corr-1.6`, `corr-4`, `ply-3`)

- **Plain things.** `box`, `box` + `lid: 'liftoff'` and `box` + `shape: 'round'` at 120 × 80 × 45 inside are clean (no blocking issue) in all 4 materials. `carton` (default words) is clean in card and corr-1.6, and is not made in corr-4 or ply-3 (`carton.canMake = folds(m, 2)`).
- **A round box's stated width and depth are outside.** `generateBox` calls `setBoxSize` with height only for round shapes (`box.ts:270-271`). The inside of the 120 × 80 round box reads about 114 × 74 on ply-3.
- **The lift-off lid's automatic kind differs by material.** It is one tray (a Flat lid) on ply-3 and two trays (a cap) on card and corrugated.
- **A carton's tuck top reports `boxLid(...).kind === 'hinged'`.**
- **The two organiser missions have no tray** (`mainTray` is null): Pencil box and Game organiser start from the `organiser` template, so `boxSize`/`setBoxSize` do not apply to them. Rebuilding them as recipes (G3) is required for Build's arrows.
- **Pencil box at the start (ply-3).**
  - Goals met: `compartments-3`, `one-sheet`, `ready`.
  - Pencils `need.d = 14.2` (it matches the plan's "14.2 mm deeper").
  - Game organiser meets `fits-deck`, `one-sheet`, `ready`, with 2 spaces.
  - The dice tray (hexagonal `boxRecipe`) needs `d = 15.4` for its dice.
  - Escape box (ply-3): `one-sheet`, `ready`.
- **Spaces.** A box divided 3 × 2 by the sentence gives `compartments(...) = 6` in every material, so dividers ending on dividers are counted correctly.


#### 105 The mode and the shell (Guided G2)

- **Depends on / unblocks**
  - Needs 92 (done). It must come before 106–110: every later piece lives in the shell.
  - It does not need 93–104 functionally, but must respect what they added: the `size.as`, `edit2d`, `transform.sides` and `outline.mode` rows, and the lazy `Plan2D`.
- **Already in the code**
  - `Mode`, `FeatureState`, `FEATURES`, `SECTIONS`, `ModeOverride`, `useMode`, `useFeature`, `featureState`, `shown`: `src/easy/features.ts:9,10,12,121,179,182,188,193,198`.
  - `Gate`: `src/easy/Gate.tsx:5`.
  - `setMode`, `applyClassMode`: `src/easy/mode.ts:10,19`.
  - `ViewPrefs.mode` / `modeLocked`: `store.ts:147,149`. `guarded`: `store.ts:115`.
  - Lazy imports: `App.tsx:20-23`.
  - The `.seg` style: `src/styles.css:144-145`. Its buttons are only 28 px tall, below the 44 px rule.
  - `Segmented`: `src/ui/NumField.tsx:166`.
  - `requestCamera` and `TOUR_CAMERA` for a set view: `src/tour/stage.ts:32,38`.
  - OrbitControls: `View3D.tsx:822` (`<OrbitControls makeDefault enableDamping={false} />`; pans by default).
- **Stale in the plan**
  - *"Confirm. Start something new asks in an in-app dialog, not `window.confirm`"* (§1.3 too): *New design* no longer confirms at all (`TopBar.tsx:98-106`, milestone 86 keeps the open design in the library). The only remaining `confirm()` calls are `startTourConfirmed` (the tour is off), `Plan2D.tsx:798` (*Repack*, hidden in Guided by `plan.edit`) and `TeacherApp.tsx:160,418`.
    - **Use instead:** no confirm for *Start something new*. G3's *Keep working on …* is the way back. Build `Confirm.tsx` only if some Guided action still needs one (none found).
  - *"A second table gives Guided's; a feature it does not list takes Quick build's"* conflicts with ROADMAP §5 rule 4b ("every new feature row says its state in Guided, Quick build and Workshop") and §5.2 #9.
    - **Use instead:** a full Guided column the compiler checks: `export const GUIDED = {…} as const satisfies Record<Feature, FeatureState>`.
  - *`stage.dock` hides "the view buttons and settings"*: §3.2 still wants *Look around*, *From above* and zoom.
    - **Use instead:** hide the Workshop dock (`View3D.tsx:2899-2944`: ortho, fit, joints, outline mode, assemble, view settings, `MaterialLegend`) and let Guided render its own view buttons.
  - *"`View3D` mounts an empty `GuidedLayer`"*: if `View3D` imports from `src/guided/`, that breaks §5's rule "Nothing in `src/guided/` is imported by Workshop or Quick build components".
    - **Use instead:** a slot, `View3D({ layer?: ReactNode })`, rendered inside `<Scene>`. `GuidedApp` passes `<GuidedLayer/>`, and `View3D` never imports `src/guided`.
  - *"shows it only in a development build"*: Playwright runs the Vite dev server (`playwright.config.ts:20`), so a third switch item would appear in every existing spec and in `topbar.spec`'s fit check.
    - **Use instead:** gate on an explicit flag (`?guided` once, saved in prefs as `guidedPreview: true`, or `localStorage['cutforge.guided']`) rather than `import.meta.env.DEV`.
  - The plan's file list includes `src/net/api.ts` (only `ClassMode` changes) and `worker/index.ts` (one line, `:277`). Both are correct.
- **Steps**
  1. **Grow the type.**
     - `features.ts:9` becomes `export type Mode = 'guided' | 'quick' | 'workshop'`.
     - `store.ts:147` and `api.ts:25` use `Mode` (import the type) instead of their own literals.
     - `TeacherApp.tsx:231` uses `Mode | ''`.
  2. **Rewrite the feature functions.**
     - `featureState(f, mode)` returns `mode === 'workshop' ? 'show' : mode === 'guided' ? GUIDED[f] : FEATURES[f]`. `useFeature` does the same through `useMode()`.
     - Add `keepsCuttable(mode) = mode !== 'workshop'` and `isGuided`, so the remaining mode checks live in one file.
     - Use the helper at `store.ts:116`, `View3D.tsx:171-172` (`locked`) and `View3D.tsx:814` (`GuardOverlay`).
     - Widen `stageHintKey` (`View3D.tsx:2798`).
  3. **Keys** (`src/store/hooks.ts`):
     - `:134` runs Workshop keys only when `shown(featureState('keys.tools'))` (Quick 'hide' stays covered by `:127`; Guided 'hide').
     - `:98-115` (copy, paste, duplicate): skip in Guided (new row `keys.clipboard`, Guided 'hide').
     - `:116` Delete: in Guided delete only a selected detail or a divider panel (`isDivider`).
     - The `o` key in `View3D.tsx:2826-2834` is harmless.
  4. **`setMode`** (`mode.ts:10`): when `m === 'guided'`, also clear `joints`, `outlineMode`, `editOutline`, `edit2d` and `sel2d`, call `closeSolo()`, and set the tool to `'select'`.
     - Add a store field `guidedStep: 'build' | 'decorate' | 'send'`. It is view state (not `ViewPrefs`, not saved, not in history), reset to `'build'` by `replaceDesign`.
     - Add `setGuidedStep(s)`, which also sets `selection: null`, closes solo and clears `edit2d`.
  5. **The shell, in `App.tsx`.**
     - `const guided = useMode() === 'guided'`.
     - When guided, render a lazy `GuidedApp` (new `src/guided/GuidedApp.tsx`) **instead of** `TopBar` (`:82`), `Toolbar` (`:92`), `Inspector` (`:93`) and `MissionPanel` (`:94`).
     - Keep `EditorBoundary`, the viewport (`View3D` with `layer`, or lazy `Plan2D`), `other-tab`, the `ExportDialog` slot and `TourOverlay`.
     - Keep `StartScreen` for now: G3 swaps in `GuidedStart`.
     - `MaterialDrawer` is not reachable from Guided.
  6. **New files in `src/guided/`:**
     - `GuidedApp.tsx` (layout of §3.2, RTL swap of the sheet and the mission card; the stage keeps `dir="ltr"` as `View3D.tsx:2880` already does);
     - `GuidedTopBar.tsx` (home, name, stepper as `.seg` with a 44 px override, Undo and Redo with words, menu);
     - `SideSheet.tsx` (empty for now: the thing's name and inside sizes);
     - `AddBar.tsx` (empty);
     - `GuidedLayer.tsx` (an empty R3F group);
     - the menu: *Start something new* (`replaceDesign(createDesign(d.material), true)`), *Open a saved file*, *Save a copy*, the language, *More tools (Quick build)*, *All tools (Workshop)*, *Teacher view*.
     - Reuse `TopBar`'s file open: `parseProjectFile`, `projectNamed`, `storeDesign` (`TopBar.tsx:53-67`). Moving `open` into a shared helper in `src/ui/` is better than copying it.
  7. **The stage in Guided**, through the new rows below:
     - wrap the mounts at `View3D.tsx:760-801,1014` (`GrowGhost`/`EdgeHandle`, `PanelWidgets`, `DividerButton`, `HingeWidget`, `DividerSlide`, `GroupGizmo`, `PlacedGizmo`/`FloorGizmo`, `ShapeGizmo`, `ThroughEdit`), the dock (`:2899-2944`), `FoldBar` (`:2784`) and the hint (`:2946-2950`);
     - set `OrbitControls`' `enablePan={shown(useFeature('stage.pan'))}`.
  8. **The opening view.** In Guided, on design load and when `boxSize` changes, call `requestCamera` with a pose about 50° up, framed on `designBox` (`View3D.tsx:2611`, private: export it or compute the frame in `GuidedApp`).
  9. **The Worker.** `worker/index.ts:277` accepts `'guided'`. Update the comment at `worker/schema.ts:11`. No migration.
  10. **The switch.** `TopBar.tsx:177,227`: add `'guided'` only when the preview flag is set. Use a label map: `{guided:'mode.guided', quick:'mode.quick', workshop:'mode.workshop'}`.
  11. **`SECTIONS`.** If the side sheet uses `className="subsection…"` divs, list each one, for example `'g-thing': null`.
  - Schema: **no bump** (§4 *Engine*).
- **Feature-table rows** (new; each has all three states)

  | Row | Guided | Quick build | Workshop |
  |---|---|---|---|
  | `stage.edges` (`EdgeHandle`, `View3D.tsx:1014`) | hide | show | show |
  | `stage.panelWidgets` (`:762`) | hide | show | show |
  | `stage.floorGizmo` (`:797`) | hide | show | show |
  | `stage.placedGizmo` (`:793`) | hide | show | show |
  | `stage.dividerButton` (`:771`) | hide | show | show |
  | `stage.dividerSlide` (`:787`; Guided has its own grips in 107) | hide | show | show |
  | `stage.shapeGizmo` (`:801-803`, with `ThroughEdit`) | hide | show | show |
  | `stage.dock` (`:2899-2944`) | hide | show | show |
  | `stage.foldBar` (`:2784`) | hide | show | show |
  | `stage.hint` (`:2946`) | hide | show | show |
  | `stage.pan` (OrbitControls pan) | hide | show | show |
  | `keys.tools` (`hooks.ts:134`) | hide | hide | show |
  | `keys.clipboard` (`hooks.ts:98-115`) | hide | show | show |
  | `plan.edit` (piece drag `Plan2D.tsx:609`, *Repack* `:801`) | hide | show | show |

  The Guided column for the 49 existing rows (my recommendation; G4–G6 refine it):
  - **`'hide'`** for every Workshop-only control and everything Guided replaces:
    - the rail: `rail.*`, `op.scoreAdd`;
    - settings and material: `settings.snapping`, `settings.material`, `drawer`, `sizes`;
    - editing: `grow.advanced`, `edit2d`, `transform.sides`, `outline.mode`, `outline`, `curves`, `foldover`;
    - trays: `tray.ownHeight`, `tray.wallIt`, `tray.keepWhole`, `tray.ends`;
    - placement: `gizmo`, `arrays`, `align`, `copies`;
    - views and checks: `foldSlider`, `exportCheck`, `viewSettings`, `boardMaterial`, `construction`, `hints`;
    - joints and folds: `edgeFlap`, `match`, `yield`, `saveBoard.steps`.
  - **`'auto'`** for:
    - joints and lids: `joints`, `tray.joints`, `lid.advanced`, `crease`, `hinge`, `bend`;
    - the rest: `tray.corners`, `split`, `export.kerf`, `export.annotations`, `size.as` (Guided always reads `'inside'`).
  - **`'show'`** for `lid`, `saveBoard`, `export.spec`, `joints.noGlue` and `settings.joints` (the last two only under *More about this box*), and `cutplan` (`'readonly'` would be truer with `plan.edit` hidden).
- **Words** (en and he; `g.*`)
  - `mode.guided`, `mode.guidedHelp`: keep them under `mode.*` beside the existing `mode.quick`/`mode.workshop` (`en.ts:811-814`).
  - `g.step.build`, `g.step.decorate`, `g.step.send`, `g.step.label` (the stepper's aria-label).
  - `g.undo`, `g.redo` (Undo and Redo with words), `g.home`, `g.menu`.
  - `g.menu.new`, `g.menu.open`, `g.menu.saveCopy`, `g.menu.quick`, `g.menu.workshop`, `g.menu.teacher`.
  - `g.view.around`, `g.view.above`, `g.view.zoomIn`, `g.view.zoomOut`.
  - `g.sheet.inside` (*Inside*), `g.sheet.spaces` (*{n} spaces*), `g.sheet.lid` (*Lid: {kind}*).
  - `tests/i18n.test.ts` already enforces Hebrew parity and that every `t('…')` key exists.
- **Tests**
  - `tests/easymode.test.ts`:
    - three mode ids;
    - `featureState(f,'workshop') === 'show'` and `featureState(f,'quick') === FEATURES[f]` unchanged; add `featureState(f,'guided') === GUIDED[f]`;
    - switching to and from `'guided'` leaves `design` (JSON) and `past.length` unchanged (extend `:48-62`);
    - `setMode('guided')` clears `joints` and `outlineMode`;
    - `applyClassMode('guided', true)` blocks `setMode('quick')`;
    - `guarded`: in Guided, a shape pushed into a wall's keep-out is moved back, as in Quick (`tests/guard.test.ts` has the Quick case to copy).
  - `tests/quickTable.test.ts`: the same checks for the Guided column (every non-`'show'` Guided row is asked for; a section Guided hides asks for its feature); a snapshot of Guided's `'show'` list.
  - New `tests/guidedwords.test.ts`, as in the plan: keys under `src/guided/` start with `g.` or an allowed shared prefix (`obj.`, `mission.`, `goal.`, `mat.`, `sticker.`, `lid.kind.`, `mode.`, `unit.`), and the banned-word list applies to English `g.*`.
  - `worker/api.test.ts`: PATCH a class to `'guided'` and read it back through `/api/class/:code` (the route is at `worker/index.ts:185`).
  - Keys: in Guided, `b` and `p` do not change the tool, and Ctrl+V does not set `pending`.
  - E2E: none in this milestone (§5 rules: only G6 adds `guided.spec.ts`).
  - Goldens: untouched (no engine change).
- **Done when**
  - With the preview flag set, Guided can be chosen. On a design with a box: Guided's top bar with three steps, no rail, no Inspector, no Workshop dock, no edge or gizmo handles, the box seen from about 50° up, and nothing pans.
  - Quick build and Workshop look and behave as before.
  - `npm run typecheck` and `npm test` are green; goldens are byte-identical.
- **Risks and owner questions**
  - Hiding stage widgets one by one is easy to get incomplete. A Guided-only e2e snapshot of the stage's test ids in G6 is the backstop.
  - The guard in Guided means `quickGuard` replaces `solve`+`autoConnect` for every Guided edit, as in Quick. Check that the Guided box ops (107) never rely on `autoConnect` adding joints.
  - Owner question: the preview flag mechanism (owner question 7).
- **Size** — **M**. The plumbing touches about 12 files, the shell is new but empty, and the table needs a careful 63-row Guided column.


#### 106 Things and the gallery (Guided G3)

- **Depends on / unblocks**
  - Needs 105 (shell, mode) and 95–96 (the structures: done).
  - Unblocks 107: the version-2 missions are tray boxes; without them Pencil box and Game organiser have no `boxSize`.
- **Already in the code**
  - Structures: `box`, `tray` (`src/templates/structures/box.ts:330,345`; box params at `:109-206`, default `sizeAs: 'inside'` at `:117`, `lid` options at `:133-149`, shapes `rect|rounded|round|poly` at `:21`) and `carton`, `sleeve` (`src/templates/structures/carton.ts:89,140`; `canMake = folds(m, 2)`, `fallback 'box'` with `fallbackWords {lid:'liftoff'}`).
  - Template functions: `generate`, `defaults`, `templateById`, `makes`, `chooseMaterial`, as in the table above.
  - Missions: `MISSIONS` (`missions.ts:158-210`: pencil-box and game-organiser on the `organiser` template at `:165,195`; dice-tray, escape-box and card-stand otherwise), `startMission` (`:214`), `placeContents` (`:229`).
  - The thumbnail cache pattern: `StartScreen.tsx:20-28` (`missionThumb`, keyed `mission:${id}:${m.id}`).
  - `Library` (*Your designs*): `src/ui/Library.tsx:20`; `listDesigns`: `src/store/persist.ts:112` (`DesignMeta` has `thumb`, `updatedAt`); `openFromLibrary`: `Library.tsx:14`.
  - `joinClassFromLink`: `mode.ts:49-64`. `ClassInfo.material`: `api.ts:26`. The teacher's mission fieldset: `TeacherApp.tsx:191-222`; the mode select: `:224-254`.
  - Worker: the missions list accepts any string ≤ 40 chars, at most 50 (`worker/index.ts:280`). **Plain-thing ids are already accepted.**
  - `cartonWhy` (the *greyed with reason* key `quick.kind.cartonNo`): `src/easy/actions.ts:41`.
  - `MaterialArt`: `src/ui/MaterialArt.tsx`.
- **Stale in the plan**
  - *`things.ts` … `carton` listed only where the structure's `materials(m)` allows it*: there is no `materials(m)`.
    - **Use instead:** `makes(templateById('carton')!, m)` (`types.ts:75`, through `canMake`). It also turns down corr-4, not only plywood (scratch run).
  - *§3.1 "Carton is greyed on plywood with today's reason"* against the G3 bullet "listed only where allowed" and the test "not offered on plywood". ROADMAP §5.2 #6 hides things only in the sentence and the template card and greys them elsewhere. The gallery is "elsewhere".
    - **Recommended:** grey with the reason (`quick.kind.cartonNo` or a `g.` wording). Test "not startable on plywood". Owner question 3.
  - *Plain thing sizes `120 × 80 × 45 mm inside`*: for `round-box` the structure applies only the height (`box.ts:270-271`). A round box's width and depth are outside, so its inside is smaller (about 114 × 74 on ply-3).
    - **Use instead:** give `round-box` equal width and depth (for example 100 × 100) and do not assert its inside width and depth.
  - *"Each plain thing is `boxRecipe` with a footprint, a kind and a starting size"* (§3.1): superseded by §5.2 #3. Plain things are structures through `generate` with set words, as the merged G3 bullet says.
  - *"The class's list. Check that the Worker's validation of that list accepts them"*: verified, it does (`worker/index.ts:280`). No Worker change is needed.
  - *"Missions as recipes … `addDividerLine` for each divider"*: use `dividerLine` (`recipes.ts:190`). It is what the structures use, and it ends dividers at the walls and finds the height. `addDividerLine` (`ops.ts:873`) needs an explicit height.
  - *"*Start something new* … shows the gallery with *Keep working on …*"*: *Your designs* already exists on `StartScreen` (`<Library/>`, `StartScreen.tsx:110`). The plan's later sentence (the newest three, then *All my designs*) is the current intent.
  - *Teacher's words "Students stay in this level" (`modeLocked`)*: the current key is `class.modeLocked` = "Students cannot switch" (`en.ts:851`). Reword it, or add a key; do not add a field.
  - **New since the plan: the Escape box** (milestone 82). It has goal `padlock` (`missions.ts:131-137`), which needs hasps, and §4 says hasps are not offered in Guided. As a gallery card it **cannot be finished in Guided**. Owner question 2.
- **Steps**
  1. **`src/guided/things.ts`**: `type Thing = { id; title: MsgKey; blurb: MsgKey; mission?: string; template?: string; words?: Params; can(m): boolean; start(m): Design }`.
     - Missions: `MISSIONS.filter(guidedOk)` with `start = startMission(ms, m)` and `can = ms.materials.includes(m.kind)`.
     - Plain things, each `generate(templateById(id), m, {...defaults(t), ...words})`:
       - `box`: `{id:'box', width:120, depth:80, height:45, sizeAs:'inside'}`;
       - `box-lid`: the same plus `lid:'liftoff'`;
       - `round-box`: `shape:'round'`, width and depth 100;
       - `carton`: `carton` with its defaults, `can = makes(carton, m)`.
     - It holds only words: no recipe.
  2. **Template designs** (cross-cutting fact 5): decide here whether a plain thing stays a template.
     - **Recommended:** `start` deletes `d.template` for `box`/`tray`/`carton` things right after `generate`, keeping `d.sizeAs = 'inside'` and the stable `t:` ids. Build then edits a plain box, and nothing rebuilds it from stale params.
     - The cost: Quick build later shows the box card, not the sentence's template card, for these designs.
  3. **Missions version 2** (`src/easy/missions.ts`): `pencil-box` and `game-organiser` get `version: 2`, drop `template` and gain `start(d)`:
     - `boxRecipe(d, rect, H)`;
     - `setBoxSize(d, mainTray(d), {w, d, h}, 'inside')` with `d.sizeAs = 'inside'` (the v1 template used `sizeMode: 'inner'`);
     - `dividerLine(...)` at the v1 positions;
     - for game-organiser, `lid: 'none'` (v1).
     - Match the v1 inside and spaces: Pencil 186 × 60 × 30 with two dividers making 3 spaces across the depth (`dividersY: 2`, 24 mm tall); Organiser 200 × 140 × 50 with one divider (`dividersX: 1`, 40 mm).
     - Divider height: `dividerLine`'s fallback height is 40 (`recipes.ts:190`); check how it picks a height on a box with walls and pass 24 and 40 where it allows (unverified).
     - `missionState` (`missions.ts:247`) ignores `version` and looks goals up by id, so saved v1 designs keep counting.
     - Rewrite the reference solutions in `tests/missions.test.ts:38-70` with `setDividerOffset`, `dividerLine`/`addDividerLine` and `setBoxLid`, not `regenerate`.
  4. **`src/guided/GuidedStart.tsx`** (§3.1):
     - a heading;
     - the material line (*Your class cuts in …*) or four chips (last choice in prefs: new `ViewPrefs.guidedMaterial?: string`);
     - the cards (thumbnail via `renderThumbnail`, cached by `thing:${id}:${m.id}`, as at `StartScreen.tsx:20-28`);
     - under them, *Open a saved file* and *Start with more tools* (`setMode('quick')`, shown when not locked).
     - Coming back: the newest three from `listDesigns()` first, then *All my designs* (render `<Library/>`).
     - `App.tsx` renders `GuidedStart` instead of `StartScreen` when `needsMaterial && guided`. Keep `data-testid="material-dialog"` or give it a new id plus a shared helper in `tests/e2e/util.ts`.
  5. **The class's material**: `joinClassFromLink` (`mode.ts:60`) also saves `classMaterial: cls.material ?? undefined` in `ViewPrefs` (new optional field). `GuidedStart` uses it and hides the chips. `SubmitDialog`'s check stays as it is.
  6. **The class's list**: the `missions` pref filters missions **and** things.
     - Backward-compatible rule: a list with no plain-thing id offers every plain thing (existing classes keep showing *Box* etc.).
     - `TeacherApp.tsx:191-222`: a second group of checkboxes for things. Ticking *all* off writes `[...MISSIONS ids, ...THING ids]`; today `:199` writes only mission ids.
  7. **Teacher words**: `TeacherApp.tsx:236-239` gains `<option value="guided">`. The label *Students start in* (`class.mode`) exists; `class.modeLocked` is reworded to *Students stay in this level*; the fieldset legend becomes *Things offered* (new key, or reword `class.missions`).
  8. **Escape box**: per owner question 2, either filter it out of the Guided gallery (`Mission.levels?: Mode[]`, or a `GUIDED_MISSIONS` list in `things.ts`) or offer it with *Open with more tools*.
- **Feature-table rows**
  - None needed for the gallery: it is Guided-only and not a card section.
  - If its rows use `className="subsection"`, add `SECTIONS` entries such as `'g-material': null`.
- **Words** (en and he)
  - `g.start.title` (*What do you want to make?*), `g.start.classMaterial` (*Your class cuts in {material}*).
  - `g.start.more` (*Start with more tools*), `g.start.open` (*Open a saved file*), `g.start.keep` (*Keep working on {name}*), `g.start.all` (*All my designs*).
  - `g.thing.box`, `g.thing.box.blurb`, `g.thing.boxLid`, `g.thing.boxLid.blurb`, `g.thing.round`, `g.thing.round.blurb`, `g.thing.carton`, `g.thing.carton.blurb`, `g.thing.cartonNo` (if greyed).
  - `class.thingsOffered`; `mode.guided` (from 105).
  - The rewording of `class.modeLocked` in both catalogs.
- **Tests**
  - New `tests/guidedthings.test.ts`:
    - every thing's `start(m)` has no blocking issue in every material where `can(m)`; the scratch run shows this holds for the four plain things;
    - a class list of one mission gives that mission's card plus, under the backward-compatible rule, the plain things; a list with one mission and one thing gives two cards;
    - `classMaterial` is the material of the design that starts;
    - `carton.can(ply-3)` and `can(corr-4)` are false;
    - each v2 mission starts with **exactly** the goals v1 started with (scratch run: pencil `compartments-3, one-sheet, ready`; organiser `fits-deck, one-sheet, ready`) and has a tray (`mainTray !== null`).
  - `tests/missions.test.ts`: reference solutions rewritten; `:95-97` (ids) unchanged; add *a saved v1 Pencil box (the organiser template) still opens, and its goals count*.
  - `tests/templates.test.ts`: unchanged (the organiser template stays).
  - Quick build: Pencil box now starts as a box with the *Lid* section, not the template form.
    - `tests/e2e/quick*.spec.ts` and `templates.spec.ts` may refer to the template card on missions (unverified). Grep `mission-pencil-box` in `tests/e2e/` before committing.
  - Goldens: untouched, unless `tests/goldenDesigns.ts` starts a mission (unverified; grep `startMission` there).
- **Done when**
  - In Guided with no saved design, the gallery shows the missions and the plain things in English and Hebrew; one tap starts the Pencil box (a tray box with three spaces and pencils).
  - A class link with a profile starts in that material with no chips.
  - The teacher can choose *Guided*, lock it, and tick things.
  - Quick build's start screen is unchanged apart from the v2 missions.
- **Risks and owner questions**
  - The v2 missions change Quick build's starting design for two missions (§4 "My calls"). The owner must confirm.
  - Matching the v1 divider heights with `dividerLine`'s automatic height (unverified).
  - The `missions` list semantics for existing classes.
  - Escape box. Carton greyed or hidden. Detaching templates.
- **Size** — **M/L**. A new screen, two missions rebuilt with their tests, teacher UI, and class material in prefs.


#### 107 Build (Guided G4)

- **Depends on / unblocks**
  - Needs 105 (shell, `GuidedLayer` slot, rows), 106 (things; v2 missions as tray boxes) and 93 (`boxSize`/`setBoxSize`: done).
  - Unblocks 110's *between levels* note (`kindOf`).
  - The largest milestone.
- **Already in the code**
  - Sizes: `boxSize`/`setBoxSize`/`outsideFor` (`boxSize.ts:57,86,69`). `setBoxSize` already grows the base **from its own origin**, so dividers keep their distance from the left and front (`boxSize.ts:81-85`; tested in `tests/sizeIntent.test.ts`, milestone 93).
  - Dividers: `setDividerOffset`, `dividerRow`, `dividersOn`, `deletePanel`, `dividerLine`/`addDividerLine`, `planDividerLine` (`recipes.ts:176`).
  - Spaces: `compartments` (correct for dividers that end on dividers: 6 for a 3 × 2 box in all materials, scratch run), `contentFit().need`, `bestCell`, `capacity`, `bundleSize`, `OBJECTS`.
  - Lid: `boxLid`, `setBoxLid`, `lidWhy`, `LidChoice = 'none'|'liftoff'|'hinged'|'arched'` (`lid.ts:36`).
    - `LidSection` (`src/ui/LidUI.tsx:28-131`) **also renders the Cap/Flat/Drop-in style row (`:77-86`), the cap rim and padlock hasps (`:95-106`)**, with no feature gate on the style row or hasps.
    - `CartonBottom`: `LidUI.tsx:134`. `PictureChoice`: `Pictures.tsx:18`.
  - Stage widgets: `PushPull` (`widgets.tsx:234`), `DimLabel` with `onCommit` (`widgets.tsx:439`). `DividerSlide` (`View3D.tsx:2306`) and `ContentsView` (`:1208`, the drag of a lot to another space) are **private** to `View3D.tsx`.
  - Template controls: `choose` (`resolve.ts:121`) with `regenerate`, as `TemplateUI.tsx:41-47` does (milestone 99). `ParamRules`/`ParamDef` with `when`, `allowed`, `why`, `affects` (`types.ts:15-35`). The stand's keys: `cardWidth`, `cardThickness`, `angle`, `slots`, `baseDepth` (`missions.ts:185`).
  - Guard: `quickGuard` (through `guarded`, once 105 enables it for Guided).
  - Fix too big: `fixIssue` with `val.tooBig` (`fix.ts:104,125`).
  - Fuzzer: `tests/fuzz/quick.test.ts` (`FUZZ_N`, `STRICT`, `:19,179`).
- **Stale in the plan**
  - *`setInsideSize` … "then every divider keeps its distance from the side that did not move"*: §5.2 #2 puts that in `setBoxSize`, and it is there (growth from the base's origin).
    - **Use instead:** `setInsideSize = (d, s) => setBoxSize(d, mainTray(d), s, 'inside')`, with nothing more. Moving the dividers is only *Make it fit*'s extra.
  - *Test "`setInsideSize` equals `setPanelSize` + `setTrayHeight`"*: that is `setBoxSize`'s own composition (`boxSize.ts:90-91`).
    - **Use instead:** assert `boxSize(d, tr, 'inside')` round-trips, and that a divider's distance from the left side is unchanged.
  - *"Before building on them, check … `setPanelSize` on dividers, and `compartments()` when a divider ends on another divider"*: both checked. Milestone 93 tested the first; the scratch run checked the second (3 × 2 gives 6).
    - **Still to check:** an *odd* divider ending on another's side across a non-equal split.
  - *"Template sizes as controls. `TemplateDef` params get an optional `guided: { label, picture?, hide? }`"*: since 94 there is a `ParamRules` contract, and the card goes through `choose`.
    - **Use instead:** a Guided-side map, `src/guided/templateControls.ts` (`{ stand: { cardWidth: {label:'g.stand.cardWidth', pic}, … } }`), driving sliders that call `choose` then `regenerate`. Nothing goes in `src/templates`.
    - If the type is extended anyway, put `guided?` on `ParamRules` (`types.ts:15`).
  - *"The organiser shows width, depth, height and its two counts"*: after 106 the organiser is reached only by a saved v1 design. Keep it, as `'template'`.
  - *`kindOf` → `'template'` for "the stand, the organiser, a version-1 mission"*: since 95 **every plain thing is a template design too** (`d.template.id` is `box`, `tray` or `carton`; cross-cutting fact 5).
    - **Use instead:** `kindOf` is `'box'` when `d.template` is absent or is one of the structures `box`/`tray`/`carton`, there is exactly one stated box (`statedBoxes`, `boxSize.ts:24`; lid trays excluded), and every other panel is a wall, a divider or a lid part of it. It is `'template'` only for `stand` and `organiser`, and `'more'` otherwise.
    - Pair this with 106's detach decision.
  - *`LidUI.tsx` reused for "the *Lid* section's pictures"*: `LidSection` shows the style row and hasps, which §4 says Guided never shows (*Automatic*, no hasps).
    - **Use instead:** add rows `lid.style` and `lid.locks` (Guided 'hide') and gate `LidUI.tsx:77-86` and `:95-106` with them, or build a small Guided picker on `PictureChoice` + `lidWhy` + `setBoxLid(d, tray, choice)`, which leaves the style automatic.
  - *"A lid follows the box through a resize"*: check it on both lid kinds that *Automatic* gives. The scratch run shows a ply-3 lift-off is one tray (Flat) and a card one is two trays (cap).
  - *`fitContent(d, contentId)` "grows the inside by it"*: through `setBoxSize` per §5.2 #8, which is consistent. The plan's "moves every divider beyond that space by the same amount" is additional work over `setBoxSize` and is correct to keep.
- **Steps**
  1. **`src/guided/box.ts`** (pure; no React):
     - `kindOf(d)` as above;
     - `trayOf(d)`;
     - `insideSize(d) = boxSize(d, tr, 'inside')`;
     - `setInsideSize(d, s)`;
     - `spaces(d) = compartments(d, baseId)`;
     - `splitSpace(d, space, dir)`: a line through the middle of the compartment rectangle from wall/divider to wall/divider (`dividerLine` with points 1 mm inside, as `box.ts:251-257` does), as tall as the existing dividers (`dividersOn` → `dividerRow(...)` and the panel's `h`) or `dividerLine`'s default; refuse when either half is under 20 mm (a new `GUIDED_MIN_SPACE = 20`; `MIN_COMPARTMENT` is only 5);
     - `moveDivider(d, id, pos)` → `setDividerOffset`;
     - `removeDivider` → `deletePanel` (dividers only);
     - `lid(d)` → `boxLid`;
     - `setLid(d, choice)` → `setBoxLid(d, tr, choice)`, with no style argument;
     - `lidWhy`.
     - A `'template'` thing: `setParam(d, key, v)` → `choose` + `regenerate` (copy `TemplateUI.tsx:34-55`).
  2. **`src/guided/fit.ts`**: `fitContent(d, contentId): Design | null`.
     - Read `contentFit(d, c).need` and `cell`.
     - For a rectangle, grow the inside by `need.w`/`need.d`/`need.h` with `setBoxSize`, then shift every divider whose row position lies beyond the cell's far edge by the same amount (`dividerRow(d,id).pos` + `setDividerOffset`), so the other spaces keep their sizes.
     - For a non-rectangle (the dice tray is hexagonal), scale by a factor until `contentFit().ok` (≤ 6 tries).
     - Return null when `validate` gives `val.tooBig`/`val.tooBigGrain` after the grow.
     - Idempotent: a second call on a fitting lot changes nothing.
  3. **`GuidedLayer.tsx`** (inside `View3D` through the slot):
     - **Arrows**: three handles (`PushPull`-style) on the right side, the front side and the rim, positioned from the base frame. On drag, show an outline and a `DimLabel`; on release, one `apply(setInsideSize)`.
     - If `val.tooBig` appears, bisect back (≤ 6 tries) to the largest size that fits and set a note.
     - `DimLabel onCommit` takes a typed number.
     - **Grips**: one per divider. Either export `DividerSlide` from `View3D.tsx` (and accept that `src/guided` imports `src/views`, which the rule allows) or factor its snapping into `src/views/dividerSlide.ts`. One `preview`/`commit` per drag.
     - **Space taps**: a pick on the base's floor inside a compartment sets a Guided selection (new store field `guidedSpace: {baseId, index} | null`; view state). This needs the Scene's pointer handlers not to select the base first. Check `Scene`'s `onPointerDown` paths (`View3D.tsx:~600-750`, unverified range).
     - **Contents**: `ContentsView` already draws lots and drags them, because it is mounted in `Scene` (`:804`), and it stays in Guided. Show fit colours green or amber per lot.
  4. **`steps/Build.tsx`**:
     - The side sheet: the thing's name; *Inside W × D × H*; spaces; the lid; for a selected space its size, **+** (two pictures, *side to side* and *front to back*, only when both halves would be ≥ 20 mm) and its contents.
     - The *More about this box* fold: today's `settings.joints` lists and `joints.noGlue`. Reuse the components from `DesignSettings.tsx` if they can be extracted (unverified effort).
     - The add bar: *Divider* (split the selected space, or the largest), *Lid*, *What goes inside*.
     - *What goes inside*: the 7 objects **as pictures** (none exist: add SVGs to `Pictures.tsx` `PICS` or to a Guided file), the count, *fits* or *needs {n} mm more*, *Make it fit*, *Remove*.
     - A `'more'` design: the note *Made with more tools …* and a button to `setMode('quick')`, or Workshop when any panel has `workshopOnly` (`mode.ts:32`). No arrows.
     - A `'template'` design: sliders from `templateControls.ts`.
  5. **`Demo.tsx`**: three SVG/CSS loops, a still under `prefers-reduced-motion` (the CSS media block exists at `styles.css:751`), and *seen* flags in `localStorage` (try/catch).
- **Feature-table rows**

  | Row | Guided | Quick build | Workshop |
  |---|---|---|---|
  | `lid.style` (Cap · Flat · Drop-in row, `LidUI.tsx:77-86`) | hide | show | show |
  | `lid.locks` (padlock hasps, `LidUI.tsx:95-106`) | hide | show | show |
  | `g.arrows` (Guided's size handles) | show | hide (not mounted) | hide (not mounted) |
  | `g.grips` (Guided's divider grips) | show | hide | hide |

  - The last two exist only to satisfy rule 4b, since Workshop's implicit `'show'` cannot express them. Simpler: no rows for Guided-only widgets, plus a note in `features.ts` that `src/guided/` mounts only under `mode === 'guided'`.
  - Any Guided sheet `subsection` (`g-space`, `g-inside`, `g-lid`, `g-more`) must be in `SECTIONS`, naming `lid`, `joints.noGlue`, `settings.joints` or `null`.
- **Words** (en and he)
  - Sizes: `g.size.w`, `g.size.d`, `g.size.h` (*{n} mm wide inside*, …), `g.size.sheetMax` (*That is as big as the sheet allows*).
  - Spaces: `g.space`, `g.space.size`, `g.split.sideToSide`, `g.split.frontToBack`, `g.split.tooSmall`.
  - Dividers: `g.divider.remove`.
  - The add bar: `g.add.divider`, `g.add.lid`, `g.add.inside`.
  - Fit: `g.fit.ok` (*fits*), `g.fit.need` (*needs {n} mm more*), `g.fit.make` (*Make it fit*), `g.fit.noSheet` (*They cannot all fit on one sheet*).
  - The box: `g.more.title` (*More about this box*), `g.more.corners` (*How the corners hold*), `g.madeWithMore` (*Made with more tools: you can decorate and send it*), `g.openMore`.
  - The stand: `g.stand.cardWidth`, `g.stand.lean`, `g.stand.slots`, `g.stand.baseDepth`, plus the organiser's.
  - Demos: `g.demo.pull`, `g.demo.slide`, `g.demo.look`, `g.demo.replay`.
  - Reuse `obj.*`, `lid.kind.*`, `goal.*`.
- **Tests**
  - `tests/guidedbox.test.ts`:
    - `setInsideSize` round-trips through `insideSize` in all 4 materials;
    - a name engraved on the front wall (`frontWall`) survives a resize;
    - a divider's distance from the fixed side is unchanged;
    - split, move and remove leave other dividers in place;
    - a split inside one space ends on that space's walls or dividers and gives `compartments + 1`;
    - each lid choice equals what `setBoxLid` gives;
    - a lid follows the box through a resize (Flat on ply-3, cap on card);
    - `kindOf`: a plain thing is `'box'`, the stand is `'template'`, a box plus a wall is `'more'`.
  - `tests/guidedfit.test.ts`:
    - Pencil box v2: `fitContent` on the pencils meets `fits-pencil`, the box is 14.2 mm deeper (from the scratch run's `need.d`), the other two spaces stay within 0.1 mm, and a second call changes nothing;
    - the dice tray grows until the 6 dice fit (`need.d` 15.4 at the start);
    - a lot too big for the sheet returns null.
  - `tests/fuzz/quick.test.ts`: Guided sequences (resize, split, move, remove, lid, objects, fit); no blocking issue after any step, in `STRICT` mode.
  - E2E: none (G6 has the spec).
  - Goldens: unchanged.
- **Done when**
  - On the Pencil box: pull it deeper, slide a divider, split a space, *Make it fit* on the pencils (the goal ticks), a lid on and off, and Undo back through each step, one step per action. No Shift, Alt or right-drag is needed.
  - Unit and fuzz tests are green; Quick build and Workshop are unchanged.
- **Risks and owner questions**
  - Picking: Scene's pointer handlers select panels on press. Guided's space taps and grips need priority without changing Quick or Workshop picking. This is the riskiest code.
  - `fitContent` on cells that do not span the box (a space in the middle of a 3 × 2 grid): growing the box moves only one row's dividers. Define what "beyond that space" means for perpendicular dividers.
  - Objects need pictures (new art).
  - Owner: whether joints under *More about this box* is acceptable (§4 call).
- **Size** — **L**. The box model, fit, three kinds of stage handles, the sheet, demos and fuzzing (the plan's "about two weeks").


#### 108 Decorate (Guided G5)

- **Depends on / unblocks**
  - Needs 105 (shell, step), 107 (the sheet layout) and 102–104 (solo view on `canvas2d`, `frameScale`, `Edit2D`: done).
  - Independent of 109; they may swap.
- **Already in the code**
  - The solo view: `openSolo`/`closeSolo` (`store.ts:596,600`); `Plan2D` (`src/views/Plan2D.tsx:58`), lazy (`App.tsx:20`).
  - `Plan2D` already reads `edit2d` and `transform.sides` through `useFeature` (`Plan2D.tsx:504,506`; the comment at `:505` already says "Guided keeps corners and the turn knob").
  - `Edit2DCard` checks `edit2d` (`Edit2D.tsx:124`). The double-click into an outline is gated by `edit2dOk` (`Plan2D.tsx:432-444`).
  - Recipes: `textRecipe` (`recipes.ts:117`), `addText(d, panel, cx, cy, value, op, font, size)` (`ops.ts:1746`), `setText` (`ops.ts:1784`), `stickerRecipe(d, panel, polys, cx, cy, size, op)` (`recipes.ts:122`), `STICKERS`/`stickerSize` (`stickers.ts:63,77`), `holeRecipe(d, panel, 'circle'|'rect'|'roundrect', cx, cy, w, h, op)` (`recipes.ts:112`), `placeSticker` (`actions.ts:71`).
  - Guard: `minTextSize` (`guard.ts:20`), `shapeAllowed` (`:61`), `fitShape` (`:209`), `quickGuard`.
  - The guard's words already exist: `guard.edge` *Kept {mm} mm from the edge*, `guard.joint`, `guard.shape`, `guard.text` (`en.ts:917-920`).
  - `workshopOnly` (`mode.ts:32`). `frontWall` (`box.ts:29`) knows which walls are flat (`sketch.kind === 'wall'`).
  - The student's name: `localStorage['cutforge.studentName']` (`SubmitDialog.tsx:44`).
  - `FONTS` (`src/text/fonts.ts:7`).
- **Stale in the plan**
  - *Files: `src/views/Plan2D.tsx` (the face-on view)*: since 102, Plan2D's view box, handles and turn ring are in `src/views/canvas2d.tsx`; side handles are in `frameScale.ts`; point editing is in `Edit2D.tsx`/`src/sketch/edit2d.ts`. Changes for Guided (hiding operation dots, Add/Score, arrays) belong where those are rendered.
    - Grep `Plan2D.tsx:818` (the layer buttons `cut/score/engrave/guide`) and the shape card in `Inspector`. Inspector is not mounted in Guided, so Guided's own sheet replaces it.
  - *"(rebased) `transform.sides` and `edit2d` … `'hide'` in Guided"*: true, and already enforced through the table once 105's `GUIDED` column says `'hide'`. No new code beyond the column.
  - *`src/easy/guard.ts` (the note's words only)*: the words are i18n keys (`guard.*` in `en.ts:917-920`), not in `guard.ts`. Guided needs different words (*side*, *corner teeth*: "edge" and "joint" are banned by 105's words test).
    - **Use instead:** new `g.guard.edge`/`g.guard.joint`/`g.guard.shape`/`g.guard.text`, chosen by mode where the tip is rendered.
  - **Not in the plan, needed:** the guard's tip and keep-out hatch are drawn **only in 3D** (`GuardOverlay`, `View3D.tsx:1246-1289`, mounted at `:814`). The solo view (`Plan2D`) shows none (grep: no `guard` in `Plan2D.tsx`/`canvas2d.tsx`).
    - **Add:** a 2D guard tip and hatch in the solo view (reading `guardNote` and `keepOutZones`), shown when `keepsCuttable(mode)`. This also improves Quick build; give it a row `solo.guard` (Guided show, Quick show, Workshop hide by mode).
  - *"A tap on a side calls `openSolo(panelId)`"*: in 3D today a **double-click** opens face-on (milestone 104). Guided needs a single tap in Decorate: a `GuidedLayer` pick, or a store flag read by Scene's click handler.
  - *"`addName` … sized between `minTextSize` and a third of the side"*: `addText` takes `size` (cap height in mm) directly. Use `Math.max(minTextSize(d, panel, 'engrave'), Math.min(side.h / 3, …))`.
- **Steps**
  1. **`src/guided/decorate.ts`** (pure):
     - `canDecorate(d, panelId): MsgKey | null` (curved wall or band → *not yet*; `workshopOnly` → its reason; a divider → no; too small → reason);
     - `addName(d, panel, value)` (engrave, centred, sized as above; returns the id or the reason);
     - `addSticker(d, panel, stickerId)` (`stickerRecipe`, a quarter of the side; `stickerSize` exists);
     - `addWindow(d, panel, shape: 'circle'|'roundrect'|'rect', op: 'cut'|'engrave')` (`holeRecipe`, about 0.35 of the side).
     - Each runs in one `apply` and selects what it made (`detailSel`). **Never `pending`.**
  2. **`steps/Decorate.tsx`**:
     - on entering, the arrows and grips go; hover lights a side (`hoverPart` exists in the store);
     - a tap calls `openSolo(id)`; *Back to the box* calls `closeSolo()`;
     - the add bar: *Name*, *Sticker*, *Window*;
     - the sheet for a selected decoration: the text field (`setText`), a size slider (`setText({size})`), the fonts (`FONTS`), *Copy* (`duplicateDetails`), *Remove* (`deleteDetails`); for a window, *Cut out · Engrave* pictures (`updateDetail({op})`).
  3. **The solo view in Guided**: confirm no operation dots, Score/Add, through-cut or arrays (rows `rail.ops`, `op.scoreAdd`, `arrays`, `align` are `'hide'` in Guided from 105), and no double-click entry (`edit2d` hide). The selection frame's corners and turn knob stay.
  4. **The 2D guard tip** (above).
- **Feature-table rows**

  | Row | Guided | Quick build | Workshop |
  |---|---|---|---|
  | `solo.guard` (2D keep-out hatch and *Kept … mm* tip) | show | show | hide (Workshop never guards; express it through the mode helper, since the table implies Workshop 'show') |

  Existing rows that must be `'hide'` in Guided: `edit2d`, `transform.sides`, `rail.ops`, `op.scoreAdd`, `arrays`, `align`, `copies`. Set in 105.
- **Words** (en and he)
  - Decorations: `g.deco.name`, `g.deco.sticker`, `g.deco.window`, `g.deco.circle`, `g.deco.roundrect`, `g.deco.rect`, `g.deco.cut` (*Cut out*), `g.deco.engrave` (*Engrave*).
  - Editing: `g.deco.size`, `g.deco.font`, `g.deco.copy`, `g.deco.remove`, `g.deco.back` (*Back to the box*).
  - Reasons: `g.deco.tapSide`, `g.deco.curved` (*A curved side cannot be decorated yet*), `g.deco.tooSmall`, `g.deco.namePlaceholder`.
  - The guard: `g.guard.edge` (*Kept {mm} mm from the side*), `g.guard.joint` (*… from the corner teeth*), `g.guard.shape` (*… from the next cut-out*), `g.guard.text`.
  - Reuse `sticker.*`.
- **Tests**
  - `tests/guideddecorate.test.ts`:
    - on every flat side (`canDecorate === null`) of every thing (106) in every material it allows, a centred name, sticker and window leave no blocking issue;
    - on a side too small, nothing is made and the reason is returned;
    - a real name meets `goal.name` (`missions.ts:64-72`), and the placeholder (`text.default`) does not;
    - decorations on a lid's top survive `setBoxLid` to another kind (what `setBoxLid` already does; check it).
  - Unit: the solo view in Guided does not offer `edit2d`: `featureState('edit2d','guided') === 'hide'`.
  - Goldens: unchanged.
- **Done when**
  - On the Pencil box: open the front, add a name and type it, add a sticker, drag it to a corner (it stops short, with the *Kept … from the side* tip in 2D), go back to the box (both show).
  - No double-click, side handle or point editing is reachable in Guided.
- **Risks and owner questions**
  - Single-tap opening in 3D may clash with Build's taps; it applies only while `guidedStep === 'decorate'`.
  - The text size slider must respect `minTextSize` per material.
  - Owner: name engraved, never cut (a §4 call; nothing to build).
- **Size** — **M**. Three recipes, a sheet, a 2D guard overlay and a tap path.


#### 109 Send (Guided G6)

- **Depends on / unblocks**
  - Needs 105, 106 (class material and missions), 90 (*Print a plan*) and 73 (*Use less board*).
  - The 2D sheet runs in `Plan2D` (102).
  - Adds the only e2e spec of the Guided block.
- **Already in the code**
  - Sheet and plan: `Plan2D` (piece drag `Plan2D.tsx:609`, *Repack* `:798-803`).
  - Checks and fixes: `validate`, `blocking`, `canFix`, `fixIssue`, `FIXABLE` (13 keys, `fix.ts:100`). `ReadyBadge` (`src/easy/ReadyBadge.tsx:12-80`) is a working model of the list and *Fix*.
  - *Use less board*: `lessBoard()` and the `use-less` button inside `YieldBar` (`SplitUI.tsx:44-75,162`).
  - *Print a plan*: `specPages`/`specHtml` (`src/export/spec.ts`), driven by `printSpec` **inside** `ExportDialog` (`ExportDialog.tsx:102-127`, private, with `specText()`). Feature `export.spec`.
  - Download: `exportFiles(name, prepared, mode)` (`ExportDialog.tsx:23`, exported), `prepareExport` (`src/export/prepare.ts`), `sheetToSvg`/`sheetsToSvg` (`src/export/svg.ts`), `downloadText`/`safeName` (`src/ui/download.ts`).
  - Submitting: `SubmitDialog` (`src/ui/SubmitDialog.tsx`):
    - `goalsOf` (`:7-10`), `remember` (`:27-35`), `differs` (`:37-38`);
    - `send()` (`:47-62`): `api.submit` with `serializeProject`, `sheetPreviewSvg(prepareExport(d).sheets[0])`, goals;
    - `start()` (`:64-80`): class lookup, `applyClassMode`, closed check, profile check;
    - `useClassProfile()` (`:82-90`): `changeMaterial` for template designs, else `setMaterial`.
  - `api`: `api.ts:29-44`; `deviceId`: `:47`.
  - Missions: `missionState` (stars, goals).
  - Assembly: `playAssembly` (`assemble.ts:30`). It drives `assemble` state that **only `View3D` draws** (`View3D.tsx:194-198`).
- **Stale in the plan**
  - *"Print a plan (milestone 90) is a small link under the sheet"*: the printing code is private to `ExportDialog.tsx`.
    - **Use instead:** move `specText` and `printSpec` into `src/export/printPlan.ts` (or `src/ui/printPlan.ts`, since it needs `t`), used by both `ExportDialog` and Send. `ExportDialog` keeps its UI.
  - *"Download in Guided is SVG at nominal size with no dialog"*: do it with `exportFiles(name, prepareExport(d, 'nominal', …), 'nominal')` + `sheetToSvg`/`sheetsToSvg`, as `ExportDialog.tsx:128-141` does.
    - Importing `ExportDialog.tsx` from Guided would defeat its lazy chunk. Move `exportFiles` to `src/export/` or import it from `ExportDialog` lazily.
    - A design in two materials gives one file per material (`export.perMaterial`). Keep that.
  - *"Watch it go together plays `playAssembly` over the stage"*: Send shows the sheet (`Plan2D`). The animation needs `View3D`, so Send must switch the viewport to `View3D` while `assemble !== null`, then return.
  - *`SubmitDialog.tsx`'s `useClassProfile`*: for a template design it calls `changeMaterial`, which rebuilds from params (cross-cutting fact 5). If 106 detaches plain things this is safe; the stand still regenerates by design.
  - *E2E "1366 × 768 and 1024 × 768"*: the config viewport is 1400 × 850 (`playwright.config.ts:7`); set sizes per test.
  - **Reality check of the classroom spec**: `classroom.spec.ts` contexts use `WORKSHOP_STATE` (`:14,97,140,156`) and need the Worker on 8787. `PROGRESS.md` (milestone 100) notes it was not run then. Budget time to get it running.
- **Steps**
  1. **`src/net/submit.ts`** (no React):
     - `lookupClass(code)` → `ClassInfo`, or an error code;
     - `profileMismatch(cls, d)`, using `differs` and `mixedMaterials`;
     - `switchToClassMaterial(d, m): Design` (today's `useClassProfile` body, pure);
     - `submitDesign({code, name, title, design})` → `api.submit` with the preview and `goalsOf`;
     - `rememberedName()` / `rememberedCode()` (`cutforge.studentName` / `cutforge.classCode`).
     - `SubmitDialog.tsx` is rewritten to call them, with no behaviour change.
  2. **`steps/Send.tsx`**:
     - the sheet: lazy `Plan2D` with `plan.edit` hidden;
     - the check list: `validate(d).filter(blocking)`, each in Guided words (`g.val.<key>` for each `FIXABLE` key, else *This needs your teacher*), **Fix** through `apply(fixIssue)`, and *Open with more tools* when the class is unlocked;
     - *Use less board* (`lessBoard`) when `sheetUse(d).sheets > 1`;
     - the mission's goals and stars (reuse `MissionPanel`'s list, or `missionState`);
     - *Watch it go together* (`playAssembly`, with the viewport switch), and *See it flat* for card and corrugated (`foldT`);
     - the button: with a remembered class code, **Send to my teacher** (asks a name once; if the class material differs, asks *Your class cuts in … Switch to it?*, applies `switchToClassMaterial` and re-runs the check); otherwise **Download the file** (direct SVG), with *I have a class code* and *More download options* (`set({exportOpen:true})`) beside it;
     - the button is disabled until there are no blocking issues;
     - a small *Print a plan* link.
  3. **The dot on *3 Send*** in `GuidedTopBar`: amber when blocking issues exist. Use `useDeferredValue` as `ReadyBadge` does.
- **Feature-table rows**

  | Row | Guided | Quick build | Workshop |
  |---|---|---|---|
  | `plan.edit` (from 105) | hide | show | show |
  | `export.direct` (one-tap SVG without the dialog) | show | hide (not offered) | hide (not offered) |

  - Optional; omit it if Send is Guided-only code and the table is kept to shared controls.
  - Existing rows used: `saveBoard` show, `saveBoard.steps` hide, `yield` hide, `export.spec` show, `export.kerf` auto.
- **Words** (en and he)
  - The check: `g.send.title`, `g.send.ready` (*Ready to cut ✓*: reuse `ready.ok` if its wording fits), `g.send.fix`, `g.send.askTeacher` (*This needs your teacher*), `g.send.openMore`.
  - The sheet: `g.send.lessBoard` (or reuse `less.*`), `g.send.watch` (*Watch it go together*), `g.send.flat` (*See it flat*), `g.send.print` (*Print a plan*).
  - Sending: `g.send.toTeacher` (*Send to my teacher*), `g.send.download` (*Download the file*), `g.send.haveCode` (*I have a class code*), `g.send.moreOptions` (*More download options*).
  - Asking: `g.send.askName`, `g.send.switchMaterial` (*Your class cuts in {material}. Switch to it?*), `g.send.switch`, `g.send.keep`.
  - Results: `g.send.sent`, `g.send.offline`, `g.send.closed`.
  - Errors: reuse `sub.err.*`.
  - `g.val.*` for the 13 keys in `FIXABLE` (`val.holeOutside`, `val.tooThin`, `val.shapesOverlap`, `val.stencil`, `val.stencilShape`, `val.tooBig`, `val.tooBigGrain`, `val.offSheet`, `val.piecesOverlap`, `val.bendTight`, `val.bendStyle`, `val.bendRoom`, `val.fluteBend`).
- **Tests**
  - `tests/guidedsend.test.ts` (mock `api` with `vi.mock('../src/net/api')`):
    - a class with a profile: the mismatch is detected and the switch applied;
    - a closed class gives `closed`;
    - no network gives `network`, and the download is offered;
    - a second send calls `api.submit` again (the Worker supersedes by device: `worker/index.ts:214`).
  - `SubmitDialog` behaviour unchanged: check with `classroom.spec.ts`.
  - `tests/e2e/guided.spec.ts` (new; run only this and `classroom.spec.ts`, per §5):
    - storage `{mode:'guided'}`, plus the 105 preview flag until 110;
    - in English and Hebrew, at 1366 × 768 and 1024 × 768: the gallery; Pencil box; *Make it fit*; a name; Send shows *Ready to cut ✓* and three stars; the download is an `.svg` (`page.waitForEvent('download')`);
    - then *Box with a lid*, its lid changed to *Hinged*;
    - assert no `keyboard.press` and no right-click is used;
    - assert absent: `toggle-joints`, `tool-shapes`, `quick-rail`.
  - `tests/e2e/classroom.spec.ts`: a Guided class (locked, with a material profile): the link starts in that material with no chips and no way to the other levels; *Send to my teacher*; the teacher sees *Pencil box · 5 of 5 goals*.
  - Goldens: unchanged. The direct SVG is the same `sheetToSvg` output as the dialog's nominal export; optionally assert it is byte-equal to `ExportDialog`'s for one golden design.
- **Done when**
  - From the gallery to *Sent* (or a downloaded SVG) with only taps, in both languages, at 1024 px.
  - `SubmitDialog` still works in Quick build and Workshop through `submit.ts`.
  - `guided.spec.ts` and `classroom.spec.ts` pass.
- **Risks and owner questions**
  - Owner: whether Send waits for the check (§4 call: today Quick build lets a student *Download anyway*).
  - The `classroom.spec` environment (Worker, D1).
  - The assembly animation needs a viewport switch inside Send.
- **Size** — **M**. A refactor of submitting, a new step, direct download, a print-helper move and two e2e specs.


#### 110 Guided becomes the way in (Guided G7)

- **Depends on / unblocks**
  - Needs 105–109.
  - Unblocks the rest of §5.1 (111–118), which only needs rule 4b rows.
- **Already in the code**
  - The default prefs: `initialPrefs` (`store.ts:167-177`, not exported).
  - The mode switch in `TopBar.tsx:175-183` and the ⋯ menu copy at `:226-231`. `modeLocked` hides both (`:175,226`).
  - Class creation: `worker/index.ts:260` (`mode: null`).
  - `applyClassMode(null, …)` keeps the browser's mode (`mode.ts:19-23`).
  - `workshopOnly` (`mode.ts:32`).
  - E2E: the global `storageState` is Workshop (`playwright.config.ts:10`). `quick.spec.ts:365-375` asserts the old default.
  - Docs to touch: `README.md`, `EASY_MODE.md`, `LIDS_LINES_PROJECTS_PLAN.md` (§10), `DECISIONS.md`, `PROGRESS.md`. All exist at the repo root.
- **Stale in the plan**
  - *"A new browser, and a new class, starts in Guided"*: "a new class" has two possible meanings:
    - the server writes `mode: 'guided'` on create (`worker/index.ts:260`);
    - a class with `mode: null` leaves the student's browser default, which becomes Guided anyway.
    - **Recommended:** change `createClass` to `mode: 'guided'` so the teacher sees it, and leave existing rows alone (no migration).
  - *"Where the bar is narrow the switch is in the ⋯ menu, as today"*: still true (`TopBar.tsx:176` `tablet-hide`, `:227` in `more-menu`). `topbar.spec.ts:56-68` must gain a `guided` state and check that Guided's own bar fits at the same 8 sizes.
  - *Final check "`npm run build` (note the size of the Guided chunk and of the entry)"*: since code splitting the entry is about 2.13 MB (630 KB compressed) (`PROGRESS.md`, code splitting).
    - Once Guided is the default, consider making Workshop's `Toolbar` and `Inspector` lazy instead. That is a follow-up, not part of 110.
  - *"README: a Guided section"*: README already describes the sentence and size intent (milestone 100). Add the three levels next to them.
- **Steps**
  1. **The default.**
     - Export `initialPrefs` (or a pure `prefsFrom(raw: string | null)`): `{ ...def, mode: 'guided' }` when nothing is saved; `{ ...def, mode: 'workshop', ...JSON.parse(raw) }` when something is saved (a browser with prefs but no `mode` key keeps Workshop).
     - `worker/index.ts:260`: `mode: 'guided'`.
  2. **The switch.**
     - `TopBar.tsx:177,227` always list `['guided','quick','workshop']` (drop the preview flag from 105, or keep it harmlessly).
     - Guided's menu has *More tools (Quick build)* and *All tools (Workshop)*.
     - `modeLocked` hides all of them.
  3. **Between levels.**
     - `setMode` never touches the design (already true; keep the 105 clean-ups).
     - Guided on a `'more'` design shows §3.3's note. Its button goes to Quick build, or to Workshop when any panel has `workshopOnly(d, id)`.
  4. **E2E updates.**
     - Rewrite `quick.spec.ts:365-375` to "a new browser starts in Guided; Quick build is one menu tap away".
     - `topbar.spec.ts` gains a Guided case.
     - `guided.spec.ts` gains Guided → Quick build → Guided on one design (the design JSON is unchanged).
     - Specs that clear storage (`quick.spec.ts:366`; `tour.spec.ts:253` sets `quick` + locked) must be checked.
  5. **Docs.**
     - `README.md`: the three levels.
     - `EASY_MODE.md` and `LIDS_LINES_PROJECTS_PLAN.md` §10: one line at the top pointing to `GUIDED_MODE.md`.
     - `DECISIONS.md`: a *Guided* section (three levels, Guided by default, no ghost and ✓ in Guided, Guided does not build from nothing).
     - `PROGRESS.md`: the 110 section.
     - `ROADMAP.md` §5.1 status line.
- **Feature-table rows**
  - None new. Check that every row has a Guided state (enforced by the `satisfies Record<Feature, FeatureState>` from 105).
- **Words** (en and he)
  - `mode.guided` and `mode.guidedHelp` (from 105) are now user-facing everywhere. The Hebrew name is still to be chosen with the teacher (§9).
  - `g.madeWithMore`/`g.openMore` (107) and `class.modeLocked` (106) are reused.
- **Tests**
  - `tests/easymode.test.ts`:
    - `prefsFrom(null).mode === 'guided'`;
    - `prefsFrom('{"mode":"quick"}').mode === 'quick'`;
    - `prefsFrom('{"dims":false}').mode === 'workshop'` (an existing browser keeps Workshop);
    - a locked class cannot switch;
    - a box with a wall added in Quick build is `kindOf === 'more'` in Guided, and its JSON is unchanged after Quick → Guided → Quick.
  - `worker/api.test.ts`: a new class reads back `mode: 'guided'`.
  - `guided.spec.ts` (the trip between levels) and `classroom.spec.ts`.
  - Final: `npm run typecheck`, `npm test`, `npm run build` (record the chunk sizes); by hand, in both languages, every thing from the gallery to *Ready to cut ✓*.
  - Goldens: unchanged.
- **Done when**
  - A browser with no saved data at `http://fresh.localhost:5199` opens Guided's gallery.
  - A browser with saved prefs keeps its mode. A new class is created in Guided; an existing class keeps its mode.
  - Nothing of Quick build was removed.
  - All the checks above pass, and the docs are updated.
- **Risks and owner questions**
  - Reversing *Workshop by default* affects real users with no saved prefs: anyone who cleared storage lands in Guided. This is intended, but the owner should know.
  - The Hebrew name of the mode.
- **Size** — **S**. A few lines of defaults plus tests, spec rewrites and docs.


### Open questions for the owner

From `GUIDED_MODE.md` §9 (still open), each with my recommended default:

1. **Real students.**
   - The question: 3 to 5 who have not seen it, 20 minutes each, on a school Chromebook.
   - Open; this cannot be done in a session.
   - **Default:** build 105–110, then run the session before turning the default on in production (110 can ship behind the 105 preview flag until then).
2. **Trackpad and touch screen.** Every drag in §3.3 and §3.4 by hand.
   - Open. Outline mode (101) already lists *not tried on a device*.
   - **Default:** check by hand on one Chromebook trackpad and one tablet after 107 and 108; keep every gesture tap-or-drag only.
3. **Hebrew.** The mode's name, and a native speaker's review of every `g.*` string.
   - Open, and also outstanding for the `sen.*` sentences since milestone 100.
   - **Default:** use a placeholder Hebrew name (`מודרך`) and have every `g.*` string reviewed together with `sen.*`.
4. **The §4 calls.**
   - **(a) Joints off the first screen**, under *More about this box*. **Default:** yes, as planned.
   - **(b) Send waits for the check** (no *Download anyway*). **Default:** yes for Send to my teacher; allow *More download options* (the full dialog) as the escape hatch.
   - **(c) Pencil box and Game organiser rebuilt as recipes** (version 2; this also changes Quick build's start for them). **Default:** yes. It is required for Build's arrows: the organiser template has no tray (scratch run).
   - **(d) The rest** (Quick build keeps its name, no per-class highest level, decorate face-on, names engraved, no levels or trophies). **Default:** as written.
5. **The mock-ups.** Closed: they are in `docs/guided-mockups/` (four PNGs).

Found while checking the plan against the code:

6. **Plain things are template designs** (`d.template` = box, tray or carton). Rebuilding from params (a change of board, the class-profile switch on submit, the too-big fix, the template card) undoes Guided's resizes.
   - **Default:** detach the template (`delete d.template`, keep `sizeAs: 'inside'`) when a plain thing starts in Guided. The stand stays a template.
7. **How Guided is reached before 110.** A development-build-only switch item would appear in every Playwright spec, since e2e runs the dev server.
   - **Default:** an explicit preview flag (`?guided`, then saved in prefs).
8. **The Escape box in Guided.** Its padlock goal needs hasps, which Guided does not offer.
   - **Default:** leave it out of Guided's gallery (it stays in Quick build).
9. **Carton on plywood (and on corr-4): greyed with its reason, or hidden?** §3.1 says greyed; G3's test says not offered; ROADMAP §5.2 #6 hides only in the sentence.
   - **Default:** greyed with the reason, not startable.
10. **The class's missions list and plain things.** Existing classes have lists with mission ids only.
    - **Default:** a list with no plain-thing ids offers every plain thing. The teacher UI lists both groups.
11. **"A new class starts in Guided".**
    - **Default:** the server creates classes with `mode: 'guided'`; existing classes are not migrated.
12. **The round box's size.** The structure states a round box's width and depth as outside (only the height is set inside).
    - **Default:** the gallery's round box is 100 × 100 × 45, and the sheet shows its measured inside.

---

## Part 2: Dieline 111–114 (D3a, D3b, D1, D2)

Written 2026-11-19 against `main` at `e88e115` (code splitting, after milestones 92–104). Line numbers were read on that commit; grep the name before editing. Claims checked by reading code are given with `path:line`. Claims checked by running a probe script (tsx) are marked *(probe)*. Anything not checked is marked *(unverified)*.

Order (ROADMAP.md §5.1): 111 → 112 → 113 → 114. Guided (105–110) comes before them in the roadmap but has **not been built** (ROADMAP.md §5.1 status: "stopped before Guided's G2 (105)"). Each brief says what to do in either case.


### Dieline 111–114: cross-cutting facts

#### Edges, edge features, flaps and creases today

- **Edge keys.** `EdgeSeg = { key; a; b }` (`src/model/edges.ts:30`). `panelEdges(p)` (`:240`) gives a board's ring. `findEdge(p, key)` (`:256`) resolves a stored key: a split edge is `<edge>#n` and a curve piece is `~n` (`isCurveKey`, `:77`). `sketchRing` (`:167`) and `isRectSketch` (`:301`) are also there. Connections store `a.edge` / `b.edge` as strings, and code compares them through `findEdge(p, c.a.edge)?.key` (pattern in `edgeFlapGeom`, `src/model/geometry.ts:332`).
- **Two kinds of things sit on a free edge, each wired by hand:**
  - **Fold-overs.** `Panel.foldOvers?: FoldOver[]` (`src/model/types.ts:149`, type at `:209`). Geometry comes from `foldOverGeom` (`src/model/foldover.ts:72`). It returns `FoldOverGeom` (`:62`): `ConnGeom` plus `linerHoles`, `liner` and `tabs`. All of them are listed by `allFoldOvers(d)` (`:151`, memo key `'foldovers'`). Its adds and scores land on the wall, but its **lock-tab slots land on the base** (`holes[].panelId = base.id`). Its rim scores carry `toward: 1`.
  - **Plain edge flaps.** `Panel.edgeFlaps?: { id; edge; len }[]` (`types.ts:151`). Geometry comes from `edgeFlapGeom(d, p, f)` (`geometry.ts:329`). It returns null on a joined edge, otherwise `flapOn(e, f.len)`.
- **`flapOn(e, len0, scoreIn = 0)`** (`geometry.ts:338`) draws a 30° taper (clamped to L/3) and puts the score `scoreIn` inside the edge.
  - **Hand-made plain flaps call it with `scoreIn = 0`**, so their score lies on the edge, not t/2 inside it.
  - Only a divider's band-end flap passes `t/2` (`src/model/dividers.ts:420`).
  - A closure's tuck lip and dust flaps also score on their edge (`src/model/closures.ts:204`, `:257`).
  - So ROADMAP §5.2 row 13 ("flaps crease `scoreIn` inside their edge") is true for glue, lock, band and fold-over flaps (DECISIONS.md, fold overhaul). It is **not** true for `Panel.edgeFlaps`.
- **Where edge features become output.** `extrasByPanel(d, only?)` (`geometry.ts:64`) runs three loops in a fixed order:
  1. fold-overs (`:72–81`: holes by `h.panelId`, adds, scores and `linerHoles` on the owner);
  2. edge flaps by `d.order` (`:82–92`);
  3. connections (`:93–101`).

  `panelExtras` (`:106`) memoises it on frozen designs (`'extras'`). `groupPieces` (`src/model/pieces.ts:341`) turns extras into contours. **A score with `toward` that folds away from the scored face becomes a perforation** (dashes on CUT): `pieces.ts:365–369`, using `faceOf` (`:311`).
- **In 3D:**
  - Plain flaps are drawn **flat in the board's plane**, unioned into the slab (`src/views/three-geom.ts:67`, `flatAdds`).
  - Fold-overs are drawn by `FoldOverObject` (`src/views/foldOver3d.tsx:14`), rendered at `src/views/View3D.tsx:750` from `allFoldOvers` (`:657`).
  - Joint flaps are `ConnGeom.flaps3d: Flap3d[]` (`types.ts:357`). They are drawn by `Flaps` (`View3D.tsx:1372`, mounted at `:748`) through `flapMatrix` (`src/views/foldView.ts:147`), which unfolds them with `foldT` about `hinge` by `angle`.
  - `bandEndGeom` (`dividers.ts:413–435`) is a working pattern for "a flap on an edge, turned 90° about its crease in a frame of its own": `flapOn(e, len, t/2)`, a score with `toward: 1`, and `flaps3d` with a rotated `frame`.
- **Creases (fold overhaul).** `src/model/crease.ts`: `creaseDepths` (`:27`) and `foldLay(d, P, pe, C, ce) → { a, score }` (`:54`).
  - `grownFoldXform(d, c)` (`pieces.ts:68`) lays a grown child with `foldXform(P, edge, foldLay(...).a, span0)`, or with a band's length when the fold has a radius (`bandOf`).
  - The other pieces of the crease code: `netFolds` (`:78`), `netGroups` (`:141`), `foldBand` (`:227`), `creaseOf` (`:325`, automatic perforation of folds that turn away).
- **Closures and tray ends stay joints** (`closureGeom`, `closures.ts:180`; `endGeom`, `src/model/cartons.ts:167`). Decision 4 of the plan holds: they do not move to the registry.
- **No golden export contains a fold-over or an edge flap.** *(probe: every design in `tests/golden.test.ts`'s CASES was solved and checked for `foldOvers` / `edgeFlaps`; none had either. `v6CorrFoldover` has one, but it is used only by `tests/netIn3d.test.ts`, not by the goldens.)*
  - So "goldens byte-identical" **does not prove D3a**.
  - Fix: add goldens for a fold-over and a plain flap **before** the refactor (see 111).

#### Where the cut plan's sheets are built and rendered

- `pieceCopies(d)` (`src/model/pack.ts:25`) builds `PieceCopy` (`:8`).
  - `contours` are shifted so the bbox minimum is at (0, 0).
  - `origin` is the shift.
  - `panels: NetPanel[]` hold panel-local → **unshifted** piece transforms, so subtract `origin`.
  - `pack(d, copies)` (`:92`), `sheetGroups` (`:102`) and `placementXform` (`:69`) place them.
- `Plan2D({ soloPanel })` (`src/views/Plan2D.tsx:58`) is the cut plan and the solo (face-on) view. Its parts:
  - `Placed = { copy, sheet, xf, ox, H }` (`:42`).
  - The `Drag` union (`:46–55`): pan, marquee, move, resize, rotate, gresize, draw, piece, pt2d.
  - `modeKey` is `'sheets'` or `solo:<id>` (`:69`). It keys the saved view box.
  - The `layout` memo (`:71–97`) has two branches, solo and sheets.
  - `netBad` comes from `netOverlaps` (`:99`).
  - The coordinate helpers `toPiece`, `netXf`, `toLocal` and `toSvg` (`:133–143`) map SVG y as `H − y` and subtract `copy.origin`.
  - `placedOf(panelId)` returns the copy-0 placement (`:154`).
  - `onPieceDown` (`:380`) starts a `piece` drag only if `layout.placements[key]` exists.
  - `onDouble` (`:432`) opens solo; milestone 104 added `edit2dAt` (`:448`), which finds the board only in solo.
  - Contours (`:598–631`): fold lines carry `c.ref.foldId` and the class `fold-line`. Non-shape contours have `pointerEvents="none"`.
  - `Edit2DLayer` (`:753`) and `Edit2DCard` (`:776`) are drawn through `placedOf`.
  - `PendingBarHtml` is at `:777`.
  - The plan dock (`:778–815`) holds solo-back, zoom and fit, `repack`, the `plan-dims` toggle (`:808–813`) and `YieldBar` (`:814`).
  - The legend is at `:817`. The hint is at `:829`.
- **After the 2D work** (102–104):
  - `src/views/canvas2d.tsx` holds `useViewBox(svgRef, key, initial)` (`:20`), `Handles` (`:89`), `RotRing` (`:139`) and `Marquee` (`:151`).
  - `src/views/frameScale.ts` holds `frameDrag` (`:32`) and `typedSize` (`:60`).
  - `src/views/Edit2D.tsx` holds `Edit2DLayer` (`:28`), `Edit2DCard` (`:122`) and `distToSegment` (`:19`).
  - `src/sketch/edit2d.ts` holds `Edit2D = { kind: 'shape' | 'board' | 'line'; id; panelId }` (`:22`), `targetOf`, `movePoint` and `canEdit` (`:190`).
  - Store: `State.edit2d` and `sel2d` (`src/store/store.ts:260`).
- **Lazy loading.** `App.tsx:20` loads `Plan2D` through `React.lazy`. The view switch is at `App.tsx:86–90`: `view === '3d' ? <View3D/> : <Suspense>…<Plan2D/></Suspense>`. Plan2D is prefetched once the editor is up (`:52–60`, the `import()` at `:56`). `View3D` is eager, and Plan2D imports `placeText` from it (`Plan2D.tsx:30`). E2E specs must wait for the lazy chunk, as the code-splitting commit did.
- **View state.**
  - `View = '3d' | '2d' | 'solo'` (`store.ts:78`). `ONLY_3D` is at `:55`. `setView` (`:595`), `openSolo` (`:596`) and `closeSolo` (`:600`).
  - `ViewPrefs` (`:127–162`) is **per browser** (`localStorage` key `cutforge.viewPrefs`) and is not stored in the design. It already has `planDims` (`:157`), `outlineMode`, `keepRatio` and `growMore`.
  - `setPrefs` (`:620`) makes joints and outline mode exclude each other.
- **Inspector.** `src/ui/Inspector.tsx:109`: `if (sel?.kind === 'edge') return view === '3d' ? <EdgeBar …/> : null`. The edge card is 3D-only.
  - The board card's *Edit outline* is 3D-only (`:268`).
  - The sheet placement card shows when `view === '2d'` and `sheetCopy` is set (`:428`).
  - `PanelHinge` (`src/ui/Connections.tsx:254`, mounted at `Inspector.tsx:254`) already edits a grown board's angle with an `AngleDial` (test ids `conn-angle-*`).
- **Grow.**
  - `effectiveGrow`, `doGrow`, `closeAsGo`, `growWith`, `growOverlap` and `ownGrowKind` are in `src/views/ghost.ts:31/57/74/84/99/112`.
  - `ghostPanel` (id `'ghost'`, its edge `e0`), `edgeFreeSpans`, `edgeHasRoom`, `snapTo` and `heightTargets` are in `src/model/adapt.ts:39/49/70/142/154`.
  - `wallClosesBox`, `closeChoices`, `closeChoice` and `heightMarks` are in `src/easy/lid.ts:248/270/297/307`.
  - `closeBoxGo` is in `src/easy/actions.ts:52`.
  - The 3D ✓ logic is in `GrowGhost`'s `onOk` (`View3D.tsx:1612`). Its height snaps are `heightTargets ∪ heightMarks` (`:1562–1563`).
  - The 3D bar is `ConfirmBar` (`src/views/panelTool.tsx:123`).
  - `PendingBarHtml` (`:381`) is wired to `confirmPending` / `cancelPending` only.
- **Features.**
  - `FEATURES` in `src/easy/features.ts` has one state per feature (Quick build's). Workshop always shows.
  - `useFeature` and `featureState` are near the end of the file. `SECTIONS` maps card `subsection` test ids to features (`'edge-flap': 'edgeFlap'`).
  - `tests/quickTable.test.ts` checks that every `subsection` div is in `SECTIONS`, and that the **sorted list of `'hide'` features is literal** (`:105–127`). Every new hidden feature must be added there.
  - Guided's own table is G2 (105): "a second table gives Guided's; a feature it does not list takes Quick build's" (GUIDED_MODE.md:235). It is not built yet.
- **i18n.** Flat catalogues are in `src/i18n/en.ts` and `he.ts`. `tests/i18n.test.ts` checks parity, that every `t()` key exists, and that no text is hard-coded.
  - Existing words to reuse: `flap.add`, `flap.len`, `flap.remove`, `flap.addHelp` (`en.ts:584–587`), `closure.tuck` (*לשונית תחיבה*), `closure.dust`, `conn.valley`, `conn.mountain`, `top.view2d` (*תוכנית חיתוך*), `view.sheet` (*גיליון*), `ann.dims`.
- **Pictures.** `PicName` (`src/ui/Pictures.tsx:112`) already has `tuck`, `snap`, `flaps` and `none`. It has no `plain`, `dust`, `glue` or `hang`.

#### Schema version and migration pattern

- `SCHEMA_VERSION = 11` (`src/model/types.ts:521`).
- Migrations are in `MIGRATIONS` in `src/model/serialize.ts` (from `:22`, keyed by N for N → N+1; the last is `10:` for the fold overhaul). They are run by `migrateDesign` (`:165`), which then calls `checkDesign` (`src/model/check.ts`) and `solve`.
- **None of 111–114 needs a bump** (the plan's rule 4). Every new stored field is optional, and an absent field means today's flap.
- `check.ts:193–195` filters `edgeFlaps` items on `id`, `edge` and `0 < len < 1000` only. **Extra fields pass through unvalidated today**, so 112 must sanitise each new field (drop a bad field, keep the flap).
- `viewPrefs` (113) live in `localStorage` and need no schema.

#### Other notes

- **`src/net/`** holds only `api.ts`, the classroom network API (`api`, `ClassInfo`, `Submission`). It has nothing to do with nets. Put net code in `src/views/netPick.ts` / `src/views/NetView.tsx` as the plan says, not in `src/net/`.
- **Feature naming.**
  - `'edgeFlap'` already exists (`features.ts:97`, `'hide'`).
  - `EdgeBar`'s flap block is `EdgeFlapField` (`src/ui/EdgeBar.tsx:146`). It renders only when all of these hold (`:137`):
    - the edge is free (`!used`);
    - the grow card's *More…* is open (`advanced && more`);
    - the board is not plywood.


#### 111 The edge-feature registry (D3a)

- **Depends on / unblocks**
  - Depends on nothing built after 104.
  - Unblocks 112 (shaped flaps are a registry kind), 113 (net picking can ask the registry what is on an edge) and 115 / D8 (glue and perforation layers read one list).
- **Already in the code**
  - `foldOverGeom` (`src/model/foldover.ts:72`), `allFoldOvers` (`:151`) and `FoldOverGeom` (`:62`).
  - `edgeFlapGeom` (`src/model/geometry.ts:329`), `flapOn` (`:338`), `extrasByPanel` (`:64`), `PanelExtras` (`:60`) and `panelExtras` (`:106`).
  - `memo` (`src/model/derived.ts:15`, frozen designs only).
  - `foldOverIssues` (`src/model/validate.ts:301`, called at `:93`) and `linerBox` (`:349`).
  - `canFoldOver` (`src/model/ops.ts:1682`) and `curveBlocked` (`ops.ts:1628`; it checks fold-overs, not flaps).
  - `Issue` (`validate.ts:36`) and `MsgKey` (`src/i18n/index.ts`).
  - `v6CorrFoldover` (`tests/goldenDesigns.ts:108`).
- **Stale in the plan**
  - "**Goldens byte-identical is the proof.**" No golden case contains a fold-over or an edge flap *(probe)*. Add `foldover-corr` (`v6CorrFoldover`) and `flap-card-plain` golden cases, **generated on the code before the refactor**, first.
  - **`EdgeFeatureOut.scores: { a; b }[]`** drops `toward`. Fold-over rim scores carry `toward: 1` (`foldover.ts`, the rim scores), and `groupPieces` turns a `toward` that disagrees with `faceOf` into a perforation (`pieces.ts:365–369`). Dropping it can change output on a mirrored board. Use `{ a; b; toward?: 1 | -1 }[]`.
  - **"Replace the two loops with one loop over `edgeFeatures(d)`."** It must keep `extrasByPanel`'s `only` semantics. Fold-over **holes go to the base** (another panel), so iterate every feature and filter each *output* with `want(panelId)`. Do not skip features whose owner is not `only`. The current flap loop skips non-wanted owners before computing geometry. Keep that as a cheap pre-filter for the flap kind only.
  - **"Move the fold-over checks behind `checks`."** `foldOverIssues` mixes per-item rules with a pairwise one (`val.linerCollide`) and a flute check that packs the design (`pack`, `pieceCopies`). Per-item `checks` cannot hold the pairwise rule, and calling `pack` per item multiplies the cost. Do one of these:
    - leave `foldOverIssues` as it is in 111 (recommended: the plan's goal is output, and issues can move later); or
    - add `EdgeFeatureKind.checksAll?(d, items)` and assert the issue array is deep-equal before and after on `v6CorrFoldover` and `tests/foldover.test.ts`.
  - **`blocked(d, p, edge): MsgKey | null`.** No such reason keys exist (`canFoldOver` returns a boolean). Nothing in 111 shows a reason. Either make `blocked` optional in 111 and fill it in 112 (with keys), or return the existing boolean rules wrapped. Recommended: optional, added in 112.
  - **`HingedPart` / `hinged`.** In 111 both kinds return `hinged: []`: plain flaps stay flat (`three-geom.ts:67`) and fold-overs keep `FoldOverObject`. See 112 for why `Flap3d` is the better type.
  - **`F3`'s "`three-geom.ts:53` draws edge flaps flat"** is now `three-geom.ts:67`.
- **Steps**
  1. **Goldens first (separate commit, or the first change in the milestone).**
     - In `tests/goldenDesigns.ts` add `plainFlapBoard()`: a card 80 × 50 root board with `addEdgeFlap(d, p, 'e2', 15)` and one on `'e1'` (default length). This is the same shape as `tests/closures.test.ts:129`.
     - In `tests/golden.test.ts` add the cases `foldover-corr` (`v6CorrFoldover`) and `flap-card-plain`.
     - Generate them with `UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts` **on the unchanged code**, then check that every other file is untouched (`git status tests/golden`).
  2. **New `src/model/edgeFeatures.ts`**:
     ```ts
     export type EdgeFeatureOut = {
       adds: P2[][];                                   // on the owner
       scores: { a: P2; b: P2; toward?: 1 | -1 }[];    // on the owner
       holes: { panelId: string; poly: P2[] }[];       // any board (a fold-over's slots are in the base)
       linerHoles: P2[][];                             // on the owner
       hinged: Flap3d[];                               // [] in 111 (see 112)
     };
     export type EdgeFeatureKind = {
       id: 'foldover' | 'flap';
       on(p: Panel): { key: string; edge: string; item: unknown }[];
       geom(d: Design, p: Panel, item: unknown): EdgeFeatureOut | null;
       blocked?(d: Design, p: Panel, edge: string): MsgKey | null;   // filled in 112
     };
     export const EDGE_FEATURES: EdgeFeatureKind[] = [foldOverKind, flapKind];
     export type EdgeFeatureHit = { panelId: string; kind: EdgeFeatureKind['id']; key: string; edge: string; out: EdgeFeatureOut };
     export function edgeFeatures(d: Design): EdgeFeatureHit[];           // memo(d, 'edgeFeatures', …)
     export function featuresOnEdge(d: Design, panelId: string, edge: string): EdgeFeatureHit[]; // for 112/113
     ```
     - `foldOverKind.on` returns `p.foldOvers`.
     - `foldOverKind.geom` maps `foldOverGeom` field for field:
       - `adds` takes `g.adds.map(a => a.poly)`. Today these are all on the owner; assert it in a test.
       - `scores` takes `g.scores` with `toward`.
       - `holes` and `linerHoles` are copied.
     - To reuse the existing memo, build the fold-over hits from `allFoldOvers(d)`, which keeps the `d.order` × `foldOvers` order.
     - `flapKind.on` returns `p.edgeFlaps`. `flapKind.geom` maps `edgeFlapGeom` to `{ adds: [poly], scores: [score] }`.
     - Order: all fold-overs (by `d.order`, then by array), then all flaps (the same). This is exactly today's order.
  3. **`extrasByPanel`.** Replace `geometry.ts:72–92` with one loop over `edgeFeatures(d)`, pushing into `at(id)` exactly as now (holes by their own `panelId`; adds, scores and liner holes on the owner). The connections loop stays.
     - Watch the **import cycle**: `geometry.ts` imports `foldover.ts`, and `edgeFeatures.ts` needs `edgeFlapGeom` / `flapOn` from `geometry.ts`. Either move `edgeFlapGeom` and `flapOn` into `edgeFeatures.ts` and re-export them from `geometry.ts` (`dividers.ts:420` imports `flapOn`), or keep them in `geometry.ts` and register the kinds lazily (`foldover.ts` / `outline.ts` already use the `import './outline'` side-effect pattern, `geometry.ts:10`).
  4. `three-geom.ts:67`: leave it as it is in 111 (it reads `p.edgeFlaps` directly), or read `featuresOnEdge`. No output change either way.
  5. Validation: no change in 111 (see Stale).
  6. Notes: `PROGRESS.md` and `DECISIONS.md` (*the registry; order kept; fold-over issues not moved, why*).
- **Feature-table rows**: none (no control).
- **Words**: none.
- **Tests**
  - New `tests/edgefeatures.test.ts`:
    - (a) for `v6CorrFoldover()` the registry's fold-over hits deep-equal `allFoldOvers(d)` mapped (adds, scores with `toward`, holes with the base's id, `linerHoles`);
    - (b) for `plainFlapBoard()` the flap hits equal `edgeFlapGeom` per flap;
    - (c) `extrasByPanel(d)` and `extrasByPanel(d, id)` for every panel of `v6CorrFoldover`, `plainFlapBoard`, `cardTray` and `closedBox(CARD)` deep-equal a copy of the old function kept in the test file (paste the pre-refactor body as `oldExtrasByPanel`);
    - (d) `extrasByPanel(d, baseId)` of `v6CorrFoldover` still contains the lock slots;
    - (e) an edge flap on a joined edge gives no hit.
  - Existing tests that must stay green: `tests/foldover.test.ts`, `tests/closures.test.ts` (plain flap case), `tests/netIn3d.test.ts`, `tests/golden.test.ts`.
  - E2E: none needed. If one is wanted, run `foldover.spec.ts` only.
  - **Golden impact**: two new cases, generated before the change; every file byte-identical after it.
- **Done when**
  - `extrasByPanel` reads only the registry for fold-overs and flaps.
  - The two new goldens and all old ones are byte-identical.
  - `edgefeatures.test.ts` passes, along with the typecheck and the unit suite.
- **Risks and owner questions**
  - A hidden behaviour change through `toward` or `only` (covered by test c).
  - An import cycle (step 3).
  - Memo key clash: use `'edgeFeatures'`, distinct from `'foldovers'` and `'extras'`.
  - Today a fold-over and a flap can share one edge (`canFoldOver` does not check `edgeFlaps`; `addEdgeFlap` does not check `foldOvers`). Keep that in 111 and decide in 112.
  - Owner: none.
- **Size**: **M**. The code is mechanical, but proving "no change" needs new goldens and an old-vs-new extras test, and the cycle and `only` details are easy to get wrong.


#### 112 Shaped flaps: tuck, dust, glue, hang (D3b)

- **Depends on / unblocks**
  - Depends on 111.
  - Unblocks the sentence's later mailer and envelope (SENTENCE_BUILDER_PLAN.md §8), 115 / D8's glue layer, and 114's flap-length handle (it works on any shape).
- **Already in the code**
  - `addEdgeFlap(d, panelId, edge, len?)` (`ops.ts:2199`; tests call it with a number, `tests/closures.test.ts:132`) and `setEdgeFlap(d, panelId, edge, len | null)` (`ops.ts:2209`).
  - `EdgeFlapField` (`src/ui/EdgeBar.tsx:146`, test ids `edge-add-flap`, `edge-flap`, `edge-flap-len`, `edge-flap-remove`, gated by `'edgeFlap'`) and `PictureChoice` / `PicName` (`src/ui/Pictures.tsx:18/112`).
  - Defaults to borrow:
    - `lipLength(cl, lidDepth) = cl.lip ?? clamp(0.3·depth, 12, 22)` (`closures.ts:159`);
    - the tuck lip insets `tL + 0.5` and `roundedTab(…, r = 4)` (`closures.ts:164`, private);
    - the dust flap: taper 15° at the hinge end and 8° at the far end, depth `min(L.w/2 − tS − 1, max(12, 0.45·L.w))`, no rounding (`closures.ts:230–269`);
    - `autoFlap(m)`: card 10, corrugated max(15, 4t), plywood 12 (`src/model/seams.ts:317`).
  - Fillet helper: `fillets` (`src/geom/fillet.ts:34`, re-exported from `edges.ts:124`).
  - 3D pattern: `Flap3d` (`types.ts:357`, with `owner`, `hinge: [V3, V3]`, `angle`, `frame`, `planeOf`), `flapMatrix` (`foldView.ts:147`), `Flaps` (`View3D.tsx:1372`) and `bandEndGeom` (`dividers.ts:413–435`: a flap at `t/2`, a score with `toward: 1`, a rotated frame).
  - `tests/netIn3d.test.ts` (connections only, `:33–52`) and `tests/flaps.test.ts` (`checkFlap`: the folded pose and the flat pose equal the net).
  - Checks go in `src/model/validate.ts`; fixes in `fixIssue` (`src/easy/fix.ts:104`).
  - `workshopOnly` (`src/easy/mode.ts:32`) lists what Quick build shows read-only.
- **Stale in the plan**
  - **"`EdgeBar.tsx` (the `FlapSection` block …)"**: the block is `EdgeFlapField`. It shows only on a free edge, under *More…*, and not on plywood (`EdgeBar.tsx:137`).
  - **"Round with the fillet helper round outlines use (`src/model/round.ts`)"**: `src/model/round.ts` holds round boards (`roundPts`, `withSeam`). The fillet maths is `src/geom/fillet.ts` (`fillets`). The closure's lip uses its own private `roundedTab` (`closures.ts:164`, 6 points per arc). Recommended: export `roundedTab` (generalised to tapered sides) or use `fillets` with a flattening of 0.05 mm, as the plan says.
  - **"`scoreIn` t/2 when the flap folds against a board"**: hand-made plain flaps use `scoreIn = 0` today (`geometry.ts:334`). `shape` absent must keep `flapOn(e, f.len)`, with `scoreIn = 0`. A shaped flap with `angle > 0` uses `t/2` (the `bandEndGeom` precedent). A hang tab at 0° uses 0.
  - **The defaults table, "dust: the closure's dust flap numbers", says `min(0.45·L, 40)` and r 3.** The closure uses `max(12, 0.45 × the lid's width)` with no rounding and no 40 mm cap. Pick one and write it down. Recommended: the plan's `min(0.45·L, 40)`, floored at 12 and capped so the far edge keeps 4 mm. Say in `DECISIONS.md` that it differs from the closure on purpose (a hand flap has no lid to measure).
  - **"tuck: 30% of the board's depth"**: `lipLength` takes the lid's depth. For a hand flap use the board's extent perpendicular to the edge (the distance from the edge to the farthest ring point, measured along `segInward`).
  - **"New `src/views/hinged3d.tsx` modelled on `FoldOverObject`"**: there is already a renderer for hinged flaps that unfold with `foldT`, namely `Flaps` + `flapMatrix` on `Flap3d`. Recommended: `EdgeFeatureOut.hinged: Flap3d[]` (`panelId = owner = the board`, `hinge` in the owner's local 3D coordinates, `angle`, `frame` = the owner's frame turned about the hinge). Extend `Flaps` to also draw `edgeFeatures(d).flatMap(h => h.out.hinged)`. That means no new file and no second matrix maths. Only build `hinged3d.tsx` if `flapMatrix` cannot express it.
  - **"`addEdgeFlap(d, panelId, edge, shape?: FlapShape)`"**: the fourth parameter is the length today and tests use it. Use `addEdgeFlap(d, panelId, edge, opt?: number | { shape?: FlapShape; len?: number })`.
  - **"`netIn3d.test.ts`: add the registry's `hinged` parts"**: the harness iterates `d.connections` only. Add a second `describe` over designs with shaped flaps that compares each registry `adds` area with a `hinged` area (angle ≠ 0) or the flat slab (angle 0).
- **Steps**
  1. **Types** (`src/model/types.ts`):
     ```ts
     export type FlapShape = 'plain' | 'tuck' | 'dust' | 'glue' | 'hang';
     export type EdgeFlap = { id: string; edge: string; len: number;
       shape?: FlapShape; taper?: [number, number]; inset?: [number, number]; r?: number;
       angle?: number; dir?: 'in' | 'out'; hole?: 'round' | 'euro' };
     // Panel.edgeFlaps?: EdgeFlap[]
     ```
     There is no schema bump. Existing items are `{ id, edge, len }`, which means plain, exactly as today.
  2. **`check.ts:193–195`**: keep the item filter, then sanitise each optional field and **delete a bad field rather than the flap**:
     - `shape` in the list;
     - `taper` two finite numbers in [0, 60];
     - `inset` two finite numbers ≥ 0;
     - `r` ≥ 0;
     - `angle` in [0, 180];
     - `dir` `'in'` or `'out'`;
     - `hole` `'round'` or `'euro'`.
  3. **Defaults** (`FLAP_DEFAULTS` in `edgeFeatures.ts` beside the geometry), t = the board's thickness, L = the edge's length:

     | shape | len | taper | inset | r | angle | dir | scoreIn |
     | --- | --- | --- | --- | --- | --- | --- | --- |
     | plain | stored | 30, 30 (the `flapOn` rule) | 0 | 0 | 0 (flat, as today) | — | 0 |
     | tuck | `lipLength({}, boardDepth)` | 0, 0 | t + 0.5 | min(4, len/2) | 90 | in | t/2 |
     | dust | max(12, min(0.45·L, 40)) | 15, 8 | 0 | 0 (or 3, owner) | 90 | in | t/2 |
     | glue | `autoFlap(m)` | 30, 30 | 0 | 0 | 90 | in | t/2 |
     | hang | max(25, len) | 0, 0 | 0 | 4 | 0 | — | 0, no score |

     Hang hole: round 6 mm, or a 32 × 6 mm slot with round ends, centred 10 mm from the far edge (§7 question 6).
  4. **Geometry**: `flapOutline(e: EdgeSeg, f: EdgeFlap, t: number): { poly; score | null; holes: P2[][] }` in `edgeFeatures.ts`.
     - `shape` absent or `'plain'` with no other field → `flapOn(e, f.len)`.
     - Otherwise, as the plan's steps 1–5:
       - corners `at(i0, −0.01)`, `at(L − i1, −0.01)` and the tapered far corners;
       - clamp each taper so the far edge stays ≥ 4 mm;
       - round the far corners;
       - the score from `at(i0, −scoreIn)` to `at(L − i1, −scoreIn)` unless it is a hang tab at 0°.
     - A hang hole goes to `holes` with the board's own id.
     - **The score's `toward`**: set it from `dir` and `frame.side`, as `bandEndGeom` does with `toward: 1` for "towards the material side". An `out` flap on an unmirrored board then exports as a perforation through the existing `pieces.ts:365–369` rule. This is intended (the fold overhaul's rule). Plain flaps keep no `toward`, so they stay scores.
  5. **3D.** For `angle > 0`, `flapKind.geom` returns one `Flap3d`:
     - `panelId: owner`, `owner`, `poly` = the flat outline (local);
     - `z0: 0`, `z1: t`;
     - `frame` = the owner's frame turned by `angle` about the crease line (direction from `dir`, as in `dividers.ts:425–434`);
     - `hinge` = the two crease ends as owner-local V3 at z = t/2 (milestone 22's pivot), and `angle`, so `flapMatrix` unfolds it with `foldT`. Check the sign against `tests/flaps.test.ts`'s `checkFlap`.

     Then:
     - `Flaps` (`View3D.tsx:1372`) also maps registry `hinged`;
     - `three-geom.ts:67` keeps only flaps whose effective angle is 0 (plain flaps and hang tabs) in `flatAdds`.
  6. **Ops** (`ops.ts:2199–2215`):
     - `addEdgeFlap(d, panelId, edge, opt?: number | { shape?; len? })` fills `FLAP_DEFAULTS[shape]` and stores only what differs from plain. It refuses plywood (as now) and an edge that carries a fold-over (new; `blocked`).
     - `setEdgeFlap(d, panelId, edge, patch: number | null | Partial<Omit<EdgeFlap,'id'|'edge'>>)`: a number keeps today's meaning, and `null` removes.
     - Changing `shape` resets the shape's defaults except `len` when the student set it (owner: or keep everything; recommended: reset).
     - Fill `blocked` for both kinds:

       | Reason | Key |
       | --- | --- |
       | plywood | `flap.why.plywood` |
       | joined edge | `flap.why.joined` |
       | already has a fold-over / flap | `flap.why.taken` |

       `canFoldOver` should also say `taken` when a flap is there.
  7. **Card** (`EdgeBar.tsx`, `EdgeFlapField`):
     - a `PictureChoice` of five pictures (`flap-shape-<shape>`);
     - length (`edge-flap-len`);
     - fold angle (`flap-angle`, 0–180, hidden for plain);
     - in/out (`flap-dir`);
     - the two tapers (`flap-taper-a`, `flap-taper-b`) and the radius (`flap-r`);
     - for a hang tab the hole (`flap-hole`).

     Wrap the shape row in `<div className="subsection" data-testid="flap-shape">` gated by `'flap.shape'`, and add `'flap-shape': 'flap.shape'` to `SECTIONS`.

     Add pictures `flapPlain`, `flapDust`, `flapGlue` and `flapHang` to `Pictures.tsx` (reuse `tuck`). Decide with the owner whether the flap block stays under *More…*. Recommended: yes in 112 (the rail and the card stay quiet), and it is reachable from the flat in 114.
  8. **Check** `val.flapNarrow` (`validate.ts`): `L − i0 − i1 − len·(tan τ0 + tan τ1) < 4`. Fix *Make it a plain flap* in `fixIssue`: `setEdgeFlap(…, { shape: undefined, taper: undefined, … })`. Target `{ kind: 'panel', id }`.
  9. **Annotations** (optional, no golden impact): `annotations()` (`src/export/annotate.ts:24–30`) writes *glue* only on joint glue flaps. Add glue-shaped edge flaps so the cut plan's *Dimensions* and the spec sheet name them. Exports are untouched, because `prepareExport`'s annotate callback is optional (`src/export/prepare.ts:79`).
  10. **Quick build**: a file with shaped flaps opened in Quick build shows them. Consider adding `'flap'` to `WorkshopWhy` in `workshopOnly` (`mode.ts:32`) so the board is read-only there (owner).
- **Feature-table rows**

  | Feature | Guided | Quick build | Workshop |
  | --- | --- | --- | --- |
  | `'flap.shape'` (shape pictures, angle, tapers, radius, hole) | hide | hide | show |
  | `'edgeFlap'` (existing) | hide | hide | show |

  - If G2 (105) is built, list `'flap.shape': 'hide'` in Guided's table too. Otherwise Guided falls back to Quick build's `'hide'`.
  - Add `'flap.shape'` to the literal hide list in `tests/quickTable.test.ts` (sorted after `'exportCheck'`).
- **Words** (en / he; the Hebrew is to be checked by the owner)

  | Key | English | Hebrew |
  | --- | --- | --- |
  | `flap.shape` | *Shape* | *צורה* |
  | `flap.shape.plain` | *Plain* | *פשוטה* |
  | `flap.shape.tuck` | *Tuck* | *תחיבה* |
  | `flap.shape.dust` | *Dust flap* | *כנף אבק* |
  | `flap.shape.glue` | *Glue flap* | *לשונית הדבקה* |
  | `flap.shape.hang` | *Hang tab* | *לשונית תלייה* |
  | `flap.angle` | *Folds* | *מתקפלת* |
  | `flap.dir.in` | *In* | *פנימה* |
  | `flap.dir.out` | *Out* | *החוצה* |
  | `flap.taperA` | *Slope at the start* | *שיפוע בהתחלה* |
  | `flap.taperB` | *Slope at the end* | *שיפוע בסוף* |
  | `flap.r` | *Corner radius* | *רדיוס פינה* |
  | `flap.hole` | *Hole* | *חור* |
  | `flap.hole.round` | *Round* | *עגול* |
  | `flap.hole.euro` | *Euro slot* | *חריץ אירו* |
  | `flap.why.plywood` | *Plywood does not fold* | *דיקט לא מתקפל* |
  | `flap.why.joined` | *This edge is joined* | *הקצה הזה מחובר* |
  | `flap.why.taken` | *This edge already has a fold-over or a flap* | *כבר יש על הקצה הזה קיפול כפול או לשונית* |
  | `val.flapNarrow` | *{panel}: the flap is wider than its edge allows* | *{panel}: הלשונית רחבה ממה שהקצה מאפשר* |
  | `fix.flapPlain` | *Make it a plain flap* | *להפוך ללשונית פשוטה* |

  If the fix is described in a separate key, follow whatever pattern `fix.ts` uses for its labels *(unverified)*.
- **Tests**
  - New `tests/flapshapes.test.ts`, on a card board with a 60 mm edge:
    - each shape's area, far-edge width and score ends;
    - a tuck's inset is t + 0.5 and its score is t/2 inside;
    - a hang tab has one hole on its own board and no score at angle 0;
    - `shape` absent equals `flapOn(e, len)` **byte for byte** (score on the edge);
    - the tapers are clamped so the far edge stays 4 mm;
    - at `foldT = 0` the `Flap3d` slab through `flapMatrix` lies on the net's add (reuse `flaps.test.ts`'s `slab` / `flatSlab` helpers), and at 1 it is turned by `angle` about the crease;
    - an `out` flap's score has the opposite `toward` and exports as perforation dashes;
    - `addEdgeFlap(d, p, 'e2', 15)` (the old call) still works;
    - a fold-over edge refuses a flap;
    - `check.ts` drops a bad `taper` and keeps the flap;
    - `val.flapNarrow` and its fix.
  - `tests/netIn3d.test.ts`: a second `describe` over hand-built designs with each shape, asserting every registry add is matched by a `hinged` part of about its area, or is flat (angle 0).
  - `tests/quickTable.test.ts`: the hide list.
  - `tests/i18n.test.ts`: parity.
  - E2E `tests/e2e/flaps.spec.ts`:
    - Workshop, a card board;
    - select an edge, open *More…*, *Add a flap*;
    - choose *Tuck*, then *Hang tab*;
    - check that the cut plan shows a hole (wait for the lazy chunk);
    - set the angle to 90 and see the fold slider move it;
    - Hebrew.
  - **Goldens**: the new cases `flap-card-tuck-dust` (a hand-built card lid board with one tuck and two dust flaps) and `flap-card-hang`. Every earlier file, including 111's `flap-card-plain` and `foldover-corr`, stays byte-identical.
- **Done when**
  - A hang tab and a hand-made tuck flap can be added from the grow card, fold in the 3D preview with the fold slider, and export clean.
  - `flap-card-plain` and every older golden are unchanged.
  - The new goldens are reviewed by eye.
  - "From either view" becomes true when 113 shows `EdgeBar` in *Nets*.
- **Risks and owner questions**
  - `flapMatrix` sign and pivot (a test before the renderer change).
  - Perforated `out` flaps surprise a student (state it in the card's help).
  - Dust defaults differ from the closure's.
  - A shared edge (fold-over plus flap) in old files: keep both, and refuse new ones.
  - `curveBlocked` ignores flaps (a curved edge with a flap: today the flap follows the flattened segment) *(unverified behaviour)*.
  - Owner:
    - the hang hole sizes (§7 question 6);
    - whether a shape change resets the tapers and radius;
    - whether the flap block stays under *More…*.
- **Size**: **L**. New geometry, five shapes, 3D folding, a check with a fix, a card with pictures, two goldens and an e2e spec.


#### 113 The Net view: *Sheets · Nets* in the cut plan (D1)

- **Depends on / unblocks**
  - Depends on 102 (`useViewBox`, built) and 104 (`Edit2DLayer` drawn through `placedOf`, built).
  - Uses 111 (`featuresOnEdge`) for what an edge carries.
  - Unblocks 114.
- **Already in the code**
  - `Plan2D` and its layout, coordinate helpers, `Drag` and fold-line contours (`Plan2D.tsx:42–143`, `:598–631`).
  - `useViewBox` (`canvas2d.tsx:20`, keyed per mode).
  - `pieceCopies` / `PieceCopy` (`pack.ts:25`, `:8`; `panels[].xf` before the origin shift).
  - `netFolds` (`pieces.ts:78`), `foldHolds` (`:60`), `netOverlaps` (`:505`).
  - `panelEdges` / `findEdge` / `isCurveKey` (`edges.ts:240/256/77`) and `edgeHasRoom` (`adapt.ts:70`).
  - `applyX` / `IDENTITY` (`src/geom/vec`) and `SNAP_PX` (`src/geom/types`).
  - Store: `select`, `set({ openJoint })` (`store.ts:247`, read by `Connections.tsx:158–171`, which opens that joint's row), `ViewPrefs` (`:127`) and `setPrefs` (`:620`).
  - `App.tsx` lazy view switch (`:20`, `:84–88`).
  - `Inspector.tsx:109` (the edge card is 3D-only).
  - `View3D` (`View3D.tsx:2803`, no props; `FoldBar` at `:2784`; `GrowGhost` mounted at `:760`; the edge `+` handles inside `PanelObject` `:1014`; the view cluster `toggle-ortho` / `toggle-joints` / `toggle-outline` at `:2904–2930`).
  - `conn.valley` / `conn.mountain`.
- **Stale in the plan**
  - **"`src/App.tsx` (about line 58, the `view === '3d' ? <View3D/> : …` switch)"**: it is now `App.tsx:86–90`, and Plan2D is `React.lazy` (`:20`). `NetView` must be lazy too, inside the same `Suspense`, and added to the prefetch at `:56` (`void import('./views/NetView')`). E2E specs must wait for its chunk.
  - **"Inspector (about line 105)"** is now `Inspector.tsx:109`.
  - **"Check whether `copy.panels` is already in bbox coordinates"**: it is not. Subtract `copy.origin` (as `Plan2D.tsx:140–141` does).
  - **The layout branch.** With `xf: IDENTITY` and `H: copy.h`, `toSvg` maps y to `H − y`, so every net is **top-aligned at y = 0**. No baseline fix is needed. Fit the view box on the total width and the tallest net.
  - **"`tests/netpick.test.ts` on `cardTray()`: one piece; each wall's top edge is free …"**: `cardTray()` has **3 pieces** *(probe: a 6-board net, plus a 60 × 40 board with a 60° glued board)*. Its second-level fold (15 mm, 90° up from wall 0's top) is glued by `autoConnect` to two neighbouring walls' tops. Only 2 of its 5 standing boards have a free `e2` *(probe)*. Use a plain card tray built in the test (`addRootPanel` + four `growPanel(… 'fold')` + `autoConnect`), or derive the expectations from `edgeHasRoom`.
  - `cartonDesign(CARD, 'tuck', 'snap')` is one piece of 5 boards with a `glue` seam *(probe)*, so that assertion holds.
  - **"`'plan.nets': 'hide'`" is placed in D2.** It belongs here (the switch is built here). ROADMAP §5.2 row 10 says *Nets* is hidden in Guided.
  - **"View3D: find what it hides for `folded` and reuse that switch"**: `folded = foldT < 0.999 || assemble !== null` (`View3D.tsx:204`) gates editing everywhere. A preview must still let the fold slider run, so add a separate `preview` prop rather than reusing `folded`.
- **Steps**
  1. **Store** (`store.ts` `ViewPrefs`): add `planMode?: 'sheets' | 'nets'` (absent means sheets) and `netPreview?: boolean` (absent means true). Both are per browser through `setPrefs`. `setView` and `View` are unchanged.
     - Switching to nets: `setPrefs({ planMode: 'nets' })` also clears `sheetCopy` and drops a `sel.kind === 'detail'` selection only if it is invalid (not needed: details are kept).
     - Leaving the cut plan keeps `planMode`.
  2. **`src/views/netPick.ts`** (pure):
     ```ts
     export type NetEdge = { panelId: string; key: string; a: Vec2; b: Vec2; free: boolean; foldId?: string; jointId?: string; features: EdgeFeatureHit['kind'][] };
     export function netEdges(d: Design, copy: PieceCopy): NetEdge[]    // copy coordinates (origin subtracted)
     export function foldChips(d: Design, copy: PieceCopy): { foldId: string; at: Vec2; dirDeg: number; angle: number; valley: boolean }[]
     ```
     - For each `{ panelId, xf }` of `copy.panels`, take `panelEdges(p)`, skip `isCurveKey`, and compute `applyX(xf, ·) − origin`.
     - `free = edgeHasRoom(d, panelId, key)`.
     - `foldId`: the connection with `foldHolds(d, c)` whose `(a.panelId, findEdge(A, a.edge).key)` or `(b.panelId, …)` is this edge. That covers grown folds (`a.edge` / `b.edge`), tray corners made folds (`hingeOf`) and wings.
     - `jointId`: any other connection on that edge (`b.edge !== 'face'`).
     - `features` from `featuresOnEdge` (111).
     - Chips: the midpoint of each fold's score in the piece. Either take the contour with `ref.foldId` (`pieces.ts:399–401`) from `copy.contours`, which is already in copy coordinates (simplest), or use `foldBand`. Add `Connection.angle` and `foldDir`.
  3. **`Plan2D`** gets `{ soloPanel?: string; mode?: 'sheets' | 'net' }`, and `modeKey = solo ? 'solo:…' : mode === 'net' ? 'nets' : 'sheets'`.
     - Layout branch before the sheets one: `pieceCopies(d).filter(c => c.copy === 0)`, laid out in a row with `GAP`, `xf: IDENTITY`, `ox` accumulated, `H: copy.h`, `placements: {}`, `slots: []`.
     - With `placements: {}`, `onPieceDown` starts no `piece` drag. Also do not set `sheetCopy` in net mode.
     - `fitVB` for net mode: the row's width and the tallest net, with the same rail and card margins.
     - In net mode do not render the sheet slots, `repack`, `YieldBar` or `badPieces`' off-sheet colouring. Keep `netBad` (overlaps), the labels, `planDims` annotations and the legend.
     - Picking layer (after the pieces' `<g>`, before the handles), for copy 0:
       - one transparent `<line class="edge-hit">` per `NetEdge`, `strokeWidth = SNAP_PX · px`, `data-testid="net-edge-<panelId>-<key>"`;
       - hover on a free edge shows a `+` pill;
       - pointer-down (with `stopPropagation`):
         - a free edge → `select({ kind: 'edge', panelId, edge: key })`;
         - an edge with `foldId` → `select({ kind: 'panel', id: child })` and `set({ openJoint: foldId })`;
         - another joined edge → `select` its board and `set({ openJoint: jointId })`;
       - fold-line contours get the same fold handler in net mode (today `pointerEvents="none"`, `:627`);
       - a selected edge is drawn as a thick `#1fb8ac` line;
       - fold chips are drawn at screen size (`px`), `class="fold-chip"`, `pointerEvents="none"`, text `90°` plus a valley or mountain mark (titles `conn.valley` / `conn.mountain`).
     - Double-click in net mode: **do not open solo for a board**. Keep 104's `edit2dAt` for shapes and lines in place, and allow its board target in net mode too (`if (solo || mode === 'net')`). `Edit2DLayer` already works through `placedOf`. This delivers D2's "outline editing in the flat" here for free. Say so in `PROGRESS.md`.
     - Hint: `net.hint` in net mode.
  4. **The switch.** A two-way segmented control in the plan dock beside `plan-dims` (`Plan2D.tsx:808`), hidden in solo, gated by `'plan.nets'`. Test ids `plan-mode-sheets` and `plan-mode-nets`, `aria-pressed`, with `plan.sheets` / `plan.nets`.

     The switch must also be reachable from `NetView` (Plan2D in net mode renders the same dock).
  5. **`src/views/NetView.tsx`**: a flex row.
     - Left: `<Plan2D mode="net" />`.
     - Right, when `netPreview !== false` and the window is ≥ 900 px: `<View3D preview />` at 40% width, min 320 px.
     - A toggle `net-preview-toggle` in the plan dock.
     - Under 900 px, a button shows the preview in place of the net.
     - Mount it lazily in `App.tsx`: `view === '2d' && planMode === 'nets' && featureShown('plan.nets') ? <NetView/> : <Plan2D/>`.
  6. **`View3D({ preview }: { preview?: boolean })`**: with `preview`, hide:
     - the stage docks (the view cluster, settings, `MissionPanel` is already outside);
     - the edge `+` handles (`PanelObject` `edges={false}`);
     - gizmos, hinge and divider widgets, the polygon and panel tools, and the empty-stage hint.

     Keep orbit, selection highlight, `FoldBar` and the fold slider.
     - **Recommended for 113**: keep `GrowGhost` and its 3D ✓ in the preview, so an edge picked in the flat can be grown before 114 exists.
     - In 114, hide it in `preview` and use the flat ✓, so there is never a ✓ in both places.
     - Two keyboard listeners now coexist (View3D's `o` and Plan2D's Esc); check that `o` does not fire while typing in a card (it already checks the tag name).
  7. **Inspector** `:109`: show `EdgeBar` when `view === '3d' || (view === '2d' && viewPrefs.planMode === 'nets')`. The board card's `edges-section` (`Inspector.tsx:311`; its rows select an edge at `:321`) then works in *Nets* too.
- **Feature-table rows**

  | Feature | Guided | Quick build | Workshop |
  | --- | --- | --- | --- |
  | `'plan.nets'` (the *Sheets · Nets* switch, NetView, the edge picking) | hide (§5.2 row 10) | hide (§7 question 1) | show |

  - Add it to `quickTable.test.ts`'s hide list (after `'outline.mode'`, sorted).
  - When nets are hidden and `planMode === 'nets'` is stored, render Sheets (never strand a Quick build user in nets).
- **Words**

  | Key | English | Hebrew |
  | --- | --- | --- |
  | `plan.mode` (group label) | *Show* | *הצגה* |
  | `plan.sheets` | *Sheets* | *גיליונות* |
  | `plan.nets` | *Nets* | *פריסות* |
  | `net.preview` | *Folded preview* | *תצוגה מקופלת* |
  | `net.showPreview` | *Show it folded* | *להציג מקופל* |
  | `net.showNet` | *Show the net* | *להציג את הפריסה* |
  | `net.hint` | *Click an edge to grow from it or add a flap; click a fold to change it.* | *לחצו על קצה כדי להצמיח ממנו או להוסיף לשונית; לחצו על קיפול כדי לשנות אותו.* |
  | `net.addHere` (the `+` pill title) | *Grow from this edge* | *להצמיח מהקצה הזה* |
- **Tests**
  - New `tests/netpick.test.ts`:
    - on a 4-wall card tray built in the test: one piece; each wall's `e2` free; its `e0` has a `foldId`; its side edges carry a glue `jointId` and are not free; the base's four edges carry fold ids;
    - every `NetEdge`'s ends lie on the piece's outer contour or a `ref.foldId` score (within 1e-6, in copy coordinates);
    - on `cartonDesign(CARD, 'tuck', 'snap')`: one piece; the glue seam's edges are joined, not free;
    - a hexagon card tray (`addPolygonPanel` + `addTray`) gives edges on turned boards;
    - `foldChips` gives one chip per fold with its angle.
  - `tests/store.test.ts`: `setPrefs({ planMode: 'nets' })` is written to `cutforge.viewPrefs`; switching views keeps it; `ONLY_3D` still resets the tool.
  - `tests/quickTable.test.ts` and `tests/i18n.test.ts`.
  - E2E `tests/e2e/nets.spec.ts`:
    - a card tray, *Cut plan* (wait for the lazy chunk), `plan-mode-nets`;
    - expect a `net-edge-*` for each wall top;
    - click a wall top → `edgebar` visible;
    - click a fold line → the joint row open;
    - the fold slider in the preview moves;
    - viewport 800 px → the preview is hidden and `net-preview-toggle` shows it;
    - in Quick build the switch is absent;
    - Hebrew (the stage stays `dir="ltr"`).
  - Goldens: byte-identical (view only).
- **Done when**
  - A student switches the cut plan to *Nets* and sees a card tray's cross with the folded tray beside it.
  - Clicking a wall's top edge opens the grow card (and the 3D preview's ✓ grows it).
  - Clicking a fold opens its joint (and the hinge dial for a grown board).
  - Goldens byte-identical, and the unit suite and typecheck green.
- **Risks and owner questions**
  - Two canvases on a Chromebook (plan §8: the preview can be turned off, is remembered, and is not mounted under 900 px).
  - Nets of many pieces are wide (fit and zoom work).
  - A split net (`Connection.split`) shows as separate pieces, which is fine.
  - The 3D ✓ in the preview during 113 (recommended above).
  - Owner: §7 questions 1 and 10.
- **Size**: **M**. One pure module, a layout branch, a picking layer, a lazy view, a `preview` prop and one e2e spec.


#### 114 Building in the flat (D2)

- **Depends on / unblocks**
  - Depends on 113 (*Nets*, picking, `EdgeBar` in nets) and 104 (`Edit2D`).
  - The flap handle is more useful after 112 but works on plain flaps.
  - Unblocks the plan's D4 and D7 dev looks (owner-gated), and 118's verification.
- **Already in the code**
  - `effectiveGrow` and `growWith` (`ghost.ts:31`, `:84`), `ghostPanel` (`adapt.ts:39`; id `'ghost'`, attached by `e0`) and `sketchRing` (`edges.ts:167`).
  - `grownFoldXform`, `foldXform` and `netGroups` (`pieces.ts:68/37/141`), and `foldLay` (`crease.ts:54`).
  - `growOverlap` (`ghost.ts:99`): the pattern "grow on a JSON copy, read the net".
  - `heightTargets` / `snapTo` (`adapt.ts:154/142`) and `heightMarks` (`lid.ts:307`). The 3D arrow uses both (`View3D.tsx:1562–1563`).
  - `closeChoices` / `closeChoice` (`lid.ts:270/297`), `closeAsGo` / `doGrow` / `ownGrowKind` (`ghost.ts:74/57/112`), and the 3D ✓ decision (`View3D.tsx:1612`).
  - `ConfirmBar` (`panelTool.tsx:123`, ids `grow-ghost-bar` / `grow-go`) and `PendingBarHtml` (`:381`).
  - `setEdgeFlap` (`ops.ts:2209`), `setPanelSize` (`:1059`), `setTrayHeight` (`:537`), `setCustomHeight` (`:574`), `isRectSketch` (`edges.ts:301`) and `setBoxSize` / `boxSize` (`src/model/boxSize.ts:86/57`).
  - Store `preview` / `commit` / `cancel` (`store.ts:301–303`) and `setGrow`.
  - `PanelHinge` (`Connections.tsx:254`).
- **Stale in the plan**
  - **"Use `foldXform(parent, edge, allowance, s0)` as `netFolds` does"**: since the fold overhaul, `netFolds` uses `grownFoldXform` → `foldLay(...).a`, or a band's developed length when the fold has a radius (`bandOf`, which needs a real connection). A ghost has no connection, and `tOf(d, 'ghost')` falls back to the working material, so a closed form misses bands and per-board materials.
    - Recommended `ghostInNet`: grow on a JSON copy with `growWith` (exactly what ✓ will do), take the new board's `NetPanel.xf` from `netGroups(copy)`, and cache that transform per `(design, edge, grow without height)`.
    - During the height drag, map `sketchRing(ghost)` points through the cached transform (the transform does not depend on height for a fold; check it in the test).
    - This is exact by construction and costs one solve per grow change, as `growOverlap` already does.
  - **"✓ shown with `PendingBarHtml` (already imported by `Plan2D`)"**: `PendingBarHtml` calls `confirmPending` / `cancelPending` only. Generalise it into `ConfirmBarHtml({ x, y, onOk, onCancel, okDisabled, testId, okTestId, children })` and make `PendingBarHtml` a wrapper. Use `testId="grow-ghost-bar"` and `okTestId="grow-go"` so specs match 3D.
  - **"The ✓ logic."** Do not copy `View3D.tsx:1612`. Move it into one function in `ghost.ts`, `growConfirm(panelId, edge): { ok(): void; disabled: boolean; label?: … }` (the Quick build `closes` path, Workshop `closesW` / `closeAs`, `blocked`, the overlap and *own piece* path), and call it from both views.
  - **"The joint card in the flat: add a `NumField` for `angle` if not editable"**: it is already editable. `PanelHinge` (an `AngleDial`, `conn-angle-*`) is on a grown board's card, which 113's fold click selects. Nothing to build. Tray corners made folds (`hingeOf`) have no angle to edit.
  - **"Outline editing in the flat (with D0b-2)"**: done in 113, step 3, if 113 follows that brief. Otherwise do it here (`onDouble`: no `openSolo` in net mode; `edit2dAt` board target in net mode).
  - **"Done when a reverse-tuck box can be built without leaving *Nets* except to draw the first base."** Not achievable as written:
    - `closeChoices` only answers for a **tray** wall's top edge (`boxOfWallTop`, `lid.ts:254`; `reachFor` needs a tray, `closures.ts:46–51`). Walls grown one by one in the flat are not a tray, so no *Closes the box* appears (plan F5; D4 is owner-gated).
    - A tray's cut base has no tuck bottom.

    Restate it: *start from a card tray (the Box tool or the sentence), then in Nets grow the lid off the back wall to the snap at the front wall, pick the tuck, ✓, add a hang tab on the back wall's flap and drag its length; the lid, lip and dust flaps appear in the net and fold in the preview.*
  - **`'net.build'` and `'plan.nets'` features**: `'plan.nets'` moved to 113.
- **Steps**
  1. **`ghost.ts`**:
     - `growConfirm(...)`, extracted from `View3D.tsx:1600–1640`; `GrowGhost` then calls it (no behaviour change: run `grow-cleanup.spec.ts`, `closures.spec.ts`, `lids.spec.ts`).
     - `ghostNetXf(d, copyPanels, panelId, edge, grow): Xform2 | null` (grow on a copy, read `netGroups`).
     - `ghostInNet(d, copy, panelId, edge, ghost, xf): Vec2[] | null` (`sketchRing(ghost).map(e => applyX(xf, e.a)) − copy.origin`). Put them in `src/views/netPick.ts` beside 113's code.
  2. **The ghost in `Plan2D`** (net mode, `sel.kind === 'edge'`, `edgeHasRoom`, `'net.build'` shown):
     - a dashed polygon in the selection colour, with its size label;
     - the `grow-overlap` note in amber (from `growOverlap`);
     - a joint that is not a fold (plywood, or a kind chosen on the card) is drawn beside the edge in a lighter style with `net.ownPiece`, and is not blocked;
     - hide the 3D preview's `GrowGhost` when `preview` (113 step 6).
  3. **Height handle**: `Drag` kind `{ kind: 'growH'; panelId; edge; axis: Vec2; base: Vec2; h0: number }`. On move:
     - project onto `axis` (svg → piece → mm);
     - snap to `heightTargets(d, plain, new Set([panelId]))` ∪ `heightMarks(d, panelId, plain).map(m => m.y)` with `snapTo`, tolerance `SNAP_PX · mmPerPx()`, else `gridSnap`;
     - `setGrow({ height })` (store state, not the design, so no undo step);
     - show the mark's name (`grow.mark.*`, as 3D does).
  4. **✓ bar**: `ConfirmBarHtml` at the ghost's far edge (screen position as `pendingAt` computes it, `Plan2D.tsx:483–499`), wired to `growConfirm`. Enter = ✓; Esc selects the parent board (as 3D's cancel does).
  5. **Flap handle**: for each flap on a board in the net (from `featuresOnEdge`, kind `'flap'`), a handle at the middle of its far edge. `Drag` `{ kind: 'flapLen'; panelId; edge; axis; base }`:
     - `preview(x => setEdgeFlap(x, panelId, edge, len))`;
     - `commit()` on release;
     - `cancel()` on Esc (already wired at `Plan2D.tsx:323–330`).
  6. **Board resize** (selected board in net mode, `isRectSketch`, not locked): handles at the middle of each **free** straight edge. `Drag` `{ kind: 'boardSize'; panelId; edge; … }`:
     - a root board: `setPanelSize` with `w` or `h`, about the opposite edge (check how `setPanelSize` anchors; move `cx`/origin if needed *(unverified anchoring)*);
     - a grown board: its far edge only, as `h`;
     - a tray wall: `setCustomHeight(…, true)` then `setPanelSize`, or `setTrayHeight` for all walls (what `TrayUI` calls *(unverified which)*);
     - a tray base: `setPanelSize` (outside) is fine for a drag; label it in the design's intent through `boxSize`.

     One undo step per drag through `preview` / `commit`.
  7. **Features**: `'net.build'` gates steps 2–6. When it is hidden, *Nets* is read-only picking.
- **Feature-table rows**

  | Feature | Guided | Quick build | Workshop |
  | --- | --- | --- | --- |
  | `'net.build'` (the ghost, height handle, ✓, flap and board handles in *Nets*) | hide (§5.2 row 10: no ghost and ✓ in Guided) | hide | show |

  Add it to `quickTable.test.ts`'s hide list (after `'match'`).
- **Words**

  | Key | English | Hebrew |
  | --- | --- | --- |
  | `net.ownPiece` | *Cut as its own piece* | *נחתך כחלק נפרד* |
  | `net.dragHeight` | *Drag to set the height* | *גררו כדי לקבוע את הגובה* |
  | `net.dragFlap` | *Drag to set the flap's length* | *גררו כדי לקבוע את אורך הלשונית* |
  | `net.dragSize` | *Drag to resize* | *גררו כדי לשנות גודל* |
  | `net.buildHint` | *Drag the dashed board's far edge, then ✓.* | *גררו את הקצה הרחוק של הלוח המקווקו, ואז ✓.* |

  Reuse `grow.*`, `ghost.ok`, `ghost.cancel` and `grow.mark.*`.
- **Tests**
  - New `tests/netbuild.test.ts`:
    - `ghostInNet` for a card tray wall's top edge at 90°: its four points equal the new board's corners through its `NetPanel.xf` (minus the origin) after `growWith` on the design (1e-6);
    - the same on a hexagon card tray's turned wall, on a part-edge span, and with a fold with a radius (a band: `bandLidBox(CARD, 8)`'s parent edge, if it has a free one *(unverified)*);
    - the cached transform is the same for two heights;
    - `growConfirm` gives the same choice as before the extraction for a tray top (Workshop `closeAs` default) and a free root edge (`doGrow`);
    - store level: `flapLen` three `preview`s and a `commit` make one undo step, and `cancel` leaves the design as it was;
    - a `boardSize` drag on a root rectangle is one step and keeps the joints on their edges.
  - E2E `tests/e2e/nets-build.spec.ts`:
    - a card tray (the Box tool or `startTemplate('box', 'card-0.5')` through the hook);
    - Cut plan → Nets;
    - click the back wall's `e2`;
    - drag the ghost's height handle to the front-wall mark (`grow-mark` visible);
    - `grow-close-tuck` picked on the card; `grow-go`;
    - the lid and its lip in the net (a new `net-edge-*` for the lid's edges), and the preview folds it;
    - undo removes it in one step;
    - add a flap from the card and drag its handle;
    - Hebrew.
  - Run `grow-cleanup.spec.ts`, `closures.spec.ts` and `lids.spec.ts` once for the `growConfirm` extraction.
  - Goldens: byte-identical.
- **Done when** (restated, see Stale)
  - From a card tray, the student can, without leaving *Nets*:
    - grow the lid to the front wall's mark;
    - choose the tuck and ✓;
    - add and drag a flap;
    - resize a free board edge;
    - double-click a board to edit its outline.
  - Each is one undo step, and the preview shows the fold.
  - Goldens byte-identical; the 3D grow behaves as before.
- **Risks and owner questions**
  - A solve on a copy per grow change: measure on the organiser. `growOverlap` already does this, so the expected cost is about 2×.
  - Board resize anchoring and tray rules (read `TrayUI` before step 6).
  - Two ✓ bars if 113's preview ghost is not hidden here.
  - Touch screens (no hover on the `+` pill; handles need about 24 px).
  - Owner:
    - whether *Nets* building should also work in Quick build (default no; it would need Quick build's `wallClosesBox` / `closeBoxGo` path, which `growConfirm` already contains);
    - whether hand-grown walls should close (that is D4, §7 question 8).
- **Size**: **L**. A ghost, three drag kinds, a shared ✓ extraction that touches the 3D grow, and a spec. The plan's M predates the overhaul and the restated Done.


### Open questions for the owner (DIELINE_DNA_PLAN.md §7, those relevant to 111–114 and still open)

| # | Question (§7) | Milestone | Recommended default |
| --- | --- | --- | --- |
| 1 | Does Quick build get *Nets*? | 113, 114 | **No**: `'plan.nets'` and `'net.build'` are `'hide'` in Quick build and Guided (Guided by ROADMAP §5.2 row 10). A stored `planMode: 'nets'` falls back to Sheets when hidden. |
| 6 | Hang tab hole sizes | 112 | **Round 6 mm; euro slot 32 × 6 mm** centred 10 mm from the far edge. Mark them as starting values until checked against the school's or client's hooks. |
| 10 | *Nets* as a switch in the cut plan, or a third top tab? | 113 | **A switch** in the plan dock beside *Dimensions* (decision 2; the owner asked for a less busy interface). Only the switch's place changes if a tab is preferred. |
| 8 | Closures without a tray (D4)? | affects 114's Done | **Not now.** 114's Done is restated to start from a tray. Hand-grown walls in *Nets* do not offer *Closes the box* until `boxOf` is written down (D4). |

Further questions raised while checking the code (not in §7):

| # | Question | Milestone | Recommended default |
| --- | --- | --- | --- |
| a | Should hand-made **plain** flaps move their score t/2 inside the edge, like the overhaul's glue and lock flaps? | 112 | **No.** Keep plain byte-identical (`scoreIn = 0`). Shaped flaps that fold use t/2. A plain flap can be made a *Glue* flap to get it. |
| b | Dust flap default: the plan's `min(0.45·L, 40)` with r 3, or the closure's `max(12, 0.45·lid width)` with no rounding? | 112 | **The plan's**, floored at 12, r 0 (sharp, as the closure's), recorded in `DECISIONS.md`. |
| c | One feature per edge (a fold-over and a flap on one edge today both cut)? | 112 | **Refuse new doubles** (`flap.why.taken`); keep old files as they are. |
| d | Does a shaped flap make its board read-only in Quick build (`workshopOnly`)? | 112 | **Yes**, add `'flap'` to `WorkshopWhy`, as fold-overs are. |
| e | During 113 (before 114), may the 3D preview beside *Nets* keep its ✓ so an edge picked in the flat can be grown? | 113 | **Yes in 113; moved to the flat in 114** (never both). |
| f | A flap folding *out* exports as a perforation (the overhaul's rule for folds away from the scored face). Fine? | 112 | **Yes**, with a note on the card. |

---

## Part 3: 115–118 and the parked items

Written 2026-11-19 against `main` at `e88e115` (code splitting, after milestone 104). The working tree was clean. Baseline checked: `quickTable`, `i18n` and `boardmaterials` pass (15 tests).

**Where the code stands.** Milestones 92–104 and code splitting are built. **Milestones 105–114 are not built**: Guided G2–G7, the edge-feature registry and shaped flaps (D3), the Net view (D1) and building in the flat (D2). Everything below is written so that 115–117 can be built before or after 105–114. Where the order matters, the brief says so.

**Numbers.** `ROADMAP.md` §5.1 numbers the milestones: 115 is D8, 116 is D5b, 117 is D9 and 118 is D10 with G7's final check. Commit messages carry both, for example `Milestone 115 (Dieline D8): the artwork template`. The settlements in `ROADMAP.md` §5.2 override the plans. Rule 4b applies: every new feature row states its state in Guided, Quick build and Workshop.

**Facts every brief relies on (all checked):**
- **Schema.** `SCHEMA_VERSION = 11` (`src/model/types.ts:521`). The migrations are `MIGRATIONS` at `src/model/serialize.ts:23`; the last one, 10→11, is at `serialize.ts:103-117` and uses `materialById`. **None of 115–117 needs a schema bump** (rule 4 of `DIELINE_DNA_PLAN.md` §4). Every new stored field is optional. Every one is accepted, or dropped when bad, in `checkDesign` (`src/model/check.ts:350`) or in `material()` (`check.ts:58`).
  - `material()` does **not** strip unknown fields. A new `MaterialProfile` field must be validated there, or a bad value passes straight through to the interface.
- **PDF tooling.** No PDF writer is in `package.json`. `LIDS_LINES_PROJECTS_PLAN.md` decision 10 and `DECISIONS.md:424` say "no PDF library". `pdfinfo`, `pdftoppm` and `pdftocairo` (poppler) are installed in this container for checking by hand.
- **Lazy loading.**
  - `ExportDialog` is `React.lazy` (`src/App.tsx:21`) and prefetched once the editor is up (`App.tsx:56-57`), so it works offline.
  - Built chunk sizes on 19 Nov (`dist/assets`): ExportDialog 11.3 KB, Plan2D 36 KB, index 396 KB, store 506 KB, three 815 KB, r3f 416 KB, opentype 237 KB.
- **The feature table** is Quick build's alone today: `FEATURES` at `src/easy/features.ts:12`, `SECTIONS` at `features.ts:121`, `useFeature` at `features.ts:188`.
  - Guided's second table arrives with G2 (milestone 105).
  - If 115–117 land **before** 105, write the Guided state in each row's doc comment as `Guided: hide`, and G2 copies it into its table.
  - If they land **after** 105, add the row to both tables in the same commit.
  - `tests/quickTable.test.ts:76-118` pins the sorted lists of what Quick build shows, reads only and hides.
- **Words.** `he.ts` is typed `Record<MsgKey, string>`, so a missing Hebrew key is a type error. `tests/i18n.test.ts` checks keys and hard-coded text.
  - Hebrew terms already in use: בריסטול (card), קרטון גלי (corrugated), דיקט (plywood), מ״מ, ניקוב (perforation), דבק (glue), גיליון (sheet).
  - Every Hebrew string below is a draft for the owner's native-speaker review.


#### 115 The artwork template (PDF and SVG) (D8)

- **Depends on / unblocks**
  - **Depends on:**
    - lines (83), crease styles (85), annotations (89), the spec sheet (90), all built;
    - the fold overhaul's automatic rim perforations (`ROADMAP.md` §5.2 row 13), built.
  - **Optional:** shaped *glue* flaps from D3b (112). If 112 has landed, its glue-shaped flaps join the glue layer. If not, only `glue` joints' flaps do.
  - **Unblocks:** D10's printer preflight and the owner's check in Illustrator or Affinity. Nothing in the code waits for it.
- **Already in the code**
  - Pieces and copies:
    - `pieceCopies(d)` (`src/model/pack.ts:25`) gives piece-local contours with the bounding-box minimum at (0, 0), `origin`, `panels: NetPanel[]` and `mat`;
    - `buildPieces` (`src/model/pieces.ts:187`) and `groupPieces` (`pieces.ts:341`) emit every contour.
  - **Where perforations are made (all as dashes on op `cut`, role `line`, with no tag saying they are perforations):**
    - `perfContours` (`pieces.ts:336`), called for a flap that folds away from the scored face (`pieces.ts:367`);
    - a fold's crease from `creaseOf` (`pieces.ts:325`, used at `pieces.ts:397-400`): the student's *perf* or *cutcrease*, or **automatic** for a lid's rims;
    - a board's drawn lines: `lineContours` (`src/model/lines.ts:139`, dashes at `lines.ts:153`);
    - the dash pair comes from `lineDashes(m)` (`lines.ts:13`).
  - Other contours by layer:
    - scores (crease layer): `op: 'score'` (`pieces.ts:368`, `pieces.ts:399`, `lines.ts:148`);
    - plain cuts from extras: `pieces.ts:370`;
    - bend-pattern cuts and paths: `pieces.ts:402-403`.
  - Glue flaps: `conn.kind === 'glue' && conn.geom.adds`, with `a.panelId` and `a.poly`. `annotations()` (`src/export/annotate.ts:16-37`) already walks them and places the word *glue*.
  - Annotations and spec sheet:
    - `annotations(d, c, name, unit)` and `annotationContours` (`annotate.ts:40`);
    - `specPage` and `specPages`, `SpecText` with its title block rows (`src/export/spec.ts:70`, `spec.ts:80-127`), and `fitScale`.
  - Geometry helpers:
    - `offsetContour(c, d)` (`src/export/offset.ts:145`, returns null on collapse or self-crossing);
    - `contourPathD` and `fmt` (`src/export/svg.ts:7`, `svg.ts:12`);
    - `ownOutline(p)` (`src/model/outline.ts:111`; rings and holes, handles curved boards);
    - `sketchRing` (`src/model/edges.ts:167`);
    - `applyX`, `polygonContour`, `flattenContour`, `contourArea`, `arcSweep` (`src/geom/vec.ts`);
    - `polygon-clipping` (already a dependency).
  - Which face is which: `faceOf(d, panelId, xf)` (`pieces.ts:311`) and `foldToward` (`pieces.ts:317`). The kiss-score mirror is `xformContour({ tx: c.w, ty: 0, rot: 0, mirror: true }, …)` (`src/export/prepare.ts:110`).
  - Text: `outlineText(text, font, size)` (`src/text/outline.ts:35`) returns `{ polys, minX, maxX, minY, maxY }`, in visual (bidi) order. In tests, fonts are registered with `registerFont` (see `tests/annotate.test.ts:12-18`).
  - Download dialog and helpers:
    - `ExportDialog` (`src/ui/ExportDialog.tsx`): the *Print a plan* row `export-spec-row` is at `ExportDialog.tsx:218-232`; `specText()` at `:105`; `goSizes` with `applySize` at `:91-101`;
    - `downloadText` and `safeName` (`src/ui/download.ts`);
    - `LAYERS` with the LightBurn palette (`src/export/layers.ts:9`).
  - Goldens and fixtures:
    - `compare(file, actual)` (`tests/golden.test.ts:89`) compares strings byte for byte;
    - `cartonDesign` is now the app's own (`src/templates/structures/carton.ts:17`, re-exported by `tests/goldenDesigns.ts:189`).
- **Stale in the plan**
  - *"flatten and offset the polygon with `offsetConvex`'s general cousin there"*: there is no general cousin. `offsetConvex` is in `src/model/seams.ts:296` and is convex only. Write a robust buffer (step 3).
  - *"`downloadBytes` beside `downloadText`"*: it does not exist yet. Add it.
  - *"`cartonDesign(card, 'tuck', 'snap')` in `goldenDesigns.ts`"*: it is now `src/templates/structures/carton.ts:17`. Import it from either place.
  - *"crease: `op: 'score'` … a fold with `Connection.crease` perf/cutcrease goes to `perf`"*: a piece's contours carry **no marker** for which `cut` dashes are perforations. The artwork needs the piece built a second way (step 1); it cannot recover this from `pieceCopies`.
  - *"bend patterns of the perforated kind"*: band patterns emit plain `cut` lines and paths (`pieces.ts:402-403`) with only `foldId`. Tag them the same way (pattern id `perf` from `bandOf(d, c).pattern.id`).
  - Which face is up:
    - The plan expects the net to show the inside.
    - `faceOf`'s doc (`pieces.ts:305-310`) agrees: the scored face is the one the folds turn towards.
    - `prepare.ts:108` says a kiss-scored piece is mirrored to be cut "inside up", which reads as the opposite default.
    - Settle it with the spike test in step 0 before trusting either.
  - *"the title line from `specPage`'s title block text (`SpecText`)"*: `SpecText` is built in `ExportDialog.specText()` (`ExportDialog.tsx:105-118`). Lift that function into a shared helper so the spec sheet and the artwork use one.
  - `spec.ts` does not yet print the size intent. Milestone 93 said it would. That is optional here, not this milestone's job.
- **Steps**
  0. **Spike test (keep it):** in `tests/artwork.test.ts`, build `cardTray()` from `tests/goldenDesigns.ts:39`. Assert, for its piece, that `faceOf(d, base, xf) === 1` and `foldToward(d, base, wall) === 1`, so the face the SVG shows is the scored face (the inside). Write down the rule as one function, `printMirror(d, copy, side): boolean`. Recommended rule:
     - mirror the piece for `side: 'outside'` when the root board's `faceOf` is 1 (the scored face is up);
     - mirror it for `side: 'inside'` when it is −1.
     This also covers a lid of its own, whose frame is mirrored. If the test disagrees, fix the rule, not the test.
  1. **A piece built undashed, for artwork only.**
     - Add an optional parameter, `buildPieces(d, o?: { whole?: boolean })` → `groupPieces(d, group, o)`, and `pieceCopies(d, o?)`.
     - With `whole`, each site in the perforation list above pushes **one** open contour for the whole line, with a new optional tag, in place of its dashes. Type: `TaggedContour.art?: { kind: 'perf' | 'cutcrease'; dash: [number, number] }` in `src/geom/types.ts`.
     - Bend patterns of id `perf` are tagged the same way.
     - The default (no option) path is untouched, and the SVG and DXF writers ignore unknown fields (`svg.ts:28-49`, `dxf.ts:18-45`), so **goldens stay byte-identical**. A test proves it (see **Tests**).
  2. **`src/export/artwork.ts` (pure, no React).** Types as in the plan: `ArtLayer`, `ArtPath`, `ArtSheet`, `ArtOptions`, and `artworkSheets(d, o, tx)`, where `tx` holds the words (names, *glue*, *up*, the title block).
     - One sheet per kind of piece (copy 0, as `specPages` does at `spec.ts:116-127`).
     - The sheet size is the piece's box plus bleed plus `o.margin` (default 10) on every side.
     - Layers, in piece coordinates shifted by `margin + bleed`:
       - `cut`: `op === 'cut'` without `art`;
       - `crease`: `op === 'score'`;
       - `perf`: contours with `art`, keeping their dash pair (`ROADMAP.md` row 13's automatic rim perforations arrive through `creaseOf`);
       - `labels`: `op === 'guide'` lines, `annotations()`, the up arrows and the title line.
     - Engravings (`op === 'engrave'`) are left out by default (see the owner questions).
  3. **Bleed.**
     - First, for each outer contour, `offsetContour(c, +bleed)`.
     - If that returns null, which happens when inward notches or slots are narrower than 2 × bleed, use a new `bufferRing(pts, r)` in `src/geom/buffer.ts`: the `polygon-clipping` union of the flattened ring, a rectangle r wide outside each segment, and a 16-sided polygon at each vertex. The result has rounded corners, which is acceptable for bleed.
     - If both fail, the piece goes into `ArtSheet.failed` and the panel shows `art.failed`.
  4. **Safe zone.**
     - For each board in the piece, take `ownOutline(p).rings[0]` flattened, through `NetPanel.xf`, shifted by `-origin`, and offset by `-safe` (`offsetContour` on `polygonContour`). Dash it `[2, 1]`.
     - Skip a board whose inset collapses; small flaps will.
  5. **Glue.**
     - Glue flaps: `conn.kind === 'glue'`, `conn.geom.adds` on a board of this piece (as `annotate.ts:25-31`); after 112, also `edgeFlaps` of shape `glue`. Each outline goes on the layer with `fill: false`.
     - Add 45° hatch lines 2 mm apart, clipped to the polygon: intersect a set of thin strips with `polygon-clipping`, or scan-convert the polygon turned by 45°.
     - The word *glue* goes where `annotations()` puts it.
     - Where the flap lands on the other board stays for later, as the plan says.
  6. **Up arrows.** For a board that stands when folded: project world up (0, 1, 0) onto `frame.u` and `frame.v`, carry it through `NetPanel.xf` and through the mirror, and draw a 6 mm arrow at the board's centre. A board that lies flat when folded (a base, or a lid without a direction) gets no arrow.
  7. **Mirror.** Apply `printMirror` from step 0 to every path and text anchor: `x → w − x` over the sheet. Text is laid out after the mirror, so it reads correctly.
  8. **`artworkSvg(sheet, names)`** in `artwork.ts`:
     - one `<g id="<spot name>">` per layer, `fill="none"`, true mm size (`width="…mm"`, as `svg.ts:51` does);
     - perforations use `stroke-dasharray`;
     - glue hatches are plain lines;
     - text is real `<text>` with `font-family="Rubik"`.
  9. **`src/export/pdf.ts`, written by hand (recommended; no dependency)**, about 250–300 lines: `artworkPdf(sheets, names, colors?) → Uint8Array`.
     - Why by hand:
       - It keeps "no PDF library" (`DECISIONS.md:424`).
       - It keeps the download dialog chunk small (+~10 KB rather than ~300 KB).
       - Separation colour spaces and optional content are each a few dictionaries, which most JavaScript PDF libraries do not expose (unverified).
       - A test can read uncompressed output.
     - Structure:
       - PDF 1.4: catalog with `/OCProperties` (one OCG per layer), pages, one page per sheet.
       - `MediaBox` in points (`w * 72 / 25.4`). The content stream starts with `2.83465 0 0 2.83465 0 0 cm`, so all drawing is in mm with y up, which is the model's y-up.
       - One `/Separation /<Name> /DeviceCMYK <</FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [c m y k] /N 1>>` per layer.
       - An `/ExtGState` with `/OP true /op true /OPM 1`.
       - Each layer's paths sit between `/OC /L<i> BDC … EMC`.
       - Strokes are `0.088194 w` (0.25 pt in mm).
       - Arcs become cubic Béziers in pieces of 90° at most.
       - Dashes use `[c t] 0 d`.
       - Text is `outlineText` polygons filled with `f` in the labels colour.
     - **Keep the file pure ASCII:**
       - no binary comment line, no `/CreationDate`, no `/ID`, so the golden is deterministic and string offsets equal byte offsets;
       - write spot names as PDF names with `#xx` escapes;
       - write OCG `/Name` values as UTF-16BE hex strings `<FEFF…>`, so Hebrew layer names work.
     - Finish with an `xref` of 10-digit offsets, a `trailer` and `startxref`.
     - Return the bytes with `new TextEncoder().encode(s)`.
     - Default names and CMYK values as in plan §D8. Names are restricted to `[A-Za-z0-9 _-]` in the dialog (`art.nameAscii`), because RIPs match spot names exactly.
  10. **`downloadBytes(name, bytes, mime)`** in `src/ui/download.ts`, the twin of `downloadText`.
  11. **Interface.**
      - New `src/ui/ArtworkPanel.tsx`, **imported statically by `ExportDialog.tsx`**, so it lands in the dialog's lazy chunk and is already prefetched for offline use (`App.tsx:56-57`). Do not give it its own `lazy()`. If you do, add it to the prefetch list.
      - The button is *Artwork template…* (`export-art-open`) on the `export-spec-row`, gated by `useFeature('export.artwork')`.
      - The panel (`export-art`) holds:
        - print side (`art-side-outside` / `art-side-inside`, default outside);
        - bleed and safe zone (`NumField`, 0–10 mm, default 3);
        - the layer names (7 fields, `art-name-<layer>`), remembered per browser in a new optional `ViewPrefs.artNames` (`src/store/store.ts:127`);
        - a preview from `artworkSvg`, using the first sheet;
        - *PDF* (`art-pdf`) and *SVG* (`art-svg`).
      - Files are named `<design>-<piece label>-artwork.pdf` (or `.svg`) through `safeName`. With sizes (88), each checked size gets its own files, built through `applySize(d, sz)` as `goSizes` does.
  12. **Docs and decisions.**
      - `README.md`: an *Artwork template* paragraph.
      - `DECISIONS.md`:
        - one net per page;
        - spot names and CMYK values;
        - outlines rather than embedded fonts;
        - written by hand, uncompressed;
        - the mirror rule;
        - engravings left out.
      - `PROGRESS.md`: the milestone section.
- **Feature-table rows**
  - `'export.artwork'`: Workshop **show**, Quick build **hide**, Guided **hide**.
  - Add `'export.artwork'` to `quickTable.test.ts`'s `hide` list.
  - If the panel's controls are wrapped in `<div className="subsection" data-testid="export-art">`, add `'export-art': 'export.artwork'` to `SECTIONS`.
- **Words** (en / he):
  | Key | English | Hebrew |
  | --- | --- | --- |
  | `art.open` | Artwork template… | תבנית לגרפיקה… |
  | `art.title` | Artwork template | תבנית לגרפיקה |
  | `art.help` | One net per page at true size, print side up, with bleed, safe zone and glue areas: for a designer or a printer. | שטוח אחד בכל עמוד, בגודל אמיתי, צד ההדפסה למעלה, עם גלישה, אזור בטוח ואזורי דבק: למעצב או לבית דפוס. |
  | `art.side` | Print side | צד ההדפסה |
  | `art.side.outside` | Outside | חוץ |
  | `art.side.inside` | Inside | פנים |
  | `art.bleed` | Bleed | גלישה |
  | `art.safe` | Safe zone | אזור בטוח |
  | `art.names` | Spot colour names | שמות צבעי ספוט |
  | `art.layer.cut` | Cut | חיתוך |
  | `art.layer.crease` | Crease | קפל |
  | `art.layer.perf` | Perforation | ניקוב |
  | `art.layer.bleed` | Bleed | גלישה |
  | `art.layer.safe` | Safe zone | אזור בטוח |
  | `art.layer.glue` | Glue | דבק |
  | `art.layer.labels` | Information | מידע |
  | `art.pdf` | Download PDF | הורדת PDF |
  | `art.svg` | Download SVG | הורדת SVG |
  | `art.preview` | Preview | תצוגה מקדימה |
  | `art.up` | up | למעלה |
  | `art.failed` | {piece}: the bleed could not be drawn. | {piece}: לא ניתן לשרטט את הגלישה. |
  | `art.nameAscii` | Use Latin letters, digits, spaces and hyphens: printers match these names exactly. | השתמשו באותיות לטיניות, ספרות, רווחים ומקפים: בתי דפוס מזהים את השמות האלה במדויק. |
- **Tests**
  - **`tests/artwork.test.ts`** (fonts registered as in `tests/annotate.test.ts`):
    1. The spike in step 0.
    2. On `cartonDesign(CARD, 'tuck', 'snap')`:
       - exactly one sheet;
       - the bleed contour contains the cut outline, and at 10 sampled points on the outline its distance to the bleed is 3 ± 0.05 (or ≥ 3 − 0.05 where the buffer rounded);
       - one safe outline per board with an inset that survives, each inside its board;
       - the glue seam's flap is on `glue` and has at least one hatch line;
       - `side: 'outside'` gives the inside sheet's cut outline mirrored in x (compare bounding boxes and the area sign).
    3. A card tray whose lid rims are automatically perforated (`lidKindBox` or a cap from `goldenDesigns.ts`): the rims' folds are on `perf`, as whole lines with the material's dash pair, and **no** `cut` path sits where they are.
    4. `buildPieces(d)` equals `buildPieces(d, {})`, and every golden design's prepared SVG is unchanged by step 1. This is covered by `tests/golden.test.ts` staying green; add one explicit `toEqual` on `cartonDesign`.
    5. `artworkPdf`:
       - starts with `%PDF-1.4\n` and ends with `%%EOF\n`;
       - every `xref` offset points at `n 0 obj`;
       - one `/Separation` per layer, with the given names;
       - `/MediaBox` equals the sheet in points to 0.01;
       - the number of `m` operators in the cut layer's BDC block equals the number of cut contours;
       - seven OCGs;
       - Hebrew layer names round-trip as UTF-16BE;
       - every byte is under 0x80.
    6. With `d.sizes`: one sheet set per checked size, and the size's name in the file name (test the name helper).
  - **Goldens.** Add `artwork-card-carton.pdf` and `artwork-card-carton.svg`, a separate `describe` in `tests/golden.test.ts` using the existing `compare()`. The PDF is ASCII, so the string comparison holds. Every existing golden stays byte-identical.
  - **Browser:** `tests/e2e/artwork.spec.ts`. In Workshop, start a carton through `startTemplate(page, 'carton', 'card-0.5')` (`tests/e2e/util.ts`), open the download dialog, then *Artwork template…*. Check that the preview has 7 `<g>` and that *PDF* downloads `*-artwork.pdf`, whose first bytes are `%PDF-1.4`. Check that in Quick build the button is absent. Extend `tests/e2e/offline.spec.ts` with one artwork PDF download while offline.
  - **By hand:**
    - `pdfinfo -box` on the file (MediaBox in points);
    - `pdftoppm -r 72 -png` to look at it;
    - the owner opens it in Illustrator or Affinity (layers and swatches named, true size).
- **Done when** the PDF of a tuck carton opens at true size with seven named layers and seven spot swatches, the SVG twin matches it, goldens are unchanged apart from the two new files, and the dialog's chunk grew by less than about 20 KB.
- **Risks and owner questions**
  - Risks:
    - A PDF that a viewer opens but a RIP rejects (D10's preflight).
    - `offsetContour` failing on notched outlines (step 3's buffer covers it).
    - The mirror rule (step 0 settles it).
    - Outlined text makes the PDF bigger for long names (fine).
    - A piece that nesting or splitting cut into fragments (`frag`) gets one sheet per fragment, which is acceptable.
  - Owner questions: print side default, spot names, whether engravings belong on the template, and whether Quick build should get it (see the end).
- **Size: L.** A new file format by hand, a second build mode for pieces, a robust bleed, a dialog panel, and new goldens. About a week.


#### 116 Board grades (D5b)

- **Depends on / unblocks**
  - **Depends on:** nothing new. Milestone 93's `keepingStatedSizes` (`src/model/boxSize.ts:99`) already keeps an *inside* size through a change of board.
  - **Unblocks:**
    - the sentence's §8 *More boards* (step 1 of the welcome screen);
    - D9's `sheetPrice` per board;
    - teachers giving a class a grade.
- **Already in the code**
  - The material model:
    - `MATERIALS` (`src/model/materials.ts:5-10`: card 0.5, corrugated 1.6 and 4, plywood 3), `DEFAULT_MATERIAL` (`:12`), `materialById` (`:14`) and `profileOf` (`:47`, falling back to `materialById`);
    - `bendDefaults(kind, t)` (`:142`), `minWeb` (`:34`) and `connectionsFor` (`:26`), all keyed on `kind`;
    - `MaterialProfile` (`src/model/types.ts:9-27`).
  - Changing material:
    - the drawer's `choose(mat)` (`src/ui/MaterialDrawer.tsx:52-57`) calls `changeMaterial` for a template (`src/templates/registry.ts:210`, which runs the sentence's `chooseMaterial`) or `setMaterial` (`src/model/ops.ts:1825`, wrapped in `keepingStatedSizes`).
  - The sentence:
    - `makes(t, m)` (`src/templates/types.ts:75`) uses `canMake(m)` when present;
    - carton `canMake: folds(m, 2)` and sleeve `folds(m, 4)` (`src/templates/structures/carton.ts:26`, `:97`, `:148`);
    - `chooseMaterial` (`src/sentence/resolve.ts:161`).
  - Dashes: `lineDashes(m)` already depends on thickness for corrugated (`src/model/lines.ts:16`).
  - Every lookup by material id, each of which must learn about grades:
    - `materialName` (`src/ui/materialName.ts:7`);
    - the drawer's highlighted material (`MaterialDrawer.tsx:51`) and its list (`:74`);
    - `BoardMaterial.tsx:28`, `:46`, `:51`;
    - `Library.tsx:39`;
    - `TopBar.tsx:41`;
    - `StartScreen.tsx:71`, `:76`, `:137`;
    - the test hook `startTemplate` (`src/main.tsx:32`);
    - `TeacherApp.tsx:175`, `:182`, `:365`, `:398`;
    - `serialize.ts:110` (the v10 migration: leave it on `MATERIALS` only, since grades never existed before schema 11).
  - The Worker stores a class's material as JSON, with no check of its id (`worker/index.ts:275`), so grades need no Worker change.
- **Stale in the plan**
  - *"Kerf, clearance and fold allowance: scale from the nearest built-in profile"*: since the fold overhaul `foldAllowance` is a calibration that defaults to **0** everywhere (`types.ts:17`, `materials.ts:6-9`). Give every grade 0. Scale only kerf and clearance.
  - *"`bend` left absent so `bendDefaults` applies"*: `bendDefaults('card', t)` ignores the thickness (`materials.ts:143`: smoothR 10 mm whatever t). Greyboard of 1–2 mm needs an explicit `bend` (and probably `lines`), or it claims a 10 mm bend. Plywood and corrugated scale with t, so they can stay absent.
  - *"`tests/boardmaterials.test.ts`: every grade solves…"*: **that file already exists** (milestone 36, a material for each board). Use `tests/boardGrades.test.ts`.
  - *"corrugated E flute 1.6, … C flute 4"*: these are the built-in `corr-1.6` and `corr-4` profiles. Do not add second ids for them. Show them in the grades list as the built-ins (choosing one selects the built-in id). That leaves **10 new grades**, not 12.
  - `ROADMAP.md` §5.2 row 12 says "the sentence's lists check the thickness, so grades need no change there". That holds for corrugated (carton up to 2 mm, sleeve up to 4 mm). It **does not hold for card**: `folds()` returns true for any card (`carton.ts:26`), so greyboard 2 mm would be offered folding cartons.
    - Either model greyboard as `kind: 'card'` and give `folds` a card ceiling (≤ 1 mm, recommended);
    - or give `MaterialProfile` an optional `folds?: false`.
  - `StartScreen`'s `tplOk` (`StartScreen.tsx:72`) checks missions and templates by `kind` only, not by `makes()`. It matters only if step 1 lists grades.
- **Steps**
  1. **`src/model/boards.ts`:** `export const BOARD_GRADES: (MaterialProfile & { family: 'boxboard' | 'greyboard' | 'corrugated' | 'plywood' })[]` with ids in the built-ins' pattern:
     - `card-0.3`, `card-0.4` and `card-0.6`: folding boxboard, `kind: 'card'`, `sheetW/H` 500 × 300 as card;
     - `grey-1`, `grey-1.5` and `grey-2`: `kind: 'card'`, explicit `bend: { smoothR: 20·t, patternR: 6·t, pitch: 2.5, k: 0.5 }` (starting value, unverified);
     - `corr-3` (B flute) and `corr-7` (double wall): `kind: 'corrugated'`, `grain: 'y'`;
     - `ply-4` and `ply-6`: `kind: 'plywood'`, `grain: 'x'`.
     - Kerf and clearance from a helper `scaled(base, t)`:
       - kerf: the base's kerf × (t / base.t)^0.5, rounded to 0.05;
       - clearance: the base's clearance for card and corrugated, and 0.1 for plywood;
       - all values marked as starting points.
     - `foldAllowance: 0`.
     - `nameKey: 'mat.grade.<id-with-dots-removed>'`.
     - Also export `ALL_PROFILES = [...MATERIALS, ...BOARD_GRADES]` and `profileById(id)`.
     - Keep `materialById` on `MATERIALS` for the v10 migration. Keep `profileOf`'s fallback on `materialById`: boards with a grade carry it in `d.materials` anyway (`setPanelMaterial`).
     - Check: `tests/boardmaterials.test.ts:16` builds a test-only `PLY6` with id `ply-6`. It passes its own object, so there is no clash, but make sure nothing resolves `ply-6` by id first.
  2. **Card ceiling for cartons:** `folds` in `carton.ts:26` becomes `(m.kind === 'card' && m.thickness <= 1) || (m.kind === 'corrugated' && m.thickness <= most)`. Greyboard then falls back from a carton to a box with a lid that lifts off, as plywood does.
     - Check that `tests/sentence.carton.test.ts` is unchanged for the four built-ins.
     - Give `boxRecipe`'s carton rule the same ceiling (`src/easy/recipes.ts:88`: today `kind === 'carton' && (d.material.kind === 'plywood' || f.kind !== 'rect') ? 'open' : kind`), so Quick build's *Carton* kind agrees; better, make both call one exported `foldsAsCarton(m)`.
  3. **Lookups:** replace `MATERIALS.find(x => x.id === …)` with `profileById` in `materialName.ts`, `TopBar.tsx`, `Library.tsx`, `MaterialDrawer.tsx:51` and `main.tsx:32`. Leave the welcome screen's step 1 on `MATERIALS`, the four classroom materials (see the owner questions).
  4. **The drawer:**
     - Below the four `mat-mini` buttons, add a disclosure *More boards…* (`drawer-more`). It opens a `<div className="subsection" data-testid="drawer-grades">` grouped by family, each group headed by its name.
     - Each row is a button `drawer-grade-<id>` with `MaterialArt kind thickness`, the grade's name and its thickness. Choosing one calls the same `choose(mat)` (`MaterialDrawer.tsx:52`).
     - Under the list, the calibration note `mat.calibrate` (`en.ts:44`).
     - The four built-ins stay as they are. The highlighted button looks up in `ALL_PROFILES`.
  5. **A board's own material** (`BoardMaterial.tsx`): offer grades in an `<optgroup label={t('mat.grades')}>` after the built-ins (`:28`).
  6. **The teacher's class material** (`TeacherApp.tsx:182`): the same optgroup, if the owner agrees. Default: yes.
  7. `check.ts` needs nothing (no new field).
  8. **Docs.** `DECISIONS.md`: the list, the starting values, greyboard as card with no folding cartons. `README.md`: the material list.
- **Feature-table rows**
  - `'drawer.grades'` (*More boards…* and the list): Workshop **show**, Quick build **hide** (recommended; Quick build keeps the four classroom materials), Guided **hide** (Guided uses the class's or the gallery's material).
  - `SECTIONS`: `'drawer-grades': 'drawer.grades'`.
  - Add it to `quickTable`'s `hide` list.
  - A board's own material is already `boardMaterial: 'hide'` in Quick build (`features.ts:78`), so step 5 needs no new row.
- **Words** (en / he):
  | Key | English | Hebrew |
  | --- | --- | --- |
  | `mat.more` | More boards… | עוד סוגי לוחות… |
  | `mat.grades` | Board grades | סוגי לוחות |
  | `mat.family.boxboard` | Folding boxboard | בריסטול לאריזות |
  | `mat.family.greyboard` | Greyboard | קרטון אפור |
  | `mat.family.corrugated` | Corrugated | קרטון גלי |
  | `mat.family.plywood` | Plywood | דיקט |
  | `mat.grade.card03` | Folding boxboard 0.3 mm | בריסטול לאריזות 0.3 מ״מ |
  | `mat.grade.card04` | Folding boxboard 0.4 mm | בריסטול לאריזות 0.4 מ״מ |
  | `mat.grade.card06` | Folding boxboard 0.6 mm | בריסטול לאריזות 0.6 מ״מ |
  | `mat.grade.grey1` | Greyboard 1 mm | קרטון אפור 1 מ״מ |
  | `mat.grade.grey15` | Greyboard 1.5 mm | קרטון אפור 1.5 מ״מ |
  | `mat.grade.grey2` | Greyboard 2 mm | קרטון אפור 2 מ״מ |
  | `mat.grade.corr3` | Corrugated B flute 3 mm | קרטון גלי B ‏3 מ״מ |
  | `mat.grade.corr7` | Corrugated double wall 7 mm | קרטון גלי כפול 7 מ״מ |
  | `mat.grade.ply4` | Plywood 4 mm | דיקט 4 מ״מ |
  | `mat.grade.ply6` | Plywood 6 mm | דיקט 6 מ״מ |
  | `mat.gradeNote` | Values start from the nearest classroom board: try them on scrap. | הערכים מתחילים מהלוח הכיתתי הקרוב: נסו אותם על שארית. |

  The flute letters sit in `<bdi dir="ltr">` where they are rendered, or the Hebrew string is written so the letter stays readable. The owner checks.
- **Tests**
  - **`tests/boardGrades.test.ts`.** Every grade:
    - passes `material()` in `check.ts` (through `migrateDesign` of a design using it);
    - solves the organiser template (`generate(templateById('organiser'), g, defaults(…))`) and a tray (`boxRecipe` or `addTray`) with no blocking issue (`validate`);
    - exports through `prepareExport` with no errors.
  - Also in that file:
    - the sentence's `STRUCTURES().filter(t => makes(t, g))` offers no carton on greyboard or on `corr-3` and `corr-7`, and no sleeve on `corr-7`;
    - with *Inside*, card 0.5 → `grey-2` keeps the inside to 1e-6 while the outside grows by 3 mm (the plan's case, through `setMaterial`);
    - `materialName` gives the grade's name, not *Card 2 mm*.
  - **Existing tests:** `sizeIntent` (23), `sentence.carton`, `boardmaterials` and `templates` are unchanged.
  - **Goldens:** byte-identical. Add none; the grades are data.
  - **Browser:** add a case to `tests/e2e/settings.spec.ts` (or a new `grades.spec.ts`). In Workshop, open the drawer, then *More boards…*, then *Greyboard 2 mm*; the top bar's material reads the grade's name, and a box's card still shows the same inside size. In Quick build, *More boards…* is absent.
- **Done when** a 60 × 40 × 30 inside size typed on a box's card survives a change to any grade, every grade cuts the organiser and a tray clean, and greyboard is never offered a folding carton.
- **Risks and owner questions**
  - Risks:
    - Starting values for greyboard bending and 7 mm double wall are guesses (unverified). Say so in the interface, and add the values to D10's real-cut list.
    - Adding grades to the welcome screen's step 1 would change what students see. Kept off by default.
    - Ten more rows in the drawer make it busier against the owner's "less busy" direction. They sit behind a disclosure.
- **Size: S.** Data, one drawer list, about ten lookups, one carton rule. Two days.


#### 117 Production: nicks, fill the sheet, cost (D9)

- **Depends on / unblocks**
  - **Depends on:** nesting (69), *Use less board* (73), the yield bar. 116 is optional (a price per grade is more useful with grades).
  - **Unblocks:** nothing in the code. D10's "nick widths on the school's laser".
- **Already in the code**
  - Export:
    - `prepareExport` (`src/export/prepare.ts:79-121`): per-piece arc refit (`:97`), compensation cached by piece key (`:100-106`), the kiss flip (`:108-110`);
    - `compensatePiece` (`:28`), `shortenOpen` (`:51`, **straight segments only**);
    - `batchExport` (`src/export/batch.ts:43-82`), **a second path** for teacher and project batches that does not call `prepareExport`;
    - `projectBatches` (`src/export/project.ts:9`).
  - Nesting and the yield bar:
    - `nest(d, copies = pieceCopies(d))` (`src/model/nest.ts:148`) never takes more sheets than the box packer; `sheetCount` (`src/model/pack.ts:166`);
    - `quantityOf` and `quantityRoot` (`pack.ts:43-57`); pieces' quantity is checked to 0–999 (`check.ts:391`);
    - `yieldReport` (`src/model/split.ts:373-403`, `cut` = the length of every `op: 'cut'` contour, perforation dashes included);
    - `YieldBar` with *Nest* (`nest`), *Use less board* (`use-less`) and *Save material* (`src/ui/SplitUI.tsx:44-152`);
    - `lessBoard()` (`SplitUI.tsx:162`) shows how to nest in one undo step: `apply(x => void (x.placements = nest(x)))`.
  - Fixes and the drawer:
    - `validate` (`src/model/validate.ts:42`) already imports `pieceCopies` and `pack` (`:22`);
    - `fixIssue` (`src/easy/fix.ts`);
    - the drawer's `drawer-sheet` subsection (`MaterialDrawer.tsx:115-128`).
  - Fuzz invariants on prepared output: `tests/fuzz/pipecheck.ts:150-198`. They count closed and open contours against the SVG and DXF.
- **Stale in the plan**
  - *"Material & sheet in the settings card"*: **"Material & sheet" is the drawer** (`drawer.title`, `en.ts:442`). The settings card's section is "Material and fit" (`settings.material`, `DesignSettings.tsx:197-210`) and is read-only in Quick build. Put the nick settings in the drawer, in a new subsection `drawer-nicks`.
  - *"`shortenOpen` in `prepare.ts` shows how a contour is cut at a length"*: it handles straight chains only. Outer contours are arc-refitted before compensation (`prepare.ts:97`), so `nickContour` must split arcs too (walk by arc length; split an `ArcSeg` at an angle).
  - *"In `prepareExport` after kerf compensation"*: also needed in **`batchExport`**, or teacher batches and *the whole project* lose their nicks. Put the work in one helper used by both.
  - *"`costPerUnit` (sheets × price ÷ quantity of the first piece)"*: a design with a lid of its own or several nets has several quantity roots. Divide by **sets** = the minimum quantity over quantity roots (`quantityRoot`).
  - The plan does not address what a nick means with kerf:
    - The beam eats kerf / 2 past each end of a cut, so a gap of *w* in the file leaves *w − kerf* of material. Write the gap as **width + kerf**, so the material left is the stated width.
    - **Nominal mode:** LightBurn's kerf offset applies to closed shapes (unverified). Once an outer contour is broken into open pieces, LightBurn may stop compensating it, so the part comes out small by the kerf. Recommended: with nicks on, compensate the **outer** contours in the file even in nominal mode, and say so in the dialog. Owner question.
- **Steps**
  1. **Stored fields** (optional, no schema bump):
     - `Design.nicks?: { width: number; every: number }`;
     - `Design.cutSpeed?: number` (mm/s), or `MaterialProfile.cutSpeed` (see the owner questions);
     - `MaterialProfile.sheetPrice?: number`.
     - In `checkDesign`, drop each when bad: width in (0, 5], every in [10, 2000], speed in (0, 2000].
     - In `material()`, add `if (p.sheetPrice !== undefined && !(Number.isFinite(p.sheetPrice) && p.sheetPrice >= 0 && p.sheetPrice < 1e6)) delete p.sheetPrice`.
  2. **`src/export/nicks.ts`** (pure): `nickContour(c, width, every, keepOff: Vec2[], kerf): Contour[]`.
     - Walk the closed contour by length, arcs included, with `flattenContour` only to find corners.
     - A corner is a change of direction over 20° between neighbouring segments; for arcs, compare the tangents at the joins.
     - Stations are spaced evenly at about `every`, at least two, and none within 5 mm of a corner or of a `keepOff` point.
     - At each station, leave a gap of `width + kerf` and return the open pieces.
     - If fewer than two stations fit, return `[c]` unchanged. The validate check reports it.
     - Also export `nickStations(…)` for the check and for tests.
  3. **`nickPiece(contours, d, profile, mode)`** in the same file:
     - only when `d.nicks` is set and `profile.kind !== 'plywood'`;
     - only on `role: 'outer'` closed `cut` contours; holes are left alone;
     - `keepOff` = the end points of `op: 'score'` lines and of perforation dashes with `ref.foldId` that lie within 0.5 mm of the outline;
     - in nominal mode, offset the outer contour by +kerf / 2 first (`offsetContour`) when the owner confirms step "Nominal mode".
     - Call it in `prepareExport` after compensation, once per piece key (cache it like `compensated`), and in `batchExport` per copy with the item design's `nicks` (the synthetic design has none).
     - With `nicks` absent, both paths are byte-identical.
  4. **Check:** `val.nickFew` in `validate.ts`. When `d.nicks` is set, any copy-0 outer contour of a card or corrugated piece that gets fewer than two stations is reported (advice, not blocking). Its fix in `fix.ts` halves `every`, floored at 20 mm. Nothing in `fixIssue` is needed if the owner prefers no fix.
  5. **Interface (nicks):**
     - In the drawer, a new `<div className="subsection" data-testid="drawer-nicks">`, only when the working material is card or corrugated;
     - a tick *Holding nicks* (`nicks-on`), on with the material's defaults (card 0.4, corrugated 0.8, every 80);
     - `NumField`s for width (`nicks-width`) and spacing (`nicks-every`);
     - a note that nicks are added to the file only, not drawn on the cut plan;
     - gated by `useFeature('nicks')`.
  6. **Fill the sheet:** `fillSheet(d): { n: number; placements } | { why: MsgKey }` in `src/model/split.ts` (or a new `src/model/fill.ts`).
     - Refuse (`yield.fillOne`) unless every piece shares one quantity root (`quantityRoot`), so a net cut into parts counts as one kind.
     - Build `pieceCopies(d)` **once** and make copies for a count *n* by cloning copy 0 of each piece with keys `${pieceKey}#${i}`. Do not rebuild pieces per trial.
     - Upper bound: floor(sheet area / outer area) + 1, capped at 999.
     - Double from the current quantity while `sheetCount(nest(d, copies(n))) === 1`, then bisect.
     - Nesting runs on the main thread (PROGRESS, remaining limitations). Cap the work at about 12 `nest` calls.
     - In one `apply`, set `pieces[root].quantity = n` and `placements = nest(x)`.
     - Button `yield-fill` in `YieldBar`, beside `nest`, greyed with its reason when refused.
  7. **Cost and time:**
     - `yieldReport` gains optional `sets`, `costPerSet` (when every material used has `sheetPrice`: Σ sheets × price per material ÷ sets) and `minutes` (= `cut / speed / 60`, `cut` in mm and speed in mm/s, when a speed is set; cuts only, travel and scoring not counted, said in the tooltip).
     - Show them as an extra span in `YieldBar` (`yield-cost`), gated by `'yield.cost'`.
     - Fields: `sheetPrice` in the drawer's `drawer-sheet` (`mat-sheet-price`), and the speed beside it (`mat-cut-speed`).
     - Keep `YieldReport`'s existing fields unchanged. `spec.test` and `split.test` read it.
  8. **Fuzz:** in `tests/fuzz/pipecheck.ts`, accept open `role: 'outer'` pieces when `d.nicks` is set. Add a `FUZZ_NICKS=1` switch to `tests/fuzz/pipeline.test.ts` that sets `nicks` on card and corrugated designs.
  9. **Docs:** `DECISIONS.md` (nick semantics with kerf, plywood excluded, sets), `README.md`, `PROGRESS.md`.
- **Feature-table rows**
  | Row | Workshop | Quick build | Guided | Notes |
  | --- | --- | --- | --- | --- |
  | `'nicks'` | show | hide | hide | `SECTIONS`: `'drawer-nicks': 'nicks'` |
  | `'yield.fill'` | show | hide | hide | Quick build has *Use less board*; Guided's Send uses that too |
  | `'yield.cost'` | show | hide | hide | Price and speed fields and the cost text. `yield` is already hidden in Quick build |

  Add all three to `quickTable`'s `hide` list.
- **Words** (en / he):
  | Key | English | Hebrew |
  | --- | --- | --- |
  | `nick.title` | Holding nicks | גשרי אחיזה |
  | `nick.on` | Leave small nicks so pieces stay in the sheet | השאירו גשרים קטנים כדי שהחלקים יישארו בגיליון |
  | `nick.width` | Nick width | רוחב גשר |
  | `nick.every` | One every | גשר כל |
  | `nick.note` | Added to the file only. Each nick leaves {w} mm of board (the kerf is allowed for). | מתווספים לקובץ בלבד. כל גשר משאיר {w} מ״מ של לוח (רוחב הקרן נלקח בחשבון). |
  | `val.nickFew` | Piece {panel} is too small for two holding nicks. | חלק {panel} קטן מדי לשני גשרי אחיזה. |
  | `yield.fill` | Fill the sheet | מילוי הגיליון |
  | `yield.fillHelp` | As many copies as fit on one sheet | כמה שיותר עותקים בגיליון אחד |
  | `yield.fillDone` | {n} copies now fit on one sheet. | עכשיו {n} עותקים בגיליון אחד. |
  | `yield.fillOne` | Fill the sheet works on a design with one kind of piece. | מילוי הגיליון פועל בעיצוב עם סוג חלק אחד. |
  | `mat.sheetPrice` | Price of a sheet | מחיר גיליון |
  | `mat.cutSpeed` | Cutting speed | מהירות חיתוך |
  | `unit.mmps` | mm/s | מ״מ/שנ׳ |
  | `yield.cost` | {price} a set · about {min} min of cutting | {price} לסט · כ־{min} דקות חיתוך |

  Numbers are wrapped in `<bdi dir="ltr">` as elsewhere.
- **Tests**
  - **`tests/nicks.test.ts`:**
    - a 100 × 60 card rectangle with `{ width: 0.4, every: 80 }` gets ≥ 4 nicks;
    - none within 5 mm of a corner;
    - the total uncut length is count × (0.4 + kerf);
    - a round box's circle (arcs) is nicked with its pieces still on the circle;
    - fold-line ends are avoided on `cardTray()`;
    - plywood is untouched;
    - `d.nicks` absent gives a byte-identical SVG (compare with `prepareExport` before and after);
    - `batchExport` of two nicked designs has the nicks.
  - **`tests/split.test.ts`** (added cases):
    - *Fill the sheet* on a 60 mm card tray gives *n* whose `nest` is one sheet, and *n* + 1 is two;
    - a design with two kinds of piece is refused;
    - `costPerSet` and `minutes` from set price and speed.
  - **`tests/nest.test.ts`:** unchanged.
  - **`quickTable` and `i18n`:** updated lists.
  - **Goldens:** byte-identical; nicks are off by default. Optionally add `nicks-card-tray` (`cardTray` with `nicks` on) as a new golden.
  - **Browser:** `tests/e2e/split.spec.ts` gains *Fill the sheet* (the quantity field shows *n* and the plan shows one sheet). `settings.spec.ts` gains the nicks tick: the downloaded SVG has more `<path>` elements than without.
- **Done when** a card tray downloaded with nicks on has at least two gaps per outline, none at a corner or a fold end, every other design's file is unchanged, *Fill the sheet* gives the largest count that nests on one sheet in one undo step, and the yield bar shows a price per set and minutes once both inputs are set.
- **Risks and owner questions**
  - Risks:
    - Kerf versus nicks in nominal mode (step 3). Verify in LightBurn whether its kerf offset works on open shapes.
    - LightBurn has its own *tabs* or bridges feature (unverified). If the school uses it, nicks in the file may be unwanted. Owner question.
    - *Fill the sheet* blocking the main thread on large sheets (cap the calls).
    - Pipeline fuzz invariants (step 8).
- **Size: M** (the plan said S). Arc-aware splitting, kerf semantics, two export paths, a bounded search, and cost. About four days.


#### 118 Verification of 92–117 (D10 and Guided G7's final check)

Run on a clean checkout of the branch after 117, with `npm ci` first if `node_modules` is stale. Record every result in `PROGRESS.md` under *Milestone 118*. If Guided (105–110) or D1–D3 (111–114) are still unbuilt, say so and run only what exists.

**Invariants to confirm**
1. **Goldens** are byte-identical apart from those listed as intended in each milestone: 115's two `artwork-card-carton.*`, and optionally 117's `nicks-card-tray`. Command: `npx vitest run tests/golden.test.ts`, run **without** `UPDATE_GOLDEN` or `UPDATE_MIGRATED`. Also: `git diff --stat tests/golden` lists only new files.
2. **Schema** is still 11 (`src/model/types.ts:521`). The v5 fixtures still migrate (`tests/golden.test.ts`, its `MIGRATED` block). A design using each new optional field (`nicks`, `sheetPrice`, `cutSpeed`, grades) round-trips through `serializeProject` and `parseProject`, and a bad value is dropped.
3. **Whatever a joint adds to the net is drawn in 3D:** `npx vitest run tests/netIn3d.test.ts` (and D3's additions if 111–112 are built).
4. **The feature table in every mode:** `npx vitest run tests/quickTable.test.ts`. After G2 it checks Guided too. Every new row (`export.artwork`, `drawer.grades`, `nicks`, `yield.fill`, `yield.cost`) is `hide` in Quick build and Guided, and each new `subsection` is in `SECTIONS`.
5. **i18n parity:** `npx vitest run tests/i18n.test.ts` (keys, hard-coded text, sentence slots). `npm run typecheck` catches a missing Hebrew key through `Record<MsgKey, string>`.
6. **No stored derived geometry** (rule 8): grep the diff for new `Design` and `Panel` fields. Only `nicks`, `cutSpeed`, `sheetPrice`, `ViewPrefs.artNames`.
7. **Offline:** `tests/e2e/offline.spec.ts`, extended in 115 with an artwork PDF download, passes. The artwork code is in the download dialog's chunk, which `App.tsx:56-57` prefetches.
8. **Bundle:** `npm run build`. Compare `dist/assets` with the 19 Nov baseline: ExportDialog 11.3 KB, Plan2D 36 KB, index 396 KB, store 506 KB. If built, note the Guided chunk and the entry, as G7 asks. Fail the check if ExportDialog grows by more than about 25 KB, or if `pdf.ts` or `artwork.ts` appear in `index` or `store`: grep the chunk for `/Separation`.

**Test families**
- Typecheck: `npm run typecheck` (app and Worker).
- Unit suite: `npm test`. Record pass and skip counts (milestone 92 recorded 927 passed, 7 skipped).
- Sentence walks at length: `SENTENCE_WALKS=40 SENTENCE_STEPS=12 npx vitest run tests/sentence.box.test.ts tests/sentence.carton.test.ts` (the box, the tray and the stand are in `sentence.box`; the carton and the sleeve in `sentence.carton`). Then repeat once with the material set including the 116 grades: add the grades to the walks' material lists in 116, or run a one-off script.
- Fuzz:
  - `STRICT=1 FUZZ_N=40 npx vitest run tests/fuzz/quick.test.ts`;
  - `FUZZ_N=60 npx vitest run tests/fuzz/fuzz.test.ts tests/fuzz/pipeline.test.ts tests/fuzz/load.test.ts tests/fuzz/degenerate.test.ts tests/fuzz/batch.test.ts tests/fuzz/templates.test.ts`;
  - `FUZZ_NICKS=1 FUZZ_N=40 npx vitest run tests/fuzz/pipeline.test.ts` (117).
  - Known open item, from milestone 95: a rounded box with a hinged lid and free random sizes breaks two export invariants in `fuzz/templates`. Report it if still there.
- New unit files: `tests/artwork.test.ts`, `tests/boardGrades.test.ts`, `tests/nicks.test.ts`, and the added cases in `split.test.ts`.
- Browser (app only): `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test -c pw-app.config.ts --trace off --grep-invert classroom`.
  - `classroom.spec.ts` needs the Worker. `pw-app.config.ts` does not start it; milestone 91 ran with `--grep-invert classroom`.
  - The `SHOTS` specs skip themselves.
- Classroom with the Worker: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test -c playwright.config.ts --trace off classroom guided` (starts wrangler with local D1 and R2).
- Guided's own (G7): `guided.spec.ts` and `classroom.spec.ts` as above. `tests/easymode.test.ts`:
  - a new browser starts in Guided;
  - saved preferences keep their mode;
  - a locked class cannot switch;
  - a box with a wall added is `'more'` in Guided and unchanged by the trip there and back.

**By hand**
- **Hebrew, right to left:**
  - every new string in 105–117 in the dev server (`npm run dev`, port 5199), including the artwork panel, the grades list, the nicks subsection and the yield cost line;
  - numbers in `<bdi dir="ltr">`;
  - the PDF's Hebrew layer names and outlined Hebrew labels read correctly in a PDF viewer;
  - the sentence's `sen.*` strings, which are the owner's to check.
- **Touch:** outline mode (101) and Guided's drags on a touch screen (no hover, faint handles); the artwork panel's fields and the grades list with a finger (44 px targets).
- **Chromebook 1366 × 768:**
  - the download dialog with the artwork panel open fits without hiding *Download*;
  - the drawer with *More boards…* open scrolls;
  - the Net view (113), with two canvases, is not sluggish;
  - Guided at 1366 × 768 and 1024 × 768.
- **LightBurn import:**
  - the SVG and DXF land on C00, C01, C02 and C03 (`src/export/layers.ts:9`);
  - guide-layer text and dashed perforations are read as expected (an open item since 91);
  - a nicked outline: LightBurn's kerf offset in nominal mode (117's question).
- **Artwork:**
  - `pdfinfo -box <file>` (MediaBox in points);
  - `pdftoppm -r 72 -png` to look at it;
  - the owner opens it in Illustrator or Affinity (7 layers and 7 swatches named, true size) and sends it through a printer's preflight once.
- **Real cuts** (D10's list):
  - a hand-built tuck box, a hang tab and a mailer in card and corrugated (after 112);
  - nick widths on the school's laser;
  - greyboard and 7 mm double-wall starting values;
  - trade codes against the code books (D6 is dropped, so only if codes appear anywhere).
- **Safari:** the Net view and the PDF download (`downloadBytes` with a Blob).
- **Found in passing (unverified whether intended):** `batchExport` (`src/export/batch.ts:66-78`) does not apply `prepareExport`'s kiss-score mirror (`prepare.ts:108-110`), so a teacher batch of kiss-scored pieces would be cut face-up the other way. Check it, and file it if it is a bug.

**Done when** all of the above is green or written down with its reason, `README.md`, `DECISIONS.md` and `PROGRESS.md` are complete, and `ROADMAP.md` §5.1's status line says 92–117 are built (or which are not, and why).


### Parked

#### D4 Closures anywhere (no number until the owner says go)

- **Needs first.**
  - The owner's go-ahead (`DIELINE_DNA_PLAN.md` §7 question 8; `ROADMAP.md` §4, *boxes built from boards (no tray) closing with a grown lid*).
  - A written answer to *what is a box*: one function, `boxOf(d, wallId)`, in `DECISIONS.md` before item 1.
  - D3 (111) for the registry, if the dust flaps are to be edge features.
- **What exists.**
  - `reachFor` (`src/model/closures.ts:46-84`) returns null as soon as the hinge wall belongs to no tray (`:49-50`). Its front and side search over walls (`:51-80`) is already independent of trays, given a list of walls.
  - `sealFor` (`:39`), `sealOf` (`:86`) and `closureStyles` (`:24`).
  - `closeChoices` (`src/easy/lid.ts:270`) also takes a tray. `boxLid` and `setBoxLid` (`lid.ts:59`, `:142`).
- **Recommended first step.** Items 2 and 4 need no answer about boxes and can go first as a small milestone:
  - *Closing edge* `Closure.lipOn?: 'e1' | 'e2' | 'e3'`, with `Seal.front.under`;
  - the check `val.lidLoose`.
  - Meanwhile, write `boxOf` as a pure function with tests over today's trays only (it must return exactly what the tray path finds) and leave `reachFor` unchanged until the owner answers.

#### D7 Fold along a line (no number; last)

- **Needs first.** The spike (plan §D7):
  - does a grown board at `angle: 180` solve, unfold and export (`checkHinge`, `src/model/hinge.ts:70`; `growPanel`, `src/model/ops.ts:614`)? `check.ts:280` accepts angles in ±360;
  - can the part cut off be a `WallSketch` through `polyToWall`, round-tripping a rectangle, a trapezoid and an L?
  - D2 (114) is listed as a prerequisite for the Net view's chip at 180°, but the operation itself does not need it.
- **What exists.**
  - Lines with types (`Panel.lines`, `src/model/lines.ts`).
  - The crease row in `LinesUI.tsx`, where *Make it a fold* (`line-make-fold`) goes.
  - The ported sketch engine with `src/sketch/regions.ts` (face tracing, to split an outline by several creases), `src/sketch/cutforge.ts` (`graphBoard`, which keeps edge ids) and `insertVertex` (`ops.ts:1480`).
  - Outline mode (101) to reshape the result.
- **Recommended first step.** Write the spike as `tests/foldline.spike.test.ts`:
  1. a 100 × 60 card root board;
  2. `insertVertex` twice to make the crease's ends;
  3. split the ring with `regions.ts`;
  4. grow the cut-off part at 180° with a wall sketch;
  5. assert the net's outline area and bounding box equal the original to 1e-6.

  Keep or delete it according to the result. Record the result in `DECISIONS.md`.

#### The sentence's later items (`SENTENCE_BUILDER_PLAN.md` §8): registered as `planned`, not shown

- **What exists.**
  - `TemplateDef.status?: 'planned' | 'beta' | 'stable'` (`src/templates/types.ts:63`).
  - `STRUCTURES()` drops `planned` (`src/templates/registry.ts:20`). It is the only thing the sentence lists (`src/sentence/Sentence.tsx:104`).
  - **Nothing is registered as `planned` yet** (grep finds only the type and the filter).
  - `TEMPLATES` (`registry.ts:18`) is iterated by `tests/templates.test.ts:16`, `tests/fuzz/load.test.ts:29` and `tests/netIn3d.test.ts:15`, which call `generate` on every entry, and by `PRESET_CARDS` (`registry.ts:22`, the templates with no `word`).
- **Recommended registration.**
  - Add `src/templates/planned.ts` exporting `PLANNED: { id: string; word: MsgKey; materials: MaterialKind[]; needs: string }[]`. Keep these out of `TEMPLATES`, so nothing tries to generate a stub, and `templateById` never resolves one from a file.
  - When an item's generator is written, it moves into `TEMPLATES` as a real `TemplateDef` with `status: 'planned'` until it is released. At that point add `t.status !== 'planned'` to the three test loops and to `PRESET_CARDS`.
  - Test: no `PLANNED` id is in `STRUCTURES()` or in the sentence's structure options, and every `needs` names an existing milestone number.
  - Words: `sen.w.mailer`, `sen.w.drawer`, `sen.w.envelope` (en and he) only when shown. Until then the `word` can reuse a placeholder key, or the entries carry no word.
- **Each item, what it needs, and its first step:**
  | Item | Needs | First step |
  | --- | --- | --- |
  | **Mailer** (≈ FEFCO 0427, corrugated only) | Shaped flaps D3b (112): dust flaps on the lid, a tab lock | After 112: a builder in `src/templates/structures/mailer.ts` from D6's recipe (plan §D6 table), with `status: 'planned'`, walked like the carton |
  | **Drawer** (tray + sleeve) | A sleeve sized from the tray's measured outside | A builder that calls `box`'s tray, then `boxSize(d, tray, 'outside')` (`src/model/boxSize.ts`) for the sleeve's inside, plus clearance |
  | **Envelope** (card only) | Shaped glue and tuck flaps on a flat board (D3b) | After 112 |
  | **Sized by contents** (*a box that holds [12] [pencils]*) | Guided G4's `fitContent` (107), `bundleSize` and `bestCell` (`src/easy/objects.ts`), `setBoxSize` | After 107: a `sizeBy: 'contents'` word that writes `Design.contents` and calls the same path |
  | **A sentence bar in the design** | §4.5, a place in the editor's chrome against the *rail shrinks* rule | Not before the owner picks its place; the S6 card covers the need |
  | **Guided's gallery opening with the sentence** | G2–G3 (105–106) | After 106: a feature row `'gallery.sentence'` (Guided: hide until the owner says go) |

  Grow the box so the spaces are exact, unequal spaces, pen cup, magazine file, phone stand, double walls and the sliding lid stay in §8 with no registration. *More boards* is 116 plus the step 1 question below.


### Open questions for the owner (each with the recommended default)

1. **Print side of the artwork template:** default *Outside* (the plan's), mirrored from the net as cut. Recommended: yes.
2. **Spot colour names and values:** `CutContour`, `Crease`, `Perforation`, `Bleed`, `Safe`, `Glue`, `Info` with the plan's CMYK, editable in the dialog and limited to Latin letters, digits, spaces and hyphens. Recommended: yes. Ask the school's printer which names its RIP expects.
3. **Engravings on the artwork template:** left out (artwork replaces engraving), or on the *Info* layer? Recommended: left out.
4. **Artwork in Quick build:** hidden (`export.artwork: 'hide'`), Workshop only. Recommended: hidden.
5. **Board grades in the welcome screen's step 1** (`SENTENCE_BUILDER_PLAN.md` §0.2 row 7): recommended **no**. Step 1 keeps the four classroom materials, and grades are in the drawer's *More boards…*.
6. **Grades in Quick build's drawer:** recommended **hidden**.
7. **Grades in the teacher's class material list:** recommended yes, in their own group.
8. **Which grades:** the plan's twelve less the two that are the built-in corrugated boards: ten new ones. Recommended: yes.
9. **Greyboard and folding:** greyboard as `kind: 'card'` with no folding cartons above 1 mm (a card ceiling in `carton.ts`'s `folds`). Recommended: yes.
10. **What a nick's width means:** the board left between two cuts, so the file's gap is width + kerf. Recommended: yes.
11. **Nicks in nominal mode:** LightBurn's kerf offset may not apply to an outline broken into open pieces (unverified). Recommended: with nicks on, the file's outer outlines are kerf-compensated even in nominal mode, and the dialog says so. Alternative: offer nicks only with *Compensated*. Also: does the school use LightBurn's own tabs instead?
12. **Cutting speed: per design or per material?** The plan stores it on the design. Recommended: **on the material profile** (`MaterialProfile.cutSpeed`), since speed depends on the board and travels with a class's profile.
13. **Currency for the sheet price:** a plain number with no symbol. Recommended: yes. Cost is shown **per set**, the smallest quantity over the design's nets.
14. **Fill the sheet in Quick build:** hidden. Recommended: yes; *Use less board* covers Quick build.
15. **D4:** go ahead with items 2 (*Closing edge*) and 4 (`val.lidLoose`) now, and leave item 1 until *what is a box* is written down? Recommended: yes to 2 and 4, item 1 waits.
16. **D7:** run the spike (one throwaway test) now, ahead of numbering it? Recommended: yes, after 114.
17. **Sentence §8 registration:** a separate `PLANNED` catalogue (no stub generators) until a builder exists. Recommended: yes.
18. **The kiss mirror in teacher batches** (found in passing, `batch.ts` against `prepare.ts:108`): intended or a bug? Recommended: treat it as a bug and fix it in 117, which touches `batchExport` anyway.
