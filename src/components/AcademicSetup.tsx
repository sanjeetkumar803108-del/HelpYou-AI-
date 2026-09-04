import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, GraduationCap, Rocket, HeartPulse, BarChart3, Palette, Cpu, ArrowLeft, ArrowRight, Globe } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeSetItem } from '../utils/storage';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface AcademicSetupProps {
  userId: string;
  onComplete: () => void;
}

const GRADES = [
  { id: '9th Grade (Freshman)', label: '9th Grade', desc: 'Freshman High School', isCollege: false },
  { id: '10th Grade (Sophomore)', label: '10th Grade', desc: 'Sophomore High School', isCollege: false },
  { id: '11th Grade (Junior)', label: '11th Grade', desc: 'Junior High School', isCollege: false },
  { id: '12th Grade (Senior)', label: '12th Grade', desc: 'Senior High School', isCollege: false },
];

export const COUNTRIES = [
  { id: 'USA', name: 'United States', flag: '🇺🇸', regionSystem: 'USA' },
  { id: 'UK', name: 'United Kingdom', flag: '🇬🇧', regionSystem: 'UK' },
  { id: 'CA', name: 'Canada', flag: '🇨🇦', regionSystem: 'CA' },
  { id: 'AU', name: 'Australia', flag: '🇦🇺', regionSystem: 'AU' },
  { id: 'Global', name: 'Others / International', flag: '🌍', regionSystem: 'Global' },
];

