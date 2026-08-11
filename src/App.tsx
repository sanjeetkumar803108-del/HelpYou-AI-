/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, ReactNode, useEffect, lazy, Suspense, useCallback } from 'react';
import { LayoutDashboard, Camera, BookOpen, Headphones, UserCircle, Sparkles, Home, Moon, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import LockedFeature from './components/LockedFeature';
import AdvancedLoader from './components/AdvancedLoader';
import { billingService } from './services/BillingService';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { triggerVibration } from './utils/vibrate';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { safeGetItem, safeSetItem, safeClearAll } from './utils/storage';
import { refillDailyCoins } from './utils/coins';

import confetti from 'canvas-confetti';

function retryImport<T>(fn: () => Promise<T>, retriesLeft = 3, interval = 1000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn()
      .then(resolve)
      .catch((error) => {
        if (retriesLeft === 0) {
          console.warn("Chunk load failed after retries, force reloading to get fresh assets:", error);
          window.location.reload();
          return reject(error);
        }
        setTimeout(() => {
          retryImport(fn, retriesLeft - 1, interval).then(resolve, reject);
        }, interval);
      });
  });
}

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(() => retryImport(factory));
}

const ToolsDashboard = lazyWithRetry(() => import('./components/ToolsDashboard'));
const ImageToPDF = lazyWithRetry(() => import('./components/ImageToPDF'));
const PdfHistoryScreen = lazyWithRetry(() => import('./components/PdfHistoryScreen'));
const MagicScanner = lazyWithRetry(() => import('./components/MagicScanner'));
const NoteMaker = lazyWithRetry(() => import('./components/NoteMaker'));
const EssayGrader = lazyWithRetry(() => import('./components/EssayGrader'));
const FlashcardGenerator = lazyWithRetry(() => import('./components/FlashcardGenerator'));
const ContentGenerator = lazyWithRetry(() => import('./components/ContentGenerator'));
const GrammarEnhancer = lazyWithRetry(() => import('./components/GrammarEnhancer'));
const Summariser = lazyWithRetry(() => import('./components/Summariser'));
const CallWithTutor = lazyWithRetry(() => import('./components/CallWithTutor'));
const Calculator = lazyWithRetry(() => import('./components/Calculator'));
const VIPPass = lazyWithRetry(() => import('./components/VIPPass'));
const AcademicSetup = lazyWithRetry(() => import('./components/AcademicSetup'));
const Login = lazyWithRetry(() => import('./components/Login'));
const Profile = lazyWithRetry(() => import('./components/Profile'));
const StreakDetailsPage = lazyWithRetry(() => import('./components/StreakDetailsPage'));
const AITutor = lazyWithRetry(() => import('./components/AITutor'));
const QuizGenerator = lazyWithRetry(() => import('./components/QuizGenerator'));
const QuestionGenerator = lazyWithRetry(() => import('./components/QuestionGenerator'));
const TestPrep = lazyWithRetry(() => import('./components/TestPrep'));
const CoinPage = lazyWithRetry(() => import('./components/CoinPage'));
const DailyTrivia = lazyWithRetry(() => import('./components/DailyTrivia'));
const LiveTutorSearch = lazyWithRetry(() => import('./components/LiveTutorSearch'));
const MistakeVault = lazyWithRetry(() => import('./components/MistakeVault'));
const PaywallModal = lazyWithRetry(() => import('./components/PaywallModal'));
// Cleaned up fake sandbox modal import
// const IAPModal = lazyWithRetry(() => import('./components/IAPModal'));
const Onboarding = lazyWithRetry(() => import('./components/Onboarding'));
import SplashScreen from './components/SplashScreen';
import AuthGuard from './components/AuthGuard';
import ErrorBoundary from './components/ErrorBoundary';
import { setupDailyLocalNotifications } from './utils/notifications';

