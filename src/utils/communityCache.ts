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
