import { triggerVibration } from '../utils/vibrate';
import { safeSetItem, safeGetItem } from '../utils/storage';
import { auth } from '../lib/firebase';

/**
 * BillingService (Mock Implementation)
 * This service handles In-App Purchase logic.
 * In a production app, this would integrate with Google Play Billing or RevenueCat.
 */
class BillingService {
  private static instance: BillingService;
  
  private constructor() {}

  public static getInstance(): BillingService {
    if (!BillingService.instance) {
      BillingService.instance = new BillingService();
    }
    return BillingService.instance;
  }

  /**
   * Mock purchase flow for PRO subscription
   */
  public async purchasePro(cycle: 'monthly' | 'yearly' = 'yearly', hasTrial: boolean = true): Promise<boolean> {
    // In production, you would call:
    // await RNIap.requestSubscription('helpyouai_pro_monthly');
    
    // For now, we return true/false based on user interaction in the IAP Modal
    // This method is called by the UI to initiate the process
    return new Promise((resolve) => {
      // Logic for the modal will handle the resolve
      // We'll use custom events to communicate between the service and the IAP Modal component
      const handlePurchaseResult = (e: any) => {
        window.removeEventListener('iap-result', handlePurchaseResult);
        resolve(e.detail.success);
      };
      window.addEventListener('iap-result', handlePurchaseResult);
      
      // Trigger the IAP Modal UI
      window.dispatchEvent(new CustomEvent('open-iap-modal', { detail: { cycle, hasTrial } }));
    });
  }

  /**
   * Marks the user as PRO in local storage and dispatches update events
   */
  public finalizeProStatus(success: boolean): void {
    if (success) {
      const currentUser = auth.currentUser;
      safeSetItem('study_is_vip', 'true');
      if (currentUser) {
        safeSetItem(`study_is_vip_${currentUser.uid}`, 'true');

        // Sync subscription with backend database
        fetch('/api/set-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: currentUser.uid,
            isPro: true
          })
        })
        .then(res => res.json())
        .then(data => console.log('Successfully synced subscription to backend:', data))
        .catch(err => console.error('Failed to sync subscription with backend:', err));
      }
      
      // Notify the app that the user is now VIP/PRO
      window.dispatchEvent(new CustomEvent('study-vip-updated', { detail: true }));
    }
  }
}

export const billingService = BillingService.getInstance();
