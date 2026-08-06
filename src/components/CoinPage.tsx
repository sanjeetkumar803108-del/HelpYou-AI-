import React, { useState, useEffect } from 'react';
import { ArrowLeft, History, Check, Sparkles, Crown, Gift, Coins, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getCoins, getCoinHistory, isUserLoggedIn, isProUser, addCoins, Transaction } from '../utils/coins';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { triggerVibration } from '../utils/vibrate';
import { auth } from '../lib/firebase';

interface CoinPageProps {
  onClose: () => void;
  onSelectTool: (tool: string) => void;
  isVip?: boolean;
}

export default function CoinPage({ onClose, onSelectTool, isVip: propIsVip }: CoinPageProps) {
  const loggedIn = isUserLoggedIn();
  const [isPro, setIsPro] = useState(() => {
    return propIsVip !== undefined ? propIsVip : isProUser();
  });

  const [coins, setCoins] = useState(() => {
    return getCoins();
  });

  const [history, setHistory] = useState<Transaction[]>(() => {
    return getCoinHistory();
  });

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showClaimSuccess, setShowClaimSuccess] = useState(false);

  // Daily Login Reward Claim state
  const todayStr = new Date().toDateString();
  const claimKey = loggedIn && auth.currentUser ? `study_last_coin_claim_${auth.currentUser.uid}` : 'study_last_coin_claim_guest';
  
  const [isClaimedToday, setIsClaimedToday] = useState(() => {
    const lastClaim = safeGetItem(claimKey);
    return lastClaim === todayStr;
  });

  // Sync state on global update events
  useEffect(() => {
    const handleCoinsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (typeof customEvent.detail === 'number') {
        setCoins(customEvent.detail);
        setHistory(getCoinHistory());
      }
    };
    const handleVipUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsPro(customEvent.detail === true);
    };

    window.addEventListener('study-coins-updated', handleCoinsUpdate);
    window.addEventListener('study-vip-updated', handleVipUpdated);
    return () => {
      window.removeEventListener('study-coins-updated', handleCoinsUpdate);
      window.removeEventListener('study-vip-updated', handleVipUpdated);
    };
  }, []);

  useEffect(() => {
    if (propIsVip !== undefined) {
      setIsPro(propIsVip);
    }
  }, [propIsVip]);

  const handleClaimReward = () => {
    if (isClaimedToday || isPro) return;

    triggerVibration(25);
    addCoins(2, 'Daily Login Reward');
    safeSetItem(claimKey, todayStr);
    setIsClaimedToday(true);
    setShowClaimSuccess(true);
    
    setTimeout(() => {
      setShowClaimSuccess(false);
    }, 3000);
  };

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
        <h2 className="font-black text-sm tracking-tight uppercase text-zinc-400">Coins & Rewards</h2>
        <button 
          onClick={() => {
            triggerVibration(15);
            setShowHistoryModal(true);
          }}
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
              <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">PRO Active</span>
            </div>
            <h3 className="text-3xl font-black mb-2">Unlimited Coins</h3>
            <p className="text-sm font-bold opacity-90 leading-relaxed">
              As a PRO member, you have bypass limits! Use any tool or chat as much as you want without counting coins.
            </p>
          </div>
        ) : (
          <>
            {/* Coins Balance Visualization */}
            <div className="flex flex-col items-center text-center mb-8 pt-4">
              <div className="relative mb-4">
                <div className="absolute -inset-4 rounded-full bg-amber-200/40 blur-2xl" />
                <div className="w-32 h-32 rounded-full bg-white border-2 border-zinc-900 flex flex-col items-center justify-center shadow-xl relative z-10">
                  <Coins className="w-8 h-8 text-amber-500 mb-1 fill-amber-100" />
                  <span className="text-4xl font-black text-zinc-900 leading-none">{coins}</span>
                </div>
              </div>
              <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Your Study Coins</h1>
              <p className="text-zinc-500 font-bold text-sm mt-1">
                Refill by claiming rewards daily!
              </p>
            </div>

            {/* Daily Reward Claim Card */}
            <div className="bg-white border border-zinc-200/80 shadow-sm rounded-[2.25rem] p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                  <Gift className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-900 text-base">Daily App Login Reward</h3>
                  <p className="text-xs text-zinc-500 font-bold">Get free study coins every single day!</p>
                </div>
              </div>

              {isClaimedToday ? (
                <div className="w-full py-4 rounded-2xl bg-zinc-50 text-zinc-400 font-bold text-sm flex items-center justify-center gap-2 border border-zinc-200/60 cursor-not-allowed">
                  <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />
                  Claimed Today (+2 Coins)
                </div>
              ) : (
                <button 
                  onClick={handleClaimReward}
                  className="w-full py-4 rounded-2xl bg-zinc-950 text-white font-black text-sm tracking-tight shadow-md hover:bg-zinc-900 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Claim Daily Reward (+2 Coins)
                </button>
              )}

              <AnimatePresence>
                {showClaimSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-center text-xs font-bold text-emerald-600 mt-3"
                  >
                    🎉 +2 Coins added to your balance!
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Upgrade Pro Block */}
            <div className="bg-[#121212] rounded-[2.25rem] p-6 mb-6 text-white text-center relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-xl" />
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-amber-400 mx-auto mb-3">
                <Sparkles className="w-5 h-5 fill-amber-400" />
              </div>
              <h2 className="text-lg font-black tracking-tight mb-1">Remove All Limits</h2>
              <p className="text-[11px] text-zinc-400 font-bold leading-relaxed mb-4 max-w-xs mx-auto">
                Stop counting coins. Upgrade to PRO for zero friction and completely unlimited AI learning power.
              </p>
              <button 
                onClick={() => {
                  triggerVibration(15);
                  window.dispatchEvent(new CustomEvent('open-vip-modal'));
                }}
                className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs tracking-wider uppercase transition-all"
              >
                Go Unlimited PRO
              </button>
            </div>

            {/* How it works info list */}
            <div className="bg-zinc-50 border border-zinc-200/60 rounded-3xl p-6">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">How it works</h4>
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-zinc-600 stroke-[3]" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-600 leading-normal">
                    Free users can claim 2 Coins daily by logging into the app.
                  </p>
                </li>
                <li className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-zinc-600 stroke-[3]" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-600 leading-normal">
                    Each AI tool request or tutor query consumes exactly 1 Coin.
                  </p>
                </li>
                <li className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-zinc-600 stroke-[3]" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-600 leading-normal">
                    Pro users bypass the coin system entirely for complete study freedom.
                  </p>
                </li>
              </ul>
            </div>
          </>
        )}

      </div>

      {/* Modal: History of transactions */}
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
                <h3 className="text-lg font-black text-zinc-900">Coin Activity History</h3>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto p-6 flex-1 space-y-3 pb-12">
                {history.length === 0 ? (
                  <p className="text-center text-zinc-400 font-semibold py-8">No coin transactions yet</p>
                ) : (
                  history.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3.5 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <div>
                        <h4 className="font-bold text-sm text-zinc-800">{tx.label}</h4>
                        <span className="text-[10px] text-zinc-400 font-semibold">{tx.timestamp}</span>
                      </div>
                      <span className={`font-black text-xs ${tx.amount > 0 ? 'text-emerald-600' : 'text-zinc-700'}`}>
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Coins
                      </span>
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
