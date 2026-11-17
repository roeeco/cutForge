# Milestone 44: dividers that find their own ends

## What's wrong today
- **One gesture, two results.** Quick build's *Divider* (and Workshop's *Standing board* on a box base, milestone 42 decision 4) makes a divider only when the line runs wall to wall. Otherwise it quietly makes a free standing board. Students ask for a divider and get a wall.
- **The rules are narrow.** A divider is a panel grown off one base edge at an offset (`planDividerBetween`):
  - it is always that edge's full length
  - it only stands square between two parallel facing walls
  - on a hexagon it needs a base edge running its way
  - it can't stop at a perpendicular divider
- **"Is this a divider?" is a guess.** It's inferred from the grow offset in at least six places, with different thresholds: `names.ts`, `jointDefaults.ts`, `ops.ts` (`isDividerOffset`, line 465), `View3D.tsx` `isDivider`, `recipes.ts`/`objects.ts`.

## The idea
**Simple instruction, smart automation.** The student draws a short line; the app decides the direction, where each end stops, and what it joins.

1. **The Divider tool always makes a divider.** Free standing boards get their own button.
2. **Direction: a regular grid by default.** The line snaps parallel or perpendicular to the box's grid. **Shift** while dragging gives 30° steps instead.
3. **Ends: each end runs to the next board beyond where the line stopped.**
   - A short line inside one compartment fills that compartment.
   - A line ending short of a perpendicular divider meets it (a T).
   - A line that **crosses** a divider passes through it (a half-lap) and runs on to the next board.
4. **Angles are fine.** Slots at an angled end, and half-laps at an angled crossing, are widened for the angle.
5. **Everything is re-derived afterwards.**
   - Move or turn a divider, or move, add or delete the boards it meets: its ends stretch to the new faces.
   - Delete the divider a T ends on: the T runs on to the next face.

## Decisions (defaults; change them here before starting if the owner disagrees)
1. **Grid axes.** A base's grid is set by its **first divider** (the earliest still on that base), whatever angle it was drawn at. Its direction and the perpendicular are the grid.
   - Before any divider exists, the grid is the box's own axes:
     - a rectangle: its edges
     - a polygon: its longest straight edge (a regular polygon: its first edge, `e0`)
     - after milestone 45, a round box: an oval's long axis, or the base's own x for a circle
   - If the first divider is deleted, the next earliest takes over. Existing dividers don't move.
2. **Shift = 30° steps, measured from the box's own axes**, not from the first divider. 0° and 90° are always reachable, and a grid set at 30° is among them.
   - Shift turns off the parallel/perpendicular default only for that drag.
   - **Alt** keeps its meaning everywhere: no snapping at all (any angle, 0.01 mm positions).
   - The following divider is back on the grid unless Shift is held again.
3. **A divider's position snaps to the grid too.** While drawing and when dragging its arrow it snaps to:
   - equal compartments in its row (as `snapDividerOffset` does today)
   - in line with dividers in neighbouring compartments
   - the middle of the compartment
4. **Free standing boards:**
   - **Quick build:** the Divider button gets a slide-out *Standing board* button, the same `.rail-tool` flyout as Workshop's Board tool (milestone 42). **D** again toggles it.
   - **Workshop:** gains the same **Divider** tool (`D`) on the rail. Its *Standing board* never turns into a divider: this **reverses milestone 42 decision 4**, so update that DECISIONS.md entry rather than adding one.
5. **A line that can't make a divider is refused, never swapped.** No board to reach on either side means a red ghost with the reason, and ✓ disabled.
   - One end that reaches nothing (an open tray side) stops at the base's edge, unjoined. That's allowed.
6. **Shallow angles: 30° is the floor.**
   - **Ends:** tabs in slots down to 30° (`MIN_CORNER`, as today).
   - **Crossings:** half-laps down to 30°.
   - **Below 30°: the line is refused with the reason.** *Changed during implementation:* the plan first said a shallow crossing would become two T dividers. But the edge-on-face joint (`faceFit`) has the same 30° floor, so those Ts couldn't be joined either. Shift's 30° steps never go below it; only Alt (free) can.
   - A divider *turned* below 30° after it was made keeps its ends, unjoined there; the export check names it.
7. **The old *click a wall, Shift-click the opposite wall, + Divider*** stays as a shortcut. It makes a divider through the new model, spanning both walls.

