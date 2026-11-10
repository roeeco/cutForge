# Milestone 42: the Board tool in one drag, with a perpendicular toggle

Today the Panel tool takes three steps: click the face (or floor), choose Flat or Standing on two small planes, then drag, then ✓. That's too much. This milestone goes back to drawing straight on the hovered face or floor, as milestone 29 did. Whether the new board lies flat or stands perpendicular is chosen on the tool button itself: a second, lighter button slides out from beneath the Board button while the tool is active.

It replaces DECISIONS.md "**The Panel tool takes three clicks** …"; update that entry, don't just add one. Milestone 43 (the first-use tour, `TOUR_PLAN.md`) teaches this tool, so build this first.

## Decisions (defaults; change them here before starting if the owner disagrees)
1. **Release makes the board.** No Flat/Standing choice and no ✓ bar for the Board tool:
   - Releasing a drag of at least `MIN_PANEL` creates the board in one undo step, selects it, and returns to Select (as ✓ does today).
   - A click or a drag shorter than `MIN_PANEL` makes nothing and keeps the tool.
   - Esc during the drag drops it.
   - Other tools keep their ✓ (milestone 30); only the Board tool loses it.
2. **The perpendicular button slides out toward the stage:**
   - **English:** the rail sits at the left edge of the window, so there's no room to its left. The button slides out to the right.
   - **Hebrew:** it slides out to the left (`inset-inline-end`). The owner asked for "to the left of the button", which this matches in the Hebrew layout.
   - If the owner wants it physically left in both languages, the rail itself would have to move. Out of scope.
3. **The toggle is remembered** (`viewPrefs.boardPose`, saved like the other view prefs). The first use is flat.
4. **The standing ghost's extras move to the board once it exists:**
   - **Height:** the last height used (`standHeight`, 40 mm the first time). Changed afterwards with the selected board's H field and its height arrow.
   - **Which side the material is on:** a *Flip side* button on the placed board's card (`PlacedUI`), and the existing flip badge on the stage while a standing board is selected.
   - **Construction:** the board card's existing *Construction* checkbox.
   - **Divider:** with perpendicular on, a line drawn on a box's base from wall to wall becomes a divider automatically, through the same `planDividerLine` / `confirmDividerLine` Quick build uses. Any other line makes a standing board. The live note (`divider-live`, "Makes compartments a | b") stays while drawing.
5. **Rename the tool to "Board"** in English (`tool.panel`: 'Panel' → 'Board'). Hebrew already says לוח. Leave the other "panel" wording alone.

## What to build

### Store (`src/store/store.ts`)
- Remove `panelPick` / `PanelPick` and every use of them.
- Keep `panelPose`, but source it from `viewPrefs.boardPose` (`'flat' | 'standing'`, default `'flat'`). Add `setBoardPose(pose)`, which saves the view prefs.
- `setTool('panel')` leaves the pose as it is. Choosing another tool hides the flyout but keeps the remembered pose.
- Keyboard (`useKeyboard` in `store/hooks.ts`):
  - `P` chooses the Board tool.
  - `P` again, while the Board tool is active, toggles perpendicular. Show it in the tooltip: *Perpendicular board (P)*.

### Rail (`src/ui/Toolbar.tsx`, `src/styles.css`, `src/ui/icons.tsx`)
- **Layout:** wrap the Board button in a `.rail-tool` container holding the main button and the flyout button (`data-testid="tool-panel-standing"`, `aria-pressed`, `aria-label` *Perpendicular board*).
- **New icon:** `panelStanding`, a board standing on a base line, drawn in the same style as `panel`.
- **The flyout:**
  - It sits beneath the main button (z-index lower).
  - When the tool becomes active it slides out by its own width plus a 6 px gap, toward `inset-inline-end` (transform with a ~160 ms ease-out, in both directions). When the tool goes inactive it slides back underneath and becomes `inert`, so it can't be clicked.
  - Its shade is a bit lighter than the rail (e.g. the rail colour mixed 15–20% toward white). When pressed it uses the `on` accent, like other active rail buttons.
  - Respect `prefers-reduced-motion`: no slide, just show and hide.
  - The tooltip shows to the side of the flyout and doesn't cover the main button.
- **The main button's icon follows the pose** (flat board, or `panelStanding`), so the current mode is visible even when the flyout is hidden.
- **Hidden in Quick build** (it has no Board tool), and outside the 3D view, like the tool itself.

### Stage (`src/views/View3D.tsx`, `src/views/panelTool.tsx`)
- Delete `PanelPicker`, the three-click branch of `panelDown`, the `pick.*` i18n keys (en and he) and the `.pose-pick` CSS.
- `panelDown` becomes: on pointer-down with the Board tool, start the ghost at once on the face under the pointer, or on the floor (`startGhost(e, host, face, pt, divider)`, with pose `panelPose`).
  - The face comes from `faceAt` as today, and `FaceHover` keeps outlining it before the press.
  - For the floor, outline a small square at the snapped point under the pointer, so the floor is visibly "hovered" too.
  - `divider` = `panelPose === 'standing' && host is a box base on its inner face` (`isBoxBase`).
