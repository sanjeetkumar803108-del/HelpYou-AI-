import React, { useState } from 'react';
import { ArrowLeft, Loader2, Save, PenTool, Type, FileText, Feather, Edit3, Copy, FileDown, Check, History, Trash2, Calendar } from 'lucide-react';
import GlobalMarkdown from './GlobalMarkdown';
import { motion } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import jsPDF from 'jspdf';
import { savePDFMobile } from '../utils/mobileSaver';
import { deductCoins, getCoins } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';

interface ContentGeneratorProps {
  onBack: () => void;
}

const CONTENT_TYPES = [
  { id: 'Essay', label: 'Essay', icon: FileText },
  { id: 'Paragraph', label: 'Paragraph', icon: Type },
  { id: 'Poem', label: 'Poem', icon: Feather },
  { id: 'Blog', label: 'Blog', icon: Edit3 },
];

export default function ContentGenerator({ onBack }: ContentGeneratorProps) {
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
  const [topic, setTopic] = useState('');
  const [selectedType, setSelectedType] = useState('Essay');
  const [selectedTone, setSelectedTone] = useState('Academic');
  const [selectedFormat, setSelectedFormat] = useState('Standard');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);

  const writingSteps = [
    "Structuring your ideas...",
    "Drafting the introduction...",
    "Developing key arguments...",
    "Fleshing out the details...",
    "Polishing the final draft..."
  ];

  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showHistory) {
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
  }, [showHistory, result]);

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);

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
          const stepIndex = Math.min(Math.floor(nextVal / 20), writingSteps.length - 1);
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
        const isContentGen = data.type === 'content_generation' || 
                             (data.title && data.title.toLowerCase().includes('generated content')) ||
                             (data.title && data.title.toLowerCase().includes('ai writer'));
        if (isContentGen) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            isPdf: !!data.isPdf
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
            console.error("Failed to delete old content generation item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to load Content Generator history:", e);
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
      console.error("Failed to delete content:", err);
    }
  };

  const wordCount = topic.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleGenerate = async () => {
    if (!topic.trim()) return;

    // Check if user has at least 1 coin before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 1) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Writing Helper", cost: 1 } }));
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setCurrentSavedId(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds timeout

      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          topic, 
          type: selectedType,
          tone: selectedTone,
          format: selectedType === 'Essay' ? selectedFormat : 'Standard',
          gradeLevel
        })
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errText = await response.text();
        let errMsg = 'Generation took too long or failed. Please try again or provide a shorter prompt.';
        try {
          const parsedError = JSON.parse(errText);
          errMsg = parsedError.error || errMsg;
        } catch (_) {
          // If it's not JSON, use default or snippet
          if (errText.length > 0 && errText.length < 200) errMsg = errText;
        }
        throw new Error(errMsg);
      }
      const genContentType = response.headers.get("content-type") || "";
      if (!genContentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }
      const data = await response.json();
      
      // Deduct 1 coin now that the output has been successfully generated by the AI
      deductCoins(1, "AI Writing Helper");
      
      setResult(data.text);
      // Auto-save
      if (auth.currentUser) {
        try {
          const docRef = await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'note',
            title: `Generated ${selectedType}: ${topic.length > 30 ? topic.substring(0, 30) + '...' : topic}`,
            text: data.text,
            createdAt: serverTimestamp()
          });
          setCurrentSavedId(docRef.id);
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

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard copy failed: ', err);
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = result;
      document.body.appendChild(textArea);
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

  const handleExportPDF = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const pdfDoc = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      const pageHeight = pdfDoc.internal.pageSize.getHeight();
      const maxLineWidth = pageWidth - (margin * 2);

      // Simple Markdown-to-Plaintext cleanup for PDF rendering
      const cleanText = result.replace(/[*#`_\-~[\]()]/g, '');
      const lines = pdfDoc.splitTextToSize(cleanText, maxLineWidth);

      let cursorY = 20;
      pdfDoc.setFont("helvetica", "normal");
      
      // Title Block
      pdfDoc.setFontSize(14);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(`${selectedType} Study Guide - HelpYou AI`, margin, cursorY);
      cursorY += 10;
      
      pdfDoc.setFontSize(10);
      pdfDoc.setFont("helvetica", "italic");
      pdfDoc.text(`Topic: ${topic.substring(0, 70)}${topic.length > 70 ? '...' : ''}`, margin, cursorY);
      cursorY += 5;
      pdfDoc.text(`Tone: ${selectedTone} | Academic Format: ${selectedType === 'Essay' ? selectedFormat : 'Standard'}`, margin, cursorY);
      cursorY += 10;

      pdfDoc.setDrawColor(220, 220, 220);
      pdfDoc.line(margin, cursorY - 5, pageWidth - margin, cursorY - 5);

      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(11);

      lines.forEach((line: string) => {
        if (cursorY > pageHeight - 20) {
          pdfDoc.addPage();
          cursorY = 20;
        }
        pdfDoc.text(line, margin, cursorY);
        cursorY += 7; // line spacing
      });

       // Programmatically write directly to mobile file manager with automatic permission checks
       const filename = `HelpYou_AI_${selectedType.toLowerCase()}_generation.pdf`;
       const blob = pdfDoc.output('blob');

       // Automatically flag this item as a PDF in this feature's own history
       if (currentSavedId && auth.currentUser) {
         try {
           await updateDoc(doc(db, 'pocket_items', currentSavedId), { isPdf: true });
           console.log(`[History] Marked ContentGenerator item ${currentSavedId} as PDF`);
           setHistoryItems(prev => prev.map(item => item.id === currentSavedId ? { ...item, isPdf: true } : item));
         } catch (historyErr) {
           console.warn('Could not save PDF tag to Content Generator history:', historyErr);
         }
       }

       await savePDFMobile(blob, filename);
     } catch (err) {
       console.error("Failed to export PDF:", err);
       alert("Could not generate PDF. Please try again.");
     } finally {
       setExporting(false);
     }
   };

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-cyan-100 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-blue-50 rounded-full blur-[120px] pointer-events-none" />

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
              <PenTool className="w-5 h-5 text-cyan-600 mr-2 shrink-0" />
              <span>Content Generator</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Essays, Blogs, Poems & Paragraphs</p>
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
                ? 'bg-cyan-600 text-white border-cyan-600' 
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
            <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Your Written Pieces</h3>
            <span className="text-xs bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full">{(Array.isArray(historyItems) ? historyItems : []).length} items</span>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
              <span>Loading writing history...</span>
            </div>
          ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <p className="text-3xl mb-2">✍️</p>
              <p className="text-sm">No written pieces found.</p>
              <p className="text-xs text-zinc-400 font-semibold mt-1">Generate essays, poems, or blogs and they will be saved here automatically!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(historyItems || []).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    triggerVibration(15);
                    setResult(item.text);
                    setCurrentSavedId(item.id);
                    setSaved(true);
                    setShowHistory(false);
                  }}
                  className="bg-white border border-zinc-200/80 hover:border-cyan-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                >
                  <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                    <h4 className="font-black text-zinc-900 group-hover:text-cyan-600 transition-colors truncate">
                      {item.title || 'Written Piece'}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {item.isPdf && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide flex items-center gap-0.5">
                          <span>📄</span> PDF
                        </span>
                      )}
                    </div>
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
          className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center max-w-md mx-auto"
        >
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-cyan-500/20">
              <PenTool className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">Drafting {selectedType}...</h3>
          <p className="text-cyan-600 font-bold text-sm tracking-wide uppercase mb-8 min-h-[20px]">
            {writingSteps[loadingStep]}
          </p>

          <div className="w-full bg-zinc-200/60 rounded-full h-3 mb-4 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-cyan-600 to-blue-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-12">
            {loadingProgress}% Complete
          </div>

          <div className="w-full space-y-4">
             <div className="h-4 bg-zinc-100 rounded-full w-full animate-pulse" />
             <div className="h-4 bg-zinc-50 rounded-full w-[95%] animate-pulse" />
             <div className="h-4 bg-zinc-100 rounded-full w-[80%] animate-pulse" />
          </div>
        </motion.div>
      ) : !result ? (
          <div className="flex-1 flex flex-col w-full max-w-md mx-auto">
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-md">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Content Type (Slide to select)</label>
              
              {/* Horizontal Slider Content Types */}
              <div className="flex gap-3 overflow-x-auto pb-4 pt-1 mb-4 scrollbar-none snap-x snap-mandatory touch-pan-x">
                {CONTENT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = selectedType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      className={`snap-center shrink-0 flex items-center justify-center gap-2.5 w-36 p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/50 text-cyan-700 shadow-sm scale-[1.02] font-black' 
                          : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:border-zinc-300'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-bold tracking-tight">{type.label}</span>
                    </button>
                  );
                })}
              </div>

              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Topic / Subject</label>
              <div className="relative mb-5">
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="E.g., The impact of AI on modern education..."
                  className="w-full p-4 pb-8 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 resize-none h-32 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-semibold text-sm leading-relaxed"
                />
                <div className={`absolute bottom-3 right-4 text-xs font-bold ${'text-zinc-400'}`}>
                  {wordCount} words
                </div>
              </div>

              {/* Tone Selection Row */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Tone</label>
                <div className="flex flex-wrap gap-2">
                  {["Academic", "Persuasive", "Creative", "Casual"].map((tone) => {
                    const isSelected = selectedTone === tone;
                    return (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setSelectedTone(tone)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-50 border-cyan-200 text-cyan-700 shadow-sm font-extrabold'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:border-zinc-300'
                        }`}
                      >
                        {tone}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* US Formats (Visible only if 'Essay' is selected) */}
              {selectedType === 'Essay' && (
                <div className="mb-6">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Academic Format</label>
                  <div className="flex flex-wrap gap-2">
                    {["MLA Format", "APA Format", "Standard"].map((fmt) => {
                      const isSelected = selectedFormat === fmt;
                      return (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setSelectedFormat(fmt)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm font-extrabold'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:border-zinc-300'
                          }`}
                        >
                          {fmt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {error && (
                <div className="bg-red-50 text-red-600 text-sm font-bold px-4 py-3 rounded-xl border border-red-100 mb-6">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={!topic.trim() || loading || false}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-cyan-500/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center border border-cyan-500/20 cursor-pointer"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : `Generate ${selectedType}`}
              </button>
            </div>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col z-10 w-full max-w-lg mx-auto"
          >
            {/* Document Header Panel */}
            <div className="bg-zinc-100/80 border border-zinc-200/80 rounded-t-2xl px-5 py-3 text-xs font-semibold text-zinc-500 flex justify-between items-center">
              <span>{selectedType} Study Document</span>
              <span className="bg-white border border-zinc-200 text-zinc-600 px-2.5 py-0.5 rounded-full font-bold">
                Tone: {selectedTone}
              </span>
            </div>

            {/* Generated Document Content */}
            <div className="bg-white rounded-b-2xl p-6 shadow-md border-x border-b border-zinc-200 mb-4 prose prose-sm max-w-none prose-headings:font-bold prose-headings:tracking-tight text-zinc-800">
              <GlobalMarkdown>{result || ''}</GlobalMarkdown>
            </div>

            {/* Sleek Action Bar */}
            <div className="flex items-center justify-between gap-3 mb-6 bg-white border border-zinc-200 rounded-2xl p-3 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 pl-2">Export / Share</span>
              <div className="flex items-center gap-2">
                {/* [📋 Copy to Clipboard] */}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-50 hover:bg-zinc-100 active:scale-95 border border-zinc-200 rounded-xl font-bold text-xs text-zinc-700 shadow-sm transition-all cursor-pointer select-none"
                  title="Copy text content to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-green-600 font-extrabold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Copy to Clipboard</span>
                    </>
                  )}
                </button>

              </div>
            </div>
            
            <button 
              onClick={() => {
                setResult(null);
              }}
              className="w-full mt-3 py-3.5 rounded-xl font-extrabold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors bg-white shadow-sm cursor-pointer"
            >
              Create Another
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
