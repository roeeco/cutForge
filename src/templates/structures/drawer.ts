// A drawer box (milestone C2, SENTENCE_STYLES_PLAN.md; the sentence plan's
// §8): an open tray and a sleeve it slides into. The sleeve is sized from the
// tray as built (its measured outside), with the board's clearance round it,
// and has a thumb notch at each open end; it is cut lying beside the tray as a
// tube standing on end. Card and corrugated (the sleeve folds).
import type { Design, MaterialProfile } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { Limit, ParamDef, Params, TemplateDef } from '../types';
import { addRootPanel, addTray, autoConnect, solve } from '../../model/ops';
import { boxSize, setBoxSize, type SizeAs } from '../../model/boxSize';
import { boxRecipe, holeRecipe } from '../../easy/recipes';
import { trayRing } from '../../model/cartons';
import { cleanAll, cleanWith, drawerShell, frontWall, mainTray } from './box';
export { drawerShell };
import { largestOk } from '../../sentence/resolve';
import { foldsAsCarton } from '../../model/materials';

const folds = (m: MaterialProfile) => foldsAsCarton(m, 4);


const params: ParamDef[] = [
  { key: 'width', label: 'sen.width', type: 'number', unit: 'mm', min: 30, max: 400, default: 120, affects: ['base'] },
  { key: 'depth', label: 'sen.depth', type: 'number', unit: 'mm', min: 30, max: 400, default: 80, affects: ['base'] },
  { key: 'height', label: 'sen.height', type: 'number', unit: 'mm', min: 15, max: 200, default: 40, affects: ['walls'] },
  {
    key: 'sizeAs', label: 'sen.sizeAs', type: 'choice', default: 'inside',
    options: [{ value: 'inside', label: 'sen.sizeAs.inside' }, { value: 'outside', label: 'sen.sizeAs.outside' }, { value: 'crease', label: 'sen.sizeAs.crease' }],
    allowed: (v, p, m) => cleanWith(drawer, m, p, 'sizeAs', v),
    why: () => 'sen.why.engine',
  },
  {
    key: 'finger', label: 'sen.finger', type: 'choice', default: 'none', addon: { off: 'none' },
    options: [{ value: 'none', label: 'sen.finger.none' }, { value: 'notch', label: 'sen.finger.notch' }],
    allowed: (v, p, m) => v === 'none' || cleanWith(drawer, m, p, 'finger', v),
    why: () => 'sen.why.engine',
    affects: ['walls'],
  },
];

function generateDrawer(d: Design, p: Params, role: (name: string, id: string) => void) {
  const as = (p.sizeAs as SizeAs) ?? 'inside';
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  // the drawer: an open tray
  if (!boxRecipe(d, { kind: 'rect', x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2 }, H, 'open')) return;
  const tray = mainTray(d)!;
  if (as !== 'outside') d.sizeAs = as;
  setBoxSize(d, tray, { w: W, d: D, h: H }, as);
  const front = frontWall(d, tray);
  if (front && p.finger === 'notch') holeRecipe(d, front, 'circle', d.panels[front].w / 2, d.panels[front].h, 20, 20);
  solve(d);
  // the sleeve, from the tray as built: its inside the tray's outside and the board's clearance (twice across, once over the top)
  const o = boxSize(d, tray, 'outside')!;
  const c = d.material.clearance;
  const sw = o.w + 2 * c, sd = o.h + c, sh = o.d;
  const sb = addRootPanel(d, o.w / 2 + 40, -sd / 2, sw, sd);
  const shell = addTray(d, sb, sh, { base: 'open' });
  autoConnect(d);
  if (shell) {
    setBoxSize(d, shell, { w: sw, d: sd, h: sh }, 'inside');
    // a thumb notch at each open end, on the face that lies on top
    const fw = frontWall(d, shell);
    const P = fw ? d.panels[fw] : null;
    if (P) {
      const r = Math.min(24, P.w * 0.3);
      holeRecipe(d, P.id, 'circle', P.w / 2, P.h, r, r);
      holeRecipe(d, P.id, 'circle', P.w / 2, 0, r, r);
    }
  }
  // roles: the drawer's base and walls as a box's, the sleeve's as `shell-…`
  const named = new Set<string>();
  const name = (n: string, id: string | undefined) => {
    if (!id || named.has(id) || !d.panels[id]) return;
    named.add(id);
    role(n, id);
  };
  for (const t of Object.values(d.trays ?? {})) {
    const pre = t.id === shell ? 'shell-' : '';
    name(`${pre}base`, t.baseId);
    for (const r of trayRing(d, t)) name(`${pre}wall-${r.edge}`, r.wall);
  }
  let k = 0;
  for (const id of d.order) if (!named.has(id)) name(`part-${++k}`, id);
}

export const drawer: TemplateDef = {
  id: 'drawer',
  version: 1,
  name: 'sen.drawer',
  description: 'sen.drawer.desc',
  word: 'sen.drawer',
  status: 'stable',
  materials: ['card', 'corrugated'],
  canMake: folds,
  fallback: () => 'box',
  fallbackWords: { lid: 'liftoff' },
  params,
  generate: generateDrawer,
  sentence: { main: 'sen.s.drawer' },
};
drawer.limits = (m: MaterialProfile, p: Params): Record<string, Limit> => {
  const out: Record<string, Limit> = {};
  for (const key of ['width', 'depth', 'height'] as const)
    Object.defineProperty(out, key, {
      enumerable: true,
      get: () => {
        const ck = JSON.stringify(['drawer', m, { ...p, [key]: null }, key]);
        const own = params.find((x) => x.key === key) as Extract<ParamDef, { max: number }>;
        const v = largestOk(ck, own.min, own.max, (x) => cleanWith(drawer, m, { ...p, [key]: x }, key, x), 9, 0.5);
        return { max: Math.max(own.min, v), why: 'sen.why.sheet' as MsgKey };
      },
    });
  return out;
};
drawer.accepts = (m, p) => (cleanAll(drawer, m, p) ? null : 'sen.why.engineSize');
