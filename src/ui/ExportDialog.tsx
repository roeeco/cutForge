import { useMemo, useState } from 'react';
import { issueSelection, useStore, useT } from '../store/store';
import { prepareExport, type KerfMode } from '../export/prepare';
import { sheetToSvg, sheetsToSvg } from '../export/svg';
import { sheetsToDxf } from '../export/dxf';
import { validate } from '../model/validate';
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
  const prepared = useMemo(() => prepareExport(d, mode), [d, mode]);
  const issues = useMemo(() => validate(d), [d]);
  const check = shown(useFeature('exportCheck'));
  // a waffle design's parts are not boards (milestone 52): count what is cut
  const pieces = d.kind === 'waffle' ? prepared.sheets.reduce((a, s) => a + s.contours.filter((c) => c.role === 'outer').length, 0) : Object.values(d.pieces).reduce((a, p) => a + p.quantity, 0);
  const blocked = prepared.errors.length > 0;
  // one file per material (milestone 36), each with its own kerf; one material keeps the old names
  const files = exportFiles(d.name, prepared, mode);
  const go = () => {
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
        <fieldset>
          <legend>{t('export.kerfMode')}</legend>
          <label>
            <input type="radio" name="kerf" checked={mode === 'nominal'} onChange={() => setMode('nominal')} data-testid="kerf-nominal" /> {t('export.nominal')}
          </label>
          <label>
            <input type="radio" name="kerf" checked={mode === 'compensated'} onChange={() => setMode('compensated')} data-testid="kerf-compensated" /> {t('export.compensated')}
          </label>
        </fieldset>
        <div className="kerf-box" data-testid="kerf-box">
          <strong>{mode === 'nominal' ? t('export.kerf', { k: fmtNum(d.material.kerf, 2) }) : t('export.kerfComp', { h: fmtNum(d.material.kerf / 2, 3) })}</strong>
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
                    {t(i.key, i.vars)}
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
          <button className="primary" onClick={go} data-testid="export-go" disabled={(!d.order.length && !(d.kind === 'waffle' && pieces > 0)) || blocked}>
            {issues.length ? t('export.anyway') : t('export.go')}
          </button>
        </div>
      </div>
    </div>
  );
}
