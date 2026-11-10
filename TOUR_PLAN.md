# Milestone 43: a first-use tour from the welcome screen

A guided, hands-on tour that a new student starts from the welcome screen. They build one small box and learn, by doing each step themselves:
1. the Board tool, flat and perpendicular
2. growing the walls, and then the lid as a separate step
3. changing the material in the middle of a design, and what that does to the joints
4. choosing joints
5. dividers
6. cutters (Cut out shapes, and Cut through)

It replaces the four-step "Getting started" tips (`src/ui/Hints.tsx`).

**Build milestone 42 (`BOARD_TOOL_PLAN.md`) first.** The tour teaches the one-drag Board tool and its perpendicular button, and its divider step depends on them.

## Decisions (defaults; change them here before starting if the owner disagrees)
1. **Workshop only.** Quick build has no Board tool. Launching the tour switches the app to Workshop and says so on the first card. When a class locks the mode to Quick build (`mode_locked`), the welcome screen doesn't offer the tour.
2. **The tour builds its own design.** "Take the tour" starts a new blank design in 3 mm plywood, exactly as Start with *Blank* does.
   - The welcome screen only shows on first use or after *New design*, which already asks before replacing work, so nothing is lost.
   - At the end, the student keeps the box (it autosaves like any design).
3. **Hands-on.** Each step waits until the student has done the thing, checked in the store, then moves on by itself. *Next* is only offered on steps that just explain.
   - **Skip step** is always there; it applies the step's result with model ops so later steps still make sense.
   - **Back** goes to the previous step's card without undoing anything.
   - **End tour** closes it.
4. **Not persisted across reloads.** A reload ends the tour (state lives in the store only). `localStorage['cutforge.tourDone'] = '1'` is set when the tour finishes or is ended.
5. **Where it can be launched:**
   - **The welcome screen** always offers it: as a prominent card above step 1 until `tourDone`, then as a small link in the footer.
   - **The project menu** gets *Take the tour* too. It opens the welcome screen through the existing *New design* path, so the same confirm guards the current work.
6. **The old tips go.** `Hints.tsx` and its `hint.*` strings are removed. A first-time student who chose *Start* instead of the tour gets one small dismissible note: *"New here? Take the 3-minute tour"* (opens the tour on a new design after the same confirm). Dismissing it sets `tourDone`.

## The steps
Each step has:
- **an anchor:** what the spotlight and card point at
- **text:** en and he, short and second person, in the app's voice
- **done-when:** a pure function of the store state
- **skip:** what Skip applies
- **prepare:** optional, run on entering the step

