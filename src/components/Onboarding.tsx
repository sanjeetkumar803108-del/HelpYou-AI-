import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Sparkles, Languages, Globe, Shield, Check, X, ArrowRight, ChevronRight, Scale, GraduationCap, Star, PiggyBank } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeSetItem } from '../utils/storage';
import { auth } from '../lib/firebase';

interface OnboardingProps {
  onComplete: () => void;
}

// Seamless, looping 3-phase demonstration animation for Step 1
function SnapScanSolveDemo() {
  const [phase, setPhase] = useState<'snap' | 'scan' | 'solve'>('snap');

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(prev => {
        if (prev === 'snap') return 'scan';
        if (prev === 'scan') return 'solve';
        return 'snap';
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-64 h-64 mb-6 flex items-center justify-center bg-zinc-50 border border-zinc-150 rounded-[2.5rem] p-4 shadow-sm overflow-hidden select-none">
      {/* Corner borders for camera/viewfinder overlay (visible in snap and scan) */}
      <AnimatePresence>
        {(phase === 'snap' || phase === 'scan') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-4 pointer-events-none z-10"
          >
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-purple-500 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-purple-500 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-purple-500 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-purple-500 rounded-br-xl" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'snap' && (
          <motion.div
            key="snap-view"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full h-full flex flex-col justify-center items-center p-4 text-center relative"
          >
            {/* Handwritten style physics problem inside viewfinder */}
            <div className="bg-amber-50/60 border border-dashed border-amber-200 p-4 rounded-2xl shadow-inner max-w-full">
              <span className="text-[10px] font-black tracking-wider text-amber-600 uppercase block mb-1">📝 Physics Q</span>
              <p className="font-serif italic text-[11px] text-zinc-700 leading-relaxed font-semibold">
                "Find the displacement of a particle moving with velocity v = t² - 4t m/s from t = 0 to t = 3s."
              </p>
            </div>
            
            {/* Shutter blink flash effect */}
            <motion.div 
              className="absolute inset-0 bg-white"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />

            {/* Cute shutter capture ring */}
            <div className="absolute bottom-1.5 w-6 h-6 rounded-full border-2 border-purple-500/40 flex items-center justify-center">
              <div className="w-3.5 h-3.5 rounded-full bg-purple-500 animate-pulse" />
            </div>
          </motion.div>
        )}

        {phase === 'scan' && (
          <motion.div
            key="scan-view"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex flex-col justify-center items-center p-4 text-center relative"
          >
            {/* Same problem but dimmed with laser sweep */}
            <div className="bg-amber-50/60 border border-dashed border-amber-200 p-4 rounded-2xl shadow-inner max-w-full opacity-60">
              <span className="text-[10px] font-black tracking-wider text-amber-600 uppercase block mb-1">📝 Physics Q</span>
              <p className="font-serif italic text-[11px] text-zinc-700 leading-relaxed font-semibold">
                "Find the displacement of a particle moving with velocity v = t² - 4t m/s from t = 0 to t = 3s."
              </p>
            </div>

            {/* Scanning glowing laser line */}
            <motion.div 
              className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent shadow-[0_0_12px_rgba(168,85,247,0.9)] z-10"
              animate={{ top: ['15%', '85%', '15%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Glowing sparkle badge */}
            <div className="absolute top-2 right-2 bg-purple-500 p-1.5 rounded-lg text-white animate-bounce">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </motion.div>
        )}

        {phase === 'solve' && (
          <motion.div
            key="solve-view"
            initial={{ y: 50, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="w-full h-full flex flex-col justify-between p-3 bg-white border border-zinc-150 rounded-3xl shadow-lg z-20"
          >
            {/* Header of the Solved Card */}
            <div className="flex items-center justify-between border-b border-zinc-100 pb-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black uppercase text-purple-600 tracking-widest">AI SOLVER</span>
              </div>
              <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-200/55 px-2 py-0.5 rounded-full font-black">SOLVED</span>
            </div>

            {/* Step-by-Step Steps Card */}
            <div className="flex-1 space-y-1.5 py-1.5 text-left overflow-y-auto">
              <div className="bg-purple-50/40 border border-purple-100/50 px-2 py-1.5 rounded-xl">
                <p className="text-[9px] font-black text-purple-700 uppercase tracking-wide">Step 1: Formula 📐</p>
                <p className="text-[9px] font-semibold text-zinc-600 mt-0.5">
                  Displacement s = ∫ v dt
                </p>
              </div>
              <div className="bg-zinc-50 border border-zinc-150 px-2 py-1.5 rounded-xl">
                <p className="text-[9px] font-black text-zinc-700 uppercase tracking-wide">Step 2: Integration ✍️</p>
                <p className="text-[9px] font-semibold text-zinc-600 mt-0.5">
                  ∫(t² - 4t) dt = [t³/3 - 2t²]
                </p>
              </div>
              <div className="bg-zinc-50 border border-zinc-150 px-2 py-1.5 rounded-xl">
                <p className="text-[9px] font-black text-zinc-700 uppercase tracking-wide">Step 3: Answer ⭐</p>
                <p className="text-[9px] font-bold text-zinc-800 mt-0.5">
                  Displacement = <span className="text-purple-600 font-extrabold">-9m</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for left, 1 for right

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  // Track swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && carouselIndex < 3) {
      setDirection(1);
      setCarouselIndex(prev => prev + 1);
      triggerVibration(15);
    } else if (isRightSwipe && carouselIndex > 0) {
      setDirection(-1);
      setCarouselIndex(prev => prev - 1);
      triggerVibration(15);
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const handleNext = () => {
    if (carouselIndex < 3) {
      setDirection(1);
      setCarouselIndex(prev => prev + 1);
      triggerVibration(15);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    triggerVibration(10);
    handleComplete();
  };

  const handleComplete = () => {
    triggerVibration(20);
    safeSetItem('onboarding_completed', 'true');
    if (auth.currentUser) {
      safeSetItem(`onboarding_completed_${auth.currentUser.uid}`, 'true');
    }
    onComplete();
  };

  const handleGetStarted = () => {
    handleComplete();
  };

  const carouselItems = [
    {
      title: "Snap. Learn. Master.",
      subtitle: "Instantly scan complex Physics, Chemistry, Biology, or Math problems and watch the AI generate detailed, step-by-step explanations in seconds.",
      visual: <SnapScanSolveDemo />
    },
    {
      title: "Learning in Your Native Voice",
      subtitle: "Our smart AI Tutor automatically detects your language. Whether you ask in Hindi, Hinglish, or English, get crystal-clear answers in the exact language you understand best.",
      visual: (
        <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
          {/* Subtle glow background */}
          <div className="absolute inset-0 bg-radial from-indigo-500/10 to-transparent rounded-full blur-2xl" />
          
          {/* Student chat bubble - light mode styled */}
          <motion.div
            className="absolute top-4 left-1 bg-zinc-100 border border-zinc-200/80 p-3 rounded-2xl rounded-tl-sm shadow-md max-w-[150px] text-zinc-800"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-0.5">Student</p>
            <p className="text-[11px] text-zinc-800 font-bold leading-normal">Explain photosynthesis in Hindi? 🤔</p>
          </motion.div>

          {/* AI polyglot answer bubble */}
          <motion.div
            className="absolute bottom-4 right-1 bg-gradient-to-tr from-purple-600 to-indigo-600 p-3.5 rounded-3xl rounded-br-sm shadow-xl max-w-[170px] border border-purple-500/30"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Languages className="w-3.5 h-3.5 text-purple-200" />
              <span className="text-[8px] font-black text-purple-100 uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded-md">Hindi Voice</span>
            </div>
            <p className="text-[11px] text-white font-black leading-snug">प्रकाश-संश्लेषण वह प्रक्रिया है...</p>
          </motion.div>

          {/* Core spinning globe center icon */}
          <motion.div
            className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-3xl shadow-lg flex items-center justify-center border border-indigo-400/20 z-10 text-white"
            animate={{ rotate: 360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          >
            <Globe className="w-8 h-8" />
          </motion.div>
        </div>
      )
    },
    {
      title: "Elite Tutoring, Unbeatable Pricing",
      subtitle: "Get personalized 1-on-1 tutoring at less than 1% of the cost of traditional physical tutors. No hidden fees. Pure, unlimited learning power.",
      visual: (
        <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
          {/* Subtle amber glow background */}
          <div className="absolute inset-0 bg-radial from-amber-500/10 to-transparent rounded-full blur-2xl" />

          {/* Minimalist piggy bank/vault with stars */}
          <motion.div
            className="relative w-28 h-28 bg-gradient-to-b from-white to-zinc-50 border-2 border-zinc-200/80 rounded-3xl flex items-center justify-center shadow-lg"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Pulsing glow ring */}
            <motion.div 
              className="absolute inset-0 border border-amber-500/30 rounded-3xl"
              animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0, 0.8] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            />
            
            <PiggyBank className="w-14 h-14 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.2)]" />
            
            {/* Floating graduation hat overlay */}
            <motion.div
              className="absolute -top-3 -right-3 bg-amber-500 p-2.5 rounded-2xl shadow-md border-2 border-white flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, 5, -5, 0] }}
              transition={{
                scale: { type: 'spring', stiffness: 220, damping: 15, delay: 0.4 },
                rotate: { type: 'tween', ease: 'easeInOut', duration: 4, repeat: Infinity }
              }}
            >
              <GraduationCap className="w-5 h-5 text-zinc-950" />
            </motion.div>

            {/* Glowing star badge */}
            <motion.div
              className="absolute -bottom-2 -left-2 bg-purple-600 p-1.5 rounded-xl shadow-md border-2 border-white flex items-center justify-center text-white"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
            </motion.div>
          </motion.div>
        </div>
      )
    },
    {
      title: "Why HelpYou AI?",
      subtitle: "",
      visual: null
    }
  ];

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 30
      }
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.25
      }
    })
  } as any;

  return (
    <div 
      className="absolute inset-0 z-[100] bg-white text-zinc-900 flex flex-col h-[100dvh] overflow-hidden select-none font-sans"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header Rail - Contains Skip button */}
      <div className="w-full px-6 pt-6 pb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">HelpYou AI</span>
        </div>
        
        {carouselIndex < 3 && (
          <button
            onClick={handleSkip}
            className="text-xs text-zinc-500 font-extrabold px-3.5 py-1.5 rounded-full hover:bg-zinc-100 hover:text-zinc-900 transition-all border-none bg-transparent cursor-pointer"
          >
            Skip
          </button>
        )}
      </div>

      {/* Main Slide Carousel Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center relative min-h-0">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={carouselIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            className="w-full flex flex-col items-center justify-center h-full min-h-0"
          >
            {carouselIndex === 3 ? (
              <div className="w-full flex flex-col items-center justify-center h-full max-w-sm">
                <span className="text-[9px] font-black uppercase tracking-widest text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100 mb-2">
                  COMPARE & CHOOSE EXCELLENCE
                </span>
                <h1 className="text-2xl md:text-3xl font-black text-zinc-950 mb-1 tracking-tight leading-none text-center">
                  Why HelpYou AI?
                </h1>
                <p className="text-[11px] text-zinc-500 font-bold mb-5 text-center px-4">
                  An unmatched smart learning suite built for absolute grade elevation.
                </p>
                
                {/* 4-Row Beautiful Comparison Table */}
                <div className="w-full bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-md flex flex-col text-xs font-sans">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 bg-zinc-50 border-b border-zinc-150 py-3.5 px-3 text-center font-bold items-center text-zinc-500 uppercase tracking-wider text-[9px]">
                    <div className="col-span-5 text-left text-zinc-400 font-extrabold pl-1">Feature</div>
                    <div className="col-span-4 bg-purple-600 text-white py-1 rounded-lg border border-purple-700 font-black text-[9px] shadow-sm tracking-wide">HelpYou AI ⚡</div>
                    <div className="col-span-3 text-zinc-400 font-extrabold">Others</div>
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-zinc-100">
                    {/* Row 1 */}
                    <div className="grid grid-cols-12 py-3 px-3 items-center hover:bg-zinc-50/50 transition-colors">
                      <div className="col-span-5 text-left pr-1 pl-1">
                        <p className="font-extrabold text-zinc-800 text-[11px] leading-tight">AI & Deep Search</p>
                        <p className="text-[8px] text-zinc-400 font-bold mt-0.5">Core brain engine</p>
                      </div>
                      <div className="col-span-4 bg-purple-50/60 border-l border-r border-purple-100/30 py-1.5 rounded-lg text-center flex flex-col items-center justify-center gap-0.5">
                        <span className="text-purple-700 font-black text-[10px] flex items-center gap-0.5">
                          <Check className="w-3 h-3 stroke-[3.5] text-purple-600 shrink-0" />
                          Gemini 3.5
                        </span>
                      </div>
                      <div className="col-span-3 text-center flex items-center justify-center gap-1 text-zinc-400">
                        <X className="w-3.5 h-3.5 text-zinc-400 stroke-[3]" />
                        <span className="text-[9px] font-bold">Basic AI</span>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-12 py-3 px-3 items-center hover:bg-zinc-50/50 transition-colors">
                      <div className="col-span-5 text-left pr-1 pl-1">
                        <p className="font-extrabold text-zinc-800 text-[11px] leading-tight">Native Audio Voice</p>
                        <p className="text-[8px] text-zinc-400 font-bold mt-0.5">Listen to tutor steps</p>
                      </div>
                      <div className="col-span-4 bg-purple-50/60 border-l border-r border-purple-100/30 py-1.5 rounded-lg text-center flex items-center justify-center gap-0.5">
                        <span className="text-purple-700 font-black text-[10px] flex items-center gap-0.5">
                          <Check className="w-3 h-3 stroke-[3.5] text-purple-600 shrink-0" />
                          Audio Play 🔊
                        </span>
                      </div>
                      <div className="col-span-3 text-center flex items-center justify-center gap-1 text-zinc-400">
                        <X className="w-3.5 h-3.5 text-zinc-400 stroke-[3]" />
                        <span className="text-[9px] font-bold">Text Only</span>
                      </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-12 py-3 px-3 items-center hover:bg-zinc-50/50 transition-colors">
                      <div className="col-span-5 text-left pr-1 pl-1">
                        <p className="font-extrabold text-zinc-800 text-[11px] leading-tight">Revision Cards</p>
                        <p className="text-[8px] text-zinc-400 font-bold mt-0.5">Memory Mistake Vault</p>
                      </div>
                      <div className="col-span-4 bg-purple-50/60 border-l border-r border-purple-100/30 py-1.5 rounded-lg text-center flex items-center justify-center gap-0.5">
                        <span className="text-purple-700 font-black text-[10px] flex items-center gap-0.5">
                          <Check className="w-3 h-3 stroke-[3.5] text-purple-600 shrink-0" />
                          Auto-Track 🧠
                        </span>
                      </div>
                      <div className="col-span-3 text-center flex items-center justify-center gap-1 text-zinc-400">
                        <X className="w-3.5 h-3.5 text-zinc-400 stroke-[3]" />
                        <span className="text-[9px] font-bold">No Track</span>
                      </div>
                    </div>

                    {/* Row 4 */}
                    <div className="grid grid-cols-12 py-3 px-3 items-center hover:bg-zinc-50/50 transition-colors">
                      <div className="col-span-5 text-left pr-1 pl-1">
                        <p className="font-extrabold text-zinc-800 text-[11px] leading-tight">Tutor Availability</p>
                        <p className="text-[8px] text-zinc-400 font-bold mt-0.5">Instant online support</p>
                      </div>
                      <div className="col-span-4 bg-purple-50/60 border-l border-r border-purple-100/30 py-1.5 rounded-lg text-center flex flex-col items-center justify-center gap-0.5">
                        <span className="text-purple-700 font-black text-[10px] flex items-center gap-0.5">
                          <Check className="w-3 h-3 stroke-[3.5] text-purple-600 shrink-0" />
                          24/7 Live 🚀
                        </span>
                      </div>
                      <div className="col-span-3 text-center flex items-center justify-center gap-1 text-zinc-400">
                        <X className="w-3.5 h-3.5 text-zinc-400 stroke-[3]" />
                        <span className="text-[9px] font-bold">Scheduled</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                {carouselItems[carouselIndex].visual}
                
                <h1 className="text-3xl md:text-4xl font-black text-zinc-900 mb-3 tracking-tight leading-none">
                  {carouselItems[carouselIndex].title}
                </h1>
                
                <p className="text-zinc-600 text-sm md:text-base font-semibold max-w-[320px] leading-relaxed">
                  {carouselItems[carouselIndex].subtitle}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Actions & Dot Indicators Rail */}
      <div className="w-full px-8 pb-10 flex flex-col items-center gap-6 shrink-0">
        
        {/* Dynamic Dot Indicators */}
        <div className="flex gap-3">
          {carouselItems.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                triggerVibration(10);
                setDirection(i > carouselIndex ? 1 : -1);
                setCarouselIndex(i);
              }}
              className="p-1 focus:outline-none bg-transparent border-none cursor-pointer"
              title={`Go to slide ${i + 1}`}
            >
              <motion.div 
                layout
                className={`h-2.5 rounded-full transition-all duration-300 ${i === carouselIndex ? 'w-8 bg-purple-500' : 'w-2.5 bg-zinc-200'}`} 
              />
            </button>
          ))}
        </div>

        {/* Action Button */}
        <div className="w-full max-w-sm">
          {carouselIndex === 3 ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGetStarted}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-[1.25rem] py-4 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 border border-purple-500/30 transition-shadow cursor-pointer"
            >
              Start Learning
              <ArrowRight className="w-4.5 h-4.5" />
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNext}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-[1.25rem] py-4 font-black text-sm flex items-center justify-center gap-1.5 shadow-md border border-zinc-900 transition-all cursor-pointer"
            >
              Next
              <ChevronRight className="w-4.5 h-4.5 text-zinc-400" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
