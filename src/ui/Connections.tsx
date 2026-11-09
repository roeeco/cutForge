// Inspector sections for a panel's connections, open seams, dividers and clear sizes.
import { flapWidth } from '../model/jointDefaults';
import { useState } from 'react';
import { useStore, useT } from '../store/store';
import { NumField, Segmented, Stepper } from './NumField';
import { AngleDial, hingeText } from './AngleDial';
import { checkHinge, fromHinge, hingeOf } from '../model/hinge';
import { Icon } from './icons';
import { edgeLabel, panelLabel } from '../model/names';
import { FACE } from '../model/edges';
import { connectionsFor } from '../model/materials';
import { addDivider, addSideWalls, canDividerSet, connectSeam, deleteConnection, dividerSetOf, leanSupported, respaceDividers, setConnection, setDividerSet } from '../model/ops';
import { autoLockDepth, autoTabs, minTabWidth, findOpenSeams, fingerCountFor, seamKinds, seamTypeOf, cornerFit, cornerAngle, faceFit, ownerOf } from '../model/seams';
import { clearSpans } from '../model/measure';
import { edgeLength } from '../model/frame';
import type { Connection, ConnectionKind, Design } from '../model/types';
import { fmtNum } from '../i18n';

function kindsFor(d: Design, c: Connection): ConnectionKind[] {
  if (c.grown) return connectionsFor(d.material, c.angle);
  return seamKinds(d.material, seamTypeOf(c));
}

/** Corner angle of a closing corner seam (degrees), or null. */
function cornerAngleOf(d: Design, c: Connection): number | null {
  if (c.grown || c.b.edge === FACE) return null;
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  const f = A && B ? cornerFit(A, c.a.edge, B, c.b.edge) : null;
  return f ? cornerAngle(f) : null;
}

/** Length of the joint, for automatic finger and tab counts. */
function jointLength(d: Design, c: Connection): number {
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return 0;
  if (c.kind === 'finger') {
    const f = cornerFit(A, c.a.edge, B, c.b.edge);
    return f ? f.s1 - f.s0 : edgeLength(A, c.a.edge);
  }
  if (c.kind !== 'tabslot') return 0;
  const o = ownerOf(c);
  if (o.edge === FACE) return 0;
  const f = faceFit(d.panels[o.owner], o.edge, d.panels[o.receiver], d.material.thickness);
  return f ? f.s1 - f.s0 : 0;
}

