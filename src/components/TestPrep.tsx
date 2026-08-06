import React, { useState } from 'react';
import { BookOpen, Sparkles, ArrowLeft, ArrowRight, Award, Layers } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import QuizGenerator from './QuizGenerator';
import FlashcardGenerator from './FlashcardGenerator';

interface TestPrepProps {
  onBack: () => void;
}

export default function TestPrep({ onBack }: TestPrepProps) {
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
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-extrabold text-zinc-800 text-sm tracking-wide">Test Prep Hub</span>
        <div className="w-10 h-10" /> {/* Spacer */}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col justify-start max-w-lg mx-auto w-full pb-12">
        {/* Tutor Welcome Message */}
        <div className="text-center mb-8">
          <span className="text-5xl filter drop-shadow-sm select-none">🎯</span>
          <h2 className="text-3xl font-black text-zinc-900 mt-3 tracking-tight">Test Prep Hub</h2>
          <p className="text-sm text-zinc-500 font-semibold mt-2 leading-relaxed">
            Ready to ace your exams? Let's choose the perfect study method! Use Quizzes to test your memory or Flashcards to review core terms.
          </p>
        </div>

        {/* Selection Cards Grid */}
        <div className="flex flex-col gap-4">
          {/* Card 1: AI Quizzes */}
          <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              triggerVibration(20);
              setActiveSubTool('quiz');
            }}
            className="group relative overflow-hidden bg-white border border-zinc-200/80 rounded-[2rem] p-6 shadow-md shadow-zinc-100 flex items-start gap-5 cursor-pointer transition-all select-none hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50"
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
              <Award className="w-7 h-7 stroke-[2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-zinc-900 text-lg tracking-tight">AI Quizzes</h3>
                <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full">Practice</span>
              </div>
              <p className="text-xs text-zinc-500 font-semibold mt-1 leading-relaxed">
                Generate high-yield multiple choice questions from textbook images, study notes, or uploaded PDFs to test your comprehension.
              </p>
              <div className="flex items-center gap-1.5 text-indigo-600 text-xs font-black mt-3">
                <span>Start Quiz Prep</span>
                <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.div>

          {/* Card 2: AI Flashcards */}
          <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              triggerVibration(20);
              setActiveSubTool('flashcard');
            }}
            className="group relative overflow-hidden bg-white border border-zinc-200/80 rounded-[2rem] p-6 shadow-md shadow-zinc-100 flex items-start gap-5 cursor-pointer transition-all select-none hover:border-pink-200 hover:shadow-lg hover:shadow-pink-50/50"
          >
            <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600 shrink-0 group-hover:bg-pink-600 group-hover:text-white transition-colors duration-300">
              <Layers className="w-7 h-7 stroke-[2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-zinc-900 text-lg tracking-tight">AI Flashcards</h3>
                <span className="bg-pink-50 text-pink-600 text-[10px] font-bold px-2 py-0.5 rounded-full">Review</span>
              </div>
              <p className="text-xs text-zinc-500 font-semibold mt-1 leading-relaxed">
                Convert your syllabus, long paragraphs, or lecture slides into elegant active-recall cards to memorize key definitions easily.
              </p>
              <div className="flex items-center gap-1.5 text-pink-600 text-xs font-black mt-3">
                <span>Start Flashcard Prep</span>
                <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Informative Tip */}
        <div className="mt-8 bg-zinc-50 border border-zinc-200/60 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-xl">💡</span>
          <p className="text-xs text-zinc-500 font-semibold leading-relaxed">
            Pro Tip: Both tools can analyze custom textbook chapters or hand-written homework pages to create the perfect prep materials!
          </p>
        </div>
      </div>
    </div>
  );
}
