// The waffle as an outcome of a sculpture (SKETCH_OVERHAUL.md §9.1): its stage-2
// layer, card and steps bar, registered when the waffle code loads.
import { registerOutcomeUi } from '../../sculpt/outcomes';
import { useStore } from '../../store/store';
import type { Design } from '../../model/types';
import { deleteSlice } from '../ops';
import { baseModel } from './model';
import { WaffleLayer } from './WaffleLayer';
import { WaffleCard } from './WaffleCard';
import { StepsBar } from './StepsLayer';
import { loadWaffle } from '../load';

registerOutcomeUi({
  id: 'waffle',
  nameKey: 'stage.waffle',
  Layer: WaffleLayer,
  Card: WaffleCard,
  Bar: StepsBar,
  load: loadWaffle,
  onDelete: () => {
    const s = useStore.getState();
    const sel = s.selection;
    const m = baseModel();
    if (sel?.kind !== 'slice' || !m) return;
    s.apply((d) => deleteSlice(d as Design, m, sel.family, sel.id));
    s.select(null);
  },
});