| # | Teaches | Anchor | Card text (gist) | Done when | Skip applies |
|---|---|---|---|---|---|
| 0 | Welcome | centre | "Let's build a small box with a lid, a divider and a window, about 3 minutes. Everything you make stays yours." Buttons: *Start* / *Not now* | *Start* pressed | — |
| 1 | Board tool | rail `tool-panel` | "This is the Board tool. Click it." | `tool === 'panel'` | set the tool |
| 2 | Draw a base | the floor near the origin (stage anchor), plus an animated drag hint | "Drag on the floor to draw the base, about 120 × 80 mm. Release and it's made." | a floor board (not construction) with w ≥ 60 and h ≥ 40 exists | `addRootPanel(d, -60, 40, 120, 80)` |
| 3 | Perpendicular button | `tool-panel-standing` (tool forced active in prepare) | "This lighter button draws boards that stand up instead of lying flat. You'll use it for the divider later." | *Next* | — |
| 4 | Walls | the base (stage), then the card's `extrude` button | "Select your base, then **Extrude walls**: a wall on every edge at one height. Drag the arrow or type 40, then ✓. (To grow just one wall, select one edge and press **Grow**.)" | a tray on the base exists | `addTray(d, base, 40)` |
| 5 | Lid, on its own | the back wall's top edge (stage) | "Now the lid, grown separately: click the **top edge of the back wall**, press **Grow**, swing it down to 90° so it closes the box, then ✓." | a panel grown from a tray wall's top edge (`e2`) exists | grow it with `growPanel(d, backWall, 'e2', …)`, the grow defaults for the material, 90° |
| 6 | Material mid-design | `material-pill` | "Change your mind about material at any time. Open the material and pick **Card 0.5 mm**." | `design.material.kind !== 'plywood'` | `setMaterial(d, card)` |
| 7 | What changed | the Joints button in the bottom-right dock (stage joints view), with the joints view turned on in prepare | "The joints changed with it: card can't take finger joints, so the walls fold and glue instead. Plywood choices are kept for when you switch back." | *Next* | — |
| 8 | Joint choice | the design card's Joints section (`inspector-design`, the *Corners* select) | "Pick how the corners join: try **Tab and slot**." (Offer only kinds the current material allows; the step reads them from `seamKinds`.) | the design-wide corner choice for the current material changed from its value at step entry | `setAllJoints(d, 'corner', <first allowed other kind>)` |
| 9 | Back to plywood | `material-pill` | "Switch back to **Plywood 3 mm**: your plywood joints come back." | material kind is plywood | `setMaterial(d, ply3)` |
| 10 | Divider | rail `tool-panel` and `tool-panel-standing`, then the base inside the box (stage) | "Choose the Board tool, turn on the **perpendicular** button, and drag a line across the floor of the box, from wall to wall. It becomes a divider." | a divider exists in the box (a panel standing on the base, joined to two walls; same test as `planDividerLine` kind `divider`) | `addDividerFor(d, leftWall, rightWall)` |
| 11 | Cutter | rail `tool-shapes`, then `op-cut`, then the front wall (stage) | "Cutters remove material. Choose **Shapes → Circle**, keep **Cut out**, and drag a window on the front wall, then ✓. (**Cut through** cuts every board in its path.)" | a confirmed (not pending) detail with `op === 'cut'` on a tray wall | `addDetail(d, front, 'circle', 'cut', w/2, h/2, 20, 20)` |
| 12 | Finish | `open-export`, then `view-2d` | "That's the whole loop. **Cut plan** shows the pieces on the sheet; **Download for laser** gives the file. You can take this tour again from the menu." | *Done* | — |

**Notes on the steps**
- **Step 5:** check the grow path for a lid on a tray wall's top edge works in plywood and card (Quick build's lid uses `wallRecipe`). If the Workshop grow at 90° from the back wall's top edge doesn't close the box neatly, use whatever angle and adapt the Workshop grow already uses for lids, and say so in the card.
- **Step 8:** with card active, the allowed corner kinds differ from plywood's. Use the real list from `seamKinds`, and word the card generally if "Tab and slot" isn't available.
- **Steps 4, 5, 10, 11:** if the student does something else (another tool, a different edge), don't block them. The card shows a short "Not quite. Try …" line when the state clearly went another way (e.g. a grown panel on a side edge in step 5), and *Undo* is right there on the top bar.

## What to build

### Tour engine (`src/tour/`)
- **`steps.ts`:** the declarative step list above. Text by i18n keys `tour.<id>.title` / `tour.<id>.body`, en and he.
  ```ts
  type TourStep = {
    id: string;
    anchor: Anchor;
    title: MsgKey;
    body: MsgKey;
    done?: (s: State) => boolean;
    skip?: (d: Design) => void;
    prepare?: () => void;
    next?: boolean;
  };
  ```
  `Anchor` is one of:
  - `{ dom: string }`: a CSS selector, normally `[data-testid=…]`
  - `{ stage: (d: Design) => V3 | null }`: a world point
  - `{ centre: true }`
- **Tour state in the store:** `tour: { step: number } | null`, plus `startTour()`, `tourNext()`, `tourBack()`, `endTour()`.
  - `startTour()`:
    - switches to Workshop
    - makes the blank plywood design (as `StartScreen.start` does for Blank)
    - closes the welcome screen
    - sets a known camera (the `setCamera` helper used by tests: a three-quarter view over the origin) so stage anchors are on screen
- **`useTourProgress`** subscribes to the store. When the current step's `done(state)` turns true, it advances after ~600 ms, so the student sees what happened. Skip runs `skip` inside one `apply` (one undo step), then advances.

