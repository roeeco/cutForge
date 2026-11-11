// Contextual card: shows only what belongs to the current selection. Nothing
// selected → the design's settings (template sizes, joints, material and fit,
// snapping); an edge selected → the grow card on the stage takes over.
import { useEffect, useState, type ReactElement } from 'react';
import { useStore, useT } from '../store/store';
import { NumField, Segmented, Stepper } from './NumField';
import { convertToPoints, curveBlocked, deleteDetail, deletePanel, edgeConnection, findDetail, MIN_PANEL, normDeg, panelYaw, parentConnection, pointCurve, setCornerRadius, setPanelSize, setPanelYaw, setPointCurve, setPointRound, setRoundShape, updateDetail } from '../model/ops';
import { pieceKeyOf, pieceRoot, placementPiece } from '../model/pieces';
import { bendOf, matOf } from '../model/materials';
import { materialName } from './materialName';
import { ovalRadii } from '../model/round';
import { rotateCopy } from '../model/pack';
import { DesignSettings } from './DesignSettings';
import { edgeHasRoom } from '../model/adapt';
import { ArraySection, MultiSelection, TextFields } from './Selection';
import { ClearSizes, JointsAdvanced, PanelHinge } from './Connections';
import type { DetailOp } from '../model/types';
import { fmtNum } from '../i18n';
import { edgeLabel, isAutoName, panelLabel } from '../model/names';
import { fillets, isCurveKey, panelEdges, segLength } from '../model/edges';
import { Icon } from './icons';
import { EdgeBar } from './EdgeBar';
import { BoardMaterial } from './BoardMaterial';
import { MultiPanel } from './MultiPanel';
import { DividerSection, PlacedSection, placedWhere } from './PlacedUI';
import { panelsCutBy } from '../model/through';
import { ExtrudeSection, FoldOverSection, TraySection, TrayWallNote } from './TrayUI';
import { Gate } from '../easy/Gate';
import { InsideSection } from '../easy/InsideUI';
import { ModeOverride, shown, useFeature, useMode } from '../easy/features';
import { setMode, workshopOnly } from '../easy/mode';

const OP_ICONS = { add: 'opAdd', cut: 'opCut', engrave: 'opEngrave', score: 'opScore' } as const;

export function Inspector() {
  const t = useT();
  const sel = useStore((s) => s.selection);
  const d = useStore((s) => s.design);
  const quick = useMode() === 'quick';
  // More… shows a card's Workshop version until the selection changes (milestone 37)
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [sel]);
  if (!quick || !sel || sel.kind === 'edge') return <InspectorBody />;
  const multi = (sel.kind === 'detail' && sel.ids.length > 1) || (sel.kind === 'panel' && (sel.ids?.length ?? 0) > 1);
  const panelId = sel.kind === 'panel' ? sel.id : findDetail(d, sel.id)?.panel.id;
  const why = !multi && panelId ? workshopOnly(d, panelId) : null;
  if (why) return <ReadOnlyCard panelId={panelId!} detail={sel.kind === 'detail'} why={why} />;
  const toggle = multi ? null : (
    <div className="more-row">
      <button className="link" aria-expanded={more} onClick={() => setMore(!more)} data-testid="quick-more">
        {t(more ? 'quick.less' : 'quick.more')}
      </button>
    </div>
  );
  return (
    <ModeOverride.Provider value={more ? 'workshop' : null}>
      <InspectorBody footer={toggle} />
    </ModeOverride.Provider>
  );
}

/** Quick build: a part made with Workshop tools is shown but not changed (milestone 37). */
function ReadOnlyCard({ panelId, detail, why }: { panelId: string; detail: boolean; why: NonNullable<ReturnType<typeof workshopOnly>> }) {
  const t = useT();
  const d = useStore((s) => s.design);
  return (
    <div className="card-dock">
      <aside className="card inspector" aria-label={t('insp.title')} data-testid="inspector-readonly">
        <p className="kicker">{detail ? t('insp.shapeOn', { panel: panelLabel(d, panelId, t) }) : t('insp.part')}</p>
        <div className="card-head">
          <h3 dir="auto">{panelLabel(d, panelId, t)}</h3>
        </div>
        <p className="note readonly-note" data-testid="readonly-why">
          {t('quick.madeInWorkshop', { why: t(`quick.why.${why}`) })}
        </p>
        <button className="primary" onClick={() => setMode('workshop')} data-testid="quick-open-workshop">
          {t('quick.openWorkshop')}
        </button>
      </aside>
    </div>
  );
}

