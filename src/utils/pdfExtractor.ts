// Client-side high-performance PDF text extraction engine
// Extracts embedded text directly on device in < 1s, preventing large multi-MB uploads,
// Vercel 4.5MB payload timeouts, and server-side PDF parser lockups.

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

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
    // 1. Try local offline script bundled in APK assets
    const script = document.createElement('script');
    script.id = 'pdfjs-extractor-script';
    script.src = './vendor/pdfjs/pdf.min.js';

    script.onload = () => {
      const lib = window.pdfjsLib || (window as any)['pdfjs-dist/build/pdf'];
      if (lib) {
        window.pdfjsLib = lib;
        try {
          lib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';
        } catch (e) {}
        resolve(lib);
      } else {
        tryAbsoluteFallback(resolve, reject);
      }
    };

    script.onerror = () => {
      tryAbsoluteFallback(resolve, reject);
    };

    document.head.appendChild(script);
  });

  return pdfjsLoadPromise;
}

function tryAbsoluteFallback(resolve: (value: any) => void, reject: (reason: any) => void) {
  const existing = document.getElementById('pdfjs-extractor-script');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.id = 'pdfjs-extractor-script-abs';
  script.src = '/vendor/pdfjs/pdf.min.js';

  script.onload = () => {
    const lib = window.pdfjsLib || (window as any)['pdfjs-dist/build/pdf'];
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
  const existing = document.getElementById('pdfjs-extractor-script-abs');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.id = 'pdfjs-extractor-cdn';
  script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js';

  script.onload = () => {
    const lib = window.pdfjsLib || (window as any)['pdfjs-dist/build/pdf'];
    if (lib) {
      window.pdfjsLib = lib;
      try {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';
      } catch (e) {}
      resolve(lib);
    } else {
      reject(new Error('PDF.js library could not be loaded'));
    }
  };

  script.onerror = () => {
    reject(new Error('Network error loading PDF reader engine'));
  };

  document.head.appendChild(script);
}

export interface ExtractedPdfResult {
  text: string;
  pageCount: number;
  isScanned: boolean;
}

/**
 * Extracts searchable text directly from a PDF File or Blob in the client browser / mobile webview.
 * @param file The PDF File or Blob
 * @param maxPages Maximum pages to process for distillation (default 50 pages to balance comprehensive coverage and speed)
 */
export async function extractTextFromPdf(file: File | Blob, maxPages = 50): Promise<ExtractedPdfResult> {
  try {
    const pdfjs = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      cMapUrl: './vendor/pdfjs/cmaps/',
      cMapPacked: true,
      stopAtErrors: false
    });

    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages || 1;
    const pagesToRead = Math.min(totalPages, maxPages);

    const pageTexts: string[] = [];
    let totalLength = 0;

    for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        let lastY: number | null = null;
        let pageStr = '';

        for (const item of textContent.items as any[]) {
          if (!item.str) continue;
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            pageStr += '\n';
          } else if (pageStr.length > 0 && !pageStr.endsWith(' ') && !pageStr.endsWith('\n')) {
            pageStr += ' ';
          }
          pageStr += item.str;
          lastY = item.transform[5];
        }

        const trimmed = pageStr.trim();
        if (trimmed) {
          pageTexts.push(`--- [PAGE ${pageNum}] ---\n${trimmed}`);
          totalLength += trimmed.length;
        }
      } catch (pageErr) {
        console.warn(`[pdfExtractor] Error reading page ${pageNum}:`, pageErr);
      }
    }

    const fullExtracted = pageTexts.join('\n\n').trim();
    const isScanned = fullExtracted.length < 50;

    return {
      text: fullExtracted,
      pageCount: totalPages,
      isScanned
    };
  } catch (err: any) {
    console.warn('[pdfExtractor] Client text extraction encountered an issue, falling back to server:', err);
    return {
      text: '',
      pageCount: 0,
      isScanned: true
    };
  }
}

