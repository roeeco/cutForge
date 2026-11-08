import { describe, expect, it } from 'vitest';
import { addRootPanel, autoConnect, createDesign, deleteConnection, growPanel, setConnection, setMaterial } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { fromHinge } from '../src/model/hinge';
import { findOpenSeams } from '../src/model/seams';
import { buildPieces } from '../src/model/pieces';
import type { Design } from '../src/model/types';

const PLY = MATERIALS[3];
const CARD = MATERIALS[0];

/** Four walls grown one by one, joined automatically after each edit (as the editor does). */
function tray(material = PLY) {
  const d = createDesign(material);
  const base = addRootPanel(d, 0, 0, 100, 80);
  const kind = material.kind === 'plywood' ? 'finger' : 'fold';
  const walls = [0, 1, 2, 3].map((e) => {
    const r = growPanel(d, base, e, { height: 40, angle: 90, dir: 'up', kind })!;
    autoConnect(d);
    return r;
  });
  return { d, base, walls };
}
const closing = (d: Design) => Object.values(d.connections).filter((c) => !c.grown);
const grownKind = (d: Design, id: string) => d.connections[id].kind;

describe('joints follow the preferred kind', () => {
  it('a plywood wall turned past 90° and back gets its finger joint back', () => {
    const { d, walls } = tray();
    const c = walls[0].connectionId;
    for (const [h, k] of [[120, 'butt'], [90, 'finger'], [60, 'lean'], [90, 'finger']] as const) {
      setConnection(d, c, fromHinge(h));
      expect(grownKind(d, c), `at ${h}°`).toBe(k);
    }
  });

  it('joints come back after a material round trip (fingers → fold → fingers)', () => {
    const { d, walls } = tray();
    setMaterial(d, CARD);
    autoConnect(d);
    expect(grownKind(d, walls[1].connectionId)).toBe('fold');
    expect(closing(d).every((c) => c.kind === 'glue')).toBe(true);
    setMaterial(d, PLY);
    autoConnect(d);
    expect(grownKind(d, walls[1].connectionId)).toBe('finger');
    expect(closing(d).every((c) => c.kind === 'finger')).toBe(true);
  });

  it('a joint the student picked comes back when the angle allows it again', () => {
    const { d, walls } = tray();
    const c = walls[1].connectionId;
    setConnection(d, c, { kind: 'tabslot' });
    setConnection(d, c, fromHinge(60));
    expect(grownKind(d, c)).toBe('lean');
    setConnection(d, c, fromHinge(90));
    expect(grownKind(d, c)).toBe('tabslot');
  });
});

describe('meeting panels are joined automatically', () => {
  it('plywood: the four corners get finger joints with no open seams left', () => {
    const { d } = tray();
    expect(closing(d).map((c) => c.kind)).toEqual(['finger', 'finger', 'finger', 'finger']);
    expect(findOpenSeams(d)).toHaveLength(0);
  });

  it('card: corners get glue flaps and the tray is one net', () => {
    const { d } = tray(CARD);
    expect(closing(d).every((c) => c.kind === 'glue')).toBe(true);
    expect(buildPieces(d)).toHaveLength(1);
  });

  it('a corner that stops meeting is removed, and comes back when it meets again', () => {
    const { d, walls } = tray();
    setConnection(d, walls[0].connectionId, fromHinge(60));
    autoConnect(d);
    const touching = closing(d).filter((c) => c.a.panelId === walls[0].panelId || c.b.panelId === walls[0].panelId);
    expect(touching.every((c) => !c.broken)).toBe(true);
    setConnection(d, walls[0].connectionId, fromHinge(90));
    autoConnect(d);
    expect(closing(d).filter((c) => c.kind === 'finger')).toHaveLength(4);
    expect(Object.values(d.connections).some((c) => c.broken)).toBe(false);
  });

  it('a seam the student deletes stays deleted until they connect it again', () => {
    const { d } = tray();
    const c = closing(d)[0];
    deleteConnection(d, c.id);
    autoConnect(d);
    expect(closing(d)).toHaveLength(3);
    expect(findOpenSeams(d)).toHaveLength(1);
  });
});
