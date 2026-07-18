import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, UserPlus, LogIn, Chrome, LogOut } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { safeClearAll } from '../utils/storage';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';

export default function Login({ onClose, onLoginSuccess }: { onClose: () => void, onLoginSuccess: () => void }) {
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onLoginSuccess();
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please try again.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else {
        setError(`Firebase: Error (${err.code || err.message}).`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onLoginSuccess();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled.');
      } else {
        setError(`Firebase: Error (${err.code || err.message}).`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    safeClearAll();
    await signOut(auth);
    onClose();
  };

  if (user) {
    return (
      <div className="p-6 h-full flex flex-col relative bg-[#FAF9F6] overflow-y-auto">
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 bg-zinc-100 rounded-full border border-zinc-200 shadow-sm transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 flex flex-col items-center justify-center mt-8">
          <div className="w-24 h-24 bg-teal-500/10 rounded-full mb-6 flex items-center justify-center shadow-md border border-teal-500/20 text-teal-600 text-4xl font-bold">
            {user.email?.[0].toUpperCase() || 'U'}
          </div>
          <h2 className="text-3xl font-bold text-zinc-800 mb-2 tracking-tight">Welcome Back!</h2>
          <p className="text-zinc-500 font-medium mb-8">{user.email}</p>

          <button 
            onClick={handleSignOut}
            className="w-full max-w-sm bg-red-50 text-red-600 hover:bg-red-100 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-red-200"
          >
            <LogOut className="w-5 h-5" />
            SIGN OUT
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col relative bg-[#FAF9F6] overflow-y-auto">
      {/* Background Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-teal-650/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-blue-650/5 rounded-full blur-[120px] pointer-events-none" />

      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 bg-zinc-100 rounded-full border border-zinc-200 shadow-sm transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center mt-8 z-10">
        <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-3xl mb-4 flex items-center justify-center shadow-md border border-teal-400/50 animate-pulse">
          <span className="text-4xl text-white font-bold">H</span>
        </div>
        
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
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-white px-4 py-4 rounded-2xl border border-zinc-200 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 shadow-sm text-zinc-800 font-medium tracking-widest placeholder-zinc-350 transition-all"
              placeholder="••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl border border-red-200 flex items-center">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-450 hover:to-emerald-550 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-70 mt-2 shadow-md shadow-teal-500/10 border border-teal-400/50 active:scale-[0.98]"
          >
            {isSignUp ? 'SIGN UP' : 'SIGN IN'}
            {isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
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
          className="w-full max-w-sm bg-white border border-zinc-200 text-zinc-800 font-bold py-4 rounded-2xl mt-8 flex items-center justify-center gap-3 hover:bg-zinc-50 transition-colors shadow-sm active:scale-[0.98]"
        >
          <Chrome className="w-5 h-5 text-zinc-650" />
          GOOGLE SIGN-IN
        </button>

        <div className="mt-8 text-sm text-zinc-500 font-medium">
          {isSignUp ? 'Pehle se account hai? ' : 'Account nahi hai? '}
          <button 
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-teal-600 font-bold hover:text-teal-700 ml-1 transition-colors"
          >
            {isSignUp ? 'Sign In karein' : 'Sign Up karein'}
          </button>
        </div>
        
        <div className="mt-auto pt-8 pb-4 text-[10px] text-zinc-400 font-bold tracking-widest uppercase flex items-center justify-center gap-2">
           Secure AI Authentication
        </div>
      </div>
    </div>
  );
}
