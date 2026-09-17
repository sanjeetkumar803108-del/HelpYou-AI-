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
  text = fixedLines.join('\n');

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

  return text;
}

/**
 * Dedicated math, LaTeX, subscript, and superscript healer for AI Quizzes:
 * Transforms Questions, Options (e.g. "A) 3x^2 * e^x + x^3 * e^x"), and Explanations
 * into valid, clean KaTeX inline math while preserving original option value matching.
 */
export function formatQuizMath(content: string): string {
  if (!content) return '';
  let text = cleanMarkdownMath(String(content)).trim();
  if (text.includes('```')) return text;

  // 1. Check if the string is a quiz option (e.g. "A) 3x^2 * e^x", "B) 3x^2 * e^x + x^3 * e^x", "C) x = 5")
  const optionPrefixMatch = text.match(/^([A-Da-d][\)\.]|\([A-Da-d]\))\s*/);
  let prefix = '';
  let body = text;
  if (optionPrefixMatch) {
    prefix = optionPrefixMatch[0];
    body = text.slice(prefix.length).trim();
  }

  const isPureMathOption = (str: string) => {
    if (!str) return false;
    if (str.includes('$')) return false;
    const words = str.toLowerCase().match(/[a-z]+/g) || [];
    const hasEnglishWords = words.some(w => ENGLISH_STOPWORDS.has(w) && w.length > 1);
    if (hasEnglishWords) return false;

    // Has exponent caret or subscript underscore
    if (/[\^_]/.test(str)) return true;
    // Has LaTeX command
    if (/\\(frac|sqrt|cdot|times|pm|le|ge|ne|int|sum|pi|theta|alpha|beta)\b/.test(str)) return true;
    // Has algebraic equation or expression
    if (/^[0-9a-zA-Z\s+\-*/=()\[\],.√±≤≥≠]+$/.test(str) && /[=+\-*/]/.test(str) && /[a-zA-Z0-9]/.test(str)) {
      return true;
    }
    return false;
  };

  if (isPureMathOption(body)) {
    let mathBody = body;
    // Convert * to \cdot for math multiplication
    mathBody = mathBody.replace(/(?<=[a-zA-Z0-9)\]^_])\s*\*\s*(?=[a-zA-Z0-9(\[^\\])/g, ' \\cdot ');
    mathBody = mathBody.replace(/\^\(([^)]+)\)/g, '^{$1}');
    return `${prefix}$${mathBody}$`;
  }

  // 2. Mixed sentences (questions, explanations, descriptive options)
  // Convert * to \cdot between math operands outside $
  text = replaceOutsideMath(text, /(?<=[a-zA-Z0-9)\]^_])\s*\*\s*(?=[a-zA-Z0-9(\[^\\])/g, ' \\cdot ');

  // Auto-wrap full LaTeX expressions with arguments (\frac{...}{...}, \sqrt{...}, \boxed{...})
  text = replaceOutsideMath(text, /(\\frac\{[^{}]*\}\{[^{}]*\}|\\sqrt(?:\[[^\]]*\])?\{[^{}]*\}|\\boxed\{[^{}]*\})/g, '$$$1$$');

  // Convert chemical formulas outside math
  text = replaceOutsideMath(text, /\b([A-Z][a-z]?\d+(?:[A-Z][a-z]?\d*)*(?:\([A-Z][a-z]?\d*\)\d+)?)\b/g, (match) => {
    const formatted = match.replace(/([A-Z][a-z]?)(\d+)/g, '$1_$2').replace(/\)(\d+)/g, ')_$1');
    return `$\\text{${formatted}}$`;
  });

  // Convert derivative notation: d/dx[...] = ...
  text = replaceOutsideMath(text, /\b(d\/dx\[[^\]]+\]\s*=\s*[^,.;!?\n]+)/g, '$$$1$$');

  // MATCH COMPLETE EQUATIONS AND MATHEMATICAL FORMULAS
  // Match equations starting with f(x) =, y =, dy/dx =, etc.
  text = replaceOutsideMath(text, /\b(?:[a-zA-Z](?:\([a-zA-Z0-9]+\))?|dy\/dx|[a-zA-Z]'\([a-zA-Z0-9]+\))\s*=\s*[^.,;?!]+/g, (match) => {
    let trimmed = match.trim();
    // If it contains english stop words, split or truncate before stopword
    const words = trimmed.replace(/\b[a-zA-Z]\b/g, '').toLowerCase().match(/[a-z]{2,}/g) || [];
    const validMathWords = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'exp', 'lim', 'dx', 'dy', 'dt']);
    const stopwordIdx = words.findIndex(w => !validMathWords.has(w) && ENGLISH_STOPWORDS.has(w));
    if (stopwordIdx !== -1) {
      const stopword = words[stopwordIdx];
      const idx = trimmed.toLowerCase().indexOf(' ' + stopword);
      if (idx !== -1) {
        const mathPart = trimmed.slice(0, idx).trim();
        const rest = trimmed.slice(idx);
        return `$${mathPart}$${rest}`;
      }
    }
    if (/[=+\-·*/\^_]/.test(trimmed)) {
      return `$${trimmed}$`;
    }
    return match;
  });

  // Match rational expressions with parentheses and powers or operations: e.g. "(x^2 + 1) / x"
  text = replaceOutsideMath(text, /\((?:[a-zA-Z0-9\s+\-·*^_{}]+)\)\s*[\/+\-·*]\s*(?:\([a-zA-Z0-9\s+\-·*^_{}]+\)|[a-zA-Z0-9^_{}]+)/g, (match) => {
    return `$${match.trim()}$`;
  });

  // Carets and superscripts: e.g. x^3, e^x, 10^-5, e^(2x), 3x^2
  text = replaceOutsideMath(text, /([a-zA-Z0-9)\]]+)\^(\([^{}]+\)|\{[^{}]+\}|-?[0-9]+|[a-zA-Z](?![a-zA-Z]))/g, (match, base, exp) => {
    const cleanExp = exp.startsWith('(') && exp.endsWith(')') ? `{${exp.slice(1, -1)}}` : exp;
    return `$${base}^${cleanExp}$`;
  });

  // Subscripts: e.g. x_1, a_n
  text = replaceOutsideMath(text, /([a-zA-Z0-9)\]]+)_(\{[^{}]+\}|[0-9]+|[a-zA-Z](?![a-zA-Z]))/g, '$$$1_$2$$');

  // Standalone LaTeX symbols
  text = replaceOutsideMath(text, /(\\(?:alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|Delta|Omega|pm|times|div|leq|geq|neq|approx|infty|cdot|to|rightarrow|partial|int|sum|prod|lim|sin|cos|tan|log|ln)\b)/g, '$$$1$$');

  // Convert powers with parentheses inside math: e.g. $e^(2x)$ -> $e^{2x}$
  text = text.replace(/(\$[^$]*\^)\(([^)]+)\)([^$]*\$)/g, '$1{$2}$3');

  // Clean up any double dollars and merge adjacent math tags
  text = text.replace(/\$\$/g, '$');
  text = text.replace(/\$\s*\$/g, ' ');
  text = text.replace(/\$\$/g, '');
  text = text.replace(/\$\s+\$/g, ' ');

  return text;
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
