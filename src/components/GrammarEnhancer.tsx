import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Save, Wand2, Copy, CheckCircle, History, Trash2, Calendar, Camera, X, Download, CheckCircle2 } from 'lucide-react';
import GlobalMarkdown from './GlobalMarkdown';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { deductCoins, getCoins } from '../utils/coins';
import { detectAndLogMistake } from '../utils/mistakes';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { compressImage } from '../utils/imageCompressor';
import { isItemOffline, toggleOfflineItem, getOfflineItems } from '../utils/offlineVault';

interface GrammarEnhancerProps {
  onBack: () => void;
}

export default function GrammarEnhancer({ onBack }: GrammarEnhancerProps) {
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

  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
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

  React.useEffect(() => {
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
  const [, setOfflineTrigger] = useState(0);

  useEffect(() => {
    const handleOfflineUpdate = () => setOfflineTrigger(prev => prev + 1);
    window.addEventListener('offline-vault-updated', handleOfflineUpdate);
    return () => window.removeEventListener('offline-vault-updated', handleOfflineUpdate);
  }, []);

  const fetchHistory = async () => {
    const offline = getOfflineItems('grammar');
    if (!auth.currentUser) {
      if (offline.length > 0) setHistoryItems(offline);
      return;
    }
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'pocket_items'),
        where('userId', '==', auth.currentUser.uid)
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
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date())
          });
        }
      });

      const merged = [...items];
      for (const off of offline) {
        if (!merged.some(m => m.id === off.id)) {
          merged.push(off);
        }
      }

      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Keep only last 20 records
      if (merged.length > 20) {
        const toKeep = merged.slice(0, 20);
        const toDelete = merged.slice(20);
        
        for (const item of toDelete) {
          if (!item.id.startsWith('local_')) {
            try {
              await deleteDoc(doc(db, 'pocket_items', item.id));
            } catch (err) {
              console.error("Failed to delete old grammar item:", err);
            }
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(merged);
      }
    } catch (e) {
      console.error("Failed to load Grammar history:", e);
      if (offline.length > 0) setHistoryItems(offline);
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

    // Check if user has at least 1 coin before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 1) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Grammar Enhancer", cost: 1 } }));
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setCopied(false);
    setFixes([]);

    try {
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/grammar-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, mode, gradeLevel, images: uploadedImages })
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
      
      // Deduct 1 coin now that the output has been successfully generated by the AI
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
            savedText += "\n\n### 💡 What we fixed:\n" + (receivedFixes || []).map((f: string) => `- ${f}`).join("\n");
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
      console.error(err);
      setError('Oops! Something went wrong on our end. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-purple-100 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-blue-50 rounded-full blur-[120px] pointer-events-none" />

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
                      {item.title || 'Grammar Polish'}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {isItemOffline('grammar', item.id) && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide flex items-center gap-0.5">
                          <span>💾</span> Offline Ready
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-600 line-clamp-2 mt-1.5 font-medium">
                      {item.text ? item.text.substring(0, 120).replace(/[#*`]/g, '') + '...' : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOfflineItem('grammar', item.id, item);
                        setOfflineTrigger(prev => prev + 1);
                      }}
                      className={`p-2 rounded-xl transition-all active:scale-95 cursor-pointer ${
                        isItemOffline('grammar', item.id)
                          ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                          : 'text-zinc-400 hover:text-purple-600 hover:bg-purple-50'
                      }`}
                      title={isItemOffline('grammar', item.id) ? "Saved in app offline (Tap to remove)" : "Save inside app for offline access"}
                    >
                      {isItemOffline('grammar', item.id) ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95 cursor-pointer"
                      title="Delete Polish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : loading && !result ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center max-w-md mx-auto"
        >
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-purple-500/10 rounded-full blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-purple-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-purple-500/20">
              <Wand2 className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">Enhancing Writing...</h3>
          <p className="text-purple-600 font-bold text-sm tracking-wide uppercase mb-8 min-h-[20px]">
            {enhancingSteps[loadingStep]}
          </p>

          <div className="w-full bg-zinc-200/60 rounded-full h-3 mb-4 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-12">
            {loadingProgress}% Complete
          </div>

          <div className="w-full space-y-4">
            <div className="h-4 bg-zinc-100 rounded-full w-full animate-pulse" />
            <div className="h-4 bg-zinc-50 rounded-full w-[90%] animate-pulse" />
            <div className="h-4 bg-zinc-100 rounded-full w-[95%] animate-pulse" />
          </div>
        </motion.div>
      ) : !result ? (
        <div className="flex-1 flex flex-col z-10 w-full max-w-md mx-auto">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-md">
            
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Paste Your Text Here</label>
            <div className="relative mb-6">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="E.g., I was went to the store to buying some milks but its was closed..."
                disabled={loading || scanning}
                className="w-full p-4 pb-8 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 resize-none h-48 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-semibold text-sm leading-relaxed disabled:opacity-60"
              />
              <div className={`absolute bottom-3 right-4 text-xs font-bold ${'text-zinc-400'}`}>
                {wordCount} words
              </div>
            </div>

            {/* ATTACHED IMAGES PREVIEW GRID */}
            {uploadedImages.length > 0 && (
              <div className="mb-6 bg-zinc-50 border border-zinc-150 rounded-2xl p-4">
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

            {/* GALLERY IMAGE UPLOAD */}
            <div className="mb-6">
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
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100/50 font-extrabold text-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    <span>Attaching images...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Upload images</span>
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
          <div className="bg-white rounded-[2rem] p-6 shadow-md border border-zinc-200 mb-6 relative flex-1 flex flex-col text-zinc-800">
            <div className="flex justify-between items-center mb-4 border-b border-zinc-200 pb-4">
               <h3 className="text-lg font-bold text-purple-600">Enhanced Version</h3>
               <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors bg-zinc-50 hover:bg-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-200 shadow-sm"
               >
                  {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
               </button>
            </div>
            <div className="prose prose-sm max-w-none prose-p:leading-relaxed overflow-y-auto flex-1">
              <GlobalMarkdown>{result}</GlobalMarkdown>
            </div>
          </div>

          {/* CHANGES MADE FEEDBACK LOGIC */}
          {fixes.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-[2rem] p-6 shadow-sm mb-6">
              <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <span>💡</span> What we fixed:
              </h4>
              <ul className="space-y-2">
                {(fixes || []).map((fix, idx) => (
                  <li key={idx} className="text-xs font-medium text-amber-900 flex items-start gap-2 leading-relaxed">
                    <span className="text-amber-500 select-none mt-0.5">•</span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ACCESSIBILITY & UX - High Visibility Copy Button */}
          <button
            onClick={handleCopy}
            className="w-full py-4 rounded-xl font-bold text-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-purple-500/20 text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-500/10 mb-3 cursor-pointer"
          >
            {copied ? <CheckCircle className="w-5 h-5 text-green-300" /> : <Copy className="w-5 h-5" />}
            {copied ? 'Copied to Clipboard!' : '📋 Copy Text'}
          </button>
          
          <button 
            onClick={() => {
              setResult(null);
            }}
            className="w-full py-3.5 rounded-xl font-extrabold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors bg-white shadow-sm"
          >
            Enhance Another
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
