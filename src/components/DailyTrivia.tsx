import React, { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Check, Sparkles, HelpCircle, RefreshCw, Settings, Search, GraduationCap, Compass, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import confetti from 'canvas-confetti';
import { saveMistakeToVault } from '../utils/mistakes';
import { safeGetItem } from '../utils/storage';

interface DailyTriviaProps {
  onBack: () => void;
}

interface TriviaQuestion {
  subjectTag: string;
  question: string;
  options: string[];
  correctIndex: number;
  fact: string;
}

export default function DailyTrivia({ onBack }: DailyTriviaProps) {
  const [trivia, setTrivia] = useState<TriviaQuestion | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState<boolean>(false);
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState<string>('');
  const [isCustomizing, setIsCustomizing] = useState<boolean>(false);
  const [excludeList, setExcludeList] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('study_trivia_excludes') || '[]');
    } catch {
      return [];
    }
  });

  const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
  const academicStream = safeGetItem('academic_stream') || 'STEM / Engineering';

  const getStreamSuggestions = () => {
    if (academicStream.includes('STEM')) {
      return ["AP Physics", "AP Biology", "AP Chemistry", "Computer Science", "Algebra & Calculus"];
    } else if (academicStream.includes('Humanities') || academicStream.includes('Arts')) {
      return ["AP US History", "World Literature", "Political Science", "Greek Mythology", "Famous Philosophers"];
    } else if (academicStream.includes('Business') || academicStream.includes('Commerce')) {
      return ["Macroeconomics", "Financial Markets", "Game Theory", "Tech Startups", "Famous Entrepreneurs"];
    }
    return ["General Science", "World History", "Geography", "English Idioms", "Space Exploration"];
  };

  const fetchTrivia = async (forcedTopic?: string) => {
    setLoading(true);
    setSelectedOption(null);
    setHasAnswered(false);
    setAnswerCorrect(null);
    triggerVibration(15);
    try {
      const activeTopic = forcedTopic !== undefined ? forcedTopic : customTopic;
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/generate-trivia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gradeLevel,
          academicStream,
          topic: activeTopic,
          excludeQuestions: excludeList,
        }),
      });

      if (!response.ok) {
        throw new Error('Server error');
      }

      const data = await response.json();
      if (data.trivia) {
        setTrivia(data.trivia);
        // Track the question to prevent repetition
        const updatedExcludes = [...excludeList, data.trivia.question].slice(-30);
        setExcludeList(updatedExcludes);
        localStorage.setItem('study_trivia_excludes', JSON.stringify(updatedExcludes));
      }
    } catch (error) {
      console.error('Failed to generate dynamic trivia:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrivia();
  }, []);

  const handleNextQuestion = () => {
    fetchTrivia();
  };

  const handleAnswerOption = (optionIndex: number) => {
    if (hasAnswered || !trivia) return;
    
    const isCorrect = optionIndex === trivia.correctIndex;
    
    setSelectedOption(optionIndex);
    setHasAnswered(true);
    setAnswerCorrect(isCorrect);
    
    if (isCorrect) {
      triggerVibration([15, 30, 15]);
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch (e) {
        console.error("Confetti error:", e);
      }
    } else {
      triggerVibration(40);
      // Auto-save trivia mistake to vault
      saveMistakeToVault(
        'Daily Trivia',
        trivia.question,
        trivia.options[optionIndex],
        `Correct answer: ${trivia.options[trivia.correctIndex]}. Fact: ${trivia.fact}`
      ).catch(err => console.error("Failed to log trivia mistake:", err));
    }
  };

  const handleShareTrivia = async () => {
    if (!trivia) return;
    triggerVibration(15);
    const optionsText = trivia.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
    const shareText = `🧠 Daily Trivia Challenge:\n${trivia.question}\n\nOptions:\n${optionsText}\n\nQuiz made by HelpYou AI`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          text: shareText
        });
        return;
      } catch (e) {
        console.log("Sharing cancelled or failed", e);
      }
    }
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText)
        .then(() => {
          setShareToast("Quiz copied! Paste it on WhatsApp or any app. 🚀");
          setTimeout(() => setShareToast(null), 3000);
        })
        .catch(() => {
          setShareToast("Could not copy quiz text.");
          setTimeout(() => setShareToast(null), 2500);
        });
    } else {
      setShareToast("Sharing is not supported on this browser.");
      setTimeout(() => setShareToast(null), 2500);
    }
  };

  // Clean markdown bold tags like ** if present
  const cleanText = (text: string) => {
    if (!text) return '';
    return text.replace(/\*\*/g, '');
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6] text-zinc-900 overflow-y-auto">
      {/* Header */}
      <header className="px-6 py-5 bg-white border-b border-zinc-100 flex justify-between items-center sticky top-0 z-10">
        <button 
          onClick={() => {
            triggerVibration(15);
            onBack();
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 hover:text-zinc-950 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black tracking-tight text-zinc-800 flex items-center gap-1.5">
          <span>🧠</span> Daily Trivia Booster
        </h1>
        <button 
          onClick={handleShareTrivia}
          disabled={loading || !trivia}
          className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          title="Share Trivia"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </header>

      {/* Dynamic Share Toast */}
      <AnimatePresence>
        {shareToast && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-20 right-6 bg-zinc-900 text-white text-[10px] px-3 py-1.5 rounded-full font-bold shadow-lg whitespace-nowrap z-50 flex items-center gap-1 border border-zinc-800"
          >
            <Check className="w-3 h-3 text-green-400" />
            {shareToast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 p-6 flex flex-col gap-5 max-w-md mx-auto w-full">
        {/* Profile Card & Customizer Toggle */}
        <div className="bg-white border border-zinc-200/60 rounded-3xl p-4 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Personalized Target</p>
                <p className="text-xs font-black text-zinc-800 leading-none mt-0.5">{gradeLevel} • {academicStream}</p>
              </div>
            </div>
            <button
              onClick={() => {
                triggerVibration(10);
                setIsCustomizing(!isCustomizing);
              }}
              className={`p-2 rounded-xl border transition-all ${isCustomizing ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200'}`}
              title="Customize Topic"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence>
            {isCustomizing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-zinc-100 overflow-hidden"
              >
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Type custom topic (e.g. DNA, Calculus)..."
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs font-bold text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:bg-white transition-all"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsCustomizing(false);
                      fetchTrivia();
                    }}
                    className="bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold text-xs px-4 py-3 rounded-2xl cursor-pointer shadow-sm active:scale-95 transition-all"
                  >
                    Load
                  </button>
                </div>

                <div className="mt-3">
                  <p className="text-[10px] text-zinc-400 font-extrabold uppercase mb-2 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-zinc-500" /> Suggested for your stream:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {getStreamSuggestions().map((sug) => (
                      <button
                        key={sug}
                        onClick={() => {
                          setCustomTopic(sug);
                          setIsCustomizing(false);
                          fetchTrivia(sug);
                        }}
                        className={`text-[10px] px-2.5 py-1.5 rounded-full border font-black transition-all ${
                          customTopic === sug 
                            ? 'bg-purple-50 text-purple-700 border-purple-200' 
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setCustomTopic('');
                        setIsCustomizing(false);
                        fetchTrivia('');
                      }}
                      className="text-[10px] px-2.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-black hover:bg-indigo-100"
                    >
                      ✨ Auto (Recommended)
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading Spinner Skeleton */}
        {loading ? (
          <div className="bg-white rounded-[2rem] border border-zinc-200/60 p-6 shadow-sm flex flex-col items-center justify-center py-16">
            <div className="relative flex items-center justify-center mb-6">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 border-4 border-zinc-100 border-t-purple-600 rounded-full"
              />
              <Sparkles className="absolute w-4 h-4 text-purple-600" />
            </div>
            <p className="text-sm font-black text-zinc-800 text-center">Consulting AI Trivia Master...</p>
            <p className="text-xs text-zinc-400 text-center mt-1.5 px-6 font-medium">Generating a completely fresh, high-yield quiz optimized for your grade level! 🧠🚀</p>
          </div>
        ) : (
          trivia && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-[2rem] border border-zinc-200/60 p-6 shadow-sm flex flex-col relative"
            >
              <div className="flex flex-col items-center text-center mb-4">
                {/* Curriculum Context Tag */}
                <span className="text-[10px] bg-indigo-50 border border-indigo-100/60 text-indigo-600 px-3 py-1 rounded-full font-black tracking-wide uppercase select-none mb-2 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> {trivia.subjectTag || "Daily Trivia"}
                </span>
                
                <h3 className="text-lg font-black text-zinc-900 mt-1 leading-tight">Daily Micro-Quiz</h3>
                
                {hasAnswered && (
                  <p className={`text-[10px] px-3 py-1 rounded-full inline-block font-extrabold mt-2 ${
                    answerCorrect 
                      ? "bg-green-500/10 text-green-700 border border-green-500/10" 
                      : "bg-red-500/10 text-red-700 border border-red-500/10"
                  }`}>
                    {answerCorrect 
                      ? "🎉 Correct! Excellent job! 🌟" 
                      : "❌ Incorrect! Review the fact below. 💡"}
                  </p>
                )}
              </div>

              {/* Question Box */}
              <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-[1.5rem] text-sm font-bold text-zinc-800 leading-relaxed mb-5 text-center shadow-inner">
                {cleanText(trivia.question)}
              </div>

              {/* Option Buttons */}
              <div className="flex flex-col gap-2.5 mb-5">
                {trivia.options.map((option, idx) => {
                  let btnStyle = "border border-zinc-200/80 bg-white hover:bg-zinc-50 hover:border-zinc-300 font-extrabold text-zinc-800 shadow-sm";
                  
                  if (hasAnswered) {
                    if (idx === trivia.correctIndex) {
                      btnStyle = "bg-green-50 border-green-300 text-green-900 font-black shadow-sm";
                    } else if (idx === selectedOption) {
                      btnStyle = "bg-red-50 border-red-300 text-red-900 font-black";
                    } else {
                      btnStyle = "border-zinc-100 bg-zinc-50/50 text-zinc-400 opacity-60";
                    }
                  }
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswerOption(idx)}
                      disabled={hasAnswered}
                      className={`w-full py-3.5 px-4 rounded-2xl text-center text-xs transition-all duration-200 flex items-center justify-center gap-1.5 ${btnStyle} ${!hasAnswered ? 'cursor-pointer active:scale-98' : 'cursor-default'}`}
                    >
                      {hasAnswered && idx === trivia.correctIndex && (
                        <span className="text-sm font-black">✓</span>
                      )}
                      {hasAnswered && idx === selectedOption && idx !== trivia.correctIndex && (
                        <span className="text-sm font-black">✗</span>
                      )}
                      {cleanText(option)}
                    </button>
                  );
                })}
              </div>

              {/* Explanation box */}
              <AnimatePresence>
                {hasAnswered && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: 10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-indigo-50/50 border border-indigo-100/50 p-4 rounded-2xl text-xs font-semibold text-zinc-700 leading-relaxed mb-4 overflow-hidden"
                  >
                    <p className="font-extrabold text-indigo-950 mb-1 uppercase tracking-wide text-[10px]">💡 Explanation & context:</p>
                    {cleanText(trivia.fact)}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Next Question / Shuffle button */}
              <button 
                onClick={handleNextQuestion}
                className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold text-xs py-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md active:scale-98"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{hasAnswered ? "Next Question" : "Skip Quiz"}</span>
              </button>
            </motion.div>
          )
        )}
      </div>
    </div>
  );
}
