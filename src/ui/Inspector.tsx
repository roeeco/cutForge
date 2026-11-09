// Contextual card: shows only what belongs to the current selection. Nothing
// selected → the design's settings (template sizes, joints, material and fit,
// snapping); an edge selected → the grow card on the stage takes over.
import type { ReactElement } from 'react';
import { useStore, useT } from '../store/store';
import { NumField, Segmented, Stepper } from './NumField';
import { curveBlocked, deleteDetail, deletePanel, edgeConnection, findDetail, MIN_PANEL, normDeg, panelYaw, parentConnection, pointCurve, setPanelSize, setPanelYaw, setPointCurve, updateDetail } from '../model/ops';
import { pieceKeyOf } from '../model/pieces';
import { matOf } from '../model/materials';
import { rotateCopy } from '../model/pack';
import { DesignSettings } from './DesignSettings';
import { edgeHasRoom } from '../model/adapt';
import { ArraySection, MultiSelection, TextFields } from './Selection';
import { ClearSizes, JointsAdvanced, PanelHinge } from './Connections';
import type { DetailOp } from '../model/types';
import { fmtNum } from '../i18n';
import { edgeLabel, isAutoName, panelLabel } from '../model/names';
import { isCurveKey, panelEdges, segLength } from '../model/edges';
import { Icon } from './icons';
import { EdgeBar } from './EdgeBar';
import { BoardMaterial } from './BoardMaterial';
import { MultiPanel } from './MultiPanel';
import { PlacedSection, placedWhere } from './PlacedUI';
import { panelsCutBy } from '../model/through';
import { ExtrudeSection, FoldOverSection, TraySection, TrayWallNote } from './TrayUI';

