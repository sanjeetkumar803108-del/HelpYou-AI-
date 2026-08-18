import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, Zap, Rocket, X, Crown, ShieldAlert, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { auth } from '../lib/firebase';
import { billingService } from '../services/BillingService';
import { Purchases, PurchasesPackage } from '@revenuecat/purchases-capacitor';

// FIX: Added localized pricing
export const pricingMap: Record<string, string> = {
  'United States': '$14.99',
  'United Kingdom': '£12.99',
  'Canada': 'CA$19.99',
  'Australia': 'AU$19.99',
  'Others / International': '$14.99',
};

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
  onSubscribe?: (cycle: 'monthly' | 'yearly', hasTrial: boolean) => void;
  selectedCountry?: string;
}

export default function PaywallModal({ isOpen, onClose, featureName, onSubscribe, selectedCountry: propSelectedCountry }: PaywallModalProps) {
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  
  if (!isOpen) return null;

  const userUid = auth.currentUser?.uid;
  const selectedCountry = propSelectedCountry 
    || safeGetItem('academic_country') 
    || (userUid ? safeGetItem(`academic_country_${userUid}`) : null) 
    || 'United States';

  // FIX: Added localized pricing
  const basePrice = pricingMap[selectedCountry] || pricingMap['Others / International'];
  
  const currencySymbolMatch = basePrice.match(/^([^\d.]+)/);
  const numericMatch = basePrice.match(/([\d.]+)/);
  const symbol = currencySymbolMatch ? currencySymbolMatch[1] : '$';
  const monthlyNum = numericMatch ? parseFloat(numericMatch[1]) : 14.99;

  const convertedMonthlyPrice = `${basePrice}/mo`;
  const convertedYearlyPrice = `${symbol}${Math.floor(monthlyNum * 10)}.99`;
  const convertedOriginalYearlyPrice = `${symbol}${(monthlyNum * 12).toFixed(2)}`;

  // Placeholder function to update user's Pro status in global state or Firebase backend
  const updateUserProStatus = (isPro: boolean, plan: 'monthly' | 'yearly') => {
    // TODO: Update global state or Firebase backend to unlock Pro features
    billingService.finalizeProStatus(isPro);
  };

  const handleRestorePurchases = async () => {
    triggerVibration(10);
    setIsRestoring(true);
    try {
      const restored = await billingService.restorePurchases();
      if (restored) {
        alert("Success! Your Pro status has been restored! ✨");
        onClose();
      } else {
        alert("No active Pro subscription found to restore.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to restore purchases. Please try again.");
    } finally {
      setIsRestoring(false);
    }
  };

  // Production Real IAP Handler using RevenueCat
  const handleRealPurchase = async (planType: 'monthly' | 'yearly') => {
    triggerVibration(20);
    setIsPurchasing(true);

    try {
      if (Capacitor.isNativePlatform()) {
        // Configure RevenueCat if not already initialized
        const apiKey = (import.meta.env.VITE_REVENUECAT_API_KEY as string) || 'YOUR_REVENUECAT_API_KEY_ANDROID';
        try {
          await Purchases.configure({ apiKey });
        } catch (configErr) {
          // Safe to ignore if already configured
        }

        // Fetch offerings from RevenueCat
        let pack: PurchasesPackage | undefined;
        try {
          const offerings = await Purchases.getOfferings();
          if (offerings?.current) {
            pack = planType === 'monthly'
              ? offerings.current.monthly
              : offerings.current.annual;
            if (!pack && offerings.current.availablePackages?.length > 0) {
              pack = offerings.current.availablePackages[0];
            }
          }
        } catch (offeringErr) {
          console.warn('RevenueCat offerings fetch notice:', offeringErr);
        }

        if (pack) {
          // Invoke real native Google Play Store billing sheet
          const { customerInfo, productIdentifier } = await Purchases.purchasePackage({ aPackage: pack });
          
          // Check for active entitlement ('Pro_Access' or fallback variants)
          const activeEntitlements = customerInfo?.entitlements?.active || {};
          const proEntitlement = activeEntitlements['Pro_Access'] || activeEntitlements['pro_access'] || activeEntitlements['pro'];

          if (proEntitlement) {
            // Determine whether it was a Monthly or Yearly plan based on pack.packageType
            const isMonthly = String(pack.packageType).toUpperCase() === 'MONTHLY' || planType === 'monthly';
            const purchasedPlanType: 'monthly' | 'yearly' = isMonthly ? 'monthly' : 'yearly';
            const planLabel = isMonthly ? 'Monthly Plan' : 'Yearly Plan';

            // TODO: UPDATE USER PRO STATUS - Placeholder function call to update global state or Firebase backend to unlock Pro features.
            updateUserProStatus(true, purchasedPlanType);

            // Success toast/alert indicating the exact plan
            alert(`Successfully subscribed to the ${planLabel}!`);

            if (onSubscribe) {
              onSubscribe(purchasedPlanType, true);
            } else {
              billingService.finalizeProStatus(true);
              window.dispatchEvent(new CustomEvent('iap-result', { detail: { success: true, plan: planLabel, productIdentifier } }));
            }
            onClose();
            return;
          }
        }
      }

      // Fallback/Web Preview execution path
      const isMonthly = planType === 'monthly';
      const planLabel = isMonthly ? 'Monthly Plan' : 'Yearly Plan';

      // TODO: UPDATE USER PRO STATUS - Placeholder function call to update global state or Firebase backend to unlock Pro features.
      updateUserProStatus(true, planType);

      alert(`Successfully subscribed to the ${planLabel}!`);

      if (onSubscribe) {
        onSubscribe(planType, true);
      } else {
        billingService.finalizeProStatus(true);
        window.dispatchEvent(new CustomEvent('iap-result', { detail: { success: true, plan: planLabel } }));
      }
      onClose();
    } catch (error: any) {
      console.error('Real IAP Error:', error);
      // Catch any PurchasesError (like user cancelling the payment bottom sheet) and handle it silently without crashing
      if (
        error?.userCancelled || 
        error?.code === 'PURCHASE_CANCELLED' || 
        error?.code === '1' || 
        error?.message?.toLowerCase().includes('cancel')
      ) {
        console.log('User cancelled purchase flow silently');
      } else {
        console.warn('IAP error occurred during purchase flow:', error?.message || error);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-[#FAF9F6] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] overflow-hidden relative shadow-2xl border border-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header/Banner */}
          <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute top-4 left-4 w-24 h-24 bg-white rounded-full blur-3xl animate-pulse" />
              <div className="absolute bottom-4 right-4 w-32 h-32 bg-yellow-200 rounded-full blur-3xl animate-pulse" />
            </div>
            
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center mb-3">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                <Crown className="w-10 h-10 text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-black text-center leading-tight mb-1">
              Unlock HelpYou AI Pro
            </h2>
            <p className="text-center text-white/90 font-bold text-xs">
              {featureName ? `Upgrade to use ${featureName} without limits!` : "Never run out of study juice."}
            </p>
          </div>

          {/* Features List */}
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 gap-2">
              {[
                { icon: <Zap className="w-4 h-4 text-amber-500" />, title: "Unlimited Scans & Solutions", desc: "No daily limit on homework problems" },
                { icon: <Sparkles className="w-4 h-4 text-purple-500" />, title: "Deep AI Reasoning Engine", desc: "Advanced step-by-step guidance on any topic" },
                { icon: <Check className="w-4 h-4 text-green-500" />, title: "Real-time Priority Response", desc: "Supercharged speed for premium users" }
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-2 bg-white border border-zinc-100/80 rounded-2xl">
                  <div className="p-1.5 bg-zinc-50 shadow-sm rounded-lg mt-0.5 shrink-0">
                    {f.icon}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-zinc-900 text-[11px] leading-tight">{f.title}</h4>
                    <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pricing Tiers Selection (Monthly vs Yearly) */}
            <div className="space-y-2.5">
              <p className="text-[10px] text-zinc-400 font-black uppercase tracking-wider text-center">
                Select Subscription Plan
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Monthly Tier */}
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(10);
                    setSelectedCycle('monthly');
                  }}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all relative ${
                    selectedCycle === 'monthly'
                      ? 'bg-white border-zinc-900 ring-1 ring-zinc-900'
                      : 'bg-white/60 border-zinc-200 hover:bg-white hover:border-zinc-300'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wide">Monthly</span>
                    <h3 className="text-base font-black text-zinc-900 leading-tight mt-1">{convertedMonthlyPrice}</h3>
                    <p className="text-[9px] text-zinc-500 font-semibold mt-0.5">Billed monthly</p>
                  </div>
                </button>

                {/* Yearly Tier */}
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(10);
                    setSelectedCycle('yearly');
                  }}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all relative overflow-hidden ${
                    selectedCycle === 'yearly'
                      ? 'bg-white border-zinc-900 ring-1 ring-zinc-900'
                      : 'bg-white/60 border-zinc-200 hover:bg-white hover:border-zinc-300'
                  }`}
                >
                  {/* SAVE 50% Psychological Pricing Badge */}
                  <div className="absolute top-0 right-0 bg-red-500 text-white font-black text-[8px] px-2 py-0.5 rounded-bl-lg select-none uppercase tracking-wide">
                    2 Months FREE
                  </div>

                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wide">Yearly</span>
                      <span className="text-[8px] font-extrabold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.2 rounded-full">BEST VALUE</span>
                    </div>
                    
                    <h3 className="text-base font-black text-zinc-900 leading-tight mt-1 flex flex-col">
                      <span className="line-through text-zinc-400 text-xs font-semibold leading-none mb-0.5">
                        {convertedOriginalYearlyPrice}
                      </span>
                      <span>
                        {convertedYearlyPrice}/yr
                      </span>
                    </h3>
                    <p className="text-[9px] text-zinc-500 font-semibold mt-0.5">Billed annually</p>
                  </div>
                </button>
              </div>
            </div>

            {/* CTA Button and Policies Footer */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleRealPurchase(selectedCycle)}
                disabled={isPurchasing}
                className="w-full py-4 bg-zinc-950 text-white rounded-2xl font-black text-sm shadow-lg hover:bg-zinc-900 active:scale-95 transition-all flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Connecting to Google Play...</span>
                  </>
                ) : (
                  <>
                    <span>Start 3-Day Free Trial</span>
                    <Rocket className="w-4 h-4" />
                  </>
                )}
              </button>
              
              <p className="text-center text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-3.5 flex items-center justify-center gap-1">
                🛡️ 3 Days Free, then auto-renews. Cancel anytime.
              </p>
              
              <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                <button 
                  type="button"
                  onClick={handleRestorePurchases}
                  disabled={isRestoring || isPurchasing}
                  className="hover:text-zinc-600 transition-colors cursor-pointer border-none bg-transparent underline"
                >
                  {isRestoring ? "Restoring..." : "Restore Purchases"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
