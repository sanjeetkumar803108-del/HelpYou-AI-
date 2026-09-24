import { getApiUrl } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Loader2, Save, PenTool, Type, FileText, Feather, 
  Edit3, FileDown, Check, History, Trash2, Calendar, Share2, 
  Sparkles, ExternalLink, Eye, Download, Flag, Copy, X
} from 'lucide-react';
import GlobalMarkdown from './GlobalMarkdown';
import ReportAIModal from './ReportAIModal';
import { motion } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import jsPDF from 'jspdf';
import { savePDFMobile, sharePDFMobile, shareTextMobile } from '../utils/mobileSaver';
import { sanitizePdfText } from '../utils/pdfSanitizer';
import SafePdfViewer from './SafePdfViewer';
import { deductCoins, getCoins } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { getUserProfileData } from '../utils/profile';

interface ContentGeneratorProps {
  onBack: () => void;
}

const CONTENT_TYPES = [
  { id: 'Essay', label: 'Essay', icon: FileText },
  { id: 'Paragraph', label: 'Paragraph', icon: Type },
  { id: 'Poem', label: 'Poem', icon: Feather },
  { id: 'Blog', label: 'Blog', icon: Edit3 },
];

import {
  isTableLine,
  isTableSeparator,
  renderPdfTable,
  renderPdfDiagramBlock,
  formatMathAndSuperscripts
} from '../utils/pdfTableRenderer';

