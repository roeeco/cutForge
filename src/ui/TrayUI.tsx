// Tray cards: Extrude (a ghost tray on the stage with a push-pull height,
// then "Add walls"), the tray section of a base's card (height, joints,
// open edges with "Wall it"), and the own-height switch on a tray wall.
import { useStore, useT } from '../store/store';
import { NumField, Segmented, Stepper } from './NumField';
import { allFoldOvers, foldOverDims } from '../model/foldover';
import { validate } from '../model/validate';
import { Icon } from './icons';
import { addFoldOver, addTray, canFoldOver, parentConnection, removeFoldOver, setCustomHeight, setTrayHeight, setTrayKinds, updateFoldOver, wallIt } from '../model/ops';
import { shortEdges, trayKinds, trayOf, MIN_EDGE } from '../model/trays';
import { panelEdges, segLength } from '../model/edges';
import { connectionsFor } from '../model/materials';
import { seamKinds } from '../model/seams';
import { edgeLabel } from '../model/names';
import type { ConnectionKind } from '../model/types';

/** Can this panel be extruded: a root panel with no tray and no wall standing at its edges? */
export function canExtrude(d: ReturnType<typeof useStore.getState>['design'], id: string): boolean {
  if (!d.panels[id] || parentConnection(d, id) || trayOf(d, id)) return false;
  return !Object.values(d.connections).some((c) => c.grown && c.a.panelId === id && !(c.offset > 0));
}

export function ExtrudeSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const ex = useStore((s) => s.extrude);
  const set = useStore((s) => s.set);
  if (!canExtrude(d, panelId)) return null;
  const mm = t('unit.mm');
  if (!ex || ex.baseId !== panelId)
    return (
      <div className="subsection">
        <button onClick={() => set({ extrude: { baseId: panelId, height: 40 } })} data-testid="extrude">
          <Icon name="grow" size={16} /> {t('tray.extrude')}
        </button>
      </div>
    );
  const p = d.panels[panelId];
  const n = panelEdges(p).filter((e) => segLength(e) >= MIN_EDGE).length;
  const kinds = trayKinds(d.material);
  return (
    <div className="subsection extrude-card" data-testid="extrude-card">
      <h4>{t('tray.extrude')}</h4>
      <p className="note">{t('tray.extrudeHelp', { n })}</p>
      <NumField label={t('tray.height')} value={ex.height} unit={mm} min={5 + d.material.thickness} max={1000} onCommit={(v) => set({ extrude: { ...ex, height: v } })} testId="extrude-height" />
      <p className="note">
        {t('tray.joints', { wall: t(`conn.${kinds.wallKind}` as 'conn.fold'), corner: t(`conn.${kinds.cornerKind}` as 'conn.fold') })}
      </p>
      <div className="card-actions">
        <button
          className="primary"
          onClick={() => {
            useStore.getState().apply((x) => void addTray(x, panelId, ex.height));
            set({ extrude: null });
          }}
          data-testid="extrude-go"
        >
          {t('tray.addWalls')}
        </button>
        <button className="ghost" onClick={() => set({ extrude: null })} data-testid="extrude-cancel">
          {t('tray.cancel')}
        </button>
      </div>
    </div>
  );
}