- While dragging, the ghost shows as today: the rectangle or the standing board, live W/H labels, snapping, level/parallel line snapping (`snapLineEnd`), and the divider note.
- **On release (`ghost-draw` end):**
  - If `ghostPlace` (or the divider plan) is valid, make the board in one `apply` (factor `confirmPanelGhost` so it runs without a bar), clear `panelGhost`, select the new board and return to Select.
  - If it's too small, clear the ghost and keep the tool.
  - **The divider case:** call `confirmDividerLine`, which returns a divider or a standing board as Quick build does.
- `PanelGhostView`:
  - Remove the `ConfirmBar` and the pose/divider/construction controls.
  - Remove the post-release handles, W/H fields, `PushPull` height and flip for the Board tool: the ghost no longer waits.
  - Keep what draws the ghost while dragging.
  - Check nothing else uses those pieces before deleting. `PanelGhost` still has `drawing`; it's always true now, so consider removing the field.
- **The hint line at the bottom of the stage** (`View3D.tsx` ~2663): one key for the Board tool, e.g. *"Drag on the floor or a face to draw a board. Turn on the perpendicular button for a standing board."*, with a perpendicular variant. Write both in en and he.
- **Getting-started tip `hint.1` and `view.empty3d`:** they say "drag", which is true again, so make them name the Board tool and mention the perpendicular button. (Milestone 43 replaces the tips anyway; keep them correct until then.)

### Board card (`src/ui/PlacedUI.tsx`, `src/model/ops.ts`)
- Add *Flip side* for a standing placed board (`data-testid="placed-flip"`), with a model op `flipPlacedSide(d, id)` that toggles `place.side` and solves. Unit-test it: the board's footprint stays on the same line, and its material moves to the other side.
- Show the flip badge on the stage for a selected standing placed board (reuse the `ghost-flip` look, test id `placed-flip-badge`).
- Check the H field and height arrow on a selected standing placed board (milestone 29's gizmo) change its height. Add them if not.

## Tests
- **Unit (`tests/`):**
  - `flipPlacedSide`
  - the divider-or-standing decision for a line on a box base. It already lives in `planDividerLine`; add a case that goes through the new release path, factored so it can be called without the stage.
- **e2e (`tests/e2e/boards.spec.ts`)** replaces the "Panel tool takes three clicks" spec with *"the Board tool draws in one drag; the perpendicular button slides out and is remembered"*:
  1. Press the Board button: `tool-panel-standing` becomes visible beside it, its box to the right of the main button's (English). It's not pressed.
  2. Drag on the floor: a floor board exists at the dragged size (with snapping), is selected, the tool is Select, and one more undo step exists. No `panel-ghost-bar` and no `pose-pick` exist.
  3. Choose the Board tool again and press the flyout (`aria-pressed=true`). Drag a line on the board's top face: a standing placed board at height 40 is selected. Undo removes it.
  4. On a tray's base, a line from wall to wall with perpendicular on makes a divider joined at both ends. The `divider-live` note shows while dragging.
  5. Reload: choosing the Board tool shows the flyout still pressed. `P` toggles it.
  6. A click without a drag makes nothing. Esc during a drag makes nothing.
  7. Hebrew: the flyout's box is left of the main button's.
  8. With `prefers-reduced-motion` emulated, the flyout shows without animation (`getAnimations()` empty).
- **Update every spec that draws a board through the old flow.** Today they click `tool-panel`, then the plane and pose, then `ghost-ok`:
  - `boards.spec.ts` (10 uses), `quick.spec.ts`, `text-pack.spec.ts`, `joints.spec.ts`, `slice.spec.ts`, `editing.spec.ts`, `offline.spec.ts`, `panel-shots.spec.ts`
  - Add one helper in `tests/e2e/helpers.ts` (or the existing shared helper file), e.g. `drawBoard(page, from, to, { standing })`, and use it everywhere.
  - `ghost-ok` stays valid for shapes and grow. Only remove it where it confirmed a board.
- `npm run typecheck && npm test && npm run e2e` all green. The `SHOTS` specs get updated screenshots of the rail with the flyout out (en and he).

## Done when
- Drawing a board takes one drag, in both poses, and the specs above pass.
- DECISIONS.md is updated, and PROGRESS.md has a "Milestone 42" section in the usual format (Implemented / Verified).
- Nothing references `panelPick`, `PanelPicker`, `pick-flat`, `pick-standing` or `pose-pick`:
  ```bash
  grep -rn "panelPick\|PanelPicker\|pick-flat\|pick-standing\|pose-pick" src tests
  ```
  returns nothing.
