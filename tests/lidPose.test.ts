// Milestone 76 (UI_CLEANUP_PLAN.md Part 3): lids beside the box, folded lids shown open, Put on / Close. View only.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MATERIALS } from '../src/model/materials';
import { addLid, addRootPanel, addTray, autoConnect, createDesign, movePanel, setTrayEnds, solve } from '../src/model/ops';
import { foldDisplay } from '../src/views/foldView';
import { applyLidPoses } from '../src/views/lidPose';
import { lidOnFrame, lidPutOn } from '../src/model/lid';
import { boxLid, lidParts } from '../src/easy/lid';
import { toWorld } from '../src/model/frame';
import { copy, idempotence, roundTrip } from './harness';
import { buildPieces } from '../src/model/pieces';

const [CARD, , , PLY] = MATERIALS;
function box(m = PLY) {
  const d = createDesign(m);
  const b = addRootPanel(d, 0, 0, 120, 80);
  const tray = addTray(d, b, 50)!;
  autoConnect(d);
  return { d, tray };
}
const view = (d: any, shut: Record<string, boolean> = {}, selected: string[] = [], foldT = 1, assembling = false) => {
  const r = foldDisplay(d, foldT);
  const away = applyLidPoses(d, r, { shut, selected, foldT, assembling });
  return { ...r, away };
};
const at = (m: THREE.Matrix4 | undefined, p: [number, number, number]) => new THREE.Vector3(...p).applyMatrix4(m ?? new THREE.Matrix4());

describe('a lid of its own', () => {
  it('lies beside the box in the design; Put on shows it on the box; picked, it stays beside; going together, it is on', () => {
    const { d, tray } = box();
    const lt = addLid(d, tray)!;
    const lid = d.panels[d.trays[lt].baseId];
    const parts = lidParts(d, boxLid(d, tray));
    let v = view(d);
    expect(v.away.size).toBe(0);
    v = view(d, { [tray]: true });
    for (const id of parts) expect(v.away.has(id)).toBe(true);
    const on = lidOnFrame(d, lid, d.trays[tray])!;
    at(v.xf.get(lid.id), toWorld(lid.frame, 7, 9)).toArray().forEach((x, i) => expect(x).toBeCloseTo(toWorld(on, 7, 9)[i], 6));
    expect(view(d, { [tray]: true }, [lid.id]).away.size).toBe(0);
    expect(view(d, {}, [], 1, true).away.has(lid.id)).toBe(true);
  });

  it('pieces and the file do not depend on where it lies: moving it changes no piece', () => {
    const { d, tray } = box(CARD);
    const lt = addLid(d, tray)!;
    const before = JSON.stringify(buildPieces(d).map((p) => p.contours));
    const lidId = d.trays[lt].baseId;
    movePanel(d, lidId, 40, -25);
    expect(d.trays[lt].lidAt).toBeTruthy();
    expect(JSON.stringify(buildPieces(d).map((p) => p.contours))).toBe(before);
    // and Put on still lands it on the box
    const T = new THREE.Matrix4().fromArray(lidPutOn(d, d.trays[lt])!);
    const on = lidOnFrame(d, d.panels[lidId], d.trays[tray])!;
    at(T, toWorld(d.panels[lidId].frame, 3, 4)).toArray().forEach((x, i) => expect(x).toBeCloseTo(toWorld(on, 3, 4)[i], 6));
    expect(idempotence(d)).toBeNull();
    expect(roundTrip(d)).toBeNull();
  });

  it('a new lid moves along until its spot is free', () => {
    const { d, tray } = box();
    // a board where the lid would go
    addRootPanel(d, 150, 0, 60, 60);
    const lt = addLid(d, tray)!;
    expect(d.trays[lt].lidAt!.x).toBeGreaterThan(150 + 60 - 1e-6);
  });
});

describe('a folded lid', () => {
  it.each([CARD, PLY])('$id: shown open; Close, a pick, the fold view or going together show it shut', (m) => {
    const { d, tray } = box(m);
    setTrayEnds(d, tray, { top: 'tuck' });
    solve(d);
    const lid = boxLid(d, tray);
    expect(lid.kind).toBe('hinged');
    const L = lid.kind === 'hinged' ? d.panels[lid.lid] : null!;
    // its far edge, closed, over the front wall
    const far = toWorld(L.frame, L.w / 2, L.h);
    const open = at(view(d).xf.get(L.id), far);
    // opened: higher than the box's walls, and behind its back
    expect(open.y).toBeGreaterThan(far[1] + 20);
    expect(view(d).away.has(L.id)).toBe(true);
    for (const v of [view(d, { [tray]: true }), view(d, {}, [L.id]), view(d, {}, [], 0.5), view(d, {}, [], 1, true)]) expect(v.away.has(L.id)).toBe(false);
    const shut = at(view(d, { [tray]: true }).xf.get(L.id), far);
    shut.toArray().forEach((x, i) => expect(x).toBeCloseTo(far[i], 6));
    // the design is the same
    const c = copy(d);
    view(d);
    expect(JSON.stringify(d)).toBe(JSON.stringify(c));
  });
});
