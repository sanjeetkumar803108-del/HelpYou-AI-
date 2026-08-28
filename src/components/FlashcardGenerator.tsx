import { getApiUrl } from '../utils/api';
import React, { useState, useRef, useEffect } from 'react';
import { Layers, Loader2, ArrowLeft, Save, ChevronRight, ChevronLeft, Copy, Check, Shuffle, History, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { deductCoins, getCoins } from '../utils/coins';

interface Flashcard {
  question: string;
  answer: string;
}

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

  // Custom count state variables
  const [showConfig, setShowConfig] = useState(false);
  const [configCount, setConfigCount] = useState<number>(10);
  const [isCustomCount, setIsCustomCount] = useState(false);

  const flashcardSteps = [
    "Reading study material...",
    "Extracting high-yield concepts...",
    "Formulating active recall questions...",
    "Drafting precise answers...",
    "Polishing your study deck..."
  ];

  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
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
      }, 350);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, flashcards]);
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

      // Keep only last 10 records, delete older ones
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async () => {
    if (flashcards.length === 0) return;
    triggerVibration(10);
    const textToCopy = (flashcards || []).map((f, i) => `Q${i + 1}: ${f?.question || ''}\nA${i + 1}: ${f?.answer || ''}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard writeText failed, trying fallback: ', err);
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      // Prevent scrolling to bottom
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          alert("Clipboard access is restricted. Please manually copy the cards.");
        }
      } catch (err2) {
        console.error('Fallback copy failed: ', err2);
        alert("Clipboard access is restricted. Please manually copy the cards.");
      }
      document.body.removeChild(textArea);
    }
  };

  // Framer Motion Drag values for Tinder-style swiping
  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-200, 200], [-15, 15]);

  const wordCount = sourceText.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handlePaste = async () => {
    try {
      triggerVibration(15);
      const text = await navigator.clipboard.readText();
      if (text) {
        setSourceText(text);
      }
    } catch (err) {
      console.warn("Clipboard access blocked in iframe:", err);
      alert("Clipboard access is restricted. Please manually copy and paste your text (Ctrl+V) into the text area.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("For flashcards, please upload a specific chapter or notes file under 10MB. For entire books, use the Super Note-Maker!");
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
      // Check if user has at least 2 coins before starting, but do not deduct yet!
      const coins = getCoins();
      if (coins < 2) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsParsingFile(false);
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Flashcards (PDF)", cost: 2 } }));
        return;
      }

      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('action', 'flashcards-json'); // Directly generate flashcards for speed

      try {
        const response = await fetch(getApiUrl('/api/summarize'), {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error("Failed to process document on server.");
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("Server returned invalid response format");
        }

        const data = await response.json();
        if (data.flashcards && Array.isArray(data.flashcards)) {
          // Deduct 2 coins now that the output has been successfully generated by the AI
          deductCoins(2, "AI Flashcards (PDF)");

          setFlashcards(data.flashcards);
          setSourceText(""); // Clear text since we have cards
          setCurrentIndex(0);
          setFlipped(false);
          setSaved(false);
          
          // Auto-save if logged in
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
          // Fallback if it somehow returned text instead
          setSourceText(data.text);
          triggerVibration(30);
        } else {
          setError("No study material could be extracted from this document.");
        }
      } catch (err: any) {
        console.error("Document processing error:", err);
        setError("Failed to process PDF. Please ensure the file is readable and try again.");
      } finally {
        setIsParsingFile(false);
      }
    }
  };

  const handleGenerate = async () => {
    if (!sourceText.trim()) return;
    
    // Show configuration page first
    setShowConfig(true);
    setConfigCount(10);
    setIsCustomCount(false);
  };

  const handleGenerateReal = async (selectedCount: number) => {
    // Check if user has at least 2 coins before starting, but do not deduct yet!
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
        body: JSON.stringify({ text: sourceText, gradeLevel, count: selectedCount }),
      });
      
      if (!response.ok) {
        const errText = await response.text();
        console.error("Flashcard generation API error:", response.status, errText);
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
      if (data.flashcards) {
        // Deduct 2 coins now that the output has been successfully generated by the AI
        deductCoins(2, "AI Flashcards");

        setFlashcards(data.flashcards);
        // Auto-save
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
      } else {
        setError(`Error: ${data.error || 'Failed to generate'}`);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate flashcards.");
    } finally {
      setLoading(false);
    }
  };

  const nextCard = () => {
    setFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % flashcards.length);
    }, 180);
  };

  const shuffleFlashcards = () => {
    triggerVibration(20);
    setFlipped(false);
    setTimeout(() => {
      const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
      setFlashcards(shuffled);
      setCurrentIndex(0);
    }, 150);
  };

  const prevCard = () => {
    setFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    }, 180);
  };

  const handleSrsGrade = (grade: 'hard' | 'good' | 'easy') => {
    if (grade === 'hard') triggerVibration([30, 60]);
    else if (grade === 'good') triggerVibration(20);
    else if (grade === 'easy') triggerVibration([15, 30]);

    setGrades(prev => ({ ...prev, [currentIndex]: grade }));

    // Auto advancing logic
    setFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % flashcards.length);
    }, 180);
  };

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
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
              <Layers className="w-5 h-5 text-pink-600 mr-2 shrink-0" />
              <span>AI Flashcards</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Extract high-yield facts into study cards</p>
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
                ? 'bg-pink-650 text-white border-pink-650' 
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
            <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Your Saved Flashcard Decks</h3>
            <span className="text-xs bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full">{(Array.isArray(historyItems) ? historyItems : []).length} sets</span>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
              <span>Loading saved sets...</span>
            </div>
          ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <p className="text-3xl mb-2">🪄</p>
              <p className="text-sm">No saved decks found yet.</p>
              <p className="text-xs text-zinc-400 font-semibold mt-1">Generate flashcards and they will be saved here automatically!</p>
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
                    className="bg-white border border-zinc-200/80 hover:border-pink-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                      <h4 className="font-black text-zinc-900 group-hover:text-pink-600 transition-colors truncate">
                        {item.title === 'Flashcards' ? 'Flashcards Study Set' : item.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-pink-50 text-pink-700 border border-pink-100 font-black px-2.5 py-0.5 rounded-full">
                          {deck.length} Cards
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95"
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
          className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center max-w-md mx-auto"
        >
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-pink-500/10 rounded-full blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-pink-500 to-orange-500 rounded-3xl flex items-center justify-center shadow-xl shadow-pink-500/20">
              <Layers className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">Generating Deck...</h3>
          <p className="text-pink-600 font-bold text-sm tracking-wide uppercase mb-8 min-h-[20px]">
            {flashcardSteps[loadingStep]}
          </p>

          <div className="w-full bg-zinc-200/60 rounded-full h-3 mb-4 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-pink-600 to-orange-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-12">
            {loadingProgress}% Complete
          </div>

          <div className="w-full flex justify-center gap-4">
             <div className="w-32 h-40 bg-zinc-100 rounded-2xl animate-pulse" />
             <div className="w-32 h-40 bg-zinc-50 rounded-2xl animate-pulse scale-90 opacity-50" />
          </div>
        </motion.div>
      ) : flashcards.length === 0 ? (
        showConfig ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full py-4"
          >
            <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl shadow-zinc-100 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-pink-50 rounded-full blur-3xl opacity-60 pointer-events-none" />
              
              {/* Header */}
              <div className="text-center">
                <span className="text-4xl filter drop-shadow-sm select-none">🔮</span>
                <h3 className="text-2xl font-black text-zinc-900 mt-2 tracking-tight">How many Flashcards???</h3>
                <p className="text-xs text-zinc-500 font-bold mt-1">Select your preferred card count</p>
              </div>

              {/* Grid of Preset Options */}
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
                          ? 'bg-pink-500 border-pink-500 text-white shadow-lg shadow-pink-500/20'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <span className="text-xl">{num}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
                        isSelected ? 'text-pink-100' : 'text-zinc-400'
                      }`}>Cards</span>
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(15);
                    setShowConfig(false);
                  }}
                  className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 font-black text-sm active:scale-[0.98] transition-all cursor-pointer"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(20);
                    handleGenerateReal(configCount);
                  }}
                  className="flex-[2] bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-pink-500/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-pink-500/20"
                >
                  <span>🪄</span> Start Generating
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="flex-1 flex flex-col">
          <div className="relative mb-3">
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste your notes or textbook text here..."
              className="flex-1 w-full min-h-[250px] p-5 pb-8 rounded-3xl border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 resize-none focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all shadow-sm font-semibold text-sm leading-relaxed"
            />
            <div className={`absolute bottom-3 right-4 text-xs font-bold ${'text-zinc-400'}`}>
              {wordCount} words
            </div>
          </div>

          {/* Pastels Quick Input Buttons */}
          <div className="flex gap-3 mb-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 px-4 bg-orange-50 hover:bg-orange-100 active:scale-95 border border-orange-200/50 text-orange-700 rounded-2xl font-black text-xs md:text-sm shadow-sm transition-all flex items-center justify-center gap-2 relative cursor-pointer select-none"
            >
              {isParsingFile ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
                  <span>Parsing and Generating...</span>
                </div>
              ) : (
                <>
                  <span>📄</span> Upload PDF/Notes (Max-10MB)
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

          {error && <p className="text-red-600 text-sm mb-4 font-bold">{error}</p>}
          <button
            onClick={handleGenerate}
            disabled={!sourceText.trim() || loading || false || isParsingFile}
            className="w-full bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-pink-500/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center border border-pink-500/20 cursor-pointer"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Generate Flashcards"}
          </button>
        </div>
        )
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col"
        >
          
          {/* Flashcard UI */}
          <div className="flex-1 flex flex-col items-center justify-center mb-6 relative perspective-1000 w-full max-w-sm mx-auto min-h-[340px]">
            {/* Dynamic premium glowing backlight that pulses */}
            <div className={`absolute -inset-2 rounded-[2.5rem] blur-3xl opacity-20 transition-all duration-700 ease-in-out ${
              flipped 
                ? 'bg-gradient-to-tr from-indigo-500 via-purple-600 to-pink-500 scale-105 animate-pulse' 
                : 'bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-500 scale-105 animate-pulse'
            }`} />

            <div className="w-full h-80 relative z-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={flipped ? `back-${currentIndex}` : `front-${currentIndex}`}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.8}
                  onDragEnd={(event, info) => {
                    const swipeThreshold = 100;
                    if (info.offset.x > swipeThreshold) {
                      triggerVibration([20, 10]);
                      prevCard();
                    } else if (info.offset.x < -swipeThreshold) {
                      triggerVibration([20, 10]);
                      nextCard();
                    }
                  }}
                  style={{ x: dragX, rotate }}
                  whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
                  initial={{ rotateY: flipped ? -180 : 180, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: flipped ? 180 : -180, opacity: 0 }}
                  transition={{ type: "spring", damping: 20, stiffness: 380, mass: 0.4 }}
                  className={`absolute inset-0 w-full h-full rounded-[2.2rem] p-8 shadow-lg border flex flex-col items-center justify-center text-center backdrop-blur-3xl overflow-hidden cursor-grab active:cursor-grabbing select-none ${
                    flipped 
                      ? 'bg-gradient-to-br from-indigo-50/95 via-indigo-100/98 to-white/98 border-indigo-200' 
                      : 'bg-gradient-to-br from-pink-50/95 via-pink-100/98 to-white/98 border-pink-200'
                  }`}
                  onClick={() => {
                    if (Math.abs(dragX.get()) < 10) {
                      triggerVibration(12);
                      setFlipped(!flipped);
                    }
                  }}
                >
                  {/* Floating Glowing Orbs inside the card */}
                  <div className={`absolute top-[-25%] left-[-25%] w-56 h-56 rounded-full blur-[70px] opacity-15 transition-colors duration-700 ${flipped ? 'bg-indigo-500' : 'bg-pink-500'}`} />
                  <div className={`absolute bottom-[-25%] right-[-25%] w-56 h-56 rounded-full blur-[70px] opacity-15 transition-colors duration-700 ${flipped ? 'bg-blue-500' : 'bg-purple-500'}`} />

                  {/* Glassmorphic diagonal glare sweep */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent pointer-events-none" />

                  {/* Subtle Grid Pattern */}
                  <div className="absolute inset-0 bg-[radial-gradient(#00000004_1px,transparent_1px)] [background-size:16px_16px] opacity-60 pointer-events-none" />
                  
                  {/* Glowing vertical lines */}
                  <div className={`absolute top-0 bottom-0 left-0 w-[2px] bg-gradient-to-b ${flipped ? 'from-indigo-500/0 via-indigo-500/50 to-indigo-500/0' : 'from-pink-500/0 via-pink-500/50 to-pink-500/0'}`} />
                  <div className={`absolute top-0 bottom-0 right-0 w-[2px] bg-gradient-to-b ${flipped ? 'from-indigo-500/0 via-indigo-500/50 to-indigo-500/0' : 'from-pink-500/0 via-pink-500/50 to-pink-500/0'}`} />

                  {/* Corner Tech Brackets with premium glows */}
                  <div className={`absolute top-6 left-6 w-4 h-4 border-t-2 border-l-2 ${flipped ? 'border-indigo-400' : 'border-pink-400'}`} />
                  <div className={`absolute top-6 right-6 w-4 h-4 border-t-2 border-r-2 ${flipped ? 'border-indigo-400' : 'border-pink-400'}`} />
                  <div className={`absolute bottom-6 left-6 w-4 h-4 border-b-2 border-l-2 ${flipped ? 'border-indigo-400' : 'border-pink-400'}`} />
                  <div className={`absolute bottom-6 right-6 w-4 h-4 border-b-2 border-r-2 ${flipped ? 'border-indigo-400' : 'border-pink-400'}`} />

                  {/* Animated Top/Bottom glowing borders */}
                  <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r ${flipped ? 'from-transparent via-indigo-500/50 to-transparent' : 'from-transparent via-pink-500/50 to-transparent'}`} />
                  <div className={`absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r ${flipped ? 'from-transparent via-indigo-500/50 to-transparent' : 'from-transparent via-pink-500/50 to-transparent'}`} />

                  <span className={`absolute top-6 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    flipped 
                      ? 'text-indigo-800 bg-indigo-100 border border-indigo-200' 
                      : 'text-pink-800 bg-pink-100 border border-pink-200'
                  }`}>
                    {flipped ? '✨ Answer Key' : '❓ Question Card'}
                  </span>

                  <div className="my-auto px-2 max-h-[160px] overflow-y-auto">
                    <p className={`text-lg md:text-xl leading-relaxed ${flipped ? 'text-indigo-950 font-extrabold' : 'text-pink-950 font-black'}`}>
                      {flipped ? flashcards[currentIndex].answer : flashcards[currentIndex].question}
                    </p>
                  </div>

                  <span className="absolute bottom-6 text-[10px] font-bold tracking-widest text-zinc-400 uppercase flex items-center gap-1.5 animate-pulse">
                    <span>👆</span> Tap to flip or swipe to navigate
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* SPACED REPETITION ENGINE ON BACK, NAVIGATION ARROWS ON FRONT */}
            {flipped ? (
              <div className="flex flex-col items-center w-full mt-6 gap-3 z-10 px-2 animate-fadeIn">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">Rate Your Memory / Spaced Repetition</div>
                <div className="flex items-center justify-between w-full gap-2.5">
                  <button 
                    onClick={() => handleSrsGrade('hard')}
                    className="flex-1 py-3 px-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100/90 active:scale-95 border border-rose-200/60 text-rose-700 font-extrabold text-xs md:text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none"
                  >
                    <span>🔴</span> Hard
                  </button>
                  <button 
                    onClick={() => handleSrsGrade('good')}
                    className="flex-1 py-3 px-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100/90 active:scale-95 border border-amber-200/60 text-amber-700 font-extrabold text-xs md:text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none"
                  >
                    <span>🟡</span> Good
                  </button>
                  <button 
                    onClick={() => handleSrsGrade('easy')}
                    className="flex-1 py-3 px-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100/90 active:scale-95 border border-emerald-200/60 text-emerald-700 font-extrabold text-xs md:text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none"
                  >
                    <span>🟢</span> Easy
                  </button>
                </div>
                <div className="flex gap-2 mt-1.5">
                  {grades[currentIndex] && (
                    <span className="font-extrabold text-[9px] tracking-wider uppercase text-zinc-400 bg-white px-2 py-1 border border-zinc-200 rounded-full">
                      Last Grade: {grades[currentIndex].toUpperCase()}
                    </span>
                  )}
                  <span className="font-extrabold text-[10px] tracking-wider uppercase text-zinc-400 bg-zinc-100/80 px-4 py-1.5 border border-zinc-200/50 rounded-full">
                    Card {currentIndex + 1} of {flashcards.length}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full mt-8 px-4 z-10">
                <button onClick={prevCard} className="w-12 h-12 rounded-full bg-white shadow-sm border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <span className="font-extrabold text-xs tracking-wider uppercase text-zinc-500 bg-white px-4 py-2 border border-zinc-200 rounded-full shadow-sm">
                  Card {currentIndex + 1} of {flashcards.length}
                </span>
                <button onClick={nextCard} className="w-12 h-12 rounded-full bg-white shadow-sm border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex gap-2 mb-3">
            <button 
              onClick={handleCopy}
              className="flex-[2] py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 border bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 cursor-pointer"
            >
              {copied ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
              {copied ? "Copied!" : "Copy Cards"}
            </button>
            <button 
              onClick={shuffleFlashcards}
              title="Shuffle Cards"
              className="flex-1 py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 border bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 cursor-pointer"
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>
          
          <button 
            onClick={() => {
              setFlashcards([]);
              setSourceText('');
            }}
            className="w-full mt-3 py-3.5 rounded-2xl font-extrabold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors bg-white shadow-sm cursor-pointer"
          >
            Create Another
          </button>
        </motion.div>
      )}
      </div>
    </div>
  );
}
