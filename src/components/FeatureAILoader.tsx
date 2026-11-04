import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface FeatureAILoaderProps {
  title: string;
  steps: string[];
  currentStepIndex: number;
  progress: number; // 0 to 100
  icon: React.ReactNode;
  gradientClass: string; // e.g. "from-amber-500 via-orange-500 to-purple-600"
  glowColorClass: string; // e.g. "bg-amber-500/20 shadow-amber-500/20"
  accentTextColor: string; // e.g. "text-amber-600"
  className?: string;
}

export default function FeatureAILoader({
  title,
  steps,
  currentStepIndex,
  progress,
  icon,
  gradientClass,
  glowColorClass,
  accentTextColor,
  className = ''
}: FeatureAILoaderProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const safeIndex = steps.length > 0 ? Math.min(Math.max(0, currentStepIndex), steps.length - 1) : 0;
  const currentStep = steps[safeIndex] || 'AI Calibration in progress...';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`no-print my-auto flex-1 flex flex-col items-center justify-center py-12 px-4 text-center max-w-md mx-auto w-full select-none ${className}`}
    >
      {/* Glowing Ambient Squircle Icon */}
      <div className="relative mb-6">
        <div className={`absolute inset-0 ${glowColorClass.split(' ')[0]} rounded-full blur-2xl animate-pulse`} />
        <div
          className={`relative w-20 h-20 bg-gradient-to-tr ${gradientClass} rounded-3xl flex items-center justify-center shadow-xl ${glowColorClass.split(' ')[1] || ''} text-white`}
        >
          <div className="w-10 h-10 flex items-center justify-center animate-pulse">
            {icon}
          </div>
        </div>
      </div>

      {/* Main Title */}
      <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">
        {title}
      </h3>

      {/* Single Dynamic Ticker Line displayed one-by-one with AnimatePresence */}
      <div className="h-6 mb-6 flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={safeIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className={`${accentTextColor} font-black text-xs tracking-wider uppercase truncate px-2`}
          >
            {currentStep}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Clean Pill Progress Bar */}
      <div className="w-full bg-zinc-200/80 rounded-full h-3 mb-3 overflow-hidden border border-zinc-200 p-[2px]">
        <div
          className={`bg-gradient-to-r ${gradientClass} h-full rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${safeProgress}%` }}
        />
      </div>

      {/* Percentage Ready Text */}
      <div className="text-xs font-black text-zinc-400 tracking-wider uppercase">
        {safeProgress}% READY
      </div>
    </motion.div>
  );
}
