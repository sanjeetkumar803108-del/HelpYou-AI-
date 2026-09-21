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

/**
 * Normalizes and heals math/chemical equations for student-friendly crystal-clear KaTeX rendering:
 * 1. Restores escaped/eaten ASCII control codes (\x0D carriage return -> \r, \x09 tab -> \t, etc.)
 * 2. Repairs broken arrow commands like "ightarrow" -> "\rightarrow"
 * 3. Ensures unmatched $$ block delimiters are cleanly balanced to prevent red error leaks.
 */
export function cleanMarkdownMath(content: string): string {
  if (!content) return '';
  let text = String(content);

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

  // Wrap unquoted LaTeX expressions including function arguments like \sin(30^\circ) and \sqrt{3}\text{ m/s}
  mixed = mixed.replace(/(?<![\w\\])([0-9a-zA-Z_^{}().\-]*\\[a-zA-Z]+(?:\([^)\n]*\)|\[[^\]\n]*\]|\{[^{}\n]*\})*(?:[0-9a-zA-Z_^{}().\-+\-*/=.\s\\]*\\text\{[^{}]*\})?)/g, (match) => {
    const trimmed = match.trim();
    if (trimmed.includes('\\') && !trimmed.startsWith('__MATH_BLOCK_')) {
      return `$${trimmed}$`;
    }
    return match;
  });

  // Auto-wrap isolated superscripts outside math e.g. x^2, 10^5, mc^2
  mixed = mixed.replace(/(?<![\w$\\])([a-zA-Z0-9)\]]+)\^(\{[^{}]+\}|-?[0-9]+|[a-zA-Z](?![a-zA-Z]))/g, '$$$1^$2$$');

  // Auto-wrap isolated subscripts outside math e.g. v_0, v_{0x}, a_1
  mixed = mixed.replace(/(?<![\w$\\])([a-zA-Z0-9)\]]+)_(\{[^{}]+\}|[0-9]+|[a-zA-Z](?![a-zA-Z]))/g, '$$$1_$2$$');

  // Chemical formulas e.g. H2O, CO2, 6CO2, 6H2O outside math
  mixed = mixed.replace(/(?<=\b|\d)([A-Z][a-z]?\d+(?:[A-Z][a-z]?\d*)*(?:\([A-Z][a-z]?\d*\)\d+)?)\b/g, (match) => {
    if (match.startsWith('__MATH_BLOCK_')) return match;
    const formatted = match.replace(/([A-Z][a-z]?)(\d+)/g, '$1_$2').replace(/\)(\d+)/g, ')_$1');
    return `$\\text{${formatted}}$`;
  });

  // Restore protected math blocks
  mixed = mixed.replace(/__MATH_BLOCK_(\d+)__/g, (_, idx) => mathBlocks[parseInt(idx)]);

  // Clean any nested/broken tags created inside
  mixed = mixed.replace(/\\left\(\s*\$([^$]+)\$\s*\\right\)/g, '\\left($1\\right)');
  mixed = mixed.replace(/(\\frac\{)\$([^$]+)\$(\})/g, '$1$2$3');
  mixed = mixed.replace(/(\{\s*)\$([^$]+)\$(\s*\})/g, '$1$2$3');
  mixed = mixed.replace(/(\\sqrt(?:\[[^\]]*\])?\{)\$([^$]+)\$(\})/g, '$1$2$3');
  mixed = mixed.replace(/(\\text\{)\$([^$]+)\$(\})/g, '$1$2$3');

  // Clean adjacent math delimiters
  mixed = mixed.replace(/\$\s*\$/g, ' ');
  mixed = mixed.replace(/\${3,}/g, '$$');

  // Balance single unclosed $ on this line
  const dollars = (mixed.match(/\$/g) || []).length;
  if (dollars % 2 !== 0) {
    mixed += '$';
  }

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
 * 1. Numbers with numbers (10^5, 2^3, 10^-5)
 * 2. Letters with numbers (x^2, y^3, z^4)
 * 3. Letters with letters (e^x, a^b, x^n, e^-x, e^-t)
 * 4. Numbers with letters (2^n, 10^x, 2^k)
 * 5. Parenthesized base with powers ((x+1)^2, (a+b)^n, (3x-1)^4)
 * 6. Parenthesized exponents (e^(2x), 10^(x-1), 2^(n+1), a^(m+n))
 * 7. Negative exponents (x^-1, 10^-5, s^-1)
 * 8. Rational parenthesized expressions ((x^2+1)/x, (x^2-4)/(x+2))
 * 9. Subscripts with numbers and letters (x_1, y_0, v_0, k_B, a_n, x_i)
 * 10. Chemical formulas (H2O, CO2, H2SO4, Ca(OH)2, O2, N2)
 * 11. Protects code blocks (```...```) and inline code (`...`) 100%!
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

  // 2. Heal existing math expressions: convert e^(2x) -> e^{2x}, 10^-5 -> 10^{-5} inside $...$
  text = text.replace(/(\$[^$]*\^)\(([^)]+)\)([^$]*\$)/g, '$1{$2}$3');
  text = text.replace(/(\$[^$]*\^)-([0-9a-zA-Z]+)([^$]*\$)/g, '$1{-$2}$3');

  // 3. Parenthesized Exponents outside math: e.g. e^(2x), 10^(x-1), (x+1)^(n-1), 2^(n+1), a^(m+n)
  text = replaceOutsideMath(text, /((?:\([a-zA-Z0-9+\-·*\\/\s]+\)|\[[a-zA-Z0-9+\-·*\\/\s]+\]|[a-zA-Z0-9]+))\^\(([^)]+)\)/g, (_match, base, exp) => {
    return `$${base}^{${exp}}$`;
  });

  // 4. Negative Exponents outside math: e.g. 10^-5, 10^-3, x^-2, s^-1, e^-x, e^-t
  text = replaceOutsideMath(text, /((?:\([a-zA-Z0-9+\-·*\\/\s]+\)|\[[a-zA-Z0-9+\-·*\\/\s]+\]|[a-zA-Z0-9]+))\^(-[0-9a-zA-Z]+)/g, (_match, base, exp) => {
    return `$${base}^{${exp}}$`;
  });

  // 5. Rational expressions with powers outside math: e.g. (x^2+1)/x, (x^2-4)/(x+2)
  text = replaceOutsideMath(text, /\((?:[a-zA-Z0-9\s+\-·*^_{}]+)\)\s*[\/+\-·*]\s*(?:\([a-zA-Z0-9\s+\-·*^_{}]+\)|[a-zA-Z0-9^_{}]+)/g, (match) => {
    return `$${match.trim()}$`;
  });

  // 6. Standard Superscripts outside math (Numbers, Alphabet letters, Parenthesized base):
  // Examples: x^2, y^3, 10^5, 2^n, 10^x, e^x, a^b, x^n, (x+1)^2, (a+b)^n, (3x-1)^4
  text = replaceOutsideMath(text, /((?:\([a-zA-Z0-9+\-·*\\/\s]+\)|\[[a-zA-Z0-9+\-·*\\/\s]+\]|[a-zA-Z0-9]+))\^(\{?[a-zA-Z0-9]+}?)/g, (_match, base, exp) => {
    return `$${base}^${exp}$`;
  });

  // 7. Standard Subscripts outside math:
  // Single/two-letter variables with number or letter subscript: e.g. x_1, y_0, v_0, k_B, a_n, x_i, t_1
  text = replaceOutsideMath(text, /\b([a-zA-Z][a-zA-Z]?)_([0-9a-zA-Z]+|\{[^{}]+\})\b/g, (_match, base, sub) => {
    return `$${base}_${sub}$`;
  });

  // 8. Chemical formulas outside math: e.g. H2O, CO2, H2SO4, Ca(OH)2, O2, N2
  text = replaceOutsideMath(text, /\b([A-Z][a-z]?\d+(?:[A-Z][a-z]?\d*)*(?:\([A-Z][a-z]?\d*\)\d+)?)\b/g, (match) => {
    const formatted = match.replace(/([A-Z][a-z]?)(\d+)/g, '$1_$2').replace(/\)(\d+)/g, ')_$1');
    return `$\\text{${formatted}}$`;
  });

  // 9. Clean up adjacent / empty math delimiters
  text = text.replace(/\$\$/g, '$');
  text = text.replace(/\$\s*\$/g, ' ');
  text = text.replace(/\$\$/g, '');
  text = text.replace(/\$\s+\$/g, ' ');

  // 10. Restore Code Blocks and Inline Code
  for (let i = 0; i < codePlaceholders.length; i++) {
    text = text.replace(`___CODE_BLOCK_${i}___`, codePlaceholders[i]);
  }

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
