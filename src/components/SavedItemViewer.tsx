import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, Copy, Volume2, Square, Pause, Play, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import GlobalMarkdown from './GlobalMarkdown';
import { triggerVibration } from '../utils/vibrate';

interface SavedItemViewerProps {
  item: {
    id: string;
    title?: string;
    text: string;
    type?: string;
    createdAt?: any;
  };
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  isVip?: boolean;
}

export default function SavedItemViewer({ item, onClose, onDelete, isVip = false }: SavedItemViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Stop any ongoing speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopy = () => {
    triggerVibration(15);
    navigator.clipboard.writeText(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeechPlay = () => {
    triggerVibration(15);
    if (!window.speechSynthesis) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPlaying(true);
      setIsPaused(false);
      return;
    }

    // Stop current synthesis before playing a new one
    window.speechSynthesis.cancel();

    // Clean markdown/HTML tags from text for better TTS reading
    const cleanText = item.text
      .replace(/[#*`_~]/g, '') // remove markdown characters
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // replace links with anchor text
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      setIsPlaying(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const handleSpeechPause = () => {
    triggerVibration(15);
    if (window.speechSynthesis && isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
      setIsPaused(true);
    }
  };

  const handleSpeechStop = () => {
    triggerVibration(15);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  const getFriendlyDate = () => {
    if (!item.createdAt) return '';
    try {
      let dateObj: Date;
      if (typeof item.createdAt.toDate === 'function') {
        dateObj = item.createdAt.toDate();
      } else if (item.createdAt.seconds) {
        dateObj = new Date(item.createdAt.seconds * 1000);
      } else {
        dateObj = new Date(item.createdAt);
      }
      return dateObj.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  };

  const getBadgeEmojiAndName = () => {
    const type = (item.type || 'note').toLowerCase();
    switch (type) {
      case 'note':
      case 'notemaker':
        return { emoji: '📑', name: 'Smart Note' };
      case 'summary':
      case 'summariser':
        return { emoji: '📝', name: 'AI Summary' };
      case 'quiz':
      case 'quizgenerator':
        return { emoji: '✍️', name: 'Practice Quiz' };
      case 'flashcard':
      case 'flashcardgenerator':
        return { emoji: '🪄', name: 'AI Flashcards' };
      case 'essay':
      case 'essaygrader':
        return { emoji: '⭐', name: 'AP Essay' };
      case 'scan_chat':
      case 'scanner':
        return { emoji: '📷', name: 'Image Scan' };
      case 'ai_tutor':
      case 'aitutor':
        return { emoji: '💭', name: 'Tutor Chat' };
      case 'grammar':
        return { emoji: '✍️', name: 'Grammar Fix' };
      default:
        return { emoji: '🎒', name: 'Study Resource' };
    }
  };

  const { emoji, name } = getBadgeEmojiAndName();

  return (
    <div className="flex flex-col h-full w-full absolute inset-0 z-40 bg-[#FAF9F6] text-zinc-900 overflow-hidden font-sans">
      {/* Sticky Top Header */}
      <div className="sticky top-0 bg-white border-b border-zinc-200/80 px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="w-10 h-10 bg-zinc-100 hover:bg-zinc-200 active:scale-95 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 border border-zinc-200/40 transition-all cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full mr-2">
              {emoji} {name}
            </span>
            <p className="text-[11px] text-zinc-400 font-semibold inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {getFriendlyDate()}
            </p>
          </div>
        </div>

        <button 
          onClick={() => {
            triggerVibration(15);
            setShowDeleteConfirm(true);
          }}
          className="w-10 h-10 bg-red-50 hover:bg-red-100 text-red-600 rounded-full flex items-center justify-center border border-red-200/50 transition-colors shadow-sm cursor-pointer"
          title="Delete Saved Item"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 pb-28">
        <h1 className="text-xl md:text-2xl font-black text-zinc-900 leading-tight mb-4 tracking-tight">
          {item.title || 'Untitled Study Note'}
        </h1>

        <div className="prose prose-sm max-w-none text-zinc-800 leading-relaxed whitespace-pre-wrap break-words [&_pre]:overflow-x-auto">
          <GlobalMarkdown>{item.text}</GlobalMarkdown>
        </div>
      </div>

      {/* Action Footer Button Rail */}
      <div className="absolute bottom-4 left-6 right-6 bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-2xl p-3 shadow-lg flex items-center justify-between gap-3 z-10">
        {/* Copy Button */}
        <button 
          onClick={handleCopy}
          className="flex-1 py-3 px-4 bg-zinc-100 hover:bg-zinc-200 active:scale-98 rounded-xl font-bold text-xs text-zinc-800 transition-all flex items-center justify-center gap-2 border border-zinc-200/40 cursor-pointer"
        >
          <Copy className="w-4 h-4" />
          {copied ? 'Copied! 📋' : 'Copy Text'}
        </button>

        {/* TTS Audio Player Control */}
        <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/40 p-1.5 rounded-xl shrink-0">
          {isPlaying ? (
            <button 
              onClick={handleSpeechPause}
              className="w-10 h-10 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 active:scale-95 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
              title="Pause Audio"
            >
              <Pause className="w-5 h-5 fill-current" />
            </button>
          ) : (
            <button 
              onClick={handleSpeechPlay}
              className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white active:scale-95 rounded-lg flex items-center justify-center shadow-md shadow-emerald-500/10 transition-colors cursor-pointer"
              title="Play Audio"
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
          )}

          {(isPlaying || isPaused) && (
            <button 
              onClick={handleSpeechStop}
              className="w-10 h-10 bg-red-100 hover:bg-red-200 text-red-600 active:scale-95 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
              title="Stop Audio"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          )}

          {!isPlaying && !isPaused && (
            <div className="w-10 h-10 text-zinc-400 flex items-center justify-center">
              <Volume2 className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>

      {/* Deletion Confirmation Dialogue */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs z-[50] flex items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="bg-white rounded-[2rem] p-6 max-w-sm w-full shadow-2xl border border-zinc-200"
            >
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200 shadow-inner">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-zinc-900 mb-2 leading-none">Delete Saved Item?</h3>
              <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
                Are you sure you want to delete this study note? This action is permanent and cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-extrabold text-xs rounded-xl transition-all cursor-pointer border-none"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    triggerVibration(15);
                    await onDelete(item.id);
                    onClose();
                  }}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-red-600/10 transition-all cursor-pointer border-none"
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
