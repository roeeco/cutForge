// Milestone 88 (LIDS_LINES_PROJECTS_PLAN.md §7.3): sizes of a design, derived from the master on demand.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addDetail, addDividerLine, addRootPanel, addTray, autoConnect, createDesign, setPanelSize } from '../src/model/ops';
import { applySize, sizesWhy } from '../src/model/sizes';
import { boxLid, setBoxLid } from '../src/easy/lid';
import { sealOf } from '../src/model/closures';
import { validate } from '../src/model/validate';
import { trayRing } from '../src/model/cartons';
import { flatLidsOf } from '../src/model/lid';
import { prepareExport } from '../src/export/prepare';
import { copy, diff } from './harness';
import type { BoxSize } from '../src/model/types';

const [CARD, , , PLY] = MATERIALS;
const SIZES: BoxSize[] = [
  { id: 's', name: 'S', w: 80, d: 55, h: 40 },
  { id: 'm', name: 'M', w: 120, d: 80, h: 60 },
  { id: 'l', name: 'L', w: 180, d: 120, h: 80 },
];

function hingedBox() {
  const d = createDesign(CARD);
  const b = addRootPanel(d, 0, 0, 120, 80);
  const tray = addTray(d, b, 60)!;
  autoConnect(d);
  setBoxLid(d, tray, 'hinged');
  // a window in the middle of the front wall, a hole near the left wall's corner
  const front = trayRing(d, d.trays[tray])[0].wall;
  const F = d.panels[front];
  addDetail(d, front, 'circle', 'cut', F.w / 2, F.h / 2, 20, 20);
  addDetail(d, front, 'circle', 'cut', 12, 12, 6, 6);
  d.sizes = SIZES;
  return { d, tray, front };
}

describe('sizes', () => {
  it('a hinged card box in three sizes: each lid closes the box, the window stays centred, the corner hole keeps its distance, each is clean to cut', () => {
    const { d, tray, front } = hingedBox();
    const master = copy(d);
    for (const s of SIZES) {
      const x = applySize(d, s);
      expect(x.panels[x.trays[tray].baseId].w).toBeCloseTo(s.w!, 6);
      expect(x.trays[tray].height).toBeCloseTo(s.h!, 6);
      const lid = boxLid(x, tray);
      expect(lid.kind).toBe('hinged');
      if (lid.kind === 'hinged') expect(sealOf(x, lid.lid)).toBeTruthy();
      const F = x.panels[front];
      const [win, hole] = F.details;
      expect(win.cx).toBeCloseTo(F.w / 2, 6);
      expect(win.cy).toBeCloseTo(F.h / 2, 6);
      expect(hole.cx).toBeCloseTo(12, 6);
      expect(hole.cy).toBeCloseTo(12, 6);
      expect(validate(x).map((i) => i.key)).toEqual([]);
      expect(prepareExport(x, 'nominal').sheets.length).toBeGreaterThan(0);
      expect(x.sizes).toBeUndefined();
    }
    // the master is untouched
    expect(diff(master, d)).toBeNull();
  });

  it('a change to the master shows in every size', () => {
    const { d, front } = hingedBox();
    addDetail(d, front, 'rect', 'engrave', 30, 20, 10, 6);
    for (const s of SIZES) expect(applySize(d, s).panels[front].details).toHaveLength(3);
  });

  it('a box with a lid of its own sizes with its lid; dividers keep their share', () => {
    const d = createDesign(PLY);
    const b = addRootPanel(d, 0, 0, 120, 80);
    const tray = addTray(d, b, 50)!;
    autoConnect(d);
    addDividerLine(d, b, { x: 40, y: 5 }, { x: 40, y: 75 }, 40);
    autoConnect(d);
    setBoxLid(d, tray, 'liftoff', 'flat');
    const x = applySize(d, { id: 'l', name: 'L', w: 240, d: 160, h: 80 });
    const L = flatLidsOf(x, tray)[0];
    expect(L.w).toBeGreaterThan(240);
    const div = x.order.map((id) => x.panels[id]).find((p) => p.divider)!;
    expect(div.divider!.at.x).toBeCloseTo(80, 6);
    expect(validate(x).map((i) => i.key)).toEqual([]);
  });

  it('sizes need one box (or a template)', () => {
    const d = createDesign();
    expect(sizesWhy(d)).toBe('sizes.why.noBox');
    for (const x of [0, 200]) {
      const b = addRootPanel(d, x, 0, 80, 60);
      addTray(d, b, 30);
    }
    expect(sizesWhy(d)).toBe('sizes.why.boxes');
    void setPanelSize;
  });
});
