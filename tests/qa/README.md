# QA repros (milestone 134, `QA_FIX_PLAN.md` Q0)

One test per finding of the browser QA of 2026-11-20 (`docs/cutforge-browser-qa-2026-11-20/REPORT.md`) that can
be shown in the model, plus the promise checks they share (`promises.ts`).

- A finding that is still open is written as **`it.fails(...)`**: it states what *should* be true, it fails today,
  and Vitest counts that as a pass, so `npm test` stays green.
- The milestone that fixes it changes `it.fails` to `it`. If a fix lands by accident, Vitest reports the `it.fails`
  as an unexpected pass: flip it then.
- Each test names its finding (report reference) and the milestone meant to fix it.
- **`copy.test.ts`** is a ratchet: it lists today's offenders and fails when a new one appears **or** when a listed
  one is fixed, so the list can only shrink.

Findings that only show in the browser (the level switch, gizmo colours, overlapping labels) are not here; they are
checked by the truth spec (`tests/e2e/truth.spec.ts`, milestone 145) and by `BROWSER_TEST_PLAN.md`.
