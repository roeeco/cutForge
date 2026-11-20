# CutForge: presets overhaul — the collection and how it is shown in 3D (milestones 92–99)

Written 2026-11-20, after milestone 91 and the fold overhaul (`main` at `1917440`). It replaces the parked `PRESETS_PLAN.md` (branch `claude/affectionate-clarke-7g8ybc`, written after milestone 43). Its contract, kit and settings-card ideas (§2–§6 there) are reused and named where they are; its catalogue and milestone numbers are not.

"Presets" here means everything a student can start from on the welcome screen: the **templates** (`src/templates/`) and the **missions** (`src/easy/missions.ts`), each drawn as a card with a 3D picture (`src/views/thumbnail.ts`), and what the stage shows once one is opened.

Screenshots of today's state are in `docs/preset-shots/before/`.

## 1. What is wrong today

### 1.1 The collection

There are seven presets: two templates and five missions. On Quick build's welcome screen all seven are cards side by side.

| Card | What it actually builds | Built by |
| --- | --- | --- |
| Organiser with dividers | rectangular tray, 2 × 1 dividers | `organiser` template |
| Pencil box (mission) | rectangular tray, 0 × 2 dividers | `organiser` template |
| Game organiser (mission) | rectangular tray, 1 × 0 dividers | `organiser` template |
| Escape box (mission, plywood) | rectangular tray, no dividers | `boxRecipe` rect |
| Card / tile stand | base, side walls, leaning supports | `stand` template |
| Card stand (mission) | **the same**, at the same defaults | `stand` template |
| Dice tray (mission) | low hexagonal tray | `boxRecipe` regular |

- **Four of seven are the same rectangular tray** at different sizes. Their pictures are almost interchangeable (`start-cards-*.png`).
- **Two are identical**: *Card / tile stand* and the *Card stand* mission produce the same picture and the same design.
- **What makes CutForge different is in none of them.** Milestones 61–90 built tuck tops and snap-lock bottoms (`model/cartons.ts`), round and oval walls that bend (`model/round.ts`, `bands.ts`), rounded corners (`wings.ts`), double walls (`foldover.ts`), living hinges (`bendPatterns.ts`), arched and hinged lids (`closures.ts`), Cap / Flat / Drop-in lids and hasps (`model/lid.ts`, `easy/lid.ts`), lean slots and angled side walls (`addSideWalls`), and lines. A student only meets them by building from blank.
- The *Lid* goal of *Game organiser* and the *lid opens* goal of *Escape box* start with no lid at all, and the organiser's own *Lift-off lid* is a hand-built second tray that predates the lid generator (`LIDS_LINES_PROJECTS_PLAN.md` §16 left it "a preset matter").

### 1.2 The 3D pictures (start-screen cards)

`thumbnail.ts` is a second, much smaller renderer than the stage. It walks `d.order` and extrudes each panel's outline with `panelGeometry`, nothing else. Compared with `View3D.tsx`, it leaves out:

| Missing | Stage draws it with | Effect on a card |
| --- | --- | --- |
| Bands (round, oval, rounded-corner walls) | `foldDisplay().bands` → `BandObject` | a round box is a flat disc with one strip sticking up (`thumbnail-renderer-gaps.png`) |
| `flaps3d` (glue flaps, carton end flaps, closures, flat-lid hasps) | `<Flaps>` | cartons and folded trays look like plain bricks |
| Lid poses (folded lids shown open, lids beside the box) | `applyLidPoses` | a tuck carton is a closed block; you cannot see that it opens |
| Fold display transforms (wings, hinged corners) | `foldDisplay().xf` | corners chained off bands sit at their design frame, not where they are shown |
| Objects inside (`d.contents`) | `<ContentsView>` | a mission about pencils or dice shows no pencils or dice |
| Lines, through-cuts on curved faces, tone mapping, AO | `BoardLines`, `AOEffects` | flatter and greyer than the stage; card reads as grey |

The camera is one fixed direction (`0.75, 0.85, 1`) fitted to the bounding **sphere**, so long, low designs (the pencil box) are a thin sliver, and a stand is seen from behind its lip. The image is 520 × 300 at pixel ratio 1, so it is soft on a laptop screen.

