// Contextual card: shows only what belongs to the current selection. Nothing
// selected → the design's settings (template sizes, joints, material and fit,
// snapping); an edge selected → the grow card on the stage takes over.
import { useEffect, useState, type ReactElement } from 'react';
import { useStore, useT } from '../store/store';
import { NumField, Segmented, Stepper } from './NumField';
import { canMatch, copyOutlineFrom, leaderOf, matchWall, ownOutline } from '../model/ops';
import { followersOf } from '../model/match';
import { convertToPoints, curveBlocked, deleteDetail, deletePanel, edgeConnection, findDetail, MIN_PANEL, normDeg, panelYaw, parentConnection, pointCurve, setCornerRadius, setPanelSize, setPanelYaw, setPointCurve, setPointRound, setRoundShape, updateDetail } from '../model/ops';
import { pieceKeyOf, pieceRoot, placementPiece } from '../model/pieces';
import { matOf } from '../model/materials';
import { materialName } from './materialName';
import { ovalRadii } from '../model/round';
import { quantityRoot, rotateCopy } from '../model/pack';
import { DesignSettings } from './DesignSettings';
import { edgeHasRoom } from '../model/adapt';
import { ArraySection, MultiSelection, TextFields } from './Selection';
import { ClearSizes, JointsAdvanced, PanelHinge } from './Connections';
import { BendSection } from './BendUI';
import { CutChoice } from './SplitUI';
import { ClosureSection } from './ClosureUI';
import { LidSection } from './LidUI';
import { roundedMin } from '../easy/recipes';
import type { DetailOp } from '../model/types';
import { fmtNum } from '../i18n';
import { edgeLabel, isAutoName, panelLabel } from '../model/names';
import { isCurveKey, panelEdges, segLength, sketchFillets, sketchMaxRadius } from '../model/edges';
import { KEEP_STRAIGHT } from '../geom/fillet';
import { Icon } from './icons';
import { LinesSection } from './LinesUI';
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
import { LazySculptCard } from '../sculpt/ui/lazy';
import { boxOfBase, SizeAsSwitch, statedField } from './BoxSizeUI';
import { outlineWhy } from '../model/outlineWhy';

const OP_ICONS = { add: 'opAdd', cut: 'opCut', engrave: 'opEngrave', score: 'opScore' } as const;

