# What `roeeco/dielinegenerator` teaches a preset engine

Written 2026-11-21, before milestones 147–155 of `PRESETS_OVERHAUL.md`, from `roeeco/dielinegenerator` at its default branch (shallow clone).

**Method.** The generator code was bundled and all 229 generators were run at their default sizes, none failing. Each run recorded:
- the chain of construction functions that built its parts (from the call stack when a part is made);
- its part count;
- its creases, how many of them are diagonal;
- its holes, open cuts and partial cuts.

Each code was then placed in a family by that chain and its FEFCO category. The 98 reference-only FEFCO entries were not looked at (they have no geometry), nor the drawings (© FEFCO). The book backlog (*Structural Package Designs*, 27 planned families) was read from `docs/implementation-backlog.md`.

## 1. What the repository is

- **A 2D dieline generator for corrugated board.** It covers the FEFCO code (12th edition): 227 codes plus two book designs (pillow pack, hexagonal ring box).
- **Each generator is a TypeScript function** from numbers (`L, W, H, t, clearance, glue`, and its own extras) to cut, crease, partial-cut, perforation and tear paths, laid out as one or more parts.
- **There is no 3D model, no fold simulation and no assembly check.** Everything is beta: "automated geometry checks are not a physical assembly test".

It complements cutForge rather than overlapping it. It knows *which* constructions exist and how the trade draws them; cutForge knows how a construction folds, fits, joins and is checked in 3D.

## 2. The finding: 229 generators, seven bodies

About 30 construction functions build all 229 generators. Grouped by what the blank *is*, they fall into seven bodies:

| Body | What it is | Codes | Families inside (codes) |
| --- | --- | --- | --- |
| **Tube** | A chain of wall panels closed by a glue joint; each end closed by flaps on the walls' end edges | **83** | slotted, flaps by a depth rule (15) · profiled ends: tuck, tongue, slit lock, handle, hanger (18) · automatic bottom × top style (16) · display and shipping shells (18) · slide box: sleeve + tray (7) · telescope with a tube body (5) · sleeve (3) · nested automatic (1) |
| **Strip** | A chain of panels left open: parallel creases, no closure | **50** | open profiles: U, C, Z, L, angle and tube liners, folded pads (41) · folded sheets and accordion (9) |
| **Cross** | A base with walls hinged on its edges; what differs is how two walls meet at a corner | **30** | trays with corner ears, rolled returns, gussets, open corners, double walls (14) · display trays locked by tabs (8) · telescope body + lid (8) |
| **Wrap** | One strip of base, walls and lid; each panel's ends carry their own flanges | **27** | wrappers (15) · rigid: wrap + two separate end panels (10) · two crossing strips (2) |
| **Slot** | Flat pieces held by half-slots or tabs in slots, no folds needed | **24** | shelf stands, towers, product grids, stairs (16) · partition grids (8) |
| **Flat** | One sheet, pad or card | **9** | — |
| **Polygon / curve** | A tube or tray on an n-gon, or with curved creases | **6** | polygon and triangle tubes with a separate base (5) · pillow (1) |

**Most codes are settings of a construction, not constructions of their own:**
- **Automatic bottoms.** FEFCO 0700–0713 are exactly **3 bottom families × 5 top styles** (`next.ts`: `['0701', 'B', 'half']`, …), 14 of the 15 combinations, each published as its own code.
- **Slotted boxes.** 0200–0209 and 0214 are one function, `slotted(p, variant)`. The variant only picks a flap-depth rule per panel: W/2, overlap, full, L/2, alternate, extended, or none on one end.
- **Handled and locking cartons.** 0207, 0217–0242 and the handled display shells are one function, `profiledShell(p, top[], bottom[])`. It takes a **list of four flap profiles per end**, one per wall, drawn from 11 kinds: `plain, tuck, notch, snap-left, snap-right, snap-tongue, gable, handle, wing, header, label`. On top of those come options for a Euro slot, a centre slot and diagonal slots.
- **Telescopes.** 0300–0309 are a body tray and a lid tray built by one function, `corner(l, w, h, kind)`. The lid's inside is sized from the body's outside plus `fit`. They differ only in the corner kind: `cross` (open), `gusset`, vertical or horizontal slits, diagonal or inward ears.
- **Profiles and pads.** 41 of the 50 strips are one function, `strip(sections[], length)`: a list of crease pitches. The U liner, Z profile, angle guard and accordion pad differ only in that list and in which way each crease folds.

**So the 227 FEFCO codes are spanned by about 7 bodies, 25 end-flap profiles, 6 corner rules, 6 ways parts relate, and a dozen panel features** (hand holes, Euro slots, windows, tear strips, partial-cut hinges, lips, header cards). Only the pillow pack needs something outside that list: curved creases.

## 3. The grammar

A preset is a choice in each of these slots, plus sizes:

```
preset = body × end profiles (per wall, per end) × corner rule × joint × part relations × panel features
```

### 3.1 Bodies

| Body | Parameters | In cutForge today |
| --- | --- | --- |
| Tube | wall count and widths (4, or n for a polygon), height, which wall carries the joint | ✅ `Tray.base: 'open'` (milestone 68): the carton's walls in one strip, glued at the back left; n-sided from C4 |
| Cross | base outline (rectangle, n-gon, rounded, round), wall heights | ✅ `addTray`, every base shape |
| Strip | list of panel widths and each crease's fold direction (and angle); open or glued shut | ◐ Boards grown off each other at any angle make the same thing, but nothing generates a strip from a list. |
| Wrap | panel sequence base–wall–lid–wall–flap, with end flanges per panel | ◐ The hinged lid (a board grown off the back wall) and edge flaps; no single wrap builder |
| Slot | pieces, the slot positions they share, half-slots or tabs | ✅ dividers' half-laps (milestone 70), tabs and slots, slit locks; a grid with no box is planned |
| Flat | outline | ✅ any board |
| Polygon / curve | n, side, taper; curved creases | ◐ n-gon bases and n-sided tubes; ❌ curved creases (not planned: `DIELINE_DNA_PLAN.md` §9) |

### 3.2 End profiles: one per wall, per end

dielinegenerator's tube is the clearest model. **An end is a list of flaps, one on each wall's end edge, each with its own kind and depth.** cutForge's ends are whole-end styles instead (`TrayTop = 'tuck' | 'seal' | 'rsc'`, `TrayBottom = 'seal' | 'snap' | 'tuck' | 'tuckBack' | 'rsc' | 'crash'`), drawn by `cartons.endGeom`.

| Profile | Codes using it | cutForge |
| --- | --- | --- |
| plain flap at a depth rule (W/2 meeting, overlap, full, L/2, alternate, extended) | 0200–0209, 0214, 0230, 0231 | ◐ `seal` and `rsc` only: two rules, fixed |
| tuck (with lip) | 0210–0212, 0219, 0240, 0242 | ✅ `tuck`, `tuckBack` |
| tongue / lock tab | 0215, 0216, 0220, 0221 | ◐ the snap bottom's tongue only |
| slit or diagonal lock | 0218, 0232, 0233 | ◐ slit locks exist as joints, not as end flaps |
| snap-lock 1-2-3 | `snap-left`, `snap-right`, `snap-tongue` | ✅ `snap` |
| automatic bottom | 0700–0719, 0886 | ✅ `crash`, gated (`CRASH_LOCK_OFFERED = false`, the patent question) |
| gable | 0217, 0222 (handle with gable) | ✅ `gable` (C4) |
| handle / Euro slot / hanger / header / label | 0217, 0219, 0222, 0240–0242, 08xx | ◐ hang tab (milestone 112) and holes; no handle or header flap |
| diagonal continuous flaps (no slots) | 0226 | ❌ |

**The step this suggests:** an end becomes a list of edge features, one per wall, using the edge-feature registry milestones 111–112 already built (`EdgeFlap.shape`). Today's `TrayTop` and `TrayBottom` styles then become named lists in that one vocabulary. The FEFCO depth rules and the profiled shells become more lists, and a student could set one wall's flap differently. This is exactly what dielinegenerator does in 2D, but with cutForge's fold, fit and overlap checks.

### 3.3 Corner rules (how two walls of a cross meet)

| Rule | Codes | cutForge |
| --- | --- | --- |
| open / slit, taped or stitched | 0458, telescope `cross` | ✅ no corner joint |
| glued ear (on the end wall or the side wall) | 0300, 0301, 0453, 0459 (octagonal) | ✅ glue-flap corners |
| ear folded diagonally inward | 0303, 0304, 0308 | ❌ |
| **gusset** (one diagonal crease, corner uncut, so the tray holds liquid) | 0309, gusseted end panels of 0605, 0607, 0608; continuous diagonal flaps of 0226 | ❌ the one new mechanism worth adding |
| rolled return / double wall | 0454–0456, 0718 | ✅ fold-over (milestone 13) |
| tab locked into a slot | 08xx display trays | ✅ tabs and slots, slit locks |
| finger joint, living hinge, bent band | — (plywood, not in FEFCO) | ✅ cutForge only |

### 3.4 How parts relate

| Relation | Codes | cutForge |
| --- | --- | --- |
| lid sized from the body's outside (+ fit) | 0300–0320 | ✅ the cap lid (milestone 71, 79) |
| sleeve sized from the tray's outside | 0504–0512 | ✅ drawer box (C2) |
| end panels sized from the wrap's opening | 0601–0621 | ❌ |
| insert or grid sized from the box's inside | 09xx, 0930–0935 | ◐ dividers inside a box; a grid with no box is planned |
| shelves held in a back by tabs | 0830–0849 | ◐ standing boards with tabs (plywood) |
| separate base under a tube | 0851, 0858, 0859 | ◐ |