### 1.3 The stage after *Start*

- The camera opens low and square to the front (`stage-after-start.png`). The stand from the front is a box with two spikes: its supports are hidden behind the lip (`stage-stand-corr16.png`).
- Nothing on the stage tells the student what is special about the preset they chose: there is no hero pose, the fold animation is a bare slider, and a mission's deliberately-too-small box shows "13.7 mm deeper" before the student has read the goal.

## 2. Goals

1. **Every card is a different thing.** No two presets on the welcome screen share both their silhouette and their construction. Variants of one thing are *sizes* or *challenges* of one preset, not cards of their own.
2. **The collection shows off the engine.** Each preset has one *signature mechanism* from the list in §1.1 that it is the best example of.
3. **One renderer.** A card's picture, a hover preview and the stage are drawn from the same display model, so a feature drawn on the stage is drawn on the card, and a test proves it.
4. **Each preset is shown at its best.** A preset declares its hero view: camera, which lids are open, how far it is folded, what is inside.
5. **Nothing a student already made breaks.** Saved designs with `template` or `mission` set keep opening and regenerating (§7).

## 3. The collection

### 3.1 Rules

1. **One card per construction.** A preset is defined by its signature mechanism and its silhouette class (tray · tall cup · carton · stand · tower · insert · drawer). Two shown presets may not share both. This is checked by a test (§6.2), not by review.
2. **Families and rows** (from `PRESETS_PLAN.md` §3.4). One builder can serve several presets only if they differ in mechanism; otherwise the variant is a **size chip** on one preset (*Pencils*, *Deck of cards*, *A4*).
3. **Missions become challenges.** A mission is a preset + starting params + goals + objects. It no longer has a card of its own: the preset's card shows a *Challenge* tag, and choosing the preset offers its challenges as one row (*Just build it · Pencil box challenge*). `Mission.template` already points at a template; missions built by `start` recipes are moved onto presets first.
4. **Options, not presets, for cross-cutting features.** Double walls, rounded corners and lid kind are options on the presets they suit, so they never become look-alike cards.
5. **Status** `stable | beta | planned` (`PRESETS_PLAN.md` §3.7). Planned presets are registered and tested but never shown.

### 3.2 The catalogue

Grouped on the welcome screen as **Store · Package · Stand & play**. ✅ supported, — not offered, (b) beta.

| # | Preset | Signature mechanism | Silhouette | Card | Corr 1.6 | Corr 4 | Ply 3 | Absorbs | Engine today | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Organiser** | divider grid with half-laps; *corners: square / rounded*; *walls: single / double* | tray | ✅ | ✅ | ✅ | ✅ | Pencil box (challenge); *Pencils*, *Board game* chips | `organiser.ts`, `dividers.ts`, `wings.ts`, `foldover.ts` | stable |
| 2 | **Lidded box** | the lid generator: Cap · Flat · Drop-in, optional hasp | box + lid beside it | ✅ | ✅ | ✅ | ✅ | Escape box, Game organiser (challenges; the lidded box takes *Dividers* from the same kit builder); the organiser's hand-built lift-off lid | `easy/lid.ts`, `model/lid.ts`, hasps (82) | stable |
| 3 | **Hinged box** | a lid that stays attached: living hinge (ply), fold (card/corr), arched lid option | box with lid open ~110° | ✅ | ✅ | — | ✅ | — | `bendPatterns.ts`, `closures.ts` (`archLids`) | stable |
| 4 | **Pen cup** | polygon or round walls; flat or slanted top | tall cup | ✅ | ✅ | ✅ | ✅ (sided) | Dice tray (challenge, *Hexagon tray* chip at 25 mm) | `round.ts`, `bands.ts`, `regularPolygon` | stable (sided), beta (round, slanted) |
| 5 | **Tuck-end carton** | tube with tuck top; bottom *snap-lock · reverse tuck · seal* | upright carton | ✅ | ✅ | — | — | *Deck of cards*, *Soap*, *Tea* chips | `cartons.ts` (68) | stable |
| 6 | **Magazine file** | walls of different heights with a sloped side; finger hole | tall, cut away | — | ✅ | ✅ | ✅ | *A4*, *A5* chips | wall outline editing, `addDetail` | beta |
| 7 | **Stand** | lean slots (ply) or glued supports (card/corr) | low, leaning | ✅ | ✅ | ✅ | ✅ | Card stand (challenge); *Cards*, *Tiles*, *Phone*, *Tablet* chips (one support + cable notch for the last two) | `stand.ts`, `addSideWalls` | stable |
| 8 | **Dice tower** | angled baffles held between side walls; a tray at the foot | tall, narrow | — | ✅ | ✅ | ✅ | — | angled grow + `addSideWalls` | beta |
| 9 | **Drawer in a sleeve** | a sleeve band closed on itself, sized from the tray's measured outside | box in sleeve, drawer half out | ✅ | ✅ | ✅ | ✅ | — | needs the sleeve (spike) | planned → beta |
| 10 | **Grid insert** | crossing slotted boards, no box, sized to fit a box's inside | egg-crate | — | ✅ | ✅ | ✅ | — | crossing dividers on a construction base (spike) | planned → beta |
| 11 | **Mailer** | fold-over walls, hinged lid with tuck and dust ears | flat mailer | — | ✅ | ✅ | — | — | three-deep flap chain (spike) | planned |

