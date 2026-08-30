import React from 'react';
import { Check, X as CloseIcon, Zap, Sparkles, Shield, Globe, Crown } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';

export default function VIPPass({ isVip, onUpgrade, onClose }: { isVip: boolean, onUpgrade: () => void, onClose: () => void }) {

  if (isVip) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center text-zinc-900 bg-[#FAF9F6] relative overflow-hidden font-sans">
        <div className="absolute top-[-20%] left-[-10%] w-72 h-72 bg-amber-200/40 rounded-full blur-[80px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-purple-200/40 rounded-full blur-[80px]" />
        
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-gradient-to-tr from-amber-400 to-yellow-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-amber-500/20 z-10 animate-bounce"
        >
          <Crown className="w-12 h-12 text-white fill-white" />
        </motion.div>
        <h2 className="text-3xl font-black mb-2 text-zinc-900 z-10">PRO Status Active! ✨</h2>
        <p className="text-zinc-600 font-semibold max-w-[280px] z-10 text-sm">You have unlocked unlimited AI learning tools and priority assistance.</p>
        
        <button 
          onClick={onClose} 
          className="mt-8 px-8 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full font-black text-sm transition-all active:scale-95 cursor-pointer shadow-md"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#FAF9F6] text-zinc-900 relative overflow-hidden font-sans">
      {/* Background Soft Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-purple-200/50 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-20%] w-80 h-80 bg-amber-200/50 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Header */}
      <div className="p-5 pb-3 flex items-center justify-between border-b border-zinc-200/80 z-20 bg-[#FAF9F6]/90 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center border border-purple-200">
            <Crown className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-sm font-black uppercase tracking-wider text-purple-700">HelpYou AI PRO</span>
        </div>
        <button 
          onClick={() => { triggerVibration(10); onClose(); }} 
          className="w-9 h-9 bg-white hover:bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 border border-zinc-200 transition-colors shadow-sm cursor-pointer"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-36 z-10 max-w-md mx-auto w-full space-y-6">
        
        {/* Pitch Headings */}
        <div className="text-center space-y-2 px-2">
          <span className="text-[10px] uppercase tracking-widest font-extrabold text-purple-700 bg-purple-100 px-3 py-1 rounded-full border border-purple-200 inline-block">
            ⚡ UNLIMITED AI STUDY ACCESS
          </span>
          <h2 className="text-2xl font-black tracking-tight text-zinc-900 mt-3">
            Unlock Full Academic Power with <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">HelpYou AI PRO</span>
          </h2>
          <p className="text-xs text-zinc-600 font-medium">
            Get instant solutions, live web search, writing enhancements, and unlimited revision cards.
          </p>
        </div>

        {/* PRO Benefits Cards */}
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-white border border-zinc-200/90 p-4 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 font-bold shrink-0 text-lg">
              ⚡
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-900">Ultra-Fast AI Engine</h4>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">Instant problem solutions with step-by-step breakdowns.</p>
            </div>
          </div>

          <div className="bg-white border border-zinc-200/90 p-4 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold shrink-0 text-lg">
              🔍
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-900">Live Deep Search AI</h4>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">Real-time academic search grounded with live web search facts.</p>
            </div>
          </div>

          <div className="bg-white border border-zinc-200/90 p-4 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold shrink-0 text-lg">
              ✍️
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-900">Grammar & Active Flashcards</h4>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">Polish writing flow and auto-track memory mistakes with flashcards.</p>
            </div>
          </div>
        </div>

        {/* Small Feature Extra List */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-white border border-zinc-200/80 p-3.5 rounded-2xl flex items-center gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-sm font-bold">
              ⚡
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-800">Instant Access</h4>
              <p className="text-[9px] text-zinc-500 font-semibold">Ready in 0.2s</p>
            </div>
          </div>
          <div className="bg-white border border-zinc-200/80 p-3.5 rounded-2xl flex items-center gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 text-sm font-bold">
              ✨
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-800">No Ads Ever</h4>
              <p className="text-[9px] text-zinc-500 font-semibold">Uninterrupted learning</p>
            </div>
          </div>
        </div>

      </div>

      {/* Sticky Bottom Action Bar with full-width action button */}
      <div className="absolute bottom-0 inset-x-0 p-4 border-t border-zinc-200 bg-[#FAF9F6]/95 backdrop-blur-lg z-20 flex flex-col items-center justify-end max-w-md mx-auto">
        <div className="w-full text-center mb-2.5">
          <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest bg-amber-100 px-3 py-1 rounded-full border border-amber-300 inline-block shadow-xs">
            🔥 FLASH SALE ACTIVE: SAVE 60%
          </span>
        </div>
        <button 
          onClick={() => {
            triggerVibration(20);
            onUpgrade();
          }}
          className="w-full relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white py-4 px-6 rounded-2xl font-black text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-purple-500/30 cursor-pointer group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
          <span>GET STARTED — UNLOCK ALL PRO BENEFITS</span>
        </button>
        <p className="text-[9px] text-zinc-500 text-center mt-2.5 font-semibold max-w-[280px]">
          Instant activation. Cancel anytime easily.
        </p>
      </div>
    </div>
  );
}
