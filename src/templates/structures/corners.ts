// The corners word (exploratory test report, the coffin box), shared by the boxes of boards whose outline has angled
// corners: kept within the outline, or rigid (`Tray.outsideCorners`). A module of its own: box.ts and boardOutlines.ts
// both use it, and each already imports the other's way.
import type { MaterialProfile } from '../../model/types';
import type { ParamDef, Params } from '../types';

/**
 * Rigid corners (exploratory test report, the coffin box): `strict` keeps every wall within the outline, and the square
 * ends leave the angled corners open; `rigid` lets the walls reach past them so the fingers fill them (`Tray.outsideCorners`),
 * a small nub standing proud to sand off. An add-on word: strict unless asked.
 */
export const cornersWord = (clean: (v: Params[string], p: Params, m: MaterialProfile) => boolean, when?: (p: Params, m: MaterialProfile) => boolean): ParamDef => ({
  key: 'corners', label: 'sen.corners', type: 'choice', default: 'strict', addon: { off: 'strict' },
  // rigid only where the box still builds clean (its nubs can meet a hinged lid's sides); `clean` is the template's
  // engine check, passed in so this module needs neither template
  allowed: (v, p, m) => v === 'strict' || clean(v, p, m),
  why: () => 'sen.why.engine',
  options: [
    { value: 'strict', label: 'sen.corners.strict', card: 'sen.corners.strictCard' },
    { value: 'rigid', label: 'sen.corners.rigid', card: 'sen.corners.rigidCard' },
  ],
  ...(when ? { when } : {}),
});
