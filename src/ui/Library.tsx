// Your designs (milestone 86, LIDS_LINES_PROJECTS_PLAN.md §8): the library on
// the start screen, newest first, from the cards alone (no design is loaded
// to list it). Open, Duplicate, Rename, Delete; Recently deleted for 30 days.
import { profileById } from '../model/boards';
import { useEffect, useState } from 'react';
import { useStore, useT } from '../store/store';
import { listDesigns, listProjects, loadDesign, projectNamed, renameDesign, setDeleted, setProject, storeDesign, type DesignMeta, type ProjectMeta } from '../store/persist';
import { migrateDesign } from '../model/serialize';
import { duplicateDesign } from '../model/ops';
import { MaterialArt } from './MaterialArt';
import { Icon } from './icons';
import { askText } from './AppDialog';

/** Open a design from the library in the editor (the one open now is saved already). */
export async function openFromLibrary(id: string) {
  const raw = await loadDesign(id);
  if (!raw) return;
  useStore.getState().replaceDesign(migrateDesign(raw), false);
}

export function Library() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [list, setList] = useState<{ live: DesignMeta[]; deleted: DesignMeta[] } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  // the design open in the editor (it cannot be deleted while it is open)
  const openId = useStore((s) => (s.design.order.length ? s.design.id : null));
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const reload = () =>
    Promise.all([listDesigns(), listProjects()])
      .then(([l, p]) => {
        setList(l);
        setProjects(p);
      })
      .catch(() => setList({ live: [], deleted: [] }));
  useEffect(() => void reload(), []);
  if (!list || (!list.live.length && !list.deleted.length)) return null;
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const card = (m: DesignMeta, i: number) => {
    const mat = profileById(m.material);
    return (
      <div className="lib-card" key={m.id} data-testid={`lib-card-${i}`} data-id={m.id}>
        <button className="lib-open" onClick={() => void openFromLibrary(m.id)} data-testid={`lib-open-${i}`}>
          <span className="art">{mat && <MaterialArt kind={mat.kind} thickness={mat.thickness} />}</span>
          <span className="cap">
            <strong dir="auto">{m.name || t('top.untitled')}</strong>
            <small>
              {mat ? t(mat.nameKey as 'mat.ply3') : m.material} · {date(m.updatedAt)}
            </small>
          </span>
        </button>
        <div className="lib-actions">
          <button
            className="ghost icon-btn"
            title={t('lib.duplicate')}
            aria-label={t('lib.duplicate')}
            onClick={async () => {
              const raw = await loadDesign(m.id);
              if (raw) await storeDesign(duplicateDesign(migrateDesign(raw), t('lib.copySuffix')));
              await reload();
            }}
            data-testid={`lib-duplicate-${i}`}
          >
            <Icon name="copy" size={16} />
          </button>
          <button
            className="ghost icon-btn"
            title={t('proj.move')}
            aria-label={t('proj.move')}
            onClick={async () => {
              // milestone 87: a project by name (made if new); an empty name takes it out of its project
              const name = await askText(t('proj.movePrompt'), projects.find((p) => p.id === m.projectId)?.name ?? '');
              if (name === null) return;
              await setProject(m.id, name.trim() ? (await projectNamed(name.trim())).id : null);
              await reload();
            }}
            data-testid={`lib-move-${i}`}
          >
            <Icon name="open" size={16} />
          </button>
          <button
            className="ghost icon-btn"
            title={t('lib.rename')}
            aria-label={t('lib.rename')}
            onClick={async () => {
              const name = await askText(t('lib.rename'), m.name);
              // the open design is renamed in the editor, or its next autosave would undo it
              if (name !== null && m.id === openId) useStore.getState().apply((d) => void (d.name = name));
              else if (name !== null) await renameDesign(m.id, name);
              await reload();
            }}
            data-testid={`lib-rename-${i}`}
          >
            <Icon name="pencil" size={16} />
          </button>
          {m.id !== openId && <button
            className="ghost icon-btn"
            title={t('lib.delete')}
            aria-label={t('lib.delete')}
            onClick={async () => {
              await setDeleted(m.id, true);
              await reload();
            }}
            data-testid={`lib-delete-${i}`}
          >
            <Icon name="trash" size={16} />
          </button>}
          {m.id === openId && <span className="note lib-is-open">{t('lib.isOpen')}</span>}
        </div>
      </div>
    );
  };
  return (
    <section className="library" data-testid="library">
      <p className="step-label">{t('lib.title')}</p>
      {/* milestone 87: grouped by project, then the designs in none */}
      {projects
        .filter((p) => list.live.some((m) => m.projectId === p.id))
        .map((p) => (
          <div key={p.id} className="lib-project" data-testid={`lib-project-${p.name}`}>
            <p className="lib-project-name">
              <Icon name="open" size={14} /> {p.name}
            </p>
            <div className="lib-grid">{list.live.map((m, i) => (m.projectId === p.id ? card(m, i) : null))}</div>
          </div>
        ))}
      <div className="lib-grid">{list.live.map((m, i) => (!m.projectId || !projects.some((p) => p.id === m.projectId) ? card(m, i) : null))}</div>
      <p className="note">{t('lib.whereKept')}</p>
      {list.deleted.length > 0 && (
        <>
          <button className="link" onClick={() => setShowDeleted((v) => !v)} aria-expanded={showDeleted} data-testid="lib-deleted-toggle">
            {t('lib.deleted', { n: list.deleted.length })}
          </button>
          {showDeleted && (
            <ul className="lib-deleted">
              {list.deleted.map((m, i) => (
                <li key={m.id}>
                  <span dir="auto">{m.name || t('top.untitled')}</span>
                  <button
                    className="link"
                    onClick={async () => {
                      await setDeleted(m.id, false);
                      await reload();
                    }}
                    data-testid={`lib-restore-${i}`}
                  >
                    {t('lib.restore')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
