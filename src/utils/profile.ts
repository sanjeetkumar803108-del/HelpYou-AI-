import { safeGetItem } from './storage';
import { auth } from '../lib/firebase';

export interface UserProfileData {
  gradeLevel: string;
  stream: string;
  country: string;
  region: string;
  role: string;
  studyLevel: string;
  isVisualLearner: boolean;
  isDeepFocus: boolean;
  userName: string;
  profileContext: string;
}

/**
 * Retrieves the comprehensive profile data for the active user.
 * Seamlessly resolves localized cache keys and active user session overrides.
 */
export function getUserProfileData(): UserProfileData {
  const uid = auth.currentUser?.uid || '';
  
  const gradeLevel = (uid ? safeGetItem(`academic_grade_${uid}`) : null) ||
    safeGetItem('academic_grade') ||
    '11th Grade (Junior)';

  const stream = (uid ? safeGetItem(`academic_stream_${uid}`) : null) ||
    safeGetItem('academic_stream') ||
    'STEM / Engineering';

  const country = (uid ? safeGetItem(`academic_country_${uid}`) : null) ||
    safeGetItem('academic_country') ||
    'United States';

  const region = (uid ? safeGetItem(`academic_region_${uid}`) : null) ||
    safeGetItem('academic_region') ||
    'USA';

  const role = safeGetItem('onboarding_role') || 'High School Student';
  const studyLevel = (uid ? safeGetItem(`onboarding_grade_${uid}`) : null) ||
    safeGetItem('onboarding_grade') ||
    (gradeLevel.toLowerCase().includes('college') ? 'College' : 'High School');

  const isVisualLearner = safeGetItem('pref_visual_learner') === 'true';
  const isDeepFocus = safeGetItem('pref_deep_focus') === 'true';
  const userName = auth.currentUser?.displayName || 'Student';

  let customNotes: string[] = [];
  if (isVisualLearner) {
    customNotes.push('Visual Learner mode is enabled: prioritize tables, structured steps, and visual analogies.');
  }
  if (isDeepFocus) {
    customNotes.push('Deep Focus mode is enabled: provide direct, distraction-free, high-yield academic answers.');
  }

  const profileContext = `Student: ${userName} | Grade: ${gradeLevel} | Stream: ${stream} | Region: ${country} (${region}) | Level: ${studyLevel}${customNotes.length > 0 ? ' | ' + customNotes.join(' | ') : ''}`;

  return {
    gradeLevel,
    stream,
    country,
    region,
    role,
    studyLevel,
    isVisualLearner,
    isDeepFocus,
    userName,
    profileContext
  };
}

/**
 * Returns a rich profile context string suitable for injecting into AI system instructions.
 */
export function getProfileContext(): string {
  const profile = getUserProfileData();
  let ctx = `STUDENT PROFILE: ${profile.userName} is currently enrolled in ${profile.gradeLevel} pursuing the "${profile.stream}" track under the ${profile.country} (${profile.region}) curriculum.`;
  
  if (profile.isVisualLearner) {
    ctx += `\nPREFERENCE: Visual Learner Mode is ON. Structure solutions with clear step-by-step points, tables, and visual analogies.`;
  }
  if (profile.isDeepFocus) {
    ctx += `\nPREFERENCE: Deep Focus Mode is ON. Keep responses sharp, precise, and conceptual with zero fluff.`;
  }

  return ctx;
}

/**
 * Returns a JSON payload merged with all relevant student profile parameters.
 */
export function getProfilePayload(additionalData: Record<string, any> = {}): Record<string, any> {
  const profile = getUserProfileData();
  return {
    ...additionalData,
    gradeLevel: additionalData.gradeLevel || profile.gradeLevel,
    stream: additionalData.stream || profile.stream,
    country: additionalData.country || profile.country,
    region: additionalData.region || profile.region,
    role: additionalData.role || profile.role,
    learningStyle: profile.isVisualLearner ? 'Visual & Structured' : profile.isDeepFocus ? 'Deep Focus & Concise' : 'Balanced Pedagogical',
    profileContext: additionalData.profileContext || profile.profileContext
  };
}

/**
 * Appends student profile parameters to a FormData object (for multipart uploads like scanner/tutor voice).
 */
export function appendProfileToFormData(formData: FormData): void {
  const profile = getUserProfileData();
  if (!formData.has('gradeLevel')) formData.append('gradeLevel', profile.gradeLevel);
  if (!formData.has('stream')) formData.append('stream', profile.stream);
  if (!formData.has('country')) formData.append('country', profile.country);
  if (!formData.has('region')) formData.append('region', profile.region);
  if (!formData.has('profileContext')) formData.append('profileContext', profile.profileContext);
}
