import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, Bot, PhoneCall, Phone, MicOff, Search, Globe, 
  Headphones, AudioLines, FileAudio, ShieldCheck, ShieldAlert, Database, 
  Sparkles, Check, X, ArrowRight, ArrowLeft, Camera, PiggyBank, Star, Languages
} from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeSetItem } from '../utils/storage';
import { auth } from '../lib/firebase';

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0); // 0, 1, 2, 3

  const handleNext = () => {
    triggerVibration(15);
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    triggerVibration(10);
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    triggerVibration(20);
    safeSetItem('onboarding_completed', 'true');
    if (auth.currentUser) {
      safeSetItem(`onboarding_completed_${auth.currentUser.uid}`, 'true');
    }
    onComplete();
  };

  // State to simulate scanning and step-by-step solution steps on Page 1
  const [solutionStage, setSolutionStage] = useState(0); // 0: scanning, 1: processing/analyzing, 2: formula setup, 3: integrating, 4: final answer shown

  useEffect(() => {
    if (currentStep !== 0) return;

    setSolutionStage(0);

    const timeouts: NodeJS.Timeout[] = [];

    // Stage 1: Processing after 1.5s of scanning
    timeouts.push(setTimeout(() => setSolutionStage(1), 1500));

    // Stage 2: Formula Setup after 3.0s
    timeouts.push(setTimeout(() => setSolutionStage(2), 3000));

    // Stage 3: Integrating after 4.8s
    timeouts.push(setTimeout(() => setSolutionStage(3), 4800));

    // Stage 4: Final Answer after 6.5s
    timeouts.push(setTimeout(() => setSolutionStage(4), 6500));

    // Create a self-repeating loop interval of 10.5 seconds
    const interval = setInterval(() => {
      setSolutionStage(0);
      
      const t1 = setTimeout(() => setSolutionStage(1), 1500);
      const t2 = setTimeout(() => setSolutionStage(2), 3000);
      const t3 = setTimeout(() => setSolutionStage(3), 4800);
      const t4 = setTimeout(() => setSolutionStage(4), 6500);
      timeouts.push(t1, t2, t3, t4);
    }, 10500);

    return () => {
      timeouts.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [currentStep]);

  const comparisonData = [
    {
      topicIcon: <Sparkles className="w-2.5 h-2.5 text-indigo-500" />,
      helpyou: {
        title: "Best AI Tutor",
        desc: "Latest Gemini Model",
        icon: <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />,
        highlight: "Gemini Model"
      },
      other: {
        title: "Basic or",
        desc: "Older AI Models",
        icon: <Bot className="w-3.5 h-3.5 text-zinc-500" />
      }
    },
    {
      topicIcon: <Phone className="w-2.5 h-2.5 text-indigo-500" />,
      helpyou: {
        title: "Call with",
        desc: "AI Tutor",
        icon: <PhoneCall className="w-3.5 h-3.5 text-indigo-600" />,
        highlight: "AI Tutor"
      },
      other: {
        title: "No AI",
        desc: "Voice Calling",
        icon: <MicOff className="w-3.5 h-3.5 text-zinc-400" />
      }
    },
    {
      topicIcon: <Globe className="w-2.5 h-2.5 text-indigo-500" />,
      helpyou: {
        title: "Deep Search AI",
        desc: "Real-time Web Search",
        icon: <Search className="w-3.5 h-3.5 text-indigo-600" />,
        highlight: "Deep Search"
      },
      other: {
        title: "Limited Search",
        desc: "Results",
        icon: <Search className="w-3.5 h-3.5 text-zinc-400" />
      }
    },
    {
      topicIcon: <AudioLines className="w-2.5 h-2.5 text-indigo-500" />,
      helpyou: {
        title: "Revise your notes",
        desc: "with Summary Audio",
        icon: <Headphones className="w-3.5 h-3.5 text-indigo-600" />,
        highlight: "Summary Audio"
      },
      other: {
        title: "No Audio",
        desc: "Revision Support",
        icon: <FileAudio className="w-3.5 h-3.5 text-zinc-400" />
      }
    },
    {
      topicIcon: <Database className="w-2.5 h-2.5 text-indigo-500" />,
      helpyou: {
        title: "The Mistake Vault",
        desc: "analyzes errors",
        icon: <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />,
        highlight: "Mistake Vault"
      },
      other: {
        title: "Mistakes",
        desc: "Ignored, No Analysis",
        icon: <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
      }
    }
  ];

  // All screens now have a premium light background as requested!
  const containerThemeClass = 'bg-gradient-to-b from-[#F9F9FB] via-[#FAF9F6] to-[#F1F0F5] text-zinc-900';
  const titleThemeClass = 'text-zinc-900';
  const subtitleThemeClass = 'text-zinc-500';

  return (
    <div id="onboarding-root" className={`absolute inset-0 z-[100] ${containerThemeClass} flex flex-col h-[100dvh] overflow-hidden select-none font-sans`}>
      
      {/* Background elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-0 w-32 h-32 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle, #4F46E5 2px, transparent 2.5px)', backgroundSize: '12px 12px' }} />
        <div className="absolute top-24 right-0 w-32 h-32 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle, #4F46E5 2px, transparent 2.5px)', backgroundSize: '12px 12px' }} />
        <div className="absolute top-[20%] right-[10%] w-72 h-72 bg-purple-200/20 rounded-full filter blur-3xl" />
        <div className="absolute bottom-[10%] left-[-10%] w-80 h-80 bg-indigo-200/20 rounded-full filter blur-3xl" />
      </div>

      {/* Main Container - Fully Non-Scrolling Fit */}
      <div className="flex-1 flex flex-col justify-between items-center px-4 py-6 relative z-10 overflow-hidden h-full max-w-md mx-auto w-full">
        
        {/* Header Section */}
        <div className="w-full shrink-0 flex flex-col gap-3">
          
          {/* Top Bar with HELPYOU AI Logo and Skip button */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              {/* Back chevron if page > 0 */}
              {currentStep > 0 ? (
                <button 
                  onClick={handleBack} 
                  className="p-1 -ml-1 rounded-full hover:bg-zinc-200/50 transition-colors mr-1"
                >
                  <ArrowLeft className="w-4 h-4 text-zinc-600" />
                </button>
              ) : (
                <div className="w-2 h-2 rounded-full bg-indigo-600 shadow-[0_0_6px_#4f46e5]" />
              )}
              <span className="text-xs font-black tracking-widest text-indigo-950/80 uppercase leading-none">
                HELPYOU AI
              </span>
            </div>

            <button 
              onClick={handleComplete}
              className="text-xs font-bold text-zinc-500 hover:text-indigo-600 transition-colors py-1 px-2.5 rounded-lg hover:bg-zinc-100"
            >
              Skip
            </button>
          </div>

          {/* Step indicator Dots (Exactly 4 dots) */}
          <div className="flex gap-1.5 justify-center">
            {[0, 1, 2, 3].map((idx) => (
              <div 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentStep ? 'w-6 bg-indigo-600' : 'w-1.5 bg-zinc-300'}`}
              />
            ))}
          </div>
        </div>

        {/* Content Slides Carousel with AnimatePresence */}
        <div className="flex-1 w-full flex items-center justify-center overflow-hidden py-4">
          <AnimatePresence mode="wait">
            
            {/* PAGE 1: "Snap. Learn. Master." (White Theme) */}
            {currentStep === 0 && (
              <motion.div
                key="step-snap"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="w-full flex flex-col items-center text-center gap-5 px-2"
              >
                {/* Visual Camera Viewfinder Mockup */}
                <div className="relative w-full max-w-[270px] min-h-[310px] bg-white rounded-[32px] border border-zinc-200/50 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-4 flex flex-col justify-between items-center overflow-hidden">
                  {/* Corners Finder Brackets */}
                  <div className="absolute top-5 left-5 w-6 h-6 border-t-2 border-l-2 border-indigo-500 rounded-tl-lg" />
                  <div className="absolute top-5 right-5 w-6 h-6 border-t-2 border-r-2 border-indigo-500 rounded-tr-lg" />
                  <div className="absolute bottom-5 left-5 w-6 h-6 border-b-2 border-l-2 border-indigo-500 rounded-bl-lg" />
                  <div className="absolute bottom-5 right-5 w-6 h-6 border-b-2 border-r-2 border-indigo-500 rounded-br-lg" />

                  {/* Purple Sparkles Badge on Top Right */}
                  <div className="absolute top-5 right-5 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white p-1.5 rounded-full shadow-md z-10 translate-x-1/4 -translate-y-1/4">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>

                  {/* Inside Physics Q card (Dashed, looks like scanned sheet) */}
                  <div className="w-full bg-amber-50/30 border border-dashed border-amber-300/50 rounded-2xl p-3 text-center relative z-10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] font-black text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded">
                        📝 PHYSICS QUESTION
                      </span>
                      {solutionStage === 0 && (
                        <span className="text-[8px] font-black text-indigo-600 animate-pulse">
                          SCANNING...
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-zinc-700 italic leading-snug">
                      "Find the displacement of a particle moving with velocity v = t² - 4t m/s from t = 0 to t = 3s."
                    </p>
                  </div>

                  {/* Laser line moving over (Only active during scanning stage 0) */}
                  {solutionStage === 0 && (
                    <motion.div 
                      className="absolute left-4 right-4 h-[2px] bg-indigo-500 shadow-[0_0_8px_#4f46e5] z-20"
                      animate={{ top: ['5%', '45%', '5%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}

                  {/* Divider */}
                  <div className="w-full border-b border-zinc-100 my-2 z-10" />

                  {/* AI SOLVER TERMINAL WINDOW */}
                  <div className="w-full flex-1 bg-zinc-50/80 rounded-2xl p-3 border border-zinc-200/40 flex flex-col justify-between min-h-[145px] z-10">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between mb-1.5 shrink-0">
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-600 fill-indigo-100" />
                        <span className="text-[9px] font-black tracking-wider text-zinc-800 uppercase">
                          HelpYou AI Solver
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                        <span className="text-[7px] font-black tracking-widest text-zinc-400 uppercase">
                          {solutionStage === 0 ? 'Analyzing' : solutionStage === 1 ? 'Formulating' : 'Solved'}
                        </span>
                      </div>
                    </div>

                    {/* Step-by-Step interactive console */}
                    <div className="flex-1 flex flex-col justify-center gap-1.5 font-mono text-[9px] leading-tight text-zinc-600">
                      
                      {/* Stage 0: Scanner text */}
                      {solutionStage === 0 && (
                        <div className="flex flex-col items-center justify-center gap-1 py-4 text-center">
                          <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                          <p className="text-zinc-400 text-[8px] font-bold uppercase tracking-wider">
                            Optical Character Scan Active...
                          </p>
                        </div>
                      )}

                      {/* Stage 1: AI analysis message */}
                      {solutionStage === 1 && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex flex-col items-center justify-center gap-1.5 py-4 text-center"
                        >
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                          <p className="text-indigo-600 text-[8px] font-black uppercase tracking-wider">
                            Analyzing Kinematics equation...
                          </p>
                        </motion.div>
                      )}

                      {/* Stage >= 2: Formula setup */}
                      {solutionStage >= 2 && (
                        <motion.div 
                          initial={{ opacity: 0, x: -5 }} 
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-white border border-zinc-200/50 rounded-lg p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        >
                          <span className="text-[7px] font-black text-indigo-600 block mb-0.5">STEP 1: INTEGRAL FORMULA</span>
                          <span className="text-zinc-800 font-extrabold text-[10px]">s = ∫₀³ (t² - 4t) dt</span>
                        </motion.div>
                      )}

                      {/* Stage >= 3: Integration limits */}
                      {solutionStage >= 3 && (
                        <motion.div 
                          initial={{ opacity: 0, x: -5 }} 
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-white border border-zinc-200/50 rounded-lg p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        >
                          <span className="text-[7px] font-black text-indigo-600 block mb-0.5">STEP 2: LIMIT EVALUATION</span>
                          <span className="text-zinc-800 font-extrabold text-[10px]">= [t³/3 - 2t²]₀³ = (9 - 18)</span>
                        </motion.div>
                      )}

                      {/* Stage >= 4: Final output */}
                      {solutionStage >= 4 && (
                        <motion.div 
                          initial={{ scale: 0.95, opacity: 0 }} 
                          animate={{ scale: 1, opacity: 1 }}
                          className="bg-green-50 border border-green-200 rounded-lg p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[7px] font-black text-green-700 block mb-0.5">FINAL DISPLACEMENT</span>
                              <span className="text-green-950 font-black text-[11px] tracking-tight">s = -9 meters</span>
                            </div>
                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm shadow-green-500/20">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          </div>
                        </motion.div>
                      )}

                    </div>

                    {/* Bottom Info Pill */}
                    {solutionStage >= 2 && (
                      <div className="mt-1 flex items-center justify-between border-t border-zinc-100 pt-1 shrink-0">
                        <span className="text-[7px] font-bold text-zinc-400">Time taken: 0.4s</span>
                        <span className="text-[7px] font-black text-green-600 bg-green-50 px-1 rounded">100% Correct</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Text Explanation */}
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-2xl font-black tracking-tight text-zinc-900">
                    Snap. Learn. Master.
                  </h2>
                  <p className="text-xs font-semibold text-zinc-500 max-w-[290px] mx-auto leading-relaxed">
                    Instantly scan complex Physics, Chemistry, Biology, or Math problems and watch the AI generate detailed, step-by-step explanations in seconds.
                  </p>
                </div>
              </motion.div>
            )}

            {/* PAGE 2: "Learning in Your Native Voice" (White Theme) */}
            {currentStep === 1 && (
              <motion.div
                key="step-native-voice"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="w-full flex flex-col items-center text-center gap-5 px-2"
              >
                {/* Visual stacked translation cards */}
                <div className="w-full max-w-[260px] h-[160px] flex flex-col justify-center relative bg-white rounded-[32px] border border-zinc-200/50 shadow-[0_8px_24px_rgba(0,0,0,0.04)] p-5 overflow-hidden">
                  
                  {/* Card 1: Student prompt */}
                  <motion.div 
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: -18, opacity: 0.85 }}
                    className="absolute w-[80%] left-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl p-2.5 text-left shadow-sm"
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[8px] font-extrabold text-zinc-400 uppercase tracking-wider">Student</span>
                    </div>
                    <p className="text-[10px] font-bold text-zinc-800 line-clamp-1">Explain photosynthesis in Spanish</p>
                  </motion.div>

                  {/* Card 2: AI Reply */}
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 15, opacity: 1 }}
                    className="absolute w-[85%] right-4 bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-700 text-white rounded-2xl p-3 text-left shadow-lg"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-indigo-200" />
                        <span className="text-[8px] font-bold bg-white/20 text-indigo-100 px-1.5 py-0.5 rounded uppercase">SPANISH / ESPAÑOL</span>
                      </div>
                      <span className="text-[7px] font-black text-indigo-200 uppercase tracking-widest animate-pulse">Auto Detected</span>
                    </div>
                    <p className="text-[10px] font-bold text-white leading-relaxed line-clamp-2">
                      La fotosíntesis (Photosynthesis) es un proceso por el cual las plantas crean su propio alimento...
                    </p>
                  </motion.div>

                </div>

                {/* Text Explanation */}
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-2xl font-black tracking-tight text-zinc-900">
                    Learning in Your Native Voice
                  </h2>
                  <p className="text-xs font-semibold text-zinc-500 max-w-[290px] mx-auto leading-relaxed">
                    Our smart AI Tutor automatically detects your language. Whether you ask in Spanish, French, or English, get crystal-clear answers in the exact language you understand best.
                  </p>
                </div>
              </motion.div>
            )}

            {/* PAGE 3: "Elite Tutoring, Unbeatable Pricing" (White Theme) */}
            {currentStep === 2 && (
              <motion.div
                key="step-pricing"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="w-full flex flex-col items-center text-center gap-5 px-2"
              >
                {/* Visual Piggy Bank and stars floating mockup */}
                <div className="relative w-full max-w-[260px] aspect-square bg-white rounded-[32px] border border-zinc-200/50 shadow-[0_8px_24px_rgba(0,0,0,0.04)] flex items-center justify-center overflow-hidden">
                  
                  {/* Floating Graduation Cap */}
                  <motion.div 
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-6 left-6 p-2 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm text-indigo-600"
                  >
                    <GraduationCap className="w-6 h-6" />
                  </motion.div>

                  {/* Floating Piggy bank */}
                  <motion.div 
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-4 bg-purple-50 border border-purple-100 rounded-2xl shadow-md text-purple-600 z-10 flex flex-col items-center justify-center gap-1"
                  >
                    <PiggyBank className="w-10 h-10 text-amber-500" />
                    <span className="text-[9px] font-black text-purple-950 uppercase tracking-wide">Save 99% Costs</span>
                  </motion.div>

                  {/* Floating Premium Star */}
                  <motion.div 
                    animate={{ y: [0, -7, 0], scale: [1, 1.05, 1] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute bottom-6 right-6 p-2 bg-amber-50 border border-amber-100 rounded-2xl shadow-sm text-amber-500"
                  >
                    <Star className="w-6 h-6 fill-amber-200" />
                  </motion.div>
                </div>

                {/* Text Explanation */}
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-2xl font-black tracking-tight text-zinc-900">
                    Elite Tutoring, Unbeatable Pricing
                  </h2>
                  <p className="text-xs font-semibold text-zinc-500 max-w-[290px] mx-auto leading-relaxed">
                    Get personalized 1-on-1 AI tutoring at less than 1% of the cost of traditional physical tutors. No hidden fees. Pure, unlimited learning power.
                  </p>
                </div>
              </motion.div>
            )}

            {/* PAGE 4: The Comparison Table (White Theme) */}
            {currentStep === 3 && (
              <motion.div
                key="step-comparison"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="w-full flex flex-col items-center text-center gap-3 px-2 overflow-hidden"
              >
                {/* Slogan & Title */}
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-black text-indigo-950 tracking-tight">
                    LEARN with Premium Tools
                  </h2>
                  <p className="text-[11px] font-semibold text-zinc-500 max-w-[280px] mx-auto leading-tight">
                    How HelpYou AI compares to standard learning and school apps:
                  </p>
                </div>

                {/* Comparison Grid Table */}
                <div className="w-full flex flex-col gap-1">
                  
                  {/* Column Headers */}
                  <div className="flex items-center justify-between gap-1 w-full">
                    <div className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 shadow-sm border border-indigo-500/20">
                      <div className="w-3.5 h-3.5 bg-white text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                        <Check className="w-2 h-2 stroke-[3]" />
                      </div>
                      <span className="text-[8px] font-black tracking-wider uppercase">HelpYou AI</span>
                    </div>

                    <div className="w-5 h-5 rounded-full bg-white border border-indigo-200 flex items-center justify-center shrink-0 z-20">
                      <span className="text-[7px] font-black text-indigo-700">VS</span>
                    </div>

                    <div className="flex-1 bg-zinc-200/80 text-zinc-700 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 border border-zinc-300/40">
                      <div className="w-3.5 h-3.5 bg-zinc-600 text-white rounded-full flex items-center justify-center shrink-0">
                        <X className="w-2 h-2 stroke-[3]" />
                      </div>
                      <span className="text-[8px] font-black tracking-wider uppercase">Other Apps</span>
                    </div>
                  </div>

                  {/* Rows Mapping */}
                  <div className="flex flex-col gap-1 w-full max-h-[190px] overflow-y-auto pr-0.5">
                    {comparisonData.map((row, index) => (
                      <div key={index} className="flex items-center justify-between gap-1 relative w-full">
                        
                        {/* HelpYou AI Column */}
                        <div className="flex-1 bg-[#EEEDFC]/75 border border-indigo-100/60 p-1.5 rounded-lg flex items-center gap-1 h-[32px]">
                          <div className="w-5 h-5 bg-white rounded-md flex items-center justify-center shadow-sm text-indigo-600 shrink-0">
                            {row.helpyou.icon}
                          </div>
                          <div className="flex flex-col text-left justify-center min-w-0">
                            <p className="text-[8px] font-extrabold text-indigo-950 leading-tight truncate">
                              {row.helpyou.title}
                            </p>
                            <p className="text-[7px] font-bold text-indigo-600/95 leading-none truncate">
                              {row.helpyou.desc}
                            </p>
                          </div>
                        </div>

                        {/* Middle Bullet Connector */}
                        <div className="w-4 h-4 rounded-full bg-white border border-indigo-150 flex items-center justify-center shadow-sm shrink-0 z-20">
                          {row.topicIcon}
                        </div>

                        {/* Other Apps Column */}
                        <div className="flex-1 bg-white border border-zinc-200/40 p-1.5 rounded-lg flex items-center gap-1 h-[32px]">
                          <div className="w-5 h-5 bg-zinc-50 rounded-md flex items-center justify-center text-zinc-400 border border-zinc-150/40 shrink-0">
                            {row.other.icon}
                          </div>
                          <div className="flex flex-col text-left justify-center min-w-0">
                            <p className="text-[8px] font-bold text-zinc-700 leading-tight truncate">
                              {row.other.title}
                            </p>
                            <p className="text-[7px] font-semibold text-zinc-500/90 leading-none truncate">
                              {row.other.desc}
                            </p>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>

                  {/* Bottom Pill Badge */}
                  <div className="flex justify-center w-full mt-0.5 shrink-0">
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100/50 px-3 py-1 rounded-full flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-indigo-600 fill-indigo-200" />
                      <span className="text-[8px] font-extrabold tracking-wide text-indigo-950">
                        Includes <span className="text-indigo-600 font-black">AI Voice Calls</span> & Live Homework Scanner
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation Buttons */}
        <div className="w-full flex flex-col gap-2 shrink-0">
          {/* Next / Complete Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleNext}
            className={`w-full rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-1.5 shadow-md border cursor-pointer active:scale-[0.98] transition-all ${
              currentStep < 2
                ? 'bg-zinc-950 hover:bg-black text-white border-zinc-900 shadow-zinc-950/10'
                : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white border-indigo-500/20 shadow-indigo-600/10'
            }`}
          >
            {currentStep < 3 ? (
              <>
                {currentStep === 2 ? 'Get Started' : 'Next'} <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                Start Learning Now <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>

      </div>

    </div>
  );
}
