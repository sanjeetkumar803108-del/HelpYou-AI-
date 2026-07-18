/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, ReactNode, useEffect, lazy, Suspense } from 'react';
import { LayoutDashboard, Camera, BookOpen, Headphones, UserCircle, Sparkles, Home, Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import ToolsDashboard from './components/ToolsDashboard';
import LockedFeature from './components/LockedFeature';
import { billingService } from './services/BillingService';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { triggerVibration } from './utils/vibrate';
import { safeGetItem, safeSetItem, safeClearAll } from './utils/storage';
import { refillDailyCoins } from './utils/coins';

import confetti from 'canvas-confetti';

const ImageToPDF = lazy(() => import('./components/ImageToPDF'));
const MagicScanner = lazy(() => import('./components/MagicScanner'));
const NoteMaker = lazy(() => import('./components/NoteMaker'));
const EssayGrader = lazy(() => import('./components/EssayGrader'));
const FlashcardGenerator = lazy(() => import('./components/FlashcardGenerator'));
const ContentGenerator = lazy(() => import('./components/ContentGenerator'));
const GrammarEnhancer = lazy(() => import('./components/GrammarEnhancer'));
const Summariser = lazy(() => import('./components/Summariser'));
const CallWithTutor = lazy(() => import('./components/CallWithTutor'));
const Calculator = lazy(() => import('./components/Calculator'));
const VIPPass = lazy(() => import('./components/VIPPass'));
const AcademicSetup = lazy(() => import('./components/AcademicSetup'));
const Login = lazy(() => import('./components/Login'));
const Profile = lazy(() => import('./components/Profile'));
const AITutor = lazy(() => import('./components/AITutor'));
const QuizGenerator = lazy(() => import('./components/QuizGenerator'));
const CoinPage = lazy(() => import('./components/CoinPage'));
const DailyTrivia = lazy(() => import('./components/DailyTrivia'));
const LiveTutorSearch = lazy(() => import('./components/LiveTutorSearch'));
const MistakeVault = lazy(() => import('./components/MistakeVault'));
const PaywallModal = lazy(() => import('./components/PaywallModal'));
const IAPModal = lazy(() => import('./components/IAPModal'));
const Onboarding = lazy(() => import('./components/Onboarding'));
import SplashScreen from './components/SplashScreen';

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
    <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center p-6 bg-[#FAF9F6] animate-pulse">
      <div className="w-16 h-16 bg-zinc-200 rounded-3xl mb-4" />
      <div className="h-6 w-32 bg-zinc-200 rounded-lg mb-2" />
      <div className="h-4 w-48 bg-zinc-150 rounded-md" />
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
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
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
      setShowVipModal(true);
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

    window.addEventListener('open-vip-modal', handleOpenVip);
    window.addEventListener('open-login-modal', handleOpenLogin);
    window.addEventListener('open-profile-modal', handleOpenProfile);
    window.addEventListener('show-mobile-toast', handleShowMobileToast);
    window.addEventListener('open-paywall-modal', handleOpenPaywall);
    window.addEventListener('open-iap-modal', handleOpenIap);
    return () => {
      window.removeEventListener('open-vip-modal', handleOpenVip);
      window.removeEventListener('open-login-modal', handleOpenLogin);
      window.removeEventListener('open-profile-modal', handleOpenProfile);
      window.removeEventListener('show-mobile-toast', handleShowMobileToast);
      window.removeEventListener('open-paywall-modal', handleOpenPaywall);
      window.removeEventListener('open-iap-modal', handleOpenIap);
    };
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        refillDailyCoins();
        
        // 1. Initially set to specific user cached state or false (prevent leak from other sessions)
        const cachedUserVip = safeGetItem(`study_is_vip_${currentUser.uid}`) === 'true';
        setIsVip(cachedUserVip);
        
        // Onboarding Check for the logged-in user
        const userOnboardingCompleted = safeGetItem(`onboarding_completed_${currentUser.uid}`) === 'true';
        const globalOnboardingCompleted = safeGetItem('onboarding_completed') === 'true';
        const academicSetupCompleted = safeGetItem(`academic_setup_completed_${currentUser.uid}`) === 'true';
        
        if (globalOnboardingCompleted && !userOnboardingCompleted) {
          // If they completed global onboarding before logging in, link it to this user
          safeSetItem(`onboarding_completed_${currentUser.uid}`, 'true');
          if (!academicSetupCompleted) {
            setShowAcademicSetup(true);
          }
        } else if (!userOnboardingCompleted) {
          // If the logged-in user hasn't completed onboarding, show them the welcome onboarding page!
          setShowOnboarding(true);
        } else if (!academicSetupCompleted) {
          setShowAcademicSetup(true);
        }

        // 2. Fresh Fetch on Login: Network verification request
        fetch('/api/verify-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: currentUser.uid })
        })
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.isPro === 'boolean') {
            setIsVip(data.isPro);
            safeSetItem('study_is_vip', String(data.isPro));
            safeSetItem(`study_is_vip_${currentUser.uid}`, String(data.isPro));
            console.log(`[Auth Check] Verified specific subscription status from backend: ${data.isPro}`);
          }
        })
        .catch(err => {
          console.error('[Auth Check] Failed to verify subscription from backend:', err);
          // Fallback only to this specific logged-in user's cached value, never a different account
          const verifiedVal = safeGetItem(`study_is_vip_${currentUser.uid}`) === 'true';
          setIsVip(verifiedVal);
          safeSetItem('study_is_vip', String(verifiedVal));
        });
      } else {
        // Forcefully reset subscription state and clear cached storage on logout
        setIsVip(false);
        safeClearAll();
        // Since safeClearAll clears everything, we trigger onboarding for logged out guests
        setShowOnboarding(true);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setPocketItems([]);
      return;
    }
    safeSetItem('last_logged_in_user', user.uid);
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
    const unsubscribeItems = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPocketItems(fetched);
      safeSetItem(`stale_pocket_items_${user.uid}`, JSON.stringify(fetched));
    });
    return () => unsubscribeItems();
  }, [user]);



  return (
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
        <Suspense fallback={<FullPageSkeleton />}>
          {/* Scanner Tab */}
          <div className={activeTab === 'scanner' ? 'h-full flex flex-col' : 'hidden'}>
            <MagicScanner isVip={isVip} isFocused={activeTab === 'scanner'} onNavigateToTab={(tab) => {
              setActiveTab(tab);
              setActiveTool(null);
            }} />
          </div>

          {/* AI Tutor Tab */}
          <div className={activeTab === 'aitutor' ? 'h-full flex flex-col' : 'hidden'}>
            <AITutor isVip={isVip} />
          </div>

          {/* Home/Notes Tab */}
          <div className={activeTab === 'notes' ? 'h-full flex flex-col' : 'hidden'}>
            <div className={activeTool === null ? "h-full flex flex-col" : "hidden"}>
              <ToolsDashboard 
                isVip={isVip} 
                user={user}
                pocketItems={pocketItems}
                onOpenVip={() => setShowVipModal(true)}
                onOpenProfile={() => setActiveTab('profile')}
                onOpenLogin={() => setShowLoginModal(true)}
                onSelectTool={(tool) => {
                  if (tool === 'tab:scanner') {
                    setActiveTab('scanner');
                  } else if (tool === 'tab:aitutor') {
                    setActiveTab('aitutor');
                  } else {
                    setActiveTool(tool);
                  }
                }} 
              />
            </div>
            {/* Active Tool Rendering */}
            {activeTool === 'notemaker' && (
              <LockedFeature cost={2} featureName="AI Smart Notes Maker" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <NoteMaker onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'essaygrader' && (
              <LockedFeature cost={1} featureName="AI Essay Grader" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <EssayGrader onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'flashcardgenerator' && (
              <LockedFeature cost={2} featureName="AI Flashcards Generator" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <FlashcardGenerator onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'image2pdf' && <ImageToPDF onBack={() => setActiveTool(null)} />}
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
            {activeTool === 'calculator' && <Calculator onBack={() => setActiveTool(null)} />}
            {activeTool === 'quizgenerator' && (
              <LockedFeature cost={2} featureName="AI Quiz Generator" onBack={() => setActiveTool(null)} onEarnCoins={() => setActiveTool('coinpage')}>
                <QuizGenerator onBack={() => setActiveTool(null)} />
              </LockedFeature>
            )}
            {activeTool === 'dailytrivia' && <DailyTrivia onBack={() => setActiveTool(null)} />}
            {activeTool === 'livetutorsearch' && <LiveTutorSearch onBack={() => setActiveTool(null)} />}
            {activeTool === 'mistakevault' && <MistakeVault onBack={() => setActiveTool(null)} />}
            {activeTool === 'coinpage' && (
              <CoinPage 
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
          </div>

          {/* Profile Tab */}
          <div className={activeTab === 'profile' ? 'h-full flex flex-col' : 'hidden'}>
            <Profile 
              user={user}
              isVip={isVip}
              setIsVip={handleSetIsVip}
              onClose={() => setActiveTab('notes')} 
              isDarkMode={isDarkMode}
              onToggleDarkMode={toggleDarkMode}
              isTabMode={true}
              onOpenLogin={() => setShowLoginModal(true)}
            />
          </div>
        </Suspense>
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
            <Onboarding 
              key="onboarding" 
              onComplete={() => {
                setShowOnboarding(false);
                setShowLoginModal(true);
              }} 
            />
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
              <AcademicSetup 
                userId={user.uid}
                onComplete={() => setShowAcademicSetup(false)} 
              />
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
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] w-auto max-w-[90vw] bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-zinc-800 flex items-center gap-2.5"
          >
            <span className="text-xs font-black tracking-wide text-center leading-relaxed">
              {mobileToast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        <PaywallModal 
          isOpen={showPaywallModal} 
          onClose={() => setShowPaywallModal(false)} 
          featureName={paywallFeature}
          onSubscribe={(cycle, hasTrial) => {
            setShowPaywallModal(false);
            setIapCycle(cycle);
            setIapHasTrial(hasTrial);
            billingService.purchasePro(cycle, hasTrial);
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <IAPModal 
          isOpen={showIapModal}
          onClose={() => setShowIapModal(false)}
          billingCycle={iapCycle}
          hasTrial={iapHasTrial}
          onResult={(success) => {
            setShowIapModal(false);
            billingService.finalizeProStatus(success);
            window.dispatchEvent(new CustomEvent('iap-result', { detail: { success } }));
            
            if (success) {
              triggerConfetti();
              setMobileToast("🚀 Welcome to HelpYou AI PRO!");
            } else {
              setMobileToast("❌ Payment failed, please try again");
            }
          }}
        />
      </Suspense>
    </div>
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
