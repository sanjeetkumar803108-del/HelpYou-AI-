const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const oldPrompt = `promptText = "Create a 5-question multiple choice quiz based on the provided document. Include 4 options (A, B, C, D) for each question. At the very end, provide an Answer Key.";`;
const newPrompt = `promptText = "You are an expert tutor. Create a 5-question multiple choice quiz based on the provided document. \n\nEnsure you return the quiz in a clean Markdown format. Include 4 options (A, B, C, D) for each question. At the very end, provide a clear Answer Key. Do not use conversational filler, just generate the quiz.";`;

content = content.replace(oldPrompt, newPrompt);
fs.writeFileSync('server.ts', content);
