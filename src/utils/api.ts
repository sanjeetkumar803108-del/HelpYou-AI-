import { Capacitor } from '@capacitor/core';

export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  if (typeof window !== 'undefined') {
    const isNative = Capacitor.isNativePlatform();
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

    // If running in local web browser (localhost:3000), ALWAYS use local relative endpoint
    if (!isNative && isLocalhost) {
      return cleanEndpoint;
    }
  }

  let baseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  return `${baseUrl}${cleanEndpoint}`;
};

