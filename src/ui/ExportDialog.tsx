import { useEffect, useMemo, useState } from 'react';
import { projectDesigns, projectOf } from '../store/persist';
import { migrateDesign } from '../model/serialize';
import { projectBatches } from '../export/project';
import { applySize } from '../model/sizes';
import { specHtml, specPages, type Paper, type SpecText } from '../export/spec';
import type { Design } from '../model/types';
import { issueSelection, useStore, useT } from '../store/store';
import { prepareExport, type KerfMode } from '../export/prepare';
import { sheetToSvg, sheetsToSvg } from '../export/svg';
import { sheetsToDxf } from '../export/dxf';
import { validate } from '../model/validate';
import { pieceCopies } from '../model/pack';
import { issueVars, panelLabel } from '../model/names';
import { annotationContours, annotations } from '../export/annotate';
import { canFix, fixIssue } from '../easy/fix';
import { shown, useFeature } from '../easy/features';
import { downloadText, safeName } from './download';
import { fmtNum } from '../i18n';
import type { Prepared } from '../export/prepare';

/** The files an export writes: one per material, named by the material (and its kerf). */
export function exportFiles(name: string, p: Prepared, mode: KerfMode): { base: string; mat: string; sheets: Prepared['sheets'] }[] {
  return p.materials.map((m) => ({ base: `${safeName(name)}-${m.mat}-${mode}-kerf${fmtNum(m.profile.kerf, 2)}mm`, mat: m.mat, sheets: m.sheets }));
}

