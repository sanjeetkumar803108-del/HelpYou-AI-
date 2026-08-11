import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, 
  Calendar, 
  Trophy, 
  Lock, 
  Check, 
  Target, 
  ArrowLeft, 
  Sparkles, 
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import confetti from 'canvas-confetti';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { getCoins, addCoins, isProUser } from '../utils/coins';

interface StreakDetailsPageProps {
  onBack: () => void;
}

export default function StreakDetailsPage({ onBack }: StreakDetailsPageProps) {
  const isPro = isProUser();
  // Fetch streak state from storage
  const [studyStreak, setStudyStreak] = useState<number>(() => {
    return Number(safeGetItem('study_punches') || '0');
  });

  const [claimedMilestones, setClaimedMilestones] = useState<{ [key: number]: boolean }>(() => {
    return {
      3: safeGetItem('study_claimed_milestone_3') === 'true',
      7: safeGetItem('study_claimed_milestone_7') === 'true',
      15: safeGetItem('study_claimed_milestone_15') === 'true',
      30: safeGetItem('study_claimed_milestone_30') === 'true',
    };
  });

  const [toast, setToast] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  // Automatically check & reset streak if missed
  useEffect(() => {
    try {
      const today = new Date().toDateString();
      const lastPunchDate = safeGetItem('study_last_punch_date');
      if (!lastPunchDate) {
        safeSetItem('study_punches', '0');
        setStudyStreak(0);
      } else {
        const lastDate = new Date(lastPunchDate);
        const currentDate = new Date(today);
        lastDate.setHours(0, 0, 0, 0);
        currentDate.setHours(0, 0, 0, 0);
        
        const diffTime = currentDate.getTime() - lastDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 1) {
          safeSetItem('study_punches', '0');
          setStudyStreak(0);
        }
      }
    } catch (error) {
      console.error("Error updating streak:", error);
    }
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleClaimMilestone = (days: number, reward: number) => {
    triggerVibration(15);
    safeSetItem(`study_claimed_milestone_${days}`, 'true');
    setClaimedMilestones(prev => ({ ...prev, [days]: true }));
    if (!isPro) {
      addCoins(reward, `${days}-Day Streak Achievement! 🏆`);
    }
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    if (isPro) {
      showToast(`🎉 Awesome! You have claimed this milestone achievement! 🚀`);
    } else {
      showToast(`🎉 Awesome! You have successfully claimed +${reward} Study Coins! 🚀`);
    }
  };

  const generateStreakCalendar = () => {
    const days = [];
    const today = new Date();
    const lastPunchDate = safeGetItem('study_last_punch_date');
    const todayString = today.toDateString();

    for (let i = 27; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dateString = date.toDateString();
      
      let isActive = false;
      if (lastPunchDate) {
        const lastDateObj = new Date(lastPunchDate);
        lastDateObj.setHours(0, 0, 0, 0);
        
        const currentCheckDateObj = new Date(dateString);
        currentCheckDateObj.setHours(0, 0, 0, 0);

        const diffTime = lastDateObj.getTime() - currentCheckDateObj.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0 && diffDays < studyStreak) {
          isActive = true;
        }
      }

      days.push({
        dateLabel: date.getDate(),
        monthLabel: date.toLocaleString('default', { month: 'short' }),
        dayName: date.toLocaleString('default', { weekday: 'narrow' }),
        isToday: dateString === todayString,
        isActive,
        dateString,
      });
    }
    return days;
  };

  const handleDailyPunch = () => {
    triggerVibration(20);
    const today = new Date().toDateString();
    const lastPunchDate = safeGetItem('study_last_punch_date');
    
    if (lastPunchDate === today) {
      showToast("✨ Today's attendance already punched!");
      return;
    }

    let newStreak = 1;
    if (lastPunchDate) {
      const lastDate = new Date(lastPunchDate);
      const currentDate = new Date(today);
      lastDate.setHours(0, 0, 0, 0);
      currentDate.setHours(0, 0, 0, 0);
      
      const diffTime = currentDate.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        newStreak = studyStreak + 1;
      }
    }

    safeSetItem('study_punches', String(newStreak));
    safeSetItem('study_last_punch_date', today);
    setStudyStreak(newStreak);

    if (!isPro) {
      addCoins(2, "Daily Streak Punch-In 🎯");
    }

    confetti({
      particleCount: 125,
      spread: 85,
      origin: { y: 0.6 }
    });

    if (isPro) {
      showToast(`🔥 Shandaar! Today's attendance marked! Streak is now ${newStreak} days! 🚀`);
    } else {
      showToast(`🔥 Shandaar! Today's attendance marked! Streak is now ${newStreak} days! +2 Coins Added! 🚀`);
    }
  };

  const today = new Date().toDateString();
  const lastPunchDate = safeGetItem('study_last_punch_date');
  const hasPunchedToday = lastPunchDate === today;

  return (
    <div className="w-full h-full min-h-screen bg-[#FAF9F6] text-zinc-900 font-sans flex flex-col relative pb-12">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-[90%] max-w-sm">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="bg-zinc-900/95 backdrop-blur-md text-white text-xs font-bold px-4 py-3.5 rounded-2xl shadow-xl border border-zinc-800 flex items-center gap-2.5"
            >
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="flex-1 text-left leading-relaxed">{toast}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sticky Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-200/60 px-4 py-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              triggerVibration(10);
              onBack();
            }}
            className="w-10 h-10 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-600 hover:text-zinc-900 active:scale-95 transition-all"
            aria-label="Back to profile"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-black text-zinc-850 tracking-tight flex items-center gap-1.5">
              <span>🔥</span> Study Streak Days
            </h1>
            <p className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest">
              Your Dedication Tracker
            </p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-md w-full mx-auto px-4 py-6 space-y-6">

        {/* Hero Streak Flame Box */}
        <div className="bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-500 rounded-[2.25rem] p-8 text-white text-center shadow-lg border border-orange-400 relative overflow-hidden">
          <div className="absolute inset-0 bg-white/5 pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center">
            <motion.div
              animate={{ scale: [1, 1.15, 1], y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-white text-4xl mb-4 shadow-inner"
            >
              🔥
            </motion.div>
            
            <p className="text-5xl font-black tracking-tight leading-none">
              {studyStreak} Days
            </p>
            <span className="text-[10px] uppercase font-black tracking-widest text-white/90 bg-white/20 px-3 py-1.5 rounded-full mt-3.5 inline-block">
              {studyStreak > 0 ? "Daily Habit Active 🚀" : "Start your Streak today! 🌱"}
            </span>
            
            <p className="text-xs font-bold text-white/95 mt-5 leading-relaxed max-w-xs">
              Fantastic Performance! You are working hard every day! Punch in your daily attendance to stay ahead of the rest! 🎯
            </p>
          </div>
        </div>

        {/* Daily attendance punch-in card */}
        <div className="bg-white rounded-[2rem] p-6 border border-zinc-200/80 shadow-sm flex flex-col items-center text-center space-y-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${hasPunchedToday ? 'bg-green-50 text-green-500 border border-green-100' : 'bg-orange-50 text-orange-500 border border-orange-100'}`}>
              {hasPunchedToday ? <Check className="w-4 h-4" /> : <Target className="w-4 h-4" />}
            </div>
            <h4 className="text-xs font-black text-zinc-800 uppercase tracking-wider">
              Daily Attendance Check-In
            </h4>
          </div>

          <p className="text-[11px] font-bold text-zinc-500 max-w-xs leading-relaxed">
            {hasPunchedToday 
              ? "Your attendance for today is successfully registered! Come back tomorrow to continue your daily study streak! ✨"
              : isPro
                ? "Your attendance hasn't been punched today! Start studying and mark your attendance now! 🔥"
                : "Your attendance hasn't been punched today! Start studying and earn +2 Study Coins now! 🪙"
            }
          </p>

          <button
            onClick={handleDailyPunch}
            disabled={hasPunchedToday}
            className={`w-full py-4 rounded-2xl font-black text-xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
              hasPunchedToday 
                ? 'bg-zinc-100 text-zinc-400 border border-zinc-200/50 cursor-default pointer-events-none' 
                : 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-md border-none'
            }`}
          >
            {hasPunchedToday ? (
              <>
                <Check className="w-4 h-4" />
                Attendance Verified!
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
                {isPro ? "Punch Attendance" : "Punch Attendance (+2 Coins)"}
              </>
            )}
          </button>
        </div>

        {/* Attendance Calendar Grid */}
        <div className="bg-white rounded-[2rem] p-6 border border-zinc-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> Last 28 Days Check-In
            </h4>
            <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
              {generateStreakCalendar().filter(d => d.isActive).length} Completed
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {/* Weekday Labels */}
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, idx) => (
              <div key={`label-${idx}`} className="text-center text-[9px] font-black text-zinc-400 uppercase tracking-widest py-1">
                {label}
              </div>
            ))}

            {/* Date Boxes */}
            {generateStreakCalendar().map((day, idx) => (
              <div 
                key={`day-box-${idx}`}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center border transition-all ${
                  day.isActive 
                    ? 'bg-orange-50/70 border-orange-200 text-orange-600 font-extrabold shadow-sm' 
                    : day.isToday 
                      ? 'bg-zinc-50 border-zinc-400 text-zinc-800 font-black ring-1 ring-zinc-400/50' 
                      : 'bg-[#FAF9F6] border-zinc-200/60 text-zinc-400 font-bold'
                }`}
                title={`${day.monthLabel} ${day.dateLabel} - ${day.isActive ? 'Study Day' : 'Rest Day'}`}
              >
                <span className="text-[10px]">{day.dateLabel}</span>
                {day.isActive && (
                  <span className="text-[8px] mt-0.5 animate-pulse">🔥</span>
                )}
                {day.isToday && !day.isActive && (
                  <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-zinc-400" />
                )}
              </div>
            ))}
          </div>

          <p className="text-[9px] text-zinc-400 font-bold text-center italic leading-relaxed pt-1">
            Continuous check-ins make your streak flame brighter! Keep up the discipline! 🎯
          </p>
        </div>

        {/* Milestone Targets (Unlockable Rewards) */}
        <div className="bg-white rounded-[2rem] p-6 border border-zinc-200/80 shadow-sm space-y-4">
          <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Streak Milestones
          </h4>

          <div className="space-y-3.5">
            {[
              { days: 3, reward: 5, badge: "Novice Scholar 🎓", desc: isPro ? "Unlock 3 Days streak to claim achievement!" : "Unlock 3 Days streak to claim +5 Study Coins!" },
              { days: 7, reward: 15, badge: "Study Monk 🧘", desc: isPro ? "Unlock 7 Days streak to claim achievement!" : "Unlock 7 Days streak to claim +15 Study Coins!" },
              { days: 15, reward: 30, badge: "Exam Destroyer ⚡", desc: isPro ? "Unlock 15 Days streak to claim achievement!" : "Unlock 15 Days streak to claim +30 Study Coins!" },
              { days: 30, reward: 50, badge: "AI Mastermind 🌟", desc: isPro ? "Unlock 30 Days streak to claim achievement!" : "Unlock 30 Days streak to claim +50 Study Coins!" }
            ].map((milestone) => {
              const isUnlocked = studyStreak >= milestone.days;
              const isClaimed = claimedMilestones[milestone.days];

              return (
                <div 
                  key={`milestone-${milestone.days}`}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isClaimed 
                      ? 'bg-zinc-50 border-zinc-200/60 opacity-70' 
                      : isUnlocked 
                        ? 'bg-amber-50/50 border-amber-200 shadow-sm' 
                        : 'bg-zinc-50/30 border-zinc-200/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-extrabold ${isClaimed ? 'text-zinc-500 line-through' : isUnlocked ? 'text-amber-600' : 'text-zinc-600'}`}>
                        {milestone.badge}
                      </span>
                      {!isClaimed && isUnlocked && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                          Unlocked
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 font-semibold leading-relaxed">
                      {milestone.desc}
                    </p>
                  </div>

                  <div>
                    {isClaimed ? (
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-zinc-400" /> Claimed
                      </span>
                    ) : isUnlocked ? (
                      <button
                        onClick={() => handleClaimMilestone(milestone.days, milestone.reward)}
                        className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer border-none"
                      >
                        {isPro ? "Claim Achievement" : `Claim +${milestone.reward}`}
                      </button>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-zinc-400 shrink-0">
                        <Lock className="w-4 h-4" />
                        <span className="text-[9px] font-bold mt-0.5">{studyStreak}/{milestone.days}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
