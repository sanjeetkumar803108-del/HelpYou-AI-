import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Loader2, ArrowLeft, Award, CheckCircle2, XCircle, 
  RotateCcw, HelpCircle, Coins, ChevronDown, ChevronUp,
  TrendingUp, Timer, Percent, Clipboard, Target, ListChecks, Calendar,
  UploadCloud, FileText, Mic, MicOff, Camera, Image, Sparkles,
  Share2, Download, Copy, Check, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { deductCoins, getCoins, isProUser } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { detectUserRegion } from '../utils/regionDetector';
import { useSettings } from '../hooks/useSettings';
import { saveMistakeToVault } from '../utils/mistakes';
import { Capacitor } from '@capacitor/core';
import { pickNativeFiles, takeNativePhoto } from '../utils/mobilePicker';
import AdvancedLoader from './AdvancedLoader';
import {
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  Area 
} from 'recharts';

interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

const DEMO_HISTORY = [
  {
    id: 'demo_1',
    topic: 'SAT Math - Heart of Algebra',
    score: 3,
    totalQuestions: 5,
    accuracy: 60,
    averageTimePerQuestion: 18.5,
    questionDurations: [12, 25, 15, 30, 11],
    correctAnswers: [true, false, true, true, false],
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
  },
  {
    id: 'demo_2',
    topic: 'AP Biology - Cellular Energetics',
    score: 4,
    totalQuestions: 5,
    accuracy: 80,
    averageTimePerQuestion: 14.2,
    questionDurations: [8, 18, 12, 16, 17],
    correctAnswers: [true, true, false, true, true],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  },
  {
    id: 'demo_3',
    topic: 'SAT Reading - Words in Context',
    score: 5,
    totalQuestions: 5,
    accuracy: 100,
    averageTimePerQuestion: 11.0,
    questionDurations: [9, 11, 14, 12, 9],
    correctAnswers: [true, true, true, true, true],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  },
  {
    id: 'demo_4',
    topic: 'AP US History - American Revolution',
    score: 4,
    totalQuestions: 5,
    accuracy: 80,
    averageTimePerQuestion: 16.4,
    questionDurations: [15, 22, 10, 18, 17],
    correctAnswers: [true, true, true, false, true],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
  }
];

export const isCollegeGrade = (grade: string): boolean => {
  const g = grade.toLowerCase();
  return g.includes('college') || g.includes('freshman') || g.includes('sophomore') || g.includes('university') || g.includes('undergrad');
};

/**
 * Curriculum Alias Dictionary:
 * Maps abstract subject keys to regional course titles (USA, UK, IB, Global)
 */
export const subjectAliases: Record<string, Record<string, string>> = {
  // High School Core & Track
  'core_reading': { USA: 'SAT Reading & Writing', UK: 'GCSE English Language', IB: 'SL English A', Global: 'Core Reading & Writing' },
  'core_math': { USA: 'SAT Math', UK: 'GCSE Maths', IB: 'SL Mathematics', Global: 'Core Mathematics' },
  'adv_english': { USA: 'AP English Language', UK: 'A-Level English Language', IB: 'HL English A', Global: 'Advanced English Language' },
  'adv_cs': { USA: 'AP Computer Science A', UK: 'A-Level Computer Science', IB: 'HL Computer Science', Global: 'Advanced Computer Science' },
  'discrete_math': { USA: 'Discrete Math', UK: 'Discrete Mathematics', IB: 'Discrete Math', Global: 'Discrete Mathematics' },
  'python_basics': { USA: 'Python Basics', UK: 'Python Programming', IB: 'Python Basics', Global: 'Python Programming' },
  'adv_macro': { USA: 'AP Macroeconomics', UK: 'A-Level Economics', IB: 'HL Economics', Global: 'Advanced Macroeconomics' },
  'adv_stats': { USA: 'AP Statistics', UK: 'A-Level Statistics', IB: 'HL Statistics', Global: 'Advanced Statistics' },
  'fin_accounting': { USA: 'Financial Accounting', UK: 'Financial Accounting', IB: 'Financial Accounting', Global: 'Financial Accounting' },
  'adv_biology': { USA: 'AP Biology', UK: 'A-Level Biology', IB: 'HL Biology', Global: 'Advanced Biology' },
  'adv_chem': { USA: 'AP Chemistry', UK: 'A-Level Chemistry', IB: 'HL Chemistry', Global: 'Advanced Chemistry' },
  'anatomy_phys': { USA: 'Anatomy & Physiology', UK: 'Human Anatomy & Physiology', IB: 'Anatomy & Physiology', Global: 'Anatomy & Physiology' },
  'adv_ushistory': { USA: 'AP US History', UK: 'A-Level History', IB: 'HL History', Global: 'Advanced History' },
  'adv_psych': { USA: 'AP Psychology', UK: 'A-Level Psychology', IB: 'HL Psychology', Global: 'Advanced Psychology' },
  'adv_gov': { USA: 'AP US Government', UK: 'A-Level Government & Politics', IB: 'HL Global Politics', Global: 'Advanced Civics & Politics' },
  'adv_calc': { USA: 'AP Calculus BC', UK: 'A-Level Further Maths', IB: 'HL Mathematics Analysis', Global: 'Advanced Calculus' },
  'adv_physics': { USA: 'AP Physics C: Mechanics', UK: 'A-Level Physics', IB: 'HL Physics', Global: 'Advanced Physics' },
  'eng_design': { USA: 'Engineering Design', UK: 'Design & Technology', IB: 'Design Technology', Global: 'Engineering Design' },

  // College 101 Keys
  'college_comp': { USA: 'College Composition', UK: 'Academic Writing 101', IB: 'University Writing', Global: 'College Composition' },
  'calc_1': { USA: 'Calculus I', UK: 'University Calculus 1', IB: 'Calculus I', Global: 'Calculus I' },
  'intro_cs': { USA: 'Intro to Programming (CS101)', UK: 'Intro to Programming 101', IB: 'Programming Fundamentals', Global: 'Intro to Programming' },
  'data_struct': { USA: 'Data Structures', UK: 'Data Structures & Algorithms', IB: 'Data Structures', Global: 'Data Structures' },
  'discrete_math_college': { USA: 'Discrete Mathematics', UK: 'Discrete Mathematics', IB: 'Discrete Mathematics', Global: 'Discrete Mathematics' },
  'gen_chem_101': { USA: 'General Chemistry 101', UK: 'Chemistry 101', IB: 'General Chemistry', Global: 'General Chemistry 101' },
  'intro_bio_101': { USA: 'Introductory Biology 101', UK: 'Biology 101', IB: 'General Biology', Global: 'Introductory Biology 101' },
  'anatomy_101': { USA: 'Anatomy & Physiology 101', UK: 'Anatomy & Physiology 101', IB: 'Human Anatomy 101', Global: 'Anatomy & Physiology 101' },
  'micro_econ_101': { USA: 'Microeconomics 101', UK: 'Microeconomics 101', IB: 'Intro Microeconomics', Global: 'Microeconomics 101' },
  'principles_mgmt': { USA: 'Principles of Management', UK: 'Management Principles', IB: 'Business Management', Global: 'Principles of Management' },
  'us_hist_101': { USA: 'US History 101', UK: 'Modern History 101', IB: 'World History 101', Global: 'History 101' },
  'intro_psych_101': { USA: 'Intro to Psychology 101', UK: 'Psychology 101', IB: 'General Psychology', Global: 'Intro to Psychology 101' },
  'amer_govt_101': { USA: 'American Government 101', UK: 'Political Systems 101', IB: 'Global Politics 101', Global: 'Intro to Political Science' },
  'calc_2': { USA: 'Calculus II', UK: 'University Calculus 2', IB: 'Calculus II', Global: 'Calculus II' },
  'phys_1_mech': { USA: 'Physics I: Mechanics', UK: 'University Physics 1', IB: 'Physics Mechanics 101', Global: 'Physics I: Mechanics' },
  'eng_fund': { USA: 'Engineering Fundamentals', UK: 'Engineering Science 101', IB: 'Engineering Fundamentals', Global: 'Engineering Fundamentals' }
};

export const highSchoolUniversalCoreKeys = ['core_reading', 'core_math', 'adv_english'];

export const highSchoolTrackSubjectKeys: Record<string, string[]> = {
  'Computer Science': ['adv_cs', 'discrete_math', 'python_basics'],
  'Business / Economics': ['adv_macro', 'adv_stats', 'fin_accounting'],
  'Pre-Med / AP Sciences': ['adv_biology', 'adv_chem', 'anatomy_phys'],
  'Humanities / Liberal Arts': ['adv_ushistory', 'adv_psych', 'adv_gov'],
  'STEM / Engineering': ['adv_calc', 'adv_physics', 'eng_design']
};

export const collegeUniversalCoreKeys = ['college_comp', 'calc_1'];

export const collegeTrackSubjectKeys: Record<string, string[]> = {
  'Computer Science': ['intro_cs', 'data_struct', 'discrete_math_college'],
  'Business / Economics': ['micro_econ_101', 'fin_accounting', 'principles_mgmt'],
  'Pre-Med / AP Sciences': ['gen_chem_101', 'intro_bio_101', 'anatomy_101'],
  'Humanities / Liberal Arts': ['us_hist_101', 'intro_psych_101', 'amer_govt_101'],
  'STEM / Engineering': ['calc_2', 'phys_1_mech', 'eng_fund']
};

// Legacy string exports for backwards compatibility
export const highSchoolUniversalCore = ['SAT Reading & Writing', 'SAT Math', 'AP English Language'];
export const highSchoolTrackSubjects = {
  'Computer Science': ['AP Computer Science A', 'Discrete Math', 'Python Basics'],
  'Business / Economics': ['AP Macroeconomics', 'AP Statistics', 'Financial Accounting'],
  'Pre-Med / AP Sciences': ['AP Biology', 'AP Chemistry', 'Anatomy & Physiology'],
  'Humanities / Liberal Arts': ['AP US History', 'AP Psychology', 'AP US Government'],
  'STEM / Engineering': ['AP Calculus BC', 'AP Physics C: Mechanics', 'Engineering Design']
};
export const collegeUniversalCore = ['College Composition', 'Calculus I'];
export const collegeTrackSubjects = {
  'Computer Science': ['Intro to Programming (CS101)', 'Data Structures', 'Discrete Mathematics'],
  'Business / Economics': ['Microeconomics 101', 'Financial Accounting', 'Principles of Management'],
  'Pre-Med / AP Sciences': ['General Chemistry 101', 'Introductory Biology 101', 'Anatomy & Physiology 101'],
  'Humanities / Liberal Arts': ['US History 101', 'Intro to Psychology 101', 'American Government 101'],
  'STEM / Engineering': ['Calculus II', 'Physics I: Mechanics', 'Engineering Fundamentals']
};
export const universalCore = highSchoolUniversalCore;
export const trackSpecificSubjects = highSchoolTrackSubjects;

