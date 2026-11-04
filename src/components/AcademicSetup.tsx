import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, GraduationCap, ArrowLeft, ArrowRight, Globe, Target, BookOpen, Sparkles, X, AlertCircle, Loader2, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeSetItem, safeGetItem } from '../utils/storage';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getApiUrl } from '../utils/api';
import { resolveRealCountry } from '../utils/profile';
import { findPreVerifiedExam } from '../utils/preVerifiedExams';

interface AcademicSetupProps {
  userId: string;
  onComplete: () => void;
  onCancel?: () => void;
}

export const COUNTRIES = [
  { id: 'IN', name: 'India', flag: '🇮🇳', regionSystem: 'IN' },
  { id: 'USA', name: 'United States', flag: '🇺🇸', regionSystem: 'USA' },
  { id: 'UK', name: 'United Kingdom', flag: '🇬🇧', regionSystem: 'UK' },
  { id: 'CA', name: 'Canada', flag: '🇨🇦', regionSystem: 'CA' },
  { id: 'AU', name: 'Australia', flag: '🇦🇺', regionSystem: 'AU' },
  { id: 'Other', name: 'Others', flag: '🌍', regionSystem: 'Global' },
];

export const GRADES = [
  { id: '9th Grade (Freshman)', label: '9th Grade', desc: 'Freshman High School', isCollege: false },
  { id: '10th Grade (Sophomore)', label: '10th Grade', desc: 'Sophomore High School', isCollege: false },
  { id: '11th Grade (Junior)', label: '11th Grade', desc: 'Junior High School', isCollege: false },
  { id: '12th Grade (Senior)', label: '12th Grade', desc: 'Senior High School', isCollege: false },
  { id: 'College Freshman', label: 'College Year 1', desc: 'Freshman Undergrad', isCollege: true },
  { id: 'College Sophomore', label: 'College Year 2', desc: 'Sophomore Undergrad', isCollege: true },
  { id: 'College Junior', label: 'College Year 3', desc: 'Junior Undergrad', isCollege: true },
  { id: 'College Senior', label: 'College Year 4', desc: 'Senior Undergrad', isCollege: true },
];

export const DEFAULT_SUBJECTS = [
  { id: 'Mathematics', title: 'Mathematics', subtitle: 'Calculus, Algebra, Geometry & Statistics', icon: '📐', color: 'from-blue-500 to-indigo-500' },
  { id: 'Physics', title: 'Physics', subtitle: 'Mechanics, Optics, Thermodynamics & Waves', icon: '⚡', color: 'from-purple-500 to-indigo-500' },
  { id: 'Chemistry', title: 'Chemistry', subtitle: 'Organic, Inorganic & Physical Chemistry', icon: '🧪', color: 'from-pink-500 to-rose-500' },
  { id: 'Biology', title: 'Biology & Life Sciences', subtitle: 'Genetics, Physiology, Botany & Zoology', icon: '🧬', color: 'from-emerald-500 to-teal-500' },
  { id: 'Computer Science', title: 'Computer Science & AI', subtitle: 'Coding, Data Structures & Python/Java', icon: '💻', color: 'from-cyan-500 to-blue-500' },
  { id: 'English & Literature', title: 'English & Literature', subtitle: 'Comprehension, Grammar, Essay & Writing', icon: '📚', color: 'from-amber-500 to-orange-500' },
  { id: 'History & Social Studies', title: 'History & Social Studies', subtitle: 'World History, Civics & Political Science', icon: '🏛️', color: 'from-rose-500 to-red-500' },
  { id: 'Economics & Commerce', title: 'Economics & Business', subtitle: 'Micro/Macroeconomics, Finance & Commerce', icon: '📊', color: 'from-violet-500 to-purple-500' },
];

const SUBJECT_COLORS = [
  'from-blue-500 to-indigo-500',
  'from-purple-500 to-indigo-500',
  'from-pink-500 to-rose-500',
  'from-emerald-500 to-teal-500',
  'from-cyan-500 to-blue-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-red-500',
  'from-violet-500 to-purple-500',
];

// Preserved for backwards compatibility with any legacy imports
export const REGIONAL_TRACKS: Record<string, Array<{ id: string; title: string; subtitle: string; icon: string; color: string }>> = {
  'United States': [],
  'United Kingdom': [],
  'Canada': [],
  'Australia': [],
  'Others': [],
  'Others / International': []
};

