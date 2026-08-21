import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * HELPYOU AI — SMART DAILY STUDY NOTIFICATIONS
 *
 * Scheduling Strategy (Tier 1 Country School Calendar):
 * ─────────────────────────────────────────────────────
 * School typically ends between 2:30 PM – 3:30 PM in:
 *   🇺🇸 USA, 🇬🇧 UK, 🇨🇦 Canada, 🇦🇺 Australia, 🇩🇪 Germany, 🇫🇷 France, etc.
 *
 * Best engagement window: 4:00 PM (device local timezone).
 * This fires AFTER school hours when students are home and free.
 *
 * Rotation: 10 different motivational/study messages rotate by day-of-month
 * so users never see the same notification twice in a row.
 */

// ─── Unique IDs for each rotating notification slot ────────────────────────
const BASE_ID = 17001;
const TOTAL_SLOTS = 10;

// ─── Rotating Study Notification Messages ──────────────────────────────────
// Written to be natural, engaging, and relevant for students (EdTech)
const STUDY_MESSAGES: { title: string; body: string }[] = [
  {
    title: "📚 Need Homework Help?",
    body: "School's out! HelpYou AI can solve any question in seconds. Open the app and scan your homework now! 🎯"
  },
  {
    title: "🔥 Don't Break Your Study Streak!",
    body: "Just 15 minutes of review keeps your streak alive. Your AI Tutor is ready and waiting for you! 🚀"
  },
  {
    title: "🧠 Stuck on a Problem?",
    body: "Snap a photo of any question and get a step-by-step solution instantly. HelpYou AI is your smartest study buddy!"
  },
  {
    title: "⚡ Quick Quiz Challenge!",
    body: "Test yourself on today's topics! Generate a quiz on anything and level up your grades. Open HelpYou AI now 👆"
  },
  {
    title: "📝 Got an Essay Due?",
    body: "HelpYou AI can help you outline, write, and improve your essay in minutes. Don't stress — we've got you! ✍️"
  },
  {
    title: "🌟 Be the Smart One in Class!",
    body: "While others are scrolling, you could be getting smarter. AI-powered study sessions start with just one tap! 💡"
  },
  {
    title: "🎯 Exam Coming Up?",
    body: "Let HelpYou AI create custom flashcards and practice questions for any subject. Start your prep session now! 📖"
  },
  {
    title: "💬 Ask Your AI Tutor Anything!",
    body: "Math, Science, English, History — your personal AI Tutor knows it all. No question is too hard! 🤖"
  },
  {
    title: "🗒️ Note-Taking Made Easy!",
    body: "Scan your textbook or notes and let AI turn them into beautiful summaries. Study smarter, not harder! ✨"
  },
  {
    title: "🏆 Top Students Review Daily!",
    body: "Spend 10 minutes reviewing with HelpYou AI and stay ahead of your class. Your future self will thank you! 💪"
  }
];

// ─── Storage Keys ───────────────────────────────────────────────────────────
const STORAGE_KEY_SCHEDULED = 'study_daily_notification_scheduled_v3';

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
 * Schedule 10 rotating daily study notifications.
 *
 * Time: 4:00 PM (16:00) in the device's LOCAL timezone.
 * This is the optimal time for Tier 1 countries (US, UK, CA, AU, DE, FR)
 * where school ends between 2:30 PM – 3:30 PM.
 *
 * Each slot has a unique ID and a unique message.
 * Capacitor will fire the notification for the matching day-of-month slot.
 * Result: Users see a different message every day for 10 days, then it repeats.
 */
export async function scheduleDailyNotification() {
  if (!Capacitor.isNativePlatform()) {
    console.log('[NotificationService] Web: Skipping native notification schedule.');
    localStorage.setItem(STORAGE_KEY_SCHEDULED, 'true');
    return;
  }

  try {
    // Cancel ALL previous notification slots to avoid duplicates
    const cancelIds = Array.from({ length: TOTAL_SLOTS }, (_, i) => ({ id: BASE_ID + i }));
    await LocalNotifications.cancel({ notifications: cancelIds }).catch(() => {});

    // Schedule all 10 rotating notifications
    // Each fires daily at 4:00 PM — Capacitor fires whichever matches today
    const notifications = STUDY_MESSAGES.map((msg, index) => ({
      id: BASE_ID + index,
      title: msg.title,
      body: msg.body,
      schedule: {
        every: 'day' as const,
        on: {
          hour: 16,   // 4:00 PM — after school in Tier 1 countries
          minute: 0
        }
      },
      sound: 'default',
      extra: { slot: index }
    }));

    await LocalNotifications.schedule({ notifications });

    localStorage.setItem(STORAGE_KEY_SCHEDULED, 'true');
    console.log(`[NotificationService] ✅ Scheduled ${TOTAL_SLOTS} rotating daily notifications at 4:00 PM (device local time).`);
  } catch (error) {
    console.error('[NotificationService] Failed to schedule daily notifications:', error);
  }
}

/**
 * Initialize and trigger the setup workflow.
 * Checks permissions, requests if needed, and schedules the notifications.
 * Called once on app startup from App.tsx.
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
