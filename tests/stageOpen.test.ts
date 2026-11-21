// Milestone 160 (owner, 21 November: "the 3D does not show all of the dieline — the closing lip — and templates should
// be edited with the lid and lips open"). A closure's lip (and a tab lid's tongue) rides on its lid, hinged on the
// lid's far edge, and its dust flaps on their side walls' tops: the fold view lays each out in line with its board,
// and the stage shows them open while the lid is open, so the inside is clear to work in. A wrap's lid (the mailer)
// opens on the stage too.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, templateById } from '../src/templates/registry';
import { chooseStyle, styleById } from '../src/templates/styles';
import { flapMatrix, foldDisplay } from '../src/views/foldView';
import { openWrapOnStage, stageFlapT, STAGE_LIP_OPEN } from '../src/views/pose';
import { boxLid } from '../src/easy/lid';
import { frameNormal, toWorld } from '../src/model/frame';
import type { Design, Flap3d } from '../src/model/types';

const [CARD, C16] = ['card-0.5', 'corr-1.6'].map((id) => MATERIALS.find((m) => m.id === id)!);
function hinged(m: typeof CARD): Design {
  const r = chooseStyle(styleById('hingedTray')!, m, defaults(templateById('box')!), templateById)!;
  return generate(templateById(r.id)!, m, r.params);
}
function closureFlaps(d: Design): { key: string; f: Flap3d; conn: string }[] {
  const out: { key: string; f: Flap3d; conn: string }[] = [];
  for (const c of Object.values(d.connections)) if (c.kind === 'closure') c.geom?.flaps3d.forEach((f, i) => out.push({ key: `${c.id}:${i}`, f, conn: c.id }));
  return out;
}
/** A flap's points in the world at a fold fraction. */
const at = (d: Design, f: Flap3d, foldT: number, t = foldT) => {
  const r = foldDisplay(d, foldT);
  const M = flapMatrix(d, f, r.xf, t);
  return f.poly.map((q) => new THREE.Vector3(q.x, q.y, (f.z0 + f.z1) / 2).applyMatrix4(M));
};
/** Distance of points from a board's plane (as shown at a fold fraction). */
const offPlane = (d: Design, id: string, pts: THREE.Vector3[], foldT: number) => {
  const p = d.panels[id];
  const X = foldDisplay(d, foldT).xf.get(id) ?? new THREE.Matrix4();
  const o = new THREE.Vector3(...toWorld(p.frame, 0, 0, 0)).applyMatrix4(X);
  const n = new THREE.Vector3(...frameNormal(p.frame)).transformDirection(X);
  return Math.max(...pts.map((q) => Math.abs(q.clone().sub(o).dot(n))));
};

describe('closures shown on the stage (milestone 160)', () => {
  for (const m of [CARD, C16])
    it(`${m.id}: the lip rides on the lid and the dust flaps on their walls; laid out flat in line with them`, () => {
      const d = hinged(m);
      const t = Object.values(d.trays)[0];
      const lid = (boxLid(d, t.id) as { lid: string }).lid;
      const flaps = closureFlaps(d);
      const lips = flaps.filter((x) => x.f.owner === lid);
      const dust = flaps.filter((x) => x.f.owner && x.f.owner !== lid);
      expect(lips.length).toBeGreaterThanOrEqual(1);
      if (m.kind === 'card') expect(dust.length).toBe(2);
      for (const x of [...lips, ...dust]) {
        expect(x.f.hinge, x.key).toBeTruthy();
        expect(x.f.opensWith, x.key).toBe(lid);
        // folded as before: the lid's lip inside the front wall, a dust flap under the lid (unchanged by the hinge)
        const shut = at(d, x.f, 1);
        expect(shut.every((q) => Number.isFinite(q.x))).toBe(true);
        // laid out: in line with the board it folds off (within a board's thickness)
        expect(offPlane(d, x.f.owner!, at(d, x.f, 1, 0), 1), x.key).toBeLessThan(2 * m.thickness + 0.5);
      }
    });

  it('on the stage they stand open while the lid is open, and shut when it is closed or picked', () => {
    const d = hinged(CARD);
    const t = Object.values(d.trays)[0];
    const lid = (boxLid(d, t.id) as { lid: string }).lid;
    for (const x of closureFlaps(d)) {
      const open = stageFlapT(d, x.conn, x.f, { foldT: 1, shut: {}, selected: [] });
      expect(open, x.key).toBeLessThan(0.5);
      if (x.f.owner === lid) expect(open).toBeCloseTo(1 - STAGE_LIP_OPEN, 5);
      expect(stageFlapT(d, x.conn, x.f, { foldT: 1, shut: { [t.id]: true }, selected: [] })).toBe(1);
      expect(stageFlapT(d, x.conn, x.f, { foldT: 1, shut: {}, selected: [lid] })).toBe(1);
      // closed at the end of going together
      expect(stageFlapT(d, x.conn, x.f, { foldT: 1, shut: {}, selected: [], closeK: 1 })).toBe(1);
      // the fold slider moves them as any flap
      expect(stageFlapT(d, x.conn, x.f, { foldT: 0.4, shut: {}, selected: [] })).toBe(0.4);
    }
  });

  it('a mailer’s lid opens on the stage, unless it is shut or picked', () => {
    const d = generate(templateById('mailer')!, CARD, defaults(templateById('mailer')!));
    const lid = d.panels['t:lid'];
    const y = (xf: Map<string, THREE.Matrix4>) => new THREE.Vector3(...toWorld(lid.frame, lid.w / 2, lid.h / 2, 0)).applyMatrix4(xf.get(lid.id) ?? new THREE.Matrix4()).y;
    const r = foldDisplay(d, 1);
    const shutY = y(r.xf);
    expect(openWrapOnStage(d, r, { shut: {}, selected: [], foldT: 1 })).toContain('t:tuck');
    expect(y(r.xf)).toBeGreaterThan(shutY + 20);
    expect(openWrapOnStage(d, foldDisplay(d, 1), { shut: { 'wrap:t:lid': true }, selected: [], foldT: 1 })).toEqual([]);
    expect(openWrapOnStage(d, foldDisplay(d, 1), { shut: {}, selected: ['t:tuck'], foldT: 1 })).toEqual([]);
    expect(openWrapOnStage(d, foldDisplay(d, 1), { shut: {}, selected: [], foldT: 0.5 })).toEqual([]);
  });
});
