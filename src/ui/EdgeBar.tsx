// Grow card: shown while an edge is selected (the inspector card steps
// aside). The hinge angle (0–360°) is also on the stage as a ring with a
// handle at the hinge; height also has a push-pull arrow there.
import { designKind } from '../model/jointDefaults';
import { growKind, useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { addSideWalls, growPanel } from '../model/ops';
import { edgeHasRoom } from '../model/adapt';
import { effectiveGrow } from '../views/ghost';
import { edgeLength } from '../model/frame';
import { connectionsFor } from '../model/materials';
import { checkHinge, fromHinge } from '../model/hinge';
import type { ConnectionKind } from '../model/types';
import { AngleDial, hingeText } from './AngleDial';
import { Icon } from './icons';
import { edgeLabel, panelLabel } from '../model/names';
import { shown, useFeature } from '../easy/features';
import { closeChoice, closeChoices } from '../easy/lid';
import { PictureChoice, type PicName } from './Pictures';
import type { CloseAs } from '../store/store';
import type { MsgKey } from '../i18n';
import { addEdgeFlap, setEdgeFlap } from '../model/ops';
import { matOf as matOfEB, tOf as tOfEB } from '../model/materials';
import { edgeFeatureKind, flapSpec } from '../model/edgeFeatures';
import type { FlapShape } from '../model/types';

export function EdgeBar({ panelId, edge }: { panelId: string; edge: string }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const grow = useStore((s) => s.grow);
  const setGrow = useStore((s) => s.setGrow);
  const panel = design.panels[panelId];
  // Quick build (milestone 37): only the height; the app grows at 90° on the whole edge
  const advanced = shown(useFeature('grow.advanced'));
  const more = useStore((s) => s.viewPrefs.growMore);
  if (!panel) return null;
  const check = checkHinge(design, panelId, edge, grow.angle, grow.height);
  const options = check.kinds;
  const effKind = growKind(design, grow, panelId);
  const used = !edgeHasRoom(design, panelId, edge);
  const eg = effectiveGrow(design, panelId, edge, grow);
  const L = edgeLength(panel, edge);
  const span = eg.span ?? [0, L];
  const { angle, dir } = fromHinge(grow.angle);
  const closes = advanced ? closeChoices(design, panelId, edge, eg.ghost ?? null, grow.kind) : null;
  const closeAs = closes ? closeChoice(closes, grow.closeAs) : null;
  return (
    <div className="card-dock">
      <div className="card inspector grow-card-inner" role="toolbar" aria-label={t('edge.grow')} data-testid="edgebar">
        <p className="kicker">{t('edge.kicker')}</p>
        <div className="card-head">
          <h3 dir="auto">{t('edge.title', { edge: edgeLabel(design, panelId, edge, t), panel: panelLabel(design, panelId, t) })}</h3>
          <button className="ghost icon-btn" onClick={() => useStore.getState().select({ kind: 'panel', id: panelId })} aria-label={t('sub.close')} title={t('sub.close')}>
            <Icon name="close" />
          </button>
        </div>
        {used ? (
          <p className="note">{t('edge.used')}</p>
        ) : (
          <>
            <NumField label={t('edge.height')} value={grow.height} unit={t('unit.mm')} min={5} max={2000} onCommit={(v) => setGrow({ height: v })} testId="grow-height" />
            {advanced && closes && (
              // the ghost would close the box (milestone 77): what ✓ makes, chosen before it, as pictures
              <div className="subsection" data-testid="grow-closes" data-close={closeAs}>
                <PictureChoice
                  label={t('grow.closesBox')}
                  value={closeAs}
                  options={closes.options.map((o) => ({ value: o, label: t(closeLabel(o)), pic: closePic(o), testId: `grow-close-${o.replace('style:', '')}`, why: closes.why[o] ? t(closes.why[o]!) : undefined }))}
                  onChange={(v) => setGrow({ closeAs: v })}
                  testId="grow-close"
                />
              </div>
            )}
            {advanced && (
              // milestone 78: one row holds the rest (remembered per browser)
              <button className="link more-row" aria-expanded={!!more} onClick={() => useStore.getState().setPrefs({ growMore: !more })} data-testid="grow-more">
                {t(more ? 'grow.less' : 'grow.more')}
              </button>
            )}
            {advanced && more && (
              <>
            <div className="field dial-field">
              <span className="label" title={t('edge.angleNote')}>
                {t('edge.angle')}
              </span>
              <AngleDial
                value={grow.angle}
                label={t('edge.angle')}
                title={t('edge.angleNote')}
                testIdPrefix="grow-angle-"
                zoneAt={(a) => checkHinge(design, panelId, edge, a, grow.height).zone}
                message={check.reason === 'needsWalls' ? undefined : hingeText(t, check)}
                onChange={(a) => setGrow({ angle: a })}
              />
            </div>
            {options.length > 0 && (
              <div className="field">
                <label htmlFor="grow-kind">{t('edge.connection')}</label>
                <select id="grow-kind" value={effKind} onChange={(e) => setGrow({ kind: e.target.value as ConnectionKind })} data-testid="grow-kind">
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {t(`conn.${o}` as 'conn.fold')}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {eg.offset === 0 && (
              <div className="span-row">
                <NumField label={t('grow.spanStart')} value={Math.round(span[0] * 10) / 10} unit={t('unit.mm')} min={0} max={L} onCommit={(v) => setGrow({ span: [Math.min(v, span[1] - 5), span[1]], sketch: null })} testId="grow-span-start" />
                <NumField label={t('grow.spanEnd')} value={Math.round(span[1] * 10) / 10} unit={t('unit.mm')} min={0} max={L} onCommit={(v) => setGrow({ span: [span[0], Math.max(v, span[0] + 5)], sketch: null })} testId="grow-span-end" />
              </div>
            )}
            <label className="check" title={t('grow.adaptHelp')}>
              <input type="checkbox" checked={grow.adapt !== false} onChange={(e) => setGrow({ adapt: e.target.checked, sketch: null })} data-testid="grow-adapt" />
              {t('grow.adapt')}
            </label>
            {eg.adaptive && !grow.sketch && <p className="note" data-testid="grow-adapted">{t('grow.adapted')}</p>}
            <button
              className={grow.editGhost ? 'on' : ''}
              aria-pressed={!!grow.editGhost}
              onClick={() => setGrow({ editGhost: !grow.editGhost, sketch: grow.editGhost ? grow.sketch : (grow.sketch ?? eg.adaptive ?? { kind: 'wall' }) })}
              data-testid="grow-edit-outline"
            >
              <Icon name="polygon" size={16} /> {t(grow.editGhost ? 'outline.done' : 'outline.edit')}
            </button>
            {check.sideWalls && effKind === 'lean' && (
              <div className="warn" data-testid="lean-needs-walls">
                <strong>{hingeText(t, check)}</strong>
                {check.reason === 'needsWalls' && <p className="note">{t('edge.leanHelp')}</p>}
                <button onClick={() => useStore.getState().apply((d) => addSideWalls(d, panelId, edge, angle, grow.height, dir))} data-testid="add-side-walls">
                  {t('edge.addSideWalls')}
                </button>
              </div>
            )}
              </>
            )}
            {/* milestone 78: how to grow it is the stage's bottom hint, not repeated here */}
            {advanced && more && matOfEB(design, panelId).kind !== 'plywood' && <EdgeFlapField panelId={panelId} edge={edge} />}
          </>
        )}
      </div>
    </div>
  );
}

const FLAP_PICS: Record<FlapShape, PicName> = { plain: 'flapPlain', tuck: 'tuck', dust: 'flapDust', glue: 'flapGlue', hang: 'flapHang' };

/** A flap on this free edge (milestone 67): add it, set its length, take it off; its shape, fold, slopes, radius and hole (112). */
function EdgeFlapField({ panelId, edge }: { panelId: string; edge: string }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = design.panels[panelId];
  const f = p?.edgeFlaps?.find((x) => x.edge === edge);
  const fe = shown(useFeature('edgeFlap'));
  const shapes = shown(useFeature('flap.shape'));
  if (!fe) return null;
  if (!f) {
    const why = p ? edgeFeatureKind('flap').blocked!(design, p, edge) : null;
    return (
      <button onClick={() => apply((d) => void addEdgeFlap(d, panelId, edge))} title={why ? t(why) : t('flap.addHelp')} disabled={!!why} data-testid="edge-add-flap">
        {t('flap.add')}
      </button>
    );
  }
  const spec = flapSpec(f, tOfEB(design, panelId));
  const set = (patch: Parameters<typeof setEdgeFlap>[3]) => apply((d) => setEdgeFlap(d, panelId, edge, patch));
  return (
    <div className="subsection" data-testid="edge-flap">
      {shapes && (
        <div className="subsection" data-testid="flap-shape">
          <PictureChoice
            label={t('flap.shape')}
            value={spec.shape}
            options={(['plain', 'tuck', 'dust', 'glue', 'hang'] as FlapShape[]).map((v) => ({ value: v, label: t(`flap.shape.${v}` as MsgKey), pic: FLAP_PICS[v], testId: `flap-shape-${v}` }))}
            onChange={(v) => set({ shape: v === 'plain' ? undefined : v })}
          />
        </div>
      )}
      <NumField label={t('flap.len')} value={f.len} unit={t('unit.mm')} min={2} max={200} onCommit={(v) => set(v)} testId="edge-flap-len" />
      {shapes && spec.shape !== 'plain' && (
        <>
          <NumField label={t('flap.angle')} value={spec.angle} unit="°" min={0} max={180} decimals={0} onCommit={(v) => set({ angle: v })} testId="flap-angle" />
          {spec.angle > 0 && (
            <div className="field">
              <span className="label">{t('flap.dir')}</span>
              <span className="seg" role="group" aria-label={t('flap.dir')}>
                {(['in', 'out'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={spec.dir === v} className={spec.dir === v ? 'on' : ''} onClick={() => set({ dir: v === 'in' ? undefined : v })} data-testid={`flap-dir-${v}`}>
                    {t(`flap.dir.${v}` as MsgKey)}
                  </button>
                ))}
              </span>
              {spec.dir === 'out' && <p className="note">{t('flap.dirHelp')}</p>}
            </div>
          )}
          <NumField label={t('flap.taperA')} value={spec.taper[0]} unit="°" min={0} max={60} decimals={0} onCommit={(v) => set({ taper: [v, spec.taper[1]] })} testId="flap-taper-a" />
          <NumField label={t('flap.taperB')} value={spec.taper[1]} unit="°" min={0} max={60} decimals={0} onCommit={(v) => set({ taper: [spec.taper[0], v] })} testId="flap-taper-b" />
          <NumField label={t('flap.r')} value={spec.r} unit={t('unit.mm')} min={0} max={50} onCommit={(v) => set({ r: v })} testId="flap-r" />
          {spec.shape === 'hang' && (
            <div className="field">
              <span className="label">{t('flap.hole')}</span>
              <span className="seg" role="group" aria-label={t('flap.hole')} data-testid="flap-hole">
                {(['round', 'euro'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={spec.hole === v} className={spec.hole === v ? 'on' : ''} onClick={() => set({ hole: v === 'round' ? undefined : v })} data-testid={`flap-hole-${v}`}>
                    {t(`flap.hole.${v}` as MsgKey)}
                  </button>
                ))}
              </span>
            </div>
          )}
        </>
      )}
      <button className="link" onClick={() => apply((d) => setEdgeFlap(d, panelId, edge, null))} data-testid="edge-flap-remove">
        {t('flap.remove')}
      </button>
    </div>
  );
}

/** A closing choice's name (milestone 77). */
export function closeLabel(o: CloseAs): MsgKey {
  return o.startsWith('style:') ? (`closure.${o.slice(6)}` as MsgKey) : (`lid.kind.${o}` as MsgKey);
}
/** And its picture. */
function closePic(o: CloseAs): PicName {
  if (o === 'liftoff' || o === 'hinged' || o === 'fixed') return o;
  return o === 'style:glued' ? 'fixed' : o === 'style:rest' ? 'hinged' : o === 'style:tab' ? 'snap' : 'tuck';
}
