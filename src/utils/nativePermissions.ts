import { Camera } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * GOOGLE PLAY STORE COMPLIANCE & SAFETY GUIDELINES:
 * 1. Essential Permissions Only: CAMERA (Scan), RECORD_AUDIO (Voice Tutor), POST_NOTIFICATIONS (Study Reminders).
 * 2. Just-In-Time (JIT) Requests: Never request permissions all at once on app launch or onboarding.
 * 3. Avoid Rejection Traps: No MANAGE_EXTERNAL_STORAGE or legacy WRITE_EXTERNAL_STORAGE. Use standard platform file picker.
 */

/**
 * JIT RUNTIME PERMISSION:
 * Direct check and request for Camera permission.
 * Triggered strictly when user opens the Scan screen / camera feature.
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  try {
    const check = await Camera.checkPermissions();
    if (check.camera === 'granted') {
      return true;
    }

    // Trigger JIT OS prompt when user opens camera/scanner
    const request = await Camera.requestPermissions({ permissions: ['camera'] });
    const success = request.camera === 'granted';
    if (!success) {
      console.warn('[NativePermissions] JIT Camera permission denied.');
    }
    return success;
  } catch (err) {
    console.error('[NativePermissions] Error requesting camera permission:', err);
    return false;
  }
}

/**
 * JIT RUNTIME PERMISSION:
 * Uses @capacitor/local-notifications (already installed) to request
 * POST_NOTIFICATIONS permission on Android 13+ (API 33+).
 * This is the correct approach for study reminders - does NOT require Firebase FCM.
 * Triggered when user sets up daily study reminder streaks.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  try {
    // Check existing permission status first
    const check = await LocalNotifications.checkPermissions();
    if (check.display === 'granted') {
      return true;
    }

    // Request the OS permission dialog (Android 13+ / iOS)
    const request = await LocalNotifications.requestPermissions();
    const success = request.display === 'granted';
    if (!success) {
      console.warn('[NativePermissions] LocalNotification permission denied by user.');
    }
    return success;
  } catch (err) {
    console.error('[NativePermissions] Error requesting notification permission:', err);
    return false;
  }
}

/**
 * JIT RUNTIME PERMISSION:
 * Requests RECORD_AUDIO permission on Android via getUserMedia.
 * On Capacitor native apps, the WebView forwards this to the OS permission dialog.
 * The key fix: we ensure the Capacitor app has android:usesCleartextTraffic is NOT
 * blocking it, and we use a try/catch with a proper user-facing message.
 * Triggered strictly when user taps the Voice Chat / Call with Tutor button.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    // On native Capacitor, getUserMedia triggers the OS RECORD_AUDIO dialog
    // This works correctly when android:name="android.permission.RECORD_AUDIO"
    // is declared in AndroidManifest.xml (which it is in this project)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all tracks immediately — we only needed permission, not the stream
    stream.getTracks().forEach(track => track.stop());
    console.log('[NativePermissions] Microphone permission granted.');
    return true;
  } catch (err: any) {
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      console.warn('[NativePermissions] Microphone permission denied by user.');
    } else {
      console.error('[NativePermissions] Microphone error:', err);
    }
    return false;
  }
}

/**
 * DEPRECATED / GOOGLE PLAY COMPLIANT NO-OP:
 * Bulk permission requests at startup violate Google Play Policy.
 * Permissions MUST be requested Just-In-Time (JIT) when features are accessed.
 */
export async function requestAllNativePermissions(): Promise<{
  camera: boolean;
  notifications: boolean;
  microphone: boolean;
}> {
  console.log('[NativePermissions] JIT Mode active: Permissions will be requested contextually when features are used.');
  return { camera: true, notifications: true, microphone: true };
}

