// Import a simple SVG icon as closed polygons (for an engraving or a cutout).
// Accepts path, rect, circle, ellipse, polygon (and polylines that close),
// with transforms. Curves are flattened; very detailed files are simplified.
// Open lines, text and images are refused (or dropped with a note) and the
// reasons are reported so the student knows what to fix.
import type { P2 } from '../model/types';
import { polygonArea } from '../geom/vec';

export type ImportProblem = 'notSvg' | 'noClosed' | 'openDropped' | 'textDropped' | 'imageDropped' | 'simplified';
export type SvgImport = { polys: P2[][]; w: number; h: number; problems: ImportProblem[] };

type M = [number, number, number, number, number, number]; // a b c d e f
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m: M, p: P2): P2 => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

function parseTransform(s: string | null): M {
  let m: M = I;
  if (!s) return m;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = (args.match(/-?[\d.]+(?:e-?\d+)?/gi) ?? []).map(Number);
    let t: M = I;
    if (fn === 'matrix' && a.length === 6) t = a as M;
    else if (fn === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      t = mul(mul([1, 0, 0, 1, cx, cy], [c, sn, -sn, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === 'skewX') t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}

const N = 16; // segments per curve (simplified later if needed)

/** Parse SVG path data into subpaths with a closed flag. */
export function parsePathData(d: string): { pts: P2[]; closed: boolean }[] {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: { pts: P2[]; closed: boolean }[] = [];
  let i = 0, cmd = '', cur: P2 = { x: 0, y: 0 }, start: P2 = { x: 0, y: 0 };
  let pts: P2[] = [];
  let lastCtrl: P2 | null = null, lastQ: P2 | null = null;
  const num = () => Number(toks[i++]);
  const flush = (closed: boolean) => {
    if (pts.length > 1) out.push({ pts, closed });
    pts = [];
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cur.x : 0, oy = rel ? cur.y : 0;
    if (C === 'Z') {
      flush(true);
      cur = start;
      lastCtrl = lastQ = null;
      continue;
    }
    if (i >= toks.length || /[a-zA-Z]/.test(toks[i])) {
      i++;
      continue;
    }
    if (C === 'M') {
      flush(false);
      cur = { x: ox + num(), y: oy + num() };
      start = cur;
      pts.push(cur);
      cmd = rel ? 'l' : 'L';
      lastCtrl = lastQ = null;
    } else if (C === 'L') {
      cur = { x: ox + num(), y: oy + num() };
      pts.push(cur);
      lastCtrl = lastQ = null;
    } else if (C === 'H') {
      cur = { x: ox + num(), y: cur.y };
      pts.push(cur);
      lastCtrl = lastQ = null;
    } else if (C === 'V') {
      cur = { x: cur.x, y: oy + num() };
      pts.push(cur);
      lastCtrl = lastQ = null;
    } else if (C === 'C' || C === 'S') {
      const c1: P2 = C === 'C' ? { x: ox + num(), y: oy + num() } : lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
      const c2 = { x: ox + num(), y: oy + num() }, e = { x: ox + num(), y: oy + num() };
      for (let k = 1; k <= N; k++) {
        const t = k / N, u = 1 - t;
        pts.push({ x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x, y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y });
      }
      lastCtrl = c2;
      lastQ = null;
      cur = e;
    } else if (C === 'Q' || C === 'T') {
      const c1: P2 = C === 'Q' ? { x: ox + num(), y: oy + num() } : lastQ ? { x: 2 * cur.x - lastQ.x, y: 2 * cur.y - lastQ.y } : cur;
      const e = { x: ox + num(), y: oy + num() };
      for (let k = 1; k <= N; k++) {
        const t = k / N, u = 1 - t;
        pts.push({ x: u * u * cur.x + 2 * u * t * c1.x + t * t * e.x, y: u * u * cur.y + 2 * u * t * c1.y + t * t * e.y });
      }
      lastQ = c1;
      lastCtrl = null;
      cur = e;
    } else if (C === 'A') {
      const rx0 = Math.abs(num()), ry0 = Math.abs(num()), phi = (num() * Math.PI) / 180, large = num() !== 0, sweep = num() !== 0;
      const e = { x: ox + num(), y: oy + num() };
      pts.push(...arcPoints(cur, e, rx0, ry0, phi, large, sweep));
      cur = e;
      lastCtrl = lastQ = null;
    } else i++;
  }
  flush(false);
  return out;
}

/** Endpoint-parameterised elliptical arc → points (SVG spec F.6.5). */
function arcPoints(p0: P2, p1: P2, rx: number, ry: number, phi: number, large: boolean, sweep: boolean): P2[] {
  if (rx < 1e-12 || ry < 1e-12) return [p1];
  const c = Math.cos(phi), s = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2;
  const x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = c * cx1 - s * cy1 + (p0.x + p1.x) / 2, cy = s * cx1 + c * cy1 + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil((Math.abs(dt) / (Math.PI * 2)) * 48));
  const out: P2[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t0 + (dt * i) / n;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    out.push(i === n ? p1 : { x: c * ex - s * ey + cx, y: s * ex + c * ey + cy });
  }
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): P2[] {
  return Array.from({ length: 64 }, (_, i) => ({ x: cx + rx * Math.cos((i / 64) * 2 * Math.PI), y: cy + ry * Math.sin((i / 64) * 2 * Math.PI) }));
}

/** Douglas–Peucker for a closed ring. */
function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length < 8) return pts;
  const dp = (a: number, b: number, keep: boolean[]) => {
    let best = -1, bd = tol;
    const A = pts[a], B = pts[b % pts.length];
    const L = Math.hypot(B.x - A.x, B.y - A.y) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const dd = Math.abs((B.x - A.x) * (A.y - P.y) - (A.x - P.x) * (B.y - A.y)) / L;
      if (dd > bd) (bd = dd), (best = i);
    }
    if (best >= 0) {
      keep[best] = true;
      dp(a, best, keep);
      dp(best, b, keep);
    }
  };
  const keep = pts.map(() => false);
  const far = pts.reduce((bi, p, i) => (Math.hypot(p.x - pts[0].x, p.y - pts[0].y) > Math.hypot(pts[bi].x - pts[0].x, pts[bi].y - pts[0].y) ? i : bi), 0);
  keep[0] = keep[far] = true;
  dp(0, far, keep);
  dp(far, pts.length, keep);
  return pts.filter((_, i) => keep[i]);
}

