// Template registry types. A template is a definition (id, version, parameter
// schema with defaults, compatible materials) plus a generator that outputs
// the ordinary design model. Adding a template needs only these and tests.
import type { Design, MaterialKind } from '../model/types';
import type { MsgKey } from '../i18n';

export type ParamDef =
  | { key: string; label: MsgKey; type: 'number'; unit: 'mm'; min: number; max: number; default: number; only?: MaterialKind[] }
  | { key: string; label: MsgKey; type: 'int'; min: number; max: number; default: number; only?: MaterialKind[] }
  | { key: string; label: MsgKey; type: 'choice'; options: { value: string | number; label: MsgKey }[]; default: string | number; only?: MaterialKind[] };

export type Params = Record<string, number | string>;

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
};
