const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

if (!content.includes('Smartphone')) {
  content = content.replace(/import \{ ArrowLeft, Headphones, Play, Pause, Download, Lock, Volume2, Search, Book, Trash2 \} from 'lucide-react';/, "import { ArrowLeft, Headphones, Play, Pause, Download, Lock, Volume2, Search, Book, Trash2, Smartphone } from 'lucide-react';");
}

const listRenderRegex = /items\.map\(\(item\) => \(\s*<motion\.div[\s\S]*?<\/motion\.div>\s*\)\)/;

const newRender = `items.map((item) => (
            <motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedItem(item)}
            className="bg-white rounded-[1.75rem] p-6 border border-zinc-200/80 shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-3 mr-4 overflow-hidden">
                <Smartphone className="w-5 h-5 text-purple-700 shrink-0" strokeWidth={2} />
                <h3 className="font-bold text-zinc-900 text-[17px] tracking-tight leading-tight line-clamp-2">
                  {item.title || 'Saved Item'}
                </h3>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {downloadedAudios[item.id] ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">Offline</span>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDownload(item.id); }}
                    className="w-[42px] h-[42px] flex items-center justify-center text-zinc-700 hover:text-zinc-900 bg-zinc-100/80 hover:bg-zinc-200 rounded-full transition-colors border border-zinc-200/50"
                  >
                    {isVip ? <Download className="w-5 h-5" strokeWidth={1.5} /> : <Lock className="w-5 h-5 text-orange-550" />}
                  </button>
                )}
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setDeleteConfirmId(item.id);
                  }}
                  className="w-[42px] h-[42px] flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                  title="Delete Saved Item"
                >
                  <Trash2 className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
            </motion.div>
          ))`;

content = content.replace(listRenderRegex, newRender);
fs.writeFileSync('src/components/PocketTeacher.tsx', content);
