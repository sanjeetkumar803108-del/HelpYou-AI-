import { registerPlugin } from '@capacitor/core';

interface ClearCredentialPlugin {
  /**
   * Clears Android Credential Manager's stored "authorized" account state
   * so the Google account picker is shown again on the next sign-in attempt.
   * Resolves even on failure (never throws) — safe to call unconditionally on logout.
   */
  clear(): Promise<{ warning?: string } | void>;
}

const ClearCredential = registerPlugin<ClearCredentialPlugin>('ClearCredential');

/**
 * Call this during logout, AFTER FirebaseAuthentication.signOut() and
 * BEFORE/alongside signOut(auth). Only has an effect on native Android —
 * safe to call on web/iOS too since it's gated by Capacitor.isNativePlatform()
 * checks at the call site, but it also no-ops safely if invoked elsewhere.
 */
export const clearGoogleCredentialState = async (): Promise<void> => {
  try {
    const result = await ClearCredential.clear();
    if (result && 'warning' in result && result.warning) {
      console.warn('[ClearCredential] notice:', result.warning);
    }
  } catch (err) {
    console.warn('[ClearCredential] failed (non-fatal):', err);
  }
};
