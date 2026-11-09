# CutForge: interaction refinements: implementation prompt

## 1. Goal

Make CutForge's existing features dependable and quick to use. Students should be able to:

- **grow** panels without the grow button blocking other handles, and have the grown panel **adapt** to what it meets: snapping height and angle, partial width, trimmed outline;
- trust that panels that touch are **always joined**, or told why not;
- **fold and unfold** card and corrugated nets from a slider that is always on the stage;
- **move and rotate** shapes and floor panels with one gizmo;
- make **dividers** automatically, drag them, or place one between two facing walls;
- **edit through-cuts** from any panel they cut, with smart snapping.

CutForge's central rule is unchanged: one model, edited directly in the 3D view and the cut plan, with no regeneration step.

The audience and limits are unchanged from `laser-fabrication-editor-agent-prompt.md`:
- high-school students on school Chromebooks, 75-minute lessons;
- Hebrew and English;
- LightBurn exports.

This is still a panel-and-sheet tool. Do not add a solid-modeling kernel. When a choice is unclear, prefer the version a 14-year-old can use correctly on the first try.

## 2. Read first

| File | What it gives you |
| --- | --- |
| `INTERACTION_REFINEMENTS.md` | **Binding spec**: what changes for students (§1), decisions (§2), milestones 15–20 with the causes found in code (§3), settled points (§4, detailed in §6.1 below). |
| `POLYGONS_AND_CUTS.md` | The layered pipeline (§3), edge keys (§4), wall outlines (§5) and through-cuts (§8). Everything here must fit into those layers. |
| `DECISIONS.md` | Every rule already in force, including clearance applied once, seating, the hinge angle and buildable angles, and automatic seams. |
| `PROGRESS.md` | What is built and verified, through milestone 14 and the final verification. Add a section per milestone. |
| `VISUAL_OVERHAUL.md` §12 | Interface constraints: keep every `data-testid`, i18n completeness, Chromebook performance budget, accessibility. |

## 3. Starting state

Built and working; do not redo it:

- Milestones 1–14 and the visual overhaul, all verified (see `PROGRESS.md`).
- Smart snapping for shapes (`src/model/snap.ts`), used by shape drags in `View3D.tsx` and `Plan2D.tsx`.
- Automatic seams (`autoConnect` in `src/model/ops.ts`, `seamBetween` / `findOpenSeams` in `src/model/seams.ts`), run after every edit from `src/store/store.ts`.
- The divider card (`DividerAdder`, `src/ui/Connections.tsx`) and `addDivider` (`ops.ts`). Organiser templates space dividers in `src/templates/organiser.ts`.
- The fold slider (`FoldSlider`, `src/ui/Inspector.tsx`), now shown in View settings and in a panel's card only.
- The volumetric checker `tests/solid.ts`.

**Branch.** Work starts from `claude/determined-heisenberg-r9mf5w` (or `main` once that branch has merged). Create a new branch for this work. `INTERACTION_REFINEMENTS.md`, this prompt and `.claude/launch.json` may be uncommitted; commit them first on the new branch.

**Environment notes:**
- `npm install` has been run. `worker/api.test.ts` and the classroom e2e test need `drizzle-orm` and `wrangler`. If they can't run, say so.
- Playwright may need `PW_CHROMIUM_PATH` pointing at the cached headless shell under `~/Library/Caches/ms-playwright/chromium_headless_shell-*/`.
- The `ezdxf` Python check is skipped without that package.
- Port 5199 may be taken by another dev server. `.claude/launch.json` has `cutforge-dev` (5199), and the preview moves to the next free port.

## 4. Working approach

- Work milestone by milestone (§7). Each one ends with:
  - `npm run typecheck` (the app part at least: `npx tsc -b --noEmit`);
  - `npm test` and the relevant Playwright specs;
  - a `PROGRESS.md` entry and `DECISIONS.md` updates.
- If time runs out, finish and verify the current milestone rather than leaving several half-built. Milestones 15 and 16 are fixes and should ship first.
- **Reproduce before fixing.** For milestone 16, write a failing test before changing seam code. If the causes listed in the brief turn out wrong, record what the real cause was.
- Where the brief leaves room, choose a reversible default, record it in `DECISIONS.md`, and continue. Stop and ask only when a choice changes what students see in a way the brief doesn't cover.
- Check behaviour in the real app (the browser preview), not only in tests. Take screenshots of new widgets in English and Hebrew in `docs/refine-shots/`.
- Never present an inactive control or placeholder as finished.

## 5. Constraints that apply everywhere

- **One authority.** Everything derives from the `Design` model. Rotation, partial width and divider sets are stored there; what they produce (rotated outlines, trimmed ghosts, spacing) is derived.
- **Layered evaluation** (`POLYGONS_AND_CUTS.md` §3) stays intact. No layer reads from a later one. In particular:
  - Shape rotation belongs to layer 2 (own outline).
  - Floor-panel yaw and partial width belong to layer 4 (frames).
  - Adaptive grow trims are computed **once, when the ghost is committed**, and stored as ordinary wall-sketch corners and inserts. They are not re-derived every solve, so they cannot create a cycle with the panels they were trimmed against.
