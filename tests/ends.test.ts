// Milestone 149 (DIELINE_GENERATOR_ANALYSIS.md §3.2): a tube's end is one flap per wall. The named styles are lists
// (their exports are byte-identical: tests/golden.test.ts), a list that is no named style builds clean, and one
// wall's flap can be set on its own.
import { describe, expect, it } from 'vitest';
// the template registry first: the structures it lists import the checks, which import the registry
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { END_STYLES, endSpec, endStyleOf, trayRing } from '../src/model/cartons';
import { cartonDesign } from '../src/templates/structures/carton';
import { setEndFlap } from '../src/model/ops';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { STYLES, styleOf } from '../src/templates/styles';
import { defaults, generate, templateById } from '../src/templates/registry';
import type { Design, EndSpec } from '../src/model/types';

const CARD = MATERIALS.find((m) => m.id === 'card-0.5')!;
const C16 = MATERIALS.find((m) => m.id === 'corr-1.6')!;
const C4 = MATERIALS.find((m) => m.id === 'corr-4')!;
const blocking = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key);
const tray = (d: Design) => Object.values(d.trays).find((t) => !t.lidOf)!;
const flapsOn = (d: Design, end: 'top' | 'bottom') => Object.values(d.connections).find((c) => c.id.endsWith(`:${end}`) && c.id.startsWith('end:'))?.geom?.adds.length ?? 0;

describe('ends per wall (milestone 149)', () => {
  it('every named style is its list, and is named back from it', () => {
    for (const [name, spec] of Object.entries(END_STYLES)) expect(endStyleOf(spec), name).toBe(name);
    const d = cartonDesign(CARD, 'tuck', 'snap');
    expect(endSpec(tray(d), 'bottom')).toEqual(END_STYLES.snap);
    expect(endStyleOf(endSpec(tray(d), 'bottom')!)).toBe('snap');
  });

  it('the full-overlap box (FEFCO 0203) is a list only, and builds clean on corrugated', () => {
    for (const m of [C16, C4]) {
      const d = cartonDesign(m, 'full', 'full', 100, 70, 60);
      expect(blocking(d), m.id).toEqual([]);
      expect(flapsOn(d, 'top')).toBe(4);
      expect(flapsOn(d, 'bottom')).toBe(4);
    }
    // and the sentence names it
    const fol = STYLES.find((s) => s.id === 'fol')!;
    const p = { ...defaults(templateById('carton')!), ...fol.words, width: 100, depth: 70, height: 60 };
    expect(styleOf('carton', p)?.id).toBe('fol');
    expect(blocking(generate(templateById('carton')!, C16, p))).toEqual([]);
  });

  it('a list that is no named style builds with nothing blocking', () => {
    const lists: [string, 'top' | 'bottom', EndSpec][] = [
      // a lid of one full flap off the back, dust flaps under it
      ['flap lid', 'top', { back: { kind: 'full' }, front: { kind: 'none' }, left: { kind: 'dust' }, right: { kind: 'dust' } }],
      // a tuck from the front over sides that meet in the middle
      ['tuck over halves', 'bottom', { front: { kind: 'tuck' }, back: { kind: 'none' }, left: { kind: 'half' }, right: { kind: 'half' } }],
      // shipping flaps on the long walls, full on the short
      ['mixed', 'bottom', { front: { kind: 'rsc' }, back: { kind: 'rsc' }, left: { kind: 'full' }, right: { kind: 'full' } }],
    ];
    for (const m of [CARD, C16])
      for (const [name, end, spec] of lists) {
        const d = cartonDesign(m, 'seal', 'seal');
        const t = tray(d);
        for (const role of ['front', 'back', 'left', 'right'] as const) setEndFlap(d, t.id, end, role, spec[role]);
        expect(endStyleOf(endSpec(tray(d), end)!), name).toBeNull();
        expect(blocking(d), `${name} on ${m.id}`).toEqual([]);
        expect(flapsOn(d, end), name).toBe(Object.values(spec).filter((f) => f.kind !== 'none').length);
      }
  });

  it("one wall's flap is set on its own, and the list goes back to its style", () => {
    const d = cartonDesign(C16, 'seal', 'seal');
    const t = tray(d);
    const before = JSON.stringify(endSpec(t, 'bottom'));
    setEndFlap(d, t.id, 'bottom', 'front', { kind: 'full' });
    const now = endSpec(tray(d), 'bottom')!;
    expect(now.front).toEqual({ kind: 'full' });
    expect([now.back, now.left, now.right]).toEqual([END_STYLES.seal.back, END_STYLES.seal.left, END_STYLES.seal.right]);
    expect(endStyleOf(now)).toBeNull();
    setEndFlap(d, t.id, 'bottom', 'front', null);
    expect(JSON.stringify(endSpec(tray(d), 'bottom'))).toBe(before);
    expect(tray(d).ends).toBeUndefined();
    // the walls each flap is on: front, back and both sides of the ring
    expect(trayRing(d, tray(d)).length).toBe(4);
  });
});
