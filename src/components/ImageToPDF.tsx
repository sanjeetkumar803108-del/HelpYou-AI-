import React, { useState, useRef } from 'react';
import { ArrowLeft, Upload, FileImage, FileDown, FileText, History, Share2, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import { savePDFMobile, sharePDFMobile } from '../utils/mobileSaver';
import { savePdfToHistory } from '../utils/pdfHistory';
import { Capacitor } from '@capacitor/core';
import { pickNativeFiles } from '../utils/mobilePicker';
import SafePdfViewer from './SafePdfViewer';
import { triggerVibration } from '../utils/vibrate';

export default function ImageToPDF({ onBack, onOpenHistory }: { onBack: () => void; onOpenHistory?: () => void }) {
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (pdfBlobUrl) {
      setPdfBlobUrl(null);
    } else if (showPreviewPage) {
      setShowPreviewPage(false);
    } else if (images.length > 0) {
      setImages([]);
    } else {
      onBack();
    }
  };
  const [images, setImages] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfDataUri, setPdfDataUri] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [showPreviewPage, setShowPreviewPage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountTimeRef = useRef<number>(Date.now());

  React.useEffect(() => {
    mountTimeRef.current = Date.now();
  }, []);

  React.useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (pdfBlobUrl || showPreviewPage || images.length > 0) {
        e.preventDefault();
        handleHeaderBack();
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [pdfBlobUrl, showPreviewPage, images]);

  const downloadPDF = async () => {
    if (!pdfBlobUrl) return;
    try {
      const response = await fetch(pdfBlobUrl);
      const blob = await response.blob();
      await savePDFMobile(blob, pdfFileName || 'HelpYou-AI-Document.pdf');
    } catch (err) {
      console.error('Failed to download PDF via mobile saver:', err);
    }
  };

  const sharePDF = async () => {
    if (!pdfBlobUrl) return;
    try {
      const response = await fetch(pdfBlobUrl);
      const blob = await response.blob();
      await sharePDFMobile(blob, pdfFileName || 'HelpYou-AI-Document.pdf');
    } catch (err) {
      console.error('Failed to share PDF via mobile share:', err);
    }
  };

  // Drag and Drop States
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [touchDraggingIndex, setTouchDraggingIndex] = useState<number | null>(null);
  const longPressTimeout = useRef<any>(null);

  const handlePickImages = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Prevent synthetic ghost click from previous screen tap
    if (Date.now() - mountTimeRef.current < 450) {
      return;
    }
    triggerVibration(10);
    if (Capacitor.isNativePlatform()) {
      const picked = await pickNativeFiles({ types: 'image', multiple: true });
      if (picked && picked.length > 0) {
        const newImages = picked.map(p => p.dataUrl);
        setImages(prev => [...prev, ...newImages]);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newImages = Array.from(e.target.files).map(file => URL.createObjectURL(file));
      setImages(prev => [...prev, ...newImages]);
      e.target.value = '';
    }
  };

  const removeImage = (indexToRemove: number) => {
    setImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Desktop Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    
    const updated = [...images];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, draggedItem);
    setImages(updated);
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Touch Long-Press Drag and Drop Handlers
  const handleTouchStart = (index: number) => {
    longPressTimeout.current = setTimeout(() => {
      setTouchDraggingIndex(index);
      if (navigator.vibrate) {
        navigator.vibrate(50); // Small vibration feedback for touch activation
      }
    }, 400); // 400ms long-press activation
  };

  const handleTouchMove = (e: React.TouchEvent, currentIndex: number) => {
    if (touchDraggingIndex === null) {
      clearTimeout(longPressTimeout.current);
      return;
    }
    
    e.preventDefault(); // Prevent standard page scrolling while dragging is active
    
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetElement) return;
    
    const card = targetElement.closest('[data-index]');
    if (card) {
      const targetIndex = parseInt(card.getAttribute('data-index') || '', 10);
      if (!isNaN(targetIndex) && targetIndex !== touchDraggingIndex) {
        const updated = [...images];
        const [draggedItem] = updated.splice(touchDraggingIndex, 1);
        updated.splice(targetIndex, 0, draggedItem);
        setImages(updated);
        setTouchDraggingIndex(targetIndex);
      }
    }
  };

  const handleTouchEnd = () => {
    clearTimeout(longPressTimeout.current);
    setTouchDraggingIndex(null);
  };

  const handleSavePDF = async () => {
    if (images.length === 0) return;
    setLoading(true);

    try {
      // Yield to main thread to show loader
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < images.length; i++) {
        let imgSrc = images[i];
        
        // Handle local file:// URIs properly on native mobile wrappers
        if (Capacitor.isNativePlatform() && imgSrc.startsWith('file://')) {
          imgSrc = Capacitor.convertFileSrc(imgSrc);
        }
        
        const img = new Image();
        img.src = imgSrc;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        // Compression canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const isHigh = quality === 'high';
        const MAX_WIDTH = isHigh ? 2400 : 1200;
        const MAX_HEIGHT = isHigh ? 3200 : 1600;
        const compressionQuality = isHigh ? 0.95 : 0.65;
        
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', compressionQuality);

        const imgRatio = width / height;
        const pdfRatio = pdfWidth / pdfHeight;

        let renderWidth = pdfWidth;
        let renderHeight = pdfHeight;

        if (imgRatio > pdfRatio) {
           renderHeight = pdfWidth / imgRatio;
        } else {
           renderWidth = pdfHeight * imgRatio;
        }
        
        const x = (pdfWidth - renderWidth) / 2;
        const y = (pdfHeight - renderHeight) / 2;

        if (i > 0) {
          pdf.addPage();
        }
        
        pdf.addImage(compressedDataUrl, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'FAST');
      }

      const outputName = fileName.trim() ? `${fileName.trim().replace(/\.pdf$/i, '')}.pdf` : 'HelpYou-AI-Document.pdf';
      setPdfFileName(outputName);
      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(blobUrl);

      // Automatic capture for centralized PDF history
      try {
        const dataUri = pdf.output('datauristring');
        setPdfDataUri(dataUri);
        savePdfToHistory({
          title: outputName,
          fileUri: dataUri,
          featureTag: 'Image to PDF',
          pageCount: images.length,
          fileSize: `${(blob.size / 1024).toFixed(1)} KB`,
        });
      } catch (historyErr) {
        console.warn('Could not auto-save PDF to history:', historyErr);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF. Try with fewer images.');
    } finally {
      setLoading(false);
    }
  };

  if (showPreviewPage) {
    return (
      <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col h-screen w-screen animate-fade-in">
        {/* Top sticky app bar */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-center gap-4 shrink-0">
          <button
            onClick={() => setShowPreviewPage(false)}
            className="w-10 h-10 bg-zinc-800 hover:bg-zinc-750 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-sm text-white truncate">{pdfFileName}</h3>
            <p className="text-[10px] text-zinc-400 font-bold">PDF Reader • Full Screen Mode</p>
          </div>
        </div>
        {/* Preview Content */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {pdfDataUri || pdfBlobUrl ? (
            <SafePdfViewer pdfUrlOrBase64={pdfDataUri || pdfBlobUrl} />
          ) : (
            <div className="text-center p-6 text-zinc-500 my-auto">
              <p className="text-xs font-bold text-zinc-400">Loading PDF Preview...</p>
            </div>
          )}
        </div>
        {/* Bottom Action bar */}
        <div className="bg-zinc-950 p-4 border-t border-zinc-900 flex gap-2.5 shrink-0 z-10">
          <button
            onClick={sharePDF}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Share2 className="w-4 h-4 text-white" />
            <span>SHARE DOCUMENT</span>
          </button>
        </div>
      </div>
    );
  }

  if (pdfBlobUrl) {
    return (
      <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
        {/* FIXED/STICKY HEADER BAR */}
        <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200/80 flex items-center gap-4 shrink-0">
          <button 
            onClick={() => {
              if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
              setPdfBlobUrl(null);
              setPdfDataUri(null);
            }}
            className="w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight line-clamp-1 text-zinc-900">
              <FileImage className="w-5 h-5 text-blue-600 mr-2 shrink-0" />
              <span>PDF Ready</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Your document has been compiled successfully</p>
          </div>
        </div>

        {/* Success View */}
        <div className="flex-1 overflow-y-auto px-6 py-12 flex flex-col items-center justify-center text-center z-10 relative">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-2xl w-24 h-24 mx-auto" />
            <div className="relative w-20 h-20 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h3 className="text-xl font-extrabold text-zinc-950 mb-2 font-sans">PDF Generated Successfully!</h3>
          <p className="text-sm text-zinc-600 font-bold mb-1 max-w-sm font-sans px-4 break-all">
            {pdfFileName}
          </p>
          <p className="text-xs text-zinc-400 font-semibold mb-8 max-w-xs font-sans">
            {images.length} {images.length === 1 ? 'image' : 'images'} converted • {quality === 'high' ? 'High Quality' : 'Standard Quality'}
          </p>

          <div className="w-full max-w-sm flex flex-col gap-3 px-4">
            {/* Preview Option */}
            <button
              onClick={() => setShowPreviewPage(true)}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 text-zinc-800 py-4 px-6 rounded-2xl font-bold border border-zinc-200 shadow-sm transition-all active:scale-[0.98] text-sm cursor-pointer"
            >
              <FileText className="w-5 h-5 text-blue-600" />
              <span>PREVIEW PDF</span>
            </button>

            {/* Share Option */}
            <button
              onClick={sharePDF}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-4 px-6 rounded-2xl font-bold border border-blue-500/20 shadow-lg shadow-blue-500/10 transition-all active:scale-[0.98] text-sm cursor-pointer"
            >
              <Share2 className="w-5 h-5" />
              <span>SHARE PDF</span>
            </button>

            {/* Create Another Option */}
            <button
              onClick={() => {
                if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
                setPdfBlobUrl(null);
                setPdfDataUri(null);
                setImages([]);
                setFileName('');
              }}
              className="mt-6 text-xs font-black text-zinc-400 hover:text-zinc-700 transition-colors uppercase tracking-widest cursor-pointer"
            >
              CONVERT MORE IMAGES
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#FAF9F6]/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center"
          >
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-blue-500/20 rounded-2xl blur-xl"
              />
              <motion.div
                animate={{ y: [-5, 5, -5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="relative bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 shadow-2xl flex items-center justify-center text-white border border-blue-400/50"
              >
                 <FileText className="w-12 h-12" />
                 <span className="absolute -bottom-3 right-[-10px] bg-white text-blue-600 text-xs font-black px-2.5 py-1 rounded-md shadow-md border border-zinc-200 uppercase tracking-widest">PDF</span>
              </motion.div>
            </div>
            <motion.p 
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="mt-8 text-blue-600 font-bold tracking-widest uppercase text-sm"
            >
              Building PDF...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Multi-File Input */}
      <input 
        type="file" 
        multiple 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleImageUpload} 
      />

      {/* FIXED/STICKY HEADER BAR */}
      <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleHeaderBack}
            className="w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight line-clamp-1 text-zinc-900">
              <FileImage className="w-5 h-5 text-blue-600 mr-2 shrink-0" />
              <span>Image to PDF</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">
              {images.length > 0 ? `${images.length} photos selected • Unlimited` : 'Select unlimited gallery photos into one PDF'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {images.length > 0 && (
            <button
              onClick={() => {
                triggerVibration(10);
                setImages([]);
              }}
              className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-[11px] font-bold transition-all cursor-pointer"
            >
              Clear
            </button>
          )}

          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="w-9 h-9 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center border border-rose-200/80 shadow-xs transition-all cursor-pointer shrink-0"
              title="View PDF History"
            >
              <History className="w-4.5 h-4.5" />
            </button>
          )}
        </div>
      </div>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-6 z-10 relative">
        {images.length === 0 ? (
          <div 
            className="flex flex-col items-center justify-center min-h-[300px] p-6 bg-white border-2 border-dashed border-blue-200 rounded-[2rem] shadow-sm text-center"
          >
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 border border-blue-100 shadow-xs">
              <Upload className="w-8 h-8" />
            </div>
            <p className="text-zinc-900 font-extrabold text-base mb-1">Convert Photos to PDF</p>
            <p className="text-zinc-400 text-xs font-semibold max-w-xs mb-5">
              Choose photos from your mobile gallery to compile a clean, high-quality multi-page PDF document
            </p>
            <button
              type="button"
              onClick={(e) => handlePickImages(e)}
              className="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Select Photos (Unlimited)</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Interactive Drag & Drop Reordering Indicator & Add More Banner */}
            <div className="flex items-center justify-between gap-2 bg-blue-50/75 border border-blue-100/50 rounded-2xl p-3 mb-4 text-[11px] font-semibold text-blue-700 animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-xs">💡</span>
                <span>Drag images to reorder pages ({images.length} pages)</span>
              </div>
              <button
                onClick={handlePickImages}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-extrabold shadow-xs transition-all cursor-pointer shrink-0"
              >
                + Add More
              </button>
            </div>

            {/* Grid display with Drag events */}
            <div className="grid grid-cols-2 gap-4 pb-12">
              {images.map((img, idx) => {
                const isDragging = idx === draggedIndex || idx === touchDraggingIndex;
                const isDragOver = idx === dragOverIndex;

                return (
                  <div 
                    key={idx}
                    data-index={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, idx)}
                    onTouchStart={() => handleTouchStart(idx)}
                    onTouchMove={(e) => handleTouchMove(e, idx)}
                    onTouchEnd={handleTouchEnd}
                    className={`relative aspect-[3/4] bg-white rounded-2xl overflow-hidden shadow-sm border select-none transition-all duration-200 group cursor-grab active:cursor-grabbing ${
                      isDragging 
                        ? 'opacity-40 scale-95 border-blue-500 ring-2 ring-blue-500/20 z-20' 
                        : isDragOver
                          ? 'border-blue-400 ring-2 ring-blue-400/20 scale-105 z-20'
                          : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <img src={img} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover pointer-events-none" />
                    
                    {/* Index Badge */}
                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-blue-500 shadow-sm">
                      Page {idx + 1}
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(idx);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-red-600 transition-colors z-30 cursor-pointer"
                      title="Remove image"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <span className="text-[10px] text-white font-bold tracking-wider uppercase">Drag to Reorder</span>
                    </div>
                  </div>
                );
              })}

              {/* Add Images Card */}
              <div 
                onClick={handlePickImages}
                className="relative aspect-[3/4] bg-white border-2 border-dashed border-zinc-300 hover:border-blue-400 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/20 transition-all shadow-sm group text-center p-3"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <span className="text-xs text-zinc-900 font-extrabold block">Add More</span>
                <span className="text-[10px] text-zinc-400 font-semibold block">Unlimited</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel (File name + Quality toggle + Action button) */}
      {images.length > 0 && (
        <div className="bg-white/95 backdrop-blur-md border-t border-zinc-200 px-6 pt-4 pb-6 z-30 flex flex-col gap-4 shrink-0 shadow-lg animate-slide-up">
          {/* Custom File Name */}
          <div className="w-full">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">PDF File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Enter file name (e.g., AP_Bio_Notes)..."
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-semibold text-xs"
            />
          </div>

          {/* Quality Compression Toggle */}
          <div className="w-full">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">PDF File Size & Quality</label>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                Est. ~{(images.length * (quality === 'standard' ? 0.35 : 1.2)).toFixed(1)} MB
              </span>
            </div>
            <div className="grid grid-cols-2 bg-zinc-100 p-1 rounded-2xl border border-zinc-200/60 gap-1">
              <button
                type="button"
                onClick={() => {
                  triggerVibration(10);
                  setQuality('standard');
                }}
                className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center ${
                  quality === 'standard'
                    ? 'bg-white text-blue-600 shadow-sm border border-zinc-200/50'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <span>⚡ Compact Size</span>
                <span className="text-[8px] font-bold text-zinc-400">Fast WhatsApp Share</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerVibration(10);
                  setQuality('high');
                }}
                className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center ${
                  quality === 'high'
                    ? 'bg-white text-blue-600 shadow-sm border border-zinc-200/50'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <span>💎 High Quality</span>
                <span className="text-[8px] font-bold text-zinc-400">Crystal Print</span>
              </button>
            </div>
          </div>

          {/* Save Action */}
          <button 
            onClick={handleSavePDF}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/10 transition-all active:scale-[0.98] border border-blue-500/20 text-sm cursor-pointer"
          >
            <FileDown className="w-5 h-5" />
            SAVE PDF
          </button>
        </div>
      )}
    </div>
  );
}