export function Inspector() {
  const t = useT();
  const sel = useStore((s) => s.selection);
  const d = useStore((s) => s.design);
  const quick = useMode() === 'quick';
  // More… shows a card's Workshop version until the selection changes (milestone 37)
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [sel]);
  // a sculpture's card (milestone 120): the shape stage, and stage 2 until boards are selected on it
  const sculptCard = useStore((s) => s.design.kind === 'waffle' && (s.sculpt.stage === 'shape' || !s.design.outcome || s.selection?.kind === 'shape' || !s.selection) && s.view !== '2d' && s.view !== 'solo');
  const view = useStore((s) => s.view);
  if (sculptCard) return view === 'sketch' ? null : <LazySculptCard />;
  if (!quick || !sel || sel.kind === 'edge' || sel.kind === 'shape') return <InspectorBody />;
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
  const netsStored = useStore((s) => s.viewPrefs.planMode === 'nets');
  const netsShown = shown(useFeature('plan.nets'));
  const planNets = netsStored && netsShown;
  const editOutline = useStore((s) => s.editOutline);
  const outlineMode = useStore((s) => !!s.viewPrefs.outlineMode);
  const keepRatio = useStore((s) => !!s.viewPrefs.keepRatio);
  const edgesOpen = useStore((s) => s.viewPrefs.edgesOpen);
  const opsAll = shown(useFeature('op.scoreAdd'));
  // Quick build's words (LIDS_LINES_PROJECTS_PLAN.md §10.7): a footprint is Width · Depth, a box's walls rise to its Height
  const quickWords = useMode() === 'quick';
  const mm = t('unit.mm');
  // milestone 113: also in the cut plan's Nets, where edges are picked in the flat
  if (sel?.kind === 'edge') return view === '3d' || (view === '2d' && planNets) ? <EdgeBar panelId={sel.panelId} edge={sel.edge} /> : null;

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
              {/* with Keep proportions the other size follows (milestone 103; shared with the 2D frame and the 3D gizmo) */}
              <NumField label={t('insp.width')} value={dt.w} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, keepRatio ? { w: v, h: dt.h * (v / dt.w) } : { w: v }))} testId="detail-w" />
              <NumField label={t('insp.height')} value={dt.h} unit={mm} min={0.5} onCommit={(v) => apply((x) => updateDetail(x, dt.id, keepRatio ? { h: v, w: dt.w * (v / dt.h) } : { h: v }))} testId="detail-h" />
              <Gate f="transform.sides">
                <label className="check" title={t('frame.pillHelp')}>
                  <input type="checkbox" checked={keepRatio} onChange={(e) => useStore.getState().setPrefs({ keepRatio: e.target.checked })} data-testid="keep-ratio" />
                  {t('frame.keepRatio')}
                </label>
              </Gate>
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
      const boxTray = boxOfBase(d, id);
      const growable = panelEdges(p).filter((e) => segLength(e) >= MIN_PANEL && !isCurveKey(e.key) && edgeHasRoom(d, id, e.key, MIN_PANEL));
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
          {boxTray && <SizeAsSwitch trayId={boxTray} />}
          {p.divider ? (
            // a divider's length comes from its ends (milestone 44)
            <NumField label={t('insp.width')} value={p.w} unit={mm} min={5} disabled onCommit={() => undefined} testId="panel-w" />
          ) : (
            (() => {
              // a box's base shows its sizes as the design states them (milestone 93)
              const f = boxTray ? statedField(d, boxTray, 'w') : null;
              return f ? (
                <NumField label={t(f.label ?? 'insp.width')} value={f.value} unit={mm} min={5} onCommit={(v) => apply((x) => f.commit(x, v))} testId="panel-w" />
              ) : (
                <NumField label={t('insp.width')} value={p.w} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, v, undefined))} testId="panel-w" />
              );
            })()
          )}
          {parent && <p className="note">{t('insp.widthOwned', { panel: panelLabel(d, parent.id, t) })}</p>}
          {(() => {
            const f = boxTray ? statedField(d, boxTray, 'd') : null;
            const lbl = quickWords && !parent && !p.divider && p.place?.pose !== 'standing' ? 'insp.depth' : 'insp.height';
            return f ? (
              <NumField label={t(f.label ?? lbl)} value={f.value} unit={mm} min={5} onCommit={(v) => apply((x) => f.commit(x, v))} testId="panel-h" />
            ) : (
              <NumField label={t(lbl)} value={p.h} unit={mm} min={5} onCommit={(v) => apply((x) => setPanelSize(x, id, undefined, v))} testId="panel-h" />
            );
          })()}
          <RoundSection panelId={id} />
          {p.divider && <DividerSection panelId={id} />}
          {!parent && !p.divider && (
            <NumField label={t('insp.rotation')} value={panelYaw(p)} unit={t('unit.deg')} min={-360} max={360} onCommit={(v) => apply((x) => setPanelYaw(x, id, v))} testId="panel-yaw" />
          )}
          <Gate f="hinge">
            <PanelHinge panelId={id} />
            {pc?.kind === 'fold' && <BendSection c={pc} />}
            {pc && <CutChoice c={pc} />}
          </Gate>
          {/* how a lid closes its box is on the lid's card in Quick build too (PACKAGING_PLAN.md decision 8); it was behind More… */}
          <ClosureSection panelId={id} />
          <TrayWallNote panelId={id} />
          <Gate f="match">
            <MatchSection panelId={id} />
          </Gate>
          <Gate f="foldover">
            <FoldOverSection panelId={id} />
          </Gate>
          {/* one rule for which outlines can be edited (milestone 101), shared with outline mode */}
          {!outlineWhy(d, id) && view === '3d' && (
            <button
              className={editOutline === id ? 'on' : ''}
              aria-pressed={editOutline === id}
              disabled={outlineMode}
              onClick={() => useStore.getState().set({ editOutline: editOutline === id ? null : id, selVertex: null })}
              data-testid="edit-outline"
            >
              <Icon name="polygon" size={16} /> {t(outlineMode ? 'outline.inMode' : editOutline === id ? 'outline.done' : 'outline.edit')}
            </button>
          )}
          {editOutline === id && (
            <Gate f="curves">
              <PointCurve panelId={id} />
            </Gate>
          )}
          <Stepper
            label={t('insp.quantity')}
            value={d.pieces[quantityRoot(d, pieceKeyOf(d, id))]?.quantity ?? 1}
            min={1}
            max={500}
            slider={false}
            onCommit={(v) => apply((x) => void (x.pieces[quantityRoot(x, pieceKeyOf(x, id))] = { quantity: Math.round(v) }))}
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
          <LidSection panelId={id} />
          <LinesSection panelId={id} />
          <InsideSection panelId={id} />
          <SheetPlacementControls panelId={id} />
          <ClearSizes panelId={id} />
          <Gate f="joints">
            <JointsAdvanced panelId={id} />
          </Gate>
          {/* only the edges a board can still grow from: a row of greyed buttons for the walled ones was noise */}
          {growable.length > 0 && (
            <div className="subsection" data-testid="edges-section">
              {/* milestone 78: closed by default, with its count (remembered per browser) */}
              <button className="sub-toggle" aria-expanded={!!edgesOpen} onClick={() => useStore.getState().setPrefs({ edgesOpen: !edgesOpen })} data-testid="edges-toggle">
                <Icon name={edgesOpen ? 'chevDown' : 'chevRight'} size={14} /> {t('insp.edges')} <span className="count">{growable.length}</span>
              </button>
              {edgesOpen && <div className="edge-buttons">
                {growable.map(({ key: e }) => (
                  <button
                    key={e}
                    onClick={() => {
                      useStore.getState().select({ kind: 'edge', panelId: id, edge: e });
                      useStore.getState().setView('3d');
                    }}
                    data-testid={`grow-from-${e.replace(/^e(\d+)$/, '$1')}`}
                  >
                    {t('insp.growFrom', { edge: edgeLabel(d, id, e, t) })}
                  </button>
                ))}
              </div>}
            </div>
          )}
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
  // a base's point may also be a rounded corner (milestone 62)
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
      {kind === 'round' && typeof sel === 'number' && p.sketch.kind === 'poly' && !p.sketch.round && (vertex?.r ?? 0) > sketchMaxRadius(p.sketch, sel) + 1e-6 && (
        <p className="note" data-testid="point-radius-max">
          {t('round.largest', { r: Math.floor(sketchMaxRadius(p.sketch, sel) * 10) / 10, keep: KEEP_STRAIGHT })}
        </p>
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
    <div className="subsection" data-testid="sheet-placement">
      {d.placements[key]?.manual && <p className="note">{t('pack.manual')}</p>}
      <button disabled={blocked} onClick={() => useStore.getState().apply((x) => void rotateCopy(x, key))} data-testid="rotate-copy">
        {t('pack.rotate')}
      </button>
      {blocked && <p className="note">{t('pack.rotateBlocked')}</p>}
    </div>
  );
}