const SUBJECT_DETAILS: Record<string, { subtitle: string; themeColor: string; icon: string; topics: string[] }> = {
  'core_reading': {
    subtitle: 'Evidence-Based Reading & Grammar',
    themeColor: 'bg-purple-50/70 text-purple-600 border-purple-100',
    icon: '📖',
    topics: ['Words in Context', 'Command of Evidence', 'Grammar Conventions', 'Text Structure']
  },
  'core_math': {
    subtitle: 'Algebra, Geometry & Problem Solving',
    themeColor: 'bg-blue-50/70 text-blue-600 border-blue-100',
    icon: '📐',
    topics: ['Heart of Algebra', 'Problem Solving & Data', 'Advanced Math', 'Geometry & Trigonometry']
  },
  'adv_english': {
    subtitle: 'Rhetorical Analysis & Argumentation',
    themeColor: 'bg-indigo-50/70 text-indigo-600 border-indigo-100',
    icon: '✍️',
    topics: ['Rhetorical Analysis', 'Argumentative Essay', 'Synthesis & Citations']
  },
  'adv_cs': {
    subtitle: 'Java Programming & Data Structures',
    themeColor: 'bg-cyan-50/70 text-cyan-600 border-cyan-100',
    icon: '💻',
    topics: ['Primitive Types', 'Using Objects', 'Boolean Expressions', 'Arrays & ArrayLists', 'Recursion']
  },
  'discrete_math': {
    subtitle: 'Logic, Sets & Combinatorics',
    themeColor: 'bg-sky-50/70 text-sky-600 border-sky-100',
    icon: '🔢',
    topics: ['Propositional Logic', 'Set Theory', 'Graph Theory', 'Proof Techniques']
  },
  'python_basics': {
    subtitle: 'Variables, Functions & Control Flow',
    themeColor: 'bg-teal-50/70 text-teal-600 border-teal-100',
    icon: '🐍',
    topics: ['Variables & Types', 'Loops & Conditionals', 'Functions', 'Data Structures']
  },
  'adv_macro': {
    subtitle: 'Economic Indicators & Fiscal Policy',
    themeColor: 'bg-amber-50/70 text-amber-600 border-amber-100',
    icon: '📈',
    topics: ['Basic Economic Concepts', 'National Income & Price Determination', 'Financial Sector', 'Stabilization Policies']
  },
  'adv_stats': {
    subtitle: 'Data Analysis & Probability',
    themeColor: 'bg-orange-50/70 text-orange-600 border-orange-100',
    icon: '📊',
    topics: ['Exploring Data', 'Sampling & Experimentation', 'Anticipating Patterns', 'Statistical Inference']
  },
  'fin_accounting': {
    subtitle: 'Balance Sheets & Cash Flow',
    themeColor: 'bg-emerald-50/70 text-emerald-600 border-emerald-100',
    icon: '💵',
    topics: ['Accounting Cycle', 'Income Statements', 'Assets & Liabilities', 'Cash Flow Analysis']
  },
  'adv_biology': {
    subtitle: 'Cell Respiration & Genetics',
    themeColor: 'bg-green-50/70 text-green-600 border-green-100',
    icon: '🧬',
    topics: ['Cell Structure', 'Cellular Energetics', 'Heredity', 'Natural Selection']
  },
  'adv_chem': {
    subtitle: 'Atomic Structure & Thermodynamics',
    themeColor: 'bg-emerald-50/70 text-emerald-600 border-emerald-100',
    icon: '🧪',
    topics: ['Atomic Structure', 'Molecular & Ionic Bonding', 'Kinetics', 'Thermodynamics & Equilibrium']
  },
  'anatomy_phys': {
    subtitle: 'Human Body Systems & Homeostasis',
    themeColor: 'bg-rose-50/70 text-rose-600 border-rose-100',
    icon: '🫀',
    topics: ['Skeletal & Muscular Systems', 'Nervous System', 'Cardiovascular System', 'Endocrine System']
  },
  'adv_ushistory': {
    subtitle: 'Historical Epochs & Analysis',
    themeColor: 'bg-red-50/70 text-red-600 border-red-100',
    icon: '🏛️',
    topics: ['Colonial Period', 'Revolution & Constitution', 'Civil War', 'Modern Era']
  },
  'adv_psych': {
    subtitle: 'Cognition & Behavioral Science',
    themeColor: 'bg-fuchsia-50/70 text-fuchsia-600 border-fuchsia-100',
    icon: '🧠',
    topics: ['Biological Bases of Behavior', 'Cognitive Psychology', 'Developmental Psychology', 'Clinical Psychology']
  },
  'adv_gov': {
    subtitle: 'Constitutional Foundations & Civics',
    themeColor: 'bg-blue-50/70 text-blue-600 border-blue-100',
    icon: '⚖️',
    topics: ['Foundations of Democracy', 'Interactions Among Branches', 'Civil Liberties & Rights', 'Political Ideologies']
  },
  'adv_calc': {
    subtitle: 'Limits, Derivatives & Infinite Series',
    themeColor: 'bg-violet-50/70 text-violet-600 border-violet-100',
    icon: '♾️',
    topics: ['Limits & Continuity', 'Differentiation', 'Integration', 'Parametric & Infinite Series']
  },
  'adv_physics': {
    subtitle: 'Newtonian Dynamics & Energy',
    themeColor: 'bg-indigo-50/70 text-indigo-600 border-indigo-100',
    icon: '⚡',
    topics: ['Kinematics', 'Newton\'s Laws', 'Work, Energy & Power', 'Rotational Motion']
  },
  'eng_design': {
    subtitle: 'Prototyping & CAD Modeling',
    themeColor: 'bg-slate-50/70 text-slate-600 border-slate-100',
    icon: '⚙️',
    topics: ['Design Process', 'CAD & 3D Modeling', 'Material Properties', 'Engineering Ethics']
  },

  // College 101 Core & Electives
  'college_comp': {
    subtitle: 'Academic Writing & Rhetoric',
    themeColor: 'bg-indigo-50/70 text-indigo-600 border-indigo-100',
    icon: '✍️',
    topics: ['Thesis Construction', 'Argumentation', 'Research & Citation', 'Critical Analysis']
  },
  'calc_1': {
    subtitle: 'Limits, Derivatives & Integrals',
    themeColor: 'bg-blue-50/70 text-blue-600 border-blue-100',
    icon: '📐',
    topics: ['Limits & Continuity', 'Derivatives & Applications', 'Definite Integrals', 'Fundamental Theorem of Calculus']
  },
  'intro_cs': {
    subtitle: 'Algorithms & Problem Solving',
    themeColor: 'bg-cyan-50/70 text-cyan-600 border-cyan-100',
    icon: '💻',
    topics: ['Control Flow', 'Functions & Scope', 'Arrays & Objects', 'Basic Algorithms']
  },
  'data_struct': {
    subtitle: 'Lists, Trees, Graphs & Hash Tables',
    themeColor: 'bg-teal-50/70 text-teal-600 border-teal-100',
    icon: '⚡',
    topics: ['Arrays & Stacks', 'Trees & Binary Search Trees', 'Graph Traversal', 'Hash Tables & Complexity']
  },
  'discrete_math_college': {
    subtitle: 'Proof Techniques & Graph Theory',
    themeColor: 'bg-sky-50/70 text-sky-600 border-sky-100',
    icon: '🔢',
    topics: ['Mathematical Proofs', 'Combinatorics', 'Graph Theory', 'Relations & Equivalence']
  },
  'gen_chem_101': {
    subtitle: 'Stoichiometry & Chemical Bonding',
    themeColor: 'bg-emerald-50/70 text-emerald-600 border-emerald-100',
    icon: '🧪',
    topics: ['Atomic Theory', 'Stoichiometry', 'Thermochemistry', 'Chemical Kinetics']
  },
  'intro_bio_101': {
    subtitle: 'Cellular & Molecular Biology',
    themeColor: 'bg-green-50/70 text-green-600 border-green-100',
    icon: '🧬',
    topics: ['Cell Structure', 'Metabolism & Enzymes', 'Genetics & DNA', 'Ecology']
  },
  'anatomy_101': {
    subtitle: 'Human Organ Systems',
    themeColor: 'bg-rose-50/70 text-rose-600 border-rose-100',
    icon: '🫀',
    topics: ['Tissue Levels', 'Nervous & Endocrine Systems', 'Cardiovascular System', 'Renal Physiology']
  },
  'micro_econ_101': {
    subtitle: 'Supply, Demand & Market Structure',
    themeColor: 'bg-amber-50/70 text-amber-600 border-amber-100',
    icon: '📉',
    topics: ['Supply & Demand Elasticity', 'Consumer Choice Theory', 'Perfect Competition', 'Monopoly & Oligopoly']
  },
  'principles_mgmt': {
    subtitle: 'Organizational Behavior & Leadership',
    themeColor: 'bg-purple-50/70 text-purple-600 border-purple-100',
    icon: '👔',
    topics: ['Management Functions', 'Organizational Strategy', 'Leadership & Motivation', 'Operations Management']
  },
  'us_hist_101': {
    subtitle: 'Historical Epochs & Analysis',
    themeColor: 'bg-red-50/70 text-red-600 border-red-100',
    icon: '🏛️',
    topics: ['Early Settlements', 'Revolution & Nation Building', 'Expansion & Conflict', 'Modern Era']
  },
  'intro_psych_101': {
    subtitle: 'Mind, Brain & Human Behavior',
    themeColor: 'bg-fuchsia-50/70 text-fuchsia-600 border-fuchsia-100',
    icon: '🧠',
    topics: ['Neuroscience & Sensation', 'Learning & Conditioning', 'Personality Theories', 'Psychological Disorders']
  },
  'amer_govt_101': {
    subtitle: 'Constitutional Law & Institutions',
    themeColor: 'bg-blue-50/70 text-blue-600 border-blue-100',
    icon: '⚖️',
    topics: ['The Constitution', 'Legislative & Executive Branches', 'Judicial System', 'Elections & Public Policy']
  },
  'calc_2': {
    subtitle: 'Integration Techniques & Series',
    themeColor: 'bg-violet-50/70 text-violet-600 border-violet-100',
    icon: '♾️',
    topics: ['Integration by Parts', 'Trigonometric Substitution', 'Infinite Series', 'Taylor Series']
  },
  'phys_1_mech': {
    subtitle: 'Kinematics, Energy & Momentum',
    themeColor: 'bg-indigo-50/70 text-indigo-600 border-indigo-100',
    icon: '⚡',
    topics: ['1D/2D Kinematics', 'Newton\'s Laws', 'Conservation of Energy', 'Rotational Dynamics']
  },
  'eng_fund': {
    subtitle: 'Statics, Dynamics & CAD Systems',
    themeColor: 'bg-slate-50/70 text-slate-600 border-slate-100',
    icon: '⚙️',
    topics: ['Engineering Ethics', 'Statics & Vector Analysis', 'Engineering Economics', 'Systems Design']
  }
};

/**
 * Dynamic Curriculum Helper Function:
 * Returns quiz card objects with translated titles based on Grade Tier, Academic Track, and Region System.
 */
