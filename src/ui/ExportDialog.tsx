import { useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { prepareExport, type KerfMode } from '../export/prepare';
import { sheetToSvg, sheetsToSvg } from '../export/svg';
import { sheetsToDxf } from '../export/dxf';
import { validate } from '../model/validate';
import { downloadText, safeName } from './download';
import { fmtNum } from '../i18n';

export function ExportDialog() {
  const t = useT();
  const d = useStore((s) => s.design);
  const close = () => useStore.getState().set({ exportOpen: false });
  const [format, setFormat] = useState<'svg' | 'dxf'>('svg');
  const [split, setSplit] = useState(false);
  const [mode, setMode] = useState<KerfMode>('nominal');
  const prepared = useMemo(() => prepareExport(d, mode), [d, mode]);
  const issues = useMemo(() => validate(d), [d]);
  const pieces = Object.values(d.pieces).reduce((a, p) => a + p.quantity, 0);
  const base = `${safeName(d.name)}-${d.material.id}-${mode}-kerf${fmtNum(d.material.kerf, 2)}mm`;
  const blocked = prepared.errors.length > 0;
  const go = () => {
    const sheets = prepared.sheets;
    if (format === 'dxf') {
      if (split && sheets.length > 1) sheets.forEach((s, i) => downloadText(`${base}-sheet${i + 1}.dxf`, sheetsToDxf([s]), 'application/dxf'));
      else downloadText(`${base}.dxf`, sheetsToDxf(sheets), 'application/dxf');
    } else if (split && sheets.length > 1) sheets.forEach((s, i) => downloadText(`${base}-sheet${i + 1}.svg`, sheetToSvg(s), 'image/svg+xml'));
    else downloadText(`${base}.svg`, sheets.length === 1 ? sheetToSvg(sheets[0]) : sheetsToSvg(sheets), 'image/svg+xml');
    close();
  };
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="exp-title" onClick={(e) => e.stopPropagation()} data-testid="export-dialog">
        <h2 id="exp-title">{t('export.title')}</h2>
        <p className="note">{t('export.sheets', { n: prepared.sheets.length, p: pieces })}</p>
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
        {issues.length > 0 && (
          <div className="issues" data-testid="export-issues">
            <strong>{t('export.problems')}</strong>
            <ul>
              {issues.map((i, k) => (
                <li key={k}>
                  <button
                    className="link"
                    onClick={() => {
                      useStore.getState().select(i.target.kind === 'detail' ? { kind: 'detail', id: i.target.id, ids: [i.target.id] } : i.target);
                      close();
                    }}
                  >
                    {t(i.key, i.vars)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={close}>{t('export.cancel')}</button>
          <button className="primary" onClick={go} data-testid="export-go" disabled={!d.order.length || blocked}>
            {issues.length ? t('export.anyway') : t('export.go')}
          </button>
        </div>
      </div>
    </div>
  );
}
