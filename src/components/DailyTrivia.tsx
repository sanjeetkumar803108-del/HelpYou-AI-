import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  ArrowLeft, 
  Share2, 
  Check,
  Flame, 
  ShieldCheck, 
  Award, 
  AlertTriangle, 
  ChevronRight, 
  CheckCircle2, 
  XCircle,
  BookOpen,
  Sparkles,
  Flag
} from 'lucide-react';
import ReportAIModal from './ReportAIModal';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import confetti from 'canvas-confetti';
import { saveMistakeToVault } from '../utils/mistakes';
import { getUserProfileData } from '../utils/profile';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Network } from '@capacitor/network';
import { addStudyXP } from '../utils/gamification';
import { getApiUrl } from '../utils/api';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { db, auth } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import GlobalMarkdown from './GlobalMarkdown';
import { getClientDeterministicBonusQuestions, CANONICAL_DAILY_QUESTIONS } from '../utils/dailyTriviaData';

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

const TIMER_SECONDS = 90;

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normalizeTriviaQuestion(q: any): DailyBoosterQuestion {
  if (!q) {
    return {
      id: 'fallback_q',
      subject: 'Academic Knowledge',
      topic: 'Core Concept',
      question: 'Review the fundamental principle behind this concept.',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 0,
      shortExplanation: 'Always double check units, signs, and formula constraints.',
      examTrapWarning: 'Common trap: Rushing the question and picking the first intuitive option.'
    };
  }

  const rawOptions = Array.isArray(q.options) && q.options.length >= 2
    ? q.options.map((opt: any) => String(opt ?? '').trim())
    : ['Option A', 'Option B', 'Option C', 'Option D'];

  while (rawOptions.length < 4) {
    rawOptions.push(`Option ${String.fromCharCode(65 + rawOptions.length)}`);
  }

  const correctIndex = typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < rawOptions.length
    ? q.correctIndex
    : 0;

  // Resolve explanation across all possible AI property variations to guarantee no blank box
  const rawExplanation = (
    q.shortExplanation ||
    q.explanation ||
    q.takeaway ||
    q.rationale ||
    q.solution ||
    q.reason ||
    q.answerExplanation ||
    q.short_explanation ||
    ''
  );
  const cleanExp = String(rawExplanation).trim();
  const shortExplanation = (cleanExp && cleanExp !== 'undefined' && cleanExp !== 'null')
    ? cleanExp
    : (rawOptions[correctIndex] ? `Correct answer is "${rawOptions[correctIndex]}". Double-check the fundamental definitions and formula relationships.` : 'Review the core definition and step-by-step formula.');

  // Resolve trap warning across all possible AI property variations to guarantee no blank box
  const rawTrap = (
    q.examTrapWarning ||
    q.trapWarning ||
    q.trap ||
    q.examTrap ||
    q.exam_trap_warning ||
    q.exam_trap ||
    q.commonMistake ||
    q.pitfall ||
    ''
  );
  const cleanTrap = String(rawTrap).trim();
  const examTrapWarning = (cleanTrap && cleanTrap !== 'undefined' && cleanTrap !== 'null')
    ? cleanTrap
    : 'Common mistake: Rushing the question or assuming intuitive behavior without verifying the physical/mathematical rule.';

  const rawLatex = q.latexEquation || q.latex || q.formula;
  const cleanLatex = rawLatex && String(rawLatex).trim() !== 'undefined' && String(rawLatex).trim() !== 'null' ? String(rawLatex).trim() : undefined;

  return {
    id: q.id || `q_${Math.random().toString(36).slice(2, 9)}`,
    subject: String(q.subject || 'Academic Knowledge').trim(),
    topic: String(q.topic || 'Concept Review').trim(),
    question: String(q.question || '').trim(),
    options: rawOptions.slice(0, 4),
    correctIndex,
    latexEquation: cleanLatex,
    shortExplanation,
    examTrapWarning
  };
}

