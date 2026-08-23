import React from 'react';
import ReactDOM from 'react-dom/client';
import CullingGrid from './CullingGrid.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CullingGrid />
  </React.StrictMode>
);

// Register the service worker for offline / installable PWA (production only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
