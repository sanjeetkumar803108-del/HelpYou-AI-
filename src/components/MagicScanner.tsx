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
  const isFocused = useIsFocused(isFocusedProp);
  const [appVisible, setAppVisible] = useState(true);

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [activeMode, setActiveMode] = useState('Math');
  const [inputType, setInputType] = useState<'Handwritten' | 'Printed'>('Printed');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // States for Language Translation Selection
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('Hindi');

  // Interactive Image Cropper States
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 });
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const dragStartRef = useRef<{ clientX: number, clientY: number, x: number, y: number, w: number, h: number } | null>(null);
  const cropperContainerRef = useRef<HTMLDivElement>(null);

  // Mobile Torch (Flashlight) State
  const [torchOn, setTorchOn] = useState(false);

  // Live Scanner Frame States
  const [scannerFrame, setScannerFrame] = useState({ top: 20, left: 6, right: 6, height: 224 }); // 224px is 56 * 4 approx
  const [activeScannerDrag, setActiveScannerDrag] = useState<string | null>(null);
  const scannerDragStartRef = useRef<{ clientX: number, clientY: number, top: number, left: number, right: number, height: number } | null>(null);

  const cropBoxRef = useRef<HTMLDivElement>(null);
  
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
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      // If the app is not visible or the screen is not focused, don't run camera stream
      if (!isFocused || !appVisible) {
        setCameraActive(false);
        return;
      }
      // Do not run camera stream when showing preview or cropping
      if (imagePreview || imageToCrop) return;
      try {
        // Trigger native OS prompt simulation for first-time access
        if (!(window as any).hasRequestedCamera) {
          (window as any).hasRequestedCamera = true;
          console.log("Triggering native OS prompt for Camera access...");
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
           alert("Camera Permission Required\n\nPlease allow camera access in your settings to use the Scan feature.");
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
  }, [imagePreview, imageToCrop, isFocused, appVisible]); // Restart/stop camera when transitioning to preview, cropper, focus state, or app state

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
      if (coins > 0) {
        // Deduct 1 coin and continue
        deductCoins(1, `${activeMode} Question`);
      } else {
        // BLOCK & TRIGGER PAYWALL
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: `${activeMode} Assistant` } }));
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
      let errorMessage = "Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.";
      if (err instanceof Error && (err.message.includes("breather") || err.message.includes("Oops") || err.message.includes("Try Again"))) {
        errorMessage = err.message;
      }
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
      if (coins > 0) {
        deductCoins(1, `${activeMode} Scan`);
      } else {
        // BLOCK & TRIGGER PAYWALL
        window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: `${activeMode} Scanner` } }));
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

  const handleScannerPointerDown = (e: React.PointerEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    setActiveScannerDrag(type);
    scannerDragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      ...scannerFrame
    };
  };

  const handleScannerPointerMove = (e: React.PointerEvent) => {
    if (!activeScannerDrag || !scannerDragStartRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dy = e.clientY - scannerDragStartRef.current.clientY;
    const dx = e.clientX - scannerDragStartRef.current.clientX;

    const { top, left, right, height } = scannerDragStartRef.current;

    if (activeScannerDrag === 'move') {
      setScannerFrame({
        top: top + (dy / window.innerHeight * 100),
        left: left + (dx / window.innerWidth * 100),
        right: right - (dx / window.innerWidth * 100),
        height
      });
    } else if (activeScannerDrag === 'bottom') {
      setScannerFrame({
        top,
        left,
        right,
        height: Math.max(50, height + dy)
      });
    }
  };

  const handleScannerPointerUp = (e: React.PointerEvent) => {
    if (activeScannerDrag) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      setActiveScannerDrag(null);
      scannerDragStartRef.current = null;
    }
  };
  const handleCropPointerDown = (e: React.PointerEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    setActiveDrag(type);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      x: cropBox.x,
      y: cropBox.y,
      w: cropBox.w,
      h: cropBox.h
    };
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !dragStartRef.current || !cropperContainerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = cropperContainerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.clientX) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.clientY) / rect.height) * 100;

    let { x, y, w, h } = dragStartRef.current;
    const minSize = 10;

    if (activeDrag === 'move') {
      let nextX = x + dx;
      let nextY = y + dy;
      if (nextX < 0) nextX = 0;
      if (nextY < 0) nextY = 0;
      if (nextX + w > 100) nextX = 100 - w;
      if (nextY + h > 100) nextY = 100 - h;
      setCropBox({ x: nextX, y: nextY, w, h });
    } else {
      if (activeDrag.includes('left')) {
        let nextX = x + dx;
        let nextW = w - dx;
        if (nextX < 0) {
          nextW += nextX;
          nextX = 0;
        }
        if (nextW < minSize) {
          nextX = x + w - minSize;
          nextW = minSize;
        }
        x = nextX;
        w = nextW;
      }
      if (activeDrag.includes('right')) {
        let nextW = w + dx;
        if (x + nextW > 100) nextW = 100 - x;
        if (nextW < minSize) nextW = minSize;
        w = nextW;
      }
      if (activeDrag.includes('top')) {
        let nextY = y + dy;
        let nextH = h - dy;
        if (nextY < 0) {
          nextH += nextY;
          nextY = 0;
        }
        if (nextH < minSize) {
          nextY = y + h - minSize;
          nextH = minSize;
        }
        y = nextY;
        h = nextH;
      }
      if (activeDrag.includes('bottom')) {
        let nextH = h + dy;
        if (y + nextH > 100) nextH = 100 - y;
        if (nextH < minSize) nextH = minSize;
        h = nextH;
      }
      setCropBox({ x, y, w, h });
    }
  };

  const handleCropPointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      setActiveDrag(null);
      dragStartRef.current = null;
    }
  };

  const handlePerformCrop = () => {
    if (!imageToCrop) return;
    
    const img = new Image();
    img.src = imageToCrop;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const sx = (cropBox.x / 100) * img.naturalWidth;
        const sy = (cropBox.y / 100) * img.naturalHeight;
        const sWidth = (cropBox.w / 100) * img.naturalWidth;
        const sHeight = (cropBox.h / 100) * img.naturalHeight;

        // Downscale image if too large to optimize mobile upload speed & processing time
        const maxDimension = 1024;
        let targetWidth = sWidth;
        let targetHeight = sHeight;
        if (sWidth > maxDimension || sHeight > maxDimension) {
          if (sWidth > sHeight) {
            targetWidth = maxDimension;
            targetHeight = (sHeight / sWidth) * maxDimension;
          } else {
            targetHeight = maxDimension;
            targetWidth = (sWidth / sHeight) * maxDimension;
          }
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

        // Convert with compressed quality (0.8) for small file size and super-fast uploads
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "cropped_capture.jpg", { type: "image/jpeg" });
            setImageToCrop(null); // Close crop screen
            processFile(file);
          }
        }, 'image/jpeg', 0.8);
      }
    };
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
      const url = URL.createObjectURL(file);
      setImageToCrop(url);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && cameraActive) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      
      const sWidth = video.videoWidth;
      const sHeight = video.videoHeight;
      const maxDimension = 1024;
      let targetWidth = sWidth;
      let targetHeight = sHeight;
      
      if (sWidth > maxDimension || sHeight > maxDimension) {
        if (sWidth > sHeight) {
          targetWidth = maxDimension;
          targetHeight = (sHeight / sWidth) * maxDimension;
        } else {
          targetHeight = maxDimension;
          targetWidth = (sWidth / sHeight) * maxDimension;
        }
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setImageToCrop(url);
          }
        }, 'image/jpeg', 0.8);
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
      let errorMessage = "Oops! Our AI Tutor is analyzing a lot of questions right now and needs a quick breather. 😅 Please tap 'Try Again'.";
      if (err instanceof Error && (err.message.includes("breather") || err.message.includes("Oops") || err.message.includes("Try Again"))) {
        errorMessage = err.message;
      }
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
                              {parsed.solution_steps && parsed.solution_steps.map((step: any, sIdx: number) => (
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
                onKeyDown={e => e.key === 'Enter' && true && handleSendMessage()}
                placeholder="Ask a follow-up question..."
                className="flex-1 bg-transparent border-none focus:outline-none text-zinc-800 placeholder:text-zinc-400 py-2 text-sm min-w-0"
              />
              <span className={`text-[10px] font-semibold shrink-0 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-full select-none ${'text-zinc-400'}`}>
                {wordCount} words
              </span>
            </div>

            <button 
              onClick={toggleListeningChat}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 shadow-md ${isListeningChat ? 'bg-red-50 text-red-500 border border-red-200' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500'}`}
            >
              {isListeningChat ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
            </button>

            <button 
              onClick={() => handleSendMessage()}
              disabled={!chatInput.trim() || chatLoading || false}
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
    <div className="w-full h-full relative bg-[#FAF9F6] overflow-hidden">
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileUpload}
      />

      <div className="absolute inset-0 z-0 bg-black">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover opacity-80"
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            Camera unavailable. Use Gallery.
          </div>
        )}
      </div>

      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-10 pointer-events-none pb-24"
        >
          {/* Floating Premium 3D PRO Badge with Purple Glow */}
          <div className="absolute top-6 right-4 pointer-events-auto z-30">
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('open-vip-modal'))}
              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 border border-purple-400/50 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-[0_10px_25px_rgba(168,85,247,0.5),_inset_0_1px_1px_rgba(255,255,255,0.4)] hover:shadow-[0_15px_30px_rgba(168,85,247,0.7),_inset_0_1px_1px_rgba(255,255,255,0.6)] hover:scale-105 active:scale-95 duration-300 transition-all cursor-pointer group"
            >
              <span className="text-white font-[900] text-xs tracking-widest bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] uppercase">PRO</span>
              <div className="bg-white/10 rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-inner group-hover:rotate-12 transition-transform">
                🦉
              </div>
            </button>
          </div>

          <div className="absolute top-[12%] w-full flex justify-center z-20">
            <div className="bg-black/40 backdrop-blur-md border border-white/20 text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide shadow-lg">
              Position problem in frame
            </div>
          </div>

          {/* Minimalist crop box with rotating rainbow border, laser effect, and Google Lens thick L-shaped corner handles */}
          <div 
            ref={cropBoxRef} 
            className="absolute rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.6)] rainbow-scanner-box overflow-hidden z-20"
            style={{ top: `${scannerFrame.top}%`, left: `${scannerFrame.left}%`, right: `${scannerFrame.right}%`, height: scannerFrame.height }}
            onPointerDown={(e) => handleScannerPointerDown(e, 'move')}
            onPointerMove={handleScannerPointerMove}
            onPointerUp={handleScannerPointerUp}
          >
            {/* Ambient scan line laser effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/15 to-transparent animate-[pulse_2s_infinite] pointer-events-none" />
            
            {/* Google Lens corner L-shaped thick crop handles */}
            {/* Top Left */}
            <div className="absolute top-0 left-0 w-8 h-8 z-30">
              <div className="absolute top-0 left-0 w-8 h-[5px] bg-white rounded-tl-lg rounded-tr-sm"></div>
              <div className="absolute top-0 left-0 w-[5px] h-8 bg-white rounded-tl-lg rounded-bl-sm"></div>
            </div>
            {/* Top Right */}
            <div className="absolute top-0 right-0 w-8 h-8 z-30">
              <div className="absolute top-0 right-0 w-8 h-[5px] bg-white rounded-tr-lg rounded-tl-sm"></div>
              <div className="absolute top-0 right-0 w-[5px] h-8 bg-white rounded-tr-lg rounded-br-sm"></div>
            </div>
            {/* Bottom Left */}
            <div className="absolute bottom-0 left-0 w-8 h-8 z-30">
              <div className="absolute bottom-0 left-0 w-8 h-[5px] bg-white rounded-bl-lg rounded-br-sm"></div>
              <div className="absolute bottom-0 left-0 w-[5px] h-8 bg-white rounded-bl-lg rounded-tl-sm"></div>
            </div>
            {/* Bottom Right - Resizing Handle */}
            <div 
              className="absolute bottom-0 right-0 w-10 h-10 z-30 cursor-se-resize flex items-center justify-center"
              onPointerDown={(e) => handleScannerPointerDown(e, 'bottom')}
            >
              <div className="absolute bottom-0 right-0 w-8 h-[5px] bg-white rounded-br-lg rounded-bl-sm"></div>
              <div className="absolute bottom-0 right-0 w-[5px] h-8 bg-white rounded-br-lg rounded-tr-sm"></div>
            </div>
          </div>

          {/* Stacked Bottom Controls Panel - elevated to prevent overlap with bottom navigation tabs */}
          <div className="absolute bottom-[84px] left-0 right-0 flex flex-col items-center gap-6 pointer-events-none z-20">
            
            {/* Swipeable Premium Category Selector */}
            <div 
              ref={categoryScrollRef}
              className="w-full flex justify-start sm:justify-center items-center gap-x-8 overflow-x-auto whitespace-nowrap scrollbar-none pointer-events-auto px-8 py-2"
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
            <div className="w-full px-12 flex justify-between items-center pointer-events-auto">
              <button 
                onClick={() => {
                  triggerVibration(15);
                  fileInputRef.current?.click();
                }}
                className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform hover:bg-white/20"
              >
                <ImageIcon className="w-5 h-5" strokeWidth={1.5} />
              </button>

              {/* Premium magenta capture button */}
              {(() => {
                const btnClass = "border-pink-400 shadow-[0_0_25px_rgba(236,72,153,0.5)] hover:shadow-[0_0_35px_rgba(236,72,153,0.7)]";
                const childClass = "bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 text-white shadow-inner";
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
                      triggerVibration(45); // Solid haptic vibration (medium impact)
                      handleCapture();
                    }}
                    className={`w-20 h-20 rounded-full border-[3px] p-1 active:scale-95 transition-all group flex items-center justify-center ${btnClass}`}
                    title={`Capture & Solve - ${activeMode}`}
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
            <div className="flex justify-center pointer-events-auto">
              <button
                onClick={() => {
                  triggerVibration(15); // Light haptic feedback
                  setInputType(prev => prev === 'Printed' ? 'Handwritten' : 'Printed');
                }}
                className="px-4 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/20 text-white flex items-center gap-2 hover:bg-black/60 hover:border-white/30 transition-all duration-300 shadow-lg text-[11px] font-bold"
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
        </motion.div>
      </AnimatePresence>

      {/* INTERACTIVE IMAGE CROPPER OVERLAY */}
      <AnimatePresence>
        {imageToCrop && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/95 flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#121212]/95 backdrop-blur-md z-10">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setImageToCrop(null)}
                  className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Cancel"
                >
                  <X className="w-5 h-5" />
                </button>
                <span className="text-white font-bold text-base ml-1">Crop Image</span>
              </div>
              
              {/* Confirm icon to submit cropped image directly */}
              <button 
                onClick={handlePerformCrop}
                className="w-10 h-10 rounded-full bg-pink-500 hover:bg-pink-400 flex items-center justify-center text-white transition-all shadow-[0_0_15px_rgba(236,72,153,0.4)] active:scale-95"
                title="Confirm"
              >
                <Check className="w-5 h-5 stroke-[2.5px]" />
              </button>
            </div>

            {/* Crop Stage Container */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative min-h-0">
              <div 
                ref={cropperContainerRef}
                className="relative max-w-full max-h-[50vh] sm:max-h-[60vh] aspect-auto overflow-hidden select-none touch-none bg-black/50 rounded-2xl"
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerLeave={handleCropPointerUp}
              >
                {/* Main Image to Crop */}
                <img 
                  src={imageToCrop} 
                  alt="To crop" 
                  className="max-w-full max-h-[50vh] sm:max-h-[60vh] object-contain select-none pointer-events-none rounded-2xl" 
                />

                {/* Translucent overlays surrounding the crop box */}
                <div className="absolute bg-black/60 pointer-events-none" style={{ top: 0, left: 0, right: 0, height: `${cropBox.y}%` }} />
                <div className="absolute bg-black/60 pointer-events-none" style={{ bottom: 0, left: 0, right: 0, height: `${100 - cropBox.y - cropBox.h}%` }} />
                <div className="absolute bg-black/60 pointer-events-none" style={{ top: `${cropBox.y}%`, bottom: `${100 - cropBox.y - cropBox.h}%`, left: 0, width: `${cropBox.x}%` }} />
                <div className="absolute bg-black/60 pointer-events-none" style={{ top: `${cropBox.y}%`, bottom: `${100 - cropBox.y - cropBox.h}%`, right: 0, width: `${100 - cropBox.x - cropBox.w}%` }} />

                {/* Draggable Crop Rectangle */}
                <div 
                  style={{ 
                    left: `${cropBox.x}%`, 
                    top: `${cropBox.y}%`, 
                    width: `${cropBox.w}%`, 
                    height: `${cropBox.h}%` 
                  }}
                  className="absolute border-2 border-white shadow-[0_0_40px_rgba(0,0,0,0.5)] cursor-move flex flex-col justify-between"
                  onPointerDown={(e) => handleCropPointerDown(e, 'move')}
                >
                  {/* Grid layout for crop reference lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                    <div className="border-r border-dashed border-white/60 col-span-1" />
                    <div className="border-r border-dashed border-white/60 col-span-1" />
                    <div className="border-b border-dashed border-white/60 row-span-1 col-span-3 absolute left-0 right-0 top-[33.3%]" />
                    <div className="border-b border-dashed border-white/60 row-span-1 col-span-3 absolute left-0 right-0 top-[66.6%]" />
                  </div>

                  {/* Corner Grab Handles */}
                  <div 
                    className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white rounded-full border border-purple-600 cursor-nwse-resize z-10 active:scale-125 transition-transform" 
                    onPointerDown={(e) => handleCropPointerDown(e, 'top-left')}
                  />
                  <div 
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white rounded-full border border-purple-600 cursor-nesw-resize z-10 active:scale-125 transition-transform" 
                    onPointerDown={(e) => handleCropPointerDown(e, 'top-right')}
                  />
                  <div 
                    className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-white rounded-full border border-purple-600 cursor-nesw-resize z-10 active:scale-125 transition-transform" 
                    onPointerDown={(e) => handleCropPointerDown(e, 'bottom-left')}
                  />
                  <div 
                    className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white rounded-full border border-purple-600 cursor-nwse-resize z-10 active:scale-125 transition-transform" 
                    onPointerDown={(e) => handleCropPointerDown(e, 'bottom-right')}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="p-6 pb-12 md:pb-14 bg-[#121212]/95 backdrop-blur-md border-t border-white/10 flex gap-4 justify-center items-center w-full relative z-10">
              <button 
                onClick={() => setImageToCrop(null)}
                className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-sm transition-colors min-w-[120px]"
              >
                Cancel
              </button>
              <button 
                onClick={handlePerformCrop}
                className="px-8 py-3 rounded-full bg-gradient-to-r from-pink-600 via-fuchsia-600 to-purple-600 hover:from-pink-500 hover:via-fuchsia-500 hover:to-purple-500 text-white font-extrabold text-sm transition-colors shadow-lg shadow-pink-500/20 flex items-center justify-center gap-2 min-w-[160px]"
              >
                <Check className="w-5 h-5 text-white stroke-[2.5px]" />
                <span>Confirm</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
