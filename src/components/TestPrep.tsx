import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, ArrowRight, Sparkles, Award, Layers, CheckCircle2, 
  XCircle, Clock, BookOpen, Download, Share2, RefreshCw, 
  HelpCircle, ChevronRight, ChevronDown, ChevronUp, Check, AlertCircle, FileText, Send, Lock,
  Plus, Camera, Image as ImageIcon, X, Maximize2, Calculator, PenTool, Eraser, RotateCcw, Grid, Trash2, BellOff,
  Lightbulb, Timer, Play, Pause, Search, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerVibration } from '../utils/vibrate';
import { TOP_10_AP_SUBJECTS, APSubject, GRADE_9_RECOMMENDED_IDS } from '../utils/apCurriculum';
import { getApReferenceSheet, AP_PERIODIC_TABLE, PeriodicElement } from '../utils/apReferenceSheets';
import { getUserProfileData } from '../utils/profile';
import { getApiUrl } from '../utils/api';
import { takeNativePhoto, pickNativeFiles } from '../utils/mobilePicker';
import { Capacitor } from '@capacitor/core';
import GlobalMarkdown from './GlobalMarkdown';
import AdvancedLoader from './AdvancedLoader';
import jsPDF from 'jspdf';
import { savePDFMobile, sharePDFMobile } from '../utils/mobileSaver';
import { sanitizePdfText } from '../utils/pdfSanitizer';
import SafePdfViewer from './SafePdfViewer';
import { safeGetItem, safeSetItem, safeJsonParse } from '../utils/storage';

interface TestPrepProps {
  onBack: () => void;
  isVip?: boolean;
  onOpenVip?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export interface APTestPrepHistoryItem {
  id: string;
  timestamp: number;
  subjectId: string;
  subjectName: string;
  shortCode: string;
  category: string;
  unitId: string;
  unitTitle: string;
  customTopic?: string;
  questionType: 'objective' | 'subjective';
  count: number;
  objectiveQuestions?: APObjectiveQuestion[];
  subjectiveQuestions?: APSubjectiveQuestion[];
}

export interface APObjectiveQuestion {
  id: number;
  question: string;
  stimulus?: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  skill?: string;
}

export interface APSubjectiveQuestion {
  id: number;
  title?: string;
  prompt: string;
  totalPoints?: number;
  modelAnswer: string;
  scoringRubric: string[];
  skill?: string;
}

export interface AttachedAnswerImage {
  name: string;
  dataUrl: string;
  size?: number;
}

// College Board Official AP Exam Standard Time Allocations (in Seconds Per Question)
export const AP_EXAM_TIMING: Record<string, { objectiveSeconds: number; subjectiveSeconds: number; label: string }> = {
  // AP Human Geography: 60 MCQs in 60 min (60s/q = 1m00s) | 3 FRQs in 75 min (1500s/q = 25m)
  'ap-human-geography': { objectiveSeconds: 60, subjectiveSeconds: 1500, label: '1m 00s / MCQ • 25m / FRQ' },
  // AP Environmental Science: 80 MCQs in 90 min (68s/q = 1m08s) | 3 FRQs in 70 min (1400s/q = 23m 20s)
  'ap-environmental-science': { objectiveSeconds: 68, subjectiveSeconds: 1400, label: '1m 08s / MCQ • 23m 20s / FRQ' },
  // AP Computer Science Principles: 70 MCQs in 120 min (85s/q = 1m25s) | Written Response in 60 min (1800s/q = 30m)
  'ap-computer-science-principles': { objectiveSeconds: 85, subjectiveSeconds: 1800, label: '1m 25s / MCQ • 30m / Written Response' },
  // AP Calculus AB: 45 MCQs in 105 min (140s/q = 2m20s) | 6 FRQs in 90 min (900s/q = 15m)
  'ap-calculus-ab': { objectiveSeconds: 140, subjectiveSeconds: 900, label: '2m 20s / MCQ • 15m / FRQ' },
  // AP Calculus BC: 45 MCQs in 105 min (140s/q = 2m20s) | 6 FRQs in 90 min (900s/q = 15m)
  'ap-calculus-bc': { objectiveSeconds: 140, subjectiveSeconds: 900, label: '2m 20s / MCQ • 15m / FRQ' },
  // AP Biology: 60 MCQs in 90 min (90s/q = 1m30s) | 6 FRQs in 90 min (900s/q = 15m)
  'ap-biology': { objectiveSeconds: 90, subjectiveSeconds: 900, label: '1m 30s / MCQ • 15m / FRQ' },
  // AP Chemistry: 60 MCQs in 90 min (90s/q = 1m30s) | 7 FRQs in 105 min (900s/q = 15m)
  'ap-chemistry': { objectiveSeconds: 90, subjectiveSeconds: 900, label: '1m 30s / MCQ • 15m / FRQ' },
  // AP Physics 1: 40 MCQs in 80 min (120s/q = 2m00s) | 4 FRQs in 100 min (1500s/q = 25m)
  'ap-physics': { objectiveSeconds: 120, subjectiveSeconds: 1500, label: '2m 00s / MCQ • 25m / FRQ' },
  // AP Computer Science A: 40 MCQs in 90 min (135s/q = 2m15s) | 4 FRQs in 90 min (1350s/q = 22.5m)
  'ap-computer-science': { objectiveSeconds: 135, subjectiveSeconds: 1350, label: '2m 15s / MCQ • 22m 30s / FRQ' },
  // AP U.S. History: 55 MCQs in 55 min (60s/q = 1m00s) | FRQ/DBQ/LEQ/SAQ average 1080s/q (18m)
  'ap-us-history': { objectiveSeconds: 60, subjectiveSeconds: 1080, label: '1m 00s / MCQ • 18m / FRQ' },
  // AP World History: 55 MCQs in 55 min (60s/q = 1m00s) | FRQ/DBQ/LEQ/SAQ average 1080s/q (18m)
  'ap-world-history': { objectiveSeconds: 60, subjectiveSeconds: 1080, label: '1m 00s / MCQ • 18m / FRQ' },
  // AP English Language: 45 MCQs in 60 min (80s/q = 1m20s) | 3 FRQs in 135 min (2700s/q = 45m)
  'ap-english-lang': { objectiveSeconds: 80, subjectiveSeconds: 2700, label: '1m 20s / MCQ • 45m / FRQ' },
  // AP Psychology: 75 MCQs in 90 min (72s/q = 1m12s) | 2 FRQs in 70 min (2100s/q = 35m)
  'ap-psychology': { objectiveSeconds: 72, subjectiveSeconds: 2100, label: '1m 12s / MCQ • 35m / FRQ' },
  // AP Micro & Macroeconomics: 60 MCQs in 70 min (70s/q = 1m10s) | 3 FRQs in 60 min (1200s/q = 20m)
  'ap-economics': { objectiveSeconds: 70, subjectiveSeconds: 1200, label: '1m 10s / MCQ • 20m / FRQ' }
};

export function getApExamDurationSeconds(subjectId: string, qType: 'objective' | 'subjective', count: number): number {
  const normId = (subjectId || '').toLowerCase();
  let timing = AP_EXAM_TIMING[normId];
  if (!timing) {
    const key = Object.keys(AP_EXAM_TIMING).find(k => normId.includes(k) || k.includes(normId));
    timing = key ? AP_EXAM_TIMING[key] : { objectiveSeconds: 90, subjectiveSeconds: 900, label: '1m 30s / MCQ • 15m / FRQ' };
  }
  const perQuestion = qType === 'objective' ? timing.objectiveSeconds : timing.subjectiveSeconds;
  return perQuestion * Math.max(1, count);
}

type QuestionType = 'objective' | 'subjective';
type Step = 'select-subject' | 'configure' | 'practice';

export default function TestPrep({ onBack, isVip = false, onOpenVip, onNavigateToTab }: TestPrepProps) {
  // Active User Academic Profile & Grade Detection
  const [userGrade, setUserGrade] = useState<string>(() => {
    const p = getUserProfileData();
    return p.gradeLevel || safeGetItem('academic_grade') || '11th Grade (Junior)';
  });

  useEffect(() => {
    const updateGrade = () => {
      const p = getUserProfileData();
      const current = p.gradeLevel || safeGetItem('academic_grade') || '11th Grade (Junior)';
      setUserGrade(current);
    };
    window.addEventListener('storage', updateGrade);
    window.addEventListener('focus', updateGrade);
    return () => {
      window.removeEventListener('storage', updateGrade);
      window.removeEventListener('focus', updateGrade);
    };
  }, []);

  const isGrade9Student = useMemo(() => {
    const g = userGrade.toLowerCase();
    return g.includes('9th') || g.includes('freshman');
  }, [userGrade]);

  // Default subject based on grade level (APHG is the premier Grade 9 course)
  const defaultSubject = useMemo(() => {
    if (isGrade9Student) {
      return TOP_10_AP_SUBJECTS.find(s => s.id === 'ap-human-geography') || TOP_10_AP_SUBJECTS[0];
    }
    return TOP_10_AP_SUBJECTS[0];
  }, [isGrade9Student]);

  // Navigation & Flow States
  const [step, setStep] = useState<Step>('select-subject');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Subject & Unit Selection
  const [selectedSubject, setSelectedSubject] = useState<APSubject>(defaultSubject);
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(defaultSubject.id);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all');
  const [customTopic, setCustomTopic] = useState<string>('');

  // Configuration States
  const [questionType, setQuestionType] = useState<QuestionType>('objective');
  const [questionCount, setQuestionCount] = useState<number>(5);

  // Practice & Results States
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMsg, setLoadingMsg] = useState<string>('Connecting to College Board AP Engine...');
  const [error, setError] = useState<string | null>(null);

  // Questions Data
  const [objectiveQuestions, setObjectiveQuestions] = useState<APObjectiveQuestion[]>([]);
  const [subjectiveQuestions, setSubjectiveQuestions] = useState<APSubjectiveQuestion[]>([]);

  // Objective Practice State
  const [currentObjIndex, setCurrentObjIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showExplanation, setShowExplanation] = useState<Record<number, boolean>>({});
  const [isExamCompleted, setIsExamCompleted] = useState<boolean>(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(0);
  const [totalAllocatedSeconds, setTotalAllocatedSeconds] = useState<number>(0);
  const [isTimerActive, setIsTimerActive] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Subjective Practice State
  const [currentSubIndex, setCurrentSubIndex] = useState<number>(0);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [showRubric, setShowRubric] = useState<Record<number, boolean>>({});
  const [evaluations, setEvaluations] = useState<Record<number, { text: string; loading: boolean }>>({});
  const [attachedImages, setAttachedImages] = useState<Record<number, AttachedAnswerImage | null>>({});
  const [showPlusMenuIndex, setShowPlusMenuIndex] = useState<number | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Exam Calculator States
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [calcDisplay, setCalcDisplay] = useState<string>('0');
  const [calcExpression, setCalcExpression] = useState<string>('');

  // Graphing & Scratchpad Canvas States
  const [showDrawingCanvas, setShowDrawingCanvas] = useState<boolean>(false);
  const [canvasPenColor, setCanvasPenColor] = useState<string>('#18181b');
  const [canvasPenWidth, setCanvasPenWidth] = useState<number>(3);
  const [isEraserActive, setIsEraserActive] = useState<boolean>(false);
  const [showGridPaper, setShowGridPaper] = useState<boolean>(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // History & PDF Preview States
  const [historyList, setHistoryList] = useState<APTestPrepHistoryItem[]>(() => {
    return safeJsonParse<APTestPrepHistoryItem[]>(safeGetItem('ap_test_prep_history'), []);
  });
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState<string>('AP_Practice_Set.pdf');

  // AI Magic Tutor States
  const [showTutorModal, setShowTutorModal] = useState<boolean>(false);
  const [tutorActiveQuestion, setTutorActiveQuestion] = useState<{
    text: string;
    stimulus?: string;
    options?: string[];
    type: 'objective' | 'subjective';
    skill?: string;
  } | null>(null);
  const [tutorLoading, setTutorLoading] = useState<boolean>(false);
  const [tutorExplanation, setTutorExplanation] = useState<string>('');
  const [tutorFollowUp, setTutorFollowUp] = useState<string>('');
  const [tutorChatHistory, setTutorChatHistory] = useState<Array<{ role: 'user' | 'tutor'; text: string }>>([]);

  // Ask AI 2-Suggestion Choice Modal State
  const [askAiModalData, setAskAiModalData] = useState<{
    question: APObjectiveQuestion | APSubjectiveQuestion;
    type: 'objective' | 'subjective';
  } | null>(null);

  // Custom Timer Settings & Time's Up Screen States
  const [showTimerSetupModal, setShowTimerSetupModal] = useState<boolean>(false);
  const [showTimesUpModal, setShowTimesUpModal] = useState<boolean>(false);
  const [customTimerMinutes, setCustomTimerMinutes] = useState<string>('15');

  // Official AP Formula Sheet & Periodic Table States
  const [showFormulaModal, setShowFormulaModal] = useState<boolean>(false);
  const [formulaModalTab, setFormulaModalTab] = useState<'formulas' | 'periodic-table'>('formulas');
  const [selectedPeriodicElement, setSelectedPeriodicElement] = useState<PeriodicElement | null>(null);
  const [formulaSearchQuery, setFormulaSearchQuery] = useState<string>('');

  // Subjective (FRQ) Scoring State
  const [subjectiveScores, setSubjectiveScores] = useState<Record<number, { earned: number; total: number; feedback?: string }>>({});

  // Reference Sheet Data for Active Subject
  const referenceData = useMemo(() => {
    return getApReferenceSheet(selectedSubject.id);
  }, [selectedSubject.id]);

  // Comprehensive FRQ Score Summary (1-to-5 Scale)
  const frqScoreSummary = useMemo(() => {
    let earnedTotal = 0;
    let maxTotal = 0;
    let evaluatedCount = 0;

    subjectiveQuestions.forEach((q, idx) => {
      const qMax = q.totalPoints || 6;
      if (subjectiveScores[idx]) {
        earnedTotal += subjectiveScores[idx].earned;
        maxTotal += subjectiveScores[idx].total || qMax;
        evaluatedCount++;
      } else {
        maxTotal += qMax;
      }
    });

    const percentage = maxTotal > 0 ? Math.round((earnedTotal / maxTotal) * 100) : 0;
    let score = 1;
    let label = 'No Recommendation (Foundational Review Required)';
    let color = 'text-red-700';
    let bg = 'bg-red-50 border-red-300';

    if (percentage >= 75) {
      score = 5;
      label = 'Extremely Well Qualified (Top 10-15% Caliber)';
      color = 'text-emerald-700';
      bg = 'bg-emerald-50 border-emerald-300';
    } else if (percentage >= 60) {
      score = 4;
      label = 'Well Qualified (College Credit Ready)';
      color = 'text-blue-700';
      bg = 'bg-blue-50 border-blue-300';
    } else if (percentage >= 45) {
      score = 3;
      label = 'Qualified (College Board Passing Standard)';
      color = 'text-amber-700';
      bg = 'bg-amber-50 border-amber-300';
    } else if (percentage >= 30) {
      score = 2;
      label = 'Possibly Qualified (Targeted Practice Needed)';
      color = 'text-orange-700';
      bg = 'bg-orange-50 border-orange-300';
    }

    return {
      earnedTotal,
      maxTotal,
      percentage,
      evaluatedCount,
      score,
      label,
      color,
      bg
    };
  }, [subjectiveQuestions, subjectiveScores]);



  // Filtered Subjects: strictly curated for 9th graders if user's profile is 9th Grade.
  // For 10th-12th grades, all AP courses are available.
  const filteredSubjects = useMemo(() => {
    let list = TOP_10_AP_SUBJECTS;
    if (isGrade9Student) {
      list = list.filter(s => s.gradeLevels?.includes('9th') || GRADE_9_RECOMMENDED_IDS.includes(s.id));
    }
    if (selectedCategory === 'All') return list;
    return list.filter(s => s.category === selectedCategory);
  }, [selectedCategory, isGrade9Student]);

  // Auto-sync selectedSubject if user grade switches to 9th and current subject is not in 9th grade catalog
  useEffect(() => {
    if (isGrade9Student) {
      const isCurrentValid = selectedSubject.gradeLevels?.includes('9th') || GRADE_9_RECOMMENDED_IDS.includes(selectedSubject.id);
      if (!isCurrentValid) {
        const fallback = TOP_10_AP_SUBJECTS.find(s => s.id === 'ap-human-geography') || TOP_10_AP_SUBJECTS[0];
        setSelectedSubject(fallback);
        setExpandedSubjectId(fallback.id);
      }
    }
  }, [isGrade9Student, selectedSubject]);

  // Selected Unit Object
  const selectedUnit = useMemo(() => {
    if (selectedUnitId === 'all') return null;
    return selectedSubject.units.find(u => u.id === selectedUnitId) || null;
  }, [selectedSubject, selectedUnitId]);

  // Timer Alarm Sound & Audio Controls
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState<boolean>(false);

  const playAlarmBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("Alarm sound error:", e);
    }
  };