export function getRelevantQuizzes(grade: string, track: string, regionSystem: string = 'USA') {
  const inCollege = isCollegeGrade(grade);
  const coreKeys = inCollege ? collegeUniversalCoreKeys : highSchoolUniversalCoreKeys;
  const trackKeysMap = inCollege ? collegeTrackSubjectKeys : highSchoolTrackSubjectKeys;
  
  let trackKeys: string[] = [];
  if (trackKeysMap[track]) {
    trackKeys = trackKeysMap[track];
  } else {
    const norm = (track || '').toLowerCase().trim();
    const matchedKey = Object.keys(trackKeysMap).find(k => {
      const kNorm = k.toLowerCase().trim();
      return kNorm === norm || norm.includes(kNorm) || kNorm.includes(norm);
    });
    trackKeys = matchedKey ? trackKeysMap[matchedKey] : (trackKeysMap['STEM / Engineering'] || []);
  }
  
  const mergedKeys = [...coreKeys, ...trackKeys];
  
  return mergedKeys.map(key => {
    const regionalTitleMap = subjectAliases[key] || {};
    const translatedTitle = regionalTitleMap[regionSystem] || regionalTitleMap['Global'] || regionalTitleMap['USA'] || key;
    
    const details = SUBJECT_DETAILS[key] || {
      subtitle: 'Practice Questions & Exam Prep',
      themeColor: 'bg-purple-50/70 text-purple-600 border-purple-100',
      icon: '📚',
      topics: ['Core Concepts', 'Practice Problems', 'Exam Strategies']
    };
    
    return {
      id: key,
      key,
      title: translatedTitle,
      subtitle: details.subtitle,
      themeColor: details.themeColor,
      icon: details.icon,
      topics: details.topics,
      isCore: coreKeys.includes(key),
      tierLabel: inCollege ? 'College 101' : 'High School'
    };
  });
}