export function Inspector() {
  const t = useT();
  const sel = useStore((s) => s.selection);
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const view = useStore((s) => s.view);
  const editOutline = useStore((s) => s.editOutline);
  const mm = t('unit.mm');
  if (sel?.kind === 'edge') return view === '3d' ? <EdgeBar panelId={sel.panelId} edge={sel.edge} /> : null;

  let body: ReactElement | null = null;
  if (sel?.kind === 'detail' && sel.ids.length > 1) {
    body = <MultiSelection ids={sel.ids} />;
  } else if (sel?.kind === 'detail') {
    const f = findDetail(d, sel.id);
    if (f) {
      const { panel, detail: dt } = f;
      const isCircle = dt.shape === 'circle';
      body = (
        <section data-testid="inspector-detail">
          <p className="kicker">{t('insp.shapeOn', { panel: panelLabel(d, panel.id, t) })}</p>
          <div className="card-head">
            <h3>{t(`shape.${dt.shape}`)}</h3>
            <button className="ghost icon-btn danger" onClick={() => apply((x) => deleteDetail(x, dt.id))} aria-label={t('insp.delete')} title={t('insp.delete')}>
              <Icon name="trash" />
            </button>
          </div>
          <Segmented
            label={t('insp.op')}
            value={dt.op}
            options={(['add', 'cut', 'engrave', 'score'] as const).map((o) => ({ value: o, label: <span className={`op-dot ${o}`} />, title: t(`tool.op.${o}`), testId: `detail-op-${o}` }))}
            onChange={(o) => apply((x) => updateDetail(x, dt.id, { op: o as DetailOp }))}
          />
          {dt.op === 'cut' && (
            <div className="through-row">
              <label className="check" title={t('through.help')}>
                <input type="checkbox" checked={!!dt.through} onChange={(e) => apply((x) => updateDetail(x, dt.id, { through: e.target.checked }))} data-testid="detail-through" />
                {t('through.label')}
              </label>
              {dt.through && <span className="note" data-testid="detail-through-count">{t('through.cuts', { n: panelsCutBy(d, dt.id).length })}</span>}
            </div>
          )}
          {dt.shape === 'text' && dt.text ? (
            <TextFields id={dt.id} text={dt.text} />
          ) : isCircle ? (
            <NumField label={t('insp.diameter')} value={dt.w} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { w: v }))} testId="detail-diameter" />
          ) : (
            <>
              <NumField label={t('insp.width')} value={dt.w} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { w: v }))} testId="detail-w" />
              <NumField label={t('insp.height')} value={dt.h} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { h: v }))} testId="detail-h" />
            </>
          )}
          {dt.shape === 'roundrect' && <NumField label={t('insp.radius')} value={dt.r ?? 0} unit={mm} min={0} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { r: v }))} />}
          {!isCircle && (
            <NumField label={t('insp.rotation')} value={dt.rot ?? 0} unit={t('unit.deg')} min={-360} max={360} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { rot: normDeg(v) || undefined }))} testId="detail-rot" />
          )}
          <NumField label={t('insp.x')} value={dt.cx} unit={mm} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { cx: v }))} testId="detail-x" />
          <NumField label={t('insp.y')} value={dt.cy} unit={mm} onCommit={(v) => apply((x) => updateDetail(x, dt.id, { cy: v }))} testId="detail-y" />
          <p className="note">{t('insp.coordsNote')}</p>
          <ArraySection dt={dt} />
        </section>
      );
    }
  } else if (sel?.kind === 'panel' && (sel.ids?.length ?? 0) > 1) {
    body = <MultiPanel ids={sel.ids!} />;
  } else if (sel?.kind === 'panel') {
    const id = sel.id;
    const p = d.panels[id];
    if (p) {
      const pc = parentConnection(d, id);
      const parent = pc ? d.panels[pc.a.panelId] : undefined;
      body = (
        <section data-testid="inspector-panel" key={id}>
          <p className="kicker" data-testid="panel-kicker">{placedWhere(d, id, t) ?? t('insp.part')}</p>
          <div className="card-head">
            <h3 dir="auto">{panelLabel(d, id, t)}</h3>
            <button className="ghost icon-btn" onClick={() => useStore.getState().openSolo(id)} aria-label={t('solo.open')} title={t('solo.open')} data-testid="open-solo">
              <Icon name="solo" />
            </button>
            <button className="ghost icon-btn danger" onClick={() => apply((x) => deletePanel(x, id))} aria-label={t('insp.delete')} title={t('insp.delete')} data-testid="delete-panel">
              <Icon name="trash" />
            </button>
          </div>
          <div className="field">
            <label htmlFor="p-name">{t('insp.panelName')}</label>
            <input
              id="p-name"
              dir="auto"
              value={isAutoName(p.name) ? '' : p.name}
              placeholder={panelLabel(d, id, t)}
              onChange={(e) => useStore.getState().preview((x) => void (x.panels[id].name = e.target.value))}
              onBlur={() => useStore.getState().commit()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <NumField label={t('insp.width')} value={p.w} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, v, undefined))} testId="panel-w" />
          {parent && <p className="note">{t('insp.widthOwned', { panel: panelLabel(d, parent.id, t) })}</p>}
          <NumField label={t('insp.height')} value={p.h} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, undefined, v))} testId="panel-h" />
          {!parent && (
            <NumField label={t('insp.rotation')} value={panelYaw(p)} unit={t('unit.deg')} min={-360} max={360} onCommit={(v) => apply((x) => setPanelYaw(x, id, v))} testId="panel-yaw" />
          )}
          <PanelHinge panelId={id} />
          <TrayWallNote panelId={id} />
          <FoldOverSection panelId={id} />
          {((!parent && p.sketch.kind === 'poly') || (parent && p.sketch.kind === 'wall')) && view === '3d' && (
            <button
              className={editOutline === id ? 'on' : ''}
              aria-pressed={editOutline === id}
              onClick={() => useStore.getState().set({ editOutline: editOutline === id ? null : id, selVertex: null })}
              data-testid="edit-outline"
            >
              <Icon name="polygon" size={16} /> {t(editOutline === id ? 'outline.done' : 'outline.edit')}
            </button>
          )}
          {editOutline === id && <PointCurve panelId={id} />}
          <Stepper
            label={t('insp.quantity')}
            value={d.pieces[pieceKeyOf(d, id)]?.quantity ?? 1}
            min={1}
            max={500}
            slider={false}
            onCommit={(v) => apply((x) => void (x.pieces[pieceKeyOf(x, id)] = { quantity: Math.round(v) }))}
            testId="panel-qty"
          />
          <BoardMaterial ids={[id]} />
          <PlacedSection panelId={id} />
          <ExtrudeSection panelId={id} />
          <TraySection panelId={id} />
          <SheetPlacementControls panelId={id} />
          <ClearSizes panelId={id} />
          <JointsAdvanced panelId={id} />
          <div className="subsection">
            <h4>{t('insp.edges')}</h4>
            <div className="edge-buttons">
              {panelEdges(p)
                .filter((e) => segLength(e) >= MIN_PANEL && !isCurveKey(e.key))
                .map(({ key: e }) => (
                  <button
                    key={e}
                    disabled={!edgeHasRoom(d, id, e, MIN_PANEL)}
                    onClick={() => {
                      useStore.getState().select({ kind: 'edge', panelId: id, edge: e });
                      useStore.getState().setView('3d');
                    }}
                    data-testid={`grow-from-${e.replace(/^e(\d+)$/, '$1')}`}
                  >
                    {t('insp.growFrom', { edge: edgeLabel(d, id, e, t) })}
                  </button>
                ))}
            </div>
          </div>
        </section>
      );
    }
  } else if (!sel) {
    body = <DesignSettings />;
  }

  if (!body) return null;
  return (
    <div className="card-dock">
      <aside className="card inspector" aria-label={t('insp.title')}>
        {body}
      </aside>
    </div>
  );
}