Seven shown at first (1–7, 6 as beta), eight with the dice tower. That is the same count as today's seven cards, but with seven different constructions instead of three.

Trade names (FEFCO, ECMA codes) are shown only after each is checked against the current code book (`PACKAGING_PLAN.md` §11.3); until then the cards use plain names.

### 3.3 What each preset shows off (its hero view)

| Preset | Hero pose | Camera |
| --- | --- | --- |
| Organiser | objects of its chip in the compartments (pencils, cards, dice) | ¾ from above, high (≈ 55°), so the grid reads |
| Lidded box | lid beside, rim up (as the stage already places it) | ¾ front, 35° |
| Hinged box | lid open past its hinge (`LID_OPEN_PAST`) | ¾ front-right, 30°, hinge visible |
| Pen cup | 6 pencils standing in it | ¾, 20°, low enough to see the top's slant |
| Carton | tuck top half open, flaps visible | ¾, 25°, tall framing |
| Magazine file | an A4 slab inside | from the open side, 25° |
| Stand | three cards leaning in it | **side-on ¾** (the lean is the point) |
| Dice tower | cut away: the near side wall drawn as a ghost so the baffles show | ¾, 15° |
| Drawer in sleeve | drawer pulled half out (view offset, like a lid pose) | ¾ front |

## 4. 3D: one display model for stage, card and preview

### 4.1 The display model

Extract what `View3D`'s `Scene` computes into one pure function, without React or interaction:

```ts
// src/views/displayModel.ts
export type DisplayOpts = { foldT: number; lids: 'shown' | 'shut' | 'pose'; contents: boolean; quality: 'simple' | 'rich'; extra?: ViewPose };
export type DisplayModel = {
  panels: { id: string; geom: 'panel' | 'band'; xf: THREE.Matrix4; colors: BoardColors; lines: boolean; ghost?: boolean }[];
  bands: BandShown[]; flaps: Flap3dShown[]; bends: Bend[]; contents: ContentShown[]; bbox: THREE.Box3;
};
export function displayModel(d: Design, o: DisplayOpts): DisplayModel;
```

