// The editing views a card's part is seen in (milestone 140, REPORT.md §2.3): *Joints* and *Outlines* as one row of
// full-size buttons at the bottom of the right-hand card, next to what they act on. They were small toggles in the
// view cluster, where *Outlines* hung its label below the bar, and both stayed on unnoticed.
import { useStore, useT } from '../store/store';
import { shown, useFeature } from '../easy/features';
import { Icon } from './icons';

export function CardModes() {
  const t = useT();
  const prefs = useStore((s) => s.viewPrefs);
  const view = useStore((s) => s.view);
  const fJoints = shown(useFeature('joints'));
  const fOutline = shown(useFeature('outline.mode'));
  if (view !== '3d') return null;
  const set = useStore.getState().setPrefs;
  return (
    <div className="card card-modes" role="group" aria-label={t('view.modes')} data-testid="card-modes">
      <button className={prefs.joints ? 'on' : ''} aria-pressed={prefs.joints} onClick={() => set({ joints: !prefs.joints, ...(prefs.joints ? {} : { outlineMode: false }) })} title={t('view.jointsHelp')} data-testid="toggle-joints">
        <Icon name="finger" /> {t(fJoints ? 'view.jointsOn' : 'quick.howBuilt')}
      </button>
      {fOutline && (
        <button className={prefs.outlineMode ? 'on' : ''} aria-pressed={!!prefs.outlineMode} onClick={() => set({ outlineMode: !prefs.outlineMode, ...(prefs.outlineMode ? {} : { joints: false }) })} title={t('view.outlineModeHelp')} data-testid="toggle-outline">
          <Icon name="outlineEdit" /> {t(prefs.outlineMode ? 'outline.done' : 'view.outlineMode')}
        </button>
      )}
    </div>
  );
}
