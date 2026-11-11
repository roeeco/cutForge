# CutForge: presets, parametric designs on the same engine: brief (milestones 44–51)

Planning notes from 2026-11-11, made after milestone 43 (the tour). Build this after `BOARD_TOOL_PLAN.md` and `TOUR_PLAN.md`; nothing here depends on the tour.

## 1. What changes for a student

- **More starting points, ready to cut.** The welcome screen's step 2 gets an **Available now** list of presets: a pen cup, a magazine file, a drawer (tray and sleeve), a phone stand, a little house (gable box), a mailer box, a slotted grid insert, plus today's *Organiser with dividers* and *Card / tile stand*.
- **Only what the material can make.** Choosing a material in step 1 filters step 2. A preset that can't be made from that material isn't shown. One line under the list says what the others need (*"2 more with Corrugated 4 mm"*); clicking it switches the material.
- **Make it yours, but it stays that thing.** In a preset design the student can:
  - change its sizes and features in the settings card
  - cut holes, engrave, add text and stickers
  - cut through the whole design
  - add their own boards inside (standing boards, dividers, boards on a face)

  The student can't delete a preset board, drag its corners, change its angles or regrow it. A mailer box stays a mailer box. The settings card says so in one line, and Workshop has an explicit way out: *Make it a free design*.
- **A settings card like a product configurator.** The sizes come first. Features (lid, slope, handle, notch) come next. Fit values are folded away under *Advanced*. Every number has −/+ buttons and a slider showing its range. Focusing a field highlights the boards it changes. The card says the limit and why (*"Tallest that stays one piece on this sheet: 132 mm"*), and shows what you get: inside size, outside size, sheets used.

## 2. What "a preset" is

A preset is today's `TemplateDef` (`src/templates/types.ts`), grown up. It is a **script**: a TypeScript module that receives the material and the parameters and builds the ordinary design model with `ops`. There are no new geometry engines and no new design fields beyond what `Design.template` already holds. Each preset is one file in `src/templates/presets/`, about 50–150 lines, written against a small **preset kit** (`src/templates/kit.ts`) so that a new preset reads like a recipe:

```ts
export const pencup: PresetDef = {
  id: 'pencup', version: 1, category: 'organise',
  name: 'pre.pencup', description: 'pre.pencup.desc',
  materials: ['card', 'corrugated', 'plywood'],
  params: [
    num('across', 'pre.across', { group: 'size', min: 40, max: 250, default: 80, affects: ['base', 'wall*'] }),
    num('height', 'pre.height', { group: 'size', min: 30, max: 250, default: 100, maxFor: kit.flatHeight('base'), affects: ['wall*'] }),
    int('sides', 'pre.sides', { group: 'shape', min: 3, max: 12, default: 6 }),
    choice('top', 'pre.top', ['flat', 'slanted'], { group: 'shape', default: 'flat' }),
    num('low', 'pre.lowSide', { group: 'shape', min: 20, max: 250, default: 60, when: (p) => p.top === 'slanted' }),
  ],
  sizes: [{ label: 'pre.size.small', params: { across: 70, height: 90 } }, { label: 'pre.size.tall', params: { across: 80, height: 140 } }],
  generate(k, p) {
    const base = k.polygonBase('base', p.sides, p.across);
    const walls = k.tray(base, p.height, 'wall');
    if (p.top === 'slanted') k.slantTop(walls, p.height, p.low);
  },
  readouts: (d, p) => [k.inside(d, 't:base'), k.sheets(d)],
};
```

**Why the kit:** today's templates call `addRootPanel`, `growPanel` and `connectSeams` directly, and every one repeats the inner/outer arithmetic and the material branches (`organiser.ts`, `stand.ts`). The kit holds those once:
- `box(W, D, H, sizeMode)`, `polygonBase`, `tray`
- `slantTop`, `gable`, `lid('liftoff' | 'hinged' | 'tuck')`, `sleeve`
- `cutout(role, panel, shape, at)`, `grid(rows, cols)`, `flatHeight`, `inside`, `sheets`

The kit also hands out the stable role ids the registry already uses (`t:<role>`).

**Not in this phase:** scripts written by teachers or students in the browser (a sandboxed DSL). The kit is the API such a thing would use later, so keep it small and pure.

