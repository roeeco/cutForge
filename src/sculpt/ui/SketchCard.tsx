// Cards for the sketch and radius tools, and an extrusion's or revolve's fields (WAFFLE_MODE.md §5.5–5.6).
import { useStore, useT } from '../../store/store';
import type { Design, Shape3 } from '../../model/types';
import { NumField, Segmented, Stepper } from '../../ui/NumField';
import { Icon } from '../../ui/icons';
import { deleteSketchPoint, facingPlane, revolveBlocked, setSketchMode, setSketchPointKind } from '../sketch';
import { selectedShapeIds } from '../../store/store';
import { worldBox, unionBox } from './geom';
import { startHeight } from '../ops';

const st = () => useStore.getState();
const edit = (fn: (d: Design) => void) => st().apply((d) => fn(d as Design));

/** The camera's position and the point it orbits, registered by the stage (an upright plane faces the viewer; a clicked tile's shape lands near the target). */
export const stageCamera: { pos: [number, number, number]; target: [number, number, number] } = { pos: [0, 260, 330], target: [0, 0, 0] };

export function SketchToolCard() {
  const t = useT();
  const plane = useStore((s) => s.sculpt.plane);
  const choose = (k: 'floor' | 'upright') => {
    if (k === 'floor') return st().setSculpt({ plane: { kind: 'floor' } });
    // through the selection's centre, or the origin; facing the nearest 30° step towards the viewer
    const s = st();
    const sc = s.design.sculpt;
    const b = sc ? unionBox(selectedShapeIds(s.selection).map((id) => worldBox(sc, id))) : null;
    const at: [number, number, number] = b ? [(b.min[0] + b.max[0]) / 2, 0, (b.min[2] + b.max[2]) / 2] : [0, 0, 0];
    s.setSculpt({ plane: facingPlane(at, stageCamera.pos) });
  };
  return (
    <section data-testid="sketch-card">
      <div className="card-head">
        <h3>{t('sculpt.tool.sketch')}</h3>
      </div>
      <Segmented
        label={t('sketch.plane')}
        value={plane.kind}
        options={[
          { value: 'floor', label: t('sketch.floor'), testId: 'plane-floor' },
          { value: 'upright', label: t('sketch.upright'), testId: 'plane-upright' },
        ]}
        onChange={(v) => choose(v as 'floor' | 'upright')}
      />
      {plane.kind === 'upright' && (
        <>
          <p className="note">{t('sketch.uprightHelp')}</p>
          <div className="row-buttons">
            <button onClick={() => st().setSculpt({ plane: { ...plane, ang: (plane.ang + 330) % 360 } })} data-testid="plane-turn-left">
              {t('sketch.turn', { deg: -30 })}
            </button>
            <button onClick={() => st().setSculpt({ plane: { ...plane, ang: (plane.ang + 30) % 360 } })} data-testid="plane-turn-right">
              {t('sketch.turn', { deg: 30 })}
            </button>
          </div>
        </>
      )}
      <p className="note">{t('sketch.hint.draw')}</p>
    </section>
  );
}

export function RadiusToolCard() {
  const t = useT();
  const r = useStore((s) => s.sculptRadius);
  return (
    <section data-testid="radius-card">
      <div className="card-head">
        <h3>{t('sculpt.tool.radius')}</h3>
      </div>
      <NumField label={t('radius.value')} value={r} unit={t('unit.mm')} min={0} onCommit={(v) => useStore.setState({ sculptRadius: Math.max(0, v) })} testId="radius-value" />
      <button className={r === 0 ? 'on' : ''} onClick={() => useStore.setState({ sculptRadius: 0 })} data-testid="radius-sharp">
        {t('radius.sharp')}
      </button>
      <p className="note">{t('radius.hint')}</p>
    </section>
  );
}

/** Extrude | Revolve for a sketch shape (on its card and on the ghost's bar). */
export function SketchMode({ s }: { s: Shape3 }) {
  const t = useT();
  if (!s.sketch) return null;
  return (
    <Segmented
      label={t('sketch.mode')}
      value={s.kind}
      options={[
        { value: 'extrude', label: t('sketch.extrude'), testId: 'mode-extrude' },
        { value: 'revolve', label: t('sketch.revolve'), testId: 'mode-revolve' },
      ]}
      onChange={(v) => edit((d) => setSketchMode(d, s.id, v as 'extrude' | 'revolve', startHeight('extrude', st().sculpt.heights)))}
    />
  );
}

