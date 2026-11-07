// CutForge Worker: class submissions (students) and the teacher API, plus the
// static app. Designing, saving and downloading never touch this; only class
// submission and the teacher view do.
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { classes, submissions } from './schema';
import { parseProject } from '../src/model/serialize';
import { pieceCopies } from '../src/model/pack';

export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS?: Fetcher;
  /** The teacher's access key (Worker secret). */
  TEACHER_KEY: string;
  /** Secret for signing the teacher session cookie (Worker secret). */
  SESSION_SECRET: string;
  /** Optional shared password for the whole site (Worker secret). Unset = open site. */
  SITE_PASSWORD?: string;
};

export const LIMITS = {
  projectBytes: 2_000_000,
  previewBytes: 600_000,
  nameChars: 40,
  titleChars: 80,
  /** Submissions accepted per class code in any 10-minute window. */
  perClassPer10Min: 120,
  /** Submissions accepted per device in any 10-minute window. */
  perDevicePer10Min: 6,
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const SESSION_HOURS = 12;

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (status: number, code: string) => json({ error: code }, status);

function randomId(prefix: string) {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
export function newClassCode(len = 6) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sessionOk(req: Request, env: Env) {
  const m = /(?:^|;\s*)cf_teacher=([^;]+)/.exec(req.headers.get('cookie') ?? '');
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, `teacher.${exp}`));
}

async function body<T>(req: Request, max: number): Promise<T | null> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > max) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ---- site password ------------------------------------------------------------
// With SITE_PASSWORD set, every request (app files and API) needs a signed
// cookie, obtained once per browser on a small sign-in page. The signature
// covers the password, so changing the password signs everyone out.
const SITE_COOKIE = 'cf_site';
const SITE_DAYS = 30;
const LOGIN_PATH = '/__login';