/** The tray part of its base's card. */
export function TraySection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const tray = trayOf(d, panelId);
  if (!tray || tray.baseId !== panelId) return null;
  const mm = t('unit.mm');
  const wallKinds = connectionsFor(d.material, 90).filter((k) => k !== 'butt');
  const cornerKinds = seamKinds(d.material, 'corner');
  const short = shortEdges(d, tray);
  const open = tray.openEdges.filter((k) => panelEdges(d.panels[panelId]).some((e) => e.key === k));
  return (
    <div className="subsection tray-card" data-testid="tray-card">
      <h4>{t('tray.title')}</h4>
      <NumField label={t('tray.height')} value={tray.height} unit={mm} min={5 + d.material.thickness} max={1000} onCommit={(v) => apply((x) => setTrayHeight(x, tray.id, v))} testId="tray-height" />
      <div className="field">
        <label htmlFor="tray-wall-kind">{t('tray.wallJoint')}</label>
        <select id="tray-wall-kind" value={tray.wallKind} onChange={(e) => apply((x) => setTrayKinds(x, tray.id, { wallKind: e.target.value as ConnectionKind }))} data-testid="tray-wall-kind">
          {wallKinds.map((k) => (
            <option key={k} value={k}>
              {t(`conn.${k}` as 'conn.fold')}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="tray-corner-kind">{t('tray.cornerJoint')}</label>
        <select id="tray-corner-kind" value={tray.cornerKind} onChange={(e) => apply((x) => setTrayKinds(x, tray.id, { cornerKind: e.target.value as ConnectionKind }))} data-testid="tray-corner-kind">
          {cornerKinds.map((k) => (
            <option key={k} value={k}>
              {t(`conn.${k}` as 'conn.fold')}
            </option>
          ))}
        </select>
      </div>
      {tray.cornerKind === 'tabslot' && (
        <Segmented
          label={t('conn.tabLen')}
          value={tray.tabLen ?? 'flush'}
          options={(['flush', 'through'] as const).map((o) => ({ value: o, label: t(`conn.tabLen.${o}`), testId: `tray-tablen-${o}` }))}
          onChange={(o) => apply((x) => setTrayKinds(x, tray.id, { tabLen: o as 'flush' | 'through' }))}
        />
      )}
      {tray.wallKind === 'fold' && <p className="note">{t('tray.creaseLoop')}</p>}
      {short.length > 0 && <p className="note" data-testid="tray-short">{t('tray.short', { n: short.length })}</p>}
      {open.length > 0 && (
        <div className="tray-open" data-testid="tray-open">
          <p className="note">{t('tray.open', { n: open.length })}</p>
          {open.map((k) => (
            <button key={k} onClick={() => apply((x) => wallIt(x, tray.id, k))} data-testid={`wall-it-${k}`}>
              {t('tray.wallIt', { edge: edgeLabel(d, panelId, k, t) })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** On a tray wall's card: the tray's height is shared unless this wall keeps its own. */
export function TrayWallNote({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const c = parentConnection(d, panelId);
  const tray = c?.trayId ? d.trays[c.trayId] : undefined;
  const p = d.panels[panelId];
  if (!tray || !p) return null;
  return (
    <div className="tray-wall-note" data-testid="tray-wall">
      <p className="note">{p.customHeight ? t('tray.customHeight') : t('tray.sharedHeight')}</p>
      <label className="check">
        <input type="checkbox" checked={!!p.customHeight} onChange={(e) => apply((x) => setCustomHeight(x, panelId, e.target.checked))} data-testid="custom-height" />
        {t('tray.ownHeight')}
      </label>
    </div>
  );
}

/** Fold-over (double wall) on a card or corrugated wall's top edge. */
export function FoldOverSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = d.panels[panelId];
  if (!p || d.material.kind === 'plywood' || !parentConnection(d, panelId)) return null;
  const f = p.foldOvers?.[0];
  const mm = t('unit.mm');
  if (!f)
    return canFoldOver(d, panelId, 'e2') ? (
      <div className="subsection" data-testid="fold-section">
        <h4>{t('fold.title')}</h4>
        <p className="note">{t('fold.help')}</p>
        <button onClick={() => apply((x) => void addFoldOver(x, panelId, 'e2'))} data-testid="fold-add">
          {t('fold.add')}
        </button>
      </div>
    ) : null;
  const dims = foldOverDims(d, p, f);
  const geom = allFoldOvers(d).find((x) => x.panelId === panelId);
  const flute = validate(d).some((i) => i.key === 'val.flute' && i.target.id === panelId);
  return (
    <div className="subsection" data-testid="fold-section">
      <h4>{t('fold.title')}</h4>
      <Segmented
        label={t('fold.depth')}
        value={f.depth === null ? 'full' : 'hem'}
        options={[
          { value: 'full', label: t('fold.full'), testId: 'fold-depth-full' },
          { value: 'hem', label: t('fold.hem'), testId: 'fold-depth-hem' },
        ]}
        onChange={(v) => apply((x) => updateFoldOver(x, panelId, f.id, { depth: v === 'full' ? null : Math.round(0.4 * p.h), ...(v === 'hem' ? { lock: 'glue' as const } : {}) }))}
      />
      {f.depth !== null && <NumField label={t('fold.hemDepth')} value={f.depth} unit={mm} min={5} max={p.h} onCommit={(v) => apply((x) => updateFoldOver(x, panelId, f.id, { depth: v }))} testId="fold-hem" />}
      <Segmented
        label={t('fold.lock')}
        value={f.lock}
        options={[
          { value: 'glue', label: t('fold.glue'), testId: 'fold-lock-glue' },
          { value: 'tabs', label: t('fold.tabs'), testId: 'fold-lock-tabs' },
        ]}
        onChange={(v) => apply((x) => updateFoldOver(x, panelId, f.id, { lock: v as 'glue' | 'tabs', ...(v === 'tabs' ? { depth: null } : {}) }))}
      />
      {f.lock === 'tabs' && (
        <>
          <Stepper label={t('fold.locks')} value={f.locks ?? geom?.g.tabs.length ?? 2} min={1} max={4} slider={false} onCommit={(v) => apply((x) => updateFoldOver(x, panelId, f.id, { locks: v }))} testId="fold-locks" />
          <NumField label={t('fold.lockDepth')} value={dims.lockDepth} unit={mm} min={2} max={60} onCommit={(v) => apply((x) => updateFoldOver(x, panelId, f.id, { lockDepth: v }))} testId="fold-lockdepth" />
        </>
      )}
      {flute && (
        <p className="warn-text" data-testid="fold-flute">
          {t('fold.flute')}
        </p>
      )}
      <button className="link" onClick={() => apply((x) => removeFoldOver(x, panelId, f.id))} data-testid="fold-remove">
        {t('fold.remove')}
      </button>
    </div>
  );
}
