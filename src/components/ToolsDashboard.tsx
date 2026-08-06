import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, BookOpen, Layers, Youtube, FileText, FileImage, Wand2, ChevronDown, ChevronUp, Calculator, UserCircle, Search, Lock, Brain, Crown, Share2, Archive, Trash2, Calendar, HelpCircle, Check, Undo, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
}

const FEATURE_COSTS: Record<string, number> = {
  'tab:scanner': 1,
  'testprep': 2,
  'questiongenerator': 2,
  'contentgenerator': 1,
  'notemaker': 5,
  'essaygrader': 1,
  'youtubesummarizer': 1,
  'grammar': 1,
  'summariser': 1,
  'calculator': 0,
  'image2pdf': 0,
  'pdfhistory': 0,
  'livetutorsearch': 0
};

const HeaderLogo = React.memo(() => (
  <div className="flex items-center gap-2 font-bold text-lg text-zinc-900 select-none">
    <img src="/src/assets/logo.svg" alt="HelpYou AI Logo" className="w-7 h-7" referrerPolicy="no-referrer" loading="lazy" />
    <span className="font-black tracking-tight text-zinc-950">HelpYou AI</span>
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
  pocketItems = []
}: ToolsDashboardProps) {
  const [showAllTools, setShowAllTools] = useState(false);
  const loggedIn = isUserLoggedIn();
  const { deepFocus } = useSettings();

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
    const shareText = `📚 Check out the AI Tool - "${cleanId.toUpperCase()}" on HelpYou AI! It supercharges your learning! 🚀`;
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
      onClick();
    } else if (isLongPressActive.current) {
      e.preventDefault();
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

    // 1. VIP/Subscription check for Ask AI Tutor (callwithtutor)
    if (tool === 'callwithtutor') {
      if (!isVip) {
        alert("Ask AI Tutor (Call with AI) is a premium feature. Please upgrade to our VIP subscription model to unlock!");
        if (onOpenVip) {
          onOpenVip();
        } else {
          window.dispatchEvent(new CustomEvent('open-vip-modal'));
        }
        return;
      }
    }

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
    <div className="w-full p-6 h-full flex flex-col text-zinc-900 bg-gradient-to-b from-[#F9FBE7]/15 via-[#FAF9F6] to-[#FAF9F6] overflow-y-auto relative font-sans">
      
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

      {/* Homework Help Section */}
      <div className="mb-8">
        <h2 className="text-[28px] font-black text-zinc-900 tracking-tight mb-4">Homework Help</h2>
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-4 min-h-[140px] md:min-h-[180px]"
        >
          {/* Scan Feature Card */}
          {!archivedToolIds.includes('tab:scanner') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('tab:scanner', true, e)}
              onTouchStart={(e) => handleStartPress('tab:scanner', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('tab:scanner'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('tab:scanner'))}
              onMouseLeave={handleCancelPress}
              className="relative overflow-hidden bg-[#EBF5FF] border border-blue-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              {renderLockIndicator('tab:scanner')}
              <span className="text-4xl filter drop-shadow-sm select-none">📷</span>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Scan</h3>
            </motion.div>
          )}

          {/* Chat Feature Card */}
          {!archivedToolIds.includes('tab:aitutor') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('tab:aitutor', true, e)}
              onTouchStart={(e) => handleStartPress('tab:aitutor', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('tab:aitutor'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('tab:aitutor'))}
              onMouseLeave={handleCancelPress}
              className="relative overflow-hidden bg-[#F3E8FF] border border-purple-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              {renderLockIndicator('tab:aitutor')}
              <span className="text-4xl filter drop-shadow-sm select-none">💭</span>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Chat</h3>
            </motion.div>
          )}

          {/* Live Search Tutor Card */}
          {!archivedToolIds.includes('livetutorsearch') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -4, boxShadow: "0 10px 25px -5px rgba(124, 58, 237, 0.25)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('livetutorsearch', true, e)}
              onTouchStart={(e) => handleStartPress('livetutorsearch', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('livetutorsearch'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('livetutorsearch'))}
              onMouseLeave={handleCancelPress}
              className="col-span-2 relative overflow-hidden bg-gradient-to-r from-purple-600 to-blue-600 border-none shadow-md rounded-[2rem] p-5 flex items-center justify-between cursor-pointer transition-all gap-4 text-white select-none touch-pan-y"
            >
              <div className="flex items-center gap-4 text-white">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white shrink-0">
                  <Search className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div className="text-left">
                  <h3 className="font-black text-white text-[1.05rem] tracking-tight leading-none mb-1.5 flex items-center gap-1.5">
                    Deep Search AI
                    <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 text-white px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
                  </h3>
                  <p className="text-xs text-white/80 font-bold">Search live dates, syllabus & current facts</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-white shrink-0" />
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* More Tools Section */}
      <div className="mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-zinc-800 tracking-tight mb-4">More Tools</h2>
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-4 min-h-[280px] md:min-h-[360px]"
        >
          {/* Card 1: Calculator */}
          {!archivedToolIds.includes('calculator') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('calculator', true, e)}
              onTouchStart={(e) => handleStartPress('calculator', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('calculator'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('calculator'))}
              onMouseLeave={handleCancelPress}
              className="bg-[#E6FFFA] border border-teal-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                <Calculator className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Calculator</h3>
            </motion.div>
          )}

          {/* Card 2: Test Prep */}
          {!archivedToolIds.includes('testprep') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('testprep', true, e)}
              onTouchStart={(e) => handleStartPress('testprep', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('testprep'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('testprep'))}
              onMouseLeave={handleCancelPress}
              className="relative overflow-hidden bg-[#FEFCBF] border border-yellow-300/50 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              {renderLockIndicator('testprep')}
              <span className="text-4xl filter drop-shadow-sm select-none">🎯</span>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Test Prep</h3>
            </motion.div>
          )}

          {/* Card 3: AI Questions */}
          {!archivedToolIds.includes('questiongenerator') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('questiongenerator', true, e)}
              onTouchStart={(e) => handleStartPress('questiongenerator', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('questiongenerator'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('questiongenerator'))}
              onMouseLeave={handleCancelPress}
              className="relative overflow-hidden bg-[#FFE4E6] border border-pink-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              {renderLockIndicator('questiongenerator')}
              <span className="text-4xl filter drop-shadow-sm select-none">🔮</span>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">AI Questions</h3>
            </motion.div>
          )}

          {/* Card 4: Writing Helper */}
          {!archivedToolIds.includes('contentgenerator') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('contentgenerator', true, e)}
              onTouchStart={(e) => handleStartPress('contentgenerator', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('contentgenerator'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('contentgenerator'))}
              onMouseLeave={handleCancelPress}
              className="relative overflow-hidden bg-[#FFEDD5] border border-orange-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              {renderLockIndicator('contentgenerator')}
              <span className="text-4xl filter drop-shadow-sm select-none">🖍️</span>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Writing Helper</h3>
            </motion.div>
          )}

          {/* Card 5: Ask AI Tutor */}
          {!archivedToolIds.includes('callwithtutor') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('callwithtutor', true, e)}
              onTouchStart={(e) => handleStartPress('callwithtutor', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('callwithtutor'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('callwithtutor'))}
              onMouseLeave={handleCancelPress}
              className="relative overflow-hidden bg-[#F0FDF4] border border-green-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              <span className="text-4xl filter drop-shadow-sm select-none">🧑‍🏫</span>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Call with AI Tutor</h3>
            </motion.div>
          )}

          {/* Card 6: AI Audio Summary */}
          {!archivedToolIds.includes('notemaker') && (
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={(e) => handleStartPress('notemaker', true, e)}
              onTouchStart={(e) => handleStartPress('notemaker', true, e)}
              onMouseMove={handleMovePress}
              onTouchMove={handleMovePress}
              onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('notemaker'))}
              onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('notemaker'))}
              onMouseLeave={handleCancelPress}
              className="relative overflow-hidden bg-[#E0E7FF] border border-indigo-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all select-none touch-pan-y"
            >
              {renderLockIndicator('notemaker')}
              <span className="text-4xl filter drop-shadow-sm select-none">🎙️</span>
              <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">AI Audio Summary</h3>
            </motion.div>
          )}


        </motion.div>

        {/* Expand / Show More Tools Toggle Button */}
        <div className="mt-5">
          <button 
            onClick={() => {
              triggerVibration(10);
              setShowAllTools(!showAllTools);
            }}
            className="w-full bg-white border border-zinc-200 text-zinc-800 font-extrabold text-sm py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:bg-zinc-50 active:scale-99"
          >
            <span>{showAllTools ? 'Show Less Tools' : 'More Tools'}</span>
            {showAllTools ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>
        </div>

        {/* Archived / Hidden Tools management section if any are archived */}
        {Array.isArray(archivedToolIds) && archivedToolIds.length > 0 && (
          <div className="mt-4 bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 select-none">
            <h4 className="text-[10px] font-black text-zinc-450 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Archive className="w-3.5 h-3.5 text-zinc-400" /> Hidden Tools ({archivedToolIds.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {archivedToolIds?.map(toolId => {
                const cleanName = toolId.startsWith('tab:') ? toolId.substring(4) : toolId;
                return (
                  <button
                    key={toolId}
                    onClick={() => handleToggleArchiveTool(toolId)}
                    className="bg-white hover:bg-zinc-100 active:scale-95 text-zinc-750 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-full border border-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{cleanName}</span>
                    <Undo className="w-3 h-3 text-purple-600" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showAllTools && (
            <motion.div 
              key="all-tools"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden mt-4"
            >
              <div className="border-t border-zinc-200/60 pt-4">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">All Features</h4>
                
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-2 gap-4 pb-2 min-h-[260px]"
                >
                  {/* Essay Grader */}
                  {!archivedToolIds.includes('essaygrader') && (
                    <motion.div 
                      variants={itemVariants}
                      whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                      whileTap={{ scale: 0.98 }}
                      onMouseDown={(e) => handleStartPress('essaygrader', true, e)}
                      onTouchStart={(e) => handleStartPress('essaygrader', true, e)}
                      onMouseMove={handleMovePress}
                      onTouchMove={handleMovePress}
                      onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('essaygrader'))}
                      onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('essaygrader'))}
                      onMouseLeave={handleCancelPress}
                      className="relative overflow-hidden bg-[#FFE4E6] border border-pink-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all select-none touch-pan-y"
                    >
                      {renderLockIndicator('essaygrader', "rounded-3xl")}
                      <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center text-xl shadow-sm select-none">
                        ⭐
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-800 leading-tight">AI Essay Grader</h4>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5">Get grading & feedback</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Image to PDF */}
                  {!archivedToolIds.includes('image2pdf') && (
                    <motion.div 
                      variants={itemVariants}
                      whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                      whileTap={{ scale: 0.98 }}
                      onMouseDown={(e) => handleStartPress('image2pdf', true, e)}
                      onTouchStart={(e) => handleStartPress('image2pdf', true, e)}
                      onMouseMove={handleMovePress}
                      onTouchMove={handleMovePress}
                      onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('image2pdf'))}
                      onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('image2pdf'))}
                      onMouseLeave={handleCancelPress}
                      className="bg-[#EBF5FF] border border-blue-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all select-none touch-pan-y"
                    >
                      <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center text-xl shadow-sm select-none">
                        📄
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-800 leading-tight">Image to PDF</h4>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5">Turn photos to PDF</p>
                      </div>
                    </motion.div>
                  )}



                  {/* Grammar Enhancer */}
                  {!archivedToolIds.includes('grammar') && (
                    <motion.div 
                      variants={itemVariants}
                      whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                      whileTap={{ scale: 0.98 }}
                      onMouseDown={(e) => handleStartPress('grammar', true, e)}
                      onTouchStart={(e) => handleStartPress('grammar', true, e)}
                      onMouseMove={handleMovePress}
                      onTouchMove={handleMovePress}
                      onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('grammar'))}
                      onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('grammar'))}
                      onMouseLeave={handleCancelPress}
                      className="relative overflow-hidden bg-[#F0FDF4] border border-green-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all select-none touch-pan-y"
                    >
                      {renderLockIndicator('grammar', "rounded-3xl")}
                      <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center text-xl shadow-sm select-none">
                        ✍️
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-800 leading-tight">Grammar & Flow</h4>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5">Fix sentence errors</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Summariser */}
                  {!archivedToolIds.includes('summariser') && (
                    <motion.div 
                      variants={itemVariants}
                      whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                      whileTap={{ scale: 0.98 }}
                      onMouseDown={(e) => handleStartPress('summariser', true, e)}
                      onTouchStart={(e) => handleStartPress('summariser', true, e)}
                      onMouseMove={handleMovePress}
                      onTouchMove={handleMovePress}
                      onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('summariser'))}
                      onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('summariser'))}
                      onMouseLeave={handleCancelPress}
                      className="relative overflow-hidden bg-[#F3E8FF] border border-purple-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all select-none touch-pan-y"
                    >
                      {renderLockIndicator('summariser', "rounded-3xl")}
                      <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center text-xl shadow-sm select-none">
                        📖
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-800 leading-tight">Summariser</h4>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5">High-yield summary</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Mistake Vault */}
                  {!archivedToolIds.includes('mistakevault') && (
                    <motion.div 
                      variants={itemVariants}
                      whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(239, 68, 68, 0.08)" }}
                      whileTap={{ scale: 0.98 }}
                      onMouseDown={(e) => handleStartPress('mistakevault', true, e)}
                      onTouchStart={(e) => handleStartPress('mistakevault', true, e)}
                      onMouseMove={handleMovePress}
                      onTouchMove={handleMovePress}
                      onMouseUp={(e) => handleEndPress(e, () => handleSelectTool('mistakevault'))}
                      onTouchEnd={(e) => handleEndPress(e, () => handleSelectTool('mistakevault'))}
                      onMouseLeave={handleCancelPress}
                      className="relative overflow-hidden bg-[#FEF2F2] border border-red-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all select-none touch-pan-y"
                    >
                      {renderLockIndicator('mistakevault', "rounded-3xl")}
                      <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center text-xl shadow-sm select-none">
                        🔒
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-800 leading-tight">The Mistake Vault</h4>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5">Concept correction lab</p>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>



      {/* Relax & Learn Section */}
      <div className="mb-24">
        <h2 className="text-xl md:text-2xl font-bold text-zinc-800 tracking-tight mb-4">Relax & Learn</h2>
        
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)" }}
          whileTap={{ scale: 0.99 }}
          onClick={() => handleSelectTool('dailytrivia')}
          className="bg-white border border-zinc-200 p-5 rounded-[2rem] flex items-center justify-between shadow-sm cursor-pointer transition-all gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-2xl border border-amber-500/15 shadow-inner select-none">
              💡
            </div>
            <div>
              <h3 className="font-black text-zinc-900 text-lg leading-tight">Daily Trivia Booster</h3>
              <p className="text-xs text-zinc-500 font-bold mt-0.5">Click to play and learn a cool fact!</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
            <ArrowRight className="w-4 h-4 text-zinc-400" />
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

