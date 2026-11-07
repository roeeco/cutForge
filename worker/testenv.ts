// Test doubles: D1 on node:sqlite (real SQL, the real migration) and an in-memory R2.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Env } from './index';

type Arg = string | number | null | boolean | bigint;
const conv = (a: Arg) => (typeof a === 'boolean' ? (a ? 1 : 0) : a);

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: Arg[] = []) {}
  bind(...args: Arg[]) {
    return new Stmt(this.db, this.sql, args);
  }
  private st() {
    return this.db.prepare(this.sql);
  }
  async all() {
    return { results: this.st().all(...(this.args.map(conv) as never[])), success: true, meta: {} };
  }
  async raw() {
    const st = this.st();
    (st as unknown as { setReturnArrays?: (v: boolean) => void }).setReturnArrays?.(true);
    const rows = st.all(...(this.args.map(conv) as never[])) as unknown[];
    return rows.map((r) => (Array.isArray(r) ? r : Object.values(r as object)));
  }
  async first(col?: string) {
    const r = this.st().get(...(this.args.map(conv) as never[])) as Record<string, unknown> | undefined;
    return r ? (col ? r[col] : r) : null;
  }
  async run() {
    const r = this.st().run(...(this.args.map(conv) as never[]));
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] };
  }
}

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync('drizzle').filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${f}`, 'utf8').replace(/--> statement-breakpoint/g, ''));
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => Promise.all(stmts.map((s) => s.all())),
    exec: async (sql: string) => db.exec(sql),
    dump: async () => new ArrayBuffer(0),
    _db: db,
  };
}

export function fakeR2() {
  const m = new Map<string, string>();
  return {
    map: m,
    put: async (k: string, v: string) => void m.set(k, v),
    get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)! } : null),
    delete: async (k: string | string[]) => void (Array.isArray(k) ? k : [k]).forEach((x) => m.delete(x)),
  };
}

export function testEnv() {
  const files = fakeR2();
  const env = { DB: fakeD1(), FILES: files, TEACHER_KEY: 'teacher-secret-key', SESSION_SECRET: 'session-secret-for-tests' } as unknown as Env;
  return { env, files };
}
