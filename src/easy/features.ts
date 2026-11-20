// Quick build and Workshop (milestone 37, EASY_MODE.md): one table decides
// what each mode shows. Components ask `useFeature(f)` instead of checking the
// mode, so this table is the only place the split is made. Workshop shows
// everything; in Quick build a feature is shown, shown read-only, chosen by the
// app ('auto': the control is hidden and the default applies) or hidden.
import { createContext, useContext } from 'react';
import { useStore } from '../store/store';

/** The three levels (milestone 105): Guided, Quick build, Workshop. */
export type Mode = 'guided' | 'quick' | 'workshop';
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
  /** A printed plan of the pieces at a stated scale (milestone 90); Quick build shows it. */
  'export.spec': 'show',
  /** How a box's sizes are stated (milestone 93): *Outside · Inside · Crease to crease* on its card; Quick build hides the switch (its sizes follow the design's choice). */
  'size.as': 'hide',
  /** Sizes of a design (milestone 88); Quick build hides them. */
  sizes: 'hide',
  /** Names and sizes on the GUIDE layer of the file (milestone 89); Quick build leaves it off. */
  'export.annotations': 'auto',
  /** How a fold's crease is cut: a score, a perforation, a cut-crease (milestone 85). */
  crease: 'auto',
  'grow.advanced': 'auto',
  /** Editing outlines in the 2D view, double-clicked into (milestone 104); Quick build's shapes stay move, resize, turn. */
  edit2d: 'hide',
  /** The 2D transform frame's side handles, size pills and *Keep proportions* (milestone 103); Quick build keeps corners and the turn knob. */
  'transform.sides': 'hide',
  /** Outline mode (milestone 101): a stage switch beside *Joints*; every editable board's points straight away. Quick build hides it. */
  'outline.mode': 'hide',
  /** Editing a base's or wall's outline (corners and points). */
  outline: 'show',
  /** Curved outline points. */
  curves: 'hide',
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
  // ---- milestones 61–72 and LIDS_LINES_PROJECTS_PLAN.md §10.5 (milestone 73) ----
  /** A box's *Lid* section (lid, style, open), and a folded lid's closure style (PACKAGING_PLAN.md decision 8). */
  lid: 'show',
  /** *Arched* and *Fixed* lids; a closure's lip, dust flaps and thumb notch. */
  'lid.advanced': 'auto',
  /** A tray's *Base*, *Top* and *Bottom* lists (68): *Kind* and *Lid* replace them; a carton's *Bottom* shows as pictures. */
  'tray.ends': 'hide',
  /** *Rounded corners* join, *Closing seam* (64), *Curved walls held to the base by* (65). */
  'tray.corners': 'auto',
  /** *Bend radius*, *Pattern* and *Lines* of a fold (63, 66). */
  bend: 'auto',
  /** *Add a flap* on a free edge (67). */
  edgeFlap: 'hide',
  /** A flap's shape pictures, fold angle, tapers, radius and hang hole (112). */
  'flap.shape': 'hide',
  /** The welcome screen's *Sentence · Cards* switch and its card grid of named styles (C1). */
  'start.cards': 'show',
  /** The cut plan's *Sheets · Nets* switch, the Net view and its edge picking (113). */
  'plan.nets': 'hide',
  /** Building in *Nets*: the ghost, its height handle and ✓, the flap and board handles (114). */
  'net.build': 'hide',
  /** *Match top with*, *Own outline*, *Copy outline from* (71). */
  match: 'hide',
  /** A fold's *Automatic · Keep whole · Cut here*, and the design's split setting (69): only when it must. */
  split: 'auto',
  /** The cut plan's yield line: cut length, pieces, glue joints (69); the sheet meter already says sheets and percent. */
  yield: 'hide',
  /** *Use less board* over the cut plan: nest, then offer the folds to cut that save board (§10.6). */
  saveBoard: 'show',
  /** *Nest* and *Save material* as two steps (69); Quick build has *Use less board*. */
  'saveBoard.steps': 'hide',
  /** *Slit lock* for corners (68): in Quick build one switch, *No glue*, in the settings card. */
  'joints.noGlue': 'show',
  /** The download dialog's *Nominal · Compensated*: nominal, the kerf shown. */
  'export.kerf': 'auto',
  // ---- milestone 105 (Guided G2): what the stage shows; Quick build and Workshop as before ----
  /** The grow arrows on a board's edges (`EdgeHandle`). */
  'stage.edges': 'show',
  /** A selected board's push-pull and size widgets. */
  'stage.panelWidgets': 'show',
  /** The floor gizmo of a board lying on the floor. */
  'stage.floorGizmo': 'show',
  /** The gizmo of a placed (standing) board. */
  'stage.placedGizmo': 'show',
  /** The *+ divider* button on a base. */
  'stage.dividerButton': 'show',
  /** The handle that slides a divider (Guided has its own grips). */
  'stage.dividerSlide': 'show',
  /** A shape's gizmo on the stage, and editing a through-cut. */
  'stage.shapeGizmo': 'show',
  /** The stage's dock: ortho, fit, joints, outline mode, assemble, view settings, the material legend. */
  'stage.dock': 'show',
  /** The fold bar under the stage. */
  'stage.foldBar': 'show',
  /** The hint under the stage, and under the cut plan and the face-on view (milestone 108). */
  'stage.hint': 'show',
  /** Dragging with the right button pans the view. */
  'stage.pan': 'show',
  /** Workshop's letter keys for its tools (Quick build has its own keys). */
  'keys.tools': 'hide',
  /** Ctrl+C, Ctrl+V and Ctrl+D on shapes (a paste waits for ✓). */
  'keys.clipboard': 'show',
  /** Dragging pieces on the cut plan, and *Repack*. */
  'plan.edit': 'show',
  /** The guard's keep-out outline and *Kept … mm* tip in the face-on view (milestone 108); only where the guard runs. */
  'solo.guard': 'show',
  /** The cut plan's legend of layers (*Cut · Score · Engrave · Guide*, milestone 89). */
  'plan.legend': 'show',
} as const satisfies Record<string, FeatureState>;

