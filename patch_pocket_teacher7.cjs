const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

const regex = /<Smartphone className="w-5 h-5 text-purple-700 shrink-0" strokeWidth=\{2\} \/>/;
const replacement = `{item.type === 'scan_chat' ? <Search className="w-5 h-5 text-blue-600 shrink-0" strokeWidth={2} /> : item.type === 'ai_tutor' ? <Headphones className="w-5 h-5 text-green-600 shrink-0" strokeWidth={2} /> : <Smartphone className="w-5 h-5 text-purple-700 shrink-0" strokeWidth={2} />}`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/PocketTeacher.tsx', content);
