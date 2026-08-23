import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowLeft, Mic, BookOpen, Calculator as CalcIcon, X, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import katex from 'katex';
import { triggerVibration } from '../utils/vibrate';
import UnitCircleVisualizer from './UnitCircleVisualizer';

const FORMULA_CATEGORIES = [
  {
    name: 'Algebra',
    formulas: [
      { name: 'Quadratic Formula', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
      { name: 'Difference of Squares', latex: 'a^2 - b^2 = (a-b)(a+b)' },
      { name: 'Exponent Rules', latex: 'x^a \\times x^b = x^{a+b}, \\quad (x^a)^b = x^{ab}' },
      { name: 'Logarithm Rules', latex: '\\log_b(xy) = \\log_b(x) + \\log_b(y)' },
    ]
  },
  {
    name: 'Geometry & Trig',
    formulas: [
      { name: 'Pythagorean Theorem', latex: 'a^2 + b^2 = c^2' },
      { name: 'Area of a Circle', latex: 'A = \\pi r^2' },
      { name: 'Trig Identity', latex: '\\sin^2(\\theta) + \\cos^2(\\theta) = 1' },
      { name: 'Law of Sines', latex: '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}' }
    ]
  },
  {
    name: 'Calculus',
    formulas: [
      { name: 'Power Rule (Derivative)', latex: '\\frac{d}{dx}(x^n) = n x^{n-1}' },
      { name: 'Chain Rule', latex: '\\frac{d}{dx}[f(g(x))] = f\'(g(x))g\'(x)' },
      { name: 'Integration by Parts', latex: '\\int u \\, dv = uv - \\int v \\, du' },
      { name: 'Fundamental Theorem', latex: '\\int_a^b f(x)\\,dx = F(b) - F(a)' }
    ]
  },
  {
    name: 'Statistics & Probability',
    formulas: [
      {
        name: 'Mean (Population)',
        latex: '',
        isUnicode: true,
        unicode: 'μ = (Σx) / n',
        insertText: 'μ = (Σx) / n'
      },
      {
        name: 'Standard Deviation',
        latex: '',
        isUnicode: true,
        unicode: 'σ = √[ Σ(x - μ)² / n ]',
        insertText: 'σ = √[ Σ(x - μ)² / n ]'
      },
      {
        name: 'Variance',
        latex: '',
        isUnicode: true,
        unicode: 'σ² = Σ(x - μ)² / n',
        insertText: 'σ² = Σ(x - μ)² / n'
      },
      {
        name: 'Permutations (Order matters)',
        latex: '',
        isUnicode: true,
        unicode: 'nPr = n! / (n - r)!',
        insertText: 'nPr = n! / (n - r)!'
      },
      {
        name: 'Combinations (Order doesn\'t matter)',
        latex: '',
        isUnicode: true,
        unicode: 'nCr = n! / [ r! (n - r)! ]',
        insertText: 'nCr = n! / [ r! (n - r)! ]'
      }
    ]
  },
  {
    name: 'Vectors & Matrices',
    formulas: [
      {
        name: 'Vector Magnitude',
        latex: '',
        isUnicode: true,
        unicode: '|v| = √(x² + y² + z²)',
        insertText: '|v| = √(x² + y² + z²)'
      },
      {
        name: 'Dot Product',
        latex: '',
        isUnicode: true,
        unicode: 'u · v = (u₁v₁ + u₂v₂ + u₃v₃)',
        insertText: 'u · v = (u1v1 + u2v2 + u3v3)'
      },
      {
        name: 'Cross Product Magnitude',
        latex: '',
        isUnicode: true,
        unicode: '|u × v| = |u| |v| sin(θ)',
        insertText: '|u × v| = |u| |v| sin(θ)'
      },
      {
        name: '2x2 Matrix Determinant',
        latex: '',
        isUnicode: true,
        unicode: 'det(A) = ad - bc',
        insertText: 'det(A) = ad - bc'
      }
    ]
  }
];

interface CalculatorProps {
  onBack: () => void;
  onNavigateToTab?: (tab: string) => void;
}

interface MathRenderProps {
  math: string;
  block?: boolean;
  className?: string;
}

function MathRender({ math, block = false, className = '' }: MathRenderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(math, containerRef.current, {
          displayMode: block,
          throwOnError: false,
          trust: true
        });
      } catch (err) {
        console.error("KaTeX error:", err);
      }
    }
  }, [math, block]);

  return <div ref={containerRef} className={`inline-block ${className}`} />;
}

