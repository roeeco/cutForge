// Inspector sections for a panel's connections, open seams, dividers and clear sizes.
import { useState } from 'react';
import { useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { ANGLES, connectionsFor } from '../model/materials';
import { addDivider, addSideWalls, connectSeam, deleteConnection, leanSupported, setConnection } from '../model/ops';
import { autoFlap, autoTabs, findOpenSeams, fingerCountFor, seamKinds, cornerFit, faceFit, ownerOf } from '../model/seams';
import { clearSpans } from '../model/measure';
import { edgeLength } from '../model/frame';
import type { Connection, ConnectionKind, Design } from '../model/types';
import { fmtNum } from '../i18n';

function kindsFor(d: Design, c: Connection): ConnectionKind[] {
  if (c.grown) return connectionsFor(d.material, c.angle);
  return seamKinds(d.material, c.kind === 'halflap' ? 'cross' : c.b.edge >= 0 ? 'corner' : 'face');
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
  if (o.edge < 0) return 0;
  const f = faceFit(d.panels[o.owner], o.edge, d.panels[o.receiver], d.material.thickness);
  return f ? f.s1 - f.s0 : 0;
}

export function PanelConnections({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const list = Object.values(d.connections).filter((c) => c.a.panelId === panelId || c.b.panelId === panelId);
  if (!list.length) return null;
  const mm = t('unit.mm');
  return (
    <div className="subsection" data-testid="inspector-connection">
      <h4>{t('conn.list')}</h4>
      {list.map((c) => {
        const other = d.panels[c.a.panelId === panelId ? c.b.panelId : c.a.panelId];
        const isChild = c.grown && c.b.panelId === panelId;
        const kinds = kindsFor(d, c);
        const len = jointLength(d, c);
        return (
          <div key={c.id} className={`conn ${c.broken ? 'broken' : ''}`} data-testid={`conn-${c.kind}`}>
            <div className="conn-title">{t('conn.with', { kind: t(`conn.${c.kind}` as 'conn.fold'), panel: other?.name ?? '?' })}</div>
            {c.broken && <p className="warn-text">{t('conn.broken')}</p>}
            {kinds.length > 1 && (
              <div className="field">
                <label htmlFor={`k-${c.id}`}>{t('edge.connection')}</label>
                <select id={`k-${c.id}`} value={c.kind} onChange={(e) => apply((x) => setConnection(x, c.id, { kind: e.target.value as ConnectionKind }))}>
                  {kinds.map((o) => (
                    <option key={o} value={o}>
                      {t(`conn.${o}` as 'conn.fold')}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isChild && (
              <div className="field">
                <span className="label" title={t('edge.angleNote')}>
                  {t('edge.angle')}
                </span>
                <span className="chips" dir="ltr">
                  {ANGLES.map((a) => (
                    <button key={a} className={c.angle === a ? 'on chip' : 'chip'} aria-pressed={c.angle === a} onClick={() => apply((x) => setConnection(x, c.id, { angle: a }))} data-testid={`conn-angle-${a}`}>
                      {a}°
                    </button>
                  ))}
                </span>
              </div>
            )}
            {c.kind === 'finger' && (
              <NumField label={t('conn.fingers')} value={fingerCountFor(c, len, d.material.thickness)} decimals={0} min={3} max={99} onCommit={(v) => apply((x) => setConnection(x, c.id, { fingers: v }))} testId="conn-fingers" />
            )}
            {c.kind === 'tabslot' && (
              <NumField label={t('conn.tabs')} value={c.tabs ?? autoTabs(len)} decimals={0} min={1} max={50} onCommit={(v) => apply((x) => setConnection(x, c.id, { tabs: v }))} testId="conn-tabs" />
            )}
            {c.kind === 'glue' && (
              <NumField label={t('conn.flap')} value={c.flap ?? autoFlap(d.material)} unit={mm} min={3} max={100} onCommit={(v) => apply((x) => setConnection(x, c.id, { flap: v }))} />
            )}
            {c.grown && isChild && (c.kind === 'tabslot' || c.offset > 0) && (
              <NumField label={t('conn.offset')} value={c.offset} unit={mm} min={0} max={2000} onCommit={(v) => apply((x) => setConnection(x, c.id, { offset: v }))} testId="conn-offset" />
            )}
            {c.kind === 'fold' && (
              <div className="field">
                <label htmlFor={`f-${c.id}`}>{t('conn.foldDir')}</label>
                <select id={`f-${c.id}`} value={c.foldDir} onChange={(e) => apply((x) => setConnection(x, c.id, { foldDir: e.target.value as 'valley' | 'mountain' }))}>
                  <option value="valley">{t('conn.valley')}</option>
                  <option value="mountain">{t('conn.mountain')}</option>
                </select>
              </div>
            )}
            {isChild && c.kind === 'lean' && !leanSupported(d, panelId) && (
              <div className="warn">
                <strong>{t('lean.unsupported')}</strong>
                <p className="note">{t('edge.leanHelp')}</p>
                <button onClick={() => apply((x) => addSideWalls(x, c.a.panelId, c.a.edge, c.angle, d.panels[panelId].h))} data-testid="insp-add-side-walls">
                  {t('edge.addSideWalls')}
                </button>
              </div>
            )}
            {!c.grown && (
              <button className="link" onClick={() => apply((x) => deleteConnection(x, c.id))}>
                {t('conn.delete')}
              </button>
            )}
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
            ? t('seam.cross', { panel: other.name })
            : mine.edge >= 0
              ? t('seam.corner', { edge: t(`edge.name.${mine.edge}` as 'edge.name.0'), panel: other.name })
              : t('seam.face', { panel: other.name });
        return <SeamRow key={i} label={label} overlap={s.overlapping} kinds={seamKinds(d.material, s.type)} onConnect={(k) => apply((x) => void connectSeam(x, s, k))} />;
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
      <h4>{t('div.title')}</h4>
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
    </div>
  );
}
