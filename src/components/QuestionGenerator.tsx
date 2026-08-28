import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, HelpCircle, Loader2, Copy, Check, Share2, 
  Sparkles, BookOpen, GraduationCap, Clock, FileText, 
  ChevronRight, Save, History, Trash2, Send, PenTool, CheckCircle2,
  RefreshCw, ExternalLink, Camera, Plus, Image, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { deductCoins, getCoins, isUserLoggedIn, isProUser } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { REGIONAL_TRACKS } from './AcademicSetup';
import jsPDF from 'jspdf';
import { savePDFMobile, sharePDFMobile } from '../utils/mobileSaver';
import SafePdfViewer from './SafePdfViewer';
import AdvancedLoader from './AdvancedLoader';
import GlobalMarkdown from './GlobalMarkdown';
import { getApiUrl } from '../utils/api';

interface QuestionGeneratorProps {
  onBack: () => void;
  onNavigateToTab?: (tab: string) => void;
}

interface SavedSet {
  id: string;
  topic: string;
  count: number;
  gradeLevel: string;
  stream: string;
  questions: string[];
  userAnswers?: Record<number, string>;
  createdAt: Date;
  isPdf?: boolean;
}

const TOPIC_POOLS: Record<string, string[]> = {
  computer: [
    "OOP Polymorphism", "Binary Search Trees", "Recursion Depth", "Time Complexity O(N)",
    "Dijkstra's Algorithm", "Merge Sort Efficiency", "REST API Design", "Neural Network Layers",
    "Relational Database Joins", "Graph Breadth-First Search", "Hash Map Collisions", "SQL Query Optimization",
    "Git Version Branching", "Cybersecurity Cryptography", "Lambda Functions", "Asynchronous Event Loops"
  ],
  science: [
    "Photosynthesis Light Cycles", "Mitochondria ATP Synthesis", "DNA Replication Enzymes", "Mitosis Phase Regulators",
    "Action Potential Steps", "Enzyme Inhibition kinetics", "Endocrine Hormone Loops", "Cardiovascular Pressure",
    "Renal Filtration System", "Immune Lymphocyte Defense", "Glycolysis Pathways", "Genetic Pedigree Analysis",
    "Pulmonary Gas Exchange", "Cell Membrane Transport"
  ],
  business: [
    "Inflation & Interest Rates", "Perfect Competition Models", "Asset-Liability Balancing", "Monopoly Deadweight Loss",
    "Marginal Cost curves", "Supply & Demand Shifts", "Fiscal vs Monetary Policy", "Stock Portfolio Risk",
    "Market Elasticity Types", "Corporate Mergers strategy", "Behavioral Finance biases", "Cryptocurrency Economics",
    "Opportunity Cost Decisions", "Game Theory Nash Equilibrium"
  ],
  stem: [
    "Newton's Second Law", "Integration by Parts", "Vector Force Equilibrium", "Hooke's Law & Oscillators",
    "Kinematic Equations motion", "Thermodynamics Entropy", "Maxwell's Equations basics", "Organic Chemistry Isomers",
    "Trigonometric Identities", "Differential Equations", "Electric Flux & Gauss Law", "Fluid Dynamics Bernoulli",
    "Linear Algebra Matrices", "Projectile Motion Physics"
  ],
  humanities: [
    "Industrial Revolution Impact", "French Revolution Causes", "Shakespearean Sonnets theme", "Cold War Proxy Conflicts",
    "Judicial Review doctrine", "Magna Carta Significance", "Literary Symbolism motifs", "Socratic Dialogue method",
    "Globalization Pros & Cons", "Ancient Greek Philosophy", "Renaissance Humanism", "World War Treaty of Versailles"
  ],
  default: [
    "Quantum Mechanics Basics", "Climate Change Science", "Critical Thinking Skills", "Effective Public Speaking",
    "AI Ethics & Future", "Space Exploration History", "Renaissance Art Movement", "Cognitive Psychology",
    "Sustainable Energy Types", "Principles of Logic"
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
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState<string>('');
  const [customTopic, setCustomTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<string[] | null>(null);
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
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // History Tab & State
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<SavedSet[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<SavedSet | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<'pdf' | 'questions'>('pdf');
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [historyPdfUri, setHistoryPdfUri] = useState<string | null>(null);

  const [isPro, setIsPro] = useState(() => isProUser());

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
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

  // Load profile from local storage / context
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const savedGrade = safeGetItem('academic_grade') || (uid ? safeGetItem(`academic_grade_${uid}`) : null);
    const savedStream = safeGetItem('academic_stream') || (uid ? safeGetItem(`academic_stream_${uid}`) : null);
    const savedCountry = safeGetItem('academic_country') || (uid ? safeGetItem(`academic_country_${uid}`) : null);

    if (savedGrade) setGradeLevel(savedGrade);
    if (savedStream) setStream(savedStream);
    if (savedCountry) setCountry(savedCountry);
  }, []);

  // Suggestions states and auto-refresh logic
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getPoolKey = (streamStr: string) => {
    const s = streamStr.toLowerCase();
    if (s.includes('computer') || s.includes('software')) return 'computer';
    if (s.includes('pre-med') || s.includes('science') || s.includes('medicine') || s.includes('health') || s.includes('biology')) return 'science';
    if (s.includes('business') || s.includes('economics') || s.includes('commerce') || s.includes('finance')) return 'business';
    if (s.includes('stem') || s.includes('engineering') || s.includes('math') || s.includes('calculus')) return 'stem';
    if (s.includes('humanities') || s.includes('liberal') || s.includes('history') || s.includes('social') || s.includes('literature')) return 'humanities';
    return 'default';
  };

  const refreshSuggestions = () => {
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

  // Loading animation variables
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = [
    "Preparing questions...",
    "Selecting relevant curriculum areas...",
    "Calibrating open-ended difficulty level...",
    "Drafting high-yield subjective practice prompts...",
    "Double-checking to ensure NO answers are generated...",
    "Polishing question phrasing for maximum clarity..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && !questions) {
      setLoadingProgress(0);
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 98) {
            clearInterval(interval);
            return 98;
          }
          const increment = Math.floor(Math.random() * 8) + 4;
          const nextVal = Math.min(prev + increment, 98);
          const stepIndex = Math.min(Math.floor(nextVal / 17), loadingSteps.length - 1);
          setLoadingStep(stepIndex);
          return nextVal;
        });
      }, 300);
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

  const saveToHistory = async (generatedQuestions: string[], answers: Record<number, string> = {}) => {
    const topicLabel = customTopic.trim() || `Profile ${stream} Practice`;
    const uid = auth.currentUser?.uid;
    
    const payload = {
      topic: topicLabel,
      count: questionCount,
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
      const response = await fetch(getApiUrl('/api/generate-questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic: customTopic, 
          count: questionCount, 
          gradeLevel, 
          stream 
        })
      });

      if (!response.ok) {
        const text = await response.text();
        let errMsg = "Failed to generate questions";
        try {
          errMsg = JSON.parse(text).error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        // Deduct 2 coins now that the output has been successfully generated by the AI
        deductCoins(2, "AI Subjective Questions");

        setQuestions(data.questions);
        // Automatically save the set to history
        await saveToHistory(data.questions);
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

    const uid = auth.currentUser?.uid;
    const userGrade = gradeLevel || '11th Grade (Junior)';
    const curriculum = safeGetItem('academic_region') || (uid ? safeGetItem(`academic_region_${uid}`) : null) || 'National Board';
    const subject = customTopic || stream || 'General Academic';

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
    // Look up stream in regional tracks or default suggestions
    const matchedTrack = REGIONAL_TRACKS[country]?.find(t => t.id === stream);
    if (matchedTrack) {
      if (stream.includes('Computer Science')) {
        return ["OOP Polymorphism", "Binary Search Trees", "Recursion Depth", "Time Complexity O(N)"];
      }
      if (stream.includes('Pre-Med') || stream.includes('Science')) {
        return ["Photosynthesis Light Cycles", "Mitochondria ATP Synthesis", "DNA Replication Enzymes", "Mitosis Phase Regulators"];
      }
      if (stream.includes('Business') || stream.includes('Economics')) {
        return ["Inflation & Interest Rates", "Perfect Competition Models", "Asset-Liability Balancing", "Monopoly Deadweight Loss"];
      }
      if (stream.includes('STEM') || stream.includes('Engineering')) {
        return ["Newton's Second Law", "Integration by Parts", "Vector Force Equilibrium", "Hooke's Law & Oscillators"];
      }
    }
    return ["Quantum Mechanics Basics", "Industrial Revolution Impact", "Cognitive Dissonance Theory", "Plate Tectonics & Seismic Waves"];
  };

  const handleCopyQuestion = (text: string, index: number) => {
    triggerVibration(10);
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = () => {
    if (!questions) return;
    triggerVibration(10);
    const textToCopy = questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleShareQuestions = () => {
    if (!questions) return;
    triggerVibration(15);
    const shareText = `📝 Try these Subjective Practice Questions from HelpYou AI Tutor!\n\nTopic: ${customTopic || stream}\n\n` + 
      questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n');
    
    if (navigator.share) {
      navigator.share({
        title: 'HelpYou AI - Subjective Questions',
        text: shareText,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareText);
      alert("Share content copied to clipboard!");
    }
  };

  const generateQuestionsPDF = (
    customQuestions?: string[],
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
      doc.text('Magic AI Tutor • Subjective Practice', pageWidth - margin, pageHeight - 10, { align: 'right' });
    };

    // Header Decorative Bar
    doc.setFillColor(147, 51, 234); // Purple-600 color
    doc.rect(margin, currentY, contentWidth, 3, 'F');
    currentY += 10;

    // Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    
    const titleText = customTitle || (customTopic && customTopic.trim() ? customTopic.trim() : `${customStream || stream} Practice Set`);
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
    doc.text(`Grade Level: ${customGrade || gradeLevel}  |  Stream: ${customStream || stream}  |  Date: ${dateStr}`, margin, currentY);
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
      const questionText = `${i + 1}. ${qs[i]}`;
      
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

      // Draw question
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);

      for (const line of wrappedQuestion) {
        doc.text(line, margin, currentY);
        currentY += 6;
      }

      // Draw blank writing lines
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      currentY += 3;
      for (let lineIdx = 0; lineIdx < 3; lineIdx++) {
        doc.line(margin + 5, currentY, pageWidth - margin, currentY);
        currentY += 6;
      }
      currentY += 6; // spacing
    }

    return doc;
  };

  const handleExportPDF = async (
    customQuestions?: string[],
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
    customQuestions?: string[],
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
      <div className="px-6 py-5 flex items-center justify-between border-b border-zinc-200/40 bg-[#FAF9F6]/80 backdrop-blur-md sticky top-0 z-20">
        <button
          onClick={handleHeaderBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-sm active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Magic AI Tutor
          </span>
          <h2 className="font-black text-sm text-zinc-900">AI Subjective Questions</h2>
        </div>
        <button
          onClick={handleToggleHistory}
          className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
            showHistory 
              ? 'bg-purple-600 text-white border-purple-600' 
              : 'bg-white text-zinc-700 border-zinc-200/60 hover:text-purple-600 shadow-sm'
          }`}
          title="History Log"
        >
          <History className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-xl mx-auto w-full space-y-6">
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
                  <span className="text-[9px] font-black uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full text-white">
                    SUCCESS • NO ANSWERS INCLUDED
                  </span>
                  <h3 className="font-black text-lg tracking-tight">
                    {customTopic ? customTopic : `${stream} Set`}
                  </h3>
                  <p className="text-xs text-white/80 font-bold leading-relaxed">
                    Here are {questions.length} level-appropriate subjective practice questions.
                  </p>
                </div>
                <div className="text-4xl opacity-20 absolute right-4 bottom-2 font-bold select-none">
                  ✍️
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div className="flex gap-2.5">
                <button
                  onClick={handleCopyAll}
                  className="flex-1 bg-white border border-zinc-200 text-zinc-800 font-extrabold text-xs py-3 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 hover:bg-zinc-50"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" /> Copied Set!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-purple-600" /> Copy Entire Set
                    </>
                  )}
                </button>
                
                <button
                  onClick={handleShareQuestions}
                  className="flex-1 bg-white border border-zinc-200 text-zinc-800 font-extrabold text-xs py-3 rounded-2xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 hover:bg-zinc-50"
                >
                  <Share2 className="w-4 h-4 text-purple-600" /> Share Questions
                </button>
              </div>

              {/* Questions Stack */}
              <div className="space-y-5">
                {questions.map((question, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                    className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-5 text-left space-y-4"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <h4 className="font-extrabold text-sm text-zinc-850 leading-relaxed">
                        <span className="text-purple-600 font-black mr-2 bg-purple-50 w-6 h-6 rounded-full inline-flex items-center justify-center text-xs shadow-inner shrink-0">
                          {index + 1}
                        </span>
                        {question}
                      </h4>
                      <button
                        onClick={() => handleCopyQuestion(question, index)}
                        className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-450 transition-colors shrink-0"
                        title="Copy Question"
                      >
                        {copiedIndex === index ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
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
                                handleEvaluateAnswer(question, index);
                              }
                            }
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => handleEvaluateAnswer(question, index)}
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
                ))}
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

              {/* Generate New Button */}
              <div className="pt-4">
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
              
              {/* CARD: HOW MANY QUESTIONS SELECTOR */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm text-left space-y-4">
                <div>
                  <h3 className="font-black text-sm text-zinc-900 tracking-tight flex items-center gap-1.5">
                    <span className="text-purple-600 text-lg">📊</span> How many questions?
                  </h3>
                  <p className="text-[10px] text-zinc-450 font-bold mt-0.5 leading-normal">
                    Select the quantity of custom subjective questions you wish to practice.
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {[3, 5, 10, 15].map((num) => (
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

              {/* CARD: SPECIFY TOPIC / INQUIRY FIELD */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm text-left space-y-4">
                <div>
                  <h3 className="font-black text-sm text-zinc-900 tracking-tight flex items-center gap-1.5">
                    <span className="text-purple-600 text-lg">🎯</span> Target Subject / Topic
                  </h3>
                  <p className="text-[10px] text-zinc-450 font-bold mt-0.5 leading-normal">
                    Enter any custom topic, subtopic, or leave it blank to generate questions on your entire stream.
                  </p>
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

                {/* Subject Suggestions chips */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                      Suggested topics for you
                    </span>
                    <button
                      type="button"
                      onClick={handleManualRefresh}
                      className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:text-purple-600 transition-colors cursor-pointer bg-transparent border-0 outline-none select-none"
                    >
                      <span>Refresh</span>
                      <RefreshCw className={`w-2.5 h-2.5 transition-transform ${isRefreshing ? 'animate-spin text-purple-600' : ''}`} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(suggestedTopics.length > 0 ? suggestedTopics : getSuggestedTopics()).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setCustomTopic(suggestion);
                        }}
                        className="bg-purple-50/55 hover:bg-purple-50 text-purple-700 text-[10px] font-black py-2 px-3 rounded-full border border-purple-100/40 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <span>{suggestion}</span>
                        <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 px-5 py-4 rounded-2xl text-xs font-bold text-left leading-relaxed">
                  ⚠️ Generation Error: {error}
                </div>
              )}

              {/* CARD: COIN GENERATION BUTTON */}
              <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between text-left">
                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-xs text-zinc-400 uppercase tracking-widest">
                      Ready to start?
                    </h4>
                    <p className="text-xs font-black text-zinc-800 leading-none">
                      Generates ONLY subjective questions • No answers
                    </p>
                  </div>
                  {!isPro ? (
                    <div className="bg-purple-50 border border-purple-150 text-purple-700 font-black text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1 shrink-0">
                      <span>🪙 2 Coins</span>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 font-black text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-full flex items-center gap-1 shrink-0 shadow-sm">
                      <span>⭐ PRO UNLIMITED</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  className="w-full py-4.5 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                  Generate Practice Questions
                </button>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
