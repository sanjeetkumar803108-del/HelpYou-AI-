const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const checkLimitStr = `
    if (text && text.length > 1600) {
      return res.status(400).json({ error: "Text exceeds 1600 characters limit." });
    }
`;

content = content.replace(/(app\.post\("\/api\/grade-essay", async \(req, res\) => \{\n\s*try \{\n\s*const \{ text \} = req\.body;)/, "$1" + checkLimitStr);
content = content.replace(/(app\.post\("\/api\/generate-flashcards", async \(req, res\) => \{\n\s*try \{\n\s*const \{ text \} = req\.body;)/, "$1" + checkLimitStr);
content = content.replace(/(app\.post\("\/api\/grammar-enhance", async \(req, res\) => \{\n\s*try \{\n\s*const \{ text \} = req\.body;)/, "$1" + checkLimitStr);

// for generate-content, the body is { topic, type }
const checkTopicLimitStr = `
    if (topic && topic.length > 1600) {
      return res.status(400).json({ error: "Topic exceeds 1600 characters limit." });
    }
`;
content = content.replace(/(app\.post\("\/api\/generate-content", async \(req, res\) => \{\n\s*try \{\n\s*const \{ topic, type \} = req\.body;)/, "$1" + checkTopicLimitStr);

fs.writeFileSync('server.ts', content);
