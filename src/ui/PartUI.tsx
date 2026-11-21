// Parts (milestone 183): a part's own sizes on its card, in place of its box's width and height (its sizes draw it).
import { useStore, useT } from '../store/store';
import { NumField, Stepper } from './NumField';
import { partDef, partParams, type PartSpec } from '../model/parts';
import { partToArray, updatePart } from '../model/ops';
import { detailSel } from '../store/store';
import type { MsgKey } from '../i18n';

export function PartFields({ id, part }: { id: string; part: PartSpec }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  const def = partDef(part.kind);
  const q = partParams(part);
  const set = (k: string, v: number | string) => apply((x) => updatePart(x, id, { [k]: v }));
  const unit = (u?: 'mm' | 'deg') => (u === 'deg' ? t('unit.deg') : u === 'mm' ? t('unit.mm') : undefined);
  return (
    <div data-testid="part-fields" data-part={part.kind}>
      {def.params.map((p) => {
        // a knob's flat only matters for a D bore; a bore's shape only when there is a bore
        if (p.key === 'flat' && q.boreKind !== 'dflat') return null;
        if (p.key === 'boreKind' && !(Number(q.bore) >= 1)) return null;
        if (p.key === 'height' && part.kind === 'holes' && q.area === 'circle') return null;
        const label = part.kind === 'holes' && p.key === 'width' && q.area === 'circle' ? t('part.diameter') : t(p.label);
        if (p.type === 'choice')
          return (
            <div className="field" key={p.key}>
              <label htmlFor={`part-${id}-${p.key}`}>{label}</label>
              <select id={`part-${id}-${p.key}`} value={String(q[p.key])} onChange={(e) => set(p.key, e.target.value)} data-testid={`part-${p.key}`}>
                {p.options!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
            </div>
          );
        if (p.type === 'int') return <Stepper key={p.key} label={label} value={Number(q[p.key])} min={p.min} max={p.max} onCommit={(v) => set(p.key, v)} testId={`part-${p.key}`} />;
        return <NumField key={p.key} label={label} value={Number(q[p.key])} unit={unit(p.unit)} min={p.min} max={p.max} decimals={p.step !== undefined && p.step < 0.5 ? 2 : 1} onCommit={(v) => set(p.key, v)} testId={`part-${p.key}`} />;
      })}
      <p className="note">{t('insp.partNote')}</p>
      {part.kind === 'holes' && q.grid === 'square' && q.area === 'rect' && (
        <button
          className="ghost"
          onClick={() => {
            let made: string | null = null;
            apply((x) => void (made = partToArray(x, id)));
            if (made) useStore.getState().select(detailSel([made]));
          }}
          data-testid="part-to-array"
        >
          {t('insp.partArray')}
        </button>
      )}
    </div>
  );
}

/** A part's name on its card. */
export const partTitle = (part: PartSpec): MsgKey => partDef(part.kind).key;
