import React, { useState, useEffect, useRef } from 'react';
import { 
  UserCircle, Settings, LogOut, X, Crown, Lock, Mail, Shield, 
  HelpCircle, Star, Bug, FileText, Trash2, ChevronRight, ChevronDown,
  Check, MessageSquare, AlertTriangle, Eye, EyeOff, Sparkles, Send, Moon,
  GraduationCap, Calendar, Trophy, Edit3, Save, Flame, User, Info, Target, Zap,
  Loader2, Download, CreditCard, Bell, Share2, Play, Pause, Square
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import html2canvas from 'html2canvas';
import { App as CapApp } from '@capacitor/app';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, deleteDoc, doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { 
  signOut, 
  User as FirebaseUser, 
  updatePassword, 
  updateEmail, 
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import confetti from 'canvas-confetti';
import { safeGetItem, safeSetItem, safeClearAll } from '../utils/storage';
import { getCoins, addCoins } from '../utils/coins';
import { useSettings } from '../hooks/useSettings';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { billingService } from '../services/BillingService';
import { REGIONAL_TRACKS } from './AcademicSetup';
import { 
  getStudyXP, 
  getStudyLevel, 
  getWeeklyQuests, 
  claimQuestReward, 
  getBadgesStatus,
  getDailyXPStatus, 
  Quest, 
  AchievementBadge 
} from '../utils/gamification';
import LevelReactorRing from './LevelReactorRing';
import { runFullAppOptimization, restartAppCleanly, OptimizationResult } from '../utils/optimizer';
import { showToast } from '../utils/toast';

interface ProfileProps {
  user: FirebaseUser | null;
  isVip: boolean;
  setIsVip: (vip: boolean) => void;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isTabMode?: boolean;
  onOpenLogin?: () => void;
  onNavigateToCoinPage?: () => void;
  onNavigateToStreakPage?: () => void;
  onOpenPdfHistory?: () => void;
}

interface PassiveUsageItem {
  day: string;
  focusTime: number; // minutes spent
  dateString: string;
}

const ActivityIndicator = ({ color }: { color?: string }) => {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke={color || "currentColor"} strokeWidth="4"></circle>
      <path className="opacity-75" fill={color || "currentColor"} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
};

const Linking = {
  openURL: (url: string) => {
    window.open(url, '_blank');
  }
};

const Alert = {
  alert: (title: string, message: string, buttons?: { text: string; style?: string; onPress?: () => void }[]) => {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed && buttons) {
      const okButton = buttons.find(b => b.style === 'destructive' || b.text === 'Yes, Delete' || b.text === 'OK' || b.text === 'Delete');
      if (okButton && okButton.onPress) {
        okButton.onPress();
      }
    }
  }
};

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLast7Dates = () => {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayLabel = daysOfWeek[d.getDay()];
    
    dates.push({ dateString, dayLabel });
  }
  return dates;
};

const cleanAndGetUsageData = (): Record<string, number> => {
  const raw = safeGetItem('study_passive_usage_data');
  let data: Record<string, number> = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (e) {
      data = {};
    }
  }
  
  // Calculate allowed dates (last 7 days)
  const last7 = getLast7Dates();
  const allowedDates = new Set(last7.map(item => item.dateString));
  
  // Keep only allowed dates (clean up older ones)
  const cleaned: Record<string, number> = {};
  let changed = false;
  for (const key in data) {
    if (allowedDates.has(key)) {
      cleaned[key] = data[key];
    } else {
      changed = true;
    }
  }
  
  if (changed || !raw) {
    safeSetItem('study_passive_usage_data', JSON.stringify(cleaned));
  }
  return cleaned;
};

const generateChartData = (storedData: Record<string, number>): PassiveUsageItem[] => {
  const last7 = getLast7Dates();
  return last7.map(item => {
    const rawTime = storedData[item.dateString] || 0;
    // Round to 1 decimal place
    const focusTime = Math.round(rawTime * 10) / 10;
    return {
      day: item.dayLabel,
      focusTime,
      dateString: item.dateString
    };
  });
};

