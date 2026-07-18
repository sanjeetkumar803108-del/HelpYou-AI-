import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, GraduationCap, BookOpen, Rocket, HeartPulse, BarChart3, Palette, Cpu, ArrowLeft, ArrowRight } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeSetItem } from '../utils/storage';

interface AcademicSetupProps {
  userId: string;
  onComplete: () => void;
}

const GRADES = [
  { id: '9th Grade (Freshman)', label: '9th Grade', desc: 'Freshman High School', isCollege: false },
  { id: '10th Grade (Sophomore)', label: '10th Grade', desc: 'Sophomore High School', isCollege: false },
  { id: '11th Grade (Junior)', label: '11th Grade', desc: 'Junior High School', isCollege: false },
  { id: '12th Grade (Senior)', label: '12th Grade', desc: 'Senior High School', isCollege: false },
  { id: 'College Freshman', label: 'College Year 1', desc: 'Freshman Undergrad', isCollege: true },
  { id: 'College Sophomore', label: 'College Year 2', desc: 'Sophomore Undergrad', isCollege: true },
  { id: 'College Junior', label: 'College Year 3', desc: 'Junior Undergrad', isCollege: true },
  { id: 'College Senior', label: 'College Year 4', desc: 'Senior Undergrad', isCollege: true },
];

const STREAMS = [
  { id: 'STEM / Engineering', label: 'STEM / Engineering', icon: <Rocket className="w-5 h-5" />, color: 'from-purple-500 to-indigo-500' },
  { id: 'Pre-Med / AP Sciences', label: 'Pre-Med / AP Sciences', icon: <HeartPulse className="w-5 h-5" />, color: 'from-pink-500 to-rose-500' },
  { id: 'Business / Economics', label: 'Business / Economics', icon: <BarChart3 className="w-5 h-5" />, color: 'from-amber-500 to-orange-500' },
  { id: 'Humanities / Liberal Arts', label: 'Humanities / Liberal Arts', icon: <Palette className="w-5 h-5" />, color: 'from-emerald-500 to-teal-500' },
  { id: 'Computer Science', label: 'Computer Science', icon: <Cpu className="w-5 h-5" />, color: 'from-blue-500 to-cyan-500' },
];

export default function AcademicSetup({ userId, onComplete }: AcademicSetupProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedGrade, setSelectedGrade] = useState<string>('11th Grade (Junior)');
  const [selectedStream, setSelectedStream] = useState<string>('STEM / Engineering');

  const handleNextStep = () => {
    triggerVibration(15);
    setStep(2);
  };

  const handleBackStep = () => {
    triggerVibration(10);
    setStep(1);
  };

  const handleFinish = () => {
    triggerVibration(25);
    
    // Save selections locally
    safeSetItem('academic_grade', selectedGrade);
    safeSetItem('academic_stream', selectedStream);
    
    // Find study level based on grade (High School vs College)
    const gradeObj = GRADES.find(g => g.id === selectedGrade);
    const studyLevel = gradeObj?.isCollege ? 'College' : 'High School';
    safeSetItem('onboarding_grade', studyLevel);

    // Save for this specific user
    safeSetItem(`academic_grade_${userId}`, selectedGrade);
    safeSetItem(`academic_stream_${userId}`, selectedStream);
    safeSetItem(`onboarding_grade_${userId}`, studyLevel);
    safeSetItem(`academic_setup_completed_${userId}`, 'true');

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
            Step {step} of 2
          </span>
        </div>
      </div>

      {/* Content Area with Slide Animation */}
      <div className="flex-1 px-6 flex flex-col justify-center max-w-sm mx-auto w-full min-h-0 z-10">
        <AnimatePresence mode="wait">
          {step === 1 ? (
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
          ) : (
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
                {STREAMS.map((stream) => {
                  const isSelected = selectedStream === stream.id;
                  return (
                    <motion.div
                      key={stream.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        triggerVibration(10);
                        setSelectedStream(stream.id);
                      }}
                      className={`p-4 rounded-2xl border transition-all flex items-center gap-3.5 cursor-pointer ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50/50 shadow-sm shadow-purple-500/5'
                          : 'border-zinc-200 bg-white hover:border-zinc-300'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${stream.color} text-white flex items-center justify-center shadow-md shadow-zinc-100/10`}>
                        {stream.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-black ${isSelected ? 'text-purple-700' : 'text-zinc-800'}`}>
                          {stream.label}
                        </p>
                        <p className="text-[9px] text-zinc-400 font-bold mt-0.5">
                          Tailored study notes & tests
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
        </AnimatePresence>
      </div>

      {/* Bottom Actions Rail */}
      <div className="w-full px-6 pb-12 pt-4 flex flex-col items-center gap-4 shrink-0 z-10">
        <div className="w-full max-w-sm flex items-center gap-3">
          {step === 2 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleBackStep}
              className="px-4 py-4 bg-zinc-100 hover:bg-zinc-150 border border-zinc-200 rounded-[1.25rem] text-zinc-700 font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs">Back</span>
            </motion.button>
          )}
          
          {step === 1 ? (
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
