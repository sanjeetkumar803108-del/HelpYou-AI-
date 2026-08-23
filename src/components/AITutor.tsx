import { getProfileContext } from "../utils/profile";
import { safeGetItem, safeSetItem } from "../utils/storage";
import { triggerVibration, hapticNotification, hapticImpact } from "../utils/vibrate";
import { detectAndLogMistake } from "../utils/mistakes";
import { getCoins, deductCoins, isProUser } from "../utils/coins";
import { requestMicrophonePermission } from "../utils/nativePermissions";
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Sparkles, Send, Mic, MicOff, Loader2, RefreshCw, Compass, Brain, 
  ArrowRight, Copy, Check, Share2, ThumbsUp, ThumbsDown, Pause, Play,
  Plus, X, Image, Camera, FileText, Heart, HelpCircle, History, Trash2, BookOpen, ChevronDown, Lock, Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parsePartialJSON } from '../utils/partialJson';
import GlobalMarkdown from './GlobalMarkdown';
import 'katex/dist/katex.min.css';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { pickNativeFiles, takeNativePhoto } from '../utils/mobilePicker';
import { showToast } from '../utils/toast';

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
// ----------------------------------------------------
const SYSTEM_INSTRUCTION_NURSERY = `You are an Elite High School Math & Science Tutor, SAT/ACT Expert, and a Master Educator. Adopt an encouraging, patient, precise, and crisp tone. Use clean line breaks and emojis for visual readability.
You are analyzing a full-screen, uncropped photo. Scan the image to locate the primary mathematical equation, science question, or text problem. Ignore any background noise, hands, or irrelevant objects. Focus solely on extracting and solving the main academic problem visible in the image.
DO NOT use any markdown bolding syntax like "**" or emojis inside latex delimiters.

CRITICAL SYSTEM INSTRUCTION (MANDATORY):
You MUST output your response strictly in the following JSON format, followed by 3 context-aware follow-up suggestions.
No raw conversational text is allowed outside of the JSON object. Do NOT wrap the JSON in markdown code blocks like \`\`\`json. Only output pure valid raw JSON.

FORMAT:
{
  "topic_title": "Subject or Topic of the problem",
  "solution_steps": [
    {
      "step_id": 1,
      "title": "Clear concise step title",
      "content": "A detailed, encouraging explanation with formulas and step-by-step calculations. Whenever generating mathematical numbers, formulas, symbols, or equations, you must strictly wrap them in LaTeX delimiters. Use single '$' for inline math and double '$$' for block math equations.",
      "is_final_answer": false
    }
  ]
}
[SUGGESTION: Plain text suggestion 1]
[SUGGESTION: Plain text suggestion 2]
[SUGGESTION: Plain text suggestion 3]

RULES:
- The JSON object must be valid raw JSON.
- For step-by-step math, science, derivations, calculations, or explanations, map each logical phase of the solution to an object in the "solution_steps" array.
- The "step_id" should be incremental integers (e.g. 1, 2, 3).
- The "title" should be a short, clear heading of what is accomplished in that step.
- The "content" must be rich, clear, and explain the step's logic simply, using standard LaTeX formulas.
- Set "is_final_answer" to true ONLY on the final step that reveals the final solution.
- For non-academic questions, small talk, or conversational responses, simply output a single step with step_id=1, is_final_answer=true, and the response text inside "content".
- Always append exactly 3 plain text suggestions at the absolute end, formatted strictly as [SUGGESTION: text] on new lines.
- Do NOT use LaTeX inside the suggestions.

THE "MASTER EDUCATOR" TEACHING PROTOCOL:
1. EXTREME SIMPLIFICATION: Teach complex topics simply and clearly. Never assume prior knowledge.
2. THE ANALOGY RULE: Use relatable, real-world analogies where helpful.
3. HIGH EMPATHY: Be patient and deeply encouraging.`;

