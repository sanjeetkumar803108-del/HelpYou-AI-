import { safeGetItem, safeSetItem, safeJsonParse } from './storage';
import { triggerVibration } from './vibrate';
import confetti from 'canvas-confetti';

export interface StudyLevel {
  level: number;
  title: string;
  badge: string;
  minXP: number;
  maxXP: number;
  color: string;
}

export interface Quest {
  id: string;
  title: string;
  desc: string;
  xpReward: number;
  coinReward: number;
  icon: string;
  category: 'scanner' | 'calculator' | 'notes' | 'quiz' | 'tutor' | 'streak';
  targetCount: number;
  currentCount: number;
  isCompleted: boolean;
  isClaimed: boolean;
}

export interface AchievementBadge {
  id: string;
  title: string;
  icon: string;
  description: string;
  requiredXP: number;
  unlocked: boolean;
  claimed: boolean;
}

export const STUDY_LEVELS: StudyLevel[] = [
  { level: 1, title: "Novice Scholar", badge: "🎒", minXP: 0, maxXP: 200, color: "from-blue-500 to-indigo-500" },
  { level: 2, title: "Formula Master", badge: "📐", minXP: 200, maxXP: 500, color: "from-emerald-500 to-teal-500" },
  { level: 3, title: "Knowledge Seeker", badge: "🔍", minXP: 500, maxXP: 1000, color: "from-purple-500 to-indigo-500" },
  { level: 4, title: "AI Prodigy", badge: "⚡", minXP: 1000, maxXP: 2000, color: "from-amber-500 to-orange-500" },
  { level: 5, title: "Study Monk", badge: "🧘", minXP: 2000, maxXP: 3500, color: "from-rose-500 to-pink-500" },
  { level: 6, title: "Exam Conqueror", badge: "🏆", minXP: 3500, maxXP: 6000, color: "from-cyan-500 to-blue-600" },
  { level: 7, title: "Grandmaster Genius", badge: "🌟", minXP: 6000, maxXP: 10000, color: "from-violet-600 to-fuchsia-600" }
];

export const ALL_BADGES: AchievementBadge[] = [
  { id: 'first_step', title: 'First Step', icon: '🚀', description: 'Begin your AI study journey', requiredXP: 50, unlocked: false, claimed: false },
  { id: 'math_wizard', title: 'Math Wizard', icon: '🧮', description: 'Solve equations with AI Calculator', requiredXP: 250, unlocked: false, claimed: false },
  { id: 'streak_warrior', title: 'Streak Warrior', icon: '🔥', description: 'Maintain high study discipline', requiredXP: 600, unlocked: false, claimed: false },
  { id: 'pdf_compiler', title: 'PDF Master', icon: '📄', description: 'Generate study documents & formula sheets', requiredXP: 1200, unlocked: false, claimed: false },
  { id: 'ai_tutor_fan', title: 'AI Prodigy', icon: '🧠', description: 'Master complex academic topics', requiredXP: 2500, unlocked: false, claimed: false },
  { id: 'grandmaster', title: 'Grandmaster', icon: '👑', description: 'Achieve legendary study mastery', requiredXP: 5000, unlocked: false, claimed: false }
];

/**
 * Get current total Study XP
 */
export function getStudyXP(): number {
  const xpStr = safeGetItem('study_total_xp');
  if (!xpStr) {
    safeSetItem('study_total_xp', '150');
    return 150;
  }
  return parseInt(xpStr, 10) || 150;
}

/**
 * Get Level details based on XP
 */
export function getStudyLevel(xp: number): {
  currentLevel: StudyLevel;
  nextLevel: StudyLevel | null;
  progressPercent: number;
  xpInLevel: number;
  xpToNextLevel: number;
} {
  let currentLevel = STUDY_LEVELS[0];
  let nextLevel: StudyLevel | null = STUDY_LEVELS[1] || null;

  for (let i = 0; i < STUDY_LEVELS.length; i++) {
    if (xp >= STUDY_LEVELS[i].minXP) {
      currentLevel = STUDY_LEVELS[i];
      nextLevel = STUDY_LEVELS[i + 1] || null;
    }
  }

  const min = currentLevel.minXP;
  const max = nextLevel ? nextLevel.minXP : currentLevel.maxXP;
  const xpInLevel = Math.max(0, xp - min);
  const totalLevelRange = Math.max(1, max - min);
  const progressPercent = Math.min(100, Math.round((xpInLevel / totalLevelRange) * 100));
  const xpToNextLevel = Math.max(0, max - xp);

  return {
    currentLevel,
    nextLevel,
    progressPercent,
    xpInLevel,
    xpToNextLevel
  };
}

