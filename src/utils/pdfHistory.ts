export interface PdfHistoryItem {
  id: string;
  title: string;
  fileUri: string; // Base64 data URI or Blob URI
  timestamp: number;
  featureTag: string; // e.g., 'Image to PDF', 'Notes Export', 'AI Content Export', 'Study Guide'
  fileSize?: string;
  pageCount?: number;
}

const STORAGE_KEY = 'helpyou_ai_pdf_history_v1';

/**
 * Retrieves all saved PDF history records sorted by newest first.
 */
export function getPdfHistory(): PdfHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (err) {
    console.warn('[PDFHistory] Error reading PDF history:', err);
  }
  return [];
}

/**
 * Automatically captures and saves a PDF record into history storage.
 * Implements a strict duplicate prevention check (same title or same file contents).
 */
export function savePdfToHistory(item: {
  title: string;
  fileUri: string;
  featureTag: string;
  fileSize?: string;
  pageCount?: number;
}): PdfHistoryItem {
  const history = getPdfHistory();
  
  // Format title neatly
  let cleanTitle = item.title.trim() || 'HelpYou_AI_Document.pdf';
  if (!cleanTitle.toLowerCase().endsWith('.pdf')) {
    cleanTitle += '.pdf';
  }

  // Check for any duplicate by title or content URI
  const existingIdx = history.findIndex(
    record => record.title === cleanTitle || record.fileUri === item.fileUri
  );

  let updated: PdfHistoryItem[];
  let targetRecord: PdfHistoryItem;

  if (existingIdx !== -1) {
    // Duplicate found! Reuse existing record, update timestamp/size, and move to top
    const existing = history[existingIdx];
    targetRecord = {
      ...existing,
      timestamp: Date.now(),
      fileSize: item.fileSize || existing.fileSize,
      pageCount: item.pageCount || existing.pageCount,
    };
    const filtered = history.filter((_, idx) => idx !== existingIdx);
    updated = [targetRecord, ...filtered].slice(0, 30);
  } else {
    // Completely new record
    targetRecord = {
      id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: cleanTitle,
      fileUri: item.fileUri,
      timestamp: Date.now(),
      featureTag: item.featureTag || 'Generated PDF',
      fileSize: item.fileSize,
      pageCount: item.pageCount,
    };
    updated = [targetRecord, ...history].slice(0, 30);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('pdf-history-updated', { detail: { record: targetRecord } }));
  } catch (err) {
    console.warn('[PDFHistory] Quota exceeded or error saving PDF history, trimming older items:', err);
    try {
      const filtered = history.filter((_, idx) => idx !== existingIdx);
      const trimmed = [targetRecord, ...filtered.slice(0, 10)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      window.dispatchEvent(new CustomEvent('pdf-history-updated', { detail: { record: targetRecord } }));
    } catch (e) {
      console.error('[PDFHistory] Failed to write PDF record to storage:', e);
    }
  }

  return targetRecord;
}

/**
 * Removes a specific PDF record from storage by ID.
 */
export function deletePdfFromHistory(id: string): void {
  const history = getPdfHistory();
  const updated = history.filter(item => item.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('pdf-history-updated', { detail: { deletedId: id } }));
  } catch (err) {
    console.warn('[PDFHistory] Error deleting item from history:', err);
  }
}

/**
 * Clears all PDF history records.
 */
export function clearPdfHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('pdf-history-updated', { detail: { cleared: true } }));
  } catch (err) {
    console.warn('[PDFHistory] Error clearing PDF history:', err);
  }
}
