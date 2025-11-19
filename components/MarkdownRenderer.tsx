import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-snug">
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" {...props} />,
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
          li: ({ node, ...props }) => <li className="marker:text-slate-500" {...props} />,
          code: ({ node, ...props }) => {
             // @ts-ignore
             const isInline = props.inline || !String(props.children).includes('\n');
             return isInline 
               ? <code className="bg-slate-800 text-yellow-500 px-1 py-0.5 rounded text-xs font-mono" {...props} />
               : <code className="block bg-slate-950 p-2 rounded-md text-xs font-mono text-slate-300 overflow-x-auto my-2 border border-slate-800" {...props} />
          },
          strong: ({ node, ...props }) => <strong className="text-slate-100 font-semibold" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;