  const startAlarmSound = () => {
    setIsAlarmPlaying(true);
    playAlarmBeep();
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = setInterval(() => {
      playAlarmBeep();
    }, 850);
  };

  const stopAlarmSound = () => {
    triggerVibration(15);
    setIsAlarmPlaying(false);
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  };

  // Clean up alarm sound on unmount or step change
  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, []);

  // College Board Standard AP Exam Countdown Timer Effect (Both Objective & Subjective)
  useEffect(() => {
    if (step === 'practice' && isTimerActive && !isExamCompleted && !loading) {
      timerRef.current = setInterval(() => {
        setTimeRemainingSeconds(prev => {
          if (prev <= 1) {
            triggerVibration([80, 100, 80, 100]);
            startAlarmSound();
            setShowTimesUpModal(true);
            setIsTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, isTimerActive, isExamCompleted, loading]);

  // Format Timer (supports HH:MM:SS or MM:SS)
  const formatTime = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculator Policy for Current Subject & Section
  const calculatorPolicy = useMemo(() => {
    const s = selectedSubject.id.toLowerCase();
    if (s.includes('calculus')) {
      return {
        allowed: true,
        label: questionType === 'objective' ? 'Calc Active (Sec I-B)' : 'Calc Active (Sec II-A)',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    }
    if (s.includes('chemistry') || s.includes('physics') || s.includes('biology') || s.includes('economics') || s.includes('environmental')) {
      return {
        allowed: true,
        label: 'Calculator Permitted',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    }
    return {
      allowed: false,
      label: 'No Calculator Exam',
      color: 'bg-zinc-100 text-zinc-500 border-zinc-200'
    };
  }, [selectedSubject, questionType]);

  // Auto-reset calculator if current subject does not permit a calculator
  useEffect(() => {
    if (!calculatorPolicy.allowed && showCalculator) {
      setShowCalculator(false);
    }
  }, [calculatorPolicy.allowed, showCalculator]);

  // Scientific Calculator Evaluation
  const handleCalcButton = (val: string) => {
    triggerVibration(5);
    if (val === 'C') {
      setCalcDisplay('0');
      setCalcExpression('');
      return;
    }
    if (val === '⌫') {
      if (calcDisplay.length <= 1 || calcDisplay === 'Error') {
        setCalcDisplay('0');
      } else {
        setCalcDisplay(prev => prev.slice(0, -1));
      }
      return;
    }
    if (val === '=') {
      try {
        let expr = calcDisplay
          .replace(/×/g, '*')
          .replace(/÷/g, '/')
          .replace(/π/g, 'Math.PI')
          .replace(/e(?![a-z])/g, 'Math.E')
          .replace(/sin\(/g, 'Math.sin(')
          .replace(/cos\(/g, 'Math.cos(')
          .replace(/tan\(/g, 'Math.tan(')
          .replace(/ln\(/g, 'Math.log(')
          .replace(/log\(/g, 'Math.log10(')
          .replace(/√\(/g, 'Math.sqrt(')
          .replace(/\^/g, '**');

        const result = Function(`"use strict"; return (${expr})`)();
        if (typeof result === 'number' && !isNaN(result)) {
          const rounded = Math.round(result * 1000000) / 1000000;
          setCalcExpression(calcDisplay + ' =');
          setCalcDisplay(String(rounded));
        } else {
          setCalcDisplay('Error');
        }
      } catch (err) {
        setCalcDisplay('Error');
      }
      return;
    }

    if (['sin(', 'cos(', 'tan(', 'ln(', 'log(', '√('].includes(val)) {
      setCalcDisplay(prev => prev === '0' || prev === 'Error' ? val : prev + val);
      return;
    }

    setCalcDisplay(prev => {
      if ((prev === '0' || prev === 'Error') && !['+', '×', '÷', '^', '.', ')'].includes(val)) {
        return val;
      }
      return prev + val;
    });
  };

  // Drawing Canvas Methods
  const startDrawing = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    isDrawingRef.current = true;
    lastPointRef.current = { x, y };
  };

  const drawMove = (clientX: number, clientY: number) => {
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isEraserActive) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = canvasPenWidth * 4;
    } else {
      ctx.strokeStyle = canvasPenColor;
      ctx.lineWidth = canvasPenWidth;
    }
    ctx.stroke();
    lastPointRef.current = { x, y };
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    triggerVibration(10);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleInsertDrawing = () => {
    triggerVibration(15);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setAttachedImages(prev => ({
      ...prev,
      [currentSubIndex]: {
        name: `Graph_${selectedSubject.shortCode}_Work.png`,
        dataUrl
      }
    }));
    setShowDrawingCanvas(false);
  };

  useEffect(() => {
    if (showDrawingCanvas && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [showDrawingCanvas]);

  // Handle Back Button
  const handleBack = () => {
    triggerVibration(10);
    if (step === 'practice') {
      if (window.confirm("Do you want to exit your active AP practice session?")) {
        setIsTimerActive(false);
        stopAlarmSound();
        setStep('configure');
        setIsExamCompleted(false);
      }
    } else if (step === 'configure') {
      setIsTimerActive(false);
      stopAlarmSound();
      setStep('select-subject');
    } else {
      setIsTimerActive(false);
      stopAlarmSound();
      onBack();
    }
  };

  // API Call to Generate Questions
  const handleGenerateQuestions = async () => {
    triggerVibration(20);
    setLoading(true);
    setError(null);
    setLoadingMsg(
      questionType === 'objective'
        ? `Crafting authentic AP ${selectedSubject.shortCode} Multiple Choice Questions...`
        : `Developing College Board AP ${selectedSubject.shortCode} Free Response Questions & Rubrics...`
    );

    const unitTitle = selectedUnit ? selectedUnit.title : 'All Curriculum Units (Comprehensive AP Review)';
    const promptTopic = customTopic.trim() ? `${unitTitle} - ${customTopic.trim()}` : unitTitle;

    try {
      const response = await fetch(getApiUrl('/api/generate-ap-questions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: selectedSubject.name,
          unit: unitTitle,
          topic: promptTopic,
          questionType,
          count: questionCount,
          gradeLevel: userGrade || 'Advanced Placement (AP High School)'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate AP questions. Please try again.');
      }

      if (questionType === 'objective') {
        const questionsList: APObjectiveQuestion[] = Array.isArray(data.questions) ? data.questions : [];
        if (questionsList.length === 0) {
          throw new Error('Received empty question set from server.');
        }
        setObjectiveQuestions(questionsList);
        setCurrentObjIndex(0);
        setSelectedAnswers({});
        setShowExplanation({});
        setIsExamCompleted(false);

        // Calculate authentic AP Exam time for this subject and question count (User can start timer manually)
        const allocatedTime = getApExamDurationSeconds(selectedSubject.id, 'objective', questionsList.length);
        setTotalAllocatedSeconds(allocatedTime);
        setTimeRemainingSeconds(allocatedTime);
        setIsTimerActive(false);

        // Auto-save generated questions to History line-wise
        const newHistoryItem: APTestPrepHistoryItem = {
          id: `ap_mcq_${Date.now()}`,
          timestamp: Date.now(),
          subjectId: selectedSubject.id,
          subjectName: selectedSubject.name,
          shortCode: selectedSubject.shortCode,
          category: selectedSubject.category,
          unitId: selectedUnitId,
          unitTitle,
          customTopic: customTopic.trim() || undefined,
          questionType: 'objective',
          count: questionsList.length,
          objectiveQuestions: questionsList
        };
        setHistoryList(prev => {
          const updated = [newHistoryItem, ...prev.filter(h => h.id !== newHistoryItem.id)].slice(0, 50);
          safeSetItem('ap_test_prep_history', JSON.stringify(updated));
          return updated;
        });
      } else {
        const questionsList: APSubjectiveQuestion[] = Array.isArray(data.questions) ? data.questions : [];
        if (questionsList.length === 0) {
          throw new Error('Received empty free response questions from server.');
        }
        setSubjectiveQuestions(questionsList);
        setCurrentSubIndex(0);
        setStudentAnswers({});
        setShowRubric({});
        setEvaluations({});
        setAttachedImages({});
        setShowPlusMenuIndex(null);

        // Calculate authentic AP Exam time for this subject and question count (User can start timer manually)
        const allocatedTime = getApExamDurationSeconds(selectedSubject.id, 'subjective', questionsList.length);
        setTotalAllocatedSeconds(allocatedTime);
        setTimeRemainingSeconds(allocatedTime);
        setIsTimerActive(false);

        // Auto-save generated questions to History line-wise
        const newHistoryItem: APTestPrepHistoryItem = {
          id: `ap_frq_${Date.now()}`,
          timestamp: Date.now(),
          subjectId: selectedSubject.id,
          subjectName: selectedSubject.name,
          shortCode: selectedSubject.shortCode,
          category: selectedSubject.category,
          unitId: selectedUnitId,
          unitTitle,
          customTopic: customTopic.trim() || undefined,
          questionType: 'subjective',
          count: questionsList.length,
          subjectiveQuestions: questionsList
        };
        setHistoryList(prev => {
          const updated = [newHistoryItem, ...prev.filter(h => h.id !== newHistoryItem.id)].slice(0, 50);
          safeSetItem('ap_test_prep_history', JSON.stringify(updated));
          return updated;
        });
      }

      setStep('practice');
    } catch (err: any) {
      console.error("AP Question Generation Error:", err);
      setError(err.message || "Failed to generate questions. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  // Camera & Gallery Attachment Handlers
  const handleCameraClick = async (qIndex: number) => {
    setShowPlusMenuIndex(null);
    triggerVibration(15);
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await takeNativePhoto();
        if (photo && photo.dataUrl) {
          setAttachedImages(prev => ({
            ...prev,
            [qIndex]: {
              name: photo.name,
              dataUrl: photo.dataUrl,
              size: photo.blob?.size
            }
          }));
        }
      } catch (e: any) {
        console.warn('Native camera error or cancelled:', e);
      }
    } else {
      cameraInputRef.current?.click();
    }
  };

  const handleGalleryClick = async (qIndex: number) => {
    setShowPlusMenuIndex(null);
    triggerVibration(15);
    if (Capacitor.isNativePlatform()) {
      try {
        const picked = await pickNativeFiles({ types: 'image', multiple: false });
        if (picked && picked.length > 0 && picked[0].dataUrl) {
          setAttachedImages(prev => ({
            ...prev,
            [qIndex]: {
              name: picked[0].name,
              dataUrl: picked[0].dataUrl,
              size: picked[0].blob?.size
            }
          }));
        }
      } catch (e: any) {
        console.warn('Native gallery error or cancelled:', e);
      }
    } else {
      galleryInputRef.current?.click();
    }
  };

  const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>, qIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setAttachedImages(prev => ({
          ...prev,
          [qIndex]: {
            name: file.name,
            dataUrl,
            size: file.size
          }
        }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Helper to convert base64 dataURL to DOM File for AI Magic Tutor multi-modal attachment
  const dataURLtoFile = (dataurl: string, filename: string): File | undefined => {
    try {
      const arr = dataurl.split(',');
      if (arr.length < 2) return undefined;
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    } catch (e) {
      console.warn("Failed to convert dataURL to File:", e);
      return undefined;
    }
  };

  // In-Place AI Chief Reader Grading for Subjective (FRQ) Questions
  const handleEvaluateAnswer = async (index: number) => {
    const q = subjectiveQuestions[index];
    if (!q) return;
    const ans = (studentAnswers[index] || '').trim();
    const img = attachedImages[index];

    if (!ans && !img) {
      alert("Please write your answer or attach a photo/sketch of your handwritten work first!");
      return;
    }

    triggerVibration(15);
    setEvaluations(prev => ({
      ...prev,
      [index]: { text: '', loading: true }
    }));

    try {
      const response = await fetch(getApiUrl('/api/evaluate-answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: q.prompt,
          userAnswer: ans || 'Student submitted solution in the attached photo/drawing.',
          subject: selectedSubject.name,
          userGrade: 'AP High School Exam Standard',
          image: img?.dataUrl || ''
        })
      });

      if (!response.ok) {
        throw new Error(`Grading server returned ${response.status}`);
      }

      const data = await response.json();
      const feedbackText = data.evaluation || data.feedback || "Evaluation complete.";

      // Extract earned points from College Board Chief Reader scorecard
      let earned = 0;
      let total = q.totalPoints || 6;

      const ptsMatch = feedbackText.match(/(?:Total AP Points|Score|Earned Points)[\s\S]*?(\d+)\s*\/\s*(\d+)/i)
        || feedbackText.match(/(\d+)\s*\/\s*(\d+)\s*(?:points|pts)/i);

      if (ptsMatch) {
        earned = Math.min(parseInt(ptsMatch[1], 10), parseInt(ptsMatch[2], 10));
        total = parseInt(ptsMatch[2], 10);
      } else {
        if (feedbackText.toLowerCase().includes('full-credit') || feedbackText.toLowerCase().includes('score 5')) {
          earned = total;
        } else if (feedbackText.toLowerCase().includes('score 4')) {
          earned = Math.round(total * 0.8);
        } else if (feedbackText.toLowerCase().includes('score 3')) {
          earned = Math.round(total * 0.6);
        } else {
          earned = Math.max(1, Math.round(total * 0.4));
        }
      }

      setSubjectiveScores(prev => ({
        ...prev,
        [index]: { earned, total, feedback: feedbackText }
      }));

      setEvaluations(prev => ({
        ...prev,
        [index]: { text: feedbackText, loading: false }
      }));
      triggerVibration(25);
    } catch (err: any) {
      console.error("AI Evaluation error:", err);
      setEvaluations(prev => ({
        ...prev,
        [index]: { 
          text: `⚠️ AI Evaluation Notice: ${err.message || "Please check connection and try again."}`, 
          loading: false 
        }
      }));
    }
  };

  // Open 2-Suggestion Ask AI Selection Modal
  const handleOpenAITutor = (
    q: APObjectiveQuestion | APSubjectiveQuestion,
    type: 'objective' | 'subjective'
  ) => {
    triggerVibration(10);
    setAskAiModalData({ question: q, type });
  };

  // User chooses one of the 2 AI suggestions
  const handleSelectAITutorMode = (mode: 'hints' | 'full-solution') => {
    if (!askAiModalData) return;
    const { question: q, type } = askAiModalData;
    triggerVibration(15);
    setAskAiModalData(null);

    const qText = 'question' in q ? q.question : q.prompt;
    const stimulus = 'stimulus' in q ? q.stimulus : undefined;
    const options = 'options' in q ? q.options : undefined;
    const correctAnswer = 'correctAnswer' in q ? q.correctAnswer : undefined;
    const explanation = 'explanation' in q ? q.explanation : undefined;
    const modelAnswer = 'modelAnswer' in q ? q.modelAnswer : undefined;
    const scoringRubric = 'scoringRubric' in q ? q.scoringRubric : undefined;

    let promptText = '';

    if (mode === 'hints') {
      promptText = `[AP® EXAM PREP - HINT & CONCEPT MODE]
Subject: ${selectedSubject.name} (${selectedSubject.shortCode})
Unit: ${selectedUnit?.title || 'AP Course Material'}

Question / Prompt:
"${qText}"${stimulus ? `\n\nContext / Stimulus:\n${stimulus}` : ''}${options ? `\n\nOptions:\n${options.join('\n')}` : ''}

Student's Choice:
"Explain question with hints by AI."

Instructions for AI Magic Tutor:
1. Break down what the question is asking in clear, intuitive terms.
2. Explain the fundamental AP concepts, formulas, or historical/scientific contexts required.
3. Provide 2-3 strategic clues or step-by-step guided hints so the student can think through and solve it themselves.
4. DO NOT give away the final direct answer or correct option immediately—encourage the student to solve it with your hints!`;
    } else {
      promptText = `[AP® EXAM PREP - COMPLETE EXPLANATION & SOLUTION MODE]
Subject: ${selectedSubject.name} (${selectedSubject.shortCode})
Unit: ${selectedUnit?.title || 'AP Course Material'}

Question / Prompt:
"${qText}"${stimulus ? `\n\nContext / Stimulus:\n${stimulus}` : ''}${options ? `\n\nOptions:\n${options.join('\n')}` : ''}${correctAnswer ? `\n\nOfficial Correct Answer: ${correctAnswer}` : ''}${explanation ? `\n\nOfficial Solution & Explanation: ${explanation}` : ''}${modelAnswer ? `\n\nOfficial Model Solution: ${modelAnswer}` : ''}${scoringRubric && scoringRubric.length > 0 ? `\n\nOfficial Scoring Rubric:\n${scoringRubric.join('\n')}` : ''}

Student's Choice:
"Explain question and answer with AI."

Instructions for AI Magic Tutor:
1. Clearly state the correct answer / model response right away.
2. Provide a thorough, crystal-clear step-by-step mathematical, scientific, or conceptual explanation of why this answer is correct.
3. If options exist, explain specifically why the incorrect options (distractors) are wrong and what common student traps to avoid.
4. Provide a high-yield College Board AP exam tip or takeaway to guarantee full points on similar exam questions!`;
    }

    const event = new CustomEvent('study-scanner-send-to-tutor', {
      detail: {
        text: promptText,
        subject: selectedSubject.name,
        isEvaluation: false
      }
    });
    window.dispatchEvent(event);

    if (onNavigateToTab) {
      onNavigateToTab('aitutor');
    }
  };

  // Send follow-up question to AI Magic Tutor
  const handleSendTutorFollowUp = async () => {
    if (!tutorFollowUp.trim() || tutorLoading || !tutorActiveQuestion) return;
    const questionMsg = tutorFollowUp.trim();
    triggerVibration(10);
    setTutorFollowUp('');
    setTutorChatHistory(prev => [...prev, { role: 'user', text: questionMsg }]);
    setTutorLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/ap-tutor-explain'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: tutorActiveQuestion.text,
          stimulus: tutorActiveQuestion.stimulus,
          options: tutorActiveQuestion.options,
          questionType: tutorActiveQuestion.type,
          subject: selectedSubject.name,
          unit: selectedUnit ? selectedUnit.title : selectedSubject.name,
          followUpQuestion: questionMsg
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }
      setTutorChatHistory(prev => [...prev, { role: 'tutor', text: data.explanation }]);
    } catch (err: any) {
      setTutorChatHistory(prev => [...prev, { role: 'tutor', text: "⚠️ Let's think through this step: What mathematical or conceptual property from this unit applies to the given quantities?" }]);
    } finally {
      setTutorLoading(false);
    }
  };

  // Transition seamlessly to full AI Magic Tutor Tab
  const handleSendToFullAITutor = () => {
    if (!tutorActiveQuestion) return;
    triggerVibration(15);
    const promptText = `[AP Exam Prep - ${selectedSubject.name}]\nPlease explain this AP ${tutorActiveQuestion.type === 'objective' ? 'Multiple Choice' : 'Free Response'} question to me. Break down what it is asking, explain the core concepts, and provide strategic hints so I can solve it myself without giving away the direct answer!\n\nQuestion:\n${tutorActiveQuestion.text}${tutorActiveQuestion.stimulus ? `\n\nContext:\n${tutorActiveQuestion.stimulus}` : ''}${tutorActiveQuestion.options ? `\n\nOptions:\n${tutorActiveQuestion.options.join('\n')}` : ''}`;

    const event = new CustomEvent('study-scanner-send-to-tutor', {
      detail: {
        text: promptText,
        subject: selectedSubject.name,
        isEvaluation: false
      }
    });
    window.dispatchEvent(event);

    setShowTutorModal(false);
    if (onNavigateToTab) {
      onNavigateToTab('aitutor');
    }
  };

  // Calculate Objective Results
  const objectiveScore = useMemo(() => {
    let correct = 0;
    objectiveQuestions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctAnswer) {
        correct++;
      }
    });
    return correct;
  }, [objectiveQuestions, selectedAnswers]);

  // AP Predicted Score (1 to 5)
  const apPredictedScore = useMemo(() => {
    if (objectiveQuestions.length === 0) return { score: 1, label: 'No Recommendation', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
    const percentage = (objectiveScore / objectiveQuestions.length) * 100;
    if (percentage >= 80) return { score: 5, label: 'Extremely Well Qualified (Top 10-15%)', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300' };
    if (percentage >= 65) return { score: 4, label: 'Well Qualified (College Credit Ready)', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300' };
    if (percentage >= 50) return { score: 3, label: 'Qualified (Passing Standard)', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300' };
    if (percentage >= 35) return { score: 2, label: 'Possibly Qualified (Needs Targeted Review)', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-300' };
    return { score: 1, label: 'No Recommendation (Foundational Review Required)', color: 'text-red-700', bg: 'bg-red-50 border-red-300' };
  }, [objectiveScore, objectiveQuestions.length]);

  // Format History Timestamp
  const formatHistoryDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${timeStr}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  // Export PDF Utility & Instant Preview Opener
  const handleExportPDF = async (
    customQuestions?: { type: 'objective'; items: APObjectiveQuestion[] } | { type: 'subjective'; items: APSubjectiveQuestion[] },
    customSubject?: { name: string; shortCode: string },
    customUnitTitle?: string
  ) => {
    triggerVibration(15);
    try {
      const qType = customQuestions ? customQuestions.type : questionType;
      const subj = customSubject || { name: selectedSubject.name, shortCode: selectedSubject.shortCode };
      const uTitle = customUnitTitle || (selectedUnit ? selectedUnit.title : 'All Curriculum Units');
      const objQs = customQuestions && customQuestions.type === 'objective' ? customQuestions.items : objectiveQuestions;
      const subQs = customQuestions && customQuestions.type === 'subjective' ? customQuestions.items : subjectiveQuestions;

      if (qType === 'objective' && (!objQs || objQs.length === 0)) {
        alert("No objective questions available to export.");
        return;
      }
      if (qType === 'subjective' && (!subQs || subQs.length === 0)) {
        alert("No free response questions available to export.");
        return;
      }

      const doc = new jsPDF({
        unit: 'pt',
        format: 'a4',
        orientation: 'portrait'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 36;
      const contentWidth = pageWidth - (margin * 2);

      let currentY = 0;
      let currentPage = 1;

      // Header helper
      const drawHeader = (isFirstPage: boolean) => {
        if (isFirstPage) {
          doc.setFillColor(30, 27, 75); // Deep Indigo (#1e1b4b)
          doc.rect(0, 0, pageWidth, 74, 'F');

          doc.setFillColor(99, 102, 241); // Indigo-500 strip
          doc.rect(0, 74, pageWidth, 3, 'F');

          doc.setTextColor(251, 191, 36); // Gold Amber
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text('HELPYOU AI  |  ADVANCED PLACEMENT® EXAM PREPARATION', margin, 24);

          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.text(`AP® ${sanitizePdfText(subj.name)} Practice Set`, margin, 45);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(226, 232, 240);
          const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          doc.text(`Format: ${qType === 'objective' ? 'Section I (Multiple Choice)' : 'Section II (Free Response)'}   |   Unit: ${sanitizePdfText(uTitle)}   |   ${dateStr}`, margin, 62);

          currentY = 96;
        } else {
          doc.setFillColor(248, 250, 252);
          doc.rect(0, 0, pageWidth, 28, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.line(0, 28, pageWidth, 28);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(`AP® ${sanitizePdfText(subj.shortCode)} - ${qType === 'objective' ? 'Multiple Choice' : 'Free Response'}`, margin, 18);
          doc.text('HelpYou AI Practice Engine', pageWidth - margin, 18, { align: 'right' });

          currentY = 46;
        }
      };

      // Footer helper
      const drawFooter = (pageNum: number) => {
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('Confidential & Educational • Prepared with HelpYou AI Mobile Tutor', margin, pageHeight - 12);
        doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
      };

      drawHeader(true);
      drawFooter(currentPage);

      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > pageHeight - 40) {
          doc.addPage();
          currentPage++;
          drawHeader(false);
          drawFooter(currentPage);
        }
      };

      if (qType === 'objective') {
        objQs.forEach((q, idx) => {
          checkPageBreak(75);

          // Question badge & skill
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(margin, currentY, contentWidth, 20, 3, 3, 'F');
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(30, 41, 59);
          doc.text(`QUESTION ${idx + 1} OF ${objQs.length}`, margin + 8, currentY + 13.5);

          if (q.skill) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(99, 102, 241);
            doc.text(sanitizePdfText(q.skill), pageWidth - margin - 8, currentY + 13.5, { align: 'right' });
          }

          currentY += 28;

          // Stimulus (if exists)
          if (q.stimulus && q.stimulus.trim()) {
            const cleanStim = sanitizePdfText(q.stimulus.trim());
            const stimLines = doc.splitTextToSize(cleanStim, contentWidth - 20);
            const stimBoxH = (stimLines.length * 11) + 14;

            checkPageBreak(stimBoxH + 30);

            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.roundedRect(margin, currentY, contentWidth, stimBoxH, 4, 4, 'FD');

            doc.setFont('times', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(51, 65, 85);
            doc.text(stimLines, margin + 10, currentY + 13);
            currentY += stimBoxH + 10;
          }

          // Question prompt
          const cleanQ = sanitizePdfText(q.question);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(15, 23, 42);
          const qLines = doc.splitTextToSize(cleanQ, contentWidth);
          checkPageBreak(qLines.length * 13 + 30);
          doc.text(qLines, margin, currentY);
          currentY += (qLines.length * 13) + 8;

          // Options
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(30, 41, 59);

          q.options.forEach(opt => {
            const cleanOpt = sanitizePdfText(opt);
            const optLines = doc.splitTextToSize(cleanOpt, contentWidth - 24);
            const optH = optLines.length * 12 + 6;

            checkPageBreak(optH + 15);

            // Option bullet indicator
            doc.setFillColor(241, 245, 249);
            doc.circle(margin + 6, currentY + 4, 3, 'F');

            doc.text(optLines, margin + 16, currentY + 6);
            currentY += optH;
          });

          currentY += 10;

          // Separator line between questions
          if (idx < objQs.length - 1) {
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            currentY += 16;
          }
        });

        // ================= CONSOLIDATED ANSWER KEY ON LAST PAGE =================
        doc.addPage();
        currentPage++;
        drawHeader(false);
        drawFooter(currentPage);

        // Section Title: Answer Key Banner
        doc.setFillColor(240, 253, 244); // Light emerald
        doc.setDrawColor(187, 247, 208);
        doc.roundedRect(margin, currentY, contentWidth, 24, 4, 4, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(21, 128, 61);
        doc.text('OFFICIAL AP® EXAM ANSWER KEY & DETAILED EXPLANATIONS', margin + 10, currentY + 16);
        currentY += 34;

        objQs.forEach((q, idx) => {
          const cleanAns = sanitizePdfText(q.correctAnswer);
          const cleanExp = sanitizePdfText(q.explanation);
          const expLines = doc.splitTextToSize(`Explanation: ${cleanExp}`, contentWidth - 20);
          const ansBoxH = 20 + (expLines.length * 11) + 12;

          checkPageBreak(ansBoxH + 18);

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(margin, currentY, contentWidth, ansBoxH, 4, 4, 'FD');

          // Correct Answer label
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(21, 128, 61);
          doc.text(`QUESTION ${idx + 1} • [✓ Correct Answer]:  ${cleanAns}`, margin + 10, currentY + 14);

          // Explanation
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(55, 65, 81);
          doc.text(expLines, margin + 10, currentY + 28);

          currentY += ansBoxH + 12;
        });
      } else {
        // Subjective (FRQ) - 1. Print all FRQ prompts first
        subQs.forEach((q, idx) => {
          checkPageBreak(85);

          // FRQ Banner
          doc.setFillColor(243, 232, 255); // Purple-100
          doc.roundedRect(margin, currentY, contentWidth, 22, 3, 3, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(107, 33, 168); // Purple-800
          doc.text(`FREE RESPONSE QUESTION ${idx + 1}  [${q.totalPoints || 6} POINTS]`, margin + 8, currentY + 15);

          if (q.skill) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(126, 34, 206);
            doc.text(sanitizePdfText(q.skill), pageWidth - margin - 8, currentY + 15, { align: 'right' });
          }

          currentY += 30;

          // Prompt
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(15, 23, 42);
          const promptLines = doc.splitTextToSize(sanitizePdfText(q.prompt), contentWidth);
          checkPageBreak(promptLines.length * 13 + 30);
          doc.text(promptLines, margin, currentY);
          currentY += (promptLines.length * 13) + 16;

          // Workspace line for student
          if (idx < subQs.length - 1) {
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            currentY += 16;
          }
        });

        // ================= CONSOLIDATED SCORING RUBRIC & SOLUTIONS ON LAST PAGE =================
        doc.addPage();
        currentPage++;
        drawHeader(false);
        drawFooter(currentPage);

        // Section Title: Scoring Guidelines Banner
        doc.setFillColor(238, 242, 255); // Indigo-50
        doc.setDrawColor(199, 210, 254);
        doc.roundedRect(margin, currentY, contentWidth, 24, 4, 4, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(67, 56, 202);
        doc.text('OFFICIAL COLLEGE BOARD SCORING GUIDELINES & MODEL SOLUTIONS', margin + 10, currentY + 16);
        currentY += 34;

        subQs.forEach((q, idx) => {
          checkPageBreak(85);

          // FRQ Sub-header
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(88, 28, 135);
          doc.text(`QUESTION ${idx + 1} SCORING RUBRIC & EXEMPLARY SOLUTION`, margin, currentY);
          currentY += 14;

          // Model Answer Box
          const cleanModel = sanitizePdfText(q.modelAnswer);
          const modelLines = doc.splitTextToSize(cleanModel, contentWidth - 20);
          const modelBoxH = 20 + (modelLines.length * 11) + 10;

          checkPageBreak(modelBoxH + 30);

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(margin, currentY, contentWidth, modelBoxH, 4, 4, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(67, 56, 202); // Indigo-700
          doc.text('Exemplary Model Solution (Maximum Score):', margin + 10, currentY + 14);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          doc.text(modelLines, margin + 10, currentY + 28);

          currentY += modelBoxH + 12;

          // Scoring Guidelines
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(5, 150, 105); // Emerald-600
          doc.text('Official Reader Scoring Guidelines & Criteria:', margin, currentY);
          currentY += 12;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(51, 65, 85);

          q.scoringRubric.forEach(rubricItem => {
            const cleanRubric = sanitizePdfText(`• ${rubricItem}`);
            const rLines = doc.splitTextToSize(cleanRubric, contentWidth - 12);
            checkPageBreak(rLines.length * 11 + 6);
            doc.text(rLines, margin + 6, currentY);
            currentY += (rLines.length * 11) + 4;
          });

          currentY += 16;
          if (idx < subQs.length - 1) {
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            currentY += 16;
          }
        });
      }

      const filename = `AP_${subj.shortCode.replace(/\s+/g, '_')}_${qType.toUpperCase()}_Practice.pdf`;
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);

      // Instantly open preview reader!
      setPreviewPdfUri(blobUrl);
      setPreviewPdfName(filename);
    } catch (err: any) {
      console.error("PDF Export Error:", err);
      alert("Failed to create PDF preview: " + err.message);
    }
  };

  // Resume practice session from History
  const handleResumeHistory = (item: APTestPrepHistoryItem) => {
    triggerVibration(15);
    const subj: APSubject = TOP_10_AP_SUBJECTS.find(s => s.id === item.subjectId) || {
      id: item.subjectId,
      name: item.subjectName,
      shortCode: item.shortCode,
      category: item.category as any,
      description: item.subjectName,
      icon: '📚',
      badge: 'AP Course',
      accentColor: 'indigo',
      gradient: 'from-indigo-600 to-purple-600',
      units: []
    };
    setSelectedSubject(subj);
    setSelectedUnitId(item.unitId || 'all');
    setCustomTopic(item.customTopic || '');
    setQuestionType(item.questionType);
    setQuestionCount(item.count);

    const allocatedTime = getApExamDurationSeconds(subj.id, item.questionType, item.count);
    setTotalAllocatedSeconds(allocatedTime);
    setTimeRemainingSeconds(allocatedTime);
    setIsTimerActive(false);

    if (item.questionType === 'objective' && item.objectiveQuestions && item.objectiveQuestions.length > 0) {
      setObjectiveQuestions(item.objectiveQuestions);
      setCurrentObjIndex(0);
      setSelectedAnswers({});
      setShowExplanation({});
      setIsExamCompleted(false);
    } else if (item.questionType === 'subjective' && item.subjectiveQuestions && item.subjectiveQuestions.length > 0) {
      setSubjectiveQuestions(item.subjectiveQuestions);
      setCurrentSubIndex(0);
      setStudentAnswers({});
      setShowRubric({});
      setEvaluations({});
      setAttachedImages({});
      setShowPlusMenuIndex(null);
    }

    setShowHistoryModal(false);
    setStep('practice');
  };

  // Preview & Export PDF from History item
  const handlePreviewHistoryPdf = (item: APTestPrepHistoryItem) => {
    triggerVibration(15);
    const qs = item.questionType === 'objective'
      ? { type: 'objective' as const, items: item.objectiveQuestions || [] }
      : { type: 'subjective' as const, items: item.subjectiveQuestions || [] };

    handleExportPDF(
      qs,
      { name: item.subjectName, shortCode: item.shortCode },
      item.unitTitle
    );
  };

  // Delete an item from History
  const handleDeleteHistoryItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerVibration(10);
    setHistoryList(prev => {
      const updated = prev.filter(item => item.id !== id);
      safeSetItem('ap_test_prep_history', JSON.stringify(updated));
      return updated;
    });
  };

  // Clear All History
  const handleClearAllHistory = () => {
    triggerVibration(15);
    if (window.confirm("Are you sure you want to clear all AP practice history?")) {
      setHistoryList([]);
      safeSetItem('ap_test_prep_history', JSON.stringify([]));
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF9F6] relative overflow-hidden font-sans select-none">
      {/* Top Header */}
      <header className="px-5 py-3.5 flex items-center justify-between border-b border-zinc-200/70 bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-950 active:scale-95 transition-transform"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md">
                AP® EXAM
              </span>
              <h1 className="font-black text-zinc-900 text-sm tracking-tight">
                {step === 'select-subject' && (isGrade9Student ? 'Grade 9 AP Subjects' : 'Top AP Subjects')}
                {step === 'configure' && 'Exam Configuration'}
                {step === 'practice' && `${selectedSubject.shortCode} Practice`}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {step === 'practice' && (
            <>
              {/* Only show Calculator button and policy badge for necessary STEM/Economics subjects where calculator is actually permitted! */}
              {calculatorPolicy.allowed && (
                <>
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border hidden sm:inline-flex items-center gap-1 ${calculatorPolicy.color}`}>
                    🧮 {calculatorPolicy.label}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(10);
                      setShowCalculator(prev => !prev);
                    }}
                    className={`h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                      showCalculator 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-300' 
                        : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-250 shadow-xs'
                    }`}
                    title="Exam Scientific Calculator"
                  >
                    <Calculator className={`w-3.5 h-3.5 ${showCalculator ? 'text-white' : 'text-indigo-600'}`} />
                    <span className="hidden xs:inline">Calc</span>
                  </button>
                </>
              )}

              {/* Official AP Reference Sheet & Periodic Table Button */}
              {referenceData && (
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(10);
                    setShowFormulaModal(true);
                  }}
                  className={`h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs ${
                    showFormulaModal
                      ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-300'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                  title="Official AP Exam Reference Sheet & Interactive Periodic Table"
                >
                  <BookOpen className={`w-3.5 h-3.5 ${showFormulaModal ? 'text-white' : 'text-emerald-700'}`} />
                  <span className="hidden xs:inline">
                    {referenceData.hasPeriodicTable ? 'Formulas & Table' : 'Formula Sheet'}
                  </span>
                </button>
              )}

              {/* Emergency Stop Sound Button if alarm ringing */}
              {isAlarmPlaying && (
                <button
                  type="button"
                  onClick={stopAlarmSound}
                  className="h-8 px-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-red-500/30 animate-pulse cursor-pointer shrink-0"
                  title="Stop Alarm Sound"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  <span>Stop Sound</span>
                </button>
              )}
            </>
          )}

          {/* Timer Setup & Active Countdown Button (Shown only during Configure & Practice, NEVER on select-subject) */}
          {step !== 'select-subject' && (
            <button
              type="button"
              onClick={() => {
                triggerVibration(10);
                setShowTimerSetupModal(true);
              }}
              className={`h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0 ${
                isTimerActive && timeRemainingSeconds > 0
                  ? timeRemainingSeconds <= 60
                    ? 'bg-red-600 text-white border-red-700 animate-pulse'
                    : 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20'
                  : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-250'
              }`}
              title="Timer Settings & Countdown"
              aria-label="Timer Settings"
            >
              <Timer className={`w-4 h-4 ${isTimerActive && timeRemainingSeconds > 0 ? 'text-white' : 'text-amber-600'}`} />
              {isTimerActive && timeRemainingSeconds > 0 && (
                <span className="font-mono font-black text-[11px]">
                  {formatTime(timeRemainingSeconds)}
                </span>
              )}
            </button>
          )}

          {/* History Button (Icon only, no text, no numbers) */}
          <button
            type="button"
            onClick={() => {
              triggerVibration(10);
              setShowHistoryModal(true);
            }}
            className="w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-250 shadow-xs shrink-0"
            title="Practice History"
            aria-label="Practice History"
          >
            <Clock className="w-4 h-4 text-indigo-600" />
          </button>
        </div>

      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto px-4 py-5 flex flex-col justify-start max-w-lg mx-auto w-full pb-20">
        {/* Loading Overlay */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <AdvancedLoader type="orb" context="dashboard" />
            <p className="font-bold text-zinc-800 text-base mt-6">{loadingMsg}</p>
            <p className="text-xs text-zinc-500 mt-2 max-w-xs leading-relaxed">
              Aligning with College Board AP Course & Exam Description (CED) standards...
            </p>
          </div>
        )}

        {/* Error Alert */}
        {!loading && error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-bold">Error Occurred</p>
              <p className="mt-0.5 text-red-700">{error}</p>
              <button
                onClick={handleGenerateQuestions}
                className="mt-2 text-xs font-bold text-red-800 underline hover:text-red-950"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 1: SELECT AP SUBJECT ================= */}
        {!loading && step === 'select-subject' && (
          <div className="flex flex-col gap-5">
            {/* Hero Welcome Banner */}
            <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-indigo-900 via-blue-900 to-indigo-950 text-white shadow-lg shadow-indigo-950/20 border border-indigo-800/50">
              <div className="relative z-10">
                <span className="inline-block text-xs font-black uppercase tracking-widest text-indigo-300 bg-indigo-950/60 border border-indigo-700/50 px-2.5 py-0.5 rounded-full mb-2">
                  College Board Aligned
                </span>
                <h2 className="text-2xl font-black tracking-tight leading-tight">
                  Master Your AP® Exams
                </h2>
                <p className="text-xs text-indigo-200 mt-1 leading-relaxed font-medium">
                  Practice with high-yield Subjective (FRQ) & Objective (MCQ) questions engineered to simulate the real College Board AP scoring criteria.
                </p>
              </div>
              <div className="absolute -right-4 -bottom-6 text-7xl opacity-20 select-none pointer-events-none">
                🎓
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {['All', 'STEM & Math', 'Sciences', 'Humanities & Social Sciences', 'English & Tech'].map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    triggerVibration(10);
                    setSelectedCategory(cat);
                  }}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Top 10 Subjects Accordion Grid */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Choose AP Subject & Select Topic ({filteredSubjects.length})
              </h3>

              <div className="grid grid-cols-1 gap-3">
                {filteredSubjects.map(sub => {
                  const isExpanded = expandedSubjectId === sub.id;

                  return (
                    <div
                      key={sub.id}
                      className={`rounded-2xl border transition-all bg-white overflow-hidden ${
                        isExpanded
                          ? 'border-indigo-600 shadow-md ring-2 ring-indigo-500/15'
                          : 'border-zinc-200/80 hover:border-zinc-300 shadow-sm'
                      }`}
                    >
                      {/* Subject Header Card */}
                      <button
                        onClick={() => {
                          triggerVibration(12);
                          setExpandedSubjectId(isExpanded ? null : sub.id);
                          setSelectedSubject(sub);
                        }}
                        className="w-full p-4 flex items-center justify-between gap-3.5 text-left cursor-pointer transition-colors hover:bg-zinc-50/70"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-gradient-to-br ${sub.gradient} text-white shadow-sm`}>
                            {sub.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-zinc-900 text-sm tracking-tight truncate">
                                {sub.name}
                              </h4>
                              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/60 shrink-0">
                                {sub.shortCode}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">
                              {sub.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-extrabold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-lg uppercase tracking-wider">
                            {sub.units.length} Topics
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                      </button>

                      {/* Collapsible Topics List Underneath Subject */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            className="border-t border-zinc-100 bg-zinc-50/40 p-3 flex flex-col gap-2 overflow-hidden"
                          >
                            {/* All Units Combined Option */}
                            <button
                              onClick={() => {
                                triggerVibration(15);
                                setSelectedSubject(sub);
                                setSelectedUnitId('all');
                                setStep('configure');
                              }}
                              className="w-full bg-white border border-indigo-200/90 hover:bg-indigo-50/50 hover:border-indigo-400 active:scale-[0.995] py-3.5 px-4 rounded-2xl flex items-center justify-between text-left transition-all group/topic shadow-sm cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-lg">⭐</span>
                                <div>
                                  <span className="font-extrabold text-xs text-indigo-950 group-hover/topic:text-indigo-600 transition-colors">
                                    Full Exam Simulation (All Topics Combined)
                                  </span>
                                  <p className="text-[10px] text-indigo-700/80 font-medium">
                                    Comprehensive mock exam across all {sub.units.length} official units
                                  </p>
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 text-indigo-500 group-hover/topic:translate-x-0.5 transition-all shrink-0" />
                            </button>

                            {/* Individual Subject Units / Topics */}
                            {sub.units.map((unit) => (
                              <button
                                key={unit.id}
                                onClick={() => {
                                  triggerVibration(15);
                                  setSelectedSubject(sub);
                                  setSelectedUnitId(unit.id);
                                  setStep('configure');
                                }}
                                className="w-full bg-white border border-zinc-200/80 hover:bg-zinc-50 hover:border-indigo-300 active:scale-[0.995] py-3.5 px-4 rounded-2xl flex items-center justify-between text-left transition-all group/topic shadow-sm cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="font-bold text-xs text-zinc-900 group-hover/topic:text-indigo-600 transition-colors block truncate">
                                      {unit.title}
                                    </span>
                                    <p className="text-[10px] text-zinc-500 font-medium truncate mt-0.5">
                                      {unit.description}
                                    </p>
                                  </div>
                                </div>
                                <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/topic:text-indigo-600 group-hover/topic:translate-x-0.5 transition-all shrink-0" />
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: CONFIGURE QUESTION TYPE & COUNT ================= */}
        {!loading && step === 'configure' && (
          <div className="flex flex-col gap-6">
            {/* Selected Subject Banner */}
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedSubject.icon}</span>
                <div>
                  <h3 className="font-black text-zinc-900 text-sm">{selectedSubject.name}</h3>
                  <p className="text-xs text-indigo-700 font-semibold">
                    {selectedUnit ? selectedUnit.title : 'Full Exam Simulator (All Units)'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStep('select-subject')}
                className="text-xs font-extrabold text-indigo-600 underline hover:text-indigo-800"
              >
                Change
              </button>
            </div>

            {/* Section 1: Question Type */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                1. Select Question Format
              </label>

              <div className="grid grid-cols-1 gap-3">
                {/* Option 1: Objective (MCQ) */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    triggerVibration(15);
                    setQuestionType('objective');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white relative ${
                    questionType === 'objective'
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-md shadow-indigo-100/50'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                        questionType === 'objective' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        🎯
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-zinc-900 text-sm tracking-tight">
                            Objective (Multiple Choice)
                          </h4>
                          <span className="text-[10px] font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                            Section I
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                      questionType === 'objective' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300'
                    }`}>
                      {questionType === 'objective' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                </motion.div>

                {/* Option 2: Subjective (FRQ) */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    triggerVibration(15);
                    setQuestionType('subjective');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white relative ${
                    questionType === 'subjective'
                      ? 'border-purple-600 ring-2 ring-purple-500/20 shadow-md shadow-purple-100/50'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                        questionType === 'subjective' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600'
                      }`}>
                        📝
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-zinc-900 text-sm tracking-tight">
                            Subjective (Free Response)
                          </h4>
                          <span className="text-[10px] font-extrabold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                            Section II
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                      questionType === 'subjective' ? 'bg-purple-600 border-purple-600 text-white' : 'border-zinc-300'
                    }`}>
                      {questionType === 'subjective' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Section 2: Question Count */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                2. How Many Questions?
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { count: 5, label: '5 Questions', sub: 'Quick Drill (~10m)' },
                  { count: 10, label: '10 Questions', sub: 'Standard Set (~20m)' },
                  { count: 15, label: '15 Questions', sub: 'Intensive Review (~30m)' },
                  { count: 20, label: '20 Questions', sub: 'Full Section (~45m)' }
                ].map(item => (
                  <button
                    key={item.count}
                    onClick={() => {
                      triggerVibration(10);
                      setQuestionCount(item.count);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      questionCount === item.count
                        ? 'bg-zinc-900 border-zinc-900 text-white shadow-md'
                        : 'bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="font-black text-sm">{item.label}</div>
                    <div className={`text-[11px] font-medium mt-0.5 ${
                      questionCount === item.count ? 'text-zinc-300' : 'text-zinc-500'
                    }`}>
                      {item.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setStep('select-subject')}
                className="w-1/3 py-4 rounded-2xl border border-zinc-200 bg-white font-bold text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Back
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerateQuestions}
                className="w-2/3 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 text-white font-black text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer active:opacity-90"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate AP Questions</span>
              </motion.button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: PRACTICE (OBJECTIVE MCQ RUNNER) ================= */}
        {!loading && step === 'practice' && questionType === 'objective' && (
          <div className="flex flex-col gap-5">
            {!isExamCompleted ? (
              <>
                {/* Progress Header */}
                <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                  <span>Question {currentObjIndex + 1} of {objectiveQuestions.length}</span>
                  <span>{Math.round(((currentObjIndex + 1) / objectiveQuestions.length) * 100)}% Completed</span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${((currentObjIndex + 1) / objectiveQuestions.length) * 100}%` }}
                  />
                </div>

                {/* Active Question Card */}
                {objectiveQuestions[currentObjIndex] && (() => {
                  const q = objectiveQuestions[currentObjIndex];
                  const userChoice = selectedAnswers[currentObjIndex];
                  const isAnswered = Boolean(userChoice);
                  const isRevealed = showExplanation[currentObjIndex];

                  return (
                    <div className="p-5 rounded-3xl bg-white border border-zinc-200/80 shadow-sm flex flex-col gap-4">
                      {/* Skill / Unit Badge & Ask with AI */}
                      <div className="flex items-center justify-between gap-2">
                        {q.skill ? (
                          <div className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg self-start">
                            {q.skill}
                          </div>
                        ) : (
                          <div className="text-[11px] font-extrabold text-zinc-400">AP Question {currentObjIndex + 1}</div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenAITutor(q, 'objective')}
                          className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                          title="Ask AI Magic Tutor for Concept Explanation & Hints"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                          <span>Ask AI</span>
                        </button>
                      </div>

                      {/* Stimulus if present */}
                      {q.stimulus && (
                        <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-700 italic">
                          <GlobalMarkdown>{q.stimulus}</GlobalMarkdown>
                        </div>
                      )}

                      {/* Question Text */}
                      <div className="text-sm md:text-base font-bold text-zinc-900 leading-relaxed">
                        <GlobalMarkdown>{q.question}</GlobalMarkdown>
                      </div>

                      {/* 4 Options */}
                      <div className="flex flex-col gap-2.5 pt-2">
                        {q.options.map((opt) => {
                          const isSelected = userChoice === opt;
                          const isCorrect = opt === q.correctAnswer;
                          
                          let btnStyle = "bg-zinc-50 border-zinc-200 text-zinc-800 hover:bg-zinc-100";
                          if (isAnswered) {
                            if (isCorrect) {
                              btnStyle = "bg-emerald-50 border-emerald-400 text-emerald-950 font-bold";
                            } else if (isSelected) {
                              btnStyle = "bg-red-50 border-red-400 text-red-950 font-bold";
                            } else {
                              btnStyle = "bg-zinc-50/60 border-zinc-200 text-zinc-400 opacity-60";
                            }
                          }

                          return (
                            <button
                              key={opt}
                              disabled={isAnswered}
                              onClick={() => {
                                triggerVibration(15);
                                setSelectedAnswers(prev => ({ ...prev, [currentObjIndex]: opt }));
                                setShowExplanation(prev => ({ ...prev, [currentObjIndex]: true }));
                              }}
                              className={`p-3.5 rounded-2xl border text-left text-xs transition-all flex items-center justify-between gap-3 ${btnStyle}`}
                            >
                              <div className="flex-1 font-medium">
                                <GlobalMarkdown>{opt}</GlobalMarkdown>
                              </div>
                              {isAnswered && isCorrect && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              )}
                              {isAnswered && isSelected && !isCorrect && (
                                <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation Section */}
                      {isRevealed && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex flex-col gap-2"
                        >
                          <span className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            College Board AP Explanation
                          </span>
                          <div className="text-xs text-zinc-700 leading-relaxed">
                            <GlobalMarkdown>{q.explanation}</GlobalMarkdown>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  );
                })()}

                {/* Navigation Bar */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    disabled={currentObjIndex === 0}
                    onClick={() => {
                      triggerVibration(10);
                      setCurrentObjIndex(prev => prev - 1);
                    }}
                    className="px-4 py-3 rounded-xl border border-zinc-200 bg-white font-bold text-xs text-zinc-700 disabled:opacity-30"
                  >
                    Previous
                  </button>

                  {currentObjIndex < objectiveQuestions.length - 1 ? (
                    <button
                      onClick={() => {
                        triggerVibration(10);
                        setCurrentObjIndex(prev => prev + 1);
                      }}
                      className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center gap-1.5"
                    >
                      <span>Next Question</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        triggerVibration(25);
                        setIsExamCompleted(true);
                      }}
                      className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                    >
                      <Award className="w-4 h-4" />
                      <span>Finish & View AP Score</span>
                    </button>
                  )}
                </div>

                {/* Prominent Export to PDF Action (Available during practice) */}
                <div className="pt-2">
                  <button
                    onClick={() => handleExportPDF()}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 active:scale-[0.99] transition-all hover:brightness-105 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-purple-200" />
                    <span>Export to PDF</span>
                  </button>
                </div>
              </>
            ) : (
              /* Score & AP Results Screen */
              <div className="flex flex-col gap-6 text-center">
                {/* Score Card */}
                <div className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm flex flex-col items-center">
                  <span className="text-4xl select-none mb-2">🏆</span>
                  <h3 className="text-xl font-black text-zinc-900">AP Exam Simulation Finished!</h3>
                  <p className="text-xs text-zinc-500 font-semibold mt-1">
                    {selectedSubject.name} • {objectiveQuestions.length} Questions
                  </p>

                  <div className="my-5 p-4 rounded-2xl w-full border text-left flex items-center justify-between bg-zinc-50 border-zinc-200">
                    <div>
                      <div className="text-xs font-bold text-zinc-500">Correct Answers</div>
                      <div className="text-2xl font-black text-zinc-900">
                        {objectiveScore} / {objectiveQuestions.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-500">Accuracy Rate</div>
                      <div className="text-2xl font-black text-indigo-600">
                        {Math.round((objectiveScore / objectiveQuestions.length) * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-500">Time Taken</div>
                      <div className="text-2xl font-black text-zinc-900">
                        {formatTime(Math.max(0, totalAllocatedSeconds - timeRemainingSeconds))}
                      </div>
                    </div>
                  </div>

                  {/* AP 1-5 Predicted Scale */}
                  <div className={`w-full p-4 rounded-2xl border text-left flex items-center gap-4 ${apPredictedScore.bg}`}>
                    <div className="w-14 h-14 rounded-xl bg-white shadow-sm flex flex-col items-center justify-center shrink-0 border border-zinc-200">
                      <span className="text-[10px] font-black uppercase text-zinc-400">SCORE</span>
                      <span className={`text-2xl font-black ${apPredictedScore.color}`}>
                        {apPredictedScore.score}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                        College Board Projected AP Score
                      </span>
                      <h4 className={`font-black text-sm ${apPredictedScore.color}`}>
                        {apPredictedScore.label}
                      </h4>
                    </div>
                  </div>
                </div>

                {/* PDF & Retake Actions */}
                <div className="flex flex-col gap-2.5">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleExportPDF()}
                    className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download AP Exam & Answer Key (PDF)</span>
                  </motion.button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => {
                        triggerVibration(10);
                        setIsExamCompleted(false);
                        setCurrentObjIndex(0);
                        setSelectedAnswers({});
                        setShowExplanation({});
                        setTimeRemainingSeconds(totalAllocatedSeconds);
                      }}
                      className="py-3 rounded-xl border border-zinc-200 bg-white font-bold text-xs text-zinc-700 flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retake Questions</span>
                    </button>

                    <button
                      onClick={() => {
                        triggerVibration(10);
                        setStep('select-subject');
                      }}
                      className="py-3 rounded-xl bg-indigo-50 border border-indigo-100 font-bold text-xs text-indigo-700 flex items-center justify-center gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>New AP Subject</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 3: PRACTICE (SUBJECTIVE FRQ RUNNER) ================= */}
        {!loading && step === 'practice' && questionType === 'subjective' && (
          <div className="flex flex-col gap-5">
            {!isExamCompleted ? (
              <>
                {/* Header FRQ Counter */}
                <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                  <span>Free Response Question {currentSubIndex + 1} of {subjectiveQuestions.length}</span>
                  <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-black text-[10px]">
                    {subjectiveQuestions[currentSubIndex]?.totalPoints || 6} Points Max
                  </span>
                </div>

                {subjectiveQuestions[currentSubIndex] && (() => {
                  const q = subjectiveQuestions[currentSubIndex];
                  const studentAnswer = studentAnswers[currentSubIndex] || '';
                  const isRubricShown = showRubric[currentSubIndex];
                  const evaluation = evaluations[currentSubIndex];
                  const scoreInfo = subjectiveScores[currentSubIndex];

                  return (
                    <div className="flex flex-col gap-4">
                      {/* FRQ Prompt Card */}
                      <div className="p-5 rounded-3xl bg-white border border-zinc-200/80 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold uppercase tracking-wide text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg">
                            {q.skill || `${selectedSubject.name} FRQ`}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenAITutor(q, 'subjective')}
                              className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                              title="Ask AI Magic Tutor for Concept Explanation & Hints"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                              <span>Ask AI</span>
                            </button>
                            <span className="text-xs font-bold text-zinc-400">
                              Section II
                            </span>
                          </div>
                        </div>

                        <div className="text-sm font-semibold text-zinc-900 leading-relaxed">
                          <GlobalMarkdown>{q.prompt}</GlobalMarkdown>
                        </div>
                      </div>

                      {/* Student Response Pad */}
                      <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm flex flex-col gap-3 relative">
                        {/* Hidden inputs for Camera and Gallery on web */}
                        <input 
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleWebFileChange(e, currentSubIndex)}
                        />
                        <input 
                          ref={galleryInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleWebFileChange(e, currentSubIndex)}
                        />

                        <label className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-purple-600" />
                            <span>Your Written Response:</span>
                          </span>
                          <span className="text-[10px] font-normal text-zinc-400">Type or snap photo of paper work</span>
                        </label>

                        {/* Attached Photo Preview (if present) */}
                        {attachedImages[currentSubIndex] && (() => {
                          const img = attachedImages[currentSubIndex]!;
                          return (
                            <motion.div 
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex items-center gap-3 p-2.5 rounded-xl bg-purple-50/80 border border-purple-200"
                            >
                              <img 
                                src={img.dataUrl} 
                                alt="Answer Paper" 
                                onClick={() => setFullscreenImage(img.dataUrl)}
                                className="w-12 h-12 rounded-lg object-cover border border-purple-300 cursor-pointer shadow-xs hover:opacity-90 transition-opacity shrink-0"
                              />
                              <div 
                                className="flex-1 min-w-0 cursor-pointer" 
                                onClick={() => setFullscreenImage(img.dataUrl)}
                              >
                                <div className="text-xs font-bold text-purple-950 truncate flex items-center gap-1.5">
                                  <span className="truncate">{img.name}</span>
                                  <span className="text-[9px] bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded font-black shrink-0">PHOTO WORK</span>
                                </div>
                                <div className="text-[10px] text-purple-600 font-medium mt-0.5">
                                  Tap to inspect photo • AI will grade this handwritten solution
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  triggerVibration(10);
                                  setAttachedImages(prev => ({ ...prev, [currentSubIndex]: null }));
                                }}
                                className="p-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-400 hover:text-red-500 border border-purple-200/80 shadow-xs transition-colors shrink-0"
                                title="Remove Photo"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </motion.div>
                          );
                        })()}

                        {/* Response Textarea */}
                        <div className="relative">
                          <textarea
                            rows={5}
                            value={studentAnswer}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStudentAnswers(prev => ({ ...prev, [currentSubIndex]: val }));
                            }}
                            placeholder={
                              attachedImages[currentSubIndex] 
                                ? "Optional: Add any additional notes, clarifications, or typed answers here..." 
                                : "Write your step-by-step reasoning, calculations, and justifications here, or tap + to attach a photo of your paper..."
                            }
                            className="w-full text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl p-3 pb-12 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />

                          {/* Integrated Action Bar Inside/Bottom of Textarea */}
                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
                            {/* Plus (+) Button with Camera & Gallery Popover */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => {
                                  triggerVibration(15);
                                  setShowPlusMenuIndex(prev => prev === currentSubIndex ? null : currentSubIndex);
                                }}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all border shadow-xs cursor-pointer ${
                                  showPlusMenuIndex === currentSubIndex
                                    ? 'bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300'
                                    : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-250'
                                }`}
                                title="Attach Photo or Drawing"
                              >
                                <Plus className={`w-4 h-4 transition-transform duration-200 ${showPlusMenuIndex === currentSubIndex ? 'rotate-45' : ''}`} />
                              </button>

                              {/* Plus Popover Menu (Camera & Gallery) */}
                              <AnimatePresence>
                                {showPlusMenuIndex === currentSubIndex && (
                                  <>
                                    {/* Transparent click-outside overlay */}
                                    <div 
                                      className="fixed inset-0 z-20 cursor-default" 
                                      onClick={() => setShowPlusMenuIndex(null)} 
                                    />

                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.92, y: 6 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.92, y: 6 }}
                                      transition={{ duration: 0.15 }}
                                      className="absolute bottom-10 left-0 bg-white rounded-2xl border border-zinc-200 shadow-xl p-1.5 z-30 min-w-[190px] flex flex-col gap-1"
                                    >
                                      {/* 1. Camera Option */}
                                      <button
                                        type="button"
                                        onClick={() => handleCameraClick(currentSubIndex)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-800 hover:bg-purple-50 hover:text-purple-700 transition-colors cursor-pointer"
                                      >
                                        <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                                          <Camera className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                          <div className="text-xs">Camera</div>
                                          <div className="text-[9px] text-zinc-400 font-normal">Take photo of paper</div>
                                        </div>
                                      </button>

                                      {/* 2. Gallery Option */}
                                      <button
                                        type="button"
                                        onClick={() => handleGalleryClick(currentSubIndex)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-800 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-pointer"
                                      >
                                        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                                          <ImageIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                          <div className="text-xs">Gallery</div>
                                          <div className="text-[9px] text-zinc-400 font-normal">Choose from photos</div>
                                        </div>
                                      </button>

                                      {/* 3. Draw Graph / Scratchpad Option */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowPlusMenuIndex(null);
                                          triggerVibration(15);
                                          setShowDrawingCanvas(true);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold text-zinc-800 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer"
                                      >
                                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                          <PenTool className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                          <div className="text-xs">Draw Graph / Scratchpad</div>
                                          <div className="text-[9px] text-zinc-400 font-normal">Sketch curves, diagrams & math</div>
                                        </div>
                                      </button>
                                    </motion.div>
                                  </>
                                )}
                              </AnimatePresence>
                            </div>

                            {/* Submit Answer for Official AI Grading with Instant Score */}
                            <button
                              type="button"
                              disabled={(!studentAnswer.trim() && !attachedImages[currentSubIndex]) || evaluation?.loading}
                              onClick={() => handleEvaluateAnswer(currentSubIndex)}
                              className="px-3 h-8.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer hover:scale-105 active:scale-95 transition-all text-xs font-bold shrink-0"
                              title="Submit your written solution to AP Chief Reader AI for grading and score"
                              aria-label="Submit for AI Grading"
                            >
                              {evaluation?.loading ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Grading...</span>
                                </>
                              ) : scoreInfo ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Re-Grade ({scoreInfo.earned}/{scoreInfo.total} pts)</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Grade with AI</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Grading in progress spinner */}
                        {evaluation?.loading && (
                          <div className="mt-2 p-3.5 rounded-xl bg-purple-50/90 border border-purple-200 flex items-center gap-3 animate-pulse">
                            <Loader2 className="w-4 h-4 text-purple-600 animate-spin shrink-0" />
                            <div className="text-xs">
                              <div className="font-bold text-purple-900">AP Chief Reader AI is Grading Your Solution...</div>
                              <div className="text-[11px] text-purple-600">Evaluating rubric criteria, calculation accuracy, and reasoning.</div>
                            </div>
                          </div>
                        )}

                        {/* AI Feedback & Points Score Display */}
                        {evaluation && !evaluation.loading && evaluation.text && (
                          <div className="mt-2 rounded-2xl bg-purple-50/80 border border-purple-200 overflow-hidden shadow-2xs">
                            <div className="px-4 py-2.5 bg-purple-100/80 border-b border-purple-200 flex items-center justify-between">
                              <span className="font-black text-xs text-purple-900 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                Official AP Reader Evaluation:
                              </span>
                              {scoreInfo && (
                                <span className="px-2.5 py-0.5 rounded-full bg-purple-700 text-white font-black text-xs shadow-xs">
                                  Score: {scoreInfo.earned} / {scoreInfo.total} Points
                                </span>
                              )}
                            </div>
                            <div className="p-3.5 text-xs text-zinc-800 leading-relaxed">
                              <GlobalMarkdown>{evaluation.text}</GlobalMarkdown>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Toggle Scoring Rubric & Model Answer */}
                      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
                        <button
                          onClick={() => {
                            triggerVibration(10);
                            setShowRubric(prev => ({ ...prev, [currentSubIndex]: !prev[currentSubIndex] }));
                          }}
                          className="w-full p-4 flex items-center justify-between text-left font-bold text-xs text-zinc-800 hover:bg-zinc-50 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600" />
                            Official Scoring Guidelines & Model Solution
                          </span>
                          {isRubricShown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {isRubricShown && (
                          <div className="p-4 border-t border-zinc-100 bg-zinc-50/60 flex flex-col gap-4 text-xs">
                            {/* Scoring Rubric Points */}
                            <div>
                              <span className="font-black text-emerald-800 block mb-2 uppercase tracking-wide text-[10px]">
                                Scoring Criteria & Points Breakdown
                              </span>
                              <ul className="flex flex-col gap-1.5">
                                {q.scoringRubric.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-zinc-700">
                                    <span className="text-emerald-600 font-bold">✓</span>
                                    <GlobalMarkdown>{item}</GlobalMarkdown>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Model Solution */}
                            <div className="pt-2 border-t border-zinc-200/60">
                              <span className="font-black text-indigo-900 block mb-2 uppercase tracking-wide text-[10px]">
                                High-Scoring Exemplary Model Solution
                              </span>
                              <div className="p-3 rounded-xl bg-white border border-zinc-200 text-zinc-800">
                                <GlobalMarkdown>{q.modelAnswer}</GlobalMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Navigation Bar */}
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <button
                          disabled={currentSubIndex === 0}
                          onClick={() => {
                            triggerVibration(10);
                            setCurrentSubIndex(prev => prev - 1);
                          }}
                          className="px-4 py-3 rounded-xl border border-zinc-200 bg-white font-bold text-xs text-zinc-700 disabled:opacity-30 cursor-pointer"
                        >
                          Previous FRQ
                        </button>

                        {currentSubIndex < subjectiveQuestions.length - 1 ? (
                          <button
                            onClick={() => {
                              triggerVibration(10);
                              setCurrentSubIndex(prev => prev + 1);
                            }}
                            className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Next FRQ</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              triggerVibration(25);
                              setIsExamCompleted(true);
                            }}
                            className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
                          >
                            <Award className="w-4 h-4" />
                            <span>Finish & View Total AP Score</span>
                          </button>
                        )}
                      </div>

                      {/* Option to finish and see score card early if on earlier questions */}
                      {subjectiveQuestions.length > 1 && currentSubIndex < subjectiveQuestions.length - 1 && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              triggerVibration(15);
                              setIsExamCompleted(true);
                            }}
                            className="text-[11px] font-bold text-zinc-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>Finish Practice & View Current AP Scorecard</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* Prominent Export to PDF Action (Available during practice) */}
                      <div className="pt-2 pb-2">
                        <button
                          onClick={() => handleExportPDF()}
                          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 active:scale-[0.99] transition-all hover:brightness-105 cursor-pointer"
                        >
                          <FileText className="w-4 h-4 text-purple-200" />
                          <span>Export to PDF</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              /* AP Free Response Exam Score & Results Screen */
              <div className="flex flex-col gap-6 text-center">
                {/* Score Card */}
                <div className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm flex flex-col items-center">
                  <span className="text-4xl select-none mb-2">🏆</span>
                  <h3 className="text-xl font-black text-zinc-900">AP Free Response Simulation Finished!</h3>
                  <p className="text-xs text-zinc-500 font-semibold mt-1">
                    {selectedSubject.name} • {subjectiveQuestions.length} Free Response Questions
                  </p>

                  <div className="my-5 p-4 rounded-2xl w-full border text-left flex items-center justify-between bg-zinc-50 border-zinc-200">
                    <div>
                      <div className="text-xs font-bold text-zinc-500">Points Earned</div>
                      <div className="text-2xl font-black text-zinc-900">
                        {frqScoreSummary.earnedTotal} / {frqScoreSummary.maxTotal}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-500">Rubric Efficacy</div>
                      <div className="text-2xl font-black text-purple-600">
                        {frqScoreSummary.percentage}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-500">Time Taken</div>
                      <div className="text-2xl font-black text-zinc-900">
                        {formatTime(Math.max(0, totalAllocatedSeconds - timeRemainingSeconds))}
                      </div>
                    </div>
                  </div>

                  {/* AP 1-5 Predicted Scale */}
                  <div className={`w-full p-4 rounded-2xl border text-left flex items-center gap-4 ${frqScoreSummary.bg}`}>
                    <div className="w-14 h-14 rounded-xl bg-white shadow-sm flex flex-col items-center justify-center shrink-0 border border-zinc-200">
                      <span className="text-[10px] font-black uppercase text-zinc-400">SCORE</span>
                      <span className={`text-2xl font-black ${frqScoreSummary.color}`}>
                        {frqScoreSummary.score}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                        College Board Projected AP Score
                      </span>
                      <h4 className={`font-black text-sm ${frqScoreSummary.color}`}>
                        Score {frqScoreSummary.score}: {frqScoreSummary.label}
                      </h4>
                      <p className="text-[11px] text-zinc-600 mt-0.5">
                        {frqScoreSummary.evaluatedCount} of {subjectiveQuestions.length} responses evaluated by AP Chief Reader AI.
                      </p>
                    </div>
                  </div>

                  {/* Breakdown per FRQ */}
                  <div className="w-full mt-5 text-left flex flex-col gap-2.5">
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500">
                      Free Response Question Breakdown
                    </h4>
                    {subjectiveQuestions.map((q, idx) => {
                      const sc = subjectiveScores[idx];
                      const hasAnswer = Boolean(studentAnswers[idx] || attachedImages[idx]);
                      return (
                        <div key={idx} className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-zinc-800">
                              FRQ {idx + 1}: {q.skill || 'Free Response Question'}
                            </span>
                            {sc ? (
                              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-xs">
                                {sc.earned} / {sc.total} pts
                              </span>
                            ) : hasAnswer ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-xs">
                                Submitted (Ungraded)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-600 font-bold text-xs">
                                Skipped / Unanswered
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-600 line-clamp-2">
                            <GlobalMarkdown>{q.prompt}</GlobalMarkdown>
                          </div>
                          {sc && (
                            <div className="text-[11px] text-purple-900 bg-purple-50/60 p-2 rounded-lg border border-purple-100">
                              <span className="font-bold">Chief Reader Feedback: </span>
                              <span className="line-clamp-2">{sc.feedback?.split('\n')[0] || sc.feedback || 'Rubric evaluation complete.'}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PDF & Retake Actions */}
                <div className="flex flex-col gap-2.5">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleExportPDF()}
                    className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download AP Exam, Answers & Rubric (PDF)</span>
                  </motion.button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => {
                        triggerVibration(10);
                        setIsExamCompleted(false);
                        setCurrentSubIndex(0);
                        setStudentAnswers({});
                        setShowRubric({});
                        setEvaluations({});
                        setSubjectiveScores({});
                        setAttachedImages({});
                        setTimeRemainingSeconds(totalAllocatedSeconds);
                      }}
                      className="py-3 rounded-xl border border-zinc-200 bg-white font-bold text-xs text-zinc-700 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-zinc-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retake Questions</span>
                    </button>

                    <button
                      onClick={() => {
                        triggerVibration(10);
                        setStep('select-subject');
                      }}
                      className="py-3 rounded-xl bg-purple-50 border border-purple-100 font-bold text-xs text-purple-700 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-purple-100"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>New AP Subject</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fullscreen Image Preview Modal */}
        <AnimatePresence>
          {fullscreenImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col p-4"
            >
              <div className="flex items-center justify-between text-white mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Attached Handwritten Solution (Full View)
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreenImage(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center overflow-auto p-2">
                <img
                  src={fullscreenImage}
                  alt="Full Work Preview"
                  className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/10"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Exam Scientific Calculator Modal (Only rendered on allowed subjects) */}
        <AnimatePresence>
          {showCalculator && calculatorPolicy.allowed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-x-4 bottom-20 sm:inset-auto sm:right-6 sm:bottom-6 z-50 max-w-sm w-full bg-zinc-900 text-white rounded-3xl shadow-2xl border border-zinc-700/60 p-4 flex flex-col gap-3.5 backdrop-blur-xl"
            >
              {/* Calculator Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-xs">
                    🧮
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-tight text-zinc-100">AP® Exam Calculator</h4>
                    <p className="text-[10px] text-zinc-400 font-medium">{calculatorPolicy.label}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalculator(false)}
                  className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Calculator Screen */}
              <div className="bg-zinc-950/90 rounded-2xl p-3.5 border border-zinc-800/80 flex flex-col items-end justify-center min-h-[70px]">
                <div className="text-[11px] font-mono text-zinc-400 truncate max-w-full h-4">
                  {calcExpression}
                </div>
                <div className="text-2xl font-mono font-black text-white tracking-tight truncate max-w-full">
                  {calcDisplay}
                </div>
              </div>

              {/* Calculator Keypad */}
              <div className="grid grid-cols-5 gap-1.5 text-xs font-mono font-bold select-none">
                {/* Row 1 */}
                <button onClick={() => handleCalcButton('C')} className="p-2.5 rounded-xl bg-red-950/60 text-red-400 hover:bg-red-900/60 border border-red-800/40 active:scale-95 transition-transform">C</button>
                <button onClick={() => handleCalcButton('(')} className="p-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-transform">(</button>
                <button onClick={() => handleCalcButton(')')} className="p-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-transform">)</button>
                <button onClick={() => handleCalcButton('⌫')} className="p-2.5 rounded-xl bg-zinc-800 text-amber-400 hover:bg-zinc-700 active:scale-95 transition-transform">⌫</button>
                <button onClick={() => handleCalcButton('÷')} className="p-2.5 rounded-xl bg-indigo-600/80 text-white hover:bg-indigo-600 active:scale-95 transition-transform">÷</button>

                {/* Row 2 */}
                <button onClick={() => handleCalcButton('sin(')} className="p-2 rounded-xl bg-zinc-800/80 text-indigo-300 hover:bg-zinc-700 text-[11px] active:scale-95 transition-transform">sin</button>
                <button onClick={() => handleCalcButton('cos(')} className="p-2 rounded-xl bg-zinc-800/80 text-indigo-300 hover:bg-zinc-700 text-[11px] active:scale-95 transition-transform">cos</button>
                <button onClick={() => handleCalcButton('tan(')} className="p-2 rounded-xl bg-zinc-800/80 text-indigo-300 hover:bg-zinc-700 text-[11px] active:scale-95 transition-transform">tan</button>
                <button onClick={() => handleCalcButton('^')} className="p-2.5 rounded-xl bg-zinc-800 text-indigo-300 hover:bg-zinc-700 active:scale-95 transition-transform">xʸ</button>
                <button onClick={() => handleCalcButton('×')} className="p-2.5 rounded-xl bg-indigo-600/80 text-white hover:bg-indigo-600 active:scale-95 transition-transform">×</button>

                {/* Row 3 */}
                <button onClick={() => handleCalcButton('7')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">7</button>
                <button onClick={() => handleCalcButton('8')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">8</button>
                <button onClick={() => handleCalcButton('9')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">9</button>
                <button onClick={() => handleCalcButton('√(')} className="p-2.5 rounded-xl bg-zinc-800 text-indigo-300 hover:bg-zinc-700 active:scale-95 transition-transform">√</button>
                <button onClick={() => handleCalcButton('-')} className="p-2.5 rounded-xl bg-indigo-600/80 text-white hover:bg-indigo-600 active:scale-95 transition-transform">-</button>

                {/* Row 4 */}
                <button onClick={() => handleCalcButton('4')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">4</button>
                <button onClick={() => handleCalcButton('5')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">5</button>
                <button onClick={() => handleCalcButton('6')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">6</button>
                <button onClick={() => handleCalcButton('ln(')} className="p-2 rounded-xl bg-zinc-800/80 text-indigo-300 hover:bg-zinc-700 text-[11px] active:scale-95 transition-transform">ln</button>
                <button onClick={() => handleCalcButton('+')} className="p-2.5 rounded-xl bg-indigo-600/80 text-white hover:bg-indigo-600 active:scale-95 transition-transform">+</button>

                {/* Row 5 */}
                <button onClick={() => handleCalcButton('1')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">1</button>
                <button onClick={() => handleCalcButton('2')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">2</button>
                <button onClick={() => handleCalcButton('3')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">3</button>
                <button onClick={() => handleCalcButton('log(')} className="p-2 rounded-xl bg-zinc-800/80 text-indigo-300 hover:bg-zinc-700 text-[11px] active:scale-95 transition-transform">log</button>
                <button onClick={() => handleCalcButton('=')} className="row-span-2 p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 transition-transform font-black text-lg flex items-center justify-center">=</button>

                {/* Row 6 */}
                <button onClick={() => handleCalcButton('0')} className="col-span-2 p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">0</button>
                <button onClick={() => handleCalcButton('.')} className="p-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-transform">.</button>
                <button onClick={() => handleCalcButton('π')} className="p-2.5 rounded-xl bg-zinc-800 text-indigo-300 hover:bg-zinc-700 active:scale-95 transition-transform">π</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Graphing & Scratchpad Canvas Modal */}
        <AnimatePresence>
          {showDrawingCanvas && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-4"
            >
              <div className="bg-white rounded-3xl w-full max-w-2xl h-[92vh] max-h-[750px] flex flex-col shadow-2xl overflow-hidden border border-zinc-200">
                {/* Canvas Header */}
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/80">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <PenTool className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-xs text-zinc-900">Graphing & Scratchpad Canvas</h3>
                      <p className="text-[10px] text-zinc-500 font-medium">Draw economic curves, slope fields, free-body diagrams, or math steps</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDrawingCanvas(false)}
                    className="p-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Toolbar */}
                <div className="px-4 py-2 border-b border-zinc-150 flex items-center justify-between gap-2 overflow-x-auto bg-white">
                  {/* Pen Colors */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {[
                      { color: '#18181b', label: 'Black' },
                      { color: '#2563eb', label: 'Blue' },
                      { color: '#16a34a', label: 'Green' },
                      { color: '#dc2626', label: 'Red' }
                    ].map(c => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => {
                          triggerVibration(5);
                          setCanvasPenColor(c.color);
                          setIsEraserActive(false);
                        }}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          !isEraserActive && canvasPenColor === c.color ? 'scale-125 border-zinc-900 shadow-xs' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.color }}
                        title={c.label}
                      />
                    ))}
                  </div>

                  {/* Pen Width */}
                  <div className="flex items-center gap-1 border-l border-zinc-200 pl-2 shrink-0">
                    {[
                      { width: 2, label: 'Fine' },
                      { width: 4, label: 'Med' },
                      { width: 7, label: 'Thick' }
                    ].map(w => (
                      <button
                        key={w.width}
                        type="button"
                        onClick={() => {
                          triggerVibration(5);
                          setCanvasPenWidth(w.width);
                        }}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                          canvasPenWidth === w.width ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>

                  {/* Tools: Eraser, Grid Paper, Clear */}
                  <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-2 shrink-0">
                    {/* Eraser */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerVibration(5);
                        setIsEraserActive(prev => !prev);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${
                        isEraserActive ? 'bg-purple-600 text-white border-purple-600' : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                      }`}
                      title="Eraser"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Eraser</span>
                    </button>

                    {/* Grid Paper Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerVibration(5);
                        setShowGridPaper(prev => !prev);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${
                        showGridPaper ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                      }`}
                      title="Toggle Graph Grid Paper"
                    >
                      <Grid className="w-3.5 h-3.5" />
                      <span className="text-[10px]">{showGridPaper ? 'Grid On' : 'Plain'}</span>
                    </button>

                    {/* Clear Button */}
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="p-1 rounded-lg bg-zinc-100 hover:bg-red-50 text-zinc-500 hover:text-red-600 transition-colors"
                      title="Clear All"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Canvas Drawing Area */}
                <div 
                  className="flex-1 w-full relative overflow-hidden touch-none cursor-crosshair select-none"
                  style={{
                    backgroundColor: '#ffffff',
                    backgroundImage: showGridPaper 
                      ? 'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)' 
                      : 'none',
                    backgroundSize: '20px 20px'
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    className="w-full h-full block touch-none"
                    onMouseDown={(e) => startDrawing(e.clientX, e.clientY)}
                    onMouseMove={(e) => drawMove(e.clientX, e.clientY)}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={(e) => {
                      if (e.touches.length > 0) {
                        startDrawing(e.touches[0].clientX, e.touches[0].clientY);
                      }
                    }}
                    onTouchMove={(e) => {
                      if (e.touches.length > 0) {
                        drawMove(e.touches[0].clientX, e.touches[0].clientY);
                      }
                    }}
                    onTouchEnd={stopDrawing}
                  />
                </div>

                {/* Footer Actions */}
                <div className="px-4 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowDrawingCanvas(false)}
                    className="px-4 py-2 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleInsertDrawing}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer hover:opacity-95 active:scale-98 transition-transform"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Attach Graph to Answer</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Modal */}
        <AnimatePresence>
          {showHistoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[85vh]"
              >
                {/* Modal Header */}
                <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-zinc-900">AP Practice History</h3>
                      <p className="text-[10px] text-zinc-500 font-semibold">{historyList.length} sessions saved</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {historyList.length > 0 && (
                      <button
                        onClick={handleClearAllHistory}
                        className="text-[11px] text-red-600 hover:text-red-700 font-bold px-2 py-1 rounded hover:bg-red-50 cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                    <button
                      onClick={() => setShowHistoryModal(false)}
                      className="w-8 h-8 rounded-full bg-zinc-200/70 hover:bg-zinc-300 text-zinc-700 flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Modal List */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {historyList.length === 0 ? (
                    <div className="text-center py-12 flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mb-3">
                        <Clock className="w-6 h-6" />
                      </div>
                      <h4 className="font-black text-zinc-800 text-sm">No Practice History Yet</h4>
                      <p className="text-xs text-zinc-500 max-w-xs mt-1">
                        Generated questions will automatically appear here line-wise so you can practice again or export to PDF anytime.
                      </p>
                    </div>
                  ) : (
                    historyList.map(item => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl border border-zinc-200 bg-white hover:border-indigo-200 transition-all shadow-xs flex flex-col gap-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-xs text-zinc-900">
                                {item.subjectName}
                              </span>
                              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700">
                                {item.shortCode}
                              </span>
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                item.questionType === 'objective'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-purple-50 text-purple-700'
                              }`}>
                                {item.questionType === 'objective' ? 'MCQ' : 'FRQ'} ({item.count} Qs)
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-600 font-medium truncate mt-0.5">
                              {item.unitTitle}
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              {formatHistoryDate(item.timestamp)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                            className="w-7 h-7 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                            title="Delete session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
                          <button
                            onClick={() => handleResumeHistory(item)}
                            className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <span>Practice Questions</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handlePreviewHistoryPdf(item)}
                            className="py-2 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            title="Preview & Export PDF"
                          >
                            <FileText className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Preview PDF</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Fullscreen In-App PDF Preview Reader Modal */}
        {previewPdfUri && (
          <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col h-screen w-screen animate-fade-in">
            {/* Top Bar */}
            <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setPreviewPdfUri(null);
                  }}
                  className="w-9 h-9 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer border-none shrink-0"
                  title="Back to Questions"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-sm text-white truncate">{previewPdfName}</h3>
                  <p className="text-[10px] text-zinc-400 font-semibold">AP Exam Document • PDF Preview Mode</p>
                </div>
              </div>
              <button
                onClick={() => {
                  triggerVibration(10);
                  setPreviewPdfUri(null);
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Safe PDF Viewer Component */}
            <div className="flex-1 overflow-hidden relative flex flex-col bg-zinc-900">
              <SafePdfViewer pdfUrlOrBase64={previewPdfUri} />
            </div>

            {/* Bottom Action Bar: Download & Share */}
            <div className="bg-zinc-950 p-4 border-t border-zinc-900 flex shrink-0 z-10 gap-3">
              <button
                onClick={async () => {
                  triggerVibration(15);
                  try {
                    const res = await fetch(previewPdfUri);
                    const blob = await res.blob();
                    await savePDFMobile(blob, previewPdfName);
                  } catch (e: any) {
                    console.error("PDF download error:", e);
                    alert("Download failed: " + e.message);
                  }
                }}
                className="flex-1 bg-white hover:bg-zinc-100 text-zinc-900 font-black text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-md"
              >
                <Download className="w-4 h-4 text-zinc-900" />
                <span>DOWNLOAD PDF</span>
              </button>
              <button
                onClick={async () => {
                  triggerVibration(15);
                  try {
                    const res = await fetch(previewPdfUri);
                    const blob = await res.blob();
                    await sharePDFMobile(blob, previewPdfName);
                  } catch (e: any) {
                    console.error("PDF share error:", e);
                    alert("Share failed: " + e.message);
                  }
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-md"
              >
                <Share2 className="w-4 h-4 text-white" />
                <span>SHARE PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* AI Magic Tutor Concept Explanation & Hints Sheet / Modal */}
        <AnimatePresence>
          {showTutorModal && tutorActiveQuestion && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-fade-in">
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-purple-200 overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Tutor Modal Header */}
                <div className="p-4 border-b border-purple-100 flex items-center justify-between bg-gradient-to-r from-purple-50 via-indigo-50/70 to-purple-50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                      <Sparkles className="w-4 h-4 text-white animate-pulse" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-sm text-zinc-900 truncate">AI Magic Tutor</h3>
                        <span className="text-[9px] bg-purple-200 text-purple-800 font-black px-1.5 py-0.5 rounded-full">
                          AP CONCEPT HINTS
                        </span>
                      </div>
                      <p className="text-[10px] text-purple-700 font-bold truncate">
                        {selectedSubject.name} • {tutorActiveQuestion.skill || 'Concept Breakdown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSendToFullAITutor}
                      className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-[10px] font-black transition-colors cursor-pointer"
                      title="Open full conversation in AI Tutor tab"
                    >
                      <Send className="w-2.5 h-2.5" />
                      <span>Full Tutor Tab</span>
                    </button>
                    <button
                      onClick={() => setShowTutorModal(false)}
                      className="w-8 h-8 rounded-full bg-zinc-200/70 hover:bg-zinc-300 text-zinc-700 flex items-center justify-center cursor-pointer"
                      title="Close Tutor"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Modal Scroll Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
                  {/* Question Summary Pill */}
                  <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-700">
                    <div className="flex items-center justify-between font-bold text-[10px] uppercase tracking-wide text-zinc-400 mb-1">
                      <span>Question Context</span>
                      <span>{tutorActiveQuestion.type === 'objective' ? 'Section I (MCQ)' : 'Section II (FRQ)'}</span>
                    </div>
                    <div className="line-clamp-2 font-medium">
                      <GlobalMarkdown>{tutorActiveQuestion.text}</GlobalMarkdown>
                    </div>
                  </div>

                  {/* Socratic Anti-Spoiler Badge */}
                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center gap-2 text-amber-900 text-[11px] font-semibold">
                    <span className="text-base shrink-0">💡</span>
                    <span>
                      <strong>Magic Tutor Rule:</strong> I will explain the question, break down the core concepts, and provide strategic hints so <strong>you</strong> can solve it yourself without spoilers!
                    </span>
                  </div>

                  {/* Tutor Response / Explanation */}
                  {tutorLoading && !tutorExplanation ? (
                    <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
                      <AdvancedLoader type="orb" context="dashboard" />
                      <p className="text-xs font-bold text-purple-900">
                        Magic Tutor is analyzing the question & formulating strategic hints...
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 text-xs text-zinc-800 leading-relaxed space-y-2">
                      <GlobalMarkdown>{tutorExplanation}</GlobalMarkdown>
                    </div>
                  )}

                  {/* Conversational Q&A History */}
                  {tutorChatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white self-end ml-8 rounded-tr-none'
                          : 'bg-purple-50/80 border border-purple-200 text-zinc-800 self-start mr-8 rounded-tl-none'
                      }`}
                    >
                      <div className="text-[10px] font-black uppercase tracking-wider mb-1 opacity-75">
                        {msg.role === 'user' ? 'You' : 'AI Magic Tutor'}
                      </div>
                      <GlobalMarkdown>{msg.text}</GlobalMarkdown>
                    </div>
                  ))}

                  {tutorLoading && tutorExplanation && (
                    <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-xs text-purple-800 italic flex items-center gap-2 self-start">
                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                      <span>Magic Tutor is formulating your answer...</span>
                    </div>
                  )}
                </div>

                {/* Modal Bottom Follow-up Input */}
                <div className="p-3 border-t border-zinc-200 bg-white flex flex-col gap-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendTutorFollowUp();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={tutorFollowUp}
                      onChange={(e) => setTutorFollowUp(e.target.value)}
                      placeholder="Ask Magic Tutor a question about this problem..."
                      disabled={tutorLoading}
                      className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-zinc-50"
                    />
                    <button
                      type="submit"
                      disabled={!tutorFollowUp.trim() || tutorLoading}
                      className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 cursor-pointer hover:opacity-95"
                    >
                      <Send className="w-3 h-3" />
                      <span className="hidden xs:inline">Ask</span>
                    </button>
                  </form>

                  {/* Quick Option to switch to Full AI Tutor */}
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
                    <span>Powered by College Board AP AI Engine</span>
                    <button
                      type="button"
                      onClick={handleSendToFullAITutor}
                      className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                    >
                      Open in full AI Magic Tutor chat →
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* ================= ASK AI 2-SUGGESTION MODAL PAGE ================= */}
        <AnimatePresence>
          {askAiModalData && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-r from-purple-50 via-indigo-50 to-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-zinc-900 leading-tight">
                        AI Magic Tutor Assistance
                      </h3>
                      <p className="text-[11px] text-zinc-500 font-medium">
                        Choose how you want AI to explain this question
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(10);
                      setAskAiModalData(null);
                    }}
                    className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 2 AI Suggestions */}
                <div className="p-5 flex flex-col gap-3.5 overflow-y-auto">
                  {/* Suggestion 1: Explain question with hints by AI */}
                  <button
                    type="button"
                    onClick={() => handleSelectAITutorMode('hints')}
                    className="group w-full p-4 rounded-2xl border-2 border-amber-200/80 bg-gradient-to-br from-amber-50/60 to-white hover:border-amber-400 hover:shadow-md transition-all text-left flex items-start gap-3.5 cursor-pointer active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-amber-100 group-hover:bg-amber-500 group-hover:text-white text-amber-700 flex items-center justify-center shrink-0 transition-colors shadow-xs">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-black text-zinc-900 group-hover:text-amber-900 transition-colors">
                          Explain Question with Hints by AI
                        </h4>
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full shrink-0">
                          Guided Hints
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-relaxed font-normal">
                        AI Tutor breaks down core concepts and gives strategic clues & step-by-step hints so you can solve it yourself without spoilers!
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all self-center shrink-0" />
                  </button>

                  {/* Suggestion 2: Explain question and answer with AI */}
                  <button
                    type="button"
                    onClick={() => handleSelectAITutorMode('full-solution')}
                    className="group w-full p-4 rounded-2xl border-2 border-indigo-200/80 bg-gradient-to-br from-indigo-50/60 to-white hover:border-indigo-400 hover:shadow-md transition-all text-left flex items-start gap-3.5 cursor-pointer active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 group-hover:bg-indigo-600 group-hover:text-white text-indigo-700 flex items-center justify-center shrink-0 transition-colors shadow-xs">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-black text-zinc-900 group-hover:text-indigo-900 transition-colors">
                          Explain Question & Answer with AI
                        </h4>
                        <span className="text-[9px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-100/90 px-2 py-0.5 rounded-full shrink-0">
                          Full Solution
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-relaxed font-normal">
                        AI Tutor gives the complete step-by-step solution, reveals why the correct answer is right, and explains why wrong options fail.
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all self-center shrink-0" />
                  </button>
                </div>

                {/* Footer Info */}
                <div className="px-5 pb-5 pt-1 text-center">
                  <p className="text-[10px] text-zinc-400 font-medium">
                    Powered by AP Course & Exam Description (CED) AI Tutoring Engine
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* ================= TIMER SETUP MODAL ================= */}
        <AnimatePresence>
          {showTimerSetupModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-r from-amber-50 via-orange-50 to-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
                      <Timer className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-zinc-900 leading-tight">
                        Exam Practice Timer
                      </h3>
                      <p className="text-[11px] text-zinc-500 font-medium">
                        Set custom exam duration or choose official AP timing
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(10);
                      setShowTimerSetupModal(false);
                    }}
                    className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                  {/* Current Status Badge */}
                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                        Timer Status
                      </span>
                      <div className="text-xl font-black text-zinc-900 font-mono mt-0.5">
                        {timeRemainingSeconds > 0 ? formatTime(timeRemainingSeconds) : 'No Active Timer'}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase ${
                      isTimerActive 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : timeRemainingSeconds > 0 
                        ? 'bg-amber-100 text-amber-800' 
                        : 'bg-zinc-200 text-zinc-600'
                    }`}>
                      {isTimerActive ? 'Running' : timeRemainingSeconds > 0 ? 'Paused' : 'Off'}
                    </span>
                  </div>

                  {/* Preset 1: Official AP Exam Recommendation */}
                  {totalAllocatedSeconds > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerVibration(10);
                        setTimeRemainingSeconds(totalAllocatedSeconds);
                        setIsTimerActive(true);
                        setShowTimerSetupModal(false);
                      }}
                      className="p-3.5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 hover:border-indigo-400 text-left flex items-center justify-between transition-all cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-black text-indigo-950">
                          Official AP® Exam Standard Time
                        </div>
                        <div className="text-[11px] text-indigo-700 font-medium">
                          {formatTime(totalAllocatedSeconds)} (College Board Recommended Pace)
                        </div>
                      </div>
                      <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-black text-xs shadow-xs">
                        Start
                      </span>
                    </button>
                  )}

                  {/* Quick Minute Presets */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-500 block mb-2">
                      Quick Timer Presets
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[5, 10, 15, 20, 25, 45].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            triggerVibration(10);
                            const secs = mins * 60;
                            setTotalAllocatedSeconds(secs);
                            setTimeRemainingSeconds(secs);
                            setIsTimerActive(true);
                            setShowTimerSetupModal(false);
                          }}
                          className="py-2.5 px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 font-black text-xs text-zinc-800 transition-all cursor-pointer text-center active:scale-95 shadow-xs"
                        >
                          {mins} Minutes
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Duration Input */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-500 block mb-2">
                      Custom Duration (Minutes)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={customTimerMinutes}
                        onChange={e => setCustomTimerMinutes(e.target.value)}
                        placeholder="e.g. 12"
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-zinc-50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const m = parseInt(customTimerMinutes, 10);
                          if (m > 0) {
                            triggerVibration(10);
                            const secs = m * 60;
                            setTotalAllocatedSeconds(secs);
                            setTimeRemainingSeconds(secs);
                            setIsTimerActive(true);
                            setShowTimerSetupModal(false);
                          }
                        }}
                        className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-xs transition-colors cursor-pointer shrink-0"
                      >
                        Set & Start
                      </button>
                    </div>
                  </div>

                  {/* Timer Controls (Pause / Reset) */}
                  {timeRemainingSeconds > 0 && (
                    <div className="pt-2 border-t border-zinc-200/80 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setIsTimerActive(prev => !prev);
                        }}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          isTimerActive 
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900' 
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {isTimerActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isTimerActive ? 'Pause Timer' : 'Resume Timer'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setIsTimerActive(false);
                          setTimeRemainingSeconds(0);
                          stopAlarmSound();
                          setShowTimerSetupModal(false);
                        }}
                        className="py-2.5 px-3.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Turn Off</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ================= TIME'S UP FULL OVERLAY MODAL ================= */}
        <AnimatePresence>
          {showTimesUpModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ duration: 0.25 }}
                className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-red-200 overflow-hidden flex flex-col text-center"
              >
                {/* Animated Banner Header */}
                <div className="p-6 bg-gradient-to-b from-red-600 via-red-500 to-rose-600 text-white flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="w-16 h-16 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 shadow-inner border border-white/30 animate-bounce">
                    <span className="text-3xl">⏰</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-200 bg-red-950/40 px-3 py-0.5 rounded-full mb-1">
                    Exam Session Completed
                  </span>
                  <h2 className="text-2xl font-black tracking-tight">Time's Up!</h2>
                  <p className="text-xs text-red-100 mt-1 max-w-xs font-medium">
                    Your allocated time for this AP® practice session has ended.
                  </p>

                  <div className="absolute -right-6 -bottom-6 text-7xl opacity-15 pointer-events-none select-none">
                    ⏳
                  </div>
                </div>

                {/* Modal Actions Body */}
                <div className="p-5 flex flex-col gap-3">
                  {/* Primary Stop Alarm Button */}
                  <button
                    type="button"
                    onClick={() => {
                      stopAlarmSound();
                    }}
                    className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                      isAlarmPlaying 
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/40 animate-pulse' 
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 shadow-none'
                    }`}
                  >
                    <BellOff className="w-4 h-4" />
                    <span>{isAlarmPlaying ? 'Stop Alarm Sound 🔔' : 'Alarm Muted'}</span>
                  </button>

                  {/* Essential Action 1: Add Extra Time (+5 Min) */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(15);
                      stopAlarmSound();
                      setTimeRemainingSeconds(300);
                      setTotalAllocatedSeconds(prev => prev + 300);
                      setIsTimerActive(true);
                      setShowTimesUpModal(false);
                    }}
                    className="w-full py-3 rounded-2xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-amber-700" />
                    <span>Add +5 Min Extra Time & Continue</span>
                  </button>

                  {/* Essential Action 2: Export Test Questions to PDF */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(15);
                      stopAlarmSound();
                      setShowTimesUpModal(false);
                      handleExportPDF();
                    }}
                    className="w-full py-3 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-indigo-600" />
                    <span>Export Questions to PDF</span>
                  </button>

                  {/* Essential Action 3: Review Answers / Finish */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(15);
                      stopAlarmSound();
                      setShowTimesUpModal(false);
                      setIsExamCompleted(true);
                    }}
                    className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Finish & Review Answers</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ================= OFFICIAL AP REFERENCE SHEET & PERIODIC TABLE MODAL ================= */}
        <AnimatePresence>
          {showFormulaModal && referenceData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-zinc-200 flex flex-col max-h-[90vh] overflow-hidden"
              >
                {/* Modal Header */}
                <div className="px-5 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-indigo-800 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200">
                        Official College Board Reference
                      </div>
                      <h3 className="text-base font-black tracking-tight text-white leading-snug">
                        {referenceData.title}
                      </h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormulaModal(false)}
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer"
                    title="Close Reference Sheet"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tab Selection & Search */}
                <div className="px-5 py-3 border-b border-zinc-200 bg-zinc-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormulaModalTab('formulas')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        formulaModalTab === 'formulas'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                      }`}
                    >
                      📐 Formulas & Constants
                    </button>
                    {referenceData.hasPeriodicTable && (
                      <button
                        type="button"
                        onClick={() => setFormulaModalTab('periodic-table')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          formulaModalTab === 'periodic-table'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                        }`}
                      >
                        🧪 Periodic Table
                      </button>
                    )}
                  </div>

                  {formulaModalTab === 'formulas' && (
                    <div className="relative w-full sm:w-60">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={formulaSearchQuery}
                        onChange={(e) => setFormulaSearchQuery(e.target.value)}
                        placeholder="Search formula, constant..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-xl placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {formulaSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setFormulaSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-5">
                  {formulaModalTab === 'formulas' ? (
                    <div className="flex flex-col gap-6">
                      {/* Filtered Sections */}
                      {referenceData.sections
                        .map((sec) => {
                          const filteredFormulas = sec.items.filter(f =>
                            !formulaSearchQuery ||
                            f.name.toLowerCase().includes(formulaSearchQuery.toLowerCase()) ||
                            (f.formula && f.formula.toLowerCase().includes(formulaSearchQuery.toLowerCase())) ||
                            (f.notes && f.notes.toLowerCase().includes(formulaSearchQuery.toLowerCase()))
                          );
                          return { ...sec, filteredFormulas };
                        })
                        .filter(sec => sec.filteredFormulas.length > 0)
                        .map((sec, idx) => (
                          <div key={idx} className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 border-b border-zinc-200 pb-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-600" />
                              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900">
                                {sec.category}
                              </h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {sec.filteredFormulas.map((f, fIdx) => (
                                <div
                                  key={fIdx}
                                  className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 hover:border-emerald-300 transition-colors flex flex-col gap-1.5"
                                >
                                  <div className="text-xs font-bold text-zinc-800">{f.name}</div>
                                  {f.formula && (
                                    <div className="p-2 rounded-xl bg-white border border-zinc-200/80 font-mono text-xs font-bold text-emerald-950 overflow-x-auto select-text">
                                      {f.formula}
                                    </div>
                                  )}
                                  {f.notes && (
                                    <div className="text-[11px] text-zinc-500 italic mt-0.5 select-text">
                                      {f.notes}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                      {/* No results */}
                      {referenceData.sections.every(sec => 
                        sec.items.filter(f =>
                          !formulaSearchQuery ||
                          f.name.toLowerCase().includes(formulaSearchQuery.toLowerCase()) ||
                          (f.formula && f.formula.toLowerCase().includes(formulaSearchQuery.toLowerCase())) ||
                          (f.notes && f.notes.toLowerCase().includes(formulaSearchQuery.toLowerCase()))
                        ).length === 0
                      ) && (
                        <div className="text-center py-10 text-zinc-400 text-xs">
                          No formulas found matching "{formulaSearchQuery}".
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Interactive Periodic Table */
                    <div className="flex flex-col gap-4">
                      <div className="text-xs text-zinc-600 flex items-center justify-between">
                        <span className="font-semibold">Standard Periodic Table of the Elements</span>
                        <span className="text-[10px] text-zinc-400">Tap element to inspect</span>
                      </div>

                      {/* Selected Element Details Card */}
                      {selectedPeriodicElement && (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-300 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className="w-14 h-14 rounded-2xl bg-white shadow-md border border-emerald-300 flex flex-col items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-zinc-400 leading-none">
                                {selectedPeriodicElement.number}
                              </span>
                              <span className="text-xl font-black text-emerald-700 leading-tight">
                                {selectedPeriodicElement.symbol}
                              </span>
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-zinc-900">
                                {selectedPeriodicElement.name}
                              </h4>
                              <div className="flex flex-wrap gap-2 text-[11px] text-zinc-600 mt-0.5">
                                <span>Atomic Mass: <strong className="text-zinc-900">{selectedPeriodicElement.mass}</strong></span>
                                <span>•</span>
                                <span>Category: <strong className="text-emerald-700">{selectedPeriodicElement.category}</strong></span>
                                {selectedPeriodicElement.electronegativity && (
                                  <>
                                    <span>•</span>
                                    <span>Electronegativity: <strong className="text-zinc-900">{selectedPeriodicElement.electronegativity}</strong></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPeriodicElement(null)}
                            className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-zinc-400 hover:text-zinc-700 border border-zinc-200 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Periodic Table Grid */}
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-1.5 max-h-[55vh] overflow-y-auto p-1">
                        {AP_PERIODIC_TABLE.map((el) => {
                          const isSelected = selectedPeriodicElement?.symbol === el.symbol;
                          return (
                            <button
                              key={el.symbol}
                              type="button"
                              onClick={() => setSelectedPeriodicElement(el)}
                              className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-105'
                                  : 'bg-white hover:bg-emerald-50 text-zinc-800 border-zinc-200 hover:border-emerald-300 shadow-2xs'
                              }`}
                            >
                              <span className={`text-[9px] font-mono leading-none ${isSelected ? 'text-emerald-100' : 'text-zinc-400'}`}>
                                {el.number}
                              </span>
                              <span className={`text-base font-black leading-tight ${isSelected ? 'text-white' : 'text-zinc-900'}`}>
                                {el.symbol}
                              </span>
                              <span className={`text-[8px] truncate w-full text-center ${isSelected ? 'text-emerald-100' : 'text-zinc-500'}`}>
                                {el.name}
                              </span>
                              <span className={`text-[8px] font-mono leading-none mt-0.5 ${isSelected ? 'text-emerald-200' : 'text-zinc-400'}`}>
                                {el.mass}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between text-xs text-zinc-500 shrink-0">
                  <span>Official AP Exam Equation Tables • Permitted During Testing</span>
                  <button
                    type="button"
                    onClick={() => setShowFormulaModal(false)}
                    className="px-4 py-1.5 rounded-xl bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 cursor-pointer"
                  >
                    Close Sheet
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
