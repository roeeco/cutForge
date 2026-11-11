// Teacher batching: a student who calibrated the kerf has working material `ply-3-custom`
// (MaterialDrawer.useMaterialEdit). batchExport accepts it with stock `ply-3` (same kind and
// thickness), but the copies keep their own material ids, so pack() puts that student's pieces on
// separate sheets instead of the shared ones (and the group's profile silently falls back).
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addRootPanel, createDesign } from '../../src/model/ops';
import { batchExport } from '../../src/export/batch';

const small = (id?: string) => {
  const d = createDesign(MATERIALS[3]);
  if (id) d.material = { ...d.material, id, kerf: 0.2 }; // as the drawer saves an edited kerf
  addRootPanel(d, 0, 0, 50, 40);
  return d;
};

describe('repro: batch with a calibrated material', () => {
  it('two 50 x 40 pieces share one sheet', () => {
    const r = batchExport([
      { id: 'a', label: 'A', design: small() },
      { id: 'b', label: 'B', design: small('ply-3-custom') },
    ]);
    if ('error' in r) throw new Error(r.error);
    expect(r.sheets.map((s) => s.mat ?? 'working')).toEqual(['working']); // actual: ['working', 'ply-3-custom']
  });
});