const getQuizTitle = (attempt: any): string => {
  if (!attempt) return "Practice Quiz";
  const rawTitle = attempt.topicName || attempt.title || attempt.quizTitle || attempt.topic;
  if (!rawTitle || typeof rawTitle !== 'string') {
    return "Practice Quiz";
  }
  const normalized = rawTitle.trim().toLowerCase();
  const badStrings = ["sex", "male", "female", "gender", "demographics", "test", "undefined", "null"];
  if (badStrings.includes(normalized)) {
    return "Practice Quiz";
  }
  return rawTitle;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const cleanTopic = getQuizTitle(data);
    return (
      <div className="bg-white border border-zinc-200 p-3.5 rounded-2xl shadow-lg text-xs">
        <p className="font-black text-zinc-800 mb-1 leading-snug max-w-xs">{cleanTopic}</p>
        <div className="space-y-1 mt-1.5 font-bold">
          <p className="text-indigo-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
            <span>Accuracy:</span>
            <span className="font-extrabold">{payload[0].value}%</span>
          </p>
          {payload[1] && (
            <p className="text-purple-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
              <span>Speed:</span>
              <span className="font-extrabold">{payload[1].value}s / q</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const QuestionTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-zinc-200 p-3.5 rounded-2xl shadow-lg text-xs">
        <p className="font-black text-zinc-800 mb-1">{data.name}</p>
        <div className="space-y-1 font-bold">
          <p className="text-purple-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
            <span>Time spent:</span>
            <span className="font-extrabold">{data.duration} seconds</span>
          </p>
          <p className={`flex items-center gap-1.5 font-black ${data.correct ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${data.correct ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span>Outcome:</span>
            <span>{data.correct ? 'Correct ✓' : 'Incorrect ✗'}</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const dataURItoBlob = (dataURI: string): Blob => {
  try {
    const parts = dataURI.split(',');
    if (parts.length < 2) {
      throw new Error("Invalid data URI format");
    }
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch (error) {
    console.error("Error converting data URI to Blob:", error);
    throw error;
  }
};

const getReviewQuestionsForAttempt = (attempt: any): any[] => {
  if (attempt.questions && Array.isArray(attempt.questions) && attempt.questions.length > 0) {
    return attempt.questions;
  }
  
  // Return mock questions for demo history if not present
  const topicLower = (attempt.topic || "").toLowerCase();
  if (topicLower.includes("algebra")) {
    return [
      {
        question: "Solve for x: 3x - 7 = 8.",
        options: ["x = 3", "x = 5", "x = 15", "x = 1"],
        correctAnswer: "x = 5",
        userAnswer: "x = 5",
        isCorrect: true,
        explanation: "Add 7 to both sides: 3x = 15. Divide by 3: x = 5."
      },
      {
        question: "Which of the following is linear?",
        options: ["y = x^2 + 1", "y = 2x - 3", "y = 1/x", "y = |x|"],
        correctAnswer: "y = 2x - 3",
        userAnswer: "y = x^2 + 1",
        isCorrect: false,
        explanation: "Linear equations have a constant rate of change and are in the form y = mx + c. Therefore, y = 2x - 3 is linear."
      },
      {
        question: "Find the slope of the line passing through (2, 3) and (5, 9).",
        options: ["Slope = 2", "Slope = 3", "Slope = 6", "Slope = 1/2"],
        correctAnswer: "Slope = 2",
        userAnswer: "Slope = 2",
        isCorrect: true,
        explanation: "Slope m = (y2 - y1) / (x2 - x1) = (9 - 3) / (5 - 2) = 6 / 3 = 2."
      }
    ];
  }
  
  if (topicLower.includes("biology")) {
    return [
      {
        question: "Where does glycolysis take place in a cell?",
        options: ["Mitochondria", "Cytoplasm", "Chloroplast", "Nucleus"],
        correctAnswer: "Cytoplasm",
        userAnswer: "Cytoplasm",
        isCorrect: true,
        explanation: "Glycolysis is the first stage of cellular respiration and occurs entirely in the cytosol/cytoplasm of the cell."
      },
      {
        question: "What is the primary role of ATP synthase?",
        options: ["Hydrolyze glucose", "Generate ATP using a proton gradient", "Oxidize NADH", "Pump hydrogen ions"],
        correctAnswer: "Generate ATP using a proton gradient",
        userAnswer: "Pump hydrogen ions",
        isCorrect: false,
        explanation: "ATP synthase acts as a turbine that utilizes the proton-motive force of H+ ions moving down their gradient to synthesize ATP from ADP and Pi."
      },
      {
        question: "Which organelle is responsible for cellular aerobic respiration?",
        options: ["Ribosome", "Mitochondria", "Golgi Apparatus", "Lysosome"],
        correctAnswer: "Mitochondria",
        userAnswer: "Mitochondria",
        isCorrect: true,
        explanation: "Mitochondria are the powerhouse organelles where Krebs cycle and Oxidative Phosphorylation happen to produce ATP."
      }
    ];
  }

  // Fallback default mock review questions if we have nothing else
  return [
    {
      question: `Review Question 1 on ${attempt.topic || 'Subject'}`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option A",
      userAnswer: "Option A",
      isCorrect: true,
      explanation: "This is a detailed explanation of the concept helping you build strong cognitive pathways."
    },
    {
      question: `Review Question 2 on ${attempt.topic || 'Subject'}`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option B",
      userAnswer: "Option C",
      isCorrect: false,
      explanation: "This concept represents a high-yield trap. Keep practicing similar concepts."
    }
  ];
};

export default function QuizGenerator({ onBack }: { onBack: () => void }) {
  const { deepFocus } = useSettings();
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (quizState === 'playing' || quizState === 'results') {
      setQuizState('initial');
      setQuiz([]);
      setShowConfig(false);
    } else {
      if (activeTab === 'analytics') {
        if (selectedHistoryItem) {
          setSelectedHistoryItem(null);
        } else {
          setActiveTab('quizzes');
        }
      } else {
        if (showConfig) {
          setShowConfig(false);
        } else {
          onBack();
        }
      }
    }
  };
  const [topic, setTopic] = useState('');
  
  // Inherit academic grade, track & region directly from global profile / storage context
  const currentUser = auth.currentUser;
  const userUid = currentUser?.uid;

  const [gradeLevel, setGradeLevel] = useState<string>(() => {
    return safeGetItem('academic_grade') 
      || (userUid ? safeGetItem(`academic_grade_${userUid}`) : null) 
      || safeGetItem('onboarding_grade') 
      || '11th Grade';
  });

  const [academicTrack, setAcademicTrack] = useState<string>(() => {
    return safeGetItem('academic_stream') 
      || (userUid ? safeGetItem(`academic_stream_${userUid}`) : null) 
      || 'STEM / Engineering';
  });

  const getDerivedRegion = (uid?: string) => {
    const savedCountry = safeGetItem('academic_country') || (uid ? safeGetItem(`academic_country_${uid}`) : null);
    if (savedCountry === 'United States' || savedCountry === 'Canada') return 'USA';
    if (savedCountry === 'United Kingdom' || savedCountry === 'Australia') return 'UK';
    if (savedCountry === 'Others / International') return 'Global';
    
    const savedRegion = safeGetItem('academic_region') || (uid ? safeGetItem(`academic_region_${uid}`) : null);
    if (savedRegion) return savedRegion;

    return detectUserRegion(uid);
  };

  const [regionSystem, setRegionSystem] = useState<string>(() => {
    return getDerivedRegion(userUid);
  });

  useEffect(() => {
    const syncAcademicProfile = () => {
      const uid = auth.currentUser?.uid;
      const updatedGrade = safeGetItem('academic_grade') 
        || (uid ? safeGetItem(`academic_grade_${uid}`) : null) 
        || safeGetItem('onboarding_grade') 
        || '11th Grade';

      const updatedTrack = safeGetItem('academic_stream') 
        || (uid ? safeGetItem(`academic_stream_${uid}`) : null) 
        || 'STEM / Engineering';

      const updatedRegion = getDerivedRegion(uid);

      setGradeLevel(updatedGrade);
      setAcademicTrack(updatedTrack);
      setRegionSystem(updatedRegion);
    };

    syncAcademicProfile();

    window.addEventListener('storage', syncAcademicProfile);
    window.addEventListener('academic_profile_updated', syncAcademicProfile);
    window.addEventListener('focus', syncAcademicProfile);

    return () => {
      window.removeEventListener('storage', syncAcademicProfile);
      window.removeEventListener('academic_profile_updated', syncAcademicProfile);
      window.removeEventListener('focus', syncAcademicProfile);
    };
  }, []);

  // Dynamic quiz generation (Grade Tier + Academic Track + Region Alias System)
  const mergedSubjects = getRelevantQuizzes(gradeLevel, academicTrack, regionSystem);

  const [loading, setLoading] = useState(false);
  const [quiz, setQuiz] = useState<Question[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);

  const quizSteps = [
    "Analyzing subject material...",
    "Identifying high-yield exam topics...",
    "Drafting complex multiple choice questions...",
    "Formulating detailed explanations...",
    "Finalizing your practice assessment..."
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [quizState, setQuizState] = useState<'initial' | 'playing' | 'results'>('initial');
  const [saved, setSaved] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  
  // Custom count configuration states
  const [showConfig, setShowConfig] = useState(false);
  const [configCount, setConfigCount] = useState<number>(10);
  const [customCountInput, setCustomCountInput] = useState<string>('');
  const [isCustomCount, setIsCustomCount] = useState(false);
  const [topicToGenerate, setTopicToGenerate] = useState<string>('');
  const [pendingGeneratorType, setPendingGeneratorType] = useState<'standard' | 'pdf' | 'image' | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  
  // Share results states
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState('');
  const [shareStatus, setShareStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [shareMessage, setShareMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  // Analytics states
  const [activeTab, setActiveTab] = useState<'quizzes' | 'analytics'>('quizzes');
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [questionDurations, setQuestionDurations] = useState<number[]>([]);
  const [correctAnswers, setCorrectAnswers] = useState<boolean[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [reviewingAttempt, setReviewingAttempt] = useState<any | null>(null);
  
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any | null>(null);
  const [currentQuizRecordId, setCurrentQuizRecordId] = useState<string | null>(null);

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      const hasSubState = (
        quizState === 'playing' ||
        quizState === 'results' ||
        selectedHistoryItem ||
        activeTab === 'analytics' ||
        showConfig ||
        showShareModal
      );
      if (hasSubState) {
        e.preventDefault();
        handleHeaderBack();
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [quizState, selectedHistoryItem, activeTab, showConfig, showShareModal]);

  const saveInitialQuizToHistory = async (generatedQuestions: Question[], topicName: string) => {
    const quizQuestions = generatedQuestions.map((q) => ({
      question: q.question,
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || "",
      userAnswer: "",
      isCorrect: false
    }));

    const quizTopic = topicName || topicToGenerate || "Custom Practice Quiz";

    if (auth.currentUser) {
      try {
        const docRef = await addDoc(collection(db, 'quiz_results'), {
          userId: auth.currentUser.uid,
          topic: quizTopic,
          score: 0,
          totalQuestions: generatedQuestions.length,
          accuracy: 0,
          averageTimePerQuestion: 10.0,
          questionDurations: generatedQuestions.map(() => 10.0),
          correctAnswers: generatedQuestions.map(() => false),
          questions: quizQuestions,
          createdAt: serverTimestamp()
        });
        setCurrentQuizRecordId(docRef.id);
        // Refresh history to show the newly generated quiz instantly
        fetchHistory();
      } catch (err) {
        console.error("Failed to save initial quiz to Firestore:", err);
      }
    } else {
      try {
        const localId = 'local_' + Date.now();
        const localHistory = JSON.parse(safeGetItem('local_quiz_results') || '[]');
        localHistory.push({
          id: localId,
          topic: quizTopic,
          score: 0,
          totalQuestions: generatedQuestions.length,
          accuracy: 0,
          averageTimePerQuestion: 10.0,
          questionDurations: generatedQuestions.map(() => 10.0),
          correctAnswers: generatedQuestions.map(() => false),
          questions: quizQuestions,
          createdAt: new Date().toISOString()
        });
        safeSetItem('local_quiz_results', JSON.stringify(localHistory));
        setCurrentQuizRecordId(localId);
        // Refresh history to show the newly generated quiz instantly
        fetchHistory();
      } catch (err) {
        console.error("Failed to save initial quiz to local storage:", err);
      }
    }
  };

  const fetchHistory = async () => {
    if (!auth.currentUser) {
      // If not logged in, load local storage items
      try {
        const localItems = JSON.parse(safeGetItem('local_quiz_results') || '[]');
        let parsed = localItems.map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
        }));
        
        // Keep only last 10 records
        if (parsed.length > 10) {
          parsed.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime()); // newest first
          parsed = parsed.slice(0, 10);
          safeSetItem('local_quiz_results', JSON.stringify(parsed));
          parsed.reverse(); // oldest first for display
        }
        
        setHistory(parsed);
        if (parsed.length > 0 && !selectedHistoryItem) {
          setSelectedHistoryItem(parsed[parsed.length - 1]);
        }
      } catch (err) {
        console.error("Failed to fetch local history", err);
      }
      return;
    }

    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'quiz_results'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const items: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data,
          // Convert firestore timestamp to Date
          createdAt: data.createdAt?.toDate() || new Date()
        });
      });
      
      // Also get localStorage local_quiz_results and merge them
      let localItems: any[] = [];
      try {
        localItems = JSON.parse(safeGetItem('local_quiz_results') || '[]').map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
        }));
      } catch (_) {}

      let combined = [...localItems, ...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      // Keep only last 10 records
      if (combined.length > 10) {
        // Sort newest first
        combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const toKeep = combined.slice(0, 10);
        const toDelete = combined.slice(10);

        const remainingLocal: any[] = [];
        for (const item of toDelete) {
          if (item.id && !item.id.startsWith('local_')) {
            try {
              await deleteDoc(doc(db, 'quiz_results', item.id));
            } catch (err) {
              console.error("Failed to delete old Firestore quiz:", err);
            }
          }
        }

        for (const item of toKeep) {
          if (item.id && item.id.startsWith('local_')) {
            remainingLocal.push(item);
          }
        }
        safeSetItem('local_quiz_results', JSON.stringify(remainingLocal));
        combined = toKeep.reverse(); // reverse to keep original ascending order for UI list
      }

      setHistory(combined);
      if (combined.length > 0) {
        setSelectedHistoryItem(combined[combined.length - 1]);
      }
    } catch (err: any) {
      console.error("Error fetching Firestore history: ", err);
      try {
        const localItems = JSON.parse(safeGetItem('local_quiz_results') || '[]');
        let parsed = localItems.map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
        }));
        if (parsed.length > 10) {
          parsed.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
          parsed = parsed.slice(0, 10);
          safeSetItem('local_quiz_results', JSON.stringify(parsed));
          parsed.reverse();
        }
        setHistory(parsed);
        if (parsed.length > 0) {
          setSelectedHistoryItem(parsed[parsed.length - 1]);
        }
      } catch (_) {}
    } finally {
      setLoadingHistory(false);
    }
  };

  const uid = auth.currentUser?.uid || '';

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && quiz.length === 0) {
      setLoadingProgress(0);
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 98) {
            clearInterval(interval);
            return 98;
          }
          const increment = Math.floor(Math.random() * 7) + 4;
          const nextVal = Math.min(prev + increment, 98);
          const stepIndex = Math.min(Math.floor(nextVal / 20), quizSteps.length - 1);
          setLoadingStep(stepIndex);
          return nextVal;
        });
      }, 400);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, quiz]);

  React.useEffect(() => {
    fetchHistory();
  }, [activeTab, uid]);

  React.useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let sessionTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          sessionTranscript += event.results[i][0].transcript;
        }
        
        const base = baseTextRef.current;
        setTopic(base + (base && sessionTranscript ? ' ' : '') + sessionTranscript);
      };

      rec.onerror = (e: any) => {
        console.error("Speech recognition error:", e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      setSpeechSupported(true);
    } else {
      setSpeechSupported(false);
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        baseTextRef.current = topic;
        setIsListening(true);
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const toggleSubject = (id: string) => {
    triggerVibration(15);
    setExpandedSubject(prev => prev === id ? null : id);
  };

  const handleTopicClick = (subjectTitle: string, topicName: string) => {
    const fullTopicName = `${subjectTitle} - ${topicName}`;
    setTopic(fullTopicName);
    handleGenerate(fullTopicName);
  };

  const handlePDFUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a valid PDF document.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("PDF file size must not exceed 10MB.");
      return;
    }

    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    setTopic(cleanName);
    setTopicToGenerate(cleanName);
    setPendingFile(file);
    setPendingGeneratorType('pdf');
    setShowConfig(true);
    setConfigCount(10);
    setCustomCountInput('');
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please select a valid textbook photo (JPG, PNG, WEBP).");
      return;
    }

    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    setTopic("Photo: " + cleanName);
    setTopicToGenerate("Photo: " + cleanName);
    setPendingFile(file);
    setPendingGeneratorType('image');
    setShowConfig(true);
    setConfigCount(10);
    setCustomCountInput('');
  };

  const handleGenerate = async (selectedTopic: string) => {
    const activeTopic = selectedTopic.trim();
    if (!activeTopic) return;

    setTopic(activeTopic);
    setTopicToGenerate(activeTopic);
    setPendingFile(null);
    setPendingGeneratorType('standard');
    setShowConfig(true);
    setConfigCount(10);
    setCustomCountInput('');
  };

  const handlePDFUploadReal = async (file: File, selectedCount: number) => {
    // Check if user has at least 2 coins before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 2) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Quizzes", cost: 2 } }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setPdfProcessing(true);
    setLoading(true);
    setError(null);
    setQuiz([]);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setSaved(false);
    setCoinsEarned(0);
    setQuestionDurations([]);
    setCorrectAnswers([]);
    setQuestionStartTime(0);
    setShowConfig(false);
    setUserAnswers({});
    setCurrentQuizRecordId(null);

    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("count", String(selectedCount));
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      formData.append("gradeLevel", gradeLevel);

      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/generate-pdf-quiz', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate quiz from PDF');
      }

      const data = await response.json();
      if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        // Deduct 2 coins now that the output has been successfully generated by the AI
        deductCoins(2, "AI Quizzes");

        setQuiz(data.quiz);
        setQuizState('playing');
        setCurrentIndex(0);
        setQuestionStartTime(Date.now());
        saveInitialQuizToHistory(data.quiz, topic || "PDF Quiz");
      } else {
        throw new Error('Invalid quiz response from server');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load quiz from PDF. Please try again!');
    } finally {
      setPdfProcessing(false);
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handlePhotoUploadReal = async (file: File, selectedCount: number) => {
    // Check if user has at least 2 coins before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 2) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Quizzes", cost: 2 } }));
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }

    setPhotoProcessing(true);
    setLoading(true);
    setError(null);
    setQuiz([]);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setSaved(false);
    setCoinsEarned(0);
    setQuestionDurations([]);
    setCorrectAnswers([]);
    setQuestionStartTime(0);
    setShowConfig(false);
    setUserAnswers({});
    setCurrentQuizRecordId(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("count", String(selectedCount));
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      formData.append("gradeLevel", gradeLevel);

      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/generate-image-quiz', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate quiz from textbook photo');
      }

      const data = await response.json();
      if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        // Deduct 2 coins now that the output has been successfully generated by the AI
        deductCoins(2, "AI Quizzes");

        setQuiz(data.quiz);
        setQuizState('playing');
        setCurrentIndex(0);
        setQuestionStartTime(Date.now());
        saveInitialQuizToHistory(data.quiz, topic || "Photo Quiz");
      } else {
        throw new Error('Invalid quiz response from server');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load quiz from textbook photo. Please try again!');
    } finally {
      setPhotoProcessing(false);
      setLoading(false);
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
    }
  };

  const handleGenerateReal = async (selectedTopic: string, selectedCount: number) => {
    const activeTopic = selectedTopic.trim();
    if (!activeTopic) return;

    // Check if user has at least 2 coins before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 2) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Quizzes", cost: 2 } }));
      return;
    }

    setLoading(true);
    setError(null);
    setQuiz([]);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setSaved(false);
    setCoinsEarned(0);
    setQuestionDurations([]);
    setCorrectAnswers([]);
    setQuestionStartTime(0);
    setShowConfig(false);
    setUserAnswers({});
    setCurrentQuizRecordId(null);

    try {
      const gradeLevel = safeGetItem('academic_grade') || '11th Grade (Junior)';
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: activeTopic, gradeLevel, count: selectedCount }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          throw new Error(data.text || 'Gemini API quota exceeded. Please try again in 60 seconds.');
        }
        throw new Error('Failed to generate quiz');
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }

      const data = await response.json();
      if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        // Deduct 2 coins now that the output has been successfully generated by the AI
        deductCoins(2, "AI Quizzes");

        setQuiz(data.quiz);
        setQuizState('playing');
        setCurrentIndex(0);
        setQuestionStartTime(Date.now());
        saveInitialQuizToHistory(data.quiz, activeTopic);
      } else {
        throw new Error('Invalid quiz response from server');
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to load your custom quiz. Please try again!');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteReal = async (selectedCount: number) => {
    if (pendingGeneratorType === 'pdf') {
      if (!pendingFile) return;
      await handlePDFUploadReal(pendingFile, selectedCount);
    } else if (pendingGeneratorType === 'image') {
      if (!pendingFile) return;
      await handlePhotoUploadReal(pendingFile, selectedCount);
    } else {
      await handleGenerateReal(topicToGenerate, selectedCount);
    }
  };

  const handleOptionSelect = (option: string) => {
    if (isAnswered) return;

    // Calculate response duration
    const duration = questionStartTime > 0 
      ? Math.round(((Date.now() - questionStartTime) / 1000) * 10) / 10 
      : 10.0;
    setQuestionDurations((prev) => [...prev, duration]);

    setSelectedOption(option);
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: option }));
    setIsAnswered(true);

    const currentQuestion = quiz[currentIndex];
    const correctAnswer = currentQuestion?.correctAnswer || "";
    
    // Strict match against the correct answer string
    const isCorrect = option === correctAnswer;

    setCorrectAnswers((prev) => [...prev, isCorrect]);

    if (isCorrect) {
      setScore((prev) => prev + 1);
    } else {
      // Auto-save incorrect answer to MistakeVault
      saveMistakeToVault(
        'Quizzes',
        currentQuestion.question,
        option,
        currentQuestion.explanation || `The correct answer is ${correctAnswer}.`
      ).catch(err => console.error("Failed to log mistake:", err));
    }
  };

  const handleNext = async () => {
    if (currentIndex + 1 < quiz.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setQuestionStartTime(Date.now());
    } else {
      // Reward logic removed to prevent "Coin Farming"
      setCoinsEarned(0);
      
      // Calculate stats to save
      const finalAccuracy = Math.round((score / quiz.length) * 100);
      const finalQuestionDurations = [...questionDurations];
      // In case we have an unanswered/padded duration
      while (finalQuestionDurations.length < quiz.length) {
        finalQuestionDurations.push(10.0);
      }
      const finalCorrectAnswers = [...correctAnswers];
      while (finalCorrectAnswers.length < quiz.length) {
        finalCorrectAnswers.push(false);
      }

      const avgTime = finalQuestionDurations.length > 0 
        ? Math.round((finalQuestionDurations.reduce((a, b) => a + b, 0) / finalQuestionDurations.length) * 10) / 10
        : 12.0;

      // Construct quiz data with questions
      const quizQuestions = quiz.map((q, idx) => {
        const uAns = userAnswers[idx] || "";
        const isCorrect = uAns === q.correctAnswer;
        return {
          question: q.question,
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || "",
          userAnswer: uAns,
          isCorrect: isCorrect
        };
      });

      const quizData = {
        questions: quizQuestions
      };

      // Filter incorrect questions
      const mistakes = quizData.questions.filter(q => !q.isCorrect);

      // Append mistakes to MistakeVault
      mistakes.forEach((m) => {
        saveMistakeToVault(
          'Quizzes',
          m.question,
          m.userAnswer || "No Answer",
          `The correct answer is "${m.correctAnswer}". ${m.explanation}`
        ).catch(err => console.error("Failed to log mistake to MistakeVault:", err));
      });

      if (auth.currentUser) {
        try {
          if (currentQuizRecordId) {
            const docRef = doc(db, 'quiz_results', currentQuizRecordId);
            await updateDoc(docRef, {
              score,
              accuracy: finalAccuracy,
              averageTimePerQuestion: avgTime,
              questionDurations: finalQuestionDurations,
              correctAnswers: finalCorrectAnswers,
              questions: quizQuestions
            });
          } else {
            await addDoc(collection(db, 'quiz_results'), {
              userId: auth.currentUser.uid,
              topic: topic || 'Custom Practice Quiz',
              score,
              totalQuestions: quiz.length,
              accuracy: finalAccuracy,
              averageTimePerQuestion: avgTime,
              questionDurations: finalQuestionDurations,
              correctAnswers: finalCorrectAnswers,
              questions: quizQuestions,
              createdAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Auto-saving/updating quiz result failed:", e);
        }
      } else {
        try {
          const localHistory = JSON.parse(safeGetItem('local_quiz_results') || '[]');
          const existingIndex = localHistory.findIndex((item: any) => item.id === currentQuizRecordId);
          if (existingIndex !== -1) {
            localHistory[existingIndex] = {
              ...localHistory[existingIndex],
              score,
              accuracy: finalAccuracy,
              averageTimePerQuestion: avgTime,
              questionDurations: finalQuestionDurations,
              correctAnswers: finalCorrectAnswers,
              questions: quizQuestions
            };
          } else {
            localHistory.push({
              id: 'local_' + Date.now(),
              topic: topic || 'Custom Practice Quiz',
              score,
              totalQuestions: quiz.length,
              accuracy: finalAccuracy,
              averageTimePerQuestion: avgTime,
              questionDurations: finalQuestionDurations,
              correctAnswers: finalCorrectAnswers,
              questions: quizQuestions,
              createdAt: new Date().toISOString()
            });
          }
          safeSetItem('local_quiz_results', JSON.stringify(localHistory));
        } catch (e) {
          console.error("Saving/updating local quiz history failed:", e);
        }
      }

      // Reload history to reflect the latest run instantly in analytics tab
      setTimeout(() => {
        fetchHistory();
      }, 500);

      setQuizState('results');
    }
  };

  const drawPerformanceCard = (
    topicName: string,
    quizScore: number,
    quizTotal: number,
    timeTaken: number,
    coins: number
  ): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 1. Background Gradient
    const grad = ctx.createRadialGradient(540, 540, 50, 540, 540, 750);
    grad.addColorStop(0, '#1E1B4B'); // deep indigo
    grad.addColorStop(1, '#09090B'); // dark zinc
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    // 2. Decorative grid/lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 1080; i += 60) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1080);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(1080, i);
      ctx.stroke();
    }

    // 3. Neon Accent Glows
    ctx.shadowColor = '#6366F1'; // indigo-500
    ctx.shadowBlur = 40;
    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.beginPath();
    ctx.arc(540, 440, 280, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // reset

    // 4. Header Title & Badge
    ctx.fillStyle = '#FAF9F6';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HELPYOU AI QUIZ PERFORMANCE', 540, 100);

    // Topic Badge
    const badgeText = (topicName || 'Custom Assessment').toUpperCase();
    ctx.font = 'bold 22px sans-serif';
    const textWidth = ctx.measureText(badgeText).width;
    const badgeWidth = Math.min(textWidth + 40, 960);
    const badgeHeight = 54;
    
    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(540 - badgeWidth/2, 140, badgeWidth, badgeHeight, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#818CF8'; // light indigo
    ctx.fillText(badgeText.length > 50 ? badgeText.substring(0, 47) + '...' : badgeText, 540, 167);

    // 5. Center Progress Circle Ring
    const accuracy = quizTotal > 0 ? Math.round((quizScore / quizTotal) * 100) : 0;
    const ringX = 540;
    const ringY = 440;
    const ringRadius = 180;

    // Outer Background Ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.arc(ringX, ringY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Active Progress Ring
    const progressGrad = ctx.createLinearGradient(360, 440, 720, 440);
    progressGrad.addColorStop(0, '#6366F1'); // Indigo
    progressGrad.addColorStop(1, '#EC4899'); // Pink
    
    ctx.strokeStyle = progressGrad;
    ctx.lineWidth = 24;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#6366F1';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    const startAngle = Math.PI * 1.5;
    const endAngle = startAngle + (Math.PI * 2 * (accuracy / 100 || 0.01));
    ctx.arc(ringX, ringY, ringRadius, startAngle, endAngle);
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // 6. Score Text Inside Circle
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 110px sans-serif';
    ctx.fillText(`${quizScore}/${quizTotal}`, ringX, ringY - 10);

    ctx.fillStyle = '#D1D5DB';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`${accuracy}% ACCURACY`, ringX, ringY + 70);

    // 7. Stats Grid (3 Bento boxes)
    const boxY = 730;
    const boxHeight = 180;
    const boxWidth = 280;
    const gap = 30;
    const startX = 540 - (boxWidth * 3 + gap * 2) / 2;

    const drawStatBox = (x: number, y: number, label: string, value: string, iconSymbol: string, themeColor: string) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.roundRect(x + 24, y + 20, 40, 6, 3);
      ctx.fill();

      ctx.fillStyle = '#9CA3AF';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label.toUpperCase(), x + 24, y + 54);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 38px sans-serif';
      ctx.fillText(value, x + 24, y + 114);

      ctx.font = '28px sans-serif';
      ctx.fillText(iconSymbol, x + boxWidth - 54, y + 114);
    };

    const minutes = Math.floor(timeTaken / 60);
    const seconds = Math.round(timeTaken % 60);
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    drawStatBox(startX, boxY, 'Time Spent', timeStr, '⏱️', '#6366F1');

    let performanceStr = 'Elite';
    let ratingEmoji = '👑';
    if (accuracy === 100) {
      performanceStr = 'Perfect';
      ratingEmoji = '🌟';
    } else if (accuracy >= 80) {
      performanceStr = 'Master';
      ratingEmoji = '🔥';
    } else if (accuracy >= 60) {
      performanceStr = 'Achiever';
      ratingEmoji = '👍';
    } else {
      performanceStr = 'Learner';
      ratingEmoji = '🌱';
    }
    drawStatBox(startX + boxWidth + gap, boxY, 'Rating', performanceStr, ratingEmoji, '#EC4899');

    drawStatBox(startX + (boxWidth + gap) * 2, boxY, 'Coins Gained', `+${coins}`, '🪙', '#F59E0B');

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9CA3AF';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Quiz made with HelpYou AI', 540, 980);

    ctx.fillStyle = '#6366F1';
    ctx.beginPath();
    ctx.arc(540, 1020, 5, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL('image/png');
  };

  const handleOpenShareModal = () => {
    triggerVibration(20);
    const totalTime = questionDurations.reduce((acc, curr) => acc + curr, 0);
    const generatedUrl = drawPerformanceCard(topic, score, quiz.length, totalTime, coinsEarned);
    setShareImageUrl(generatedUrl);
    setShowShareModal(true);
  };

  const restartQuiz = () => {
    setQuizState('initial');
    setQuiz([]);
    setTopic('');
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setSaved(false);
    setCoinsEarned(0);
    setUserAnswers({});
  };

  const safeHistory = Array.isArray(history) ? history : [];
  const isGenerating = (loading || pdfProcessing || photoProcessing) && quiz.length === 0;

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {isGenerating && (
        <div className="absolute inset-0 bg-[#FAF9F6] z-50 flex flex-col items-center justify-center py-12 px-6 text-center overflow-hidden">
          <div className="absolute w-72 h-72 rounded-full bg-pink-500/5 blur-[100px] pointer-events-none top-1/4 left-1/2 -translate-x-1/2" />
          
          <button
            onClick={() => {
              triggerVibration(15);
              onBack();
            }}
            className="absolute top-4 left-4 w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors z-50"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="max-w-md w-full mx-auto flex flex-col items-center space-y-6">
            <AdvancedLoader type="orb" context="quiz" />

            <div className="w-full bg-zinc-200/60 rounded-full h-3 overflow-hidden border border-zinc-200 p-[2px]">
              <div 
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            
            <div className="text-xs font-black text-zinc-400 tracking-wider uppercase">
              {loadingProgress}% Complete
            </div>

            <div className="w-full pt-4">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">AI Generation Pipeline</p>
              <AdvancedLoader type="skeleton" skeletonType="list" count={1} />
            </div>
          </div>
        </div>
      )}
      {/* HEADER */}
      {!isGenerating && (
        <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200/80 flex items-center gap-4 shrink-0">
          <button
            onClick={handleHeaderBack}
            className="w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight line-clamp-1 text-zinc-900">
              <BookOpen className="w-5 h-5 text-indigo-600 mr-2 shrink-0" />
              <span>AI Practice Quizzes</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Elite Exam-Level Multiple Choice Practice</p>
          </div>
        </div>
      )}

      {/* BODY CONTAINER */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 z-10 flex flex-col">
        
        {quizState === 'initial' && !loading && !pdfProcessing && !photoProcessing && (
          showConfig ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full py-4"
            >
              <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 shadow-xl shadow-zinc-100 flex flex-col gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none" />
                
                {/* Header */}
                <div className="text-center">
                  <span className="text-4xl filter drop-shadow-sm select-none">🔮</span>
                  <h3 className="text-2xl font-black text-zinc-900 mt-2 tracking-tight">How many Questions???</h3>
                  <p className="text-xs text-zinc-500 font-bold mt-1">Select or customize your preferred practice length</p>
                </div>

                {/* Grid of Preset Options */}
                <div className="grid grid-cols-3 gap-3">
                  {[5, 10, 15].map((num) => {
                    const isSelected = configCount === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setConfigCount(num);
                        }}
                        className={`py-4 rounded-2xl font-black text-lg border transition-all active:scale-[0.97] cursor-pointer flex flex-col items-center justify-center ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        <span className="text-xl">{num}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
                          isSelected ? 'text-indigo-100' : 'text-zinc-400'
                        }`}>Questions</span>
                      </button>
                    );
                  })}
                </div>

                {/* Topic Metadata Description */}
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-3 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Active Topic</span>
                  <p className="text-xs font-extrabold text-zinc-700 line-clamp-1">
                    {topicToGenerate || 'General Subject Practice'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(15);
                      setShowConfig(false);
                      setPendingFile(null);
                      setPendingGeneratorType(null);
                    }}
                    className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 font-black text-sm active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(20);
                      handleExecuteReal(configCount);
                    }}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-indigo-500/20"
                  >
                    <span>🪄</span> Start Generating
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col"
            >
            {/* SEGMENTED CONTROL TABS */}
            <div className="flex bg-zinc-200/50 p-1 rounded-2xl mb-6 max-w-[28rem] mx-auto w-full border border-zinc-200 shadow-inner">
              <button
                onClick={() => {
                  triggerVibration(10);
                  setActiveTab('quizzes');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
                  activeTab === 'quizzes'
                    ? 'bg-white text-indigo-600 shadow-sm border border-zinc-200/50'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                📝 Maker
              </button>
              <button
                onClick={() => {
                  triggerVibration(10);
                  setActiveTab('analytics');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
                  activeTab === 'analytics'
                    ? 'bg-white text-indigo-600 shadow-sm border border-zinc-200/50'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                📊 Analytics
              </button>
            </div>

            {activeTab === 'quizzes' && (
              <>
                {/* Custom input box */}
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2">
                    What do you want to practice?
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. SAT Math - Trigonometry, AP US Gov"
                      className="flex-1 p-4 rounded-2xl border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-semibold text-sm h-14"
                    />
                    <button
                      onClick={() => {
                        triggerVibration(20);
                        handleGenerate(topic);
                      }}
                      disabled={!topic.trim() || loading}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 w-14 h-14 rounded-2xl font-bold transition-all flex items-center justify-center border border-indigo-500/30 shrink-0 shadow-md shadow-indigo-600/15"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-xl filter drop-shadow-sm select-none">🪄</span>}
                    </button>
                  </div>
                </div>

                {error && <p className="text-red-600 text-xs mb-4 font-bold">{error}</p>}

                {/* PDF to Quiz Card */}
                <div 
                  onClick={async () => {
                    triggerVibration(10);
                    if (Capacitor.isNativePlatform()) {
                      try {
                        const picked = await pickNativeFiles({ types: 'pdf', multiple: false });
                        if (picked && picked.length > 0) {
                          const fakeEvent = {
                            target: {
                              files: [picked[0].fileObj]
                            }
                          } as unknown as React.ChangeEvent<HTMLInputElement>;
                          await handlePDFUpload(fakeEvent);
                        }
                      } catch (err: any) {
                        console.error("Native file picking failed", err);
                        setError("Failed to open native file explorer: " + (err.message || err));
                      }
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  className="mb-4 cursor-pointer relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-4 hover:border-indigo-200 hover:shadow-md transition-all duration-300 active:scale-[0.99] group shadow-sm"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handlePDFUpload} 
                    accept=".pdf" 
                    className="hidden" 
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-zinc-800 leading-snug">
                            Upload PDF
                          </h4>
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
                            Elite AI
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                          Upload class notes to generate custom MCQs instantly. (Max 10MB, 50 Pages)
                        </p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-zinc-50 border border-zinc-200/50 flex items-center justify-center text-indigo-600 shadow-sm shrink-0 group-hover:translate-x-0.5 transition-transform">
                      <span className="text-xs filter drop-shadow-sm select-none">✨</span>
                    </div>
                  </div>
                </div>

                {/* Textbook Photo to Quiz Card */}
                <div 
                  onClick={async () => {
                    triggerVibration(10);
                    if (Capacitor.isNativePlatform()) {
                      try {
                        const picked = await takeNativePhoto();
                        if (picked) {
                          const fakeEvent = {
                            target: {
                              files: [picked.fileObj]
                            }
                          } as unknown as React.ChangeEvent<HTMLInputElement>;
                          await handlePhotoUpload(fakeEvent);
                        }
                      } catch (err: any) {
                        console.error("Native camera photo failed", err);
                        setError("Failed to open native camera: " + (err.message || err));
                      }
                    } else {
                      photoInputRef.current?.click();
                    }
                  }}
                  className="mb-6 cursor-pointer relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-4 hover:border-amber-200 hover:shadow-md transition-all duration-300 active:scale-[0.99] group shadow-sm"
                >
                  <input 
                    type="file" 
                    ref={photoInputRef} 
                    onChange={handlePhotoUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-zinc-800 leading-snug">
                            Upload Photo
                          </h4>
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md">
                            Visual AI
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                          Snap textbook pages to auto-generate a 5-question quiz.
                        </p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-zinc-50 border border-zinc-200/50 flex items-center justify-center text-amber-600 shadow-sm shrink-0 group-hover:translate-x-0.5 transition-transform">
                      <span className="text-xs filter drop-shadow-sm select-none">📸</span>
                    </div>
                  </div>
                </div>

                {/* Presets Accordion */}
                <div className="mb-6 flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Curriculum Practice Quizzes
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {mergedSubjects.map((subject) => {
                      const isExpanded = expandedSubject === subject.id;
                      return (
                        <div 
                          key={subject.id}
                          className="bg-white border border-zinc-200/80 rounded-3xl overflow-hidden shadow-sm transition-all duration-300"
                        >
                          {/* Main Subject Card Header */}
                          <button
                            onClick={() => toggleSubject(subject.id)}
                            className={`w-full p-4 flex items-center justify-between text-left transition-colors duration-300 ${
                              isExpanded ? 'bg-zinc-50/50' : 'hover:bg-zinc-50/40'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-base shadow-sm ${subject.themeColor}`}>
                                {subject.icon}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-extrabold text-sm text-zinc-800 leading-snug">
                                    {subject.title}
                                  </h4>
                                  {subject.isCore && (
                                    <span className="text-[9px] font-extrabold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase tracking-wider">
                                      Universal Core
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{subject.subtitle}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-extrabold text-zinc-400 bg-zinc-100 px-2 py-1 rounded-lg uppercase tracking-wider">
                                0/{subject.topics.length} Modules
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                              )}
                            </div>
                          </button>

                          {/* Collapsible Sub-topics List */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="border-t border-zinc-100"
                              >
                                <div className="p-3 bg-zinc-50/20 grid grid-cols-1 gap-2">
                                  {(subject.topics || []).map((topicItem, index) => (
                                    <button
                                      key={index}
                                      onClick={() => {
                                        triggerVibration(15);
                                        handleTopicClick(subject.title, topicItem);
                                      }}
                                      disabled={loading}
                                      className="w-full bg-white border border-zinc-200/60 hover:bg-zinc-50 hover:border-zinc-300/80 active:scale-[0.995] py-3.5 px-4 rounded-2xl flex items-center justify-between text-left transition-all group/topic shadow-sm"
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <span className="font-bold text-xs text-zinc-700 group-hover/topic:text-indigo-600 transition-colors">
                                          {topicItem}
                                        </span>
                                      </div>
                                      <span className="text-xs font-black text-indigo-500 opacity-60 group-hover/topic:opacity-100 group-hover/topic:translate-x-0.5 transition-all">
                                        &rarr;
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>


              </>
            )}

            {activeTab === 'analytics' && (
              <div className="flex-1 flex flex-col space-y-6">
                
                {/* DIAGNOSTIC / DEMO BANNER IF EMPTY */}
                {safeHistory.length === 0 && (
                  <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-3xl text-left flex gap-3 shadow-sm">
                    <span className="text-xl">💡</span>
                    <div>
                      <h4 className="font-extrabold text-xs text-amber-800">Diagnostic Practice Mode</h4>
                      <p className="text-[11px] text-amber-700/90 font-semibold mt-0.5 leading-normal">
                        No custom quizzes completed yet. Showing mock diagnostic curriculum data. Finish any curriculum quiz in the "Quiz Maker" tab to start tracking your real performance over time!
                      </p>
                    </div>
                  </div>
                )}

                {/* OVERVIEW STATS GRID */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Total Quizzes Card */}
                  <div className="bg-white border border-zinc-200/80 rounded-3xl p-4 shadow-sm flex flex-col items-center text-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 mb-1">
                      <ListChecks className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Completed</p>
                      <h5 className="text-xl font-black text-zinc-800 mt-0.5">
                        {safeHistory.length === 0 ? DEMO_HISTORY.length : safeHistory.length}
                      </h5>
                    </div>
                  </div>

                  {/* Average Accuracy Card */}
                  <div className="bg-white border border-zinc-200/80 rounded-3xl p-4 shadow-sm flex flex-col items-center text-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 mb-1">
                      <Percent className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Avg Accuracy</p>
                      <h5 className="text-xl font-black text-emerald-600 mt-0.5">
                        {(() => {
                          const list = safeHistory.length === 0 ? DEMO_HISTORY : safeHistory;
                          const sum = list.reduce((acc, item) => acc + item.accuracy, 0);
                          return Math.round(sum / list.length);
                        })()}%
                      </h5>
                    </div>
                  </div>

                  {/* Avg Response Time Card */}
                  <div className="bg-white border border-zinc-200/80 rounded-3xl p-4 shadow-sm flex flex-col items-center text-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500 mb-1">
                      <Timer className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Avg Speed</p>
                      <h5 className="text-xl font-black text-purple-600 mt-0.5">
                        {(() => {
                          const list = safeHistory.length === 0 ? DEMO_HISTORY : safeHistory;
                          const sum = list.reduce((acc, item) => acc + item.averageTimePerQuestion, 0);
                          return (sum / list.length).toFixed(1);
                        })()}s
                      </h5>
                    </div>
                  </div>

                  {/* Study Level Rank */}
                  <div className="bg-white border border-zinc-200/80 rounded-3xl p-4 shadow-sm flex flex-col items-center text-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 mb-1">
                      <Award className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Mastery Rank</p>
                      <h5 className="text-[11px] font-extrabold text-amber-600 uppercase tracking-wider mt-1">
                        {(() => {
                          const list = safeHistory.length === 0 ? DEMO_HISTORY : safeHistory;
                          const count = list.length;
                          const avgAcc = list.reduce((acc, item) => acc + item.accuracy, 0) / count;
                          if (avgAcc >= 90) return 'Elite Scholar 🏆';
                          if (avgAcc >= 75) return 'Honor Roll 🌟';
                          return 'Rising Star 📈';
                        })()}
                      </h5>
                    </div>
                  </div>
                </div>

                {/* CHART 1: TRENDS OVER TIME */}
                <div className="bg-white border border-zinc-200/80 rounded-[2rem] p-5 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="text-sm font-extrabold text-zinc-800 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                        <span>Performance Trends Over Time</span>
                      </h4>
                      <p className="text-[10px] font-bold text-zinc-400">Chronological accuracy (%) & question speed (sec)</p>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-md">
                      {safeHistory.length === 0 ? 'Diagnostic Data' : 'Live Results'}
                    </span>
                  </div>

                  {/* CHART WRAPPER */}
                  <div className="w-full h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={(safeHistory.length === 0 ? DEMO_HISTORY : safeHistory).map((item, index) => {
                          const cleanTitle = getQuizTitle(item);
                          return {
                            index: index + 1,
                            topic: cleanTitle.split(' - ').pop() || cleanTitle,
                            accuracy: item.accuracy,
                            speed: item.averageTimePerQuestion
                          };
                        })}
                        margin={{ top: 10, right: -5, left: -25, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.01}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis 
                          dataKey="index" 
                          tickLine={false} 
                          axisLine={false}
                          tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }} 
                        />
                        <YAxis 
                          yAxisId="left" 
                          domain={[0, 100]} 
                          tickLine={false} 
                          axisLine={false}
                          tick={{ fill: '#4F46E5', fontSize: 10, fontWeight: 'bold' }} 
                        />
                        <YAxis 
                          yAxisId="right" 
                          orientation="right" 
                          tickLine={false} 
                          axisLine={false}
                          tick={{ fill: '#7C3AED', fontSize: 10, fontWeight: 'bold' }} 
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="accuracy" 
                          stroke="#4F46E5" 
                          strokeWidth={2.5}
                          fillOpacity={1} 
                          fill="url(#colorAccuracy)" 
                          name="Accuracy"
                        />
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="speed" 
                          stroke="#7C3AED" 
                          strokeWidth={2}
                          dot={{ r: 4, strokeWidth: 1, fill: '#FFFFFF' }}
                          name="Avg Speed"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center items-center gap-6 mt-2 text-[10px] font-black">
                    <span className="flex items-center gap-1.5 text-indigo-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
                      Accuracy (%, left axis)
                    </span>
                    <span className="flex items-center gap-1.5 text-purple-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                      Speed (sec/q, right axis)
                    </span>
                  </div>
                </div>

                {/* CURRENT / SELECTED ATTEMPT DRILLDOWN */}
                {(() => {
                  const list = safeHistory.length === 0 ? DEMO_HISTORY : safeHistory;
                  const activeQuiz = selectedHistoryItem || (list.length > 0 ? list[list.length - 1] : null);
                  if (!activeQuiz) return null;

                  // Parse durations
                  const durations = activeQuiz.questionDurations || Array(activeQuiz.totalQuestions || 5).fill(12);
                  const correct = activeQuiz.correctAnswers || Array(activeQuiz.totalQuestions || 5).fill(true);
                  const questionChartData = durations.map((duration: number, idx: number) => {
                    const isCorrect = correct[idx] !== undefined ? correct[idx] : true;
                    return {
                      name: `Q${idx + 1}`,
                      duration,
                      correct: isCorrect,
                      fill: isCorrect ? '#10B981' : '#F43F5E'
                    };
                  });

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* BAR CHART: DURATION PER QUESTION */}
                      <div className="bg-white border border-zinc-200/80 rounded-[2rem] p-5 shadow-sm md:col-span-2">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
                              <Target className="w-4 h-4 text-purple-500" />
                              <span>Time Spent Per Question</span>
                            </h4>
                            <p className="text-[10px] font-bold text-zinc-400 mt-0.5 line-clamp-1">
                              Analysis of: {getQuizTitle(activeQuiz)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-bold">
                            <span className="flex items-center gap-1 text-emerald-600">
                              <span className="w-2 h-2 rounded bg-emerald-500" /> Correct
                            </span>
                            <span className="flex items-center gap-1 text-rose-600">
                              <span className="w-2 h-2 rounded bg-rose-500" /> Incorrect
                            </span>
                          </div>
                        </div>

                        {/* BAR CHART COMPONENT */}
                        <div className="w-full h-48 mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={questionChartData}
                              margin={{ top: 10, right: 0, left: -30, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                              <XAxis 
                                dataKey="name" 
                                tickLine={false} 
                                axisLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }} 
                              />
                              <YAxis 
                                tickLine={false} 
                                axisLine={false}
                                label={{ value: 'Seconds', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 9, fontWeight: 'black', offset: 10 }}
                                tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }} 
                              />
                              <Tooltip content={<QuestionTooltip />} />
                              <Bar 
                                dataKey="duration" 
                                radius={[8, 8, 0, 0]} 
                                barSize={24}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* SELECTED ATTEMPT INFO BOX */}
                      <div className="bg-white border border-zinc-200/80 rounded-[2rem] p-5 shadow-sm flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-black uppercase text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">Selected Attempt</span>
                          <h4 className="text-sm font-black text-zinc-800 mt-2 leading-snug">{getQuizTitle(activeQuiz)}</h4>
                          <div className="flex items-center gap-1.5 text-zinc-500 font-semibold text-[11px] mt-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{new Date(activeQuiz.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>

                        <div className="space-y-2 mt-4 pt-4 border-t border-zinc-100">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-bold">Accuracy Score</span>
                            <span className="font-extrabold text-zinc-800">{activeQuiz.score} / {activeQuiz.totalQuestions} ({activeQuiz.accuracy}%)</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-bold">Average Speed</span>
                            <span className="font-extrabold text-zinc-800">{activeQuiz.averageTimePerQuestion}s / question</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-bold">Status</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              activeQuiz.accuracy >= 80 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                            }`}>{activeQuiz.accuracy >= 80 ? 'Mastered' : 'Reviewed'}</span>
                          </div>
                        </div>
                      </div>

                      {/* QUESTIONS LIST REVIEW FOR SELECTED ATTEMPT */}
                      <div className="md:col-span-3 bg-white border border-zinc-200/80 rounded-[2rem] p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-zinc-150 pb-3">
                          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-2">
                            <ListChecks className="w-4 h-4 text-indigo-500" />
                            <span>Asked Questions & AI Solutions</span>
                          </h4>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100">
                            {activeQuiz.score} / {activeQuiz.totalQuestions} Correct
                          </span>
                        </div>

                        <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                          {getReviewQuestionsForAttempt(activeQuiz).map((q: any, idx: number) => {
                            const userAnswer = q.userAnswer || "";
                            const isCorrect = q.isCorrect !== undefined ? q.isCorrect : (userAnswer === q.correctAnswer);
                            
                            return (
                              <div key={idx} className="p-4 rounded-2xl border border-zinc-150/80 bg-zinc-50/10 space-y-3">
                                {/* Question Text */}
                                <div className="flex gap-2 items-start">
                                  <span className="w-5 h-5 rounded bg-zinc-100 text-zinc-600 text-[10px] font-black flex items-center justify-center shrink-0">
                                    {idx + 1}
                                  </span>
                                  <h5 className="text-xs font-black text-zinc-800 pt-0.5 leading-relaxed">
                                    {q.question}
                                  </h5>
                                </div>

                                {/* Options Grid */}
                                <div className="grid grid-cols-1 gap-2 pl-7">
                                  {q.options?.map((option: string, oIdx: number) => {
                                    const isOptionUserAnswer = option === userAnswer;
                                    const isOptionCorrect = option === q.correctAnswer;
                                    
                                    let optStyle = "border-zinc-200/60 bg-white text-zinc-600";
                                    if (isOptionCorrect) {
                                      optStyle = "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold shadow-sm";
                                    } else if (isOptionUserAnswer && !isCorrect) {
                                      optStyle = "border-rose-500 bg-rose-50/70 text-rose-950 font-bold shadow-sm";
                                    }

                                    return (
                                      <div
                                        key={oIdx}
                                        className={`border p-2.5 rounded-xl text-xs font-semibold flex items-start gap-2 ${optStyle}`}
                                      >
                                        <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[8px] font-black shrink-0">
                                          {String.fromCharCode(65 + oIdx)}
                                        </span>
                                        <span className="flex-1">{option}</span>
                                        {isOptionCorrect && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                        )}
                                        {isOptionUserAnswer && !isCorrect && (
                                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Explanation */}
                                {q.explanation && (
                                  <div className="pl-7">
                                    <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100/50 space-y-1">
                                      <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" />
                                        <span>AI Tutor Explanation</span>
                                      </span>
                                      <p className="text-[10px] font-bold text-zinc-600 leading-relaxed">
                                        {q.explanation}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* HISTORICAL SESSIONS LIST */}
                <div className="bg-white border border-zinc-200/80 rounded-[2rem] p-5 shadow-sm">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                    <Clipboard className="w-4 h-4 text-zinc-400" />
                    <span>Learning Session History</span>
                  </h4>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {(safeHistory.length === 0 ? DEMO_HISTORY : safeHistory).slice().reverse().map((item) => {
                      const list = safeHistory.length === 0 ? DEMO_HISTORY : safeHistory;
                      const activeQuiz = selectedHistoryItem || (list.length > 0 ? list[list.length - 1] : null);
                      const isSelected = activeQuiz && activeQuiz.id === item.id;
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            triggerVibration(10);
                            setSelectedHistoryItem(item);
                          }}
                          className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.995] ${
                            isSelected 
                              ? 'bg-indigo-50/50 border-indigo-200 shadow-sm' 
                              : 'bg-zinc-50/20 border-zinc-200/50 hover:bg-zinc-50 hover:border-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                              item.accuracy >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'
                            }`}>
                              {item.score}/{item.totalQuestions}
                            </div>
                            <div>
                              <p className="font-extrabold text-xs text-zinc-800 line-clamp-1">{getQuizTitle(item)}</p>
                              <p className="text-[10px] font-bold text-zinc-400 mt-0.5">
                                {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="font-black text-xs text-zinc-700">{item.accuracy}%</p>
                              <p className="text-[9px] font-bold text-zinc-400 mt-0.5">{item.averageTimePerQuestion}s/q</p>
                            </div>
                            <span className="text-zinc-300 font-extrabold select-none">&rsaquo;</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}
          </motion.div>
          )
        )}

        {quizState === 'playing' && quiz.length > 0 && (
          <div className="flex-1 flex flex-col">
            {/* Progress indicator */}
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-extrabold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-full shadow-sm">
                Question {currentIndex + 1} of {quiz.length}
              </span>
              <span className="text-xs font-bold text-zinc-500">
                Score: {score}/{currentIndex + (isAnswered ? 1 : 0)}
              </span>
            </div>

            {/* Question Text Card */}
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white border border-zinc-200 rounded-[2rem] p-6 mb-6 relative overflow-hidden shadow-sm"
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
              <p className="text-base md:text-lg font-extrabold leading-relaxed text-zinc-800">
                {quiz[currentIndex].question}
              </p>
            </motion.div>

            {/* Options List */}
            <div className="grid grid-cols-1 gap-3 mb-6">
              {(quiz[currentIndex]?.options || []).map((option, idx) => {
                const isSelected = selectedOption === option;
                const correctAnswer = quiz[currentIndex]?.correctAnswer || "";
                const isCorrectAnswer = option === correctAnswer;
                
                let btnStyle = 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300';
                if (isAnswered) {
                  if (isCorrectAnswer) {
                    btnStyle = 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-sm';
                  } else if (isSelected) {
                    btnStyle = 'bg-rose-50 border-rose-400 text-rose-800 shadow-sm';
                  } else {
                    btnStyle = 'bg-zinc-50 border-zinc-100 text-zinc-400 opacity-60';
                  }
                } else if (isSelected) {
                  btnStyle = 'bg-indigo-50 border-indigo-400 text-indigo-800';
                }

                return (
                  <button
                    key={idx}
                    disabled={isAnswered}
                    onClick={() => handleOptionSelect(option)}
                    className={`p-4 rounded-2xl border text-left font-bold text-sm transition-all duration-300 active:scale-[0.99] flex items-center justify-between shadow-sm ${btnStyle}`}
                  >
                    <span className="pr-4">{option}</span>
                    {isAnswered && isCorrectAnswer && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                    {isAnswered && isSelected && !isCorrectAnswer && <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Explanation section */}
            <AnimatePresence>
              {isAnswered && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-zinc-100 border border-zinc-200 rounded-2xl p-4 mb-6 shadow-inner"
                >
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-1.5 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    <span>Explanation</span>
                  </h4>
                  <p className="text-xs font-bold text-zinc-700 leading-relaxed">
                    {quiz[currentIndex].explanation}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Continue or Finish button */}
            {isAnswered && (
              <button
                onClick={handleNext}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white py-4 rounded-2xl font-bold text-base transition-all active:scale-98 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10"
              >
                {currentIndex + 1 < quiz.length ? 'Next Question' : 'Finish Quiz'}
              </button>
            )}
          </div>
        )}

        {quizState === 'results' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center"
          >
            {/* Dynamic visual badge */}
            <div className="relative mb-6">
              <div className="absolute -inset-4 rounded-full bg-indigo-500/20 blur-2xl animate-pulse" />
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 border border-indigo-400/30 flex items-center justify-center text-white text-4xl shadow-xl relative z-10 select-none">
                <Award className="w-12 h-12" />
              </div>
            </div>

            <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">
              {score === quiz.length 
                ? 'Perfect Score! 🌟' 
                : score >= quiz.length * 0.7 
                ? 'Excellent Job! 🎉' 
                : 'Great Effort! 📚'}
            </h3>
            <p className="text-sm font-bold text-zinc-500 mb-6 max-w-xs leading-relaxed">
              You scored <span className="text-indigo-600 font-extrabold">{score} out of {quiz.length}</span> correct on this custom high school curriculum assessment.
            </p>

            {/* Quota info for free users */}
            {!deepFocus && !isProUser() && (
            <div className="bg-zinc-50 border border-zinc-200 px-6 py-3 rounded-full mb-8 flex items-center gap-2.5 shadow-sm">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <span className="font-extrabold text-zinc-600 text-sm">Interaction Logged to Daily Quota</span>
            </div>
            )}

            {/* Buttons stack */}
            <div className="w-full space-y-3">
              <button
                onClick={handleOpenShareModal}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white py-4 rounded-2xl font-bold text-sm transition-all active:scale-98 border border-emerald-500/30 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                <Share2 className="w-4 h-4" />
                <span>Share Performance Card</span>
              </button>

              <button
                onClick={restartQuiz}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white py-4 rounded-2xl font-bold text-sm transition-all active:scale-98 border border-indigo-500/30 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Try Another Quiz</span>
              </button>
            </div>
          </motion.div>
        )}

      </div>

      {/* SHARE MODAL OVERLAY */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-zinc-950 text-white rounded-[2.5rem] border border-zinc-800 p-6 max-w-md w-full shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  triggerVibration(15);
                  setShowShareModal(false);
                }}
                className="absolute top-5 right-5 w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>

                <h3 className="text-xl font-black tracking-tight text-white mb-1">
                  Your Quiz Score Card
                </h3>
                <p className="text-xs text-zinc-400 font-semibold mb-6">
                  Save or share your performance on social media!
                </p>

                {/* Card Preview Container */}
                <div className="w-full aspect-square max-w-[320px] rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-inner flex items-center justify-center relative group mb-6">
                  {shareImageUrl ? (
                    <img
                      src={shareImageUrl}
                      alt="HelpYou AI Performance Card"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 w-full">
                      <AdvancedLoader type="inline" context="general" subtext="Generating high-definition card..." />
                    </div>
                  )}
                </div>

                {/* Share Notification Message */}
                {shareMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-5 px-4 py-2.5 rounded-xl text-xs font-bold w-full ${
                      shareStatus === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {shareMessage}
                  </motion.div>
                )}

                {/* Action buttons stack */}
                <div className="w-full mb-4">
                  <button
                    onClick={async () => {
                      triggerVibration(15);
                      try {
                        const blob = dataURItoBlob(shareImageUrl);
                        const file = new File([blob], 'HelpYou_AI_Quiz_Score.png', { type: 'image/png' });
                        
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                          await navigator.share({
                            files: [file],
                            title: 'My HelpYou AI Quiz Score!',
                            text: `Check out my score on HelpYou AI! 🧠 I scored ${score}/${quiz.length} (${Math.round((score/quiz.length)*100)}%) on ${topic || 'Custom Assessment'}.`,
                          });
                          setShareStatus('success');
                          setShareMessage('Card shared successfully! 🎉');
                        } else {
                          // Try copying to clipboard as fallback
                          if (navigator.clipboard && navigator.clipboard.write) {
                            await navigator.clipboard.write([
                              new ClipboardItem({ 'image/png': blob })
                            ]);
                            setShareStatus('success');
                            setShareMessage('Copied card to clipboard! 📋 Paste to share!');
                          } else {
                            throw new Error('Share/Copy not supported');
                          }
                        }
                      } catch (err) {
                        console.error('Sharing failed:', err);
                        // Fallback: Copy summary text
                        try {
                          const totalTime = questionDurations.reduce((acc, curr) => acc + curr, 0);
                          await navigator.clipboard.writeText(
                            `🧠 My HelpYou AI Quiz Performance:\nSubject: ${topic || 'Custom Assessment'}\nScore: ${score}/${quiz.length} (${Math.round((score/quiz.length)*100)}%)\nTime taken: ${Math.round(totalTime)}s`
                          );
                          setShareStatus('success');
                          setShareMessage('Copied statistics text to clipboard! 📋');
                        } catch (copyErr) {
                          setShareStatus('error');
                          setShareMessage('Could not share or copy performance card.');
                        }
                      }
                      setTimeout(() => {
                        setShareStatus('idle');
                        setShareMessage('');
                      }, 4000);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all active:scale-98 shadow-lg shadow-indigo-600/15 cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Share Performance Card</span>
                  </button>
                </div>

                {/* Clipboard copy helper */}
                <button
                  onClick={async () => {
                    triggerVibration(15);
                    try {
                      const blob = dataURItoBlob(shareImageUrl);
                      if (navigator.clipboard && navigator.clipboard.write) {
                        await navigator.clipboard.write([
                          new ClipboardItem({ 'image/png': blob })
                        ]);
                        setShareStatus('success');
                        setShareMessage('Copied score card image to clipboard! 📋 Paste in any app!');
                      } else {
                        // Fallback: Copy summary text
                        const totalTime = questionDurations.reduce((acc, curr) => acc + curr, 0);
                        await navigator.clipboard.writeText(
                          `🧠 My HelpYou AI Quiz Performance:\nSubject: ${topic || 'Custom Assessment'}\nScore: ${score}/${quiz.length} (${Math.round((score/quiz.length)*100)}%)\nTime taken: ${Math.round(totalTime)}s`
                        );
                        setShareStatus('success');
                        setShareMessage('Copied statistics text to clipboard! 📋');
                      }
                    } catch (err) {
                      console.error('Copy failed:', err);
                      setShareStatus('error');
                      setShareMessage('Unable to copy image.');
                    }
                    setTimeout(() => {
                      setShareStatus('idle');
                      setShareMessage('');
                    }, 4000);
                  }}
                  className="text-[11px] font-black tracking-wider uppercase text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Image to Clipboard</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiz Review Modal */}
      <AnimatePresence>
        {reviewingAttempt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-zinc-200"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <div>
                  <h3 className="text-base font-black text-zinc-950 flex items-center gap-2">
                    <span>Quiz Review</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100">
                      {reviewingAttempt.score} / {reviewingAttempt.totalQuestions} ({reviewingAttempt.accuracy}%)
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-500 font-bold mt-1 leading-tight line-clamp-1">
                    {getQuizTitle(reviewingAttempt)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setReviewingAttempt(null);
                  }}
                  className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-colors border-none cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body: Question Review List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {getReviewQuestionsForAttempt(reviewingAttempt).map((q: any, idx: number) => {
                  const userAnswer = q.userAnswer || "";
                  const isCorrect = q.isCorrect !== undefined ? q.isCorrect : (userAnswer === q.correctAnswer);
                  
                  return (
                    <div key={idx} className="p-5 rounded-3xl border border-zinc-150/80 bg-zinc-50/10 space-y-4">
                      {/* Question Text */}
                      <div className="flex gap-2.5 items-start">
                        <span className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-600 text-xs font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <h4 className="text-xs font-black text-zinc-900 pt-0.5 leading-relaxed">
                          {q.question}
                        </h4>
                      </div>

                      {/* Options Grid */}
                      <div className="grid grid-cols-1 gap-2 pl-8.5">
                        {q.options?.map((option: string, oIdx: number) => {
                          const isOptionUserAnswer = option === userAnswer;
                          const isOptionCorrect = option === q.correctAnswer;
                          
                          let optStyle = "border-zinc-200/60 bg-white text-zinc-700";
                          if (isOptionCorrect) {
                            optStyle = "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold";
                          } else if (isOptionUserAnswer && !isCorrect) {
                            optStyle = "border-rose-500 bg-rose-50/70 text-rose-950 font-bold";
                          }

                          return (
                            <div
                              key={oIdx}
                              className={`border-2 p-3 rounded-xl text-xs font-bold flex items-start gap-2 ${optStyle}`}
                            >
                              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[9px] font-black shrink-0">
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <span className="flex-1">{option}</span>
                              {isOptionCorrect && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              )}
                              {isOptionUserAnswer && !isCorrect && (
                                <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Explanation */}
                      {q.explanation && (
                        <div className="pl-8.5">
                          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100/50 space-y-1">
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>AI Explanation</span>
                            </span>
                            <p className="text-[10px] font-bold text-zinc-600 leading-relaxed">
                              {q.explanation}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/30 flex justify-end">
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setReviewingAttempt(null);
                  }}
                  className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-colors border-none cursor-pointer"
                >
                  Close Review
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
