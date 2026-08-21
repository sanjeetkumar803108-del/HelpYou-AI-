import { getProfileContext } from "../utils/profile";
import { detectAndLogMistake } from "../utils/mistakes";
import { triggerVibration } from "../utils/vibrate";
import { safeGetItem } from "../utils/storage";
import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Zap, Calculator, X, Loader2, Send, Mic, MicOff, Check, Languages, HelpCircle, GraduationCap, BookOpen, PenLine, Type, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import GlobalMarkdown from './GlobalMarkdown';
import 'katex/dist/katex.min.css';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { deductCoins, getCoins, isProUser } from '../utils/coins';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { showToast } from '../utils/toast';
import { takeNativePhoto } from '../utils/mobilePicker';

interface ChatMessage {
  role: 'user' | 'model';
  text?: string;
  imageUrl?: string;
  isError?: boolean;
}

const LANGUAGES = [
  { name: 'Hindi', native: 'हिंदी', flag: '🇮🇳' },
  { name: 'English', native: 'English', flag: '🇬🇧' },
  { name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { name: 'French', native: 'Français', flag: '🇫🇷' },
  { name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  { name: 'Arabic', native: 'العربية', flag: '🇸🇦' },
  { name: 'Bengali', native: 'বাংলা', flag: '🇧🇩' },
  { name: 'Sanskrit', native: 'संस्कृत', flag: '🇮🇳' },
  { name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { name: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' }
];

interface MagicScannerProps {
  isVip: boolean;
  isFocused?: boolean;
  onNavigateToTab?: (tab: string) => void;
}

function useIsFocused(isFocusedProp: boolean) {
  const [isFocused, setIsFocused] = useState(isFocusedProp);
  useEffect(() => {
    setIsFocused(isFocusedProp);
  }, [isFocusedProp]);
  return isFocused;
}

export default function MagicScanner({ isVip, isFocused: isFocusedProp = true, onNavigateToTab }: MagicScannerProps) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    Network.getStatus().then((status) => {
      setIsOffline(!status.connected);
    }).catch(err => {
      console.warn("MagicScanner: Failed to get initial network status", err);
    });

    const listener = Network.addListener('networkStatusChange', (status) => {
      setIsOffline(!status.connected);
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  const isFocused = useIsFocused(isFocusedProp);
  const [appVisible, setAppVisible] = useState(true);
  const [isPremium, setIsPremium] = useState(isVip || isProUser());

  useEffect(() => {
    setIsPremium(isVip || isProUser());
  }, [isVip]);

  useEffect(() => {
    const handleVipUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsPremium(customEvent.detail === true || isProUser());
    };
    window.addEventListener('study-vip-updated', handleVipUpdate);
    return () => {
      window.removeEventListener('study-vip-updated', handleVipUpdate);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setAppVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [chatDocId, setChatDocId] = useState<string | null>(null);

  const [viewportBottomOffset, setViewportBottomOffset] = useState(0);

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
  
  // States for Keyboard & Voice Dictation
  const [initialInput, setInitialInput] = useState('');
  const [isListeningInitial, setIsListeningInitial] = useState(false);
  const [isListeningChat, setIsListeningChat] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [activeMode, setActiveMode] = useState('Math');
  const [inputType, setInputType] = useState<'Handwritten' | 'Printed'>('Printed');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // States for Language Translation Selection
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('Hindi');

  // Mobile Torch (Flashlight) State
  const [torchOn, setTorchOn] = useState(false);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const bottomPanelRef = useRef<HTMLDivElement>(null);
  
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const subjectRefs = useRef<{[key: string]: HTMLButtonElement | null}>({});

  useEffect(() => {
    if (activeMode && subjectRefs.current[activeMode] && categoryScrollRef.current) {
      const button = subjectRefs.current[activeMode];
      const container = categoryScrollRef.current;
      if (button) {
        const buttonLeft = button.offsetLeft;
        const buttonWidth = button.offsetWidth;
        const containerWidth = container.offsetWidth;
        const scrollLeft = buttonLeft - (containerWidth / 2) + (buttonWidth / 2);
        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth'
        });
      }
    }
  }, [activeMode]);

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showLanguageSelector) {
        e.preventDefault();
        triggerVibration(10);
        setShowLanguageSelector(false);
      } else if (imagePreview || messages.length > 0) {
        e.preventDefault();
        triggerVibration(10);
        resetScanner();
      } else if (cameraActive) {
        e.preventDefault();
        triggerVibration(10);
        setCameraActive(false);
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [showLanguageSelector, imagePreview, messages, cameraActive]);
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      // If the app is not visible or the screen is not focused, don't run camera stream
      if (!isFocused || !appVisible) {
        setCameraActive(false);
        return;
      }
      // Do not run camera stream when showing preview
      if (imagePreview) return;
      try {
        // REQUEST NATIVE PERMISSION: Check first, then request if needed (Android JIT flow)
        if (Capacitor.isNativePlatform()) {
          console.log("[Capacitor Camera] Checking native camera permissions...");
          const checkStatus = await Camera.checkPermissions();

          if (checkStatus.camera === 'denied') {
            // Permission was previously denied — redirect to Settings
            showToast("Camera Permission Blocked: Please enable Camera in Device Settings → Apps → HelpYou AI", "warning", 4500);
            setCameraActive(false);
            return;
          }

          if (checkStatus.camera !== 'granted') {
            // Not yet asked — show the OS dialog
            console.log("[Capacitor Camera] Requesting native camera permissions...");
            const reqStatus = await Camera.requestPermissions({ permissions: ['camera'] });
            if (reqStatus.camera !== 'granted') {
              showToast("Camera Permission Needed: Please allow camera access to scan and solve questions.", "warning", 4000);
              setCameraActive(false);
              return;
            }
          }
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        setTorchOn(false); // Reset torch state when restarting camera
      } catch (err: any) {
        console.warn("Camera access denied or unavailable", err);
        if (err.name === 'NotAllowedError') {
           showToast("Camera Permission Required: Please allow camera access in settings to use the Scanner.", "warning", 4000);
        }
        setCameraActive(false);
      }
    };
    
    startCamera();
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [imagePreview, isFocused, appVisible]); // Restart/stop camera when transitioning to preview, focus state, or app state

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          if (isListeningInitial) {
            setInitialInput(prev => prev + (prev ? ' ' : '') + finalTranscript);
          } else if (isListeningChat) {
            setChatInput(prev => prev + (prev ? ' ' : '') + finalTranscript);
          }
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech recognition error:", e);
        setIsListeningInitial(false);
        setIsListeningChat(false);
      };

      rec.onend = () => {
        setIsListeningInitial(false);
        setIsListeningChat(false);
      };

      recognitionRef.current = rec;
    }
  }, [isListeningInitial, isListeningChat]);

  const toggleListeningInitial = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListeningInitial) {
      recognitionRef.current.stop();
      setIsListeningInitial(false);
    } else {
      if (isListeningChat) {
        recognitionRef.current.stop();
        setIsListeningChat(false);
      }
      try {
        setIsListeningInitial(true);
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const toggleListeningChat = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListeningChat) {
      recognitionRef.current.stop();
      setIsListeningChat(false);
    } else {
      if (isListeningInitial) {
        recognitionRef.current.stop();
        setIsListeningInitial(false);
      }
      try {
        setIsListeningChat(true);
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleInitialTextSubmit = async () => {
    if (!initialInput.trim() || loading) return;

    // ELITE ROUTING LOGIC: Pro vs Free
    if (isProUser()) {
      // PRO: Bypass all limits
    } else {
      // FREE: Check coins balance
      const coins = getCoins();
      if (coins < 1) {
        // BLOCK & TRIGGER PAYWALL
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: `${activeMode} Assistant`, cost: 1 } }));
        return;
      }
    }

    const queryText = initialInput;
    setInitialInput('');
    if (isListeningInitial && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    // Switch tab to AI Tutor ('aitutor')
    if (onNavigateToTab) {
      onNavigateToTab('aitutor');
    }

    // Dispatch the text query to the AI Tutor tab via custom event
    setTimeout(() => {
      const event = new CustomEvent('study-scanner-send-to-tutor', {
        detail: {
          text: queryText,
          imageFile: null
        }
      });
      window.dispatchEvent(event);
    }, 150);
  };

  const triggerQuickAction = async (text: string) => {
    if (chatLoading || loading) return;
    setChatLoading(true);
    setMessages(prev => [...prev, { role: 'user', text }]);

    try {
      const formData = new FormData();
      formData.append('message', text);
      formData.append('mode', activeMode);
      formData.append('gradeLevel', localStorage.getItem('academic_grade') || '11th Grade (Junior)');
      if (activeMode === 'Translate' && selectedLanguage) {
        formData.append('targetLanguage', selectedLanguage);
      }
      
      const formattedHistory = [...messages, { role: 'user' as const, text }].map(m => {
        if (m.text) return { role: m.role, parts: [{ text: m.text }] };
        if (m.imageUrl) return { role: m.role, parts: [] };
        return null;
      }).filter(Boolean);
      
      formData.append('history', JSON.stringify(formattedHistory));

      const firstImage = messages.find(m => m.imageUrl)?.imageUrl;
      if (firstImage && firstImage !== "placeholder_for_text_only") {
        const blob = await (await fetch(firstImage)).blob();
        formData.append('image', blob, 'image.jpg');
      }

      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/chat', {
        method: 'POST',
        body: formData,
      });
      
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.");
      }

      if (!response.ok) throw new Error("Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.");
      
      const data = await response.json();
      
      // Auto-detect and log student misconceptions or common traps in scanner responses
      detectAndLogMistake('Scan', text, data.text).catch(e => console.error("Scanner mistake capture failed:", e));

      const updatedMessages = [...messages, { role: 'user' as const, text }, { role: 'model' as const, text: data.text }];
      setMessages(updatedMessages);

      if (auth.currentUser && chatDocId) {
        try {
          const combinedText = updatedMessages
            .filter(m => m.text)
            .map(m => `**${m.role === 'user' ? 'You' : 'AI'}**: ${m.text}`)
            .join('\n\n');
          await updateDoc(doc(db, 'pocket_items', chatDocId), {
            text: combinedText
          });
        } catch (e) {
          console.error("Failed to update firestore", e);
        }
      }
    } catch (err) {
      console.error(err);
      let errorMessage = "Oops! Something went wrong on our end. Please try again.";
      setMessages(prev => [...prev, { role: 'model', text: errorMessage, isError: true }]);
    } finally {
      setChatLoading(false);
    }
  };

  const processFile = async (file: File) => {
    // ELITE ROUTING LOGIC: Pro vs Free
    if (isProUser()) {
      // PRO: Bypass
    } else {
      // FREE: Check coins balance
      const coins = getCoins();
      if (coins < 1) {
        // BLOCK & TRIGGER PAYWALL
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: `${activeMode} Scanner`, cost: 1 } }));
        return;
      }
    }

    // 2. Map mode to elegant educational prompt text
    let promptMessage = `Please solve this ${activeMode} problem step-by-step with clear explanations.`;
    if (activeMode === 'Summary') {
      promptMessage = "Please summarize this scanned text or image in detail with key bullet points.";
    } else if (activeMode === 'Math') {
      promptMessage = "Please solve this math problem step-by-step with clear explanations.";
    } else if (activeMode === 'Physics') {
      promptMessage = "Please solve this physics problem step-by-step with formulas and SI units.";
    } else if (activeMode === 'Chemistry') {
      promptMessage = "Please solve this chemistry problem step-by-step with detailed equations or mechanisms.";
    } else if (activeMode === 'Biology') {
      promptMessage = "Please solve this biology problem or explain this biological concept/diagram with detailed functional explanations.";
    } else if (activeMode === 'Others') {
      promptMessage = "Please explain or solve this problem step-by-step with clear, helpful educational explanations.";
    }

    // 3. Switch tab to AI Tutor ('aitutor')
    if (onNavigateToTab) {
      onNavigateToTab('aitutor');
    }

    // 4. Dispatch the scanned image file & prompt message to the AI Tutor tab
    setTimeout(() => {
      const event = new CustomEvent('study-scanner-send-to-tutor', {
        detail: {
          text: promptMessage,
          imageFile: file,
          subject: activeMode,
          handwritten: inputType === 'Handwritten'
        }
      });
      window.dispatchEvent(event);
    }, 150);
  };

  const toggleTorch = async () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities() as any;
          const nextTorchState = !torchOn;
          if (capabilities && capabilities.torch) {
            await track.applyConstraints({
              advanced: [{ torch: nextTorchState } as any]
            });
            setTorchOn(nextTorchState);
          } else {
            await track.applyConstraints({
              advanced: [{ torch: nextTorchState } as any]
            });
            setTorchOn(nextTorchState);
          }
        } catch (err) {
          console.warn("Torch constraints not fully supported", err);
          setTorchOn(!torchOn);
        }
      }
    } else {
      setTorchOn(!torchOn);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleNativeCapture = async () => {
    try {
      const picked = await takeNativePhoto();
      if (picked) {
        if ('error' in picked) {
          if (picked.error === 'blocked') {
            showToast("Camera Permission Blocked: Please enable Camera in Device Settings → Apps → HelpYou AI", "warning", 4500);
          } else if (picked.error === 'denied') {
            showToast("Camera Permission Needed: Please allow camera access to scan questions.", "warning", 4000);
          }
        } else {
          processFile(picked.fileObj);
        }
      }
    } catch (err) {
      console.warn("Native capture cancelled or failed:", err);
    }
  };

  const handleCapture = () => {
    if (Capacitor.isNativePlatform()) {
      handleNativeCapture();
      return;
    }
    if (videoRef.current) {
      const video = videoRef.current;
      const sWidth = video.videoWidth || 1280;
      const sHeight = video.videoHeight || 720;

      // Draw the full video frame onto a canvas
      const canvas = document.createElement('canvas');
      canvas.width = sWidth;
      canvas.height = sHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, sWidth, sHeight);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
            processFile(file);
          }
        }, 'image/jpeg', 0.85); // compress to optimize upload size
      }
    } else {
      fileInputRef.current?.click();
    }
  };

    const wordCount = chatInput.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleRetryMessage = async () => {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      const originalText = lastUserMsg.text || '';
      
      setMessages(prev => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'model') {
          return prev.slice(0, -1);
        }
        return prev;
      });
      
      await handleSendMessage(originalText);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToUse = customText !== undefined ? customText : chatInput;
    if (!textToUse.trim() || chatLoading) return;
    
    const newMsg = textToUse;
    if (customText === undefined) {
      setChatInput('');
    }
    setMessages(prev => [...prev, { role: 'user', text: newMsg }]);
    setChatLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', newMsg);
      formData.append('mode', activeMode);
      formData.append('gradeLevel', localStorage.getItem('academic_grade') || '11th Grade (Junior)');
      if (activeMode === 'Translate' && selectedLanguage) {
        formData.append('targetLanguage', selectedLanguage);
      }
      
      const formattedHistory = messages.map(m => {
        if (m.text) return { role: m.role, parts: [{ text: m.text }] };
        if (m.imageUrl) return { role: m.role, parts: [] }; // preserved for image attachment
        return null;
      }).filter(Boolean);
      
      formData.append('history', JSON.stringify(formattedHistory));

      const firstImage = messages.find(m => m.imageUrl)?.imageUrl;
      if (firstImage && firstImage !== "placeholder_for_text_only") {
        const blob = await (await fetch(firstImage)).blob();
        formData.append('image', blob, 'image.jpg');
      }

      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/chat', {
        method: 'POST',
        body: formData,
      });
      
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.");
      }

      if (!response.ok) throw new Error("Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.");
      
      const data = await response.json();
      
      // Auto-detect and log student misconceptions or common traps in scanner responses
      detectAndLogMistake('Scan', newMsg, data.text).catch(e => console.error("Scanner mistake capture failed:", e));

      const updatedMessages = [...messages, { role: 'user' as const, text: newMsg }, { role: 'model' as const, text: data.text }];
      setMessages(updatedMessages);

      if (auth.currentUser && chatDocId) {
        try {
          const combinedText = updatedMessages
            .filter(m => m.text)
            .map(m => `**${m.role === 'user' ? 'You' : 'AI'}**: ${m.text}`)
            .join('\n\n');
          await updateDoc(doc(db, 'pocket_items', chatDocId), {
            text: combinedText
          });
        } catch (e) {
          console.error("Failed to update firestore", e);
        }
      }
    } catch (err) {
      console.error(err);
      let errorMessage = "Oops! Something went wrong on our end. Please try again.";
      setMessages(prev => [...prev, { role: 'model', text: errorMessage, isError: true }]);
    } finally {
      setChatLoading(false);
    }
  };

  const resetScanner = () => {
    setImagePreview(null);
    setMessages([]);
    setChatDocId(null);
  };

  if (imagePreview) {
    return (
      <div 
        className="flex flex-col h-full bg-[#FAF9F6] relative text-zinc-900 transition-all duration-100"
        style={{ paddingBottom: viewportBottomOffset > 0 ? `${viewportBottomOffset + 120}px` : '96px' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 bg-white sticky top-0 z-10 shadow-sm">
          <h2 className="font-bold text-lg text-zinc-850 flex items-center">
            <Calculator className="w-5 h-5 text-purple-600 mr-2" />
            AI Tutor Chat
          </h2>
          <button onClick={resetScanner} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.map((msg, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[92%] rounded-3xl p-5 ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white shadow-md rounded-tr-none' 
                  : msg.isError
                    ? 'bg-red-50/90 border border-red-200 text-red-950 shadow-md rounded-tl-none overflow-hidden'
                    : 'bg-white border border-zinc-200 text-zinc-800 shadow-md rounded-tl-none overflow-hidden'
              }`}>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Scanned problem" className="max-w-full h-auto rounded-xl mb-3 shadow-sm border border-zinc-200" />
                )}
                {msg.text && (
                  <div className={`prose prose-sm max-w-none break-words ${msg.role === 'user' ? 'text-white prose-invert' : msg.isError ? 'text-red-900 font-medium' : 'text-zinc-800'} [&_pre]:overflow-x-auto [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2 [&_p]:leading-relaxed`}>
                    {msg.isError && <span className="inline-flex items-center gap-1 text-red-600 font-extrabold mr-1">⚠️ Alert: </span>}
                    {(() => {
                      const cleanText = msg.text.replace(/\[SUGGESTION:\s*([^\]]+)\]/g, '').trim();
                      let parsed = null;
                      if (msg.role === 'model' && (cleanText.startsWith('{') || cleanText.includes('solution_steps'))) {
                        try {
                          parsed = JSON.parse(cleanText);
                        } catch (e) {
                          let cleaned = cleanText;
                          if (cleaned.includes('```')) {
                            cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
                            try { parsed = JSON.parse(cleaned); } catch (err) {}
                          }
                          if (!parsed) {
                            const start = cleaned.indexOf('{');
                            const end = cleaned.lastIndexOf('}');
                            if (start !== -1 && end !== -1 && end > start) {
                              try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch (err) {}
                            }
                          }
                        }
                      }

                      if (parsed) {
                        return (
                          <div className="space-y-4 text-zinc-800">
                            {parsed.topic_title && (
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 uppercase tracking-wide">
                                  Topic
                                </span>
                                <h3 className="text-base font-bold text-zinc-950 m-0 leading-tight">
                                  {parsed.topic_title}
                                </h3>
                              </div>
                            )}
                            <div className="space-y-3">
                              {Array.isArray(parsed?.solution_steps) && parsed.solution_steps.map((step: any, sIdx: number) => (
                                <div 
                                  key={sIdx} 
                                  className={`p-4 rounded-2xl border transition-all duration-200 bg-white shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] ${
                                    step.is_final_answer 
                                      ? 'border-emerald-200 bg-emerald-50/20' 
                                      : 'border-zinc-150 bg-white'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b border-dashed border-zinc-100">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                      step.is_final_answer 
                                        ? 'bg-emerald-100 text-emerald-800' 
                                        : 'bg-zinc-100 text-zinc-700'
                                    }`}>
                                      Step {step.step_id || (sIdx + 1)}
                                    </span>
                                    {step.title && (
                                      <span className="text-xs font-bold text-zinc-800 shrink-0">
                                        {step.title}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-zinc-850 leading-relaxed overflow-x-auto">
                                    <GlobalMarkdown>{step.content}</GlobalMarkdown>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return <GlobalMarkdown>{cleanText}</GlobalMarkdown>;
                    })()}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {messages.length > 0 && messages[messages.length - 1].role === 'model' && !chatLoading && !loading && (() => {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.isError) {
              return (
                <div className="flex flex-wrap gap-2 pt-2 justify-start pl-2">
                  <button
                    onClick={handleRetryMessage}
                    className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-500/30 px-4 py-2 rounded-full transition-all flex items-center gap-1.5 font-bold shadow-md shadow-purple-500/20 active:scale-95 cursor-pointer"
                  >
                    <span>🔄</span> Try Again
                  </button>
                </div>
              );
            }
            return null;
          })()}
          {(loading || chatLoading) && (
            <div className="flex justify-start">
              <div className="bg-white border border-zinc-200 rounded-3xl p-4 rounded-tl-none flex items-center space-x-2 shadow-sm">
                <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                <span className="text-sm text-zinc-500 font-medium">AI is thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div 
          className="p-4 bg-[#FAF9F6] border-t border-zinc-200 sticky z-20 transition-all duration-100 ease-out"
          style={{ bottom: viewportBottomOffset > 0 ? `${viewportBottomOffset + 10}px` : '0px' }}
        >
          <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-zinc-200 focus-within:border-purple-500/50 focus-within:ring-2 focus-within:ring-purple-500/20 transition-all shadow-sm w-full">
            
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={isOffline}
                onKeyDown={e => e.key === 'Enter' && !isOffline && handleSendMessage()}
                placeholder={isOffline ? "You are offline. Reconnect to ask." : "Ask a follow-up question..."}
                className="flex-1 bg-transparent border-none focus:outline-none text-zinc-800 placeholder:text-zinc-400 py-2 text-sm min-w-0 disabled:cursor-not-allowed"
              />
              <span className={`text-[10px] font-semibold shrink-0 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-full select-none ${'text-zinc-400'}`}>
                {wordCount} words
              </span>
            </div>

            <button 
              onClick={toggleListeningChat}
              disabled={isOffline}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 shadow-md ${isOffline ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed' : isListeningChat ? 'bg-red-50 text-red-500 border border-red-200' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500'}`}
            >
              {isListeningChat ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
            </button>

            <button 
              onClick={() => handleSendMessage()}
              disabled={!chatInput.trim() || chatLoading || isOffline}
              className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white disabled:opacity-50 hover:bg-purple-500 transition-colors shrink-0 shadow-md"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        className="hidden" 
        ref={cameraInputRef}
        onChange={handleFileUpload}
      />

      {/* 1. Camera & Frame Wrapper (Takes up the entire available vertical space absolutely) */}
      <div ref={videoContainerRef} className="absolute inset-0 w-full h-full z-0 bg-black overflow-hidden">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover opacity-100"
        />
      </div>

      {/* 2. Floating Top Overlay (back button) */}
      <div className="absolute top-0 left-0 w-full z-50 pointer-events-auto p-6 flex justify-between items-center bg-gradient-to-b from-black/55 via-black/25 to-transparent">
        <button 
          onClick={() => {
            triggerVibration(15);
            if (onNavigateToTab) onNavigateToTab('notes');
          }}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-95 transition-all shadow-lg hover:bg-black/60"
          title="Back to Home"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* 3. Floating Bottom Overlay Panel */}
      <div 
        ref={bottomPanelRef}
        className="absolute bottom-0 left-0 w-full z-50 pointer-events-auto pb-safe pt-12 flex flex-col items-center gap-6 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
      >
        
        {/* Swipeable Premium Category Selector */}
        <div 
          ref={categoryScrollRef}
          className="w-full flex justify-start sm:justify-center items-center gap-x-8 overflow-x-auto whitespace-nowrap scrollbar-none px-8 py-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {['Math', 'Physics', 'Chemistry', 'Biology', 'Summary', 'Others'].map((m) => (
            <button 
              key={m}
              ref={(el) => {
                subjectRefs.current[m] = el;
              }}
              onClick={() => {
                setActiveMode(m);
                triggerVibration(15); // Light haptic feedback
              }}
              className={`transition-all duration-300 relative pb-2 transform ${
                activeMode === m 
                  ? 'text-white font-extrabold text-[15px] sm:text-base scale-110 drop-shadow-[0_2px_15px_rgba(236,72,153,0.8)] tracking-wider' 
                  : 'text-white/40 font-normal text-xs scale-90 hover:text-white/80'
              }`}
            >
              {m}
              {activeMode === m && (
                <motion.div 
                  layoutId="activeMode" 
                  className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-600 rounded-full shadow-[0_0_15px_#f43f5e,_0_0_5px_#d946ef]" 
                />
              )}
            </button>
          ))}
        </div>

        {/* Actions Row (Upload, Capture, Flashlight) */}
        <div className="w-full px-12 flex justify-between items-center">
          <button 
            onClick={async () => {
              if (isOffline) return;
              triggerVibration(15);
              if (Capacitor.isNativePlatform()) {
                try {
                  const image = await Camera.getPhoto({
                    quality: 90,
                    allowEditing: false,
                    resultType: CameraResultType.Uri,
                    source: CameraSource.Photos,
                  });
                  if (image && image.webPath) {
                    const response = await fetch(image.webPath);
                    const blob = await response.blob();
                    const file = new File([blob], `gallery_${Date.now()}.${image.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
                    processFile(file);
                  }
                } catch (err) {
                  console.warn("Native gallery picker failed or cancelled:", err);
                }
              } else {
                fileInputRef.current?.click();
              }
            }}
            disabled={isOffline}
            className={`w-12 h-12 rounded-full backdrop-blur-xl border flex items-center justify-center text-white active:scale-90 transition-transform ${isOffline ? 'bg-zinc-800/40 border-zinc-700/30 text-zinc-500 cursor-not-allowed opacity-40' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
          >
            <ImageIcon className="w-5 h-5" strokeWidth={1.5} />
          </button>

          {/* Premium magenta capture button */}
          {(() => {
            const btnClass = isOffline 
              ? "border-zinc-700/50 cursor-not-allowed opacity-40" 
              : "border-pink-400 shadow-[0_0_25px_rgba(236,72,153,0.5)] hover:shadow-[0_0_35px_rgba(236,72,153,0.7)]";
            const childClass = isOffline 
              ? "bg-zinc-800 text-zinc-500" 
              : "bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 text-white shadow-inner";
            let IconComponent = <GraduationCap className="w-8 h-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />;

            if (activeMode === 'Summary') {
              IconComponent = <BookOpen className="w-8 h-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />;
            } else if (activeMode === 'Math') {
              IconComponent = <Calculator className="w-8 h-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />;
            } else if (activeMode === 'Physics') {
              IconComponent = <Zap className="w-8 h-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />;
            } else if (activeMode === 'Chemistry') {
              IconComponent = <GraduationCap className="w-8 h-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />;
            } else if (activeMode === 'Biology') {
              IconComponent = <Brain className="w-8 h-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />;
            } else if (activeMode === 'Others') {
              IconComponent = <HelpCircle className="w-8 h-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />;
            }

            return (
              <button 
                onClick={() => {
                  if (isOffline) return;
                  triggerVibration(45); // Solid haptic vibration (medium impact)
                  handleCapture();
                }}
                disabled={isOffline}
                className={`w-20 h-20 rounded-full border-[3px] p-1 active:scale-95 transition-all group flex items-center justify-center ${btnClass}`}
                title={isOffline ? "Scanner Offline" : `Capture & Solve - ${activeMode}`}
              >
                <div className={`w-full h-full rounded-full flex items-center justify-center transition-all ${childClass}`}>
                  {IconComponent}
                </div>
              </button>
            );
          })()}

          <button 
            onClick={() => {
              triggerVibration(15);
              toggleTorch();
            }}
            className={`w-12 h-12 rounded-full backdrop-blur-xl border flex items-center justify-center active:scale-90 transition-transform ${
              torchOn 
                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.4)] animate-pulse' 
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            <Zap className="w-5 h-5" strokeWidth={1.5} fill={torchOn ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Elegant Input Type Toggle Pill */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              triggerVibration(15); // Light haptic feedback
              setInputType(prev => prev === 'Printed' ? 'Handwritten' : 'Printed');
            }}
            className="px-4 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/20 text-white flex items-center gap-2 hover:bg-black/60 hover:border-white/30 transition-all duration-300 shadow-lg text-[11px] font-bold animate-fade-in"
          >
            {inputType === 'Handwritten' ? (
              <>
                <PenLine className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                <span>Handwritten Mode</span>
              </>
            ) : (
              <>
                <Type className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>Printed Text Mode</span>
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
}
