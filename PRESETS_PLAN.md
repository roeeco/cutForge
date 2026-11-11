# CutForge: presets, parametric designs on the same engine: brief (milestones 49–56)

Planning notes from 2026-11-11, made after milestone 43 (the tour). Revised the same day with the owner's answers, a study of other dieline generators (§3), and a probe of double walls (§7).

**Build this after the branch `claude/gifted-lamport-uwf70b`.** It holds milestone 44, dividers that find their own ends (`DIVIDERS_PLAN.md`), and milestones 45–48, round bases and curved walls (`CURVED_WALLS.md`). Start milestone 49 from that branch, or from `main` once it has merged. Two things here depend on it:
- **Dividers:** in its model a divider is a drawn line on its base (`Panel.divider`: `at`, `rot`, `reach`) whose ends are found by `reconcileDividers`. The organiser's generator, and a student's dividers in a preset, use that model (§6).
- **Round bases** (milestone 45) and **bent walls** (milestones 46–48) give the pen cup a *Round* and *Oval* shape (§8).

**Scope of this phase: the low-risk presets only.** Pen cup, magazine file and phone stand are new. The organiser gets a hinged lid, and the card stand moves onto the preset kit. The riskier presets (drawer, little house, slotted grid, mailer) are left out. They're listed in §12 with what they need, and the welcome screen doesn't mention them.

## 1. What changes for a student

- **More starting points, ready to cut.** The welcome screen's step 2 gets an **Available now** list of presets: a pen cup, a magazine file and a phone stand, plus today's *Organiser with dividers* and *Card / tile stand*.
- **Only what the material can make.** Choosing a material in step 1 filters step 2. A preset that can't be made from that material isn't shown. One line under the list says what the others need (*"1 more with Corrugated 1.6 mm"*); clicking it switches the material.
- **Make it yours, but it stays that thing.** In a preset design the student can:
  - change its sizes and features in the settings card
  - cut holes, engrave, add text and stickers
  - cut through the whole design
  - add their own boards inside (standing boards, dividers, boards on a face)

  The student can't delete a preset board, drag its corners, change its angles or regrow it. A pen cup stays a pen cup. The settings card says so in one line, and Workshop has an explicit way out: *Make it a free design*.
- **Double walls where they help.** On card and corrugated, the pen cup, the magazine file and the organiser offer *Walls: single / double, glued / double, locked*. This is Foldform's glued fold-over and tabbed fold-over lock, built on cutForge's existing fold-over (§7).
- **A settings card like a product configurator.** The sizes come first. Features (lid, slope, walls, notch) come next. Fit values are folded away under *Advanced*. Every number has −/+ buttons and a slider showing its range. Focusing a field highlights the boards it changes. The card says the limit and why (*"Tallest that stays one piece on this sheet: 132 mm"*), and shows what you get: inside size, outside size, sheets used. When something can't be made, the message comes with a button that fixes it (*Set height to 132 mm*).

## 2. What "a preset" is

A preset is today's `TemplateDef` (`src/templates/types.ts`), grown up. It is a **script**: a TypeScript module that receives the material and the parameters and builds the ordinary design model with `ops`. There are no new geometry engines and no new design fields beyond what `Design.template` already holds. Each preset is one file in `src/templates/presets/`, about 50–150 lines, written against a small **preset kit** (`src/templates/kit.ts`) so that a new preset reads like a recipe:

```ts
export const pencup: PresetDef = {
  id: 'pencup', version: 1, category: 'organise', status: 'stable',
  name: 'pre.pencup', description: 'pre.pencup.desc',
  materials: ['card', 'corrugated', 'plywood'],
  roles: ['base', 'wall*'],
  params: [
    num('across', 'pre.across', { group: 'size', min: 40, max: 250, default: 80, affects: ['base', 'wall*'] }),
    num('height', 'pre.height', { group: 'size', min: 30, max: 250, default: 100, affects: ['wall*'] }),
    int('sides', 'pre.sides', { group: 'shape', min: 3, max: 12, default: 6 }),
    choice('top', 'pre.top', ['flat', 'slanted'], { group: 'shape', default: 'flat' }),
    num('low', 'pre.lowSide', { group: 'shape', min: 20, max: 250, default: 60, when: (p) => p.top === 'slanted' }),
    kit.wallsParam({ when: (p) => p.top === 'flat' }),
  ],
  limits: (m, p) => ({ height: kit.oneNetHeight(m, p), sides: { min: p.walls === 'single' ? 3 : 4 } }),
  sizes: [{ label: 'pre.size.small', params: { across: 70, height: 90 } }, { label: 'pre.size.tall', params: { across: 80, height: 140 } }],
  generate(k, p) {
    const base = k.polygonBase('base', p.sides, p.across);
    const walls = k.tray(base, p.height, 'wall', { walls: p.walls });
    if (p.top === 'slanted') k.slantTop(walls, p.height, p.low);
  },
  readouts: (d) => [k.inside(d, 't:base'), k.sheets(d)],
};
```

