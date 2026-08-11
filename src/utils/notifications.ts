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
    // Check if already scheduled in LocalStorage to prevent duplicates
    const isAlreadyScheduled = localStorage.getItem(STORAGE_KEY_SCHEDULED) === 'true';
    
    if (Capacitor.isNativePlatform()) {
      // Fetch currently scheduled pending notifications to be absolutely sure
      const pendingResult = await LocalNotifications.getPending();
      const hasNotificationScheduled = pendingResult.notifications.some(
        (n: any) => n.id === NOTIFICATION_ID
      );
      
      if (isAlreadyScheduled && hasNotificationScheduled) {
        console.log('[NotificationService] Daily local notification already scheduled on Native.');
        return;
      }
      
      // Cancel existing if any just to be clean
      await LocalNotifications.cancel({
        notifications: [{ id: NOTIFICATION_ID }]
      }).catch(() => {});

      // Schedule the daily notification at 5:00 PM (17:00)
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIFICATION_ID,
            title: 'Homework Pending? 📚',
            body: 'Scan & solve your math & science doubts instantly with your AI Tutor!',
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
      if (isAlreadyScheduled) {
        console.log('[NotificationService] Daily notification already scheduled on Web.');
        return;
      }

      console.log('[NotificationService] Daily notification scheduled at 5:00 PM (Web Fallback simulated).');
      
      // We can trigger a Web Notification immediately if permissions are granted for user feedback
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        // Just for demo/onboarding feedback
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
export async function setupDailyLocalNotifications(forcePrompt = false) {
  console.log('[NotificationService] Starting setup of daily local notifications...');
  const hasPermission = await requestNotificationPermissions(forcePrompt);
  if (hasPermission) {
    await scheduleDailyNotification();
  } else {
    console.log('[NotificationService] Notification permission not granted or dismissed.');
  }
}
