// Display names for panels. A panel the student has not renamed (its stored
// name is the automatic number) is named by its role: template roles
// (`t:wall0` …) or, for hand-built designs, how it was made (the floor panel,
// the wall grown from its front edge, a divider, a leaning panel). The model
// keeps the stored name; only the display changes, so switching language
// renames parts and old projects get role names too.
import type { Design } from './types';
import { defaultOffset } from './ops';
import { reachFor, sealFor } from './closures';
import { isCurveKey, isRectSketch, panelEdges, rectEdgeIndex, segLength } from './edges';
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
  // a box's lid (milestone 73): a cap is *Lid* with a *Lid rim*, a lid folded off a wall is *Lid* (they were *Panel 6*, *Wall 1*)
  const lid = lidRole(d, id, t);
  if (lid) return lid;
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
    // counted among the straight edges: the facets of a rounded corner or a round base's arcs are not
    // walls (they made "Wall 24", "Wall 47" on a rounded tray)
    const n = panelEdges(d.panels[parentC.a.panelId]).filter((e) => !isCurveKey(e.key)).findIndex((e) => e.key === parentC.a.edge);
    if (n >= 0) return t('part.wallN', { n: n + 1 });
  }
  return t('part.panel', { n: d.order.indexOf(id) + 1 });
}

/** A board's name as part of a box's lid, or null. */
function lidRole(d: Design, id: string, t: T): string | null {
  const trays = Object.values(d.trays ?? {});
  if (trays.some((x) => x.lidOf && x.baseId === id)) return t('part.lid');
  const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === id);
  if (!c) return null;
  const tray = c.trayId ? d.trays?.[c.trayId] : undefined;
  if (tray?.lidOf) {
    // a cap's rim: by its side on a rectangle, else numbered
    const base = d.panels[tray.baseId];
    const side = base && isRectSketch(base) ? rectEdgeIndex(c.a.edge) : null;
    if (side !== null) return t('part.lidRimSide', { side: t(SIDE[side]) });
    const n = base ? panelEdges(base).filter((e) => !isCurveKey(e.key)).findIndex((e) => e.key === c.a.edge) : -1;
    return t('part.lidRimN', { n: n + 1 });
  }
  // folded off a box wall's top edge, across the box: a lid (a tuck top, a living hinge, an arched lid)
  const wallC = Object.values(d.connections).find((x) => x.grown && x.b.panelId === c.a.panelId);
  const onWallTop = !!wallC?.trayId && c.a.edge.split('#')[0] === 'e2' && Math.abs(c.angle - 90) < 1e-6;
  if (onWallTop && (id.endsWith('/top') || sealFor(d, d.panels[id], c.a.panelId, c.id) || reachesAcross(d, id, c.a.panelId, c.id))) return t('part.lid');
  // an arched lid's front flap
  if (c.kind === 'fold' && lidRole(d, c.a.panelId, t) === t('part.lid') && !trays.some((x) => x.lidOf && x.baseId === c.a.panelId)) return t('part.lidFlap');
  return null;
}

/** An arched lid reaches the far wall at its depth (its flap goes down inside it). */
function reachesAcross(d: Design, id: string, parentId: string, cid: string): boolean {
  const r = reachFor(d, d.panels[id], parentId, cid);
  return !!r && Object.values(d.connections).some((x) => x.grown && x.kind === 'fold' && x.a.panelId === id);
}

/**
 * An issue's message variables with its boards named as the rest of the
 * editor names them. The checks store a board's own name, which for a board
 * the student never named is a bare number ("The bend between 3 and 4"):
 * each name is mapped back to the board the issue points at (its target, or
 * the pair of a joint message) and shown as its label ("Front wall").
 */
export function issueVars(d: Design, i: { vars: Record<string, string | number>; target: { kind: 'panel' | 'detail'; id: string }; pair?: [string, string] }, t: T): Record<string, string | number> {
  const v = { ...i.vars };
  const targetPanel = i.target.kind === 'panel' ? i.target.id : d.order.find((id) => d.panels[id]?.details.some((x) => x.id === i.target.id));
  const swap = (k: string, id: string | undefined) => {
    const p = id ? d.panels[id] : undefined;
    if (p && typeof v[k] === 'string' && (v[k] === p.name || v[k] === '?')) v[k] = panelLabel(d, id!, t);
  };
  if (i.pair) {
    swap('a', i.pair[0]);
    swap('b', i.pair[1]);
    // a bend's message: the board it bends (the target) and the one it bends off
    swap('other', i.pair[0] === targetPanel ? i.pair[1] : i.pair[0]);
  }
  swap('panel', targetPanel);
  return v;
}
