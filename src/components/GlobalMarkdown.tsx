import React from 'react';
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

export default function GlobalMarkdown({ children, className = '', components = {} }: GlobalMarkdownProps) {
  if (!children) return null;

  return (
    <div className={`markdown-body ${className}`}>
      <Markdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false }]]}
        components={{
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-6 rounded-lg border border-zinc-200 shadow-sm">
              <table className="w-full text-left border-collapse text-sm" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-zinc-50/80 border-b border-zinc-200" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 whitespace-nowrap" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 border-b border-zinc-100 text-zinc-600" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-zinc-50/50 transition-colors" {...props} />
          ),
          // Support for legacy <stepbox> from the text parser
          stepbox: ({ node, ...props }) => (
            <div className="bg-white border border-zinc-200/80 shadow-sm rounded-2xl p-4 my-4 font-sans text-zinc-800" {...props} />
          ),
          ...components,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
