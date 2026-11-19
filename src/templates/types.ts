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
export type Limit = { min?: number; max?: number; why?: MsgKey };

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
  /** Milestone 94: can this material (kind and thickness) make it? Absent: `materials` decides. */
  canMake?: (m: MaterialProfile) => boolean;
  /** Milestone 94: `planned` structures are registered and never shown. */
  status?: 'planned' | 'beta' | 'stable';
  /** Milestone 94: the structure to become when this one stops being allowed (its id). */
  fallback?: (m: MaterialProfile) => string;
  /** Milestone 94: its sentence keys (SENTENCE_BUILDER_PLAN.md §3.4). */
  sentence?: { main: MsgKey; adds?: Record<string, MsgKey> };
  /** Milestone 94: the word for the structure itself (*a box*), when it is one of the sentence's structures. */
  word?: MsgKey;
};

/** Can this material make this template? */
export const makes = (t: TemplateDef, m: MaterialProfile) => (t.canMake ? t.canMake(m) : t.materials.includes(m.kind));
