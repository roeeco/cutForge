# CutForge: panels anywhere, drafts, boards, dividers and flat nets: brief

Planning notes from 2026-11-09, made after milestones 21–24 and the follow-up (snapping toggles, add ghosts, outline snapping, curves), on `main`. Milestones 25–27 (in `GIZMO_JOINTS_FLAPS.md`) are planned but not built, so this brief starts at 28. Milestones 25–27 have since been built (see `PROGRESS.md`). Milestone 35 (flat nets and growing on part of an edge) was added later the same day. The two plans don't depend on each other.

## 1. What changes for a student

- **Panels on any face.** The Panel tool draws on the floor *or* on any panel's face. A new panel is its own piece (its own net), not grown from the face it sits on. It moves with that face: when the face's panel moves, turns or changes size, the new panel follows it.
- **Flat or standing.** Drag a rectangle to make a flat panel lying on the face. Switch to *Standing* and draw a line instead: a ghost wall stands on it at the last height you used. Drag its arrow or type a height, then press **✓**.
- **Construction panels.** Any panel can be switched to *Construction*. It is a guide: you can see it and draw and snap on it, but it is never cut, never joined to anything, and not in the cut plan or the export.
- **One way to confirm.** Every new thing is a ghost first: panels, grown panels, extruded walls and shapes. Press the floating **✓** (or Enter) to make it, or **✕** (or Esc) to drop it. After a drawing tool makes something, it goes back to *Select*.
- **Copy and paste shapes.** Cmd/Ctrl+C copies the selected shapes. Cmd/Ctrl+V pastes them onto whichever panel the pointer is over, as a ghost that follows the pointer and snaps. Then **✓**.
- **Arrange boards.** Shift/Ctrl-click several panels to select them, then align and distribute them, the same way as shapes.
- **Nets that lie flat.** Extruded walls never overlap their neighbours in the flat net. When they would, the app changes the net and says what it did: it trims a glue flap, folds a wall off its neighbour instead of the base, or cuts it as its own piece. It also shows how tall the walls can go while the net still lies flat.
- **Grow on part of an edge, by pointing.** Clicking an edge still grows on the whole edge. Hold Cmd (Mac) or Ctrl (Windows) and drag along the edge, or click twice on it, to set where the new panel starts and ends. Both points snap to corners, the middle, other panels and the base's shapes.
- **Dividers, one way.** Click a wall, then Shift-click the wall opposite it. A floating **+ Divider** button puts a divider halfway between them. Drag it afterwards: it snaps to equal compartments, and the compartment sizes stay clickable. Automatic divider sets, the *One divider* form and *Divider between* go away.

## 2. Decisions (from the interview)

| Topic | Decision |
| --- | --- |
| Where panels go | **The floor or any panel face.** A placed panel is a separate net, never folded to or grown from its host. |
| Flat panel on a face | **No joint, no glue.** It is a separate part in the cut plan. The export check does not report it as "touching but not joined" to its host. |
| Standing panel | **Draw a line.** The ghost has the last height used (40 mm the first time). After release, change the height with the arrow or by typing, then **✓**. Its bottom edge is joined to the face like any edge-on-face seam: the design's *Wall to base* default (tabs and slots, slide or glue flap). Its ends join any walls they touch, as seams do now. |
| Host deleted | **Placed panels drop to the floor.** They keep their pose (flat stays flat, standing stays standing) and their position seen from above. Panels placed on *them* keep following them. |
| Construction panels | **Never joined, never cut.** Panels placed on a construction panel are not joined to it. |
| Confirming | **A floating ✓ for every ghost:** the Panel tool (floor and faces), grow, extrude *Add walls*, every shape tool (rectangle, rounded rectangle, circle, polygon, text, imported SVG) and paste. The *Grow panel* and *Add walls* buttons leave the cards. After **✓** a drawing tool returns to *Select*. |
| Copy and paste | **Shapes onto any panel** (or a face of one), keeping their layout, at the pointer. |
| Arranging boards | **Align and distribute panels** that share a plane: floor panels, or panels placed on the same face. |
| Flat nets | **Never overlap.** Every fold net is checked flat. On tray walls the app fixes overlaps itself, in this order: trim the flap, fold the wall off its neighbour, cut the wall as its own piece. The extrude ghost marks the tallest height that needs no fix. Panels you grow yourself are warned about, not changed. |
| Partial growth | **Whole edge by default.** Cmd-drag (Mac) or Ctrl-drag (Windows) along an edge, or two clicks, sets the start and end, with smart snapping. |
| Dividers | **One manual way:** select two facing parallel walls, then **+ Divider**. It goes halfway along and is dragged afterwards. Automatic sets, *One divider* and *Divider between* are removed. |

