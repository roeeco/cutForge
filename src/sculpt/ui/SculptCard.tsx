// The waffle design's card (WAFFLE_MODE.md §5): the Shapes tool's tiles, the
// selected shape's numbers, several shapes, or the sculpture as a whole.
import { useEffect, useState } from 'react';
import { selectedShapeIds, useStore, useT } from '../../store/store';
import type { Design, Shape3, V3 } from '../../model/types';
import { NumField, Segmented, Stepper } from '../../ui/NumField';
import { Icon } from '../../ui/icons';
import { clampSides } from '../build';
import { onKernel } from '../kernel';
import { PRIMITIVES, freeSpot, moveShapes, resetTurn, setHole, shapeNumber, updateShape, worldPose, type Primitive } from '../ops';
import { canStretch } from '../scale';
import { scaleSelection, selectionFrame } from './ScaleFrame';
import { placePrimitive } from './SculptView3D';
import { shapeColor } from './geom';
import { shapeTile } from './tiles';
import { canGroup, canUngroup, deleteSelected, duplicateSelected, groupSelected, ungroupSelected } from './commands';
import { RadiusToolCard, SketchShapeFields, SketchToolCard, stageCamera } from './SketchCard';
import { outcomeIds, outcomeOf, outcomeUi } from '../outcomes';
import type { MsgKey } from '../../i18n';

type T = ReturnType<typeof useT>;
const st = () => useStore.getState();
const edit = (fn: (d: Design) => void) => st().apply((d) => fn(d as Design));

/** "Box 2", "Group 1": a shape's name for the student. */
export function shapeLabel(d: Design, id: string, t: T): string {
  const s = d.sculpt?.shapes[id];
  if (!s) return '';
  if (s.name) return s.name;
  return t('sculpt.named', { kind: t(`sculpt.kind.${s.kind}` as 'sculpt.kind.box'), n: shapeNumber(d.sculpt!, id) });
}

function SolidHole({ hole, onChange, testId }: { hole: boolean; onChange: (h: boolean) => void; testId: string }) {
  const t = useT();
  return (
    <Segmented
      label={t('sculpt.tool.hole')}
      value={hole ? 'hole' : 'solid'}
      options={[
        { value: 'solid', label: t('sculpt.solid'), title: t('sculpt.solidHelp'), testId: `${testId}-solid` },
        { value: 'hole', label: <><Icon name="hole" size={14} /> {t('sculpt.hole')}</>, title: t('sculpt.holeHelp'), testId: `${testId}-hole` },
      ]}
      onChange={(v) => onChange(v === 'hole')}
    />
  );
}

/** A tile clicked: its shape is placed near the middle of the view, on a free spot. */
function clickTile(k: Primitive) {
  const s = st();
  s.setSculpt({ next: k });
  const sc = s.design.sculpt ?? { shapes: {}, order: [] };
  const [tx, , tz] = stageCamera.target;
  const spot = freeSpot(sc, 40, 40, { x: tx, z: tz }, s.viewPrefs.gridStep > 0 ? s.viewPrefs.gridStep : 1);
  placePrimitive(k, [spot.x, 0, spot.z]);
}
/** Pointer down on a tile: up within 4 px is a click; further is a drag onto the stage. */
function tileDown(e: React.PointerEvent, k: Primitive) {
  if (e.button !== 0) return;
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY;
  st().setSculpt({ next: k });
  const done = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  const move = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= 4) return;
    done();
    st().setSculpt({ dragKind: k });
  };
  const up = () => {
    done();
    clickTile(k);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function ShapesToolCard() {
  const t = useT();
  const next = useStore((s) => s.sculpt.next);
  const nextHole = useStore((s) => s.sculpt.nextHole);
  const [, bump] = useState(0);
  useEffect(() => onKernel(() => bump((n) => n + 1)), []);
  return (
    <section data-testid="shapes-card">
      <div className="card-head">
        <h3>{t('sculpt.shapesCard')}</h3>
      </div>
      <div className="shape-tiles" role="group" aria-label={t('sculpt.shapesCard')}>
        {PRIMITIVES.map((k, i) => {
          const src = shapeTile(k, nextHole ? '#9aa3ad' : shapeColor(i));
          return (
            <button key={k} type="button" aria-pressed={next === k} className={`shape-tile ${next === k ? 'on' : ''}`} title={t('sculpt.tile', { kind: t(`sculpt.kind.${k}`) })} onPointerDown={(e) => tileDown(e, k)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), clickTile(k))} data-testid={`shape-tile-${k}`}>
              {src ? <img src={src} alt="" draggable={false} /> : <Icon name="box" />}
              <span>{t(`sculpt.kind.${k}`)}</span>
            </button>
          );
        })}
      </div>
      <p className="note">{t('sculpt.tile.hint')}</p>
      <p className="step-label">{t('sculpt.nextAs')}</p>
      <SolidHole hole={nextHole} onChange={(h) => st().setSculpt({ nextHole: h })} testId="next" />
    </section>
  );
}

