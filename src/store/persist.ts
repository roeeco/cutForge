// Browser storage in IndexedDB (milestone 86, LIDS_LINES_PROJECTS_PLAN.md §7.1):
// a library of designs. `designs` holds each design as autosave writes it,
// `meta` a light card for each (the start screen reads only these), `kv` the
// open design's id. Before milestone 86 there was one design under
// `kv/current-design`: it is moved into the library once and then left alone.
// Failures never throw into the editor.
import type { Design } from '../model/types';
import type { SavedPreset } from '../templates/custom';

const DB = 'cutforge', KV = 'kv', DESIGNS = 'designs', META = 'meta';
const OLD_KEY = 'current-design', OPEN_KEY = 'open-design', MOVED_KEY = 'library-moved';
/** How long a deleted design can be restored (ms). */
export const KEEP_DELETED = 30 * 24 * 3600 * 1000;

/** What the start screen shows of a design, without loading it. */
export type DesignMeta = { id: string; name: string; updatedAt: number; material: string; boards: number; thumb?: string; deletedAt?: number; /** The project it belongs to (milestone 87). */ projectId?: string };
/** A project: a named group of designs (milestone 87). */
export type ProjectMeta = { id: string; name: string };
const PROJECTS_KEY = 'projects';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // version 2: each store made only if it is missing, so another plan's store can land in either order
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of [KV, DESIGNS, META]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await open();
  try {
    const t = db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
    const v = await fn(t);
    await done;
    return v;
  } finally {
    db.close();
  }
}
const get = <T,>(t: IDBTransaction, store: string, key: string) =>
  new Promise<T | undefined>((resolve, reject) => {
    const r = t.objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
const all = <T,>(t: IDBTransaction, store: string) =>
  new Promise<T[]>((resolve, reject) => {
    const r = t.objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });

/** A save's time: strictly later than the last one, so newest-first holds within a millisecond. */
let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

/** A design's card for the start screen. */
export function metaOf(d: Design, thumb?: string): DesignMeta {
  return { id: d.id, name: d.name, updatedAt: stamp(), material: d.material.id, boards: d.order.length, ...(thumb ? { thumb } : {}) };
}

/** Other tabs hear of every save (two tabs on one design never overwrite each other silently). */
export const TAB = Math.random().toString(36).slice(2);
let channel: BroadcastChannel | null = null;
export function libraryChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel('cutforge-library');
  return channel;
}

/** Save the open design (autosave): into the library, its card, and as the one to open next time. */
export async function saveLocal(d: Design, thumb?: string, hash?: number): Promise<void> {
  const plain = JSON.parse(JSON.stringify(d)) as Design;
  await tx([KV, DESIGNS, META], 'readwrite', async (t) => {
    const old = await get<DesignMeta>(t, META, d.id);
    t.objectStore(DESIGNS).put(plain, d.id);
    t.objectStore(META).put({ ...metaOf(d, thumb ?? old?.thumb), ...(old?.projectId ? { projectId: old.projectId } : {}) }, d.id);
    t.objectStore(KV).put(d.id, OPEN_KEY);
  });
  libraryChannel()?.postMessage({ saved: d.id, by: TAB, ...(hash !== undefined ? { hash } : {}) });
}

/** The design to open: the one open last; a design saved before the library is moved into it first (once). */
export async function loadLocal(): Promise<unknown | null> {
  return tx([KV, DESIGNS, META], 'readwrite', async (t) => {
    const moved = await get<boolean>(t, KV, MOVED_KEY);
    if (!moved) {
      const old = await get<Design>(t, KV, OLD_KEY);
      t.objectStore(KV).put(true, MOVED_KEY);
      if (old && typeof old === 'object' && typeof old.id === 'string') {
        t.objectStore(DESIGNS).put(old, old.id);
        t.objectStore(META).put(metaOf(old), old.id);
        t.objectStore(KV).put(old.id, OPEN_KEY);
        return old;
      }
    }
    const id = await get<string>(t, KV, OPEN_KEY);
    return id ? ((await get<unknown>(t, DESIGNS, id)) ?? null) : null;
  });
}

/** Every design's card, newest first; the deleted ones apart (and those deleted over 30 days ago gone for good). */
export async function listDesigns(): Promise<{ live: DesignMeta[]; deleted: DesignMeta[] }> {
  const metas = await tx([META, DESIGNS], 'readwrite', async (t) => {
    const ms = await all<DesignMeta>(t, META);
    const now = Date.now();
    for (const m of ms)
      if (m.deletedAt && now - m.deletedAt > KEEP_DELETED) {
        t.objectStore(META).delete(m.id);
        t.objectStore(DESIGNS).delete(m.id);
      }
    return ms.filter((m) => !(m.deletedAt && now - m.deletedAt > KEEP_DELETED));
  });
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  return { live: metas.filter((m) => !m.deletedAt), deleted: metas.filter((m) => m.deletedAt) };
}

/** A design from the library, as saved. */
export async function loadDesign(id: string): Promise<unknown | null> {
  return tx([DESIGNS], 'readonly', async (t) => (await get<unknown>(t, DESIGNS, id)) ?? null);
}

/** Put a design in the library as it is (a duplicate, an opened file), in a project or none. */
export async function storeDesign(d: Design, projectId?: string): Promise<void> {
  const plain = JSON.parse(JSON.stringify(d)) as Design;
  await tx([DESIGNS, META], 'readwrite', (t) => {
    t.objectStore(DESIGNS).put(plain, d.id);
    t.objectStore(META).put({ ...metaOf(d), ...(projectId ? { projectId } : {}) }, d.id);
  });
}

/** Move a design to *Recently deleted* (or back). */
export async function setDeleted(id: string, deleted: boolean): Promise<void> {
  await tx([META], 'readwrite', async (t) => {
    const m = await get<DesignMeta>(t, META, id);
    if (!m) return;
    const next = { ...m };
    if (deleted) next.deletedAt = Date.now();
    else delete next.deletedAt;
    t.objectStore(META).put(next, id);
  });
}

/** Rename a design in the library without opening it. */
export async function renameDesign(id: string, name: string): Promise<void> {
  await tx([DESIGNS, META], 'readwrite', async (t) => {
    const d = await get<Design>(t, DESIGNS, id);
    const m = await get<DesignMeta>(t, META, id);
    if (d) t.objectStore(DESIGNS).put({ ...d, name }, id);
    if (m) t.objectStore(META).put({ ...m, name }, id);
  });
}

// ---------------------------------------------------------------------------
// Projects (milestone 87, LIDS_LINES_PROJECTS_PLAN.md §7.2): a named group of
// designs (the box, its tokens, its cards). The names are kept in `kv`; each
// design's card says which project it is in.

export async function listProjects(): Promise<ProjectMeta[]> {
  return tx([KV], 'readonly', async (t) => Object.values((await get<Record<string, ProjectMeta>>(t, KV, PROJECTS_KEY)) ?? {}).sort((a, b) => a.name.localeCompare(b.name)));
}

/** The project of this name, made if there is none. */
export async function projectNamed(name: string): Promise<ProjectMeta> {
  return tx([KV], 'readwrite', async (t) => {
    const all = (await get<Record<string, ProjectMeta>>(t, KV, PROJECTS_KEY)) ?? {};
    const have = Object.values(all).find((p) => p.name === name);
    if (have) return have;
    const p = { id: 'j_' + Math.random().toString(36).slice(2, 10), name };
    t.objectStore(KV).put({ ...all, [p.id]: p }, PROJECTS_KEY);
    return p;
  });
}

/** Put a design in a project, or take it out (null). */
export async function setProject(designId: string, projectId: string | null): Promise<void> {
  await tx([META], 'readwrite', async (t) => {
    const m = await get<DesignMeta>(t, META, designId);
    if (!m) return;
    const next = { ...m };
    if (projectId) next.projectId = projectId;
    else delete next.projectId;
    t.objectStore(META).put(next, designId);
  });
}

/** The designs of a project (not the deleted ones), as saved. */
export async function projectDesigns(projectId: string): Promise<unknown[]> {
  const { live } = await listDesigns();
  const ids = live.filter((m) => m.projectId === projectId).map((m) => m.id);
  const out: unknown[] = [];
  for (const id of ids) {
    const d = await loadDesign(id);
    if (d) out.push(d);
  }
  return out;
}

/** The project a design is in (its card says), if any. */
export async function projectOf(designId: string): Promise<ProjectMeta | null> {
  const [{ live }, projects] = await Promise.all([listDesigns(), listProjects()]);
  const pid = live.find((m) => m.id === designId)?.projectId;
  return (pid && projects.find((p) => p.id === pid)) || null;
}

// ---------------------------------------------------------------------------
// Custom presets (milestone 158, src/templates/custom.ts): each a name, a record and sizes, kept in `kv` beside the
// projects. A saved preset is a card of its own on the start screen.
const PRESETS_KEY = 'presets';

/** The saved presets, newest first. */
export async function listPresets(): Promise<SavedPreset[]> {
  return tx([KV], 'readonly', async (t) => Object.values((await get<Record<string, SavedPreset>>(t, KV, PRESETS_KEY)) ?? {}).sort((a, b) => b.createdAt - a.createdAt));
}

/** Save a preset (a new one, or one of the same id replaced). */
export async function savePreset(p: SavedPreset): Promise<void> {
  await tx([KV], 'readwrite', async (t) => {
    const all = (await get<Record<string, SavedPreset>>(t, KV, PRESETS_KEY)) ?? {};
    t.objectStore(KV).put({ ...all, [p.id]: JSON.parse(JSON.stringify(p)) }, PRESETS_KEY);
  });
}

export async function deletePreset(id: string): Promise<void> {
  await tx([KV], 'readwrite', async (t) => {
    const all = { ...((await get<Record<string, SavedPreset>>(t, KV, PRESETS_KEY)) ?? {}) };
    delete all[id];
    t.objectStore(KV).put(all, PRESETS_KEY);
  });
}
