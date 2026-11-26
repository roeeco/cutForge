// 26 November (the owner): in Workshop, closing a box without a lid that opens did not work well. On card and
// corrugated every board grown across the top became a folded lid, whatever joint was picked, and the *Lid* section
// offered no way to close a box for good; on plywood a *Fixed* top was left overlapping its walls until the next
// edit joined it. *Fixed* is now a lid like the others, in every material, joined to every wall it meets.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, addRoundedRect, addTray, autoConnect, createDesign } from '../src/model/ops';
import { boxLid, fixedKind, lidParts, lidWhy, setBoxLid } from '../src/easy/lid';
import { validate } from '../src/model/validate';
import { generate, defaults, templateById } from '../src/templates/registry';
import type { Design } from '../src/model/types';
import { idempotence, roundTrip } from './harness';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

function box(m: (typeof MATERIALS)[number]) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const tray = addTray(d, base, 60)!;
  autoConnect(d);
  return { d, tray };
}
/** The boards a board is joined to, none of its joints broken. */
const joinedTo = (d: Design, id: string) => new Set(Object.values(d.connections).filter((c) => !c.broken && (c.a.panelId === id || c.b.panelId === id)).map((c) => (c.a.panelId === id ? c.b.panelId : c.a.panelId)));

describe('a box closed for good (Fixed)', () => {
  it.each([
    [CARD, 'glue'],
    [CORR16, 'glue'],
    [CORR4, 'tabslot'],
    [PLY, 'finger'],
  ] as const)('%#: the Lid section makes it in one edit, joined to all four walls with %s off the back wall', (m, kind) => {
    const { d, tray } = box(m);
    expect(lidWhy(d, tray, 'fixed')).toBeNull();
    expect(fixedKind(d, Object.values(d.connections).find((c) => c.grown && c.a.edge === 'e2')!.b.panelId)).toBe(kind);
    const before = d.order.length;
    expect(setBoxLid(d, tray, 'fixed')).toEqual({ ok: true, dropped: 0 });
    const lid = boxLid(d, tray);
    expect(lid.kind).toBe('fixed');
    if (lid.kind !== 'fixed') return;
    expect(d.order.length).toBe(before + 1);
    // its hinge wall with the chosen joint, the other three joined too (never a fold: it does not open)
    const hinge = Object.values(d.connections).find((c) => c.grown && c.b.panelId === lid.lid)!;
    expect(hinge.kind).toBe(kind);
    expect(joinedTo(d, lid.lid).size).toBe(4);
    expect(Object.values(d.connections).some((c) => c.kind === 'closure')).toBe(false);
    expect(validate(d)).toEqual([]);
    expect(idempotence(d)).toBeNull();
    expect(roundTrip(d)).toBeNull();
    // and back to an open box, the board and its joints gone
    expect(setBoxLid(d, tray, 'none').ok).toBe(true);
    expect(boxLid(d, tray).kind).toBe('none');
    expect(d.order.length).toBe(before);
    expect(lidParts(d, lid).every((id) => !d.panels[id])).toBe(true);
  });

  it('from a lid that opens to fixed and back keeps the shapes on its top', () => {
    const { d, tray } = box(CARD);
    setBoxLid(d, tray, 'hinged');
    const h = boxLid(d, tray);
    if (h.kind !== 'hinged') throw new Error('no hinged lid');
    d.panels[h.lid].details.push({ id: 'star', kind: 'circle', op: 'engrave', cx: 60, cy: 40, w: 20, h: 20 } as never);
    expect(setBoxLid(d, tray, 'fixed').dropped).toBe(0);
    const f = boxLid(d, tray);
    if (f.kind !== 'fixed') throw new Error('not fixed');
    expect(d.panels[f.lid].details.map((x) => x.id)).toEqual(['star']);
  });

  it('a rounded box or a carton is refused, with the reason', () => {
    const d = createDesign(CARD);
    const b = addRoundedRect(d, 0, 0, 120, 80, 20)!;
    const t = addTray(d, b, 50)!;
    autoConnect(d);
    expect(lidWhy(d, t, 'fixed')).toBe('lid.why.fixedRound');
    const c = generate(templateById('carton')!, CARD, defaults(templateById('carton')!));
    const ct = Object.values(c.trays).find((x) => x.base === 'open')!;
    expect(lidWhy(c, ct.id, 'fixed')).toBe('lid.why.carton');
    expect(setBoxLid(c, ct.id, 'fixed').ok).toBe(false);
  });
});
