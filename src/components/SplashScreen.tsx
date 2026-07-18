import React from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  onComplete?: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  // Minimalist education symbols for background pattern
  const symbols = [
    { text: 'E = mc²', top: '10%', left: '15%', rotate: '-12deg' },
    { text: '∫ x² dx', top: '15%', left: '75%', rotate: '15deg' },
    { text: 'H₂O', top: '32%', left: '12%', rotate: '-5deg' },
    { text: 'f(x) = y', top: '48%', left: '82%', rotate: '20deg' },
    { text: 'π ≈ 3.14', top: '65%', left: '10%', rotate: '-18deg' },
    { text: '∑ xi', top: '75%', left: '80%', rotate: '8deg' },
    { text: '√x', top: '85%', left: '20%', rotate: '12deg' },
    { text: 'Δ = b²-4ac', top: '25%', left: '45%', rotate: '5deg' },
    { text: 'CO₂', top: '58%', left: '30%', rotate: '-15deg' },
    { text: 'F = ma', top: '68%', left: '60%', rotate: '10deg' },
    { text: 'λ = v/f', top: '88%', left: '72%', rotate: '-8deg' },
    { text: 'NaCl', top: '40%', left: '68%', rotate: '25deg' },
  ];

  return (
    <motion.div
      id="splash-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="absolute inset-0 z-[100] bg-[#0A0A0F] flex flex-col items-center justify-center overflow-hidden rounded-[inherit] select-none"
    >
      {/* Background Subtle Educational Symbols */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {symbols.map((sym, idx) => (
          <span
            key={idx}
            className="absolute font-mono text-xs md:text-sm text-purple-400/4 font-semibold tracking-wide select-none"
            style={{
              top: sym.top,
              left: sym.left,
              transform: `rotate(${sym.rotate})`,
            }}
          >
            {sym.text}
          </span>
        ))}
      </div>

      {/* Main Centerpiece Logo Animation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1.0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} // smooth ease-out custom cubic-bezier
        className="flex flex-col items-center justify-center relative z-10 p-6"
      >
        <svg viewBox="0 0 400 400" className="w-64 h-64 sm:w-72 sm:h-72">
          <defs>
            {/* Soft and intense neon purple glows */}
            <filter id="purple-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Custom high-fidelity gradients */}
            <linearGradient id="bookGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e9d5ff" />
              <stop offset="50%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#7e22ce" />
            </linearGradient>

            <linearGradient id="sparkleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#d8b4fe" />
            </linearGradient>
            
            <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f3e8ff" />
            </linearGradient>
          </defs>

          {/* Viewfinder Frame Corners with neon glow */}
          <g stroke="#a855f7" strokeWidth="5.5" strokeLinecap="round" fill="none" filter="url(#purple-glow)">
            {/* Top Left Corner */}
            <path d="M 125 75 L 105 75 A 25 25 0 0 0 80 100 L 80 120" />
            {/* Top Right Corner */}
            <path d="M 275 75 L 295 75 A 25 25 0 0 1 320 100 L 320 120" />
            {/* Bottom Left Corner */}
            <path d="M 80 275 L 80 295 A 25 25 0 0 0 105 320 L 125 320" />
            {/* Bottom Right Corner */}
            <path d="M 320 275 L 320 295 A 25 25 0 0 1 295 320 L 275 320" />
          </g>

          {/* Glowing 4-point magical star centerpiece */}
          <path 
            d="M 200 90 C 200 118 185 133 155 133 C 185 133 200 148 200 176 C 200 148 215 133 245 133 C 215 133 200 118 200 90 Z" 
            fill="url(#sparkleGradient)" 
            filter="url(#purple-glow)" 
          />

          {/* Secondary micro star sparkles & dust nodes */}
          <path d="M 162 113 C 162 117 159 119 155 119 C 159 119 162 121 162 125 C 162 121 165 119 169 119 C 165 119 162 117 162 113 Z" fill="#e9d5ff" />
          <path d="M 238 143 C 238 147 235 149 231 149 C 235 149 238 151 238 155 C 238 151 241 149 245 149 C 241 149 238 147 238 143 Z" fill="#e9d5ff" />
          <path d="M 218 158 C 218 161 216 162 213 162 C 216 162 218 163 218 166 C 218 163 220 162 223 162 C 220 162 218 161 218 158 Z" fill="#d8b4fe" />
          
          <circle cx="168" cy="150" r="3.5" fill="#c084fc" filter="url(#soft-glow)" />
          <circle cx="230" cy="115" r="3.5" fill="#c084fc" filter="url(#soft-glow)" />

          {/* 3D-effect Layered Open Book Pages */}
          {/* Backmost page layer */}
          <path d="M 200 245 C 170 241 135 251 108 255 C 111 218 119 184 123 178 C 143 176 173 166 200 176 Z" fill="#4a044e" opacity="0.6" />
          <path d="M 200 245 C 230 241 265 251 292 255 C 289 218 281 184 277 178 C 257 176 227 166 200 176 Z" fill="#4a044e" opacity="0.6" />

          {/* Middle purple page layer */}
          <path d="M 200 248 C 170 242 130 253 104 253 C 107 214 116 179 120 173 C 140 171 171 161 200 161 Z" fill="#6b21a8" />
          <path d="M 200 248 C 230 242 270 253 296 253 C 293 214 284 179 280 173 C 260 171 229 161 200 161 Z" fill="#6b21a8" />

          {/* Front illuminated left page */}
          <path d="M 200 251 C 165 241 118 253 98 249 C 101 206 113 171 118 164 C 138 162 168 151 200 161 Z" fill="#ffffff" stroke="#c084fc" strokeWidth="1" />
          <path d="M 200 251 C 165 241 118 253 98 249" fill="none" stroke="#581c87" strokeWidth="2.5" />

          {/* Front illuminated right page */}
          <path d="M 200 251 C 235 241 282 253 302 249 C 299 206 287 171 282 164 C 262 162 232 151 200 161 Z" fill="#fcfaff" stroke="#c084fc" strokeWidth="1" />
          <path d="M 200 251 C 235 241 282 253 302 249" fill="none" stroke="#581c87" strokeWidth="2.5" />

          {/* Center Page Divider / Spine overlay */}
          <path d="M 200 161 L 200 251" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" />

          {/* Bottom division bar aesthetics and HelpYou AI text */}
          <g>
            {/* Dividing vertical accent lines in gray */}
            <line x1="110" y1="284" x2="110" y2="304" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
            <line x1="290" y1="284" x2="290" y2="304" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" opacity="0.6" />

            {/* Typography */}
            <text x="200" y="300" fontFamily="Inter, system-ui, sans-serif" fontWeight="bold" textAnchor="middle" fontSize="24">
              <tspan fill="url(#textGradient)">HelpYou</tspan>
              <tspan fill="#a855f7" fontWeight="900" filter="url(#soft-glow)"> AI</tspan>
            </text>
          </g>
        </svg>
      </motion.div>
    </motion.div>
  );
}
