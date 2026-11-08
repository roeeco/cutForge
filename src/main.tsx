import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { useStore } from './store/store';
import * as ops from './model/ops';
import { loadBundledFonts, onFontsChange } from './text/fonts';

// Fonts load in the background; when they arrive, panels with text are
// re-derived (new objects, same content, no history entry).
onFontsChange(() => {
  const s = useStore.getState();
  const panels = { ...s.design.panels };
  for (const [id, p] of Object.entries(panels)) if (p.details.some((x) => x.shape === 'text')) panels[id] = { ...p };
  useStore.setState({ design: { ...s.design, panels } });
});
void loadBundledFonts();

// Test hook for automated interaction tests (dev server or ?test in the URL).
// `ops` gives scripted tests the model operations (dev only, so production stays lean).
if (import.meta.env.DEV || location.search.includes('test')) (window as unknown as { __cutforge: unknown }).__cutforge = { store: useStore, ops: import.meta.env.DEV ? ops : undefined };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
