// Warnings that do not stop a cut (shown as notes, not as things to fix). Its own module so the
// template structures can ask for it without importing the fixes (which import the templates).
// milestone 184: a board split with puzzle keys (asked for) is a note
export const NOTE_KEYS = new Set(['val.split', 'val.bevel', 'val.keyed']);
