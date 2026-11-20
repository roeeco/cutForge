// Generates the review's image prompts with the Gemini API (no packages needed, Node 18+).
//
//   node docs/welcome-ux-review-2026-11-20/generate-images.mjs            # P1a–P1j (the Composer series)
//   node docs/welcome-ux-review-2026-11-20/generate-images.mjs P1a P8     # only these
//   node docs/welcome-ux-review-2026-11-20/generate-images.mjs --models   # list the image models your key can use
//
// The key comes from GEMINI_API_KEY in the environment, or from a GEMINI_API_KEY="…" line in .dev.vars
// (git-ignored). It is never printed. Model: GEMINI_IMAGE_MODEL, default below.
// --ref attaches the current welcome screenshot (shots/01-welcome-1440-fold.png) as a "redesign this" reference.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'images');
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const f = join(ROOT, '.dev.vars');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*"?([^"\n]+)"?/m);
    if (m) return m[1].trim();
  }
  console.error('No key: set GEMINI_API_KEY, or add GEMINI_API_KEY="…" to .dev.vars');
  process.exit(1);
}

/** Every **Pxx: title** followed by a > quoted prompt in REVIEW.md. */
function prompts() {
  const md = readFileSync(join(HERE, 'REVIEW.md'), 'utf8');
  const out = new Map();
  const re = /\*\*(P\d+[a-z]?): ([^*]+)\*\*\s*\n>\s*([^\n]+)/g;
  for (const m of md.matchAll(re)) out.set(m[1], { title: m[2].trim(), text: m[3].trim() });
  return out;
}

/** The framing a prompt asks for, as one of the API's aspect ratios. */
function aspect(text) {
  if (/390×844|portrait phone/.test(text)) return '9:16';
  if (/16:9|1366×768/.test(text)) return '16:9';
  if (/4:3/.test(text)) return '4:3';
  if (/3:1/.test(text)) return '21:9';
  return '16:9'; // 16:10 is not offered; 16:9 is the nearest
}

async function call(path, body, k) {
  const r = await fetch(`${API}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': k, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${j.error?.message ?? r.statusText}`);
  return j;
}

const args = process.argv.slice(2);
const k = key();
if (args.includes('--models')) {
  const j = await call('models?pageSize=200', null, k);
  for (const m of j.models ?? []) if (/image|imagen/i.test(m.name)) console.log(m.name.replace('models/', ''), '·', m.displayName);
  process.exit(0);
}
const all = prompts();
const ids = args.filter((a) => !a.startsWith('--'));
const want = ids.length ? ids : [...all.keys()].filter((id) => /^P1[a-z]$/.test(id));
const ref = args.includes('--ref') ? readFileSync(join(HERE, 'shots', '01-welcome-1440-fold.png')).toString('base64') : null;
mkdirSync(OUT, { recursive: true });

for (const id of want) {
  const p = all.get(id);
  if (!p) { console.log(`${id}: no such prompt`); continue; }
  const parts = [];
  if (ref) parts.push({ inlineData: { mimeType: 'image/png', data: ref } }, { text: 'This is the current screen. Redesign it as described:' });
  parts.push({ text: p.text });
  try {
    const ask = (cfg) => call(`models/${MODEL}:generateContent`, { contents: [{ parts }], generationConfig: cfg }, k);
    // some models (Gemini 4 Hydrogen) take no aspect ratio: then the prompt's own framing words decide it
    const j = await ask({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect(p.text) } }).catch((e) =>
      /aspect ratio/i.test(e.message) ? ask({ responseModalities: ['IMAGE'] }) : Promise.reject(e),
    );
    const img = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData)?.inlineData;
    if (!img) { console.log(`${id}: no image (${j.candidates?.[0]?.finishReason ?? 'no candidate'})`); continue; }
    const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const file = join(OUT, `${id}-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.${ext}`);
    writeFileSync(file, Buffer.from(img.data, 'base64'));
    console.log(`${id}: ${file.replace(ROOT + '/', '')}`);
  } catch (e) {
    console.log(`${id}: failed: ${e.message}`);
  }
}
