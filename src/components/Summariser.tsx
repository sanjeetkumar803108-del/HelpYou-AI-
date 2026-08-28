import React, { useState, useRef } from 'react';
import { ArrowLeft, Loader2, Save, FileText, Upload, Copy, Check, History, Trash2, Calendar, Share2, Download } from 'lucide-react';
import GlobalMarkdown from './GlobalMarkdown';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { deductCoins, getCoins } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { generateNotesPDFBlob } from '../lib/pdfExporter';
import { savePDFMobile, sharePDFMobile } from '../utils/mobileSaver';
import SafePdfViewer from './SafePdfViewer';
import { getApiUrl } from '../utils/api';

interface SummariserProps {
  onBack: () => void;
}

export default function Summariser({ onBack }: SummariserProps) {
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
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'bullet' | 'tldr' | 'eli5'>('bullet');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState<string>('');
  const [currentActiveTitle, setCurrentActiveTitle] = useState<string>('');

  const summarisingSteps = [
    "Reading & analyzing source text...",
    "Identifying core themes and key facts...",
    "Synthesizing high-yield information...",
    "Drafting your custom summary...",
    "Polishing for maximum clarity..."
  ];

  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (previewPdfUri) {
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
        setResult(null);
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [previewPdfUri, showHistory, result]);

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
          const stepIndex = Math.min(Math.floor(nextVal / 20), summarisingSteps.length - 1);
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
        const isSummary = data.type === 'summary' || 
                          data.type === 'pdf_summary' || 
                          (data.title && data.title.toLowerCase().includes('text summary')) ||
                          (data.title && data.title.toLowerCase().includes('summariser')) ||
                          (data.title && data.title.toLowerCase().includes('file summary'));
        if (isSummary) {
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
            console.error("Failed to delete old summary item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to load Summariser history:", e);
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
      console.error("Failed to delete summary:", err);
    }
  };

  const handleExportPDF = async () => {
    triggerVibration(15);
    try {
      const title = currentActiveTitle || 'Summary';
      const blob = generateNotesPDFBlob(title, result || '', 'summary');
      const filename = `${title}.pdf`;
      
      await savePDFMobile(blob, filename);
      
      const blobUrl = URL.createObjectURL(blob);
      setPreviewPdfUri(blobUrl);
      setPreviewPdfName(filename);
    } catch (err: any) {
      console.error("Failed to export PDF", err);
      setError("Oops! Something went wrong on our end. Please try again.");
    }
  };

  const handleSharePDF = async () => {
    triggerVibration(10);
    try {
      const title = currentActiveTitle || 'Summary';
      const blob = generateNotesPDFBlob(title, result || '', 'summary');
      const filename = `${title}.pdf`;
      await sharePDFMobile(blob, filename);
    } catch (err: any) {
      console.error("Failed to share PDF", err);
    }
  };

  // File Upload States
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = inputText.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleSummarise = async () => {
    if (!inputText.trim()) return;

    // Check if user has at least 1 coin before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 1) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "Text Summariser", cost: 1 } }));
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);

    try {
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch(getApiUrl('/api/summarize-text'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, format, gradeLevel })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        let errMsg = 'Failed to summarize text';
        try {
          errMsg = JSON.parse(errText).error || errMsg;
        } catch (_) {
          errMsg = errText.substring(0, 100) || errMsg;
        }
        throw new Error(errMsg);
      }
      const sumContentType1 = response.headers.get("content-type") || "";
      if (!sumContentType1.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }
      const data = await response.json();
      
      // Deduct 1 coin now that the output has been successfully generated by the AI
      deductCoins(1, "Text Summariser");
      
      setResult(data.text);
      const docTitle = `Text Summary (${format === 'tldr' ? 'TL;DR' : format === 'eli5' ? 'ELI5' : 'Bullets'})`;
      setCurrentActiveTitle(docTitle);
      // Auto-save
      if (auth.currentUser) {
        try {
          await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'pdf_summary',
            title: docTitle,
            text: data.text,
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
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      setError("File is too large! Please select a PDF smaller than 30MB (Max 60 pages).");
      triggerVibration(20);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Check if user has at least 1 coin before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 1) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "File Summariser", cost: 1 } }));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('action', 'summarize');
    formData.append('format', format);
    const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
    formData.append('gradeLevel', gradeLevel);
    
    try {
      const response = await fetch(getApiUrl('/api/summarize'), {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const errText = await response.text();
        let errMsg = 'Failed to summarize file';
        try {
          errMsg = JSON.parse(errText).error || errMsg;
        } catch (_) {
          errMsg = errText.substring(0, 100) || errMsg;
        }
        throw new Error(errMsg);
      }
      const sumContentType3 = response.headers.get("content-type") || "";
      if (!sumContentType3.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }
      const data = await response.json();
      
      // Deduct 1 coin now that the output has been successfully generated by the AI
      deductCoins(1, "File Summariser");
      
      setResult(data.text);
      const docTitle = `File Summary (${format === 'tldr' ? 'TL;DR' : format === 'eli5' ? 'ELI5' : 'Bullets'}) - ${file.name}`;
      setCurrentActiveTitle(docTitle);
      // Auto-save
      if (auth.currentUser) {
        try {
          await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'pdf_summary',
            title: docTitle,
            text: data.text,
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
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formats = [
    { id: 'bullet', label: 'Bullet Points', emoji: '📝' },
    { id: 'tldr', label: 'Short TL;DR', emoji: '⚡' },
    { id: 'eli5', label: "Explain Like I'm 5", emoji: '👶' }
  ];

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-emerald-100 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-teal-50 rounded-full blur-[120px] pointer-events-none" />

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
              <FileText className="w-5 h-5 text-emerald-600 mr-2 shrink-0" />
              <span>Expert Summariser</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Squeeze key points out of any text</p>
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
                ? 'bg-emerald-600 text-white border-emerald-600' 
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
            <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Your Summaries</h3>
            <span className="text-xs bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full">{(Array.isArray(historyItems) ? historyItems : []).length} items</span>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <span>Loading summaries history...</span>
            </div>
          ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <p className="text-3xl mb-2">⚡</p>
              <p className="text-sm">No summaries found.</p>
              <p className="text-xs text-zinc-400 font-semibold mt-1">Summarise any text and they will be saved here automatically!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(historyItems || []).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    triggerVibration(15);
                    setResult(item.text);
                    setCurrentActiveTitle(item.title || 'Summary');
                    setSaved(true);
                    setShowHistory(false);
                    const blob = generateNotesPDFBlob(item.title || 'Summary', item.text, 'summary');
                    const blobUrl = URL.createObjectURL(blob);
                    setPreviewPdfUri(blobUrl);
                    setPreviewPdfName(`${item.title || 'Summary'}.pdf`);
                  }}
                  className="bg-white border border-zinc-200/80 hover:border-emerald-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                >
                  <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                    <h4 className="font-black text-zinc-900 group-hover:text-emerald-600 transition-colors truncate flex items-center gap-1.5">
                      <span className="bg-red-50 text-red-500 text-[9px] font-black px-1.5 py-0.5 rounded border border-red-100/80 flex items-center shrink-0">PDF</span>
                      <span className="truncate">{item.title || 'Text Summary'}</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-zinc-400" />
                      {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="text-xs text-zinc-600 line-clamp-2 mt-1.5 font-medium">
                      {item.text ? item.text.substring(0, 120).replace(/[#*`]/g, '') + '...' : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        triggerVibration(10);
                        const blob = generateNotesPDFBlob(item.title || 'Summary', item.text, 'summary');
                        await sharePDFMobile(blob, `${item.title || 'Summary'}.pdf`);
                      }}
                      className="p-2 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors active:scale-95 cursor-pointer"
                      title="Share PDF"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95 cursor-pointer"
                      title="Delete"
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
            <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-500/20">
              <FileText className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">Summarising...</h3>
          <p className="text-emerald-600 font-bold text-sm tracking-wide uppercase mb-8 min-h-[20px]">
            {summarisingSteps[loadingStep]}
          </p>

          <div className="w-full bg-zinc-200/60 rounded-full h-3 mb-4 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-12">
            {loadingProgress}% Complete
          </div>

          <div className="w-full space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-zinc-200 mt-2 shrink-0 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-zinc-100 rounded-full w-full animate-pulse" />
                  <div className="h-4 bg-zinc-50 rounded-full w-[85%] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : !result ? (
          <div className="flex-1 flex flex-col z-10 w-full max-w-md mx-auto">
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-md">
              
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Text or Topic to Summarise</label>
              
              <div className="relative mb-3">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your paragraph, web text, or document notes here..."
                  className="w-full p-4 pb-8 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 resize-none h-48 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-semibold text-sm leading-relaxed"
                />
                <div className={`absolute bottom-3 right-4 text-xs font-bold ${'text-zinc-400'}`}>
                  {wordCount} words
                </div>

              </div>

              {/* SMART INPUT SHORTCUTS */}
              <div className="flex flex-col gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>Upload PDF/Doc</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.txt"
                  className="hidden"
                />
              </div>

              {/* SUMMARY DEPTH SELECTORS */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Summary Format</label>
                <div className="grid grid-cols-3 bg-zinc-100 p-1 rounded-xl border border-zinc-200/50">
                  {formats.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormat(f.id as any)}
                      className={`py-2 px-1 text-[10px] md:text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        format === f.id
                          ? 'bg-white text-emerald-600 shadow-sm border border-zinc-200/30'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      <span>{f.emoji}</span>
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {error && (
                <div className="bg-red-50 text-red-600 text-sm font-bold px-4 py-3 rounded-xl border border-red-100 mb-6">
                  {error}
                </div>
              )}

              <button
                onClick={handleSummarise}
                disabled={!inputText.trim() || loading || false}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center border border-emerald-500/20 cursor-pointer"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Summarise"}
              </button>
            </div>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col z-10"
          >
            <div className="bg-white rounded-[2rem] p-6 shadow-md border border-zinc-200 mb-6 relative flex-1 flex flex-col text-zinc-800">
              <h3 className="text-lg font-bold text-emerald-600 mb-4 border-b border-zinc-200 pb-4">Teacher's Summary</h3>
              <div className="prose prose-sm max-w-none prose-p:leading-relaxed overflow-y-auto flex-1">
                <GlobalMarkdown>{result}</GlobalMarkdown>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleCopy}
                className="w-full py-4 rounded-xl font-bold text-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-emerald-500/20 text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/10 cursor-pointer"
              >
                {copied ? <Check className="w-5 h-5 text-green-300" /> : <Copy className="w-5 h-5" />}
                {copied ? 'Copied to Clipboard!' : '📋 Copy Summary'}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleExportPDF}
                  className="py-3.5 px-4 rounded-xl font-bold text-sm bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Export to PDF</span>
                </button>
                <button
                  onClick={handleSharePDF}
                  className="py-3.5 px-4 rounded-xl font-bold text-sm bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-emerald-600" />
                  <span>Share PDF</span>
                </button>
              </div>
              
              <button 
                onClick={() => {
                  setResult(null);
                }}
                className="w-full py-3.5 rounded-xl font-extrabold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors bg-white shadow-sm cursor-pointer"
              >
                Summarise Another
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {previewPdfUri && (
        <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col">
          {/* Header */}
          <div className="bg-zinc-900 px-6 py-4 flex items-center justify-between border-b border-zinc-800 shrink-0">
            <button 
              onClick={() => {
                triggerVibration(10);
                setPreviewPdfUri(null);
              }}
              className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 hover:text-white rounded-full flex items-center justify-center transition-all cursor-pointer"
              title="Close Preview"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="font-extrabold text-sm text-white truncate max-w-xs">{previewPdfName}</h3>
            <div className="w-10 h-10" /> {/* Spacer */}
          </div>

          {/* PDF Viewer Canvas Container */}
          <div className="flex-1 overflow-hidden relative bg-zinc-950">
            <SafePdfViewer pdfUrlOrBase64={previewPdfUri} />
          </div>

          {/* Action Bar */}
          <div className="bg-zinc-900 p-4 pb-8 border-t border-zinc-800 flex gap-4 shrink-0">
            <button
              onClick={async () => {
                triggerVibration(10);
                const response = await fetch(previewPdfUri);
                const blob = await response.blob();
                await sharePDFMobile(blob, previewPdfName);
              }}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white font-bold py-4 rounded-xl border border-zinc-700 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Share2 className="w-5 h-5 text-emerald-500" />
              <span>Share PDF</span>
            </button>
            <button
              onClick={async () => {
                triggerVibration(15);
                const response = await fetch(previewPdfUri);
                const blob = await response.blob();
                await savePDFMobile(blob, previewPdfName);
              }}
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 active:scale-95 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Download className="w-5 h-5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
