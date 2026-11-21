// Milestone 152: the stage shows a tray's top flaps open like its lid, closes them (and its folded lids) at the end of
// Show how it goes together, and frames the design as shown.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import * as THREE from 'three';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, templateById } from '../src/templates/registry';
import { chooseStyle, styleById } from '../src/templates/styles';
import { STAGE_ENDS_OPEN, shownBox, stageFlapT } from '../src/views/pose';
import { foldDisplay } from '../src/views/foldView';
import { applyLidPoses } from '../src/views/lidPose';
import { assembleClose, assembleFold } from '../src/easy/assemble';
import { boxLid } from '../src/easy/lid';
import { trayRing } from '../src/model/cartons';

import type { Design } from '../src/model/types';

const CARD = MATERIALS.find((m) => m.id === 'card-0.5')!;
const C16 = MATERIALS.find((m) => m.id === 'corr-1.6')!;
const BOX = defaults(templateById('box')!);
const styled = (id: string, m = CARD): Design => {
  const r = chooseStyle(styleById(id)!, m, BOX, templateById)!;
  return generate(templateById(r.id)!, m, r.params);
};
const tops = (d: Design) => Object.values(d.connections).flatMap((c) => (c.geom?.flaps3d ?? []).filter((f) => f.endOf === 'top').map((f) => ({ c, f })));

describe('the stage (milestone 152)', () => {
  it("a tray's top flaps stand open, and shut when closed, selected or folding", () => {
    const d = styled('sealed', C16);
    const all = tops(d);
    expect(all.length).toBe(4);
    const t = Object.values(d.trays)[0];
    for (const { c, f } of all) {
      expect(stageFlapT(d, c.id, f, { foldT: 1, shut: {}, selected: [] })).toBeCloseTo(1 - STAGE_ENDS_OPEN);
      expect(stageFlapT(d, c.id, f, { foldT: 1, shut: { [t.id]: true }, selected: [] })).toBe(1);
      expect(stageFlapT(d, c.id, f, { foldT: 1, shut: {}, selected: [trayRing(d, t)[0].wall] })).toBe(1);
      expect(stageFlapT(d, c.id, f, { foldT: 0.5, shut: {}, selected: [] })).toBe(0.5);
      // going together: open, then shut at the end
      expect(stageFlapT(d, c.id, f, { foldT: 1, shut: {}, selected: [], closeK: 1 })).toBeCloseTo(1);
    }
  });

  it('a folded lid closes as the animation ends', () => {
    const d = styled('hingedTray', C16);
    const t = Object.values(d.trays).find((x) => !x.lidOf)!;
    const lid = boxLid(d, t.id);
    expect(lid.kind).toBe('hinged');
    const id = lid.kind === 'hinged' ? lid.lid : '';
    const n = (closeK?: number, assembling = closeK !== undefined) => {
      const r = foldDisplay(d, 1);
      applyLidPoses(d, r, { shut: {}, selected: [], foldT: 1, assembling, ...(closeK !== undefined ? { closeK } : {}) });
      return new THREE.Vector3(0, 0, 1).transformDirection(r.xf.get(id) ?? new THREE.Matrix4());
    };
    const shut = new THREE.Vector3(0, 0, 1);
    const angle = (v: THREE.Vector3) => v.angleTo(shut);
    expect(angle(n(0))).toBeGreaterThan(angle(n(0.5)));
    expect(angle(n(0.5))).toBeGreaterThan(angle(n(1)) - 1e-6);
    expect(angle(n(1))).toBeCloseTo(0, 5);
    expect(n(0).angleTo(n(undefined, false))).toBeCloseTo(0, 5);
    // the animation: folds first, closing last
    expect(assembleFold(0.2)).toBeLessThan(1);
    expect(assembleClose(0.5)).toBe(0);
    expect(assembleClose(1)).toBe(1);
  });

  it('the shown box holds the open lid and the open top flaps', () => {
    const tall = styled('rte');
    const t = Object.values(tall.trays)[0];
    // closed, the box is smaller than shown with its tuck lid open
    const closed = shownBox(tall, { [t.id]: true });
    const open = shownBox(tall);
    expect(open.containsBox(closed)).toBe(true);
    expect(open.equals(closed)).toBe(false);
    const sealed = styled('sealed', C16);
    const shut = shownBox(sealed, { [Object.values(sealed.trays)[0].id]: true });
    expect(shownBox(sealed).max.y).toBeGreaterThan(shut.max.y + 5);
  });
});
