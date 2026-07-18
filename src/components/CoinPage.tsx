import React, { useState, useEffect } from 'react';
import { ArrowLeft, History, Check, Sparkles, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getCoins, getCoinHistory, isUserLoggedIn, isProUser, Transaction } from '../utils/coins';

interface CoinPageProps {
  onClose: () => void;
  onSelectTool: (tool: string) => void;
}

export default function CoinPage({ onClose, onSelectTool }: CoinPageProps) {
  const loggedIn = isUserLoggedIn();
  const isPro = isProUser();

  const [coins, setCoins] = useState(() => {
    return getCoins();
  });

  const [history, setHistory] = useState<Transaction[]>(() => {
    return getCoinHistory();
  });

  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Sync state on global update events
  useEffect(() => {
    const handleCoinsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (typeof customEvent.detail === 'number') {
        setCoins(customEvent.detail);
        setHistory(getCoinHistory());
      }
    };
    window.addEventListener('study-coins-updated', handleCoinsUpdate);
    return () => window.removeEventListener('study-coins-updated', handleCoinsUpdate);
  }, []);

  return (
    <div className="absolute inset-0 bg-[#FAF9F6] text-zinc-900 font-sans z-50 flex flex-col overflow-y-auto pb-6">
      
      {/* Top Navbar */}
      <header className="px-6 py-5 bg-[#FAF9F6] flex justify-between items-center sticky top-0 z-10 border-b border-zinc-200/40">
        <button 
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-black text-sm tracking-tight uppercase text-zinc-400">Daily Free Limits</h2>
        <button 
          onClick={() => setShowHistoryModal(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-transform"
        >
          <History className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content View */}
      <div className="px-6 pt-4 flex-1">
        
        {isPro ? (
           <div className="bg-gradient-to-tr from-amber-400 to-orange-500 rounded-[2.5rem] p-8 mb-8 text-white shadow-xl shadow-amber-500/20">
             <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                   <Crown className="w-8 h-8 text-white fill-white" />
                </div>
                <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Active Plan</span>
             </div>
             <h3 className="text-3xl font-black mb-2">Unlimited Access</h3>
             <p className="text-sm font-bold opacity-90 leading-relaxed">
               As a PRO member, you have bypassed all daily free limits. Enjoy unrestricted AI-powered learning across all subjects.
             </p>
           </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center mb-8 pt-4">
              <div className="relative mb-6">
                <div className="absolute -inset-4 rounded-full bg-zinc-200/50 blur-2xl" />
                <div className="w-32 h-32 rounded-full bg-white border-2 border-zinc-900 flex items-center justify-center shadow-xl relative z-10">
                  <span className="text-6xl font-black text-zinc-900">{coins}</span>
                </div>
              </div>
              <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Daily Free Interactions</h1>
              <p className="text-zinc-500 font-bold text-sm mt-2 max-w-[240px]">
                Remaining free usage for today. Limits reset every 24 hours.
              </p>
            </div>

            {/* Upgrade CTA */}
            <div className="bg-white border border-zinc-200/80 shadow-sm rounded-[2.5rem] p-8 mb-8 text-center">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mx-auto mb-4">
                <Sparkles className="w-6 h-6 fill-amber-500" />
              </div>
              <h2 className="text-xl font-black text-zinc-900 tracking-tight mb-2">Remove All Limits</h2>
              <p className="text-xs text-zinc-500 font-bold leading-relaxed mb-6">
                Stop counting interactions. Upgrade to Pro for zero friction and unlimited AI processing.
              </p>
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('open-vip-modal'))}
                className="w-full py-4 rounded-2xl bg-zinc-950 text-white font-black text-sm tracking-tight shadow-lg shadow-zinc-950/20 active:scale-[0.98] transition-all"
              >
                Upgrade to PRO Member
              </button>
            </div>

            <div className="bg-zinc-50 border border-zinc-200/60 rounded-3xl p-6">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">How it works</h4>
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-zinc-600 stroke-[3]" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-600 leading-normal">Free users get 3 AI interactions daily across all tools.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-zinc-600 stroke-[3]" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-600 leading-normal">Quota resets automatically at midnight every day.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-zinc-600 stroke-[3]" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-600 leading-normal">Pro users bypass this limit entirely for unlimited learning.</p>
                </li>
              </ul>
            </div>
          </>
        )}

      </div>

      {/* Modal: History of interactions */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-sm flex items-end">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="bg-white w-full rounded-t-[2.5rem] border-t border-zinc-200 flex flex-col max-h-[80vh]"
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-black text-zinc-900">Interaction History</h3>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto p-6 flex-1 space-y-3 pb-12">
                {history.length === 0 ? (
                  <p className="text-center text-zinc-400 font-semibold py-8">No interaction logs yet</p>
                ) : (
                  history.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3.5 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <div>
                        <h4 className="font-bold text-sm text-zinc-800">{tx.label}</h4>
                        <span className="text-[10px] text-zinc-400 font-semibold">{tx.timestamp}</span>
                      </div>
                      <span className="font-black text-zinc-700 text-xs">-1 Quota</span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
