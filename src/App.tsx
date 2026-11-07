import { useEffect, useState } from 'react';
import { useStore, useT } from './store/store';
import { useAutosave, useKeyboard } from './store/hooks';
import { TopBar } from './ui/TopBar';
import { Toolbar } from './ui/Toolbar';
import { Inspector } from './ui/Inspector';
import { MaterialDialog } from './ui/MaterialDialog';
import { ExportDialog } from './ui/ExportDialog';
import { Hints } from './ui/Hints';
import { View3D } from './views/View3D';
import { CutPlan } from './views/CutPlan';

export function App() {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const lang = useStore((s) => s.lang);
  const view = useStore((s) => s.view);
  const needsMaterial = useStore((s) => s.needsMaterial);
  const exportOpen = useStore((s) => s.exportOpen);
  useAutosave(() => setLoaded(true));
  useKeyboard();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = t('app.name');
  }, [lang]);
  if (!loaded) return <div className="loading" aria-busy="true" />;
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Toolbar />
        <main className="viewport">{view === '3d' ? <View3D /> : <CutPlan />}</main>
        <Inspector />
      </div>
      {needsMaterial && <MaterialDialog />}
      {!needsMaterial && <Hints />}
      {exportOpen && <ExportDialog />}
    </div>
  );
}
