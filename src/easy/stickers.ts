// Quick build's stickers (milestone 38): a small set of simple line icons,
// drawn for CutForge (see THIRD_PARTY.md), stored like an imported SVG: closed
// polylines in a unit box centred on (0, 0), y up. Nothing is fetched.
import type { P2 } from '../model/types';
import type { MsgKey } from '../i18n';

const ring = (n: number, f: (a: number) => P2): P2[] => Array.from({ length: n }, (_, i) => f((2 * Math.PI * i) / n));
const circle = (cx: number, cy: number, r: number, n = 32): P2[] => ring(n, (a) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }));

function star(points = 5, ro = 0.5, ri = 0.2): P2[] {
  return ring(points * 2, (a) => {
    const i = Math.round((a * points) / Math.PI);
    const r = i % 2 === 0 ? ro : ri;
    const t = Math.PI / 2 + (Math.PI * i) / points;
    return { x: r * Math.cos(t), y: r * Math.sin(t) - 0.04 };
  });
}

function heart(): P2[] {
  // the classic parametric heart, scaled into the unit box
  const pts = ring(48, (t) => ({ x: 16 * Math.sin(t) ** 3, y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) }));
  return pts.map((p) => ({ x: p.x / 34, y: (p.y + 2.5) / 34 }));
}

function moon(): P2[] {
  // a crescent: the arc of one circle outside a second, then the second's arc back inside the first
  const c1 = { x: 0, y: 0, r: 0.46 }, c2 = { x: 0.2, y: 0.12, r: 0.4 };
  const inC = (p: P2, c: { x: number; y: number; r: number }) => Math.hypot(p.x - c.x, p.y - c.y) < c.r;
  const arc = (c: { x: number; y: number; r: number }, keep: (p: P2) => boolean) => {
    const pts = circle(c.x, c.y, c.r, 96);
    // start just after a dropped point, so the kept points run in one piece
    const s0 = pts.findIndex((p, i) => !keep(p) && keep(pts[(i + 1) % pts.length]));
    return Array.from({ length: pts.length }, (_, i) => pts[(s0 + 1 + i) % pts.length]).filter(keep);
  };
  return [...arc(c1, (p) => !inC(p, c2)), ...arc(c2, (p) => inC(p, c1)).reverse()];
}

function flower(): P2[][] {
  const petals = ring(120, (a) => {
    const r = 0.32 + 0.16 * Math.abs(Math.cos(2.5 * a));
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
  return [petals, circle(0, 0, 0.12, 24)];
}

function smile(): P2[][] {
  const mouth = [
    ...Array.from({ length: 13 }, (_, i) => {
      const a = Math.PI + 0.5 + ((Math.PI - 1) * i) / 12;
      return { x: 0.24 * Math.cos(a), y: -0.02 + 0.24 * Math.sin(a) };
    }),
    ...Array.from({ length: 13 }, (_, i) => {
      const a = 2 * Math.PI - 0.5 - ((Math.PI - 1) * i) / 12;
      return { x: 0.2 * Math.cos(a), y: -0.04 + 0.16 * Math.sin(a) };
    }),
  ];
  return [circle(0, 0, 0.48, 40), circle(-0.16, 0.13, 0.06, 16), circle(0.16, 0.13, 0.06, 16), mouth];
}

/** A sticker: its name in the interface and its outlines. */
export type Sticker = { id: string; key: MsgKey; polys: P2[][] };

export const STICKERS: Sticker[] = [
  { id: 'star', key: 'sticker.star', polys: [star()] },
  { id: 'heart', key: 'sticker.heart', polys: [heart()] },
  { id: 'house', key: 'sticker.house', polys: [[{ x: -0.4, y: -0.45 }, { x: 0.4, y: -0.45 }, { x: 0.4, y: 0.08 }, { x: 0.5, y: 0.08 }, { x: 0, y: 0.48 }, { x: -0.5, y: 0.08 }, { x: -0.4, y: 0.08 }], [{ x: -0.1, y: -0.45 }, { x: 0.1, y: -0.45 }, { x: 0.1, y: -0.12 }, { x: -0.1, y: -0.12 }].reverse()] },
  { id: 'bolt', key: 'sticker.bolt', polys: [[{ x: 0.1, y: 0.5 }, { x: -0.3, y: -0.04 }, { x: -0.02, y: -0.04 }, { x: -0.12, y: -0.5 }, { x: 0.3, y: 0.08 }, { x: 0.02, y: 0.08 }]] },
  { id: 'moon', key: 'sticker.moon', polys: [moon()] },
  { id: 'flower', key: 'sticker.flower', polys: flower() },
  { id: 'smile', key: 'sticker.smile', polys: smile() },
  { id: 'tree', key: 'sticker.tree', polys: [[{ x: -0.06, y: -0.5 }, { x: 0.06, y: -0.5 }, { x: 0.06, y: -0.3 }, { x: 0.4, y: -0.3 }, { x: 0.16, y: -0.02 }, { x: 0.3, y: -0.02 }, { x: 0.08, y: 0.24 }, { x: 0.18, y: 0.24 }, { x: 0, y: 0.5 }, { x: -0.18, y: 0.24 }, { x: -0.08, y: 0.24 }, { x: -0.3, y: -0.02 }, { x: -0.16, y: -0.02 }, { x: -0.4, y: -0.3 }, { x: -0.06, y: -0.3 }]] },
];

export const stickerById = (id: string) => STICKERS.find((s) => s.id === id) ?? STICKERS[0];

/** A sticker's size on a panel when placed: a quarter of the panel's smaller side, 15–60 mm. */
export const stickerSize = (w: number, h: number) => Math.round(Math.max(15, Math.min(60, Math.min(w, h) / 4)));