**My calls (say if you want them different):**

- **Leaving a ghost.** A ghost stays until **✓** or **✕**. Choosing another tool, selecting something else or starting another drawing drops it.
- **Construction is a property of a whole net.** Panels grown from a construction panel are construction too (useful for a guide box). Switching the root back to a real panel switches its whole net, and the joints are made then. Panels *placed* on a construction panel are real unless you tick *Construction* in their ghost.
- **Dividers can be distributed.** Several dividers on the same base, parallel to each other, can be selected and distributed. That replaces *Space evenly again*.
- **Which wall gives way** (milestone 35): at an inside corner, the shorter wall, or the later one in the base's edge order when they're equal. The tray card lets you pick the other one.
- **A wall cut as its own piece** joins the base with the design's *Wall to base* kind, if that kind isn't a fold. Otherwise card uses a glue flap and corrugated uses tabs and slots.
- **Cmd on Mac, Ctrl on Windows only.** Ctrl-click on a Mac is a right-click, so it's not used there.
- **Not in this round:** copying and pasting whole panels, and a box drag to select several panels.

## 3. Milestones

### Milestone 28: placed and construction panels (model)

- `Panel.place?: { host: string | null; face: 1 | -1; x: number; y: number; rot: number; pose: 'flat' | 'standing' }`.
  - `host: null` is the floor. `x`, `y` and `rot` are in the host's local coordinates (on the floor: world x/z and yaw).
  - A standing panel's `x`, `y` is the start of its bottom line and `rot` is the line's direction. Its height is `h`, and `side` says which side of the line the material is on.
  - Floor panels without `place` stay exactly as today. They are flat on the floor, so no migration is needed.
- `solve` derives a placed panel's frame from its host's frame before grown frames. Hosts come first, and a cycle is refused at creation. `display.xf` (the fold view) carries placed panels with their host.
- `Panel.construction?: true` is set on the root of a net, and its grown descendants inherit it. It is left out of:
  - pieces, packing, the cut plan, export and copies
  - `autoConnect` and the seams
  - the validation contacts
  - through-cuts (`panelsCutBy`)
  - fold nets
- It stays in: snapping targets, drawing hosts and grow parents.
- **Contacts.**
  - Flat placed panel against its host: no joint, and no `faceToFace` warning.
  - Standing placed panel: the existing edge-on-face seam via `connectSeams`, using `designKind(d, 'base')`.
- **Deletion.** `deletePanel` re-places panels hosted on the deleted panel onto the floor. They keep their world footprint and pose (`host: null`).
- `movePanel` / `rotatePanel` / `setPanelYaw` work in the host's plane for placed panels.
- **Schema 8.** `place` and `construction` are optional, so v7 files load unchanged and exports of them stay byte-identical (golden tests).
- **Tests (unit):**
  - A flat panel and a standing panel on a wall follow the wall when its base moves and turns, and when the wall's height changes.
  - Deleting the host drops them to the floor in place.
  - A standing panel on a plywood base gets tab-and-slot to the base.
  - A flat one makes no connection and no validation message.
  - A construction net is missing from pieces and export but is a snap target.
  - Switching it real makes its joints.

### Milestone 29: the Panel tool on faces, as a ghost

- **Hover.** With the Panel tool, the face under the pointer is highlighted (the floor when there is none). Which face of a panel comes from the hit's depth, as the old Shift-click face pick does.
- **Flat.** Drag a rectangle in that plane, with smart snapping:
  - On a face: `snapContext` targets on the host (its corners, edge midpoints, centre and shapes), plus the outlines of panels already placed on that face.
  - On the floor: the corner and edge targets of `snapFloor`.
  - Alt or snapping off: the grid.
