# Prompt for a cloud session: from shapes to folds and boards (milestones 119–133)

Copy everything below the line into a new Claude Code cloud session on `roeeco/cutForge`.

---

You are building the next big feature of CutForge, a React + TypeScript + Vite laser-cut box and folding-carton designer for school students. The feature is a Tinkercad-style workplane where **one click turns the student's shape into a folded card net or a board assembly**, through CutForge's existing dieline engine.

## Where the work is

- **The plan:** `SHAPES_TO_DIELINES_PLAN.md` on branch `claude/shapes-to-dielines-plan`. Read it whole before writing code. Its §9 has the owner's answers, and they override anything else in the plan.
- **The numbers:** `ROADMAP.md` §5.3 on the same branch numbers it R0–R14 = **119–133**.
- **Your base:**
  1. The plan branch sits on `claude/modest-ride-j5iqa3` at `779c3ac` (92–109 and 111).
  2. `claude/bold-archimedes-aib4wy` has milestone 110 (Guided G7) at `3107b6e` or later.
  3. Fetch all three. Start from `claude/shapes-to-dielines-plan`, merge whichever of the other two has newer milestone commits (fast-forward if possible), and work from there.
  4. If the merge conflicts outside the plan files, stop and ask.
- **The shape modeller to port (R1):**
  - **Where:** branch `claude/guided-mode` at `e450c6b` or its parent commits. Do **not** use `claude/waffle-mode` on the remote: it lacks `e450c6b`.
  - **What:** `src/sculpt/**`, the kernel, the outcome registry and their tests, brought over **by path, never by merging** (`ROADMAP.md` §5.2, row 14). Name the source branch and commit in the commit message.
  - **What stays behind:** `src/waffle/**`. The owner said *not the waffle for now*.

## Read first, in this order

1. `SHAPES_TO_DIELINES_PLAN.md`, all of it.
2. `ROADMAP.md` §5: rule 4b (every feature row states Guided, Quick build and Workshop) and §5.2 row 14.
3. `WAFFLE_MODE.md` §3–§4 and §12, and `SKETCH_OVERHAUL.md` §9 on `claude/guided-mode`: how the shape kernel, `faces.ts` and the outcome registry work.
4. `MODEL_MODES_RESEARCH.md` §3: the unfolding method that R5 follows.
5. `DIELINE_DNA_PLAN.md` §4: the engine rules (optional stored fields, no schema bump, goldens, feature rows, `memo`), and the last ~200 lines of `PROGRESS.md`.

## Order and stopping points

1. **R0 (119), the spike.** Record the numbers, then **stop and report them** before R1. They set the face-count limit and decide whether the unfolder needs a Worker.
2. **R1–R8 (120–127), the one-click core.** R1 and R4 can be done in either order. R6 (joints for the material and thickness) must come before R7 and R8.
3. **After R8, stop for the owner to try both buttons.**
4. Then **R9 (Guided pyramid and diamond)**, **R10–R13**, and **R14**.

Stop and ask only when something actually blocks the work. Otherwise take the plan's default and record it in `DECISIONS.md`.

## Rules

- **One commit per milestone,** for example `Milestone 123 (Shapes R4): free boards and seam folds`. Push your branch after each milestone. Never deploy, and never touch `SITE_PASSWORD`.
- **Keep testing light.**
  - Run `npm run typecheck` and `npm test`, and take a short look in the dev server.
  - Run at most the one e2e spec for the milestone. No full e2e sweep, no `SHOTS` specs, and leave the tour alone.
- **Golden exports stay byte-identical** unless the milestone lists a new case. Regenerate them only with `UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts`.
- **Every string goes in `src/i18n/en.ts` and `he.ts`.** The owner checks the Hebrew. Do not plan native-speaker reviews or user studies.
- **SketchForge-3D and layerling are AGPL-3.0.** They are behaviour references only, so never copy or translate their code. The same goes for the GPL unfolders named in `MODEL_MODES_RESEARCH.md`.
- **After each milestone,** add its section to `PROGRESS.md` (Implemented / Verified / Limitations) and its decisions to `DECISIONS.md`. Mark R6's flap, tab and finger sizes as unverified on real stock.
