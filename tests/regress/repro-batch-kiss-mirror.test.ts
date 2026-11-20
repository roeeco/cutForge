// HANDOFF_105-118.md finding 8: a teacher's batch did not apply the export's kiss-score mirror, so a
// kiss-scored piece (milestone 66) would be cut with its scored face down and without its THIS SIDE UP
// note. The batch now mirrors it in its box and adds the note, as the student's own export does.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts } from '../fuzz/gen';
import { MATERIALS } from '../../src/model/materials';
import { roundedTray } from '../goldenDesigns';
import { batchExport } from '../../src/export/batch';
import { kissPanels, prepareExport } from '../../src/export/prepare';
import type { TaggedContour } from '../../src/geom/types';

beforeAll(loadFonts);

const key = (c: TaggedContour) => c.contour.segs.map((s) => `${s.a.x.toFixed(3)},${s.a.y.toFixed(3)}>${s.b.x.toFixed(3)},${s.b.y.toFixed(3)}`).join(' ');

describe('repro: batch export and kiss scores', () => {
  it('a one-design batch scores a kiss-scored piece exactly as the student’s own export (mirrored), with the note', () => {
    const d = roundedTray(MATERIALS[1], 14);
    expect(kissPanels(d).size).toBeGreaterThan(0);
    const own = prepareExport(d).sheets.flatMap((s) => s.contours);
    const r = batchExport([{ design: d, label: 'Dana', id: 'a' }]);
    if ('error' in r) throw new Error(r.error);
    const batch = r.sheets.flatMap((s) => s.contours);
    for (const op of ['score', 'cut'] as const) expect(batch.filter((c) => c.op === op).map(key).sort()).toEqual(own.filter((c) => c.op === op).map(key).sort());
    // the export's note and the owner's name: more guide text than the note alone
    expect(batch.filter((c) => c.op === 'guide').length).toBeGreaterThan(own.filter((c) => c.op === 'guide').length);
  });
});
