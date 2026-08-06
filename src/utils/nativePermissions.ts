import { Camera } from '@capacitor/camera';
import { PushNotifications } from '@capacitor/push-notifications';
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
 * Direct check and request for Push/Post Notification permissions.
 * Triggered when user sets up daily study reminder streaks (Android 13+).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  try {
    const check = await PushNotifications.checkPermissions();
    if (check.receive === 'granted') {
      return true;
    }

    const request = await PushNotifications.requestPermissions();
    const success = request.receive === 'granted';
    if (!success) {
      console.warn('[NativePermissions] Notification permission denied.');
    }
    return success;
  } catch (err) {
    console.error('[NativePermissions] Error requesting notification permission:', err);
    return false;
  }
}

/**
 * JIT RUNTIME PERMISSION:
 * Request Microphone permission using WebRTC standard API which triggers 
 * the native record audio dialog in Capacitor WebView.
 * Triggered strictly when user taps the Voice Chat button.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all tracks immediately after getting approval
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    console.error('[NativePermissions] Microphone permission denied or failed:', err);
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

