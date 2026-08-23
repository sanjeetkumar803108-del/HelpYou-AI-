import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error guard against uncaught async promises (e.g. cancelled audio, native bridge, audio play abort)
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || event.reason || '';
  if (
    typeof reason === 'string' &&
    (reason.includes('play() request was interrupted') ||
      reason.includes('AbortError') ||
      reason.includes('The play() request was interrupted by a call to pause()') ||
      reason.includes('Failed to fetch') ||
      reason.includes('NetworkError') ||
      reason.includes('NotAllowedError') ||
      reason.includes('The operation was aborted'))
  ) {
    event.preventDefault();
    return;
  }
  console.warn('[Global Unhandled Rejection absorbed]:', event.reason);
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  if (event.message?.includes('ResizeObserver') || event.message?.includes('Script error')) {
    event.preventDefault();
    return;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