export default function Profile({ 
  user, 
  isVip, 
  setIsVip, 
  onClose, 
  isDarkMode, 
  onToggleDarkMode,
  isTabMode = false,
  onOpenLogin,
  onNavigateToCoinPage,
  onNavigateToStreakPage,
  onOpenPdfHistory
}: ProfileProps) {
  // App Settings Toggles
  const [saveHistory] = useState<boolean>(true);
  const [dailyReminders, setDailyReminders] = useState<boolean>(() => {
    return safeGetItem('pref_daily_reminders') !== 'false';
  });
  const [streakAlerts, setStreakAlerts] = useState<boolean>(() => {
    return safeGetItem('pref_streak_alerts') !== 'false';
  });
  const [specialOffers, setSpecialOffers] = useState<boolean>(() => {
    return safeGetItem('pref_special_offers') !== 'false';
  });
  // Haptic Vibration Toggle — persisted preference
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => {
    return safeGetItem('pref_haptic_enabled') !== 'false';
  });


  // Settings Slideover Panel
  const [showSettings, setShowSettings] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showStreakDetails, setShowStreakDetails] = useState(false);

  const [claimedMilestones, setClaimedMilestones] = useState<{ [key: number]: boolean }>(() => {
    return {
      3: safeGetItem('study_claimed_milestone_3') === 'true',
      7: safeGetItem('study_claimed_milestone_7') === 'true',
      15: safeGetItem('study_claimed_milestone_15') === 'true',
      30: safeGetItem('study_claimed_milestone_30') === 'true',
    };
  });

  const handleClaimMilestone = (days: number) => {
    triggerVibration(15);
    safeSetItem(`study_claimed_milestone_${days}`, 'true');
    setClaimedMilestones(prev => ({ ...prev, [days]: true }));
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 }
    });
    showToast(`🎉 Shandaar! You have successfully unlocked the ${days}-Day Study Milestone Badge! 🏆`);
  };

  // Full App Performance Optimization States
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [optimizationStepText, setOptimizationStepText] = useState('');
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);

  const handleFullAppOptimization = async () => {
    triggerVibration(hapticEnabled ? 20 : 0);
    setShowOptimizationModal(true);
    setIsOptimizing(true);
    setRestartCountdown(null);
    setOptimizationProgress(15);
    setOptimizationStepText("Analyzing system RAM & temporary cache footprint...");
    setOptimizationResult(null);

    await new Promise(r => setTimeout(r, 400));
    setOptimizationProgress(40);
    setOptimizationStepText("Purging dead canvas buffers, stale blob URLs & temp drafts...");

    await new Promise(r => setTimeout(r, 450));
    setOptimizationProgress(70);
    setOptimizationStepText("Compacting AI render pipelines & re-indexing memory cache...");

    await new Promise(r => setTimeout(r, 450));
    setOptimizationProgress(90);
    setOptimizationStepText("Restoring ultra-fast 60fps responsiveness & latency boost...");

    try {
      const res = await runFullAppOptimization();
      setOptimizationProgress(100);
      setOptimizationResult(res);
      setIsOptimizing(false);

      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 }
      });
      showToast("🚀 App fully optimized! Restarting in 2s...");

      // Start auto-restart countdown
      setRestartCountdown(2);
      setOptimizationStepText("✅ App 100% Fully Optimized! Restarting cleanly in 2s...");
      await new Promise(r => setTimeout(r, 1000));
      
      setRestartCountdown(1);
      setOptimizationStepText("✅ App 100% Fully Optimized! Restarting cleanly in 1s...");
      await new Promise(r => setTimeout(r, 1000));

      setOptimizationStepText("⚡ Restarting App with Fresh Clean Memory...");
      restartAppCleanly();
    } catch (e) {
      console.error("Optimization failed:", e);
      setIsOptimizing(false);
      setShowOptimizationModal(false);
      showToast("App optimization completed.");
    }
  };

  // Profile Edit State
  const [isEditingName, setIsEditingName] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [studentName, setStudentName] = useState(() => {
    return user?.displayName || safeGetItem('student_name') || 'Guest Student';
  });

  // Study Level Segment Selector
  const [studyLevel, setStudyLevel] = useState(() => {
    return safeGetItem('onboarding_grade') || 'High School';
  });

  // Granular Academic Track
  const [gradeLevel, setGradeLevel] = useState(() => {
    return safeGetItem('academic_grade') || '11th Grade (Junior)';
  });
  const [streamMajor, setStreamMajor] = useState(() => {
    const savedGrade = safeGetItem('academic_grade') || '11th Grade (Junior)';
    const isFoundational = savedGrade.includes('9th Grade') || savedGrade.includes('10th Grade');
    if (isFoundational) return 'Core / Foundation';
    return safeGetItem('academic_stream') || 'STEM / Engineering';
  });
  const [selectedCountryName, setSelectedCountryName] = useState(() => {
    return safeGetItem('academic_country') || 'United States';
  });
  const [isGradeDropdownOpen, setIsGradeDropdownOpen] = useState(false);
  const [isTrackDropdownOpen, setIsTrackDropdownOpen] = useState(false);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  const { visualLearner, setVisualLearner, deepFocus, setDeepFocus } = useSettings();

  // Modal & Popup State in Settings
  const [activeModal, setActiveModal] = useState<
    'password' | 'email' | 'support' | 'rate' | 'bug' | 'privacy' | 'terms' | 'delete_account' | 'manage_sub' | null
  >(null);

  // Form Inputs
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  const [supportCategory, setSupportCategory] = useState('General Inquiry');
  const [isSupportDropdownOpen, setIsSupportDropdownOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');

  const [userRating, setUserRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [ratingReview, setRatingReview] = useState('');

  const [bugTitle, setBugTitle] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugSeverity, setBugSeverity] = useState('Medium');

  // Interactive Toast
  const [toast, setToast] = useState<string | null>(null);

  // Gamification: XP, Levels, Quests and Badges
  const [studyXP, setStudyXP] = useState<number>(getStudyXP);
  const [weeklyQuests, setWeeklyQuests] = useState<Quest[]>(getWeeklyQuests);
  const [achievementBadges, setAchievementBadges] = useState<AchievementBadge[]>(getBadgesStatus);
  const [dailyXP, setDailyXP] = useState(getDailyXPStatus);

  useEffect(() => {
    const handleXpUpdate = () => {
      setStudyXP(getStudyXP());
      setWeeklyQuests(getWeeklyQuests());
      setAchievementBadges(getBadgesStatus());
      setDailyXP(getDailyXPStatus());
    };
    window.addEventListener('study-xp-updated', handleXpUpdate);
    window.addEventListener('study-daily-xp-updated', handleXpUpdate);
    window.addEventListener('study-quests-updated', handleXpUpdate);
    return () => {
      window.removeEventListener('study-xp-updated', handleXpUpdate);
      window.removeEventListener('study-daily-xp-updated', handleXpUpdate);
      window.removeEventListener('study-quests-updated', handleXpUpdate);
    };
  }, []);

  // 7-Day Passive App Usage Tracker State
  const [chartData, setChartData] = useState<PassiveUsageItem[]>(() => {
    const stored = cleanAndGetUsageData();
    return generateChartData(stored);
  });

  const lastActiveTimeRef = useRef<number>(Date.now());
  const pendingSyncRef = useRef<number>(0);

  // Sync remaining accumulated focus time to Firestore
  const syncUsageToFirestore = async (force = false) => {
    const unsynced = pendingSyncRef.current;
    if (unsynced <= 0 && !force) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      const todayStr = getTodayDateString();
      const userRef = doc(db, 'users', currentUser.uid);

      await setDoc(userRef, {
        usageStats: {
          [todayStr]: increment(unsynced)
        }
      }, { merge: true });

      pendingSyncRef.current = 0;
      console.log(`[UsageTracker] Synced ${unsynced.toFixed(2)} mins to Firestore.`);
    } catch (err) {
      console.error("[UsageTracker] Error syncing usage to Firestore:", err);
    }
  };

  const accumulateTime = (mins: number) => {
    if (mins <= 0) return;
    const todayStr = getTodayDateString();
    
    const currentData = cleanAndGetUsageData();
    currentData[todayStr] = (currentData[todayStr] || 0) + mins;
    
    safeSetItem('study_passive_usage_data', JSON.stringify(currentData));
    setChartData(generateChartData(currentData));

    pendingSyncRef.current += mins;
  };

  // Fetch usageStats from Firestore on login or app open
  useEffect(() => {
    if (!user) {
      const stored = cleanAndGetUsageData();
      setChartData(generateChartData(stored));
      return;
    }

    let active = true;

    const fetchFirestoreUsage = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && active) {
          const userData = userSnap.data();
          const firestoreUsage: Record<string, number> = userData.usageStats || {};
          
          // Overwrite local storage and update state
          safeSetItem('study_passive_usage_data', JSON.stringify(firestoreUsage));
          setChartData(generateChartData(firestoreUsage));
        }
      } catch (err) {
        console.error("[UsageTracker] Error loading Firestore usage stats:", err);
      }
    };

    fetchFirestoreUsage();

    return () => {
      active = false;
    };
  }, [user]);

  // 1. Periodic Flush Interval (every 5 seconds for local, every 5 minutes for Firestore sync)
  useEffect(() => {
    let tickCount = 0;
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastActiveTimeRef.current;
      lastActiveTimeRef.current = now;
      
      if (elapsedMs > 0) {
        const elapsedMins = elapsedMs / 60000;
        accumulateTime(elapsedMins);
      }

      // 5 minutes is 60 ticks of 5 seconds
      tickCount++;
      if (tickCount >= 60) {
        tickCount = 0;
        syncUsageToFirestore();
      }
    }, 5000);
    
    return () => {
      clearInterval(interval);
      syncUsageToFirestore();
    };
  }, [user]);

  // 2. AppState / Visibility Change Event Listeners to flush on pause/background
  useEffect(() => {
    const handleAppStateChange = async (isActive: boolean) => {
      const now = Date.now();
      if (isActive) {
        lastActiveTimeRef.current = now;
      } else {
        const elapsedMs = now - lastActiveTimeRef.current;
        if (elapsedMs > 0) {
          const elapsedMins = elapsedMs / 60000;
          accumulateTime(elapsedMins);
        }
        lastActiveTimeRef.current = now;

        // Instantly sync the remaining accumulated time to Firestore
        await syncUsageToFirestore();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleAppStateChange(true);
      } else {
        handleAppStateChange(false);
      }
    };

    let appStateListener: any = null;
    if (Capacitor.isNativePlatform()) {
      try {
        appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
          handleAppStateChange(isActive);
        });
      } catch (err) {
        console.warn("Failed to attach CapApp listener:", err);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, []);

  // Fetch coins & streak
  const streakCardRef = useRef<HTMLDivElement>(null);
  const coinsBalance = getCoins();
  const [studyStreak, setStudyStreak] = useState<number>(() => {
    return Number(safeGetItem('study_punches') || '0');
  });

  useEffect(() => {
    const handleStreakUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail !== undefined) {
        setStudyStreak(Number(customEvent.detail || 0));
      }
    };
    window.addEventListener('study-streak-updated', handleStreakUpdate);
    return () => {
      window.removeEventListener('study-streak-updated', handleStreakUpdate);
    };
  }, []);

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
        const parts = lastPunchDate.split('-');
        const lastDateObj = parts.length === 3 
          ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
          : new Date(lastPunchDate);
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

  // Sync state to local storage
  useEffect(() => {
    safeSetItem('study_save_history', 'true');
  }, []);

  useEffect(() => {
    safeSetItem('pref_daily_reminders', String(dailyReminders));
  }, [dailyReminders]);

  useEffect(() => {
    safeSetItem('pref_streak_alerts', String(streakAlerts));
  }, [streakAlerts]);

  useEffect(() => {
    safeSetItem('pref_special_offers', String(specialOffers));
  }, [specialOffers]);

  // Keep student name in sync if user changes
  useEffect(() => {
    if (user?.displayName) {
      setStudentName(user.displayName);
    }
  }, [user]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRestorePurchases = async () => {
    triggerVibration(10);
    setIsRestoring(true);
    try {
      const restored = await billingService.restorePurchases();
      if (restored) {
        setIsVip(true);
        showToast("✨ Pro status restored successfully!");
      } else {
        showToast("❌ No active Pro subscription found.");
      }
    } catch (err) {
      console.error(err);
      showToast("❌ Failed to restore purchases.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleShare = async (title: string, text: string, url: string, toastSuccessMsg: string) => {
    triggerVibration(15);
    
    // 1. Native Capacitor Share (Mobile App)
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title,
          text,
          url,
          dialogTitle: 'Share your progress'
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error("Failed to share via Capacitor:", err);
      }
    }

    // 2. Web Share API (Mobile & Desktop Web Browsers)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error("Failed to share via navigator.share:", err);
      }
    }

    // 3. Fallback to Clipboard Copy (if Web Share API is not supported)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        showToast(toastSuccessMsg);
      } catch (err) {
        showToast("Could not copy stats.");
      }
    } else {
      showToast("Sharing is not supported on this browser.");
    }
  };

  const handleShareStreak = async () => {
    if (!streakCardRef.current) {
      showToast("Could not locate streak element.");
      return;
    }

    triggerVibration(15);
    const originalText = `🔥 I have kept my daily study streak alive for ${studyStreak} days in HelpYou AI! Keep up the grind! 🎓🎯`;

    try {
      showToast("📸 Capturing streak card...");

      // Temporarily hide the share button inside the streak card if needed or render beautifully
      const canvas = await html2canvas(streakCardRef.current, {
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      });

      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      // 1. Native Capacitor Share (Mobile App)
      if (Capacitor.isNativePlatform()) {
        const rawBase64 = imgDataUrl.split(',')[1];
        const fileName = `study_streak_${studyStreak}.jpg`;

        // Write image file to Native Cache folder
        const tempFile = await Filesystem.writeFile({
          path: fileName,
          data: rawBase64,
          directory: Directory.Cache
        });

        await Share.share({
          title: 'My Study Streak',
          text: originalText,
          url: tempFile.uri,
          dialogTitle: 'Share your Study Streak'
        });
        return;
      }

      // 2. Web Share API with File payload (Mobile & Modern Web Browsers)
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
        const responseBlob = await fetch(imgDataUrl);
        const blob = await responseBlob.blob();
        const file = new File([blob], 'study-streak.jpg', { type: 'image/jpeg' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Study Streak',
            text: originalText
          });
          return;
        }
      }

      // 3. Fallback: Copy message to clipboard and download card image
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(originalText);
        const link = document.createElement('a');
        link.download = 'study-streak.jpg';
        link.href = imgDataUrl;
        link.click();
        showToast("🔥 Streak message copied! Card image downloaded! Paste to share! 🚀");
      } else {
        showToast("Sharing is not supported on this browser.");
      }
    } catch (err) {
      console.error("Failed to generate and share streak card:", err);
      showToast("❌ Failed to share streak card.");
    }
  };

  const handleShareMastery = async () => {
    const shareText = `📊 Check out my Skill Mastery progress in HelpYou AI: Math (85%), Chemistry (90%), Physics (70%)! Personalized AI tutoring really works! 🧠🚀`;
    await handleShare(
      'My Skill Mastery',
      shareText,
      window.location.origin,
      "📊 Mastery stats copied to clipboard! Share it anywhere! 🚀"
    );
  };

  const handleExportData = () => {
    triggerVibration(15);
    try {
      const userIdentifier = user ? (user.email || user.uid) : "Anonymous Guest";
      const subject = encodeURIComponent(`Data Export Request - ${userIdentifier}`);
      const body = encodeURIComponent("Hello HelpYou AI Support, I would like to exercise my right to data portability. Please provide a complete export of my account data, including my profile, study notes, and history. Thank you.");
      window.location.href = `mailto:helpyou.ai.support@gmail.com?subject=${subject}&body=${body}`;
      showToast("✉️ Drafted data export email support request!");
    } catch (err) {
      console.error(err);
      showToast("❌ Failed to initiate data export request.");
    }
  };

  const handleSaveName = () => {
    triggerVibration(15);
    if (!studentName.trim()) {
      showToast("❌ Name cannot be empty");
      return;
    }
    safeSetItem('student_name', studentName.trim());
    setIsEditingName(false);
    showToast("💾 Profile name saved successfully!");
  };

  const handleStudyLevelChange = (level: string) => {
    triggerVibration(15);
    setStudyLevel(level);
    safeSetItem('onboarding_grade', level);
    showToast(`🎓 Study level set to ${level}!`);
  };

  const handleLogout = async () => {
    triggerVibration(15);
    // Sync any unsynced focus time to Firestore before logging out
    await syncUsageToFirestore();
    setIsVip(false);
    safeClearAll();
    
    // Clear Native Capacitor Google Auth session so that Account Chooser is shown on next login
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch (nativeSignOutErr) {
        console.warn('[Logout] Native FirebaseAuthentication.signOut notice:', nativeSignOutErr);
      }
    }
    
    await signOut(auth);
    setShowSettings(false);
    showToast("👋 Logged out successfully");
  };

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Password & Email Handlers
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerVibration(20);
    const user = auth.currentUser;
    
    if (!user || !user.email) {
      showToast("❌ User session not found");
      return;
    }

    if (!currentPassword || !newPassword) {
      showToast("❌ Please fill in all fields");
      return;
    }
    if (newPassword.length < 6) {
      showToast("❌ Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      // Re-authenticate first (required for password changes)
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, newPassword);
      
      showToast("🔒 Password updated successfully!");
      setActiveModal(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-credential-password') {
        showToast("❌ Incorrect current password");
      } else if (error.code === 'auth/too-many-requests') {
        showToast("❌ Too many attempts. Try later.");
      } else {
        showToast("❌ Failed to update password");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerVibration(20);
    const user = auth.currentUser;

    if (!user || !user.email) {
      showToast("❌ User session not found");
      return;
    }

    if (!newEmail || !currentPassword) {
      showToast("❌ Please fill in both fields");
      return;
    }

    setLoading(true);
    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // updateEmail is preferred
      await updateEmail(user, newEmail);
      showToast("📧 Verification link sent to new email!");
      setActiveModal(null);
      setNewEmail('');
      setCurrentPassword('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-credential-password') {
        showToast("❌ Incorrect current password");
      } else if (error.code === 'auth/too-many-requests') {
        showToast("❌ Too many attempts. Try later.");
      } else {
        showToast("❌ Failed to update email");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) {
      showToast("❌ No user signed in");
      return;
    }
    
    const proceedWithDeletion = async () => {
      setLoading(true);
      setIsDeleting(true);
      triggerVibration([30, 50, 30]);
      
      try {
        const uid = user.uid;
        
        // 1. Wipe user document from the primary "users" collection
        try {
          await deleteDoc(doc(db, 'users', uid));
        } catch (err) {
          console.error("Error deleting user doc:", err);
        }
        
        // List of all collections where userId maps to uid
        const collectionsToWipe = [
          'pocket_items',
          'ai_tutor_chats',
          'quiz_results',
          'generated_questions',
          'MistakeVault',
          'pdf_history'
        ];
        
        // 2. Query and delete all user documents across all related collections
        for (const colName of collectionsToWipe) {
          try {
            const q = query(collection(db, colName), where('userId', '==', uid));
            const querySnapshot = await getDocs(q);
            const deletePromises = querySnapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
            await Promise.all(deletePromises);
          } catch (err) {
            console.error(`Error wiping collection ${colName}:`, err);
          }
        }
        
        // 3. Delete the Authentication record permanently
        let authDeleted = false;
        try {
          await user.delete();
          authDeleted = true;
        } catch (authErr: any) {
          console.warn("Auth delete failed (may require recent login):", authErr);
        }
        
        if (authDeleted) {
          showToast("🗑️ Account and data permanently deleted.");
        } else {
          showToast("🧹 Data wiped! Log out and in again to fully delete account login.");
        }
        
        setActiveModal(null);
        setIsVip(false);
        safeClearAll();
        if (Capacitor.isNativePlatform()) {
          try {
            await FirebaseAuthentication.signOut();
          } catch (_) {}
        }
        await signOut(auth);
        setShowSettings(false);
      } catch (error: any) {
        console.error("Error during account deletion:", error);
        showToast("❌ Failed to complete data deletion.");
      } finally {
        setLoading(false);
        setIsDeleting(false);
      }
    };

    Alert.alert(
      "Confirm Deletion",
      "Are you sure? This will permanently wipe your data.\n\n⚠️ WARNING: Deleting your account does NOT cancel your active Pro Subscription. You must manually cancel it in your device's App Store settings to avoid future charges.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: proceedWithDeletion }
      ]
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6] text-zinc-900 overflow-hidden relative">
      {/* Dynamic Action Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[11px] font-black px-4 py-2.5 rounded-full shadow-xl z-50 flex items-center gap-2 border border-zinc-800 whitespace-nowrap"
          >
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Profile Tab Screen */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto pb-24">
        {/* Custom Header Area */}
        <header className="px-6 py-5 bg-white border-b border-zinc-200/60 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-lg font-black tracking-tight text-zinc-850 flex items-center gap-2">
            <span>👤</span> My Profile
          </h1>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                triggerVibration(10);
                setShowSettings(true);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 hover:text-zinc-900 border border-zinc-200 transition-colors shadow-sm"
              title="App Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            {!isTabMode && (
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-500 hover:text-zinc-800 border border-zinc-200 transition-colors shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        <div className="p-6 space-y-6 max-w-md mx-auto w-full">
          {/* Main User Card with Beautiful Design */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm relative overflow-hidden flex flex-col items-center">
            {/* Ambient glows */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />

            {/* Premium VIP Crown Badge */}
            {isVip && (
              <div className="absolute top-4 right-4 bg-gradient-to-r from-yellow-500 to-amber-500 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm border border-yellow-400">
                <Crown className="w-3 h-3 fill-white" /> Pro
              </div>
            )}

            {/* Level Reactor Ring Avatar with Dynamic Level Badge */}
            <div className="relative mb-3 mt-2 flex justify-center">
              <LevelReactorRing levelData={getStudyLevel(studyXP)}>
                <div className="w-full h-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white font-black text-3xl select-none">
                  {studentName ? studentName[0].toUpperCase() : 'S'}
                </div>
              </LevelReactorRing>
            </div>

            {/* Editable Name Segment */}
            {isEditingName ? (
              <div className="flex items-center gap-1.5 w-full max-w-[240px] mb-1">
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="flex-1 bg-zinc-50 border border-purple-300 rounded-xl px-3 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-purple-600"
                  maxLength={25}
                  placeholder="Enter your name"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="p-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 shadow-sm transition-all"
                  title="Save Name"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1 group">
                <h2 className="text-xl font-black tracking-tight text-zinc-850">
                  {studentName}
                </h2>
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setIsEditingName(true);
                  }}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                  title="Edit Name"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Email Address */}
            <p className="text-zinc-400 text-xs font-bold mb-3">
              {user ? user.email : "Guest Account"}
            </p>

            {/* Student Level & XP Progress Card */}
            {(() => {
              const levelData = getStudyLevel(studyXP);
              return (
                <div className="w-full bg-zinc-50 border border-purple-100 rounded-2xl p-3.5 mb-2 mt-1 space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{levelData.currentLevel.badge}</span>
                      <div>
                        <span className="text-[11px] font-black text-zinc-900 leading-tight block">
                          Level {levelData.currentLevel.level}: {levelData.currentLevel.title}
                        </span>
                        <span className="text-[9px] font-bold text-purple-600">
                          {studyXP} Total Study XP
                        </span>
                      </div>
                    </div>
                    {levelData.nextLevel && (
                      <span className="text-[9px] font-bold text-zinc-500 bg-white px-2 py-0.5 rounded-full border border-zinc-200 shadow-xs">
                        Next: {levelData.nextLevel.minXP} XP
                      </span>
                    )}
                  </div>

                  {/* XP Progress Bar */}
                  <div className="w-full bg-zinc-200/80 h-2 rounded-full overflow-hidden relative">
                    <div 
                      className={`h-full bg-gradient-to-r ${levelData.currentLevel.color} transition-all duration-500 rounded-full`}
                      style={{ width: `${levelData.progressPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[8.5px] font-bold text-zinc-400">
                    <span>{levelData.xpInLevel} XP in Level</span>
                    <span>{levelData.xpToNextLevel} XP to Level {(levelData.nextLevel?.level || levelData.currentLevel.level + 1)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Login CTA for Guest Account */}
            {!user && onOpenLogin && (
              <button
                onClick={() => {
                  triggerVibration(15);
                  onOpenLogin();
                }}
                className="mt-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-250/50 px-4 py-2 rounded-full text-xs font-black transition-all shadow-inner active:scale-95"
              >
                🔐 Sign In / Sign Up
              </button>
            )}
          </div>

          {/* Basic Student Details Segment */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm space-y-5">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-zinc-400" /> Basic Details
            </h3>

            {/* Occupation: Strictly Student */}
            <div className="flex items-center justify-between py-3 border-b border-zinc-100 gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100 shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400">Occupation</span>
                  <p className="text-xs font-black text-zinc-800 leading-tight">Student</p>
                </div>
              </div>
              <span className="bg-purple-50 text-purple-700 text-[9px] font-black px-2.5 py-1 rounded-full border border-purple-150 shrink-0 whitespace-nowrap">
                Default Strictly Verified
              </span>
            </div>

            {/* Granular Academic Track */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400 block">Academic Track</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 relative">
                <div className="space-y-1.5 relative">
                  <label className="text-[10px] font-bold text-zinc-500">Grade Level</label>
                  <button 
                    onClick={() => {
                      setIsGradeDropdownOpen(!isGradeDropdownOpen);
                      setIsTrackDropdownOpen(false);
                    }}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 font-sans"
                  >
                    <span className="truncate pr-2">{gradeLevel}</span>
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>

                  <AnimatePresence>
                    {isGradeDropdownOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 w-48 sm:w-full mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden font-sans"
                      >
                        <div className="max-h-48 overflow-y-auto overscroll-contain py-1">
                          {[
                            '9th Grade (Freshman)', '10th Grade (Sophomore)', 
                            '11th Grade (Junior)', '12th Grade (Senior)', 
                            'College Freshman', 'College Sophomore', 
                            'College Junior', 'College Senior'
                          ].map((grade) => (
                            <div 
                              key={grade}
                              onClick={() => {
                                setGradeLevel(grade);
                                safeSetItem('academic_grade', grade);
                                if (auth.currentUser?.uid) {
                                  safeSetItem(`academic_grade_${auth.currentUser.uid}`, grade);
                                }
                                const isFoundational = grade.includes('9th Grade') || grade.includes('10th Grade');
                                if (isFoundational) {
                                  setStreamMajor('Core / Foundation');
                                  safeSetItem('academic_stream', 'Core / Foundation');
                                  if (auth.currentUser?.uid) {
                                    safeSetItem(`academic_stream_${auth.currentUser.uid}`, 'Core / Foundation');
                                  }
                                } else {
                                  if (streamMajor === 'Core / Foundation') {
                                    setStreamMajor('STEM / Engineering');
                                    safeSetItem('academic_stream', 'STEM / Engineering');
                                    if (auth.currentUser?.uid) {
                                      safeSetItem(`academic_stream_${auth.currentUser.uid}`, 'STEM / Engineering');
                                    }
                                  }
                                }
                                setIsGradeDropdownOpen(false);
                                triggerVibration(10);
                              }}
                              className={`px-3 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${gradeLevel === grade ? 'bg-zinc-50 font-bold text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-medium'}`}
                            >
                              <span>{grade}</span>
                              {gradeLevel === grade && <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <div className="space-y-1.5 relative">
                  <label className="text-[10px] font-bold text-zinc-500">Academic Track</label>
                  {(() => {
                    const activeTracks = REGIONAL_TRACKS[selectedCountryName] || REGIONAL_TRACKS['Others / International'];
                    const currentTrackObj = activeTracks.find(t => t.id === streamMajor || t.title === streamMajor) || activeTracks[0];
                    const displayTitle = currentTrackObj ? currentTrackObj.title : streamMajor;
                    const isFoundationalGrade = gradeLevel.includes('9th Grade') || gradeLevel.includes('10th Grade');

                    return (
                      <>
                        <button 
                          disabled={isFoundationalGrade}
                          onClick={() => {
                            if (isFoundationalGrade) return;
                            setIsTrackDropdownOpen(!isTrackDropdownOpen);
                            setIsGradeDropdownOpen(false);
                            setIsCountryDropdownOpen(false);
                          }}
                          className={`w-full border rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-semibold font-sans shadow-sm transition-all ${
                            isFoundationalGrade 
                              ? 'bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed opacity-75' 
                              : 'bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50'
                          }`}
                        >
                          <span className="truncate pr-2 flex items-center gap-1.5">
                            {isFoundationalGrade && <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                            {isFoundationalGrade ? 'Core / Foundation' : displayTitle}
                          </span>
                          {!isFoundationalGrade && <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
                        </button>

                        <AnimatePresence>
                          {!isFoundationalGrade && isTrackDropdownOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.15 }}
                              className="absolute top-full right-0 w-64 sm:w-full mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden font-sans"
                            >
                              <div className="max-h-56 overflow-y-auto overscroll-contain py-1">
                                {activeTracks.map((trackObj) => {
                                  const isSelected = streamMajor === trackObj.id || streamMajor === trackObj.title;
                                  return (
                                    <div 
                                      key={trackObj.title}
                                      onClick={() => {
                                        setStreamMajor(trackObj.id);
                                        safeSetItem('academic_stream', trackObj.id);
                                        if (auth.currentUser?.uid) {
                                          safeSetItem(`academic_stream_${auth.currentUser.uid}`, trackObj.id);
                                        }
                                        setIsTrackDropdownOpen(false);
                                        triggerVibration(10);
                                      }}
                                      className={`px-3 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${isSelected ? 'bg-zinc-50 font-bold text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-medium'}`}
                                    >
                                      <div className="flex flex-col pr-2">
                                        <span className="font-bold text-zinc-800">{trackObj.title}</span>
                                        <span className="text-[10px] text-zinc-400 font-normal">{trackObj.subtitle}</span>
                                      </div>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />}
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Country / Educational Region Selection */}
              <div className="space-y-1.5 pt-1 relative">
                <label className="text-[10px] font-bold text-zinc-500">Country / Curriculum System</label>
                <button 
                  onClick={() => {
                    setIsCountryDropdownOpen(!isCountryDropdownOpen);
                    setIsGradeDropdownOpen(false);
                    setIsTrackDropdownOpen(false);
                  }}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 font-sans"
                >
                  <span className="truncate pr-2">{selectedCountryName}</span>
                  <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                </button>

                <AnimatePresence>
                  {isCountryDropdownOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 w-full mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden font-sans"
                    >
                      <div className="max-h-52 overflow-y-auto overscroll-contain py-1">
                        {[
                          { name: 'United States', flag: '🇺🇸', regionSystem: 'USA' },
                          { name: 'United Kingdom', flag: '🇬🇧', regionSystem: 'UK' },
                          { name: 'Canada', flag: '🇨🇦', regionSystem: 'CA' },
                          { name: 'Australia', flag: '🇦🇺', regionSystem: 'AU' },
                          { name: 'Others / International', flag: '🌍', regionSystem: 'Global' },
                        ].map((c) => (
                          <div 
                            key={c.name}
                            onClick={() => {
                              setSelectedCountryName(c.name);
                              safeSetItem('academic_country', c.name);
                              safeSetItem('academic_region', c.regionSystem);
                              if (auth.currentUser?.uid) {
                                safeSetItem(`academic_country_${auth.currentUser.uid}`, c.name);
                                safeSetItem(`academic_region_${auth.currentUser.uid}`, c.regionSystem);
                              }

                              // Auto-sync track to match newly selected country
                              const isFoundational = gradeLevel.includes('9th Grade') || gradeLevel.includes('10th Grade');
                              if (isFoundational) {
                                setStreamMajor('Core / Foundation');
                                safeSetItem('academic_stream', 'Core / Foundation');
                                if (auth.currentUser?.uid) {
                                  safeSetItem(`academic_stream_${auth.currentUser.uid}`, 'Core / Foundation');
                                }
                              } else {
                                const newTracks = REGIONAL_TRACKS[c.name] || REGIONAL_TRACKS['Others / International'];
                                const matchedTrack = newTracks.find(t => t.id === streamMajor) || newTracks[0];
                                setStreamMajor(matchedTrack.id);
                                safeSetItem('academic_stream', matchedTrack.id);
                                if (auth.currentUser?.uid) {
                                  safeSetItem(`academic_stream_${auth.currentUser.uid}`, matchedTrack.id);
                                }
                              }

                              setIsCountryDropdownOpen(false);
                              triggerVibration(10);
                            }}
                            className={`px-3 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${selectedCountryName === c.name ? 'bg-zinc-50 font-bold text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-medium'}`}
                          >
                            <span className="flex items-center gap-2">
                              <span>{c.flag}</span>
                              <span>{c.name}</span>
                            </span>
                            {selectedCountryName === c.name && <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Mastery Radar Chart */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Target className="w-4 h-4 text-zinc-400" /> Skill Mastery
              </h3>
              <button 
                onClick={handleShareMastery}
                className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-purple-600 transition-colors cursor-pointer active:scale-95"
                title="Share Skill Mastery"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="w-full h-48 -mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                  { subject: 'Math', A: 85, fullMark: 100 },
                  { subject: 'Physics', A: 70, fullMark: 100 },
                  { subject: 'Chemistry', A: 90, fullMark: 100 },
                  { subject: 'Biology', A: 65, fullMark: 100 },
                  { subject: 'English', A: 80, fullMark: 100 },
                ]}>
                  <PolarGrid stroke="#e4e4e7" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Mastery" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            
            <p className="text-[10px] text-zinc-400 font-medium text-center mt-2">
              AI-generated mapping based on your recent quiz scores.
            </p>
          </div>

          {/* Passive 7-Day App Usage Tracker Card */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-400" /> App Usage Tracker
              </h3>
              <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Passive 7-Day Log
              </span>
            </div>

            <p className="text-[11px] font-bold text-zinc-500 leading-relaxed">
              Tracks total active time spent in the app. Updates passively as you study, solve quizzes, and interact with the AI tutor.
            </p>

            {/* Passive Usage Line Chart */}
            <div className="w-full h-48 -mt-1 select-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                  <XAxis 
                    dataKey="day" 
                    tick={{ fill: '#a1a1aa', fontSize: 10, fontWeight: 700 }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    stroke="#a1a1aa" 
                    tick={{ fill: '#71717a', fontSize: 9, fontWeight: 700 }} 
                    axisLine={false} 
                    tickLine={false} 
                    unit="m"
                  />
                  <Tooltip 
                    content={({ active, payload, label }: any) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-zinc-900/95 backdrop-blur-md text-white rounded-2xl p-3 shadow-xl border border-zinc-800 text-[11px] font-sans">
                            <p className="font-black text-xs text-zinc-300 mb-1">{label} Report</p>
                            <p className="flex items-center gap-1.5 font-bold text-purple-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                              Usage: {payload[0].value} mins
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="focusTime" 
                    name="Active Time (Mins)" 
                    stroke="#8b5cf6" 
                    strokeWidth={3.5} 
                    activeDot={{ r: 6 }} 
                    dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-zinc-800 block">Today's Focus Time</span>
                <span className="text-[9px] font-bold text-zinc-400">Recorded passively in background</span>
              </div>
              <span className="text-sm font-black text-zinc-900 bg-white border border-zinc-200/60 shadow-sm px-3.5 py-1.5 rounded-xl font-mono">
                {(() => {
                  const todayStr = getTodayDateString();
                  const todayMins = chartData.find(item => item.dateString === todayStr)?.focusTime || 0;
                  return `${todayMins}m`;
                })()}
              </span>
            </div>
          </div>

          {/* Learning Preferences */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-zinc-400" /> Accessibility & Focus
            </h3>
            
            {/* Visual Learner Mode Toggle */}
            <div 
              onClick={() => {
                triggerVibration(10);
                setVisualLearner(!visualLearner);
              }}
              className="flex justify-between items-center bg-zinc-50 border border-zinc-100 rounded-2xl p-4 cursor-pointer hover:bg-zinc-100/50 transition-colors"
            >
              <div>
                <span className="text-xs font-black text-zinc-800 block">Visual Learner Mode</span>
                <span className="text-[9px] font-bold text-zinc-400">Enhance diagrams and color-code notes</span>
              </div>
              <div className={`w-10 h-6 ${visualLearner ? 'bg-purple-500' : 'bg-zinc-200'} rounded-full relative shadow-inner transition-colors shrink-0`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${visualLearner ? 'right-1' : 'left-1'}`} />
              </div>
            </div>

            {/* Deep Focus Mode Toggle */}
            <div 
              onClick={() => {
                triggerVibration(10);
                setDeepFocus(!deepFocus);
              }}
              className="flex justify-between items-center bg-zinc-50 border border-zinc-100 rounded-2xl p-4 cursor-pointer hover:bg-zinc-100/50 transition-colors"
            >
              <div>
                <span className="text-xs font-black text-zinc-800 block">Deep Focus Mode</span>
                <span className="text-[9px] font-bold text-zinc-400">Minimize distractions & hide gamification</span>
              </div>
              <div className={`w-10 h-6 ${deepFocus ? 'bg-purple-500' : 'bg-zinc-200'} rounded-full relative shadow-inner transition-colors shrink-0`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${deepFocus ? 'right-1' : 'left-1'}`} />
              </div>
            </div>
          </div>

          {/* Student Stats Cards (Bento Style) */}
          {!deepFocus && (
          <div className="grid grid-cols-2 gap-4">
            {/* Coins Balance Card / PRO Badge */}
            {isVip ? (
              <div className="bg-gradient-to-br from-amber-400 to-orange-600 rounded-[2.25rem] p-5 border border-amber-300 shadow-lg relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white border border-white/30 backdrop-blur-md">
                    <Crown className="w-4 h-4 fill-white" />
                  </div>
                  <span className="text-[9px] uppercase font-black tracking-wider text-white/90">Subscription</span>
                </div>
                <div className="relative z-10">
                  <p className="text-xl font-black text-white leading-none">PRO Member</p>
                  <p className="text-[9px] text-white/80 font-bold mt-1">Unlimited Access Active</p>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => {
                  triggerVibration(10);
                  if (onNavigateToCoinPage) {
                    onNavigateToCoinPage();
                  }
                }}
                className="bg-white rounded-[2.25rem] p-5 border border-zinc-200 shadow-sm relative overflow-hidden flex flex-col justify-between cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 active:scale-95 transition-all"
                title="Click to view Coins & Rewards"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100">
                    <Trophy className="w-4 h-4 fill-amber-100" />
                  </div>
                  <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400">Coins</span>
                </div>
                <div>
                  <p className="text-xl font-black text-zinc-850 leading-none">{coinsBalance}</p>
                  <p className="text-[9px] text-zinc-400 font-bold mt-1">Available Study Coins</p>
                </div>
              </div>
            )}

            {/* Study Streak Card */}
            <div 
              ref={streakCardRef}
              onClick={() => {
                triggerVibration(15);
                if (onNavigateToStreakPage) {
                  onNavigateToStreakPage();
                } else {
                  setShowStreakDetails(true);
                }
              }}
              className="bg-white rounded-[2.25rem] p-5 border border-zinc-200 shadow-sm relative overflow-hidden flex flex-col justify-between cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 active:scale-95 transition-all"
              title="Click to view Streak details"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 border border-orange-100">
                  <Flame className="w-4 h-4 fill-orange-100" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400 font-bold">Streak</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShareStreak();
                    }}
                    className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-orange-500 transition-colors cursor-pointer active:scale-95 z-10"
                    title="Share Streak"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xl font-black text-zinc-850 leading-none">{studyStreak} Days</p>
                <p className="text-[9px] text-zinc-400 font-bold mt-1">Daily App Check-In</p>
              </div>
            </div>
          </div>
          )}

          {/* Weekly Quests & Missions */}
          {!deepFocus && (
            <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-600" /> Daily & Weekly Quests
                </h3>
                <span className="text-[9.5px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-150">
                  Earn XP & Coins
                </span>
              </div>

              {/* Daily Task XP Cap Meter */}
              <div className="bg-gradient-to-r from-purple-50/90 via-indigo-50/80 to-blue-50/90 border border-purple-200/70 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-purple-600/10 text-purple-700 flex items-center justify-center font-black text-sm shrink-0 shadow-inner">
                    ⚡
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-black text-zinc-900">Daily Task XP Limit</span>
                      <span className="text-[9px] font-black text-purple-700 bg-purple-100/90 px-1.5 py-0.2 rounded-full">
                        {dailyXP.earnedToday} / {dailyXP.dailyLimit} XP
                      </span>
                    </div>
                    <div className="w-32 bg-purple-200/60 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div 
                        className="bg-gradient-to-r from-purple-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (dailyXP.earnedToday / dailyXP.dailyLimit) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <span className={`text-[9px] font-extrabold px-2.5 py-1 rounded-xl shrink-0 ${dailyXP.isCapped ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-white text-purple-700 border border-purple-200 shadow-2xs'}`}>
                  {dailyXP.isCapped ? '🌟 Capped (150/150)' : `+${dailyXP.remainingToday} XP Left`}
                </span>
              </div>

              <div className="space-y-3">
                {weeklyQuests.map((quest) => (
                  <div 
                    key={quest.id} 
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      quest.isClaimed 
                        ? 'bg-zinc-50/60 border-zinc-200/60 opacity-60'
                        : quest.isCompleted 
                          ? 'bg-gradient-to-r from-purple-50/80 to-indigo-50/80 border-purple-200 shadow-xs'
                          : 'bg-zinc-50/40 border-zinc-200/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">{quest.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-zinc-900 truncate">{quest.title}</span>
                          <span className="text-[9px] font-black text-purple-700 bg-purple-100/70 px-1.5 py-0.5 rounded">
                            +{quest.xpReward} XP
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium truncate">{quest.desc}</p>
                        
                        {/* Quest Progress Micro Bar */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="w-24 bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-purple-600 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, (quest.currentCount / quest.targetCount) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[8.5px] font-bold text-zinc-400">
                            {quest.currentCount}/{quest.targetCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {quest.isClaimed ? (
                        <span className="text-[9.5px] font-black text-zinc-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-zinc-400" /> Done
                        </span>
                      ) : quest.isCompleted ? (
                        <button
                          onClick={() => {
                            claimQuestReward(quest.id);
                            if (!isVip) {
                              addCoins(quest.coinReward, `Completed ${quest.title}! 🎯`);
                            }
                          }}
                          className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-[10px] rounded-xl shadow-sm hover:from-purple-700 hover:to-indigo-700 transition-all active:scale-95 cursor-pointer border-none"
                        >
                          Claim 🏆
                        </button>
                      ) : (
                        <span className="text-[9px] font-extrabold text-zinc-400 bg-zinc-100 px-2 py-1 rounded-lg">
                          In Progress
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievement Badges Shelf */}
          {!deepFocus && (
            <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> Study Mastery Badges
              </h3>

              <div className="grid grid-cols-3 gap-2.5">
                {achievementBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-between gap-1.5 transition-all ${
                      badge.unlocked
                        ? 'bg-amber-50/50 border-amber-200 shadow-xs'
                        : 'bg-zinc-50/30 border-zinc-200/40 opacity-50'
                    }`}
                  >
                    <span className="text-2xl">{badge.icon}</span>
                    <div>
                      <span className={`text-[10px] font-black block truncate ${badge.unlocked ? 'text-zinc-900' : 'text-zinc-400'}`}>
                        {badge.title}
                      </span>
                      <span className="text-[8px] font-bold text-zinc-400 block">
                        {badge.requiredXP} XP
                      </span>
                    </div>
                    {badge.unlocked ? (
                      <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-100/80 px-1.5 py-0.5 rounded">
                        Unlocked
                      </span>
                    ) : (
                      <span className="text-[8px] font-bold text-zinc-400 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> Locked
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Info Box */}
          <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[10px] font-medium text-blue-700 leading-relaxed">
              HelpYou AI customizes solutions, vocabulary, and tutor responses dynamically based on your selected Study Level (High School, College, or Advanced). Change your level anytime!
            </p>
          </div>
        </div>
      </div>

      {/* Slide-over Panel for App Settings */}
      <AnimatePresence>
        {showSettings && (
          <div className="absolute inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm">
            {/* Backdrop Click Close */}
            <div className="absolute inset-0 bg-transparent" onClick={() => setShowSettings(false)} />

            {/* Slider Container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-sm h-full bg-[#FAF9F6] border-l border-zinc-200 flex flex-col shadow-2xl z-10 overflow-hidden"
            >
              {/* Settings Header */}
              <header className="px-6 py-5 bg-white border-b border-zinc-200/60 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-black text-zinc-800 flex items-center gap-2">
                  <span>⚙️</span> App Settings
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>

              {/* Settings Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
                
                {/* VIP CARD INSIDE SETTINGS */}
                {isVip ? (
                  <div className="bg-gradient-to-tr from-yellow-500 via-amber-500 to-orange-500 rounded-3xl p-4.5 text-white shadow-sm border border-amber-400 relative overflow-hidden">
                    <div className="absolute right-[-15px] top-[-15px] opacity-10">
                      <Crown className="w-20 h-20 rotate-12" />
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <div>
                        <span className="bg-white/20 text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full text-white">
                          Active Plan
                        </span>
                        <h4 className="text-sm font-black mt-1 flex items-center gap-1">
                          HelpYou AI Pro <Crown className="w-3 h-3 text-yellow-200 fill-yellow-200" />
                        </h4>
                        <p className="text-[9px] text-white/80 font-bold leading-normal mt-0.5">Unlimited scans & speech</p>
                      </div>
                      <button 
                        onClick={() => {
                          triggerVibration(15);
                          setActiveModal('manage_sub');
                        }}
                        className="bg-white text-amber-700 hover:bg-zinc-50 px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm transition-all active:scale-95 shrink-0"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border-2 border-dashed border-amber-300 rounded-3xl p-4.5 text-zinc-800 shadow-sm flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shrink-0">
                        <Crown className="w-4 h-4 fill-amber-100" />
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black text-zinc-900 leading-tight">HelpYou AI</h4>
                        <p className="text-[9px] text-zinc-400 font-bold mt-0.5">Upgrade for unlimited tools</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        triggerVibration([20, 40]);
                        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "PRO Benefits" } }));
                      }}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black text-[10px] py-2 px-3 rounded-xl shadow-md active:scale-95 transition-all shrink-0"
                    >
                      Pro 👑
                    </button>
                  </div>
                )}

                {/* Manage Subscription Button right below the banner */}
                <div 
                  onClick={() => {
                    triggerVibration(15);
                    if (isVip) {
                      setActiveModal('manage_sub');
                    } else {
                      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "PRO Benefits" } }));
                    }
                  }}
                  className="bg-white rounded-3xl border border-zinc-200 p-4.5 flex justify-between items-center cursor-pointer hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100 shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-black text-zinc-850 block">Manage Subscription</span>
                      <span className="text-[9px] text-zinc-400 font-bold">View billing, update plans & history</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </div>

                {/* Restore Purchases Button */}
                <div 
                  onClick={handleRestorePurchases}
                  className="bg-white rounded-3xl border border-zinc-200 p-4.5 flex justify-between items-center cursor-pointer hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shrink-0">
                      {isRestoring ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-black text-zinc-850 block">Restore Purchases</span>
                      <span className="text-[9px] text-zinc-400 font-bold">
                        {isRestoring ? "Checking subscriptions..." : "Force-sync previous purchases"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </div>



                {/* APP CONFIGURATION */}
                <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                    <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-extrabold text-[10px] text-zinc-500 uppercase tracking-wide">Preferences</span>
                  </div>
                  
                  {/* Dark Mode Toggle */}
                  <div 
                    onClick={() => {
                      triggerVibration(hapticEnabled ? 10 : 0);
                      onToggleDarkMode();
                      showToast(!isDarkMode ? "🌙 Dark Mode enabled" : "☀️ Light Mode enabled");
                    }}
                    className="p-4 flex justify-between items-center border-t border-zinc-100 bg-white cursor-pointer hover:bg-zinc-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Moon className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-700">Dark Mode</span>
                    </div>
                    <div className={`w-9 h-5 ${isDarkMode ? 'bg-emerald-500' : 'bg-zinc-200'} rounded-full relative cursor-pointer shadow-inner transition-colors`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${isDarkMode ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                  </div>



                  {/* Haptic Vibration Toggle */}
                  <div
                    onClick={() => {
                      const newVal = !hapticEnabled;
                      setHapticEnabled(newVal);
                      safeSetItem('pref_haptic_enabled', String(newVal));
                      if (newVal) triggerVibration(15); // Give a test buzz when turning ON
                      showToast(newVal ? '📳 Vibration turned ON' : '🔇 Vibration turned OFF');
                    }}
                    className="p-4 flex justify-between items-center border-t border-zinc-100 bg-white cursor-pointer hover:bg-zinc-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-zinc-400" />
                      <div>
                        <span className="text-xs font-bold text-zinc-700 block">Haptic Feedback</span>
                        <span className="text-[10px] text-zinc-400 font-semibold">Vibrations on button taps</span>
                      </div>
                    </div>
                    <div className={`w-9 h-5 ${hapticEnabled ? 'bg-emerald-500' : 'bg-zinc-200'} rounded-full relative cursor-pointer shadow-inner transition-colors`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${hapticEnabled ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                </div>



                {/* Account Info for Social Users */}
                {user && !user.providerData?.some(p => p.providerId === 'password') && (
                  <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm p-5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                      <Shield className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-zinc-800">Verified Social Account</h4>
                      <p className="text-[10px] font-bold text-zinc-400">Security is managed via {user.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 'your provider'}.</p>
                    </div>
                  </div>
                )}

                {/* SUPPORT & LEGAL */}
                <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-extrabold text-[10px] text-zinc-500 uppercase tracking-wide">Support & Legal</span>
                  </div>
                  
                  {/* Share App Button */}
                  <button
                    onClick={async () => {
                      triggerVibration(hapticEnabled ? 15 : 0);
                      try {
                        if (Capacitor.isNativePlatform()) {
                          await Share.share({
                            title: '📚 HelpYou AI — Smart Study App',
                            text: '🚀 I use HelpYou AI to solve homework, generate quizzes & get AI tutoring! Try it free 👇',
                            url: 'https://play.google.com/store/apps/details?id=com.helpyou.ai',
                            dialogTitle: 'Share HelpYou AI with friends'
                          });
                        } else {
                          await navigator.clipboard.writeText('https://play.google.com/store/apps/details?id=com.helpyou.ai');
                          showToast('🔗 App link copied to clipboard!');
                        }
                      } catch (e) {
                        console.warn('Share failed:', e);
                      }
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-none transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                      <div>
                        <span className="block">Share HelpYou AI</span>
                        <span className="text-[10px] text-zinc-400 font-semibold">Invite your friends to study smarter</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(hapticEnabled ? 15 : 0); 
                      window.location.href = 'mailto:helpyou.ai.support@gmail.com?subject=HelpYou%20AI%20App%20-%20Support%20Request';
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Help & Support</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      window.location.href = 'market://details?id=com.yourcompany.helpyouai';
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <Star className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Rate HelpYou AI</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      window.location.href = 'mailto:helpyou.ai.support@gmail.com?subject=HelpYou%20AI%20App%20-%20Bug%20Report&body=Hi%20HelpYou%20AI%20Team%2C%20I%20found%20a%20bug.%0ADevice%20Model%3A%20%0AOS%20Version%3A%20%0AIssue%20Description%3A%20';
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <Bug className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Report a Bug</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      setActiveModal('privacy');
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <Shield className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Privacy Policy</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      setActiveModal('terms');
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Terms of Service</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>

                {/* FULL APP OPTIMIZER (SPEED & LAG BOOSTER) */}
                <div className="bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 rounded-[2rem] p-5 text-white shadow-md relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2.5 relative z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white backdrop-blur-md">
                        <Zap className="w-4 h-4 text-white fill-white" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white leading-tight flex items-center gap-1.5">
                          Full Optimize App
                          <span className="text-[8px] bg-white/25 px-1.5 py-0.5 rounded-full uppercase font-black tracking-wider">
                            Lag-Free ⚡
                          </span>
                        </h4>
                        <p className="text-[9.5px] text-white/80 font-bold mt-0.5">Clear dead RAM caches, fix hang & lag</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-white/90 font-medium leading-relaxed mb-3 relative z-10">
                    Cleans background blob memory, purges orphaned temporary cache, and restores peak 60fps responsiveness across all AI tools.
                  </p>

                  <button
                    onClick={handleFullAppOptimization}
                    disabled={isOptimizing}
                    className="w-full bg-white hover:bg-zinc-50 text-emerald-800 active:scale-98 font-black text-xs py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer relative z-10 border-none disabled:opacity-75"
                  >
                    {isOptimizing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                        <span>Optimizing App Memory...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                        <span>⚡ Run Full Optimization</span>
                      </>
                    )}
                  </button>
                </div>

                {/* LOG OUT / ACTIONS */}
                <div className="space-y-3 pt-1">
                  <button 
                    onClick={handleExportData}
                    className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 py-3.5 rounded-2xl font-black border border-zinc-300/80 active:scale-99 transition-all cursor-pointer text-xs"
                  >
                    <Download className="w-4 h-4 text-zinc-500" />
                    <span>Export My Data</span>
                  </button>

                  {user ? (
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-3.5 rounded-2xl font-black shadow-md shadow-red-500/10 active:scale-99 transition-all cursor-pointer text-xs uppercase tracking-wide"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out</span>
                    </button>
                  ) : onOpenLogin && (
                    <button 
                      onClick={() => {
                        triggerVibration(15);
                        setShowSettings(false);
                        onOpenLogin();
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-3.5 rounded-2xl font-black shadow-md shadow-purple-500/10 active:scale-99 transition-all cursor-pointer text-xs uppercase tracking-wide"
                    >
                      <span>🔐 Log In / Register</span>
                    </button>
                  )}

                  {user && (
                    <button 
                      onClick={() => { triggerVibration(25); setActiveModal('delete_account'); }}
                      disabled={isDeleting}
                      className="w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 text-zinc-500 hover:text-rose-600 py-3 rounded-2xl font-bold border-2 border-zinc-200/80 active:scale-99 transition-all cursor-pointer text-[10px] tracking-wide disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <>
                          <ActivityIndicator color="#FF0000" />
                          <span>Deleting Account...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Account & Data</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* App Version Footer */}
                <div className="flex flex-col items-center gap-1 pt-2 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-zinc-300" />
                    <span className="text-[10px] font-bold text-zinc-350 tracking-wide">HelpYou AI • Version 1.0.0</span>
                  </div>
                  <span className="text-[9px] text-zinc-300 font-semibold">Made with ❤️ for students worldwide</span>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAILED MODAL OVERLAYS */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`bg-white rounded-[2.5rem] border border-zinc-200 w-full overflow-hidden p-6 shadow-2xl relative flex flex-col ${activeModal === 'privacy' || activeModal === 'terms' ? 'max-w-md' : 'max-w-sm'}`}
            >
              {/* Modal Close Button */}
              <button 
                onClick={() => { triggerVibration(10); setActiveModal(null); }}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 hover:text-zinc-800 flex items-center justify-center cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Modal Header */}
              <div className="mb-5 pr-6">
                <h3 className="text-base font-black tracking-tight text-zinc-900 flex items-center gap-2">
                  {activeModal === 'password' && (
                    <><Lock className="w-4 h-4 text-purple-600" /> <span>Change Password</span></>
                  )}
                  {activeModal === 'email' && (
                    <><Mail className="w-4 h-4 text-purple-600" /> <span>Update Email</span></>
                  )}
                  {activeModal === 'delete_account' && (
                    <><AlertTriangle className="w-4 h-4 text-rose-600" /> <span className="text-rose-600">Delete Account</span></>
                  )}
                  {activeModal === 'manage_sub' && (
                    <><Crown className="w-4 h-4 text-amber-500" /> <span>Manage Plan</span></>
                  )}
                  {activeModal === 'privacy' && (
                    <><Shield className="w-4 h-4 text-purple-600" /> <span>Privacy Policy</span></>
                  )}
                  {activeModal === 'terms' && (
                    <><FileText className="w-4 h-4 text-purple-600" /> <span>Terms of Service</span></>
                  )}
                </h3>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto max-h-[70vh]">
                
                {/* 1. Change Password Form */}
                {activeModal === 'password' && (
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <p className="text-[10px] text-zinc-400 font-bold leading-relaxed mb-1">
                      Update your login credential. Your new password must be at least 6 characters.
                    </p>
                    <div className="space-y-1 relative">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Current Password</label>
                      <div className="relative">
                        <input 
                          type={showPass1 ? "text" : "password"} 
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPass1(!showPass1)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600">
                          {showPass1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 relative">
                      <label className="text-[10px] font-black uppercase text-zinc-500">New Password</label>
                      <div className="relative">
                        <input 
                          type={showPass2 ? "text" : "password"} 
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPass2(!showPass2)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600">
                          {showPass2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-zinc-950 text-white font-extrabold text-xs py-3.5 rounded-2xl hover:bg-zinc-900 transition-all cursor-pointer mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <span>Save New Password</span>
                      )}
                    </button>
                  </form>
                )}

                {/* 2. Update Email Form */}
                {activeModal === 'email' && (
                  <form onSubmit={handleEmailChange} className="space-y-4">
                    <p className="text-[10px] text-zinc-400 font-bold leading-relaxed mb-1">
                      Enter your new email address. A confirmation link will be sent to the new email address for verification.
                    </p>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-zinc-500">New Email Address</label>
                      <input 
                        type="email" 
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-1 relative">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Current Password</label>
                      <div className="relative">
                        <input 
                          type={showPass1 ? "text" : "password"} 
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPass1(!showPass1)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600">
                          {showPass1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-zinc-950 text-white font-extrabold text-xs py-3.5 rounded-2xl hover:bg-zinc-900 transition-all cursor-pointer mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <span>Send Verification</span>
                      )}
                    </button>
                  </form>
                )}

                {/* 8. Delete Account Confirmation */}
                {activeModal === 'delete_account' && (
                  <div className="space-y-4 text-center">
                    <div className="w-12 h-12 bg-rose-50 border border-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <AlertTriangle className="w-6 h-6 animate-pulse" />
                    </div>
                    <p className="text-xs text-zinc-600 font-bold leading-relaxed whitespace-pre-line text-left bg-zinc-50 p-4 rounded-2xl border border-zinc-150 shadow-inner">
                      Are you sure? This will permanently wipe your data.{"\n\n"}⚠️ WARNING: Deleting your account does NOT cancel your active Pro Subscription. You must manually cancel it in your device's App Store settings to avoid future charges.
                    </p>
                    
                    <button
                      type="button"
                      onClick={() => {
                        triggerVibration(15);
                        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                        const url = isIOS 
                          ? "https://apps.apple.com/account/subscriptions" 
                          : "https://play.google.com/store/account/subscriptions";
                        Linking.openURL(url);
                      }}
                      className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-black text-xs py-3 rounded-2xl cursor-pointer transition-all border border-zinc-300 flex items-center justify-center gap-2 shadow-sm"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Manage Subscription</span>
                    </button>

                    <div className="flex gap-2.5 pt-3">
                      <button 
                        onClick={() => { triggerVibration(10); setActiveModal(null); }}
                        className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs py-3 rounded-2xl cursor-pointer transition-all border border-zinc-200"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleDeleteAccount}
                        disabled={isDeleting}
                        className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs py-3 rounded-2xl cursor-pointer transition-all shadow-md shadow-rose-500/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isDeleting ? (
                          <>
                            <ActivityIndicator color="#FFFFFF" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <span>Yes, Delete</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* 9. Manage Plan */}
                {activeModal === 'manage_sub' && (
                  <div className="space-y-4 text-center py-2">
                    <div className="w-14 h-14 bg-amber-50 border border-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-sm mb-2">
                      <Crown className="w-7 h-7 fill-amber-100" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-zinc-800">Pro Member Plan</h4>
                      <p className="text-[10px] text-zinc-400 font-bold mt-0.5">Billing via Google Play Store</p>
                    </div>
                    <div className="text-left bg-zinc-50 p-4 rounded-2xl border border-zinc-100 space-y-2">
                      <p className="text-xs font-bold text-zinc-800">
                        To cancel your subscription and avoid auto-billing, please follow these steps:
                      </p>
                      <ol className="text-xs text-zinc-600 font-medium leading-relaxed space-y-1.5 list-decimal list-inside pl-0.5">
                        <li>Open the Google Play Store app.</li>
                        <li>Tap your Profile icon at the top right.</li>
                        <li>Tap on Payments &amp; subscriptions &gt; Subscriptions.</li>
                        <li>Select HelpYou AI and tap Cancel subscription.</li>
                      </ol>
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <button 
                        onClick={() => {
                          triggerVibration(15);
                          window.open('https://play.google.com/store/account/subscriptions', '_blank');
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-xs py-3.5 rounded-2xl cursor-pointer transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        <span>Manage on Play Store</span>
                      </button>
                      <button 
                        onClick={() => { triggerVibration(10); setActiveModal(null); }}
                        className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs py-3.5 rounded-2xl cursor-pointer transition-all border border-zinc-200"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* 10. Privacy Policy */}
                {activeModal === 'privacy' && (
                  <div className="space-y-5 text-left py-1 text-zinc-700">
                    <p className="text-xs font-semibold leading-relaxed text-zinc-500">
                      At HelpYou AI, we are committed to safeguarding your personal information and ensuring full transparency. This Privacy Policy outlines our comprehensive data handling practices.
                    </p>
                    <p className="text-xs font-semibold leading-relaxed text-zinc-700 bg-emerald-50/50 border border-emerald-100/50 rounded-xl p-3 mt-2">
                      🌟 100% Ad-Free Guarantee: HelpYou AI is a completely ad-free learning environment. We do not sell your data, track you for marketing purposes, or display third-party advertisements.
                    </p>

                    <div className="space-y-4">
                      {/* Section 1: Data We Collect */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📊 1. Data We Collect
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Account Data:</span> We collect your email address and basic profile information solely for authentication, account management, and synchronization across devices.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Image & Camera Data:</span> All user-uploaded images in chats or other features are strictly temporary. They are automatically and permanently deleted from our servers within 1 hour of upload to ensure maximum privacy.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Generated Content & History:</span> Any generated content such as PDFs, notes, and study summaries are not downloaded directly to your local device storage. Instead, they are securely saved in the 'History' section of your account on our cloud servers. This allows you to access your study history seamlessly across any device. If you choose to permanently delete your account, all associated generated data and history will be automatically and completely removed from our servers.
                          </li>
                        </ul>
                      </div>

                      {/* Section 2: Third-Party Services & Backend AI */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🤖 2. Third-Party Services & Backend AI
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Artificial Intelligence:</span> HelpYou AI utilizes high-performance Google Gemini AI APIs to generate step-by-step answers, process image data, and deliver dynamic tutoring. Prompts and images sent to the AI service do not contain personally identifiable information (PII) and are never used to train public models.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Payment Processors:</span> We utilize trusted payment gateways (such as Google Play Billing and Stripe) to securely process premium Pro Subscriptions. We do not store or have access to your credit card details or sensitive billing credentials.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Database:</span> Secure cloud backend services are used to safely store persistent user data, such as your customized notes, quiz history, coins, and profile preferences.
                          </li>
                        </ul>
                      </div>

                      {/* Section 3: App Analytics & Performance */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📊 3. App Analytics & Performance
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Analytics:</span> Basic anonymous app usage statistics are gathered solely to identify software bugs, track layout efficiency, and refine the educational experience.
                          </li>
                        </ul>
                      </div>

                      {/* Section 4: Data Deletion & User Rights */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🗑️ 4. Data Deletion & Your Rights
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          You maintain full ownership of your data. You have the right to request complete account deletion at any time. To trigger manual data removal, you can click "Delete Account" in settings or contact our support desk directly at:
                        </p>
                        <p className="text-[11px] font-black text-purple-600 pl-4 mt-1">
                          helpyou.ai.support@gmail.com
                        </p>
                      </div>

                      {/* Section 5: Data Security */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🔒 5. Commitment to Security
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          We employ industry-leading physical, technical, and administrative controls to protect your data. All communication is routed over secure HTTPS channels, and our cloud databases are protected by strict access control rules to keep your virtual study space safe and private.
                        </p>
                      </div>

                      {/* Section 6: European Union Compliance (GDPR) */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🇪🇺 6. European Union Compliance (GDPR)
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          For users residing in the European Economic Area (EEA), we comply fully with the General Data Protection Regulation (GDPR). Our legal bases for processing your data include:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li>Fulfilling our contractual obligations to provide educational tools and virtual tutoring services.</li>
                          <li>Managing and validating your premium Pro Subscriptions.</li>
                          <li>Fulfilling legitimate business interests, such as optimizing app performance, fixing bugs, and providing support.</li>
                        </ul>
                        <p className="text-[11px] leading-relaxed mt-1.5 text-zinc-600 pl-4">
                          Under the GDPR, you have the following rights which can be exercised by emailing our support desk:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li><span className="font-semibold text-zinc-800">Right of Access:</span> Request a complete export of your personal data.</li>
                          <li><span className="font-semibold text-zinc-800">Right to Rectification:</span> Request correction of any inaccurate profile information.</li>
                          <li><span className="font-semibold text-zinc-800">Right to Erasure (Forget Me):</span> Request deletion of all stored account records.</li>
                          <li><span className="font-semibold text-zinc-800">Right to Data Portability:</span> Request transfer of your data to another provider in a structured, machine-readable format.</li>
                        </ul>
                      </div>

                      {/* Section 7: California Privacy Rights (CCPA) */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🐻 7. California Privacy Rights (CCPA)
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          In accordance with the California Consumer Privacy Act (CCPA), we provide California residents with specific disclosures regarding their personal information:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li>We do <span className="font-extrabold text-zinc-900">NOT</span> sell, rent, or trade your personal data to any third parties.</li>
                          <li>You have the right to request disclosure of the categories and specific pieces of personal information we have collected.</li>
                          <li>You have the right to request deletion of your data and are guaranteed non-discriminatory treatment, meaning we will never deny services, alter quality levels, or charge different prices for exercising your CCPA rights.</li>
                        </ul>
                      </div>

                      {/* Section 8: Children's Privacy (COPPA) */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          👶 8. Children's Privacy (COPPA)
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          Our services are strictly not intended for children under the age of 13. In accordance with the Children's Online Privacy Protection Act (COPPA), we do not knowingly or intentionally collect personal information from individuals under 13. If we discover that any user under the age of 13 has registered or submitted personal data, we will immediately and permanently purge those records from our servers.
                        </p>
                      </div>

                      {/* Section 9: Cookies & Tracking Technologies */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🍪 9. Cookies & Tracking Technologies
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          To deliver a high-quality user experience, HelpYou AI utilizes multiple categories of cookies and identifiers:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li><span className="font-semibold text-zinc-800">Essential Cookies:</span> Necessary for securing authentication sessions and accessing paid capabilities.</li>
                          <li><span className="font-semibold text-zinc-800">Functionality Cookies:</span> Remember your educational track, grade preferences, study notes, and dark mode state.</li>
                          <li><span className="font-semibold text-zinc-800">Statistics & Analytics:</span> Anonymous session tracking to log application bugs and speed bottlenecks.</li>
                        </ul>
                        <p className="text-[11px] leading-relaxed mt-1.5 text-zinc-600 pl-4">
                          You can easily restrict, disable, or manage essential and analytical cookies through your device settings.
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => { triggerVibration(10); setActiveModal(null); }}
                      className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold text-xs py-3.5 rounded-2xl cursor-pointer transition-all mt-6 shadow-md"
                    >
                      I Understand & Agree
                    </button>
                  </div>
                )}

                {/* 11. Terms of Service */}
                {activeModal === 'terms' && (
                  <div className="space-y-5 text-left py-1 text-zinc-700">
                    <p className="text-xs font-semibold leading-relaxed text-zinc-500">
                      Welcome to HelpYou AI. Please review these Terms of Use carefully before using our application. By accessing our services, you agree to be fully bound by these terms.
                    </p>

                    <div className="space-y-4">
                      {/* Section 1: Acceptance & Eligibility */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📝 1. Acceptance & Eligibility
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Binding Agreement:</span> By installing, registering, or using any part of the HelpYou AI application, you acknowledge that you have read, understood, and agree to be bound by these Terms of Use.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Age Restrictions:</span> HelpYou AI is strictly designed and permitted only for individuals aged 13 or older. We do not knowingly permit younger children to access our virtual learning systems.
                          </li>
                        </ul>
                      </div>

                      {/* Section 2: AI-Generated Content Disclaimer */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          ⚠️ 2. AI-Generated Content Disclaimer
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          HelpYou AI harnesses advanced artificial intelligence, including Google Gemini AI APIs, to deliver instant step-by-step problem breakdowns, quizzes, and real-time study assistance.
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            All tutoring content, answers, and study notes are generated dynamically and provided on an <span className="font-black text-zinc-800">"as is" and "as available" basis</span> for personal learning and informational purposes only.
                          </li>
                          <li>
                            While our underlying models are highly optimized, we do not guarantee 100% academic accuracy, thoroughness, or completeness. Users accept all generated explanations at their own risk.
                          </li>
                        </ul>
                      </div>

                      {/* Section 2.1: No Professional Advice */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          ⚕️ 2.1. No Professional Advice
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          The content provided by HelpYou AI, specifically in subjects like Biology and Chemistry, is strictly for academic and educational purposes. It does not constitute professional, medical, health, or safety advice. Never use AI-generated answers for real-world chemical handling or medical self-diagnosis.
                        </p>
                      </div>

                      {/* Section 3: Subscriptions, Billing & Cancellation */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          💎 3. Subscriptions, Billing & Cancellation
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Auto-Renewal:</span> Premium Pro Subscriptions (available in Monthly and Yearly cycles) automatically renew at the prevailing tier price unless cancelled.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Cancellation Policy:</span> To avoid future charges, you must cancel your subscription via your device's respective distribution store (Google Play Billing or Apple App Store Subscription Settings) at least 24 hours prior to the next scheduled renewal date.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Chargeback Policy:</span> We enforce a zero-tolerance policy against fraudulent disputes. Initiation of unauthorized chargebacks or payment disputes will result in the immediate and permanent termination of your HelpYou AI account and the deletion of your historical study data.
                          </li>
                        </ul>
                      </div>

                      {/* Section 4: Acceptable Use & Abuse Prevention */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🛡️ 4. Acceptable Use & Abuse Prevention
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          Subject to these terms, you are granted a non-exclusive, non-transferable, and revocable license to access our educational services for personal, non-commercial use.
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li>You are strictly prohibited from reverse engineering, decompiling, scraping, or attempting to extract the underlying source code of HelpYou AI.</li>
                          <li>You agree not to use automated bots, custom scripts, or high-volume scrapers to query our backend AI, which places an unfair burden on platform resources and shared API rate limits.</li>
                          <li>Any detected infrastructure abuse, scanner spamming, or server overloading will result in immediate suspension without refund.</li>
                        </ul>
                      </div>

                      {/* Section 5: Proprietary Rights */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          👑 5. Proprietary Rights
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          The HelpYou AI brand name, custom logos, visual designs, scanner interfaces, and proprietary tutoring algorithms are the sole property of the Company and are fully protected under global copyright, trademark, and intellectual property laws.
                        </p>
                      </div>

                      {/* Section 6: Limitation of Liability */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🛑 6. Limitation of Liability
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>To the maximum extent permitted by applicable law, HelpYou AI and its creators shall not be liable for any indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, loss of study progress, academic grades, or data) arising from the use of or inability to use the service.</li>
                          <li>The total aggregate liability of the company for any and all claims arising under or related to these Terms shall not exceed the total amount actually paid by you to HelpYou AI in the three (3) months preceding the claim, or $100 USD, whichever is greater.</li>
                        </ul>
                      </div>

                      {/* Section 7: Indemnification */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🛡️ 7. Indemnification
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          You agree to indemnify, defend, and hold harmless HelpYou AI, its creator, affiliates, and partners from and against any and all claims, liabilities, damages, losses, or expenses (including reasonable attorneys' fees) arising out of or in any way connected with your violation of these Terms or your misuse of the Service.
                        </p>
                      </div>

                      {/* Section 8: Termination */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🚫 8. Termination
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          We reserve the right, at our sole discretion, to suspend or terminate your account and revoke your access to the Service at any time, with or without notice, and without any liability, especially in cases of structural abuse, payment fraudulent chargebacks, or violations of these Terms.
                        </p>
                      </div>

                      {/* Section 9: Governing Law & Class Action Waiver */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          ⚖️ 9. Governing Law & Class Action Waiver
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>These Terms and any dispute or claim arising out of or in connection with them shall be governed by and construed in accordance with the laws of India.</li>
                          <li>Any legal actions, suits, or judicial proceedings arising under or related to these Terms shall be resolved exclusively in the competent courts located in India.</li>
                          <li><span className="font-bold text-zinc-800">Class Action Waiver:</span> You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action. You expressly waive any right to file or participate in a class-action lawsuit against HelpYou AI or its creators.</li>
                        </ul>
                      </div>

                      {/* Section 10: Contact Us */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📬 10. Contact Us
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          If you have any questions, concerns, or legal queries regarding these Terms of Use, please reach out to our legal and support helpdesk directly at:
                        </p>
                        <p className="text-[11px] font-black text-purple-600 pl-4 mt-1">
                          helpyou.ai.support@gmail.com
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => { triggerVibration(10); setActiveModal(null); }}
                      className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold text-xs py-3.5 rounded-2xl cursor-pointer transition-all mt-6 shadow-md"
                    >
                      I Accept Terms & Conditions
                    </button>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full App Optimization Modal */}
      <AnimatePresence>
        {showOptimizationModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-zinc-200 w-full max-w-sm overflow-hidden p-6 shadow-2xl relative flex flex-col items-center text-center"
            >
              {/* Close Button (only active when not currently optimizing) */}
              {!isOptimizing && (
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setShowOptimizationModal(false);
                  }}
                  className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 hover:text-zinc-800 flex items-center justify-center cursor-pointer transition-all border-none"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Glowing Icon */}
              <div className="relative mb-4 mt-2">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  {isOptimizing ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      className="text-white"
                    >
                      <Zap className="w-10 h-10 fill-white" />
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    >
                      <Check className="w-10 h-10 text-white stroke-[3.5]" />
                    </motion.div>
                  )}
                </div>
                {isOptimizing && (
                  <span className="absolute -inset-1 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                )}
              </div>

              {/* Header Title */}
              <h3 className="text-lg font-black text-zinc-900 tracking-tight">
                {isOptimizing ? "Optimizing HelpYou AI..." : "⚡ 100% Fully Optimized!"}
              </h3>
              <p className="text-[11px] font-bold text-zinc-500 mt-1 max-w-xs leading-relaxed">
                {optimizationStepText}
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden mt-4 mb-2 p-0.5 border border-zinc-200/60">
                <motion.div
                  className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${optimizationProgress}%` }}
                />
              </div>
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest font-mono">
                {optimizationProgress}% Complete
              </span>

              {/* Optimization Stats (Post-Completion) */}
              {!isOptimizing && optimizationResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full space-y-3 mt-4"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-2.5 flex flex-col items-center">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Freed RAM</span>
                      <span className="text-sm font-black text-emerald-800 mt-0.5 font-mono">{optimizationResult.memoryFreedMB} MB</span>
                    </div>
                    <div className="bg-teal-50 border border-teal-150 rounded-2xl p-2.5 flex flex-col items-center">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-teal-600">Cache Cleared</span>
                      <span className="text-sm font-black text-teal-800 mt-0.5 font-mono">{optimizationResult.cacheClearedCount} Items</span>
                    </div>
                    <div className="bg-cyan-50 border border-cyan-150 rounded-2xl p-2.5 flex flex-col items-center">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-600">Latency</span>
                      <span className="text-sm font-black text-cyan-800 mt-0.5 font-mono">&lt;{optimizationResult.latencyMs}ms</span>
                    </div>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3 text-left space-y-1.5">
                    <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider block">Completed Actions:</span>
                    {optimizationResult.optimizedItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-700">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0 stroke-[3]" />
                        <span>{item}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-700">
                      <Check className="w-3 h-3 text-emerald-600 stroke-[3] shrink-0" />
                      <span>User Notes, Streaks & Coins Preserved</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      triggerVibration(20);
                      restartAppCleanly();
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs py-3.5 rounded-2xl shadow-lg transition-all cursor-pointer border-none mt-2 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 fill-white" />
                    <span>
                      {restartCountdown !== null
                        ? `Restarting Cleanly in ${restartCountdown}s... (Tap to Restart Now)`
                        : "Restart App Now & Enjoy 60fps 🚀"}
                    </span>
                  </button>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Slide-over Panel for Streak Days Details */}
      <AnimatePresence>
        {showStreakDetails && (
          <div className="absolute inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm">
            {/* Backdrop Click Close */}
            <div className="absolute inset-0 bg-transparent" onClick={() => setShowStreakDetails(false)} />

            {/* Slider Container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-sm h-full bg-[#FAF9F6] border-l border-zinc-200 flex flex-col shadow-2xl z-10 overflow-hidden"
            >
              {/* Streak Header */}
              <header className="px-6 py-5 bg-white border-b border-zinc-200/60 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-black text-zinc-800 flex items-center gap-2">
                  <span>🔥</span> Study Streak Days
                </h3>
                <button
                  onClick={() => setShowStreakDetails(false)}
                  className="p-1 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>

              {/* Streak Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
                
                {/* Hero Streak Flame Box */}
                <div className="bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-500 rounded-[2.25rem] p-6 text-white text-center shadow-lg border border-orange-400 relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/5 pointer-events-none" />
                  <div className="relative z-10 flex flex-col items-center">
                    <motion.div
                      animate={{ scale: [1, 1.15, 1], y: [0, -3, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white text-3xl mb-3 shadow-inner"
                    >
                      🔥
                    </motion.div>
                    
                    <p className="text-4xl font-black tracking-tight leading-none">
                      {studyStreak} Days
                    </p>
                    <span className="text-[10px] uppercase font-black tracking-widest text-white/90 bg-white/20 px-3 py-1 rounded-full mt-2 inline-block">
                      {studyStreak > 0 ? "Daily Habit Active 🚀" : "Start your Streak today! 🌱"}
                    </span>
                    
                    {/* Encouraging Hindi/Hinglish sub-caption */}
                    <p className="text-xs font-bold text-white/95 mt-4 leading-relaxed max-w-xs">
                      Fantastic Performance! You are working hard every day! Your study streak keeps glowing brighter with every visit! 🎯
                    </p>
                  </div>
                </div>

                {/* Auto-tracked attendance streak card */}
                <div className="bg-white rounded-[2rem] p-5 border border-zinc-200/80 shadow-sm flex flex-col items-center text-center space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-50 text-orange-500 border border-orange-100">
                      <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                    </div>
                    <h4 className="text-xs font-black text-zinc-800 uppercase tracking-wider">
                      Auto-Tracked Study Streak
                    </h4>
                  </div>

                  <p className="text-[11px] font-bold text-zinc-500 max-w-xs leading-relaxed">
                    Your daily study streak is calculated automatically in the background when you open the app. No manual check-in needed! Keep up the incredible learning habit! ✨🚀
                  </p>

                  <div className="w-full bg-zinc-50 border border-zinc-150 py-3.5 px-4 rounded-xl text-xs font-black text-zinc-700 flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Streak Active: {studyStreak} Days Verified
                  </div>
                </div>

                {/* Attendance Calendar Grid */}
                <div className="bg-white rounded-[2rem] p-5 border border-zinc-200/80 shadow-sm space-y-4">
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
                <div className="bg-white rounded-[2rem] p-5 border border-zinc-200/80 shadow-sm space-y-4">
                  <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Streak Milestones
                  </h4>

                  <div className="space-y-3">
                    {[
                      { days: 3, badge: "Novice Scholar 🎓", desc: "Unlock the 3-Day study streak badge!" },
                      { days: 7, badge: "Study Monk 🧘", desc: "Unlock the 7-Day study streak badge!" },
                      { days: 15, badge: "Exam Destroyer ⚡", desc: "Unlock the 15-Day study streak badge!" },
                      { days: 30, badge: "AI Mastermind 🌟", desc: "Unlock the 30-Day study streak badge!" }
                    ].map((milestone) => {
                      const isUnlocked = studyStreak >= milestone.days;
                      const isClaimed = claimedMilestones[milestone.days];

                      return (
                        <div 
                          key={`milestone-${milestone.days}`}
                          className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
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
                                onClick={() => handleClaimMilestone(milestone.days)}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer border-none"
                              >
                                Claim Badge 🏆
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
