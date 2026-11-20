// Opening a saved file (milestone 87; shared by the top bar and Guided's menu, milestone 105).
import { projectNamed, storeDesign } from '../store/persist';
import { parseProjectFile, ProjectError } from '../model/serialize';
import { useStore } from '../store/store';
import type { MsgKey } from '../i18n';
import { tellUser } from './AppDialog';

/** One design, or a project of several: every design goes in the library, the first opens. Failures say why, in words. */
export async function openProjectFile(f: File, t: (k: MsgKey, v?: Record<string, string | number>) => string) {
  try {
    const file = parseProjectFile(await f.text());
    if (file.designs.length > 1 || file.name) {
      const pj = await projectNamed(file.name || f.name.replace(/\.cutforge\.json$|\.json$/, ''));
      for (const x of file.designs) await storeDesign(x, pj.id).catch(() => undefined);
    }
    useStore.getState().replaceDesign(file.designs[0]);
  } catch (e) {
    // a friendly reason for any failure, never a raw error message
    const code = e instanceof ProjectError ? e.code : 'damaged';
    const reason = t(code === 'newerVersion' ? 'err.newerVersion' : code === 'notProject' ? 'err.notProject' : 'err.damaged');
    void tellUser(t('dlg.openFailed', { reason }));
  }
}
