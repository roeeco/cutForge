// Milestone 148 (PRESETS_OVERHAUL.md §5.3): the pictures' poses are view only and put things where they go.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, templateById } from '../src/templates/registry';
import { chooseStyle, styleById } from '../src/templates/styles';
import { autoPose, boxOf, drawerParts, posedDisplay } from '../src/views/pose';
import { flapMatrix } from '../src/views/foldView';
import { trayRing } from '../src/model/cartons';
import { matDir, toWorld } from '../src/model/frame';
import type { Design } from '../src/model/types';

const CARD = MATERIALS.find((m) => m.id === 'card-0.5')!;
const BOX = defaults(templateById('box')!);
const styled = (id: string, m = CARD): Design => {
  const r = chooseStyle(styleById(id)!, m, BOX, templateById)!;
  return generate(templateById(r.id)!, m, r.params);
};

describe('poses (milestone 148)', () => {
  it('a drawer box: all the way in, the tray is inside its sleeve; half in, it sticks out of the front', () => {
    const d = generate(templateById('drawer')!, CARD, defaults(templateById('drawer')!));
    const parts = drawerParts(d)!;
    expect(parts).toBeTruthy();
    const ids = (t: string) => [d.trays[t].baseId, ...trayRing(d, d.trays[t]).map((r) => r.wall)];
    const inside = posedDisplay(d, { drawer: 1 });
    const tray = boxOf(d, ids(parts.tray), inside.xf), sleeve = boxOf(d, ids(parts.shell), inside.xf);
    // its middle within the sleeve, its size within the sleeve's but for the clearance and thickness
    expect(sleeve.containsPoint(tray.getCenter(new THREE.Vector3()))).toBe(true);
    const grown = sleeve.clone().expandByScalar(1);
    expect(grown.containsBox(tray)).toBe(true);
    const half = posedDisplay(d, { drawer: 0.55 });
    const t2 = boxOf(d, ids(parts.tray), half.xf), s2 = boxOf(d, ids(parts.shell), half.xf);
    expect(s2.clone().expandByScalar(1).containsBox(t2)).toBe(false);
    expect(s2.containsPoint(t2.getCenter(new THREE.Vector3()))).toBe(true);
  });

  it("a carton's end flap, turned back about its hinge, lies in line with its wall past the edge", () => {
    for (const id of ['sealed', 'tuckSnap', 'rte']) {
      const d = styled(id);
      let n = 0;
      for (const c of Object.values(d.connections))
        for (const f of c.geom?.flaps3d ?? []) {
          if (!f.endOf || !f.hinge || !f.owner) continue;
          const W = d.panels[f.owner];
          const M = flapMatrix(d, f, new Map(), 0);
          const cen = f.poly.reduce<THREE.Vector3>((a, q) => a.add(new THREE.Vector3(q.x, q.y, (f.z0 + f.z1) / 2)), new THREE.Vector3()).divideScalar(f.poly.length).applyMatrix4(M);
          // in the wall's plane (within its thickness and the flap's layer)
          const o = new THREE.Vector3(...toWorld(W.frame, 0, 0, 0)), nrm = new THREE.Vector3(...matDir(W.frame));
          expect(Math.abs(cen.clone().sub(o).dot(nrm)), `${id} ${c.id}`).toBeLessThan(4 * CARD.thickness + 1);
          // past its top or bottom edge
          const y = cen.clone().sub(o).dot(new THREE.Vector3(...W.frame.v));
          expect(f.endOf === 'top' ? y > W.h : y < 0, `${id} ${c.id} ${f.endOf} at ${y.toFixed(1)} of ${W.h}`).toBe(true);
          n++;
        }
      expect(n, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('a pose never changes the design', () => {
    for (const d of [styled('sealed'), styled('diamondEnvelope'), generate(templateById('drawer')!, CARD, defaults(templateById('drawer')!)), generate(templateById('sleeve')!, CARD, defaults(templateById('sleeve')!))]) {
      const before = JSON.stringify(d);
      posedDisplay(d);
      expect(JSON.stringify(d)).toBe(before);
    }
  });

  it('each kind of preset takes its pose by itself', () => {
    expect(autoPose(styled('sealed')).ends).toBeGreaterThan(1);
    expect(autoPose(styled('tuckSnap')).ends).toBeUndefined();
    expect(autoPose(styled('diamondEnvelope'))).toMatchObject({ prop: 'letter' });
    expect(autoPose(styled('diamondEnvelope')).backFlap).toBeGreaterThan(90);
    expect(autoPose(generate(templateById('sleeve')!, CARD, defaults(templateById('sleeve')!)))).toMatchObject({ prop: 'soap', lay: true });
    expect(autoPose(generate(templateById('drawer')!, CARD, defaults(templateById('drawer')!))).drawer).toBeGreaterThan(0);
    expect(autoPose(generate(templateById('box')!, CARD, BOX))).toEqual({});
  });
});