// Convert expression to valid LaTeX dynamically
const exprToLaTeX = (expr: string): string => {
  if (!expr) return '';
  let latex = expr;

  // 1. Basic symbol normalization
  latex = latex.replace(/π/g, '\\pi');
  latex = latex.replace(/×/g, '\\times');
  latex = latex.replace(/\*/g, '\\times');
  latex = latex.replace(/÷/g, '\\div');
  latex = latex.replace(/\//g, '\\div');
  latex = latex.replace(/−/g, '-');
  
  // Trigonometry operators
  latex = latex.replace(/\bsin\b/g, '\\sin');
  latex = latex.replace(/\bcos\b/g, '\\cos');
  latex = latex.replace(/\btan\b/g, '\\tan');
  latex = latex.replace(/\basin\b/g, '\\arcsin');
  latex = latex.replace(/\bacos\b/g, '\\arccos');
  latex = latex.replace(/\batan\b/g, '\\arctan');

  // 2. Square roots converter: √number or √(...)
  let resultStr = '';
  let i = 0;
  let rootBrackets: number[] = [];
  while (i < latex.length) {
    if (latex[i] === '√') {
      if (latex[i + 1] === '(') {
        resultStr += '\\sqrt{';
        rootBrackets.push(0);
        i += 2;
        continue;
      } else {
        resultStr += '\\sqrt{';
        let j = i + 1;
        while (j < latex.length && /[0-9.xXyY]/.test(latex[j])) {
          j++;
        }
        if (j > i + 1) {
          resultStr += latex.substring(i + 1, j) + '}';
          i = j;
        } else {
          resultStr += '}';
          i++;
        }
        continue;
      }
    }

    if (latex[i] === '(' && rootBrackets.length > 0) {
      rootBrackets[rootBrackets.length - 1]++;
      resultStr += '(';
    } else if (latex[i] === ')' && rootBrackets.length > 0) {
      if (rootBrackets[rootBrackets.length - 1] === 0) {
        resultStr += '}';
        rootBrackets.pop();
      } else {
        rootBrackets[rootBrackets.length - 1]--;
        resultStr += ')';
      }
    } else {
      resultStr += latex[i];
    }
    i++;
  }
  latex = resultStr;

  // 3. Exponents converter: x^2 or (x+y)^2 or number^number
  latex = latex.replace(/\^([^{}\s()+\-/*=]+)/g, '^{$1}');

  // 4. Bracket balancing
  let openBraces = (latex.match(/\{/g) || []).length;
  let closeBraces = (latex.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    latex += '}'.repeat(openBraces - closeBraces);
  }

  return latex;
};

export default function Calculator({ onBack, onNavigateToTab }: CalculatorProps) {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [trigMode, setTrigMode] = useState<'deg' | 'rad'>('deg');
  const [showUnitCircle, setShowUnitCircle] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  const [expandedFormulaCategory, setExpandedFormulaCategory] = useState<string | null>('Algebra');

  // Intelligent word to mathematical symbol converter for students
  const spokenToMath = (text: string): string => {
    let cleaned = text.toLowerCase();
    
    const replacements: { [key: string]: string } = {
      // English & Hindi spoken operators
      'plus': '+',
      ' जोड़ ': ' + ',
      'minus': '-',
      ' घटा ': ' - ',
      'divided by': '/',
      'divide by': '/',
      'divide': '/',
      'divided': '/',
      ' bhag ': ' / ',
      ' multi ': ' * ',
      'multiplied by': '*',
      'multiply by': '*',
      'multiply': '*',
      ' times ': ' * ',
      ' into ': ' * ',
      ' guna ': ' * ',
      'equal to': '=',
      'equals': '=',
      'equal': '=',
      ' barabar ': ' = ',
      'point': '.',
      'decimal': '.',
      ' dash ': '.',
      'dot': '.',
      
      // Variable support (Standard US high school algebra)
      ' x ': ' x ',
      ' y ': ' y ',
      'ex': 'x',
      'wai': 'y',
      'why': 'y',
      'एक्स': 'x',
      'वाई': 'y',
      'वाइ': 'y',
      
      // Advanced operations
      'square root': '√',
      'under root': '√',
      ' root ': ' √ ',
      'power of': '^',
      'power': '^',
      ' raise to ': ' ^ ',
      ' raises to ': ' ^ ',
      'pi': 'π',
      ' पाई ': ' π ',
      'sine of': 'sin(',
      'sine': 'sin(',
      'cosine of': 'cos(',
      'cosine': 'cos(',
      'tangent of': 'tan(',
      'tangent': 'tan(',
      
      // Brackets
      'open bracket': '(',
      'bracket open': '(',
      'open parenthesis': '(',
      'close bracket': ')',
      'bracket close': ')',
      'close parenthesis': ')'
    };

    // Process phrase replacements
    for (const [key, replacement] of Object.entries(replacements)) {
      cleaned = cleaned.split(key).join(replacement);
    }

    // Direct digit spoken translation mapping
    const digitWords: { [key: string]: string } = {
      'zero': '0', 'shunya': '0',
      'one': '1', 'ek': '1',
      'two': '2', 'do': '2',
      'three': '3', 'teen': '3',
      'four': '4', 'char': '4',
      'five': '5', 'panch': '5',
      'six': '6', 'chhah': '6',
      'seven': '7', 'saat': '7',
      'eight': '8', 'aath': '8',
      'nine': '9', 'nau': '9',
      'ten': '10', 'das': '10'
    };

    for (const [word, digit] of Object.entries(digitWords)) {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      cleaned = cleaned.replace(regex, digit);
    }

    // Clean syntax and spacing
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/[^a-zA-Z0-9+\-*/().\s^=√π]/g, '');

    // Normalize multiplication and division display symbols
    cleaned = cleaned
      .replace(/\*/g, '×')
      .replace(/\//g, '÷')
      .replace(/-/g, '−');

    return cleaned;
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setSpeechError("Mic listening not supported in this browser. Please use Chrome/Safari.");
      return;
    }

    triggerVibration([20, 50]);
    setSpeechError(null);

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      // 'en-IN' is brilliant because it captures both English and Hindi accents & digits with superb accuracy
      rec.lang = 'en-IN'; 
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const speechToText = event.results[0][0].transcript;
        console.log("Speech text:", speechToText);
        const mathEquation = spokenToMath(speechToText);
        if (mathEquation) {
          setExpression(prev => prev + (prev ? ' ' : '') + mathEquation);
        }
        triggerVibration(25);
      };

      rec.onerror = (event: any) => {
        console.error("Speech error:", event.error);
        if (event.error === 'not-allowed') {
          setSpeechError("Mic permission blocked! Please allow microphone access.");
        } else {
          setSpeechError(`Retry: ${event.error}`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.start();
      setRecognition(rec);
    } catch (err) {
      console.error("Speech error:", err);
      setSpeechError("Failed to start mic.");
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
    }
    setIsListening(false);
    triggerVibration(15);
  };

  const handleKeyPress = (value: string) => {
    // Tactile feedback: short tap for general keys, double tap for equals
    if (value === '=') {
      triggerVibration([15, 30, 15]);
    } else {
      triggerVibration(15);
    }

    if (value === 'C') {
      setExpression('');
      setResult('');
    } else if (value === '⌫') {
      setExpression(prev => prev.slice(0, -1));
    } else if (value === '=') {
      if (!expression.trim()) return;
      
      let localCalculatedResult = '';
      let isAlgebra = expression.includes('x') || expression.includes('y') || expression.includes('=');
      
      if (!isAlgebra) {
        try {
          let sanitized = expression
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/−/g, '-')
            .replace(/π/g, 'Math.PI')
            .replace(/\^/g, '**');

          // Handle square roots
          sanitized = sanitized.replace(/√(\d+(\.\d+)?)/g, 'Math.sqrt($1)');
          sanitized = sanitized.replace(/√\(/g, 'Math.sqrt(');

          // Handle implicit multiplication
          sanitized = sanitized.replace(/(\d)\s*(sin|cos|tan|asin|acos|atan|Math\.PI|Math\.sqrt|\()/g, '$1*$2');
          sanitized = sanitized.replace(/(\))\s*(sin|cos|tan|asin|acos|atan|Math\.PI|Math\.sqrt|\(|\d)/g, '$1*$2');
          sanitized = sanitized.replace(/(Math\.PI)\s*(sin|cos|tan|asin|acos|atan|Math\.PI|Math\.sqrt|\(|\d)/g, '$1*$2');

          // Automatically balance unbalanced parentheses before passing to parser
          let openParens = (sanitized.match(/\(/g) || []).length;
          let closeParens = (sanitized.match(/\)/g) || []).length;
          if (openParens > closeParens) {
            sanitized += ')'.repeat(openParens - closeParens);
          }

          const allowedChars = sanitized.replace(/[^0-9+\-*/().\s|Math\.PI|Math\.sqrt|**|sin|cos|tan|asin|acos|atan]/g, '');
          
          if (allowedChars.trim()) {
            const isDeg = trigMode === 'deg';
            const degToRad = (val: number) => (val * Math.PI) / 180;
            const radToDeg = (val: number) => (val * 180) / Math.PI;

            const sin = (x: number) => Math.sin(isDeg ? degToRad(x) : x);
            const cos = (x: number) => Math.cos(isDeg ? degToRad(x) : x);
            const tan = (x: number) => {
              const radians = isDeg ? degToRad(x) : x;
              if (Math.abs(Math.cos(radians)) < 1e-12) return NaN;
              return Math.tan(radians);
            };
            const asin = (x: number) => isDeg ? radToDeg(Math.asin(x)) : Math.asin(x);
            const acos = (x: number) => isDeg ? radToDeg(Math.acos(x)) : Math.acos(x);
            const atan = (x: number) => isDeg ? radToDeg(Math.atan(x)) : Math.atan(x);

            const evalResult = new Function(
              'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'Math',
              `return (${allowedChars})`
            )(sin, cos, tan, asin, acos, atan, Math);

            if (isNaN(evalResult) || !isFinite(evalResult)) {
              setResult('Error');
            } else {
              const formattedResult = Number.isInteger(evalResult)
                ? String(evalResult)
                : String(Number(evalResult.toFixed(6)));
              localCalculatedResult = formattedResult;
              setResult(localCalculatedResult);
            }
          }
        } catch (err) {
          console.error("Evaluation error:", err);
          
          // Check if parenthesis are unbalanced
          const origOpen = (expression.match(/\(/g) || []).length;
          const origClose = (expression.match(/\)/g) || []).length;
          if (origOpen !== origClose) {
            setResult('Please close all brackets.');
          } else {
            const parts = expression.trim().split(/\s+/);
            if (parts.length >= 2) {
              setResult(`Did you mean to multiply ${parts[0]} and ${parts[1]}? Please add an operator (+, -, *, /).`);
            } else {
              setResult('Syntax error. Please add an operator (+, -, *, /) or check brackets.');
            }
          }
        }
      } else {
        setResult("Tap 'Explain with AI'");
      }
    } else {
      // Prevent consecutive operators
      const lastChar = expression.slice(-1);
      const isOperator = ['+', '−', '×', '÷'].includes(value);
      const isLastOperator = ['+', '−', '×', '÷'].includes(lastChar);
      
      if (isOperator && isLastOperator) {
        setExpression(prev => prev.slice(0, -1) + value);
      } else {
        setExpression(prev => prev + value);
      }
    }
  };

  const buttons = [
    ['(', ')', 'C', '⌫'],
    ['7', '8', '9', '÷'],
    ['4', '5', '6', '×'],
    ['1', '2', '3', '−'],
    ['0', '.', '=', '+']
  ];

  return (
    <div className="flex flex-col h-full bg-[#faf9f6] text-zinc-900 overflow-y-auto">
      {/* Header */}
      <header className="px-6 py-5 bg-white border-b border-zinc-100 flex justify-between items-center sticky top-0 z-10">
        <button 
          onClick={() => {
            triggerVibration(15);
            onBack();
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 hover:text-zinc-950 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black tracking-tight text-zinc-800 flex items-center gap-1.5">
          <CalcIcon className="w-5 h-5 text-indigo-600 animate-pulse" /> AI Math Solver
        </h1>
        <button
          onClick={() => {
            triggerVibration(15);
            setShowFormulas(true);
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 hover:text-zinc-950 transition-colors"
          title="Quick Formulas"
        >
          <BookOpen className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 p-6 flex flex-col gap-6 max-w-md mx-auto w-full">
        {/* Left Side: Standard Calculator */}
        <div className="flex-1 flex flex-col bg-white rounded-[2rem] border border-zinc-200/60 p-6 shadow-sm">
          {/* Display screen */}
          <div className="bg-zinc-50 rounded-2xl p-5 mb-4 border border-zinc-100 flex flex-col gap-3 min-h-[140px] w-full focus-within:border-amber-500/30 focus-within:ring-1 focus-within:ring-amber-500/20 transition-all relative">
            
            {/* Top row with Mic button & Input field */}
            <div className="flex items-center justify-between w-full gap-3 border-b border-zinc-200/50 pb-2">
              {/* Mic Icon Button */}
              <button
                onClick={isListening ? stopListening : startListening}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border shrink-0 ${
                  isListening 
                    ? 'bg-rose-500 border-rose-600 text-white shadow-md shadow-rose-500/25 animate-pulse' 
                    : 'bg-white hover:bg-zinc-100 border-zinc-200/80 text-zinc-500 hover:text-zinc-950 shadow-sm'
                }`}
                title="Speak Equation"
              >
                {isListening ? (
                  <span className="relative flex h-4 w-4 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <Mic className="relative w-4 h-4 text-white" />
                  </span>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              <input
                type="text"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleKeyPress('=');
                  }
                }}
                placeholder="Type or speak equation..."
                className="flex-1 bg-transparent text-right text-zinc-600 text-sm font-semibold tracking-wider focus:outline-none focus:ring-0 border-none p-0 selection:bg-amber-200/50"
              />
            </div>

            {/* Middle Row: Live LaTeX Render */}
            <div className="flex flex-col items-end justify-center min-h-[44px] py-1.5 px-2 bg-amber-500/[0.02] rounded-xl border border-amber-500/[0.05] overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-zinc-200">
              {expression ? (
                <div className="flex items-center justify-end w-full gap-2">
                  <span className="text-[8px] font-black text-amber-600 bg-amber-100/70 px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 shrink-0">Live LaTeX</span>
                  <MathRender math={exprToLaTeX(expression)} className="text-base font-bold text-zinc-800" />
                </div>
              ) : (
                <span className="text-[11px] text-zinc-400 font-medium italic">LaTeX preview will render here...</span>
              )}
            </div>

            {/* Bottom Row: Result & Status */}
            <div className="flex justify-between items-end w-full pt-1.5 border-t border-zinc-200/50">
              <div className="text-[10px] font-bold uppercase tracking-wider">
                {isListening ? (
                  <span className="text-rose-500 flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Listening...
                  </span>
                ) : speechError ? (
                  <span className="text-amber-500 font-semibold normal-case">{speechError}</span>
                ) : (
                  <span className="text-zinc-400">Math Input</span>
                )}
              </div>
              <div className="text-zinc-800 text-2xl font-black tracking-tight max-w-[80%] truncate">
                {result || '0'}
              </div>
            </div>

          </div>

          {/* Step-by-Step Breakdown is always enabled by default behind the scenes, toggle switch removed per user request */}

          {/* Advanced Math & Trig Toggles */}
          <div className="flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 mb-4">
            <button
              onClick={() => {
                triggerVibration(10);
                setIsAdvanced(!isAdvanced);
              }}
              className="flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 hover:text-zinc-950 px-3 sm:px-4 py-2 rounded-full font-black text-xs tracking-tight transition-all active:scale-95 border border-zinc-200/40 shadow-xs shrink-0"
            >
              <span className="truncate">Advanced Math</span>
              <span className="text-zinc-400 font-bold shrink-0">{isAdvanced ? '▴' : '▾'}</span>
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2 max-w-full overflow-hidden">
              <button
                onClick={() => {
                  triggerVibration(10);
                  setTrigMode(trigMode === 'deg' ? 'rad' : 'deg');
                }}
                className="flex items-center bg-zinc-100 rounded-full border border-zinc-200/50 p-0.5 shrink-0"
              >
                <div className={`px-2 sm:px-2.5 py-1 text-[10px] font-black rounded-full transition-all ${trigMode === 'deg' ? 'bg-white text-amber-600 shadow-xs' : 'text-zinc-500 hover:text-zinc-950'}`}>DEG</div>
                <div className={`px-2 sm:px-2.5 py-1 text-[10px] font-black rounded-full transition-all ${trigMode === 'rad' ? 'bg-white text-amber-600 shadow-xs' : 'text-zinc-500 hover:text-zinc-950'}`}>RAD</div>
              </button>
              <button
                onClick={() => {
                  triggerVibration(10);
                  setShowUnitCircle(!showUnitCircle);
                }}
                className={`rainbow-glow-btn flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full font-black text-[11px] sm:text-xs text-white tracking-tight transition-all active:scale-95 shadow-md shrink-0 max-w-full overflow-hidden whitespace-nowrap cursor-pointer ${
                  showUnitCircle
                    ? 'ring-2 ring-white/90 brightness-110 scale-[1.03]'
                    : 'hover:brightness-105 opacity-95'
                }`}
                title="Interactive Unit Circle Explorer"
              >
                <span className="text-xs">🪐</span>
                <span className="truncate font-black drop-shadow-xs">Unit Circle</span>
                <span className="text-[10px] animate-pulse">✨</span>
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showUnitCircle && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                animate={{ height: 'auto', opacity: 1, marginBottom: 16 }}
                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden shrink-0"
              >
                <UnitCircleVisualizer trigMode={trigMode} onInsertExpression={(expr) => setExpression(prev => prev + expr)} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {isAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                animate={{ height: 'auto', opacity: 1, marginBottom: 16 }}
                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden shrink-0 flex flex-col gap-2.5"
              >
                <div className="grid grid-cols-5 gap-2.5">
                  {[
                    { val: 'x', label: 'x' },
                    { val: 'y', label: 'y' },
                    { val: '√', label: '√' },
                    { val: '^', label: '^' },
                    { val: 'π', label: 'π' }
                  ].map((btn) => (
                    <button
                      key={btn.val}
                      onClick={() => {
                        triggerVibration(15);
                        if (btn.val === '√') {
                          setExpression(prev => prev + '√(');
                        } else {
                          setExpression(prev => prev + btn.val);
                        }
                      }}
                      className="h-10 rounded-2xl font-black text-sm flex items-center justify-center transition-all bg-purple-50/70 hover:bg-purple-100/90 text-purple-600 border border-purple-100/50 shadow-xs"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {['sin', 'cos', 'tan', 'arcsin'].map((func) => (
                    <button
                      key={func}
                      onClick={() => {
                        triggerVibration(15);
                        setExpression(prev => prev + (func === 'arcsin' ? 'asin(' : `${func}(`));
                      }}
                      className="h-10 rounded-2xl font-black text-xs flex items-center justify-center transition-all bg-teal-50/70 hover:bg-teal-100/90 text-teal-700 border border-teal-100/50 shadow-xs uppercase"
                    >
                      {func}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Calculator Grid */}
          <div className="grid grid-cols-4 gap-3">
            {buttons.map((row, i) => (
              <React.Fragment key={i}>
                {row.map((btn) => {
                  const isOperator = ['÷', '×', '−', '+', '='].includes(btn);
                  const isClear = ['C', '⌫'].includes(btn);
                  const isEquals = btn === '=';
                  
                  return (
                    <button
                      key={btn}
                      onClick={() => handleKeyPress(btn)}
                      className={`h-14 rounded-2xl font-bold text-lg flex items-center justify-center transition-all ${
                        isEquals 
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-orange-500/10' 
                          : isOperator 
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/15' 
                            : isClear 
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/15'
                              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200/40'
                      }`}
                    >
                      {btn}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* AI Explain Helper Callout */}
          <button
            onClick={() => {
              triggerVibration(25);
              const event = new CustomEvent('study-calculator-send-to-tutor', {
                detail: { expression }
              });
              window.dispatchEvent(event);
              onNavigateToTab?.('aitutor');
            }}
            disabled={!expression}
            className={`mt-5 w-full py-4 px-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
              expression 
                ? 'bg-zinc-950 text-white hover:bg-zinc-900 shadow-md shadow-zinc-950/10 cursor-pointer' 
                : 'bg-zinc-100 text-zinc-400 border border-zinc-200/40 cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            <span>Explain Step-by-Step with AI</span>
          </button>
        </div>
      </div>

      {/* Quick Formulas Drawer */}
      <AnimatePresence>
        {showFormulas && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFormulas(false)}
              className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-white rounded-t-[2rem] z-[70] flex flex-col shadow-2xl border-t border-zinc-200"
            >
              <div className="flex-1 overflow-y-auto w-full max-w-md mx-auto relative flex flex-col rounded-t-[2rem]">
                <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-6 pt-6 pb-4 border-b border-zinc-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-amber-500" />
                      Quick Formulas
                    </h2>
                    <p className="text-[11px] text-zinc-500 font-medium mt-1">Tap any formula to insert into calculator</p>
                  </div>
                  <button
                    onClick={() => {
                      triggerVibration(15);
                      setShowFormulas(false);
                    }}
                    className="w-8 h-8 bg-zinc-100 hover:bg-zinc-200 rounded-full flex items-center justify-center text-zinc-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="p-6 space-y-6">
                  {FORMULA_CATEGORIES.map((category) => (
                    <div key={category.name} className="space-y-3">
                      <button
                        onClick={() => {
                          triggerVibration(10);
                          setExpandedFormulaCategory(expandedFormulaCategory === category.name ? null : category.name);
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-100 hover:border-amber-200/50 transition-colors"
                      >
                        <span className="font-bold text-sm text-zinc-800">{category.name}</span>
                        {expandedFormulaCategory === category.name ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400" />
                        )}
                      </button>
                      
                      <AnimatePresence>
                        {expandedFormulaCategory === category.name && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="grid grid-cols-1 gap-2 pl-2">
                              {category.formulas.map((formula, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    triggerVibration(15);
                                    const insertText = (formula as any).insertText || (formula.latex ? formula.latex.replace(/\\/g, '').replace(/frac/g, '').replace(/\{|\}/g, '') : '');
                                    setExpression(prev => prev + insertText);
                                    setShowFormulas(false);
                                  }}
                                  className="text-left p-3 rounded-xl bg-white border border-zinc-200/50 hover:bg-amber-50/30 hover:border-amber-200 transition-all flex flex-col gap-2 group"
                                >
                                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider group-hover:text-amber-600 transition-colors">{formula.name}</span>
                                  <div className="overflow-x-auto pb-1 scrollbar-none pointer-events-none">
                                    {(formula as any).isUnicode ? (
                                      <span className="text-xs font-semibold text-zinc-800 font-mono">{(formula as any).unicode}</span>
                                    ) : (
                                      <MathRender math={formula.latex} />
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
