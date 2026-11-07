import type { ReactElement } from 'react';
import { useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { solve, deleteDetail, deletePanel, edgeConnection, findDetail, parentConnection, setConnection, setPanelSize, updateDetail } from '../model/ops';
import { connectionsFor } from '../model/materials';
import { fingerCount } from '../model/geometry';
import { edgeLength } from '../model/frame';
import type { ConnectionKind, DetailOp, MaterialProfile } from '../model/types';
import { fmtNum } from '../i18n';

export function Inspector() {
  const t = useT();
  const sel = useStore((s) => s.selection);
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const mm = t('unit.mm');

  let body: ReactElement;
  if (sel?.kind === 'detail') {
    const f = findDetail(d, sel.id);
    if (!f) body = <MaterialSettings />;
    else {
      const { panel, detail: dt } = f;
      const isCircle = dt.shape === 'circle';
      body = (
        <section data-testid="inspector-detail">
          <h3>{t('insp.detail', { shape: t(`shape.${dt.shape}`), panel: panel.name })}</h3>
          <p className="note">{t('insp.coordsNote')}</p>
          <div className="field">
            <label htmlFor="d-op">{t('insp.op')}</label>
            <select id="d-op" value={dt.op} onChange={(e) => apply((x) => updateDetail(x, dt.id, { op: e.target.value as DetailOp }))}>
              {(['cut', 'engrave', 'score'] as const).map((o) => (
                <option key={o} value={o}>
                  {t(`tool.op.${o}`)}
                </option>
              ))}
            </select>
          </div>
          {isCircle ? (
            <NumField label={t('insp.diameter')} value={dt.w} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { w: v }))} testId="detail-diameter" />
          ) : (
            <>
              <NumField label={t('insp.width')} value={dt.w} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { w: v }))} testId="detail-w" />
              <NumField label={t('insp.height')} value={dt.h} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { h: v }))} testId="detail-h" />
            </>
          )}
          {dt.shape === 'roundrect' && <NumField label={t('insp.radius')} value={dt.r ?? 0} unit={mm} min={0} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { r: v }))} />}
          <NumField label={t('insp.x')} value={dt.cx} unit={mm} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { cx: v }))} testId="detail-x" />
          <NumField label={t('insp.y')} value={dt.cy} unit={mm} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { cy: v }))} testId="detail-y" />
          <button className="danger" onClick={() => apply((x) => deleteDetail(x, dt.id))}>
            {t('insp.delete')}
          </button>
        </section>
      );
    }
  } else if (sel?.kind === 'panel' || sel?.kind === 'edge') {
    const id = sel.kind === 'panel' ? sel.id : sel.panelId;
    const p = d.panels[id];
    if (!p) body = <MaterialSettings />;
    else {
      const pc = parentConnection(d, id);
      const parent = pc ? d.panels[pc.a.panelId] : undefined;
      body = (
        <section data-testid="inspector-panel">
          <h3>{t('insp.panel', { name: p.name })}</h3>
          <div className="field">
            <label htmlFor="p-name">{t('insp.panelName')}</label>
            <input
              id="p-name"
              dir="auto"
              value={p.name}
              onChange={(e) => useStore.getState().preview((x) => void (x.panels[id].name = e.target.value))}
              onBlur={() => useStore.getState().commit()}
            />
          </div>
          <NumField label={t('insp.width')} value={p.w} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, v, undefined))} testId="panel-w" />
          {parent && <p className="note">{t('insp.widthOwned', { panel: parent.name })}</p>}
          <NumField label={t('insp.height')} value={p.h} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, undefined, v))} testId="panel-h" />
          <p className="note">{t('insp.thickness', { t: fmtNum(d.material.thickness, 2) })}</p>
          <NumField
            label={t('insp.quantity')}
            value={d.pieces[id]?.quantity ?? 1}
            decimals={0}
            min={1}
            max={500}
            onCommit={(v) => apply((x) => void (x.pieces[id] = { quantity: Math.round(v) }))}
            testId="panel-qty"
          />
          {pc && parent && (
            <div className="subsection" data-testid="inspector-connection">
              <h4>{t('conn.title', { panel: parent.name })}</h4>
              <p className="note" dir="auto">{t('conn.angle', { a: pc.angle })}</p>
              <div className="field">
                <label htmlFor="c-kind">{t('edge.connection')}</label>
                <select id="c-kind" value={pc.kind} onChange={(e) => apply((x) => setConnection(x, pc.id, { kind: e.target.value as ConnectionKind }))}>
                  {connectionsFor(d.material, pc.angle).map((o) => (
                    <option key={o} value={o}>
                      {t(`conn.${o}`)}
                    </option>
                  ))}
                </select>
              </div>
              {pc.kind === 'finger' && (
                <NumField
                  label={t('conn.fingers')}
                  value={fingerCount(pc, edgeLength(parent, pc.a.edge), d.material.thickness)}
                  decimals={0}
                  min={3}
                  max={99}
                  onCommit={(v) => apply((x) => setConnection(x, pc.id, { fingers: v }))}
                  testId="conn-fingers"
                />
              )}
            </div>
          )}
          <div className="subsection">
            <h4>{t('insp.edges')}</h4>
            <div className="edge-buttons">
              {[0, 1, 2, 3].map((e) => (
                <button
                  key={e}
                  disabled={!!edgeConnection(d, id, e)}
                  className={sel.kind === 'edge' && sel.edge === e ? 'on' : ''}
                  onClick={() => {
                    useStore.getState().select({ kind: 'edge', panelId: id, edge: e });
                    useStore.getState().setView('3d');
                  }}
                  data-testid={`grow-from-${e}`}
                >
                  {t('insp.growFrom', { edge: t(`edge.name.${e}` as 'edge.name.0') })}
                </button>
              ))}
            </div>
          </div>
          <button className="danger" onClick={() => apply((x) => deletePanel(x, id))}>
            {t('insp.delete')}
          </button>
        </section>
      );
    }
  } else body = <MaterialSettings />;

  return (
    <aside className="inspector" aria-label={t('insp.title')}>
      <h2>{t('insp.title')}</h2>
      {body}
    </aside>
  );
}

