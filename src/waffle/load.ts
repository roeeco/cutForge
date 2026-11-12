// Load what a waffle design needs to make its pieces: the kernel and the waffle code (milestone 54).
import { kernel } from '../sculpt/kernel';

export function loadWaffle(): Promise<unknown> {
  return Promise.all([kernel(), import('./pieces')]);
}
