// 26 November (the owner): joint kinds offered only where the design's construction takes them, and glue flaps the
// default on card and 1.6 mm board.
import { describe, expect, it } from 'vitest';
import { MATERIALS, gluesByDefault } from '../src/model/materials';
import { TEMPLATES, defaults, generate, templateById } from '../src/templates/registry';
import { allowedKinds, dividerKind, groupKinds, ownGroupJoints } from '../src/model/jointDefaults';
import { addDivider, addRootPanel, addTray, autoConnect, createDesign, setAllJoints } from '../src/model/ops';
import { trayKinds } from '../src/model/trays';
import { seamKinds } from '../src/model/seams';
import { validate } from '../src/model/validate';
import { groupKindWhy, jointKindWhy } from '../src/easy/jointWhy';
import { NOTE_KEYS } from '../src/easy/notes';
import type { Design } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
const problems = (d: Design) => new Set(validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => `${i.key}|${JSON.stringify(i.vars)}`));

describe('glue flaps by default on card and 1.6 mm board', () => {
  it('which boards glue by default', () => {
    expect([CARD, CORR16, CORR4, PLY].map(gluesByDefault)).toEqual([true, true, false, false]);
    // greyboard is card: glued too
    expect(gluesByDefault({ kind: 'card', thickness: 2 })).toBe(true);
  });

  it('corners, edges on a face and new trays start glued; 4 mm board keeps tabs, plywood fingers', () => {
    for (const m of [CARD, CORR16]) {
      expect(seamKinds(m, 'corner')[0]).toBe('glue');
      expect(seamKinds(m, 'face')[0]).toBe('glue');
      expect(trayKinds(m).cornerKind).toBe('glue');
      expect(dividerKind(createDesign(m))).toBe('glue');
    }
    expect(seamKinds(CORR4, 'corner')[0]).toBe('tabslot');
    expect(trayKinds(CORR4).cornerKind).toBe('tabslot');
    expect(dividerKind(createDesign(CORR4))).toBe('tabslot');
    expect(trayKinds(PLY)).toEqual({ wallKind: 'finger', cornerKind: 'finger' });
    // tabs stay one choice away on thin board
    expect(seamKinds(CORR16, 'corner')).toContain('tabslot');
  });

  it.each([CARD, CORR16])('$id: a box with a divider is glued throughout, cleanly', (m) => {
    const d = createDesign(m);
    const base = addRootPanel(d, 0, 0, 140, 90);
    addTray(d, base, 50);
    autoConnect(d);
    const div = addDivider(d, base, 'e0', 45, 40)!;
    autoConnect(d);
    const seams = Object.values(d.connections).filter((c) => !c.grown && c.kind !== 'closure');
    expect(seams.length).toBeGreaterThan(4);
    expect(seams.every((c) => c.kind === 'glue' && !c.broken)).toBe(true);
    expect(seams.filter((c) => c.a.panelId === div || c.b.panelId === div).length).toBeGreaterThanOrEqual(2);
    expect(validate(d).filter((i) => !NOTE_KEYS.has(i.key))).toEqual([]);
  });
});

describe('joint kinds the construction takes', () => {
  it('a carton: the corners its net folds keep their fold; every other kind is greyed as held', () => {
    const d = generate(templateById('carton')!, CARD, defaults(templateById('carton')!));
    const folded = Object.values(d.connections).filter((c) => !c.grown && c.kind === 'fold');
    expect(folded.length).toBe(3);
    for (const c of folded) for (const k of allowedKinds(d, c)) expect(jointKindWhy(d, c.id, k)?.key, `${c.id} ${k}`).toBe('conn.why.held');
    // its glued seam takes any corner kind
    const seam = Object.values(d.connections).find((c) => !c.grown && c.kind === 'glue')!;
    expect(jointKindWhy(d, seam.id, 'lock')).toBeNull();
  });

  it('a kind that would leave a problem is greyed with the check it fails', () => {
    const d = generate(templateById('scoopTray')!, PLY, defaults(templateById('scoopTray')!));
    const w = groupKindWhy(d, 'base', 'tabslot');
    expect(w?.key).toBe('joints.why.problem');
    expect(w?.issue?.key).toBe('val.slotEdge');
    // the kind the joints already have is always offered
    expect(groupKindWhy(d, 'corner', 'finger')).toBeNull();
  });

  it('every kind still offered, in every template and material, is taken by its joints and leaves no new problem', { timeout: 600_000 }, () => {
    let offered = 0, greyed = 0;
    for (const m of MATERIALS)
      for (const t of TEMPLATES) {
        if (t.status === 'planned' || !(t.canMake ? t.canMake(m) : t.materials.includes(m.kind))) continue;
        const d0 = generate(t, m, defaults(t));
        const before = problems(d0);
        for (const g of ['base', 'corner'] as const)
          for (const k of groupKinds(d0, g)) {
            if (groupKindWhy(d0, g, k)) {
              greyed++;
              continue;
            }
            offered++;
            const d = structuredClone(d0) as Design;
            setAllJoints(d, g, k);
            autoConnect(d);
            const own = ownGroupJoints(d, g);
            if (own.length) expect(own.some((c) => c.kind === k), `${t.id} ${m.id} ${g}=${k} taken`).toBe(true);
            expect([...problems(d)].filter((p) => !before.has(p)), `${t.id} ${m.id} ${g}=${k}`).toEqual([]);
          }
      }
    // most kinds are offered; some are not
    expect(offered).toBeGreaterThan(10 * greyed);
    expect(greyed).toBeGreaterThan(0);
  });
});
