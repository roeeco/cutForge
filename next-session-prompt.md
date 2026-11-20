# Prompt for the next session (milestones 105–118)

Copy everything below the line into a new Claude Code session on `roeeco/cutForge`.

---

You are continuing CutForge (a React + TypeScript + Vite laser-cut box and folding-carton designer for school students) from where the last session stopped.

## Where the work is

- **Branch:** all work so far is on `claude/bold-archimedes-aib4wy`. Fetch it and continue from its head. If this session was given a different development branch, first `git fetch origin claude/bold-archimedes-aib4wy` and merge it into yours (fast-forward if possible), so nothing from the last session is lost.
- **Built and pushed:** milestones 92–104 and code splitting (20 November). That covers:
  - Quick build's half-done fixes;
  - size intent (`src/model/boxSize.ts`);
  - the sentence builder (`src/sentence/*`, `src/templates/structures/*`, the welcome screen);
  - outline mode;
  - the ported sketch engine (`src/sketch/*`, `src/views/canvas2d.tsx`);
  - the 2D transform frame (`src/views/frameScale.ts`);
  - outline editing in 2D (`src/sketch/edit2d.ts`, `src/views/Edit2D.tsx`);
  - libraries split into their own files, with the 2D cut-plan view, download dialog, teacher view and font parser loaded on first use.
- **Next:** milestone **105** (Guided G2, the mode and the shell). Nothing of Guided beyond G1 (92) is built.

## Read first, in this order

1. `ROADMAP.md` §5: this is the only place the milestones are numbered (92–118). §5.2 settles every conflict between the three plans and overrides them where they disagree.
2. `HANDOFF_105-118.md`: one brief per milestone, checked against the code as of 20 November. Each brief covers what exists to reuse, which plan references are stale, the steps, the feature-table rows for all three levels, the new words, the tests, when it counts as done, and the open questions. If this file is missing, the last session did not finish it: build the briefs yourself from the plans before coding.
3. The plans themselves: `GUIDED_MODE.md` (G2–G7 → 105–110, mock-ups in `docs/guided-mockups/`), `DIELINE_DNA_PLAN.md` (D3a, D3b, D1, D2, D8, D5b, D9, D10 → 111–118), `SENTENCE_BUILDER_PLAN.md` (§8 later items, parked).
4. The last ~300 lines of `PROGRESS.md`: what was built, how it was verified, and the known limitations.

## Order and stopping points

Build in the order of `ROADMAP.md` §5.1. Do not start D4 (closures anywhere), D7 (fold along a line) or the sentence's §8 items, because they wait for the owner.

1. **105–110 (Guided).** Then **stop and wait for the owner to check it** before going on.
2. **111–114** (edge-feature registry, shaped flaps, Nets view, building in the flat).
3. **115–117** (artwork template, board grades, production).
4. **118** (final verification).

Stop and ask whenever a brief's "owner questions" item actually blocks the work. Otherwise take the recommended default and record it in `PROGRESS.md`.

## How each milestone is done (the conventions of this repo)

- **Feature table:** every new control gets a row in `src/easy/features.ts` with its state in Guided, Quick build and Workshop (rule 4b: a level never sees another level's controls by accident). From 105 on, `tests/quickTable.test.ts` checks every mode.
- **Words:** every new string goes in both `src/i18n/en.ts` and `src/i18n/he.ts` (`tests/i18n.test.ts` checks parity). Check Hebrew RTL in the browser.
- **Goldens:** export goldens stay byte-identical unless the change is intended. `UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts` is only for an intended output change, and the reason goes in the commit message.
- **Tests:** add unit tests (`tests/*.test.ts`) and a browser spec (`tests/e2e/*.spec.ts`, using the helpers in `tests/e2e/util.ts`, e.g. `startTemplate(page, id, matId)`) for each milestone.
- **Run before every commit:**
  - `npm test`
  - `npm run typecheck`
  - the specs you touched, run with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test -c pw-app.config.ts <specs> --trace off`
  - the full browser suite (~10 min) at the end of each block
  - the sentence's random walks (`SENTENCE_WALKS` / `STEPS` env) and the fuzz suite when templates or the resolver change.
- **Lazy-loaded parts:** `Plan2D`, `ExportDialog`, `TeacherApp` and opentype.js load on first use. Keep new heavy code in those chunks, and keep `tests/e2e/offline.spec.ts` green, since `App.tsx` prefetches the lazy parts once the editor is up.
- **`PROGRESS.md`:** write an entry per milestone in the existing style: what a student sees, a **Verified** list, and **Limitations**. Update the status line in `ROADMAP.md` §5.1.
- **Commits:** commit and push after each milestone (`git push -u origin <branch>`). Write plain commit messages and don't name any AI model in commits, code or docs.

## Rules

- Do not deploy. Never read, change or print `SITE_PASSWORD` or any secret.
- Do not open a pull request unless the owner asks.
- Do not git-merge `claude/guided-mode`: bring files over by path if needed (ROADMAP §5.2 row 14). Its waffle and sculpt code stays on its own PR.

## Still waiting for the owner from the last session

- Review of the Hebrew sentence words (`sen.*`, e.g. קרטון).
- The default sentence on the welcome screen.
- A touch-screen check of the 2D editing and the transform frame.
- A known bug, queued as a separate task: a rounded box with a hinged lid fails an export invariant.

Start by reading the files above, then say in a few lines which milestone you are starting and which owner questions (if any) block it.
