import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, HelpCircle, Loader2, Share2, 
  Sparkles, BookOpen, GraduationCap, Clock, FileText, 
  ChevronRight, Save, History, Trash2, Send, PenTool, CheckCircle2,
  RefreshCw, ExternalLink, Camera, Plus, Image, X, Info, Award, Flag, ChevronDown, ChevronUp
} from 'lucide-react';
import ReportAIModal from './ReportAIModal';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { deductCoins, getCoins, isUserLoggedIn, isProUser } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { getUserProfileData, getProfilePayload } from '../utils/profile';
import { getStoredExamBlueprint, saveStoredExamBlueprint } from '../utils/academicBlueprint';
import { getScalableRelevantQuizzes, cleanSubjectTitle } from '../utils/curriculumMap';
import { getCachedCurriculumContent, saveCachedCurriculumContent, parseTopicHierarchy, isValidAcademicTopicInput, registerVerifiedChapterSubTopic, isCurriculumContentCached, verifySubTopicWithAI, removeCustomChapterSubTopic, getVerifiedChapterSubTopics } from '../utils/communityCache';
import { REGIONAL_TRACKS } from './AcademicSetup';
import jsPDF from 'jspdf';
import { savePDFMobile, sharePDFMobile, shareTextMobile } from '../utils/mobileSaver';
import { sanitizePdfText } from '../utils/pdfSanitizer';
import {
  isTableLine,
  isTableSeparator,
  renderPdfTable,
  renderPdfDiagramBlock,
  formatMathAndSuperscripts
} from '../utils/pdfTableRenderer';
import SafePdfViewer from './SafePdfViewer';
import AdvancedLoader from './AdvancedLoader';
import GlobalMarkdown, { healGlobalMarkdown, healMarkdownTables } from './GlobalMarkdown';
import { getApiUrl } from '../utils/api';

interface QuestionGeneratorProps {
  onBack: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export interface QuestionObject {
  question: string;
  expectedAnswer?: string;
  keyRubricPoints?: string[];
  answer?: string;
  solution?: string;
  modelAnswer?: string;
  model_answer?: string;
  expected_answer?: string;
  detailedAnswer?: string;
  explanation?: string;
  rubric?: string[];
  rubricPoints?: string[];
  key_rubric_points?: string[];
  markingScheme?: string[];
  marking_scheme?: string[];
}

export type QuestionItem = string | QuestionObject;

interface SavedSet {
  id: string;
  topic: string;
  count: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard' | string;
  gradeLevel: string;
  stream: string;
  questions: QuestionItem[];
  userAnswers?: Record<number, string>;
  createdAt: Date;
  isPdf?: boolean;
}

const TOPIC_POOLS: Record<string, string[]> = {
  pcb: [
    "Cell Biology & Organelles", "Genetics & Mendelian Inheritance", "Human Circulatory & Heart Physiology", 
    "Chemical Equilibrium & Le Chatelier", "Biomolecules & Enzyme Catalysis", "Plant Photosynthesis & Respiration", 
    "Coordination Compounds & Bonding", "Organic Reaction Mechanisms", "Ecology & Ecosystem Energy Flow", 
    "Human Endocrine & Feedback Loops", "Chemical Kinetics & Reaction Rates", "DNA Replication & Transcription",
    "Solutions & Colligative Properties", "Thermodynamics in Chemical Reactions"
  ],
  pcm: [
    "Calculus & Definite Integrals", "Electromagnetic Induction & Faraday's Law", "Thermodynamics & Heat Engines", 
    "Rotational Dynamics & Moment of Inertia", "Wave Optics & Interference", "Vectors & 3D Analytical Geometry", 
    "Chemical Kinetics & Rate Laws", "Electrostatics & Gauss's Theorem", "Matrices & Determinants", 
    "Current Electricity & Kirchhoff's Laws", "Coordination Chemistry & Isomerism", "Differential Equations"
  ],
  computer: [
    "OOP Polymorphism & Inheritance", "Binary Search Trees & Balancing", "Recursion & Call Stack Depth", 
    "Time Complexity & Big-O Analysis", "Dijkstra's Shortest Path Algorithm", "Merge Sort vs Quick Sort", 
    "REST API Design & Webhooks", "Neural Network Architecture & Backprop", "Relational Database Normalization & Joins", 
    "Graph Breadth-First vs Depth-First", "Hash Map Collisions & Chaining", "SQL Query Optimization",
    "Git Version Control & Branching", "Cybersecurity & Cryptographic Hashing"
  ],
  business: [
    "Inflation & Central Bank Interest Rates", "Perfect Competition vs Monopoly Equilibrium", "Asset-Liability Balancing", 
    "Fiscal vs Monetary Policy Tools", "Supply & Demand Elasticity Models", "National Income Accounting & GDP", 
    "Corporate Financial Statement Analysis", "Behavioral Finance & Decision Biases", "Marginal Cost & Revenue Curves", 
    "Working Capital Management", "Game Theory & Nash Equilibrium"
  ],
  humanities: [
    "Industrial Revolution Socioeconomic Impact", "Constitutional Law & Judicial Review", "Cold War Proxy Geopolitics", 
    "Cognitive Psychology & Memory Models", "Social Stratification & Globalization", "Literary Analysis & Critical Theory", 
    "Socratic Dialogue & Dialectical Method", "Ancient Greek Democratic Philosophy", "Renaissance Humanism & Enlightenment", 
    "World War Treaties & Diplomatic Breakdown"
  ],
  stem: [
    "Newton's Laws of Motion & Momentum", "Integration by Parts & Substitution", "Vector Force Equilibrium", 
    "Hooke's Law & Simple Harmonic Motion", "Kinematics & Projectile Motion", "Thermodynamic Entropy & Free Energy", 
    "Maxwell's Electromagnetic Equations", "Fluid Dynamics & Bernoulli's Principle", "Linear Algebra & Eigenvalues"
  ],
  science: [
    "Photosynthesis & Calvin Cycle", "Mitochondrial ATP Synthesis", "DNA Polymerase Replication Forks", 
    "Mitosis & Meiosis Cell Cycle Checkpoints", "Neuron Action Potential Propagation", "Enzyme Kinetics & Michaelis-Menten", 
    "Endocrine Feedback & Homeostasis", "Renal Nephron Filtration & Osmoregulation"
  ],
  default: [
    "Cell Biology & Molecular Genetics", "Chemical Equilibrium & Thermodynamics", "Calculus & Mathematical Modeling", 
    "Newtonian Mechanics & Energy Conservation", "Economic Market Structures & Trade", "Cognitive Psychology & Learning", 
    "Environmental Science & Climate Models", "Scientific Methodology & Logic"
  ]
};

export default function QuestionGenerator({ onBack, onNavigateToTab }: QuestionGeneratorProps) {
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (showHistory) {
      if (selectedHistoryItem) {
        setSelectedHistoryItem(null);
      } else {
        setShowHistory(false);
      }
    } else if (questions) {
      setQuestions(null);
    } else {
      onBack();
    }
  };
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState<string>('');
  const [customTopic, setCustomTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Answers drafted by the user
  const [draftAnswers, setDraftAnswers] = useState<Record<number, string>>({});
  const [uploadedAnswerFiles, setUploadedAnswerFiles] = useState<Record<number, File>>({});
  const [evaluations, setEvaluations] = useState<Record<number, string>>({});
  const [evaluatingIndex, setEvaluatingIndex] = useState<number | null>(null);
  const [transcribingIndices, setTranscribingIndices] = useState<Record<number, boolean>>({});
  const galleryInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [openMediaMenuIndex, setOpenMediaMenuIndex] = useState<number | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSnippet, setReportSnippet] = useState('');

