// Quick build and Workshop (milestone 37, EASY_MODE.md): one table decides
// what each mode shows. Components ask `useFeature(f)` instead of checking the
// mode, so this table is the only place the split is made. Workshop shows
// everything; in Quick build a feature is shown, shown read-only, chosen by the
// app ('auto': the control is hidden and the default applies) or hidden.
import { createContext, useContext } from 'react';
import { useStore } from '../store/store';

export type Mode = 'quick' | 'workshop';
export type FeatureState = 'show' | 'readonly' | 'auto' | 'hide';

export const FEATURES = {
  /** The Workshop tool rail (Panel, shapes, polygon, text, import); Quick build has its five actions. */
  'rail.tools': 'hide',
  /** The operation dots (Add, Cut, Engrave, Score) and the through-cut switch; the shape card has Cut out / Engrave. */
  'rail.ops': 'hide',
  /** Score and Add as shape operations. */
  'op.scoreAdd': 'hide',
  /** Joint cards, *Joints (advanced)*, finger and tab counts, seam pills, meeting panels. */
  joints: 'auto',
  /** The settings card's *Joints* section (wall to base, corners): changeable in Quick build too. */
  'settings.joints': 'show',
  /** The settings card's *Snapping* section. */
  'settings.snapping': 'auto',
  /** The settings card's *Material and fit* section (its *Change material…* stays; read-only keeps the numbers). */
  'settings.material': 'readonly',
  /** The material drawer: the material can always be changed; read-only keeps its numbers (kerf, clearance, sheet) as they are. */
  drawer: 'readonly',
  /** The grow card's angle dial and Up/Down flip, side walls, part of the edge, adapt switch and ghost outline editing; Quick build grows at 90° on the whole edge, adapting. */
  'grow.advanced': 'auto',
  /** Editing a base's or wall's outline (corners and points). */
  outline: 'show',
  /** Curved outline points. */
  curves: 'hide',
  /** A bent wall's bend style, line spacing and face up (milestone 47); Quick build bends automatically. */
  bend: 'auto',
  /** Fold-over (double wall). */
  foldover: 'hide',
  /** A tray wall's own height. */
  'tray.ownHeight': 'hide',
  /** A tray's wall and corner joint lists. */
  'tray.joints': 'auto',
  /** *Wall it* on an open tray edge. */
  'tray.wallIt': 'show',
  /** *Keep in one piece* for a tray net that cannot lie flat (milestone 35). */
  'tray.keepWhole': 'hide',
  /** The move and turn gizmo. */
  gizmo: 'show',
  /** Live arrays of shapes. */
  arrays: 'show',
  /** Align and distribute. */
  align: 'show',
  /** Copies to cut. */
  copies: 'show',
  /** The fold slider. */
  foldSlider: 'show',
  /** The cut plan view. */
  cutplan: 'show',
  /** The export check list (Quick build has the Ready to cut badge, milestone 39). */
  exportCheck: 'hide',
  /** View settings. */
  viewSettings: 'show',
  /** A board's own material (milestone 36). */
  boardMaterial: 'hide',
  /** Construction panels and a placed panel's pose (milestone 28). */
  construction: 'hide',
  /** The hinge angle of a grown panel. */
  hinge: 'auto',
  /** The first-use hints (Quick build has missions or one line under the rail). */
  hints: 'hide',
} as const satisfies Record<string, FeatureState>;

export type Feature = keyof typeof FEATURES;

/** A card can show its Workshop version (*More…*): it renders inside this, set to 'workshop'. */
export const ModeOverride = createContext<Mode | null>(null);

/** The mode this part of the interface is in. */
export function useMode(): Mode {
  const own = useStore((s) => s.viewPrefs.mode ?? 'workshop');
  return useContext(ModeOverride) ?? own;
}

/** What a feature is in the current mode. */
export function useFeature(f: Feature): FeatureState {
  return useMode() === 'quick' ? FEATURES[f] : 'show';
}

/** The same outside React (event handlers, the stage). */
export function featureState(f: Feature, mode: Mode = useStore.getState().viewPrefs.mode ?? 'workshop'): FeatureState {
  return mode === 'quick' ? FEATURES[f] : 'show';
}

/** Is the feature's control shown (shown or read-only)? */
export const shown = (s: FeatureState) => s === 'show' || s === 'readonly';