- **Standing.** Draw a line. Its ends snap to the same targets and to the inner faces of walls standing on the host, so a shelf partition drawn wall to wall ends exactly on both walls. The ghost stands at the last height used, with the push-pull arrow, a typed height on the stage, and the *Up/Down* flip badge.
- **Ghost bar** (floating next to the ghost): **Flat | Standing**, **Construction**, **✓**, **✕**. The W/H labels on the stage can be typed, and the corners can be dragged before **✓**.
- **✓** makes the panel, selects it and returns to *Select*.
- The gizmo on a selected placed panel moves it in its host's plane and turns it about the host's normal, snapping to the same targets.
- The card of a placed panel shows what it is on (*On panel 3, inner face*), *Flat/Standing* and *Construction*.
- **Tests (e2e):**
  - Draw a flat panel on a wall's inner face, snapped to the wall's corner, then **✓**.
  - Draw a standing line between two walls on a base: both ends land on the walls, the height is typed, then **✓**. The cut plan shows slots in the base and in the walls.
  - Esc drops the ghost.

### Milestone 30: one floating ✓ everywhere

- A shared `ConfirmBar` (**✓** / **✕**, Enter / Esc) is anchored at a ghost's screen position, with the same look as the grow pill.
- **Grow.** The ghost gets **✓**, and *Grow panel* leaves the card (the card keeps the angle, height, span, joint and adapt settings).
- **Extrude.** The tray ghost gets **✓**, and *Add walls* leaves the card.
- **Shape tools.** Rectangle, rounded rectangle, circle, polygon (after closing it), text and imported SVG all draw a ghost. Its handles and *Add/Cut/Engrave/Score* can still change before **✓**. Then the tool returns to *Select*. Applies in 3D, the face-on view and the cut plan.
- Undo history: a ghost is a preview transaction (`preview` / `cancel`), and **✓** is one `commit`, so one undo step.
- **Tests (e2e):**
  - Each tool's ghost, then **✓**, makes exactly one undo step and leaves the *Select* tool on.
  - **✕** and Esc leave the design unchanged.
  - Starting another tool drops the ghost.

### Milestone 31: selecting and arranging boards

- **Selection.** `{ kind: 'panel'; id; ids }`: Shift/Ctrl-click adds or removes a panel. This replaces the Shift-click face pick and the display-only `also` (joint messages use `ids`).
- **Arrange** (the multi-selection card, like shapes):
  - Align left / centre / right / top / middle / bottom, and distribute horizontally / vertically.
  - These work for floor panels, and for panels placed on the same face (in its plane).
  - With a mixed selection the buttons are greyed, with the reason (*These panels are not on the same surface*).
- **Dividers on one base.** Several parallel dividers on the same base can be distributed: equal compartments between their outermost neighbours (walls or dividers).
- The gizmo moves several floor panels, or several panels placed on the same face, together.
- **Tests:**
  - unit: align and distribute on floor panels and on placed panels; equal compartments for three dividers.
  - e2e: select three floor panels, distribute them, and undo.

### Milestone 32: dividers, one manual way

- **+ Divider.** When the selection is two walls with facing, parallel faces standing on the same base (a divider counts as a wall), a floating **+ Divider** button appears between them.
  - It reuses `planDividerBetween`, with the divider halfway along the stretch where the two walls overlap instead of at the click.
  - Its height is the lower wall's top minus `DIVIDER_GAP`.
  - Its ends are joined to both walls, and it crosses other dividers with half-laps, as now.
  - When no divider fits, the button is greyed with the reason (the existing `div.why.*` texts).
