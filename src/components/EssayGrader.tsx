import React, { useState, useEffect } from 'react';
import { PenTool, Loader2, ArrowLeft, Save, AlertCircle, Camera, History, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import GlobalMarkdown from './GlobalMarkdown';
import { deductCoins, getCoins } from '../utils/coins';
import { detectAndLogMistake } from '../utils/mistakes';
import { triggerVibration, hapticNotification, hapticImpact } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { Capacitor } from '@capacitor/core';
import { takeNativePhoto } from '../utils/mobilePicker';

const CURRICULUMS = [
  'Standard High School',
  'AP (Advanced Placement)',
  'IB (International Baccalaureate)',
  'A-Levels (UK)',
  'IELTS / TOEFL'
];

const SUBJECT_OPTIONS: Record<string, string[]> = {
  'Standard High School': ['Argumentative Essay', 'Narrative Essay', 'Literary Analysis', 'Expository Essay', 'Persuasive Essay'],
  'AP (Advanced Placement)': ['AP English Language', 'AP English Literature', 'AP US History', 'AP World History', 'AP Biology'],
  'IB (International Baccalaureate)': ['Theory of Knowledge (TOK)', 'Extended Essay (EE)', 'English A: Literature', 'History IA', 'Global Politics Essay'],
  'A-Levels (UK)': ['A-Level English Literature', 'A-Level History', 'A-Level Economics', 'A-Level Sociology', 'A-Level Psychology'],
  'IELTS / TOEFL': ['Task 1 (Academic)', 'Task 2 (Opinion/Argument)', 'IELTS General Writing', 'TOEFL Independent Essay', 'TOEFL Integrated Essay']
};

export default function EssayGrader({ onBack }: { onBack: () => void }) {
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (showHistory) {
      setShowHistory(false);
    } else if (result) {
      setResult(null);
    } else {
      onBack();
    }
  };
  const [essayText, setEssayText] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [curriculum, setCurriculum] = useState('Standard High School');
  const [subject, setSubject] = useState('Argumentative Essay');
  const [isCurriculumOpen, setIsCurriculumOpen] = useState(false);
  const [isSubjectOpen, setIsSubjectOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const [studyTip, setStudyTip] = useState('');
  const [serverWakingUpError, setServerWakingUpError] = useState(false);
  const [showLimitPopup, setShowLimitPopup] = useState(false);

  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showLimitPopup) {
        e.preventDefault();
        triggerVibration(10);
        setShowLimitPopup(false);
      } else if (showHistory) {
        e.preventDefault();
        triggerVibration(10);
        setShowHistory(false);
      } else if (result) {
        e.preventDefault();
        triggerVibration(10);
        setResult(null);
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [showLimitPopup, showHistory, result]);

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'pocket_items'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const items: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const isEssay = data.title && (
          data.title.toLowerCase().includes('essay') || 
          data.title.toLowerCase().includes('grader') ||
          (data.text && data.text.toLowerCase().includes('essay grader feedback'))
        );
        if (isEssay) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date()
          });
        }
      });

      // Keep only last 10 records, delete older ones
      if (items.length > 10) {
        const toKeep = items.slice(0, 10);
        const toDelete = items.slice(10);
        
        for (const item of toDelete) {
          try {
            await deleteDoc(doc(db, 'pocket_items', item.id));
          } catch (err) {
            console.error("Failed to delete old essay item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to load essay history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(15);
    try {
      await deleteDoc(doc(db, 'pocket_items', id));
      setHistoryItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete essay:", err);
    }
  };

  const studyTips = [
    "Thesis statements must be defensible and clearly establish your line of reasoning in the introduction.",
    "For History essays, always establish historical context in your introduction (3-4 sentences minimum).",
    "Evidence isn't just about quoting; you must analyze HOW the evidence supports your line of reasoning.",
    "To earn the Sophistication point, analyze multiple viewpoints, historical complexities, or alternative interpretations.",
    "AP English essays need rich word choice and cohesive transition phrases. Vary your sentence structure!",
    "In AP Biology, focus on precise scientific terms rather than vague descriptions."
  ];

  const gradingSteps = [
    "Reading your essay & analyzing structural markers...",
    "Evaluating arguments against official College Board standards...",
    "Scoring Thesis, Evidence, and Sophistication categories...",
    "Generating point-by-point deduction analysis...",
    "Polishing grammar & completing final verdict..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingProgress(0);
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 98) {
            clearInterval(interval);
            return 98;
          }
          const increment = Math.floor(Math.random() * 8) + 5; // Increment by 5-13%
          const nextVal = Math.min(prev + increment, 98);
          
          // Map progress value to steps
          const stepIndex = Math.min(Math.floor(nextVal / 20), gradingSteps.length - 1);
          setLoadingStep(stepIndex);
          
          return nextVal;
        });
      }, 250);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading]);

  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => {
        setErrorToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const wordCount = essayText.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (files.length > 5) {
      setErrorToast("Please select a maximum of 5 images.");
      setShowLimitPopup(true);
      triggerVibration(15);
      e.target.value = '';
      return;
    }
    
    setScanning(true);
    setErrorToast(null);
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }
    formData.append('gradeLevel', safeGetItem('academic_grade') || '11th Grade (Junior)');
    
    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/scan-images', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Could not transcribe the image(s).");
      }
      
      const essayContentType = response.headers.get("content-type") || "";
      if (!essayContentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }
      
      const data = await response.json();
      if (data.text) {
        setEssayText(data.text);
      } else {
        setErrorToast("No text could be extracted from the image(s). Please make sure the handwriting/text is clear.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorToast("Failed to transcribe image(s). Please try typing or pasting your essay.");
    } finally {
      setScanning(false);
      // Reset input value
      e.target.value = '';
    }
  };

  const handleGrade = async () => {
    if (!essayText.trim()) return;
    
    if (wordCount < 50) {
      setErrorToast("Please enter at least 50 words of your essay to get elite feedback.");
      return;
    }

    // Check if user has at least 1 coin before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 1) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Essay Grader", cost: 1 } }));
      return;
    }
    
    setLoading(true);
    setResult(null);
    setSaved(false);
    setServerWakingUpError(false);
    const randomTip = studyTips[Math.floor(Math.random() * studyTips.length)];
    setSubject(subject);
    setStudyTip(randomTip);
    
    try {
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/grade-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: essayText, curriculum, subject, gradeLevel }),
      });
      
      const contentType = response.headers.get("content-type") || "";
      if (response.status === 503 || response.status === 504 || contentType.includes("text/html")) {
        throw new Error("SERVER_WAKING_UP");
      }

      if (!response.ok) {
        const errText = await response.text();
        if (
          errText.toLowerCase().includes("<!doctype html>") ||
          errText.toLowerCase().includes("<html") ||
          errText.toLowerCase().includes("<title>")
        ) {
          throw new Error("SERVER_WAKING_UP");
        }
        let errMsg = 'Failed to grade essay';
        try {
          errMsg = JSON.parse(errText).error || errMsg;
        } catch (_) {
          errMsg = errText.substring(0, 100) || errMsg;
        }
        throw new Error(errMsg);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) {
        throw new Error("Streaming not supported on this browser.");
      }

      setResult(''); // Initialize result as empty string to switch to output view instantly when chunk arrives
      
      let accumulatedText = "";
      let isFirstChunk = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        if (isFirstChunk) {
          isFirstChunk = false;
          const trimmedChunk = chunk.trim().toLowerCase();
          if (
            trimmedChunk.startsWith("<!doctype html>") || 
            trimmedChunk.startsWith("<html") || 
            trimmedChunk.includes("<title>") ||
            trimmedChunk.includes("<title>starting server")
          ) {
            throw new Error("SERVER_WAKING_UP");
          }
        }

        accumulatedText += chunk;
        setResult(accumulatedText);
      }

      // Deduct 1 coin now that the output has been successfully generated by the AI
      deductCoins(1, "AI Essay Grader");

      // Auto-detect and save essay grading feedback as mistake to vault
      if (accumulatedText) {
        detectAndLogMistake('Essay Grader', essayText, accumulatedText).catch(e => console.error("Essay Grader mistake capture failed:", e));
      }

      // Auto-save
      if (auth.currentUser && accumulatedText) {
        try {
          await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'note',
            title: `AI Essay Grader: ${subject} (${curriculum})`,
            text: accumulatedText,
            createdAt: serverTimestamp()
          });
          setSaved(true);
        } catch (e) {
          console.error("Auto-save failed", e);
        }
      }
      hapticNotification('SUCCESS');
    } catch (err: any) {
      console.error(err);
      hapticNotification('ERROR');
      if (err.message === "SERVER_WAKING_UP") {
        setServerWakingUpError(true);
        setErrorToast("⏳ AI Servers are waking up. Please wait a few seconds and try again!");
      } else {
        setErrorToast(err.message || 'An error occurred. Please try again.');
      }
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-6 left-6 right-6 z-50 flex items-center gap-3 bg-red-50 border border-red-200 px-5 py-4 rounded-2xl shadow-xl"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 animate-bounce" />
            <span className="text-sm font-bold text-red-800">{errorToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FIXED/STICKY HEADER BAR */}
      <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200/80 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleHeaderBack}
            className="w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight line-clamp-1 text-zinc-900">
              <PenTool className="w-5 h-5 text-indigo-600 mr-2 shrink-0" />
              <span>AI Essay Grader</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Get elite feedback tailored to your specific curriculum</p>
          </div>
        </div>

        {auth.currentUser && (
          <button 
            onClick={() => {
              triggerVibration(15);
              setShowHistory(!showHistory);
              if (!showHistory) fetchHistory();
            }}
            className={`w-10 h-10 rounded-full border shadow-sm flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer ${
              showHistory 
                ? 'bg-indigo-600 text-white border-indigo-600' 
                : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-500'
            }`}
            title="History"
          >
            <History className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 z-10">

      {showHistory ? (
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Your Graded Essays</h3>
            <span className="text-xs bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full">{(Array.isArray(historyItems) ? historyItems : []).length} graded</span>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <span>Loading essay history...</span>
            </div>
          ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <p className="text-3xl mb-2">✍️</p>
              <p className="text-sm">No graded essays found.</p>
              <p className="text-xs text-zinc-400 font-semibold mt-1">Grade an essay and your detailed scorecards will appear here!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(historyItems || []).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    triggerVibration(15);
                    setResult(item.text);
                    setSaved(true);
                    setShowHistory(false);
                  }}
                  className="bg-white border border-zinc-200/80 hover:border-indigo-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                >
                  <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                    <h4 className="font-black text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                      {item.title || 'Graded Essay'}
                    </h4>
                    <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-zinc-400" />
                      {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="text-xs text-zinc-600 line-clamp-2 mt-1.5 font-medium">
                      {item.text ? item.text.substring(0, 120).replace(/[#*`]/g, '') + '...' : ''}
                    </div>
                  </div>

                  <button
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : loading && !result ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center"
        >
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-indigo-500 to-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/20 animate-bounce">
              <PenTool className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">Grading in Progress</h3>
          <p className="text-indigo-600 font-bold text-sm tracking-wide uppercase mb-6 min-h-[20px]">
            {gradingSteps[loadingStep]}
          </p>

          {/* Progress bar container */}
          <div className="w-full max-w-md bg-zinc-200/60 rounded-full h-3 mb-4 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-indigo-600 to-blue-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-8">
            {loadingProgress}% Analyzed
          </div>

          {/* Granular Skeletons */}
          <div className="w-full max-w-md space-y-4 mb-8">
            <div className="flex items-center gap-4 bg-white/50 p-4 rounded-2xl border border-zinc-100 animate-pulse">
               <div className="w-8 h-8 rounded-full bg-zinc-200 shrink-0" />
               <div className="space-y-2 flex-1">
                 <div className="h-3 bg-zinc-100 rounded-full w-full" />
                 <div className="h-3 bg-zinc-50 rounded-full w-2/3" />
               </div>
            </div>
            <div className="flex items-center gap-4 bg-white/30 p-4 rounded-2xl border border-zinc-100 animate-pulse scale-95 opacity-60">
               <div className="w-8 h-8 rounded-full bg-zinc-100 shrink-0" />
               <div className="space-y-2 flex-1">
                 <div className="h-3 bg-zinc-50 rounded-full w-[90%]" />
               </div>
            </div>
          </div>

          {/* AP Study Tip Box */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full max-w-md bg-white border border-zinc-200/80 rounded-3xl p-6 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2 text-amber-600 font-black text-xs uppercase tracking-widest justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              <span>AP Pro Study Tip</span>
            </div>
            <p className="text-zinc-600 text-xs font-semibold leading-relaxed">
              "{studyTip}"
            </p>
          </motion.div>
        </motion.div>
      ) : !result ? (
        <div className="flex-1 flex flex-col">
          {/* DYNAMIC CASCADING DROPDOWNS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* DROPDOWN 1: CURRICULUM */}
            <div className="relative">
              <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Select Curriculum / Exam</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => !loading && !scanning && setIsCurriculumOpen(!isCurriculumOpen)}
                  disabled={loading || scanning}
                  className="w-full bg-white border border-zinc-200 text-zinc-800 text-sm font-bold rounded-2xl py-3.5 px-4 flex items-center justify-between focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm cursor-pointer disabled:opacity-50 text-left font-sans"
                >
                  <span>{curriculum}</span>
                  <svg className={`fill-current h-4 w-4 text-zinc-500 transition-transform duration-200 ${isCurriculumOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </button>

                <AnimatePresence>
                  {isCurriculumOpen && (
                    <>
                      {/* Click backdrop to close */}
                      <div className="fixed inset-0 z-40" onClick={() => setIsCurriculumOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden font-sans"
                      >
                        <ul className="py-1 max-h-60 overflow-y-auto">
                          {CURRICULUMS.map((curr) => {
                            const isSelected = curriculum === curr;
                            return (
                              <li key={curr}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurriculum(curr);
                                    // Cascade update the subject
                                    const available = SUBJECT_OPTIONS[curr] || [];
                                    if (available.length > 0) {
                                      setSubject(available[0]);
                                    }
                                    setIsCurriculumOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-3.5 text-sm font-bold transition-all flex items-center justify-between ${
                                    isSelected 
                                      ? 'bg-indigo-50 text-indigo-600 font-extrabold' 
                                      : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900'
                                  }`}
                                >
                                  <span>{curr}</span>
                                  {isSelected && (
                                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* DROPDOWN 2: SUBJECT / ESSAY TYPE */}
            <div className="relative">
              <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Select Subject / Essay Type</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => !loading && !scanning && setIsSubjectOpen(!isSubjectOpen)}
                  disabled={loading || scanning}
                  className="w-full bg-white border border-zinc-200 text-zinc-800 text-sm font-bold rounded-2xl py-3.5 px-4 flex items-center justify-between focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm cursor-pointer disabled:opacity-50 text-left font-sans"
                >
                  <span>{subject}</span>
                  <svg className={`fill-current h-4 w-4 text-zinc-500 transition-transform duration-200 ${isSubjectOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </button>

                <AnimatePresence>
                  {isSubjectOpen && (
                    <>
                      {/* Click backdrop to close */}
                      <div className="fixed inset-0 z-40" onClick={() => setIsSubjectOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden font-sans"
                      >
                        <ul className="py-1 max-h-60 overflow-y-auto">
                          {(SUBJECT_OPTIONS[curriculum] || []).map((sub) => {
                            const isSelected = subject === sub;
                            return (
                              <li key={sub}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSubject(sub);
                                    setIsSubjectOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-3.5 text-sm font-bold transition-all flex items-center justify-between ${
                                    isSelected 
                                      ? 'bg-indigo-50 text-indigo-600 font-extrabold' 
                                      : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900'
                                  }`}
                                >
                                  <span>{sub}</span>
                                  {isSelected && (
                                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="relative mb-4">
            <textarea
              value={essayText}
              onChange={(e) => setEssayText(e.target.value)}
              placeholder="Paste your essay here..."
              disabled={loading || scanning}
              className="flex-1 w-full min-h-[300px] p-5 pb-8 rounded-3xl border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm font-semibold text-sm leading-relaxed disabled:opacity-55"
            />
            <div className={`absolute bottom-3 right-4 text-xs font-bold ${'text-zinc-400'}`}>
              {wordCount} words
            </div>
          </div>

          {/* MOBILE INPUT SHORTCUT BUTTON */}
          <div className="mb-6">
            <input 
              type="file"
              id="essay-gallery-input"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
              disabled={scanning || loading}
            />
            <button
              type="button"
              onClick={() => {
                triggerVibration(10);
                document.getElementById('essay-gallery-input')?.click();
              }}
              disabled={scanning || loading}
              className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100/50 font-extrabold text-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Transcribing image(s)...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>Upload images</span>
                </>
              )}
            </button>
          </div>

          {serverWakingUpError && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5 flex items-start gap-3 shadow-sm"
            >
              <span className="text-xl shrink-0">⏳</span>
              <div>
                <h4 className="font-extrabold text-amber-900 text-sm">AI Servers are waking up</h4>
                <p className="text-xs text-amber-700 font-bold mt-1 leading-relaxed">
                  Please wait a few seconds and try again!
                </p>
              </div>
            </motion.div>
          )}

          <button
            onClick={handleGrade}
            disabled={!essayText.trim() || loading || scanning || false}
            className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-500/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center border border-indigo-500/20"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Grade Essay"}
          </button>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col"
        >
          <div className="bg-white rounded-[2rem] p-6 shadow-md border border-zinc-200 mb-6 prose prose-sm max-w-none prose-headings:font-bold prose-headings:tracking-tight flex-1 text-zinc-800">
            <GlobalMarkdown>{result}</GlobalMarkdown>
          </div>
          
          {loading && (
            <div className="flex items-center gap-2.5 justify-center py-3.5 px-5 bg-indigo-50 border border-indigo-100/50 rounded-2xl text-xs font-bold text-indigo-700 animate-pulse mb-6">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
              <span>AP Teacher is writing feedback live...</span>
            </div>
          )}

          {!loading && (
            <>
              <button 
                onClick={() => {
                  setResult(null);
                  setEssayText('');
                }}
                className="w-full py-3.5 rounded-2xl font-extrabold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors bg-white shadow-sm"
              >
                Grade Another
              </button>
            </>
          )}
        </motion.div>
      )}
      </div>

      <AnimatePresence>
        {showLimitPopup && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-100 flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 text-2xl">
                ⚠️
              </div>
              <h3 className="font-extrabold text-zinc-900 text-lg mb-2">Maximum 5 Images Allowed</h3>
              <p className="text-zinc-500 text-sm font-semibold leading-relaxed mb-6">
                Bhai, you can only select up to 5 images at a time for grading. Please select 5 or fewer images.
              </p>
              <button
                onClick={() => {
                  triggerVibration(10);
                  setShowLimitPopup(false);
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black py-4 rounded-xl transition-all text-sm cursor-pointer"
              >
                Ok, understood!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
