import React, { useState, useRef, useEffect } from 'react';
import { FileText, Loader2, FilePlus, ChevronRight, ArrowLeft, Headphones, MessageSquare, BookOpen, PenTool, CheckCircle2, Download, Volume2, Play, Pause, Square, ChevronLeft, Eye, Info, AlertCircle, History, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import GlobalMarkdown from './GlobalMarkdown';
import { exportNotesToPDF } from '../lib/pdfExporter';
import { deductCoins } from '../utils/coins';
import { saveMistakeToVault } from '../utils/mistakes';
import { triggerVibration } from '../utils/vibrate';

// ----------------------------------------------------------------------
// Robust Parsers to turn Markdown chunks into Premium Interactive Views
// ----------------------------------------------------------------------
function parseFlashcards(text: string) {
  const cards: { question: string; answer: string }[] = [];
  
  // Regex to match **Q: [Question]** and *A: [Answer]* or Q: / A:
  const regex = /(?:\*\*Q:|\*\*Question:|\*Q:|Q:)\s*(.*?)(?:\*\*|\*|)\s*\n+\s*(?:\*\*A:|\*\*Answer:|\*A:|A:)\s*(.*?)(?:\*\*|\*|)(?=\n|$)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    cards.push({
      question: match[1].trim(),
      answer: match[2].trim(),
    });
  }
  
  if (cards.length === 0) {
    const lines = text.split('\n');
    let currentQ = '';
    let currentA = '';
    for (const line of lines) {
      const cleanLine = line.trim();
      if (/^(?:\*\*Q:|\*\*Question:|Q:)/i.test(cleanLine)) {
        if (currentQ && currentA) {
          cards.push({ question: currentQ, answer: currentA });
          currentQ = '';
          currentA = '';
        }
        currentQ = cleanLine.replace(/^(?:\*\*Q:|\*\*Question:|Q:)\s*/i, '').replace(/\*\*$/, '').replace(/\*$/, '').trim();
      } else if (/^(?:\*\*A:|\*\*Answer:|A:|\*A:)/i.test(cleanLine)) {
        currentA = cleanLine.replace(/^(?:\*\*A:|\*\*Answer:|A:|\*A:)\s*/i, '').replace(/\*\*$/, '').replace(/\*$/, '').trim();
      }
    }
    if (currentQ && currentA) {
      cards.push({ question: currentQ, answer: currentA });
    }
  }
  
  return cards;
}

function parseQuiz(text: string) {
  const questions: { question: string; options: string[]; correctAnswer: string; explanation: string }[] = [];
  const blocks = text.split(/(?=\d+\.\s|Question\s+\d+:|Q\d+:)/gi);
  
  for (const block of blocks) {
    if (!block.trim()) continue;
    
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) continue;
    
    let questionText = lines[0].replace(/^\d+\.\s*/, '').replace(/^Question\s+\d+:\s*/i, '').replace(/^Q\d+:\s*/i, '').trim();
    const options: string[] = [];
    let correctAnswer = '';
    let explanation = '';
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^[A-D]\)/i.test(line) || /^[A-D]\.\s/i.test(line) || /^\*\s*[A-D]\)/i.test(line) || /^\*\s*[A-D]\.\s/i.test(line)) {
        const cleanOption = line.replace(/^\*\s*/, '').trim();
        options.push(cleanOption);
      } else if (line.toLowerCase().includes('answer:') || line.toLowerCase().includes('correct answer:')) {
        correctAnswer = line.replace(/.*answer:\s*/i, '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
      } else if (line.toLowerCase().includes('explanation:')) {
        explanation = line.replace(/.*explanation:\s*/i, '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
      }
    }
    
    if (options.length >= 2) {
      questions.push({
        question: questionText,
        options,
        correctAnswer: correctAnswer || 'B',
        explanation: explanation || 'Based on the uploaded document.'
      });
    }
  }
  
  const hasAnswers = questions.some(q => q.correctAnswer && q.correctAnswer.length > 0 && q.correctAnswer !== 'B');
  if (!hasAnswers) {
    const answerKeyMatch = text.match(/(?:Answer Key|Correct Answers):\s*([\s\S]*)/i);
    if (answerKeyMatch) {
      const keyText = answerKeyMatch[1];
      questions.forEach((q, idx) => {
        const num = idx + 1;
        const r = new RegExp(`${num}\\.\\s*([A-D])`, 'i');
        const m = keyText.match(r);
        if (m) {
          const letter = m[1].toUpperCase();
          const foundOption = q.options.find(o => o.trim().toUpperCase().startsWith(letter));
          if (foundOption) {
            q.correctAnswer = foundOption;
          }
        }
      });
    }
  }
  
  return questions;
}

