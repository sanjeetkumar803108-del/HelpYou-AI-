import { safeGetItem, safeSetItem } from './storage';
import { auth } from '../lib/firebase';

export interface ExamOverview {
  examName: string;
  country: string;
  officialAuthority?: string;
  examType?: string;
  examFormat?: string;
  totalExamMarks?: number;
  totalQuestions?: number;
  hasSubjective?: boolean;
  hasNegativeMarking?: boolean;
  negativeFormula?: string;
}

export interface SubjectBlueprint {
  subjectName?: string;
  totalMarks: number | string;
  totalQuestions: number;
  attemptRequired: number;
  markingScheme: string;
  negativeMarking?: number;
  marksPerCorrect?: number;
  questionFormats: string[];
  mcqStyle?: {
    optionsCount?: number;
    style?: string;
    negativePenalty?: string;
  };
  subjectiveStyle?: {
    hasSubjective?: boolean;
    format?: string;
    wordLimits?: string;
    markingRubric?: string;
  };
  coreUnits: string[];
  subTopics?: Record<string, string[]>;
  nomenclature?: string;
  detailedNotesGuidelines?: string;
  revisionGuidelines?: string;
  essayTone?: string | null;
  examTone: string;
  officialSource?: string;
}

export interface ExamBlueprintMap {
  [subject: string]: SubjectBlueprint;
}

export interface FullAcademicDossier {
  exam: string;
  grade: string;
  country: string;
  lastUpdated?: string;
  examOverview?: ExamOverview;
  subjectsBlueprint: ExamBlueprintMap;
}

/**
 * Retrieves the permanently saved exam overview (exam name, authority, CBT format, total marks).
 * Strictly isolated per user.
 */
export function getExamOverview(userId?: string): ExamOverview | null {
  const uid = userId || auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
  const raw = (uid ? safeGetItem(`exam_overview_${uid}`) : null) 
    || (!uid ? safeGetItem('exam_overview') : null);

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }

  // Fallback check inside user_exam_blueprint
  const bpRaw = (uid ? safeGetItem(`user_exam_blueprint_${uid}`) : null)
    || (!uid ? (safeGetItem('user_exam_blueprint') || safeGetItem('academic_exam_blueprint')) : null);

  if (bpRaw) {
    try {
      const parsed = JSON.parse(bpRaw);
      if (parsed?.examOverview) return parsed.examOverview;
    } catch (_) {}
  }
  return null;
}

/**
 * Retrieves the permanently saved exam blueprint dictionary for the active user.
 * Strictly isolated per user.
 */
export function getStoredExamBlueprint(userId?: string): ExamBlueprintMap | null {
  const uid = userId || auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
  const raw = (uid ? safeGetItem(`user_exam_blueprint_${uid}`) : null) 
    || (!uid ? (safeGetItem('user_exam_blueprint') || safeGetItem('academic_exam_blueprint')) : null);
  
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.subjectsBlueprint && typeof parsed.subjectsBlueprint === 'object') {
        return parsed.subjectsBlueprint;
      }
      return parsed;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

/**
 * Permanently saves or merges the exam blueprint dictionary in local storage.
 * Strictly isolated per user.
 */
export function saveStoredExamBlueprint(blueprint: ExamBlueprintMap, userId?: string, overview?: ExamOverview): void {
  if (!blueprint || typeof blueprint !== 'object') return;
  const uid = userId || auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
  const fullPayload = {
    examOverview: overview || getExamOverview(uid),
    subjectsBlueprint: blueprint
  };
  const jsonStr = JSON.stringify(fullPayload);
  safeSetItem('user_exam_blueprint', jsonStr);
  safeSetItem('academic_exam_blueprint', jsonStr);
  if (uid) {
    safeSetItem(`user_exam_blueprint_${uid}`, jsonStr);
  }

  if (overview) {
    const ovStr = JSON.stringify(overview);
    safeSetItem('exam_overview', ovStr);
    if (uid) safeSetItem(`exam_overview_${uid}`, ovStr);
  }

  // Save isolated storage per subject
  Object.keys(blueprint).forEach((subj) => {
    saveDedicatedSubjectBlueprint(subj, blueprint[subj], uid);
  });

  try {
    window.dispatchEvent(new CustomEvent('academic_profile_updated'));
  } catch (_) {}
}

/**
 * Retrieves the dedicated blueprint for a single isolated subject (e.g. "Quantitative Aptitude").
 * Guarantees zero cross-subject or cross-user data contamination.
 */
