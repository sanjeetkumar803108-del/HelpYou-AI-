import React, { useMemo, memo } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

interface GlobalMarkdownProps {
  children: string;
  className?: string;
  components?: any;
}

const SUPERSCRIPTS_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ'
};

/**
 * Universal Unicode superscript converter for physics/chemistry units and exponents.
 * Transforms 'm/s^2' -> 'm/s²', 'cm^3' -> 'cm³', 's^-1' -> 's⁻¹' etc.
 */
export function healUnitSuperscripts(content: string): string {
  if (!content) return '';
  let str = String(content);
  // Match units with caret exponents outside LaTeX delimiters: m/s^2, km/h^2, cm^3, m^2, kg/m^3, s^-1, etc.
  str = str.replace(/(\b[a-zA-Z]+(?:\/[a-zA-Z]+)?)\^([0-9+\-n]+)\b/g, (_match, unit, exp) => {
    const superExp = exp.split('').map((ch: string) => SUPERSCRIPTS_MAP[ch] || ch).join('');
    return `${unit}${superExp}`;
  });
  return str;
}

/**
 * Normalizes and heals math/chemical equations for student-friendly crystal-clear KaTeX rendering:
 * 1. Restores escaped/eaten ASCII control codes (\x0D carriage return -> \r, \x09 tab -> \t, etc.)
 * 2. Normalizes double-escaped LaTeX commands (\\text -> \text, \\quad -> \quad)
 * 3. Repairs broken arrow commands like "ightarrow" -> "\rightarrow"
 * 4. Ensures unmatched $$ block delimiters are cleanly balanced to prevent red error leaks.
 */
