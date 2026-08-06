import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Loader2, FilePlus, ChevronRight, ArrowLeft, Headphones, 
  CheckCircle2, Volume2, Play, Pause, AlertCircle, History, Trash2, Calendar, 
  RotateCcw, Sparkles, VolumeX, Download, RefreshCw, PenTool
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { deductCoins, getCoins } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { Capacitor } from '@capacitor/core';
import { pickNativeFiles } from '../utils/mobilePicker';

export default function NoteMaker({ onBack }: { onBack: () => void }) {
  // Navigation back handler
  const handleHeaderBack = () => {
    triggerVibration(10);
    if (showHistory) {
      setShowHistory(false);
    } else if (step !== 'initial') {
      resetState();
    } else {
      onBack();
    }
  };

  // State definitions
  const [file, setFile] = useState<File | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [inputMode, setInputMode] = useState<'pdf' | 'text'>('pdf');
  const [step, setStep] = useState<'initial' | 'uploading' | 'processing' | 'result'>('initial');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null); // This is the scrolling text transcript
  const [error, setError] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showHistory) {
        e.preventDefault();
        triggerVibration(10);
        setShowHistory(false);
      } else if (step === 'result') {
        e.preventDefault();
        triggerVibration(10);
        setStep('initial');
      }
    };
    window.addEventListener('appBackButton', handleBackButton);
    return () => window.removeEventListener('appBackButton', handleBackButton);
  }, [showHistory, step]);

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  
  // Custom Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isSpeechFallback, setIsSpeechFallback] = useState(false);
  const [isPlayingFallback, setIsPlayingFallback] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<any>(null);

  // History State
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Clean up speech synthesis and simulated progress interval on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Update playback speed for HTML5 audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioData]);

  // Local storage helpers for robust guest saving
  const saveLocalItem = (item: any) => {
    try {
      const raw = localStorage.getItem('notemaker_local_history');
      const existing = raw ? JSON.parse(raw) : [];
      const updated = [item, ...existing].slice(0, 30);
      localStorage.setItem('notemaker_local_history', JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to save to local storage:", err);
    }
  };

  const getLocalItems = () => {
    try {
      const raw = localStorage.getItem('notemaker_local_history');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return parsed.map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt)
      }));
    } catch (err) {
      console.error("Failed to fetch from local storage:", err);
      return [];
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      let items: any[] = [];
      if (auth.currentUser) {
        const q = query(
          collection(db, 'pocket_items'),
          where('userId', '==', auth.currentUser.uid),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Include note type where subType is 'audio'
          if (data.type === 'note' && data.subType === 'audio') {
            items.push({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(),
            });
          }
        });
      }

      // Merge local storage items for guests or hybrid persistence
      const localItems = getLocalItems();
      const mergedItems = [...items];
      
      for (const local of localItems) {
        if (!mergedItems.some(i => i.text === local.text || i.id === local.id)) {
          mergedItems.push(local);
        }
      }

      // Sort by newest first
      mergedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Limit to 20 items to prevent bloat
      const finalItems = mergedItems.slice(0, 20);
      setHistoryItems(finalItems);
    } catch (e) {
      console.error("Failed to load history, falling back to local:", e);
      setHistoryItems(getLocalItems());
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(15);
    try {
      if (id.startsWith('local_')) {
        const raw = localStorage.getItem('notemaker_local_history');
        if (raw) {
          const parsed = JSON.parse(raw);
          const filtered = parsed.filter((item: any) => item.id !== id);
          localStorage.setItem('notemaker_local_history', JSON.stringify(filtered));
        }
      } else {
        await deleteDoc(doc(db, 'pocket_items', id));
      }
      setHistoryItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 30 * 1024 * 1024) {
      setError("File is too large! Please select a PDF smaller than 30MB (Max 60 pages).");
      triggerVibration(20);
      return;
    }
    setFile(selected);
    setResult(null);
    setAudioData(null);
    setSaved(false);
  };

  // Unified Generation flow
  const processFile = async () => {
    if (!file && !inputText) return;

    // Check if user has at least 5 coins before starting, but do not deduct yet!
    const coins = getCoins();
    if (coins < 5) {
      window.dispatchEvent(new CustomEvent('open-paywall-modal', { detail: { featureName: "AI Audio Summary", cost: 5 } }));
      return;
    }

    // Clear any existing progress interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    setUploadProgress(0);
    setError(null);
    setStep('processing'); // Go directly to processing with progress bar
    
    // Clear speech synthesizer
    window.speechSynthesis.cancel();
    setIsSpeechFallback(false);
    setIsPlayingFallback(false);

    // Slowly increment progress from 0% to 90% over 12 seconds
    const intervalTime = 150; // every 150ms
    const totalDurationMs = 12000; // 12 seconds
    const incrementPerStep = 90 / (totalDurationMs / intervalTime); // ~1.125% per step

    progressIntervalRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          return 90;
        }
        return Math.min(prev + incrementPerStep, 90);
      });
    }, intervalTime);

    const formData = new FormData();
    formData.append('action', 'audio');
    if (file) {
      formData.append('pdf', file);
    } else {
      formData.append('text', inputText);
    }

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/summarize', true);
      xhr.timeout = 180000; // 3 minute timeout

      xhr.ontimeout = () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setUploadProgress(0);
        const timeoutMsg = "The request timed out. This often happens with very large files or slow connections. Please try a smaller PDF.";
        setResult(timeoutMsg);
        setError(timeoutMsg);
        setStep('initial');
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            
            // Deduct 5 coins now that the output has been successfully generated by the AI
            deductCoins(5, "AI Audio Summary");

            setResult(data.text);
            setError(null);
            
            // Generate descriptive title
            let itemTitle = file?.name;
            if (!itemTitle) {
              const words = inputText.trim().split(/\s+/).slice(0, 5).join(' ');
              itemTitle = words ? `Text: "${words}..."` : 'Pasted Text Extract';
            }

            // Save locally (initially without audio)
            const localId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const localItem = {
              id: localId,
              userId: auth.currentUser?.uid || null,
              type: 'note',
              subType: 'audio',
              text: data.text,
              audioData: null,
              title: itemTitle,
              createdAt: new Date().toISOString()
            };

            saveLocalItem(localItem);
            setCurrentSavedId(localId);
            setSaved(true);

            // Save to Firebase (initially without audio)
            let firebaseDocId: string | null = null;
            if (auth.currentUser) {
              try {
                const docRef = await addDoc(collection(db, 'pocket_items'), {
                  userId: auth.currentUser.uid,
                  type: 'note',
                  subType: 'audio',
                  text: data.text,
                  audioData: null,
                  title: itemTitle,
                  createdAt: serverTimestamp()
                });
                firebaseDocId = docRef.id;
                setCurrentSavedId(docRef.id);
                
                // Update state
                setHistoryItems(prev => {
                  const filtered = prev.filter(item => item.id !== localId);
                  const firebaseItem = {
                    ...localItem,
                    id: docRef.id,
                    createdAt: new Date()
                  };
                  return [firebaseItem, ...filtered];
                });
              } catch (e) {
                console.error("Firebase auto-save failed, kept local copy:", e);
                setHistoryItems(prev => [{ ...localItem, createdAt: new Date() }, ...prev]);
              }
            } else {
              setHistoryItems(prev => [{ ...localItem, createdAt: new Date() }, ...prev]);
            }

            // Success! Set progress to 100%, clear interval, and transition to result screen IMMEDIATELY
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            setUploadProgress(100);

            // Wait 800ms for user to enjoy 100% state, then show result!
            setTimeout(() => {
              setStep('result');
            }, 800);

            // Fetch TTS in the background, without blocking the UI transition
            setIsGeneratingAudio(true);
            (async () => {
              let fetchedAudio = null;
              try {
                const ttsResponse = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/tts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: data.text }),
                });
                if (!ttsResponse.ok) {
                  throw new Error("TTS failed");
                }
                const ttsContentType = ttsResponse.headers.get("content-type") || "";
                if (!ttsContentType.includes("application/json")) {
                  throw new Error("Invalid TTS response format");
                }
                const ttsData = await ttsResponse.json();
                if (ttsData.audio) {
                  if (ttsData.audio.startsWith('data:')) {
                    fetchedAudio = ttsData.audio;
                  } else {
                    fetchedAudio = `data:audio/wav;base64,${ttsData.audio}`;
                  }
                  setAudioData(fetchedAudio);

                  // Update the local history item with the fetched audio
                  try {
                    const raw = localStorage.getItem('notemaker_local_history');
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      const updated = parsed.map((item: any) => {
                        if (item.id === localId) {
                          return { ...item, audioData: fetchedAudio };
                        }
                        return item;
                      });
                      localStorage.setItem('notemaker_local_history', JSON.stringify(updated));
                    }
                  } catch (e) {
                    console.error("Failed to update local history audio:", e);
                  }

                  // Update Firebase document with the fetched audio
                  if (firebaseDocId) {
                    try {
                      await updateDoc(doc(db, 'pocket_items', firebaseDocId), {
                        audioData: fetchedAudio
                      });
                    } catch (e) {
                      console.error("Failed to update Firebase document audio:", e);
                    }
                  }
                } else {
                  setIsSpeechFallback(true);
                }
              } catch (ttsErr) {
                console.warn("API TTS failed, fallback to browser SpeechSynthesis:", ttsErr);
                setIsSpeechFallback(true);
              } finally {
                setIsGeneratingAudio(false);
              }
            })();

          } catch (err) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            setUploadProgress(0);
            const parseError = "Error parsing AI study briefing response. Please try again.";
            setResult(parseError);
            setError(parseError);
            setStep('initial');
          }
        } else {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setUploadProgress(0);
          try {
            let data: any = {};
            try {
              data = JSON.parse(xhr.responseText);
            } catch (e) {
              if (xhr.status === 429) {
                const rateLimitMsg = "⚠️ StudyAI Notice: Rate Limit Exceeded\n\nThe AI Summarizer is currently processing many requests. Please try again in a few seconds.";
                setResult(rateLimitMsg);
                setError(rateLimitMsg);
                setStep('initial');
                return;
              }
              throw e;
            }

            if (xhr.status === 429 && data.text) {
              setResult(data.text);
              setError(data.text);
            } else if (data.error) {
              setResult(`Error: ${data.error}`);
              setError(`Error: ${data.error}`);
            } else {
              const genericError = `Error: Server returned status ${xhr.status}`;
              setResult(genericError);
              setError(genericError);
            }
          } catch {
            const finalError = `Error: Server returned status ${xhr.status}`;
            setResult(finalError);
            setError(finalError);
          }
          setStep('initial');
        }
      };

      xhr.onerror = () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setUploadProgress(0);
        const networkError = "Network error occurred. The server may be busy. Please try again with a smaller file or pasted text.";
        setResult(networkError);
        setError(networkError);
        setStep('initial');
      };

      xhr.send(formData);
    } catch (err) {
      console.error(err);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUploadProgress(0);
      const catchError = "An error occurred during generation.";
      setResult(catchError);
      setError(catchError);
      setStep('initial');
    }
  };

  // HTML5 Audio element control handlers
  const togglePlay = () => {
    if (!audioRef.current) return;
    triggerVibration(10);
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Audio playback failed", err);
      });
    }
  };

  const skipForward10 = () => {
    if (!audioRef.current) return;
    triggerVibration(10);
    audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, duration);
  };

  const replay10 = () => {
    if (!audioRef.current) return;
    triggerVibration(10);
    audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0);
  };

  const cyclePlaybackRate = () => {
    triggerVibration(15);
    let nextRate = 1;
    if (playbackRate === 1) nextRate = 1.25;
    else if (playbackRate === 1.25) nextRate = 1.5;
    else nextRate = 1;
    setPlaybackRate(nextRate);
  };

  const handleSeekBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const seekTime = Number(e.target.value);
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // Speech Synthesis fallback control handlers
  const startSpeechFallback = () => {
    if (!result) return;
    triggerVibration(10);
    window.speechSynthesis.cancel();
    
    // Clean text to avoid speakable markup
    const cleanText = result.replace(/[*#_\-`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = playbackRate;
    
    utterance.onend = () => {
      setIsPlayingFallback(false);
    };
    utterance.onerror = () => {
      setIsPlayingFallback(false);
    };
    
    synthUtteranceRef.current = utterance;
    setIsPlayingFallback(true);
    window.speechSynthesis.speak(utterance);
  };

  const pauseSpeechFallback = () => {
    triggerVibration(10);
    window.speechSynthesis.pause();
    setIsPlayingFallback(false);
  };

  const resumeSpeechFallback = () => {
    triggerVibration(10);
    window.speechSynthesis.resume();
    setIsPlayingFallback(true);
  };

  const stopSpeechFallback = () => {
    triggerVibration(10);
    window.speechSynthesis.cancel();
    setIsPlayingFallback(false);
  };

  const resetState = () => {
    window.speechSynthesis.cancel();
    setIsSpeechFallback(false);
    setIsPlayingFallback(false);
    setFile(null);
    setInputText('');
    setInputMode('pdf');
    setResult(null);
    setAudioData(null);
    setSaved(false);
    setCurrentSavedId(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setStep('initial');
  };

  // Time formatter
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {/* STICKY HEADER BAR */}
      <div className="sticky top-0 bg-[#FAF9F6]/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200/80 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleHeaderBack}
            className="w-10 h-10 bg-white hover:bg-zinc-50 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 shadow-sm border border-zinc-200 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center tracking-tight line-clamp-1 text-zinc-900">
              <Headphones className="w-5 h-5 text-indigo-600 mr-2 shrink-0" />
              <span>AI Audio Summary</span>
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Convert heavy PDFs into engaging study audio briefs</p>
          </div>
        </div>

        <button 
          onClick={() => {
            triggerVibration(15);
            setShowHistory(!showHistory);
            if (!showHistory) fetchHistory();
          }}
          className={`w-10 h-10 rounded-full border shadow-sm flex items-center justify-center transition-all active:scale-95 shrink-0 ${
            showHistory 
              ? 'bg-indigo-600 text-white border-indigo-600' 
              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200/60'
          }`}
        >
          <History className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto momentum-scroll px-6 pt-6 pb-24 relative z-10">
        {showHistory ? (
          <div className="max-w-md mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-extrabold text-sm text-zinc-500 uppercase tracking-wider">Saved Audio Briefings</h3>
            </div>
            
            {loadingHistory ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 font-bold">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span>Loading briefings...</span>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-sm">
                <p className="text-3xl mb-2">🎙️</p>
                <p className="text-sm">No audio summaries found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      triggerVibration(15);
                      setResult(item.text);
                      setAudioData(item.audioData || null);
                      setIsSpeechFallback(!item.audioData);
                      setCurrentSavedId(item.id);
                      setSaved(true);
                      setStep('result');
                      setShowHistory(false);
                    }}
                    className="bg-white border border-zinc-200/80 hover:border-indigo-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                      <h4 className="font-black text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                        {item.title || 'Study Briefing'}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-zinc-400" />
                          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wide flex items-center gap-0.5">
                          <span>🎙️</span> Briefing
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {step === 'initial' && (
              <motion.div 
                key="initial"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-6 max-w-2xl mx-auto"
              >
                {error && (
                  <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4 text-left flex items-center gap-3 shadow-sm mb-2">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                    <span className="text-sm font-bold text-red-900 leading-relaxed">{error}</span>
                  </div>
                )}

                {/* Tab Selector */}
                <div className="flex bg-zinc-100 p-1 rounded-2xl border border-zinc-200 w-full max-w-sm mx-auto">
                  <button
                    onClick={() => { setInputMode('pdf'); setFile(null); }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${inputMode === 'pdf' ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                  >
                    <FileText className="w-4 h-4" />
                    Upload PDF
                  </button>
                  <button
                    onClick={() => { setInputMode('text'); setFile(null); }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${inputMode === 'text' ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                  >
                    <PenTool className="w-4 h-4" />
                    Paste Text Extract
                  </button>
                </div>

                {inputMode === 'pdf' ? (
                  <div className="space-y-4">
                    {!file ? (
                      <div 
                        className="h-56 rounded-[2rem] border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center bg-white p-6 text-center hover:border-indigo-300 hover:bg-indigo-50/10 transition-all cursor-pointer shadow-sm group"
                        onClick={async () => {
                          if (Capacitor.isNativePlatform()) {
                            try {
                              const picked = await pickNativeFiles({ types: 'pdf', multiple: false });
                              if (picked && picked.length > 0) {
                                const fileObj = picked[0].fileObj;
                                if (fileObj.size > 30 * 1024 * 1024) {
                                  setError("File is too large! Please select a PDF smaller than 30MB.");
                                  triggerVibration(20);
                                  return;
                                }
                                setFile(fileObj);
                                setResult(null);
                                setAudioData(null);
                                setSaved(false);
                              }
                            } catch (err) {
                              console.error("Native file picker failed", err);
                              setError("Failed to open native file picker");
                            }
                          } else {
                            fileInputRef.current?.click();
                          }
                        }}
                      >
                        <div className="w-16 h-16 bg-indigo-50 group-hover:scale-110 group-hover:bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-4 border border-indigo-100 transition-all">
                          <FilePlus className="w-8 h-8" />
                        </div>
                        <p className="font-bold mb-1 text-zinc-900 text-sm md:text-base">Upload your big PDF</p>
                        <p className="text-xs text-zinc-400 mb-4 font-semibold">Max size: 30MB | We will extract and host a study audio briefing</p>
                        <button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-8 py-2.5 rounded-xl text-xs md:text-sm font-bold active:scale-[0.98] transition-all shadow-md shadow-indigo-500/10">
                          Select File
                        </button>
                        <input 
                          type="file" 
                          accept="application/pdf" 
                          className="hidden" 
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                        />
                      </div>
                    ) : (
                      <div className="bg-white rounded-[2rem] border border-indigo-100 p-6 shadow-sm flex flex-col gap-4 text-center">
                        <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                          <div className="flex items-center gap-3 truncate">
                            <FileText className="w-5 h-5 text-indigo-600" />
                            <span className="text-sm font-bold truncate text-indigo-900">{file.name}</span>
                          </div>
                          <button 
                            onClick={() => setFile(null)}
                            className="text-xs text-red-600 font-extrabold px-3 py-1 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            Remove
                          </button>
                        </div>

                        <button
                          onClick={processFile}
                          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-4 rounded-2xl font-black text-sm md:text-base transition-all active:scale-[0.99] shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 animate-pulse"
                        >
                          <Headphones className="w-5 h-5" />
                          Generate Audio Summary
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-[2rem] border border-zinc-200 p-6 shadow-sm flex flex-col gap-4 text-left">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest block">Paste Study Notes or Article Text</label>
                      <span className="text-xs font-bold text-zinc-400 bg-zinc-50 border border-zinc-200/60 px-2 py-0.5 rounded-lg">
                        {inputText.trim().split(/\s+/).filter(w => w.length > 0).length} words
                      </span>
                    </div>
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Paste textbook sections, summary details, or raw lectures here (min 20 chars)..."
                      className="w-full h-48 p-4 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-zinc-50/50 resize-none font-medium leading-relaxed"
                    />
                    <div className="flex gap-3 justify-end items-center">
                      {inputText.trim().length > 0 && (
                        <button
                          onClick={() => setInputText('')}
                          className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold text-xs md:text-sm rounded-xl transition-all"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        disabled={inputText.trim().length < 20}
                        onClick={processFile}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm active:scale-[0.98] transition-all shadow-md shadow-indigo-500/10 flex items-center gap-1.5 animate-pulse"
                      >
                        <Headphones className="w-4.5 h-4.5" /> Generate Audio Summary
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2rem] p-8 border border-zinc-200 shadow-xl flex flex-col items-center max-w-md mx-auto w-full"
              >
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-6 relative">
                  {uploadProgress < 100 ? (
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  ) : (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 bg-green-500 rounded-full flex items-center justify-center border-2 border-white"
                    >
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </motion.div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-zinc-900 mb-2 truncate max-w-xs">{file ? file.name : "Text Extract"}</h3>
                <p className="text-sm text-zinc-500 mb-6 text-center font-medium">
                  {uploadProgress < 100 
                    ? `Writing audio script and recording study podcast... (${Math.round(uploadProgress)}%)` 
                    : 'Study podcast ready!'}
                </p>

                <div className="w-full bg-zinc-100 rounded-full h-3 mb-6 overflow-hidden border border-zinc-200 relative">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ ease: "easeOut", duration: 0.3 }}
                  />
                </div>

                <p className="text-xs text-indigo-500 font-bold bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 animate-pulse">
                  Converting heavy textbooks into voice summaries
                </p>
              </motion.div>
            )}

            {step === 'result' && result && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-6 max-w-2xl mx-auto w-full"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                    <div className="flex items-center gap-3 truncate">
                      <Headphones className="w-5 h-5 text-indigo-600" />
                      <span className="text-sm font-bold truncate text-indigo-900">{file?.name || 'Study Audio Summary'}</span>
                    </div>
                    <button onClick={resetState} className="text-xs text-indigo-700 font-extrabold px-3 py-1 bg-indigo-100 rounded-lg hover:bg-indigo-200/50 transition-colors">NEW</button>
                  </div>

                  {/* Removed auto-saved notification message as requested */}
                </div>

                {/* PODCAST STYLE STUDY BRIEFING PLAYER */}
                <div className="bg-white border-2 border-indigo-100 rounded-[2rem] p-6 shadow-md flex flex-col gap-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full filter blur-3xl opacity-40 -mr-10 -mt-10" />
                  
                  {/* Header/Title block */}
                  <div className="flex justify-between items-start z-10">
                    <div className="text-left">
                      <span className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[9px] font-black rounded-full uppercase tracking-widest shadow-sm">
                        Study Podcast Briefing
                      </span>
                      <h4 className="text-lg font-black text-zinc-900 mt-2 tracking-tight">AI Audio Masterclass</h4>
                      <p className="text-[11px] text-zinc-400 font-bold">Smart Host summary of your uploaded document</p>
                    </div>
                    {audioData && (
                      <a 
                        href={audioData} 
                        download={file?.name ? `${file.name.replace('.pdf', '')}-audio.wav` : 'study-briefing.wav'}
                        className="p-2.5 bg-zinc-50 text-zinc-600 hover:text-indigo-600 rounded-full border border-zinc-200 hover:border-indigo-200 hover:bg-indigo-50 shadow-sm transition-all"
                        title="Download MP3"
                      >
                        <Download className="w-4.5 h-4.5" />
                      </a>
                    )}
                  </div>

                  {/* HTML5 Audio Node */}
                  {audioData && (
                    <audio 
                      ref={audioRef}
                      src={audioData}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onLoadedMetadata={() => {
                        if (audioRef.current) setDuration(audioRef.current.duration);
                      }}
                      onTimeUpdate={() => {
                        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
                      }}
                      onEnded={() => {
                        setIsPlaying(false);
                        setCurrentTime(0);
                      }}
                      className="hidden"
                    />
                  )}

                  {/* Standard Player Controls */}
                  {isGeneratingAudio ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 z-10">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                      <div className="text-center">
                        <p className="text-sm font-extrabold text-indigo-900">Preparing podcast host voice...</p>
                        <p className="text-[11px] text-zinc-400 font-bold animate-pulse">This is a premium high-quality feature & generates in background</p>
                      </div>
                    </div>
                  ) : !isSpeechFallback ? (
                    <div className="flex flex-col gap-4 z-10">
                      {/* Seek Bar */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-zinc-400 w-10 text-left select-none">
                          {formatTime(currentTime)}
                        </span>
                        
                        <div className="flex-1 relative group">
                          <input 
                            type="range"
                            min={0}
                            max={duration || 100}
                            value={currentTime}
                            onChange={handleSeekBarChange}
                            className="w-full h-1.5 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <div 
                            className="absolute left-0 top-0 h-1.5 bg-indigo-600 rounded-lg pointer-events-none"
                            style={{ width: `${(currentTime / (duration || 100)) * 100}%` }}
                          />
                        </div>

                        <span className="text-xs font-bold text-zinc-400 w-10 text-right select-none">
                          {formatTime(duration)}
                        </span>
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center justify-center gap-6">
                        {/* Speed Toggle */}
                        <button 
                          onClick={cyclePlaybackRate}
                          className="w-10 h-10 rounded-full border border-zinc-200 text-xs font-black text-zinc-600 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all shadow-sm"
                          title="Playback Speed"
                        >
                          {playbackRate}x
                        </button>

                        {/* Replay 10s */}
                        <button 
                          onClick={replay10}
                          className="w-11 h-11 rounded-full border border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all shadow-sm active:scale-95"
                          title="Replay 10s"
                        >
                          <RotateCcw className="w-4.5 h-4.5" />
                        </button>

                        {/* Play/Pause Button */}
                        <button 
                          onClick={togglePlay}
                          className="w-16 h-16 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all"
                        >
                          {isPlaying ? (
                            <Pause className="w-7 h-7 fill-white text-white" />
                          ) : (
                            <Play className="w-7 h-7 fill-white text-white translate-x-0.5" />
                          )}
                        </button>

                        {/* Skip Forward 10s */}
                        <button 
                          onClick={skipForward10}
                          className="w-11 h-11 rounded-full border border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all shadow-sm active:scale-95 rotate-180"
                          title="Forward 10s"
                        >
                          {/* Reused RotateCcw rotated 180deg to behave as Forward 10s */}
                          <RotateCcw className="w-4.5 h-4.5" />
                        </button>

                        {/* Visualizer animation */}
                        <div className="w-10 h-10 flex items-center justify-center gap-0.5">
                          {[1, 2, 3, 4].map((bar) => (
                            <motion.span 
                              key={bar}
                              className="w-1 bg-indigo-500 rounded-full"
                              animate={isPlaying ? { height: [8, 24, 8] } : { height: 8 }}
                              transition={{ duration: 0.6, repeat: Infinity, delay: bar * 0.15, ease: 'easeInOut' }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Fallback player using standard speech synthesis */
                    <div className="flex flex-col gap-4 z-10">
                      <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 animate-pulse">
                            <Volume2 className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-extrabold text-indigo-900">Speech Synthesis Mode</p>
                            <p className="text-xs text-indigo-500 font-semibold">
                              {isPlayingFallback ? "Narrating study briefing..." : "Audio is ready to play"}
                            </p>
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-3">
                          {/* Speed rates */}
                          <button 
                            onClick={cyclePlaybackRate}
                            className="w-9 h-9 rounded-full border border-indigo-200 text-xs font-black text-indigo-700 hover:bg-indigo-50 flex items-center justify-center transition-all"
                            title="Narraion Speed"
                          >
                            {playbackRate}x
                          </button>

                          {!isPlayingFallback ? (
                            <button 
                              onClick={startSpeechFallback}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md active:scale-95"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" /> Play Podcast
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <button 
                                onClick={pauseSpeechFallback}
                                className="px-4 py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold text-xs transition-all"
                              >
                                Pause
                              </button>
                              <button 
                                onClick={stopSpeechFallback}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all"
                              >
                                Stop
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SCROLLING TRANSCRIPT SECTION */}
                <div 
                  ref={transcriptContainerRef}
                  className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm flex flex-col gap-4 text-left max-h-[500px] overflow-y-auto relative"
                >
                  <div className="sticky top-0 bg-white/95 backdrop-blur-sm pb-3 border-b border-zinc-100 flex items-center justify-between z-10">
                    <h5 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      Podcast Transcript
                    </h5>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                      Read Along
                    </span>
                  </div>

                  <div className="text-zinc-700 text-sm font-medium leading-relaxed space-y-4 pt-1 select-text">
                    {result.split('\n\n').map((paragraph, idx) => {
                      if (!paragraph.trim()) return null;
                      return (
                        <p 
                          key={idx} 
                          className="hover:text-indigo-900 transition-colors py-1 pl-1 rounded hover:bg-indigo-50/20"
                        >
                          {paragraph.trim()}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
