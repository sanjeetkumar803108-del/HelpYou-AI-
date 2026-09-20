import { auth, db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { get, set, del } from 'idb-keyval';

export interface PdfHistoryItem {
  id: string;
  title: string;
  fileUri: string; // Base64 data URI, idb:// identifier, or Blob URI
  timestamp: number;
  featureTag: string; // e.g., 'Image to PDF', 'Notes Export', 'AI Content Export', 'Study Guide'
  fileSize?: string;
  pageCount?: number;
}

const STORAGE_KEY = 'helpyou_ai_pdf_history_v1';
const IDB_BLOB_PREFIX = 'helpyou_pdf_blob_';

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
 * Retrieves the full PDF binary Blob for a given history record from IndexedDB or fileUri.
 * 100% offline-ready and immune to session-based blob: URL expiration or localStorage limits.
 */
export async function getPdfDataBlob(item: { id: string; fileUri: string }): Promise<Blob | null> {
  // 1. Try reading persistent offline Blob from IndexedDB
  try {
    const idbBlob = await get(IDB_BLOB_PREFIX + item.id);
    if (idbBlob instanceof Blob) {
      return idbBlob;
    }
    if (idbBlob instanceof Uint8Array || idbBlob instanceof ArrayBuffer) {
      return new Blob([idbBlob], { type: 'application/pdf' });
    }
  } catch (err) {
    console.warn('[PDFHistory] Error reading from IndexedDB:', err);
  }

  // 2. If fileUri is a base64 data URI
  if (item.fileUri && item.fileUri.startsWith('data:')) {
    try {
      const parts = item.fileUri.split(',');
      const base64Data = parts[1] || parts[0];
      const binaryString = atob(base64Data.replace(/\s/g, ''));
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      // Cache into IndexedDB for fast subsequent access
      set(IDB_BLOB_PREFIX + item.id, blob).catch(() => {});
      return blob;
    } catch (e) {
      console.warn('[PDFHistory] Error decoding base64 fileUri:', e);
    }
  }

  // 3. If fileUri is a live blob or native/local URL
  if (item.fileUri && (item.fileUri.startsWith('blob:') || item.fileUri.startsWith('http') || item.fileUri.startsWith('capacitor:'))) {
    try {
      const response = await fetch(item.fileUri);
      if (response.ok) {
        const fetchedBlob = await response.blob();
        set(IDB_BLOB_PREFIX + item.id, fetchedBlob).catch(() => {});
        return fetchedBlob;
      }
    } catch (e) {
      console.warn('[PDFHistory] Could not fetch live fileUri (may be expired session blob):', e);
    }
  }

  return null;
}

/**
 * Automatically captures and saves a PDF record into history storage.
 * Stores metadata in localStorage and heavy binary payloads in IndexedDB.
 */
export function savePdfToHistory(item: {
  title: string;
  fileUri: string;
  featureTag: string;
  fileSize?: string;
  pageCount?: number;
}, binaryBlob?: Blob | Uint8Array): PdfHistoryItem {
  const history = getPdfHistory();
  
  // Format title neatly
  let cleanTitle = item.title.trim() || 'HelpYou_AI_Document.pdf';
  if (!cleanTitle.toLowerCase().endsWith('.pdf')) {
    cleanTitle += '.pdf';
  }

  // Check for any duplicate by title or id
  const existingIdx = history.findIndex(
    record => record.title === cleanTitle || record.fileUri === item.fileUri
  );

  let updated: PdfHistoryItem[];
  let targetRecord: PdfHistoryItem;

  if (existingIdx !== -1) {
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

  // Asynchronously store binary in IndexedDB
  if (binaryBlob) {
    const blobToStore = binaryBlob instanceof Blob ? binaryBlob : new Blob([binaryBlob], { type: 'application/pdf' });
    set(IDB_BLOB_PREFIX + targetRecord.id, blobToStore).catch(err => {
      console.warn('[PDFHistory] Error caching blob in idb:', err);
    });
  } else if (item.fileUri && item.fileUri.startsWith('data:')) {
    try {
      const parts = item.fileUri.split(',');
      const base64Data = parts[1] || parts[0];
      const binaryString = atob(base64Data.replace(/\s/g, ''));
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      set(IDB_BLOB_PREFIX + targetRecord.id, blob).catch(() => {});
    } catch (e) {}
  }

  // For very large base64 or session blob URLs, avoid bloating localStorage
  const isLargeBase64 = item.fileUri && item.fileUri.startsWith('data:') && item.fileUri.length > 250000;
  const isSessionBlob = item.fileUri && item.fileUri.startsWith('blob:');
  const safeHistory = updated.map(rec => {
    if (rec.id === targetRecord.id && (isLargeBase64 || isSessionBlob)) {
      return { ...rec, fileUri: `idb://${rec.id}` };
    }
    return rec;
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeHistory));
    window.dispatchEvent(new CustomEvent('pdf-history-updated', { detail: { record: targetRecord } }));
  } catch (err) {
    console.warn('[PDFHistory] Quota exceeded or error saving PDF history, trimming older items:', err);
    try {
      // Strip all heavy fileUris to keep metadata intact
      const leanHistory = safeHistory.slice(0, 15).map(rec => ({
        ...rec,
        fileUri: rec.fileUri.startsWith('data:') ? `idb://${rec.id}` : rec.fileUri
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leanHistory));
      window.dispatchEvent(new CustomEvent('pdf-history-updated', { detail: { record: targetRecord } }));
    } catch (e) {
      console.error('[PDFHistory] Failed to write PDF record to storage:', e);
    }
  }

  // Asynchronously synchronize with Firestore if the user is authenticated
  if (auth.currentUser) {
    addDoc(collection(db, 'pdf_history'), {
      userId: auth.currentUser.uid,
      id: targetRecord.id,
      title: targetRecord.title,
      fileUri: targetRecord.fileUri,
      timestamp: targetRecord.timestamp,
      featureTag: targetRecord.featureTag,
      fileSize: targetRecord.fileSize || null,
      pageCount: targetRecord.pageCount || null
    }).catch(err => {
      console.error('[PDFHistory] Error writing PDF history to cloud database:', err);
    });
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

  // Delete persistent binary blob from IndexedDB
  del(IDB_BLOB_PREFIX + id).catch(() => {});

  // Delete from Firestore if the user is authenticated
  if (auth.currentUser) {
    getDocs(query(collection(db, 'pdf_history'), where('userId', '==', auth.currentUser.uid), where('id', '==', id)))
      .then(snapshot => {
        snapshot.forEach(document => {
          deleteDoc(doc(db, 'pdf_history', document.id)).catch(err => {
            console.error('[PDFHistory] Error deleting PDF record from cloud:', err);
          });
        });
      })
      .catch(err => {
        console.error('[PDFHistory] Error querying cloud document for deletion:', err);
      });
  }
}

/**
 * Clears all PDF history records.
 */
export function clearPdfHistory(): void {
  const history = getPdfHistory();
  // Clear persistent binary blobs from IndexedDB
  history.forEach(item => {
    del(IDB_BLOB_PREFIX + item.id).catch(() => {});
  });

  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('pdf-history-updated', { detail: { cleared: true } }));
  } catch (err) {
    console.warn('[PDFHistory] Error clearing PDF history:', err);
  }

  // Clear from Firestore if the user is authenticated
  if (auth.currentUser) {
    getDocs(query(collection(db, 'pdf_history'), where('userId', '==', auth.currentUser.uid)))
      .then(snapshot => {
        const batch = writeBatch(db);
        snapshot.forEach(document => {
          batch.delete(doc(db, 'pdf_history', document.id));
        });
        batch.commit().catch(err => {
          console.error('[PDFHistory] Error committing cloud clear batch:', err);
        });
      })
      .catch(err => {
        console.error('[PDFHistory] Error querying cloud documents for clear:', err);
      });
  }
}
