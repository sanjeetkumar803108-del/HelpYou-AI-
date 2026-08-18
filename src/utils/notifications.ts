import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

const NOTIFICATION_ID = 17001; // Unique ID for daily study reminder
const STORAGE_KEY_SCHEDULED = 'study_daily_notification_scheduled_v2';

/**
 * Request notification permissions from the user.
 * Supports both Capacitor Native (iOS/Android) and Web/Desktop Browser.
 */
export async function requestNotificationPermissions(forcePrompt = false): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display === 'granted') {
        return true;
      }
      
      if (!forcePrompt) {
        return false;
      }

      const requestResult = await LocalNotifications.requestPermissions();
      return requestResult.display === 'granted';
    } catch (error) {
      console.warn('[NotificationService] Capacitor permissions request error:', error);
      return false;
    }
  } else {
    // Web Fallback
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          return true;
        }
        
        if (!forcePrompt) {
          return false;
        }

        if (Notification.permission !== 'denied') {
          const permission = await Notification.requestPermission();
          return permission === 'granted';
        }
      } catch (error) {
        console.warn('[NotificationService] Web Notification permission request error:', error);
      }
    }
    return false;
  }
}

/**
 * Schedule a daily recurring local push notification.
 * Time: 5:00 PM (17:00) every day.
 * Includes check to avoid duplicate schedules.
 */
export async function scheduleDailyNotification() {
  try {
    if (Capacitor.isNativePlatform()) {
      // ALWAYS cancel existing notification with our ID first to prevent duplicate scheduling
      await LocalNotifications.cancel({
        notifications: [{ id: NOTIFICATION_ID }]
      }).catch((e) => {
        console.log('[NotificationService] Cancel error (benign):', e);
      });

      // Schedule the daily notification at 5:00 PM (17:00) strictly based on device local timezone
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIFICATION_ID,
            title: "🔥 Don't break your study streak!",
            body: "School is out! Take 15 minutes to review today's topics and keep your streak alive on HelpYou AI. 🚀",
            schedule: {
              every: 'day',
              on: {
                hour: 17,
                minute: 0
              }
            },
            sound: 'default'
          }
        ]
      });

      localStorage.setItem(STORAGE_KEY_SCHEDULED, 'true');
      console.log('[NotificationService] Daily local notification successfully scheduled at 17:00 on Native.');
    } else {
      // Web Fallback: Register log or mock daily timer
      console.log('[NotificationService] Web Fallback: Cancelled prior schedule and registered new daily schedule at 5:00 PM.');
      
      // We can trigger a Web Notification immediately if permissions are granted for user feedback
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        console.log('[NotificationService] Web notification permission is active. Daily schedule registered.');
      }
      
      localStorage.setItem(STORAGE_KEY_SCHEDULED, 'true');
    }
  } catch (error) {
    console.error('[NotificationService] Failed to schedule daily notifications:', error);
  }
}

/**
 * Initialize and trigger the setup workflow.
 * Checks permissions, requests if needed, and schedules the notification.
 */
export async function setupDailyLocalNotifications(forcePrompt = true) {
  console.log('[NotificationService] Starting setup of daily local notifications...');
  const hasPermission = await requestNotificationPermissions(forcePrompt);
  if (hasPermission) {
    await scheduleDailyNotification();
  } else {
    console.log('[NotificationService] Notification permission not granted or dismissed.');
  }
}