- **Migration.** Schema v6 → v7 must leave existing projects and both templates exporting **byte-identical SVG and DXF**. Add a v6 project fixture to `tests/golden.test.ts` before changing any geometry code.
- **Clearance once, kerf only at export, nominal model.** Unchanged.
- **Snapping creates no relationships.** It only adjusts the value being dragged (as `snap.ts` says today). Alt turns it off everywhere; Shift gives fine steps where the brief says so.
- **Automatic seams stay automatic.** Seams the student made or changed by hand are kept, and pairs the student unjoined (`noAutoSeams`) stay unjoined.
- **Interface.**
  - Every string goes in `en.ts` and `he.ts`. Keep every existing `data-testid`; give new controls testids.
  - Stage handles never overlap at their default positions. When two would, the one that edits the selection wins.
  - Idle stage at 0 fps, with the Simple quality path. Gizmo and snap work happen only while dragging.

## 6. Scope

Implement the whole brief: `INTERACTION_REFINEMENTS.md` §1–§3.

### 6.1 Answers to the brief's open points

Confirmed by the user on 2026-11-09. Treat them as final.

1. **Rotating floor panels in trays and templates: allowed.** A tray turns as one rigid assembly. A template's floor panel keeps its yaw when template parameters change (regeneration re-applies the stored yaw). Golden exports are unaffected, since the cut file is in each panel's own coordinates.
2. **A hand-dragged divider leaves its set** and keeps its position. The set re-spaces the rest. The divider card shows the set's count and a *Space evenly again* button that brings dragged dividers back into it.
3. **Overlap up to t counts as touching.** It is joined at the contact. A deeper overlap gets the *panels collide* flag, which selects both panels.

### 6.2 Points added or clarified since the brief

- **Grow pill.** The edge's hit target leaves a gap at the midpoint at least as wide as the push-pull arrow on screen, plus 8 px. The pill follows the pointer along the edge, clamped out of that gap. Its `pointerEvents: none` is kept.
- **Fold slider.** It lives in one place: a stage bar at the bottom centre, testid `fold-slider` kept. Remove the copies in View settings and in the panel card. It must not cover the bottom-right buttons or the view cube, and it moves above the inspector on narrow screens.
- **Auto-connection seam identity.** Several seams per pair are allowed. A seam is identified by both edge keys (`a.panelId/a.edge|b.panelId/b.edge`). `connectedPair` in `findOpenSeams` must check edges, not just the pair. `noAutoSeams` stays keyed by pair.
- **Gizmo.** One component in `src/views/widgets.tsx`, used for shapes (in the panel plane) and floor panels (on the floor):
  - a centre pad for free move, and two axis arrows;
  - a ring for rotation: 15° steps, Shift for 1°, Alt to turn snapping off;
  - a typed angle and offset while dragging.
  
  It replaces today's plain shape drag only when a shape is selected; dragging an unselected shape still moves it as now. Grown panels keep the hinge dial and never show the gizmo. In the 2D plan, shapes get the rotation ring only.
- **Rotated shapes.**
  - `Detail.rot` is in degrees around the shape's centre.
  - Arrays rotate as a group around the array's centre.
  - A rotated rounded rectangle exports its arcs rotated (SVG `A` and DXF `ARC` with rotated start and end angles), not flattened.
  - Snapping uses the rotated corners.
  - Align and distribute use rotated bounding boxes.
- **Divider sets.** `Design.dividerSets[id] = { baseId, across, along, height, mode: 'even' | 'size', size? }`. Reconciliation in `solve` makes and removes dividers with stable ids `<set>/a<n>` and `<set>/l<n>`, the same way trays reconcile walls. Half-laps where they cross are kept.
- **Between two faces.**
  - Shift-click adds a face to a two-face pick, kept in the store and not in the design.
  - The pill appears at the second click point, testid `div-between`.
  - It needs parallel faces within 1°, facing each other, on panels that stand on the same base. Otherwise the pill is greyed with the reason.
  - Escape or a plain click clears the pick.
- **Partial width.** `Connection.span?: [s0, s1]` along the parent edge, in mm from the edge piece's start. If absent, the whole edge is used, so old projects are unchanged. Tray walls ignore `span`.
- **Adaptive grow.**
  - The ghost tests the collision with panels in its path using `through.ts`'s projection.
  - It is trimmed to their near faces, plus clearance where they will be joined.
  - The trim is shown on the ghost before commit and stored as wall corners and inserts.
  - It is switched off from the grow card's *Adapt to neighbours* (testid `grow-adapt`).
- **Through-cut editing.** Handles projected onto every panel a through-cut reaches. A drag there edits the source shape. Snap targets for a through-cut include the outlines and shapes of every panel in its path, projected into the source plane.
- **Snap to real outlines.** `snapContext` uses the panel's own outline (vertices and edge midpoints of `panelEdges`), not `0..w × 0..h`. On a rectangle this gives the same targets as today, so existing snap tests must still pass unchanged.

