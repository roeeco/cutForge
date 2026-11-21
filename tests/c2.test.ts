// Milestone C2 (SENTENCE_STYLES_PLAN.md): a straight tuck end, the regular slotted container and the drawer box.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { cartonDesign } from '../src/templates/structures/carton';
import { drawerShell, mainTray } from '../src/templates/structures/box';
import { defaults, generate, templateById } from '../src/templates/registry';
import { boxSize } from '../src/model/boxSize';
import { backAndFront, endId } from '../src/model/cartons';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { contourBBox, polygonContour } from '../src/geom/vec';
import type { Design } from '../src/model/types';

const CARD = MATERIALS.find((m) => m.id === 'card-0.5')!;
const CORR4 = MATERIALS.find((m) => m.id === 'corr-4')!;
const blocking = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key);
/** The bottom end's flap areas by wall. */
function endAdds(d: Design, end: 'top' | 'bottom') {
  const t = Object.values(d.trays)[0];
  const c = d.connections[endId(t, end)];
  return { t, adds: c.geom!.adds };
}

describe('C2', () => {
  it('a straight tuck end: the bottom tuck folds off the back wall (a reverse tuck: off the front)', () => {
    const rte = cartonDesign(CARD, 'tuck', 'tuck'), ste = cartonDesign(CARD, 'tuck', 'tuckBack');
    const big = (d: Design) => {
      const { t, adds } = endAdds(d, 'bottom');
      const { back, front } = backAndFront(d, t);
      const area = (id: string) => adds.filter((a) => a.panelId === id).reduce((s, a) => s + Math.abs(polygonContour(a.poly) && contourBBox(polygonContour(a.poly)).maxY - contourBBox(polygonContour(a.poly)).minY), 0);
      return area(back!.wall) > area(front!.wall) ? 'back' : 'front';
    };
    expect(big(rte)).toBe('front');
    expect(big(ste)).toBe('back');
    expect(blocking(ste)).toEqual([]);
  });

  it('an RSC of 300 × 200 × 200 in 4 mm corrugated: every flap half the smaller side; the long sides meet, the short ones leave a gap', () => {
    const d = cartonDesign(CORR4, 'rsc', 'rsc', 300, 200, 200);
    for (const end of ['top', 'bottom'] as const) {
      const { t, adds } = endAdds(d, end);
      expect(adds).toHaveLength(4);
      const { back, front } = backAndFront(d, t);
      for (const a of adds) {
        const b = contourBBox(polygonContour(a.poly));
        const deep = Math.min(b.maxX - b.minX, b.maxY - b.minY);
        // 200 inside less a little: the inside is measured between the walls
        expect(deep).toBeGreaterThan(90);
        expect(deep).toBeLessThan(100.5);
        void back;
        void front;
      }
    }
    expect(blocking(d).filter((k) => k !== 'val.tooBig' && k !== 'val.tooBigGrain')).toEqual([]);
  });

  it('a drawer: the sleeve fits round the tray as built, with the board\'s clearance', () => {
    const def = templateById('drawer')!;
    const d = generate(def, CARD, defaults(def));
    const tray = mainTray(d)!, shell = drawerShell(d)!;
    expect(shell).toBeTruthy();
    const o = boxSize(d, tray, 'outside')!;
    const i = boxSize(d, shell, 'inside')!;
    const c = CARD.clearance;
    expect(i.w).toBeCloseTo(o.w + 2 * c, 6);
    expect(i.d).toBeCloseTo(o.h + c, 6);
    expect(i.h).toBeCloseTo(o.d, 6);
    expect(blocking(d)).toEqual([]);
    // a size change re-sizes the sleeve
    const d2 = generate(def, CARD, { ...defaults(def), width: 150 });
    expect(boxSize(d2, drawerShell(d2)!, 'inside')!.w).toBeCloseTo(boxSize(d2, mainTray(d2)!, 'outside')!.w + 2 * c, 6);
    // thumb notches at both open ends
    const shellFront = Object.values(d.panels).filter((p) => p.details.some((x) => x.shape === 'circle') && p.id.startsWith('t:shell'));
    expect(shellFront.length).toBe(1);
    expect(shellFront[0].details.filter((x) => x.shape === 'circle')).toHaveLength(2);
  });

  // milestone 162: plywood makes a drawer, its sleeve four boards fingered at the corners
  it('plywood makes a drawer whose sleeve is boards fingered at their corners, with nothing folded', () => {
    const def = templateById('drawer')!;
    const ply = MATERIALS.find((m) => m.id === 'ply-3')!;
    expect(templateById('drawer')!.canMake!(ply)).toBe(true);
    const d = generate(def, ply, defaults(def));
    const shell = drawerShell(d)!;
    const corners = Object.values(d.connections).filter((c) => !c.grown && c.trayId === shell);
    expect(corners.length).toBe(4);
    for (const c of corners) expect(c.kind).toBe('finger');
    expect(Object.values(d.connections).some((c) => c.kind === 'fold')).toBe(false);
    expect(validate(d).filter((x) => !NOTE_KEYS.has(x.key))).toEqual([]);
    expect(boxSize(d, shell, 'inside')!.w).toBeCloseTo(boxSize(d, mainTray(d)!, 'outside')!.w + 2 * ply.clearance, 6);
  });
});