export default function NoteMaker({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [inputMode, setInputMode] = useState<'pdf' | 'text'>('pdf');
  const [step, setStep] = useState<'initial' | 'uploading' | 'action-selection' | 'processing' | 'result'>('initial');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  
  const [showHistory, setShowHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<'summary' | 'flashcards' | 'quiz' | 'audio'>('summary');
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
        if (data.type === 'note') {
          const titleLower = (data.title || '').toLowerCase();
          const textLower = (data.text || '').toLowerCase();
          
          const isFlashcard = titleLower.includes('flashcard') || textLower.includes('flashcards study set');
          const isEssay = titleLower.includes('essay') || titleLower.includes('feedback') || textLower.includes('essay grader feedback');
          const isYT = titleLower.includes('youtube') || textLower.includes('youtube summary');
          const isGrammar = titleLower.includes('grammar') || titleLower.includes('polish');
          const isSummary = titleLower.includes('summary') || titleLower.includes('summariser');
          const isContentGen = titleLower.includes('generated') || titleLower.includes('content_generation');

          if (!isFlashcard && !isEssay && !isYT && !isGrammar && !isSummary && !isContentGen) {
            items.push({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date()
            });
          }
        }
      });
      setHistoryItems(items);
    } catch (e) {
      console.error("Failed to load NoteMaker history:", e);
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
      console.error("Failed to delete note:", err);
    }
  };
  
  // Interactive Component States
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [flashcards, setFlashcards] = useState<{ question: string; answer: string }[]>([]);
  const [currentFlashcardIdx, setCurrentFlashcardIdx] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [viewMode, setViewMode] = useState<'interactive' | 'raw'>('interactive');

  const [quizQuestions, setQuizQuestions] = useState<{ question: string; options: string[]; correctAnswer: string; explanation: string }[]>([]);
  const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [revealedQuizAnswers, setRevealedQuizAnswers] = useState<number[]>([]);
  const explanationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAnswerSubmitted && explanationRef.current) {
      setTimeout(() => {
        explanationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [isAnswerSubmitted]);

  // Handle auto-scroll for Text Mode revelations too
  useEffect(() => {
    if (revealedQuizAnswers.length > 0) {
      // Small timeout to allow the DOM to update
      setTimeout(() => {
        const lastRevealed = document.getElementById(`explanation-${revealedQuizAnswers[revealedQuizAnswers.length - 1]}`);
        if (lastRevealed) {
          lastRevealed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [revealedQuizAnswers]);
  const [isSpeechFallback, setIsSpeechFallback] = useState(false);
  const [isPlayingFallback, setIsPlayingFallback] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 30 * 1024 * 1024) {
      setError("File is too large! Please select a PDF smaller than 30MB (Max 60 pages).");
      triggerVibration(20);
      return;
    }
    setFile(selected);
    setResult(null);
    setAudioData(null);
    setSaved(false);
    setSelectedAction(null);
    setStep('action-selection');
  };

  const processFile = async (action: string) => {
    if (!file && !inputText) return;

    // Deduct 2 coins for Super-note maker
    if (!deductCoins(2, "Super-note maker")) {
      return;
    }

    setSelectedAction(action);
    setUploadProgress(0);
    setError(null);
    setStep('uploading');
    
    // Clear speech synthesizer
    window.speechSynthesis.cancel();
    setIsSpeechFallback(false);
    setIsPlayingFallback(false);

    const formData = new FormData();
    formData.append('action', action);
    if (file) {
      formData.append('pdf', file);
    } else {
      formData.append('text', inputText);
    }

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/summarize', true);
      xhr.timeout = 180000; // 3 minute timeout

      // Supplement with actual progress if available and ahead
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      xhr.ontimeout = () => {
        const timeoutMsg = "The request timed out. This often happens with very large files or slow connections. Please try a smaller PDF.";
        setResult(timeoutMsg);
        setError(timeoutMsg);
        setStep('result');
      };

      xhr.onload = async () => {
        // progress cleared
        setUploadProgress(100);
        
        // Give a short delay for visual satisfaction before transition to AI processing mode
        setTimeout(async () => {
          setStep('processing');
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              setResult(data.text);
              setError(null);
              
              // Parse interactive components
              if (action === 'flashcards') {
                const parsedCards = parseFlashcards(data.text);
                setFlashcards(parsedCards);
                setCurrentFlashcardIdx(0);
                setIsCardFlipped(false);
                setViewMode('interactive');
              } else if (action === 'quiz') {
                const parsedQuiz = parseQuiz(data.text);
                setQuizQuestions(parsedQuiz);
                setRevealedQuizAnswers([]);
                setCurrentQuizIdx(0);
                setSelectedOption(null);
                setIsAnswerSubmitted(false);
                setQuizScore(0);
                setQuizCompleted(false);
                setViewMode('interactive');
              }
              
              let fetchedAudio = null;
              if (action === 'audio') {
                try {
                  const ttsResponse = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: data.text }),
                  });
                  if (!ttsResponse.ok) {
                    throw new Error("TTS failed");
                  }
                  const ttsContentType = ttsResponse.headers.get("content-type") || "";
                  if (!ttsContentType.includes("application/json")) {
                    throw new Error("Invalid TTS response format");
                  }
                  const ttsData = await ttsResponse.json();
                  if (ttsData.audio) {
                    if (ttsData.audio.startsWith('data:')) {
                      fetchedAudio = ttsData.audio;
                    } else {
                      fetchedAudio = `data:audio/wav;base64,${ttsData.audio}`;
                    }
                    setAudioData(fetchedAudio);
                  } else {
                    setIsSpeechFallback(true);
                  }
                } catch (ttsErr) {
                  console.warn("Gemini TTS failed, fallback to local SpeechSynthesis:", ttsErr);
                  setIsSpeechFallback(true);
                }
              }
              
              setStep('result');
              
              // Auto-save to Firebase
              if (auth.currentUser) {
                try {
                  await addDoc(collection(db, 'pocket_items'), {
                    userId: auth.currentUser.uid,
                    type: 'note',
                    subType: action,
                    text: data.text,
                    audioData: fetchedAudio,
                    title: file?.name || 'Document Note',
                    createdAt: serverTimestamp()
                  });
                  setSaved(true);
                } catch (e) {
                  console.error("Auto-save failed", e);
                }
              }
            } catch (err) {
              const parseError = "Error processing AI response. Please try again.";
              setResult(parseError);
              setError(parseError);
              setStep('result');
            }
          } else {
            try {
              let data: any = {};
              try {
                data = JSON.parse(xhr.responseText);
              } catch (e) {
                // If it's a 429 but not JSON, we can still show a friendly message
                if (xhr.status === 429) {
                  const rateLimitMsg = "⚠️ AI Tutor Notice: Rate Limit / Quota Exceeded\n\nThe Gemini API is currently busy or has reached its limit. Please try again in 60 seconds.";
                  setResult(rateLimitMsg);
                  setError(rateLimitMsg);
                  setStep('result');
                  return;
                }
                throw e;
              }

              if (xhr.status === 429 && data.text) {
                setResult(data.text);
                setError(data.text);
              } else if (data.error) {
                setResult(`Error: ${data.error}`);
                setError(`Error: ${data.error}`);
              } else {
                const genericError = `Error: Server returned status ${xhr.status}`;
                setResult(genericError);
                setError(genericError);
              }
            } catch {
              const finalError = `Error: Server returned status ${xhr.status}`;
              setResult(finalError);
              setError(finalError);
            }
            setStep('result');
          }
        }, 400);
      };

      xhr.onerror = () => {
        const networkError = "Network error occurred. This can happen if the file is too large for the network or the server is busy. Please try again with a smaller file.";
        setResult(networkError);
        setError(networkError);
        setStep('result');
      };

      xhr.send(formData);
    } catch (err) {
      // progress cleared
      console.error(err);
      const catchError = "An error occurred during upload.";
      setResult(catchError);
      setError(catchError);
      setStep('result');
    }
  };

  const startSpeechFallback = () => {
    if (!result) return;
    window.speechSynthesis.cancel();
    const cleanText = result.replace(/[*#_\-`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => {
      setIsPlayingFallback(false);
    };
    utterance.onerror = () => {
      setIsPlayingFallback(false);
    };
    synthRef.current = utterance;
    setIsPlayingFallback(true);
    window.speechSynthesis.speak(utterance);
  };

  const pauseSpeechFallback = () => {
    window.speechSynthesis.pause();
    setIsPlayingFallback(false);
  };

  const resumeSpeechFallback = () => {
    window.speechSynthesis.resume();
    setIsPlayingFallback(true);
  };

  const stopSpeechFallback = () => {
    window.speechSynthesis.cancel();
    setIsPlayingFallback(false);
  };

  const resetState = () => {
    window.speechSynthesis.cancel();
    setIsSpeechFallback(false);
    setIsPlayingFallback(false);
    setFile(null);
    setInputText('');
    setInputMode('pdf');
    setResult(null);
    setAudioData(null);
    setSaved(false);
    setSelectedAction(null);
    setFlashcards([]);
    setCurrentFlashcardIdx(0);
    setIsCardFlipped(false);
    setQuizQuestions([]);
    setCurrentQuizIdx(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setQuizScore(0);
    setQuizCompleted(false);
    setRevealedQuizAnswers([]);
    setStep('initial');
  };

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* FIXED/STICKY HEADER BAR */}
      <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200/80 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight line-clamp-1 text-zinc-900">
              <FileText className="w-5 h-5 text-purple-600 mr-2 shrink-0" />
              <span>Super Note-Maker</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Turn big PDFs into tiny notes</p>
          </div>
        </div>

        {auth.currentUser && (
          <button 
            onClick={() => {
              triggerVibration(15);
              setShowHistory(!showHistory);
              if (!showHistory) fetchHistory();
            }}
            className={`w-10 h-10 rounded-full border shadow-sm flex items-center justify-center transition-all active:scale-95 shrink-0 ${
              showHistory 
                ? 'bg-purple-600 text-white border-purple-600' 
                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200/60'
            }`}
          >
            <History className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 relative z-10">

      {showHistory ? (
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Your Saved Notes</h3>
          </div>
          
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
            {[
              { id: 'summary', label: 'Summary' },
              { id: 'quiz', label: 'Quiz' },
              { id: 'audio', label: 'Audio' },
              { id: 'flashcards', label: 'Flashcards' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setHistoryTab(tab.id as any)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                  historyTab === tab.id
                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              <span>Loading notes history...</span>
            </div>
          ) : historyItems.filter(item => {
              let guessedType = item.subType;
              if (!guessedType) {
                 if (item.audioData) guessedType = 'audio';
                 else if (item.text?.includes('**Q:') || item.text?.includes('**Question:') || item.text?.includes('*Q:')) guessedType = 'flashcards';
                 else if (item.text?.includes('1. ') && item.text?.includes('A) ')) guessedType = 'quiz';
                 else guessedType = 'summary';
              }
              return guessedType === historyTab;
          }).length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <p className="text-3xl mb-2">📝</p>
              <p className="text-sm">No {historyTab} history found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyItems.filter(item => {
                  let guessedType = item.subType;
                  if (!guessedType) {
                     if (item.audioData) guessedType = 'audio';
                     else if (item.text?.includes('**Q:') || item.text?.includes('**Question:') || item.text?.includes('*Q:')) guessedType = 'flashcards';
                     else if (item.text?.includes('1. ') && item.text?.includes('A) ')) guessedType = 'quiz';
                     else guessedType = 'summary';
                  }
                  return guessedType === historyTab;
              }).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    triggerVibration(15);
                    setResult(item.text);
                    setAudioData(item.audioData || null);
                    setSaved(true);
                    
                    let guessedType = item.subType;
                    if (!guessedType) {
                       if (item.audioData) guessedType = 'audio';
                       else if (item.text?.includes('**Q:') || item.text?.includes('**Question:') || item.text?.includes('*Q:')) guessedType = 'flashcards';
                       else if (item.text?.includes('1. ') && item.text?.includes('A) ')) guessedType = 'quiz';
                       else guessedType = 'summary';
                    }
                    
                    setSelectedAction(guessedType);
                    
                    if (guessedType === 'flashcards') {
                       setFlashcards(parseFlashcards(item.text));
                       setCurrentFlashcardIdx(0);
                       setIsCardFlipped(false);
                       setViewMode('interactive');
                    } else if (guessedType === 'quiz') {
                       setQuizQuestions(parseQuiz(item.text));
                       setCurrentQuizIdx(0);
                       setRevealedQuizAnswers([]);
                       setSelectedOption(null);
                       setIsAnswerSubmitted(false);
                       setQuizScore(0);
                       setQuizCompleted(false);
                       setViewMode('interactive');
                    } else if (guessedType === 'summary') {
                       setViewMode('interactive');
                    }
                    
                    setStep('result');
                    setShowHistory(false);
                  }}
                  className="bg-white border border-zinc-200/80 hover:border-purple-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                >
                  <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                    <h4 className="font-black text-zinc-900 group-hover:text-purple-600 transition-colors truncate">
                      {item.title || 'Lecture Notes'}
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
      ) : (
        <AnimatePresence mode="wait">
          {step === 'initial' && (
            <motion.div 
              key="initial"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6 max-w-2xl mx-auto"
            >
              {error && (
                <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4 text-left flex items-center gap-3 shadow-sm mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span className="text-sm font-bold text-red-900 leading-relaxed">{error}</span>
                </div>
              )}
              {/* Tab Selector */}
              <div className="flex bg-zinc-100 p-1 rounded-2xl border border-zinc-200 w-full max-w-sm mx-auto">
                <button
                  onClick={() => setInputMode('pdf')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${inputMode === 'pdf' ? 'bg-white text-purple-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  <FileText className="w-4 h-4" />
                  Upload PDF
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${inputMode === 'text' ? 'bg-white text-purple-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  <PenTool className="w-4 h-4" />
                  Paste Text Extract
                </button>
              </div>

              {inputMode === 'pdf' ? (
                <div 
                  className="h-56 rounded-[2rem] border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center bg-white p-6 text-center hover:border-purple-300 hover:bg-purple-50/10 transition-all cursor-pointer shadow-sm group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-16 h-16 bg-purple-50 group-hover:scale-110 group-hover:bg-purple-100 rounded-full flex items-center justify-center text-purple-600 mb-4 border border-purple-100 transition-all">
                    <FilePlus className="w-8 h-8" />
                  </div>
                  <p className="font-bold mb-1 text-zinc-900 text-sm md:text-base">Upload your big PDF</p>
                  <p className="text-xs text-zinc-400 mb-4 font-semibold">Max size: 30MB | Max pages: 60 (will extract PDF text)</p>
                  <button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-xl text-xs md:text-sm font-bold active:scale-[0.98] transition-all shadow-md shadow-purple-500/10">
                    Select File
                  </button>
                  <input 
                    type="file" 
                    accept="application/pdf" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                <div className="bg-white rounded-[2rem] border border-zinc-200 p-6 shadow-sm flex flex-col gap-4 text-left">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest block">Paste Textbook Chapter or PDF Extract</label>
                    <span className="text-xs font-bold text-zinc-400 bg-zinc-50 border border-zinc-200/60 px-2 py-0.5 rounded-lg">
                      {inputText.trim().split(/\s+/).filter(w => w.length > 0).length} words
                    </span>
                  </div>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste a large text document or raw lecture notes here (minimum 20 characters)... e.g., 'Cell biology is a branch of biology that studies the structure, function, and behavior of cells...'"
                    className="w-full h-48 p-4 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm bg-zinc-50/50 resize-none font-medium leading-relaxed"
                  />
                  <div className="flex gap-3 justify-end">
                    {inputText.trim().length > 0 && (
                      <button
                        onClick={() => setInputText('')}
                        className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold text-xs md:text-sm rounded-xl transition-all"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      disabled={inputText.trim().length < 20}
                      onClick={() => setStep('action-selection')}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm active:scale-[0.98] transition-all shadow-md shadow-purple-500/10 flex items-center gap-1.5 animate-pulse"
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* How It Works Collapsible Accordion */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] overflow-hidden shadow-sm mt-4">
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(10);
                    setHowItWorksOpen(!howItWorksOpen);
                  }}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-zinc-900 tracking-tight">ℹ️ How it Works</h4>
                      <p className="text-[10px] text-zinc-400 font-bold">The Cognitive Science & Reading Principles behind the tool</p>
                    </div>
                  </div>
                  <ChevronRight 
                    className={`w-5 h-5 text-zinc-400 transition-transform duration-300 ${howItWorksOpen ? 'rotate-90 text-purple-600' : ''}`} 
                  />
                </button>

                <AnimatePresence initial={false}>
                  {howItWorksOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                    >
                      <div className="px-5 pb-6 pt-1 border-t border-zinc-100 flex flex-col gap-5 text-left">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                          {/* Cognitive load theory column */}
                          <div className="bg-gradient-to-br from-zinc-50 to-zinc-100/50 p-4 rounded-2xl border border-zinc-200/60">
                            <h5 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">🧠 Helping Students Succeed</h5>
                            <p className="text-xs text-zinc-600 leading-relaxed font-medium">
                              High school and college students are faced with overwhelming reading lists, PDF syllabus loads, and complex textbook chapters daily. This creates high cognitive load, leading to fatigue and poor retention.
                            </p>
                            <p className="text-xs text-zinc-600 leading-relaxed font-medium mt-2">
                              Our Super Note-Maker leverages the Chunking Theory of Memory by breaking dense articles into scannable bullet-point summaries. This reduces eye-strain on mobile, lowers mental friction, and primes the brain for active recall.
                            </p>
                          </div>

                          {/* Bullet format explanation column */}
                          <div className="bg-gradient-to-br from-purple-50/30 to-indigo-50/20 p-4 rounded-2xl border border-purple-100/60">
                            <h5 className="text-xs font-black text-purple-400 uppercase tracking-wider mb-2">📱 Readability on Mobile Screen</h5>
                            <p className="text-xs text-zinc-600 leading-relaxed font-medium">
                              Dense text blocks on small 6-inch vertical mobile screens are highly fatiguing to consume.
                            </p>
                            <ul className="text-xs text-zinc-600 space-y-1.5 font-medium mt-2">
                              <li className="flex items-start gap-1.5">
                                <span className="text-purple-600 font-extrabold mt-0.5">•</span>
                                <span>Vertical Negative Space: Keeps the eye grounded during fast mobile scrolling.</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-purple-600 font-extrabold mt-0.5">•</span>
                                <span>High-Contrast Anchors: Emphasizes key ideas at a glance.</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-purple-600 font-extrabold mt-0.5">•</span>
                                <span>Bite-sized Consumption: Perfect for quick learning sessions on bus rides, waiting lines, or library breaks.</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {step === 'uploading' && (
            <motion.div 
              key="uploading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="bg-white rounded-[2rem] p-8 border border-zinc-200 shadow-xl flex flex-col items-center"
            >
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-6 relative">
                <FileText className="w-8 h-8 text-purple-600 animate-pulse" />
                {uploadProgress === 100 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-white"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </motion.div>
                )}
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2 truncate max-w-xs">{file?.name}</h3>
              <p className="text-sm text-zinc-500 mb-6 text-center">
                {uploadProgress < 100 
                  ? `Uploading File (${uploadProgress}%)` 
                  : 'Squeezing and Processing PDF with AI...'}
              </p>
              
              <div className="w-full bg-zinc-100 rounded-full h-3 mb-2 overflow-hidden border border-zinc-200">
                <motion.div 
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ ease: "linear" }}
                />
              </div>
              <div className="w-full flex justify-between text-xs text-zinc-400 font-bold px-1">
                <span>0%</span>
                <span>{Math.min(uploadProgress, 100)}%</span>
                <span>100%</span>
              </div>
            </motion.div>
          )}

          {step === 'action-selection' && (
            <motion.div 
              key="action-selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center"
            >
              <h3 className="text-xl font-extrabold text-zinc-900 text-center mb-1 mt-4 tracking-tight">
                {file ? "What do you want to do with this file?" : "What do you want to do with this text?"}
              </h3>
              <p className="text-xs text-zinc-500 text-center mb-6 font-semibold">Select an option to continue</p>
              
              <div className="flex flex-col gap-4 w-full max-w-md">
                <button 
                  onClick={() => processFile('summarize')}
                  className="group relative bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-purple-500/50 p-6 rounded-3xl transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="font-extrabold text-zinc-900 text-lg mb-1 flex items-center justify-between">
                    <span>Option A: Summarise notes</span>
                    <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-purple-600 transition-colors" />
                  </div>
                  <p className="text-sm text-zinc-500 font-medium">Get a concise, highly readable summary of the document.</p>
                </button>

                <button 
                  onClick={() => processFile('flashcards')}
                  className="group relative bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-blue-500/50 p-6 rounded-3xl transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="font-extrabold text-zinc-900 text-lg mb-1 flex items-center justify-between">
                    <span>Option B: Flashcards</span>
                    <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <p className="text-sm text-zinc-500 font-medium">Extract 10 key facts into easy-to-study flashcards.</p>
                </button>

                <button 
                  onClick={() => processFile('audio')}
                  className="group relative bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-green-500/50 p-6 rounded-3xl transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 mb-4 group-hover:scale-110 transition-transform">
                    <Headphones className="w-6 h-6" />
                  </div>
                  <div className="font-extrabold text-zinc-900 text-lg mb-1 flex items-center justify-between">
                    <span>Option C: Summary audio</span>
                    <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-green-600 transition-colors" />
                  </div>
                  <p className="text-sm text-zinc-500 font-medium">Generate an engaging TTS audio script from the content.</p>
                </button>

                <button 
                  onClick={() => processFile('quiz')}
                  className="group relative bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-orange-500/50 p-6 rounded-3xl transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-4 group-hover:scale-110 transition-transform">
                    <PenTool className="w-6 h-6" />
                  </div>
                  <div className="font-extrabold text-zinc-900 text-lg mb-1 flex items-center justify-between">
                    <span>Option D: Quiz</span>
                    <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-orange-600 transition-colors" />
                  </div>
                  <p className="text-sm text-zinc-500 font-medium">Test your knowledge with a custom 5-question quiz.</p>
                </button>
              </div>
            </motion.div>
          )}

          {step === 'processing' && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center p-12 bg-white rounded-[2rem] border border-zinc-200 shadow-lg mt-10"
            >
              <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mb-6 border border-purple-100 relative">
                <Loader2 className="w-10 h-10 text-purple-600 animate-spin absolute" />
                {selectedAction === 'summarize' && <FileText className="w-6 h-6 text-purple-600" />}
                {selectedAction === 'flashcards' && <BookOpen className="w-6 h-6 text-purple-600" />}
                {selectedAction === 'audio' && <Headphones className="w-6 h-6 text-purple-600" />}
                {selectedAction === 'quiz' && <PenTool className="w-6 h-6 text-purple-600" />}
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">
                {selectedAction === 'summarize' && 'Squeezing the juice...'}
                {selectedAction === 'flashcards' && 'Crafting flashcards...'}
                {selectedAction === 'audio' && 'Recording audio script...'}
                {selectedAction === 'quiz' && 'Preparing your quiz...'}
              </h3>
              <p className="text-zinc-500 text-sm font-semibold">Please wait while our AI works its magic</p>
            </motion.div>
          )}

          {step === 'result' && result && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              {/* IMMERSIVE QUIZ VIEW (Takes over the whole container) */}
              {selectedAction === 'quiz' && viewMode === 'interactive' ? (
                <motion.div 
                  initial={{ opacity: 0, x: '100%' }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="absolute inset-0 z-[60] bg-zinc-50 flex flex-col overflow-y-auto"
                >
                  <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-200/60 p-4 px-6 z-10 flex items-center justify-between">
                    <button 
                      onClick={() => setViewMode('raw')}
                      className="flex items-center gap-2 text-zinc-500 hover:text-purple-600 font-extrabold text-xs transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" /> Back to Notes
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 text-[10px] font-black rounded-full uppercase tracking-widest border border-purple-200">
                        Interactive Quiz
                      </span>
                      <button onClick={resetState} className="text-[10px] text-zinc-400 font-black hover:text-zinc-600 transition-colors uppercase tracking-widest">Close</button>
                    </div>
                  </div>

                  <div className="flex-1 p-6 md:p-10">
                    {!quizCompleted ? (
                      <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
                        <div className="flex justify-between items-center text-xs font-bold text-zinc-500 px-1">
                          <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                            Question {currentQuizIdx + 1} of {quizQuestions.length}
                          </span>
                          <span className="text-purple-600 bg-white px-3 py-1 rounded-full border-2 border-purple-100 shadow-sm font-black">Score: {quizScore}</span>
                        </div>
                        
                        <div className="w-full bg-zinc-200 rounded-full h-2.5 overflow-hidden border border-zinc-300">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-purple-700 transition-all duration-500"
                            style={{ width: `${((currentQuizIdx + 1) / quizQuestions.length) * 100}%` }}
                          />
                        </div>

                        <div className="bg-white border-2 border-purple-100 rounded-[2rem] p-8 shadow-sm text-left">
                          <h4 className="text-xl font-black text-zinc-900 leading-tight">
                            {quizQuestions[currentQuizIdx].question}
                          </h4>
                        </div>

                        <div className="flex flex-col gap-3">
                          {quizQuestions[currentQuizIdx].options.map((option, idx) => {
                            const letter = option.trim().toUpperCase().charAt(0);
                            const correctLetter = quizQuestions[currentQuizIdx].correctAnswer.trim().toUpperCase().charAt(0);
                            const isCorrect = letter === correctLetter || option === quizQuestions[currentQuizIdx].correctAnswer;
                            const isSelected = selectedOption === option;
                            
                            let cardStyle = "border-zinc-200 bg-white hover:bg-zinc-50 hover:border-purple-300 text-zinc-800";
                            let iconToRender = null;
                            
                            if (isAnswerSubmitted) {
                              if (isCorrect) {
                                cardStyle = "bg-green-50 border-green-500 text-green-900 font-extrabold shadow-md scale-[1.01]";
                                iconToRender = <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />;
                              } else if (isSelected) {
                                cardStyle = "bg-red-50 border-red-500 text-red-900 font-extrabold shadow-md";
                                iconToRender = <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-[12px] shrink-0">X</span>;
                              } else {
                                cardStyle = "opacity-40 border-zinc-100 bg-zinc-50 text-zinc-400 cursor-not-allowed";
                              }
                            }

                            return (
                              <button
                                key={idx}
                                disabled={isAnswerSubmitted}
                                onClick={() => {
                                  setSelectedOption(option);
                                  setIsAnswerSubmitted(true);
                                  if (isCorrect) {
                                    setQuizScore(prev => prev + 1);
                                  } else {
                                    saveMistakeToVault(
                                      'Study Note Quiz',
                                      quizQuestions[currentQuizIdx].question,
                                      option,
                                      `The correct answer is: ${quizQuestions[currentQuizIdx].correctAnswer}`
                                    ).catch(err => console.error("Failed to log Note quiz mistake:", err));
                                  }
                                }}
                                className={`w-full border-2 p-5 rounded-2xl text-left font-bold text-sm transition-all duration-200 flex items-center justify-between gap-4 ${cardStyle} ${!isAnswerSubmitted && 'active:scale-95'}`}
                              >
                                <span className="leading-snug">{option}</span>
                                {iconToRender}
                              </button>
                            );
                          })}
                        </div>

                        {isAnswerSubmitted && (
                          <motion.div 
                            ref={explanationRef}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col gap-4 mt-4"
                          >
                            <div className="bg-purple-600 p-6 rounded-[1.5rem] text-sm leading-relaxed text-white text-left shadow-lg relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-4 opacity-10">
                                <PenTool className="w-16 h-16" />
                              </div>
                              <span className="font-black text-purple-200 uppercase tracking-widest text-[10px] block mb-2">Expert Explanation</span>
                              <p className="font-bold leading-relaxed">{quizQuestions[currentQuizIdx].explanation}</p>
                            </div>
                            
                            <button
                              onClick={() => {
                                if (currentQuizIdx < quizQuestions.length - 1) {
                                  setCurrentQuizIdx(prev => prev + 1);
                                  setSelectedOption(null);
                                  setIsAnswerSubmitted(false);
                                } else {
                                  setQuizCompleted(true);
                                }
                              }}
                              className="w-full bg-zinc-900 hover:bg-black font-black text-white py-4 rounded-2xl active:scale-[0.98] transition-all shadow-xl mt-2 flex items-center justify-center gap-2 text-sm uppercase tracking-widest"
                            >
                              {currentQuizIdx < quizQuestions.length - 1 ? "Next Question" : "See Results"}
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </motion.div>
                        )}
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white border-2 border-purple-100 rounded-[2.5rem] p-8 max-w-md mx-auto text-center shadow-lg my-auto"
                      >
                        <div className="w-24 h-24 bg-purple-50 border-2 border-purple-200 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                          <span className="text-3xl font-black text-purple-700">{quizScore}/{quizQuestions.length}</span>
                        </div>

                        <h4 className="text-2xl font-black text-zinc-900 mb-2">Quiz Completed! 🎓</h4>
                        <p className="text-sm font-semibold text-zinc-500 mb-6 px-4 leading-relaxed">
                          {quizScore === 5 && "Absolutely Brilliant! 🌟 Aap toh genius hain! Double gold star for you! 🏆✨"}
                          {quizScore === 4 && "Wonderful Job! 🌟 Keep up the amazing progress, you're so close to perfection! 🚀"}
                          {quizScore === 3 && "Good Effort! 📚 Keep studying the summary and you'll score higher next time! 💪"}
                          {quizScore < 3 && "Keep practicing! 🧠 Revision is the key to learning. Give it another try! ❤️"}
                        </p>
                        
                        <div className="flex flex-col gap-3">
                          <button
                            onClick={() => {
                              setCurrentQuizIdx(0);
                              setSelectedOption(null);
                              setIsAnswerSubmitted(false);
                              setQuizScore(0);
                              setQuizCompleted(false);
                              setViewMode('interactive');
                            }}
                            className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl transition-all shadow-md active:scale-95"
                          >
                            Retake Quiz 🔄
                          </button>
                          <button
                            onClick={() => setViewMode('raw')}
                            className="w-full py-4 bg-white hover:bg-zinc-50 text-zinc-500 font-black rounded-2xl transition-all border border-zinc-200 active:scale-95"
                          >
                            Close Results
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-purple-50 p-4 rounded-2xl border border-purple-100">
                <div className="flex items-center gap-3 truncate">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-bold truncate text-purple-900">{file?.name || 'Pasted Text Extract'}</span>
                  <span className="px-2 py-0.5 bg-purple-200/50 text-purple-700 text-[10px] font-bold rounded-md uppercase tracking-wider">
                    {selectedAction}
                  </span>
                </div>
                <button onClick={resetState} className="text-xs text-purple-700 font-extrabold px-3 py-1 bg-purple-100 rounded-lg hover:bg-purple-200/50 transition-colors">NEW</button>
              </div>
              
              {error && (
                <div className="bg-red-50 border-2 border-red-100 rounded-[2rem] p-6 text-left flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Error Occurred</span>
                  </div>
                  <div className="text-sm font-bold text-red-900 leading-relaxed whitespace-pre-wrap">
                    {error}
                  </div>
                  <button 
                    onClick={() => processFile(selectedAction || 'note')}
                    className="mt-2 self-start px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-red-600/20"
                  >
                    Try Again 🔄
                  </button>
                </div>
              )}

              <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-zinc-200 shadow-md">
                {/* View mode toggle for Flashcards or Quiz */}
                {((selectedAction === 'flashcards' && flashcards.length > 0) || (selectedAction === 'quiz' && quizQuestions.length > 0)) && (
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-100">
                    <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      Interactive Game Mode
                    </h3>
                    <div className="bg-zinc-100 p-1 rounded-xl flex border border-zinc-200">
                      <button 
                        onClick={() => setViewMode('interactive')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'interactive' ? 'bg-white text-purple-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
                      >
                        🎯 Play Game
                      </button>
                      <button 
                        onClick={() => setViewMode('raw')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'raw' ? 'bg-white text-purple-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
                      >
                        📝 Text Mode
                      </button>
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------- */}
                {/* INTERACTIVE FLASHCARDS */}
                {/* -------------------------------------------------- */}
                {selectedAction === 'flashcards' && flashcards.length > 0 && viewMode === 'interactive' ? (
                  <div className="flex flex-col items-center gap-6 py-4">
                    <div className="w-full max-w-md bg-zinc-100 rounded-full h-2.5 overflow-hidden border border-zinc-200">
                      <div 
                        className="h-full bg-purple-600 transition-all duration-300"
                        style={{ width: `${((currentFlashcardIdx + 1) / flashcards.length) * 100}%` }}
                      />
                    </div>
                    
                    <div className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                      Flashcard {currentFlashcardIdx + 1} of {flashcards.length}
                    </div>

                    {/* Flip Card Container */}
                    <div 
                      onClick={() => setIsCardFlipped(!isCardFlipped)}
                      className="w-full max-w-md h-72 cursor-pointer select-none [perspective:1000px]"
                    >
                      <div 
                        style={{
                          transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                          transformStyle: 'preserve-3d',
                          transition: 'transform 0.6s'
                        }}
                        className="relative w-full h-full duration-500"
                      >
                        {/* Front (Question) */}
                        <div 
                          style={{ backfaceVisibility: 'hidden' }}
                          className="absolute inset-0 w-full h-full bg-white border-2 border-zinc-200 hover:border-purple-300 rounded-[2rem] p-8 flex flex-col justify-between shadow-md"
                        >
                          <div className="text-[10px] uppercase font-black tracking-widest text-purple-600">Question</div>
                          <div className="text-base font-extrabold text-zinc-900 text-center flex-1 flex items-center justify-center leading-snug">
                            {flashcards[currentFlashcardIdx].question}
                          </div>
                          <div className="text-center text-xs text-zinc-400 font-bold">Click card to reveal answer 🔄</div>
                        </div>

                        {/* Back (Answer) */}
                        <div 
                          style={{ 
                            backfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)'
                          }}
                          className="absolute inset-0 w-full h-full bg-purple-50 border-2 border-purple-200 rounded-[2rem] p-8 flex flex-col justify-between shadow-md"
                        >
                          <div className="text-[10px] uppercase font-black tracking-widest text-purple-700">Answer</div>
                          <div className="text-sm font-bold text-zinc-800 text-center flex-1 flex items-center justify-center leading-relaxed">
                            {flashcards[currentFlashcardIdx].answer}
                          </div>
                          <div className="text-center text-xs text-purple-500 font-bold">Click card to flip back 🔄</div>
                        </div>
                      </div>
                    </div>

                    {/* Card Nav Controls */}
                    <div className="flex items-center gap-4 w-full max-w-md justify-between mt-2">
                      <button 
                        disabled={currentFlashcardIdx === 0}
                        onClick={() => {
                          setIsCardFlipped(false);
                          setTimeout(() => {
                            setCurrentFlashcardIdx(prev => prev - 1);
                          }, 150);
                        }}
                        className="px-5 py-2.5 rounded-xl border border-zinc-200 bg-white font-bold hover:bg-zinc-50 disabled:opacity-40 transition-all text-sm text-zinc-700 flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" /> Previous
                      </button>
                      <button 
                        onClick={() => setIsCardFlipped(!isCardFlipped)}
                        className="px-5 py-2.5 rounded-xl bg-purple-100 text-purple-700 hover:bg-purple-200/60 font-extrabold transition-all text-sm"
                      >
                        Flip 🔄
                      </button>
                      <button 
                        disabled={currentFlashcardIdx === flashcards.length - 1}
                        onClick={() => {
                          setIsCardFlipped(false);
                          setTimeout(() => {
                            setCurrentFlashcardIdx(prev => prev + 1);
                          }, 150);
                        }}
                        className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-white transition-all text-sm flex items-center gap-1"
                      >
                        Next <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* -------------------------------------------------- */}
                {/* STANDARD TEXT VIEW MODE / LIST VIEW */}
                {/* -------------------------------------------------- */}
                {(viewMode === 'raw' || (selectedAction !== 'flashcards' && selectedAction !== 'quiz')) && (
                  <div className="text-left">
                    {!(selectedAction === 'flashcards' || selectedAction === 'quiz') && (
                      <h3 className="text-sm font-black text-zinc-400 mb-6 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        Result
                      </h3>
                    )}

                    {selectedAction === 'flashcards' && viewMode === 'raw' && flashcards.length > 0 ? (
                      <div className="space-y-6">
                        {flashcards.map((card, idx) => (
                          <div key={idx} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 shadow-sm">
                            <div className="text-[10px] uppercase font-black tracking-widest text-purple-600 mb-2">Flashcard {idx + 1}</div>
                            <div className="font-extrabold text-zinc-900 mb-2 leading-snug">{card.question}</div>
                            <div className="h-px bg-zinc-200 my-3" />
                            <div className="text-sm font-semibold text-zinc-600 leading-relaxed">{card.answer}</div>
                          </div>
                        ))}
                      </div>
                    ) : selectedAction === 'quiz' && viewMode === 'raw' && quizQuestions.length > 0 ? (
                      <div className="space-y-8">
                        {quizQuestions.map((q, idx) => {
                          const isRevealed = revealedQuizAnswers.includes(idx);
                          return (
                            <div key={idx} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 shadow-sm">
                              <div className="text-[10px] uppercase font-black tracking-widest text-purple-600 mb-3">Question {idx + 1}</div>
                              <div className="font-extrabold text-zinc-900 mb-4 leading-snug">{q.question}</div>
                              <div className="grid grid-cols-1 gap-2 mb-4">
                                {q.options.map((opt, oIdx) => {
                                  const isCorrect = opt.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase() || 
                                                  (opt.startsWith(q.correctAnswer.trim().charAt(0) + ")") && q.correctAnswer.length === 1);
                                  
                                  return (
                                    <div 
                                      key={oIdx} 
                                      className={`p-3 rounded-xl text-xs font-bold border transition-all duration-300 ${
                                        isRevealed && isCorrect 
                                          ? 'bg-green-100 border-green-300 text-green-800 scale-[1.02]' 
                                          : 'bg-white border-zinc-200 text-zinc-600'
                                      }`}
                                    >
                                      {opt} {isRevealed && isCorrect && "✓"}
                                    </div>
                                  );
                                })}
                              </div>

                              {!isRevealed ? (
                                <button
                                  onClick={() => setRevealedQuizAnswers(prev => [...prev, idx])}
                                  className="w-full py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-black rounded-xl border border-dashed border-purple-200 transition-all flex items-center justify-center gap-2 group"
                                >
                                  <Eye className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                                  Show Answer & Explanation
                                </button>
                              ) : (
                                <div className="space-y-3">
                                  <div className="bg-green-50/80 p-3 rounded-xl border border-green-100 text-xs text-green-800 font-bold flex items-center gap-2">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Correct Answer: {q.correctAnswer}
                                  </div>
                                  <div 
                                    id={`explanation-${idx}`}
                                    className="bg-white/80 p-4 rounded-xl border border-zinc-100 text-xs text-zinc-500 leading-relaxed shadow-sm"
                                  >
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <Info className="w-3 h-3 text-purple-500" />
                                      <span className="font-black text-zinc-700 uppercase tracking-tighter">Teacher's Explanation</span>
                                    </div>
                                    {q.explanation}
                                  </div>
                                  <button
                                    onClick={() => setRevealedQuizAnswers(prev => prev.filter(i => i !== idx))}
                                    className="text-[10px] text-zinc-400 font-bold hover:text-zinc-600 transition-colors uppercase tracking-widest pt-1"
                                  >
                                    Hide Answer
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-zinc-800 leading-relaxed whitespace-pre-wrap break-words [&_pre]:overflow-x-auto [&_table]:overflow-x-auto [&_img]:max-w-full">
                        <GlobalMarkdown>{result}</GlobalMarkdown>
                      </div>
                    )}
                  </div>
                )}
                
                {/* -------------------------------------------------- */}
                {/* AUDIO CONTROLS (NATIVE OR FALLBACK SpeechSynthesis) */}
                {/* -------------------------------------------------- */}
                {audioData && (
                  <div className="mt-8 pt-6 border-t border-zinc-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <Headphones className="w-4 h-4 text-green-600" />
                        Audio Summary
                      </h4>
                      <a 
                        href={audioData} 
                        download={file?.name ? `${file.name.replace('.pdf', '')}-audio.wav` : 'summary-audio.wav'} 
                        className="text-[10px] bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 transition-colors border border-green-200 shadow-sm"
                      >
                        <Download className="w-3 h-3" /> Download Audio
                      </a>
                    </div>
                    <div className="bg-zinc-50 p-2 rounded-xl border border-zinc-200">
                      <audio src={audioData} controls className="w-full h-12 opacity-90 contrast-125" />
                    </div>
                  </div>
                )}

                {isSpeechFallback && (
                  <div className="mt-8 pt-6 border-t border-zinc-200">
                    <h4 className="text-xs font-black text-zinc-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                      <Headphones className="w-4 h-4 text-purple-600" />
                      Audio Study Companion
                    </h4>
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-5 rounded-2xl border border-purple-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-600/10 rounded-full flex items-center justify-center text-purple-600">
                          <Volume2 className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-extrabold text-purple-900">Pocket Teacher Voice</p>
                          <p className="text-xs text-purple-500 font-semibold">
                            {isPlayingFallback ? "Playing audio lesson..." : "Click play to listen to this summary"}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2.5">
                        {!isPlayingFallback ? (
                          <button 
                            onClick={startSpeechFallback}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-sm"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            Listen Now
                          </button>
                        ) : (
                          <>
                            <button 
                              onClick={pauseSpeechFallback}
                              className="px-4 py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold text-xs transition-all"
                            >
                              Pause
                            </button>
                            <button 
                              onClick={stopSpeechFallback}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                              Stop
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="mt-10 pt-6 border-t border-zinc-200 flex justify-end gap-3">
                  <button 
                    onClick={() => exportNotesToPDF(file?.name || 'StudyNotes.pdf', result || '', selectedAction || 'note')}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 transition-all active:scale-[0.98] shadow-sm cursor-pointer"
                  >
                    <Download className="w-4.5 h-4.5 text-purple-600" />
                    Save PDF
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
        </AnimatePresence>
      )}
      </div>
    </div>
  );
}