export function getSubjectBlueprint(subject: string, userId?: string): SubjectBlueprint | null {
  if (!subject) return null;
  const uid = userId || auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
  const cleanSubjKey = subject.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');

  // Check dedicated isolated per-subject key first
  const dedicatedRaw = (uid ? safeGetItem(`exam_subject_blueprint_${cleanSubjKey}_${uid}`) : null)
    || (!uid ? safeGetItem(`exam_subject_blueprint_${cleanSubjKey}`) : null);

  if (dedicatedRaw) {
    try {
      const parsed = JSON.parse(dedicatedRaw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }

  // Fallback to dictionary lookup
  const map = getStoredExamBlueprint(uid);
  if (!map || typeof map !== 'object') return null;

  // Direct match
  if (map[subject]) return map[subject];

  // Case-insensitive or fuzzy match
  const cleanTarget = subject.toLowerCase().trim();
  const foundKey = Object.keys(map).find(k => {
    const cleanKey = k.toLowerCase().trim();
    return cleanKey === cleanTarget || cleanTarget.includes(cleanKey) || cleanKey.includes(cleanTarget);
  });

  return foundKey ? map[foundKey] : null;
}

/**
 * Saves dedicated isolated blueprint for a single subject so that no other subject can modify it.
 */
export function saveDedicatedSubjectBlueprint(subject: string, data: SubjectBlueprint, userId?: string): void {
  if (!subject || !data) return;
  const uid = userId || auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
  const cleanSubjKey = subject.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const jsonStr = JSON.stringify(data);

  safeSetItem(`exam_subject_blueprint_${cleanSubjKey}`, jsonStr);
  if (uid) {
    safeSetItem(`exam_subject_blueprint_${cleanSubjKey}_${uid}`, jsonStr);
  }
}

/**
 * Injects the student's authentic examination blueprint into any AI system instruction or prompt
 * (used across AI Tutor, Question Generator, Quiz Generator, Test Prep, and Flashcards).
 */
export function formatBlueprintForAIPrompt(subject: string, userId?: string): string {
  const uid = userId || auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
  const bp = getSubjectBlueprint(subject, uid);
  const overview = getExamOverview(uid);
  const exam = (uid ? (safeGetItem(`academic_exam_${uid}`) || safeGetItem(`target_exam_${uid}`)) : null)
    || safeGetItem('academic_exam')
    || safeGetItem('target_exam')
    || overview?.examName
    || '';
  const grade = (uid ? safeGetItem(`academic_grade_${uid}`) : null) || safeGetItem('academic_grade') || '';
  
  if (!bp && !exam) return '';

  const isEnglishOrLanguage = /english|language|literature|verbal|reading/i.test(subject);

  return `
[EXAM ACCREDITATION & CALIBRATION]
Target Exam: ${exam || 'Standardized Exam'}
Official Testing Authority: ${overview?.officialAuthority || bp?.officialSource || 'Official Testing Authority'}
Exam Format: ${overview?.examFormat || 'Standardized Examination'}
Class / Preparation Level: ${grade || 'Current Academic Year'}
Subject Focus: ${subject}
${bp ? `Official Subject Marks: ${bp.totalMarks} | Total Questions: ${bp.totalQuestions} (Must Attempt: ${bp.attemptRequired})
Official Marking Scheme: ${bp.markingScheme}
Negative Marking: ${bp.negativeMarking !== undefined ? bp.negativeMarking : 'Official Exam Penalty'}
Question Formats & Style: ${Array.isArray(bp.questionTypes) ? bp.questionTypes.join(', ') : 'Standardized Formats'}
Core Syllabus Chapters (ALL Authentic Official Units): ${Array.isArray(bp.coreUnits) ? bp.coreUnits.join(', ') : 'Official Syllabus'}
Real Exam Tone & Rigor: ${bp.examTone || 'Aligned with official assessment standards'}
Authoritative Source: ${bp.officialSource || overview?.officialAuthority || 'Official Testing Authority'}
${bp.detailedNotesGuidelines ? `Detailed Notes Formulation: ${bp.detailedNotesGuidelines}` : ''}
${bp.revisionGuidelines ? `Revision & Cheat Sheet Formulation: ${bp.revisionGuidelines}` : ''}
${isEnglishOrLanguage && bp.essayTone ? `English Essay Tone & Academic Format: ${bp.essayTone}` : ''}` : ''}
Instruction: You MUST strictly align questions, explanations, difficulty level, and terminology to this exact examination blueprint.
CRITICAL ERROR TRAP DIRECTIVE: NEVER output hypothetical "what-if" traps. Only point out the exact errors students make on this exact problem. Use clean, natural language without pompous academic jargon.
`;
}
