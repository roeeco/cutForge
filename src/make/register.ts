// The two outcomes made of boards (milestones 126, 127): registered with the shape stage
// when a sculpture opens, so the stage bar's *Fold it* and *Build from boards* work.
// They add no piece hooks: what they make are the design's own boards.
import { registerOutcomeUi } from '../sculpt/outcomes';
import { MakeCard } from './MakeCard';
import { makeNow } from './run';

const Nothing = () => null;
registerOutcomeUi({ id: 'fold', nameKey: 'make.fold', Layer: Nothing, Card: MakeCard, load: () => Promise.resolve(), make: () => void makeNow('fold') });
registerOutcomeUi({ id: 'boards', nameKey: 'make.boards', Layer: Nothing, Card: MakeCard, load: () => Promise.resolve(), make: () => void makeNow('boards') });
