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

// Auto-recover from stale dynamic chunk imports on rebuild/deploy
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite Preload Guard] Stale chunk detected during navigation. Auto-syncing fresh bundle...');
  window.location.reload();
});

// Global API interceptor to attach persistent x-user-id / device ID for daily quota tracking
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
      if (urlStr.includes('/api/')) {
        init = init ? { ...init } : {};
        let userId = localStorage.getItem('last_logged_in_user');
        if (!userId || !userId.trim()) {
          userId = localStorage.getItem('help_you_client_id');
          if (!userId) {
            userId = 'client_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
            localStorage.setItem('help_you_client_id', userId);
          }
        }

        const isPro = localStorage.getItem('study_is_vip') === 'true' || 
          (Boolean(userId) && localStorage.getItem(`study_is_vip_${userId}`) === 'true');

        if (init.headers instanceof Headers) {
          if (!init.headers.has('x-user-id')) {
            init.headers.set('x-user-id', userId);
          }
          if (isPro && !init.headers.has('x-user-is-pro')) {
            init.headers.set('x-user-is-pro', 'true');
          }
        } else if (Array.isArray(init.headers)) {
          init.headers.push(['x-user-id', userId]);
          if (isPro) init.headers.push(['x-user-is-pro', 'true']);
        } else if (typeof init.headers === 'object' && init.headers !== null) {
          (init.headers as Record<string, string>)['x-user-id'] = userId;
          if (isPro) (init.headers as Record<string, string>)['x-user-is-pro'] = 'true';
        } else {
          init.headers = isPro ? { 'x-user-id': userId, 'x-user-is-pro': 'true' } : { 'x-user-id': userId };
        }
      }
    } catch {
      // Fail silently and proceed with standard fetch
    }
    return originalFetch.call(this, input, init);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