export type Feature = keyof typeof FEATURES;

/**
 * Guided's column (milestone 105, ROADMAP §5 rule 4b): every feature says its
 * state in Guided too, so nothing of Quick build or Workshop shows there by
 * accident. The compiler checks that the column is complete.
 */
export const GUIDED = {
  'rail.tools': 'hide',
  'rail.ops': 'hide',
  'op.scoreAdd': 'hide',
  joints: 'auto',
  'settings.joints': 'show',
  'settings.snapping': 'hide',
  'settings.material': 'hide',
  drawer: 'hide',
  'export.spec': 'show',
  'size.as': 'auto',
  sizes: 'hide',
  'export.annotations': 'auto',
  crease: 'auto',
  'grow.advanced': 'hide',
  edit2d: 'hide',
  'transform.sides': 'hide',
  'outline.mode': 'hide',
  outline: 'hide',
  curves: 'hide',
  foldover: 'hide',
  'tray.ownHeight': 'hide',
  'tray.joints': 'auto',
  'tray.wallIt': 'hide',
  'tray.keepWhole': 'hide',
  gizmo: 'hide',
  arrays: 'hide',
  align: 'hide',
  copies: 'hide',
  foldSlider: 'hide',
  cutplan: 'show',
  exportCheck: 'hide',
  viewSettings: 'hide',
  boardMaterial: 'hide',
  construction: 'hide',
  hinge: 'auto',
  hints: 'hide',
  lid: 'show',
  'lid.advanced': 'auto',
  'tray.ends': 'hide',
  'tray.corners': 'auto',
  bend: 'auto',
  edgeFlap: 'hide',
  'flap.shape': 'hide',
  'start.cards': 'hide',
  'plan.nets': 'hide',
  'net.build': 'hide',
  match: 'hide',
  split: 'auto',
  yield: 'hide',
  saveBoard: 'show',
  'saveBoard.steps': 'hide',
  'joints.noGlue': 'show',
  'export.kerf': 'auto',
  'stage.edges': 'hide',
  'stage.panelWidgets': 'hide',
  'stage.floorGizmo': 'hide',
  'stage.placedGizmo': 'hide',
  'stage.dividerButton': 'hide',
  'stage.dividerSlide': 'hide',
  'stage.shapeGizmo': 'hide',
  'stage.dock': 'hide',
  'stage.foldBar': 'hide',
  'stage.hint': 'hide',
  'stage.pan': 'hide',
  'keys.tools': 'hide',
  'keys.clipboard': 'hide',
  'plan.edit': 'hide',
  'solo.guard': 'show',
  'plan.legend': 'hide',
} as const satisfies Record<Feature, FeatureState>;

/**
 * Every section a card can render, and the feature that shows it (rule 3 of
 * LIDS_LINES_PROJECTS_PLAN.md §10.1). `null`: part of the core card, shown in
 * both modes. `tests/quickTable.test.ts` fails when a card section (an element
 * with `className="subsection…"` and a `data-testid`) is missing here, so a
 * new engine control cannot reach Quick build unnoticed.
 */
