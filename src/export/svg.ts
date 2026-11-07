// SVG writer: true-size millimetre documents for LightBurn (y flipped to SVG's y-down).
import type { Contour, TaggedContour } from '../geom/types';
import { arcSweep } from '../geom/vec';
import { LAYERS, OP_ORDER } from './layers';
import type { PreparedSheet } from './prepare';

export const fmt = (n: number) => {
  const s = (Math.round(n * 10000) / 10000).toFixed(4).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

export function contourPathD(c: Contour, H: number, dx = 0, dy = 0): string {
  if (!c.segs.length) return '';
  const X = (x: number) => fmt(x + dx), Y = (y: number) => fmt(H - y + dy);
  let d = `M${X(c.segs[0].a.x)} ${Y(c.segs[0].a.y)}`;
  c.segs.forEach((s, i) => {
    const last = c.closed && i === c.segs.length - 1;
    if (s.k === 'L') {
      d += last ? '' : ` L${X(s.b.x)} ${Y(s.b.y)}`;
    } else {
      const sw = arcSweep(s);
      d += ` A${fmt(s.r)} ${fmt(s.r)} 0 ${Math.abs(sw) > Math.PI + 1e-9 ? 1 : 0} ${s.ccw ? 0 : 1} ${X(s.b.x)} ${Y(s.b.y)}`;
    }
  });
  return c.closed ? d + ' Z' : d;
}

function groups(contours: TaggedContour[], H: number, dx: number, dy: number, indent: string) {
  let out = '';
  for (const op of OP_ORDER) {
    const cs = contours.filter((c) => c.op === op);
    if (!cs.length) continue;
    const L = LAYERS[op];
    out += `${indent}<g id="${L.name}${dy ? '-' + Math.round(dy) : ''}" fill="none" stroke="${L.hex}" stroke-width="0.1">\n`;
    // an engraved shape with several outlines (text, imported icons) is one path, so
    // letter counters are holes when LightBurn fills it (even-odd)
    const groupsBy = new Map<string, TaggedContour[]>();
    cs.forEach((c, i) => {
      const k = op === 'engrave' && c.ref?.detailId ? `${c.ref.pieceKey ?? ''}|${c.ref.detailId}` : `#${i}`;
      groupsBy.set(k, [...(groupsBy.get(k) ?? []), c]);
    });
    for (const g of groupsBy.values()) {
      const d = g.map((c) => contourPathD(c.contour, H, dx, dy)).join(' ');
      out += `${indent}  <path d="${d}"${g.length > 1 ? ' fill-rule="evenodd"' : ''}/>\n`;
    }
    out += `${indent}</g>\n`;
  }
  return out;
}

const header = (w: number, h: number) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">\n`;

export function sheetToSvg(sheet: PreparedSheet): string {
  return header(sheet.w, sheet.h) + groups(sheet.contours, sheet.h, 0, 0, '  ') + '</svg>\n';
}

/** All sheets in one file, stacked top to bottom with a gap. */
export function sheetsToSvg(sheets: PreparedSheet[], gap = 20): string {
  const w = Math.max(...sheets.map((s) => s.w));
  const h = sheets.reduce((a, s) => a + s.h, 0) + gap * (sheets.length - 1);
  let out = header(w, h);
  let y = 0;
  for (const s of sheets) {
    out += groups(s.contours, s.h, 0, y, '  ');
    y += s.h + gap;
  }
  return out + '</svg>\n';
}

/** Small preview for the teacher's list: cropped to the pieces, strokes visible at thumbnail size. */
export function sheetPreviewSvg(sheet: PreparedSheet): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of sheet.contours)
    for (const s of c.contour.segs)
      for (const p of [s.a, s.b]) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
  if (!Number.isFinite(minX)) return sheetToSvg(sheet);
  const pad = 4, w = maxX - minX + 2 * pad, h = maxY - minY + 2 * pad;
  const sw = Math.max(w, h) / 150;
  const body = groups(sheet.contours, sheet.h, 0, 0, '  ').replace(/stroke-width="0\.1"/g, `stroke-width="${fmt(sw)}"`);
  const y0 = sheet.h - maxY - pad;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(minX - pad)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}">\n${body}</svg>\n`;
}
