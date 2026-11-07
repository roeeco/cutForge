import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { useStore } from './store/store';

// Test hook for automated interaction tests (dev server or ?test in the URL).
if (import.meta.env.DEV || location.search.includes('test')) (window as unknown as { __cutforge: unknown }).__cutforge = { store: useStore };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
