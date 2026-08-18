import React, { useState, useEffect } from 'react';
import { Lock, Coins, ArrowLeft, LogIn, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { getCoins, isUserLoggedIn, isProUser } from '../utils/coins';
import { auth } from '../lib/firebase';

interface LockedFeatureProps {
  cost: number;
  featureName: string;
  onBack: () => void;
  onEarnCoins: () => void;
  children: React.ReactNode;
}

export default function LockedFeature({
  cost,
  featureName,
  onBack,
  onEarnCoins,
  children
}: LockedFeatureProps) {
  const [loggedIn, setLoggedIn] = useState(() => isUserLoggedIn());
  const [coins, setCoins] = useState(() => getCoins());
  const [isPro, setIsPro] = useState(() => isProUser());

  // Listen to authentication changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setLoggedIn(!!user);
      setCoins(getCoins(user?.uid));
      setIsPro(isProUser());
    });
    return () => unsubscribe();
  }, []);

  // Listen to global coin updates
  useEffect(() => {
    const handleCoinsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (typeof customEvent.detail === 'number') {
        setCoins(customEvent.detail);
        setIsPro(isProUser());
      }
    };
    window.addEventListener('study-coins-updated', handleCoinsUpdate);
    return () => window.removeEventListener('study-coins-updated', handleCoinsUpdate);
  }, []);

  const hasAccess = isPro || (loggedIn && coins >= cost);

  if (hasAccess) {
    return <>{children}</>;
  }

  const triggerLoginModal = () => {
    window.dispatchEvent(new CustomEvent('open-login-modal'));
  };

  return (
    <div id="locked-feature-container" className="relative w-full h-full min-h-[400px] flex flex-col justify-between bg-[#FAF9F6] overflow-hidden">
      {/* Elegant static abstract background preview to make it look premium without mounting dynamic child states */}
      <div className="absolute inset-0 blur-[4px] opacity-20 pointer-events-none select-none overflow-hidden scale-95 origin-center p-8 space-y-6 flex flex-col justify-center">
        <div className="h-4 bg-zinc-400 rounded-full w-2/3" />
        <div className="space-y-3">
          <div className="h-3 bg-zinc-300 rounded-full w-full" />
          <div className="h-3 bg-zinc-300 rounded-full w-5/6" />
          <div className="h-3 bg-zinc-300 rounded-full w-4/5" />
        </div>
        <div className="h-32 bg-zinc-200 rounded-3xl w-full" />
        <div className="space-y-3">
          <div className="h-3 bg-zinc-300 rounded-full w-full" />
          <div className="h-3 bg-zinc-300 rounded-full w-3/4" />
        </div>
      </div>

      {/* Elegant minimalist navbar */}
      <div className="relative z-10 px-6 py-5 flex items-center justify-between border-b border-zinc-200/40 bg-[#FAF9F6]/80 backdrop-blur-md">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-extrabold text-zinc-400 text-xs tracking-widest uppercase">Premium Hub</span>
        <div className="w-10 h-10" /> {/* Spacer */}
      </div>

      {/* Lock Overlay Card */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="w-full max-w-sm bg-white border border-zinc-200/80 rounded-[2.5rem] p-8 shadow-[0_15px_40px_rgba(0,0,0,0.06)] flex flex-col items-center"
        >
          {/* Glowing Premium Icon */}
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 mb-6 relative">
            <Lock className="w-7 h-7" />
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="absolute inset-0 rounded-3xl bg-amber-500/5 -z-10"
            />
          </div>

          <h2 className="text-xl font-black text-zinc-900 tracking-tight">
            Unlock {featureName}
          </h2>
          
          <p className="text-xs font-semibold text-zinc-500 mt-2 leading-relaxed px-2">
            This premium AI helper requires an active daily limit or a Pro subscription to process your queries.
          </p>

          <div className="w-full bg-zinc-50 border border-zinc-200/40 rounded-2xl p-4 my-6 space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-bold">Required to Use</span>
              <div className="flex items-center gap-1.5 font-black text-zinc-900 bg-zinc-200/50 px-2.5 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
                <span>1 Daily Use</span>
              </div>
            </div>
            
            <div className="h-[1px] bg-zinc-200/60 w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-bold">Your Remaining Quota</span>
              <div className="flex items-center gap-1.5 font-black text-zinc-900 bg-zinc-200/50 px-2.5 py-1 rounded-full">
                <span className="text-zinc-600">Q</span>
                <span>{loggedIn ? `${coins} Left` : '0 (Not Logged In)'}</span>
              </div>
            </div>
          </div>

          {/* Call to action buttons */}
          <div className="w-full space-y-2.5">
            {!loggedIn ? (
              <button
                onClick={triggerLoginModal}
                className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-sm rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Sign In to access Free Quota
              </button>
            ) : (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-vip-modal'))}
                className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-sm rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
                Upgrade to PRO for Unlimited
              </button>
            )}
            
            <button
              onClick={onBack}
              className="w-full py-3.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-extrabold text-sm rounded-2xl transition-all active:scale-95"
            >
              Go Back
            </button>
          </div>
        </motion.div>
      </div>

      {/* Decorative clean footer */}
      <div className="relative z-10 py-4 text-center text-[10px] text-zinc-400 font-bold">
        HelpYou AI Zero-Trust Security Shield Active
      </div>
    </div>
  );
}
