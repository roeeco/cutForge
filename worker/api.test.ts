import { describe, expect, it } from 'vitest';
import worker, { LIMITS } from './index';
import { testEnv } from './testenv';
import { addRootPanel, createDesign, growPanel } from '../src/model/ops';
import { serializeProject } from '../src/model/serialize';
import { prepareExport } from '../src/export/prepare';
import { sheetToSvg } from '../src/export/svg';

const base = 'https://cutforge.test';
function call(env: any, path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) };
  return worker.fetch(new Request(base + path, { ...init, headers }), env);
}
async function login(env: any) {
  const r = await call(env, '/api/teacher/login', { method: 'POST', body: JSON.stringify({ key: 'teacher-secret-key' }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
function project(w = 80) {
  const d = createDesign();
  const b = addRootPanel(d, 0, 0, w, 60);
  growPanel(d, b, 0, { height: 30, angle: 90, dir: 'up', kind: 'finger' });
  d.name = 'Box';
  return { text: serializeProject(d), preview: sheetToSvg(prepareExport(d).sheets[0]) };
}
const submit = (env: any, code: string, body: object) => call(env, `/api/class/${code}/submit`, { method: 'POST', body: JSON.stringify(body) });

describe('teacher auth', () => {
  it('refuses a wrong key and unauthenticated teacher calls', async () => {
    const { env } = testEnv();
    expect((await call(env, '/api/teacher/login', { method: 'POST', body: JSON.stringify({ key: 'nope' }) })).status).toBe(401);
    expect((await call(env, '/api/teacher/classes')).status).toBe(401);
    expect((await call(env, '/api/teacher/classes', { cookie: 'cf_teacher=123.abc' })).status).toBe(401);
    const cookie = await login(env);
    expect((await call(env, '/api/teacher/classes', { cookie })).status).toBe(200);
  });
});

describe('class submissions', () => {
  it('student submits with a class code; the teacher sees it, opens the files, marks it cut', async () => {
    const { env, files } = testEnv();
    const cookie = await login(env);
    const cls = await (await call(env, '/api/teacher/classes', { method: 'POST', cookie, body: JSON.stringify({ name: 'Grade 8B' }) })).json();
    expect(cls.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const info = await (await call(env, `/api/class/${cls.code.toLowerCase()}`)).json();
    expect(info).toMatchObject({ name: 'Grade 8B', open: true });
    const p = project();
    const r = await submit(env, cls.code, { displayName: 'נועה', deviceId: 'dev-aaaaaaaa', title: 'Box', project: p.text, preview: p.preview });
    expect(r.status).toBe(201);
    expect(files.map.size).toBe(2);
    const list = await (await call(env, `/api/teacher/classes/${cls.id}/submissions`, { cookie })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ displayName: 'נועה', title: 'Box', materialId: 'ply-3', materialKind: 'plywood', thickness: 3000, pieceCount: 2, status: 'new' });
    expect(list[0].projectKey).toBeUndefined();
    const proj = await (await call(env, `/api/teacher/submissions/${list[0].id}/project`, { cookie })).text();
    expect(proj).toBe(p.text);
    const prev = await call(env, `/api/teacher/submissions/${list[0].id}/preview`, { cookie });
    expect(prev.headers.get('content-type')).toBe('image/svg+xml');
    expect((await call(env, '/api/teacher/submissions/status', { method: 'POST', cookie, body: JSON.stringify({ ids: [list[0].id], status: 'cut' }) })).status).toBe(200);
    expect((await (await call(env, `/api/teacher/classes/${cls.id}/submissions`, { cookie })).json())[0].status).toBe('cut');
  });

  it('a resubmission replaces the previous one from the same device; history is kept', async () => {
    const { env } = testEnv();
    const cookie = await login(env);
    const cls = await (await call(env, '/api/teacher/classes', { method: 'POST', cookie, body: JSON.stringify({ name: 'A' }) })).json();
    for (const w of [80, 90]) {
      const p = project(w);
      expect((await submit(env, cls.code, { displayName: 'Dan', deviceId: 'dev-bbbbbbbb', title: `v${w}`, project: p.text, preview: p.preview })).status).toBe(201);
    }
    const p = project();
    await submit(env, cls.code, { displayName: 'Maya', deviceId: 'dev-cccccccc', title: 'x', project: p.text, preview: p.preview });
    const cur = await (await call(env, `/api/teacher/classes/${cls.id}/submissions`, { cookie })).json();
    expect(cur.map((s: any) => s.title).sort()).toEqual(['v90', 'x']);
    const all = await (await call(env, `/api/teacher/classes/${cls.id}/submissions?history=1`, { cookie })).json();
    expect(all).toHaveLength(3);
  });

  it('refuses closed classes, unknown codes, malformed or oversized files, and floods', async () => {
    const { env } = testEnv();
    const cookie = await login(env);
    const cls = await (await call(env, '/api/teacher/classes', { method: 'POST', cookie, body: JSON.stringify({ name: 'A' }) })).json();
    const p = project();
    const ok = { displayName: 'A', deviceId: 'dev-dddddddd', title: 't', project: p.text, preview: p.preview };
    expect((await submit(env, 'ZZZZZZ', ok)).status).toBe(404);
    expect((await submit(env, cls.code, { ...ok, project: '{"hello":1}' })).status).toBe(400);
    expect((await submit(env, cls.code, { ...ok, preview: '<svg onload="x()">' })).status).toBe(400);
    expect((await submit(env, cls.code, { ...ok, project: 'x'.repeat(LIMITS.projectBytes + 10) })).status).toBe(413);
    expect((await submit(env, cls.code, { ...ok, displayName: '' })).status).toBe(400);
    for (let i = 0; i < LIMITS.perDevicePer10Min; i++) expect((await submit(env, cls.code, ok)).status).toBe(201);
    expect((await submit(env, cls.code, ok)).status).toBe(429);
    await call(env, `/api/teacher/classes/${cls.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ open: false }) });
    expect((await submit(env, cls.code, { ...ok, deviceId: 'dev-eeeeeeee' })).status).toBe(403);
  });

  it('class material profile is returned to students; deleting a class removes its files', async () => {
    const { env, files } = testEnv();
    const cookie = await login(env);
    const cls = await (await call(env, '/api/teacher/classes', { method: 'POST', cookie, body: JSON.stringify({ name: 'A' }) })).json();
    const mat = { id: 'ply-3-custom', kind: 'plywood', nameKey: 'mat.ply3', thickness: 2.9, kerf: 0.12, clearance: 0.1, foldAllowance: 0, sheetW: 600, sheetH: 400, grain: 'x' };
    await call(env, `/api/teacher/classes/${cls.id}`, { method: 'PATCH', cookie, body: JSON.stringify({ material: mat }) });
    expect((await (await call(env, `/api/class/${cls.code}`)).json()).material).toEqual(mat);
    const p = project();
    await submit(env, cls.code, { displayName: 'A', deviceId: 'dev-ffffffff', title: 't', project: p.text, preview: p.preview });
    expect(files.map.size).toBe(2);
    expect((await call(env, `/api/teacher/classes/${cls.id}`, { method: 'DELETE', cookie })).status).toBe(200);
    expect(files.map.size).toBe(0);
    expect(await (await call(env, '/api/teacher/classes', { cookie })).json()).toEqual([]);
  });
});
