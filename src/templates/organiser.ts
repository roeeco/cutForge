// Organiser with dividers: plywood (finger-jointed box, slotted dividers) or
// corrugated/card (folded tray with glue flaps, sliding dividers), with an
// optional lift-off lid (a shallow upside-down tray whose inner size is the
// box's outer size plus twice the clearance).
import type { TemplateDef } from './types';
import { addDivider, addRootPanel, connectSeams, growPanel } from '../model/ops';
import type { ConnectionKind, Design } from '../model/types';

function tray(d: Design, x: number, z: number, W: number, D: number, H: number, prefix: string, role: (n: string, id: string) => void) {
  const ply = d.material.kind === 'plywood';
  const kind: ConnectionKind = ply ? 'finger' : 'fold';
  const t = d.material.thickness;
  const base = addRootPanel(d, x, z, W, D);
  role(`${prefix}base`, base);
  // outer height H from the underside: finger walls overlap the base, folded walls stand on it
  const wallH = ply ? H : H - t;
  const walls = [0, 1, 2, 3].map((e) => {
    const r = growPanel(d, base, e, { height: wallH, angle: 90, dir: 'up', kind })!;
    role(`${prefix}wall${e}`, r.panelId);
    return r.panelId;
  });
  // folded trays keep glue-flap corners (one net)
  for (const w of walls) connectSeams(d, w, ply ? undefined : 'glue');
  return base;
}

export const organiser: TemplateDef = {
  id: 'organiser',
  version: 1,
  name: 'tpl.organiser',
  description: 'tpl.organiser.desc',
  materials: ['plywood', 'corrugated', 'card'],
  params: [
    { key: 'sizeMode', label: 'tpl.sizeMode', type: 'choice', options: [{ value: 'inner', label: 'tpl.inner' }, { value: 'outer', label: 'tpl.outer' }], default: 'inner' },
    { key: 'width', label: 'tpl.width', type: 'number', unit: 'mm', min: 30, max: 580, default: 160 },
    { key: 'depth', label: 'tpl.depth', type: 'number', unit: 'mm', min: 30, max: 380, default: 110 },
    { key: 'height', label: 'tpl.height', type: 'number', unit: 'mm', min: 10, max: 300, default: 45 },
    { key: 'dividersX', label: 'tpl.dividersX', type: 'int', min: 0, max: 10, default: 2 },
    { key: 'dividersY', label: 'tpl.dividersY', type: 'int', min: 0, max: 10, default: 1 },
    { key: 'dividerHeight', label: 'tpl.dividerHeight', type: 'number', unit: 'mm', min: 5, max: 300, default: 35 },
    { key: 'lid', label: 'tpl.lid', type: 'choice', options: [{ value: 'none', label: 'tpl.lid.none' }, { value: 'liftoff', label: 'tpl.lid.liftoff' }], default: 'none' },
    { key: 'lidRim', label: 'tpl.lidRim', type: 'number', unit: 'mm', min: 5, max: 100, default: 15 },
  ],
  generate(d, p, role) {
    const t = d.material.thickness, c = d.material.clearance;
    const inner = p.sizeMode === 'inner';
    const W = Number(p.width) + (inner ? 2 * t : 0);
    const D = Number(p.depth) + (inner ? 2 * t : 0);
    const H = Number(p.height) + (inner ? t : 0);
    const base = tray(d, -W / 2, D / 2, W, D, H, '', role);
    // dividers spaced evenly in the clear inside
    const nx = Math.round(Number(p.dividersX)), ny = Math.round(Number(p.dividersY));
    const dh = Number(p.dividerHeight);
    const cw = (W - 2 * t - nx * t) / (nx + 1);
    for (let k = 1; k <= nx; k++) {
      const id = addDivider(d, base, 3, t + k * cw + (k - 1) * t, dh);
      if (id) role(`divX${k}`, id);
    }
    const cd = (D - 2 * t - ny * t) / (ny + 1);
    for (let k = 1; k <= ny; k++) {
      const id = addDivider(d, base, 0, t + k * cd + (k - 1) * t, dh);
      if (id) role(`divY${k}`, id);
    }
    if (p.lid === 'liftoff') {
      // telescoping lid: inner size = box outer size + 2 × clearance
      const LW = W + 2 * c + 2 * t, LD = D + 2 * c + 2 * t;
      tray(d, W / 2 + 30, LD / 2, LW, LD, Number(p.lidRim) + t, 'lid', role);
    }
  },
  check(d, p) {
    if (p.lid !== 'liftoff') return [];
    const t = d.material.thickness;
    const H = Number(p.height) + (p.sizeMode === 'inner' ? t : 0);
    if (t + Number(p.dividerHeight) > H + 1e-9) return [{ key: 'val.dividerTall', vars: {}, panel: 't:base' }];
    return [];
  },
};
