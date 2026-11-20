// QA repros: curved walls and lids (REPORT.md §7 and §11). Fixed by milestone 138 (QA_FIX_PLAN.md Q4: one rulebook,
// and curved combinations gated with a reason until curved walls are structural).
import { describe, expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { roundedMin } from '../../src/easy/recipes';
import { lidWhy } from '../../src/easy/lid';
import { validate } from '../../src/model/validate';
import { settle } from './promises';

const PLY = MATERIALS[3];

function roundedBox(r: number, H = 40, W = 135, D = 66) {
  const d = ops.createDesign(PLY);
  const base = ops.addRoundedRect(d, 0, D, W, D, r)!;
  const t = ops.addTray(d, base, H)!;
  settle(d);
  return { d, base, t };
}

describe('§11 (I1, I11): one minimum bend radius', () => {
  it("the card's minimum and the export check agree", () => {
    const min = roundedMin(PLY, 40);
    // the export check's answer for each radius from well below to the card's minimum
    const passes = [16, 17, 18, 19, 20, 21, min].filter((r) => !validate(roundedBox(r).d).some((i) => i.key === 'val.bendTight'));
    // today: the card asks for 21.5 mm, while the export check already passes at 19 mm
    expect(Math.min(...passes)).toBe(min);
  });
});

describe('C1: a hinged lid is offered only where it closes the box', () => {
  it('a rounded box: Hinged is greyed with a reason (gated, QA_FIX_PLAN.md S6)', () => {
    const { d, t } = roundedBox(25);
    // today: offered (no reason), and the lid made is a rectangle over part of the opening
    expect(lidWhy(d, t, 'hinged')).not.toBeNull();
  });
});

// I9 (an arched lid offered on a rounded box, then not made) does not show in the model: lidWhy and setBoxLid agree
// at every size tried. The card's path is checked by the truth spec instead (QA_FIX_PLAN.md O2).
