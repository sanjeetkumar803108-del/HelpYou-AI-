import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Share2, 
  Check, 
  Sparkles, 
  RefreshCw, 
  Settings, 
  Search, 
  GraduationCap, 
  Compass, 
  BookOpen, 
  Flame, 
  ShieldCheck, 
  Award, 
  Zap, 
  AlertTriangle, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Copy, 
  Brain,
  ExternalLink,
  Target,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import confetti from 'canvas-confetti';
import { saveMistakeToVault } from '../utils/mistakes';
import { getUserProfileData } from '../utils/profile';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Network } from '@capacitor/network';
import { getCoins, deductCoins, isProUser } from '../utils/coins';
import { addStudyXP } from '../utils/gamification';
import { getApiUrl } from '../utils/api';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { db, auth } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import GlobalMarkdown from './GlobalMarkdown';
import { 
  getCanonicalDailyBooster, 
  getClientDeterministicBonusQuestions 
} from '../utils/dailyTriviaData';

interface DailyTriviaProps {
  onBack: () => void;
  isOpen?: boolean;
}

export interface DailyBoosterQuestion {
  id?: string;
  subject: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  latexEquation?: string;
  shortExplanation: string;
  examTrapWarning: string;
}

export interface DailyBoosterPayload {
  dayNumber?: number;
  theme?: string;
  questions: DailyBoosterQuestion[];
}

export interface QuestionUserResponse {
  selectedIndex: number;
  isCorrect: boolean;
}

/**
 * Safely locates and validates today's completed official Daily Booster from cache.
 * Checks the clean canonical key, legacy profile-specific key, prefix scan, and fallback.
 */
