import path from 'path';
import fs from 'fs';

export interface QuestionBankItem {
  id?: number | string;
  question: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  expectedAnswer?: string;
  keyRubricPoints?: string[];
  [key: string]: any;
}

export interface QuestionBankEntry {
  country: string;
  examName: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string;
  feature: 'ai_quizzes' | 'ai_questions';
  difficulty: string;
  practiceMode: 'standard' | 'more_questions_to_practice' | string;
  totalQuestions: number;
  questions: QuestionBankItem[];
  createdAt: string;
  updatedAt: string;
  hitCount: number;
}

export function normalizeKeyPart(str: string | undefined, fallback: string = 'general'): string {
  if (!str || typeof str !== 'string') return fallback;
  const trimmed = str.trim();

  // Canonical normalization for "All Subjects / All Topics" requests
  if (/^(?:all\s*subjects?\s*(?:\/|&|-)?\s*all\s*topics?|all\s*subjects?|all\s*topics?|practice\s*entire\s*chapter|entire\s*chapter|all\s*chapters?|full\s*syllabus)$/i.test(trimmed)) {
    return 'all_subjects_all_topics';
  }

  const slug = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}


export function getTopicCeilingLimit(subtopic?: string): number {
  const norm = normalizeKeyPart(subtopic);
  if (norm === 'all_subjects_all_topics') {
    return 30; // Max 30 questions for Entire Chapter / All Topics
  }
  return 20; // Max 20 questions for Single Subtopic
}

export function getTopicAccumulatedQuestions(params: {
  country?: string;
  examName?: string;
  grade?: string;
  subject?: string;
  chapter?: string;
  subtopic?: string;
  feature: 'ai_quizzes' | 'ai_questions';
  difficulty?: string;
}): { totalCount: number; ceiling: number; isSaturated: boolean; questions: QuestionBankItem[] } {
  const bank = loadQuestionsBank();
  const c = normalizeKeyPart(params.country, 'global');
  const e = normalizeKeyPart(params.examName, 'exam');
  const g = normalizeKeyPart(params.grade, 'grade');
  const s = normalizeKeyPart(params.subject, 'subject');
  const ch = normalizeKeyPart(params.chapter, 'chapter');
  const sub = normalizeKeyPart(params.subtopic, 'all_subjects_all_topics');
  const f = normalizeKeyPart(params.feature, 'quiz');
  const d = normalizeKeyPart(params.difficulty, 'medium');

  const basePrefix = `${c}__${e}__${g}__${s}__${ch}__${sub}__${f}__${d}__`;
  const ceiling = getTopicCeilingLimit(params.subtopic);

  const seenTexts = new Set<string>();
  const accumulated: QuestionBankItem[] = [];

  for (const k of Object.keys(bank)) {
    if (k.startsWith(basePrefix)) {
      const entry = bank[k];
      if (Array.isArray(entry.questions)) {
        for (const q of entry.questions) {
          const text = (q.question || '').toLowerCase().trim();
          if (text && !seenTexts.has(text)) {
            seenTexts.add(text);
            accumulated.push(q);
          }
        }
      }
    }
  }

  const isSaturated = accumulated.length >= ceiling;
  return {
    totalCount: accumulated.length,
    ceiling,
    isSaturated,
    questions: accumulated
  };
}

export function normalizePracticeMode(mode: string | boolean | undefined): 'standard' | 'more_questions_to_practice' {
  if (mode === true || mode === 'true' || mode === 'more_questions_to_practice' || mode === 'more_practice') {
    return 'more_questions_to_practice';
  }
  return 'standard';
}

/**
 * Generates strict 9-point composite cache key:
 * 1. country
 * 2. examName
 * 3. grade
 * 4. subject
 * 5. chapter
 * 6. subtopic (supports "All Subjects / All Topics")
 * 7. feature (ai_quizzes vs ai_questions)
 * 8. difficulty
 * 9. practiceMode (standard vs more_questions_to_practice)
 */
