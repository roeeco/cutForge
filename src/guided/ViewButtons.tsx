// Guided's view buttons (milestone 105): look around (the opening view), from above, closer and further.
// Dragging empty space turns the view; nothing pans.
import { requestCamera, zoomStage } from '../tour/stage';
import { useStore, useT } from '../store/store';
import { Icon } from '../ui/icons';
import { aboveCamera, guidedCamera } from './camera';

export function ViewButtons() {
  const t = useT();
  const b = (id: string, icon: string, label: 'g.view.around' | 'g.view.above' | 'g.view.zoomIn' | 'g.view.zoomOut', fn: () => void) => (
    <button className="g-view-btn" onClick={fn} title={t(label)} aria-label={t(label)} data-testid={`g-view-${id}`}>
      <Icon name={icon} />
    </button>
  );
  return (
    <div className="g-views card" role="group" aria-label={t('g.view.label')} data-testid="g-views">
      {b('around', 'persp', 'g.view.around', () => requestCamera(...guidedCamera(useStore.getState().design)))}
      {b('above', 'above', 'g.view.above', () => requestCamera(...aboveCamera(useStore.getState().design)))}
      {b('in', 'plus', 'g.view.zoomIn', () => zoomStage(0.8))}
      {b('out', 'minus', 'g.view.zoomOut', () => zoomStage(1.25))}
    </div>
  );
}
