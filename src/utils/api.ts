import { Capacitor } from '@capacitor/core';

export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  if (typeof window !== 'undefined') {
    const isNative = Capacitor.isNativePlatform();
    const hostname = window.location.hostname;
    const port = window.location.port;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Only use local relative endpoint if running directly on express server (port 3000)
    if (!isNative && isLocalhost && port === '3000') {
      return cleanEndpoint;
    }
  }

  let baseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://help-you-ai-brcj.vercel.app').trim();
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  return `${baseUrl}${cleanEndpoint}`;
};