### 3.5 Panel features

These already exist in cutForge as shapes, lines and flaps:
- hand holes, Euro slots, hang holes (holes);
- windows and cell windows (cut-outs);
- tear strips and perforations (lines, milestone 83);
- partial-cut hinges (cut-crease, milestone 85);
- lips and header cards (edge flaps).

## 4. Is the ground there for a custom preset engine?

Yes. The evidence is that the trade's own catalogue is combinatorial: one function with a list of choices regenerates whole code ranges. cutForge already has five of the seven bodies, most of the end profiles, and every part relation but one. It also has what dielinegenerator lacks:
- the 3D fold and the net check;
- fits from material thickness;
- validation that refuses what won't assemble;
- regeneration that keeps the student's work.

What the engine would add:

1. **Data, not code, for a preset.** A preset becomes body + end profiles per wall + corner rule + joint + relations + features, as one record. The catalogue's cards (milestone 146) become named records, and the FEFCO and ECMA codes become recognisers over them, the way `styleOf` names a style from the sentence's words. The 0700–0713 matrix would be **one** card with two switches (*bottom: A/B/C*, *top: open/half/full/alternate/tuck*) rather than 14 cards.
2. **Custom presets.** Because every slot is a list of choices the engine checks, a student or teacher can make a combination nobody named: a gable top on a snap-lock bottom, handles on two walls only, a gusseted octagonal tray. The engine builds it, the existing checks refuse what can't fold or fit, and the recogniser names it when it matches a known style. Only the presets proven to fold go in the catalogue.
3. **Uniqueness by construction.** The look-alike tests of milestone 146 can compare records first (same body, profiles, corner and relations means the same preset), then pictures, so a new combination that duplicates a card is caught before it is drawn.

**What not to take:**
- the FEFCO drawings (© FEFCO);
- the thickness arithmetic per crease pitch (cutForge works in 3D from the material, which is better);
- 0982–0999, which name panel counts, not shapes;
- curved creases, which are out of cutForge's model.

## 5. Where it fits in `PRESETS_OVERHAUL.md`

The overhaul's milestones 147–150 are about how presets are *shown*. They stand as planned, and the engine changes what 151–153 build on. A suggested order:

| When | Engine step | Unlocks |
| --- | --- | --- |
| After 148 | **End profiles per wall**: an end is a list of edge features; today's `TrayTop` / `TrayBottom` become named lists; goldens byte-identical for every existing style | FEFCO depth rules, handles and headers on chosen walls, the 0700 matrix as switches; the tuck cartons as one card with switches (149's variant switch reads the list) |
| With 149 | **Preset records**: `catalogue.ts` variants become records (body, ends, corner, joint, relations, features) instead of structure + words; the recogniser names records by style and code | the look-alike test on records; a variant switch generated from the record's free slots |
| Before 152 | **Corner rules**: add the gusset (one diagonal crease, uncut) and the inward diagonal ear beside today's joints | leakproof card trays, gusseted telescopes and rigid end panels |
| 152–153 | **Strip and wrap builders** over the existing grow ops | inserts, angle guards, accordion pads (strip); wrappers, the mailer and book wraps (wrap); the magazine file and dice tower get simpler |
| After 153 | **Custom presets**: the record editor in Workshop (each slot a picture choice, refused choices with reasons, *Save as preset* into the library) | students' own constructions, teacher-made presets for a class |

**Count check against the overhaul's catalogue:**
- of the 21 cards in §6 of `PRESETS_OVERHAUL.md`, 18 are tube, cross or slot records with existing profiles;
- the mailer is a wrap;
- the magazine file and pen cup are a cross with a wall-height rule;
- the dice tower is slot plus angled boards.

None needs a body outside the seven.

## 6. Numbers at a glance

| | Count |
| --- | --- |
| Generators run | 229 (227 FEFCO codes, 2 book designs), 0 errors |
| Construction functions behind them | ~30 |
| Bodies | 7 (tube 83, strip 50, cross 30, wrap 27, slot 24, flat 9, polygon/curve 6) |
| End-flap profile kinds | 11 in `profiledShell`, plus ~7 depth rules in `slotted`, and 3 automatic-bottom families |
| Corner rules | 6 (open, glued ear, diagonal ear, gusset, rolled/double, tab lock) |
| Part relations | 6 |
| Codes that are one parameter of another code's construction | most: e.g. 0700–0713 (14 codes, one function with two switches), 0200–0214 (11, one function), 0300–0309 (8, one function with a corner switch) |
| New mechanisms cutForge lacks | gusset and inward-ear corners, per-wall end profiles, wrap and strip builders, separate end panels, curved creases (not planned) |