- **Selecting a wall** shows a hint: *Shift-click the opposite wall to add a divider between them.*
- **Dragging a divider** (the amber arrow, `snapDividerOffset`) and the clickable compartment sizes stay as they are.
- **Removed:**
  - `DividerSet`, `reconcileDividerSets`, `setDividerSet`, `releaseDivider` and `respaceDividers`
  - the *Add a divider* section (automatic and *One divider*)
  - the `facePick` state and its Shift-click
  - their i18n keys in `en.ts` and `he.ts`
  - their tests, which are rewritten for the new flow
  - `addDivider` stays for the organiser template.
- **Old files.** Loading a file with `dividerSets` keeps every member where it is, as an ordinary divider with its id and joints, and drops `dividerSets` (the schema 8 migration).
- **Tests:**
  - unit: a migrated v7 organiser with a 2 × 1 set keeps the same panels and exports the same file.
  - e2e: click a wall, Shift-click the opposite wall, **+ Divider**: it is centred. Drag it to the equal-compartment snap.
  - e2e: walls that are not parallel give a greyed button with the reason.

### Milestone 33: copy and paste shapes

- Cmd/Ctrl+C copies the selected shapes: their details, layout relative to their common centre, and their op, rotation and arrays.
- Cmd/Ctrl+V starts a paste ghost that follows the pointer over any panel face (in 3D, the face-on view and the cut plan) and snaps by its bounding box.
  - Click to place it, adjust it, then **✓**.
  - A through-cut stays a through-cut.
  - Pasting with nothing under the pointer puts it on the last selected panel's centre.
- The clipboard is in-app (store state), not the system clipboard, so it survives switching views but not a reload.
- Shapes partly off the panel are kept and show the usual export-check message.
- **Tests (e2e):**
  - Copy two shapes from the base, paste them onto a wall: the layout is kept and they are snapped to the wall's centre.
  - Undo removes the paste in one step.

### Milestone 35: nets that lie flat, and growing on part of an edge

**What happens now.** I measured extruded trays flat (all three materials, walls 20, 40 and 80 mm tall). The cut outline is the union of the net's panels, so overlaps are merged without any warning.

| Base | Overlap when flat | Why |
| --- | --- | --- |
| Rectangle, triangle, hexagon | none | at a convex corner the two walls fold apart |
| Octagon, card, 20 mm walls | 7 mm² at every corner | the corner glue flap reaches past the narrow gap (45°) into the next wall |
| L-shape, any material | 340–1,560 mm² at 20–40 mm, about height² | at the inside corner the two walls fold over each other; the wall that closes the corner also runs into the base |
| L-shape, 80 mm walls | also 3–80 mm² between walls that aren't neighbours | walls taller than the notch (60 mm) reach across it |

**Engine: find overlaps.**
- `netOverlaps(d)` (`src/model/pieces.ts`): for each fold net, flatten every panel with its additions (flaps, fold-over rim and liner, tabs that go through) and intersect each pair. It returns the pairs, the area and the region.
- The export check reports any overlap over 0.5 mm² (`val.netOverlap`: *Panels 3 and 4 overlap in the flat net*). Clicking it selects both, and the fold slider and the cut plan show the region in red.
- The grow ghost checks too. When a new fold panel would overlap its net, the ghost turns amber with the reason, and the ghost bar (milestone 30) offers *Cut it as its own piece*.

