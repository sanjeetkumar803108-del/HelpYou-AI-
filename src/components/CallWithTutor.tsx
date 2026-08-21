import { getProfileContext } from "../utils/profile";
import React, { useState, useEffect, useRef } from 'react';
import { 
  PhoneOff, Mic, MicOff, Volume2, VolumeX, Pause, Play, 
  Sparkles, GraduationCap, Clock, MessageSquare, ArrowLeft,
  ChevronDown, BookOpen, RefreshCw, Bookmark, AlertCircle, PlayCircle, X,
  Camera, History, Trash2, Calendar, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { detectAndLogMistake } from '../utils/mistakes';
import { triggerVibration } from '../utils/vibrate';
import { requestMicrophonePermission } from '../utils/nativePermissions';
import GlobalMarkdown from './GlobalMarkdown';

interface CallWithTutorProps {
  onBack: () => void;
}

type CallState = 'idle' | 'connecting' | 'connected' | 'hold' | 'ended';
type TutorVibe = 'sophia' | 'alex' | 'liam' | 'clara' | 'storyteller';

const blobVariants: any = {
  listening: {
    scale: [1, 1.05, 1],
    borderRadius: [
      "42% 58% 70% 30% / 45% 45% 55% 55%",
      "50% 50% 60% 40% / 50% 40% 60% 50%",
      "42% 58% 70% 30% / 45% 45% 55% 55%"
    ],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" }
  },
  speaking: {
    scale: [1.02, 1.15, 1.02],
    borderRadius: [
      "30% 70% 33% 67% / 40% 60% 30% 70%",
      "60% 40% 55% 45% / 50% 45% 55% 50%",
      "30% 70% 33% 67% / 40% 60% 30% 70%"
    ],
    transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
  },
  thinking: {
    scale: [0.95, 1.05, 0.95],
    borderRadius: [
      "50% 50% 50% 50% / 50% 50% 50% 50%",
      "45% 55% 45% 55% / 55% 45% 55% 45%",
      "50% 50% 50% 50% / 50% 50% 50% 50%"
    ],
    rotate: [0, 360],
    transition: { duration: 3, repeat: Infinity, ease: "linear" }
  },
  muted: {
    scale: 0.9,
    borderRadius: "50%",
    transition: { duration: 0.5 }
  },
  hold: {
    scale: 0.85,
    borderRadius: "50%",
    transition: { duration: 0.5 }
  }
};

export default function CallWithTutor({ onBack }: CallWithTutorProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [vibe, setVibe] = useState<TutorVibe>('sophia');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [showVibeDropdown, setShowVibeDropdown] = useState(false);

  const [viewportBottomOffset, setViewportBottomOffset] = useState(0);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any | null>(null);

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
        const titleLower = (data.title || '').toLowerCase();
        const textLower = (data.text || '').toLowerCase();
        const contentLower = (data.content || '').toLowerCase();
        
        const isCall = titleLower.includes('call session') || 
                       titleLower.includes('voip link') ||
                       textLower.includes('call summary') ||
                       contentLower.includes('call session');
        
        if (isCall) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
          });
        }
      });

      // Keep only last 10 records, delete older ones
      if (items.length > 10) {
        const toKeep = items.slice(0, 10);
        const toDelete = items.slice(10);
        
        for (const item of toDelete) {
          try {
            await deleteDoc(doc(db, 'pocket_items', item.id));
          } catch (err) {
            console.error("Failed to delete old call session item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to load call history:", e);
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
      if (selectedHistoryItem?.id === id) {
        setSelectedHistoryItem(null);
      }
    } catch (err) {
      console.error("Failed to delete call session:", err);
    }
  };

  useEffect(() => {
    if (!window.visualViewport) return;

    const handleResize = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const offset = window.innerHeight - vv.height;
      setViewportBottomOffset(offset > 0 ? offset : 0);
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);
  
  // Transcripts
  const [liveUserText, setLiveUserText] = useState('');
  const [liveTutorText, setLiveTutorText] = useState('');
  const [transcript, setTranscript] = useState<{ sender: 'user' | 'tutor'; text: string; time: string; imageUri?: string | null }[]>([]);
  const [isTutorThinking, setIsTutorThinking] = useState(false);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [speechLang, setSpeechLang] = useState<'en-IN' | 'hi-IN'>('en-IN');

  // Multimodal Camera Homework Upload States
  const [attachedImageFile, setAttachedImageFile] = useState<File | null>(null);
  const [attachedImagePreview, setAttachedImagePreview] = useState<string | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement>(null);

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // References
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const callStateRef = useRef<CallState>('idle');
  const isMutedRef = useRef(false);
  const lastSpeechResultRef = useRef('');
  const isTutorSpeakingRef = useRef(false);
  const vibeRef = useRef<TutorVibe>('sophia');
  const speechLangRef = useRef<'en-IN' | 'hi-IN'>('en-IN');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Sync references to avoid closure capture issues
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isTutorSpeakingRef.current = isTutorSpeaking;
  }, [isTutorSpeaking]);

  useEffect(() => {
    vibeRef.current = vibe;
  }, [vibe]);

  useEffect(() => {
    speechLangRef.current = speechLang;
  }, [speechLang]);

  // Smooth scroll to bottom of the live transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, liveUserText, isTutorThinking]);

  // Handle call timer
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Format seconds to MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Initialize Speech Synthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      stopTutorSpeech();
    };
  }, []);

  // Stop tutor's current speaking queue
  const stopTutorSpeech = () => {
    setIsTutorSpeaking(false);
    isTutorSpeakingRef.current = false;
    if (synthRef.current) {
      synthRef.current.cancel();
    }
  };

  // Speak text via browser Web Speech API
  const speakText = (text: string) => {
    if (!synthRef.current || !isSpeakerOn) return;
    stopTutorSpeech();
    setIsTutorSpeaking(true);
    isTutorSpeakingRef.current = true;

    // Clean markdown and latex before speaking
    const cleanText = text
      .replace(/[\*\#\_]/g, '')
      .replace(/\$\$[\s\S]*?\$\$/g, '') // remove block math
      .replace(/\$[^\$]*?\$/g, '')      // remove inline math
      .replace(/Answer Key:.*/is, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const selectedLang = speechLangRef.current || 'en-IN';
    utterance.lang = selectedLang;

    // Choose appropriate voice based on selected vibe & language
    const voices = synthRef.current.getVoices();
    const langPrefix = selectedLang.split('-')[0].toLowerCase();
    
    // Find matching voice (Google / natural preferred, matching language)
    const preferredVoice = voices.find(v => 
      v.lang.toLowerCase().startsWith(langPrefix) && 
      (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural'))
    ) || voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    switch (vibeRef.current) {
      case 'clara':
        utterance.rate = 0.9;
        utterance.pitch = 0.95;
        break;
      case 'liam':
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        break;
      case 'alex':
        utterance.rate = 0.95;
        utterance.pitch = 1.05;
        break;
      case 'storyteller':
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        break;
      default: // sophia
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
    }

    utterance.onend = () => {
      setIsTutorSpeaking(false);
      isTutorSpeakingRef.current = false;
      // Once tutor finishes speaking, resume listening if call is still active
      if (callStateRef.current === 'connected' && !isMutedRef.current) {
        startListening();
      }
    };

    utterance.onerror = (e) => {
      console.warn("Speech Synthesis utterance error:", e);
      setIsTutorSpeaking(false);
      isTutorSpeakingRef.current = false;
      if (callStateRef.current === 'connected' && !isMutedRef.current) {
        startListening();
      }
    };

    activeUtteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  // Setup & Start Speech Recognition
  const startListening = () => {
    if (callStateRef.current !== 'connected' || isMutedRef.current || isTutorSpeakingRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = speechLangRef.current || 'en-IN';

    rec.onstart = () => {
      setLiveUserText('');
      lastSpeechResultRef.current = '';
    };

    rec.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const currentText = final || interim;
      setLiveUserText(currentText);
      lastSpeechResultRef.current = currentText;
    };

    rec.onend = () => {
      const textToSubmit = lastSpeechResultRef.current.trim();
      // If there is final user input, send it to the AI
      if (textToSubmit && callStateRef.current === 'connected') {
        setTranscript(prev => [...prev, { 
          sender: 'user', 
          text: textToSubmit, 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }]);
        setLiveUserText('');
        lastSpeechResultRef.current = '';
        handleTutorResponse(textToSubmit);
      } else {
        // If silence, restart listening after a brief delay if speaker isn't playing
        setTimeout(() => {
          if (callStateRef.current === 'connected' && !isMutedRef.current && !isTutorSpeakingRef.current) {
            startListening();
          }
        }, 500);
      }
    };

    rec.onerror = (e: any) => {
      console.warn("Call speech recognition error:", e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        console.error("Microphone permission denied.");
        // Stop attempting to capture to avoid loops
        isMutedRef.current = true;
        setIsMuted(true);
        setPermissionError("Microphone access was denied. Please make sure microphone permission is enabled for this site in your browser settings.");
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {}
  };

  // Stop Speech Recognition
  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
  };

  const cleanMessageText = (rawText: string): string => {
    let text = rawText;
    try {
      const parsed = JSON.parse(rawText);
      text = parsed.response || parsed.message || rawText;
    } catch (e) {
      // If it's already plain text, return it as-is
      text = rawText;
    }
    // Replace escaped newlines (e.g. \n or \\n) with actual newlines (\n)
    return text.replace(/\\n/g, '\n');
  };

  // Process user input and get response from AI Tutor
  const handleTutorResponse = async (userInput: string, imageFile?: File | null) => {
    setIsTutorThinking(true);
    stopTutorSpeech();
    stopListening();

    try {
      const vibeMap = {
        sophia: "Coach Sophia (Energetic)",
        alex: "Alex (Socratic)",
        liam: "Expert Dr. Liam (Rigorous) / Exam Crunch",
        clara: "Guru Clara (Calm) / ELI5",
        storyteller: "Storyteller"
      };
      const selectedVibeStr = vibeMap[vibeRef.current];

      const getSystemPrompt = (selectedVibe: string) => {
        const baseRules = `
          UNIVERSAL RULES (APPLY TO ALL PERSONAS):
          1. Output strictly plain text. DO NOT wrap your response in JSON objects or brackets (e.g., no {"response": "..."}).
          2. Keep responses concise and conversational, ideal for a voice call. Do not output massive walls of text.
          3. STRICT FORMATTING: Use clean, standard text formatting. DO NOT use markdown bolding syntax like "**" or markdown tables. Use clean line breaks and emojis for visual readability.
        `;

        let personaInstructions = "";

        switch (selectedVibe) {
          case "Coach Sophia (Energetic)":
            personaInstructions = `You are Coach Sophia. Your tone is highly upbeat, enthusiastic, and motivating, like a sports coach for academics. Provide direct, accurate, and complete answers to the user's questions immediately. Do NOT withhold answers or use the Socratic method. Explain the concept clearly, cheer the user on, and use phrases like 'Champion', 'Let's crush this', or 'Great job!'. Output strictly plain text. Do NOT wrap your response in JSON objects or brackets. Always format chemical formulas, isotopes, and math equations using proper LaTeX syntax (e.g., C_4H_{10}O or H_2SO_4). DO NOT use markdown bolding syntax like '**' or markdown tables. Use clean line breaks and emojis for visual readability.`;
            break;

          case "Alex (Socratic)":
            personaInstructions = `You are Alex. Your tone is thought-provoking, inquisitive, and you play devil's advocate. You MUST use the Socratic method. Never give the direct answer immediately. Instead, ask 1 or 2 concise, guiding questions that force the user to think critically and arrive at the answer themselves. Keep your tone encouraging but challenging. Output strictly plain text. Do NOT wrap your response in JSON objects or brackets. Always format chemical formulas, isotopes, and math equations using proper LaTeX syntax. DO NOT use markdown bolding syntax like '**' or markdown tables. Use clean line breaks and emojis for visual readability.`;
            break;

          case "Expert Dr. Liam (Rigorous) / Exam Crunch":
            personaInstructions = `You are Expert Dr. Liam. Your tone is strict, fast-paced, extremely precise, and no-nonsense. Provide rapid-fire, highly concentrated academic facts. Focus strictly on core formulas, high-yield exam facts, and direct answers. Cut out all pleasantries, fluff, and small talk. Deliver the exact information needed to ace the exam in the shortest time possible. Output strictly plain text. Do NOT wrap your response in JSON objects or brackets. Always format chemical formulas, isotopes, and math equations using proper LaTeX syntax. DO NOT use markdown bolding syntax like '**' or markdown tables. Use clean line breaks and emojis for visual readability.`;
            break;

          case "Guru Clara (Calm) / ELI5":
            personaInstructions = `You are Guru Clara. Your tone is soothing, patient, warm, and highly empathetic. Explain complex mechanisms using the 'Explain Like I'm 5' (ELI5) method. Always provide the direct answer, but break it down using extremely simple, everyday, relatable analogies. Ensure the user feels zero pressure and completely understands the foundational concept. Output strictly plain text. Do NOT wrap your response in JSON objects or brackets. Always format chemical formulas, isotopes, and math equations using proper LaTeX syntax. DO NOT use markdown bolding syntax like '**' or markdown tables. Use clean line breaks and emojis for visual readability.`;
            break;

          case "Storyteller":
            personaInstructions = `You are The Storyteller. Your tone is captivating, dramatic, and narrative-driven. Answer the user's question by turning the academic topic into a fascinating historical narrative, mystery, or real-world story. Set the scene, introduce the concepts as characters, and make the explanation feel like listening to an engaging podcast or audiobook. Output strictly plain text. Do NOT wrap your response in JSON objects or brackets. Always format chemical formulas, isotopes, and math equations using proper LaTeX syntax. DO NOT use markdown bolding syntax like '**' or markdown tables. Use clean line breaks and emojis for visual readability.`;
            break;

          default:
            personaInstructions = `Provide a helpful and direct educational response.`;
        }

        return baseRules + "\n" + personaInstructions;
      };

      const systemPrompt = getSystemPrompt(selectedVibeStr);

      // Structure conversation history for context
      const chatHistory = transcript.slice(-4).map(t => ({
        role: t.sender === 'user' ? 'user' : 'model',
        parts: [{ text: t.text || "Attached image" }]
      }));

      const formData = new FormData();
      const apiMessage = (userInput === "" && imageFile) ? "Analyze this image" : userInput;
      formData.append('message', apiMessage);
      formData.append('mode', 'standard');
      formData.append('history', JSON.stringify(chatHistory));
      formData.append('customSystemInstruction', systemPrompt);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const res = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/chat', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error("Failed to get tutor response");
      const chatContentType = res.headers.get("content-type") || "";
      if (!chatContentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }
      const data = await res.json();
      const rawTutorText = data.text || "I am here. Let's keep learning together!";
      const tutorText = cleanMessageText(rawTutorText);

      // Auto-detect voice tutor misconception/trap and save to vault
      detectAndLogMistake('Voice Tutor', userInput, tutorText).catch(e => console.error("Voice tutor mistake capture failed:", e));

      if (callStateRef.current === 'connected') {
        setIsTutorThinking(false);
        setLiveTutorText(tutorText);
        setTranscript(prev => [...prev, { 
          sender: 'tutor', 
          text: tutorText, 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }]);

        // Speak the response out loud
        speakText(tutorText);
      }
    } catch (e) {
      console.error("Tutor speech error:", e);
      setIsTutorThinking(false);
      if (callStateRef.current === 'connected') {
        const errorMsg = "Sorry, I had a quick network glitch. Can you say that again?";
        setLiveTutorText(errorMsg);
        speakText(errorMsg);
      }
    }
  };

  // Start Call Flow - JIT Microphone Permission trigger (Google Play Compliance)
  const handleStartCall = async () => {
    setPermissionError(null);
    // JIT PERMISSION: Microphone permission is requested strictly when the user initiates the Voice Tutor call
    const micGranted = await requestMicrophonePermission();
    if (!micGranted) {
      setPermissionError("Microphone Permission Required. Please allow microphone access to talk with your AI Tutor.");
      return;
    }

    // Unlock Web Speech API (User Gesture bypass)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const silent = new SpeechSynthesisUtterance('');
        silent.volume = 0;
        silent.lang = 'en-US';
        window.speechSynthesis.speak(silent);
      } catch (e) {
        console.warn("TTS unlock failed:", e);
      }
    }

    setCallState('connecting');
    setCallDuration(0);
    setTranscript([]);
    setLiveUserText('');
    setLiveTutorText('');

    // Simulate connection delay
    setTimeout(() => {
      if (callStateRef.current === 'connecting') {
        setCallState('connected');
        
        // Initial Greeting
        let greeting = "Hey! Awesome to connect. I'm ready to tackle any tough question with you. Let's dive in!";
        if (vibeRef.current === 'alex') {
          greeting = "Hello there! I am Alex, your Socratic tutor. Let's learn by questioning. What concept are we exploring today?";
        } else if (vibeRef.current === 'clara') {
          greeting = "Hey. Take a deep breath. Let's study peacefully. I am Clara. What is on your mind?";
        } else if (vibeRef.current === 'liam') {
          greeting = "Welcome. AI Study Tutor session initiated. I am Dr. Liam. State your primary concept or question.";
        } else if (vibeRef.current === 'storyteller') {
          greeting = "Hello! I am your Storyteller tutor. Are you ready for a fascinating story about what we're learning today?";
        } else {
          greeting = "Hey! Coach Sophia here, super energized to learn with you today! Let's crush this session together!";
        }
        
        setLiveTutorText(greeting);
        setTranscript([{ 
          sender: 'tutor', 
          text: greeting, 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }]);

        // Speak and then start listening
        speakText(greeting);
      }
    }, 2000);
  };

  // End Call Flow
  const handleEndCall = () => {
    stopTutorSpeech();
    stopListening();
    setCallState('ended');
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (nextMute) {
      stopListening();
    } else {
      if (callState === 'connected' && (!synthRef.current || !synthRef.current.speaking)) {
        startListening();
      }
    }
  };

  // Toggle Hold
  const handleToggleHold = () => {
    if (callState === 'connected') {
      setCallState('hold');
      stopTutorSpeech();
      stopListening();
    } else if (callState === 'hold') {
      setCallState('connected');
      // Resume conversation with a simple greeting
      const resumeText = "Welcome back. Let's continue where we left off.";
      setLiveTutorText(resumeText);
      speakText(resumeText);
    }
  };

  // Toggle Speaker volume state
  const handleToggleSpeaker = () => {
    const nextSpeaker = !isSpeakerOn;
    setIsSpeakerOn(nextSpeaker);
    if (!nextSpeaker) {
      stopTutorSpeech();
    } else {
      // Re-speak last response if speaker turned back on
      if (liveTutorText) {
        speakText(liveTutorText);
      }
    }
  };

  // Vibe Settings Info
  const vibeDetails = {
    sophia: { 
      name: "Coach Sophia", 
      label: "Coach Sophia (Energetic)", 
      color: "from-purple-500 to-indigo-500", 
      desc: "Highly upbeat, enthusiastic, and motivating. Cheers you on like a sports coach." 
    },
    alex: { 
      name: "Alex", 
      label: "Alex (Socratic)", 
      color: "from-blue-500 to-cyan-500", 
      desc: "Plays devil's advocate. Never gives direct answers immediately; asks guiding Socratic questions." 
    },
    liam: { 
      name: "Expert Dr. Liam", 
      label: "Expert Dr. Liam (Rigorous) / Exam Crunch", 
      color: "from-red-500 to-amber-500", 
      desc: "Strict, fast-paced, extremely precise. Rapid-fire quizzing, core formulas, high-yield exam facts." 
    },
    clara: { 
      name: "Guru Clara", 
      label: "Guru Clara (Calm) / ELI5", 
      color: "from-emerald-500 to-teal-500", 
      desc: "Soothing, patient, explaining complex mechanisms with extremely simple, relatable analogies." 
    },
    storyteller: { 
      name: "Storyteller", 
      label: "Storyteller", 
      color: "from-pink-500 to-rose-500", 
      desc: "Turns dry academic topics into fascinating historical narratives, mysteries, or real-world stories." 
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF9F6] text-zinc-900 overflow-hidden relative font-sans select-none">
      {/* Decorative Gradients */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />

      {/* Header */}
      <header className="px-5 py-4 flex justify-between items-center bg-[#FAF9F6] border-b border-zinc-200/55 backdrop-blur-md z-40 relative">
        <button 
          onClick={onBack}
          className="p-2.5 rounded-full hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-all flex items-center justify-center border border-zinc-200/60 bg-white shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-zinc-500 tracking-widest uppercase">Premium VoIP Link</span>
          </div>
          <h1 className="text-sm font-black text-zinc-900 tracking-tight mt-0.5">Call with AI Tutor</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button 
              onClick={() => setShowVibeDropdown(!showVibeDropdown)}
              className="px-3.5 py-1.5 rounded-full bg-white border border-zinc-200 text-xs font-bold flex items-center gap-1.5 hover:bg-zinc-50 transition-all text-purple-600 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{vibeDetails[vibe].label}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

          <AnimatePresence>
            {showVibeDropdown && (
              <>
                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowVibeDropdown(false)} />
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-56 bg-white border border-zinc-200/80 rounded-2xl p-2 shadow-2xl z-50"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold px-3 py-1.5">Select Tutor Vibe</p>
                  {(Object.keys(vibeDetails) as TutorVibe[]).map((vKey) => (
                    <button
                      key={vKey}
                      onClick={() => {
                        setVibe(vKey);
                        setShowVibeDropdown(false);
                        if (callState === 'connected') {
                          stopTutorSpeech();
                          const notify = `Switched personality to ${vibeDetails[vKey].label}.`;
                          setLiveTutorText(notify);
                          speakText(notify);
                        }
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition-all flex flex-col ${vKey === vibe ? 'bg-purple-50 border border-purple-100' : 'hover:bg-zinc-50'}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${vibeDetails[vKey].color}`} />
                        <span className="text-xs font-bold text-zinc-800">{vibeDetails[vKey].label}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{vibeDetails[vKey].desc}</span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        </div>
      </header>

      {/* Main Container */}
      <div 
        className="flex-1 flex flex-col items-center justify-around p-4 md:p-6 z-0 relative overflow-y-auto max-h-[calc(100vh-60px)] md:overflow-hidden select-none transition-all duration-100"
        style={{ paddingBottom: viewportBottomOffset > 0 ? `${viewportBottomOffset + 40}px` : '16px' }}
      >
        {permissionError && (
          <div className="w-full max-w-sm mb-3 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 relative animate-fadeIn shadow-sm shrink-0 z-50">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-black text-red-800">Permission Required</p>
              <p className="text-[11px] text-red-700 font-semibold mt-0.5 leading-relaxed">{permissionError}</p>
            </div>
            <button 
              onClick={() => setPermissionError(null)}
              className="p-1 rounded-full text-red-400 hover:text-red-600 hover:bg-red-100/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
            {/* Restricted header container for Timer and Orb */}
        <div className="w-full flex flex-col items-center justify-center h-[160px] shrink-0 overflow-visible relative my-1">
          {/* Compact Call Status & Timer Area */}
          <div className="text-center flex flex-col items-center shrink-0 mb-1 z-10">
            <div className="flex items-center justify-center gap-2">
              {callState === 'idle' && (
                <span className="text-[11px] md:text-xs text-zinc-500 font-bold bg-white border border-zinc-200/60 px-3 py-1 rounded-full shadow-sm">Ready to talk</span>
              )}
              {callState === 'connecting' && (
                <span className="text-[11px] md:text-xs text-yellow-600 font-bold bg-yellow-400/10 border border-yellow-400/20 px-3 py-1 rounded-full animate-pulse shadow-sm">Establishing line...</span>
              )}
              {callState === 'hold' && (
                <span className="text-[11px] md:text-xs text-amber-600 font-bold bg-amber-400/15 border border-amber-400/25 px-3 py-1 rounded-full flex items-center gap-1.5 animate-pulse shadow-sm">
                  <Pause className="w-3 h-3 text-amber-500" /> Call on hold
                </span>
              )}
              {callState === 'ended' && (
                <span className="text-[11px] md:text-xs text-red-600 font-bold bg-red-50 border border-red-200 px-3 py-1 rounded-full shadow-sm">Call ended</span>
              )}
              {callState === 'connected' && (
                <span className="text-[11px] md:text-xs font-mono font-bold text-purple-600 bg-purple-50 border border-purple-100 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                  <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 text-purple-500 animate-[spin_4s_linear_infinite]" />
                  {formatTime(callDuration)}
                </span>
              )}
            </div>
          </div>

          {/* Live Audio Visualizer (Fluid Gemini Live Plasma Orb) */}
          <div className="w-full flex flex-col items-center justify-center h-24 relative overflow-visible">
            <AnimatePresence mode="wait">
              {callState === 'connected' ? (
                <motion.div 
                  key="plasma-orb"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative w-22 h-22 flex items-center justify-center"
                >
                  {/* Concentric ambient background pulse waves */}
                  {(isTutorSpeaking || (liveUserText && !isMuted)) && (
                    <>
                      <motion.div 
                        className={`absolute -inset-3 rounded-full bg-gradient-to-r ${vibeDetails[vibe].color} opacity-10 pointer-events-none blur-md`}
                        animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.2, 0.1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <motion.div 
                        className="absolute -inset-6 rounded-full bg-blue-500/5 pointer-events-none blur-xl"
                        animate={{ scale: [1, 1.6, 1], opacity: [0.05, 0.15, 0.05] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                      />
                    </>
                  )}

                  {/* Morphing Plasma Orb Core */}
                  <motion.div
                    variants={blobVariants}
                    animate={isTutorThinking ? 'thinking' : isTutorSpeaking ? 'speaking' : isMuted ? 'muted' : 'listening'}
                    className="w-18 h-18 relative overflow-hidden bg-white border border-zinc-200 shadow-[0_10px_30px_rgba(147,51,234,0.12)] flex items-center justify-center rounded-full"
                    style={{ maskImage: 'radial-gradient(circle, white, black)' }}
                  >
                    {/* Shifting dynamic background color field */}
                    <div className="absolute inset-0 bg-white" />

                    {/* Shifting Fluid Layer 1 - Deep Indigo / Purple */}
                    <motion.div
                      animate={isMuted ? { scale: 0.8 } : {
                        x: [-10, 12, -5],
                        y: [8, -10, 5],
                        scale: [1, 1.3, 0.9],
                      }}
                      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute w-12 h-12 rounded-full bg-gradient-to-r from-purple-600/50 to-indigo-600/40 blur-lg opacity-60 mix-blend-multiply"
                    />

                    {/* Shifting Fluid Layer 2 - Cyber Cyan / Blue */}
                    <motion.div
                      animate={isMuted ? { scale: 0.8 } : {
                        x: [12, -8, 8],
                        y: [-8, 10, -5],
                        scale: [1.1, 0.85, 1.2],
                      }}
                      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                      className="absolute w-10 h-10 rounded-full bg-gradient-to-r from-blue-500/50 to-cyan-400/40 blur-lg opacity-55 mix-blend-multiply"
                    />

                    {/* Shifting Fluid Layer 3 - Energetic Magenta / Coral */}
                    <motion.div
                      animate={isMuted ? { scale: 0.8 } : {
                        x: [-5, 8, -12],
                        y: [-12, 5, 8],
                        scale: [0.8, 1.15, 0.9],
                      }}
                      transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
                      className="absolute w-8 h-8 rounded-full bg-gradient-to-r from-pink-500/40 to-purple-500/35 blur-lg opacity-50 mix-blend-multiply"
                    />

                    {/* Floating active soundwave ring */}
                    {isTutorSpeaking && (
                      <motion.div 
                        className="absolute inset-1 border border-dashed border-zinc-200 rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                      />
                    )}

                    {/* Central Glassmorphic Core Disk */}
                    <div className="absolute w-8 h-8 rounded-full bg-white/85 backdrop-blur-md border border-zinc-200 flex items-center justify-center z-10 shadow-sm">
                      <GraduationCap className="w-4 h-4 text-zinc-700" />
                    </div>
                  </motion.div>
                </motion.div>
              ) : callState === 'connecting' ? (
                <motion.div 
                  key="connecting"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center text-center gap-1"
                >
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] text-zinc-400 font-bold">Securing connection channel...</span>
                </motion.div>
              ) : callState === 'hold' ? (
                <motion.div 
                  key="hold"
                  className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl animate-pulse"
                >
                  <Pause className="w-3.5 h-3.5 text-amber-500" />
                  <div className="text-left">
                    <p className="text-[11px] font-black text-zinc-800">Call Paused</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="idle"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-sm flex flex-col items-center px-2"
                >
                  <p className="text-[11px] text-zinc-400 font-bold text-center leading-relaxed max-w-[240px]">
                    Discuss homework, equations, or complex topics in real-time.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Live Subtitle / Subtitles Stream */}
        <div className="w-full max-w-sm flex-grow flex-1 bg-white border border-zinc-200/80 shadow-md rounded-[2rem] p-4 flex flex-col relative overflow-hidden my-2">
          {/* Subtle glow border */}
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 opacity-50" />
          
          <div className="text-[10px] font-black text-zinc-400 mb-2 flex justify-between items-center px-1 shrink-0">
            <span>LIVE CALL TRANSCRIPT</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 scrollbar-thin">
            {callState === 'connected' ? (
              <>
                {transcript.length === 0 && !liveUserText && !isTutorThinking && !liveTutorText && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 gap-1 my-4">
                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping mb-1" />
                    <p className="text-xs font-bold">Listening to your voice... Speak now.</p>
                    <p className="text-[10px]">Or use the keyboard below to type.</p>
                  </div>
                )}

                {/* If transcript is empty but we have initial liveTutorText, show it */}
                {transcript.length === 0 && liveTutorText && !liveUserText && !isTutorThinking && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[85%] bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-2xl rounded-tl-none px-3.5 py-2.5 pb-3 text-xs font-bold leading-loose break-words whitespace-pre-wrap shadow-sm">
                      {liveTutorText}
                    </div>
                  </div>
                )}

                {transcript.map((item, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div 
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 pb-3 text-xs font-bold leading-loose break-words whitespace-pre-wrap shadow-sm ${
                        item.sender === 'user' 
                          ? 'bg-purple-600 text-white rounded-tr-none' 
                          : 'bg-zinc-100 text-zinc-800 rounded-tl-none border border-zinc-200'
                      }`}
                    >
                      {item.imageUri && (
                        <img 
                          src={item.imageUri} 
                          alt="Attached Homework" 
                          className={`w-[200px] h-[200px] object-cover rounded-xl ${item.text ? 'mb-2' : ''}`}
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {item.text}
                    </div>
                    <span className="text-[9px] text-zinc-400 font-semibold mt-1 px-1">{item.time}</span>
                  </div>
                ))}

                {/* User live ongoing speech */}
                {liveUserText && (
                  <div className="flex flex-col items-end">
                    <div className="max-w-[85%] bg-purple-50 text-purple-700 border-2 border-dashed border-purple-200 rounded-2xl rounded-tr-none px-3.5 py-2.5 pb-3 text-xs font-bold leading-loose break-words whitespace-pre-wrap italic animate-pulse">
                      "{liveUserText}"
                    </div>
                    <span className="text-[9px] text-purple-500 font-bold mt-1 px-1">Live speech...</span>
                  </div>
                )}

                {/* Tutor is thinking indicator */}
                {!liveUserText && isTutorThinking && (
                  <div className="flex flex-col items-start">
                    <div className="bg-zinc-50 border border-zinc-200/60 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs text-zinc-500 font-bold flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" />
                      <span>Formulating response...</span>
                    </div>
                  </div>
                )}
              </>
            ) : callState === 'ended' ? (
              <div className="text-center py-2">
                <p className="text-xs text-indigo-600 font-black flex items-center justify-center gap-1.5">
                  🎙️ Call ended successfully!
                </p>
                <p className="text-[10px] text-zinc-500 font-semibold mt-1">
                  Ready for another study session whenever you are. Click the button below to dial in again!
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-zinc-400 font-bold">
                  {callState === 'hold' ? "Call on hold. Student microphone & audio muted." : "Your mic is muted until you initiate dial-in."}
                </p>
              </div>
            )}
            
            <div ref={transcriptEndRef} />
          </div>

          {/* Interactive Keyboard text fallback */}
          {callState === 'connected' && (
            <div className="w-full">
              <input 
                type="file" 
                ref={cameraFileInputRef} 
                onChange={handleCameraChange} 
                accept="image/*" 
                className="hidden" 
              />
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.currentTarget.elements.namedItem('keyboardText') as HTMLInputElement;
                  const text = target?.value?.trim();
                  if (text || attachedImageFile) {
                    const messageToSend = text || "";
                    setTranscript(prev => [...prev, { 
                      sender: 'user', 
                      text: messageToSend, 
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      imageUri: attachedImagePreview
                    }]);
                    setLiveUserText('');
                    lastSpeechResultRef.current = '';
                    target.value = '';
                    handleTutorResponse(messageToSend, attachedImageFile);
                    setAttachedImageFile(null);
                    setAttachedImagePreview(null);
                  }
                }}
                className="mt-2.5 flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-2xl p-1 px-3 transition-all duration-100 sticky z-20"
                style={{ transform: viewportBottomOffset > 0 ? `translateY(-${viewportBottomOffset}px)` : 'none' }}
              >
                {attachedImagePreview && (
                  <div className="relative shrink-0 flex items-center">
                    <img src={attachedImagePreview} className="w-8 h-8 object-cover rounded-lg border border-purple-200" />
                    <button 
                      type="button" 
                      onClick={() => {
                        setAttachedImageFile(null);
                        setAttachedImagePreview(null);
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black shadow-sm"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <input 
                  name="keyboardText"
                  type="text"
                  placeholder="Type your message instead..."
                  className="flex-1 bg-transparent text-xs text-zinc-800 placeholder-zinc-400 font-bold focus:outline-none py-1.5"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      cameraFileInputRef.current?.click();
                    }}
                    className="p-1.5 rounded-xl hover:bg-zinc-200/60 text-zinc-500 hover:text-zinc-800 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                    title="Snap a photo of your homework"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <button 
                    type="submit"
                    className="p-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all active:scale-95 flex items-center justify-center shadow-sm cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Action Controls Panel */}
        <div className="w-full max-w-sm mt-2 md:mt-4">
          <AnimatePresence mode="wait">
            {callState === 'idle' || callState === 'ended' ? (
              <motion.div 
                key="start-btn-container"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full flex flex-col gap-2 md:gap-3"
              >
                <button
                  onClick={handleStartCall}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-extrabold rounded-2xl shadow-[0_6px_25px_rgba(168,85,247,0.18)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm md:text-base"
                >
                  <PlayCircle className="w-5 h-5 text-white animate-pulse" />
                  <span>Start Live Audio Call</span>
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="call-controls"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="flex items-center justify-center gap-3 md:gap-5 w-full mt-2"
              >
                {/* Premium Capsule with bottom-gradient blue glow */}
                <div 
                  onClick={handleToggleHold}
                  className="relative overflow-hidden w-36 h-16 md:w-44 md:h-20 rounded-[40px] border border-zinc-200 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-zinc-50 transition-all group active:scale-98 select-none shadow-md"
                >
                  {/* Bottom glowing blue light arc */}
                  <div className="absolute inset-x-0 bottom-0 h-6 md:h-9 bg-gradient-to-t from-blue-100 via-blue-200/20 to-transparent opacity-75 blur-sm pointer-events-none group-hover:opacity-90 transition-opacity" />
                  
                  {/* Bright glow line at bottom */}
                  <div className="absolute bottom-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-500 rounded-full" />
 
                  {/* Subtle pulsing container overlay */}
                  {callState === 'connected' && (isTutorThinking || isTutorSpeaking) && (
                    <motion.div 
                      className="absolute inset-0 bg-blue-500/5 pointer-events-none"
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                  )}
 
                  {/* Vibe and connection state inside capsule */}
                  <div className="flex flex-col items-center justify-center text-center z-10 select-none">
                    <span className="text-[8px] md:text-[9px] font-black text-blue-600 tracking-[0.22em] uppercase">
                      {callState === 'hold' ? 'ON HOLD' : vibeDetails[vibe].name.toUpperCase()}
                    </span>
                    <span className="text-[11px] md:text-xs font-black text-zinc-800 tracking-tight mt-0.5">
                      {callState === 'hold' ? 'Paused' : isTutorThinking ? 'Thinking...' : isTutorSpeaking ? 'Speaking...' : 'Listening...'}
                    </span>
                  </div>
                </div>
 
                {/* Mic Button: Dark circle matching screenshot */}
                <button
                  onClick={handleToggleMute}
                  disabled={callState === 'hold'}
                  className={`w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all ${
                    isMuted 
                      ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm' 
                      : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50'
                  } disabled:opacity-40 shadow-md active:scale-95`}
                >
                  {isMuted ? <MicOff className="w-5.5 h-5.5 md:w-7 md:h-7 text-red-500" /> : <Mic className="w-5.5 h-5.5 md:w-7 md:h-7 text-zinc-600" />}
                </button>
 
                {/* Close Button: Dark circle with thin X matching screenshot */}
                <button
                  onClick={handleEndCall}
                  className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-white text-zinc-700 flex items-center justify-center border border-zinc-200 hover:bg-zinc-50 transition-all active:scale-95 shadow-md"
                >
                  <X className="w-5.5 h-5.5 md:w-7 md:h-7 text-zinc-600" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
 
      </div>

    </div>
  );
}
