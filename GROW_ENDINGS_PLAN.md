# CutForge: ends of a grown board (flaps, lips and other endings): plan (milestones 161–164)

Owner's request (21 November): *"An addition to grow: flaps, lips and other special endings. After Grow is
clicked each of these can be set, first at a default automatic length, and changed the same way any grown fold
is."* And: *"A lip will also be offered automatically when two edges meet."*

## 0. The concept, made rigid

The owner asked for this to be taken as a change of concept, not a shortcut on the grow card. The concept:
**every edge of a grown board ends in something, and every ending is one kind of thing.** It has

- **a kind**, from one list per kind of edge: a *free* edge ends in nothing, a flap (plain, tuck, dust, glue,
  hang) or a fold-over; an edge that *meets* another board ends in a lip (the seam's glue flap) or in one of the
  seam's other joints;
- **a length** (a flap's reach, a fold-over's liner, a lip's width), **automatic until it is set**: it follows the
  board while automatic, a set length is kept, and *Automatic* gives it back;
- **a fold** for the parts that fold about a crease of their own (flaps), on the **grown fold's numbers** (180°
  flat, 90° square towards the board's material side, past 180° the other way);
- **the same controls everywhere**: a row on the board's card (pictures, length, dial) and, on the stage, the
  grown fold's handles (a push-pull arrow on its far edge, a hinge ring at its crease).

One module states these rules (`src/model/endings.ts`, its header) and one set of edits enforces them
(`setEnding`, `setEndingLength`, `setEndingHinge`, `setEndingJoint` in `src/model/ops.ts`). The card and the stage
only read `boardEndings` and call those edits, so a new kind of ending is one entry in `ENDINGS` (and its
geometry in the edge-feature registry), and every control follows. The name is **edge endings**, to keep it apart
from a carton's *ends* (the top and bottom of a tube, `setEndFlap`, milestone 149).

Edges that are **not** endings, and why: the edge a board hinges on and an edge a child board grows from (they are
grown folds, set on the child's card); an edge a lid's closure or a band's wing owns (set on the lid's card and the
band); a curved edge; an edge under 10 mm.

## 1. What is there today (so it is not rebuilt)

| Piece | Where | State |
| --- | --- | --- |
| Flaps on a free edge: plain (67), tuck, dust, glue, hang (112): length, slopes, radius, fold angle, in/out, hole | `src/model/edgeFeatures.ts` (`flapSpec`, `flapOutline`, `flapDefaultLen`), `addEdgeFlap` / `setEdgeFlap` in `src/model/ops.ts` | Built, but you reach it only from the **grow card** of an edge, before growing, under *More…*. Its length is fixed when it is added, and it is changed by typing numbers only. |
| Fold-over (double wall, 61): a liner turned in over a wall's top | `src/model/foldover.ts`, `FoldOverSection` in `src/ui/TrayUI.tsx` | Built, at the bottom of a wall's card, behind *More*; the top edge only. |
| A glue lip where two edges meet (a corner seam of kind `glue`) | `src/model/seams.ts` (`c.kind === 'glue'`), width `c.flap` (null = automatic, `flapWidth`) | Made automatically on card (`seamKinds`: glue first); its width is in *Joints (advanced)* only. |
| A grown fold redefined: the hinge ring and height arrow on the stage, the 360° dial and the height field on the card | `HingeWidget`, `PushPull`, `AngleArc`, `DimLabel` (`src/views/View3D.tsx`, `src/views/widgets.tsx`), `PanelHinge` (`src/ui/Connections.tsx`) | Built. These are the controls this plan reuses. |

So the work is putting these together where the student is looking after ✓, giving each ending an
automatic length that follows its board, and giving them the grown fold's controls.

## 2. Decisions (defaults; change them here before work starts)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Where the endings are set | On the grown board's card, in a new **Edge endings** section, open as soon as ✓ selects the new board (`doGrow` already selects it). One row per edge of the board except the edge it was grown from. |
| 2 | What a free edge can end in | **None · Flap · Tuck · Dust flap · Glue flap · Hang tab · Fold-over**: the five flap shapes of 112 and the fold-over of 61, as one picture choice. A choice that can't be made is shown greyed out, with the reason (`blocked`, `canFoldOver`). One ending per edge, as now. |
| 3 | What an edge that meets another board ends in | A **Lip** (the corner's glue flap), **offered automatically**: on card it is already the default joint at a corner, and the row shows it chosen at its automatic width. The other choices are the corner's other joints (`pairKinds`: slit lock, gusset, tabs, slide, butt), as in *Joints (advanced)*. The lip is on the board that carries it; the other board's row says *Lip on the {board}*. |
| 4 | The automatic length | A new ending starts at its shape's starting length (`flapDefaultLen`: tuck 30 % of the board's depth, 12–22 mm; dust 45 % of the edge, 12–40 mm; glue and plain the material's flap; hang 25 mm) and **follows its board** while it stays automatic (`EdgeFlap.auto`, re-worked out on every `solve`), the way a glue lip's `flap: null` follows the material. Typing or dragging a length makes it the student's; **Automatic** puts it back. A fold-over starts full depth (`depth: null`, already automatic). |
| 5 | "Changed the same way any grown fold is" | The same controls, on the stage and on the card: a **push-pull arrow** on the ending's far edge for its length (click it to type), a **hinge ring** at its crease for how far it folds, a **360° dial** on the card with the grown fold's numbers (180° flat, 90° square, past 180° folds the other way, i.e. *out*). A lip and a fold-over have the arrow and no ring: they fold flat against a board. |
| 6 | A plain flap's fold | A plain flap keeps lying flat (0°) unless it is turned: the dial then folds it like the other shapes. Stored plain flaps have no angle, so their output is byte-identical (goldens). |
| 7 | Levels | Workshop: shown. Quick build and Guided: hidden, as `edgeFlap` is today (`src/easy/features.ts`). A row each in the feature table. |
| 8 | Plywood | No ends section on plywood (it does not fold); a meeting edge there keeps its joint in *Joints (advanced)*. |

## 3. Milestones

### 161. Engine: the ends of a board, one edit to change one

- `src/model/endings.ts`:
  - `type Ending = 'none' | FlapShape | 'foldover'` (free edges) and `type BoardEnding = { edge, kind: 'free', ending, len, auto, hinge, why } | { edge, kind: 'meets', conn, other, owner, joint, options, width, auto }`.
  - `boardEndings(d, panelId): BoardEnding[]`: every straight edge of the board but the one it was grown from and those joined by a grown fold (a child board); `meets` where a seam joins it to another board's edge (not a face), `free` otherwise.
  - `setEnding(d, panelId, edge, ending)`: takes off what is there (a flap or a fold-over) and puts the new one on, in one edit, at its automatic length.
  - `setEndingLength(d, panelId, edge, len | null)`: a flap's length, a fold-over's depth or a lip's width; null makes it automatic again.
  - `setEndingJoint(d, panelId, edge, kind)`: a meeting edge's joint (the lip, or another the seam offers).
  - `setEndingHinge(d, panelId, edge, h)`: the grown fold's 360° number to a flap's `angle` and `dir` (`h ≤ 180`: in, angle `180 − h`; past 180: out, angle `h − 180`), and back (`endHinge`).
- `EdgeFlap.auto?: true`: `solve` re-works out an automatic flap's length from `flapDefaultLen`; `check.ts` accepts the field.
- `flapSpec`: a plain flap takes a stored angle (absent: 0, as before).
- Tests `tests/edgeEndings.test.ts`: rows of a grown card wall (free top and sides; meeting edges once a neighbour is grown), each ending added at its automatic length and swapped in one edit; a fold-over and a flap never on one edge; the automatic length follows the wall's height; a typed length stays; hinge numbers both ways; a lip's width automatic and typed; goldens byte-identical.

### 162. The card: an Ends section after ✓

- `EndingsSection` (`src/ui/EndingsUI.tsx`) on a grown board's card, under its *Angle*: one row per edge (its name: *Top*, *Left side*…), a picture choice (`PictureChoice`, new pictures `foldOver` and `lip`), the length (`NumField`) with **Automatic**, and the dial (`AngleDial`) for a flap that folds. A meeting edge shows the lip and its width, or its joint.
- Open right after ✓ (`viewPrefs.endingsShut` remembered per browser, open unless closed).
- Feature `endings` (Workshop show; Quick build and Guided hide), its section id `endings-section` in `SECTIONS`; words in `en.ts` and `he.ts` (`endings.*`).
- Test `tests/e2e/endings.spec.ts`: grow a wall on a card base, ✓, pick a tuck for its top: the card shows its automatic length; type a length; Automatic; turn the dial; grow the next wall: the lip shows on the edge where they meet.

### 163. The stage: the grown fold's handles on each ending

- `EndHandles` in `View3D.tsx`, shown with the selected board's other widgets: for each ending a `PushPull` on its far edge (along the flap as it is folded) and a `DimLabel`; for a flap that folds, an `AngleArc` about its crease with the grown fold's numbers. Drags preview (`store.preview`) and are one undo step on release (`commit`), as `HingeWidget` is.
- Handle positions from one model helper `endHandles(d, panelId)` (crease, far edge, the board whose display transform moves it), unit-tested.
- Test ids `end-len-<edge>`, `end-hinge-<edge>`; the browser spec types and drags a length on the stage.

### 164. Verification

`npm test`, `npm run typecheck`, the goldens byte-identical, the specs touched, `PROGRESS.md` entries, the status line in `ROADMAP.md` §5.6.

## 3b. As built (21 November)

| # | Status | Notes |
| --- | --- | --- |
| 161 | ✅ | `src/model/endings.ts`, the four edits in `ops.ts`, `EdgeFlap.auto` (re-worked out in `solve`), a plain flap may be turned. Names: *edge endings* (`boardEndings`, `setEnding…`, words `endings.*`). |
| 162 | ✅ | `src/ui/EndingsUI.tsx`, under the board's *Angle* (above *Bend*) so it is in view after ✓; seven pictures in two rows (new `endNone`, `flapTuck`, `foldOver`, `lip`); `viewPrefs.endingsShut`. A meeting edge's joint is a list (*Lip* first where the seam offers it). |
| 163 | ✅ | `src/model/endingHandles.ts` (pure, tested) and `EndingHandles` / `EndingHinge` in `View3D.tsx`; the ring's knob a fifth of the way along the crease (as a grown fold's), so it is clear of the arrow; each ring labelled with its ending (*Tuck 90°*). |
| 164 | ✅ | See `PROGRESS.md`. |


## 4. Left for later

- Setting an ending on the ghost before ✓ (the grow card): the owner asked for after.
- Ends on boards that were not grown (a root board, a placed board): the engine allows it, the card shows the section on grown boards only.
- A fold-over's own hinge ring (it is always turned in flat) and a lip moved to the other board (the joint's owner is the earlier board).
