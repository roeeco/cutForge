// Build (milestone 107, GUIDED_MODE.md §3.3): the side sheet and the add bar of step 1. The stage's arrows,
// grips and spaces are in GuidedLayer. Every action applies at once as one undo step; nothing waits for ✓.
import { useMemo, useState } from 'react';
import { useStore, useT } from '../../store/store';
import type { Design } from '../../model/types';
import { isDivider } from '../../model/dividers';
import { newId } from '../../model/ops';
import { setAllJoints } from '../../model/ops';
import { groupKinds, groupShown, type JointGroup } from '../../model/jointDefaults';
import { bestCell, contentFit, inCell, objectById, OBJECTS } from '../../easy/objects';
import { workshopOnly, setMode } from '../../easy/mode';
import { regenerate, templateById } from '../../templates/registry';
import { choose } from '../../sentence/resolve';
import type { LidChoice } from '../../easy/lid';
import { PictureChoice } from '../../ui/Pictures';
import { CartonBottom } from '../../ui/LidUI';
import { Icon } from '../../ui/icons';
import { fmtNum, type MsgKey } from '../../i18n';
import { boxTrayOf, canSplit, kindOf, largestSpace, lidOf, lidWhyNot, removeDivider, setLid, spaces, splitDirFor, splitSpace, type SplitDir } from '../box';
import { fitContent, fitInPlace } from '../fit';
import { TEMPLATE_CONTROLS } from '../templateControls';
import { reassemble } from '../../model/reassemble';
import { solidPoly, SOLID_LIMITS } from '../../model/solids';
import { ObjectPic } from '../pictures';
import { SideSheet } from '../SideSheet';
import { AddBar } from '../AddBar';
import { guidedApply } from '../apply';
import { Demo, DemoButton, useDemo } from '../Demo';

const note = (key: MsgKey, vars?: Record<string, string | number>) => useStore.setState({ guidedNote: { key, vars, at: Date.now() } });

/** Split a space (or the largest) and select the divider made; says why when it cannot. */
function split(i: number | null, dir?: SplitDir) {
  const st = useStore.getState();
  const ks = spaces(st.design);
  const k = i !== null && ks[i] ? ks[i] : largestSpace(st.design);
  if (!k) return;
  const way = dir ?? (canSplit(st.design, k, splitDirFor(k)) ? splitDirFor(k) : splitDirFor(k) === 'sideToSide' ? 'frontToBack' : 'sideToSide');
  if (!canSplit(st.design, k, way)) return note('g.split.tooSmall');
  guidedApply((d) => void splitSpace(d as Design, k, way));
  useStore.setState({ guidedSpace: null });
}

