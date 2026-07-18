import { useState, useEffect } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage';

export function useSettings() {
  const [visualLearner, setVisualLearnerState] = useState(() => safeGetItem('pref_visual_learner') === 'true');
  const [deepFocus, setDeepFocusState] = useState(() => safeGetItem('pref_deep_focus') === 'true');

  useEffect(() => {
    const handleStorageChange = () => {
      setVisualLearnerState(safeGetItem('pref_visual_learner') === 'true');
      setDeepFocusState(safeGetItem('pref_deep_focus') === 'true');
    };
    window.addEventListener('settings_changed', handleStorageChange);
    return () => window.removeEventListener('settings_changed', handleStorageChange);
  }, []);

  const setVisualLearner = (val: boolean) => {
    safeSetItem('pref_visual_learner', String(val));
    setVisualLearnerState(val);
    window.dispatchEvent(new Event('settings_changed'));
  };

  const setDeepFocus = (val: boolean) => {
    safeSetItem('pref_deep_focus', String(val));
    setDeepFocusState(val);
    window.dispatchEvent(new Event('settings_changed'));
  };

  return { visualLearner, setVisualLearner, deepFocus, setDeepFocus };
}
