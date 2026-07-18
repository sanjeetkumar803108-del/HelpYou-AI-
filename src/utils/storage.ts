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
  } catch (e) {
    memoryStorage[key] = value;
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

const memoryStorage: Record<string, string> = {};
