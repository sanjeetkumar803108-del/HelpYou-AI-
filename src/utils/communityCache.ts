import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { safeGetItem, safeSetItem } from './storage';

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
 * Constructs the 6-layer bulletproof deterministic cache ID.
 * Format: {country}__{exam}__{grade}__{subject}__{chapter}__{subtopic}__{feature}
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
 * In-memory fast cache map to avoid repeated network roundtrips during an active session.
 */
const inMemoryCache = new Map<string, { content: any; timestamp: number }>();

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
 * Checks and retrieves cached content from memory, localStorage, and Cloud Firestore.
 * Returns null if not cached yet (Cache Miss).
 */
export async function getCachedCurriculumContent<T = any>(
  rawParams: CacheKeyParams
): Promise<{ content: T; isCached: true; source: 'memory' | 'local' | 'cloud' } | null> {
  try {
    const params = resolveActiveProfileParams(rawParams);

    // Guard: Never cache invalid, slang, or non-academic sub-topics
    if (params.subTopic && params.subTopic !== 'All') {
      const check = isValidAcademicTopicInput(params.subTopic, params.chapter);
      if (!check.isValid) {
        console.warn(`[communityCache] Skipping cache write for non-academic sub-topic: ${params.subTopic}`);
        return false;
      }
    }

    const key = buildDeterministicCacheKey(params);

    // 1. Memory check (Instant ~0ms)
    const memHit = inMemoryCache.get(key);
    if (memHit && memHit.content) {
      return { content: memHit.content, isCached: true, source: 'memory' };
    }

    // 2. LocalStorage check (Fast ~2ms)
    const localRaw = safeGetItem(`comm_cache_${key}`);
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw);
        if (parsed && parsed.content) {
          inMemoryCache.set(key, { content: parsed.content, timestamp: Date.now() });
          return { content: parsed.content, isCached: true, source: 'local' };
        }
      } catch (_) {
        // Ignore JSON parse failure
      }
    }

    // 3. Cloud Firestore Community Cache lookup (~50-100ms)
    // Wrap with timeout to guarantee the app never hangs if offline or slow
    const fetchDocPromise = getDoc(doc(db, 'global_curriculum_cache', key));
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));

    const snap = await Promise.race([fetchDocPromise, timeoutPromise]);
    if (snap && 'exists' in snap && snap.exists()) {
      const data = snap.data() as CachedDocument<T>;
      if (data && data.content) {
        // Hydrate local storage and memory
        inMemoryCache.set(key, { content: data.content, timestamp: Date.now() });
        safeSetItem(`comm_cache_${key}`, JSON.stringify({ content: data.content, timestamp: Date.now() }));
        return { content: data.content, isCached: true, source: 'cloud' };
      }
    }

    return null;
  } catch (err) {
    console.warn('[communityCache] Lookup silent fallback:', err);
    return null;
  }
}

/**
 * Saves freshly generated curriculum content to Cloud Firestore and local storage.
 * Completely isolates the questions/notes from any individual user score or answers.
 */
export async function saveCachedCurriculumContent<T = any>(
  rawParams: CacheKeyParams,
  content: T,
  extraMetadata?: Record<string, any>
): Promise<boolean> {
  if (!content) return false;

  try {
    const params = resolveActiveProfileParams(rawParams);

    // Guard: Never cache invalid, slang, or non-academic sub-topics
    if (params.subTopic && params.subTopic !== 'All') {
      const check = isValidAcademicTopicInput(params.subTopic, params.chapter);
      if (!check.isValid) {
        console.warn(`[communityCache] Skipping cache write for non-academic sub-topic: ${params.subTopic}`);
        return false;
      }
    }

    const key = buildDeterministicCacheKey(params);

    // Save to in-memory cache immediately
    inMemoryCache.set(key, { content, timestamp: Date.now() });

    // Save to local storage for instant offline access
    safeSetItem(`comm_cache_${key}`, JSON.stringify({ content, timestamp: Date.now() }));

    // Prepare well-arranged cloud document with comprehensive metadata
    const docData: CachedDocument<T> = {
      cacheKey: key,
      country: params.country || 'India',
      exam: params.exam || 'NEET',
      grade: params.grade || 'Class 11',
      subject: params.subject,
      chapter: params.chapter || 'All',
      subTopic: params.subTopic || 'All',
      feature: params.feature,
      content,
      createdAt: new Date().toISOString(),
      accessCount: 1,
      model: 'gemini-flash-lite',
      metadata: extraMetadata || {}
    };

    // Asynchronously write to Cloud Firestore without blocking the UI
    setDoc(doc(db, 'global_curriculum_cache', key), docData, { merge: true })
      .catch((writeErr) => {
        console.warn('[communityCache] Cloud Firestore background cache write skipped/deferred:', writeErr);
      });

    return true;
  } catch (err) {
    console.warn('[communityCache] Save silent error:', err);
    return false;
  }
}
