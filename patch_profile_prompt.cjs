const fs = require('fs');

let content = fs.readFileSync('src/utils/profile.ts', 'utf8');

const regex = /bulleted lists, step-by-step formats,/;
const replacement = `HTML/Markdown tables, bulleted lists, step-by-step formats,`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/utils/profile.ts', content, 'utf8');
