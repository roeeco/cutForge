// Milestone 86 (LIDS_LINES_PROJECTS_PLAN.md §7.1): designs live in a library in the browser.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { addRootPanel, createDesign, duplicateDesign } from '../src/model/ops';
import { listDesigns, loadDesign, loadLocal, renameDesign, saveLocal, setDeleted, storeDesign, KEEP_DELETED } from '../src/store/persist';
import { MATERIALS } from '../src/model/materials';

beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
});

/** The database as the app before milestone 86 left it: one design under kv/current-design. */
function oldDatabase(d: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cutforge', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(d, 'current-design');
      t.oncomplete = () => (db.close(), resolve());
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('the library', () => {
  it('a browser with a design from before the library opens it, and lists it first', async () => {
    const d = createDesign(MATERIALS[3]);
    d.name = 'Old box';
    addRootPanel(d, 0, 0, 100, 60);
    await oldDatabase(JSON.parse(JSON.stringify(d)));
    const opened = (await loadLocal()) as any;
    expect(opened.id).toBe(d.id);
    const { live } = await listDesigns();
    expect(live.map((m) => m.name)).toEqual(['Old box']);
    // once only: a second load reads the library
    expect(((await loadLocal()) as any).id).toBe(d.id);
  });

  it('autosave keeps every design; the open one opens next time; the list comes from the cards alone', async () => {
    const ds = Array.from({ length: 10 }, (_, i) => {
      const d = createDesign();
      d.name = `D${i}`;
      return d;
    });
    for (const d of ds) await saveLocal(d);
    const { live } = await listDesigns();
    expect(live).toHaveLength(10);
    expect(live[0].name).toBe('D9');
    expect(((await loadLocal()) as any).name).toBe('D9');
    expect(((await loadDesign(ds[3].id)) as any).name).toBe('D3');
  });

  it('duplicate, rename, delete and restore', async () => {
    const d = createDesign();
    d.name = 'Box';
    await saveLocal(d);
    const c = duplicateDesign(d, '(copy)');
    expect(c.id).not.toBe(d.id);
    await storeDesign(c);
    await renameDesign(c.id, 'Box B');
    let l = await listDesigns();
    expect(l.live.map((m) => m.name).sort()).toEqual(['Box', 'Box B']);
    await setDeleted(d.id, true);
    l = await listDesigns();
    expect(l.live.map((m) => m.name)).toEqual(['Box B']);
    expect(l.deleted.map((m) => m.name)).toEqual(['Box']);
    await setDeleted(d.id, false);
    expect((await listDesigns()).live).toHaveLength(2);
    expect(KEEP_DELETED).toBe(30 * 24 * 3600 * 1000);
  });
});
