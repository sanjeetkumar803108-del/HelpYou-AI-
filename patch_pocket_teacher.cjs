const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

// We need to add a state for selectedItem
const stateRegex = /const \[downloadedAudios, setDownloadedAudios\] = useState<Record<string, string>>\(\{\}\);/;
content = content.replace(stateRegex, "const [downloadedAudios, setDownloadedAudios] = useState<Record<string, string>>({});\n  const [selectedItem, setSelectedItem] = useState<any | null>(null);");

// Now we need to modify the UI to either show the list or the selected item
const returnRegex = /return \(\s*<div className="p-6 h-full flex flex-col text-gray-100 bg-\[#121212\] overflow-y-auto">/;
content = content.replace(returnRegex, `return (
    <div className="p-6 h-full flex flex-col text-gray-100 bg-[#121212] overflow-y-auto">
      {selectedItem ? (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col h-full"
        >
          <button 
            onClick={() => setSelectedItem(null)}
            className="mb-6 w-10 h-10 bg-white/5 backdrop-blur-md rounded-full flex items-center justify-center text-gray-400 hover:text-white shadow-sm border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex-1 overflow-y-auto pb-6">
            <h2 className="text-2xl font-bold mb-6 text-white">{selectedItem.title || 'Saved Item'}</h2>
            <div className="prose prose-sm prose-invert max-w-none text-gray-200 leading-relaxed whitespace-pre-wrap break-words [&_pre]:overflow-x-auto">
              <Markdown>{selectedItem.text}</Markdown>
            </div>
          </div>
          
          <div className="pt-4 border-t border-white/10 mt-auto">
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

// And we need to add the ArrowLeft import if missing, but we assume it's missing so let's import it if not
if (!content.includes('ArrowLeft')) {
  content = content.replace(/import \{ Headphones, Play, Pause, Download, Lock, Volume2, Search, Book \} from 'lucide-react';/, "import { ArrowLeft, Headphones, Play, Pause, Download, Lock, Volume2, Search, Book } from 'lucide-react';");
}

// We need to add an onClick to the item cards to open them
const itemCardRegex = /<motion\.div\s*key=\{item\.id\}\s*initial=\{\{ opacity: 0, y: 20 \}\}\s*animate=\{\{ opacity: 1, y: 0 \}\}\s*className="bg-white\/5 backdrop-blur-md rounded-3xl p-5 border border-white\/10 relative overflow-hidden shadow-sm"/;
content = content.replace(itemCardRegex, `<motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedItem(item)}
            className="bg-white/5 backdrop-blur-md rounded-3xl p-5 border border-white/10 relative overflow-hidden shadow-sm cursor-pointer hover:bg-white/10 transition-colors"`);

// We need to remove the play button from the list view since it's now in the detailed view
const playButtonRegex = /<button\s*onClick=\{\(\) => playTTS\(item\.id, item\.text, item\.audioData\)\}\s*className=\{`w-full py-3[\s\S]*?<\/button>/;
content = content.replace(playButtonRegex, '');

// Don't forget to close the selectedItem ternary at the very end
const finalDivRegex = /<\/div>\s*<\/div>\s*\);\s*\}/;
content = content.replace(finalDivRegex, `</div>\n      )}\n    </div>\n  );\n}`);

fs.writeFileSync('src/components/PocketTeacher.tsx', content);
