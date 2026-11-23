// Rigid corners (exploratory test report, the coffin box): at an angled outside corner of a box of boards the walls
// reach past it so their fingers close the corner (`Tray.outsideCorners`); strict keeps them within the outline.
import { describe, expect, it } from 'vitest';
import { defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { angledTrays } from '../src/model/trays';
import { connectionGeom, reachAt } from '../src/model/seams';
import { maxOverlap } from './solid';
import type { Design } from '../src/model/types';
import { optionsNow } from '../src/sentence/resolve';

const PLY = MATERIALS[3];
const coffin = templateById('coffinBox')!;
const walls = (d: Design) => d.order.filter((id) => d.panels[id].reach);

describe('rigid corners', () => {
  it('strict (the default) builds as before: no wall reaches past a corner', () => {
    const d = generate(coffin, PLY, defaults(coffin));
    expect(walls(d)).toEqual([]);
    expect(angledTrays(d)).toHaveLength(1);
  });

  it('a rigid coffin: its walls reach t·|cot α| past each obtuse corner, every joint holds, nothing overlaps', () => {
    const d = generate(coffin, PLY, { ...defaults(coffin), corners: 'rigid' });
    expect(Object.values(d.trays).some((t) => t.outsideCorners === 'reach')).toBe(true);
    expect(validate(d)).toEqual([]);
    expect(Object.values(d.connections).filter((c) => c.broken)).toEqual([]);
    const reaches = d.order.flatMap((id) => [d.panels[id].reach?.s, d.panels[id].reach?.e]).filter((x): x is number => x !== undefined);
    // the shoulders (148°) reach 3 · cot 32° = 4.80 mm; every corner of the six reaches something
    expect(Math.max(...reaches)).toBeCloseTo(3 / Math.tan((32 * Math.PI) / 180), 2);
    expect(reaches.filter((r) => r > 0)).toHaveLength(12);
    expect(maxOverlap(d, [-110, 0.3, -60], [110, 52, 60], 1.1)).toBe(1);
  });

  it('at a rigid corner each board’s notch takes its reach and the boards’ crossing (t / sin α)', () => {
    const d = generate(coffin, PLY, { ...defaults(coffin), corners: 'rigid' });
    const c = Object.values(d.connections).find((x) => !x.grown && x.kind === 'finger' && (reachAt(d.panels[x.a.panelId], x.a.edge) ?? 0) > 4)!;
    expect(c).toBeTruthy();
    const g = connectionGeom(d, c)!;
    const r = reachAt(d.panels[c.a.panelId], c.a.edge)!;
    const depths = g.edges.find((e) => e.panelId === c.a.panelId)!.notches.map((n) => n.depth);
    expect(Math.max(...depths)).toBeCloseTo(r + 3 / Math.sin((148 * Math.PI) / 180), 1);
  });

  it('the word is a setting of the template: switched on and off again', () => {
    const d = generate(coffin, PLY, defaults(coffin));
    const on = regenerate(d, { ...d.template!.params, corners: 'rigid' }).design;
    expect(walls(on).length).toBeGreaterThan(0);
    const off = regenerate(on, { ...on.template!.params, corners: 'strict' }).design;
    expect(walls(off)).toEqual([]);
  });

  it('offered where the box still builds clean: a hexagon box, not one whose hinged lid its nubs would meet', () => {
    const box = templateById('box')!;
    const word = box.params.find((p) => p.key === 'corners')!;
    const hex = { ...defaults(box), shape: 'poly', sides: 6 };
    expect(optionsNow(word, hex, PLY)).toContain('rigid');
    expect(optionsNow(word, { ...hex, lid: 'hinged' }, PLY)).not.toContain('rigid');
  });

  it('a square box has no corner rigid corners would change', () => {
    const box = templateById('box')!;
    expect(angledTrays(generate(box, PLY, defaults(box)))).toEqual([]);
    expect(angledTrays(generate(box, PLY, { ...defaults(box), shape: 'poly', sides: 6 }))).toHaveLength(1);
  });
});

describe('rigid corners after an edit', () => {
  it('the store’s own joining keeps every corner joint (the walls’ ends reach apart past the shoulders)', async () => {
    const { autoConnect, solve } = await import('../src/model/ops');
    const d = generate(coffin, PLY, { ...defaults(coffin), corners: 'rigid' });
    const before = Object.keys(d.connections).sort();
    autoConnect(d);
    solve(d);
    expect(Object.keys(d.connections).sort()).toEqual(before);
    expect(validate(d)).toEqual([]);
  });
});
