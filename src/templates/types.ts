// Template registry types. A template is a definition (id, version, parameter
// schema with defaults, compatible materials) plus a generator that outputs
// the ordinary design model. Adding a template needs only these and tests.
import type { Design, MaterialKind, MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';

export type Params = Record<string, number | string>;

/**
 * What a parameter can say about itself beyond its type (milestone 94,
 * SENTENCE_BUILDER_PLAN.md §3.1, after PRESETS_PLAN.md's contract). Every
 * field is optional: a template without them works as before. The words of
 * a sentence are a template's parameters in order.
 */
export type ParamRules = {
  /** The word appears only when this is true (e.g. a carton's bottom). */
  when?: (p: Params, m: MaterialProfile) => boolean;
  /** Per option of a choice: can it be made now? An option that cannot is not offered. */
  allowed?: (value: string | number, p: Params, m: MaterialProfile) => boolean;
  /** Why an option dropped out (for the change note and the tests; never shown in a list). */
  why?: (value: string | number, p: Params, m: MaterialProfile) => MsgKey | null;
  /** What the word becomes when its value is no longer allowed (default: the first allowed option). */
  fallback?: (p: Params, m: MaterialProfile) => string | number;
  /** A clause added with *+ more* and removed with ×; at this value it is off and left out of the sentence. */
  addon?: { off: string | number };
  /** The roles of the boards this word changes, lit up in the picture while it is focused. */
  affects?: string[];
};

export type ParamDef = ParamRules &
  (
    | { key: string; label: MsgKey; type: 'number'; unit: 'mm'; min: number; max: number; default: number; only?: MaterialKind[] }
    | { key: string; label: MsgKey; type: 'int'; min: number; max: number; default: number; only?: MaterialKind[] }
    | { key: string; label: MsgKey; type: 'choice'; options: { value: string | number; label: MsgKey }[]; default: string | number; only?: MaterialKind[] }
  );

/** A number's range now, and why it ends there. */
export type Limit = {
  min?: number;
  max?: number;
  why?: MsgKey;
  /**
   * Milestone 185: whether a value is within the limit, without working out the limit itself (one build, where `max`
   * takes a bisection of several). Only for limits that are monotone (every value under the largest that builds clean
   * builds clean too, as `largestOk` assumes): a value that holds is at most `max`.
   */
  holds?: (v: number) => boolean;
};

/**
 * The sizes a box, tray, carton or drawer is said in, and how many spaces each way (the owner, 20 November:
 * 5 to 300 mm; no more than 10 dividers each way, so 11 spaces). A size inside these that cannot be cut clean is
 * still refused by the engine, with its reason.
 */
export const SIZE_MIN = 5;
export const SIZE_MAX = 300;
export const SPACES_MAX = 11;

export type TemplateIssue = { key: MsgKey; vars: Record<string, string | number>; panel: string };

export type TemplateDef = {
  id: string;
  version: number;
  name: MsgKey;
  description: MsgKey;
  materials: MaterialKind[];
  params: ParamDef[];
  /**
   * Build panels and connections into an empty design with the material set.
   * `role(name, id)` registers each generated entity under a stable role name.
   */
  generate: (d: Design, p: Params, role: (name: string, id: string) => void) => void;
  /** Template-specific checks (e.g. dividers taller than the walls with a lid on). */
  check?: (d: Design, p: Params) => TemplateIssue[];
  /** Milestone 94: each number's range for this material and these words (merged over its own `min` / `max`). */
  limits?: (m: MaterialProfile, p: Params) => Record<string, Limit>;
  /** Milestone 95: are these words (just settled) ones the engine builds clean? A typed number that makes them not is refused with this reason. */
  accepts?: (m: MaterialProfile, p: Params) => MsgKey | null;
  /** Milestone 94: can this material (kind and thickness) make it? Absent: `materials` decides. */
  canMake?: (m: MaterialProfile) => boolean;
  /** Milestone 94: `planned` structures are registered and never shown. */
  status?: 'planned' | 'beta' | 'stable';
  /** Milestone 94: the structure to become when this one stops being allowed (its id). */
  fallback?: (m: MaterialProfile) => string;
  /** Milestone 96: words set when this structure becomes its fallback (a carton on plywood becomes a box *with a lid that lifts off*). */
  fallbackWords?: Params;
  /** Milestone 94: its sentence keys (SENTENCE_BUILDER_PLAN.md §3.4). */
  sentence?: { main: MsgKey; adds?: Record<string, MsgKey> };
  /** Milestone 94: the word for the structure itself (*a box*), when it is one of the sentence's structures. */
  word?: MsgKey;
  /**
   * Milestone 146 (PRESETS_OVERHAUL.md): these words build exactly what another structure builds with those words
   * (a tray with no handles is a box with no lid), or null. The catalogue's lists use it to show a design once.
   */
  sameAs?: (p: Params) => { id: string; params: Params } | null;
};

/** Can this material make this template? */
export const makes = (t: TemplateDef, m: MaterialProfile) => (t.canMake ? t.canMake(m) : t.materials.includes(m.kind));