  // History Tab & State
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<SavedSet[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<SavedSet | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<'pdf' | 'questions'>('pdf');
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [historyPdfUri, setHistoryPdfUri] = useState<string | null>(null);

  const [isPro, setIsPro] = useState(() => isProUser());
  const sessionSeenQuestionsRef = useRef<string[]>([]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    // Pre-load history so previously seen questions are immediately available to prevent duplicates
    loadLocalHistory();
    if (auth.currentUser?.uid) {
      fetchHistory();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (previewPdfUri) {
        e.preventDefault();
        triggerVibration(10);
        setPreviewPdfUri(null);
      } else if (selectedHistoryItem) {
        e.preventDefault();
        triggerVibration(10);
        setSelectedHistoryItem(null);
      } else if (showHistory) {
        e.preventDefault();
        triggerVibration(10);
        setShowHistory(false);
      } else if (questions) {
        e.preventDefault();
        triggerVibration(10);
        setQuestions(null);
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [previewPdfUri, selectedHistoryItem, showHistory, questions]);

  useEffect(() => {
    const handleUpdate = () => {
      setIsPro(isProUser());
    };

    const unsubscribe = auth.onAuthStateChanged(handleUpdate);

    window.addEventListener('study-vip-updated', handleUpdate);
    window.addEventListener('study-coins-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener('study-vip-updated', handleUpdate);
      window.removeEventListener('study-coins-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Profile data
  const [gradeLevel, setGradeLevel] = useState('11th Grade (Junior)');
  const [stream, setStream] = useState('STEM / Engineering');
  const [country, setCountry] = useState('United States');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [customSubTopicInput, setCustomSubTopicInput] = useState<{ [chapterKey: string]: string }>({});
  const [showCustomInputForChapter, setShowCustomInputForChapter] = useState<string | null>(null);
  const [customInputError, setCustomInputError] = useState<{ [chapterKey: string]: string }>({});
  const [isVerifyingSubTopic, setIsVerifyingSubTopic] = useState<{ [chapterKey: string]: boolean }>({});
  const [targetExam, setTargetExam] = useState('');
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [showAllSubjects, setShowAllSubjects] = useState<boolean>(false);
  const [syllabusResearchState, setSyllabusResearchState] = useState<'idle' | 'researching' | 'completed'>('idle');
  const [blueprintRevision, setBlueprintRevision] = useState(0);

  // Proactively deep research syllabus units for user's chosen subjects & exam
  useEffect(() => {
    let isMounted = true;
    const conductLiveSyllabusResearch = async () => {
      const profile = getUserProfileData();
      const currentBp = getStoredExamBlueprint();
      const currentTargetExam = profile.targetExam || safeGetItem('academic_exam') || safeGetItem('target_exam') || '';

      const chosenSubjects: string[] = [];
      if (Array.isArray(profile.subjects) && profile.subjects.length > 0) {
        profile.subjects.forEach(s => {
          const str = String(s).trim();
          if (str && !chosenSubjects.includes(str)) chosenSubjects.push(str);
        });
      }
      const rawAcademicSubjects = safeGetItem('academic_subjects');
      if (rawAcademicSubjects) {
        try {
          const parsed = JSON.parse(rawAcademicSubjects);
          if (Array.isArray(parsed)) {
            parsed.forEach(s => {
              const str = String(s).trim();
              if (str && !chosenSubjects.includes(str)) chosenSubjects.push(str);
            });
          }
        } catch (_) {}
      }
      const rawSingleSubject = safeGetItem('academic_subject') || safeGetItem('subject') || safeGetItem('selected_subject');
      if (rawSingleSubject) {
        rawSingleSubject.split(',').forEach(s => {
          const str = s.trim();
          if (str && !chosenSubjects.includes(str)) chosenSubjects.push(str);
        });
      }

      if (chosenSubjects.length === 0) return;

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
              examName: currentTargetExam || 'Standardized Examination',
              subjects: missing,
              gradeLevel: profile.gradeLevel
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.blueprint && typeof data.blueprint === 'object') {
              const updated = { ...(currentBp || {}), ...data.blueprint };
              saveStoredExamBlueprint(updated);
              if (isMounted) {
                setBlueprintRevision(prev => prev + 1);
                setSyllabusResearchState('completed');
              }
            }
          }
        } catch (err) {
          console.warn('Live syllabus research error:', err);
        } finally {
          if (isMounted) setSyllabusResearchState('idle');
        }
      }
    };

    conductLiveSyllabusResearch();
    return () => { isMounted = false; };
  }, [gradeLevel, stream, country]);

  const mergedSubjects = useMemo(() => {
    return getScalableRelevantQuizzes(gradeLevel, stream, country);
  }, [gradeLevel, stream, country, blueprintRevision]);

  // Load profile from local storage / context & listen for updates
  useEffect(() => {
    const syncProfile = () => {
      const profile = getUserProfileData();
      if (profile.gradeLevel) setGradeLevel(profile.gradeLevel);
      if (profile.stream) setStream(profile.stream);
      if (profile.country) setCountry(profile.country);
      if (profile.targetExam) setTargetExam(profile.targetExam);
      setBlueprintRevision(prev => prev + 1);
    };
    syncProfile();
    window.addEventListener('academic_profile_updated', syncProfile);
    return () => window.removeEventListener('academic_profile_updated', syncProfile);
  }, []);

  // Suggestions states and auto-refresh logic
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getPoolKey = (streamStr: string) => {
    const s = streamStr.toLowerCase();
    if (s.includes('pcb') || s.includes('neet') || s.includes('biology') || s.includes('medical') || s.includes('botany') || s.includes('zoology')) return 'pcb';
    if (s.includes('pcm') || s.includes('jee') || s.includes('math') || s.includes('calculus')) return 'pcm';
    if (s.includes('computer') || s.includes('software') || s.includes('it') || s.includes('coding') || s.includes('cs')) return 'computer';
    if (s.includes('business') || s.includes('economics') || s.includes('commerce') || s.includes('finance') || s.includes('accounting')) return 'business';
    if (s.includes('humanities') || s.includes('arts') || s.includes('liberal') || s.includes('history') || s.includes('political') || s.includes('social') || s.includes('literature') || s.includes('psychology')) return 'humanities';
    if (s.includes('pre-med') || s.includes('medicine') || s.includes('health')) return 'pcb';
    if (s.includes('stem') || s.includes('engineering') || s.includes('physics')) return 'stem';
    if (s.includes('science')) return 'science';
    return 'default';
  };

  const refreshSuggestions = () => {
    const blueprint = getStoredExamBlueprint();
    if (blueprint && typeof blueprint === 'object') {
      const units: string[] = [];
      for (const [subjName, bp] of Object.entries(blueprint)) {
        if (Array.isArray(bp.coreUnits)) {
          units.push(...bp.coreUnits);
        }
      }
      if (units.length >= 2) {
        const shuffled = [...units].sort(() => 0.5 - Math.random());
        setSuggestedTopics(shuffled.slice(0, 4));
        return;
      }
    }
    const key = getPoolKey(stream);
    const pool = TOPIC_POOLS[key] || TOPIC_POOLS.default;
    // Shuffle and pick 4 topics randomly
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    setSuggestedTopics(shuffled.slice(0, 4));
  };

  // Auto-refresh suggestions every 8 seconds, and immediately when stream changes
  useEffect(() => {
    refreshSuggestions();
    const interval = setInterval(() => {
      refreshSuggestions();
    }, 8000);
    return () => clearInterval(interval);
  }, [stream]);

  const handleManualRefresh = () => {
    triggerVibration(15);
    setIsRefreshing(true);
    refreshSuggestions();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const getQuestionText = (q: any): string => {
    if (!q) return '';
    if (typeof q === 'string') return q;
    return q.question || '';
  };

  const getAvoidQuestionsList = (targetTopic: string): string[] => {
    const list: string[] = [];
    const norm = (targetTopic || '').toLowerCase().trim();

    // 1. Current active session questions
    if (sessionSeenQuestionsRef.current && sessionSeenQuestionsRef.current.length > 0) {
      sessionSeenQuestionsRef.current.forEach(q => {
        if (q && q.trim()) list.push(q.trim());
      });
    }

    // 2. Saved history items (both cloud and local)
    (historyItems || []).forEach(item => {
      const itemTopic = (item.topic || '').toLowerCase().trim();
      const match = !norm || itemTopic.includes(norm) || norm.includes(itemTopic) || list.length < 15;
      if (match && Array.isArray(item.questions)) {
        item.questions.forEach((q: any) => {
          const text = getQuestionText(q);
          if (text) list.push(text.trim());
        });
      }
    });

    // 3. Persistent seen questions pool from local storage
    try {
      const stored = JSON.parse(safeGetItem('helpyou_seen_subjective_questions_pool') || '[]');
      if (Array.isArray(stored)) {
        stored.forEach((item: any) => {
          if (typeof item === 'string' && item.trim()) list.push(item.trim());
        });
      }
    } catch (_) {}

    // Deduplicate and return top 30
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of list) {
      const key = item.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70);
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
      if (result.length >= 30) break;
    }
    return result;
  };

  const getExpectedAnswer = (q: any): string => {
    if (!q || typeof q === 'string') return '';
    const raw = q.expectedAnswer ?? q.answer ?? q.solution ?? q.modelAnswer ?? q.model_answer ?? q.expected_answer ?? q.detailedAnswer ?? q.explanation ?? '';
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) return raw.join('\n\n').trim();
    return String(raw || '').trim();
  };

  const getKeyRubricPoints = (q: any): string[] => {
    if (!q || typeof q === 'string') return [];
    const pts = q.keyRubricPoints ?? q.rubric ?? q.rubricPoints ?? q.key_rubric_points ?? q.markingScheme ?? q.marking_scheme ?? [];
    if (Array.isArray(pts)) {
      return pts.map((p: any) => String(p).trim()).filter(Boolean);
    }
    if (typeof pts === 'string' && pts.trim()) {
      return [pts.trim()];
    }
    return [];
  };

  const getFallbackAnswer = (questionText: string, grade?: string, streamName?: string): string => {
    const cleanQ = questionText.replace(/^Q\d+[\.:]?\s*/i, '').trim();
    return `Official Model Solution & Answer Structure:\n\n` +
      `1. Theoretical Principles & Governed Definitions:\n` +
      `To achieve maximum marks, the response must directly address: "${cleanQ.slice(0, 110)}...". State the foundational definitions, governing formulas, and relevant academic background calibrated for ${grade || 'Board / University'} examination criteria.\n\n` +
      `2. Comprehensive Step-by-Step Analysis:\n` +
      `• In-Depth Reasoning: Formulate a coherent multi-step explanation addressing cause-and-effect mechanisms, analytical evidence, or textual proofs.\n` +
      `• Analytical Rigor: Write out relevant equations ($...$), substitute exact values with units, or present balanced scientific equations.\n` +
      `• Complete Coverage: Systematically address every condition and sub-clause specified in the question.\n\n` +
      `3. Examiner Synthesis & Conclusion:\n` +
      `Summarize the final outcome with precision, ensuring dimensional consistency, accurate deductions, and cohesive conclusions.`;
  };

  const normalizeQuestionBreaks = (text: string): string => {
    if (!text) return '';

    // Step 0: Pre-heal collapsed tables (e.g. rows separated by ||) into structured newline-separated rows
    let safe = healMarkdownTables(text);

    // Step 0.5: Filter out unwanted Python simulation scripts in non-coding academic subjects (e.g. ```python import pandas ... ```)
    const isCoding = /python|coding|programming|computer|informatics/i.test(`${customTopic || ''} ${stream || ''} ${profile?.stream || ''} ${profile?.subject || ''}`);
    if (!isCoding) {
      safe = safe.replace(/```(?:python|py)\s*(?:import\s+(?:pandas|numpy|matplotlib|scipy)[\s\S]*?)```/gi, '');
    }

    // 1. Protect Code Blocks (```...```) and diagrams from receiving accidental mid-block break splits
    const codeBlocks: string[] = [];
    safe = safe.replace(/```[\s\S]*?```/g, (m) => {
      codeBlocks.push(m);
      return `___CODE_BLOCK_${codeBlocks.length - 1}___`;
    });

    // 2. Protect Markdown Tables (|...|\n|---|...) using robust multi-line table regex
    const tableBlocks: string[] = [];
    const TABLE_REGEX = /(?:^|\n)([ \t]*\|[^\n]+\|[ \t]*\n[ \t]*\|[ \t]*:?-[^\n]+\|[ \t]*(?:\n[ \t]*\|[^\n]+\|[ \t]*)+)/g;
    safe = safe.replace(TABLE_REGEX, (_match, table) => {
      tableBlocks.push(table.trim());
      return `\n\n___TABLE_BLOCK_${tableBlocks.length - 1}___\n\n`;
    });

    // 3. Protect existing math expressions ($$...$$ and $...$) from having internal line breaks injected
    const mathBlocks: string[] = [];
    safe = safe.replace(/(\$\$[\s\S]*?\$\$|\$[^\n$]+\$)/g, (m) => {
      mathBlocks.push(m);
      return `___MATH_BLOCK_${mathBlocks.length - 1}___`;
    });

    // 4. Only split explicit question sub-parts (Part A, Part B, (a), (b), (i), (ii), etc.)
    // MUST be preceded by sentence punctuation ([.;:]) and NEVER match function variables like f(x)
    safe = safe.replace(/([.;:])\s*(Part\s+[A-D]:|\([a-d]\)|\((?:i{1,3}|iv|v|vi{0,3}|ix)\))\s*/gi, '$1\n\n$2 ');

    // 5. Restore protected math blocks
    for (let i = 0; i < mathBlocks.length; i++) {
      safe = safe.split(`___MATH_BLOCK_${i}___`).join(mathBlocks[i]);
    }

    // 6. Restore protected table blocks cleanly with empty lines
    for (let i = 0; i < tableBlocks.length; i++) {
      safe = safe.split(`___TABLE_BLOCK_${i}___`).join(`\n\n${tableBlocks[i]}\n\n`);
    }

    // 7. Restore protected code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      safe = safe.split(`___CODE_BLOCK_${i}___`).join(codeBlocks[i]);
    }
    return safe;
  };

