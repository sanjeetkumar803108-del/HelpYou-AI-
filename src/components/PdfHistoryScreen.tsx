import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, FileText, Trash2, Download, Eye, Calendar, Sparkles, 
  Search, HardDrive, RefreshCw, X, Share2, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getPdfHistory, 
  deletePdfFromHistory, 
  clearPdfHistory, 
  PdfHistoryItem 
} from '../utils/pdfHistory';
import { savePDFMobile, sharePDFMobile } from '../utils/mobileSaver';
import { triggerVibration } from '../utils/vibrate';
import { Capacitor } from '@capacitor/core';
import SafePdfViewer from './SafePdfViewer';

interface PdfHistoryScreenProps {
  onBack: () => void;
  onOpenImageToPdf?: () => void;
}

export default function PdfHistoryScreen({ onBack, onOpenImageToPdf }: PdfHistoryScreenProps) {
  const [historyItems, setHistoryItems] = useState<PdfHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPdf, setSelectedPdf] = useState<PdfHistoryItem | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  
  // Custom dialog state for safe delete/clear on mobile WebViews & iframes
  const [pdfToDelete, setPdfToDelete] = useState<PdfHistoryItem | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (selectedPdf) {
        e.preventDefault();
        triggerVibration(10);
        setSelectedPdf(null);
        if (previewBlobUrl) {
          URL.revokeObjectURL(previewBlobUrl);
          setPreviewBlobUrl(null);
        }
      } else if (pdfToDelete) {
        e.preventDefault();
        triggerVibration(10);
        setPdfToDelete(null);
      } else if (showClearConfirm) {
        e.preventDefault();
        triggerVibration(10);
        setShowClearConfirm(false);
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [selectedPdf, previewBlobUrl, pdfToDelete, showClearConfirm]);

  // Load PDF history from centralized store
  const loadHistory = () => {
    const items = getPdfHistory();
    setHistoryItems(items);
  };

  useEffect(() => {
    loadHistory();

    const handleUpdate = () => {
      loadHistory();
    };

    window.addEventListener('pdf-history-updated', handleUpdate);
    return () => {
      window.removeEventListener('pdf-history-updated', handleUpdate);
    };
  }, []);

  // Filter items based on search query
  const filteredItems = historyItems.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.featureTag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Trigger safe custom confirmation before delete
  const handleDeleteTrigger = (item: PdfHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(20);
    setPdfToDelete(item);
  };

  // Safe delete execution
  const confirmDelete = () => {
    if (!pdfToDelete) return;
    triggerVibration(20);
    deletePdfFromHistory(pdfToDelete.id);
    if (selectedPdf?.id === pdfToDelete.id) {
      setSelectedPdf(null);
      setPreviewBlobUrl(null);
    }
    setPdfToDelete(null);
  };

  // Trigger safe custom confirmation before clearing all
  const handleClearAllTrigger = () => {
    if (historyItems.length === 0) return;
    triggerVibration(30);
    setShowClearConfirm(true);
  };

  // Safe clear execution
  const confirmClearAll = () => {
    triggerVibration(20);
    clearPdfHistory();
    setSelectedPdf(null);
    setPreviewBlobUrl(null);
    setShowClearConfirm(false);
  };

  // Helper to open PDF in viewer
  const handleViewPdf = (item: PdfHistoryItem) => {
    triggerVibration(15);
    setSelectedPdf(item);

    try {
      if (item.fileUri.startsWith('data:')) {
        // Convert data URI to Blob URL for iframe viewing
        const parts = item.fileUri.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const url = URL.createObjectURL(blob);
        setPreviewBlobUrl(url);
      } else {
        setPreviewBlobUrl(item.fileUri);
      }
    } catch (err) {
      console.error('Error generating preview URL:', err);
      setPreviewBlobUrl(item.fileUri);
    }
  };

  // Handle Save / Export
  const handleSavePdf = async (item: PdfHistoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerVibration(20);

    try {
      if (item.fileUri.startsWith('data:')) {
        const parts = item.fileUri.split(',');
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: 'application/pdf' });
        await savePDFMobile(blob, item.title);
      } else {
        await savePDFMobile(item.fileUri, item.title);
      }
    } catch (err) {
      console.error('Error saving PDF:', err);
      alert('Could not open/save PDF. Please try again.');
    }
  };

  // Handle Share / Export
  const handleSharePdf = async (item: PdfHistoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerVibration(20);

    try {
      if (item.fileUri.startsWith('data:')) {
        const parts = item.fileUri.split(',');
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: 'application/pdf' });
        await sharePDFMobile(blob, item.title);
      } else {
        await sharePDFMobile(item.fileUri, item.title);
      }
    } catch (err) {
      console.error('Error sharing PDF:', err);
      alert('Could not share PDF. Please try again.');
    }
  };

  // Get Feature Tag Color Pill
  const getTagColor = (tag: string) => {
    const t = tag.toLowerCase();
    if (t.includes('image')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (t.includes('note')) return 'bg-purple-100 text-purple-700 border-purple-200';
    if (t.includes('guide') || t.includes('content')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  };

  if (selectedPdf) {
    return (
      <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col h-screen w-screen animate-fade-in">
        {/* Top sticky app bar */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-center gap-4 shrink-0">
          <button
            onClick={() => { setSelectedPdf(null); setPreviewBlobUrl(null); }}
            className="w-10 h-10 bg-zinc-800 hover:bg-zinc-750 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-sm text-white truncate">{selectedPdf.title}</h3>
            <p className="text-[10px] text-zinc-400 font-bold">{selectedPdf.featureTag} • Full Screen Mode</p>
          </div>
        </div>
        {/* Preview Content */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {selectedPdf.fileUri ? (
            <SafePdfViewer pdfUrlOrBase64={selectedPdf.fileUri} />
          ) : (
            <div className="text-center p-6 text-zinc-500 my-auto">
              <p className="text-xs font-bold text-zinc-400">Loading PDF Preview...</p>
            </div>
          )}
        </div>
        {/* Bottom Action bar */}
        <div className="bg-zinc-950 p-4 border-t border-zinc-900 flex gap-2.5 shrink-0 z-10">
          <button
            onClick={() => handleSharePdf(selectedPdf)}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Share2 className="w-4 h-4 text-white" />
            <span>SHARE DOCUMENT</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* Background Soft Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-red-100/50 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-rose-50/60 rounded-full blur-[120px] pointer-events-none" />

      {/* STICKY HEADER */}
      <header className="sticky top-0 z-30 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-zinc-200/80 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { triggerVibration(10); onBack(); }}
            className="w-9 h-9 bg-white hover:bg-zinc-100 active:scale-95 text-zinc-700 rounded-xl flex items-center justify-center border border-zinc-200/80 shadow-xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base text-zinc-900 leading-tight">PDF History</h1>
              <span className="bg-red-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-xs">
                {historyItems.length}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 font-bold">Auto-captured documents</p>
          </div>
        </div>

        {historyItems.length > 0 && (
          <button
            onClick={handleClearAllTrigger}
            className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 transition-all cursor-pointer flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All</span>
          </button>
        )}
      </header>

      {/* SEARCH BAR & CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {historyItems.length > 0 && (
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PDF history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-800 placeholder-zinc-400 font-medium focus:outline-hidden focus:ring-2 focus:ring-red-500/20 shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* EMPTY STATE */}
        {historyItems.length === 0 ? (
          <div className="text-center py-16 px-4 flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-center text-rose-500 mb-4 shadow-sm">
              <FileText className="w-10 h-10" />
            </div>
            <h3 className="font-extrabold text-zinc-900 text-lg mb-1">No PDF History Yet</h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed mb-6">
              Whenever you generate or export a PDF (Image to PDF, Smart Notes, or Study Content), it automatically gets saved here for easy access!
            </p>
            {onOpenImageToPdf && (
              <button
                onClick={() => { triggerVibration(15); onOpenImageToPdf(); }}
                className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Create Image to PDF</span>
              </button>
            )}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-xs font-bold">No PDFs found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="space-y-2.5 pb-8">
            <AnimatePresence>
              {filteredItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => handleViewPdf(item)}
                  className="bg-white border border-zinc-200/90 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs hover:border-red-300 hover:shadow-xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border uppercase tracking-wider ${getTagColor(item.featureTag)}`}>
                          {item.featureTag}
                        </span>
                        {item.pageCount && (
                          <span className="text-[10px] text-zinc-400 font-bold">
                            {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                          </span>
                        )}
                      </div>
                      <h4 className="font-extrabold text-xs text-zinc-900 truncate group-hover:text-red-600 transition-colors">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-medium mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.timestamp).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {item.fileSize && <span>• {item.fileSize}</span>}
                      </div>
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => handleSharePdf(item, e)}
                      title="Share PDF"
                      className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 flex items-center justify-center transition-all cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteTrigger(item, e)}
                      title="Delete PDF"
                      className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 flex items-center justify-center transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* CUSTOM CONFIRMATION MODALS FOR NATIVE HYBRID COMPATIBILITY */}
      <AnimatePresence>
        {pdfToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-100"
            >
              <div className="w-12 h-12 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-zinc-900 text-lg text-center mb-1">Delete PDF Document?</h3>
              <p className="text-xs text-zinc-500 text-center mb-6 leading-relaxed">
                Are you sure you want to delete <span className="font-black text-zinc-800">"{pdfToDelete.title}"</span>? This action cannot be undone.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPdfToDelete(null)}
                  className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs py-3.5 rounded-2xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs py-3.5 rounded-2xl transition-all shadow-sm cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showClearConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-100"
            >
              <div className="w-12 h-12 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-xs">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="font-extrabold text-zinc-900 text-lg text-center mb-1">Clear PDF History?</h3>
              <p className="text-xs text-zinc-500 text-center mb-6 leading-relaxed">
                Are you sure you want to permanently clear all <span className="font-black text-zinc-800">{historyItems.length}</span> documents from your history? This action cannot be undone.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs py-3.5 rounded-2xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClearAll}
                  className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs py-3.5 rounded-2xl transition-all shadow-sm cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
