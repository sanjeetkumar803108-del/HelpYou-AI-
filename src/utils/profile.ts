import { safeGetItem, safeSetItem } from './storage';
import { auth } from '../lib/firebase';
import { getStoredExamBlueprint, formatBlueprintForAIPrompt } from './academicBlueprint';

export interface UserProfileData {
  gradeLevel: string;
  subject: string;
  subjects?: string[];
  stream: string;
  country: string;
  region: string;
  targetExam: string;
  role: string;
  studyLevel: string;
  isVisualLearner: boolean;
  isDeepFocus: boolean;
  userName: string;
  profileContext: string;
}

/**
 * Resolves the genuine country name, guarding against literal 'Others' or 'Other'.
 * If the user selected 'Others' and entered a custom country, it returns the custom country.
 * If targetExam strongly identifies an authentic curriculum (e.g. NEET / JEE / CBSE -> India),
 * it seamlessly resolves to that genuine country rather than generic 'Others'.
 */
export function resolveRealCountry(rawCountry?: string | null, customCountry?: string | null, targetExam?: string | null): string {
  const custom = (customCountry || '').trim();
  if (custom && custom.toLowerCase() !== 'others' && custom.toLowerCase() !== 'other') {
    return custom;
  }

  const raw = (rawCountry || '').trim();
  if (raw && raw.toLowerCase() !== 'others' && raw.toLowerCase() !== 'other') {
    return raw;
  }

  const exam = (targetExam || '').toLowerCase().trim();
  if (
    exam.includes('neet') ||
    exam.includes('jee') ||
    exam.includes('cbse') ||
    exam.includes('icse') ||
    exam.includes('upsc') ||
    exam.includes('gate') ||
    exam.includes('nda') ||
    exam.includes('cuet') ||
    exam.includes('clat')
  ) {
    return 'India';
  }

  if (exam.includes('sat') || exam.includes('act') || exam.includes('ap ') || exam.endsWith(' ap')) {
    return 'United States';
  }

  if (exam.includes('gcse') || exam.includes('a level') || exam.includes('a-level')) {
    return 'United Kingdom';
  }

  return raw && raw.toLowerCase() !== 'others' && raw.toLowerCase() !== 'other' ? raw : 'United States';
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

  const subject = (uid ? safeGetItem(`academic_subject_${uid}`) : null) ||
    safeGetItem('academic_subject') ||
    safeGetItem('selected_subject') ||
    safeGetItem('subject') ||
    (uid ? safeGetItem(`academic_stream_${uid}`) : null) ||
    safeGetItem('academic_stream') ||
    'Mathematics';

  let subjects: string[] = [];
  const rawSubjects = (uid ? safeGetItem(`academic_subjects_${uid}`) : null) || safeGetItem('academic_subjects');
  if (rawSubjects) {
    try {
      const parsed = JSON.parse(rawSubjects);
      if (Array.isArray(parsed) && parsed.length > 0) subjects = parsed;
    } catch (_) {
      subjects = rawSubjects.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }
  if (subjects.length === 0 && subject) {
    subjects = subject.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  const stream = subject;

  const targetExam = (uid ? safeGetItem(`academic_exam_${uid}`) : null) ||
    (uid ? safeGetItem(`target_exam_${uid}`) : null) ||
    safeGetItem('academic_exam') ||
    safeGetItem('target_exam') ||
    '';

  const rawCountry = (uid ? safeGetItem(`academic_country_${uid}`) : null) ||
    safeGetItem('academic_country');

  const customCountry = (uid ? safeGetItem(`academic_custom_country_${uid}`) : null) ||
    safeGetItem('academic_custom_country') ||
    (uid ? safeGetItem(`custom_country_${uid}`) : null) ||
    safeGetItem('custom_country');

  const country = resolveRealCountry(rawCountry, customCountry, targetExam);

  // If local storage has 'Others', auto-repair it so future accesses are clean
  if (rawCountry === 'Others' || rawCountry === 'Other') {
    safeSetItem('academic_country', country);
    safeSetItem('academic_custom_country', country);
    if (uid) {
      safeSetItem(`academic_country_${uid}`, country);
      safeSetItem(`academic_custom_country_${uid}`, country);
    }
  }

  let region = (uid ? safeGetItem(`academic_region_${uid}`) : null) ||
    safeGetItem('academic_region');
  
  if (!region || region === 'Global') {
    if (country === 'India') region = 'India';
    else if (country === 'United States') region = 'USA';
    else if (country === 'United Kingdom') region = 'UK';
    else if (country === 'Canada') region = 'CA';
    else if (country === 'Australia') region = 'AU';
    else region = country;
  }

  const role = safeGetItem('onboarding_role') || 'High School Student';
  const studyLevel = (uid ? safeGetItem(`onboarding_grade_${uid}`) : null) ||
    safeGetItem('onboarding_grade') ||
    (gradeLevel.toLowerCase().includes('college') ? 'College' : 'High School');

  const isVisualLearner = safeGetItem('pref_visual_learner') === 'true';
  const isDeepFocus = safeGetItem('pref_deep_focus') === 'true';
  const userName = auth.currentUser?.displayName || 'Student';

  let customNotes: string[] = [];
  if (targetExam) {
    customNotes.push(`Target Exam: ${targetExam}`);
  }
  if (isVisualLearner) {
    customNotes.push('Visual Learner mode is enabled: prioritize tables, structured steps, and visual analogies.');
  }
  if (isDeepFocus) {
    customNotes.push('Deep Focus mode is enabled: provide direct, distraction-free, high-yield academic answers.');
  }

  const profileContext = `Student: ${userName} | Grade: ${gradeLevel} | Target Exam: ${targetExam || 'General'} | Subject: ${subject} | Region: ${country} (${region}) | Level: ${studyLevel}${customNotes.length > 0 ? ' | ' + customNotes.join(' | ') : ''}`;

  return {
    gradeLevel,
    subject,
    subjects,
    stream,
    country,
    region,
    targetExam,
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
export function getProfileContext(currentSubject?: string): string {
  const profile = getUserProfileData();
  const activeSubj = currentSubject || profile.subject || 'General Studies';
  const examSnippet = profile.targetExam ? ` preparing specifically for "${profile.targetExam}" and` : '';
  let ctx = `STUDENT PROFILE: ${profile.userName} is currently enrolled in ${profile.gradeLevel}${examSnippet} focusing on "${activeSubj}" under the ${profile.country} (${profile.region}) curriculum.`;
  
  // Inject authentic exam blueprint calibrated from deep research
  const blueprintSnippet = formatBlueprintForAIPrompt(activeSubj);
  if (blueprintSnippet) {
    ctx += `\n${blueprintSnippet}`;
  }

  if (profile.isVisualLearner) {
    ctx += `\nPREFERENCE: Visual Learner Mode is ON. Structure solutions with clear step-by-step points, tables, and visual analogies.`;
  }
  if (profile.isDeepFocus) {
    ctx += `\nPREFERENCE: Deep Focus Mode is ON. Keep responses sharp, precise, and conceptual with zero fluff.`;
  }

  return ctx;
}

/**
 * Returns a JSON payload merged with all relevant student profile parameters and exam blueprint.
 */
export function getProfilePayload(additionalData: Record<string, any> = {}): Record<string, any> {
  const profile = getUserProfileData();
  const blueprint = getStoredExamBlueprint();
  const activeSubj = additionalData.subject || additionalData.stream || profile.subject;

  return {
    ...additionalData,
    gradeLevel: additionalData.gradeLevel || profile.gradeLevel,
    subject: activeSubj,
    stream: activeSubj,
    country: additionalData.country || profile.country,
    region: additionalData.region || profile.region,
    targetExam: additionalData.targetExam || profile.targetExam,
    exam: additionalData.exam || profile.targetExam,
    academic_exam: additionalData.academic_exam || profile.targetExam,
    examBlueprint: additionalData.examBlueprint || blueprint,
    learningStyle: profile.isVisualLearner ? 'Visual & Structured' : profile.isDeepFocus ? 'Deep Focus & Concise' : 'Balanced Pedagogical',
    profileContext: additionalData.profileContext || getProfileContext(activeSubj)
  };
}

/**
 * Appends student profile parameters and exam blueprint to a FormData object (for multipart uploads like scanner/tutor voice).
 */
export function appendProfileToFormData(formData: FormData): void {
  const profile = getUserProfileData();
  const blueprint = getStoredExamBlueprint();

  if (!formData.has('gradeLevel')) formData.append('gradeLevel', profile.gradeLevel);
  if (!formData.has('subject')) formData.append('subject', profile.subject);
  if (!formData.has('stream')) formData.append('stream', profile.stream);
  if (!formData.has('country')) formData.append('country', profile.country);
  if (!formData.has('region')) formData.append('region', profile.region);
  if (!formData.has('targetExam') && profile.targetExam) {
    formData.append('targetExam', profile.targetExam);
    formData.append('academic_exam', profile.targetExam);
  }
  if (blueprint && !formData.has('examBlueprint')) {
    formData.append('examBlueprint', JSON.stringify(blueprint));
  }
  if (!formData.has('profileContext')) formData.append('profileContext', getProfileContext(profile.subject));
}
