// The SVG illustration prototype (src/views/illustrate.ts): it draws every preset tried in each material that
// makes it, with finite coordinates, and paints what goes inside after the floor it stands on.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { defaults, templateById } from '../src/templates/registry';
import { builtFor } from '../src/templates/structures/box';
import { chooseStyle, styleById, styleListed } from '../src/templates/styles';
import { missionById, startMission } from '../src/easy/missions';
import { facesForTest, illustrationSvg, type Prop } from '../src/views/illustrate';
import type { Design, MaterialProfile } from '../src/model/types';

const BOX = defaults(templateById('box')!);
const style = (id: string) => (m: MaterialProfile): Design | null => {
  const s = styleById(id)!;
  if (!styleListed(s, m, BOX, templateById)) return null;
  const r = chooseStyle(s, m, BOX, templateById);
  return r ? builtFor(templateById(r.id)!, m, r.params) : null;
};
const mission = (id: string) => (m: MaterialProfile): Design | null => (missionById(id)!.materials.includes(m.kind) ? startMission(missionById(id)!, m) : null);
const CASES: [string, (m: MaterialProfile) => Design | null, Prop | undefined][] = [
  ['openTray', style('openTray'), 'sweets'],
  ['pencil-box', mission('pencil-box'), 'pencils'],
  ['rte', style('rte'), undefined],
  ['dice-tray', mission('dice-tray'), 'dice'],
];

describe('illustrations', () => {
  for (const [name, make, prop] of CASES)
    for (const m of MATERIALS)
      it(`${name} in ${m.id}`, () => {
        const d = make(m);
        if (!d) return;
        const svg = illustrationSvg(d, 300, 210, { prop });
        expect(svg).toBeTruthy();
        expect(svg).not.toMatch(/NaN|Infinity/);
        expect((svg!.match(/<path/g) ?? []).length).toBeGreaterThan(10);
        if (!prop) return;
        // every upward prop face is painted after the box's floor
        const { faces, nBoard, order } = facesForTest(d, prop);
        const floor = faces.slice(0, nBoard).filter((f) => f.normal.y > 0.9 && order.includes(f)).sort((a, b) => a.pts[0].y - b.pts[0].y)[0];
        const tops = faces.slice(nBoard).filter((f) => f.normal.y > 0.9 && order.includes(f));
        expect(tops.length).toBeGreaterThan(0);
        for (const f of tops) expect(order.indexOf(f)).toBeGreaterThan(order.indexOf(floor));
      });
});
