import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, Download, Printer, Sparkles, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, 
  RotateCcw, Check, Loader2, AlertCircle, BookOpen, Layers, 
  Trash2, Calendar, Compass, Award, X, CheckCircle2, Cloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { getUserProfileData, getProfilePayload } from '../utils/profile';
import { getStoredExamBlueprint, SubjectBlueprint } from '../utils/academicBlueprint';
import { getScalableRelevantQuizzes } from '../utils/curriculumMap';
import { getCachedCurriculumContent, saveCachedCurriculumContent, parseTopicHierarchy, isValidAcademicTopicInput } from '../utils/communityCache';
import { triggerVibration } from '../utils/vibrate';
import { deductCoins, getCoins, isProUser } from '../utils/coins';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { getApiUrl } from '../utils/api';
import GlobalMarkdown, { formatNotesMath, formatFormulaBoxContent } from './GlobalMarkdown';

interface AINotesProps {
  onBack: () => void;
  isVip?: boolean;
}

interface ConceptBranch {
  title: string;
  subtitle: string;
  bullets: string[];
}

interface ConceptMap {
  rootTitle: string;
  rootDesc: string;
  branches: ConceptBranch[];
}

interface MemoryTrick {
  title: string;
  analogyStory: string;
  keyTakeaway: string;
}

interface FormulaBox {
  name: string;
  formula: string;
  variables: string[];
}

interface ComparisonTable {
  headers: string[];
  rows: string[][];
}

interface ExamTipBox {
  title: string;
  content: string;
}

interface NotePage {
  pageNumber: number;
  pageTitle: string;
  subtitle: string;
  points: string[];
  formulaBox?: FormulaBox;
  comparisonTable?: ComparisonTable;
  examTipBox?: ExamTipBox;
}

interface CrucialExamTrap {
  title: string;
  misconception: string;
  correctTruth: string;
  rule: string;
}

interface SolvedCaseStudy {
  title: string;
  problemScenario: string;
  steps: string[];
  finalResult: string;
}

interface AINotesData {
  metadata: {
    title: string;
    subject: string;
    chapter: string;
    exam: string;
    syllabusAuthority: string;
    totalPages: number;
  };
  conceptMap: ConceptMap;
  memoryTrick: MemoryTrick;
  pages: NotePage[];
  crucialExamTrap: CrucialExamTrap;
  solvedCaseStudy: SolvedCaseStudy;
}

interface SavedNoteItem {
  id: string;
  timestamp: number;
  chapter: string;
  subject: string;
  exam: string;
  data: AINotesData;
}

