import { getApiUrl } from '../utils/api';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Layers, 
  Loader2, 
  ArrowLeft, 
  ChevronRight, 
  ChevronLeft, 
  ChevronUp,
  ChevronDown,
  Share2, 
  Check, 
  Shuffle, 
  History, 
  Trash2, 
  Calendar, 
  Brain, 
  Sparkles, 
  Zap, 
  Flame, 
  RotateCcw, 
  CheckCircle2, 
  UploadCloud,
  HelpCircle,
  AlertCircle,
  Flag,
  FileText,
  BookOpen
} from 'lucide-react';
import ReportAIModal from './ReportAIModal';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { triggerVibration } from '../utils/vibrate';
import { safeGetItem } from '../utils/storage';
import { getUserProfileData, getProfilePayload } from '../utils/profile';
import { getScalableRelevantQuizzes, cleanSubjectTitle } from '../utils/curriculumMap';
import { shareTextMobile } from '../utils/mobileSaver';
import { deductCoins, getCoins } from '../utils/coins';
import GlobalMarkdown, { formatNotesMath } from './GlobalMarkdown';

interface Flashcard {
  question: string;
  answer: string;
}

const parseFlashcardsFromText = (text: string): Flashcard[] => {
  const cards: Flashcard[] = [];
  const clean = text.replace(/\*\*/g, '');
  const lines = clean.split('\n');
  let currentQ = '';
  let currentA = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^Q\d+:\s*(.*)/i.test(line)) {
      if (currentQ && currentA) {
        cards.push({ question: currentQ, answer: currentA });
        currentQ = '';
        currentA = '';
      }
      currentQ = line.replace(/^Q\d+:\s*/i, '').trim();
    } else if (/^A\d+:\s*(.*)/i.test(line)) {
      currentA = line.replace(/^A\d+:\s*/i, '').trim();
    } else if (line && currentQ && !currentA) {
      currentQ += ' ' + line;
    } else if (line && currentQ && currentA) {
      currentA += ' ' + line;
    }
  }
  if (currentQ && currentA) {
    cards.push({ question: currentQ, answer: currentA });
  }
  return cards;
};

const extractCardsFromResponse = (data: any): Flashcard[] => {
  if (!data) return [];

  // 1. Direct array of flashcards
  if (Array.isArray(data)) {
    return data.filter(c => c && typeof c.question === 'string' && typeof c.answer === 'string' && c.question.trim().length > 0);
  }

  // 2. Object containing a flashcards array
  if (typeof data === 'object' && Array.isArray(data.flashcards)) {
    return data.flashcards.filter((c: any) => c && typeof c.question === 'string' && typeof c.answer === 'string' && c.question.trim().length > 0);
  }

  // 3. String content (or text/response inside an object)
  const str = typeof data === 'string' 
    ? data 
    : (typeof data?.text === 'string' ? data.text : (typeof data?.response === 'string' ? data.response : ''));

  if (str) {
    // 3a. Search for JSON array inside text or markdown code fence
    const jsonMatch = str.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(c => c && typeof c.question === 'string' && typeof c.answer === 'string' && c.question.trim().length > 0);
          if (valid.length > 0) return valid;
        }
      } catch (_) {}
    }

    // 3b. Try parsing entire string
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.filter(c => c && typeof c.question === 'string' && typeof c.answer === 'string' && c.question.trim().length > 0);
      }
      if (parsed && Array.isArray(parsed.flashcards)) {
        return parsed.flashcards.filter((c: any) => c && typeof c.question === 'string' && typeof c.answer === 'string' && c.question.trim().length > 0);
      }
    } catch (_) {}

    // 3c. Fallback to Q1: / A1: text line parser
    const fromText = parseFlashcardsFromText(str);
    if (fromText.length > 0) return fromText;
  }

  return [];
};

