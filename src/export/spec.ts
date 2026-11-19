// The spec sheet (milestone 90, LIDS_LINES_PROJECTS_PLAN.md §9): one page per
// kind of piece, drawn as large as fits an A4 or A3 landscape page at a
// stated scale, with its annotations (milestone 89), the line legend and a
// title block. An SVG with real text, wrapped in a print view whose @page is
// the sheet, so the browser's Save as PDF gives a PDF; no PDF library.
import type { Design } from '../model/types';
import { pieceCopies, type PieceCopy } from '../model/pack';
import { contourPathD } from './svg';
import { LAYERS } from './layers';
import { annotations } from './annotate';
import { fmtNum } from '../i18n';
import { yieldReport } from '../model/split';

export type Paper = 'A4' | 'A3';
const PAPER: Record<Paper, [number, number]> = { A4: [297, 210], A3: [420, 297] };
/** The scales a page may be drawn at, largest first (1 : n). */
export const SCALES = [1, 2, 5, 10, 20];

export type SpecText = { title: string; date: string; material: string; blank: string; pieces: string; glue: string; kerf: string; scale: string; legend: Record<'cut' | 'score' | 'engrave' | 'guide', string>; glueWord: string; unit: string; name: (panelId: string) => string };

/** The largest scale at which a box fits the drawing area (1 : n), or the smallest offered. */
export function fitScale(w: number, h: number, areaW: number, areaH: number): number {
  return SCALES.find((n) => w / n <= areaW && h / n <= areaH) ?? SCALES[SCALES.length - 1];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One page of the spec sheet for a piece, as SVG (mm units). */
export function specPage(d: Design, c: PieceCopy, paper: Paper, tx: SpecText): { svg: string; scale: number } {
  const [W, H] = PAPER[paper];
  const margin = 12, block = 26;
  const areaW = W - 2 * margin, areaH = H - 2 * margin - block;
  const n = fitScale(c.w, c.h, areaW, areaH);
  const k = 1 / n;
  const ox = margin + (areaW - c.w * k) / 2, oy = margin + (areaH - c.h * k) / 2;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Rubik, sans-serif">`);
  out.push(`<g transform="translate(${ox} ${oy}) scale(${k})">`);
  for (const tc of c.contours) {
    const dash = tc.op === 'score' ? ` stroke-dasharray="${4 / k} ${2 / k}"` : '';
    const fill = tc.op === 'engrave' && tc.contour.closed ? '#00000022' : 'none';
    out.push(`<path d="${contourPathD(tc.contour, c.h)}" fill="${fill}" stroke="${LAYERS[tc.op].hex}" stroke-width="${0.3 / k}"${dash}/>`);
  }
  for (const a of annotations(d, c, tx.name, tx.unit)) {
    const anchor = a.kind === 'size' ? 'start' : 'middle';
    const text = a.kind === 'glue' ? tx.glueWord : a.text;
    out.push(`<text x="${a.at.x}" y="${c.h - a.at.y}" font-size="${Math.max(a.size, 2.6 / k)}" text-anchor="${anchor}" fill="${a.kind === 'glue' ? '#8a5a00' : a.kind === 'size' ? '#0f6b3c' : '#333'}">${esc(text)}</text>`);
  }
  out.push('</g>');
  // the title block and the legend at the foot
  const y0 = H - margin - block + 4;
  out.push(`<line x1="${margin}" y1="${y0 - 2}" x2="${W - margin}" y2="${y0 - 2}" stroke="#999" stroke-width="0.2"/>`);
  const rows = [tx.title, `${tx.date} · ${tx.material}`, `${tx.blank} · ${tx.pieces} · ${tx.glue} · ${tx.kerf}`, `${tx.scale.replace('{n}', String(n))}`];
  rows.forEach((r, i) => out.push(`<text x="${margin}" y="${y0 + 4 + i * 5}" font-size="${i === 0 ? 4.2 : 3}" font-weight="${i === 0 ? 700 : 400}">${esc(r)}</text>`));
  (['cut', 'score', 'engrave', 'guide'] as const).forEach((op, i) => {
    const x = W - margin - 4 * 34 + i * 34;
    out.push(`<line x1="${x}" y1="${y0 + 8}" x2="${x + 8}" y2="${y0 + 8}" stroke="${LAYERS[op].hex}" stroke-width="0.6"${op === 'score' ? ' stroke-dasharray="2 1"' : ''}/>`);
    out.push(`<text x="${x + 10}" y="${y0 + 9}" font-size="3">${esc(tx.legend[op])}</text>`);
  });
  out.push('</svg>');
  return { svg: out.join('\n'), scale: n };
}

/** Every kind of piece once (copies alike are one page). */
export function specPages(d: Design, paper: Paper, tx: SpecText): { svg: string; scale: number; key: string }[] {
  const seen = new Set<string>();
  const out: { svg: string; scale: number; key: string }[] = [];
  const y = yieldReport(d);
  for (const c of pieceCopies(d)) {
    if (seen.has(c.pieceKey)) continue;
    seen.add(c.pieceKey);
    const t = { ...tx, blank: tx.blank.replace('{w}', fmtNum(c.w)).replace('{h}', fmtNum(c.h)), pieces: tx.pieces.replace('{n}', String(y.pieces)), glue: tx.glue.replace('{n}', String(y.glue)) };
    out.push({ ...specPage(d, c, paper, t), key: c.pieceKey });
  }
  return out;
}

/** The print view: the pages, each on its own sheet of paper. */
export function specHtml(pages: { svg: string }[], paper: Paper, title: string, dir: 'ltr' | 'rtl'): string {
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page { size: ${paper} landscape; margin: 0 } body { margin: 0 } .page { page-break-after: always; break-after: page } .page:last-child { page-break-after: auto } svg { display: block }</style></head><body>${pages.map((p) => `<div class="page">${p.svg}</div>`).join('')}</body></html>`;
}
