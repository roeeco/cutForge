# CutForge: polygons, cuts and corrugated joints: implementation prompt

## 1. Goal

Extend CutForge so students can:

- sketch **polygon bases** and **reshape walls**;
- **extrude** a base into a tray;
- **add or subtract shapes** anywhere on a panel, including notches at its edges;
- **cut straight through the whole design** with one live shape;
- build **corrugated** boxes with tab-and-slot corners, lock tabs and **fold-over (double-wall) reinforcement**.

Every one of these keeps CutForge's central rule: one model, edited directly in the 3D view and the cut plan, with no regeneration step.

The audience and limits are unchanged from `laser-fabrication-editor-agent-prompt.md`:
- high-school students on school Chromebooks, 75-minute lessons;
- Hebrew and English;
- LightBurn exports.

This is still a panel-and-sheet tool. Do not add a solid-modeling kernel. When a choice is unclear, prefer the version a 14-year-old can use correctly on the first try.

## 2. Read first

The decisions are already made. This prompt orders the work and adds the details found since.

| File | What it gives you |
| --- | --- |
| `POLYGONS_AND_CUTS.md` | **Binding spec** for Part A: concept, layered pipeline, edge keys, trays, joints at any angle, through-cuts, schema v6, milestones. |
| `CORRUGATED_JOINTS.md` | Research and proposal for Part B. Its open questions (§5) are answered in §6.2 below. |
| `DECISIONS.md` | Every rule already in force. In particular: clearance applied once per connection, outer dimensions, seating, the three-panel corner rule, the **hinge angle** and **buildable angles** entries, and the joints display. |
| `PROGRESS.md` | What is built and verified. Add a section per milestone here. |
| `VISUAL_OVERHAUL.md` §12 | Interface constraints: keep every `data-testid`, i18n completeness, Chromebook performance budget, accessibility. |
| `src/model/hinge.ts` | The 360° hinge angle and the buildable-angle rules (`checkHinge`), described in §3. |

## 3. Starting state

Built and working; do not redo it:

- Milestones 1–6 and the visual overhaul (see `PROGRESS.md`).
- **The 360° hinge dial.** It replaced Up/Down.
  - Students see 0–360°: 90 upright, 180 flat, 270 on the other face.
  - The model still stores `angle` + `dir` (Up a = a, Down a = 360 − a). `fromHinge` / `hingeOf` convert between the two.
  - `checkHinge` gives each angle a zone, used by the card dial (`src/ui/AngleDial.tsx`) and the stage knob (`AngleArc` in `src/views/widgets.tsx`):
    - **red** (blocking): within 10° of lying on the parent, or below the floor;
    - **amber** (a note only): plywood leaning without side walls, plywood leaning outward (glued edge only), flat;
    - **green**: everything else.
  - Plywood off 90° now allows `butt` too (`connectionsFor`). A selected grown panel shows a small knob at its hinge.
- **Joints display.** Joint pills on the stage are off by default (`viewPrefs.joints`, toggle `toggle-joints`).
  - The panel card shows the angle at the top level (`PanelHinge`).
  - The joint list and open seams are in a collapsed *Joints (advanced)* section (`JointsAdvanced`).
  - A *Connect all* notice appears above that section when panels meet without a joint.

That work may still be uncommitted on `visual-overhaul`. Before starting, commit it there (or ask the user to), then create a new branch for this work from that point.

**PROGRESS.md is behind:** its overhaul section still mentions the flip badge and dial detents. Add a short *Hinge dial and joints display* section first.

**Environment notes:**
- `worker/api.test.ts` needs `drizzle-orm`, and the classroom e2e test needs `wrangler`. Neither is installed here; run `npm ci` if you can, otherwise say they weren't run.
- Playwright may need `PW_CHROMIUM_PATH` pointing at the cached headless shell under `~/Library/Caches/ms-playwright/chromium_headless_shell-*/`.
- The `ezdxf` Python check is skipped without that package.
- Another session may be running a dev server on port 5199. `.claude/launch.json` has `cutforge-alt` on port 5207.

## 4. Working approach