/** The point picked in Edit sketch: Corner, Curve or Round with its radius, or removed. */
function PointFields({ s, pt }: { s: Shape3; pt: string }) {
  const t = useT();
  const p = s.sketch?.pts[pt];
  if (!p) return null;
  const kind = p.r ? 'round' : p.smooth ? 'curve' : 'corner';
  const n = Object.keys(s.sketch!.pts).indexOf(pt) + 1;
  return (
    <div className="subsection" data-testid="sketch-point-card">
      <p className="kicker">{t('sketch.point', { n })}</p>
      <Segmented
        value={kind}
        options={[
          { value: 'corner', label: t('outline.corner'), testId: 'point-corner' },
          { value: 'curve', label: <><Icon name="curve" size={14} /> {t('outline.curve')}</>, testId: 'point-curve' },
          { value: 'round', label: t('sketch.round'), testId: 'point-round' },
        ]}
        onChange={(v) => edit((d) => void setSketchPointKind(d, s.id, pt, v as 'corner' | 'curve' | 'round', st().sculptRadius || 5))}
      />
      {p.r ? <NumField label={t('radius.value')} value={p.r} unit={t('unit.mm')} min={0} onCommit={(v) => edit((d) => void setSketchPointKind(d, s.id, pt, v > 0 ? 'round' : 'corner', v))} testId="point-radius" /> : null}
      <button className="danger" onClick={() => (edit((d) => void deleteSketchPoint(d, s.id, pt)), st().setSculpt({ selPoint: null }))} data-testid="point-delete">
        <Icon name="trash" /> {t('sketch.deletePoint')}
      </button>
    </div>
  );
}

export function SketchShapeFields({ s }: { s: Shape3 }) {
  const t = useT();
  const editing = useStore((x) => x.sculpt.editSketch === s.id);
  const selPoint = useStore((x) => x.sculpt.selPoint);
  if (s.kind !== 'extrude' && s.kind !== 'revolve') return null;
  const blocked = revolveBlocked(s);
  return (
    <div className="subsection">
      <SketchMode s={s} />
      {s.kind === 'extrude' && <NumField label={t('sculpt.height')} value={s.height ?? 20} unit={t('unit.mm')} onCommit={(v) => edit((d) => void (d.sculpt!.shapes[s.id].height = Math.abs(v) < 1 ? 1 : v))} testId="extrude-height-field" />}
      {s.kind === 'revolve' && (
        <>
          <Stepper label={t('sketch.angle')} value={s.angle ?? 360} min={30} max={360} step={30} onCommit={(v) => edit((d) => void (d.sculpt!.shapes[s.id].angle = Math.max(30, Math.min(360, Math.round(v / 30) * 30))))} testId="revolve-angle" />
          <p className="note" data-testid="revolve-axis">
            {s.axis?.kind === 'seg' ? t('sketch.axisEdge', { n: s.sketch!.order.indexOf(s.axis.id) + 1 }) : t('sketch.axisPlane')}
          </p>
          {s.axis?.kind === 'seg' && (
            <button className="link" onClick={() => edit((d) => void (d.sculpt!.shapes[s.id].axis = { kind: 'plane' }))} data-testid="axis-plane">
              {t('sketch.usePlaneAxis')}
            </button>
          )}
          {blocked && (
            <p className="note warn" data-testid="revolve-blocked">
              {t('sketch.crossesAxis')}
            </p>
          )}
        </>
      )}
      <button className={editing ? 'on' : ''} onClick={() => st().setSculpt({ editSketch: editing ? null : s.id, selPoint: null })} data-testid="edit-sketch">
        {t(editing ? 'sketch.done' : 'sketch.edit')}
      </button>
      {editing && selPoint !== null && <PointFields s={s} pt={selPoint} />}
    </div>
  );
}