export function ExportDialog() {
  const t = useT();
  const d = useStore((s) => s.design);
  const close = () => useStore.getState().set({ exportOpen: false });
  const [format, setFormat] = useState<'svg' | 'dxf'>('svg');
  const [split, setSplit] = useState(false);
  const [mode, setMode] = useState<KerfMode>('nominal');
  // milestone 89: names, blank sizes and glue areas on the GUIDE layer, when asked (off: the file is as before)
  const [annotate, setAnnotate] = useState(false);
  const annF = shown(useFeature('export.annotations'));
  const prepared = useMemo(
    () => prepareExport(d, mode, { kissUp: t('export.kissUp'), kissUpShort: t('export.kissUpShort') }, annotate && annF ? (c) => annotationContours(annotations(d, c, (id) => panelLabel(d, id, t), t('unit.mm')).map((a) => (a.kind === 'glue' ? { ...a, text: t('ann.glue') } : a))) : undefined),
    [d, mode, t, annotate, annF],
  );
  const issues = useMemo(() => validate(d), [d]);
  const check = shown(useFeature('exportCheck'));
  // Quick build: nominal, the kerf set on the laser (LIDS_LINES_PROJECTS_PLAN.md §10.6)
  const kerfChoice = shown(useFeature('export.kerf'));
  // what is cut, counted as the cut plan counts it (it summed every board's copies: a five-board net was "5 pieces")
  const pieces = useMemo(() => pieceCopies(d).length, [d]);
  const blocked = prepared.errors.length > 0;
  // one file per material (milestone 36), each with its own kerf; one material keeps the old names
  const files = exportFiles(d.name, prepared, mode);
  // milestone 87: the open design's project, when it has other designs: cut it all, one batch per material
  const [project, setProjectState] = useState<{ name: string; designs: Design[] } | null>(null);
  const [scope, setScope] = useState<'design' | 'project'>('design');
  useEffect(() => {
    let live = true;
    projectOf(d.id)
      .then(async (pj) => {
        if (!pj || !live) return;
        const designs = (await projectDesigns(pj.id)).map((r) => migrateDesign(r)).map((x) => (x.id === d.id ? d : x));
        if (live && designs.length > 1) setProjectState({ name: pj.name, designs });
      })
      .catch(() => undefined);
    return () => void (live = false);
  }, [d.id]);
  const goProject = () => {
    if (!project) return;
    for (const b of projectBatches(project.designs, mode)) {
      if ('error' in b.result) continue;
      const base = `${safeName(project.name)}-${b.material.id}-${mode}-kerf${fmtNum(b.material.kerf, 2)}mm`;
      const sheets = b.result.sheets;
      if (format === 'dxf') downloadText(`${base}.dxf`, sheetsToDxf(sheets), 'application/dxf');
      else downloadText(`${base}.svg`, sheets.length === 1 ? sheetToSvg(sheets[0]) : sheetsToSvg(sheets), 'image/svg+xml');
    }
    close();
  };
  // milestone 88: the master and each size, as chosen; each size checked and named in its messages
  const sizes = d.sizes ?? [];
  const [sizeOn, setSizeOn] = useState<Record<string, boolean>>({});
  const sizeIssues = useMemo(
    () =>
      sizes
        .filter((sz) => sizeOn[sz.id])
        .flatMap((sz) => {
          try {
            return validate(applySize(d, sz)).map((i) => ({ size: sz.name, text: t(i.key, issueVars(applySize(d, sz), i, t)) }));
          } catch {
            return [{ size: sz.name, text: t('err.damaged') }];
          }
        }),
    [d, sizeOn, t],
  );
  const goSizes = () => {
    for (const sz of sizes) {
      if (!sizeOn[sz.id]) continue;
      const x = applySize(d, sz);
      const p = prepareExport(x, mode, { kissUp: t('export.kissUp'), kissUpShort: t('export.kissUpShort') });
      for (const f of exportFiles(`${d.name || 'cutforge'}-${sz.name}`, p, mode)) {
        if (format === 'dxf') downloadText(`${f.base}.dxf`, sheetsToDxf(f.sheets), 'application/dxf');
        else downloadText(`${f.base}.svg`, f.sheets.length === 1 ? sheetToSvg(f.sheets[0]) : sheetsToSvg(f.sheets), 'image/svg+xml');
      }
    }
  };
  const specF = shown(useFeature('export.spec'));
  const [paper, setPaper] = useState<Paper>('A4');
  const lang = useStore((s) => s.lang);
  const specText = (): SpecText => ({
    title: d.name || t('top.untitled'),
    date: new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB'),
    material: t(d.material.nameKey as 'mat.ply3'),
    blank: t('spec.blank'),
    pieces: t('spec.pieces'),
    glue: t('spec.glue'),
    kerf: t('spec.kerf', { k: fmtNum(d.material.kerf, 2) }),
    scale: t('spec.scale'),
    legend: { cut: t('ann.legend.cut'), score: t('ann.legend.score'), engrave: t('ann.legend.engrave'), guide: t('ann.legend.guide') },
    glueWord: t('ann.glue'),
    unit: t('unit.mm'),
    name: (id) => panelLabel(d, id, t),
  });
  const printSpec = () => {
    const pages = specPages(d, paper, specText());
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(specHtml(pages, paper, d.name || 'CutForge', lang === 'he' ? 'rtl' : 'ltr'));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  const go = () => {
    if (scope === 'project' && project) return goProject();
    goSizes();
    if (sizes.length && sizeOn.master === false) return close();
    for (const f of files) {
      const sheets = f.sheets;
      const base = f.base;
      if (format === 'dxf') {
        if (split && sheets.length > 1) sheets.forEach((s, i) => downloadText(`${base}-sheet${i + 1}.dxf`, sheetsToDxf([s]), 'application/dxf'));
        else downloadText(`${base}.dxf`, sheetsToDxf(sheets), 'application/dxf');
      } else if (split && sheets.length > 1) sheets.forEach((s, i) => downloadText(`${base}-sheet${i + 1}.svg`, sheetToSvg(s), 'image/svg+xml'));
      else downloadText(`${base}.svg`, sheets.length === 1 ? sheetToSvg(sheets[0]) : sheetsToSvg(sheets), 'image/svg+xml');
    }
    close();
  };
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="exp-title" onClick={(e) => e.stopPropagation()} data-testid="export-dialog">
        <h2 id="exp-title">{t('export.title')}</h2>
        <p className="note">{t('export.sheets', { n: prepared.sheets.length, p: pieces })}</p>
        {files.length > 1 && (
          <p className="note" data-testid="export-per-material">
            {t('export.perMaterial', { list: files.map((f) => `${f.base}.${format}`).join(', ') })}
          </p>
        )}
        <fieldset>
          <legend>{t('export.format')}</legend>
          <label>
            <input type="radio" name="fmt" checked={format === 'svg'} onChange={() => setFormat('svg')} data-testid="fmt-svg" /> {t('export.svg')}
          </label>
          <label>
            <input type="radio" name="fmt" checked={format === 'dxf'} onChange={() => setFormat('dxf')} data-testid="fmt-dxf" /> {t('export.dxf')}
          </label>
        </fieldset>
        {prepared.sheets.length > 1 && (
          <fieldset>
            <legend>{t('export.files')}</legend>
            <label>
              <input type="radio" name="split" checked={!split} onChange={() => setSplit(false)} /> {t('export.oneFile')}
            </label>
            <label>
              <input type="radio" name="split" checked={split} onChange={() => setSplit(true)} /> {t('export.perSheet')}
            </label>
          </fieldset>
        )}
        {kerfChoice && (
        <fieldset data-testid="kerf-choice">
          <legend>{t('export.kerfMode')}</legend>
          <label>
            <input type="radio" name="kerf" checked={mode === 'nominal'} onChange={() => setMode('nominal')} data-testid="kerf-nominal" /> {t('export.nominal')}
          </label>
          <label>
            <input type="radio" name="kerf" checked={mode === 'compensated'} onChange={() => setMode('compensated')} data-testid="kerf-compensated" /> {t('export.compensated')}
          </label>
        </fieldset>
        )}
        {sizes.length > 0 && (
          <fieldset data-testid="export-sizes">
            <legend>{t('sizes.export')}</legend>
            <label>
              <input type="checkbox" checked={sizeOn.master !== false} onChange={(e) => setSizeOn({ ...sizeOn, master: e.target.checked })} data-testid="export-size-master" /> {t('sizes.master')}
            </label>
            {sizes.map((sz) => (
              <label key={sz.id}>
                <input type="checkbox" checked={!!sizeOn[sz.id]} onChange={(e) => setSizeOn({ ...sizeOn, [sz.id]: e.target.checked })} data-testid={`export-size-${sz.name}`} /> {sz.name}
              </label>
            ))}
            {sizeIssues.map((x, i) => (
              <p key={i} className="note warn-text" data-testid="export-size-issue">
                {t('sizes.issue', { size: x.size, msg: x.text })}
              </p>
            ))}
          </fieldset>
        )}
        {project && (
          <fieldset data-testid="export-scope">
            <legend>{t('proj.scope')}</legend>
            <label>
              <input type="radio" name="scope" checked={scope === 'design'} onChange={() => setScope('design')} data-testid="export-scope-design" /> {t('proj.thisDesign')}
            </label>
            <label>
              <input type="radio" name="scope" checked={scope === 'project'} onChange={() => setScope('project')} data-testid="export-scope-project" /> {t('proj.whole', { name: project.name, n: project.designs.length })}
            </label>
          </fieldset>
        )}
        {annF && (
          <label className="check" data-testid="export-annotate-row">
            <input type="checkbox" checked={annotate} onChange={(e) => setAnnotate(e.target.checked)} data-testid="export-annotate" /> {t('export.annotate')}
          </label>
        )}
        {specF && (
          // milestone 90: a printed plan of each kind of piece, at a stated scale (Save as PDF from the print view)
          <div className="field spec-row" data-testid="export-spec-row">
            <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label={t('spec.paper')} data-testid="export-spec-paper">
              {(['A4', 'A3'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`spec.${x}`)}
                </option>
              ))}
            </select>
            <button onClick={printSpec} data-testid="export-spec">
              {t('spec.print')}
            </button>
          </div>
        )}
        <div className="kerf-box" data-testid="kerf-box">
          <strong>{!kerfChoice ? t('export.kerfQuick', { k: fmtNum(d.material.kerf, 2) }) : mode === 'nominal' ? t('export.kerf', { k: fmtNum(d.material.kerf, 2) }) : t('export.kerfComp', { h: fmtNum(d.material.kerf / 2, 3) })}</strong>
          {mode === 'nominal' && <p className="note">{t('export.kerfNote')}</p>}
          <p className="note">{t('export.layers')}</p>
          <p className="note">{t('export.offline')}</p>
        </div>
        {blocked && (
          <div className="issues" data-testid="export-blocked">
            <ul>
              {prepared.errors.map((e, k) => (
                <li key={k}>
                  <button className="link" onClick={() => (useStore.getState().select({ kind: 'panel', id: e.panelId ?? e.pieceKey }), close())}>
                    {t('export.compError', { panel: d.panels[e.panelId ?? e.pieceKey]?.name ?? '?' })}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {issues.length > 0 && check && (
          <div className="issues" data-testid="export-issues">
            <strong>{t('export.problems')}</strong>
            <ul>
              {issues.map((i, k) => (
                <li key={k}>
                  <button
                    className="link"
                    onClick={() => {
                      useStore.getState().select(issueSelection(i));
                      close();
                    }}
                  >
                    {t(i.key, issueVars(d, i, t))}
                  </button>
                  {canFix(i) && (
                    // the same one-click fixes as Quick build's badge (milestone 39)
                    <button className="fix-btn" onClick={() => useStore.getState().apply((x) => void fixIssue(x, i))} data-testid="export-fix">
                      {t('ready.fix')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={close} data-testid="export-cancel">{t('export.cancel')}</button>
          <button className="primary" onClick={go} data-testid="export-go" disabled={!d.order.length || blocked}>
            {issues.length ? t('export.anyway') : t('export.go')}
          </button>
        </div>
      </div>
    </div>
  );
}