/** While editing an outline: the selected point as a corner or a smooth (auto) curve. */
function PointCurve({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.selVertex);
  if (sel === null || sel === 'bl' || sel === 'br') return <p className="note">{t('outline.pickPoint')}</p>;
  const curved = pointCurve(d, panelId, sel);
  const blocked = !curved && curveBlocked(d, panelId, sel);
  return (
    <div className="subsection" data-testid="point-curve">
      <Segmented
        label={t('outline.point')}
        value={curved ? 'auto' : 'corner'}
        options={[
          { value: 'corner', label: t('outline.corner'), testId: 'point-corner' },
          { value: 'auto', label: <><Icon name="curve" size={14} /> {t('outline.curve')}</>, testId: 'point-curve-auto' },
        ]}
        onChange={(v) => !(v === 'auto' && blocked) && useStore.getState().apply((x) => void setPointCurve(x, panelId, sel, v === 'auto'))}
      />
      {blocked === 'joined' && <p className="note" data-testid="point-curve-blocked">{t('outline.curveJoined')}</p>}
    </div>
  );
}

/** Fold/unfold a folded net in the 3D view (view only). */
export function FoldSlider() {
  const t = useT();
  const foldT = useStore((s) => s.foldT);
  const play = () => {
    const from = useStore.getState().foldT;
    const to = from > 0.5 ? 0 : 1;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 600);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      useStore.getState().set({ foldT: from + (to - from) * e });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  return (
    <div className="field" data-testid="fold-slider">
      <label htmlFor="fold-t">{t('fold.label')}</label>
      <span className="row" dir="ltr">
        <button className="ghost icon-btn" onClick={play} aria-label={foldT > 0.5 ? t('fold.unfold') : t('fold.fold')} title={foldT > 0.5 ? t('fold.unfold') : t('fold.fold')} data-testid="fold-play">
          <Icon name="play" />
        </button>
        <input id="fold-t" type="range" min={0} max={1} step={0.01} value={foldT} onChange={(e) => useStore.getState().set({ foldT: Number(e.target.value) })} data-testid="fold-range" />
      </span>
    </div>
  );
}

/** On the cut plan: turn the copy the student clicked 90° (respecting the grain). */
function SheetPlacementControls({ panelId }: { panelId: string }) {
  const t = useT();
  const view = useStore((s) => s.view);
  const key = useStore((s) => s.sheetCopy);
  const d = useStore((s) => s.design);
  if (view !== '2d' || !key || !key.startsWith(pieceKeyOf(d, panelId) + '#')) return null;
  const blocked = matOf(d, panelId).grain !== 'none' && !d.allowRotate;
  return (
    <div className="subsection">
      {d.placements[key]?.manual && <p className="note">{t('pack.manual')}</p>}
      <button disabled={blocked} onClick={() => useStore.getState().apply((x) => void rotateCopy(x, key))} data-testid="rotate-copy">
        {t('pack.rotate')}
      </button>
      {blocked && <p className="note">{t('pack.rotateBlocked')}</p>}
    </div>
  );
}
