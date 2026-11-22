// Stage 2's card (milestones 126, 127; SHAPES_TO_DIELINES_PLAN.md §5): only to refine what
// one click made. The material (a change re-chooses every joint not set by hand), what was
// made, *Fold it*'s seams, pieces and faces around a curve, the problems with their fixes,
// and *Make again*.
import { useEffect, useMemo } from 'react';
import { useStore, useT } from '../store/store';
import type { MsgKey } from '../i18n';
import type { Design, MakeSpec } from '../model/types';
import { Segmented, NumField } from '../ui/NumField';
import { Icon } from '../ui/icons';
import { buildPieces } from '../model/pieces';
import { canMake, facetCounts, facetsFor, LID_OPEN, madeWith, makeNow, matKey, polyOf, shapesChanged, useMake } from './run';
import { detach, rechooseJoints, type MakeIssue } from '../model/reassemble';
import { MATERIALS } from '../model/materials';
import { StepsSection } from './Steps';
import { kernelNow } from '../sculpt/kernel';
import { DEFAULT_FACETS } from '../sculpt/polyhedron';
import { askConfirm } from '../ui/AppDialog';



/** The material's name as the top bar names it. */
function useMatName(): string {
  const t = useT();
  const m = useStore((s) => s.design.material);
  const b = MATERIALS.find((x) => x.id === m.id);
  return b ? t(b.nameKey as 'mat.ply3') : t('mat.customNamed', { mm: m.thickness });
}

/** One problem and its fix buttons. */
function Problem({ issue, spec }: { issue: MakeIssue; spec: MakeSpec }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const redo = (over: Partial<MakeSpec>) => void makeNow(spec.as, over, { play: false });
  const fewer = () => {
    const f = facetsFor(spec, d.material).set ?? Math.max(DEFAULT_FACETS.boards, ...facetCounts(d, spec));
    return redo({ facets: { ...(spec.facets ?? {}), [spec.as === 'fold' ? 'card' : 'boards']: Math.max(4, f - 4) } });
  };
  let text = '';
  const fixes: { key: MsgKey; run: () => void }[] = [];
  if (issue.kind === 'empty') text = t('make.p.empty');
  else if (issue.kind === 'noLast') {
    text = t('make.p.noLast');
    fixes.push({ key: 'make.fix.fold', run: () => void makeNow('fold', {}) });
  } else if (issue.kind === 'holeWall') text = t('make.p.holeWall', { n: issue.n });
  else if (issue.kind === 'overlap') {
    text = t('make.p.overlap');
    fixes.push({ key: 'make.fix.cutThere', run: () => redo({ edges: { ...(spec.edges ?? {}), ...Object.fromEntries(issue.edges.map((e) => [e, 'cut' as const])) } }) });
  }
  else if (issue.kind === 'corner') {
    text = t('make.p.corner', { deg: Math.round(issue.dihedral) });
    if (d.material.kind === 'corrugated') fixes.push({ key: 'make.fix.glue', run: () => redo({ joints: { ...(spec.joints ?? {}), [issue.edge]: 'glue' } }) });
    fixes.push({ key: 'make.fix.fold', run: () => void makeNow('fold', {}) });
    fixes.push({ key: 'make.fix.fewer', run: fewer });
  } else if (issue.kind === 'unfold') {
    const u = issue.issue;
    if (u.kind === 'split') text = t(u.why === 'sheet' ? 'make.p.splitSheet' : u.why === 'fixed' ? 'make.p.splitFixed' : 'make.p.split', { n: u.n });
    else if (u.kind === 'faceTooBig') {
      text = t('make.p.faceTooBig');
      fixes.push({ key: 'make.fix.smaller', run: () => scaleShapes(0.8) });
    } else if (u.kind === 'flapDropped') {
      text = t('make.p.flap');
      fixes.push({ key: 'make.fix.tabs', run: () => redo({ joints: { ...(spec.joints ?? {}), [u.edge]: 'tabslot' } }) });
      fixes.push({ key: 'make.fix.cutNext', run: () => redo({ edges: { ...(spec.edges ?? {}), [u.edge]: 'fold' } }) });
    } else text = t('make.p.fixedFold');
  } else {
    const p = issue.issue;
    if (p.kind === 'tooMany') {
      text = t('make.p.tooMany', { n: p.n ?? 0 });
      fixes.push({ key: 'make.fix.fewer', run: fewer });
    } else if (p.kind === 'tiny' || p.kind === 'sliver') {
      text = t(p.kind === 'tiny' ? 'make.p.tiny' : 'make.p.sliver');
      fixes.push({ key: 'make.fix.fewer', run: fewer });
    } else text = t('make.p.open');
  }
  return (
    <li data-testid="make-problem" data-kind={issue.kind === 'unfold' || issue.kind === 'poly' ? issue.issue.kind : issue.kind}>
      <span dir="auto">{text}</span>
      {fixes.length > 0 && (
        <span className="row-buttons">
          {fixes.map((f) => (
            <button key={f.key} className="link" onClick={f.run} data-testid={`make-fix-${f.key.split('.').pop()}`}>
              {t(f.key)}
            </button>
          ))}
        </span>
      )}
    </li>
  );
}

