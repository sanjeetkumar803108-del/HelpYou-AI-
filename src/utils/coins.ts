import { auth } from '../lib/firebase';
import { safeGetItem, safeSetItem } from './storage';

export interface Transaction {
  id: string;
  label: string;
  amount: number;
  timestamp: string;
}

// Check if user is logged in
export function isUserLoggedIn(): boolean {
  return auth.currentUser !== null;
}

// Get the specific user-bound daily limit balance
export function getCoins(uid?: string): number {
  if (isProUser()) return 999; // Pro users see high number, but UI should handle it.

  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) {
    return 0;
  }

  const userKey = `study_daily_limit_${targetUid}`;
  const storedLimit = safeGetItem(userKey);

  if (storedLimit === null) {
    // New User! Default 3 free interactions
    safeSetItem(userKey, '3');
    return 3;
  }

  return Number(storedLimit);
}

// Check if user is PRO
export function isProUser(): boolean {
  const currentUser = auth.currentUser;
  if (!currentUser) return safeGetItem('study_is_vip') === 'true';
  const isVip = safeGetItem(`study_is_vip_${currentUser.uid}`) === 'true' || safeGetItem('study_is_vip') === 'true';
  return isVip;
}

// Deduct from daily limit for a feature usage. Returns true if successful, false if insufficient.
export function deductCoins(amount: number, featureName: string): boolean {
  if (isProUser()) return true; // Pro users bypass all limits

  const currentUser = auth.currentUser;
  if (!currentUser) {
    alert("Please log in to use this feature!");
    return false;
  }

  const currentLimit = getCoins();
  if (currentLimit < 1) {
    // Dispatch event to show Paywall
    window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName, cost: 1 } }));
    return false;
  }

  const newBalance = currentLimit - 1; // Always decrement by 1 as per instructions
  const userKey = `study_daily_limit_${currentUser.uid}`;
  safeSetItem(userKey, String(newBalance));

  addCoinTransaction(`${featureName} Use`, -1, currentUser.uid);

  // Dispatch global update event to keep the UI in sync
  window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: newBalance }));
  return true;
}

// Add limits (Reward logic removed as per instructions)
export function addCoins(amount: number, label: string): void {
  // Reward logic purged. This function now does nothing to prevent "Coin Farming".
  console.log(`Blocked reward attempt: ${label} (+${amount})`);
}

// Get the user's specific transaction history
export function getCoinHistory(uid?: string): Transaction[] {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) return [];

  const historyKey = `study_coin_history_${targetUid}`;
  try {
    const stored = safeGetItem(historyKey);
    if (stored) return JSON.parse(stored);
  } catch {}

  return [];
}

// refillDailyCoins ensures free users get 3 free interactions every day
export function refillDailyCoins(): void {
  if (isProUser()) return;
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const lastRefillKey = `study_last_refill_${currentUser.uid}`;
  const today = new Date().toDateString();
  const lastRefill = safeGetItem(lastRefillKey);

  if (lastRefill !== today) {
    const userKey = `study_daily_limit_${currentUser.uid}`;
    // Reset to 3 daily
    safeSetItem(userKey, '3');
    safeSetItem(lastRefillKey, today);
    
    // Dispatch update event
    window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: 3 }));
  }
}

// Add a transaction to the history
export function addCoinTransaction(label: string, amount: number, uid?: string): void {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) return;

  const historyKey = `study_coin_history_${targetUid}`;
  const currentHistory = getCoinHistory(targetUid);

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: '2-digit' });

  const newTx: Transaction = {
    id: Math.random().toString(),
    label,
    amount,
    timestamp: `${dateStr}, ${timeStr}`
  };

  const updatedHistory = [newTx, ...currentHistory];
  safeSetItem(historyKey, JSON.stringify(updatedHistory));
  safeSetItem('study_coin_history', JSON.stringify(updatedHistory));
}