export const MAX_DAILY_XP = 150;

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get current daily XP status and remaining cap
 */
export function getDailyXPStatus(): {
  earnedToday: number;
  dailyLimit: number;
  remainingToday: number;
  isCapped: boolean;
} {
  const today = getTodayKey();
  const storedDate = safeGetItem('study_daily_xp_date');
  let earnedToday = parseInt(safeGetItem('study_daily_xp_earned') || '0', 10);

  if (storedDate !== today) {
    earnedToday = 0;
    safeSetItem('study_daily_xp_date', today);
    safeSetItem('study_daily_xp_earned', '0');
  }

  const remainingToday = Math.max(0, MAX_DAILY_XP - earnedToday);
  const isCapped = earnedToday >= MAX_DAILY_XP;

  return {
    earnedToday,
    dailyLimit: MAX_DAILY_XP,
    remainingToday,
    isCapped
  };
}

/**
 * Award XP to student with animations, level-up detection, and daily 150 XP cap
 */
export function addStudyXP(
  amount: number, 
  reason: string,
  forceBypassCap: boolean = false
): { 
  newXP: number; 
  leveledUp: boolean; 
  newLevel: StudyLevel;
  awardedAmount: number;
  dailyLimitReached: boolean;
} {
  const dailyStatus = getDailyXPStatus();
  const currentXP = getStudyXP();
  const oldLevel = getStudyLevel(currentXP).currentLevel;

  if (amount <= 0) {
    return {
      newXP: currentXP,
      leveledUp: false,
      newLevel: oldLevel,
      awardedAmount: 0,
      dailyLimitReached: dailyStatus.isCapped
    };
  }

  let effectiveAmount = amount;

  if (!forceBypassCap) {
    if (dailyStatus.remainingToday <= 0) {
      // Daily Cap already reached
      triggerVibration(10);
      window.dispatchEvent(new CustomEvent('show-mobile-toast', {
        detail: { message: `⚡ Daily XP Cap reached (150/150 XP today). Great work! 🌟` }
      }));
      return {
        newXP: currentXP,
        leveledUp: false,
        newLevel: oldLevel,
        awardedAmount: 0,
        dailyLimitReached: true
      };
    }

    // Cap amount if it exceeds remaining daily XP
    effectiveAmount = Math.min(amount, dailyStatus.remainingToday);
  }

  const newDailyEarned = dailyStatus.earnedToday + effectiveAmount;
  safeSetItem('study_daily_xp_earned', String(newDailyEarned));
  safeSetItem('study_daily_xp_date', getTodayKey());

  const newXP = currentXP + effectiveAmount;
  safeSetItem('study_total_xp', String(newXP));
  
  const newLevelDetails = getStudyLevel(newXP);
  const leveledUp = newLevelDetails.currentLevel.level > oldLevel.level;

  if (leveledUp) {
    triggerVibration(30);
    try {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#4F46E5', '#10B981', '#F59E0B', '#EC4899']
      });
    } catch (_) {}

    window.dispatchEvent(new CustomEvent('show-mobile-toast', {
      detail: { message: `🎉 LEVEL UP! You reached ${newLevelDetails.currentLevel.title} ${newLevelDetails.currentLevel.badge} (+${effectiveAmount} XP)` }
    }));
  } else {
    triggerVibration(10);
    const capNotice = (newDailyEarned >= MAX_DAILY_XP) ? ' (Max 150 daily XP reached! 🌟)' : '';
    window.dispatchEvent(new CustomEvent('show-mobile-toast', {
      detail: { message: `⚡ +${effectiveAmount} XP Earned! (${reason})${capNotice}` }
    }));
  }

  window.dispatchEvent(new CustomEvent('study-xp-updated', { detail: { xp: newXP, level: newLevelDetails.currentLevel } }));
  window.dispatchEvent(new CustomEvent('study-daily-xp-updated', { detail: { earnedToday: newDailyEarned, dailyLimit: MAX_DAILY_XP } }));

  return {
    newXP,
    leveledUp,
    newLevel: newLevelDetails.currentLevel,
    awardedAmount: effectiveAmount,
    dailyLimitReached: newDailyEarned >= MAX_DAILY_XP
  };
}

/**
 * Fetch all Weekly Quests with real user progress
 */