/** Keep proportions: the switch shared by the scale frame, these fields and the sketch's frame. */
function KeepRatio() {
  const t = useT();
  const on = useStore((s) => !!s.viewPrefs.keepRatio);
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={(e) => st().setPrefs({ keepRatio: e.target.checked })} data-testid="keep-ratio" /> {t('scale.keepRatio')}
    </label>
  );
}

/** Width, depth and height of one shape (its own box) or several (their box), typed through the scale frame's maths. */
function ScaleFields({ ids, torus }: { ids: string[]; torus?: boolean }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const keep = useStore((s) => !!s.viewPrefs.keepRatio);
  const fr = selectionFrame(d, ids);
  if (!fr) return null;
  const b = fr.box;
  const L = (i: number) => Math.round((b.max[i] - b.min[i]) * 100) / 100;
  const stretchable = !!fr.one || canStretch(d.sculpt!, ids);
  const set = (i: number, v: number) => {
    const old = b.max[i] - b.min[i];
    if (!(old > 0)) return;
    const k = Math.max(1, v) / old;
    const f: V3 = keep || !stretchable ? [k, k, k] : i === 0 ? [k, 1, 1] : i === 1 ? [1, k, 1] : [1, 1, k];
    edit((x) => void scaleSelection(x, fr, ids, f, [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2]));
  };
  const mm = t('unit.mm');
  return (
    <>
      <div className="field-grid">
        <NumField label={t('sculpt.width')} value={L(0)} unit={mm} min={1} onCommit={(v) => set(0, v)} testId="shape-w" />
        <NumField label={t('sculpt.depth')} value={L(2)} unit={mm} min={1} onCommit={(v) => set(2, v)} testId="shape-d" />
        <NumField label={t(torus ? 'sculpt.tube' : 'sculpt.height')} value={L(1)} unit={mm} min={1} onCommit={(v) => set(1, v)} testId={torus ? 'shape-tube' : 'shape-h'} />
      </div>
      <KeepRatio />
      {!stretchable && <p className="note">{t('scale.groupFirst')}</p>}
    </>
  );
}

function CornerFields({ s, t }: { s: Shape3; t: T }) {
  const n = s.kind === 'box' ? 4 : clampSides(s.n);
  const radii = Array.from({ length: n }, (_, i) => s.corners?.[i] ?? 0);
  const set = (i: number, v: number) =>
    edit((d) => {
      const r = Array.from({ length: n }, (_, j) => d.sculpt!.shapes[s.id].corners?.[j] ?? 0);
      r[i] = Math.max(0, v);
      updateShape(d, s.id, { corners: r });
    });
  return (
    <details className="subsection" open={radii.some((r) => r > 0)}>
      <summary>{t('sculpt.corners')}</summary>
      <div className="field-grid">
        {radii.map((r, i) => (
          <NumField key={i} label={t('sculpt.corner', { n: i + 1 })} value={r} unit={t('unit.mm')} min={0} onCommit={(v) => set(i, v)} testId={`shape-corner-${i}`} />
        ))}
      </div>
      <button onClick={() => edit((d) => updateShape(d, s.id, { corners: radii.map(() => st().sculptRadius ?? 5) }))} data-testid="shape-round-all">
        {t('sculpt.roundAll')}
      </button>
    </details>
  );
}

