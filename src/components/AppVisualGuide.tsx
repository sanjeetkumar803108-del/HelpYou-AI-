import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Home, 
  Camera, 
  BookOpen, 
  Bot, 
  Calculator, 
  Layers, 
  Globe, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  CheckCircle2, 
  Flame,
  Coins,
  ArrowDown,
  ArrowUp,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem, safeSetItem } from '../utils/storage';

export interface AppVisualGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
  onSelectTool?: (tool: string) => void;
}

interface GuideStep {
  id: string;
  stepNumber: number;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  targetArea: 'top_header' | 'scanner_tab' | 'notes_card' | 'search_card' | 'calculator_card' | 'tutor_tab' | 'tools_suite';
  arrowPosition: 'top' | 'bottom' | 'center' | 'bottom-center' | 'bottom-left' | 'bottom-right';
  targetTab?: string;
  keyHighlights: string[];
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'welcome_home',
    stepNumber: 1,
    badge: 'Home Dashboard',
    title: 'Welcome to HelpYou AI!',
    subtitle: 'Your All-in-One Smart Academic Companion',
    description: 'This is your central study command center. Track daily learning streaks 🔥, manage your free study coins 🪙, adjust your grade level, and view tailored learning recommendations.',
    icon: <Home className="w-6 h-6" />,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    accentColor: 'from-amber-500 to-orange-600',
    targetArea: 'top_header',
    arrowPosition: 'top',
    targetTab: 'notes',
    keyHighlights: [
      '🔥 Daily Streak Tracker & Milestones',
      '🪙 Free Daily Study Coins Refill',
      '🎓 Adaptive Grade & Syllabus Level'
    ]
  },
  {
    id: 'magic_scanner',
    stepNumber: 2,
    badge: 'Magic AI Scanner',
    title: 'Snap & Solve Any Question',
    subtitle: 'Instant Step-by-Step AI Explanations',
    description: 'Use the center Scan feature to snap photos of any homework problem, handwritten math equation, diagram, or textbook question for instant verified step-by-step guidance.',
    icon: <Camera className="w-6 h-6" />,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    accentColor: 'from-blue-600 to-indigo-600',
    targetArea: 'scanner_tab',
    arrowPosition: 'bottom',
    targetTab: 'notes',
    keyHighlights: [
      '📸 Camera & Mobile Gallery Support',
      '🧠 Step-by-Step Logic Breakdown',
      '⚡ Instant Multi-Subject Solver'
    ]
  },
  {
    id: 'audio_notes',
    stepNumber: 3,
    badge: 'AI Note Maker & Podcasts',
    title: 'Structured Notes & Study Podcasts',
    subtitle: 'Transform Textbooks into Audio & Flashcards',
    description: 'Generate comprehensive Cornell notes, active recall flashcards, and playable audio study podcasts with background playback from any topic or textbook chapter.',
    icon: <BookOpen className="w-6 h-6" />,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    accentColor: 'from-rose-500 to-pink-600',
    targetArea: 'notes_card',
    arrowPosition: 'center',
    targetTab: 'notes',
    keyHighlights: [
      '🎙️ Playable AI Audio Podcasts',
      '📝 Cornell Notes with PDF Export',
      '🃏 Instant Active Recall Flashcards'
    ]
  },
  {
    id: 'deep_search',
    stepNumber: 4,
    badge: 'Live Tutor Deep Search',
    title: 'Live 10+ Web Grounded Research',
    subtitle: 'Real-Time Academic Live Intelligence',
    description: 'Ask deep academic questions. HelpYou AI scours 5 to 10+ live portals like Khan Academy, Nature, MIT OCW, and Wikipedia to synthesize real-time verified answers.',
    icon: <Globe className="w-6 h-6" />,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    accentColor: 'from-emerald-600 to-teal-600',
    targetArea: 'search_card',
    arrowPosition: 'center',
    targetTab: 'notes',
    keyHighlights: [
      '🌐 Real-time 5-10+ Academic Sources',
      '📚 Citation & Source Grounding',
      '⚡ Multi-Angle Conceptual Answers'
    ]
  },
  {
    id: 'calculator',
    stepNumber: 5,
    badge: 'Scientific & Graphing Math',
    title: 'Smart Calculator & Tier-1 Formulas',
    subtitle: 'Interactive Graphs & Global Formula Sheets',
    description: 'Perform advanced trigonometry and calculus, plot 2D Cartesian function graphs in real-time, and tap any formula from US, UK, Canada, Australia & IB syllabi to calculate.',
    icon: <Calculator className="w-6 h-6" />,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    accentColor: 'from-amber-500 to-yellow-600',
    targetArea: 'calculator_card',
    arrowPosition: 'center',
    targetTab: 'notes',
    keyHighlights: [
      '📈 Real-time 2D Graph Plotter',
      '🪐 Animated Interactive Unit Circle',
      '📐 Complete Tier-1 Formula Sheets'
    ]
  },
  {
    id: 'ai_tutor',
    stepNumber: 6,
    badge: '24/7 AI Personal Tutor',
    title: 'Personalized AI Doubt Solver',
    subtitle: 'Always Available Voice & Text Study Partner',
    description: 'Access your dedicated 24/7 AI Tutor from the bottom navigation. Ask follow-up questions, practice Socratic interviews, and get personalized study plans.',
    icon: <Bot className="w-6 h-6" />,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    accentColor: 'from-purple-600 to-indigo-600',
    targetArea: 'tutor_tab',
    arrowPosition: 'bottom',
    targetTab: 'notes',
    keyHighlights: [
      '💬 Conversational Doubt Resolution',
      '🎯 Socratic Interactive Teaching',
      '📊 Custom Exam Prep Recommendations'
    ]
  },
  {
    id: 'tools_suite',
    stepNumber: 7,
    badge: 'Complete Study Suite',
    title: 'Essay Grader, Trivia & Mistake Vault',
    subtitle: 'Everything You Need for Exam Mastery',
    description: 'Boost your exam scores with the AI Essay Grader, Grammar Enhancer, unlimited Image to PDF converter, Daily Academic Trivia, and personal Mistake Vault.',
    icon: <Layers className="w-6 h-6" />,
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    accentColor: 'from-indigo-600 to-blue-600',
    targetArea: 'tools_suite',
    arrowPosition: 'center',
    targetTab: 'notes',
    keyHighlights: [
      '✍️ Comprehensive Essay Grader',
      '🖼️ Unlimited Image to PDF Converter',
      '🛡️ Mistake Vault for Error Correction'
    ]
  }
];

