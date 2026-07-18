const fs = require('fs');

let content = fs.readFileSync('src/components/MagicScanner.tsx', 'utf8');

const oldClasses = `              <div className={\`max-w-[85%] rounded-3xl p-4 \${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white shadow-md rounded-tr-none' 
                  : 'bg-purple-600 text-white shadow-md rounded-tl-none'
              }\`}>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Scanned problem" className="max-w-full h-auto rounded-xl mb-2 shadow-sm border border-white/10" />
                )}
                {msg.text && (
                  <div className={\`prose prose-sm max-w-none \${msg.role === 'user' ? 'text-white prose-invert' : 'text-white prose-invert'}\`}>
                    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.text}</Markdown>
                  </div>
                )}`;

const newClasses = `              <div className={\`max-w-[92%] rounded-3xl p-5 \${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white shadow-md rounded-tr-none' 
                  : 'bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-lg rounded-tl-none overflow-hidden'
              }\`}>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Scanned problem" className="max-w-full h-auto rounded-xl mb-3 shadow-sm border border-white/10" />
                )}
                {msg.text && (
                  <div className={\`prose prose-sm max-w-none break-words \${msg.role === 'user' ? 'text-white prose-invert' : 'text-white prose-invert'} [&_pre]:overflow-x-auto [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2 [&_p]:leading-relaxed\`}>
                    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.text}</Markdown>
                  </div>
                )}`;

content = content.replace(oldClasses, newClasses);

fs.writeFileSync('src/components/MagicScanner.tsx', content);
