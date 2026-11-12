// The top bar while the sketch view is open (SKETCH_OVERHAUL.md §6.3): Extrude |
// Revolve, the sketch's own undo and redo, Cancel and Finish sketch.
import { useStore, useT } from '../store/store';
import { Icon } from './icons';
import { finishBlock } from '../sculpt/session';

/** Cancel the sketch, asking once when it was changed. */
export function cancelSketchAsked(t: ReturnType<typeof useT>) {
  const k = useStore.getState().sketch;
  if (!k) return;
  const dirty = JSON.stringify(k.draft) !== JSON.stringify(k.start);
  if (dirty && !confirm(t('sketch.discard'))) return;
  useStore.getState().cancelSketch();
}

export function SketchTopBar() {
  const t = useT();
  const k = useStore((s) => s.sketch);
  const shape = useStore((s) => (s.sketch?.shapeId ? s.design.sculpt?.shapes[s.sketch.shapeId] : null));
  if (!k) return null;
  const st = useStore.getState;
  const block = finishBlock(k.draft, k.mode, shape);
  return (
    <>
      <div className="seg sk-mode" role="radiogroup" aria-label={t('sketch.mode')} data-testid="sketch-mode">
        {(['extrude', 'revolve'] as const).map((m) => (
          <button key={m} role="radio" aria-checked={k.mode === m} className={k.mode === m ? 'on' : ''} onClick={() => st().setSketch({ mode: m })} data-testid={`sketch-mode-${m}`}>
            {t(m === 'extrude' ? 'sketch.extrude' : 'sketch.revolve')}
          </button>
        ))}
      </div>
      <button className="ghost icon-btn" onClick={() => st().sketchUndo()} disabled={!k.past.length && !k.txn} title="Ctrl+Z" aria-label={t('sketch.undo')} data-testid="sketch-undo">
        <Icon name="undo" />
      </button>
      <button className="ghost icon-btn" onClick={() => st().sketchRedo()} disabled={!k.future.length} title="Ctrl+Shift+Z" aria-label={t('sketch.redo')} data-testid="sketch-redo">
        <Icon name="redo" />
      </button>
      <button onClick={() => cancelSketchAsked(t)} data-testid="sketch-cancel">
        {t('sketch.cancel')}
      </button>
      <button className="primary" onClick={() => st().finishSketch()} disabled={!!block} title={block === 'crossesAxis' ? t('sketch.crossesAxis') : block ? t('sketch.empty') : undefined} data-testid="sketch-finish">
        <Icon name="check" /> {t('sketch.finish')}
      </button>
    </>
  );
}