export default function AINotes({ onBack, isVip = false }: AINotesProps) {
  const profile = getUserProfileData();
  const targetExam = profile.targetExam || 'Official Examination';
  const gradeLevel = profile.gradeLevel || '12th Grade';
  const country = profile.country || 'India';

  const [profileRefreshTick, setProfileRefreshTick] = useState(0);

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileRefreshTick(prev => prev + 1);
    };
    window.addEventListener('academic_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('academic_profile_updated', handleProfileUpdate);
  }, []);

  // Scalable, dynamic subjects calibrated to user's chosen exam and syllabus (same as AI Practice Quizzes)
  const mergedSubjects = useMemo(() => {
    return getScalableRelevantQuizzes(gradeLevel, profile.stream || 'STEM / Engineering', country);
  }, [gradeLevel, profile.stream, country, profileRefreshTick]);

  const [selectedSubject, setSelectedSubject] = useState<string>(() => {
    return mergedSubjects[0]?.title || profile.subject || 'Physics';
  });

  const [expandedSubject, setExpandedSubject] = useState<string | null>(() => {
    return mergedSubjects[0]?.id || null;
  });
  const [showAllSubjects, setShowAllSubjects] = useState<boolean>(false);

  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [customSubTopicInput, setCustomSubTopicInput] = useState<{ [chapterKey: string]: string }>({});
  const [showCustomInputForChapter, setShowCustomInputForChapter] = useState<string | null>(null);
  const [customInputError, setCustomInputError] = useState<{ [chapterKey: string]: string }>({});
  const [noteDepth, setNoteDepth] = useState<'detailed' | 'revision'>('detailed');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStage, setLoadingStage] = useState<number>(1);
  const [stageMessage, setStageMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [notesData, setNotesData] = useState<AINotesData | null>(null);
  const [historyItems, setHistoryItems] = useState<SavedNoteItem[]>(() => {
    try {
      const uid = auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
      const local = safeGetItem(uid ? `user_notes_${uid}` : 'helpyou_ai_saved_notes');
      return local ? JSON.parse(local) : [];
    } catch (_) {
      return [];
    }
  });
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // Cross-Device Cloud Sync: Fetch user's saved notes from Cloud Firestore
  const fetchCloudNotes = async (targetUid?: string) => {
    const uid = targetUid || auth.currentUser?.uid || safeGetItem('last_logged_in_user');
    if (!uid) return;

    try {
      setSyncingCloud(true);
      const q = query(
        collection(db, 'user_notes'),
        where('userId', '==', uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const cloudNotes: SavedNoteItem[] = [];
        snap.forEach((docSnap) => {
          const nd = docSnap.data();
          if (nd && nd.data) {
            cloudNotes.push({
              id: docSnap.id,
              timestamp: nd.createdAt?.toMillis ? nd.createdAt.toMillis() : (nd.timestamp || Date.now()),
              chapter: nd.chapter || nd.data?.metadata?.chapter || 'AI Topper Note',
              subject: nd.subject || nd.data?.metadata?.subject || 'General',
              exam: nd.exam || nd.data?.metadata?.exam || 'Official Exam',
              data: nd.data
            });
          }
        });

        cloudNotes.sort((a, b) => b.timestamp - a.timestamp);

        setHistoryItems((prev) => {
          const map = new Map<string, SavedNoteItem>();
          cloudNotes.forEach((item) => map.set(item.id, item));
          prev.forEach((item) => {
            if (!map.has(item.id)) {
              map.set(item.id, item);
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
          safeSetItem('helpyou_ai_saved_notes', JSON.stringify(merged));
          safeSetItem(`user_notes_${uid}`, JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.warn('[AINotes] Cross-device cloud sync fallback to local storage:', err);
    } finally {
      setSyncingCloud(false);
    }
  };

  useEffect(() => {
    fetchCloudNotes();
    const handleSyncEvent = () => fetchCloudNotes();
    window.addEventListener('sync_cloud_notes', handleSyncEvent);
    return () => window.removeEventListener('sync_cloud_notes', handleSyncEvent);
  }, []);

  const handleOpenNote = (item: SavedNoteItem) => {
    triggerVibration(15);
    setNotesData(item.data);
    setSelectedSubject(item.subject);
    setSelectedChapter(item.chapter);
    setShowHistoryModal(false);
  };

  const handleDeleteNote = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerVibration(20);
    const updated = historyItems.filter(h => h.id !== id);
    setHistoryItems(updated);
    safeSetItem('helpyou_ai_saved_notes', JSON.stringify(updated));
    const uid = auth.currentUser?.uid || safeGetItem('last_logged_in_user');
    if (uid) {
      safeSetItem(`user_notes_${uid}`, JSON.stringify(updated));
    }

    if (auth.currentUser && !id.startsWith('note_')) {
      try {
        await deleteDoc(doc(db, 'user_notes', id));
      } catch (err) {
        console.warn('[AINotes] Failed to delete note from cloud:', err);
      }
    }
  };

  const handleDownloadPDF = () => {
    triggerVibration(15);
    window.print();
  };

  useEffect(() => {
    if (mergedSubjects.length > 0 && !selectedSubject) {
      setSelectedSubject(mergedSubjects[0].title);
      setExpandedSubject(mergedSubjects[0].id);
    }
  }, [mergedSubjects]);

  const handleGenerateNotes = async () => {
    const chapterName = selectedChapter.trim();
    if (!chapterName) {
      setError("Please select or type a chapter name.");
      triggerVibration(25);
      return;
    }

    // Validate custom subtopic if present
    const hierarchy = parseTopicHierarchy(chapterName, selectedSubject);
    if (hierarchy.subTopic && hierarchy.subTopic !== 'All') {
      const check = isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter);
      if (!check.isValid) {
        setError(check.error || 'Please enter a valid academic concept or topic name.');
        triggerVibration([30, 50, 30]);
        return;
      }
    }

    setError(null);
    setLoading(true);
    setLoadingStage(1);
    setStageMessage(`Connecting to official ${targetExam} syllabus registry...`);
    triggerVibration(15);

    // 5-Stage Live radar progression animation
    const t1 = setTimeout(() => {
      setLoadingStage(2);
      setStageMessage(`Calibrating ${selectedSubject} chapters, definitions & core formulas...`);
    }, 1200);

    const t2 = setTimeout(() => {
      setLoadingStage(3);
      setStageMessage(`Designing visual concept map flowchart & real-world memory tricks...`);
    }, 2500);

    const t3 = setTimeout(() => {
      setLoadingStage(4);
      setStageMessage(`Extracting #1 crucial exam traps & practical numerical case study...`);
    }, 4000);

    const t4 = setTimeout(() => {
      setLoadingStage(5);
      setStageMessage(`Rendering handwritten lined notebook paper pages... ✓`);
    }, 5500);

    try {
      // Check Global Community Cache first (Instant 0ms / 0 API cost)
      const hierarchy = parseTopicHierarchy(chapterName, selectedSubject);
      const targetExamStr = targetExam || safeGetItem('academic_exam') || safeGetItem('target_exam') || '';
      const cachedHit = await getCachedCurriculumContent<AINotesData>({
        country,
        exam: targetExamStr,
        grade: gradeLevel,
        subject: selectedSubject,
        chapter: hierarchy.chapter,
        subTopic: hierarchy.subTopic,
        feature: 'notes'
      });

      if (cachedHit && cachedHit.content && Array.isArray(cachedHit.content.pages) && cachedHit.content.pages.length > 0) {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        setNotesData(cachedHit.content);
        setLoading(false);
        triggerVibration(30);
        if (!isVip) {
          deductCoins(2, "AI Topper Handwritten Notes");
        }
        return;
      }

      const response = await fetch(getApiUrl('/api/generate-ai-notes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getProfilePayload({
          subject: selectedSubject,
          chapter: chapterName,
          depth: noteDepth,
          targetExam,
          gradeLevel,
          country
        }))
      });

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);

      if (!response.ok) {
        const text = await response.text();
        let errMsg = "Failed to generate notes. Please try again.";
        try { errMsg = JSON.parse(text).error || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }

      const data: AINotesData = await response.json();
      setNotesData(data);

      // Save newly generated notes into Global Community Cache
      saveCachedCurriculumContent({
        country,
        exam: targetExamStr,
        grade: gradeLevel,
        subject: selectedSubject,
        chapter: hierarchy.chapter,
        subTopic: hierarchy.subTopic,
        feature: 'notes'
      }, data, { depth: noteDepth });

      setLoading(false);
      triggerVibration(30);

      // Deduct coins if not VIP
      if (!isVip) {
        deductCoins(2, "AI Topper Handwritten Notes");
      }

      // 1. Auto-save 100% to user's Cloud Email Account (Firebase Firestore)
      let savedDocId = 'note_' + Date.now();
      if (auth.currentUser) {
        try {
          const docRef = await addDoc(collection(db, 'user_notes'), {
            userId: auth.currentUser.uid,
            userEmail: auth.currentUser.email || '',
            chapter: chapterName,
            subject: selectedSubject,
            exam: targetExam,
            data,
            timestamp: Date.now(),
            createdAt: serverTimestamp()
          });
          savedDocId = docRef.id;

          // Also register as a Pocket Item so it appears in student study resources
          await addDoc(collection(db, 'pocket_items'), {
            userId: auth.currentUser.uid,
            userEmail: auth.currentUser.email || '',
            type: 'note',
            topic: `${selectedSubject}: ${chapterName}`,
            subject: selectedSubject,
            text: `# ${data.metadata?.title || chapterName}\n\n**Subject**: ${data.metadata?.subject || selectedSubject} | **Exam**: ${data.metadata?.exam || targetExam}\n\n${(data.pages || []).map(p => `## ${p.pageTitle || 'Page'}\n${(p.points || []).join('\n')}`).join('\n\n')}`,
            createdAt: serverTimestamp()
          });
        } catch (cloudErr) {
          console.warn('[AINotes] Cloud auto-sync notice:', cloudErr);
        }
      }

      // 2. Auto-save 100% to local mobile storage (user-scoped and global)
      const uid = auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
      const newHistoryItem: SavedNoteItem = {
        id: savedDocId,
        timestamp: Date.now(),
        chapter: chapterName,
        subject: selectedSubject,
        exam: targetExam,
        data
      };
      const updatedHistory = [newHistoryItem, ...historyItems.filter(h => h.id !== savedDocId).slice(0, 49)];
      setHistoryItems(updatedHistory);
      safeSetItem('helpyou_ai_saved_notes', JSON.stringify(updatedHistory));
      if (uid) {
        safeSetItem(`user_notes_${uid}`, JSON.stringify(updatedHistory));
      }

    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      setLoading(false);
      setError(err?.message || "Generation encountered an issue. Please try again.");
      triggerVibration(25);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] text-zinc-900 overflow-y-auto select-none print:bg-white print:overflow-visible">
      
      {/* Dynamic Print Styles for 1-Click Pixel-Perfect PDF Export */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Kalam:wght@300;400;700&family=Patrick+Hand&display=swap');
        
        .handwritten-font {
          font-family: 'Kalam', cursive;
        }

        .notebook-sheet {
          background-color: #FFFDF8;
          background-image: repeating-linear-gradient(
            transparent,
            transparent 29px,
            #E2E8F0 29px,
            #E2E8F0 30px
          );
          background-attachment: local;
        }

        @media print {
          body, html {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .notebook-page {
            width: 100% !important;
            min-height: 100vh !important;
            margin: 0 !important;
            padding: 20mm 15mm 20mm 20mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>

      {/* Top Header Bar */}
      <div className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              triggerVibration(10);
              if (notesData) {
                setNotesData(null);
              } else {
                onBack();
              }
            }}
            className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 active:scale-95 flex items-center justify-center text-zinc-700 transition-all cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base select-none">📓</span>
            <h1 className="font-black text-sm text-zinc-900 tracking-tight leading-none">
              AI Topper Notes
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Saved Notes History Button with Cloud Sync Status */}
          <button
            type="button"
            onClick={() => {
              triggerVibration(15);
              fetchCloudNotes();
              setShowHistoryModal(true);
            }}
            className="px-3 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 active:scale-95 text-purple-700 border border-purple-200 flex items-center gap-1.5 transition-all cursor-pointer font-bold text-xs shadow-2xs"
            title="My Saved Notes (Cross-Device Cloud Synced)"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin text-purple-600' : 'text-purple-600'}`} />
            <span>Saved ({historyItems.length})</span>
          </button>

          {notesData && (
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 active:scale-95 text-white rounded-full font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title="Save as PDF or Print"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span> PDF
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-start p-4 sm:p-6 print:p-0">
        
        {/* Loading Radar Animation */}
        {loading ? (
          <div className="no-print my-auto flex flex-col items-center justify-center max-w-sm mx-auto text-center py-12">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin flex items-center justify-center shadow-lg" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl animate-pulse">
                📓
              </div>
            </div>

            <h3 className="font-black text-base text-zinc-900 mb-2">
              Generating Toppers Handwritten Notes
            </h3>

            {/* Radar Stage Checklist */}
            <div className="w-full space-y-2 mt-4 text-left">
              {[
                { num: 1, label: 'Official Syllabus Calibration', desc: `Aligning with ${targetExam} official criteria` },
                { num: 2, label: 'Concept Tree & Analogies', desc: 'Synthesizing visual flowcharts & memory tricks' },
                { num: 3, label: 'Comparison Tables & Formulas', desc: 'Curating contrast metrics & LaTeX equations' },
                { num: 4, label: 'Exam Traps & Numerical Cases', desc: 'Pinpointing high-frequency examiner traps' },
                { num: 5, label: 'Handwritten Paper Rendering', desc: 'Crafting ruled lined notebook format' }
              ].map((st) => {
                const isDone = loadingStage > st.num || (loadingStage === 5 && st.num === 5);
                const isCurrent = loadingStage === st.num && loadingStage < 5;
                return (
                  <div 
                    key={st.num}
                    className={`p-2.5 rounded-xl border text-xs flex items-center gap-3 transition-all ${
                      isDone 
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        : isCurrent
                        ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/10 text-amber-950 font-black'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-400 opacity-60'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                      isDone ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-500'
                    }`}>
                      {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : isCurrent ? <Loader2 className="w-3 h-3 animate-spin" /> : st.num}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black">{st.label}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{st.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-zinc-950 text-white rounded-xl text-center w-full mt-4">
              <p className="text-[11px] font-bold text-zinc-200 flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                {stageMessage}
              </p>
            </div>
          </div>
        ) : !notesData ? (

          /* STEP 1: CONFIGURATION & CHAPTER SELECTION SCREEN */
          <div className="no-print w-full max-w-lg mx-auto space-y-4 mb-16">
            
            {/* Selected Topic Confirmation / Or Type Specific Custom Topic */}
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-3.5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <span>🎯</span> Selected Chapter:
                </span>
                {selectedSubject && (
                  <span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                    {selectedSubject}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={selectedChapter}
                  onChange={(e) => setSelectedChapter(e.target.value)}
                  placeholder="Type custom topic or select from chapters below..."
                  className="w-full bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl py-2.5 pl-3 pr-10 text-xs font-bold text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500 shadow-inner"
                />
                {selectedChapter && (
                  <button
                    onClick={() => setSelectedChapter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center text-[9px] font-black cursor-pointer hover:bg-zinc-300"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* EXAM CURRICULUM SUBJECTS & CHAPTERS (IDENTICAL TO AI PRACTICE QUIZZES) */}
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                  Official Exam Subjects & Chapters
                </h3>
              </div>

              {/* Subject Cards (Identical to AI Quizzes) */}
              <div className="space-y-3">
                {(() => {
                  const isLaterSubjectActive = mergedSubjects.slice(5).some(
                    s => s.id === expandedSubject || (selectedChapter && (s.topics || []).some(t => selectedChapter.toLowerCase() === t.toLowerCase()) || selectedSubject === s.title)
                  );
                  const shouldShowAll = showAllSubjects || isLaterSubjectActive || mergedSubjects.length <= 5;
                  const visibleSubjects = shouldShowAll ? mergedSubjects : mergedSubjects.slice(0, 5);

                  return (
                    <>
                      {visibleSubjects.map((subject) => {
                  const isExpanded = expandedSubject === subject.id;
                  const isSubjectSelected = selectedSubject === subject.title;
                  const hasActiveTopic = selectedChapter && (subject.topics || []).some(t => selectedChapter.toLowerCase() === t.toLowerCase());

                  return (
                    <div
                      key={subject.id}
                      className={`bg-white border rounded-3xl overflow-hidden shadow-sm transition-all duration-300 ${
                        (isSubjectSelected && selectedChapter) || hasActiveTopic
                          ? 'border-purple-300 ring-1 ring-purple-200 shadow-md'
                          : 'border-zinc-200/80 hover:border-zinc-300'
                      }`}
                    >
                      {/* Main Subject Card Header - Identical to AI Quizzes */}
                      <button
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setSelectedSubject(subject.title);
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

                      {/* Expandable Chapters List - Clean and Styled like AI Quizzes */}
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
                                const chapterKey = `${subject.title}__${topicItem}`;
                                const isChapterOpen = expandedChapter === chapterKey;
                                const subTopicsList = (subject.chapterSubTopics && subject.chapterSubTopics[topicItem]) || [];
                                const isSelected = selectedSubject === subject.title && (selectedChapter === topicItem || (selectedChapter || '').startsWith(`${topicItem} - `));

                                return (
                                  <div key={idx} className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs transition-all">
                                    {/* Chapter Header */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        triggerVibration(10);
                                        setSelectedSubject(subject.title);
                                        setExpandedChapter(isChapterOpen ? null : chapterKey);
                                      }}
                                      className={`w-full py-2.5 px-3 flex items-center justify-between text-left transition-all cursor-pointer ${
                                        isChapterOpen ? 'bg-purple-50/40 border-b border-purple-100' : 'hover:bg-zinc-50'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md shrink-0 border ${
                                          isSelected
                                            ? 'text-white bg-purple-600 border-purple-600 font-bold'
                                            : 'text-purple-600 bg-purple-50 border-purple-100 font-semibold'
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
                                          {/* Quick Option: Full Chapter Notes */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              triggerVibration(15);
                                              setSelectedSubject(subject.title);
                                              setSelectedChapter(topicItem);
                                            }}
                                            className={`w-full py-2 px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer shadow-xs border ${
                                              selectedSubject === subject.title && selectedChapter === topicItem
                                                ? 'bg-purple-600 text-white border-purple-600'
                                                : 'bg-gradient-to-r from-purple-50/80 to-indigo-50/80 border-purple-200/90 hover:border-purple-400'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs">🎯</span>
                                              <span className={`text-xs font-black ${selectedSubject === subject.title && selectedChapter === topicItem ? 'text-white' : 'text-purple-700'}`}>
                                                Entire Chapter Notes
                                              </span>
                                            </div>
                                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                                              selectedSubject === subject.title && selectedChapter === topicItem
                                                ? 'bg-purple-700 text-white border-purple-700'
                                                : 'bg-white text-purple-600 border-purple-100 shadow-2xs'
                                            }`}>
                                              All Topics
                                            </span>
                                          </button>

                                          {/* Sub-Topics Pills */}
                                          <div className="grid grid-cols-1 gap-1.5 pt-1">
                                            {subTopicsList.map((sub, sIdx) => {
                                              const subTarget = `${topicItem} - ${sub}`;
                                              const isSubSelected = selectedSubject === subject.title && selectedChapter === subTarget;
                                              return (
                                                <button
                                                  key={sIdx}
                                                  type="button"
                                                  onClick={() => {
                                                    triggerVibration(15);
                                                    setSelectedSubject(subject.title);
                                                    setSelectedChapter(subTarget);
                                                  }}
                                                  className={`w-full py-2 px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer shadow-2xs border ${
                                                    isSubSelected
                                                      ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500/20'
                                                      : 'bg-white border-zinc-200/70 hover:bg-purple-50/40 hover:border-purple-200'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                    <span className={`text-xs truncate ${isSubSelected ? 'font-bold text-purple-900' : 'font-medium text-zinc-700'}`}>
                                                      {sub}
                                                    </span>
                                                  </div>
                                                  <span className="text-[10px] font-bold text-purple-600 bg-purple-50/80 px-2 py-0.5 rounded-md shrink-0">
                                                    Select
                                                  </span>
                                                </button>
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
                                                    onChange={(e) => {
                                                      setCustomSubTopicInput(prev => ({ ...prev, [chapterKey]: e.target.value }));
                                                      if (customInputError[chapterKey]) {
                                                        setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                      }
                                                    }}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        const val = (customSubTopicInput[chapterKey] || '').trim();
                                                        const check = isValidAcademicTopicInput(val, topicItem);
                                                        if (!check.isValid) {
                                                          triggerVibration([30, 50, 30]);
                                                          setCustomInputError(prev => ({ ...prev, [chapterKey]: check.error || 'Invalid topic' }));
                                                          return;
                                                        }
                                                        setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                        triggerVibration(15);
                                                        setSelectedSubject(subject.title);
                                                        setSelectedChapter(`${topicItem} - ${val}`);
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
                                                    onClick={() => {
                                                      const val = (customSubTopicInput[chapterKey] || '').trim();
                                                      const check = isValidAcademicTopicInput(val, topicItem);
                                                      if (!check.isValid) {
                                                        triggerVibration([30, 50, 30]);
                                                        setCustomInputError(prev => ({ ...prev, [chapterKey]: check.error || 'Invalid topic' }));
                                                        return;
                                                      }
                                                      setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                      triggerVibration(15);
                                                      setSelectedSubject(subject.title);
                                                      setSelectedChapter(`${topicItem} - ${val}`);
                                                    }}
                                                    className="px-3 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 transition-all shrink-0 cursor-pointer"
                                                  >
                                                    Apply
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

            {/* CARD 3: NOTE TYPE SELECTOR */}
            <div className="bg-white border border-zinc-200 rounded-[2rem] p-5 shadow-sm space-y-3">
              <h3 className="font-black text-xs text-zinc-800 tracking-tight flex items-center gap-1.5 uppercase">
                <span>⚡</span> Note Type
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { 
                    id: 'detailed', 
                    label: 'Full Detailed Notes', 
                    icon: '📖' 
                  },
                  { 
                    id: 'revision', 
                    label: 'Short Revision Notes', 
                    icon: '⚡' 
                  }
                ].map((mode) => {
                  const isSelected = noteDepth === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        triggerVibration(10);
                        setNoteDepth(mode.id as 'detailed' | 'revision');
                      }}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600 border-purple-600 text-white shadow-md scale-[1.02]'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg select-none">{mode.icon}</span>
                        {isSelected && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <div>
                        <p className="font-black text-xs leading-tight">{mode.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* GENERATE BUTTON */}
            <button
              onClick={handleGenerateNotes}
              className="w-full py-4.5 bg-zinc-950 hover:bg-zinc-800 active:scale-98 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>Generate Handwritten Notes</span>
            </button>
          </div>

        ) : (

          /* STEP 2: INTERACTIVE HANDWRITTEN RULED NOTEBOOK VIEWER */
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-6 print:gap-0 print:max-w-none print:w-full">
            
            {/* RULED NOTEBOOK SHEETS CONTAINER */}
            <div className="w-full space-y-8 print:space-y-0 print:w-full print:m-0">
                
                {/* PAGE 1: CHAPTER OVERVIEW, CONCEPT MAP FLOWCHART & ANALOGY */}
                <article className="notebook-sheet notebook-page rounded-2xl border border-zinc-200/90 shadow-md p-6 sm:p-10 relative overflow-hidden handwritten-font text-zinc-900 border-l-[6px] border-l-rose-400">
                  
                  {/* Margin Doodles */}
                  <div className="no-print absolute top-6 left-2 flex flex-col gap-8 text-base select-none opacity-80">
                    <span>🍎</span>
                    <span>💡</span>
                    <span>⭐</span>
                    <span>⚡</span>
                  </div>

                  {/* Header Branding */}
                  <div className="flex items-center justify-between border-b-2 border-zinc-400/60 pb-3 mb-6">
                    <div className="flex items-center gap-2 text-rose-700 font-bold text-sm sm:text-base">
                      <span>★ HelpYou AI</span>
                      <span className="text-zinc-400">|</span>
                      <span className="text-zinc-700 text-xs sm:text-sm">Toppers Lined Notebook</span>
                    </div>
                    <div className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                      Topic: {notesData.metadata.chapter}
                    </div>
                  </div>

                  {/* Chapter Title & Metadata */}
                  <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-rose-700 tracking-tight leading-tight">
                      CH: {notesData.metadata.chapter}
                    </h1>
                    <p className="text-xs sm:text-sm text-zinc-600 font-semibold mt-1">
                      🎯 Target Exam: {notesData.metadata.exam} | Subject: {notesData.metadata.subject} | Syllabus: {notesData.metadata.syllabusAuthority}
                    </p>
                  </div>

                  {/* CONCEPT MAP FLOWCHART */}
                  {notesData.conceptMap && (
                    <div className="mb-8">
                      <h2 className="text-lg sm:text-xl font-bold text-indigo-900 border-b-2 border-indigo-200 pb-1 mb-4 flex items-center gap-2">
                        <span>🌳</span> Visual Concept Map & Dilemma
                      </h2>

                      {/* Root Node */}
                      <div className="max-w-md mx-auto p-3.5 bg-indigo-50 border-2 border-indigo-300 rounded-2xl text-center shadow-xs mb-3">
                        <p className="font-bold text-sm text-indigo-950">
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-bold">
                            {formatNotesMath(notesData.conceptMap.rootTitle)}
                          </GlobalMarkdown>
                        </p>
                        {notesData.conceptMap.rootDesc && (
                          <div className="text-xs text-indigo-800 mt-0.5 [&_p]:m-0">
                            <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">
                              {formatNotesMath(notesData.conceptMap.rootDesc)}
                            </GlobalMarkdown>
                          </div>
                        )}
                      </div>

                      <div className="text-center text-indigo-400 text-lg leading-none mb-3">
                        ↓↓ Split Decisions / Core Branches ↓↓
                      </div>

                      {/* Branches Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {notesData.conceptMap.branches.map((br, idx) => (
                          <div key={idx} className="p-4 bg-white/90 border-2 border-zinc-300 rounded-2xl shadow-xs">
                            <p className="font-black text-sm text-rose-700 border-b border-zinc-200 pb-1 mb-2">
                              Branch {idx + 1}:{' '}
                              <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-black">
                                {formatNotesMath(br.title)}
                              </GlobalMarkdown>
                            </p>
                            {br.subtitle && (
                              <div className="text-xs text-zinc-600 italic mb-2 [&_p]:m-0">
                                <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 italic">
                                  {formatNotesMath(br.subtitle)}
                                </GlobalMarkdown>
                              </div>
                            )}
                            <ul className="text-xs space-y-1.5 list-disc list-inside text-zinc-800">
                              {br.bullets.map((b, bIdx) => (
                                <li key={bIdx} className="leading-snug">
                                  <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">
                                    {formatNotesMath(b)}
                                  </GlobalMarkdown>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* THE ANALOGY STORY / MEMORY TRICK */}
                  {notesData.memoryTrick && (
                    <div className="p-4 sm:p-5 bg-amber-50/90 border-2 border-dashed border-amber-300 rounded-2xl shadow-xs mb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-400 text-amber-950 font-black text-xs uppercase tracking-wider">
                          🍌 Memory Trick Analogy
                        </span>
                        <h3 className="font-bold text-sm sm:text-base text-amber-950">
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-bold">
                            {formatNotesMath(notesData.memoryTrick.title)}
                          </GlobalMarkdown>
                        </h3>
                      </div>
                      <div className="text-xs sm:text-sm text-zinc-800 leading-relaxed italic mb-2 [&_p]:m-0">
                        "<GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 italic">{formatNotesMath(notesData.memoryTrick.analogyStory)}</GlobalMarkdown>"
                      </div>
                      {notesData.memoryTrick.keyTakeaway && (
                        <div className="p-2 bg-white/80 rounded-xl border border-amber-200 text-xs font-bold text-amber-900 flex items-start gap-1">
                          <span className="shrink-0">🔑 Takeaway:</span>
                          <div className="flex-1 min-w-0 [&_p]:m-0">
                            <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-bold">
                              {formatNotesMath(notesData.memoryTrick.keyTakeaway)}
                            </GlobalMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-zinc-300 pt-3 flex items-center justify-between text-xs text-zinc-500 font-bold">
                    <span>HelpYou AI Premium Toppers Notebook</span>
                    <span>Page 1 of {notesData.pages.length + 1}</span>
                  </div>
                </article>

                {/* DYNAMIC SUBSEQUENT PAGES */}
                {notesData.pages.map((pg, pIdx) => (
                  <article key={pIdx} className="notebook-sheet notebook-page rounded-2xl border border-zinc-200/90 shadow-md p-6 sm:p-10 relative overflow-hidden handwritten-font text-zinc-900 border-l-[6px] border-l-rose-400">
                    
                    {/* Margin Doodles */}
                    <div className="no-print absolute top-6 left-2 flex flex-col gap-8 text-base select-none opacity-80">
                      <span>📌</span>
                      <span>⭐</span>
                      <span>🔑</span>
                    </div>

                    {/* Header Branding */}
                    <div className="flex items-center justify-between border-b-2 border-zinc-400/60 pb-3 mb-6">
                      <div className="flex items-center gap-2 text-rose-700 font-bold text-sm sm:text-base">
                        <span>★ HelpYou AI</span>
                        <span className="text-zinc-400">|</span>
                        <span className="text-zinc-700 text-xs sm:text-sm">Toppers Lined Notebook</span>
                      </div>
                      <div className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                        Topic: {pg.pageTitle}
                      </div>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black text-rose-700 mb-1">
                      {pg.pageTitle}
                    </h2>
                    <p className="text-xs sm:text-sm text-zinc-600 italic font-semibold mb-4">
                      {pg.subtitle}
                    </p>

                    {/* High-Yield Bullet Points */}
                    <div className="space-y-2 mb-6">
                      {pg.points.map((pt, ptIdx) => (
                        <div key={ptIdx} className="flex items-start gap-2 text-xs sm:text-sm leading-relaxed">
                          <span className="text-rose-500 font-black mt-0.5">•</span>
                          <div className="flex-1 min-w-0 text-zinc-800 [&_p]:m-0 [&_p]:inline leading-relaxed">
                            <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-zinc-800">
                              {formatNotesMath(pt)}
                            </GlobalMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* COMPARISON TABLE (IF PRESENT) */}
                    {pg.comparisonTable && pg.comparisonTable.headers && (
                      <div className="mb-6 overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-400 text-xs sm:text-sm text-left">
                          <thead>
                            <tr className="bg-indigo-100/70 border-b-2 border-zinc-400">
                              {pg.comparisonTable.headers.map((h, hIdx) => (
                                <th key={hIdx} className="p-2.5 font-black text-indigo-950 border-r border-zinc-400">
                                  <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-black">
                                    {formatNotesMath(h)}
                                  </GlobalMarkdown>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pg.comparisonTable.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="border-b border-zinc-300 odd:bg-white/60 even:bg-zinc-50/40">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-2.5 border-r border-zinc-300 font-medium text-zinc-800">
                                    <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-medium">
                                      {formatNotesMath(cell)}
                                    </GlobalMarkdown>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* FORMULA CARD (IF PRESENT) */}
                    {pg.formulaBox && (
                      <div className="p-4 bg-amber-50/80 border-2 border-dashed border-amber-400 rounded-2xl mb-6 shadow-xs">
                        <p className="text-xs font-black uppercase tracking-wider text-amber-900 mb-1">
                          📐 {pg.formulaBox.name}
                        </p>
                        <div className="p-2.5 bg-white border border-amber-300 rounded-xl text-center font-bold text-base sm:text-lg text-rose-700 tracking-wide mb-2 shadow-inner overflow-x-auto">
                          <GlobalMarkdown className="[&_p]:m-0 text-rose-700 font-bold">
                            {formatFormulaBoxContent(pg.formulaBox.formula)}
                          </GlobalMarkdown>
                        </div>
                        <div className="text-xs text-zinc-700 space-y-0.5">
                          <p className="font-bold">Variables Breakdown:</p>
                          {pg.formulaBox.variables.map((v, vIdx) => (
                            <div key={vIdx} className="pl-2 flex items-start gap-1">
                              <span>•</span>
                              <div className="flex-1 min-w-0 [&_p]:m-0 [&_p]:inline">
                                <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">
                                  {formatNotesMath(v)}
                                </GlobalMarkdown>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* EXAM TIP BOX (IF PRESENT) */}
                    {pg.examTipBox && (
                      <div className="p-3.5 bg-blue-50/90 border-2 border-dashed border-blue-300 rounded-2xl mb-6 text-xs sm:text-sm text-blue-950">
                        <div className="flex items-center gap-1.5 font-black text-blue-900 mb-1">
                          <span>⚠️ Exam Tip:</span>
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-black">
                            {formatNotesMath(pg.examTipBox.title)}
                          </GlobalMarkdown>
                        </div>
                        <div className="leading-snug [&_p]:m-0">
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">
                            {formatNotesMath(pg.examTipBox.content)}
                          </GlobalMarkdown>
                        </div>
                      </div>
                    )}

                    {/* LAST PAGE SPECIAL: CRUCIAL EXAM TRAP & SOLVED CASE STUDY */}
                    {pIdx === notesData.pages.length - 1 && notesData.crucialExamTrap && (
                      <div className="p-4 bg-rose-50/90 border-2 border-dashed border-rose-300 rounded-2xl mb-6 text-xs sm:text-sm text-rose-950">
                        <div className="flex items-center gap-1.5 font-black text-rose-900 mb-1">
                          <span>🚨 Crucial Exam Point:</span>
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-black">
                            {formatNotesMath(notesData.crucialExamTrap.title)}
                          </GlobalMarkdown>
                        </div>
                        <div className="leading-snug mb-1 [&_p]:m-0">
                          ❌ <em>Common Illusion:</em>{' '}
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">
                            {formatNotesMath(notesData.crucialExamTrap.misconception)}
                          </GlobalMarkdown>
                        </div>
                        <div className="leading-snug font-bold text-emerald-800 [&_p]:m-0">
                          ✅ <em>The Authentic Truth:</em>{' '}
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-bold text-emerald-800">
                            {formatNotesMath(notesData.crucialExamTrap.correctTruth)}
                          </GlobalMarkdown>
                        </div>
                        <div className="text-[11px] font-black uppercase tracking-wider text-rose-700 mt-1 [&_p]:m-0">
                          Rule:{' '}
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-black text-rose-700">
                            {formatNotesMath(notesData.crucialExamTrap.rule)}
                          </GlobalMarkdown>
                        </div>
                      </div>
                    )}

                    {pIdx === notesData.pages.length - 1 && notesData.solvedCaseStudy && (
                      <div className="p-4 bg-emerald-50/80 border-2 border-emerald-300 rounded-2xl mb-6 text-xs sm:text-sm text-emerald-950">
                        <div className="flex items-center gap-1.5 font-black text-emerald-900 mb-1.5">
                          <span>💡 Solved Case Study / Numerical:</span>
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 font-black">
                            {formatNotesMath(notesData.solvedCaseStudy.title)}
                          </GlobalMarkdown>
                        </div>
                        <div className="text-zinc-800 italic mb-2 leading-snug [&_p]:m-0">
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 italic">
                            {formatNotesMath(notesData.solvedCaseStudy.problemScenario)}
                          </GlobalMarkdown>
                        </div>
                        <div className="space-y-1 mb-2 pl-2 border-l-2 border-emerald-400">
                          {notesData.solvedCaseStudy.steps.map((st, sIdx) => (
                            <div key={sIdx} className="leading-snug [&_p]:m-0">
                              <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0">
                                {formatNotesMath(st)}
                              </GlobalMarkdown>
                            </div>
                          ))}
                        </div>
                        <div className="p-2 bg-emerald-600 text-white rounded-xl font-black text-xs text-center shadow-xs">
                          <span>Verified Result: </span>
                          <GlobalMarkdown className="inline [&_p]:inline [&_p]:m-0 text-white font-black">
                            {formatNotesMath(notesData.solvedCaseStudy.finalResult)}
                          </GlobalMarkdown>
                        </div>
                      </div>
                    )}

                    <div className="border-t border-zinc-300 pt-3 flex items-center justify-between text-xs text-zinc-500 font-bold">
                      <span>HelpYou AI Premium Toppers Notebook</span>
                      <span>Page {pIdx + 2} of {notesData.pages.length + 1}</span>
                    </div>
                  </article>
                ))}

              </div>
          </div>
        )}

      </div>

      {/* Saved Notes (Cross-Device Cloud Synced) History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 no-print"
            onClick={() => setShowHistoryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-200"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold shadow-xs">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm sm:text-base text-zinc-900 leading-tight flex items-center gap-2">
                      <span>My Saved Notes</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <Cloud className="w-3 h-3" /> Cloud Synced
                      </span>
                    </h3>
                    <p className="text-[11px] font-semibold text-zinc-500 mt-0.5">
                      {historyItems.length} {historyItems.length === 1 ? 'note' : 'notes'} saved across all your devices
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body - Notes List */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {syncingCloud && (
                  <div className="p-3 bg-purple-50/80 border border-purple-200/80 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-purple-700">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Syncing latest notes from your cloud account...</span>
                  </div>
                )}

                {historyItems.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-400 flex items-center justify-center text-2xl mb-3 shadow-inner">
                      📓
                    </div>
                    <h4 className="font-extrabold text-sm text-zinc-800">No Saved Notes Yet</h4>
                    <p className="text-xs text-zinc-500 max-w-xs mt-1 leading-relaxed">
                      Generate notes for any chapter above. They will automatically be 100% securely backed up to your cloud account across all your devices!
                    </p>
                  </div>
                ) : (
                  historyItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleOpenNote(item)}
                      className="p-3.5 bg-zinc-50/80 hover:bg-purple-50/50 border border-zinc-200/80 hover:border-purple-300 rounded-2xl transition-all cursor-pointer group flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-700">
                            {item.subject}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400">
                            {item.exam}
                          </span>
                        </div>
                        <h4 className="font-black text-xs sm:text-sm text-zinc-900 truncate group-hover:text-purple-700 transition-colors">
                          {item.chapter}
                        </h4>
                        <p className="text-[10px] font-semibold text-zinc-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.timestamp).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenNote(item);
                          }}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                        >
                          <span>Open</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteNote(item.id, e)}
                          className="p-1.5 rounded-xl hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                          title="Delete Note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3.5 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-[11px] font-bold text-zinc-500 shrink-0">
                <div className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Protected by Cloud Backup</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration(10);
                    fetchCloudNotes();
                  }}
                  className="text-purple-600 hover:text-purple-700 flex items-center gap-1 font-black cursor-pointer"
                >
                  <RotateCcw className={`w-3 h-3 ${syncingCloud ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
