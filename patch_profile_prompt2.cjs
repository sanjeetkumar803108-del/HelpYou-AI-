const fs = require('fs');

let content = fs.readFileSync('src/utils/profile.ts', 'utf8');
content = content.replace(/HTML\/Markdown tables/g, 'HTML tables (with inline styles)');
fs.writeFileSync('src/utils/profile.ts', content, 'utf8');