export function normalizeBoosterPayload(payload: any): DailyBoosterPayload {
  let questions: DailyBoosterQuestion[] = [];
  if (payload && Array.isArray(payload.questions)) {
    questions = payload.questions
      .map(normalizeTriviaQuestion)
      .filter((q: DailyBoosterQuestion) => q.question && q.question.length > 5);
  } else if (payload?.trivia) {
    questions = [normalizeTriviaQuestion(payload.trivia)];
  }

  // Strictly guarantee at least 3 high-yield questions
  if (questions.length < 3) {
    for (const bq of CANONICAL_DAILY_QUESTIONS) {
      if (questions.length >= 3) break;
      if (!questions.some(q => q.question === bq.question)) {
        questions.push(normalizeTriviaQuestion(bq));
      }
    }
  }

  return {
    dayNumber: payload?.dayNumber || 1,
    theme: payload?.theme || 'Daily Exam Trap Booster',
    questions: questions.slice(0, 3)
  };
}

/**
 * Looks up today's completed booster from localStorage (multiple key strategies for compat).
 * Discards corrupted sessions with fewer than 3 questions so user can take a full session.
 */
function getTodayCompletedData(
  todayKey: string
): { booster: DailyBoosterPayload; responses: QuestionUserResponse[]; streak?: number } | null {
  // Primary canonical key
  const raw = safeGetItem(`daily_booster_completed_${todayKey}`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed?.booster?.questions &&
        Array.isArray(parsed.booster.questions) &&
        parsed.booster.questions.length >= 3 &&
        Array.isArray(parsed?.responses) &&
        parsed.responses.length >= 3
      ) {
        parsed.booster = normalizeBoosterPayload(parsed.booster);
        return parsed;
      }
    } catch {}
  }
  // Fallback: scan any key with today's date prefix
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(`daily_booster_completed_${todayKey}`)) {
          const item = window.localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            if (
              parsed?.booster?.questions &&
              Array.isArray(parsed.booster.questions) &&
              parsed.booster.questions.length >= 3 &&
              Array.isArray(parsed?.responses) &&
              parsed.responses.length >= 3
            ) {
              parsed.booster = normalizeBoosterPayload(parsed.booster);
              return parsed;
            }
          }
        }
      }
    }
  } catch {}
  return null;
}