export const SECTIONS: Record<string, Feature | null> = {
  // the settings card
  'settings-template': null,
  'settings-joints': 'settings.joints',
  'settings-material': 'settings.material',
  'settings-snapping': 'settings.snapping',
  // the material drawer
  'drawer-calibration': 'drawer',
  'drawer-bend': 'drawer',
  'drawer-sheet': 'drawer',
  'drawer-in-use': 'drawer',
  // a box
  'extrude-button': null,
  'extrude-card': null,
  'tray-card': null,
  'size-as': 'size.as',
  'tray-corners': 'tray.corners',
  'tray-ends': 'tray.ends',
  'carton-bottom': 'lid',
  'lid-section': 'lid',
  // milestone 84: a board's drawn lines, shown and deleted in both modes
  'lines-section': null,
  'inside-section': null,
  // a board
  'bend-section': 'bend',
  'closure-section': 'lid',
  'fold-section': 'foldover',
  'match-section': 'match',
  'point-curve': 'curves',
  'round-section': null,
  'divider-section': null,
  'placed-section': 'construction',
  'board-material-section': 'boardMaterial',
  'joints-section': 'joints',
  'open-seams': 'joints',
  'clear-sizes': null,
  'sheet-placement': null,
  'edges-section': null,
  // an edge (the grow card)
  'edge-flap': 'edgeFlap',
  'flap-shape': 'flap.shape',
  // milestone 104: the outline being edited in the 2D view
  'edit2d-section': 'edit2d',
  // milestone 77: a grow that closes the box, what ✓ makes (Workshop; Quick build makes the box's lid)
  'grow-closes': 'grow.advanced',
  // shapes and several boards
  'array-section': 'arrays',
  'array-new': 'arrays',
  'multi-size': null,
  'multi-align': 'align',
  'multi-distribute': 'align',
  'multi-panel-align': 'align',
  'multi-panel-distribute': 'align',
  'multi-panel-dividers': null,
  // Guided's Build sheet (milestone 107): src/guided/ mounts only in Guided, so these show nowhere else
  'g-divider': null,
  'g-space': null,
  'g-lid': 'lid',
  'g-inside': null,
  'g-more': 'settings.joints',
  'g-template': null,
  'g-made-more': null,
  // Guided's Decorate sheet (milestone 108)
  'g-deco': null,
  'g-stickers': null,
  'g-windows': null,
  // Guided's Send sheet (milestone 109)
  'g-check': null,
  'g-goals': null,
  'g-send-section': null,
};

/** A card can show its Workshop version (*More…*): it renders inside this, set to 'workshop'. */
export const ModeOverride = createContext<Mode | null>(null);

/** The mode this part of the interface is in. */
export function useMode(): Mode {
  const own = useStore((s) => s.viewPrefs.mode ?? 'workshop');
  return useContext(ModeOverride) ?? own;
}

/** What a feature is in the current mode. */
/**
 * A stage shown as a preview beside the Net view (milestone 113): it orbits and folds, and nothing on it edits.
 * The stage's own controls read this through `useFeature`.
 */
export const StagePreview = createContext(false);
const PREVIEW_HIDES = new Set<string>(['stage.edges', 'stage.panelWidgets', 'stage.floorGizmo', 'stage.placedGizmo', 'stage.dividerButton', 'stage.dividerSlide', 'stage.shapeGizmo', 'stage.dock', 'stage.hint', 'gizmo']);

export function useFeature(f: Feature): FeatureState {
  const preview = useContext(StagePreview);
  const s = featureState(f, useMode());
  return preview && PREVIEW_HIDES.has(f) ? 'hide' : s;
}

/** The same outside React (event handlers, the stage). */
export function featureState(f: Feature, mode: Mode = useStore.getState().viewPrefs.mode ?? 'workshop'): FeatureState {
  return mode === 'workshop' ? 'show' : mode === 'guided' ? GUIDED[f] : FEATURES[f];
}

/** Guided and Quick build keep shapes where the laser can cut them (the guard, the keep-out hatch, Workshop-only parts inert). */
export const keepsCuttable = (mode: Mode | undefined) => mode === 'guided' || mode === 'quick';
export const isGuided = (mode: Mode | undefined) => mode === 'guided';

/** Is the feature's control shown (shown or read-only)? */
export const shown = (s: FeatureState) => s === 'show' || s === 'readonly';
