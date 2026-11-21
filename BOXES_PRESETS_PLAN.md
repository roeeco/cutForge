# Presets from boxes.py, built from boards — plan (revised to fit `PRESETS_OVERHAUL.md`)

Source: [florianfesti/boxes](https://github.com/florianfesti/boxes) (191 generators in `boxes/generators/`, GPL‑3.0), for personal use.

Written 2026-11-21 against `claude/eloquent-brahmagupta-eip2fd` at `27bb61c` (presets overhaul, milestones 146–150 done). It replaces the first draft of this file, which proposed its own catalogue field and its own *More designs* screen.

## Status (21 November, evening)

Built: milestones 161–166 and the sliding-lid box of 169. Thirteen new cards, the plywood drawer and angled tabs on 4 mm board. What was built, what changed from this plan and why, and what is not built are in `DECISIONS.md` (*Milestones 161–166*, *Milestones 167–169*), `PROGRESS.md` and `ROADMAP.md` §5.6. In short:
- each new construction is a card of its own, not a variant, because the sentence can't reach a variant on another structure;
- the closed lid, organiser heights, the book stand and the uneven box are dropped or open;
- the bird house is plywood only;
- frames, the game board, the Shapes footprints and stacking feet are not built.

## 0. In short

- **This is a lane of the presets overhaul, not a second preset system.** Every preset ported from boxes.py:
  - is a card or a variant in `templates/catalogue.ts`;
  - is reached through the sentence's first word;
  - is named by its record (`templates/records.ts`);
  - is drawn and posed by `illustrate.ts` and `pose.ts`;
  - is held to the overhaul's rules: one card per thing that looks and works differently, a visible tell, no look-alikes (§3 of the overhaul).
- **What this lane adds: presets built from boards, for plywood 3 mm and corrugated 4 mm.** The dieline analysis (`DIELINE_GENERATOR_ANALYSIS.md`) brought in folded constructions: tubes, crosses folded from one net, strips and wraps. boxes.py brings rigid boards joined at their edges: finger joints and tabs in slots, half-slots crossing, boards leaning in angled slots. These are the **cross** (walls standing on a base as boards), **stand** and **slot** bodies of the analysis, in the two materials the overhaul calls thin on cards (§2.3 and rule 5: plywood has about 6 distinct cards, 4 mm board about 12 counting beta).
- **Take the constructions, not the code.** boxes.py is GPL‑3.0. Under `THIRD_PARTY.md`'s rule, it is a behaviour reference only, as Papercraft is. What is read:
  - which boards a thing has;
  - how they meet;
  - its proportions and default sizes.

  Each preset is then written fresh as a `TemplateDef` against `model/ops.ts`, and no code is copied or translated. The engine picks the joints for the material, and `pack` / `nest` lay out the sheet.
- **Start after 160, the overhaul's verification (decided, owner, 21 November).** Until then nothing here is built. The exception is the three cards the overhaul already plans: magazine file, dice tower and phone stand. For those, the boxes.py recipes go into milestones 155 and 157 as their reference (§2).
- **Decided with it (owner, 21 November):**
  - angled tabs through slots are allowed on 4 mm board (R3);
  - 4 mm board keeps tabs in slots and gets no finger joints;
  - card and 1.6 mm board get none of these cards.

## 1. What changes from the first draft

| First draft | Now | Why |
|---|---|---|
| A `catalog` field on `TemplateDef`, and a *More designs* screen | Cards and variants in `CATALOGUE`, each template with a `word` and a sentence line; `status: 'beta'` until its test cut | The overhaul made one catalogue that every list reads (146). A second list is the problem it solved. |
| Lane A: about 10 boxes.py names as new styles | **No new entries.** The boxes.py names that the engine already builds are recorded as aliases for the recogniser only (§3, "Already there") | The overhaul drops aliases (146: "a design is shown once per list"); a style that builds an existing card fails the look-alike test. |
| Lane B: about 25 new templates | About 14 new cards and 6 new variants on existing cards (§3) | Most of the 25 have the same record and the same picture as one another or as an existing card. Under rule 1 they are variants. |
| Lane D: flat parts as presets | Parts go to the **Shapes tool** as footprints (gear, knob) and as hole-pattern shapes (§5). Only the game board stays a preset. | A gear, a knob and a plain board are all `body: 'flat'` with nothing else in their record, so they would be look-alikes. They are shapes you put on a board, not things you start from. |
| Every material where it folds | **Plywood 3 and corrugated 4** (`canMake`). Card and 1.6 mm board are not offered (owner, 21 November). | boxes.py's constructions are rigid boards. The folded versions are the dieline lane's. |
| Lane C, new edges, as its own lanes | The same edges, each a slot in a record and, after 158, a choice in the custom-preset editor | The overhaul's engine is records with slots (150, 158). |
| Our own tests | The overhaul's tests: records distinct, look-alike allowlist not grown, picture coverage, the pose's tell, the contact sheet | One set of gates. |

## 2. Overlap with milestones already planned

| Overhaul milestone | Card | boxes.py | What this plan gives it |
|---|---|---|---|
| 155 | Stand: the *phone* variant | `phoneholder`, `laptopstand` (the angle) | The lean angles and the lip height as starting values |
| 155 | Hinged box on plywood with a living hinge | `flexbox`, `flexbox3` | The hinge's slit pattern lengths, to check against `bendPatterns.ts` (not ported; ours is already tested) |
| 157 | Magazine file ◐ (ply, c4) | `magazinefile` | The proportions (a front at about ⅓ of the height, a straight slope) and its edges (`Ffef`): a sloped wall outline that keeps its fingers |
| 157 | Dice tower ◐ (ply, c4) | `dicetower` | The baffle count, angles and spacing, and the funnel at the bottom; the boards between two side walls in slots |
| 156 | Strip builder | `lbeam`, `zbeam` | Two test cases for strips of boards (not folded): an L and a Z of plywood boards joined by fingers |
| 154 | Corner rules | — | None. Corners of boards are already fingers, tabs and slots, or butt joints. |
| 158 | Custom presets | the edge letters (§6) | The slots a board-built record needs: each wall present or open, its top level or sloped, the joint per edge |

The shared helper both 157 cards need, **several boards at angles between two side walls**, is also what the shelf cards of §3 need. It is built once, in 157, and reused here.

## 3. The cards

★ new card, ◇ new variant on an existing card. P = plywood 3, c4 = corrugated 4. Each new record field is listed in §4.

### Already there: no new entry, an alias for the recogniser only

| boxes.py | Is |
|---|---|
| `abox`, `two_piece` | Lidded box (`trayLid`) |
| `typetray` | Organiser |
| `regularbox`, `roundedbox`, `roundedregularbox` | Open box, footprint poly, rounded or poly with radius |
| `crate` | Open box + handles |
| `hingebox` (as built here) | Hinged box |
| `jointpanel` | The split with puzzle keys (Split UI) |
| `flextest`, `burntest` | The bend test and kerf test in the download |

### New variants on existing cards

| ◇ | Card | boxes.py | Record difference | Tell (pose) | P | c4 |
|---|---|---|---|---|---|---|
| ◇ | Lidded box: **closed** (flat lid on finger-jointed walls) | `closedbox`, `basedbox` | `lid: 'flat'` (the lid kind exists, milestone 79; it is not a word yet) | lid lifted off its tabs | ✅ | ✅ |
| ◇ | Drawer box **on plywood** | `slidingdrawer` | none; the card gains a material | drawer half out | ★ | ✅ |
| ◇ | Open box: **open front** | `openbox`, `notesholder` | `open: ['front']` | seen from the front, a stack of notes inside | ✅ | ✅ |
| ◇ | Stand: **book** | `bookholder` | one tall back, `tiers: 1`, `back: true` | side view, a book leaning in it | ✅ | ◐ |
| ◇ | Organiser: **heights** | `drillstand` | dividers with different heights (`steps: true`) | stepped compartments, pencils of different lengths | ✅ | ✅ |
| ◇ | Organiser: **insert only** | `dividertray`, `trayinsert` | `body: 'slot'` grid, no base or walls | the grid standing on its own | ✅ | ✅ |

### New cards

Group *Boxes and trays* unless marked. Status ◐ beta for every card until its test cut.

| ★ | Card | boxes.py | Built from | Record | Tell (pose) | P | c4 |
|---|---|---|---|---|---|---|---|
| ★ | **Sloped tray** | `slantedtray`, `smallpartstray`, `bintray` | tray, front wall lower, ramps in each space | `cross`, `sloped: true`, `ramps: true` | three-quarters from the front, tokens on the ramps | ◐ | ◐ |
| ★ | **Uneven box** | `unevenheightbox` | tray + `setWallCorner` per wall | `cross`, `sloped: true`, no ramps | the four corner heights | ◐ | ◐ |
| ★ | **Bookend** (*More*) | `halfbox` | base + one wall at 90° (+ optional side) | `body: 'free'` → new `body: 'angle'` | a few books against it | ◐ | ◐ |
| ★ | **Desk sign** (*More*) | `desksign` | sloped plate in two side feet with angled slots | `stand`, `tiers: 1`, `sign: true` | the plate engraved with a name | ◐ | ◐ |
| ★ | **Slanted shelf** (*More*) | `displayshelf`, `cardholder` (Shelf) | two sides + n shelves at an angle, the 157 helper | `stand`, `tiers: n` | side view, cards on each tier | ◐ | ◐ |
| ★ | **Shelf** (*More*) | `storageshelf`, `wallrack` | two sides + n level shelves, a back | `slot` / `cross` with `shelves: n` | three-quarters, small boxes on the shelves | ◐ | ◐ |
| ★ | **Laptop stand** (*More*) | `laptopstand` | two boards crossing in half-slots | `slot`, `boards: 2`, `cross: 'x'` | a slab (the laptop) on it | ◐ | ◐ |
| ★ | **Bottle rack** (*More*) | `winerack`, `bottlestack`, `can_storage` | boards with round cut-outs held in slots | `slot`, `holes: 'round'` | bottles lying in it | ◐ | ◐ |
| ★ | **Pen holder** | `penholderbox` | tray + a drop-in plate with a hole grid | `cross`, `lid: 'dropin'`, `holes: 'grid'` | pencils standing in the holes | ◐ | ◐ |
| ★ | **Bird house** (*More*) | `birdhouse` | tray, gable walls, roof grown from the sloped edges, a round door | `cross`, `top: 'roof'` | three-quarters, the door hole | ◐ | ◐ |
| ★ | **Frame** (*Flat pieces*) | `shadowbox`, `photoframe`, `engravingframe` | layers laid flat with windows, a stand foot | new `body: 'stack'`, `layers: n` | at an angle, the layers' edges visible | ◐ | ◐ |
| ★ | **Sliding-lid box** | `slidinglidbox`, `compartmentbox` | tray + rails + a lid board that slides | `cross`, `lid: 'slide'` | lid half pulled out | E1 | E1 |
| ★ | **Stacking bin** | `stackablebin`, `paintbox` | tray, sloped front, feet and matching notches | `cross`, `stack: true` | two bins stacked | E2 | E2 |
| ★ | **Game board** (*More*) | `royalgame` | one board with engraved squares + a sheet of tokens | `flat`, `grid: true` | the board with tokens on it | ✅ | ◐ |

**Count after this lane**, with the overhaul's 21:
- plywood, from 9 to about 25;
- 4 mm board, from 12 to about 27 (the beta cards included).

Plywood would no longer be "boxes only".

**Deferred to later engine work**:
- `heart`, `flexbox2`–`5`, `flexbook`, `shutterbox`: a plywood living hinge round any outline (E4).
- The hinged boxes with pins: `integratedhingebox`, `dicebox`, `piratechest`, `sidehingebox` (E3).

## 4. Engine work

| # | Step | For | Notes |
|---|---|---|---|
| R1 | **Record fields for board-built things**: `open` (walls left out), `sloped`, `ramps`, `steps`, `tiers`, `shelves`, `holes`, `stack`, `layers`, `sign`; bodies `slot`, `angle`, `stack` | all of §3 | In `records.ts`, read off the design as the others are. `recordOf` must find a tray where a template builds one, so templates use `addTray` and not separately grown walls (the old organiser has no record for that reason; milestone 150). |
| R2 | **Boards with no box** (the slot body: a grid with no host base, boards crossing in half-slots at any angle) | insert only, laptop stand, bottle rack, shelf | The analysis lists the grid with no box as planned. Today half-laps are found only between upright boards on one base (`PROGRESS.md`). |
| R3 | **Angled boards in slots on 4 mm board.** `connectionsFor` offers corrugated only `fold · glue · lock` at an angle; plywood has `lean`, angled tabs through slots in side walls. | stand variants, desk sign, slanted shelf, and the dice tower on c4 (157) | A rigid 4 mm board holds an angled tab in a slot as plywood does. **Decided:** allow `lean` on corrugated of 3 mm or more, with the slot widened for the angle (as dividers' slots are, README §15). The stand on c4 then stops needing glue flaps. |
| R4 | **Board-built on 4 mm board**: wall to base as `tabslot` (separate boards), not folded | every c4 card of §3 | A template asks for it with `growPanel(..., { kind: 'tabslot' })`. It is in `connectionsFor` at 90° already. Check that the design-wide *Wall to base* choice does not fold it back. |
| E1 | **Sliding lid**: two rails per side wall and a lid board with clearance, or a groove of two thin strips | sliding-lid box | `ROADMAP.md` §4 lists *sliding lids* as deferred. Plywood and c4. Rails as boards placed on the wall's inside face (`addPlacedPanel`). |
| E2 | **Stacking feet**: tabs below the base's edge and notches in the walls' tops | stacking bin | Outline work on free edges, as edge flaps are drawn |
| E3 | **Pin hinges** (`i I`, `o p q`) | the hinged boxes deferred above | Waits for the pin-hinge spike (`DECISIONS.md`, milestone 81). boxes.py's sizes are its starting values. |
| E4 | **A living hinge round any outline** | `heart`, the `flexbox` family | Bands bend round rounded corners and round boxes today. Check what is still missing before planning it. |

## 5. Parts: shapes, not presets

These go in the Shapes tool and on boards, not in the catalogue:

| boxes.py | Becomes |
|---|---|
| `gear`, `pulley` | **Gear** footprint (`G` menu of Shapes): involute teeth, module and count; as *Board* it makes a board, on a board it cuts or adds. The involute outline is written fresh from the standard formulas, not from `gears.py`. |
| `concaveknob`, `wavyknob` | **Knob** footprint, with a centre hole or a D-flat |
| `holepattern`, `fanhole`, `nemapattern` | **Hole pattern** shape: a grid or ring of holes as one live array (arrays exist, README §7) |
| `jigsaw` | a set of cut lines on a board (*Puzzle cut*), as milestone 83's lines |
| `gripping` edge `g`, wave edges | an edge profile on a free edge (later) |

## 6. Edge letters → CutForge, per material

| Letter | boxes.py | Plywood 3 | Corrugated 4 |
|---|---|---|---|
| `e` | plain | free edge | free edge |
| `E` | outset | free edge, offset by t | free edge, offset by t |
| `f` / `F` | finger joint | `finger` | `tabslot` (decided: no finger joints on corrugated) |
| `h` | finger holes (T joint) | `tabslot` / a divider's slots | `tabslot` |
| `\|` | crossing finger holes | half-laps | half-laps |
| angled slots (bookholder, displayshelf) | — | `lean` | `lean` (R3, milestone 163) |
| `d` / `D` | dovetail | `key` (puzzle key) | `key` if the neck holds in 4 mm board, else not offered |
| `s` / `S` / `š` | stackable | E2 | E2 |
| `l L n N`, `z Z` | sliding lid, groove | E1 | E1 |
| `i I`, `o p q`, `u v` | hinges | E3 | not offered |
| `G` | mounting | holes on the board | holes on the board |
| `X` | flex | bands, living hinge | not used (4 mm board bends round flutes by its own pattern) |

boxes.py's own settings are not ported:
- finger width, space and play: `fingersFor` and `tabsFor` choose them from the material;
- burn: CutForge uses its kerf;
- the sheet layout: CutForge uses `pack` / `nest`.

## 7. Porting one generator

1. Read its `__init__` (arguments, defaults) and `render()` (parts, edge strings, callbacks) for what it builds: the boards, how they meet, the proportions and the defaults. This is a description to work from, not code to translate.
2. Decide what it is in the catalogue: an alias, a variant or a new card. Check its record against `CATALOGUE` first. If it would be the same record as a card and draws the same picture, it is a variant or nothing.
3. Choose its words:
   - sizes as `width`, `depth`, `height` with `sizeAs`, within `SIZE_MIN` / `SIZE_MAX`;
   - choices that change what it is, as `addon` words;
   - its sentence line (`sentence.main`) and `word`, in en and he.
4. Build it in 3D with `addTray`, `growPanel` (with `kind: 'tabslot'` on c4), `addDivider`, the 157 angled-board helper, details for holes. Give every board a `role`.
5. Add `materials: ['plywood', 'corrugated']` and `canMake: (m) => m.kind === 'plywood' || (m.kind === 'corrugated' && m.thickness >= 3)`. A card is not offered on card or 1.6 mm board: no folded fallback. A design switched to a thinner stock falls back to the nearest existing card (`fallback`), as a carton on plywood does. Add `limits` / `accepts` by building (`cleanAll`, `cleanWith`, `largestOk`, as `flat.ts` does) and `check`.
6. Add its card or variant, its `match` pattern, any new record field (R1), its pose (§4.1 of the overhaul: view, open, props, cutaway) and its tell.
7. Name the generator under boxes.py in `THIRD_PARTY.md`: its construction was read, and the preset was written fresh.

## 8. Tests: the overhaul's gates plus two

- **`tests/presetCatalogue.test.ts`.** The new cards' records are distinct from every card, and `recognise` round-trips. The look-alike allowlist does not grow (`tests/presetLookalikes.ts`), and the browser's picture hash agrees (`preset-sheet.spec.ts`).
- **`tests/illustrate.test.ts`.** Picture coverage for every new card × P and c4.
- **`tests/pose.test.ts`.** The tell is visible: the drawer in its sleeve, a lid half slid out, books against the bookend.
- **Contract per card × material.** It builds clean at its defaults and at every number's min and max, or `accepts` refuses with a reason. Every touching pair is joined. It fits on the 600 × 400 sheet. A shape on a board survives a size change.
- **Goldens.** One SVG per new card at its defaults, on plywood and on 4 mm board.
- **New: a joint census.** On c4, no board-built card has a fold between boards (R4) and no finger joint. On plywood, every 90° joint between two boards is a finger joint or tabs in slots.
- **New: thinner stocks.** On card 0.5 and corrugated 1.6, no card of this lane is in any list.
- **New: the test cut.** A card leaves beta only after a physical cut on each material, as the overhaul's beta rule says. Its result goes in `DECISIONS.md`.

## 9. Milestones (after 160)

| # | Milestone | Done when |
|---|---|---|
| **161** | **Records and joints for board-built things**: R1, R4, the joint census; the aliases of §3 in the recogniser | every existing card's record unchanged (goldens byte-identical); a box built by hand from boards on c4 has a record |
| **162** | **Variants on existing cards**: closed lid, plywood drawer, open front, book stand, organiser heights | each variant's picture differs from its siblings by the hash test |
| **163** | **Angled boards on 4 mm board** (R3) | the stand, the dice tower and the desk sign on c4 with angled slots, no glue flaps |
| **164** | **Cross cards**: sloped tray, uneven box, pen holder, bird house | contract tests and goldens; plywood and c4 contact sheets |
| **165** | **Boards with no box** (R2) and the **slot cards**: insert only, laptop stand, bottle rack, shelf | half-slots at any angle between boards with no host; contract tests |
| **166** | **Stand cards**: desk sign, slanted shelf, bookend | the 157 helper reused; contract tests |
| **167** | **Frames** (the `stack` body) and the **game board** | layers posed apart in the picture |
| **168** | **Shapes**: gear, knob, hole pattern, puzzle cut | each as a footprint or shape on any board; export check clean |
| **169** | **E1 sliding lid, E2 stacking feet**, and their cards | each lid slides and each bin stacks in 3D within clearance |
| **170** | **Verification**: test cuts on plywood 3 and 4 mm board, words in en and he, the contact sheets before and after | `PROGRESS.md`; cards that passed their cut leave beta |

E3 (pin hinges) and E4 (a living hinge round any outline) stay in `ROADMAP.md` §4 with the pin-hinge spike.

## 10. Owner decisions (21 November)

| # | Question | Decision |
|---|---|---|
| 1 | When | After 160 is done. Until then only the recipes are handed to 155 and 157. |
| 2 | Angled boards on 4 mm board | Allowed: `lean` (angled tabs through slots) on corrugated of 3 mm or more (R3, milestone 163). |
| 3 | Finger joints on 4 mm board | No. Tabs in slots stay. |
| 4 | Card and 1.6 mm board | Left off. These cards are plywood 3 and corrugated 4 only. |
| 5 | Licence | boxes.py is a behaviour reference only, as `THIRD_PARTY.md` already rules for GPL code. Its constructions and sizes are read, and every preset is written fresh. Nothing in the repository then carries GPL‑3.0, whether CutForge stays personal or goes to a class. |
