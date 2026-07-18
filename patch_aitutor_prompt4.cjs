const fs = require('fs');

let content = fs.readFileSync('src/components/AITutor.tsx', 'utf8');

const regex = /2\. CLEAN MATHEMATICS & SCIENCE FORMATTING[\s\S]*?for simple chemistry sequences\./;

const replacement = `2. CRITICAL MATH FORMATTING: Your frontend renderer does NOT support LaTeX or MathJax. NEVER use $ signs, \\\\text{}, or raw latex commands like \\\\Delta for inline math. Use pure Unicode characters instead (e.g., use 'Δ' instead of '\\\\Delta', and write 'm/s' without any formatting wrappers).`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/AITutor.tsx', content, 'utf8');