function Lots({ d, space }: { d: Design; space: number | null }) {
  const t = useT();
  const ks = spaces(d);
  const lots = (d.contents ?? []).filter((c) => space === null || (ks[space] && inCell(ks[space], c)));
  if (!lots.length) return null;
  return (
    <ul className="g-lots" data-testid="g-lots">
      {lots.map((c) => {
        const f = contentFit(d, c);
        const more = Math.max(f.need.w, f.need.d, f.need.h);
        return (
          <li key={c.id} className={f.ok ? 'ok' : 'need'} data-testid={`g-lot-${c.object}`} data-ok={f.ok}>
            <ObjectPic id={c.object} size={32} />
            <span className="g-lot-name">
              {c.count ?? 1} × {t(objectById(c.object).key)}
              <small data-testid={`g-lot-${c.object}-fit`}>{f.ok ? t('g.fit.ok') : t('g.fit.need', { n: fmtNum(more) })}</small>
            </span>
            <span className="g-lot-count">
              <button className="ghost" aria-label={t('g.lot.fewer')} onClick={() => guidedApply((x) => void (x.contents!.find((y) => y.id === c.id)!.count = Math.max(1, (c.count ?? 1) - 1)))} data-testid={`g-lot-${c.object}-less`}>
                <Icon name="minus" />
              </button>
              <button className="ghost" aria-label={t('g.lot.more')} onClick={() => guidedApply((x) => void (x.contents!.find((y) => y.id === c.id)!.count = (c.count ?? 1) + 1))} data-testid={`g-lot-${c.object}-more`}>
                <Icon name="plus" />
              </button>
            </span>
            {!f.ok && (
              <button
                className="primary g-fit"
                onClick={() => {
                  const st = useStore.getState();
                  if (!fitContent(st.design, c.id)) return note('g.fit.noSheet');
                  guidedApply((x) => void fitInPlace(x as Design, c.id));
                }}
                data-testid={`g-fit-${c.object}`}
              >
                {t('g.fit.make')}
              </button>
            )}
            <button className="ghost" aria-label={t('g.lot.remove')} title={t('g.lot.remove')} onClick={() => guidedApply((x) => void (x.contents = x.contents!.filter((y) => y.id !== c.id)))} data-testid={`g-lot-${c.object}-remove`}>
              <Icon name="trash" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Put a lot of one object in the selected space, or the one it suits best. */
function addLot(object: string, space: number | null) {
  const st = useStore.getState();
  const d = st.design;
  const ks = spaces(d);
  const tray = boxTrayOf(d);
  if (!tray) return;
  const base = d.trays[tray].baseId;
  const o = objectById(object);
  const k = (space !== null && ks[space]) || bestCell(d, base, o, 1);
  if (!k) return;
  guidedApply((x) => {
    x.contents = [...(x.contents ?? []), { id: newId('o'), object, baseId: base, x: (k.x0 + k.x1) / 2, y: (k.y0 + k.y1) / 2, count: 1 }];
  });
}

/** A ready shape's sizes (milestone 128): width, height and sides; it is made again, its decorations kept by face. */
function SolidSliders({ d }: { d: Design }) {
  const t = useT();
  const so = d.make?.solid;
  if (!so) return null;
  const lim = SOLID_LIMITS[so.kind];
  const set = (k: 'w' | 'h' | 'n', v: number) => {
    const next = { ...so, [k]: v };
    guidedApply((x) => void reassemble(x as Design, solidPoly(next), { ...x.make!, as: 'fold', solid: next }));
  };
  const rows: { k: 'w' | 'h' | 'n'; label: MsgKey; min: number; max: number; step: number }[] = [
    { k: 'w', label: 'g.solid.width', min: lim.w[0], max: lim.w[1], step: 5 },
    { k: 'h', label: 'g.solid.height', min: lim.h[0], max: lim.h[1], step: 5 },
    { k: 'n', label: 'g.solid.sides', min: lim.n[0], max: lim.n[1], step: 1 },
  ];
  return (
    <div className="subsection" data-testid="g-solid">
      {rows.map((r) => (
        <label key={r.k} className="g-slider">
          <span>{t(r.label)}</span>
          <input type="range" min={r.min} max={r.max} step={r.step} value={so[r.k]} onChange={(e) => set(r.k, Number(e.target.value))} data-testid={`g-solid-${r.k}`} />
          <b dir="ltr">{r.k === 'n' ? so.n : `${so[r.k]} ${t('unit.mm')}`}</b>
        </label>
      ))}
    </div>
  );
}

function TemplateSliders({ d }: { d: Design }) {
  const t = useT();
  const tpl = d.template && templateById(d.template.id);
  const [why, setWhy] = useState(false);
  if (!tpl || !d.template) return null;
  const params = d.template.params;
  const set = (key: string, v: number | string) => {
    const st = useStore.getState();
    const c = choose(tpl, st.design.material, params, key, v);
    if ('refused' in c) return setWhy(true);
    setWhy(false);
    const r = regenerate(st.design, c.params);
    guidedApply((x) => void Object.assign(x, JSON.parse(JSON.stringify(r.design))));
  };
  return (
    <div className="subsection" data-testid="g-template">
      {(TEMPLATE_CONTROLS[tpl.id] ?? []).map((c) => {
        const p = tpl.params.find((x) => x.key === c.key);
        if (!p) return null;
        const v = params[c.key];
        if (p.type === 'choice') {
          const opts = p.options.map((o) => o.value);
          const i = Math.max(0, opts.indexOf(v as never));
          return (
            <label key={c.key} className="g-slider">
              <span>{t(c.label)}</span>
              <input type="range" min={0} max={opts.length - 1} step={1} value={i} onChange={(e) => set(c.key, opts[Number(e.target.value)] as number | string)} data-testid={`g-tpl-${c.key}`} />
              <b dir="ltr">{String(v)}</b>
            </label>
          );
        }
        const num = p as { min: number; max: number };
        return (
          <label key={c.key} className="g-slider">
            <span>{t(c.label)}</span>
            <input type="range" min={num.min} max={num.max} step={c.step ?? 1} value={Number(v)} onChange={(e) => set(c.key, Number(e.target.value))} data-testid={`g-tpl-${c.key}`} />
            <b dir="ltr">{fmtNum(Number(v))}</b>
          </label>
        );
      })}
      {why && <p className="note warn-text">{t('g.tpl.refused')}</p>}
    </div>
  );
}

function MoreAboutBox({ d }: { d: Design }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const paper = d.material.kind !== 'plywood';
  const list = (group: JointGroup, label: string) => {
    const kinds = groupKinds(d, group);
    const cur = groupShown(d, group);
    if (!kinds.length) return null;
    return (
      <label className="field">
        <span>{label}</span>
        <select value={cur ?? ''} onChange={(e) => e.target.value && guidedApply((x) => void setAllJoints(x as Design, group, e.target.value as never))} data-testid={`g-joints-${group}`}>
          {cur === undefined && (
            <option value="" disabled>
              {t('g.joints.mixed')}
            </option>
          )}
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(`conn.${k}` as 'conn.fold')}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <div className="subsection g-more" data-testid="g-more">
      <button className="collapse-head" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="g-more-toggle">
        <Icon name={open ? 'chevDown' : 'chevRight'} size={14} /> {t('g.more.title')}
      </button>
      {open && (
        <div className="section-body">
          <p className="note">{t('g.more.corners')}</p>
          {paper && groupKinds(d, 'corner').includes('lock') && (
            <label className="check">
              <input type="checkbox" checked={groupShown(d, 'corner') === 'lock'} onChange={(e) => guidedApply((x) => void setAllJoints(x as Design, 'corner', e.target.checked ? 'lock' : (groupKinds(d, 'corner').find((k) => k !== 'lock') ?? 'glue')))} data-testid="g-no-glue" />
              {t('g.more.noGlue')}
            </label>
          )}
          {list('base', t('g.more.base'))}
          {list('corner', t('g.more.sides'))}
        </div>
      )}
    </div>
  );
}

export function Build() {
  const t = useT();
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.selection);
  const spaceSel = useStore((s) => s.guidedSpace);
  const [panel, setPanel] = useState<'lid' | 'inside' | null>(null);
  const [demo, setDemo] = useDemo();
  const kind = useMemo(() => kindOf(d), [d]);
  const ks = useMemo(() => (kind === 'box' ? spaces(d) : []), [d, kind]);
  const space = spaceSel !== null && ks[spaceSel] ? spaceSel : null;
  const divider = sel?.kind === 'panel' && isDivider(d.panels[sel.id]) ? sel.id : null;
  const tray = boxTrayOf(d);

  if (kind === 'more') {
    const workshop = d.order.some((id) => workshopOnly(d, id));
    return (
      <SideSheet>
        <div className="subsection" data-testid="g-made-more">
          <p className="note">{t('g.madeWithMore')}</p>
          <button onClick={() => setMode(workshop ? 'workshop' : 'quick')} data-testid="g-open-more">
            {t(workshop ? 'g.openWorkshop' : 'g.openQuick')}
          </button>
        </div>
      </SideSheet>
    );
  }
  if (kind === 'template')
    return (
      <SideSheet>
        <TemplateSliders d={d} />
      </SideSheet>
    );
  if (kind === 'solid')
    return (
      <SideSheet>
        <SolidSliders d={d} />
      </SideSheet>
    );

  const k = space !== null ? ks[space] : null;
  const lid = lidOf(d);
  const isCarton = !!tray && d.trays[tray].base === 'open';
  return (
    <>
      <SideSheet>
        {divider && (
          <div className="subsection" data-testid="g-divider">
            <h4>{t('g.divider')}</h4>
            <button
              onClick={() => {
                guidedApply((x) => removeDivider(x as Design, divider));
                useStore.getState().select(null);
              }}
              data-testid="g-divider-remove"
            >
              <Icon name="trash" /> {t('g.divider.remove')}
            </button>
          </div>
        )}
        {k && (
          <div className="subsection" data-testid="g-space">
            <h4>
              {t('g.space')} <span className="g-dim" dir="ltr">{t('g.space.size', { w: fmtNum(Math.round((k.x1 - k.x0) * 10) / 10), d: fmtNum(Math.round((k.y1 - k.y0) * 10) / 10) })}</span>
            </h4>
            <PictureChoice
              label={t('g.split')}
              value={null}
              options={(['frontToBack', 'sideToSide'] as const).map((w) => ({
                value: w,
                label: t(w === 'sideToSide' ? 'g.split.sideToSide' : 'g.split.frontToBack'),
                pic: 'footRect' as const,
                testId: `g-split-${w}`,
                why: canSplit(d, k, w) ? undefined : t('g.split.tooSmall'),
              }))}
              onChange={(w) => split(space, w)}
              testId="g-split"
            />
            <Lots d={d} space={space} />
          </div>
        )}
        {panel === 'lid' && tray && (
          <div className="subsection" data-testid="g-lid">
            <PictureChoice<LidChoice>
              label={t('g.add.lid')}
              value={lid === 'flaps' ? 'hinged' : lid}
              options={(['none', 'liftoff', 'hinged'] as const).map((c) => {
                const why = lidWhyNot(d, c);
                return { value: c, label: t(`lid.kind.${c}`), pic: c === 'none' ? 'open' : c, testId: `g-lid-${c}`, why: why ? t(why) : undefined };
              })}
              onChange={(c) => guidedApply((x) => void setLid(x as Design, c))}
              testId="g-lid-pick"
            />
            {isCarton && <CartonBottom tray={d.trays[tray]} />}
          </div>
        )}
        {panel === 'inside' && (
          <div className="subsection" data-testid="g-inside">
            <p className="note">{t(space !== null ? 'g.inside.here' : 'g.inside.help')}</p>
            <div className="g-objects" role="group" aria-label={t('g.add.inside')}>
              {OBJECTS.filter((o) => o.id !== 'custom').map((o) => (
                <button key={o.id} onClick={() => addLot(o.id, space)} data-testid={`g-obj-${o.id}`}>
                  <ObjectPic id={o.id} />
                  <span>{t(o.key)}</span>
                </button>
              ))}
            </div>
            {space === null && <Lots d={d} space={null} />}
          </div>
        )}
        <MoreAboutBox d={d} />
      </SideSheet>
      <AddBar>
        <button onClick={() => split(space)} data-testid="g-add-divider">
          <Icon name="divider" />
          <span>{t('g.add.divider')}</span>
        </button>
        <button className={panel === 'lid' ? 'on' : ''} aria-pressed={panel === 'lid'} onClick={() => setPanel(panel === 'lid' ? null : 'lid')} data-testid="g-add-lid">
          <Icon name="closure" />
          <span>{t('g.add.lid')}</span>
        </button>
        <button className={panel === 'inside' ? 'on' : ''} aria-pressed={panel === 'inside'} onClick={() => setPanel(panel === 'inside' ? null : 'inside')} data-testid="g-add-inside">
          <Icon name="box" />
          <span>{t('g.add.inside')}</span>
        </button>
        <DemoButton onClick={() => setDemo(true)} />
      </AddBar>
      {demo && <Demo onClose={() => setDemo(false)} />}
    </>
  );
}
