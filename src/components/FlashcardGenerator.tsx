import { getApiUrl } from '../utils/api';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Layers, 
  Loader2, 
  ArrowLeft, 
  ChevronRight, 
  ChevronLeft, 
  Copy, 
  Check, 
  Shuffle, 
  History, 
  Trash2, 
  Calendar, 
  Brain, 
  Sparkles, 
  Zap, 
  Flame, 
  RotateCcw, 
  CheckCircle2, 
  UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { deductCoins, getCoins } from '../utils/coins';
import GlobalMarkdown from './GlobalMarkdown';

import { getUserProfileData } from '../utils/profile';

interface Flashcard {
  question: string;
  answer: string;
}

const getDynamicQuickTopics = () => {
  const profile = getUserProfileData();
  const stream = (profile.stream || '').toLowerCase();
  const country = (profile.country || '').toLowerCase();
  const isIndia = country.includes('india');

  if (stream.includes('med') || stream.includes('bio')) {
    return [
      { label: 'Cell Division & Mitosis', icon: '🧬' },
      { label: 'DNA Replication & Transcription', icon: '🧪' },
      { label: 'Human Circulatory System', icon: '🫀' },
      { label: 'Photosynthesis Light Reactions', icon: '🌿' },
      { label: 'Enzyme Kinetics & Inhibitors', icon: '⚡' },
      { label: isIndia ? 'NEET High-Yield Genetics' : 'AP Biology Key Concepts', icon: '🎯' },
    ];
  }

  if (stream.includes('business') || stream.includes('econ') || stream.includes('commerce')) {
    return [
      { label: 'Supply & Demand Elasticity', icon: '📈' },
      { label: 'Fiscal & Monetary Policy', icon: '🏦' },
      { label: 'Financial Statements & Balance Sheet', icon: '🧾' },
      { label: 'Market Structures (Monopoly vs Perfect)', icon: '💼' },
      { label: 'Opportunity Cost & Trade-offs', icon: '⚖️' },
      { label: 'Inflation & GDP Indicators', icon: '📊' },
    ];
  }

  if (stream.includes('human') || stream.includes('art') || stream.includes('law')) {
    return [
      { label: isIndia ? 'Indian Constitution & Fundamental Rights' : 'US Constitution & Bill of Rights', icon: '⚖️' },
      { label: 'French & Industrial Revolutions', icon: '📜' },
      { label: 'Rhetorical Devices & Argument Analysis', icon: '✍️' },
      { label: 'World War I & II Key Treaties', icon: '🌍' },
      { label: 'Major Philosophical Theories', icon: '🏛️' },
      { label: 'Sociological Perspectives', icon: '👥' },
    ];
  }

  if (stream.includes('cs') || stream.includes('computer') || stream.includes('code')) {
    return [
      { label: 'Python Recursion & Big-O Notation', icon: '💻' },
      { label: 'Data Structures (Trees & Hash Maps)', icon: '💾' },
      { label: 'Object-Oriented Programming (OOP)', icon: '⚙️' },
      { label: 'HTTP Protocols & REST APIs', icon: '🌐' },
      { label: 'Database Indexing & SQL Queries', icon: '🗄️' },
      { label: 'Sorting Algorithms (Merge vs Quick)', icon: '⚡' },
    ];
  }

  // Default / STEM Engineering
  return [
    { label: "Newton's Laws & Friction", icon: '⚡' },
    { label: 'Chemical Bonding & Orbitals', icon: '🧪' },
    { label: 'Integration by Parts & Calculus', icon: '📐' },
    { label: 'Thermodynamics & Heat Engines', icon: '🔥' },
    { label: 'Electromagnetic Induction & Optics', icon: '🧲' },
    { label: isIndia ? 'JEE Physics Core Formulas' : 'AP Physics Mechanics Key Laws', icon: '🎯' },
  ];
};

const parseFlashcardsFromText = (text: string): Flashcard[] => {
  const cards: Flashcard[] = [];
  const clean = text.replace(/\*\*/g, '');
  const lines = clean.split('\n');
  let currentQ = '';
  let currentA = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^Q\d+:\s*(.*)/i.test(line)) {
      if (currentQ && currentA) {
        cards.push({ question: currentQ, answer: currentA });
        currentQ = '';
        currentA = '';
      }
      currentQ = line.replace(/^Q\d+:\s*/i, '').trim();
    } else if (/^A\d+:\s*(.*)/i.test(line)) {
      currentA = line.replace(/^A\d+:\s*/i, '').trim();
    } else if (line && currentQ && !currentA) {
      currentQ += ' ' + line;
    } else if (line && currentQ && currentA) {
      currentA += ' ' + line;
    }
  }
  if (currentQ && currentA) {
    cards.push({ question: currentQ, answer: currentA });
  }
  return cards;
};