/** Settings of one connection (inspector joint row and the seam pill card). */
export function ConnectionEditor({ c, panelId }: { c: Connection; panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const mm = t('unit.mm');
  const isChild = c.grown && c.b.panelId === panelId;
  const kinds = kindsFor(d, c);
  const len = jointLength(d, c);
  const ang = cornerAngleOf(d, c);
  return (
    <div className="conn-edit" data-testid={`conn-${c.kind}`}>
      {c.broken && <p className="warn-text">{t('conn.broken')}</p>}
      {ang !== null && Math.abs(ang - 90) > 0.5 && (c.kind === 'finger' || c.kind === 'tabslot') && (
        <p className="note" data-testid="conn-angle-gap">
          {t('conn.angleGap', { angle: fmtNum(ang, 0), gap: fmtNum(d.material.thickness * Math.abs(1 / Math.tan((ang * Math.PI) / 180)), 1) })}
        </p>
      )}
      {kinds.length > 1 && (
        <div className="field">
          <label htmlFor={`k-${c.id}`}>{t('edge.connection')}</label>
          <select id={`k-${c.id}`} value={c.kind} onChange={(e) => apply((x) => setConnection(x, c.id, { kind: e.target.value as ConnectionKind }))} data-testid="conn-kind">
            {kinds.map((o) => (
              <option key={o} value={o}>
                {t(`conn.${o}` as 'conn.fold')}
              </option>
            ))}
          </select>
        </div>
      )}
      {c.kind === 'finger' && (
        <Stepper label={t('conn.fingers')} value={fingerCountFor(c, len, d.material.thickness)} step={2} min={3} max={99} slider={false} onCommit={(v) => apply((x) => setConnection(x, c.id, { fingers: v }))} testId="conn-fingers" />
      )}
      {c.kind === 'tabslot' && <Stepper label={t('conn.tabs')} value={c.tabs ?? autoTabs(len)} min={1} max={30} onCommit={(v) => apply((x) => setConnection(x, c.id, { tabs: v }))} testId="conn-tabs" />}
      {c.kind === 'tabslot' && (
        <>
          <Segmented
            label={t('conn.tabLen')}
            value={c.tabLen ?? 'flush'}
            options={(['flush', 'through'] as const).map((o) => ({ value: o, label: t(`conn.tabLen.${o}`), testId: `conn-tablen-${o}` }))}
            onChange={(o) => apply((x) => setConnection(x, c.id, { tabLen: o as 'flush' | 'through' }))}
          />
          {c.tabLen === 'through' && (
            <>
              <NumField label={t('conn.lockDepth')} value={c.lockDepth ?? autoLockDepth(d.material)} unit={mm} min={2} max={60} onCommit={(v) => apply((x) => setConnection(x, c.id, { lockDepth: v }))} testId="conn-lockdepth" />
              <p className="note">{t('conn.throughHelp')}</p>
            </>
          )}
          {d.material.kind === 'corrugated' && <p className="note">{t('conn.minTab', { w: fmtNum(minTabWidth(d.material), 1) })}</p>}
        </>
      )}
      {c.kind === 'glue' && <NumField label={t('conn.flap')} value={flapWidth(d, c)} unit={mm} min={3} max={100} onCommit={(v) => apply((x) => setConnection(x, c.id, { flap: v }))} />}
      {c.grown && isChild && (c.kind === 'tabslot' || c.offset > 0) && (
        <NumField label={t('conn.offset')} value={c.offset} unit={mm} min={0} max={2000} onCommit={(v) => apply((x) => setConnection(x, c.id, { offset: v }))} testId="conn-offset" />
      )}
      {c.kind === 'fold' && (
        <Segmented
          label={t('conn.foldDir')}
          value={c.foldDir}
          options={[
            { value: 'valley', label: t('conn.valley') },
            { value: 'mountain', label: t('conn.mountain') },
          ]}
          onChange={(v) => apply((x) => setConnection(x, c.id, { foldDir: v as 'valley' | 'mountain' }))}
          testId="conn-folddir"
        />
      )}
      {!c.grown && (
        <button className="link" onClick={() => apply((x) => deleteConnection(x, c.id))} data-testid="conn-delete">
          {t('conn.delete')}
        </button>
      )}
    </div>
  );
}

/** One line per joint; the open one shows its settings (the parent joint by default). */
export function PanelConnections({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const openJoint = useStore((s) => s.openJoint);
  const [shown, setShown] = useState(true);
  const list = Object.values(d.connections).filter((c) => c.a.panelId === panelId || c.b.panelId === panelId);
  if (!list.length) return null;
  const parentId = list.find((c) => c.grown && c.b.panelId === panelId)?.id ?? null;
  const open = openJoint === '' ? null : openJoint && list.some((c) => c.id === openJoint) ? openJoint : parentId;
  return (
    <div className="subsection" data-testid="inspector-connection">
      <button className="collapse-head" aria-expanded={shown} onClick={() => setShown(!shown)}>
        <span className="chev">
          <Icon name="chevRight" size={14} />
        </span>
        {t('conn.listN', { n: list.length })}
      </button>
      {shown &&
        list.map((c) => {
          const other = c.a.panelId === panelId ? c.b.panelId : c.a.panelId;
          const isOpen = c.id === open;
          return (
            <div key={c.id} className={`conn ${c.broken ? 'broken' : ''}`}>
              <button className="conn-row" aria-expanded={isOpen} onClick={() => useStore.getState().set({ openJoint: isOpen ? '' : c.id })} data-testid={`joint-row-${c.kind}`}>
                <span className="kind-ico">
                  <Icon name={c.kind} size={18} />
                </span>
                <span className="conn-title">{t(`conn.${c.kind}` as 'conn.fold')}</span>
                <span className="conn-sub">{panelLabel(d, other, t)}</span>
              </button>
              {isOpen && <ConnectionEditor c={c} panelId={panelId} />}
            </div>
          );
        })}
    </div>
  );
}

export function OpenSeams({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const seams = findOpenSeams(d, panelId);
  if (!seams.length) return null;
  return (
    <div className="subsection" data-testid="open-seams">
      <h4>{t('seam.title')}</h4>
      {seams.map((s, i) => {
        const mine = s.a.panelId === panelId ? s.a : s.b;
        const other = d.panels[s.a.panelId === panelId ? s.b.panelId : s.a.panelId];
        const label =
          s.type === 'cross'
            ? t('seam.cross', { panel: panelLabel(d, other.id, t) })
            : mine.edge !== FACE
              ? t('seam.corner', { edge: edgeLabel(d, mine.panelId, mine.edge, t), panel: panelLabel(d, other.id, t) })
              : t('seam.face', { panel: panelLabel(d, other.id, t) });
        return <SeamRow key={i} label={label} overlap={s.overlapping} kinds={seamKinds(d.material, s.type)} onConnect={(k) => apply((x) => void connectSeam(x, s, k, false))} />;
      })}
    </div>
  );
}

function SeamRow({ label, overlap, kinds, onConnect }: { label: string; overlap: boolean; kinds: ConnectionKind[]; onConnect: (k: ConnectionKind) => void }) {
  const t = useT();
  const [k, setK] = useState<ConnectionKind>(kinds[0]);
  const kk = kinds.includes(k) ? k : kinds[0];
  return (
    <div className="conn">
      <div className="conn-title">{label}</div>
      {overlap && <p className="warn-text">{t('seam.overlap')}</p>}
      <div className="field">
        <select value={kk} onChange={(e) => setK(e.target.value as ConnectionKind)} aria-label={t('edge.connection')}>
          {kinds.map((o) => (
            <option key={o} value={o}>
              {t(`conn.${o}` as 'conn.fold')}
            </option>
          ))}
        </select>
        <button onClick={() => onConnect(kk)} data-testid="seam-connect">
          {t('seam.connect')}
        </button>
      </div>
    </div>
  );
}

export function ClearSizes({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const hasChildren = Object.values(d.connections).some((c) => c.grown && c.a.panelId === panelId);
  const spans = hasChildren ? clearSpans(d, panelId) : null;
  if (!spans) return null;
  const list = (xs: number[]) => xs.map((x) => fmtNum(x)).join(' | ');
  return (
    <div className="subsection" data-testid="clear-sizes">
      <h4>{t('clear.title')}</h4>
      {spans.x.length > 0 && <p className="note" dir="auto">{t('clear.x', { list: list(spans.x) })}</p>}
      {spans.y.length > 0 && <p className="note" dir="auto">{t('clear.y', { list: list(spans.y) })}</p>}
    </div>
  );
}

export function DividerAdder({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const p = d.panels[panelId];
  const [edge, setEdge] = useState<0 | 3>(0);
  const [pos, setPos] = useState<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  if (!p) return null;
  // only offered on panels that already have something standing on them
  const hasChildren = Object.values(d.connections).some((c) => c.grown && c.a.panelId === panelId);
  if (!hasChildren) return null;
  const span = edge === 0 ? p.h : p.w;
  const position = pos ?? Math.round(span / 2);
  const childH = Math.min(...Object.values(d.connections).filter((c) => c.grown && c.a.panelId === panelId).map((c) => d.panels[c.b.panelId]?.h ?? 40));
  const h = height ?? Math.max(10, Math.round(childH - d.material.thickness - 5));
  const mm = t('unit.mm');
  return (
    <div className="subsection" data-testid="divider-adder">
      <button className="collapse-head" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="div-toggle">
        <span className="chev">
          <Icon name="chevRight" size={14} />
        </span>
        {t('div.title')}
      </button>
      {open && (
      <>
      <DividerSetControls panelId={panelId} />
      <h4 className="sub-head">{t('div.one')}</h4>
      <div className="field">
        <label htmlFor="div-edge">{t('div.parallel')}</label>
        <select id="div-edge" value={edge} onChange={(e) => setEdge(Number(e.target.value) as 0 | 3)} data-testid="div-edge">
          <option value={0}>{t('div.edge0')}</option>
          <option value={3}>{t('div.edge3')}</option>
        </select>
      </div>
      <NumField label={t('div.position')} value={position} unit={mm} min={1} max={span} onCommit={setPos} testId="div-pos" />
      <NumField label={t('insp.height')} value={h} unit={mm} min={5} max={2000} onCommit={setHeight} testId="div-height" />
      <button
        onClick={() => {
          let id: string | null = null;
          useStore.getState().apply((x) => void (id = addDivider(x, panelId, edge, position, h)));
          if (id) useStore.getState().select({ kind: 'panel', id });
        }}
        data-testid="div-add"
      >
        {t('div.add')}
      </button>
      </>
      )}
    </div>
  );
}

/** Automatic dividers: counts across and along, height, even or by compartment size; Space evenly again. */
function DividerSetControls({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const mm = t('unit.mm');
  if (!canDividerSet(d, panelId)) return <p className="note" data-testid="div-auto-rect">{t('div.autoRectOnly')}</p>;
  const set = dividerSetOf(d, panelId);
  const change = (patch: Parameters<typeof setDividerSet>[2]) => apply((x) => void setDividerSet(x, panelId, patch));
  const n = set ? d.order.filter((id) => id.startsWith(set.id + '/')).length : 0;
  return (
    <div className="div-auto" data-testid="div-auto">
      <h4 className="sub-head">{t('div.auto')}</h4>
      <Stepper label={t('div.across')} value={set?.across ?? 0} min={0} max={10} onCommit={(v) => change({ across: v })} testId="div-across" />
      <Stepper label={t('div.along')} value={set?.along ?? 0} min={0} max={10} onCommit={(v) => change({ along: v })} testId="div-along" />
      {set && (
        <>
          <NumField label={t('insp.height')} value={set.height} unit={mm} min={5} max={2000} onCommit={(v) => change({ height: v })} testId="div-set-height" />
          <Segmented
            label={t('div.spacing')}
            value={set.mode}
            options={[
              { value: 'even', label: t('div.even'), testId: 'div-mode-even' },
              { value: 'size', label: t('div.bySize'), testId: 'div-mode-size' },
            ]}
            onChange={(m) => change({ mode: m as 'even' | 'size', size: set.size ?? 30 })}
          />
          {set.mode === 'size' && <NumField label={t('div.size')} value={set.size ?? 30} unit={mm} min={5} max={2000} onCommit={(v) => change({ size: v })} testId="div-size" />}
          <p className="note" data-testid="div-set-count">
            {t('div.setCount', { n })}
          </p>
          {!!set.loose?.length && (
            <div className="warn">
              <p className="note">{t('div.looseNote', { n: set.loose.length })}</p>
              <button onClick={() => apply((x) => respaceDividers(x, set.id))} data-testid="div-respace">
                {t('div.respace')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Hinge angle of a grown panel (top level of its card): the 360° dial, a note
 * when the angle needs one, and side walls where they help.
 */
export function PanelHinge({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const [refused, setRefused] = useState<string | undefined>();
  const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === panelId);
  const p = d.panels[panelId];
  if (!c || !p) return null;
  const st = useStore.getState;
  const h = hingeOf(c.angle, c.dir);
  const check = checkHinge(d, c.a.panelId, c.a.edge, h, p.h);
  const held = c.kind !== 'lean' || leanSupported(d, panelId);
  const set = (a: number, final: boolean) => {
    setRefused(undefined);
    st().preview((x) => setConnection(x, c.id, fromHinge(a)));
    if (!final) return;
    const s2 = st();
    const now = checkHinge(s2.design, c.a.panelId, c.a.edge, a, p.h);
    if (now.zone === 'bad') {
      setRefused(t('hinge.cantSet', { reason: hingeText(t, now) ?? '' }));
      s2.cancel();
    } else s2.commit();
  };
  const { angle, dir } = fromHinge(h);
  return (
    <>
      <div className="field dial-field" data-testid="panel-hinge-field">
        <span className="label" title={t('edge.angleNote')}>
          {t('edge.angle')}
        </span>
        <AngleDial
          value={h}
          label={t('edge.angle')}
          title={t('edge.angleNote')}
          testIdPrefix="conn-angle-"
          zoneAt={(a) => checkHinge(d, c.a.panelId, c.a.edge, a, p.h).zone}
          message={refused ?? (check.reason === 'needsWalls' || !held ? undefined : hingeText(t, check))}
          onChange={set}
        />
      </div>
      {((check.sideWalls && c.kind === 'lean') || !held) && (
        <div className="warn" data-testid="hinge-support">
          <strong>{held ? hingeText(t, check) : t('lean.unsupported')}</strong>
          {c.kind === 'lean' && <p className="note">{t('edge.leanHelp')}</p>}
          <button onClick={() => st().apply((x) => addSideWalls(x, c.a.panelId, c.a.edge, angle, p.h, dir))} data-testid="insp-add-side-walls">
            {t('edge.addSideWalls')}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Joint details, collapsed by default: the panel's joints and the places it
 * meets other panels without one. Meeting panels are joined automatically, so
 * open seams are ones the student unjoined; they are announced above the
 * section (they make panels overlap), with a Connect all button.
 */
export function JointsAdvanced({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const openJoint = useStore((s) => s.openJoint);
  const apply = useStore((s) => s.apply);
  const mine = (c: Connection) => c.a.panelId === panelId || c.b.panelId === panelId;
  const n = Object.values(d.connections).filter(mine).length;
  const open = findOpenSeams(d, panelId);
  const [shown, setShown] = useState(false);
  const pillOpened = !!openJoint && Object.values(d.connections).some((c) => c.id === openJoint && mine(c));
  const expanded = shown || pillOpened;
  if (!n && !open.length) return null;
  return (
    <>
      {open.length > 0 && (
        <div className="warn" data-testid="seams-pending">
          <strong>{t('seam.pending', { n: open.length })}</strong>
          <button
            onClick={() =>
              apply((x) => {
                for (let i = 0; i < 50; i++) {
                  const s = findOpenSeams(x, panelId)[0];
                  if (!s || !connectSeam(x, s, undefined, false)) break;
                }
              })
            }
            data-testid="seam-connect-all"
          >
            {t('seam.connectAll')}
          </button>
        </div>
      )}
      <div className="subsection">
        <button
          className="collapse-head"
          aria-expanded={expanded}
          onClick={() => {
            if (expanded) {
              setShown(false);
              if (pillOpened) useStore.getState().set({ openJoint: null });
            } else setShown(true);
          }}
          data-testid="joints-advanced"
        >
          <span className="chev">
            <Icon name="chevRight" size={14} />
          </span>
          {t('insp.joints')}
        </button>
        {expanded && (
          <>
            <PanelConnections panelId={panelId} />
            <OpenSeams panelId={panelId} />
          </>
        )}
      </div>
    </>
  );
}
