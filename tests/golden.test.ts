// Golden exports: SVG and DXF for both templates in every material and a few
// hand-built designs, compared byte for byte with the files in tests/golden/.
// They were written before the schema v6 (edge keys, sketches) refactor and
// guard that rectangles keep exporting exactly as before.
//
// Regenerate (only for an intended change in output): UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts
// The v5 project fixtures (tests/golden/v5-*.json) were saved by the schema v5
// code and are never regenerated: they check the v5 → v6 migration.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cardTray, corrDividers, plyBox, plyLean, v6CardGable, v6CorrFoldover, v6PlyHexThrough } from './goldenDesigns';
import { serializeProject } from '../src/model/serialize';
import { MATERIALS } from '../src/model/materials';
import { prepareExport, type KerfMode } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { sheetsToDxf } from '../src/export/dxf';
import { defaults, generate, templateById } from '../src/templates/registry';
import { parseProject } from '../src/model/serialize';
import { registerFont, FONTS } from '../src/text/fonts';
import type { Design, MaterialProfile } from '../src/model/types';

const DIR = 'tests/golden';
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const [CARD, CORR16, CORR4, PLY] = MATERIALS;

const buf = (f: string) => {
  const b = readFileSync(`public/fonts/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
beforeAll(() => {
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

function templateDesign(id: string, m: MaterialProfile, over: Record<string, number | string> = {}): Design {
  const t = templateById(id)!;
  return generate(t, m, { ...defaults(t), ...over });
}

type Case = { name: string; make: () => Design; kerf?: KerfMode };
const CASES: Case[] = [];
for (const m of [PLY, CORR16, CORR4, CARD]) {
  CASES.push({ name: `organiser-${m.id}`, make: () => templateDesign('organiser', m) });
  CASES.push({ name: `organiser-${m.id}-lid`, make: () => templateDesign('organiser', m, { lid: 'liftoff' }) });
  CASES.push({ name: `organiser-${m.id}-plain`, make: () => templateDesign('organiser', m, { dividersX: 0, dividersY: 0 }) });
  CASES.push({ name: `stand-${m.id}`, make: () => templateDesign('stand', m) });
}
CASES.push({ name: 'stand-ply-3-30', make: () => templateDesign('stand', PLY, { angle: 30, slots: 2 }) });
CASES.push({ name: 'hand-ply-box', make: plyBox });
CASES.push({ name: 'hand-ply-box-compensated', make: plyBox, kerf: 'compensated' });
CASES.push({ name: 'hand-card-tray', make: cardTray });
CASES.push({ name: 'hand-ply-lean', make: plyLean });
CASES.push({ name: 'hand-corr-dividers', make: corrDividers });

function exportsOf(d: Design, kerf: KerfMode = 'nominal') {
  const prep = prepareExport(d, kerf);
  return { svg: sheetsToSvg(prep.sheets), dxf: sheetsToDxf(prep.sheets) };
}

function compare(file: string, actual: string) {
  const path = `${DIR}/${file}`;
  if (UPDATE || !existsSync(path)) {
    if (!UPDATE) throw new Error(`missing golden file ${path} (run with UPDATE_GOLDEN=1)`);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  // byte-for-byte; a plain equality keeps the failure message short
  const same = readFileSync(path, 'utf8') === actual;
  expect(same, `${file} differs from the golden file`).toBe(true);
}

describe('golden exports', () => {
  for (const c of CASES)
    it(c.name, () => {
      const { svg, dxf } = exportsOf(c.make(), c.kerf);
      compare(`${c.name}.svg`, svg);
      compare(`${c.name}.dxf`, dxf);
    });
});

// Project files saved by the schema v5 code (before edge keys and sketches).
const V5 = [
  { file: 'v5-hand-ply-box.json', golden: 'hand-ply-box' },
  { file: 'v5-hand-card-tray.json', golden: 'hand-card-tray' },
  { file: 'v5-hand-ply-lean.json', golden: 'hand-ply-lean' },
  { file: 'v5-organiser-corr-1.6-lid.json', golden: 'organiser-corr-1.6-lid' },
  { file: 'v5-stand-ply-3.json', golden: 'stand-ply-3' },
];

describe('v5 project files migrate to identical exports', () => {
  for (const v of V5)
    it(v.file, () => {
      const text = readFileSync(`${DIR}/${v.file}`, 'utf8');
      expect(JSON.parse(text).schemaVersion).toBe(5);
      const d = parseProject(text);
      const { svg, dxf } = exportsOf(d);
      expect(svg === readFileSync(`${DIR}/${v.golden}.svg`, 'utf8'), `${v.file} SVG`).toBe(true);
      expect(dxf === readFileSync(`${DIR}/${v.golden}.dxf`, 'utf8'), `${v.file} DXF`).toBe(true);
    });
});

// Project files saved by the schema v6 code (before rotation, schema v7), with
// the exports the v6 code made from them. Written once (GEN_V6=1) and never
// regenerated: they check the v6 → v7 migration.
const V6 = [
  { name: 'v6-ply-hex-through', make: v6PlyHexThrough },
  { name: 'v6-corr-foldover', make: v6CorrFoldover },
  { name: 'v6-card-gable', make: v6CardGable },
  { name: 'v6-ply-box', make: plyBox },
  { name: 'v6-organiser-ply-3-lid', make: () => templateDesign('organiser', PLY, { lid: 'liftoff' }) },
];

describe('v6 project files migrate to identical exports', () => {
  for (const v of V6)
    it(v.name, () => {
      const file = `${DIR}/${v.name}.json`;
      if (process.env.GEN_V6 === '1') {
        const d = v.make();
        writeFileSync(file, serializeProject(d));
        const { svg, dxf } = exportsOf(d);
        writeFileSync(`${DIR}/${v.name}.svg`, svg);
        writeFileSync(`${DIR}/${v.name}.dxf`, dxf);
      }
      const text = readFileSync(file, 'utf8');
      expect(JSON.parse(text).schemaVersion).toBe(6);
      const { svg, dxf } = exportsOf(parseProject(text));
      expect(svg === readFileSync(`${DIR}/${v.name}.svg`, 'utf8'), `${v.name} SVG`).toBe(true);
      expect(dxf === readFileSync(`${DIR}/${v.name}.dxf`, 'utf8'), `${v.name} DXF`).toBe(true);
    });
});
