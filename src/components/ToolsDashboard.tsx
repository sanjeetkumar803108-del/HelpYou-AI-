import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Swords, BookOpen, Layers, Youtube, FileText, FileImage, Wand2, ChevronDown, ChevronUp, Calculator, UserCircle, Search, Lock, Brain, Crown, Share2, Archive, Trash2, Calendar, HelpCircle, Check, Undo, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import appLogo from '../assets/logo.png';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { getCoins, isUserLoggedIn } from '../utils/coins';
import { useSettings } from '../hooks/useSettings';
import { db } from '../lib/firebase';

interface ToolsDashboardProps {
  onSelectTool: (tool: string) => void;
  isVip?: boolean;
  user?: any;
  onOpenVip?: () => void;
  onOpenProfile?: () => void;
  onOpenLogin?: () => void;
  pocketItems?: any[];
  activeTab?: string;
  onForceSync?: () => Promise<void>;
}

const FEATURE_COSTS: Record<string, number> = {
  'tab:scanner': 1,
  'testprep': 2,
  'questiongenerator': 2,
  'contentgenerator': 1,
  'essaygrader': 1,
  'youtubesummarizer': 1,
  'grammar': 1,
  'summariser': 1,
  'calculator': 0,
  'livetutorsearch': 0,
  'apnotes': 0,
  'apsamplepapers': 0,
  'trapradar': 0,
  'mindmap': 0,
  'frqgrader': 0,
  'quizbattle': 0
};

const HeaderLogo = React.memo(() => (
  <div className="flex items-center gap-2 font-bold text-lg text-zinc-900 select-none">
    <img src={appLogo} alt="AP Exam Logo" className="w-7 h-7 rounded-lg object-contain" referrerPolicy="no-referrer" loading="lazy" />
    <span className="font-black tracking-tight text-zinc-950">AP Exam</span>
  </div>
));
HeaderLogo.displayName = 'HeaderLogo';

// Stagger and spring animation configurations for a premium feel
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: "spring" as const, 
      stiffness: 140, 
      damping: 15 
    } 
  }
} as const;