export function generateQuestionBankKey(params: {
  country?: string;
  examName?: string;
  grade?: string;
  subject?: string;
  chapter?: string;
  subtopic?: string;
  feature: 'ai_quizzes' | 'ai_questions';
  difficulty?: string;
  practiceMode?: string | boolean;
}): string {
  const c = normalizeKeyPart(params.country, 'global');
  const e = normalizeKeyPart(params.examName, 'exam');
  const g = normalizeKeyPart(params.grade, 'grade');
  const s = normalizeKeyPart(params.subject, 'subject');
  const ch = normalizeKeyPart(params.chapter, 'chapter');
  const sub = normalizeKeyPart(params.subtopic, 'all_subjects_all_topics');
  const f = normalizeKeyPart(params.feature, 'quiz');
  const d = normalizeKeyPart(params.difficulty, 'medium');
  const p = normalizePracticeMode(params.practiceMode);

  return `${c}__${e}__${g}__${s}__${ch}__${sub}__${f}__${d}__${p}`;
}

export function extractQuestionHierarchy(body: any): {
  country: string;
  examName: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string;
  difficulty: string;
  practiceMode: 'standard' | 'more_questions_to_practice';
} {
  const rawCountry = (body.country || body.academic_country || 'Global').trim();
  const country = rawCountry.toLowerCase() === 'others' || rawCountry.toLowerCase() === 'other'
    ? (body.customCountry || 'Global')
    : rawCountry;

  const examName = (body.targetExam || body.target_exam || body.exam || body.academic_exam || 'Standardized Examination').trim();
  const grade = (body.gradeLevel || body.grade || body.userGrade || 'Senior Secondary').trim();
  const rawDifficulty = (body.difficulty || body.difficultyLevel || 'Medium').trim();
  const difficulty = rawDifficulty ? (rawDifficulty.charAt(0).toUpperCase() + rawDifficulty.slice(1).toLowerCase()) : 'Medium';
  const practiceMode = normalizePracticeMode(body.practiceMode ?? body.isMorePractice);

  const rawTopic = (body.topic || body.prompt || body.text || '').trim();
  let subject = (body.subject || body.stream || '').trim();
  let chapter = (body.chapter || '').trim();
  let subtopic = (body.subtopic || '').trim();

  // Detect if user requested All Subjects or All Topics / Full Chapter
  const isAllSubjects = 
    /all\s*subjects?|all-subjects?|every\s*subject|full\s*mock|full\s*syllabus\s*all\s*subjects/i.test(rawTopic) ||
    /all\s*subjects?|all-subjects?/i.test(subject) ||
    /all\s*subjects?|all-subjects?/i.test(subtopic);

  const isAllTopics = 
    isAllSubjects ||
    /all\s*topics?|all-topics?|practice\s*entire\s*chapter|entire\s*chapter|all\s*chapters?|full\s*syllabus/i.test(rawTopic) ||
    /all\s*topics?|all-topics?|practice\s*entire\s*chapter|entire\s*chapter/i.test(subtopic) ||
    (chapter && rawTopic.toLowerCase().endsWith(chapter.toLowerCase()));

  // Parse structured topic if subject, chapter, or subtopic are missing
  if ((!subject || !chapter || !subtopic) && rawTopic) {
    const parts = rawTopic.split(/\s*[-–—:]\s*/).map((p: string) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      if (!subject) subject = parts[0];
      if (!chapter) chapter = parts[1];
      if (!subtopic) subtopic = parts.slice(2).join(' - ');
    } else if (parts.length === 2) {
      if (!subject) {
        subject = parts[0];
        if (!chapter) chapter = parts[1];
        if (!subtopic) subtopic = isAllTopics ? 'All Subjects / All Topics' : parts[1];
      } else {
        if (!chapter) chapter = parts[0];
        if (!subtopic) subtopic = isAllTopics ? 'All Subjects / All Topics' : parts[1];
      }
    } else if (parts.length === 1) {
      if (!subject) subject = 'General Studies';
      if (!chapter) chapter = parts[0];
      if (!subtopic) subtopic = isAllTopics ? 'All Subjects / All Topics' : parts[0];
    }
  }

  if (isAllSubjects) {
    subject = subject && !/all\s*subjects?/i.test(subject) ? subject : 'All Subjects';
    chapter = chapter && !/all\s*chapters?/i.test(chapter) ? chapter : 'All Chapters';
    subtopic = 'All Subjects / All Topics';
  } else if (isAllTopics) {
    // Single subject, but all topics / entire chapter
    subtopic = 'All Subjects / All Topics';
  }

  if (!subject) subject = isAllSubjects ? 'All Subjects' : 'General Studies';
  if (!chapter) chapter = isAllSubjects ? 'All Chapters' : 'Core Curriculum';
  if (!subtopic) subtopic = isAllSubjects || isAllTopics ? 'All Subjects / All Topics' : (rawTopic || 'General Topic');

  return {
    country,
    examName,
    grade,
    subject,
    chapter,
    subtopic,
    difficulty,
    practiceMode
  };
}

