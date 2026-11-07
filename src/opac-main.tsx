import React from 'react';
import ReactDOM from 'react-dom/client';
import { OpacApp } from './opac/OpacApp';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import { installStaleChunkReload } from './app/utils/staleChunkReload';

installStaleChunkReload();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="تعذّر عرض الفهرس">
      <OpacApp
        onOpenEditor={() => {
          // The dashboard (sign-in first when needed); page-reveal.js plays the card reveal.
          window.location.href = '/dashboard/';
        }}
      />
    </ErrorBoundary>
  </React.StrictMode>
);