export default function AppVisualGuide({
  isOpen,
  onClose,
  onNavigateTab,
  onSelectTool
}: AppVisualGuideProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStep = GUIDE_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === GUIDE_STEPS.length - 1;

  const handleNext = () => {
    triggerVibration(15);
    if (isLastStep) {
      handleFinish();
    } else {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      if (GUIDE_STEPS[nextIdx].targetTab && onNavigateTab) {
        onNavigateTab(GUIDE_STEPS[nextIdx].targetTab!);
      }
    }
  };

  const handlePrev = () => {
    triggerVibration(10);
    if (!isFirstStep) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      if (GUIDE_STEPS[prevIdx].targetTab && onNavigateTab) {
        onNavigateTab(GUIDE_STEPS[prevIdx].targetTab!);
      }
    }
  };

  const handleFinish = () => {
    triggerVibration(25);
    safeSetItem('app_visual_guide_completed_v1', 'true');
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
    });
    onClose();
  };

  const handleSkip = () => {
    triggerVibration(10);
    safeSetItem('app_visual_guide_completed_v1', 'true');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden">
        {/* Backdrop overlay with blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/75 backdrop-blur-md pointer-events-auto"
          onClick={handleNext}
        />

        {/* Top Floating Target Halo / Guide Header */}
        <div className="relative z-10 p-5 pt-safe flex items-center justify-between w-full max-w-lg mx-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-lg">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-xs font-black tracking-wider uppercase">Interactive App Tour</span>
          </div>

          <button
            onClick={handleSkip}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 font-bold text-xs border border-white/15 transition-all shadow-md cursor-pointer"
          >
            <span>Skip Tour</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dynamic Pointer Arrow Area */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pointer-events-none">
          {/* Top Arrow (Points UP towards Dashboard & Counters) */}
          {currentStep.arrowPosition === 'top' && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: [0, -12, 0], opacity: 1 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              className="flex flex-col items-center mb-6"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-xl shadow-amber-500/30 border-2 border-white ring-4 ring-amber-400/30">
                <ArrowUp className="w-6 h-6 stroke-[3]" />
              </div>
              <span className="mt-2 text-[11px] font-black text-amber-300 tracking-wider uppercase bg-black/60 px-3 py-1 rounded-full border border-amber-500/30 backdrop-blur-sm">
                Dashboard & Coins Above ⬆
              </span>
            </motion.div>
          )}

          {/* Center Pulsing Spotlight Icon Badge */}
          {currentStep.arrowPosition === 'center' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.08, 1], opacity: 1 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="relative mb-5"
            >
              <div className="absolute inset-0 bg-blue-500/30 rounded-3xl blur-xl" />
              <div className={`relative w-20 h-20 rounded-3xl ${currentStep.iconBg} ${currentStep.iconColor} border-2 border-white shadow-2xl flex items-center justify-center ring-4 ring-white/20`}>
                {React.cloneElement(currentStep.icon as React.ReactElement, { className: 'w-10 h-10' })}
              </div>
            </motion.div>
          )}

          {/* Step Card */}
          <motion.div
            key={currentStep.id}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 260 }}
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-zinc-100 flex flex-col pointer-events-auto relative overflow-hidden"
          >
            {/* Step Progress & Category Badge */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                Step {currentStep.stepNumber} of {GUIDE_STEPS.length}
              </span>
              <span className="text-[11px] font-extrabold text-blue-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                {currentStep.badge}
              </span>
            </div>

            {/* Title & Subtitle */}
            <h3 className="text-lg font-black text-zinc-950 tracking-tight leading-snug">
              {currentStep.title}
            </h3>
            <p className="text-xs font-bold text-zinc-500 mt-0.5 mb-3">
              {currentStep.subtitle}
            </p>

            {/* Main Description */}
            <p className="text-xs text-zinc-600 leading-relaxed font-medium mb-4">
              {currentStep.description}
            </p>

            {/* Key Feature Highlight Bullets */}
            <div className="space-y-1.5 mb-6 bg-zinc-50 p-3 rounded-2xl border border-zinc-150">
              {currentStep.keyHighlights.map((highlight, hIdx) => (
                <div key={hIdx} className="flex items-center gap-2 text-[11px] font-bold text-zinc-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{highlight}</span>
                </div>
              ))}
            </div>

            {/* Progress Dots */}
            <div className="flex items-center justify-center gap-1.5 mb-5">
              {GUIDE_STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentStepIndex
                      ? 'w-6 bg-blue-600'
                      : idx < currentStepIndex
                        ? 'w-2 bg-blue-300'
                        : 'w-1.5 bg-zinc-200'
                  }`}
                />
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  onClick={handlePrev}
                  className="w-12 h-12 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold transition-all active:scale-95 cursor-pointer shrink-0"
                  title="Previous Step"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <button
                onClick={handleNext}
                className={`flex-1 h-12 rounded-2xl bg-gradient-to-r ${currentStep.accentColor} text-white font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all cursor-pointer`}
              >
                <span>{isLastStep ? 'Start Learning 🚀' : 'Next Feature'}</span>
                {!isLastStep && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>

          {/* Bottom Arrow (Points DOWN towards Bottom Navigation Tabs) */}
          {currentStep.arrowPosition === 'bottom' && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: [0, 12, 0], opacity: 1 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              className="flex flex-col items-center mt-6"
            >
              <span className="mb-2 text-[11px] font-black text-blue-300 tracking-wider uppercase bg-black/60 px-3 py-1 rounded-full border border-blue-500/30 backdrop-blur-sm">
                Tap Bottom Navigation Tab ⬇
              </span>
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/30 border-2 border-white ring-4 ring-blue-400/30">
                <ArrowDown className="w-6 h-6 stroke-[3]" />
              </div>
            </motion.div>
          )}
        </div>

        {/* Bottom Spacing */}
        <div className="relative z-10 p-4 pb-safe text-center">
          <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
            You can re-launch this tour anytime from Profile & Help
          </p>
        </div>
      </div>
    </AnimatePresence>
  );
}