const QUESTIONS_FILE_PATH = path.join(process.cwd(), 'questions.json');
const TMP_QUESTIONS_FILE_PATH = path.join('/tmp', 'questions.json');

let memoryQuestionsBank: Record<string, QuestionBankEntry> | null = null;

export function loadQuestionsBank(): Record<string, QuestionBankEntry> {
  if (memoryQuestionsBank) {
    return memoryQuestionsBank;
  }

  try {
    if (fs.existsSync(TMP_QUESTIONS_FILE_PATH)) {
      const content = fs.readFileSync(TMP_QUESTIONS_FILE_PATH, 'utf-8');
      memoryQuestionsBank = JSON.parse(content);
      return memoryQuestionsBank || {};
    }
    if (fs.existsSync(QUESTIONS_FILE_PATH)) {
      const content = fs.readFileSync(QUESTIONS_FILE_PATH, 'utf-8');
      memoryQuestionsBank = JSON.parse(content);
      return memoryQuestionsBank || {};
    }
  } catch (err) {
    console.warn('[QuestionsBank] Notice reading questions.json:', err);
  }

  memoryQuestionsBank = {};
  return memoryQuestionsBank;
}

export function saveQuestionsBank(bank: Record<string, QuestionBankEntry>): void {
  memoryQuestionsBank = bank;
  const content = JSON.stringify(bank, null, 2);

  try {
    fs.writeFileSync(QUESTIONS_FILE_PATH, content, 'utf-8');
  } catch (err) {
    try {
      fs.writeFileSync(TMP_QUESTIONS_FILE_PATH, content, 'utf-8');
    } catch (tmpErr) {
      console.warn('[QuestionsBank] Warning writing questions to /tmp:', tmpErr);
    }
  }
}

/**
 * Searches the Question Bank for an exact 9-point profile match:
 * 1. country
 * 2. examName
 * 3. grade
 * 4. subject
 * 5. chapter
 * 6. subtopic (supports "All Subjects / All Topics")
 * 7. feature (ai_quizzes vs ai_questions)
 * 8. difficulty
 * 9. practiceMode (standard vs more_questions_to_practice)
 */
export function findInQuestionBank(params: {
  country: string;
  examName: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string;
  feature: 'ai_quizzes' | 'ai_questions';
  difficulty: string;
  practiceMode?: string | boolean;
  requestedCount?: number;
  avoidTexts?: string[];
}): QuestionBankItem[] | null {
  const bank = loadQuestionsBank();
  const key = generateQuestionBankKey(params);
  const entry = bank[key];

  if (!entry || !Array.isArray(entry.questions) || entry.questions.length === 0) {
    return null;
  }

  // Exact 9-Point Match Verification
  const isMatch =
    normalizeKeyPart(entry.country) === normalizeKeyPart(params.country) &&
    normalizeKeyPart(entry.examName) === normalizeKeyPart(params.examName) &&
    normalizeKeyPart(entry.grade) === normalizeKeyPart(params.grade) &&
    normalizeKeyPart(entry.subject) === normalizeKeyPart(params.subject) &&
    normalizeKeyPart(entry.chapter) === normalizeKeyPart(params.chapter) &&
    normalizeKeyPart(entry.subtopic) === normalizeKeyPart(params.subtopic) &&
    normalizeKeyPart(entry.feature) === normalizeKeyPart(params.feature) &&
    normalizeKeyPart(entry.difficulty) === normalizeKeyPart(params.difficulty) &&
    normalizePracticeMode(entry.practiceMode) === normalizePracticeMode(params.practiceMode);

  if (!isMatch) {
    return null;
  }

  // Filter out any questions the user already answered if avoidTexts is provided
  let candidateQuestions = entry.questions;
  if (Array.isArray(params.avoidTexts) && params.avoidTexts.length > 0) {
    const avoidSet = new Set(params.avoidTexts.map(t => (t || '').toLowerCase().trim()));
    const unasked = candidateQuestions.filter(q => {
      const qText = (q.question || '').toLowerCase().trim();
      return !avoidSet.has(qText);
    });
    // If we have enough unasked questions, use them
    if (unasked.length >= (params.requestedCount || 1)) {
      candidateQuestions = unasked;
    }
  }

  const count = params.requestedCount || candidateQuestions.length;
  if (candidateQuestions.length < count) {
    // Bank doesn't have enough questions for this requested batch
    return null;
  }

  // Update usage stats
  entry.hitCount = (entry.hitCount || 0) + 1;
  entry.updatedAt = new Date().toISOString();
  saveQuestionsBank(bank);

  return candidateQuestions.slice(0, count);
}

