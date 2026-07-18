const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

// Fix the dangling `)}` at the end
content = content.replace(/<\/div>\s*\)\}\s*<\/div>\s*\);\s*\}/, `      </div>\n    </div>\n  );\n}`);

// Now replace the main return
const mainReturnRegex = /return \(\s*<div className="p-6 h-full flex flex-col relative text-gray-100 bg-\[#121212\]">/;
content = content.replace(mainReturnRegex, `return (
    <div className="p-6 h-full flex flex-col relative text-gray-100 bg-[#121212]">
      {selectedItem ? (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col h-full absolute inset-0 z-10 bg-[#121212] p-6"
        >
          <button 
            onClick={() => setSelectedItem(null)}
            className="mb-6 w-10 h-10 bg-white/5 backdrop-blur-md rounded-full flex items-center justify-center text-gray-400 hover:text-white shadow-sm border border-white/10 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex-1 overflow-y-auto pb-20">
            <h2 className="text-2xl font-bold mb-6 text-white">{selectedItem.title || 'Saved Item'}</h2>
            <div className="prose prose-sm prose-invert max-w-none text-gray-200 leading-relaxed whitespace-pre-wrap break-words [&_pre]:overflow-x-auto">
              <Markdown>{selectedItem.text}</Markdown>
            </div>
          </div>
          
          <div className="absolute bottom-6 left-6 right-6">
            <button 
              onClick={() => playTTS(selectedItem.id, selectedItem.text, selectedItem.audioData)}
              className={\`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-md \${
                !isVip 
                   ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                   : playingIndex === selectedItem.id 
                     ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 relative overflow-hidden' 
                     : 'bg-green-600/80 text-white active:scale-[0.98] border border-green-500/50 hover:bg-green-600'
              }\`}
            >
              {playingIndex === selectedItem.id && (
                <div 
                   className="absolute top-0 left-0 h-full bg-red-500/20 transition-all duration-100 ease-linear pointer-events-none" 
                   style={{ width: \`\${progress}%\` }}
                />
              )}
              <span className="relative flex items-center gap-2">
              {!isVip ? (
                <><Lock className="w-5 h-5" /> VIP Required</>
              ) : loadingAudio === selectedItem.id ? (
                <span className="animate-pulse">Loading Voice...</span>
              ) : playingIndex === selectedItem.id ? (
                <><Pause className="w-6 h-6 fill-current" /> Stop Listening</>
              ) : (
                <><Play className="w-6 h-6 fill-current" /> Play as Story</>
              )}
              </span>
            </button>
          </div>
        </motion.div>
      ) : (`);

// And we need to close it at the very end
const endRegex = /<\/div>\s*<\/div>\s*\);\s*\}/;
content = content.replace(endRegex, `</div>\n      )}\n    </div>\n  );\n}`);

fs.writeFileSync('src/components/PocketTeacher.tsx', content);