export function cleanMarkdownMath(content: string): string {
  if (!content) return '';
  let text = healUnitSuperscripts(String(content));

  // Deduplicate accidental double backslashes before known LaTeX commands
  text = text.replace(/\\\\(text|frac|sqrt|quad|qquad|approx|rightarrow|leftarrow|Rightarrow|Leftarrow|cdot|times|pm|left|right|theta|pi|alpha|beta|gamma|delta|lambda|mu|sigma|omega|Delta|Omega|sin|cos|tan|log|ln|lim|sum|int|partial|boxed|mathbf|mathrm)\b/g, '\\$1');

  // 1. Repair escaped or eaten control characters in LaTeX math formulas using exact ASCII hex codes:
  // \x0D = carriage return (\r)
  text = text.replace(/\x0D(ightarrow|ho|ight|angle|eal|m|oot|ceil|floor)/g, '\\r$1');
  // \x09 = tab (\t)
  text = text.replace(/\x09(heta|ext|imes|an|au|o|ilde|ag|op|extbf|extit)/g, '\\t$1');
  // \x0C = form feed (\f)
  text = text.replace(/\x0C(rac|orall|lat|oot)/g, '\\f$1');
  // \x08 = backspace (\b)
  text = text.replace(/\x08(eta|egin|ar|ig|oldsymbol|inom|ot|ullet|f|mod)/g, '\\b$1');
  // \x0A = newline (\n)
  text = text.replace(/\x0A(eq|abla|otin|atural|earrow|warrow)/g, '\\n$1');

  // 2. Fix broken/clipped arrow tokens (e.g. "ightarrow" -> "\rightarrow")
  text = text.replace(/(^|[\s$(=_])ightarrow([\s$_^0-9A-Za-z])/g, '$1\\rightarrow$2');
  text = text.replace(/(^|[\s$(=_])rac\{/g, '$1\\frac{');
  text = text.replace(/(^|[\s$(=_])ext\{/g, '$1\\text{');
  text = text.replace(/(^|[\s$(=_])heta([\s$_^0-9A-Za-z])/g, '$1\\theta$2');

  // 3. Fix unclosed/unmatched $$ on single line
  const lines = text.split('\n');
  const fixedLines = lines.map(line => {
    const trimmed = line.trim();
    const count = (trimmed.match(/\$\$/g) || []).length;
    if (count === 1) {
      if (trimmed.endsWith('$$')) {
        return '$$' + trimmed;
      } else if (trimmed.startsWith('$$')) {
        return trimmed + '$$';
      }
    }
    return line;
  });
  // 4. Deduplicate accidental double answers before \boxed{...} (e.g. "1 + 4 = 5 \boxed{5}" -> "1 + 4 = \boxed{5}")
  text = text.replace(/([=:])\s*([0-9a-zA-Z._\-]+|\\[a-zA-Z]+(?:\{[^{}]*\})+)\s*(?:\\quad|\\;|\\,|~|\s)*\\boxed\{\s*\2\s*\}/g, '$1 \\boxed{$2}');
  text = text.replace(/(?<=[=+\-*/(\s]|^)([0-9a-zA-Z._\-]+|\\[a-zA-Z]+(?:\{[^{}]*\})+)\s*(?:\\quad|\\;|\\,|~|\s)*\\boxed\{\s*\1\s*\}/g, '\\boxed{$1}');
  text = text.replace(/=\s*([0-9a-zA-Z._\-]+|\\[a-zA-Z]+(?:\{[^{}]*\})+)\s*\${1,2}\s*\${1,2}\s*\\boxed\{\s*\1\s*\}/g, '= \\boxed{$1}');

  // Normalize LaTeX diacritics/accents into clean Unicode (e.g. Schr\ddot{o}dinger -> Schrödinger, M\ddot{o}bius -> Möbius, Amp\`ere -> Ampère)
  text = text.replace(/\\(?:ddot|\"|'|`|\^)\{?([a-zA-Z])\}?/g, (match, char) => {
    const c = char.toLowerCase();
    const isUpper = char === char.toUpperCase();
    if (match.includes('ddot') || match.includes('"')) {
      if (c === 'o') return isUpper ? 'Ö' : 'ö';
      if (c === 'u') return isUpper ? 'Ü' : 'ü';
      if (c === 'a') return isUpper ? 'Ä' : 'ä';
    }
    if (match.includes("'")) {
      if (c === 'e') return isUpper ? 'É' : 'é';
      if (c === 'a') return isUpper ? 'Á' : 'á';
    }
    if (match.includes('`')) {
      if (c === 'e') return isUpper ? 'È' : 'è';
      if (c === 'a') return isUpper ? 'À' : 'à';
    }
    if (match.includes('^')) {
      if (c === 'o') return isUpper ? 'Ô' : 'ô';
      if (c === 'e') return isUpper ? 'Ê' : 'ê';
    }
    return char;
  });

  // Heal literal '\n' text sequences (e.g. "What is Quantum Physics?\nQuantum physics...")
  // into actual paragraph linebreaks, preserving valid LaTeX commands starting with \n
  text = text.replace(/([?!:])\s*\\n\s*/g, '$1\n\n');
  text = text.replace(/\\n(?!(?:eq|abla|otin|atural|earrow|warrow|nu\b|not\b|neg\b|nexists|nsim|nleq|ngeq))/g, '\n\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

const ENGLISH_STOPWORDS = new Set([
  'what', 'is', 'the', 'derivative', 'of', 'with', 'respect', 'to', 'in', 'for', 'and', 'or', 'so',
  'using', 'product', 'rule', 'here', 'therefore', 'linear', 'equations', 'have', 'constant', 'rate',
  'change', 'form', 'calculate', 'limit', 'as', 'value', 'solve', 'which', 'following', 'represents',
  'because', 'this', 'that', 'from', 'where', 'then', 'when', 'if', 'does', 'not', 'true', 'false',
  'statement', 'concept', 'step', 'first', 'second', 'both', 'sides', 'divide', 'by', 'add', 'subtract',
  'multiply', 'substitute', 'hence', 'thus', 'answer', 'correct', 'option', 'explanation', 'notice'
]);

/**
 * Token-safe replacer: applies a regex replacement only on text segments that are OUTSIDE of $...$ delimiters.
 */
function replaceOutsideMath(text: string, regex: RegExp, replacer: ((substring: string, ...args: any[]) => string) | string): string {
  const parts = text.split('$');
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) {
      parts[i] = typeof replacer === 'string'
        ? parts[i].replace(regex, replacer)
        : parts[i].replace(regex, replacer as any);
    }
  }
  return parts.join('$');
}

/**
 * Dedicated math, LaTeX, subscript, and superscript healer for "What to do next" suggestions:
 * 1. Restores escaped/eaten ASCII control characters via cleanMarkdownMath.
 * 2. Downgrades block math ($$) to inline math ($) so suggestions remain compact and single-line.
 * 3. Auto-wraps unwrapped LaTeX commands in $...$ token-safely.
 * 4. Auto-converts isolated superscripts (x^2, 10^5, e^x) and subscripts (x_1, H_2O).
 */
export function formatSuggestionMath(content: string): string {
  if (!content) return '';
  let text = cleanMarkdownMath(String(content)).trim();
  text = text.replace(/\$\$/g, '$');

  // A. Auto-wrap full LaTeX expressions with arguments (\frac{...}{...}, \sqrt{...}, \boxed{...})
  text = replaceOutsideMath(text, /(\\frac\{[^{}]*\}\{[^{}]*\}|\\sqrt(?:\[[^\]]*\])?\{[^{}]*\}|\\boxed\{[^{}]*\})/g, '$$$1$$');

  // B. Auto-wrap standalone LaTeX symbols
  text = replaceOutsideMath(text, /(\\(?:alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|Delta|Omega|pm|times|div|leq|geq|neq|approx|infty|cdot|to|rightarrow|partial|int|sum|prod|lim|sin|cos|tan|log|ln)\b)/g, '$$$1$$');

  // C. Auto-wrap superscripts outside math
  text = replaceOutsideMath(text, /([a-zA-Z0-9)\]]+)\^(\{[^{}]+\}|-?[0-9]+|[a-zA-Z](?![a-zA-Z]))/g, '$$$1^$2$$');

  // D. Auto-wrap subscripts outside math
  text = replaceOutsideMath(text, /([a-zA-Z0-9)\]]+)_(\{[^{}]+\}|[0-9]+|[a-zA-Z](?![a-zA-Z]))/g, '$$$1_$2$$');

  // E. Clean up delimiters
  text = text.replace(/\$\$/g, '$');
  text = text.replace(/\$\s*\$/g, ' ');
  text = text.replace(/\$\$/g, '');
  text = text.replace(/\$\s+\$/g, ' ');

  // F. Strip invalid math mode wrappers around English possessive words or plain text names (e.g. $Schrödinger's$ -> Schrödinger's)
  text = text.replace(/\$([^\$\n]+)'s\$/g, "$1's");
  text = text.replace(/\$([^\$\n]+)'([a-zA-Z]+)\$/g, "$1'$2");
  text = text.replace(/\$([a-zA-Z\u00C0-\u024F\s]{3,})\$/g, "$1");
  text = text.replace(/\$([a-zA-Z\u00C0-\u024F\s]{3,})'s\$/g, "$1's");

  return text;
}

const MATH_OPERATOR_WORDS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'exp', 'lim',
  'dx', 'dy', 'dt', 'text', 'frac', 'sqrt', 'left', 'right', 'cdot',
  'theta', 'alpha', 'beta', 'gamma', 'delta', 'circ', 'rad', 'deg'
]);

function healSingleQuizLine(line: string): string {
  const l = line.trim();
  if (!l) return line;

  // 1. Quiz options e.g. "A) 3x^2 * e^x + x^3 * e^x" or "A) $3x^2 \cdot e^x$"
  const optionPrefixMatch = line.match(/^([A-Da-d][\)\.]|\([A-Da-d]\))\s*/);
  if (optionPrefixMatch) {
    const prefix = optionPrefixMatch[0];
    const body = line.slice(prefix.length).trim();
    if (body.startsWith('$') && body.endsWith('$')) {
      return line;
    }
    if (/[\^_=+\-*/\\√≤≥≠]/.test(body) || /\b(?:sin|cos|tan|log|ln|sqrt|frac)\b/.test(body)) {
      let mathBody = body.replace(/^\$|\$$/g, '').trim();
      mathBody = mathBody.replace(/(?<=[a-zA-Z0-9)\]^_])\s*\*\s*(?=[a-zA-Z0-9(\[^\\])/g, ' \\cdot ');
      mathBody = mathBody.replace(/(?<![a-zA-Z\\])(cos|sin|tan|sec|csc|cot|log|ln)\b/g, (_, fn) => '\\' + fn);
      return `${prefix}$${mathBody}$`;
    }
  }

  // 2. Colons preceding a pure mathematical equation or derivation:
  // e.g. "gives: v_{0x}=v_0cos(\theta)$" or "hypotenuse: \cos(\theta) = \frac{\text{Adjacent}}{\text{Hypotenuse}} = \frac{v_{0x}}{v_0}"
  const colonIdx = line.indexOf(':');
  if (colonIdx !== -1) {
    const prefix = line.slice(0, colonIdx + 1);
    const rest = line.slice(colonIdx + 1).trim();

    // Check English narrative words in rest (excluding LaTeX math operators)
    const words = rest.replace(/\\[a-zA-Z]+(?:\{[^{}]*\}|\[[^\]]*\]|_\{[^{}]*\}|\^\{[^{}]*\})*/g, '').match(/[a-zA-Z]{3,}/g) || [];
    const narrativeWords = words.filter(w => !MATH_OPERATOR_WORDS.has(w.toLowerCase()));

    // If rest is essentially a mathematical equation rather than an English sentence
    if (narrativeWords.length <= 2) {
      const hasLatex = /\\(?:frac|sqrt|left|right|cos|sin|tan|theta|cdot|text|circ|alpha|beta|pm|times|lim|sum|int)\b/.test(rest);
      const hasMathChars = /[=+\-*/]/.test(rest) && /[\\_{}^]/.test(rest);

      if (hasLatex || hasMathChars) {
        let cleanRest = rest.replace(/^\$|\$$/g, '').trim();
        cleanRest = cleanRest.replace(/(?<![a-zA-Z\\])(cos|sin|tan|sec|csc|cot|log|ln)\b/g, (_, fn) => '\\' + fn);
        return `${prefix} $${cleanRest}$`;
      }
    }
  }

  // 3. Standalone equation lines without colons:
  // e.g. "\cos(\theta) = \frac{\text{Adjacent}}{\text{Hypotenuse}} = \frac{v_{0x}}{v_0}"
  // or "v_{0x} = \left(\frac{20}{2}\right) \sqrt{3}= 10\sqrt{3}\text{ m/s}"
  // or "\lim_{x \to 0} \frac{\sin(x)}{x} = 1"
  const isEquationStart = /^\\(?:frac|sqrt|left|cos|sin|tan|sum|int|lim|prod|alpha|beta|theta)\b/i.test(l) ||
    /^\\(?:lim|sum|int|prod)[_^(]/i.test(l) ||
    (/^[a-zA-Z0-9_{}()\\^]+\s*=\s*.+/.test(l) && /\\(?:frac|sqrt|left|right|cos|sin|tan|cdot|text|theta|circ)\b/.test(l));

  if (isEquationStart) {
    const words = l.replace(/\\[a-zA-Z]+(?:\{[^{}]*\}|\[[^\]]*\]|_\{[^{}]*\}|\^\{[^{}]*\})*/g, '').match(/[a-zA-Z]{3,}/g) || [];
    const narrativeWords = words.filter(w => !MATH_OPERATOR_WORDS.has(w.toLowerCase()));
    if (narrativeWords.length <= 2) {
      let cleanLine = l.replace(/^\$|\$$/g, '').trim();
      cleanLine = cleanLine.replace(/(?<![a-zA-Z\\])(cos|sin|tan|sec|csc|cot|log|ln)\b/g, (_, fn) => '\\' + fn);
      return `$${cleanLine}$`;
    }
  }

  // 4. Mixed lines with narrative text and inline formulas:
  // Protect already valid $...$ blocks by substituting with placeholders
  let mixed = line;
  const mathBlocks: string[] = [];
  mixed = mixed.replace(/\$[^$]+\$/g, (m) => {
    mathBlocks.push(m);
    return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
  });

  // Convert raw * to \cdot between math variables
  mixed = mixed.replace(/(?<=[a-zA-Z0-9)\]^_])\s*\*\s*(?=[a-zA-Z0-9(\[^\\])/g, ' \\cdot ');

  // Wrap unquoted LaTeX expressions including function arguments like \sin(30^\circ) and \sqrt{3}\text{ m/s}^2
  mixed = mixed.replace(/(?<![\w\\])([0-9a-zA-Z_^{}().\-]*\\[a-zA-Z]+(?:\([^)\n]*\)|\[[^\]\n]*\]|\{[^{}\n]*\})*(?:[0-9a-zA-Z_^{}().+*=/.\s\\-]*\\text\{[^{}]*\}(?:\^\{[^{}]*\}|\^[0-9a-zA-Z]+|_\{[^{}]*\}|_[0-9a-zA-Z]+)?)?)/g, (match) => {
    const trimmed = match.trim();
    if (trimmed.includes('\\') && !trimmed.startsWith('__MATH_BLOCK_')) {
      return `$${trimmed}$`;
    }
    return match;
  });

  return mixed;
}