/**
 * Saves or appends newly generated AI questions to the Question Bank under its exact 9-point profile.
 */
export function saveToQuestionBank(params: {
  country: string;
  examName: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string;
  feature: 'ai_quizzes' | 'ai_questions';
  difficulty: string;
  practiceMode?: string | boolean;
  questions: QuestionBankItem[];
}): void {
  if (!Array.isArray(params.questions) || params.questions.length === 0) return;

  const ceiling = getTopicCeilingLimit(params.subtopic);
  const saturation = getTopicAccumulatedQuestions({
    country: params.country,
    examName: params.examName,
    grade: params.grade,
    subject: params.subject,
    chapter: params.chapter,
    subtopic: params.subtopic,
    feature: params.feature,
    difficulty: params.difficulty
  });

  const bank = loadQuestionsBank();
  const key = generateQuestionBankKey(params);
  const existing = bank[key];

  // If topic has already reached ceiling and this entry already exists, do not allow further bloat
  if (saturation.totalCount >= ceiling && existing && existing.questions?.length > 0) {
    console.log(`[QuestionsBank] Topic already saturated (${saturation.totalCount}/${ceiling}). No extra questions needed for [${key}].`);
    return;
  }

  let mergedQuestions: QuestionBankItem[] = [];

  if (existing && Array.isArray(existing.questions)) {
    const existingTexts = new Set(existing.questions.map(q => (q.question || '').toLowerCase().trim()));
    mergedQuestions = [...existing.questions];

    for (const q of params.questions) {
      const qText = (q.question || '').toLowerCase().trim();
      if (!existingTexts.has(qText)) {
        existingTexts.add(qText);
        mergedQuestions.push(q);
      }
    }
  } else {
    mergedQuestions = [...params.questions];
  }

  // Cap to ensure total accumulated across entries never exceeds ceiling
  const otherEntriesCount = saturation.totalCount - (existing?.questions?.length || 0);
  const allowedForThisEntry = Math.max(1, ceiling - otherEntriesCount);
  if (mergedQuestions.length > allowedForThisEntry) {
    mergedQuestions = mergedQuestions.slice(0, allowedForThisEntry);
  }

  const finalPracticeMode = normalizePracticeMode(params.practiceMode);

  bank[key] = {
    country: params.country,
    examName: params.examName,
    grade: params.grade,
    subject: params.subject,
    chapter: params.chapter,
    subtopic: params.subtopic,
    feature: params.feature,
    difficulty: params.difficulty,
    practiceMode: finalPracticeMode,
    totalQuestions: mergedQuestions.length,
    questions: mergedQuestions,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hitCount: (existing?.hitCount || 0) + 1
  };

  saveQuestionsBank(bank);
  console.log(`[QuestionsBank] Saved ${mergedQuestions.length} questions for [${params.country} > ${params.examName} > ${params.subject} > ${params.chapter} > ${params.subtopic} (${params.feature} | mode: ${finalPracticeMode})]. Key: ${key}`);
}
