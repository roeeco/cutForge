// Teacher view (#/teacher): sign in, classes and codes, submissions with
// previews, downloads regenerated from the submitted project files (never a
// submitted SVG), batching onto shared sheets with name labels, mark as cut.
import { useEffect, useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { api, type ApiError, type Submission, type TeacherClass } from '../net/api';
import { parseProject } from '../model/serialize';
import { prepareExport } from '../export/prepare';
import { sheetToSvg, sheetsToSvg } from '../export/svg';
import { sheetsToDxf } from '../export/dxf';
import { batchExport, type BatchItem } from '../export/batch';
import { downloadText, safeName } from '../ui/download';
import { MATERIALS } from '../model/materials';
import { fmtNum, type MsgKey } from '../i18n';
import type { Design } from '../model/types';
import type { PreparedSheet } from '../export/prepare';

export function TeacherApp() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [error, setError] = useState('');
  const [current, setCurrentState] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // picking a class (again) always reloads its submissions
  const setCurrent = (id: string) => {
    setCurrentState(id);
    setTick((x) => x + 1);
  };

  const load = async () => {
    try {
      setClasses(await api.classes());
      setAuthed(true);
      setError('');
    } catch (e) {
      const er = e as ApiError;
      if (er.status === 401) setAuthed(false);
      else setError(t('teach.offline'));
      if (er.status !== 401 && authed === null) setAuthed(false);
    }
  };
  useEffect(() => void load(), []);

  return (
    <div className="teacher" data-testid="teacher">
      <header className="topbar">
        <strong>
          {t('app.name')} · {t('teach.title')}
        </strong>
        <div className="spacer" />
        <a href="#/" className="btn" data-testid="teacher-back">
          {t('teach.back')}
        </a>
        {authed && (
          <button
            onClick={async () => {
              await api.logout().catch(() => {});
              setAuthed(false);
            }}
          >
            {t('teach.signOut')}
          </button>
        )}
        <button className="lang" onClick={() => useStore.getState().setLang(lang === 'en' ? 'he' : 'en')}>
          {t('lang.toggle')}
        </button>
      </header>
      <main className="teacher-main">
        {error && <p className="warn-text">{error}</p>}
        {authed === false && <Login onDone={load} />}
        {authed && (
          <div className="teacher-cols">
            <Classes classes={classes} current={current} onPick={setCurrent} reload={load} />
            {current && classes.find((c) => c.id === current) && <Submissions cls={classes.find((c) => c.id === current)!} reload={load} tick={tick} />}
          </div>
        )}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <form
      className="card login"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.login(key);
          onDone();
        } catch (er) {
          const c = (er as ApiError).code;
          setMsg(c === 'badKey' ? t('teach.badKey') : c === 'notConfigured' ? t('teach.notConfigured') : t('teach.offline'));
        }
      }}
    >
      <label htmlFor="tkey">{t('teach.key')}</label>
      <input id="tkey" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" data-testid="teacher-key" />
      <button className="primary" type="submit" data-testid="teacher-login">
        {t('teach.signIn')}
      </button>
      {msg && <p className="warn-text">{msg}</p>}
    </form>
  );
}