/**
 * Dedicated math, LaTeX, subscript, and superscript healer for AI Quizzes:
 * Transforms Questions, Options, Explanations, and Step-by-Step solutions
 * into valid, clean KaTeX inline math while preventing delimiter leaks.
 */
export function formatQuizMath(content: string): string {
  if (!content) return '';
  const text = cleanMarkdownMath(String(content)).trim();
  if (text.includes('```')) return text;
  const lines = text.split('\n');
  return lines.map(healSingleQuizLine).join('\n');
}

export const prepareQuizMath = formatQuizMath;


const remarkPluginsList = [remarkMath, remarkGfm];
const rehypePluginsList: any[] = [rehypeRaw, [rehypeKatex, { strict: false, throwOnError: false }]];

const defaultComponents = {
  h1: ({ node, ...props }: any) => (
    <h1 className="text-base sm:text-lg font-bold text-zinc-900 mt-4 mb-2 tracking-tight leading-snug break-words" {...props} />
  ),
  h2: ({ node, ...props }: any) => (
    <h2 className="text-sm sm:text-base font-bold text-zinc-900 mt-3.5 mb-1.5 tracking-tight leading-snug break-words" {...props} />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="text-xs sm:text-sm font-bold text-zinc-800 mt-3 mb-1 tracking-tight leading-snug break-words" {...props} />
  ),
  h4: ({ node, ...props }: any) => (
    <h4 className="text-xs font-bold text-zinc-700 mt-2 mb-1 tracking-tight leading-snug break-words" {...props} />
  ),
  p: ({ node, ...props }: any) => (
    <p className="text-xs sm:text-[13px] text-zinc-800 font-normal leading-relaxed my-2 break-words" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="list-disc pl-4 space-y-1 my-2 text-xs sm:text-[13px] text-zinc-800 leading-relaxed" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol className="list-decimal pl-4 space-y-1 my-2 text-xs sm:text-[13px] text-zinc-800 leading-relaxed" {...props} />
  ),
  li: ({ node, ...props }: any) => (
    <li className="leading-relaxed" {...props} />
  ),
  table: ({ node, ...props }: any) => (
    <div className="overflow-x-auto my-4 rounded-xl border border-zinc-200 shadow-2xs">
      <table className="w-full text-left border-collapse text-xs sm:text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }: any) => (
    <thead className="bg-zinc-50/90 border-b border-zinc-200" {...props} />
  ),
  th: ({ node, ...props }: any) => (
    <th className="px-3.5 py-2.5 font-bold text-zinc-800 border-b border-zinc-200 whitespace-nowrap text-xs" {...props} />
  ),
  td: ({ node, ...props }: any) => (
    <td className="px-3.5 py-2.5 border-b border-zinc-100 text-zinc-700 text-xs" {...props} />
  ),
  tr: ({ node, ...props }: any) => (
    <tr className="hover:bg-zinc-50/50 transition-colors" {...props} />
  ),
  stepbox: ({ node, ...props }: any) => (
    <div className="bg-white border border-zinc-200/80 shadow-2xs rounded-2xl p-4 my-3 font-sans text-zinc-800" {...props} />
  ),
  blockquote: ({ node, ...props }: any) => (
    <div className="border-l-4 border-amber-400 bg-amber-50/60 rounded-r-2xl p-3.5 my-3 text-xs sm:text-[13px] text-zinc-800 font-medium shadow-2xs" {...props} />
  ),
  hr: ({ node, ...props }: any) => (
    <hr className="my-4 border-zinc-200/80" {...props} />
  ),
};

