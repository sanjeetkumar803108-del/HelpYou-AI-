import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, UserPlus, LogIn, Chrome, LogOut, Loader2, Eye, EyeOff, Check } from 'lucide-react';
import { auth, googleProvider, db } from '../lib/firebase';
import { safeClearAll, safeSetItem, safeGetItem } from '../utils/storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  User
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import appLogo from '../assets/logo.svg';

// React Native web-compatibility components & helpers
const require = (path: string) => {
  return appLogo;
};

const Image = ({ source, style, className }: { source: any; style?: any; className?: string }) => {
  const src = appLogo;
  const objectFit = style?.resizeMode || 'contain';
  return (
    <img 
      src={src} 
      style={{ width: 80, height: 80, objectFit, ...style }} 
      className={className} 
      alt="logo" 
      referrerPolicy="no-referrer" 
    />
  );
};

const TouchableOpacity = ({ onPress, children, className, style }: { onPress?: () => void; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`opacity-100 active:opacity-60 transition-opacity focus:outline-none ${className || ''}`}
      style={style}
    >
      {children}
    </button>
  );
};

import { showToast } from '../utils/toast';

const Alert = {
  alert: (title: string, message: string) => {
    const isSuccess = title.toLowerCase().includes('success') || title.toLowerCase().includes('sent');
    showToast(`${title}: ${message}`, isSuccess ? 'success' : 'error', 4500);
  }
};


