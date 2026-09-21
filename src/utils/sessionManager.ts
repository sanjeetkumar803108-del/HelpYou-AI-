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
      // On initial snapshot:
      if (remoteSessionId && localSessionId && remoteSessionId !== localSessionId) {
        console.warn(`[SessionManager] Initial snapshot session conflict! Local: ${localSessionId}, Remote: ${remoteSessionId}`);
        onConflict({ remotePlatform: data?.lastActivePlatform });
      } else if (!remoteSessionId) {
        // Auto-register session if legacy user document has no session ID yet
        registerActiveSession(userId).catch(e => console.warn('[SessionManager] Auto-register notice:', e));
      } else if (remoteSessionId && !localSessionId) {
        // Existing active session on current device: adopt the remoteSessionId locally
        console.log(`[SessionManager] Current device adopting active session for user ${userId}: ${remoteSessionId}`);
        setLocalSessionId(userId, remoteSessionId);
      }
      return;
    }

    // On subsequent updates pushed by Firestore (when another mobile logs in in real time):
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
  safeRemoveItem('helpyou_active_user_session');
  safeRemoveItem('last_logged_in_user');
  safeSetItem('session_conflict_notice', '⚠️ You were logged out because this account was logged into another mobile device.');

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
