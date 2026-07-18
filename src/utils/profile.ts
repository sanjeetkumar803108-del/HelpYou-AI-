import { safeGetItem, safeSetItem } from '../utils/storage';
export const getProfileContext = () => {
  const role = safeGetItem('onboarding_role');
  const grade = safeGetItem('onboarding_grade');
  const isVisualLearner = safeGetItem('pref_visual_learner') === 'true';
  const isDeepFocus = safeGetItem('pref_deep_focus') === 'true';
  let ctx = '';
  if (role && grade) {
    ctx += `User is a ${role} in ${grade}. Adjust difficulty and tone accordingly.`;
  }
  if (isVisualLearner) {
    ctx += `\nUSER SETTING: Visual Learner Mode is ON. You MUST prioritize explanations using HTML tables (with inline styles), bulleted lists, step-by-step formats, and where possible, suggest visual analogies.`;
  }
  if (isDeepFocus) {
    ctx += `\nUSER SETTING: Deep Focus Mode is ON. Keep responses extremely concise, distraction-free, and highly focused on the core academic concept. Avoid conversational filler.`;
  }
  return ctx;
};