/** Scale every shape about the floor's middle (the fix for a face larger than the sheet). */
function scaleShapes(k: number) {
  const st = useStore.getState();
  const as = st.design.make?.as;
  st.apply((d) => {
    for (const s of Object.values(d.sculpt?.shapes ?? {})) {
      if (s.size) s.size = s.size.map((v) => v * k) as typeof s.size;
      s.at = s.at.map((v) => v * k) as typeof s.at;
      if (s.height !== undefined) s.height *= k;
      if (s.tube !== undefined) s.tube *= k;
      if (s.sketch) for (const p of Object.values(s.sketch.pts)) (p.x *= k), (p.y *= k);
    }
  });
  if (as) void makeNow(as, {}, { play: false });
}

export function MakeCard() {
  const t = useT();
  const d = useStore((s) => s.design);
  const spec = d.make;
  const { issues, busy, changed, changedFor, lost } = useMake();
  const changedShape = shapesChanged(d);
  const matName = useMatName();
  // a change of material re-chooses every joint not set by hand (R6)
  const key = matKey(d);
  useEffect(() => {
    const st = useStore.getState();
    const dd = st.design;
    if (!dd.make || !kernelNow()) return;
    const was = madeWith.get(dd.id);
    if (was === undefined) return void madeWith.set(dd.id, key);
    if (was === key || !canMake(dd.make.as, dd.material)) return;
    const P = polyOf(dd, dd.make);
    if (!P) return;
    // the curves' automatic faces follow the material (milestone 188): other faces are made again, not re-chosen
    const made = new Set(dd.order.map((id) => dd.panels[id]?.src?.face).filter(Boolean));
    const now = Object.keys(P.faces).filter((f) => !(dd.make!.open ?? []).includes(f));
    if (now.length !== made.size || now.some((f) => !made.has(f))) {
      madeWith.set(dd.id, key);
      return void makeNow(dd.make.as, {}, { play: false });
    }
    let n = 0;
    st.apply((x) => void (n = rechooseJoints(x as Design, P)));
    madeWith.set(dd.id, key);
    useMake.setState({ changed: n, changedFor: useStore.getState().design });
  }, [key]);
  const pieces = useMemo(() => buildPieces(d).length, [d]);
  const counts = useMemo(() => (spec ? facetCounts(d, spec) : []), [d.sculpt, d.material, spec]);
  const curved = counts.length > 0;
  if (!spec) return null;
  const nFolds = Object.values(d.connections).filter((c) => c.seam && c.kind === 'fold').length;
  const nFlaps = Object.values(d.connections).filter((c) => c.kind === 'glue' || c.kind === 'lock').length;
  const wrongMaterial = !canMake(spec.as, d.material);
  const redo = (over: Partial<MakeSpec>) => void makeNow(spec.as, over, { play: false });
  const problems = issues.filter((i) => !(i.kind === 'unfold' && i.issue.kind === 'split'));
  return (
    <section data-testid="make-card">
      <div className="card-head">
        <h3>{t(spec.as === 'fold' ? 'make.foldedTitle' : 'make.boardsTitle')}</h3>
      </div>
      <button className="mat-pill" onClick={() => useStore.getState().set({ drawerOpen: true })} data-testid="make-material">
        <span className={`swatch ${d.material.kind}`} />
        <span className="mat-name">{matName}</span>
        <Icon name="chevDown" size={16} />
      </button>
      {changed !== null && changedFor === d && <p className="note" data-testid="make-changed">{t('make.changed', { n: changed })}</p>}
      {wrongMaterial && (
        <div className="combine-box" data-testid="make-wrong-material">
          <p className="note">{t(spec.as === 'fold' ? 'make.noFold' : 'make.noBoards')}</p>
          <button onClick={() => void makeNow(spec.as === 'fold' ? 'boards' : 'fold', {})}>{t(spec.as === 'fold' ? 'make.boards' : 'make.fold')}</button>
        </div>
      )}
      <p className="note" data-testid="make-summary">
        {spec.as === 'fold' ? t('make.summaryFold', { pieces, folds: nFolds, flaps: nFlaps }) : t('make.summaryBoards', { pieces })}
      </p>
      {spec.as === 'fold' && (
        <>
          <Segmented
            label={t('make.seams')}
            value={spec.seams ?? 'auto'}
            options={(['auto', 'glue', 'lock', 'tabslot'] as const).map((v) => ({ value: v, label: t(`make.seams.${v}`), testId: `make-seams-${v}` }))}
            onChange={(v) => redo({ seams: v === 'auto' ? undefined : (v as MakeSpec['seams']) })}
          />
          <Segmented
            label={t('make.pieces')}
            value={spec.prefer ?? 'pieces'}
            options={(['pieces', 'cuts'] as const).map((v) => ({ value: v, label: t(`make.prefer.${v}`), testId: `make-prefer-${v}` }))}
            onChange={(v) => redo({ prefer: v === 'pieces' ? undefined : 'cuts' })}
          />
        </>
      )}
      {curved && (
        <>
          <NumField
            label={t('make.facets')}
            value={facetsFor(spec, d.material).set ?? Math.max(...counts)}
            min={4}
            max={64}
            decimals={0}
            onCommit={(v) => redo({ facets: { ...(spec.facets ?? {}), [spec.as === 'fold' ? 'card' : 'boards']: Math.round(v) } })}
            testId="make-facets"
          />
          {facetsFor(spec, d.material).set === undefined ? (
            <p className="note" data-testid="make-facets-auto">{t('make.facetsAuto', { n: counts.join(', ') })}</p>
          ) : (
            <button
              className="link"
              onClick={() => {
                const f = { ...(spec.facets ?? {}) };
                delete f[spec.as === 'fold' ? 'card' : 'boards'];
                redo({ facets: f });
              }}
              data-testid="make-facets-reset"
            >
              {t('make.facetsReset')}
            </button>
          )}
        </>
      )}
      {/* milestone 130: openings and a lid by a cut */}
      {(spec.open ?? []).filter((k) => !LID_OPEN.includes(k)).length > 0 && (
        <div className="make-open" data-testid="make-open">
          <p className="note">{t('make.openFaces', { n: (spec.open ?? []).filter((k) => !LID_OPEN.includes(k)).length })}</p>
          <button className="link" onClick={() => redo({ open: (spec.open ?? []).filter((k) => LID_OPEN.includes(k)) })} data-testid="make-close-all">
            {t('make.closeAll')}
          </button>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={!!spec.lid} onChange={(e) => redo({ lid: e.target.checked ? 20 : undefined })} data-testid="make-lid" /> {t('make.lid')}
      </label>
      {!!spec.lid && <NumField label={t('make.lidDepth')} value={spec.lid} unit={t('unit.mm')} min={2} onCommit={(v) => redo({ lid: v })} testId="make-lid-depth" />}
      {busy && <p className="note">{t('make.working')}</p>}
      {/* milestone 131: the seams in the order they close */}
      <StepsSection />
      {/* how the net was split is said, not listed as a problem: it cuts and folds as it is */}
      {issues.map((i, k) =>
        i.kind === 'unfold' && i.issue.kind === 'split' ? (
          <p key={k} className="note" data-testid="make-split">
            {t(i.issue.why === 'sheet' ? 'make.p.splitSheet' : i.issue.why === 'fixed' ? 'make.p.splitFixed' : 'make.p.split', { n: i.issue.n })}
          </p>
        ) : null,
      )}
      {problems.length > 0 && (
        <>
          <h4>{t('make.problems')}</h4>
          <ul className="make-problems">
            {problems.map((i, k) => (
              <Problem key={k} issue={i} spec={spec} />
            ))}
          </ul>
        </>
      )}
      {lost && (
        // milestone 129: what a remake could not keep, said once
        <p className="note warn" data-testid="make-lost">
          {t('make.lost', { n: lost.faces.length + lost.edges.length })}
        </p>
      )}
      {changedShape ? (
        <button className="primary" onClick={() => void makeNow(spec.as, {})} data-testid="make-update">
          {t('make.update')}
        </button>
      ) : (
        <button onClick={() => void makeNow(spec.as, {})} data-testid="make-again">
          {t('make.again')}
        </button>
      )}
      <button
        className="link"
        onClick={async () => {
          if (!(await askConfirm(t('make.detachAsk')))) return;
          useStore.getState().apply((x) => detach(x as Design));
        }}
        data-testid="make-detach"
      >
        {t('make.detach')}
      </button>
    </section>
  );
}
