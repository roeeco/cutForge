// Shared invariant checks: pieces -> packing -> prepared sheets -> SVG / DXF.
import type { Design } from '../../src/model/types';
import { checkPathD, chained, finiteContour, parseDxf, parseSvg } from './check';
import { pack, pieceCopies, placedRect, placementXform } from '../../src/model/pack';
import { profileOf } from '../../src/model/materials';
import { prepareExport } from '../../src/export/prepare';
import { sheetToSvg, sheetsToSvg } from '../../src/export/svg';
import { sheetsToDxf } from '../../src/export/dxf';
import { LAYERS } from '../../src/export/layers';
import { contourArea, contourBBox, xformContour } from '../../src/geom/vec';
import { constructionSet } from '../../src/model/place';
import { validate } from '../../src/model/validate';

export type Fail = { cls: string; seed: number; msg: string };

export function checkPipeline(d: Design, seed: number, log: string[], fails: Fail[], stats: Record<string, number>) {
  const fail = (cls: string, msg: string) => fails.push({ cls, seed, msg: msg + '\n  log: ' + log.join('; ') });
  let copies;
  try {
    copies = pieceCopies(d);
  } catch (e) {
    return fail('pieceCopies throws', String(e));
  }
  const guides = constructionSet(d);
  stats.copies = (stats.copies ?? 0) + copies.length;
  for (const c of copies) {
    if (!Number.isFinite(c.w) || !Number.isFinite(c.h) || c.w <= 0 || c.h <= 0) fail('copy size not finite', `${c.key} w=${c.w} h=${c.h}`);
    if (!c.contours.length || c.contours[0].role !== 'outer') fail('first contour not outer', `${c.key} roles=${c.contours.map((x) => x.role)}`);
    for (const tc of c.contours) {
      if (!finiteContour(tc.contour)) fail('non-finite contour', `${c.key} ${tc.role}`);
      if (!chained(tc.contour, 1e-5)) fail('contour not chained', `${c.key} ${tc.role} ${tc.op}`);
      if (tc.ref?.panelId && guides.has(tc.ref.panelId)) fail('construction panel exported', c.key);
    }
    for (const np of c.panels) if (guides.has(np.panelId)) fail('construction panel in piece', c.key);
  }
  // every non-construction panel appears in some piece (unless removed by a cut)
  const inPieces = new Set(copies.flatMap((c) => c.panels.map((p) => p.panelId)));
  const ckeys = copies.map((c) => c.key);
  const dupk = ckeys.filter((k, i) => ckeys.indexOf(k) !== i);
  if (dupk.length) fail('duplicate piece copy keys', dupk.join(','));
  const missing = d.order.filter((id) => d.panels[id] && !guides.has(id) && !inPieces.has(id));
  if (missing.length) {
    let iss: ReturnType<typeof validate> = [];
    try {
      iss = validate(d);
    } catch {}
    const flagged = new Set(iss.filter((i) => i.key === 'val.removed').map((i) => i.target.id));
    const silent = missing.filter((id) => !flagged.has(id));
    if (silent.length) fail('panel missing from pieces, not reported', silent.map((id) => `${id} (${d.panels[id].w.toFixed(1)}x${d.panels[id].h.toFixed(1)})`).join(','));
  }

  let pl;
  try {
    pl = pack(d, copies);
  } catch (e) {
    return fail('pack throws', String(e));
  }
  const rects: { key: string; sheet: string; r: ReturnType<typeof placedRect>; fits: boolean; gap: number }[] = [];
  const oversized: string[] = [];
  for (const c of copies) {
    const p = pl[c.key];
    if (!p) {
      fail('copy not placed', c.key);
      continue;
    }
    const prof = profileOf(d, c.mat);
    const want = c.mat === d.material.id ? undefined : c.mat;
    if ((p.mat ?? undefined) !== want) fail('placement material mismatch', `${c.key} mat=${c.mat} placed=${p.mat}`);
    const canRot = prof.grain === 'none' || !!d.allowRotate;
    if (p.rot === 90 && !canRot) fail('rotated against grain', `${c.key} grain=${prof.grain}`);
    const m = d.sheetMargin;
    const fits0 = c.w <= prof.sheetW - 2 * m + 1e-9 && c.h <= prof.sheetH - 2 * m + 1e-9;
    const fits90 = canRot && c.h <= prof.sheetW - 2 * m + 1e-9 && c.w <= prof.sheetH - 2 * m + 1e-9;
    const fits = fits0 || fits90;
    const rr = placedRect(p, c.w, c.h);
    if (fits) {
      if (rr.x0 < m - 1e-6 || rr.y0 < m - 1e-6 || rr.x1 > prof.sheetW - m + 1e-6 || rr.y1 > prof.sheetH - m + 1e-6) fail('fitting piece placed outside margin', `${c.key} ${JSON.stringify(rr)} sheet ${prof.sheetW}x${prof.sheetH} m=${m}`);
    } else {
      const phys = (c.w <= prof.sheetW + 1e-9 && c.h <= prof.sheetH + 1e-9) || (canRot && c.h <= prof.sheetW + 1e-9 && c.w <= prof.sheetH + 1e-9);
      oversized.push((phys ? 'M:' : '') + c.pieceKey);
    }
    rects.push({ key: c.key, sheet: `${p.mat ?? ''}#${p.sheet}`, r: rr, fits, gap: d.sheetSpacing });
  }
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.sheet !== b.sheet || !a.fits || !b.fits) continue;
      const g = a.gap - 1e-6;
      const sep = a.r.x1 + g <= b.r.x0 || b.r.x1 + g <= a.r.x0 || a.r.y1 + g <= b.r.y0 || b.r.y1 + g <= a.r.y0;
      if (!sep) fail('placements overlap / too close', `${a.key} ${JSON.stringify(a.r)} vs ${b.key} ${JSON.stringify(b.r)} gap=${a.gap}`);
    }
  // pieces that fit nowhere are reported by validate
  if (oversized.length) {
    stats.oversized = (stats.oversized ?? 0) + 1;
    let issues;
    try {
      issues = validate(d);
    } catch (e) {
      return fail('validate throws', String(e));
    }
    const named = new Set(issues.filter((i) => i.key === 'val.offSheet' || i.key === 'val.tooBig').map((i) => i.target.id));
    for (const k0 of oversized) {
      const marginOnly = k0.startsWith('M:');
      const k = marginOnly ? k0.slice(2) : k0;
      const panels = copies.find((c) => c.pieceKey === k)!.panels.map((p) => p.panelId);
      if (!named.has(k) && !panels.some((id) => named.has(id))) fail(marginOnly ? 'piece fits sheet only without margin, not reported' : 'oversized piece not reported', `${k} (${copies.find((c) => c.pieceKey === k)!.w.toFixed(1)}x${copies.find((c) => c.pieceKey === k)!.h.toFixed(1)}) margin=${d.sheetMargin}`);
    }
  }

  for (const mode of ['nominal', 'compensated'] as const) {
    let prep;
    try {
      prep = prepareExport(d, mode);
    } catch (e) {
      fail(`prepareExport(${mode}) throws`, String((e as Error).stack).slice(0, 400));
      continue;
    }
    const total = prep.sheets.reduce((s, x) => s + x.contours.length, 0);
    const expected = copies.reduce((s, c) => s + c.contours.length, 0);
    if (total !== expected) fail(`contour count changed (${mode})`, `${total} vs ${expected}`);
    for (const g of prep.materials) for (const s of g.sheets) if (s.w !== g.profile.sheetW || s.h !== g.profile.sheetH) fail('sheet size != material sheet', `${g.mat}`);
    for (const s of prep.sheets)
      for (const tc of s.contours) {
        if (!finiteContour(tc.contour)) fail(`non-finite contour on sheet (${mode})`, tc.ref?.pieceKey ?? '');
        if (!chained(tc.contour, 1e-5)) fail(`sheet contour not chained (${mode})`, `${tc.ref?.pieceKey} ${tc.role}`);
      }
    if (mode === 'compensated') {
      const errKeys = new Set(prep.errors.map((e) => e.pieceKey));
      stats.compErrors = (stats.compErrors ?? 0) + errKeys.size;
      // geometry moved the right way, per copy
      for (const c of copies) {
        if (errKeys.has(c.pieceKey)) continue;
        const p = pl[c.key];
        if (!p) continue;
        const xf = placementXform(p, c.h);
        const sheetIdx = prep.materials.find((g) => g.mat === (p.mat ?? d.material.id));
        const sheet = sheetIdx?.sheets[p.sheet];
        if (!sheet) {
          fail('placement sheet missing', c.key);
          continue;
        }
        const mine = sheet.contours.filter((x) => x.ref?.pieceKey === c.key);
        const kerf = profileOf(d, c.mat).kerf;
        const nominal = c.contours.map((x) => xformContour(xf, x.contour));
        if (mine.length !== c.contours.length) {
          fail('compensated copy contour count', `${c.key} ${mine.length} vs ${c.contours.length}`);
          continue;
        }
        mine.forEach((tc, k) => {
          if (tc.op !== 'cut' || !tc.contour.closed) return;
          const a0 = Math.abs(contourArea(nominal[k])), a1 = Math.abs(contourArea(tc.contour));
          const b0 = contourBBox(nominal[k]), b1 = contourBBox(tc.contour);
          if (tc.role === 'outer') {
            if (!(a1 > a0)) fail('outer not grown', `${c.key} area ${a0} -> ${a1}`);
            const dd = [b0.minX - b1.minX, b0.minY - b1.minY, b1.maxX - b0.maxX, b1.maxY - b0.maxY];
            if (dd.some((x) => Math.abs(x - kerf / 2) > 1e-4)) fail('outer bbox not grown by kerf/2', `${c.key} ${dd.map((x) => x.toFixed(5))} kerf=${kerf}`);
          } else if (tc.role === 'hole') {
            // a hole shrinks, except an island (inside a hole) which grows: compensatePiece decides by depth
            if (Math.abs(a1 - a0) < 1e-12) fail('hole unchanged', `${c.key}`);
          }
        });
      }
    }
    // SVG
    try {
      for (const s of prep.sheets) {
        const svg = sheetToSvg(s);
        const info = parseSvg(svg);
        const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
        if (info.width !== `${fmt(s.w)}mm` || info.height !== `${fmt(s.h)}mm` || info.viewBox !== `0 0 ${fmt(s.w)} ${fmt(s.h)}`) fail('svg size/viewBox', `${info.width} ${info.height} ${info.viewBox}`);
        let closedExpected = s.contours.filter((c) => c.contour.closed).length, closedSeen = 0, subs = 0;
        for (const dpath of info.paths) {
          const r = checkPathD(dpath);
          if (r.bad) fail('svg path data', r.bad);
          closedSeen += r.closed;
          subs += r.subpaths;
        }
        if (subs !== s.contours.length) fail('svg subpath count', `${subs} vs ${s.contours.length}`);
        if (closedSeen !== closedExpected) fail('svg closed count', `${closedSeen} vs ${closedExpected}`);
        for (const g of info.groups) if (!Object.values(LAYERS).some((L) => L.hex === g.stroke && g.id.startsWith(L.name))) fail('svg layer group', JSON.stringify(g));
      }
      parseSvg(sheetsToSvg(prep.sheets));
    } catch (e) {
      fail('svg not well-formed', String(e));
    }
    // DXF
    try {
      const dx = parseDxf(sheetsToDxf(prep.sheets));
      const names = new Set(Object.values(LAYERS).map((l) => l.name));
      for (const L of names) if (!dx.layers.includes(L)) fail('dxf missing layer', L);
      for (const e of dx.entities) if (!names.has(e.layer)) fail('dxf entity on unknown layer', e.type + ' ' + e.layer);
      // closed contours -> 1 POLYLINE or CIRCLE each; open -> one LINE/ARC per segment
      const all = prep.sheets.flatMap((s) => s.contours);
      const closedN = all.filter((c) => c.contour.closed).length;
      const openSegs = all.filter((c) => !c.contour.closed).reduce((s, c) => s + c.contour.segs.length, 0);
      const pc = dx.entities.filter((e) => e.type === 'POLYLINE' || e.type === 'CIRCLE').length;
      const la = dx.entities.filter((e) => e.type === 'LINE' || e.type === 'ARC').length;
      if (pc !== closedN || la !== openSegs) fail('dxf entity count', `closed ${pc}/${closedN} open ${la}/${openSegs}`);
      // layers per op
      const byOp = (op: string) => all.filter((c) => c.op === op).length;
      for (const op of ['cut', 'engrave', 'score'] as const) {
        const L = LAYERS[op].name;
        const n = dx.entities.filter((e) => e.layer === L).length;
        if ((byOp(op) > 0) !== (n > 0)) fail('dxf layer mapping', `${op}: ${byOp(op)} contours, ${n} entities`);
      }
    } catch (e) {
      fail('dxf malformed', String(e));
    }
  }
}

