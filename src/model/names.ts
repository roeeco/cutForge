// Display names for panels. A panel the student has not renamed (its stored
// name is the automatic number) is named by its role: template roles
// (`t:wall0` …) or, for hand-built designs, how it was made (the floor panel,
// the wall grown from its front edge, a divider, a leaning panel). The model
// keeps the stored name; only the display changes, so switching language
// renames parts and old projects get role names too.
import type { Design } from './types';
import { defaultOffset } from './ops';
import { isRectSketch, panelEdges, rectEdgeIndex, segLength } from './edges';
import type { MsgKey } from '../i18n';

type T = (key: MsgKey, vars?: Record<string, string | number>) => string;

const SIDE: MsgKey[] = ['part.front', 'part.right', 'part.back', 'part.left'];

export function isAutoName(name: string): boolean {
  return !name.trim() || /^\d+$/.test(name.trim());
}

function templateRole(t: T, id: string): string | null {
  const m = /^t:(lid)?(base|wall(\d)|divX(\d+)|divY(\d+)|side(\d+)|support(\d+)|lip)$/.exec(id);
  if (!m) return null;
  const lid = !!m[1];
  if (m[2] === 'base') return t(lid ? 'part.lidTop' : 'part.base');
  if (m[3] !== undefined) return t(lid ? 'part.lidWall' : 'part.wallSide', { side: t(SIDE[Number(m[3])]) });
  if (m[4] !== undefined) return t('part.divider', { n: m[4] });
  if (m[5] !== undefined) return t('part.crossDivider', { n: m[5] });
  if (m[6] !== undefined) return t('part.sideWall');
  if (m[7] !== undefined) return t('part.support', { n: m[7] });
  return t('part.lip');
}

/**
 * Display name of a panel edge: front/right/back/left on a rectangle sketch
 * (with the piece number when a cut split it), otherwise "edge n", counting
 * only edges long enough to grow from.
 */
export function edgeLabel(d: Design, panelId: string, key: string, t: T): string {
  const p = d.panels[panelId];
  const m = /^(e[0-3])(?:#(\d+))?$/.exec(key);
  const i = m ? rectEdgeIndex(m[1]) : null;
  if (p && i !== null && isRectSketch(p)) {
    const name = t(`edge.name.${i}` as MsgKey);
    return m![2] !== undefined ? `${name} (${Number(m![2]) + 1})` : name;
  }
  const n = p ? panelEdges(p).filter((e) => segLength(e) >= 5).findIndex((e) => e.key === key) : -1;
  return t('edge.nameN', { n: n + 1 });
}

export function panelLabel(d: Design, id: string, t: T): string {
  const p = d.panels[id];
  if (!p) return '?';
  if (!isAutoName(p.name)) return p.name;
  const tr = templateRole(t, id);
  if (tr) return tr;
  const conns = Object.values(d.connections);
  // a divider (milestone 44): numbered among the dividers
  if (p.divider) return t('part.divider', { n: d.order.filter((x) => d.panels[x]?.divider).indexOf(id) + 1 });
  const parentC = conns.find((c) => c.grown && c.b.panelId === id);
  if (!parentC) {
    const roots = d.order.filter((x) => !d.panels[x]?.divider && !conns.some((c) => c.grown && c.b.panelId === x));
    return roots[0] === id ? t('part.base') : t('part.panel', { n: roots.indexOf(id) + 1 });
  }
  if (parentC.kind === 'lean') return t('part.leaning');
  const isDivider = (c: (typeof conns)[number]) => c.offset > defaultOffset(d, c.kind) + 1e-6;
  if (isDivider(parentC)) {
    const divs = d.order.filter((x) => conns.some((c) => c.grown && c.b.panelId === x && isDivider(c)));
    return t('part.divider', { n: divs.indexOf(id) + 1 });
  }
  const parentIsRoot = !conns.some((c) => c.grown && c.b.panelId === parentC.a.panelId);
  const side = parentIsRoot && isRectSketch(d.panels[parentC.a.panelId]) ? rectEdgeIndex(parentC.a.edge) : null;
  if (side !== null && Math.abs(parentC.angle - 90) < 1e-6) return t('part.wallSide', { side: t(SIDE[side]) });
  if (parentIsRoot && side === null && Math.abs(parentC.angle - 90) < 1e-6) {
    const n = panelEdges(d.panels[parentC.a.panelId]).findIndex((e) => e.key === parentC.a.edge);
    if (n >= 0) return t('part.wallN', { n: n + 1 });
  }
  return t('part.panel', { n: d.order.indexOf(id) + 1 });
}
