import path from 'path';
import fs from 'fs';

export interface FlashcardBankItem {
  id?: number | string;
  question: string;
  answer: string;
  hint?: string;
  [key: string]: any;
}

export interface FlashcardBankEntry {
  country: string;
  exam: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string; // "All Topics Card" or specific subtopic
  feature: 'AI Flashcards';
  totalCards: number;
  flashcards: FlashcardBankItem[];
  createdAt: string;
  updatedAt: string;
  hitCount: number;
}

export function normalizeFlashcardKeyPart(str: string | undefined, fallback: string = 'general'): string {
  if (!str || typeof str !== 'string') return fallback;
  const trimmed = str.trim();

  // Canonical normalization for Full Chapter Deck / All Topics Card
  if (/^(?:all\s*topics?\s*cards?|all\s*topics?|all\s*cards?|practice\s*full\s*chapter\s*deck|full\s*chapter\s*deck|entire\s*chapter|full\s*syllabus|all)$/i.test(trimmed)) {
    return 'all_topics_card';
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

export function generateFlashcardsBankKey(params: {
  country?: string;
  exam?: string;
  grade?: string;
  subject?: string;
  chapter?: string;
  subtopic?: string;
  feature?: string;
}): string {
  const c = normalizeFlashcardKeyPart(params.country, 'global');
  const e = normalizeFlashcardKeyPart(params.exam, 'general');
  const g = normalizeFlashcardKeyPart(params.grade, 'standard');
  const s = normalizeFlashcardKeyPart(params.subject, 'general');
  const ch = normalizeFlashcardKeyPart(params.chapter, 'all');
  const sub = normalizeFlashcardKeyPart(params.subtopic, 'all_topics_card');
  const f = normalizeFlashcardKeyPart(params.feature, 'ai_flashcards');

  return `${c}__${e}__${g}__${s}__${ch}__${sub}__${f}`;
}

export function extractFlashcardsHierarchy(body: any): {
  country: string;
  exam: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string;
  feature: 'AI Flashcards';
} {
  const rawCountry = (body.country || body.academic_country || 'Global').trim();
  const country = rawCountry.toLowerCase() === 'others' || rawCountry.toLowerCase() === 'other'
    ? (body.customCountry || 'Global')
    : rawCountry;

  const exam = (body.exam || body.targetExam || body.target_exam || body.academic_exam || 'General').trim();
  const grade = (body.grade || body.gradeLevel || body.userGrade || 'Standard').trim();

  const rawTopic = (body.topic || body.prompt || body.text || '').trim();
  let subject = (body.subject || body.stream || '').trim();
  let chapter = (body.chapter || '').trim();
  let subtopic = (body.subtopic || '').trim();

  const isFullChapterMatch =
    /^(?:all|all\s*topics?|all\s*cards?|practice\s*full\s*chapter\s*deck|full\s*chapter\s*deck|entire\s*chapter|full\s*syllabus)$/i.test(subtopic) ||
    /all\s*topics?\s*cards?|practice\s*full\s*chapter\s*deck|full\s*chapter\s*deck/i.test(rawTopic);

  // Parse structured topic if subject, chapter, or subtopic are missing
  if ((!subject || !chapter || !subtopic) && rawTopic) {
    const parts = rawTopic.split(/\s*[-–—:]\s*/).map((p: string) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      if (!subject) subject = parts[0];
      if (!chapter) chapter = parts[1];
      if (!subtopic) subtopic = parts.slice(2).join(' - ');
    } else if (parts.length === 2) {
      if (subject && subject.toLowerCase() !== parts[0].toLowerCase()) {
        if (!chapter) chapter = parts[0];
        if (!subtopic) subtopic = parts[1];
      } else {
        if (!subject) subject = parts[0];
        if (!chapter) chapter = parts[1];
        if (!subtopic) subtopic = 'All Topics Card';
      }
    } else if (parts.length === 1) {
      if (!chapter) chapter = parts[0];
      if (!subtopic) subtopic = 'All Topics Card';
      if (!subject) subject = 'General Studies';
    }
  }

  if (isFullChapterMatch || !subtopic || subtopic.toLowerCase() === 'all') {
    subtopic = 'All Topics Card';
  }

  if (!subject) subject = 'General Studies';
  if (!chapter) chapter = 'Core Curriculum';

  return {
    country,
    exam,
    grade,
    subject,
    chapter,
    subtopic,
    feature: 'AI Flashcards'
  };
}

const FLASHCARDS_FILE_PATH = path.join(process.cwd(), 'flashcards.json');
const TMP_FLASHCARDS_FILE_PATH = path.join('/tmp', 'flashcards.json');

let memoryFlashcardsBank: Record<string, FlashcardBankEntry> | null = null;

export function loadFlashcardsBank(): Record<string, FlashcardBankEntry> {
  if (memoryFlashcardsBank) {
    return memoryFlashcardsBank;
  }

  try {
    const targetFile = fs.existsSync(TMP_FLASHCARDS_FILE_PATH)
      ? TMP_FLASHCARDS_FILE_PATH
      : (fs.existsSync(FLASHCARDS_FILE_PATH) ? FLASHCARDS_FILE_PATH : null);

    if (targetFile) {
      const content = fs.readFileSync(targetFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        memoryFlashcardsBank = {};
        for (const item of parsed) {
          const key = generateFlashcardsBankKey(item);
          memoryFlashcardsBank[key] = item;
        }
        return memoryFlashcardsBank;
      } else if (parsed && typeof parsed === 'object') {
        memoryFlashcardsBank = parsed;
        return memoryFlashcardsBank || {};
      }
    }
  } catch (err) {
    console.warn('[FlashcardsBank] Notice reading flashcards.json:', err);
  }

  memoryFlashcardsBank = {};
  return memoryFlashcardsBank;
}

export function saveFlashcardsBank(bank: Record<string, FlashcardBankEntry>): void {
  memoryFlashcardsBank = bank;
  const content = JSON.stringify(bank, null, 2);

  try {
    fs.writeFileSync(FLASHCARDS_FILE_PATH, content, 'utf-8');
  } catch (err) {
    try {
      fs.writeFileSync(TMP_FLASHCARDS_FILE_PATH, content, 'utf-8');
    } catch (tmpErr) {
      console.warn('[FlashcardsBank] Warning writing flashcards to /tmp:', tmpErr);
    }
  }
}

/**
 * Searches the Flashcards Bank for an exact 8-point profile match:
 * 1. country
 * 2. exam
 * 3. grade
 * 4. subject
 * 5. chapter
 * 6. subtopic (supports "All Topics Card" or specific subtopic)
 * 7. feature ("AI Flashcards")
 * 8. flashcards
 */
export function findInFlashcardsBank(params: {
  country: string;
  exam: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string;
  feature?: string;
  requestedCount?: number;
}): FlashcardBankItem[] | null {
  const bank = loadFlashcardsBank();
  const key = generateFlashcardsBankKey({
    ...params,
    feature: params.feature || 'AI Flashcards'
  });
  const entry = bank[key];

  if (!entry || !Array.isArray(entry.flashcards) || entry.flashcards.length === 0) {
    return null;
  }

  // Exact 8-Point Match Verification
  const isMatch =
    normalizeFlashcardKeyPart(entry.country) === normalizeFlashcardKeyPart(params.country) &&
    normalizeFlashcardKeyPart(entry.exam) === normalizeFlashcardKeyPart(params.exam) &&
    normalizeFlashcardKeyPart(entry.grade) === normalizeFlashcardKeyPart(params.grade) &&
    normalizeFlashcardKeyPart(entry.subject) === normalizeFlashcardKeyPart(params.subject) &&
    normalizeFlashcardKeyPart(entry.chapter) === normalizeFlashcardKeyPart(params.chapter) &&
    normalizeFlashcardKeyPart(entry.subtopic) === normalizeFlashcardKeyPart(params.subtopic) &&
    normalizeFlashcardKeyPart(entry.feature) === normalizeFlashcardKeyPart(params.feature || 'AI Flashcards');

  if (!isMatch) {
    return null;
  }

  const count = params.requestedCount || entry.flashcards.length;
  if (entry.flashcards.length < count) {
    // Bank has cards, but fewer than explicitly requested batch
    return null;
  }

  // Update usage stats
  entry.hitCount = (entry.hitCount || 0) + 1;
  entry.updatedAt = new Date().toISOString();
  saveFlashcardsBank(bank);

  return entry.flashcards.slice(0, count);
}

/**
 * Saves or appends newly generated AI flashcards to the Flashcards Bank under its exact 8-point profile.
 */
export function saveToFlashcardsBank(params: {
  country: string;
  exam: string;
  grade: string;
  subject: string;
  chapter: string;
  subtopic: string;
  feature?: 'AI Flashcards';
  flashcards: FlashcardBankItem[];
}): void {
  if (!Array.isArray(params.flashcards) || params.flashcards.length === 0) return;

  const bank = loadFlashcardsBank();
  const key = generateFlashcardsBankKey({
    ...params,
    feature: params.feature || 'AI Flashcards'
  });
  const existing = bank[key];

  let mergedCards: FlashcardBankItem[] = [];

  if (existing && Array.isArray(existing.flashcards)) {
    const existingQuestions = new Set(existing.flashcards.map(c => (c.question || '').toLowerCase().trim()));
    mergedCards = [...existing.flashcards];

    for (const card of params.flashcards) {
      const qText = (card.question || '').toLowerCase().trim();
      if (!existingQuestions.has(qText)) {
        existingQuestions.add(qText);
        mergedCards.push(card);
      }
    }
  } else {
    mergedCards = [...params.flashcards];
  }

  const normalizedSubtopic = 
    /^(?:all|all\s*topics?|all\s*cards?|practice\s*full\s*chapter\s*deck|full\s*chapter\s*deck|entire\s*chapter|full\s*syllabus)$/i.test(params.subtopic) ||
    !params.subtopic || params.subtopic.trim() === ''
      ? 'All Topics Card'
      : params.subtopic;

  bank[key] = {
    country: params.country,
    exam: params.exam,
    grade: params.grade,
    subject: params.subject,
    chapter: params.chapter,
    subtopic: normalizedSubtopic,
    feature: 'AI Flashcards',
    totalCards: mergedCards.length,
    flashcards: mergedCards,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hitCount: (existing?.hitCount || 0) + 1
  };

  saveFlashcardsBank(bank);
  console.log(`[FlashcardBank] Saved ${mergedCards.length} flashcards for [${params.country} > ${params.exam} > ${params.subject} > ${params.chapter} > ${normalizedSubtopic}]. Key: ${key}`);
}