### Overlay (`src/tour/TourOverlay.tsx`, `src/styles.css`)
- **The spotlight:** a fixed full-window layer that dims everything except a rounded hole around the anchor (a `box-shadow: 0 0 0 9999px` cutout, or an SVG mask).
  - The dim layer is `pointer-events: none`, so the student can use the whole app.
  - The ring pulses gently (none under `prefers-reduced-motion`).
- **The card:**
  - Beside the anchor, flipping to the side with room, and correct in RTL. Never covering the anchor.
  - Title, body, "Step n of 12", *Back*, *Skip step*, *End tour*, and *Next* on explain-only steps.
  - `role="dialog"`, `aria-live="polite"` for step changes, and focus moves to the card on each step without stealing focus from fields the student is typing in.
- **Stage anchors:** `View3D` registers a projector (world → screen, the same maths as the `__cutforge.project` test hook) in a small module-level registry while the tour is active. The overlay re-projects every animation frame while a stage anchor is shown, so it follows orbiting and zooming. If the point is behind the camera or off-screen, the card shows anyway and the ring hides.
- **The animated drag hint (step 2):** a small hand cursor moving along a short path over the floor anchor (CSS, two seconds, repeating). It stops when the student starts dragging.
- **Viewports:** check the overlay at 1366 × 768 and 1280 × 800, in both languages. The card must not hide the top bar's Download button or the rail.

### Welcome screen and menu
- **`StartScreen.tsx`:**
  - The tour card above step 1 when `!tourDone`: a short pitch, a small illustration (reuse `BlankArt`'s style), and *Take the tour* (`data-testid="tour-start"`).
  - A footer link after that.
  - Hidden when `viewPrefs.mode` is locked to Quick build.
- **`TopBar.tsx` project menu:** *Take the tour* (`data-testid="menu-tour"`) goes through the existing *New design* confirm, then `startTour()`.
- **Remove `Hints.tsx`** and its mount. Add the one-time "New here?" note (decision 6).

### Anchors in the app
- **Add test ids where a step needs one and none exists:**
  - the Joints dock button
  - the design card's *Corners* select
  - the Extrude walls confirm
  - the Grow button on an edge (if it differs from `grow-pill`)
- **Add `data-tour` attributes only if a test id can't serve.**
- **The stage anchors (base centre, back wall top-edge midpoint, box inside floor, front wall centre):** small pure functions over the design in `steps.ts`, unit-tested.

## Tests
- **Unit (`tests/tour.test.ts`):** for each step, build the "before" design with ops and check `done` is false; do the action with ops and check `done` is true; check `skip` makes `done` true. Run it for the whole sequence in order, so skipping every step from 1 to 12 ends with a box that has a lid, a divider and a window, and `validate` reports nothing blocking.
- **e2e (`tests/e2e/tour.spec.ts`):**
  - **English, doing every step for real** (mouse on the stage, using the `__cutforge.project` helpers for points): each card appears in turn, the spotlight sits on its anchor (the ring's box contains the anchor's box), steps advance by themselves, and the final design has a tray, a lid, a divider and a cut on the front wall.
  - **Hebrew:** start the tour, check the card sits on the correct side of a rail anchor in RTL, then *Skip step* through to the end. The final design is equally complete.
  - **Ending and relaunching:** *End tour* at step 4 leaves the design as it is, and the welcome screen next time shows the footer link instead of the card. The project menu's *Take the tour* asks before replacing a design that has boards.
  - **Quick build lock:** with the mode locked to Quick build, the welcome screen has no `tour-start`.
- **`SHOTS` spec:** one screenshot per step in en and he, for review.
- `npm run typecheck && npm test && npm run e2e` all green.

## Done when
- A new student can take the tour from the welcome screen, finish it hands-on in both languages, and end up with a valid box.
- The specs above pass.
- `Hints.tsx` and the `hint.*` keys are gone.
- DECISIONS.md records the decisions above, and PROGRESS.md has a "Milestone 43" section.
