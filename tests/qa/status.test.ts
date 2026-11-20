// QA repros: status that tells the truth (REPORT.md #1, H2). Fixed by milestone 137 (QA_FIX_PLAN.md Q3): `val.empty`.
import { describe, expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { blockers } from './promises';

describe('#1 / H2: an empty design is not ready to cut', () => {
  for (const m of [MATERIALS[0], MATERIALS[3]])
    it(`${m.id}: nothing to cut is a blocking problem`, () => {
      // today: no blocking problem, so Guided's Send shows "Ready to cut ✓" and offers the download
      expect(blockers(ops.createDesign(m)).length).toBeGreaterThan(0);
    });
});