function WidgetSkeleton() {
  return (
    <div className="w-full h-full min-h-[300px] bg-white border border-zinc-150 p-6 rounded-[2rem] flex flex-col gap-4 animate-pulse">
      <div className="h-6 w-1/3 bg-zinc-200 rounded-lg" />
      <div className="h-12 w-full bg-zinc-200 rounded-xl" />
      <div className="space-y-2.5">
        <div className="h-4 w-full bg-zinc-150 rounded" />
        <div className="h-4 w-5/6 bg-zinc-150 rounded" />
        <div className="h-4 w-2/3 bg-zinc-150 rounded" />
      </div>
    </div>
  );
}

function FullPageSkeleton() {
  return (
    <div className="w-full h-full min-h-[500px] flex items-center justify-center p-6 bg-[#FAF9F6]">
      <AdvancedLoader type="orb" context="dashboard" />
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState('notes');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Initialize RevenueCat for In-App Purchases
  useEffect(() => {
    // TODO: SETUP - Replace 'YOUR_REVENUECAT_API_KEY_ANDROID' with your real public API key from the RevenueCat dashboard before launching.
    if (Capacitor.isNativePlatform()) {
      try {
        Purchases.configure({ apiKey: 'YOUR_REVENUECAT_API_KEY_ANDROID' });
      } catch (e) {
        console.warn('RevenueCat configuration notice:', e);
      }
    }
  }, []);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pocketItems, setPocketItems] = useState<any[]>(() => {
    const lastUser = safeGetItem('last_logged_in_user');
    const cached = lastUser ? safeGetItem(`stale_pocket_items_${lastUser}`) : null;
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  const [isVip, setIsVip] = useState(() => {
    const lastUser = safeGetItem('last_logged_in_user');
    if (lastUser) {
      const cachedVip = safeGetItem(`study_is_vip_${lastUser}`);
      if (cachedVip !== null) return cachedVip === 'true';
    }
    return safeGetItem('study_is_vip') === 'true';
  });
  const isProUser = isVip; // Alias for consistency with new requirements
  const [showVipModal, setShowVipModal] = useState(false);
  const [showAcademicSetup, setShowAcademicSetup] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [showIapModal, setShowIapModal] = useState(false);
  const [iapCycle, setIapCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [iapHasTrial, setIapHasTrial] = useState(true);
  const [paywallFeature, setPaywallFeature] = useState<string | undefined>(undefined);
  const [mobileToast, setMobileToast] = useState<string | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return safeGetItem('study_dark_mode') === 'true';
  });

  const toggleDarkMode = () => {
    const newVal = !isDarkMode;
    setIsDarkMode(newVal);
    safeSetItem('study_dark_mode', String(newVal));
  };

  const handleSetIsVip = (val: boolean) => {
    setIsVip(val);
    safeSetItem('study_is_vip', String(val));
    if (user) {
      safeSetItem(`study_is_vip_${user.uid}`, String(val));
    }
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#F59E0B', '#EF4444', '#10B981', '#3B82F6']
    });
  };

  useEffect(() => {
    const handleOpenVip = () => {
      console.log('Received open-vip-modal event');
      setPaywallFeature("PRO Benefits");
      setShowPaywallModal(true);
    };
    const handleOpenLogin = () => {
      console.log('Received open-login-modal event');
      setShowLoginModal(true);
    };
    const handleOpenProfile = () => {
      console.log('Received open-profile-modal event');
      setActiveTab('profile');
    };
    const handleShowMobileToast = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.message) {
        setMobileToast(customEvent.detail.message);
        triggerVibration(15);
        setTimeout(() => {
          setMobileToast(null);
        }, 4000);
      }
    };
    const handleOpenPaywall = (e: Event) => {
      const customEvent = e as CustomEvent;
      setPaywallFeature(customEvent.detail?.featureName);
      setShowPaywallModal(true);
    };
    const handleOpenIap = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setIapCycle(customEvent.detail.cycle || 'yearly');
        setIapHasTrial(customEvent.detail.hasTrial !== false);
      }
      setShowIapModal(true);
    };
    const handleVipUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsVip(customEvent.detail === true);
    };

    window.addEventListener('open-vip-modal', handleOpenVip);
    window.addEventListener('open-login-modal', handleOpenLogin);
    window.addEventListener('open-profile-modal', handleOpenProfile);
    window.addEventListener('show-mobile-toast', handleShowMobileToast);
    window.addEventListener('open-paywall-modal', handleOpenPaywall);
    window.addEventListener('open-iap-modal', handleOpenIap);
    window.addEventListener('study-vip-updated', handleVipUpdated);
    return () => {
      window.removeEventListener('open-vip-modal', handleOpenVip);
      window.removeEventListener('open-login-modal', handleOpenLogin);
      window.removeEventListener('open-profile-modal', handleOpenProfile);
      window.removeEventListener('show-mobile-toast', handleShowMobileToast);
      window.removeEventListener('open-paywall-modal', handleOpenPaywall);
      window.removeEventListener('open-iap-modal', handleOpenIap);
      window.removeEventListener('study-vip-updated', handleVipUpdated);
    };
  }, []);

  useEffect(() => {
    if (mobileToast) {
      const timer = setTimeout(() => {
        setMobileToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [mobileToast]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        refillDailyCoins();
        
        // Dynamic configuration & login to prevent subscription aliasing/wrong email issue
        if (Capacitor.isNativePlatform()) {
          const apiKey = (import.meta.env.VITE_REVENUECAT_API_KEY as string) || 'YOUR_REVENUECAT_API_KEY_ANDROID';
          Purchases.configure({ apiKey, appUserID: currentUser.uid })
            .then(() => {
              Purchases.logIn({ appUserID: currentUser.uid }).catch(err => {
                console.warn('RevenueCat logIn error on auth state change:', err);
              });
            })
            .catch(err => {
              console.warn('RevenueCat configure error on auth state change:', err);
            });
        }
        
        // 1. Initially set to specific user cached state or false (prevent leak from other sessions)
        const cachedUserVip = safeGetItem(`study_is_vip_${currentUser.uid}`) === 'true';
        setIsVip(cachedUserVip);
        
        // 2. Fresh Fetch on Login: Try Firestore first to ensure high consistency with user profile
        const fetchPromise = (async () => {
          try {
            const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              const hasCompletedSetup = 
                userData?.isOnboardingComplete === true ||
                userData?.isOnboardingCompleted === true ||
                Boolean(userData?.grade || userData?.stream || userData?.country) ||
                Boolean(userData?.academic_grade || userData?.academic_stream || userData?.academic_country) ||
                safeGetItem(`academic_setup_completed_${currentUser.uid}`) === 'true' ||
                safeGetItem(`isOnboardingComplete_${currentUser.uid}`) === 'true';

              if (hasCompletedSetup) {
                // Returning User: bypass onboarding completely and go directly to MainApp / HomeTabs
                safeSetItem(`onboarding_completed_${currentUser.uid}`, 'true');
                safeSetItem(`academic_setup_completed_${currentUser.uid}`, 'true');
                safeSetItem(`isOnboardingComplete_${currentUser.uid}`, 'true');
                setShowOnboarding(false);
                setShowAcademicSetup(false);
              } else {
                // Existing user doc, but onboarding incomplete
                const userOnboardingCompleted = safeGetItem(`onboarding_completed_${currentUser.uid}`) === 'true';
                if (!userOnboardingCompleted) {
                  setShowOnboarding(true);
                  setShowAcademicSetup(false);
                } else {
                  setShowOnboarding(false);
                  setShowAcademicSetup(true);
                }
              }

              if (userData) {
                if (typeof userData.isPro === 'boolean') {
                  setIsVip(userData.isPro);
                  safeSetItem('study_is_vip', String(userData.isPro));
                  safeSetItem(`study_is_vip_${currentUser.uid}`, String(userData.isPro));
                  console.log(`[Auth Check] Verified specific subscription status from Firestore: ${userData.isPro}`);
                }
                if (typeof userData.coins === 'number') {
                  const userKey = `study_daily_limit_${currentUser.uid}`;
                  safeSetItem(userKey, String(userData.coins));
                  window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: userData.coins }));
                  console.log(`[Auth Check] Synced coins from Firestore: ${userData.coins}`);
                } else {
                  const emailKey = (currentUser.email || '').toLowerCase();
                  let initialCoins = 20;
                  if (emailKey) {
                    const emailDocRef = doc(db, 'allocated_emails', emailKey);
                    const emailDocSnap = await getDoc(emailDocRef);
                    if (emailDocSnap.exists()) {
                      initialCoins = 0;
                      console.log(`[Coins Check] Email ${currentUser.email} already has allocated coins. Setting to 0.`);
                    } else {
                      await setDoc(emailDocRef, {
                        allocated: true,
                        allocatedAt: new Date().toISOString(),
                        userId: currentUser.uid
                      });
                      console.log(`[Coins Check] Email ${currentUser.email} is new. Allocating 20 free coins.`);
                    }
                  }
                  const userKey = `study_daily_limit_${currentUser.uid}`;
                  safeSetItem(userKey, String(initialCoins));
                  window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: initialCoins }));
                  await setDoc(doc(db, 'users', currentUser.uid), { coins: initialCoins }, { merge: true });
                }
                return;
              }
            } else {
              // Completely new user! Show onboarding first.
              setShowOnboarding(true);
              setShowAcademicSetup(false);

              // User document does not exist yet! Check lifetime allocated_emails first
              const emailKey = (currentUser.email || '').toLowerCase();
              let initialCoins = 20;
              if (emailKey) {
                const emailDocRef = doc(db, 'allocated_emails', emailKey);
                const emailDocSnap = await getDoc(emailDocRef);
                if (emailDocSnap.exists()) {
                  initialCoins = 0;
                  console.log(`[Coins Check] Email ${currentUser.email} already has allocated coins. Setting new doc to 0.`);
                } else {
                  await setDoc(emailDocRef, {
                    allocated: true,
                    allocatedAt: new Date().toISOString(),
                    userId: currentUser.uid
                  });
                  console.log(`[Coins Check] Email ${currentUser.email} is new. Allocating 20 free coins in new doc.`);
                }
              }
              const userKey = `study_daily_limit_${currentUser.uid}`;
              safeSetItem(userKey, String(initialCoins));
              window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: initialCoins }));
              
              await setDoc(doc(db, 'users', currentUser.uid), {
                userId: currentUser.uid,
                email: currentUser.email || '',
                coins: initialCoins,
                isPro: false,
                createdAt: new Date().toISOString()
              });
              console.log(`[Auth Check] Initialized new user document in Firestore with ${initialCoins} coins`);
            }
          } catch (fsErr) {
            console.warn('[Auth Check] Firestore fetch failed, falling back to REST/Cache:', fsErr);
            // Fallback onboarding checks
            const userOnboardingCompleted = safeGetItem(`onboarding_completed_${currentUser.uid}`) === 'true';
            const academicSetupCompleted = safeGetItem(`academic_setup_completed_${currentUser.uid}`) === 'true';
            if (!userOnboardingCompleted) {
              setShowOnboarding(true);
            } else if (!academicSetupCompleted) {
              setShowAcademicSetup(true);
            }
          }

          // Fallback to REST API
          try {
            const res = await fetch('/api/verify-subscription', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ userId: currentUser.uid })
            });
            if (res.ok) {
              const data = await res.json();
              if (data && typeof data.isPro === 'boolean') {
                setIsVip(data.isPro);
                safeSetItem('study_is_vip', String(data.isPro));
                safeSetItem(`study_is_vip_${currentUser.uid}`, String(data.isPro));
                console.log(`[Auth Check] Verified specific subscription status from backend: ${data.isPro}`);
                return;
              }
            }
          } catch (err) {
            console.warn('[Auth Check] Subscription check endpoint offline, using local cached status:', err);
          }

          // Fallback only to this specific logged-in user's cached value, never a different account
          const verifiedVal = safeGetItem(`study_is_vip_${currentUser.uid}`) === 'true';
          setIsVip(verifiedVal);
          safeSetItem('study_is_vip', String(verifiedVal));
        })();

        // 2000ms max wait time to prevent loading screens under flaky network
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000));

        Promise.race([fetchPromise, timeoutPromise])
          .finally(() => {
            setAuthLoading(false);
          });
      } else {
        // Guest user state: reset VIP without wiping guest storage
        setIsVip(false);
        setAuthLoading(false);
        
        // Log out from RevenueCat
        if (Capacitor.isNativePlatform()) {
          Purchases.logOut().catch(err => {
            console.warn('RevenueCat logOut error on logout:', err);
          });
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      if (!authLoading) {
        setPocketItems([]);
      }
      return;
    }
    safeSetItem('last_logged_in_user', user.uid);
    setupDailyLocalNotifications();
    const cached = safeGetItem(`stale_pocket_items_${user.uid}`);
    if (cached) {
      try {
        setPocketItems(JSON.parse(cached));
      } catch (e) {}
    }
    const q = query(
      collection(db, 'pocket_items'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeItems = onSnapshot(q, {
      next: (snapshot) => {
        try {
          const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          if (Array.isArray(fetched)) {
            if (fetched.length === 0) {
              const cachedStr = safeGetItem(`stale_pocket_items_${user.uid}`);
              if (cachedStr) {
                try {
                  const parsed = JSON.parse(cachedStr);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    setPocketItems(parsed);
                    return;
                  }
                } catch (_) {}
              }
            }
            setPocketItems(fetched);
            safeSetItem(`stale_pocket_items_${user.uid}`, JSON.stringify(fetched));
          }
        } catch (e) {
          console.error("Error processing pocket_items snapshot:", e);
        }
      },
      error: (err) => {
        console.warn("pocket_items onSnapshot error (retaining cache fallback):", err);
        const cachedStr = safeGetItem(`stale_pocket_items_${user.uid}`);
        if (cachedStr) {
          try {
            const parsed = JSON.parse(cachedStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPocketItems(parsed);
            }
          } catch (_) {}
        }
      }
    });
    return () => unsubscribeItems();
  }, [user, authLoading]);

  // Native back button navigation handler
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleBackButton = async () => {
      const backEvent = new CustomEvent('appBackButton', { cancelable: true });
      const wasCanceled = !window.dispatchEvent(backEvent);
      if (wasCanceled) {
        return;
      }

      if (showLoginModal) {
        setShowLoginModal(false);
        return;
      }
      if (showProfileModal) {
        setShowProfileModal(false);
        return;
      }
      if (showVipModal) {
        setShowVipModal(false);
        return;
      }
      if (showPaywallModal) {
        setShowPaywallModal(false);
        return;
      }
      if (showIapModal) {
        setShowIapModal(false);
        return;
      }
      if (showAcademicSetup) {
        return;
      }

      if (activeTool !== null) {
        setActiveTool(null);
        return;
      }

      if (activeTab !== 'notes') {
        setActiveTab('notes');
        return;
      }

      CapApp.minimizeApp();
    };

    const backButtonListener = CapApp.addListener('backButton', () => {
      handleBackButton();
    });

    return () => {
      backButtonListener.then(l => l.remove());
    };
  }, [activeTool, activeTab, showLoginModal, showProfileModal, showVipModal, showPaywallModal, showIapModal, showAcademicSetup]);

  const handleOpenVipFromDashboard = useCallback(() => {
    setShowVipModal(true);
  }, []);

  const handleOpenProfileFromDashboard = useCallback(() => {
    setActiveTab('profile');
  }, []);

  const handleOpenLoginFromDashboard = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const handleSelectToolFromDashboard = useCallback((tool: string) => {
    if (tool === 'tab:scanner') {
      setActiveTab('scanner');
    } else if (tool === 'tab:aitutor') {
      setActiveTab('aitutor');
    } else {
      setActiveTool(tool);
    }
  }, []);

  return (
    <AuthGuard
      user={user}
      authLoading={authLoading}
      showSplash={showSplash}
      showOnboarding={showOnboarding}
      showAcademicSetup={showAcademicSetup}
      isDarkMode={isDarkMode}
      setShowOnboarding={setShowOnboarding}
      setShowAcademicSetup={setShowAcademicSetup}
      fallbackSkeleton={<FullPageSkeleton />}
    >
      <div className={`w-full flex flex-col h-[100dvh] max-w-md mx-auto ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100 sm:border-zinc-800' : 'bg-[#FAF9F6] text-zinc-900 sm:border-zinc-200'} font-sans overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.15)] sm:rounded-[2rem] sm:h-[90vh] sm:mt-[5vh] sm:border relative`}>
      {activeTab !== 'scanner' && activeTab !== 'aitutor' && activeTab !== 'notes' && activeTab !== 'profile' && activeTool === null && (
        <header className="px-6 py-5 bg-white border-b border-zinc-200/60 z-10 flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">HelpYou AI</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                triggerVibration(10);
                toggleDarkMode();
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition-colors shadow-sm border border-zinc-200/40"
              title={isDarkMode ? "Light Mode" : "Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => {
                triggerVibration(15);
                setActiveTab('profile');
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition-colors shadow-sm border border-zinc-200/40"
            >
              {user ? (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  {user.email?.[0].toUpperCase() || 'U'}
                </div>
              ) : (
                <UserCircle className="w-6 h-6" />
              )}
            </button>
          </div>
        </header>
      )}
      
      <main className={`w-full max-w-md mx-auto flex-1 min-h-0 relative z-0 ${(activeTab === 'scanner' || activeTab === 'aitutor' || activeTab === 'teacher' || activeTool !== null) ? 'overflow-hidden flex flex-col h-full' : 'overflow-y-auto pb-20'} bg-[#FAF9F6]`}>
        {/* Scanner Tab */}
        <div className={activeTab === 'scanner' ? 'h-full flex flex-col' : 'hidden'}>
          <Suspense fallback={<FullPageSkeleton />}>
            <MagicScanner isVip={isVip} isFocused={activeTab === 'scanner'} onNavigateToTab={(tab) => {
              setActiveTab(tab);
              setActiveTool(null);
            }} />
          </Suspense>
        </div>

        {/* AI Tutor Tab */}
        <div className={activeTab === 'aitutor' ? 'h-full flex flex-col' : 'hidden'}>
          <Suspense fallback={<FullPageSkeleton />}>
            <AITutor isVip={isVip} />
          </Suspense>
        </div>

        {/* Home/Notes Tab */}
        <div className={activeTab === 'notes' ? 'h-full flex flex-col' : 'hidden'}>
          <div className={activeTool === null ? "h-full flex flex-col" : "hidden"}>
            <Suspense fallback={<FullPageSkeleton />}>
              <ToolsDashboard 
                isVip={isVip} 
                user={user}
                pocketItems={pocketItems}
                onOpenVip={handleOpenVipFromDashboard}
                onOpenProfile={handleOpenProfileFromDashboard}
                onOpenLogin={handleOpenLoginFromDashboard}
                onSelectTool={handleSelectToolFromDashboard} 
                activeTab={activeTab}
              />
            </Suspense>
          </div>
          {/* Active Tool Rendering */}
          <Suspense fallback={<FullPageSkeleton />}>
            {activeTool === 'notemaker' && (
              <LockedFeature cost={5} featureName="AI Audio Summary" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <NoteMaker onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'essaygrader' && (
              <LockedFeature cost={1} featureName="AI Essay Grader" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <EssayGrader onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'testprep' && (
              <LockedFeature cost={2} featureName="Test Prep Hub" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <TestPrep onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'image2pdf' && (
              <ImageToPDF 
                onBack={() => setActiveTool(null)} 
                onOpenHistory={() => setActiveTool('pdfhistory')} 
              />
            )}
            {activeTool === 'pdfhistory' && (
              <PdfHistoryScreen 
                onBack={() => setActiveTool('image2pdf')} 
                onOpenImageToPdf={() => setActiveTool('image2pdf')}
              />
            )}
            {activeTool === 'contentgenerator' && (
              <LockedFeature cost={1} featureName="AI Study Content Generator" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <ContentGenerator onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'grammar' && (
              <LockedFeature cost={1} featureName="AI Grammar Enhancer" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <GrammarEnhancer onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'summariser' && (
              <LockedFeature cost={1} featureName="AI Text Summarizer" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <Summariser onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'callwithtutor' && <CallWithTutor onBack={() => setActiveTool(null)} />}
            {activeTool === 'calculator' && (
              <Calculator 
                onBack={() => setActiveTool(null)} 
                onNavigateToTab={(tab) => {
                  setActiveTab(tab);
                  setActiveTool(null);
                }} 
              />
            )}
            {activeTool === 'questiongenerator' && (
              <LockedFeature cost={2} featureName="AI Question Generator" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <QuestionGenerator 
                  onBack={() => setActiveTool(null)} 
                  onNavigateToTab={(tab) => {
                    setActiveTab(tab);
                    setActiveTool(null);
                  }}
                />
              </LockedFeature>
            )}
            {activeTool === 'dailytrivia' && <DailyTrivia onBack={() => setActiveTool(null)} />}
            {activeTool === 'livetutorsearch' && <LiveTutorSearch onBack={() => setActiveTool(null)} />}
            {activeTool === 'mistakevault' && <MistakeVault onBack={() => setActiveTool(null)} />}
            {activeTool === 'coinpage' && (
              <CoinPage 
                isVip={isVip}
                onClose={() => setActiveTool(null)} 
                onSelectTool={(tool) => {
                  if (tool === 'tab:scanner') {
                    setActiveTab('scanner');
                    setActiveTool(null);
                  } else if (tool === 'tab:aitutor') {
                    setActiveTab('aitutor');
                    setActiveTool(null);
                  } else {
                    setActiveTool(tool);
                  }
                }} 
              />
            )}
            {activeTool === 'streakpage' && (
              <StreakDetailsPage onBack={() => setActiveTool(null)} />
            )}
          </Suspense>
        </div>

        {/* Profile Tab */}
        <div className={activeTab === 'profile' ? 'h-full flex flex-col' : 'hidden'}>
          <Suspense fallback={<FullPageSkeleton />}>
            <Profile 
              user={user}
              isVip={isVip}
              setIsVip={handleSetIsVip}
              onClose={() => setActiveTab('notes')} 
              isDarkMode={isDarkMode}
              onToggleDarkMode={toggleDarkMode}
              isTabMode={true}
              onOpenLogin={() => setShowLoginModal(true)}
              onNavigateToCoinPage={() => {
                setActiveTab('notes');
                setActiveTool('coinpage');
              }}
              onNavigateToStreakPage={() => {
                setActiveTab('notes');
                setActiveTool('streakpage');
              }}
              onOpenPdfHistory={() => {
                setActiveTab('notes');
                setActiveTool('pdfhistory');
              }}
            />
          </Suspense>
        </div>
      </main>

      {activeTool === null && (
        <nav className="absolute bottom-0 w-full border-t pb-safe z-20 transition-all duration-300 bg-white/90 border-zinc-200/60 backdrop-blur-2xl">
          <div className="flex justify-around items-center px-2 py-0.5">
            <NavItem 
              icon={<Home className="w-5 h-5" />} 
              label="Home" 
              isActive={activeTab === 'notes'} 
              onClick={() => setActiveTab('notes')} 
              isLightTheme={!isDarkMode}
            />
            <NavItem 
              icon={<Camera className="w-5 h-5" />} 
              label="Scan" 
              isActive={activeTab === 'scanner'} 
              onClick={() => setActiveTab('scanner')} 
              isLightTheme={!isDarkMode}
            />
            <NavItem 
              icon={<Sparkles className="w-5 h-5" />} 
              label="Tutor" 
              isActive={activeTab === 'aitutor'} 
              onClick={() => setActiveTab('aitutor')} 
              isLightTheme={!isDarkMode}
            />
            <NavItem 
              icon={<UserCircle className="w-5 h-5" />} 
              label="Profile" 
              isActive={activeTab === 'profile'} 
              onClick={() => setActiveTab('profile')} 
              isLightTheme={!isDarkMode}
            />
          </div>
        </nav>
      )}

      <AnimatePresence>
        {showSplash && (
          <SplashScreen key="splash" />
        )}
        {showOnboarding && (
          <Suspense fallback={<FullPageSkeleton />}>
            <ErrorBoundary>
              <Onboarding 
                key="onboarding" 
                onComplete={() => {
                  setShowOnboarding(false);
                  setShowLoginModal(true);
                }} 
              />
            </ErrorBoundary>
          </Suspense>
        )}
        {showVipModal && !isVip && (
          <motion.div key="vip" 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-[#FAF9F6]"
          >
            <Suspense fallback={<FullPageSkeleton />}>
              <VIPPass 
                isVip={isVip} 
                onUpgrade={() => { 
                  setShowVipModal(false); 
                  window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "PRO Benefits" } }));
                }} 
                onClose={() => setShowVipModal(false)} 
              />
            </Suspense>
          </motion.div>
        )}

        {showLoginModal && (
          <motion.div key="login" 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[60] bg-[#FAF9F6]"
          >
            <Suspense fallback={<FullPageSkeleton />}>
              <Login 
                onClose={() => setShowLoginModal(false)} 
                onLoginSuccess={() => {
                  setShowLoginModal(false);
                  if (auth.currentUser) {
                    const setupCompleted = safeGetItem(`academic_setup_completed_${auth.currentUser.uid}`) === 'true';
                    if (!setupCompleted) {
                      setShowAcademicSetup(true);
                    }
                  }
                }} 
              />
            </Suspense>
          </motion.div>
        )}

        {showAcademicSetup && user && (
          <motion.div key="academic-setup" 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[70] bg-white"
          >
            <Suspense fallback={<FullPageSkeleton />}>
              <ErrorBoundary>
                <AcademicSetup 
                  userId={user.uid}
                  onComplete={() => setShowAcademicSetup(false)} 
                />
              </ErrorBoundary>
            </Suspense>
          </motion.div>
        )}

        {/* Profile modal removed since it is now a main tab */}
      </AnimatePresence>

      {/* Floating Mobile Toast Notification */}
      <AnimatePresence>
        {mobileToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] w-auto max-w-[90vw] bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-zinc-800 flex items-center justify-between gap-3"
          >
            <span className="text-xs font-black tracking-wide leading-relaxed">
              {mobileToast}
            </span>
            <button 
              onClick={() => setMobileToast(null)} 
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        <PaywallModal 
          isOpen={showPaywallModal} 
          onClose={() => setShowPaywallModal(false)} 
          featureName={paywallFeature}
          onSubscribe={(cycle, _hasTrial) => {
            setShowPaywallModal(false);
            triggerConfetti();
            setMobileToast("🚀 Welcome to HelpYou AI PRO!");
          }}
        />
      </Suspense>
    </div>
    </AuthGuard>
  );
}

function NavItem({ 
  icon, 
  label, 
  isActive, 
  onClick, 
  isLightTheme 
}: { 
  icon: ReactNode, 
  label: string, 
  isActive: boolean, 
  onClick: () => void, 
  isLightTheme: boolean 
}) {
  return (
    <button 
      onClick={() => {
        triggerVibration(15);
        onClick();
      }}
      className={`flex flex-col items-center py-0.5 px-1 rounded-lg transition-all duration-300 ease-in-out w-16 ${
        isActive 
          ? isLightTheme ? 'text-zinc-950 font-black' : 'text-purple-400 font-extrabold' 
          : isLightTheme ? 'text-zinc-400 font-bold hover:text-zinc-600' : 'text-gray-500 hover:text-gray-300 font-semibold'
      }`}
    >
      <div className={`mb-0 transition-transform duration-300 ${isActive ? 'scale-105' : ''}`}>
        {icon}
      </div>
      <span className="text-[10px] tracking-wide whitespace-nowrap">{label}</span>
    </button>
  );
}
