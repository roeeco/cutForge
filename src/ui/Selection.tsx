// Inspector sections for several shapes at once, and for a shape's live array.
import { detailSel, useStore, useT } from '../store/store';
import { NumField, Stepper } from './NumField';
import { Icon } from './icons';
import { panelLabel } from '../model/names';
import { alignDetails, commonSurface, deleteDetails, distributeDetails, duplicateDetails, explodeArray, scaleDetails, setArray, type AlignMode, type DistributeMode } from '../model/edit';
import { findDetail, setText } from '../model/ops';
import { FONTS } from '../text/fonts';
import { detailBBox, detailInstances } from '../model/geometry';
import type { Detail } from '../model/types';

const ALIGN: AlignMode[] = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'];
const DIST: DistributeMode[] = ['hgap', 'vgap', 'hcenter', 'vcenter'];

export function MultiSelection({ ids }: { ids: string[] }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const found = ids.map((id) => findDetail(d, id)).filter((f) => !!f);
  const panels = [...new Set(found.map((f) => f!.panel.id))];
  const surface = commonSurface(d, ids);
  const one = panels.length === 1 ? d.panels[panels[0]] : null;
  const bbs = one ? found.map((f) => detailBBox(f!.detail)) : [];
  const box = bbs.length ? { minX: Math.min(...bbs.map((b) => b.minX)), maxX: Math.max(...bbs.map((b) => b.maxX)), minY: Math.min(...bbs.map((b) => b.minY)), maxY: Math.max(...bbs.map((b) => b.maxY)) } : null;
  const mm = t('unit.mm');
  return (
    <section data-testid="inspector-multi">
      <p className="kicker">{one ? t('multi.panel', { panel: panelLabel(d, one.id, t) }) : t('multi.panels', { n: panels.length })}</p>
      <div className="card-head">
        <h3>{t('multi.title', { n: ids.length })}</h3>
      </div>
      {box && (
        <>
          <h4 className="section-title">{t('multi.size')}</h4>
          <NumField
            label={t('insp.width')}
            value={box.maxX - box.minX}
            unit={mm}
            min={0.5}
            onCommit={(v) => apply((x) => scaleDetails(x, ids, { x: box.minX, y: box.minY }, v / (box.maxX - box.minX), 1))}
            testId="group-w"
          />
          <NumField
            label={t('insp.height')}
            value={box.maxY - box.minY}
            unit={mm}
            min={0.5}
            onCommit={(v) => apply((x) => scaleDetails(x, ids, { x: box.minX, y: box.minY }, 1, v / (box.maxY - box.minY)))}
            testId="group-h"
          />
        </>
      )}
      <h4>{t('multi.align')}</h4>
      {!surface && <p className="warn-text" data-testid="align-unavailable">{t('multi.differentPlanes')}</p>}
      <div className="btn-grid icons">
        {ALIGN.map((m) => (
          <button key={m} disabled={!surface} onClick={() => apply((x) => void alignDetails(x, ids, m))} data-testid={`align-${m}`} aria-label={t(`align.${m}`)} title={t(`align.${m}`)}>
            <Icon name={`align-${m}`} />
          </button>
        ))}
      </div>
      <h4>{t('multi.distribute')}</h4>
      {surface && ids.length < 3 && <p className="note">{t('multi.needThree')}</p>}
      <div className="btn-grid">
        {DIST.map((m) => (
          <button key={m} disabled={!surface || ids.length < 3} onClick={() => apply((x) => void distributeDetails(x, ids, m))} data-testid={`dist-${m}`}>
            {t(`dist.${m}`)}
          </button>
        ))}
      </div>
      <div className="btn-grid">
        <button
          onClick={() => {
            let copies: string[] = [];
            useStore.getState().apply((x) => void (copies = duplicateDetails(x, ids)));
            useStore.getState().select(detailSel(copies));
          }}
          title="Ctrl+D"
          data-testid="multi-duplicate"
        >
          {t('multi.duplicate')}
        </button>
        <button className="danger" onClick={() => apply((x) => deleteDetails(x, ids))}>
          {t('insp.delete')}
        </button>
      </div>
    </section>
  );
}

export function ArraySection({ dt }: { dt: Detail }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  const a = dt.array;
  const mm = t('unit.mm');
  const step = Math.round(Math.max(dt.w, dt.h) * 1.5);
  if (!a)
    return (
      <div className="subsection">
        <h4>{t('array.title')}</h4>
        <div className="btn-grid">
          <button onClick={() => apply((x) => setArray(x, dt.id, { nx: 3, ny: 1, dx: step, dy: step }))} data-testid="array-linear">
            {t('array.linear')}
          </button>
          <button onClick={() => apply((x) => setArray(x, dt.id, { nx: 3, ny: 2, dx: step, dy: step }))} data-testid="array-grid">
            {t('array.grid')}
          </button>
        </div>
      </div>
    );
  return (
    <div className="subsection" data-testid="array-section">
      <h4>
        {t('array.title')} · {t('array.count', { n: detailInstances(dt).length })}
      </h4>
      <Stepper label={t('array.nx')} value={a.nx} min={1} max={200} slider={false} onCommit={(v) => apply((x) => setArray(x, dt.id, { ...a, nx: v }))} testId="array-nx" />
      <Stepper label={t('array.ny')} value={a.ny} min={1} max={200} slider={false} onCommit={(v) => apply((x) => setArray(x, dt.id, { ...a, ny: v }))} testId="array-ny" />
      <NumField label={t('array.dx')} value={a.dx} unit={mm} onCommit={(v) => apply((x) => setArray(x, dt.id, { ...a, dx: v }))} testId="array-dx" />
      <NumField label={t('array.dy')} value={a.dy} unit={mm} onCommit={(v) => apply((x) => setArray(x, dt.id, { ...a, dy: v }))} testId="array-dy" />
      <p className="note">{t('array.note')}</p>
      <div className="btn-grid">
        <button
          onClick={() => {
            let all: string[] = [];
            useStore.getState().apply((x) => void (all = explodeArray(x, dt.id)));
            useStore.getState().select(detailSel(all));
          }}
          data-testid="array-explode"
        >
          {t('array.explode')}
        </button>
        <button onClick={() => apply((x) => setArray(x, dt.id, null))}>{t('array.remove')}</button>
      </div>
    </div>
  );
}

export function TextFields({ id, text }: { id: string; text: { value: string; font: string; size: number } }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  return (
    <div data-testid="text-fields">
      <div className="field column">
        <label htmlFor="txt-value">{t('text.value')}</label>
        <textarea
          id="txt-value"
          dir="auto"
          rows={2}
          value={text.value}
          data-testid="text-value"
          onChange={(e) => useStore.getState().preview((x) => setText(x, id, { value: e.target.value }))}
          onBlur={() => useStore.getState().commit()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="field">
        <label htmlFor="txt-font">{t('text.font')}</label>
        <select id="txt-font" value={text.font} onChange={(e) => apply((x) => setText(x, id, { font: e.target.value }))} data-testid="text-font">
          {FONTS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.name }}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <NumField label={t('text.size')} value={text.size} unit={t('unit.mm')} min={1} max={500} onCommit={(v) => apply((x) => setText(x, id, { size: v }))} testId="text-size" />
      <p className="note">{t('text.opNote')}</p>
    </div>
  );
}