export default function DailyTrivia({ onBack, isOpen }: DailyTriviaProps) {
  // ─── Profile ───────────────────────────────────────────────────────────────
  const userProfile = getUserProfileData();
  const gradeLevel = userProfile.gradeLevel || '11th Grade';
  const academicStream = userProfile.stream || 'STEM / Engineering';
  const country = userProfile.country || 'Global';
  const studyLevel = userProfile.studyLevel || 'High School';

  const todayKey = useMemo(() => getTodayKey(), []);

  // Per-user-profile daily cache key (so different profiles on same device get different questions)
  const todayQKey = `daily_trivia_today_${todayKey}_${gradeLevel.replace(/\s/g, '_')}_${academicStream.replace(/\s/g, '_').slice(0, 20)}`;

  // ─── Synchronous initialization ────────────────────────────────────────────
  const initialCompleted = useMemo(() => getTodayCompletedData(todayKey), [todayKey]);

  const initialCachedBooster = useMemo<DailyBoosterPayload | null>(() => {
    if (initialCompleted?.booster) return initialCompleted.booster;
    const raw = safeGetItem(todayQKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.questions && Array.isArray(parsed.questions) && parsed.questions.length >= 3) {
          return normalizeBoosterPayload(parsed);
        }
      } catch {}
    }
    return null;
  }, [initialCompleted, todayQKey]);


  // ─── Core state ────────────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(false);
  const [booster, setBooster] = useState<DailyBoosterPayload | null>(initialCachedBooster);
  const [currentIndex, setCurrentIndex] = useState<number>(() =>
    initialCompleted ? (initialCompleted.booster?.questions?.length || 3) - 1 : 0
  );
  const [responses, setResponses] = useState<QuestionUserResponse[]>(() => initialCompleted?.responses || []);
  const [isRevealed, setIsRevealed] = useState<boolean>(() => !!initialCompleted);
  const [isCompleted, setIsCompleted] = useState<boolean>(() => !!initialCompleted);
  const [loading, setLoading] = useState<boolean>(() => !initialCompleted && !initialCachedBooster);

  // ─── UI state ──────────────────────────────────────────────────────────────
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [activeReviewIdx, setActiveReviewIdx] = useState<number | null>(null);
  const [xpAwarded, setXpAwarded] = useState<number>(0);
  const [awardedNewFreeze, setAwardedNewFreeze] = useState<boolean>(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSnippet, setReportSnippet] = useState('');

  // Exclude list — persists across days to prevent question repetition
  const [excludeList, setExcludeList] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('study_trivia_excludes') || '[]'); }
    catch { return []; }
  });

  // ─── Refs for stale-closure safety ─────────────────────────────────────────
  const responsesRef = useRef<QuestionUserResponse[]>(responses);
  const boosterRef = useRef<DailyBoosterPayload | null>(booster);
  const isCompletedRef = useRef(isCompleted);

  useEffect(() => { responsesRef.current = responses; }, [responses]);
  useEffect(() => { boosterRef.current = booster; }, [booster]);
  useEffect(() => { isCompletedRef.current = isCompleted; }, [isCompleted]);

  // ─── 90-second timer ───────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState<number>(TIMER_SECONDS);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerActive(false);
  }, []);

  // Core finish function — always call this, reads stale-safe refs
  const doFinish = useCallback((finalResponses: QuestionUserResponse[]) => {
    stopTimer();
    setIsCompleted(true);
    triggerVibration([25, 50, 25, 50]);
    try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } }); } catch {}

    // XP
    const xpResult = addStudyXP(50, 'Daily Trivia Booster');
    setXpAwarded(xpResult.awardedAmount || 50);

    // Save completion to localStorage
    const bst = boosterRef.current;
    if (bst) {
      const data = { booster: bst, responses: finalResponses, completedAt: new Date().toISOString() };
      const jsonStr = JSON.stringify(data);
      safeSetItem(`daily_booster_completed_${todayKey}`, jsonStr);
      safeSetItem(`daily_booster_completed_${todayKey}_${gradeLevel}_${academicStream}`, jsonStr);
      safeSetItem(todayQKey, JSON.stringify(bst));
      safeSetItem('study_booster_last_completed_date', todayKey);
    }

    // Streak
    const lastPunchDate = safeGetItem('study_last_punch_date');
    let streak = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');

    if (lastPunchDate !== todayKey) {
      if (lastPunchDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        if (lastPunchDate === yKey) {
          streak += 1;
        } else {
          const freezes = parseInt(safeGetItem('study_streak_freezes') || '0', 10);
          if (freezes > 0) {
            safeSetItem('study_streak_freezes', String(freezes - 1));
            setStreakFreezes(freezes - 1);
            streak += 1;
          } else {
            streak = 1;
          }
        }
      } else {
        streak = streak > 0 ? streak : 1;
      }
      safeSetItem('study_punches', String(streak));
      safeSetItem('study_streak_days', String(streak));
      safeSetItem('study_last_punch_date', todayKey);
      setCurrentStreak(streak);

      if (streak > 0 && streak % 7 === 0) {
        const updatedFreezes = parseInt(safeGetItem('study_streak_freezes') || '0', 10) + 1;
        safeSetItem('study_streak_freezes', String(updatedFreezes));
        setStreakFreezes(updatedFreezes);
        setAwardedNewFreeze(true);
      }
      window.dispatchEvent(new CustomEvent('study-streak-updated', { detail: streak }));
      if (auth.currentUser) {
        setDoc(doc(db, 'users', auth.currentUser.uid), { currentStreak: streak, lastActiveDate: todayKey }, { merge: true })
          .catch(() => {});
      }
    } else {
      if (streak === 0) streak = 1;
      safeSetItem('study_booster_last_completed_date', todayKey);
      setCurrentStreak(streak);
      window.dispatchEvent(new CustomEvent('study-streak-updated', { detail: streak }));
    }
  }, [todayKey, gradeLevel, academicStream, todayQKey, stopTimer]);

  // Timer effect
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            setTimerActive(false);
            // Time's up — finish with whatever responses we have
            if (!isCompletedRef.current) {
              doFinish(responsesRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [timerActive, doFinish]);

  // ─── Streak state ──────────────────────────────────────────────────────────
  const [currentStreak, setCurrentStreak] = useState<number>(() => {
    const val = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');
    return isNaN(val) ? 0 : val;
  });
  const [streakFreezes, setStreakFreezes] = useState<number>(() => {
    const val = parseInt(safeGetItem('study_streak_freezes') || '0', 10);
    return isNaN(val) ? 0 : val;
  });

  useEffect(() => {
    const syncStreak = () => {
      const val = Number(safeGetItem('study_punches') || safeGetItem('study_streak_days') || '0');
      setCurrentStreak(isNaN(val) ? 0 : val);
    };
    const handleStreakUpdate = (e: Event) => {
      const ev = e as CustomEvent;
      if (ev.detail !== undefined) setCurrentStreak(Number(ev.detail || 0));
      else syncStreak();
    };
    window.addEventListener('study-streak-updated', handleStreakUpdate);
    window.addEventListener('storage', syncStreak);
    return () => {
      window.removeEventListener('study-streak-updated', handleStreakUpdate);
      window.removeEventListener('storage', syncStreak);
    };
  }, []);

  // ─── Network ───────────────────────────────────────────────────────────────
  useEffect(() => {
    Network.getStatus().then(s => setIsOffline(!s.connected)).catch(() => {});
    const listener = Network.addListener('networkStatusChange', s => setIsOffline(!s.connected));
    return () => { listener.then(l => l.remove()); };
  }, []);

  // ─── Load daily profile-based questions ────────────────────────────────────
  const hasTriggeredLoadRef = useRef(false);

  const loadDailyBooster = useCallback(async () => {
    // Show scorecard if already completed today
    const completed = getTodayCompletedData(todayKey);
    if (completed) {
      setBooster(completed.booster);
      setResponses(completed.responses);
      setIsCompleted(true);
      setIsRevealed(true);
      setCurrentIndex((completed.booster.questions?.length || 3) - 1);
      setLoading(false);
      return;
    }

    // Use cached questions if available
    const cached = safeGetItem(todayQKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.questions && Array.isArray(parsed.questions) && parsed.questions.length >= 3) {
          const normalized = normalizeBoosterPayload(parsed);
          setBooster(normalized);
          setCurrentIndex(0);
          setResponses([]);
          setIsRevealed(false);
          setIsCompleted(false);
          setTimeLeft(TIMER_SECONDS);
          setTimerActive(true);
          setLoading(false);
          return;
        }
      } catch {}
    }

    // Fetch profile-based AI questions
    setLoading(true);
    setCurrentIndex(0);
    setResponses([]);
    setIsRevealed(false);
    setIsCompleted(false);
    setTimeLeft(TIMER_SECONDS);
    triggerVibration(15);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(getApiUrl('/api/generate-trivia'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          gradeLevel,
          academicStream,
          studyLevel,
          country,
          excludeQuestions: excludeList.slice(-100),
          isBonus: true, // Profile-based AI generation
          count: 3,
          dateKey: todayKey
        }),
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Server ${response.status}`);
      const data = await response.json();
      const rawPayload = data.booster || { questions: data.questions || [data.trivia] };
      const loaded: DailyBoosterPayload = normalizeBoosterPayload(rawPayload);

      if (loaded?.questions && loaded.questions.length >= 3) {
        setBooster(loaded);
        safeSetItem(todayQKey, JSON.stringify(loaded));

        // Update exclude list — prevents repeats across days
        const newExcludes = Array.from(
          new Set([...excludeList, ...loaded.questions.map(q => q.question)])
        ).slice(-500);
        setExcludeList(newExcludes);
        localStorage.setItem('study_trivia_excludes', JSON.stringify(newExcludes));

        setTimerActive(true);
      } else {
        throw new Error('Invalid payload');
      }
    } catch {
      // Offline / server fallback → deterministic profile-based questions
      const rawFallback = getClientDeterministicBonusQuestions(academicStream, 3, excludeList);
      const fallback = normalizeBoosterPayload(rawFallback);
      setBooster(fallback);
      safeSetItem(todayQKey, JSON.stringify(fallback));

      const newExcludes = Array.from(
        new Set([...excludeList, ...fallback.questions.map(q => q.question)])
      ).slice(-500);
      setExcludeList(newExcludes);
      localStorage.setItem('study_trivia_excludes', JSON.stringify(newExcludes));

      setTimerActive(true);
    } finally {
      setLoading(false);
    }
  }, [todayKey, todayQKey, gradeLevel, academicStream, studyLevel, country, excludeList]);

  // Auto-load on open
  useEffect(() => {
    if (isOpen !== false) {
      const completed = getTodayCompletedData(todayKey);
      if (completed) {
        setBooster(completed.booster);
        setResponses(completed.responses);
        setIsCompleted(true);
        setIsRevealed(true);
        setCurrentIndex((completed.booster.questions?.length || 3) - 1);
        setLoading(false);
      } else if (!booster && !hasTriggeredLoadRef.current) {
        hasTriggeredLoadRef.current = true;
        loadDailyBooster();
      } else if (booster && !isCompleted && !timerActive) {
        // Has cached questions, start timer
        setTimerActive(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ─── Interaction handlers ──────────────────────────────────────────────────
  const handleSelectOption = (optionIndex: number) => {
    if (isRevealed || !booster) return;
    const currentQ = booster.questions[currentIndex];
    const isCorrect = optionIndex === currentQ.correctIndex;

    const updatedResponses = [...responses, { selectedIndex: optionIndex, isCorrect }];
    setResponses(updatedResponses);
    setIsRevealed(true);

    if (isCorrect) {
      triggerVibration([15, 30, 20]);
      try { confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } }); } catch {}
    } else {
      triggerVibration(45);
      const wrongText = currentQ.options[optionIndex] || `Option ${optionIndex + 1}`;
      const correctText = currentQ.options[currentQ.correctIndex] || 'Correct answer';
      const cleanTrap = currentQ.examTrapWarning && String(currentQ.examTrapWarning).trim() !== 'undefined' ? String(currentQ.examTrapWarning).trim() : '';
      const cleanExp = currentQ.shortExplanation && String(currentQ.shortExplanation).trim() !== 'undefined' ? String(currentQ.shortExplanation).trim() : '';
      const cleanEq = currentQ.latexEquation && String(currentQ.latexEquation).trim() !== 'undefined' ? String(currentQ.latexEquation).trim() : '';

      const trapPart = cleanTrap ? ` Trap Warning: ${cleanTrap}` : '';
      const eqPart = cleanEq ? ` | Formula/Concept: ${cleanEq}` : '';
      const expPart = cleanExp ? ` | ${cleanExp}` : '';

      saveMistakeToVault(
        'Daily Trivia',
        `[${currentQ.subject || 'Academic'}] ${currentQ.question}`,
        wrongText,
        `Correct: ${correctText}.${trapPart}${eqPart}${expPart}`
      ).catch(() => {});
    }
  };

  const handleNextStep = () => {
    triggerVibration(15);
    if (!booster) return;

    if (currentIndex < booster.questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsRevealed(false);
    } else {
      // All questions done — stop timer and finish
      doFinish(responsesRef.current);
    }
  };

  // ─── Share handler ─────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!booster) return;
    triggerVibration(15);
    const score = responses.filter(r => r.isCorrect).length;
    const total = booster.questions.length;
    const shareText = `⚡ Daily Trivia — ${score}/${total} Traps Mastered!\n🔥 Streak: Day ${currentStreak}\n📚 ${gradeLevel} · ${academicStream}\nTry HelpYou AI: ${window.location.origin}`;

    if (Capacitor.isNativePlatform()) {
      try { await Share.share({ title: 'Daily Trivia Scorecard', text: shareText, url: window.location.origin }); return; } catch {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Daily Trivia Scorecard', text: shareText, url: window.location.origin }); return; } catch {}
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText)
        .then(() => { setShareToast('Copied! Paste anywhere 🚀'); setTimeout(() => setShareToast(null), 3000); })
        .catch(() => {});
    }
  };

  // ─── Derived values ────────────────────────────────────────────────────────
  const timerPercent = (timeLeft / TIMER_SECONDS) * 100;
  const timerColor = timeLeft > 30 ? '#22c55e' : timeLeft > 10 ? '#f59e0b' : '#ef4444';
  const masteredCount = responses.filter(r => r.isCorrect).length;
  const currentQ = booster?.questions[currentIndex];
  const currentResp = responses[currentIndex];
  const LETTERS = ['A', 'B', 'C', 'D'];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#FAF9F6] text-zinc-900 overflow-y-auto">

      {/* ── Header (clean: back · streak · share) ── */}
      <header className="px-4 py-3 bg-white border-b border-zinc-100 flex justify-between items-center sticky top-0 z-20 shadow-xs">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-700 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200/70 text-amber-800 px-3 py-1.5 rounded-full">
          <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
          <span className="text-xs font-black">{currentStreak} day{currentStreak !== 1 ? 's' : ''}</span>
        </div>

        <button
          onClick={handleShare}
          disabled={!isCompleted || !booster}
          className="w-10 h-10 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
          title="Share result"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </header>

      {/* ── Share toast ── */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-20 right-5 bg-zinc-900 text-white text-xs px-3.5 py-2 rounded-full font-bold shadow-xl z-50 flex items-center gap-2"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            {shareToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <div className="flex-1 p-4 flex flex-col gap-4 max-w-md mx-auto w-full pb-28">

        {/* ── LOADING ── */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-10 shadow-xs flex flex-col items-center justify-center my-auto">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              className="w-14 h-14 border-3 border-zinc-100 border-t-amber-500 rounded-full mb-5"
            />
            <h3 className="text-sm font-black text-zinc-900 text-center">Preparing your questions…</h3>
            <p className="text-xs text-zinc-400 mt-1 font-medium text-center">
              Calibrating for {gradeLevel} · {academicStream}
            </p>
          </div>

        ) : isCompleted ? (
          /* ── SCORECARD ── */
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-4"
          >
            {/* Score header */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 text-white rounded-3xl p-6 shadow-md relative overflow-hidden text-center">
              <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="inline-flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/20 text-amber-300 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider mb-4">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                Daily Complete
              </div>

              <div className="flex items-center justify-center gap-2 mb-1">
                <Flame className="w-8 h-8 text-amber-400 fill-amber-400 animate-bounce" />
                <span className="text-3xl font-black text-white">Day {currentStreak}</span>
              </div>
              <p className="text-xs text-zinc-400 font-medium">Streak intact 🔥</p>

              <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-zinc-800">
                <div className="bg-zinc-800/60 rounded-2xl p-3 border border-zinc-700/50">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">Traps Mastered</p>
                  <p className="text-xl font-black text-emerald-400 mt-0.5">{masteredCount}/{booster?.questions?.length || 3}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {masteredCount === (booster?.questions?.length || 3) ? 'Flawless! 🌟' : masteredCount >= 2 ? 'Strong 💪' : 'Keep going 🛡️'}
                  </p>
                </div>
                <div className="bg-zinc-800/60 rounded-2xl p-3 border border-zinc-700/50">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">XP Earned</p>
                  <p className="text-xl font-black text-amber-400 mt-0.5">+{xpAwarded || 50}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Level progress ⚡</p>
                </div>
              </div>

              <div className="mt-4 bg-zinc-800/40 rounded-2xl p-3 border border-zinc-800 flex items-center justify-between text-left">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                  <p className="text-xs font-black text-zinc-200">
                    {streakFreezes > 0 ? `${streakFreezes} Freeze Tokens` : `${currentStreak % 7}/7 to next token`}
                  </p>
                </div>
                <span className="text-[10px] text-blue-300 font-bold bg-blue-500/20 px-2 py-0.5 rounded-md shrink-0">
                  {currentStreak % 7 === 0 ? 'Milestone! 🎉' : `${7 - (currentStreak % 7)}d away`}
                </span>
              </div>
            </div>

            {/* Question-by-question review */}
            <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-xs">
              <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-zinc-600" />
                Today's Review
              </h3>

              <div className="flex flex-col gap-2.5">
                {booster?.questions.map((q, idx) => {
                  const resp = responses[idx];
                  const correct = resp?.isCorrect;
                  const expanded = activeReviewIdx === idx;

                  return (
                    <div
                      key={idx}
                      className={`border rounded-2xl p-3.5 transition-all ${
                        correct ? 'border-emerald-200/80 bg-emerald-50/20' : 'border-red-200/80 bg-red-50/20'
                      }`}
                    >
                      <div
                        onClick={() => setActiveReviewIdx(expanded ? null : idx)}
                        className="flex items-center justify-between cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            correct ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {correct ? '✓' : '✗'}
                          </span>
                          <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                              Q{idx + 1} · {q.subject}
                            </p>
                            <p className="text-xs font-black text-zinc-800 leading-tight">{q.topic}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-600 underline ml-2 shrink-0">
                          {expanded ? 'Hide' : 'Review'}
                        </span>
                      </div>

                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 pt-3 border-t border-zinc-200/60 flex flex-col gap-2 overflow-hidden"
                          >
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
                              <p className="text-[10px] text-amber-800 uppercase tracking-wider font-black mb-0.5">⚠️ Exam Trap:</p>
                              <GlobalMarkdown className="text-xs font-medium text-amber-900 leading-relaxed [&_p]:inline [&_p]:m-0">
                                {q.examTrapWarning}
                              </GlobalMarkdown>
                            </div>
                            {q.latexEquation && (
                              <div className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-2.5 text-center overflow-x-auto">
                                <GlobalMarkdown className="text-xs font-mono">{`$$${q.latexEquation}$$`}</GlobalMarkdown>
                              </div>
                            )}
                            <div className="text-xs text-zinc-600 leading-relaxed">
                              <strong className="text-zinc-900">Key: </strong>
                              <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">{q.shortExplanation}</GlobalMarkdown>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {masteredCount < (booster?.questions?.length || 3) && (
                <div className="mt-3 bg-purple-50/80 border border-purple-200/70 rounded-2xl p-3 flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <p className="text-xs font-bold text-purple-900">
                    {(booster?.questions?.length || 3) - masteredCount} trap{((booster?.questions?.length || 3) - masteredCount) > 1 ? 's' : ''} saved to Mistake Vault.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleShare}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
              >
                <Share2 className="w-4 h-4" />
                Share Result
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerVibration(15);
                  const textToReport = booster ? booster.questions.map((q, idx) => `Q${idx + 1}: ${q.question}\nAns: ${q.options[q.correctIndex]}\nExplanation: ${q.shortExplanation}`).join('\n\n') : '';
                  setReportSnippet(textToReport);
                  setReportModalOpen(true);
                }}
                className="w-full py-3 px-4 rounded-2xl font-bold text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 shadow-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer"
                title="Report Inaccurate or Inappropriate Content"
              >
                <Flag className="w-3.5 h-3.5 text-rose-500" />
                <span>Report Daily Trivia</span>
              </button>
              <button
                onClick={onBack}
                className="w-full bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-xs py-3 rounded-2xl transition-all active:scale-98"
              >
                Back to Dashboard
              </button>
            </div>
          </motion.div>

        ) : booster && currentQ ? (
          /* ── ACTIVE QUIZ ── */
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-4"
            >
              {/* Progress + timer */}
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-black">
                  <span className="text-zinc-500 uppercase tracking-wider">
                    Question {currentIndex + 1} / {booster?.questions?.length || 3}
                  </span>
                  <span className="tabular-nums font-black" style={{ color: timerColor }}>
                    ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </span>
                </div>

                {/* Question stepper dots */}
                <div className="flex gap-1.5 w-full">
                  {(booster?.questions || [0, 1, 2]).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                        i < currentIndex
                          ? 'bg-emerald-500'
                          : i === currentIndex
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-zinc-100'
                      }`}
                    />
                  ))}
                </div>

                {/* 90s countdown bar */}
                <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: timerColor }}
                    animate={{ width: `${timerPercent}%` }}
                    transition={{ duration: 0.8, ease: 'linear' }}
                  />
                </div>
              </div>

              {/* Question card */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 shadow-xs flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {currentQ.subject}
                  </span>
                  <span className="text-[10px] bg-amber-50 border border-amber-200/70 text-amber-800 font-black uppercase px-2.5 py-1 rounded-full">
                    ⚠️ Trap
                  </span>
                </div>

                {/* Question text */}
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 mb-4 text-center">
                  <div className="text-sm font-black text-zinc-900 leading-relaxed">
                    <GlobalMarkdown className="inline text-sm font-black">{currentQ.question}</GlobalMarkdown>
                  </div>
                </div>

                {/* Options */}
                <div className="flex flex-col gap-2.5 mb-4">
                  {currentQ.options.map((option, idx) => {
                    const isSelected = currentResp?.selectedIndex === idx;
                    const isCorrect = idx === currentQ.correctIndex;

                    let style = 'border-zinc-200/80 bg-white hover:bg-zinc-50 text-zinc-800 font-bold';
                    if (isRevealed) {
                      if (isCorrect) style = 'bg-emerald-50 border-emerald-300 text-emerald-950 font-black shadow-xs';
                      else if (isSelected) style = 'bg-red-50 border-red-300 text-red-950 font-black';
                      else style = 'border-zinc-100 bg-zinc-50/40 text-zinc-400 opacity-50';
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectOption(idx)}
                        disabled={isRevealed}
                        className={`w-full py-3.5 px-4 rounded-2xl text-left text-xs transition-all flex items-center justify-between border shadow-xs ${style} ${!isRevealed ? 'cursor-pointer active:scale-98' : 'cursor-default'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 border ${
                            isRevealed && isCorrect ? 'bg-emerald-500 border-emerald-500 text-white'
                              : isRevealed && isSelected ? 'bg-red-500 border-red-500 text-white'
                                : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                          }`}>
                            {LETTERS[idx]}
                          </span>
                          <span className="leading-snug">
                            <GlobalMarkdown className="inline text-xs font-bold">{option}</GlobalMarkdown>
                          </span>
                        </div>
                        {isRevealed && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                        {isRevealed && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Reveal explanation */}
                <AnimatePresence>
                  {isRevealed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: 10 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-col gap-2.5 mb-4 pt-2 border-t border-zinc-100 overflow-hidden"
                    >
                      {/* Exam Trap Warning Box */}
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-950">
                        <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Exam Trap:</span>
                        </span>
                        <GlobalMarkdown className="text-xs font-medium text-amber-900 leading-relaxed [&_p]:inline [&_p]:m-0">
                          {currentQ.examTrapWarning || 'Common mistake: Rushing the question or assuming intuitive behavior without verifying the physical/mathematical rule.'}
                        </GlobalMarkdown>
                      </div>

                      {currentQ.latexEquation && (
                        <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3 text-center overflow-x-auto shadow-inner">
                          <p className="text-[9px] text-zinc-400 uppercase font-black tracking-wider mb-1">Formula:</p>
                          <GlobalMarkdown className="text-xs font-mono">{`$$${currentQ.latexEquation}$$`}</GlobalMarkdown>
                        </div>
                      )}

                      {/* Takeaway / Explanation Box */}
                      <div className="bg-indigo-50/50 border border-indigo-100/70 rounded-2xl p-3 text-xs text-zinc-700 leading-relaxed">
                        <p className="text-[10px] text-indigo-900 uppercase font-black tracking-wider mb-0.5 flex items-center gap-1.5">
                          <span>💡</span>
                          <span>Takeaway:</span>
                        </p>
                        <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-xs text-zinc-700">
                          {currentQ.shortExplanation || (currentQ.options[currentQ.correctIndex] ? `Correct answer is "${currentQ.options[currentQ.correctIndex]}". Review the core definition and step-by-step formula.` : 'Review the core definition and step-by-step formula.')}
                        </GlobalMarkdown>
                      </div>

                      <div className="pt-1 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            triggerVibration(15);
                            setReportSnippet(`Question: ${currentQ.question}\nCorrect: ${currentQ.options[currentQ.correctIndex]}\nExplanation: ${currentQ.shortExplanation}`);
                            setReportModalOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex items-center gap-1 text-[10.5px] font-bold active:scale-95 cursor-pointer"
                          title="Report Inaccurate or Inappropriate Content"
                        >
                          <Flag className="w-3.5 h-3.5 text-rose-500" />
                          <span>Report Question</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bottom CTA */}
                {isRevealed ? (
                  <button
                    onClick={handleNextStep}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98"
                  >
                    {currentIndex < ((booster?.questions?.length || 3) - 1) ? 'Next →' : 'See Results 🏆'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="text-center py-1">
                    <p className="text-[11px] text-zinc-400 font-bold">Tap an option to answer</p>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

        ) : !loading ? (
          /* ── OFFLINE / ERROR fallback ── */
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-8 shadow-xs flex flex-col items-center text-center my-auto">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 text-2xl">🔌</div>
            <h2 className="text-base font-black text-zinc-900">
              {isOffline ? 'No Connection' : 'Something went wrong'}
            </h2>
            <button
              onClick={loadDailyBooster}
              className="mt-6 px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-extrabold active:scale-95 transition-all"
            >
              Try Again
            </button>
          </div>
        ) : null}

      </div>

      {/* Google Play GenAI Safety Report Modal */}
      <ReportAIModal
        isOpen={reportModalOpen}
        messageText={reportSnippet}
        sourceFeature="Daily Trivia"
        onClose={() => {
          setReportModalOpen(false);
          setReportSnippet('');
        }}
      />
    </div>
  );
}
