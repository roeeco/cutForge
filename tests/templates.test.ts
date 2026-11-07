import { describe, expect, it } from 'vitest';
import { TEMPLATES, changeMaterial, defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { addDetail, addText, leanSupported } from '../src/model/ops';
import { validate } from '../src/model/validate';
import { panelExtras } from '../src/model/geometry';
import { buildPieces } from '../src/model/pieces';
import { maxOverlap } from './solid';
import type { Design } from '../src/model/types';

const PLY = MATERIALS[3], CORR16 = MATERIALS[1], CORR4 = MATERIALS[2], CARD = MATERIALS[0];
const org = templateById('organiser')!, stand = templateById('stand')!;

describe('template registry', () => {
  it('every template and material variant generates a valid design', () => {
    for (const t of TEMPLATES)
      for (const m of [PLY, CORR16, CORR4, CARD]) {
        if (!t.materials.includes(m.kind)) continue;
        const d = generate(t, m, defaults(t));
        expect(d.order.length, `${t.id} ${m.id}`).toBeGreaterThan(3);
        expect(d.order.every((id) => id.startsWith('t:')), `${t.id} ${m.id}`).toBe(true);
        expect(Object.values(d.connections).some((c) => c.broken), `${t.id} ${m.id}`).toBe(false);
        expect(validate(d).map((i) => i.key), `${t.id} ${m.id}`).toEqual([]);
      }
  });
  it('generating twice gives the same ids', () => {
    const a = generate(org, PLY, defaults(org)), b = generate(org, PLY, defaults(org));
    expect(a.order).toEqual(b.order);
    expect(Object.keys(a.connections).sort()).toEqual(Object.keys(b.connections).sort());
  });
});

describe('organiser', () => {
  it('plywood: finger-jointed box, dividers through wall and base slots, half-laps, nothing overlaps', () => {
    const d = generate(org, { ...PLY, clearance: 0 }, defaults(org));
    const kinds = Object.values(d.connections).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'finger')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'halflap')).toHaveLength(2);
    expect(panelExtras(d, d.panels['t:wall1']).holes.length).toBeGreaterThan(0);
    expect(panelExtras(d, d.panels['t:base']).holes.length).toBeGreaterThan(0);
    expect(maxOverlap(d, [-83, 0, -58], [83, 49, 58], 1.3)).toBe(1);
  });

  it('corrugated: folded tray (one piece) with glue flaps; dividers have no wall slots', () => {
    for (const m of [CORR16, CORR4]) {
      const d = generate(org, m, defaults(org));
      expect(Object.values(d.connections).filter((c) => c.kind === 'glue')).toHaveLength(4);
      for (const w of [0, 1, 2, 3]) expect(panelExtras(d, d.panels[`t:wall${w}`]).holes).toHaveLength(0);
      const tray = buildPieces(d).find((p) => p.key === 't:base')!;
      expect(tray.panels).toHaveLength(5);
    }
  });

  it('user cutouts and text survive a parameter change; lost edits are listed', () => {
    const d = generate(org, PLY, defaults(org));
    addDetail(d, 't:wall0', 'circle', 'cut', 40, 20, 12, 12, 'hole1');
    addText(d, 't:divX2', 30, 15, 'שלום', 'engrave', 'rubik', 8, 'txt1');
    const r = regenerate(d, { ...d.template!.params, width: 200, dividersX: 3 });
    expect(r.design.panels['t:wall0'].details.map((x) => x.id)).toEqual(['hole1']);
    expect(r.design.panels['t:divX2'].details.map((x) => x.id)).toEqual(['txt1']);
    expect(r.lost).toEqual([]);
    expect(r.design.panels['t:base'].w).toBeCloseTo(200 + 6, 9);
    const r2 = regenerate(r.design, { ...r.design.template!.params, dividersX: 1 });
    expect(r2.lost).toEqual([{ panel: r.design.panels['t:divX2'].name, shapes: 1 }]);
    expect(r2.design.panels['t:wall0'].details).toHaveLength(1);
  });

  it('dividers and their slots follow when the box size changes', () => {
    const d = generate(org, PLY, defaults(org));
    const before = JSON.stringify(panelExtras(d, d.panels['t:base']).holes);
    const r = regenerate(d, { ...d.template!.params, width: 220 });
    expect(JSON.stringify(panelExtras(r.design, r.design.panels['t:base']).holes)).not.toBe(before);
    expect(validate(r.design)).toEqual([]);
  });

  it('lid inner size = box outer size + 2 × clearance, after changing box size and thickness, in both materials', () => {
    for (const m of [PLY, CORR16]) {
      let d = generate(org, m, { ...defaults(org), lid: 'liftoff' });
      const check = (x: Design) => {
        const t = x.material.thickness, c = x.material.clearance;
        const box = x.panels['t:base'], lid = x.panels['t:lidbase'];
        expect(lid.w - 2 * t).toBeCloseTo(box.w + 2 * c, 9);
        expect(lid.h - 2 * t).toBeCloseTo(box.h + 2 * c, 9);
      };
      check(d);
      d = regenerate(d, { ...d.template!.params, width: 140, depth: 90 }).design;
      check(d);
      d = changeMaterial(d, { ...d.material, thickness: d.material.thickness * 1.5, clearance: 0.3 }).design;
      check(d);
      expect(Object.keys(d.panels).filter((k) => k.startsWith('t:lid'))).toHaveLength(5);
    }
  });

  it('flags dividers taller than the walls when the lid is on', () => {
    const d = generate(org, PLY, { ...defaults(org), lid: 'liftoff', dividerHeight: 60 });
    expect(validate(d).map((i) => i.key)).toContain('val.dividerTall');
    const ok = generate(org, PLY, { ...defaults(org), lid: 'none', dividerHeight: 60 });
    expect(validate(ok).map((i) => i.key)).not.toContain('val.dividerTall');
  });
});

describe('card / tile stand', () => {
  it('plywood: supports lean at the angle, held by angled slots in the side walls', () => {
    for (const angle of [15, 30, 45, 60]) {
      const d = generate(stand, PLY, { ...defaults(stand), angle, baseDepth: 300 });
      for (let k = 1; k <= 3; k++) expect(leanSupported(d, `t:support${k}`), `angle ${angle}`).toBe(true);
      expect(validate(d).map((i) => i.key), `angle ${angle}`).toEqual([]);
    }
  });
  it('card and corrugated: supports glued to the base and side walls, front lip folded', () => {
    for (const m of [CARD, CORR16]) {
      const d = generate(stand, m, defaults(stand));
      const glue = Object.values(d.connections).filter((c) => c.kind === 'glue');
      expect(glue.length).toBeGreaterThanOrEqual(3 * 3);
      expect(validate(d)).toEqual([]);
    }
  });
  it('flags supports that do not fit on the base', () => {
    const d = generate(stand, PLY, { ...defaults(stand), slots: 8, baseDepth: 60, angle: 30 });
    expect(validate(d).map((i) => i.key)).toContain('val.standDepth');
  });
});