function MaterialSettings() {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const m = d.material;
  const mm = t('unit.mm');
  const setM = (patch: Partial<MaterialProfile>) =>
    apply((x) => {
      // Edited values make this a custom profile, still based on the same material kind.
      const id = x.material.id.endsWith('-custom') ? x.material.id : `${x.material.id}-custom`;
      Object.assign(x.material, patch, { id });
      solve(x);
    });
  return (
    <section data-testid="inspector-design">
      <p className="note">{t('insp.nothing')}</p>
      <h3>{t(m.nameKey as 'mat.ply3')}</h3>
      <p className="note">{m.kind === 'plywood' ? t('mat.joints.ply') : t('mat.joints.paper')}</p>
      <NumField label={t('mat.thickness')} value={m.thickness} decimals={2} unit={mm} min={0.1} max={20} onCommit={(v) => setM({ thickness: v })} testId="mat-thickness" />
      <NumField label={t('mat.kerf')} value={m.kerf} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ kerf: v })} />
      <NumField label={t('mat.clearance')} value={m.clearance} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ clearance: v })} />
      <NumField label={t('mat.sheetW')} value={m.sheetW} decimals={0} unit={mm} min={50} max={3000} onCommit={(v) => setM({ sheetW: v })} />
      <NumField label={t('mat.sheetH')} value={m.sheetH} decimals={0} unit={mm} min={50} max={3000} onCommit={(v) => setM({ sheetH: v })} />
      <NumField label={t('insp.spacing')} value={d.sheetSpacing} unit={mm} min={0} max={50} onCommit={(v) => apply((x) => void (x.sheetSpacing = v))} />
      <NumField label={t('insp.margin')} value={d.sheetMargin} unit={mm} min={0} max={100} onCommit={(v) => apply((x) => void (x.sheetMargin = v))} />
      <p className="note">{t('mat.calibrate')}</p>
    </section>
  );
}
