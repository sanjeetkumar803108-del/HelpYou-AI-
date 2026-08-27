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

const remarkPluginsList = [remarkMath, remarkGfm];
const rehypePluginsList: any[] = [rehypeRaw, [rehypeKatex, { strict: false, throwOnError: false }]];

const defaultComponents = {
  table: ({ node, ...props }: any) => (
    <div className="overflow-x-auto my-6 rounded-lg border border-zinc-200 shadow-sm">
      <table className="w-full text-left border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }: any) => (
    <thead className="bg-zinc-50/80 border-b border-zinc-200" {...props} />
  ),
  th: ({ node, ...props }: any) => (
    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 whitespace-nowrap" {...props} />
  ),
  td: ({ node, ...props }: any) => (
    <td className="px-4 py-3 border-b border-zinc-100 text-zinc-600" {...props} />
  ),
  tr: ({ node, ...props }: any) => (
    <tr className="hover:bg-zinc-50/50 transition-colors" {...props} />
  ),
  stepbox: ({ node, ...props }: any) => (
    <div className="bg-white border border-zinc-200/80 shadow-sm rounded-2xl p-4 my-4 font-sans text-zinc-800" {...props} />
  ),
};

function GlobalMarkdown({ children, className = '', components = {} }: GlobalMarkdownProps) {
  if (!children) return null;

  const processedContent = useMemo(() => {
    return cleanMarkdownMath(children);
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
