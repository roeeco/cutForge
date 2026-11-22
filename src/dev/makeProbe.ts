// A dev probe for Fold it / Build from boards: a set of shapes, simple and awkward booleans
// (holes across corners, inside corners, T-pipes, slivers, hulls), each made in one click,
// with what its cut plan has: pieces, joints, Make's problems and the export checks.
// Run in the dev server's console: `const p = await import('/src/dev/makeProbe.ts'); await p.table('fold', 0)`.
import * as ops from '../sculpt/ops';
import { makeNow, useMake } from '../make/run';
import { MATERIALS } from '../model/materials';
import { validate } from '../model/validate';
import { prepareExport } from '../export/prepare';
import { netGroups } from '../model/pieces';
import { kernel } from '../sculpt/kernel';
import { useStore } from '../store/store';
import type { Quat, Shape3 } from '../model/types';

type S = Omit<Shape3, 'id' | 'name'>;
const P = (kind: ops.Primitive, w: number, h: number, d: number, extra: Partial<S> = {}, at: [number, number, number] = [0, 0, 0]): S => ({ ...ops.primitiveShape(kind, { x: at[0], z: at[2], y: at[1], w, d }, h), ...extra });
const q = (ax: number[], deg: number): Quat => {
  const a = (deg * Math.PI) / 360, s = Math.sin(a);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a)] as Quat;
};
const H = (s: S): S => ({ ...s, hole: true });
type Case = { list: S[]; group?: boolean; hull?: boolean };
const G = (list: S[], o: { group?: boolean; hull?: boolean } = {}): Case => ({ list, group: o.group ?? list.some((s) => s.hole), hull: o.hull });

export const CASES: Record<string, Case> = {
  box: G([P('box', 120, 70, 30)]),
  cube: G([P('box', 60, 60, 60)]),
  tall: G([P('box', 40, 220, 40)]),
  big: G([P('box', 250, 150, 100)]),
  hexprism: G([P('prism', 80, 60, 80)]),
  triprism: G([P('prism', 80, 100, 80, { n: 3 })]),
  pyramid: G([P('pyramid', 80, 80, 80)]),
  cylinder: G([P('cylinder', 80, 100, 80)]),
  cone: G([P('cone', 80, 100, 80)]),
  sphere: G([P('sphere', 100, 100, 100)]),
  halfsphere: G([P('halfsphere', 100, 50, 100)]),
  torus: G([P('torus', 120, 20, 120)]),
  wedge: G([P('wedge', 80, 50, 100)]),
  roof: G([P('roof', 100, 50, 80)]),
  gem: G([P('gem', 80, 60, 80)]),
  loft: G([P('loft', 80, 80, 80)]),
  Lshape: G([P('box', 120, 40, 40), P('box', 40, 40, 80, {}, [-40, 0, 60])]),
  house: G([P('box', 100, 60, 80), P('roof', 100, 40, 80, {}, [0, 60, 0])]),
  hole: G([P('box', 100, 60, 100), H(P('cylinder', 40, 60, 40))]),
  rounded: G([P('box', 100, 60, 80, { corners: [15, 15, 15, 15] })]),
  taper: G([P('box', 100, 80, 100, { taper: [0.6, 0.6] })]),
  stepped: G([P('box', 120, 40, 80), P('box', 60, 40, 80, {}, [-30, 40, 0])]),
  tablet: G([P('box', 200, 10, 140)]),
  notch: G([P('box', 100, 60, 80), H(P('box', 50, 30, 40, {}, [25, 30, 20]))]),
  uchannel: G([P('box', 120, 50, 60), H(P('box', 40, 40, 70, {}, [0, 10, 0]))]),
  crossholes: G([P('box', 80, 80, 80), H(P('cylinder', 40, 90, 40, {}, [0, -5, 0])), H(P('cylinder', 40, 90, 40, { q: q([1, 0, 0], 90) }, [0, 40, 45])), H(P('cylinder', 40, 90, 40, { q: q([0, 0, 1], 90) }, [45, 40, 0]))]),
  tray: G([P('box', 120, 40, 80), H(P('box', 110, 40, 70, {}, [0, 3, 0]))]),
  teepipe: G([P('cylinder', 40, 120, 40, { q: q([1, 0, 0], 90) }, [0, 20, 60]), P('cylinder', 40, 120, 40, { q: q([0, 0, 1], 90) }, [60, 20, 0])], { group: true }),
  spherebite: G([P('sphere', 100, 100, 100), H(P('box', 60, 60, 60, {}, [35, 50, 35]))]),
  dent: G([P('box', 100, 50, 100), H(P('sphere', 60, 60, 60, {}, [0, 25, 0]))]),
  obliquecut: G([P('box', 100, 80, 60), H(P('box', 100, 100, 100, { q: q([0, 0, 1], 30) }, [60, 40, 0]))]),
  coplanar: G([P('box', 80, 50, 60), P('box', 80, 50, 60, {}, [40, 0, 0])], { group: true }),
  edgetouch: G([P('box', 50, 50, 50), P('box', 50, 50, 50, {}, [50, 50, 0])], { group: true }),
  tinystep: G([P('box', 100, 40, 80), P('box', 99.5, 40, 80, {}, [0.25, 40, 0.5])], { group: true }),
  obelisk: G([P('box', 50, 120, 50), P('pyramid', 50, 30, 50, {}, [0, 120, 0])], { group: true }),
  squaredonut: G([P('box', 100, 30, 100), H(P('box', 40, 40, 40, {}, [0, -5, 0]))]),
  gemhole: G([P('gem', 90, 60, 90), H(P('cylinder', 20, 80, 20, {}, [0, -10, 0]))]),
  hull: G([P('sphere', 60, 60, 60), P('box', 40, 40, 40, {}, [70, 0, 0])], { hull: true }),
  cornerchop: G([P('box', 80, 80, 80), H(P('box', 80, 80, 80, { q: [0.3647, 0.2798, 0.1159, 0.8806] }, [40, 70, 40]))]),
  twinsphere: G([P('sphere', 70, 70, 70), P('sphere', 70, 70, 70, {}, [40, 0, 0])], { group: true }),
};

