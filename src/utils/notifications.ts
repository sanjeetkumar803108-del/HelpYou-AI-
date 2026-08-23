import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * HELPYOU AI — ULTRA ENGAGING AFTER-SCHOOL STUDY & HOMEWORK NOTIFICATIONS
 *
 * Daily Strategy (2 Engaging Post-School Slots):
 * ─────────────────────────────────────────────────────
 * 1. SLOT A (5:00 PM / 17:00): Homework Help & Problem Solving (Right after school / tuition)
 * 2. SLOT B (7:30 PM / 19:30): Evening Revision, Streak Fire & Exam Prep (Peak study hours)
 *
 * Rotation: 20 rotating engaging messages with high click-through appeal!
 */

// ─── Unique Notification IDs & Slots ──────────────────────────────────────
const BASE_ID_AFTERNOON = 17001; // IDs 17001 - 17010
const BASE_ID_EVENING = 18001;   // IDs 18001 - 18010
const TOTAL_SLOTS = 10;

// ─── Slot 1: Afternoon Homework & Scan Reminders (5:00 PM / 17:00) ─────────
const AFTERNOON_HOMEWORK_MESSAGES: { title: string; body: string }[] = [
  {
    title: "📚 Need Homework Help?",
    body: "School is done! Stuck on a tricky question? Snap a quick photo with Magic Scanner for instant step-by-step solutions! 🚀"
  },
  {
    title: "🧠 Stuck on a Hard Math or Science Problem?",
    body: "Don't stress! Your 24/7 AI Personal Tutor can explain any formula or derivation simply. Tap to solve now ⚡"
  },
  {
    title: "⚡ Finish Your Homework in 15 Minutes!",
    body: "Why struggle alone for hours? Open HelpYou AI, scan your worksheet, and crush your assignments early today! 🎯"
  },
  {
    title: "✨ Homework Made 10x Easier!",
    body: "Get instant step-by-step guidance for Math, Physics, Chemistry, Biology & History. Tap to start solving! 📖"
  },
  {
    title: "📸 Snap & Solve Your Worksheet!",
    body: "Got today's homework paper? Just point your camera and let Magic AI break down the steps clearly! 💡"
  },
  {
    title: "🌟 Be Ahead of Your Class Tomorrow!",
    body: "Clear your doubts before dinner time. Your AI Tutor is ready with clear answers and helpful examples! 🎓"
  },
  {
    title: "🧮 Math Equations Giving You a Headache?",
    body: "Our Smart Scientific Calculator & Graphing engine solve complex algebra and calculus in one tap. Open now! 📐"
  },
  {
    title: "💬 Got a Question for Your AI Teacher?",
    body: "Ask anything about today's school lecture! No judgment, just friendly and crystal-clear explanations 🤖"
  },
  {
    title: "📝 Assignment Due Tomorrow?",
    body: "Let AI Essay Grader and Grammar Enhancer polish your writing to straight A's! Tap to review now ✍️"
  },
  {
    title: "🎯 Free Homework Help Waiting For You!",
    body: "Claim your daily free study coins and scan any textbook question right away! Open HelpYou AI 🪙"
  }
];

// ─── Slot 2: Evening Revision, Streaks & Exam Prep (7:30 PM / 19:30) ────────
const EVENING_STUDY_MESSAGES: { title: string; body: string }[] = [
  {
    title: "🔥 Don't Break Your Study Streak!",
    body: "Keep the flame burning! Just 5 minutes of quick revision keeps your streak alive and boosts retention 🔥"
  },
  {
    title: "🎧 Turn Heavy Notes into an Audio Podcast!",
    body: "Tired of reading? Relax and listen to AI audio study podcasts of your notes before bed. Tap to listen! 🎙️"
  },
  {
    title: "🏆 Quick 2-Minute Brain Challenge!",
    body: "Test yourself with custom AI flashcards and quizzes before wrapping up today. You've got this! 💪"
  },
  {
    title: "💯 Exam Coming Up Soon?",
    body: "Review the essential Tier-1 formula cheat sheets and generate practice questions in seconds! 📖"
  },
  {
    title: "🪙 Claim Your Daily Free Study Coins!",
    body: "Your daily study bonus is ready! Open the app now to claim free coins and unlock VIP features 🎁"
  },
  {
    title: "🌟 Top Students Review Every Evening!",
    body: "A quick 10-minute recap now makes exams effortless later. Open HelpYou AI and boost your grades! 🚀"
  },
  {
    title: "📚 Convert Your Photo Notes to a Clean PDF!",
    body: "Turn your scattered whiteboard and notebook photos into a single organized PDF document in seconds! 📄"
  },
  {
    title: "🌐 Live Deep Search Academic Tutor Ready!",
    body: "Research any complex topic grounded in real-time across top university sources. Tap to explore! 🔍"
  },
  {
    title: "🛡️ Check Your Mistake Vault!",
    body: "Review today's tricky traps and master the concepts so you never lose marks on exams! 🧠"
  },
  {
    title: "😴 Sleep Smarter with Tonight's Quick Recap!",
    body: "Reinforce today's top concepts with 3 quick AI flashcards. Sweet dreams and high grades! 🌙"
  }
];

