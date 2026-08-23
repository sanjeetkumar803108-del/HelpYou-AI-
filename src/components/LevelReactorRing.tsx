import React from 'react';
import { motion } from 'motion/react';
import { StudyLevel } from '../utils/gamification';

interface LevelReactorRingProps {
  levelData: {
    currentLevel: StudyLevel;
    nextLevel: StudyLevel | null;
    progressPercent: number;
    xpInLevel: number;
    xpToNextLevel: number;
  };
  children: React.ReactNode;
}

export default function LevelReactorRing({ levelData, children }: LevelReactorRingProps) {
  const { currentLevel, progressPercent } = levelData;
  const radius = 54;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      {/* Lightweight Concentric SVG Ring Container */}
      <div className="relative w-32 h-32 flex items-center justify-center select-none">
        
        {/* Soft Ambient Glow */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-purple-500/20 via-indigo-500/20 to-pink-500/20 filter blur-lg pointer-events-none opacity-60" />

        {/* Pure Lightweight SVG Circles */}
        <svg className="w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="reactorEnergyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="50%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#EC4899" />
            </linearGradient>
          </defs>

          {/* Background Track */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-zinc-200/80"
            fill="transparent"
          />

          {/* Outer Dashed Tech Ring */}
          <circle
            cx="64"
            cy="64"
            r={radius + 5}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="4 6"
            className="text-purple-300/40"
            fill="transparent"
          />

          {/* Active Neon XP Arc */}
          <motion.circle
            cx="64"
            cy="64"
            r={radius}
            stroke="url(#reactorEnergyGrad)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>

        {/* Center Avatar Container */}
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center shadow-md border-2 border-white">
            {children}
          </div>
        </div>

        {/* Level Badge Docked at Bottom-Right */}
        <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white font-black text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md border-2 border-white flex items-center gap-0.5 z-20">
          <span>LVL {currentLevel.level}</span>
          <span className="text-amber-300">⚡</span>
        </div>
      </div>
    </div>
  );
}
