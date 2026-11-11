// BUGFIX_PLAN B5: fragment keys use `@`, which no panel id contains; v8 files move their fragment placements.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MATERIALS } from '../../src/model/materials';
import { addDetail, addPolygonPanel, addRootPanel, addTray, createDesign, newId, regularPolygon, solve } from '../../src/model/ops';
import { parseProject } from '../../src/model/serialize';
import { pack, pieceCopies } from '../../src/model/pack';
import { buildPieces, FRAG_SEP, pieceRoot, placementPiece } from '../../src/model/pieces';
import { panelEdges } from '../../src/model/edges';

describe('piece keys', () => {
  it('no panel or edge id contains the fragment separator', () => {
    for (let i = 0; i < 2000; i++) for (const p of ['p', 'c', 'tr', 'd', 'i', 'x']) expect(newId(p)).not.toContain(FRAG_SEP);
    for (const m of MATERIALS) {
      const d = createDesign(m);
      const a = addRootPanel(d, 0, 0, 200, 100);
      addTray(d, a, 40);
      addDetail(d, a, 'rect', 'cut', 200, 30, 20, 10); // wall set members `~n` on split edges `#n`
      addDetail(d, a, 'rect', 'cut', 200, 70, 20, 10);
      const b = addPolygonPanel(d, 400, 0, regularPolygon(7, 60))!;
      addTray(d, b, 30);
      solve(d);
      for (const id of d.order) {
        expect(id).not.toContain(FRAG_SEP);
        for (const e of panelEdges(d.panels[id])) expect(e.key).not.toContain(FRAG_SEP);
      }
      for (const id of Object.keys(d.connections)) expect(id).not.toContain(FRAG_SEP);
    }
  });
  it('pieceRoot strips only a fragment number; placementPiece splits on the last #', () => {
    expect(pieceRoot('tr_a/e1~2')).toBe('tr_a/e1~2');
    expect(pieceRoot('tr_a/e1~2@3')).toBe('tr_a/e1~2');
    expect(placementPiece('tr_a/e1#0~1@2#4')).toBe('tr_a/e1#0~1@2');
  });
  it('a v8 file with a manually placed fragment loads, and keeps the placement', () => {
    const d = parseProject(readFileSync('tests/regress/fixtures/v8-fragment-placement.json', 'utf8'));
    const keys = buildPieces(d).map((p) => p.key);
    expect(keys).toHaveLength(2);
    const frag = keys.find((k) => k.includes(FRAG_SEP))!;
    expect(d.placements[`${frag}#0`]).toMatchObject({ x: 300, y: 200, manual: true });
    expect(Object.keys(d.placements).some((k) => k.includes('~'))).toBe(false);
    const pl = pack(d, pieceCopies(d));
    expect(pl[`${frag}#0`]).toMatchObject({ x: 300, y: 200, manual: true });
  });
});