/**
 * A round base's card section (milestone 62): its shape, an oval's end radius
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
  // the tightest corner its walls bend round, at their height (milestone 64): the bend patterns' reach plus the wall's thickness
  const tray = Object.values(d.trays ?? {}).find((x) => x.baseId === panelId);
  const lim = roundedMin(m, tray?.height ?? 40);
  // its tightest bend: the smallest radius as built (an oval's ends, a clamped corner)
  const built = sketchFillets(s);
  const tight = Math.min(...built.filter((f): f is NonNullable<typeof f> => !!f).map((f) => f.r));
  // corners made smaller than asked so each wall keeps its straight edge (milestone 62)
  const clamped = !s.round && s.pts.some((q, i) => q.curve === 'round' && built[i] && built[i]!.r < (q.r ?? 0) - 1e-6);
  const clampNote = clamped && (
    <p className="note" data-testid="round-clamped">
      {t('round.clamped', { r: Math.round(Math.min(...built.filter((f): f is NonNullable<typeof f> => !!f).map((f) => f.r)) * 10) / 10, keep: KEEP_STRAIGHT })}
    </p>
  );
  const tightNote = Number.isFinite(tight) && tight < lim - 1e-6 && (
    <p className="note warn" data-testid="round-tight">
      {t('round.tight', { mat: materialName(t, m), min: Math.round(lim * 10) / 10 })}
    </p>
  );
  if (!s.round)
    return (
      <div className="subsection round" data-testid="round-section">
        <NumField label={t('round.corner')} value={rounded[0].r ?? 0} unit={mm} min={0.5} onCommit={(v) => apply((x) => void setCornerRadius(x, panelId, v))} testId="round-corner-all" />
        {clampNote}
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

/**
 * Matched walls (milestone 46, CURVED_WALLS.md §7.2): a wall's top outline can
 * follow a parallel wall facing it (a stored link; *Own outline* drops it),
 * or be copied once from any wall.
 */
function MatchSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = d.panels[panelId];
  if (!p || p.sketch.kind !== 'wall' || !parentConnection(d, panelId)) return null;
  const leader = leaderOf(d, panelId);
  const follow = followersOf(d, panelId);
  const walls = d.order.filter((x) => x !== panelId && d.panels[x]?.sketch.kind === 'wall' && parentConnection(d, x));
  const cands = walls.filter((x) => canMatch(d, panelId, x));
  return (
    <div className="subsection match" data-testid="match-section">
      {leader ? (
        <>
          <p className="note" data-testid="match-follows">{t('match.follows', { wall: panelLabel(d, leader, t) })}</p>
          <button onClick={() => apply((x) => void ownOutline(x, panelId))} title={t('match.ownNote')} data-testid="match-own">
            {t('match.own')}
          </button>
        </>
      ) : (
        <>
          {follow.length > 0 && <p className="note" data-testid="match-leads">{t('match.leads', { n: follow.length })}</p>}
          {cands.length > 0 && !follow.length && (
            <div className="field">
              <label htmlFor={`match-${panelId}`}>{t('match.with')}</label>
              <select id={`match-${panelId}`} value="" onChange={(e) => e.target.value && apply((x) => void matchWall(x, panelId, e.target.value))} data-testid="match-with">
                <option value="">{t('match.choose')}</option>
                {cands.map((x) => (
                  <option key={x} value={x}>
                    {panelLabel(d, x, t)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {walls.length > 0 && (
            <div className="field">
              <label htmlFor={`copy-${panelId}`}>{t('match.copy')}</label>
              <select id={`copy-${panelId}`} value="" onChange={(e) => e.target.value && apply((x) => void copyOutlineFrom(x, panelId, e.target.value))} data-testid="match-copy">
                <option value="">{t('match.choose')}</option>
                {walls.map((x) => (
                  <option key={x} value={x}>
                    {panelLabel(d, x, t)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  );
}
