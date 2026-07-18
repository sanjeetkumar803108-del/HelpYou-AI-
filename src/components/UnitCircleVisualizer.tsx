import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, Building2, Compass, Check, ArrowRight, HelpCircle, Sparkles, RotateCcw } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';

interface UnitCircleVisualizerProps {
  trigMode: 'deg' | 'rad';
  onInsertExpression: (expr: string) => void;
}

export default function UnitCircleVisualizer({ trigMode, onInsertExpression }: UnitCircleVisualizerProps) {
  const [angle, setAngle] = useState<number>(30); // in degrees initially (0 - 360)
  const [activeTab, setActiveTab] = useState<'visual' | 'realworld'>('visual');

  // Convert angle for math calculations
  const rad = (angle * Math.PI) / 180;
  const cosVal = Math.cos(rad);
  const sinVal = Math.sin(rad);
  // Avoid division by zero for tangent
  const tanVal = Math.abs(cosVal) < 1e-10 ? null : Math.sin(rad) / Math.cos(rad);

  // Quick select standard angles
  const standardAngles = [
    { deg: 0, radLabel: '0' },
    { deg: 30, radLabel: 'π/6' },
    { deg: 45, radLabel: 'π/4' },
    { deg: 60, radLabel: 'π/3' },
    { deg: 90, radLabel: 'π/2' },
    { deg: 120, radLabel: '2π/3' },
    { deg: 135, radLabel: '3π/4' },
    { deg: 150, radLabel: '5π/6' },
    { deg: 180, radLabel: 'π' },
    { deg: 270, radLabel: '3π/2' }
  ];

  // Polar to Cartesian for SVG drawing
  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY - radius * Math.sin(angleInRadians) // SVG y-axis is inverted
    };
  };

  // SVG dimensions
  const size = 200;
  const center = size / 2;
  const r = 65; // radius

  // Main point coordinates
  const p = polarToCartesian(center, center, r, angle);

  // Exact fractional/radical representation for standard angles helper
  const getTrigExactValues = (deg: number) => {
    const d = ((deg % 360) + 360) % 360;
    switch (d) {
      case 0:
        return { cos: '1', sin: '0', tan: '0' };
      case 30:
        return { cos: '√3/2', sin: '1/2', tan: '√3/3' };
      case 45:
        return { cos: '√2/2', sin: '√2/2', tan: '1' };
      case 60:
        return { cos: '1/2', sin: '√3/2', tan: '√3' };
      case 90:
        return { cos: '0', sin: '1', tan: 'Undefined' };
      case 120:
        return { cos: '-1/2', sin: '√3/2', tan: '-√3' };
      case 135:
        return { cos: '-√2/2', sin: '√2/2', tan: '-1' };
      case 150:
        return { cos: '-√3/2', sin: '1/2', tan: '-√3/3' };
      case 180:
        return { cos: '-1', sin: '0', tan: '0' };
      case 210:
        return { cos: '-√3/2', sin: '-1/2', tan: '√3/3' };
      case 225:
        return { cos: '-√2/2', sin: '-√2/2', tan: '1' };
      case 240:
        return { cos: '-1/2', sin: '-√3/2', tan: '√3' };
      case 270:
        return { cos: '0', sin: '-1', tan: 'Undefined' };
      case 300:
        return { cos: '1/2', sin: '-√3/2', tan: '-√3' };
      case 315:
        return { cos: '√2/2', sin: '-√2/2', tan: '-1' };
      case 330:
        return { cos: '√3/2', sin: '-1/2', tan: '-√3/3' };
      default:
        return null;
    }
  };

  const exactValues = getTrigExactValues(angle);

  const getArcPath = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    if (endAngle - startAngle <= 0) return '';
    // If angle is full 360, just return simple closed path
    if (endAngle - startAngle >= 360) {
      return `M ${x + radius} ${y} A ${radius} ${radius} 0 1 1 ${x - radius} ${y} A ${radius} ${radius} 0 1 1 ${x + radius} ${y}`;
    }
    const start = polarToCartesian(x, y, radius, startAngle);
    const end = polarToCartesian(x, y, radius, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M", center, center,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y,
      "Z"
    ].join(" ");
  };

  const formatAngleLabel = () => {
    if (trigMode === 'deg') {
      return `${angle}°`;
    } else {
      // Find matches in standard angles
      const std = standardAngles.find(a => a.deg === angle);
      if (std) return std.radLabel;
      // Decimal conversion otherwise
      return `${((angle * Math.PI) / 180).toFixed(3)} rad`;
    }
  };

  const handleInsert = (func: 'sin' | 'cos' | 'tan') => {
    triggerVibration(15);
    const formattedArg = trigMode === 'deg' ? `${angle}` : `${(angle * Math.PI / 180).toFixed(4)}`;
    onInsertExpression(`${func}(${formattedArg})`);
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-200/60 p-5 shadow-sm mt-2 flex flex-col gap-4">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🪐</span>
          <div className="flex flex-col">
            <h3 className="font-extrabold text-xs text-zinc-800 leading-none">Unit Circle Explorer</h3>
            <span className="text-[9px] text-zinc-500 font-bold mt-0.5">Visualize trigonometric ratios interactively</span>
          </div>
        </div>
        
        {/* Toggle between circle visualizer and real world context */}
        <div className="flex bg-zinc-100 rounded-lg p-0.5 shrink-0 border border-zinc-200/50 scale-90">
          <button
            onClick={() => {
              triggerVibration(10);
              setActiveTab('visual');
            }}
            className={`px-2.5 py-1 text-[9px] font-black rounded-md transition-all ${
              activeTab === 'visual'
                ? 'bg-white text-amber-600 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            Circle Visual
          </button>
          <button
            onClick={() => {
              triggerVibration(10);
              setActiveTab('realworld');
            }}
            className={`px-2.5 py-1 text-[9px] font-black rounded-md transition-all ${
              activeTab === 'realworld'
                ? 'bg-white text-amber-600 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-950'
            }`}
          >
            Applications
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'visual' ? (
          <motion.div
            key="visual"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="flex flex-col gap-4"
          >
            {/* Split Screen Layout for visual */}
            <div className="flex flex-col md:flex-row items-center gap-5">
              
              {/* Left Side: SVG Circle */}
              <div className="relative bg-zinc-50/50 p-2.5 rounded-2xl border border-zinc-100/50 shrink-0 select-none">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
                  {/* Grid grid lines */}
                  <line x1={center - r} y1={center} x2={center + r} y2={center} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="2,2" />
                  <line x1={center} y1={center - r} x2={center} y2={center + r} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="2,2" />

                  {/* Axis lines */}
                  <line x1="15" y1={center} x2={size - 15} y2={center} stroke="#71717a" strokeWidth="1.5" />
                  <line x1={center} y1="15" x2={center} y2={size - 15} stroke="#71717a" strokeWidth="1.5" />
                  
                  {/* Axis Label ticks */}
                  <text x={size - 12} y={center + 3} className="text-[9px] font-black text-zinc-500" textAnchor="middle">X</text>
                  <text x={center} y="10" className="text-[9px] font-black text-zinc-500" textAnchor="middle">Y</text>
                  <text x={center + r} y={center + 12} className="text-[8px] font-bold text-zinc-400" textAnchor="middle">1</text>
                  <text x={center - r} y={center + 12} className="text-[8px] font-bold text-zinc-400" textAnchor="middle">-1</text>
                  <text x={center - 8} y={center - r + 3} className="text-[8px] font-bold text-zinc-400" textAnchor="end">1</text>
                  <text x={center - 8} y={center + r + 3} className="text-[8px] font-bold text-zinc-400" textAnchor="end">-1</text>

                  {/* Main Unit Circle */}
                  <circle cx={center} cy={center} r={r} fill="none" stroke="#d4d4d8" strokeWidth="2" />
                  
                  {/* Filled sector representing angle theta */}
                  {angle > 0 && (
                    <path
                      d={getArcPath(center, center, 18, 0, angle)}
                      fill="rgba(245, 158, 11, 0.12)"
                      stroke="#f59e0b"
                      strokeWidth="1"
                    />
                  )}

                  {/* Cosine projection segment (red, along X-axis) */}
                  <line x1={center} y1={center} x2={p.x} y2={center} stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                  {/* Sine projection segment (blue, along Y-axis) */}
                  <line x1={center} y1={center} x2={center} y2={p.y} stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />

                  {/* Dashed guidelines to coordinate point */}
                  <line x1={p.x} y1={p.y} x2={p.x} y2={center} stroke="#3b82f6" strokeWidth="1.2" strokeDasharray="3,3" />
                  <line x1={p.x} y1={p.y} x2={center} y2={p.y} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="3,3" />

                  {/* Terminal Line (Hypotenuse / Radius = 1) */}
                  <line x1={center} y1={center} x2={p.x} y2={p.y} stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Standard angle tick reference dots (clicking standard angles changes angle state) */}
                  {standardAngles.map((ang) => {
                    const tickPos = polarToCartesian(center, center, r, ang.deg);
                    const isSelected = ang.deg === angle;
                    return (
                      <circle
                        key={ang.deg}
                        cx={tickPos.x}
                        cy={tickPos.y}
                        r={isSelected ? "4.5" : "2.5"}
                        fill={isSelected ? "#f59e0b" : "#a1a1aa"}
                        className="cursor-pointer hover:scale-150 transition-all hover:fill-amber-500"
                        onClick={() => {
                          triggerVibration(10);
                          setAngle(ang.deg);
                        }}
                      >
                        <title>{ang.deg}° ({ang.radLabel})</title>
                      </circle>
                    );
                  })}

                  {/* Coordinate Node Dot */}
                  <circle cx={p.x} cy={p.y} r="5.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" className="shadow-xs cursor-pointer" />
                </svg>

                {/* Live Angle floating label on arc */}
                <div className="absolute top-1/2 left-1/2 -translate-x-[20%] -translate-y-[80%] pointer-events-none text-[8px] font-extrabold text-amber-600 bg-amber-50 px-1 py-0.5 rounded shadow-2xs">
                  θ = {formatAngleLabel()}
                </div>
              </div>

              {/* Right Side: Ratios & Formulas info */}
              <div className="flex-1 w-full flex flex-col gap-2 bg-zinc-50/50 border border-zinc-100 p-3 rounded-2xl">
                <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest leading-none">Ratios at θ = {formatAngleLabel()}</div>
                
                <div className="space-y-1.5 mt-1.5">
                  {/* Cosine */}
                  <div className="flex items-center justify-between p-1.5 bg-red-500/[0.02] border border-red-500/10 rounded-xl">
                    <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span>cos(θ) = x</span>
                    </span>
                    <span className="text-xs font-black text-red-600 font-mono">
                      {cosVal.toFixed(4)}
                      {exactValues && <span className="text-[9px] text-red-400 font-bold ml-1">({exactValues.cos})</span>}
                    </span>
                  </div>

                  {/* Sine */}
                  <div className="flex items-center justify-between p-1.5 bg-blue-500/[0.02] border border-blue-500/10 rounded-xl">
                    <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                      <span>sin(θ) = y</span>
                    </span>
                    <span className="text-xs font-black text-blue-600 font-mono">
                      {sinVal.toFixed(4)}
                      {exactValues && <span className="text-[9px] text-blue-400 font-bold ml-1">({exactValues.sin})</span>}
                    </span>
                  </div>

                  {/* Tangent */}
                  <div className="flex items-center justify-between p-1.5 bg-amber-500/[0.02] border border-amber-500/10 rounded-xl">
                    <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span>tan(θ) = y/x</span>
                    </span>
                    <span className="text-xs font-black text-amber-600 font-mono">
                      {tanVal !== null ? tanVal.toFixed(4) : 'Undefined'}
                      {exactValues && tanVal !== null && <span className="text-[9px] text-amber-500/70 font-bold ml-1">({exactValues.tan})</span>}
                    </span>
                  </div>
                </div>

                {/* Exact standard formulas note */}
                <div className="text-[9px] text-zinc-500 leading-tight bg-zinc-100 p-2 rounded-xl mt-1 font-semibold flex items-center gap-1">
                  <span>💡</span>
                  <span>Point on Circle is P(cos θ, sin θ) with Hypotenuse = 1</span>
                </div>
              </div>
            </div>

            {/* Slider control */}
            <div className="flex flex-col gap-1.5 bg-zinc-50/50 border border-zinc-100 p-3 rounded-2xl">
              <div className="flex justify-between items-center text-xs font-bold text-zinc-700">
                <span>Adjust Angle (θ)</span>
                <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md text-[11px] border border-amber-100 font-extrabold">{formatAngleLabel()}</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={angle}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setAngle(val);
                  if (val % 15 === 0) triggerVibration(5);
                }}
                className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-amber-500 outline-none"
              />
              {/* Quick Standard Angle Badges */}
              <div className="flex items-center gap-1 mt-1 overflow-x-auto pb-1 scrollbar-thin">
                <span className="text-[9px] font-extrabold text-zinc-400 uppercase shrink-0 mr-1 select-none">Quick:</span>
                {standardAngles.map((ang) => (
                  <button
                    key={ang.deg}
                    onClick={() => {
                      triggerVibration(10);
                      setAngle(ang.deg);
                    }}
                    className={`px-2 py-0.5 text-[10px] font-extrabold rounded-lg shrink-0 border transition-all ${
                      angle === ang.deg
                        ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-950'
                    }`}
                  >
                    {trigMode === 'deg' ? `${ang.deg}°` : ang.radLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* Insertion Quick-Action Panel */}
            <div className="flex flex-col gap-2 bg-zinc-50 border border-zinc-200/40 p-3 rounded-2xl shrink-0">
              <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">Use in current calculation:</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleInsert('sin')}
                  className="py-2 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-100 hover:border-blue-200 text-blue-600 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95"
                >
                  Insert sin
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleInsert('cos')}
                  className="py-2 px-3 bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 text-red-600 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95"
                >
                  Insert cos
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleInsert('tan')}
                  className="py-2 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-100 hover:border-amber-200 text-amber-600 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95"
                >
                  Insert tan
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="realworld"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="flex flex-col gap-3.5"
          >
            {/* Sine wave application */}
            <div className="p-3 bg-blue-500/[0.02] border border-blue-500/10 rounded-2xl flex gap-3 items-start">
              <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl text-blue-600 shrink-0">
                <Volume2 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-[11px] font-black text-zinc-800 flex items-center gap-1.5">
                  <span>Sine Wave (sin)</span>
                  <span className="text-[8px] font-black bg-blue-100/70 text-blue-700 px-1.5 py-0.5 rounded uppercase">Audio & Physics</span>
                </h4>
                <p className="text-[10px] text-zinc-600 leading-relaxed font-semibold mt-1">
                  Sound waves, Alternating Electrical Current (AC), and sea tides move in periodic sine wave cycles. Audio synthesizers create pure tones by mapping angles to physical sound pressure amplitudes!
                </p>
              </div>
            </div>

            {/* Cosine wave application */}
            <div className="p-3 bg-red-500/[0.02] border border-red-500/10 rounded-2xl flex gap-3 items-start">
              <div className="p-2 bg-red-50 border border-red-100 rounded-xl text-red-600 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-[11px] font-black text-zinc-800 flex items-center gap-1.5">
                  <span>Cosine Wave (cos)</span>
                  <span className="text-[8px] font-black bg-red-100/70 text-red-700 px-1.5 py-0.5 rounded uppercase">Architecture & Graphics</span>
                </h4>
                <p className="text-[10px] text-zinc-600 leading-relaxed font-semibold mt-1">
                  Architects use cosine to calculate physical load distribution on triangular roof trusses and structural pillars. In 3D games and graphics, dot products (cosines) compute the light brightness cast onto surfaces!
                </p>
              </div>
            </div>

            {/* Tangent application */}
            <div className="p-3 bg-amber-500/[0.02] border border-amber-500/10 rounded-2xl flex gap-3 items-start">
              <div className="p-2 bg-amber-50 border border-amber-100 rounded-xl text-amber-600 shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-[11px] font-black text-zinc-800 flex items-center gap-1.5">
                  <span>Tangent (tan)</span>
                  <span className="text-[8px] font-black bg-amber-100/70 text-amber-700 px-1.5 py-0.5 rounded uppercase">Navigation & Grade</span>
                </h4>
                <p className="text-[10px] text-zinc-600 leading-relaxed font-semibold mt-1">
                  Civil engineers calculate road steepness and hill slopes (grades) using tangent. It is also the mathematical engine behind GPS trilateration, flight navigation bearings, and radar distance tracking!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
