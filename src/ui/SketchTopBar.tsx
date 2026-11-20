// The top bar while the sketch view is open (SKETCH_OVERHAUL.md §6.3): the
// sketch's own undo and redo. The rest is on the sketch's card (SketchPanel).
import { useStore, useT } from '../store/store';
import { Icon } from './icons';
import { askConfirm } from './AppDialog';

/** Cancel the sketch, asking once when it was changed. */
export async function cancelSketchAsked(t: ReturnType<typeof useT>) {
  const k = useStore.getState().sketch;
  if (!k) return;
  const dirty = JSON.stringify(k.draft) !== JSON.stringify(k.start);
  if (dirty && !(await askConfirm(t('sketch.discard')))) return;
  useStore.getState().cancelSketch();
}

/** The top bar while sketching: the sketch's own undo and redo. Extrude | Revolve, Cancel and Finish are on the sketch's card. */
export function SketchTopBar() {
  const t = useT();
  const k = useStore((s) => s.sketch);
  if (!k) return null;
  const st = useStore.getState;
  return (
    <>
      <span className="sk-top-title" data-testid="sketch-title">
        <Icon name="polygon" size={16} /> {t(k.shapeId ? 'sketch.titleEdit' : 'sketch.titleNew')}
      </span>
      <button className="ghost icon-btn" onClick={() => st().sketchUndo()} disabled={!k.past.length && !k.txn} title="Ctrl+Z" aria-label={t('sketch.undo')} data-testid="sketch-undo">
        <Icon name="undo" />
      </button>
      <button className="ghost icon-btn" onClick={() => st().sketchRedo()} disabled={!k.future.length} title="Ctrl+Shift+Z" aria-label={t('sketch.redo')} data-testid="sketch-redo">
        <Icon name="redo" />
      </button>
    </>
  );
}