function InspectorBody({ footer }: { footer?: ReactElement | null }) {
  const t = useT();
  const sel = useStore((s) => s.selection);
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const view = useStore((s) => s.view);
  const editOutline = useStore((s) => s.editOutline);
  const opsAll = shown(useFeature('op.scoreAdd'));
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
          {opsAll ? (
            <Segmented
              label={t('insp.op')}
              value={dt.op}
              options={(['cut', 'engrave', 'score', 'add'] as const).map((o) => ({ value: o, label: <span className={`op-ico ${o}`}><Icon name={OP_ICONS[o]} size={18} /></span>, title: t(`op.name.${o}`), testId: `detail-op-${o}` }))}
              onChange={(o) => apply((x) => updateDetail(x, dt.id, { op: o as DetailOp }))}
            />
          ) : (
            // Quick build: a hole is cut out or engraved
            <Segmented
              label={t('insp.op')}
              value={dt.op === 'engrave' ? 'engrave' : 'cut'}
              options={[
                { value: 'cut', label: t('quick.cutOut'), testId: 'detail-op-cut' },
                { value: 'engrave', label: t('quick.engrave'), testId: 'detail-op-engrave' },
              ]}
              onChange={(o) => apply((x) => updateDetail(x, dt.id, { op: o as DetailOp, through: false }))}
            />
          )}
          {opsAll && (
            <p className="note op-caption" data-testid="detail-op-caption">
              <strong>{t(`op.name.${dt.op}`)}</strong> · {t(`op.desc.${dt.op}`)}
            </p>
          )}
          {dt.op === 'cut' && opsAll && (
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
          {p.divider ? (
            // a divider's length comes from its ends (milestone 44)
            <NumField label={t('insp.width')} value={p.w} unit={mm} min={5} disabled onCommit={() => undefined} testId="panel-w" />
          ) : (
            <NumField label={t('insp.width')} value={p.w} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, v, undefined))} testId="panel-w" />
          )}
          {parent && <p className="note">{t('insp.widthOwned', { panel: panelLabel(d, parent.id, t) })}</p>}
          <NumField label={t('insp.height')} value={p.h} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, undefined, v))} testId="panel-h" />
          {p.divider && <DividerSection panelId={id} />}
          <RoundSection panelId={id} />
          {!parent && !p.divider && (
            <NumField label={t('insp.rotation')} value={panelYaw(p)} unit={t('unit.deg')} min={-360} max={360} onCommit={(v) => apply((x) => setPanelYaw(x, id, v))} testId="panel-yaw" />
          )}
          <Gate f="hinge">
            <PanelHinge panelId={id} />
          </Gate>
          <TrayWallNote panelId={id} />
          <Gate f="foldover">
            <FoldOverSection panelId={id} />
          </Gate>
          {((!parent && p.sketch.kind === 'poly' && !p.sketch.round) || (parent && p.sketch.kind === 'wall')) && view === '3d' && (
            <button
              className={editOutline === id ? 'on' : ''}
              aria-pressed={editOutline === id}
              onClick={() => useStore.getState().set({ editOutline: editOutline === id ? null : id, selVertex: null })}
              data-testid="edit-outline"
            >
              <Icon name="polygon" size={16} /> {t(editOutline === id ? 'outline.done' : 'outline.edit')}
            </button>
          )}
          {editOutline === id && (
            <Gate f="curves">
              <PointCurve panelId={id} />
            </Gate>
          )}
          <Stepper
            label={t('insp.quantity')}
            value={d.pieces[pieceKeyOf(d, id)]?.quantity ?? 1}
            min={1}
            max={500}
            slider={false}
            onCommit={(v) => apply((x) => void (x.pieces[pieceKeyOf(x, id)] = { quantity: Math.round(v) }))}
            testId="panel-qty"
          />
          <Gate f="boardMaterial">
            <BoardMaterial ids={[id]} />
          </Gate>
          <Gate f="construction">
            <PlacedSection panelId={id} />
          </Gate>
          <ExtrudeSection panelId={id} />
          <TraySection panelId={id} />
          <InsideSection panelId={id} />
          <SheetPlacementControls panelId={id} />
          <ClearSizes panelId={id} />
          <Gate f="joints">
            <JointsAdvanced panelId={id} />
          </Gate>
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
        {footer}
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
  const p = d.panels[panelId];
  // a base's point may also be a rounded corner (milestone 45)
  const vertex = p?.sketch.kind === 'poly' && typeof sel === 'number' && !parentConnection(d, panelId) ? p.sketch.pts[sel] : undefined;
  const kind = vertex?.curve === 'round' ? 'round' : pointCurve(d, panelId, sel) ? 'auto' : 'corner';
  const blocked = kind !== 'auto' && curveBlocked(d, panelId, sel);
  const apply = useStore.getState().apply;
  const choose = (v: string) => {
    if (v === 'auto' && blocked) return;
    if (v === 'round' && typeof sel === 'number') apply((x) => void setPointRound(x, panelId, sel, vertex?.r ?? 10));
    else if (v === 'auto') apply((x) => void setPointCurve(x, panelId, sel, true));
    else apply((x) => void (kind === 'round' && typeof sel === 'number' ? setPointRound(x, panelId, sel, null) : setPointCurve(x, panelId, sel, false)));
  };
  return (
    <div className="subsection" data-testid="point-curve">
      <Segmented
        label={t('outline.point')}
        value={kind}
        options={[
          { value: 'corner', label: t('outline.corner'), testId: 'point-corner' },
          { value: 'auto', label: <><Icon name="curve" size={14} /> {t('outline.curve')}</>, testId: 'point-curve-auto' },
          ...(vertex ? [{ value: 'round', label: t('outline.round'), testId: 'point-round' }] : []),
        ]}
        onChange={choose}
      />
      {kind === 'round' && typeof sel === 'number' && (
        <NumField label={t('outline.radius')} value={vertex?.r ?? 0} unit={t('unit.mm')} min={0.5} onCommit={(v) => apply((x) => void setPointRound(x, panelId, sel, v))} testId="point-radius" />
      )}
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
  if (view !== '2d' || !key || pieceRoot(placementPiece(key)) !== pieceKeyOf(d, panelId)) return null;
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

/**
 * A round base's card section (milestone 45): its shape, an oval's end radius
 * (and the side radius it gives), Convert to points; a base with rounded
 * corners: one radius for them all. Width and depth are the panel's own fields.
 */
function RoundSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = d.panels[panelId];
  if (!p || p.sketch.kind !== 'poly' || parentConnection(d, panelId)) return null;
  const s = p.sketch;
  const rounded = s.pts.filter((q) => q.curve === 'round');
  if (!s.round && !rounded.length) return null;
  const mm = t('unit.mm');
  const m = matOf(d, panelId);
  const lim = bendOf(m).patternR;
  // its tightest bend: the smallest radius as built (an oval's ends, a clamped corner)
  const tight = Math.min(...fillets(s.pts).filter((f): f is NonNullable<typeof f> => !!f).map((f) => f.r));
  const tightNote = Number.isFinite(tight) && tight < lim - 1e-6 && (
    <p className="note warn" data-testid="round-tight">
      {t('round.tight', { mat: materialName(t, m), min: Math.round(lim * 10) / 10 })}
    </p>
  );
  if (!s.round)
    return (
      <div className="subsection round" data-testid="round-section">
        <NumField label={t('round.corner')} value={rounded[0].r ?? 0} unit={mm} min={0.5} onCommit={(v) => apply((x) => void setCornerRadius(x, panelId, v))} testId="round-corner-all" />
        {tightNote}
      </div>
    );
  const shape = s.round.shape;
  const a = Math.max(p.w, p.h) / 2, b = Math.min(p.w, p.h) / 2;
  const radii = shape === 'oval' ? ovalRadii(a, b, s.round.rEnd) : null;
  return (
    <div className="subsection round" data-testid="round-section">
      <h4>{t('round.title')}</h4>
      <Segmented
        label={t('round.shape')}
        value={shape}
        options={(['circle', 'oval', 'stadium'] as const).map((x) => ({ value: x, label: t(`round.${x}`), testId: `round-shape-${x}` }))}
        onChange={(v) => apply((x) => void setRoundShape(x, panelId, { shape: v as 'circle' | 'oval' | 'stadium' }))}
      />
      {shape === 'oval' && radii && (
        <>
          <NumField label={t('round.end')} value={radii.r1} unit={mm} min={0.5} max={b} onCommit={(v) => apply((x) => void setRoundShape(x, panelId, { rEnd: v }))} testId="round-end" />
          <p className="note" data-testid="round-side">
            {Number.isFinite(radii.r2) ? t('round.side', { r: Math.round(radii.r2 * 10) / 10 }) : t('round.isStadium')}
          </p>
        </>
      )}
      {tightNote}
      <button onClick={() => apply((x) => void convertToPoints(x, panelId))} title={t('round.toPointsNote')} data-testid="round-to-points">
        {t('round.toPoints')}
      </button>
    </div>
  );
}