export const svgs: Record<string, string> = {};

const tally = (a: string[]) => Object.entries(a.reduce<Record<string, number>>((o, k) => ((o[k] = (o[k] ?? 0) + 1), o), {})).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(' ');

/** Make one case and read its cut plan. */
export async function runCase(name: string, as: 'fold' | 'boards', matIdx: number) {
  const c = CASES[name];
  const m = MATERIALS[matIdx];
  await kernel();
  const d0 = ops.createWaffleDesign(m);
  d0.id = 'test-' + name;
  const S = useStore;
  S.getState().replaceDesign(d0, false);
  S.getState().apply((d) => {
    const ids = c.list.map((s) => ops.addShape(d, s));
    if (c.hull) ops.hullShapes(d, ids);
    else if (c.group) ops.groupShapes(d, ids);
  });
  const t0 = performance.now();
  const ok = await makeNow(as, {}, { play: false });
  // an edit after Make, as a student's would be: the store's own joining runs
  S.getState().apply(() => {});
  const ms = Math.round(performance.now() - t0);
  const d = S.getState().design;
  const joints: Record<string, number> = {};
  for (const x of Object.values(d.connections)) {
    const k = x.kind + (x.seam || as === 'boards' ? '' : '*');
    joints[k] = (joints[k] ?? 0) + 1;
  }
  const px = prepareExport(d);
  const make = useMake.getState().issues.map((i) => (i.kind === 'poly' ? 'poly:' + i.issue.kind : i.kind === 'unfold' ? 'unfold:' + i.issue.kind + ('n' in i.issue && i.issue.n ? i.issue.n : '') : i.kind));
  svgs[`${name}|${as}|${m.id}`] = await (window as unknown as { __cutforge: { svg: () => Promise<string> } }).__cutforge.svg();
  return { name, ok, ms, panels: d.order.length, pcs: netGroups(d).length, sheets: px.sheets.length, prepErr: px.errors.length, joints, make: tally(make), val: tally(validate(d).map((i) => i.key.replace('val.', ''))) };
}

/** Every case, one line each. */
export async function table(as: 'fold' | 'boards', matIdx: number, only?: string[]) {
  const out: Awaited<ReturnType<typeof runCase>>[] = [];
  for (const name of only ?? Object.keys(CASES)) out.push(await runCase(name, as, matIdx));
  return out;
}
export const line = (r: Awaited<ReturnType<typeof runCase>>) => `${r.name.padEnd(12)} ${String(r.ms).padStart(5)}ms panels ${r.panels} pcs ${r.pcs} sh ${r.sheets} ${JSON.stringify(r.joints)} | make: ${r.make} | val: ${r.val}${r.prepErr ? ' | prepErr ' + r.prepErr : ''}`;

/** The export of a case made last, full screen over the app (null to close). */
export function show(key: string | null, box?: string) {
  document.getElementById('__ov')?.remove();
  if (!key) return;
  const div = document.createElement('div');
  div.id = '__ov';
  div.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;display:flex;align-items:center;justify-content:center';
  div.innerHTML = svgs[key] ?? '';
  const s = div.querySelector('svg');
  if (!s) return;
  s.removeAttribute('width');
  s.removeAttribute('height');
  s.style.cssText = 'width:100%;height:100%';
  if (box) s.setAttribute('viewBox', box);
  document.body.appendChild(div);
}
