const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

content = content.replace(
  `                <div className="prose prose-sm prose-invert max-w-none text-gray-200 leading-relaxed whitespace-pre-wrap">`,
  `                <div className="prose prose-sm prose-invert max-w-none text-gray-200 leading-relaxed whitespace-pre-wrap break-words [&_pre]:overflow-x-auto [&_table]:overflow-x-auto [&_img]:max-w-full">`
);

fs.writeFileSync('src/components/NoteMaker.tsx', content);
