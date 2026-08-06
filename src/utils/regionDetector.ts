import { safeGetItem, safeSetItem } from './storage';

/**
 * Automatically detects the user's educational system region based on
 * device timezone and locale settings on first app launch.
 * Fallback priority: Saved Preference -> Detected System -> Global Default.
 */
export const detectUserRegion = (userUid?: string): string => {
  const storageKey = userUid ? `academic_region_${userUid}` : 'academic_region';
  const savedRegion = safeGetItem(storageKey) || safeGetItem('academic_region');

  if (savedRegion) {
    return savedRegion;
  }

  let detectedRegion = 'Global';

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const language = (navigator.language || '').toLowerCase();

    if (timeZone.includes('America') || timeZone.includes('US/') || timeZone.includes('Honolulu') || language === 'en-us') {
      detectedRegion = 'USA';
    } else if (timeZone.includes('Europe/London') || timeZone.includes('Europe/Belfast') || language === 'en-gb') {
      detectedRegion = 'UK';
    } else if (timeZone.includes('Europe/Geneva') || timeZone.includes('Europe/Zurich') || timeZone.includes('Asia/Singapore')) {
      detectedRegion = 'IB';
    } else {
      detectedRegion = 'Global';
    }
  } catch (e) {
    console.warn('Locale/Timezone detection failed, defaulting to Global system:', e);
    detectedRegion = 'Global';
  }

  // Save automatically on first launch
  safeSetItem(storageKey, detectedRegion);
  if (userUid) {
    safeSetItem('academic_region', detectedRegion);
  }

  return detectedRegion;
};