export default function Login({ onClose, onLoginSuccess, hideClose = false }: { onClose: () => void, onLoginSuccess: (target?: 'main' | 'setup' | 'onboarding') => void, hideClose?: boolean }) {
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const isRoutingRef = React.useRef(false);

  const routeUserAfterAuth = async (currentUser: User) => {
    if (isRoutingRef.current) return;
    isRoutingRef.current = true;
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const isComplete = userData?.isOnboardingComplete === true || 
                           userData?.isOnboardingCompleted === true ||
                           Boolean(userData?.grade && userData?.stream && userData?.country) ||
                           Boolean(userData?.academic_grade && userData?.academic_stream && userData?.academic_country) ||
                           safeGetItem(`academic_setup_completed_${currentUser.uid}`) === 'true' ||
                           safeGetItem(`isOnboardingComplete_${currentUser.uid}`) === 'true';

        if (isComplete) {
          // Returning user: Skip onboarding and route directly to MainApp / HomeTabs
          safeSetItem(`onboarding_completed_${currentUser.uid}`, 'true');
          safeSetItem(`academic_setup_completed_${currentUser.uid}`, 'true');
          safeSetItem(`isOnboardingComplete_${currentUser.uid}`, 'true');
          onLoginSuccess('main');
          onClose();
          return;
        } else {
          const userOnboardingCompleted = safeGetItem(`onboarding_completed_${currentUser.uid}`) === 'true';
          if (userOnboardingCompleted) {
            onLoginSuccess('setup');
          } else {
            onLoginSuccess('onboarding');
          }
          onClose();
          return;
        }
      }
    } catch (err) {
      console.warn('[Login Route Check] Error checking user onboarding doc:', err);
    }

    // Fallback: Check local storage
    const userOnboardingCompleted = safeGetItem(`onboarding_completed_${currentUser.uid}`) === 'true';
    const userSetupCompleted = safeGetItem(`academic_setup_completed_${currentUser.uid}`) === 'true';
    if (userSetupCompleted) {
      onLoginSuccess('main');
    } else if (userOnboardingCompleted) {
      onLoginSuccess('setup');
    } else {
      onLoginSuccess('onboarding');
    }
    onClose();
  };

  const isPasswordValid = (pw: string) => {
    const hasMinLength = pw.length >= 8;
    const hasUppercase = /[A-Z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    return hasMinLength && hasUppercase && hasNumber && hasSpecial;
  };

  useEffect(() => {
    // 1. Check for pending redirect sign-in result from Google OAuth
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          routeUserAfterAuth(result.user);
        }
      })
      .catch((redirectErr) => {
        console.warn('[Google Redirect Auth Notice]', redirectErr);
      });

    // 2. Listen for active auth state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const isGoogle = currentUser.providerData?.some(p => p.providerId === 'google.com') || false;
        if (currentUser.emailVerified || isGoogle) {
          routeUserAfterAuth(currentUser);
        }
      }
    });
    return () => unsubscribe();
  }, [onClose]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      showToast('Please enter your email address.', 'error', 3500);
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      showToast('Please enter your password.', 'error', 3500);
      return;
    }

    if (isSignUp) {
      if (!isPasswordValid(password)) {
        setError('Password must contain at least 8 characters, 1 uppercase letter, 1 number, and 1 special symbol.');
        showToast('Please satisfy all password rules.', 'error', 3500);
        return;
      }
    } else {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        showToast('Password must be at least 6 characters.', 'error', 3500);
        return;
      }
    }

    setLoading(true);
    const loadingTimer = setTimeout(() => {
      setLoading(false);
    }, 12000);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const newUser = userCredential.user;

        // Trigger email verification
        await sendEmailVerification(newUser);
        
        // Lifetime limit check for email
        const emailKey = cleanEmail.toLowerCase();
        const emailDocRef = doc(db, 'allocated_emails', emailKey);
        const emailDocSnap = await getDoc(emailDocRef);
        
        let initialCoins = 20;
        if (emailDocSnap.exists()) {
          initialCoins = 0;
          console.log(`[Signup Check] Email ${cleanEmail} has already been allocated coins. Setting signup initial to 0.`);
        } else {
          await setDoc(emailDocRef, {
            allocated: true,
            allocatedAt: new Date().toISOString(),
            userId: newUser.uid
          });
          console.log(`[Signup Check] Email ${cleanEmail} allocated lifetime 20 coins.`);
        }

        // Grant free coins initially in local storage for instant responsiveness
        const userKey = `study_daily_limit_${newUser.uid}`;
        safeSetItem(userKey, String(initialCoins));
        // Dispatch global update event to keep the UI in sync
        window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: initialCoins }));

        // Save default user object with coins inside Firestore upon account creation
        try {
          await setDoc(doc(db, 'users', newUser.uid), {
            userId: newUser.uid,
            email: newUser.email || cleanEmail,
            coins: initialCoins,
            isPro: false,
            createdAt: new Date().toISOString()
          });
          console.log(`[Auth Signup] Default user object initialized with ${initialCoins} coins in Firestore for ${newUser.uid}`);
        } catch (dbErr) {
          console.error("Failed to write initial user profile to Firestore:", dbErr);
        }

        // Sign out immediately so unverified account cannot access the app
        await signOut(auth);

        Alert.alert("Verification Email Sent", "Please verify your email address before logging in. A verification link has been sent to your inbox.");
        setError("Verification email sent! Please check your inbox and verify your email before logging in.");
        setIsSignUp(false);
        setPassword('');
        setLoading(false);
        return;
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const loggedUser = userCredential.user;
        const isGoogle = loggedUser.providerData?.some(p => p.providerId === 'google.com') || false;

        if (!loggedUser.emailVerified && !isGoogle) {
          setError('Please verify your email address before logging in.');
          Alert.alert("Verification Required", "Please verify your email address before logging in.");
          await signOut(auth);
          setLoading(false);
          return;
        }
      }
      if (auth.currentUser) {
        await routeUserAfterAuth(auth.currentUser);
      } else {
        onLoginSuccess('onboarding');
        onClose();
      }
    } catch (err: any) {
      console.warn('[Auth Error]', err?.code, err?.message);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        const errMsg = 'Incorrect password, or this email is registered via Google Sign-In. Please use the Google button below.';
        setError(errMsg);
        Alert.alert("Login Failed", errMsg);
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email. Please sign up first.');
      } else if (err.code === 'auth/email-already-in-use') {
        const errMsg = 'An account with this email already exists. If you previously signed up using Google, please use the Google Sign-In button instead.';
        setError(errMsg);
        Alert.alert("Account Exists", errMsg);
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address format.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again in a few minutes.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      clearTimeout(loadingTimer);
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const googleLoadingTimer = setTimeout(() => {
      setLoading(false);
    }, 15000);

    try {
      let loggedUser: User | null = null;

      // NATIVE PATH (Android/iOS): Uses Google Play Services natively
      if (Capacitor.isNativePlatform()) {
        try {
          console.log('[Google Auth] Starting native Google Sign-In with Account Chooser...');
          
          // Clear any cached session so Google Account Selector dialog is ALWAYS displayed
          try {
            await FirebaseAuthentication.signOut();
          } catch (_) {}

          let result;
          try {
            result = await FirebaseAuthentication.signInWithGoogle();
          } catch (credMgrErr: any) {
            console.warn('[Native Google Sign-In] Credential Manager fallback attempt:', credMgrErr?.message);
            result = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
          }

          console.log('[Google Auth] Native result received:', JSON.stringify(result));

          let idToken = result?.credential?.idToken;

          // If idToken is not in credential object, fetch it explicitly via getIdToken
          if (!idToken) {
            try {
              const tokenRes = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
              idToken = tokenRes.token;
              console.log('[Google Auth] Retrieved idToken via getIdToken()');
            } catch (tErr) {
              console.warn('[Google Auth] getIdToken fallback notice:', tErr);
            }
          }

          if (idToken) {
            console.log('[Google Auth] Bridging native credential to Firebase JS SDK...');
            const credential = GoogleAuthProvider.credential(idToken);
            const userCred = await signInWithCredential(auth, credential);
            loggedUser = userCred.user;
          } else if (result?.user) {
            loggedUser = auth.currentUser;
          }
        } catch (nativeErr: any) {
          console.error('[Native Google Sign-In failed]:', nativeErr);
          const errMsg = nativeErr?.message || String(nativeErr);
          
          // User genuinely clicked outside/cancelled the dialog
          if (errMsg.includes('12501') || errMsg.toLowerCase().includes('cancel')) {
            clearTimeout(googleLoadingTimer);
            setLoading(false);
            return;
          }

          // Code 10 Developer Error: SHA-1 mismatch or Google sign-in not enabled in Firebase Console
          if (errMsg.includes('10') || errMsg.toLowerCase().includes('developer_error')) {
            throw new Error('Google Sign-In Error (Code 10): SHA-1 Fingerprint missing in Firebase Console or Google provider is disabled.');
          }

          throw new Error(errMsg || 'Google Sign-In failed on this device. Please check Google Play Services.');
        }
      } else {
        // WEB BROWSER PATH ONLY - Force Google Account Chooser
        const freshProvider = new GoogleAuthProvider();
        freshProvider.setCustomParameters({ prompt: 'select_account' });
        try {
          const userCredential = await signInWithPopup(auth, freshProvider);
          loggedUser = userCredential.user;
        } catch (popupErr: any) {
          if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
            await signInWithRedirect(auth, freshProvider);
            return;
          }
          throw popupErr;
        }
      }

      if (!loggedUser) {
        throw new Error('Google Sign-In did not return a valid user session. Please try again.');
      }
      
      // Check if user document already exists in Firestore non-blockingly
      try {
        const userDocRef = doc(db, 'users', loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
          const emailKey = (loggedUser.email || '').toLowerCase();
          let initialCoins = 20;
          if (emailKey) {
            try {
              const emailDocRef = doc(db, 'allocated_emails', emailKey);
              const emailDocSnap = await getDoc(emailDocRef);
              if (emailDocSnap.exists()) {
                initialCoins = 0;
              } else {
                await setDoc(emailDocRef, {
                  allocated: true,
                  allocatedAt: new Date().toISOString(),
                  userId: loggedUser.uid
                });
              }
            } catch (allocErr) {
              console.warn('[Google Auth] Allocated email check notice:', allocErr);
            }
          }

          const userKey = `study_daily_limit_${loggedUser.uid}`;
          safeSetItem(userKey, String(initialCoins));
          window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: initialCoins }));

          await setDoc(userDocRef, {
            userId: loggedUser.uid,
            email: loggedUser.email || '',
            coins: initialCoins,
            isPro: false,
            createdAt: new Date().toISOString()
          });
        } else {
          const data = userDocSnap.data();
          if (data && typeof data.coins === 'number') {
            const userKey = `study_daily_limit_${loggedUser.uid}`;
            safeSetItem(userKey, String(data.coins));
            window.dispatchEvent(new CustomEvent('study-coins-updated', { detail: data.coins }));
          }
        }
      } catch (dbErr) {
        console.warn('[Google Auth] Firestore user profile sync notice:', dbErr);
      }

      await routeUserAfterAuth(loggedUser);
    } catch (err: any) {
      console.warn('[Google Auth Error]', err?.code, err?.message);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('Google Sign-In was cancelled.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked by browser. Please allow popups or use Email Sign In.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized. Please use Email Sign In or check Firebase authorized domains.');
      } else {
        setError(err.message || 'Google Sign-In failed. Please try again or use Email Sign In.');
      }
    } finally {
      clearTimeout(googleLoadingTimer);
      setLoading(false);
    }
  };

  const handleForgotPasswordPress = () => {
    // If user has already entered email in main input, use that
    if (email && email.trim()) {
      setForgotEmail(email.trim());
    } else {
      setForgotEmail('');
    }
    setForgotError(null);
    setForgotMessage(null);
    setShowForgotModal(true);
  };

  const handleSendResetEmail = async (emailToReset: string) => {
    if (!emailToReset || !emailToReset.trim()) {
      Alert.alert("Error", "Please enter your email address first.");
      setForgotError("Please enter your email address first.");
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    setForgotMessage(null);
    try {
      await sendPasswordResetEmail(auth, emailToReset.trim());
      Alert.alert("Check Your Email", "A password reset link has been sent to your email address. Please check your Spam box in your Email id.");
      setForgotMessage("A password reset link has been sent to your email address. Please check your Spam box in your Email id.");
    } catch (err: any) {
      console.warn('[Forgot Password Error]', err?.code, err?.message);
      let errMsg = "Failed to send reset email. Please try again.";
      if (err?.code === 'auth/user-not-found') {
        errMsg = "No user found with this email address.";
      } else if (err?.code === 'auth/invalid-email') {
        errMsg = "Please enter a valid email address.";
      } else if (err?.message) {
        errMsg = err.message;
      }
      setForgotError(errMsg);
      Alert.alert("Error", errMsg);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await FirebaseAuthentication.signOut();
        } catch (_) {}
      }
      await signOut(auth);
      onClose();
    } catch (err: any) {
      console.warn('Failed to sign out:', err);
    }
  };

  if (user) {
    return null;
  }

  return (
    <div className="p-6 h-full flex flex-col relative bg-white overflow-y-auto">
      {/* Background Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-teal-650/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-blue-650/5 rounded-full blur-[120px] pointer-events-none" />

      {!hideClose && (
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 bg-zinc-100 rounded-full border border-zinc-200 shadow-sm transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="flex-1 flex flex-col items-center justify-center mt-8 z-10">
        <Image 
          source={require('../assets/logo.png')} 
          style={{ width: 96, height: 96, resizeMode: 'contain' }}
          className="mb-4 animate-fade-in"
        />
        
        <h1 className="text-4xl font-bold text-zinc-800 mb-2 tracking-tight">HelpYou AI</h1>
        <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase mb-10">
          Your Digital Study Assistant
        </p>

        <form onSubmit={handleAuth} className="w-full max-w-sm flex flex-col space-y-5">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wide">
              Email Address
            </label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white px-4 py-4 rounded-2xl border border-zinc-200 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 shadow-sm text-zinc-800 font-medium placeholder-zinc-350 transition-all"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wide">
              Password
            </label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`w-full bg-white pl-4 pr-12 py-4 rounded-2xl border border-zinc-200 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 shadow-sm text-zinc-800 font-medium placeholder-zinc-350 transition-all ${showPassword ? '' : 'placeholder:tracking-normal'}`}
                placeholder="e.g. Student@2026"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none p-1 transition-colors flex items-center justify-center"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {isSignUp && (
              <div className="mt-3 space-y-1.5 bg-zinc-50 border border-zinc-150 rounded-xl p-3 shadow-inner">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Password Requirements:
                </p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: 'At least 8 characters', met: password.length >= 8 },
                    { label: 'Contains uppercase', met: /[A-Z]/.test(password) },
                    { label: 'Contains a number', met: /[0-9]/.test(password) },
                    { label: 'Contains a special character', met: /[^A-Za-z0-9]/.test(password) }
                  ].map((rule, idx) => {
                    const hasTyped = password.length > 0;
                    const textClass = rule.met 
                      ? 'text-emerald-600 font-semibold' 
                      : hasTyped 
                        ? 'text-rose-500/85 font-medium' 
                        : 'text-zinc-400 font-medium';
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        {rule.met ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                        ) : (
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] font-black ${hasTyped ? 'border-rose-200 text-rose-400 bg-rose-50' : 'border-zinc-250 text-zinc-400 bg-zinc-50'}`}>
                            •
                          </div>
                        )}
                        <span className={`text-[11px] transition-colors duration-200 ${textClass}`}>
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!isSignUp && (
              <div className="flex justify-end mt-2">
                <TouchableOpacity onPress={handleForgotPasswordPress}>
                  <span className="text-emerald-600 hover:text-emerald-700 text-xs font-medium transition-colors">
                    Forgot Password?
                  </span>
                </TouchableOpacity>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl border border-red-200 flex items-center">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all mt-2 shadow-md shadow-teal-500/10 border border-teal-400/50 active:scale-[0.98] cursor-pointer disabled:opacity-75"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{isSignUp ? 'CREATING ACCOUNT...' : 'SIGNING IN...'}</span>
              </div>
            ) : (
              <>
                <span>{isSignUp ? 'SIGN UP' : 'SIGN IN'}</span>
                {isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
              </>
            )}
          </button>
        </form>

        <div className="w-full max-w-sm mt-8 relative flex items-center justify-center">
          <div className="absolute w-full h-px bg-zinc-200"></div>
          <span className="relative bg-[#FAF9F6] px-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">
            Or Continue With
          </span>
        </div>

        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full max-w-sm bg-white border border-zinc-200 text-zinc-800 font-bold py-4 rounded-2xl mt-8 flex items-center justify-center gap-3 hover:bg-zinc-50 transition-colors shadow-sm active:scale-[0.98] cursor-pointer disabled:opacity-75"
        >
          <Chrome className="w-5 h-5 text-zinc-650" />
          GOOGLE SIGN-IN
        </button>

        <div className="mt-8 text-sm text-zinc-500 font-medium">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button 
            type="button"
            onClick={() => {
              setError(null);
              setIsSignUp(!isSignUp);
            }}
            className="text-teal-600 font-bold hover:text-teal-700 ml-1 transition-colors cursor-pointer"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>

        <div className="mt-6 max-w-xs text-center text-[11px] text-zinc-400 leading-relaxed font-medium px-4">
          By continuing, you agree to our{' '}
          <button
            type="button"
            onClick={() => window.open('https://docs.google.com/document/d/1BVo4XSvzxUPW_Bmn703ncimO5skWtxtx0NSPcKgB9NQ/edit?usp=drivesdk', '_blank')}
            className="text-teal-600 underline font-semibold hover:text-teal-700 transition-colors cursor-pointer inline-block"
          >
            Privacy Policy
          </button>{' '}
          and{' '}
          <button
            type="button"
            onClick={() => window.open('https://docs.google.com/document/d/1yWNiI1j7waXE5PBGcFfQORJCE9Aaezy-AvgWIJRjGVg/edit?usp=drivesdk', '_blank')}
            className="text-teal-600 underline font-semibold hover:text-teal-700 transition-colors cursor-pointer inline-block"
          >
            Terms of Service
          </button>.
        </div>
        
        <div className="mt-auto pt-6 pb-4 text-[10px] text-zinc-400 font-bold tracking-widest uppercase flex items-center justify-center gap-2">
           Secure AI Authentication
        </div>
      </div>

      {showForgotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#FAF9F6] w-full max-w-sm rounded-[2rem] p-6 shadow-xl border border-zinc-200/40 relative"
          >
            <button 
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-800 bg-zinc-100 rounded-full border border-zinc-200/40 shadow-sm transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-xl font-bold text-zinc-800 mb-1 tracking-tight">Reset Password</h2>
            <p className="text-zinc-500 text-xs font-semibold leading-relaxed mb-6">
              Enter your registered email address. We will send you a password reset link.
            </p>

            <div className="flex flex-col space-y-4">
              <div className="flex flex-col">
                <label className="text-[10px] font-black text-zinc-500 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <input 
                  type="email" 
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="bg-white px-4 py-3.5 rounded-2xl border border-zinc-200 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 shadow-sm text-zinc-850 text-sm font-semibold placeholder-zinc-350 transition-all"
                  placeholder="you@example.com"
                />
              </div>

              {forgotError && (
                <div className="bg-red-50 text-red-600 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-red-200">
                  {forgotError}
                </div>
              )}

              {forgotMessage && (
                <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-emerald-200">
                  {forgotMessage}
                </div>
              )}

              <button 
                type="button"
                disabled={forgotLoading}
                onClick={() => handleSendResetEmail(forgotEmail)}
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-75 shadow-md shadow-teal-500/5 border border-teal-400/50 active:scale-[0.98]"
              >
                {forgotLoading ? (
                  <>
                    BHEJ RAHE HAIN...
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </>
                ) : (
                  'SEND RESET LINK'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
