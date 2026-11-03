import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { safeGetItem, safeSetItem } from './storage';
import { getApiUrl } from './api';

export type FeatureType = 'quiz' | 'subjective_questions' | 'notes' | 'flashcards';

export interface CacheKeyParams {
  country?: string;
  exam?: string;
  grade?: string;
  subject: string;
  chapter?: string;
  subTopic?: string;
  feature: FeatureType;
}

export interface CachedDocument<T = any> {
  cacheKey: string;
  country: string;
  exam: string;
  grade: string;
  subject: string;
  chapter: string;
  subTopic: string;
  feature: FeatureType;
  content: T;
  createdAt: string;
  accessCount?: number;
  model?: string;
  metadata?: Record<string, any>;
}

/**
 * Sanitizes an arbitrary string into a deterministic, filesystem/URL safe slug.
 */
function slugify(text: string | undefined, fallback: string = 'general'): string {
  if (!text || typeof text !== 'string') return fallback;
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-word characters except hyphen and spaces
    .replace(/[\s_-]+/g, '_') // collapse spaces and dashes to underscore
    .replace(/^_+|_+$/g, ''); // trim leading/trailing underscores
  return slug || fallback;
}

/**
 * Resolves active user profile details from localStorage with safe fallbacks.
 */
export function resolveActiveProfileParams(overrides?: Partial<CacheKeyParams>): CacheKeyParams {
  const uid = safeGetItem('last_logged_in_user') || '';

  const country = overrides?.country
    || (uid ? safeGetItem(`academic_country_${uid}`) : null)
    || safeGetItem('academic_country')
    || safeGetItem('country')
    || 'India';

  const exam = overrides?.exam
    || (uid ? safeGetItem(`academic_exam_${uid}`) : null)
    || safeGetItem('academic_exam')
    || safeGetItem('target_exam')
    || 'NEET';

  const grade = overrides?.grade
    || (uid ? safeGetItem(`academic_grade_${uid}`) : null)
    || safeGetItem('academic_grade')
    || safeGetItem('gradeLevel')
    || 'Class 11';

  return {
    country,
    exam,
    grade,
    subject: overrides?.subject || 'Physics',
    chapter: overrides?.chapter || 'General',
    subTopic: overrides?.subTopic || 'General',
    feature: overrides?.feature || 'quiz'
  };
}

/**
 * Constructs deterministic slug string for logging or tracking.
 */
export function buildDeterministicCacheKey(params: CacheKeyParams): string {
  const c = slugify(params.country, 'india');
  const e = slugify(params.exam, 'general_exam');
  const g = slugify(params.grade, 'senior');
  const s = slugify(params.subject, 'general_subject');
  const ch = slugify(params.chapter, 'ch_all');
  const st = slugify(params.subTopic, 'st_all');
  const f = slugify(params.feature, 'quiz');

  return `${c}__${e}__${g}__${s}__${ch}__${st}__${f}`;
}

