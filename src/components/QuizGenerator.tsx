import { getApiUrl } from '../utils/api';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BookOpen, Loader2, ArrowLeft, Award, CheckCircle2, XCircle, 
  RotateCcw, HelpCircle, Coins, ChevronDown, ChevronUp,
  TrendingUp, Timer, Percent, Clipboard, Target, ListChecks, Calendar,
  UploadCloud, FileText, Mic, MicOff, Camera, Image, Sparkles,
  Share2, Download, Check, X, Lightbulb, History, Clock, Trash2, Play, Flag, Copy
} from 'lucide-react';
import ReportAIModal from './ReportAIModal';
import { extractTextFromPdf } from '../utils/pdfExtractor';
import GlobalMarkdown, { formatQuizMath } from './GlobalMarkdown';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { deductCoins, getCoins, isProUser } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { getUserProfileData, getProfilePayload } from '../utils/profile';
import { detectUserRegion } from '../utils/regionDetector';
import { useSettings } from '../hooks/useSettings';
import { saveMistakeToVault } from '../utils/mistakes';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { pickNativeFiles, takeNativePhoto } from '../utils/mobilePicker';
import { showToast } from '../utils/toast';
import { shareImageMobile } from '../utils/mobileSaver';
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

import { getScalableRelevantQuizzes, cleanSubjectTitle } from '../utils/curriculumMap';
import { getStoredExamBlueprint, saveStoredExamBlueprint } from '../utils/academicBlueprint';
import { getCachedCurriculumContent, saveCachedCurriculumContent, parseTopicHierarchy, isValidAcademicTopicInput, registerVerifiedChapterSubTopic, isCurriculumContentCached, verifySubTopicWithAI, removeCustomChapterSubTopic, getVerifiedChapterSubTopics } from '../utils/communityCache';

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
  'core_reading': { USA: 'SAT Reading & Writing', UK: 'GCSE English Language', IB: 'SL English A', CA: 'University Preparation English', AU: 'ATAR English', Global: 'Core Reading & Writing' },
  'core_math': { USA: 'SAT Math', UK: 'GCSE Maths', IB: 'SL Mathematics', CA: 'Grade 11/12 Functions & Applications', AU: 'ATAR Mathematics Methods', Global: 'Core Mathematics' },
  'adv_english': { USA: 'AP English Language', UK: 'A-Level English Language', IB: 'HL English A', CA: 'University Preparation English', AU: 'ATAR English', Global: 'Advanced English Language' },
  'adv_cs': { USA: 'AP Computer Science A', UK: 'A-Level Computer Science', IB: 'HL Computer Science', CA: 'Grade 12 Computer Science (ICS4U)', AU: 'ATAR Computer Science', Global: 'Advanced Computer Science' },
  'discrete_math': { USA: 'Discrete Math', UK: 'Discrete Mathematics', IB: 'Discrete Math', CA: 'Grade 12 Data Management (MDM4U)', AU: 'ATAR Mathematics Applications', Global: 'Discrete Mathematics' },
  'python_basics': { USA: 'Python Basics', UK: 'Python Programming', IB: 'Python Basics', CA: 'Python Programming', AU: 'ATAR Computer Science Basics', Global: 'Python Programming' },
  'adv_macro': { USA: 'AP Macroeconomics', UK: 'A-Level Economics', IB: 'HL Economics', CA: 'Grade 12 Economics (CIA4U)', AU: 'ATAR Economics', Global: 'Advanced Macroeconomics' },
  'adv_stats': { USA: 'AP Statistics', UK: 'A-Level Statistics', IB: 'HL Statistics', CA: 'Grade 12 Data Management (MDM4U)', AU: 'ATAR Mathematics Applications', Global: 'Advanced Statistics' },
  'fin_accounting': { USA: 'Financial Accounting', UK: 'Financial Accounting', IB: 'Financial Accounting', CA: 'Grade 12 Financial Accounting (BAT4M)', AU: 'ATAR Accounting & Finance', Global: 'Financial Accounting' },
  'adv_biology': { USA: 'AP Biology', UK: 'A-Level Biology', IB: 'HL Biology', CA: 'Grade 12 Biology (SBI4U)', AU: 'ATAR Biology', Global: 'Advanced Biology' },
  'adv_chem': { USA: 'AP Chemistry', UK: 'A-Level Chemistry', IB: 'HL Chemistry', CA: 'Grade 12 Chemistry (SCH4U)', AU: 'ATAR Chemistry', Global: 'Advanced Chemistry' },
  'anatomy_phys': { USA: 'Anatomy & Physiology', UK: 'Human Anatomy & Physiology', IB: 'Anatomy & Physiology', CA: 'Grade 12 Anatomy & Physiology', AU: 'ATAR Human Biology', Global: 'Anatomy & Physiology' },
  'adv_ushistory': { USA: 'AP US History', UK: 'A-Level History', IB: 'HL History', CA: 'Canadian History (CHI4U)', AU: 'ATAR Modern History', Global: 'Advanced History' },
  'adv_psych': { USA: 'AP Psychology', UK: 'A-Level Psychology', IB: 'HL Psychology', CA: 'Grade 12 Psychology', AU: 'ATAR Psychology', Global: 'Advanced Psychology' },
  'adv_gov': { USA: 'AP US Government', UK: 'A-Level Government & Politics', IB: 'HL Global Politics', CA: 'Grade 12 Canadian Government & Politics', AU: 'ATAR Politics & Law', Global: 'Advanced Civics & Politics' },
  'adv_calc': { USA: 'AP Calculus BC', UK: 'A-Level Further Maths', IB: 'HL Mathematics Analysis', CA: 'Calculus and Vectors (MCV4U)', AU: 'ATAR Specialist Mathematics', Global: 'Advanced Calculus' },
  'adv_physics': { USA: 'AP Physics C: Mechanics', UK: 'A-Level Physics', IB: 'HL Physics', CA: 'Grade 12 Physics (SPH4U)', AU: 'ATAR Physics', Global: 'Advanced Physics' },
  'eng_design': { USA: 'Engineering Design', UK: 'Design & Technology', IB: 'Design Technology', CA: 'Grade 12 Technological Design (TDJ4M)', AU: 'ATAR Engineering Studies', Global: 'Engineering Design' },

  // College 101 Keys
  'college_comp': { USA: 'College Composition', UK: 'Academic Writing 101', IB: 'University Writing', CA: 'College Composition', AU: 'College Composition', Global: 'College Composition' },
  'calc_1': { USA: 'Calculus I', UK: 'University Calculus 1', IB: 'Calculus I', CA: 'Calculus I', AU: 'Calculus I', Global: 'Calculus I' },
  'intro_cs': { USA: 'Intro to Programming (CS101)', UK: 'Intro to Programming 101', IB: 'Programming Fundamentals', CA: 'Intro to Programming', AU: 'Intro to Programming', Global: 'Intro to Programming' },
  'data_struct': { USA: 'Data Structures', UK: 'Data Structures & Algorithms', IB: 'Data Structures', CA: 'Data Structures', AU: 'Data Structures', Global: 'Data Structures' },
  'discrete_math_college': { USA: 'Discrete Mathematics', UK: 'Discrete Mathematics', IB: 'Discrete Mathematics', CA: 'Discrete Mathematics', AU: 'Discrete Mathematics', Global: 'Discrete Mathematics' },
  'gen_chem_101': { USA: 'General Chemistry 101', UK: 'Chemistry 101', IB: 'General Chemistry', CA: 'General Chemistry 101', AU: 'General Chemistry 101', Global: 'General Chemistry 101' },
  'intro_bio_101': { USA: 'Introductory Biology 101', UK: 'Biology 101', IB: 'General Biology', CA: 'Introductory Biology 101', AU: 'Introductory Biology 101', Global: 'Introductory Biology 101' },
  'anatomy_101': { USA: 'Anatomy & Physiology 101', UK: 'Anatomy & Physiology 101', IB: 'Human Anatomy 101', CA: 'Anatomy & Physiology 101', AU: 'Anatomy & Physiology 101', Global: 'Anatomy & Physiology 101' },
  'micro_econ_101': { USA: 'Microeconomics 101', UK: 'Microeconomics 101', IB: 'Intro Microeconomics', CA: 'Microeconomics 101', AU: 'Microeconomics 101', Global: 'Microeconomics 101' },
  'principles_mgmt': { USA: 'Principles of Management', UK: 'Management Principles', IB: 'Business Management', CA: 'Principles of Management', AU: 'Principles of Management', Global: 'Principles of Management' },
  'us_hist_101': { USA: 'US History 101', UK: 'Modern History 101', IB: 'World History 101', CA: 'History 101', AU: 'History 101', Global: 'History 101' },
  'intro_psych_101': { USA: 'Intro to Psychology 101', UK: 'Psychology 101', IB: 'General Psychology', CA: 'Intro to Psychology 101', AU: 'Intro to Psychology 101', Global: 'Intro to Psychology 101' },
  'amer_govt_101': { USA: 'American Government 101', UK: 'Political Systems 101', IB: 'Global Politics 101', CA: 'Intro to Political Science', AU: 'Intro to Political Science', Global: 'Intro to Political Science' },
  'calc_2': { USA: 'Calculus II', UK: 'University Calculus 2', IB: 'Calculus II', CA: 'Calculus II', AU: 'Calculus II', Global: 'Calculus II' },
  'phys_1_mech': { USA: 'Physics I: Mechanics', UK: 'University Physics 1', IB: 'Physics Mechanics 101', CA: 'Physics I: Mechanics', AU: 'Physics I: Mechanics', Global: 'Physics I: Mechanics' },
  'eng_fund': { USA: 'Engineering Fundamentals', UK: 'Engineering Science 101', IB: 'Engineering Fundamentals', CA: 'Engineering Fundamentals', AU: 'Engineering Fundamentals', Global: 'Engineering Fundamentals' }
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
  
  if (!inCollege && (regionSystem === 'CA' || regionSystem === 'Canada')) {
    const caKeys = ['core_math', 'adv_calc', 'core_reading', 'adv_physics'];
    const caTitles: Record<string, string> = {
      'core_math': 'Grade 11/12 Functions',
      'adv_calc': 'Calculus and Vectors (MCV4U)',
      'core_reading': 'University Preparation English',
      'adv_physics': 'Grade 12 Physics (SPH4U)'
    };
    return caKeys.map(key => {
      const details = SUBJECT_DETAILS[key] || {
        subtitle: 'Practice Questions & Exam Prep',
        themeColor: 'bg-purple-50/70 text-purple-600 border-purple-100',
        icon: '📚',
        topics: ['Core Concepts', 'Practice Problems', 'Exam Strategies']
      };
      return {
        id: key,
        key,
        title: caTitles[key],
        subtitle: details.subtitle,
        themeColor: details.themeColor,
        icon: details.icon,
        topics: details.topics,
        isCore: key === 'core_reading' || key === 'core_math',
        tierLabel: 'High School'
      };
    });
  }

  if (!inCollege && (regionSystem === 'AU' || regionSystem === 'Australia')) {
    const auKeys = ['core_math', 'adv_calc', 'core_reading', 'adv_physics'];
    const auTitles: Record<string, string> = {
      'core_math': 'ATAR Mathematics Methods',
      'adv_calc': 'ATAR Specialist Mathematics',
      'core_reading': 'ATAR English',
      'adv_physics': 'ATAR Physics'
    };
    return auKeys.map(key => {
      const details = SUBJECT_DETAILS[key] || {
        subtitle: 'Practice Questions & Exam Prep',
        themeColor: 'bg-purple-50/70 text-purple-600 border-purple-100',
        icon: '📚',
        topics: ['Core Concepts', 'Practice Problems', 'Exam Strategies']
      };
      return {
        id: key,
        key,
        title: auTitles[key],
        subtitle: details.subtitle,
        themeColor: details.themeColor,
        icon: details.icon,
        topics: details.topics,
        isCore: key === 'core_reading' || key === 'core_math',
        tierLabel: 'High School'
      };
    });
  }

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
    const data = payload[0]?.payload || {};
    const title = data.topic || data.fullLabel || data.title || getQuizTitle(data) || 'Practice Quiz';
    const accuracyItem = payload.find((p: any) => p.dataKey === 'accuracy');
    const speedItem = payload.find((p: any) => p.dataKey === 'speed');
    const isPerQ = Boolean(data.isQuestionMode);

    return (
      <div className="bg-white/95 backdrop-blur-md border border-zinc-200/90 p-3 rounded-2xl shadow-xl text-xs z-50 min-w-[150px]">
        <p className="font-black text-zinc-800 mb-0.5 leading-snug">{title}</p>
        {isPerQ ? (
          <div className="space-y-1.5 font-bold mt-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500 text-[11px]">Outcome:</span>
              <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${data.isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {data.isCorrect ? 'Correct ✅' : 'Incorrect ❌'}
              </span>
            </div>
            {speedItem && (
              <p className="text-amber-700 flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shadow-xs" />
                  <span>Time Spent:</span>
                </span>
                <span className="font-black">{data.realSpeed !== undefined ? data.realSpeed : speedItem.value}s</span>
              </p>
            )}
            {accuracyItem && (
              <p className="text-indigo-600 flex items-center justify-between gap-3 text-[10px] text-zinc-400 font-semibold border-t border-zinc-100 pt-1 mt-1">
                <span>Running Avg:</span>
                <span className="font-black text-indigo-600">{accuracyItem.value}%</span>
              </p>
            )}
          </div>
        ) : (
          <>
            {data.subtitle && (
              <p className="text-[10px] font-bold text-zinc-400 mb-2">{data.subtitle}</p>
            )}
            <div className="space-y-1.5 font-bold">
              {accuracyItem && (
                <p className="text-indigo-600 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block shadow-xs" />
                    <span>Accuracy:</span>
                  </span>
                  <span className="font-black">{accuracyItem.value}%</span>
                </p>
              )}
              {speedItem && (
                <p className="text-amber-700 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shadow-xs" />
                    <span>Speed:</span>
                  </span>
                  <span className="font-black">{speedItem.value}s</span>
                </p>
              )}
            </div>
          </>
        )}
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
    if (reviewingAttempt) {
      setReviewingAttempt(null);
      return;
    }
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    if (showQuestionPalette) {
      setShowQuestionPalette(false);
      return;
    }
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
  const [isOffline, setIsOffline] = useState(false);

  // --- ASK AI QUESTION TUTOR STATES ---
  const [showAskAIModal, setShowAskAIModal] = useState(false);
  const [askAIMode, setAskAIMode] = useState<'choose' | 'hint' | 'step_by_step'>('choose');
  const [askAILoadingMode, setAskAILoadingMode] = useState<'hint' | 'step_by_step' | null>(null);
  const askAILoading = !!askAILoadingMode;
  const [copiedAiHelp, setCopiedAiHelp] = useState(false);
  const askAICacheRef = useRef<Record<number, { hint?: string; step_by_step?: string }>>({});
  const [askAICache, setAskAICache] = useState<Record<number, { hint?: string; step_by_step?: string }>>({});
  // Track active AI Doubt Mode per question index so output renders directly under that question
  const [activeQuestionAIMode, setActiveQuestionAIMode] = useState<Record<number, 'hint' | 'step_by_step' | null>>({});

  const handleOpenAskAI = (currentQ?: Question) => {
    triggerVibration(15);
    setAskAIMode('choose'); // ALWAYS show the 2 options selection sheet
    setShowAskAIModal(true);
  };

  const handleSelectAIHelpOption = (targetMode: 'hint' | 'step_by_step', targetIdx: number = currentIndex) => {
    triggerVibration(15);
    setShowAskAIModal(false); // Close selection sheet immediately! Output will appear under the question
    setActiveQuestionAIMode(prev => ({ ...prev, [targetIdx]: targetMode }));
    handleRequestAIHelp(targetMode, targetIdx);
  };

  const handleRequestAIHelp = async (targetMode: 'hint' | 'step_by_step', targetIdx: number = currentIndex) => {
    triggerVibration(15);
    setAskAIMode(targetMode);
    setActiveQuestionAIMode(prev => ({ ...prev, [targetIdx]: targetMode }));
    setCopiedAiHelp(false);

    // 1. Instant Cache Check: If this question and mode are already cached, switch instantly without re-fetching
    const cachedItem = askAICacheRef.current[targetIdx]?.[targetMode] || askAICache[targetIdx]?.[targetMode];
    if (cachedItem) {
      return;
    }

    // 2. Prevent duplicate concurrent requests for the same mode
    if (askAILoadingMode === targetMode) {
      return;
    }

    setAskAILoadingMode(targetMode);
    const curQ = quiz[targetIdx];
    if (!curQ) {
      setAskAILoadingMode(null);
      return;
    }

    try {
      let explanationText = '';

      const profile = getUserProfileData();

      // Layer 1: Attempt dedicated /api/quiz-ai-help endpoint
      try {
        const res = await fetch(getApiUrl('/api/quiz-ai-help'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            question: curQ.question,
            options: curQ.options,
            correctAnswer: curQ.correctAnswer,
            explanation: curQ.explanation,
            mode: targetMode,
            gradeLevel: profile.gradeLevel,
            stream: profile.stream || profile.subject,
            country: profile.country,
            targetExam: profile.targetExam || profile.exam || safeGetItem('academic_exam') || safeGetItem('target_exam') || 'NEET',
            subject: cleanSubjectTitle(topic || profile.subject || 'Physics')
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.explanation) {
            explanationText = data.explanation;
          }
        }
      } catch (e) {
        console.warn("Dedicated quiz-ai-help unavailable, trying universal AI route...", e);
      }

      // Layer 2: Fallback to universal /api/chat endpoint (wrapped safely in try/catch)
      if (!explanationText) {
        try {
          const isHint = targetMode === 'hint';
          const sysInstruction = `You are an elite SAT/AP/Olympiad Master Coach and Professor.
A student is answering a multiple-choice question and clicked ${isHint ? '"Explain Question & Hint"' : '"Explain Step-by-Step Answer"'}.
Provide an in-depth breakdown formatted in Markdown.`;

          const userPrompt = `Question: ${curQ.question}
Options: ${Array.isArray(curQ.options) ? curQ.options.join(', ') : curQ.options}
Correct Option: ${curQ.correctAnswer || 'N/A'}
${curQ.explanation ? `Context: ${curQ.explanation}` : ''}
Explain: ${isHint ? 'Give guided conceptual clues without revealing the answer.' : 'Give complete step-by-step solution.'}`;

          const chatRes = await fetch(getApiUrl('/api/chat'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: userPrompt,
              customSystemInstruction: sysInstruction,
              isEvaluation: 'true', // returns text/plain cleanly
              gradeLevel: profile.gradeLevel,
              country: profile.country
            })
          });

          if (chatRes.ok) {
            const chatData = await chatRes.json();
            if (chatData && chatData.text) {
              explanationText = chatData.text;
            }
          }
        } catch (chatErr) {
          console.warn("Universal chat fallback failed, activating smart offline fallback:", chatErr);
        }
      }

      // Layer 3: True offline fallback (contextually derived from current question, no canned physics lines)
      if (!explanationText) {
        const isHint = targetMode === 'hint';
        if (isHint) {
          explanationText = `### 🎯 What This Question Is Asking\nThis question asks you to evaluate: **"${curQ.question}"**.\n\n### 🔑 Core Concept\nIdentify the core terms and mechanisms being tested, and relate them to the principles you studied in this chapter.\n\n### 💡 Guided Clues\n- **Clue 1:** Review each option individually to see which one directly aligns with the fundamental definitions.\n- **Clue 2:** Watch out for common distractors that describe related but distinct processes.\n- **Clue 3:** Eliminate options that contain partial truths or mismatched terms.`;
        } else {
          explanationText = `### 🎯 Step-by-Step Solution\n- **Correct Answer:** ${curQ.correctAnswer || 'Identified in options'}\n\n### 📝 Detailed Breakdown\n${curQ.explanation || 'The correct option accurately satisfies all criteria and principles presented in the question.'}\n\n### 💡 Key Takeaway\nAlways verify key scientific terms and eliminate distractors based on fundamental mechanisms on exam day!`;
        }
      }

      // Save into synchronous ref FIRST (immune to race conditions and closure staleness)
      if (!askAICacheRef.current[targetIdx]) {
        askAICacheRef.current[targetIdx] = {};
      }
      askAICacheRef.current[targetIdx][targetMode] = explanationText;

      // Update React state to trigger clean UI re-render
      setAskAICache(prev => ({
        ...prev,
        [targetIdx]: {
          ...(prev[targetIdx] || {}),
          ...askAICacheRef.current[targetIdx],
          [targetMode]: explanationText
        }
      }));
    } catch (err) {
      console.error("Error in handleFetchAIHelp:", err);
    } finally {
      setAskAILoadingMode(prev => (prev === targetMode ? null : prev));
    }
  };


  useEffect(() => {
    Network.getStatus().then((status) => {
      setIsOffline(!status.connected);
    }).catch(err => {
      console.warn("QuizGenerator: Failed to get initial network status", err);
    });

    const listener = Network.addListener('networkStatusChange', (status) => {
      setIsOffline(!status.connected);
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);
  
  // Inherit academic grade, track & region directly from global profile / storage context
  const currentUser = auth.currentUser;
  const userUid = currentUser?.uid;

  const [gradeLevel, setGradeLevel] = useState<string>(() => {
    return getUserProfileData().gradeLevel || '11th Grade';
  });

  const [academicTrack, setAcademicTrack] = useState<string>(() => {
    return getUserProfileData().stream || 'STEM / Engineering';
  });

  const getDerivedRegion = (uid?: string) => {
    const savedCountry = safeGetItem('academic_country') || (uid ? safeGetItem(`academic_country_${uid}`) : null);
    if (savedCountry === 'United States') return 'USA';
    if (savedCountry === 'Canada') return 'CA';
    if (savedCountry === 'United Kingdom') return 'UK';
    if (savedCountry === 'Australia') return 'AU';
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
      const profile = getUserProfileData();
      const updatedGrade = profile.gradeLevel || '11th Grade';
      const updatedTrack = profile.stream || 'STEM / Engineering';
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

  // Listen to verified community curriculum updates to re-render chapter units live
  useEffect(() => {
    const handleCurriculumUpdate = () => {
      setBlueprintRevision(prev => prev + 1);
    };
    window.addEventListener('helpyou-curriculum-updated', handleCurriculumUpdate);
    return () => {
      window.removeEventListener('helpyou-curriculum-updated', handleCurriculumUpdate);
    };
  }, []);

  const [syllabusResearchState, setSyllabusResearchState] = useState<'idle' | 'researching' | 'completed'>('idle');
  const [blueprintRevision, setBlueprintRevision] = useState(0);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [customSubTopicInput, setCustomSubTopicInput] = useState<{ [chapterKey: string]: string }>({});
  const [showCustomInputForChapter, setShowCustomInputForChapter] = useState<string | null>(null);
  const [customInputError, setCustomInputError] = useState<{ [chapterKey: string]: string }>({});
  const [isVerifyingSubTopic, setIsVerifyingSubTopic] = useState<{ [chapterKey: string]: boolean }>({});

  // Proactively deep research syllabus units for user's chosen subjects & exam
  useEffect(() => {
    let isMounted = true;
    const conductLiveSyllabusResearch = async () => {
      const profile = getUserProfileData();
      const currentBp = getStoredExamBlueprint();
      const targetExam = profile.targetExam || safeGetItem('academic_exam') || safeGetItem('target_exam') || '';

      const chosenSubjects: string[] = [];
      if (Array.isArray(profile.subjects) && profile.subjects.length > 0) {
        profile.subjects.forEach(s => {
          const str = String(s).trim();
          if (str && !chosenSubjects.includes(str)) chosenSubjects.push(str);
        });
      }
      if (chosenSubjects.length === 0 && profile.subject) {
        profile.subject.split(',').forEach(s => {
          const str = s.trim();
          if (str && !chosenSubjects.includes(str)) chosenSubjects.push(str);
        });
      }

      if (chosenSubjects.length === 0) return;

      // Check if any chosen subject lacks coreUnits in blueprint
      const missing = chosenSubjects.filter(subj => {
        const cleanSubj = subj.toLowerCase().trim();
        const found = currentBp ? Object.keys(currentBp).find(k => {
          const cleanK = k.toLowerCase().trim();
          return cleanK === cleanSubj || cleanSubj.includes(cleanK) || cleanK.includes(cleanSubj);
        }) : null;
        return !found || !Array.isArray(currentBp[found]?.coreUnits) || currentBp[found].coreUnits.length === 0;
      });

      if (missing.length > 0) {
        setSyllabusResearchState('researching');
        try {
          const res = await fetch(getApiUrl('/api/deep-research-exam-blueprint'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              country: profile.country,
              examName: targetExam || 'Standardized Examination',
              grade: profile.gradeLevel,
              subjects: chosenSubjects
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (isMounted && data && data.subjectsBlueprint) {
              const updated = { ...(currentBp || {}), ...data.subjectsBlueprint };
              saveStoredExamBlueprint(updated);
              setBlueprintRevision(prev => prev + 1);
              setSyllabusResearchState('completed');
            }
          }
        } catch (err) {
          console.warn('[QuizGenerator] Background syllabus research notice:', err);
          if (isMounted) setSyllabusResearchState('idle');
        }
      } else {
        setSyllabusResearchState('completed');
      }
    };

    conductLiveSyllabusResearch();
    return () => { isMounted = false; };
  }, [gradeLevel, academicTrack]);

  // Dynamic quiz generation (Grade Tier + Academic Track + Region Alias System + Live Blueprint)
  const mergedSubjects = useMemo(() => {
    return getScalableRelevantQuizzes(gradeLevel, academicTrack, regionSystem);
  }, [gradeLevel, academicTrack, regionSystem, blueprintRevision]);

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
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSnippet, setReportSnippet] = useState('');
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [showAllSubjects, setShowAllSubjects] = useState<boolean>(false);
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
  const [trendViewType, setTrendViewType] = useState<'overall' | 'questions'>('overall');
  const [currentQuizRecordId, setCurrentQuizRecordId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showQuestionPalette, setShowQuestionPalette] = useState(false);

  const handleJumpToQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= quiz.length) return;
    triggerVibration(10);
    setCurrentIndex(targetIndex);
    const prevAnswer = userAnswers[targetIndex];
    if (prevAnswer !== undefined) {
      setSelectedOption(prevAnswer);
      setIsAnswered(true);
    } else {
      setSelectedOption(null);
      setIsAnswered(false);
      setQuestionStartTime(Date.now());
    }
    setShowQuestionPalette(false);
  };

  const handleToggleHistory = () => {
    triggerVibration(10);
    if (!showHistory) {
      fetchHistory();
    }
    setShowHistory((prev) => !prev);
  };

  const handleDeleteHistoryItem = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    triggerVibration(15);
    try {
      if (item.id && !item.id.startsWith('local_')) {
        try {
          await deleteDoc(doc(db, 'quiz_results', item.id));
        } catch (dbErr) {
          console.warn("Notice: could not delete quiz from firestore:", dbErr);
        }
      }
      const localHistory = JSON.parse(safeGetItem('local_quiz_results') || '[]');
      const filtered = localHistory.filter((h: any) => h.id !== item.id);
      safeSetItem('local_quiz_results', JSON.stringify(filtered));
      setHistory((prev) => prev.filter((h) => h.id !== item.id));
      if (selectedHistoryItem?.id === item.id) {
        setSelectedHistoryItem(null);
      }
      showToast('Quiz deleted from history', 'info');
    } catch (err) {
      console.warn('Failed to delete quiz history item:', err);
      showToast('Quiz deleted from history', 'info');
    }
  };

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      const hasSubState = (
        reviewingAttempt ||
        showHistory ||
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
  }, [reviewingAttempt, showHistory, quizState, selectedHistoryItem, activeTab, showConfig, showShareModal]);

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

    // 1. Instant local persistence for zero data loss
    const localId = 'local_' + Date.now();
    try {
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
    } catch (_) {}

    // 2. Cloud Firestore synchronization (non-blocking)
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
        fetchHistory();
      } catch (err) {
        console.warn("Notice: Firestore initial save deferred to local storage:", err);
        fetchHistory();
      }
    } else {
      fetchHistory();
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
      console.warn("Notice: Firestore history fallback to local store: ", err?.message || err);
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
          if (prev >= 96) {
            return Math.min(Math.round((prev + 0.05) * 10) / 10, 97);
          }
          let inc = 1.0;
          if (prev < 25) inc = 1.6;
          else if (prev < 50) inc = 1.1;
          else if (prev < 75) inc = 0.7;
          else if (prev < 90) inc = 0.35;
          else inc = 0.12;

          const nextVal = Math.min(Math.round((prev + inc) * 10) / 10, 96);
          const stepIndex = Math.min(Math.floor((nextVal / 96) * (quizSteps.length - 1)), quizSteps.length - 1);
          setLoadingStep(stepIndex);
          return nextVal;
        });
      }, 350);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, quiz]);

  React.useEffect(() => {
    fetchHistory();
  }, [activeTab, uid]);

  const toggleListening = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-IN';

      baseTextRef.current = topic.trim();

      rec.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            finalTranscript += text + ' ';
          } else {
            interimTranscript += text;
          }
        }

        const currentSpeech = (finalTranscript + interimTranscript).trim();
        const base = baseTextRef.current;
        
        if (currentSpeech) {
          setTopic(base ? `${base} ${currentSpeech}` : currentSpeech);
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech recognition error:", e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
      triggerVibration(20);
    } catch (e) {
      console.error("Error starting speech recognition:", e);
      setIsListening(false);
    }
  };

  React.useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

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

    if (file.size > 15 * 1024 * 1024) {
      setError("PDF file size must not exceed 15MB.");
      return;
    }

    const rawName = file.name.replace(/\.[^/.]+$/, "");
    const isHashName = /^[0-9a-f_-]{12,}$/i.test(rawName) || /^(?:doc|file|download|img)[-_0-9]+/i.test(rawName) || !/[a-zA-Z]{3,}/.test(rawName);
    const cleanName = isHashName ? "PDF Study Notes" : rawName;

    setTopic(cleanName);
    setTopicToGenerate(cleanName);
    setPendingFile(file);
    setPendingGeneratorType('pdf');
    setShowConfig(true);
    setConfigCount(10);
    setCustomCountInput('');

    // Background on-device title extraction if filename is a random hex hash or generic ID
    if (isHashName) {
      extractTextFromPdf(file, 5).then((res) => {
        if (res.text && res.text.trim()) {
          const lines = res.text.split('\n').map(l => l.trim()).filter(l => l.length >= 4 && l.length <= 60 && !l.startsWith('---'));
          const candidate = lines.find(l => !/page \d+|copyright|all rights/i.test(l));
          if (candidate) {
            const refined = candidate.replace(/^#+\s*/, '').trim();
            setTopic(`PDF: ${refined}`);
            setTopicToGenerate(`PDF: ${refined}`);
          }
        }
      }).catch(() => {});
    }
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

    // Validate custom subtopic if present
    const hierarchy = parseTopicHierarchy(activeTopic);
    if (hierarchy.subTopic && hierarchy.subTopic !== 'All') {
      const check = isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter);
      if (!check.isValid) {
        setError(check.error || 'Please enter a valid academic concept or topic name.');
        triggerVibration([30, 50, 30]);
        return;
      }
    }

    setError(null);
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
      // 1. Perform high-speed on-device text extraction (extracts up to 60 pages in ~1s)
      // This reduces payload from 10MB binary to ~25KB text, completely eliminating mobile timeouts & 'Failed to fetch'!
      let clientExtractedText = '';
      try {
        const pdfRes = await extractTextFromPdf(file, 60);
        if (pdfRes.text && pdfRes.text.trim().length >= 50) {
          clientExtractedText = pdfRes.text.trim();
        }
      } catch (clientErr) {
        console.warn("[QuizGenerator] On-device PDF extraction fallback to direct file:", clientErr);
      }

      const formData = new FormData();
      formData.append("count", String(selectedCount));
      const profile = getUserProfileData();
      formData.append("gradeLevel", profile.gradeLevel);
      if (profile.stream) formData.append("stream", profile.stream);
      if (profile.country) formData.append("country", profile.country);
      if (topic) formData.append("topic", topic);

      if (clientExtractedText) {
        formData.append("extractedText", clientExtractedText);
        // If extracted text is relatively short, also send the binary file as fallback
        if (clientExtractedText.length < 400 && file) {
          formData.append("pdf", file);
        }
      } else if (file) {
        formData.append("pdf", file);
      }

      const response = await fetch(getApiUrl('/api/generate-pdf-quiz'), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate quiz from PDF');
      }

      const data = await response.json();
      if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        setLoadingProgress(100);
        await new Promise(r => setTimeout(r, 250));
        deductCoins(2, "AI Quizzes");

        try {
          const stored = JSON.parse(safeGetItem('helpyou_seen_quiz_questions_pool') || '[]');
          const newQues = data.quiz.map((q: any) => typeof q === 'string' ? q : (q.question || '')).filter(Boolean);
          const updated = Array.from(new Set([...newQues, ...(Array.isArray(stored) ? stored : [])])).slice(0, 100);
          safeSetItem('helpyou_seen_quiz_questions_pool', JSON.stringify(updated));
        } catch (_) {}

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
      const profile = getUserProfileData();
      formData.append("gradeLevel", profile.gradeLevel);
      if (profile.stream) formData.append("stream", profile.stream);
      if (profile.country) formData.append("country", profile.country);

      const response = await fetch(getApiUrl('/api/generate-image-quiz'), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate quiz from textbook photo');
      }

      const data = await response.json();
      if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        setLoadingProgress(100);
        await new Promise(r => setTimeout(r, 250));
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

    // Academic Concept & Chatter Guardrail
    const hierarchy = parseTopicHierarchy(activeTopic);
    if (hierarchy.subTopic && hierarchy.subTopic !== 'All') {
      const check = isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter);
      if (!check.isValid) {
        setShowConfig(false);
        setError(check.error || 'Please enter a valid academic concept or topic name.');
        triggerVibration([30, 50, 30]);
        return;
      }
    }

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
      const profile = getUserProfileData();
      // Collect previously seen quiz questions to guarantee zero duplicates
      const seenQuizPool: string[] = [];
      try {
        const stored = JSON.parse(safeGetItem('helpyou_seen_quiz_questions_pool') || '[]');
        if (Array.isArray(stored)) seenQuizPool.push(...stored);
      } catch (_) {}
      (history || []).forEach(h => {
        if (Array.isArray(h.questions)) {
          h.questions.forEach((q: any) => {
            const txt = typeof q === 'string' ? q : (q.question || '');
            if (txt) seenQuizPool.push(txt.trim());
          });
        }
      });
      const uniqueAvoid = Array.from(new Set(seenQuizPool)).slice(0, 30);

      // 1. Check Global Community Cache first (Instant 0ms / 0 API Cost)
      const hierarchy = parseTopicHierarchy(activeTopic, profile.subject || profile.stream);
      const targetExamStr = profile.exam || profile.targetExam || safeGetItem('academic_exam') || safeGetItem('target_exam') || '';
      const cachedHit = await getCachedCurriculumContent({
        country: profile.country,
        exam: targetExamStr,
        grade: profile.gradeLevel,
        subject: hierarchy.subject,
        chapter: hierarchy.chapter,
        subTopic: hierarchy.subTopic,
        feature: 'quiz'
      });

      if (cachedHit && Array.isArray(cachedHit.content) && cachedHit.content.length > 0) {
        setLoadingProgress(100);
        await new Promise(r => setTimeout(r, 150));
        deductCoins(2, "AI Quizzes");
        setQuiz(cachedHit.content);
        setQuizState('playing');
        setCurrentIndex(0);
        setQuestionStartTime(Date.now());
        saveInitialQuizToHistory(cachedHit.content, activeTopic);
        setLoading(false);
        return;
      }

      const response = await fetch(getApiUrl('/api/generate-quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getProfilePayload({
          topic: activeTopic,
          count: selectedCount,
          avoidPrompts: uniqueAvoid,
          avoidQuestions: uniqueAvoid,
          randomSeed: `${Date.now()}_${Math.random().toString(36).substring(7)}`
        })),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 400 && (errData.error === 'INVALID_TOPIC' || errData.code === 'INVALID_TOPIC')) {
          throw new Error(errData.message || 'The entered topic is not a recognized academic concept for this chapter. Please enter a valid topic or pick from the recommended units.');
        }
        if (response.status === 429) {
          throw new Error(errData.text || 'Gemini API quota exceeded. Please try again in 60 seconds.');
        }
        throw new Error(errData.error || errData.message || 'Failed to generate quiz');
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }

      const data = await response.json();
      if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        setLoadingProgress(100);
        await new Promise(r => setTimeout(r, 250));
        // Deduct 2 coins now that the output has been successfully generated by the AI
        deductCoins(2, "AI Quizzes");

        setQuiz(data.quiz);
        setQuizState('playing');
        setCurrentIndex(0);
        setQuestionStartTime(Date.now());
        saveInitialQuizToHistory(data.quiz, activeTopic);

        // Save newly generated quiz into Global Community Cache for all future users
        saveCachedCurriculumContent({
          country: profile.country,
          exam: targetExamStr,
          grade: profile.gradeLevel,
          subject: hierarchy.subject,
          chapter: hierarchy.chapter,
          subTopic: hierarchy.subTopic,
          feature: 'quiz'
        }, data.quiz, { count: data.quiz.length });
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
      saveMistakeToVault('AI Quizzes',
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

      // Mistakes are already saved in real-time to MistakeVault on option selection

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
        <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={handleHeaderBack}
              className="w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors shrink-0 cursor-pointer active:scale-95"
              aria-label="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight line-clamp-1 text-zinc-900">
                <BookOpen className="w-5 h-5 text-indigo-600 mr-2 shrink-0" />
                <span className="truncate">AI Quizzes</span>
              </h2>
            </div>
          </div>

          {/* Top-Right Header Action: "Q" Button during playing quiz, History button otherwise */}
          {quizState === 'playing' ? (
            <button
              type="button"
              onClick={() => {
                triggerVibration(10);
                setShowQuestionPalette((prev) => !prev);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-zinc-900 border border-zinc-200/90 hover:border-indigo-300 hover:text-indigo-600 shadow-sm transition-all cursor-pointer shrink-0 active:scale-95 font-black text-sm relative"
              title="Question Palette"
              aria-label="Question Palette"
            >
              <span>Q</span>
              
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleHistory}
              className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all cursor-pointer shrink-0 active:scale-95 ${
                showHistory
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                  : 'bg-white text-zinc-700 border-zinc-200/80 hover:text-indigo-600 hover:border-indigo-300 shadow-sm'
              }`}
              title="Quiz History"
              aria-label="Quiz History"
            >
              <History className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* BODY CONTAINER */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-36 z-10 flex flex-col">
        {showHistory ? (
          <motion.div
            key="quiz-history-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 flex flex-col space-y-4 max-w-xl mx-auto w-full py-2"
          >
            <div className="flex items-center justify-between pb-1 border-b border-zinc-200/50">
              <h3 className="font-black text-base text-zinc-900 tracking-tight flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <span>Quiz Practice History</span>
              </h3>
              <button 
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                Close History
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <AdvancedLoader type="skeleton" skeletonType="list" count={3} />
              </div>
            ) : safeHistory.length === 0 ? (
              <div className="bg-white border border-zinc-200/80 rounded-3xl p-8 text-center shadow-sm space-y-3 my-auto">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600 text-2xl">
                  📝
                </div>
                <h4 className="text-base font-black text-zinc-800">No Quiz History Yet</h4>
                <p className="text-xs font-bold text-zinc-400 max-w-xs mx-auto leading-relaxed">
                  Generate and complete any curriculum, PDF, or textbook quiz to review all questions and explanations here anytime!
                </p>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="mt-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Start a Practice Quiz</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {safeHistory.slice().reverse().map((item) => {
                  const accuracy = typeof item.accuracy === 'number' ? item.accuracy : (
                    item.totalQuestions > 0 ? Math.round((item.score / item.totalQuestions) * 100) : 0
                  );
                  const isHighScoring = accuracy >= 80;
                  const questionCount = item.totalQuestions || item.questions?.length || 5;

                  return (
                    <motion.div
                      key={item.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => {
                        triggerVibration(10);
                        setReviewingAttempt(item);
                      }}
                      className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex items-center justify-between gap-3 group relative overflow-hidden"
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        {/* Score Circle Badge */}
                        <div className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center font-black shrink-0 border ${
                          isHighScoring 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-xs' 
                            : 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-xs'
                        }`}>
                          <span className="text-xs leading-none">{item.score}/{questionCount}</span>
                          <span className="text-[8px] font-bold opacity-80">{accuracy}%</span>
                        </div>

                        {/* Title and metadata */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-extrabold text-sm text-zinc-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                            {getQuizTitle(item)}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 text-[10px] font-bold text-zinc-400">
                            <span>
                              {new Date(item.createdAt).toLocaleDateString(undefined, { 
                                month: 'short', 
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </span>
                            <span>•</span>
                            <span className="text-zinc-600 font-extrabold">{questionCount} Questions</span>
                          </div>
                        </div>
                      </div>

                      {/* Right side actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteHistoryItem(e, item)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Quiz"
                          aria-label="Delete Quiz"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="w-7 h-7 rounded-full bg-zinc-50 group-hover:bg-indigo-50 flex items-center justify-center text-zinc-400 group-hover:text-indigo-600 transition-colors">
                          <span className="text-xs font-black">&rsaquo;</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <>
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
                <div className="grid grid-cols-3 gap-2.5">
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
                        className={`py-3.5 rounded-2xl font-black text-base border transition-all active:scale-[0.97] cursor-pointer flex flex-col items-center justify-center ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        <span className="text-lg">{num}</span>
                        <span className={`text-[8px] font-bold uppercase tracking-wider mt-0.5 ${
                          isSelected ? 'text-indigo-100' : 'text-zinc-400'
                        }`}>Questions</span>
                      </button>
                    );
                  })}
                </div>

                {/* Topic Metadata Description & Inline Validation */}
                {(() => {
                  const hierarchy = parseTopicHierarchy(topicToGenerate || '');
                  const validation = (hierarchy.subTopic && hierarchy.subTopic !== 'All')
                    ? isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter)
                    : { isValid: true };

                  return (
                    <>
                      <div className={`rounded-2xl p-3 flex flex-col gap-1 border transition-all ${
                        !validation.isValid ? 'bg-rose-50/80 border-rose-200' : 'bg-zinc-50 border-zinc-100'
                      }`}>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${
                          !validation.isValid ? 'text-rose-600' : 'text-zinc-400'
                        }`}>
                          Active Topic
                        </span>
                        <p className={`text-xs font-extrabold line-clamp-1 ${
                          !validation.isValid ? 'text-rose-800' : 'text-zinc-700'
                        }`}>
                          {topicToGenerate || 'General Subject Practice'}
                        </p>
                        {!validation.isValid && (
                          <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                            <span>⚠️</span>
                            <span>{validation.error}</span>
                          </p>
                        )}
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
                          disabled={!validation.isValid}
                          onClick={() => {
                            if (!validation.isValid) {
                              triggerVibration([30, 50, 30]);
                              return;
                            }
                            triggerVibration(20);
                            handleExecuteReal(configCount);
                          }}
                          className={`flex-[2] py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 border ${
                            validation.isValid
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/10 active:scale-[0.98] cursor-pointer border-indigo-500/20'
                              : 'bg-zinc-200 text-zinc-400 cursor-not-allowed border-zinc-300'
                          }`}
                        >
                          <span>🪄</span> Start Generating
                        </button>
                      </div>
                    </>
                  );
                })()}
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
                      disabled={isOffline}
                      placeholder={isOffline ? "You are offline. Reconnect to generate." : "e.g. SAT Math - Trigonometry, AP US Gov"}
                      className="flex-1 p-4 rounded-2xl border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-semibold text-sm h-14 disabled:cursor-not-allowed disabled:bg-zinc-50"
                    />
                    <button
                      onClick={() => {
                        triggerVibration(20);
                        handleGenerate(topic);
                      }}
                      disabled={!topic.trim() || loading || isOffline}
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
                    if (isOffline) return;
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
                        setError("Oops! Something went wrong on our end. Please try again.");
                      }
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`mb-4 cursor-pointer relative overflow-hidden rounded-3xl border border-zinc-200/80 p-4 transition-all duration-300 shadow-sm ${isOffline ? 'bg-zinc-100/50 opacity-50 cursor-not-allowed pointer-events-none' : 'bg-white hover:border-indigo-200 hover:shadow-md active:scale-[0.99] group'}`}
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
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                          Notes to MCQs
                        </p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-zinc-50 border border-zinc-200/50 flex items-center justify-center text-indigo-600 shadow-sm shrink-0 group-hover:translate-x-0.5 transition-transform">
                      <span className="text-xs filter drop-shadow-sm select-none">✨</span>
                    </div>
                  </div>
                </div>

                {/* Presets Accordion */}
                <div className="mb-6 flex-1">
                  <div className="flex items-center justify-between mb-3 px-0.5">
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                      Curriculum Practice Quizzes
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const isLaterSubjectExpanded = mergedSubjects.slice(5).some(s => s.id === expandedSubject);
                      const shouldShowAll = showAllSubjects || isLaterSubjectExpanded || mergedSubjects.length <= 5;
                      const visibleSubjects = shouldShowAll ? mergedSubjects : mergedSubjects.slice(0, 5);

                      return (
                        <>
                          {visibleSubjects.map((subject) => {
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
                                  <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-bold text-base shadow-sm shrink-0 ${subject.themeColor}`}>
                                      {subject.icon}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="font-extrabold text-xs sm:text-sm text-zinc-800 leading-snug break-words">
                                        {cleanSubjectTitle(subject.title)}
                                      </h4>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-lg">
                                      {(subject.topics || []).length} CH
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
                                        {(subject.topics || []).map((topicItem, index) => {
                                          const chapterKey = `${cleanSubjectTitle(subject.title)}__${topicItem}`;
                                          const isChapterOpen = expandedChapter === chapterKey;
                                          const subTopicsList = (subject.chapterSubTopics && subject.chapterSubTopics[topicItem]) || [];

                                          return (
                                            <div key={index} className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs transition-all">
                                              {/* Chapter Header */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  triggerVibration(10);
                                                  setExpandedChapter(isChapterOpen ? null : chapterKey);
                                                }}
                                                className={`w-full py-2.5 px-3 flex items-center justify-between text-left transition-all cursor-pointer ${
                                                  isChapterOpen ? 'bg-indigo-50/40 border-b border-indigo-100' : 'hover:bg-zinc-50'
                                                }`}
                                              >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                  <span className="text-[10px] font-black font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                                                    CH {String(index + 1).padStart(2, '0')}
                                                  </span>
                                                  <span className="font-bold text-xs text-zinc-800 leading-snug break-words flex-1">
                                                    {topicItem}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                                  <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                                                    {subTopicsList.length} Units
                                                  </span>
                                                  {isChapterOpen ? (
                                                    <ChevronUp className="w-3.5 h-3.5 text-indigo-600" />
                                                  ) : (
                                                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                                                  )}
                                                </div>
                                              </button>

                                              {/* Chapter Sub-topics Drawer */}
                                              <AnimatePresence initial={false}>
                                                {isChapterOpen && (
                                                  <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2, ease: "easeInOut" }}
                                                    className="p-2.5 bg-zinc-50/50 space-y-1.5"
                                                  >
                                                    {/* Quick Option: Practice Full Chapter */}
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        triggerVibration(15);
                                                        handleTopicClick(cleanSubjectTitle(subject.title), topicItem);
                                                      }}
                                                      disabled={loading}
                                                      className="w-full bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-200/90 hover:border-indigo-400 active:scale-[0.99] py-2 px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer shadow-xs"
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <span className="text-xs">🎯</span>
                                                        <span className="text-xs font-black text-indigo-700">Practice Entire Chapter</span>
                                                      </div>
                                                      <span className="text-[10px] font-extrabold text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-indigo-100 shadow-2xs">
                                                        All Topics
                                                      </span>
                                                    </button>

                                                    {/* Sub-Topics Pills */}
                                                    <div className="grid grid-cols-1 gap-1.5 pt-1">
                                                      {subTopicsList.map((sub, sIdx) => {
                                                        const isSaved = isCurriculumContentCached({
                                                          subject: cleanSubjectTitle(subject.title),
                                                          chapter: topicItem,
                                                          subTopic: sub,
                                                          feature: 'quiz'
                                                        });
                                                        const verifiedCustoms = getVerifiedChapterSubTopics(cleanSubjectTitle(subject.title), topicItem);
                                                        const isUserAdded = verifiedCustoms.some(vc => vc.toLowerCase().trim() === sub.toLowerCase().trim());

                                                        return (
                                                          <div
                                                            key={sIdx}
                                                            className="w-full bg-white hover:bg-indigo-50/40 border border-zinc-200/70 hover:border-indigo-200 py-1.5 px-3 rounded-xl flex items-center justify-between text-left transition-all group/sub shadow-2xs gap-2"
                                                          >
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                triggerVibration(15);
                                                                handleTopicClick(cleanSubjectTitle(subject.title), `${topicItem} - ${sub}`);
                                                              }}
                                                              disabled={loading}
                                                              className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                                                            >
                                                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 group-hover/sub:scale-125 transition-transform ${
                                                                isSaved ? 'bg-emerald-500' : 'bg-indigo-500'
                                                              }`} />
                                                              <span className="text-xs font-medium text-zinc-700 group-hover/sub:text-indigo-600 transition-colors truncate">
                                                                {sub}
                                                              </span>
                                                            </button>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                              {isSaved && (
                                                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-2xs">
                                                                  <Check className="w-2.5 h-2.5" />
                                                                  <span>Saved</span>
                                                                </span>
                                                              )}
                                                              <button
                                                                type="button"
                                                                onClick={() => {
                                                                  triggerVibration(15);
                                                                  handleTopicClick(cleanSubjectTitle(subject.title), `${topicItem} - ${sub}`);
                                                                }}
                                                                disabled={loading}
                                                                className="text-[10px] font-bold text-indigo-600 bg-indigo-50/80 hover:bg-indigo-100 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                                                              >
                                                                Quiz
                                                              </button>
                                                              {isUserAdded && (
                                                                <button
                                                                  type="button"
                                                                  title="Remove subtopic"
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    triggerVibration(20);
                                                                    removeCustomChapterSubTopic(cleanSubjectTitle(subject.title), topicItem, sub);
                                                                  }}
                                                                  className="p-1 text-zinc-400 hover:text-rose-500 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                                                >
                                                                  <Trash2 className="w-3 h-3" />
                                                                </button>
                                                              )}
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>

                                                    {/* Custom Micro-Topic Input (AI Verified) */}
                                                    <div className="pt-1">
                                                      {showCustomInputForChapter === chapterKey ? (
                                                        <div className="space-y-1.5">
                                                          <div className="flex items-center gap-1.5">
                                                            <input
                                                              type="text"
                                                              placeholder={`e.g. Specific formula or concept...`}
                                                              value={customSubTopicInput[chapterKey] || ''}
                                                              disabled={isVerifyingSubTopic[chapterKey]}
                                                              onChange={(e) => {
                                                                setCustomSubTopicInput(prev => ({ ...prev, [chapterKey]: e.target.value }));
                                                                if (customInputError[chapterKey]) {
                                                                  setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                                }
                                                              }}
                                                              onKeyDown={async (e) => {
                                                                if (e.key === 'Enter') {
                                                                  const val = (customSubTopicInput[chapterKey] || '').trim();
                                                                  if (!val || isVerifyingSubTopic[chapterKey]) return;
                                                                  setIsVerifyingSubTopic(prev => ({ ...prev, [chapterKey]: true }));
                                                                  setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                                  const profile = getUserProfileData();
                                                                  const targetExam = profile.targetExam || safeGetItem('academic_exam') || 'General';
                                                                  const country = profile.country || safeGetItem('academic_country') || 'India';
                                                                  const cleanSubj = cleanSubjectTitle(subject.title);
                                                                  const check = await verifySubTopicWithAI(cleanSubj, topicItem, val, targetExam, country);
                                                                  setIsVerifyingSubTopic(prev => ({ ...prev, [chapterKey]: false }));
                                                                  if (!check.isValid) {
                                                                    triggerVibration([30, 50, 30]);
                                                                    setCustomInputError(prev => ({ ...prev, [chapterKey]: check.error || 'Invalid academic concept.' }));
                                                                    return;
                                                                  }
                                                                  const finalTitle = check.cleanTitle || val;
                                                                  setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                                  setCustomSubTopicInput(prev => ({ ...prev, [chapterKey]: '' }));
                                                                  triggerVibration(15);
                                                                  registerVerifiedChapterSubTopic(cleanSubj, topicItem, finalTitle);
                                                                  triggerVibration(15);
                                                                  handleTopicClick(cleanSubj, `${topicItem} - ${finalTitle}`);
                                                                }
                                                              }}
                                                              className={`flex-1 text-xs px-3 py-2 border rounded-xl bg-white focus:outline-none focus:ring-1 text-zinc-800 ${
                                                                customInputError[chapterKey] 
                                                                  ? 'border-rose-400 focus:ring-rose-500' 
                                                                  : 'border-indigo-300 focus:ring-indigo-500'
                                                              }`}
                                                              autoFocus
                                                            />
                                                            <button
                                                              type="button"
                                                              disabled={isVerifyingSubTopic[chapterKey]}
                                                              onClick={async () => {
                                                                const val = (customSubTopicInput[chapterKey] || '').trim();
                                                                if (!val || isVerifyingSubTopic[chapterKey]) return;
                                                                setIsVerifyingSubTopic(prev => ({ ...prev, [chapterKey]: true }));
                                                                setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                                const profile = getUserProfileData();
                                                                const targetExam = profile.targetExam || safeGetItem('academic_exam') || 'General';
                                                                const country = profile.country || safeGetItem('academic_country') || 'India';
                                                                const cleanSubj = cleanSubjectTitle(subject.title);
                                                                const check = await verifySubTopicWithAI(cleanSubj, topicItem, val, targetExam, country);
                                                                setIsVerifyingSubTopic(prev => ({ ...prev, [chapterKey]: false }));
                                                                if (!check.isValid) {
                                                                  triggerVibration([30, 50, 30]);
                                                                  setCustomInputError(prev => ({ ...prev, [chapterKey]: check.error || 'Invalid academic concept.' }));
                                                                  return;
                                                                }
                                                                const finalTitle = check.cleanTitle || val;
                                                                setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                                setCustomSubTopicInput(prev => ({ ...prev, [chapterKey]: '' }));
                                                                triggerVibration(15);
                                                                registerVerifiedChapterSubTopic(cleanSubj, topicItem, finalTitle);
                                                                triggerVibration(15);
                                                                handleTopicClick(cleanSubj, `${topicItem} - ${finalTitle}`);
                                                              }}
                                                              className="px-3 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-all shrink-0 cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                                                            >
                                                              {isVerifyingSubTopic[chapterKey] ? (
                                                                <>
                                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                  <span>Verifying...</span>
                                                                </>
                                                              ) : (
                                                                <span>Start</span>
                                                              )}
                                                            </button>
                                                          </div>
                                                          {customInputError[chapterKey] && (
                                                            <p className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 animate-fadeIn">
                                                              <span>⚠️</span>
                                                              <span>{customInputError[chapterKey]}</span>
                                                            </p>
                                                          )}
                                                        </div>
                                                      ) : (
                                                        <button
                                                          type="button"
                                                          onClick={() => setShowCustomInputForChapter(chapterKey)}
                                                          className="w-full border border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/20 hover:bg-indigo-50/50 py-1.5 px-3 rounded-xl text-center text-xs font-bold text-indigo-600 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                                        >
                                                          <span>✏️</span>
                                                          <span>+ Type specific topic in this chapter...</span>
                                                        </button>
                                                      )}
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}

                          {mergedSubjects.length > 5 && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerVibration(10);
                                setShowAllSubjects(prev => !prev);
                              }}
                              className="w-full py-3.5 px-4 bg-zinc-50 hover:bg-zinc-100 active:scale-[0.99] border border-dashed border-zinc-300 hover:border-zinc-400 rounded-2xl text-xs font-black text-zinc-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs mt-1"
                            >
                              {shouldShowAll ? (
                                <>
                                  <ChevronUp className="w-4 h-4 text-zinc-500" />
                                  <span>Show Less Subjects</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4 text-indigo-600" />
                                  <span>+ More Subjects ({mergedSubjects.length - 5} more)</span>
                                </>
                              )}
                            </button>
                          )}
                        </>
                      );
                    })()}
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
                {(() => {
                  const isSingleAttempt = safeHistory.length === 1;
                  const activeQuizForTrends = selectedHistoryItem || (safeHistory.length > 0 ? safeHistory[safeHistory.length - 1] : null);

                  let isQuestionMode = false;
                  let trendData: any[] = [];

                  if (safeHistory.length === 0) {
                    isQuestionMode = false;
                    trendData = DEMO_HISTORY.map((item, index) => {
                      const cleanTitle = getQuizTitle(item);
                      return {
                        name: `Qz ${index + 1}`,
                        fullLabel: `Quiz ${index + 1}`,
                        topic: cleanTitle.split(' - ').pop() || cleanTitle,
                        subtitle: `Diagnostic Attempt ${index + 1}`,
                        accuracy: Math.round(Number(item.accuracy) || 0),
                        speed: Math.round((Number(item.averageTimePerQuestion) || 10) * 10) / 10
                      };
                    });
                  } else {
                    const shouldShowQuestions = trendViewType === 'questions' || isSingleAttempt;
                    if (shouldShowQuestions && activeQuizForTrends) {
                      const durations: number[] = Array.isArray(activeQuizForTrends.questionDurations) ? activeQuizForTrends.questionDurations : [];
                      const corrects: boolean[] = Array.isArray(activeQuizForTrends.correctAnswers) ? activeQuizForTrends.correctAnswers : [];
                      const totalQ = activeQuizForTrends.totalQuestions || (activeQuizForTrends.questions && activeQuizForTrends.questions.length) || durations.length || 5;
                      const count = Math.max(durations.length, corrects.length, totalQ);
                      const cleanTitle = getQuizTitle(activeQuizForTrends);
                      const shortTopic = cleanTitle.split(' - ').pop() || cleanTitle;

                      if (count >= 2) {
                        let runningCorrect = 0;
                        trendData = Array.from({ length: count }).map((_, qIdx) => {
                          const isCorrect = corrects[qIdx] !== undefined ? Boolean(corrects[qIdx]) : true;
                          if (isCorrect) runningCorrect++;
                          const cumulativeAcc = Math.round((runningCorrect / (qIdx + 1)) * 100);
                          const rawSpeed = typeof durations[qIdx] === 'number' && !isNaN(durations[qIdx])
                            ? durations[qIdx]
                            : (activeQuizForTrends.averageTimePerQuestion || 10);

                          return {
                            name: `Q${qIdx + 1}`,
                            fullLabel: `Question ${qIdx + 1}`,
                            topic: `${shortTopic} (Q${qIdx + 1})`,
                            subtitle: isCorrect ? '✅ Correct Answer' : '❌ Needs Review',
                            accuracy: cumulativeAcc,
                            speed: Math.min(Math.round(rawSpeed * 10) / 10, 60),
                            realSpeed: Math.round(rawSpeed * 10) / 10,
                            isCorrect: isCorrect,
                            isQuestionMode: true
                          };
                        });
                        isQuestionMode = true;
                      } else {
                        // Edge case fallback: exactly 1 question in quiz -> baseline 0% to Q1
                        const isCorrect = corrects[0] !== undefined ? Boolean(corrects[0]) : true;
                        const qSpeed = typeof durations[0] === 'number' && !isNaN(durations[0]) ? durations[0] : (activeQuizForTrends.averageTimePerQuestion || 10);
                        trendData = [
                          {
                            name: 'Start',
                            fullLabel: 'Session Start',
                            topic: `${shortTopic} (Baseline)`,
                            subtitle: 'Baseline Start',
                            accuracy: 0,
                            speed: Math.round(qSpeed * 1.2 * 10) / 10,
                            realSpeed: Math.round(qSpeed * 1.2 * 10) / 10,
                            isCorrect: true,
                            isQuestionMode: true
                          },
                          {
                            name: 'Q1',
                            fullLabel: 'Question 1',
                            topic: `${shortTopic} (Q1)`,
                            subtitle: isCorrect ? '✅ Correct Answer' : '❌ Needs Review',
                            accuracy: isCorrect ? 100 : 0,
                            speed: Math.min(Math.round(qSpeed * 10) / 10, 60),
                            realSpeed: Math.round(qSpeed * 10) / 10,
                            isCorrect: isCorrect,
                            isQuestionMode: true
                          }
                        ];
                        isQuestionMode = true;
                      }
                    } else {
                      isQuestionMode = false;
                      trendData = safeHistory.map((item, index) => {
                        const cleanTitle = getQuizTitle(item);
                        const accuracy = typeof item.accuracy === 'number' && !isNaN(item.accuracy)
                          ? item.accuracy
                          : (item.totalQuestions > 0 ? Math.round(((item.score || 0) / item.totalQuestions) * 100) : 0);
                        const speed = typeof item.averageTimePerQuestion === 'number' && !isNaN(item.averageTimePerQuestion)
                          ? item.averageTimePerQuestion
                          : 10;

                        return {
                          name: `Qz ${index + 1}`,
                          fullLabel: `Quiz ${index + 1}`,
                          topic: cleanTitle.split(' - ').pop() || cleanTitle,
                          subtitle: `Accuracy: ${Math.round(accuracy)}% • Avg: ${speed.toFixed(1)}s`,
                          accuracy: Math.round(accuracy),
                          speed: Math.round(speed * 10) / 10,
                          isQuestionMode: false
                        };
                      });
                    }
                  }

                  const activeQuizDurations: number[] = Array.isArray(activeQuizForTrends?.questionDurations) ? activeQuizForTrends.questionDurations : [];
                  const activeQuizCorrects: boolean[] = Array.isArray(activeQuizForTrends?.correctAnswers) ? activeQuizForTrends.correctAnswers : [];

                  const flashCount = activeQuizDurations.filter((d, i) => d < 6 && (activeQuizCorrects[i] !== undefined ? activeQuizCorrects[i] : true)).length;
                  const deepCount = activeQuizDurations.filter((d, i) => d >= 6 && (activeQuizCorrects[i] !== undefined ? activeQuizCorrects[i] : true)).length;
                  const guessCount = activeQuizDurations.filter((d, i) => d <= 4 && (activeQuizCorrects[i] !== undefined ? !activeQuizCorrects[i] : false)).length;
                  const timeTrapCount = activeQuizDurations.filter((d, i) => d >= 25 && (activeQuizCorrects[i] !== undefined ? !activeQuizCorrects[i] : false)).length;

                  return (
                    <div className="bg-white border border-zinc-200/80 rounded-[2rem] p-5 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2.5 mb-3">
                        <div>
                          <h4 className="text-sm font-extrabold text-zinc-800 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-indigo-500" />
                            <span>Performance Trends Over Time</span>
                          </h4>
                          <p className="text-[10px] font-bold text-zinc-400">
                            {isQuestionMode
                              ? 'Per-question accuracy progression (%) & response speed (sec)'
                              : 'Chronological quiz accuracy (%) & question speed (sec)'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                          {safeHistory.length > 1 && (
                            <div className="bg-zinc-100 p-0.5 rounded-xl flex items-center gap-1 text-[10px] font-black">
                              <button
                                type="button"
                                onClick={() => {
                                  triggerVibration(10);
                                  setTrendViewType('overall');
                                }}
                                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                  !isQuestionMode
                                    ? 'bg-white text-indigo-600 shadow-xs'
                                    : 'text-zinc-500 hover:text-zinc-800'
                                }`}
                              >
                                All Quizzes
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  triggerVibration(10);
                                  setTrendViewType('questions');
                                }}
                                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                  isQuestionMode
                                    ? 'bg-white text-indigo-600 shadow-xs'
                                    : 'text-zinc-500 hover:text-zinc-800'
                                }`}
                              >
                                Per-Question
                              </button>
                            </div>
                          )}

                          <span className="text-[9px] font-black uppercase bg-indigo-50 border border-indigo-100/80 text-indigo-600 px-2.5 py-1 rounded-lg shrink-0">
                            {safeHistory.length === 0 ? 'Diagnostic Data' : (isSingleAttempt ? 'Quiz 1 Flow' : 'Live Results')}
                          </span>
                        </div>
                      </div>

                      {/* Guess & Time-Trap Category Badges (Per-Question Mode) */}
                      {isQuestionMode && activeQuizDurations.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-3.5 pb-2.5 border-b border-zinc-100 text-[10px] font-black select-none">
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">
                            ⚡ Flash: {flashCount}
                          </span>
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700">
                            🧠 Deep: {deepCount}
                          </span>
                          {guessCount > 0 && (
                            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-800">
                              🎲 Guess: {guessCount}
                            </span>
                          )}
                          {timeTrapCount > 0 && (
                            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-700">
                              ⏳ Time Trap: {timeTrapCount}
                            </span>
                          )}
                        </div>
                      )}

                      {/* CHART WRAPPER */}
                      <div className="w-full h-64 md:h-72 min-h-[256px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={trendData}
                            margin={{ top: 15, right: 10, left: -20, bottom: 5 }}
                          >
                            <defs>
                              <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.25}/>
                                <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.02}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                            <XAxis 
                              dataKey="name" 
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
                              domain={[0, (dataMax: number) => Math.min(Math.max(15, Math.ceil(dataMax + 2)), 60)]}
                              tickLine={false} 
                              axisLine={false}
                              tickFormatter={(v) => `${v}s`}
                              tick={{ fill: '#D97706', fontSize: 10, fontWeight: 'bold' }} 
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area 
                              yAxisId="left"
                              type="monotone" 
                              dataKey="accuracy" 
                              stroke="#4F46E5" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorAccuracy)" 
                              dot={(dotProps: any) => {
                                const { cx, cy, payload } = dotProps;
                                if (!cx || !cy) return null;
                                if (isQuestionMode && payload?.isCorrect !== undefined) {
                                  return (
                                    <circle
                                      key={`dot-${dotProps.index}`}
                                      cx={cx}
                                      cy={cy}
                                      r={5}
                                      fill={payload.isCorrect ? '#10B981' : '#EF4444'}
                                      stroke="#FFFFFF"
                                      strokeWidth={2}
                                    />
                                  );
                                }
                                return (
                                  <circle
                                    key={`dot-${dotProps.index}`}
                                    cx={cx}
                                    cy={cy}
                                    r={4.5}
                                    fill="#4F46E5"
                                    stroke="#FFFFFF"
                                    strokeWidth={2}
                                  />
                                );
                              }}
                              activeDot={(dotProps: any) => {
                                const { cx, cy, payload } = dotProps;
                                if (!cx || !cy) return null;
                                const dotColor = (isQuestionMode && payload?.isCorrect !== undefined)
                                  ? (payload.isCorrect ? '#10B981' : '#EF4444')
                                  : '#4F46E5';
                                return (
                                  <g key={`activedot-${dotProps.index}`}>
                                    <circle cx={cx} cy={cy} r={8} fill={dotColor} fillOpacity={0.25} />
                                    <circle cx={cx} cy={cy} r={6} fill={dotColor} stroke="#FFFFFF" strokeWidth={2} />
                                  </g>
                                );
                              }}
                              connectNulls={true}
                              name="Accuracy"
                            />
                            <Line 
                              yAxisId="right"
                              type="monotone" 
                              dataKey="speed" 
                              stroke="#F59E0B" 
                              strokeWidth={3}
                              dot={{ r: 4, fill: '#F59E0B', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                              activeDot={{ r: 6, fill: '#F59E0B', stroke: '#FFFFFF', strokeWidth: 2 }}
                              connectNulls={true}
                              name="Avg Speed"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Legend */}
                      <div className="flex justify-center items-center gap-3 sm:gap-5 mt-3 text-[10px] font-black flex-wrap">
                        <span className="flex items-center gap-1.5 text-indigo-600">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block shadow-xs" />
                          Accuracy (% left)
                        </span>
                        {isQuestionMode && (
                          <>
                            <span className="flex items-center gap-1.5 text-emerald-600">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs" />
                              Correct (●)
                            </span>
                            <span className="flex items-center gap-1.5 text-rose-600">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-xs" />
                              Incorrect (●)
                            </span>
                          </>
                        )}
                        <span className="flex items-center gap-1.5 text-amber-600">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs" />
                          Speed (sec right)
                        </span>
                      </div>

                      {/* 1-Line Personalized AI Coach Advice */}
                      {(() => {
                        let coachTip = '';
                        if (isQuestionMode) {
                          if (guessCount > 0) {
                            coachTip = `💡 AI Coach: ${guessCount} question${guessCount > 1 ? 's were' : ' was'} answered in <4s and missed (rushed guess) — take a quick breath before submitting!`;
                          } else if (timeTrapCount > 0) {
                            coachTip = `💡 AI Coach: ${timeTrapCount} question${timeTrapCount > 1 ? 's' : ''} took 25s+ and missed — skip and move ahead to save exam time!`;
                          } else if (flashCount >= Math.ceil((activeQuizDurations.length || 1) / 2)) {
                            coachTip = `💡 AI Coach: Exceptional speed & accuracy! You dominated the clock with high precision.`;
                          } else {
                            coachTip = `💡 AI Coach: Balanced pacing! Maintaining this rhythm will maximize your score in exams.`;
                          }
                        } else {
                          coachTip = safeHistory.length > 1
                            ? `💡 AI Coach: Tracking overall trends across ${safeHistory.length} quizzes — steady improvement unlocked!`
                            : `💡 AI Coach: Complete more quizzes to unlock long-term speed and accuracy trend analysis.`;
                        }

                        return (
                          <div className="mt-3 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200/70 flex items-center gap-2 text-[11px] font-bold text-zinc-700 shadow-2xs">
                            <span className="leading-snug">{coachTip}</span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* CURRENT / SELECTED ATTEMPT DRILLDOWN */}
                {(() => {
                  const list = safeHistory.length === 0 ? DEMO_HISTORY : safeHistory;
                  const activeQuiz = selectedHistoryItem || (list.length > 0 ? list[list.length - 1] : null);
                  if (!activeQuiz) return null;

                  // Parse durations with robust array length fallbacks
                  const totalExpectedQ = activeQuiz.totalQuestions || (activeQuiz.questions && activeQuiz.questions.length) || 5;
                  const rawDurations = (Array.isArray(activeQuiz.questionDurations) && activeQuiz.questionDurations.length > 0)
                    ? activeQuiz.questionDurations
                    : Array(totalExpectedQ).fill(activeQuiz.averageTimePerQuestion || 12);
                  const rawCorrect = (Array.isArray(activeQuiz.correctAnswers) && activeQuiz.correctAnswers.length > 0)
                    ? activeQuiz.correctAnswers
                    : (activeQuiz.questions && Array.isArray(activeQuiz.questions))
                      ? activeQuiz.questions.map((q: any) => q.isCorrect !== undefined ? q.isCorrect : (q.userAnswer === q.correctAnswer))
                      : Array(rawDurations.length).fill(true);

                  const questionChartData = rawDurations.map((duration: number, idx: number) => {
                    const isCorrect = rawCorrect[idx] !== undefined ? rawCorrect[idx] : true;
                    return {
                      name: `Q${idx + 1}`,
                      duration: Math.max(1, Math.round(Number(duration) || 1)),
                      correct: isCorrect,
                      fill: isCorrect ? '#10B981' : '#F43F5E'
                    };
                  });

                  const currentActiveKey = activeQuiz.id ? String(activeQuiz.id) : String(list.indexOf(activeQuiz));

                  return (
                    <div className="bg-white border border-zinc-200/80 rounded-[2rem] p-5 shadow-sm w-full">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
                            <Target className="w-4 h-4 text-purple-500" />
                            <span>Time Spent Per Question</span>
                          </h4>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-zinc-400 shrink-0">Analysis of:</span>
                            <div className="relative inline-flex items-center max-w-[210px] xs:max-w-[260px] sm:max-w-[300px]">
                              <select
                                value={currentActiveKey}
                                onChange={(e) => {
                                  triggerVibration(10);
                                  const chosen = list.find((it: any, idx: number) => 
                                    (it.id ? String(it.id) : String(idx)) === e.target.value
                                  );
                                  if (chosen) {
                                    setSelectedHistoryItem(chosen);
                                  }
                                }}
                                className="w-full text-[10px] font-extrabold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100/70 border border-indigo-200/90 rounded-lg pl-2 pr-6 py-1 truncate appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer shadow-2xs transition-colors"
                                title="Select a quiz to analyze"
                              >
                                {[...list].reverse().map((item: any) => {
                                  const origIdx = list.indexOf(item);
                                  const valKey = item.id ? String(item.id) : String(origIdx);
                                  const quizTitle = getQuizTitle(item);
                                  const countQ = item.totalQuestions || (item.questions && item.questions.length) || (item.questionDurations && item.questionDurations.length) || 5;
                                  const scoreText = item.score !== undefined ? ` • ${item.score}/${countQ}` : '';
                                  return (
                                    <option key={valKey} value={valKey} className="text-zinc-800 bg-white font-medium">
                                      {quizTitle}{scoreText}
                                    </option>
                                  );
                                })}
                              </select>
                              <ChevronDown className="w-3 h-3 text-indigo-500 absolute right-1.5 pointer-events-none shrink-0" />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[9px] font-bold">
                          <span className="flex items-center gap-1 text-emerald-600">
                            <span className="w-2 h-2 rounded bg-emerald-500" /> Correct
                          </span>
                          <span className="flex items-center gap-1 text-rose-600">
                            <span className="w-2 h-2 rounded bg-rose-500" /> Incorrect
                          </span>
                        </div>
                      </div>

                      {/* BAR CHART COMPONENT */}
                      <div className="w-full h-56 md:h-64 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={questionChartData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis 
                              dataKey="name" 
                              tickLine={false} 
                              axisLine={false}
                              interval={0}
                              tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 'bold' }} 
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
                              radius={[6, 6, 0, 0]} 
                              maxBarSize={28}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })()}

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
              
              {/* Question Top Bar: Pill and Top-Right Ask AI Button */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50/90 px-3 py-1 rounded-full border border-indigo-100/80 shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Question {currentIndex + 1}
                </span>

                {/* Top-Right Ask AI Button */}
                <button
                  type="button"
                  onClick={() => handleOpenAskAI(quiz[currentIndex])}
                  className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-xs px-3.5 py-1.5 rounded-full shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer border border-indigo-400/30 select-none shrink-0"
                  title="Ask AI for Question Hint or Step-by-Step Answer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                  <span>Ask AI</span>
                </button>
              </div>

              <div className="text-base md:text-lg font-extrabold leading-relaxed text-zinc-800">
                <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-base md:text-lg font-extrabold text-zinc-800">
                  {formatQuizMath(quiz[currentIndex].question)}
                </GlobalMarkdown>
              </div>
            </motion.div>

            {/* AI Doubt Output under the Question */}
            <AnimatePresence>
              {activeQuestionAIMode[currentIndex] && (
                <motion.div
                  key={`ai-doubt-${currentIndex}-${activeQuestionAIMode[currentIndex]}`}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className={`rounded-[2rem] p-5 mb-6 border shadow-sm overflow-hidden ${
                    activeQuestionAIMode[currentIndex] === 'hint'
                      ? 'bg-gradient-to-br from-amber-50/90 via-orange-50/25 to-white border-amber-200/90'
                      : 'bg-gradient-to-br from-indigo-50/90 via-purple-50/25 to-white border-indigo-200/90'
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-200/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        activeQuestionAIMode[currentIndex] === 'hint'
                          ? 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/20'
                          : 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-sm shadow-indigo-600/20'
                      }`}>
                        {activeQuestionAIMode[currentIndex] === 'hint' ? (
                          <Lightbulb className="w-4 h-4 stroke-[2.5]" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-amber-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-zinc-900 leading-tight">
                            {activeQuestionAIMode[currentIndex] === 'hint' ? 'AI Question Hint & Clue' : 'AI Step-by-Step Solution'}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            activeQuestionAIMode[currentIndex] === 'hint'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            Q{currentIndex + 1}
                          </span>
                        </div>

                      </div>
                    </div>

                    {/* Mode Switcher & Dismiss */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const target = activeQuestionAIMode[currentIndex] === 'hint' ? 'step_by_step' : 'hint';
                          handleSelectAIHelpOption(target, currentIndex);
                        }}
                        className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                        title={activeQuestionAIMode[currentIndex] === 'hint' ? 'Switch to Full Step-by-Step Solution' : 'Switch to Hint & Concept'}
                      >
                        {activeQuestionAIMode[currentIndex] === 'hint' ? (
                          <>
                            <Sparkles className="w-3 h-3 text-indigo-600" />
                            <span>See Solution</span>
                          </>
                        ) : (
                          <>
                            <Lightbulb className="w-3 h-3 text-amber-500" />
                            <span>See Hint</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setActiveQuestionAIMode(prev => ({ ...prev, [currentIndex]: null }));
                        }}
                        className="w-7 h-7 rounded-full bg-white/90 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 border border-zinc-200/80 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                        title="Dismiss AI Doubt Help"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Body Content */}
                  {askAILoadingMode === activeQuestionAIMode[currentIndex] ? (
                    <div className="py-7 flex flex-col items-center justify-center text-center space-y-3">
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-full border-3 ${
                          activeQuestionAIMode[currentIndex] === 'hint'
                            ? 'border-amber-200 border-t-amber-600'
                            : 'border-indigo-200 border-t-indigo-600'
                        } animate-spin`} />
                        <Sparkles className={`w-6 h-6 absolute inset-0 m-auto animate-pulse ${
                          activeQuestionAIMode[currentIndex] === 'hint' ? 'text-amber-500' : 'text-indigo-500'
                        }`} />
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-zinc-900 tracking-tight">
                          {activeQuestionAIMode[currentIndex] === 'hint'
                            ? `⚡ Formulating Live Hint for Question ${currentIndex + 1}...`
                            : `⚡ Crafting Live Step-by-Step Solution for Question ${currentIndex + 1}...`}
                        </h5>
                        <p className="text-[10px] text-zinc-500 font-bold mt-1">
                          Analyzing concept, formulas, and option traps in real-time
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs md:text-sm text-zinc-800 leading-relaxed font-medium bg-white/95 rounded-2xl p-4.5 border border-zinc-150 shadow-xs overflow-x-auto">
                        <GlobalMarkdown className="text-xs md:text-sm text-zinc-800 leading-relaxed space-y-3 font-medium">
                          {askAICacheRef.current[currentIndex]?.[activeQuestionAIMode[currentIndex]!] ||
                           askAICache[currentIndex]?.[activeQuestionAIMode[currentIndex]!] ||
                           (quiz[currentIndex]?.explanation ? `### 📝 Solution & Concept Breakdown\n${quiz[currentIndex]?.explanation}` : 'Generating live AI response...')}
                        </GlobalMarkdown>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            triggerVibration(10);
                            const text = askAICacheRef.current[currentIndex]?.[activeQuestionAIMode[currentIndex]!] ||
                              askAICache[currentIndex]?.[activeQuestionAIMode[currentIndex]!] ||
                              quiz[currentIndex]?.explanation || '';
                            if (text) {
                              navigator.clipboard?.writeText(text);
                              setCopiedAiHelp(true);
                              showToast('Copied AI explanation!');
                              setTimeout(() => setCopiedAiHelp(false), 2000);
                            }
                          }}
                          className="text-[10.5px] font-bold text-zinc-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          {copiedAiHelp ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                              <span className="text-emerald-700 font-extrabold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Answer</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            triggerVibration(15);
                            const curQ = quiz[currentIndex];
                            const text = askAICacheRef.current[currentIndex]?.[activeQuestionAIMode[currentIndex]!] ||
                              askAICache[currentIndex]?.[activeQuestionAIMode[currentIndex]!] || '';
                            setReportSnippet(`Question ${currentIndex + 1}: ${curQ.question}\nAI Help Mode: ${activeQuestionAIMode[currentIndex]}\nAI Response:\n${text}`);
                            setReportModalOpen(true);
                          }}
                          className="text-[10.5px] font-bold text-zinc-400 hover:text-rose-600 flex items-center gap-1 cursor-pointer transition-colors"
                          title="Report Inaccurate AI Output"
                        >
                          <Flag className="w-3 h-3 text-rose-400" />
                          <span>Report AI</span>
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

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
                    className={`p-4 rounded-2xl border text-left font-bold text-sm transition-all duration-300 active:scale-[0.99] flex items-start justify-between shadow-sm min-w-0 w-full overflow-hidden ${btnStyle}`}
                  >
                    <span className="pr-3 flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
                      <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-sm font-bold break-words [overflow-wrap:anywhere]">
                        {formatQuizMath(option)}
                      </GlobalMarkdown>
                    </span>
                    {isAnswered && isCorrectAnswer && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
                    {isAnswered && isSelected && !isCorrectAnswer && <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
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
                  <div className="text-xs font-bold text-zinc-700 leading-relaxed">
                    <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-xs font-bold text-zinc-700">
                      {formatQuizMath(quiz[currentIndex].explanation)}
                    </GlobalMarkdown>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-zinc-200/60 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        triggerVibration(15);
                        const curQ = quiz[currentIndex];
                        setReportSnippet(`Question ${currentIndex + 1}: ${curQ.question}\nCorrect Answer: ${curQ.correctAnswer}\nExplanation: ${curQ.explanation}`);
                        setReportModalOpen(true);
                      }}
                      className="px-2 py-1 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 transition-all flex items-center gap-1 text-[10.5px] font-bold active:scale-95 cursor-pointer"
                      title="Report Inaccurate or Inappropriate Content"
                    >
                      <Flag className="w-3.5 h-3.5 text-rose-500" />
                      <span>Report Question</span>
                    </button>
                  </div>
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
              You scored <span className="text-indigo-600 font-extrabold">{score} out of {quiz.length}</span> correct on this {topic ? `${topic} assessment` : 'custom curriculum assessment'}.
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

              <button
                type="button"
                onClick={() => {
                  triggerVibration(15);
                  const quizSnippet = quiz.map((q, i) => `Q${i + 1}: ${q.question}\nAns: ${q.correctAnswer}`).join('\n\n');
                  setReportSnippet(quizSnippet);
                  setReportModalOpen(true);
                }}
                className="w-full py-3.5 px-4 rounded-2xl font-bold text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 shadow-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer"
                title="Report Inaccurate or Inappropriate Content"
              >
                <Flag className="w-3.5 h-3.5 text-rose-500" />
                <span>Report AI Quiz</span>
              </button>
            </div>
          </motion.div>
        )}
          </>
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
                <div className="w-full mb-2">
                  <button
                    onClick={async () => {
                      triggerVibration(15);
                      try {
                        const blob = dataURItoBlob(shareImageUrl);
                        const title = 'My HelpYou AI Quiz Score!';
                        const text = `Check out my score on HelpYou AI! 🧠 I scored ${score}/${quiz.length} (${Math.round((score/quiz.length)*100)}%) on ${topic || 'Custom Assessment'}.`;
                        await shareImageMobile(blob, 'HelpYou_AI_Quiz_Score.png', title, text);
                        setShareStatus('success');
                        setShareMessage('Card shared successfully! 🎉');
                      } catch (err) {
                        console.error('Sharing failed:', err);
                        setShareStatus('error');
                        setShareMessage('Could not share performance card.');
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
                        <h4 className="text-xs font-black text-zinc-900 pt-0.5 leading-relaxed flex-1">
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-xs font-black text-zinc-900">
                            {formatQuizMath(q.question)}
                          </GlobalMarkdown>
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
                              className={`border-2 p-3 rounded-xl text-xs font-bold flex items-start gap-2 min-w-0 w-full overflow-hidden ${optStyle}`}
                            >
                              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <span className="flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
                                <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-xs font-bold break-words [overflow-wrap:anywhere]">
                                  {formatQuizMath(option)}
                                </GlobalMarkdown>
                              </span>
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
                            <div className="text-[10px] font-bold text-zinc-600 leading-relaxed">
                              <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-[10px] font-bold text-zinc-600">
                                {formatQuizMath(q.explanation)}
                              </GlobalMarkdown>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/30 flex items-center justify-between gap-3">
                {reviewingAttempt.questions && reviewingAttempt.questions.length > 0 ? (
                  <button
                    onClick={() => {
                      triggerVibration(10);
                      const retakeQuestions: Question[] = reviewingAttempt.questions.map((q: any) => ({
                        question: q.question,
                        options: q.options || [],
                        correctAnswer: q.correctAnswer,
                        explanation: q.explanation || ""
                      }));
                      setQuiz(retakeQuestions);
                      setCurrentIndex(0);
                      setSelectedOption(null);
                      setIsAnswered(false);
                      setScore(0);
                      setQuizState('playing');
                      setReviewingAttempt(null);
                      setShowHistory(false);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Retake Practice</span>
                  </button>
                ) : <div />}

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

      {/* ========================================================= */}
      {/* ASK AI MODAL / PAGE SHEET (SELECTION ONLY) */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showAskAIModal && quiz[currentIndex] && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAskAIModal(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="bg-white rounded-t-[2.5rem] sm:rounded-[2rem] w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl border border-zinc-200/80 relative z-10 overflow-hidden font-sans"
            >
              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-b from-indigo-50/40 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                    <Sparkles className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-zinc-900 tracking-tight flex items-center gap-2">
                      Ask AI Tutor
                      <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        LIVE ASSIST
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-500 font-bold">
                      Smart Explanations & Step-by-Step Hints
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAskAIModal(false)}
                  className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Question Context Pill / Preview */}
              <div className="px-6 py-3 bg-zinc-50/70 border-b border-zinc-100">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block mb-1">
                  Question {currentIndex + 1} of {quiz.length}
                </span>
                <div className="text-xs font-bold text-zinc-700 leading-relaxed">
                  <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-xs font-bold text-zinc-700">
                    {formatQuizMath(quiz[currentIndex].question)}
                  </GlobalMarkdown>
                </div>
              </div>

              {/* Content Area: Strictly the 2 Options for Selection */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="space-y-4 py-2">
                  <div className="text-center mb-5">
                    <span className="text-3xl filter drop-shadow-sm select-none">✨</span>
                    <h4 className="text-lg font-black text-zinc-900 mt-1">How can AI help you?</h4>
                    <p className="text-xs text-zinc-500 font-bold mt-0.5">Select an option below to guide your learning</p>
                  </div>

                  {/* OPTION 1: Explain Question & Hint */}
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectAIHelpOption('hint')}
                    className="w-full bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-400/40 hover:border-amber-500 rounded-3xl p-5 text-left transition-all shadow-sm flex items-start gap-4 cursor-pointer group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                      <Lightbulb className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          Option 1 • Concept & Clue
                        </span>
                      </div>
                      <h4 className="text-sm md:text-base font-black text-zinc-900 leading-snug">
                        Explain Question & Hint by AI
                      </h4>
                      <p className="text-xs text-zinc-600 font-medium mt-1 leading-relaxed">
                        Understand what the question is really asking, key variables, and get a guided hint without revealing the answer immediately.
                      </p>
                    </div>
                  </motion.button>

                  {/* OPTION 2: Explain Step-by-Step Answer */}
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectAIHelpOption('step_by_step')}
                    className="w-full bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border-2 border-indigo-400/40 hover:border-indigo-500 rounded-3xl p-5 text-left transition-all shadow-sm flex items-start gap-4 cursor-pointer group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          Option 2 • Full Walkthrough
                        </span>
                      </div>
                      <h4 className="text-sm md:text-base font-black text-zinc-900 leading-snug">
                        Explain Step-by-Step Answer by AI
                      </h4>
                      <p className="text-xs text-zinc-600 font-medium mt-1 leading-relaxed">
                        Get a complete step-by-step mathematical & conceptual explanation leading directly to the correct answer.
                      </p>
                    </div>
                  </motion.button>
                </div>
              </div>

              {/* Footer Toolbar: Always Close & Resume */}
              <div className="px-6 py-4 border-t border-zinc-100 bg-white">
                <button
                  type="button"
                  onClick={() => setShowAskAIModal(false)}
                  className="w-full py-3 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-xs font-bold transition-all cursor-pointer active:scale-95"
                >
                  Close & Resume Quiz
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* QUESTION NUMBERS PALETTE (SERIAL NUMBER JUMP SHEET) */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showQuestionPalette && quizState === 'playing' && quiz.length > 0 && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQuestionPalette(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />

            {/* Sheet Container */}
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="bg-white rounded-t-[2.5rem] sm:rounded-[2rem] w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl border border-zinc-200/80 relative z-10 overflow-hidden font-sans"
            >
              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/60">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700 font-black text-base shadow-2xs">
                    Q
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-zinc-900 tracking-tight leading-snug">
                      Question Navigator
                    </h3>
                    <p className="text-[11px] text-zinc-500 font-semibold">
                      Tap any number to jump to that question ({quiz.length} total)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowQuestionPalette(false)}
                  className="w-8 h-8 rounded-full bg-white border border-zinc-200/80 hover:bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Number Buttons Grid (Matching User Screenshot) */}
              <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-5 gap-2.5 sm:gap-3">
                  {quiz.map((_, idx) => {
                    const isCurrent = idx === currentIndex;
                    const isAnsweredQ = userAnswers[idx] !== undefined;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleJumpToQuestion(idx)}
                        className={`aspect-square rounded-2xl flex flex-col items-center justify-center text-base sm:text-lg transition-all cursor-pointer relative active:scale-95 ${
                          isCurrent
                            ? 'border-2 border-zinc-700 bg-zinc-50 text-zinc-950 font-black shadow-xs ring-1 ring-zinc-700/20'
                            : isAnsweredQ
                            ? 'border border-indigo-200/90 bg-indigo-50/70 text-indigo-700 font-black hover:bg-indigo-100/70'
                            : 'border border-zinc-200 bg-[#FAF9F6] text-zinc-700 font-bold hover:bg-zinc-100 hover:border-zinc-300'
                        }`}
                      >
                        <span>{idx + 1}</span>
                        {isAnsweredQ && !isCurrent && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Status Summary Footer */}
                <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between text-[11px] font-bold text-zinc-500 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-lg border-2 border-zinc-700 bg-zinc-50" />
                    <span>Current ({currentIndex + 1})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-lg border border-indigo-200 bg-indigo-50/80" />
                    <span>Answered ({Object.keys(userAnswers).length})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-lg border border-zinc-200 bg-[#FAF9F6]" />
                    <span>Remaining ({quiz.length - Object.keys(userAnswers).length})</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Play GenAI Safety Report Modal */}
      <ReportAIModal
        isOpen={reportModalOpen}
        messageText={reportSnippet}
        sourceFeature="Quiz Generator"
        onClose={() => {
          setReportModalOpen(false);
          setReportSnippet('');
        }}
      />
    </div>
  );
}
