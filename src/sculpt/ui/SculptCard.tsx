// The waffle design's card (WAFFLE_MODE.md §5): the Shapes tool's tiles, the
// selected shape's numbers, several shapes, or the sculpture as a whole.
import { useEffect, useState } from 'react';
import { selectedShapeIds, useStore, useT } from '../../store/store';
import type { Design, Shape3, V3 } from '../../model/types';
import { NumField, Segmented, Stepper } from '../../ui/NumField';
import { Icon } from '../../ui/icons';
import { clampSides } from '../build';
import { onKernel } from '../kernel';
import { PRIMITIVES, moveShapes, resetTurn, setHole, shapeNumber, updateShape, worldPose, type Primitive } from '../ops';
import { shapeColor } from './geom';
import { shapeTile } from './tiles';
import { canGroup, canUngroup, deleteSelected, duplicateSelected, groupSelected, ungroupSelected } from './commands';
import { RadiusToolCard, SketchShapeFields, SketchToolCard } from './SketchCard';
import { WaffleCard } from '../../waffle/ui/WaffleCard';

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
      <div className="shape-tiles" role="radiogroup" aria-label={t('sculpt.shapesCard')}>
        {PRIMITIVES.map((k, i) => {
          const src = shapeTile(k, nextHole ? '#9aa3ad' : shapeColor(i));
          return (
            <button key={k} role="radio" aria-checked={next === k} className={`shape-tile ${next === k ? 'on' : ''}`} title={t('sculpt.tile', { kind: t(`sculpt.kind.${k}`) })} onClick={() => st().setSculpt({ next: k })} data-testid={`shape-tile-${k}`}>
              {src ? <img src={src} alt="" /> : <Icon name="box" />}
              <span>{t(`sculpt.kind.${k}`)}</span>
            </button>
          );
        })}
      </div>
      <p className="step-label">{t('sculpt.nextAs')}</p>
      <SolidHole hole={nextHole} onChange={(h) => st().setSculpt({ nextHole: h })} testId="next" />
    </section>
  );
}

function SizeFields({ s, t }: { s: Shape3; t: T }) {
  const mm = t('unit.mm');
  if (!s.size) return null;
  const [W, H, D] = s.size;
  const setSize = (i: 0 | 1 | 2, v: number) =>
    edit((d) => {
      const x = d.sculpt!.shapes[s.id];
      const size = [...x.size!] as V3;
      size[i] = Math.max(1, v);
      updateShape(d, s.id, { size });
    });
  return (
    <div className="field-grid">
      <NumField label={t('sculpt.width')} value={W} unit={mm} min={1} onCommit={(v) => setSize(0, v)} testId="shape-w" />
      <NumField label={t('sculpt.depth')} value={D} unit={mm} min={1} onCommit={(v) => setSize(2, v)} testId="shape-d" />
      {s.kind === 'torus' ? (
        <NumField label={t('sculpt.tube')} value={H} unit={mm} min={1} onCommit={(v) => setSize(1, v)} testId="shape-tube" />
      ) : (
        <NumField label={t('sculpt.height')} value={H} unit={mm} min={1} onCommit={(v) => setSize(1, v)} testId="shape-h" />
      )}
    </div>
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
      <SizeFields s={s} t={t} />
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
      <button className="primary" disabled={!n} onClick={() => st().setSculpt({ stage: 'waffle' })} data-testid="to-waffle">
        {t('sculpt.toWaffle')}
      </button>
    </section>
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
  if (stage === 'waffle') body = <WaffleCard />;
  else if (tool === 'shapes' && !ghost) body = <ShapesToolCard />;
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
