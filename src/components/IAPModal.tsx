import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, ShieldCheck, CreditCard, Crown, ChevronDown, Check, Smartphone, Wallet, Calendar, AlertCircle } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { auth } from '../lib/firebase';
import { localizedPricingMap } from './PaywallModal';

interface IAPModalProps {
  isOpen: boolean;
  onClose: () => void;
  billingCycle: 'monthly' | 'yearly';
  hasTrial: boolean;
  onResult: (success: boolean) => void;
  selectedCountry?: string;
}

type PaymentMethod = 'google_play' | 'upi' | 'credit_card';

export default function IAPModal({ isOpen, onClose, billingCycle, hasTrial, onResult, selectedCountry: propSelectedCountry }: IAPModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('google_play');
  const [showMethodSelector, setShowMethodSelector] = useState(false);
  const [authorizedAutoPay, setAuthorizedAutoPay] = useState(false);
  const [paymentSetupComplete, setPaymentSetupComplete] = useState(false);

  if (!isOpen) return null;

  const userUid = auth.currentUser?.uid;
  const selectedCountry = propSelectedCountry 
    || safeGetItem('academic_country') 
    || (userUid ? safeGetItem(`academic_country_${userUid}`) : null) 
    || 'United States';

  const pricing = localizedPricingMap[selectedCountry] || localizedPricingMap['Others / International'];
  const convertedPrice = billingCycle === 'monthly' ? pricing.monthlyDiscounted : pricing.yearlyDiscounted;
  const cycleLabel = billingCycle === 'monthly' ? 'month' : 'year';

  const paymentMethods = [
    { id: 'google_play', name: 'Google Play Balance', icon: <Smartphone className="w-5 h-5 text-green-600" /> },
    { id: 'upi', name: 'UPI (GPay / PhonePe / PayTM)', icon: <Wallet className="w-5 h-5 text-blue-600" /> },
    { id: 'credit_card', name: 'Credit Card (Visa •• 4242)', icon: <CreditCard className="w-5 h-5 text-indigo-600" /> },
  ];

  const currentMethod = paymentMethods.find(m => m.id === selectedMethod);

  // Auto-pay begins on: July 19, 2026 (based on current date July 16, 2026)
  const billingStartDate = "July 19, 2026";

  const handleConfirm = () => {
    triggerVibration(15);
    if (!paymentSetupComplete) {
      // Step 1: Link payment method
      setPaymentSetupComplete(true);
      return;
    }
    if (!authorizedAutoPay) {
      // Must authorize auto-pay first
      triggerVibration(25);
      return;
    }
    // Step 2: Finalize subscription
    onResult(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[200] flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 400 }}
          className="bg-[#FAF9F6] w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl border border-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-200 bg-white">
            <h3 className="font-extrabold text-zinc-900 text-xs uppercase tracking-wider">
              {hasTrial ? "Start Free Trial Checkout" : "Checkout"}
            </h3>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer">
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Order Summary */}
            <div className="bg-white rounded-3xl p-4 border border-zinc-200 shadow-sm">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-2">Order Summary</span>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-zinc-950 flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="font-black text-zinc-900 text-xs">HelpYou AI Pro</h4>
                    <p className="text-[9px] text-zinc-400 font-bold uppercase">
                      {billingCycle === 'monthly' ? 'Monthly Plan' : 'Yearly Plan'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-zinc-950">
                    {convertedPrice}/{cycleLabel}
                  </span>
                </div>
              </div>

              {hasTrial && (
                <div className="mt-3 pt-3 border-t border-dashed border-zinc-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-green-600 font-extrabold text-[11px]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>3-Day Free Trial Active</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 line-through font-bold mr-1.5">{convertedPrice}</span>
                    <span className="font-black text-green-600">FREE TODAY</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block px-1">
                {paymentSetupComplete ? "Payment Method Set Up" : "Setup Valid Payment Method"}
              </span>
              
              <div className="relative">
                <button
                  disabled={paymentSetupComplete}
                  onClick={() => setShowMethodSelector(!showMethodSelector)}
                  className={`w-full flex items-center justify-between p-3.5 bg-white rounded-2xl border border-zinc-200 shadow-sm transition-all ${
                    paymentSetupComplete ? 'opacity-80 bg-zinc-50' : 'hover:bg-zinc-50 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {currentMethod?.icon}
                    <span className="text-xs font-black text-zinc-800">{currentMethod?.name}</span>
                  </div>
                  {!paymentSetupComplete && (
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showMethodSelector ? 'rotate-180' : ''}`} />
                  )}
                  {paymentSetupComplete && (
                    <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase">Linked</span>
                  )}
                </button>

                <AnimatePresence>
                  {showMethodSelector && !paymentSetupComplete && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden z-20"
                    >
                      {paymentMethods.map((method) => (
                        <button
                          key={method.id}
                          onClick={() => {
                            setSelectedMethod(method.id as PaymentMethod);
                            setShowMethodSelector(false);
                            triggerVibration(10);
                          }}
                          className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-0 text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            {method.icon}
                            <span className="text-xs font-bold text-zinc-800">{method.name}</span>
                          </div>
                          {selectedMethod === method.id && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Trial & Auto-Pay Authorization Guard */}
            {paymentSetupComplete && hasTrial && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl p-4 border border-zinc-200 space-y-3 shadow-sm"
              >
                <div className="flex items-start gap-2 text-[10px] text-zinc-600 font-semibold leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-zinc-900 block mb-0.5">Auto-pay Terms & Conditions</span>
                    Your 3-day free trial will start today. You will not be charged anything now. Auto-pay is required to secure the trial. Unless cancelled, you will be automatically charged {convertedPrice}/{cycleLabel} starting on {billingStartDate}.
                  </div>
                </div>

                {/* Force Auto-Pay Switch/Checkbox */}
                <label className="flex items-center justify-between p-3 bg-zinc-50 hover:bg-zinc-100/80 rounded-xl cursor-pointer border border-zinc-100 transition-colors select-none">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={authorizedAutoPay}
                      onChange={(e) => {
                        triggerVibration(10);
                        setAuthorizedAutoPay(e.target.checked);
                      }}
                      className="w-4 h-4 text-zinc-900 border-zinc-300 rounded focus:ring-zinc-900 cursor-pointer"
                    />
                    <span className="text-[10px] font-black text-zinc-800 uppercase tracking-wide">
                      Authorize Auto-Pay Subscription
                    </span>
                  </div>
                  <span className="text-[8px] font-extrabold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Required</span>
                </label>
              </motion.div>
            )}

            {/* Sandbox Simulation Area */}
            <div className="bg-zinc-100 rounded-[2rem] p-4 border border-zinc-200">
              <span className="text-center text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-3">
                Sandbox Payment System
              </span>
              
              <div className="space-y-2">
                <button
                  onClick={handleConfirm}
                  disabled={paymentSetupComplete && hasTrial && !authorizedAutoPay}
                  className={`w-full py-3.5 text-white rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    paymentSetupComplete && hasTrial && !authorizedAutoPay
                      ? 'bg-zinc-300 shadow-none cursor-not-allowed text-zinc-500'
                      : 'bg-zinc-950 hover:bg-zinc-900 active:scale-95'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span>
                    {!paymentSetupComplete
                      ? `Confirm & Link ${currentMethod?.name}`
                      : hasTrial
                        ? "Start 3-Day Free Trial & Authorize Auto-Pay"
                        : "Confirm Payment Setup"}
                  </span>
                </button>
                
                <button
                  onClick={() => {
                    triggerVibration(20);
                    onResult(false);
                  }}
                  className="w-full py-2.5 text-zinc-500 rounded-2xl font-black text-[10px] uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-zinc-200/50 transition-all cursor-pointer"
                >
                  Simulate Gateway Error
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 font-bold px-2">
              <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
              <span>SECURE 256-BIT ENCRYPTED PLAY STORE BILLING GATEWAY</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
