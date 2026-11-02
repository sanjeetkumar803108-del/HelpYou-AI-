import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import QuizGenerator from './QuizGenerator';
import FlashcardGenerator from './FlashcardGenerator';

// Unique, Standalone AI Quizzes Logo (No Background)
function QuizLogo({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0 drop-shadow-xs`} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="quizGrad" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="quizGold" x1="28" y1="26" x2="44" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F59E0B" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
      </defs>
      {/* Quiz Sheet / Board */}
      <rect x="8" y="6" width="32" height="36" rx="8" stroke="url(#quizGrad)" strokeWidth="3" fill="#FFFFFF" fillOpacity="0.9" />
      {/* Verified Green Checkmark */}
      <path d="M16 17L21 22L32 13" stroke="#10B981" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Quiz Answer Lines */}
      <path d="M16 27H27" stroke="url(#quizGrad)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 34H23" stroke="url(#quizGrad)" strokeWidth="2.5" strokeLinecap="round" />
      {/* AI Sparkle Star */}
      <path d="M36 27L37.5 31.5L42 33L37.5 34.5L36 39L34.5 34.5L30 33L34.5 31.5L36 27Z" fill="url(#quizGold)" />
    </svg>
  );
}

// Unique, Standalone AI Flashcards Logo (No Background)
function FlashcardLogo({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0 drop-shadow-xs`} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cardGrad1" x1="12" y1="6" x2="42" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" />
          <stop offset="1" stopColor="#6B21A8" />
        </linearGradient>
        <linearGradient id="cardGrad2" x1="6" y1="10" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" />
          <stop offset="1" stopColor="#9333EA" />
        </linearGradient>
      </defs>
      {/* Back Layer Card (Rotated 3D Angle) */}
      <rect x="15" y="6" width="25" height="32" rx="7" transform="rotate(9 15 6)" stroke="url(#cardGrad1)" strokeWidth="2.5" fill="#FFFFFF" fillOpacity="0.8" />
      {/* Front Active Recall Card */}
      <rect x="8" y="10" width="26" height="32" rx="7" stroke="url(#cardGrad2)" strokeWidth="3" fill="#FFFFFF" fillOpacity="0.95" />
      {/* Active Recall Lightning Spark */}
      <path d="M22 17L16 26H22L19 35L27 24H21L24 17H22Z" fill="url(#cardGrad2)" />
      {/* Sparkle Accent */}
      <circle cx="36" cy="11" r="2.5" fill="#F59E0B" />
    </svg>
  );
}

interface TestPrepProps {
  onBack: () => void;
  isVip?: boolean;
  onOpenVip?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export default function TestPrep({ onBack, isVip, onOpenVip, onNavigateToTab }: TestPrepProps) {
  const [activeSubTool, setActiveSubTool] = useState<'quiz' | 'flashcard' | null>(null);

  if (activeSubTool === 'quiz') {
    return <QuizGenerator onBack={() => setActiveSubTool(null)} />;
  }

  if (activeSubTool === 'flashcard') {
    return <FlashcardGenerator onBack={() => setActiveSubTool(null)} />;
  }

  return (
    <div className="h-full flex flex-col bg-[#FAF9F6] relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-zinc-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <button
          onClick={() => {
            triggerVibration(15);
            onBack();
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-transform cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-extrabold text-zinc-800 text-sm tracking-wide">Test Prep Hub</span>
        <div className="w-10 h-10" /> {/* Spacer */}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-36 flex flex-col justify-start max-w-lg mx-auto w-full">
        {/* Tutor Welcome Message */}
        <div className="text-center mb-6">
          <span className="text-4xl filter drop-shadow-sm select-none">🎯</span>
          <h2 className="text-2xl font-black text-zinc-900 mt-2 tracking-tight">Test Prep Hub</h2>
        </div>

        {/* Selection Cards Grid */}
        <div className="flex flex-col gap-4">
          {/* Card 1: AI Quizzes (Pastel Cream Box, Standalone Logo with NO background) */}
          <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              triggerVibration(20);
              setActiveSubTool('quiz');
            }}
            className="group relative overflow-hidden bg-[#FFFDF0] border border-[#F3E5BE] rounded-[2rem] p-5 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all select-none hover:border-amber-300 hover:shadow-md hover:shadow-amber-100/50"
          >
            <div className="flex items-center gap-4 min-w-0">
              {/* Standalone Logo - NO BACKGROUND CONTAINER */}
              <QuizLogo />
              <div className="min-w-0">
                <h3 className="font-black text-zinc-900 text-base tracking-tight">AI Quizzes</h3>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-amber-900 font-black text-xs shrink-0 group-hover:translate-x-1 transition-transform">
              <span>Start</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </motion.div>

          {/* Card 2: AI Flashcards (Pastel Brinjal Box, Standalone Logo with NO background) */}
          <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              triggerVibration(20);
              setActiveSubTool('flashcard');
            }}
            className="group relative overflow-hidden bg-[#F8F1F8] border border-[#E2CEE4] rounded-[2rem] p-5 shadow-xs flex items-center justify-between gap-4 cursor-pointer transition-all select-none hover:border-purple-300 hover:shadow-md hover:shadow-purple-100/50"
          >
            <div className="flex items-center gap-4 min-w-0">
              {/* Standalone Logo - NO BACKGROUND CONTAINER */}
              <FlashcardLogo />
              <div className="min-w-0">
                <h3 className="font-black text-zinc-900 text-base tracking-tight">AI Flashcards</h3>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-purple-900 font-black text-xs shrink-0 group-hover:translate-x-1 transition-transform">
              <span>Start</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </motion.div>
        </div>

        {/* Informative Tip */}
        <div className="mt-8 bg-gradient-to-r from-amber-500/5 via-purple-500/5 to-indigo-500/5 border border-zinc-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-2xs">
          <span className="text-xl select-none shrink-0 mt-0.5">💡</span>
          <div className="flex-1 min-w-0">
            <span className="font-black text-xs text-zinc-900 block mb-0.5">Pro Tip:</span>
            <p className="text-xs text-zinc-600 font-medium leading-relaxed">
              Combine <strong className="text-zinc-900 font-bold">AI Quizzes</strong> for exam-level practice testing with <strong className="text-zinc-900 font-bold">AI Flashcards</strong> for active recall to lock concepts permanently into memory!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