function ShapeCard({ id }: { id: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const s = d.sculpt!.shapes[id];
  if (!s) return null;
  const pose = worldPose(d.sculpt!, id);
  const turned = Math.abs(s.q[0]) + Math.abs(s.q[1]) + Math.abs(s.q[2]) > 1e-9;
  return (
    <section data-testid="shape-card">
      <p className="kicker">{t('sculpt.card.title')}</p>
      <div className="card-head">
        <h3 dir="auto">{shapeLabel(d, id, t)}</h3>
        <button className="ghost icon-btn" onClick={duplicateSelected} aria-label={t('sculpt.duplicate')} title={t('sculpt.duplicate')} data-testid="shape-duplicate">
          <Icon name="copy" />
        </button>
        <button className="ghost icon-btn danger" onClick={deleteSelected} aria-label={t('insp.delete')} title={t('insp.delete')} data-testid="shape-delete">
          <Icon name="trash" />
        </button>
      </div>
      <SolidHole hole={!!s.hole} onChange={(h) => edit((x) => setHole(x, [id], h))} testId="shape" />
      <ScaleFields ids={[id]} torus={s.kind === 'torus'} />
      {(s.kind === 'prism' || s.kind === 'pyramid') && <Stepper label={t('sculpt.sides')} value={clampSides(s.n)} min={3} max={12} onCommit={(v) => edit((x) => updateShape(x, id, { n: v }))} testId="shape-sides" />}
      {(s.kind === 'cone' || s.kind === 'pyramid') && <NumField label={t('sculpt.top')} value={Math.round((s.top ?? 0) * 100)} unit="%" min={0} max={100} decimals={0} onCommit={(v) => edit((x) => updateShape(x, id, { top: Math.max(0, Math.min(1, v / 100)) }))} testId="shape-top" />}
      {(s.kind === 'box' || s.kind === 'prism') && <CornerFields s={s} t={t} />}
      <SketchShapeFields s={s} />
      {s.kind === 'group' && (
        <div className="subsection">
          <p className="note">{t('sculpt.members', { n: s.children?.length ?? 0 })}</p>
          <div className="row-buttons">
            <button onClick={() => (st().setSculpt({ focus: id }), st().select(null))} data-testid="group-enter">
              {t('sculpt.enterGroup')}
            </button>
            <button onClick={ungroupSelected} data-testid="group-ungroup">
              <Icon name="ungroup" /> {t('sculpt.ungroupBtn')}
            </button>
          </div>
        </div>
      )}
      <NumField label={t('sculpt.lift')} value={Math.round(pose.at[1] * 10) / 10} unit={t('unit.mm')} onCommit={(v) => edit((x) => moveShapes(x, [id], [0, v - pose.at[1], 0]))} testId="shape-lift-field" />
      {turned && (
        <button onClick={() => edit((x) => resetTurn(x, [id]))} data-testid="shape-reset-turn">
          {t('sculpt.resetTurn')}
        </button>
      )}
    </section>
  );
}

function MultiCard({ ids }: { ids: string[] }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const holes = ids.every((id) => d.sculpt?.shapes[id]?.hole);
  return (
    <section data-testid="shapes-multi">
      <div className="card-head">
        <h3>{t('sculpt.selected', { n: ids.length })}</h3>
        <button className="ghost icon-btn" onClick={duplicateSelected} aria-label={t('sculpt.duplicate')} title={t('sculpt.duplicate')}>
          <Icon name="copy" />
        </button>
        <button className="ghost icon-btn danger" onClick={deleteSelected} aria-label={t('insp.delete')} title={t('insp.delete')}>
          <Icon name="trash" />
        </button>
      </div>
      <SolidHole hole={holes} onChange={(h) => edit((x) => setHole(x, ids, h))} testId="multi" />
      <ScaleFields ids={ids} />
      {canGroup(d, ids) && (
        <button className="primary" onClick={groupSelected} data-testid="multi-group">
          <Icon name="group" /> {t('sculpt.groupBtn')}
        </button>
      )}
    </section>
  );
}

function Overview() {
  const t = useT();
  const n = useStore((s) => s.design.sculpt?.order.length ?? 0);
  return (
    <section data-testid="sculpt-overview">
      <div className="card-head">
        <h3>{t('sculpt.card.title')}</h3>
      </div>
      <p className="note">{t('sculpt.card.help')}</p>
      {n > 0 && <p className="note">{t('sculpt.members', { n })}</p>}
      <button className="primary" disabled={!n} onClick={() => st().setSculpt({ stage: 'make' })} data-testid="to-waffle">
        {t('sculpt.toWaffle')}
      </button>
    </section>
  );
}

/** Stage 2's card: the design's outcome's own card, with a chooser once there are two outcomes. */
function OutcomeCard() {
  const t = useT();
  const id = useStore((s) => outcomeOf(s.design));
  const ids = outcomeIds();
  const C = outcomeUi(id)?.Card;
  return (
    <>
      {ids.length > 1 && (
        <Segmented
          label={t('outcome.choose')}
          value={id}
          options={ids.map((o) => ({ value: o, label: t((outcomeUi(o)?.nameKey ?? 'stage.waffle') as MsgKey), testId: `outcome-${o}` }))}
          onChange={(v) => edit((d) => void (d.outcome = v as 'waffle' | 'fold'))}
        />
      )}
      {C ? <C /> : null}
    </>
  );
}

export function SculptCard() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const stage = useStore((s) => s.sculpt.stage);
  const sel = useStore((s) => s.selection);
  const ghost = useStore((s) => s.pending?.kind === 'sculpt');
  const ids = selectedShapeIds(sel);
  let body: React.ReactElement | null;
  if (stage === 'make') body = <OutcomeCard />;
  else if (ghost && ids.length === 1) body = <ShapeCard id={ids[0]} />;
  else if (tool === 'shapes') body = <ShapesToolCard />;
  else if (tool === 'sketch') body = <SketchToolCard />;
  else if (tool === 'radius') body = <RadiusToolCard />;
  else if (ids.length === 1) body = <ShapeCard id={ids[0]} />;
  else if (ids.length > 1) body = <MultiCard ids={ids} />;
  else body = <Overview />;
  if (!body) return null;
  return (
    <div className="card-dock">
      <aside className="card inspector" aria-label={t('insp.title')} data-testid="sculpt-card">
        {body}
      </aside>
    </div>
  );
}
