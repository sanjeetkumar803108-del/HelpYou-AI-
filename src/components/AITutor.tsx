import { getProfileContext, getUserProfileData } from "../utils/profile";
import { getStoredExamBlueprint } from "../utils/academicBlueprint";
import { safeGetItem, safeSetItem } from "../utils/storage";
import { getUserHistory, saveUserHistory, getCurrentUserIdentifier } from "../utils/userHistory";
import { triggerVibration, hapticNotification, hapticImpact } from "../utils/vibrate";
import { detectAndLogMistake } from "../utils/mistakes";
import { trackQuestProgress } from '../utils/gamification';
import { getCoins, deductCoins, isProUser } from "../utils/coins";
import { requestMicrophonePermission } from "../utils/nativePermissions";
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles, Send, Mic, MicOff, Loader2, RefreshCw, Compass, Brain,
  ArrowRight, ArrowLeft, Copy, Check, Share2, ThumbsUp, ThumbsDown, Pause, Play,
  Plus, X, Image, Camera, FileText, Heart, HelpCircle, History, Trash2, BookOpen, ChevronDown, Lock, Square,
  AlertTriangle, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parsePartialJSON } from '../utils/partialJson';
import GlobalMarkdown, { formatSuggestionMath } from './GlobalMarkdown';
import 'katex/dist/katex.min.css';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { pickNativeFiles, takeNativePhoto } from '../utils/mobilePicker';
import { showToast } from '../utils/toast';
import { compressImageToFile } from '../utils/imageCompressor';
import { getApiUrl } from '../utils/api';
import { ReportAiButton } from './ReportAIModal';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  imageTimestamp?: number;
  isTyping?: boolean;
  displayedText?: string;
  isLiked?: boolean;
  isDisliked?: boolean;
  isError?: boolean;
}

