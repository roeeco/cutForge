// The one-time note for a first-time student who chose Start instead of the
// tour (milestone 43, replacing the getting-started tips): "New here? Take
// the 3-minute tour". Taking it starts the tour on a new design after the
// same confirm as New design; dismissing it sets `tourDone`.
import { useState } from 'react';
import { TOUR_DONE_KEY, tourDone, useStore, useT } from '../store/store';
import { translate } from '../i18n';

/** Start the tour on a new design, asking first (as New design does) when the current one has boards. */
export function startTourConfirmed(): boolean {
  const s = useStore.getState();
  if (s.design.order.length && !confirm(translate(s.lang, 'dlg.newConfirm'))) return false;
  s.startTour();
  return true;
}

export function TourNudge() {
  const t = useT();
  const touring = useStore((s) => !!s.tour);
  const [hidden, setHidden] = useState(tourDone);
  if (hidden || touring || tourDone()) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    setHidden(true);
  };
  return (
    <div className="hints tour-nudge" role="note" data-testid="tour-nudge">
      <p>{t('tour.nudge')}</p>
      <div className="hints-actions">
        <button className="link" onClick={dismiss} data-testid="tour-nudge-dismiss">
          {t('tour.nudgeDismiss')}
        </button>
        <button className="primary" onClick={() => startTourConfirmed() && setHidden(true)} data-testid="tour-nudge-go">
          {t('tour.take')}
        </button>
      </div>
    </div>
  );
}
