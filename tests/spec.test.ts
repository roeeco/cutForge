// Milestone 90 (LIDS_LINES_PROJECTS_PLAN.md §9): the spec sheet.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, addTray, autoConnect, createDesign } from '../src/model/ops';
import { fitScale, specHtml, specPages, type SpecText } from '../src/export/spec';
import { pieceCopies } from '../src/model/pack';

const tx: SpecText = { title: 'Box', date: '19 Nov 2026', material: 'Card', blank: 'Blank {w} × {h} mm', pieces: '{n} pieces', glue: '{n} glue joints', kerf: 'kerf 0.1 mm', scale: 'Scale 1 : {n}', legend: { cut: 'Cut', score: 'Score', engrave: 'Engrave', guide: 'Guide' }, glueWord: 'glue', unit: 'mm', name: (id) => id };

describe('the spec sheet', () => {
  it('the largest scale that fits', () => {
    expect(fitScale(200, 150, 273, 160)).toBe(1);
    expect(fitScale(400, 150, 273, 160)).toBe(2);
    expect(fitScale(900, 500, 273, 160)).toBe(5);
  });
  it('a page per kind of piece, at its scale, with the title block, the legend and the blank size', () => {
    const d = createDesign(MATERIALS[0]);
    const b = addRootPanel(d, 0, 0, 160, 110);
    addTray(d, b, 60);
    autoConnect(d);
    addRootPanel(d, 300, 0, 60, 40);
    const pages = specPages(d, 'A4', tx);
    expect(pages).toHaveLength(new Set(pieceCopies(d).map((c) => c.pieceKey)).size);
    const net = pages.find((p) => p.svg.includes('glue'))!;
    // the folded tray's net is 279 × 229 (a crease takes no strip, the overhaul of 19 November): not at full size on A4, at half
    expect(net.scale).toBe(2);
    expect(net.svg).toContain('Scale 1 : 2');
    expect(net.svg).toContain('Blank 279');
    for (const w of ['Cut', 'Score', 'Engrave', 'Guide', 'Box']) expect(net.svg).toContain(w);
    const html = specHtml(pages, 'A4', 'Box', 'ltr');
    expect(html).toContain('@page { size: A4 landscape');
    expect(html.match(/class="page"/g)).toHaveLength(pages.length);
  });
});