const COMMON_NON_ACADEMIC_PATTERNS = [
  /^(thik|theek|sahi|accha|acha|mast|badhiya)\s*(hai|h|he)?(\s*bhai|\s*bro|\s*yaar|\s*sir)?$/i,
  /\b(thik\s*hai|theek\s*hai|sahi\s*hai|accha\s*hai)\b/i,
  /^(hello|hi|hey|bye|good\s*morning|good\s*night|good\s*evening)(\s*bhai|\s*bro|\s*yaar|\s*sir)?$/i,
  /^(ok|okay|k|okk|okey|yup|nope|yes|no)(\s*bhai|\s*bro|\s*yaar)?$/i,
  /^(test|testing|demo|check|trial|sample)(\s*\d+)?$/i,
  /^(asdf|qwerty|zxcv|abc|xyz|123|000|aaa|bbb|ccc)/i,
  /^(kuch\s*bhi|faltu|bakwas|bakwaas|nonsense|random|timepass|nothing|none)$/i,
  /\b(kuch\s*bhi|timepass|bakwaas|faltu)\b/i,
  /^(kya\s*hal|kaise\s*ho|what('?s)?\s*up|how\s*are\s*you|kya\s*chal\s*raha)$/i,
  /^(lol|lmao|rofl|haha|hehe|xd|omg)$/i,
  /^(bhai|bro|yaar|sir|madam|dost)$/i,
  /^(mujhe\s*nahi\s*pata|pata\s*nahi|nahi\s*pata|kuch\s*nahi|dont\s*know|i\s*dont\s*know|idk|naah|nope)$/i,
  /^(padhai\s*nahi\s*karni|bore\s*ho\s*raha|bore|boring)$/i,
  /^(chalo|bye|goodbye|tata|see\s*you)$/i,
  /^(what\s*to\s*do|what\s*is\s*this|who\s*are\s*you|kya\s*hai\s*ye)$/i,
  /^([a-z])\1{3,}$/i
];

/**
 * Detects whether a string is obvious keyboard mashing, unpronounceable sequence, or gibberish.
 */
export function isGibberishCandidate(text: string): boolean {
  if (!text) return true;
  const clean = text.toLowerCase().trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  for (const w of words) {
    const letters = w.replace(/[^a-z]/g, '');
    if (letters.length >= 4) {
      // Must contain at least one vowel (a, e, i, o, u, y)
      if (!/[aeiouy]/.test(letters)) return true;

      // 5 or more consonants in a row (e.g. "dsghcdbc")
      if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(letters)) return true;

      // 3 or more of the same letter in a row (e.g. "aaaa", "zzzz")
      if (/([a-z])\1{2,}/i.test(letters)) return true;

      // Repeated 2-3 char chunks (e.g. "abcabcabc", "hahaha", "asdfasdf")
      if (/(.{2,3})\1{2,}/i.test(letters)) return true;
    }
  }

  // Keyboard row mash check (4 or more consecutive keyboard keys)
  const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (const row of keyRows) {
    for (let i = 0; i <= row.length - 4; i++) {
      const sub = row.substring(i, i + 4);
      if (clean.includes(sub)) return true;
    }
  }

  return false;
}

/**
 * Validates whether user-entered custom sub-topic is a genuine academic concept
 * rather than random chatter, slang, or gibberish.
 */
export function isValidAcademicTopicInput(
  input: string | undefined, 
  chapterName?: string
): { isValid: boolean; error?: string } {
  if (!input || typeof input !== 'string') {
    return { isValid: false, error: 'Please enter a topic name.' };
  }

  const trimmed = input.trim();

  if (trimmed.length < 3) {
    return { isValid: false, error: 'Topic name is too short. Please enter a full concept name.' };
  }

  if (trimmed.length > 70) {
    return { isValid: false, error: 'Topic name is too long. Please enter a concise concept or formula.' };
  }

  // Pure digits or non-alphanumeric punctuation
  if (/^[\d\s\-_.,!?:;@#$%^&*()+=/\\|<>~`"'{}\[\]]+$/.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid academic concept (e.g., Projectile Motion, Free Fall).' };
  }

  // Check against gibberish & keyboard mashing
  if (isGibberishCandidate(trimmed)) {
    return {
      isValid: false,
      error: `"${trimmed}" does not look like a valid academic concept for ${chapterName ? `"${chapterName}"` : 'this chapter'}. Please enter a real syllabus topic.`
    };
  }

  // Check against casual chatter & slang patterns
  for (const pattern of COMMON_NON_ACADEMIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { 
        isValid: false, 
        error: `"${trimmed}" is not a valid academic topic. Please enter a real concept for ${chapterName ? `"${chapterName}"` : 'this chapter'} (e.g. Relative Velocity, Graphs).` 
      };
    }
  }

  return { isValid: true };
}

/**
 * Asynchronously verifies with AI whether a user-input subtopic genuinely
 * belongs to the specified subject and chapter before adding it or generating content.
 */
export async function verifySubTopicWithAI(
  subject: string,
  chapter: string,
  subTopic: string,
  examName?: string,
  country?: string
): Promise<{ isValid: boolean; cleanTitle?: string; error?: string }> {
  const trimmed = (subTopic || '').trim();
  
  // 1. Instant client-side check
  const localCheck = isValidAcademicTopicInput(trimmed, chapter);
  if (!localCheck.isValid) {
    return { isValid: false, error: localCheck.error };
  }

  // 2. Call backend AI verification endpoint
  try {
    const res = await fetch(getApiUrl('/api/verify-subtopic'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        chapter,
        subTopic: trimmed,
        examName,
        country
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { 
        isValid: false, 
        error: errData.errorMessage || errData.error || `Could not verify "${trimmed}". Please try again.` 
      };
    }

    const data = await res.json();
    if (!data.isValid) {
      return {
        isValid: false,
        error: data.errorMessage || `"${trimmed}" is not a recognized academic concept for ${chapter}.`
      };
    }

    return {
      isValid: true,
      cleanTitle: data.cleanTitle || trimmed
    };
  } catch (err: any) {
    console.warn('[verifySubTopicWithAI] AI verification network notice:', err);
    // If offline or network issue, fallback to strict client check
    return localCheck;
  }
}

/**
 * Parses any topic string (e.g. "Physics - Kinematics - Projectile Motion" or "Laws of Motion")
 * into normalized subject, chapter, and sub-topic components.
 */
export function parseTopicHierarchy(rawTopic: string, fallbackSubject?: string): {
  subject: string;
  chapter: string;
  subTopic: string;
} {
  if (!rawTopic || typeof rawTopic !== 'string') {
    return { subject: fallbackSubject || 'General', chapter: 'All', subTopic: 'All' };
  }
  const parts = rawTopic.split(/\s*[-–—:]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { subject: parts[0], chapter: parts[1], subTopic: parts.slice(2).join(' - ') };
  }
  if (parts.length === 2) {
    return { subject: parts[0], chapter: parts[1], subTopic: 'All' };
  }
  return { subject: fallbackSubject || 'General', chapter: parts[0] || 'All', subTopic: 'All' };
}

/**
 * DATABASE CACHING COMPLETELY PERMANENTLY REMOVED:
 * Every feature now generates 100% fresh, live, personalized AI content every single time.
 * Always returns null so no stale database or memory cache is ever served to the user.
 */
export async function getCachedCurriculumContent<T = any>(
  _rawParams: CacheKeyParams
): Promise<{ content: T; isCached: true; source: 'memory' | 'local' | 'cloud' } | null> {
  // Always return null: No database caching. Fresh AI generation guaranteed.
  return null;
}

/**
 * Synchronous local check to see if content is already cached.
 * Always returns false since database caching is completely removed.
 */
export function isCurriculumContentCached(_rawParams: CacheKeyParams): boolean {
  return false;
}

/**
 * Retrieves list of verified custom sub-topics for a given subject and chapter.
 * Automatically sanitizes and prunes any stale or invalid entries.
 */
export function getVerifiedChapterSubTopics(subject: string, chapter: string): string[] {
  try {
    const cleanSubj = slugify(subject);
    const cleanChap = slugify(chapter);
    const storageKey = `verified_subtopics_${cleanSubj}__${cleanChap}`;
    const raw = safeGetItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(t => typeof t === 'string' && isValidAcademicTopicInput(t, chapter).isValid);
        // Automatically prune previously saved gibberish or invalid entries from local storage
        if (filtered.length !== parsed.length) {
          safeSetItem(storageKey, JSON.stringify(filtered));
        }
        return filtered;
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Removes a custom sub-topic from persistent storage and triggers UI refresh across all views.
 */
export function removeCustomChapterSubTopic(subject: string, chapter: string, subTopic: string): void {
  if (!subject || !chapter || !subTopic) return;
  const cleanSubj = slugify(subject);
  const cleanChap = slugify(chapter);
  const storageKey = `verified_subtopics_${cleanSubj}__${cleanChap}`;

  try {
    const current = getVerifiedChapterSubTopics(subject, chapter);
    const updated = current.filter(t => t.toLowerCase().trim() !== subTopic.toLowerCase().trim());
    safeSetItem(storageKey, JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('helpyou-curriculum-updated', {
        detail: { subject, chapter, removedSubTopic: subTopic }
      }));
    }
  } catch (err) {
    console.warn('[removeCustomChapterSubTopic] Error removing subtopic:', err);
  }
}

/**
 * Registers a verified custom sub-topic into persistent local storage and Cloud Firestore.
 * Automatically notifies all open UI generators to update their unit lists in real time.
 */
export function registerVerifiedChapterSubTopic(subject: string, chapter: string, subTopic: string): void {
  if (!subTopic || typeof subTopic !== 'string') return;
  const trimmed = subTopic.trim();
  const validity = isValidAcademicTopicInput(trimmed, chapter);
  if (!validity.isValid) return;

  const cleanSubj = slugify(subject);
  const cleanChap = slugify(chapter);
  const storageKey = `verified_subtopics_${cleanSubj}__${cleanChap}`;

  try {
    const current = getVerifiedChapterSubTopics(subject, chapter);
    const alreadyExists = current.some(t => t.toLowerCase().trim() === trimmed.toLowerCase());
    if (!alreadyExists) {
      const updated = [...current, trimmed];
      safeSetItem(storageKey, JSON.stringify(updated));

      // Asynchronously sync subtopic definition to Cloud Firestore
      const firestoreKey = `${cleanSubj}__${cleanChap}`;
      setDoc(doc(db, 'global_curriculum_subtopics', firestoreKey), {
        subject,
        chapter,
        subTopics: updated,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch((err) => {
        console.warn('[communityCache] Cloud subtopic sync notice:', err);
      });

      // Dispatch event to re-render all curriculum accordions across the app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('helpyou-curriculum-updated', {
          detail: { subject, chapter, subTopic: trimmed }
        }));
      }
    }
  } catch (err) {
    console.warn('[communityCache] Error registering subtopic:', err);
  }
}

/**
 * DATABASE CACHE SAVING COMPLETELY REMOVED:
 * No AI responses or generated content are saved to database or local cache.
 * Every user request generates pure, live, fresh AI content.
 */
export async function saveCachedCurriculumContent<T = any>(
  rawParams: CacheKeyParams,
  _content: T,
  _extraMetadata?: Record<string, any>
): Promise<boolean> {
  // If user entered a custom subtopic, register it into chapter units list
  if (rawParams.subTopic && rawParams.subTopic !== 'All') {
    registerVerifiedChapterSubTopic(rawParams.subject, rawParams.chapter || 'All', rawParams.subTopic);
  }
  return true;
}

// Purge any stale legacy cache items from localStorage on initial script execution
if (typeof window !== 'undefined') {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('comm_cache_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (_) {}
}