/**
 * Robust, universal healer for superscripts, subscripts, and math expressions
 * for ANY feature using GlobalMarkdown across the entire app.
 * Heals:
 * 1. Unwrapped LaTeX equations and lines (e.g. V = 2\pi \int x f(x) dx) -> $$...$$
 * 2. Parenthesized expressions with LaTeX (e.g. (2\pi x h(x))) -> ($2\pi x h(x)$)
 * 3. Standalone LaTeX commands and operators (\frac, \sqrt, \sin, \cos, \theta, \pi, \int, \cdot)
 * 4. Superscripts (x^2, 10^5, e^{-x^2}, 30^\circ), subscripts (v_0, x_1)
 * 5. Chemical formulas (H2O, CO2, H2SO4)
 * 6. Preserves code blocks and valid math blocks 100% without corrupting $$ delimiters!
 */
export function healGlobalMarkdown(content: string): string {
  if (!content) return '';
  let text = cleanMarkdownMath(String(content));

  // 1. Protect Code Blocks (```...```) and Inline Code (`...`)
  const codePlaceholders: string[] = [];
  text = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    const token = `___CODE_BLOCK_${codePlaceholders.length}___`;
    codePlaceholders.push(match);
    return token;
  });

  // 2. Protect existing block math ($$...$$) and inline math ($...$)
  const mathPlaceholders: string[] = [];
  text = text.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(match);
    return token;
  });
  text = text.replace(/\$[^$\n]+\$/g, (match) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(match);
    return token;
  });

  // 2.5. Explicit formula prefixes with greedy capture until pipe, semicolon, or newline:
  // e.g. "Formula/Concept: v = u + at, \quad a = -g \approx -9.8 \text{ m/s}^2 |"
  text = text.replace(/((?:Formula(?:\/Concept)?|Equation|Identity|Reaction):\s*)([^|\n]+)(\s*\||\s*$)/gi, (match, prefix, formula, suffix) => {
    if (/\\[a-zA-Z]+|[=+\-*/^_]/.test(formula)) {
      let trimmed = formula.trim().replace(/^\$+|\$+$/g, '').trim();
      const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
      mathPlaceholders.push(`$${trimmed}$`);
      return `${prefix}${token}${suffix}`;
    }
    return match;
  });

  // 3. Line-level check: Is the entire line an unwrapped mathematical formula or equation?
  // E.g.: "V = 2\pi \int_{a}^{b} x f(x) dx, \quad A(w) = w \cdot h(w)"
  text = text.split('\n').map(line => {
    const l = line.trim();
    if (!l || l.includes('___CODE_BLOCK_') || l.includes('___MATH_BLOCK_')) return line;
    
    const hasLatex = /\\(?:frac|sqrt|int|sum|prod|lim|alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|cdot|times|quad|qquad|left|right|text|sin|cos|tan|partial|nabla|infty|approx|pm|neq|leq|geq)\b/.test(l);
    if (!hasLatex) return line;

    // Check english narrative words (words > 3 letters that are not LaTeX operator names)
    const stripped = l.replace(/\\[a-zA-Z]+(?:\{[^{}]*\}|\[[^\]]*\])*/g, '');
    const words = stripped.match(/[a-zA-Z]{3,}/g) || [];
    const narrativeWords = words.filter(w => !['sin','cos','tan','sec','csc','cot','log','ln','lim','exp','min','max','dx','dy','dt','left','right'].includes(w.toLowerCase()));

    // If it has LaTeX and <= 2 narrative words, and has math characters
    if (narrativeWords.length <= 2 && /[=+\-*/^_{}\\]/.test(l)) {
      const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
      mathPlaceholders.push(`$$${l}$$`);
      return token;
    }
    return line;
  }).join('\n');

  // 4. Standalone complex LaTeX expressions with 1-level nested braces:
  // \frac{...}{...}, \sqrt{...}, \boxed{...}
  text = text.replace(/(\\frac\{(?:[^{}]|\{[^{}]*\})*\}\{(?:[^{}]|\{[^{}]*\})*\}|\\sqrt(?:\[[^\]]*\])?\{(?:[^{}]|\{[^{}]*\})*\}|\\boxed\{(?:[^{}]|\{[^{}]*\})*\})/g, (match) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${match}$`);
    return token;
  });

  // 4b. Standalone LaTeX text or font commands with trailing exponents/subscripts: e.g. \text{ m/s}^2, \mathbf{F}
  text = text.replace(/(\\(?:text|mathbf|mathrm|mathit|vec|hat|bar|tilde)\{(?:[^{}]|\{[^{}]*\})*\}(?:\^\{[^{}]*\}|\^[0-9a-zA-Z]+|_\{[^{}]*\}|_[0-9a-zA-Z]+)?)/g, (match) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${match}$`);
    return token;
  });

  // 5. Standalone LaTeX integrals/sums/limits with sub/superscripts e.g. \int_{a}^{b}, \int_0^\infty, \sum_{i=1}^n
  text = text.replace(/(\\(?:int|oint|sum|prod|lim|bigcup|bigcap)(?:_\{(?:[^{}]|\{[^{}]*\})*\}|_\S+)?(?:\^\{(?:[^{}]|\{[^{}]*\})*\}|\^\S+)?)/g, (match) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${match}$`);
    return token;
  });

  // 6. Math functions with arguments e.g. \sin(\theta), \cos(2x), \ln(x), \tan^2(\theta)
  text = text.replace(/(\\(?:sin|cos|tan|sec|csc|cot|log|ln|exp)(?:\^[0-9a-zA-Z]+)?\s*(?:\([^\)\n]*\)|\{[^{}\n]*\}))/g, (match) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${match}$`);
    return token;
  });

  // 7. Parenthesized expressions containing LaTeX commands: e.g. (2\pi x h(x))
  text = text.replace(/\(([^\(\)\n]*\\[a-zA-Z]+[^\(\)\n]*(?:\([^\(\)\n]*\)[^\(\)\n]*)*)\)/g, (_match, inner) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${inner.trim()}$`);
    return `(${token})`;
  });

  // 8. Standalone LaTeX mathematical symbols: \pi, \theta, \alpha, \beta, \cdot, \times, \circ, etc.
  const LATEX_SYMBOLS = '\\\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|propto|sim|infty|partial|nabla|to|rightarrow|Rightarrow|leftarrow|Leftarrow|leftrightarrow|sin|cos|tan|sec|csc|cot|log|ln|quad|qquad|hbar|circ|degree|prime)';
  text = text.replace(new RegExp(`(${LATEX_SYMBOLS}\\b)`, 'g'), (match) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${match}$`);
    return token;
  });

  // 9. Standard Superscripts outside math (e.g. 4x^2, e^{-x^2}, 10^5, x^n, 30^\circ)
  text = text.replace(/(?<![\w$\\])([a-zA-Z0-9)\]]+)\^(\{[^{}]+\}|-?[0-9]+|\\[a-zA-Z]+|[a-zA-Z](?![a-zA-Z]))/g, (_match, base, exp) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${base}^${exp}$`);
    return token;
  });

  // 10. Standard Subscripts outside math (e.g. v_0, x_1, k_B)
  text = text.replace(/\b([a-zA-Z][a-zA-Z]?)_([0-9a-zA-Z]+|\{[^{}]+\})\b/g, (_match, base, sub) => {
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$${base}_${sub}$`);
    return token;
  });

  // 11. Chemical formulas outside math: e.g. H2O, CO2, H2SO4, Ca(OH)2, O2, N2
  text = text.replace(/\b([A-Z][a-z]?(?:\d+|[A-Z][a-z]*\d*)*(?:\([A-Z][a-z]*\)\d*)?)\b/g, (match) => {
    if (match.startsWith('___MATH_') || match.startsWith('___CODE_')) return match;
    if (!/\d/.test(match)) return match; // Must contain at least one subscript number to be a formula like CO2, H2O, O2
    const formatted = match.replace(/([A-Z][a-z]?)(\d+)/g, '$1_$2').replace(/\)(\d+)/g, ')_$1');
    const token = `___MATH_BLOCK_${mathPlaceholders.length}___`;
    mathPlaceholders.push(`$\\mathrm{${formatted}}$`);
    return token;
  });

  // 12. Smart Step-by-Step & Full-Stop Spacing Engine
  // A. Protect common abbreviations with periods so they are never accidentally split
  const abbrList: [RegExp, string][] = [
    [/(\be\.g\.)/gi, '___ABBR_EG___'],
    [/(\bi\.e\.)/gi, '___ABBR_IE___'],
    [/(\bvs\.)/gi, '___ABBR_VS___'],
    [/(\betc\.)/gi, '___ABBR_ETC___'],
    [/(\bDr\.)/gi, '___ABBR_DR___'],
    [/(\bProf\.)/gi, '___ABBR_PROF___'],
    [/(\bFig\.)/gi, '___ABBR_FIG___'],
    [/(\bEq\.)/gi, '___ABBR_EQ___'],
    [/(\bNo\.)/gi, '___ABBR_NO___'],
    [/(\bal\.)/gi, '___ABBR_AL___'],
    [/(\bapprox\.)/gi, '___ABBR_APPROX___'],
  ];
  const restoredAbbrs: string[] = [];
  abbrList.forEach(([regex]) => {
    text = text.replace(regex, (m) => {
      const token = `___ABBR_${restoredAbbrs.length}___`;
      restoredAbbrs.push(m);
      return token;
    });
  });

  // B. Line break after full stops, exclamation marks, question marks
  // Matches dot/exclamation/question mark (not a decimal point) followed by space and start of next sentence or formula
  text = text.replace(/(?<!\d)([.?!])\s+(?=[A-Z\u0900-\u097F$#*—\(\["'___MATH_BLOCK_]|(?:Setting|Now|The\s+(?:first|second|third)|Since|Therefore|Hence|Thus|Substituting)\b)/g, '$1\n\n');

  // C. Colons followed strictly by a block math equation or calculation line
  text = text.replace(/(?<=:)\s+(?=(?:___MATH_BLOCK_|\$\$|[a-zA-Z0-9_^{}().\-]+\s*=))/g, '\n\n');

  // D. Calculation Transition Phrases (ensure they start on their own line with generous spacing)
  const transitions = [
    /(?<=[^.\n])\s+(Setting\s+[^.\n]+?\s+gives)/g,
    /(?<=[^.\n])\s+(Now,?\s+check)/g,
    /(?<=[^.\n])\s+(The\s+(?:first|second|third)\s+derivative\s+is)/g,
    /(?<=[^.\n])\s+(Since\s+the\s+[^.\n]+)/g,
    /(?<=[^.\n])\s+(Therefore,?\s+)/g,
    /(?<=[^.\n])\s+(Hence,?\s+)/g,
    /(?<=[^.\n])\s+(Thus,?\s+)/g,
    /(?<=[^.\n])\s+(Substituting\s+[^.\n]+?\s+into)/g
  ];
  transitions.forEach(tr => {
    text = text.replace(tr, '\n\n$1');
  });

  // E. Restore abbreviations
  for (let i = 0; i < restoredAbbrs.length; i++) {
    text = text.replace(`___ABBR_${i}___`, () => restoredAbbrs[i]);
  }

  // 13. Restore all Math Blocks using function replacers to 100% preserve literal $$
  for (let i = 0; i < mathPlaceholders.length; i++) {
    const val = mathPlaceholders[i];
    text = text.replace(`___MATH_BLOCK_${i}___`, () => val);
  }

  // 14. Restore all Code Blocks
  for (let i = 0; i < codePlaceholders.length; i++) {
    const val = codePlaceholders[i];
    text = text.replace(`___CODE_BLOCK_${i}___`, () => val);
  }

  // 15. Promote standalone derivation and calculation lines to centered block math ($$...$$)
  text = text.split('\n\n').map(block => {
    const b = block.trim();
    const match = b.match(/^\$([^$]+)\$(\.?)$/);
    if (match) {
      const inner = match[1].trim();
      if (/[=+\-*/]/.test(inner) && inner.length > 5) {
        return `$$${inner}$$`;
      }
    }
    return block;
  }).join('\n\n');

  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

function GlobalMarkdown({ children, className = '', components = {} }: GlobalMarkdownProps) {
  if (!children) return null;

  const processedContent = useMemo(() => {
    return healGlobalMarkdown(children);
  }, [children]);

  const mergedComponents = useMemo(() => {
    if (!components || Object.keys(components).length === 0) {
      return defaultComponents;
    }
    return { ...defaultComponents, ...components };
  }, [components]);

  return (
    <div className={`markdown-body ${className}`}>
      <Markdown
        remarkPlugins={remarkPluginsList}
        rehypePlugins={rehypePluginsList}
        components={mergedComponents}
      >
        {processedContent}
      </Markdown>
    </div>
  );
}

export default memo(GlobalMarkdown);
