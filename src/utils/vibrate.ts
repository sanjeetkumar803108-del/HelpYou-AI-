/**
 * Utility for safe tactile/haptic feedback using the HTML5 Vibration API.
 * Uses a default short tap (15ms) which is perfect for button clicks and navigation.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

/**
 * Utility for safe tactile/haptic feedback using the HTML5 Vibration API or Capacitor Haptics.
 * On native platforms, this dynamically maps standard patterns to high-fidelity native Haptics.
 */
export function triggerVibration(pattern: number | number[] = 15) {
  if (Capacitor.isNativePlatform()) {
    try {
      if (Array.isArray(pattern)) {
        // Multi-vibrate pattern, typically indicating a notification / sequence
        if (pattern.length >= 3) {
          Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        } else {
          Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
        }
      } else {
        // Single duration vibration
        if (pattern <= 15) {
          Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        } else if (pattern <= 30) {
          Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
        } else {
          Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
        }
      }
    } catch (error) {
      console.warn("Capacitor Haptics failed:", error);
    }
  } else {
    // Web Fallback
    if (
      typeof window !== "undefined" &&
      typeof window.navigator !== "undefined" &&
      typeof window.navigator.vibrate === "function"
    ) {
      try {
        window.navigator.vibrate(pattern);
      } catch (error) {
        console.warn("Tactile feedback not supported or blocked by user preference:", error);
      }
    }
  }
}

/**
 * Trigger explicit haptic impact (subtle click) on native platform.
 */
export function hapticImpact(style: 'LIGHT' | 'MEDIUM' | 'HEAVY' = 'LIGHT') {
  if (Capacitor.isNativePlatform()) {
    try {
      const hStyle = 
        style === 'HEAVY' ? ImpactStyle.Heavy :
        style === 'MEDIUM' ? ImpactStyle.Medium :
        ImpactStyle.Light;
      Haptics.impact({ style: hStyle }).catch(() => {});
    } catch (e) {
      console.warn("Haptics impact failed:", e);
    }
  } else {
    const duration = style === 'HEAVY' ? 40 : style === 'MEDIUM' ? 25 : 12;
    triggerVibration(duration);
  }
}

/**
 * Trigger explicit haptic selection start (perfect for switching tabs).
 */
export function hapticSelection() {
  if (Capacitor.isNativePlatform()) {
    try {
      Haptics.selectionStart().catch(() => {});
    } catch (e) {
      console.warn("Haptics selection failed:", e);
    }
  } else {
    triggerVibration(10);
  }
}

/**
 * Trigger explicit notification haptics (SUCCESS, WARNING, ERROR) for completed AI tasks.
 */
export function hapticNotification(type: 'SUCCESS' | 'WARNING' | 'ERROR') {
  if (Capacitor.isNativePlatform()) {
    try {
      const nType = 
        type === 'SUCCESS' ? NotificationType.Success :
        type === 'WARNING' ? NotificationType.Warning :
        NotificationType.Error;
      Haptics.notification({ type: nType }).catch(() => {});
    } catch (e) {
      console.warn("Haptics notification failed:", e);
    }
  } else {
    const pattern = 
      type === 'SUCCESS' ? [20, 40, 20] :
      type === 'WARNING' ? [40, 40, 40] :
      [60, 40, 60, 40, 60];
    triggerVibration(pattern);
  }
}

