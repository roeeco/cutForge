// Sizes of a thing made from a template (milestone 107), as Guided names them: the card stand and a saved
// version-1 organiser. Each is a slider; nothing here is in src/templates.
import type { MsgKey } from '../i18n';

export type Control = { key: string; label: MsgKey; step?: number };

export const TEMPLATE_CONTROLS: Record<string, Control[]> = {
  stand: [
    { key: 'cardWidth', label: 'g.stand.cardWidth' },
    { key: 'cardThickness', label: 'g.stand.cardThickness', step: 0.5 },
    { key: 'angle', label: 'g.stand.lean' },
    { key: 'slots', label: 'g.stand.slots' },
    { key: 'baseDepth', label: 'g.stand.baseDepth' },
  ],
  organiser: [
    { key: 'width', label: 'g.org.width' },
    { key: 'depth', label: 'g.org.depth' },
    { key: 'height', label: 'g.org.height' },
    { key: 'dividersX', label: 'g.org.across' },
    { key: 'dividersY', label: 'g.org.frontBack' },
  ],
};
