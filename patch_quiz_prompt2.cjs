const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const regex = /promptText = "You are an expert tutor\. Create a 5-question multiple choice quiz based on the provided document\. \n\nEnsure you return the quiz in a clean Markdown format\. Include 4 options \(A, B, C, D\) for each question\. At the very end, provide a clear Answer Key\. Do not use conversational filler, just generate the quiz\.";/;
// Actually, let's just find the exact line and replace it.
const lines = content.split('\n');
for (let i=0; i<lines.length; i++) {
  if (lines[i].includes('Create a 5-question multiple choice quiz')) {
    lines[i] = '      promptText = "You are an expert tutor. Create a 5-question multiple choice quiz based on the provided document. \\n\\nEnsure you return the quiz in a clean Markdown format. Include 4 options (A, B, C, D) for each question. At the very end, provide a clear Answer Key. Do not use conversational filler, just generate the quiz.";';
  }
}
fs.writeFileSync('server.ts', lines.join('\n'));