function Classes({ classes, current, onPick, reload }: { classes: TeacherClass[]; current: string | null; onPick: (id: string) => void; reload: () => void }) {
  const t = useT();
  const [name, setName] = useState('');
  return (
    <section className="card classes" data-testid="classes">
      <h2>{t('teach.classes')}</h2>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const c = await api.createClass(name.trim());
          setName('');
          await reload();
          onPick(c.id);
        }}
      >
        <input dir="auto" placeholder={t('teach.newClass')} aria-label={t('teach.newClass')} value={name} onChange={(e) => setName(e.target.value)} data-testid="new-class-name" />
        <button type="submit" data-testid="create-class">
          {t('teach.create')}
        </button>
      </form>
      <ul className="class-list">
        {classes.map((c) => (
          <li key={c.id} className={c.id === current ? 'on' : ''}>
            <button className="link" onClick={() => onPick(c.id)} data-testid={`class-${c.code}`}>
              <strong>{c.name}</strong>
            </button>
            <span className="code" dir="ltr" data-testid="class-code">
              {c.code}
            </span>
            <span className="note">
              {c.open ? t('teach.openState') : t('teach.closedState')} · {c.fresh}/{c.submissions}
            </span>
            <div className="row">
              <button
                onClick={async () => {
                  await api.patchClass(c.id, { open: !c.open });
                  reload();
                }}
                data-testid="toggle-open"
              >
                {c.open ? t('teach.close') : t('teach.reopen')}
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (!confirm(t('teach.confirmDelete', { name: c.name }))) return;
                  await api.deleteClass(c.id);
                  reload();
                }}
              >
                {t('teach.delete')}
              </button>
            </div>
            {c.id === current && (
              <div className="field">
                <label htmlFor={`prof-${c.id}`}>{t('teach.profile')}</label>
                <select
                  id={`prof-${c.id}`}
                  value={c.material?.id ?? ''}
                  onChange={async (e) => {
                    const m = MATERIALS.find((x) => x.id === e.target.value) ?? null;
                    await api.patchClass(c.id, { material: m });
                    reload();
                  }}
                  data-testid="class-profile"
                >
                  <option value="">{t('teach.noProfile')}</option>
                  {MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {t(m.nameKey as MsgKey)}
                    </option>
                  ))}
                  {c.material && !MATERIALS.some((m) => m.id === c.material!.id) && <option value={c.material.id}>{c.material.id}</option>}
                </select>
              </div>
            )}
            {c.id === current && (
              <div className="field">
                <label htmlFor={`mode-${c.id}`}>{t('class.mode')}</label>
                <select
                  id={`mode-${c.id}`}
                  value={c.mode ?? ''}
                  onChange={async (e) => {
                    const v = e.target.value as 'quick' | 'workshop' | '';
                    await api.patchClass(c.id, { mode: v || null, ...(v ? {} : { modeLocked: false }) });
                    reload();
                  }}
                  data-testid="class-mode"
                >
                  <option value="">{t('class.modeNone')}</option>
                  <option value="quick">{t('mode.quick')}</option>
                  <option value="workshop">{t('mode.workshop')}</option>
                </select>
                {c.mode && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!c.modeLocked}
                      onChange={async (e) => {
                        await api.patchClass(c.id, { modeLocked: e.target.checked });
                        reload();
                      }}
                      data-testid="class-mode-locked"
                    />
                    {t('class.modeLocked')}
                  </label>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="note">{t('teach.retention')}</p>
    </section>
  );
}

const projects = new Map<string, Design>();
async function loadDesign(id: string): Promise<Design> {
  if (!projects.has(id)) projects.set(id, parseProject(await api.project(id)));
  return projects.get(id)!;
}

