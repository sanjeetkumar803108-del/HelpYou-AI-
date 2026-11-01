import { auth } from '../lib/firebase';
import { safeGetItem, safeSetItem, safeJsonParse } from './storage';

/**
 * Sanitizes an email or user identifier to be safely used inside a storage key.
 * Example: "student.123@gmail.com" -> "student_123_gmail_com"
 */
export function sanitizeUserKey(identifier: string): string {
  if (!identifier) return 'guest_user';
  return identifier
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/gi, '_');
}

/**
 * Returns current authenticated or remembered user identity (email, uid, composite key).
 */
export function getCurrentUserIdentifier(): { email: string | null; uid: string | null; key: string } {
  const currentAuth = auth.currentUser;
  const email = currentAuth?.email || safeGetItem('last_logged_in_user_email');
  const uid = currentAuth?.uid || safeGetItem('last_logged_in_user');

  let key = 'guest_user';
  if (email) {
    key = `email_${sanitizeUserKey(email)}`;
  } else if (uid) {
    key = `uid_${sanitizeUserKey(uid)}`;
  }

  return { email: email || null, uid: uid || null, key };
}

/**
 * Retrieves history for a specific feature, isolated per user email/UID,
 * with multi-tier fallbacks and zero data loss migration from legacy global keys.
 */
export function getUserHistory<T>(featurePrefix: string, fallback: T): T {
  const { email, uid, key } = getCurrentUserIdentifier();

  // 1. Primary tier: Email-isolated key
  if (email) {
    const emailKey = `${featurePrefix}_email_${sanitizeUserKey(email)}`;
    const emailVal = safeGetItem(emailKey);
    if (emailVal) {
      return safeJsonParse<T>(emailVal, fallback);
    }
  }

  // 2. Secondary tier: UID-isolated key
  if (uid) {
    const uidKey = `${featurePrefix}_uid_${sanitizeUserKey(uid)}`;
    const uidVal = safeGetItem(uidKey);
    if (uidVal) {
      return safeJsonParse<T>(uidVal, fallback);
    }
    const legacyKey = `${featurePrefix}_${uid}`;
    const legacyVal = safeGetItem(legacyKey);
    if (legacyVal) {
      return safeJsonParse<T>(legacyVal, fallback);
    }
  }

  // 3. Composite active key
  const compositeVal = safeGetItem(`${featurePrefix}_${key}`);
  if (compositeVal) {
    return safeJsonParse<T>(compositeVal, fallback);
  }

  // 4. Legacy Global key: Auto-migrate to user account so past activity is never lost
  const globalVal = safeGetItem(featurePrefix);
  if (globalVal) {
    const parsed = safeJsonParse<T>(globalVal, fallback);
    if (email || uid) {
      saveUserHistory(featurePrefix, parsed);
    }
    return parsed;
  }

  return fallback;
}

/**
 * Persists history for a specific feature associated strictly with the active user email & UID.
 */
export function saveUserHistory<T>(featurePrefix: string, data: T): void {
  const { email, uid, key } = getCurrentUserIdentifier();
  const serialized = JSON.stringify(data);

  if (email) {
    safeSetItem(`${featurePrefix}_email_${sanitizeUserKey(email)}`, serialized);
  }
  if (uid) {
    safeSetItem(`${featurePrefix}_uid_${sanitizeUserKey(uid)}`, serialized);
    safeSetItem(`${featurePrefix}_${uid}`, serialized);
  }
  safeSetItem(`${featurePrefix}_${key}`, serialized);

  try {
    window.dispatchEvent(new CustomEvent('user_history_updated', {
      detail: { feature: featurePrefix, key, email, uid }
    }));
  } catch (_) {}
}

/**
 * Remembers the active user's credentials on login for continuous offline access.
 */
export function recordActiveUser(user: { email?: string | null; uid: string }): void {
  if (user.uid) {
    safeSetItem('last_logged_in_user', user.uid);
  }
  if (user.email) {
    safeSetItem('last_logged_in_user_email', user.email.toLowerCase().trim());
  }
  try {
    window.dispatchEvent(new CustomEvent('user_account_changed', { detail: user }));
  } catch (_) {}
}
