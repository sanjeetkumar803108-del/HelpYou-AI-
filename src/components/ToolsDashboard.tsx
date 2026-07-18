import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, BookOpen, Layers, Youtube, FileText, FileImage, Wand2, ChevronDown, ChevronUp, Calculator, UserCircle, Search, Lock, Brain, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { getCoins, isUserLoggedIn } from '../utils/coins';
import { useSettings } from '../hooks/useSettings';
import { db } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import SavedItemViewer from './SavedItemViewer';

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
  'quizgenerator': 2,
  'flashcardgenerator': 2,
  'contentgenerator': 1,
  'notemaker': 2,
  'essaygrader': 1,
  'youtubesummarizer': 1,
  'grammar': 1,
  'summariser': 1,
  'calculator': 0,
  'image2pdf': 0,
  'livetutorsearch': 0
};

export default function ToolsDashboard({ 
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
  const [selectedSavedItem, setSelectedSavedItem] = useState<any | null>(null);
  const [showToastMessage, setShowToastMessage] = useState<string | null>(null);

  const handleDeleteSavedItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'pocket_items', id));
      setShowToastMessage("🗑️ Saved item deleted successfully!");
      setTimeout(() => setShowToastMessage(null), 3000);
    } catch (error) {
      console.error("Error deleting pocket item: ", error);
      alert("Failed to delete the saved item.");
    }
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

  return (
    <div className="w-full p-6 h-full flex flex-col text-zinc-900 bg-gradient-to-b from-[#F9FBE7]/15 via-[#FAF9F6] to-[#FAF9F6] overflow-y-auto relative font-sans">
      
      {/* Top Header Mockup Bar */}
      <div className="flex items-center justify-between mb-8">
        {/* Coin Balance Pill / PRO Badge */}
        {loggedIn && !deepFocus ? (
          isVip ? (
            <div className="bg-gradient-to-tr from-amber-400 to-orange-500 rounded-full h-[38px] px-4 flex items-center gap-2 shadow-lg shadow-amber-500/20 border border-amber-300">
              <Crown className="w-4 h-4 text-white fill-white" />
              <span className="font-black text-white text-[11px] uppercase tracking-wider">PRO MEMBER</span>
            </div>
          ) : (
            <button 
              onClick={() => handleSelectTool('coinpage')}
              className="relative bg-white border border-zinc-200/80 shadow-sm rounded-full h-[38px] px-3.5 flex items-center gap-1.5 hover:bg-zinc-50 active:scale-95 transition-all group"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-900 flex items-center justify-center text-white text-[10px] font-black shadow-sm">
                Q
              </div>
              <span className="font-black text-zinc-700 text-xs uppercase tracking-wider">Free Limits: {coins}</span>
            </button>
          )
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          {!isVip && (
            <button 
              onClick={() => {
                triggerVibration(15);
                if (onOpenVip) {
                  onOpenVip();
                } else {
                  window.dispatchEvent(new CustomEvent('open-vip-modal'));
                }
              }}
              className="bg-[#121212] hover:bg-zinc-800 active:scale-95 text-white font-extrabold text-xs h-[38px] px-5 rounded-full transition-all shadow-sm cursor-pointer"
            >
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
          className="grid grid-cols-2 gap-4"
        >
          {/* Scan Feature Card */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('tab:scanner')}
            className="relative overflow-hidden bg-[#EBF5FF] border border-blue-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            {renderLockIndicator('tab:scanner')}
            <span className="text-4xl filter drop-shadow-sm select-none">📷</span>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Scan</h3>
          </motion.div>

          {/* Chat Feature Card */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('tab:aitutor')}
            className="relative overflow-hidden bg-[#F3E8FF] border border-purple-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            {renderLockIndicator('tab:aitutor')}
            <span className="text-4xl filter drop-shadow-sm select-none">💭</span>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Chat</h3>
          </motion.div>

          {/* Live Search Tutor Card */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.02, y: -4, boxShadow: "0 10px 25px -5px rgba(124, 58, 237, 0.25)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('livetutorsearch')}
            className="col-span-2 relative overflow-hidden bg-gradient-to-r from-purple-600 to-blue-600 border-none shadow-md rounded-[2rem] p-5 flex items-center justify-between cursor-pointer transition-all gap-4 text-white"
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
        </motion.div>
      </div>

      {/* More Tools Section */}
      <div className="mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-zinc-800 tracking-tight mb-4">More Tools</h2>
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-4"
        >
          {/* Card 1: Calculator */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('calculator')}
            className="bg-[#E6FFFA] border border-teal-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <Calculator className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Calculator</h3>
          </motion.div>

          {/* Card 2: AI Quizzes */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('quizgenerator')}
            className="relative overflow-hidden bg-[#FEFCBF] border border-yellow-300/50 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            {renderLockIndicator('quizgenerator')}
            <span className="text-4xl filter drop-shadow-sm select-none">📝</span>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">AI Quizzes</h3>
          </motion.div>

          {/* Card 3: AI Flashcards */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('flashcardgenerator')}
            className="relative overflow-hidden bg-[#FFE4E6] border border-pink-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            {renderLockIndicator('flashcardgenerator')}
            <span className="text-4xl filter drop-shadow-sm select-none">🪄</span>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">AI Flashcards</h3>
          </motion.div>

          {/* Card 4: Writing Helper */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('contentgenerator')}
            className="relative overflow-hidden bg-[#FFEDD5] border border-orange-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            {renderLockIndicator('contentgenerator')}
            <span className="text-4xl filter drop-shadow-sm select-none">🖍️</span>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Writing Helper</h3>
          </motion.div>

          {/* Card 5: Ask AI Tutor */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('callwithtutor')}
            className="bg-[#F0FDF4] border border-green-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            <span className="text-4xl filter drop-shadow-sm select-none">🧑‍🏫</span>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Ask AI Tutor</h3>
          </motion.div>

          {/* Card 6: Super Note-Maker */}
          <motion.div 
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTool('notemaker')}
            className="relative overflow-hidden bg-[#E0E7FF] border border-indigo-200/60 shadow-sm rounded-[2rem] p-6 flex flex-col justify-between aspect-[1.15/1] cursor-pointer transition-all"
          >
            {renderLockIndicator('notemaker')}
            <span className="text-4xl filter drop-shadow-sm select-none">📑</span>
            <h3 className="font-black text-zinc-900 text-[1.05rem] tracking-tight leading-none mb-1">Super Note-Maker</h3>
          </motion.div>
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
                  className="grid grid-cols-2 gap-4 pb-2"
                >
                  {/* Essay Grader */}
                  <motion.div 
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectTool('essaygrader')}
                    className="relative overflow-hidden bg-[#FFE4E6] border border-pink-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all"
                  >
                    {renderLockIndicator('essaygrader', "rounded-3xl")}
                    <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center text-xl shadow-sm select-none">
                      ⭐
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-zinc-800 leading-tight">AP Essay Grader</h4>
                      <p className="text-[10px] text-zinc-500 font-bold mt-0.5">Get grading & feedback</p>
                    </div>
                  </motion.div>

                  {/* Image to PDF */}
                  <motion.div 
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectTool('image2pdf')}
                    className="bg-[#EBF5FF] border border-blue-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all"
                  >
                    <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center text-xl shadow-sm select-none">
                      📄
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-zinc-800 leading-tight">Image to PDF</h4>
                      <p className="text-[10px] text-zinc-500 font-bold mt-0.5">Turn photos to PDF</p>
                    </div>
                  </motion.div>

                  {/* Grammar Enhancer */}
                  <motion.div 
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectTool('grammar')}
                    className="relative overflow-hidden bg-[#F0FDF4] border border-green-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all"
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

                  {/* Summariser */}
                  <motion.div 
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(0,0,0,0.06)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectTool('summariser')}
                    className="relative overflow-hidden bg-[#F3E8FF] border border-purple-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all"
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

                  {/* Mistake Vault */}
                  <motion.div 
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -4, boxShadow: "0 8px 20px -5px rgba(239, 68, 68, 0.08)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectTool('mistakevault')}
                    className="relative overflow-hidden bg-[#FEF2F2] border border-red-200/60 rounded-3xl p-5 flex flex-col justify-between min-h-[120px] cursor-pointer transition-all"
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

      {/* Saved Item Viewer Detail Modal */}
      <AnimatePresence>
        {selectedSavedItem && (
          <SavedItemViewer 
            item={selectedSavedItem}
            isVip={isVip}
            onClose={() => setSelectedSavedItem(null)}
            onDelete={handleDeleteSavedItem}
          />
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

