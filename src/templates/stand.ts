// Card / tile stand: a base with side walls and leaning supports.
// Plywood: supports lean at the chosen angle, held by angled slots in the
// side walls. Card/corrugated: folded side walls, supports glued with flaps
// to the base and the side walls, and a folded front lip.
import type { TemplateDef } from './types';
import { addRootPanel, addSideWalls, connectSeam, connectSeams, edgeConnection, growPanel } from '../model/ops';
import { findOpenSeams } from '../model/seams';

export const SUPPORT_HEIGHT = 50;

/** Distance along the base between supports: card thickness + room + support thickness, across the lean. */
export function standLayout(t: number, cardT: number, angle: number, slots: number) {
  const s = Math.sin((angle * Math.PI) / 180);
  const step = (cardT + 3 + t) / s;
  const offsets = Array.from({ length: slots }, (_, k) => 6 + (k + 1) * step);
  const reach = offsets[offsets.length - 1] + SUPPORT_HEIGHT * Math.cos((angle * Math.PI) / 180) + t / s;
  return { offsets, reach };
}

export const stand: TemplateDef = {
  id: 'stand',
  version: 1,
  name: 'tpl.stand',
  description: 'tpl.stand.desc',
  materials: ['plywood', 'corrugated', 'card'],
  params: [
    { key: 'cardWidth', label: 'tpl.cardWidth', type: 'number', unit: 'mm', min: 20, max: 300, default: 90 },
    { key: 'cardThickness', label: 'tpl.cardThickness', type: 'number', unit: 'mm', min: 0.2, max: 20, default: 2 },
    { key: 'angle', label: 'tpl.angle', type: 'choice', options: ([15, 30, 45, 60] as const).map((a) => ({ value: a, label: `tpl.angle${a}` as const })), default: 60 },
    { key: 'slots', label: 'tpl.slots', type: 'int', min: 1, max: 8, default: 3 },
    { key: 'baseDepth', label: 'tpl.baseDepth', type: 'number', unit: 'mm', min: 30, max: 380, default: 120 },
  ],
  generate(d, p, role) {
    const t = d.material.thickness;
    const ply = d.material.kind === 'plywood';
    const angle = Number(p.angle);
    const W = Number(p.cardWidth) + 4 + 2 * t, D = Number(p.baseDepth);
    const base = addRootPanel(d, -W / 2, D / 2, W, D);
    role('base', base);
    const { offsets } = standLayout(t, Number(p.cardThickness), angle, Math.round(Number(p.slots)));
    if (ply) addSideWalls(d, base, 0, angle, SUPPORT_HEIGHT);
    else {
      const h = Math.ceil(t + SUPPORT_HEIGHT * Math.sin((angle * Math.PI) / 180) + 5);
      for (const e of [1, 3]) growPanel(d, base, e, { height: h, angle: 90, dir: 'up', kind: 'fold' });
    }
    for (const e of [1, 3]) {
      const c = edgeConnection(d, base, e);
      if (c) role(`side${e}`, c.b.panelId);
    }
    offsets.forEach((off, k) => {
      const r = growPanel(d, base, 0, { height: SUPPORT_HEIGHT, angle, dir: 'up', kind: ply ? 'lean' : 'glue', offset: off });
      if (!r) return;
      role(`support${k + 1}`, r.panelId);
      if (!ply) for (const s of findOpenSeams(d, r.panelId)) connectSeam(d, s, 'glue');
    });
    // a low front lip stops the first card sliding off
    const lip = growPanel(d, base, 0, { height: ply ? 10 + t : 10, angle: 90, dir: 'up', kind: ply ? 'finger' : 'fold' });
    if (lip) {
      role('lip', lip.panelId);
      connectSeams(d, lip.panelId);
    }
  },
  check(d, p) {
    const { reach } = standLayout(d.material.thickness, Number(p.cardThickness), Number(p.angle), Math.round(Number(p.slots)));
    return reach > Number(p.baseDepth) - d.material.thickness ? [{ key: 'val.standDepth', vars: {}, panel: 't:base' }] : [];
  },
};
