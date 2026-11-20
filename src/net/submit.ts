// Sending a design to a class (milestones 37, 40; moved out of SubmitDialog in milestone 109 so Guided's Send
// and the dialog share it). No React: the class lookup, the profile check, the switch to the class's board,
// the upload, and the remembered code and name.
import type { Design, MaterialProfile } from '../model/types';
import { api, deviceId, type ApiError, type ClassInfo } from './api';
import { serializeProject } from '../model/serialize';
import { prepareExport } from '../export/prepare';
import { sheetPreviewSvg } from '../export/svg';
import { changeMaterial } from '../templates/registry';
import { setMaterial } from '../model/ops';
import { mixedMaterials } from '../model/materials';
import { missionState } from '../easy/missions';
import type { MsgKey } from '../i18n';

export const CODE_KEY = 'cutforge.classCode';
export const NAME_KEY = 'cutforge.studentName';

/** Read (no value) or write a remembered value; storage that is blocked reads as empty. */
export function remember(k: string, v?: string): string {
  try {
    if (v === undefined) return localStorage.getItem(k) ?? '';
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
  return '';
}
export const rememberedCode = () => remember(CODE_KEY);
export const rememberedName = () => remember(NAME_KEY);

/** A mission's goals met, for the teacher (milestone 40). */
export function goalsOf(d: Design): { goalsMet?: number; goalsTotal?: number } {
  const s = missionState(d);
  return s ? { goalsMet: s.goals.filter((g) => g.ok).length, goalsTotal: s.goals.length } : {};
}

/** Does the class's board differ from the design's (kind, thickness, kerf or clearance)? */
export const differs = (a: MaterialProfile, b: MaterialProfile) =>
  a.kind !== b.kind || Math.abs(a.thickness - b.thickness) > 1e-6 || Math.abs(a.kerf - b.kerf) > 1e-6 || Math.abs(a.clearance - b.clearance) > 1e-6;

/** The class's profile against the design: its board differs, or some boards are in another material. */
export const profileMismatch = (cls: ClassInfo, d: Design) => !!cls.material && (differs(cls.material, d.material) || mixedMaterials(d));

/** The design in the class's board: a template design is made again from its words, any other has its board changed. */
export function switchToClassMaterial(d: Design, m: MaterialProfile): Design {
  if (d.template) return changeMaterial(d, m).design;
  const c: Design = JSON.parse(JSON.stringify(d));
  setMaterial(c, m);
  return c;
}

export type LookupResult = { ok: true; cls: ClassInfo } | { ok: false; error: string };

/** The class behind a code; `closed` when it no longer takes work. */
export async function lookupClass(code: string): Promise<LookupResult> {
  try {
    const cls = await api.classInfo(code);
    if (!cls.open) return { ok: false, error: 'closed' };
    return { ok: true, cls };
  } catch (e) {
    return { ok: false, error: (e as ApiError).code ?? 'network' };
  }
}

/** Upload the design (a second send from this device replaces the first, on the server). */
export async function submitDesign(o: { code: string; name: string; title: string; design: Design }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await api.submit(o.code, {
      displayName: o.name.trim(),
      deviceId: deviceId(),
      title: o.title.trim() || o.design.name || '—',
      project: serializeProject(o.design),
      preview: sheetPreviewSvg(prepareExport(o.design).sheets[0]),
      ...goalsOf(o.design),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as ApiError).code ?? 'network' };
  }
}

/** The words for an error code from the class server. */
export const errKeyOf = (e: string): MsgKey => (['network', 'noClass', 'closed', 'rateLimited', 'tooLarge', 'badProject', 'badRequest', 'badPreview'].includes(e) ? (`sub.err.${e}` as MsgKey) : 'sub.err.server');
