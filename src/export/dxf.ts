// DXF R12 writer (millimetres, $INSUNITS 4). Closed contours are written as
// closed POLYLINEs with bulges so arcs stay arcs; whole circles as CIRCLE;
// open contours as LINE/ARC entities. One layer per operation.
import type { Contour, TaggedContour } from '../geom/types';
import { arcSweep, dist } from '../geom/vec';
import { LAYERS, OP_ORDER } from './layers';
import { fmt } from './svg';
import type { PreparedSheet } from './prepare';

const pair = (code: number, value: string | number) => `${code}\n${value}\n`;

function isCircle(c: Contour) {
  if (!c.closed || c.segs.length !== 2) return false;
  const [s0, s1] = c.segs;
  return s0.k === 'A' && s1.k === 'A' && dist(s0.c, s1.c) < 1e-9 && Math.abs(s0.r - s1.r) < 1e-9 && s0.ccw === s1.ccw;
}

function entity(tc: TaggedContour, dx: number, dy: number): string {
  const layer = LAYERS[tc.op].name;
  const c = tc.contour;
  const X = (x: number) => fmt(x + dx), Y = (y: number) => fmt(y + dy);
  if (isCircle(c)) {
    const s = c.segs[0] as Extract<Contour['segs'][number], { k: 'A' }>;
    return pair(0, 'CIRCLE') + pair(8, layer) + pair(10, X(s.c.x)) + pair(20, Y(s.c.y)) + pair(30, 0) + pair(40, fmt(s.r));
  }
  if (c.closed) {
    let out = pair(0, 'POLYLINE') + pair(8, layer) + pair(66, 1) + pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(70, 1);
    for (const s of c.segs) {
      out += pair(0, 'VERTEX') + pair(8, layer) + pair(10, X(s.a.x)) + pair(20, Y(s.a.y)) + pair(30, 0);
      if (s.k === 'A') out += pair(42, fmt(Math.tan(arcSweep(s) / 4)));
    }
    return out + pair(0, 'SEQEND') + pair(8, layer);
  }
  let out = '';
  for (const s of c.segs) {
    if (s.k === 'L') {
      out += pair(0, 'LINE') + pair(8, layer) + pair(10, X(s.a.x)) + pair(20, Y(s.a.y)) + pair(30, 0) + pair(11, X(s.b.x)) + pair(21, Y(s.b.y)) + pair(31, 0);
    } else {
      const [p, q] = s.ccw ? [s.a, s.b] : [s.b, s.a];
      const deg = (v: { x: number; y: number }) => ((Math.atan2(v.y - s.c.y, v.x - s.c.x) * 180) / Math.PI + 360) % 360;
      out += pair(0, 'ARC') + pair(8, layer) + pair(10, X(s.c.x)) + pair(20, Y(s.c.y)) + pair(30, 0) + pair(40, fmt(s.r)) + pair(50, fmt(deg(p))) + pair(51, fmt(deg(q)));
    }
  }
  return out;
}

export function sheetsToDxf(sheets: PreparedSheet[], gap = 20): string {
  const w = Math.max(...sheets.map((s) => s.w));
  const h = sheets.reduce((a, s) => a + s.h, 0) + gap * (sheets.length - 1);
  let out = pair(0, 'SECTION') + pair(2, 'HEADER');
  out += pair(9, '$ACADVER') + pair(1, 'AC1009');
  out += pair(9, '$INSUNITS') + pair(70, 4);
  out += pair(9, '$MEASUREMENT') + pair(70, 1);
  out += pair(9, '$EXTMIN') + pair(10, 0) + pair(20, 0) + pair(30, 0);
  out += pair(9, '$EXTMAX') + pair(10, fmt(w)) + pair(20, fmt(h)) + pair(30, 0);
  out += pair(0, 'ENDSEC');
  out += pair(0, 'SECTION') + pair(2, 'TABLES') + pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, OP_ORDER.length);
  for (const op of OP_ORDER) {
    const L = LAYERS[op];
    out += pair(0, 'LAYER') + pair(2, L.name) + pair(70, 0) + pair(62, L.aci) + pair(6, 'CONTINUOUS');
  }
  out += pair(0, 'ENDTAB') + pair(0, 'ENDSEC');
  out += pair(0, 'SECTION') + pair(2, 'ENTITIES');
  // Sheets stacked downward from the top, like the SVG multi-sheet file.
  let top = h;
  for (const s of sheets) {
    const dy = top - s.h;
    for (const op of OP_ORDER) for (const tc of s.contours.filter((c) => c.op === op)) out += entity(tc, 0, dy);
    top -= s.h + gap;
  }
  out += pair(0, 'ENDSEC') + pair(0, 'EOF');
  return out;
}