// ─── Storage Keys ───────────────────────────────────────────────────────────
const STORAGE_KEY_SCHEDULED = 'study_daily_notification_scheduled_v4';

/**
 * Request notification permissions from the user.
 * Supports Capacitor Native (iOS/Android) and Web.
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
 * Cancel all active local notification slots.
 */
export async function cancelAllDailyNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const afternoonIds = Array.from({ length: TOTAL_SLOTS }, (_, i) => ({ id: BASE_ID_AFTERNOON + i }));
    const eveningIds = Array.from({ length: TOTAL_SLOTS }, (_, i) => ({ id: BASE_ID_EVENING + i }));
    const legacyIds = Array.from({ length: 20 }, (_, i) => ({ id: 17001 + i }));
    await LocalNotifications.cancel({ notifications: [...afternoonIds, ...eveningIds, ...legacyIds] }).catch(() => {});
    localStorage.removeItem(STORAGE_KEY_SCHEDULED);
    console.log('[NotificationService] 🔕 All daily study notifications cancelled.');
  } catch (err) {
    console.warn('[NotificationService] Error cancelling notifications:', err);
  }
}

/**
 * Schedule 2 daily after-school notification slots:
 * Slot 1: 5:00 PM (17:00) — Afternoon Homework & Instant Problem Solving
 * Slot 2: 7:30 PM (19:30) — Evening Study, Streaks & Podcast Revision
 */
export async function scheduleDailyNotification() {
  if (!Capacitor.isNativePlatform()) {
    console.log('[NotificationService] Web: Skipping native notification schedule.');
    localStorage.setItem(STORAGE_KEY_SCHEDULED, 'true');
    return;
  }

  try {
    // Setup Android Notification Channel with sound & vibration
    try {
      await LocalNotifications.createChannel({
        id: 'study-reminders',
        name: 'Daily Homework & Study Reminders',
        description: 'Engaging homework help, daily streaks, and study notifications',
        importance: 4, // High importance
        visibility: 1, // Public on lockscreen
        sound: 'default',
        vibration: true
      });
    } catch (chanErr) {
      console.warn('[NotificationService] Channel creation notice:', chanErr);
    }

    // Cancel previous notifications to prevent duplicates
    await cancelAllDailyNotifications();

    const notifications: any[] = [];

    // 1. Afternoon Slot: 5:00 PM (17:00)
    AFTERNOON_HOMEWORK_MESSAGES.forEach((msg, index) => {
      notifications.push({
        id: BASE_ID_AFTERNOON + index,
        title: msg.title,
        body: msg.body,
        channelId: 'study-reminders',
        schedule: {
          every: 'day' as const,
          on: {
            hour: 17,   // 5:00 PM — right after school / tuition
            minute: 0
          }
        },
        sound: 'default',
        extra: { type: 'homework', slot: index }
      });
    });

    // 2. Evening Slot: 7:30 PM (19:30)
    EVENING_STUDY_MESSAGES.forEach((msg, index) => {
      notifications.push({
        id: BASE_ID_EVENING + index,
        title: msg.title,
        body: msg.body,
        channelId: 'study-reminders',
        schedule: {
          every: 'day' as const,
          on: {
            hour: 19,   // 7:30 PM — peak evening study & streak time
            minute: 30
          }
        },
        sound: 'default',
        extra: { type: 'streak_revision', slot: index }
      });
    });

    await LocalNotifications.schedule({ notifications });

    localStorage.setItem(STORAGE_KEY_SCHEDULED, 'true');
    console.log(`[NotificationService] ✅ Successfully scheduled 2 daily study slots (5:00 PM & 7:30 PM) across ${notifications.length} rotating notifications.`);
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

