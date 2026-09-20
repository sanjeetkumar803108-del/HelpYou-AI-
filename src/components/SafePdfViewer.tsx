import React, { useEffect, useRef, useState } from 'react';
import { FileText, Download, Share2, ExternalLink, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { getPdfDataBlob } from '../utils/pdfHistory';
import { savePDFMobile, sharePDFMobile } from '../utils/mobileSaver';

interface SafePdfViewerProps {
  pdfUrlOrBase64?: string; // can be blob URL, data URI, or idb:// URI
  pdfUrl?: string;
  pdfBlob?: Blob;
  pdfId?: string;
  title?: string;
}

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

// Global promise to coordinate concurrent PDF.js script loading and avoid race conditions
let pdfjsLoadPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (window.pdfjsLib) {
    try {
      if (!window.pdfjsLib.GlobalWorkerOptions?.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';
      }
    } catch (e) {}
    return Promise.resolve(window.pdfjsLib);
  }
  if (pdfjsLoadPromise) {
    return pdfjsLoadPromise;
  }

  pdfjsLoadPromise = new Promise((resolve, reject) => {
    // 1. Try local offline script bundled in APK assets (100% offline & instant)
    const script = document.createElement('script');
    script.id = 'pdfjs-local-script';
    script.src = './vendor/pdfjs/pdf.min.js';

    script.onload = () => {
      const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (lib) {
        window.pdfjsLib = lib;
        try {
          lib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';
        } catch (e) {}
        resolve(lib);
      } else {
        tryAbsoluteLocalFallback(resolve, reject);
      }
    };

    script.onerror = () => {
      tryAbsoluteLocalFallback(resolve, reject);
    };

    document.head.appendChild(script);
  });

  return pdfjsLoadPromise;
}

function tryAbsoluteLocalFallback(resolve: (value: any) => void, reject: (reason: any) => void) {
  const existing = document.getElementById('pdfjs-local-script');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.id = 'pdfjs-local-script-abs';
  script.src = '/vendor/pdfjs/pdf.min.js';

  script.onload = () => {
    const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (lib) {
      window.pdfjsLib = lib;
      try {
        lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
      } catch (e) {}
      resolve(lib);
    } else {
      tryCdnFallback(resolve, reject);
    }
  };

  script.onerror = () => {
    tryCdnFallback(resolve, reject);
  };

  document.head.appendChild(script);
}

function tryCdnFallback(resolve: (value: any) => void, reject: (reason: any) => void) {
  console.warn('[PDFViewer] Local PDF.js script unavailable, trying primary CDN...');
  const existing = document.getElementById('pdfjs-local-script-abs');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.id = 'pdfjs-cdn-script';
  script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js';

  script.onload = () => {
    const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (lib) {
      window.pdfjsLib = lib;
      try {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';
      } catch (e) {}
      resolve(lib);
    } else {
      tryCdnjsFallback(resolve, reject);
    }
  };

  script.onerror = () => {
    tryCdnjsFallback(resolve, reject);
  };

  document.head.appendChild(script);
}

function tryCdnjsFallback(resolve: (value: any) => void, reject: (reason: any) => void) {
  const existing = document.getElementById('pdfjs-cdn-script');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.id = 'pdfjs-cdnjs-script';
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';

  script.onload = () => {
    const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (lib) {
      window.pdfjsLib = lib;
      try {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      } catch (e) {}
      resolve(lib);
    } else {
      pdfjsLoadPromise = null;
      reject(new Error('PDF engine compiled but global object missing.'));
    }
  };

  script.onerror = () => {
    pdfjsLoadPromise = null;
    reject(new Error('Could not load PDF rendering engine offline.'));
  };

  document.head.appendChild(script);
}

