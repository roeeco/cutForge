// Sending (milestone 109): src/net/submit.ts against a mocked class server.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { code: string; body: Record<string, unknown> }[] = [];
let info: Record<string, unknown> | Error = { name: 'A', open: true, material: null };
let failSubmit: Error | null = null;
vi.mock('../src/net/api', () => ({
  api: {
    classInfo: vi.fn(async () => {
      if (info instanceof Error) throw info;
      return info;
    }),
    submit: vi.fn(async (code: string, body: Record<string, unknown>) => {
      if (failSubmit) throw failSubmit;
      calls.push({ code, body });
      return { id: 's1' };
    }),
  },
  deviceId: () => 'dev-test',
}));

import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { lookupClass, profileMismatch, submitDesign, switchToClassMaterial, errKeyOf } from '../src/net/submit';
import { GUIDED_MISSIONS, PLAIN } from '../src/guided/things';
import { blockers } from '../src/guided/steps/Send';
import { nominalSvgs } from '../src/export/files';

const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;
const err = (code: string) => Object.assign(new Error(code), { code });
const kiss = { kissUp: 'up', kissUpShort: 'up' };

beforeEach(() => {
  calls.length = 0;
  info = { name: 'A', open: true, material: null };
  failSubmit = null;
});

describe('sending to a class', () => {
  it('a class with another board: the difference is seen, and the switch puts the design in its board', async () => {
    const profile = { ...mat('ply-3'), id: 'ply-3-school', thickness: 2.8 };
    info = { name: 'A', open: true, material: profile };
    const r = await lookupClass('ABC123');
    expect(r.ok).toBe(true);
    const d = PLAIN[0].start(mat('ply-3'));
    if (r.ok) {
      expect(profileMismatch(r.cls, d)).toBe(true);
      const s = switchToClassMaterial(d, profile);
      expect(s.material.thickness).toBe(2.8);
      expect(profileMismatch(r.cls, s)).toBe(false);
      expect(blockers(s)).toEqual([]);
      // the original is untouched
      expect(d.material.thickness).toBe(3);
    }
  });

  it('a closed class says closed; no network says network', async () => {
    info = { name: 'A', open: false, material: null };
    expect(await lookupClass('X')).toEqual({ ok: false, error: 'closed' });
    info = err('network');
    expect(await lookupClass('X')).toEqual({ ok: false, error: 'network' });
    expect(errKeyOf('network')).toBe('sub.err.network');
    expect(errKeyOf('weird')).toBe('sub.err.server');
  });

  it('a send carries the design, a preview and the goals; a second send is sent again (the server keeps the newest)', async () => {
    const d = GUIDED_MISSIONS[0].start(mat('ply-3'));
    expect((await submitDesign({ code: 'ABC', name: ' Maya ', title: '', design: d })).ok).toBe(true);
    expect(calls[0].body).toMatchObject({ displayName: 'Maya', deviceId: 'dev-test', goalsTotal: 5 });
    expect(String(calls[0].body.preview)).toContain('<svg');
    expect(JSON.parse(String(calls[0].body.project)).design.mission.id).toBe('pencil-box');
    await submitDesign({ code: 'ABC', name: 'Maya', title: 'x', design: d });
    expect(calls.length).toBe(2);
  });

  it('a failed send says why, and the download is still there', async () => {
    failSubmit = err('network');
    const d = PLAIN[0].start(mat('ply-3'));
    expect(await submitDesign({ code: 'ABC', name: 'Maya', title: '', design: d })).toEqual({ ok: false, error: 'network' });
    const files = nominalSvgs(d, kiss);
    expect(files.length).toBe(1);
    expect(files[0].name).toMatch(/nominal.*\.svg$/);
    expect(files[0].svg).toContain('<svg');
  });
});