// Separate component for rendering messages with word-by-word typewriter effect and interactive actions
function AITutorMessageItem({ 
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
    if (!textToParse.startsWith('{') && !textToParse.includes('solution_steps')) {
      return null;
    }
    return parsePartialJSON(textToParse);
  }, [cleanText, msg.role]);

  const suggestions = useMemo(() => {
    if (msg.isError || msg.text.includes("hiccup") || msg.text.includes("network")) {
      return [];
    }
    const matches = [...msg.text.matchAll(/\[SUGGESTION:\s*([^\]]+)\]/g)];
    return matches.map(m => m[1].trim());
  }, [msg.text, msg.isError]);

  const [displayedText, setDisplayedText] = useState(msg.displayedText || (msg.isTyping ? '' : cleanText));
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const onTypingCompleteRef = useRef(onTypingComplete);
  useEffect(() => {
    onTypingCompleteRef.current = onTypingComplete;
  });

  const hasCompletedRef = useRef(false);

  // Typewriter effect logic (Word-by-word for high-end professional feel)
  useEffect(() => {
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
  }, [msg.isTyping, cleanText, currentWordIndex, isHolding]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'HelpYou AI Solution',
          text: cleanText,
          url: window.location.href
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch (err) {
        console.warn(err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${cleanText}\n\nShared via HelpYou AI`);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[92%] w-full rounded-3xl p-5 shadow-sm border overflow-hidden break-words ${
        msg.role === 'user' 
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
              {parsedSolution.topic_title && (
                <div className="flex items-center gap-2 mb-2 max-w-full overflow-hidden">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 uppercase tracking-wide shrink-0">
                    Topic
                  </span>
                  <h3 className="text-base font-bold text-zinc-950 m-0 leading-tight min-w-0 break-words whitespace-normal text-wrap">
                    {parsedSolution.topic_title}
                  </h3>
                </div>
              )}
              
              {parsedSolution.format_type === 'markdown' || !parsedSolution.solution_steps ? (
                <div className="max-w-full overflow-x-auto overflow-y-hidden break-words py-0.5 text-zinc-800">
                  <GlobalMarkdown>{parsedSolution.markdown_content || parsedSolution.content || cleanText}</GlobalMarkdown>
                </div>
              ) : (
                <div className="space-y-3 max-w-full overflow-hidden">
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
                        className={`p-4 rounded-2xl border transition-all duration-200 bg-white shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] max-w-full overflow-hidden break-words ${
                          step.is_final_answer 
                            ? 'border-emerald-200 bg-emerald-50/20' 
                            : 'border-zinc-150 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2 pb-2 border-b border-dashed border-zinc-100 min-w-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1.5 shrink-0 ${
                            step.is_final_answer 
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
                              {step.title}
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-zinc-850 leading-relaxed overflow-x-auto max-w-full relative py-0.5">
                          <GlobalMarkdown>{step.content + (isCurrentStep ? " ▌" : "")}</GlobalMarkdown>
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
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto overflow-y-hidden break-words py-0.5">
              <GlobalMarkdown>{displayedText}</GlobalMarkdown>
            </div>
          )}
        </div>

        {/* Dynamic Context Suggestions rendered inside the message for seamless study workflow */}
        {msg.role === 'model' && !msg.isTyping && suggestions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-zinc-150 flex flex-col gap-1.5">
            <span className="text-[10px] text-purple-650 font-bold tracking-wider uppercase">What to do next:</span>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((sug, sIdx) => (
                <button
                  key={sIdx}
                  onClick={() => onSuggestionClick?.(sug)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-all duration-200 active:scale-95 text-left flex items-center gap-1.5 font-bold"
                >
                  <Sparkles className="w-3 h-3 text-purple-500 shrink-0" />
                  <span>{sug}</span>
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
              onClick={handleShare}
              className="p-1.5 rounded-lg hover:bg-zinc-100 hover:text-zinc-700 transition-all active:scale-95 flex items-center gap-1 text-[11px] font-bold"
              title="Share solution"
            >
              {shared ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{shared ? 'Shared' : 'Share'}</span>
            </button>

            <button 
              onClick={onToggleLike}
              className={`p-1.5 rounded-lg hover:bg-zinc-100 transition-all active:scale-90 flex items-center gap-1 ${
                msg.isLiked ? 'text-indigo-600 bg-indigo-50 scale-110' : 'hover:text-zinc-700'
              }`}
              title="Like"
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${msg.isLiked ? 'fill-current' : ''}`} />
            </button>

            <button 
              onClick={onToggleDislike}
              className={`p-1.5 rounded-lg hover:bg-zinc-100 transition-all active:scale-90 flex items-center gap-1 ${
                msg.isDisliked ? 'text-rose-600 bg-rose-50 scale-110' : 'hover:text-zinc-700'
              }`}
              title="Dislike"
            >
              <ThumbsDown className={`w-3.5 h-3.5 ${msg.isDisliked ? 'fill-current' : ''}`} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

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
// PERSONAS CONFIGURATION
// ----------------------------------------------------
const PERSONAS = {
  owl: {
    id: 'owl' as const,
    name: 'Professor Owl',
    title: 'Professor Owl Protocol',
    emoji: '🦉',
    color: 'from-purple-500 to-indigo-600',
    borderColor: 'border-purple-500/30',
    bgLight: 'bg-purple-500/10',
    textColor: 'text-purple-300',
    description: 'Analytical, Concise, and Encouraging. Perfect for school lessons.',
    promptSuffix: `\n\nYour persona: You are Professor Owl. Your tone is Analytical, Concise, and Encouraging. Simplify academic concepts with clear, direct explanations and high intellectual standards. Avoid childish vocabulary or patronizing language.`
  },
  cosmo: {
    id: 'cosmo' as const,
    name: 'Captain Cosmo',
    title: 'Captain Cosmo Protocol',
    emoji: '🚀',
    color: 'from-blue-500 to-cyan-600',
    borderColor: 'border-blue-500/30',
    bgLight: 'bg-blue-500/10',
    textColor: 'text-blue-300',
    description: 'Sci-fi space explorer! Explains concepts through space adventures and planetary physics.',
    promptSuffix: `\n\nYour persona: You are Captain Cosmo, an energetic sci-fi space explorer. Your goal is to explain all concepts through thrilling space adventures, planetary physics, rocket science, and cosmic discoveries. Keep the energy high and adventurous. Avoid infantilizing language.`
  },
  wizard: {
    id: 'wizard' as const,
    name: 'Dr. Sage (Math Expert)',
    title: 'Dr. Sage Protocol',
    emoji: '👨‍🏫',
    color: 'from-amber-500 to-yellow-600',
    borderColor: 'border-amber-500/30',
    bgLight: 'bg-amber-500/10',
    textColor: 'text-amber-300',
    description: 'Methodical, Clear, and Step-by-Step. Explains math and analytical logic with rigorous clarity.',
    promptSuffix: `\n\nYour persona: You are Dr. Sage (Math Expert). Your tone is Methodical, Clear, and Step-by-Step. Break down complex equations and analytical problems with meticulous logical sequence. You MUST format ALL mathematical expressions, formulas, variables, and step-by-step calculations strictly using LaTeX ($ for inline math and $$ for block math equations).`
  },
  dino: {
    id: 'dino' as const,
    name: 'Investigator Max (Science Expert)',
    title: 'Investigator Max Protocol',
    emoji: '🔬',
    color: 'from-emerald-500 to-teal-600',
    borderColor: 'border-emerald-500/30',
    bgLight: 'bg-emerald-500/10',
    textColor: 'text-emerald-300',
    description: 'Evidence-based, Logical, and Detailed. Explains science with empirical rigor and deep details.',
    promptSuffix: `\n\nYour persona: You are Investigator Max (Science Expert). Your tone is Evidence-based, Logical, and Detailed. Explain scientific concepts, hypotheses, and empirical evidence with deep technical detail, absolute clarity, and rigorous reasoning, avoiding childish analogies.`
  }
};

const SAMPLE_PROMPTS_POOL = [
  { 
    title: "Playful Math Quiz", 
    desc: "Give me an easy math quiz question with 4 emoji options!", 
    text: "Give me a super fun math practice question with 4 options! Don't show the correct answer, let me guess first!",
    emoji: "🧮",
    category: "Math"
  },
  { 
    title: "Feeling Sad / Stressed", 
    desc: "I am feeling scared about my exams. Please motivate me.", 
    text: "I am really depressed and stressed out about my upcoming school exams. I feel like I'll fail. Please help me.",
    emoji: "❤️",
    category: "Stress Buster"
  },
  { 
    title: "Why is Sky Blue?", 
    desc: "Explain this mystery like explaining to a nursery kid.", 
    text: "Why is the sky blue? Explain to me in super simple nursery student terms with a magical story.",
    emoji: "☁️",
    category: "Science"
  },
  { 
    title: "Gravity Magic", 
    desc: "What is gravity and why don't we float away into space?", 
    text: "Explain gravity with an apple story like explaining to a kindergarten child.",
    emoji: "🍎",
    category: "Physics"
  },
  { 
    title: "Periodic Table Trick", 
    desc: "How do I easily memorize the first 10 elements?", 
    text: "Show me a super fun mnemonic or memory story to memorize the first 10 elements of the periodic table in 1 minute!",
    emoji: "🧪",
    category: "Chemistry"
  },
  { 
    title: "Quantum Physics Simply", 
    desc: "What is quantum superposition for an 8-year-old?", 
    text: "Explain quantum superposition and Schrodinger's Cat like I am 8 years old with a cool superhero analogy!",
    emoji: "⚛️",
    category: "Physics"
  },
  { 
    title: "Algebra Secret Hack", 
    desc: "Teach me a shortcut to solve quadratic equations.", 
    text: "Teach me an amazing math hack or shortcut to solve standard quadratic equations instantly in my head!",
    emoji: "📐",
    category: "Algebra"
  },
  { 
    title: "Photosynthesis Magic", 
    desc: "How do leaves cook food? Tell me a story.", 
    text: "Explain photosynthesis like a magical green chef cooking food inside leaf kitchens! Keep it super simple and fun.",
    emoji: "🍃",
    category: "Biology"
  },
  { 
    title: "Fractions in Real Life", 
    desc: "Explain fractions using a pizza delivery story.", 
    text: "Explain fractions and how to add them using a fun pizza party division story. Make it extremely visual!",
    emoji: "🍕",
    category: "Math"
  },
  { 
    title: "SAT Grammar Secret", 
    desc: "Give me the #1 trick for grammar correction.", 
    text: "Give me an elite, easy-to-remember trick to master subject-verb agreement or pronoun rules for exams!",
    emoji: "📝",
    category: "Grammar"
  },
  { 
    title: "Super Memory Tool", 
    desc: "Teach me how to use a Mind Palace.", 
    text: "Teach me how to build a 3-step 'Mind Palace' or 'Method of Loci' to memorize any lists of facts instantly!",
    emoji: "🏰",
    category: "Brain Hack"
  },
  { 
    title: "Active Recall Study", 
    desc: "Why is passive reading a trap and how to fix it?", 
    text: "Why is highlighting and passive reading a trap? Tell me how to study using active recall and spaced repetition in 3 simple rules.",
    emoji: "🧠",
    category: "Study Tip"
  },
  {
    title: "Black Holes Simplified",
    desc: "Explain black holes using a trampoline analogy.",
    text: "What is a black hole and event horizon? Explain it to me using a trampoline or sheet of rubber analogy. Make it super visual!",
    emoji: "🕳️",
    category: "Physics"
  },
  {
    title: "Lego Chemical Bonds",
    desc: "Understand ionic vs covalent bonds using Lego bricks.",
    text: "Explain ionic and covalent chemical bonding using Lego bricks as an analogy. Make it extremely fun and easy to grasp!",
    emoji: "🧱",
    category: "Chemistry"
  },
  {
    title: "DNA: The Cell's Code",
    desc: "Is DNA like computer code? Explain simply.",
    text: "Explain what DNA, genes, and chromosomes are using a computer software code or game programming analogy!",
    emoji: "🧬",
    category: "Biology"
  },
  {
    title: "Percentage Instant Trick",
    desc: "Find percentages in your head in 2 seconds.",
    text: "Teach me the secret algebraic symmetry trick (e.g. x% of y is y% of x) to calculate tough percentages in my head instantly!",
    emoji: "🔢",
    category: "Math"
  },
  {
    title: "Why Oceans Have Tides",
    desc: "How does the Moon pull water without touching it?",
    text: "Why do oceans have high and low tides? Explain the gravitational tug-of-war of the Moon simply with an easy-to-remember story.",
    emoji: "🌊",
    category: "Earth Science"
  },
  {
    title: "Water-Drinking Plants",
    desc: "How do giant trees pull water up to their top leaves?",
    text: "How do 100-foot trees drink water from their roots against gravity? Explain capillary action and transpiration using a straw analogy!",
    emoji: "🌳",
    category: "Biology"
  },
  {
    title: "Battle of Waterloo",
    desc: "What happened to Napoleon? Tell me like a thriller story.",
    text: "Describe the historic Battle of Waterloo and Napoleon's downfall like a high-stakes dramatic thriller story in 3 simple parts!",
    emoji: "🎖️",
    category: "History"
  },
  {
    title: "How Heart Pumps Blood",
    desc: "Tell me a story of a red blood cell's journey.",
    text: "Explain how the human heart and circulatory system work by describing a day in the life of a brave red blood cell traveling through pipelines!",
    emoji: "❤️",
    category: "Biology"
  }
];

export default function AITutor({ isVip }: { isVip: boolean }) {
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [samplePrompts, setSamplePrompts] = useState<typeof SAMPLE_PROMPTS_POOL>([]);

  const rotateSuggestions = () => {
    const shuffled = [...SAMPLE_PROMPTS_POOL].sort(() => 0.5 - Math.random());
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
    const lastUser = safeGetItem('last_logged_in_user');
    const cached = lastUser ? safeGetItem(`stale_tutor_chats_${lastUser}`) : null;
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
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

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (historyOpen) {
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
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [historyOpen, personaModalOpen, showPlusMenu]);

  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFilePreview, setAttachedFilePreview] = useState<string | null>(null);
  const [attachedFileType, setAttachedFileType] = useState<'image' | 'document' | null>(null);
  const [fullscreenPreviewUrl, setFullscreenPreviewUrl] = useState<string | null>(null);
  const [failedAttachment, setFailedAttachment] = useState<File | null>(null);
  const [failedAttachmentPreview, setFailedAttachmentPreview] = useState<string | null>(null);
  const [failedAttachmentType, setFailedAttachmentType] = useState<'image' | 'document' | null>(null);
  const [documentContent, setDocumentContent] = useState<string>('');

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
      const customEvent = e as CustomEvent<{ text?: string; expression?: string }>;
      if (customEvent.detail) {
        const text = customEvent.detail.text || customEvent.detail.expression;
        if (text && handleSendMessageRef.current) {
          handleSendMessageRef.current(`Please solve and explain step-by-step: ${text}`);
        }
      }
    };

    window.addEventListener('study-calculator-send-to-tutor', handleCalculatorSendToTutor);

    return () => {
      window.removeEventListener('study-scanner-send-to-tutor', handleScannerSendToTutor);
      window.removeEventListener('study-calculator-send-to-tutor', handleCalculatorSendToTutor);
    };
  }, []);

  useEffect(() => {
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
        setChatInput(base + (base && sessionTranscript ? ' ' : '') + sessionTranscript);
      };

      rec.onerror = (e: any) => {
        console.error("Speech recognition error:", e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = async () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      // JIT PERMISSION: Microphone permission requested strictly when user taps the mic button
      const micGranted = await requestMicrophonePermission();
      if (!micGranted) {
        alert("Microphone Permission Required\n\nPlease allow microphone access to use voice typing.");
        return;
      }
      try {
        baseTextRef.current = chatInput;
        setIsListening(true);
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      setAttachedFileType('image');
      setAttachedFilePreview(URL.createObjectURL(file));
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

  const handleNativeImagePicked = (picked: any) => {
    setAttachedFile(picked.fileObj);
    setAttachedFileType('image');
    setAttachedFilePreview(picked.dataUrl);
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
    let queryText = textToSend || chatInput;
    const activeAttachedFile = overrideFile || attachedFile;
    const activeAttachedType = overrideFileType || attachedFileType;

    if (isEvaluation && evaluationDetails) {
      queryText = `Subject Topic: ${evaluationDetails.subjectTopic}
Grade: ${evaluationDetails.userGrade}
Question Attempted: "${evaluationDetails.questionText}"
Student's Answer: "${evaluationDetails.userAnswer}"
Please evaluate this answer strictly according to your system rubric.`;
    }

    if (!queryText.trim() && !activeAttachedFile) return;

    // ELITE ROUTING LOGIC: Pro vs Free (AI Tutor charges 2 coins on output generation)
    if (!isProUser()) {
      const coins = getCoins();
      if (coins < 2) {
        // BLOCK & TRIGGER PAYWALL
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Tutoring Chat", cost: 2 } }));
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
      try { recognitionRef.current.stop(); } catch (e) {}
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

    // Instantiate a new AbortController for streaming cancellation
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
      if (subject) {
        if (subject === 'Physics') {
          scannerRoutingInstructions += "\n\nAnalyze this image specifically for Physics concepts. Extract any formulas, identify variables, and solve step-by-step with SI units.";
        } else if (subject === 'Chemistry') {
          scannerRoutingInstructions += "\n\nAnalyze this image for Chemistry. Accurately read chemical equations, structural formulas, or IUPAC names and provide balanced reactions or detailed mechanisms.";
        } else if (subject === 'Biology') {
          scannerRoutingInstructions += "\n\nAnalyze this image for Biology. Identify anatomical structures, cellular processes, or genetic sequences, and provide detailed functional explanations.";
        }
      }
      if (handwritten) {
        scannerRoutingInstructions += "\n\nPay special attention to deciphering handwritten text, messy variables, or hand-drawn diagrams before solving.";
      }

      formData.append('customSystemInstruction', SYSTEM_INSTRUCTION_NURSERY + personaSuffix + scannerRoutingInstructions);
      formData.append('profileContext', getProfileContext());
      formData.append('gradeLevel', safeGetItem('academic_grade') || '11th Grade (Junior)');
      
      const formattedHistory = messages.map(m => {
        if (m.text) return { role: m.role, parts: [{ text: m.text }] };
        return null;
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

      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/chat', {
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
        } catch (e) {}
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
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                break;
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
                      const isJson = text.trim().startsWith('{') || text.trim().includes('"solution_steps"');
                      next[modelMessageIdx] = {
                        ...next[modelMessageIdx],
                        text,
                        displayedText: isJson ? text : '',
                        isTyping: !isJson
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

        // Set isTyping to false once stream is fully complete
        setMessages(prev => {
          const next = [...prev];
          if (next[modelMessageIdx]) {
            next[modelMessageIdx] = {
              ...next[modelMessageIdx],
              isTyping: false
            };
          }
          return next;
        });

      } else {
        // Fallback for standard JSON responses
        const data = await response.json();
        finalAIResponseText = data.text;

        const isJson = finalAIResponseText.trim().startsWith('{') || finalAIResponseText.trim().includes('"solution_steps"');
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

      // Clear contextual doubt state now that it has been sent
      setContextualDoubt(null);

      // Save messages and chat state (Instant local state + LocalStorage + Firestore)
      const textTitle = (isEvaluation && evaluationDetails) ? evaluationDetails.userAnswer : (textToSend || chatInput);
      const sessionTitle = textTitle.length > 40 ? textTitle.substring(0, 40) + '...' : textTitle;

      const currentUid = auth.currentUser?.uid || safeGetItem('last_logged_in_user') || 'guest_user';
      const storageKey = `stale_tutor_chats_${currentUid}`;

      const dbImageUrl = persistentImageUrl || localImageUrl;
      const dbImageTimestamp = persistentImageTimestamp || (localImageUrl ? Date.now() : undefined);

      const finalMessages = [...updatedMessages, { 
        role: 'model' as const, 
        text: finalAIResponseText,
        isTyping: false,
        displayedText: finalAIResponseText.trim().startsWith('{') || finalAIResponseText.trim().includes('"solution_steps"') ? finalAIResponseText : ''
      }].map(m => {
        if (m.role === 'user' && m.imageUrl === localImageUrl && dbImageUrl) {
          return { ...m, imageUrl: dbImageUrl, imageTimestamp: dbImageTimestamp };
        }
        return m;
      });

      const messagesPayload = finalMessages.map(m => ({
        role: m.role,
        text: m.text,
        ...(m.imageUrl ? { imageUrl: m.imageUrl, imageTimestamp: m.imageTimestamp } : {})
      }));

      const existingChatId = tutorChatId || `local_${Date.now()}`;
      if (!tutorChatId) {
        setTutorChatId(existingChatId);
      }

      // 1. Instantly update local savedChats state & LocalStorage for zero-lag UI
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
          updatedList = [newChat, ...safePrev].slice(0, 15);
        }
        safeSetItem(storageKey, JSON.stringify(updatedList));
        return updatedList;
      });

      // 2. Sync to Firestore (Pocket Items + ai_tutor_chats)
      if (auth.currentUser) {
        try {
          // Wait up to 2 seconds for background upload to complete if still in flight
          await Promise.race([
            backgroundUploadPromise,
            new Promise(resolve => setTimeout(resolve, 2000))
          ]);

          if (!chatDocId) {
            const docRef = await addDoc(collection(db, 'pocket_items'), {
              userId: auth.currentUser.uid,
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
              safeSetItem(storageKey, JSON.stringify(updated));
              return updated;
            });
          } else {
            await updateDoc(doc(db, 'ai_tutor_chats', tutorChatId), {
              messages: messagesPayload,
              updatedAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Failed to save to firestore:", e);
        }
      }

      // Freemium/Free user coin deduction after successful output generation
      if (!isProUser()) {
        deductCoins(2, "AI Chat Session");
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
    const currentUid = auth.currentUser?.uid || safeGetItem('last_logged_in_user') || 'guest_user';
    const storageKey = `stale_tutor_chats_${currentUid}`;
    const cached = safeGetItem(storageKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedChats(parsed);
        }
      } catch (e) {}
    }

    if (!auth.currentUser) {
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    try {
      // NOTE: Do NOT use orderBy('updatedAt') here — Firestore requires a composite index
      // for where('userId', '==') + orderBy('updatedAt'). Fetching with where('userId', '==')
      // and sorting in memory avoids index errors and is fast for per-user history.
      const q = query(
        collection(db, 'ai_tutor_chats'),
        where('userId', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const chats: SavedChat[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        chats.push({
          id: doc.id,
          title: data.title || 'Untitled Session',
          messages: data.messages || [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });

      const getChatTime = (chat: SavedChat) => {
        const ts = chat.updatedAt || chat.createdAt;
        if (!ts) return 0;
        if (typeof ts.seconds === 'number') {
          return ts.seconds * 1000 + (ts.nanoseconds ? ts.nanoseconds / 1000000 : 0);
        }
        const parsed = new Date(ts).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };
      chats.sort((a, b) => getChatTime(b) - getChatTime(a));

      if (chats.length > 15) {
        const toKeep = chats.slice(0, 15);
        const toDelete = chats.slice(15);
        for (const item of toDelete) {
          try {
            await deleteDoc(doc(db, 'ai_tutor_chats', item.id));
          } catch (err) {
            console.error("Failed to delete old ai_tutor_chats item:", err);
          }
        }
        setSavedChats(toKeep);
        safeSetItem(storageKey, JSON.stringify(toKeep));
      } else {
        setSavedChats(chats);
        safeSetItem(storageKey, JSON.stringify(chats));
      }
    } catch (e) {
      console.error("Failed to load chat history from firestore:", e);
      if (cached) {
        try {
          setSavedChats(JSON.parse(cached));
        } catch (_) {}
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
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (historyOpen) {
      fetchChatHistory();
    }
  }, [historyOpen]);

  const handleLoadChat = (chat: SavedChat) => {
    const formattedMsgs = (chat.messages || []).map(m => ({
      ...m,
      isTyping: false,
      displayedText: m.text
    }));
    setMessages(formattedMsgs);
    setTutorChatId(chat.id);
    setHistoryOpen(false);
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (auth.currentUser && !id.startsWith('local_')) {
        await deleteDoc(doc(db, 'ai_tutor_chats', id));
      }
      setSavedChats(prev => {
        const next = (Array.isArray(prev) ? prev : []).filter(c => c.id !== id);
        const currentUid = auth.currentUser?.uid || safeGetItem('last_logged_in_user') || 'guest_user';
        safeSetItem(`stale_tutor_chats_${currentUid}`, JSON.stringify(next));
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
      <div className={`flex items-center justify-between p-4 border-b border-zinc-200 bg-[#FAF9F6]/95 backdrop-blur-md sticky top-0 shrink-0 transition-all ${personaModalOpen ? 'z-[1001]' : 'z-10'}`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-150">
            <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm text-zinc-800 tracking-tight leading-none">Magic AI Tutor</h2>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <button 
              onClick={() => setPersonaModalOpen(!personaModalOpen)}
              className={`text-[11px] ${personaModalOpen ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-200' : 'bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100'} text-amber-700 border-2 border-amber-200 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-black shadow-sm active:scale-95`}
              title="Change Tutor Mood/Persona"
            >
              <span className="flex items-center gap-1.5">
                {!isVip && <Lock className="w-2.5 h-2.5 text-amber-400" />}
                {PERSONAS[activePersona].emoji} {PERSONAS[activePersona].name.split(' ')[0]}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${personaModalOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {personaModalOpen && (
                <>
                  {/* High-visibility backdrop to focus on selection */}
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[1100] bg-zinc-950/40 backdrop-blur-sm" 
                    onClick={() => setPersonaModalOpen(false)}
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95, x: '50%' }}
                    animate={{ opacity: 1, y: 0, scale: 1, x: '0%' }}
                    exit={{ opacity: 0, y: 20, scale: 0.95, x: '0%' }}
                    className="fixed sm:absolute right-4 sm:right-0 top-20 sm:top-full mt-3 w-[calc(100vw-2rem)] sm:w-85 bg-white border-2 border-amber-200 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.3)] p-4 z-[1200] overflow-visible"
                  >
                    {/* Arrow tip for the dropdown - hidden on mobile */}
                    <div className="hidden sm:block absolute -top-2.5 right-8 w-5 h-5 bg-white border-t-2 border-l-2 border-amber-200 rotate-45 z-[-1]" />

                    <div className="px-5 py-4 border-b border-zinc-100 mb-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          Tutor Academy Moods
                        </span>
                        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tighter">Choose your learning vibe</p>
                      </div>
                      <button 
                        onClick={() => setPersonaModalOpen(false)}
                        className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="flex flex-col gap-2 max-h-[60vh] sm:max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
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
                            className={`w-full text-left p-4 rounded-[1.5rem] transition-all duration-300 flex items-center gap-4 border-2 relative group overflow-hidden ${
                              isActive 
                                ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-md ring-4 ring-amber-100/50' 
                                : 'bg-white border-zinc-100 hover:border-amber-200 hover:bg-amber-50/20 text-zinc-600'
                            }`}
                          >
                            {/* Visual highlight for VIP locking */}
                            {!isVip && p.id !== 'owl' && (
                              <div className="absolute top-2 right-2">
                                <Lock className="w-3 h-3 text-zinc-300" />
                              </div>
                            )}

                            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${p.color} flex items-center justify-center text-3xl shrink-0 shadow-lg border-2 border-white group-hover:scale-110 transition-transform duration-500`}>
                              {p.emoji}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-black leading-tight mb-1 flex items-center justify-between gap-2">
                                <span className="truncate">{p.name}</span>
                                {isActive ? (
                                  <div className="shrink-0 flex items-center gap-1 text-[9px] bg-amber-600 text-white px-2.5 py-0.5 rounded-full uppercase tracking-tighter font-black">
                                    <Check className="w-2.5 h-2.5" />
                                    Active
                                  </div>
                                ) : (!isVip && p.id !== 'owl' && (
                                  <span className="shrink-0 text-[8px] bg-zinc-100 text-zinc-400 px-2 py-0.5 rounded-full uppercase font-black">Pro</span>
                                ))}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-medium leading-snug line-clamp-2 italic opacity-80">{p.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-100 px-2 pb-1">
                      <p className="text-[10px] text-zinc-400 font-bold text-center italic leading-tight">
                        Switching moods changes the AI's personality & teaching style.
                      </p>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setHistoryOpen(true)}
            className="w-10 h-10 rounded-full border shadow-sm flex items-center justify-center transition-all active:scale-95 bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-500 hover:text-zinc-800 shrink-0 cursor-pointer"
            title="Chat History"
          >
            <History className="w-5 h-5" />
          </button>

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

      {/* History Drawer Overlay */}
      <AnimatePresence>
        {historyOpen && (
          <div className="absolute inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
            {/* Backdrop click to close */}
            <div className="absolute inset-0 bg-transparent" onClick={() => setHistoryOpen(false)} />
            
            {/* Drawer container */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xs sm:max-w-sm h-full bg-[#FAF9F6] border-l border-zinc-200 flex flex-col shadow-2xl z-10"
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
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center h-48 space-y-2">
                    <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                    <span className="text-xs text-zinc-500">Loading history...</span>
                  </div>
                ) : !auth.currentUser ? (
                  <div className="text-center py-12">
                    <p className="text-xs text-zinc-500">Please sign in to view your saved chats.</p>
                  </div>
                ) : !Array.isArray(savedChats) || savedChats.length === 0 ? (
                  <div className="text-center py-12 flex flex-col items-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 border border-zinc-200">
                      <BookOpen className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-800 font-bold">No saved sessions yet</p>
                      <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px] mx-auto">
                        Your chats with the AI Tutor will appear here automatically as you study.
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
                            className={`group relative p-3 rounded-xl bg-[#FAF9F6] border transition-all duration-200 cursor-pointer flex flex-col gap-1.5 ${
                              tutorChatId === chat.id 
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
        className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0 scroll-smooth transition-all duration-100"
        style={{ paddingBottom: '20px' }}
      >
        <AnimatePresence mode="wait">
          {messages.length === 0 ? (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col min-h-full justify-center max-w-md mx-auto pt-4 pb-8 px-2"
            >
              <div className="text-center mb-6">
                <div className={`w-16 h-16 bg-gradient-to-tr ${PERSONAS[activePersona].color} rounded-3xl flex items-center justify-center mx-auto mb-3 shadow-md border border-zinc-200 relative group`}>
                  <div className={`absolute inset-0 rounded-3xl ${activePersona === 'owl' ? 'bg-purple-500/10' : activePersona === 'cosmo' ? 'bg-blue-500/10' : activePersona === 'wizard' ? 'bg-amber-500/10' : 'bg-emerald-500/10'} blur-lg group-hover:blur-xl transition-all`} />
                  <span className="text-3xl relative z-10 animate-[bounce_3s_infinite]">{PERSONAS[activePersona].emoji}</span>
                </div>
                <h3 className="text-2xl font-black text-zinc-800 tracking-tight mb-1">AI Tutor</h3>
              </div>

              {/* Stress / Mood Quick Actions */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                <button 
                  onClick={() => handleSendMessage("I am very stressed, feeling completely lost and sad today. Please talk to me from your heart.")}
                  className="flex items-center gap-2 p-3 rounded-2xl bg-gradient-to-br from-rose-500/5 to-rose-650/5 hover:from-rose-500/15 hover:to-rose-600/10 border border-rose-200 text-rose-700 text-xs font-black transition-all active:scale-[0.98] shadow-sm"
                >
                  <Heart className="w-4 h-4 fill-current text-rose-500" />
                  <span>Exam Stress Booster ❤️</span>
                </button>
                <button 
                  onClick={() => handleSendMessage("Give me a fun multiple choice practice quiz question with Options! Don't tell me the answer directly!")}
                  className="flex items-center gap-2 p-3 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-indigo-650/5 hover:from-indigo-500/15 hover:to-indigo-600/10 border border-indigo-200 text-indigo-700 text-xs font-black transition-all active:scale-[0.98] shadow-sm"
                >
                  <HelpCircle className="w-4 h-4 text-indigo-500" />
                  <span>Fun Practice Quiz 🌟</span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-purple-650 pl-1 flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    Ask me anything or say:
                  </span>
                  <button 
                    onClick={() => {
                      triggerVibration(15);
                      rotateSuggestions();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-black transition-all active:scale-95 border border-purple-200 shadow-sm"
                    title="Get new dynamic suggestions"
                  >
                    <RefreshCw className="w-3 h-3 text-purple-600" />
                    <span>Refresh</span>
                  </button>
                </div>
                {samplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(p.text)}
                    className="w-full text-left bg-[#FAF9F6] hover:bg-purple-50/10 border border-zinc-200/80 hover:border-purple-300 p-4 rounded-2xl transition-all duration-300 flex items-center justify-between group shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center shrink-0 border border-zinc-200/60 group-hover:bg-purple-50 group-hover:border-purple-200 transition-colors">
                        <span className="text-lg">{p.emoji}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-zinc-800 tracking-tight group-hover:text-purple-700 transition-colors truncate">
                            {p.title}
                          </span>
                          <span className="text-[9px] font-semibold bg-zinc-100 group-hover:bg-purple-100 text-zinc-500 group-hover:text-purple-700 px-2 py-0.5 rounded-full border border-zinc-200/40 transition-all shrink-0">
                            {p.category}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 font-medium leading-relaxed truncate">
                          "{p.desc}"
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-3" />
                  </button>
                ))}
              </div>
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
                          <span>🔄</span> Try Again
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

              {/* Premium Brain Thinking Wave Animation (Requirement 6) */}
              {loading && (
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
                    <div>
                      <span className="text-xs text-zinc-100 font-bold tracking-wide">AI is thinking...</span>
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

      {/* Floating Scroll to Bottom button (WhatsApp style) */}
      <AnimatePresence>
        {isUserScrolling && (
          <motion.button
            key="scroll-to-bottom-btn"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            onClick={scrollToBottom}
            className="absolute bottom-36 right-6 z-30 w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg transition-colors active:scale-95 border border-purple-400"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

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
                <span>Choose From Gallery</span>
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
                        '📷 Camera Blocked: Go to Phone Settings → Apps → HelpYou AI → Permissions → Camera → Allow',
                        'warning',
                        7000
                      );
                    } else if (msg.includes('disk') || msg.includes('file') || msg.includes('storage') || msg.includes('create')) {
                      // "unable to create photo on disk" — storage issue on Android
                      showToast(
                        '📂 Storage Error. Please clear HelpYou AI app cache: Settings → Apps → HelpYou AI → Storage → Clear Cache, then retry.',
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
                className={`w-full text-left p-2 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-colors mb-1 cursor-pointer ${
                  isCameraLoading
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
                <span>Upload PDF / Text File</span>
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
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 border ${
              showPlusMenu 
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

          <button 
            onClick={toggleListening}
            disabled={isOffline}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 shadow-sm ${isOffline ? 'bg-zinc-100 text-zinc-300 border-zinc-200/40 cursor-not-allowed opacity-50' : isListening ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-white hover:bg-zinc-100 text-zinc-500 border border-zinc-200/60'}`}
          >
            {isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
          </button>

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
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 shadow-sm ${
                isHolding 
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
      </div>

      {/* Full-Screen Image Preview Modal */}
      <AnimatePresence>
        {fullscreenPreviewUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
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