- Work milestone by milestone (§7). Each one ends with:
  - `npm run typecheck` (the app part at least: `npx tsc -b --noEmit`);
  - `npm test` and the relevant Playwright specs;
  - a `PROGRESS.md` entry and `DECISIONS.md` updates.
- If time runs out, finish and verify the current milestone rather than leaving several half-built.
- Where the briefs leave room, choose a reversible default, record it in `DECISIONS.md`, and continue. Stop and ask only when a choice changes what students see in a way the briefs don't cover.
- Check behaviour in the real app (the browser preview), not only in tests. Take screenshots of new widgets in English and Hebrew.
- Never present an inactive control or placeholder as finished.

## 5. Constraints that apply everywhere

- **One authority.** Everything derives from the `Design` model. A through-cut is stored once, on its source panel; its effect on other panels is derived and never stored. Tray walls are real panels, created and removed by reconciliation, with stable derived ids (`POLYGONS_AND_CUTS.md` §6).
- **Layered evaluation** (`POLYGONS_AND_CUTS.md` §3):
  1. sketch;
  2. own outline;
  3. growable edges;
  4. frames, wall sets and trays;
  5. through-cuts from other panels;
  6. joints;
  7. final outline and fragments.

  No layer reads from a later one. Through-cuts never move a panel or create growable edges on another panel.
- **Clearance once, kerf only at export, nominal model.** Unchanged. Fold-over lock slots follow CutForge's clearance rule, not foldform's +2c.
- **Migration.** Moving to schema v6 must leave existing v5 projects and both templates exporting **byte-identical SVG**. Build golden files before changing any geometry code.
- **Hinge angles generalise.**
  - `hasSideWalls` / `addSideWalls` currently use `(edge ± 1) % 4`. They must use the neighbouring edges of the polygon outline.
  - `checkHinge` must work on any straight edge, sloped ones included.
  - The dial, zones and stage knob work unchanged on polygon edges.
- **Interface.**
  - Every string goes in `en.ts` and `he.ts`. Keep every existing `data-testid`; give new controls testids.
  - New joint details go inside *Joints (advanced)*, not on the stage, unless they are warnings.
  - Idle stage at 0 fps, with the Simple quality path.
- **Reuse.** Foldform is the owner's code and may be adapted. Record each adapted file in `THIRD_PARTY.md` with its repository, commit and licence.

## 6. Scope

### 6.1 Part A: polygons and cuts (binding, from `POLYGONS_AND_CUTS.md`)

Implement the whole brief: decisions table §2, pipeline §3, edge keys §4, wall outlines §5, trays and wall sets §6, joints at any angle §7, through-cuts §8, fragments §9, tools §10, schema v6 §11.

Points added or clarified since the brief:

- **Wall-to-wall corner angles** (`POLYGONS_AND_CUTS.md` §7: 30°–150° for fingers, tabs and flaps) are a separate rule from the grow hinge in `hinge.ts`. Keep both. Use the hinge zones for growing, and the corner range for which seam kinds are offered.
- **Corrugated corners default to tab-and-slot** on closing seams, at any corner angle in range. Today `seamKinds` doesn't offer tab-and-slot on corrugated corners; add it in milestone 8. It also serves Part B.
- **Tray walls on edges shorter than 5 mm stay open.** "Always walled" is otherwise binding (§6), including the watch-out in §16. Add the hint-bar message from §16 when a Cut shape on a tray base touches a walled edge.
- **Live through-cut preview.** While drawing with *Cut through* on, highlight the panels it will hit and show "Cuts N panels". This is required, not optional; it is the mitigation for cutting through the whole design.
- **Polygon tool** shortcut `G`; the n-gon mode lives on the tool's floating card. On a panel, a polygon shape is stored like `path` (unit box). On the floor it creates a base.
- **Op row:** Add · Cut · Engrave · Score, plus a *Cut through* toggle that is visible only for Cut. The existing `op-*` testids stay; add `op-add` and `op-through`.

### 6.2 Part B: corrugated tab-and-slot and fold-over (from `CORRUGATED_JOINTS.md`)

> **Provisional:** the six answers below are Claude's recommendations, made when this prompt was written and not yet confirmed by the user. Confirm or edit them before handing this prompt off.

