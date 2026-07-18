const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const lines = content.split('\n');
for (let i=0; i<lines.length; i++) {
  if (lines[i].includes('Ensure you return the quiz in a clean Markdown format.')) {
    // delete this line and previous/next lines that are broken
  }
}
