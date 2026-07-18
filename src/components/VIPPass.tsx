import React from 'react';
import { X, Check, X as CloseIcon, Zap, Sparkles, Shield, Battery, Globe, GraduationCap, Award, Crown } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';

interface ComparePoint {
  feature: string;
  desc: string;
  icon: React.ReactNode;
  usValue: string;
  themValue: string;
}

export default function VIPPass({ isVip, onUpgrade, onClose }: { isVip: boolean, onUpgrade: () => void, onClose: () => void }) {
  
  const comparisonData: ComparePoint[] = [
    {
      feature: "Engine Power",
      desc: "Core intelligence and speed",
      icon: <Zap className="w-4 h-4 text-purple-400" />,
      usValue: "Ultra-Fast (Gemini 3.5 Flash)",
      themValue: "Standard/Slower Models"
    },
    {
      feature: "Scan Tech",
      desc: "Document and math scanning precision",
      icon: <Sparkles className="w-4 h-4 text-purple-400" />,
      usValue: "Instant Precision Scan",
      themValue: "Often Blurry/Inaccurate"
    },
    {
      feature: "Step-by-Step",
      desc: "Detailed problem explanations",
      icon: <GraduationCap className="w-4 h-4 text-purple-400" />,
      usValue: "Interactive Tappable Steps",
      themValue: "Static Text Blocks Only"
    },
    {
      feature: "Privacy First",
      desc: "Storage and photo handling",
      icon: <Shield className="w-4 h-4 text-purple-400" />,
      usValue: "Instant Photo Deletion",
      themValue: "Data Persistent/Tracking"
    },
    {
      feature: "Battery Usage",
      desc: "Resource optimization",
      icon: <Battery className="w-4 h-4 text-purple-400" />,
      usValue: "0% Background Drain",
      themValue: "Constant Resource Drain"
    },
    {
      feature: "Language",
      desc: "Multilingual handwriting & voice support",
      icon: <Globe className="w-4 h-4 text-purple-400" />,
      usValue: "Global Native Detection",
      themValue: "English Only"
    },
    {
      feature: "Exam Hacks",
      desc: "Advanced memory aids & tips",
      icon: <Award className="w-4 h-4 text-purple-400" />,
      usValue: "Smart Memory Tricks",
      themValue: "Generic Textbook Solutions"
    },
    {
      feature: "UX Experience",
      desc: "Overall UI speed and responsiveness",
      icon: <Crown className="w-4 h-4 text-purple-400" />,
      usValue: "Zero-Lag Performance",
      themValue: "Cluttered & Slower Load Times"
    }
  ];

  if (isVip) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center text-zinc-100 bg-zinc-950 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-72 h-72 bg-purple-500/10 rounded-full blur-[80px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />
        
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-gradient-to-tr from-yellow-400 to-amber-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-amber-500/20 z-10 animate-bounce"
        >
          <Crown className="w-12 h-12 text-zinc-950 fill-zinc-950" />
        </motion.div>
        <h2 className="text-3xl font-black mb-2 bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent z-10">PRO Status Active!</h2>
        <p className="text-zinc-400 font-semibold max-w-[280px] z-10">You are experiencing extreme study dominance with unlocked features.</p>
        
        <button 
          onClick={onClose} 
          className="mt-8 px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-bold text-sm border border-zinc-700 transition-all active:scale-95 cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 relative overflow-hidden font-sans">
      {/* Background Neon Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-20%] w-80 h-80 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Header */}
      <div className="p-6 pb-2 flex items-center justify-between border-b border-zinc-900 z-20 bg-zinc-950/80 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-600/20 flex items-center justify-center border border-purple-500/30">
            <Crown className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-sm font-black uppercase tracking-wider bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">HelpYou AI PRO</span>
        </div>
        <button 
          onClick={() => { triggerVibration(10); onClose(); }} 
          className="w-9 h-9 bg-zinc-900 hover:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 border border-zinc-800 transition-colors cursor-pointer"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-32 z-10 max-w-md mx-auto w-full space-y-6">
        
        {/* Pitch Headings */}
        <div className="text-center space-y-2 px-2">
          <span className="text-[10px] uppercase tracking-widest font-extrabold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
            COMPARE & CHOOSE EXCELLENCE
          </span>
          <h2 className="text-2xl font-black tracking-tight text-white mt-3">
            Why Hundreds of Thousands Choose <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">HelpYou AI</span>
          </h2>
          <p className="text-xs text-zinc-400 font-medium">
            An unmatched suite built for absolute grade elevation.
          </p>
        </div>

        {/* The Table */}
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md overflow-hidden shadow-2xl">
          
          {/* Table Header Row */}
          <div className="grid grid-cols-12 border-b border-zinc-800 bg-zinc-900/60 py-4 px-4 text-center items-center">
            <div className="col-span-4 text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Features</span>
            </div>
            <div className="col-span-5 relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full blur-[6px] opacity-40 animate-pulse" />
              <span className="relative inline-block text-[11px] font-black uppercase tracking-widest text-purple-400 bg-purple-950/80 px-2.5 py-1 rounded-full border border-purple-500/30">
                HelpYou AI ⚡
              </span>
            </div>
            <div className="col-span-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Other Apps</span>
            </div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-zinc-900">
            {comparisonData.map((item, index) => (
              <div key={index} className="grid grid-cols-12 py-3.5 px-4 items-center hover:bg-zinc-900/20 transition-all">
                
                {/* Feature Description column */}
                <div className="col-span-4 pr-1 text-left">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {item.icon}
                    <span className="text-xs font-bold text-zinc-200">{item.feature}</span>
                  </div>
                  <span className="text-[9px] text-zinc-500 font-semibold block leading-normal leading-snug">
                    {item.desc}
                  </span>
                </div>

                {/* HelpYou AI column */}
                <div className="col-span-5 px-1 bg-purple-950/20 border-l border-r border-purple-900/30 py-1 rounded-xl text-center flex flex-col items-center justify-center gap-1 min-h-[52px]">
                  <div className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                    <Check className="w-3 h-3 text-purple-400 stroke-[3]" />
                  </div>
                  <span className="text-[10px] font-extrabold text-purple-300 leading-tight">
                    {item.usValue}
                  </span>
                </div>

                {/* Other Apps column */}
                <div className="col-span-3 text-center flex flex-col items-center justify-center gap-1">
                  <span className="text-zinc-600 text-[10px] font-black">❌</span>
                  <span className="text-[9px] font-semibold text-zinc-500 leading-tight">
                    {item.themValue}
                  </span>
                </div>

              </div>
            ))}
          </div>

          {/* Bottom Trust Row */}
          <div className="bg-zinc-900/80 p-3 text-center border-t border-zinc-800">
            <span className="text-[9px] font-bold text-zinc-400 tracking-wide flex items-center justify-center gap-1.5">
              🛡️ All private student data is fully encrypted with zero logs kept.
            </span>
          </div>

        </div>

        {/* Small Feature Extra List */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="bg-zinc-900/30 border border-zinc-800/60 p-3.5 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-sm">
              ⚡
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200">Instant Access</h4>
              <p className="text-[9px] text-zinc-500 font-semibold">Ready in 0.2s</p>
            </div>
          </div>
          <div className="bg-zinc-900/30 border border-zinc-800/60 p-3.5 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 text-sm">
              ✨
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200">No Ads Ever</h4>
              <p className="text-[9px] text-zinc-500 font-semibold">Uninterrupted learning</p>
            </div>
          </div>
        </div>

      </div>

      {/* Sticky Bottom Action Bar with full-width action button */}
      <div className="absolute bottom-0 inset-x-0 p-4 border-t border-zinc-900 bg-zinc-950/90 backdrop-blur-lg z-20 flex flex-col items-center justify-end max-w-md mx-auto">
        <div className="w-full text-center mb-3">
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
            🔥 FLASH SALE ACTIVE: SAVE 60%
          </span>
        </div>
        <button 
          onClick={() => {
            triggerVibration(20);
            onUpgrade();
          }}
          className="w-full relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-500 text-white py-4 px-6 rounded-2xl font-black text-sm tracking-wide shadow-[0_15px_30px_rgba(124,58,237,0.3)] hover:shadow-[0_20px_40px_rgba(124,58,237,0.5)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-purple-400/30 cursor-pointer group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
          <span>GET STARTED — UNLOCK ALL PRO BENEFITS</span>
        </button>
        <p className="text-[9px] text-zinc-500 text-center mt-3 font-semibold max-w-[280px]">
          By upgrading, you gain instant premium privileges. Cancel anytime instantly.
        </p>
      </div>
    </div>
  );
}