const MAX_POINTS = 4000;

/** Parse SVG text. Returns polygons in a unit box (-0.5..0.5, y up) plus the original aspect. */
export function importSvg(text: string, parser: { parseFromString(s: string, t: string): Document } = new DOMParser()): SvgImport | { error: ImportProblem } {
  let doc: Document;
  try {
    doc = parser.parseFromString(text, 'image/svg+xml');
  } catch {
    return { error: 'notSvg' };
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return { error: 'notSvg' };
  const problems = new Set<ImportProblem>();
  const rings: P2[][] = [];
  const walk = (el: Element, m: M) => {
    const tag = el.nodeName.toLowerCase().replace(/^svg:/, '');
    if (['defs', 'clippath', 'mask', 'symbol', 'style', 'title', 'desc', 'metadata'].includes(tag)) return;
    const mm = mul(m, parseTransform(el.getAttribute('transform')));
    const f = (n: string) => Number(el.getAttribute(n) ?? 0);
    const add = (pts: P2[], closed: boolean) => {
      if (!closed) {
        const a = pts[0], b = pts[pts.length - 1];
        if (pts.length > 2 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) closed = true;
      }
      if (!closed) return problems.add('openDropped');
      const tp = pts.map((p) => ap(mm, p));
      // a number like 1e999 (or a transform that overflows) is not a shape
      if (!tp.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))) return;
      if (tp.length >= 3 && Math.abs(polygonArea(tp)) > 1e-9) rings.push(tp);
    };
    if (tag === 'path') for (const sp of parsePathData(el.getAttribute('d') ?? '')) add(sp.pts, sp.closed);
    else if (tag === 'rect') {
      const [x, y, w, h] = [f('x'), f('y'), f('width'), f('height')];
      if (w > 0 && h > 0) add([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true);
    } else if (tag === 'circle') add(ellipse(f('cx'), f('cy'), f('r'), f('r')), true);
    else if (tag === 'ellipse') add(ellipse(f('cx'), f('cy'), f('rx'), f('ry')), true);
    else if (tag === 'polygon' || tag === 'polyline') {
      const nums = (el.getAttribute('points')?.match(/-?[\d.]+(?:e-?\d+)?/gi) ?? []).map(Number);
      const pts: P2[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      add(pts, tag === 'polygon');
    } else if (tag === 'line') problems.add('openDropped');
    else if (tag === 'text' || tag === 'tspan') problems.add('textDropped');
    else if (tag === 'image') problems.add('imageDropped');
    for (const ch of Array.from(el.children)) walk(ch, mm);
  };
  walk(root, I);
  if (!rings.length) return { error: problems.has('textDropped') ? 'textDropped' : problems.has('imageDropped') ? 'imageDropped' : 'noClosed' };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) for (const p of r) (minX = Math.min(minX, p.x)), (maxX = Math.max(maxX, p.x)), (minY = Math.min(minY, p.y)), (maxY = Math.max(maxY, p.y));
  const w = maxX - minX, h = maxY - minY;
  if (w <= 0 || h <= 0) return { error: 'noClosed' };
  let polys = rings;
  const total = polys.reduce((n, r) => n + r.length, 0);
  if (total > MAX_POINTS) {
    let tol = Math.max(w, h) * 0.0005;
    while (polys.reduce((n, r) => n + r.length, 0) > MAX_POINTS && tol < Math.max(w, h) * 0.02) {
      polys = rings.map((r) => simplify(r, tol)).filter((r) => r.length >= 3);
      tol *= 2;
    }
    problems.add('simplified');
  }
  // unit box, y flipped to y-up
  const unit = polys.map((r) => r.map((p) => ({ x: (p.x - minX) / w - 0.5, y: 0.5 - (p.y - minY) / h })));
  return { polys: unit, w, h, problems: [...problems] };
}