## 7. Milestones

These continue `PROGRESS.md`'s numbering. Each one lists what must be true when it is done.

**15. Grow pill and fold slider.**
- Everything in brief §3 milestone 15 and §6.2 above.
- *Done when:* a Playwright test hovers a wall's right and top edges, drags `pp-width` and `pp-height` from their midpoints, and gets a resize with no grow selection. The *+ Grow* pill is never within the midpoint gap. The fold slider shows on the stage for a card tray and a corrugated tray, hides for plywood, and appears nowhere else.

**16. Reliable auto-connection.**
- A seeded fuzz test (`tests/autoseam.test.ts`) builds random boxes, trays, dividers, leaning panels, notched walls and dragged floor panels. It asserts that every pair of manufactured panels whose slabs touch or overlap (by `tests/solid.ts`) has a connection or a flag. Commit the failing seeds as fixed cases first.
- Then fix the causes found: overlap up to t, several seams per pair, angled edge-on-face, non-convex receivers (brief §3 milestone 16), plus any others the fuzz test finds.
- Add the *X and Y touch but are not joined* message (with a reason) and the *panels collide* flag.
- *Done when:* 500 seeds pass. Every existing seam test and golden export is unchanged, apart from intended changes listed in `PROGRESS.md`.

**17. Move and rotate gizmo (schema v7).**
- `Detail.rot`, floor-panel yaw, the v6 → v7 migration, the gizmo, rotated geometry and export, and snapping for floor-panel moves (to other floor panels' edges, not just the grid).
- *Done when:*
  - a v6 fixture exports byte-identically;
  - a rectangle cut rotated 30° exports the right outline in SVG and DXF (checked by the independent reader where available);
  - a rotated rounded rectangle keeps true arcs;
  - a plywood box rotated 45° on the floor exports the same pieces as unrotated and keeps every joint;
  - an e2e test rotates a shape with the ring, with 15° snap and Shift for 1°.

**18. Dividers.**
- Divider sets (automatic), drag with spacing snaps and compartment sizes, and *Divider between* two faces.
- *Done when:*
  - a 2 × 3 set in a plywood box has half-laps, no overlap (volumetric check) and a clean export check;
  - changing the box width re-spaces the set;
  - dragging one divider takes it out of the set and the rest re-space;
  - Shift-clicking two opposing inner wall faces makes a divider joined at both ends;
  - non-parallel faces grey the pill with its reason;
  - each case works in card and corrugated, which slide-fit with no wall slots.

**19. Adaptive grow.**
- Height and angle snapping on the ghost, partial width with end handles, trimming to neighbours, and optional outline editing on the ghost.
- *Done when:*
  - a lid grown from one wall snaps to reach the opposite wall's top;
  - a half-width wall grown on a base edge has fingers only over its span, with no overlap;
  - a wall grown under a sloped roof commits with a gable that meets the roof and is joined automatically;
  - *Adapt to neighbours* off gives the plain rectangle;
  - the ghost's corner handles edit the outline before commit.

**20. Through-cut editing and snapping.**
- Brief §3 milestone 20 and §6.2 above, plus the live count badge while a polygon is being drawn.
- *Done when:*
  - a through-cut seen on the back wall can be resized and rotated there, changing the source;
  - a through-cut's corner snaps to an edge of a panel it passes through;
  - shapes on a gable wall snap to its apex;
  - the existing snap tests pass unchanged.

## 8. Acceptance checks (automate where practical)

1. **Safety.** Every pre-existing unit test and Playwright spec passes. Golden SVG and DXF exports and v5 and v6 project fixtures are byte-identical, except intended changes listed in `PROGRESS.md`.
2. **Handles.** No two stage handles overlap at their default positions on a plain wall, a gable wall or a tray wall. Push-pull always wins over grow.
3. **Seams.** The fuzz test passes 500 seeds. No pair of touching panels is left unjoined without a message.
4. **Gizmo.** Shapes and floor panels move and rotate with snapping. Rotation survives save and reload, and the export matches.
5. **Dividers.** Automatic, dragged and between-faces dividers work in plywood, card and corrugated, with no overlap and a clean export check.
6. **Grow.** Snapping, partial width and adaptive trims work, and the result is joined.
7. **Through-cuts.** They can be edited from any panel they reach, with snap targets from those panels.
8. **Interface.**
   - Hebrew is fully right-to-left, with no hard-coded strings.
   - New controls have testids.
   - The fold slider is on the stage whenever there is a fold.
   - The idle stage renders 0 fps.

## 9. Final report

Finish with:
- a working build;
- updated `README.md` usage steps (gizmo, divider options, adaptive grow, fold slider), `DECISIONS.md` and `PROGRESS.md`;
- what was implemented and how each item was verified, including which tests could not run here and why;
- for milestone 16, the real causes of missed joints that the fuzz test found;
- a specific list of remaining limitations.

Do not claim a feature that exists only as an inactive control.