export default function SafePdfViewer({ pdfUrlOrBase64, pdfUrl, pdfBlob, pdfId, title }: SafePdfViewerProps) {
  const targetUrl = pdfUrlOrBase64 || pdfUrl || '';
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<string>('Initializing PDF Reader...');
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rawBlob, setRawBlob] = useState<Blob | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Resolve PDF binary source safely
  const resolvePdfData = async (): Promise<{ data: Uint8Array; blob: Blob | null }> => {
    // 1. Direct Blob provided via props
    if (pdfBlob) {
      const buffer = await pdfBlob.arrayBuffer();
      return { data: new Uint8Array(buffer), blob: pdfBlob };
    }

    // 2. Try IndexedDB if pdfId is present or URL is an idb:// URI
    const effectiveId = pdfId || (targetUrl.startsWith('idb://') ? targetUrl.replace('idb://', '') : null);
    if (effectiveId) {
      try {
        const idbBlob = await getPdfDataBlob({ id: effectiveId, fileUri: targetUrl });
        if (idbBlob) {
          const buffer = await idbBlob.arrayBuffer();
          return { data: new Uint8Array(buffer), blob: idbBlob };
        }
      } catch (e) {
        console.warn('[PDFViewer] Error resolving from idb:', e);
      }
    }

    // 3. Base64 Data URI
    if (targetUrl.startsWith('data:')) {
      const base64Parts = targetUrl.split(',');
      const base64Data = base64Parts[1] || base64Parts[0];
      const cleanedBase64 = base64Data.replace(/\s/g, '');
      const binaryString = atob(cleanedBase64);
      const len = binaryString.length;
      const pdfData = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        pdfData[i] = binaryString.charCodeAt(i);
      }
      const b = new Blob([pdfData], { type: 'application/pdf' });
      return { data: pdfData, blob: b };
    }

    // 4. Blob URL or Local/Remote HTTP URL
    if (targetUrl.startsWith('blob:') || targetUrl.startsWith('http') || targetUrl.startsWith('capacitor:')) {
      try {
        const response = await fetch(targetUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const b = new Blob([arrayBuffer], { type: 'application/pdf' });
          return { data: new Uint8Array(arrayBuffer), blob: b };
        }
      } catch (fetchErr) {
        console.warn('[PDFViewer] Fetch failed on targetUrl, checking fallback store...', fetchErr);
        // Fallback: If fetch failed (e.g. revoked session blob:), try recovering by ID
        if (pdfId) {
          const recoveredBlob = await getPdfDataBlob({ id: pdfId, fileUri: '' });
          if (recoveredBlob) {
            const buffer = await recoveredBlob.arrayBuffer();
            return { data: new Uint8Array(buffer), blob: recoveredBlob };
          }
        }
      }
    }

    throw new Error('Unable to read PDF file data. The document source is unavailable or expired.');
  };

  const handleOpenExternal = async () => {
    if (!rawBlob) return;
    await savePDFMobile(rawBlob, title || 'HelpYou_AI_Document.pdf');
  };

  const handleShareExternal = async () => {
    if (!rawBlob) return;
    await sharePDFMobile(rawBlob, title || 'HelpYou_AI_Document.pdf');
  };

  const scrollToPage = (pageNum: number) => {
    if (!containerRef.current) return;
    const targetCard = containerRef.current.querySelector(`[data-page-num="${pageNum}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(pageNum);
    }
  };

  useEffect(() => {
    let active = true;

    const loadAndRender = async () => {
      try {
        if (!targetUrl && !pdfBlob && !pdfId) return;
        setLoading(true);
        setError(null);
        setLoadingProgress('Loading Offline PDF Engine...');

        // Step 1: Load PDF.js engine from local APK bundle (100% offline)
        const pdfjs = await loadPdfJs();
        if (!active) return;

        setLoadingProgress('Unpacking Document Data...');

        // Step 2: Resolve binary data
        const { data: pdfData, blob } = await resolvePdfData();
        if (!active) return;
        if (blob) setRawBlob(blob);

        setLoadingProgress('Parsing Document Structure...');

        // Step 3: Load document into PDF.js engine
        const loadingTask = pdfjs.getDocument({
          data: pdfData,
          cMapUrl: './vendor/pdfjs/cmaps/',
          cMapPacked: true,
        });
        const pdf = await loadingTask.promise;
        if (!active) return;

        const numPages = pdf.numPages;
        setTotalPages(numPages);
        setLoading(false);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // Determine optimal scale based on total page count to prevent memory pressure
        const renderScale = numPages > 40 ? 0.95 : numPages > 15 ? 1.15 : 1.45;

        // Disconnect any existing observer
        if (observerRef.current) {
          observerRef.current.disconnect();
        }

        // Cache rendered pages to avoid duplicate renders
        const renderedPages = new Set<number>();

        // Renderer function for a specific page
        const renderPage = async (pageNum: number, card: HTMLElement, canvasContainer: HTMLElement) => {
          if (renderedPages.has(pageNum) || !active) return;
          renderedPages.add(pageNum);

          try {
            const page = await pdf.getPage(pageNum);
            if (!active) return;

            const viewport = page.getViewport({ scale: renderScale });
            const canvas = document.createElement('canvas');
            canvas.className = 'w-full h-auto bg-white border-0 shadow-xs block';
            const ctx = canvas.getContext('2d', { alpha: false });

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Remove placeholder skeleton
            const skeleton = canvasContainer.querySelector('.page-skeleton');
            if (skeleton) skeleton.remove();

            canvasContainer.appendChild(canvas);

            if (ctx) {
              await page.render({
                canvasContext: ctx,
                viewport: viewport,
              }).promise;
            }
          } catch (renderErr) {
            console.warn(`[PDFViewer] Error rendering page ${pageNum}:`, renderErr);
          }
        };

        // Create page card shells for all pages upfront
        const pageCards: HTMLElement[] = [];
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageCard = document.createElement('div');
          pageCard.className = 'w-full flex flex-col items-center bg-white p-0 relative border-b border-zinc-200/80 shadow-xs last:border-b-0 min-h-[380px] transition-all';
          pageCard.setAttribute('data-page-num', String(pageNum));

          // Page Badge
          const badge = document.createElement('div');
          badge.className = 'relative my-3 bg-zinc-900 text-zinc-100 text-[10px] font-black tracking-widest px-3.5 py-1.5 rounded-full z-10 uppercase shadow-md flex items-center justify-center';
          badge.innerText = `Page ${pageNum} of ${numPages}`;
          pageCard.appendChild(badge);

          // Canvas Container
          const canvasContainer = document.createElement('div');
          canvasContainer.className = 'w-full flex flex-col items-center justify-center relative min-h-[340px]';

          // Skeleton loader placeholder
          const skeleton = document.createElement('div');
          skeleton.className = 'page-skeleton w-full min-h-[340px] flex flex-col items-center justify-center bg-zinc-100 text-zinc-400 gap-2';
          skeleton.innerHTML = `
            <div class="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-[11px] font-bold text-zinc-500">Loading Page ${pageNum}...</span>
          `;
          canvasContainer.appendChild(skeleton);

          pageCard.appendChild(canvasContainer);
          container.appendChild(pageCard);
          pageCards.push(pageCard);
        }

        // Set up IntersectionObserver for progressive on-demand page rendering
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const card = entry.target as HTMLElement;
                const pageNum = Number(card.getAttribute('data-page-num'));
                const canvasContainer = card.querySelector('div:nth-child(2)') as HTMLElement;
                if (pageNum && canvasContainer) {
                  renderPage(pageNum, card, canvasContainer);
                  setCurrentPage(pageNum);
                }
              }
            });
          },
          {
            root: scrollContainerRef.current,
            rootMargin: '400px 0px', // Preload pages 400px before scrolling into view
            threshold: 0.05,
          }
        );
        observerRef.current = observer;

        // Observe all page shells
        pageCards.forEach((card) => observer.observe(card));

        // Immediately render initial pages (Pages 1 to Math.min(3, numPages)) sequentially with cooperative yielding
        const initialCount = Math.min(3, numPages);
        for (let i = 1; i <= initialCount; i++) {
          if (!active) break;
          const card = pageCards[i - 1];
          const canvasContainer = card.querySelector('div:nth-child(2)') as HTMLElement;
          await renderPage(i, card, canvasContainer);
          // Yield to main thread so UI stays responsive and paints immediately
          await new Promise((r) => setTimeout(r, 20));
        }
      } catch (err: any) {
        console.error('[PDFViewer] Critical preview error:', err);
        if (active) {
          setError(err.message || 'Could not render PDF pages.');
          setLoading(false);
        }
      }
    };

    loadAndRender();

    return () => {
      active = false;
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [targetUrl, pdfBlob, pdfId]);

  return (
    <div
      ref={scrollContainerRef}
      className="w-full h-full flex flex-col bg-zinc-950 overflow-y-auto momentum-scroll px-0 py-0 items-center justify-start min-h-[300px] relative"
    >
      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center my-auto py-24 text-white gap-4">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center px-4">
            <p className="text-sm font-black text-white uppercase tracking-wider">Preparing Visual Pages</p>
            <p className="text-xs text-zinc-400 mt-1">{loadingProgress}</p>
          </div>
        </div>
      )}

      {/* Error / Recovery State */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center my-auto py-16 text-center px-6 max-w-sm">
          <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 text-rose-500 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <FileText className="w-6 h-6 text-rose-500" />
          </div>
          <h5 className="text-sm font-extrabold text-zinc-200">Unable to Display Visual Pages</h5>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{error}</p>

          {rawBlob && (
            <div className="mt-6 flex flex-col gap-2.5 w-full">
              <button
                onClick={handleOpenExternal}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <ExternalLink className="w-4 h-4" />
                <span>OPEN IN PHONE PDF VIEWER</span>
              </button>
              <button
                onClick={handleShareExternal}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-extrabold text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 border border-zinc-700"
              >
                <Share2 className="w-4 h-4" />
                <span>SHARE PDF DOCUMENT</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pages Container */}
      <div ref={containerRef} className="w-full flex flex-col items-center pb-20" />

      {/* Floating Quick Page Navigator (Only when pages > 1 and loaded) */}
      {!loading && totalPages > 1 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 text-white px-3.5 py-2 rounded-full shadow-2xl flex items-center gap-3">
          <button
            onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-black tracking-wider text-zinc-200">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => scrollToPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