**Engine: fix trays automatically** (`src/model/trays.ts`, run in `solve` after the walls are placed; new `Tray.flat?: 'auto' | 'off'`, `auto` by default). For every overlapping pair in a tray's net, the first fix that clears it is used, and the result is checked again:
1. **Trim the flap.** A corner glue flap or a through tab is clipped to the free space between the two walls when flat (a taper along the neighbour's edge). If what's left is narrower than the material's minimum flap, the flap moves to the other wall of that corner.
2. **Fold the wall off its neighbour.** At an inside corner, one wall is hinged on its neighbour's side edge (a fold at the corner angle) instead of on the base. It lies flat in line with the neighbour, and joins the base with a glue flap (card) or tabs and slots (corrugated) along its bottom. This keeps one piece. It is used only when the new position overlaps nothing.
3. **Cut the wall as its own piece.** The wall leaves the fold net and joins the base and its neighbours with the *Wall to base* and *Corners* kinds, like any separate panel.
- Each fix is stored per wall as `Tray.fixes?: Record<edge, 'trim' | 'hinge' | 'own'>`, recomputed on every solve (stable ids, so shapes on a wall stay on it). The student can override one with `Tray.pin?: Record<edge, 'hinge' | 'own' | 'other'>`, where *other* means the corner's other wall gives way.
- Plywood has no fold nets, so nothing changes there.

**Height.**
- `flatHeight(d, baseId)`: the tallest wall height whose net needs no fix (binary search on the height, 0.5 mm steps). It's infinite for convex bases without flaps.
- The extrude ghost's height arrow shows it as a tick, and snaps to it. Past it, the ghost shows the walls that will be changed in amber, with a note: *Above 58 mm, wall 4 is cut as its own piece so the net lies flat.*
- The tray card shows the same note and two buttons: *Lower to 58 mm* and *Keep in one piece* (sets `flat: 'off'`; the export check then reports the overlap).

**Growing on part of an edge.**
- A plain click on an edge grows on the whole free stretch, as now.
- **Cmd-drag (Mac) / Ctrl-drag (Windows)** along a free edge sets the start where the drag begins and the end where it's released, with the ghost following live. Two Cmd/Ctrl-clicks do the same for trackpads. Esc cancels.
- Both points snap with smart snapping. Targets:
  - the edge's ends and middle
  - the ends of free stretches and of panels already grown on it
  - where other panels cross or touch the edge line (all from `spanTargets`)
  - **new:** the base's own shapes (their corners and centres projected onto the edge), equal thirds and quarters of the free stretch, and the mirror of the opposite wall's span, so two partial walls can line up face to face.
  - Alt or snapping off: the grid.
- While setting the points, the distances from both ends of the edge show as labels. Typing a number and pressing Enter sets the one being placed. Afterwards the end squares and the *Starts at / Ends at* fields work as now.
- **Modifier rules:** on a Mac only Cmd counts, because Ctrl-click is a right-click there. Cmd/Ctrl-click on a *face* stays multi-select (milestone 31); on an *edge* it picks a span. The edge's hit target wins over the face, as now.

**Tests.**
- unit: the five bases above × three materials × three heights all come out flat after `solve` (`netOverlaps` empty); the L tray uses a hinge at 20 mm and its own piece at 80 mm; the octagon's card flaps are trimmed and stay at least the minimum width; `flatHeight` for the L base is the height of its notch; `flat: 'off'` leaves the overlap and the export check reports it; a hinged wall keeps its shapes and its exports pass the golden checks for designs that don't need a fix (byte-identical).
- unit: span snapping to a shape's corner on the base, to thirds, and to the opposite wall's mirror.
- e2e: extrude an L base past the tick, read the note, *Lower to …* removes it. Cmd-drag along an edge from a third to the middle, then ✓: the panel stands exactly on [L/3, L/2].
- EN/HE screenshots: the tick on the height arrow, the amber wall with its note, the fold view of a hinged wall, and Cmd-drag on an edge.

### Milestone 34: final verification

- `npm test`, the e2e app specs, the golden exports and 500-design autoseam test.
- EN/HE screenshots into `docs/panel-shots/`: a flat panel on a wall, a standing partition, a construction plane with a panel on it, the ghost bar, + Divider, aligned boards and a paste ghost.
- README *Using it* steps 2, 3 and 15, PROGRESS entries and DECISIONS (placed panels as separate nets, construction nets, the divider simplification).

### Order and size

28 comes first, because everything else builds on it.

- After 28, 29 and 30 can go in either order, but 30 reuses 29's ghost bar, so 29 first is easier.
- 31 comes before 32, because the divider button needs selecting two panels.
- 33 needs only 30.

- 35's engine part (finding and fixing overlaps, the height tick) doesn't depend on 28–33 and can come first. Its Cmd/Ctrl span picking uses 30's ghost bar and must agree with 31's Cmd/Ctrl-click on faces, so it goes after 31.
- 34 (final verification) runs last, after 35.

28, 29 and 32 are a few days each. 30, 31 and 33 are a day or two each. 35 is about a week: the hinge fix is the largest part.
