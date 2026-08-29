import { getApiUrl } from '../utils/api';
import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Loader2, Save, Wand2, Copy, CheckCircle, History, 
  Trash2, Calendar, Camera, X, FileText, Share2, Download, Eye 
} from 'lucide-react';
import GlobalMarkdown from './GlobalMarkdown';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { deductCoins, getCoins } from '../utils/coins';
import { detectAndLogMistake } from '../utils/mistakes';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { compressImage } from '../utils/imageCompressor';
import { generateNotesPDFBlob } from '../lib/pdfExporter';
import { savePDFMobile, sharePDFMobile } from '../utils/mobileSaver';
import { sanitizePdfText } from '../utils/pdfSanitizer';
import SafePdfViewer from './SafePdfViewer';

interface GrammarEnhancerProps {
  onBack: () => void;
}

export default function GrammarEnhancer({ onBack }: GrammarEnhancerProps) {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'fix' | 'academic'>('fix');
  const [fixes, setFixes] = useState<string[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleHeaderBack = () => {
    triggerVibration(10);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (previewPdfUri) {
      setPreviewPdfUri(null);
    } else if (showHistory) {
      setShowHistory(false);
    } else if (result) {
      setResult(null);
      setLoading(false);
    } else {
      onBack();
    }
  };

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showLimitPopup) {
        e.preventDefault();
        triggerVibration(10);
        setShowLimitPopup(false);
      } else if (previewPdfUri) {
        e.preventDefault();
        triggerVibration(10);
        setPreviewPdfUri(null);
      } else if (showHistory) {
        e.preventDefault();
        triggerVibration(10);
        setShowHistory(false);
      } else if (result) {
        e.preventDefault();
        triggerVibration(10);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setResult(null);
        setLoading(false);
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => {
      window.removeEventListener('appBackButton', handleBackButton);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [showLimitPopup, previewPdfUri, showHistory, result]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (uploadedImages.length + files.length > 5) {
      setError("Please select a maximum of 5 images.");
      setShowLimitPopup(true);
      triggerVibration(15);
      e.target.value = '';
      return;
    }
    
    setScanning(true);
    setError(null);
    
    try {
      const readPromises = Array.from(files).map(file => compressImage(file));
      const base64s = await Promise.all(readPromises);
      setUploadedImages(prev => [...prev, ...base64s]);
      triggerVibration(10);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load and compress selected image(s).");
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const enhancingSteps = [
    "Analyzing sentence structure...",
    "Checking for grammatical errors...",
    "Refining vocabulary & word choice...",
    "Improving natural flow & tone...",
    "Finalizing your enhanced text..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && !result) {
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
          const stepIndex = Math.min(Math.floor(nextVal / 20), enhancingSteps.length - 1);
          setLoadingStep(stepIndex);
          return nextVal;
        });
      }, 350);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, result]);

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
        const isGrammar = data.type === 'grammar_enhancement' || 
                          (data.title && data.title.toLowerCase().includes('grammar & flow'));
        if (isGrammar) {
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
            console.error("Failed to delete old grammar item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to load Grammar history:", e);
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
      console.error("Failed to delete Grammar item:", err);
    }
  };

  const wordCount = inputText.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleEnhance = async () => {
    if (!inputText.trim() && uploadedImages.length === 0) return;

    const coins = getCoins();
    if (coins < 1) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Grammar Enhancer", cost: 1 } }));
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setCopied(false);
    setFixes([]);

    try {
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch(getApiUrl('/api/grammar-enhance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, mode, gradeLevel, images: uploadedImages }),
        signal: controller.signal
      });
      
      if (!response.ok) {
        const errText = await response.text();
        let errMsg = 'Failed to enhance text';
        try {
          errMsg = JSON.parse(errText).error || errMsg;
        } catch (_) {
          errMsg = errText.substring(0, 100) || errMsg;
        }
        throw new Error(errMsg);
      }
      const grammarContentType = response.headers.get("content-type") || "";
      if (!grammarContentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }
      const data = await response.json();
      
      // Deduct 1 coin
      deductCoins(1, "Grammar & Flow");
      
      setResult(data.text);
      const receivedFixes = data.fixes || [];
      setFixes(receivedFixes);

      // Auto-save grammatical fixes to mistake vault
      if (receivedFixes && receivedFixes.length > 0) {
        detectAndLogMistake('Grammar Enhancer', inputText || "Image content", data.text).catch(e => console.error("Grammar mistake capture failed:", e));
      }

      // Auto-save
      if (auth.currentUser) {
        try {
          let savedText = data.text;
          if (receivedFixes && receivedFixes.length > 0) {
            savedText += "\n\n### What we fixed:\n" + (receivedFixes || []).map((f: string) => `- ${f}`).join("\n");
          }

          await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'note',
            title: `Grammar & Flow (${mode === 'fix' ? 'Voice Preserved' : 'Academic'})`,
            text: savedText,
            createdAt: serverTimestamp()
          });
          setSaved(true);
        } catch (e) {
          console.error("Auto-save failed", e);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return;
      }
      console.error(err);
      setError('Oops! Something went wrong on our end. Please try again.');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareOutput = async () => {
    if (!result) return;
    triggerVibration(10);
    const cleanOutput = result.trim();
    if (navigator.share) {
      try {
        await navigator.share({
          text: cleanOutput
        });
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return;
      }
    }
    // Fallback
    navigator.clipboard.writeText(cleanOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPDF = () => {
    if (!result) return;
    triggerVibration(10);
    const title = `Grammar & Flow - ${mode === 'fix' ? 'Enhanced' : 'Academic Rewrite'}`;
    let fullContent = `## Enhanced Text\n\n${result}`;
    if (fixes && fixes.length > 0) {
      fullContent += `\n\n### What Was Fixed\n` + fixes.map(f => `- ${f}`).join('\n');
    }
    const blob = generateNotesPDFBlob(title, fullContent, 'Grammar Enhancement');
    savePDFMobile(blob, 'Grammar_Enhanced_Document.pdf');
  };

  const handlePreviewPDF = () => {
    if (!result) return;
    triggerVibration(10);
    const title = `Grammar & Flow - ${mode === 'fix' ? 'Enhanced' : 'Academic Rewrite'}`;
    let fullContent = `## Enhanced Text\n\n${result}`;
    if (fixes && fixes.length > 0) {
      fullContent += `\n\n### What Was Fixed\n` + fixes.map(f => `- ${f}`).join('\n');
    }
    const blob = generateNotesPDFBlob(title, fullContent, 'Grammar Enhancement');
    const blobUrl = URL.createObjectURL(blob);
    setPreviewPdfName('Grammar_Enhanced_Document.pdf');
    setPreviewPdfUri(blobUrl);
  };

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-purple-100 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-blue-50 rounded-full blur-[120px] pointer-events-none" />

      {/* FULLSCREEN PDF PREVIEW MODAL */}
      <AnimatePresence>
        {previewPdfUri && (
          <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col h-screen w-screen animate-fade-in">
            <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setPreviewPdfUri(null)}
                  className="w-10 h-10 bg-zinc-800 hover:bg-zinc-750 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm text-white truncate">{previewPdfName}</h3>
                  <p className="text-[10px] text-zinc-400 font-bold">PDF Reader • Full Screen Mode</p>
                </div>
              </div>
              <button
                onClick={handleExportPDF}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Save</span>
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative flex flex-col">
              <SafePdfViewer pdfUrlOrBase64={previewPdfUri} />
            </div>
          </div>
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
              <Wand2 className="w-5 h-5 text-purple-600 mr-2 shrink-0" />
              <span>Grammar & Flow</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Fix grammar and enhance your writing naturally</p>
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
                ? 'bg-purple-600 text-white border-purple-600' 
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
            <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Your Grammar Polishes</h3>
            <span className="text-xs bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full">{(Array.isArray(historyItems) ? historyItems : []).length} items</span>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              <span>Loading grammar history...</span>
            </div>
          ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <p className="text-3xl mb-2">✨</p>
              <p className="text-sm">No grammar polishes found.</p>
              <p className="text-xs text-zinc-400 font-semibold mt-1">Polish your text and they will be saved here automatically!</p>
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
                  className="bg-white border border-zinc-200/80 hover:border-purple-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                >
                  <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                    <h4 className="font-black text-zinc-900 group-hover:text-purple-600 transition-colors truncate">
                      {item.title || 'Grammar Enhancement'}
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
            <div className="absolute inset-0 bg-purple-500/10 rounded-full blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-purple-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-purple-500/20 animate-bounce">
              <Wand2 className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">Enhancing Your Writing</h3>
          <p className="text-purple-600 font-bold text-sm tracking-wide uppercase mb-6 min-h-[20px]">
            {enhancingSteps[loadingStep]}
          </p>

          <div className="w-full max-w-md bg-zinc-200/60 rounded-full h-3 mb-4 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-8">
            {loadingProgress}% Refined
          </div>
        </motion.div>
      ) : !result ? (
        <div className="flex-1 flex flex-col">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200 mb-6 flex-1 flex flex-col">
            <div className="relative flex-1 flex flex-col min-h-[220px]">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste or type your text here to refine grammar, fix punctuation, and elevate flow..."
                disabled={loading || scanning}
                className="w-full flex-1 p-4 rounded-2xl border border-zinc-150 bg-zinc-50/50 text-zinc-900 placeholder:text-zinc-400 resize-none focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-sm leading-relaxed font-sans font-medium"
              />
              <div className="flex justify-between items-center text-xs text-zinc-400 mt-2 px-1 font-bold">
                <span>{wordCount} words</span>
                {inputText && (
                  <button 
                    onClick={() => setInputText('')}
                    className="text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    Clear Text
                  </button>
                )}
              </div>
            </div>

            {/* ATTACHED IMAGES PREVIEW */}
            {uploadedImages.length > 0 && (
              <div className="my-4 bg-zinc-50 border border-zinc-150 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Attached Images ({uploadedImages.length}/5)</span>
                  <button 
                    type="button"
                    onClick={() => {
                      setUploadedImages([]);
                      triggerVibration(10);
                    }}
                    className="text-[10px] font-extrabold text-red-500 hover:text-red-600 transition-colors border-none bg-transparent cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                  {uploadedImages.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl border border-zinc-250 overflow-hidden bg-white group flex-shrink-0">
                      <img src={img} alt={`attached-${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedImages(prev => prev.filter((_, i) => i !== idx));
                          triggerVibration(5);
                        }}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 transition-colors border-none flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SCAN / ATTACH IMAGE BUTTON */}
            <div className="my-4">
              <input 
                type="file"
                id="grammar-gallery-input"
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
                  document.getElementById('grammar-gallery-input')?.click();
                }}
                disabled={scanning || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100 font-extrabold text-xs transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    <span>Attaching images...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Attach image(s) with text</span>
                  </>
                )}
              </button>
            </div>

            {/* TONE & MODE SELECTORS */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Correction Mode</label>
              <div className="grid grid-cols-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200/50">
                <button
                  type="button"
                  onClick={() => !loading && !scanning && setMode('fix')}
                  disabled={loading || scanning}
                  className={`py-2.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'fix'
                      ? 'bg-white text-purple-600 shadow-sm border border-zinc-200/30'
                      : 'text-zinc-500 hover:text-zinc-800'
                  } disabled:opacity-50`}
                >
                  <span className="text-sm">🔧</span>
                  <span>Fix Grammar Only</span>
                </button>
                <button
                  type="button"
                  onClick={() => !loading && !scanning && setMode('academic')}
                  disabled={loading || scanning}
                  className={`py-2.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'academic'
                      ? 'bg-white text-purple-600 shadow-sm border border-zinc-200/30'
                      : 'text-zinc-500 hover:text-zinc-800'
                  } disabled:opacity-50`}
                >
                  <span className="text-sm">🎓</span>
                  <span>Academic Rewrite</span>
                </button>
              </div>
            </div>
            
            {error && (
              <div className="bg-red-50 text-red-600 text-sm font-bold px-4 py-3 rounded-xl border border-red-100 mb-6">
                {error}
              </div>
            )}

            <button
              onClick={handleEnhance}
              disabled={(!inputText.trim() && uploadedImages.length === 0) || loading || scanning}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-purple-500/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center border border-purple-500/20"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Enhance & Correct"}
            </button>
          </div>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col z-10"
        >
          {/* Enhanced Version Card */}
          <div className="bg-white rounded-[2rem] p-6 shadow-md border border-zinc-200 mb-4 relative flex-1 flex flex-col text-zinc-800">
            <div className="flex justify-between items-center mb-4 border-b border-zinc-100 pb-3">
               <h3 className="text-base font-bold text-purple-700 flex items-center gap-2">
                 <Wand2 className="w-4 h-4 text-purple-600" />
                 <span>Enhanced Version</span>
               </h3>
               <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 hover:text-zinc-900 transition-colors bg-zinc-50 hover:bg-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-200 shadow-sm cursor-pointer"
               >
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
               </button>
            </div>
            <div className="prose prose-sm max-w-none prose-p:leading-relaxed overflow-y-auto flex-1 select-text">
              <GlobalMarkdown>{result}</GlobalMarkdown>
            </div>
          </div>

          {/* CHANGES MADE FEEDBACK LOGIC */}
          {fixes.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-200/80 rounded-[2rem] p-5 shadow-sm mb-4">
              <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                <span>💡</span> What we fixed:
              </h4>
              <ul className="space-y-1.5">
                {(fixes || []).map((fix, idx) => (
                  <li key={idx} className="text-xs font-medium text-amber-950 flex items-start gap-2 leading-relaxed">
                    <span className="text-amber-500 select-none mt-0.5">•</span>
                    <span>{sanitizePdfText(fix)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* MULTI-ACTION BAR: Share Output, PDF Export & PDF Preview */}
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            <button
              onClick={handleShareOutput}
              className="py-3.5 px-3 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 active:scale-95 shadow-xs cursor-pointer"
              title="Share output text directly"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Output</span>
            </button>

            <button
              onClick={handlePreviewPDF}
              className="py-3.5 px-3 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 active:scale-95 shadow-xs cursor-pointer"
              title="View PDF"
            >
              <Eye className="w-4 h-4 text-purple-600" />
              <span>View PDF</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="py-3.5 px-3 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 border border-purple-500/20 bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 active:scale-95 shadow-md shadow-purple-500/10 cursor-pointer"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
          </div>
          
          <button 
            onClick={() => {
              setResult(null);
              setInputText('');
              setUploadedImages([]);
              setFixes([]);
            }}
            className="w-full py-3.5 rounded-2xl font-extrabold text-xs text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors bg-white shadow-sm cursor-pointer"
          >
            Enhance Another Text
          </button>
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
                Bhai, you can only select up to 5 images at a time. Please select 5 or fewer images.
              </p>
              <button
                onClick={() => {
                  triggerVibration(10);
                  setShowLimitPopup(false);
                }}
                className="w-full bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-black py-4 rounded-xl transition-all text-sm cursor-pointer"
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