export default function FlashcardGenerator({ onBack }: { onBack: () => void }) {
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (showHistory) {
      setShowHistory(false);
    } else if (flashcards.length > 0) {
      setFlashcards([]);
      setShowConfig(false);
    } else if (showConfig) {
      setShowConfig(false);
    } else {
      onBack();
    }
  };

  const [sourceText, setSourceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [grades, setGrades] = useState<{ [key: number]: 'hard' | 'good' | 'easy' }>({});
  const [copied, setCopied] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);

  const [showConfig, setShowConfig] = useState(false);
  const [configCount, setConfigCount] = useState<number>(10);

  const flashcardSteps = [
    "Analyzing topic & cognitive anchors...",
    "Extracting high-yield concepts...",
    "Formulating active recall questions...",
    "Drafting 15-25 word concise answers...",
    "Polishing your active revision deck..."
  ];

  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragX = useMotionValue(0);
  const cardRotate = useTransform(dragX, [-200, 200], [-12, 12]);
  const cardOpacity = useTransform(dragX, [-250, -150, 0, 150, 250], [0.6, 0.9, 1, 0.9, 0.6]);

  const wordCount = sourceText.trim().split(/\s+/).filter(w => w.length > 0).length;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && flashcards.length === 0) {
      setLoadingProgress(0);
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 98) {
            clearInterval(interval);
            return 98;
          }
          const increment = Math.floor(Math.random() * 8) + 5;
          const nextVal = Math.min(prev + increment, 98);
          const stepIndex = Math.min(Math.floor(nextVal / 20), flashcardSteps.length - 1);
          setLoadingStep(stepIndex);
          return nextVal;
        });
      }, 300);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, flashcards]);

  useEffect(() => {
    if (flashcards.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        triggerVibration(12);
        setFlipped(prev => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prevCard();
      } else if (flipped && (e.key === '1' || e.key === 'h')) {
        handleSrsGrade('hard');
      } else if (flipped && (e.key === '2' || e.key === 'g')) {
        handleSrsGrade('good');
      } else if (flipped && (e.key === '3' || e.key === 'e')) {
        handleSrsGrade('easy');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flashcards.length, flipped, currentIndex]);

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
        const isFlashcard = data.title === 'Flashcards' || 
                            (data.text && data.text.includes('Flashcards Study Set')) ||
                            (data.title && data.title.toLowerCase().includes('flashcard'));
        if (isFlashcard) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date()
          });
        }
      });

      if (items.length > 10) {
        const toKeep = items.slice(0, 10);
        const toDelete = items.slice(10);
        for (const item of toDelete) {
          try {
            await deleteDoc(doc(db, 'pocket_items', item.id));
          } catch (err) {
            console.error("Failed to delete old flashcard item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to load history:", e);
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
      console.error("Failed to delete item:", err);
    }
  };

  const handleCopy = async () => {
    if (flashcards.length === 0) return;
    triggerVibration(10);
    const textToCopy = (flashcards || []).map((f, i) => `Q${i + 1}: ${f?.question || ''}\nA${i + 1}: ${f?.answer || ''}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard writeText fallback: ', err);
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err2) {
        console.error('Fallback copy failed: ', err2);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Please upload a chapter or notes file under 10MB for rapid flashcards.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    triggerVibration([20, 40]);
    setIsParsingFile(true);
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'txt' || ext === 'md') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setSourceText(text);
          triggerVibration(25);
        }
        setIsParsingFile(false);
      };
      reader.onerror = () => {
        setError("Failed to read text file.");
        setIsParsingFile(false);
      };
      reader.readAsText(file);
    } else {
      const coins = getCoins();
      if (coins < 2) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsParsingFile(false);
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Flashcards (PDF)", cost: 2 } }));
        return;
      }

      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('action', 'flashcards-json');

      try {
        const response = await fetch(getApiUrl('/api/summarize'), {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error("Failed to process document on server.");

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("Server returned invalid response format");
        }

        const data = await response.json();
        if (data.flashcards && Array.isArray(data.flashcards)) {
          deductCoins(2, "AI Flashcards (PDF)");
          setFlashcards(data.flashcards);
          setSourceText("");
          setCurrentIndex(0);
          setFlipped(false);
          setSaved(false);
          
          if (auth.currentUser) {
            try {
              const textContent = (data?.flashcards || []).map((f: any, i: number) => `**Q${i+1}**: ${f?.question || ''}\n**A${i+1}**: ${f?.answer || ''}`).join('\n\n');
              await addDoc(collection(db, 'pocket_items'), {
                userId: auth.currentUser.uid,
                type: 'note', 
                text: `**Flashcards Study Set**\n\n${textContent}`,
                title: 'Flashcards',
                createdAt: serverTimestamp()
              });
              setSaved(true);
            } catch (e) {
              console.error("Auto-save failed", e);
            }
          }
          triggerVibration([30, 50, 30]);
        } else if (data.text) {
          setSourceText(data.text);
          triggerVibration(30);
        } else {
          setError("No study material could be extracted from this document.");
        }
      } catch (err: any) {
        console.error("Document processing error:", err);
        setError("Failed to process PDF. Please try a cleaner document or paste text directly.");
      } finally {
        setIsParsingFile(false);
      }
    }
  };

  const handleGenerate = () => {
    if (!sourceText.trim()) return;
    setShowConfig(true);
    setConfigCount(10);
  };

  const handleGenerateReal = async (selectedCount: number) => {
    const coins = getCoins();
    if (coins < 2) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Flashcards", cost: 2 } }));
      return;
    }
    
    setLoading(true);
    setError(null);
    setFlashcards([]);
    setSaved(false);
    setCurrentIndex(0);
    setFlipped(false);
    setGrades({});
    setShowConfig(false);
    
    try {
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch(getApiUrl('/api/generate-flashcards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, topic: sourceText, gradeLevel, count: selectedCount }),
      });
      
      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Server Error (${response.status})`;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || parsed.message || errMsg;
        } catch (_) {
          errMsg = errText.substring(0, 100) || errMsg;
        }
        throw new Error(errMsg);
      }

      const cardContentType = response.headers.get("content-type") || "";
      if (!cardContentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }

      const data = await response.json();
      if (data.flashcards && Array.isArray(data.flashcards)) {
        deductCoins(2, "AI Flashcards");
        setFlashcards(data.flashcards);

        if (auth.currentUser) {
          try {
            const textContent = (data?.flashcards || []).map((f: any, i: number) => `**Q${i+1}**: ${f?.question || ''}\n**A${i+1}**: ${f?.answer || ''}`).join('\n\n');
            await addDoc(collection(db, 'pocket_items'), {
              userId: auth.currentUser.uid,
              type: 'note', 
              text: `**Flashcards Study Set**\n\n${textContent}`,
              title: sourceText.length < 35 ? sourceText : 'Flashcards',
              createdAt: serverTimestamp()
            });
            setSaved(true);
          } catch (e) {
            console.error("Auto-save failed", e);
          }
        }
      } else {
        setError(`Error: ${data.error || 'Failed to generate flashcards'}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate flashcards.");
    } finally {
      setLoading(false);
    }
  };

  const nextCard = () => {
    if (flashcards.length === 0) return;
    triggerVibration(15);
    setFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % flashcards.length);
  };

  const prevCard = () => {
    if (flashcards.length === 0) return;
    triggerVibration(15);
    setFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
  };

  const shuffleFlashcards = () => {
    triggerVibration(20);
    setFlipped(false);
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentIndex(0);
    setGrades({});
  };

  const handleSrsGrade = (grade: 'hard' | 'good' | 'easy') => {
    if (grade === 'hard') triggerVibration([25, 45]);
    else if (grade === 'good') triggerVibration(18);
    else if (grade === 'easy') triggerVibration([12, 25]);

    setGrades(prev => ({ ...prev, [currentIndex]: grade }));
    nextCard();
  };

  const completedCount = Object.keys(grades).length;
  const progressPercent = flashcards.length > 0 ? Math.round((completedCount / flashcards.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-5 pb-3.5 px-5 sm:px-6 z-30 border-b border-zinc-200/80 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleHeaderBack}
            className="w-10 h-10 bg-white hover:bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-all active:scale-95 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-black flex items-center tracking-tight text-zinc-900">
              <span className="w-7 h-7 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-600 flex items-center justify-center mr-2 shrink-0">
                <Brain className="w-4 h-4" />
              </span>
              <span>Active Recall Flashcards</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-bold line-clamp-1">Active Recall & Spaced Repetition</p>
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
                ? 'bg-pink-600 text-white border-pink-600' 
                : 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-600'
            }`}
            title="Saved Decks History"
          >
            <History className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-5 pb-24 z-10">

      {showHistory ? (
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-xs text-zinc-500 uppercase tracking-wider">Your Saved Flashcard Decks</h3>
            <span className="text-xs bg-pink-50 text-pink-700 border border-pink-200 font-black px-2.5 py-0.5 rounded-full">
              {(Array.isArray(historyItems) ? historyItems : []).length} Decks
            </span>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
              <span>Loading saved decks...</span>
            </div>
          ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-500 flex items-center justify-center mx-auto mb-3">
                <Brain className="w-6 h-6" />
              </div>
              <p className="text-base font-black text-zinc-800">No saved decks found yet</p>
              <p className="text-xs text-zinc-400 font-semibold mt-1">Generate any flashcard deck and it will be saved here automatically!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(historyItems || []).map((item) => {
                const deck = parseFlashcardsFromText(item.text);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      triggerVibration(15);
                      setFlashcards(deck);
                      setCurrentIndex(0);
                      setFlipped(false);
                      setSaved(true);
                      setShowHistory(false);
                    }}
                    className="bg-white border border-zinc-200/90 hover:border-pink-300 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-3">
                      <h4 className="font-black text-zinc-900 group-hover:text-pink-600 transition-colors truncate text-sm">
                        {item.title === 'Flashcards' ? 'Active Recall Revision Set' : item.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-pink-50 text-pink-700 border border-pink-200 font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-pink-500" />
                          {deck.length} Active Recall Cards
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : loading && flashcards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center max-w-md mx-auto"
        >
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-pink-500/20 rounded-full blur-2xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 rounded-3xl flex items-center justify-center shadow-xl shadow-pink-500/20 text-white">
              <Brain className="w-10 h-10 animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-1.5">Calibrating Active Deck...</h3>
          <p className="text-pink-600 font-black text-xs tracking-wider uppercase mb-6 min-h-[20px]">
            {flashcardSteps[loadingStep]}
          </p>

          <div className="w-full bg-zinc-200/80 rounded-full h-3 mb-3 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-8">
            {loadingProgress}% Ready
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-zinc-200 shadow-sm text-xs font-bold text-zinc-600 max-w-xs flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Answers are strictly condensed to 15–25 words for lightning-fast memory recall.</span>
          </div>
        </motion.div>
      ) : flashcards.length === 0 ? (
        showConfig ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full py-4"
          >
            <div className="bg-white rounded-3xl border border-zinc-200/90 p-6 shadow-xl shadow-zinc-200/50 flex flex-col gap-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-pink-100/50 rounded-full blur-3xl pointer-events-none" />
              
              <div className="text-center">
                <span className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-200 text-pink-600 inline-flex items-center justify-center mb-2">
                  <Brain className="w-6 h-6" />
                </span>
                <h3 className="text-xl font-black text-zinc-900 tracking-tight">Active Recall Deck Size</h3>
                <p className="text-xs text-zinc-500 font-bold mt-1">Select the number of revision flashcards</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[5, 10, 15].map((num) => {
                  const isSelected = configCount === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        triggerVibration(10);
                        setConfigCount(num);
                      }}
                      className={`py-4 rounded-2xl font-black text-lg border transition-all active:scale-[0.97] cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-gradient-to-tr from-pink-500 to-rose-600 border-pink-500 text-white shadow-lg shadow-pink-500/25'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <span className="text-2xl">{num}</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider mt-0.5 ${
                        isSelected ? 'text-pink-100' : 'text-zinc-400'
                      }`}>Cards</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3 bg-pink-50/70 border border-pink-200/80 rounded-2xl text-[11px] font-bold text-pink-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-600 shrink-0" />
                <span>Every card includes a punchy 15–25 word answer key and Spaced Repetition grading.</span>
              </div>

              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(15);
                    setShowConfig(false);
                  }}
                  className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 font-black text-xs active:scale-[0.98] transition-all cursor-pointer"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(20);
                    handleGenerateReal(configCount);
                  }}
                  className="flex-[2] bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:to-amber-600 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-pink-500/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-pink-500/30"
                >
                  <Zap className="w-4 h-4" />
                  <span>Start Revision Deck</span>
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
            <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-pink-50 via-purple-50 to-indigo-50 border border-pink-200/70 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white shadow-xs border border-pink-200 text-pink-600 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-zinc-900 leading-tight">Active Recall & Rapid Revision</p>
                <p className="text-[11px] text-zinc-500 font-bold leading-tight mt-0.5">Enter any topic or paste your notes to generate study cards.</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-pink-500" />
                  Quick Revision Prompts
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {getDynamicQuickTopics().map((topic, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      triggerVibration(10);
                      setSourceText(topic.label);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:border-pink-300 hover:bg-pink-50/50 text-[11px] font-bold text-zinc-700 hover:text-pink-800 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>{topic.icon}</span>
                    <span>{topic.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mb-3">
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Type any subject topic (e.g., 'Photosynthesis Light Dependent Reactions') or paste full study notes..."
                className="w-full min-h-[180px] sm:min-h-[200px] p-4 sm:p-5 pb-8 rounded-3xl border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 resize-none focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all shadow-sm font-semibold text-sm leading-relaxed"
              />
              <div className="absolute bottom-3 right-4 text-[11px] font-black text-zinc-400 bg-zinc-50 px-2.5 py-0.5 rounded-full border border-zinc-200/80">
                {wordCount} words
              </div>
            </div>

            <div className="mb-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 px-4 bg-white hover:bg-zinc-50 active:scale-98 border border-zinc-200 text-zinc-700 hover:text-zinc-900 rounded-2xl font-black text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
              >
                {isParsingFile ? (
                  <div className="flex items-center gap-2 text-pink-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Parsing Document...</span>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 text-pink-500" />
                    <span>Upload Notes</span>
                  </>
                )}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".pdf,.txt,.md,.docx" 
                className="hidden" 
              />
            </div>

            {error && <p className="text-red-600 text-xs mb-3 font-bold bg-red-50 p-3 rounded-2xl border border-red-200">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={!sourceText.trim() || loading || isParsingFile}
              className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:to-amber-600 text-white py-4 rounded-2xl font-black text-base shadow-xl shadow-pink-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 border border-pink-500/30 cursor-pointer"
            >
              <Brain className="w-5 h-5" />
              <span>Generate Active Recall Deck</span>
            </button>
          </div>
        )
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col max-w-md mx-auto w-full"
        >
          <div className="mb-4 bg-white border border-zinc-200/90 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-zinc-600 flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-pink-500" />
                <span>Card {currentIndex + 1} of {flashcards.length}</span>
              </span>
              <span className="text-pink-600 bg-pink-50 border border-pink-200 px-2.5 py-0.5 rounded-full text-[10px]">
                {progressPercent}% Studied
              </span>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden border border-zinc-200/60">
              <div 
                className="bg-gradient-to-r from-pink-500 to-rose-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / flashcards.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="relative w-full h-[360px] sm:h-[390px] mb-5">
            <div className={`absolute -inset-2 rounded-[2.5rem] blur-2xl opacity-30 transition-colors duration-500 pointer-events-none ${
              flipped 
                ? 'bg-gradient-to-tr from-indigo-500 to-purple-600' 
                : 'bg-gradient-to-tr from-pink-500 to-rose-500'
            }`} />

            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.75}
              onDragEnd={(_, info) => {
                const swipeThreshold = 60;
                if (info.offset.x > swipeThreshold || info.velocity.x > 300) {
                  prevCard();
                } else if (info.offset.x < -swipeThreshold || info.velocity.x < -300) {
                  nextCard();
                }
              }}
              style={{ x: dragX, rotate: cardRotate, opacity: cardOpacity }}
              whileDrag={{ scale: 1.02, cursor: 'grabbing' }}
              className="w-full h-full cursor-grab active:cursor-grabbing select-none"
            >
              <div
                onClick={() => {
                  if (Math.abs(dragX.get()) < 10) {
                    triggerVibration(12);
                    setFlipped(!flipped);
                  }
                }}
                style={{ perspective: 1200 }}
                className="w-full h-full relative"
              >
                <div
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}
                  className="w-full h-full relative rounded-3xl shadow-xl"
                >
                  <div
                    style={{ backfaceVisibility: 'hidden' }}
                    className="absolute inset-0 w-full h-full rounded-3xl p-6 sm:p-7 border border-pink-200/90 bg-gradient-to-br from-pink-50/95 via-pink-100/60 to-white flex flex-col justify-between text-center overflow-hidden"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-black uppercase tracking-wider text-pink-700 bg-pink-100 border border-pink-200 px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                        <HelpCircleIcon className="w-3 h-3 text-pink-600" />
                        Active Recall Question
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400">
                        Tap or Space to Flip
                      </span>
                    </div>

                    <div className="my-auto py-3 max-h-[220px] overflow-y-auto pr-1 select-text scrollbar-thin">
                      <div className="text-base sm:text-lg font-black text-zinc-900 leading-snug">
                        <GlobalMarkdown>
                          {flashcards[currentIndex]?.question || ''}
                        </GlobalMarkdown>
                      </div>
                    </div>

                    <div className="text-[11px] font-extrabold text-pink-600 flex items-center justify-center gap-1 animate-pulse">
                      <span>👆</span>
                      <span>Recall in your mind, then tap to reveal answer</span>
                    </div>
                  </div>

                  <div
                    style={{ 
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)'
                    }}
                    className="absolute inset-0 w-full h-full rounded-3xl p-6 sm:p-7 border border-indigo-200/90 bg-gradient-to-br from-indigo-50/95 via-indigo-100/60 to-white flex flex-col justify-between text-center overflow-hidden"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                        <Sparkles className="w-3 h-3 text-indigo-600" />
                        Concise Answer Key (15–25 Words)
                      </span>
                      <span className="text-[10px] font-bold text-indigo-400">
                        Rate Below 👇
                      </span>
                    </div>

                    <div className="my-auto py-3 max-h-[220px] overflow-y-auto pr-1 select-text scrollbar-thin">
                      <div className="text-sm sm:text-base font-bold text-indigo-950 leading-relaxed text-left sm:text-center">
                        <GlobalMarkdown>
                          {flashcards[currentIndex]?.answer || ''}
                        </GlobalMarkdown>
                      </div>
                    </div>

                    <div className="text-[11px] font-extrabold text-indigo-600 flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Rate your active recall below to optimize memory</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {flipped ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-3.5 shadow-sm space-y-2 mb-4">
              <div className="text-center text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Spaced Repetition: How well did you remember?
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => handleSrsGrade('hard')}
                  className="py-3 px-2 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                >
                  <span className="text-sm">🔴</span>
                  <span>Hard (Again)</span>
                </button>
                <button 
                  onClick={() => handleSrsGrade('good')}
                  className="py-3 px-2 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                >
                  <span className="text-sm">🟡</span>
                  <span>Good (Review)</span>
                </button>
                <button 
                  onClick={() => handleSrsGrade('easy')}
                  className="py-3 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                >
                  <span className="text-sm">🟢</span>
                  <span>Easy (Mastered)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full px-2 mb-4">
              <button 
                onClick={prevCard} 
                className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer"
                title="Previous Card (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                onClick={() => {
                  triggerVibration(12);
                  setFlipped(true);
                }}
                className="px-5 py-3 rounded-2xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-pink-600" />
                <span>Reveal Answer</span>
              </button>

              <button 
                onClick={nextCard} 
                className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer"
                title="Next Card (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button 
              onClick={handleCopy}
              className="flex-1 py-3.5 rounded-2xl font-black text-xs shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 border bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Deck Copied!" : "Copy Deck"}</span>
            </button>
            <button 
              onClick={shuffleFlashcards}
              title="Shuffle Deck Order"
              className="px-4 py-3.5 rounded-2xl font-black text-xs shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 border bg-white hover:bg-zinc-50 text-purple-700 border-zinc-200 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              <span>Shuffle</span>
            </button>
            <button 
              onClick={() => {
                triggerVibration(15);
                setFlashcards([]);
                setSourceText('');
              }}
              className="px-4 py-3.5 rounded-2xl font-black text-xs shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 border bg-white hover:bg-zinc-50 text-zinc-600 border-zinc-200 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>New Topic</span>
            </button>
          </div>
        </motion.div>
      )}
      </div>
    </div>
  );
}

function HelpCircleIcon(props: any) {
  return (
    <svg 
      {...props} 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}