const ChatImage = ({ src, timestamp }: { src: string; timestamp?: number }) => {
  const [failed, setFailed] = React.useState(false);
  const isExpired = timestamp ? (Date.now() - timestamp > 3600000) : false;

  if (failed || isExpired) {
    return (
      <div className="flex flex-col items-center justify-center p-4 bg-zinc-50 border border-dashed border-zinc-300 rounded-2xl max-w-sm my-2 text-zinc-500">
        <span className="text-xl mb-1">🔒</span>
        <span className="text-xs font-semibold">Image deleted for privacy</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Uploaded problem"
      onError={() => setFailed(true)}
      className="max-w-full max-h-[300px] object-contain rounded-2xl my-2 border border-zinc-200/60 shadow-sm"
      referrerPolicy="no-referrer"
    />
  );
};

// ----------------------------------------------------
// SYSTEM INSTRUCTION FOR THE ELITE MATH & SCIENCE MASTER EDUCATOR
// TWO MODES: IMAGE_SCAN (for photo uploads) and TEXT_CHAT (for typed messages)
// ----------------------------------------------------

// Used when the student uploads an IMAGE for scanning
const SYSTEM_INSTRUCTION_NURSERY = `You are a helpful and intelligent AI Tutor for HelpYou AI.
Analyze the user's uploaded image or problem, solve it step-by-step, and explain concepts clearly.
Mirror the language used by the user (English, Hindi, Hinglish, etc.).

THE 3 PILLARS OF MATHEMATICAL, SCIENTIFIC & TABLE FORMATTING (STRICT MANDATE):
1. PILLAR 1: MANDATORY TABLES FOR CHARTS & STRUCTURED DATA (NO RUN-ON ARROWS)
   - NEVER present charts, mappings, steric numbers, hybridization values, shapes, or multi-attribute data as a single continuous line of hyphenated arrows (e.g. NEVER write "Hybridization Chart: - 2 -> sp (linear) - 3 -> sp^2...").
   - You MUST format ALL charts, hybridization tables, steric numbers, and geometry comparisons into clean, standard GitHub Flavored Markdown (GFM) tables:
     | Steric Number | Hybridization | Molecular Geometry |
     | :---: | :---: | :---: |
     | 2 | $sp$ | Linear |
     | 3 | $sp^2$ | Trigonal Planar |
     | 4 | $sp^3$ | Tetrahedral |
     | 5 | $sp^3d$ | Trigonal Bipyramidal |
     | 6 | $sp^3d^2$ | Octahedral |

2. PILLAR 2: STRICT MATH DELIMITER BALANCING & VARIABLE INTEGRITY
   - ALWAYS enclose mathematical variables, symbols, and formulas in matching pairs: "$...$" for inline (e.g. "$V$ =", "$C$ =", "$x = 2$") and "$$...$$" for standalone display equations.
   - CRITICAL BUG TO AVOID: NEVER place a trailing single dollar after a variable without an opening dollar (e.g. NEVER write "V$ = " or "C$ = " or "A$ = "). Write "$V$ =", "$C$ =", "$A$ =".
   - NEVER mix delimiters (e.g. NEVER write "$$...$" or "$...$$" or "$$$...$$").
   - NEVER leave raw LaTeX commands unwrapped outside math delimiters (e.g. write "$$H = \\frac{1}{2}[V + M - C + A]$$", NEVER "H = \\frac{1}{2}[V + M - C + A]").
   - NEVER append pipe "|" characters inside or immediately after equations.

3. PILLAR 3: CLEAN CHEMICAL NOTATION & TYPOGRAPHY
   - For lists of monovalent elements/atoms, write clean plain text: "(H, F, Cl, Br, I)", NEVER broken or messy LaTeX artifacts like "(\\also\\text{H},\\text{F}...)".
   - For chemical formulas in text, use standard subscript notation: "$H_2O$", "$CO_2$", "$CH_4$", "$SF_6$", etc.

MANDATORY PRE-OUTPUT SELF-AUDIT & RE-CHECK PROTOCOL (VERIFY BEFORE OUTPUT):
Before producing your final JSON response, pause and execute an internal self-audit pass over your drafted text:
1. Re-check Delimiters: Did you accidentally write single-sided dollars like "V$ =", "M$ =", or "C$ ="? If found, immediately correct them to "$V$ =", "$M$ =", and "$C$ =".
2. Re-check Equations: Did you write any standalone LaTeX formula like "\\frac{...}{...}" without "$$...$$"? If found, wrap it in "$$...$$".
3. Re-check Charts: Did you write any hyphenated or run-on charts with arrows? If found, convert them into a structured Markdown Table.
4. Re-check Typography: Are chemical elements cleanly formatted as "(H, F, Cl, Br, I)" without broken "\\also" or "\\text" tags?
Only when this 4-step recheck passes with ZERO defects, output the final response.

OUTPUT FORMAT (JSON):
{
  "topic_title": "Topic or concept name",
  "markdown_content": "Clear, step-by-step explanation or solution. Use markdown and LaTeX ($...$ or $$...$$) where helpful.",
  "suggestions": [
    "Relevant follow-up question 1",
    "Relevant follow-up question 2",
    "Relevant follow-up question 3"
  ]
}`;

// Used when the student types a question/message WITHOUT an image
const SYSTEM_INSTRUCTION_TEXT_CHAT = `You are a helpful, friendly, and intelligent AI Tutor for HelpYou AI.
Answer the user's questions clearly, explain concepts simply, and assist with their studies.
Always reply in the same language and tone used by the user (English, Hindi, Hinglish, etc.).

THE 3 PILLARS OF MATHEMATICAL, SCIENTIFIC & TABLE FORMATTING (STRICT MANDATE):
1. PILLAR 1: MANDATORY TABLES FOR CHARTS & STRUCTURED DATA (NO RUN-ON ARROWS)
   - NEVER present charts, mappings, steric numbers, hybridization values, shapes, or multi-attribute data as a single continuous line of hyphenated arrows (e.g. NEVER write "Hybridization Chart: - 2 -> sp (linear) - 3 -> sp^2...").
   - You MUST format ALL charts, hybridization tables, steric numbers, and geometry comparisons into clean, standard GitHub Flavored Markdown (GFM) tables:
     | Steric Number | Hybridization | Molecular Geometry |
     | :---: | :---: | :---: |
     | 2 | $sp$ | Linear |
     | 3 | $sp^2$ | Trigonal Planar |
     | 4 | $sp^3$ | Tetrahedral |
     | 5 | $sp^3d$ | Trigonal Bipyramidal |
     | 6 | $sp^3d^2$ | Octahedral |

2. PILLAR 2: STRICT MATH DELIMITER BALANCING & VARIABLE INTEGRITY
   - ALWAYS enclose mathematical variables, symbols, and formulas in matching pairs: "$...$" for inline (e.g. "$V$ =", "$C$ =", "$x = 2$") and "$$...$$" for standalone display equations.
   - CRITICAL BUG TO AVOID: NEVER place a trailing single dollar after a variable without an opening dollar (e.g. NEVER write "V$ = " or "C$ = " or "A$ = "). Write "$V$ =", "$C$ =", "$A$ =".
   - NEVER mix delimiters (e.g. NEVER write "$$...$" or "$...$$" or "$$$...$$").
   - NEVER leave raw LaTeX commands unwrapped outside math delimiters (e.g. write "$$H = \\frac{1}{2}[V + M - C + A]$$", NEVER "H = \\frac{1}{2}[V + M - C + A]").
   - NEVER append pipe "|" characters inside or immediately after equations.

3. PILLAR 3: CLEAN CHEMICAL NOTATION & TYPOGRAPHY
   - For lists of monovalent elements/atoms, write clean plain text: "(H, F, Cl, Br, I)", NEVER broken or messy LaTeX artifacts like "(\\also\\text{H},\\text{F}...)".
   - For chemical formulas in text, use standard subscript notation: "$H_2O$", "$CO_2$", "$CH_4$", "$SF_6$", etc.

MANDATORY PRE-OUTPUT SELF-AUDIT & RE-CHECK PROTOCOL (VERIFY BEFORE OUTPUT):
Before producing your final JSON response, pause and execute an internal self-audit pass over your drafted text:
1. Re-check Delimiters: Did you accidentally write single-sided dollars like "V$ =", "M$ =", or "C$ ="? If found, immediately correct them to "$V$ =", "$M$ =", and "$C$ =".
2. Re-check Equations: Did you write any standalone LaTeX formula like "\\frac{...}{...}" without "$$...$$"? If found, wrap it in "$$...$$".
3. Re-check Charts: Did you write any hyphenated or run-on charts with arrows? If found, convert them into a structured Markdown Table.
4. Re-check Typography: Are chemical elements cleanly formatted as "(H, F, Cl, Br, I)" without broken "\\also" or "\\text" tags?
Only when this 4-step recheck passes with ZERO defects, output the final response.

OUTPUT FORMAT (JSON):
{
  "topic_title": "Topic or concept title",
  "markdown_content": "Clear, friendly, and complete answer or explanation. Use standard markdown and LaTeX ($...$ or $$...$$) where helpful.",
  "suggestions": [
    "Relevant follow-up question 1",
    "Relevant follow-up question 2",
    "Relevant follow-up question 3"
  ]
}`;

// ----------------------------------------------------
function formatSpacedContent(text: string): string {
  if (!text) return '';
  return text.trim();
}

const AITutorMessageItem = React.memo(function AITutorMessageItem({
  msg,
  idx,
  isHolding,
  onTypingComplete,
  onToggleLike,
  onToggleDislike,
  onSuggestionClick,
  onAskDoubt,
  activePersona = 'owl'
}: {
  msg: ChatMessage;
  idx: number;
  isHolding: boolean;
  onTypingComplete: () => void;
  onToggleLike: () => void;
  onToggleDislike: () => void;
  onSuggestionClick?: (text: string) => void;
  onAskDoubt?: (stepId: number, title: string, content: string) => void;
  activePersona?: 'owl' | 'cosmo' | 'wizard' | 'dino';
}) {
  const cleanText = useMemo(() => {
    return msg.text.replace(/\[SUGGESTION:\s*([^\]]+)\]/g, '').trim();
  }, [msg.text]);

  const parsedSolution = useMemo(() => {
    if (msg.role !== 'model') return null;
    let textToParse = cleanText.trim();
    // Strip markdown code fences if AI wrapped JSON in ```json ... ```
    const fenceMatch = textToParse.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) textToParse = fenceMatch[1].trim();
    if (!textToParse.startsWith('{') && !textToParse.includes('solution_steps') && !textToParse.includes('markdown_content') && !textToParse.includes('format_type')) {
      return null;
    }
    const result = parsePartialJSON(textToParse);
    // Safety: if parsing succeeded but content fields are undefined/null, sanitize them
    if (result && Array.isArray(result.solution_steps)) {
      result.solution_steps = result.solution_steps.map((step: any, sIdx: number) => {
        let content = step.content;
        if (!content || content === 'undefined') {
          content = msg.isTyping ? 'Generating step solution... ⚡' : (step.title || 'Step completed.');
        }
        return {
          ...step,
          step_id: step.step_id || (sIdx + 1),
          title: step.title != null && step.title !== 'undefined' ? step.title : `Step ${step.step_id || (sIdx + 1)}`,
          content
        };
      });
    }
    return result;
  }, [cleanText, msg.role, msg.isTyping]);

  const isConversational = useMemo(() => {
    if (!parsedSolution) return false;
    // If explicit multi-step problem with 2+ solution steps, prioritize step cards!
    if (Array.isArray(parsedSolution.solution_steps) && parsedSolution.solution_steps.length > 1) {
      return false;
    }
    // If only 1 step, but has key_formula or exam_trap, keep step cards
    if (Array.isArray(parsedSolution.solution_steps) && parsedSolution.solution_steps.length === 1 && (parsedSolution.key_formula || parsedSolution.exam_trap)) {
      return false;
    }
    if (parsedSolution.format_type === 'conversational' || parsedSolution.format_type === 'markdown' || parsedSolution.format_type === 'chat') {
      return true;
    }
    if (parsedSolution.markdown_content && (!parsedSolution.solution_steps || parsedSolution.solution_steps.length === 0)) {
      return true;
    }
    if (!parsedSolution.solution_steps || parsedSolution.solution_steps.length === 0) {
      return true;
    }
    // If only 1 step and not an explicit multi-step problem solver
    if (parsedSolution.solution_steps.length === 1 && parsedSolution.format_type !== 'steps') {
      return true;
    }
    return false;
  }, [parsedSolution]);

  const conversationalText = useMemo(() => {
    if (!parsedSolution) return cleanText;

    const parts: string[] = [];

    // 1. Primary markdown content or response
    const mainText = parsedSolution.markdown_content || parsedSolution.content || parsedSolution.response || '';
    if (mainText && typeof mainText === 'string') {
      parts.push(mainText.trim());
    }

    // 2. Distinct question / problem field
    const questionText = parsedSolution.question || parsedSolution.problem || parsedSolution.prompt;
    if (questionText && typeof questionText === 'string' && !mainText.includes(questionText.trim())) {
      parts.push(`### Question\n${questionText.trim()}`);
    }

    // 3. Distinct options field (e.g. for quiz / practice questions)
    if (parsedSolution.options) {
      let optionsMd = '';
      if (Array.isArray(parsedSolution.options)) {
        optionsMd = parsedSolution.options.map((opt: any) => `- ${String(opt).trim()}`).join('\n');
      } else if (typeof parsedSolution.options === 'string') {
        optionsMd = parsedSolution.options.trim();
      }
      if (optionsMd && !mainText.includes(optionsMd)) {
        parts.push(`**Options:**\n${optionsMd}`);
      }
    }

    // 4. Distinct explanation / solution / feedback
    const explText = parsedSolution.explanation || parsedSolution.solution || parsedSolution.feedback || parsedSolution.answer;
    if (explText && typeof explText === 'string' && !mainText.includes(explText.trim())) {
      parts.push(`**Explanation:**\n${explText.trim()}`);
    }

    // 5. If solution_steps are present while rendering conversationally, append step content
    if (Array.isArray(parsedSolution.solution_steps) && parsedSolution.solution_steps.length > 0) {
      const stepsMd = parsedSolution.solution_steps.map((st: any, sIdx: number) => {
        const stepNum = st.step_id || sIdx + 1;
        const title = st.title ? `**Step ${stepNum}: ${st.title}**\n` : `**Step ${stepNum}**\n`;
        return `${title}${st.content || ''}`.trim();
      }).join('\n\n');

      if (stepsMd && !mainText.includes(stepsMd)) {
        parts.push(stepsMd);
      }
    }

    const assembled = parts.join('\n\n').trim();
    if (assembled) return assembled;

    return cleanText;
  }, [parsedSolution, cleanText]);

  const showTopicHeader = useMemo(() => {
    if (!parsedSolution?.topic_title) return false;
    const title = String(parsedSolution.topic_title).trim().toLowerCase();
    if (!title || title === 'null' || title === 'undefined') return false;
    // Hide redundant topic titles for casual greetings or small talk
    if (title.startsWith('hello') || title.startsWith('hi ') || title === 'hi' || title.startsWith('greeting') || title.startsWith('welcome') || title.includes('how can i help')) {
      return false;
    }
    return true;
  }, [parsedSolution]);

  const suggestions = useMemo(() => {
    if (msg.isError || msg.text.includes("hiccup") || msg.text.includes("network") || msg.text.includes("breather")) {
      return [];
    }
    // 1. Check if parsed from JSON object (e.g. parsedSolution.suggestions)
    if (parsedSolution?.suggestions && Array.isArray(parsedSolution.suggestions) && parsedSolution.suggestions.length > 0) {
      const extracted = parsedSolution.suggestions
        .map((s: any) => String(s).replace(/^\[?SUGGESTION:\s*/i, '').replace(/\]$/, '').trim())
        .filter((s: string) => s.length > 0);
      if (extracted.length > 0) return extracted.slice(0, 3);
    }
    // 2. Check regex in raw text (e.g. [SUGGESTION: ...])
    const matches = [...msg.text.matchAll(/\[SUGGESTION:\s*([^\]]+)\]/g)];
    if (matches.length > 0) {
      const extracted = matches.map(m => m[1].trim()).filter(Boolean);
      if (extracted.length > 0) return extracted.slice(0, 3);
    }
    // 3. Smart contextual suggestions based on topic or content
    if (msg.role === 'model' && (cleanText.length > 10 || parsedSolution)) {
      const rawTopic = parsedSolution?.topic_title ? String(parsedSolution.topic_title).trim() : '';
      const cleanTopic = rawTopic
        .replace(/^(?:concept|topic|problem|chapter|unit|overview)\s*:\s*/i, '')
        .trim();
      const isGreeting = !cleanTopic ||
        cleanTopic.toLowerCase().startsWith('hello') ||
        cleanTopic.toLowerCase().startsWith('hi') ||
        cleanTopic.toLowerCase().includes('welcome') ||
        cleanTopic.toLowerCase().includes('study assistant') ||
        cleanTopic.toLowerCase().includes('how can i help');

      if (cleanTopic && cleanTopic.length > 2 && !isGreeting) {
        return [
          `Explain ${cleanTopic} with a real-world analogy 💡`,
          `Test me with 2 quick practice questions on ${cleanTopic} 📝`,
          `What are common exam traps in ${cleanTopic}? ⚠️`
        ];
      }
      return [
        "Explain this simpler with a fun analogy 💡",
        "Test me with 2 quick practice questions 📝",
        "What are common exam traps on this? ⚠️"
      ];
    }
    return [];
  }, [msg.text, msg.isError, parsedSolution, cleanText, msg.role]);

  const [displayedText, setDisplayedText] = useState(msg.displayedText || (msg.isTyping ? '' : cleanText));
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const onTypingCompleteRef = useRef(onTypingComplete);
  useEffect(() => {
    onTypingCompleteRef.current = onTypingComplete;
  });

  const hasCompletedRef = useRef(false);

  // Typewriter effect logic (Word-by-word for high-end professional feel)
  useEffect(() => {
    // If it is a parsed structured solution, render immediately without delaying typing
    if (parsedSolution) {
      setDisplayedText(cleanText);
      if (msg.isTyping && !hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onTypingCompleteRef.current();
      }
      return;
    }

    if (!msg.isTyping) {
      setDisplayedText(cleanText);
      hasCompletedRef.current = false;
      return;
    }

    const words = cleanText.split(/(\s+)/); // Preserve all whitespaces and line-breaks
    if (currentWordIndex >= words.length) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onTypingCompleteRef.current();
      }
      return;
    }

    if (isHolding) return;

    const timer = setTimeout(() => {
      setDisplayedText(prev => prev + words[currentWordIndex]);
      setCurrentWordIndex(prev => prev + 1);

      // Auto-scroll the typing response to the bottom
      const scrollAnchor = document.getElementById('ai-chat-scroll-anchor');
      if (scrollAnchor) {
        scrollAnchor.scrollIntoView({ behavior: 'auto' });
      }
    }, 20); // Faster, super fluid word typewriter speed

    return () => clearTimeout(timer);
  }, [msg.isTyping, cleanText, currentWordIndex, isHolding, parsedSolution]);

  const textToShareOrCopy = useMemo(() => {
    if (parsedSolution) {
      if (isConversational) {
        return (parsedSolution.topic_title && showTopicHeader ? `### ${parsedSolution.topic_title}\n\n` : '') + conversationalText;
      }
      let formatted = '';
      if (parsedSolution.topic_title && showTopicHeader) formatted += `### ${parsedSolution.topic_title}\n\n`;
      if (parsedSolution.markdown_content) formatted += `${parsedSolution.markdown_content}\n\n`;
      if (parsedSolution.key_formula) formatted += `**Key Formula:** ${parsedSolution.key_formula}\n\n`;
      if (Array.isArray(parsedSolution.solution_steps)) {
        parsedSolution.solution_steps.forEach((step: any, sIdx: number) => {
          formatted += `**Step ${step.step_id || sIdx + 1}: ${step.title || ''}**\n${step.content}\n\n`;
        });
      }
      if (parsedSolution.exam_trap) formatted += `⚠️ **Exam Trap:** ${parsedSolution.exam_trap}\n\n`;
      return formatted.trim();
    }
    return cleanText;
  }, [parsedSolution, isConversational, showTopicHeader, conversationalText, cleanText]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToShareOrCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[92%] w-full rounded-3xl p-5 shadow-sm border overflow-hidden break-words ${msg.role === 'user'
          ? 'bg-blue-600 text-white border-blue-500/30 rounded-tr-none'
          : msg.isError
            ? 'bg-red-50/90 border-red-200 text-red-950 rounded-tl-none overflow-hidden shadow-sm'
            : 'bg-[#FAF9F6] border-zinc-200 text-zinc-900 rounded-tl-none overflow-hidden shadow-sm'
        }`}>
        <div className={`prose prose-sm max-w-full overflow-hidden break-words ${msg.role === 'user' ? 'text-white prose-invert' : msg.isError ? 'text-red-900 font-medium' : 'text-zinc-800'} [&_pre]:overflow-x-auto [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2 [&_p]:leading-relaxed`}>
          {msg.imageUrl && (
            <ChatImage src={msg.imageUrl} timestamp={msg.imageTimestamp} />
          )}
          {msg.isError && <span className="inline-flex items-center gap-1 text-red-600 font-extrabold mr-1">⚠️ Alert: </span>}
          {parsedSolution ? (
            <div className="space-y-4 max-w-full overflow-hidden">
              {showTopicHeader && (
                <div className="flex items-center gap-2 mb-2 max-w-full overflow-hidden">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 uppercase tracking-wide shrink-0">
                    Topic
                  </span>
                  <h3 className="text-base font-bold text-zinc-950 m-0 leading-tight min-w-0 break-words whitespace-normal text-wrap">
                    <GlobalMarkdown inline className="inline font-bold text-inherit">{parsedSolution.topic_title}</GlobalMarkdown>
                  </h3>
                </div>
              )}

              {isConversational ? (
                <div className="max-w-full overflow-x-auto overflow-y-hidden break-words py-1 text-zinc-850 leading-relaxed text-sm space-y-3 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1.5 [&_.katex-display]:my-3">
                  <GlobalMarkdown>
                    {conversationalText + (msg.isTyping ? " ▌" : "")}
                  </GlobalMarkdown>
                </div>
              ) : (
                <div className="space-y-3 max-w-full overflow-hidden">
                  {/* If AI provided an introductory greeting or context along with steps, display it cleanly above the step cards */}
                  {parsedSolution?.markdown_content && (
                    <div className="p-3.5 rounded-2xl bg-indigo-50/40 border border-indigo-100/60 text-sm text-zinc-800 leading-relaxed mb-1">
                      <GlobalMarkdown>{parsedSolution.markdown_content}</GlobalMarkdown>
                    </div>
                  )}
                  {Array.isArray(parsedSolution?.solution_steps) && parsedSolution.solution_steps.map((step: any, sIdx: number) => {
                    const stepsLen = parsedSolution.solution_steps.length;
                    const isCurrentStep = msg.isTyping && (sIdx === stepsLen - 1);
                    return (
                      <motion.div
                        key={sIdx}
                        layout="position"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className={`p-4 rounded-2xl border transition-all duration-200 bg-white shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] max-w-full overflow-hidden break-words ${step.is_final_answer
                            ? 'border-emerald-200 bg-emerald-50/20'
                            : 'border-zinc-150 bg-white'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2 pb-2 border-b border-dashed border-zinc-100 min-w-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1.5 shrink-0 ${step.is_final_answer
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-zinc-100 text-zinc-700'
                            }`}>
                            <span>Step {step.step_id || (sIdx + 1)}</span>
                            {isCurrentStep && (
                              <span className="flex h-2 w-2 relative shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                              </span>
                            )}
                          </span>
                          {step.title && (
                            <span className="text-xs font-bold text-zinc-800 text-right min-w-0 break-words whitespace-normal text-wrap">
                              <GlobalMarkdown inline className="inline font-bold text-inherit">{step.title}</GlobalMarkdown>
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-zinc-850 leading-loose overflow-x-auto max-w-full relative py-1 space-y-3 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_.katex-display]:my-3">
                          <GlobalMarkdown>{formatSpacedContent(step.content) + (isCurrentStep ? " ▌" : "")}</GlobalMarkdown>
                        </div>

                        {msg.role === 'model' && !msg.isTyping && onAskDoubt && (
                          <div className="mt-3 pt-2.5 border-t border-zinc-100 flex justify-end">
                            <button
                              onClick={() => onAskDoubt?.(step.step_id || (sIdx + 1), step.title || '', step.content)}
                              className="text-xs px-3 py-1.5 rounded-xl font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 active:scale-95 transition-all flex items-center gap-1.5 border border-indigo-100/50 shadow-sm"
                            >
                              <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>Tap to Ask a Doubt</span>
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  {/* Key Formula / Identity Cheat-Box */}
                  {parsedSolution?.key_formula && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-purple-500/10 border border-amber-400/30 shadow-sm"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                          <span>🧮</span>
                          <span>Core Formula / Identity</span>
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-zinc-900 overflow-x-auto py-0.5">
                        <GlobalMarkdown>{
                          parsedSolution.key_formula.trim().startsWith('$')
                            ? parsedSolution.key_formula
                            : `$$${parsedSolution.key_formula.trim()}$$`
                        }</GlobalMarkdown>
                      </div>
                    </motion.div>
                  )}

                  {/* Exam Trap */}
                  {parsedSolution?.exam_trap && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-amber-950 shadow-sm"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs font-extrabold text-amber-800 uppercase tracking-wide">
                          Exam Trap to Avoid
                        </span>
                      </div>
                      <div className="text-xs text-amber-900 font-medium leading-relaxed m-0">
                        <GlobalMarkdown>{parsedSolution.exam_trap}</GlobalMarkdown>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto overflow-y-hidden break-words py-0.5">
              {/* Safety: never render raw JSON strings to the student */}
              <GlobalMarkdown>
                {(displayedText.trim().startsWith('{') && (displayedText.includes('solution_steps') || displayedText.includes('markdown_content') || displayedText.includes('format_type')))
                  ? (msg.isTyping ? '✨ Thinking and preparing response...' : cleanText)
                  : displayedText}
              </GlobalMarkdown>
            </div>
          )}
        </div>

        {/* Dynamic Context Suggestions rendered inside the message for seamless study workflow */}
        {msg.role === 'model' && !msg.isTyping && suggestions.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-zinc-200/80 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-purple-700 font-extrabold text-[11px] tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse shrink-0" />
              <span>What to do next:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((sug, sIdx) => (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => onSuggestionClick?.(sug)}
                  className="text-xs px-3.5 py-2 rounded-2xl bg-purple-50/90 hover:bg-purple-100 text-purple-900 border border-purple-200/90 hover:border-purple-300 transition-all duration-200 active:scale-95 text-left flex items-center gap-2 font-bold shadow-xs hover:shadow-sm cursor-pointer group"
                  title="Tap to ask this question next"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-500 group-hover:text-purple-700 shrink-0 transition-colors" />
                  <span className="leading-snug inline-block max-w-full">
                    <GlobalMarkdown
                      inline
                      className="inline font-inherit text-inherit [&_.katex]:text-[1.05em]"
                    >
                      {formatSuggestionMath(sug)}
                    </GlobalMarkdown>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Premium, fully functional action icons */}
        {msg.role === 'model' && (
          <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-zinc-150 text-zinc-400">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-zinc-100 hover:text-zinc-700 transition-all active:scale-95 flex items-center gap-1 text-[11px] font-bold"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={onToggleLike}
              className={`p-1.5 rounded-lg hover:bg-zinc-100 transition-all active:scale-90 flex items-center gap-1 ${msg.isLiked ? 'text-indigo-600 bg-indigo-50 scale-110' : 'hover:text-zinc-700'
                }`}
              title="Like"
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${msg.isLiked ? 'fill-current' : ''}`} />
            </button>

            <button
              onClick={onToggleDislike}
              className={`p-1.5 rounded-lg hover:bg-zinc-100 transition-all active:scale-90 flex items-center gap-1 ${msg.isDisliked ? 'text-rose-600 bg-rose-50 scale-110' : 'hover:text-zinc-700'
                }`}
              title="Dislike"
            >
              <ThumbsDown className={`w-3.5 h-3.5 ${msg.isDisliked ? 'fill-current' : ''}`} />
            </button>

            <ReportAiButton
              aiOutput={cleanText || displayedText}
              context="AI Tutor Chat"
              variant="compact"
              label="Report"
              className="hover:text-red-600 hover:bg-red-50 text-zinc-400"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
});