async function siteSig(env: Env, exp: number) {
  return hmac(env.SESSION_SECRET, `site.${exp}.${env.SITE_PASSWORD}`);
}
async function siteOk(req: Request, env: Env) {
  const m = new RegExp(`(?:^|;\\s*)${SITE_COOKIE}=([^;]+)`).exec(req.headers.get('cookie') ?? '');
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await siteSig(env, Number(exp)));
}
/** Only same-site paths are followed after signing in. */
const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith(LOGIN_PATH) ? n : '/');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function loginPage(next: string, failed: boolean, status: number) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>CutForge</title>
<style>
:root{--bg:#f7f2ea;--ink:#2b2622;--muted:#6e655b;--line:#e4dccf;--accent:#15706b;--bright:#1fb8ac;--danger:#c2410c}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,'Segoe UI','Noto Sans Hebrew',Arial,sans-serif;padding:16px}
.card{width:min(380px,100%);background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 8px 28px rgba(35,43,56,.14);padding:26px 24px}
.brand{display:flex;align-items:center;gap:8px;color:var(--accent);font-weight:600;font-size:18px;margin-bottom:14px}
h1{font-size:22px;margin:0 0 4px}p{margin:0 0 14px;color:var(--muted)}p[dir=rtl]{margin-top:-10px}
label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
input{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f1ebe1}
input:focus{outline:none;border-color:var(--bright);box-shadow:0 0 0 3px rgba(31,184,172,.35);background:#fff}
button{margin-top:14px;width:100%;font:inherit;font-weight:500;padding:11px;border:0;border-radius:999px;background:var(--accent);color:#fff;cursor:pointer}
button:hover{background:#0f5d59}.err{color:var(--danger);font-size:13px;margin:10px 0 0}
</style></head><body>
<form class="card" method="post" action="${LOGIN_PATH}">
<div class="brand"><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor"/><path d="M9 23V9h14v5h-3v4h3v5H9z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>CutForge</div>
<h1>Enter the class password</h1>
<p>Ask your teacher for the password.</p>
<p dir="rtl" lang="he">הקלידו את סיסמת הכיתה. אפשר לקבל אותה מהמורה.</p>
<label for="pw">Password · סיסמה</label>
<input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
<input type="hidden" name="next" value="${esc(next)}">
${failed ? '<p class="err" role="alert">That password is not right. · הסיסמה לא נכונה.</p>' : ''}
<button type="submit">Enter · כניסה</button>
</form></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

/** The site password gate. Returns a response to send, or null to carry on. */
async function siteGate(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (!env.SITE_PASSWORD) return null;
  if (url.pathname === LOGIN_PATH && req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const pw = form?.get('password');
    const next = safeNext(form?.get('next'));
    if (typeof pw !== 'string' || !env.SESSION_SECRET || !safeEqual(pw, env.SITE_PASSWORD)) {
      await new Promise((r) => setTimeout(r, 400)); // slow down guessing
      return loginPage(next, true, 401);
    }
    const exp = Date.now() + SITE_DAYS * 86_400_000;
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return new Response(null, {
      status: 303,
      headers: { location: next, 'cache-control': 'no-store', 'set-cookie': `${SITE_COOKIE}=${encodeURIComponent(`${exp}.${await siteSig(env, exp)}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SITE_DAYS * 86400}${secure}` },
    });
  }
  if (await siteOk(req, env)) return url.pathname === LOGIN_PATH ? Response.redirect(new URL('/', url).toString(), 303) : null;
  if (url.pathname.startsWith('/api/')) return err(401, 'sitePassword');
  return loginPage(safeNext(url.pathname + url.search), false, 401);
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const gate = await siteGate(req, env, url);
    if (gate) return gate;
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    try {
      return await api(req, env, url);
    } catch (e) {
      console.error(e);
      return err(500, 'server');
    }
  },
};

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const db = drizzle(env.DB);
  const p = url.pathname.replace(/\/+$/, '');
  const M = req.method;
  let m: RegExpExecArray | null;

  // ---- students ------------------------------------------------------------
  if ((m = /^\/api\/class\/([A-Za-z0-9]{4,10})$/.exec(p)) && M === 'GET') {
    const c = await db.select().from(classes).where(eq(classes.code, m[1].toUpperCase())).get();
    if (!c) return err(404, 'noClass');
    return json({ name: c.name, open: c.open, material: c.material ? JSON.parse(c.material) : null });
  }
  if ((m = /^\/api\/class\/([A-Za-z0-9]{4,10})\/submit$/.exec(p)) && M === 'POST') {
    const c = await db.select().from(classes).where(eq(classes.code, m[1].toUpperCase())).get();
    if (!c) return err(404, 'noClass');
    if (!c.open) return err(403, 'closed');
    const b = await body<{ displayName: string; deviceId: string; title: string; project: string; preview: string }>(req, LIMITS.projectBytes + LIMITS.previewBytes + 4096);
    if (!b) return err(413, 'tooLarge');
    const name = clean(b.displayName, LIMITS.nameChars), device = clean(b.deviceId, 64), title = clean(b.title, LIMITS.titleChars) || '—';
    if (!name || !/^[\w-]{8,64}$/.test(device)) return err(400, 'badRequest');
    if (typeof b.project !== 'string' || b.project.length > LIMITS.projectBytes) return err(413, 'tooLarge');
    if (typeof b.preview !== 'string' || b.preview.length > LIMITS.previewBytes || !b.preview.startsWith('<?xml') || /<script|on\w+=/i.test(b.preview)) return err(400, 'badPreview');
    // only well-formed project files: parse and migrate with the app's own code
    let design;
    try {
      design = parseProject(b.project);
    } catch {
      return err(400, 'badProject');
    }
    const since = Date.now() - 10 * 60_000;
    const recent = await db.select({ n: sql<number>`count(*)` }).from(submissions).where(and(eq(submissions.classId, c.id), gt(submissions.createdAt, since))).get();
    if ((recent?.n ?? 0) >= LIMITS.perClassPer10Min) return err(429, 'rateLimited');
    const mine = await db.select({ n: sql<number>`count(*)` }).from(submissions).where(and(eq(submissions.classId, c.id), eq(submissions.deviceId, device), gt(submissions.createdAt, since))).get();
    if ((mine?.n ?? 0) >= LIMITS.perDevicePer10Min) return err(429, 'rateLimited');
    const id = randomId('s_');
    const projectKey = `${c.id}/${id}/project.json`, previewKey = `${c.id}/${id}/preview.svg`;
    await env.FILES.put(projectKey, b.project, { httpMetadata: { contentType: 'application/json' } });
    await env.FILES.put(previewKey, b.preview, { httpMetadata: { contentType: 'image/svg+xml' } });
    // the newest submission from a device replaces the previous one (history kept for the teacher)
    await db.update(submissions).set({ superseded: true }).where(and(eq(submissions.classId, c.id), eq(submissions.deviceId, device)));
    await db.insert(submissions).values({
      id,
      classId: c.id,
      deviceId: device,
      displayName: name,
      title,
      materialId: design.material.id,
      materialKind: design.material.kind,
      thickness: Math.round(design.material.thickness * 1000),
      pieceCount: pieceCopies(design).length,
      projectKey,
      previewKey,
      createdAt: Date.now(),
    });
    return json({ id }, 201);
  }

  // ---- teacher ---------------------------------------------------------------
  if (p === '/api/teacher/login' && M === 'POST') {
    const b = await body<{ key: string }>(req, 1000);
    if (!env.TEACHER_KEY || !env.SESSION_SECRET) return err(500, 'notConfigured');
    if (!b || typeof b.key !== 'string' || !safeEqual(b.key, env.TEACHER_KEY)) return err(401, 'badKey');
    const exp = Date.now() + SESSION_HOURS * 3600_000;
    const val = `${exp}.${await hmac(env.SESSION_SECRET, `teacher.${exp}`)}`;
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return json({ ok: true }, 200, { 'set-cookie': `cf_teacher=${encodeURIComponent(val)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_HOURS * 3600}${secure}` });
  }
  if (p === '/api/teacher/logout' && M === 'POST') return json({ ok: true }, 200, { 'set-cookie': 'cf_teacher=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0' });
  if (!p.startsWith('/api/teacher/')) return err(404, 'notFound');
  if (!(await sessionOk(req, env))) return err(401, 'signIn');

  if (p === '/api/teacher/classes' && M === 'GET') {
    const rows = await db.select().from(classes).orderBy(desc(classes.createdAt)).all();
    const counts = await db.select({ classId: submissions.classId, n: sql<number>`count(*)`, fresh: sql<number>`sum(case when status = 'new' then 1 else 0 end)` }).from(submissions).where(eq(submissions.superseded, false)).groupBy(submissions.classId).all();
    return json(rows.map((c) => ({ ...c, material: c.material ? JSON.parse(c.material) : null, submissions: counts.find((x) => x.classId === c.id)?.n ?? 0, fresh: counts.find((x) => x.classId === c.id)?.fresh ?? 0 })));
  }
  if (p === '/api/teacher/classes' && M === 'POST') {
    const b = await body<{ name: string }>(req, 2000);
    const name = clean(b?.name, 60);
    if (!name) return err(400, 'badRequest');
    for (let i = 0; i < 5; i++) {
      const code = newClassCode();
      if (await db.select().from(classes).where(eq(classes.code, code)).get()) continue;
      const row = { id: randomId('c_'), code, name, open: true, material: null, createdAt: Date.now() };
      await db.insert(classes).values(row);
      return json(row, 201);
    }
    return err(500, 'server');
  }
  if ((m = /^\/api\/teacher\/classes\/(c_[0-9a-f]+)$/.exec(p))) {
    const id = m[1];
    if (M === 'PATCH') {
      const b = await body<{ open?: boolean; name?: string; material?: unknown }>(req, 20000);
      if (!b) return err(400, 'badRequest');
      const patch: Partial<typeof classes.$inferInsert> = {};
      if (typeof b.open === 'boolean') patch.open = b.open;
      if (typeof b.name === 'string' && clean(b.name, 60)) patch.name = clean(b.name, 60);
      if (b.material === null) patch.material = null;
      else if (b.material && typeof b.material === 'object') patch.material = JSON.stringify(b.material).slice(0, 5000);
      await db.update(classes).set(patch).where(eq(classes.id, id));
      return json({ ok: true });
    }
    if (M === 'DELETE') {
      const subs = await db.select({ p: submissions.projectKey, v: submissions.previewKey }).from(submissions).where(eq(submissions.classId, id)).all();
      if (subs.length) await env.FILES.delete(subs.flatMap((s) => [s.p, s.v]));
      await db.delete(submissions).where(eq(submissions.classId, id));
      await db.delete(classes).where(eq(classes.id, id));
      return json({ ok: true });
    }
  }
  if ((m = /^\/api\/teacher\/classes\/(c_[0-9a-f]+)\/submissions$/.exec(p)) && M === 'GET') {
    const history = url.searchParams.get('history') === '1';
    const rows = await db
      .select()
      .from(submissions)
      .where(history ? eq(submissions.classId, m[1]) : and(eq(submissions.classId, m[1]), eq(submissions.superseded, false)))
      .orderBy(desc(submissions.createdAt))
      .all();
    return json(rows.map(({ projectKey, previewKey, deviceId, ...r }) => ({ ...r, device: deviceId.slice(0, 6) })));
  }
  if ((m = /^\/api\/teacher\/submissions\/(s_[0-9a-f]+)\/(project|preview)$/.exec(p)) && M === 'GET') {
    const s = await db.select().from(submissions).where(eq(submissions.id, m[1])).get();
    if (!s) return err(404, 'notFound');
    const obj = await env.FILES.get(m[2] === 'project' ? s.projectKey : s.previewKey);
    if (!obj) return err(404, 'notFound');
    return new Response(await obj.text(), {
      headers: { 'content-type': m[2] === 'project' ? 'application/json' : 'image/svg+xml', 'cache-control': 'private, max-age=300', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" },
    });
  }
  if (p === '/api/teacher/submissions/status' && M === 'POST') {
    const b = await body<{ ids: string[]; status: 'new' | 'cut' }>(req, 50000);
    if (!b || !Array.isArray(b.ids) || !['new', 'cut'].includes(b.status)) return err(400, 'badRequest');
    const ids = b.ids.filter((x) => typeof x === 'string' && /^s_[0-9a-f]+$/.test(x)).slice(0, 500);
    if (ids.length) await db.update(submissions).set({ status: b.status }).where(inArray(submissions.id, ids));
    return json({ ok: true, updated: ids.length });
  }
  if ((m = /^\/api\/teacher\/submissions\/(s_[0-9a-f]+)$/.exec(p)) && M === 'DELETE') {
    const s = await db.select().from(submissions).where(eq(submissions.id, m[1])).get();
    if (!s) return err(404, 'notFound');
    await env.FILES.delete([s.projectKey, s.previewKey]);
    await db.delete(submissions).where(eq(submissions.id, m[1]));
    return json({ ok: true });
  }
  return err(404, 'notFound');
}