- It is `foldDisplay` + `applyLidPoses` + the flap, band and contents lists the stage already builds; the stage keeps its interactive components and feeds them from this.
- `thumbnail.ts` becomes `renderDisplayModel(model, camera, size)`: the same meshes (`panelGeometry`, `BandObject`'s geometry function, `flapGeometry`), the same palette and tone mapping as the stage's *rich* quality, a contact shadow on the floor, pixel ratio 2.
- The shared geometry builders move out of the `.tsx` components so both paths call the same function (`bandMesh.tsx` → `bandGeometry()`; `ContentsView` → `contentBoxes()`).

### 4.2 Hero view and framing

`PresetDef.preview` (§5) declares `{ yaw, pitch, lids, foldT, contents, pose? }`. `pose` is view-only, like `lidPose`: *drawer out 50 %*, *near wall ghosted*. Framing fits the **projected** bounding box to the image (not the bounding sphere), with a margin, so a long pencil box and a tall carton both fill their card.

### 4.3 The welcome screen

- **Cards:** static PNGs from §4.1 at the preset's hero view, cached per `(preset, version, material, params)` in memory and `sessionStorage`. Rendered lazily, the visible cards first.
- **Hover / selected preview:** one shared WebGL canvas (never one per card: browsers cap contexts at about 16, and school Chromebooks are slow). The selected card turns slowly and plays its fold from flat to folded once (`foldDisplay` with `foldT` 0 → 1 over 3 s). Off when *reduce motion* is set or the quality probe (`QualityProbe`) chose *simple*.
- Choosing a material re-renders the cards in that material, as today.

### 4.4 The stage when a preset opens

- The camera starts at the preset's hero view (`CameraRig` gets a `startDir`), not the default front.
- Lids and contents as in the hero view; the existing *Close / Put on* badge still works.
- A one-line strip under the top bar names the signature mechanism and offers *Show how it folds* (plays the fold bar once) — dismissable, once per preset.
- A challenge opens with its goals card first; the "N mm deeper" labels appear only after the student's first edit.

## 5. The preset definition

Take `PRESETS_PLAN.md` §2–§3 as written (`PresetDef` with `roles`, `limits`, `status`, `sizes`, `readouts`; the kit in `src/templates/kit.ts`; `t:<role>` ids; diagnostics with fixes; families and rows), and add:

| Field | Meaning |
| --- | --- |
| `category` | `'store' \| 'package' \| 'stand'` |
| `signature` | i18n key naming the mechanism (shown on the card and in the stage strip) |
| `silhouette` | the class used by the distinctness test (§6.2) |
| `preview` | the hero view (§4.2), optionally per size chip |
| `challenges` | missions on this preset: `{ id, params, contents, goals }` |
| `sizes` | named size chips (already in the old plan) |

`TemplateDef` stays as an alias. `Mission` keeps its id and version so saved designs resolve; `missionById` looks inside presets' `challenges`.

The form lock, regeneration that follows the student's shapes, and double walls (`PRESETS_PLAN.md` §6–§7) are **not** in this round. They are worthwhile, but they are about editing presets, not about the collection or how it looks; they follow as their own plan.

## 6. Tests

### 6.1 Contract tests (`tests/presets.test.ts`)

From `PRESETS_PLAN.md` §10: every preset × supported material, at defaults, at each size chip, at the limits, at 0.5× and 2× — builds with no blocking issue, the same roles everywhere, every parameter matters, `regenerate` is stable, folds point the right way, corrugated 4 included.

### 6.2 Distinctness (`tests/presetCatalogue.test.ts`)

For every pair of **shown** presets at defaults: `(signature, silhouette)` differ, and a structural fingerprint differs — the multiset of connection kinds, tray `top`/`bottom`/`base`, bands present, the set of grow angles, lid kind, and the bounding box's proportions bucketed to thirds. Adding a look-alike fails the build with the two names.

### 6.3 Picture parity (`tests/displayModel.test.ts`)

Without WebGL: for every preset × material, and for the golden designs (`tests/goldenDesigns.ts`), the display model has a band entry for every band in `bandOf`, a flap entry for every `flaps3d` in the solved connections, and every panel's displayed transform matches the stage's. A regression of §1.2's kind (a feature drawn on the stage but not on the card) fails here.

### 6.4 Pictures (`SHOTS=1 … preset-shots`)

Every card in every material, and the stage after *Start*, into `docs/preset-shots/after/`, beside `before/`. An e2e check that each card's PNG is not empty and its drawing covers at least 35 % of the image.

## 7. Saved designs

- A design with `template.id` `organiser` or `stand` opens and regenerates exactly as before: the two templates keep their ids and versions, and their goldens stay byte-identical through milestone 94.
- A design with `mission.id` `pencil-box`, `game-organiser`, `card-stand`, `dice-tray` or `escape-box` resolves to the challenge of the same id on its new preset. `dice-tray` and `escape-box` were built by `start` recipes, so they carry no `template`; they keep working as free designs with their goals, and only new starts get the preset.
- The organiser's old *Lift-off lid* parameter stays readable; new designs get the lid generator through the Lidded box. Version bump with *"Updated preset: check your sizes"* once (`PRESETS_PLAN.md` §4, Versioning).

## 8. Milestones

Each ends as before: typecheck, unit suite, goldens byte-identical unless a change is intended and listed, the browser spec, English and Hebrew, `README.md`, `DECISIONS.md`, `PROGRESS.md`, and a row in Quick build's feature table.

| # | Milestone | Done when |
| --- | --- | --- |
| **92** | **One display model.** `displayModel()` extracted from `View3D`; stage fed from it with no visible change; `thumbnail.ts` rebuilt on it (bands, flaps, lid poses, contents, tone mapping, contact shadow, ×2). Projected-box framing. | §6.3 passes; the round box and the carton in `thumbnail-renderer-gaps.png` render as on the stage; stage screenshots unchanged. |
| **93** | **Hero views.** `preview` on templates and missions as they are today; stage opens at the hero view; the shared preview canvas with turn and fold; reduce-motion and *simple* fallbacks. | e2e: opening the stand shows its supports; one WebGL context on the welcome screen. |
| **94** | **Presets as a catalogue.** `PresetDef` and the kit (old plan §2–§3), `organiser` and `stand` moved onto it (goldens identical); missions become challenges; the welcome screen loses the duplicate cards and gets categories and challenge tags. | Pencil box and Card stand become challenges on Organiser and Stand (seven cards → five); Game organiser, Dice tray and Escape box keep their cards until their presets land in 95; §6.2 passes on what is shown; old mission files open. |
| **95** | **New presets on the existing engine:** Lidded box, Hinged box, Pen cup (sided; round as beta), Tuck-end carton, and the organiser's *corners: rounded* option. Game organiser and Escape box move onto the Lidded box, Dice tray onto the Pen cup. | §6.1 for each × material; goldens at defaults; e2e per preset: start → change a size → export; no mission has a card of its own. |
| **96** | **Presets that need a little engine work:** Magazine file (sloped wall outline that keeps its joints), Dice tower (angled baffles between side walls; card/corr glued), Stand's *Phone* / *Tablet* chips (one support, cable notch). | as 95; the dice tower's baffles checked to clear each other at every height in its limits. |
| **97** | **Spikes:** Drawer in a sleeve and Grid insert as beta if the spike works, `planned` if not; Mailer registered as `planned`. | Each spike's result written into `DECISIONS.md`, with its fallback taken if it fails. |
| **98** | **Polish:** Hebrew names, size chips on every preset, Quick build pass (Advanced hidden), the stage's signature strip, `docs/preset-shots/after/`. | i18n coverage; screenshots reviewed in en and he. |
| **99** | **Verification**, as milestone 91. | `PROGRESS.md`. |

If time is short: 92, 93 and 94 fix what the owner saw (pictures, look-alikes) without a single new preset; 95 is the first one that adds variety.

## 9. Decisions for the owner

| # | Question | My call |
| --- | --- | --- |
| 1 | Missions as challenges on a preset card, rather than cards of their own? | Yes: it removes the duplicates and keeps every goal. |
| 2 | The catalogue in §3.2: anything to add, drop or rename? | As listed; the dice tower is the one not drawn from an earlier plan. |
| 3 | A turning, folding preview on the selected card? | Yes, one canvas, off on slow machines and with reduce motion. |
| 4 | The form lock and double walls (old plan §6–§7) now or after? | After this round. |
| 5 | Teachers choose which presets a class sees (`viewPrefs.presets`, like `viewPrefs.missions`)? | Yes, in 98, if wanted; it is a small addition. |
