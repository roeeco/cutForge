// A made board's own section (milestone 130): leave its face open. On card the edges round
// an open face are cut and get no flap; on boards its corners go. Shown on the board's card
// in stage 2, under the Workshop's own sections.
import { useStore, useT } from '../store/store';
import { makeNow } from './run';

export function MadeFaceSection({ panelId }: { panelId: string }) {
  const t = useT();
  const face = useStore((s) => s.design.panels[panelId]?.src?.face);
  const spec = useStore((s) => s.design.make);
  if (!face || !spec) return null;
  return (
    <div className="subsection" data-testid="made-face-section">
      <button onClick={() => void makeNow(spec.as, { open: [...(spec.open ?? []), face] }, { play: false })} data-testid="made-leave-open">
        {t('make.leaveOpen')}
      </button>
    </div>
  );
}
