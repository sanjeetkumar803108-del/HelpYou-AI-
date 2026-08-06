import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface AdvancedLoaderProps {
  isVisible?: boolean;
  subtext?: string;
  type?: 'orb' | 'skeleton' | 'full-page' | 'inline';
  context?: 'questions' | 'quiz' | 'dashboard' | 'general';
  skeletonType?: 'card' | 'list' | 'dashboard' | 'grid';
  count?: number;
}

export default function AdvancedLoader({
  isVisible = true,
  type = 'orb',
  skeletonType = 'card',
  count = 3
}: AdvancedLoaderProps) {
  if (!isVisible) return null;

  // Premium Shimmering Skeletons
  if (type === 'skeleton') {
    if (skeletonType === 'list') {
      return (
        <div className="w-full space-y-3.5 py-2">
          {Array.from({ length: count }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40">
              <div className="w-11 h-11 rounded-full animate-shimmer shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded-md animate-shimmer" />
                <div className="h-3 w-3/4 rounded-md animate-shimmer" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (skeletonType === 'grid') {
      return (
        <div className="grid grid-cols-2 gap-4 w-full py-2">
          {Array.from({ length: count }).map((_, idx) => (
            <div key={idx} className="p-4 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 space-y-4">
              <div className="w-10 h-10 rounded-2xl animate-shimmer" />
              <div className="space-y-2">
                <div className="h-4.5 w-3/4 rounded-md animate-shimmer" />
                <div className="h-3 w-1/2 rounded-md animate-shimmer" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (skeletonType === 'dashboard') {
      return (
        <div className="w-full space-y-6 py-4">
          <div className="space-y-2.5">
            <div className="h-7 w-2/3 rounded-xl animate-shimmer" />
            <div className="h-4 w-1/2 rounded-md animate-shimmer" />
          </div>
          <div className="grid grid-cols-3 gap-3.5">
            <div className="h-20 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 animate-shimmer" />
            <div className="h-20 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 animate-shimmer" />
            <div className="h-20 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 animate-shimmer" />
          </div>
          <div className="space-y-3.5">
            <div className="h-32 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 animate-shimmer" />
            <div className="h-32 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 animate-shimmer" />
          </div>
        </div>
      );
    }

    return (
      <div className="w-full space-y-4 py-2">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="p-5 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-6 w-1/3 rounded-md animate-shimmer" />
              <div className="h-4 w-1/6 rounded-md animate-shimmer" />
            </div>
            <div className="space-y-2.5">
              <div className="h-3 w-full rounded-md animate-shimmer" />
              <div className="h-3 w-5/6 rounded-md animate-shimmer" />
              <div className="h-3 w-2/3 rounded-md animate-shimmer" />
            </div>
            <div className="h-9 w-full rounded-xl animate-shimmer mt-2" />
          </div>
        ))}
      </div>
    );
  }

  // Dual Spinning Rings custom loader
  const LoaderRings = (
    <div className="relative w-[60px] h-[60px] flex items-center justify-center">
      {/* Outer Ring: 60x60, rounded, border width 5, faint track, colored top border, clockwise spin */}
      <motion.div
        className="absolute w-[60px] h-[60px] rounded-full border-[5px] border-zinc-950/5 dark:border-white/5"
        style={{ 
          borderTopColor: '#9333ea',
          filter: 'drop-shadow(0 0 8px rgba(147, 51, 234, 0.75))'
        }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
      />
      {/* Inner Ring: 40x40, rounded, border width 5, faint track, colored bottom border, counter-clockwise spin */}
      <motion.div
        className="absolute w-[40px] h-[40px] rounded-full border-[5px] border-zinc-950/5 dark:border-white/5"
        style={{ 
          borderBottomColor: '#06b6d4',
          filter: 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.75))'
        }}
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
      />
      {/* Breathing AI Core */}
      <motion.div
        className="absolute w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-purple-500 to-cyan-500"
        style={{
          boxShadow: '0 0 10px rgba(147, 51, 234, 0.8), 0 0 4px rgba(6, 182, 212, 0.8)'
        }}
        animate={{ scale: [0.8, 1.2, 0.8] }}
        transition={{
          repeat: Infinity,
          duration: 1.5,
          ease: "easeInOut"
        }}
      />
    </div>
  );

  if (type === 'full-page') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-md p-6"
        >
          {LoaderRings}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="flex items-center justify-center py-10 px-4 w-full">
      {LoaderRings}
    </div>
  );
}
