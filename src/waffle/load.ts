// Load what a waffle design needs to make its pieces: the kernel and the waffle code (milestone 54).
import { kernel } from '../sculpt/kernel';

export function loadWaffle(): Promise<unknown> {
  // its pieces, and its stage-2 editor (registered with the sculpture's outcomes)
  return Promise.all([kernel(), import('./pieces'), import('./ui/register')]);
}