export default function AcademicSetup({ userId, onComplete, onCancel }: AcademicSetupProps) {
  // 4 Dedicated Selection Steps
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Country Selection
  const [selectedCountryId, setSelectedCountryId] = useState<string>(() => {
    const savedCountry = safeGetItem(`academic_country_${userId}`) || safeGetItem('academic_country');
    const matched = COUNTRIES.find(c => c.name === savedCountry || c.id === savedCountry);
    return matched ? matched.id : (savedCountry && savedCountry !== 'India' && savedCountry !== 'United States' ? 'Other' : 'IN');
  });
  const [customCountry, setCustomCountry] = useState<string>(() => {
    const savedCustom = (userId ? safeGetItem(`academic_custom_country_${userId}`) : null) || safeGetItem('academic_custom_country');
    if (savedCustom && savedCustom !== 'Others' && savedCustom !== 'Other') return savedCustom;
    const savedCountry = (userId ? safeGetItem(`academic_country_${userId}`) : null) || safeGetItem('academic_country');
    if (savedCountry && savedCountry !== 'Others' && savedCountry !== 'Other' && !COUNTRIES.some(c => c.name === savedCountry)) {
      return savedCountry;
    }
    return '';
  });
  const [countryError, setCountryError] = useState<string | null>(null);

  // Step 2: Target Exam Selection & AI Verification
  const [targetExam, setTargetExam] = useState<string>(() => {
    return safeGetItem(`academic_exam_${userId}`) || safeGetItem('academic_exam') || safeGetItem('target_exam') || '';
  });
  const [isVerifyingExam, setIsVerifyingExam] = useState<boolean>(false);
  const [examError, setExamError] = useState<string | null>(null);

  // Deep Research Loading & Calibration Modal States
  const [isDeepResearching, setIsDeepResearching] = useState<boolean>(false);
  const [researchStage, setResearchStage] = useState<number>(1);
  const [researchMessage, setResearchMessage] = useState<string>('Connecting to Official Examination Registry...');

  // AI-Researched Exam Subjects for Step 4
  const [verifiedExamSubjects, setVerifiedExamSubjects] = useState<Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    color: string;
  }>>(() => {
    const cached = safeGetItem(`cached_exam_subjects_${userId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return DEFAULT_SUBJECTS;
  });

  const [examHasElectives, setExamHasElectives] = useState<boolean | null>(() => {
    const cached = safeGetItem(`cached_exam_has_electives_${userId}`);
    return cached !== null ? cached === 'true' : null;
  });

  // AI-Researched Exam Grades / Classes for Step 3
  const [verifiedExamGrades, setVerifiedExamGrades] = useState<Array<{
    id: string;
    label: string;
    desc: string;
    isCollege?: boolean;
  }>>(() => {
    const cached = safeGetItem(`cached_exam_grades_${userId}`) || safeGetItem('cached_exam_grades');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return GRADES;
  });

  // Step 3: Grade Level Selection
  const [selectedGrade, setSelectedGrade] = useState<string>(() => {
    return safeGetItem(`academic_grade_${userId}`) || safeGetItem('academic_grade') || '11th Grade (Junior)';
  });

  // Step 4: Multi-Subject Selection
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(() => {
    const activeUid = userId || auth.currentUser?.uid || '';
    const savedList = (activeUid ? safeGetItem(`academic_subjects_${activeUid}`) : null) || safeGetItem('academic_subjects');
    if (savedList) {
      try {
        const parsed = JSON.parse(savedList);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {
        const split = savedList.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (split.length > 0) return split;
      }
    }
    const singleSaved = (activeUid ? safeGetItem(`academic_subject_${activeUid}`) : null) || safeGetItem('academic_subject') || safeGetItem('subject');
    if (singleSaved) {
      const split = singleSaved.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (split.length > 0) return split;
    }
    return ['Mathematics'];
  });
  const [customSubject, setCustomSubject] = useState<string>(() => {
    const activeUid = userId || auth.currentUser?.uid || '';
    return (activeUid ? safeGetItem(`academic_custom_subject_${activeUid}`) : null) || safeGetItem('academic_custom_subject') || '';
  });

  const toggleSubject = (subjId: string) => {
    triggerVibration(10);
    setSelectedSubjectIds((prev) => {
      if (prev.includes(subjId)) {
        if (prev.length <= 1) {
          return prev; // Keep at least one subject selected
        }
        return prev.filter(id => id !== subjId);
      } else {
        if (subjId === 'Other') {
          setTimeout(() => {
            if (subjectScrollRef.current) {
              subjectScrollRef.current.scrollTo({ top: subjectScrollRef.current.scrollHeight, behavior: 'smooth' });
            }
            otherSubjectBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            customSubjectInputRef.current?.focus({ preventScroll: true });
          }, 80);
        }
        return [...prev, subjId];
      }
    });
  };

  // Auto-scroll refs for dynamic typeboxes when "Others" is selected
  const countryScrollRef = useRef<HTMLDivElement>(null);
  const otherCountryBoxRef = useRef<HTMLDivElement>(null);
  const customCountryInputRef = useRef<HTMLInputElement>(null);

  const subjectScrollRef = useRef<HTMLDivElement>(null);
  const otherSubjectBoxRef = useRef<HTMLDivElement>(null);
  const customSubjectInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll down when 'Others' country option is chosen
  useEffect(() => {
    if (step === 1 && selectedCountryId === 'Other') {
      const timer = setTimeout(() => {
        if (countryScrollRef.current) {
          countryScrollRef.current.scrollTo({
            top: countryScrollRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
        otherCountryBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        customCountryInputRef.current?.focus({ preventScroll: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedCountryId, step]);

  // Auto-scroll down when 'Other Subjects' option is chosen
  useEffect(() => {
    if (step === 4 && selectedSubjectIds.includes('Other')) {
      const timer = setTimeout(() => {
        if (subjectScrollRef.current) {
          subjectScrollRef.current.scrollTo({
            top: subjectScrollRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
        otherSubjectBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        customSubjectInputRef.current?.focus({ preventScroll: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedSubjectIds, step]);

  const handleNextStep = async () => {
    triggerVibration(15);

    if (step === 1) {
      if (selectedCountryId === 'Other') {
        const trimmedCustom = customCountry.trim();
        if (!trimmedCustom) {
          setCountryError("Please type your country name (e.g. India, Germany, UAE).");
          customCountryInputRef.current?.focus();
          triggerVibration(25);
          return;
        }
        // Immediately persist custom country so it is never lost
        safeSetItem('academic_country', trimmedCustom);
        safeSetItem('academic_custom_country', trimmedCustom);
        if (userId) {
          safeSetItem(`academic_country_${userId}`, trimmedCustom);
          safeSetItem(`academic_custom_country_${userId}`, trimmedCustom);
        }
      }
      setCountryError(null);
      setStep(2); // From Country -> Exam
      return;
    } 
    
    if (step === 2) {
      // Step 2: Verify exam existence with AI and research official subjects
      const trimmed = targetExam.trim();
      if (!trimmed) {
        setExamError("Please enter the exam name you are preparing for.");
        return;
      }

      setExamError(null);
      setIsVerifyingExam(true);

      const countryObj = COUNTRIES.find(c => c.id === selectedCountryId) || COUNTRIES[0];
      let finalCountry = selectedCountryId === 'Other' 
        ? ((customCountry || '').trim() || 'Global') 
        : countryObj.name;
      
      // Auto-resolve real country if exam name unambiguously identifies national curriculum (e.g. NEET/JEE/CBSE -> India)
      finalCountry = resolveRealCountry(finalCountry, customCountry, trimmed);

      // 0. FAST-PATH: Instant sub-millisecond check for recognized national & global exams (100% offline & network-proof for APK)
      const preVerified = findPreVerifiedExam(trimmed, finalCountry);
      if (preVerified) {
        if (preVerified.officialExamName) {
          setTargetExam(preVerified.officialExamName);
        }
        if (preVerified.country) {
          const matchedCountry = COUNTRIES.find(
            c => c.name.toLowerCase() === preVerified.country.toLowerCase() || 
                 c.id.toLowerCase() === preVerified.country.toLowerCase()
          );
          if (matchedCountry) {
            setSelectedCountryId(matchedCountry.id);
            safeSetItem('academic_country', matchedCountry.name);
            if (userId) safeSetItem(`academic_country_${userId}`, matchedCountry.name);
          }
        }
        if (Array.isArray(preVerified.subjects) && preVerified.subjects.length > 0) {
          const mapped = preVerified.subjects.map((s, idx) => ({
            id: s.id || s.title,
            title: s.title || s.id,
            subtitle: s.subtitle || 'Official Exam Syllabus Topic',
            icon: s.icon || '📚',
            color: SUBJECT_COLORS[idx % SUBJECT_COLORS.length]
          }));
          setVerifiedExamSubjects(mapped);
          safeSetItem(`cached_exam_subjects_${userId}`, JSON.stringify(mapped));
          const hasElectivesBool = Boolean(preVerified.hasElectives);
          setExamHasElectives(hasElectivesBool);
          safeSetItem(`cached_exam_has_electives_${userId}`, String(hasElectivesBool));
          setSelectedSubjectIds(mapped.map(m => m.id));
        }
        if (Array.isArray(preVerified.grades) && preVerified.grades.length > 0) {
          const mappedGrades = preVerified.grades.map(g => ({
            id: g.id || g.label,
            label: g.label || g.id,
            desc: g.desc || 'Exam preparation grade level',
            isCollege: Boolean(g.isCollege)
          }));
          setVerifiedExamGrades(mappedGrades);
          safeSetItem(`cached_exam_grades_${userId}`, JSON.stringify(mappedGrades));
          safeSetItem('cached_exam_grades', JSON.stringify(mappedGrades));
          if (!mappedGrades.some(g => g.id === selectedGrade)) {
            setSelectedGrade(mappedGrades[0].id);
          }
        }
        setIsVerifyingExam(false);
        setStep(3);
        return;
      }



      try {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 9000);
        const res = await fetch(getApiUrl('/api/verify-and-research-exam'), {
          signal: abortController.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: finalCountry, examName: trimmed })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          const msg = errData?.errorMessage || errData?.error || "Could not verify this exam with official records. Please try again.";
          throw new Error(msg);
        }

        clearTimeout(timeoutId);
        const data = await res.json();

        // 1. If exam does NOT exist, show error and stay on Step 2
        if (!data.isValid) {
          setExamError(data.errorMessage || `We could not verify "${trimmed}". Please check the spelling or enter a recognized exam name.`);
          setIsVerifyingExam(false);
          triggerVibration(25);
          return;
        }

        // 2. Exam is VALID: Set standardized title and researched subjects
        if (data.officialExamName) {
          setTargetExam(data.officialExamName);
        }

        // Seamlessly auto-sync country if exam belongs to a specific nation
        if (data.detectedCountry) {
          const matchedCountry = COUNTRIES.find(
            c => c.name.toLowerCase() === data.detectedCountry.toLowerCase() || 
                 c.id.toLowerCase() === data.detectedCountry.toLowerCase()
          );
          if (matchedCountry) {
            setSelectedCountryId(matchedCountry.id);
            safeSetItem('academic_country', matchedCountry.name);
            if (userId) safeSetItem(`academic_country_${userId}`, matchedCountry.name);
          } else if (data.detectedCountry !== 'Global') {
            setSelectedCountryId('Other');
            setCustomCountry(data.detectedCountry);
            safeSetItem('academic_country', data.detectedCountry);
            safeSetItem('academic_custom_country', data.detectedCountry);
            if (userId) {
              safeSetItem(`academic_country_${userId}`, data.detectedCountry);
              safeSetItem(`academic_custom_country_${userId}`, data.detectedCountry);
            }
          }
        }

        if (Array.isArray(data.subjects) && data.subjects.length > 0) {
          const mapped = data.subjects.map((s: any, idx: number) => ({
            id: s.id || s.title,
            title: s.title || s.id,
            subtitle: s.subtitle || 'Official Exam Syllabus Topic',
            icon: s.icon || '📚',
            color: SUBJECT_COLORS[idx % SUBJECT_COLORS.length]
          }));

          setVerifiedExamSubjects(mapped);
          safeSetItem(`cached_exam_subjects_${userId}`, JSON.stringify(mapped));

          const hasElectivesBool = typeof data.hasElectives === 'boolean' 
            ? data.hasElectives 
            : mapped.length >= 6;
          setExamHasElectives(hasElectivesBool);
          safeSetItem(`cached_exam_has_electives_${userId}`, String(hasElectivesBool));

          // Pre-select all researched official subjects for this examination
          setSelectedSubjectIds(mapped.map((m: any) => m.id));
        }

        // 3. Process AI-researched grades / classes for this specific exam
        if (Array.isArray(data.grades) && data.grades.length > 0) {
          const mappedGrades = data.grades.map((g: any) => ({
            id: g.id || g.label,
            label: g.label || g.id,
            desc: g.desc || 'Exam preparation grade level',
            isCollege: Boolean(g.isCollege)
          }));

          setVerifiedExamGrades(mappedGrades);
          safeSetItem(`cached_exam_grades_${userId}`, JSON.stringify(mappedGrades));
          safeSetItem('cached_exam_grades', JSON.stringify(mappedGrades));

          // Auto-select the first grade if current selectedGrade is not in the researched list
          if (!mappedGrades.some((g: any) => g.id === selectedGrade)) {
            setSelectedGrade(mappedGrades[0].id);
          }
        }

        setIsVerifyingExam(false);
        setStep(3); // Advance to Grade selection
            } catch (err: any) {
        console.warn("[AcademicSetup] AI exam verification network error/timeout, activating resilient auto-curation:", err);
        // Resilient Fallback: Never block student on Step 2 due to network drop or Vercel serverless timeout
        const fallbackSubjects = [
          { id: 'Section_1', title: `${trimmed} - Section 1 / Core Syllabus`, subtitle: 'Core Subjects & Fundamental Principles', icon: '📚', color: SUBJECT_COLORS[0] },
          { id: 'Section_2', title: `${trimmed} - Section 2 / Advanced Papers`, subtitle: 'Analytical Concepts & Advanced Working', icon: '⚡', color: SUBJECT_COLORS[1] },
          { id: 'Aptitude_Reasoning', title: 'Quantitative Aptitude & Logical Reasoning', subtitle: 'Numerical Ability, Logic & Analytical Skills', icon: '🧠', color: SUBJECT_COLORS[2] },
          { id: 'Language_Comprehension', title: 'Language & Reading Comprehension', subtitle: 'Verbal Ability & Textual Analysis', icon: '📖', color: SUBJECT_COLORS[3] }
        ];
        const fallbackGrades = [
          { id: 'Final_Year_Candidate', label: 'Final Exam Appearing Year', desc: 'Active Candidate / Final Year', isCollege: false },
          { id: 'Foundation_Year', label: 'Foundation / 1st Year Prep', desc: 'Early Syllabus Preparation', isCollege: false },
          { id: 'Dedicated_Aspirant', label: 'Dedicated Full-Time Aspirant', desc: 'Comprehensive Prep / Self-Study', isCollege: false }
        ];
        setVerifiedExamSubjects(fallbackSubjects);
        safeSetItem(`cached_exam_subjects_${userId}`, JSON.stringify(fallbackSubjects));
        setExamHasElectives(false);
        safeSetItem(`cached_exam_has_electives_${userId}`, 'false');
        setSelectedSubjectIds(fallbackSubjects.map(m => m.id));

        setVerifiedExamGrades(fallbackGrades);
        safeSetItem(`cached_exam_grades_${userId}`, JSON.stringify(fallbackGrades));
        safeSetItem('cached_exam_grades', JSON.stringify(fallbackGrades));
        setSelectedGrade(fallbackGrades[0].id);

        setIsVerifyingExam(false);
        setStep(3);
        return;
      }
      return;
    } 
    
    if (step === 3) {
      setStep(4); // From Grade -> Subjects
      return;
    }
  };

  const handleBackStep = () => {
    triggerVibration(10);
    setExamError(null);
    if (step === 4) {
      setStep(3); // From Subjects -> Grade
    } else if (step === 3) {
      setStep(2); // From Grade -> Exam
    } else if (step === 2) {
      setStep(1); // From Exam -> Country
    } else if (step === 1 && onCancel) {
      onCancel();
    }
  };

  // Show "Other Subjects" only if exam has many electives (6+ subjects), never for fixed 2-4 subject exams like NEET or JEE
  const shouldShowOtherSubjects = examHasElectives !== null
    ? (examHasElectives === true && verifiedExamSubjects.length >= 6)
    : (verifiedExamSubjects.length >= 6);

  const displayedSubjects = shouldShowOtherSubjects
    ? [
        ...verifiedExamSubjects,
        {
          id: 'Other',
          title: 'Other Subjects',
          subtitle: 'Type your custom subject or course name',
          icon: '✏️',
          color: 'from-zinc-700 to-zinc-900'
        }
      ]
    : verifiedExamSubjects;

  const handleFinish = async () => {
    triggerVibration(25);
    
    const countryObj = COUNTRIES.find(c => c.id === selectedCountryId) || COUNTRIES[0];
    const finalCountry = selectedCountryId === 'Other' 
      ? ((customCountry || '').trim() || 'Global') 
      : countryObj.name;
    const finalExam = (targetExam || '').trim() || 'General Studies';
    const effectiveRegion = finalCountry.toLowerCase() === 'india' ? 'India' : countryObj.regionSystem;
    
    // Resolve final subjects list from multi-selection
    const finalSubjectsList: string[] = [];
    selectedSubjectIds.forEach(id => {
      if (id === 'Other') {
        if (!shouldShowOtherSubjects) return;
        const trimmedCustom = (customSubject || '').trim();
        if (trimmedCustom) {
          trimmedCustom.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((s: string) => {
            if (!finalSubjectsList.includes(s)) finalSubjectsList.push(s);
          });
        } else {
          if (!finalSubjectsList.includes('Other Subjects')) finalSubjectsList.push('Other Subjects');
        }
      } else {
        const match = [...verifiedExamSubjects, ...DEFAULT_SUBJECTS].find(s => s.id === id);
        const title = match?.title || id;
        if (!finalSubjectsList.includes(title)) finalSubjectsList.push(title);
      }
    });

    if (finalSubjectsList.length === 0) {
      finalSubjectsList.push('Mathematics');
    }

    const finalSubject = finalSubjectsList.join(', ');

    // Find study level based on grade (High School vs College)
    const gradeObj = [...verifiedExamGrades, ...GRADES].find(g => g.id === selectedGrade);
    const studyLevel = gradeObj?.isCollege ? 'College' : 'High School';

    // Start 5-Stage Live Deep Research
    setIsDeepResearching(true);
    setResearchStage(1);
    setResearchMessage(`Connecting to Official ${finalExam} Examination Registry...`);

    // Dynamic stage progression timer while waiting for API
    const stageTimer1 = setTimeout(() => {
      setResearchStage(2);
      setResearchMessage(`Curating official syllabus & core units for ${finalSubjectsList.length} subjects...`);
    }, 1100);

    const stageTimer2 = setTimeout(() => {
      setResearchStage(3);
      setResearchMessage(`Analyzing official marks weightage & negative marking rules...`);
    }, 2400);

    const stageTimer3 = setTimeout(() => {
      setResearchStage(4);
      setResearchMessage(`Extracting authentic examination question patterns & style...`);
    }, 3800);

    let researchedBlueprint: any = null;

    try {
      const res = await fetch(getApiUrl('/api/deep-research-exam-blueprint'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: finalCountry,
          examName: finalExam,
          grade: selectedGrade,
          subjects: finalSubjectsList
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data) {
          researchedBlueprint = data.subjectsBlueprint || data;
          if (data.examOverview) {
            safeSetItem('exam_overview', JSON.stringify(data.examOverview));
          }
        }
      }
    } catch (apiErr) {
      console.warn("[AcademicSetup] Deep research network fallback:", apiErr);
    }

    clearTimeout(stageTimer1);
    clearTimeout(stageTimer2);
    clearTimeout(stageTimer3);

    // Stage 5: Finalizing & Securing
    setResearchStage(5);
    setResearchMessage('Permanently calibrating and securing your Academic DNA! ✓');
    triggerVibration(30);

    // Save selections locally
    safeSetItem('academic_country', finalCountry);
    safeSetItem('academic_custom_country', finalCountry);
    safeSetItem('academic_region', effectiveRegion);
    safeSetItem('academic_exam', finalExam);
    safeSetItem('target_exam', finalExam);
    safeSetItem('academic_grade', selectedGrade);
    safeSetItem('onboarding_grade', studyLevel);
    safeSetItem('academic_subjects', JSON.stringify(finalSubjectsList));
    safeSetItem('academic_subject', finalSubject);
    safeSetItem('selected_subject', finalSubject);
    safeSetItem('subject', finalSubject);
    safeSetItem('academic_stream', finalSubject); // backward compatibility
    safeSetItem('academic_custom_subject', customSubject);

    if (researchedBlueprint) {
      safeSetItem('user_exam_blueprint', JSON.stringify(researchedBlueprint));
      safeSetItem('academic_exam_blueprint', JSON.stringify(researchedBlueprint));

      // STRICT ISOLATED STORAGE PER SUBJECT (No Cross-Subject Contamination)
      Object.keys(researchedBlueprint).forEach((subj) => {
        const cleanSubjKey = subj.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        const subjDataStr = JSON.stringify(researchedBlueprint[subj]);
        safeSetItem(`exam_subject_blueprint_${cleanSubjKey}`, subjDataStr);
      });
    }

    safeSetItem('onboarding_completed', 'true');
    safeSetItem('academic_setup_completed', 'true');
    safeSetItem('isOnboardingComplete', 'true');
    safeSetItem('isOnboardingCompleted', 'true');

    // Save for this specific user locally
    const activeUid = userId || auth.currentUser?.uid || '';
    if (activeUid) {
      safeSetItem('helpyou_active_user_session', 'true');
      safeSetItem('last_logged_in_user', activeUid);
      safeSetItem(`academic_country_${activeUid}`, finalCountry);
      safeSetItem(`academic_custom_country_${activeUid}`, finalCountry);
      safeSetItem(`academic_region_${activeUid}`, effectiveRegion);
      safeSetItem(`academic_exam_${activeUid}`, finalExam);
      safeSetItem(`target_exam_${activeUid}`, finalExam);
      safeSetItem(`academic_grade_${activeUid}`, selectedGrade);
      safeSetItem(`onboarding_grade_${activeUid}`, studyLevel);
      safeSetItem(`academic_subjects_${activeUid}`, JSON.stringify(finalSubjectsList));
      safeSetItem(`academic_subject_${activeUid}`, finalSubject);
      safeSetItem(`selected_subject_${activeUid}`, finalSubject);
      safeSetItem(`subject_${activeUid}`, finalSubject);
      safeSetItem(`academic_stream_${activeUid}`, finalSubject);
      safeSetItem(`academic_custom_subject_${activeUid}`, customSubject);

      if (researchedBlueprint) {
        safeSetItem(`user_exam_blueprint_${activeUid}`, JSON.stringify(researchedBlueprint));

        // Isolated per-subject key for user
        Object.keys(researchedBlueprint).forEach((subj) => {
          const cleanSubjKey = subj.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
          safeSetItem(`exam_subject_blueprint_${cleanSubjKey}_${activeUid}`, JSON.stringify(researchedBlueprint[subj]));
        });
      }

      safeSetItem(`academic_setup_completed_${activeUid}`, 'true');
      safeSetItem(`onboarding_completed_${activeUid}`, 'true');
      safeSetItem(`isOnboardingComplete_${activeUid}`, 'true');
      safeSetItem(`isOnboardingCompleted_${activeUid}`, 'true');

      // Update Firestore user document with isOnboardingComplete and selections
      try {
        const userDocPayload: any = {
          isOnboardingComplete: true,
          isOnboardingCompleted: true,
          country: finalCountry,
          academic_country: finalCountry,
          academic_custom_country: finalCountry,
          customCountry: finalCountry,
          targetExam: finalExam,
          exam: finalExam,
          academic_exam: finalExam,
          grade: selectedGrade,
          academic_grade: selectedGrade,
          subjects: finalSubjectsList,
          academic_subjects: finalSubjectsList,
          subject: finalSubject,
          selectedSubject: finalSubject,
          academic_subject: finalSubject,
          stream: finalSubject,
          academic_stream: finalSubject,
          regionSystem: effectiveRegion,
          updatedAt: new Date().toISOString()
        };

        if (researchedBlueprint) {
          userDocPayload.examBlueprint = researchedBlueprint;
          userDocPayload.academicBlueprint = researchedBlueprint;
          userDocPayload.subjectsBlueprint = researchedBlueprint;
          if (researchedOverview) userDocPayload.examOverview = researchedOverview;
          userDocPayload.blueprintLastUpdated = new Date().toISOString();
        }

        await setDoc(doc(db, 'users', activeUid), userDocPayload, { merge: true });
        console.log(`[AcademicSetup] Successfully updated user ${activeUid} with calibrated exam blueprint.`);
      } catch (dbErr) {
        console.error('[AcademicSetup] Error saving setup state to Firestore:', dbErr);
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('academic_profile_updated'));
    } catch (_) {}

    // Brief 800ms celebration confirmation for user
    await new Promise(r => setTimeout(r, 800));
    setIsDeepResearching(false);
    onComplete();
  };

  return (
    <div className="absolute inset-0 z-[80] bg-white text-zinc-900 flex flex-col h-[100dvh] overflow-hidden select-none font-sans">
      {/* Decorative background light bubbles */}
      <div className="absolute top-[-5%] left-[-10%] w-72 h-72 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Progress Header */}
      <div className="w-full px-6 pt-7 pb-2.5 flex items-center justify-between shrink-0 z-10 max-w-sm mx-auto">
        <div className="flex items-center gap-1.5">
          <GraduationCap className="w-5 h-5 text-purple-600 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-purple-600">Personalize Tutor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-100 px-2.5 py-1 rounded-full border border-zinc-150">
            Step {step} of 4
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={() => {
                triggerVibration(10);
                onCancel();
              }}
              className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Close Setup"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Step Visual Progress Bar */}
      <div className="w-full px-6 pb-2 shrink-0 z-10 flex items-center gap-1.5 max-w-sm mx-auto">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              s <= step ? 'bg-purple-600' : 'bg-zinc-200'
            }`}
          />
        ))}
      </div>

      {/* Content Area with Slide Animation */}
      <div className="flex-1 px-6 flex flex-col justify-center max-w-sm mx-auto w-full min-h-0 z-10">
        <AnimatePresence mode="wait">
          {/* STEP 1: Country Selection */}
          {step === 1 && (
            <motion.div
              key="step-country"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-center min-h-0 py-2"
            >
              <div className="text-left mb-3 shrink-0">
                <h1 className="text-2xl font-black text-zinc-950 tracking-tight leading-tight">
                  Select your country
                </h1>
                <p className="text-xs text-zinc-500 font-semibold mt-1">
                  For your curriculum & syllabus
                </p>
              </div>

              {/* COMPACT ONE-TIME COUNTRY SELECTION WARNING */}
              <div className="mb-3 py-1.5 px-3 rounded-xl bg-amber-50 border border-amber-300/80 text-amber-950 flex items-center gap-2.5 shadow-2xs shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
                <p className="text-[11px] text-amber-900 font-bold leading-snug">
                  One-time setting. Cannot change later.
                </p>
              </div>

              {/* Country Selection Cards */}
              <div ref={countryScrollRef} className="flex-1 overflow-y-auto pr-1 -mr-1 py-1 space-y-2.5 max-h-[50vh] scroll-smooth">
                {COUNTRIES.map((country) => {
                  const isSelected = selectedCountryId === country.id;
                  return (
                    <div key={country.id} className="space-y-2">
                      <motion.div
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          triggerVibration(10);
                          setSelectedCountryId(country.id);
                          if (countryError) setCountryError(null);
                          if (country.id === 'Other') {
                            setTimeout(() => {
                              if (countryScrollRef.current) {
                                countryScrollRef.current.scrollTo({ top: countryScrollRef.current.scrollHeight, behavior: 'smooth' });
                              }
                              otherCountryBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              customCountryInputRef.current?.focus({ preventScroll: true });
                            }, 80);
                          }
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

                      {/* When Others is selected, show Type Box immediately and auto-scroll */}
                      {country.id === 'Other' && isSelected && (
                        <motion.div
                          ref={otherCountryBoxRef}
                          initial={{ opacity: 0, height: 0, y: -6 }}
                          animate={{ opacity: 1, height: 'auto', y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-purple-50/70 border-2 border-purple-500/80 rounded-2xl p-3.5 shadow-sm">
                            <label className="text-[10px] font-black uppercase tracking-wider text-purple-700 block mb-1.5">
                              Country Name
                            </label>
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-purple-600 shrink-0" />
                              <input
                                ref={customCountryInputRef}
                                type="text"
                                value={customCountry}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomCountry(val);
                                  if (countryError) setCountryError(null);
                                  if (val.trim()) {
                                    safeSetItem('academic_custom_country', val.trim());
                                    safeSetItem('academic_country', val.trim());
                                    if (userId) {
                                      safeSetItem(`academic_custom_country_${userId}`, val.trim());
                                      safeSetItem(`academic_country_${userId}`, val.trim());
                                    }
                                  }
                                }}
                                placeholder="e.g. India, Germany, UAE..."
                                className="w-full bg-transparent text-xs font-black text-zinc-900 placeholder:text-zinc-400 placeholder:font-medium focus:outline-none"
                                autoFocus
                              />
                              {customCountry.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerVibration(10);
                                    setCustomCountry('');
                                    if (countryError) setCountryError(null);
                                  }}
                                  className="p-1 text-zinc-400 hover:text-zinc-600 rounded-full"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {countryError && (
                              <p className="text-[10px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                                {countryError}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* STEP 2: Exam Name Selection & Live AI Verification */}
          {step === 2 && (
            <motion.div
              key="step-exam"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-center min-h-0 py-2"
            >
              <div className="text-left mb-3 shrink-0">
                <h1 className="text-2xl font-black text-zinc-950 tracking-tight leading-tight">
                  Which exam are you preparing for?
                </h1>
                <p className="text-xs text-zinc-500 font-semibold mt-1">
                  AI will automatically curate your syllabus
                </p>
              </div>

              {/* Clean Exam Type Box - NO LIST */}
              <div className="space-y-3">
                {/* COMPACT ONE-TIME EXAM WARNING */}
                <div className="py-1.5 px-3 rounded-xl bg-amber-50 border border-amber-300/80 text-amber-950 flex items-center gap-2.5 shadow-2xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
                  <p className="text-[11px] text-amber-900 font-bold leading-snug">
                    One-time setting. Cannot change later.
                  </p>
                </div>

                <div className={`bg-white border-2 rounded-2xl p-4 shadow-sm transition-all ${
                  examError 
                    ? 'border-red-500 shadow-red-500/5' 
                    : 'border-purple-500/80 shadow-purple-500/5 focus-within:border-purple-600 focus-within:ring-4 focus-within:ring-purple-500/10'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
                      Target Exam Name
                    </label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Target className="w-5 h-5 text-purple-600 shrink-0" />
                    <input
                      type="text"
                      value={targetExam}
                      disabled={isVerifyingExam}
                      onChange={(e) => {
                        setTargetExam(e.target.value);
                        if (examError) setExamError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleNextStep();
                        }
                      }}
                      placeholder="e.g. JEE, NEET, SAT, AP Physics, CBSE..."
                      className="w-full bg-transparent text-sm font-black text-zinc-900 placeholder:text-zinc-400 placeholder:font-medium focus:outline-none disabled:opacity-50"
                      autoFocus
                    />
                    {targetExam.length > 0 && !isVerifyingExam && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerVibration(10);
                          setTargetExam('');
                          setExamError(null);
                        }}
                        className="p-1 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Error Notice if Exam does not exist */}
                {examError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-2xl bg-red-50/90 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 shadow-xs"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-black text-red-800 text-[11px]">Exam Verification Notice</p>
                      <p className="text-[10px] text-red-600 font-medium mt-0.5 leading-snug">
                        {examError}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 3: Grade Level Selection */}
          {step === 3 && (
            <motion.div
              key="step-grade"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-center min-h-0 py-2"
            >
              <div className="text-left mb-3 shrink-0">
                <h1 className="text-2xl font-black text-zinc-950 tracking-tight leading-tight">
                  What grade or class are you in?
                </h1>
                <p className="text-xs text-zinc-500 font-semibold mt-1">
                  {targetExam ? `Classes for ${targetExam}` : 'Select your class level'}
                </p>
              </div>

              {/* COMPACT ONE-TIME GRADE SELECTION WARNING */}
              <div className="mb-3 py-1.5 px-3 rounded-xl bg-amber-50 border border-amber-300/80 text-amber-950 flex items-center gap-2.5 shadow-2xs shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
                <p className="text-[11px] text-amber-900 font-bold leading-snug">
                  One-time setting. Cannot change later.
                </p>
              </div>

              {/* Scrollable Grade Grid */}
              <div className="flex-1 overflow-y-auto pr-1 -mr-1 py-1 space-y-2 max-h-[50vh]">
                {verifiedExamGrades.map((grade) => {
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

          {/* STEP 4: Subjects Selection (AI Researched for Exam) */}
          {step === 4 && (
            <motion.div
              key="step-subjects"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-center min-h-0 py-2"
            >
              <div className="text-left mb-3 shrink-0">
                <h1 className="text-2xl font-black text-zinc-950 tracking-tight leading-tight">
                  {targetExam ? `Subjects for ${targetExam}` : 'Select your subjects'}
                </h1>
                <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold mt-1">
                  <span>Choose your subjects:</span>
                  <span className="text-[11px] font-black text-purple-700 bg-purple-100/90 px-2.5 py-0.5 rounded-full border border-purple-200">
                    {selectedSubjectIds.length} Selected
                  </span>
                </div>
              </div>

              {/* Subjects List: Real Exam Subjects (and Other Subjects only when exam has broad electives) */}
              <div ref={subjectScrollRef} className="flex-1 overflow-y-auto pr-1 -mr-1 py-1 space-y-2.5 max-h-[50vh] scroll-smooth">
                {displayedSubjects.map((subj) => {
                  const isSelected = selectedSubjectIds.includes(subj.id);
                  return (
                    <div key={subj.id} className="space-y-2">
                      <motion.div
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleSubject(subj.id)}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center gap-3.5 cursor-pointer select-none ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-1 ring-purple-500/20'
                            : 'border-zinc-200 bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${subj.color} text-white text-lg flex items-center justify-center shadow-md shadow-zinc-100/10 shrink-0`}>
                          {subj.icon}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className={`text-xs font-black truncate ${isSelected ? 'text-purple-950' : 'text-zinc-800'}`}>
                            {subj.title}
                          </p>
                          <p className="text-[9px] text-zinc-400 font-bold mt-0.5 truncate">
                            {subj.subtitle}
                          </p>
                        </div>
                        {/* Rounded checkbox indicator */}
                        <div className={`w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 ${
                          isSelected 
                            ? 'border-purple-600 bg-purple-600 text-white shadow-xs' 
                            : 'border-zinc-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </motion.div>

                      {/* When Other Subjects is selected, show Type Box immediately and auto-scroll */}
                      {subj.id === 'Other' && isSelected && (
                        <motion.div
                          ref={otherSubjectBoxRef}
                          initial={{ opacity: 0, height: 0, y: -6 }}
                          animate={{ opacity: 1, height: 'auto', y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-purple-50/70 border-2 border-purple-500/80 rounded-2xl p-3.5 shadow-sm">
                            <label className="text-[10px] font-black uppercase tracking-wider text-purple-700 block mb-1.5">
                              Custom Subject Name
                            </label>
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />
                              <input
                                ref={customSubjectInputRef}
                                type="text"
                                value={customSubject}
                                onChange={(e) => setCustomSubject(e.target.value)}
                                placeholder="e.g. Psychology, French, Law..."
                                className="w-full bg-transparent text-xs font-black text-zinc-900 placeholder:text-zinc-400 placeholder:font-medium focus:outline-none"
                                autoFocus
                              />
                              {customSubject.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerVibration(10);
                                    setCustomSubject('');
                                  }}
                                  className="p-1 text-zinc-400 hover:text-zinc-600 rounded-full"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
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
          {(step > 1 || onCancel) && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleBackStep}
              disabled={isVerifyingExam}
              className="px-4 py-4 bg-zinc-100 hover:bg-zinc-150 border border-zinc-200 rounded-[1.25rem] text-zinc-700 font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs">{step === 1 ? 'Cancel' : 'Back'}</span>
            </motion.button>
          )}
          
          {step < 4 ? (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleNextStep}
              disabled={isVerifyingExam}
              className="flex-1 bg-zinc-950 hover:bg-zinc-900 text-white rounded-[1.25rem] py-4 font-black text-sm flex items-center justify-center gap-2 shadow-md border border-zinc-900 transition-all cursor-pointer disabled:opacity-75"
            >
              {isVerifyingExam ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Verifying Exam...</span>
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4.5 h-4.5 text-zinc-400" />
                </>
              )}
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
        {step === 4 && (
          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
            💡 Change subjects anytime in Profile
          </p>
        )}
      </div>

      {/* 5-Stage Live Deep Research & Academic DNA Calibration Overlay */}
      <AnimatePresence>
        {isDeepResearching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center p-3.5 sm:p-5 select-none overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.92, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-4 sm:p-5 max-w-sm w-full shadow-2xl border border-purple-500/20 relative overflow-hidden my-auto flex flex-col justify-between max-h-[94vh]"
            >
              {/* Background ambient gradient glow */}
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

              {/* Central Pulsing Radar Orb */}
              <div className="flex flex-col items-center text-center mb-3 sm:mb-3.5 relative shrink-0">
                <div className="relative mb-2.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-purple-500/25 flex items-center justify-center animate-pulse">
                    <div className="w-full h-full bg-white rounded-[0.9rem] flex items-center justify-center">
                      {researchStage === 5 ? (
                        <Check className="w-6 h-6 text-emerald-600 stroke-[3]" />
                      ) : (
                        <Sparkles className="w-6 h-6 text-purple-600 animate-spin" style={{ animationDuration: '4s' }} />
                      )}
                    </div>
                  </div>
                  {researchStage < 5 && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[9px] font-black shadow-md">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60 mb-1.5 text-[9px] font-extrabold uppercase tracking-wider">
                  <ShieldCheck className="w-3 h-3 text-purple-600" />
                  Official Exam Intelligence Engine
                </div>
                <h3 className="text-lg font-black text-zinc-950 tracking-tight leading-tight">
                  Calibrating Academic DNA
                </h3>
                <p className="text-[11px] text-zinc-500 font-semibold mt-0.5 max-w-[270px] leading-snug line-clamp-2">
                  Deep web research on official guidelines for <span className="font-extrabold text-zinc-900">{targetExam}</span>
                </p>
              </div>

              {/* 5 Progress Stages Checklist */}
              <div className="space-y-1.5 mb-3 sm:mb-3.5 flex-1 min-h-0">
                {[
                  { num: 1, label: `Connect to ${targetExam || 'Exam'} Registry`, desc: 'Official testing authority handshake' },
                  { num: 2, label: 'Curate Official Syllabus & Units', desc: 'Isolating chapters for each subject' },
                  { num: 3, label: 'Analyze Marking Scheme & Weightage', desc: 'Formulating exact marks & negative marking' },
                  { num: 4, label: 'Extract Real Exam Question Patterns', desc: 'Calibrating question styles & difficulty' },
                  { num: 5, label: 'Lock Permanent Academic DNA', desc: 'Permanently secured to your personal profile' }
                ].map((st) => {
                  const isDone = researchStage > st.num || (researchStage === 5 && st.num === 5);
                  const isCurrent = researchStage === st.num && researchStage < 5;

                  return (
                    <div 
                      key={st.num}
                      className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-2.5 ${
                        isDone 
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : isCurrent
                          ? 'bg-purple-50/70 border-purple-300 ring-2 ring-purple-500/10 text-purple-950'
                          : 'bg-zinc-50/60 border-zinc-200/60 text-zinc-400 opacity-60'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-200 text-zinc-500'
                      }`}>
                        {isDone ? (
                          <Check className="w-3 h-3 stroke-[3]" />
                        ) : isCurrent ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          st.num
                        )}
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <p className={`text-[11px] font-extrabold truncate ${
                          isDone ? 'text-emerald-900' : isCurrent ? 'text-purple-900' : 'text-zinc-600'
                        }`}>
                          {st.label}
                        </p>
                        <p className="text-[9px] font-medium text-zinc-400 truncate">
                          {st.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic Status Ticker (Guaranteed 100% Legible & Visible on All Mobile Screens) */}
              <div className="w-full px-3.5 py-2.5 bg-zinc-950 text-white rounded-2xl shadow-xl border border-zinc-800 shrink-0 flex items-center gap-3 min-h-[48px]">
                <div className="w-7 h-7 rounded-xl bg-purple-950/80 border border-purple-500/30 flex items-center justify-center shrink-0">
                  {researchStage < 5 ? (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p
                    className="text-[11px] font-extrabold text-white tracking-wide leading-snug line-clamp-2 break-words"
                    title={researchMessage}
                  >
                    {researchMessage || 'Calibrating Academic DNA...'}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
