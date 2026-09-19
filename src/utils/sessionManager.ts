import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { db, auth } from '../lib/firebase';
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage';
import { clearGoogleCredentialState } from './clearGoogleCredential';

const SESSION_STORAGE_KEY_PREFIX = 'active_device_session_';

/**
 * Returns the locally stored session ID for the user
 */
export function getLocalSessionId(userId: string): string | null {
  return safeGetItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`) || safeGetItem('active_device_session_id');
}

/**
 * Sets the locally stored session ID for the user
 */
export function setLocalSessionId(userId: string, sessionId: string): void {
  safeSetItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`, sessionId);
  safeSetItem('active_device_session_id', sessionId);
}

/**
 * Clears the locally stored session ID
 */
export function clearLocalSessionId(userId?: string): void {
  if (userId) {
    safeRemoveItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`);
  }
  safeRemoveItem('active_device_session_id');
}

/**
 * Generates a unique device session token
 */
export function generateNewSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 12);
  const platform = Capacitor.getPlatform() || 'web';
  return `sess_${platform}_${timestamp}_${randomPart}`;
}

/**
 * Registers a fresh active session on this device for the given user.
 * MUST be called whenever the user logs in (Email/Password, Google, etc.).
 * This immediately supersedes any prior active session on any other device.
 */
export async function registerActiveSession(userId: string): Promise<string> {
  const newSessionId = generateNewSessionId();
  setLocalSessionId(userId, newSessionId);

  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      currentSessionId: newSessionId,
      lastLoginAt: serverTimestamp(),
      lastActivePlatform: Capacitor.getPlatform() || 'web',
      lastActiveDeviceId: newSessionId
    }, { merge: true });

    console.log(`[SessionManager] Registered new active session for user ${userId}: ${newSessionId}`);
  } catch (err) {
    console.error('[SessionManager] Error saving active session to Firestore:', err);
  }

  return newSessionId;
}

/**
 * Checks session on app boot for an already authenticated user.
 * Returns:
 * - 'valid': local session matches remote session
 * - 'conflict': remote session differs (logged in elsewhere) -> MUST LOG OUT
 * - 'initialized': new session initialized for user
 */
export async function verifyOrInitSessionOnBoot(userId: string): Promise<'valid' | 'conflict' | 'initialized'> {
  const localSessionId = getLocalSessionId(userId);

  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    const remoteSessionId = snap.exists() ? snap.data()?.currentSessionId : null;

    // Case 1: Firestore already has an active remote session
    if (remoteSessionId) {
      if (localSessionId && localSessionId === remoteSessionId) {
        return 'valid';
      }
      if (localSessionId && localSessionId !== remoteSessionId) {
        // Conflict! Remote has a newer/different session ID
        console.warn(`[SessionManager] Boot session mismatch for ${userId}. Local: ${localSessionId}, Remote: ${remoteSessionId}`);
        return 'conflict';
      }
      // If no local session exists but remote exists on a fresh startup with cached auth,
      // this device does not own the current session
      if (!localSessionId) {
        console.warn(`[SessionManager] Missing local session while remote exists for ${userId}`);
        return 'conflict';
      }
    }

    // Case 2: No remote session registered yet (e.g. legacy account before this update)
    const newSessionId = localSessionId || generateNewSessionId();
    setLocalSessionId(userId, newSessionId);
    await setDoc(userDocRef, {
      currentSessionId: newSessionId,
      lastLoginAt: serverTimestamp(),
      lastActivePlatform: Capacitor.getPlatform() || 'web'
    }, { merge: true });
    return 'initialized';
  } catch (err) {
    console.warn('[SessionManager] Error verifying session on boot:', err);
    return 'valid'; // Don't block if temporary network glitch
  }
}

/**
 * Real-time listener that monitors the user's document in Firestore.
 * If another device logs in, Firestore pushes the new currentSessionId in real time,
 * triggering the onConflict callback immediately.
 */
export function listenToActiveSession(
  userId: string, 
  onConflict: (details?: { remotePlatform?: string }) => void
): Unsubscribe {
  const userDocRef = doc(db, 'users', userId);
  let isInitial = true;

  const unsubscribe = onSnapshot(userDocRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const remoteSessionId = data?.currentSessionId;
    const localSessionId = getLocalSessionId(userId);

    if (isInitial) {
      isInitial = false;
      // On initial snapshot, if remote session exists and local exists and they differ, flag conflict
      if (remoteSessionId && localSessionId && remoteSessionId !== localSessionId) {
        console.warn(`[SessionManager] Initial snapshot session conflict! Local: ${localSessionId}, Remote: ${remoteSessionId}`);
        onConflict({ remotePlatform: data?.lastActivePlatform });
      }
      return;
    }

    // On subsequent updates pushed by Firestore (e.g. second phone logs in right now):
    if (remoteSessionId && localSessionId && remoteSessionId !== localSessionId) {
      console.warn(`[SessionManager] Real-time session conflict detected! Local: ${localSessionId}, Remote: ${remoteSessionId}`);
      onConflict({ remotePlatform: data?.lastActivePlatform });
    }
  }, (err) => {
    console.warn('[SessionManager] Real-time session listener notice:', err);
  });

  return unsubscribe;
}

/**
 * Performs a complete, clean logout on session conflict.
 */
export async function terminateSessionDueToConflict(userId?: string): Promise<void> {
  clearLocalSessionId(userId);

  if (Capacitor.isNativePlatform()) {
    try {
      await FirebaseAuthentication.signOut();
    } catch (_) {}
    try {
      await clearGoogleCredentialState();
    } catch (_) {}
  }

  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[SessionManager] SignOut notice:', err);
  }
}
