import { safeGetItem } from './storage';
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

  const country = (uid ? safeGetItem(`academic_country_${uid}`) : null) ||
    safeGetItem('academic_country') ||
    'United States';

  const region = (uid ? safeGetItem(`academic_region_${uid}`) : null) ||
    safeGetItem('academic_region') ||
    'USA';

  const targetExam = (uid ? safeGetItem(`academic_exam_${uid}`) : null) ||
    (uid ? safeGetItem(`target_exam_${uid}`) : null) ||
    safeGetItem('academic_exam') ||
    safeGetItem('target_exam') ||
    '';

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