export function generateContentPDFBlob(
  type: string,
  topicTitle: string,
  tone: string,
  format: string,
  content: string
): Blob {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  let currentY = 22;
  let pageCount = 1;

  const addFooter = (pageNum: number) => {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text('HelpYou AI • Academic & Creative Suite', pageWidth - margin, pageHeight - 10, { align: 'right' });
  };

  // Header Decorative Top Bar
  doc.setFillColor(8, 145, 178); // Cyan-600 Accent
  doc.rect(margin, currentY, contentWidth, 2.5, 'F');
  currentY += 9;

  // Document Title (sanitized from emojis)
  const titleText = formatMathAndSuperscripts(
    sanitizePdfText(topicTitle && topicTitle.trim() ? topicTitle.trim() : `${type} Document`)
  );
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  
  const wrappedTitle = doc.splitTextToSize(titleText, contentWidth);
  for (const line of wrappedTitle) {
    if (currentY > pageHeight - 25) {
      doc.addPage();
      pageCount++;
      currentY = 22;
    }
    doc.text(line, margin, currentY);
    currentY += 7.5;
  }
  currentY += 2;

  // Metadata Subtitle Bar
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const metaLine = `Type: ${type}  |  Tone: ${tone}  |  Format: ${type === 'Essay' ? format : 'Standard'}  |  Date: ${dateStr}`;
  doc.text(metaLine, margin, currentY);
  currentY += 5;

  // Subtle Divider
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 8;

  addFooter(pageCount);

  // Split text by double newlines or stanzas and sanitize emojis
  const sanitizedContent = sanitizePdfText(content);
  const blocks = sanitizedContent.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // 1. Check for Code Block or Visual Diagram
    if (trimmed.startsWith('```')) {
      const diagramLines = trimmed.split('\n');
      currentY = renderPdfDiagramBlock(doc, diagramLines, currentY, {
        margin,
        contentWidth,
        pageHeight,
        accentColor: [8, 145, 178], // Cyan
        onPageBreak: () => {
          doc.addPage();
          pageCount++;
          addFooter(pageCount);
        }
      });
      continue;
    }

    // 2. Check for Markdown Table
    const blockLines = trimmed.split('\n');
    const tableLines = blockLines.filter(l => isTableLine(l) || isTableSeparator(l));
    if (tableLines.length >= 2 && blockLines.some(l => isTableSeparator(l))) {
      currentY = renderPdfTable(doc, tableLines, currentY, {
        margin,
        contentWidth,
        pageHeight,
        headerBg: [8, 145, 178], // Cyan Accent
        onPageBreak: () => {
          doc.addPage();
          pageCount++;
          addFooter(pageCount);
        }
      });
      continue;
    }

    // 3. Check for Markdown Headings
    if (trimmed.startsWith('#')) {
      let headingText = sanitizePdfText(trimmed.replace(/^#+\s*/, '').replace(/[*_`]/g, ''));
      headingText = formatMathAndSuperscripts(headingText);
      const level = (trimmed.match(/^#+/) || ['#'])[0].length;
      
      if (currentY > pageHeight - 25) {
        doc.addPage();
        pageCount++;
        addFooter(pageCount);
        currentY = 22;
      }

      currentY += 3;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(level === 1 ? 13 : level === 2 ? 11.5 : 10.5);
      doc.setTextColor(15, 23, 42);

      const wrappedHeading = doc.splitTextToSize(headingText, contentWidth);
      for (const hLine of wrappedHeading) {
        doc.text(hLine, margin, currentY);
        currentY += 6;
      }
      currentY += 3;
      continue;
    }

    // 4. Poem Stanzas Rendering
    if (type === 'Poem') {
      const poemLines = trimmed.split('\n');
      doc.setFont('Times', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);

      for (const pLine of poemLines) {
        let cleanLine = sanitizePdfText(pLine.replace(/[*_`]/g, ''));
        cleanLine = formatMathAndSuperscripts(cleanLine);
        if (currentY > pageHeight - 22) {
          doc.addPage();
          pageCount++;
          addFooter(pageCount);
          currentY = 22;
        }
        doc.text(cleanLine.trim(), margin + 8, currentY);
        currentY += 6;
      }
      currentY += 4; // Extra space between stanzas
      continue;
    }

    // 5. Normal or Academic Essay Paragraphs & Lists
    let cleanPara = sanitizePdfText(trimmed.replace(/[*_`]/g, ''));
    cleanPara = formatMathAndSuperscripts(cleanPara);
    const isAcademic = tone.toUpperCase() === 'ACADEMIC' || format.includes('APA') || format.includes('MLA');
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(39, 39, 42);

    const paraLines = doc.splitTextToSize(cleanPara, contentWidth - (isAcademic ? 6 : 0));
    
    if (currentY + (paraLines.length * 5.2) > pageHeight - 22) {
      doc.addPage();
      pageCount++;
      addFooter(pageCount);
      currentY = 22;
    }

    let isFirstLine = true;
    for (const line of paraLines) {
      if (currentY > pageHeight - 20) {
        doc.addPage();
        pageCount++;
        addFooter(pageCount);
        currentY = 22;
      }
      // Indent 6mm for first line of academic paragraph
      const indentX = (isAcademic && isFirstLine) ? 6 : 0;
      doc.text(line, margin + indentX, currentY);
      currentY += 5.2;
      isFirstLine = false;
    }
    currentY += 4; // Paragraph spacing
  }

  return doc.output('blob');
}

export default function ContentGenerator({ onBack }: ContentGeneratorProps) {
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (previewPdfUri) {
      setPreviewPdfUri(null);
    } else if (showHistory) {
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
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState<string>('');
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

  useEffect(() => {
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

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const userProfile = getUserProfileData();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && !result) {
      setLoadingProgress(0);
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 96) {
            return Math.min(Math.round((prev + 0.05) * 10) / 10, 97);
          }
          let inc = 1.0;
          if (prev < 25) inc = 1.6;
          else if (prev < 50) inc = 1.1;
          else if (prev < 75) inc = 0.7;
          else if (prev < 90) inc = 0.35;
          else inc = 0.12;

          const nextVal = Math.min(Math.round((prev + inc) * 10) / 10, 96);
          const stepIndex = Math.min(Math.floor((nextVal / 96) * (writingSteps.length - 1)), writingSteps.length - 1);
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
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const isContentGen = data.type === 'content_generation' || 
                             data.type === 'note' ||
                             (data.title && data.title.toLowerCase().includes('generated')) ||
                             (data.title && data.title.toLowerCase().includes('ai writer'));
        if (isContentGen && data.text) {
          items.push({
            id: docSnap.id,
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

    // Check coins before generating
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
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const profile = getUserProfileData();
      const response = await fetch(getApiUrl('/api/generate-content'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          topic, 
          type: selectedType,
          tone: selectedTone,
          format: selectedType === 'Essay' ? selectedFormat : 'Standard',
          gradeLevel: profile.gradeLevel,
          stream: profile.stream,
          country: profile.country
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
          if (errText.length > 0 && errText.length < 200) errMsg = errText;
        }
        throw new Error(errMsg);
      }
      
      const genContentType = response.headers.get("content-type") || "";
      if (!genContentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }
      const data = await response.json();
      setLoadingProgress(100);
      await new Promise(r => setTimeout(r, 250));
      
      deductCoins(1, "AI Writing Helper");
      setResult(data.text);

      // Auto-save to cloud history
      if (auth.currentUser) {
        try {
          const docRef = await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            type: 'content_generation',
            title: `Generated ${selectedType}: ${topic.length > 30 ? topic.substring(0, 30) + '...' : topic}`,
            text: data.text,
            topic: topic,
            contentType: selectedType,
            tone: selectedTone,
            format: selectedType === 'Essay' ? selectedFormat : 'Standard',
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
      setError(err.message || 'Oops! Something went wrong on our end. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleViewPDF = async () => {
    if (!result) return;
    triggerVibration(15);
    setExporting(true);
    try {
      const filename = `HelpYou_AI_${selectedType.toLowerCase()}_${Date.now()}.pdf`;
      const blob = generateContentPDFBlob(
        selectedType,
        topic || `${selectedType} Study Guide`,
        selectedTone,
        selectedType === 'Essay' ? selectedFormat : 'Standard',
        result
      );

      const blobUrl = URL.createObjectURL(blob);
      setPreviewPdfUri(blobUrl);
      setPreviewPdfName(filename);

      // Flag item as PDF in Firestore
      if (currentSavedId && auth.currentUser) {
        try {
          await updateDoc(doc(db, 'pocket_items', currentSavedId), { isPdf: true });
          setHistoryItems(prev => prev.map(item => item.id === currentSavedId ? { ...item, isPdf: true } : item));
        } catch (historyErr) {
          console.warn('Could not save PDF tag to Content Generator history:', historyErr);
        }
      }
    } catch (err) {
      console.error("Failed to preview PDF:", err);
      alert("Could not generate PDF preview. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleSharePDF = async () => {
    if (!result) return;
    triggerVibration(15);
    setExporting(true);
    try {
      const filename = `HelpYou_AI_${selectedType.toLowerCase()}_${Date.now()}.pdf`;
      const blob = generateContentPDFBlob(
        selectedType,
        topic || `${selectedType} Study Guide`,
        selectedTone,
        selectedType === 'Essay' ? selectedFormat : 'Standard',
        result
      );

      // Share PDF file natively via Capacitor or Web API
      await sharePDFMobile(blob, filename);

      // Flag item as PDF in Firestore
      if (currentSavedId && auth.currentUser) {
        try {
          await updateDoc(doc(db, 'pocket_items', currentSavedId), { isPdf: true });
          setHistoryItems(prev => prev.map(item => item.id === currentSavedId ? { ...item, isPdf: true } : item));
        } catch (historyErr) {
          console.warn('Could not save PDF tag to Content Generator history:', historyErr);
        }
      }
    } catch (err) {
      console.error("Failed to share PDF:", err);
      alert("Could not share PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleShareText = async () => {
    if (!result) return;
    triggerVibration(10);
    const shareTitle = `${selectedType}: ${topic.substring(0, 40)}`;
    const shareText = `📚 ${selectedType.toUpperCase()} - generated with HelpYou AI\n\nTopic: ${topic}\nTone: ${selectedTone} | Format: ${selectedType === 'Essay' ? selectedFormat : 'Standard'}\n\n${result}`;
    await shareTextMobile(shareTitle, shareText);
  };

  const handleCopy = async () => {
    if (!result) return;
    triggerVibration(15);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(result);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = result;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const resultWords = result ? result.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  const readingTimeMin = Math.max(1, Math.round(resultWords / 180));

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-cyan-100 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-blue-50 rounded-full blur-[120px] pointer-events-none" />

      {/* FULL-SCREEN PDF PREVIEW MODAL */}
      {previewPdfUri && (
        <div className="fixed inset-0 z-50 bg-[#FAF9F6] flex flex-col">
          <div className="pt-6 pb-4 px-6 bg-white border-b border-zinc-200 shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  triggerVibration(10);
                  setPreviewPdfUri(null);
                }}
                className="w-10 h-10 bg-zinc-50 hover:bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 transition-colors border border-zinc-200 active:scale-95"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-extrabold text-sm md:text-base text-zinc-900 line-clamp-1">
                  {previewPdfName}
                </h3>
                <p className="text-[11px] text-zinc-400 font-bold">Formatted PDF Preview</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSharePDF}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 active:scale-95 text-white rounded-full font-black text-xs shadow-md transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share PDF</span>
              </button>
            </div>
          </div>

          <div className="flex-1 p-3 bg-zinc-100 overflow-hidden">
            <SafePdfViewer pdfUrl={previewPdfUri} />
          </div>
        </div>
      )}

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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-40 z-10">

      {showHistory ? (
        <div className="max-w-md mx-auto space-y-4 mb-12">
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
                    setTopic(item.topic || item.title || '');
                    setSelectedType(item.contentType || 'Essay');
                    setSelectedTone(item.tone || 'Academic');
                    setSelectedFormat(item.format || 'Standard');
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
                    title="Delete item"
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
          className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center max-w-md mx-auto mb-12"
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
          <div className="flex-1 flex flex-col w-full max-w-md mx-auto mb-12">
            <div className="bg-white border border-zinc-200 rounded-3xl p-4 sm:p-6 shadow-md">
              {/* Active Student Profile Calibrator Badge */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-100 rounded-2xl text-cyan-900 text-xs font-bold mb-3.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                  <span className="truncate">Calibrated for {userProfile.gradeLevel}</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-white border border-cyan-200 rounded-md text-cyan-700 shrink-0">
                  {userProfile.stream ? (userProfile.stream.length > 15 ? userProfile.stream.substring(0, 15) + '...' : userProfile.stream) : 'Academic'}
                </span>
              </div>

              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Content Type (Slide to select)</label>
              
              {/* Horizontal Slider Content Types */}
              <div className="flex gap-2.5 overflow-x-auto pb-2.5 pt-1 mb-3.5 scrollbar-none snap-x snap-mandatory touch-pan-x">
                {CONTENT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = selectedType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      className={`snap-center shrink-0 flex items-center justify-center gap-2 w-32 py-2.5 px-3 rounded-2xl border transition-all cursor-pointer ${
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

              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Topic / Subject</label>
                {topic.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTopic('')}
                    className="text-[11px] font-bold text-zinc-400 hover:text-red-500 transition-colors flex items-center gap-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
              <div className="relative mb-3.5">
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="E.g., The impact of AI on modern education..."
                  className="w-full p-3.5 pr-8 pb-7 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 resize-none h-28 sm:h-32 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-semibold text-sm leading-relaxed"
                />
                <div className="absolute bottom-2.5 right-3 text-xs font-bold text-zinc-400">
                  {wordCount} words
                </div>
              </div>

              {/* Tone Selection Row */}
              <div className="mb-3">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Tone</label>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
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

              {/* Academic Formats (Visible only if 'Essay' is selected) */}
              {selectedType === 'Essay' && (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Academic Format</label>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {["Standard", "APA Format", "MLA Format"].map((fmt) => {
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
                <div className="bg-red-50 text-red-600 text-sm font-bold px-4 py-3 rounded-xl border border-red-100 mb-4">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={!topic.trim() || loading}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-3.5 sm:py-4 rounded-xl font-black text-base sm:text-lg shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center border border-cyan-500/20 cursor-pointer"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Generate ${selectedType}`}
              </button>
            </div>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col z-10 w-full max-w-lg mx-auto mb-12"
          >
            {/* Document Header Panel */}
            <div className="bg-zinc-100/90 border border-zinc-200 rounded-t-2xl px-4 py-3 text-xs font-semibold text-zinc-600 flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-zinc-800">{selectedType} Document</span>
                <span className="text-[11px] text-zinc-500 font-bold">• {resultWords} words</span>
                <span className="text-[11px] text-zinc-500 font-bold">• {readingTimeMin} min read</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="bg-white border border-zinc-200 text-zinc-700 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                  {selectedTone}
                </span>
                {selectedType === 'Essay' && selectedFormat !== 'Standard' && (
                  <span className="bg-cyan-50 border border-cyan-200 text-cyan-700 px-2 py-0.5 rounded-full font-black text-[10px]">
                    {selectedFormat}
                  </span>
                )}
                <span className="bg-cyan-500/10 text-cyan-700 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold text-[10px]">
                  {userProfile.gradeLevel}
                </span>
              </div>
            </div>

            {/* Generated Document Content with Format-Specific Typography */}
            {selectedType === 'Poem' ? (
              <div className="bg-[#FAFAF8] rounded-b-2xl p-5 md:p-8 shadow-sm border-x border-b border-zinc-200 mb-4 whitespace-pre-wrap font-serif italic text-zinc-800 leading-relaxed text-sm md:text-base select-text">
                <GlobalMarkdown>{result || ''}</GlobalMarkdown>
              </div>
            ) : selectedType === 'Essay' && (selectedTone === 'Academic' || selectedFormat === 'APA Format' || selectedFormat === 'MLA Format') ? (
              <div className="bg-white rounded-b-2xl p-5 md:p-8 shadow-sm border-x border-b border-zinc-200 mb-4 prose prose-sm max-w-none prose-headings:font-black prose-headings:tracking-tight text-zinc-900 leading-relaxed text-left [&>p]:mb-4 select-text">
                <GlobalMarkdown>{result || ''}</GlobalMarkdown>
              </div>
            ) : (
              <div className="bg-white rounded-b-2xl p-5 md:p-8 shadow-sm border-x border-b border-zinc-200 mb-4 prose prose-sm max-w-none prose-headings:font-bold prose-headings:tracking-tight text-zinc-800 leading-relaxed text-left [&>p]:mb-4 select-text">
                <GlobalMarkdown>{result || ''}</GlobalMarkdown>
              </div>
            )}

            {/* Sleek Action Bar with Copy Text, View PDF, Share PDF, and Share Text */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mb-3 bg-white border border-zinc-200 rounded-2xl p-2.5 shadow-sm">
              {/* [📋 Copy Text] */}
              <button
                onClick={handleCopy}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 bg-zinc-50 hover:bg-zinc-100 active:scale-95 border border-zinc-200 rounded-xl font-bold text-[11px] text-zinc-800 shadow-xs transition-all cursor-pointer select-none"
                title="Copy full text to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-600" />}
                <span className={copied ? 'text-emerald-600 font-black' : ''}>{copied ? 'Copied!' : 'Copy'}</span>
              </button>

              {/* [📄 View PDF] */}
              <button
                onClick={handleViewPDF}
                disabled={exporting}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 bg-zinc-50 hover:bg-zinc-100 active:scale-95 border border-zinc-200 rounded-xl font-bold text-[11px] text-zinc-800 shadow-xs transition-all cursor-pointer select-none"
                title="View formatted PDF"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-600" /> : <Eye className="w-3.5 h-3.5 text-cyan-600" />}
                <span>View PDF</span>
              </button>

              {/* [🚀 Share PDF (Native File Share)] */}
              <button
                onClick={handleSharePDF}
                disabled={exporting}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 bg-cyan-600 hover:bg-cyan-700 active:scale-95 text-white rounded-xl font-black text-[11px] shadow-md transition-all cursor-pointer select-none border-none"
                title="Share PDF file natively"
              >
                <Share2 className="w-3.5 h-3.5 text-white" />
                <span>Share PDF</span>
              </button>

              {/* [💬 Share Text] */}
              <button
                onClick={handleShareText}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 bg-zinc-50 hover:bg-zinc-100 active:scale-95 border border-zinc-200 rounded-xl font-bold text-[11px] text-zinc-800 shadow-xs transition-all cursor-pointer select-none"
                title="Share formatted text"
              >
                <Share2 className="w-3.5 h-3.5 text-zinc-600" />
                <span>Text</span>
              </button>
            </div>

            {/* [🚩 Report AI Content] */}
            <button
              onClick={() => {
                triggerVibration(15);
                setReportModalOpen(true);
              }}
              className="w-full mb-3 py-2.5 px-3 bg-rose-50 hover:bg-rose-100 active:scale-95 border border-rose-200/60 rounded-xl font-bold text-xs text-rose-700 shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none"
              title="Report Inaccurate or Inappropriate Content"
            >
              <Flag className="w-3.5 h-3.5 text-rose-500" />
              <span>Report Generated Content</span>
            </button>
            
            <button 
              onClick={() => {
                setResult(null);
              }}
              className="w-full py-3.5 rounded-xl font-extrabold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors bg-white shadow-sm cursor-pointer active:scale-98 mb-12"
            >
              Create Another
            </button>
          </motion.div>
        )}
      </div>

      {/* Google Play GenAI Safety Report Modal */}
      <ReportAIModal
        isOpen={reportModalOpen}
        messageText={result || ''}
        sourceFeature="Content Generator"
        onClose={() => setReportModalOpen(false)}
      />
    </div>
  );
}
