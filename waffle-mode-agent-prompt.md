# CutForge: waffle mode, implementation prompt (cloud session)

## 1. Goal

Build **waffle mode** as specified in `WAFFLE_MODE.md` (milestones 49–54). Waffle mode is a second CutForge design type:
1. The student builds a solid from primitives (Solid/Hole and groups) and from sketches that are extruded or revolved.
2. CutForge cuts it into two crossing families of slotted slices that always slide together.
3. Optionally the slices stand in a base plate. Every part is labelled, and there is an assembly-steps view.

The cut plan, materials, packing and SVG/DXF export are the ones box designs already use.

The audience is unchanged: high-school students on school Chromebooks, in Hebrew and English, exporting to LightBurn. When the spec leaves a choice open, prefer the version a 14-year-old gets right on the first try.

## 2. Read first

| File | What it gives you |
|---|---|
| `WAFFLE_MODE.md` | **The spec you build to.** It covers the interview decisions (§1), architecture and branch points (§3), the data model (§4), the Shape stage (§5), the Waffle stage including the slot algorithm (§6), export (§7), materials (§8), milestones with what "done" means (§9), and risks (§10). |
| `MODEL_MODES_RESEARCH.md` | Background: §1 says what MocknSlice got wrong, and §2 has the slicing references and rules. Read it once; don't re-research. |
| `README.md`, `DECISIONS.md` | How the app works today and every rule in force: units, frames, pieces, export, editing conventions. |
| `POLYGONS_AND_CUTS.md`, `EASY_MODE.md`, `GIZMO_JOINTS_FLAPS.md` | The polygon tool and outline handles that the sketch builds on, the Quick build *Box* drag that shape placing copies, and the gizmo to extend. |
| `VISUAL_OVERHAUL.md` §12 | Interface rules: keep every `data-testid`, complete i18n, the Chromebook performance budget, accessibility. |
| `THIRD_PARTY.md` | The licence rule: copy only MIT/BSD/Apache/ISC/BSL code, and record it. GPL and AGPL projects are behaviour references only. |
| `PROGRESS.md` | Its format. Add one section per milestone. |

## 3. Starting state

- **Branch:** `claude/waffle-mode`, cut from `main` at `c47c273` (milestone 43; the tour is switched off). Commit and push to this branch. The two plan files and this prompt are already committed on it.
- **`main` doesn't have** milestones 44–48 (dividers that find their own ends, curved walls, bend patterns, strips, arched lids). They live on the parked branch `origin/claude/charming-einstein-lqhfxq` and are **not** to be merged. Take exactly the two pieces `WAFFLE_MODE.md` §3.5 names:
  - `src/geom/arcfit.ts`, byte-identical;
  - the rounded-corner maths, re-written as `src/sculpt/round.ts`.
- **Schema:** `main` is at `SCHEMA_VERSION` 9. **Don't bump it** (§3.4): the parked branch already uses 10–14.
- **Environment:**
  - Run `npm ci`. Playwright may need `npx playwright install chromium`, or `PW_CHROMIUM_PATH`.
  - The Worker, classroom specs and the Python `ezdxf` check may not run here. Say so in `PROGRESS.md` rather than fixing the environment.
  - The dev server is `npm run dev` on port 5199 (`.claude/launch.json` → `cutforge-dev`).

## 4. Rules

