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

describe('projects (milestone 87)', () => {
  it('a project of three designs saves to one file and opens again; a single-design file still opens', async () => {
    const { serializeProjectGroup, parseProjectFile, serializeProject, parseProject } = await import('../src/model/serialize');
    const ds = [0, 1, 2].map((i) => {
      const d = createDesign(MATERIALS[i === 2 ? 3 : 0]);
      d.name = `Part ${i}`;
      addRootPanel(d, 0, 0, 60 + i * 10, 40);
      return d;
    });
    const back = parseProjectFile(serializeProjectGroup('Escape kit', ds));
    expect(back.name).toBe('Escape kit');
    expect(back.designs.map((d) => d.name)).toEqual(['Part 0', 'Part 1', 'Part 2']);
    expect(parseProjectFile(serializeProject(ds[0])).designs).toHaveLength(1);
    // the Worker's reader of class submissions takes the single-design file, as before
    expect(parseProject(serializeProject(ds[0])).name).toBe('Part 0');
  });
  it('a two-material project batches into two sets of sheets', async () => {
    const { projectBatches } = await import('../src/export/project');
    const ds = [MATERIALS[0], MATERIALS[0], MATERIALS[3]].map((m, i) => {
      const d = createDesign(m);
      d.name = `D${i}`;
      addRootPanel(d, 0, 0, 80, 50);
      return d;
    });
    const bs = projectBatches(ds);
    expect(bs).toHaveLength(2);
    expect(bs.map((b) => b.designs.length).sort()).toEqual([1, 2]);
    for (const b of bs) expect('sheets' in b.result && b.result.sheets.length).toBeGreaterThan(0);
  });
  it('designs join a project by its name, keep it through autosave, and leave it', async () => {
    const { projectNamed, setProject, projectDesigns, projectOf, listProjects } = await import('../src/store/persist');
    const a = createDesign(), b = createDesign();
    a.name = 'Box';
    b.name = 'Tokens';
    await saveLocal(a);
    await saveLocal(b);
    const pj = await projectNamed('Game');
    expect((await projectNamed('Game')).id).toBe(pj.id);
    await setProject(a.id, pj.id);
    await setProject(b.id, pj.id);
    await saveLocal(a); // autosave keeps the project
    expect((await projectOf(a.id))?.name).toBe('Game');
    expect((await projectDesigns(pj.id)).length).toBe(2);
    await setProject(b.id, null);
    expect((await projectDesigns(pj.id)).length).toBe(1);
    expect((await listProjects()).map((p) => p.name)).toEqual(['Game']);
  });
});
