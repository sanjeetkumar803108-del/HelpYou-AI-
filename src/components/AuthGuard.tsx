import React, { Suspense } from 'react';
import { User } from 'firebase/auth';
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
 * Isolated Auth & Onboarding Stack Guard.
 * Renders Welcome (Onboarding), Sign-In (Login), and Country/Grade/Stream (AcademicSetup)
 * in an isolated full-screen view (headerShown: false), completely preventing header peeking.
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
  // 1. Splash Screen
  if (showSplash) {
    return (
      <div className={`w-full flex flex-col h-[100dvh] max-w-md mx-auto ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100 sm:border-zinc-800' : 'bg-white text-zinc-900 sm:border-zinc-200'} font-sans overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.15)] sm:rounded-[2rem] sm:h-[90vh] sm:mt-[5vh] sm:border relative z-[999]`}>
        <SplashScreen />
      </div>
    );
  }

  // 2. Auth Loading Skeleton
  if (authLoading) {
    return (
      <div className={`w-full flex flex-col h-[100dvh] max-w-md mx-auto ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100 sm:border-zinc-800' : 'bg-white text-zinc-900 sm:border-zinc-200'} font-sans overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.15)] sm:rounded-[2rem] sm:h-[90vh] sm:mt-[5vh] sm:border relative z-[999]`}>
        {fallbackSkeleton}
      </div>
    );
  }

  // 3. Isolated Onboarding Stack (Welcome Screen) - Full-screen, no header
  if (showOnboarding) {
    return (
      <div className={`w-full flex flex-col h-[100dvh] max-w-md mx-auto ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100 sm:border-zinc-800' : 'bg-white text-zinc-900 sm:border-zinc-200'} font-sans overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.15)] sm:rounded-[2rem] sm:h-[90vh] sm:mt-[5vh] sm:border relative z-[999]`}>
        <ErrorBoundary>
          <Onboarding 
            onComplete={() => {
              setShowOnboarding(false);
              setShowAcademicSetup(true);
            }} 
          />
        </ErrorBoundary>
      </div>
    );
  }

  // 4. Isolated Auth Stack (Sign In / Sign Up) - Full-screen, no header
  if (!user) {
    return (
      <div className={`w-full flex flex-col h-[100dvh] max-w-md mx-auto ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100 sm:border-zinc-800' : 'bg-white text-zinc-900 sm:border-zinc-200'} font-sans overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.15)] sm:rounded-[2rem] sm:h-[90vh] sm:mt-[5vh] sm:border relative z-[999]`}>
        <ErrorBoundary>
          <Suspense fallback={fallbackSkeleton}>
            <Login 
              onClose={() => {}} 
              onLoginSuccess={(target) => {
                if (target === 'main') {
                  setShowOnboarding(false);
                  setShowAcademicSetup(false);
                } else if (target === 'setup') {
                  setShowOnboarding(false);
                  setShowAcademicSetup(true);
                } else if (target === 'onboarding') {
                  setShowOnboarding(true);
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

  // 5. Isolated Onboarding Academic Setup Stack (Country, Grade, Stream Screens) - Full-screen, no header
  if (showAcademicSetup) {
    return (
      <div className={`w-full flex flex-col h-[100dvh] max-w-md mx-auto ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100 sm:border-zinc-800' : 'bg-white text-zinc-900 sm:border-zinc-200'} font-sans overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.15)] sm:rounded-[2rem] sm:h-[90vh] sm:mt-[5vh] sm:border relative z-[999]`}>
        <ErrorBoundary>
          <AcademicSetup 
            userId={user.uid}
            onComplete={() => {
              setShowAcademicSetup(false);
              setShowOnboarding(false);
            }} 
          />
        </ErrorBoundary>
      </div>
    );
  }

  // 6. Main App Stack (Home Tabs)
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