1. **Box designs don't change.** Every existing unit test keeps passing and `tests/golden.test.ts` stays green. Never run `UPDATE_GOLDEN=1`. If a waffle change would move a box export, find another way.
2. **Never deploy or touch secrets.** No `npm run deploy`, `wrangler deploy` or `npm run db:migrate`, and nothing involving `SITE_PASSWORD` or any other Worker secret.
3. **Licences.**
   - `manifold-3d` is Apache-2.0: pin the exact version and record it in `THIRD_PARTY.md`.
   - Copy `arcfit.ts` byte-identical and note it in `THIRD_PARTY.md` and `DECISIONS.md` (it is the owner's own code).
   - Don't open Lamina, MakeSlice, OpenSlicer Studio or the Blender addons to translate their code. Their behaviour is described in the research file.
4. **Every new string in `src/i18n/en.ts` and `src/i18n/he.ts`.** Write natural, simple Hebrew. The i18n coverage test must pass.
5. **CutForge conventions.**
   - Every new thing is a ghost first, with a floating ✓ (Enter) and ✕ (Esc). One ✓ is one undo step.
   - Model changes are pure Design → Design functions (`src/sculpt/ops.ts`, `src/waffle/ops.ts`) that go through the existing store history.
   - New controls get a `data-testid`.
   - Units are mm and the world is y-up.
6. **Test lightly** (the owner's standing preference):
   - each milestone: `npm run typecheck`, `npm test`, and a quick look in the dev server;
   - the milestone's unit tests as listed in §9;
   - Playwright: only `tests/e2e/waffle.spec.ts` (milestone 54), with `npx playwright test -c pw-app.config.ts tests/e2e/waffle.spec.ts`;
   - no full e2e sweeps, no `SHOTS=1` screenshot specs, and skip the tour;
   - if an unrelated test fails, note it in `PROGRESS.md` and move on.
7. **Speed.** The target is under 50 ms per edit for 20 shapes and 2 × 8 slices (§10.2). Measure it in a unit test that logs the time but doesn't fail CI. If it is far over, move the derivation to a Worker as §10.2 describes.

## 5. Working approach

- Build milestones 49 → 54 in order, split into parts where that helps.
- **Commits:** one per part, with messages in the house style: `Milestone 49 (part 1): waffle designs, kernel and primitives`. Follow your session's attribution rules for the trailer.
- **At the end of each milestone:**
  - typecheck and `npm test`;
  - a `PROGRESS.md` section saying what was built, what was verified and how, and what was **not** verified;
  - `DECISIONS.md` entries under a new heading `## Waffle mode (see WAFFLE_MODE.md)`;
  - push.
- **Where the spec leaves room,** pick a reversible default, record it in `DECISIONS.md`, and keep going. No one is available to answer questions during this session.
- **Where the code disagrees with the spec** (an API differs, a step is impossible as written), adapt it. Write what changed and why in a new last section of `WAFFLE_MODE.md`, `## 12. Notes from building`. Don't diverge silently.
- **If you are running low on context or time,** finish and verify the current part rather than leaving several half-built. Write handover notes in `PROGRESS.md` (what's next, open issues, anything surprising), then push.

## 6. Stop conditions

In each case: push, explain in `PROGRESS.md` and `WAFFLE_MODE.md` §12, and end the session.

- **The milestone 49 spike fails:** after a solid try, `manifold-3d` can't be bundled by Vite 8, can't load in the Playwright browser, or can't run under Vitest. **Don't** switch to the §10.1 fallback yourself; that is the owner's call.
- **A box export would have to change** (`tests/golden.test.ts`) and there is no way around it.
- **The next step needs** a deploy, a secret, a paid service, or a change to what students see that the spec doesn't cover.

## 7. Notes per milestone (on top of `WAFFLE_MODE.md` §9)

**Milestone 49:**
- **The spike comes first.**
  - `npm i -E manifold-3d@3.5.4`.
  - Load it only through a dynamic `import()` in `src/sculpt/kernel.ts`. With Vite the usual pattern is `import wasmUrl from 'manifold-3d/manifold.wasm?url'`, then `Module({ locateFile: () => wasmUrl })`, then `setup()`. Confirm against the package.
  - Check `npm run build`:
    - the WASM ends up in its own asset;
    - the entry chunk does not grow;
    - record the gzipped sizes.
  - Check that it runs under Vitest, and loads in `npm run preview` with headless Chromium.
  - Safari and a real Chromebook can't be checked here: list them as *not verified, needs the owner*.
- **The kernel:**
  - `scope()`, with a live-object counter that tests can read;
  - the cache key from the shape tree;
  - circle segments for 0.02 mm chord error.
- **Shapes:** all eight primitives are built from `CrossSection`s as §3.2's table says. Box and prism corner radii come from `src/sculpt/round.ts`.
- **The 3D view:** `SculptView3D` is a new component. Reuse `Gizmo` (`src/views/widgets.tsx`) and the board-size arrows where you can, but don't make `View3D.tsx` aware of waffle designs beyond the switch in `App.tsx`.

**Milestone 50:**
- The sketch tool reuses `src/views/polyTool.tsx`'s drawing logic. Factor shared parts out rather than copying them.
- Snapping is 30° steps by default, with Alt for free drawing. The box polygon tool keeps its current 15°-with-Shift behaviour.

**Milestone 51:**
- The Plan2D adapter must leave the box path byte-for-byte identical in behaviour.
- Waffle pieces call `refitArcs` themselves; don't add it to `prepareExport`.

**Milestone 52:**
- Write the assembly property as a unit test over every fixture: along every crossing line, the material A keeps lies at or below the split height, and the material B keeps lies at or above it.
- Fixtures: sphere, torus, the L-extrusion with a 30° chamfer, the vase, and a shape with a thin neck.

**Milestone 53:**
- The pole of inaccessibility is our own short implementation (iterative grid refinement); don't add a dependency for it.

**Milestone 54:**
- The single e2e spec: start a waffle sculpture, add a box and a cylinder hole, group them, go to stage 2, export SVG, and check the number of parts in the file.
- `README.md` gets a *Waffle mode* section in the same voice as the rest.

## 8. Pull request

Once milestone 49 is pushed, open a **draft** pull request from `claude/waffle-mode` into `main`, titled *Waffle mode (milestones 49–54)*:
- The body has a short summary, a checklist of the six milestones, and the not-verified list.
- Tick the checklist as milestones land.
- Keep it a draft. Never merge it or enable auto-merge.

## 9. Done means

- All six milestones are built, each with its `PROGRESS.md` section, and with `DECISIONS.md` and `THIRD_PARTY.md` up to date.
- The draft PR is up to date.
- `PROGRESS.md` ends with one list of everything that still needs the owner, for example: Safari, a real Chromebook, a real laser cut of a plywood and a corrugated waffle, and Hebrew wording review.
