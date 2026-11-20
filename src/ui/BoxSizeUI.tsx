// A box's sizes as the design states them (milestone 93): the switch on its
// card and the numbers its fields show and take.
import { useStore, useT } from '../store/store';
import { Segmented } from './NumField';
import { Gate } from '../easy/Gate';
import { boxSize, setBoxSize, type SizeAs } from '../model/boxSize';
import type { Design } from '../model/types';

/** The box whose base this board is (not a lid of its own), or null. */
export function boxOfBase(d: Design, panelId: string): string | null {
  const t = Object.values(d.trays ?? {}).find((x) => x.baseId === panelId && !x.lidOf);
  return t ? t.id : null;
}

/** The intents a box can be stated in: crease to crease only where it folds. */
export function sizeAsOptions(d: Design): SizeAs[] {
  return d.material.kind === 'plywood' ? ['outside', 'inside'] : ['outside', 'inside', 'crease'];
}

/** What a field of a box's base or tray shows, and what its commit does, in the design's intent. */
export function statedField(d: Design, trayId: string, k: 'w' | 'd' | 'h'): { value: number; label: 'insp.width' | 'insp.depth' | 'insp.height' | 'tray.height' | `size.${'w' | 'd' | 'h'}.${'inside' | 'crease'}` | null; commit: (x: Design, v: number) => void } {
  const as = d.sizeAs ?? 'outside';
  const s = boxSize(d, trayId, as)!;
  return { value: s[k], label: as === 'outside' ? null : `size.${k}.${as}`, commit: (x, v) => setBoxSize(x, trayId, { [k]: v }, as) };
}

export function SizeAsSwitch({ trayId }: { trayId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  if (!d.trays?.[trayId]) return null;
  const opts = sizeAsOptions(d);
  const cur = opts.includes(d.sizeAs ?? 'outside') ? (d.sizeAs ?? 'outside') : 'outside';
  return (
    <Gate f="size.as">
      <div className="subsection" data-testid="size-as" title={t('size.as.help')}>
        <Segmented
          label={t('size.as')}
          value={cur}
          options={opts.map((o) => ({ value: o, label: t(`size.as.${o}`), testId: `size-as-${o}` }))}
          onChange={(v) =>
            apply((x) => {
              if (v === 'outside') delete x.sizeAs;
              else x.sizeAs = v;
            })
          }
        />
      </div>
    </Gate>
  );
}
