import { safeGetItem, safeSetItem } from './storage';

export interface SubjectBlueprint {
  totalMarks: number | string;
  totalQuestions: number;
  attemptRequired: number;
  markingScheme: string;
  questionTypes: string[];
  coreUnits: string[];
  nomenclature?: string;
  examTone: string;
  officialSource?: string;
}

export interface ExamBlueprintMap {
  [subject: string]: SubjectBlueprint;
}

export interface UserExamDossier {
  exam: string;
  grade: string;
  country: string;
  lastUpdated?: string;
  subjectsBlueprint: ExamBlueprintMap;
}

/**
 * Retrieves the permanently saved exam blueprint dictionary for the active user.
 */
export function getStoredExamBlueprint(userId?: string): ExamBlueprintMap | null {
  const uid = userId || safeGetItem('last_logged_in_user') || '';
  const raw = (uid ? safeGetItem(`user_exam_blueprint_${uid}`) : null) 
    || safeGetItem('user_exam_blueprint') 
    || safeGetItem('academic_exam_blueprint');
  
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Ignore parse error
  }
  return null;
}

/**
 * Permanently saves or merges the exam blueprint dictionary in local storage.
 */
export function saveStoredExamBlueprint(blueprint: ExamBlueprintMap, userId?: string): void {
  if (!blueprint || typeof blueprint !== 'object') return;
  const uid = userId || safeGetItem('last_logged_in_user') || '';
  const jsonStr = JSON.stringify(blueprint);
  safeSetItem('user_exam_blueprint', jsonStr);
  safeSetItem('academic_exam_blueprint', jsonStr);
  if (uid) {
    safeSetItem(`user_exam_blueprint_${uid}`, jsonStr);
  }
  try {
    window.dispatchEvent(new CustomEvent('academic_profile_updated'));
  } catch (_) {}
}

/**
 * Retrieves the specific blueprint for a single subject (e.g. "Physics", "Chemistry").
 */
export function getSubjectBlueprint(subject: string, userId?: string): SubjectBlueprint | null {
  const map = getStoredExamBlueprint(userId);
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
 * Injects the student's authentic examination blueprint into any AI system instruction or prompt
 * (used across AI Tutor, Question Generator, Quiz Generator, Test Prep, and Flashcards).
 */
export function formatBlueprintForAIPrompt(subject: string, userId?: string): string {
  const bp = getSubjectBlueprint(subject, userId);
  const exam = safeGetItem('academic_exam') || safeGetItem('target_exam') || '';
  const grade = safeGetItem('academic_grade') || '';
  
  if (!bp && !exam) return '';

  return `
[EXAM ACCREDITATION & CALIBRATION]
Target Exam: ${exam || 'Standardized Exam'}
Class / Preparation Level: ${grade || 'Current Academic Year'}
Subject Focus: ${subject}
${bp ? `Official Marking Scheme: ${bp.markingScheme} (Subject Marks: ${bp.totalMarks}, Questions: ${bp.attemptRequired}/${bp.totalQuestions})
Question Formats & Style: ${Array.isArray(bp.questionTypes) ? bp.questionTypes.join(', ') : 'Standardized Formats'}
Core Syllabus Chapters: ${Array.isArray(bp.coreUnits) ? bp.coreUnits.join(', ') : 'Official Syllabus'}
Real Exam Tone & Rigor: ${bp.examTone || 'Aligned with official assessment standards'}
Authoritative Source: ${bp.officialSource || 'Official Testing Authority'}` : ''}
Instruction: You MUST strictly align questions, explanations, difficulty level, and terminology to this exact examination blueprint.
CRITICAL ERROR TRAP DIRECTIVE: NEVER output hypothetical "what-if" traps (e.g., do NOT say "if this was cosine"). Only point out the exact errors students make on this exact problem, specifically the false product rule (u·v)' = u'·v', dropped chain-rule multipliers, and sign/algebraic distribution errors. Use clean, natural language without pompous academic jargon.
`;
}

