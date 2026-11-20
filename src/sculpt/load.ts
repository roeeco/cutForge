// Load what a sculpture design needs (milestone 120): the shape kernel, then any
// outcome's own code registered by `registerOutcomeLoader` (*Fold it*, *Build from
// boards*). Box designs never call it, so they never download the kernel.
import { kernel } from './kernel';

const loaders: (() => Promise<unknown>)[] = [];
/** An outcome's code to load with the kernel (its stage-2 editor and hooks). */
export function registerOutcomeLoader(f: () => Promise<unknown>) {
  loaders.push(f);
}
export function loadShapes(): Promise<unknown> {
  return Promise.all([kernel(), ...loaders.map((f) => f())]);
}
