// Show a part of the interface only when the feature table shows it in this mode (milestone 37).
import type { ReactNode } from 'react';
import { shown, useFeature, type Feature } from './features';

export function Gate({ f, children }: { f: Feature; children: ReactNode }) {
  return shown(useFeature(f)) ? <>{children}</> : null;
}