function Submissions({ cls, reload, tick }: { cls: TeacherClass; reload: () => void; tick: number }) {
  const t = useT();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [history, setHistory] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<{ sheets: PreparedSheet[]; pieces: number } | null>(null);
  const [msg, setMsg] = useState('');
  const refresh = async () => {
    const s = await api.submissions(cls.id, history);
    setSubs(s);
    for (const x of s)
      if (!previews[x.id])
        api
          .preview(x.id)
          .then((svg) => setPreviews((p) => ({ ...p, [x.id]: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) })))
          .catch(() => {});
  };
  useEffect(() => {
    setSel(new Set());
    setBatch(null);
    void refresh();
  }, [cls.id, history, tick]);
  useEffect(() => {
    const iv = setInterval(() => document.visibilityState === 'visible' && void refresh().catch(() => {}), 20_000);
    return () => clearInterval(iv);
  }, [cls.id, history]);

  const download = async (s: Submission, fmt: 'svg' | 'dxf' | 'json') => {
    try {
      const base = `${safeName(s.displayName)}-${safeName(s.title)}`;
      if (fmt === 'json') return downloadText(`${base}.cutforge.json`, await api.project(s.id), 'application/json');
      const p = prepareExport(await loadDesign(s.id));
      if (fmt === 'svg') downloadText(`${base}-nominal.svg`, p.sheets.length === 1 ? sheetToSvg(p.sheets[0]) : sheetsToSvg(p.sheets), 'image/svg+xml');
      else downloadText(`${base}-nominal.dxf`, sheetsToDxf(p.sheets), 'application/dxf');
    } catch {
      setMsg(t('teach.loadFailed'));
    }
  };
  const makeBatch = async () => {
    setMsg('');
    setBatch(null);
    const chosen = subs.filter((s) => sel.has(s.id));
    const items: BatchItem[] = [];
    for (const s of chosen) items.push({ id: s.id, label: s.displayName, design: await loadDesign(s.id) });
    const r = batchExport(items);
    if ('error' in r) return setMsg(r.error === 'mixed' ? t('teach.mixed') : '');
    setBatch({ sheets: r.sheets, pieces: chosen.reduce((n, s) => n + s.pieceCount, 0) });
  };
  const mark = async (ids: string[], status: 'new' | 'cut') => {
    await api.setStatus(ids, status);
    await refresh();
    reload();
  };
  const selected = useMemo(() => subs.filter((s) => sel.has(s.id)), [subs, sel]);
  return (
    <section className="card subs" data-testid="submissions">
      <h2>
        {t('teach.subs')} · {cls.name} <span className="code" dir="ltr">{cls.code}</span>
      </h2>
      <button onClick={() => void refresh()} data-testid="refresh-subs">
        {t('teach.refresh')}
      </button>
      <label className="check">
        <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> {t('teach.history')}
      </label>
      {!subs.length && <p className="note">{t('teach.none')}</p>}
      {subs.length > 0 && (
        <table className="sub-table">
          <thead>
            <tr>
              <th>{t('teach.select')}</th>
              <th />
              <th>{t('teach.student')}</th>
              <th>{t('teach.design')}</th>
              <th>{t('teach.material')}</th>
              <th>{t('teach.pieces')}</th>
              <th>{t('teach.status')}</th>
              <th>{t('teach.when')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              const m = MATERIALS.find((x) => x.id === s.materialId.replace(/-custom$/, '')) ?? MATERIALS.find((x) => x.kind === s.materialKind);
              return (
                <tr key={s.id} className={s.superseded ? 'old' : ''} data-testid="submission-row">
                  <td>
                    <input
                      type="checkbox"
                      checked={sel.has(s.id)}
                      aria-label={t('teach.select')}
                      onChange={(e) => setSel((x) => {
                        const n = new Set(x);
                        if (e.target.checked) n.add(s.id);
                        else n.delete(s.id);
                        return n;
                      })}
                      data-testid="sub-select"
                    />
                  </td>
                  <td>{previews[s.id] && <img className="thumb" src={previews[s.id]} alt="" />}</td>
                  <td dir="auto">{s.displayName}</td>
                  <td dir="auto">
                    {s.title}
                    {s.superseded ? ` (${t('teach.replaced')})` : ''}
                  </td>
                  <td>
                    {m ? t(m.nameKey as MsgKey) : s.materialKind}
                    {!MATERIALS.some((x) => x.kind === s.materialKind && Math.abs(x.thickness * 1000 - s.thickness) < 1) && (
                      <span dir="ltr">
                        {' '}
                        {fmtNum(s.thickness / 1000, 2)} {t('unit.mm')}
                      </span>
                    )}
                  </td>
                  <td>{s.pieceCount}</td>
                  <td data-testid="sub-status">{s.status === 'cut' ? t('teach.cut') : t('teach.new')}</td>
                  <td dir="ltr">{new Date(s.createdAt).toLocaleString(useStore.getState().lang === 'he' ? 'he-IL' : 'en-GB')}</td>
                  <td className="row">
                    <button onClick={() => download(s, 'svg')} data-testid="sub-svg">
                      {t('fmt.svg')}
                    </button>
                    <button onClick={() => download(s, 'dxf')}>{t('fmt.dxf')}</button>
                    <button onClick={() => download(s, 'json')}>{t('fmt.json')}</button>
                    <button onClick={() => mark([s.id], s.status === 'cut' ? 'new' : 'cut')}>{s.status === 'cut' ? t('teach.markNew') : t('teach.markCut')}</button>
                    <button
                      className="danger"
                      onClick={async () => {
                        if (!confirm(t('teach.confirmDeleteSub'))) return;
                        await api.deleteSubmission(s.id);
                        await refresh();
                        reload();
                      }}
                    >
                      {t('teach.delete')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {selected.length > 0 && (
        <div className="row batch-bar">
          <span>{t('teach.selectedN', { n: selected.length })}</span>
          <button onClick={makeBatch} data-testid="batch">
            {t('teach.batch')}
          </button>
          <button onClick={() => mark(selected.map((s) => s.id), 'cut')} data-testid="batch-mark-cut">
            {t('teach.markCut')}
          </button>
        </div>
      )}
      {msg && (
        <p className="warn-text" role="alert" data-testid="teacher-msg">
          {msg}
        </p>
      )}
      {batch && (
        <div className="kerf-box" data-testid="batch-ready">
          <p>{t('teach.batchReady', { n: batch.sheets.length, p: batch.pieces })}</p>
          <div className="row">
            <button className="primary" onClick={() => downloadText(`batch-${safeName(cls.name)}-nominal.svg`, batch.sheets.length === 1 ? sheetToSvg(batch.sheets[0]) : sheetsToSvg(batch.sheets), 'image/svg+xml')} data-testid="batch-svg">
              {t('teach.batchSvg')}
            </button>
            <button onClick={() => downloadText(`batch-${safeName(cls.name)}-nominal.dxf`, sheetsToDxf(batch.sheets), 'application/dxf')} data-testid="batch-dxf">
              {t('teach.batchDxf')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