## Model (`src/model/types.ts`, schema 10)
A divider becomes a **standing board placed on its base** (milestone 28's `place`, pose `standing`), with a record of what was drawn. Its length and ends are derived:

```ts
/** A divider (milestone 44): drawn as a line on its base; its ends are found, not stored. */
Panel.divider?: {
  /** A point on the line, base-local (where it was drawn: the middle of the line). */
  at: P2;
  /** Direction, degrees in the base's coordinates. */
  rot: number;
  /** How far the drawn line reached each way from `at` (mm, ≤ 0 and ≥ 0). */
  reach: [number, number];
};
```

- **`isDivider(p) = !!p.divider`** replaces every offset guess. `names.ts`, `jointDefaults.ts` (`jointGroup`), `ops.ts` (`isDividerOffset`, `edgeConnection`), `View3D.isDivider` and `recipes.ts`/`objects.ts` all switch to it.
- **Height:** as today (the lower of the two boards its ends meet, less the base's thickness and `DIVIDER_GAP`), unless *own height* (`customHeight`) is set.

### Finding the ends (`reconcileDividers` in `src/model/dividers.ts`)
Run in `solveOnce` after trays and grown walls have frames, before placed frames, **in creation order**.
- Each divider sees:
  - every board standing on its base: tray walls, grown walls, standing boards and, once milestone 46 lands, curved walls (per facet)
  - **earlier** dividers only
- For each direction (±): walk along the line from `at` and list the board footprints it passes, each as an interval [near face, far face] along the line.
  - **The end** is the near face of the first footprint whose far face lies at or beyond `reach`.
  - Footprints entirely between `at` and `reach` are **crossed**.
  - Nothing reached: the base's outline.
- The result sets `place.x/y` (the start), `w` (the length), and the divider's frame through the existing placed-frame code.
- **Later dividers crossing an earlier one** become half-laps through the existing automatic seams: `findOpenSeams` → `crossFit`.
- **Creation order makes it deterministic and cycle-free.** An L where two dividers would each end on the other resolves as: the later one ends on the earlier one.

### Joints (`src/model/seams.ts`)
- **Ends** are automatic closing seams (edge on a face), as standing boards get today. When a reconcile changes which board an end meets, the old auto seam breaks and is removed, and a new one is made: the existing `auto` seam behaviour.
- **Bottom:** the standing board's edge-on-face seam to the base (tabs in slots, glue or slide, per `designKind(d, 'base')`).
- **Angled ends already work.** A tab-and-slot slot is the projection of the tab's volume through the receiving board, plus clearance/2 (DECISIONS *Slots*). At an angle α it comes out about t_divider / sin α + t_wall · |cot α| long, and `faceFit`'s `trim` keeps the acute corner from poking through. This milestone adds tests that pin it.
- **Angled crossings need `crossFit` generalised.** Today it accepts only square crossings (|cos| ≥ 0.99). For two upright boards crossing at α ≥ 30°:
  - **Slot width in A:** t_B / sin α + t_A · |cot α| + clearance, centred where B's mid-plane crosses A's.
  - **Slot width in B:** the same with A and B swapped.
  - **Depths:** split at mid-height as today.
  - At 30° in 3 mm plywood a slot is about 11 mm wide. The check reports a slot that leaves less than `minWeb` to an end or another joint (`val.sliver` / `val.slotEdge` already cover it).

### Compartments (`src/model/dividers.ts`, `src/easy/objects.ts`)
`clearBox` assumes a rectangle cut by full-length dividers. It's replaced by **regions**:
- the base's inside (its outline, minus every board footprint on it, via `polygon-clipping`)
- each resulting polygon is one compartment

This serves T-dividers, angled dividers, polygon bases and, later, round boxes in one way:
- **Compartment sizes on the stage:** each region's clear width across the divider being drawn or dragged (replaces `compartmentGaps`).
- **"What goes inside":** an object fits if its footprint (with the clearance) fits in the region, tried along the region's longest edge and across it. Rectangles keep the exact current result.
- **Equal compartments (`arrange.ts`):** a row is parallel dividers whose ends meet the same two boards. They're spaced between the faces bounding the row, so it works for a row of Ts inside one compartment too.

## UI
### Drawing (`src/views/panelTool.tsx`, `src/easy/recipes.ts`)
- **Divider tool** in both modes, drawn on a box's base. `planDividerLine` is rewritten around the rules above; `snapEnd` is no longer needed, since ends come from `reconcileDividers` run on a draft.
- **The ghost shows the divider as it will be made:**
  - its full length, with each end marked by what it joins: a **T** on a board, a **cross** where it passes a divider, a **plain end** at an open edge
  - the live compartment sizes (`divider-live`)
  - its angle when it's off the grid
- **While dragging:**
  - the direction snaps to the grid (Shift: 30° steps; Alt: free)
  - the position snaps to equal compartments, in line with neighbours, and the middle
  - the ghost turns red with a reason when nothing can be reached
- **✓ / Enter** makes it (one undo step) and returns to Select, as every tool does.

### After making it (`src/ui/Inspector.tsx` divider card, `src/views/View3D.tsx`)
- **Move:** its amber arrow moves it along its normal. The ends re-derive as it moves, and it snaps as above.
- **Turn:** the gizmo ring turns it about its middle, with the same grid / Shift 30° / Alt rule as drawing.
- **Card fields:**
  - *Position*: the clear distance to the board behind it
  - *Angle*: shown only when it's off the grid
  - *Height* with *Own height*
  - **Ends**: one row per end naming what it joins, with ‹ › to stop one board earlier or reach one further. This sets `reach` just past that board.
- **Equal compartments** for several selected parallel dividers, as today, using rows as defined above.

### Quick build (`src/easy/QuickRail.tsx`, `src/easy/actions.ts`)
- **Divider (D)** always makes a divider; the flyout gives **Standing board** (D again).
- The mission goals and the *what goes inside* checks use regions, so T-shaped layouts count.

## Old files and templates
- **Schema 10 migration** (`serialize.ts`): a grown panel on a root base, at 90°, `dir: 'up'`, not a tray wall, and standing in from its edge by more than its joint's own offset, becomes a divider record.
  - `at` = the middle of its bottom line; `rot` = the edge direction; `reach` = just inside the two boards its ends met.
  - It keeps its id, name, shapes, height and joint kinds.
  - Its grown connection becomes the standing board's bottom seam, with the same kind and counts.
- **The organiser template** (`templates/organiser.ts`) makes its dividers with the new `addDivider(d, baseId, at, rot, reach, height)`.
- **Golden exports must not change** for the organiser in every material. Any difference is a migration bug, not a new golden file.

## Tests
- `tests/dividers.test.ts` (extended; its current cases must still pass):
  - **Grid:**
    - with no dividers, the line snaps to the box's edges (rectangle) or its longest edge (hexagon)
    - the second divider snaps parallel/perpendicular to the first, even when the first was drawn at 30°
    - Shift gives 30° steps from the box's axes; Alt gives free angles
  - **Ends:**
    - a short line inside one compartment fills it
    - a line ending before a perpendicular divider makes a T joined to it
    - a line crossing a divider makes a half-lap and reaches the next board
    - a line reaching an open tray side stops at the base edge, unjoined
    - a line reaching nothing is refused
  - **Afterwards:**
    - moving the board a T ends on stretches the T
    - deleting it runs the T on to the next face
    - turning a divider re-derives both ends
    - ‹ › on an end changes what it joins
  - **Angles:**
    - a 60° and a 30° end in plywood get slots of t / sin α + t · |cot α| + clearance (within 0.01 mm), with the acute corner trimmed
    - a 45° crossing gets both half-lap slots widened by the formula
    - a 20° crossing (Alt) becomes two T dividers
    - card and corrugated fall back to glue below 30° with the reason
  - **Compartments:** regions for a T layout and a hexagon; object fits match today's results on rectangles; equal compartments within a row of Ts
  - **Migration:** every design in `tests/goldenDesigns.ts` re-opens with the same pieces, and `tests/golden.test.ts` passes without `UPDATE_GOLDEN`
- `tests/autoseam.test.ts`: the random-design fuzzer also draws dividers by the new rules (grid, Shift angles, Ts, crossings), and every pair of touching boards must be joined or named.
- e2e `tests/e2e/dividers.spec.ts`:
  - Quick build Divider draws a T and a crossing
  - the Standing board flyout makes a free board on the same base
  - Workshop's Standing board drawn wall to wall stays a standing board
  - Shift-drag lays a 30° divider and the next one follows it
- Screenshots: `docs/divider-shots/{en,he}-44-*.png` (the ghost's end markers, a T layout, an angled layout in a hexagon).

## Out of scope
- **Dividers that don't stand at 90° to the base** (leaning).
- **Curved dividers.** Possible later as bent panels (`CURVED_WALLS.md`).
- **Dividers in round boxes:** they follow from this model once milestone 46 can find a curved wall's face (`CURVED_WALLS.md` §6.4).
