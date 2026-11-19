// Guided's add bar (milestone 105): large buttons, each an icon over a word, bottom centre. Its
// contents depend on the step; they arrive with Build, Decorate and Send (milestones 107–109).
import type { ReactNode } from 'react';
import { useT } from '../store/store';

export function AddBar({ children }: { children?: ReactNode }) {
  const t = useT();
  if (!children) return null;
  return (
    <div className="g-addbar card" role="toolbar" aria-label={t('g.addbar')} data-testid="g-addbar">
      {children}
    </div>
  );
}
