// QA repros: Quick build (REPORT.md §11, C8). Fixed by milestone 143 (QA_FIX_PLAN.md Q9).
import { describe, expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { boxPlan, measureYield, planSaveMaterial } from '../../src/model/split';
import { settle } from './promises';

describe('C8: Use less board keeps No glue', () => {
  it.fails('a card box with slit-lock corners gets no glue joints from Use less board', () => {
    const d = ops.createDesign(MATERIALS[0]);
    const base = ops.addRootPanel(d, 0, 0, 150, 100);
    ops.addTray(d, base, 45);
    settle(d);
    // No glue: slit locks at every corner (DesignSettings' switch)
    ops.setAllJoints(d, 'corner', 'lock');
    settle(d);
    const glue = () => Object.values(d.connections).filter((c) => c.kind === 'glue').length;
    expect(glue()).toBe(0);
    const plan = planSaveMaterial(d, ops.solve, (x) => measureYield(x, boxPlan));
    expect(plan).not.toBeNull();
    ops.applySavePlan(d, plan!.cuts);
    settle(d);
    // today: each fold cut becomes a glue joint, and No glue still shows ticked
    expect(glue()).toBe(0);
  });
});
