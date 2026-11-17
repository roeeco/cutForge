// Milestone 46 (CURVED_WALLS.md §7.2): matched walls — one top profile shared by two parallel walls facing each other.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addTray, addWallInsert, autoConnect, canMatch, copyOutlineFrom, createDesign, growPanel, leaderOf, matchWall, moveWallInsert, ownOutline, setWallCorner, setTrayHeight } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { toWorld } from '../src/model/frame';
import { straightRing } from '../src/model/edges';
import { outlineTargets } from '../src/model/snap';
import { useStore } from '../src/store/store';
import { parseProject, serializeProject } from '../src/model/serialize';
import { validate } from '../src/model/validate';
import type { Design, WallSketch } from '../src/model/types';

const [CARD, CORR16, , PLY] = MATERIALS;

/** A plywood tray 160 × 100 × 60: its walls by base edge. */
function box(m = PLY) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 160, 100);
  addTray(d, base, 60);
  autoConnect(d);
  const t = Object.values(d.trays)[0];
  const wall = (e: string) => `${t.id}/${e}`;
  return { d, base, front: wall('e0'), right: wall('e1'), back: wall('e2'), left: wall('e3') };
}
const ws = (d: Design, id: string) => d.panels[id].sketch as WallSketch;
/** World x (along the box) and height of a wall's inserted point. */
function insertWorld(d: Design, wall: string, id: string) {
  const p = d.panels[wall];
  const seg = straightRing(p).find((s) => s.key === id)!;
  return toWorld(p.frame, seg.a.x, seg.a.y);
}

describe('matched walls', () => {
  it('only parallel walls facing each other can be matched', () => {
    const { d, front, back, left } = box();
    expect(canMatch(d, back, front)).toBe(true);
    expect(canMatch(d, left, front)).toBe(false);
    expect(canMatch(d, front, front)).toBe(false);
  });

  it('an off-centre arch on the leader appears on the follower unmirrored, at the same place along the box', () => {
    const { d, front, back } = box();
    expect(matchWall(d, back, front)).toBe(true);
    // a peak 40 mm from the front wall's left end, 25 up, curved
    const id = addWallInsert(d, front, 'e2', 1 - 40 / 160, 25)!;
    const f = insertWorld(d, front, id), b = insertWorld(d, back, id);
    expect(b[0]).toBeCloseTo(f[0], 6);
    expect(b[1]).toBeCloseTo(f[1], 6);
    expect(ws(d, back).inserts?.find((x) => x.id === id)?.t).toBeCloseTo(40 / 160, 6);
    // the leader's corner raised: the follower's matching corner (the other end, as its x runs the other way) too
    setWallCorner(d, front, 'tr', { dx: 0, dy: 10 });
    expect(ws(d, back).corners?.tl?.dy).toBeCloseTo(10, 9);
    expect(validate(d).filter((i) => i.key === 'val.selfCross')).toEqual([]);
  });

  it('editing the follower edits the shared profile; a taller tray keeps them matched', () => {
    const { d, front, back } = box();
    matchWall(d, back, front);
    const id = addWallInsert(d, back, 'e2', 0.5, 20)!;
    expect(ws(d, front).inserts?.some((x) => x.id === id)).toBe(true);
    moveWallInsert(d, back, id, { off: 35 });
    expect(ws(d, front).inserts!.find((x) => x.id === id)!.off).toBeCloseTo(35, 6);
    setTrayHeight(d, Object.values(d.trays)[0].id, 80);
    expect(insertWorld(d, back, id)[1]).toBeCloseTo(insertWorld(d, front, id)[1], 6);
  });

  it('Own outline keeps the shape and drops the link; undo restores the link', () => {
    useStore.getState().replaceDesign(box().d);
    const s = () => useStore.getState();
    const t = Object.values(s().design.trays)[0];
    const front = `${t.id}/e0`, back = `${t.id}/e2`;
    s().apply((x) => void matchWall(x, back, front));
    s().apply((x) => void addWallInsert(x, front, 'e2', 0.3, 15));
    const shape = JSON.stringify(ws(s().design, back).inserts);
    s().apply((x) => void ownOutline(x, back));
    expect(leaderOf(s().design, back)).toBeNull();
    expect(JSON.stringify(ws(s().design, back).inserts)).toBe(shape);
    // no longer following
    s().apply((x) => void addWallInsert(x, front, 'e2', 0.7, 10));
    expect(ws(s().design, back).inserts).toHaveLength(1);
    s().undo();
    s().undo();
    expect(leaderOf(s().design, back)).toBe(front);
  });

  it('save and load keep the link; Copy outline from works between walls that are not parallel; facing walls are snap targets', () => {
    const { d, front, back, left } = box(CARD);
    matchWall(d, back, front);
    addWallInsert(d, front, 'e2', 0.5, 20);
    const back2 = parseProject(serializeProject(d));
    expect(leaderOf(back2, back)).toBe(front);
    expect(copyOutlineFrom(d, left, front)).toBe(true);
    expect(ws(d, left).inserts?.filter((x) => x.edge === 'e2')).toHaveLength(1);
    expect(leaderOf(d, left)).toBeNull();
    // the front's peak projected onto a wall facing it (here: the back is its follower; the snap list holds it)
    const tg = outlineTargets(d, back, { x: -999, y: -999 });
    const peak = insertWorld(d, front, ws(d, front).inserts![0].id);
    const p = d.panels[back];
    expect(tg.corners.some((q) => {
      const w = toWorld(p.frame, q.x, q.y);
      return Math.abs(w[0] - peak[0]) < 1e-6 && Math.abs(w[1] - peak[1]) < 1e-6;
    })).toBe(true);
  });

  it('a wall grown by hand can follow a tray wall facing it', () => {
    const d = createDesign(CORR16);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const a = growPanel(d, base, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'fold' })!.panelId;
    const b = growPanel(d, base, 'e2', { height: 50, angle: 90, dir: 'up', kind: 'fold' })!.panelId;
    expect(matchWall(d, b, a)).toBe(true);
    // the follower's top is now the leader's height (40), whatever its own
    const pb = d.panels[b];
    expect(toWorld(pb.frame, 0, pb.h + (ws(d, b).corners?.tl?.dy ?? 0))[1]).toBeCloseTo(toWorld(d.panels[a].frame, 0, d.panels[a].h)[1], 6);
  });
});
