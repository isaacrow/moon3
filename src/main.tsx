import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import './styles/index.css';
import './styles/glassmorphism.css';
import './styles/neon-theme.css';
import './styles/classic-theme.css';
import './styles/liquid-glass.css';
import './styles/motion.css';
import { installStaleChunkReload } from './app/utils/staleChunkReload';

installStaleChunkReload();

// The public OPAC is large; it loads only when an OPAC link is opened.
const WolfMoonStandaloneOpac = React.lazy(() =>
  import('./app/components/WolfMoonStandaloneOpac').then(m => ({ default: m.WolfMoonStandaloneOpac }))
);

// Check if visiting the separated OPAC site URL (different link / separate site)
const isOpacSite = (() => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return (
    path === '/opac' ||
    path.startsWith('/opac/') ||
    path.endsWith('opac.html') ||
    params.get('site') === 'opac' ||
    params.get('view') === 'wolf-moon-opac' ||
    params.get('view') === 'opac' ||
    params.get('view') === 'moon-opac'
  );
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle={isOpacSite ? "WOF MOON OPAC Error" : "Moon Editor Error"}>
      {isOpacSite ? (
        <React.Suspense fallback={null}>
          <WolfMoonStandaloneOpac
            onOpenEditor={() => {
              window.location.href = '/moon/';
            }}
          />
        </React.Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
