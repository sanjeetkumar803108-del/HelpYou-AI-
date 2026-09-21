import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink
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
import GlobalMarkdown from './GlobalMarkdown';

interface DailyTriviaProps {
  onBack: () => void;
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

export default function DailyTrivia({ onBack }: DailyTriviaProps) {
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

  // Main state
  const [booster, setBooster] = useState<DailyBoosterPayload | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [responses, setResponses] = useState<QuestionUserResponse[]>([]);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [triviaError, setTriviaError] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState<string>('');
  const [isCustomizing, setIsCustomizing] = useState<boolean>(false);
  const [isBonusSession, setIsBonusSession] = useState<boolean>(false);
  const [xpAwarded, setXpAwarded] = useState<number>(0);
  const [activeReviewTrapIndex, setActiveReviewTrapIndex] = useState<number | null>(null);

  // Streaks and Freezes
  const [currentStreak, setCurrentStreak] = useState<number>(() => {
    const val = parseInt(localStorage.getItem('study_punches') || localStorage.getItem('study_streak_days') || '1', 10);
    return isNaN(val) || val < 1 ? 1 : val;
  });
  const [streakFreezes, setStreakFreezes] = useState<number>(() => {
    const val = parseInt(localStorage.getItem('study_streak_freezes') || '0', 10);
    return isNaN(val) ? 0 : val;
  });
  const [awardedNewFreeze, setAwardedNewFreeze] = useState<boolean>(false);

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
      onBack();
    }
  };

  // Fetch or Load Daily Booster
  const loadDailyBooster = async (forceNewBonus: boolean = false, forcedTopic?: string) => {
    if (isOffline) {
      setLoading(false);
      return;
    }

    const completedCacheKey = `daily_booster_completed_${todayKey}_${gradeLevel}_${academicStream}`;
    const savedCompletedData = localStorage.getItem(completedCacheKey);

    // If not forcing a bonus session and user completed today's official booster, restore it
    if (!forceNewBonus && savedCompletedData) {
      try {
        const parsedData = JSON.parse(savedCompletedData);
        if (parsedData.booster && parsedData.responses) {
          setBooster(parsedData.booster);
          setResponses(parsedData.responses);
          setIsCompleted(true);
          setIsRevealed(true);
          setCurrentIndex(2);
          setLoading(false);
          setIsBonusSession(false);
          return;
        }
      } catch (err) {
        console.warn("Failed to parse saved daily booster:", err);
      }
    }

    // Check coins if non-pro
    if (!isProUser() && !forceNewBonus) {
      const currentCoins = getCoins();
      if (currentCoins < 1) {
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "Daily Trivia Booster", cost: 1 } }));
        onBack();
        return;
      }
    }

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
      const response = await fetch(getApiUrl('/api/generate-trivia'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gradeLevel,
          academicStream,
          studyLevel,
          topic: activeTopic,
          excludeQuestions: excludeList,
          country,
          isBonus: forceNewBonus
        }),
      });

      if (!response.ok) {
        throw new Error('Server error');
      }

      const data = await response.json();
      const loadedBooster: DailyBoosterPayload = data.booster || {
        dayNumber: 1,
        theme: "Exam Trap Avoidance",
        questions: data.questions || [data.trivia]
      };

      if (loadedBooster && Array.isArray(loadedBooster.questions) && loadedBooster.questions.length > 0) {
        if (!isProUser() && !forceNewBonus) {
          deductCoins(1, "Daily Trivia Booster");
        }

        setBooster(loadedBooster);
        setIsBonusSession(forceNewBonus);

        // Update exclusion list with question texts
        const newExcludes = [...excludeList, ...loadedBooster.questions.map(q => q.question)].slice(-150);
        setExcludeList(newExcludes);
        localStorage.setItem('study_trivia_excludes', JSON.stringify(newExcludes));
      } else {
        throw new Error("Invalid booster payload received");
      }
    } catch (error) {
      console.error('Failed to generate daily booster:', error);
      setTriviaError("Unable to load today's booster. Please check connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDailyBooster(false);
  }, []);

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
      const reasoning = `Correct: ${correctText}. Trap Warning: ${currentQuestion.examTrapWarning} | Formula/Concept: ${currentQuestion.latexEquation || ''} | ${currentQuestion.shortExplanation}`;

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

    // Update streaks and check 7-day freeze milestone
    const today = todayKey;
    const lastDate = localStorage.getItem('study_booster_last_completed_date');
    let streak = parseInt(localStorage.getItem('study_punches') || '1', 10);
    if (isNaN(streak) || streak < 1) streak = 1;

    let freezeMilestone = false;

    if (lastDate !== today) {
      if (lastDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        if (lastDate === yKey) {
          streak += 1;
        } else {
          // Missed a day: check if user has a streak freeze token
          const currentFreezes = parseInt(localStorage.getItem('study_streak_freezes') || '0', 10);
          if (currentFreezes > 0) {
            localStorage.setItem('study_streak_freezes', String(currentFreezes - 1));
            setStreakFreezes(currentFreezes - 1);
            streak += 1; // streak protected by freeze token!
          } else {
            streak = 1; // reset streak
          }
        }
      }

      localStorage.setItem('study_punches', String(streak));
      localStorage.setItem('study_streak_days', String(streak));
      localStorage.setItem('study_booster_last_completed_date', today);
      setCurrentStreak(streak);

      // Reward 1 Streak Freeze token every 7 consecutive days
      if (streak > 0 && streak % 7 === 0) {
        const updatedFreezes = parseInt(localStorage.getItem('study_streak_freezes') || '0', 10) + 1;
        localStorage.setItem('study_streak_freezes', String(updatedFreezes));
        setStreakFreezes(updatedFreezes);
        setAwardedNewFreeze(true);
        freezeMilestone = true;
      }
    }

    // Save completed booster to localStorage for today
    if (!isBonusSession && booster) {
      const completedCacheKey = `daily_booster_completed_${todayKey}_${gradeLevel}_${academicStream}`;
      localStorage.setItem(completedCacheKey, JSON.stringify({
        booster,
        responses,
        streak,
        completedAt: new Date().toISOString()
      }));
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

        {/* State 1: Offline View */}
        {isOffline ? (
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-8 shadow-xs flex flex-col items-center justify-center text-center my-auto">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 text-2xl">
              🔌
            </div>
            <h2 className="text-base font-black text-zinc-900">You Are Offline</h2>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-xs">
              Daily Trivia Booster generates high-yield exam traps dynamically. Please check your internet connection to continue.
            </p>
            <button
              onClick={() => loadDailyBooster(false)}
              className="mt-6 px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-all"
            >
              Retry Connection
            </button>
          </div>
        ) : triviaError ? (
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
            <h3 className="text-sm font-black text-zinc-900 text-center">Calibrating Daily Exam Traps...</h3>
            <p className="text-xs text-zinc-400 text-center mt-1.5 px-4 font-medium leading-relaxed">
              Curating 3 rapid negative-marking traps tailored for {gradeLevel} {academicStream}.
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
                  <p className="text-xl font-black text-emerald-400 mt-0.5">{masteredCount}/3</p>
                  <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                    {masteredCount === 3 ? "Flawless Defense! 🌟" : masteredCount === 2 ? "Strong Accuracy! 💪" : "Good Practice! 🛡️"}
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
                Today's 3-Trap Review
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
                              {q.examTrapWarning}
                            </div>

                            {q.latexEquation && (
                              <div className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-2.5 text-center text-xs font-semibold text-zinc-800 overflow-x-auto">
                                <GlobalMarkdown className="text-xs font-mono">{`$$${q.latexEquation}$$`}</GlobalMarkdown>
                              </div>
                            )}

                            <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                              <strong className="text-zinc-900">Key Takeaway:</strong> {q.shortExplanation}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Mistake Vault notice */}
              {masteredCount < 3 && (
                <div className="mt-4 bg-purple-50/80 border border-purple-200/70 rounded-2xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <p className="text-xs font-bold text-purple-900">
                      {3 - masteredCount} trap{3 - masteredCount > 1 ? 's' : ''} auto-saved to your Mistake Vault.
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
                onClick={() => loadDailyBooster(true)}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Practice Bonus Booster (Unlimited)
              </button>

              <button
                onClick={onBack}
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
                    <Zap className="w-3.5 h-3.5" /> Rapid-Fire 90s
                  </span>
                </div>

                {/* Segmented Stepper */}
                <div className="grid grid-cols-3 gap-1.5">
                  {booster.questions.map((_, i) => {
                    const isDone = i < currentIndex;
                    const isCurrent = i === currentIndex;
                    return (
                      <div
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
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
                        <p className="leading-relaxed">{currentQ.examTrapWarning}</p>
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
                        <p>{currentQ.shortExplanation}</p>
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
    </div>
  );
}
