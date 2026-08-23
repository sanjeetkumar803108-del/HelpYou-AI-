import { safeGetItem, safeSetItem } from './storage';
import { showToast } from './toast';
import { triggerVibration } from './vibrate';

/**
 * Universal In-App Offline Vault Utility
 * Allows saving history records securely inside the app for 100% offline access
 * without exporting files to external mobile storage.
 */

const INDEX_PREFIX = 'helpyou_offline_index_';
const ITEM_PREFIX = 'helpyou_offline_item_';

export interface OfflineVaultRecord<T = any> {
  id: string;
  feature: string;
  data: T;
  savedAt: number;
}

/**
 * Checks if a specific item is saved in the offline vault.
 */
export function isItemOffline(feature: string, id: string): boolean {
  if (!feature || !id) return false;
  try {
    const itemKey = `${ITEM_PREFIX}${feature}_${id}`;
    return !!safeGetItem(itemKey);
  } catch (_) {
    return false;
  }
}

/**
 * Retrieves all offline saved records for a given feature.
 */
export function getOfflineItems<T = any>(feature: string): T[] {
  if (!feature) return [];
  try {
    const indexKey = `${INDEX_PREFIX}${feature}`;
    const rawIndex = safeGetItem(indexKey);
    if (!rawIndex) return [];
    
    const ids: string[] = JSON.parse(rawIndex);
    if (!Array.isArray(ids)) return [];

    const items: T[] = [];
    for (const id of ids) {
      const rawItem = safeGetItem(`${ITEM_PREFIX}${feature}_${id}`);
      if (rawItem) {
        try {
          const parsed = JSON.parse(rawItem);
          items.push(parsed.data || parsed);
        } catch (_) {}
      }
    }
    return items;
  } catch (err) {
    console.warn('[OfflineVault] Error getting offline items for', feature, err);
    return [];
  }
}

/**
 * Saves a record into the offline vault.
 */
export function saveToOfflineVault<T = any>(feature: string, id: string, data: T): void {
  if (!feature || !id || !data) return;
  try {
    const itemKey = `${ITEM_PREFIX}${feature}_${id}`;
    const indexKey = `${INDEX_PREFIX}${feature}`;

    const record: OfflineVaultRecord<T> = {
      id,
      feature,
      data,
      savedAt: Date.now(),
    };

    safeSetItem(itemKey, JSON.stringify(record));

    // Update index
    const rawIndex = safeGetItem(indexKey);
    let ids: string[] = rawIndex ? JSON.parse(rawIndex) : [];
    if (!Array.isArray(ids)) ids = [];
    if (!ids.includes(id)) {
      ids.unshift(id);
      safeSetItem(indexKey, JSON.stringify(ids));
    }

    triggerVibration(15);
    showToast('📥 Saved inside app for offline access!', 'success', 3000);
    window.dispatchEvent(new CustomEvent('offline-vault-updated', { detail: { feature, id, isOffline: true } }));
  } catch (err) {
    console.error('[OfflineVault] Failed to save item to offline vault:', err);
    showToast('Could not save for offline access.', 'error');
  }
}

/**
 * Removes a record from the offline vault.
 */
export function removeFromOfflineVault(feature: string, id: string): void {
  if (!feature || !id) return;
  try {
    const itemKey = `${ITEM_PREFIX}${feature}_${id}`;
    const indexKey = `${INDEX_PREFIX}${feature}`;

    // Remove item
    try {
      localStorage.removeItem(itemKey);
    } catch (_) {}

    // Update index
    const rawIndex = safeGetItem(indexKey);
    if (rawIndex) {
      try {
        let ids: string[] = JSON.parse(rawIndex);
        if (Array.isArray(ids)) {
          ids = ids.filter(itemId => itemId !== id);
          safeSetItem(indexKey, JSON.stringify(ids));
        }
      } catch (_) {}
    }

    triggerVibration(10);
    showToast('Removed from in-app offline vault.', 'info', 2500);
    window.dispatchEvent(new CustomEvent('offline-vault-updated', { detail: { feature, id, isOffline: false } }));
  } catch (err) {
    console.error('[OfflineVault] Failed to remove item from offline vault:', err);
  }
}

/**
 * Toggles offline status for an item (one-tap save/remove).
 * Returns true if now saved offline, false if removed.
 */
export function toggleOfflineItem<T = any>(feature: string, id: string, data: T): boolean {
  if (isItemOffline(feature, id)) {
    removeFromOfflineVault(feature, id);
    return false;
  } else {
    saveToOfflineVault(feature, id, data);
    return true;
  }
}