  // Loading animation variables
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = [
    "Preparing questions...",
    "Selecting relevant curriculum areas...",
    "Calibrating open-ended difficulty level...",
    "Drafting high-yield subjective practice prompts...",
    "Compiling official step-by-step model solutions & marking rubrics...",
    "Polishing question phrasing for maximum clarity..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && !questions) {
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
          const stepIndex = Math.min(Math.floor((nextVal / 96) * (loadingSteps.length - 1)), loadingSteps.length - 1);
          setLoadingStep(stepIndex);
          return nextVal;
        });
      }, 350);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, questions]);

  // Fetch History from Firestore or local storage
  const fetchHistory = async () => {
    setLoadingHistory(true);
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        const q = query(
          collection(db, 'generated_questions'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const items: SavedSet[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            topic: data.topic,
            count: data.count,
            gradeLevel: data.gradeLevel,
            stream: data.stream,
            questions: data.questions,
            userAnswers: data.userAnswers || {},
            createdAt: data.createdAt?.toDate() || new Date(),
            isPdf: !!data.isPdf
          });
        });

        // Keep only last 10 records, delete older ones
        if (items.length > 10) {
          const toKeep = items.slice(0, 10);
          const toDelete = items.slice(10);
          
          for (const item of toDelete) {
            try {
              await deleteDoc(doc(db, 'generated_questions', item.id));
            } catch (err) {
              console.error("Failed to delete old generated questions:", err);
            }
          }
          setHistoryItems(toKeep);
        } else {
          setHistoryItems(items);
        }
      } catch (e) {
        console.error("Failed to load subjective question history from Firestore:", e);
        loadLocalHistory();
      } finally {
        setLoadingHistory(false);
      }
    } else {
      loadLocalHistory();
      setLoadingHistory(false);
    }
  };

  const loadLocalHistory = () => {
    try {
      const local = JSON.parse(safeGetItem('local_generated_questions') || '[]');
      let formatted = local.map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        isPdf: !!item.isPdf
      }));

      if (formatted.length > 10) {
        formatted.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
        formatted = formatted.slice(0, 10);
        safeSetItem('local_generated_questions', JSON.stringify(formatted));
      }

      setHistoryItems(formatted);
    } catch (e) {
      console.error("Failed to load local question history:", e);
    }
  };

  const saveToHistory = async (generatedQuestions: QuestionItem[], answers: Record<number, string> = {}) => {
    const topicLabel = customTopic.trim() || `Profile ${stream} Practice`;
    const uid = auth.currentUser?.uid;
    
    const payload = {
      topic: topicLabel,
      count: questionCount,
      difficulty,
      gradeLevel,
      stream,
      questions: generatedQuestions,
      userAnswers: answers,
      createdAt: new Date(),
      isPdf: false
    };

    if (uid) {
      try {
        const docRef = await addDoc(collection(db, 'generated_questions'), {
          ...payload,
          userId: uid,
          createdAt: serverTimestamp()
        });
        setCurrentSavedId(docRef.id);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
      } catch (e) {
        console.error("Failed to save to Firestore, trying local:", e);
        const localId = saveToLocalHistory(payload);
        setCurrentSavedId(localId);
      }
    } else {
      const localId = saveToLocalHistory(payload);
      setCurrentSavedId(localId);
    }
  };

  const saveToLocalHistory = (payload: any): string => {
    try {
      const local = JSON.parse(safeGetItem('local_generated_questions') || '[]');
      const id = 'local_' + Date.now();
      const newItem = {
        id,
        ...payload,
        createdAt: payload.createdAt.toISOString()
      };
      local.unshift(newItem);
      safeSetItem('local_generated_questions', JSON.stringify(local));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      return id;
    } catch (e) {
      console.error("Failed to save locally:", e);
      return 'local_' + Date.now();
    }
  };

  const markHistoryItemAsPdf = async (id: string | null | undefined) => {
    if (!id) return;
    const uid = auth.currentUser?.uid;
    if (uid && !id.startsWith('local_')) {
      try {
        await updateDoc(doc(db, 'generated_questions', id), { isPdf: true });
        console.log(`[History] Marked Firestore item ${id} as PDF`);
      } catch (err) {
        console.error("Failed to mark Firestore item as PDF:", err);
      }
    } else {
      try {
        const local = JSON.parse(safeGetItem('local_generated_questions') || '[]');
        const updated = local.map((item: any) => item.id === id ? { ...item, isPdf: true } : item);
        safeSetItem('local_generated_questions', JSON.stringify(updated));
        console.log(`[History] Marked local item ${id} as PDF`);
      } catch (e) {
        console.error("Failed to mark local item as PDF:", e);
      }
    }
    // Update state instantly so user sees the tag change
    setHistoryItems(prev => prev.map(item => item.id === id ? { ...item, isPdf: true } : item));
    if (selectedHistoryItem?.id === id) {
      setSelectedHistoryItem(prev => prev ? { ...prev, isPdf: true } : null);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(15);
    const uid = auth.currentUser?.uid;
    if (uid && !id.startsWith('local_')) {
      try {
        await deleteDoc(doc(db, 'generated_questions', id));
        setHistoryItems(prev => prev.filter(item => item.id !== id));
        if (selectedHistoryItem?.id === id) {
          setSelectedHistoryItem(null);
        }
      } catch (err) {
        console.error("Failed to delete from Firestore:", err);
      }
    } else {
      try {
        const local = JSON.parse(safeGetItem('local_generated_questions') || '[]');
        const updated = local.filter((item: any) => item.id !== id);
        safeSetItem('local_generated_questions', JSON.stringify(updated));
        setHistoryItems(prev => prev.filter(item => item.id !== id));
        if (selectedHistoryItem?.id === id) {
          setSelectedHistoryItem(null);
        }
      } catch (e) {
        console.error("Failed to delete local item:", e);
      }
    }
  };

  const handleGenerate = async () => {
    // Check if user has at least 2 coins before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 2) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Subjective Questions", cost: 2 } }));
      return;
    }

    triggerVibration(20);
    setLoading(true);
    setError(null);
    setQuestions(null);
    setDraftAnswers({});

    try {
      const profile = getUserProfileData();
      const avoidList = getAvoidQuestionsList(customTopic);

      // Validate custom subtopic if present
      const hierarchy = parseTopicHierarchy(customTopic, profile.subject || profile.stream);
      if (hierarchy.subTopic && hierarchy.subTopic !== 'All') {
        const check = isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter);
        if (!check.isValid) {
          setLoading(false);
          setError(check.error || 'Please enter a valid academic concept or topic name.');
          triggerVibration([30, 50, 30]);
          return;
        }
      }

      // Check Community Learning Cache (0ms instant response & 0 API cost)
      const targetExamStr = profile.exam || profile.targetExam || safeGetItem('academic_exam') || safeGetItem('target_exam') || '';
      const cachedHit = await getCachedCurriculumContent({
        country: profile.country || country,
        exam: targetExamStr,
        grade: profile.gradeLevel || gradeLevel,
        subject: hierarchy.subject,
        chapter: hierarchy.chapter,
        subTopic: hierarchy.subTopic,
        feature: 'subjective_questions'
      });

      if (cachedHit && Array.isArray(cachedHit.content) && cachedHit.content.length > 0) {
        const hasTemplate = cachedHit.content.some((q: any) => {
          const t = (q.question || q.title || '').toLowerCase();
          return t.includes('concept #') || t.includes('fundamental mechanisms and significance');
        });
        if (!hasTemplate && cachedHit.content.length >= questionCount) {
          setLoadingProgress(100);
          deductCoins(2, "AI Subjective Questions");
          setQuestions(cachedHit.content.slice(0, questionCount));
          setLoading(false);
          saveToHistory(cachedHit.content.slice(0, questionCount)).catch(e => console.error("History save failed:", e));
          return;
        }
      }

      const response = await fetch(getApiUrl('/api/generate-questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getProfilePayload({
          topic: customTopic,
          count: questionCount,
          difficulty,
          difficultyLevel: difficulty,
          gradeLevel: profile.gradeLevel || gradeLevel,
          stream: profile.stream || stream,
          country: profile.country || country,
          avoidPrompts: avoidList,
          avoidQuestions: avoidList,
          randomSeed: `${Date.now()}_${Math.random().toString(36).substring(7)}`
        }))
      });

      if (!response.ok) {
        const text = await response.text();
        let errMsg = "Failed to generate questions";
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed.message || parsed.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setLoadingProgress(100);
        // Deduct 2 coins now that the output has been successfully generated by the AI
        deductCoins(2, "AI Subjective Questions");

        // Record questions to session and persistent storage so they never repeat in future generations
        const newTexts = data.questions.map((q: any) => getQuestionText(q)).filter(Boolean);
        sessionSeenQuestionsRef.current.push(...newTexts);
        try {
          const stored = JSON.parse(safeGetItem('helpyou_seen_subjective_questions_pool') || '[]');
          const combined = Array.from(new Set([...newTexts, ...(Array.isArray(stored) ? stored : [])])).slice(0, 100);
          safeSetItem('helpyou_seen_subjective_questions_pool', JSON.stringify(combined));
        } catch (_) {}

        setQuestions(data.questions);

        // Save newly generated questions into Global Community Cache for future learners
        saveCachedCurriculumContent({
          country: profile.country || country,
          exam: targetExamStr,
          grade: profile.gradeLevel || gradeLevel,
          subject: hierarchy.subject,
          chapter: hierarchy.chapter,
          subTopic: hierarchy.subTopic,
          feature: 'subjective_questions'
        }, data.questions, { count: data.questions.length });

        setLoading(false);
        // Automatically save the set to history in background
        saveToHistory(data.questions).catch(e => console.error("History save failed:", e));
      } else {
        throw new Error("Invalid response format received from server.");
      }
    } catch (e: any) {
      console.error(e);
      setError("Oops! Something went wrong on our end. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAnswers = async (index: number, val: string) => {
    const updated = { ...draftAnswers, [index]: val };
    setDraftAnswers(updated);

    // Save update in the selected history item or current set if possible
    if (questions) {
      // If we just generated and have questions, we can let user update their draft answers.
      // We can also trigger a silent update in local / cloud history if needed
    }
  };

  const handleUploadAndTranscribe = async (index: number, file: File) => {
    if (!file) return;
    triggerVibration(15);
    setUploadedAnswerFiles(prev => ({ ...prev, [index]: file }));
    
    // Set immediate placeholder in the text box so they don't have to type anything
    setDraftAnswers(prev => ({
      ...prev,
      [index]: "[Handwritten Answer Image Attached 📷]"
    }));
    triggerVibration([20, 40]);
  };

  const handleEvaluateAnswer = async (questionText: string, index: number) => {
    const answerText = draftAnswers[index] || '';
    const uploadedFile = uploadedAnswerFiles[index] || null;

    if (!answerText.trim() && !uploadedFile) {
      alert("Please write your answer draft first or upload a handwritten photo before submitting for evaluation!");
      return;
    }

    triggerVibration(20);
    setEvaluatingIndex(index);
    setError(null);

    const profile = getUserProfileData();
    const userGrade = profile.gradeLevel || gradeLevel || '11th Grade (Junior)';
    const curriculum = profile.region || 'National Board';
    const subject = customTopic || profile.stream || stream || 'General Academic';

    // 1. Immediately transition to the AI Magic Tutor tab and dispatch the question, text, and image file
    if (onNavigateToTab) {
      onNavigateToTab('aitutor');
    }

    const promptText = answerText || "[See attached handwritten answer image]";

    setTimeout(() => {
      const event = new CustomEvent('study-scanner-send-to-tutor', {
        detail: {
          text: promptText,
          imageFile: uploadedFile,
          subject: subject,
          handwritten: !!uploadedFile,
          isEvaluation: true,
          evaluationDetails: {
            subjectTopic: subject,
            userGrade: userGrade,
            questionText: questionText,
            userAnswer: promptText
          }
        }
      });
      window.dispatchEvent(event);
    }, 150);

    // 2. Also update evaluations locally if they go back
    if (uploadedFile) {
      if (isMountedRef.current) {
        setEvaluations(prev => ({
          ...prev,
          [index]: "✨ **Handwritten Answer Image Transferred!**\n\nYour handwritten photo has been uploaded directly to the **AI Tutor** for deep step-marking evaluation. Please check the AI Tutor tab for your live interactive feedback!"
        }));
        setEvaluatingIndex(null);
      }
      return;
    }

    try {
      const response = await fetch(getApiUrl('/api/evaluate-answer'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionText,
          userAnswer: answerText,
          userGrade,
          gradeLevel: userGrade,
          stream: profile.stream,
          country: profile.country,
          curriculum,
          subject,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to evaluate answer.");
      }

      if (isMountedRef.current) {
        setEvaluations(prev => ({
          ...prev,
          [index]: data.evaluation
        }));
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        console.error("Error evaluating answer:", err);
      }
    } finally {
      if (isMountedRef.current) {
        setEvaluatingIndex(null);
      }
    }
  };

  // Quick topics suggestion based on stream/track
  const getSuggestedTopics = () => {
    const key = getPoolKey(stream);
    const pool = TOPIC_POOLS[key] || TOPIC_POOLS.default;
    return pool.slice(0, 4);
  };

  const handleShareQuestions = async () => {
    if (!questions) return;
    triggerVibration(15);
    const shareTitle = `HelpYou AI - Subjective Questions: ${customTopic || stream}`;
    const shareText = `📝 Subjective Practice Questions from HelpYou AI Tutor!\n\nTopic: ${customTopic || stream}\n\n` + 
      questions.map((q, i) => `${i + 1}. ${healGlobalMarkdown(normalizeQuestionBreaks(getQuestionText(q)))}`).join('\n\n');
    await shareTextMobile(shareTitle, shareText);
  };

  const generateQuestionsPDF = (
    customQuestions?: QuestionItem[],
    customTitle?: string,
    customGrade?: string,
    customStream?: string
  ) => {
    const qs = customQuestions || questions;
    if (!qs || qs.length === 0) return null;
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    let currentY = 25;

    const addFooter = (pageNum: number) => {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      
      // Horizontal divider above footer
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
      
      doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text('HelpYou AI • Subjective Practice & Answer Key', pageWidth - margin, pageHeight - 10, { align: 'right' });
    };

    // Header Decorative Bar
    doc.setFillColor(147, 51, 234); // Purple-600 color
    doc.rect(margin, currentY, contentWidth, 3, 'F');
    currentY += 10;

    // Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 30, 30);
    
    const titleText = sanitizePdfText(customTitle || (customTopic && customTopic.trim() ? customTopic.trim() : `${customStream || stream} Practice Set`));
    const wrappedTitle: string[] = doc.splitTextToSize(titleText, contentWidth);
    for (const line of wrappedTitle) {
      if (currentY > pageHeight - 25) {
        doc.addPage();
        currentY = 25;
      }
      doc.text(line, margin, currentY);
      currentY += 8;
    }
    currentY += 2;

    // Meta Info
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.text(`Grade Level: ${customGrade || gradeLevel}  |  Stream: ${customStream || stream}  |  Difficulty: ${difficulty}  |  Date: ${dateStr}`, margin, currentY);
    currentY += 6;

    // Thin separator
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.4);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 12;

    let pageCount = 1;
    addFooter(pageCount);

    // List Questions
    for (let i = 0; i < qs.length; i++) {
      const qItem = qs[i];
      const qText = formatMathAndSuperscripts(sanitizePdfText(healGlobalMarkdown(normalizeQuestionBreaks(getQuestionText(qItem)))));
      const questionText = `${i + 1}. ${qText}`;
      
      // Wrap question text
      const wrappedQuestion: string[] = doc.splitTextToSize(questionText, contentWidth - 5);
      
      // Estimate space
      const questionHeight = wrappedQuestion.length * 6;
      const blankLinesHeight = 15; // 3 lines of 5mm spacing
      const totalBlockHeight = questionHeight + blankLinesHeight + 8;

      if (currentY + totalBlockHeight > pageHeight - 20) {
        doc.addPage();
        pageCount++;
        addFooter(pageCount);
        currentY = 25;
      }

      // Draw question number + text
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(40, 40, 40);

      for (const line of wrappedQuestion) {
        doc.text(line, margin, currentY);
        currentY += 5.5;
      }

      // Draw blank writing lines
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      currentY += 3;
      for (let lineIdx = 0; lineIdx < 3; lineIdx++) {
        doc.line(margin + 5, currentY, pageWidth - margin, currentY);
        currentY += 5.5;
      }
      currentY += 6; // spacing
    }

    // ─────────────────────────────────────────────
    // OFFICIAL ANSWER KEY & DETAILED SOLUTIONS SECTION — starts on a new page at the end of the PDF
    // ─────────────────────────────────────────────
    doc.addPage();
    pageCount++;
    addFooter(pageCount);
    currentY = 25;

    // Header bar
    doc.setFillColor(79, 70, 229); // Indigo-600
    doc.rect(margin, currentY, contentWidth, 3, 'F');
    currentY += 10;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(79, 70, 229);
    doc.text('Official Answer Key & Detailed Solutions', margin, currentY);
    currentY += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Comprehensive model answers, step-by-step solutions, and examiner marking rubrics', margin, currentY);
    currentY += 4;

    doc.setDrawColor(200, 200, 240);
    doc.setLineWidth(0.4);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;

    // Render each question's model answer and rubric criteria
    for (let i = 0; i < qs.length; i++) {
      const qItem = qs[i];
      const qText = getQuestionText(qItem);
      const parsedExpected = getExpectedAnswer(qItem);
      // Ensure rawExpected is NEVER empty: if missing (e.g. from an old saved set), provide an academic solution guide
      const rawExpected = parsedExpected || getFallbackAnswer(qText, customGrade || gradeLevel, customStream || stream);
      const rawRubrics = getKeyRubricPoints(qItem);
      const rubricPoints = rawRubrics.length > 0 ? rawRubrics : [
        "[1 Mark] Accurate conceptual definition, relevant formula, or introductory premise",
        "[2 Marks] Complete step-by-step reasoning, mechanisms, mathematical derivation, or textual analysis",
        "[1 Mark] Final accurate result with units, balanced equation, or synthesised conclusion"
      ];

      // -- Question label
      const qLabelText = formatMathAndSuperscripts(sanitizePdfText(`Q${i + 1}. ${healGlobalMarkdown(normalizeQuestionBreaks(qText))}`));
      const wrappedQLabel: string[] = doc.splitTextToSize(qLabelText, contentWidth - 5);

      if (currentY + wrappedQLabel.length * 5.5 + 25 > pageHeight - 20) {
        doc.addPage();
        pageCount++;
        addFooter(pageCount);
        currentY = 25;
      }

      // Draw question number + text
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(30, 30, 30);
      for (const ql of wrappedQLabel) {
        if (currentY > pageHeight - 20) {
          doc.addPage(); pageCount++; addFooter(pageCount); currentY = 25;
          doc.setFont('Helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        }
        doc.text(ql, margin, currentY);
        currentY += 5.5;
      }
      currentY += 2;

      // Draw Model Solution / Answer (Always guaranteed to be rendered)
      if (rawExpected) {
        if (currentY > pageHeight - 25) {
          doc.addPage(); pageCount++; addFooter(pageCount); currentY = 25;
        }
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(16, 110, 60); // Emerald green for official solution
        doc.text('Official Model Solution & Step-by-Step Answer:', margin + 2, currentY);
        currentY += 5.5;

        const normalizedExpected = rawExpected.replace(/\\n/g, '\n').replace(/\r/g, '');
        const rawParagraphs = normalizedExpected.split('\n');
        for (let p = 0; p < rawParagraphs.length; p++) {
          const rawPara = rawParagraphs[p].trim();
          if (!rawPara) {
            currentY += 2;
            continue;
          }

          // Check for code / diagram block
          if (rawPara.startsWith('```')) {
            const diagramLines: string[] = [];
            p++;
            while (p < rawParagraphs.length && !rawParagraphs[p].trim().startsWith('```')) {
              diagramLines.push(rawParagraphs[p]);
              p++;
            }
            currentY = renderPdfDiagramBlock(doc, diagramLines, currentY, {
              margin: margin + 4,
              contentWidth: contentWidth - 8,
              pageHeight,
              accentColor: [16, 110, 60],
              onPageBreak: () => {
                doc.addPage();
                pageCount++;
                addFooter(pageCount);
              }
            });
            continue;
          }

          // Check for table
          if (isTableLine(rawPara)) {
            const tableLines: string[] = [rawPara];
            while (p + 1 < rawParagraphs.length && (isTableLine(rawParagraphs[p + 1]) || isTableSeparator(rawParagraphs[p + 1]))) {
              p++;
              tableLines.push(rawParagraphs[p]);
            }
            currentY = renderPdfTable(doc, tableLines, currentY, {
              margin: margin + 4,
              contentWidth: contentWidth - 8,
              pageHeight,
              headerBg: [16, 110, 60], // Emerald Green for solutions
              onPageBreak: () => {
                doc.addPage();
                pageCount++;
                addFooter(pageCount);
              }
            });
            continue;
          }

          let trimmedPara = sanitizePdfText(rawPara);
          trimmedPara = formatMathAndSuperscripts(trimmedPara);
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(40, 40, 40);

          const wrappedPara: string[] = doc.splitTextToSize(trimmedPara, contentWidth - 8);
          for (const line of wrappedPara) {
            if (currentY > pageHeight - 20) {
              doc.addPage(); pageCount++; addFooter(pageCount); currentY = 25;
              doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
            }
            doc.text(line, margin + 4, currentY);
            currentY += 4.8;
          }
          currentY += 1.5;
        }
        currentY += 2;
      }

      // Draw Examiner Rubric & Checkpoints
      const rubricLines: string[] = [];
      if (rubricPoints.length > 0) {
        rubricLines.push('Examiner Marking Scheme & Score Breakdown:');
        rubricPoints.forEach(pt => {
          rubricLines.push(`• ${formatMathAndSuperscripts(sanitizePdfText(pt.trim()))}`);
        });
      }

      if (rubricLines.length > 0) {
        for (const line of rubricLines) {
          if (currentY > pageHeight - 20) {
            doc.addPage(); pageCount++; addFooter(pageCount); currentY = 25;
          }
          if (line === '') {
            currentY += 2.5;
            continue;
          }
          const isHeading = line.startsWith('Examiner Marking');
          const isBullet = line.startsWith('•');
          const indent = isBullet ? 6 : (isHeading ? 2 : 4);
          const maxW = contentWidth - indent - 4;

          doc.setFont('Helvetica', isHeading ? 'bold' : 'normal');
          doc.setFontSize(isHeading ? 9.5 : 8.5);
          doc.setTextColor(isHeading ? 79 : 70, isHeading ? 70 : 75, isHeading ? 229 : 90);

          const wrappedLines: string[] = doc.splitTextToSize(line.trim(), maxW);
          for (const wl of wrappedLines) {
            if (currentY > pageHeight - 20) {
              doc.addPage(); pageCount++; addFooter(pageCount); currentY = 25;
              doc.setFont('Helvetica', isHeading ? 'bold' : 'normal');
              doc.setFontSize(isHeading ? 9.5 : 8.5);
              doc.setTextColor(isHeading ? 79 : 70, isHeading ? 70 : 75, isHeading ? 229 : 90);
            }
            doc.text(wl, margin + indent, currentY);
            currentY += 4.8;
          }
        }
      }

      // Divider between questions
      currentY += 4;
      doc.setDrawColor(230, 230, 242);
      doc.setLineWidth(0.25);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 8;
    }

    return doc;
  };

  const handleExportPDF = async (
    customQuestions?: QuestionItem[],
    customTitle?: string,
    customGrade?: string,
    customStream?: string
  ) => {
    const doc = generateQuestionsPDF(customQuestions, customTitle, customGrade, customStream);
    if (!doc) return;
    triggerVibration(15);
    const titleText = customTitle || (customTopic && customTopic.trim() ? customTopic.trim() : `${customStream || stream}_Questions`);
    const filename = `${titleText.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_questions.pdf`;
    
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    
    // Automatically flag this item as a PDF in the feature's history
    if (selectedHistoryItem) {
      await markHistoryItemAsPdf(selectedHistoryItem.id);
    } else if (currentSavedId) {
      await markHistoryItemAsPdf(currentSavedId);
    }

    // Instantly launch the visual PDF reader as fallback/visual confirmation
    setPreviewPdfUri(blobUrl);
    setPreviewPdfName(filename);

    // Direct launch in full screen (new page/tab)
    try {
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error("Popup blocked or window.open failed, fallback to in-app viewer", err);
    }
  };

  const handleSharePDF = async (
    customQuestions?: QuestionItem[],
    customTitle?: string,
    customGrade?: string,
    customStream?: string
  ) => {
    const doc = generateQuestionsPDF(customQuestions, customTitle, customGrade, customStream);
    if (!doc) return;
    triggerVibration(15);
    const titleText = customTitle || (customTopic && customTopic.trim() ? customTopic.trim() : `${customStream || stream}_Questions`);
    const filename = `${titleText.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_questions.pdf`;
    
    const pdfBlob = doc.output('blob');
    const dataUri = doc.output('datauristring');

    // Automatically flag this item as a PDF in the feature's history
    if (selectedHistoryItem) {
      await markHistoryItemAsPdf(selectedHistoryItem.id);
    } else if (currentSavedId) {
      await markHistoryItemAsPdf(currentSavedId);
    }

    // Instantly launch the visual PDF reader
    setPreviewPdfUri(dataUri);
    setPreviewPdfName(filename);

    // Trigger mobile/native share panel
    await sharePDFMobile(pdfBlob, filename);
  };

  useEffect(() => {
    if (selectedHistoryItem && detailViewMode === 'pdf') {
      try {
        const doc = generateQuestionsPDF(
          selectedHistoryItem.questions,
          selectedHistoryItem.topic,
          selectedHistoryItem.gradeLevel,
          selectedHistoryItem.stream
        );
        if (doc) {
          setHistoryPdfUri(doc.output('datauristring'));
        }
      } catch (err) {
        console.error("Failed to generate PDF for selected history item:", err);
      }
    } else {
      setHistoryPdfUri(null);
    }
  }, [selectedHistoryItem, detailViewMode]);

  const handleSelectHistoryItem = (item: SavedSet) => {
    triggerVibration(15);
    setQuestions(item.questions);
    setCustomTopic(item.topic);
    setGradeLevel(item.gradeLevel);
    setStream(item.stream);
    setCurrentSavedId(item.id);
    setShowHistory(false);
    setSelectedHistoryItem(null);

    if (item.isPdf) {
      try {
        const doc = generateQuestionsPDF(item.questions, item.topic, item.gradeLevel, item.stream);
        if (doc) {
          const filename = `${item.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_questions.pdf`;
          const pdfBlob = doc.output('blob');
          const blobUrl = URL.createObjectURL(pdfBlob);
          setPreviewPdfUri(blobUrl);
          setPreviewPdfName(filename);
        }
      } catch (err) {
        console.error("Failed to pre-render history PDF:", err);
      }
    }
  };

  const handleToggleHistory = () => {
    triggerVibration(10);
    if (!showHistory) {
      fetchHistory();
    }
    setShowHistory(!showHistory);
    setSelectedHistoryItem(null);
  };

  if (previewPdfUri) {
    return (
      <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col h-screen w-screen animate-fade-in">
        {/* Top sticky app bar */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-center gap-4 shrink-0">
          <button
            onClick={() => {
              triggerVibration(10);
              setPreviewPdfUri(null);
            }}
            className="w-10 h-10 bg-zinc-850 hover:bg-zinc-800 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer border-none"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-sm text-white truncate">{previewPdfName}</h3>
            <p className="text-[10px] text-zinc-400 font-bold">PDF Reader • Full Screen Mode</p>
          </div>
        </div>
        {/* Preview Content */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          <SafePdfViewer pdfUrlOrBase64={previewPdfUri} />
        </div>
        {/* Bottom Action bar */}
        <div className="bg-zinc-950 p-4 border-t border-zinc-900 flex shrink-0 z-10">
          <button
            onClick={async () => {
              triggerVibration(15);
              try {
                const response = await fetch(previewPdfUri);
                const blob = await response.blob();
                await sharePDFMobile(blob, previewPdfName);
              } catch (err) {
                console.error("Error sharing PDF:", err);
              }
            }}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 border-none"
          >
            <Share2 className="w-4 h-4 text-white" />
            <span>SHARE DOCUMENT</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[500px] flex flex-col text-zinc-900 bg-[#FAF9F6] font-sans relative">
      
      {/* Dynamic Header */}
      <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-5 pb-3.5 px-6 z-20 border-b border-zinc-200/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            onClick={handleHeaderBack}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
            aria-label="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight text-zinc-900 line-clamp-1">
              <HelpCircle className="w-5 h-5 text-purple-600 mr-2 shrink-0" />
              <span className="truncate">AI Subjective Questions</span>
            </h2>
          </div>
        </div>
        <button
          onClick={handleToggleHistory}
          className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all cursor-pointer shrink-0 active:scale-95 ${
            showHistory 
              ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20' 
              : 'bg-white text-zinc-700 border-zinc-200/60 hover:text-purple-600 shadow-sm'
          }`}
          title="History Log"
          aria-label="History Log"
        >
          <History className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-36 max-w-xl mx-auto w-full space-y-6">
        <AnimatePresence mode="wait">
          
          {/* HISTORY LOG SECTION */}
          {showHistory ? (
            <motion.div
              key="history-panel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-lg text-zinc-900 tracking-tight flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-600" /> Saved Question Sets
                </h3>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="text-xs font-bold text-purple-600 hover:underline cursor-pointer"
                >
                  Close History
                </button>
              </div>

              {/* LIST OF HISTORY ITEMS */}
              <div className="space-y-3">
                {loadingHistory ? (
                  <AdvancedLoader type="skeleton" skeletonType="list" count={3} />
                ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
                  <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500">
                    <HelpCircle className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                    <h4 className="font-extrabold text-sm text-zinc-800">No practice sets found</h4>
                    <p className="text-xs text-zinc-450 mt-1 leading-relaxed">
                      Once you generate subjective questions, they will be saved here automatically for offline review!
                    </p>
                  </div>
                ) : (
                  (historyItems || []).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      className="bg-white border border-zinc-200/80 hover:border-purple-300 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all shadow-sm group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 text-left">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          item.isPdf 
                            ? 'bg-red-50 text-red-600' 
                            : 'bg-purple-50 text-purple-600'
                        }`}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-sm text-zinc-900 truncate group-hover:text-purple-700">
                            {item.topic}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-zinc-500 font-bold">
                              {item.count} Questions • {item.createdAt.toLocaleDateString()}
                            </p>
                            {item.isPdf ? (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide flex items-center gap-0.5">
                                <span>📄</span> PDF
                              </span>
                            ) : (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wide flex items-center gap-0.5">
                                <span>📝</span> Standard
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => deleteHistoryItem(item.id, e)}
                          className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-red-50 text-zinc-400 hover:text-red-500 flex items-center justify-center transition-colors"
                          title="Delete practice set"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-zinc-450 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          ) : loading ? (
            
            // PREMIUM ADVANCED LOADER WITH GLOWING ORB & ENGAGING FEEDBACK
            <motion.div
              key="loading-panel"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white border border-zinc-200/80 rounded-[2.5rem] p-8 text-center shadow-xl space-y-6 overflow-hidden relative"
            >
              <div className="absolute w-48 h-48 rounded-full bg-purple-500/5 blur-[80px] pointer-events-none top-0 left-1/2 -translate-x-1/2" />
              
              <AdvancedLoader type="orb" context="questions" />

              {/* Progress Bar Container */}
              <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden border border-zinc-200/40">
                <motion.div 
                  className="bg-gradient-to-r from-purple-500 to-cyan-500 h-full"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>

              {/* Current Stage Indicator */}
              <div className="text-[10px] uppercase font-black tracking-wider text-purple-600 dark:text-purple-400">
                System Progress: {loadingProgress}% Completed
              </div>
            </motion.div>

          ) : questions ? (
            
            // QUESTIONS GENERATED VIEW
            <motion.div
              key="questions-list-panel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              
              {/* Output Header Status Card */}
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-[2rem] p-6 shadow-md text-left flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full text-white">
                      PRACTICE MODE • QUESTIONS ONLY
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full text-white ${
                      difficulty === 'Easy' ? 'bg-emerald-500/80' : difficulty === 'Hard' ? 'bg-rose-500/80' : 'bg-amber-500/80'
                    }`}>
                      {difficulty}
                    </span>
                  </div>
                  <h3 className="font-black text-lg tracking-tight">
                    {customTopic ? customTopic : `${stream} Set`}
                  </h3>
                  <p className="text-xs text-white/80 font-bold">{questions.length} Practice Questions</p>
                </div>
                <div className="text-4xl opacity-20 absolute right-4 bottom-2 font-bold select-none">
                  ✍️
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div>
                <button
                  onClick={handleShareQuestions}
                  className="w-full bg-white border border-zinc-200 text-zinc-800 font-extrabold text-xs py-3.5 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 active:scale-98 hover:bg-zinc-50"
                >
                  <Share2 className="w-4 h-4 text-purple-600" /> Share Questions
                </button>
              </div>

              {/* Questions Stack */}
              <div className="space-y-5">
                {questions.map((question, index) => {
                  const qText = getQuestionText(question);
                  const rubricPoints = getKeyRubricPoints(question);

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-5 text-left space-y-4"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-purple-600 font-black bg-purple-50 w-6 h-6 rounded-full inline-flex items-center justify-center text-xs shadow-inner shrink-0">
                              {index + 1}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700">
                              Subjective Practice Question
                            </span>
                          </div>
                          <div className="font-medium text-sm sm:text-base text-zinc-900 leading-relaxed space-y-2 select-text">
                            <GlobalMarkdown>
                              {healGlobalMarkdown(normalizeQuestionBreaks(qText))}
                            </GlobalMarkdown>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            triggerVibration(15);
                            setReportSnippet(`Question ${index + 1}: ${qText}`);
                            setReportModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex items-center gap-1 text-[10px] font-bold active:scale-95 cursor-pointer shrink-0"
                          title="Report Inaccurate or Inappropriate Content"
                        >
                          <Flag className="w-3.5 h-3.5 text-rose-500" />
                          <span className="hidden sm:inline">Report</span>
                        </button>
                      </div>

                      {/* Expandable practice answer draft box */}
                      <div className="space-y-2 pt-2 border-t border-zinc-100">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <PenTool className="w-3 h-3 text-zinc-400" /> Your Draft Response
                          </label>
                          {draftAnswers[index]?.trim() && (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Draft Saved
                            </span>
                          )}
                        </div>

                        {/* Separate hidden inputs for Camera and Gallery */}
                        <input 
                          type="file" 
                          ref={(el) => { galleryInputRefs.current[index] = el; }} 
                          onChange={(e) => { 
                            const file = e.target.files?.[0]; 
                            if (file) handleUploadAndTranscribe(index, file); 
                          }} 
                          accept="image/*" 
                          className="hidden" 
                        />
                        <input 
                          type="file" 
                          ref={(el) => { cameraInputRefs.current[index] = el; }} 
                          onChange={(e) => { 
                            const file = e.target.files?.[0]; 
                            if (file) handleUploadAndTranscribe(index, file); 
                          }} 
                          accept="image/*" 
                          capture="environment"
                          className="hidden" 
                        />

                        <div className="flex items-center gap-2 bg-[#FCFBF9] border border-zinc-200 rounded-2xl p-1.5 focus-within:ring-1 focus-within:ring-purple-400 focus-within:bg-white transition-all">
                          <div className="relative">
                            {uploadedAnswerFiles[index] ? (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerVibration(10);
                                  setUploadedAnswerFiles(prev => {
                                    const updated = { ...prev };
                                    delete updated[index];
                                    return updated;
                                  });
                                  setDraftAnswers(prev => {
                                    const updated = { ...prev };
                                    if (updated[index] === "[Handwritten Answer Image Attached 📷]") {
                                      delete updated[index];
                                    }
                                    return updated;
                                  });
                                }}
                                disabled={evaluatingIndex === index}
                                className="w-9 h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-600 flex items-center justify-center transition-all shrink-0 cursor-pointer active:scale-95 disabled:opacity-50 border-none p-1 group relative"
                                title="Click to remove uploaded image"
                              >
                                <img
                                  src={URL.createObjectURL(uploadedAnswerFiles[index])}
                                  alt="Uploaded preview"
                                  className="w-full h-full object-cover rounded-lg"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <X className="w-4 h-4 text-white" />
                                </div>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerVibration(10);
                                  setOpenMediaMenuIndex(openMediaMenuIndex === index ? null : index);
                                }}
                                disabled={evaluatingIndex === index}
                                className="w-9 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-all shrink-0 cursor-pointer active:scale-95 disabled:opacity-50 border-none animate-none"
                                title="Choose upload method"
                              >
                                <Plus className="w-4 h-4 text-purple-600" />
                              </button>
                            )}

                            {openMediaMenuIndex === index && (
                              <>
                                {/* Overlay/Backdrop to close the menu on tap outside */}
                                <div 
                                  className="fixed inset-0 z-30" 
                                  onClick={() => setOpenMediaMenuIndex(null)}
                                />
                                
                                {/* Menu options card */}
                                <div className="absolute bottom-11 left-0 z-40 min-w-[140px] bg-white border border-zinc-250 rounded-2xl shadow-xl py-1.5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      triggerVibration(10);
                                      setOpenMediaMenuIndex(null);
                                      setTimeout(() => {
                                        cameraInputRefs.current[index]?.click();
                                      }, 50);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 border-none bg-transparent cursor-pointer"
                                  >
                                    <Camera className="w-4 h-4 text-purple-600" />
                                    <span>Camera</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      triggerVibration(10);
                                      setOpenMediaMenuIndex(null);
                                      setTimeout(() => {
                                        galleryInputRefs.current[index]?.click();
                                      }, 50);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 border-none bg-transparent cursor-pointer"
                                  >
                                    <Image className="w-4 h-4 text-purple-600" />
                                    <span>Gallery</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          <textarea
                            rows={2}
                            value={draftAnswers[index] || ''}
                            onChange={(e) => handleUpdateAnswers(index, e.target.value)}
                            placeholder="Type your response or upload a handwritten answer photo..."
                            disabled={evaluatingIndex === index}
                            className="flex-1 min-h-[36px] max-h-[120px] bg-transparent text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none resize-none py-2 px-1 leading-relaxed"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if ((draftAnswers[index]?.trim() || uploadedAnswerFiles[index]) && evaluatingIndex !== index) {
                                  handleEvaluateAnswer(qText, index);
                                }
                              }
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => handleEvaluateAnswer(qText, index)}
                            disabled={evaluatingIndex === index || (!draftAnswers[index]?.trim() && !uploadedAnswerFiles[index])}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 border-none ${
                              (draftAnswers[index]?.trim() || uploadedAnswerFiles[index]) && evaluatingIndex !== index
                                ? 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer active:scale-95' 
                                : 'bg-zinc-150 text-zinc-400 cursor-not-allowed'
                            }`}
                            title="Submit answer for strict Step-Marking"
                          >
                            {evaluatingIndex === index ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {transcribingIndices[index] && (
                          <div className="text-[10px] text-purple-600 font-bold animate-pulse flex items-center gap-1 mt-1 pl-2">
                            <Sparkles className="w-3 h-3 text-amber-500 animate-spin" />
                            Transcribing handwritten answer...
                          </div>
                        )}

                        {evaluations[index] && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-3 bg-purple-50/60 border border-purple-100 rounded-2xl p-4 text-left space-y-2 relative shadow-inner overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 p-3 pointer-events-none opacity-10">
                              <Sparkles className="w-16 h-16 text-purple-600" />
                            </div>
                            
                            <div className="flex items-center gap-1.5 border-b border-purple-100/80 pb-2 mb-2">
                              <span className="p-1 rounded-lg bg-purple-100 text-purple-700">
                                <Sparkles className="w-3.5 h-3.5" />
                              </span>
                              <h5 className="font-black text-[11px] text-purple-900 uppercase tracking-wide">
                                Magic Tutor Step-Marking Evaluation
                              </h5>
                            </div>
                            
                            <div className="prose prose-purple max-w-none text-zinc-850 text-xs leading-relaxed">
                              <GlobalMarkdown>{evaluations[index]}</GlobalMarkdown>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Action and Success toast */}
              <AnimatePresence>
                {savedSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-zinc-900 text-white text-xs font-bold py-3.5 px-6 rounded-2xl shadow-xl flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 
                    Practice Set automatically saved to Library history log!
                  </motion.div>
                )}
              </AnimatePresence>

              {/* PDF Export Actions */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleExportPDF()}
                  className="flex-1 bg-white border border-zinc-200 text-zinc-850 font-black text-xs py-3.5 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 hover:bg-zinc-50"
                >
                  <FileText className="w-4 h-4 text-purple-600" /> View PDF
                </button>
                <button
                  onClick={() => handleSharePDF()}
                  className="flex-1 bg-white border border-zinc-200 text-zinc-850 font-black text-xs py-3.5 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 hover:bg-zinc-50"
                >
                  <Share2 className="w-4 h-4 text-purple-600" /> Share PDF
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-purple-800 bg-purple-50/80 border border-purple-200/70 py-2 px-3 rounded-xl shadow-2xs text-center">
                <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Includes Answer Key</span>
              </div>

              {/* Report AI Questions Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(15);
                    const textToReport = questions ? questions.map((q, idx) => `Question ${idx + 1}: ${getQuestionText(q)}`).join('\n\n') : '';
                    setReportSnippet(textToReport);
                    setReportModalOpen(true);
                  }}
                  className="w-full py-3 px-4 rounded-2xl font-bold text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 shadow-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer"
                  title="Report Inaccurate or Inappropriate Content"
                >
                  <Flag className="w-3.5 h-3.5 text-rose-500" />
                  <span>Report AI Questions</span>
                </button>
              </div>

              {/* Generate New Button */}
              <div className="pt-4 pb-4">
                <button
                  onClick={() => {
                    triggerVibration(10);
                    setQuestions(null);
                  }}
                  className="w-full py-4 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all active:scale-98"
                >
                  Generate Another Set
                </button>
              </div>

            </motion.div>

          ) : (
            
            // CONFIGURATION INPUT SCREEN (CARD FOR HOW MANY QUESTIONS & TOPIC)
            <motion.div
              key="setup-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              
                            {/* CARD: SPECIFY TOPIC / INQUIRY FIELD */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm text-left space-y-4">
                <div>
                  <h3 className="font-black text-sm text-zinc-900 tracking-tight flex items-center gap-1.5">
                    <span className="text-purple-600 text-lg">🎯</span> Target Subject / Topic
                  </h3>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="e.g. Mitochondria, OOP Polymorphism, Supply Shock..."
                    className="w-full bg-zinc-50 hover:bg-zinc-100/55 focus:bg-white border border-zinc-200 rounded-2xl py-4 pl-4 pr-12 text-xs text-zinc-800 placeholder-zinc-400 font-semibold focus:outline-none focus:ring-1 focus:ring-purple-400 transition-all shadow-inner"
                  />
                  {customTopic && (
                    <button
                      onClick={() => setCustomTopic('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center text-[10px] font-black cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* USER'S EXAM SUBJECTS & CHAPTERS/UNITS SELECTOR */}
                <div className="pt-3 border-t border-zinc-100">
                  <div className="flex items-center justify-between mb-3 px-0.5">
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                      Your Exam Subjects & Chapters
                    </h3>
                    {syllabusResearchState === 'researching' && (
                      <span className="text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                        <Sparkles className="w-2.5 h-2.5 animate-spin text-purple-600" />
                        AI Verifying Syllabus...
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const isLaterSubjectActive = mergedSubjects.slice(5).some(
                        s => s.id === expandedSubject || (customTopic && (s.topics || []).some(t => customTopic.toLowerCase() === t.toLowerCase()) || customTopic === s.title)
                      );
                      const shouldShowAll = showAllSubjects || isLaterSubjectActive || mergedSubjects.length <= 5;
                      const visibleSubjects = shouldShowAll ? mergedSubjects : mergedSubjects.slice(0, 5);

                      return (
                        <>
                          {visibleSubjects.map((subject) => {
                      const isExpanded = expandedSubject === subject.id;
                      const hasActiveTopic = customTopic && (subject.topics || []).some(t => customTopic.toLowerCase() === t.toLowerCase());

                      return (
                        <div
                          key={subject.id}
                          className={`bg-white border rounded-3xl overflow-hidden shadow-sm transition-all duration-300 ${
                            hasActiveTopic || customTopic === subject.title
                              ? 'border-purple-300 ring-1 ring-purple-200 shadow-md'
                              : 'border-zinc-200/80 hover:border-zinc-300'
                          }`}
                        >
                          {/* Main Subject Card Header - Identical to AI Quizzes */}
                          <button
                            type="button"
                            onClick={() => {
                              triggerVibration(10);
                              setExpandedSubject(prev => prev === subject.id ? null : subject.id);
                            }}
                            className={`w-full p-4 flex items-center justify-between text-left transition-colors duration-300 cursor-pointer ${
                              isExpanded ? 'bg-zinc-50/50' : 'hover:bg-zinc-50/40'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 shadow-sm ${subject.themeColor || 'bg-purple-100 text-purple-700'}`}>
                                {subject.icon || '📚'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="font-extrabold text-xs sm:text-sm text-zinc-800 leading-snug break-words">
                                  {subject.title}
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

                          {/* Collapsible Sub-topics List - Clean and Styled like AI Quizzes */}
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
                                  {/* Individual Chapters / Units with 2-Tier Sub-Topics Drawer */}
                                  {(subject.topics || []).map((topicItem, idx) => {
                                    const cleanSubj = cleanSubjectTitle(subject.title);
                                    const chapterKey = `${cleanSubj}__${topicItem}`;
                                    const isChapterOpen = expandedChapter === chapterKey;
                                    const subTopicsList = (subject.chapterSubTopics && subject.chapterSubTopics[topicItem]) || [];
                                    const topicTargetStr = `${cleanSubj} - ${topicItem}`;
                                    const isSelected = customTopic === topicItem || customTopic === topicTargetStr || (customTopic || '').startsWith(`${topicTargetStr} - `);

                                    return (
                                      <div key={idx} className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs transition-all">
                                        {/* Chapter Header */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            triggerVibration(10);
                                            setExpandedChapter(isChapterOpen ? null : chapterKey);
                                          }}
                                          className={`w-full py-2.5 px-3 flex items-center justify-between text-left transition-all cursor-pointer ${
                                            isChapterOpen ? 'bg-purple-50/40 border-b border-purple-100' : 'hover:bg-zinc-50'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md shrink-0 border ${
                                              isSelected
                                                ? 'text-white bg-purple-600 border-purple-600'
                                                : 'text-purple-600 bg-purple-50 border-purple-100'
                                            }`}>
                                              CH {String(idx + 1).padStart(2, '0')}
                                            </span>
                                            <span className={`text-xs leading-snug break-words flex-1 ${
                                              isSelected ? 'font-black text-purple-950' : 'font-bold text-zinc-800'
                                            }`}>
                                              {topicItem}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0 ml-2">
                                            <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                                              {subTopicsList.length} Units
                                            </span>
                                            {isChapterOpen ? (
                                              <ChevronUp className="w-3.5 h-3.5 text-purple-600" />
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
                                              {/* Quick Option: Full Chapter Questions */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  triggerVibration(15);
                                                  setCustomTopic(topicTargetStr);
                                                }}
                                                className={`w-full py-2 px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer shadow-xs border ${
                                                  customTopic === topicTargetStr
                                                    ? 'bg-purple-600 text-white border-purple-600'
                                                    : 'bg-gradient-to-r from-purple-50/80 to-indigo-50/80 border-purple-200/90 hover:border-purple-400'
                                                }`}
                                              >
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs">🎯</span>
                                                  <span className={`text-xs font-black ${customTopic === topicTargetStr ? 'text-white' : 'text-purple-700'}`}>
                                                    Practice Entire Chapter
                                                  </span>
                                                </div>
                                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                                                  customTopic === topicTargetStr ? 'bg-purple-700 text-white border-purple-700' : 'bg-white text-purple-600 border-purple-100 shadow-2xs'
                                                }`}>
                                                  All Questions
                                                </span>
                                              </button>

                                              {/* Sub-Topics Pills */}
                                              <div className="grid grid-cols-1 gap-1.5 pt-1">
                                                {subTopicsList.map((sub, sIdx) => {
                                                  const subTarget = `${topicTargetStr} - ${sub}`;
                                                  const isSubSelected = customTopic === subTarget;
                                                  const verifiedCustoms = getVerifiedChapterSubTopics(topicTargetStr, topicItem);
                                                  const isUserAdded = verifiedCustoms.some(vc => vc.toLowerCase().trim() === sub.toLowerCase().trim());

                                                  return (
                                                    <div
                                                      key={sIdx}
                                                      className={`w-full py-1.5 px-3 rounded-xl flex items-center justify-between text-left transition-all shadow-2xs border gap-2 ${
                                                        isSubSelected
                                                          ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500/20'
                                                          : 'bg-white border-zinc-200/70 hover:bg-purple-50/40 hover:border-purple-200'
                                                      }`}
                                                    >
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          triggerVibration(15);
                                                          setCustomTopic(subTarget);
                                                        }}
                                                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                                                      >
                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                        <span className={`text-xs truncate ${isSubSelected ? 'font-bold text-purple-900' : 'font-medium text-zinc-700'}`}>
                                                          {sub}
                                                        </span>
                                                      </button>
                                                      <div className="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            triggerVibration(15);
                                                            setCustomTopic(subTarget);
                                                          }}
                                                          className="text-[10px] font-bold text-purple-600 bg-purple-50/80 hover:bg-purple-100 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                                                        >
                                                          Select
                                                        </button>
                                                        {isUserAdded && (
                                                          <button
                                                            type="button"
                                                            title="Remove subtopic"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              triggerVibration(20);
                                                              removeCustomChapterSubTopic(topicTargetStr, topicItem, sub);
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

                                              {/* Custom Micro-Topic Input (User's Favorite Feature) */}
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
                                                            const check = await verifySubTopicWithAI(topicTargetStr, topicItem, val, targetExam, country);
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
                                                            registerVerifiedChapterSubTopic(topicTargetStr, topicItem, finalTitle);
                                                            setCustomTopic(`${topicTargetStr} - ${finalTitle}`);
                                                          }
                                                        }}
                                                        className={`flex-1 text-xs px-3 py-2 border rounded-xl bg-white focus:outline-none focus:ring-1 text-zinc-800 ${
                                                          customInputError[chapterKey]
                                                            ? 'border-rose-400 focus:ring-rose-500'
                                                            : 'border-purple-300 focus:ring-purple-500'
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
                                                          const check = await verifySubTopicWithAI(topicTargetStr, topicItem, val, targetExam, country);
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
                                                          registerVerifiedChapterSubTopic(topicTargetStr, topicItem, finalTitle);
                                                          setCustomTopic(`${topicTargetStr} - ${finalTitle}`);
                                                        }}
                                                        className="px-3 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 transition-all shrink-0 cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                                                      >
                                                        {isVerifyingSubTopic[chapterKey] ? (
                                                          <>
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            <span>Verifying...</span>
                                                          </>
                                                        ) : (
                                                          <span>Apply</span>
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
                                                    className="w-full border border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/20 hover:bg-purple-50/50 py-1.5 px-3 rounded-xl text-center text-xs font-bold text-purple-600 transition-all cursor-pointer flex items-center justify-center gap-1.5"
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
                                  <ChevronDown className="w-4 h-4 text-purple-600" />
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
              </div>

              {/* CARD: HOW MANY QUESTIONS SELECTOR */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm text-left space-y-4">
                <div>
                  <h3 className="font-black text-sm text-zinc-900 tracking-tight flex items-center gap-1.5">
                    <span className="text-purple-600 text-lg">📊</span> How many questions?
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {[5, 10, 15].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        triggerVibration(10);
                        setQuestionCount(num);
                      }}
                      className={`py-3.5 rounded-2xl border font-black text-xs transition-all cursor-pointer ${
                        questionCount === num
                          ? 'bg-purple-600 border-purple-600 text-white shadow-md'
                          : 'bg-zinc-50 border-zinc-200/60 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                      }`}
                    >
                      {num} Qs
                    </button>
                  ))}
                </div>
              </div>

              {/* CARD: DIFFICULTY LEVEL SELECTOR */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm text-left space-y-4">
                <div>
                  <h3 className="font-black text-sm text-zinc-900 tracking-tight flex items-center gap-1.5">
                    <span className="text-purple-600 text-lg">⚡</span> Difficulty Level
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {(['Easy', 'Medium', 'Hard'] as const).map((lvl) => {
                    const isSelected = difficulty === lvl;
                    const colors = {
                      Easy: { active: 'bg-emerald-600 border-emerald-600 text-white shadow-md', dot: '🟢' },
                      Medium: { active: 'bg-amber-500 border-amber-500 text-white shadow-md', dot: '🟡' },
                      Hard: { active: 'bg-rose-600 border-rose-600 text-white shadow-md', dot: '🔴' }
                    }[lvl];

                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setDifficulty(lvl);
                        }}
                        className={`py-3.5 rounded-2xl border font-black text-xs transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? colors.active
                            : 'bg-zinc-50 border-zinc-200/60 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                        }`}
                      >
                        <span className="text-xs">{colors.dot}</span>
                        <span>{lvl}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 px-5 py-4 rounded-2xl text-xs font-bold text-left leading-relaxed">
                  ⚠️ Generation Error: {error}
                </div>
              )}

              {/* CARD: GENERATION BUTTON */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] p-4 sm:p-5 shadow-sm">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="w-full py-4.5 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                  Generate Questions
                </button>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Google Play GenAI Safety Report Modal */}
      <ReportAIModal
        isOpen={reportModalOpen}
        messageText={reportSnippet}
        sourceFeature="Question Generator"
        onClose={() => {
          setReportModalOpen(false);
          setReportSnippet('');
        }}
      />
    </div>
  );
}