**Why the kit:** today's templates call `addRootPanel`, `growPanel` and `connectSeams` directly, and every one repeats the inner/outer arithmetic and the material branches (`organiser.ts`, `stand.ts`). The kit holds those once, and the builders are what new presets reuse:
- `box(W, D, H, sizeMode)`, `polygonBase`, `tray(…, { walls })`
- `slantTop`, `lid('liftoff' | 'hinged')`, `lean`
- `cutout(role, panel, shape, at)`, `wallsParam`, `oneNetHeight`, `inside`, `sheets`

The kit also hands out the stable role ids the registry already uses (`t:<role>`).

**Not in this phase:** scripts written by teachers or students in the browser (a sandboxed DSL). The kit is the API such a thing would use later, so keep it small and pure.

## 3. The preset contract (what makes it rigid enough to grow)

These rules come from reading the code of other parametric dieline generators. Each one prevents a failure that a growing catalogue would hit:
- **PackBox** (`sbarrak/packbox`, MIT)
- **OpenBox3D** (`yuyou-dev/OpenBox3D`, MIT)
- **diecutstudio** (`pradeepsiddappa/diecutstudio`, MIT)
- **CardBoxGen** (`sunnydesigntech/CardBoxGen`, MIT)
- **Polyhedz** (`justin-hackin/svg-widgets-monorepo`)
- **FoldForge** (`BhavyaAk25/FoldForge`, MIT)
- **`roeeco/dielinegenerator`**

Only ideas are taken; no code is copied.

1. **A preset declares its parts, and the list never changes.** `roles` lists every part id the script may make (`wall*` for numbered sets). A part may appear or disappear only through a declared choice (`lid: none / liftoff / hinged` → `lid*`). The kit throws if the script makes a part it didn't declare, or skips one that its choices require.
   - This list *is* the form lock (§6). Rather than comparing whole outlines, the store checks that the preset's parts and their joints (kind class, which edges) still match.
   - Sources: PackBox's edge-accounting test, `dielinegenerator`'s same-topology check, and diecutstudio, which refuses to fold when a crease has no spec.
2. **One `limits(material, params)` per preset.** The slider ranges, the diagnostics, the size chips and the random-parameter tests all read the same numbers, so they can never disagree (Foldform's rule, and CardBoxGen's `computed_limits`). Limits come from the material and the engine:
   - minimum web: `minWeb`
   - tallest one-piece net: `trayFlatInfo` plus the sheet
   - double walls: §7
3. **Diagnostics name a fix.** Each one is `{ code, param, actual, limit, fix?: { param, value } }`, and the card shows the fix as a button. A preset that can't be made shows its diagnostics instead of a broken design. Export stays blocked by the existing check, as now. Sources: CardBoxGen's fix text, and FoldForge's failures that point at the parameter to change.
4. **Families and rows.** A builder in the kit can serve several presets that differ only in defaults and choices. A preset can be a row over another preset's builder (`{ ...magfile, id: 'letter-tray', defaults: … }`). Sources: `dielinegenerator` covers 226 FEFCO codes with about 10 family functions; PackBox has four styles over three builders.
   - Avoid variant logic as ternaries on preset ids.
   - Avoid special cases for one preset inside shared code.
5. **Nested parts are sized from the built part, not from formulas.** A lid's or insert's inner size is taken from the generated part's measured outside plus clearance (`k.outside(role)`), never from a retyped `W + 2t + c`. This lesson comes from OpenBox3D, which repeats thickness formulas by hand in its 2D and 3D code, where they can drift.
6. **Ids from roles only.** Ids are never made from counters or segment indices, which break as soon as a size changes the segment count (both PackBox and OpenBox3D do this). cutForge's `t:<role>` ids are already right; the kit enforces it.
7. **A catalogue with a status.** `status: 'planned' | 'beta' | 'stable'` on each preset. *Stable* and *beta* show under *Available now* (beta with a small tag). *Planned* presets are registered but never shown, which is how §12's presets wait. Source: `dielinegenerator`'s implementation backlog.

