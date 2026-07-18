export const getApiUrl = (endpoint: string) => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  return `${baseUrl}${endpoint}`;
};
