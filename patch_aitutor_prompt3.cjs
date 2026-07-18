const fs = require('fs');

let content = fs.readFileSync('src/components/AITutor.tsx', 'utf8');

const regex = /2\. MATH & SCIENCE FORMATTING \(LATEX\)[\s\S]*?Use standard text and unicode arrows \(-> or ➡️\)\./;

const replacement = `2. CLEAN MATHEMATICS & SCIENCE FORMATTING: Use LaTeX ONLY for complex, multi-line mathematical equations.
   - Avoid raw LaTeX wrappers like \\text{} or \\rightarrow for standard text or arrows. Use standard text and unicode arrows (➡️) for simple chemistry sequences.`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/AITutor.tsx', content, 'utf8');