## 3. Decisions

| Topic | Decision |
| --- | --- |
| Name | **Preset** in the UI (en) and in code (`PresetDef`). `TemplateDef` becomes an alias so saved files and missions keep working. Hebrew: choose with the teacher (draft: *תבנית מוכנה*). |
| Same engine | **No new geometry engines.** Every preset is a script over existing `ops`. Where a preset needs something the engine can't do yet (§6), that piece is added to `ops` with its own tests, usable from Workshop too. |
| Design model | **`Design.template` stays the record** (`{ id, version, params }`). Generated entities keep the `t:` prefix. One new optional field: `template.free?: true` after *Make it a free design* (§5), or drop `template` entirely (see *My calls*). |
| Focus | **Card and corrugated first.** Every preset supports `corrugated`. Most support `card`. Plywood only where the form works with fingers or lean slots (see the matrix in §7). |
| Thick paper | **Thick paper is the `card` kind.** The built-in `card-0.5` covers it. Adding a 300 gsm profile (`card-0.3`) is one line in `materials.ts`, so presets don't treat it as anything special. See *My calls*. |
| Material filter | **Hidden, not disabled.** Step 2 shows only presets whose `supports(m)` passes for the chosen material, with one line naming what the hidden ones need. `supports` can check thickness as well as kind (the slotted grid needs ≥ 1.6 mm). |
| Material change later | The material drawer lists every material. Ones the preset can't use are greyed with the reason. *Make it a free design* is offered when the student still wants that material. |
| The form lock | **Prevent in the UI, enforce in the store.** The UI hides structural controls on preset boards. The store's `guarded()` (already run on every `apply` and `preview`) compares the preset boards' *form signature* with the one the parameters produce, and rejects an edit that changes it, with a toast. §5 has the full table. |
| On-stage handles | **Handles drive parameters.** On a preset board, the height arrow and the W/H labels don't resize the board; they change the parameter the board's size comes from (`affects`). Dragging a mailer's wall arrow changes *Inside height*. |
| Joints | **The preset decides.** A preset that offers a joint choice exposes it as its own parameter (*Corners: glue flaps / tab locks*). The design-wide *Joints* section is hidden while a preset is active. Quick build already hides it. |
| Settings card | **Groups: Size, Shape, Openings, Advanced.** *Advanced* is closed by default and holds fit values (clearance, inner/outer, flap sizes). Each field has a help line. A field whose limit depends on other values shows the live limit and why. Each changed value has a reset dot. One edit is one undo step (as today). |
| Typed values | **No silent correction** (from Foldform). An out-of-range typed value is refused with the range. A value that becomes impossible because another changed is kept, and a named diagnostic appears (*"Height is over 132 mm: the walls will be cut as their own pieces"*) until the student fixes it or accepts it. |
| Size chips | **Named sizes per preset** (OpenSCAD's saved parameter sets, simplified): *A4 file*, *Deck of cards*, *Phone*. Chips sit above the Size group. Saving your own is not in this phase. |
| Welcome screen | Step 2 becomes **Start from**. *Blank* comes first, then **Available now**, grouped by category (*Boxes*, *Organise*, *Stands*, *Inserts*) once there are more than six cards. The tour card is unchanged. A **Coming soon** row (locked cards, like Foldform's) is off by default. |
| Quick build | Presets show in both modes. In Quick build the *Advanced* group is hidden and its values use the defaults. Missions can start from any preset (`Mission.template` already allows it). |
| Teacher | **Optional:** a class can choose which presets are offered (`viewPrefs.presets`, like `viewPrefs.missions`), plus a switch that hides *Make it a free design*. It shares the missions column pattern. |
| Versioning | A preset's `version` goes up when its geometry changes. Opening a design from an older version keeps the old params and regenerates with the new script. The settings card says *"Updated preset: check your sizes"* once. Golden files pin each version. |

**My calls (say if you want them different):**

- ***Make it a free design* keeps the boards and drops `Design.template`.** It doesn't keep a "detached" flag. One undo step brings the preset back. Workshop only; Quick build shows *Open in Workshop* instead. Simpler than a flag, and nothing else reads it.
- **The student may *Add material* only on boards they made.** On preset boards it's *Cut out*, *Engrave* and *Score*. An *Add* on a preset board changes its outline, and the joints and flat-net math would no longer match the preset.
- **Cut-outs that the preset makes** (a handle, a thumb notch, a door) are preset shapes: generated, with stable ids (`t:<role>:<name>`), changed only from the card. The student's own holes sit next to them and stay through every regeneration (§5).
- **No `card-0.3` profile yet.** Say if your printers/lasers use thinner stock and I'll add it in milestone 45.
- **Plywood versions of the house and the mailer are out of this phase.** They need angled finger joints the laser can't cut square. The house in plywood would need butt + glue roofs. Card and corrugated only.

## 4. The settings card, field by field

Sources this borrows from, and what each adds:
- **Foldform** (`roeeco/foldform`, `app/Editor.tsx`, `docs/template-engine.md`):
  - primary sizes separate from construction values (`role`, `simpleMode`)
  - mm field with ±1 mm buttons (0.1 for small values) and a slider popover on focus showing min–max
  - focusing a field makes the geometry it drives glow
  - named diagnostics with no silent correction
  - one undo step per edit
- **boxes.py** (Florian Festi): parameters grouped per generator, a help line on each, an explicit *outside* (inner/outer) switch, and compartments as a list of widths (`50:30:30`). The list is in milestone 50 as an optional *Compartments: equal / custom* field.
- **Cuttle** templates: a reset icon on each changed parameter, and *Edit in Cuttle* to leave the packaged view. That's our *Make it a free design*.
- **OpenSCAD Customizer**:
  - groups as tabs
  - ranges shown as sliders, choices as dropdowns
  - named parameter sets, which become our size chips
  - Lesson from its limits: it can't show a field conditionally, so we add `when`.
- **Pacdora, TemplateMaker**: say plainly whether a size is inside or outside, and show the folded result live. We have the fold slider. It starts at *folded* and is shown for every card/corrugated preset.

Where CutForge can do better than all of them: the limits come from the real engine and the chosen sheet, not a fixed range.
- **Tallest one-piece wall:** from `trayFlatInfo`, the same tick the tray card shows today.
- **Largest base on this sheet:** from `pack.ts`.
- **Smallest notch the material keeps:** from `minWeb`.

The card shows that number next to the field, and the slider's range ends there.

**Parameter definition** (extends `ParamDef`):

| Field | Meaning |
| --- | --- |
| `group` | `'size' \| 'shape' \| 'openings' \| 'advanced'` |
| `help` | one-line help text key (en + he), shown under the field when focused |
| `step` | ± step; default 1 mm, or 0.1 mm under 5 mm |
| `when(p, m)` | shown only when true (e.g. *Low side* only for a slanted top) |
| `maxFor(d, p)` / `minFor(d, p)` | live limit from the design, with a reason key |
| `affects` | role names (with `*`) of the boards to highlight, and the handles that drive it |
| `only` | material kinds (already exists) |

**Readouts** (preset-defined, at the bottom of the card): inside size, outside size, sheets used (`easy/sheet.ts` already computes *1 sheet · 63%*). Some presets add one of their own (the grid insert: *Cells: 4 × 3, each 38 × 52 mm*).

**Highlight:** a focused field puts the existing selection glow on its `affects` boards in 3D and in the cut plan, without selecting them, plus a dimension line for size fields (`views/widgets.tsx` already draws dimension labels).

## 5. The form lock

| On a preset board (`t:` id) | Allowed? | Instead |
| --- | --- | --- |
| Shapes: Cut out, Engrave, Score, text, stickers, imported SVG | ✅ | — |
| Shapes: Add material | ❌ | allowed on the student's own boards |
| Cut through the whole design | ✅ | — |
| Place a board on its face, a standing board, a divider between its walls | ✅ | — |
| Copies to cut, hand placement on the cut plan, *Repack* | ✅ | — |
| Move / turn the whole design (root panels) | ✅ | (already kept by `regenerate`) |
| Board name | ✅ | (already kept) |
| Delete it | ❌ | toast: *"Part of the Mailer box: change it in the settings card"* |
| W/H fields, size arrows, push-pull | ❌ | redirected to the parameter in `affects`; none → read-only |
| Edit outline (corners, points, curves), *Wall it*, open a side, own height | ❌ | preset parameters, where the preset offers them |
| Grow from its edge | ✅ for edges the preset marks `growable` (e.g. a tray's top edges, for a student's lid); otherwise ❌ | — |
| Angle, flip side, fold-over, joint kind | ❌ | preset parameters |
| Its own material | ❌ | design material in the drawer (regenerates) |

**Enforcement:** `presetForm(d)` computes, for each `t:` panel, its outline, size, frame relative to its root, and connections (angle, kind, edges). `guarded(d, before)` in `store.ts` already runs on every `apply` and `preview`. When `d.template` is set and the edit wasn't a regeneration, the guard compares `presetForm` before and after. If it changed, the edit is undone and the store sets `lockNote` for the toast. Regeneration goes through a store action that marks itself, so the guard lets it through. This is the safety net. The UI hides the controls, so students should never see the toast in normal use; it fires on keyboard shortcuts and paths we missed. The feature table in `easy/features.ts` gets a second axis for this (`lockState(feature, d, panelId)`) so components keep asking one function.

**Regeneration that follows the student's work.** Today `regenerate()` keeps details by panel id, user panels and their connections, names, quantities and placements. It doesn't move anything when a size changes, so a hole can end up off a shrunk wall. Added in milestone 47:
- **Student shapes on a preset board keep their place relative to the board.** Each shape is stored against the nearest of the board's centre, edges and corners. A shape near the top edge stays that far below it when the height changes. Afterwards it's pulled inside with the Quick build guard (`easy/guard.ts`: inset by `minWeb`, away from joints and other cut-outs). A shape that can't fit is listed with the existing *lost* message (shapes it had to move are listed too).
- **Student boards placed on a preset face** keep their place the same way, and are clamped to the face.
- **Student dividers between preset walls** are re-planned between the same two walls (`planDividerFor`), at the same fraction of the clear inside.
- **Preset keep-out zones:** a preset can mark regions where student cuts aren't allowed (a mailer's tuck flap and its slit, lock-tab slots, the sleeve's glue flap). The guard treats them like joint holes.

## 6. Engine work the presets need

Most of what the presets need exists already:
- polygon trays
- wall outlines with gables and inserts
- own heights and sloped corners (`setWallCorner`)
- growing from sloped edges with adapt
- fold-over double walls with lock tabs
- dividers with half-laps
- construction panels
- through-cuts and leaning supports with side walls
- glue, fold, tab-and-slot, self-locking and fold-under tabs
- nets that lie flat

Missing, and added to `ops` (each with unit tests, each usable from Workshop):

1. **`regenerate` follows** (§5): anchored shapes, placed boards, re-planned dividers, keep-out zones.
2. **A flap chain:** a panel grown from a grown panel's edge, folding inwards, with rounded free corners (a tuck flap). `growPanel` from a grown panel works today, and rounded corners work through `setPointCurve`. The new parts:
   - a clearance rule: the tuck is shortened by `t + clearance` per fold it passes
   - the nets-lie-flat check covering three-deep chains

   Spike first in milestone 49. If it misbehaves, the mailer ships with a hinged lid and a front lip (no tuck), and the tuck moves to a follow-up.
3. **Dust ears:** small flaps grown from a lid's side edges at 90° down, inside the side walls, trimmed by `adapt` where they meet the walls.
4. **A free-standing slotted grid:** crossing standing boards with half-laps and no box. Plan A: a construction base with construction walls (never cut) as the frame, dividers between them, with slots against construction walls suppressed. Plan B, if A fights the joint code: `addGrid(d, x, z, W, D, H, rows, cols)` placing standing boards directly, with half-laps from the existing upright-crossing detection.
5. **Sleeve closing seam:** a band of four panels closed by one glue flap (base, two walls, top, flap back onto the first wall). The fold chain exists. Check that `connectSeam(…, 'glue')` closes a band that ends on its own first panel, and that the flat net places the flap on the outside.

## 7. The presets

Default material in brackets. ✅ supported · — not offered.

| Preset | Card | Corr. 1.6 | Corr. 4 | Ply 3 | Engine pieces | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| **Organiser with dividers** (exists) | ✅ | ✅ | ✅ | ✅ | tray, dividers, lift-off lid; adds **hinged lid** | low |
| **Card / tile stand** (exists) | ✅ | ✅ | ✅ | ✅ | leaning supports | low |
| **Pen cup** [corr 1.6] | ✅ | ✅ | ✅ | ✅ | polygon tray, slanted top | low |
| **Magazine file** [corr 4] | — (too floppy at that height) | ✅ | ✅ | ✅ | tray, own heights, sloped side corners, finger hole | low |
| **Phone stand** [corr 4] | ✅ | ✅ | ✅ | ✅ | stand kit with one support, cable notch | low |
| **Drawer: tray and sleeve** [card] | ✅ | ✅ | ✅ | — (v2) | tray, sleeve band (§6.5), thumb notch | medium |
| **Little house / gable box** [corr 1.6] | ✅ | ✅ | ✅ | — | gables, roofs from sloped edges, door/windows | medium |
| **Slotted grid insert** [corr 1.6] | — (needs ≥ 1.6 mm) | ✅ | ✅ | ✅ | free grid (§6.4) | medium–high |
| **Mailer box** (FEFCO 0427 style) [corr 1.6] | ✅ (a card deck box) | ✅ | ✅ | — | fold-over walls, hinged lid, flap chain, dust ears (§6.2–3) | high |

**Parameters** (Size · Shape · Openings · *Advanced*):

- **Pen cup:**
  - Size: across flats, height
  - Shape: sides 3–12, top flat/slanted, low side
  - Openings: none
  - *Advanced:* corners (material default), inside/outside
  - Chips: *Pencils*, *Brushes (tall)*
- **Magazine file:**
  - Size: width, depth, back height
  - Shape: front height, slope starts at
  - Openings: finger hole on the back (none/round/slot) and its size, label area (engrave frame)
  - *Advanced:* inside/outside
  - Chips: *A4*, *A5*
  - Readout: sheets, since at A4 size corrugated walls are cut as their own pieces; the card says so.
- **Phone stand:**
  - Size: device width, device thickness
  - Shape: lean 60°/45°, lip height
  - Openings: cable notch (on/off, width)
  - Chips: *Phone*, *Tablet*
- **Drawer:**
  - Size: inside width, depth, height
  - Openings: thumb notch on the tray front (half-round/none), pull hole on the sleeve (none/round)
  - *Advanced:* clearance (from the material), glue-flap width
  - Chips: *Matchbox*, *Deck of cards*, *Jewellery*
- **Little house:**
  - Size: width, depth, wall height
  - Shape: roof pitch (30°/45°/60°), roof overhang 0–20 mm, ridge (glued/open slot for coins)
  - Openings: door (none/rect/arch), windows per side 0–3, chimney (on/off)
- **Slotted grid insert:**
  - Size: fits inside width × depth (the box it goes into), height
  - Shape: rows, columns, ends (flush/with locking ears)
  - *Advanced:* fit allowance
  - Chips: *Inside the organiser*, which copies the clear inside of an organiser from another tab of the same project when there is one. Otherwise the chip is hidden.
- **Mailer box:**
  - Size: inside length, width, height
  - Shape: walls single/double (default double on corrugated), tuck depth, dust ears on/off
  - Openings: thumb notch in the front, ribbon slots (none/2)
  - *Advanced:* clearance, lock tabs (count)
  - Chips: *A5 mailer*, *Shoe box*, *Deck of cards* (card)
- **Organiser:**
  - Adds the lid choice *hinged* (grown from the back wall's top edge, joined as a fold on card/corrugated and as a slot hinge on plywood)
  - The existing params move into the groups

## 8. Milestones

| # | Milestone | Done when |
| --- | --- | --- |
| **44** | **PresetDef, the kit, the settings card.** `PresetDef` (alias `TemplateDef`), `kit.ts`, `presets/` folder. `organiser` and `stand` moved onto the kit, golden exports byte-identical. The card gets groups, *Advanced*, help lines, ± and the slider popover (extend `NumField`), `when`, live limits, reset dots, size chips, readouts, field-focus highlight. | Golden files unchanged; vitest for the kit; e2e: focus a field → its boards glow; out-of-range typed value refused with the range. |
| **45** | **Welcome screen and material filter.** *Start from* with *Available now*, grouped; hidden-by-material with the *"N more with …"* line that switches material; `supports(m)` with thickness; the drawer greys unsupported materials with the reason. Optional `viewPrefs.presets` for the class. | e2e: corrugated shows the grid insert, card hides it and says why; switching material from the line selects it. |
| **46** | **The form lock.** `presetForm`, the store guard, the lock axis on the feature table, handles → parameters, *Add* limited to student boards, *Make it a free design* (Workshop, confirm, one undo). | Unit: every structural op on a `t:` panel is rejected by the guard; e2e: dragging a preset wall's arrow changes the parameter; delete shows the toast. |
| **47** | **Regeneration that follows.** Anchored shapes, placed boards, re-planned student dividers, keep-out zones, extended *lost* message. | Unit: a hole 10 mm under the top edge stays 10 mm under it at every height; a student divider stays at the same fraction; regenerate twice = once (as B24). |
| **48** | **Presets, batch A:** pen cup, magazine file, phone stand, organiser's hinged lid. | Per preset × supported material: defaults and 200 seeded random parameter sets (`tests/fuzz/templates.test.ts` pattern) generate with no blocking export errors, every touching pair joined (`autoseam` check), nets lie flat or the card says why, regenerate idempotent; goldens for defaults. |
| **49** | **Presets, batch B, with spikes first:** drawer (sleeve seam §6.5), little house, slotted grid (§6.4 plan A or B), mailer (§6.2–3, with the hinged-lid fallback). Each spike gets a half-day timebox; record what was chosen in `DECISIONS.md`. | Same tests as 48; e2e per preset: start → change two sizes → cut a hole → export. |
| **50** | **Polish:** *Compartments: equal / custom widths* for the organiser (boxes.py-style list), Quick build pass (Advanced hidden, missions from presets: *Mailer for a gift*, *House with 2 windows*), Hebrew strings, thumbnails for every preset × material, screenshots into `docs/preset-shots/`. | i18n coverage test; screenshots reviewed in en and he. |
| **51** | **Final verification** in the usual form: everything above re-run, `PROGRESS.md` updated, remaining limitations listed. | — |

## 9. Tests to add

- `tests/presets.test.ts`: every preset × every material it supports. Generate at defaults and at each size chip. Check validate (no blocking issues), nets flat or a named issue, sheet fit at defaults on the material's default sheet, and that `regenerate(d, d.template.params)` returns an identical design.
- `tests/fuzz/presets.test.ts`: seeded random params inside the live limits, small default count (like the other fuzzers), with a larger count under an env var.
- `tests/presetlock.test.ts`: for each structural op in `ops.ts`, applied through the store to a `t:` panel, the design is unchanged and `lockNote` is set. Shapes, placed boards and dividers go through.
- `tests/presetfollow.test.ts`: anchored shapes, placed boards and dividers across size changes.
- Goldens: `preset-<id>-<material>.svg/.dxf` at defaults; organiser and stand files unchanged.
- e2e `presets.spec.ts`: filter, chips, highlight, handle → parameter, lock toast, free design, export.

## 10. Open questions for you

1. **Hebrew name** for "preset" and for each preset (draft names go in `he.ts` marked for review).
2. **Coming soon row:** show batch B presets as locked cards while 48 ships, or keep them hidden until they work? Default: hidden.
3. **Thinner stock:** add a 300 gsm cardstock profile?
4. **Teacher control:** is per-class preset choice wanted now, or later?
5. **The mailer in card:** a tuck-top deck box is the natural card version. Keep it as the mailer's card variant, or make *Deck box* its own preset with its own sizes?

## References

- Foldform: `app/lib/template-kernel.ts` (manifests, parameter roles, `simpleMode`), `docs/template-engine.md` (the four layers: form, net topology, edge treatments, manufacturing policy), `app/Editor.tsx` (fields, slider popover, glow).
- boxes.py user manual: https://florianfesti.github.io/boxes/html/usermanual.html
- Cuttle templates and box generators: https://cuttle.xyz/blog/cuttle-templates-box-generators
- OpenSCAD Customizer: https://files.openscad.org/documentation/manual/Customizer.html
- Pacdora dieline generator: https://pacdora.com/tools/dieline-generator
- FEFCO code (corrugated box styles; 0427 is the roll-end tuck-front mailer), for naming the box presets.