// Dynamic tracks dictionary mapped by Country Name
export const REGIONAL_TRACKS: Record<string, Array<{ id: string; title: string; subtitle: string; icon: React.ReactNode; color: string }>> = {
  'United States': [
    { 
      id: 'STEM / Engineering', 
      title: 'STEM & Engineering', 
      subtitle: 'AP Calculus AB/BC, AP Physics (1/2/C) & Advanced Math', 
      icon: <Rocket className="w-5 h-5" />, 
      color: 'from-purple-500 to-indigo-500' 
    },
    { 
      id: 'Pre-Med / AP Sciences', 
      title: 'Biomedical & Pre-Health', 
      subtitle: 'AP Biology, AP Chemistry, Anatomy & Life Sciences', 
      icon: <HeartPulse className="w-5 h-5" />, 
      color: 'from-pink-500 to-rose-500' 
    },
    { 
      id: 'Business / Economics', 
      title: 'Business & Economics', 
      subtitle: 'AP Macro/Microeconomics, AP Statistics & Finance', 
      icon: <BarChart3 className="w-5 h-5" />, 
      color: 'from-amber-500 to-orange-500' 
    },
    { 
      id: 'Humanities / Liberal Arts', 
      title: 'Humanities & Pre-Law', 
      subtitle: 'AP US History, AP Gov, AP Psychology & Lit', 
      icon: <Palette className="w-5 h-5" />, 
      color: 'from-emerald-500 to-teal-500' 
    },
    { 
      id: 'Computer Science', 
      title: 'Computer Science & AI', 
      subtitle: 'AP CS A (Java), AP CS Principles & Cybersecurity', 
      icon: <Cpu className="w-5 h-5" />, 
      color: 'from-blue-500 to-cyan-500' 
    },
    { 
      id: 'AP Capstone / Honors', 
      title: 'AP Capstone & College Prep', 
      subtitle: 'AP Seminar, AP Research & Dual Enrollment Rigor', 
      icon: <GraduationCap className="w-5 h-5" />, 
      color: 'from-indigo-500 to-violet-500' 
    },
  ],
  'United Kingdom': [
    { id: 'STEM / Engineering', title: 'STEM & Mathematics', subtitle: 'Tailored for A-Level Maths & Physics', icon: <Rocket className="w-5 h-5" />, color: 'from-purple-500 to-indigo-500' },
    { id: 'Pre-Med / AP Sciences', title: 'Medicine & Life Sciences', subtitle: 'Tailored for A-Level Biology & Chemistry', icon: <HeartPulse className="w-5 h-5" />, color: 'from-pink-500 to-rose-500' },
    { id: 'Business / Economics', title: 'Economics & Business Studies', subtitle: 'Tailored for GCSE & A-Level Economics', icon: <BarChart3 className="w-5 h-5" />, color: 'from-amber-500 to-orange-500' },
    { id: 'Humanities / Liberal Arts', title: 'Humanities & Social Sciences', subtitle: 'Tailored for A-Level History & Literature', icon: <Palette className="w-5 h-5" />, color: 'from-emerald-500 to-teal-500' },
    { id: 'Computer Science', title: 'Computer Science & Software', subtitle: 'Tailored for GCSE & A-Level Computer Science', icon: <Cpu className="w-5 h-5" />, color: 'from-blue-500 to-cyan-500' },
  ],
  'Canada': [
    { id: 'STEM / Engineering', title: 'Engineering & Math (University Prep)', subtitle: 'Tailored for Grade 12 Calculus & Physics', icon: <Rocket className="w-5 h-5" />, color: 'from-purple-500 to-indigo-500' },
    { id: 'Pre-Med / AP Sciences', title: 'Health Sciences (University Prep)', subtitle: 'Tailored for Grade 12 Bio & Chem', icon: <HeartPulse className="w-5 h-5" />, color: 'from-pink-500 to-rose-500' },
    { id: 'Business / Economics', title: 'Commerce & Economics Prep', subtitle: 'Tailored for Grade 12 Business & Financial Math', icon: <BarChart3 className="w-5 h-5" />, color: 'from-amber-500 to-orange-500' },
    { id: 'Humanities / Liberal Arts', title: 'Humanities & Social Studies', subtitle: 'Tailored for Grade 12 Canadian History & English', icon: <Palette className="w-5 h-5" />, color: 'from-emerald-500 to-teal-500' },
    { id: 'Computer Science', title: 'Computer Science & Tech', subtitle: 'Tailored for Grade 12 Computer & Data Science', icon: <Cpu className="w-5 h-5" />, color: 'from-blue-500 to-cyan-500' },
  ],
  'Australia': [
    { id: 'STEM / Engineering', title: 'Engineering & Mathematical Sciences', subtitle: 'Tailored for HSC Specialist Maths & Physics', icon: <Rocket className="w-5 h-5" />, color: 'from-purple-500 to-indigo-500' },
    { id: 'Pre-Med / AP Sciences', title: 'Biomedical & Medical Sciences', subtitle: 'Tailored for HSC / VCE Biology & Chemistry', icon: <HeartPulse className="w-5 h-5" />, color: 'from-pink-500 to-rose-500' },
    { id: 'Business / Economics', title: 'Commerce & Financial Studies', subtitle: 'Tailored for HSC / VCE Economics & Commerce', icon: <BarChart3 className="w-5 h-5" />, color: 'from-amber-500 to-orange-500' },
    { id: 'Humanities / Liberal Arts', title: 'Humanities & Legal Studies', subtitle: 'Tailored for HSC Modern History & Legal Studies', icon: <Palette className="w-5 h-5" />, color: 'from-emerald-500 to-teal-500' },
    { id: 'Computer Science', title: 'Information & Software Technology', subtitle: 'Tailored for HSC Software Design & Development', icon: <Cpu className="w-5 h-5" />, color: 'from-blue-500 to-cyan-500' },
  ],
  'Others / International': [
    { id: 'STEM / Engineering', title: 'STEM & Engineering', subtitle: 'Tailored for IB Physics & Advanced Mathematics', icon: <Rocket className="w-5 h-5" />, color: 'from-purple-500 to-indigo-500' },
    { id: 'Pre-Med / AP Sciences', title: 'Medicine & Life Sciences', subtitle: 'Tailored for IB Biology, Chemistry & Health Sciences', icon: <HeartPulse className="w-5 h-5" />, color: 'from-pink-500 to-rose-500' },
    { id: 'Business / Economics', title: 'Business, Economics & Finance', subtitle: 'Tailored for Global Economics & Business Management', icon: <BarChart3 className="w-5 h-5" />, color: 'from-amber-500 to-orange-500' },
    { id: 'Humanities / Liberal Arts', title: 'Humanities & Liberal Arts', subtitle: 'Tailored for Global History, Literature & Social Sciences', icon: <Palette className="w-5 h-5" />, color: 'from-emerald-500 to-teal-500' },
    { id: 'Computer Science', title: 'Computer Science & Software', subtitle: 'Tailored for IB Computer Science HL/SL', icon: <Cpu className="w-5 h-5" />, color: 'from-blue-500 to-cyan-500' },
  ],
};