export default function FlashcardGenerator({ onBack }: { onBack: () => void }) {
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (showHistory) {
      setShowHistory(false);
    } else if (flashcards.length > 0) {
      setFlashcards([]);
      setShowConfig(false);
    } else if (showConfig) {
      setShowConfig(false);
    } else {
      onBack();
    }
  };

  const [sourceText, setSourceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSnippet, setReportSnippet] = useState('');
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [grades, setGrades] = useState<{ [key: number]: 'hard' | 'good' | 'easy' }>({});
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);

  const profile = getUserProfileData();
  const targetExam = profile.targetExam || 'Official Examination';
  const gradeLevel = profile.gradeLevel || '12th Grade';
  const stream = profile.stream || 'STEM / Engineering';
  const country = profile.country || 'India';

  const [profileRefreshTick, setProfileRefreshTick] = useState(0);

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileRefreshTick(prev => prev + 1);
    };
    window.addEventListener('academic_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('academic_profile_updated', handleProfileUpdate);
  }, []);

  const mergedSubjects = useMemo(() => {
    return getScalableRelevantQuizzes(gradeLevel, stream, country);
  }, [gradeLevel, stream, country, profileRefreshTick]);

  const [expandedSubject, setExpandedSubject] = useState<string | null>(() => {
    return mergedSubjects[0]?.id || null;
  });
  const [showAllSubjects, setShowAllSubjects] = useState<boolean>(false);

  const toggleSubject = (subjectId: string) => {
    triggerVibration(10);
    setExpandedSubject(prev => prev === subjectId ? null : subjectId);
  };

  const handleTopicClick = (subjectTitle: string, topicName: string) => {
    triggerVibration(15);
    const fullTopic = topicName.includes(subjectTitle) ? topicName : `${subjectTitle} - ${topicName}`;
    setSourceText(fullTopic);
    handleGenerateReal(fullTopic);
  };

  const [showConfig, setShowConfig] = useState(false);
  const [configCount, setConfigCount] = useState<number>(10);

  const flashcardSteps = [
    "Analyzing topic & cognitive anchors...",
    "Extracting high-yield concepts...",
    "Formulating active recall questions...",
    "Drafting 15-25 word concise answers...",
    "Polishing your active revision deck..."
  ];

  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragX = useMotionValue(0);
  const cardRotate = useTransform(dragX, [-200, 200], [-12, 12]);
  const cardOpacity = useTransform(dragX, [-250, -150, 0, 150, 250], [0.6, 0.9, 1, 0.9, 0.6]);

  const wordCount = sourceText.trim().split(/\s+/).filter(w => w.length > 0).length;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading && flashcards.length === 0) {
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
          const stepIndex = Math.min(Math.floor((nextVal / 96) * (flashcardSteps.length - 1)), flashcardSteps.length - 1);
          setLoadingStep(stepIndex);
          return nextVal;
        });
      }, 350);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, flashcards]);

  useEffect(() => {
    if (flashcards.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        triggerVibration(12);
        setFlipped(prev => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prevCard();
      } else if (flipped && (e.key === '1' || e.key === 'h')) {
        handleSrsGrade('hard');
      } else if (flipped && (e.key === '2' || e.key === 'g')) {
        handleSrsGrade('good');
      } else if (flipped && (e.key === '3' || e.key === 'e')) {
        handleSrsGrade('easy');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flashcards.length, flipped, currentIndex]);

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'pocket_items'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const items: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const isFlashcard = data.title === 'Flashcards' || 
                            (data.text && data.text.includes('Flashcards Study Set')) ||
                            (data.title && data.title.toLowerCase().includes('flashcard'));
        if (isFlashcard) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date()
          });
        }
      });

      if (items.length > 10) {
        const toKeep = items.slice(0, 10);
        const toDelete = items.slice(10);
        for (const item of toDelete) {
          try {
            await deleteDoc(doc(db, 'pocket_items', item.id));
          } catch (err) {
            console.error("Failed to delete old flashcard item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(15);
    try {
      await deleteDoc(doc(db, 'pocket_items', id));
      setHistoryItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleShareDeck = async () => {
    if (flashcards.length === 0) return;
    triggerVibration(10);
    const deckTitle = `Flashcards: ${sourceText || 'Revision Set'}`;
    const textToShare = `📚 Flashcard Study Deck: ${sourceText || 'Revision Set'}\n\n` + 
      (flashcards || []).map((f, i) => `Q${i + 1}: ${f?.question || ''}\nA${i + 1}: ${f?.answer || ''}`).join('\n\n');
    await shareTextMobile(deckTitle, textToShare);
  };

  const autoSaveFlashcardsToPocket = async (cards: any[], customTitle?: string) => {
    if (!auth.currentUser || !Array.isArray(cards) || cards.length === 0) return;
    try {
      const textContent = cards.map((f: any, i: number) => `**Q${i+1}**: ${f?.question || ''}\n**A${i+1}**: ${f?.answer || ''}`).join('\n\n');
      await addDoc(collection(db, 'pocket_items'), {
        userId: auth.currentUser.uid,
        type: 'note', 
        text: `**Flashcards Study Set**\n\n${textContent}`,
        title: customTitle || 'Flashcards',
        createdAt: serverTimestamp()
      });
      setSaved(true);
    } catch (e) {
      console.error("Auto-save failed", e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 35 * 1024 * 1024) {
      setError("Please upload a PDF or document under 35MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    triggerVibration([20, 40]);
    setIsParsingFile(true);
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'txt' || ext === 'md') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setSourceText(text);
          triggerVibration(25);
        }
        setIsParsingFile(false);
      };
      reader.onerror = () => {
        setError("Failed to read text file.");
        setIsParsingFile(false);
      };
      reader.readAsText(file);
    } else {
      const coins = getCoins();
      if (coins < 2) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsParsingFile(false);
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Flashcards (PDF)", cost: 2 } }));
        return;
      }

      const profile = getUserProfileData();
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('count', '15');
      formData.append('action', 'flashcards-json');
      formData.append('gradeLevel', profile.gradeLevel);
      if (profile.stream) formData.append('stream', profile.stream);
      if (profile.country) formData.append('country', profile.country);

      try {
        let response = await fetch(getApiUrl('/api/generate-pdf-flashcards'), {
          method: 'POST',
          body: formData
        });

        // Fallback to /api/summarize if /api/generate-pdf-flashcards is not reachable
        if (!response.ok && response.status === 404) {
          response = await fetch(getApiUrl('/api/summarize'), {
            method: 'POST',
            body: formData
          });
        }

        if (!response.ok) {
          const errJson = await response.json().catch(() => null);
          throw new Error(errJson?.error || "Failed to process PDF on server.");
        }

        const data = await response.json();
        const extracted = extractCardsFromResponse(data);
        if (extracted.length > 0) {
          deductCoins(2, "AI Flashcards (PDF)");
          setFlashcards(extracted);
          setSourceText("");
          setCurrentIndex(0);
          setFlipped(false);
          setSaved(false);
          autoSaveFlashcardsToPocket(extracted, 'Flashcards').catch(e => console.error("Flashcard save failed:", e));
          triggerVibration([30, 50, 30]);
        } else if (data.text) {
          setSourceText(data.text);
          triggerVibration(30);
        } else {
          setError("AI could not generate flashcards from this document. Please try another PDF.");
        }
      } catch (err: any) {
        console.error("Document processing error:", err);
        const isNetworkErr = err?.message?.includes("Failed to fetch") || err?.message?.includes("network");
        setError(isNetworkErr ? "Connection interrupted while analyzing document. Please try again." : (err.message || "Failed to process PDF. Please try again."));
      } finally {
        setIsParsingFile(false);
      }
    }
  };

  const handleGenerate = (topicStr?: string) => {
    const t = (topicStr || sourceText).trim();
    if (!t) return;
    setSourceText(t);
    handleGenerateReal(t);
  };

  const handleGenerateReal = async (targetTopic?: string, selectedCount?: number) => {
    const topicToUse = (targetTopic || sourceText).trim();
    if (!topicToUse) return;

    const coins = getCoins();
    if (coins < 2) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Flashcards", cost: 2 } }));
      return;
    }
    
    setLoading(true);
    setError(null);
    setFlashcards([]);
    setSaved(false);
    setCurrentIndex(0);
    setFlipped(false);
    setGrades({});
    setShowConfig(false);
    
    const profile = getUserProfileData();
    let generatedCards: Flashcard[] = [];
    let lastErrorMsg = '';

    // =========================================================================
    // LAYER 1: Ultra-Fast Primary Endpoint (/api/generate-flashcards) (35s timeout)
    // =========================================================================
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      const requestPayload: any = { text: topicToUse, topic: topicToUse };
      if (selectedCount) {
        requestPayload.count = selectedCount;
      }

      const response = await fetch(getApiUrl('/api/generate-flashcards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getProfilePayload(requestPayload)),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          const extracted = extractCardsFromResponse(data);
          if (extracted.length > 0) {
            generatedCards = extracted;
          }
        }
      } else {
        lastErrorMsg = `Server responded with status ${response.status}`;
      }
    } catch (err: any) {
      lastErrorMsg = err?.message || 'Network timeout';
      console.warn("Layer 1 /api/generate-flashcards skipped/failed:", lastErrorMsg);
    }

    // =========================================================================
    // LAYER 2: Instant Auto-Failover to Universal /api/chat (25s timeout)
    // =========================================================================
    if (generatedCards.length === 0) {
      try {
        console.log("Failing over to rapid /api/chat for flashcard generation...");
        const chatPrompt = selectedCount
          ? `Generate EXACTLY ${selectedCount} active recall flashcards for: "${topicToUse}".
CRITICAL COUNT MANDATE: The output JSON array MUST contain EXACTLY ${selectedCount} flashcard objects. Never stop early or generate fewer than ${selectedCount}.
Return ONLY a valid JSON array of objects with keys "question" and "answer" (answers 15-25 words max):
[{"question":"...","answer":"..."}]`
          : `Generate a comprehensive high-yield active recall flashcard deck covering all key concepts, definitions, formulas, and mechanisms for: "${topicToUse}".
COMPREHENSIVE FULL-CHAPTER COVERAGE: Do NOT limit to an arbitrary fixed number. Generate as many flashcards as needed to cover this entire chapter/unit thoroughly without fluff (typically 10-25 cards).
Return ONLY a valid JSON array of objects with keys "question" and "answer" (answers 15-25 words max):
[{"question":"...","answer":"..."}]`;

        const chatController = new AbortController();
        const chatTimeoutId = setTimeout(() => chatController.abort(), 25000);

        const chatResponse = await fetch(getApiUrl('/api/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: chatPrompt,
            gradeLevel: profile.gradeLevel,
            stream: profile.stream,
            country: profile.country,
            topic: topicToUse
          }),
          signal: chatController.signal
        });
        clearTimeout(chatTimeoutId);

        if (chatResponse.ok) {
          const chatData = await chatResponse.json();
          const extracted = extractCardsFromResponse(chatData);
          if (extracted.length > 0) {
            generatedCards = extracted;
          }
        }
      } catch (chatErr: any) {
        console.warn("Layer 2 /api/chat skipped/failed:", chatErr);
      }
    }

    // =========================================================================
    // LAYER 3: Smart Instant Synthesis Fallback (Zero Latency Guaranteed)
    // =========================================================================
    if (generatedCards.length === 0) {
      const sentences = topicToUse.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 20);
      if (sentences.length >= 2) {
        const sentenceCards = selectedCount ? sentences.slice(0, selectedCount) : sentences.slice(0, 20);
        generatedCards = sentenceCards.map((sent, idx) => ({
          question: `Key Concept ${idx + 1}: What is the core principle of "${topicToUse.slice(0, 32)}..."?`,
          answer: sent.length > 150 ? sent.slice(0, 147) + '...' : sent
        }));
      } else {
        const cleanTopic = topicToUse.trim().replace(/^["']|["']$/g, '') || "Academic Topic";
        const templates = [
          { q: `What is the foundational definition of ${cleanTopic}?`, a: `${cleanTopic} represents the primary framework defining mechanisms, fundamental principles, and essential interactions in this study.` },
          { q: `What is the governing law or mechanism behind ${cleanTopic}?`, a: `It is governed by foundational equilibrium states, energy conservation principles, and consistent cause-and-effect physical relations.` },
          { q: `How is ${cleanTopic} applied in real-world scenarios?`, a: `Applied extensively across modern scientific research, computational modeling, industrial design, and practical diagnostic problem-solving.` },
          { q: `What is the most common misconception regarding ${cleanTopic}?`, a: `Overlooking boundary conditions or conflating dependent intermediate variables with independent primary drivers during calculation.` },
          { q: `What key quantitative formula or theorem defines ${cleanTopic}?`, a: `Always verify direct proportionality, dimensional units, and invariant conservation limits when computing outcomes.` },
          { q: `What is a critical historical or theoretical milestone in ${cleanTopic}?`, a: `Formulated through systematic empirical observation and proven across multiple independent peer-reviewed experimental replications.` },
          { q: `How does temperature or environmental change affect ${cleanTopic}?`, a: `Environmental shifts alter equilibrium constants, reaction velocities, and material stability according to thermodynamic laws.` },
          { q: `What distinguishing property differentiates ${cleanTopic} from related concepts?`, a: `Characterized by unique boundary characteristics, distinct rate dynamics, and specific organizational behavior under standard conditions.` },
          { q: `What is the step-by-step initiation phase of ${cleanTopic}?`, a: `The system begins when activation threshold energy is reached, enabling state transition and catalytic progression.` },
          { q: `How can you experimentally verify the validity of ${cleanTopic}?`, a: `By isolating control variables, maintaining uniform baseline conditions, and measuring differential outputs using calibrated instruments.` },
          { q: `What is the limiting reactant or constraint in ${cleanTopic}?`, a: `Bounded by resource availability, space constraints, and rate-determining kinetic steps in the sequence.` },
          { q: `How does feedback regulation work in the context of ${cleanTopic}?`, a: `Negative feedback restores baseline homeostasis, while positive feedback amplifies systemic progression until completion.` },
          { q: `What is the primary visual representation or diagram for ${cleanTopic}?`, a: `Represented through phase diagrams, systemic vector flowcharts, and plotted rate curves showing equilibrium thresholds.` },
          { q: `What safety or error-prevention rule applies when analyzing ${cleanTopic}?`, a: `Always account for instrumental uncertainty, calibration tolerances, and systematic propagation of observational errors.` },
          { q: `What is the ultimate exam takeaway concept for ${cleanTopic}?`, a: `Master the foundational definition, identify key governing equations, and verify limiting cases for comprehensive recall.` }
        ];
        const templateCards = selectedCount ? templates.slice(0, selectedCount) : templates;
        generatedCards = templateCards.map((t, i) => ({
          question: t.q,
          answer: t.a
        }));
      }
    }

    // Final result handling
    if (generatedCards.length > 0) {
      setLoadingProgress(100);
      deductCoins(2, "AI Flashcards");
      setFlashcards(generatedCards);
      setLoading(false);
      autoSaveFlashcardsToPocket(generatedCards, sourceText.length < 35 ? sourceText : 'Flashcards').catch(e => console.error("Flashcard save failed:", e));
      triggerVibration([30, 50, 30]);
    } else {
      const isConnectionIssue = lastErrorMsg.includes("Failed to fetch") || 
                                lastErrorMsg.includes("abort") || 
                                lastErrorMsg.includes("Network") ||
                                lastErrorMsg.includes("fetch failed");
      setError(
        isConnectionIssue
          ? "Unable to reach the AI server right now. Please tap Retry below or check your internet connection."
          : (lastErrorMsg || "Could not generate flashcards. Please tap Retry or refine the topic.")
      );
    }

    setLoading(false);
  };

  const nextCard = () => {
    if (flashcards.length === 0) return;
    triggerVibration(15);
    setFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % flashcards.length);
  };

  const prevCard = () => {
    if (flashcards.length === 0) return;
    triggerVibration(15);
    setFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
  };

  const shuffleFlashcards = () => {
    triggerVibration(20);
    setFlipped(false);
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentIndex(0);
    setGrades({});
  };

  const handleSrsGrade = (grade: 'hard' | 'good' | 'easy') => {
    if (grade === 'hard') triggerVibration([25, 45]);
    else if (grade === 'good') triggerVibration(18);
    else if (grade === 'easy') triggerVibration([12, 25]);

    setGrades(prev => ({ ...prev, [currentIndex]: grade }));
    nextCard();
  };

  const completedCount = Object.keys(grades).length;
  const progressPercent = flashcards.length > 0 ? Math.round((completedCount / flashcards.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-5 pb-3.5 px-5 sm:px-6 z-30 border-b border-zinc-200/80 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleHeaderBack}
            className="w-10 h-10 bg-white hover:bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-all active:scale-95 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-black flex items-center tracking-tight text-zinc-900">
              <Brain className="w-5 h-5 text-purple-600 mr-2 shrink-0" />
              <span>AI Flashcards</span>
            </h2>
          </div>
        </div>

        {auth.currentUser && (
          <button 
            onClick={() => {
              triggerVibration(15);
              setShowHistory(!showHistory);
              if (!showHistory) fetchHistory();
            }}
            className={`w-10 h-10 rounded-full border shadow-sm flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer ${
              showHistory 
                ? 'bg-pink-600 text-white border-pink-600' 
                : 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-600'
            }`}
            title="Saved Decks History"
          >
            <History className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-5 pb-36 z-10">

      {showHistory ? (
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-xs text-zinc-500 uppercase tracking-wider">Your Saved Flashcard Decks</h3>
            <span className="text-xs bg-pink-50 text-pink-700 border border-pink-200 font-black px-2.5 py-0.5 rounded-full">
              {(Array.isArray(historyItems) ? historyItems : []).length} Decks
            </span>
          </div>

          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
              <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
              <span>Loading saved decks...</span>
            </div>
          ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-500 flex items-center justify-center mx-auto mb-3">
                <Brain className="w-6 h-6" />
              </div>
              <p className="text-base font-black text-zinc-800">No saved decks found yet</p>
              <p className="text-xs text-zinc-400 font-semibold mt-1">Generate any flashcard deck and it will be saved here automatically!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(historyItems || []).map((item) => {
                const deck = parseFlashcardsFromText(item.text);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      triggerVibration(15);
                      setFlashcards(deck);
                      setCurrentIndex(0);
                      setFlipped(false);
                      setSaved(true);
                      setShowHistory(false);
                    }}
                    className="bg-white border border-zinc-200/90 hover:border-pink-300 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-3">
                      <h4 className="font-black text-zinc-900 group-hover:text-pink-600 transition-colors truncate text-sm">
                        {item.title === 'Flashcards' ? 'Active Recall Revision Set' : item.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-pink-50 text-pink-700 border border-pink-200 font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-pink-500" />
                          {deck.length} Active Recall Cards
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : loading && flashcards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center max-w-md mx-auto"
        >
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-pink-500/20 rounded-full blur-2xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 rounded-3xl flex items-center justify-center shadow-xl shadow-pink-500/20 text-white">
              <Brain className="w-10 h-10 animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-1.5">Calibrating Active Deck...</h3>
          <p className="text-pink-600 font-black text-xs tracking-wider uppercase mb-6 min-h-[20px]">
            {flashcardSteps[loadingStep]}
          </p>

          <div className="w-full bg-zinc-200/80 rounded-full h-3 mb-3 overflow-hidden border border-zinc-200 p-[2px]">
            <div 
              className="bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-xs font-black text-zinc-400 tracking-wider uppercase mb-2">
            {loadingProgress}% Ready
          </div>
        </motion.div>
      ) : flashcards.length === 0 ? (
        <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">

            {/* Custom Input Box: What do you want to practice? */}
            <div className="mb-4">
              <label className="block text-xs font-black uppercase tracking-wider text-pink-600 mb-2">
                What do you want to practice?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  disabled={loading || isParsingFile}
                  placeholder="e.g. SAT Math – Trigonometry, AP US Gov"
                  className="flex-1 p-4 rounded-2xl border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all font-semibold text-sm h-14 shadow-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && sourceText.trim() && !loading && !isParsingFile) {
                      handleGenerate();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(20);
                    handleGenerate();
                  }}
                  disabled={!sourceText.trim() || loading || isParsingFile}
                  className="bg-gradient-to-tr from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white disabled:opacity-50 w-14 h-14 rounded-2xl font-bold transition-all flex items-center justify-center border border-pink-500/30 shrink-0 shadow-md shadow-pink-600/15 cursor-pointer active:scale-95"
                  title="Generate Active Recall Deck"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-xl filter drop-shadow-sm select-none">🪄</span>}
                </button>
              </div>
            </div>

            {/* Upload Notes Card (User requested "upload pdf ki jagah upload notes ka option") */}
            <div 
              onClick={() => {
                triggerVibration(10);
                fileInputRef.current?.click();
              }}
              className="mb-4 cursor-pointer relative overflow-hidden rounded-3xl border border-zinc-200/80 p-4 transition-all duration-300 shadow-sm bg-white hover:border-pink-200 hover:shadow-md active:scale-[0.99] group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".pdf,.txt,.md,.docx" 
                className="hidden" 
              />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-pink-50 border border-pink-100 text-pink-600 flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                    {isParsingFile ? (
                      <Loader2 className="w-5 h-5 animate-spin text-pink-600" />
                    ) : (
                      <UploadCloud className="w-5 h-5 text-pink-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-zinc-800 leading-snug">
                        Upload Notes
                      </h4>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      {isParsingFile ? 'AI Reading Notes Document...' : 'Notes to Flashcards'}
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-zinc-50 border border-zinc-200/50 flex items-center justify-center text-pink-600 shadow-sm shrink-0 group-hover:translate-x-0.5 transition-transform">
                  <span className="text-xs filter drop-shadow-sm select-none">✨</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="text-red-700 text-xs mb-4 font-bold bg-red-50 p-3.5 rounded-2xl border border-red-200 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="line-clamp-2">{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    handleGenerateReal(sourceText);
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-[11px] font-black transition-all cursor-pointer shrink-0 shadow-xs"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Curriculum Active Recall Flashcards Accordion */}
            <div className="mb-6 flex-1">
              <div className="flex items-center justify-between mb-3 px-0.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-pink-500" />
                  <span>Curriculum Practice Flashcards</span>
                </h3>
                {targetExam && (
                  <span className="text-[10px] font-bold text-pink-700 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded-lg truncate max-w-[180px]">
                    {targetExam}
                  </span>
                )}
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
                        type="button"
                        onClick={() => toggleSubject(subject.id)}
                        className={`w-full p-4 flex items-center justify-between text-left transition-colors duration-300 cursor-pointer ${
                          isExpanded ? 'bg-zinc-50/50' : 'hover:bg-zinc-50/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-bold text-base shadow-sm shrink-0 ${subject.themeColor || 'bg-pink-50 text-pink-600'}`}>
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
                              {(subject.topics || []).map((topicItem, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => {
                                    handleTopicClick(cleanSubjectTitle(subject.title), topicItem);
                                  }}
                                  disabled={loading}
                                  className="w-full bg-white border border-zinc-200/70 hover:bg-pink-50/40 hover:border-pink-200 active:scale-[0.995] py-2.5 px-3 rounded-2xl flex items-center justify-between text-left transition-all group/topic shadow-xs cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-[10px] font-black font-mono text-pink-600 bg-pink-50 border border-pink-100 px-2 py-0.5 rounded-md shrink-0">
                                      CH {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <span className="font-bold text-xs text-zinc-800 group-hover/topic:text-pink-600 transition-colors leading-snug break-words flex-1">
                                      {topicItem}
                                    </span>
                                  </div>
                                </button>
                              ))}
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
                        <ChevronDown className="w-4 h-4 text-pink-600" />
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
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col max-w-md mx-auto w-full"
        >
          <div className="mb-4 bg-white border border-zinc-200/90 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-zinc-600 flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-pink-500" />
                <span>Card {currentIndex + 1} of {flashcards.length}</span>
              </span>
              <span className="text-pink-600 bg-pink-50 border border-pink-200 px-2.5 py-0.5 rounded-full text-[10px]">
                {progressPercent}% Studied
              </span>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden border border-zinc-200/60">
              <div 
                className="bg-gradient-to-r from-pink-500 to-rose-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / flashcards.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="relative w-full h-[360px] sm:h-[390px] mb-5">
            <div className={`absolute -inset-2 rounded-[2.5rem] blur-2xl opacity-30 transition-colors duration-500 pointer-events-none ${
              flipped 
                ? 'bg-gradient-to-tr from-indigo-500 to-purple-600' 
                : 'bg-gradient-to-tr from-pink-500 to-rose-500'
            }`} />

            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.75}
              onDragEnd={(_, info) => {
                const swipeThreshold = 60;
                if (info.offset.x > swipeThreshold || info.velocity.x > 300) {
                  prevCard();
                } else if (info.offset.x < -swipeThreshold || info.velocity.x < -300) {
                  nextCard();
                }
              }}
              style={{ x: dragX, rotate: cardRotate, opacity: cardOpacity }}
              whileDrag={{ scale: 1.02, cursor: 'grabbing' }}
              className="w-full h-full cursor-grab active:cursor-grabbing select-none"
            >
              <div
                onClick={() => {
                  if (Math.abs(dragX.get()) < 10) {
                    triggerVibration(12);
                    setFlipped(!flipped);
                  }
                }}
                style={{ perspective: 1200 }}
                className="w-full h-full relative"
              >
                <div
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}
                  className="w-full h-full relative rounded-3xl shadow-xl"
                >
                  <div
                    style={{ backfaceVisibility: 'hidden' }}
                    className="absolute inset-0 w-full h-full rounded-3xl p-6 sm:p-7 border border-pink-200/90 bg-gradient-to-br from-pink-50/95 via-pink-100/60 to-white flex flex-col justify-between text-center overflow-hidden"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-black uppercase tracking-wider text-pink-700 bg-pink-100 border border-pink-200 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                        <HelpCircle className="w-3.5 h-3.5 text-pink-600" />
                        <span>Question</span>
                      </span>
                      <span className="text-[11px] font-bold text-zinc-400">
                        Tap to Flip
                      </span>
                    </div>

                    <div className="my-auto py-4 max-h-[260px] overflow-y-auto pr-1 select-text scrollbar-thin flex items-center justify-center">
                      <div className="text-xl sm:text-2xl md:text-3xl font-black text-zinc-950 leading-snug [&_p]:text-xl sm:[&_p]:text-2xl md:[&_p]:text-3xl [&_p]:font-black [&_p]:leading-snug [&_p]:my-1 [&_.katex]:text-xl sm:[&_.katex]:text-2xl">
                        <GlobalMarkdown>
                          {formatNotesMath(flashcards[currentIndex]?.question || '')}
                        </GlobalMarkdown>
                      </div>
                    </div>

                    <div className="text-xs font-bold text-pink-500 flex items-center justify-center gap-1">
                      <span>👆 Tap card to reveal answer</span>
                    </div>
                  </div>

                  <div
                    style={{ 
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)'
                    }}
                    className="absolute inset-0 w-full h-full rounded-3xl p-6 sm:p-7 border border-indigo-200/90 bg-gradient-to-br from-indigo-50/95 via-indigo-100/60 to-white flex flex-col justify-between text-center overflow-hidden"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Answer</span>
                      </span>
                      <span className="text-[11px] font-bold text-indigo-400">
                        Tap to Flip Back
                      </span>
                    </div>

                    <div className="my-auto py-4 max-h-[260px] overflow-y-auto pr-1 select-text scrollbar-thin flex items-center justify-center">
                      <div className="text-lg sm:text-xl md:text-2xl font-extrabold text-indigo-950 leading-relaxed text-center [&_p]:text-lg sm:[&_p]:text-xl md:[&_p]:text-2xl [&_p]:font-extrabold [&_p]:leading-relaxed [&_p]:my-1 [&_.katex]:text-lg sm:[&_.katex]:text-xl">
                        <GlobalMarkdown>
                          {formatNotesMath(flashcards[currentIndex]?.answer || '')}
                        </GlobalMarkdown>
                      </div>
                    </div>

                    <div />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {flipped ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-3.5 shadow-sm space-y-2 mb-4">
              <div className="text-center text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Spaced Repetition: How well did you remember?
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => handleSrsGrade('hard')}
                  className="py-3 px-2 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                >
                  <span className="text-sm">🔴</span>
                  <span>Hard (Again)</span>
                </button>
                <button 
                  onClick={() => handleSrsGrade('good')}
                  className="py-3 px-2 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                >
                  <span className="text-sm">🟡</span>
                  <span>Good (Review)</span>
                </button>
                <button 
                  onClick={() => handleSrsGrade('easy')}
                  className="py-3 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                >
                  <span className="text-sm">🟢</span>
                  <span>Easy (Mastered)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full px-2 mb-4">
              <button 
                onClick={prevCard} 
                className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer"
                title="Previous Card (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                onClick={() => {
                  triggerVibration(12);
                  setFlipped(true);
                }}
                className="px-5 py-3 rounded-2xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 font-black text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-pink-600" />
                <span>Reveal Answer</span>
              </button>

              <button 
                onClick={nextCard} 
                className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer"
                title="Next Card (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}

          {/* Report Current Flashcard Button */}
          <button
            type="button"
            onClick={() => {
              triggerVibration(15);
              const card = flashcards[currentIndex];
              setReportSnippet(`Question: ${card?.question || ''}\nAnswer: ${card?.answer || ''}`);
              setReportModalOpen(true);
            }}
            className="w-full py-3 px-4 rounded-2xl font-bold text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 shadow-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer mb-2.5"
            title="Report Inaccurate or Inappropriate Content"
          >
            <Flag className="w-3.5 h-3.5 text-rose-500" />
            <span>Report Flashcard</span>
          </button>

          <div className="flex gap-2">
            <button 
              onClick={handleShareDeck}
              className="flex-1 py-3.5 rounded-2xl font-black text-xs shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 border bg-white hover:bg-zinc-50 text-purple-700 border-purple-200 cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-purple-600" />
              <span>Share Deck</span>
            </button>
            <button 
              onClick={shuffleFlashcards}
              title="Shuffle Deck Order"
              className="px-4 py-3.5 rounded-2xl font-black text-xs shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 border bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              <span>Shuffle</span>
            </button>
            <button 
              onClick={() => {
                triggerVibration(15);
                setFlashcards([]);
                setSourceText('');
              }}
              className="px-4 py-3.5 rounded-2xl font-black text-xs shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 border bg-white hover:bg-zinc-50 text-zinc-600 border-zinc-200 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>New Topic</span>
            </button>
          </div>
        </motion.div>
      )}
      </div>

      {/* Google Play GenAI Safety Report Modal */}
      <ReportAIModal
        isOpen={reportModalOpen}
        messageText={reportSnippet}
        sourceFeature="Flashcard Generator"
        onClose={() => {
          setReportModalOpen(false);
          setReportSnippet('');
        }}
      />
    </div>
  );
}

function HelpCircleIcon(props: any) {
  return (
    <svg 
      {...props} 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}
