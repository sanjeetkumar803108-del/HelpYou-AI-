import React, { Suspense, useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { safeGetItem } from '../utils/storage';
import Login from './Login';
import SplashScreen from './SplashScreen';
import Onboarding from './Onboarding';
import AcademicSetup from './AcademicSetup';
import ErrorBoundary from './ErrorBoundary';

interface AuthGuardProps {
  user: User | null;
  authLoading: boolean;
  showSplash: boolean;
  showOnboarding: boolean;
  showAcademicSetup: boolean;
  isDarkMode: boolean;
  setShowOnboarding: (show: boolean) => void;
  setShowAcademicSetup: (show: boolean) => void;
  children: React.ReactNode;
  fallbackSkeleton: React.ReactNode;
}

/**
 * Isolated Auth & Launch Flow Guard:
 * 1. Splash Screen
 * 2. Welcoming Pages (Onboarding - Interactive app features)
 * 3. Selection Pages (AcademicSetup - Country, Grade, Stream selection)
 * 4. Sign-In / Sign-Up (Login - If unauthenticated)
 * 5. Main Dashboard (Home Tabs)
 */
export default function AuthGuard({
  user,
  authLoading,
  showSplash,
  showOnboarding,
  showAcademicSetup,
  isDarkMode,
  setShowOnboarding,
  setShowAcademicSetup,
  children,
  fallbackSkeleton,
}: AuthGuardProps) {
  const containerClass = `w-full flex flex-col h-[100dvh] max-w-md mx-auto ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100 sm:border-zinc-800' : 'bg-[#FAF9F6] text-zinc-900 sm:border-zinc-200'} font-sans overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.15)] sm:rounded-[2rem] sm:h-[90vh] sm:mt-[5vh] sm:border relative z-[999]`;

  // Absolute fail-safe: Never allow loading hold to trap user for more than 3500ms
  const [cachedCheckExpired, setCachedCheckExpired] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCachedCheckExpired(true);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // 1. Splash Screen
  if (showSplash) {
    return (
      <div className={containerClass}>
        <SplashScreen />
      </div>
    );
  }

  // Active User: check React state or immediate Firebase auth object
  const activeUser = user || auth.currentUser;
  const hasCachedSession = Boolean(
    safeGetItem('last_logged_in_user') || 
    safeGetItem('helpyou_active_user_session') === 'true'
  );

  // 2. Auth Loading / Cached Session Hold:
  // If the user has a confirmed cached session from a previous login, OR if auth state is actively resolving,
  // NEVER show the Login screen! Instead, keep the branded SplashScreen visible until Firebase restores activeUser.
  if (!activeUser && (authLoading || hasCachedSession) && !cachedCheckExpired) {
    return (
      <div className={containerClass}>
        <SplashScreen />
      </div>
    );
  }

  // 3. Isolated Auth Stack (Sign In / Sign Up) - Full-screen, no header
  // ONLY reached when the user is genuinely unauthenticated (no cached session or session explicitly expired).
  if (!activeUser) {
    return (
      <div className={containerClass}>
        <ErrorBoundary featureName="Login">
          <Suspense fallback={fallbackSkeleton}>
            <Login 
              onClose={() => {}} 
              onLoginSuccess={(target?: string) => {
                if (target === 'onboarding') {
                  setShowOnboarding(true);
                  setShowAcademicSetup(false);
                } else if (target === 'setup') {
                  setShowOnboarding(false);
                  setShowAcademicSetup(true);
                } else {
                  setShowOnboarding(false);
                  setShowAcademicSetup(false);
                }
              }} 
              hideClose={true} 
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  // Check if returning user already completed the 4 academic selection pages (Country, Exam, Grade, Subjects)
  const isUserSetupComplete = Boolean(
    safeGetItem(`isOnboardingComplete_${activeUser.uid}`) === 'true' ||
    safeGetItem(`academic_setup_completed_${activeUser.uid}`) === 'true'
  );

  // Check if welcoming tutorial slides are completed or skipped
  const isWelcomingComplete = Boolean(
    safeGetItem(`onboarding_completed_${activeUser.uid}`) === 'true' ||
    isUserSetupComplete
  );

  // 5. Isolated Onboarding Stack (Welcoming Pages) - ONLY for new users whose welcoming slides are NOT completed/skipped
  if (!isUserSetupComplete && !isWelcomingComplete && showOnboarding) {
    return (
      <div className={containerClass}>
        <ErrorBoundary featureName="Onboarding" onReset={() => setShowOnboarding(false)}>
          <Suspense fallback={fallbackSkeleton}>
            <Onboarding 
              onComplete={() => {
                setShowOnboarding(false);
                setShowAcademicSetup(true);
              }} 
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  // 6. Isolated Academic Setup Stack (Country, Exam, Grade, Subject Selection Pages) - MANDATORY until all 4 steps are finished!
  if (!isUserSetupComplete && (showAcademicSetup || isWelcomingComplete)) {
    return (
      <div className={containerClass}>
        <ErrorBoundary featureName="Academic Setup" onReset={() => setShowAcademicSetup(false)}>
          <Suspense fallback={fallbackSkeleton}>
            <AcademicSetup 
              userId={activeUser?.uid || ''}
              onComplete={() => {
                setShowAcademicSetup(false);
                setShowOnboarding(false);
              }} 
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  // 7. Main App Stack (Home Tabs) - Returning users land directly here in 0ms!
  return <ErrorBoundary featureName="Main App">{children}</ErrorBoundary>;
}
