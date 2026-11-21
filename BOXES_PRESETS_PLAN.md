# Presets from boxes.py — plan

Source: [florianfesti/boxes](https://github.com/florianfesti/boxes) (191 generators in `boxes/generators/`, GPL‑3.0). For personal use.

## 0. In short

- **Port the recipes, not the code.** A boxes.py generator draws flat 2D parts. Each part's four edges are given as a string of edge letters (`"fFeF"`), and the generator lays the parts out on the sheet itself. CutForge works the other way round. It builds boards in 3D (`addRootPanel`, `growPanel`, `addTray`, `addDivider`, `addSideWalls`, lids), its engine picks the joints for the material, and it does its own packing. So each generator we take becomes an ordinary `TemplateDef`, written in TypeScript against `src/model/ops.ts`. It then works in 3D and on card and corrugated as well as plywood. Students' edits survive `regenerate`, and the export check and the library treat it like any other design.
- **No Python in the browser and no SVG import of boxes.py output.** You could run boxes.py with Pyodide and import its SVGs as flat pieces. That gives all 191 at once, but with no 3D, no material awareness and no joints from our engine. It also adds about 10 MB to an app that must work offline. Not worth it.
- **Four lanes**, cheapest first:
  - **A**: generators the sentence already makes. These become styles: only words, no engine work.
  - **B**: new templates built from the existing ops.
  - **C**: new edge types in the engine, which unlock a further set of generators.
  - **D**: flat parts (gears, knobs, hole patterns, game boards). This is also the *game-parts generator* that `ROADMAP.md` §4 leaves for later.
- **Roughly 45 generators are worth taking.** The rest are listed in §6 as skipped, with reasons.

## 1. How the two models line up

| boxes.py | CutForge |
|---|---|
| `x, y, h` inside sizes, `--outside` flag | `sizeAs: inside / outside` (box, drawer) |
| `thickness`, `burn` | `MaterialProfile.thickness`, kerf in the Material drawer |
| `FingerJointSettings` (finger, space, play) | the engine's finger joints for the material (`jointDefaults.ts`); not ported |
| `rectangularWall(w, h, "efef")` part on the sheet | a board: a root panel, or one grown from an edge |
| `move="up"` layout | `pack.ts` / `nest.ts`; ignored |
| `callback=[…]` holes on a wall | `addDetail` / `addPathShape` with `cut` or `engrave` |
| `edges.CompoundEdge` (`"fE"` along one side) | a grow on part of an edge (`GrowOpts.offset`, milestone 19) or wall inserts |
| `polygonWall`, `regularPolygon` | `addPolygonPanel`, `regularPolygon` |
| flex (`X`) | bands and living hinges (`bands.ts`, `bendPatterns.ts`) |

### Edge letters

| Letter | boxes.py | CutForge |
|---|---|---|
| `e` | plain edge | free edge |
| `E` | outset plain edge | free edge, board offset by t |
| `f` / `F` | finger joint / its counterpart | `finger` (plywood); `fold` / `glue` / `tabslot` on card and corrugated |
| `h` | finger holes (a T joint) | `tabslot`, or a divider's slots |
| `\|` | crossing finger holes | half-laps (crossing dividers) |
| `d` / `D` | dovetail | `key` (puzzle key, milestone 64) for boards laid end to end |
| `s` / `S` / `š` | stackable feet and top | **new** (C2) |
| `i` / `I`, `o`/`p`/`q`, `u` | integrated, chest and cabinet hinges | **new** (C3); depends on the deferred pin-hinge spike |
| `l` / `L` / `n` / `N` | sliding-lid edges | **new** (C1) |
| `c` / `C` | click connector | **new** (C4), optional |
| `z` / `Z` | grooved edge | **new** (C1, the same groove as the sliding lid) |
| `g` | gripping edge (wavy) | an outline profile on a free edge (C5) |
| `G` | mounting edge (screw holes) | holes on a free edge (D) |
| `R` | rack (gear teeth) | D (gear maths) |
| `X` | flex | bands; already in the engine |

## 2. Lane A: styles only (no engine work)

Each row is a `StyleDef` in `src/templates/styles.ts`: a named set of words on an existing structure. It takes an entry, en/he names and a check that `styleOf` finds it.

| boxes.py | Structure + words |
|---|---|
| `abox` | box, `lid: liftoff` |
| `two_piece` | box, `lid: liftoff` (deep rim; needs `lidRim` as a word if not yet one) |
| `typetray` | box (or tray), `spacesBy: count` |
| `regularbox` | box, `shape: poly`, `sides` |
| `roundedbox` | box, `shape: rounded` |
| `roundedregularbox` | box, `shape: poly` plus a corner radius (check the poly base takes the radius) |
| `crate` | box, `handles: slots` |
| `closedbox` | box, `lid: flat` |
| `slidingdrawer` | drawer |
| `jointpanel` | none; the split with puzzle keys already does it (Split UI) |
| `flextest` / `burntest` | none; the bend test and kerf test in the download already do it |

**Group:** a new `StyleGroup` named `'boxespy'`, or the existing `boxes` group with `source: 'boxes.py/<name>'` on the style. Its name is shown only in the catalogue (§5).

## 3. Lane B: new templates from today's ops

Each one is a `TemplateDef` in `src/templates/boxespy/<name>.ts`. The table says what it is built from and what is missing, if anything.

| boxes.py | What it is | Built from | Gap |
|---|---|---|---|
| `openbox` | box with top and front open | `addTray` with `openEdges: ['e0']` | none |
| `basedbox` | closed box on a larger base | tray on a root panel bigger than it; flat lid | the base's overhang as a parameter |
| `angledbox`, `coffin` | box with chamfered ends | poly base (octagon / hexagon) worked out from `x`, `y`, `n`; extrude | none |
| `unevenheightbox` | four corner heights | tray, then `setWallCorner` per wall | `Own height` on each wall and sloped tops; already in the engine |
| `magazinefile` | sloped side walls | tray with front open, wall outlines (`setWallCorner`) | none |
| `notesholder` | open-front holder for a stack | tray, `openEdges`, front notch (`addDetail` cut) | none |
| `halfbox` | bookend / corner shelf / hanging box | base + two walls grown at 90° (`growPanel`) | `G` mounting holes: holes as details |
| `bookholder` | angled display stand | the `stand`'s pattern: `addSideWalls` + a lean back + a lip | none; close to the card stand, one back |
| `desksign` | sloped plate with two feet | plate grown at an angle on a small base, side walls with angled slots | none |
| `laptopstand` | X frame | two plates crossing with half-laps | half-laps for non-upright boards (PROGRESS: "half-laps are detected for upright panels only") |
| `displayshelf` | shelf with slanted floors | two sides (root, standing), shelves grown at an angle with `lean` slots | several leaning boards between two sides (the stand has one row) |
| `cardholder` (Shelf) | angled shelves for card piles | as `displayshelf` | as above |
| `slantedtray` | one row, high back, low front | tray, wall corners | none |
| `smallpartstray`, `smallpartstray2` | slopes for scooping tokens | tray + spaces + a ramp grown at an angle in each space | ramps as dividers at an angle (`Divider` is upright now) |
| `drillstand`, `drillbox` | compartments of different heights, holes | tray + dividers with `Own height` + hole grid on a top plate (`addDetail` circle × n) | dividers of different heights in one row (check) |
| `penholderbox` | two grid plates with holes | tray + a drop-in plate (`addDropinLid`) with a hole grid | none |
| `dividertray`, `trayinsert` | dividers only, with notches | dividers with half-laps, no base or walls | a "dividers only" design (no host base) |
| `birdhouse` | gable house with a roof | tray, gable walls (wall outline points), roof grown from the sloped edges | none; README §12 already shows this pattern |
| `shadowbox`, `photoframe`, `engravingframe` | stacked layers | root panels stacked flat, window cut-outs | stacked layers (boards laid on boards: `addPlacedPanel` flat) |
| `nightlightbox` | box with patterned plates | box + engraved / cut patterns | needs D's pattern library |
| `wallrack` (spice rack) | open-front shelves on a back | back root + shelves grown at 90° + front bars | none |
| `storageshelf`, `paintbox` | shelf for trays | sides + shelves grown | `paintbox` stacking needs C2 |
| `bintray` | open bins with sloped fronts | tray + spaces + sloped front walls | as `smallpartstray` |
| `can_storage`, `bottlestack` | cut-outs for round things | plates with circular cut-outs, crossing slots | none |
| `dicetower` | tower with ramps inside | tray (open top and front) + ramps at angles | ramps as angled boards between two walls (as `displayshelf`) |
| `kamishibai` | frame with a slot for cards | frame of layers + a box | as `shadowbox` |

**Shared work behind several rows**, done once, early in lane B:

1. **Angled boards between two side walls** (`displayshelf`, `cardholder`, `dicetower`, `smallpartstray`, `bintray`). The stand already does one row of these with `addSideWalls`. Generalise it to any number of boards at any offsets and angles, or check that it already allows that.
2. **Stacked flat layers** (`shadowbox`, `photoframe`, `engravingframe`, `kamishibai`). Boards laid on boards with window cut-outs.
3. **Hole grids** (`drillstand`, `penholderbox`, `can_storage`). An array of circles. Live arrays exist (README §7), so this may be only a helper.

## 4. Lane C: new edges in the engine

Each is a milestone of its own, with physical sizes to check by cutting a sample. Every new edge gets a `ConnectionKind` or `EdgeFeature`, a material rule (which boards can make it), export-check coverage and a sample in the bend/kerf test sheet.

| # | Edge | Unlocks | Notes |
|---|---|---|---|
| C1 | **Sliding-lid rails and grooves** (`l L n N`, `z Z`) | `slidinglidbox`, `compartmentbox`, `breadbox` (with flex) | `ROADMAP.md` §4 lists *sliding lids* as deferred. Plywood only. A groove is a rail board or two thin strips (boxes.py uses rails); its clearance is the material's fit clearance. |
| C2 | **Stackable feet and top** (`s S š Š`) | `stackablebin`, `paintbox`, `brick_sorter`, `wallstackablebin` | Feet are tabs below the base's edge; the top edge gets matching notches. Pure outline work on free edges. |
| C3 | **Hinges** (`i I` integrated, `o p q Q` chest, `u v` cabinet) | `integratedhingebox`, `dicebox`, `piratechest`, `hingebox`, `sidehingebox` | This is the pin hinge that `DECISIONS.md` (milestone 81) defers until three test boxes are cut. Do C3 last, and only after that spike. Port boxes.py's sizes as the starting values. |
| C4 | **Click connector** (`c C`) | flat-pack builds without glue | Optional. |
| C5 | **Edge profiles** (gripping `g`, wave, rounded triangle) | decorative edges, `wavyknob` | An outline profile on a free edge, as edge flaps are drawn. |
| C6 | **Flex round any outline** | `heart`, `flexbox2–5`, `flexbook`, `shutterbox`, `doubleflexdoorbox` | Bands already bend round rounded corners and round boxes. What is missing is a band round any outline with arcs (the README says walls round curves "come next"). Check where that stands before starting. |

## 5. Lane D: flat parts

These generators make one flat part, or a few. Each becomes a template whose `generate` builds root panels with an outline from `addPolygonPanel` (arcs stay true arcs) and details from `addDetail` or `addPathShape`. There is no 3D assembly, so the 3D view shows them lying flat. A new catalogue group, **Parts**.

| boxes.py | Port |
|---|---|
| `gear`, `pulley`, `rack` edge | involute gear and timing pulley outlines (port `gears.py` and `pulley.py` maths; about 600 lines of geometry) |
| `concaveknob`, `wavyknob` | outlines + centre hole / D-flat |
| `holepattern`, `fanhole`, `nemapattern`, `frontpanel` | hole patterns as cut details on a board; also as a *shape* to put on any board |
| `jigsaw` | puzzle-cut lines on a board (a cut-line set) |
| `royalgame` | board with engraved squares; the **game-parts generator** (tokens, tiles, numbered sheets) from `ROADMAP.md` §4 belongs here |
| `coindisplay`, `clock` | plates with engraved rings and ticks |
| `lbeam`, `zbeam` | two or three boards at 90° (these are really lane B) |

## 6. Skipped

| Generators | Why |
|---|---|
| `rackbox`, `rack10box`, `rack19box`, `rack19halfwidth`, `eurorackskiff`, `electronicsbox`, `dinrailbox`, `sidedoorhousing`, `console`, `console2`, `airpurifier`, `makitapowersupply`, `matrix`, `keypad`, `keyboard`, `atreus21`, `arcade` | electronics enclosures with fixed hardware sizes; can come later if wanted |
| `ottobody`, `ottolegs`, `ottosoles`, `robotarm`, `servos`, `nemamount`, `gearbox`, `planetary`, `planetary2`, `linkage`, `rotary`, `laserclamp`, `laserholdfast`, `angledcutjig` | mechanical assemblies or tools for the laser itself |
| `beequeencage`, `beequeentransportbox`, `fatballdispenser`, `organpipe`, `stachel`, `pizzashovel`, `ramp`, `filamentspool`, `spool`, `carbonfilter`, `stevensonscreenbox`, `trafficlight`, `lamp`, `trianglelamp`, `sevensegment*`, `frameloom`, `coffeecapsulesholder`, `agricolainsert`, `gridfinity*`, `skadis*`, `castle`, `silverwarebox` | niche; any can be picked up later through lane B |
| `platonic`, `sphere`, `tetris` | the shape modeller (milestones 120–133) already unfolds polyhedra |
| `wall*` generators (`walledges.py`) | the French-cleat wall system: a lane of its own (one new edge, about 15 holders) if wanted |
| `traylayout`, `gridfinitytraylayout` | text-file layout input; CutForge's dividers do this directly |
| `edges`, `alledges`, `_template`, `_walltemplate` | demo sheets |

## 7. The contract and the catalogue

### `TemplateDef` additions (`src/templates/types.ts`)

```ts
/** Where a preset sits in the catalogue, and where its recipe came from. */
catalog?: {
  group: 'boxes' | 'trays' | 'shelves' | 'stands' | 'frames' | 'parts';
  /** e.g. 'boxes.py/displayshelf': shown under the card, and in THIRD_PARTY.md. */
  source?: string;
  tags?: MsgKey[];
};
```

- A catalogue template has no `word`, so it is not a sentence structure. It sits beside `organiser` and `stand` in `PRESET_CARDS()`.
- Lane A styles get `source` on the `StyleDef` in the same way.
- Every template sets `materials`, `canMake`, `limits` and `accepts`, using the same `cleanAll` / `cleanWith` / `largestOk` helpers as `flat.ts`. A size that does not cut clean is then refused with a reason, as in the sentence.
- Every board gets a `role(...)`, so `regenerate` keeps the student's shapes and the picture can light boards up.

### Where the presets appear

The welcome screen says *"No gallery: the sentence's lists hold the styles, and only one picture is drawn at a time."* (`StartScreen.tsx`). That rule has to give a little. The proposal is a fourth way in, **More designs**: a searchable list grouped by `catalog.group`. Picking one draws one picture with `designPicture`, shows its parameters through the same `TemplateSection` as the card after Start, and starts it. Only one picture is drawn at a time. The rule stays for the sentence itself.

Alternative: add only the lane A styles and a few lane B templates as sentence structures (*a bookend*, *a shelf*, *a book stand*). This keeps the no-gallery rule, but every new structure needs its own grammar and en/he sentence keys.

## 8. Recipe for porting one generator

1. Read its `__init__` (arguments and defaults) and `render()` (parts and edge strings).
2. Choose its parameters. Keep the sizes (`x`, `y`, `h` as `width`, `depth`, `height`, with `sizeAs`) and the choices that change the structure. Drop boxes.py's finger, burn and layout settings. Clamp ranges to `SIZE_MIN` / `SIZE_MAX`.
3. Draw it in 3D. Pick the root board. Grow each `f`/`F`/`h` neighbour from the edge it meets, at its angle. Leave `e` edges free. Turn holes and cut-outs from its callbacks into details.
4. Give every board a `role`.
5. Set its materials. Plywood always. Card and corrugated where the folds make sense (most lane B templates do; lane D parts are plywood or acrylic).
6. Add `limits` / `accepts` (sheet size, the smallest pieces) and `check`.
7. Add en and he keys (`tpl.<id>`, `tpl.<id>.desc`, the parameter labels).
8. Test it (§9).
9. Add a line to `THIRD_PARTY.md`: the generator's name, `boxes.py`, GPL‑3.0, *recipe ported*.

## 9. Tests

For every template, in `tests/boxespy.test.ts`, parametrised over the catalogue:

- `generate` with the defaults on each material it lists. Expect no export-check errors (`check.ts`), every touching pair joined (as `autoseam.test.ts` checks), and every piece on one sheet.
- `regenerate` with every number at its min and max. Expect it either builds clean or `accepts` refuses it with a reason.
- A shape added to one board survives a size change (stable roles).
- One golden SVG per template at the defaults (`tests/golden`, run with `UPDATE_GOLDEN=1` once).
- en/he key coverage (the i18n test already walks `TEMPLATES`).
- For lane C, a physical test cut per edge type before it is marked `stable`; until then it is `beta`.

## 10. Milestones

| # | Milestone | Lanes | Size |
|---|---|---|---|
| **B1** | Contract (`catalog`, `source`) + *More designs* list + the test harness of §9, with `organiser` and `stand` moved in | infra | M |
| **B2** | Lane A styles (about 10) | A | S |
| **B3** | Shared helpers: angled boards between two sides, stacked layers, hole grids | B | M |
| **B4** | First lane B batch: `openbox`, `basedbox`, `angledbox`, `unevenheightbox`, `magazinefile`, `notesholder`, `halfbox`, `bookholder`, `desksign`, `slantedtray`, `birdhouse`, `wallrack` | B | L |
| **B5** | Second lane B batch: `displayshelf`, `cardholder`, `smallpartstray`, `bintray`, `dicetower`, `drillstand`, `penholderbox`, `shadowbox`, `photoframe`, `can_storage`, `laptopstand` (half-laps on non-upright boards) | B | L |
| **B6** | Lane D: parts group (gears, knobs, hole patterns, jigsaw, game board + tokens) | D | M |
| **B7** | C1 sliding lids, C2 stackable edges → `slidinglidbox`, `compartmentbox`, `stackablebin`, `paintbox` | C | L |
| **B8** | C5 edge profiles, C6 flex round any outline → `heart`, `flexbox*` | C | L |
| **B9** | C3 hinges, after the pin-hinge spike | C | L |
| **B10** | Verification round: every template on every material in the dev server, screenshots en/he, `PROGRESS.md` | all | M |

Recommended start: **B1 → B2 → B3 → B4**. That puts about 25 new presets in front of you before any engine change.

## 11. Open questions for the owner

1. **The catalogue.** Is *More designs* as a fourth way in acceptable, or should the presets stay inside the sentence (more grammar per preset; §7)?
2. **Materials.** Plywood only for the ported presets at first (faster), or card and corrugated from the start where they fold?
3. **Licence.** boxes.py is GPL‑3.0. Porting recipes for your own use is fine. If CutForge is later deployed to a class (the Worker and classroom submission), that counts as distribution, and the ported files carry that licence. Keeping them in `src/templates/boxespy/`, listed in `THIRD_PARTY.md`, keeps that clear either way.
4. **Hinges (C3).** Wait for the pin-hinge spike as `DECISIONS.md` says, or port boxes.py's hinge sizes as `beta` straight away?
5. **Priority inside lane B.** Which ten would you use first?
