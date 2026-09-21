import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
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

  const targetUid = uid || auth.currentUser?.uid || 'guest';
  const userKey = `study_daily_limit_${targetUid}`;
  const storedLimit = safeGetItem(userKey);

  if (storedLimit === null) {
    // New User or Guest! Default 20 free interactions
    safeSetItem(userKey, '20');
    return 20;
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

  const targetUid = auth.currentUser?.uid || 'guest';
  const currentLimit = getCoins(targetUid);
  if (currentLimit < amount) {
    // Dispatch event to show Paywall
    window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName, cost: amount } }));
    return false;
  }

  const newBalance = Math.max(0, currentLimit - amount);
  const userKey = `study_daily_limit_${targetUid}`;
  safeSetItem(userKey, String(newBalance));

  addCoinTransaction(`${featureName} Use`, -amount, targetUid);

  // Sync to Firestore asynchronously if logged in
  if (auth.currentUser) {
    setDoc(doc(db, 'users', auth.currentUser.uid), {
      coins: newBalance
    }, { merge: true }).catch((err) => {
      console.warn("[Coins Sync] Failed to sync coin deduction to Firestore:", err);
    });
  }

  // Dispatch global update event to keep the UI in sync
  window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: newBalance }));
  return true;
}

// Add coins to user balance
export function addCoins(amount: number, label: string): void {
  if (isProUser()) return;

  const targetUid = auth.currentUser?.uid || 'guest';
  const currentCoins = getCoins(targetUid);
  const newBalance = currentCoins + amount;
  const userKey = `study_daily_limit_${targetUid}`;
  safeSetItem(userKey, String(newBalance));

  addCoinTransaction(label, amount, targetUid);

  // Sync to Firestore asynchronously if logged in
  if (auth.currentUser) {
    setDoc(doc(db, 'users', auth.currentUser.uid), {
      coins: newBalance
    }, { merge: true }).catch((err) => {
      console.warn("[Coins Sync] Failed to sync coin addition to Firestore:", err);
    });
  }

  // Dispatch global update event to keep the UI in sync
  window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: newBalance }));
}

// Get the user's specific transaction history
export function getCoinHistory(uid?: string): Transaction[] {
  const targetUid = uid || auth.currentUser?.uid || 'guest';
  if (!targetUid) return [];

  const historyKey = `study_coin_history_${targetUid}`;
  try {
    const stored = safeGetItem(historyKey);
    if (stored) return JSON.parse(stored);
  } catch {}

  return [];
}

// refillDailyCoins ensures users get 20 free interactions every day
export function refillDailyCoins(): void {
  const targetUid = auth.currentUser?.uid || 'guest';
  const today = new Date().toDateString();
  const lastRefillKey = `study_last_refill_${targetUid}`;
  const lastRefillDate = safeGetItem(lastRefillKey);

  if (lastRefillDate !== today) {
    const userKey = `study_daily_limit_${targetUid}`;
    const current = Number(safeGetItem(userKey) || '0');
    if (current < 20) {
      safeSetItem(userKey, '20');
      safeSetItem(lastRefillKey, today);
      window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: 20 }));
      if (auth.currentUser) {
        setDoc(doc(db, 'users', auth.currentUser.uid), { coins: 20 }, { merge: true }).catch(() => {});
      }
    }
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
