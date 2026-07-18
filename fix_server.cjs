const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/    \} else if \(action === 'quiz'\) \{[\s\S]*?const textPart = \{ text: promptText \};/m, `    } else if (action === 'quiz') {
      promptText = "You are an expert tutor. Create a 5-question multiple choice quiz based on the provided document. Include 4 options (A, B, C, D) for each question. At the very end, provide a clear Answer Key. Format strictly using Markdown.";
    } else {
      promptText = "You are an expert tutor. Please extract and summarize the most important notes from this document in a well-structured, easy to read format using Markdown. Include clear headings and bullet points.";
    }

    const textPart = { text: promptText };`);
fs.writeFileSync('server.ts', content);
