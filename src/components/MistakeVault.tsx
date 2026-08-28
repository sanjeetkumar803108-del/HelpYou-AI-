import { getApiUrl } from '../utils/api';
import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  ArrowLeft, Brain, Trash2, Sparkles, Loader2, BookOpen, 
  CheckCircle2, XCircle, RefreshCw, AlertCircle, Bookmark, HelpCircle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';

interface MistakeVaultProps {
  onBack: () => void;
}

interface MistakeItem {
  id: string;
  userId: string;
  sourceFeature: string;
  question: string;
  wrongInput: string;
  correctConcept: string;
  createdAt: any;
  aiFix?: {
    why_it_happened: string;
    the_fix: string;
    pro_memory_trick: string;
  } | null;
}

interface PracticeQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export default function MistakeVault({ onBack }: MistakeVaultProps) {
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (practicingId) {
      setPracticingId(null);
      setPracticeQuestions([]);
    } else {
      onBack();
    }
  };
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [expandedFixId, setExpandedFixId] = useState<string | null>(null);

  // States for practicing similar questions
  const [practicingId, setPracticingId] = useState<string | null>(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (practicingId) {
        e.preventDefault();
        handleHeaderBack();
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [practicingId]);

  const fetchMistakes = async () => {
    setLoading(true);
    const user = auth.currentUser;
    try {
      if (user) {
        // Fetch from Firestore
        const q = query(
          collection(db, 'MistakeVault'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const fetched: MistakeItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetched.push({
            id: docSnap.id,
            ...data
          } as MistakeItem);
        });
        
        // Sort by date (descending)
        fetched.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
        
        setMistakes(fetched);
      } else {
        // Fetch from localStorage fallback
        const local = JSON.parse(localStorage.getItem('study_temp_mistakes') || '[]');
        setMistakes(local.reverse());
      }
    } catch (err) {
      console.error('Error fetching mistakes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMistakes();
    
    // Listen for updates in real-time if save occurs elsewhere
    const handleUpdate = () => {
      fetchMistakes();
    };
    window.addEventListener('study-mistake-vault-updated', handleUpdate);
    return () => window.removeEventListener('study-mistake-vault-updated', handleUpdate);
  }, []);

  const handleDeleteMistake = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(15);
    
    // Optimistically update React state and localStorage immediately for instant visual feedback
    setMistakes(prev => prev.filter(m => m.id !== id));
    try {
      const local = JSON.parse(localStorage.getItem('study_temp_mistakes') || '[]');
      const filteredLocal = local.filter((m: any) => m.id !== id);
      localStorage.setItem('study_temp_mistakes', JSON.stringify(filteredLocal));
    } catch (err) {
      console.error('Error updating localStorage:', err);
    }

    // Perform Firestore deletion in the background without blocking the UI
    const user = auth.currentUser;
    if (user && !id.startsWith('local_')) {
      try {
        await deleteDoc(doc(db, 'MistakeVault', id));
      } catch (err) {
        console.error('Error deleting mistake from Firestore:', err);
      }
    }
  };

  const handleFixMistake = async (item: MistakeItem) => {
    if (fixingId) return;
    triggerVibration(25);
    setFixingId(item.id);
    
    try {
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch(getApiUrl('/api/fix-mistake'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: item.question,
          wrongInput: item.wrongInput,
          correctConcept: item.correctConcept,
          gradeLevel
        })
      });

      if (!response.ok) throw new Error("Failed to generate correction");

      const aiFixData = await response.json();
      
      // Robust extraction of fields
      const formattedFix = {
        why_it_happened: aiFixData.why_it_happened || "Analyzing the conceptual gap...",
        the_fix: aiFixData.the_fix || aiFixData.fix || "Applying the correct logic...",
        pro_memory_trick: aiFixData.pro_memory_trick || aiFixData.memory_trick || "Keep practicing this concept!"
      };

      // Save fix to state
      setMistakes(prev => prev.map(m => {
        if (m.id === item.id) {
          return { ...m, aiFix: formattedFix };
        }
        return m;
      }));

      // Persist to DB or localStorage
      const user = auth.currentUser;
      if (user && !item.id.startsWith('local_')) {
        await updateDoc(doc(db, 'MistakeVault', item.id), {
          aiFix: formattedFix
        });
      } else {
        const local = JSON.parse(localStorage.getItem('study_temp_mistakes') || '[]');
        const updatedLocal = local.map((m: any) => {
          if (m.id === item.id) {
            return { ...m, aiFix: formattedFix };
          }
          return m;
        });
        localStorage.setItem('study_temp_mistakes', JSON.stringify(updatedLocal));
      }

      setExpandedFixId(item.id);
    } catch (err) {
      console.error("AI correction failed:", err);
      // Optional: show a temporary toast or error state
    } finally {
      setFixingId(null);
    }
  };

  const startPractice = async (item: MistakeItem) => {
    if (practiceLoading) return;
    triggerVibration(25);
    setPracticingId(item.id);
    setPracticeLoading(true);
    setPracticeQuestions([]);
    setCurrentQuestionIdx(0);
    setSelectedOptionIdx(null);
    setIsAnswerSubmitted(false);
    setCorrectAnswersCount(0);
    setPracticeComplete(false);

    try {
      const response = await fetch(getApiUrl('/api/generate-practice'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: item.question,
          wrongInput: item.wrongInput,
          correctConcept: item.correctConcept,
          sourceFeature: item.sourceFeature
        })
      });

      if (!response.ok) throw new Error("Failed to generate practice questions");
      const data = await response.json();
      
      // Handle both object with questions array and direct array
      const questionsArray = Array.isArray(data) ? data : (data.questions || []);
      
      if (questionsArray.length === 0) {
        throw new Error("No questions generated");
      }
      
      setPracticeQuestions(questionsArray);
    } catch (err) {
      console.error("Practice generation failed:", err);
      setPracticeQuestions([]); // Ensure it's handled as error state in UI
    } finally {
      setPracticeLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans overflow-hidden">
      {/* Header */}
      <header className="px-5 py-4 border-b border-zinc-100 bg-white flex justify-between items-center shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleHeaderBack}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-black text-zinc-900 flex items-center gap-1.5 leading-tight">
              <span>The Mistake Vault</span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-600">
                🔒 VAULT
              </span>
            </h2>
            <p className="text-[10px] text-zinc-500 font-medium">Concept Correction & Memory Lab</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-50 text-red-500">
          <Brain className="w-5 h-5" />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-5 py-6 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            <p className="text-xs font-semibold">Opening Mistake Vault...</p>
          </div>
        ) : mistakes.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center py-16 px-6 bg-white rounded-3xl border border-zinc-200/60 shadow-sm"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-zinc-900 mb-1">Your Vault is Empty!</h3>
            <p className="text-xs text-zinc-500 font-medium max-w-xs leading-relaxed">
              Fantastic work! No academic errors or conceptual gaps have been logged yet. Mistakes from Quizzes, Chat, or Live Search are saved automatically here for you to master.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-red-500" />
                <span>{mistakes.length} Gaps Registered</span>
              </span>
              <button 
                onClick={fetchMistakes}
                className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync</span>
              </button>
            </div>

            <AnimatePresence mode="popLayout">
              {mistakes.map((item, idx) => {
                const isFixing = fixingId === item.id;
                const hasFix = !!item.aiFix;
                const isExpanded = expandedFixId === item.id;

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                  >
                    {/* Top Header Card */}
                    <div className="p-5 border-b border-zinc-100 bg-white">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-50 text-red-600 uppercase tracking-wider">
                            {item.sourceFeature}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {item.createdAt?.toDate 
                              ? item.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                              : new Date(item.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                            }
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 leading-snug">
                          {item.question}
                        </h4>
                      </div>
                    </div>

                    {/* Middle Card Content */}
                    <div className="px-5 py-4 bg-white space-y-3 border-b border-zinc-100">
                      <div className="flex flex-col gap-2 items-start">
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-500 shrink-0">Your Input:</span>
                        <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                          item.wrongInput.toLowerCase().includes("misconception") || item.wrongInput.toLowerCase().includes("trap")
                            ? "bg-red-50 text-red-800 border border-red-100/50" 
                            : "bg-red-50 text-red-700 border border-red-100"
                        }`}>
                          <XCircle className="w-3 h-3 shrink-0" />
                          <span>{item.wrongInput}</span>
                        </div>
                      </div>

                      {!hasFix && (
                        <div className="space-y-1">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-600 block">Correct Answer:</span>
                          <div className="text-xs font-semibold text-zinc-800 leading-relaxed">
                            {item.correctConcept.includes("🚨 Watch Out!") ? (
                              (() => {
                                const parts = item.correctConcept.split(/🚨 Watch Out! \(Common Trap\):?/);
                                const explanation = parts[1]?.trim();
                                if (!explanation) return null;
                                return (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1 text-red-600 font-black text-[9px] uppercase tracking-wider">
                                      <AlertCircle className="w-3 h-3" />
                                      <span>🚨 Watch Out! (Common Trap):</span>
                                    </div>
                                    <p className="text-zinc-700">{explanation}</p>
                                  </div>
                                );
                              })()
                            ) : (
                              item.correctConcept
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expandable Fix Details */}
                    <AnimatePresence>
                      {hasFix && isExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-b border-zinc-100 bg-zinc-50/40 px-5 py-4 space-y-3.5"
                        >
                          <div className="space-y-1">
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-500 block">Why it happened:</span>
                            <p className="text-xs font-semibold text-zinc-800 leading-relaxed">
                              {item.aiFix?.why_it_happened}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-600 block">The Correct Fix:</span>
                            <p className="text-xs font-semibold text-zinc-800 leading-relaxed">
                              {item.aiFix?.the_fix}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-blue-600 block">Pro Memory Trick:</span>
                            <p className="text-xs font-semibold text-zinc-800 leading-relaxed">
                              {item.aiFix?.pro_memory_trick}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Interactive Practice Quiz Block */}
                    <AnimatePresence>
                      {practicingId === item.id && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="bg-zinc-50/70 border-b border-zinc-100 p-5 space-y-4"
                        >
                          <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
                            <span className="text-xs font-black text-purple-600 flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Practice Quiz: Question {currentQuestionIdx + 1} of {practiceQuestions.length || 3}</span>
                            </span>
                            <button 
                              onClick={() => {
                                triggerVibration(10);
                                setPracticingId(null);
                              }}
                              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 uppercase"
                            >
                              Cancel Practice
                            </button>
                          </div>

                          {practiceLoading ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-zinc-500">
                              <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                              <p className="text-xs font-bold text-center">Magic AI Tutor is crafting custom questions...</p>
                            </div>
                          ) : practiceQuestions.length === 0 ? (
                            <div className="text-center py-6 text-xs font-semibold text-red-500">
                              Failed to load practice questions. Please try again!
                            </div>
                          ) : (!practiceQuestions[currentQuestionIdx]) ? (
                            <div className="text-center py-6 text-xs font-semibold text-zinc-500">
                              Question unavailable. Please try again!
                            </div>
                          ) : !practiceComplete ? (
                            <div className="space-y-4">
                              {/* Question Text */}
                              <p className="text-xs font-bold text-zinc-950 leading-relaxed">
                                {practiceQuestions[currentQuestionIdx]?.question || 'Practice Question'}
                              </p>

                              {/* Options Grid */}
                              <div className="grid grid-cols-1 gap-2.5">
                                {(practiceQuestions[currentQuestionIdx]?.options || []).map((option, oIdx) => {
                                  const isSelected = selectedOptionIdx === oIdx;
                                  const isCorrect = oIdx === practiceQuestions[currentQuestionIdx]?.correctIndex;
                                  
                                  let btnStyle = "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/50 text-zinc-800 bg-white";
                                  if (isAnswerSubmitted) {
                                    if (isCorrect) {
                                      btnStyle = "border-emerald-500 bg-emerald-50 text-emerald-900";
                                    } else if (isSelected) {
                                      btnStyle = "border-rose-500 bg-rose-50 text-rose-900";
                                    } else {
                                      btnStyle = "border-zinc-200 opacity-60 text-zinc-500 bg-zinc-50";
                                    }
                                  } else if (isSelected) {
                                    btnStyle = "border-purple-600 bg-purple-50 text-purple-950 shadow-sm";
                                  }

                                  return (
                                    <button
                                      key={oIdx}
                                      disabled={isAnswerSubmitted}
                                      onClick={() => {
                                        triggerVibration(15);
                                        setSelectedOptionIdx(oIdx);
                                      }}
                                      className={`w-full border-2 p-3 rounded-xl text-left text-xs font-bold transition-all flex items-start gap-2.5 ${btnStyle}`}
                                    >
                                      <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center shrink-0 text-[10px] font-black">
                                        {String.fromCharCode(65 + oIdx)}
                                      </span>
                                      <span className="flex-1 pt-0.5">{option}</span>
                                      {isAnswerSubmitted && isCorrect && (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                      )}
                                      {isAnswerSubmitted && isSelected && !isCorrect && (
                                        <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Explanation Block */}
                              {isAnswerSubmitted && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-100 space-y-1.5"
                                >
                                  <span className="text-[10px] font-black text-purple-700 flex items-center gap-1 uppercase tracking-wider">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>AI Tutor Explanation</span>
                                  </span>
                                  <p className="text-[11px] font-semibold text-zinc-700 leading-relaxed">
                                    {practiceQuestions[currentQuestionIdx].explanation}
                                  </p>
                                </motion.div>
                              )}

                              {/* Submit / Next Action Footer */}
                              <div className="flex justify-end pt-1">
                                {!isAnswerSubmitted ? (
                                  <button
                                    disabled={selectedOptionIdx === null}
                                    onClick={() => {
                                      triggerVibration(30);
                                      setIsAnswerSubmitted(true);
                                      if (selectedOptionIdx === practiceQuestions[currentQuestionIdx].correctIndex) {
                                        setCorrectAnswersCount(prev => prev + 1);
                                      }
                                    }}
                                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-md active:scale-95 transition-all"
                                  >
                                    Submit Answer
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      triggerVibration(20);
                                      if (currentQuestionIdx + 1 < practiceQuestions.length) {
                                        setCurrentQuestionIdx(prev => prev + 1);
                                        setSelectedOptionIdx(null);
                                        setIsAnswerSubmitted(false);
                                      } else {
                                        setPracticeComplete(true);
                                      }
                                    }}
                                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-extrabold shadow-md active:scale-95 transition-all"
                                  >
                                    {currentQuestionIdx + 1 < practiceQuestions.length ? "Next Question" : "Complete Practice"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 space-y-4">
                              <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto">
                                <Sparkles className="w-6 h-6 animate-bounce" />
                              </div>
                              <div className="space-y-1">
                                <h4 className="text-sm font-black text-zinc-900">Practice Session Finished!</h4>
                                <p className="text-xs text-zinc-600 font-bold">
                                  You scored <span className="text-purple-600">{correctAnswersCount} out of {practiceQuestions.length}</span> questions correctly!
                                </p>
                                {correctAnswersCount >= 2 ? (
                                  <p className="text-[11px] text-emerald-600 font-bold">
                                    Excellent mastery! You have successfully resolved this conceptual gap. 🎉
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-zinc-500 font-bold">
                                    Keep learning! Review the concepts and practice again to build strong memory rules.
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
                                {correctAnswersCount >= 2 && (
                                  <button
                                    onClick={(e) => {
                                      handleDeleteMistake(item.id, e);
                                      setPracticingId(null);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Mastered! Delete from Vault</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => startPractice(item)}
                                  className="px-4 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-bold active:scale-95 transition-all bg-white"
                                >
                                  Practice Again 🔄
                                </button>
                                <button
                                  onClick={() => setPracticingId(null)}
                                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-extrabold active:scale-95 transition-all"
                                >
                                  Close Practice
                                </button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Bottom Action Footer */}
                    <div className="px-5 py-4 bg-white space-y-4">
                      <div className="flex flex-wrap gap-2.5 justify-between items-center">
                        <div className="flex items-center gap-2">
                          <button
                            disabled={isFixing || practiceLoading}
                            onClick={() => startPractice(item)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all active:scale-95 ${
                              practicingId === item.id
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-zinc-100 shadow-sm'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>Practice Similar 🎯</span>
                          </button>

                          {!hasFix && (
                            <button
                              disabled={isFixing}
                              onClick={() => handleFixMistake(item)}
                              className="px-3 py-1.5 rounded-xl text-[11px] font-black text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-md flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-75"
                            >
                              {isFixing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              <span>AI Fix My Mistake</span>
                            </button>
                          )}

                          {hasFix && (
                            <button
                              onClick={() => {
                                triggerVibration(10);
                                setExpandedFixId(prev => prev === item.id ? null : item.id);
                              }}
                              className="px-3 py-1.5 rounded-xl text-[11px] font-black text-zinc-500 hover:text-zinc-900 bg-zinc-50 border border-zinc-100 transition-all flex items-center gap-1"
                            >
                              <span>{isExpanded ? "Hide Review" : "Review AI Fix"}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Primary Action Button */}
                      <button
                        onClick={(e) => {
                          confetti({
                            particleCount: 100,
                            spread: 70,
                            origin: { y: 0.8 },
                            colors: ['#10B981', '#34D399', '#059669']
                          });
                          handleDeleteMistake(item.id, e);
                        }}
                        className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(16,185,129,0.25)] active:scale-[0.98] transition-all"
                      >
                        <span>🎯 Concept Mastered! (Remove)</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
