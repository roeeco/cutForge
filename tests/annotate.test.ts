// Milestone 89 (LIDS_LINES_PROJECTS_PLAN.md §9): what a piece says about itself on the dieline.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { registerFont, FONTS } from '../src/text/fonts';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, addTray, autoConnect, createDesign } from '../src/model/ops';
import { pieceCopies } from '../src/model/pack';
import { annotationContours, annotations } from '../src/export/annotate';
import { prepareExport } from '../src/export/prepare';

const buf = (f: string) => {
  const b = readFileSync(`public/fonts/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
beforeAll(() => {
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

function cardTray() {
  const d = createDesign(MATERIALS[0]);
  const b = addRootPanel(d, 0, 0, 100, 70);
  addTray(d, b, 40);
  autoConnect(d);
  return d;
}

describe('annotations', () => {
  it('a folded card tray: a name per board, the blank size, the word glue on each glue flap', () => {
    const d = cardTray();
    const c = pieceCopies(d)[0];
    const a = annotations(d, c, (id) => id);
    expect(a.filter((x) => x.kind === 'name')).toHaveLength(c.panels.length);
    const glueFlaps = Object.values(d.connections).filter((k) => k.kind === 'glue').reduce((n, k) => n + (k.geom?.adds.length ?? 0), 0);
    expect(glueFlaps).toBeGreaterThan(0);
    expect(a.filter((x) => x.kind === 'glue')).toHaveLength(glueFlaps);
    const size = a.find((x) => x.kind === 'size')!;
    expect(size.text).toContain('×');
    // every annotation lies on the piece's box
    for (const x of a) {
      expect(x.at.x).toBeGreaterThanOrEqual(-1e-6);
      expect(x.at.y).toBeGreaterThanOrEqual(-1e-6);
      expect(x.at.x).toBeLessThanOrEqual(c.w + 1e-6);
      expect(x.at.y).toBeLessThanOrEqual(c.h + 1e-6);
    }
  });
  it('in the file only when asked, and only on the GUIDE layer', () => {
    const d = cardTray();
    const plain = prepareExport(d, 'nominal');
    const withAnn = prepareExport(d, 'nominal', undefined, (c) => annotationContours(annotations(d, c, () => 'Wall')));
    const ops = (p: typeof plain) => p.sheets.flatMap((s) => s.contours.map((k) => k.op));
    expect(ops(plain).filter((o) => o === 'guide')).toHaveLength(0);
    const extra = ops(withAnn).length - ops(plain).length;
    expect(extra).toBeGreaterThan(0);
    expect(ops(withAnn).filter((o) => o === 'guide')).toHaveLength(extra);
  });
});
