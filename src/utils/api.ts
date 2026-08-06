export const getApiUrl = (endpoint: string) => {
  let baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  
  if (typeof window !== 'undefined') {
    const isHttps = window.location.protocol === 'https:';
    const isRemote = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    if (baseUrl.startsWith('http://') && isHttps) {
      baseUrl = baseUrl.replace('http://', 'https://');
    }
    
    if (isRemote && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1'))) {
      baseUrl = '';
    }
  }
  
  return `${baseUrl}${endpoint}`;
};
