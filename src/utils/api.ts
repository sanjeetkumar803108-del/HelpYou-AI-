import { Capacitor } from '@capacitor/core';

export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  if (typeof window !== 'undefined') {
    const isNative = Capacitor.isNativePlatform();

    // If running in any web browser (localhost, 127.0.0.1, 192.168.x.x LAN IP, Vercel, or custom host),
    // always use relative endpoint so requests stay on the exact host that served the page!
    if (!isNative) {
      return cleanEndpoint;
    }
  }

  let baseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://help-you-ai-brcj.vercel.app').trim();
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  return `${baseUrl}${cleanEndpoint}`;
};
