// Milestone 158 (DIELINE_GENERATOR_ANALYSIS.md §4): custom presets. A record's slots are each a list of choices the
// engine builds and checks; a refused choice says why; a record round-trips through a saved preset and the design it
// opens as; the recogniser names a record that is a catalogue style, and a saved preset is a card of its own.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { buildCustom, checked, choicesFor, customCard, customOf, nameOf, setCorner, sizesOf, slotsOf, startFromPreset, withSlot, type CustomRecord, type SavedPreset } from '../src/templates/custom';
import { recordKey, recordOf, fits } from '../src/templates/records';
import { regenerate } from '../src/templates/registry';
import { validate } from '../src/model/validate';
import { serializeProject, parseProject } from '../src/model/serialize';

const [CARD, C16, C4, PLY] = ['card-0.5', 'corr-1.6', 'corr-4', 'ply-3'].map((id) => MATERIALS.find((m) => m.id === id)!);
const S = { width: 120, depth: 80, height: 50 };

describe('custom presets (milestone 158)', () => {
  it('a record nobody named builds clean: a gable top on a snap-lock bottom, a gusseted octagonal tray', () => {
    const gable: CustomRecord = { body: 'tube', footprint: 'rect', top: 'gable', bottom: 'snap', window: 'none' };
    expect(checked(CARD, gable, S).ok).toBe(true);
    const oct: CustomRecord = { body: 'cross', footprint: 'poly', sides: 8, lid: 'none', corner: 'glue', window: 'none' };
    const d = buildCustom(C16, oct, S)!;
    expect(validate(d).map((x) => x.key)).toEqual([]);
    expect(recordOf(d)).toMatchObject({ body: 'cross', footprint: 'poly', sides: 8, lid: 'none' });
  });

  it('every slot offers its choices, and a refused one says why', () => {
    const tray: CustomRecord = { body: 'cross', footprint: 'rect', lid: 'none', window: 'none' };
    // plywood: a tube does not fold
    const body = choicesFor(PLY, tray, S, 'body');
    expect(body.find((c) => c.value === 'tube')).toMatchObject({ ok: false, why: 'custom.why.tubeFolds' });
    expect(body.find((c) => c.value === 'cross')?.ok).toBe(true);
    // a tube is a rectangle
    const tube = withSlot(tray, 'body', 'tube');
    expect(choicesFor(CARD, tube, S, 'footprint').find((c) => c.value === 'round')).toMatchObject({ ok: false, why: 'custom.why.tubeRect' });
    // a gusset folds at the square corners of card, not on a round base, and plywood has none
    expect(choicesFor(CARD, tray, S, 'corner').find((c) => c.value === 'gusset')?.ok).toBe(true);
    expect(choicesFor(PLY, tray, S, 'corner').some((c) => c.value === 'gusset')).toBe(false);
    const hex = withSlot(tray, 'footprint', 'poly');
    expect(choicesFor(CARD, hex, S, 'corner').find((c) => c.value === 'gusset')).toMatchObject({ ok: false, why: 'custom.why.gusset' });
    // every refusal has a reason
    for (const m of [CARD, C16, C4, PLY])
      for (const r of [tray, hex, tube])
        for (const slot of slotsOf(r)) for (const c of choicesFor(m, r, S, slot)) if (!c.ok) expect(c.why, `${m.id} ${slot} ${c.value}`).toBeTruthy();
  }, 120_000);

  it('the corner rule is the design’s own joint choice: it outlives a change of sizes', () => {
    const d = buildCustom(CARD, { body: 'cross', footprint: 'rect', lid: 'none', corner: 'gusset', window: 'none' }, S)!;
    expect(customOf(d)?.corner).toBe('gusset');
    const bigger = regenerate(d, { ...d.template!.params, width: 150 }).design;
    expect(customOf(bigger)?.corner).toBe('gusset');
    // and set on a design made otherwise
    const e = buildCustom(CARD, { body: 'cross', footprint: 'rect', lid: 'none', window: 'none' }, S)!;
    setCorner(e, 'gusset');
    expect(recordOf(e).corner).toBe('gusset');
  });

  it('a custom record round-trips through save and open', () => {
    const rec: CustomRecord = { body: 'cross', footprint: 'poly', sides: 5, lid: 'liftoff', corner: 'glue', window: 'none' };
    const saved: SavedPreset = JSON.parse(JSON.stringify({ id: 'p1', name: 'Pentagon gift box', record: rec, sizes: S, createdAt: 1 }));
    const d = startFromPreset(CARD, saved)!;
    expect(d.name).toBe('Pentagon gift box');
    expect(customOf(d)).toEqual(rec);
    expect(sizesOf(d)).toEqual(S);
    // through the file format too
    const back = parseProject(serializeProject(d));
    expect(customOf(back)).toEqual(rec);
    expect(recordKey(recordOf(back))).toBe(recordKey(recordOf(d)));
    const tube: CustomRecord = { body: 'tube', footprint: 'rect', top: 'gable', bottom: 'crash', window: 'circle' };
    expect(customOf(startFromPreset(CARD, { id: 'p2', name: 'x', record: tube, sizes: S, createdAt: 2 })!)).toEqual(tube);
  });

  it('the recogniser names a custom record that is a catalogue style, and one that is not as its nearest', () => {
    const tuckSnap: CustomRecord = { body: 'tube', footprint: 'rect', top: 'tuck', bottom: 'snap', window: 'none' };
    const n = nameOf(CARD, tuckSnap, S)!;
    expect(n.v.id).toBe('tuckSnap');
    expect(n.same).toBe(true);
    const hexLid: CustomRecord = { body: 'cross', footprint: 'poly', sides: 6, lid: 'liftoff', window: 'none' };
    expect(nameOf(PLY, hexLid, S)).toMatchObject({ same: true });
    expect(nameOf(PLY, hexLid, S)!.v.id).toBe('hexLid');
    const gable: CustomRecord = { body: 'tube', footprint: 'rect', top: 'gable', bottom: 'crash', window: 'none' };
    const g = nameOf(CARD, gable, S)!;
    expect(g.v.id).toBe('gable');
    expect(g.same).toBe(false);
  });

  it('a saved preset is a card of its own, whose pattern its designs fit', () => {
    const rec: CustomRecord = { body: 'cross', footprint: 'poly', sides: 8, lid: 'hinged', corner: 'glue', window: 'none' };
    const p: SavedPreset = { id: 'oct', name: 'Octagon chest', record: rec, sizes: S, createdAt: 3 };
    const card = customCard(p, CARD);
    expect(card).toMatchObject({ id: 'custom:oct', name: 'Octagon chest', status: 'beta' });
    expect(card.variants).toHaveLength(1);
    expect(fits(recordOf(startFromPreset(CARD, p)!), card.variants[0].match)).toBe(true);
    // at other sizes, too: a record is what it is made of
    expect(fits(recordOf(buildCustom(CARD, rec, { width: 90, depth: 90, height: 70 })!), card.variants[0].match)).toBe(true);
  });
});
