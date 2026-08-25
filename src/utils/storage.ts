export const safeGetItem = (key: string, defaultValue: string | null = null): string | null => {
  try {
    const val = window.localStorage.getItem(key);
    return val !== null ? val : defaultValue;
  } catch (e) {
    console.warn('localStorage access denied, using memory storage fallback');
    return memoryStorage[key] !== undefined ? memoryStorage[key] : defaultValue;
  }
};

export const safeSetItem = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('academic_profile_updated', { detail: { key, value } }));
  } catch (e) {
    memoryStorage[key] = value;
    window.dispatchEvent(new CustomEvent('academic_profile_updated', { detail: { key, value } }));
  }
};

export const safeClearAll = (): void => {
  try {
    window.localStorage.clear();
  } catch (e) {
    console.warn('localStorage clear failed');
  }
  for (const key in memoryStorage) {
    delete memoryStorage[key];
  }
};

export const safeJsonParse = <T>(jsonStr: string | null | undefined, fallback: T): T => {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    console.warn('[SafeJsonParse] Corrupted JSON recovered with fallback:', e);
    return fallback;
  }
};

const memoryStorage: Record<string, string> = {};
