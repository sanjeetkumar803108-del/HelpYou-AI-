const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

const itemCardRegex = /<motion\.div\s*key=\{item\.id\}\s*initial=\{\{ opacity: 0, y: 10 \}\}\s*animate=\{\{ opacity: 1, y: 0 \}\}\s*className="bg-white\/5 backdrop-blur-md rounded-3xl p-5 border border-white\/10 relative overflow-hidden shadow-sm"/;
content = content.replace(itemCardRegex, `<motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedItem(item)}
            className="bg-white/5 backdrop-blur-md rounded-3xl p-5 border border-white/10 relative overflow-hidden shadow-sm cursor-pointer hover:bg-white/10 transition-colors"`);

fs.writeFileSync('src/components/PocketTeacher.tsx', content);