export default function AcademicSetup({ userId, onComplete }: AcademicSetupProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedGrade, setSelectedGrade] = useState<string>('11th Grade (Junior)');
  const [selectedCountryId, setSelectedCountryId] = useState<string>('USA');
  const [selectedStream, setSelectedStream] = useState<string>('STEM / Engineering');

  const handleNextStep = () => {
    triggerVibration(15);
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBackStep = () => {
    triggerVibration(10);
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  };

  const handleFinish = async () => {
    triggerVibration(25);
    
    const countryObj = COUNTRIES.find(c => c.id === selectedCountryId) || COUNTRIES[0];

    // Save selections locally
    safeSetItem('academic_grade', selectedGrade);
    safeSetItem('academic_stream', selectedStream);
    safeSetItem('academic_region', countryObj.regionSystem);
    safeSetItem('academic_country', countryObj.name);
    
    // Find study level based on grade (High School vs College)
    const gradeObj = GRADES.find(g => g.id === selectedGrade);
    const studyLevel = gradeObj?.isCollege ? 'College' : 'High School';
    safeSetItem('onboarding_grade', studyLevel);
    safeSetItem('onboarding_completed', 'true');

    // Save for this specific user locally
    const activeUid = userId || auth.currentUser?.uid || '';
    if (activeUid) {
      safeSetItem(`academic_grade_${activeUid}`, selectedGrade);
      safeSetItem(`academic_stream_${activeUid}`, selectedStream);
      safeSetItem(`academic_region_${activeUid}`, countryObj.regionSystem);
      safeSetItem(`academic_country_${activeUid}`, countryObj.name);
      safeSetItem(`onboarding_grade_${activeUid}`, studyLevel);
      safeSetItem(`academic_setup_completed_${activeUid}`, 'true');
      safeSetItem(`onboarding_completed_${activeUid}`, 'true');
      safeSetItem(`isOnboardingComplete_${activeUid}`, 'true');

      // Update Firestore user document with isOnboardingComplete and selections
      try {
        await setDoc(doc(db, 'users', activeUid), {
          isOnboardingComplete: true,
          isOnboardingCompleted: true,
          grade: selectedGrade,
          stream: selectedStream,
          country: countryObj.name,
          regionSystem: countryObj.regionSystem,
          academic_grade: selectedGrade,
          academic_stream: selectedStream,
          academic_country: countryObj.name,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`[AcademicSetup] Successfully updated Firestore user doc ${activeUid} with isOnboardingComplete: true`);
      } catch (dbErr) {
        console.error('[AcademicSetup] Error saving onboarding state to Firestore:', dbErr);
      }
    }

    onComplete();
  };

  return (
    <div className="absolute inset-0 z-[80] bg-white text-zinc-900 flex flex-col h-[100dvh] overflow-hidden select-none font-sans">
      {/* Decorative background light bubbles */}
      <div className="absolute top-[-5%] left-[-10%] w-72 h-72 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Progress Header */}
      <div className="w-full px-6 pt-8 pb-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-1.5">
          <GraduationCap className="w-5 h-5 text-purple-600 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-purple-600">Personalize Tutor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-100 px-2.5 py-1 rounded-full border border-zinc-150">
            Step {step} of 3
          </span>
        </div>
      </div>

      {/* Content Area with Slide Animation */}
      <div className="flex-1 px-6 flex flex-col justify-center max-w-sm mx-auto w-full min-h-0 z-10">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-grade"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-center min-h-0 py-2"
            >
              <div className="text-left mb-6 shrink-0">
                <h1 className="text-2xl font-black text-zinc-950 tracking-tight leading-tight">
                  What grade are you in?
                </h1>
                <p className="text-xs text-zinc-500 font-semibold mt-1.5 leading-relaxed">
                  We customize explanations, math solver steps, and study guides for your school or college curriculum level.
                </p>
              </div>

              {/* Scrollable Grade Grid */}
              <div className="flex-1 overflow-y-auto pr-1 -mr-1 py-1 space-y-2 max-h-[50vh]">
                {GRADES.map((grade) => {
                  const isSelected = selectedGrade === grade.id;
                  return (
                    <motion.div
                      key={grade.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        triggerVibration(10);
                        setSelectedGrade(grade.id);
                      }}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50/50 shadow-sm shadow-purple-500/5'
                          : 'border-zinc-200 bg-white hover:border-zinc-300'
                      }`}
                    >
                      <div className="text-left">
                        <p className={`text-xs font-black leading-none ${isSelected ? 'text-purple-700' : 'text-zinc-800'}`}>
                          {grade.label}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-bold mt-1">
                          {grade.desc}
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected 
                          ? 'border-purple-600 bg-purple-600 text-white' 
                          : 'border-zinc-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-country"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-center min-h-0 py-2"
            >
              <div className="text-left mb-6 shrink-0">
                <h1 className="text-2xl font-black text-zinc-950 tracking-tight leading-tight flex items-center gap-2">
                  Select your country
                </h1>
                <p className="text-xs text-zinc-500 font-semibold mt-1.5 leading-relaxed">
                  We tailor subject titles and exam naming conventions (SAT, GCSE, A-Levels, IB) to your educational system.
                </p>
              </div>

              {/* Country Selection Cards */}
              <div className="flex-1 overflow-y-auto pr-1 -mr-1 py-1 space-y-2.5 max-h-[50vh]">
                {COUNTRIES.map((country) => {
                  const isSelected = selectedCountryId === country.id;
                  return (
                    <motion.div
                      key={country.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        triggerVibration(10);
                        setSelectedCountryId(country.id);
                      }}
                      className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50/60 ring-1 ring-purple-500/20 shadow-sm'
                          : 'border-zinc-200 bg-white hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-2xl filter drop-shadow-sm select-none">{country.flag}</span>
                        <span className={`text-xs font-black ${isSelected ? 'text-purple-700' : 'text-zinc-800'}`}>
                          {country.name}
                        </span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected 
                          ? 'border-purple-600 bg-purple-600 text-white' 
                          : 'border-zinc-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step-stream"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-center min-h-0 py-2"
            >
              <div className="text-left mb-6 shrink-0">
                <h1 className="text-2xl font-black text-zinc-950 tracking-tight leading-tight">
                  Choose your study focus
                </h1>
                <p className="text-xs text-zinc-500 font-semibold mt-1.5 leading-relaxed">
                  Select your primary academic subject track. This matches your daily quizzes and memory revision cards perfectly.
                </p>
              </div>

              {/* Streams Grid */}
              <div className="flex-1 overflow-y-auto pr-1 -mr-1 py-1 space-y-2.5 max-h-[50vh]">
                {(() => {
                  const countryObj = COUNTRIES.find(c => c.id === selectedCountryId);
                  const countryName = countryObj?.name || 'United States';
                  const activeTracks = REGIONAL_TRACKS[countryName] || REGIONAL_TRACKS['Others / International'];

                  return activeTracks.map((track) => {
                    const isSelected = selectedStream === track.id || selectedStream === track.title;
                    return (
                      <motion.div
                        key={track.title}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          triggerVibration(10);
                          setSelectedStream(track.id);
                        }}
                        className={`p-4 rounded-2xl border transition-all flex items-center gap-3.5 cursor-pointer ${
                          isSelected
                            ? 'border-purple-500 bg-purple-50/50 shadow-sm shadow-purple-500/5'
                            : 'border-zinc-200 bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${track.color} text-white flex items-center justify-center shadow-md shadow-zinc-100/10`}>
                          {track.icon}
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black ${isSelected ? 'text-purple-700' : 'text-zinc-800'}`}>
                            {track.title}
                          </p>
                          <p className="text-[9px] text-zinc-400 font-bold mt-0.5">
                            {track.subtitle}
                          </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'border-purple-600 bg-purple-600 text-white' 
                            : 'border-zinc-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </motion.div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Actions Rail */}
      <div className="w-full px-6 pb-12 pt-4 flex flex-col items-center gap-4 shrink-0 z-10">
        <div className="w-full max-w-sm flex items-center gap-3">
          {step > 1 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleBackStep}
              className="px-4 py-4 bg-zinc-100 hover:bg-zinc-150 border border-zinc-200 rounded-[1.25rem] text-zinc-700 font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs">Back</span>
            </motion.button>
          )}
          
          {step < 3 ? (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleNextStep}
              className="flex-1 bg-zinc-950 hover:bg-zinc-900 text-white rounded-[1.25rem] py-4 font-black text-sm flex items-center justify-center gap-2 shadow-md border border-zinc-900 transition-all cursor-pointer"
            >
              Continue
              <ArrowRight className="w-4.5 h-4.5 text-zinc-400" />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleFinish}
              className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-[1.25rem] py-4 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 border border-purple-500/30 transition-shadow cursor-pointer"
            >
              Complete Setup
              <Check className="w-4.5 h-4.5 text-purple-200" />
            </motion.button>
          )}
        </div>
        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
          💡 You can update these anytime inside your Profile menu
        </p>
      </div>
    </div>
  );
}