function ToolsDashboard({ 
  onSelectTool, 
  isVip = false,
  user = null,
  onOpenVip,
  onOpenProfile,
  onOpenLogin,
  pocketItems = [],
  activeTab,
  onForceSync
}: ToolsDashboardProps) {
  const [showAllTools, setShowAllTools] = useState(false);

  const loggedIn = isUserLoggedIn();
  const { deepFocus } = useSettings();

  // --- Pull-To-Refresh Implementation ---
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshState, setRefreshState] = useState<'idle' | 'pulling' | 'ready' | 'refreshing' | 'success'>('idle');
  
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleDragStart = (clientY: number) => {
    if (!scrollRef.current) return;
    // Only allow pull-to-refresh if the scrollbar is completely at the top
    if (scrollRef.current.scrollTop === 0 && refreshState === 'idle') {
      startY.current = clientY;
      isDragging.current = true;
    }
  };

  const handleDragMove = (clientY: number, e?: { preventDefault?: () => void }) => {
    if (!isDragging.current || refreshState === 'refreshing' || refreshState === 'success') return;
    const dy = clientY - startY.current;
    if (dy > 0) {
      // Apply a spring resistance damping ratio
      const damped = Math.min(100, dy * 0.35);
      setPullDistance(damped);
      if (damped >= 55) {
        setRefreshState('ready');
      } else {
        setRefreshState('pulling');
      }
      // Prevent default overscroll bounce/refreshes in some WebView frames
      if (e?.preventDefault) {
        e.preventDefault();
      }
    }
  };

  const handleDragEnd = async () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (refreshState === 'ready' && onForceSync) {
      triggerVibration(10);
      setRefreshState('refreshing');
      setPullDistance(55); // Lock it at loading distance
      try {
        await onForceSync();
        setRefreshState('success');
        triggerVibration(15);
      } catch (err) {
        console.error('[PTR] Manual refresh failed:', err);
        setRefreshState('idle');
        setPullDistance(0);
        return;
      }
      
      // Keep success state briefly so it feels high-fidelity
      setTimeout(() => {
        setRefreshState('idle');
        setPullDistance(0);
      }, 1000);
    } else {
      setRefreshState('idle');
      setPullDistance(0);
    }
  };

  // Connect touch and mouse fallback handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].pageY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].pageY, e);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.pageY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.pageY, e);
  };

  const handleMouseUpOrLeave = () => {
    handleDragEnd();
  };
  // --------------------------------------

  // WebView / Capacitor safe layout force-render trick
  const [forceRenderCount, setForceRenderCount] = useState(0);

  useEffect(() => {
    const forceLayoutRecalculation = () => {
      setForceRenderCount(prev => prev + 1);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('resize'));
      }
    };

    const timers = [
      setTimeout(forceLayoutRecalculation, 10),
      setTimeout(forceLayoutRecalculation, 80),
      setTimeout(forceLayoutRecalculation, 180),
      setTimeout(forceLayoutRecalculation, 350),
      setTimeout(forceLayoutRecalculation, 600)
    ];

    if (Capacitor.isNativePlatform()) {
      try {
        const nativeSplashScreen = (Capacitor as any).Plugins?.SplashScreen || (window as any).Capacitor?.Plugins?.SplashScreen;
        if (nativeSplashScreen) {
          nativeSplashScreen.hide().catch((e: any) => console.log('[Native] SplashScreen hide error:', e));
        }
      } catch (err) {
        console.warn('[Native] Capacitor SplashScreen detection skipped:', err);
      }
    }

    window.addEventListener('focus', forceLayoutRecalculation);
    document.addEventListener('visibilitychange', forceLayoutRecalculation);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('focus', forceLayoutRecalculation);
      document.removeEventListener('visibilitychange', forceLayoutRecalculation);
    };
  }, [activeTab]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showToastMessage, setShowToastMessage] = useState<string | null>(null);

  // Custom tool cards archive/share states
  const [archivedToolIds, setArchivedToolIds] = useState<string[]>(() => {
    try {
      const cached = safeGetItem('study_archived_tool_ids');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  const [contextMenuItem, setContextMenuItem] = useState<{ item: any; isTool: boolean } | null>(null);

  const longPressTimer = useRef<any>(null);
  const isLongPressActive = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const handleToggleArchiveTool = (toolId: string) => {
    let updated: string[];
    if (archivedToolIds.includes(toolId)) {
      updated = archivedToolIds.filter(id => id !== toolId);
      setShowToastMessage(`✨ Unarchived: ${toolId.replace('tab:', '')} is back!`);
    } else {
      updated = [...archivedToolIds, toolId];
      setShowToastMessage(`📥 Archived: ${toolId.replace('tab:', '')} hidden from dashboard.`);
    }
    setArchivedToolIds(updated);
    safeSetItem('study_archived_tool_ids', JSON.stringify(updated));
    setContextMenuItem(null);
  };

  const handleShareTool = (toolId: string) => {
    const cleanId = toolId.startsWith('tab:') ? toolId.substring(4) : toolId;
    const shareText = `📚 Check out the AI Tool - "${cleanId.toUpperCase()}" on AP Exam App! It supercharges your learning! 🚀`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setShowToastMessage(`📋 Share text copied to clipboard!`);
    }
    setContextMenuItem(null);
  };

  const handleStartPress = (item: any, isTool: boolean, e: any) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchStartPos.current = { x: clientX, y: clientY };
    
    isLongPressActive.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    
    longPressTimer.current = setTimeout(() => {
      isLongPressActive.current = true;
      triggerVibration(45);
      setContextMenuItem({ item, isTool });
    }, 600);
  };

  const handleMovePress = (e: any) => {
    if (!touchStartPos.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = Math.abs(clientX - touchStartPos.current.x);
    const dy = Math.abs(clientY - touchStartPos.current.y);
    if (dx > 12 || dy > 12) {
      handleCancelPress();
    }
  };

  const handleEndPress = (e: any, onClick: () => void) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (touchStartPos.current && !isLongPressActive.current) {
      if (e.cancelable && e.type === 'touchend') {
        e.preventDefault();
      }
      onClick();
    } else if (isLongPressActive.current) {
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
    }
    touchStartPos.current = null;
  };

  const handleCancelPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    touchStartPos.current = null;
  };

  const handleSelectTool = (tool: string) => {
    triggerVibration(15);



    // VIP/Subscription check for Deep Search AI (livetutorsearch)
    if (tool === 'livetutorsearch') {
      if (!isVip) {
        alert("Deep Search AI is a premium VIP feature. Please upgrade to our VIP subscription model to unlock!");
        if (onOpenVip) {
          onOpenVip();
        } else {
          window.dispatchEvent(new CustomEvent('open-vip-modal'));
        }
        return;
      }
    }

    // VIP/Subscription check for AI Question Generator (questiongenerator)
    if (tool === 'questiongenerator') {
      if (!isVip) {
        alert("AI Questions Generator is a premium VIP feature. Please upgrade to our VIP subscription model to unlock!");
        if (onOpenVip) {
          onOpenVip();
        } else {
          window.dispatchEvent(new CustomEvent('open-vip-modal'));
        }
        return;
      }
    }

    // 2. Coin requirement check (Handled elegantly inside each tool by the LockedFeature component!)
    onSelectTool(tool);
  };

  const [coins, setCoins] = useState(() => {
    return getCoins(user?.uid);
  });
  const [showCoinPopup, setShowCoinPopup] = useState(false);

  // Sync coins when user auth status changes
  useEffect(() => {
    setCoins(getCoins(user?.uid));
  }, [user]);

  useEffect(() => {
    const handleCoinsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (typeof customEvent.detail === 'number') {
        setCoins(customEvent.detail);
      }
    };
    window.addEventListener('study-coins-updated', handleCoinsUpdate);
    return () => window.removeEventListener('study-coins-updated', handleCoinsUpdate);
  }, []);

  const isLocked = (toolId: string) => {
    if (isVip) return false; // Pro users bypass all locks
    if (!loggedIn) return false; 
    const normalizedTool = toolId.startsWith('tab:') ? toolId.substring(4) : toolId;
    const cost = FEATURE_COSTS[normalizedTool] ?? 0;
    return cost > 0 && coins <= 0;
  };

  const renderLockIndicator = (toolId: string, roundedClass: string = "rounded-[2rem]") => {
    if (isLocked(toolId)) {
      return (
        <div className={`absolute inset-0 bg-white/70 backdrop-blur-[1px] ${roundedClass} flex flex-col items-center justify-center z-10 transition-all pointer-events-none`}>
          <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center text-white shadow-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          {!deepFocus && <span className="text-[10px] font-black uppercase tracking-wider text-zinc-900 mt-1.5 bg-white/90 px-2 py-0.5 rounded-full shadow-sm border border-zinc-100">Quota Over</span>}
        </div>
      );
    }
    return null;
  };

  const earnCoins = () => {
    // legacy support
  };

  return (
    <div 
      ref={scrollRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      className="w-full p-6 h-full flex flex-col text-zinc-900 bg-gradient-to-b from-[#F9FBE7]/15 via-[#FAF9F6] to-[#FAF9F6] overflow-y-auto relative font-sans select-none touch-pan-y"
    >
      {/* Pull-To-Refresh Visual Indicator Container */}
      <AnimatePresence>
        {pullDistance > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: pullDistance, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-full overflow-hidden flex items-center justify-center shrink-0 mb-4"
          >
            <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs bg-white/95 border border-zinc-200/80 shadow-md px-4 py-2 rounded-full backdrop-blur-sm">
              {refreshState === 'pulling' && (
                <>
                  <motion.div 
                    animate={{ rotate: pullDistance * 5 }}
                    className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full"
                  />
                  <span>Pull to sync cloud...</span>
                </>
              )}
              {refreshState === 'ready' && (
                <>
                  <motion.div 
                    animate={{ y: [0, 3, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="w-4 h-4 flex items-center justify-center text-zinc-800 font-black text-sm"
                  >
                    ↓
                  </motion.div>
                  <span className="text-zinc-800 font-black">Release to force-sync</span>
                </>
              )}
              {refreshState === 'refreshing' && (
                <>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    className="w-4 h-4 border-2 border-zinc-200 border-t-blue-600 rounded-full"
                  />
                  <span className="text-blue-600 font-black animate-pulse">Syncing latest data...</span>
                </>
              )}
              {refreshState === 'success' && (
                <>
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                  <span className="text-emerald-600 font-black">Sync complete!</span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Top Header Mockup Bar */}
      <div className="flex items-center justify-between mb-8">
        {/* Top-Left: Brand Identity */}
        <HeaderLogo />

        {/* Top-Right Area */}
        <div className="flex items-center gap-2">
          {!isVip && (
            <button 
              onClick={() => {
                triggerVibration(15);
                window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "Flash Sale 60% OFF" } }));
              }}
              className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white font-black text-xs h-[38px] px-4 rounded-full transition-all shadow-md shadow-amber-500/20 cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 fill-white text-white" />
              Flash Sale
            </button>
          )}

          <button 
            onClick={() => {
              triggerVibration(15);
              if (user) {
                if (onOpenProfile) {
                  onOpenProfile();
                } else {
                  window.dispatchEvent(new CustomEvent('open-profile-modal'));
                }
              } else {
                if (onOpenLogin) {
                  onOpenLogin();
                } else {
                  window.dispatchEvent(new CustomEvent('open-login-modal'));
                }
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 transition-all border border-zinc-200 shadow-sm overflow-hidden active:scale-95 relative cursor-pointer"
            title={user ? "Profile" : "Log In"}
          >
            {user ? (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-600 flex items-center justify-center text-white font-black text-sm shadow-inner">
                {user.email?.[0].toUpperCase() || 'U'}
              </div>
            ) : (
              <UserCircle className="w-6 h-6 text-zinc-650" />
            )}
          </button>
        </div>
      </div>
      {/* Hero Feature Cards: Test Prep & AP Notes */}
      <div className="flex-1 flex flex-col justify-center my-auto pb-10 gap-4">
        {/* 1v1 AP Quiz Battle Google Gemini Animated Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          whileHover={{ scale: 1.015, y: -2 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => handleSelectTool('quizbattle')}
          className="relative group cursor-pointer select-none"
        >
          {/* 1. Ambient Google Gemini Glowing Aura (Blue, Red, White) */}
          <div className="absolute -inset-1 rounded-[2.8rem] gemini-glow-backdrop opacity-70 blur-xl group-hover:opacity-100 transition-opacity duration-500 -z-10" />

          {/* 2. Outer Gemini Animated Multi-Color Border Frame (2.5px) */}
          <div className="rounded-[2.7rem] p-[2.5px] gemini-animated-border shadow-2xl">
            {/* 3. Inner Dark Cosmic Surface with Floating Animated Gemini Orbs */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-6 sm:p-7 flex items-center justify-between">
              
              {/* Animated Floating Gemini Light Orbs (Blue, Red, White) */}
              <div className="absolute -left-12 -top-12 w-48 h-48 rounded-full bg-blue-600/35 blur-2xl pointer-events-none animate-[gemini-orb-1_7s_ease-in-out_infinite]" />
              <div className="absolute right-8 -bottom-12 w-48 h-48 rounded-full bg-rose-600/30 blur-2xl pointer-events-none animate-[gemini-orb-2_6s_ease-in-out_infinite]" />
              <div className="absolute left-1/3 top-1/4 w-36 h-36 rounded-full bg-white/20 blur-xl pointer-events-none animate-[gemini-sparkle_5s_ease-in-out_infinite]" />

              {/* Card Left: Swords Icon + Dynamic Gradient Typography */}
              <div className="flex items-center gap-4 sm:gap-5 min-w-0 z-10">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-blue-600/30 via-zinc-900 to-rose-600/30 border border-white/25 flex items-center justify-center text-3xl shrink-0 group-hover:scale-105 transition-transform duration-300 shadow-inner">
                  <Swords className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-rose-100 tracking-tight truncate">
                      1v1 Quiz Battle
                    </h2>
                    <span className="flex h-2.5 w-2.5 relative shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-r from-blue-400 to-rose-400 shadow-sm"></span>
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-zinc-300 mt-0.5 flex items-center gap-1.5">
                    <span className="text-blue-300 font-bold">Live PvP Showdown</span>
                  </p>
                </div>
              </div>

              {/* Card Right: Glowing Action Button */}
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-zinc-900 border border-white/20 group-hover:border-white/60 group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-rose-600 flex items-center justify-center text-white shrink-0 transition-all duration-300 shadow-lg z-10 ml-3">
                <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 14px 30px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelectTool('testprep')}
          className="relative overflow-hidden bg-white border border-zinc-200/90 shadow-md rounded-[2.5rem] p-7 cursor-pointer flex items-center justify-between transition-all select-none group hover:border-indigo-300 hover:shadow-lg"
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-3xl shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
              🎯
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight">
                Test Prep
              </h2>
              <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                AI Exam Drills
              </p>
            </div>
          </div>
          
          <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center text-zinc-700 shrink-0 transition-colors shadow-sm">
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 14px 30px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelectTool('apnotes')}
          className="relative overflow-hidden bg-white border border-zinc-200/90 shadow-md rounded-[2.5rem] p-7 cursor-pointer flex items-center justify-between transition-all select-none group hover:border-purple-300 hover:shadow-lg"
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-3xl shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors duration-300">
              📚
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight">
                AP Notes
              </h2>
              <p className="text-xs font-semibold text-purple-600 mt-0.5">
                Smart Revision Guides
              </p>
            </div>
          </div>
          
          <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-purple-600 group-hover:text-white flex items-center justify-center text-zinc-700 shrink-0 transition-colors shadow-sm">
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16, ease: "easeOut" }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 14px 30px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelectTool('apsamplepapers')}
          className="relative overflow-hidden bg-white border border-zinc-200/90 shadow-md rounded-[2.5rem] p-7 cursor-pointer flex items-center justify-between transition-all select-none group hover:border-emerald-300 hover:shadow-lg"
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-3xl shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
              📑
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight">
                AP Sample Papers Set
              </h2>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                Official Mock Tests
              </p>
            </div>
          </div>
          
          <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center text-zinc-700 shrink-0 transition-colors shadow-sm">
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.24, ease: "easeOut" }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 14px 30px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelectTool('learningisland')}
          className="relative overflow-hidden bg-white border border-amber-300 shadow-md rounded-[2.5rem] p-7 cursor-pointer flex items-center justify-between transition-all select-none group hover:border-amber-500 hover:shadow-lg ring-1 ring-amber-400/20"
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-3xl shrink-0 group-hover:bg-gradient-to-br group-hover:from-amber-500 group-hover:to-yellow-500 group-hover:text-white transition-all duration-300 shadow-xs">
              🏝️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight">
                  Learning Island™
                </h2>
              </div>
              <p className="text-xs font-semibold text-amber-700 mt-0.5">
                Gamified Quest Maps
              </p>
            </div>
          </div>
          <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center text-zinc-700 shrink-0 transition-colors shadow-sm">
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.24, ease: "easeOut" }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 14px 30px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelectTool('trapradar')}
          className="relative overflow-hidden bg-white border border-amber-200/90 shadow-md rounded-[2.5rem] p-7 cursor-pointer flex items-center justify-between transition-all select-none group hover:border-amber-400 hover:shadow-lg"
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-3xl shrink-0 group-hover:bg-gradient-to-br group-hover:from-amber-500 group-hover:to-emerald-600 group-hover:text-white transition-all duration-300">
              🪤
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight">
                  AP Trap Radar™
                </h2>
              </div>
              <p className="text-xs font-semibold text-amber-600 mt-0.5">
                Bust Exam Traps
              </p>
            </div>
          </div>
          
          <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center text-zinc-700 shrink-0 transition-colors shadow-sm">
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.32, ease: "easeOut" }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 14px 30px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelectTool('mindmap')}
          className="relative overflow-hidden bg-white border border-teal-200/90 shadow-md rounded-[2.5rem] p-7 cursor-pointer flex items-center justify-between transition-all select-none group hover:border-teal-400 hover:shadow-lg"
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-3xl shrink-0 group-hover:bg-gradient-to-br group-hover:from-teal-500 group-hover:to-cyan-600 group-hover:text-white transition-all duration-300">
              🧠
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight">
                  Mind Map Revision
                </h2>
              </div>
              <p className="text-xs font-semibold text-teal-600 mt-0.5">
                Visual Concept Trees
              </p>
            </div>
          </div>
          
          <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-teal-500 group-hover:text-white flex items-center justify-center text-zinc-700 shrink-0 transition-colors shadow-sm">
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.28, ease: "easeOut" }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 14px 30px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelectTool('frqgrader')}
          className="relative overflow-hidden bg-white border border-emerald-200/90 shadow-md rounded-[2.5rem] p-7 cursor-pointer flex items-center justify-between transition-all select-none group hover:border-emerald-400 hover:shadow-lg"
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-3xl shrink-0 group-hover:bg-gradient-to-br group-hover:from-emerald-500 group-hover:to-teal-600 group-hover:text-white transition-all duration-300">
              📝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight">
                  AP FRQ Grader™
                </h2>
              </div>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                Instant Rubric Grading
              </p>
            </div>
          </div>
          
          <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-emerald-500 group-hover:text-white flex items-center justify-center text-zinc-700 shrink-0 transition-colors shadow-sm">
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </motion.div>

      </div>

      {/* Premium Long-Press Context Menu Overlay */}
      <AnimatePresence>
        {contextMenuItem && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setContextMenuItem(null)}
              className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm"
            />

            {/* Menu Sheet */}
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full max-w-sm p-6 shadow-2xl border border-zinc-100 relative z-10 space-y-4 text-left"
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-xl shrink-0">
                  {contextMenuItem.isTool ? "🛠️" : "📑"}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-purple-600">
                    {contextMenuItem.isTool ? "Tool Options" : "Library Item Options"}
                  </span>
                  <h3 className="font-black text-xs text-zinc-900 truncate mt-0.5">
                    {contextMenuItem.isTool 
                      ? (contextMenuItem.item.startsWith('tab:') ? contextMenuItem.item.substring(4) : contextMenuItem.item).toUpperCase()
                      : (contextMenuItem.item.title || 'Untitled Note')}
                  </h3>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2 pt-2">
                {/* Share Option */}
                <button
                  onClick={() => {
                    triggerVibration(15);
                    if (contextMenuItem.isTool) {
                      handleShareTool(contextMenuItem.item);
                    }
                  }}
                  className="w-full bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-black uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all border border-zinc-100 flex items-center gap-3 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-zinc-500" />
                  <span>Share Study Link / Content</span>
                </button>

                {/* Archive / Unarchive Option */}
                <button
                  onClick={() => {
                    triggerVibration(15);
                    if (contextMenuItem.isTool) {
                      handleToggleArchiveTool(contextMenuItem.item);
                    }
                  }}
                  className="w-full bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-black uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all border border-zinc-100 flex items-center gap-3 cursor-pointer"
                >
                  <Archive className="w-4 h-4 text-zinc-500" />
                  <span>
                    {contextMenuItem.isTool
                      ? (archivedToolIds.includes(contextMenuItem.item) ? "Unarchive & Show Card" : "Archive & Hide Card")
                      : "Archive"}
                  </span>
                </button>

                {/* Cancel Option */}
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setContextMenuItem(null);
                  }}
                  className="w-full bg-zinc-950 hover:bg-zinc-900 text-white text-xs font-black uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all border-none flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <span>Cancel</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inline Toast Notification */}
      <AnimatePresence>
        {showToastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-xl text-xs font-black border border-zinc-800"
          >
            {showToastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const MemoizedToolsDashboard = React.memo(ToolsDashboard);
MemoizedToolsDashboard.displayName = 'ToolsDashboard';
export default MemoizedToolsDashboard;

