import React, { useState, useEffect } from 'react';
import { 
  UserCircle, Settings, LogOut, X, Crown, Lock, Mail, Shield, 
  HelpCircle, Star, Bug, FileText, Trash2, ChevronRight, ChevronDown,
  Check, MessageSquare, AlertTriangle, Eye, EyeOff, Sparkles, Send, Moon,
  GraduationCap, Calendar, Trophy, Edit3, Save, Flame, User, Info, Target, Zap,
  Loader2
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { 
  signOut, 
  User as FirebaseUser, 
  updatePassword, 
  updateEmail, 
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import confetti from 'canvas-confetti';
import { safeGetItem, safeSetItem, safeClearAll } from '../utils/storage';
import { getCoins } from '../utils/coins';
import { useSettings } from '../hooks/useSettings';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { billingService } from '../services/BillingService';

interface ProfileProps {
  user: FirebaseUser | null;
  isVip: boolean;
  setIsVip: (vip: boolean) => void;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isTabMode?: boolean;
  onOpenLogin?: () => void;
}

export default function Profile({ 
  user, 
  isVip, 
  setIsVip, 
  onClose, 
  isDarkMode, 
  onToggleDarkMode,
  isTabMode = false,
  onOpenLogin
}: ProfileProps) {
  // App Settings Toggles
  const [saveHistory, setSaveHistory] = useState<boolean>(() => {
    return safeGetItem('study_save_history') !== 'false';
  });

  // Settings Slideover Panel
  const [showSettings, setShowSettings] = useState(false);

  // Profile Edit State
  const [isEditingName, setIsEditingName] = useState(false);
  const [studentName, setStudentName] = useState(() => {
    return user?.displayName || safeGetItem('student_name') || 'Guest Student';
  });

  // Study Level Segment Selector
  const [studyLevel, setStudyLevel] = useState(() => {
    return safeGetItem('onboarding_grade') || 'High School';
  });

  // Granular Academic Track
  const [gradeLevel, setGradeLevel] = useState(() => {
    return safeGetItem('academic_grade') || '11th Grade (Junior)';
  });
  const [streamMajor, setStreamMajor] = useState(() => {
    return safeGetItem('academic_stream') || 'STEM / Engineering';
  });
  const [isGradeDropdownOpen, setIsGradeDropdownOpen] = useState(false);
  const [isTrackDropdownOpen, setIsTrackDropdownOpen] = useState(false);

  const { visualLearner, setVisualLearner, deepFocus, setDeepFocus } = useSettings();

  // Modal & Popup State in Settings
  const [activeModal, setActiveModal] = useState<
    'password' | 'email' | 'support' | 'rate' | 'bug' | 'privacy' | 'terms' | 'delete_account' | 'manage_sub' | null
  >(null);

  // Form Inputs
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  const [supportCategory, setSupportCategory] = useState('General Inquiry');
  const [isSupportDropdownOpen, setIsSupportDropdownOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');

  const [userRating, setUserRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [ratingReview, setRatingReview] = useState('');

  const [bugTitle, setBugTitle] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugSeverity, setBugSeverity] = useState('Medium');

  // Interactive Toast
  const [toast, setToast] = useState<string | null>(null);

  // Fetch coins & streak
  const coinsBalance = getCoins();
  const studyStreak = Number(safeGetItem('study_punches') || '0');

  // Sync state to local storage
  useEffect(() => {
    safeSetItem('study_save_history', String(saveHistory));
  }, [saveHistory]);

  // Keep student name in sync if user changes
  useEffect(() => {
    if (user?.displayName) {
      setStudentName(user.displayName);
    }
  }, [user]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveName = () => {
    triggerVibration(15);
    if (!studentName.trim()) {
      showToast("❌ Name cannot be empty");
      return;
    }
    safeSetItem('student_name', studentName.trim());
    setIsEditingName(false);
    showToast("💾 Profile name saved successfully!");
  };

  const handleStudyLevelChange = (level: string) => {
    triggerVibration(15);
    setStudyLevel(level);
    safeSetItem('onboarding_grade', level);
    showToast(`🎓 Study level set to ${level}!`);
  };

  const handleLogout = async () => {
    triggerVibration(15);
    setIsVip(false);
    safeClearAll();
    await signOut(auth);
    setShowSettings(false);
    showToast("👋 Logged out successfully");
  };

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Password & Email Handlers
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerVibration(20);
    const user = auth.currentUser;
    
    if (!user || !user.email) {
      showToast("❌ User session not found");
      return;
    }

    if (!currentPassword || !newPassword) {
      showToast("❌ Please fill in all fields");
      return;
    }
    if (newPassword.length < 6) {
      showToast("❌ Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      // Re-authenticate first (required for password changes)
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, newPassword);
      
      showToast("🔒 Password updated successfully!");
      setActiveModal(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-credential-password') {
        showToast("❌ Incorrect current password");
      } else if (error.code === 'auth/too-many-requests') {
        showToast("❌ Too many attempts. Try later.");
      } else {
        showToast("❌ Failed to update password");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerVibration(20);
    const user = auth.currentUser;

    if (!user || !user.email) {
      showToast("❌ User session not found");
      return;
    }

    if (!newEmail || !currentPassword) {
      showToast("❌ Please fill in both fields");
      return;
    }

    setLoading(true);
    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // updateEmail is preferred
      await updateEmail(user, newEmail);
      showToast("📧 Verification link sent to new email!");
      setActiveModal(null);
      setNewEmail('');
      setCurrentPassword('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-credential-password') {
        showToast("❌ Incorrect current password");
      } else if (error.code === 'auth/too-many-requests') {
        showToast("❌ Too many attempts. Try later.");
      } else {
        showToast("❌ Failed to update email");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    triggerVibration([30, 50, 30]);
    showToast("🗑️ Account and data permanently deleted.");
    setActiveModal(null);
    setIsVip(false);
    safeClearAll();
    signOut(auth);
    setShowSettings(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6] text-zinc-900 overflow-hidden relative">
      {/* Dynamic Action Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[11px] font-black px-4 py-2.5 rounded-full shadow-xl z-50 flex items-center gap-2 border border-zinc-800 whitespace-nowrap"
          >
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Profile Tab Screen */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto pb-24">
        {/* Custom Header Area */}
        <header className="px-6 py-5 bg-white border-b border-zinc-200/60 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-lg font-black tracking-tight text-zinc-850 flex items-center gap-2">
            <span>👤</span> My Profile
          </h1>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                triggerVibration(10);
                setShowSettings(true);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 hover:text-zinc-900 border border-zinc-200 transition-colors shadow-sm"
              title="App Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            {!isTabMode && (
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-500 hover:text-zinc-800 border border-zinc-200 transition-colors shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        <div className="p-6 space-y-6 max-w-md mx-auto w-full">
          {/* Main User Card with Beautiful Design */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm relative overflow-hidden flex flex-col items-center">
            {/* Ambient glows */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />

            {/* Premium VIP Crown Badge */}
            {isVip && (
              <div className="absolute top-4 right-4 bg-gradient-to-r from-yellow-500 to-amber-500 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm border border-yellow-400">
                <Crown className="w-3 h-3 fill-white" /> Pro
              </div>
            )}

            {/* Large Interactive Avatar */}
            <div className="relative mb-4 mt-2">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-purple-500 via-indigo-500 to-blue-500 flex items-center justify-center text-white font-black text-3xl shadow-lg border-4 border-white">
                {studentName ? studentName[0].toUpperCase() : 'S'}
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow-md flex items-center justify-center text-zinc-500">
                <GraduationCap className="w-4 h-4 text-purple-600" />
              </div>
            </div>

            {/* Editable Name Segment */}
            {isEditingName ? (
              <div className="flex items-center gap-1.5 w-full max-w-[240px] mb-1">
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="flex-1 bg-zinc-50 border border-purple-300 rounded-xl px-3 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-purple-600"
                  maxLength={25}
                  placeholder="Enter your name"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="p-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 shadow-sm transition-all"
                  title="Save Name"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1 group">
                <h2 className="text-xl font-black tracking-tight text-zinc-850">
                  {studentName}
                </h2>
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setIsEditingName(true);
                  }}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                  title="Edit Name"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Email Address */}
            <p className="text-zinc-400 text-xs font-bold mb-4">
              {user ? user.email : "Guest Account"}
            </p>

            {/* Login CTA for Guest Account */}
            {!user && onOpenLogin && (
              <button
                onClick={() => {
                  triggerVibration(15);
                  onOpenLogin();
                }}
                className="mt-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-250/50 px-4 py-2 rounded-full text-xs font-black transition-all shadow-inner active:scale-95"
              >
                🔐 Sign In / Sign Up
              </button>
            )}
          </div>

          {/* Basic Student Details Segment */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm space-y-5">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-zinc-400" /> Basic Details
            </h3>

            {/* Occupation: Strictly Student */}
            <div className="flex items-center justify-between py-3 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100 shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400">Occupation</span>
                  <p className="text-xs font-black text-zinc-800 leading-tight">Student</p>
                </div>
              </div>
              <span className="bg-purple-50 text-purple-700 text-[10px] font-black px-2.5 py-1 rounded-full border border-purple-150">
                Default Strictly Verified
              </span>
            </div>

            {/* Granular Academic Track */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400 block">Academic Track</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 relative">
                <div className="space-y-1.5 relative">
                  <label className="text-[10px] font-bold text-zinc-500">Grade Level</label>
                  <button 
                    onClick={() => {
                      setIsGradeDropdownOpen(!isGradeDropdownOpen);
                      setIsTrackDropdownOpen(false);
                    }}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 font-sans"
                  >
                    <span className="truncate pr-2">{gradeLevel}</span>
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>

                  <AnimatePresence>
                    {isGradeDropdownOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 w-48 sm:w-full mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden font-sans"
                      >
                        <div className="max-h-48 overflow-y-auto overscroll-contain py-1">
                          {[
                            '9th Grade (Freshman)', '10th Grade (Sophomore)', 
                            '11th Grade (Junior)', '12th Grade (Senior)', 
                            'College Freshman', 'College Sophomore', 
                            'College Junior', 'College Senior'
                          ].map((grade) => (
                            <div 
                              key={grade}
                              onClick={() => {
                                setGradeLevel(grade);
                                safeSetItem('academic_grade', grade);
                                setIsGradeDropdownOpen(false);
                                triggerVibration(10);
                              }}
                              className={`px-3 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${gradeLevel === grade ? 'bg-zinc-50 font-bold text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-medium'}`}
                            >
                              <span>{grade}</span>
                              {gradeLevel === grade && <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <div className="space-y-1.5 relative">
                  <label className="text-[10px] font-bold text-zinc-500">Academic Track</label>
                  <button 
                    onClick={() => {
                      setIsTrackDropdownOpen(!isTrackDropdownOpen);
                      setIsGradeDropdownOpen(false);
                    }}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 font-sans"
                  >
                    <span className="truncate pr-2">{streamMajor}</span>
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>

                  <AnimatePresence>
                    {isTrackDropdownOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 w-48 sm:w-full mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden font-sans"
                      >
                        <div className="max-h-48 overflow-y-auto overscroll-contain py-1">
                          {[
                            'STEM / Engineering', 'Pre-Med / AP Sciences', 
                            'Business / Economics', 'Humanities / Liberal Arts', 
                            'Computer Science'
                          ].map((track) => (
                            <div 
                              key={track}
                              onClick={() => {
                                setStreamMajor(track);
                                safeSetItem('academic_stream', track);
                                setIsTrackDropdownOpen(false);
                                triggerVibration(10);
                              }}
                              className={`px-3 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${streamMajor === track ? 'bg-zinc-50 font-bold text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-medium'}`}
                            >
                              <span>{track}</span>
                              {streamMajor === track && <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Mastery Radar Chart */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-zinc-400" /> Skill Mastery
            </h3>
            
            <div className="w-full h-48 -mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                  { subject: 'Math', A: 85, fullMark: 100 },
                  { subject: 'Physics', A: 70, fullMark: 100 },
                  { subject: 'Chemistry', A: 90, fullMark: 100 },
                  { subject: 'Biology', A: 65, fullMark: 100 },
                  { subject: 'English', A: 80, fullMark: 100 },
                ]}>
                  <PolarGrid stroke="#e4e4e7" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Mastery" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            
            <p className="text-[10px] text-zinc-400 font-medium text-center mt-2">
              AI-generated mapping based on your recent quiz scores.
            </p>
          </div>

          {/* Learning Preferences */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-zinc-200 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-zinc-400" /> Accessibility & Focus
            </h3>
            
            {/* Visual Learner Mode Toggle */}
            <div 
              onClick={() => {
                triggerVibration(10);
                setVisualLearner(!visualLearner);
              }}
              className="flex justify-between items-center bg-zinc-50 border border-zinc-100 rounded-2xl p-4 cursor-pointer hover:bg-zinc-100/50 transition-colors"
            >
              <div>
                <span className="text-xs font-black text-zinc-800 block">Visual Learner Mode</span>
                <span className="text-[9px] font-bold text-zinc-400">Enhance diagrams and color-code notes</span>
              </div>
              <div className={`w-10 h-6 ${visualLearner ? 'bg-purple-500' : 'bg-zinc-200'} rounded-full relative shadow-inner transition-colors shrink-0`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${visualLearner ? 'right-1' : 'left-1'}`} />
              </div>
            </div>

            {/* Deep Focus Mode Toggle */}
            <div 
              onClick={() => {
                triggerVibration(10);
                setDeepFocus(!deepFocus);
              }}
              className="flex justify-between items-center bg-zinc-50 border border-zinc-100 rounded-2xl p-4 cursor-pointer hover:bg-zinc-100/50 transition-colors"
            >
              <div>
                <span className="text-xs font-black text-zinc-800 block">Deep Focus Mode</span>
                <span className="text-[9px] font-bold text-zinc-400">Minimize distractions & hide gamification</span>
              </div>
              <div className={`w-10 h-6 ${deepFocus ? 'bg-purple-500' : 'bg-zinc-200'} rounded-full relative shadow-inner transition-colors shrink-0`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${deepFocus ? 'right-1' : 'left-1'}`} />
              </div>
            </div>
          </div>

          {/* Student Stats Cards (Bento Style) */}
          {!deepFocus && (
          <div className="grid grid-cols-2 gap-4">
            {/* Coins Balance Card / PRO Badge */}
            {isVip ? (
              <div className="bg-gradient-to-br from-amber-400 to-orange-600 rounded-[2.25rem] p-5 border border-amber-300 shadow-lg relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white border border-white/30 backdrop-blur-md">
                    <Crown className="w-4 h-4 fill-white" />
                  </div>
                  <span className="text-[9px] uppercase font-black tracking-wider text-white/90">Subscription</span>
                </div>
                <div className="relative z-10">
                  <p className="text-xl font-black text-white leading-none">PRO Member</p>
                  <p className="text-[9px] text-white/80 font-bold mt-1">Unlimited Access Active</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2.25rem] p-5 border border-zinc-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100">
                    <Trophy className="w-4 h-4 fill-amber-100" />
                  </div>
                  <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400">Coins</span>
                </div>
                <div>
                  <p className="text-xl font-black text-zinc-850 leading-none">{coinsBalance}</p>
                  <p className="text-[9px] text-zinc-400 font-bold mt-1">Available Study Coins</p>
                </div>
              </div>
            )}

            {/* Study Streak Card */}
            <div className="bg-white rounded-[2.25rem] p-5 border border-zinc-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 border border-orange-100">
                  <Flame className="w-4 h-4 fill-orange-100" />
                </div>
                <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400 font-bold">Streak</span>
              </div>
              <div>
                <p className="text-xl font-black text-zinc-850 leading-none">{studyStreak} Days</p>
                <p className="text-[9px] text-zinc-400 font-bold mt-1">Daily App Check-In</p>
              </div>
            </div>
          </div>
          )}

          {/* Quick Info Box */}
          <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[10px] font-medium text-blue-700 leading-relaxed">
              HelpYou AI customizes solutions, vocabulary, and tutor responses dynamically based on your selected Study Level (Middle School, High School, or College). Change your level anytime!
            </p>
          </div>
        </div>
      </div>

      {/* Slide-over Panel for App Settings */}
      <AnimatePresence>
        {showSettings && (
          <div className="absolute inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm">
            {/* Backdrop Click Close */}
            <div className="absolute inset-0 bg-transparent" onClick={() => setShowSettings(false)} />

            {/* Slider Container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-sm h-full bg-[#FAF9F6] border-l border-zinc-200 flex flex-col shadow-2xl z-10 overflow-hidden"
            >
              {/* Settings Header */}
              <header className="px-6 py-5 bg-white border-b border-zinc-200/60 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-black text-zinc-800 flex items-center gap-2">
                  <span>⚙️</span> App Settings
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>

              {/* Settings Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
                
                {/* VIP CARD INSIDE SETTINGS */}
                {isVip ? (
                  <div className="bg-gradient-to-tr from-yellow-500 via-amber-500 to-orange-500 rounded-3xl p-4.5 text-white shadow-sm border border-amber-400 relative overflow-hidden">
                    <div className="absolute right-[-15px] top-[-15px] opacity-10">
                      <Crown className="w-20 h-20 rotate-12" />
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <div>
                        <span className="bg-white/20 text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full text-white">
                          Active Plan
                        </span>
                        <h4 className="text-sm font-black mt-1 flex items-center gap-1">
                          HelpYou AI Pro <Crown className="w-3 h-3 text-yellow-200 fill-yellow-200" />
                        </h4>
                        <p className="text-[9px] text-white/80 font-bold leading-normal mt-0.5">Unlimited scans & speech</p>
                      </div>
                      <button 
                        onClick={() => {
                          triggerVibration(15);
                          setActiveModal('manage_sub');
                        }}
                        className="bg-white text-amber-700 hover:bg-zinc-50 px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm transition-all active:scale-95 shrink-0"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border-2 border-dashed border-amber-300 rounded-3xl p-4.5 text-zinc-800 shadow-sm flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shrink-0">
                        <Crown className="w-4 h-4 fill-amber-100" />
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black text-zinc-900 leading-tight">HelpYou AI Free</h4>
                        <p className="text-[9px] text-zinc-400 font-bold mt-0.5">Upgrade for unlimited tools</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        triggerVibration([20, 40]);
                        setShowSettings(false);
                        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "PRO Benefits" } }));
                      }}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black text-[10px] py-2 px-3 rounded-xl shadow-md active:scale-95 transition-all shrink-0"
                    >
                      Pro 👑
                    </button>
                  </div>
                )}

                {/* APP CONFIGURATION */}
                <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                    <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-extrabold text-[10px] text-zinc-500 uppercase tracking-wide">Preferences</span>
                  </div>
                  
                  {/* Save History Toggle */}
                  <div 
                    onClick={() => {
                      triggerVibration(10);
                      setSaveHistory(!saveHistory);
                      showToast(saveHistory ? "🗑️ History disabled" : "💾 History enabled");
                    }}
                    className="p-4 flex justify-between items-center bg-white cursor-pointer hover:bg-zinc-50/30 transition-colors"
                  >
                    <span className="text-xs font-bold text-zinc-650">Save History</span>
                    <div className={`w-9 h-5 ${saveHistory ? 'bg-emerald-500' : 'bg-zinc-200'} rounded-full relative cursor-pointer shadow-inner transition-colors`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${saveHistory ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                  </div>

                  {/* Dark Mode Toggle */}
                  <div 
                    onClick={() => {
                      triggerVibration(10);
                      onToggleDarkMode();
                      showToast(!isDarkMode ? "🌙 Dark Mode enabled" : "☀️ Light Mode enabled");
                    }}
                    className="p-4 flex justify-between items-center border-t border-zinc-100 bg-white cursor-pointer hover:bg-zinc-50/30 transition-colors"
                  >
                    <span className="text-xs font-bold text-zinc-650">Dark Mode</span>
                    <div className={`w-9 h-5 ${isDarkMode ? 'bg-emerald-500' : 'bg-zinc-200'} rounded-full relative cursor-pointer shadow-inner transition-colors`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${isDarkMode ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                </div>

                {/* SECURITY (if logged in via password) */}
                {user && user.providerData.some(p => p.providerId === 'password') && (
                  <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                      <Shield className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-extrabold text-[10px] text-zinc-500 uppercase tracking-wide">Security</span>
                    </div>
                    
                    <button 
                      onClick={() => { triggerVibration(15); setActiveModal('password'); }}
                      className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-none transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                        <Lock className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Change Password</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </button>

                    <button 
                      onClick={() => { triggerVibration(15); setActiveModal('email'); }}
                      className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                        <Mail className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Update Email</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>
                )}

                {/* Account Info for Social Users */}
                {user && !user.providerData.some(p => p.providerId === 'password') && (
                  <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm p-5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                      <Shield className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-zinc-800">Verified Social Account</h4>
                      <p className="text-[10px] font-bold text-zinc-400">Security is managed via {user.providerData[0]?.providerId === 'google.com' ? 'Google' : 'your provider'}.</p>
                    </div>
                  </div>
                )}

                {/* SUPPORT & LEGAL */}
                <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-extrabold text-[10px] text-zinc-500 uppercase tracking-wide">Support & Legal</span>
                  </div>
                  
                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      window.location.href = 'mailto:helpyou.ai.support@gmail.com?subject=HelpYou%20AI%20App%20-%20Support%20Request';
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-none transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Help & Support</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      window.location.href = 'market://details?id=com.yourcompany.helpyouai';
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <Star className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Rate HelpYou AI</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      window.location.href = 'mailto:helpyou.ai.support@gmail.com?subject=HelpYou%20AI%20App%20-%20Bug%20Report&body=Hi%20HelpYou%20AI%20Team%2C%20I%20found%20a%20bug.%0ADevice%20Model%3A%20%0AOS%20Version%3A%20%0AIssue%20Description%3A%20';
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <Bug className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Report a Bug</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      setActiveModal('privacy');
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <Shield className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Privacy Policy</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>

                  <button 
                    onClick={() => { 
                      triggerVibration(15); 
                      setActiveModal('terms');
                    }}
                    className="w-full p-4 flex justify-between items-center bg-white hover:bg-zinc-50/30 border-t border-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Terms of Service</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>

                {/* LOG OUT / ACTIONS */}
                <div className="space-y-3 pt-3">
                  {user ? (
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-3.5 rounded-2xl font-black shadow-md shadow-red-500/10 active:scale-99 transition-all cursor-pointer text-xs uppercase tracking-wide"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out</span>
                    </button>
                  ) : onOpenLogin && (
                    <button 
                      onClick={() => {
                        triggerVibration(15);
                        setShowSettings(false);
                        onOpenLogin();
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-3.5 rounded-2xl font-black shadow-md shadow-purple-500/10 active:scale-99 transition-all cursor-pointer text-xs uppercase tracking-wide"
                    >
                      <span>🔐 Log In / Register</span>
                    </button>
                  )}

                  {user && (
                    <button 
                      onClick={() => { triggerVibration(25); setActiveModal('delete_account'); }}
                      className="w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 text-zinc-500 hover:text-rose-600 py-3 rounded-2xl font-bold border-2 border-zinc-200/80 active:scale-99 transition-all cursor-pointer text-[10px] tracking-wide"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Account & Data</span>
                    </button>
                  )}
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAILED MODAL OVERLAYS */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`bg-white rounded-[2.5rem] border border-zinc-200 w-full overflow-hidden p-6 shadow-2xl relative flex flex-col ${activeModal === 'privacy' || activeModal === 'terms' ? 'max-w-md' : 'max-w-sm'}`}
            >
              {/* Modal Close Button */}
              <button 
                onClick={() => { triggerVibration(10); setActiveModal(null); }}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 hover:text-zinc-800 flex items-center justify-center cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Modal Header */}
              <div className="mb-5 pr-6">
                <h3 className="text-base font-black tracking-tight text-zinc-900 flex items-center gap-2">
                  {activeModal === 'password' && (
                    <><Lock className="w-4 h-4 text-purple-600" /> <span>Change Password</span></>
                  )}
                  {activeModal === 'email' && (
                    <><Mail className="w-4 h-4 text-purple-600" /> <span>Update Email</span></>
                  )}
                  {activeModal === 'delete_account' && (
                    <><AlertTriangle className="w-4 h-4 text-rose-600" /> <span className="text-rose-600">Delete Account</span></>
                  )}
                  {activeModal === 'manage_sub' && (
                    <><Crown className="w-4 h-4 text-amber-500" /> <span>Manage Plan</span></>
                  )}
                  {activeModal === 'privacy' && (
                    <><Shield className="w-4 h-4 text-purple-600" /> <span>Privacy Policy</span></>
                  )}
                  {activeModal === 'terms' && (
                    <><FileText className="w-4 h-4 text-purple-600" /> <span>Terms of Service</span></>
                  )}
                </h3>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto max-h-[70vh]">
                
                {/* 1. Change Password Form */}
                {activeModal === 'password' && (
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <p className="text-[10px] text-zinc-400 font-bold leading-relaxed mb-1">
                      Update your login credential. Your new password must be at least 6 characters.
                    </p>
                    <div className="space-y-1 relative">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Current Password</label>
                      <div className="relative">
                        <input 
                          type={showPass1 ? "text" : "password"} 
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPass1(!showPass1)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600">
                          {showPass1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 relative">
                      <label className="text-[10px] font-black uppercase text-zinc-500">New Password</label>
                      <div className="relative">
                        <input 
                          type={showPass2 ? "text" : "password"} 
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPass2(!showPass2)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600">
                          {showPass2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-zinc-950 text-white font-extrabold text-xs py-3.5 rounded-2xl hover:bg-zinc-900 transition-all cursor-pointer mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <span>Save New Password</span>
                      )}
                    </button>
                  </form>
                )}

                {/* 2. Update Email Form */}
                {activeModal === 'email' && (
                  <form onSubmit={handleEmailChange} className="space-y-4">
                    <p className="text-[10px] text-zinc-400 font-bold leading-relaxed mb-1">
                      Enter your new email address. A confirmation link will be sent to the new email address for verification.
                    </p>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-zinc-500">New Email Address</label>
                      <input 
                        type="email" 
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-1 relative">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Current Password</label>
                      <div className="relative">
                        <input 
                          type={showPass1 ? "text" : "password"} 
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-3 text-xs font-semibold focus:outline-none focus:border-purple-500"
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPass1(!showPass1)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600">
                          {showPass1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-zinc-950 text-white font-extrabold text-xs py-3.5 rounded-2xl hover:bg-zinc-900 transition-all cursor-pointer mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <span>Send Verification</span>
                      )}
                    </button>
                  </form>
                )}

                {/* 8. Delete Account Confirmation */}
                {activeModal === 'delete_account' && (
                  <div className="space-y-4 text-center">
                    <div className="w-12 h-12 bg-rose-50 border border-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <AlertTriangle className="w-6 h-6 animate-pulse" />
                    </div>
                    <p className="text-xs text-zinc-600 font-bold leading-relaxed">
                      Are you sure you want to delete your HelpYou AI account? This action is permanent and will erase all your history, notes, and coins.
                    </p>
                    <div className="flex gap-2.5 pt-3">
                      <button 
                        onClick={() => { triggerVibration(10); setActiveModal(null); }}
                        className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs py-3 rounded-2xl cursor-pointer transition-all border border-zinc-200"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleDeleteAccount}
                        className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs py-3 rounded-2xl cursor-pointer transition-all shadow-md shadow-rose-500/10"
                      >
                        Yes, Delete
                      </button>
                    </div>
                  </div>
                )}

                {/* 9. Manage Plan */}
                {activeModal === 'manage_sub' && (
                  <div className="space-y-4 text-center py-2">
                    <div className="w-14 h-14 bg-amber-50 border border-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-sm mb-2">
                      <Crown className="w-7 h-7 fill-amber-100" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-zinc-800">Pro Member Plan</h4>
                      <p className="text-[10px] text-zinc-400 font-bold mt-0.5">Billing via App Store / HelpYou AI Portal</p>
                    </div>
                    <p className="text-xs text-zinc-500 font-medium leading-relaxed bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                      Your premium subscription is currently active! Enjoy unlimited tools, speech generation, and interactive learning.
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                      <button 
                        onClick={() => {
                          triggerVibration(15);
                          setIsVip(false);
                          showToast("Subscription changed back to Free.");
                          setActiveModal(null);
                        }}
                        className="w-full bg-red-550 hover:bg-red-650 text-white font-black text-xs py-3.5 rounded-2xl cursor-pointer transition-all"
                      >
                        Cancel Pro Subscription
                      </button>
                      <button 
                        onClick={() => { triggerVibration(10); setActiveModal(null); }}
                        className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs py-3.5 rounded-2xl cursor-pointer transition-all border border-zinc-200"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* 10. Privacy Policy */}
                {activeModal === 'privacy' && (
                  <div className="space-y-5 text-left py-1 text-zinc-700">
                    <p className="text-xs font-semibold leading-relaxed text-zinc-500">
                      At HelpYou AI, we are committed to safeguarding your personal information and ensuring full transparency. This Privacy Policy outlines our comprehensive data handling practices.
                    </p>

                    <div className="space-y-4">
                      {/* Section 1: Data We Collect */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📊 1. Data We Collect
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Account Data:</span> We collect your email address and basic profile information solely for authentication, account management, and synchronization across devices.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Image & Camera Data:</span> When you use the device camera to scan homework problems or upload images for AI analysis, these images are processed in real-time. They are immediately and permanently deleted from our servers once the results are generated. We do not permanently store, log, or share user images.
                          </li>
                        </ul>
                      </div>

                      {/* Section 2: Third-Party Services & Backend AI */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🤖 2. Third-Party Services & Backend AI
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Artificial Intelligence:</span> HelpYou AI utilizes high-performance Google Gemini AI APIs to generate step-by-step answers, process image data, and deliver dynamic tutoring. Prompts and images sent to the AI service do not contain personally identifiable information (PII) and are never used to train public models.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Payment Processors:</span> We utilize trusted payment gateways (such as Google Play Billing and Stripe) to securely process premium Pro Subscriptions. We do not store or have access to your credit card details or sensitive billing credentials.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Database:</span> Secure cloud backend services are used to safely store persistent user data, such as your customized notes, quiz history, coins, and profile preferences.
                          </li>
                        </ul>
                      </div>

                      {/* Section 3: Advertising & Analytics */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📢 3. Advertising & Analytics
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Advertisers:</span> We partner with third-party advertising providers (such as Google AdMob) to serve targeted ads to users on the free plan. These companies may process anonymous metadata—including your Device Advertising ID, device model, and IP address—to display personalized, high-yield advertisements matching your academic interests.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Analytics:</span> Basic anonymous app usage statistics are gathered to identify software issues, track layout efficiency, and constantly refine the HelpYou AI experience.
                          </li>
                        </ul>
                      </div>

                      {/* Section 4: Data Deletion & User Rights */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🗑️ 4. Data Deletion & Your Rights
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          You maintain full ownership of your data. You have the right to request complete account deletion at any time. To trigger manual data removal, you can click "Delete Account" in settings or contact our support desk directly at:
                        </p>
                        <p className="text-[11px] font-black text-purple-600 pl-4 mt-1">
                          helpyou.ai.support@gmail.com
                        </p>
                      </div>

                      {/* Section 5: Data Security */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🔒 5. Commitment to Security
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          We employ industry-leading physical, technical, and administrative controls to protect your data. All communication is routed over secure HTTPS channels, and our cloud databases are protected by strict access control rules to keep your virtual study space safe and private.
                        </p>
                      </div>

                      {/* Section 6: European Union Compliance (GDPR) */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🇪🇺 6. European Union Compliance (GDPR)
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          For users residing in the European Economic Area (EEA), we comply fully with the General Data Protection Regulation (GDPR). Our legal bases for processing your data include:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li>Fulfilling our contractual obligations to provide educational tools and virtual tutoring services.</li>
                          <li>Managing and validating your premium Pro Subscriptions.</li>
                          <li>Fulfilling legitimate business interests, such as optimizing app performance, fixing bugs, and providing support.</li>
                        </ul>
                        <p className="text-[11px] leading-relaxed mt-1.5 text-zinc-600 pl-4">
                          Under the GDPR, you have the following rights which can be exercised by emailing our support desk:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li><span className="font-semibold text-zinc-800">Right of Access:</span> Request a complete export of your personal data.</li>
                          <li><span className="font-semibold text-zinc-800">Right to Rectification:</span> Request correction of any inaccurate profile information.</li>
                          <li><span className="font-semibold text-zinc-800">Right to Erasure (Forget Me):</span> Request deletion of all stored account records.</li>
                          <li><span className="font-semibold text-zinc-800">Right to Data Portability:</span> Request transfer of your data to another provider in a structured, machine-readable format.</li>
                        </ul>
                      </div>

                      {/* Section 7: California Privacy Rights (CCPA) */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🐻 7. California Privacy Rights (CCPA)
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          In accordance with the California Consumer Privacy Act (CCPA), we provide California residents with specific disclosures regarding their personal information:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li>We do <span className="font-extrabold text-zinc-900">NOT</span> sell, rent, or trade your personal data to any third parties.</li>
                          <li>You have the right to request disclosure of the categories and specific pieces of personal information we have collected.</li>
                          <li>You have the right to request deletion of your data and are guaranteed non-discriminatory treatment, meaning we will never deny services, alter quality levels, or charge different prices for exercising your CCPA rights.</li>
                        </ul>
                      </div>

                      {/* Section 8: Children's Privacy (COPPA) */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          👶 8. Children's Privacy (COPPA)
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          Our services are strictly not intended for children under the age of 13. In accordance with the Children's Online Privacy Protection Act (COPPA), we do not knowingly or intentionally collect personal information from individuals under 13. If we discover that any user under the age of 13 has registered or submitted personal data, we will immediately and permanently purge those records from our servers.
                        </p>
                      </div>

                      {/* Section 9: Cookies & Tracking Technologies */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🍪 9. Cookies & Tracking Technologies
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          To deliver a high-quality user experience, HelpYou AI utilizes multiple categories of cookies and identifiers:
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li><span className="font-semibold text-zinc-800">Essential Cookies:</span> Necessary for securing authentication sessions and accessing paid capabilities.</li>
                          <li><span className="font-semibold text-zinc-800">Functionality Cookies:</span> Remember your educational track, grade preferences, study notes, and dark mode state.</li>
                          <li><span className="font-semibold text-zinc-800">Statistics & Analytics:</span> Anonymous session tracking to log application bugs and speed bottlenecks.</li>
                          <li><span className="font-semibold text-zinc-800">Advertising Cookies:</span> Leveraged by third-party advertisers (such as Google AdMob) to serve targeted ads matching your educational interests based on app activity.</li>
                        </ul>
                        <p className="text-[11px] leading-relaxed mt-1.5 text-zinc-600 pl-4">
                          You can easily restrict, disable, or manage cookies and advertising identifiers through your browser configuration, device settings, or by resetting your device's Advertising ID.
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => { triggerVibration(10); setActiveModal(null); }}
                      className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold text-xs py-3.5 rounded-2xl cursor-pointer transition-all mt-6 shadow-md"
                    >
                      I Understand & Agree
                    </button>
                  </div>
                )}

                {/* 11. Terms of Service */}
                {activeModal === 'terms' && (
                  <div className="space-y-5 text-left py-1 text-zinc-700">
                    <p className="text-xs font-semibold leading-relaxed text-zinc-500">
                      Welcome to HelpYou AI. Please review these Terms of Use carefully before using our application. By accessing our services, you agree to be fully bound by these terms.
                    </p>

                    <div className="space-y-4">
                      {/* Section 1: Acceptance & Eligibility */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📝 1. Acceptance & Eligibility
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Binding Agreement:</span> By installing, registering, or using any part of the HelpYou AI application, you acknowledge that you have read, understood, and agree to be bound by these Terms of Use.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Age Restrictions:</span> HelpYou AI is strictly designed and permitted only for individuals aged 13 or older. We do not knowingly permit younger children to access our virtual learning systems.
                          </li>
                        </ul>
                      </div>

                      {/* Section 2: AI-Generated Content Disclaimer */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          ⚠️ 2. AI-Generated Content Disclaimer
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          HelpYou AI harnesses advanced artificial intelligence, including Google Gemini AI APIs, to deliver instant step-by-step problem breakdowns, quizzes, and real-time study assistance.
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            All tutoring content, answers, and study notes are generated dynamically and provided on an <span className="font-black text-zinc-800">"as is" and "as available" basis</span> for personal learning and informational purposes only.
                          </li>
                          <li>
                            While our underlying models are highly optimized, we do not guarantee 100% academic accuracy, thoroughness, or completeness. Users accept all generated explanations at their own risk.
                          </li>
                        </ul>
                      </div>

                      {/* Section 3: Subscriptions, Billing & Cancellation */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          💎 3. Subscriptions, Billing & Cancellation
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>
                            <span className="font-bold text-zinc-800">Auto-Renewal:</span> Premium Pro Subscriptions (available in Monthly and Yearly cycles) automatically renew at the prevailing tier price unless cancelled.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Cancellation Policy:</span> To avoid future charges, you must cancel your subscription via your device's respective distribution store (Google Play Billing or Apple App Store Subscription Settings) at least 24 hours prior to the next scheduled renewal date.
                          </li>
                          <li>
                            <span className="font-bold text-zinc-800">Chargeback Policy:</span> We enforce a zero-tolerance policy against fraudulent disputes. Initiation of unauthorized chargebacks or payment disputes will result in the immediate and permanent termination of your HelpYou AI account and the deletion of your historical study data.
                          </li>
                        </ul>
                      </div>

                      {/* Section 4: Acceptable Use & Abuse Prevention */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🛡️ 4. Acceptable Use & Abuse Prevention
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          Subject to these terms, you are granted a non-exclusive, non-transferable, and revocable license to access our educational services for personal, non-commercial use.
                        </p>
                        <ul className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-8 space-y-1.5 list-disc">
                          <li>You are strictly prohibited from reverse engineering, decompiling, scraping, or attempting to extract the underlying source code of HelpYou AI.</li>
                          <li>You agree not to use automated bots, custom scripts, or high-volume scrapers to query our backend AI, which places an unfair burden on platform resources and shared API rate limits.</li>
                          <li>Any detected infrastructure abuse, scanner spamming, or server overloading will result in immediate suspension without refund.</li>
                        </ul>
                      </div>

                      {/* Section 5: Proprietary Rights */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          👑 5. Proprietary Rights
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          The HelpYou AI brand name, custom logos, visual designs, scanner interfaces, and proprietary tutoring algorithms are the sole property of the Company and are fully protected under global copyright, trademark, and intellectual property laws.
                        </p>
                      </div>

                      {/* Section 6: Limitation of Liability */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🛑 6. Limitation of Liability
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>To the maximum extent permitted by applicable law, HelpYou AI and its creators shall not be liable for any indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, loss of study progress, academic grades, or data) arising from the use of or inability to use the service.</li>
                          <li>The total aggregate liability of the company for any and all claims arising under or related to these Terms shall not exceed the total amount actually paid by you to HelpYou AI in the three (3) months preceding the claim, or $100 USD, whichever is greater.</li>
                        </ul>
                      </div>

                      {/* Section 7: Indemnification */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🛡️ 7. Indemnification
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          You agree to indemnify, defend, and hold harmless HelpYou AI, its creator, affiliates, and partners from and against any and all claims, liabilities, damages, losses, or expenses (including reasonable attorneys' fees) arising out of or in any way connected with your violation of these Terms or your misuse of the Service.
                        </p>
                      </div>

                      {/* Section 8: Termination */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          🚫 8. Termination
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          We reserve the right, at our sole discretion, to suspend or terminate your account and revoke your access to the Service at any time, with or without notice, and without any liability, especially in cases of structural abuse, payment fraudulent chargebacks, or violations of these Terms.
                        </p>
                      </div>

                      {/* Section 9: Governing Law & Dispute Resolution */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          ⚖️ 9. Governing Law & Dispute Resolution
                        </h4>
                        <ul className="text-[11px] leading-relaxed mt-2 text-zinc-600 pl-4 space-y-1.5 list-disc">
                          <li>These Terms and any dispute or claim arising out of or in connection with them shall be governed by and construed in accordance with the laws of India.</li>
                          <li>Any legal actions, suits, or judicial proceedings arising under or related to these Terms shall be resolved exclusively in the competent courts located in India.</li>
                        </ul>
                      </div>

                      {/* Section 10: Contact Us */}
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide">
                          📬 10. Contact Us
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 text-zinc-600 pl-4">
                          If you have any questions, concerns, or legal queries regarding these Terms of Use, please reach out to our legal and support helpdesk directly at:
                        </p>
                        <p className="text-[11px] font-black text-purple-600 pl-4 mt-1">
                          helpyou.ai.support@gmail.com
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => { triggerVibration(10); setActiveModal(null); }}
                      className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold text-xs py-3.5 rounded-2xl cursor-pointer transition-all mt-6 shadow-md"
                    >
                      I Accept Terms & Conditions
                    </button>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