interface SavedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: any;
  updatedAt: any;
}

const getChatCategory = (chat: SavedChat): { name: string; tag: string; color: string } => {
  const textToAnalyze = (chat.title + ' ' + (chat.messages?.map(m => m.text).join(' ') || '')).toLowerCase();

  if (textToAnalyze.includes("physics") || textToAnalyze.includes("force") || textToAnalyze.includes("gravity") || textToAnalyze.includes("motion") || textToAnalyze.includes("velocity") || textToAnalyze.includes("energy")) {
    return { name: "Physics", tag: "⚛️ Physics", color: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (textToAnalyze.includes("math") || textToAnalyze.includes("fraction") || textToAnalyze.includes("algebra") || textToAnalyze.includes("equation") || textToAnalyze.includes("calculus") || textToAnalyze.includes("geometry") || textToAnalyze.includes("divide") || textToAnalyze.includes("multiply") || textToAnalyze.includes("subtract") || textToAnalyze.includes("add") || textToAnalyze.includes("sage")) {
    return { name: "Math", tag: "📐 Math", color: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (textToAnalyze.includes("cell") || textToAnalyze.includes("plant") || textToAnalyze.includes("animal") || textToAnalyze.includes("photosynthesis") || textToAnalyze.includes("science") || textToAnalyze.includes("chemistry") || textToAnalyze.includes("biology") || textToAnalyze.includes("body") || textToAnalyze.includes("max")) {
    return { name: "Science", tag: "🔬 Science", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (textToAnalyze.includes("history") || textToAnalyze.includes("king") || textToAnalyze.includes("war") || textToAnalyze.includes("country") || textToAnalyze.includes("world") || textToAnalyze.includes("revolution")) {
    return { name: "History", tag: "🏛️ History", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  }
  return { name: "General Study", tag: "📝 General", color: "bg-zinc-100 text-zinc-700 border-zinc-200" };
};

// ----------------------------------------------------
// PERSONAS CONFIGURATION (ALL ALIGNED STRICTLY WITH COLLEGE BOARD AP EXAMS)
// ----------------------------------------------------
const PERSONAS = {
  owl: {
    id: 'owl' as const,
    name: 'Personal AI Tutor',
    title: 'Personal AI Tutor',
    emoji: '✨',
    avatarImg: '',
    color: 'from-purple-500 to-indigo-600',
    borderColor: 'border-purple-500/30',
    bgLight: 'bg-purple-500/10',
    textColor: 'text-purple-300',
    description: 'Patient, clear, and comprehensive academic explanations.',
    promptSuffix: '\n\nTone: Patient, thorough, and encouraging.'
  },
  cosmo: {
    id: 'cosmo' as const,
    name: 'Captain Cosmo',
    title: 'Captain Cosmo',
    emoji: '🚀',
    avatarImg: '',
    color: 'from-blue-500 to-cyan-600',
    borderColor: 'border-blue-500/30',
    bgLight: 'bg-blue-500/10',
    textColor: 'text-blue-300',
    description: 'Energetic STEM, physics, and science coaching.',
    promptSuffix: '\n\nTone: Energetic, enthusiastic, and practical.'
  },
  wizard: {
    id: 'wizard' as const,
    name: 'Dr. Sage',
    title: 'Dr. Sage',
    emoji: '👨‍🏫',
    avatarImg: '',
    color: 'from-amber-500 to-yellow-600',
    borderColor: 'border-amber-500/30',
    bgLight: 'bg-amber-500/10',
    textColor: 'text-amber-300',
    description: 'Math shortcuts, quick logic, and problem-solving tips.',
    promptSuffix: '\n\nTone: Clear, fast, and structured.'
  },
  dino: {
    id: 'dino' as const,
    name: 'Investigator Max',
    title: 'Investigator Max',
    emoji: '🔬',
    avatarImg: '',
    color: 'from-emerald-500 to-teal-600',
    borderColor: 'border-emerald-500/30',
    bgLight: 'bg-emerald-500/10',
    textColor: 'text-emerald-300',
    description: 'Science, biology, and chemistry analysis.',
    promptSuffix: '\n\nTone: Curious, analytical, and clear.'
  }
};

const getDynamicTutorPrompts = () => {
  const profile = getUserProfileData();
  const stream = (profile.stream || '').toLowerCase();

  let blueprint: any = null;
  try {
    if (typeof getStoredExamBlueprint === 'function') {
      blueprint = getStoredExamBlueprint();
    }
  } catch (_) {}
  if (blueprint && typeof blueprint === 'object') {
    const customPrompts: any[] = [];
    for (const [subjName, bp] of Object.entries(blueprint)) {
      if (Array.isArray(bp.coreUnits) && bp.coreUnits.length > 0) {
        for (const unit of bp.coreUnits.slice(0, 2)) {
          customPrompts.push({
            title: unit,
            desc: `Master ${subjName} core concept for ${profile.targetExam || 'exam'}.`,
            text: `Explain ${unit} in ${subjName} step by step with official exam formulas and common pitfalls!`,
            emoji: "🎯",
            category: subjName
          });
        }
      }
    }
    if (customPrompts.length >= 2) {
      return customPrompts.slice(0, 4);
    }
  }

  if (stream.includes('med') || stream.includes('bio')) {
    return [
      { title: "DNA Replication & Enzymes", desc: "Helicase, polymerase & replication fork.", text: "Explain the complete process of DNA replication step by step!", emoji: "🧬", category: "Biology" },
      { title: "Cellular Respiration & ATP", desc: "Glycolysis, Krebs cycle, and electron transport.", text: "Break down the ATP yield and cellular respiration steps clearly!", emoji: "⚡", category: "Biology" },
      { title: "Mitosis vs Meiosis Differences", desc: "Phases, crossing over & genetic variation.", text: "What are the key differences between Mitosis and Meiosis?", emoji: "🎯", category: "Biology" },
      { title: "Photosynthesis Reactions", desc: "Light reactions vs Calvin cycle.", text: "Explain light-dependent reactions and the Calvin cycle clearly!", emoji: "🌿", category: "Biology" }
    ];
  }

  if (stream.includes('business') || stream.includes('econ') || stream.includes('commerce')) {
    return [
      { title: "Price Elasticity of Demand", desc: "Elastic vs inelastic demand & revenue.", text: "Explain price elasticity of demand and how it impacts revenue!", emoji: "📈", category: "Economics" },
      { title: "Monetary Policy & Inflation", desc: "Interest rates, central banks & money supply.", text: "How do central banks use interest rates to control inflation?", emoji: "🏦", category: "Economics" },
      { title: "Market Structures", desc: "Perfect competition vs monopoly.", text: "Compare perfect competition, monopolistic competition, and monopoly!", emoji: "💼", category: "Economics" },
      { title: "Fiscal Policy Basics", desc: "Government spending & taxation.", text: "Explain expansionary vs contractionary fiscal policy with examples!", emoji: "🧾", category: "Economics" }
    ];
  }

  if (stream.includes('human') || stream.includes('art') || stream.includes('law')) {
    return [
      { title: "Essay Writing & Thesis Statements", desc: "How to craft compelling arguments.", text: "Teach me how to write a strong thesis statement and essay outline!", emoji: "✍️", category: "Writing" },
      { title: "The Industrial Revolution", desc: "Social and economic impacts.", text: "Analyze the major social and economic impacts of the Industrial Revolution!", emoji: "📜", category: "History" },
      { title: "Constitutional Principles", desc: "Separation of powers & checks and balances.", text: "Explain the separation of powers and checks and balances with examples!", emoji: "⚖️", category: "Civics" },
      { title: "Rhetorical Devices & Analysis", desc: "Ethos, pathos, logos & persuasion.", text: "Explain ethos, pathos, and logos with clear modern examples!", emoji: "🏛️", category: "Literature" }
    ];
  }

  // Default / STEM & Math
  return [
    { title: "Newton's Laws of Motion", desc: "Force, mass, acceleration & action-reaction.", text: "Explain Newton's Three Laws of Motion with real-world examples!", emoji: "⚡", category: "Physics" },
    { title: "Calculus: Differentiation Rules", desc: "Chain rule, product rule & power rule.", text: "Teach me differentiation and the Chain Rule step by step!", emoji: "📐", category: "Calculus" },
    { title: "Chemical Bonding & VSEPR", desc: "Ionic, covalent & molecular geometry.", text: "Explain chemical bonding and molecular shapes clearly!", emoji: "🧪", category: "Chemistry" },
    { title: "Conservation of Energy", desc: "Kinetic, potential & work-energy theorem.", text: "Explain conservation of energy and solve a simple problem step by step!", emoji: "🎯", category: "Physics" }
  ];
};

const LINE_1 = "YOUR PERSONAL";
const LINE_2 = "AI TUTOR";
const LINE_3 = "ASK ME ANYTHING";
const LINE_4 = "ANY TIME";

const AITutorTypewriterHeading = React.memo(function AITutorTypewriterHeading() {
  const [displayedLine1, setDisplayedLine1] = useState("");
  const [displayedLine2, setDisplayedLine2] = useState("");
  const [displayedLine3, setDisplayedLine3] = useState("");
  const [displayedLine4, setDisplayedLine4] = useState("");
  const [activeLine, setActiveLine] = useState(1);

  useEffect(() => {
    let currentIdx1 = 0;
    let currentIdx2 = 0;
    let currentIdx3 = 0;
    let currentIdx4 = 0;
    let timer1: any;
    let timer2: any;
    let timer3: any;
    let timer4: any;

    const typeLine1 = () => {
      if (currentIdx1 <= LINE_1.length) {
        setDisplayedLine1(LINE_1.slice(0, currentIdx1));
        currentIdx1++;
        timer1 = setTimeout(typeLine1, 55);
      } else {
        setActiveLine(2);
        timer2 = setTimeout(typeLine2, 140);
      }
    };

    const typeLine2 = () => {
      if (currentIdx2 <= LINE_2.length) {
        setDisplayedLine2(LINE_2.slice(0, currentIdx2));
        currentIdx2++;
        timer2 = setTimeout(typeLine2, 55);
      } else {
        setActiveLine(3);
        timer3 = setTimeout(typeLine3, 160);
      }
    };

    const typeLine3 = () => {
      if (currentIdx3 <= LINE_3.length) {
        setDisplayedLine3(LINE_3.slice(0, currentIdx3));
        currentIdx3++;
        timer3 = setTimeout(typeLine3, 55);
      } else {
        setActiveLine(4);
        timer4 = setTimeout(typeLine4, 140);
      }
    };

    const typeLine4 = () => {
      if (currentIdx4 <= LINE_4.length) {
        setDisplayedLine4(LINE_4.slice(0, currentIdx4));
        currentIdx4++;
        timer4 = setTimeout(typeLine4, 60);
      } else {
        setActiveLine(5);
      }
    };

    timer1 = setTimeout(typeLine1, 150);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, []);

  const handleSkip = () => {
    setDisplayedLine1(LINE_1);
    setDisplayedLine2(LINE_2);
    setDisplayedLine3(LINE_3);
    setDisplayedLine4(LINE_4);
    setActiveLine(5);
  };

  return (
    <div 
      onClick={handleSkip}
      className="text-center select-none py-4 sm:py-8 px-2 flex flex-col items-center justify-center cursor-pointer group"
    >
      <style>{`
        @keyframes aitutor-cursor-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .animate-aitutor-blink {
          animation: aitutor-cursor-blink 0.8s steps(1) infinite !important;
        }
      `}</style>

      {/* Brand Header: YOUR PERSONAL AI TUTOR */}
      <div className="flex flex-col items-center">
        <h2 className="text-[clamp(1.75rem,5.5vw,3rem)] font-black text-zinc-800 tracking-tight whitespace-nowrap leading-tight font-sans">
          <span>{displayedLine1}</span>
          {activeLine === 1 && (
            <span
              className="inline-block w-[3px] sm:w-[3.5px] h-[0.85em] bg-purple-600 ml-1 rounded-full align-middle animate-aitutor-blink"
              style={{ animation: 'aitutor-cursor-blink 0.8s steps(1) infinite' }}
            />
          )}
        </h2>

        <h2 className="text-[clamp(1.75rem,5.5vw,3rem)] font-black text-purple-600 tracking-tight whitespace-nowrap leading-tight mt-1 font-sans flex items-center justify-center">
          <span>{displayedLine2}</span>
          {activeLine === 2 && (
            <span
              className="inline-block w-[3px] sm:w-[3.5px] h-[0.85em] bg-purple-600 ml-1.5 rounded-full align-middle animate-aitutor-blink"
              style={{ animation: 'aitutor-cursor-blink 0.8s steps(1) infinite' }}
            />
          )}
        </h2>
      </div>

      {/* Sub Header: ASK ME ANYTHING ANY TIME */}
      <div className="mt-3 sm:mt-5 flex flex-col items-center">
        <h2 className="text-[clamp(1.5rem,4.8vw,2.5rem)] font-black text-zinc-800 tracking-tight whitespace-nowrap leading-tight font-sans">
          <span>{displayedLine3}</span>
          {activeLine === 3 && (
            <span
              className="inline-block w-[3px] sm:w-[3.5px] h-[0.85em] bg-purple-600 ml-1 rounded-full align-middle animate-aitutor-blink"
              style={{ animation: 'aitutor-cursor-blink 0.8s steps(1) infinite' }}
            />
          )}
        </h2>

        <h2 className="text-[clamp(1.5rem,4.8vw,2.5rem)] font-black text-purple-600 tracking-tight whitespace-nowrap leading-tight mt-1 font-sans flex items-center justify-center">
          <span>{displayedLine4}</span>
          {(activeLine === 4 || activeLine === 5) && (
            <span
              className="inline-block w-[3px] sm:w-[3.5px] h-[0.85em] bg-purple-600 ml-1.5 rounded-full align-middle shadow-xs shadow-purple-500/50 animate-aitutor-blink"
              style={{ animation: 'aitutor-cursor-blink 0.8s steps(1) infinite' }}
            />
          )}
        </h2>
      </div>
    </div>
  );
});

export default function AITutor({
  isVip,
  isActive = true,
  onBack
}: {
  isVip: boolean;
  isActive?: boolean;
  onBack?: () => void;
}) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    Network.getStatus().then((status) => {
      setIsOffline(!status.connected);
    }).catch(err => {
      console.warn("AITutor: Failed to get initial network status", err);
    });

    const listener = Network.addListener('networkStatusChange', (status) => {
      setIsOffline(!status.connected);
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  // NOTE: isActive stop-audio effect is registered BELOW after recognitionRef and setIsListening are declared

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [samplePrompts, setSamplePrompts] = useState<any[]>([]);

  const rotateSuggestions = () => {
    const dynamicPool = getDynamicTutorPrompts();
    const shuffled = [...dynamicPool].sort(() => 0.5 - Math.random());
    setSamplePrompts(shuffled.slice(0, 4));
  };

  useEffect(() => {
    rotateSuggestions();
  }, []);
  const [loading, setLoading] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const isUserScrollingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatDocId, setChatDocId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() => {
    return getUserHistory<SavedChat[]>('stale_tutor_chats', []);
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [tutorChatId, setTutorChatId] = useState<string | null>(null);

  // Hold & Typist States
  const [isHolding, setIsHolding] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);

  const [viewportBottomOffset, setViewportBottomOffset] = useState(0);

  useEffect(() => { setViewportBottomOffset(0); }, []);

  // Premium Tutor Personas (Pro Feature)
  const [activePersona, setActivePersona] = useState<'owl' | 'cosmo' | 'wizard' | 'dino'>('owl');
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ active: boolean; message: string } | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [lastRequestArgs, setLastRequestArgs] = useState<{ text?: string; file?: File; type?: 'image' | 'document'; subject?: string; handwritten?: boolean } | null>(null);

  const [contextualDoubt, setContextualDoubt] = useState<{ stepId: number; content: string; title: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow height of the chat input textarea (caps at max 144px, roughly 6 lines)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const nextHeight = Math.min(inputRef.current.scrollHeight, 144);
      inputRef.current.style.height = `${nextHeight}px`;
    }
  }, [chatInput]);

  // File Upload & Plus Menu States
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFilePreview, setAttachedFilePreview] = useState<string | null>(null);
  const [attachedFileType, setAttachedFileType] = useState<'image' | 'document' | null>(null);
  const [fullscreenPreviewUrl, setFullscreenPreviewUrl] = useState<string | null>(null);
  const [failedAttachment, setFailedAttachment] = useState<File | null>(null);
  const [failedAttachmentPreview, setFailedAttachmentPreview] = useState<string | null>(null);
  const [failedAttachmentType, setFailedAttachmentType] = useState<'image' | 'document' | null>(null);
  const [documentContent, setDocumentContent] = useState<string>('');

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (fullscreenPreviewUrl) {
        e.preventDefault();
        triggerVibration(10);
        setFullscreenPreviewUrl(null);
      } else if (historyOpen) {
        e.preventDefault();
        triggerVibration(10);
        setHistoryOpen(false);
      } else if (personaModalOpen) {
        e.preventDefault();
        triggerVibration(10);
        setPersonaModalOpen(false);
      } else if (showPlusMenu) {
        e.preventDefault();
        triggerVibration(10);
        setShowPlusMenu(false);
      } else if (onBack) {
        e.preventDefault();
        triggerVibration(10);
        onBack();
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [fullscreenPreviewUrl, historyOpen, personaModalOpen, showPlusMenu, onBack]);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Brainwave / Thought visualizer states
  const [thinkingStep, setThinkingStep] = useState(0);
  const thinkingMessages = [
    "Reading your question carefully... 📖✨",
    "Analyzing academic context... 🔍🧠",
    "Formulating detailed explanation... 📝📐",
    "Processing complex equations and formulas... ⚡🚀",
    "Structuring rigorous conceptual step-by-step logic... 💡🎯",
    "Synthesizing high-yield exam takeaways... 🎓💪"
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef('');

  // Handle auto-scroll during response generations
  useEffect(() => {
    if (!isUserScrolling) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isUserScrolling]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Detect if user has scrolled up from the bottom by more than 50px
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 50;
    if (isScrolledUp) {
      if (!isUserScrolling) {
        setIsUserScrolling(true);
        isUserScrollingRef.current = true;
      }
    } else {
      if (isUserScrolling) {
        setIsUserScrolling(false);
        isUserScrollingRef.current = false;
      }
    }
  };

  const scrollToBottom = () => {
    setIsUserScrolling(false);
    isUserScrollingRef.current = false;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  // Handle cycle of dynamic thinking messages
  useEffect(() => {
    if (!loading) {
      setThinkingStep(0);
      return;
    }
    const timer = setInterval(() => {
      setThinkingStep(prev => (prev + 1) % thinkingMessages.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [loading]);

  const handleSendMessageRef = useRef<any>(null);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  useEffect(() => {
    const handleScannerSendToTutor = (e: Event) => {
      const customEvent = e as CustomEvent<{
        text: string;
        imageFile: File;
        subject?: string;
        handwritten?: boolean;
        isEvaluation?: boolean;
        evaluationDetails?: {
          subjectTopic: string;
          userGrade: string;
          questionText: string;
          userAnswer: string;
        };
      }>;
      if (customEvent.detail) {
        const { text, imageFile, subject, handwritten, isEvaluation, evaluationDetails } = customEvent.detail;
        if (handleSendMessageRef.current) {
          handleSendMessageRef.current(text, imageFile, 'image', subject, handwritten, isEvaluation, evaluationDetails);
        }
      }
    };

    window.addEventListener('study-scanner-send-to-tutor', handleScannerSendToTutor);

    const handleCalculatorSendToTutor = (e: Event) => {
      const customEvent = e as CustomEvent<{ text?: string; expression?: string; trigMode?: string }>;
      if (customEvent.detail) {
        const text = customEvent.detail.text || customEvent.detail.expression;
        const mode = customEvent.detail.trigMode || 'Degrees (°)';
        if (text && handleSendMessageRef.current) {
          handleSendMessageRef.current(`Please solve and explain this math calculation step-by-step with 100% precision: ${text} (Angle Mode: ${mode})`);
        }
      }
    };

    window.addEventListener('study-calculator-send-to-tutor', handleCalculatorSendToTutor);

    return () => {
      window.removeEventListener('study-scanner-send-to-tutor', handleScannerSendToTutor);
      window.removeEventListener('study-calculator-send-to-tutor', handleCalculatorSendToTutor);
    };
  }, []);

  const toggleListening = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Speech recognition is not supported in this browser.", "warning");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { }
      }
      setIsListening(false);
      return;
    }

    // JIT PERMISSION: Microphone permission requested strictly when user taps the mic button
    const micGranted = await requestMicrophonePermission();
    if (!micGranted) {
      showToast("Microphone access is required for voice typing.", "warning");
      return;
    }

    try {
      // Abort any existing instance cleanly
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }

      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      baseTextRef.current = chatInput.trim();

      rec.onresult = (event: any) => {
        const speech = (event.results?.[0]?.[0]?.transcript || '').trim();
        if (speech) {
          // Clean duplicate consecutive words (e.g. "what what" -> "what")
          const cleaned = speech.replace(/\b(\w+)\s+\1\b/gi, '$1').replace(/\s+/g, ' ');
          const base = baseTextRef.current;
          setChatInput(base ? `${base} ${cleaned}` : cleaned);
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

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }
    };
  }, []);

  // Stop all speech synthesis and audio playback when switching away from Tutor tab
  // Must be declared AFTER recognitionRef (line 1173) and setIsListening (line 1081) to avoid crash
  useEffect(() => {
    if (isActive === false) {
      window.dispatchEvent(new CustomEvent('ap-exam:stop-all-tutor-audio'));
      try { window.speechSynthesis.cancel(); } catch (_) { }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) { }
      }
      setIsListening(false);
    }
  }, [isActive]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const optimized = await compressImageToFile(file, 1200, 0.8);
      setAttachedFile(optimized);
      setAttachedFileType('image');
      setAttachedFilePreview(URL.createObjectURL(optimized));
      setShowPlusMenu(false);
    }
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      setAttachedFileType('document');
      setAttachedFilePreview(file.name);
      setShowPlusMenu(false);

      // Read text file client-side
      if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setDocumentContent(event.target?.result as string);
        };
        reader.readAsText(file);
      } else {
        setDocumentContent(`[Student uploaded a study document: ${file.name}]`);
      }
    }
  };

  const handleNativeImagePicked = async (picked: any) => {
    const optimized = await compressImageToFile(picked.fileObj, 1200, 0.8);
    setAttachedFile(optimized);
    setAttachedFileType('image');
    setAttachedFilePreview(picked.dataUrl || URL.createObjectURL(optimized));
    setShowPlusMenu(false);
  };

  const handleNativeDocPicked = (picked: any) => {
    setAttachedFile(picked.fileObj);
    setAttachedFileType('document');
    setAttachedFilePreview(picked.name);
    setShowPlusMenu(false);

    if (picked.name.endsWith('.txt') || picked.name.endsWith('.md') || picked.name.endsWith('.csv')) {
      try {
        const text = atob(picked.base64);
        setDocumentContent(text);
      } catch (e) {
        console.error('Error decoding native text file:', e);
        setDocumentContent(`[Student uploaded a study document: ${picked.name}]`);
      }
    } else {
      setDocumentContent(`[Student uploaded a study document: ${picked.name}]`);
    }
  };

  // Auto-retry timer countdown
  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  const wordCount = chatInput.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleSendMessage = async (
    textToSend?: string,
    overrideFile?: File,
    overrideFileType?: 'image' | 'document',
    subject?: string,
    handwritten?: boolean,
    isEvaluation?: boolean,
    evaluationDetails?: {
      subjectTopic: string;
      userGrade: string;
      questionText: string;
      userAnswer: string;
    }
  ) => {
    if (loading) return;
    let activeAttachedFile = overrideFile || attachedFile;
    const activeAttachedType = overrideFileType || attachedFileType;

    if (activeAttachedFile && activeAttachedType === 'image' && activeAttachedFile.size > 350 * 1024) {
      activeAttachedFile = await compressImageToFile(activeAttachedFile, 1200, 0.8);
    }

    let queryText = textToSend !== undefined ? textToSend : chatInput;

    if (isEvaluation && evaluationDetails) {
      queryText = `Subject Topic: ${evaluationDetails.subjectTopic}
Grade: ${evaluationDetails.userGrade}
Question Attempted: "${evaluationDetails.questionText}"
Student's Answer: "${evaluationDetails.userAnswer}"
Please evaluate this answer strictly according to your system rubric.`;
    }

    if (!queryText.trim() && !activeAttachedFile) return;

    // ELITE ROUTING LOGIC: Pro vs Free (AI Tutor charges 1 coin on output generation)
    if (!isProUser()) {
      const coins = getCoins();
      if (coins < 1) {
        // BLOCK & TRIGGER PAYWALL
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Tutoring Chat", cost: 1 } }));
        return;
      }
    }

    // Clear rate limit info on new attempt
    setRateLimitInfo(null);
    setRetryCountdown(0);
    setLastRequestArgs({ text: queryText, file: activeAttachedFile, type: activeAttachedType, subject, handwritten });

    // Append document content if attached and read
    if (activeAttachedType === 'document' && (documentContent || overrideFile)) {
      queryText = `[Uploaded Document Content from ${activeAttachedFile?.name || 'file'}]:\n${documentContent || ''}\n\nStudent Question:\n${queryText}`;
    }

    if (!textToSend) {
      setChatInput('');
    }

    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
    }

    // Reset hold & menu states
    setIsHolding(false);
    setShowPlusMenu(false);

    // Save attachment data to construct user message representation
    const textToShow = (isEvaluation && evaluationDetails) ? evaluationDetails.userAnswer : (textToSend || chatInput);
    const userMsgText = (isEvaluation && evaluationDetails)
      ? textToShow
      : (activeAttachedFile
        ? `📎 Attached: ${activeAttachedFile.name || 'Image'}\n\n${textToShow}`
        : textToShow);

    let persistentImageUrl: string | undefined = undefined;
    let persistentImageTimestamp: number | undefined = undefined;

    const backgroundUploadPromise = (async () => {
      if (activeAttachedFile && activeAttachedType === 'image') {
        try {
          const fileExtension = activeAttachedFile.name?.split('.').pop() || 'jpg';
          const uniqueFileName = `chat_images/${auth.currentUser?.uid || 'anon'}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
          const storageRef = ref(storage, uniqueFileName);
          const uploadResult = await uploadBytes(storageRef, activeAttachedFile);
          persistentImageUrl = await getDownloadURL(uploadResult.ref);
          persistentImageTimestamp = Date.now();
          console.log("Background image upload completed successfully:", persistentImageUrl);
        } catch (err) {
          console.warn("Background image upload failed, using local fallback:", err);
        }
      }
    })();

    const localImageUrl = (activeAttachedFile && activeAttachedType === 'image')
      ? (attachedFilePreview || URL.createObjectURL(activeAttachedFile))
      : undefined;

    const updatedMessages = [...messages, {
      role: 'user' as const,
      text: userMsgText,
      ...(localImageUrl ? { imageUrl: localImageUrl, imageTimestamp: Date.now() } : {})
    }];
    setMessages(updatedMessages);

    // Instantiate a new AbortController for streaming cancellation with safety timeout
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const streamTimeoutId = setTimeout(() => {
      try { controller.abort(); } catch (e) { }
    }, 45000);

    setLoading(true);

    if (!overrideFile) {
      // Clear attachments locally
      setAttachedFile(null);
      setAttachedFilePreview(null);
      setAttachedFileType(null);
      setDocumentContent('');
    }

    try {
      const formData = new FormData();
      formData.append('message', queryText);

      if (contextualDoubt) {
        formData.append('contextualDoubtStepId', String(contextualDoubt.stepId));
        formData.append('contextualDoubtContent', contextualDoubt.content);
        formData.append('contextualDoubtTitle', contextualDoubt.title);
      }

      const personaSuffix = PERSONAS[activePersona].promptSuffix;

      let scannerRoutingInstructions = "";
      const currentActiveSubject = subject || safeGetItem('selected_subject') || safeGetItem('academic_subject') || safeGetItem('subject') || 'General Studies';
      if (currentActiveSubject) {
        const sLower = currentActiveSubject.toLowerCase();
        if (sLower.includes('phys')) {
          scannerRoutingInstructions += "\n\nAnalyze this image specifically for Physics concepts. Extract any formulas, identify variables, and solve step-by-step with SI units.";
        } else if (sLower.includes('chem')) {
          scannerRoutingInstructions += "\n\nAnalyze this image for Chemistry. Accurately read chemical equations, structural formulas, or IUPAC names and provide balanced reactions or detailed mechanisms.";
        } else if (sLower.includes('bio')) {
          scannerRoutingInstructions += "\n\nAnalyze this image for Biology. Identify anatomical structures, cellular processes, or genetic sequences, and provide detailed functional explanations.";
        } else if (sLower.includes('math') || sLower.includes('quant')) {
          scannerRoutingInstructions += "\n\nAnalyze this image specifically for Quantitative Aptitude / Mathematics. Extract numerical equations, geometry diagrams, and solve with standard step-by-step theorems and shortcut verification.";
        } else if (sLower.includes('reason') || sLower.includes('intel')) {
          scannerRoutingInstructions += "\n\nAnalyze this image specifically for General Intelligence and Reasoning. Decipher logic patterns, syllogisms, or matrix diagrams and outline the exact deductive reasoning rule.";
        } else if (sLower.includes('eng') || sLower.includes('comprehension')) {
          scannerRoutingInstructions += "\n\nAnalyze this image specifically for English Language and Comprehension. Identify grammar rules, sentence corrections, vocabulary context, or reading passage inferences.";
        } else if (sLower.includes('aware') || sLower.includes('gk') || sLower.includes('polity') || sLower.includes('hist')) {
          scannerRoutingInstructions += "\n\nAnalyze this image specifically for General Knowledge and Social Sciences. Identify historical events, constitutional articles, or geographical data.";
        }
      }
      if (handwritten) {
        scannerRoutingInstructions += "\n\nPay special attention to deciphering handwritten text, messy variables, or hand-drawn diagrams before solving.";
      }

      // Use TEXT_CHAT prompt for pure text messages, IMAGE_SCAN prompt only when an image is attached
      const hasImageAttached = !!(activeAttachedFile && activeAttachedType === 'image');
      const baseSystemInstruction = hasImageAttached
        ? SYSTEM_INSTRUCTION_NURSERY + personaSuffix + scannerRoutingInstructions
        : SYSTEM_INSTRUCTION_TEXT_CHAT + personaSuffix;
      formData.append('customSystemInstruction', baseSystemInstruction);
      formData.append('profileContext', getProfileContext(currentActiveSubject));
      formData.append('subject', currentActiveSubject);
      formData.append('stream', currentActiveSubject);
      formData.append('gradeLevel', safeGetItem('academic_grade') || '11th Grade (Junior)');

      // Optimize history: Keep last 6 turns and prune distant massive JSON payloads to eliminate latency on long inputs
      const recentMessages = messages.slice(-6);
      const formattedHistory = recentMessages.map(m => {
        if (!m.text) return null;
        let historyText = m.text;
        if (m.role === 'model' && historyText.length > 800) {
          try {
            const parsed = parsePartialJSON(historyText);
            if (parsed?.markdown_content) {
              historyText = parsed.markdown_content.slice(0, 500);
            } else if (parsed?.solution_steps && Array.isArray(parsed.solution_steps)) {
              historyText = parsed.solution_steps.map((s: any) => `${s.title}: ${s.content?.slice(0, 100)}`).join('\n').slice(0, 500);
            } else {
              historyText = historyText.slice(0, 500);
            }
          } catch (e) {
            historyText = historyText.slice(0, 500);
          }
        }
        return { role: m.role, parts: [{ text: historyText }] };
      }).filter(Boolean);

      formData.append('history', JSON.stringify(formattedHistory));

      // Append image if we have an image attachment
      if (activeAttachedFile && activeAttachedType === 'image') {
        formData.append('image', activeAttachedFile);
      }

      if (isEvaluation) {
        formData.append('isEvaluation', 'true');
      }

      formData.append('stream', 'true');

      const response = await fetch(getApiUrl('/api/chat'), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          const errData = await response.json();
          if (errData.isRateLimit) {
            setRateLimitInfo({ active: true, message: errData.error });
            setRetryCountdown(60);
            setLoading(false);
            return;
          }
          throw new Error("Quota exceeded");
        }
        let serverErrorMsg = "Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.";
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            serverErrorMsg = errData.error;
          }
        } catch (e) { }
        throw new Error(serverErrorMsg);
      }

      const contentType = response.headers.get("content-type") || "";
      let finalAIResponseText = "";

      if (contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        if (!reader) {
          throw new Error("Response body is not readable.");
        }

        // Add a placeholder message for the streaming response
        const modelMessageIdx = updatedMessages.length;
        const initialModelMessage: ChatMessage = {
          role: 'model' as const,
          text: '',
          displayedText: '',
          isTyping: true
        };
        setMessages([...updatedMessages, initialModelMessage]);

        let buffer = "";
        let streamCompletedSuccessfully = false;
        let watchdogTimer: any = null;

        const resetWatchdog = () => {
          if (watchdogTimer) clearTimeout(watchdogTimer);
          watchdogTimer = setTimeout(() => {
            console.warn("[AITutor] Stream chunk inactivity watchdog fired (no data for 12s). Cancelling stream to finalize/recover.");
            try { reader.cancel(); } catch (e) { }
          }, 12000);
        };

        resetWatchdog();

        try {
          streamLoop: while (true) {
            const { value, done } = await reader.read();
            if (done) break streamLoop;

            resetWatchdog();

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(":")) continue; // Skip heartbeats or empty lines

              if (trimmed.startsWith("data: ")) {
                const dataStr = trimmed.slice(6).trim();
                if (dataStr === "[DONE]") {
                  streamCompletedSuccessfully = true;
                  break streamLoop;
                }

                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.error) {
                    throw new Error(parsed.error);
                  }
                  if (parsed.text) {
                    finalAIResponseText += parsed.text;

                    setMessages(prev => {
                      const next = [...prev];
                      if (next[modelMessageIdx]) {
                        const text = finalAIResponseText;
                        const isJson = text.trim().startsWith('{') || text.trim().includes('"solution_steps"') || text.trim().includes('"markdown_content"') || text.trim().includes('"format_type"');
                        next[modelMessageIdx] = {
                          ...next[modelMessageIdx],
                          text,
                          displayedText: isJson ? text : '',
                          isTyping: true
                        };
                      }
                      return next;
                    });

                    // Scroll container down if user is not actively scrolling up
                    if (!isUserScrollingRef.current) {
                      const scrollAnchor = document.getElementById('ai-chat-scroll-anchor');
                      if (scrollAnchor) {
                        scrollAnchor.scrollIntoView({ behavior: 'auto' });
                      }
                    }
                  }
                } catch (e) {
                  console.warn("Error parsing stream chunk:", e);
                }
              }
            }
          }
        } catch (streamErr) {
          console.warn("Streaming connection ended or interrupted:", streamErr);
        } finally {
          if (watchdogTimer) clearTimeout(watchdogTimer);

          // Deep check if JSON was complete or cut off mid-step
          let isJsonValidAndComplete = false;
          try {
            const p = JSON.parse(finalAIResponseText.trim());
            if (p && (Array.isArray(p.solution_steps) || p.markdown_content || p.response)) {
              isJsonValidAndComplete = true;
            }
          } catch {
            isJsonValidAndComplete = false;
          }

          // If stream ended prematurely without [DONE] or JSON was cut off/incomplete,
          // auto-recover by requesting full non-streamed response from server so user NEVER sees cut-off text!
          if (!streamCompletedSuccessfully || !isJsonValidAndComplete) {
            try {
              console.warn("[AITutor] Stream interrupted or incomplete. Attempting seamless auto-recovery fallback...");
              formData.set('stream', 'false');
              const recoveryRes = await fetch(getApiUrl('/api/chat'), {
                method: 'POST',
                body: formData
              });
              if (recoveryRes.ok) {
                const recoveryData = await recoveryRes.json();
                if (recoveryData && recoveryData.text) {
                  finalAIResponseText = recoveryData.text;
                }
              }
            } catch (recErr) {
              console.warn("[AITutor] Auto-recovery attempt error:", recErr);
            }
          }

          // Set isTyping to false once stream is fully complete or recovered
          setMessages(prev => {
            const next = [...prev];
            if (next[modelMessageIdx]) {
              const text = finalAIResponseText;
              const isJson = text.trim().startsWith('{') || text.trim().includes('"solution_steps"') || text.trim().includes('"markdown_content"') || text.trim().includes('"format_type"');
              next[modelMessageIdx] = {
                ...next[modelMessageIdx],
                text,
                displayedText: isJson ? text : '',
                isTyping: false
              };
            }
            return next;
          });
          // Instantly clear loading and stop button so user can interact immediately!
          setLoading(false);
          clearTimeout(streamTimeoutId);
          abortControllerRef.current = null;
        }

      } else {
        // Fallback for standard JSON responses
        const data = await response.json();
        finalAIResponseText = data.text;

        const isJson = finalAIResponseText.trim().startsWith('{') || finalAIResponseText.trim().includes('"solution_steps"') || finalAIResponseText.trim().includes('"markdown_content"') || finalAIResponseText.trim().includes('"format_type"');
        const finalMessages = [...updatedMessages, {
          role: 'model' as const,
          text: finalAIResponseText,
          isTyping: !isJson,
          displayedText: isJson ? finalAIResponseText : ''
        }];
        setMessages(finalMessages);
      }

      // Auto-detect and log student misconceptions or common traps
      detectAndLogMistake('Chat', textToShow, finalAIResponseText).catch(e => console.error("Mistake auto-capture failed:", e));
      try { trackQuestProgress('tutor', 1); } catch (_) {}

      // Clear contextual doubt state now that it has been sent
      setContextualDoubt(null);

      // Save messages and chat state (Instant local state + LocalStorage + Firestore)
      const textTitle = (isEvaluation && evaluationDetails) ? evaluationDetails.userAnswer : (textToSend || chatInput);
      const sessionTitle = textTitle.length > 40 ? textTitle.substring(0, 40) + '...' : textTitle;

      const currentUid = auth.currentUser?.uid || safeGetItem('last_logged_in_user') || 'guest_user';
      const storageKey = `stale_tutor_chats_${currentUid}`;

      const dbImageUrl = persistentImageUrl || localImageUrl;
      const dbImageTimestamp = persistentImageTimestamp || (localImageUrl ? Date.now() : undefined);

      const isJsonFinal = finalAIResponseText.trim().startsWith('{') || finalAIResponseText.trim().includes('"solution_steps"') || finalAIResponseText.trim().includes('"markdown_content"') || finalAIResponseText.trim().includes('"format_type"');
      const finalMessages = [...updatedMessages, {
        role: 'model' as const,
        text: finalAIResponseText,
        isTyping: false,
        displayedText: isJsonFinal ? finalAIResponseText : ''
      }].map(m => {
        if (m.role === 'user' && m.imageUrl === localImageUrl && dbImageUrl) {
          return { ...m, imageUrl: dbImageUrl, imageTimestamp: dbImageTimestamp };
        }
        return m;
      });

      // Synchronize messages state with final clean model output and isTyping: false
      setMessages(finalMessages);
      setLoading(false);
      clearTimeout(streamTimeoutId);
      abortControllerRef.current = null;

      const messagesPayload = finalMessages.map(m => ({
        role: m.role,
        text: m.text || '',
        ...(m.imageUrl ? { imageUrl: m.imageUrl, imageTimestamp: m.imageTimestamp ?? Date.now() } : {})
      }));

      const existingChatId = tutorChatId || `local_${Date.now()}`;
      if (!tutorChatId) {
        setTutorChatId(existingChatId);
      }

      // 1. Instantly update local savedChats state & LocalStorage per-user for zero-lag UI
      const nowObj = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
      setSavedChats(prevChats => {
        const safePrev = Array.isArray(prevChats) ? prevChats : [];
        const existingIdx = safePrev.findIndex(c => c.id === existingChatId || (tutorChatId && c.id === tutorChatId));
        let updatedList: SavedChat[];
        if (existingIdx >= 0) {
          updatedList = [...safePrev];
          updatedList[existingIdx] = {
            ...updatedList[existingIdx],
            title: updatedList[existingIdx].title || sessionTitle,
            messages: finalMessages,
            updatedAt: nowObj
          };
        } else {
          const newChat: SavedChat = {
            id: existingChatId,
            title: sessionTitle,
            messages: finalMessages,
            createdAt: nowObj,
            updatedAt: nowObj
          };
          updatedList = [newChat, ...safePrev].slice(0, 25);
        }
        saveUserHistory('stale_tutor_chats', updatedList);
        return updatedList;
      });

      // 2. Sync to Firestore in the background (Non-blocking: UI & Send button are never frozen)
      if (auth.currentUser) {
        (async () => {
          try {
            await Promise.race([
              backgroundUploadPromise,
              new Promise(resolve => setTimeout(resolve, 2000))
            ]);

            if (!chatDocId) {
              const docRef = await addDoc(collection(db, 'pocket_items'), {
                userId: auth.currentUser.uid,
                userEmail: auth.currentUser.email || '',
                type: 'scan_chat',
                title: textTitle.length > 30 ? textTitle.substring(0, 30) + '...' : textTitle,
                text: `**You**: ${userMsgText}\n\n**AI**: ${finalAIResponseText}`,
                createdAt: serverTimestamp()
              });
              setChatDocId(docRef.id);
            } else {
              const combinedText = finalMessages
                .map(m => `**${m.role === 'user' ? 'You' : 'AI'}**: ${m.text}`)
                .join('\n\n');
              await updateDoc(doc(db, 'pocket_items', chatDocId), {
                text: combinedText
              });
            }

            if (!tutorChatId || tutorChatId.startsWith('local_')) {
              const tutorChatRef = await addDoc(collection(db, 'ai_tutor_chats'), {
                userId: auth.currentUser.uid,
                userEmail: auth.currentUser.email || '',
                title: sessionTitle,
                messages: messagesPayload,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              const newFirestoreId = tutorChatRef.id;
              setTutorChatId(newFirestoreId);
              setSavedChats(prev => {
                const updated = (Array.isArray(prev) ? prev : []).map(c =>
                  c.id === existingChatId ? { ...c, id: newFirestoreId } : c
                );
                saveUserHistory('stale_tutor_chats', updated);
                return updated;
              });
            } else {
              await updateDoc(doc(db, 'ai_tutor_chats', tutorChatId), {
                messages: messagesPayload,
                updatedAt: serverTimestamp()
              });
            }
          } catch (e) {
            console.error("Failed to save to firestore in background:", e);
          }
        })();
      }

      // Freemium/Free user coin deduction after successful output generation
      if (!isProUser()) {
        deductCoins(1, "AI Tutor Chat");
      }

      hapticNotification('SUCCESS');
    } catch (err: any) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log("Stream generation aborted by user.");
        return;
      }
      console.error(err);
      hapticNotification('ERROR');

      // Preserve failed attachment context for retry
      if (activeAttachedFile) {
        setFailedAttachment(activeAttachedFile);
        setFailedAttachmentPreview(localImageUrl || null);
        setFailedAttachmentType(activeAttachedType);
      }

      let errorMessage = "Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.";
      if (err instanceof Error) {
        if (err.message === "Quota exceeded") {
          errorMessage = "Service quota exceeded. Please wait a few moments before retrying your request.";
        } else if (err.message && (err.message.includes("breather") || err.message.includes("Oops") || err.message.includes("Try Again"))) {
          errorMessage = err.message;
        }
      }
      setMessages(prev => [...prev, { role: 'model', text: errorMessage, isError: true }]);
    } finally {
      clearTimeout(streamTimeoutId);
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleRetryMessage = async () => {
    // Find the last user message to retry
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      let originalText = lastUserMsg.text;
      if (originalText.includes("📎 Attached:")) {
        const parts = originalText.split("\n\n");
        if (parts.length > 1) {
          originalText = parts.slice(1).join("\n\n");
        }
      }

      // Remove the last model error message from local state
      setMessages(prev => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'model') {
          return prev.slice(0, -1);
        }
        return prev;
      });

      // Re-hydrate failed attachment if available
      const retryFile = failedAttachment;
      const retryType = failedAttachmentType;

      if (retryFile) {
        setAttachedFile(retryFile);
        setAttachedFilePreview(failedAttachmentPreview);
        setAttachedFileType(retryType);

        // Clear failed attachment reference now that it's being retried
        setFailedAttachment(null);
        setFailedAttachmentPreview(null);
        setFailedAttachmentType(null);
      }

      await handleSendMessage(originalText, retryFile || undefined, retryType || undefined);
    }
  };

  const startNewSession = () => {
    setMessages([]);
    setChatInput('');
    setChatDocId(null);
    setTutorChatId(null);
    setIsHolding(false);
    setAttachedFile(null);
    setAttachedFilePreview(null);
    setAttachedFileType(null);
    rotateSuggestions();
  };

  const fetchChatHistory = async () => {
    // 1. Immediately load local/cached history for the active user identity (never block UI)
    const localChats = getUserHistory<SavedChat[]>('stale_tutor_chats', []);
    if (Array.isArray(localChats) && localChats.length > 0) {
      setSavedChats(localChats);
    }

    if (!auth.currentUser) {
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'ai_tutor_chats'),
        where('userId', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const remoteChats: SavedChat[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        remoteChats.push({
          id: doc.id,
          title: data.title || 'Untitled Session',
          messages: data.messages || [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });

      // Crucial: MERGE remote chats with local chats by ID so local cache is NEVER erased!
      const mergedMap = new Map<string, SavedChat>();
      (localChats || []).forEach(c => {
        if (c && c.id) mergedMap.set(c.id, c);
      });
      remoteChats.forEach(c => {
        if (c && c.id) mergedMap.set(c.id, c);
      });

      const mergedList = Array.from(mergedMap.values());
      const getChatTime = (chat: SavedChat) => {
        const ts = chat.updatedAt || chat.createdAt;
        if (!ts) return 0;
        if (typeof ts.seconds === 'number') {
          return ts.seconds * 1000 + (ts.nanoseconds ? ts.nanoseconds / 1000000 : 0);
        }
        const parsed = new Date(ts).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };
      mergedList.sort((a, b) => getChatTime(b) - getChatTime(a));

      const toKeep = mergedList.slice(0, 25);
      setSavedChats(toKeep);
      saveUserHistory('stale_tutor_chats', toKeep);
    } catch (e) {
      console.warn("Failed to load chat history from firestore:", e);
      // Fallback: keep local history completely safe
      if (Array.isArray(localChats) && localChats.length > 0) {
        setSavedChats(localChats);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchChatHistory();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchChatHistory();
      }
    });

    const handleAccountChange = () => {
      fetchChatHistory();
    };
    window.addEventListener('user_account_changed', handleAccountChange);

    return () => {
      unsubscribe();
      window.removeEventListener('user_account_changed', handleAccountChange);
    };
  }, []);

  useEffect(() => {
    if (historyOpen) {
      fetchChatHistory();
    }
  }, [historyOpen]);

  const handleLoadChat = (chat: SavedChat) => {
    if (!chat || !Array.isArray(chat.messages)) return;
    setMessages(chat.messages);
    setTutorChatId(chat.id);
    setHistoryOpen(false);
    showToast(`Loaded "${chat.title}"`, 'info');
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (auth.currentUser && !id.startsWith('local_')) {
        await deleteDoc(doc(db, 'ai_tutor_chats', id));
      }
      setSavedChats(prev => {
        const next = (Array.isArray(prev) ? prev : []).filter(c => c.id !== id);
        saveUserHistory('stale_tutor_chats', next);
        return next;
      });
      if (tutorChatId === id) {
        startNewSession();
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  const isAnyMessageTyping = messages.length > 0 && messages[messages.length - 1].role === 'model' && messages[messages.length - 1].isTyping;

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6] relative text-zinc-900 overflow-hidden">

      {/* Header section */}
      <div className={`flex items-center justify-between p-4 border-b border-zinc-200 bg-[#FAF9F6]/95 backdrop-blur-md sticky top-0 shrink-0 ${personaModalOpen ? 'z-[1001]' : 'z-10'}`}>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={() => {
                triggerVibration(10);
                onBack();
              }}
              className="w-10 h-10 rounded-2xl border border-zinc-200/80 bg-white hover:bg-zinc-50 text-zinc-700 shadow-xs flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer"
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-700" />
            </button>
          )}
          <button
            onClick={() => setHistoryOpen(true)}
            className="w-10 h-10 rounded-2xl border border-zinc-200/80 bg-white hover:bg-zinc-50 text-zinc-700 shadow-xs flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer"
            title="Chat History Menu"
            aria-label="Open Chat History"
          >
            <Menu className="w-5 h-5 text-zinc-700" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-150">
              <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-zinc-800 tracking-tight leading-none">AI Tutor</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setPersonaModalOpen(!personaModalOpen)}
              className={`text-[11px] ${personaModalOpen ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 dark:border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900/40' : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-900/50 dark:hover:to-orange-900/50'} text-amber-700 dark:text-amber-300 border-2 border-amber-200 dark:border-amber-700/60 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-black shadow-sm active:scale-95`}
              title="Change Tutor Mood/Persona"
            >
              <span className="flex items-center gap-1.5">
                {!isVip && <Lock className="w-2.5 h-2.5 text-amber-400" />}
                {PERSONAS[activePersona].avatarImg ? (
                  <img src={PERSONAS[activePersona].avatarImg} alt={PERSONAS[activePersona].name} loading="eager" decoding="async" className="w-4 h-4 rounded-full object-cover inline-block" />
                ) : (
                  <span>{PERSONAS[activePersona].emoji}</span>
                )}
                {activePersona === 'owl' ? 'AI Tutor' : PERSONAS[activePersona].name.split(' ')[0]}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${personaModalOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {personaModalOpen && (
                <>
                  {/* High-performance backdrop without expensive real-time blur shaders */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[1100] bg-black/60 transform-gpu"
                    onClick={() => setPersonaModalOpen(false)}
                  />

                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed sm:absolute right-4 sm:right-0 top-20 sm:top-full mt-2 w-[calc(100vw-2rem)] sm:w-85 bg-white dark:bg-zinc-900 border-2 border-amber-200 dark:border-amber-500/40 rounded-[2.5rem] shadow-2xl shadow-black/25 p-4 z-[1200] overflow-visible transform-gpu will-change-transform"
                  >
                    {/* Arrow tip for the dropdown - hidden on mobile */}
                    <div className="hidden sm:block absolute -top-2.5 right-8 w-5 h-5 bg-white dark:bg-zinc-900 border-t-2 border-l-2 border-amber-200 dark:border-amber-500/40 rotate-45 z-[-1]" />

                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 mb-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          Tutor Academy Moods
                        </span>
                        <p className="text-[9px] text-zinc-400 dark:text-zinc-300 font-bold uppercase tracking-tighter">Choose your learning vibe</p>
                      </div>
                      <button
                        onClick={() => setPersonaModalOpen(false)}
                        className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-200 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[60vh] sm:max-h-[450px] overflow-y-auto momentum-scroll pr-1 custom-scrollbar">
                      {(Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>).map((personaId) => {
                        const p = PERSONAS[personaId];
                        const isActive = activePersona === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isVip && p.id !== 'owl') {
                                window.dispatchEvent(new CustomEvent('open-vip-modal'));
                                return;
                              }
                              setActivePersona(p.id as any);
                              setPersonaModalOpen(false);
                              triggerVibration(25);
                            }}
                            className={`w-full text-left p-3.5 sm:p-4 rounded-[1.5rem] transition-colors duration-150 flex items-center gap-4 border-2 relative group overflow-hidden ${isActive
                                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 dark:border-amber-500 text-amber-950 dark:text-amber-100 shadow-sm ring-2 ring-amber-200 dark:ring-amber-900/30'
                                : 'bg-white dark:bg-zinc-850/80 border-zinc-100 dark:border-zinc-800 hover:border-amber-200 dark:hover:border-amber-500/40 hover:bg-amber-50/20 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                              }`}
                          >
                            {/* Visual highlight for VIP locking */}
                            {!isVip && p.id !== 'owl' && (
                              <div className="absolute top-2 right-2">
                                <Lock className="w-3 h-3 text-zinc-300 dark:text-zinc-400" />
                              </div>
                            )}

                            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${p.color} flex items-center justify-center text-3xl shrink-0 shadow-md border-2 border-white dark:border-zinc-700 overflow-hidden`}>
                              {p.avatarImg ? (
                                <img src={p.avatarImg} alt={p.name} loading="eager" decoding="async" className="w-full h-full object-cover bg-white" />
                              ) : (
                                p.emoji
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-black leading-tight mb-1 flex items-center justify-between gap-2">
                                <span className={`truncate font-black ${isActive ? 'text-amber-950 dark:text-amber-100' : 'text-zinc-900 dark:text-white'}`}>
                                  {p.name}
                                </span>
                                {isActive ? (
                                  <div className="shrink-0 flex items-center gap-1 text-[9px] bg-amber-600 text-white px-2.5 py-0.5 rounded-full uppercase tracking-tighter font-black">
                                    <Check className="w-2.5 h-2.5" />
                                    Active
                                  </div>
                                ) : (!isVip && p.id !== 'owl' && (
                                  <span className="shrink-0 text-[8px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full uppercase font-black">Pro</span>
                                ))}
                              </div>
                              <div className={`text-[11px] font-medium leading-snug line-clamp-2 italic ${isActive ? 'text-amber-900/80 dark:text-amber-200/90' : 'text-zinc-600 dark:text-zinc-300'}`}>
                                {p.description}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 px-2 pb-1">
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-300 font-bold text-center italic leading-tight">
                        Switching moods changes the AI's personality &amp; teaching style.
                      </p>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {messages.length > 0 && (
            <button
              onClick={startNewSession}
              className="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 p-2 rounded-full transition-all flex items-center justify-center shadow-sm"
              title="New Session"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* History Drawer Overlay (Slides in from Left) */}
      <AnimatePresence>
        {historyOpen && (
          <div className="absolute inset-0 z-50 flex justify-start bg-black/75 transform-gpu">
            {/* Backdrop click to close */}
            <div className="absolute inset-0 bg-transparent" onClick={() => setHistoryOpen(false)} />

            {/* Drawer container from Left */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
              className="relative w-full max-w-xs sm:max-w-sm h-full bg-[#FAF9F6] border-r border-zinc-200 flex flex-col shadow-2xl z-10 transform-gpu will-change-transform"
            >
              {/* Drawer Header */}
              <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-[#FAF9F6]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center border border-purple-150">
                    <History className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="font-bold text-sm text-zinc-800">Tutor Chat History</h3>
                </div>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-1 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto momentum-scroll p-4 space-y-3">
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center h-48 space-y-2">
                    <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                    <span className="text-xs text-zinc-500">Loading history...</span>
                  </div>
                ) : (!Array.isArray(savedChats) || savedChats.length === 0) ? (
                  <div className="text-center py-12 flex flex-col items-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 border border-zinc-200">
                      <BookOpen className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-800 font-bold">No saved sessions yet</p>
                      <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px] mx-auto">
                        Your study chats with the AI Tutor will appear here automatically.
                      </p>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const getChatTime = (chat: SavedChat) => {
                      const ts = chat.updatedAt || chat.createdAt;
                      if (!ts) return Date.now();
                      if (typeof ts.seconds === 'number') {
                        return ts.seconds * 1000 + (ts.nanoseconds ? ts.nanoseconds / 1000000 : 0);
                      }
                      const dateParsed = new Date(ts).getTime();
                      return isNaN(dateParsed) ? Date.now() : dateParsed;
                    };

                    const sortedChats = [...(Array.isArray(savedChats) ? savedChats : [])].sort((a, b) => getChatTime(b) - getChatTime(a));

                    return (
                      <div className="space-y-2">
                        {sortedChats.map((chat) => (
                          <div
                            key={chat.id}
                            onClick={() => handleLoadChat(chat)}
                            className={`group relative p-3 rounded-xl bg-[#FAF9F6] border transition-all duration-200 cursor-pointer flex flex-col gap-1.5 ${tutorChatId === chat.id
                                ? 'border-purple-500/40 shadow-md shadow-purple-500/5 bg-purple-500/5'
                                : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50'
                              }`}
                          >
                            <div className="flex items-start justify-between gap-3 pr-8">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-zinc-800 leading-snug group-hover:text-purple-600 transition-colors line-clamp-2">
                                  {chat.title}
                                </h4>
                                <span className="text-[9px] text-zinc-500 mt-1 block font-medium">
                                  {chat.createdAt?.seconds
                                    ? new Date(chat.createdAt.seconds * 1000).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                    : 'Just now'}
                                </span>
                              </div>
                            </div>

                            {/* Delete Button */}
                            <button
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-transparent hover:bg-rose-50 text-zinc-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all active:scale-90"
                              title="Delete Session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main chat area or Welcome suggestions screen - fully responsive */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto momentum-scroll p-4 space-y-6 min-h-0 touch-pan-y"
        style={{ paddingBottom: '20px', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        <AnimatePresence mode="wait">
          {messages.length === 0 ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col min-h-full justify-center max-w-xl mx-auto pt-4 pb-8 px-2"
            >
              {/* Typewriter Hero Heading */}
              <AITutorTypewriterHeading />
            </motion.div>
          ) : (
            <div className="space-y-6" key="chat-history">
              {messages.map((msg, idx) => (
                <AITutorMessageItem
                  key={idx}
                  msg={msg}
                  idx={idx}
                  isHolding={isHolding}
                  activePersona={activePersona}
                  onTypingComplete={() => {
                    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, isTyping: false, displayedText: msg.text } : m));
                  }}
                  onToggleLike={() => {
                    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, isLiked: !m.isLiked, isDisliked: false } : m));
                  }}
                  onToggleDislike={() => {
                    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, isDisliked: !m.isDisliked, isLiked: false } : m));
                  }}
                  onSuggestionClick={handleSendMessage}
                  onAskDoubt={(stepId, title, content) => {
                    setContextualDoubt({ stepId, title, content });
                    setChatInput(`I have a doubt regarding Step ${stepId} ("${title}"): `);
                    setTimeout(() => {
                      inputRef.current?.focus();
                    }, 50);
                  }}
                />
              ))}

              {messages.length > 0 && messages[messages.length - 1].role === 'model' && !messages[messages.length - 1].isTyping && !loading && (() => {
                const lastMsg = messages[messages.length - 1];
                const isErrorState = lastMsg && (lastMsg.isError || lastMsg.text.includes("hiccup") || lastMsg.text.includes("network"));
                return (
                  <div className="flex flex-col gap-2 pt-2 justify-start pl-2">
                    {isErrorState ? (
                      <div className="flex flex-col items-start gap-1.5">
                        <button
                          onClick={handleRetryMessage}
                          className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-500/30 px-4 py-2 rounded-full transition-all flex items-center gap-1.5 font-bold shadow-md shadow-purple-500/20 active:scale-95"
                        >
                          Try Again
                        </button>
                        {failedAttachment && (
                          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/60 rounded-xl px-3 py-1.5 flex items-center gap-1.5 animate-pulse">
                            <span>📎</span> <strong>Preserved Image:</strong> {failedAttachment.name} (Ready to retry)
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <></>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Premium Brain Thinking Wave Animation with Sequential Dot Blink */}
              {loading && (!messages.length || messages[messages.length - 1]?.role !== 'model' || !messages[messages.length - 1]?.text) && (
                <div className="flex justify-start">
                  <div className="bg-zinc-900 border border-white/5 rounded-3xl p-5 rounded-tl-none flex items-center space-x-3.5 shadow-xl max-w-[85%] relative overflow-hidden">
                    {/* Glowing background ripple */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/5 to-indigo-600/5 animate-pulse pointer-events-none" />

                    {/* Brain Animation Stage */}
                    <div className="relative flex items-center justify-center">
                      {/* Wavy pulsing circles */}
                      <div className="absolute w-10 h-10 bg-purple-500/20 rounded-full animate-[ping_1.5s_infinite]" />
                      <div className="absolute w-8 h-8 bg-indigo-500/30 rounded-full animate-[ping_2s_infinite]" />
                      <div className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center border border-purple-400 shadow-lg relative">
                        <Brain className="w-4 h-4 text-white animate-pulse" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-100 font-bold tracking-wide">AI is thinking</span>
                      {/* Unique 3D Vertical Rotating 3-Dot Orbit */}
                      <span className="relative w-4 h-5 inline-flex items-center justify-center shrink-0 ml-0.5" title="AI is thinking...">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="absolute w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-400 to-indigo-300 shadow-[0_0_8px_rgba(192,132,252,0.85)] pointer-events-none"
                            animate={{
                              y: [-6, 0, 6, 0, -6],
                              x: [0, 4, 0, -4, 0],
                              rotateX: [0, 180, 360, 180, 0],
                              scale: [0.75, 1.25, 0.85, 0.65, 0.75],
                              opacity: [0.5, 1, 0.65, 0.35, 0.5],
                              zIndex: [1, 10, 5, 0, 1]
                            }}
                            transition={{
                              duration: 1.4,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay: i * 0.46,
                            }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Target scroll anchor */}
              <div id="ai-chat-scroll-anchor" ref={messagesEndRef} className="h-2" />

              {rateLimitInfo && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 rounded-[2rem] bg-amber-50 border-2 border-amber-200 shadow-xl max-w-md mx-auto text-center space-y-4 relative"
                >
                  <button
                    onClick={() => {
                      setRateLimitInfo(null);
                      setRetryCountdown(0);
                    }}
                    className="absolute top-4 right-4 text-amber-500 hover:text-amber-800 p-1.5 rounded-full hover:bg-amber-100/80 transition-colors"
                    title="Dismiss notification"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                    <Sparkles className="w-6 h-6 text-amber-600 animate-pulse" />
                  </div>
                  <div className="text-sm font-bold text-amber-900 whitespace-pre-wrap leading-relaxed pr-6">
                    {rateLimitInfo.message}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        handleSendMessage(lastRequestArgs?.text, lastRequestArgs?.file, lastRequestArgs?.type);
                        setRateLimitInfo(null);
                        setRetryCountdown(0);
                      }}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-black text-sm shadow-lg shadow-amber-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                      Retry Now
                    </button>
                    {retryCountdown > 0 && (
                      <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                        Cooldown active: {retryCountdown}s remaining
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>


      {/* Hidden file inputs for Option Menu */}
      <input type="file" ref={galleryInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
      <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
      <input type="file" ref={docInputRef} accept=".txt,.md,.csv" onChange={handleDocUpload} className="hidden" />

      {/* Input section inline positioned above bottom nav with Keyboard Avoidance */}
      <div
        className="w-full pb-[60px] pt-3 px-4 bg-white border-t border-zinc-200/80 z-20 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] relative"
      >
        <AnimatePresence>
          {showPlusMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-20 left-4 right-4 bg-[#FAF9F6] border border-zinc-200 p-2 rounded-2xl shadow-xl z-20"
            >
              <button
                onClick={async () => {
                  setShowPlusMenu(false);
                  if (Capacitor.isNativePlatform()) {
                    const picked = await pickNativeFiles({ types: 'image', multiple: false });
                    if (picked && picked.length > 0) {
                      handleNativeImagePicked(picked[0]);
                    }
                  } else {
                    galleryInputRef.current?.click();
                  }
                }}
                className="w-full text-left p-2 hover:bg-zinc-50 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2.5 transition-colors mb-1"
              >
                <Image className="w-4 h-4 text-sky-600" />
                <span>Gallery</span>
              </button>
              {/* ── CAMERA BUTTON ───────────────────────── */}
              <button
                id="ai-tutor-camera-btn"
                onClick={async () => {
                  setShowPlusMenu(false);
                  triggerVibration(10);
                  setIsCameraLoading(true);

                  if (!Capacitor.isNativePlatform()) {
                    // Web fallback — use hidden file input
                    cameraInputRef.current?.click();
                    setIsCameraLoading(false);
                    return;
                  }

                  // Native Android/iOS path
                  try {
                    const picked = await takeNativePhoto();
                    if (picked) {
                      handleNativeImagePicked(picked);
                      showToast('✅ Photo captured! Sending to AI...', 'success', 2000);
                    }
                    // If null → user cancelled, do nothing (silently)
                  } catch (err: any) {
                    const code = (err as any)?.code;
                    const msg = String(err?.message || '').toLowerCase();
                    if (code === 'denied') {
                      showToast(
                        '📷 Camera Blocked: Go to Phone Settings → Apps → AP Exam → Permissions → Camera → Allow',
                        'warning',
                        7000
                      );
                    } else if (msg.includes('disk') || msg.includes('file') || msg.includes('storage') || msg.includes('create')) {
                      // "unable to create photo on disk" — storage issue on Android
                      showToast(
                        '📂 Storage Error. Please clear AP Exam app cache: Settings → Apps → AP Exam → Storage → Clear Cache, then retry.',
                        'warning',
                        8000
                      );
                      console.warn('[AITutor] Camera disk error:', err);
                    } else {
                      const realMsg = String(err?.message || err?.toString?.() || 'Unknown error');
                      showToast(
                        `❌ Camera Error: ${realMsg}`,
                        'error',
                        8000
                      );
                      console.warn('[AITutor] Camera error:', err);
                    }
                  } finally {
                    setIsCameraLoading(false);
                  }
                }}
                disabled={isCameraLoading}
                className={`w-full text-left p-2 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-colors mb-1 cursor-pointer ${isCameraLoading
                    ? 'bg-emerald-100 text-emerald-700 opacity-60'
                    : 'hover:bg-zinc-50 text-zinc-700'
                  }`}
              >
                {isCameraLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                    <span>Opening Camera...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span>Camera</span>
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  setShowPlusMenu(false);
                  if (Capacitor.isNativePlatform()) {
                    const picked = await pickNativeFiles({ types: 'document', multiple: false });
                    if (picked && picked.length > 0) {
                      handleNativeDocPicked(picked[0]);
                    }
                  } else {
                    docInputRef.current?.click();
                  }
                }}
                className="w-full text-left p-2 hover:bg-zinc-50 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2.5 transition-colors"
              >
                <FileText className="w-4 h-4 text-purple-600" />
                <span>Upload Document</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachment Card View */}
        <AnimatePresence>
          {attachedFile && (() => {
            const previewUrl = (attachedFilePreview && (attachedFilePreview.startsWith('data:') || attachedFilePreview.startsWith('blob:') || attachedFilePreview.startsWith('http')))
              ? attachedFilePreview
              : attachedFile
                ? URL.createObjectURL(attachedFile)
                : '';
            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex items-center gap-3 bg-[#FAF9F6] border border-zinc-200 p-2.5 rounded-2xl mb-3 shrink-0 relative shadow-sm"
              >
                {attachedFileType === 'image' ? (
                  <img
                    src={previewUrl}
                    onClick={() => setFullscreenPreviewUrl(previewUrl)}
                    className="w-10 h-10 rounded-xl object-cover border border-zinc-250 cursor-pointer hover:opacity-85 transition-opacity"
                    alt="Thumbnail"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                )}
                <div
                  className={`flex-1 min-w-0 ${attachedFileType === 'image' ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  onClick={() => {
                    if (attachedFileType === 'image') {
                      setFullscreenPreviewUrl(previewUrl);
                    }
                  }}
                >
                  <div className="text-xs font-bold text-zinc-850 truncate leading-tight">
                    {attachedFileType === 'image' ? 'Attached Photo (Tap to Preview)' : attachedFile.name}
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-0.5 uppercase tracking-wider font-bold">
                    {(attachedFile.size / 1024).toFixed(1)} KB • {attachedFileType === 'image' ? 'IMAGE SCAN' : 'DOCUMENT'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAttachedFile(null);
                    setAttachedFilePreview(null);
                    setAttachedFileType(null);
                    setDocumentContent('');
                  }}
                  className="p-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Dynamic Main Input Bar - Highly Visible High-Contrast Design */}
        <div className="flex items-center gap-2 bg-zinc-50 rounded-2xl px-3 py-2 border-2 border-purple-200/90 focus-within:border-purple-600 focus-within:ring-4 focus-within:ring-purple-600/10 transition-all relative shadow-sm">

          {/* Plus toggle button */}
          <button
            onClick={() => setShowPlusMenu(!showPlusMenu)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 border ${showPlusMenu
                ? 'bg-purple-100 text-purple-700 border-purple-200 rotate-45'
                : 'bg-white hover:bg-zinc-100 text-zinc-500 border-zinc-200/60 shadow-sm'
              }`}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </button>

          <div className="flex-1 relative flex items-center">
            <textarea
              ref={inputRef}
              rows={1}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !isOffline) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isOffline}
              placeholder={isOffline ? "You are offline. Reconnect to ask." : "Type your message..."}
              className="w-full bg-transparent border-none focus:outline-none text-zinc-900 placeholder-zinc-400 font-medium py-1.5 text-sm pr-12 resize-none overflow-y-auto leading-relaxed whitespace-pre-wrap break-words disabled:cursor-not-allowed"
              style={{ height: 'auto', maxHeight: '144px' }}
            />
            <span className="absolute right-1.5 bottom-1.5 text-[9px] font-black tracking-wider text-zinc-400">
              {wordCount} words
            </span>
          </div>

          {loading ? (
            <button
              onClick={handleStopGeneration}
              className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white hover:bg-red-500 transition-colors shrink-0 shadow-md"
              title="Stop Generation"
            >
              <Square className="w-4 h-4" fill="currentColor" />
            </button>
          ) : isAnyMessageTyping ? (
            <button
              onClick={() => setIsHolding(!isHolding)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 shadow-sm ${isHolding
                  ? 'bg-yellow-500 text-zinc-950 hover:bg-yellow-400 animate-pulse'
                  : 'bg-white border border-yellow-300 text-yellow-600 hover:bg-yellow-50/50'
                }`}
              title={isHolding ? "Resume AI Response" : "Hold AI Response"}
            >
              {isHolding ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
            </button>
          ) : (
            <button
              onClick={() => handleSendMessage()}
              disabled={(!chatInput.trim() && !attachedFile) || loading || isOffline}
              className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white disabled:opacity-40 hover:bg-purple-500 transition-colors shrink-0 shadow-md"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          )}
        </div>

        {/* AI Safety Disclaimer */}
        <div className="text-center pt-1.5 pb-0.5 px-3">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium select-none tracking-tight">
            HelpYou AI can make mistakes. Please double check important information.
          </p>
        </div>
      </div>

      {/* Full-Screen Image Preview Modal */}
      <AnimatePresence>
        {fullscreenPreviewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/95 transform-gpu flex items-center justify-center p-4"
            onClick={() => setFullscreenPreviewUrl(null)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFullscreenPreviewUrl(null);
              }}
              className="absolute top-6 right-6 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all shadow-md cursor-pointer border border-white/10"
              title="Close Preview"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative max-w-full max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl border border-white/5"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={fullscreenPreviewUrl}
                className="max-w-full max-h-[85vh] object-contain select-none"
                alt="Fullscreen Preview"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