function getTodayCompletedBooster(
  todayKey: string,
  gradeLevel: string,
  academicStream: string
): { booster: DailyBoosterPayload; responses: QuestionUserResponse[]; streak?: number } | null {
  // 1. Primary canonical key
  const primaryKey = `daily_booster_completed_${todayKey}`;
  const rawPrimary = safeGetItem(primaryKey);
  if (rawPrimary) {
    try {
      const parsed = JSON.parse(rawPrimary);
      if (parsed?.booster && Array.isArray(parsed?.responses) && parsed.responses.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to parse primary completed booster:", e);
    }
  }

  // 2. Legacy profile-specific key for backward compatibility
  const legacyKey = `daily_booster_completed_${todayKey}_${gradeLevel}_${academicStream}`;
  const rawLegacy = safeGetItem(legacyKey);
  if (rawLegacy) {
    try {
      const parsed = JSON.parse(rawLegacy);
      if (parsed?.booster && Array.isArray(parsed?.responses) && parsed.responses.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to parse legacy completed booster:", e);
    }
  }

  // 3. Scan all keys in localStorage starting with daily_booster_completed_${todayKey}
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(`daily_booster_completed_${todayKey}`)) {
          const item = window.localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            if (parsed?.booster && Array.isArray(parsed?.responses) && parsed.responses.length > 0) {
              return parsed;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Error scanning completed booster keys:", e);
  }

  // 4. Fallback: if today was marked completed and today's questions exist
  const lastCompletedDate = safeGetItem('study_booster_last_completed_date');
  if (lastCompletedDate === todayKey) {
    const todayCached = safeGetItem(`daily_booster_today_${todayKey}`);
    if (todayCached) {
      try {
        const parsed = JSON.parse(todayCached);
        if (parsed?.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          const simulatedResponses = parsed.questions.map((q: DailyBoosterQuestion) => ({
            selectedIndex: q.correctIndex,
            isCorrect: true
          }));
          return {
            booster: parsed,
            responses: simulatedResponses
          };
        }
      } catch {}
    }
  }

  return null;
}

export default function DailyTrivia({ onBack, isOpen }: DailyTriviaProps) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    Network.getStatus().then((status) => {
      setIsOffline(!status.connected);
    }).catch(err => {
      console.warn("DailyTrivia: Failed to get initial network status", err);
    });

    const listener = Network.addListener('networkStatusChange', (status) => {
      setIsOffline(!status.connected);
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  const userProfile = getUserProfileData();
  const gradeLevel = userProfile.gradeLevel || '11th Grade';
  const academicStream = userProfile.stream || 'STEM / Engineering';
  const country = userProfile.country || 'Global';
  const studyLevel = userProfile.studyLevel || 'High School';

  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Synchronously look up today's completed booster so UI renders Scorecard immediately with 0ms delay!
  const initialCompletedData = useMemo(() => {
    return getTodayCompletedBooster(todayKey, gradeLevel, academicStream);
  }, [todayKey, gradeLevel, academicStream]);

  // Standard daily key for caching today's booster questions (same for all users on this calendar date)
  const todayQuestionsKey = `daily_booster_today_${todayKey}`;

  // Synchronously check if today's questions were already generated or cached in localStorage
  const initialCachedBooster = useMemo(() => {
    if (initialCompletedData?.booster) return initialCompletedData.booster;
    const todayCached = safeGetItem(todayQuestionsKey) || safeGetItem(`daily_booster_today_${todayKey}_${gradeLevel}_${academicStream}`);
    if (todayCached) {
      try {
        const parsed = JSON.parse(todayCached);
        if (parsed?.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          return parsed;
        }
      } catch {}
    }
    return null;
  }, [initialCompletedData, todayQuestionsKey, todayKey, gradeLevel, academicStream]);

  // Main state - fresh users who haven't completed quiz start directly at question 0 (Card 1 of 3)
  const [booster, setBooster] = useState<DailyBoosterPayload | null>(initialCachedBooster);
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (initialCompletedData) {
      return (initialCompletedData.booster?.questions?.length || 3) - 1;
    }
    return 0; // Fresh user starts directly at question 1 (index 0)
  });
  const [responses, setResponses] = useState<QuestionUserResponse[]>(() => {
    return initialCompletedData?.responses || [];
  });
  const [isRevealed, setIsRevealed] = useState<boolean>(() => {
    return !!initialCompletedData;
  });
  const [isCompleted, setIsCompleted] = useState<boolean>(() => {
    return !!initialCompletedData;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    // Only show loading if neither completed data nor cached booster is synchronously available
    return !initialCompletedData && !initialCachedBooster;
  });
  const [triviaError, setTriviaError] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState<string>('');
  const [isCustomizing, setIsCustomizing] = useState<boolean>(false);
  const [isBonusSession, setIsBonusSession] = useState<boolean>(false);
  const [showBonusModal, setShowBonusModal] = useState<boolean>(false);
  const [bonusCount, setBonusCount] = useState<number>(3);
  const [xpAwarded, setXpAwarded] = useState<number>(0);
  const [activeReviewTrapIndex, setActiveReviewTrapIndex] = useState<number | null>(null);

  // Streaks and Freezes - 100% in sync with Profile & App-wide Streak
  const [currentStreak, setCurrentStreak] = useState<number>(() => {
    const val = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');
    return isNaN(val) ? 0 : val;
  });
  const [streakFreezes, setStreakFreezes] = useState<number>(() => {
    const val = parseInt(safeGetItem('study_streak_freezes') || '0', 10);
    return isNaN(val) ? 0 : val;
  });
  const [awardedNewFreeze, setAwardedNewFreeze] = useState<boolean>(false);

  // Sync real-time streak updates with Profile, App.tsx and Firestore
  useEffect(() => {
    const syncStreak = () => {
      const val = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');
      setCurrentStreak(isNaN(val) ? 0 : val);
    };

    const handleStreakUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail !== undefined) {
        const val = Number(customEvent.detail || 0);
        setCurrentStreak(isNaN(val) ? 0 : val);
      } else {
        syncStreak();
      }
    };

    window.addEventListener('study-streak-updated', handleStreakUpdate);
    window.addEventListener('storage', syncStreak);

    return () => {
      window.removeEventListener('study-streak-updated', handleStreakUpdate);
      window.removeEventListener('storage', syncStreak);
    };
  }, []);

  // Exclude list to prevent repeat traps
  const [excludeList, setExcludeList] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('study_trivia_excludes') || '[]');
    } catch {
      return [];
    }
  });

  const getStreamSuggestions = () => {
    const stream = academicStream.toLowerCase();
    if (stream.includes('med') || stream.includes('bio')) {
      return [
        "🧬 Cell Bio & Enzyme Traps",
        "🫀 Respiration & Krebs Traps",
        "🌿 Genetics & Punnett Traps",
        "🧪 Biochemistry & Cofactors",
        "💡 High-Yield Biology Traps"
      ];
    }
    if (stream.includes('business') || stream.includes('econ') || stream.includes('commerce')) {
      return [
        "📈 Elasticity Sign Traps",
        "🏦 Debit & Credit Traps",
        "⚖️ Opportunity Cost Paradoxes",
        "📊 Working Capital Calculations",
        "💡 High-Yield Commerce Traps"
      ];
    }
    if (stream.includes('human') || stream.includes('art') || stream.includes('law')) {
      return [
        "📜 Constitutional Amendment Traps",
        "🏛️ Syllogism & Fallacy Traps",
        "✍️ Chronological Order Traps",
        "🌍 Cartography & Scale Traps",
        "💡 Logic & Reasoning Traps"
      ];
    }
    return [
      "⚡ Inverse Square & Sign Traps",
      "🧪 Periodic & Bonding Exceptions",
      "🧬 Confusable Biochemical Pathways",
      "📐 Calculus & Limit Traps",
      "💡 JEE/NEET Negative Marking Traps"
    ];
  };

  const handleHeaderBack = () => {
    triggerVibration(10);
    if (isCustomizing) {
      setIsCustomizing(false);
    } else {
      // If exiting while in a bonus session, restore the completed daily state so user returns to scorecard
      if (isBonusSession) {
        setIsBonusSession(false);
        const todayCompleted = getTodayCompletedBooster(todayKey, gradeLevel, academicStream);
        if (todayCompleted) {
          setBooster(todayCompleted.booster);
          setResponses(todayCompleted.responses);
          setIsCompleted(true);
          setIsRevealed(true);
          setCurrentIndex((todayCompleted.booster.questions?.length || 3) - 1);
        }
      }
      onBack();
    }
  };

  // Track whether initial auto-load has triggered to avoid duplicate fetches or deadlock
  const hasTriggeredLoadRef = useRef(false);

  // Fetch or Load Daily Booster
  const loadDailyBooster = async (forceNewBonus: boolean = false, forcedTopic?: string, questionCount: number = 3) => {
    const finalCount = forceNewBonus ? (questionCount || 3) : 3;
    setBonusCount(finalCount);

    // If not forcing a bonus session and user completed today's official booster, restore it directly!
    if (!forceNewBonus) {
      const completedData = getTodayCompletedBooster(todayKey, gradeLevel, academicStream);
      if (completedData) {
        setBooster(completedData.booster);
        setResponses(completedData.responses);
        setIsCompleted(true);
        setIsRevealed(true);
        setCurrentIndex((completedData.booster.questions?.length || 3) - 1);
        setLoading(false);
        setIsBonusSession(false);
        const realStreak = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');
        if (realStreak > 0) {
          setCurrentStreak(realStreak);
        }
        return;
      }

      // Check if today's questions were already generated & cached in localStorage
      const existingTodayQuestions = safeGetItem(todayQuestionsKey) || safeGetItem(`daily_booster_today_${todayKey}`);
      if (existingTodayQuestions) {
        try {
          const parsed = JSON.parse(existingTodayQuestions);
          if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            setBooster(parsed);
            setIsBonusSession(false);
            setLoading(false);
            setCurrentIndex(0);
            return;
          }
        } catch (e) {
          console.warn("Failed to parse cached today questions:", e);
        }
      }
    }

    // Daily 3 questions are 100% FREE for all users every day - no paywall, no coin deduction!
    setLoading(true);
    setTriviaError(null);
    setCurrentIndex(0);
    setResponses([]);
    setIsRevealed(false);
    setIsCompleted(false);
    setAwardedNewFreeze(false);
    triggerVibration(15);

    try {
      const activeTopic = forcedTopic !== undefined ? forcedTopic : customTopic;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(getApiUrl('/api/generate-trivia'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          gradeLevel,
          academicStream,
          studyLevel,
          topic: activeTopic,
          excludeQuestions: excludeList.slice(-100),
          country,
          isBonus: forceNewBonus,
          count: finalCount,
          dateKey: todayKey
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const loadedBooster: DailyBoosterPayload = data.booster || {
        dayNumber: 1,
        theme: "Exam Trap Avoidance",
        questions: data.questions || [data.trivia]
      };

      if (loadedBooster && Array.isArray(loadedBooster.questions) && loadedBooster.questions.length > 0) {
        setBooster(loadedBooster);
        setIsBonusSession(forceNewBonus);

        // Cache today's official questions so they aren't lost or regenerated
        if (!forceNewBonus) {
          safeSetItem(todayQuestionsKey, JSON.stringify(loadedBooster));
          safeSetItem(`daily_booster_today_${todayKey}`, JSON.stringify(loadedBooster));
        }

        // Update exclusion list with question texts (store up to 500 items to permanently avoid repeats)
        const newExcludes = Array.from(new Set([...excludeList, ...loadedBooster.questions.map(q => q.question)])).slice(-500);
        setExcludeList(newExcludes);
        localStorage.setItem('study_trivia_excludes', JSON.stringify(newExcludes));
      } else {
        throw new Error("Invalid booster payload received");
      }
    } catch (error) {
      console.warn('Failed to load trivia from server, applying deterministic fallback:', error);
      // Fast deterministic fallback: guarantees the user NEVER gets stuck on infinite loading!
      if (!forceNewBonus) {
        const canonicalDaily = getCanonicalDailyBooster(todayKey);
        setBooster(canonicalDaily);
        setIsBonusSession(false);
        safeSetItem(todayQuestionsKey, JSON.stringify(canonicalDaily));
        safeSetItem(`daily_booster_today_${todayKey}`, JSON.stringify(canonicalDaily));
      } else {
        const bonusFallback = getClientDeterministicBonusQuestions(academicStream, finalCount, excludeList);
        setBooster(bonusFallback);
        setIsBonusSession(true);
        const newExcludes = Array.from(new Set([...excludeList, ...bonusFallback.questions.map(q => q.question)])).slice(-500);
        setExcludeList(newExcludes);
        localStorage.setItem('study_trivia_excludes', JSON.stringify(newExcludes));
      }
    } finally {
      setLoading(false);
    }
  };

  // Keep scorecard restored if today is completed or fetch if missing
  useEffect(() => {
    if (isOpen !== false) {
      const completedData = getTodayCompletedBooster(todayKey, gradeLevel, academicStream);
      if (completedData) {
        if (!isBonusSession) {
          setBooster(completedData.booster);
          setResponses(completedData.responses);
          setIsCompleted(true);
          setIsRevealed(true);
          setCurrentIndex((completedData.booster.questions?.length || 3) - 1);
          setLoading(false);
          const realStreak = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');
          if (realStreak > 0) {
            setCurrentStreak(realStreak);
          }
        }
      } else {
        // If not completed and no booster in state, trigger load immediately
        if (!booster && !hasTriggeredLoadRef.current) {
          hasTriggeredLoadRef.current = true;
          loadDailyBooster(false);
        }
      }
    }
  }, [isOpen, todayKey, gradeLevel, academicStream, booster]);

  // Handle Option Selection
  const handleSelectOption = (optionIndex: number) => {
    if (isRevealed || !booster) return;

    const currentQuestion = booster.questions[currentIndex];
    const isCorrect = optionIndex === currentQuestion.correctIndex;

    const updatedResponses = [...responses, { selectedIndex: optionIndex, isCorrect }];
    setResponses(updatedResponses);
    setIsRevealed(true);

    if (isCorrect) {
      triggerVibration([15, 30, 20]);
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch (e) {
        console.error("Confetti error:", e);
      }
    } else {
      triggerVibration(45);
      // Auto-save to Mistake Vault with Exam Trap Warning
      const wrongText = currentQuestion.options[optionIndex] || `Option ${optionIndex + 1}`;
      const correctText = currentQuestion.options[currentQuestion.correctIndex];
      const equationPart = currentQuestion.latexEquation ? ` | Formula/Concept: ${currentQuestion.latexEquation}` : '';
      const reasoning = `Correct: ${correctText}. Trap Warning: ${currentQuestion.examTrapWarning}${equationPart} | ${currentQuestion.shortExplanation}`;

      saveMistakeToVault(
        'Daily Trivia',
        `[${currentQuestion.subject}] ${currentQuestion.question}`,
        wrongText,
        reasoning
      ).catch(err => console.error("Failed to auto-save mistake to vault:", err));
    }
  };

  // Progress to next card or complete
  const handleNextStep = () => {
    triggerVibration(15);
    if (!booster) return;

    if (currentIndex < booster.questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsRevealed(false);
    } else {
      // Completed all 3 questions!
      finishBooster();
    }
  };

  // Finish booster & calculate streaks & awards
  const finishBooster = () => {
    setIsCompleted(true);
    triggerVibration([25, 50, 25, 50]);

    try {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 }
      });
    } catch (e) {
      console.error("Confetti error:", e);
    }

    // Award +50 XP
    const xpResult = addStudyXP(50, 'Daily Trivia Booster');
    setXpAwarded(xpResult.awardedAmount || 50);

    // Synchronize with App-Wide Real Study Streak (exact same as Profile & StreakDetailsPage)
    const today = todayKey;
    const lastPunchDate = safeGetItem('study_last_punch_date');
    let streak = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');

    let freezeMilestone = false;

    if (lastPunchDate !== today) {
      if (lastPunchDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        if (lastPunchDate === yKey) {
          streak = streak + 1;
        } else {
          // Missed a day: check if user has a streak freeze token
          const currentFreezes = parseInt(safeGetItem('study_streak_freezes') || '0', 10);
          if (currentFreezes > 0) {
            safeSetItem('study_streak_freezes', String(currentFreezes - 1));
            setStreakFreezes(currentFreezes - 1);
            streak = streak + 1; // streak protected by freeze token!
          } else {
            streak = 1; // reset streak
          }
        }
      } else {
        streak = streak > 0 ? streak : 1;
      }

      safeSetItem('study_punches', String(streak));
      safeSetItem('study_streak_days', String(streak));
      safeSetItem('study_last_punch_date', today);
      safeSetItem('study_booster_last_completed_date', today);
      setCurrentStreak(streak);

      // Reward 1 Streak Freeze token every 7 consecutive days
      if (streak > 0 && streak % 7 === 0) {
        const updatedFreezes = parseInt(safeGetItem('study_streak_freezes') || '0', 10) + 1;
        safeSetItem('study_streak_freezes', String(updatedFreezes));
        setStreakFreezes(updatedFreezes);
        setAwardedNewFreeze(true);
        freezeMilestone = true;
      }

      // Synchronize across whole app so Profile & Streak details update instantly
      window.dispatchEvent(new CustomEvent('study-streak-updated', { detail: streak }));

      // Sync with Firestore user doc if logged in
      if (auth.currentUser) {
        setDoc(doc(db, 'users', auth.currentUser.uid), {
          currentStreak: streak,
          lastActiveDate: today
        }, { merge: true }).catch(err => console.warn("DailyTrivia: Firestore streak sync notice:", err));
      }
    } else {
      // Streak was already counted today by app check-in or prior task
      // Keep real streak intact, never reset or overwrite with a different number!
      if (streak === 0) streak = 1;
      safeSetItem('study_booster_last_completed_date', today);
      setCurrentStreak(streak);
      window.dispatchEvent(new CustomEvent('study-streak-updated', { detail: streak }));
    }

    // Save completed booster to localStorage for today
    if (!isBonusSession && booster) {
      const completedData = {
        booster,
        responses,
        streak,
        completedAt: new Date().toISOString()
      };
      const jsonStr = JSON.stringify(completedData);

      // Primary canonical key (universal for today)
      safeSetItem(`daily_booster_completed_${todayKey}`, jsonStr);

      // Legacy key for backwards compatibility
      const completedCacheKey = `daily_booster_completed_${todayKey}_${gradeLevel}_${academicStream}`;
      safeSetItem(completedCacheKey, jsonStr);

      // Cache today's questions
      safeSetItem(todayQuestionsKey, JSON.stringify(booster));
      safeSetItem(`daily_booster_today_${todayKey}`, JSON.stringify(booster));

      // Mark completion date
      safeSetItem('study_booster_last_completed_date', today);
    }
  };

  // Share Scorecard to WhatsApp or Social
  const handleShareScorecard = async () => {
    if (!booster) return;
    triggerVibration(15);

    const score = responses.filter(r => r.isCorrect).length;
    const total = booster.questions.length;
    
    const cardBreakdown = booster.questions.map((q, idx) => {
      const resp = responses[idx];
      const statusIcon = resp && resp.isCorrect ? '✅ Mastered' : '⚠️ Trap Avoided Next Time';
      return `Card ${idx + 1} (${q.subject}): ${statusIcon}`;
    }).join('\n');

    const shareText = `⚡ HelpYou AI — Daily Trivia Booster
🔥 Discipline Streak: Day ${currentStreak}
🎯 Exam Traps Mastered: ${score}/${total}
📚 Profile: ${gradeLevel} (${academicStream})

Exam Trap Breakdown:
${cardBreakdown}

Defeat negative-marking exam traps in under 90 seconds daily on HelpYou AI! 🚀
Try it free: ${window.location.origin}`;

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: 'Daily Trivia Booster Scorecard',
          text: shareText,
          url: window.location.origin
        });
        return;
      } catch (e) {
        console.error("Native share failed, falling back to web:", e);
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Daily Trivia Booster Scorecard',
          text: shareText,
          url: window.location.origin
        });
        return;
      } catch (e) {
        console.log("Web share cancelled:", e);
      }
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText)
        .then(() => {
          setShareToast("Scorecard copied! Paste on WhatsApp or social 🚀");
          setTimeout(() => setShareToast(null), 3000);
        })
        .catch(() => {
          setShareToast("Could not copy scorecard.");
          setTimeout(() => setShareToast(null), 2500);
        });
    }
  };

  const currentQ = booster?.questions[currentIndex];
  const currentResp = responses[currentIndex];
  const masteredCount = responses.filter(r => r.isCorrect).length;

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6] text-zinc-900 overflow-y-auto">
      {/* Top App Header */}
      <header className="px-5 py-4 bg-white border-b border-zinc-100 flex justify-between items-center sticky top-0 z-20 shadow-xs">
        <button 
          onClick={handleHeaderBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-700 hover:text-zinc-950 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
          <h1 className="text-sm font-black tracking-tight text-zinc-900 flex items-center gap-1.5">
            <span className="text-amber-500">⚡</span> Daily Trivia Booster
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Exam Trap Defense</span>
            <span className="w-1 h-1 rounded-full bg-zinc-300" />
            <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded">Under 90s</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Streak Flame Pill */}
          <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/70 text-amber-800 px-2.5 py-1.5 rounded-full shadow-xs">
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
            <span className="text-xs font-black">{currentStreak}</span>
          </div>

          <button 
            onClick={handleShareScorecard}
            disabled={loading || !booster}
            className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
            title="Share Scorecard"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Share Toast Notification */}
      <AnimatePresence>
        {shareToast && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-20 right-5 bg-zinc-900 text-white text-xs px-3.5 py-2 rounded-full font-bold shadow-xl whitespace-nowrap z-50 flex items-center gap-2 border border-zinc-800"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            {shareToast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 p-5 flex flex-col gap-4 max-w-md mx-auto w-full pb-10">
        {/* Profile Calibration Bar & Category Toggle */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-3.5 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Calibrated Profile</p>
              <p className="text-xs font-black text-zinc-800">{gradeLevel} • {academicStream}</p>
            </div>
          </div>

          <button
            onClick={() => {
              triggerVibration(10);
              setIsCustomizing(!isCustomizing);
            }}
            className={`p-2 rounded-xl border transition-all ${isCustomizing ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200'}`}
            title="Custom Focus"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Customization Drawer */}
        <AnimatePresence>
          {isCustomizing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-xs overflow-hidden"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Focus topic (e.g. Optics, Organic exceptions)..."
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:bg-white transition-all"
                  />
                </div>
                <button
                  onClick={() => {
                    setIsCustomizing(false);
                    loadDailyBooster(true, customTopic);
                  }}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs px-3.5 py-2 rounded-xl active:scale-95 transition-all shadow-xs"
                >
                  Generate
                </button>
              </div>

              <div className="mt-3">
                <p className="text-[10px] text-zinc-400 font-extrabold uppercase mb-1.5 flex items-center gap-1">
                  <Compass className="w-3 h-3 text-zinc-500" /> Suggested Exam Trap Categories:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {getStreamSuggestions().map((sug) => (
                    <button
                      key={sug}
                      onClick={() => {
                        setCustomTopic(sug);
                        setIsCustomizing(false);
                        loadDailyBooster(true, sug);
                      }}
                      className={`text-[10px] px-2.5 py-1 rounded-full border font-bold transition-all ${
                        customTopic === sug 
                          ? 'bg-purple-50 text-purple-700 border-purple-200' 
                          : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setCustomTopic('');
                      setIsCustomizing(false);
                      loadDailyBooster(false, '');
                    }}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-black hover:bg-amber-100"
                  >
                    ✨ Standard Curriculum
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* State 1: Offline View (only if no booster questions are available in memory/cache) */}
        {isOffline && !booster ? (
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-8 shadow-xs flex flex-col items-center justify-center text-center my-auto">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 text-2xl">
              🔌
            </div>
            <h2 className="text-base font-black text-zinc-900">You Are Offline</h2>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-xs">
              Daily Trivia Booster is loading today's offline emergency questions. Please reconnect to access dynamic online traps.
            </p>
            <button
              onClick={() => loadDailyBooster(false)}
              className="mt-6 px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-all"
            >
              Load Offline Booster
            </button>
          </div>
        ) : triviaError && !booster ? (
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-8 shadow-xs flex flex-col items-center justify-center text-center my-auto">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 text-2xl">
              ⚠️
            </div>
            <h2 className="text-base font-black text-zinc-900">Connection Interrupted</h2>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-xs">{triviaError}</p>
            <button
              onClick={() => loadDailyBooster(false)}
              className="mt-6 px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-all"
            >
              Try Again
            </button>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-10 shadow-xs flex flex-col items-center justify-center my-auto">
            <div className="relative flex items-center justify-center mb-5">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                className="w-14 h-14 border-3 border-zinc-100 border-t-amber-500 rounded-full"
              />
              <Sparkles className="absolute w-5 h-5 text-amber-500 animate-pulse" />
            </div>
            <h3 className="text-sm font-black text-zinc-900 text-center">
              {isBonusSession ? `Calibrating ${bonusCount} Bonus Practice Traps...` : "Calibrating Daily Exam Traps..."}
            </h3>
            <p className="text-xs text-zinc-400 text-center mt-1.5 px-4 font-medium leading-relaxed">
              Curating {isBonusSession ? bonusCount : 3} rapid negative-marking traps tailored for {gradeLevel} {academicStream}.
            </p>
          </div>
        ) : isCompleted ? (
          /* State 2: Daily Completion Summary Screen */
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-4"
          >
            {/* Grand Celebration Card */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 text-white rounded-3xl p-6 shadow-md relative overflow-hidden text-center">
              <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="inline-flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/20 text-amber-300 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider mb-4">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                {isBonusSession ? "Bonus Booster Crushed!" : "Daily Booster Complete"}
              </div>

              {/* Fire Streak */}
              <div className="flex items-center justify-center gap-2 mb-2">
                <Flame className="w-8 h-8 text-amber-400 fill-amber-400 animate-bounce" />
                <span className="text-3xl font-black text-white tracking-tight">Day {currentStreak}</span>
              </div>
              <p className="text-xs text-zinc-300 font-medium">Study discipline streak maintained! Keep the fire burning.</p>

              {/* Accuracy & XP Grid */}
              <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-zinc-800">
                <div className="bg-zinc-800/60 rounded-2xl p-3 border border-zinc-700/50">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">Traps Mastered</p>
                  <p className="text-xl font-black text-emerald-400 mt-0.5">{masteredCount}/{booster?.questions.length || 3}</p>
                  <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                    {masteredCount === (booster?.questions.length || 3) 
                      ? "Flawless Defense! 🌟" 
                      : masteredCount >= Math.ceil((booster?.questions.length || 3) * 0.6) 
                        ? "Strong Accuracy! 💪" 
                        : "Good Practice! 🛡️"}
                  </p>
                </div>
                <div className="bg-zinc-800/60 rounded-2xl p-3 border border-zinc-700/50">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">XP Awarded</p>
                  <p className="text-xl font-black text-amber-400 mt-0.5">+{xpAwarded || 50} XP</p>
                  <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Level Progress ⚡</p>
                </div>
              </div>

              {/* Streak Freeze Token Status */}
              <div className="mt-4 bg-zinc-800/40 rounded-2xl p-3 border border-zinc-800 flex items-center justify-between text-left">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase">Streak Protection</p>
                    <p className="text-xs font-black text-zinc-200">
                      {streakFreezes > 0 ? `${streakFreezes} Freeze Tokens Ready` : `${currentStreak % 7}/7 Days to Next Token`}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-blue-300 font-bold bg-blue-500/20 px-2 py-0.5 rounded-md">
                  {currentStreak % 7 === 0 ? "7-Day Milestone!" : `${7 - (currentStreak % 7)}d away`}
                </span>
              </div>
            </div>

            {/* 3-Card Trap Breakdown */}
            <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-xs">
              <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-zinc-600" />
                {isBonusSession ? `Bonus ${booster?.questions.length || 3}-Trap Review` : "Today's 3-Trap Review"}
              </h3>

              <div className="flex flex-col gap-2.5">
                {booster?.questions.map((q, idx) => {
                  const resp = responses[idx];
                  const isCorrect = resp?.isCorrect;
                  const isExpanded = activeReviewTrapIndex === idx;

                  return (
                    <div 
                      key={idx}
                      className={`border rounded-2xl p-3.5 transition-all ${
                        isCorrect 
                          ? 'border-emerald-200/80 bg-emerald-50/20' 
                          : 'border-red-200/80 bg-red-50/20'
                      }`}
                    >
                      <div 
                        onClick={() => setActiveReviewTrapIndex(isExpanded ? null : idx)}
                        className="flex items-center justify-between cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {isCorrect ? '✓' : '✗'}
                          </span>
                          <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                              Card {idx + 1}: {q.subject}
                            </p>
                            <p className="text-xs font-black text-zinc-800 leading-tight">{q.topic}</p>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold text-indigo-600 underline">
                          {isExpanded ? 'Hide' : 'Review Trap'}
                        </span>
                      </div>

                      {/* Expandable Trap Detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 pt-3 border-t border-zinc-200/60 flex flex-col gap-2"
                          >
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-xs text-amber-950 font-bold">
                              <span className="text-[10px] text-amber-800 uppercase tracking-wider block font-black mb-0.5">⚠️ Exam Trap:</span>
                              <GlobalMarkdown className="text-xs font-medium text-amber-900 leading-relaxed [&_p]:inline [&_p]:m-0">{q.examTrapWarning}</GlobalMarkdown>
                            </div>

                            {q.latexEquation && (
                              <div className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-2.5 text-center text-xs font-semibold text-zinc-800 overflow-x-auto">
                                <GlobalMarkdown className="text-xs font-mono">{`$$${q.latexEquation}$$`}</GlobalMarkdown>
                              </div>
                            )}

                            <div className="text-xs text-zinc-600 font-medium leading-relaxed">
                              <strong className="text-zinc-900">Key Takeaway: </strong>
                              <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">{q.shortExplanation}</GlobalMarkdown>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Mistake Vault notice */}
              {masteredCount < (booster?.questions.length || 3) && (
                <div className="mt-4 bg-purple-50/80 border border-purple-200/70 rounded-2xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <p className="text-xs font-bold text-purple-900">
                      {(booster?.questions.length || 3) - masteredCount} trap{(booster?.questions.length || 3) - masteredCount > 1 ? 's' : ''} auto-saved to your Mistake Vault.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleShareScorecard}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
              >
                <Share2 className="w-4 h-4" />
                Brag on WhatsApp / Social
              </button>

              <button
                onClick={() => {
                  triggerVibration(15);
                  setShowBonusModal(true);
                }}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Practice Bonus Booster (Unlimited)
              </button>

              <button
                onClick={() => {
                  if (isBonusSession) {
                    setIsBonusSession(false);
                    const todayCompleted = getTodayCompletedBooster(todayKey, gradeLevel, academicStream);
                    if (todayCompleted) {
                      setBooster(todayCompleted.booster);
                      setResponses(todayCompleted.responses);
                      setIsCompleted(true);
                      setIsRevealed(true);
                      setCurrentIndex((todayCompleted.booster.questions?.length || 3) - 1);
                    }
                  }
                  onBack();
                }}
                className="w-full bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-xs py-3 rounded-2xl transition-all active:scale-98"
              >
                Back to Dashboard
              </button>
            </div>
          </motion.div>
        ) : (
          /* State 3: Interactive 3-Card Assessment Flow */
          booster && currentQ && (
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-4"
            >
              {/* Top Card Progress Bar */}
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-black">
                  <span className="text-zinc-400 uppercase tracking-wider">
                    Card {currentIndex + 1} of {booster.questions.length}
                  </span>
                  <span className="text-amber-600 font-black flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> {booster.questions.length <= 3 ? "Rapid-Fire 90s" : booster.questions.length <= 5 ? "Power Drill ~2.5m" : "Mastery Marathon ~5m"}
                  </span>
                </div>

                {/* Segmented Stepper */}
                <div className="flex gap-1.5 w-full">
                  {booster.questions.map((_, i) => {
                    const isDone = i < currentIndex;
                    const isCurrent = i === currentIndex;
                    return (
                      <div
                        key={i}
                        className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                          isDone 
                            ? 'bg-emerald-500' 
                            : isCurrent 
                              ? 'bg-amber-500 animate-pulse' 
                              : 'bg-zinc-100'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Active Question Card */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-xs flex flex-col">
                {/* Subject & Topic Tag */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {currentQ.subject} • {currentQ.topic}
                  </span>

                  <span className="text-[10px] bg-amber-50 border border-amber-200/70 text-amber-800 font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
                    ⚠️ Negative-Marking Trap
                  </span>
                </div>

                {/* Question Prompt */}
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 mb-4 text-center">
                  <div className="text-sm font-black text-zinc-900 leading-relaxed">
                    <GlobalMarkdown className="inline text-sm font-black">{currentQ.question}</GlobalMarkdown>
                  </div>
                </div>

                {/* 4 Options */}
                <div className="flex flex-col gap-2.5 mb-4">
                  {currentQ.options.map((option, idx) => {
                    const isSelected = currentResp?.selectedIndex === idx;
                    const isCorrect = idx === currentQ.correctIndex;
                    
                    let optionStyle = "border-zinc-200/80 bg-white hover:bg-zinc-50 text-zinc-800 font-bold";
                    if (isRevealed) {
                      if (isCorrect) {
                        optionStyle = "bg-emerald-50 border-emerald-300 text-emerald-950 font-black shadow-xs";
                      } else if (isSelected) {
                        optionStyle = "bg-red-50 border-red-300 text-red-950 font-black";
                      } else {
                        optionStyle = "border-zinc-100 bg-zinc-50/40 text-zinc-400 opacity-50";
                      }
                    }

                    const optionLetters = ['A', 'B', 'C', 'D'];

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectOption(idx)}
                        disabled={isRevealed || isOffline}
                        className={`w-full py-3.5 px-4 rounded-2xl text-left text-xs transition-all duration-200 flex items-center justify-between border shadow-xs ${optionStyle} ${!isRevealed ? 'cursor-pointer active:scale-98' : 'cursor-default'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 border ${
                            isRevealed && isCorrect 
                              ? 'bg-emerald-500 border-emerald-500 text-white' 
                              : isRevealed && isSelected 
                                ? 'bg-red-500 border-red-500 text-white' 
                                : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                          }`}>
                            {optionLetters[idx] || (idx + 1)}
                          </span>
                          <span className="leading-snug">
                            <GlobalMarkdown className="inline text-xs font-bold">{option}</GlobalMarkdown>
                          </span>
                        </div>

                        {isRevealed && isCorrect && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        {isRevealed && isSelected && !isCorrect && (
                          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Instant Reveal Card */}
                <AnimatePresence>
                  {isRevealed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: 10 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-col gap-2.5 mb-4 overflow-hidden pt-2 border-t border-zinc-100"
                    >
                      {/* Exam Trap Callout Banner */}
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-950 font-bold">
                        <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          ⚠️ Exam Trap Breakdown:
                        </span>
                        <div className="leading-relaxed">
                          <GlobalMarkdown className="text-xs font-medium text-amber-900 leading-relaxed [&_p]:inline [&_p]:m-0">{currentQ.examTrapWarning}</GlobalMarkdown>
                        </div>
                      </div>

                      {/* Formula / Calculation */}
                      {currentQ.latexEquation && (
                        <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3 text-center text-xs font-semibold text-zinc-800 overflow-x-auto shadow-inner">
                          <p className="text-[9px] text-zinc-400 uppercase font-black tracking-wider mb-1">Formula & Calculation:</p>
                          <GlobalMarkdown className="text-xs font-mono">{`$$${currentQ.latexEquation}$$`}</GlobalMarkdown>
                        </div>
                      )}

                      {/* Short Explanation */}
                      <div className="bg-indigo-50/50 border border-indigo-100/70 rounded-2xl p-3 text-xs text-zinc-700 leading-relaxed">
                        <p className="text-[10px] text-indigo-900 uppercase font-black tracking-wider mb-0.5">💡 Core Takeaway:</p>
                        <div>
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-xs text-zinc-700">{currentQ.shortExplanation}</GlobalMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bottom Action Button */}
                {isRevealed ? (
                  <button
                    onClick={handleNextStep}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs py-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm active:scale-98"
                  >
                    <span>
                      {currentIndex < booster.questions.length - 1 
                        ? "Next Trap →" 
                        : "Finish Booster & View Score 🏆"}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="text-center py-1">
                    <p className="text-[11px] text-zinc-400 font-bold">Tap an option to reveal the exam trap breakdown</p>
                  </div>
                )}
              </div>
            </motion.div>
          )
        )}
      </div>

      {/* Question Selection Modal for Practice Bonus Booster (Options: 3, 5, 10) */}
      <AnimatePresence>
        {showBonusModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
              className="bg-white rounded-3xl border border-zinc-200/90 p-5 shadow-2xl max-w-sm w-full relative overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowBonusModal(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="mb-4">
                <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-200/60 text-purple-700 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-2">
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  Unlimited Practice
                </div>
                <h3 className="text-base font-black text-zinc-900 tracking-tight">Select Number of Questions</h3>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">
                  Tailored for your <span className="font-bold text-zinc-700">{gradeLevel} ({academicStream})</span> profile.
                </p>
              </div>

              {/* Exactly 3 Selection Options: 3, 5, 10 */}
              <div className="flex flex-col gap-2.5">
                {/* Option 1: 3 Questions */}
                <button
                  onClick={() => {
                    triggerVibration(15);
                    setShowBonusModal(false);
                    loadDailyBooster(true, undefined, 3);
                  }}
                  className="group flex items-center justify-between p-3.5 rounded-2xl border-2 border-zinc-200/80 hover:border-amber-400 bg-zinc-50/60 hover:bg-amber-50/40 transition-all text-left active:scale-98 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-base group-hover:scale-105 transition-transform">
                      <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-zinc-900">3 Questions</span>
                        <span className="text-[10px] bg-zinc-200/70 text-zinc-700 font-bold px-1.5 py-0.2 rounded-md">~90s</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 font-medium">Quick Sprint • 3 High-Yield Traps</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* Option 2: 5 Questions (Recommended) */}
                <button
                  onClick={() => {
                    triggerVibration(15);
                    setShowBonusModal(false);
                    loadDailyBooster(true, undefined, 5);
                  }}
                  className="group relative flex items-center justify-between p-3.5 rounded-2xl border-2 border-purple-400 bg-purple-50/25 hover:bg-purple-50/45 transition-all text-left active:scale-98 cursor-pointer shadow-xs"
                >
                  <div className="absolute -top-2 right-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                    ★ POPULAR
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-black text-base group-hover:scale-105 transition-transform">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-zinc-900">5 Questions</span>
                        <span className="text-[10px] bg-purple-200/60 text-purple-800 font-bold px-1.5 py-0.2 rounded-md">~2.5m</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 font-medium">Standard Drill • Core Concepts</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-purple-600 group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* Option 3: 10 Questions */}
                <button
                  onClick={() => {
                    triggerVibration(15);
                    setShowBonusModal(false);
                    loadDailyBooster(true, undefined, 10);
                  }}
                  className="group flex items-center justify-between p-3.5 rounded-2xl border-2 border-zinc-200/80 hover:border-emerald-400 bg-zinc-50/60 hover:bg-emerald-50/40 transition-all text-left active:scale-98 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black text-base group-hover:scale-105 transition-transform">
                      <Flame className="w-5 h-5 text-emerald-500 fill-emerald-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-zinc-900">10 Questions</span>
                        <span className="text-[10px] bg-zinc-200/70 text-zinc-700 font-bold px-1.5 py-0.2 rounded-md">~5m</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 font-medium">Mastery Marathon • Deep Practice</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                </button>
              </div>

              {/* Cancel Button */}
              <button
                onClick={() => setShowBonusModal(false)}
                className="w-full mt-3.5 py-2 text-center text-xs font-bold text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