export function getWeeklyQuests(): Quest[] {
  const scanCount = parseInt(safeGetItem('study_quest_scan_count') || '0', 10);
  const calcCount = parseInt(safeGetItem('study_quest_calc_count') || '0', 10);
  const noteCount = parseInt(safeGetItem('study_quest_note_count') || '0', 10);
  const tutorCount = parseInt(safeGetItem('study_quest_tutor_count') || '0', 10);
  const streakCount = parseInt(safeGetItem('study_punches') || '0', 10);

  const claimedQuests = safeJsonParse<Record<string, boolean>>(safeGetItem('study_claimed_quests'), {});

  const quests: Quest[] = [
    {
      id: 'quest_scan_3',
      title: 'Magic Scanner Pro',
      desc: 'Scan 3 math or science homework problems',
      xpReward: 50,
      coinReward: 5,
      icon: '📸',
      category: 'scanner',
      targetCount: 3,
      currentCount: Math.min(3, scanCount),
      isCompleted: scanCount >= 3,
      isClaimed: !!claimedQuests['quest_scan_3']
    },
    {
      id: 'quest_calc_5',
      title: 'Formula Explorer',
      desc: 'Calculate or graph 3 equations in Calculator',
      xpReward: 40,
      coinReward: 4,
      icon: '📐',
      category: 'calculator',
      targetCount: 3,
      currentCount: Math.min(3, calcCount),
      isCompleted: calcCount >= 3,
      isClaimed: !!claimedQuests['quest_calc_5']
    },
    {
      id: 'quest_notes_2',
      title: 'Summary Scholar',
      desc: 'Generate 2 AI study notes or audio summaries',
      xpReward: 60,
      coinReward: 6,
      icon: '📝',
      category: 'notes',
      targetCount: 2,
      currentCount: Math.min(2, noteCount),
      isCompleted: noteCount >= 2,
      isClaimed: !!claimedQuests['quest_notes_2']
    },
    {
      id: 'quest_tutor_3',
      title: 'Deep Inquirer',
      desc: 'Ask 3 questions to the AI Voice & Chat Tutor',
      xpReward: 50,
      coinReward: 5,
      icon: '🧠',
      category: 'tutor',
      targetCount: 3,
      currentCount: Math.min(3, tutorCount),
      isCompleted: tutorCount >= 3,
      isClaimed: !!claimedQuests['quest_tutor_3']
    },
    {
      id: 'quest_streak_3',
      title: 'Streak Champion',
      desc: 'Maintain at least a 3-day study check-in streak',
      xpReward: 100,
      coinReward: 10,
      icon: '🔥',
      category: 'streak',
      targetCount: 3,
      currentCount: Math.min(3, streakCount),
      isCompleted: streakCount >= 3,
      isClaimed: !!claimedQuests['quest_streak_3']
    }
  ];

  return quests;
}

/**
 * Increment quest progress for an activity
 */
export function trackQuestProgress(category: 'scanner' | 'calculator' | 'notes' | 'tutor', amount = 1) {
  const key = `study_quest_${category}_count`;
  const current = parseInt(safeGetItem(key) || '0', 10);
  safeSetItem(key, String(current + amount));
  window.dispatchEvent(new CustomEvent('study-quests-updated'));
}

/**
 * Claim quest reward
 */
export function claimQuestReward(questId: string): boolean {
  const quests = getWeeklyQuests();
  const quest = quests.find(q => q.id === questId);
  if (!quest || !quest.isCompleted || quest.isClaimed) return false;

  const claimedQuests = safeJsonParse<Record<string, boolean>>(safeGetItem('study_claimed_quests'), {});
  claimedQuests[questId] = true;
  safeSetItem('study_claimed_quests', JSON.stringify(claimedQuests));

  addStudyXP(quest.xpReward, quest.title);

  triggerVibration(20);
  try {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  } catch (_) {}

  window.dispatchEvent(new CustomEvent('study-quests-updated'));
  return true;
}

/**
 * Fetch all achievement badges with real status
 */
export function getBadgesStatus(): AchievementBadge[] {
  const currentXP = getStudyXP();
  const claimedBadges = safeJsonParse<Record<string, boolean>>(safeGetItem('study_claimed_badges'), {});

  return ALL_BADGES.map(badge => ({
    ...badge,
    unlocked: currentXP >= badge.requiredXP,
    claimed: !!claimedBadges[badge.id]
  }));
}
