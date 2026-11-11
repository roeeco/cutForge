// The last design known to be good (BUGFIX_PLAN B4): it solved and validated
// without throwing and the editor drew it. Autosave only saves such designs,
// so one that crashes is never saved to crash again on the next load, and the
// error screen can go back to it.
import type { Design } from '../model/types';

const bad = new WeakSet<Design>();
let lastGood: Design | null = null;

/** The editor could not draw this design (the error boundary caught a throw). */
export const markBad = (d: Design) => void bad.add(d);
export const isBad = (d: Design) => bad.has(d);
export const rememberGood = (d: Design) => void (lastGood = d);
export const lastGoodDesign = () => lastGood;
