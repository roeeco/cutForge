// Independent structural checks for the SVG and DXF writers and for packing.
import { SaxesParser } from 'saxes';
import type { Contour } from '../../src/geom/types';
import type { PreparedSheet } from '../../src/export/prepare';

export function finiteContour(c: Contour): boolean {
  for (const s of c.segs) {
    for (const p of [s.a, s.b]) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (s.k === 'A' && (!Number.isFinite(s.r) || !Number.isFinite(s.c.x) || !Number.isFinite(s.c.y) || s.r <= 0)) return false;
  }
  return true;
}

/** Closed contours: each segment starts where the previous ended, last ends at first's start. */
export function chained(c: Contour, eps = 1e-6): boolean {
  for (let i = 0; i + 1 < c.segs.length; i++) {
    const a = c.segs[i].b, b = c.segs[i + 1].a;
    if (Math.hypot(a.x - b.x, a.y - b.y) > eps) return false;
  }
  if (c.closed && c.segs.length) {
    const a = c.segs[c.segs.length - 1].b, b = c.segs[0].a;
    if (Math.hypot(a.x - b.x, a.y - b.y) > eps) return false;
  }
  return true;
}

export type SvgInfo = { width: string; height: string; viewBox: string; paths: string[]; groups: { id: string; stroke: string }[] };

export function parseSvg(text: string): SvgInfo {
  const p = new SaxesParser({ xmlns: true });
  const info: SvgInfo = { width: '', height: '', viewBox: '', paths: [], groups: [] };
  let depth = 0;
  p.on('opentag', (t) => {
    depth++;
    const a = (k: string) => (t.attributes[k] as any)?.value ?? '';
    if (t.local === 'svg') {
      info.width = a('width');
      info.height = a('height');
      info.viewBox = a('viewBox');
    } else if (t.local === 'g') info.groups.push({ id: a('id'), stroke: a('stroke') });
    else if (t.local === 'path') info.paths.push(a('d'));
  });
  p.on('closetag', () => depth--);
  p.on('error', (e) => {
    throw e;
  });
  p.write(text).close();
  if (depth !== 0) throw new Error('unbalanced');
  return info;
}

/** Path data: only M/L/A/Z with finite numbers; every subpath closed or open as stated. Returns subpath count. */
export function checkPathD(d: string): { subpaths: number; closed: number; bad?: string } {
  const toks = d.match(/[MLAZ]|-?\d+(\.\d+)?(e-?\d+)?/g) ?? [];
  const joined = toks.join('');
  const stripped = d.replace(/[\s,]/g, '');
  if (joined.length !== stripped.length) return { subpaths: 0, closed: 0, bad: 'junk in path: ' + d.slice(0, 120) };
  let sub = 0, closed = 0, i = 0;
  const need = (n: number) => {
    for (let k = 1; k <= n; k++) if (!/^-?\d/.test(toks[i + k] ?? '')) throw new Error('arg');
  };
  try {
    while (i < toks.length) {
      const t = toks[i];
      if (t === 'M') {
        need(2);
        sub++;
        i += 3;
      } else if (t === 'L') {
        need(2);
        i += 3;
      } else if (t === 'A') {
        need(7);
        if (!['0', '1'].includes(toks[i + 4]) || !['0', '1'].includes(toks[i + 5])) return { subpaths: sub, closed, bad: 'arc flags' };
        if (+toks[i + 1] <= 0) return { subpaths: sub, closed, bad: 'arc radius ' + toks[i + 1] };
        i += 8;
      } else if (t === 'Z') {
        closed++;
        i++;
      } else return { subpaths: sub, closed, bad: 'token ' + t };
    }
  } catch {
    return { subpaths: sub, closed, bad: 'args ' + d.slice(0, 120) };
  }
  return { subpaths: sub, closed };
}

export type DxfEntity = { type: string; layer: string; codes: [number, string][] };

/** A strict-ish DXF R12 reader: sections, layer table, entities with POLYLINE/VERTEX/SEQEND. */
export function parseDxf(text: string): { layers: string[]; entities: DxfEntity[]; header: Record<string, string[]> } {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length % 2) throw new Error('odd line count');
  const pairs: [number, string][] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const c = lines[i].trim();
    if (!/^-?\d+$/.test(c)) throw new Error(`bad group code at line ${i}: ${c}`);
    pairs.push([+c, lines[i + 1]]);
  }
  for (const [c, v] of pairs) {
    if ((c >= 10 && c <= 59) || (c >= 40 && c <= 51)) {
      if (!Number.isFinite(+v) || v.trim() === '') throw new Error(`non-finite value for code ${c}: ${v}`);
    }
  }
  const layers: string[] = [];
  const entities: DxfEntity[] = [];
  const header: Record<string, string[]> = {};
  let i = 0;
  const at = (c: number, v?: string) => pairs[i] && pairs[i][0] === c && (v === undefined || pairs[i][1] === v);
  while (i < pairs.length && !at(0, 'EOF')) {
    if (!at(0, 'SECTION')) throw new Error(`expected SECTION at pair ${i}: ${pairs[i]}`);
    i++;
    if (!at(2)) throw new Error('section name');
    const name = pairs[i][1];
    i++;
    if (name === 'HEADER') {
      let cur = '';
      while (!at(0, 'ENDSEC')) {
        if (at(9)) {
          cur = pairs[i][1];
          header[cur] = [];
        } else header[cur].push(pairs[i][1]);
        i++;
      }
    } else if (name === 'TABLES') {
      while (!at(0, 'ENDSEC')) {
        if (at(0, 'LAYER')) {
          i++;
          while (!at(0)) {
            if (at(2)) layers.push(pairs[i][1]);
            i++;
          }
          continue;
        }
        i++;
      }
    } else if (name === 'ENTITIES') {
      while (!at(0, 'ENDSEC')) {
        if (!at(0)) throw new Error(`expected entity at ${i}`);
        const type = pairs[i][1];
        i++;
        const codes: [number, string][] = [];
        while (i < pairs.length && !at(0)) codes.push(pairs[i++]);
        const layer = codes.find((c) => c[0] === 8)?.[1] ?? '';
        if (type === 'POLYLINE') {
          const verts: DxfEntity[] = [];
          while (at(0, 'VERTEX')) {
            i++;
            const vc: [number, string][] = [];
            while (!at(0)) vc.push(pairs[i++]);
            verts.push({ type: 'VERTEX', layer: vc.find((c) => c[0] === 8)?.[1] ?? '', codes: vc });
          }
          if (!at(0, 'SEQEND')) throw new Error('POLYLINE without SEQEND');
          i++;
          while (!at(0)) i++;
          entities.push({ type, layer, codes: [...codes, ...verts.flatMap((v) => [[0, 'VERTEX'] as [number, string], ...v.codes])] });
          if (verts.length < 2) throw new Error(`POLYLINE with ${verts.length} vertices`);
        } else if (type === 'VERTEX' || type === 'SEQEND') throw new Error(`stray ${type}`);
        else entities.push({ type, layer, codes });
      }
    } else throw new Error('unknown section ' + name);
    if (!at(0, 'ENDSEC')) throw new Error('missing ENDSEC');
    i++;
  }
  if (!at(0, 'EOF')) throw new Error('missing EOF');
  return { layers, entities, header };
}

export const sheetContourCount = (sheets: PreparedSheet[]) => sheets.reduce((s, x) => s + x.contours.length, 0);