1. **Fold-over is an edge feature, not a liner panel.** Add `Panel.foldOvers[]` with `edge` (an edge key after schema v6), `depth` (null = down to the base, or a partial hem), `lock: 'glue' | 'tabs'`, `locks`, `lockDepth`. Geometry is a `ConnGeom` made by `foldOverGeom` and merged in `panelExtras`. The flat net needs no change.
2. **Lock modes:** glue, and tabs through slots in the base (foldform's `fold-over-lock`). No tabs into the wall's own strip yet.
3. **Crease style:** plain score lines on the SCORE layer. Two scores bound the rim strip (2t + fa), and there is one at each tab's root. No "crush" band and no per-material `scoreStyle` yet; record this as a later option.
4. **Flute direction:** warn only. In the export check and the fold-over card, warn when a fold-over score runs across the flutes on 4 mm board. The packer is unchanged.
5. **Cut-through shapes on a wall with a liner** also cut the liner where they overlap it, aligned automatically. Engrave and score shapes stay on the outer wall only.
6. **Order:** corrugated tab-and-slot on closing seams ships in Part A (milestone 8). Fold-over and through tabs come after Part A, so they use edge keys from the start.

Geometry and defaults:

- Rim strip `2t + fa` with a score at each edge of the strip. `fa` is the material's `foldAllowance`, which equals foldform's `max(0.3, round(1.25t/0.05)·0.05)`.
- Liner `h − t` (full) or `depth` (partial hem, at most 0.45h). It is shortened by t at each end where a neighbouring wall meets it, and by 2t where that neighbour also has a fold-over.
- Lock tabs: trapezoid with sides tapered by 18% of the tab width.
  - Width: clamp(0.16L, max(4, 3t), max(14, 6t)).
  - Count: two tabs at 0.3L and 0.7L when they fit, otherwise one at 0.5L.
  - Depth: `t + max(4, 1.5t)`.
- Slots: the projection of each tab plus c/2 all round (clearance once). Each slot is set back so its web to the base edge is at least `minWeb`.
- Through tabs on tab-and-slot: `tabLen: 'flush' | 'through'`. A through tab is `t + lockDepth` long, with a score at the receiver's far face, and folds under.
- Minimum tab width on corrugated: max(4 mm, 3t).
- 3D:
  - the liner on the wall's inner face;
  - a rounded rim bead, reusing the fold-bead look;
  - tabs drawn through the base;
  - the fold slider unfolds the liner.
- Fold-over is offered only on card and corrugated, and only on a free edge. Its controls live in the panel card. Default lock: tabs on corrugated, glue on card.
- Validation:
  - error: wall height ≤ 2t;
  - error: lock depth > 0.6h;
  - error: edge < 2c + 2 mm + 2 × tab width;
  - warning: c < 0.75t;
  - error: hem > 0.45h;
  - liner collisions, via the existing volume check;
  - slot web < `minWeb`;
  - the flute warning from point 4.

## 7. Milestones

These continue `PROGRESS.md`'s numbering. Each one lists what must be true when it is done.

**7. Foundation (schema v6).**
- Add the sketch type, edge keys (`e<n>`, `face`, `<detail>.<i>`, `#n` pieces) and the migration.
- Generalise `frame.ts`, `seams.ts`, `geometry.ts`, `pieces.ts`, `hinge.ts`, `hasSideWalls` / `addSideWalls`, and the inspector's *Grow from* buttons to keyed edges.
- *Done when:* rectangles behave exactly as before, every existing test passes, and golden SVGs (both templates, the e2e fixtures, and a v5 project file) are byte-identical.

**8. Polygon bases.**
- Polygon and n-gon tools; vertex editing on bases.
- Grow from any straight edge with the existing hinge dial and zones.
- Seams at any corner angle: tab-and-slot (including corrugated closing seams), glue, butt; then angled fingers (`t / sin α`).
- *Done when:* a hexagon plywood tray built by hand has each corner's material occupying the volume at most once, the gap matches `t·|cot α|`, and the export check is clean. A corrugated hexagon tray connects with tab-and-slot corners.

**9. Add/Cut on outlines.**
- The `add` op; cuts as notches; joints re-lay over the remaining contact; fragments as pieces with warnings; growable shape edges; wall sets (split and merge, broken orphans).
- *Done when:* the L-notch, middle-notch and vertex insert/delete tests from `POLYGONS_AND_CUTS.md` §14 pass.

**10. Extrude and trays.**
- Extrude card with a ghost tray and push-pull height; a shared height with per-wall overrides; `openEdges` with *Wall it*; automatic walls on new edges; edges under 5 mm left open.
- Card: walls fold from the base, with glue-flap corners. Corrugated: tab-and-slot corners. The crease loop rule applies.
- *Done when:* a card hexagon tray unfolds into one net, and push-pull on one wall changes them all.

**11. Wall outline editing.**
- Corner offsets and inserts on free edges (the attached edge is locked).
- Growing from sloped edges, with hinge zones on those edges.
- *Done when:* a gable wall carries a roof panel grown from its sloped edge, and the joints re-lay when the gable changes.

**12. Through-cuts.**
- Prism projection: parallel, oblique (swept) and edge-on (strips).
- Live highlight with "Cuts N panels"; linked selection; approximated-bevel and removed-panel flags.
- *Done when:* the chamfer test in §14 of the brief passes, and the base-hole-through-divider case shows its highlight before commit.

**13. Corrugated locks.**
- Through tabs on tab-and-slot, and the flute-aware minimum tab width.
- *Done when:* a corr-4 tray with through tabs exports slots of (t + c) × (w + c) and through-tab scores at the receiver's far face.

**14. Fold-over reinforcement.**
- Everything in §6.2.
- *Done when:*
  - a corr-1.6 tray with fold-over and lock tabs on all walls makes one net per wall-and-base piece;
  - liners don't collide at inside corners;
  - slots keep at least `minWeb`;
  - the 3D liner and rim show and unfold with the slider;
  - a handle hole cut through a reinforced wall also cuts the liner.

## 8. Acceptance checks (automate where practical)

1. **Rectangle safety.**
   - Every pre-existing unit test and Playwright spec passes.
   - v5 projects migrate and export byte-identical SVG.
2. **Polygons.**
   - A polygon base drawn by clicks (Shift for 15° steps, typed segment lengths) and an n-gon (3–12 sides) both extrude into a tray.
   - Moving a base vertex re-angles the adjacent walls and re-lays their joints. Inserting a vertex splits a wall, and its shapes go to the half that contains their centre.
3. **Shapes.**
   - A Cut crossing an edge makes a notch; inside, a hole.
   - An Add joins the outline.
   - Cuts beat Adds whatever the order they were drawn in.
   - A notch in a jointed edge re-lays the fingers on both panels, or flags "too little contact".
4. **Through-cuts.**
   - The front-wall triangle chamfers the front and back walls and trims the left wall's top.
   - The joints re-lay.
   - Moving the source shape updates every panel.
   - Deleting it restores every panel.
5. **Fragments.** A cut that splits a panel gives *(1/2)*, *(2/2)* pieces with a warning. A panel fully removed is flagged and ghosted, not deleted.
6. **Hinge on polygon edges.** Hinge zones and side-wall offers work on polygon and sloped edges. Red appears only for "lies on the parent" and "below the floor".
7. **Corrugated.** Tab-and-slot corners at 120°, through tabs, and fold-over all export with clearance applied once and slot webs of at least `minWeb`, and an independent reader confirms the export when available.
8. **Interface.**
   - Hebrew is fully right-to-left, with no hard-coded strings.
   - New controls have testids.
   - Joint details for new kinds are in *Joints (advanced)*.
   - The idle stage renders 0 fps.

Digital checks are not physical proof. Fold-over and lock fits need a test cut on the classroom's board.

## 9. Final report

Finish with:
- a working build;
- updated `README.md` usage steps (polygon tool, extrude, Add/Cut/Cut through, fold-over), `DECISIONS.md`, `PROGRESS.md` and `THIRD_PARTY.md`;
- what was implemented and how each item was verified, including which tests could not run here and why;
- a specific list of remaining limitations. Expected ones: refitting arcs after booleans, a per-cut depth for through-cuts, a crush-score style, and flute-aware packing.

Do not claim a feature that exists only as an inactive control.