## 4. Decisions

| Topic | Decision |
| --- | --- |
| Name | **Preset** in the UI (en) and in code (`PresetDef`). `TemplateDef` becomes an alias so saved files and missions keep working. Hebrew names are direct translations (§11). |
| Same engine | **No new geometry engines.** Every preset is a script over existing `ops`. Where a preset needs something the engine can't do yet (§7), that piece is added to `ops` with its own tests, usable from Workshop too. |
| Design model | **`Design.template` stays the record** (`{ id, version, params }`). Generated entities keep the `t:` prefix. |
| Focus | **Card and corrugated first.** Every preset supports `corrugated`. Most support `card`. Plywood only where the form works with fingers or lean slots (see the matrix in §8). |
| Thick paper | **Thick paper means cardstock: the `card` kind** (the built-in `card-0.5`). No new material profile. |
| Card variants | **Dropped when they're not needed.** A preset supports card only where card makes a sensible version of the same thing. There are no separate card-only presets (the mailer's card deck box is dropped with the mailer). |
| Riskier presets | **Left out for now.** Drawer, little house, slotted grid and mailer are `status: 'planned'` (§12): not shown, no *Coming soon* row. |
| Material filter | **Hidden, not disabled.** Step 2 shows only presets whose `supports(m)` passes for the chosen material, with one line naming what the hidden ones need. `supports` can check thickness as well as kind (the magazine file needs at least 1.6 mm). |
| Material change later | The material drawer lists every material. Ones the preset can't use are greyed with the reason. *Make it a free design* is offered when the student still wants that material. |
| The form lock | **Prevent in the UI, enforce in the store.** The UI hides structural controls on preset boards. The store's `guarded()` (already run on every `apply` and `preview`) checks the preset contract (§3.1), and rejects an edit that breaks it, with a toast. §6 has the full table. |
| On-stage handles | **Handles drive parameters.** On a preset board, the height arrow and the W/H labels don't resize the board; they change the parameter the board's size comes from (`affects`). Dragging a pen cup's wall arrow changes *Height*. |
| Joints | **The preset decides.** A preset that offers a joint choice exposes it as its own parameter (*Walls*, *Corners*). The design-wide *Joints* section is hidden while a preset is active. Quick build already hides it. |
| Settings card | **Groups: Size, Shape, Openings, Advanced.** *Advanced* is closed by default and holds fit values (clearance, inner/outer, flap sizes). Each field has a help line. A field whose limit depends on other values shows the live limit and why. Each changed value has a reset dot. One edit is one undo step (as today). |
| Typed values | **No silent correction** (from Foldform). An out-of-range typed value is refused with the range. A value that becomes impossible because another changed is kept, and a diagnostic with a fix button appears until the student fixes it or accepts it. |
| Size chips | **Named sizes per preset** (OpenSCAD's saved parameter sets, simplified): *A4*, *Pencils*, *Phone*. Chips sit above the Size group. Saving your own is not in this phase. |
| Welcome screen | Step 2 becomes **Start from**. *Blank* comes first, then **Available now** (stable and beta presets). It's grouped by category (*Boxes*, *Organise*, *Stands*) once there are more than six cards. The tour card is unchanged. No *Coming soon* row. |
| Quick build | Presets show in both modes. In Quick build the *Advanced* group is hidden and its values use the defaults. Missions can start from any preset (`Mission.template` already allows it). |
| Teacher | **Optional, owner to confirm:** a class can choose which presets are offered (`viewPrefs.presets`, like `viewPrefs.missions`), plus a switch that hides *Make it a free design*. |
| Versioning | A preset's `version` goes up when its geometry changes. Opening a design from an older version keeps the old params and regenerates with the new script. The settings card says *"Updated preset: check your sizes"* once. Golden files pin each version. |

**My calls (say if you want them different):**

- ***Make it a free design* keeps the boards and drops `Design.template`.** It doesn't keep a "detached" flag. One undo step brings the preset back. Workshop only; Quick build shows *Open in Workshop* instead.
- **The student may *Add material* only on boards they made.** On preset boards it's *Cut out*, *Engrave* and *Score*. An *Add* on a preset board changes its outline, and the joints and flat-net math would no longer match the preset.
- **Cut-outs that the preset makes** (a finger hole, a cable notch) are preset shapes: generated, with stable ids (`t:<role>:<name>`), changed only from the card. The student's own holes sit next to them and stay through every regeneration (§6).

## 5. The settings card, field by field

Sources this borrows from, and what each adds:
- **Foldform** (`roeeco/foldform`, `app/Editor.tsx`, `docs/template-engine.md`):
  - primary sizes separate from construction values (`role`, `simpleMode`)
  - mm field with ±1 mm buttons (0.1 for small values) and a slider popover on focus showing min–max
  - focusing a field makes the geometry it drives glow
  - named diagnostics with no silent correction
  - one undo step per edit
- **boxes.py** (Florian Festi): parameters grouped per generator, a help line on each, an explicit *outside* (inner/outer) switch, and compartments as a list of widths (`50:30:30`). The list is in milestone 55 as an optional *Compartments: equal / custom* field.
- **Cuttle** templates: a reset icon on each changed parameter, and *Edit in Cuttle* to leave the packaged view. That's our *Make it a free design*.
- **OpenSCAD Customizer**:
  - groups as tabs
  - ranges shown as sliders, choices as dropdowns
  - named parameter sets, which become our size chips
  - Lesson from its limits: it can't show a field conditionally, so we add `when`.
- **Pacdora, TemplateMaker**: say plainly whether a size is inside or outside, and show the folded result live. We have the fold slider. It starts at *folded* and is shown for every card/corrugated preset.

Where CutForge can do better than all of them: the limits come from the real engine and the chosen sheet, not a fixed range (§3.2). The card shows that number next to the field, and the slider's range ends there.

**Parameter definition** (extends `ParamDef`):

| Field | Meaning |
| --- | --- |
| `group` | `'size' \| 'shape' \| 'openings' \| 'advanced'` |
| `help` | one-line help text key (en + he), shown under the field when focused |
| `step` | ± step; default 1 mm, or 0.1 mm under 5 mm |
| `when(p, m)` | shown only when true (e.g. *Low side* only for a slanted top) |
| `affects` | role names (with `*`) of the boards to highlight, and the handles that drive it |
| `only` | material kinds (already exists) |

Live limits aren't per field; they come from the preset's one `limits` function (§3.2).

**Readouts** (preset-defined, at the bottom of the card): inside size, outside size, sheets used (`easy/sheet.ts` already computes *1 sheet · 63%*). Some presets add one of their own (the organiser: *Compartments: 3 × 2, each 48 × 52 mm*).

**Highlight:** a focused field puts the existing selection glow on its `affects` boards in 3D and in the cut plan, without selecting them, plus a dimension line for size fields (`views/widgets.tsx` already draws dimension labels).

## 6. The form lock

| On a preset board (`t:` id) | Allowed? | Instead |
| --- | --- | --- |
| Shapes: Cut out, Engrave, Score, text, stickers, imported SVG | ✅ (outside keep-out zones) | — |
| Shapes: Add material | ❌ | allowed on the student's own boards |
| Cut through the whole design | ✅ | — |
| Place a board on its face, a standing board, a divider between its walls | ✅ | — |
| Copies to cut, hand placement on the cut plan, *Repack* | ✅ | — |
| Move / turn the whole design (root panels) | ✅ | (already kept by `regenerate`) |
| Board name | ✅ | (already kept) |
| Delete it | ❌ | toast: *"Part of the Pen cup: change it in the settings card"* |
| W/H fields, size arrows, push-pull | ❌ | redirected to the parameter in `affects`; none → read-only |
| Edit outline (corners, points, curves), *Wall it*, open a side, own height | ❌ | preset parameters, where the preset offers them |
| Grow from its edge | ✅ for edges the preset marks `growable` (e.g. a tray's top edges, for a student's lid); otherwise ❌ | — |
| Angle, flip side, fold-over, joint kind | ❌ | preset parameters (*Walls* covers fold-over) |
| Its own material | ❌ | design material in the drawer (regenerates) |

**Enforcement:** `presetForm(d)` is the contract check of §3.1. It covers:
- the set of `t:` roles
- for each role: its outline and size, its frame relative to its root, and its fold-overs
- its connections (kind class, edges, angle)

`guarded(d, before)` in `store.ts` already runs on every `apply` and `preview`. When `d.template` is set and the edit wasn't a regeneration, the guard compares `presetForm` before and after. If it changed, the edit is undone and the store sets `lockNote` for the toast. Regeneration goes through a store action that marks itself, so the guard lets it through. This is the safety net. The UI hides the controls, so students should never see the toast in normal use; it fires on keyboard shortcuts and paths we missed. The feature table in `easy/features.ts` gets a second axis for this (`lockState(feature, d, panelId)`) so components keep asking one function.

**Regeneration that follows the student's work.** Today `regenerate()` keeps details by panel id, user panels and their connections, names, quantities and placements. It doesn't move anything when a size changes, so a hole can end up off a shrunk wall. Added in milestone 52:
- **Student shapes on a preset board keep their place relative to the board.** Each shape is stored against the nearest of the board's centre, edges and corners. A shape near the top edge stays that far below it when the height changes. This is the approach Polyhedz and diecutstudio use for artwork and windows: placed in face coordinates, so it survives any resize.
  - Afterwards the shape is pulled inside with the Quick build guard (`easy/guard.ts`: inset by `minWeb`, away from joints and other cut-outs).
  - A shape that can't fit is listed with the existing *lost* message (shapes it had to move are listed too).
- **Student boards placed on a preset face** keep their place the same way, and are clamped to the face.
- **Student dividers in a preset box** keep their drawn line (milestone 44's `Panel.divider`). Its point `at` is scaled with the base, so it stays at the same fraction of the inside, and its direction is kept. `reconcileDividers` then finds the new ends against the regenerated walls, as it does after any edit.
- **Keep-out zones**, where the student's cuts aren't allowed, are worked out from the material, not written per preset. They are a band along every score line, around every joint slot and tab, and a reserve at each corner (CardBoxGen's formulas: the larger of `t`, `minWeb` and twice the kerf). A preset can add its own on top. The guard treats them like joint holes. Double walls add the rim's two scores and the lock-tab slots in the base.

## 7. Double walls (Foldform's fold-over options) and the engine work

**Yes, double walls can be a preset feature.** cutForge already has both of Foldform's constructions as the wall fold-over (`src/model/foldover.ts`, milestone 13):
- **Glued:** Foldform's *fold-over glue*.
- **Locked with tabs through slots in the base:** Foldform's *fold-over lock*.

Both use the same `2t + fold allowance` rim, and both choose two lock tabs where they fit and one where they don't. So no new construction is needed. The kit offers one shared parameter, so every preset has the same three choices:

```ts
kit.wallsParam() // 'single' | 'double-glued' | 'double-locked', only: ['card', 'corrugated'], group: 'shape'
```

`k.tray(…, { walls })` adds a fold-over to each wall's top edge (`addFoldOver`, then `lock: 'glue' | 'tabs'`). *Advanced* adds *Liner: to the base / partial hem* and *Lock tabs: auto / 1 / 2*.

**Probe (2026-11-11).** I ran the existing ops on main: regular 3- to 8-sided trays and a rectangular tray with a divider, with a fold-over on every wall, on card 0.5, corrugated 1.6 and corrugated 4. The existing export check reported four things the preset needs handled before it offers the choice:

| Finding | Where | What the preset does |
| --- | --- | --- |
| **Liners collide in acute corners.** `val.linerCollide` on every triangle (3 sides), on every material, glued and locked. Four sides or more are clear. `linerEnds` trims each liner end by a fixed `t` (or `2t`), which is right at 90° but not at 60°. | `foldover.ts: linerEnds` | **Engine fix:** trim by `t / tan(α/2)` for the corner angle α. Until then, `limits` raises *Sides* to at least 4 when walls are double. |
| **Double walls nearly double each wall's flat length.** A 6-sided cup (60 mm radius) fits card's 500 × 300 sheet in one piece at 50 and 80 mm tall with single walls, but not with double walls. Corrugated 1.6 fits at 50 but not at 80. | sheet fit | `oneNetHeight` counts the rim and liner, so the slider stops at the real limit and the card says *"Double walls: tallest in one piece 64 mm"*. |
| **Locked double walls always warn about clearance** with the built-in materials. `val.foldClearance` asks for ≥ 0.75 t, but card has 0.1, corrugated 1.6 has 0.2 and corrugated 4 has 0.3. | lock slots vs material clearance | **Engine fix:** the lock slot uses its own clearance, the larger of the material's and 0.75 t (Foldform sizes the slot as `t + clearance` the same way). The check then tests that, rather than the material's fit value. |
| **4 mm corrugated warns on every rectangle** (`val.flute`): two of a box's walls always run across the flutes, and a fold-over scored across them cracks. | grain | **Not offered on 4 mm** (*"4 mm board cracks when folded over across its flutes"*). Card and corrugated 1.6 only. |

Two more things I couldn't settle from the check, which milestone 53 must test:
- **Sloped tops.** The liner's length is worked out from the wall's height (`h − t`) along a straight top. On a slanted top it would likely run past the base at the low end. So *Walls: double* is offered only with a flat top (pen cup), and only on the straight-topped walls (magazine file: back and front; the sloped sides stay single and the card says so).
- **Dividers in a double-walled box.** The divider came out the same size with and without liners (100 mm across a 100 mm base, corrugated 1.6). Either its tabs pass both layers through the liner's matching holes ("holes in the wall continue through the liner"), or it runs into the liner. Check this against milestone 44's divider model. The fix, if needed, is in `reconcileDividers`: a wall with a fold-over is `2t` thick over the liner's span. Also check that divider slots and lock-tab slots in the base keep `minWeb` between them.

**Which presets offer it:**

| Preset | Double walls | Why |
| --- | --- | --- |
| Pen cup | ✅ flat top, 4+ sides, card / corr 1.6 | stiff rim, the classic use |
| Magazine file | ✅ back and front walls, corr 1.6 | tall walls flop without it; on 4 mm the board is stiff enough single |
| Organiser | ✅ card / corr 1.6, after the divider check | stronger box, clean rim |
| Phone stand, card stand | — | short walls, nothing to stiffen |
| Plywood (any) | — | `canFoldOver` already refuses plywood |

**Other engine work** (each in `ops`, with unit tests, usable from Workshop):
1. **`regenerate` follows** (§6): anchored shapes, placed boards, scaled divider lines, keep-out zones.
2. **Angle-aware liner ends**, **lock-slot clearance**, and, if needed, **dividers stop at liners**: the findings above.
3. **`oneNetHeight`:** the tallest wall whose net still lies flat in one piece on the material's sheet, counting fold-overs. It extends `trayFlatInfo`.

## 8. The presets

Default material in brackets. ✅ supported · — not offered.

| Preset | Card | Corr. 1.6 | Corr. 4 | Ply 3 | Engine pieces | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Organiser with dividers** (exists) | ✅ | ✅ | ✅ | ✅ | tray, dividers, lift-off lid; adds **hinged lid** and **walls** | stable |
| **Card / tile stand** (exists) | ✅ | ✅ | ✅ | ✅ | leaning supports | stable |
| **Pen cup** [corr 1.6] | ✅ | ✅ | ✅ | ✅ (sided only; round needs a living hinge) | polygon tray, slanted top, walls; round/oval from milestones 45–48 | stable (sided), beta (round) |
| **Magazine file** [corr 1.6] | — (too floppy at that height) | ✅ | ✅ | ✅ | tray, own heights, sloped side corners, finger hole, walls | stable |
| **Phone stand** [corr 4] | ✅ | ✅ | ✅ | ✅ | the stand's lean builder with one support, cable notch | stable |

**Parameters** (Size · Shape · Openings · *Advanced*):

- **Pen cup:**
  - Size: across flats, height
  - Shape:
    - outline *sided* (3–12 sides) / *round* / *oval*. Round and oval use milestone 45's `RoundShape` and milestones 46–48's bent walls. They're offered only where the material's bend limit allows the radius, with the reason otherwise.
    - top flat/slanted, low side
    - walls (flat top, 4+ sides)
  - Openings: none
  - *Advanced:* corners (material default), inside/outside, liner, lock tabs
  - Chips: *Pencils*, *Brushes (tall)*
- **Magazine file:**
  - Size: width, depth, back height
  - Shape: front height, slope starts at, walls (back and front)
  - Openings: finger hole on the back (none/round/slot) and its size, label area (engrave frame)
  - *Advanced:* inside/outside, liner, lock tabs
  - Chips: *A4*, *A5*
  - Readout: sheets, since at A4 size corrugated walls are cut as their own pieces; the card says so.
- **Phone stand:**
  - Size: device width, device thickness
  - Shape: lean 60°/45°, lip height
  - Openings: cable notch (on/off, width)
  - Chips: *Phone*, *Tablet*
- **Organiser:**
  - Adds the lid choice *hinged* (grown from the back wall's top edge, joined as a fold on card/corrugated and as a slot hinge on plywood)
  - Adds walls (card / corrugated 1.6)
  - The lift-off lid is sized from the box's measured outside (§3.5)
  - The existing params move into the groups

## 9. Milestones

| # | Milestone | Done when |
| --- | --- | --- |
| **49** | **The preset contract, the kit, the settings card.** `PresetDef` (alias `TemplateDef`) with `roles`, `limits`, `status`; `kit.ts`; the `presets/` folder. `organiser` and `stand` moved onto the kit, golden exports byte-identical. The card gets groups, *Advanced*, help lines, ± and the slider popover (extend `NumField`), `when`, live limits from `limits`, diagnostics with fix buttons, reset dots, size chips, readouts, field-focus highlight. | Golden files unchanged; contract tests (§10) pass for organiser and stand; e2e: focus a field → its boards glow; out-of-range typed value refused with the range; a fix button sets the value. |
| **50** | **Welcome screen and material filter.** *Start from* with *Available now* (stable + beta), grouped once there are more than six; hidden-by-material with the *"N more with …"* line that switches material; `supports(m)` with thickness; the drawer greys unsupported materials with the reason. `viewPrefs.presets` for the class if the owner wants it now. | e2e: card hides the magazine file and says why; switching material from the line selects it; a `planned` preset never shows. |
| **51** | **The form lock.** `presetForm` from the contract, the store guard, the lock axis on the feature table, handles → parameters, *Add* limited to student boards, *Make it a free design* (Workshop, confirm, one undo). | Unit: every structural op on a `t:` panel is rejected by the guard; e2e: dragging a preset wall's arrow changes the parameter; delete shows the toast. |
| **52** | **Regeneration that follows.** Anchored shapes, placed boards, scaled student dividers, material-derived keep-out zones, extended *lost* message. | Unit: a hole 10 mm under the top edge stays 10 mm under it at every height; a student divider stays at the same fraction and still meets both walls; regenerate twice = once (as B24). |
| **53** | **Double walls.** `wallsParam`, `tray(…, { walls })`, angle-aware liner ends, lock-slot clearance, `oneNetHeight` with fold-overs, the divider/liner check (and fix), sloped-top behaviour confirmed. | The probe in §7 rerun as a test: no `linerCollide` for 3–12 sides, no `foldClearance` with built-in materials, dividers clear of liners, one-piece limits match the sheet. |
| **54** | **The presets:** pen cup, magazine file, phone stand, organiser's hinged lid and walls. | The contract tests (§10) for each preset × supported material; goldens for defaults; e2e per preset: start → change two sizes → choose double walls → cut a hole → export. |
| **55** | **Polish:** *Compartments: equal / custom widths* for the organiser (boxes.py-style list), Quick build pass (Advanced hidden, a mission from a preset: *Pen cup with your name*), Hebrew strings, thumbnails for every preset × material, screenshots into `docs/preset-shots/`. | i18n coverage test; screenshots reviewed in en and he. |
| **56** | **Final verification** in the usual form: everything above re-run, `PROGRESS.md` updated, remaining limitations listed. | — |

## 10. Tests to add

**The contract tests**, `tests/presets.test.ts`, run for every registered preset × every material it supports:
- **Builds clean:** at defaults, at each size chip, at the limits, and at 0.5× and 2× the default sizes where the limits allow (`dielinegenerator` runs every generator at three scales). Validate has no blocking issues, nets are flat or a named diagnostic says why, and the design fits the sheet at defaults.
- **Same parts everywhere:** across a parameter sweep, the role set is exactly the declared one for those choices, and the joints (kind class, edges) are the same. This is the form lock's definition, tested.
- **Every parameter matters:** bumping any parameter by one step (inside its limits) changes the design. This catches dead settings (`dielinegenerator`'s `expanded.test.ts`).
- **Limits agree:** a value at a limit builds clean, and a value one step past it produces the diagnostic named in `limits`, with a fix that builds clean.
- **Regenerate is stable:** `regenerate(d, d.template.params)` returns an identical design.
- **Folds the right way:** every wall's outside face points away from the base's centre and every flap ends up inside (PackBox's `verify-fold.ts`).
- **Thick board too:** each preset that supports corrugated also runs on corrugated 4 (OpenBox3D's thick-board case).

**Other tests:**
- `tests/fuzz/presets.test.ts`: seeded random params inside `limits`, small default count (like the other fuzzers), with a larger count under an env var.
- `tests/presetlock.test.ts`: for each structural op in `ops.ts`, applied through the store to a `t:` panel, the design is unchanged and `lockNote` is set. Shapes, placed boards and dividers go through.
- `tests/presetfollow.test.ts`: anchored shapes, placed boards and dividers across size changes.
- `tests/doublewalls.test.ts`: §7's probe, as assertions.
- **Goldens:** `preset-<id>-<material>.svg/.dxf` at defaults; organiser and stand files unchanged.
- **e2e** `presets.spec.ts`: filter, chips, highlight, handle → parameter, fix button, lock toast, free design, export.

## 11. Hebrew names (direct translations)

| English | Hebrew |
| --- | --- |
| Preset | תבנית מוכנה |
| Available now | זמין עכשיו |
| Start from | להתחיל מ־ |
| Pen cup | כוס עטים |
| Magazine file | תיקיית מגזינים |
| Phone stand | מעמד לטלפון |
| Organiser with dividers | מארגן עם מחיצות (as today) |
| Card / tile stand | מעמד לקלפים / אריחים (as today) |
| Hinged lid | מכסה על ציר |
| Walls: single / double, glued / double, locked | קירות: יחיד / כפול, מודבק / כפול, נעול |
| Make it a free design | להפוך לעיצוב חופשי |

**Still open:** the teacher's per-class choice of presets. Now (milestone 50) or later?

## 12. Later: the riskier presets (`status: 'planned'`, not shown)

Registered so the catalogue knows them; each needs engine work first, done as a spike with a fallback.

| Preset | Needs | Fallback if the spike fails |
| --- | --- | --- |
| **Drawer: tray and sleeve** | a sleeve band closed by one glue flap onto its own first panel; the sleeve sized from the tray's measured outside (§3.5) | — |
| **Little house / gable box** | gables via wall inserts, roofs grown from sloped edges with adapt, door and window cut-outs; card and corrugated only (plywood roofs would need angled joints the laser can't cut square) | flat-roof "shed" |
| **Slotted grid insert** | crossing standing boards with half-laps and no box: a construction frame (never cut), or `addGrid`; sized from a box's measured inside; corrugated 1.6+ and plywood | — |
| **Mailer box** (FEFCO 0427 style) | fold-over walls, hinged lid, a three-deep flap chain (tuck with `t + clearance` per fold), dust ears; the card deck box variant is dropped | hinged lid with a front lip, no tuck |

**Also later:** a **fit-test preset** whose best strip is saved into the material profile. CardBoxGen makes the strips but has the student retype the result; storing it closes that gap and matches cutForge's "calibrate on scrap" advice.

## References

- Foldform:
  - `app/lib/template-kernel.ts`: manifests, parameter roles, `simpleMode`, and `buildConvexProfileTray` with its fold-over glue and fold-over lock walls
  - `docs/template-engine.md`: the four layers (form, net topology, edge treatments, manufacturing policy)
  - `app/Editor.tsx`: fields, slider popover, glow
- `roeeco/dielinegenerator`:
  - `src/families/*`: family functions with variant rows
  - `tests/geometry.test.ts`, `tests/expanded.test.ts`: three scales, same topology, every parameter matters
  - `docs/implementation-backlog.json`: status per style
  - Its FEFCO pictures are © FEFCO and stay out of cutForge.
- PackBox (https://github.com/sbarrak/packbox): `src/geometry/boxBuilders.ts` (builders and registry rows), `scripts/smoke-test.ts` (edge accounting), `scripts/verify-fold.ts`.
- OpenBox3D (https://github.com/yuyou-dev/OpenBox3D): `src/dieline/templates.js` (thickness per fold), `scripts/check-template-sync.mjs` (per-template contract).
- diecutstudio (https://github.com/pradeepsiddappa/diecutstudio): `src/core/fold/solve.ts` (refuses an unspecified crease), `features.ts` (features placed per panel with a minimum web).
- CardBoxGen (https://github.com/sunnydesigntech/CardBoxGen): `cardboxgen/validation.py` (limits from material, messages with fixes), `presets/calibration.py` (fit-test strips).
- Polyhedz (https://github.com/justin-hackin/svg-widgets-monorepo): artwork in face coordinates, inset from tabs.
- FoldForge (https://github.com/BhavyaAk25/FoldForge): staged checks; failures that point at the parameter to change.
- boxes.py user manual: https://florianfesti.github.io/boxes/html/usermanual.html
- Cuttle templates and box generators: https://cuttle.xyz/blog/cuttle-templates-box-generators
- OpenSCAD Customizer: https://files.openscad.org/documentation/manual/Customizer.html
- Pacdora dieline generator: https://pacdora.com/tools/dieline-generator
