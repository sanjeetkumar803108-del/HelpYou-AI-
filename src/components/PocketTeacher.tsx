import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Headphones, Play, Pause, Volume2, Search, Book, Trash2, Smartphone, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { get, set, del, keys } from 'idb-keyval';
import GlobalMarkdown from './GlobalMarkdown';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function PocketTeacher({ isVip, items }: { isVip: boolean, items: any[] }) {
  const [playingIndex, setPlayingIndex] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const [downloadedAudios, setDownloadedAudios] = useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [progress, setProgress] = useState<number>(0);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'pocket_items', id));
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pocket_items/${id}`);
    }
  };


  useEffect(() => {
    // Check IndexedDB for existing offline audios
    const checkOfflineAudios = async () => {
      const idbKeys = await keys();
      const downloaded: Record<string, string> = {};
      for (const key of idbKeys) {
        if (typeof key === 'string' && key.startsWith('audio_')) {
          const id = key.replace('audio_', '');
          downloaded[id] = "downloaded";
        }
      }
      setDownloadedAudios(downloaded);
    };
    checkOfflineAudios();

    return () => {
      stopAudio();
    };
  }, []);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext({ sampleRate: 24000 });
    }
  };

      const stopAudio = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPlayingIndex(null);
    setProgress(0);
  };

    const playTTS = async (id: string, text: string, existingAudioBase64?: string) => {
    if (!isVip) return;
    
    if (window.speechSynthesis) {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
    
    if (playingIndex === id) {
      stopAudio();
      return;
    }
    
    stopAudio();
    initAudio();
    
    try {
      setLoadingAudio(id);
      
      let audioContent = existingAudioBase64;

      if (!audioContent) {
        // Check if available offline in IndexedDB
        const offlineAudio = await get(`audio_${id}`);
        if (offlineAudio) {
          audioContent = offlineAudio as string;
        }
      }

      if (!audioContent) {
        const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'en-US-Journey-F' }),
        });
        
        if (!response.ok) {
          const errText = await response.text();
          let errMsg = "No audio";
          try {
            errMsg = JSON.parse(errText).error || errMsg;
          } catch (_) {
            errMsg = errText.substring(0, 100) || errMsg;
          }
          throw new Error(errMsg);
        }
        const ttsContentType = response.headers.get("content-type") || "";
        if (!ttsContentType.includes("application/json")) {
          throw new Error("Server returned invalid response format");
        }
        const data = await response.json();
        if (!data.audio && !data.audio) throw new Error("No audio generated");
        audioContent = data.audio || data.audio;
      } else {
        // Strip out data:audio/wav;base64, prefix if present
        if (audioContent.startsWith('data:audio/')) {
          audioContent = audioContent.split(',')[1];
        }
      }

      const binary = atob(audioContent);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const audioBuffer = await audioContextRef.current!.decodeAudioData(bytes.buffer);
      
      const source = audioContextRef.current!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current!.destination);
      source.onended = () => {
        if (playingIndex === id) {
          setPlayingIndex(null);
          setProgress(0);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        }
      };
      
      sourceNodeRef.current = source;
      
      durationRef.current = audioBuffer.duration;
      startTimeRef.current = audioContextRef.current!.currentTime;
      setProgress(0);
      
      const updateProgress = () => {
        if (!audioContextRef.current) return;
        const currentElapsed = audioContextRef.current.currentTime - startTimeRef.current;
        const currentProgress = Math.min((currentElapsed / durationRef.current) * 100, 100);
        setProgress(currentProgress);
        
        if (currentElapsed < durationRef.current) {
          animationFrameRef.current = requestAnimationFrame(updateProgress);
        }
      };
      
      animationFrameRef.current = requestAnimationFrame(updateProgress);

      source.start();

      setPlayingIndex(id);
    } catch (err) {
      console.error("TTS playback error, falling back to Web Speech API:", err);
      // Fallback to native Web Speech API
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Auto-detect language (Hindi vs English)
        const hasHindi = /[\u0900-\u097F]/.test(text);
        utterance.lang = hasHindi ? 'hi-IN' : 'en-IN';
        
        const voices = window.speechSynthesis.getVoices();
        const langPrefix = utterance.lang.split('-')[0].toLowerCase();
        const preferredVoice = voices.find(v => 
          v.lang.toLowerCase().startsWith(langPrefix) && 
          (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural'))
        ) || voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
        
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onend = () => {
          if (playingIndex === id) {
            setPlayingIndex(null);
            setProgress(0);
          }
        };
        utterance.onerror = (e) => {
          console.error("Web Speech API error:", e);
          if (playingIndex === id) {
            setPlayingIndex(null);
            setProgress(0);
          }
        };
        window.speechSynthesis.speak(utterance);
        setPlayingIndex(id);
        
        // Simulate progress for Web Speech API since we can't easily track exact time
        // Assume ~150 words per minute
        const wordCount = text.split(/\s+/).length;
        const estimatedDurationSeconds = (wordCount / 150) * 60;
        durationRef.current = estimatedDurationSeconds;
        startTimeRef.current = Date.now() / 1000;
        
        const updateProgress = () => {
          const currentElapsed = (Date.now() / 1000) - startTimeRef.current;
          const currentProgress = Math.min((currentElapsed / durationRef.current) * 100, 100);
          setProgress(currentProgress);
          
          if (currentElapsed < durationRef.current) {
            animationFrameRef.current = requestAnimationFrame(updateProgress);
          }
        };
        
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      } else {
        alert("Audio playback failed and your browser does not support text-to-speech fallback.");
      }
    } finally {
      setLoadingAudio(null);
    }
  };

  const handleDownload = async (item: any) => {
    if (!isVip) {
      alert("VIP required to download audio for offline use.");
      return;
    }
    
    if (downloadedAudios[item.id]) {
      alert("Audio is already saved to your Offline Bag!");
      return;
    }

    try {
      setLoadingAudio(item.id);
      
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.text, voice: 'en-US-Journey-F' }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const ttsDlContentType = response.headers.get("content-type") || "";
      if (!ttsDlContentType.includes("application/json")) {
        throw new Error("Server returned invalid response format");
      }

      const data = await response.json();
      
      if (data.audio) {
        await set(`audio_${item.id}`, data.audio);
        setDownloadedAudios(prev => ({...prev, [item.id]: "downloaded"}));
        alert("Audio saved to your Offline Bag!");
      }
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download audio for offline use.");
    } finally {
      setLoadingAudio(null);
    }
  };

  if (!auth.currentUser) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center bg-[#FAF9F6] text-zinc-800">
        <Lock className="w-12 h-12 text-zinc-400 mb-4" />
        <p className="text-zinc-500">Log in to view your Pocket Teacher</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative text-zinc-900 bg-[#FAF9F6] overflow-hidden">
      {selectedItem ? (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col h-full absolute inset-0 z-10 bg-[#FAF9F6]"
        >
          {/* FIXED/STICKY HEADER BAR */}
          <div className="sticky top-0 bg-white/95 backdrop-blur-md pt-6 pb-4 px-6 z-30 border-b border-zinc-200 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedItem(null)}
                className="w-10 h-10 bg-zinc-100 hover:bg-zinc-200 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 shadow-sm border border-zinc-200 transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-sm md:text-base font-bold text-zinc-850 tracking-tight line-clamp-1">
                  {selectedItem.title || 'Saved Item'}
                </h2>
                <p className="text-[10px] text-zinc-500 font-medium">Currently Playing</p>
              </div>
            </div>
            <button 
              onClick={() => setDeleteConfirmId(selectedItem.id)}
              className="w-10 h-10 bg-red-50 hover:bg-red-100 text-red-600 rounded-full flex items-center justify-center border border-red-200 transition-colors shrink-0 shadow-sm"
              title="Delete Saved Item"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-6 pt-6 pb-40">
            <div className="prose prose-sm max-w-none text-zinc-850 leading-relaxed whitespace-pre-wrap break-words [&_pre]:overflow-x-auto">
              <GlobalMarkdown>{selectedItem.text}</GlobalMarkdown>
            </div>
          </div>
          
          <div className="absolute bottom-28 left-6 right-6">
            <button 
              onClick={() => playTTS(selectedItem.id, selectedItem.text, selectedItem.audioData)}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-md ${
                !isVip 
                   ? 'bg-orange-50 text-orange-600 border border-orange-200' 
                   : playingIndex === selectedItem.id 
                     ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 relative overflow-hidden' 
                     : 'bg-emerald-650 text-white active:scale-[0.98] border border-emerald-600 hover:bg-emerald-600 shadow-sm'
              }`}
            >
              {playingIndex === selectedItem.id && (
                <div 
                   className="absolute top-0 left-0 h-full bg-red-100 transition-all duration-100 ease-linear pointer-events-none" 
                   style={{ width: `${progress}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
              {!isVip ? (
                <><Lock className="w-5 h-5" /> VIP Required</>
              ) : loadingAudio === selectedItem.id ? (
                <span className="animate-pulse">Loading Voice...</span>
              ) : playingIndex === selectedItem.id ? (
                <><Pause className="w-6 h-6 fill-current" /> Stop Listening</>
              ) : (
                <><Play className="w-6 h-6 fill-current" /> Play as Story</>
              )}
              </span>
            </button>
          </div>
        </motion.div>
      ) : (
      <>
      {/* HEADER SECTION */}
      <div className="pt-6 pb-4 px-6 border-b border-zinc-200 flex items-center gap-3 shrink-0 bg-white/95 backdrop-blur-md shadow-sm">
        <Headphones className="w-6 h-6 text-green-600 shrink-0" />
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight line-clamp-1 text-zinc-800">
            Audiobook
          </h2>
          <p className="text-[11px] text-zinc-500 font-medium line-clamp-1">Listen to your saved notes and chats like a story</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-32 space-y-4">
        {!Array.isArray(items) || items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 mt-20">
            <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-6 shadow-inner border border-zinc-200">
              <Volume2 className="w-10 h-10 text-zinc-400" />
            </div>
            <h3 className="text-xl font-bold text-zinc-800 mb-2">Your Audiobook is Empty</h3>
            <p className="text-zinc-500 mb-8 max-w-[250px] text-sm">
              Save notes or scan chats to build your personal learning library.
            </p>
            <button className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-xl font-medium shadow-md active:scale-95 transition-all flex items-center gap-2 border border-purple-500/20">
              <Book className="w-5 h-5" />
              Create Your First Note
            </button>
          </div>
        ) : (
          (items || []).map((item) => (
            <motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedItem(item)}
            className="bg-white rounded-[1.75rem] p-6 border border-zinc-200/80 shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-3 mr-4 overflow-hidden">
                {item.type === 'scan_chat' ? <Search className="w-5 h-5 text-blue-600 shrink-0" strokeWidth={2} /> : item.type === 'ai_tutor' ? <Headphones className="w-5 h-5 text-green-600 shrink-0" strokeWidth={2} /> : <Smartphone className="w-5 h-5 text-purple-700 shrink-0" strokeWidth={2} />}
                <h3 className="font-bold text-zinc-900 text-[17px] tracking-tight leading-tight line-clamp-2">
                  {item.title || 'Saved Item'}
                </h3>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setDeleteConfirmId(item.id);
                  }}
                  className="w-[42px] h-[42px] flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                  title="Delete Saved Item"
                >
                  <Trash2 className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
      </>
      )}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div 
            key="delete-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="bg-white border border-zinc-200 rounded-[2rem] p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-850 mb-2">Delete Saved Audiobook?</h3>
              <p className="text-zinc-500 text-sm mb-6">Are you sure you want to delete this saved item? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-750 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    const id = deleteConfirmId;
                    setDeleteConfirmId(null);
                    await handleDelete(id);
                  }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl shadow-lg shadow-red-600/10 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
